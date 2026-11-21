import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';

const require = createRequire(import.meta.url), React = require('react');
const bundle = await build({
  entryPoints: [new URL('./KnowledgeDocumentView.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{name: 'knowledge-reader-test', setup(build) {
    build.onLoad({filter: /\/ResourceView\.jsx$/}, () => ({contents: 'export default function ResourceView() {}'}));
    build.onLoad({filter: /\/common\.jsx$/}, () => ({contents: 'export function Button() {}'}));
  }}],
});

test('switching knowledge documents discards a late response from the previous file', async () => {
  let state = {loading: true}, effect;
  const react = {...React,
    useState(initial) {
      if (typeof initial === 'number') return [initial, () => {}];
      return [state, value => {state = typeof value === 'function' ? value(state) : value;}];
    },
    useEffect(callback) {effect = callback;},
    useRef(value) {return {current: value};},
    useImperativeHandle() {},
  };
  const module = {exports: {}};
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
  const requests = new Map();
  const api = (action, args) => {
    assert.equal(action, 'knowledge.document.get');
    return new Promise(resolve => requests.set(args.documentId, resolve));
  };
  const render = id => module.exports.default.render({api, knowledgeId: 'k-one', document: {id, name: `${id}.pdf`}, documents: []}, null);
  render('first');
  const cleanup = effect();
  cleanup();
  render('second');
  const finish = effect();
  requests.get('second')({originalUrl: '/second.pdf'});
  await new Promise(setImmediate);
  assert.equal(state.tab.id, 'second');
  requests.get('first')({originalUrl: '/first.pdf'});
  await new Promise(setImmediate);
  assert.equal(state.tab.id, 'second');
  assert.equal(state.tab.previewUrl, '/second.pdf');
  finish();
});
