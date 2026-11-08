import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {DesignerService,apply,handleDesignerRequest,modelSafe} from './index.js';
import {normalizeDocument,applyDocumentOperations} from './document-model.js';
import {bindProjectApi} from './ui/project-api.js';
import {admittedTaskRecords,TASK_CONTEXT_NAME,ADMITTED_TASK_MARKER} from './ai-adapter.js';

const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const html='<!doctype html><html><head><title>Fixture</title></head><body><main data-dsh-node="main"><h1 data-dsh-node="hero">Original</h1></main><footer data-dsh-node="outside">Preserve</footer></body></html>';
class MemoryFS{
  files=new Map();counter=0;writes=[];
  async resolve(value,{cwd='/workspace'}={}){const full=path.resolve(cwd,value);return {targetKey:full,displayPath:full};}
  processPath(t){return t.targetKey;} contains(a,b){return b.targetKey===a.targetKey||b.targetKey.startsWith(a.targetKey+'/');}
  async stat(t){const f=this.files.get(t.targetKey);if(f)return {type:'file',size:f.bytes.length,version:f.version};if(t.targetKey==='/workspace'||[...this.files.keys()].some(p=>p.startsWith(t.targetKey+'/')))return {type:'directory',version:'directory'};}
  async readBytes(t,s,max){s?.throwIfAborted();const f=this.files.get(t.targetKey);if(!f)throw Object.assign(Error('Missing'),{code:'FS_NOT_FOUND'});if(f.bytes.length>max)throw Object.assign(Error('Bounded read'),{code:'FS_TOO_LARGE'});return Buffer.from(f.bytes);}
  async readText(t,s){return (await this.readBytes(t,s,128*1024*1024)).toString('utf8');}
  async readByteRange(t,{offset,length},s){return (await this.readBytes(t,s,128*1024*1024)).subarray(offset,offset+length);}
  async listDir(t){const entries=new Map();for(const name of this.files.keys())if(name.startsWith(t.targetKey+'/')){const tail=name.slice(t.targetKey.length+1),part=tail.split('/')[0];entries.set(part,{name:part,type:tail.includes('/')?'directory':'file'});}return [...entries.values()];}
  async writeText(t,value,expected,s,p){s?.throwIfAborted();if(!p||p.mode==='read-only'||p.mode==='workspace-write'&&!this.contains({targetKey:p.workspaceRoot},t))throw Object.assign(Error('Sandbox denied'),{code:'FS_SANDBOX_DENIED'});const old=this.files.get(t.targetKey);if(expected.kind==='createIfAbsent'&&old||expected.kind==='replaceIfVersion'&&old?.version!==expected.version)throw Object.assign(Error('Stale'),{code:'FS_STALE_VERSION'});const version=String(++this.counter);this.files.set(t.targetKey,{bytes:Buffer.from(value),version});this.writes.push({path:t.targetKey,policy:p});return {version};}
}
function fixture(){
  const fs=new MemoryFS(),agents=new Map(),sessions=new Map(),modes=new Map(),globals=new Map(),routes=new Map(),effects=[],listeners=new Map(),attachmentBytes=new Map(),receipts=new Map();let serial=0;
  const ctx={fs,fiber:{entry:{id:'host-test'}},get:name=>ctx[name],effect(start){const off=start();assert.equal(typeof off,'function','Invalid effect: expected a disposer function');effects.push(off);return off;},on(name,callback){listeners.set(name,callback);const off=()=>listeners.delete(name);effects.push(off);return off;},
    connection:{requestRejection:req=>req.headers?.origin==='https://untrusted.example'?403:undefined,admit:()=>({peer:{principal:{kind:'owner'},signal:new AbortController().signal}})},
    webServer:{getOrigin:()=> 'http://127.0.0.1:53998',register(route){if(routes.has(route.path))throw Error('Duplicate route');routes.set(route.path,route);return ()=>routes.delete(route.path);}},
    sandboxPolicy:{workspaceRoot:'/workspace',resolve:({session}={})=>({...policy,...(session?{mode:modes.get(session.id)||'workspace-write',workspaceRoot:session.header.cwd,sessionId:session.id}:{})})},
    tools:{register(def){assert.ok(!globals.has(def.name));globals.set(def.name,def);return ()=>globals.delete(def.name);},schemas(scope){return scope?[...scope.scoped.values()]:[...globals.values()];}},
    agentPresets:{compositionInventory:async()=>[{id:'minimal',rows:[]}]},agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'fixture'})},skills:{list:async()=>[],get:async()=>undefined},systemPrompt:{section:()=>()=>{}},
    agents:{get:id=>agents.get(id),list:()=>[...agents.values()],currentInitiator:()=>undefined,async create({sessionId,meta,setup}){let session=sessions.get(sessionId);if(!session){session={id:sessionId,header:{cwd:meta.cwd},events:[],snapshotEvents(){return this.events.slice();},append(type,data){this.events.push({type,data,seq:this.events.length,time:Date.now()});if(type==='sandbox/mode')modes.set(sessionId,data.mode);}};sessions.set(sessionId,session);}const scoped=new Map(),guards=[],runtimeContexts=new Map(),agent={id:sessionId,session,scoped,guards,runtimeContexts,status:'idle',ctx:{tools:{register(def){scoped.set(def.name,def);return()=>scoped.delete(def.name);},guard(fn){guards.push(fn);return()=>{};},restrict:()=>()=>{}},systemPrompt:{section:()=>()=>{},context(contribution){assert.equal(typeof contribution.text,'function');assert.ok(!runtimeContexts.has(contribution.name),'Duplicate native runtime context');runtimeContexts.set(contribution.name,contribution);return()=>runtimeContexts.delete(contribution.name);}},effect(start){const off=start();assert.equal(typeof off,'function','Invalid effect: expected a disposer function');return off;}}};agents.set(sessionId,agent);await setup?.(agent.ctx,agent);await listeners.get('agent/created')?.({agent,source:'startup'});return {agent,dispose:async()=>agents.delete(sessionId)};}},
    sessionController:{async resolveAgent(id){if(agents.has(id))return {agent:agents.get(id)};if(sessions.has(id))return ctx.agents.create({sessionId:id,meta:sessions.get(id).header});return {error:{code:'session/not-found'}};},async state({sessionId}){if(!sessions.has(sessionId))throw Object.assign(Error('Missing session'),{code:'session/not-found'});return {cursor:sessions.get(sessionId).events.length,active:agents.has(sessionId),running:agents.get(sessionId)?.status==='running',queue:[],pendingInput:[]};},async events({address}){return {records:sessions.get(address.sessionId).events.map(event=>({type:'event',event})),hasMore:false};},async prompt(request){const agent=agents.get(request.sessionId);const content=request.content.map(part=>part.type==='file'?{type:'file',attachment:receipts.get(part.receiptId).file}:part.type==='image'&&part.data?{type:'image',attachment:{attachmentId:'image-'+(++serial),name:part.name,mediaType:part.mediaType,bytes:Buffer.from(part.data,'base64').length,width:1,height:1}}:part);const turn=(agent.session.events.findLast(e=>e.type==='turn/start')?.data.turn||0)+1;agent.session.append('turn/start',{turn});agent.session.append('user/message',{role:'user',content,source:{kind:'user',rpcId:request.requestId}});const sections=[...agent.runtimeContexts.values()].map(contribution=>({name:contribution.name,text:contribution.text()})).filter(section=>section.text);if(sections.length)agent.session.append('user/message',{role:'user',content:[{type:'text',text:sections.map(section=>section.text).join('\n\n')}],source:{kind:'runtime-context',form:'snapshot',sections}});agent.status='running';return {accepted:true};},cancel({sessionId}){const agent=agents.get(sessionId);agent.status='idle';agent.session.append('turn/end',{turn:agent.session.events.findLast(e=>e.type==='turn/start')?.data.turn||1,reason:{kind:'aborted',reason:{kind:'user'}}});return {accepted:true};}},
    attachments:{async saveFile({data,name}){const bytes=Buffer.from(data),ref={attachmentId:'attachment-'+(++serial),name,bytes:bytes.length};attachmentBytes.set(ref.attachmentId,bytes);return ref;},async*readFileStream(ref){yield attachmentBytes.get(ref.attachmentId);},async readImage(ref){return {ref,data:attachmentBytes.get(ref.attachmentId)};}},
    fileUploads:{async upload(agent,{data,name}){const file=await ctx.attachments.saveFile({data:Buffer.from(data,'base64'),name}),receiptId='receipt-'+(++serial);receipts.set(receiptId,{file,sessionId:agent.id});return {file,receiptId};},async uploadStream({sessionId,data,name}){const parts=[];for await(const part of data)parts.push(Buffer.from(part));const file=await ctx.attachments.saveFile({data:Buffer.concat(parts),name}),receiptId='receipt-'+(++serial);receipts.set(receiptId,{file,sessionId});return {file,receiptId};},resolve(agent,id){const receipt=receipts.get(id);if(receipt?.sessionId!==agent.id)throw Error('Receipt scope');return {type:'file',attachment:receipt.file,sessionId:agent.id};}},
  };
  const service=new DesignerService(ctx,{workspaceRoot:'/workspace'});
  return {service,ctx,fs,agents,sessions,modes,globals,routes,effects,async project(){return service.execute({action:'project.create',name:'Host project'},{user:true});},async page(project){const created=await service.execute({action:'artboard.create',projectId:project.id,expectedRevision:project.revision,name:'Page',html},{user:true});return created;}};
}
const env={user:true};

