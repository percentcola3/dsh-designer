import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {editorPosition} from './editor-location.js';
import {compactState} from './state-snapshot.js';

test('source-map line and column navigation clamps to the current real editor document',()=>{
  const state=EditorState.create({doc:'first\n你好🙂\nlast'});
  const position=editorPosition(state.doc,{line:2,column:3});
  const transaction=state.update({selection:{anchor:position}});
  assert.equal(transaction.state.selection.main.head,9);
  assert.equal(transaction.docChanged,false);assert.equal(transaction.state.doc,state.doc);
  assert.equal(editorPosition(state.doc,{line:2,column:999}),10);
  assert.equal(editorPosition(state.doc,{line:999,column:999}),state.doc.length);
  assert.equal(editorPosition(state.doc,{line:-1,column:-2}),0);
});

test('one-shot editor navigation is excluded from saved workspace state',()=>{
  const saved=compactState({tabs:[{id:'file',editorNavigation:{id:'command',line:4},view:{selection:{anchor:2,head:2}}}]});
  assert.equal(saved.tabs[0].editorNavigation,undefined);assert.equal(saved.tabs[0].view.selection.anchor,2);
});
