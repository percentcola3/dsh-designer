import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url);
const React = require('react');
const bundle = await build({
  entryPoints: [new URL('./ProjectManagerPanel.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{name: 'project-dialog-test-seats', setup(build) {
    build.onLoad({filter: /\/common\.jsx$/}, () => ({contents: 'export const Button=()=>null,Modal=()=>null,ErrorBox=()=>null;'}));
    build.onLoad({filter: /\/ProjectCard\.jsx$/}, () => ({contents: 'export default ()=>null;'}));
  }}],
});

function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

function fixture() {
  const slots = [], calls = [];
  let cursor = 0, failInitialization = false;
  let project = {id: 'p-dialog', revision: 1, workbench: {}};
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
    useId: () => 'project-options',
    useEffect() {},
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const api = async (action, args) => {
    calls.push({action, args: structuredClone(args)});
    if (action === 'system.get') return {platforms:['mobile']};
    if (action === 'project.create' || action === 'project.get') return {project};
    assert.equal(action, 'project.initialize');
    if (failInitialization) throw new Error('Initialization failed');
    project = {...project, revision: 2, workbench: {initializedAt: 'now', designs: [{id: 'd-dialog', platform: args.platform, artifactKind: args.artifactKind}]}};
    return {project};
  };
  const render = () => {
    cursor = 0;
    return module.exports.default({library: {groups: [{id: 'g-dialog', name: '设计组'}], projects: [], systems:[{id:'d-mobile',name:'手机规范',platforms:['mobile']}]}, api, onRefresh: async () => {}});
  };
  const find = predicate => {
    const found = nodes(render()).find(predicate);
    assert.ok(found, 'Expected project dialog control');
    return found;
  };
  const input = label => find(node => node.props['aria-label'] === label);
  const button = label => find(node => node.props.children === label);
  return {calls, find, input, controls:()=>nodes(render()),
    open() {find(node => node.props['aria-expanded'] === false && React.Children.toArray(node.props.children).includes('新建项目')).props.onClick();},
    setName(value) {input('项目名称').props.onChange({target: {value}});},
    setGroup(value) {find(node => Array.isArray(node.props.groups) && typeof node.props.onChange === 'function').props.onChange(value);},
    choose(value) {input('设计规范').props.onChange({target:{value}});},
    submit() {return input('新建项目').props.onSubmit({preventDefault() {}});},
    cancel() {button('取消').props.onClick();},
    failInitialization(value) {failInitialization = value;},
  };
}

test('new project only asks for a name, group and optional system',()=>{
  const f=fixture();f.open();
  assert.equal(f.input('设计规范').props.value,'');
  assert.ok(!f.controls().some(node=>node.props.onPlatformChange||node.props.onArtifactKindChange||node.props.type==='radio'));
  f.choose('d-mobile');f.cancel();f.open();
  assert.deepEqual(f.calls,[]);assert.equal(f.input('设计规范').props.value,'');
});

test('system selection supplies the mobile HTML project and retry reuses its identity',async()=>{
  const f=fixture();f.open();f.setName(' 页面设计 ');f.setGroup('g-dialog');f.choose('d-mobile');f.failInitialization(true);
  await f.submit();
  assert.equal(f.input('项目名称').props.disabled,true);assert.equal(f.input('设计规范').props.disabled,true);
  f.failInitialization(false);await f.submit();
  const created=f.calls.filter(call=>call.action==='project.create');
  assert.equal(created.length,1);assert.equal(created[0].args.name,'页面设计');assert.equal(created[0].args.groupId,'g-dialog');
  for(const call of [...created,...f.calls.filter(call=>call.action==='project.initialize')]){
    assert.equal(call.args.platform,'mobile');assert.equal(call.args.artifactKind,'html');assert.equal(call.args.systemId,'d-mobile');
  }
});