test('main model tools cannot publish shared systems even with forged user options',async()=>{
  const f=fixture();await apply(f.ctx,{workspaceRoot:'/workspace'});
  const {agent}=await f.ctx.agents.create({sessionId:'main',meta:{cwd:'/workspace'}});
  const exec={agent,signal:new AbortController().signal};
  const system=await f.service.execute({action:'system.create',name:'User system',tokens:{}},env);
  const before=f.fs.writes.length;
  for(const action of ['system.create','system.save','system.archive'])await assert.rejects(f.globals.get('designer_manage').execute({action,systemId:system.id,expectedRevision:system.revision,name:'Model change',tokens:{}},exec),{code:'SHARED_SYSTEM_READ_ONLY'});
  for(const action of ['system.create','system.save','system.copy','system.import'])await assert.rejects(f.globals.get('designer_workbench').execute({action,options:{user:true,systemId:system.id,expectedRevision:system.revision,name:'Forged user',tokens:{}}},exec),{code:'SHARED_SYSTEM_READ_ONLY'});
  await assert.rejects(f.service.workbench.execute({action:'system.save',systemId:system.id,expectedRevision:system.revision,tokens:{}},{policy,user:false}),{code:'SHARED_SYSTEM_READ_ONLY'});
  assert.equal(f.fs.writes.length,before);
  for(const off of f.effects.reverse())await off?.();
});

test('explicit system archive retains pinned resources, examples, skeletons and variables',async()=>{
  const f=fixture(),system=await f.service.execute({action:'system.create',name:'Complete system',tokens:{color:'blue'},examples:[{name:'Card'}],skeletons:[{name:'Shell'}],variables:{spacing:8},resources:[{id:'r-icon',logicalPath:'images/icon.svg',mimeType:'image/svg+xml',content:'<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'}]},env);
  const before=structuredClone(system.versions[0]);
  const archived=await f.service.execute({action:'system.archive',systemId:system.id,expectedRevision:system.revision},env);
  assert.equal(archived.archived,true);
  for(const key of ['resources','examples','skeletons','variables'])assert.deepEqual(archived.versions.at(-1)[key],before[key]);
  assert.deepEqual(archived.versions[0],before);
  const resource=await f.service.execute({action:'system.resource.read',systemId:system.id,version:archived.revision,resourceId:'r-icon',encoding:'base64'},env);
  assert.ok(resource.content.includes('<rect'));
});

test('read admission outside the initiating writable root keeps project bytes unchanged',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const {agent}=await f.ctx.agents.create({sessionId:'reader-elsewhere',meta:{cwd:'/workspace/elsewhere'}});
  const before=f.fs.writes.length;
  const admitted=await f.service.execute({action:'ai.run',projectId:project.id,prompt:'Analyze the saved project',target:{scope:'read'},contextSessionId:agent.id},env);
  assert.equal(admitted.readonly,true);assert.equal(admitted.accepted,true);assert.equal(f.fs.writes.length,before);
  assert.equal(f.service.aiWorkbench.taskFor(f.agents.get(admitted.sessionId)).scope,'read');
});

test('writable admission reports a native readonly project Session before freezing or enqueueing writes',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const {agent}=await f.service.projectAgent({...project,aiSessionId:'designer-'+project.id},undefined,{mode:'read-only',workspaceRoot:'/workspace'});
  const before=f.fs.writes.length;
  await assert.rejects(f.service.execute({action:'ai.run',projectId:project.id,prompt:'Create a page',target:{scope:'project'}},env),error=>error.code==='PROJECT_SESSION_READ_ONLY'&&error.details.sessionId===agent.id);
  assert.equal(f.fs.writes.length,before);assert.equal(agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user').length,0);assert.equal(f.modes.get(agent.id),'read-only');
});

test('project Agent preflight honors existing additional writable roots without expanding them',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const policy={mode:'workspace-write',workspaceRoot:'/other',additionalWritableRoots:['/workspace']};
  const result=await f.service.projectAgent({...project,aiSessionId:'designer-'+project.id},undefined,policy);
  assert.ok(result.agent);assert.deepEqual(policy.additionalWritableRoots,['/workspace']);
  await assert.rejects(f.service.projectAgent({...project,aiSessionId:result.sessionId},undefined,{mode:'workspace-write',workspaceRoot:'/other'}),{code:'FS_SANDBOX_DENIED'});
});

test('project draft writes use the prepared native Session policy on the first call',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const {agent:chat}=await f.ctx.agents.create({sessionId:'remembered-chat',meta:{cwd:'/elsewhere'}});
  const prepared=await f.service.execute({action:'composer.prepare',projectId:project.id,contextSessionId:chat.id},env);
  const request={action:'draft.save',projectId:project.id,resourceId:'ai-compose',expectedVersion:null,draft:{prompt:'Create a page'}};
  const writes=f.fs.writes.length;let publications=0;const write=f.fs.writeText.bind(f.fs);
  f.fs.writeText=async(...args)=>{publications++;return write(...args);};
  await assert.rejects(f.service.execute({...request,contextSessionId:chat.id},env),{code:'FS_SANDBOX_DENIED'});
  assert.equal(publications,1);assert.equal(f.fs.writes.length,writes,'Denied write must not retry as the owner or project Session');
  const saved=await f.service.execute({...request,contextSessionId:prepared.sessionId},env);
  assert.ok(saved.version);assert.equal(publications,2);
  const publication=f.fs.writes.at(-1),root=await f.service.projectPhysicalRoot(project.id);
  assert.equal(publication.policy.sessionId,prepared.sessionId);assert.equal(publication.policy.mode,'workspace-write');assert.equal(publication.policy.workspaceRoot,root);assert.deepEqual(publication.policy.additionalWritableRoots,[]);
  assert.equal(publication.path,path.join(root,'.workbench/drafts/'+hash('ai-compose')+'.json'));
  assert.equal((await f.service.store.projectGet(project.id)).project.aiSessionId,null,'Preparing a composer must not persist a different binding');
});

