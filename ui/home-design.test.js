import test from 'node:test';
import assert from 'node:assert/strict';
import {startHomeDesign} from './home-design.js';
function fixture(){
  const calls=[];let fail=true,project={id:'p-one',revision:1,name:'项目',workbench:{}};
  return {calls,allowAI(){fail=false;},async api(action,args){calls.push({action,args});
    if(action==='system.get')return {platforms:['web']};
    if(action==='project.create'||action==='project.get')return {project};
    if(action==='project.initialize'){project={...project,revision:2,workbench:{initializedAt:'now'}};return {project};}
    if(action==='design.create'){project={...project,revision:3};return {project,design:{id:'d-one'}};}
    if(action==='binding.resolve')return {effectiveBinding:{mode:'none'}};
    if(action==='ai.run'){if(fail)throw Object.assign(new Error('配置模型后重试'),{code:'MODEL_REQUIRED'});return {accepted:true,sessionId:'session-one',requestId:'request-one'};}
    throw Error(action);
  }};
}
test('a failed AI admission preserves saved identities and an explicit retry does not duplicate files',async()=>{
  const f=fixture();let checkpoint;
  await assert.rejects(startHomeDesign(f.api,'做一个官网',{onCheckpoint:value=>checkpoint=value}),{code:'MODEL_REQUIRED'});
  assert.equal(checkpoint.projectId,'p-one');assert.equal(checkpoint.designId,'d-one');assert.ok(!checkpoint.accepted);
  f.allowAI();const result=await startHomeDesign(f.api,'做一个官网',{checkpoint});
  assert.equal(result.accepted,true);
  assert.equal(f.calls.filter(call=>call.action==='project.create').length,1);
  assert.equal(f.calls.filter(call=>call.action==='design.create').length,1);
});
test('home generation grants only the actual new design and freezes that same target',async()=>{
  const f=fixture();f.allowAI();let prepared;
  await startHomeDesign(f.api,'做一个官网',{onPrepared:value=>prepared=value});
  const args=f.calls.find(call=>call.action==='ai.run').args;
  assert.deepEqual(args.target,{projectId:'p-one',designId:'d-one',scope:'design'});
  assert.deepEqual(args.frozenTarget,args.target);assert.notEqual(args.frozenTarget,args.target);
  assert.equal(prepared.designId,'d-one');assert.equal(args.mode,'generate');
  assert.deepEqual(args.effectiveBinding,{mode:'none'});
});
for(const artifactKind of ['react','vue'])test('home rejects '+artifactKind+' before creating files',async()=>{
  const f=fixture();await assert.rejects(startHomeDesign(f.api,'移动端产品页',{artifactKind}),{code:'INVALID_ARTIFACT_KIND'});
  assert.deepEqual(f.calls,[]);
});
test('default HTML submission preserves legacy creation arguments',async()=>{
  const f=fixture();f.allowAI();await startHomeDesign(f.api,'HTML 官网');
  for(const action of ['project.create','project.initialize','design.create'])assert.equal(Object.hasOwn(f.calls.find(call=>call.action===action).args,'artifactKind'),false,action);
  assert.deepEqual(f.calls.find(call=>call.action==='project.create').args,{name:'HTML 官网',platform:'web',goal:'HTML 官网',start:{kind:'empty'}});
});
test('a legacy source checkpoint does not submit a new generation',async()=>{
  const f=fixture(),checkpoint={prompt:'页面',projectId:'p-old',artifactKind:'vue',platform:'mobile'};
  await assert.rejects(startHomeDesign(f.api,'页面',{checkpoint}),{code:'INVALID_ARTIFACT_KIND'});
  assert.deepEqual(f.calls,[]);
});
test('invalid requests never create a project and an acknowledged checkpoint is never submitted again',async()=>{
  const f=fixture();await assert.rejects(startHomeDesign(f.api,'  '),{code:'INVALID_PROMPT'});assert.equal(f.calls.length,0);
  const checkpoint={prompt:'已有任务',projectId:'p-one',designId:'d-one',accepted:true,result:{sessionId:'s',requestId:'r'}};
  assert.equal((await startHomeDesign(f.api,'已有任务',{checkpoint})).accepted,true);assert.equal(f.calls.length,0);
});

test('an explicitly selected system must resolve before AI admission',async()=>{
  const f=fixture();f.allowAI();
  await assert.rejects(startHomeDesign(f.api,'骑手管理',{systemChoice:{systemId:'d-ant'}}),{code:'BINDING_CHANGED'});
  assert.ok(!f.calls.some(row=>row.action==='ai.run'));
});
