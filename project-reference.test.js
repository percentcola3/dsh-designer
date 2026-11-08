import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {DesignerStore} from './store.js';
import {WorkspaceService} from './workspace-service.js';
import {AIWorkbench,assertAction} from './ai-workbench.js';

const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
const code=code=>error=>error.code===code;
class MemoryFS {
  files=new Map();aliases=new Map();reads=[];counter=0;denied=null;
  async resolve(value,{cwd='/workspace'}={}){let full=path.resolve(cwd,value);for(const [from,to]of this.aliases)if(full===from||full.startsWith(from+'/'))full=to+full.slice(from.length);return {targetKey:full,displayPath:full};}
  processPath(t){return t.displayPath;}
  contains(a,b){return b.targetKey===a.targetKey||b.targetKey.startsWith(a.targetKey+'/');}
  check(t){if(this.denied&&t.targetKey.startsWith(this.denied))throw Object.assign(Error('read denied by composed Fs'),{code:'FS_SANDBOX_DENIED'});}
  async stat(t){this.check(t);const f=this.files.get(t.targetKey);return f?{type:'file',version:f.version,size:f.bytes.length}:[...this.files.keys()].some(k=>k.startsWith(t.targetKey+'/'))?{type:'directory',version:'dir'}:undefined;}
  async readBytes(t,_signal,max){this.check(t);this.reads.push({path:t.targetKey,max});const f=this.files.get(t.targetKey);if(!f)throw Object.assign(Error('missing'),{code:'FS_NOT_FOUND'});assert.ok(f.bytes.length<=max);return Buffer.from(f.bytes);}
  async readText(t,signal,max=2000000){return (await this.readBytes(t,signal,max)).toString('utf8');}
  async readByteRange(t,range){this.check(t);this.reads.push({path:t.targetKey,...range});const f=this.files.get(t.targetKey);if(!f)throw Object.assign(Error('missing'),{code:'FS_NOT_FOUND'});return Buffer.from(f.bytes.subarray(range.offset,range.offset+range.length));}
  async writeText(t,value,intent,_signal,p){assert.ok(p);assert.notEqual(p.mode,'read-only');assert.ok(this.contains({targetKey:p.workspaceRoot},t));const old=this.files.get(t.targetKey);if(intent.kind==='createIfAbsent'?!!old:old?.version!==intent.version)throw Object.assign(Error('stale'),{code:'FS_STALE_VERSION'});const version=String(++this.counter);this.files.set(t.targetKey,{bytes:Buffer.from(value),version});return {version};}
}
async function fixture(){
  const fs=new MemoryFS(),store=new DesignerStore({fs,workspaceRoot:'/workspace',policy:()=>policy}),owner={store,ctx:{fs},policy:()=>policy,bindings:new Map()};
  const workspace=new WorkspaceService(owner);owner.workbench=workspace;const ai=owner.aiWorkbench=new AIWorkbench(owner);
  const target=(await workspace.execute({action:'project.initialize',name:'Target'},{user:true,policy})).project;
  const source=(await workspace.execute({action:'project.initialize',name:'Source',goal:'Source goal',requirements:'Public requirements',rules:'Public rules'},{user:true,policy})).project;
  async function change(id,fn){const current=await workspace.project(id);return store.mutate(id,current.revision,'test',fn,undefined,policy,false);}
  const agent={id:'designer-'+target.id};owner.bindings.set(agent.id,target.id);
  const ref=async(id=source.id)=>({type:'project',projectId:target.id,referencedProjectId:id,resourceId:`project:${id}`,sourceVersion:(await workspace.project(id)).revision,label:'Selected project'});
  const resolve=(reference,env={user:true})=>workspace.execute({action:'reference.resolve',projectId:target.id,reference},{policy,...env});
  const prepare=async(reference)=>ai.prepare({projectId:target.id,prompt:'Use the project as reference',target:{projectId:target.id,scope:'project'},references:[reference??await ref()]},{user:true,policy});
  return {fs,store,workspace,ai,owner,target,source,agent,change,ref,resolve,prepare};
}

test('user fixed revision resolves a readonly namespaced overview with real page excerpt',async()=>{
  const f=await fixture(),design=f.source.workbench.designs[0],initial=f.source.artboards[0],read=await f.workspace.execute({action:'file.read',projectId:f.source.id,path:initial.htmlPath});
  const saved=await f.workspace.execute({action:'file.write',projectId:f.source.id,expectedRevision:f.source.revision,fileId:read.fileId,expectedVersion:read.version,content:'<html><body><main>Actual source page</main></body></html>'},{user:true,policy}),page=saved.pages.find(page=>page.id===initial.id);
  const result=await f.resolve(await f.ref());assert.equal(result.projectId,f.target.id);assert.equal(result.referencedProjectId,f.source.id);assert.equal(result.resourceId,`project:${f.source.id}`);assert.equal(result.sourceVersion,saved.projectRevision);assert.equal(result.readonly,true);assert.equal(result.snapshot.readonly,true);assert.equal(result.projectReference.name,'Source');assert.equal(result.snapshot.requirements.text,'Public requirements');assert.equal(result.snapshot.rules.text,'Public rules');assert.equal(result.snapshot.designs[0].id,design.id);assert.equal(result.snapshot.pages[0].id,page.id);assert.match(result.snapshot.firstPage.text,/Actual source page/);assert.equal(result.text,JSON.stringify(result.snapshot));assert.equal(result.contentHash.length,64);assert.equal('htmlPath' in result.snapshot.pages[0],false);
});

