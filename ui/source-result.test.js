import test from 'node:test';
import assert from 'node:assert/strict';
import {requireSavedSourceResult} from './source-result.js';
test('official authentication failure cannot be reported as saved source material',()=>{
  const failed={status:'connection-required',error:{code:'AUTH_REQUIRED',message:'Official MCP needs authentication',details:{status:401}}};
  assert.throws(()=>requireSavedSourceResult(failed),error=>error.code==='AUTH_REQUIRED'&&error.message===failed.error.message&&error.details.offlineImportAvailable===true);
  assert.throws(()=>requireSavedSourceResult({source:{id:'planned-only'}}),{code:'SOURCE_NOT_SAVED'});
  const saved={status:'captured',version:{id:'xv-saved'}};assert.equal(requireSavedSourceResult(saved),saved);
});
