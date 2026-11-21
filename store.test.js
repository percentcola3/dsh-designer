import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DesignerStore } from './store.js';
import { DesignerService, handleDesignerRequest } from './index.js';
import {normalizeDocument} from './document-model.js';
import {admittedTaskRecords,TASK_CONTEXT_NAME,ADMITTED_TASK_MARKER} from './ai-adapter.js';

// In-memory implementation of the inspected Fs contract, including canonical
// identities, atomic publication, stale guards and explicit policy enforcement.
class MemoryFS {
  files = new Map(); counter = 0; writes = []; aliases = new Map();
  async resolve(value,{cwd = '/workspace'} = {}) {
    let full = path.resolve(cwd,value);
    for (const [from,to] of this.aliases) if (full === from || full.startsWith(from + '/')) full = to + full.slice(from.length);
    return {targetKey:full,displayPath:full};
  }
  processPath(target) {return target.displayPath;}
  contains(parent,child) {return child.targetKey === parent.targetKey || child.targetKey.startsWith(parent.targetKey + '/');}
  async stat(target) {
    const file = this.files.get(target.targetKey);
    if (file) return {type:'file',version:file.version,size:Buffer.byteLength(file.content)};
    if (target.targetKey === '/workspace' || [...this.files.keys()].some(p => p.startsWith(target.targetKey + '/'))) return {type:'directory',version:'directory'};
    return undefined;
  }
  async readText(target,signal) {signal?.throwIfAborted();if (!this.files.has(target.targetKey)) throw Object.assign(new Error('Missing'),{code:'FS_NOT_FOUND'}); return this.files.get(target.targetKey).content;}
  async readBytes(target,signal,maxBytes) {const bytes=Buffer.from(await this.readText(target,signal));if(bytes.length>maxBytes)throw Object.assign(Error('Too large'),{code:'FS_TOO_LARGE'});return bytes;}
  async readByteRange(target,{offset,length},signal) {const bytes=Buffer.from(await this.readText(target,signal));return bytes.subarray(offset,offset+length);}
  async listDir(target) {
    const names = new Map();
    for (const name of this.files.keys()) if (name.startsWith(target.targetKey + '/')) {const remainder = name.slice(target.targetKey.length + 1); const first = remainder.split('/')[0]; names.set(first,{name:first,type:remainder.includes('/') ? 'directory':'file'});}
    return [...names.values()].sort((a,b) => a.name.localeCompare(b.name));
  }
  async writeText(target,content,expected,signal,policy) {
    signal?.throwIfAborted();
    if (!policy || policy.mode === 'read-only' || (policy.mode === 'workspace-write' && !this.contains({targetKey:policy.workspaceRoot},target))) throw Object.assign(new Error('sandbox denied'),{code:'FS_SANDBOX_DENIED'});
    const before = this.files.get(target.targetKey);
    if ((expected.kind === 'createIfAbsent' && before) || (expected.kind === 'replaceIfVersion' && before?.version !== expected.version)) throw Object.assign(new Error('stale'),{code:'FS_STALE_VERSION'});
    const version = String(++this.counter);
    this.files.set(target.targetKey,{content,version}); this.writes.push({path:target.targetKey,expected,policy});
    return {version,operation:before ? 'update':'create',before:before?.content ?? null,after:content};
  }
}
const defaultPolicy = {mode:'workspace-write',workspaceRoot:'/workspace'};
const fixture = () => {const fs = new MemoryFS(); return {fs,store:new DesignerStore({fs,workspaceRoot:'/workspace',policy:() => defaultPolicy})};};
const expectCode = code => error => error.code === code;
const doc = label => `<!doctype html><html><body><main>${label}</main></body></html>`;
async function replaceMetadata(store,fs,relative,content) {
  const target=await store.target(relative),before=await fs.stat(target);
  return fs.writeText(target,content,before?{kind:'replaceIfVersion',version:before.version}:{kind:'createIfAbsent'},undefined,defaultPolicy);
}

