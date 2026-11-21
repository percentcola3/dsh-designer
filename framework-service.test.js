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
    // Materialize an older saved project to exercise source editing after upgrade.
    const saved=await owner.workbench.mutate({projectId:project.id,expectedRevision:basis.revision},env,'Restore legacy fixture',async next=>{
      const target=next.artboards.find(item=>item.id===page.id),entry=kind==='react'?'App.jsx':'App.vue';
      await owner.framework.configureInProject(next,target,{kind,entry,files:[{path:entry,code:code(kind)}]},env);
    });
    const restored=saved.artboards.find(item=>item.id===page.id);
    return {...owner.workbench.result(saved),page:restored,artifact:restored.artifact};

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

test('legacy source initialization rejects aliased directories before writing',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Canonical source boundary'},f.env);
  const page=project.artboards[0],root=await f.owner.projectPhysicalRoot(project.id),sourceRoot=f.owner.framework.root(project,page);
  const before=f.fs.snapshot(),writes=f.fs.writes.length;
  f.fs.aliases.set(path.join(root,sourceRoot),path.join(root,'designs/sibling-source'));
  await assert.rejects(f.owner.framework.configureInProject(project,page,{kind:'react',entry:'App.jsx',files:[{path:'App.jsx',code:code('react')}]},f.env),error=>/SCOPE|PATH/.test(error.code));
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

test('an existing source file cannot alias a sibling design even when its bytes and version match',async()=>{
  const f=fixture(),saved=await f.setup(),root=await f.owner.projectPhysicalRoot(saved.project.id),entry=path.join(root,saved.artifact.entry),sibling=path.join(root,'designs/sibling/App.jsx'),basis=f.fs.files.get(entry);
  f.fs.files.set(sibling,{bytes:Buffer.from(basis.bytes),version:basis.version});f.fs.aliases.set(entry,sibling);const before=f.fs.snapshot(),writes=f.fs.writes.length;
  await assert.rejects(f.owner.framework.execute({action:'framework.write',projectId:saved.project.id,pageId:saved.page.id,expectedRevision:saved.projectRevision,files:[{path:saved.artifact.entry,code:code('react')}]},f.env),error=>/SCOPE|PATH/.test(error.code));
  assert.equal(f.fs.writes.length,writes);assert.deepEqual(f.fs.snapshot(),before);
});

for(const kind of ['react','vue','schema'])test('new projects and designs reject '+kind+' without creating files',async()=>{
  const f=fixture();
  await assert.rejects(f.owner.execute({action:'project.create',name:'Unsupported',artifactKind:kind},f.env),{code:'INVALID_ARTIFACT_KIND'});
  const project=await f.owner.execute({action:'project.create',name:'HTML'},f.env),before=f.fs.snapshot();
  for(const action of ['design.create','page.create',...(kind==='schema'?['schema.apply']:['framework.write','framework.build'])]){
    await assert.rejects(f.owner.execute({action,projectId:project.id,pageId:project.artboards[0].id,designId:project.artboards[0].designId,expectedRevision:project.revision,name:'Unsupported',artifactKind:kind,kind},f.env),{code:'INVALID_ARTIFACT_KIND'});
  }
  assert.deepEqual(f.fs.snapshot(),before);
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

for(const action of ['page.clone','design.clone'])test(action+' rejects creation of a new framework artifact',async()=>{
  const f=fixture(),original=await f.setup(),before=f.fs.snapshot();
  await assert.rejects(f.owner.execute({action,projectId:original.project.id,expectedRevision:original.projectRevision,pageId:original.page.id,designId:original.page.designId},f.env),{code:'INVALID_ARTIFACT_KIND'});
  assert.deepEqual(f.fs.snapshot(),before);
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

function semanticFixture() {
  return {schemaVersion:1,id:'settings',root:'root',nodes:{
    root:{kind:'layout',layout:'stack',children:['heading','form']},
    heading:{kind:'text',tag:'h1',text:'通知设置'},
    form:{kind:'component',use:'form',props:{model:'draft',fields:[{id:'email',label:'通知邮箱',inputType:'email',rules:['required','email']}],submit:{text:'保存',action:'save'}}}},
    state:{draft:{email:'team@example.com'}},actions:{save:{type:'form.submit',target:'form',onValid:[{type:'feedback.show',text:'保存成功'}]}},
    scenes:{default:{name:'默认'},invalid:{name:'校验错误',state:{draft:{email:'bad'}},ui:{form:{validation:'submitted'}}},success:{name:'保存成功',ui:{feedback:{text:'保存成功',tone:'success'}}}}};
}
async function semanticSetup(f) {
  const project=await f.owner.execute({action:'project.create',name:'Schema integration'},{user:true});
  const basis=await f.owner.workbench.project(project.id),page=basis.artboards[0];
  return f.owner.schema.apply({projectId:project.id,pageId:page.id,expectedRevision:basis.revision,document:semanticFixture()},f.env);
}

test('native Schema discovery identifies untouched starters, preserves existing source authority and reports the admitted save', async () => {
  const f=fixture(), project=await f.owner.execute({action:'project.create',name:'Starter discovery'},f.env);
  const initial=await f.owner.workbench.project(project.id), page=initial.artboards[0];
  const target={projectId:project.id,pageId:page.id}, agent={id:'starter-agent'};
  const task={...target,designId:page.designId,scope:'page',pageIds:[page.id]};
  f.owner.bindings.set(agent.id,project.id);
  const env={agent,policy,task};
  let read=await f.owner.schema.read(target,env);
  assert.equal(read.status,'initial-page');
  assert.equal(read.next.tool,'designer_commit_html');
  assert.equal(read.next.artboardId,page.id);
  assert.equal(read.next.expectedRevision,initial.revision);
  assert.equal((await f.owner.schema.read(target,{...env,task:{...task,scope:'read'}})).next,undefined);
  await assert.rejects(f.owner.schema.read(target,f.env),{code:'SCHEMA_SOURCE_REQUIRED'});
  await f.owner.store.mutate(project.id,initial.revision,'Read pre-marker starter',p=>{delete p.artboards[0].initialTemplateHash;},undefined,policy,false);
  read=await f.owner.schema.read(target,env);
  assert.equal(read.status,'initial-page');
  const before=await f.owner.workbench.readAt(initial,page.htmlPath,f.env);
  const file=f.fs.files.get((await f.owner.workbench.target(initial,page.htmlPath,f.env)).key);
  file.bytes=Buffer.from(before.bytes.toString().replace('从这里开始设计','业务首页'));
  await assert.rejects(f.owner.schema.read(target,env),{code:'VERSION_CONFLICT'});
  await f.owner.store.mutate(project.id,read.projectRevision,'Adopt custom root at revision one',p=>{p.artboards[0].contentHash=hash(file.bytes);},undefined,policy,false);
  await assert.rejects(f.owner.schema.read(target,env),{code:'SCHEMA_SOURCE_REQUIRED'});
  const frame=await f.setup('react'),frameworkTarget={projectId:frame.project.id,pageId:frame.page.id};
  f.owner.bindings.set(agent.id,frame.project.id);
  await assert.rejects(f.owner.schema.read(frameworkTarget,{...env,task:{...frameworkTarget,scope:'page',pageIds:[frame.page.id]}}),{code:'SCHEMA_SOURCE_REQUIRED'});
});

test('semantic source is persisted with stable editable nodes and reopened from the registered JSON file',async()=>{
  const f=fixture(),saved=await semanticSetup(f);
  assert.equal(saved.page.artifact.kind,'schema');
  assert.equal(saved.sceneIds.length,3);
  const read=await f.owner.execute({action:'schema.read',projectId:saved.project.id,pageId:saved.page.id},{user:true});
  assert.equal(read.document.nodes.heading.text,'通知设置');
  assert.ok(read.sourcePath.endsWith('/page.design.json'));
  const canvas=await f.owner.editor.read(saved.project.id,saved.page.id,f.env);
  assert.equal(canvas.document.nodes.heading.text,'通知设置');
  assert.ok(canvas.document.nodes['form:email:input']);
  const reopened=new DesignerService(f.owner.ctx,{workspaceRoot:'/workspace'});
  const again=await reopened.schema.read({projectId:saved.project.id,pageId:saved.page.id},f.env);
  assert.deepEqual(again.document,read.document);
});

test('canvas text and style edits update canonical source and survive a later semantic rebuild',async()=>{
  const f=fixture(),saved=await semanticSetup(f),pageId=saved.page.id,projectId=saved.project.id;
  const basis=await f.owner.editor.read(projectId,pageId,f.env);
  await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:basis.projectRevision,operations:[{type:'text',nodeIds:['heading'],value:'消息通知偏好'},{type:'style',nodeIds:['root'],styles:{maxWidth:'720px'}}]},{user:true});
  let read=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(read.document.nodes.heading.text,'消息通知偏好');
  assert.ok(read.document.documentOperations.some(op=>op.type==='style'));
  await f.owner.schema.apply({projectId,pageId,expectedRevision:read.projectRevision,operations:[{type:'state.set',path:'draft.email',value:'changed@example.com'}]},f.env);
  const canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(canvas.document.nodes.heading.text,'消息通知偏好');
  assert.equal(canvas.document.nodes.root.style['max-width'],'720px');
  assert.equal(canvas.document.nodes['form:email:input'].attributes.value,'changed@example.com');
});

test('native field value changes are written into the semantic state used by preview actions',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'attributes',nodeIds:['form:email:input'],attributes:{value:'editor@example.com'}}]},{user:true});
  const read=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(read.document.state.draft.email,'editor@example.com');
});

