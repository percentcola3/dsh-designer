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
  const created=await tool.execute({name:'Native page',html:html('Created'),expectedRevision:project.revision},f.exec);assertJson(created);assert.ok(created.artboard?.id);
  project=(await f.service.store.projectGet(f.project.id)).project;assert.equal(created.projectRevision,project.revision);
  const savedCreated=project.artboards.find(p=>p.id===created.artboard.id);assert.ok(savedCreated.lastTaskCommit);assert.equal((await f.service.store.artboardGet(project.id,savedCreated.id)).html,normalizeDocument(html('Created')).html);
  // Replace the page admitted when this task was frozen; creating a new page
  // does not expand that task's existing-page write grant.
  const initial=project.artboards.find(p=>p.id===f.service.aiWorkbench.taskFor(f.agent).pageIds[0]);
  const replaced=await tool.execute({artboardId:initial.id,html:html('Replaced'),expectedRevision:project.revision,expectedArtboardRevision:initial.revision},f.exec);
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