test('project references require exact positive revision and project namespace, preserving owner scope',async()=>{
  const f=await fixture(),ref=await f.ref();for(const sourceVersion of [undefined,0,-1,1.2,'2',ref.sourceVersion+1])await assert.rejects(f.resolve({...ref,sourceVersion}),code('REFERENCE_VERSION_CONFLICT'));
  await assert.rejects(f.resolve({...ref,resourceId:f.source.id}),code('INVALID_INPUT'));
  await assert.rejects(f.resolve({...ref,projectId:f.source.id}),code('PROJECT_SCOPE'));
  await assert.rejects(f.resolve({...ref,fileId:'f-other'}),code('INVALID_INPUT'));
  await assert.rejects(f.resolve({type:'file',projectId:f.source.id,resourceId:'f-other'}),code('PROJECT_SCOPE'));
  await assert.rejects(f.resolve({type:'page',referencedProjectId:f.source.id,resourceId:'a-other'}),code('PROJECT_SCOPE'));
});

test('changed, deleted and archived source projects invalidate selected references',async()=>{
  for(const kind of ['change','delete','archive']){const f=await fixture(),ref=await f.ref(),prepared=await f.prepare(ref);await f.change(f.source.id,p=>{if(kind==='change')p.name='Updated';if(kind==='delete')p.deletedAt='now';if(kind==='archive')p.archived=true;});await assert.rejects(f.resolve(ref),code(kind==='change'?'REFERENCE_VERSION_CONFLICT':'REFERENCE_NOT_FOUND'));const result=await f.ai.revalidate(prepared.task);assert.equal(result.invalid,true);assert.equal(result.current[0].reason,kind==='change'?'REFERENCE_VERSION_CONFLICT':'REFERENCE_NOT_FOUND');assert.equal(prepared.task.refs[0].invalid,false);}
});

test('overview excludes private metadata, private documents and canonical aliases to private files',async()=>{
  const f=await fixture();await f.change(f.source.id,p=>{p.aiSessionId=`designer-${p.id}`;p.workbench.sessionId='SECRET_SESSION';p.credentials={token:'SECRET_TOKEN'};p.paths=['/SECRET_PATH'];p.capabilities=['SECRET_CAP'];p.workbench.requirementsPath='.machine/requirements.md';p.workbench.rulesPath='docs/credentials.md';p.workbench.sourceProjects=[{id:'r-secret',root:'/SECRET_ROOT'}];});
  for(const rel of ['.machine/requirements.md','docs/credentials.md','.workbench/state.json','.git/config','.env'])f.fs.files.set(`/workspace/DesignerLibrary/projects/${f.source.id}/${rel}`,{bytes:Buffer.from('SECRET_BYTES'),version:'secret'});
  const result=await f.resolve(await f.ref());assert.doesNotMatch(result.text,/SECRET|credentials|paths|capabilities|sessionId|\.machine|\.workbench|\.git|\.env/);assert.equal(result.snapshot.requirements,undefined);assert.equal(result.snapshot.rules,undefined);
  await f.change(f.source.id,p=>{p.workbench.requirementsPath='docs/alias.md';p.workbench.rulesPath='docs/rules.md';p.workbench.files.find(x=>x.path==='docs/rules.md').private=true;});f.fs.aliases.set(`/workspace/DesignerLibrary/projects/${f.source.id}/docs/alias.md`,`/workspace/DesignerLibrary/projects/${f.source.id}/.env`);const aliased=await f.resolve(await f.ref());assert.equal(aliased.snapshot.requirements,undefined);assert.equal(aliased.snapshot.rules,undefined);assert.doesNotMatch(aliased.text,/SECRET/);
});

