import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url);
const React = require('react');
const result = await build({
  entryPoints: [new URL('./ProjectCanvasLayout.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
});
const module = {exports: {}};
const react = {
  ...React,
  useRef: value => ({current: value}),
  useState: value => [value, () => {}],
  useCallback: callback => callback,
  useLayoutEffect() {},
  useEffect() {},
};
new Function('require', 'module', 'exports', result.outputFiles[0].text)(
  name => name === 'react' ? react : require(name), module, module.exports,
);
const {default: ProjectCanvasLayout} = module.exports;

function findToolbar(node) {
  if (!React.isValidElement(node)) return null;
  if (node.props.role === 'toolbar') return node;
  return React.Children.toArray(node.props.children).map(findToolbar).find(Boolean);
}

function toolbarButtons(toolbar){
  return React.Children.toArray(toolbar.props.children).flatMap(node=>node.props.role==='group'?React.Children.toArray(node.props.children):node).filter(node=>node.props['aria-label']);
}

test('element picking and freeze keep the same toolbar positions in both states', () => {
  const calls = [];
  for (const frozen of [false, true]) {
    for (const tool of ['interact', 'pick']) {
      const buttons = toolbarButtons(findToolbar(ProjectCanvasLayout({
        designs: [], frozen, tool,
        onTool: next => calls.push(next), onFreeze: () => calls.push('toggle'),
      })));
      assert.deepEqual(buttons.map(b => b.props['aria-label']), ['拾取元素', frozen ? '恢复交互' : '冻结页面','缩小','适合整页','放大','截图']);
      assert.deepEqual(buttons.slice(0,2).map(b => b.props['aria-pressed']), [tool === 'pick', frozen]);
      assert.equal(React.Children.only(buttons[1].props.children).props.name,frozen?'unlock':'lock');
      for (const button of buttons.slice(0,2)) button.props.onClick();
    }
  }
  assert.deepEqual(calls, ['pick','toggle','interact','toggle','pick','toggle','interact','toggle']);
});

test('source workflow panels do not show the canvas toolbar', () => {
  assert.equal(findToolbar(ProjectCanvasLayout({designs: [], activeWorkflowId: 'website'})), undefined);
});

test('zoom buttons select smaller, whole-page fit and larger views without a percentage label', () => {
  const calls=[];
  const buttons=toolbarButtons(findToolbar(ProjectCanvasLayout({designs:[],onZoom:action=>calls.push(action)})));
  for(const button of buttons.slice(2,5)){
    assert.ok(React.isValidElement(button.props.children));
    button.props.onClick();
  }
  assert.deepEqual(calls,['out','fit','in']);
});

function findSceneTabs(node) {
  if (!React.isValidElement(node)) return null;
  if (node.props.role === 'tablist' && node.props['aria-label'] === '切换设计场景') return node;
  return React.Children.toArray(node.props.children).map(findSceneTabs).find(Boolean);
}

const scenes = [{id: 'detail', name: '预约详情'}, {id: 'cancel', name: '取消确认'}];

test('opening an existing page with saved scenes keeps the canvas free of scene controls', () => {
  assert.equal(findSceneTabs(ProjectCanvasLayout({designs: [], scenes, scene: 'detail'})), undefined);
});
