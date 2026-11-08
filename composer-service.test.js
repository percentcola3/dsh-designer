import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ComposerService} from './composer-service.js';
import {DesignerService} from './index.js';

class MemoryFS {
  files=new Map();serial=0;writes=[];alias=null;
  async resolve(value,{cwd='/workspace'}={}){const key=path.resolve(cwd,value);return {key:this.alias&&key.startsWith('/workspace/DesignerLibrary')?key.replace('/workspace/DesignerLibrary',this.alias):key};}
  processPath(target){return target.key;}
  contains(root,target){return target.key===root.key||target.key.startsWith(root.key+'/');}
  async stat(target){const f=this.files.get(target.key);return f?{type:'file',size:f.bytes.length,version:f.version}:undefined;}
  async readBytes(target,signal){signal?.throwIfAborted();const f=this.files.get(target.key);if(!f)throw Object.assign(Error('Missing'),{code:'FS_NOT_FOUND'});return Buffer.from(f.bytes);}
  async readText(target,signal){return (await this.readBytes(target,signal)).toString();}
  async listDir(target){const entries=new Map();for(const key of this.files.keys())if(key.startsWith(target.key+'/')){const tail=key.slice(target.key.length+1),name=tail.split('/')[0];entries.set(name,{name,type:tail.includes('/')?'directory':'file'});}return [...entries.values()];}
  async writeText(target,value,expected,signal,policy){signal?.throwIfAborted();if(!policy||policy.mode==='read-only'||policy.mode==='workspace-write'&&![policy.workspaceRoot,...(policy.additionalWritableRoots||[])].some(root=>root&&this.contains({key:root},target)))throw Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'});const old=this.files.get(target.key);if(expected.kind==='createIfAbsent'&&old||expected.kind==='replaceIfVersion'&&old?.version!==expected.version)throw Object.assign(Error('Stale'),{code:'FS_STALE_VERSION'});const version=String(++this.serial);this.files.set(target.key,{bytes:Buffer.from(value),version});this.writes.push({target,policy});return {version};}
}
function fixture(){
  const fs=new MemoryFS(),agents=new Map(),modes=new Map(),creates=[],effects=[],restores=[],resolves=[];
  const policy={mode:'workspace-write',workspaceRoot:'/workspace'},selection={provider:'stub',model:'never-called'};
  const ctx={fs,connection:{},sandboxPolicy:{workspaceRoot:'/workspace',resolve:({session}={})=>({...policy,...(session?{mode:modes.get(session.id)||'read-only',workspaceRoot:session.header.cwd}:{})})},agentDefaultModel:{currentSelection:()=>selection},tools:{schemas:()=>[{name:'shell'},{name:'designer_manage'}]},effect(start){const off=start();effects.push(off);return off;},
    agents:{get:id=>agents.get(id),list:()=>[...agents.values()],async create(options){creates.push(options);options.signal?.throwIfAborted();const events=[],scoped=new Map(),guards=[],restrictions=[],session={id:options.sessionId,header:{cwd:options.meta.cwd},snapshotEvents:()=>events.slice(),append(type,data){events.push({type,data});if(type==='sandbox/mode')modes.set(options.sessionId,data.mode);}},agent={id:options.sessionId,session,scoped,guards,restrictions,events,ctx:{tools:{register(def){scoped.set(def.name,def);return()=>scoped.delete(def.name);},guard(fn){guards.push(fn);return()=>{};},restrict(input){restrictions.push(input);return()=>{};}},systemPrompt:{section:()=>()=>{}},effect(start){effects.push(start());}}};agents.set(agent.id,agent);await options.setup?.(agent.ctx,agent);return {agent,dispose:()=>agents.delete(agent.id)};}},
    sessionController:{async resolveAgent(id){resolves.push(id);return agents.has(id)?{agent:agents.get(id)}:{error:Object.assign(Error('No session'),{code:'session/not-found'})};},prompt(){throw Error('Composer must never prompt a model');}},
  };
  const owner=new DesignerService(ctx,{workspaceRoot:'/workspace'});owner.designerPreset='minimal';owner.restoreAgent=async(agent,p)=>{restores.push({agent,p});};const composer=new ComposerService(owner);owner.composer=composer;
  return {owner,composer,ctx,fs,agents,modes,creates,effects,restores,resolves,policy,selection,env:{user:true,policy},async project(){return owner.store.projectCreate({name:'Existing project'},undefined,policy);}};
}

test('homepage prepare creates an ordinary real native session with controlled physical cwd, preset and selection only',async()=>{
  const f=fixture(),before=f.fs.writes.length;f.fs.alias='/physical/library';
  f.owner.store.projectCreate=()=>{throw Error('Composer may not create projects');};
  await assert.rejects(f.composer.prepare({sessionId:'foreign'},f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});
  const value=await f.composer.prepare({cwd:'/foreign',agentPreset:'foreign'},f.env);
  assert.match(value.sessionId,/^designer-compose-[0-9a-f-]{36}$/);assert.deepEqual(Object.keys(value),['sessionId']);
  assert.equal(f.creates.length,1);const request=f.creates[0];assert.deepEqual(request.meta,{cwd:'/physical/library',agentPreset:'minimal'});assert.equal(request.agentOptions,f.selection);
  const resolved=await f.composer.resolve(value.sessionId,f.env);assert.equal(resolved.agent,f.agents.get(value.sessionId));assert.deepEqual(resolved.agent.events,[{type:'sandbox/mode',data:{mode:'workspace-write'}}]);
  assert.equal(resolved.agent.scoped.size,0);assert.equal(resolved.agent.guards.length,0);assert.equal(f.owner.bindings.size,0);assert.equal(f.fs.writes.length,before);assert.equal(f.restores.length,0);
  f.modes.set(value.sessionId,'read-only');assert.deepEqual(await f.composer.prepare({sessionId:value.sessionId},f.env),value);assert.equal(f.creates.length,1);assert.equal(f.modes.get(value.sessionId),'read-only');
});

test('new sessions inherit exactly the initiating policy mode and Full is narrowed; abort and owner checks fail before creation',async()=>{
  const f=fixture();for(const [mode,expected]of [['read-only','read-only'],['workspace-write','workspace-write'],['danger-full-access','workspace-write']]){const policy={mode,workspaceRoot:'/other',additionalWritableRoots:['/extra']},before=structuredClone(policy),prepared=await f.composer.prepare({}, {...f.env,policy});assert.deepEqual(policy,before);assert.deepEqual(f.agents.get(prepared.sessionId).events,[{type:'sandbox/mode',data:{mode:expected}}]);}
  const count=f.creates.length;for(const env of [{},{user:1},{user:true,agent:{id:'model'}}]){await assert.rejects(f.composer.prepare({},env),{code:'USER_ONLY'});await assert.rejects(f.composer.adopt({projectId:'p-x',sessionId:'foreign'},env),{code:'USER_ONLY'});await assert.rejects(f.composer.resolve('foreign',env),{code:'USER_ONLY'});}
  await assert.rejects(f.composer.prepare({}, {...f.env,signal:AbortSignal.abort()}),{name:'AbortError'});assert.equal(f.creates.length,count);
});

test('project prepare uses the existing projectAgent readonly path, avoids metadata binding, and never raises an existing mode',async()=>{
  const f=fixture(),p=await f.project(),before=f.fs.writes.length;
  const original=f.owner.projectAgent.bind(f.owner),calls=[];f.owner.projectAgent=async(...args)=>{calls.push(args);return original(...args);};
  const first=await f.composer.prepare({projectId:p.id},{...f.env,policy:{mode:'read-only',workspaceRoot:'/elsewhere'}});
  assert.deepEqual(first,{sessionId:'designer-'+p.id,projectId:p.id,projectRevision:p.revision});assert.deepEqual(calls[0][3],{readonly:true});assert.equal(calls[0][0].aiSessionId,first.sessionId);
  const existing=f.agents.get(first.sessionId);assert.equal(f.modes.get(first.sessionId),'read-only');const second=await f.composer.prepare({projectId:p.id},{...f.env,policy:{mode:'danger-full-access'}});
  assert.equal(second.sessionId,first.sessionId);assert.equal(f.creates.length,1);assert.equal(f.agents.get(second.sessionId),existing);assert.equal(f.modes.get(second.sessionId),'read-only');assert.equal(f.fs.writes.length,before);assert.equal((await f.owner.workbench.project(p.id)).aiSessionId,null);
  await assert.rejects(f.composer.resolve(first.sessionId,f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});
});

test('resolve admits only its own prepared identity and invalidates records when the canonical root or library identity changes',async()=>{
  const f=fixture(),value=await f.composer.prepare({},f.env);f.ctx.agents.get=()=>{throw Error('resolve must use the Native controller');};
  await assert.rejects(f.composer.resolve('main-session',f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});assert.deepEqual(f.resolves,[]);assert.equal((await f.composer.resolve(value.sessionId,f.env)).agent.id,value.sessionId);assert.deepEqual(f.resolves,[value.sessionId]);
  f.fs.alias='/different/library';await assert.rejects(f.composer.resolve(value.sessionId,f.env),{code:'COMPOSER_ROOT_CHANGED'});f.fs.alias=null;
  const original=f.owner.store;f.owner.store=Object.assign(Object.create(Object.getPrototypeOf(original)),original);await assert.rejects(f.composer.resolve(value.sessionId,f.env),{code:'COMPOSER_ROOT_CHANGED'});f.owner.store=original;
  original.root='/workspace/other-library';await assert.rejects(f.composer.resolve(value.sessionId,f.env),{code:'COMPOSER_ROOT_CHANGED'});
});

test('adopt persists the same native session, installs only existing scoped tools, and retry is idempotent including after service restart',async()=>{
  const f=fixture(),p=await f.project(),prepared=await f.composer.prepare({},f.env),agent=(await f.composer.resolve(prepared.sessionId,f.env)).agent,cwd=agent.session.header.cwd;
  const result=await f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env);
  assert.equal(result.project.aiSessionId,prepared.sessionId);assert.equal(result.projectRevision,p.revision+1);assert.equal(f.owner.bindings.get(prepared.sessionId),p.id);assert.equal(agent.session.header.cwd,cwd);assert.equal(f.creates.length,1);
  assert.deepEqual([...agent.scoped.keys()],['designer_project','designer_commit_html','designer_workbench']);assert.ok(agent.guards[0]({name:'shell'}));assert.ok(agent.restrictions[0].deny.includes('shell'));assert.equal(agent.events.length,1);assert.equal(f.restores.at(-1).p.aiSessionId,prepared.sessionId);
  const before=f.fs.writes.length,retry=await f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env);assert.equal(retry.projectRevision,result.projectRevision);assert.equal(retry.sessionId,result.sessionId);assert.equal(retry.project.aiSessionId,result.project.aiSessionId);assert.equal(f.fs.writes.length,before);
  assert.equal((await f.composer.resolve(prepared.sessionId,f.env)).agent,agent);f.composer.dispose();f.owner.composer=new ComposerService(f.owner);
  assert.deepEqual(await f.owner.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env),retry);assert.equal(f.fs.writes.length,before);assert.equal(f.creates.length,1);
  await assert.rejects(f.owner.composer.resolve(prepared.sessionId,f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});
  await assert.rejects(agent.scoped.get('designer_workbench').execute({action:'file.create',options:{projectId:p.id,path:'outside.txt',content:'outside',expectedRevision:result.projectRevision,expectedVersion:null}},{agent,signal:new AbortController().signal}),{code:'TASK_REQUIRED'});
  assert.equal(f.fs.writes.length,before);
});

