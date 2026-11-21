import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';
import {desktopSystemFiles} from '../desktop-theme.js';
import {mobileSystemFiles, MOBILE_THEME_FORMAT} from '../mobile-theme.js';

const require = createRequire(import.meta.url);
const React = require('react');
const bundle = await build({
  entryPoints: [new URL('./SystemLibrary.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  loader: {'.md': 'text', '.html': 'text', '.css': 'text'},
  plugins: [{name: 'card-test-seats', setup(build) {
    build.onLoad({filter: /\/common\.jsx$/}, () => ({contents: 'export const Button=()=>null,Modal=()=>null,ErrorBox=()=>null,useDownload=()=>()=>{};'}));
    build.onLoad({filter: /\/ResourceView\.jsx$/}, () => ({contents: 'export default ()=>null;export const CodeEditor=()=>null;'}));
  }}],
});

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes), ...nodes(node.props.badges)];
}

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : '';
}

function fixture() {
  const slots = [], calls = [];
  let cursor = 0, failure = null, guard;
  const registerGuard = value => {guard = value; return () => {guard = undefined;};};
  let system = {id: 'd-card-test', name: 'Original', revision: 3, platforms: ['web', 'mobile'], versions: [{version: 3, resources: []}]};
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
    useEffect(effect, dependencies) {if (dependencies?.length === 1 && dependencies[0] === registerGuard) effect();},
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const api = async (action, args) => {
    calls.push({action, args});
    if (failure) throw failure;
    if (action === 'system.list') return {systems: [system]};
    assert.equal(args.systemId, system.id);
    if (action === 'system.get') return system;
    assert.equal(args.expectedRevision, system.revision);
    system = {...system, ...args, ...(action === 'system.archive' ? {archived: true} : {}), revision: system.revision + 1};
    return system;
  };
  const render = () => {cursor = 0; return module.exports.default({api, library: {systems: [system]}, onRefresh: async () => {}, registerGuard});};
  const find = predicate => {
    const node = nodes(render()).find(predicate);
    assert.ok(node, 'Expected card control to be rendered');
    return node;
  };
  return {calls, render, find,
    get guard() {render(); return guard;},
    fail(error) {failure = error;},
    begin(label) {find(node => node.type === 'button' && text(node) === label).props.onClick({currentTarget: {closest: () => ({open: true})}});},
    submit() {return find(node => node.type === 'form' && node.props['aria-label'] === '规范卡片设置').props.onSubmit({preventDefault() {}});},
  };
}

test('card rename saves only its requested metadata with the displayed revision', async () => {
  const f = fixture();
  f.begin('重命名');
  f.find(node => node.type === 'input' && node.props['aria-label'] === '规范名称').props.onChange({target: {value: 'Renamed'}});
  await f.submit();
  assert.deepEqual(f.calls[0], {action: 'system.save', args: {systemId: 'd-card-test', expectedRevision: 3, name: 'Renamed', summary: '重命名设计规范'}});
  assert.ok(nodes(f.render()).some(node => node.type === 'article' && node.props['aria-label'] === '设计规范 Renamed'));
});

test('scene checkboxes support multiple selections and persist card tags', async () => {
  const f = fixture();
  const boxes = nodes(f.render()).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  assert.deepEqual(boxes.map(node => node.props.checked), [true, true]);
  await boxes[1].props.onChange({target: {checked: false}});
  assert.deepEqual(f.calls[0].args.platforms, ['web']);
  const tags = f.find(node => node.props['aria-label'] === 'Original的适配场景');
  assert.equal(text(tags), 'Web');
  assert.equal(nodes(f.render()).some(node => node.type === 'form' && node.props['aria-label'] === '规范卡片设置'), false);
  assert.equal(nodes(f.render()).some(node => node.props.className === 'wb-gallery-card-description'), false);
});

