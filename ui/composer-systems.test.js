import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url);
const React = require('react');
const bundle = await build({
  entryPoints: [new URL('./DesignerComposer.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react-dom'],
  plugins: [{name: 'composer-test-seats', setup(build) {
    build.onLoad({filter: /\/common\.jsx$/}, () => ({contents: 'export const Modal=()=>null,Button=()=>null;'}));
    build.onLoad({filter: /\/InlineSelectionInput\.jsx$/}, () => ({contents: 'export default ()=>null;'}));
  }}],
});

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function fixture({systems = [], listed = systems, failUpload = false, gate, onSubmit} = {}) {
  const slots = [], calls = [], choices = [];
  let cursor = 0, choice = null;
  const react = {...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = {current: initial};
      return slots[index];
    },
    useCallback: callback => callback,
    useId: () => 'composer-test',
    useEffect() {}, useLayoutEffect() {}, useImperativeHandle() {},
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const saved = {id: 'd-saved-ant', name: 'Ant Design · Web Components', versions: [{version: 1}]};
  const api = async (action, args) => {
    calls.push({action, args});
    if (action === 'system.list') {await gate; return {systems: listed};}
    if (action === 'system.get') return {...saved, id: args.systemId};
    throw Error(action);
  };
  api.upload = async (file, options) => {
    const body = JSON.parse(await file.text());
    calls.push({action: 'upload', options, body});
    if (failUpload) throw Error('保存失败');
    return {...saved, name: body.name};
  };
  const render = () => {
    cursor = 0;
    return module.exports.default.render({api, systems, value:'设计一个页面', onSubmit, systemChoice: choice, onSystemChange: value => {choice = value; choices.push(value);}}, null);
  };
  const find = predicate => {
    const result = nodes(render()).find(predicate);
    assert.ok(result, 'Expected composer control');
    return result;
  };
  const option = (id, version) => find(node => node.props.role === 'option' && node.props['data-system-id'] === id && node.props['data-system-version'] === version);
  const open = () => find(node => node.props['data-testid'] === 'designer-composer-system').props.onClick();
  return {calls, choices, render, find, option, open};
}

test('an empty saved library still offers both built-in specifications', () => {
  const f = fixture(); f.open();
  assert.ok(f.option('builtin-desktop-antd'));
  assert.ok(f.option('builtin-mobile-vant'));
  assert.equal(f.calls.length, 0);
});

test('one click on a built-in specification saves its actual resources before returning a real binding', async () => {
  const f = fixture(); f.open();
  await f.option('builtin-desktop-antd').props.onClick();
  const upload = f.calls.find(call => call.action === 'upload');
  assert.equal(upload.options.purpose, 'system-package');
  assert.deepEqual(upload.body.platforms, ['web']);
  for (const path of ['rule.md', 'tokens.json', 'theme.css', 'components.js']) {
    assert.ok(upload.body.resources.some(resource => resource.logicalPath === path), path);
  }
  assert.deepEqual(f.choices, [{systemId: 'd-saved-ant'}]);
  assert.match(f.find(node => node.props['data-testid'] === 'designer-composer-system').props.title, /^Ant Design · Web Components$/);
  f.open();
  assert.ok(f.option('d-saved-ant'));
  assert.equal(nodes(f.render()).some(node => node.props['data-system-id'] === 'builtin-desktop-antd'), false);
});

test('a saved specification discovered after opening the chooser is reused', async () => {
  const f = fixture({listed: [{id: 'd-existing', name: 'Ant Design · Web Components'}]}); f.open();
  await f.option('builtin-desktop-antd').props.onClick();
  assert.equal(f.calls.some(call => call.action === 'upload'), false);
  assert.deepEqual(f.choices, [{systemId: 'd-existing'}]);
});

test('the mobile choice persists Vant resources and its mobile platform', async () => {
  const f = fixture(); f.open();
  await f.option('builtin-mobile-vant').props.onClick();
  const upload = f.calls.find(call => call.action === 'upload');
  assert.equal(upload.body.name, 'Vant · Mobile Web Components');
  assert.deepEqual(upload.body.platforms, ['mobile']);
  assert.ok(upload.body.resources.some(resource => resource.logicalPath === 'rule.md'));
  assert.match(f.find(node => node.props['data-testid'] === 'designer-composer-system').props.title, /^Vant · Mobile Web Components$/);
});

test('failed materialization keeps the chooser open and never selects a virtual ID', async () => {
  const f = fixture({failUpload: true}); f.open();
  await f.option('builtin-desktop-antd').props.onClick();
  assert.deepEqual(f.choices, []);
  assert.ok(f.find(node => node.props.role === 'alert'));
});

test('closing the chooser preserves the clicked system and blocks send until confirmed', async()=>{
  let resume,sent=0;
  const f=fixture({gate:new Promise(resolve=>resume=resolve),onSubmit:()=>sent++});
  f.open();const pending=f.option('builtin-desktop-antd').props.onClick();
  f.find(node=>node.props['aria-label']==='关闭选择面板').props.onClick();
  const submit=()=>f.render().props.onSubmit({preventDefault(){}});
  assert.equal(f.find(node=>node.props['data-testid']==='designer-composer-send').props.disabled,true);
  await submit();assert.equal(sent,0);
  resume();await pending;assert.deepEqual(f.choices,[{systemId:'d-saved-ant'}]);
  await submit();assert.equal(sent,1);
});