test('project-bound draft API reaches the HTTP owner ingress once and keeps native downgrades',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const {agent:chat}=await f.ctx.agents.create({sessionId:'remembered-readonly',meta:{cwd:'/elsewhere'}});chat.session.append('sandbox/mode',{mode:'read-only'});
  const prepared=await f.service.execute({action:'composer.prepare',projectId:project.id},env),agent=f.agents.get(prepared.sessionId),requests=[];
  const transport=async(action,args)=>{
    const input={action,contextSessionId:chat.id,...args};requests.push(input);
    const req=Readable.from([JSON.stringify(input)]);Object.assign(req,{url:'/api/designer',method:'POST',headers:{'content-type':'application/json'}});
    let payload;const res={writeHead(status){this.status=status;},end(value){payload=JSON.parse(value);}};
    await handleDesignerRequest(f.service,f.ctx.connection,req,res);
    if(!payload.ok)throw Object.assign(new Error(payload.error.message),payload.error);
    return payload.value;
  };
  const api=bindProjectApi(transport,{projectId:project.id,sessionId:prepared.sessionId});
  const saved=await api('draft.save',{resourceId:'ai-compose',expectedVersion:null,draft:{prompt:'Persist exact project context'}});
  assert.ok(saved.version);assert.equal(requests.length,1);assert.equal(requests[0].contextSessionId,agent.id);
  const writes=f.fs.writes.length;agent.session.append('sandbox/mode',{mode:'read-only'});
  await assert.rejects(api('draft.save',{resourceId:'ai-compose',expectedVersion:saved.version,draft:{prompt:'Do not elevate'}}),{code:'FS_SANDBOX_DENIED'});
  assert.equal(requests.length,2);assert.equal(f.fs.writes.length,writes);assert.equal(f.modes.get(agent.id),'read-only');
});

test('a project native Session downgrade stays readonly for owner drafts and does not change its identity',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const prepared=await f.service.execute({action:'composer.prepare',projectId:project.id},env),agent=f.agents.get(prepared.sessionId);
  agent.session.append('sandbox/mode',{mode:'read-only'});const before=f.fs.writes.length,events=agent.session.events.length;
  for(const action of ['draft.save','workspace.state.save'])await assert.rejects(f.service.execute({action,projectId:project.id,contextSessionId:agent.id,resourceId:'ai-compose',expectedVersion:null,draft:{prompt:'Keep me'},state:{}},env),{code:'FS_SANDBOX_DENIED'});
  assert.equal(f.fs.writes.length,before);assert.equal(f.modes.get(agent.id),'read-only');assert.equal(agent.session.events.length,events);
  assert.equal((await f.service.execute({action:'draft.get',projectId:project.id,resourceId:'ai-compose',contextSessionId:agent.id},env)).draft,null);
});

test('native project context cannot save drafts in another project or alias an unregistered root',async()=>{
  const f=fixture(),one=await f.project(),two=await f.project();await f.service.initialize();const prepared=await f.service.execute({action:'composer.prepare',projectId:one.id},env),writes=f.fs.writes.length;
  await assert.rejects(f.service.execute({action:'draft.save',projectId:two.id,contextSessionId:prepared.sessionId,resourceId:'ai-compose',expectedVersion:null,draft:{}},env),{code:'PROJECT_SCOPE'});
  const resolve=f.fs.resolve.bind(f.fs),root=await f.service.projectPhysicalRoot(one.id);
  f.fs.resolve=async(value,options)=>{const target=await resolve(value,options);return target.targetKey===root?{targetKey:'/unregistered',displayPath:'/unregistered'}:target;};
  await assert.rejects(f.service.execute({action:'draft.save',projectId:one.id,contextSessionId:prepared.sessionId,resourceId:'ai-compose',expectedVersion:null,draft:{}},env),{code:'PROJECT_SCOPE'});
  assert.equal(f.fs.writes.length,writes);
});

test('registered external project drafts intersect native policy with their registered physical root',async()=>{
  const f=fixture(),project=await f.service.store.projectCreate({name:'External'}),full={mode:'danger-full-access',workspaceRoot:'/workspace'};
  const root='/external/user-project';await f.service.registerProjectLocation(project.id,root,{user:true,policy:full});
  await f.service.workbench.execute({action:'project.initialize',projectId:project.id,expectedRevision:project.revision},{user:true,policy:full});await f.service.initialize();
  const prepared=await f.service.execute({action:'composer.prepare',projectId:project.id},env),writes=f.fs.writes.length;
  const saved=await f.service.execute({action:'draft.save',projectId:project.id,contextSessionId:prepared.sessionId,resourceId:'ai-compose',expectedVersion:null,draft:{prompt:'External project'}},env);
  assert.ok(saved.version);assert.equal(f.fs.writes.length,writes+1);assert.equal(f.fs.writes.at(-1).policy.workspaceRoot,root);assert.equal(f.fs.writes.at(-1).policy.sessionId,prepared.sessionId);assert.deepEqual(f.fs.writes.at(-1).policy.additionalWritableRoots,[]);
});

