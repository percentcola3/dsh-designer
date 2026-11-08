import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareComposerSession,waitForComposerRetry} from './session-prepare.js';
const rejection=code=>Object.assign(new Error(code),{code});
test('a service handover retries the formal prepare request and returns only a real result',async()=>{
 let calls=0;const waits=[],args={projectId:'p-current'};
 const result=await prepareComposerSession(async(action,input)=>{assert.equal(action,'composer.prepare');assert.equal(input,args);if(++calls<3)throw rejection('UNKNOWN_ACTION');return {sessionId:'native-real'};},args,{wait:async n=>waits.push(n)});
 assert.deepEqual(result,{sessionId:'native-real'});assert.equal(calls,3);assert.deepEqual(waits,[200,600]);
});
test('an unavailable service stops after a bounded retry window',async()=>{
 let calls=0;const waits=[];
 await assert.rejects(prepareComposerSession(async()=>{calls++;throw rejection('SERVICE_DISPOSED');},{},{wait:async n=>waits.push(n)}),{code:'SERVICE_DISPOSED'});
 assert.equal(calls,4);assert.deepEqual(waits,[200,600,1200]);
});
test('ownership, permission and identity failures never retry or fall back to another Session',async()=>{
 for(const code of ['USER_ONLY','FS_SANDBOX_DENIED','COMPOSER_ROOT_CHANGED','COMPOSER_SESSION_NOT_FOUND']){
  let calls=0;await assert.rejects(prepareComposerSession(async()=>{calls++;throw rejection(code);},{},{wait:async()=>assert.fail('must not retry')}),{code});assert.equal(calls,1);
 }
});
test('teardown during backoff prevents a late Session preparation',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(prepareComposerSession(async()=>{calls++;throw rejection('UNKNOWN_ACTION');},{},{signal:controller.signal,wait:async()=>controller.abort()}),{name:'AbortError'});assert.equal(calls,1);
});
test('a real scheduled retry is cancelled promptly by its owner',async()=>{
 const controller=new AbortController(),waiting=waitForComposerRetry(1200,controller.signal);controller.abort();await assert.rejects(waiting,{name:'AbortError'});
});