function context(fs) {
  const registry = new Map(); const globals = new Map(); const effects = [];
  const inheritedModes = new Map();
  const tools = {schemas:() => [...globals.values()],register(def) {globals.set(def.name,def); return () => globals.delete(def.name);},guard:() => () => {},restrict:() => () => {}};
  const ctx = {
    fs,tools,connection:{requestRejection:()=>undefined,admit:()=>({peer:{principal:{kind:'owner'},signal:new AbortController().signal}})},webServer:{getOrigin:()=> 'http://127.0.0.1:53998',register:()=>()=>{}},fiber:{entry:{id:'designer'}},get:() => undefined,effect(callback) {const dispose = callback(); effects.push(dispose); return dispose;},
    sandboxPolicy:{workspaceRoot:'/workspace',resolve:({session} = {}) => ({...defaultPolicy,...(session ? {mode:inheritedModes.get(session.id) || 'workspace-write',workspaceRoot:session.header.cwd,sessionId:session.id}: {})})},
    agents:{list:() => [...registry.values()],get:id => registry.get(id),async create({sessionId,meta,setup}) {
      const scoped = new Map(); const guards = []; const runtimeContexts = new Map();
      const agent = {id:sessionId,session:{id:sessionId,header:{cwd:meta.cwd},events:[],snapshotEvents(){return this.events.slice();},append(type,data) {this.events.push({seq:this.events.length,time:Date.now(),type,data});if (type === 'sandbox/mode') inheritedModes.set(sessionId,data.mode);}},status:'idle',ctx:{tools:{register(def) {scoped.set(def.name,def); return () => scoped.delete(def.name);},guard(fn) {guards.push(fn); return () => {};},restrict:() => () => {}},systemPrompt:{section:() => () => {},context(contribution){assert.equal(typeof contribution.text,'function');assert.ok(!runtimeContexts.has(contribution.name),'Duplicate native runtime context');runtimeContexts.set(contribution.name,contribution);return()=>runtimeContexts.delete(contribution.name);}},effect(callback) {return callback();}},scoped,guards,runtimeContexts};
      await setup?.(agent.ctx,agent); registry.set(sessionId,agent);return {agent,dispose:async () => {registry.delete(sessionId);}};
    }},
    agentDefaultModel:{currentSelection:() => ({provider:'example',model:'example'})},
    agentPresets:{async compositionInventory() {return [{id:'ptc',rows:[{moduleName:'@deepseek-ai/dsh-tool-executor-ptc',enabled:true}]},{id:'minimal',rows:[]}];}},
    skills:{async list() {return [{name:'design-system',description:'Design guidance',source:'runtime',provider:'test',invocation:{userInvocable:true,modelInvocable:true}}];},async get(name) {return name === 'design-system' ? {name,description:'Design guidance',content:'Use consistent spacing.',invocation:{userInvocable:true,modelInvocable:true}} : undefined;}},
    systemPrompt:{section:() => () => {}},
    sessionController:{async resolveAgent(id) {return registry.has(id) ? {agent:registry.get(id)} : {error:{code:'session/not-found'}};},cancel({sessionId}) {const agent=registry.get(sessionId);if(agent){agent.status='idle';agent.session.append('turn/end',{turn:agent.session.events.findLast(event=>event.type==='turn/start')?.data.turn||1,reason:{kind:'aborted',reason:{kind:'user'}}});}return {accepted:true};},async prompt(request) {ctx.lastPrompt = request;const agent=registry.get(request.sessionId),turn=(agent.session.events.findLast(event=>event.type==='turn/start')?.data.turn||0)+1;agent.session.append('turn/start',{turn});agent.session.append('user/message',{role:'user',content:request.content,source:{kind:'user',rpcId:request.requestId}});const sections=[...agent.runtimeContexts.values()].map(contribution=>({name:contribution.name,text:contribution.text()})).filter(section=>section.text);if(sections.length)agent.session.append('user/message',{role:'user',content:[{type:'text',text:sections.map(section=>section.text).join('\n\n')}],source:{kind:'runtime-context',form:'snapshot',sections}});agent.status = 'running';return {accepted:true};},async state({sessionId}) {return {cursor:registry.get(sessionId)?.session.events.length||0,active:true,running:registry.get(sessionId)?.status === 'running',queue:[],pendingInput:[]};},async events({address}) {return {records:(registry.get(address.sessionId)?.session.snapshotEvents()||[]).map(event=>({type:'event',event})),hasMore:false};}},
    effects
  };
  return ctx;
}

test('empty library is read-only and project metadata has stable Web/Mobile defaults',async () => {
  const {store,fs} = fixture(); assert.deepEqual((await store.state()).projects,[]);assert.equal(fs.writes.length,0);
  const p = await store.projectCreate({name:'移动应用',platform:'mobile'});
  const made = await store.artboardCreate({projectId:p.id,expectedRevision:p.revision,name:'首页',html:doc('Hello')});
  assert.equal(made.artboard.platform,'mobile');assert.deepEqual(made.artboard.viewport,{width:390,height:844});
  assert.equal(made.project.revision,2);assert.equal(made.project.history.length,1);
  assert.equal((await store.artboardGet(p.id,made.artboard.id)).html,doc('Hello'));
  assert.ok(fs.writes.every(w => w.expected && w.policy === defaultPolicy));
  const recovered = new DesignerStore({fs,workspaceRoot:'/workspace',policy:() => defaultPolicy});
  assert.equal((await recovered.state()).projects[0].id,p.id);
});

test('stale project and artboard revisions never replace the committed HTML',async () => {
  const {store} = fixture(); const p = await store.projectCreate({name:'Web'});
  const made = await store.artboardCreate({projectId:p.id,name:'Home',expectedRevision:1,html:doc('old')});
  const next = await store.artboardCommit({projectId:p.id,artboardId:made.artboard.id,expectedRevision:2,expectedArtboardRevision:1,html:doc('new')});
  await assert.rejects(store.artboardCommit({projectId:p.id,artboardId:made.artboard.id,expectedRevision:2,html:doc('stale')}),expectCode('VERSION_CONFLICT'));
  await assert.rejects(store.artboardCommit({projectId:p.id,artboardId:made.artboard.id,expectedRevision:3,expectedArtboardRevision:1,html:doc('stale')}),expectCode('VERSION_CONFLICT'));
  assert.equal((await store.artboardGet(p.id,made.artboard.id)).html,doc('new'));assert.equal(next.artboard.revision,2);
});

test('simultaneous commits use filesystem CAS: exactly one publishes metadata',async () => {
  const {store} = fixture(); const p = await store.projectCreate({name:'Parallel'});
  const a = await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'A',html:doc('basis')});
  const results = await Promise.allSettled(['one','two'].map(label => store.artboardCommit({projectId:p.id,artboardId:a.artboard.id,expectedRevision:2,html:doc(label)})));
  assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(results.filter(r => r.status === 'rejected')[0].reason.code,'VERSION_CONFLICT');
  const current = await store.projectGet(p.id);assert.equal(current.project.revision,3);assert.equal(current.history.length,2);
  assert.ok([doc('one'),doc('two')].includes((await store.artboardGet(p.id,a.artboard.id)).html));
});

test('layout/canvas saves do not add HTML history; restore recovers exact prior markup',async () => {
  const {store} = fixture(); const p = await store.projectCreate({name:'History'});
  const a = await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'A',html:doc('v1')});
  const saved = await store.artboardCommit({projectId:p.id,artboardId:a.artboard.id,expectedRevision:2,html:doc('v2')});
  const moved = await store.artboardLayout({projectId:p.id,artboardId:a.artboard.id,expectedRevision:3,position:{x:200,y:120}});
  assert.equal(moved.project.history.length,2);assert.equal(moved.artboard.htmlPath,saved.artboard.htmlPath);
  const canvas = await store.projectUpdate({projectId:p.id,expectedRevision:4,canvas:{zoom:.5,x:20}});
  assert.equal(canvas.history.length,2);assert.deepEqual(canvas.canvas,{zoom:.5,x:20,y:0});
  const restored = await store.snapshotRestore({projectId:p.id,snapshotId:saved.project.history[0].id,expectedRevision:5});
  assert.equal(restored.revision,6);assert.equal(restored.history.length,3);
  assert.equal((await store.artboardGet(p.id,a.artboard.id)).html,doc('v1'));
  assert.ok(restored.artboards[0].revision > saved.artboard.revision);
});

