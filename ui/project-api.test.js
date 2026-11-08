import test from 'node:test';
import assert from 'node:assert/strict';
import {bindProjectApi} from './project-api.js';

test('the first project request overrides the transport remembered Chat context',async()=>{
  const calls=[],api=async(action,args)=>{calls.push({action,args:{contextSessionId:'unrelated-chat',...args}});return {version:'saved'};};
  const project=bindProjectApi(api,{projectId:'p-one',sessionId:'designer-p-one'});
  assert.deepEqual(await project('draft.save',{resourceId:'ai-compose',expectedVersion:null,draft:{prompt:'Design'}}),{version:'saved'});
  assert.equal(calls.length,1);assert.equal(calls[0].args.contextSessionId,'designer-p-one');assert.equal(calls[0].args.projectId,'p-one');
});

test('project calls retain their exact native context and never retry a denied write',async()=>{
  const calls=[],denied=Object.assign(new Error('Native policy refused the draft'),{code:'FS_SANDBOX_DENIED'});
  const project=bindProjectApi(async(action,args)=>{calls.push({action,args});throw denied;},{projectId:'p-one',sessionId:'designer-p-one'});
  await assert.rejects(project('draft.save',{contextSessionId:'designer-p-one',draft:{}}),error=>error===denied);
  assert.equal(calls.length,1);assert.equal(calls[0].args.contextSessionId,'designer-p-one');
});

test('missing and cross-project contexts fail before transport rather than using a remembered identity',()=>{
  let calls=0;const project=bindProjectApi(()=>{calls++;},{projectId:'p-one',sessionId:'designer-p-one'});
  for(const contextSessionId of [undefined,null,'','unrelated-chat'])assert.throws(()=>project('draft.save',{contextSessionId}),{code:'PROJECT_SCOPE'});
  assert.throws(()=>project('draft.save',{projectId:'p-two'}),{code:'PROJECT_SCOPE'});
  assert.throws(()=>bindProjectApi(()=>{calls++;},{projectId:'p-one'})('draft.save'),{code:'PROJECT_SESSION_REQUIRED'});
  assert.equal(calls,0);
});

test('captured project APIs keep queued drafts and uploads with their originating Session',async()=>{
  const calls=[],api=async(action,args)=>calls.push({action,args});api.upload=async(file,args)=>calls.push({file,args});
  const first=bindProjectApi(api,{projectId:'p-one',sessionId:'designer-compose-adopted'}),second=bindProjectApi(api,{projectId:'p-two',sessionId:'designer-p-two'});
  await second('draft.save',{resourceId:'editor',draft:{}});await first('draft.save',{resourceId:'ai-compose',draft:{}});await first.upload('image',{purpose:'attachment'});
  assert.deepEqual(calls.map(call=>[call.args.projectId,call.args.contextSessionId]),[['p-two','designer-p-two'],['p-one','designer-compose-adopted'],['p-one','designer-compose-adopted']]);
});