test('editing radio choice labels and checked values preserves the typed source and independent scene selections',async()=>{
  const f=fixture(),initial=await semanticSetup(f),target={projectId:initial.project.id,pageId:initial.page.id};
  const definition=semanticFixture();
  definition.nodes.form.props.fields.push({id:'frequency',label:'频率',control:'radio',options:[{label:'零',value:0},{label:'关闭',value:false}]});
  definition.state.draft.frequency=0;
  definition.scenes.off={name:'关闭',state:{draft:{frequency:0}}};
  let result=await f.owner.schema.apply({...target,expectedRevision:initial.projectRevision,document:definition},f.env);
  const edit=async(operations,sceneId)=>{
    result=await f.owner.execute({action:'edit.apply',...target,expectedRevision:result.projectRevision,operations,sceneId},{user:true});
  };
  const choice='form:frequency:option-1';
  await edit([{type:'attributes',nodeIds:[choice+':input'],attributes:{checked:true}}],'off');
  await edit([{type:'text',nodeIds:[choice+':text'],value:'停用'},
    {type:'attributes',nodeIds:[choice+':input'],attributes:{value:'true'}}]);
  const {document}=await f.owner.schema.read(target,f.env);
  assert.equal(document.state.draft.frequency,0);
  assert.equal(document.scenes.off.state.draft.frequency,true);
  assert.deepEqual(document.nodes.form.props.fields.at(-1).options[1],{label:'停用',value:true});
  const canvas=await f.owner.editor.read(target.projectId,target.pageId,f.env);
  assert.equal(canvas.document.nodes[choice+':text'].text,'停用');
  assert.equal(canvas.document.nodes[choice+':input'].attributes['data-schema-radio-value'],'true');
});

