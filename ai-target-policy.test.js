import test from 'node:test';
import assert from 'node:assert/strict';
import {AITargetPolicy} from './ai-target-policy.js';

const project=()=>({id:'p-one',revision:7,artboards:[{id:'page-one',designId:'d-one'},{id:'page-two',designId:'d-two'}],workbench:{designs:[{id:'d-one',name:'商城',folder:'designs/shop'},{id:'d-two',name:'后台',folder:'designs/admin'}],files:[{id:'common',path:'docs/plan.md'},{id:'misleading',path:'docs/outside.md',designId:'d-one'}]}});
const input=(extra={})=>({projectId:'p-one',activeDesignId:'d-one',prompt:'调整当前设计稿',target:{designId:'d-one',scope:'design'},...extra});
const user={originUser:true,policy:{mode:'workspace-write'}};
function challenge(policy,request,p=project()){
  let error;try{policy.resolve(request,p,user);}catch(e){error=e;}
  assert.equal(error?.code,'TARGET_CONFIRMATION_REQUIRED');assert.ok(error.details.token);return error.details;
}

test('active Design default and page inference remain separate from read-only references',()=>{
  const policy=new AITargetPolicy(),request=input({target:undefined,references:[{type:'project',referencedProjectId:'other'},{type:'directory',rootPath:'/external'}]});
  const resolved=policy.resolve(request,project(),user);
  assert.equal(resolved.input.target.designId,'d-one');assert.equal(resolved.input.target.scope,'design');assert.equal(resolved.confirmation,null);
  assert.deepEqual(resolved.input.references,request.references);assert.ok(policy.owns(resolved));assert.ok(Object.isFrozen(resolved.input.target));
  const page=policy.resolve(input({target:{pageId:'page-one',scope:'page'}}),project(),user);assert.equal(page.input.target.designId,'d-one');
});

test('confirmation binds the entire original draft, project revision and active canvas',()=>{
  const policy=new AITargetPolicy(),p=project(),request=input({target:{designId:'d-two',scope:'design'},references:[{fileId:'brief'}],attachments:[{receiptId:'image-one'}]});
  const details=challenge(policy,request,p),confirmed=policy.resolve({...request,targetConfirmation:details.token},p,user);
  assert.equal(confirmed.input.target.designId,'d-two');assert.equal(confirmed.activeDesignId,'d-one');assert.equal(confirmed.confirmation.confirmed,true);
  for(const change of [{prompt:'different instruction'},{references:[]},{attachments:[{receiptId:'image-two'}]},{allowedPaths:['designs/admin/assets']},{target:{designId:'d-two',scope:'project'}}]){
    const fresh=challenge(policy,{...request,...change,targetConfirmation:details.token},p);assert.equal(fresh.confirmationInvalid,true);assert.notEqual(fresh.token,details.token);
  }
  assert.equal(challenge(policy,{...request,targetConfirmation:details.token},{...p,revision:8}).confirmationInvalid,true);
  assert.equal(challenge(policy,{...request,activeDesignId:null,targetConfirmation:details.token},p).confirmationInvalid,true);
  assert.equal(challenge(policy,{...request,targetConfirmation:'invented'},p).confirmationInvalid,true);
  assert.throws(()=>policy.resolve({...request,targetConfirmation:details.token},p,{...user,originUser:false}),{code:'USER_ONLY'});
});

test('expired tokens and a reconstructed policy need a new user confirmation',()=>{
  let now=100;const policy=new AITargetPolicy({now:()=>now,ttl:50}),request=input({target:{scope:'project'}}),details=challenge(policy,request);
  now=151;assert.equal(challenge(policy,{...request,targetConfirmation:details.token}).confirmationInvalid,true);
  assert.equal(challenge(new AITargetPolicy(),{...request,targetConfirmation:details.token}).confirmationInvalid,true);
});

test('direct design names and destination directories propose a switch, reference language does not',()=>{
  for(const prompt of ['修改后台的按钮','把后台的按钮改成蓝色','编辑设计稿「后台」','update designs/admin/header.html','write CSS to designs/admin/styles']){
    const details=challenge(new AITargetPolicy(),input({prompt}));assert.equal(details.proposedTarget.designId,'d-two',prompt);assert.equal(details.reason,'prompt-target-mismatch');
  }
  for(const prompt of ['参考后台的布局，修改当前设计稿','读取 designs/admin 作为参考','Use designs/admin as reference to improve current page','不要修改后台的按钮','把当前页面改成后台的风格']){
    const resolved=new AITargetPolicy().resolve(input({prompt}),project(),user);assert.equal(resolved.input.target.designId,'d-one',prompt);assert.equal(resolved.confirmation,null,prompt);
  }
});

test('files use their actual directory rather than a misleading design registration',()=>{
  const policy=new AITargetPolicy();
  const local=policy.resolve(input({target:{path:'designs/shop/theme.css'}}),project(),user);assert.equal(local.input.target.designId,'d-one');assert.equal(local.confirmation,null);
  const other=challenge(policy,input({target:{path:'designs/admin/theme.css'}}));assert.equal(other.proposedTarget.designId,'d-two');
  const outside=challenge(policy,input({target:{fileId:'misleading'}}));assert.equal(outside.proposedTarget.path,'docs/outside.md');
  const natural=challenge(policy,input({prompt:'更新 docs/plan.md'}));assert.equal(natural.proposedTarget.path,'docs/plan.md');
});

test('external registered files stay read-only and no confirmation grants source writes',()=>{
  const policy=new AITargetPolicy(),request=input({target:{sourceId:'external',path:'src/App.tsx',scope:'project'}}),resolved=policy.resolve(request,project(),user);
  assert.equal(resolved.input.target.scope,'read');assert.deepEqual(resolved.input.allowedPaths,[]);
  assert.throws(()=>policy.resolve({...request,sourceWrite:{sourceProjectId:'external',paths:['src']},targetConfirmation:'forged'},project(),user),{code:'SCOPE_DENIED'});
  assert.throws(()=>policy.resolve(input({target:{...request.target,sourceWrite:{sourceProjectId:'external',paths:['src']}}}),project(),user),{code:'SCOPE_DENIED'});
});

test('read analysis never confirms a write and legacy internal calls retain their explicit contract',()=>{
  const policy=new AITargetPolicy(),request=input({target:{designId:'d-two',scope:'design'}});
  const read=policy.resolve(request,project(),{...user,policy:{mode:'read-only'}});assert.equal(read.input.target.scope,'read');assert.equal(read.confirmation,null);
  const legacy={projectId:'p-one',prompt:'Generate',target:{scope:'project'}};assert.deepEqual(policy.resolve(legacy,project(),user).input,legacy);
  assert.throws(()=>policy.resolve(input({activeDesignId:'missing'}),project(),user),{code:'INVALID_ACTIVE_DESIGN'});
  const first=challenge(policy,input({activeDesignId:null,target:undefined,mode:'generate'}));assert.equal(first.proposedTarget.scope,'project');
});
