import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DesignerStore} from './store.js';
import {WorkspaceService} from './workspace-service.js';
import {EditorService} from './editor-service.js';
import {AIWorkbench} from './ai-workbench.js';
import {DeliveryService,zipStored} from './delivery-service.js';
import {SourceWorkflows} from './source-workflows.js';
import {normalizeDocument,applyDocumentOperations,validateDocument} from './document-model.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const within=(root,target)=>target===root||target.startsWith(root+'/');
const errorCode=(...codes)=>error=>codes.includes(error.code);
const PAGE='<!doctype html><html><head><title>Integration</title></head><body><main id="app"><section id="selected"><h1 id="title">Initial title</h1><p id="description">Initial description</p></section><aside id="outside">Keep this sibling</aside></main></body></html>';
const domNode=(document,id)=>Object.values(document.nodes).find(node=>node.attributes.id===id);

/**
 * Contract-level storage double, not an OS sandbox. Identities deliberately have
 * opaque targetKeys; production code must use contains/processPath. Each test
 * owns a unique virtual root and clears it without touching host files.
 */
class IntegrationFS {
  constructor(root){this.root=root;this.files=new Map();this.dirs=new Set([root]);this.aliases=new Map();this.counter=0;this.writes=[];}
  canonical(value){
    let result=path.resolve(value);
    for(let pass=0;pass<16;pass++){
      const alias=[...this.aliases].sort(([a],[b])=>b.length-a.length).find(([from])=>within(from,result));
      if(!alias)return result;
      result=alias[1]+result.slice(alias[0].length);
    }
    throw Object.assign(Error('Cyclic test alias'),{code:'FS_INVALID_PATH'});
  }
  async resolve(value,{cwd=this.root,signal}={}){signal?.throwIfAborted();const displayPath=this.canonical(path.resolve(cwd,value));return {targetKey:'opaque-integration:'+hash(displayPath),displayPath};}
  processPath(target){return target.displayPath;}
  contains(parent,child){return within(parent.displayPath,child.displayPath);}
  async stat(target,signal){signal?.throwIfAborted();const record=this.files.get(target.displayPath);if(record)return {type:'file',version:record.version,size:record.bytes.length};if(this.dirs.has(target.displayPath)||[...this.files.keys()].some(file=>within(target.displayPath,file)))return {type:'directory',version:'directory'};return undefined;}
  async readBytes(target,signal,maxBytes){signal?.throwIfAborted();const record=this.files.get(target.displayPath);if(!record)throw Object.assign(Error('Missing file'),{code:'FS_NOT_FOUND'});if(record.bytes.length>maxBytes)throw Object.assign(Error('Read exceeds bound'),{code:'FS_TOO_LARGE'});return Buffer.from(record.bytes);}
  async readText(target,signal){return new TextDecoder('utf-8',{fatal:true}).decode(await this.readBytes(target,signal,64*1024*1024));}
  async readByteRange(target,{offset,length},signal){signal?.throwIfAborted();const record=this.files.get(target.displayPath);if(!record)throw Object.assign(Error('Missing file'),{code:'FS_NOT_FOUND'});return Buffer.from(record.bytes.subarray(offset,offset+length));}
  async listDir(target,signal){
    signal?.throwIfAborted();const children=new Map();
    for(const file of [...this.dirs,...this.files.keys()]){
      if(file===target.displayPath||!within(target.displayPath,file))continue;
      const rest=file.slice(target.displayPath.length+1),name=rest.split('/')[0];
      const child=await this.resolve(path.join(target.displayPath,name));
      children.set(name,{name,target:child,...await this.stat(child,signal)});
    }
    return [...children.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  checkPolicy(target,policy){
    assert.ok(policy,'Every write must carry its exact policy');
    const granted=policy.mode==='danger-full-access'||policy.mode==='workspace-write'&&[policy.workspaceRoot,...policy.additionalWritableRoots||[]].some(root=>within(this.canonical(root),target.displayPath));
    if(!granted)throw Object.assign(Error('Test policy denied write'),{code:'FS_SANDBOX_DENIED'});
  }
  ancestors(file){let parent=path.dirname(file);while(true){this.dirs.add(parent);const next=path.dirname(parent);if(next===parent)break;parent=next;}}
  async writeText(target,value,intent,signal,policy){
    signal?.throwIfAborted();this.checkPolicy(target,policy);assert.ok(intent,'Every write must carry a CAS intent');
    const before=this.files.get(target.displayPath);
    if(intent.kind==='createIfAbsent'?!!before:before?.version!==intent.version)throw Object.assign(Error('CAS mismatch'),{code:'FS_STALE_VERSION'});
    assert.ok(['createIfAbsent','replaceIfVersion'].includes(intent.kind));
    const version='fs-version-'+(++this.counter);this.ancestors(target.displayPath);this.files.set(target.displayPath,{bytes:Buffer.from(value),version});this.writes.push({path:target.displayPath,intent,policy});
    return {version,operation:before?'update':'create',before:before?.bytes.toString('utf8')??null,after:value};
  }
  async deleteFile(target,expected,signal,policy){
    signal?.throwIfAborted();this.checkPolicy(target,policy);assert.ok(expected?.version,'Deletes must carry CAS');const before=this.files.get(target.displayPath);
    if(before?.version!==expected.version)throw Object.assign(Error('CAS mismatch'),{code:'FS_STALE_VERSION'});
    this.files.delete(target.displayPath);this.writes.push({path:target.displayPath,intent:expected,policy});return {before:before.bytes.toString('utf8')};
  }
  async moveFile(source,dest,options,signal,policy){
    this.checkPolicy(source,policy);this.checkPolicy(dest,policy);assert.equal(options.expectedDestination.kind,'createIfAbsent');
    const before=this.files.get(source.displayPath);if(before?.version!==options.expectedSource?.version||this.files.has(dest.displayPath))throw Object.assign(Error('CAS mismatch'),{code:'FS_STALE_VERSION'});
    const destination=await this.writeText(dest,before.bytes.toString('utf8'),options.expectedDestination,signal,policy);await this.deleteFile(source,options.expectedSource,signal,policy);return {sourceBefore:before.bytes.toString('utf8'),destination,sourceDeleted:true};
  }
  seed(file,value){const resolved=this.canonical(file);this.ancestors(resolved);this.files.set(resolved,{bytes:Buffer.from(value),version:'external-'+(++this.counter)});}
  dispose(){this.files.clear();this.dirs.clear();this.aliases.clear();this.writes=[];}
}

function fixture(t,{fs,root}={}){
  root ||= '/workspace/workbench-integration-'+randomUUID();fs ||= new IntegrationFS(root);
  const policy={mode:'workspace-write',workspaceRoot:root};
  const store=new DesignerStore({fs,workspaceRoot:root,root:'Library',policy:()=>policy});
  const owner={
    store,bindings:new Map(),ctx:{fs,webServer:{getOrigin:()=> 'http://127.0.0.1:53998'},shell:{resolve(spec){throw Error('This integration suite does not substitute a fake process for the DSH sandbox: '+JSON.parse(spec.stdin).target);}}},
    policy:()=>policy,
    registerProjectLocation:(projectId,location,env)=>store.registerProjectLocation(projectId,location,env),
    projectPhysicalRoot:(projectId,signal)=>store.projectPhysicalRoot(projectId,signal)
  };
  owner.workbench=new WorkspaceService(owner);owner.editor=new EditorService(owner);owner.aiWorkbench=new AIWorkbench(owner);
  owner.execute=async(input,env={})=>{
    if(env.agent)await owner.aiWorkbench.authorizeAction(input,env);
    return input.action.replace(/^workbench\./,'').startsWith('edit.')?owner.editor.execute(input,env):owner.workbench.execute(input,env);
  };
  if(t)t.after(()=>fs.dispose());
  return {fs,root,policy,store,owner};
}
const userEnv=f=>({user:true,policy:f.policy,signal:new AbortController().signal});
async function createProject(f,extra={}){return f.owner.workbench.execute({action:'project.initialize',name:'Integration project',...extra},userEnv(f));}
async function workspaceChange(f,projectId,action,args={}){const p=await f.owner.workbench.project(projectId);return f.owner.workbench.execute({action,projectId,expectedRevision:p.revision,...args},userEnv(f));}
async function createPage(f,extra={}){
  const made=await createProject(f,extra),projectId=made.project.id;
  const design=(await workspaceChange(f,projectId,'design.create',{name:'Web design'})).design;
  const page=(await workspaceChange(f,projectId,'page.create',{designId:design.id,name:'Main page',html:PAGE})).page;
  return {projectId,design,page};
}
async function editRead(f,projectId,pageId,env=userEnv(f)){return f.owner.editor.execute({action:'edit.read',projectId,pageId},env);}
async function edit(f,projectId,pageId,operations,env=userEnv(f)){
  const basis=await editRead(f,projectId,pageId,env);
  return f.owner.execute({action:'edit.apply',projectId,pageId,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,operations},env);
}
async function admit(f,target,scope='selection'){
  const agent={id:'integration-agent-'+randomUUID()};f.owner.bindings.set(agent.id,target.projectId);
  const prepared=await f.owner.aiWorkbench.prepare({projectId:target.projectId,prompt:'Change only the explicitly selected content',target:{...target,scope}},userEnv(f));
  f.owner.aiWorkbench.setTask(agent,prepared.task);return {agent,policy:f.policy,signal:new AbortController().signal};
}

test('Delivery-first partial workbench metadata still migrates legacy pages with stable IDs and preserves foreign worker fields',async t=>{
  const f=fixture(t),legacy=await f.store.projectCreate({name:'Legacy before workbench'},undefined,f.policy);
  const created=await f.store.artboardCreate({projectId:legacy.id,expectedRevision:legacy.revision,name:'Legacy page',html:PAGE},undefined,f.policy),projectId=legacy.id;
  const delivery=new DeliveryService(f.owner),foreign={exports:[{id:'e-existing',manifestPath:'delivery/e-existing/manifest.json'}],shares:[]},sources=[{id:'r-existing',directory:path.join(f.root,'external-source'),root:path.join(f.root,'external-source'),readonly:true,writable:false}];
  await delivery.mutate({projectId,expectedRevision:created.projectRevision},userEnv(f),'Legacy external source registration',(_project,w)=>{w.deliveryRecords=foreign;w.sourceProjects=sources;});
  const partial=(await f.store.projectGet(projectId)).project;assert.equal(partial.workbench.schemaVersion,1);assert.equal(partial.workbench.designs,undefined);
  const writes=f.fs.writes.length,opened=await f.owner.workbench.execute({action:'workspace.open',projectId}),openedAgain=await f.owner.workbench.execute({action:'workspace.open',projectId});
  assert.equal(f.fs.writes.length,writes);assert.equal(opened.designs.length,1);assert.equal(opened.designs[0].id,openedAgain.designs[0].id);assert.equal(opened.designs[0].id,'d-legacy-'+projectId);assert.deepEqual(opened.designs[0].pageIds,[created.artboard.id]);
  assert.equal(opened.pages[0].id,created.artboard.id);assert.equal(opened.pages[0].htmlPath,created.artboard.htmlPath);assert.equal(opened.pages[0].contentHash,created.artboard.contentHash);assert.deepEqual(opened.project.history,partial.history);assert.deepEqual(opened.project.workbench.deliveryRecords,foreign);assert.deepEqual(opened.project.workbench.sourceProjects,sources);
  const saved=await f.owner.workbench.execute({action:'project.initialize',projectId,expectedRevision:partial.revision},userEnv(f)),reloaded=(await f.store.projectGet(projectId)).project;
  assert.equal(reloaded.workbench.designs[0].id,opened.designs[0].id);assert.equal(reloaded.workbench.files.find(file=>file.pageId===created.artboard.id).id,opened.files.find(file=>file.pageId===created.artboard.id).id);assert.deepEqual(reloaded.workbench.deliveryRecords,foreign);assert.deepEqual(reloaded.workbench.sourceProjects,sources);assert.deepEqual(reloaded.history.slice(1),partial.history);assert.equal((await f.store.artboardGet(projectId,created.artboard.id)).html,PAGE);assert.equal(saved.projectRevision,partial.revision+1);
});

test('real Editor AST text/style/attribute/structure changes persist through Workspace and a fresh owner, then undo/redo restores saved content and IDs',async t=>{
  const f=fixture(t),{projectId,design,page}=await createPage(f),before=await editRead(f,projectId,page.id);
  const title=domNode(before.document,'title').id,selected=domNode(before.document,'selected').id,outside=domNode(before.document,'outside').id;
  const saved=await edit(f,projectId,page.id,[
    {type:'text',nodeIds:[title],value:'Persisted title'},
    {type:'style',nodeIds:[title],styles:{color:'#2468ac',fontSize:28,padding:'8px 16px'}},
    {type:'attributes',nodeIds:[title],attributes:{'aria-label':'Saved accessible title','data-purpose':'integration'}},
    {type:'insert',parentId:selected,index:1,html:'<button id="inserted">New control</button>'}
  ]);
  assert.equal(saved.saved,true);assert.equal(saved.document.nodes[title].text,'Persisted title');assert.equal(saved.document.nodes[title].style.color,'#2468ac');
  const inserted=domNode(saved.document,'inserted').id;
  assert.equal(saved.document.nodes[inserted].parentId,selected);assert.equal(saved.document.nodes[outside].hash,before.document.nodes[outside].hash);
  const raw=await f.owner.workbench.execute({action:'file.read',projectId,fileId:saved.file.id,limit:30000});
  assert.match(raw.text,/Persisted title/);assert.match(raw.text,/aria-label="Saved accessible title"/);assert.match(raw.text,new RegExp('data-dsh-node="'+title+'"'));
  const restarted=fixture(undefined,{fs:f.fs,root:f.root}),reloaded=await editRead(restarted,projectId,page.id);
  assert.equal(reloaded.file.id,before.file.id);assert.equal(reloaded.page.designId,design.id);assert.equal(domNode(reloaded.document,'title').id,title);assert.equal(domNode(reloaded.document,'inserted').id,inserted);assert.equal(domNode(reloaded.document,'title').style['font-size'],'28px');
  assert.deepEqual(Object.keys(reloaded.document.nodes).sort(),Object.keys(saved.document.nodes).sort());
  const undone=await restarted.owner.editor.execute({action:'edit.undo',projectId,pageId:page.id,expectedRevision:reloaded.projectRevision},userEnv(restarted));
  assert.equal(domNode(undone.document,'title').text,'Initial title');assert.equal(domNode(undone.document,'title').id,title);assert.equal(domNode(undone.document,'inserted'),undefined);
  const redone=await restarted.owner.editor.execute({action:'edit.redo',projectId,pageId:page.id,expectedRevision:undone.projectRevision},userEnv(restarted));
  assert.equal(domNode(redone.document,'title').text,'Persisted title');assert.equal(domNode(redone.document,'inserted').id,inserted);assert.equal(redone.file.id,before.file.id);
});

test('real normalized source file.write reloads as the same Editor document and participates in Editor undo/redo',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),before=await editRead(f,projectId,page.id),title=domNode(before.document,'title').id;
  const candidate=applyDocumentOperations(before.document.html,[{type:'text',nodeIds:[title],value:'Source editor saved text'},{type:'style',nodeIds:[title],styles:{borderRadius:9}}]);
  const saved=await workspaceChange(f,projectId,'file.write',{fileId:before.file.id,expectedVersion:before.version,content:candidate.html});
  const fresh=new EditorService(f.owner),reloaded=await fresh.execute({action:'edit.read',projectId,pageId:page.id},userEnv(f));
  assert.equal(reloaded.document.html,candidate.html);assert.equal(domNode(reloaded.document,'title').id,title);assert.equal(domNode(reloaded.document,'title').style['border-radius'],'9px');
  assert.notEqual(saved.file.path,before.page.htmlPath);assert.equal((await f.store.read(`projects/${projectId}/${before.page.htmlPath}`)).content,PAGE);
  const undo=await fresh.execute({action:'edit.undo',projectId,pageId:page.id,expectedRevision:reloaded.projectRevision},userEnv(f));assert.equal(domNode(undo.document,'title').text,'Initial title');
  const redo=await fresh.execute({action:'edit.redo',projectId,pageId:page.id,expectedRevision:undo.projectRevision},userEnv(f));assert.equal(domNode(redo.document,'title').text,'Source editor saved text');
});