test('system selection follows current content and exact resource snapshots remain readable',async () => {
  const {store} = fixture(); const system = await store.systemCreate({name:'Brand',platforms:['mobile'],tokens:{color:{accent:'#12f'}}});
  const saved = await store.systemSave({systemId:system.id,expectedRevision:1,tokens:{color:{accent:'#f21'}},guidelines:'Use grid'});
  assert.equal(saved.versions.length,1);assert.equal(saved.versions[0].tokens.color.accent,'#f21');
  assert.equal((await store.systemGet(system.id,undefined,1)).versions[0].tokens.color.accent,'#12f');
  const p = await store.projectCreate({name:'Versioned'});
  const updated = await store.projectUpdate({projectId:p.id,expectedRevision:1,systemId:system.id,systemVersion:1});
  assert.equal(updated.systemVersion,2);
  await assert.rejects(store.systemSave({systemId:system.id,expectedRevision:1,tokens:{}}),expectCode('VERSION_CONFLICT'));
  for(let i=2;i<=101;i++)await store.systemSave({systemId:system.id,expectedRevision:i,tokens:{count:i}});
  assert.equal((await store.systemGet(system.id)).versions.length,1);
});

test('rejects traversal, sibling escapes, symlink aliases and sandbox denials',async () => {
  const {store,fs} = fixture();
  assert.throws(() => new DesignerStore({fs,workspaceRoot:'/workspace',root:'../workspace-evil',policy:() => defaultPolicy}),expectCode('PATH_OUTSIDE_WORKSPACE'));
  await assert.rejects(store.projectGet('../../outside'),expectCode('INVALID_ID'));
  await assert.rejects(store.target('projects/../outside'),expectCode('INVALID_PATH'));
  fs.aliases.set('/workspace/DesignerLibrary','/outside/library');
  await assert.rejects(store.projectCreate({name:'escape'}),expectCode('FS_SANDBOX_DENIED'));assert.equal(fs.writes.length,0);
  fs.aliases.clear();
  await assert.rejects(store.projectCreate({name:'denied'},undefined,{mode:'read-only',workspaceRoot:'/workspace'}),expectCode('FS_SANDBOX_DENIED'));
});

test('external file changes are detected by provider versions even if project revision is unchanged',async () => {
  const {store,fs} = fixture();const p = await store.projectCreate({name:'External'});
  const record = await store.projectRecord(p.id);
  await fs.writeText(record.target,record.content,{kind:'replaceIfVersion',version:record.version},undefined,defaultPolicy);
  await assert.rejects(store.write(`projects/${p.id}/project.json`,record.content,record.version),expectCode('VERSION_CONFLICT'));
});

test('bounded inputs reject invalid geometry and oversized multibyte HTML',async () => {
  const {store} = fixture();const p = await store.projectCreate({name:'Bounds'});
  await assert.rejects(store.projectUpdate({projectId:p.id,expectedRevision:1,canvas:{zoom:0}}),expectCode('INVALID_INPUT'));
  await assert.rejects(store.artboardCreate({projectId:p.id,expectedRevision:1,name:'Huge',html:`<div>${'中'.repeat(700000)}</div>`}),expectCode('TOO_LARGE'));
  assert.equal((await store.projectGet(p.id)).project.revision,1);
});

test('shared business service and scoped commit tool publish the same persistent shape',async () => {
  const {fs} = fixture(); const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});await service.initialize();
  const p = await service.execute({action:'project.create',name:'AI project'});
  const accepted = await service.execute({action:'ai.run',projectId:p.id,prompt:'Design a landing page'});
  assert.equal(accepted.accepted,true);const agent = ctx.agents.get(accepted.sessionId);for(const tool of ['designer_project','designer_commit_html','designer_workbench'])assert.ok(agent.scoped.has(tool));
  for(const name of ['read','write','bash','shell'])assert.equal(agent.guards[0]({name}).includes('designer'),true);
  for(const name of ['designer_project','designer_commit_html','designer_workbench'])assert.equal(agent.guards[0]({name}),undefined);
  const project = (await service.execute({action:'project.get',projectId:p.id})).project;
  const previousHtml=(await service.execute({action:'artboard.get',projectId:p.id,artboardId:project.artboards[0].id})).html;
  const result = await agent.scoped.get('designer_commit_html').execute({name:'AI home',html:doc('AI generated'),expectedRevision:project.revision},{signal:new AbortController().signal});
  const loaded = await service.execute({action:'artboard.get',projectId:p.id,artboardId:result.artboard.id});assert.equal(loaded.html,normalizeDocument(doc('AI generated'),{previousHtml}).html);assert.equal(loaded.projectRevision,result.projectRevision);
  const other = await service.execute({action:'project.create',name:'Other'});
  await assert.rejects(service.execute({action:'project.get',projectId:other.id},{agent}),expectCode('PROJECT_SCOPE'));
  await assert.rejects(service.execute({action:'root.set',root:'/workspace/Other'},{agent}),expectCode('PROJECT_SCOPE'));
  service.dispose();assert.equal(agent.scoped.size,0);
});

