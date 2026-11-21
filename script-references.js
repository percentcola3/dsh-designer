import {parse as parseHTML} from 'parse5';
import {parse as parseScript} from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const literal = node => node?.type === 'StringLiteral' ? node.value : null;
const idLookup = node => ['CallExpression', 'OptionalCallExpression'].includes(node?.type)
  && node.callee.type === 'MemberExpression' && !node.callee.computed
  && node.callee.object.type === 'Identifier' && node.callee.object.name === 'document'
  && node.callee.property.name === 'getElementById' && node.arguments.length === 1;

function lookupHelper(binding) {
  if (!binding?.constant || binding.path.scope.getBinding('document')) return false;
  const fn = binding.path.isVariableDeclarator() ? binding.path.node.init : binding.path.node;
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(fn?.type)
    || fn.params.length !== 1 || fn.params[0].type !== 'Identifier') return false;
  const expression = fn.body.type === 'BlockStatement'
    ? fn.body.body.length === 1 && fn.body.body[0].type === 'ReturnStatement' && fn.body.body[0].argument
    : fn.body;
  return idLookup(expression) && expression.arguments[0].type === 'Identifier'
    && expression.arguments[0].name === fn.params[0].name;
}

/** Check exact authored stable identities referenced through literal DOM ID lookups. */
export function scriptTargetDiagnostics(html) {
  const ids = new Set(), stable = new Map(), scripts = [], diagnostics = [], seen = new Set();
  const visit = node => {
    const id = attribute(node, 'id'), nodeId = attribute(node, 'data-dsh-node');
    if (id) ids.add(id);
    if (nodeId) stable.set(nodeId, node);
    const type = attribute(node, 'type') || '';
    if (node.tagName === 'script' && !attribute(node, 'src') && !attribute(node, 'data-dsh-controlled')
      && ['', 'module', 'text/javascript', 'application/javascript'].includes(type)) {
      scripts.push((node.childNodes || []).map(child => child.value || '').join(''));
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parseHTML(html));
  for (const source of scripts) {
    let ast;
    try { ast = parseScript(source, {sourceType: 'unambiguous', allowReturnOutsideFunction: true}); }
    catch { continue; }
    traverse(ast, {CallExpression(path) {
      const node = path.node;
      const direct = idLookup(node) && !path.scope.getBinding('document');
      const helper = node.callee.type === 'Identifier' && lookupHelper(path.scope.getBinding(node.callee.name));
      if (!direct && !helper) return;
      const id = literal(node.arguments[0]);
      if (!id || ids.has(id) || !stable.has(id) || seen.has(id)) return;
      seen.add(id);
      diagnostics.push({
        code: 'SCRIPT_TARGET_ID_MISSING', severity: 'warning', nodeId: id,
        message: `Script looks up HTML id "${id}". The matching data-dsh-node has HTML id "${attribute(stable.get(id), 'id') || ''}". Add the intended HTML id or use an exact data-dsh-node selector.`,
        details: {requestedId: id, htmlId: attribute(stable.get(id), 'id') || null},
      });
    }});
  }
  return diagnostics;
}
