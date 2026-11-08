import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {WorkspaceService,WORKSPACE_ACTIONS} from './workspace-service.js';
import {AIWorkbench,assertAction} from './ai-workbench.js';

const error=code=>Object.assign(Error(code),{code});
class HostFs {
  reads=[];denied=null;afterRead=null;
  async resolve(value){const canonical=await fs.realpath(value);return {targetKey:canonical,path:canonical};}
  processPath(t){return t.path;}
  contains(a,b){return b.path===a.path||b.path.startsWith(a.path+path.sep);}
  check(t){if(this.denied&&this.contains({path:this.denied},t))throw error('FS_SANDBOX_DENIED');}
  async stat(t){this.check(t);const s=await fs.stat(t.path,{bigint:true});return {type:s.isDirectory()?'directory':s.isFile()?'file':'other',size:Number(s.size),version:[s.dev,s.ino,s.size,s.mtimeNs].join(':')};}
  async listDir(t){this.check(t);return (await fs.readdir(t.path,{withFileTypes:true})).map(d=>({name:d.name,type:d.isDirectory()?'directory':d.isFile()?'file':'other'}));}
  async readByteRange(t,{offset,length}){this.check(t);assert.ok(length<=48004);this.reads.push({path:t.path,offset,length});const file=await fs.open(t.path,'r');try{const buffer=Buffer.alloc(length),result=await file.read(buffer,0,length,offset);await this.afterRead?.(t);return buffer.subarray(0,result.bytesRead);}finally{await file.close();}}
  writeText(){throw Error('Knowledge references must never write');}
}
async function fixture(run){
  const cwd=await fs.realpath(process.cwd()),root=path.join(cwd,'knowledge-test-'+randomUUID());await fs.mkdir(root);
  const locations={target:path.join(root,'target'),source:path.join(root,'source'),knowledge:path.join(root,'knowledge'),other:path.join(root,'other')};for(const value of Object.values(locations))await fs.mkdir(value);
  const provider=new HostFs(),records={};for(const id of ['p-target','p-source'])records[id]={id,name:id,revision:3,artboards:[],history:[],workbench:{schemaVersion:1,goal:'Public goal',files:[],designs:[],sourceProjects:[],sourceImports:[],requirementsPath:'docs/requirements.md',rulesPath:'docs/rules.md'}};
  const owner={ctx:{fs:provider},store:{projectRecord:async id=>{if(!records[id])throw error('NOT_FOUND');return {value:structuredClone(records[id])};},target:async rel=>{const id=rel.split('/')[1];return provider.resolve(id==='p-source'?locations.source:locations.target);}}};
  owner.store.projectGet=async id=>({project:structuredClone(records[id])});owner.bindings=new Map([['designer-p-target','p-target']]);
  const workspace=owner.workbench=new WorkspaceService(owner),policy={mode:'read-only',workspaceRoot:locations.target},agent={id:'designer-p-target'};
  const call=(action,extra={},env={user:true})=>workspace.execute({action,projectId:'p-target',...extra},{policy,...env});
  const add=async(base,rel,value)=>{const full=path.join(locations[base],rel);assert.ok(full.startsWith(locations[base]+path.sep));await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,value);return full;};
  const select=async()=>((await call('reference.create',{directory:locations.knowledge})).reference);
  const taskFor=async reference=>{const resolved=await call('reference.resolve',{reference});return {projectId:'p-target',refs:[{reference:structuredClone(reference),kind:reference.type,resourceId:reference.resourceId,sourceVersion:reference.sourceVersion,contentHash:resolved.contentHash,readonly:true,invalid:false}]};};
  try{await run({root,locations,provider,records,owner,workspace,call,add,select,taskFor,agent,policy});}
  finally{assert.equal(await fs.realpath(root),root);assert.equal(path.dirname(root),cwd);assert.match(path.basename(root),/^knowledge-test-[0-9a-f-]{36}$/);await fs.rm(root,{recursive:true,force:true});}
}

