import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DesignerService} from './index.js';
import {sourceElement} from './framework-compiler.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
const html='<!doctype html><html><head><title>Existing HTML</title></head><body><main data-dsh-node="old">Legacy content</main></body></html>';
const code=kind=>kind==='react'?'export default function App(){return <main><span>Original heading</span><aside>Preserve sibling</aside></main>}':'<script setup>const title="Original heading"</script><template><main><span>{{title}}</span><aside>Preserve sibling</aside></main></template><style>main{color:navy}</style>';

class MemoryFS{
  files=new Map();writes=[];aliases=new Map();serial=0;
  async resolve(value,{cwd='/workspace',signal}={}){signal?.throwIfAborted();let key=path.resolve(cwd,value);for(const [from,to]of this.aliases)if(key===from||key.startsWith(from+'/')){key=to+key.slice(from.length);break;}return {key};}
  processPath=t=>t.key;
  contains=(a,b)=>b.key===a.key||b.key.startsWith(a.key+'/');
  async stat(t){const file=this.files.get(t.key);if(file)return {type:'file',version:file.version,size:file.bytes.length};if(t.key==='/workspace'||[...this.files.keys()].some(key=>key.startsWith(t.key+'/')))return {type:'directory',version:'directory'};}
  async listDir(t){const entries=new Map();for(const key of this.files.keys())if(key.startsWith(t.key+'/')){const tail=key.slice(t.key.length+1),name=tail.split('/')[0];entries.set(name,{name,type:tail.includes('/')?'directory':'file'});}return [...entries.values()];}
  async readBytes(t,signal,max=Infinity){signal?.throwIfAborted();const file=this.files.get(t.key);if(!file)throw Object.assign(Error('Missing'),{code:'FS_NOT_FOUND'});if(file.bytes.length>max)throw Object.assign(Error('Bounded read'),{code:'FS_TOO_LARGE'});return Buffer.from(file.bytes);}
  async readText(t,signal){return (await this.readBytes(t,signal)).toString();}
  async readByteRange(t,{offset,length},signal){return (await this.readBytes(t,signal)).subarray(offset,offset+length);}
  async writeText(t,value,intent,signal,p){signal?.throwIfAborted();if(!p||p.mode==='read-only'||p.mode==='workspace-write'&&![p.workspaceRoot,...(p.additionalWritableRoots||[])].some(root=>root&&this.contains({key:root},t)))throw Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'});const old=this.files.get(t.key);if(intent.kind==='createIfAbsent'?!!old:old?.version!==intent.version)throw Object.assign(Error('Stale'),{code:'FS_STALE_VERSION'});const version=String(++this.serial);this.files.set(t.key,{bytes:Buffer.from(value),version});this.writes.push({path:t.key,policy:p});return {version};}
  snapshot(){return [...this.files].map(([key,value])=>[key,value.bytes.toString('base64'),value.version]);}
}
function fixture(){
  const fs=new MemoryFS(),ctx={fs,connection:{},sandboxPolicy:{workspaceRoot:'/workspace',resolve:()=>policy},agents:{get:()=>undefined,list:()=>[]},tools:{schemas:()=>[]}};
  const owner=new DesignerService(ctx,{workspaceRoot:'/workspace'}),env={user:true,policy};
  return {owner,fs,env,async setup(kind='react'){
    const project=await owner.execute({action:'project.create',name:'Framework '+kind},{user:true});
    const basis=await owner.workbench.project(project.id),page=basis.artboards[0];
    const saved=await owner.framework.execute({action:'framework.write',projectId:project.id,pageId:page.id,expectedRevision:basis.revision,kind,entry:kind==='react'?'App.jsx':'App.vue',files:[{path:kind==='react'?'App.jsx':'App.vue',code:code(kind)}]},env);
    return saved;
  }};
}
async function selection(f,saved){
  const p=await f.owner.workbench.project(saved.project.id),page=p.artboards.find(p=>p.id===saved.page.id),entry=page.artifact.entry,read=await f.owner.framework.read({projectId:p.id,pageId:page.id,path:entry},f.env),source=read.files[0],node=page.artifact.manifest.find(n=>n.path===entry&&n.tag==='span');
  const element=sourceElement({path:entry,framework:page.artifact.kind,code:source.code,nodeId:node.id});
  const object={sourceNodeId:node.id,nodeId:'runtime-instance',instanceId:'instance-1',sourceLocator:{id:node.id,path:entry,sourceHash:source.sourceHash},outerHTML:'<span data-dsh-source="'+node.id+'">Original heading</span>',artifact:{buildId:page.artifact.buildId,version:page.artifact.version},documentEpoch:'document-1',renderEpoch:'render-1',sceneId:'query'};
  const framework=await f.owner.framework.resolveSelection(p,page,{objects:[object]},f.env),task={projectId:p.id,designId:page.designId,pageId:page.id,scope:'selection',framework,writeBoundaryPaths:[p.workbench.designs.find(d=>d.id===page.designId).folder]};
  return {project:p,page,entry,source,node,element,object,framework,task,env:{policy,task,target:task}};
}

for(const kind of ['react','vue'])test(kind+' persists canonical source IDs and the real compiled preview manifest',async()=>{
  const f=fixture(),saved=await f.setup(kind),read=await f.owner.framework.read({projectId:saved.project.id,pageId:saved.page.id},f.env),source=read.files.find(file=>file.path===saved.artifact.entry),manifest=saved.artifact.manifest;
  assert.ok(manifest.length>=3);assert.equal(new Set(manifest.map(n=>n.id)).size,manifest.length);assert.match(source.code,/data-dsh-source=/);
  for(const node of manifest){const file=read.files.find(file=>file.path===node.path);assert.ok(file);assert.equal(node.sourceHash,hash(file.code));assert.equal(saved.artifact.sourceHashes[node.path],hash(file.code));assert.equal(sourceElement({path:node.path,framework:kind,code:file.code,nodeId:node.id}).elementHash,node.elementHash);}
  const built=await f.owner.workbench.readAt(saved.project,saved.page.htmlPath,f.env);assert.equal(hash(built.bytes),saved.page.contentHash);assert.match(built.bytes.toString(),/data-dsh-framework-runtime="true"/);assert.match(built.bytes.toString(),/Original heading/);assert.match(built.bytes.toString(),/<script>/);assert.ok(built.bytes.length>10000,'Installed framework runtime must be bundled into the preview');
  const rebuilt=await f.owner.framework.execute({action:'framework.build',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision},f.env),again=await f.owner.framework.read({projectId:saved.project.id,pageId:saved.page.id},f.env);
  assert.deepEqual(again.files.map(file=>[file.path,file.code,file.sourceHash]),read.files.map(file=>[file.path,file.code,file.sourceHash]));assert.deepEqual(rebuilt.artifact.manifest.map(n=>n.id),manifest.map(n=>n.id));assert.equal(rebuilt.artifact.version,saved.artifact.version+1);assert.notEqual(rebuilt.artifact.buildId,saved.artifact.buildId);assert.notEqual(rebuilt.page.htmlPath,saved.page.htmlPath);
  const reopened=new DesignerService(f.owner.ctx,{workspaceRoot:'/workspace'}),reloaded=await reopened.framework.read({projectId:saved.project.id,pageId:saved.page.id},f.env);
  assert.deepEqual(reloaded.artifact,rebuilt.artifact);assert.deepEqual(reloaded.files,again.files);
});

for(const kind of ['react','vue'])test(kind+' source compilation failures leave source, preview and project metadata byte-identical',async()=>{
  const f=fixture(),saved=await f.setup(kind),before=f.fs.snapshot(),writes=f.fs.writes.length;
  const invalid=kind==='react'?'export default function Broken(){return <main>':'<template><main></template>';
  const missing=kind==='react'?'import Missing from "./missing"; export default () => <main>{Missing}</main>':'<script setup>import Missing from "./missing"</script><template><main><Missing/></main></template>';
  for(const [proposal,expected]of [[invalid,['SOURCE_PARSE_ERROR','FRAMEWORK_COMPILE_ERROR']],[missing,['FILE_NOT_PROVIDED']]]){
    await assert.rejects(f.owner.framework.execute({action:'framework.write',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:saved.artifact.entry,code:proposal}]},f.env),error=>expected.includes(error.code));
    assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  }
});