test('active Design saves normal HTML but cannot follow a symlink into a sibling Design',async()=>{
  const f=fixture(),p=await f.project(),first=await f.page(p),other=await f.service.execute({action:'design.create',projectId:p.id,expectedRevision:first.projectRevision,name:'Sibling'},env);
  await f.service.initialize();const firstId=first.page.designId,admitted=await f.service.execute({action:'ai.run',projectId:p.id,activeDesignId:firstId,prompt:'Update the active design',target:{designId:firstId,scope:'design'}},env),agent=f.agents.get(admitted.sessionId);
  const basis=await f.service.editor.read(p.id,first.page.id,env);
  const saved=await f.service.execute({action:'edit.apply',projectId:p.id,pageId:first.page.id,operations:[{type:'text',nodeIds:['hero'],value:'Scoped save'}],expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,expectedVersion:basis.version},{agent});assert.equal(saved.nodes.find(n=>n.id==='hero').text,'Scoped save');
  const project=(await f.service.store.projectGet(p.id)).project,active=project.workbench.designs.find(d=>d.id===firstId),root=await f.service.projectPhysicalRoot(p.id),resolve=f.fs.resolve.bind(f.fs),destination=active.folder+'/assets/test.css';
  f.fs.resolve=async(value,options)=>{const out=await resolve(value,options);if(out.targetKey===path.join(root,destination))return {targetKey:path.join(root,other.design.folder,'assets/escaped.css'),displayPath:path.join(root,other.design.folder,'assets/escaped.css')};return out;};
  const writes=f.fs.writes.length;await assert.rejects(agent.scoped.get('designer_workbench').execute({action:'file.create',options:{path:destination,content:'body{color:red}',expectedRevision:project.revision,expectedVersion:null}},{signal:new AbortController().signal}),{code:'WRITE_SCOPE'});assert.equal(f.fs.writes.length,writes);
  await f.service.execute({action:'ai.cancel',projectId:p.id},env);
  const switched=await f.service.execute({action:'ai.run',projectId:p.id,activeDesignId:other.design.id,prompt:'Update the sibling design',target:{designId:other.design.id,scope:'design'}},env);assert.equal(switched.sessionId,admitted.sessionId);assert.equal(agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user').length,2);assert.equal(f.service.aiWorkbench.taskFor(agent).designId,other.design.id);
});

test('confirmed project task keeps one Session and rejects system dependency symlinks outside its project',async()=>{
  const f=fixture(),p=await f.project(),first=await f.page(p);
  const other=await f.service.execute({action:'design.create',projectId:p.id,expectedRevision:first.projectRevision,name:'Other design'},env);
  const system=await f.service.execute({action:'system.create',name:'Readonly knowledge system',guidelines:'Use this stylesheet',resources:[{id:'r-style',logicalPath:'styles/theme.css',mimeType:'text/css',content:'h1{color:green}'}]},env);
  let current=other.project;
  for(const designId of [first.page.designId,other.design.id])current=(await f.service.execute({action:'binding.set',projectId:p.id,designId,expectedRevision:current.revision,binding:{mode:'independent',systemId:system.id,version:1}},env)).project;
  await f.service.initialize();
  const request={action:'ai.run',projectId:p.id,activeDesignId:first.page.designId,prompt:'Update the project',target:{scope:'project'}};
  let challenge;try{await f.service.execute(request,env);assert.fail('Confirmation expected');}catch(error){assert.equal(error.code,'TARGET_CONFIRMATION_REQUIRED');challenge=error.details;}
  assert.equal(f.agents.size,0);
  const admitted=await f.service.execute({...request,targetConfirmation:challenge.token},env),agent=f.agents.get(admitted.sessionId);
  assert.equal(agent.session.header.cwd,await f.service.projectPhysicalRoot(p.id));
  const beforeWrites=f.fs.writes.length,before=JSON.stringify([...f.fs.files].map(([key,value])=>[key,value.bytes.toString('base64'),value.version]));
  const resolve=f.fs.resolve.bind(f.fs),fragment='/'+other.design.folder+'/assets/system-';
  f.fs.resolve=async(value,options)=>{const result=await resolve(value,options);if(result.targetKey.includes(fragment))return {targetKey:'/outside/escaped.css',displayPath:'/outside/escaped.css'};return result;};
  await assert.rejects(agent.scoped.get('designer_workbench').execute({action:'asset.fromSystemResource',options:{designId:other.design.id,resourceId:'r-style',expectedRevision:admitted.projectRevision}},{agent,signal:new AbortController().signal}),error=>['PROJECT_SCOPE','WRITE_SCOPE','FS_SANDBOX_DENIED'].includes(error.code));
  assert.equal(f.fs.writes.length,beforeWrites);assert.equal(JSON.stringify([...f.fs.files].map(([key,value])=>[key,value.bytes.toString('base64'),value.version])),before);
});

test('legacy create and commits use canonical Workspace pages, immutable history and exact versions',async()=>{
  const f=fixture(),p=await f.project(),made=await f.page(p);assert.ok(made.artboard.designId);assert.ok(made.artboard.htmlPath.startsWith('designs/'));let read=await f.service.execute({action:'edit.read',projectId:p.id,pageId:made.artboard.id},env);assert.equal(read.document.nodes.hero.text,'Original');const stable=read.document.nodes.outside.hash;
  const changed=applyDocumentOperations(read.document.html,[{type:'text',nodeIds:['hero'],value:'Changed'}]);const saved=await f.service.execute({action:'file.write',projectId:p.id,fileId:read.file.id,expectedRevision:read.projectRevision,expectedVersion:read.version,content:changed.html},env);assert.equal(saved.document.nodes.hero.text,'Changed');assert.equal(saved.document.nodes.outside.hash,stable);assert.notEqual(saved.page.htmlPath,made.artboard.htmlPath);assert.ok(saved.project.workbench.fileHistory[read.file.id].entries.length>=2);
  await assert.rejects(f.service.execute({action:'file.write',projectId:p.id,fileId:read.file.id,expectedRevision:saved.projectRevision,content:changed.html},env),{code:'CAS_REQUIRED'});
  await assert.rejects(f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.artboard.id,expectedRevision:read.projectRevision,html},env),{code:'VERSION_CONFLICT'});
});

test('ordinary source HTML stays code; invalid page edits preserve the last valid saved source',async()=>{
  const f=fixture(),p=await f.project();const code=await f.service.execute({action:'file.create',projectId:p.id,path:'src/entry.html',content:'<div>Raw source fragment</div>',expectedVersion:null,expectedRevision:p.revision},env);const raw=await f.service.execute({action:'file.read',projectId:p.id,fileId:code.file.id},env);assert.equal(raw.content,'<div>Raw source fragment</div>');assert.ok(!raw.content.includes('data-dsh-node'));
  const made=await f.page(code.project),basis=await f.service.editor.read(p.id,made.page.id,env);await assert.rejects(f.service.execute({action:'file.write',projectId:p.id,fileId:basis.file.id,expectedRevision:basis.projectRevision,expectedVersion:basis.version,content:'<!doctype html><html><body><img src="missing.png"></body></html>'},env),error=>error.code==='INVALID_DOCUMENT'&&error.details.diagnostics.some(d=>d.code==='MISSING_RESOURCE'));const after=await f.service.editor.read(p.id,made.page.id,env);assert.equal(after.sourceHash,basis.sourceHash);assert.equal(after.version,basis.version);
});

test('invalid legacy model metadata remains readable as source and only explicit user repair can rebuild it',async()=>{
  const f=fixture(),p=await f.project(),bad='<!doctype html><html><head><script id="dsh-document-model" type="application/json">{broken</script></head><body><h1>Broken metadata</h1></body></html>';const made=await f.service.store.artboardCreate({projectId:p.id,name:'Legacy invalid',html:bad,expectedRevision:p.revision});const workspace=await f.service.workbench.project(p.id),file=workspace.workbench.files.find(entry=>entry.pageId===made.artboard.id);const raw=await f.service.execute({action:'file.read',projectId:p.id,fileId:file.id},env);assert.ok(raw.content.includes('{broken'));assert.equal(raw.readonlyCanvas,true);assert.equal(raw.sourceRepairRequired,true);const request={action:'file.write',projectId:p.id,fileId:file.id,expectedRevision:raw.projectRevision,expectedVersion:raw.version,content:html};await assert.rejects(f.service.execute(request),error=>error.name==='DocumentModelError');const repaired=await f.service.execute(request,env);assert.equal(repaired.identityRebuilt,true);assert.ok(repaired.diagnostics.some(d=>d.code==='IDENTITY_REBUILT'));const reopened=await f.service.editor.read(p.id,made.artboard.id,env);assert.equal(reopened.document.nodes.hero.text,'Original');const history=await f.service.workbench.execute({action:'file.history',projectId:p.id,fileId:file.id},env);assert.ok(JSON.stringify(history).includes('entries'));
});

