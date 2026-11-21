import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DesignerService,modelSafe} from './index.js';
import {normalizeDocument} from './document-model.js';

// Read only the public utility used by the installed Native tool pipeline. No
// Session store, credentials, inspector, running model or network is involved.
async function nativeValidator(){
  if(process.env.DSH_NATIVE_JSON_VALIDATOR)return import(process.env.DSH_NATIVE_JSON_VALIDATOR);
  const archive='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar';
  if(!fs.existsSync(archive))return null;
  const fd=fs.openSync(archive,'r');
  try{
    const header=Buffer.alloc(16);fs.readSync(fd,header,0,16,0);
    const length=header.readUInt32LE(12);assert.ok(length>0&&length<64*1024*1024);
    const bytes=Buffer.alloc(length);fs.readSync(fd,bytes,0,length,16);
    let entry=JSON.parse(bytes.toString());
    for(const key of 'dsh/node_modules/@deepseek-ai/dsh-util-values/lib/index.js'.split('/'))entry=entry?.files?.[key];
    assert.ok(entry&&!entry.unpacked,'Installed public lossless JSON utility is required');
    const source=Buffer.alloc(entry.size);fs.readSync(fd,source,0,source.length,8+header.readUInt32LE(4)+Number(entry.offset));
    return import('data:text/javascript;base64,'+source.toString('base64'));
  }finally{fs.closeSync(fd);}
}
const native=await nativeValidator();