test('exact frozen source selection replaces only its AST element and rebuilds a matching preview',async()=>{
  const f=fixture(),saved=await f.setup(),s=await selection(f,saved),replacement='<strong>Selected change</strong>';
  const result=await f.owner.framework.execute({action:'framework.element.replace',projectId:s.project.id,pageId:s.page.id,path:s.entry,nodeId:s.node.id,expectedSourceHash:s.source.sourceHash,expectedRevision:s.project.revision,replacement},s.env);
  const read=await f.owner.framework.read({projectId:s.project.id,pageId:s.page.id,path:s.entry},f.env),next=read.files[0],changed=sourceElement({path:s.entry,framework:'react',code:next.code,nodeId:s.node.id});
  assert.equal(next.code.slice(0,changed.start),s.source.code.slice(0,s.element.start));assert.equal(next.code.slice(changed.end),s.source.code.slice(s.element.end));assert.equal(changed.tag,'strong');assert.equal(next.sourceHash,result.artifact.sourceHashes[s.entry]);
  const built=await f.owner.workbench.readAt(result.project,result.page.htmlPath,f.env);assert.match(built.bytes.toString(),/Selected change/);assert.equal(hash(built.bytes),result.page.contentHash);assert.match(next.code,/Preserve sibling/);
});

test('wrong source hashes, rendered build IDs, source paths and DOM-derived IDs cannot authorize a source edit',async()=>{
  const f=fixture(),saved=await f.setup(),s=await selection(f,saved),before=f.fs.snapshot(),writes=f.fs.writes.length;
  const request={action:'framework.element.replace',projectId:s.project.id,pageId:s.page.id,path:s.entry,nodeId:s.node.id,expectedSourceHash:s.source.sourceHash,expectedRevision:s.project.revision,replacement:'<span>Denied</span>'};
  await assert.rejects(f.owner.framework.execute({...request,expectedSourceHash:'0'.repeat(64)},s.env),{code:'VERSION_CONFLICT'});
  await assert.rejects(f.owner.framework.execute({...request,nodeId:'body > main > span:nth-child(1)'},s.env),{code:'SOURCE_ELEMENT_NOT_FOUND'});
  await assert.rejects(f.owner.framework.execute({...request,path:'designs/another/source/App.jsx'},s.env),{code:'FRAMEWORK_PATH'});
  await assert.rejects(f.owner.framework.execute(request,{...s.env,task:{...s.task,framework:{...s.framework,buildId:'stale-build'}},target:{...s.task,framework:{...s.framework,buildId:'stale-build'}}}),{code:'SCOPE_DENIED'});
  await assert.rejects(f.owner.framework.execute({...request,action:'framework.write',files:[{path:s.entry,code:s.source.code}]},s.env),{code:'SCOPE_DENIED'});
  for(const object of [{...s.object,artifact:{...s.object.artifact,buildId:'stale'}},{...s.object,sourceLocator:{...s.object.sourceLocator,sourceHash:'0'.repeat(64)}},{...s.object,sourceNodeId:undefined,sourceLocator:undefined,domPath:'body > main > span'}])await assert.rejects(f.owner.framework.resolveSelection(s.project,s.page,{objects:[object]},f.env));
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('readonly policy, readonly registered source and cross-design frozen tasks reject before publication',async()=>{
  const f=fixture(),saved=await f.setup(),s=await selection(f,saved),request={action:'framework.build',projectId:s.project.id,pageId:s.page.id,expectedRevision:s.project.revision};
  let before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.framework.execute(request,{user:true,policy:{...policy,mode:'read-only'}}),{code:'FS_SANDBOX_DENIED'});
  await assert.rejects(f.owner.framework.execute(request,{policy,task:{projectId:s.project.id,designId:'d-other',scope:'design'}}),{code:'SCOPE_DENIED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  await f.owner.store.mutate(s.project.id,s.project.revision,'Readonly source test',p=>{p.workbench.files.find(file=>file.path===s.entry).readonly=true;},undefined,policy,false);
  const project=await f.owner.workbench.project(s.project.id);before=f.fs.snapshot();writes=f.fs.writes.length;
  await assert.rejects(f.owner.framework.execute({action:'framework.write',projectId:s.project.id,pageId:s.page.id,expectedRevision:project.revision,files:[{path:s.entry,code:s.source.code.replace('Original heading','Forbidden')}]},f.env),{code:'READ_ONLY_RESOURCE'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('unregistered canonical project root aliases cannot publish a framework build',async()=>{
  const f=fixture(),saved=await f.setup(),root=await f.owner.projectPhysicalRoot(saved.project.id),writes=f.fs.writes.length;
  f.fs.aliases.set(root,'/workspace/foreign-project');
  await assert.rejects(f.owner.framework.execute({action:'framework.build',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision},f.env),{code:'PROJECT_SCOPE'});
  assert.equal(f.fs.writes.length,writes);
});

test('SourceEditor file.write saves canonical source and matching rebuilt HTML through the public entry',async()=>{
  const f=fixture(),saved=await f.setup(),read=await f.owner.framework.read({projectId:saved.project.id,pageId:saved.page.id},f.env),entry=read.files.find(file=>file.path===saved.artifact.entry),file=saved.project.workbench.files.find(file=>file.path===entry.path),changed=entry.code.replace('Original heading','SourceEditor updated');
  let before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.execute({action:'file.write',projectId:saved.project.id,fileId:file.id,expectedRevision:saved.projectRevision,content:changed},{user:true}),{code:'CAS_REQUIRED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  const result=await f.owner.execute({action:'file.write',projectId:saved.project.id,fileId:file.id,expectedRevision:saved.projectRevision,expectedVersion:entry.version,content:changed},{user:true});
  const current=await f.owner.framework.read({projectId:saved.project.id,pageId:saved.page.id,path:entry.path},f.env),built=await f.owner.workbench.readAt(result.project,result.page.htmlPath,f.env);
  assert.equal(current.files[0].code,changed);assert.equal(result.file.id,file.id);assert.equal(result.version,current.files[0].version);assert.equal(result.artifact.sourceHashes[entry.path],hash(changed));assert.match(built.bytes.toString(),/SourceEditor updated/);assert.equal(result.page.contentHash,hash(built.bytes));assert.notEqual(result.page.htmlPath,saved.page.htmlPath);assert.notEqual(result.artifact.buildId,saved.artifact.buildId);
  before=f.fs.snapshot();writes=f.fs.writes.length;
  await assert.rejects(f.owner.execute({action:'file.write',projectId:saved.project.id,fileId:file.id,expectedRevision:result.projectRevision,expectedVersion:entry.version,content:changed+'\n// stale'},{user:true}),{code:'VERSION_CONFLICT'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('selection replacement cannot alter unrelated framework scene metadata',async()=>{
  const f=fixture(),saved=await f.setup(),s=await selection(f,saved),before=f.fs.snapshot(),writes=f.fs.writes.length;
  const extras=[{scenes:[{id:'unrelated',name:'Replace all scenes',state:{mode:'unrelated'}}]},{entry:s.entry},{kind:'react'},{files:[{path:s.entry,code:s.source.code}]},{artifact:{kind:'react'}},{html:'<main>Unrelated HTML</main>'}];
  for(const extra of extras)await assert.rejects(f.owner.framework.execute({action:'framework.element.replace',projectId:s.project.id,pageId:s.page.id,path:s.entry,nodeId:s.node.id,expectedSourceHash:s.source.sourceHash,expectedRevision:s.project.revision,replacement:'<span>Selected only</span>',...extra},s.env),{code:'SCOPE_DENIED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('selection replacement cannot switch the page entry to a different registered source component',async()=>{
  const f=fixture(),initial=await f.setup(),saved=await f.owner.framework.execute({action:'framework.write',projectId:initial.project.id,pageId:initial.page.id,expectedRevision:initial.projectRevision,files:[{path:'Alternate.jsx',code:'export default function Alternate(){return <article>Unrelated whole-page replacement</article>}'}]},f.env),s=await selection(f,saved),alternate=saved.artifact.files.find(filename=>filename.endsWith('/Alternate.jsx')),before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.framework.execute({action:'framework.element.replace',projectId:s.project.id,pageId:s.page.id,path:s.entry,nodeId:s.node.id,expectedSourceHash:s.source.sourceHash,expectedRevision:s.project.revision,replacement:'<span>Selected only</span>',entry:alternate},s.env),{code:'SCOPE_DENIED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('a new page source directory cannot alias a sibling design even inside the same project',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Canonical source boundary'},{user:true}),p=await f.owner.workbench.project(project.id),page=p.artboards[0],root=await f.owner.projectPhysicalRoot(p.id),sourceRoot=f.owner.framework.root(p,page),before=f.fs.snapshot(),writes=f.fs.writes.length;
  f.fs.aliases.set(path.join(root,sourceRoot),path.join(root,'designs/sibling-source'));
  await assert.rejects(f.owner.framework.execute({action:'framework.write',projectId:p.id,pageId:page.id,expectedRevision:p.revision,kind:'react',entry:'App.jsx',files:[{path:'App.jsx',code:code('react')}]},f.env),error=>/SCOPE|PATH/.test(error.code));
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('an existing source file cannot alias a sibling design even when its bytes and version match',async()=>{
  const f=fixture(),saved=await f.setup(),root=await f.owner.projectPhysicalRoot(saved.project.id),entry=path.join(root,saved.artifact.entry),sibling=path.join(root,'designs/sibling/App.jsx'),basis=f.fs.files.get(entry);
  f.fs.files.set(sibling,{bytes:Buffer.from(basis.bytes),version:basis.version});f.fs.aliases.set(entry,sibling);const before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.framework.execute({action:'framework.write',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:saved.artifact.entry,code:code('react')}]},f.env),error=>/SCOPE|PATH/.test(error.code));
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

for(const kind of ['react','vue'])test('public design.create '+kind+' initializes real source files and a compiled page',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Create '+kind},{user:true}),created=await f.owner.execute({action:'design.create',projectId:project.id,expectedRevision:project.revision,name:'Source design',artifactKind:kind},{user:true});
  assert.equal(created.page.artifact?.kind,kind);assert.ok(created.page.artifact.files.length);assert.ok(created.page.artifact.manifest.length);
  const read=await f.owner.framework.read({projectId:project.id,pageId:created.page.id},f.env),built=await f.owner.workbench.readAt(created.project,created.page.htmlPath,f.env);
  assert.equal(created.page.contentHash,hash(built.bytes));assert.match(built.bytes.toString(),/data-dsh-framework-runtime="true"/);assert.ok(read.files.some(file=>file.path.endsWith(kind==='react'?'/App.jsx':'/App.vue')));for(const file of read.files)assert.equal(created.page.artifact.sourceHashes[file.path],hash(file.code));
});

test('public HTML commit and document editing cannot overwrite a framework build artifact',async()=>{
  const f=fixture(),saved=await f.setup(),file=saved.project.workbench.files.find(file=>file.path===saved.page.htmlPath),basis=await f.owner.execute({action:'edit.read',projectId:saved.project.id,pageId:saved.page.id},{user:true}),before=f.fs.snapshot(),writes=f.fs.writes.length;
  assert.equal(file.readonly,true);assert.deepEqual(basis.document.nodes,{});assert.equal(basis.document.artifact.buildId,saved.artifact.buildId);assert.equal(hash(basis.document.html),saved.page.contentHash);
  const attempts=[
    {action:'artboard.commit',artboardId:saved.page.id,html},
    {action:'file.write',fileId:file.id,expectedVersion:basis.version,content:html},
    {action:'edit.apply',pageId:saved.page.id,operations:[{type:'text',nodeIds:['old'],value:'Overwrite generated DOM'}]},
  ];
  for(const attempt of attempts)await assert.rejects(f.owner.execute({projectId:saved.project.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:saved.page.revision,...attempt},{user:true}),{code:'FRAMEWORK_SOURCE_REQUIRED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  const resized=await f.owner.execute({action:'edit.apply',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:basis.projectRevision,operations:[{type:'page.viewport',viewport:{width:980,height:720}}]},{user:true});
  assert.equal(resized.page.viewport.width,980);assert.equal(resized.page.htmlPath,saved.page.htmlPath);assert.equal(resized.page.contentHash,saved.page.contentHash);assert.equal(resized.page.artifact.buildId,saved.artifact.buildId);
});

test('bound Native designer tool dispatch reaches framework reads/builds and preserves frozen page scope',async()=>{
  const f=fixture(),saved=await f.setup(),design=saved.project.workbench.designs.find(design=>design.id===saved.page.designId),agent={id:'native-framework-regression',session:{id:'native-framework-regression',header:{cwd:await f.owner.projectPhysicalRoot(saved.project.id)},snapshotEvents:()=>[]}},task={id:'task-framework-native',projectId:saved.project.id,designId:design.id,pageId:saved.page.id,pageIds:[saved.page.id],existingPageIds:[saved.page.id],designIds:[design.id],designRoots:{[design.id]:design.folder},writeBoundaryPaths:[design.folder],scope:'design',deniedPaths:[]};
  f.owner.bindings.set(agent.id,saved.project.id);f.owner.aiWorkbench.setTask(agent,task);
  const tool=f.owner.aiWorkbench.scopedTool(agent,saved.project.id),exec={signal:new AbortController().signal};
  const read=await tool.execute({action:'framework.read',options:{pageId:saved.page.id}},exec);assert.equal(read.artifact.kind,'react');assert.ok(read.files.length);
  const writes=f.fs.writes.length;
  await assert.rejects(tool.execute({action:'framework.write',options:{pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:'designs/other/source/App.jsx',code:code('react')}]}},exec),{code:'SCOPE_DENIED'});
  await assert.rejects(tool.execute({action:'framework.read',options:{pageId:'a-other'}},exec),{code:'SCOPE_DENIED'});assert.equal(f.fs.writes.length,writes);
  const built=await tool.execute({action:'framework.build',options:{pageId:saved.page.id,expectedRevision:saved.projectRevision}},exec);assert.equal(built.artifact.version,saved.artifact.version+1);assert.equal(built.page.id,saved.page.id);assert.equal(built.saved,true);
});

async function renderedPick(f,saved,{sourceNodeId,instanceCount=1,runtimeId='runtime-source-1'}={}){
  const project=await f.owner.workbench.project(saved.project.id),page=project.artboards.find(page=>page.id===saved.page.id),read=await f.owner.framework.read({projectId:project.id,pageId:page.id},f.env),node=page.artifact.manifest.find(node=>sourceNodeId?node.id===sourceNodeId:node.tag==='span'),source=read.files.find(file=>file.path===node.path);
  const object={id:runtimeId,nodeId:runtimeId,instanceId:runtimeId,sourceNodeId:node.id,sourceLocator:{...node},sourceInstanceCount:instanceCount,outerHTML:'<'+node.tag+' data-dsh-source="'+node.id+'">Observed text</'+node.tag+'>',outerHTMLComplete:true,artifact:structuredClone(page.artifact),documentEpoch:'document-current',renderEpoch:'render-current',sceneId:'query'};
  return {project,page,source,node,object,selection:{artifact:structuredClone(page.artifact),documentEpoch:object.documentEpoch,renderEpoch:object.renderEpoch,sceneId:object.sceneId,objects:[object]}};
}
async function manualCall(f,pick,operations,extra={}){
  return f.owner.execute({action:'framework.edit',projectId:pick.project.id,pageId:pick.page.id,expectedRevision:pick.project.revision,selection:pick.selection,operations,...extra},{user:true});
}
async function staticSetup(f,kind){
  const saved=await f.setup(kind);if(kind==='react')return saved;
  const read=await f.owner.framework.read({projectId:saved.project.id,pageId:saved.page.id},f.env),entry=read.files.find(file=>file.path===saved.artifact.entry);
  return f.owner.execute({action:'framework.write',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:entry.path,code:entry.code.replace('{{title}}','Original heading'),expectedVersion:entry.version}]},{user:true});
}

for(const kind of ['react','vue'])test(kind+' owner properties and drag styles persist through exact rendered selection to rebuilt source',async()=>{
  const f=fixture(),saved=await staticSetup(f,kind),pick=await renderedPick(f,saved),prior=sourceElement({framework:kind,path:pick.source.path,code:pick.source.code,nodeId:pick.node.id}),text='Persisted plain text';
  const edited=await manualCall(f,pick,[{type:'text.set',nodeIds:[pick.object.nodeId],text},{type:'style.set',nodeIds:[pick.object.nodeId],styles:{'background-color':'#ffcc00','border-radius':'9px',translate:'24px 18px',width:'240px',height:'70px'}}]);
  assert.ok(edited.document);assert.equal(edited.document.artifact.buildId,edited.artifact.buildId);assert.deepEqual(edited.selectedSourceIds,[pick.node.id]);assert.equal(edited.page.id,pick.page.id);assert.equal(edited.project.id,pick.project.id);
  const next=await renderedPick(f,edited),element=sourceElement({framework:kind,path:next.source.path,code:next.source.code,nodeId:pick.node.id});
  assert.equal(next.source.code.slice(0,element.start),pick.source.code.slice(0,prior.start));assert.equal(next.source.code.slice(element.end),pick.source.code.slice(prior.end));
  for(const value of [text,'#ffcc00','9px','24px 18px','240px','70px'])assert.ok(element.code.includes(value),value+' must be saved in the exact source element');
  assert.equal(edited.artifact.sourceHashes[next.source.path],hash(next.source.code));assert.equal(edited.page.contentHash,hash(edited.document.html));assert.match(edited.document.html,/Persisted plain text/);assert.notEqual(edited.artifact.buildId,saved.artifact.buildId);
  const cleared=await manualCall(f,next,[{type:'style.set',nodeIds:[next.object.nodeId],styles:{'background-color':null}}]),after=await f.owner.framework.read({projectId:pick.project.id,pageId:pick.page.id,path:next.source.path},f.env),clearedElement=sourceElement({framework:kind,path:next.source.path,code:after.files[0].code,nodeId:pick.node.id});
  assert.ok(!clearedElement.code.includes('#ffcc00'));assert.match(clearedElement.code,/24px 18px/);assert.equal(cleared.page.contentHash,hash(cleared.document.html));
});

for(const kind of ['react','vue'])test(kind+' duplicate and delete produce fresh source identities and independent compiled previews',async()=>{
  const f=fixture(),saved=await staticSetup(f,kind),pick=await renderedPick(f,saved),duplicated=await manualCall(f,pick,[{type:'node.duplicate',nodeIds:[pick.object.nodeId]}]),spans=duplicated.artifact.manifest.filter(node=>node.tag==='span');
  assert.equal(spans.length,2);assert.equal(new Set(duplicated.artifact.manifest.map(node=>node.id)).size,duplicated.artifact.manifest.length);assert.equal(duplicated.selectedSourceIds.length,1);const id=duplicated.selectedSourceIds[0];assert.notEqual(id,pick.node.id);assert.ok(spans.some(node=>node.id===id));assert.ok(spans.some(node=>node.id===pick.node.id));
  const duplicatePick=await renderedPick(f,duplicated,{sourceNodeId:id}),deleted=await manualCall(f,duplicatePick,[{type:'node.delete',nodeIds:[duplicatePick.object.nodeId]}]),read=await f.owner.framework.read({projectId:pick.project.id,pageId:pick.page.id},f.env);
  assert.equal(deleted.artifact.manifest.filter(node=>node.tag==='span').length,1);assert.ok(!deleted.artifact.manifest.some(node=>node.id===id));assert.ok(deleted.artifact.manifest.some(node=>node.id===pick.node.id));assert.match(read.files.find(file=>file.path===pick.source.path).code,/Preserve sibling/);assert.equal(deleted.page.contentHash,hash(deleted.document.html));assert.notEqual(deleted.artifact.buildId,duplicated.artifact.buildId);
});

test('manual source operations reject stale selections, unknown runtime IDs and unconfirmed repeated templates with zero publication',async()=>{
  const f=fixture(),saved=await f.setup(),pick=await renderedPick(f,saved),before=f.fs.snapshot(),writes=f.fs.writes.length,op={type:'style.set',nodeIds:[pick.object.nodeId],styles:{translate:'5px 6px'}};
  const attempts=[
    [{...pick,selection:{...pick.selection,objects:[{...pick.object,artifact:{...pick.object.artifact,buildId:'stale-build'}}]}},op,'VERSION_CONFLICT'],
    [{...pick,selection:{...pick.selection,objects:[{...pick.object,sourceLocator:{...pick.object.sourceLocator,sourceHash:'0'.repeat(64)}}]}},op,'SOURCE_SELECTION_STALE'],
    [pick,{...op,nodeIds:['runtime-outside-selection']},'SOURCE_SELECTION_REQUIRED'],
    [await renderedPick(f,saved,{instanceCount:2}),op,'SOURCE_TEMPLATE_CONFIRMATION_REQUIRED'],
    [{...pick,selection:{...pick.selection,objects:[{...pick.object,sourceInstanceCount:undefined},{...pick.object,id:'runtime-source-2',nodeId:'runtime-source-2',instanceId:'runtime-source-2',sourceInstanceCount:undefined}]}},op,'SOURCE_TEMPLATE_CONFIRMATION_REQUIRED'],
  ];
  for(const [selected,operation,code]of attempts)await assert.rejects(manualCall(f,selected,[operation]),{code});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  const repeated=await renderedPick(f,saved,{instanceCount:2}),confirmed=await manualCall(f,repeated,[op],{sourceTemplateConfirmed:true});
  assert.deepEqual(confirmed.selectedSourceIds,[pick.node.id]);assert.match((await f.owner.framework.read({projectId:pick.project.id,pageId:pick.page.id},f.env)).files.find(file=>file.path===pick.source.path).code,/5px 6px/);
});

test('dynamic text, native readonly policy and registered readonly source reject manual editing without partial writes',async()=>{
  const f=fixture(),saved=await f.setup('vue'),pick=await renderedPick(f,saved);let before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(manualCall(f,pick,[{type:'style.set',nodeIds:[pick.object.nodeId],styles:{color:'red'}},{type:'text.set',nodeIds:[pick.object.nodeId],text:'Erase expression'}]),{code:'SOURCE_DYNAMIC_TEXT'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
  f.owner.ctx.sandboxPolicy.resolve=()=>({...policy,mode:'read-only'});
  await assert.rejects(manualCall(f,pick,[{type:'style.set',nodeIds:[pick.object.nodeId],styles:{color:'red'}}]),{code:'FS_SANDBOX_DENIED'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);f.owner.ctx.sandboxPolicy.resolve=()=>policy;
  await f.owner.store.mutate(pick.project.id,pick.project.revision,'Readonly manual source test',p=>{p.workbench.files.find(file=>file.path===pick.source.path).readonly=true;},undefined,policy,false);
  const readonlyPick=await renderedPick(f,{project:pick.project,page:pick.page});before=f.fs.snapshot();writes=f.fs.writes.length;
  await assert.rejects(manualCall(f,readonlyPick,[{type:'style.set',nodeIds:[readonlyPick.object.nodeId],styles:{color:'red'}}]),{code:'READ_ONLY_RESOURCE'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('framework.edit is owner-only through the public bound Native tool entry',async()=>{
  const f=fixture(),saved=await f.setup(),pick=await renderedPick(f,saved),design=pick.project.workbench.designs.find(design=>design.id===pick.page.designId),agent={id:'native-manual-forbidden',session:{id:'native-manual-forbidden',header:{cwd:await f.owner.projectPhysicalRoot(pick.project.id)},snapshotEvents:()=>[]}};
  f.owner.bindings.set(agent.id,pick.project.id);f.owner.aiWorkbench.setTask(agent,{id:'task-manual-forbidden',projectId:pick.project.id,designId:design.id,pageIds:[pick.page.id],existingPageIds:[pick.page.id],designRoots:{[design.id]:design.folder},scope:'design'});const before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.aiWorkbench.scopedTool(agent,pick.project.id).execute({action:'framework.edit',options:{pageId:pick.page.id,expectedRevision:pick.project.revision,selection:pick.selection,operations:[{type:'style.set',nodeIds:[pick.object.nodeId],styles:{color:'red'}}]}},{signal:new AbortController().signal}),{code:'USER_ONLY'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

for(const action of ['page.clone','design.clone'])test(action+' remaps framework source roots so editing a clone cannot change its original page',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Independent source clone'},{user:true}),original=await f.owner.execute({action:'design.create',projectId:project.id,expectedRevision:project.revision,name:'React original',artifactKind:'react'},{user:true}),old=await f.owner.framework.read({projectId:project.id,pageId:original.page.id},f.env),cloned=await f.owner.execute({action,projectId:project.id,expectedRevision:original.projectRevision,pageId:original.page.id,designId:original.design.id,name:'Independent copy'},{user:true}),copy=await f.owner.framework.read({projectId:project.id,pageId:cloned.page.id},f.env);
  assert.notEqual(copy.artifact.sourceRoot,old.artifact.sourceRoot);assert.notEqual(copy.artifact.entry,old.artifact.entry);assert.ok(copy.artifact.files.every(filename=>filename.startsWith(copy.artifact.sourceRoot+'/')));assert.ok(copy.artifact.files.every(filename=>!old.artifact.files.includes(filename)));
  const entry=copy.files.find(file=>file.path===copy.artifact.entry),file=cloned.project.workbench.files.find(file=>file.path===entry.path),updated=await f.owner.execute({action:'file.write',projectId:project.id,fileId:file.id,expectedRevision:cloned.projectRevision,expectedVersion:entry.version,content:entry.code.replace('WORKSPACE','CLONE_ONLY_MARKER')},{user:true});
  const originalAfter=await f.owner.framework.read({projectId:project.id,pageId:original.page.id},f.env),copyAfter=await f.owner.framework.read({projectId:project.id,pageId:cloned.page.id},f.env);
  assert.deepEqual(originalAfter.files,old.files);assert.deepEqual(originalAfter.artifact,old.artifact);assert.match(copyAfter.files.find(file=>file.path===copy.artifact.entry).code,/CLONE_ONLY_MARKER/);assert.match(updated.document.html,/CLONE_ONLY_MARKER/);assert.equal(updated.page.contentHash,hash(updated.document.html));
});

test('whole project clone keeps stored sourceRoot usable under its new project root and does not share source bytes',async()=>{
  const f=fixture(),original=await f.setup(),old=await f.owner.framework.read({projectId:original.project.id,pageId:original.page.id},f.env),cloned=await f.owner.execute({action:'project.clone',projectId:original.project.id,expectedRevision:original.projectRevision,name:'Whole project source copy'},{user:true}),page=cloned.project.artboards.find(page=>page.artifact?.kind==='react');
  assert.notEqual(cloned.project.id,original.project.id);assert.equal(page.artifact.sourceRoot,old.artifact.sourceRoot);assert.notEqual(await f.owner.projectPhysicalRoot(cloned.project.id),await f.owner.projectPhysicalRoot(original.project.id));
  const copy=await f.owner.framework.read({projectId:cloned.project.id,pageId:page.id},f.env),entry=copy.files.find(file=>file.path===copy.artifact.entry),file=cloned.project.workbench.files.find(file=>file.path===entry.path),saved=await f.owner.execute({action:'file.write',projectId:cloned.project.id,fileId:file.id,expectedRevision:cloned.projectRevision,expectedVersion:entry.version,content:entry.code.replace('Original heading','WHOLE_CLONE_ONLY')},{user:true});
  assert.match(saved.document.html,/WHOLE_CLONE_ONLY/);assert.equal(saved.page.contentHash,hash(saved.document.html));const source=await f.owner.framework.read({projectId:original.project.id,pageId:original.page.id},f.env);assert.deepEqual(source.files,old.files);assert.deepEqual(source.artifact,old.artifact);
});

for(const kind of ['react','vue'])test(kind+' static source IDs duplicated across different component files reject before publication',async()=>{
  const f=fixture(),saved=await f.setup(kind),before=f.fs.snapshot(),writes=f.fs.writes.length,entry=kind==='react'?'import Child from "./Child.jsx"; export default () => <main data-dsh-source="same-static-id"><Child/></main>':'<script setup>import Child from "./Child.vue"</script><template><main data-dsh-source="same-static-id"><Child/></main></template>',child=kind==='react'?'export default () => <p data-dsh-source="same-static-id">Duplicate ID</p>':'<template><p data-dsh-source="same-static-id">Duplicate ID</p></template>';
  await assert.rejects(f.owner.execute({action:'framework.write',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:saved.artifact.entry,code:entry},{path:kind==='react'?'Child.jsx':'Child.vue',code:child}]},{user:true}),{code:'DUPLICATE_SOURCE_ID'});
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('existing HTML pages retain their source path and remain editable without framework metadata',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Legacy HTML'},{user:true}),made=await f.owner.execute({action:'artboard.create',projectId:project.id,expectedRevision:project.revision,name:'HTML page',html},{user:true});
  assert.equal(made.page.artifact,undefined);const basis=await f.owner.editor.read(project.id,made.page.id,f.env);
  const saved=await f.owner.execute({action:'artboard.commit',projectId:project.id,artboardId:made.page.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,html:basis.document.html.replace('Legacy content','Legacy updated')},{user:true});
  assert.equal(saved.page.artifact,undefined);assert.match((await f.owner.workbench.readAt(saved.project,saved.page.htmlPath,f.env)).bytes.toString(),/Legacy updated/);
});