test('adopt refuses foreign sessions, stale revisions, replacement bindings and reuse in another project',async()=>{
  const f=fixture(),p=await f.project(),other=await f.project(),prepared=await f.composer.prepare({},f.env),before=f.fs.writes.length;
  await assert.rejects(f.composer.adopt({projectId:p.id,sessionId:'main-session',expectedRevision:p.revision},f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});
  await assert.rejects(f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision-1},f.env),{code:'VERSION_CONFLICT'});assert.equal(f.fs.writes.length,before);assert.equal(f.restores.length,0);
  await f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env);
  await assert.rejects(f.composer.adopt({projectId:other.id,sessionId:prepared.sessionId,expectedRevision:other.revision},f.env),{code:'SESSION_CONFLICT'});
  const second=await f.composer.prepare({},f.env);await assert.rejects(f.composer.adopt({projectId:p.id,sessionId:second.sessionId,expectedRevision:p.revision+1},f.env),{code:'SESSION_CONFLICT'});
  const restarted=new ComposerService(f.owner);await assert.rejects(restarted.adopt({projectId:other.id,sessionId:prepared.sessionId,expectedRevision:other.revision},f.env),{code:'COMPOSER_SESSION_NOT_FOUND'});
});

test('concurrent adoption cannot attach a composer to two projects; root changes and read-only policy cannot produce a binding',async()=>{
  const f=fixture(),a=await f.project(),b=await f.project(),prepared=await f.composer.prepare({},f.env);
  const values=await Promise.allSettled([a,b].map(p=>f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env)));
  assert.equal(values.filter(value=>value.status==='fulfilled').length,1);assert.equal(values.find(value=>value.status==='rejected').reason.code,'SESSION_CONFLICT');assert.equal((await f.owner.workbench.project(b.id)).aiSessionId,null);
  const second=await f.composer.prepare({},f.env),before=f.fs.writes.length;
  await assert.rejects(f.composer.adopt({projectId:b.id,sessionId:second.sessionId,expectedRevision:b.revision},{...f.env,policy:{mode:'read-only',workspaceRoot:'/workspace'}}),{code:'FS_SANDBOX_DENIED'});assert.equal(f.fs.writes.length,before);
  f.fs.alias='/different/library';await assert.rejects(f.composer.adopt({projectId:b.id,sessionId:second.sessionId,expectedRevision:b.revision},f.env));assert.equal(f.fs.writes.length,before);
  f.composer.dispose();await assert.rejects(f.composer.resolve(second.sessionId,f.env),{code:'SERVICE_DISPOSED'});await assert.rejects(f.composer.prepare({},f.env),{code:'SERVICE_DISPOSED'});
});

