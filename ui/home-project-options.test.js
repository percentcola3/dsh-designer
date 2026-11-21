import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectWithOptions,homeCheckpointForDraft} from './home-project-options.js';
import {startHomeDesign} from './home-design.js';

function fixture(){
  const calls=[],sessionId='designer-compose-options-test';
  let project={id:'p-options-test',revision:1,workbench:{}},draft={},version=null,reject=false;
  return {calls,sessionId,failAI(value){reject=value;},async api(action,args){
    calls.push({action,args:structuredClone(args)});
    if(action==='system.get'){if(args.systemId==='missing')throw new Error('规范不存在');return {platforms:['mobile']};}
    if(action==='project.create'||action==='project.get')return {project:structuredClone(project)};
    if(action==='project.initialize'){project={...project,revision:2,workbench:{initializedAt:'now',designs:[{id:'d-options-test',platform:args.platform,artifactKind:args.artifactKind||'html',binding:{mode:'inherit'}}]}};return {project:structuredClone(project)};}
    if(action==='composer.adopt'){assert.equal(args.sessionId,sessionId);project={...project,aiSessionId:sessionId,revision:project.revision+1};return {project:structuredClone(project)};}
    if(action==='binding.set'){project.workbench.designs[0].binding=structuredClone(args.binding);project={...project,revision:project.revision+1};return {project:structuredClone(project)};}
    if(action==='binding.resolve'){const b=project.workbench.designs[0].binding;return {effectiveBinding:{...b,systemId:b.systemId??null,version:b.systemId?4:null}};}
    if(action==='draft.get')return {draft:structuredClone(draft),version};
    if(action==='draft.save'){assert.equal(args.expectedVersion,version);draft=structuredClone(args.draft);version='v-'+calls.length;return {version};}
    if(action==='ai.run'){if(reject)throw Object.assign(new Error('模型暂未接受'),{code:'MODEL_REQUIRED'});return {accepted:true,sessionId,requestId:'request-options-test'};}
    throw new Error(action);
  }};
}

test('a prepared draft belongs to its native session even if its prompt changes',()=>{
  const checkpoint={projectId:'p-saved',prompt:'old',sessionId:'native-session'};
  assert.equal(homeCheckpointForDraft(checkpoint,'edited','native-session'),checkpoint);
  assert.equal(homeCheckpointForDraft(checkpoint,'old','another-session'),null);
});
test('a missing system fails before any project write',async()=>{
  const f=fixture();
  await assert.rejects(startHomeDesign(f.api,'生成设计',{systemChoice:{systemId:'missing'}}),/规范不存在/);
  assert.deepEqual(f.calls.map(row=>row.action),['system.get']);
});
test('mobile system starts HTML generation directly with the selected references, attachments and session',async()=>{
  const f=fixture(),artifactKind='html';
  const references=[{type:'project',referencedProjectId:'p-reference',resourceId:'project:p-reference',sourceVersion:2}];
  const attachments=[{receiptId:'native-options-receipt',receivingSessionId:f.sessionId}];
  const result=await startHomeDesign(f.api,'移动端交互设计',{sessionId:f.sessionId,references,attachments,systemChoice:{systemId:'d-pinned-system',version:4}});
  assert.equal(f.calls.find(call=>call.action==='project.create').args.systemId,'d-pinned-system');
  assert.equal(result.accepted,true);
  for(const action of ['project.create','project.initialize']){const args=f.calls.find(call=>call.action===action).args;assert.equal(args.platform,'mobile');assert.equal(args.artifactKind||'html',artifactKind);}
  assert.ok(f.calls.findIndex(call=>call.action==='project.create')<f.calls.findIndex(call=>call.action==='project.initialize'));
  assert.ok(f.calls.findIndex(call=>call.action==='project.initialize')<f.calls.findIndex(call=>call.action==='ai.run'));
  assert.equal(f.calls.find(call=>call.action==='composer.adopt').args.sessionId,f.sessionId);
  assert.deepEqual(f.calls.find(call=>call.action==='binding.set').args.binding,{mode:'independent',systemId:'d-pinned-system'});
  const ai=f.calls.find(call=>call.action==='ai.run').args;
  assert.deepEqual(ai.attachments,attachments);assert.equal(ai.references[0].referencedProjectId,'p-reference');assert.equal(ai.references[0].projectId,'p-options-test');
  assert.deepEqual(ai.effectiveBinding,{mode:'independent',systemId:'d-pinned-system',version:4});assert.equal(ai.mode,'generate');assert.equal(ai.target.designId,'d-options-test');
  assert.equal(f.calls.some(call=>call.action==='design.create'),false);
});

