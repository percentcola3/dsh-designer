import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingFormArgs} from './binding-form.js';
const context={projectId:'p',designId:'d',systems:[{id:'system',revision:4}]};
test('project default is a zero-or-one system and clearing the selector unbinds it',()=>{
  assert.deepEqual(bindingFormArgs({bindingScope:'project',systemId:'',bindingMode:'independent',version:4},context),{projectId:'p',scope:'project',systemId:null});
  assert.deepEqual(bindingFormArgs({bindingScope:'project',systemId:'system',bindingMode:'inherit',version:2},context),{projectId:'p',scope:'project',systemId:'system'});
});
test('design inherit and none carry no stale system/version and independent selection uses its ID',()=>{
  for(const mode of ['inherit','none'])assert.deepEqual(bindingFormArgs({bindingMode:mode,systemId:'system',version:'bad'},context).binding,{mode});
  assert.deepEqual(bindingFormArgs({bindingMode:'independent',systemId:'system',version:'1'},context).binding,{mode:'independent',systemId:'system'});
  assert.throws(()=>bindingFormArgs({bindingMode:'independent'},context),{code:'INVALID_BINDING'});
});