test('shared-library owner is prepared at the canonical root before manual creation and shared writes',async()=>{
  const f=fixture();f.fs.alias='/physical/library';
  await assert.rejects(f.owner.execute({action:'system.create',name:'unprepared'},{user:true}),{code:'FS_SANDBOX_DENIED'});
  const prepared=await f.owner.execute({action:'composer.prepare',scope:'library'},{user:true});
  assert.equal(prepared.scope,'library');assert.equal(f.agents.get(prepared.sessionId).session.header.cwd,'/physical/library');
  const result=await f.owner.execute({action:'project.create',name:'manual',contextSessionId:prepared.sessionId},{user:true}),p=result.project||result;
  assert.ok(p.id);assert.ok(f.fs.writes.every(write=>write.policy.mode==='workspace-write'));
  const system=await f.owner.execute({action:'system.create',name:'shared',contextSessionId:prepared.sessionId},{user:true});assert.ok(system.system?.id||system.id);
  await assert.rejects(f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env),{code:'SESSION_CONFLICT'});
  const same=await f.owner.execute({action:'composer.prepare',scope:'library'},{user:true});assert.equal(same.sessionId,prepared.sessionId);
});
test('library authority observes initiating and native mode revocation on every call including uploads',async()=>{
  const f=fixture(),source=await f.ctx.agents.create({sessionId:'owner-chat',meta:{cwd:'/unrelated'},setup:(_ctx,agent)=>agent.session.append('sandbox/mode',{mode:'workspace-write'})});
  const prepared=await f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:source.agent.id},{user:true});
  const request={action:'system.create',name:'shared',contextSessionId:prepared.sessionId};await f.owner.execute(request,{user:true});
  const before=f.fs.writes.length;f.modes.set(source.agent.id,'read-only');
  await assert.rejects(f.owner.execute(request,{user:true}),{code:'FS_SANDBOX_DENIED'});assert.equal(f.fs.writes.length,before);
  assert.equal((await f.owner.resolveUploadPolicy(prepared.sessionId)).mode,'read-only');
  const same=await f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:source.agent.id},{user:true});assert.equal(same.sessionId,prepared.sessionId);
  f.modes.set(source.agent.id,'workspace-write');f.modes.set(prepared.sessionId,'read-only');await assert.rejects(f.owner.execute(request,{user:true}),{code:'FS_SANDBOX_DENIED'});
});
test('source readonly revocation also blocks model tools using the existing library Session',async()=>{
  const f=fixture(),source=await f.ctx.agents.create({sessionId:'owner-model-source',meta:{cwd:'/unrelated'},setup:(_ctx,agent)=>agent.session.append('sandbox/mode',{mode:'workspace-write'})});
  const prepared=await f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:source.agent.id},{user:true}),library=f.agents.get(prepared.sessionId);
  const tool=f.owner.manageTool(),exec={agent:library,signal:new AbortController().signal};
  assert.ok((await tool.execute({action:'group.create',name:'Allowed before revocation'},exec)).id);
  const writes=f.fs.writes.length,creates=f.creates.length,events=library.events.length;
  f.modes.set(source.agent.id,'read-only');
  await assert.rejects(tool.execute({action:'group.create',name:'Denied after source revocation'},exec),{code:'FS_SANDBOX_DENIED'});
  await assert.rejects(f.owner.execute({action:'group.create',name:'Owner path',contextSessionId:library.id},{user:true}),{code:'FS_SANDBOX_DENIED'});
  assert.equal((await f.owner.resolveUploadPolicy(library.id)).mode,'read-only');
  assert.equal(f.fs.writes.length,writes);assert.equal(f.creates.length,creates);assert.equal(library.events.length,events);assert.equal(f.modes.get(library.id),'workspace-write');
});