test('explicit user merge reopens in real Editor with stable nodes and restores original valid bytes through undo',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),initial=await editRead(f,projectId,page.id),title=domNode(initial.document,'title').id,outside=domNode(initial.document,'outside').id;
  const local=applyDocumentOperations(initial.document.html,[{type:'text',nodeIds:[title],value:'Local title'},{type:'style',nodeIds:[title],styles:{color:'#123456'}}]),merged=applyDocumentOperations(local.html,[{type:'text',nodeIds:[title],value:'Remote title + Local title'}]);
  await f.owner.workbench.execute({action:'draft.save',projectId,resourceId:initial.file.id,expectedVersion:null,draft:{content:local.html,baseVersion:initial.version,dirty:true}},userEnv(f));
  const target=await f.store.target(`projects/${projectId}/${page.htmlPath}`),external=PAGE.replace('Initial title','Remote title');f.fs.seed(target.displayPath,external);await assert.rejects(editRead(f,projectId,page.id),errorCode('VERSION_CONFLICT'));
  const actual=await f.owner.workbench.execute({action:'file.read',projectId,fileId:initial.file.id});assert.equal(actual.externallyModified,true);let normalizations=0,validations=0;f.owner.documentModel={normalizeDocument(...args){normalizations++;return normalizeDocument(...args);},validateDocument(...args){validations++;return validateDocument(...args);}};
  const saved=await f.owner.workbench.execute({action:'file.reconcile',projectId,fileId:initial.file.id,expectedProjectRevision:(await f.store.projectGet(projectId)).project.revision,expectedVersion:actual.version,mode:'merge',content:merged.html},userEnv(f));assert.ok(normalizations>=1);assert.ok(validations>=1);assert.equal(await f.fs.readText(target),external);
  const restarted=fixture(undefined,{fs:f.fs,root:f.root}),reopened=await editRead(restarted,projectId,page.id);assert.equal(domNode(reopened.document,'title').id,title);assert.equal(domNode(reopened.document,'title').text,'Remote title + Local title');assert.equal(reopened.document.nodes[outside].hash,initial.document.nodes[outside].hash);assert.equal(reopened.page.htmlPath,saved.file.path);assert.equal((await restarted.owner.workbench.execute({action:'draft.get',projectId,resourceId:initial.file.id})).draft.content,local.html);
  const history=await restarted.owner.workbench.execute({action:'file.history',projectId,fileId:initial.file.id});assert.equal((await restarted.store.read(`projects/${projectId}/${history.entries[0].contentPath}`)).content,PAGE);assert.equal((await restarted.store.read(`projects/${projectId}/${saved.reconciliation.external.contentPath}`)).content,external);
  const undone=await restarted.owner.editor.execute({action:'edit.undo',projectId,pageId:page.id,expectedRevision:reopened.projectRevision},userEnv(restarted));assert.equal(domNode(undone.document,'title').text,'Initial title');assert.equal(domNode(undone.document,'title').id,title);const redone=await restarted.owner.editor.execute({action:'edit.redo',projectId,pageId:page.id,expectedRevision:undone.projectRevision},userEnv(restarted));assert.equal(domNode(redone.document,'title').text,'Remote title + Local title');assert.equal(await f.fs.readText(target),external);
});

