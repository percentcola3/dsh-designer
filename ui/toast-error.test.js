import test from 'node:test';
import assert from 'node:assert/strict';
import {toastErrorMessage, toastErrorDetails, toastErrorKey, createToastStore} from './toast-error.js';
test('permission toast stays concise while the original diagnostic remains available',()=>{const error={code:'FS_SANDBOX_DENIED',message:'cannot write /private/very-long/project/.workbench/drafts/hash.json',details:{mode:'workspace-write'}};const message=toastErrorMessage(error);assert.match(message,/权限/);assert.doesNotMatch(message,/private|drafts|json/);assert.equal(error.details.mode,'workspace-write');assert.match(error.message,/hash.json/);});
test('unknown error messages are readable and long diagnostics cannot expand the whole toast',()=>{assert.equal(toastErrorMessage({message:'保存中断'}),'保存中断');assert.equal(toastErrorMessage({message:'x'.repeat(1000)}).length,181);});
test('filesystem diagnostics are concise while original details remain expandable',()=>{
 for(const error of [{code:'EPERM',message:'mkdir /Users/me/project/delivery'},{message:"EPERM: operation not permitted, mkdir '/private/project/delivery'"},{message:'write failed: /Users/me/project/system.json'},{message:'write failed: /srv/projects/delivery'},{message:'Unknown knowledge action: import'}]){
  assert.doesNotMatch(toastErrorMessage(error),/Users|private|delivery|Unknown/);
  assert.ok(toastErrorDetails(error).includes(error.message));
 }
});
test('simultaneous panel and dialog reports share one toast and clear every source on dismissal',()=>{
 const store=createToastStore(),closed=[],first={code:'EPERM',message:'write blocked',details:{path:'same',mode:'workspace'}},second={...first,details:{mode:'workspace',path:'same'}};
 store.reportError(first,{context:'保存体系',onClose:error=>closed.push(error)});
 store.reportError(second,{context:'新建体系',onClose:error=>closed.push(error)});
 assert.equal(store.getSnapshot().length,1);
 assert.equal(toastErrorKey(first),toastErrorKey(second));
 store.dismissError(store.getSnapshot()[0].id);
 assert.deepEqual(closed,[first,second]);assert.equal(store.getSnapshot().length,0);
 store.reportError(first);assert.equal(store.getSnapshot().length,0,'unchanged error props cannot reappear');
 store.reportError({...first});assert.equal(store.getSnapshot().length,1,'a new operation with the same failure can be shown again');
});
test('distinct failures stay visible and dialog unmount does not lose the toast',()=>{
 const store=createToastStore();let closed=0,notifications=0;
 const unsubscribe=store.subscribe(()=>notifications++);
 const release=store.reportError({message:'保存失败'},{onClose:()=>closed++});
 release();store.reportError({message:'导出失败'});
 assert.equal(store.getSnapshot().length,2);assert.equal(notifications,2);
 store.dismissError(store.getSnapshot()[0].id);assert.equal(closed,0,'do not invoke unmounted component setters');
 assert.equal(store.getSnapshot().length,1);unsubscribe();
});
test('dedupe handles cyclic details and callbacks cannot prevent other sources from closing',()=>{
 const details={};details.self=details;
 assert.doesNotThrow(()=>toastErrorKey({message:'error',details}));
 const store=createToastStore();let closed=false;
 store.reportError({message:'same'},{onClose:()=>{throw new Error('disposed');}});
 store.reportError({message:'same'},{onClose:()=>{closed=true;}});
 store.dismissError(store.getSnapshot()[0].id);assert.equal(closed,true);assert.equal(store.getSnapshot().length,0);
});