test('schema undo and redo restore matching source and generated HTML',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const changed=await f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'node.update',id:'heading',patch:{text:'Changed'}}]},f.env);
  const undone=await f.owner.execute({action:'edit.undo',projectId,pageId,expectedRevision:changed.projectRevision},{user:true});
  let read=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(read.document.nodes.heading.text,'通知设置');
  const redone=await f.owner.execute({action:'edit.redo',projectId,pageId,expectedRevision:undone.projectRevision},{user:true});
  read=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(read.document.nodes.heading.text,'Changed');
  const canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(canvas.document.nodes.heading.text,'Changed');
  assert.equal(redone.page.artifact.history.cursor,1);
});

test('the normal source file save entry rebuilds its page with file CAS protection',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const source=await f.owner.schema.read({projectId,pageId},f.env),document=structuredClone(source.document);
  document.nodes.heading.text='Saved from source editor';
  const next=await f.owner.execute({action:'file.write',projectId,fileId:source.sourceFileId,expectedVersion:source.sourceVersion,expectedRevision:source.projectRevision,content:JSON.stringify(document)},{user:true});
  assert.equal(next.sourceContent.includes('Saved from source editor'),true);
  const canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(canvas.document.nodes.heading.text,'Saved from source editor');
  await assert.rejects(f.owner.execute({action:'file.write',projectId,fileId:source.sourceFileId,expectedVersion:source.sourceVersion,expectedRevision:next.projectRevision,content:JSON.stringify(document)},{user:true}),{code:'VERSION_CONFLICT'});
});

test('invalid source and stale project versions leave the published page intact',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id,before=f.fs.snapshot();
  const bad=semanticFixture();bad.root='missing';
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,document:bad},f.env),{code:'SCHEMA_INVALID'});
  assert.deepEqual(f.fs.snapshot(),before);
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision-1,document:semanticFixture()},f.env),{code:'VERSION_CONFLICT'});
});

