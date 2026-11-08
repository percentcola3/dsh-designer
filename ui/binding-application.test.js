import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingApplicationState,bindingRetryArgs,prepareBindingScope} from './binding-application.js';

test('application preview freezes only explicitly selected live pages or actual selected objects',()=>{
 const project={id:'p',revision:4},design={id:'d',name:'Design',pageIds:['b','a','foreign']};
 const pages=[{id:'a',name:'A',designId:'d'},{id:'b',name:'B',designId:'d'},{id:'gone',name:'Gone',designId:'d',deletedAt:'date'},{id:'foreign',name:'Other',designId:'other'}];
 const chosen=prepareBindingScope(project,design,pages,'pages',['a','foreign','gone']);
 assert.deepEqual(chosen.args.pageIds,['a']);assert.deepEqual(chosen.pageNames,['A']);assert.equal(chosen.args.expectedRevision,4);
 const selection={pageId:'b',nodeIds:['n','n']},frozen=prepareBindingScope(project,design,pages,'selection',[],selection);
 selection.nodeIds.push('later');assert.deepEqual(frozen.args.nodeIds,['n']);assert.deepEqual(frozen.args.pageIds,['b']);assert.equal(frozen.args.scope,'selection');
 assert.deepEqual(prepareBindingScope(project,design,pages,'design').args.pageIds,['b','a']);
 assert.throws(()=>prepareBindingScope(project,design,pages,'pages',[]),{code:'TARGET_REQUIRED'});
 assert.throws(()=>prepareBindingScope(project,design,pages,'selection',[],{pageId:'foreign',nodeIds:['n']}),{code:'TARGET_REQUIRED'});
});

test('pending and running application records never mean applied or visually verified',()=>{
 for(const status of ['pending','running','partial']){
  const state=bindingApplicationState({status,savedPageIds:status==='partial'?['a']:[]});
  assert.equal(state.applied,false);assert.equal(state.visualLabel,'待核对');
 }
 const saved=bindingApplicationState({status:'applied',savedPageIds:['a','a','b'],visualReview:'pending'});
 assert.equal(saved.applied,true);assert.deepEqual(saved.savedPageIds,['a','b']);assert.equal(saved.visualLabel,'待核对');
 assert.equal(bindingApplicationState({}).applied,false);
});

test('busy retry reuses pending records while preserving the original exact write scope',()=>{
 const original={projectId:'p',expectedRevision:4,designIds:['d'],pageIds:['a'],nodeIds:['n']};
 const error={code:'AI_BUSY',details:{projectRevision:5,pendingApplications:['r'],retry:{action:'binding.apply',applicationIds:['r','r']}}};
 const retry=bindingRetryArgs(original,error,6);
 assert.equal(retry.expectedRevision,6);assert.deepEqual(retry.applicationIds,['r']);assert.deepEqual(retry.designIds,['d']);assert.deepEqual(retry.pageIds,['a']);assert.deepEqual(retry.nodeIds,['n']);
 assert.equal(original.expectedRevision,4);assert.equal(original.applicationIds,undefined);retry.pageIds.push('b');assert.deepEqual(original.pageIds,['a']);
});

test('an unrelated error or different suggested action cannot become a binding retry',()=>{
 assert.equal(bindingRetryArgs({}, {code:'AI_BUSY',details:{retry:{action:'project.delete'}}}),null);
 assert.equal(bindingRetryArgs({}, {code:'VERSION_CONFLICT',details:{retry:{action:'binding.apply'}}}),null);
});