test('real AI project-file authority follows two immutable saves by stable ID and rejects sibling paths and identities',async t=>{
  const f=fixture(t),{projectId,design,page}=await createPage(f),initial=await editRead(f,projectId,page.id),sibling=await f.owner.workbench.execute({action:'page.create',projectId,designId:design.id,expectedRevision:(await f.store.projectGet(projectId)).project.revision,name:'Sibling',html:PAGE},userEnv(f)),other=await editRead(f,projectId,sibling.page.id);
  const prepared=await f.owner.aiWorkbench.prepare({action:'preview.prepare',projectId,prompt:'Edit only the selected HTML file',target:{projectId,scope:'project',fileId:initial.file.id,path:initial.file.path}},userEnv(f)),task=prepared.task,originalPath=initial.file.path,paths=[originalPath];
  assert.equal(task.authority.kind,'project-file');assert.equal(task.authority.fileId,initial.file.id);
  for(const label of ['First authorized save','Second authorized save']){
    const readInput={action:'file.read',projectId,fileId:initial.file.id},readAuth=await f.owner.aiWorkbench.authorizeAction(readInput,{task,user:false,policy:f.policy}),read=await f.owner.workbench.execute(readAuth.input,{task,target:task,scope:task,user:false,policy:readAuth.policy});const model=normalizeDocument(read.text),title=domNode(model,'title').id,candidate=applyDocumentOperations(model.html,[{type:'text',nodeIds:[title],value:label}]);
    const input={action:'file.write',projectId,fileId:initial.file.id,path:read.path,expectedRevision:(await f.store.projectGet(projectId)).project.revision,expectedVersion:read.version,content:candidate.html},authority=await f.owner.aiWorkbench.authorizeAction(input,{task,user:false,policy:f.policy}),saved=await f.owner.workbench.execute(authority.input,{task,target:task,scope:task,user:false,policy:authority.policy});
    assert.equal(saved.fileId,initial.file.id);assert.notEqual(saved.file.path,read.path);paths.push(saved.file.path);assert.equal(domNode((await editRead(f,projectId,page.id)).document,'title').text,label);
  }
  assert.equal(new Set(paths).size,3);const current=await f.owner.workbench.execute({action:'file.read',projectId,fileId:initial.file.id});
  await assert.rejects(f.owner.aiWorkbench.authorizeAction({action:'file.write',projectId,fileId:initial.file.id,path:other.file.path,content:PAGE},{task,user:false,policy:f.policy}),errorCode('SCOPE_DENIED'));await assert.rejects(f.owner.aiWorkbench.authorizeAction({action:'file.write',projectId,fileId:other.file.id,path:current.path,content:PAGE},{task,user:false,policy:f.policy}),errorCode('SCOPE_DENIED'));await assert.rejects(f.owner.aiWorkbench.authorizeAction({action:'file.rename',projectId,fileId:initial.file.id,path:current.path,name:'Outside the frozen file.html'},{task,user:false,policy:f.policy}),errorCode('SCOPE_DENIED'));assert.equal((await f.store.artboardGet(projectId,sibling.page.id)).html,PAGE);
});