test('a publication failure leaves the previous source and HTML pair readable',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const write=f.fs.writeText.bind(f.fs);
  f.fs.writeText=async(target,...rest)=>{if(target.key.includes('revision-schema-'))throw Object.assign(Error('disk failure'),{code:'FS_WRITE_FAILED'});return write(target,...rest);};
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'node.update',id:'heading',patch:{text:'Unpublished'}}]},f.env),{code:'FS_WRITE_FAILED'});
  const read=await f.owner.schema.read({projectId,pageId},f.env),canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(read.document.nodes.heading.text,'通知设置');
  assert.equal(canvas.document.nodes.heading.text,'通知设置');
});

test('a saved schema remains readable when a new non-HTML page copy is rejected',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id;
  await assert.rejects(f.owner.execute({action:'page.clone',projectId,pageId:saved.page.id,expectedRevision:saved.projectRevision},f.env),{code:'INVALID_ARTIFACT_KIND'});
  const source=await f.owner.schema.read({projectId,pageId:saved.page.id},f.env);
  assert.equal(source.document.nodes.heading.text,'通知设置');
});

test('selected canvas edits preserve unrelated source while whole schema replacement remains scoped',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const task={projectId,pageId,designId:saved.page.designId,pageIds:[pageId],scope:'selection',nodeIds:['heading']},env={policy,task,target:task};
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,document:semanticFixture()},env),{code:'SCOPE_DENIED'});
  const basis=await f.owner.editor.read(projectId,pageId,f.env);
  const updated=await f.owner.editor.execute({action:'edit.apply',projectId,pageId,expectedRevision:basis.projectRevision,operations:[{type:'text',nodeIds:['heading'],value:'Scoped'}]},env);
  const read=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(read.document.nodes.heading.text,'Scoped');
  assert.deepEqual(read.document.nodes.form,semanticFixture().nodes.form);
  assert.ok(updated.saved);
});

test('schema reads and writes respect exact page and read-only targets',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const task={projectId,pageId:'a-other',designId:saved.page.designId,scope:'page'};
  await assert.rejects(f.owner.schema.read({projectId,pageId},{policy,task}),{code:'SCOPE_DENIED'});
  const readonly={...task,pageId,scope:'read'};
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,document:semanticFixture()},{policy,task:readonly}),{code:'SCOPE_DENIED'});
});

test('semantic preview snapshots, scene rename and scene removal survive recompilation',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const captured=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'scene.set',scene:{id:'captured',name:'预览捕获',nodes:{},schemaState:{draft:{email:'capture@example.com'}},schemaUI:{feedback:{text:'预览成功',tone:'success'}}}}]},{user:true});
  let source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.scenes.captured.state.draft.email,'capture@example.com');
  assert.equal(source.document.scenes.captured.ui.feedback.text,'预览成功');
  const renamed=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:captured.projectRevision,operations:[{type:'scene.set',scene:{id:'captured',name:'已更名',nodes:{}}}]},{user:true});
  source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.scenes.captured.name,'已更名');
  const removed=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:renamed.projectRevision,operations:[{type:'scene.reset',id:'captured',remove:true}]},{user:true});
  source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.scenes.captured,undefined);
  assert.ok(removed.saved);
});

test('concurrent semantic saves publish exactly one consistent source and HTML pair',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const results=await Promise.allSettled(['First','Second'].map(text=>f.owner.schema.apply({projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'node.update',id:'heading',patch:{text}}]},f.env)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'VERSION_CONFLICT');
  const source=await f.owner.schema.read({projectId,pageId},f.env),canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(canvas.document.nodes.heading.text,source.document.nodes.heading.text);
});

test('retry after failed publication reuses immutable source and successfully publishes',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const write=f.fs.writeText.bind(f.fs);
  f.fs.writeText=async(target,...args)=>{if(target.key.includes('revision-schema-'))throw Object.assign(Error('disk failure'),{code:'FS_WRITE_FAILED'});return write(target,...args);};
  const input={projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'node.update',id:'heading',patch:{text:'Retried'}}]};
  await assert.rejects(f.owner.schema.apply(input,f.env),{code:'FS_WRITE_FAILED'});
  f.fs.writeText=write;
  await f.owner.schema.apply(input,f.env);
  const source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.nodes.heading.text,'Retried');
});