test('project AI contexts are independent, selected skill bodies load on demand, busy runs reject',async () => {
  const {fs} = fixture();const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});
  const p = await service.execute({action:'project.create',name:'First'});const q = await service.execute({action:'project.create',name:'Second'});
  await service.execute({action:'project.update',projectId:p.id,expectedRevision:p.revision,skillNames:['design-system']});
  const skill = await service.execute({action:'skill.get',projectId:p.id,name:'design-system'});assert.equal(skill.content,'Use consistent spacing.');
  const first = await service.execute({action:'ai.run',projectId:p.id,prompt:'Build first'});
  assert.equal(ctx.lastPrompt.content[0].text,'Build first');assert.doesNotMatch(ctx.lastPrompt.content[0].text,/design-system|Frozen workbench task|DSH_WORKBENCH_REQUEST/);
  const firstAgent=ctx.agents.get(first.sessionId),record=admittedTaskRecords(firstAgent).at(-1),nativeContext=firstAgent.runtimeContexts.get(TASK_CONTEXT_NAME);
  assert.equal(nativeContext.required,true);assert.equal(nativeContext.interpolate,false);assert.match(record.contextBody,/Frozen workbench task/);assert.match(record.contextBody,/design-system/);assert.doesNotMatch(record.contextBody,/Use consistent spacing\./);assert.ok(nativeContext.text().includes(ADMITTED_TASK_MARKER));assert.equal(record.requestId,first.requestId);assert.equal(record.record.sessionId,first.sessionId);assert.equal(record.descriptor.id,first.taskId);
  const second = await service.execute({action:'ai.run',projectId:q.id,prompt:'Build second'});assert.notEqual(first.sessionId,second.sessionId);
  await assert.rejects(service.execute({action:'ai.run',projectId:p.id,prompt:'Again'}),expectCode('AI_BUSY'));
  const status=await service.execute({action:'ai.status',projectId:q.id});assert.equal(status.sessionId,second.sessionId);assert.equal(status.running,true);assert.deepEqual(status.messages.map(({role,text})=>({role,text})),[{role:'user',text:'Build second'}]);assert.equal(status.messages[0].requestId,second.requestId);assert.ok(!JSON.stringify(status.messages).includes('DSH_WORKBENCH_REQUEST'));
  const currentQ=(await service.execute({action:'project.get',projectId:q.id})).project;await assert.rejects(service.execute({action:'project.update',projectId:q.id,expectedRevision:currentQ.revision,skillNames:['missing']}),expectCode('SKILL_NOT_FOUND'));
});

async function request(service,{method = 'POST',body,query = '',admission,headers = {}} = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req,{method,url:'/api/designer' + query,headers:{'content-type':'application/json',...headers}});
  const res = {writeHead(status,headers) {this.status = status;this.headers = headers;},end(body) {this.body = JSON.parse(body);}};
  await handleDesignerRequest(service,{requestRejection:()=>undefined,admit:() => admission || {peer:{principal:{kind:'owner'},signal:new AbortController().signal}}},req,res);return res;
}

test('HTTP denies untrusted peers before business calls; GET cannot mutate',async () => {
  let count = 0;const service = {async execute(input) {count++;return input;}};
  assert.equal((await request(service,{body:{action:'state'},admission:{rejection:403}})).status,403);assert.equal(count,0);
  assert.equal((await request(service,{method:'GET',query:'?action=project.create&name=oops'})).status,400);assert.equal(count,0);
  assert.equal((await request(service,{body:'{broken'})).status,400);assert.equal(count,0);
  assert.equal((await request(service,{body:{action:'state'},headers:{'content-type':'text/plain'}})).status,400);
  const good = await request(service,{method:'GET'});assert.equal(good.status,200);assert.equal(good.body.value.action,'state');assert.equal(count,1);
});

test('external library roots require full access, and canonical child escapes always reject',async () => {
  const fs = new MemoryFS();const full = {mode:'danger-full-access',workspaceRoot:'/workspace'};
  const outside = new DesignerStore({fs,workspaceRoot:'/workspace',root:'/other/Library',policy:() => full});
  const p = await outside.projectCreate({name:'Outside'});assert.equal((await outside.state()).projects[0].id,p.id);
  await assert.rejects(outside.projectCreate({name:'Denied'},undefined,defaultPolicy),expectCode('FS_SANDBOX_DENIED'));
  await assert.rejects(outside.projectCreate({name:'Read only'},undefined,{mode:'read-only',workspaceRoot:'/workspace'}),expectCode('FS_SANDBOX_DENIED'));
  fs.aliases.set('/other/Library/escape','/private/secret');
  await assert.rejects(outside.target('escape/file'),expectCode('PATH_OUTSIDE_WORKSPACE'));
});

test('HTTP context permissions stay separate from project scope; global tool uses its calling session',async () => {
  const {fs} = fixture();const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});await service.initialize();
  const source = (await ctx.agents.create({sessionId:'source',meta:{cwd:'/workspace'}})).agent;
  source.session.append('sandbox/mode',{mode:'workspace-write'});
  const ui = await request(service,{body:{action:'project.create',name:'UI context',contextSessionId:source.id}});
  assert.equal(ui.status,200);assert.equal(ui.body.value.skillContextSessionId,source.id);
  const global = await service.manageTool().execute({action:'project.create',name:'Agent context'},{agent:source,signal:new AbortController().signal});
  assert.equal(global.skillContextSessionId,source.id);
  source.session.append('sandbox/mode',{mode:'read-only'});
  const denied = await request(service,{body:{action:'project.create',name:'Read only',contextSessionId:source.id}});assert.equal(denied.status,403);
  const generic = await request(service,{body:{action:'state',contextSessionId:null}});assert.equal(generic.status,200);
  source.session.append('sandbox/mode',{mode:'danger-full-access'});
  const start = await service.execute({action:'ai.run',projectId:global.id,prompt:'Build a page',contextSessionId:source.id},{user:true});
  const designer = ctx.agents.get(start.sessionId);assert.deepEqual({type:designer.session.events[0].type,data:designer.session.events[0].data},{type:'sandbox/mode',data:{mode:'workspace-write'}});
  assert.equal(designer.session.header.cwd,`/workspace/DesignerLibrary/projects/${global.id}`);
  const stopped = await service.execute({action:'ai.cancel',projectId:global.id});assert.equal(stopped.accepted,true);assert.equal(designer.status,'idle');
  await assert.rejects(service.manageTool().execute({action:'state'},{signal:new AbortController().signal}),expectCode('AGENT_REQUIRED'));
});