// Synthetic Fs implements the composed public Fs contract. All persisted data
// below lives in this Map; existing workspace projects and Sessions are unread.
class MemoryFS{
  files=new Map();counter=0;writes=[];
  async resolve(value,{cwd='/workspace'}={}){const full=path.resolve(cwd,value);return {targetKey:full,displayPath:full};}
  processPath(target){return target.targetKey;}
  contains(a,b){return b.targetKey===a.targetKey||b.targetKey.startsWith(a.targetKey+'/');}
  async stat(target){const file=this.files.get(target.targetKey);if(file)return {type:'file',version:file.version,size:Buffer.byteLength(file.content)};if(target.targetKey==='/workspace'||[...this.files.keys()].some(p=>p.startsWith(target.targetKey+'/')))return {type:'directory',version:'directory'};}
  async readText(target,signal){signal?.throwIfAborted();const file=this.files.get(target.targetKey);if(!file)throw Object.assign(Error('Missing fixture'),{code:'FS_NOT_FOUND'});return file.content;}
  async readBytes(target,signal,max){const bytes=Buffer.from(await this.readText(target,signal));if(bytes.length>max)throw Object.assign(Error('Too large'),{code:'FS_TOO_LARGE'});return bytes;}
  async readByteRange(target,{offset,length},signal){return (await this.readBytes(target,signal,128*1024*1024)).subarray(offset,offset+length);}
  async listDir(target){const names=new Map();for(const name of this.files.keys())if(name.startsWith(target.targetKey+'/')){const tail=name.slice(target.targetKey.length+1),first=tail.split('/')[0];names.set(first,{name:first,type:tail.includes('/')?'directory':'file'});}return [...names.values()];}
  async writeText(target,content,expected,signal,policy){
    signal?.throwIfAborted();if(!policy||policy.mode==='read-only'||policy.mode==='workspace-write'&&!this.contains({targetKey:policy.workspaceRoot},target))throw Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'});
    const before=this.files.get(target.targetKey);if(expected.kind==='createIfAbsent'&&before||expected.kind==='replaceIfVersion'&&before?.version!==expected.version)throw Object.assign(Error('Stale'),{code:'FS_STALE_VERSION'});
    const version=String(++this.counter);this.files.set(target.targetKey,{content,version});this.writes.push(target.targetKey);return {version,operation:before?'update':'create',before:before?.content??null,after:content};
  }
}
function fixture(){
  const provider=new MemoryFS(),agents=new Map(),globals=new Map();
  const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
  const ctx={fs:provider,effect:start=>start(),connection:{requestRejection:()=>undefined,admit:()=>({peer:{principal:{kind:'owner'},signal:new AbortController().signal}})},sandboxPolicy:{workspaceRoot:'/workspace',resolve:({session}={})=>({...policy,...(session?{sessionId:session.id,workspaceRoot:session.header.cwd}:{})})},webServer:{getOrigin:()=> 'http://fixture.invalid'},
    tools:{register(def){globals.set(def.name,def);return()=>globals.delete(def.name);},schemas:()=>[...globals.values()]},skills:{list:async()=>[],get:async()=>undefined},agentPresets:{compositionInventory:async()=>[{id:'minimal',rows:[]}]},agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'fixture'})},systemPrompt:{section:()=>()=>{}},
    agents:{list:()=>[...agents.values()],get:id=>agents.get(id),async create({sessionId,meta,setup}){
      const scoped=new Map(),runtimeContexts=new Map(),agent={id:sessionId,status:'idle',scoped,runtimeContexts,session:{id:sessionId,header:{cwd:meta.cwd},events:[],snapshotEvents(){return this.events.slice();},append(type,data){this.events.push({seq:this.events.length,time:Date.now(),type,data});}},ctx:{tools:{register(def){scoped.set(def.name,def);return()=>scoped.delete(def.name);},guard:()=>()=>{},restrict:()=>()=>{}},systemPrompt:{section:()=>()=>{},context(contribution){runtimeContexts.set(contribution.name,contribution);return()=>runtimeContexts.delete(contribution.name);}},effect(start){return start();}}};agents.set(sessionId,agent);await setup?.(agent.ctx,agent);return {agent,dispose:async()=>agents.delete(sessionId)};
    }},
    sessionController:{async resolveAgent(id){return agents.has(id)?{agent:agents.get(id)}:{error:{code:'session/not-found'}};},async prompt(request){const agent=agents.get(request.sessionId),turn=(agent.session.events.findLast(event=>event.type==='turn/start')?.data.turn||0)+1;agent.session.append('turn/start',{turn});agent.session.append('user/message',{role:'user',content:request.content,source:{kind:'user',rpcId:request.requestId}});const sections=[...agent.runtimeContexts.values()].map(contribution=>({name:contribution.name,text:contribution.text()})).filter(section=>section.text);if(sections.length)agent.session.append('user/message',{role:'user',source:{kind:'runtime-context',form:'snapshot',sections},content:[{type:'text',text:sections.map(section=>section.text).join('\n\n')}]});agent.status='running';return {accepted:true};},async state({sessionId}){return {cursor:agents.get(sessionId)?.session.events.length||0,active:true,running:agents.get(sessionId)?.status==='running',queue:[],pendingInput:[]};},async events({address}){return {records:agents.get(address.sessionId).session.events.map(event=>({type:'event',event})),hasMore:false};},cancel(){return {accepted:true};}}
  };
  return {service:new DesignerService(ctx,{workspaceRoot:'/workspace'}),provider,agents};
}
const html=label=>`<!doctype html><html><body><h1 data-dsh-node="title">${label}</h1></body></html>`;
async function prepared(t){const f=fixture();t.after(()=>f.service.dispose());await f.service.initialize();const project=await f.service.execute({action:'project.create',name:'Native JSON fixture'},{user:true});const admitted=await f.service.execute({action:'ai.run',projectId:project.id,prompt:'Create a page',target:{scope:'project'}},{user:true});return {...f,project,agent:f.agents.get(admitted.sessionId),exec:{signal:new AbortController().signal}};}
function assertJson(value){
  assert.deepEqual(JSON.parse(JSON.stringify(value)),value,'Returned tool value must already be lossless JSON');
  if(native){assert.equal(native.isJsonValue(value),true);assert.deepEqual(native.snapshotJsonValue(value),value);}
}

test('installed Native public validator rejects optional undefined before normalization',{skip:!native},()=>{
  assert.equal(native.isJsonValue({optional:undefined}),false);assert.equal(native.snapshotJsonValue({optional:undefined}),undefined);
  assertJson(modelSafe({optional:undefined,array:[undefined,,null]}));
});

test('actual scoped task.get and help return lossless JSON at the registered tool boundary',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_workbench');
  for(const args of [{action:'task.get'},{action:'help'}]){
    const result=await tool.execute(args,f.exec);assertJson(result);
    if(args.action==='task.get'){assert.equal(result.projectId,f.project.id);assert.equal(result.scope,'project');assert.equal(result.effectiveBinding.name,undefined);}
  }
});