test('an admitted canonical JSON file task can rebuild only its owning page repeatedly',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  let source=await f.owner.schema.read({projectId,pageId},f.env);
  const authority={kind:'project-file',fileId:source.sourceFileId,path:source.sourcePath};
  const task={projectId,scope:'project',authority,writeBoundaryPaths:[source.sourcePath]},env={policy,task,target:task};
  for (const text of ['File task first','File task second']) {
    const document=structuredClone(source.document);document.nodes.heading.text=text;
    await f.owner.schema.apply({projectId,pageId,expectedRevision:source.projectRevision,expectedVersion:source.sourceVersion,document},env);
    source=await f.owner.schema.read({projectId,pageId},f.env);
    assert.equal(source.document.nodes.heading.text,text);
  }
  const wrong={...task,authority:{...authority,fileId:'f-unrelated'}};
  await assert.rejects(f.owner.schema.apply({projectId,pageId,expectedRevision:source.projectRevision,document:source.document},{policy,task:wrong,target:wrong}),{code:'SCOPE_DENIED'});
});

test('portable project export and import preserve canonical schema editing and rebuilds',async()=>{
  const {buildPortableProject,portableProjectMetadata}=await import('./portable-project.js');
  const f=fixture(),saved=await semanticSetup(f);
  const snapshot=await buildPortableProject(f.owner,saved.project.id,f.env);
  const payload=snapshot.manifest.project.artboards.find(page=>page.id===saved.page.id);
  assert.equal(payload.artifact.kind,'schema');
  assert.equal(payload.artifact.history.entries.length,1);
  const destination=await f.owner.execute({action:'project.create',name:'Imported Schema'},{user:true});
  const current=await f.owner.workbench.project(destination.id);
  const incoming=portableProjectMetadata(current,snapshot.manifest);
  for (const file of snapshot.files.filter(file=>file.path!=='designer-project.json')) {
    const target=await f.owner.workbench.target(incoming,file.path,f.env),before=await f.fs.stat(target);
    await f.owner.workbench.writeAt(incoming,file.path,file.bytes.toString('utf8'),before?.version??null,f.env);
  }
  const imported=await f.owner.workbench.mutate({projectId:current.id,expectedRevision:current.revision},f.env,'Import schema package',next=>Object.assign(next,incoming));
  let source=await f.owner.schema.read({projectId:imported.id,pageId:saved.page.id},f.env);
  assert.equal(source.document.nodes.heading.text,'通知设置');
  await f.owner.schema.apply({projectId:imported.id,pageId:saved.page.id,expectedRevision:source.projectRevision,operations:[{type:'node.update',id:'heading',patch:{text:'Portable edit'}}]},f.env);
  source=await f.owner.schema.read({projectId:imported.id,pageId:saved.page.id},f.env);
  assert.equal(source.document.nodes.heading.text,'Portable edit');
});

test('canonical JSON saves require a file version through the normal file entry',async()=>{
  const f=fixture(),saved=await semanticSetup(f),source=await f.owner.schema.read({projectId:saved.project.id,pageId:saved.page.id},f.env);
  await assert.rejects(f.owner.execute({action:'file.write',projectId:saved.project.id,fileId:source.sourceFileId,expectedRevision:source.projectRevision,content:JSON.stringify(source.document)},{user:true}),{code:'CAS_REQUIRED'});
});

test('source maps are rederived before a selected edit instead of trusting portable metadata',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const project=await f.owner.store.mutate(projectId,saved.projectRevision,'Tampered artifact metadata',p=>{p.artboards[0].artifact.sourceMap.heading={nodeId:'form',part:'props.title'};},undefined,policy,false);
  const task={projectId,pageId,designId:saved.page.designId,pageIds:[pageId],scope:'selection',nodeIds:['heading']};
  await f.owner.editor.execute({action:'edit.apply',projectId,pageId,expectedRevision:project.revision,operations:[{type:'text',nodeIds:['heading'],value:'Verified heading'}]},{policy,task,target:task});
  const source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.nodes.heading.text,'Verified heading');
  assert.deepEqual(source.document.nodes.form,semanticFixture().nodes.form);
});