test('directory selection is user-only, readonly under readonly host policy, and serializable across service restart',()=>fixture(async f=>{
  await f.add('knowledge','guide.md','真实知识 content');const reference=await f.select();assert.equal(reference.readonly,true);assert.equal(reference.rootPath,f.locations.knowledge);assert.ok(WORKSPACE_ACTIONS['reference.create']);
  for(const env of [{},{agent:f.agent},{user:true,agent:f.agent}])await assert.rejects(f.call('reference.create',{directory:f.locations.knowledge},env),{code:'USER_ONLY'});
  const task=JSON.parse(JSON.stringify(await f.taskFor(reference))),restarted=new WorkspaceService(f.owner),restored=task.refs[0].reference;
  const result=await restarted.execute({action:'reference.read',projectId:'p-target',reference:restored,path:'guide.md'},{policy:f.policy,task});assert.equal(result.text,'真实知识 content');assert.equal(result.readonly,true);assert.equal(JSON.stringify(result).includes(f.root),false);assert.deepEqual(f.records['p-target'].workbench.sourceProjects,[]);
}));

test('task refs admission denies invented roots, revisions, invalid refs and spoofed user agent',()=>fixture(async f=>{
  await f.add('knowledge','guide.md','Public');await f.add('other','guide.md','Other');const ref=await f.select(),task=await f.taskFor(ref),other=(await f.call('reference.create',{directory:f.locations.other})).reference;
  for(const env of [{agent:f.agent},{agent:f.agent,user:true},{task:{...task,projectId:'p-source'}},{task:{...task,refs:[]}}])await assert.rejects(f.call('reference.read',{reference:ref,path:'guide.md'},env),{code:'SCOPE_DENIED'});
  for(const reference of [other,{...ref,rootPath:f.locations.other},{...ref,sourceVersion:'changed'}])await assert.rejects(f.call('reference.read',{reference,path:'guide.md'},{task}),e=>['SCOPE_DENIED','REFERENCE_VERSION_CONFLICT'].includes(e.code));
  task.refs[0].invalid=true;await assert.rejects(f.call('reference.list',{reference:ref},{task}),{code:'SCOPE_DENIED'});
}));

test('canonical containment and canonical privacy block real symlink escapes and private aliases',()=>fixture(async f=>{
  await f.add('knowledge','guide.md','Public');const secret=await f.add('knowledge','.env','SECRET'),outside=await f.add('other','outside.md','OUTSIDE');
  await fs.symlink(outside,path.join(f.locations.knowledge,'escape.md'));await fs.symlink(secret,path.join(f.locations.knowledge,'alias.md'));await fs.symlink(f.locations.other,path.join(f.locations.knowledge,'escape-dir'));
  const reference=await f.select(),task=await f.taskFor(reference),list=await f.call('reference.list',{reference},{task});assert.deepEqual(list.entries.map(e=>e.path),['guide.md']);
  for(const value of ['../other/outside.md','/etc/passwd','a/../guide.md','a\\guide.md'])await assert.rejects(f.call('reference.read',{reference,path:value},{task}),{code:'INVALID_PATH'});
  for(const value of ['escape.md','escape-dir/outside.md'])await assert.rejects(f.call('reference.read',{reference,path:value},{task}),{code:'REFERENCE_SCOPE'});
  for(const value of ['.env','alias.md'])await assert.rejects(f.call('reference.read',{reference,path:value},{task}),{code:'SCOPE_DENIED'});
  assert.equal(f.provider.reads.length,0);
}));

test('listing is bounded, single-level, deterministic and omits private source internals',()=>fixture(async f=>{
  for(const rel of ['z.md','a.md','folder/leaf.md','.git/config','node_modules/a.js','credentials.json','sources/private.md','versions/history.md','project.json'])await f.add('knowledge',rel,'Text');
  const reference=await f.select(),task=await f.taskFor(reference),first=await f.call('reference.list',{reference,limit:2},{task});assert.deepEqual(first.entries.map(e=>e.path),['a.md','folder']);assert.equal(first.nextOffset,2);assert.equal(first.total,3);const next=await f.call('reference.list',{reference,offset:first.nextOffset,limit:2},{task});assert.deepEqual(next.entries.map(e=>e.path),['z.md']);assert.equal(next.nextOffset,null);
  assert.deepEqual((await f.call('reference.list',{reference,path:'folder'},{task})).entries.map(e=>e.path),['folder/leaf.md']);
  for(const input of [{limit:201},{offset:-1},{limit:0},{offset:0.5}])await assert.rejects(f.call('reference.list',{reference,...input},{task}),{code:'INVALID_INPUT'});
}));