test('external HTML conflict retains external bytes and actual AST candidate in a recovery file; Editor refuses a stale content hash',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),before=await editRead(f,projectId,page.id),title=domNode(before.document,'title').id;
  const candidate=applyDocumentOperations(before.document.html,[{type:'text',nodeIds:[title],value:'Incoming unsaved text'}]);
  const target=await f.store.target(`projects/${projectId}/${page.htmlPath}`),external=PAGE.replace('Initial title','External saved text');f.fs.seed(target.displayPath,external);
  let conflict;try{await workspaceChange(f,projectId,'file.write',{fileId:before.file.id,expectedVersion:before.version,content:candidate.html});}catch(error){conflict=error;}
  assert.equal(conflict?.code,'VERSION_CONFLICT');assert.ok(conflict.details.recovery.path.startsWith('.workbench/conflicts/'));
  assert.equal(await f.fs.readText(target),external);
  const recovery=JSON.parse((await f.store.read(`projects/${projectId}/${conflict.details.recovery.path}`)).content);
  assert.equal(recovery.incoming,candidate.html);assert.equal(normalizeDocument(recovery.incoming).nodes[title].text,'Incoming unsaved text');
  await assert.rejects(editRead(f,projectId,page.id),errorCode('VERSION_CONFLICT'));
  assert.equal((await f.store.projectGet(projectId)).project.revision,before.projectRevision);
});