test('skill retrieval preserves the source preset scope and AI status hides internal task payload',async () => {
  const {fs} = fixture();const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});
  const source = (await ctx.agents.create({sessionId:'skill-source',meta:{cwd:'/workspace'}})).agent;
  let seenScope;
  const original = ctx.skills.list;ctx.skills.list = async options => {seenScope = options.scope;return original(options);};
  const p = await service.execute({action:'project.create',name:'Scoped skills'},{permissionAgent:source});
  const listed = await service.execute({action:'skills.list',projectId:p.id});assert.equal(seenScope,source);
  assert.ok(!Array.isArray(listed));assert.deepEqual(listed.skills.map(s=>s.name),['design-system']);
  const run = await service.execute({action:'ai.run',projectId:p.id,prompt:'Create a mobile screen'},{permissionAgent:source});
  const agent=ctx.agents.get(run.sessionId),entry=admittedTaskRecords(agent).at(-1);assert.equal(entry.event.data.content[0].text,'Create a mobile screen');assert.ok(entry.contextBody.includes('Frozen workbench task'));
  ctx.sessionController.events = async () => ({records:[{event:entry.event},{event:entry.contextEvent},{event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'完成页面。'}]}}}}]});
  const status = await service.execute({action:'ai.status',projectId:p.id});assert.equal(status.sessionId,run.sessionId);assert.deepEqual(status.messages.map(({role,text})=>({role,text})),[{role:'user',text:'Create a mobile screen'},{role:'assistant',text:'完成页面。'}]);assert.ok(!JSON.stringify(status.messages).includes('DSH_DESIGNER_ADMITTED_TASK_V1'));
});

test('external HTML modification is detected before read, overwrite and snapshot restore',async () => {
  const {fs,store} = fixture();const p = await store.projectCreate({name:'Integrity'});
  const a = await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'A',html:doc('before')});
  const saved = await store.artboardCommit({projectId:p.id,artboardId:a.artboard.id,expectedRevision:2,html:doc('after')});
  const currentFile = await store.target(`projects/${p.id}/${saved.artboard.htmlPath}`);
  const file = fs.files.get(currentFile.targetKey);fs.files.set(currentFile.targetKey,{...file,content:doc('external edit')});
  await assert.rejects(store.artboardGet(p.id,a.artboard.id),expectCode('VERSION_CONFLICT'));
  await assert.rejects(store.artboardCommit({projectId:p.id,artboardId:a.artboard.id,expectedRevision:3,html:doc('overwrite')}),expectCode('VERSION_CONFLICT'));
  const oldFile = await store.target(`projects/${p.id}/${a.artboard.htmlPath}`);fs.files.get(oldFile.targetKey).content = doc('tampered snapshot basis');
  await assert.rejects(store.snapshotRestore({projectId:p.id,expectedRevision:3,snapshotId:saved.project.history[0].id}),expectCode('VERSION_CONFLICT'));
});

test('group CRUD persists with independent revisions and deletion only normalizes project membership',async () => {
  const {store,fs} = fixture();assert.deepEqual((await store.state()).groups,[]);
  const group = await store.groupCreate({name:'产品设计'});
  assert.equal(group.revision,1);assert.equal(group.deletedAt,null);
  const p = await store.projectCreate({name:'Grouped',groupId:group.id});
  assert.equal(p.groupId,group.id);
  const renamed = await store.groupUpdate({groupId:group.id,expectedRevision:1,name:'新分组'});
  assert.equal(renamed.revision,2);
  await assert.rejects(store.groupUpdate({groupId:group.id,expectedRevision:1,name:'stale'}),expectCode('VERSION_CONFLICT'));
  const raw = await store.projectRecord(p.id);const writesBeforeDelete = fs.writes.length;
  const deleted = await store.groupUpdate({groupId:group.id,expectedRevision:2},undefined,undefined,true);
  assert.ok(deleted.deletedAt);assert.equal(fs.writes.length,writesBeforeDelete + 1);
  const state = await store.state();assert.deepEqual(state.groups,[]);assert.equal(state.projects[0].groupId,null);assert.equal(state.projects[0].revision,1);
  const read = await store.projectGet(p.id);assert.equal(read.project.groupId,null);assert.equal(read.project.revision,1);
  assert.equal(fs.files.get(raw.target.targetKey).content,raw.content);
  await assert.rejects(store.projectCreate({name:'Invalid membership',groupId:group.id}),expectCode('GROUP_DELETED'));
  await assert.rejects(store.projectUpdate({projectId:p.id,expectedRevision:1,groupId:group.id}),expectCode('GROUP_DELETED'));
  const next = await store.groupCreate({name:'Next'});
  const moved = await store.projectUpdate({projectId:p.id,expectedRevision:1,groupId:next.id});assert.equal(moved.groupId,next.id);
  const ungrouped = await store.projectUpdate({projectId:p.id,expectedRevision:2,groupId:null});assert.equal(ungrouped.groupId,null);
  const restoredStore = new DesignerStore({fs,workspaceRoot:'/workspace',policy:() => defaultPolicy});
  assert.deepEqual((await restoredStore.state()).groups.map(g => g.id),[next.id]);
});

test('simultaneous group renames and group paths retain CAS and sandbox protections',async () => {
  const {store} = fixture();const group = await store.groupCreate({name:'Concurrent'});
  const results = await Promise.allSettled(['A','B'].map(name => store.groupUpdate({groupId:group.id,expectedRevision:1,name})));
  assert.equal(results.filter(r => r.status === 'fulfilled').length,1);assert.equal(results.find(r => r.status === 'rejected').reason.code,'VERSION_CONFLICT');
  await assert.rejects(store.groupUpdate({groupId:'../../outside',expectedRevision:1,name:'escape'}),expectCode('INVALID_ID'));
  await assert.rejects(store.groupCreate({name:'Read only'},undefined,{mode:'read-only',workspaceRoot:'/workspace'}),expectCode('FS_SANDBOX_DENIED'));
  await assert.rejects(store.projectCreate({name:'Missing group',groupId:'g-missing'}),expectCode('NOT_FOUND'));
});

