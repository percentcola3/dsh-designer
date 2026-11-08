import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireProjectSession as acquire} from './ui/session-retention.js';
import {ExactSessionAgents} from './client-session.js';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Exercise the same acquisition helper used by the real Client, without DOM emulation.

test('persisted designer sessions refresh the Client catalog before retention',async()=>{
  const id='designer-p-example',catalog=new Set(),calls=[];
  const reference={ready:Promise.resolve({sessionId:id}),release(){}};
  const sessions={
    async refresh(){calls.push('refresh');catalog.add(id)},
    retain(target,options){calls.push('retain');if(!catalog.has(target))throw new Error('sessions.retain: unknown session '+target);assert.equal(options.source,'controllerOperation');return reference}
  };
  assert.equal(await acquire(sessions,id),reference);
  assert.deepEqual(calls,['refresh','retain']);
});

test('leaving a project during catalog refresh does not retain a stale session',async()=>{
  const controller=new AbortController();let retained=false;
  const sessions={async refresh(){controller.abort()},retain(){retained=true}};
  await assert.rejects(acquire(sessions,'designer-p-example',controller.signal),error=>error.name==='AbortError');
  assert.equal(retained,false);
});

test('catalog errors propagate without attempting unknown-session retention',async()=>{
  const failure=new Error('Connection unavailable');let retained=false;
  const sessions={async refresh(){throw failure},retain(){retained=true}};
  await assert.rejects(acquire(sessions,'designer-p-example'),error=>error===failure);
  assert.equal(retained,false);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const nativeAgent=id=>({id,session:{id,header:{cwd:'/native/project'},mode:'read-only'}});
function resolver(resolveAgent){const owner={ctx:{sessionController:{resolveAgent},agents:{get:()=>undefined}},lifetime:new AbortController(),disposed:false};return {owner,resolver:new ExactSessionAgents(owner,{retryDelays:[0,0,0]})};}

test('concurrent project preparation has one exact creation before Native publication',async()=>{
  const id='designer-compose-concurrent',gate=deferred(),expected=nativeAgent(id);let creates=0,lookups=0;
  const f=resolver(async target=>{assert.equal(target,id);lookups++;return {error:{code:'session/not-found'}};});
  const create=async signal=>{creates++;assert.equal(signal,f.owner.lifetime.signal);await gate.promise;return expected;};
  const first=f.resolver.resolve(id,{create}),second=f.resolver.resolve(id,{create});await Promise.resolve();await Promise.resolve();
  assert.equal(creates,1);gate.resolve();assert.equal(await first,expected);assert.equal(await second,expected);assert.equal(lookups,1);
});

test('a project preparation joins an already-running exact-ID lookup before creating once',async()=>{
  const id='designer-compose-lookup',expected=nativeAgent(id),gate=deferred();let creates=0;
  const f=resolver(async()=>{await gate.promise;return {error:{code:'session/not-found'}};});
  const lookup=f.resolver.resolve(id),prepare=f.resolver.resolve(id,{create:async()=>{creates++;return expected;}});
  gate.resolve();assert.equal(await lookup,expected);assert.equal(await prepare,expected);assert.equal(creates,1);
});

test('Native writer publication races resolve the same Session without creating or raising mode',async()=>{
  const id='designer-compose-saved',expected=nativeAgent(id);let calls=0,creates=0;
  const f=resolver(async target=>{assert.equal(target,id);return ++calls<3?{error:{code:'session/writer-held',details:{sessionId:id}}}:{agent:expected};});
  assert.equal(await f.resolver.resolve(id,{create:()=>{creates++;}}),expected);assert.equal(calls,3);assert.equal(creates,0);assert.equal(expected.session.mode,'read-only');
});

test('a create losing Native write ownership resolves the winner under the identical saved ID',async()=>{
  const id='designer-compose-race',expected=nativeAgent(id);let calls=0,creates=0;
  const f=resolver(async target=>{assert.equal(target,id);return ++calls===1?{error:{code:'session/not-found'}}:{agent:expected};});
  const error=Object.assign(Error('Native exact-ID collision'),{name:'SessionAlreadyExistsError',sessionId:id});
  assert.equal(await f.resolver.resolve(id,{create:()=>{creates++;throw error;}}),expected);assert.equal(creates,1);assert.equal(calls,2);
});

test('a same-ID create collision tolerates a temporarily missing observation before exact publication',async()=>{
  const id='designer-compose-publication-gap',expected=nativeAgent(id);let calls=0,creates=0;
  const f=resolver(async target=>{assert.equal(target,id);return ++calls<3?{error:{code:'session/not-found',details:{sessionId:id}}}:{agent:expected};});
  const ownership=Object.assign(Error('Native writer not yet published'),{name:'SessionAlreadyOwnedError',sessionId:id});
  assert.equal(await f.resolver.resolve(id,{create:()=>{creates++;throw ownership;}}),expected);assert.equal(creates,1);assert.equal(calls,3);
});

test('writer-held then not-found still waits for the same Agent and never starts creation',async()=>{
  const id='designer-compose-native-publication',expected=nativeAgent(id),ownership={code:'session/writer-held',details:{sessionId:id}};let calls=0,creates=0;
  const f=resolver(async()=>++calls===1?{error:ownership}:calls===2?{error:{code:'session/not-found',details:{sessionId:id}}}:{agent:expected});
  assert.equal(await f.resolver.resolve(id,{create:()=>{creates++;assert.fail('An observed writer must not be replaced');}}),expected);assert.equal(creates,0);assert.equal(calls,3);
});

test('missing observations after proven ownership remain bounded and preserve the original ownership error',async()=>{
  const id='designer-compose-owned-gap',ownership=Object.assign(Error('Original active writer'),{name:'SessionAlreadyOwnedError',sessionId:id});let calls=0,creates=0;
  const f=resolver(async()=>++calls===1?{error:ownership}:{error:{code:'session/not-found',details:{sessionId:id}}});
  await assert.rejects(f.resolver.resolve(id,{create:()=>{creates++;}}),error=>error===ownership);assert.equal(calls,4);assert.equal(creates,0);
});

test('proven ownership cannot hide later permission, transport or other-ID missing failures',async()=>{
  const id='designer-compose-race-refusal',ownership={code:'session/writer-held',details:{sessionId:id}};
  for(const error of [{code:'FS_SANDBOX_DENIED'},{code:'gateway/internal'},{code:'session/agent-busy'},{code:'session/not-found',details:{sessionId:'other'}}]){
    let calls=0,creates=0;const f=resolver(async()=>++calls===1?{error:ownership}:{error});
    await assert.rejects(f.resolver.resolve(id,{create:()=>{creates++;}}),value=>value===error);assert.equal(calls,2);assert.equal(creates,0);
  }
});

test('permission, ownership of another ID, unknown and persistence failures are not retried or recreated',async()=>{
  for(const error of [{code:'FS_SANDBOX_DENIED'},{code:'FS_SANDBOX_DENIED',message:'session "designer-compose-denied" already exists'},{code:'session/agent-busy'},{code:'gateway/internal'},{code:'session/writer-held',details:{sessionId:'other'}}]){
    let calls=0,creates=0;const f=resolver(async()=>{calls++;return {error};});
    await assert.rejects(f.resolver.resolve('designer-compose-denied',{create:()=>{creates++;}}),value=>value===error);assert.equal(calls,1);assert.equal(creates,0);
  }
  let calls=0;const denied=Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'}),f=resolver(async()=>{calls++;return {error:{code:'session/not-found'}};});
  await assert.rejects(f.resolver.resolve('designer-compose-create-denied',{create:()=>{throw denied;}}),value=>value===denied);assert.equal(calls,1);
});

test('a persistent writer-held failure stays bounded and never creates a replacement Session',async()=>{
  const error={code:'session/writer-held'};let calls=0,creates=0;const f=resolver(async()=>{calls++;return {error};});
  await assert.rejects(f.resolver.resolve('designer-compose-held',{create:()=>{creates++;}}),value=>value===error);assert.equal(calls,4);assert.equal(creates,0);
});

test('one cancelled waiter leaves shared Native preparation available to another waiter',async()=>{
  const id='designer-compose-wait',expected=nativeAgent(id),gate=deferred(),caller=new AbortController();let creates=0;
  const f=resolver(async()=>({error:{code:'session/not-found'}})),create=async signal=>{creates++;await gate.promise;assert.equal(signal.aborted,false);return expected;};
  const first=f.resolver.resolve(id,{create,signal:caller.signal}),second=f.resolver.resolve(id,{create});const rejected=assert.rejects(first,{name:'AbortError'});
  caller.abort();await rejected;gate.resolve();assert.equal(await second,expected);assert.equal(creates,1);
});

test('service disposal stops ownership retry without creating or replacing the saved identity',async()=>{
  const id='designer-compose-stopping',error={code:'session/writer-held'};let calls=0,creates=0;
  const f=resolver(async()=>{calls++;f.owner.lifetime.abort();return {error};});
  await assert.rejects(f.resolver.resolve(id,{create:()=>{creates++;}}),{name:'AbortError'});assert.equal(calls,1);assert.equal(creates,0);
});

test('Native resolution rejects another Session identity without accepting its permissions',async()=>{
  const f=resolver(async()=>({agent:nativeAgent('other')}));await assert.rejects(f.resolver.resolve('designer-compose-original'),{code:'COMPOSER_SESSION_INVALID'});
});

test('installed Native persistence enforces one writer and Designer rejoins its exact publication',t=>{
  const resources=process.env.DSH_APP_RESOURCES||'/Applications/DeepSeek Harness.app/Contents/Resources',runtime=path.resolve(resources,'../MacOS/DeepSeek Harness');
  if(!existsSync(runtime)||!existsSync(path.join(resources,'app.asar'))){t.skip('Installed Native runtime unavailable');return;}
  const moduleURL=name=>pathToFileURL(path.join(resources,'app.asar/dsh/node_modules/@deepseek-ai',name,'lib/index.js')).href;
  const script=`
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,mkdir,realpath,rm} from 'node:fs/promises';
import {Context} from ${JSON.stringify(moduleURL('cordis'))};
import * as persistencePlugin from ${JSON.stringify(moduleURL('dsh-session-persistence-jsonl'))};
import {SessionAlreadyOwnedError} from ${JSON.stringify(moduleURL('dsh-session-persistence'))};
import {ExactSessionAgents} from ${JSON.stringify(new URL('./client-session.js',import.meta.url).href)};
const base=${JSON.stringify(path.resolve(import.meta.dirname,'.build/designer-home-session-qa'))};await mkdir(base,{recursive:true});
const root=await mkdtemp(path.join(base,'native-writer-contract-')),ctx=new Context();let provider,handle;
try{
 provider=ctx.plugin(persistencePlugin,{root,compression:'none'});await provider.await();
 const persistence=ctx.get('sessionPersistence');assert.ok(persistence);
 const id='designer-compose-native-contract',header={version:4,id,createdAt:1,cwd:root,isSeeded:false};
 handle=await persistence.create(header);await handle.flush();
 await assert.rejects(persistence.open(id,'write'),error=>error instanceof SessionAlreadyOwnedError&&error.sessionId===id);
 const read=await persistence.open(id,'read');assert.equal(read.header.id,id);await read.close();
 let attempts=0,creates=0,published=false;const expected={id,session:{id,header,mode:'read-only'}};
 const owner={lifetime:new AbortController(),ctx:{sessionController:{async resolveAgent(target){assert.equal(target,id);attempts++;if(attempts===2){published=true;return {error:{code:'session/not-found',details:{sessionId:id}}};}if(published)return {agent:expected};try{await persistence.open(id,'write');assert.fail('A second writer must never open');}catch(error){assert.ok(error instanceof SessionAlreadyOwnedError);throw error;}}}}};
 const resolver=new ExactSessionAgents(owner,{retryDelays:[0,0]});
 assert.equal(await resolver.resolve(id,{create:()=>{creates++;assert.fail('A new Session must never be created');}}),expected);
 assert.equal(attempts,3);assert.equal(creates,0);assert.equal(expected.session.mode,'read-only');
 await assert.rejects(persistence.open(id,'write'),{name:'SessionAlreadyOwnedError'});
 await handle.close();handle=null;const reopened=await persistence.open(id,'write');assert.equal(reopened.header.id,id);await reopened.close();
}finally{
 await handle?.close();await provider?.dispose();assert.equal(path.dirname(root),base);assert.equal(await realpath(root),root);await rm(root,{recursive:true,force:true});
}
`;
  const result=spawnSync(runtime,['--input-type=module'],{input:script,encoding:'utf8',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:20000,maxBuffer:1024*1024});
  assert.ifError(result.error);assert.equal(result.signal,null,result.stderr);assert.equal(result.status,0,result.stderr||result.stdout);
});
