import test from 'node:test';
import assert from 'node:assert/strict';
import {startHomeDesign} from './home-design.js';
import {getComposeAdmission} from './compose-admission.js';
let nextId=0;
function fixture(){
  const calls=[],sessionId='designer-compose-550e8400-e29b-41d4-a716-446655440000';
  let project={id:`p-home-native-${++nextId}`,name:'Draft',revision:1,workbench:{initializedAt:'now'}},stored={},version=null,binding={mode:'none'},reject=true,rejectConsume=false;
  const f={calls,sessionId,get project(){return project;},get stored(){return stored;},allow(){reject=false;},failConsume(){rejectConsume=true;},async api(action,args){
    calls.push({action,args:structuredClone(args)});
    if(action==='project.create'||action==='project.get')return {project:structuredClone(project)};
    if(action==='composer.adopt'){assert.equal(args.sessionId,sessionId);if(!project.aiSessionId)project={...project,aiSessionId:sessionId,revision:project.revision+1};return {project:structuredClone(project),sessionId};}
    if(action==='design.create'){assert.equal(args.expectedRevision,project.revision);binding=args.binding;project={...project,revision:project.revision+1};return {project:structuredClone(project),design:{id:'d-home-native'}};}
    if(action==='binding.set'){assert.equal(args.expectedRevision,project.revision);binding=args.binding;project={...project,revision:project.revision+1};return {project:structuredClone(project)};}
    if(action==='binding.resolve')return {effectiveBinding:binding};
    if(action==='draft.get')return {draft:structuredClone(stored),version};
    if(action==='draft.save'){assert.equal(args.expectedVersion,version);if(rejectConsume&&!args.draft.prompt)throw Object.assign(new Error('intervening draft'),{code:'VERSION_CONFLICT'});stored=structuredClone(args.draft);version=`v-${Number(version?.slice(2)||0)+1}`;return {version};}
    if(action==='ai.run'){assert.equal(project.aiSessionId,sessionId);if(reject)throw Object.assign(new Error('configure model'),{code:'MODEL_REQUIRED'});return {accepted:true,sessionId,requestId:'request-native'};}
    throw Error(action);
  }};return f;
}

test('home reuses the initialized Web design and applies its chosen system without creating a second design',async()=>{
  const f=fixture();f.allow();f.project.workbench.designs=[{id:'d-initial-native',platform:'web',binding:{mode:'inherit'}}];
  await startHomeDesign(f.api,'Use the initial Web design',{sessionId:f.sessionId,systemChoice:{systemId:'s-default',version:2}});
  assert.equal(f.calls.filter(c=>c.action==='design.create').length,0);assert.equal(f.calls.filter(c=>c.action==='binding.set').length,1);
  assert.equal(f.calls.find(c=>c.action==='binding.set').args.designId,'d-initial-native');assert.equal(f.calls.find(c=>c.action==='ai.run').args.target.designId,'d-initial-native');
});
test('home keeps the actual selected Session, native receipts, pinned system and owner-scoped references',async()=>{
  const f=fixture();f.allow();const receipt={receiptId:'native-receipt',receivingSessionId:f.sessionId,file:{attachmentId:'file-native',name:'reference.pdf',bytes:12}};
  const references=[{type:'project',referencedProjectId:'p-reference',resourceId:'project:p-reference',sourceVersion:4,label:'Reference'}];
  const result=await startHomeDesign(f.api,'Build a site',{sessionId:f.sessionId,attachments:[receipt],references,systemChoice:{systemId:'s-one',version:2}});
  assert.equal(result.accepted,true);
  const submit=f.calls.find(c=>c.action==='ai.run').args;
  assert.deepEqual(submit.attachments,[receipt]);assert.equal(submit.references[0].projectId,f.project.id);assert.equal(submit.references[0].referencedProjectId,'p-reference');
  assert.deepEqual(submit.target,{projectId:f.project.id,designId:'d-home-native',scope:'design'});assert.deepEqual(submit.frozenTarget,submit.target);
  assert.deepEqual(f.calls.find(c=>c.action==='design.create').args.binding,{mode:'independent',systemId:'s-one',version:2});
  assert.equal(f.stored.prompt,'');assert.deepEqual(f.stored.attachments,[]);
});

test('editing an unaccepted home attempt reuses saved identities and receipts instead of adopting one Session twice',async()=>{
  const f=fixture();let checkpoint;const options={sessionId:f.sessionId,attachments:[{receiptId:'same-native-receipt'}],onCheckpoint:value=>checkpoint=value};
  await assert.rejects(startHomeDesign(f.api,'First prompt',options),{code:'MODEL_REQUIRED'});
  assert.equal(f.stored.prompt,'First prompt');
  f.allow();await startHomeDesign(f.api,'Edited prompt',{...options,checkpoint,systemChoice:{systemId:'s-selected',version:3}});
  assert.equal(f.calls.filter(c=>c.action==='project.create').length,1);assert.equal(f.calls.filter(c=>c.action==='design.create').length,1);
  const submissions=f.calls.filter(c=>c.action==='ai.run');assert.equal(submissions[1].args.prompt,'Edited prompt');assert.deepEqual(submissions[1].args.attachments,submissions[0].args.attachments);
  assert.deepEqual(f.calls.find(c=>c.action==='binding.set').args.binding,{mode:'independent',systemId:'s-selected',version:3});
});

test('a new canvas owner editing during home admission keeps its next generation after acceptance',async()=>{
  const f=fixture();f.allow();let detach;
  try{
    await startHomeDesign(f.api,'Submitted home prompt',{sessionId:f.sessionId,onPrepared:async()=>{const queue=getComposeAdmission(f.project.id),owner={};detach=queue.attach(owner,()=>{});queue.update(owner,{prompt:'Next canvas prompt',references:[],attachments:[]});}});
    assert.equal(f.stored.prompt,'Next canvas prompt');
  }finally{detach?.();}
});

test('accepted native work is never repeated when clearing the durable compose conflicts',async()=>{
  const f=fixture();f.allow();f.failConsume();let checkpoint;
  const result=await startHomeDesign(f.api,'Accepted prompt',{sessionId:f.sessionId,onCheckpoint:value=>checkpoint=value});
  assert.equal(result.accepted,true);assert.equal(result.composeError.code,'VERSION_CONFLICT');
  const calls=f.calls.length;await startHomeDesign(f.api,'Accepted prompt',{sessionId:f.sessionId,checkpoint});
  assert.equal(f.calls.length,calls);assert.equal(f.calls.filter(c=>c.action==='ai.run').length,1);
});