test('project recycle bin preserves HTML and history and rejects stale deletes and deleted mutations',async () => {
  const {store,fs} = fixture();const p = await store.projectCreate({name:'Recoverable'});
  const made = await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'Page',html:doc('Keep this')});
  const fileCount = fs.files.size;
  const deleted = await store.projectDelete({projectId:p.id,expectedRevision:2});
  assert.equal(deleted.revision,3);assert.ok(deleted.deletedAt);assert.equal(fs.files.size,fileCount);assert.equal(deleted.history.length,1);
  assert.equal((await store.state()).projects[0].deletedAt,deleted.deletedAt);
  assert.equal((await store.artboardGet(p.id,made.artboard.id)).html,doc('Keep this'));
  await assert.rejects(store.projectDelete({projectId:p.id,expectedRevision:2}),expectCode('VERSION_CONFLICT'));
  await assert.rejects(store.projectUpdate({projectId:p.id,expectedRevision:3,name:'Edited in bin'}),expectCode('PROJECT_DELETED'));
  await assert.rejects(store.artboardCommit({projectId:p.id,artboardId:made.artboard.id,expectedRevision:3,html:doc('overwrite')}),expectCode('PROJECT_DELETED'));
  await assert.rejects(store.snapshotRestore({projectId:p.id,expectedRevision:3,snapshotId:deleted.history[0].id}),expectCode('PROJECT_DELETED'));
  const restored = await store.projectDelete({projectId:p.id,expectedRevision:3},undefined,undefined,true);
  assert.equal(restored.deletedAt,null);assert.equal(restored.revision,4);assert.equal(fs.files.size,fileCount);
  const changed = await store.artboardLayout({projectId:p.id,artboardId:made.artboard.id,expectedRevision:4,position:{x:10}});assert.equal(changed.project.revision,5);
});

test('legacy archived projects can be restored into the visible project library',async()=>{
  const {store,fs}=fixture();const p=await store.projectCreate({name:'Archived in old version'});
  const made=await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'Saved page',html:doc('Retain content')});
  const archived=await store.projectArchive({projectId:p.id,expectedRevision:2});
  const fileCount=fs.files.size;assert.equal(archived.archived,true);assert.equal(archived.deletedAt,null);
  const restored=await store.projectDelete({projectId:p.id,expectedRevision:3},undefined,undefined,true);
  assert.equal(restored.archived,false);assert.equal(restored.deletedAt,null);assert.equal(fs.files.size,fileCount);
  assert.equal((await store.artboardGet(p.id,made.artboard.id)).html,doc('Retain content'));
});

test('legacy project data defaults to ungrouped and active without a migration write',async () => {
  const {store,fs} = fixture();const p = await store.projectCreate({name:'Legacy'});
  const record = await store.projectRecord(p.id);const legacy = JSON.parse(record.content);delete legacy.groupId;delete legacy.deletedAt;
  await fs.writeText(record.target,JSON.stringify(legacy),{kind:'replaceIfVersion',version:record.version},undefined,defaultPolicy);
  const writeCount = fs.writes.length;
  const state = await store.state();const read = await store.projectGet(p.id);
  assert.equal(state.projects[0].groupId,null);assert.equal(state.projects[0].deletedAt,null);assert.equal(read.project.groupId,null);assert.equal(read.project.deletedAt,null);assert.equal(fs.writes.length,writeCount);assert.equal(read.project.revision,1);
});

test('HTTP and global tool expose group and recycle-bin operations with object outputs; AI rejects deletion',async () => {
  const {fs} = fixture();const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});
  const actor = (await ctx.agents.create({sessionId:'manager',meta:{cwd:'/workspace'}})).agent;
  const tool = service.manageTool();
  for (const action of ['group.create','group.update','group.delete','project.delete','project.restore']) assert.ok(tool.parameters.properties.action.enum.includes(action));
  const group = await tool.execute({action:'group.create',name:'Managed'},{agent:actor});assert.equal(typeof group,'object');
  const created = await request(service,{body:{action:'project.create',name:'Managed project',groupId:group.id}});const p = created.body.value;assert.equal(p.groupId,group.id);
  const deleted = await tool.execute({action:'project.delete',projectId:p.id,expectedRevision:p.revision},{agent:actor});assert.ok(deleted.deletedAt);
  const ai = await request(service,{body:{action:'ai.run',projectId:p.id,prompt:'Should reject'}});assert.equal(ai.body.error.code,'PROJECT_DELETED');assert.equal(ctx.agents.list().length,1);
  const restored = await request(service,{body:{action:'project.restore',projectId:p.id,expectedRevision:deleted.revision}});assert.equal(restored.body.value.deletedAt,null);
  const removedGroup = await request(service,{body:{action:'group.delete',groupId:group.id,expectedRevision:1}});assert.ok(removedGroup.body.value.deletedAt);
  const state = await tool.execute({action:'state'},{agent:actor});assert.deepEqual(state.groups,[]);assert.equal(state.projects[0].groupId,null);
  const getMutation = await request(service,{method:'GET',query:'?action=project.delete&projectId=' + p.id});assert.equal(getMutation.body.error.code,'METHOD_NOT_ALLOWED');
});

test('HTTP mutations and tools report the same version conflict without overwriting state',async () => {
  const {fs} = fixture();const ctx = context(fs);const service = new DesignerService(ctx,{workspaceRoot:'/workspace'});
  const created = await request(service,{body:{action:'project.create',name:'HTTP'}});const p = created.body.value;
  const saved = await request(service,{body:{action:'project.update',projectId:p.id,expectedRevision:p.revision,name:'Updated'}});assert.equal(saved.body.value.revision,p.revision+1);
  const conflict = await request(service,{body:{action:'project.update',projectId:p.id,expectedRevision:p.revision,name:'stale'}});assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'VERSION_CONFLICT');
  assert.equal((await service.execute({action:'project.get',projectId:p.id})).project.name,'Updated');
});