test('retry in the same session keeps its existing project and design',async()=>{
  const f=fixture();f.failAI(true);let checkpoint;
  const options={sessionId:f.sessionId,onCheckpoint:value=>{checkpoint=value;}};
  await assert.rejects(startHomeDesign(f.api,'第一版需求',options),{code:'MODEL_REQUIRED'});
  assert.equal(checkpoint.projectId,'p-options-test');assert.equal(checkpoint.designId,'d-options-test');
  f.failAI(false);
  await startHomeDesign(f.api,'修改后的需求',{...options,checkpoint});
  assert.equal(f.calls.filter(call=>call.action==='project.create').length,1);
  assert.equal(f.calls.filter(call=>call.action==='project.initialize').length,1);
  assert.equal(f.calls.filter(call=>call.action==='ai.run').length,2);
  assert.equal(f.calls.filter(call=>call.action==='ai.run')[1].args.prompt,'修改后的需求');
});

for(const platform of ['web','mobile'])for(const artifactKind of ['html'])test(`explicit project dialog passes ${platform}/${artifactKind} and group to create then initialize without sending a message`,async()=>{
  const f=fixture();let checkpoint;
  const result=await createProjectWithOptions(f.api,{name:'明确创建',groupId:'g-selected',platform,artifactKind,start:{kind:'empty'}},{onCheckpoint:value=>{checkpoint=value;}});
  assert.deepEqual(f.calls.map(call=>call.action),['project.create','project.initialize']);
  assert.equal(f.calls[0].args.groupId,'g-selected');
  for(const call of f.calls){assert.equal(call.args.platform,platform);assert.equal(call.args.artifactKind,artifactKind);}
  assert.deepEqual(checkpoint,{projectId:'p-options-test',platform,artifactKind});
  assert.equal(result.project.workbench.designs[0].platform,platform);
  assert.equal(result.project.workbench.designs[0].artifactKind,artifactKind);
});

test('project dialog initializer failure locks types and retries the saved project without a second create',async()=>{
  const f=fixture();let checkpoint,fail=true;
  const api=async(action,args)=>{if(action==='project.initialize'&&fail){fail=false;throw new Error('暂时无法初始化');}return f.api(action,args);};
  const input={name:'保留已有项目',platform:'mobile',artifactKind:'html',groupId:'g-one',start:{kind:'empty'}};
  await assert.rejects(createProjectWithOptions(api,input,{onCheckpoint:value=>{checkpoint=value;}}),/暂时无法初始化/);
  assert.equal(checkpoint.projectId,'p-options-test');
  const before=f.calls.length;
  await assert.rejects(createProjectWithOptions(api,{...input,artifactKind:'react'},{checkpoint}),{code:'INVALID_ARTIFACT_KIND'});
  assert.equal(f.calls.length,before);
  const result=await createProjectWithOptions(api,input,{checkpoint});
  assert.equal(result.project.workbench.designs[0].artifactKind,'html');
  await createProjectWithOptions(api,input,{checkpoint});
  assert.equal(f.calls.filter(call=>call.action==='project.create').length,1);
  assert.equal(f.calls.filter(call=>call.action==='project.initialize').length,1);
  assert.equal(f.calls.some(call=>call.action==='ai.run'),false);
});