test('unadmitted agents cannot invent project references even with user flag or other tasks',async()=>{
  const f=await fixture(),ref=await f.ref();await assert.rejects(f.resolve(ref,{agent:f.agent}),code('SCOPE_DENIED'));await assert.rejects(f.resolve(ref,{agent:f.agent,user:true}),code('SCOPE_DENIED'));
  const prepared=await f.prepare(ref);f.ai.setTask(f.agent,prepared.task);assert.equal((await f.resolve(ref,{agent:f.agent})).readonly,true);
  const other=(await f.workspace.execute({action:'project.initialize',name:'Other'},{user:true,policy})).project,otherRef=await f.ref(other.id);await assert.rejects(f.resolve(otherRef,{agent:f.agent}),code('SCOPE_DENIED'));await assert.rejects(f.ai.authorizeAction({action:'reference.resolve',projectId:f.target.id,reference:otherRef},{agent:f.agent,policy}),code('SCOPE_DENIED'));await assert.rejects(f.resolve({...ref,sourceVersion:ref.sourceVersion+1},{agent:f.agent}),code('SCOPE_DENIED'));
});

test('context reads only admitted project namespace and never adds target or file write grants',async()=>{
  const f=await fixture(),d=await f.workspace.execute({action:'design.create',projectId:f.source.id,expectedRevision:f.source.revision,name:'Source design'},{user:true,policy}),page=await f.workspace.execute({action:'page.create',projectId:f.source.id,expectedRevision:d.projectRevision,designId:d.design.id,name:'Source page'},{user:true,policy}),prepared=await f.prepare(),ref=prepared.task.refs[0];assert.equal(ref.kind,'project');assert.equal(ref.reference.referencedProjectId,f.source.id);assert.equal('text' in ref,false);assert.equal('snapshot' in ref,false);assert.deepEqual(prepared.task.designIds,f.target.workbench.designs.map(d=>d.id));assert.deepEqual(prepared.task.pageIds,f.target.artboards.map(a=>a.id));assert.equal(prepared.task.sourceWrite,null);assert.equal(f.owner.bindings.get(f.agent.id),f.target.id);
  const r=await f.ai.readContext({resourceId:ref.resourceId,limit:80},{task:prepared.task,policy});assert.equal(r.readonly,true);assert.equal(r.text.length,80);assert.equal(r.nextOffset,80);assert.equal(r.sourceVersion,ref.sourceVersion);assert.equal(r.contentHash,ref.contentHash);
  for(const resourceId of [f.source.id,page.page.id,d.design.id,'project:p-missing',`project:${f.source.id}/docs/requirements.md`])await assert.rejects(f.ai.readContext({resourceId},{task:prepared.task,policy}),code('REFERENCE_NOT_FOUND'));
  for(const input of [{action:'file.write',projectId:f.source.id,path:'docs/requirements.md'},{action:'file.write',projectId:f.target.id,referencedProjectId:f.source.id,path:'docs/requirements.md'},{action:'file.write',projectId:f.target.id,fileId:ref.resourceId,path:'docs/requirements.md'},{action:'file.write',projectId:f.target.id,sourceProjectId:f.source.id,path:'docs/requirements.md'}])assert.throws(()=>assertAction(input,{task:prepared.task,policy}),e=>['PROJECT_SCOPE','SCOPE_DENIED'].includes(e.code));
});

test('overview content hash detects on-disk edits without metadata revision and revalidates',async()=>{
  const f=await fixture(),prepared=await f.prepare(),ref=prepared.task.refs[0],location=`/workspace/DesignerLibrary/projects/${f.source.id}/docs/requirements.md`;f.fs.files.set(location,{bytes:Buffer.from('External edit'),version:'external'});
  await assert.rejects(f.ai.readContext({resourceId:ref.resourceId},{task:prepared.task,policy}),code('REFERENCE_VERSION_CONFLICT'));const result=await f.ai.revalidate(prepared.task);assert.equal(result.invalid,true);assert.equal(result.current[0].reason,'REFERENCE_CONTENT_CHANGED');
});

test('overview uses bounded reads and at most 60000 serialized characters with hostile large content',async()=>{
  const f=await fixture();await f.change(f.source.id,p=>{p.description='\0'.repeat(4000);p.workbench.goal='\0'.repeat(4000);p.workbench.designs=Array.from({length:80},(_,i)=>({id:'d-'+i,name:'\0'.repeat(200),pageIds:[]}));});for(const rel of ['docs/requirements.md','docs/rules.md'])f.fs.files.set(`/workspace/DesignerLibrary/projects/${f.source.id}/${rel}`,{bytes:Buffer.from('\0'.repeat(2000000)),version:'huge'});
  f.fs.reads=[];const result=await f.resolve(await f.ref());assert.ok(result.text.length<=60000);assert.equal(result.snapshot.requirements.truncated,true);assert.ok(f.fs.reads.filter(r=>r.length!==undefined).every(r=>r.length<=32004));assert.equal(f.fs.reads.some(r=>r.max&&r.path.endsWith('/docs/requirements.md')),false);
});

test('composed Fs policy denial remains fatal without native or external read fallback',async()=>{
  const f=await fixture(),ref=await f.ref();f.fs.denied=`/workspace/DesignerLibrary/projects/${f.source.id}/docs`;await assert.rejects(f.resolve(ref),code('FS_SANDBOX_DENIED'));
});