test('state isolates malformed project/group/system entries, preserves every ID and leaves valid project access intact',async()=>{
  const {store,fs}=fixture(),goodGroup=await store.groupCreate({name:'Good group'}),badGroup=await store.groupCreate({name:'Broken group'}),good=await store.projectCreate({name:'Good project',groupId:goodGroup.id}),grouped=await store.projectCreate({name:'Project in temporarily broken group',groupId:badGroup.id}),bad=await store.projectCreate({name:'Malformed JSON'}),nullProject=await store.projectCreate({name:'Null JSON'}),goodSystem=await store.systemCreate({name:'Good system'}),badSystem=await store.systemCreate({name:'Broken system'});
  const goodBytes=(await store.read(`projects/${good.id}/project.json`)).content;
  await replaceMetadata(store,fs,`groups/${badGroup.id}/group.json`,'{bad group');await replaceMetadata(store,fs,`projects/${bad.id}/project.json`,'{bad project');await replaceMetadata(store,fs,`projects/${nullProject.id}/project.json`,'null');await replaceMetadata(store,fs,`systems/${badSystem.id}/system.json`,'null');
  await store.write('projects/p-missing-metadata/notes.md','Orphaned project file',null);
  const writes=fs.writes.length,state=await store.state();assert.equal(fs.writes.length,writes);
  assert.deepEqual(new Set(state.projects.map(p=>p.id)),new Set([good.id,grouped.id,bad.id,nullProject.id,'p-missing-metadata']));
  for(const id of [bad.id,nullProject.id,'p-missing-metadata']){const row=state.projects.find(p=>p.id===id);assert.equal(row.unavailable,true);assert.ok(row.error.code);assert.ok(state.errors.some(error=>error.kind==='project'&&error.id===id));}
  assert.equal(state.groups.find(g=>g.id===badGroup.id).unavailable,true);assert.equal(state.systems.find(s=>s.id===badSystem.id).unavailable,true);assert.ok(state.errors.some(e=>e.kind==='group'&&e.id===badGroup.id));assert.ok(state.errors.some(e=>e.kind==='system'&&e.id===badSystem.id));
  assert.equal(state.projects.find(p=>p.id===good.id).unavailable,undefined);assert.equal(state.projects.find(p=>p.id===grouped.id).groupId,badGroup.id);assert.equal((await store.projectGet(grouped.id)).project.groupId,badGroup.id);assert.equal((await store.systemGet(goodSystem.id)).name,'Good system');assert.equal((await store.read(`projects/${good.id}/project.json`)).content,goodBytes);
  const saved=await store.projectUpdate({projectId:grouped.id,expectedRevision:1,name:'Still editable'});assert.equal(saved.name,'Still editable');assert.equal(saved.groupId,badGroup.id);assert.equal((await store.read(`projects/${bad.id}/project.json`)).content,'{bad project');
});

test('state isolates structurally malformed summaries before sorting or client consumption',async()=>{
  const {store,fs}=fixture(),good=await store.projectCreate({name:'Good'}),bad=await store.projectCreate({name:'Bad'}),group=await store.groupCreate({name:'Bad group'}),system=await store.systemCreate({name:'Bad system'});
  await replaceMetadata(store,fs,`projects/${bad.id}/project.json`,JSON.stringify({...bad,updatedAt:null}));await replaceMetadata(store,fs,`groups/${group.id}/group.json`,JSON.stringify({...group,name:{unexpected:'object'}}));await replaceMetadata(store,fs,`systems/${system.id}/system.json`,JSON.stringify({...system,platforms:{web:true}}));
  const state=await store.state();for(const [rows,id]of [[state.projects,bad.id],[state.groups,group.id],[state.systems,system.id]]){assert.equal(rows.find(row=>row.id===id).unavailable,true);assert.equal(rows.find(row=>row.id===id).error.code,'INVALID_DOCUMENT');}assert.equal(state.projects.find(row=>row.id===good.id).name,'Good');
});

test('Owner.initialize survives corrupt metadata and valid projects remain accessible without repair writes',async()=>{
  const {fs,store}=fixture(),good=await store.projectCreate({name:'Working project'}),bad=await store.projectCreate({name:'Broken project'}),group=await store.groupCreate({name:'Broken group'}),system=await store.systemCreate({name:'Broken system'});
  await replaceMetadata(store,fs,`projects/${bad.id}/project.json`,'{broken');await replaceMetadata(store,fs,`groups/${group.id}/group.json`,'[]');await replaceMetadata(store,fs,`systems/${system.id}/system.json`,'{broken');
  const service=new DesignerService(context(fs),{workspaceRoot:'/workspace'}),writes=fs.writes.length;
  try{await service.initialize();const state=await service.execute({action:'state'},{user:true});assert.equal(state.projects.find(p=>p.id===bad.id).unavailable,true);assert.equal((await service.execute({action:'project.get',projectId:good.id},{user:true})).project.name,'Working project');assert.equal(fs.writes.length,writes);}finally{service.dispose();}
});

test('an externally repaired metadata record becomes available on the next state read without replacing its history',async()=>{
  const {store,fs}=fixture(),p=await store.projectCreate({name:'Recoverable'}),made=await store.artboardCreate({projectId:p.id,expectedRevision:1,name:'Page',html:doc('Retained')}),original=(await store.read(`projects/${p.id}/project.json`)).content;
  await replaceMetadata(store,fs,`projects/${p.id}/project.json`,'{broken');assert.equal((await store.state()).projects.find(x=>x.id===p.id).unavailable,true);
  await replaceMetadata(store,fs,`projects/${p.id}/project.json`,original);const writes=fs.writes.length,state=await store.state(),read=await store.projectGet(p.id);assert.equal(state.projects.find(x=>x.id===p.id).unavailable,undefined);assert.equal(state.errors.some(e=>e.id===p.id),false);assert.deepEqual(read.history,made.project.history);assert.equal((await store.artboardGet(p.id,made.artboard.id)).html,doc('Retained'));assert.equal(fs.writes.length,writes);
});

