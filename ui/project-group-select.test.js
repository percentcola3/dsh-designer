import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url), React = require('react');
const bundle = await build({
  entryPoints: [new URL('./ProjectGroupSelect.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
});

function nodes(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}

function fixture() {
  const slots = [], changes = [];
  let cursor = 0, value = '', disabled = false;
  const react = {...React,
    useId: () => 'group-picker',
    useEffect() {},
    useRef: () => ({current: null}),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => {slots[index] = next;}];
    },
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const render = () => {
    cursor = 0;
    return module.exports.default({groups: [{id: 'g-design', name: '设计组'}, {id: 'g-demo', name: '演示组'}], value, disabled,
      onChange(next) {value = next; changes.push(next);}});
  };
  const find = predicate => nodes(render()).find(predicate);
  const trigger = () => find(node => node.props.role === 'combobox');
  return {changes, render, find, trigger,
    open() {trigger().props.onClick();},
    disable() {disabled = true;},
    key(key) {
      const event = {key, prevented: false, stopped: false,
        preventDefault() {this.prevented = true;}, stopPropagation() {this.stopped = true;}};
      trigger().props.onKeyDown(event);
      return event;
    },
  };
}

test('group popup declares selection, shows every group and commits a clicked option', () => {
  const f = fixture();
  assert.equal(f.trigger().props['aria-expanded'], false);
  f.open();
  assert.equal(f.trigger().props['aria-expanded'], true);
  const selected = f.find(node => node.props.role === 'option' && node.props['aria-selected']);
  assert.equal(selected.props.id, 'group-picker-option-0');
  const option = f.find(node => node.props.id === 'group-picker-option-1');
  option.props.onClick();
  assert.deepEqual(f.changes, ['g-design']);
  assert.equal(f.trigger().props['aria-expanded'], false);
  f.open();
  f.find(node => node.props.id === 'group-picker-option-0').props.onClick();
  assert.deepEqual(f.changes, ['g-design', '']);
});

test('keyboard selection scroll target and selected option share stable IDs', () => {
  const f = fixture();
  assert.equal(f.key('ArrowDown').prevented, true);
  f.key('ArrowDown');
  assert.equal(f.trigger().props['aria-activedescendant'], 'group-picker-option-1');
  assert.equal(f.key('Enter').prevented, true);
  assert.deepEqual(f.changes, ['g-design']);
  f.key('End');
  f.key(' ');
  assert.deepEqual(f.changes, ['g-design', 'g-demo']);
  f.key('Home');
  f.key('ArrowUp');
  assert.equal(f.trigger().props['aria-activedescendant'], 'group-picker-option-2');
});

test('Escape dismisses only the group list and Tab leaves the control without submitting', () => {
  const f = fixture();
  f.open();
  const escape = f.key('Escape');
  assert.equal(escape.stopped, true);
  assert.equal(escape.prevented, true);
  assert.equal(f.trigger().props['aria-expanded'], false);
  assert.equal(f.key('Escape').stopped, false);
  f.open();
  assert.equal(f.key('Tab').prevented, false);
  assert.equal(f.trigger().props['aria-expanded'], false);
  assert.deepEqual(f.changes, []);
});

test('a locked creation disables the group trigger and hides an open list', () => {
  const f = fixture();
  f.open();
  f.disable();
  assert.equal(f.trigger().props.disabled, true);
  assert.equal(f.find(node => node.props.role === 'listbox'), undefined);
  f.key('Enter');
  assert.deepEqual(f.changes, []);
});