test('failed semantic drafts can be repaired with small scoped operations without resending the page',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Failed draft recovery'},{user:true}),basis=await f.owner.workbench.project(project.id),pageId=basis.artboards[0].id;
  const document=semanticFixture();document.nodes.root.children=[];
  await assert.rejects(f.owner.schema.apply({projectId:project.id,pageId,expectedRevision:basis.revision,document},f.env),error=>error.code==='SCHEMA_INVALID'&&error.details.recovery.retryLast===true);
  const saved=await f.owner.schema.apply({projectId:project.id,pageId,expectedRevision:basis.revision,retryLast:true,operations:[{type:'node.update',id:'root',patch:{children:['heading','form']}}]},f.env);
  const source=await f.owner.schema.read({projectId:project.id,pageId},f.env);
  assert.equal(source.document.nodes.heading.text,'通知设置');
  assert.equal(saved.sceneIds.length,3);
  assert.equal(f.owner.schema.failedDefinitions.size,0);
});

test('validated draft handles publish the same task definition without resending JSON',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Validated draft'},{user:true}),basis=await f.owner.workbench.project(project.id),pageId=basis.artboards[0].id;
  const validation=await f.owner.schema.execute({action:'schema.validate',projectId:project.id,pageId,document:semanticFixture()},f.env);
  assert.equal(validation.valid,true);
  assert.equal((await f.owner.workbench.project(project.id)).revision,basis.revision);
  const saved=await f.owner.schema.apply({projectId:project.id,...validation.next},f.env);
  assert.equal(saved.saved,true);
  assert.equal(f.owner.schema.validatedDefinitions.size,0);
  await assert.rejects(f.owner.schema.apply({projectId:project.id,...validation.next,expectedRevision:saved.projectRevision},f.env),{code:'VERSION_CONFLICT'});
});

test('local schema changes target field values and unique stylesheet fragments in a single revision',async()=>{
  const f=fixture(),saved=await semanticSetup(f),target={projectId:saved.project.id,pageId:saved.page.id};
  const pointer='/nodes/form/props/fields/0/help';
  const write=(revision,operations)=>f.owner.execute({action:'schema.apply',...target,expectedRevision:revision,operations},f.env);
  const read=path=>f.owner.execute({action:'schema.read',...target,pointer:path},f.env);
  const original=await read('/nodes/form/props/fields');
  const first=await write(saved.projectRevision,[
    {type:'source.set',pointer,value:'填写工作邮箱'},
    {type:'source.set',pointer:'/css',value:'.content{width:100%;max-width:700px}'},
    {type:'source.set',pointer:'/state/unit~1rate~0old',value:5},
  ]);
  assert.equal((await read('/state/unit~1rate~0old')).document,5);
  const second=await write(first.projectRevision,[
    {type:'source.replaceText',pointer:'/css',find:'max-width:700px',replace:'max-width:720px'},
  ]);
  assert.equal(JSON.parse((await read('/css')).text),'.content{width:100%;max-width:720px}');
  assert.deepEqual((await read('/nodes/form/props/fields')).document,original.document.map((field,index)=>index===0?{...field,help:'填写工作邮箱'}:field));
  const canvas=await f.owner.editor.read(target.projectId,target.pageId,f.env);
  assert.match(canvas.document.html,/max-width:720px/);
  assert.match(canvas.document.html,/填写工作邮箱/);
  assert.deepEqual(second.sceneIds,saved.sceneIds);
  for(const bad of [
    {type:'source.replaceText',pointer:'/css',find:'width',replace:'padding'},
    {type:'source.replaceText',pointer:'/css',find:'wrong',replace:'x'},
    {type:'source.set',pointer:'/nodes/form/props/fields/length',value:0},
    {type:'source.set',pointer:'/nodes/form/props/fields/99',value:{}},
    {type:'source.set',pointer:'/state/__proto__/injected',value:1},
  ]){
    await assert.rejects(write(second.projectRevision,[{type:'source.set',pointer,value:'未发布'},bad]),error=>['SCHEMA_PATH','SCHEMA_OPERATIONS'].includes(error.code));
    const source=await read(pointer);
    assert.equal(JSON.parse(source.text),'填写工作邮箱');
    assert.equal(source.projectRevision,second.projectRevision);
  }
});