test('actual create then replace commits return durable artboard identities and revisions after persistence',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_commit_html');
  let project=(await f.service.store.projectGet(f.project.id)).project;
  const created=await tool.execute({newPage:true,name:'Native page',html:html('Created'),expectedRevision:project.revision},f.exec);assertJson(created);assert.ok(created.artboard?.id);
  project=(await f.service.store.projectGet(f.project.id)).project;assert.equal(created.projectRevision,project.revision);
  const savedCreated=project.artboards.find(p=>p.id===created.artboard.id);assert.ok(savedCreated.lastTaskCommit);assert.ok(!f.service.aiWorkbench.taskFor(f.agent).pageIds.includes(created.artboard.id));assert.equal((await f.service.store.artboardGet(project.id,savedCreated.id)).html,normalizeDocument(html('Created')).html);
  // Replace the page admitted when this task was frozen; creating a new page
  // does not expand that task's existing-page write grant.
  const initial=project.artboards.find(p=>p.id===f.service.aiWorkbench.taskFor(f.agent).pageIds[0]);
  const replaced=await tool.execute({html:html('Replaced'),expectedRevision:project.revision,expectedArtboardRevision:initial.revision},f.exec);
  const after=(await f.service.store.projectGet(project.id)).project;
  assert.equal(normalizeDocument((await f.service.store.artboardGet(project.id,initial.id)).html).nodes.title.text,'Replaced');
  assertJson(replaced);assert.equal(replaced.artboard.id,initial.id);assert.equal(replaced.artboard.revision,after.artboards.find(p=>p.id===initial.id).revision);assert.equal(replaced.projectRevision,after.revision);assert.ok(replaced.projectRevision>created.projectRevision);
  assert.equal(normalizeDocument((await f.service.store.artboardGet(project.id,initial.id)).html).nodes.title.text,'Replaced');
  // Native serialization succeeds after the mutation; stale retries still fail
  // conflict protection instead of silently repeating an already saved operation.
  const writes=f.provider.writes.length;
  await assert.rejects(tool.execute({artboardId:initial.id,html:html('Stale'),expectedRevision:project.revision,expectedArtboardRevision:initial.revision},f.exec),{code:'VERSION_CONFLICT'});assert.equal(f.provider.writes.length,writes);
});

test('registered global tools and scoped post-processing preserve modelSafe redactions',async t=>{
  const f=await prepared(t),original=f.service.executeOperation.bind(f.service);
  f.service.executeOperation=async(input,env)=>input.action==='probe.json'?{nested:[{optional:undefined,capability:'SECRET',password:'SECRET'}],url:'/api/designer/download/SECRET/x'}:original(input,env);
  const global=f.service.workbenchTool(),result=await global.execute({action:'probe.json'},{...f.exec,agent:{id:'ordinary'}});assertJson(result);assert.deepEqual(result.nested,[{}]);assert.ok(!JSON.stringify(result).includes('SECRET'));
  const taskSummary=f.service.aiWorkbench.taskSummary.bind(f.service.aiWorkbench);
  f.service.aiWorkbench.taskSummary=(...args)=>({...taskSummary(...args),nested:[{optional:undefined,previewTicket:'SECRET'}],url:'/api/designer/resource/SECRET/x'});
  const scoped=await f.agent.scoped.get('designer_workbench').execute({action:'task.get'},f.exec);assertJson(scoped);assert.deepEqual(scoped.nested,[{}]);assert.ok(!JSON.stringify(scoped).includes('SECRET'));
  f.service.executeOperation=async()=>({invalid:NaN});
  await assert.rejects(global.execute({action:'probe.json'},{...f.exec,agent:{id:'ordinary'}}),{code:'INVALID_MODEL_OUTPUT'});
});

test('native scene validation is read-only through the full owner dispatch and returns coverage',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_workbench');
  const project=(await f.service.store.projectGet(f.project.id)).project;
  const page=project.artboards.find(p=>p.id===f.service.aiWorkbench.taskFor(f.agent).pageIds[0]);
  const result=await tool.execute({action:'edit.validate',options:{pageId:page.id,requiredSceneIds:['detail']}},f.exec);
  assertJson(result);assert.equal(result.valid,false);assert.equal(result.page.id,page.id);assert.deepEqual(result.sceneCoverage.missingSceneIds,['detail']);
  const after=(await f.service.store.projectGet(f.project.id)).project;
  assert.equal(after.revision,project.revision);assert.deepEqual(after.history,project.history);assert.deepEqual(after.artboards,page?project.artboards:[]);
});