test('a lost library source record fails closed after composer recreation for owner, model and uploads',async()=>{
  const f=fixture(),source=await f.ctx.agents.create({sessionId:'owner-restart-source',meta:{cwd:'/unrelated'},setup:(_ctx,agent)=>agent.session.append('sandbox/mode',{mode:'workspace-write'})});
  const prepared=await f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:source.agent.id},{user:true}),library=f.agents.get(prepared.sessionId);
  await f.owner.execute({action:'group.create',name:'Before restart',contextSessionId:library.id},{user:true});
  f.modes.set(source.agent.id,'read-only');f.composer.dispose();f.owner.composer=new ComposerService(f.owner);
  const writes=f.fs.writes.length,creates=f.creates.length;
  await assert.rejects(f.owner.execute({action:'group.create',name:'Old owner context',contextSessionId:library.id},{user:true}),{code:'COMPOSER_SESSION_NOT_FOUND'});
  await assert.rejects(f.owner.manageTool().execute({action:'group.create',name:'Old model context'},{agent:library,signal:new AbortController().signal}),{code:'COMPOSER_SESSION_NOT_FOUND'});
  await assert.rejects(f.owner.resolveUploadPolicy(library.id),{code:'COMPOSER_SESSION_NOT_FOUND'});
  assert.equal(f.fs.writes.length,writes);assert.equal(f.creates.length,creates);assert.equal(f.modes.get(library.id),'workspace-write');assert.equal(f.modes.get(source.agent.id),'read-only');
  // Explicit new preparation still inherits the source's current readonly mode.
  const next=await f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:source.agent.id},{user:true});
  assert.notEqual(next.sessionId,library.id);assert.equal(f.modes.get(next.sessionId),'read-only');
  await assert.rejects(f.owner.execute({action:'group.create',name:'Still readonly',contextSessionId:next.sessionId},{user:true}),{code:'FS_SANDBOX_DENIED'});
  assert.equal(f.fs.writes.length,writes);
});