test('registered custom roots that are missing or temporarily unreadable remain explicit unavailable entries',async()=>{
  const {store,fs}=fixture(),normal=await store.projectCreate({name:'Normal'}),mapped=await store.projectCreate({name:'Mapped'}),root='/workspace/custom-detached';await store.registerProjectLocation(mapped.id,root,{policy:defaultPolicy,user:true});
  fs.files.delete(root+'/project.json');const restarted=new DesignerStore({fs,workspaceRoot:'/workspace',policy:()=>defaultPolicy});let state=await restarted.state();assert.equal(state.projects.find(p=>p.id===mapped.id).error.code,'PROJECT_LOCATION_UNAVAILABLE');assert.equal(state.projects.find(p=>p.id===normal.id).name,'Normal');assert.equal(await restarted.projectPhysicalRoot(mapped.id),root);
  const stat=fs.stat.bind(fs);fs.stat=async(target,...args)=>{if(target.displayPath===root||target.displayPath.startsWith(root+'/'))throw Object.assign(Error('Mount permission unavailable'),{code:'EACCES'});return stat(target,...args);};
  state=await restarted.state();assert.equal(state.projects.find(p=>p.id===mapped.id).unavailable,true);assert.equal(state.projects.find(p=>p.id===mapped.id).error.code,'EACCES');assert.ok(state.errors.some(e=>e.kind==='project'&&e.id===mapped.id));assert.equal(state.projects.find(p=>p.id===normal.id).unavailable,undefined);
});

test('state does not swallow per-entry policy denials, unknown failures, shared directory failures or cancellation',async()=>{
  for(const code of ['FS_SANDBOX_DENIED','UNEXPECTED_PROVIDER_FAILURE']){const {store,fs}=fixture(),p=await store.projectCreate({name:'Entry'}),readText=fs.readText.bind(fs),error=Object.assign(Error(code),{code});fs.readText=async(target,...args)=>{if(target.displayPath.endsWith('/'+p.id+'/project.json'))throw error;return readText(target,...args);};await assert.rejects(store.state(),e=>e===error);}
  {const {store,fs}=fixture();await store.projectCreate({name:'Entry'});const stat=fs.stat.bind(fs),error=Object.assign(Error('Library directory unavailable'),{code:'EIO'});fs.stat=async(target,...args)=>{if(target.displayPath===store.root+'/projects')throw error;return stat(target,...args);};await assert.rejects(store.state(),e=>e===error);}
  {const {store}=fixture(),p=await store.projectCreate({name:'Warm location cache'}),controller=new AbortController(),reason=Error('Stop listing');await store.projectPhysicalRoot(p.id);controller.abort(reason);await assert.rejects(store.state(controller.signal),e=>e===reason);await assert.rejects(store.projectPhysicalRoot(p.id,controller.signal),e=>e===reason);}
  {const {store,fs}=fixture(),p=await store.projectCreate({name:'Entry'}),readText=fs.readText.bind(fs),reason=Object.assign(Error('Provider cancelled'),{name:'AbortError',code:'FS_NOT_FOUND'});fs.readText=async(target,...args)=>{if(target.displayPath.endsWith('/'+p.id+'/project.json'))throw reason;return readText(target,...args);};await assert.rejects(store.state(),e=>e===reason);}
  {const {store,fs}=fixture(),p=await store.projectCreate({name:'Entry'}),controller=new AbortController(),readText=fs.readText.bind(fs),reason=Error('Abort while reading an entry');fs.readText=async(target,...args)=>{if(target.displayPath.endsWith('/'+p.id+'/project.json')){controller.abort(reason);throw Object.assign(Error('Read race'),{code:'VERSION_CONFLICT'});}return readText(target,...args);};await assert.rejects(store.state(controller.signal),e=>e===reason);}
});

test('malformed global location indexes fail explicitly with the index document identity rather than guessing roots',async()=>{
  const values=['{broken','null',JSON.stringify({schemaVersion:1,locations:[null]}),JSON.stringify({schemaVersion:1,locations:[{projectId:'p-a',root:'/workspace/a'},{projectId:'p-a',root:'/workspace/b'}]})];
  for(const value of values){const {store,fs}=fixture();await replaceMetadata(store,fs,'.workbench/project-locations.json',value);const restarted=new DesignerStore({fs,workspaceRoot:'/workspace',policy:()=>defaultPolicy});await assert.rejects(restarted.state(),error=>error.code==='INVALID_DOCUMENT'&&error.details.relative==='.workbench/project-locations.json'&&error.details.document==='project-locations');assert.equal((await store.read('.workbench/project-locations.json')).content,value);}
});

test('root registration stores the canonical process path and reloads the same mapping without accepting sibling aliases',async()=>{
  const {store,fs}=fixture(),mapped=await store.projectCreate({name:'Canonical root'});fs.aliases.set('/workspace/chosen-alias','/workspace/physical-root');const registered=await store.registerProjectLocation(mapped.id,'/workspace/chosen-alias',{policy:defaultPolicy,user:true});assert.equal(registered.root,'/workspace/physical-root');
  const index=await store.readJSON('.workbench/project-locations.json');assert.equal(index.value.locations.find(p=>p.projectId===mapped.id).root,'/workspace/physical-root');assert.equal(index.content.includes('chosen-alias'),false);const writes=fs.writes.length;await store.registerProjectLocation(mapped.id,'/workspace/chosen-alias',{policy:defaultPolicy,user:true});assert.equal(fs.writes.length,writes);
  const restarted=new DesignerStore({fs,workspaceRoot:'/workspace',policy:()=>defaultPolicy});assert.equal(await restarted.projectPhysicalRoot(mapped.id),'/workspace/physical-root');assert.equal((await restarted.projectGet(mapped.id)).project.name,'Canonical root');
  const a=await restarted.projectCreate({name:'A'}),b=await restarted.projectCreate({name:'B'});fs.aliases.set(store.root+'/projects/'+a.id,store.root+'/projects/'+b.id);await assert.rejects(restarted.target(`projects/${a.id}/project.json`),expectCode('PROJECT_SCOPE'));const state=await restarted.state();assert.equal(state.projects.find(p=>p.id===a.id).unavailable,true);assert.equal(state.projects.find(p=>p.id===a.id).error.code,'PROJECT_SCOPE');assert.equal(state.projects.find(p=>p.id===b.id).name,'B');
});