test('one native HTML commit saves state operations atomically and validates through the normal route',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_commit_html');
  const project=(await f.service.store.projectGet(f.project.id)).project,page=project.artboards[0];
  const operations=[{type:'scene.set',scene:{id:'detail',name:'详情',nodes:{panel:{hidden:false}}}},{type:'interaction.set',interaction:{id:'open-detail',type:'scene',sourceId:'open',sceneId:'detail'}}];
  const source='<!doctype html><html><body><button data-dsh-node="open">详情</button><section data-dsh-node="panel" hidden>可编辑详情</section></body></html>';
  const saved=await tool.execute({artboardId:page.id,html:source,operations,expectedRevision:project.revision,expectedArtboardRevision:page.revision},f.exec);
  assertJson(saved);assert.equal(saved.sceneCount,1);assert.equal(saved.interactionCount,1);const persisted=normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html);
  assert.equal(persisted.scenes.items[0].id,'detail');assert.equal(persisted.interactions[0].sceneId,'detail');assert.ok(persisted.nodes.panel);
  const before=(await f.service.store.projectGet(project.id)).project;
  const validation=await f.agent.scoped.get('designer_workbench').execute({action:'edit.validate',options:{pageId:page.id,requiredSceneIds:['detail']}},f.exec);
  assert.equal(validation.valid,true);assert.deepEqual(validation.sceneCoverage.missingSceneIds,[]);assert.equal((await f.service.store.projectGet(project.id)).project.revision,before.revision);
  await assert.rejects(tool.execute({artboardId:page.id,html:source,operations:[{type:'scene.set',scene:{id:'missing',nodes:{absent:{hidden:false}}}}],expectedRevision:before.revision},f.exec),error=>{const receipt=JSON.parse(error.message);assert.equal(receipt.saved,false);assert.equal(receipt.stage,'document-validation');assert.ok(receipt.error.code);return true;});
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,before.revision);
  assert.deepEqual(normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html).scenes,persisted.scenes);
});

test('native staged generation copies repeated content and registers scenes without re-emitting HTML',async t=>{
  const f=await prepared(t),project=(await f.service.store.projectGet(f.project.id)).project,page=project.artboards[0];
  const commit=f.agent.scoped.get('designer_commit_html'),workbench=f.agent.scoped.get('designer_workbench');
  const saved=await commit.execute({artboardId:page.id,expectedRevision:project.revision,html:'<!doctype html><html><body><main data-dsh-node="list"><article data-dsh-node="row"><h2 data-dsh-node="name">张明</h2><button data-dsh-node="open">详情</button><p data-dsh-node="detail" hidden>示例详情</p></article></main></body></html>'},f.exec);
  const copied=await workbench.execute({action:'edit.apply',options:{pageId:page.id,expectedRevision:saved.projectRevision,operations:[
    {type:'duplicate',nodeIds:['row'],copies:[{prefix:'second',nodes:{name:{text:'李晓'}}}]},
    {type:'scene.set',scene:{id:'second-details',name:'李晓详情',nodes:{'second:detail':{hidden:false}}}},
    {type:'interaction.set',interaction:{id:'open-second',type:'scene',sourceId:'second:open',sceneId:'second-details'}},
  ]}},f.exec);
  assertJson(copied);assert.equal(copied.changes.copies[0].nodeIdMap.name,'second:name');
  assert.equal(copied.sceneCount,1);assert.equal(copied.interactionCount,1);
  const doc=normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html);
  assert.equal(doc.nodes['second:name'].text,'李晓');assert.equal(doc.nodes.name.text,'张明');
  const validation=await workbench.execute({action:'edit.validate',options:{pageId:page.id,requiredSceneIds:['second-details']}},f.exec);
  assertJson(validation);assert.equal(validation.valid,true);
  const before=(await f.service.store.projectGet(project.id)).project.revision;
  await assert.rejects(workbench.execute({action:'edit.apply',options:{pageId:page.id,expectedRevision:saved.projectRevision,operations:[{type:'duplicate',nodeIds:['row'],copies:[{prefix:'stale'}]}]}},f.exec));
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,before);
});

