import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild-wasm';
import {aiDockStyles} from './ai-dock-styles.js';

const require = createRequire(import.meta.url);
const React = require('react');
const effects = [];
const result = await build({
  entryPoints: [new URL('./NativeConversation.jsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
});
const module = {exports: {}};
const react = {
  ...React,
  useMemo: factory => factory(),
  useLayoutEffect: effect => effects.push(effect()),
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
new Function('require', 'module', 'exports', result.outputFiles[0].text)(name => name === 'react' ? react : require(name), module, module.exports);
const {default: NativeConversation, selectComposerSeat, DesignerComposerSeat} = module.exports;

test('embedded conversation delegates the complete body to the native factory and releases only its composer seat', () => {
  effects.length = 0;
  const composer = React.createElement('textarea', {value: '保持设计草稿', readOnly: true});
  const rendered = React.createElement('section', {'data-native': true});
  let owner, disposed = false;
  const element = NativeConversation({sessionId: 'project-session', composer, children: undefined,
    registerComposer: seat => {owner = seat; return () => {disposed = true;};},
    renderFactorySlot: (name, props, options) => {
      assert.deepEqual(options.slots.views({renderSlot:(slot,owner)=>[slot,owner]}), ['conversation.session',{view:'chat'}]);
      assert.equal(name, 'conversation.content');
      assert.deepEqual(props, {variant: 'embedded', phase: 'active', hero: false});
      return rendered;
    },
  });
  assert.equal(element.props.children.props.children, rendered);
  assert.equal(element.props.children.props.value, composer);
  assert.equal(owner.sessionId, 'project-session');
  for (const dispose of effects) dispose?.();
  assert.equal(disposed, true);
});

test('approvals, questions and plan reviews always retain the native composer chain', () => {
  const seat = {sessionId:'project-session'};
  assert.equal(selectComposerSeat(seat, {sessionId: 'project-session'}), seat);
  assert.equal(selectComposerSeat(seat, {sessionId: 'other-session'}), null);
  assert.equal(selectComposerSeat(seat, {}), null);
  for (const kind of ['approval', 'question', 'plan-review']) {
    const pendingInteraction = {kind, key: `${kind}-pending`};
    const owner = {sessionId: 'project-session', pendingInteraction};
    assert.equal(selectComposerSeat(seat, owner), null);
    assert.equal(owner.pendingInteraction, pendingInteraction);
  }
});

test('native composer descendants receive the current draft and chips through React context', () => {
  const {renderToStaticMarkup}=require('react-dom/server');
  for (const draft of ['@文件','更新后的草稿']) {
    const element=NativeConversation({sessionId:'project-session',
      composer:React.createElement('textarea',{defaultValue:draft}), children:undefined,
      registerComposer:()=>()=>{},
      renderFactorySlot:()=>React.createElement('section',null,React.createElement(DesignerComposerSeat)),
    });
    assert.match(renderToStaticMarkup(element),new RegExp(`<textarea>${draft}</textarea>`));
  }
});

test('compact conversation retains native activity, results and interactions in a bounded viewport', () => {
  // A collapsed-mode display:none on conversation.session hid every native
  // message and tool result, even after completion. Size changes must keep it.
  for (const rule of aiDockStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, declarations] = rule;
    if (/conversation|composer-seat/.test(selector) && !selector.includes('[hidden]')) {
      assert.doesNotMatch(declarations, /display\s*:\s*none|visibility\s*:\s*hidden/);
    }
    if (selector.includes('data-conversation-expanded')) {
      assert.match(declarations, /^height:min\(560px,/);
      assert.doesNotMatch(selector, /conversation\.session|composer-seat/);
    }
  }
  assert.doesNotMatch(aiDockStyles, /data-history-open|overflow:visible/);
  assert.match(aiDockStyles, /\.wb-ai\.wb-ai-dock\{[^}]*height:min\(360px,[^}]*max-height:100%/);
  assert.match(aiDockStyles, /\.wb-ai-dock \.wb-ai-conversation\{flex:1 1 0;min-height:0\}/);
});
