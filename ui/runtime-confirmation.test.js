import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeRuntimeAction} from './runtime-confirmation.js';

test('confirmations retain the actual source, selected paths and observed HEAD',()=>{
  const paths=['src/a.js'],value={action:'git.commit',args:{paths,message:'Only A'},description:'Commit source A'};
  const context={projectId:'p-a',sourceId:'r-a',sourceName:'Source A',head:'head-a'};
  const frozen=freezeRuntimeAction(value,context);
  paths.push('src/b.js');context.sourceId='r-b';context.head='head-b';
  assert.equal(frozen.args.sourceId,'r-a');assert.equal(frozen.args.projectId,'p-a');
  assert.equal(frozen.args.expectedHead,'head-a');assert.deepEqual(frozen.args.paths,['src/a.js']);
  assert.equal(frozen.sourceName,'Source A');
  assert.throws(()=>freezeRuntimeAction(value,{projectId:'p-a'}),{code:'SOURCE_REQUIRED'});
});