test('provenance-pinned file references reject external bytes even when source version and saved metadata did not change',async t=>{
  const f=fixture(t),projectId=(await createProject(f)).project.id,original='<svg><rect width="10"/></svg>',sourceVersion='origin-version-1';
  const imported=await workspaceChange(f,projectId,'file.import',{name:'immutable-original.svg',mimeType:'image/svg+xml',type:'reference',bytesBase64:Buffer.from(original).toString('base64'),source:{kind:'website',version:sourceVersion}});
  const reference={fileId:imported.fileId},resolved=await f.owner.workbench.execute({action:'reference.resolve',projectId,reference});assert.equal(resolved.file.sha256,hash(original));assert.equal(resolved.file.source.version,sourceVersion);
  const prepared=await f.owner.aiWorkbench.prepare({projectId,prompt:'Read this exact imported source',target:{projectId,scope:'read'},references:[reference]},userEnv(f));assert.equal(prepared.task.refs[0].invalid,false);
  const target=await f.store.target(`projects/${projectId}/${imported.file.path}`);f.fs.seed(target.displayPath,'<svg><circle r="999"/></svg>');
  await assert.rejects(f.owner.workbench.execute({action:'reference.resolve',projectId,reference}),errorCode('REFERENCE_VERSION_CONFLICT'));
  const revalidated=await f.owner.aiWorkbench.revalidate(prepared.task,userEnv(f));assert.equal(revalidated.invalid,true);assert.equal(revalidated.current[0].reason,'REFERENCE_VERSION_CONFLICT');assert.equal(revalidated.historical[0].contentHash,hash(original));
  const persisted=(await f.store.projectGet(projectId)).project.workbench.files.find(file=>file.id===imported.fileId);assert.equal(persisted.source.version,sourceVersion);assert.equal(persisted.sha256,hash(original));
});

test('page references verify actual saved HTML bytes before returning unchanged revision metadata',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),reference={pageId:page.id,sourceVersion:page.revision};
  const resolved=await f.owner.workbench.execute({action:'reference.resolve',projectId,reference});assert.equal(resolved.page.contentHash,hash(PAGE));
  const target=await f.store.target(`projects/${projectId}/${page.htmlPath}`);f.fs.seed(target.displayPath,PAGE.replace('Initial title','Externally modified without metadata'));
  await assert.rejects(f.owner.workbench.execute({action:'reference.resolve',projectId,reference}),errorCode('REFERENCE_VERSION_CONFLICT'));
  assert.equal((await f.store.projectGet(projectId)).project.artboards.find(p=>p.id===page.id).revision,page.revision);
});

test('copied file references use the copy FsVersion while provenance retains the source file version',async t=>{
  const f=fixture(t),projectId=(await createProject(f)).project.id,original=await workspaceChange(f,projectId,'file.create',{path:'docs/original.md',expectedVersion:null,content:'Copied content'}),sourceRead=await f.owner.workbench.execute({action:'file.read',projectId,fileId:original.fileId});
  const copied=await workspaceChange(f,projectId,'file.copy',{fileId:original.fileId,to:'docs/copied.md'}),copyRead=await f.owner.workbench.execute({action:'file.read',projectId,fileId:copied.fileId});
  assert.equal(copied.file.source.version,sourceRead.version);assert.notEqual(copyRead.version,sourceRead.version);
  const resolved=await f.owner.workbench.execute({action:'reference.resolve',projectId,reference:{fileId:copied.fileId,sourceVersion:copyRead.version}});
  assert.equal(resolved.sourceVersion,copyRead.version);assert.equal(resolved.file.source.version,sourceRead.version);assert.equal(resolved.contentHash??resolved.file.sha256,hash('Copied content'));
});

test('legacy registered references without a stored hash return actual bytes digest without mutating metadata',async t=>{
  const f=fixture(t),projectId=(await createProject(f)).project.id,resourceId='f-legacy-reference',logical='docs/legacy-reference.md',original='Actual legacy reference';
  f.fs.seed((await f.store.target(`projects/${projectId}/${logical}`)).displayPath,original);
  const p=(await f.store.projectGet(projectId)).project;await f.store.mutate(projectId,p.revision,'Legacy registration without digest',next=>next.workbench.files.push({id:resourceId,path:logical,type:'reference',mimeType:'text/markdown',readonly:true,source:{version:'legacy-origin'}}),undefined,f.policy,false);
  const loaded=await f.owner.workbench.execute({action:'file.read',projectId,fileId:resourceId}),writes=f.fs.writes.length,resolved=await f.owner.workbench.execute({action:'reference.resolve',projectId,reference:{fileId:resourceId,sourceVersion:loaded.version}});
  assert.equal(resolved.contentHash??resolved.file?.sha256,hash(original));assert.equal(f.fs.writes.length,writes);assert.equal((await f.store.projectGet(projectId)).project.workbench.files.find(file=>file.id===resourceId).sha256,undefined);
});

test('concurrent real Editor saves admit one document version and preserve the losing AST candidate',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),basis=await editRead(f,projectId,page.id),title=domNode(basis.document,'title').id;
  const results=await Promise.allSettled(['Human candidate','AI candidate'].map(value=>f.owner.editor.execute({action:'edit.apply',projectId,pageId:page.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,operations:[{type:'text',nodeIds:[title],value}]},userEnv(f))));
  const winners=results.filter(result=>result.status==='fulfilled'),losers=results.filter(result=>result.status==='rejected');assert.equal(winners.length,1);assert.equal(losers.length,1);assert.equal(losers[0].reason.code,'VERSION_CONFLICT');
  const saved=await editRead(f,projectId,page.id),current=saved.document.nodes[title].text;assert.equal(current,winners[0].value.document.nodes[title].text);
  const recovery=JSON.parse((await f.store.read(`projects/${projectId}/${losers[0].reason.details.recovery.path}`)).content),candidate=normalizeDocument(recovery.incoming).nodes[title].text;
  assert.notEqual(current,candidate);assert.deepEqual([current,candidate].sort(),['AI candidate','Human candidate']);assert.equal(saved.projectRevision,basis.projectRevision+1);
});

