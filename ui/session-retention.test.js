import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireProjectSession,readyProjectSession} from './session-retention.js';

function fixture(){
  let releases=0,cancels=0,opens=0;
  const binding={session:{getSnapshot:()=>({openState:'open'})}},reference={sessionId:'same-session',binding,ready:Promise.resolve(binding),release(){releases++;this.binding=undefined;}};
  const sessions={async refresh(){},retain(){opens++;return reference;},binding:()=>binding,cancel(){cancels++;}};
  return {binding,reference,sessions,get releases(){return releases;},get cancels(){return cancels;},get opens(){return opens;}};
}

test('ready resolves only to the exact live ownership generation',async()=>{
  const f=fixture();assert.equal(await readyProjectSession(await acquireProjectSession(f.sessions,'same-session'),f.sessions),f.binding);assert.equal(f.releases,0);
  f.sessions.binding=()=>({session:{}});
  await assert.rejects(readyProjectSession(f.reference,f.sessions),/expired generation/);assert.equal(f.releases,1);assert.equal(f.cancels,0);
});

test('a resolved native open failure is surfaced and releases only its UI reference',async()=>{
  const f=fixture(),failure=new Error('Native history opening failed');f.binding.session.getSnapshot=()=>({openState:'error',openError:failure});
  await assert.rejects(readyProjectSession(f.reference,f.sessions),error=>error===failure);assert.equal(f.releases,1);assert.equal(f.cancels,0);
});

test('navigation during a ready wait cannot revoke another observer or cancel native work',async()=>{
  const f=fixture();let resolve;f.reference.ready=new Promise(yes=>resolve=yes);
  const otherObserver={binding:f.binding,release(){throw new Error('Unrelated reference must remain owned');}};
  const pending=readyProjectSession(f.reference,f.sessions);f.reference.release();resolve(f.binding);
  await assert.rejects(pending,/expired generation/);assert.equal(otherObserver.binding,f.binding);assert.equal(f.cancels,0);
});

test('a history failure can be retried against the same Session without starting or stopping a task',async()=>{
  const f=fixture();f.binding.session.getSnapshot=()=>({openState:'error',openError:{message:'Offline'}});
  await assert.rejects(readyProjectSession(await acquireProjectSession(f.sessions,'same-session'),f.sessions),/Offline/);
  f.reference.binding=f.binding;f.binding.session.getSnapshot=()=>({openState:'open'});
  const reference=await acquireProjectSession(f.sessions,'same-session');assert.equal(reference.sessionId,'same-session');assert.equal(await readyProjectSession(reference,f.sessions),f.binding);assert.equal(f.opens,2);assert.equal(f.cancels,0);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const unknown=id=>new Error(`sessions.retain: unknown session ${id}`);

// Model the public SDK's single-flight list cut and its finally-before-resolution
// clearing. No private catalog state is exposed through the test sessions face.
function catalogFixture(id='same-session'){
  const f=fixture(),server=new Set(),requests=[],retained=[],failures=[];f.reference.sessionId=id;
  let catalog=new Set(),phase='pending',inflight=null,refreshes=0;
  const sessions={
    list:{getSnapshot:()=>({ids:[...catalog],byId:Object.fromEntries([...catalog].map(id=>[id,{id}])),phase,projectionsBySession:{}})},
    refresh(){
      refreshes++;if(inflight)return inflight;
      const gate=deferred(),cut=[...server];requests.push({finish:()=>gate.resolve(),cut});
      inflight=(async()=>{try{await gate.promise;catalog=new Set(cut);phase='ready';}finally{inflight=null;}})();return inflight;
    },
    retain(target,options){
      retained.push({id:target,options});
      if(!catalog.has(target)){const error=unknown(target);failures.push(error);throw error;}
      assert.equal(target,id);return f.sessions.retain(target,options);
    },
    binding:()=>f.binding,
    retainAgentScope(){throw new Error('Gateway identity retention must not bypass the catalog');},
    cancel(){throw new Error('Client reference acquisition must not cancel Host work');}
  };
  Object.defineProperty(sessions,'manager',{get(){throw new Error('The SDK manager is private');}});
  return {...f,sessions,server,requests,retained,failures,get refreshes(){return refreshes;},get releases(){return f.releases;},get opens(){return f.opens;},get cancels(){return f.cancels;}};
}

test('a catalog pull predating composer creation is joined, then refreshed once under the exact same Session ID',async()=>{
  const id='designer-compose-persisted',f=catalogFixture(id),oldPull=f.sessions.refresh(),controller=new AbortController();
  f.server.add(id);const pending=acquireProjectSession(f.sessions,id,controller.signal);
  assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].cut,[]);
  f.requests[0].finish();await oldPull;
  assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1].cut,[id]);assert.equal(f.failures.length,1);
  f.requests[1].finish();const reference=await pending;
  assert.equal(reference.sessionId,id);assert.equal(f.releases,0);assert.equal(f.opens,1);assert.equal(f.cancels,0);
  assert.deepEqual(f.retained.map(row=>row.id),[id,id]);assert.equal(f.refreshes,3);assert.equal(f.failures[0].message,`sessions.retain: unknown session ${id}`);
  for(const row of f.retained){assert.equal(row.options.source,'controllerOperation');assert.equal(row.options.signal,controller.signal);}
  assert.equal(await readyProjectSession(reference,f.sessions),f.binding);
});