test('an empty scene selection is rejected before calling the API', async () => {
  const f = fixture();
  await f.find(node => node.props['aria-label'] === '适配 Mobile').props.onChange({target: {checked: false}});
  const last = f.find(node => node.props['aria-label'] === '适配 Web');
  assert.equal(last.props.disabled, true);
  await last.props.onChange({target: {checked: false}});
  assert.equal(f.calls.filter(call => call.action === 'system.save').length, 1);
  assert.ok(nodes(f.render()).some(node => node.props.error?.message === '请至少选择一个适配场景。'));
});

test('failed inline scene changes retain saved tags and can be retried', async () => {
  const f = fixture();
  f.fail(new Error('Save failed'));
  await f.find(node => node.props['aria-label'] === '适配 Mobile').props.onChange({target: {checked: false}});
  assert.equal(f.find(node => node.props['aria-label'] === '适配 Mobile').props.checked, true);
  f.fail(null);
  await f.find(node => node.props['aria-label'] === '适配 Mobile').props.onChange({target: {checked: false}});
  assert.equal(f.find(node => node.props['aria-label'] === '适配 Mobile').props.checked, false);
});

test('deleting a card archives it and removes it from the visible list', async () => {
  const f = fixture();
  f.begin('删除规范');
  await f.submit();
  assert.equal(f.calls[0].action, 'system.archive');
  assert.equal(f.calls[0].args.expectedRevision, 3);
  assert.equal(nodes(f.render()).some(node => node.type === 'article' && node.props['aria-label'] === '设计规范 Original'), false);
});

test('a failed metadata save retains its draft and can be retried', async () => {
  const f = fixture();
  f.begin('重命名');
  f.find(node => node.type === 'input' && node.props['aria-label'] === '规范名称').props.onChange({target: {value: 'Retry name'}});
  f.fail(new Error('Save failed'));
  await f.submit();
  assert.equal(f.find(node => node.type === 'input' && node.props['aria-label'] === '规范名称').props.value, 'Retry name');
  f.fail(null);
  await f.submit();
  assert.equal(f.calls.filter(call => call.action === 'system.save').length, 2);
});

test('duplicate form submissions produce one mutation', async () => {
  const f = fixture();
  f.begin('删除规范');
  const first = f.submit();
  await f.submit();
  await first;
  assert.equal(f.calls.filter(call => call.action === 'system.archive').length, 1);
});

test('system info has explicit input fields and no directory download control', () => {
  const f = fixture();
  f.find(node => node.type === 'button' && node.props['aria-label'] === '打开规范 Ant Design · Web Components').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.props['aria-label'] === '下载规范目录'), false);
  f.find(node => node.props['aria-label'] === '编辑规范信息').props.onClick();
  const form = f.find(node => node.type === 'form' && node.props.className.includes('wb-spec-info-form'));
  const input = nodes(form).find(node => node.type === 'input');
  assert.equal(input.props.autoFocus, true);
  assert.equal(input.props.placeholder, '输入规范名称');
  assert.ok(nodes(form).some(node => node.type === 'footer'));
});

test('browsing the built-in system and switching views do not create unsaved changes', () => {
  const f = fixture();
  const open = () => f.find(node => node.props['aria-label'] === '打开规范 Ant Design · Web Components').props.onClick();
  open();
  assert.equal(f.guard.isDirty(), false);
  assert.equal(f.find(node => node.props.className === 'wb-spec-save-state').props.children, '内置规范');
  assert.equal(f.find(node => text(node) === '保存规范').props.disabled, false);
  f.find(node => node.props.draft && node.props.onViewChange).props.onViewChange('rule');
  assert.equal(f.guard.isDirty(), false);
  f.find(node => text(node) === '文件').props.onClick();
  f.find(node => node.props.files && node.props.onSelect).props.onSelect('theme.css');
  f.find(node => node.props['aria-label'] === '编辑规范信息').props.onClick();
  assert.equal(f.guard.isDirty(), false);
  f.find(node => node.props['aria-label'] === '返回规范目录列表').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.props.className === 'wb-spec-draft'), false);
  open();
  assert.equal(f.guard.isDirty(), false);
});