test('UTF-8 pages preserve boundaries and use bounded reads with continuation version checks',()=>fixture(async f=>{
  const text='中文🙂 alpha\n'.repeat(4000);const file=await f.add('knowledge','large.md',text),reference=await f.select(),task=await f.taskFor(reference);let offset=0,collected='',version;
  while(offset!==null){const result=await f.call('reference.read',{reference,path:'large.md',offset,limit:19,...(version?{expectedVersion:version}:{})},{task});assert.ok(Array.from(result.text).length<=19);assert.equal(result.offsetUnit,'bytes');collected+=result.text;offset=result.nextOffset;version=result.version;}
  assert.equal(collected,text);assert.ok(f.provider.reads.every(r=>r.length===80));await fs.writeFile(file,'changed');await assert.rejects(f.call('reference.read',{reference,path:'large.md',offset:0,expectedVersion:version},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
  for(const input of [{limit:12001},{offset:-1}])await assert.rejects(f.call('reference.read',{reference,path:'large.md',...input},{task}),{code:'INVALID_INPUT'});
}));

test('directory count cap and non-text bytes fail closed while one-character emoji pages advance',()=>fixture(async f=>{
  await f.add('knowledge','emoji.txt','🙂中');await f.add('knowledge','binary.dat',Buffer.from([0,1,2]));await f.add('knowledge','invalid.txt',Buffer.from([0xff,0xfe]));const reference=await f.select(),task=await f.taskFor(reference),first=await f.call('reference.read',{reference,path:'emoji.txt',limit:1},{task});assert.equal(first.text,'🙂');assert.equal(first.nextOffset,4);assert.equal((await f.call('reference.read',{reference,path:'emoji.txt',limit:1,offset:first.nextOffset},{task})).text,'中');
  for(const path of ['binary.dat','invalid.txt'])await assert.rejects(f.call('reference.read',{reference,path},{task}),{code:'UNSUPPORTED_ENCODING'});
  f.provider.listDir=async()=>Array.from({length:10001},(_,i)=>({name:'entry-'+i,type:'file'}));await assert.rejects(f.call('reference.list',{reference},{task}),{code:'TREE_LIMIT'});
}));

test('host policy denial propagates on selection, listing, reading without native fallback',()=>fixture(async f=>{
  await f.add('knowledge','guide.md','Public');const reference=await f.select(),task=await f.taskFor(reference);f.provider.denied=f.locations.knowledge;
  for(const action of ['reference.create','reference.resolve','reference.list','reference.read'])await assert.rejects(f.call(action,{directory:f.locations.knowledge,reference,path:'guide.md'},{...(action==='reference.create'?{user:true}:{task})}),{code:'FS_SANDBOX_DENIED'});assert.equal(f.provider.reads.length,0);
}));

test('project refs expand to public business files while retaining strict revision and admitted overview hash',()=>fixture(async f=>{
  await f.add('source','docs/requirements.md','Requirements');await f.add('source','docs/rules.md','Rules');await f.add('source','docs/knowledge.md','Project business knowledge');await f.add('source','docs/private.md','PRIVATE');await f.add('source','project.json','PRIVATE METADATA');await f.add('source','imports/internal.md','PRIVATE IMPORTS');
  f.records['p-source'].workbench.files.push({id:'f-private',path:'docs/private.md',private:true});const reference={type:'project',projectId:'p-target',referencedProjectId:'p-source',resourceId:'project:p-source',sourceVersion:3},task=await f.taskFor(reference);
  const read=await f.call('reference.read',{reference,path:'docs/knowledge.md'},{task});assert.equal(read.text,'Project business knowledge');assert.equal(read.readonly,true);assert.deepEqual((await f.call('reference.list',{reference,path:'docs'},{task})).entries.map(e=>e.name),['knowledge.md','requirements.md','rules.md']);
  for(const path of ['docs/private.md','project.json','imports/internal.md'])await assert.rejects(f.call('reference.read',{reference,path},{task}),{code:'SCOPE_DENIED'});
  await assert.rejects(f.call('reference.read',{reference:{...reference,sourceVersion:0},path:'docs/knowledge.md'}),{code:'REFERENCE_VERSION_CONFLICT'});
  await assert.rejects(f.call('reference.read',{reference,path:'docs/knowledge.md'},{task:{...task,refs:[{...task.refs[0],contentHash:null}]}}),{code:'REFERENCE_VERSION_CONFLICT'});
  f.provider.afterRead=async target=>{if(target.path.endsWith('/docs/knowledge.md')){f.records['p-source'].revision=4;f.provider.afterRead=null;}};await assert.rejects(f.call('reference.read',{reference,path:'docs/knowledge.md'},{task}),{code:'REFERENCE_VERSION_CONFLICT'});f.records['p-source'].revision=3;
  await f.add('source','docs/requirements.md','External changed requirements');await assert.rejects(f.call('reference.read',{reference,path:'docs/knowledge.md'},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
  f.records['p-source'].revision=4;await assert.rejects(f.call('reference.list',{reference},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
}));

test('AI resolves, serializes and restores directory task refs for real context reads without write authority',()=>fixture(async f=>{
  await f.add('knowledge','guide.md','Restored actual directory knowledge');const reference=await f.select(),ai=f.owner.aiWorkbench=new AIWorkbench(f.owner),resolved=await ai.resolveReference('p-target',reference,{user:true,policy:f.policy});assert.equal(resolved.kind,'directory');assert.equal(resolved.reference.rootPath,reference.rootPath);assert.equal(resolved.invalid,false);
  const task=JSON.parse(JSON.stringify({id:'t-restored',projectId:'p-target',scope:'read',refs:[resolved],pageIds:[],designIds:[],nodeIds:[],writablePaths:[],sourceWrite:null})),fresh=f.owner.aiWorkbench=new AIWorkbench(f.owner),restored=await fresh.restoreTask(f.agent,task,{policy:f.policy});assert.equal(restored.references.invalid,false);
  const list=await fresh.readContext({resourceId:reference.resourceId,mode:'list'},{task:restored.task,policy:f.policy});assert.equal(list.entries[0].path,'guide.md');const read=await fresh.readContext({resourceId:reference.resourceId,path:'guide.md'},{task:restored.task,policy:f.policy});assert.equal(read.text,'Restored actual directory knowledge');
  assert.equal((await f.call('reference.read',{reference,path:'guide.md'},{agent:f.agent})).readonly,true);
  for(const action of ['file.write','file.create','file.copy'])assert.throws(()=>assertAction({action,projectId:'p-target',resourceId:reference.resourceId,path:'guide.md'},{task:restored.task,policy:f.policy}),{code:'SCOPE_DENIED'});
  await assert.rejects(fresh.readContext({resourceId:'directory:invented',path:'guide.md'},{task:restored.task,policy:f.policy}),{code:'REFERENCE_NOT_FOUND'});
}));

test('file mutations during bounded reads and root alias replacement invalidate references',()=>fixture(async f=>{
  const file=await f.add('knowledge','guide.md','Before'),reference=await f.select(),task=await f.taskFor(reference);f.provider.afterRead=async()=>{f.provider.afterRead=null;await fs.writeFile(file,'Changed during read');};await assert.rejects(f.call('reference.read',{reference,path:'guide.md'},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
  const moved=path.join(f.root,'moved');assert.equal(await fs.realpath(f.locations.knowledge),path.join(f.root,'knowledge'));assert.equal(path.dirname(moved),f.root);await fs.rename(f.locations.knowledge,moved);await fs.symlink(f.locations.other,f.locations.knowledge);await assert.rejects(f.call('reference.resolve',{reference},{task}),{code:'REFERENCE_VERSION_CONFLICT'});
}));