test('real AIWorkbench selection admits local edits and rejects sibling, ancestor, active content and whole-page file writes',async t=>{
  const f=fixture(t),{projectId,design,page}=await createPage(f);
  f.owner.preparePageHtml=(value,context)=>f.owner.editor.prepare(value,context);
  // Persist normalized IDs before admitting an AI task; selection is then an exact saved identity.
  await edit(f,projectId,page.id,[{type:'text',nodeIds:[domNode((await editRead(f,projectId,page.id)).document,'title').id],value:'Admitted title'}]);
  const before=await editRead(f,projectId,page.id),selected=domNode(before.document,'selected').id,title=domNode(before.document,'title').id,outside=domNode(before.document,'outside').id,app=domNode(before.document,'app').id;
  const env=await admit(f,{projectId,designId:design.id,pageId:page.id,nodeIds:[selected]});
  const saved=await edit(f,projectId,page.id,[{type:'text',nodeIds:[title],value:'Allowed selection change'}],env);
  assert.equal(saved.document.nodes[title].text,'Allowed selection change');assert.equal(saved.document.nodes[outside].hash,before.document.nodes[outside].hash);
  const revision=saved.projectRevision,writes=f.fs.writes.length;
  await assert.rejects(edit(f,projectId,page.id,[{type:'text',nodeIds:[outside],value:'Forbidden sibling'}],env),errorCode('SCOPE_DENIED'));
  await assert.rejects(edit(f,projectId,page.id,[{type:'attributes',nodeIds:[app],attributes:{class:'forbidden'}}],env),errorCode('SCOPE_DENIED'));
  await assert.rejects(edit(f,projectId,page.id,[{type:'insert',parentId:selected,html:'<style>body{display:none}</style>'}],env),errorCode('SCOPED_ACTIVE_CONTENT','SCOPE_DENIED'));
  await assert.rejects(f.owner.execute({action:'file.write',projectId,fileId:saved.file.id,content:applyDocumentOperations(saved.document.html,[{type:'text',nodeIds:[outside],value:'Forbidden raw sibling edit'}]).html,expectedRevision:revision,expectedVersion:saved.version},env),errorCode('SCOPE_DENIED'));
  assert.equal(f.fs.writes.length,writes);assert.equal((await f.store.projectGet(projectId)).project.revision,revision);
});

test('read-only policy, readonly file registration and a frozen read task deny Editor writes without publication',async t=>{
  const f=fixture(t),{projectId,design,page}=await createPage(f),before=await editRead(f,projectId,page.id),title=domNode(before.document,'title').id;
  let writes=f.fs.writes.length;
  await assert.rejects(edit(f,projectId,page.id,[{type:'text',nodeIds:[title],value:'Policy bypass'}],{...userEnv(f),policy:{...f.policy,mode:'read-only'}}),errorCode('FS_SANDBOX_DENIED'));
  assert.equal(f.fs.writes.length,writes);
  const readTask=await admit(f,{projectId,designId:design.id,pageId:page.id,nodeIds:[]},'read');
  await assert.rejects(edit(f,projectId,page.id,[{type:'text',nodeIds:[title],value:'Read task bypass'}],readTask),errorCode('SCOPE_DENIED'));
  assert.equal(f.fs.writes.length,writes);
  await f.store.mutate(projectId,before.projectRevision,'Register readonly page',project=>{project.workbench.files.find(file=>file.id===before.file.id).readonly=true;},undefined,f.policy,false);
  writes=f.fs.writes.length;
  await assert.rejects(edit(f,projectId,page.id,[{type:'text',nodeIds:[title],value:'Readonly bypass'}]),errorCode('READ_ONLY_RESOURCE'));
  assert.equal(f.fs.writes.length,writes);assert.equal((await f.store.artboardGet(projectId,page.id)).html,PAGE);
});

test('saveLocation/asParent registers a real Store root mapping, survives a new Store and keeps absolute roots out of project and export bytes',async t=>{
  const f=fixture(t),parent=path.join(f.root,'Chosen projects'),{projectId,design,page}=await createPage(f,{name:'可迁移项目',saveLocation:parent});
  const actual=await f.store.projectPhysicalRoot(projectId),expected=path.join(parent,'可迁移项目-'+projectId);assert.equal(actual,expected);
  const physical=await f.store.target(`projects/${projectId}/${page.htmlPath}`);assert.equal(physical.displayPath,path.join(actual,page.htmlPath));assert.equal(await f.fs.readText(physical),PAGE);
  assert.ok(f.fs.files.has(path.join(actual,'docs/requirements.md')));assert.ok(f.fs.files.has(path.join(actual,'project.json')));
  const privateIndex=await f.store.readJSON('.workbench/project-locations.json');assert.equal(privateIndex.value.locations.find(p=>p.projectId===projectId).root,actual);
  const rawProject=(await f.store.read(`projects/${projectId}/project.json`)).content;assert.equal(rawProject.includes(parent),false);assert.equal(rawProject.includes('physicalRoot'),false);assert.equal(rawProject.includes('saveLocation'),false);
  const restarted=fixture(undefined,{fs:f.fs,root:f.root});await restarted.store.loadProjectLocations();assert.equal(await restarted.store.projectPhysicalRoot(projectId),expected);
  const current=await editRead(restarted,projectId,page.id),title=domNode(current.document,'title').id;
  const saved=await edit(restarted,projectId,page.id,[{type:'text',nodeIds:[title],value:'Saved in custom root'}]);
  const mapped=await restarted.store.target(`projects/${projectId}/${saved.page.htmlPath}`);assert.ok(within(actual,mapped.displayPath));assert.match(await f.fs.readText(mapped),/Saved in custom root/);
  assert.equal((await restarted.store.state()).projects.find(p=>p.id===projectId).revision,saved.projectRevision);
  await restarted.owner.workbench.execute({action:'draft.save',projectId,resourceId:'private-chat',expectedVersion:null,draft:{text:'PRIVATE_DRAFT_SHOULD_NOT_EXPORT'}},userEnv(restarted));
  const delivery=new DeliveryService(restarted.owner),snapshot=await delivery.snapshot((await restarted.store.projectGet(projectId)).project,{format:'design-package',designId:design.id},userEnv(restarted));
  const archive=zipStored(snapshot.files);
  assert.equal(archive.includes(Buffer.from(actual)),false);assert.equal(archive.includes(Buffer.from(parent)),false);assert.equal(archive.includes(Buffer.from('PRIVATE_DRAFT_SHOULD_NOT_EXPORT')),false);assert.equal(snapshot.files.some(f=>f.path.includes('.workbench')),false);
  const packageFile=JSON.parse(snapshot.files.find(f=>f.path==='design-package.json').bytes.toString('utf8'));assert.equal(packageFile.project.id,projectId);assert.equal(Object.hasOwn(packageFile.project,'physicalRoot'),false);
});