test('an unknown writable native library identity cannot fall back to its cwd policy',async()=>{
  const f=fixture(),{agent}=await f.ctx.agents.create({sessionId:'designer-library-unregistered',meta:{cwd:f.owner.store.root},setup:(_ctx,agent)=>agent.session.append('sandbox/mode',{mode:'workspace-write'})});
  assert.equal(f.owner.policy(agent).mode,'workspace-write');const before=f.fs.writes.length;
  await assert.rejects(f.owner.execute({action:'group.create',name:'Unregistered',contextSessionId:agent.id},{user:true}),{code:'COMPOSER_SESSION_NOT_FOUND'});
  await assert.rejects(f.owner.resolveUploadPolicy(agent.id),{code:'COMPOSER_SESSION_NOT_FOUND'});
  assert.equal(f.fs.writes.length,before);
});

test('concurrent project composers share exact Native creation before Agent publication',async()=>{
  const f=fixture(),p=await f.project(),nativeCreate=f.ctx.agents.create;let release,entered,attempts=0;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  f.ctx.agents.create=async options=>{attempts++;entered();await gate;return nativeCreate(options);};
  const first=f.composer.prepare({projectId:p.id},f.env),second=f.composer.prepare({projectId:p.id},f.env);
  await started;assert.equal(attempts,1);release();const values=await Promise.all([first,second]);assert.equal(values[0].sessionId,values[1].sessionId);assert.equal(attempts,1);assert.equal(f.creates.length,1);assert.equal((await f.owner.workbench.project(p.id)).aiSessionId,null);
});