test('permanent exact unknown remains bounded and preserves the final native error',async()=>{
  const id='missing-session',errors=[unknown(id),unknown(id)];let refreshes=0,retains=0;
  const sessions={list:{getSnapshot:()=>({phase:'ready'})},async refresh(){refreshes++;},retain(target){assert.equal(target,id);throw errors[retains++];}};
  await assert.rejects(acquireProjectSession(sessions,id),error=>error===errors[1]);assert.equal(refreshes,2);assert.equal(retains,2);
});

test('permission, transport, abort, wrapped and other-ID failures are never retried as native unknown',async()=>{
  const id='same-session',message=`sessions.retain: unknown session ${id}`,permission=Object.assign(new Error(message),{code:'FS_SANDBOX_DENIED'}),transport=new Error(message,{cause:{code:'gateway/disconnected'}});
  const errors=[permission,transport,new DOMException(message,'AbortError'),Object.assign(new Error(message),{name:'PermissionError'}),unknown('another-session'),new Error(message+' extra'),new Error('prefix '+message),{message,code:'session/denied'}];
  for(const error of errors){let refreshes=0,retains=0;const sessions={async refresh(){refreshes++;},retain(){retains++;throw error;}};
    await assert.rejects(acquireProjectSession(sessions,id),value=>value===error);assert.equal(refreshes,1);assert.equal(retains,1);
  }
});

test('public refresh rejections preserve real permission and transport failures on either attempt',async()=>{
  const id='same-session';
  for(const failedAttempt of [1,2])for(const failure of [Object.assign(new Error('Denied'),{code:'FS_SANDBOX_DENIED'}),{code:'gateway/disconnected',message:'Transport unavailable'}]){
    let refreshes=0,retains=0;const sessions={async refresh(){if(++refreshes===failedAttempt)throw failure;},retain(){retains++;throw unknown(id);}};
    await assert.rejects(acquireProjectSession(sessions,id),error=>error===failure);assert.equal(refreshes,failedAttempt);assert.equal(retains,failedAttempt-1);
  }
});

test('a pending public catalog after resolved refresh reports unavailability with its native cause and does not retry permissions blindly',async()=>{
  const id='same-session',error=unknown(id);let refreshes=0,retains=0;
  const sessions={list:{getSnapshot:()=>({ids:[],byId:{},phase:'pending',projectionsBySession:{}})},async refresh(){refreshes++;},retain(){retains++;throw error;}};
  Object.defineProperty(sessions,'manager',{get(){throw new Error('Private listError must remain inaccessible');}});
  await assert.rejects(acquireProjectSession(sessions,id),failure=>failure.code==='CLIENT_SESSION_CATALOG_UNAVAILABLE'&&failure.sessionId===id&&failure.cause===error&&failure.name!=='AbortError');
  assert.equal(refreshes,1);assert.equal(retains,1);
});