test('native admission authorizes only the frozen selection for legacy full HTML and source-file writes',async()=>{
  const f=fixture(),p=await f.project(),made=await f.page(p);await f.service.initialize();const admission=await f.service.execute({action:'ai.run',projectId:p.id,prompt:'Change the heading only',target:{scope:'selection',pageId:made.page.id,nodeIds:['hero']}},env);const agent=f.agents.get(admission.sessionId),basis=await f.service.editor.read(p.id,made.page.id,env);
  await assert.rejects(f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.page.id,expectedRevision:basis.projectRevision,html:basis.document.html.replace('Preserve','Escaped')},{agent}),{code:'SCOPE_DENIED'});
  const changed=applyDocumentOperations(basis.document.html,[{type:'text',nodeIds:['hero'],value:'Local edit'}]);const saved=await f.service.execute({action:'file.write',projectId:p.id,fileId:basis.file.id,expectedRevision:basis.projectRevision,expectedVersion:basis.version,content:changed.html},{agent});assert.equal(saved.nodes.find(n=>n.id==='hero').text,'Local edit');assert.equal((await f.service.editor.read(p.id,made.page.id,env)).document.nodes.outside.hash,basis.document.nodes.outside.hash);
});

test('edit operation discovery and shared instance slots report real propagation identities',async()=>{
  const f=fixture(),p=await f.project(),made=await f.page(p);const help=await f.service.execute({action:'edit.operations',projectId:p.id,type:'interaction.set'},env);assert.ok(JSON.stringify(help).includes('modal'));
  const doc=normalizeDocument('<!doctype html><html><body><section data-dsh-node="definition"><h2 data-dsh-node="title" data-dsh-slot="title">Card</h2></section><section data-dsh-node="instance"><h2 data-dsh-node="instance-title" data-dsh-slot="title">Card</h2></section></body></html>');const linked=applyDocumentOperations(doc.html,[{type:'definition.set',definition:{id:'card',rootId:'definition',instanceIds:['instance']}}]);const before=await f.service.editor.read(p.id,made.page.id,env);await f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.page.id,expectedRevision:before.projectRevision,html:linked.html},env);const impact=await f.service.execute({action:'edit.impact',projectId:p.id,pageId:made.page.id,nodeIds:['instance-title'],definitionScope:'definition'},env);assert.deepEqual(new Set(impact.affectedNodeIds),new Set(['title','instance-title']));
});

test('binding application submits one native content-only task and only marks actual saved page scopes',async()=>{
  const f=fixture(),p=await f.project(),made=await f.page(p);await f.service.initialize();const sys=await f.service.execute({action:'system.create',name:'Pinned system',platforms:['web'],guidelines:'Blue headings',tokens:{color:'#246'}},env);const bound=await f.service.execute({action:'binding.set',projectId:p.id,designId:made.page.designId,binding:{mode:'independent',systemId:sys.id,version:1},expectedRevision:made.projectRevision},env);const application=await f.service.execute({action:'binding.apply',projectId:p.id,expectedRevision:bound.projectRevision,designIds:[made.page.designId],pageIds:[made.page.id]},env);assert.equal(application.requests.length,1);assert.equal(application.requests[0].status,'running');const agent=f.agents.get(application.ai.sessionId),task=f.service.aiWorkbench.taskFor(agent);assert.equal(task.contentOnly,true);assert.equal(task.existingOnly,true);assert.deepEqual(task.pageIds,[made.page.id]);assert.equal(agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user').length,1);
  await assert.rejects(f.service.execute({action:'artboard.create',projectId:p.id,name:'Unauthorized new page',html,expectedRevision:application.projectRevision},{agent}),{code:'SCOPE_DENIED'});const basis=await f.service.editor.read(p.id,made.page.id,env);const changed=applyDocumentOperations(basis.document.html,[{type:'style',nodeIds:['hero'],styles:{color:'#246'}}]);await f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.page.id,expectedRevision:basis.projectRevision,html:changed.html},{agent});const current=(await f.service.store.projectGet(p.id)).project;assert.equal(current.workbench.bindingApplications[0].status,'applied');assert.deepEqual(current.workbench.bindingApplications[0].savedPageIds,[made.page.id]);assert.equal(current.workbench.designs[0].appliedSystem.visualReview,'pending');await f.service.execute({action:'ai.cancel',projectId:p.id},env);const reconciled=await f.service.execute({action:'workspace.open',projectId:p.id},env);assert.equal(reconciled.project.workbench.bindingApplications[0].status,'cancelled');assert.equal(reconciled.project.workbench.bindingApplications[0].outputStatus,'saved');assert.equal(reconciled.designs[0].appliedSystem.generation,'cancelled');
});

