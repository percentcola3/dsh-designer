import test from 'node:test';
import assert from 'node:assert/strict';
import {DesignerService} from './index.js';
import {AIWorkbench} from './ai-workbench.js';
const start=turn=>({type:'turn/start',data:{turn}});
const user=(rpcId,text='Task')=>({type:'user/message',data:{source:{kind:'user',rpcId},content:[{type:'text',text}]}});
const end=(turn,kind)=>({type:'turn/end',data:{turn,reason:{kind,...(kind==='error'?{error:{message:'native failure'}}:{})}}});
function fixture(events,{running=false,queue=[],anchor}={}){
 events=events.map((e,index)=>({...e,seq:index+1}));
 const owner={
  store:{projectGet:async()=>({project:{id:'p-status',aiSessionId:'designer-p-status',workbench:{lastTaskRef:anchor}}})},
  taskRecoveryErrors:new Map(),
  ctx:{agents:{get:()=>({session:{snapshotEvents:()=>events}})},sessionController:{state:async()=>({running,queue}),events:async()=>({records:events.map(event=>({event}))})}}
 };
 owner.aiWorkbench={requestLifecycle:(...args)=>AIWorkbench.prototype.requestLifecycle.call({owner},...args)};
 return ()=>DesignerService.prototype.aiStatus.call(owner,'p-status');
}
test('native completed is exposed only for the exact current request and turn',async()=>{
 const state=await fixture([start(1),user('request-old'),end(1,'error'),start(2),user('request-new'),end(2,'completed')])();
 assert.equal(state.request.requestId,'request-new');assert.equal(state.request.generation,'completed');assert.equal(state.error,undefined);
});
test('a missing terminal record remains unknown despite a stopped model',async()=>{
 const state=await fixture([start(1),user('request-old'),end(1,'completed'),start(2),user('request-current')])();
 assert.equal(state.running,false);assert.equal(state.request.requestId,'request-current');assert.equal(state.request.generation,'unknown');
});
test('native cancellation and failure are not task success',async()=>{
 for(const [reason,expected] of [['aborted','cancelled'],['error','failed'],['max-tokens','incomplete']]){
  const state=await fixture([start(1),user('request'),end(1,reason)])();assert.equal(state.request.generation,expected);assert.equal(state.error,expected==='failed'?'native failure':undefined);
 }
});
test('a newly queued request cannot inherit an old turn completion',async()=>{
 const state=await fixture([start(1),user('previous'),end(1,'completed')],{queue:[{rpcId:'next',id:'q-next'}]})();
 assert.equal(state.request.requestId,'next');assert.equal(state.request.generation,'requested');assert.equal(state.request.source,'native-queue');
});
test('running a new request clears an earlier error and returns a longer scrollable history',async()=>{
 const events=[start(1),user('old'),end(1,'error'),start(2),user('latest')];
 for(let n=0;n<20;n++)events.push({type:'assistant/message',data:{message:{content:[{type:'text',text:'Update '+n}]}}});
 const state=await fixture(events,{running:true})();assert.equal(state.error,undefined);assert.equal(state.request.generation,'running');assert.equal(state.messages.length,22);
});