test('real built-in edits survive reopening and restoring content clears the guard despite file reordering', () => {
  const f = fixture();
  const open = () => f.find(node => node.props['aria-label'] === '打开规范 Ant Design · Web Components').props.onClick();
  const theme = () => f.find(node => node.props.draft && node.props.onViewChange);
  open();
  const original = theme().props.draft.files;
  const generated = desktopSystemFiles({primary: '#663399'});
  theme().props.onChange(generated);
  assert.equal(f.guard.isDirty(), true);
  f.find(node => node.props['aria-label'] === '返回规范目录列表').props.onClick();
  open();
  assert.equal(theme().props.draft.files, generated);
  assert.equal(f.guard.isDirty(), true);
  theme().props.onChange([...original].reverse());
  assert.equal(f.guard.isDirty(), false);
  f.find(node => node.props['aria-label'] === '返回规范目录列表').props.onClick();
  assert.equal(nodes(f.render()).some(node => node.props.className === 'wb-spec-draft'), false);
});

test('explicitly creating or copying a system still requires saving', async () => {
  const f = fixture();
  assert.equal(nodes(f.render()).filter(node => node.type === 'summary' && text(node) === '新建规范').length, 1);
  assert.equal(nodes(f.render()).some(node => node.props['aria-label'] === '刷新规范列表'), false);
  f.find(node => node.type === 'button' && text(node) === 'Web 端 · Ant Design').props.onClick();
  assert.equal(f.guard.isDirty(), true);
  f.guard.discard();
  await f.find(node => node.props['aria-label'] === '复制 Ant Design · Web Components').props.onClick();
  assert.equal(f.guard.isDirty(), true);
});

test('opening a saved system does not mark its generated directory entries as edits', async () => {
  const f = fixture();
  await f.find(node => node.props['aria-label'] === '打开规范 Original').props.onClick();
  assert.equal(f.guard.isDirty(), false);
  f.find(node => node.props.files && node.props.onSelect).props.onSelect('rule.md');
  assert.equal(f.guard.isDirty(), false);
});

test('mobile built-in browsing is clean and new/copy/theme changes retain the mobile platform', async () => {
  const f = fixture();
  f.find(node => node.props['aria-label'] === '打开规范 Vant · Mobile Web Components').props.onClick();
  const theme = () => f.find(node => node.props.draft && node.props.onViewChange);
  assert.equal(f.guard.isDirty(), false);
  assert.deepEqual(theme().props.draft.platforms, ['mobile']);
  const config = JSON.parse(theme().props.draft.files.find(file => file.logicalPath === 'tokens.json').content);
  assert.equal(config.format, MOBILE_THEME_FORMAT);
  theme().props.onChange(mobileSystemFiles({primary: '#663399'}), 'mobile');
  assert.deepEqual(theme().props.draft.platforms, ['mobile']);
  assert.equal(f.guard.isDirty(), true);
  f.guard.discard();
  f.find(node => node.type === 'button' && text(node) === '移动端 · Vant').props.onClick();
  assert.deepEqual(theme().props.draft.platforms, ['mobile']);
  assert.equal(f.guard.isDirty(), true);
  f.guard.discard();
  await f.find(node => node.props['aria-label'] === '复制 Vant · Mobile Web Components').props.onClick();
  assert.deepEqual(theme().props.draft.platforms, ['mobile']);
});

test('the built-in page pattern has a direct maintenance entry without marking a draft dirty', () => {
  const f = fixture();
  f.find(node => node.props['aria-label'] === '打开规范 Ant Design · Web Components').props.onClick();
  f.find(node => node.props['aria-label'] === '维护页面范式').props.onClick();
  const tree = f.find(node => node.props.onSelect && node.props.selected === 'patterns/desktop-records.html');
  assert.ok(tree.props.files.some(file => file.logicalPath === 'skeletons.json'));
  assert.equal(f.guard.isDirty(), false);
});
