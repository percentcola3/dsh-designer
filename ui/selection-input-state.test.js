import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionTokenRanges, reconcileSelectionInput} from './selection-input-state.js';
import {selectionColor} from '../editor/selection-labels.js';

const chips = [{id: 'one', label: 'A'}, {id: 'two', label: 'B'}, {id: 'three', label: 'C'}];

test('inline chips retain surrounding text and cursor insertion supports Chinese and emoji', () => {
  const initial = '请把 😀 的颜色改一下';
  const at = initial.indexOf(' 的');
  const result = reconcileSelectionInput(initial, [], chips.slice(0, 2), at);
  assert.equal(result.value, '请把 😀【A】【B】 的颜色改一下');
  assert.equal(result.caret, at + 6);
  assert.deepEqual(selectionTokenRanges(result.value, chips).map(range => range.chip.label), ['A', 'B']);
});

test('canvas deselection removes only its chip while other chips keep their inline positions', () => {
  const value = '将【A】加宽，缩小【B】，保留【C】。';
  const result = reconcileSelectionInput(value, chips, [chips[0], chips[2]], value.length);
  assert.equal(result.value, '将【A】加宽，缩小，保留【C】。');
  assert.equal(result.caret, value.length - 3);
});

test('keyboard chip removal stays removed while the canvas update is pending', () => {
  const value = '前面【A】后面';
  const result = reconcileSelectionInput(value, chips, chips, 2, new Set(['two', 'three']));
  assert.equal(result.value, value);
  assert.equal(result.caret, 2);
});

test('cleared drafts can start another instruction with the current selection and colors remain stable', () => {
  assert.equal(reconcileSelectionInput('', chips, chips, 0).value, '【A】【B】【C】');
  assert.equal(selectionColor('A'), selectionColor('A'));
  assert.notEqual(selectionColor('A'), selectionColor('B'));
  assert.notEqual(selectionColor('B'), selectionColor('C'));
});
