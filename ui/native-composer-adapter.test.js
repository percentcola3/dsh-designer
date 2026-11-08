import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeNativeComposerAdapter, useNativeComposerAccess,
  createDesignerInputActions, NATIVE_COMPOSER_CAPABILITIES,
} from './native-composer-adapter.js';

function fixture() {
  const calls = [];
  const permissionSource = {getSnapshot: () => ({currentValue: 'workspace-write'})};
  let snapshot = {openState: 'open', subagent: null};
  const binding = {session: {
    getSnapshot: () => snapshot,
    projections: {faceOf: key => {calls.push(['projection', key]); return permissionSource;}},
  }};
  const directory = {store: {getSnapshot: () => ({groups: [], current: null})},
    load() {calls.push(['load']);}, select(selection) {calls.push(['select', selection]);}};
  let current = binding;
  const ctx = {
    sessions: {
      binding: id => id === 'real-session' ? current : undefined,
      retain(id, options) {calls.push(['retain', id, options]);
        let released = false;
        return {sessionId: id, ready: Promise.resolve(binding),
          get binding() {if (released) throw new Error('Session reference is released'); return binding;},
          release() {released = true; calls.push(['release']);}};},
      subagentAddress: () => undefined,
    },
    uiSession: {whenAccess(...args) {calls.push(['whenAccess', ...args]); return 'disposer';}},
    modelDirectories: {directoryFor(id) {calls.push(['directory', id]); return directory;}},
  };
  return {ctx, calls, binding, directory, permissionSource,
    setSnapshot(value) {snapshot = value;}, expire() {current = undefined;}};
}

test('adapter creation has no RPC, slot registration or Session side effects', () => {
  const f = fixture();
  const adapter = makeNativeComposerAdapter(f.ctx);
  assert.deepEqual(f.calls, []);
  assert.equal(adapter.capabilities.nativeControls, false);
  assert.equal(NATIVE_COMPOSER_CAPABILITIES.nativeVoiceControl, false);
  assert.equal(adapter.modelDirectoryFor('real-session'), f.directory);
  assert.equal(adapter.permissionProjectionFor('real-session'), f.permissionSource);
  assert.equal(adapter.sessionFor('real-session'), f.binding.session);
  assert.throws(() => adapter.modelDirectoryFor('fake'), /not retained/);
  assert.throws(() => adapter.retainSession(''), /real prepared/);
});

test('retention uses exact Session ownership and checks resolved open failures', async () => {
  const f = fixture();
  const adapter = makeNativeComposerAdapter(f.ctx);
  const signal = new AbortController().signal;
  const ref = adapter.retainSession('real-session', {signal});
  assert.deepEqual(f.calls[0], ['retain', 'real-session', {source: 'designer-composer', signal}]);
  assert.equal(await adapter.readySession(ref), f.binding);
  const released = adapter.retainSession('real-session');
  released.release(); // binding remains alive through another consumer
  await assert.rejects(adapter.readySession(released), /released/);
  f.setSnapshot({openState: 'error', openError: {message: 'history refused'}});
  await assert.rejects(adapter.readySession(ref), /history refused/);
  f.expire();
  await assert.rejects(adapter.readySession(ref), /expired generation/);
});

test('model service is borrowed and rejects subagents and missing capabilities', () => {
  const f = fixture();
  f.setSnapshot({openState: 'open', subagent: {address: {}}});
  assert.throws(() => makeNativeComposerAdapter(f.ctx).modelDirectoryFor('real-session'), /ordinary Session/);
  f.setSnapshot({openState: 'open', subagent: null});
  delete f.ctx.modelDirectories;
  const adapter = makeNativeComposerAdapter(f.ctx);
  assert.equal(adapter.capabilities.sessionModelDirectory, false);
  assert.throws(() => adapter.modelDirectoryFor('real-session'), /unavailable/);
});

test('access uses official addressed root hooks, never an unrelated current Chat', () => {
  const calls = [];
  const useSessionAccess = (key, action) => {
    calls.push([key, action]);
    return typeof key === 'function' ? key() : action === 'fileUploads/upload';
  };
  const access = useNativeComposerAccess({sessionId: 'real-session', useSessionAccess});
  assert.equal(access.canUpload, true);
  assert.equal(access.canPrompt, false);
  assert.equal(access.canCancel, false);
  assert.deepEqual(calls, [
    ['real-session', 'session/prompt'], ['real-session', 'session/cancel'],
    ['real-session', 'fileUploads/upload'],
  ]);
  calls.length = 0;
  const absent = useNativeComposerAccess({sessionId: undefined, useSessionAccess});
  assert.equal(calls.length, 3);
  assert.equal(absent.prompt, undefined);
  assert.equal(absent.canUpload, false);
  assert.ok(calls.every(([key, action]) => typeof key === 'function' && action === undefined));
});

test('imperative access delegates to the Session domain service', () => {
  const f = fixture();
  const callback = () => {};
  assert.equal(makeNativeComposerAdapter(f.ctx).whenAccess('real-session', 'fileUploads/upload', callback), 'disposer');
  assert.deepEqual(f.calls, [['whenAccess', 'real-session', 'fileUploads/upload', callback]]);
});

function draftFixture() {
  let state = {text: 'before after', revision: 1, sessionId: 'real-session', start: 7, end: 12};
  const edits = [];
  const bridge = createDesignerInputActions({read: () => state, replace(edit) {
    edits.push(edit);
    state = {...state, text: state.text.slice(0, edit.start) + edit.text + state.text.slice(edit.end), revision: state.revision + 1};
    return true;
  }});
  return {...bridge, edits, read: () => state, change: patch => {state = {...state, ...patch};}};
}

test('text insertion keeps the captured range and applies only once', () => {
  const f = draftFixture();
  const span = f.inputActions.captureInsertion();
  f.change({start: 0, end: 0});
  assert.equal(f.inputActions.insertText('speech', span), true);
  assert.equal(f.read().text, 'before speech');
  assert.equal(f.edits.length, 1);
  assert.equal(f.inputActions.insertText('again', span), false);
});

test('revision, Session, lock, composition, owner and teardown guard late transcripts', () => {
  for (const patch of [
    {revision: 3}, // includes edit + undo with the same text (ABA)
    {text: 'other'}, {sessionId: 'other-session'}, {locked: true}, {composing: true},
  ]) {
    const f = draftFixture();
    const span = f.inputActions.captureInsertion();
    f.change(patch);
    assert.equal(f.inputActions.insertText('speech', span), false);
    assert.equal(f.edits.length, 0);
  }
  const f = draftFixture();
  assert.equal(f.inputActions.insertText('foreign', {start: 0, end: 0, draftRev: 1}), false);
  const span = f.inputActions.captureInsertion();
  f.dispose();
  assert.equal(f.inputActions.insertText('late', span), false);
  assert.equal(f.inputActions.captureInsertion(), undefined);
});