test('multi-Design binding uses one native matrix task and reuses pending application IDs after busy admission',async()=>{
  const f=fixture(),p=await f.project(),first=await f.page(p),design=await f.service.execute({action:'design.create',projectId:p.id,expectedRevision:first.projectRevision,name:'Second design'},env),second=await f.service.execute({action:'page.create',projectId:p.id,designId:design.design.id,expectedRevision:design.projectRevision,name:'Second page',html},env);await f.service.initialize();const systems=[];for(const name of ['One','Two'])systems.push(await f.service.execute({action:'system.create',name,platforms:['web'],guidelines:name,tokens:{}},env));let project=second.project;for(const [index,id] of [first.page.designId,design.design.id].entries()){const bound=await f.service.execute({action:'binding.set',projectId:p.id,designId:id,expectedRevision:project.revision,binding:{mode:'independent',systemId:systems[index].id,version:1}},env);project=bound.project;}
  const old=await f.service.execute({action:'ai.run',projectId:p.id,prompt:'Existing active task'},env);project=(await f.service.store.projectGet(p.id)).project;const request={action:'binding.apply',projectId:p.id,designIds:[first.page.designId,design.design.id],pageIds:[first.page.id,second.page.id],expectedRevision:project.revision};let busy;try{await f.service.execute(request,env);assert.fail('Admission should be busy');}catch(error){assert.equal(error.code,'AI_BUSY');busy=error;}assert.equal(busy.details.pendingApplications.length,2);await f.service.execute({action:'ai.cancel',projectId:p.id},env);const application=await f.service.execute({...request,expectedRevision:busy.details.projectRevision},env);assert.deepEqual(application.requests.map(r=>r.id),busy.details.pendingApplications);assert.equal(application.project.workbench.bindingApplications.length,2);const agent=f.agents.get(old.sessionId),task=f.service.aiWorkbench.taskFor(agent);assert.equal(agent.session.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user').length,2);assert.equal(task.effectiveBinding.mode,'per-target');assert.equal(task.bindingApplications.length,2);assert.deepEqual(new Set(task.bindingApplications.map(r=>r.systemId)),new Set(systems.map(s=>s.id)));assert.equal(task.contentOnly,true);await f.service.execute({action:'ai.cancel',projectId:p.id},env);const cancelled=await f.service.execute({action:'workspace.open',projectId:p.id},env);assert.ok(cancelled.project.workbench.bindingApplications.every(r=>r.generation==='cancelled'&&r.status==='cancelled'&&r.outputStatus==='none'&&r.savedPageIds.length===0));
});

test('registered page source beyond the old 4 MiB Store limit is read completely without truncation',async()=>{
  const f=fixture(),p=await f.project(),large='<!doctype html><html><body><p data-dsh-node="large">'+('字'.repeat(1_450_000))+'</p><footer data-dsh-node="tail">Actual end</footer></body></html>';const made=await f.service.execute({action:'artboard.create',projectId:p.id,expectedRevision:p.revision,name:'Large source',html:large},env);const full=await f.service.editor.read(p.id,made.page.id,env);assert.ok(Buffer.byteLength(full.document.html)>4_000_000);assert.equal(full.document.nodes.tail.text,'Actual end');assert.equal(full.document.nodes.large.text.length,1_450_000);
});

test('plugin mounts all real HTTP adapters and all three global tools, then removes registrations',async()=>{
  const f=fixture();assert.throws(()=>f.ctx.effect(()=>({})),/Invalid effect/);assert.equal(await apply(f.ctx,{workspaceRoot:'/workspace'}),undefined);assert.deepEqual([...f.globals.keys()].sort(),['designer_import','designer_manage','designer_workbench']);for(const route of ['/api/designer','/api/designer/meta','/api/designer/upload','/api/designer/resource','/api/designer/file-resource','/api/designer/source-resource','/api/designer/capture','/api/designer/knowledge-resource','/api/designer/share','/api/designer/download'])assert.ok(f.routes.has(route));const manage=f.globals.get('designer_manage'),{agent}=await f.ctx.agents.create({sessionId:'main',meta:{cwd:'/workspace'}});for(const off of f.effects.reverse())await off();assert.equal(f.routes.size,0);assert.equal(f.globals.size,0);await assert.rejects(manage.execute({action:'state'},{agent,signal:new AbortController().signal}),{code:'SERVICE_DISPOSED'});
});

test('progressive global help preserves the inner action and reports actual three-tool scopes',async(t)=>{
  const f=fixture();assert.equal(await apply(f.ctx,{workspaceRoot:'/workspace'}),undefined);const {agent}=await f.ctx.agents.create({sessionId:'main',meta:{cwd:'/workspace'}}),exec={agent,signal:new AbortController().signal},manage=f.globals.get('designer_manage'),workbench=f.globals.get('designer_workbench'),p=await manage.execute({action:'project.create',name:'Discovery'},exec);const directory=await workbench.execute({action:'help'},exec);assert.ok(Array.isArray(directory.actions));assert.ok(!JSON.stringify(directory).includes('expectedVersion'));const detail=await workbench.execute({action:'help',options:{action:'file.write'}},exec);assert.equal(detail.action,'file.write');assert.equal(detail.fields.expectedVersion,'from file.read');await manage.execute({action:'ai.run',projectId:p.id,prompt:'Analyze'},exec);const {schemas:footprint}=await workbench.execute({action:'workbench.status'},exec);assert.equal(footprint.global.count,3);assert.equal(footprint.retainedCompatibilitySubset.global.count,2);assert.equal(footprint.scoped[0].count,3);assert.ok(footprint.deltaAgainstCompatibilitySubset.schemaChars>0);if(process.env.DSH_DESIGNER_SCHEMA_REPORT==='1')t.diagnostic(JSON.stringify({global:footprint.global,globalCompatibility:footprint.retainedCompatibilitySubset.global,scoped:footprint.scoped,scopedCompatibility:footprint.retainedCompatibilitySubset.scoped,delta:footprint.deltaAgainstCompatibilitySubset}));for(const off of f.effects.reverse())await off?.();
});

test('concurrent restoration keeps one exact Agent and one view cancellation cannot poison another waiter',async()=>{
  const f=fixture(),project=await f.project();await f.service.initialize();
  const {agent}=await f.ctx.agents.create({sessionId:'designer-'+project.id,meta:{cwd:'/workspace'}});f.service.bindings.set(agent.id,project.id);
  const read=f.service.store.projectGet.bind(f.service.store);let release,reads=0;
  const gate=new Promise(resolve=>release=resolve);f.service.store.projectGet=async(...args)=>{reads++;await gate;return read(...args);};
  const caller=new AbortController(),one=f.service.restoreAgent(agent,project,caller.signal),two=f.service.restoreAgent(agent,project);
  const cancelled=assert.rejects(one,{name:'AbortError'});caller.abort();await cancelled;release();await two;
  assert.equal(reads,1);assert.equal(f.agents.get(agent.id),agent);assert.equal(f.service.taskRecoveryErrors.has(agent.id),false);assert.equal(agent.session.events.filter(event=>event.type==='sandbox/mode').length,0);
});

test('service disposal aborts and drains owned source work without cancelling the native Session',async()=>{
  const f=fixture(),p=await f.project();await f.service.initialize();const run=await f.service.execute({action:'ai.run',projectId:p.id,prompt:'Native task survives service operation cancellation'},env);let entered;const began=new Promise(resolve=>entered=resolve);f.service.sources.execute=async(_input,context)=>new Promise((_resolve,reject)=>{context.signal.addEventListener('abort',()=>reject(context.signal.reason),{once:true});entered();});const operation=f.service.execute({action:'workbench.source.capture',projectId:p.id,sourceId:'x-owned'},env),rejected=assert.rejects(operation,error=>error.name==='AbortError');await began;await f.service.dispose();await rejected;assert.equal(f.service.inFlight.size,0);assert.equal(f.agents.get(run.sessionId).status,'running');assert.ok(f.sessions.has(run.sessionId));
});

test('initialization failure removes previously registered global tools',async()=>{const f=fixture();f.ctx.agentPresets.compositionInventory=async()=>{throw Error('Preset unavailable');};await assert.rejects(apply(f.ctx,{workspaceRoot:'/workspace'}),/Preset unavailable/);assert.equal(f.globals.size,0);assert.equal(f.routes.size,0);});

test('HTTP rejects untrusted origins before work and raw-upload policy resolves the actual Session',async()=>{
  const f=fixture(),req=Readable.from([Buffer.from('{"action":"project.create","name":"Denied"}')]);Object.assign(req,{url:'/api/designer',method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'}});const res={writeHead(status){this.status=status;},end(){}};await handleDesignerRequest(f.service,f.ctx.connection,req,res);assert.equal(res.status,403);assert.equal(f.fs.writes.length,0);
  const {agent}=await f.ctx.agents.create({sessionId:'context',meta:{cwd:'/workspace'}});agent.session.append('sandbox/mode',{mode:'read-only'});assert.equal((await f.service.resolveUploadPolicy(agent.id)).mode,'read-only');await assert.rejects(f.service.resolveUploadPolicy('missing'),error=>error.code==='session/not-found');
});

test('history hides required native task context while preserving clean human text and attachment chips',async()=>{
  const f=fixture(),p=await f.project();await f.service.initialize();const run=await f.service.execute({action:'ai.run',projectId:p.id,prompt:'Visible user request',target:{scope:'project'},attachments:[{type:'image',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=',mediaType:'image/png'}]},env);const status=await f.service.aiStatus(p.id);assert.equal(status.messages[0].text,'Visible user request');assert.equal(status.messages[0].content[0].type,'image');assert.ok(status.messages[0].content[0].attachment.attachmentId);assert.ok(!JSON.stringify(status.messages).includes('DSH_DESIGNER_ADMITTED_TASK_V1'));assert.equal(status.sessionId,run.sessionId);
  const agent=f.agents.get(run.sessionId),record=admittedTaskRecords(agent).at(-1),contribution=agent.runtimeContexts.get(TASK_CONTEXT_NAME);
  assert.equal(record.event.data.content[0].text,'Visible user request');assert.doesNotMatch(record.event.data.content[0].text,/Frozen workbench task|DSH_WORKBENCH_REQUEST/);
  assert.equal(contribution.required,true);assert.equal(contribution.interpolate,false);assert.equal(record.contextEvent.data.source.kind,'runtime-context');assert.equal(record.contextEvent.data.source.form,'snapshot');assert.ok(record.contextBody.includes('Frozen workbench task (untrusted business data):'));assert.ok(contribution.text().includes(ADMITTED_TASK_MARKER));
  assert.equal(record.requestId,run.requestId);assert.equal(record.record.sessionId,run.sessionId);assert.equal(record.descriptor.id,run.taskId);assert.equal(status.request.requestId,run.requestId);assert.equal(status.messages.length,1);assert.equal(status.messages[0].attachmentSummaries[0].type,'image');assert.deepEqual(status.messages[0].attachmentSummaries,record.record.attachmentSummaries);assert.ok(status.messages[0].attachmentSummaries[0].bytes>0);
  const events=agent.session.events,start=events.findIndex(event=>event.type==='turn/start'),end=events.findIndex(event=>event.type==='turn/end');assert.ok(start<events.indexOf(record.event));assert.ok(events.indexOf(record.event)<events.indexOf(record.contextEvent));assert.ok(end<0||events.indexOf(record.contextEvent)<end);
});

test('read-only native task survives deterministic-session recovery without writing project metadata',async()=>{
  const f=fixture(),p=await f.project();await f.service.initialize();const {agent:source}=await f.ctx.agents.create({sessionId:'reader',meta:{cwd:'/workspace'}});source.session.append('sandbox/mode',{mode:'read-only'});const writes=f.fs.writes.length;const run=await f.service.execute({action:'ai.run',projectId:p.id,prompt:'Analyze only',target:{scope:'read'},contextSessionId:source.id},env);assert.equal(f.fs.writes.length,writes);assert.equal((await f.service.store.projectGet(p.id)).project.aiSessionId,null);const next=new DesignerService(f.ctx,{workspaceRoot:'/workspace'});await next.initialize();const task=next.aiWorkbench.taskFor(f.agents.get(run.sessionId));assert.equal(task.scope,'read');assert.equal((await next.aiStatus(p.id)).sessionId,run.sessionId);assert.equal(f.fs.writes.length,writes);
});

test('project clone reads independent immutable source captures from its new root',async()=>{
  const f=fixture(),p=await f.project(),context={user:true,policy};const plan=await f.service.sources.plan({projectId:p.id,expectedRevision:p.revision,kind:'website',url:'https://example.com/'},context);const source=plan.source;const observed=await f.service.sources.finishVersion(plan.project,source,[{id:'xc-host-fixture',projectId:p.id,pageId:source.pages[0].id,stateId:source.pages[0].states[0].id,viewportId:source.viewports[0].id,html,nodes:[{id:'hero',tag:'h1',text:'Original',attrs:{},layout:{x:0,y:0,width:300,height:100}}],resources:[],status:'observed',failures:[]}],context);const clone=await f.service.execute({action:'project.clone',projectId:p.id,expectedRevision:observed.projectRevision,name:'Source copy'},env);const read=await f.service.execute({action:'workbench.source.read',projectId:clone.project.id,sourceId:source.id,versionId:observed.version.id,captureId:'xc-host-fixture'},env);assert.equal(read.capture.projectId,clone.project.id);assert.ok(read.capture.html.includes('Original'));assert.notEqual(clone.project.id,p.id);
});

// Domain integration: real DesignerService/Store/AIWorkbench/Editor, native boundary doubles.
// These checks do not accept the installed GUI, native Fs/Shell or an actual model run.
async function sourceGenerationFixture({twoPages=false}={}){
  const f=fixture(),p=await f.project(),made=await f.page(p);let project=made.project;let second;
  if(twoPages){second=await f.service.execute({action:'page.create',projectId:p.id,designId:made.page.designId,expectedRevision:project.revision,name:'Second output',html},env);project=second.project;}
  await f.service.initialize();const context={user:true,policy},plan=await f.service.sources.plan({projectId:p.id,expectedRevision:project.revision,kind:'files'},context),observed=await f.service.sources.finishVersion(plan.project,plan.source,[{id:'xc-generation-domain',pageId:plan.source.pages[0].id,stateId:'export',viewportId:'export',html,nodes:[{id:'hero',tag:'h1',text:'Original'}],resources:[],status:'exported-html',failures:[]}],context);
  const target=twoPages?{scope:'design',designId:made.page.designId,pageIds:[made.page.id,second.page.id]}:{scope:'page',pageId:made.page.id};const generation=await f.service.execute({action:'workbench.source.generate',projectId:p.id,sourceId:plan.source.id,versionId:observed.version.id,expectedRevision:observed.projectRevision,target},env);return {f,p,made,second,plan,generation,agent:f.agents.get(generation.ai.sessionId)};
}

test('domain: actual source commit receipts and explicit visual/interaction reviews remain separate',async()=>{
  const {f,p,made,plan,generation,agent}=await sourceGenerationFixture();assert.ok(generation.state.taskId);assert.ok(generation.state.requestId);assert.equal(generation.state.outputStatus,'none');const writes=f.fs.writes.length;let open=await f.service.execute({action:'workspace.open',projectId:p.id},env),state=open.project.workbench.sourceImports[0].generation;assert.equal(state.generation,'running');assert.equal(state.visualReview,'pending');assert.equal(f.fs.writes.length,writes);
  const basis=await f.service.editor.read(p.id,made.page.id,env),changed=applyDocumentOperations(basis.document.html,[{type:'text',nodeIds:['hero'],value:'Source result'}]);const commit=await f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.page.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,html:changed.html},{agent});const raw=(await f.service.store.projectGet(p.id)).project.workbench.sourceImports[0].generation;assert.deepEqual(raw.savedPageIds,[made.page.id]);assert.equal(raw.savedPages[0].contentHash,hash(changed.html));assert.equal(raw.savedPages[0].requestId,generation.ai.requestId);
  let revision=commit.projectRevision;const review={action:'workbench.source.review',projectId:p.id,sourceId:plan.source.id,expectedRevision:revision,taskId:generation.ai.taskId,requestId:generation.ai.requestId,kind:'visual',outcome:'passed',pageIds:[made.page.id],evidence:{note:'Compared heading, spacing and footer against the captured export at the saved viewport'}};
  await assert.rejects(f.service.execute({...review,evidence:{note:' '}},env),{code:'INVALID_INPUT'});await assert.rejects(f.service.execute({...review,taskId:'wrong-task'},env),{code:'SOURCE_REVIEW_CONFLICT'});await assert.rejects(f.service.execute(review,{agent}),{code:'USER_ONLY'});
  const visual=await f.service.execute(review,env);assert.equal(visual.source.generation.visualReview,'passed');assert.equal(visual.source.generation.interactionVerification,'pending');assert.equal(visual.review.method,'user-attestation');revision=visual.projectRevision;
  const interaction=await f.service.execute({...review,expectedRevision:revision,kind:'interaction',outcome:'failed',evidence:{note:'Clicked the saved dialog trigger; the expected dialog did not open'}},env);assert.equal(interaction.source.generation.visualReview,'passed');assert.equal(interaction.source.generation.interactionVerification,'failed');
  await f.service.execute({action:'ai.cancel',projectId:p.id},env);open=await f.service.execute({action:'workspace.open',projectId:p.id},env);state=open.project.workbench.sourceImports[0].generation;assert.equal(state.generation,'cancelled');assert.equal(state.outputStatus,'saved');assert.deepEqual(state.savedPageIds,[made.page.id]);
  const current=await f.service.editor.read(p.id,made.page.id,env);await f.service.execute({action:'artboard.commit',projectId:p.id,artboardId:made.page.id,expectedRevision:current.projectRevision,expectedArtboardRevision:current.page.revision,html:applyDocumentOperations(current.document.html,[{type:'text',nodeIds:['hero'],value:'Later user edit'}]).html},env);const latest=await f.service.execute({action:'workspace.open',projectId:p.id},env);assert.equal(latest.project.workbench.sourceImports[0].generation.visualReview,'stale');await assert.rejects(f.service.execute({...review,expectedRevision:latest.projectRevision},env),{code:'SOURCE_REVIEW_CONFLICT'});
});

test('domain: exact failed native source task retains partial saves and completed empty task has no output',async()=>{
  const {f,p,made,generation,agent}=await sourceGenerationFixture({twoPages:true});const basis=await f.service.editor.read(p.id,made.page.id,env);await f.service.execute({action:'edit.apply',projectId:p.id,pageId:made.page.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,operations:[{type:'text',nodeIds:['hero'],value:'First page saved'}]},{agent});const turn=agent.session.events.findLast(e=>e.type==='turn/start').data.turn;agent.status='idle';agent.session.append('turn/end',{turn:turn+99,reason:{kind:'completed'}});let open=await f.service.execute({action:'workspace.open',projectId:p.id},env);assert.equal(open.project.workbench.sourceImports[0].generation.generation,'unknown');agent.session.append('turn/end',{turn,reason:{kind:'error',error:{code:'DOMAIN_FAILURE',message:'Native boundary test error'}}});open=await f.service.execute({action:'workspace.open',projectId:p.id},env);let state=open.project.workbench.sourceImports[0].generation;assert.equal(state.generation,'failed');assert.equal(state.outputStatus,'partial');assert.deepEqual(state.savedPageIds,[made.page.id]);assert.equal(state.requestId,generation.ai.requestId);assert.equal(state.visualReview,'pending');
  const empty=await sourceGenerationFixture(),endTurn=empty.agent.session.events.findLast(e=>e.type==='turn/start').data.turn;empty.agent.status='idle';empty.agent.session.append('turn/end',{turn:endTurn,reason:{kind:'completed'}});const noOutput=await empty.f.service.execute({action:'workspace.open',projectId:empty.p.id},env);state=noOutput.project.workbench.sourceImports[0].generation;assert.equal(state.generation,'completed');assert.equal(state.outputStatus,'none');assert.deepEqual(state.savedPageIds,[]);assert.equal(state.visualReview,'pending');
});

test('domain: both native page creation APIs record actual source outputs without inventing target coverage',async()=>{
  const f=fixture(),p=await f.project(),design=await f.service.execute({action:'design.create',projectId:p.id,expectedRevision:p.revision,name:'Empty generated design'},env),empty=await f.service.execute({action:'page.delete',projectId:p.id,pageId:design.page.id,expectedRevision:design.projectRevision},env);await f.service.initialize();const context={user:true,policy},plan=await f.service.sources.plan({projectId:p.id,expectedRevision:empty.projectRevision,kind:'files'},context),observed=await f.service.sources.finishVersion(plan.project,plan.source,[{id:'xc-new-page-domain',pageId:plan.source.pages[0].id,stateId:'export',viewportId:'export',html,nodes:[],resources:[],status:'exported-html',failures:[]}],context),run=await f.service.execute({action:'workbench.source.generate',projectId:p.id,sourceId:plan.source.id,versionId:observed.version.id,expectedRevision:observed.projectRevision,target:{scope:'design',designId:design.design.id}},env),agent=f.agents.get(run.ai.sessionId);
  const first=await f.service.execute({action:'page.create',projectId:p.id,designId:design.design.id,expectedRevision:run.projectRevision,name:'First generated page',html},{agent});const second=await f.service.execute({action:'artboard.create',projectId:p.id,designId:design.design.id,expectedRevision:first.projectRevision,name:'Second generated page',html},{agent});const open=await f.service.execute({action:'workspace.open',projectId:p.id},env),generation=open.project.workbench.sourceImports[0].generation;assert.deepEqual(new Set(generation.savedPageIds),new Set([first.page.id,second.page.id]));assert.ok(generation.savedPages.every(r=>r.requestId===run.ai.requestId&&r.taskId===run.ai.taskId&&r.contentHash));assert.equal(generation.outputStatus,'partial');assert.equal(generation.coverageKnown,false);assert.equal(second.artboard.lastTaskCommit.requestId,run.ai.requestId);
});

test('domain: review subset cannot pass all saved outputs and external byte drift invalidates review',async()=>{
  const {f,p,made,second,plan,generation,agent}=await sourceGenerationFixture({twoPages:true});for(const page of [made.page,second.page]){const basis=await f.service.editor.read(p.id,page.id,env);await f.service.execute({action:'edit.apply',projectId:p.id,pageId:page.id,expectedRevision:basis.projectRevision,expectedArtboardRevision:basis.page.revision,operations:[{type:'text',nodeIds:['hero'],value:'Domain output '+page.id}]},{agent});}
  let current=await f.service.execute({action:'workspace.open',projectId:p.id},env);const args={action:'workbench.source.review',projectId:p.id,sourceId:plan.source.id,taskId:generation.ai.taskId,requestId:generation.ai.requestId,kind:'visual',outcome:'passed',evidence:{note:'Domain user-attestation fixture for this exact saved page'}};const subset=await f.service.execute({...args,expectedRevision:current.projectRevision,pageIds:[made.page.id]},env);assert.equal(subset.source.generation.visualReview,'pending');assert.equal(subset.source.generation.reviewCoverage.visual.passed,1);assert.equal(subset.source.generation.reviewCoverage.visual.saved,2);const all=await f.service.execute({...args,expectedRevision:subset.projectRevision,pageIds:[second.page.id]},env);assert.equal(all.source.generation.visualReview,'passed');assert.equal(all.source.generation.interactionVerification,'pending');
  current=(await f.service.store.projectGet(p.id)).project;const page=current.artboards.find(p=>p.id===made.page.id),target=await f.service.store.target('projects/'+p.id+'/'+page.htmlPath);const old=f.fs.files.get(target.targetKey);f.fs.files.set(target.targetKey,{bytes:Buffer.from(old.bytes.toString().replace('Domain output','External edit')),version:'external-byte-drift'});const stale=await f.service.execute({action:'workspace.open',projectId:p.id},env);assert.equal(stale.project.workbench.sourceImports[0].generation.visualReview,'stale');assert.equal(stale.project.workbench.sourceImports[0].generation.reviewCoverage.visual.current,1);
});

test('tool-safe output retains optional node fields while removing capabilities and binary encodings',()=>{
  const value=modelSafe({node:{id:'a',slot:'title',instanceId:'card',attributes:{class:'title'}},bytesBase64:'c2VjcmV0',assetBase:'/api/designer/resource/secret/',url:'http://local/api/designer/source-resource/secret/project/src/a.js',preview:'data:image/png;base64,c2VjcmV0',tokens:{color:'#123'}});assert.equal(value.bytesBase64,undefined);assert.equal(value.assetBase,undefined);assert.ok(!JSON.stringify(value).includes('secret'));assert.equal(value.node.slot,'title');assert.equal(value.tokens.color,'#123');
});
