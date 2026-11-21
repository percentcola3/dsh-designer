import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url), React = require('react');
const result = await build({
  entryPoints: [new URL('./Properties.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
});
const module = {exports: {}};
const react = {
  ...React, useRef: value => ({current: value}), useState: value => [value, () => {}],
  useCallback: callback => callback, useEffect() {},
};
new Function('require', 'module', 'exports', result.outputFiles[0].text)(
  name => name === 'react' ? react : require(name), module, module.exports,
);
const {default: SourceProperties} = module.exports;

function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}

function fixture(sourceInstanceCount = 1, apply = async () => ({})) {
  const calls = [];
  const object = {nodeId: 'runtime-heading', sourceNodeId: 'source-heading', sourceInstanceCount,
    sourceLocator: {id: 'source-heading', path: 'Page.vue'}, tag: 'h1', text: 'Before', styles: {}};
  const panel = SourceProperties({page: {id: 'page'}, model: {artifact: {kind: 'vue', entry: 'Page.vue'}},
    selection: {pageId: 'page', nodeIds: [object.nodeId]}, objects: [object], side: 'left', projectRevision: 7,
    onApply: input => {calls.push(input); return apply(input);},
  });
  const controls = elements(panel);
  return {panel,calls,width:controls.find(node=>node.props.property==='width')};
}

test('editing a source element preserves its original identity and revision',async()=>{
  const f=fixture();
  f.width.props.onValue('120');
  await f.width.props.onCommit();
  assert.equal(f.panel.props['data-side'],'left');
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].expectedRevision,7);
  assert.equal(f.calls[0].selection.objects[0].sourceNodeId,'source-heading');
  assert.deepEqual(f.calls[0].operations,[{type:'style',nodeIds:['runtime-heading'],styles:{width:'120px'},scope:'instance'}]);
});

test('the inspector leaves shared-source confirmation to the source edit handler',async()=>{
  const f=fixture(3);
  f.width.props.onValue('120');await f.width.props.onCommit();
  assert.equal(f.calls[0].sourceTemplateConfirmed,undefined);
  assert.equal(f.calls[0].selection.objects[0].sourceInstanceCount,3);
});

test('a failed save retains the editable draft for retry',async()=>{
  const f=fixture(1,async()=>{throw Error('Write failed');});
  f.width.props.onValue('120');await f.width.props.onCommit();await f.width.props.onCommit();
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.calls[0],f.calls[1]);
});
