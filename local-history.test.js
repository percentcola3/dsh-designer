import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {DesignerStore} from './store.js';
import {LocalHistory} from './local-history.js';

const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
function fixture(){
  const files=new Map(),calls=[];let counter=0;
  const fs={
    async resolve(filename){return {targetKey:path.resolve(filename)};},processPath:t=>t.targetKey,
    contains:(a,b)=>b.targetKey===a.targetKey||b.targetKey.startsWith(a.targetKey+'/'),
    async stat(t){const f=files.get(t.targetKey);return f?{type:'file',size:f.bytes.length,version:f.version}:[...files.keys()].some(k=>k.startsWith(t.targetKey+'/'))?{type:'directory'}:undefined;},
    async readText(t){return files.get(t.targetKey).bytes.toString();},
    async readBytes(t){return Buffer.from(files.get(t.targetKey).bytes);},
    async writeText(t,text,intent,signal,p){signal?.throwIfAborted();assert.ok(p);if(p.mode==='read-only')throw Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'});const before=files.get(t.targetKey);if(intent.kind==='createIfAbsent'?before:before?.version!==intent.version)throw Object.assign(Error('Stale'),{code:'FS_STALE_VERSION'});const version=String(++counter);files.set(t.targetKey,{bytes:Buffer.from(text),version});return {version};}
  };
  const store=new DesignerStore({fs,workspaceRoot:'/workspace',policy:()=>policy}),owner={store,ctx:{fs}},history=new LocalHistory(owner);
  history.engine.run=async(op,input,env)=>{calls.push({op,input,env});return {initialized:true,head:'a'.repeat(40),branch:'dsh-history',created:true};};
  store.onPublish=(p,options)=>history.checkpoint(p,options);
  return {files,fs,store,history,calls};
}

test('create, rename and saved revisions checkpoint through the shared store publication path',async()=>{
  const f=fixture(),p=await f.store.projectCreate({name:'One'});
  assert.equal(f.calls.length,1);assert.equal(f.history.status(p.id).revision,1);
  const next=await f.store.projectUpdate({projectId:p.id,expectedRevision:1,name:'Two'});
  assert.equal(f.calls.length,2);assert.equal(f.history.status(p.id).revision,next.revision);
  const file=f.calls[1].input.files.find(f=>f.path==='project.json');assert.equal(JSON.parse(Buffer.from(file.bytesBase64,'base64')).name,'Two');
  await assert.rejects(f.store.projectUpdate({projectId:p.id,expectedRevision:1,name:'Stale'}),{code:'VERSION_CONFLICT'});assert.equal(f.calls.length,2);
});

test('checkpoint excludes machine state, external sources, private files and records deletions',async()=>{
  const f=fixture(),p=await f.store.projectCreate({name:'Files'}),root=`${f.store.root}/projects/${p.id}`;
  const write=async(name,value)=>f.fs.writeText(await f.fs.resolve(root+'/'+name),value,{kind:'createIfAbsent'},undefined,policy);
  await write('docs/requirements.md','Saved requirements');await write('.workbench/draft.json','Private draft');await write('.env','Secret');
  const next=await f.store.mutate(p.id,1,'Save files',p=>{p.workbench={files:[{path:'docs/requirements.md'},{path:'.workbench/draft.json'},{path:'.env'},{path:'/outside/source.js',sourceId:'s-code'},{path:'private.txt',private:true}]};},undefined,policy);
  assert.deepEqual(f.calls.at(-1).input.files.map(f=>f.path).sort(),['docs/requirements.md','project.json']);
  await f.store.mutate(p.id,next.revision,'Remove file',p=>{p.workbench.files[0].removedAt='now';},undefined,policy);
  assert.deepEqual(f.calls.at(-1).input.files.map(f=>f.path),['project.json']);
});

test('checkpoint failure preserves successful save and exposes a retryable receipt',async()=>{
  const f=fixture();f.history.engine.run=async()=>{throw Object.assign(Error('Unavailable'),{code:'GIT_PROCESS_FAILED'});};
  const p=await f.store.projectCreate({name:'Saved'});assert.equal((await f.store.projectGet(p.id)).project.name,'Saved');assert.equal(f.history.status(p.id).state,'failed');
  f.history.engine.run=async()=>({initialized:true,head:'a'.repeat(40)});assert.equal((await f.history.checkpoint(p,{policy})).state,'saved');
  const before=f.calls.length;assert.equal((await f.history.checkpoint(p,{policy:{...policy,mode:'read-only'}})).state,'unavailable');assert.equal(f.calls.length,before);
});

test('new projects can defer history until their final save location is registered',async()=>{
  const f=fixture();await f.store.projectCreate({name:'Destination'},undefined,policy,{deferHistory:true});assert.equal(f.calls.length,0);
});