test('persisted project composer reuses the exact Native Session after writer publication without resetting its mode',async()=>{
  const f=fixture(),p=await f.project(),prepared=await f.composer.prepare({},f.env);
  await f.composer.adopt({projectId:p.id,sessionId:prepared.sessionId,expectedRevision:p.revision},f.env);
  const expected=f.agents.get(prepared.sessionId);f.modes.set(expected.id,'read-only');f.composer.dispose();f.owner.composer=new ComposerService(f.owner);f.owner.sessionAgents.retryDelays=[0,0];
  let calls=0;f.ctx.sessionController.resolveAgent=async id=>{assert.equal(id,expected.id);return ++calls===1?{error:{code:'session/writer-held',details:{sessionId:id}}}:{agent:expected};};
  const before=f.fs.writes.length,creates=f.creates.length;
  const values=await Promise.all([1,2].map(()=>f.owner.composer.prepare({projectId:p.id},f.env)));
  assert.ok(values.every(value=>value.sessionId===expected.id));assert.equal(calls,2);assert.equal(f.creates.length,creates);assert.equal(f.fs.writes.length,before);assert.equal(f.modes.get(expected.id),'read-only');
});

test('prepared composer resolves its current exact Agent instead of returning a stale cached object',async()=>{
  const f=fixture(),prepared=await f.composer.prepare({},f.env),old=f.agents.get(prepared.sessionId),current={...old,session:{...old.session}};
  f.agents.set(prepared.sessionId,current);assert.equal((await f.composer.resolve(prepared.sessionId,f.env)).agent,current);assert.notEqual(current,old);assert.equal(f.creates.length,1);
  f.agents.delete(prepared.sessionId);await assert.rejects(f.composer.resolve(prepared.sessionId,f.env),{code:'session/not-found'});assert.equal(f.creates.length,1);
});

test('library preparation is owner-only, rejects project sources, and invalidates changed roots',async()=>{
  const f=fixture(),p=await f.project(),project=await f.composer.prepare({projectId:p.id},f.env);
  await assert.rejects(f.owner.execute({action:'composer.prepare',scope:'library',contextSessionId:project.sessionId},{user:true}),{code:'PROJECT_SCOPE'});
  await assert.rejects(f.composer.prepare({scope:'library'},{}),{code:'USER_ONLY'});
  await assert.rejects(f.composer.prepare({scope:'library',projectId:p.id},f.env),{code:'INVALID_INPUT'});
  const prepared=await f.composer.prepare({scope:'library'},f.env);f.fs.alias='/changed/library';
  await assert.rejects(f.composer.libraryPolicy(f.agents.get(prepared.sessionId)),{code:'COMPOSER_ROOT_CHANGED'});
});
