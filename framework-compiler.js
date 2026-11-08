import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse as babelParse, parseExpression } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import { parse as parseSFC, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';
import * as esbuild from 'esbuild-wasm';

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;
const require = createRequire(import.meta.url);
const ATTRIBUTE = 'data-dsh-source';
const extensions = ['', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs', '.vue', '.json', '.css'];
const runtimePackages = new Set(['react', 'react-dom', 'scheduler', 'vue', '@vue/runtime-dom', '@vue/runtime-core', '@vue/reactivity', '@vue/shared']);
const digest = (code) => createHash('sha256').update(code).digest('hex');

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function frameworkName(framework) {
  const name = String(framework || '').toLowerCase();
  if (name !== 'react' && name !== 'vue') fail('UNSUPPORTED_FRAMEWORK', `Unsupported framework: ${framework}`);
  return name;
}

function projectPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    fail('INVALID_PROJECT_PATH', `Expected a relative project path: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.') fail('PROJECT_PATH_ESCAPE', `Path escapes project: ${value}`);
  return normalized.replace(/^\.\//, '');
}

function parserPlugins(filename = '') { return [...(/\.[cm]?ts$/.test(filename) ? [] : ['jsx']), 'typescript', 'decorators-legacy']; }
function parseReact(code, element = false, filename = '') {
  let ast;
  try {
    ast = element ? parseExpression(code, { plugins: parserPlugins(filename) }) : babelParse(code, { sourceType: 'unambiguous', plugins: parserPlugins(filename) });
  } catch (error) { fail('SOURCE_PARSE_ERROR', error.message); }
  if (element && (ast.type !== 'JSXElement' || code.slice(ast.end).trim())) fail('INVALID_ELEMENT_REPLACEMENT', 'Replacement must contain exactly one JSX element.');
  const records = [];
  const collect = (node) => {
    const opening = node.openingElement;
    const attrs = opening.attributes.filter((a) => a.type === 'JSXAttribute' && a.name.name === ATTRIBUTE);
    if (attrs.length > 1) fail('DUPLICATE_SOURCE_ID', 'An element contains duplicate source attributes.');
    let id;
    if (attrs.length) {
      const value = attrs[0].value;
      const literal = value?.type === 'StringLiteral' ? value : value?.type === 'JSXExpressionContainer' && value.expression.type === 'StringLiteral' ? value.expression : null;
      if (!literal) fail('DYNAMIC_SOURCE_ID', 'Source IDs must be nonempty static string literals.');
      id = literal.value;
      validateId(id);
    }
    const attr = attrs[0];
    const relocate = attr && opening.attributes.some((value) => value.type === 'JSXSpreadAttribute' && value.start > attr.end) ? { start: attr.start, end: attr.end } : undefined;
    records.push({ id, tag: generate(opening.name).code, native: opening.name.type === 'JSXIdentifier' && /^[a-z]/.test(opening.name.name), start: node.start, end: node.end, insert: opening.end - (opening.selfClosing ? 2 : 1), relocate, root: node === ast });
  };
  if (element) {
    // traverse requires a Program scope when the root is an expression.
    traverse({ type: 'File', program: { type: 'Program', body: [{ type: 'ExpressionStatement', expression: ast }], directives: [], sourceType: 'module' } }, { JSXElement(p) { collect(p.node); } });
  } else traverse(ast, { JSXElement(p) { collect(p.node); } });
  return { records, ast };
}

function parseVue(code, element = false) {
  const prefix = element ? '<template>' : '';
  const input = element ? `${prefix}${code}</template>` : code;
  const result = parseSFC(input, { filename: 'source.vue' });
  if (result.errors.length) fail('SOURCE_PARSE_ERROR', result.errors.map((e) => e.message || e).join('\n'));
  const template = result.descriptor.template;
  if (template?.lang && template.lang !== 'html') fail('UNSUPPORTED_TEMPLATE', 'Vue templates must use HTML; preprocessors are unsupported.');
  const records = [];
  const walk = (node) => {
    if (node.type === 1) {
      const attrs = node.props.filter((p) => p.type === 6 && p.name === ATTRIBUTE);
      const dynamic = node.props.some((p) => p.type === 7 && p.name === 'bind' && (p.arg?.content === ATTRIBUTE || (p.arg && !p.arg.isStatic)));
      if (dynamic) fail('DYNAMIC_SOURCE_ID', 'Dynamic bindings cannot set source IDs.');
      if (attrs.length > 1) fail('DUPLICATE_SOURCE_ID', 'An element contains duplicate source attributes.');
      const id = attrs[0]?.value?.content;
      if (attrs.length) validateId(id);
      const offset = node.loc.start.offset;
      // The AST location, unlike text scanning, identifies the actual opening tag.
      const openingEnd = findOpeningEnd(input, offset);
      const insertion = openingEnd - (input[openingEnd - 2] === '/' ? 2 : 1);
      const attr = attrs[0];
      const relocate = attr && node.props.some((value) => value.type === 7 && value.name === 'bind' && !value.arg && value.loc.start.offset > attr.loc.end.offset) ? { start: attr.loc.start.offset - prefix.length, end: attr.loc.end.offset - prefix.length } : undefined;
      records.push({ id, tag: node.tag, native: node.tagType === 0, start: offset - prefix.length, end: node.loc.end.offset - prefix.length, insert: insertion - prefix.length, relocate, root: template.ast.children.includes(node) });
    }
    for (const child of node.children || []) walk(child);
  };
  if (template?.ast) for (const child of template.ast.children) walk(child);
  if (element) {
    const roots = template?.ast?.children.filter((node) => node.type !== 3 && !(node.type === 2 && !node.content.trim())) || [];
    if (roots.length !== 1 || roots[0].type !== 1 || code.slice(0, records[0]?.start).trim() || code.slice(records[0]?.end).trim()) {
      fail('INVALID_ELEMENT_REPLACEMENT', 'Replacement must contain exactly one Vue template element.');
    }
  }
  return { records, descriptor: result.descriptor };
}

function findOpeningEnd(code, start) {
  let quote;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) { if (ch === quote) quote = undefined; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i + 1;
  }
  fail('SOURCE_PARSE_ERROR', 'Unterminated opening tag.');
}

function validateId(id) {
  if (typeof id !== 'string' || !id || !/^[A-Za-z0-9_.:-]+$/.test(id) || id.length > 256) fail('INVALID_SOURCE_ID', 'Source IDs must be nonempty safe static strings (at most 256 characters).');
}

function parseSource(framework, code, element = false, filename = '') {
  if (typeof code !== 'string') fail('INVALID_SOURCE', 'Source code must be a string.');
  const parsed = framework === 'react' ? parseReact(code, element, filename) : parseVue(code, element);
  const ids = new Set();
  for (const node of parsed.records) if (node.id) {
    if (ids.has(node.id)) fail('DUPLICATE_SOURCE_ID', `Duplicate source ID: ${node.id}`);
    ids.add(node.id);
  }
  return parsed;
}

function withLocations(code, filename, records) {
  const lines = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') lines.push(i + 1);
  const location = (offset) => {
    let low = 0, high = lines.length;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (lines[mid] <= offset) low = mid; else high = mid; }
    return { line: low + 1, column: offset - lines[low] + 1 };
  };
  const sourceHash = digest(code);
  return records.map(({ insert, root, relocate, ...record }) => {
    const begin = location(record.start), end = location(record.end);
    return { ...record, path: filename, sourceHash, elementHash: digest(code.slice(record.start, record.end)), line: begin.line, column: begin.column, endLine: end.line, endColumn: end.column, byteStart: Buffer.byteLength(code.slice(0, record.start)), byteEnd: Buffer.byteLength(code.slice(0, record.end)) };
  });
}

function normalized({ path: filename, framework, code }, { element = false, rootId } = {}) {
  framework = frameworkName(framework);
  filename = projectPath(filename);
  const parsed = parseSource(framework, code, element, filename);
  const ids = new Set(parsed.records.map((node) => node.id).filter(Boolean));
  const edits = [];
  for (const node of parsed.records) if (node.relocate) {
    // An explicit source ID must follow all spreads, so a business prop spread
    // cannot replace persisted identity at runtime.
    edits.push({ at: node.relocate.start, end: node.relocate.end, text: '' });
    edits.push({ at: node.insert, text: ` ${code.slice(node.relocate.start, node.relocate.end)}` });
  }
  if (rootId) {
    const root = parsed.records.find((node) => node.root);
    if (!root) fail('INVALID_ELEMENT_REPLACEMENT', 'Replacement has no source element root.');
    if (root.id && root.id !== rootId) fail('ROOT_SOURCE_ID_CHANGED', 'Replacing a source element cannot change its root source ID.');
    if (!root.id) { root.id = rootId; ids.add(rootId); edits.push({ at: root.insert, text: ` ${ATTRIBUTE}="${rootId}"` }); }
  }
  for (const node of parsed.records) if (!node.id) {
    let id;
    do { id = `src_${randomUUID().replaceAll('-', '')}`; } while (ids.has(id));
    ids.add(id);
    edits.push({ at: node.insert, text: ` ${ATTRIBUTE}="${id}"` });
  }
  let result = code;
  for (const edit of edits.sort((a, b) => b.at - a.at)) result = result.slice(0, edit.at) + edit.text + result.slice(edit.end ?? edit.at);
  const records = edits.length ? parseSource(framework, result, element, filename).records : parsed.records;
  return { code: result, nodes: withLocations(result, filename, records), changed: result !== code, hash: digest(result) };
}

/** Normalize once, then persist the returned code. IDs survive formatting and moves. */
export function normalizeFrameworkSource(options) { return normalized(options); }

/** Return the complete, exact source element, never a DOM-path-derived approximation. */
export function sourceElement({ path: filename, framework, code, nodeId }) {
  framework = frameworkName(framework);
  filename = projectPath(filename);
  if (typeof nodeId !== 'string' || !nodeId) fail('SOURCE_ELEMENT_NOT_FOUND', 'A persisted source ID is required.');
  const parsed = parseSource(framework, code, false, filename);
  const matches = withLocations(code, filename, parsed.records).filter((node) => node.id === nodeId);
  if (matches.length !== 1) fail('SOURCE_ELEMENT_NOT_FOUND', `No unique source element with ID ${nodeId}`);
  const node = matches[0];
  return { ...node, code: code.slice(node.start, node.end), hash: digest(code) };
}

/** Only the selected source span is replaced; surrounding bytes remain untouched. */
export function replaceSourceElement({ path: filename, framework, code, nodeId, replacement, preserveRootId = true, expectedHash, expectedSourceHash }) {
  if (!preserveRootId) fail('ROOT_SOURCE_ID_CHANGED', 'Source replacement must preserve the selected root ID.');
  const selected = sourceElement({ path: filename, framework, code, nodeId });
  if ((expectedHash && selected.hash !== expectedHash) || (expectedSourceHash && selected.sourceHash !== expectedSourceHash)) fail('SOURCE_REVISION_CONFLICT', 'Source changed since the element was selected.');
  const fragment = normalized({ path: filename, framework, code: replacement }, { element: true, rootId: nodeId });
  const next = code.slice(0, selected.start) + fragment.code + code.slice(selected.end);
  const parsed = parseSource(frameworkName(framework), next, false, filename);
  // Validation must not normalize the rest of the file: that would modify unrelated elements.
  return { code: next, nodes: withLocations(next, projectPath(filename), parsed.records), changed: next !== code, hash: digest(next) };
}

function packageName(specifier) { return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]; }
function runtimeResolver(framework) {
  const roots = new Map();
  const allowed = framework === 'react' ? new Set(['react', 'react-dom', 'scheduler']) : new Set([...runtimePackages].filter((name) => name === 'vue' || name.startsWith('@vue/')));
  const rootFor = (name) => {
    if (!roots.has(name)) {
      let packageFile;
      try { packageFile = require.resolve(`${name}/package.json`); }
      catch { fail('FRAMEWORK_RUNTIME_UNAVAILABLE', `Installed framework runtime is missing: ${name}`); }
      roots.set(name, realpathSync(path.dirname(packageFile)));
    }
    return roots.get(name);
  };
  const within = (file, root) => file === root || file.startsWith(root + path.sep);
  return (specifier, importer) => {
    let file, root;
    if (specifier.startsWith('.')) {
      if (!importer) fail('FRAMEWORK_DEPENDENCY_NOT_ALLOWED', `Runtime relative import has no importer: ${specifier}`);
      root = [...roots.values()].find((value) => within(importer, value));
      if (!root) fail('FRAMEWORK_DEPENDENCY_NOT_ALLOWED', `Untrusted runtime importer: ${importer}`);
      const candidate = path.resolve(path.dirname(importer), specifier);
      if (!within(candidate, root)) fail('FRAMEWORK_DEPENDENCY_NOT_ALLOWED', `Runtime import escapes its allowed package: ${specifier}`);
      try { file = require.resolve(candidate); }
      catch { fail('FRAMEWORK_RUNTIME_UNAVAILABLE', `Runtime module is missing: ${specifier}`); }
    } else {
      const name = packageName(specifier);
      if (!allowed.has(name) || specifier.includes('\\') || specifier.split('/').includes('..')) fail('FRAMEWORK_DEPENDENCY_NOT_ALLOWED', `Dependency is not allowed: ${specifier}`);
      root = rootFor(name);
      try {
        if (specifier === 'vue') file = path.join(root, 'dist/vue.runtime.esm-bundler.js');
        else if (specifier === name && name.startsWith('@vue/')) {
          const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
          file = path.resolve(root, metadata.module);
        } else file = require.resolve(specifier);
      } catch { fail('FRAMEWORK_RUNTIME_UNAVAILABLE', `Runtime module is missing: ${specifier}`); }
    }
    const real = realpathSync(file);
    if (!within(real, root)) fail('FRAMEWORK_DEPENDENCY_NOT_ALLOWED', `Runtime path escapes its allowed package: ${specifier}`);
    return real;
  };
}

function compileVueModule(code, filename, styleModules, virtual, buildId) {
  // compiler-sfc can resolve imported TypeScript props. Supply our own filesystem
  // even if another caller has registered TypeScript with a host fs globally.
  // A content-specific virtual root also isolates compiler-sfc's type cache.
  const virtualRoot = `/__dsh_virtual_${buildId}/`;
  const virtualKey = (file) => {
    if (!file.startsWith(virtualRoot)) fail('PROJECT_PATH_ESCAPE', `Vue type import escapes the virtual project: ${file}`);
    return projectPath(file.slice(virtualRoot.length));
  };
  const fs = {
    fileExists: (file) => virtual.has(virtualKey(file)),
    readFile: (file) => virtual.get(virtualKey(file)),
    realpath: (file) => `${virtualRoot}${virtualKey(file)}`,
  };
  const { descriptor, errors } = parseSFC(code, { filename: `${virtualRoot}${filename}` });
  if (errors.length) fail('SOURCE_PARSE_ERROR', errors.map((e) => e.message || e).join('\n'));
  const id = `dsh-${digest(filename).slice(0, 12)}`;
  if (descriptor.script?.src) fail('FILE_NOT_PROVIDED', 'External Vue script src is not supported; import it from an inline script.');
  const script = descriptor.script || descriptor.scriptSetup ? compileScript(descriptor, { id, fs, genDefaultAs: '__dsh_component' }) : null;
  let result = script?.content || 'const __dsh_component = {};';
  if (descriptor.template) {
    if (descriptor.template.src) fail('FILE_NOT_PROVIDED', 'External Vue template src is not supported; provide an inline template.');
    const template = compileTemplate({ source: descriptor.template.content, filename, id, scoped: descriptor.styles.some((s) => s.scoped), compilerOptions: { bindingMetadata: script?.bindings } });
    if (template.errors.length) fail('SOURCE_PARSE_ERROR', template.errors.map((e) => e.message || e).join('\n'));
    result += `\n${template.code}\n__dsh_component.render = render;`;
  }
  if (descriptor.styles.some((s) => s.scoped)) result += `\n__dsh_component.__scopeId = ${JSON.stringify(`data-v-${id}`)};`;
  for (let i = 0; i < descriptor.styles.length; i++) {
    const style = descriptor.styles[i];
    if (style.src || (style.lang && style.lang !== 'css') || style.module) fail('UNSUPPORTED_STYLE', 'Vue styles support inline CSS, including scoped CSS; src, preprocessors and CSS modules are unsupported.');
    const compiled = compileStyle({ source: style.content, filename, id: `data-v-${id}`, scoped: style.scoped });
    if (compiled.errors.length) fail('SOURCE_PARSE_ERROR', compiled.errors.map((e) => e.message || e).join('\n'));
    const key = `${filename}?dsh-style=${i}`;
    styleModules.set(key, compiled.code);
    result += `\nimport ${JSON.stringify(key)};`;
  }
  return `${result}\nexport default __dsh_component;`;
}

/** Compile only the provided virtual files and installed, explicitly allowed runtimes. */
export async function compileFrameworkProject({ framework, entry, files }) {
  framework = frameworkName(framework);
  entry = projectPath(entry);
  if (!files || typeof files !== 'object' || Array.isArray(files)) fail('INVALID_PROJECT_FILES', 'files must be a map of relative paths to source text.');
  const virtual = new Map(), nodes = [], normalizedFiles = {}, ids = new Set(), styleModules = new Map();
  for (const [filename, text] of Object.entries(files)) {
    const key = projectPath(filename);
    if (virtual.has(key)) fail('DUPLICATE_PROJECT_PATH', `Duplicate project path: ${key}`);
    if (typeof text !== 'string') fail('INVALID_PROJECT_FILES', `File must contain text: ${key}`);
    const hasElements = framework === 'react' ? /\.[cm]?[jt]sx?$/.test(key) : key.endsWith('.vue');
    const source = hasElements ? normalizeFrameworkSource({ path: key, framework, code: text }) : { code: text, nodes: [] };
    for (const node of source.nodes) {
      if (ids.has(node.id)) fail('DUPLICATE_SOURCE_ID', `Source ID occurs in multiple files: ${node.id}`);
      ids.add(node.id); nodes.push(node);
    }
    virtual.set(key, source.code);
    if (source.changed) normalizedFiles[key] = source.code;
  }
  if (!virtual.has(entry)) fail('FILE_NOT_PROVIDED', `Entry file was not provided: ${entry}`);
  const resolveVirtual = (specifier, importer = '') => {
    let candidate;
    if (specifier.startsWith('/')) fail('PROJECT_PATH_ESCAPE', `Absolute import is not allowed: ${specifier}`);
    candidate = projectPath(path.posix.join(path.posix.dirname(importer || '.'), specifier));
    for (const suffix of extensions) if (virtual.has(candidate + suffix)) return candidate + suffix;
    for (const suffix of extensions.slice(1)) if (virtual.has(`${candidate}/index${suffix}`)) return `${candidate}/index${suffix}`;
    fail('FILE_NOT_PROVIDED', `Imported file was not provided: ${specifier} (from ${importer || entry})`);
  };
  const resolveRuntime = runtimeResolver(framework);
  const buildId = digest(JSON.stringify([...virtual]));
  let bootstrap = `import ${JSON.stringify(`./${entry}`)};`;
  if (entry.endsWith('.vue')) bootstrap = `import { createApp } from 'vue'; import Component from ${JSON.stringify(`./${entry}`)}; createApp(Component).mount('#root');`;
  else if (framework === 'react') {
    const { ast } = parseReact(virtual.get(entry), false, entry);
    if (ast.program.body.some((node) => node.type === 'ExportDefaultDeclaration')) bootstrap = `import React from 'react'; import { createRoot } from 'react-dom/client'; import Component from ${JSON.stringify(`./${entry}`)}; createRoot(document.getElementById('root')).render(React.createElement(Component));`;
  }
  let result;
  try {
    result = await esbuild.build({
      stdin: { contents: bootstrap, sourcefile: '__dsh_entry__.js', loader: 'js', resolveDir: '/' },
      bundle: true, write: false, outfile: '/__dsh_output__/canvas.js', format: 'iife', platform: 'browser', target: ['es2020'], jsx: 'automatic', jsxImportSource: 'react',
      define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
      logLevel: 'silent', plugins: [{ name: 'dsh-virtual-project', setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (styleModules.has(args.path)) return { path: args.path, namespace: 'dsh-style' };
          if (args.namespace === 'dsh-runtime') return { path: resolveRuntime(args.path, args.importer), namespace: 'dsh-runtime' };
          if (args.kind === 'url-token') {
            if (/^(?:https?:|data:|#)/i.test(args.path)) return { path: args.path, external: true };
            const asset = args.path.startsWith('/') ? args.path : projectPath(path.posix.join(path.posix.dirname(args.importer.split('?')[0]), args.path));
            return { path: asset, external: true };
          }
          if (args.path.startsWith('.') || args.path.startsWith('/')) return { path: resolveVirtual(args.path, args.namespace === 'dsh-project' || args.namespace === 'dsh-style' ? args.importer.split('?')[0] : ''), namespace: 'dsh-project' };
          return { path: resolveRuntime(args.path), namespace: 'dsh-runtime' };
        });
        build.onLoad({ filter: /.*/, namespace: 'dsh-runtime' }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'js' }));
        build.onLoad({ filter: /.*/, namespace: 'dsh-style' }, (args) => ({ contents: styleModules.get(args.path), loader: 'css', resolveDir: '/' }));
        build.onLoad({ filter: /.*/, namespace: 'dsh-project' }, (args) => {
          const source = virtual.get(args.path);
          if (source === undefined) fail('FILE_NOT_PROVIDED', `File was not provided: ${args.path}`);
          const ext = path.posix.extname(args.path).slice(1);
          if (ext === 'vue') return { contents: compileVueModule(source, args.path, styleModules, virtual, buildId), loader: 'ts', resolveDir: '/' };
          const loader = ({ ts: 'ts', tsx: 'tsx', jsx: 'jsx', js: 'jsx', mjs: 'js', cjs: 'js', css: 'css', json: 'json' })[ext];
          if (!loader) fail('UNSUPPORTED_FILE_TYPE', `Unsupported virtual file: ${args.path}`);
          return { contents: source, loader, resolveDir: '/' };
        });
      } }],
    });
  } catch (error) {
    if (error.code) throw error;
    const cause = error.errors?.find((item) => item.detail?.code)?.detail;
    if (cause) { cause.diagnostics = error.errors.map((item) => ({ severity: 'error', message: item.text, location: item.location })); throw cause; }
    fail('FRAMEWORK_COMPILE_ERROR', error.message, { diagnostics: (error.errors || []).map((item) => ({ severity: 'error', message: item.text, location: item.location })) });
  }
  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text || '';
  const css = result.outputFiles.filter((file) => file.path.endsWith('.css')).map((file) => file.text).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  return { html, normalizedFiles, manifest: { framework, entry, nodes, files: [...virtual].map(([filename, code]) => ({ path: filename, hash: digest(code) })), normalizedFiles, runtime: 'bundled', sourceAttribute: ATTRIBUTE }, diagnostics: result.warnings.map((item) => ({ severity: 'warning', message: item.text, location: item.location })) };
}
