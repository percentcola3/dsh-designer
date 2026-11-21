import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const compiled = await build({
  entryPoints: [new URL('./Properties.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
});
const module = {exports: {}};
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports,
);

test('object properties open directly on design fields even for previously configured elements', () => {
  const node = {id: 'cta', tag: 'button', text: '提交', styles: {}, attributes: {}};
  const model = {
    nodes: {cta: node},
    interactions: [{sourceId: 'cta', type: 'modal'}],
    states: {cta: {variants: {loading: {text: '保存中'}}}},
  };
  const html = renderToStaticMarkup(React.createElement(module.exports.default, {
    page: {id: 'home'}, model, selection: {nodeIds: ['cta']}, objects: [node],
  }));
  for(const label of ['宽度','高度','横向位置','纵向位置','字号','文字颜色','背景颜色'])assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/文字内容|圆角|布局方式|更多属性|编辑范围/);
  assert.doesNotMatch(html, /ec-property-tabs|新建交互|元素状态|页面场景|JSON/);
});