test('exact location registration respects readonly/user/workspace boundaries and preserves a nonempty chosen directory',async t=>{
  const f=fixture(t),p=await f.store.projectCreate({name:'Empty location candidate'},undefined,f.policy),chosen=path.join(f.root,'existing-data');
  f.fs.seed(path.join(chosen,'keep.txt'),'User content');
  await assert.rejects(f.store.registerProjectLocation(p.id,chosen,{policy:f.policy,user:true}),errorCode('LOCATION_NOT_EMPTY'));
  assert.equal(await f.fs.readText(await f.fs.resolve(path.join(chosen,'keep.txt'))),'User content');assert.equal(f.fs.files.has(path.join(chosen,'project.json')),false);
  await assert.rejects(f.store.registerProjectLocation(p.id,path.join(f.root,'readonly'),{policy:{...f.policy,mode:'read-only'},user:true}),errorCode('FS_SANDBOX_DENIED'));
  await assert.rejects(f.store.registerProjectLocation(p.id,'/outside-workspace/custom',{policy:f.policy,user:true}),errorCode('FS_SANDBOX_DENIED'));
  await assert.rejects(f.store.registerProjectLocation(p.id,path.join(f.root,'user-only'),{policy:f.policy,user:false}),errorCode('USER_ONLY'));
  assert.equal(f.fs.files.has('/outside-workspace/custom/project.json'),false);
  assert.equal(await f.store.read('.workbench/project-locations.json',undefined,true),null);
  const exact=path.join(f.root,'exact-empty');f.fs.dirs.add(exact);await f.store.registerProjectLocation(p.id,exact,{policy:f.policy,user:true});assert.equal(await f.store.projectPhysicalRoot(p.id),exact);
  await assert.rejects(f.store.registerProjectLocation(p.id,path.join(f.root,'different'),{policy:f.policy,user:true}),errorCode('PROJECT_LOCATION_FIXED'));
});

test('unregistered project symlink escapes remain denied even when another registered root is valid',async t=>{
  const f=fixture(t),registered=await createProject(f,{location:path.join(f.root,'explicit-location')}),unregistered=await f.store.projectCreate({name:'Unregistered'},undefined,f.policy),foreign='/outside-library/foreign';
  f.fs.seed(path.join(foreign,'secret.md'),'Foreign data');f.fs.aliases.set(path.join(f.store.root,'projects',unregistered.id),foreign);
  await assert.rejects(f.store.target(`projects/${unregistered.id}/secret.md`),errorCode('PATH_OUTSIDE_WORKSPACE','PROJECT_SCOPE'));
  assert.ok(within(path.join(f.root,'explicit-location'),(await f.store.target(`projects/${registered.project.id}/README.md`)).displayPath));
  f.fs.aliases.set(path.join(f.root,'explicit-location','docs','escaped'),foreign);
  await assert.rejects(f.store.target(`projects/${registered.project.id}/docs/escaped/secret.md`),errorCode('PROJECT_SCOPE'));
});

