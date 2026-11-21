import test from 'node:test';
import assert from 'node:assert/strict';
import {labelSelection,selectionChips,selectionLetter,removeSelectionElement} from './selection-labels.js';
import {selectionForSubmission} from '../ui/target-state.js';

const picked=ids=>({pageId:'page',nodeIds:ids,objects:ids.map(id=>({id,outerHTML:`<div>${id}</div>`}))});

test('canvas and composer share letters, including selections saved before labels existed',()=>{
  const legacy=picked(['one','two','three']);
  assert.deepEqual(selectionChips(legacy).map(chip=>chip.label),['A','B','C']);
  assert.equal(legacy.labels,undefined);
  assert.equal(selectionLetter(25),'Z');
  assert.equal(selectionLetter(26),'AA');
});

test('removing a chip removes its exact selection and preserves other letters and complete evidence',()=>{
  const selection=labelSelection(picked(['one','two','three']));
  const removed=removeSelectionElement(selection,'two');
  assert.deepEqual(removed.nodeIds,['one','three']);
  assert.deepEqual(selectionChips(removed).map(chip=>chip.label),['A','C']);
  assert.deepEqual(removed.objects.map(object=>object.id),['one','three']);
  const measured=labelSelection(picked(['one','three']),removed);
  const submitted=selectionForSubmission(measured);
  assert.deepEqual(submitted.objects.map(object=>object.selectionLabel),['A','C']);
  assert.equal(submitted.objects[1].outerHTML,'<div>three</div>');
  assert.deepEqual(labelSelection(picked(['one','three','four']),removed).labels,{one:'A',three:'C',four:'D'});
  assert.deepEqual(selection.nodeIds,['one','two','three']);
});

test('last chip clears selection and another page starts a fresh sequence',()=>{
  assert.equal(removeSelectionElement(labelSelection(picked(['one'])),'one'),null);
  assert.equal(labelSelection({...picked(['two']),pageId:'another'},labelSelection(picked(['one']))).labels.two,'A');
  const empty=labelSelection(picked([]),labelSelection(picked(['one'])));
  assert.equal(labelSelection(picked(['two']),empty).labels.two,'A');
});

test('unmapped reference-only picks retain a removable chip',()=>{
  const selection=labelSelection({pageId:'page',nodeIds:[],referenceOnly:true,objects:[{tag:'div',outerHTML:'<div />'}]});
  const [chip]=selectionChips(selection);
  assert.equal(chip.label,'A');
  assert.equal(removeSelectionElement(selection,chip.id),null);
});