test('native commit retries resolve pending scenes atomically from the failed HTML',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_commit_html'),project=(await f.service.store.projectGet(f.project.id)).project,page=project.artboards[0];
  const source='<!doctype html><html><body><p data-dsh-node="label">Ready</p><script id="dsh-document-model" type="application/json">'+JSON.stringify({schemaVersion:1,scenes:{active:'start',items:[]}})+'</script></body></html>';
  const args={artboardId:page.id,html:source,operations:[],expectedRevision:project.revision,expectedArtboardRevision:page.revision};
  let failed;
  await assert.rejects(tool.execute(args,f.exec),error=>{failed=JSON.parse(error.message);return failed.saved===false;});
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,project.revision);
  f.agent.session.append('tool/call',{callId:'pending-scenes',name:'designer_commit_html',arguments:JSON.stringify(args)});
  f.agent.session.append('tool/result',{message:{toolCallId:'pending-scenes',isError:true,content:[{type:'text',text:'Error: '+JSON.stringify(failed)}]}});
  const saved=await tool.execute({retryLast:true,expectedRevision:project.revision,operations:[{type:'scene.set',scene:{id:'start',name:'Start',nodes:{}}}]},f.exec);
  assert.equal(saved.saved,true);assert.equal(saved.sceneCount,1);
  const document=normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html);
  assert.equal(document.scenes.active,'start');assert.equal(document.nodes.label.text,'Ready');
});

test('precise failed-commit diagnostics allow a small native-history retry without regenerating HTML',async t=>{
  const f=await prepared(t),tool=f.agent.scoped.get('designer_commit_html'),project=(await f.service.store.projectGet(f.project.id)).project,page=project.artboards[0];
  const source='<!doctype html><html><body><form data-dsh-node="form"><input data-dsh-node="date" type="date" min="2026-11-15" max="2026-12-14"></form></body></html>';
  const operations=[{type:'scene.set',scene:{id:'filled',nodes:{date:{attributes:{value:'2026-11-16'}}}}},{type:'interaction.set',interaction:{id:'submit',type:'form',sourceId:'form',rules:[{nodeId:'date',required:true,pattern:'(2026)'}]}}];
  const args={artboardId:page.id,html:source,operations,expectedRevision:project.revision,expectedArtboardRevision:page.revision};
  let failed;await assert.rejects(tool.execute(args,f.exec),error=>{failed=JSON.parse(error.message);return true;});assertJson(failed);assert.equal(failed.saved,false);assert.equal(failed.recovery.retryLast,true);assert.ok(failed.error.details.diagnostics.some(d=>d.message.includes('without grouping parentheses')));
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,project.revision);
  f.agent.session.append('tool/call',{callId:'failed-commit',name:'designer_commit_html',arguments:JSON.stringify(args)});
  f.agent.session.append('tool/result',{message:{toolCallId:'failed-commit',isError:true,content:[{type:'text',text:'Error: '+JSON.stringify(failed)}]}});
  await assert.rejects(tool.execute({retryLast:true,artboardId:'a-other',expectedRevision:project.revision},f.exec),{code:'COMMIT_TARGET_CHANGED'});
  const retry={retryLast:true,expectedRevision:project.revision,operations:[{type:'interaction.set',interaction:{id:'submit',type:'form',sourceId:'form',rules:[{nodeId:'date',required:true}]}}]};
  const saved=await tool.execute(retry,f.exec);assertJson(saved);assert.equal(saved.saved,true);assert.equal(saved.sceneCount,1);assert.equal(saved.interactionCount,1);
  const content=normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html);assert.equal(content.interactions[0].rules[0].pattern,undefined);assert.equal(content.scenes.items[0].id,'filled');
  f.agent.session.append('tool/call',{callId:'recovered-commit',name:'designer_commit_html',arguments:JSON.stringify(retry)});
  f.agent.session.append('tool/result',{message:{toolCallId:'recovered-commit',isError:false,content:[{type:'text',text:JSON.stringify(saved)}]}});
  await assert.rejects(tool.execute({retryLast:true,expectedRevision:saved.projectRevision},f.exec),{code:'FAILED_COMMIT_NOT_FOUND'});
});