test('catalog unavailability discovered on the only retry preserves its second exact native cause',async()=>{
  const id='same-session',errors=[unknown(id),unknown(id)];let refreshes=0,retains=0;
  const sessions={list:{getSnapshot:()=>({phase:refreshes===1?'ready':'pending'})},async refresh(){refreshes++;},retain(){throw errors[retains++];}};
  await assert.rejects(acquireProjectSession(sessions,id),failure=>failure.code==='CLIENT_SESSION_CATALOG_UNAVAILABLE'&&failure.cause===errors[1]);assert.equal(refreshes,2);assert.equal(retains,2);
});

test('a live known reference remains retainable while public catalog arrival is pending',async()=>{
  const f=fixture();f.sessions.list={getSnapshot:()=>({phase:'pending'})};assert.equal(await acquireProjectSession(f.sessions,'same-session'),f.reference);assert.equal(f.opens,1);assert.equal(f.releases,0);assert.equal(f.cancels,0);
});

test('an already aborted acquisition does no catalog I/O or retention',async()=>{
  const reason=new Error('Project left'),controller=new AbortController();controller.abort(reason);let refreshes=0,retains=0;
  const sessions={async refresh(){refreshes++;},retain(){retains++;}};
  await assert.rejects(acquireProjectSession(sessions,'same-session',controller.signal),error=>error===reason);assert.equal(refreshes,0);assert.equal(retains,0);
});

test('aborting one caller cannot cancel a shared catalog pull or another caller reference',async()=>{
  const id='same-session',f=catalogFixture(id),controller=new AbortController();f.server.add(id);
  const cancelled=acquireProjectSession(f.sessions,id,controller.signal),cancelledCheck=assert.rejects(cancelled,{name:'AbortError'}),other=acquireProjectSession(f.sessions,id);
  assert.equal(f.requests.length,1);controller.abort();f.requests[0].finish();await cancelledCheck;
  const reference=await other;assert.equal(reference,f.reference);assert.equal(f.retained.length,1);assert.equal(f.retained[0].options.signal,undefined);assert.equal(await readyProjectSession(reference,f.sessions),f.binding);
});

test('abort during the retry refresh cannot allocate another reference',async()=>{
  const controller=new AbortController(),reason=new Error('Navigation superseded');let refreshes=0,retains=0;
  const sessions={async refresh(){if(++refreshes===2)controller.abort(reason);},retain(){retains++;throw unknown('same-session');}};
  await assert.rejects(acquireProjectSession(sessions,'same-session',controller.signal),error=>error===reason);assert.equal(refreshes,2);assert.equal(retains,1);
});

test('a reference allocated just as its caller aborts is released without touching another owner',async()=>{
  const f=fixture(),controller=new AbortController(),reason=new Error('View left');let otherReleases=0;
  const other={release(){otherReleases++;}},sessions={async refresh(){},retain(_id,options){assert.equal(options.signal,controller.signal);controller.abort(reason);return f.reference;}};
  await assert.rejects(acquireProjectSession(sessions,'same-session',controller.signal),error=>error===reason);assert.equal(f.releases,1);assert.equal(f.cancels,0);assert.equal(otherReleases,0);assert.equal(typeof other.release,'function');
});

test('an asynchronous ready rejection stays its original failure and releases only this UI reference',async()=>{
  const f=fixture(),opening=deferred(),failure=Object.assign(new Error('Native read permission denied'),{code:'session/forbidden'});f.reference.ready=opening.promise;
  const pending=readyProjectSession(f.reference,f.sessions);opening.reject(failure);
  await assert.rejects(pending,error=>error===failure&&error.name!=='AbortError');assert.equal(f.releases,1);assert.equal(f.cancels,0);
});
