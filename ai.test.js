import test from 'node:test';
import assert from 'node:assert/strict';
import {AIWorkbench} from './ai-workbench.js';

const sessionId='designer-lifecycle-test',requestId='exact-request';
function fixture(){
  const events=[{type:'turn/start',seq:1,data:{turn:4}},{type:'user/message',seq:2,data:{source:{kind:'user',rpcId:requestId}}}];
  let state={running:false,queue:[]};
  const agent={id:sessionId,session:{snapshotEvents:()=>events.slice()}},ctx={agents:{get:()=>agent},sessionController:{async state(){return state;}}};
  return {events,ctx,ai:new AIWorkbench({ctx}),setState:value=>state=value,request:{sessionId,requestId}};
}

test('a turn ending during the status read is observed from the settled native snapshot',async()=>{
  const f=fixture();
  f.ctx.sessionController.state=async()=>{f.events.push({type:'turn/end',seq:3,data:{turn:4,reason:{kind:'completed'}}});return {running:false,queue:[]};};
  assert.equal((await f.ai.requestLifecycle(f.request)).generation,'completed');
});

test('native abort retains its exact cause instead of assuming a Stop-button action',async()=>{
  const f=fixture();
  for(const cause of [{kind:'user'},{kind:'disposed'},{kind:'parent'},{kind:'hook',reason:'Lifecycle policy stopped this turn'}]){
    f.events[2]={type:'turn/end',seq:3,data:{turn:4,reason:{kind:'aborted',reason:cause}}};
    const value=await f.ai.requestLifecycle(f.request);
    assert.equal(value.generation,'cancelled');assert.deepEqual(value.terminalReason,{kind:'aborted',reason:cause});
  }
});

test('missing or failed native observations remain unknown and never imply cancellation or success',async()=>{
  const f=fixture();
  assert.equal((await f.ai.requestLifecycle(f.request)).generation,'unknown');
  f.events.push({type:'turn/end',seq:3,data:{turn:99,reason:{kind:'aborted',reason:{kind:'user'}}}});
  assert.equal((await f.ai.requestLifecycle(f.request)).generation,'unknown');
  f.ctx.sessionController.state=async()=>{throw Object.assign(new Error('Native unavailable'),{code:'SESSION_UNAVAILABLE'});};
  const result=await f.ai.requestLifecycle(f.request);assert.equal(result.generation,'unknown');assert.equal(result.reason,'native-log-unavailable');assert.equal(result.error.code,'SESSION_UNAVAILABLE');
});

test('a cancelled request can be followed by a separate exact request in the same Session',async()=>{
  const f=fixture();f.events.push({type:'turn/end',seq:3,data:{turn:4,reason:{kind:'aborted',reason:{kind:'disposed'}}}},{type:'turn/start',seq:4,data:{turn:5}},{type:'user/message',seq:5,data:{source:{kind:'user',rpcId:'new-request'}}},{type:'turn/end',seq:6,data:{turn:5,reason:{kind:'completed'}}});
  assert.equal((await f.ai.requestLifecycle(f.request)).generation,'cancelled');
  assert.equal((await f.ai.requestLifecycle({...f.request,requestId:'new-request'})).generation,'completed');
});