for(const packaged of [true,false])test(`native pattern copy with ${packaged?'package':'compatible legacy'} catalog preserves scopes and editable scenes`,async t=>{
  const {desktopSystemFiles}=await import('./desktop-theme.js');
  const f=await prepared(t);
  f.agent.status='idle';
  f.agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});
  const system=await f.service.execute({action:'system.import',system:{name:'Pattern fixture',platforms:['web'],versions:[{version:1,resources:desktopSystemFiles({primary:'#663399'}).filter(file=>packaged||!['skeletons.json','patterns/desktop-records.html'].includes(file.logicalPath))}]}},{user:true});
  let project=(await f.service.store.projectGet(f.project.id)).project;
  await f.service.execute({action:'binding.set',projectId:project.id,systemId:system.id,version:1,expectedRevision:project.revision},{user:true});
  await f.service.execute({action:'ai.run',projectId:project.id,prompt:'Copy and tailor the bound pattern',target:{scope:'project'}},{user:true});
  project=(await f.service.store.projectGet(project.id)).project;
  const page=project.artboards[0],tool=f.agent.scoped.get('designer_workbench'),commit=f.agent.scoped.get('designer_commit_html');
  const summary=await tool.execute({action:"task.get"},f.exec);
  const resourceId=summary.effectiveBinding.resourceId;
  const guide=await tool.execute({action:'generation.guide',options:{topic:'system'}},f.exec);
  assertJson(guide);assert.equal(guide.topic,'system');
  const direct=await f.service.execute({action:'generation.guide',projectId:project.id,topic:'system'},{agent:f.agent});
  assert.deepEqual(direct.steps,guide.steps);
  const catalog=await tool.execute({action:'system.patterns',options:{resourceId}},f.exec);
  assertJson(catalog);assert.equal(JSON.parse(catalog.text).patterns[0].id,'desktop-records');
  assert.equal(JSON.parse(catalog.text).source,packaged?'package':'host');
  await assert.rejects(commit.execute({artboardId:page.id,expectedRevision:project.revision-1,pattern:{resourceId,patternId:'desktop-records'}},f.exec),{code:'VERSION_CONFLICT'});
  await assert.rejects(commit.execute({artboardId:page.id,expectedRevision:project.revision,pattern:{resourceId:'binding:foreign',patternId:'desktop-records'}},f.exec),{code:'REFERENCE_NOT_FOUND'});
  await assert.rejects(commit.execute({artboardId:page.id,expectedRevision:project.revision,pattern:{resourceId,patternId:'desktop-records'},operations:[{type:'text',nodeIds:['absent-node'],value:'invalid'}]},f.exec));
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,project.revision);
  const copied=await commit.execute({artboardId:page.id,expectedRevision:project.revision,pattern:{resourceId,patternId:'desktop-records'},operations:[{type:'text',nodeIds:['page-title'],value:'社区服务预约'}]},f.exec);
  assertJson(copied);assert.equal(copied.saved,true);assert.equal(copied.sceneCount,9);assert.equal(copied.interactionCount,24);
  assert.equal(copied.pattern.editableNodes.title,'page-title');
  assert.equal(copied.pattern.source,packaged?'package':'host');
  const saved=normalizeDocument((await f.service.store.artboardGet(project.id,page.id)).html);
  assert.equal(saved.nodes['page-title'].text,'社区服务预约');
  assert.match(saved.resources.find(row=>row.attribute==='href').url,/assets\/system-/);
  const valid=await tool.execute({action:'edit.validate',options:{pageId:page.id,requiredSceneIds:copied.pattern.sceneIds}},f.exec);
  assert.equal(valid.valid,true);
  const current=(await f.service.store.projectGet(project.id)).project;
  await assert.rejects(commit.execute({artboardId:page.id,expectedRevision:current.revision,pattern:{resourceId,patternId:'absent'}},f.exec),{code:'REFERENCE_NOT_FOUND'});
  assert.equal((await f.service.store.projectGet(project.id)).project.revision,current.revision);
});
