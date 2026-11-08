import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingFormArgs} from './binding-form.js';
const context={projectId:'p',designId:'d',systems:[{id:'system',revision:4}]};
test('project default is a zero-or-one pinned system and clearing the selector unbinds it',()=>{
  assert.deepEqual(bindingFormArgs({bindingScope:'project',systemId:'',bindingMode:'independent',version:4},context),{projectId:'p',scope:'project',systemId:null,version:null});
  assert.deepEqual(bindingFormArgs({bindingScope:'project',systemId:'system',bindingMode:'inherit',version:2},context),{projectId:'p',scope:'project',systemId:'system',version:2});
});
test('design inherit and none carry no stale system/version while explicit versions never silently change',()=>{
  for(const mode of ['inherit','none'])assert.deepEqual(bindingFormArgs({bindingMode:mode,systemId:'system',version:'bad'},context).binding,{mode});
  assert.equal(bindingFormArgs({bindingMode:'independent',systemId:'system',version:'1'},context).binding.version,1);
  assert.equal(bindingFormArgs({bindingMode:'independent',systemId:'system',version:''},context).binding.version,4);
  assert.throws(()=>bindingFormArgs({bindingMode:'independent',systemId:'system',version:'oops'},context),{code:'INVALID_BINDING_VERSION'});
});
