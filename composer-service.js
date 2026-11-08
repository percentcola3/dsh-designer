import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail,text} from './store.js';
import {projectPolicy} from './project-policy.js';
import {ExactSessionAgents} from './client-session.js';
import {migrateLegacyTaskDisplayTitle} from './ai-adapter.js';

function projectId(value){if(typeof value!=='string'||!/^p-[a-zA-Z0-9-]{1,100}$/.test(value))fail('INVALID_ID','A project identifier is required');return value;}
function revision(expected,project){if(!Number.isSafeInteger(expected)||expected!==project.revision)fail('VERSION_CONFLICT','Reload project metadata before adopting the composer',{expectedRevision:expected??null,currentRevision:project.revision});}

/** Native session preparation only. Model admission remains in the existing AI workbench. */
export class ComposerService {
  #records=new Map();
  #libraries=new Map();
  #preparingLibraries=new Map();
  #queue=Promise.resolve();
  constructor(owner){if(!owner?.store||!owner.ctx?.fs)throw new TypeError('ComposerService requires the Designer store');this.owner=owner;this.closed=false;}
  get sessions(){return this.owner.sessionAgents??=new ExactSessionAgents(this.owner);}
  check(env){if(env?.user!==true||env.agent)fail('USER_ONLY','Composer sessions require an explicit owner action');if(this.closed||this.owner.disposed)fail('SERVICE_DISPOSED','The composer service stopped');env.signal?.throwIfAborted();}
  async identity(env){this.check(env);const store=this.owner.store,target=await store.target('',env.signal),root=this.owner.ctx.fs.processPath(target);this.check(env);if(typeof root!=='string'||!path.isAbsolute(root))fail('COMPOSER_ROOT_CHANGED','The designer library has no physical root');return {store,root,configuredRoot:store.root,workspaceRoot:store.workspaceRoot};}
  async verify(record,env){const current=await this.identity(env);if(!record||Object.keys(current).some(key=>current[key]!==record.identity[key]))fail('COMPOSER_ROOT_CHANGED','The composer belongs to a different designer library');return current;}
  async project(id,env){projectId(id);const p=await this.owner.workbench.project(id,env.signal);this.check(env);if(p.deletedAt)fail('NOT_FOUND','Project is in the recycle bin');return p;}
  async prepare(input={},env={}){
    this.check(env);
    if(!this.owner.ctx.agents||!this.owner.ctx.sessionController)fail('NATIVE_SESSION_UNAVAILABLE','Native session services are unavailable');
    if(input.scope!==undefined){if(input.scope!=='library'||input.projectId!==undefined||input.sessionId!==undefined)fail('INVALID_INPUT','Choose one composer scope');return this.prepareLibrary(env);}
    if(input.sessionId!==undefined&&input.projectId===undefined){const existing=await this.resolve(input.sessionId,env);return {sessionId:existing.sessionId};}
    if(input.projectId!==undefined){const p=await this.project(input.projectId,env),sessionId=p.aiSessionId||`designer-${p.id}`;const prepared=await this.owner.projectAgent({...p,aiSessionId:sessionId},env.signal,env.policy,{readonly:true});this.check(env);migrateLegacyTaskDisplayTitle(this.owner,prepared.agent,p);return {sessionId:prepared.sessionId,projectId:p.id,projectRevision:p.revision};}
    const identity=await this.identity(env),sessionId=`designer-compose-${randomUUID()}`;
    if(!this.owner.designerPreset)fail('NATIVE_PRESET_UNAVAILABLE','Designer needs an existing native tool preset');
    const handle=await this.owner.ctx.agents.create({sessionId,meta:{cwd:identity.root,agentPreset:this.owner.designerPreset},agentOptions:this.owner.ctx.agentDefaultModel.currentSelection(),signal:env.signal,setup:(_ctx,agent)=>{agent.session.append('sandbox/mode',{mode:env.policy?.mode==='danger-full-access'?'workspace-write':env.policy?.mode||'read-only'});}});
    this.owner.ctx.effect(()=>()=>handle.dispose());
    if(handle.agent?.id!==sessionId)fail('COMPOSER_SESSION_INVALID','Native session creation returned a different session');
    const record={identity,agent:handle.agent,sessionId,projectId:null};await this.verify(record,env);this.#records.set(sessionId,record);return {sessionId};
  }
  async prepareLibrary(env){
    const identity=await this.identity(env),sourceSessionId=env.permissionAgent?.id||null;
    if(sourceSessionId&&(this.owner.bindings.has(sourceSessionId)||this.#records.get(sourceSessionId)?.kind==='library'))fail('PROJECT_SCOPE','Prepare the library from its initiating owner context, not a project Session');
    const key=sourceSessionId||'default',existing=this.#libraries.get(key);
    if(existing){await this.resolve(existing.sessionId,env);return {sessionId:existing.sessionId,scope:'library'};}
    if(this.#preparingLibraries.has(key))return this.#preparingLibraries.get(key);
    const pending=(async()=>{
      if(!this.owner.designerPreset)fail('NATIVE_PRESET_UNAVAILABLE','Designer needs an existing native tool preset');
      const sessionId=`designer-library-${randomUUID()}`;
      const handle=await this.owner.ctx.agents.create({sessionId,meta:{cwd:identity.root,agentPreset:this.owner.designerPreset},agentOptions:this.owner.ctx.agentDefaultModel.currentSelection(),signal:env.signal,setup:(_ctx,agent)=>{agent.session.append('sandbox/mode',{mode:env.policy?.mode==='danger-full-access'?'workspace-write':env.policy?.mode||'read-only'});}});
      this.owner.ctx.effect(()=>()=>handle.dispose());
      if(handle.agent?.id!==sessionId)fail('COMPOSER_SESSION_INVALID','Native session creation returned a different session');
      const record={identity,agent:handle.agent,sessionId,projectId:null,kind:'library',sourceSessionId};
      await this.verify(record,env);this.#records.set(sessionId,record);this.#libraries.set(key,record);
      return {sessionId,scope:'library'};
    })();
    this.#preparingLibraries.set(key,pending);
    try{return await pending;}finally{if(this.#preparingLibraries.get(key)===pending)this.#preparingLibraries.delete(key);}
  }
  async libraryPolicy(agent,signal){
    const record=this.#records.get(agent?.id);
    if(record?.kind!=='library'){if(typeof agent?.id==='string'&&agent.id.startsWith('designer-library-'))fail('COMPOSER_SESSION_NOT_FOUND','Prepare a library context in the current service before continuing');return null;}
    const env={user:true,signal};await this.verify(record,env);
    let source;
    if(record.sourceSessionId){
      if(this.owner.bindings.has(record.sourceSessionId))fail('PROJECT_SCOPE','The initiating owner context became a project Session');
      source=await this.sessions.resolve(record.sourceSessionId,{signal});this.check(env);
    }
    const policy=await projectPolicy(this.owner.ctx.fs,this.owner.policy(agent),record.identity.root,signal);
    // The original owner may revoke permission after preparation. No copied mode
    // or newly prepared identity can undo that revocation, including shell work.
    if(this.owner.policy(source).mode==='read-only')return {...policy,mode:'read-only'};
    return policy;
  }
  async resolve(sessionId,env={}){
    this.check(env);text(sessionId,'sessionId',200);const record=this.#records.get(sessionId);if(!record)fail('COMPOSER_SESSION_NOT_FOUND','Prepare a composer in the current designer library first');await this.verify(record,env);const agent=await this.sessions.resolve(record.sessionId,{signal:env.signal});this.check(env);await this.verify(record,env);record.agent=agent;return {agent,sessionId:record.sessionId};
  }
  async adopt(input={},env={}){
    this.check(env);projectId(input.projectId);text(input.sessionId,'sessionId',200);
    // Serialize across both projects and composer sessions; also join the workbench's project lock.
    const operation=this.#queue.then(()=>{this.check(env);const run=()=>this.adoptProject(input,env);return this.owner.workbench.exclusive?this.owner.workbench.exclusive(input.projectId,run):run();});this.#queue=operation.catch(()=>{});return operation;
  }
  async adoptProject(input,env){
    const p=await this.project(input.projectId,env),record=this.#records.get(input.sessionId);
    if(record){await this.verify(record,env);if(record.kind==='library')fail('SESSION_CONFLICT','A shared-library Session cannot be adopted by a project');if(record.projectId&&record.projectId!==p.id)fail('SESSION_CONFLICT','This composer is already bound to another project');}
    if(p.aiSessionId&&p.aiSessionId!==input.sessionId)fail('SESSION_CONFLICT','Project already has a different AI context');
    if(!record&&p.aiSessionId!==input.sessionId)fail('COMPOSER_SESSION_NOT_FOUND','Only a prepared composer can be adopted');
    // A persisted exact binding may be retried after a service restart, without changing metadata.
    if(p.aiSessionId!==input.sessionId){revision(input.expectedRevision,p);if(!env.policy)fail('POLICY_REQUIRED','Adopting a composer requires the initiating sandbox policy');}
    const agent=await this.sessions.resolve(input.sessionId,{signal:env.signal});this.check(env);if(record)record.agent=agent;
    if(agent.id!==input.sessionId)fail('COMPOSER_SESSION_INVALID','The native session does not match the saved binding');
    const bound=this.owner.bindings.get(input.sessionId);if(bound&&bound!==p.id)fail('SESSION_CONFLICT','The native session belongs to another project');
    if(record)await this.verify(record,env);else await this.identity(env);
    const project=p.aiSessionId===input.sessionId?p:await this.owner.store.bindSession(p.id,input.sessionId,env.signal,env.policy,input.expectedRevision);
    // Mark immediately after persistence, even if cancellation interrupts restoration.
    if(record)record.projectId=p.id;this.owner.bindings.set(input.sessionId,p.id);
    this.owner.installAgent(agent,p.id);await this.owner.restoreAgent(agent,project,env.signal);this.check(env);
    return {project,sessionId:input.sessionId,projectRevision:project.revision};
  }
  dispose(){this.closed=true;this.#records.clear();this.#libraries.clear();this.#preparingLibraries.clear();this.#queue=Promise.resolve();}
}