test('an older schema page gets current page navigation in the editor without rewriting its saved HTML',async()=>{
  const f=fixture(),initial=await semanticSetup(f),projectId=initial.project.id,pageId=initial.page.id;
  const target=await f.owner.execute({action:'page.create',projectId,designId:initial.page.designId,expectedRevision:initial.projectRevision,name:'首页 链接'},f.env);
  const definition=semanticFixture();
  definition.actions.home={type:'navigate',pageId:target.page.id};
  definition.nodes.form.props.actions=[{action:'home',text:'首页'}];
  const source=await f.owner.schema.apply({projectId,pageId,expectedRevision:target.projectRevision,document:definition},f.env);
  const next=await f.owner.schema.apply({projectId,pageId:target.page.id,expectedRevision:source.projectRevision,document:semanticFixture()},f.env);
  const previous=await f.owner.store.mutate(projectId,next.projectRevision,'Open a previous compiler build',p=>{
    p.artboards.find(item=>item.id===pageId).artifact.compilerVersion='1.0.0';
  },undefined,policy,false);
  const read=await f.owner.execute({action:'edit.read',projectId,pageId},f.env);
  const urls=html=>JSON.parse(html.match(/<script[^>]*id="dsh-document-model"[^>]*>([^<]+)<\/script>/)[1]).runtime.pageURLs;
  const link=targetPath=>path.posix.relative(path.posix.dirname(source.page.htmlPath),targetPath).split('/').map(encodeURIComponent).join('/');
  assert.deepEqual(urls(read.document.savedHTML),{[target.page.id]:link(target.page.htmlPath)});
  assert.deepEqual(urls(read.document.previewHTML),{[target.page.id]:link(next.page.htmlPath)});
  assert.equal(read.sourceHash,hash(read.document.savedHTML));
  assert.equal((await f.owner.workbench.project(projectId)).revision,previous.revision);
});

test('owner compilation resolves a bound design system through the normal binding path',async()=>{
  const {desktopSystemFiles}=await import('./desktop-theme.js');
  const f=fixture(),system=await f.owner.execute({action:'system.create',name:'PC theme',format:'directory',resources:desktopSystemFiles(),platforms:['web']},{user:true});
  const project=await f.owner.execute({action:'project.create',name:'Bound schema owner',systemId:system.id,systemVersion:1},{user:true}),basis=await f.owner.workbench.project(project.id);
  const saved=await f.owner.schema.apply({projectId:project.id,pageId:basis.artboards[0].id,expectedRevision:basis.revision,document:semanticFixture()},f.env);
  assert.equal(saved.binding.systemId,system.id);
});

test('editing a display tag updates its literal or scene-bound label through the normal editor',async()=>{
  const f=fixture(),initial=await semanticSetup(f),projectId=initial.project.id,pageId=initial.page.id;
  const document=semanticFixture();
  document.nodes.root.children.push('status','slot');
  document.nodes.status={kind:'component',use:'tag',props:{text:'营业中',tone:'success'}};
  document.nodes.slot={kind:'component',use:'ds-tag',props:{bind:'draft.slot'}};
  document.state.draft.slot='上午';
  document.scenes.afternoon={name:'下午预约',state:{draft:{slot:'下午'}}};
  const saved=await f.owner.schema.apply({projectId,pageId,expectedRevision:initial.projectRevision,document},f.env);
  const first=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:saved.projectRevision,
    operations:[{type:'text',nodeIds:['status'],value:'营业结束'}]},f.env);
  await f.owner.execute({action:'edit.apply',projectId,pageId,sceneId:'afternoon',expectedRevision:first.projectRevision,
    operations:[{type:'text',nodeIds:['slot'],value:'下午两点'}]},f.env);
  const source=(await f.owner.schema.read({projectId,pageId},f.env)).document;
  assert.equal(source.nodes.status.props.text,'营业结束');
  assert.equal(source.nodes.status.props.tone,'success');
  assert.equal(source.scenes.afternoon.state.draft.slot,'下午两点');
  assert.equal(source.state.draft.slot,'上午');
});