test('clone reads frozen source versions only from the new root, rebases export ownership and starts without an old task request',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),sources=new SourceWorkflows(f.owner),planned=await sources.execute({action:'workbench.source.plan',projectId,expectedRevision:(await f.store.projectGet(projectId)).project.revision,kind:'files',name:'Frozen imported observation'},userEnv(f)),capture={id:'xc-frozen',projectId,preview:{projectId},pageId:planned.source.pages[0].id,stateId:'state-original',viewportId:'viewport-original',html:PAGE,htmlHash:hash(PAGE),nodes:[],regions:[{id:'region-owner',nodeIds:[],screenshot:{projectId}}],resources:[],status:'observed',context:{originalProjectId:projectId}};
  const finished=await sources.finishVersion(planned.project,planned.source,[capture],{...userEnv(f),user:false}),oldRoot=f.fs.processPath(await f.store.target(`projects/${projectId}`)),manifest={schemaVersion:1,exportId:'e-history',projectId,projectRevision:finished.projectRevision,files:[],artifact:{path:'delivery/e-history/artifact.html',mimeType:'text/html',sha256:hash(PAGE),byteLength:Buffer.byteLength(PAGE)}};await f.store.write(`projects/${projectId}/delivery/e-history/manifest.json`,JSON.stringify(manifest,null,2),null,undefined,f.policy);await f.store.write(`projects/${projectId}/delivery/e-history/artifact.html`,PAGE,null,undefined,f.policy);f.fs.seed(oldRoot+'/code/main.js','export const originalRootIsIndependent=true;');
  await f.store.mutate(projectId,(await f.store.projectGet(projectId)).project.revision,'Anchor original only',next=>{next.aiSessionId='designer-'+projectId;next.workbench.lastTaskRef={id:'task-original',sessionId:'designer-'+projectId,requestId:'rpc-original'};next.workbench.sourceProjects=[{id:'r-internal',root:oldRoot+'/code',directory:oldRoot+'/code',readonly:false,writable:true,writablePaths:['main.js'],authorization:{kind:'user-source-write'}}];next.workbench.deliveryRecords={exports:[{id:'e-history',projectId,format:'html',artifactPath:'delivery/e-history/artifact.html',manifestPath:'delivery/e-history/manifest.json',manifestHash:hash(JSON.stringify(manifest,null,2)),mimeType:'text/html',sha256:hash(PAGE),byteLength:Buffer.byteLength(PAGE)}],shares:[{id:'s-original',capability:'old-share-capability',exportId:'e-history'}]};},undefined,f.policy,false);
  const cloned=await workspaceChange(f,projectId,'project.clone',{name:'Independent source clone'}),cloneId=cloned.project.id,newRoot=f.fs.processPath(await f.store.target(`projects/${cloneId}`));assert.equal(cloned.project.workbench.lastTaskRef,undefined);assert.deepEqual(cloned.project.workbench.deliveryRecords.shares,[]);
  const readText=f.fs.readText.bind(f.fs),readRange=f.fs.readByteRange.bind(f.fs);f.fs.readText=async(target,...args)=>{assert.equal(within(oldRoot,target.displayPath),false,'Clone reads must not return to the old project root');return readText(target,...args);};f.fs.readByteRange=async(target,...args)=>{assert.equal(within(oldRoot,target.displayPath),false,'Clone source bytes must use the new physical root');return readRange(target,...args);};
  const observed=await sources.execute({action:'workbench.source.read',projectId:cloneId,sourceId:finished.source.id,versionId:finished.version.id,captureId:capture.id,format:'html'},{policy:f.policy,user:false});assert.equal(observed.text,PAGE);assert.equal(observed.capture.projectId,cloneId);assert.equal(observed.capture.preview.projectId,cloneId);assert.equal(observed.capture.regions[0].screenshot.projectId,cloneId);const context=await sources.execute({action:'workbench.source.read',projectId:cloneId,sourceId:finished.source.id,versionId:finished.version.id,captureId:capture.id,format:'context'},{policy:f.policy,user:false});assert.equal(JSON.parse(context.text).context.originalProjectId,projectId);assert.equal((await f.owner.workbench.execute({action:'reference.resolve',projectId:cloneId,reference:{resourceId:finished.source.id,sourceVersion:finished.version.id,captureId:capture.id}})).resolved,true);assert.equal((await f.owner.workbench.execute({action:'file.read',projectId:cloneId,sourceId:'r-internal',path:'main.js'})).text,'export const originalRootIsIndependent=true;');assert.equal(cloned.project.workbench.sourceProjects[0].root,newRoot+'/code');
  const delivery=new DeliveryService(f.owner);t.after(()=>delivery.dispose());const exported=await delivery.execute({action:'export.get',projectId:cloneId,exportId:'e-history'},userEnv(f));assert.equal(exported.manifest.projectId,cloneId);assert.equal(exported.export.projectId,cloneId);assert.equal(exported.manifest.clonedFrom.projectId,projectId);assert.equal(await f.fs.readText(await f.store.target(`projects/${cloneId}/delivery/e-history/artifact.html`)),PAGE);
  f.owner.ctx.sessionController={async state(){return {running:false,queue:[]};}};const fresh={id:'designer-'+cloneId,session:{snapshotEvents:()=>[]}};assert.equal((await f.owner.aiWorkbench.admissionState(fresh,{requestId:cloned.project.workbench.lastTaskRef?.requestId})).busy,false);assert.equal((await f.owner.aiWorkbench.admissionState(fresh,{requestId:'rpc-original'})).busy,true);assert.equal((await editRead(f,cloneId,page.id)).page.id,page.id);
});

test('unregistered sibling-project aliases cannot reinterpret one project ID as another project directory',async t=>{
  const f=fixture(t),a=await f.store.projectCreate({name:'A'},undefined,f.policy),b=await f.store.projectCreate({name:'B'},undefined,f.policy);
  const bRoot=await f.store.projectPhysicalRoot(b.id);f.fs.seed(path.join(bRoot,'private.md'),'B only');f.fs.aliases.set(path.join(f.store.root,'projects',a.id),bRoot);
  await assert.rejects(f.store.target(`projects/${a.id}/private.md`),errorCode('PATH_OUTSIDE_WORKSPACE','PROJECT_SCOPE'));
});

test('website replication saves the frozen DOM and its assets in a separate design and reopens it on retry without AI',async t=>{
  const f=fixture(t),{projectId,page}=await createPage(f),sources=new SourceWorkflows(f.owner),env=userEnv(f);
  const {project}=await f.store.projectGet(projectId);
  const planned=await sources.plan({projectId,expectedRevision:project.revision,kind:'website',url:'https://example.com/'},env);
  const asset='assets/i-observed/images/logo.svg';
  const capture={id:'xc-observed',pageId:planned.source.pages[0].id,viewportId:'desktop',stateId:'success',
    title:'预约成功',width:1440,height:900,url:'https://example.com/',html:'<!doctype html><html><body><img src="../'+asset+'"><p>已预约：上午场</p></body></html>',
    nodes:[],regions:[],resources:[{path:asset}],status:'observed'};
  await f.store.write('projects/'+projectId+'/'+asset,'<svg xmlns="http://www.w3.org/2000/svg"/>',null,undefined,f.policy);
  const frozen=await sources.finishVersion(planned.project,planned.source,[capture],{...env,user:false});
  const input={action:'workbench.source.replicate',projectId,designId:page.designId,sourceId:planned.source.id,
    versionId:frozen.version.id,captureId:capture.id,expectedRevision:frozen.projectRevision};
  f.owner.runAI=()=>assert.fail('Replication must not create a model request');
  const saved=await sources.execute(input,env),retry=await sources.execute(input,env);
  assert.notEqual(saved.design.id,page.designId);
  assert.equal(saved.page.designId,saved.design.id);
  assert.equal(saved.page.htmlPath,saved.design.folder+'/index.html');
  assert.deepEqual(saved.design.pageIds,[saved.page.id]);
  const after=(await f.store.projectGet(projectId)).project;
  assert.deepEqual(after.workbench.designs.find(item=>item.id===page.designId),project.workbench.designs.find(item=>item.id===page.designId));
  assert.equal(retry.page.id,saved.page.id);
  assert.equal(retry.projectRevision,saved.projectRevision);
  const copy=await f.store.artboardGet(projectId,saved.page.id);
  assert.ok(copy.html.includes('已预约：上午场'));
  assert.ok(copy.html.includes('src="assets/images/logo.svg"'));
  assert.ok(await f.fs.stat(await f.store.target('projects/'+projectId+'/'+saved.design.folder+'/assets/images/logo.svg')));
});