test('saved 1.0.0 through 1.0.2 select pages get the current scene preview without changing saved bytes',async()=>{
  const f=fixture(),initial=await semanticSetup(f),projectId=initial.project.id,pageId=initial.page.id;
  const definition=semanticFixture();
  definition.nodes.form.props.fields.push({id:'slot',label:'到店时段',control:'select',options:[{value:'am',label:'上午'},{value:'pm',label:'下午'}]});
  definition.state.draft.slot='am';
  definition.scenes.afternoon={name:'下午预约',state:{draft:{slot:'pm'}}};
  const result=await f.owner.schema.apply({projectId,pageId,expectedRevision:initial.projectRevision,document:definition},f.env);
  const root=await f.owner.projectPhysicalRoot(projectId),file=f.fs.files.get(path.join(root,result.page.htmlPath));
  const legacy=file.bytes.toString().replace(/(<script[^>]*data-dsh-schema-runtime[^>]*>)[\s\S]*?(<\/script>)/,'$1/* previous compiled runtime */$2');
  file.bytes=Buffer.from(legacy);
  let revision=result.projectRevision;
  for(const version of ['1.0.0','1.0.1','1.0.2']){
    const previous=await f.owner.store.mutate(projectId,revision,'Load previous compiled preview',p=>{
      const page=p.artboards.find(item=>item.id===pageId);
      page.artifact.compilerVersion=version;page.contentHash=hash(legacy);
    },undefined,policy,false);
    revision=previous.revision;
    const before=f.fs.snapshot();
    const read=await f.owner.execute({action:'edit.read',projectId,pageId},f.env);
    assert.equal(read.document.savedHTML,legacy);
    assert.equal(read.sourceHash,hash(legacy));
    assert.doesNotMatch(read.document.previewHTML,/previous compiled runtime/);
    assert.match(read.document.previewHTML,/data-schema-bind="draft.slot"/);
    assert.deepEqual(f.fs.snapshot(),before);
  }
});

test('inserted and duplicated canvas nodes retain their identities across later semantic builds',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const changed=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:saved.projectRevision,operations:[{type:'duplicate',nodeIds:['heading']},{type:'insert',parentId:'root',html:'<aside><p>Inserted note</p></aside>'}]},{user:true});
  const copyId=changed.changes.copies[0].rootId,canvas=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(canvas.document.nodes[copyId].text,'通知设置');
  const inserted=Object.values(canvas.document.nodes).find(node=>node.tag==='p'&&node.text==='Inserted note');
  assert.ok(inserted);
  const edited=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:changed.projectRevision,operations:[{type:'text',nodeIds:[copyId],value:'Copy changed'},{type:'text',nodeIds:[inserted.id],value:'Note changed'}]},{user:true});
  await f.owner.schema.apply({projectId,pageId,expectedRevision:edited.projectRevision,operations:[{type:'state.set',path:'draft.email',value:'recompiled@example.com'}]},f.env);
  const result=await f.owner.editor.read(projectId,pageId,f.env);
  assert.equal(result.document.nodes[copyId].text,'Copy changed');
  assert.equal(result.document.nodes[inserted.id].text,'Note changed');
});

test('scene-specific field edits preserve default data and visibility writes back to the definition',async()=>{
  const f=fixture(),saved=await semanticSetup(f),projectId=saved.project.id,pageId=saved.page.id;
  const changed=await f.owner.execute({action:'edit.apply',projectId,pageId,sceneId:'invalid',expectedRevision:saved.projectRevision,operations:[{type:'attributes',nodeIds:['form:email:input'],attributes:{value:'scene@example.com'}}]},{user:true});
  let source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.state.draft.email,'team@example.com');
  assert.equal(source.document.scenes.invalid.state.draft.email,'scene@example.com');
  const hidden=await f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:changed.projectRevision,operations:[{type:'visibility',nodeIds:['heading'],hidden:true}]},{user:true});
  source=await f.owner.schema.read({projectId,pageId},f.env);
  assert.equal(source.document.nodes.heading.hidden,true);
  assert.ok(hidden.saved);
});

test('canvas removal of a collection row updates its canonical records and stays removed',async()=>{
  const f=fixture(),project=await f.owner.execute({action:'project.create',name:'Collection edits'},{user:true}),basis=await f.owner.workbench.project(project.id),pageId=basis.artboards[0].id;
  const document={schemaVersion:1,id:'records',root:'table',nodes:{table:{kind:'component',use:'table',props:{source:'records',columns:[{id:'name',title:'名称'}]}}},state:{records:[{id:'a',name:'甲'},{id:'b',name:'乙'}]}};
  const saved=await f.owner.schema.apply({projectId:project.id,pageId,expectedRevision:basis.revision,document},f.env),row=Object.entries(saved.page.artifact.sourceMap).find(([,address])=>address.part==='row'&&address.recordKey==='a')[0];
  const removed=await f.owner.execute({action:'edit.apply',projectId:project.id,pageId,expectedRevision:saved.projectRevision,operations:[{type:'remove',nodeIds:[row]}]},{user:true});
  const source=await f.owner.schema.read({projectId:project.id,pageId},f.env);
  assert.deepEqual(source.document.state.records,[{id:'b',name:'乙'}]);
  const canvas=await f.owner.editor.read(project.id,pageId,f.env);
  assert.equal(canvas.document.nodes[row],undefined);
  assert.ok(removed.saved);
});
