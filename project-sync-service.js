import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fail,text,policyAllowsTarget} from './store.js';
import {BuiltinGitEngine} from './builtin-git-engine.js';
import {parseGitRemote} from './git-ssh-transport.js';
import {buildPortableProject,validatePortableProject,portableProjectMetadata,PORTABLE_MANIFEST_PATH} from './portable-project.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const user=env=>{if(env.user!==true||env.agent)fail('USER_ONLY','项目同步需要用户明确操作。');};
const cas=(project,expected)=>{if(!Number.isSafeInteger(expected)||expected!==project.revision)fail('VERSION_CONFLICT','项目已变化，请刷新后重试。',{currentRevision:project.revision});};
const within=(value,root)=>value===root||value.startsWith(root+'/');
function relative(value){if(typeof value!=='string'||!value||value.length>1000||value.includes('\\')||value.includes('\0')||path.posix.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[\x00-\x1f\x7f]/.test(p)))fail('INVALID_PATH','请使用仓库内的普通相对目录。');return value;}
function branchName(value){text(value,'branch',200);if(value.startsWith('-')||value==='HEAD'||value.endsWith('/')||value.endsWith('.')||value.includes('..')||value.includes('@{')||/[\x00-\x20\x7f~^:?*\[\\]/.test(value)||value.split('/').some(v=>!v||v.startsWith('.')||v.endsWith('.lock')))fail('INVALID_BRANCH','分支名无效。');return value;}
function remoteValue(value){const parsed=parseGitRemote(value);if(parsed.type==='http'&&!['127.0.0.1','localhost','::1'].includes(parsed.host))fail('INSECURE_REMOTE','远端仓库请使用 HTTPS 或 SSH。');return value.trim();}
function signature(snapshot){if(!snapshot)return null;const project=clone(snapshot.manifest.project);for(const key of ['id','revision','createdAt','updatedAt'])delete project[key];return hash(JSON.stringify(stable({project,systems:snapshot.manifest.systems,files:snapshot.manifest.files.map(f=>({path:f.path,sha256:f.sha256,byteLength:f.byteLength})).sort((a,b)=>a.path.localeCompare(b.path))})));}
function changes(current,before){const a=new Map((before?.manifest.files||[]).map(f=>[f.path,f.sha256])),b=new Map(current.manifest.files.map(f=>[f.path,f.sha256])),result=[];for(const key of [...new Set([...a.keys(),...b.keys()])].sort()){if(a.get(key)!==b.get(key))result.push({path:key,status:!a.has(key)?'added':!b.has(key)?'deleted':'modified'});}if(signature(current)!==signature(before)&&!result.some(f=>f.path===PORTABLE_MANIFEST_PATH))result.unshift({path:PORTABLE_MANIFEST_PATH,status:before?'modified':'added'});return result;}
function decode(snapshot){if(!snapshot?.files?.length)return null;return validatePortableProject({files:snapshot.files.map(file=>({path:file.path,bytes:Buffer.from(file.bytesBase64,'base64')}))});}
function bindingKey(binding){return hash(JSON.stringify([binding.repositoryUrl,binding.branch,binding.projectPath]));}
const capabilities=Object.freeze({builtin:true,gitInstalledNotRequired:true,https:true,ssh:true,forcePush:false,fastForwardOnly:true});
export const SYNC_ACTIONS={
  'sync.get':{},'sync.status':{fetch:'optional; update remote tracking only'},'sync.detect':{},
  'sync.test':{repositoryUrl:'draft URL',branch:'draft branch',authProfileId:'optional SSH profile',httpsToken:'optional HTTPS token'},
  'sync.branches':{repositoryUrl:'optional draft URL'},'sync.save':{expectedRevision:'required',repositoryUrl:'HTTPS or SSH',branch:'required',projectPath:'isolated repository directory',author:'{name,email}',authProfileId:'optional',autoCheck:'default false',httpsToken:'optional secret; never returned'},
  'sync.unbind':{expectedRevision:'required'},'sync.check':{},'sync.commit':{expectedRevision:'required',message:'required'},'sync.pull':{expectedRevision:'required',allowInitialImport:'explicit confirmation for first remote project import'},'sync.push':{expectedRevision:'required'},'sync.sync':{expectedRevision:'required',message:'required'}
};

/** A Git mirror contains only Git state; live files change only after validated append-only import. */
export class ProjectSyncService{
  constructor(owner,{engine}={}){this.owner=owner;this.fs=owner.ctx.fs;this.engine=engine||new BuiltinGitEngine(owner);this.locks=new Map();}
  async exclusive(id,fn){const before=this.locks.get(id)||Promise.resolve(),run=before.catch(()=>{}).then(fn);this.locks.set(id,run);try{return await run;}finally{if(this.locks.get(id)===run)this.locks.delete(id);}}
  async project(id,signal){const p=await this.owner.workbench.project(id,signal);if(p.deletedAt)fail('PROJECT_UNAVAILABLE','请先恢复项目。');return p;}
  binding(project){const b=project.workbench?.sync;return b?.repositoryUrl?clone(b):null;}
  tokenKey(project,binding){return 'dsh-designer:git-https:'+hash(this.owner.store.root+'\0'+project.id+'\0'+binding.repositoryUrl);}
  async tokenRecord(project,binding){return this.owner.ctx.credentials?.readRecord?.(this.tokenKey(project,binding));}
  async publicBinding(project){const b=this.binding(project);if(!b)return null;const saved=await this.tokenRecord(project,b);return {...b,hasHttpsToken:!!saved?.payload?.token};}
  async credentials(project,binding,draft={}){
    const parsed=parseGitRemote(binding.repositoryUrl);
    if(parsed.type==='ssh'){
      if(!binding.authProfileId)fail('SSH_PROFILE_REQUIRED','请先选择并信任 SSH 配置。');
      const profile=await this.owner.sshProfiles.resolveProfile(binding.authProfileId);
      if(profile.host!==parsed.host||profile.port!==parsed.port||parsed.username&&profile.username!==parsed.username)fail('SSH_PROFILE_MISMATCH','SSH 配置与仓库主机、端口或账号不一致。');
      return profile;
    }
    const record=await this.tokenRecord(project,binding),token=draft.httpsToken||record?.payload?.token;
    return token?{username:draft.httpsUsername||binding.httpsUsername||'git',password:token}:undefined;
  }
  draftBinding(project,input){const old=this.binding(project)||{},repositoryUrl=remoteValue(input.repositoryUrl||old.repositoryUrl||''),branch=branchName(input.branch||old.branch||'main'),projectPath=relative(input.projectPath||old.projectPath||`designer-projects/${project.id}`),author=input.author||old.author||{};return {schemaVersion:1,repositoryUrl,branch,projectPath,author:{name:String(author.name||'').trim(),email:String(author.email||'').trim()},authProfileId:input.authProfileId===null?null:input.authProfileId||old.authProfileId||null,httpsUsername:input.httpsUsername||old.httpsUsername||'git',autoCheck:input.autoCheck===undefined?old.autoCheck===true:input.autoCheck===true};}
  async writable(project,env){if(project.archived)fail('PROJECT_UNAVAILABLE','请先恢复项目。');const root=await this.owner.store.target(`projects/${project.id}`,env.signal);if(!await policyAllowsTarget(this.fs,env.policy,root,env.signal))fail('FS_SANDBOX_DENIED','当前原生权限不允许修改项目。');}
  async quiet(project,env){const drafts=await this.owner.workbench.hasUnsavedDrafts(project.id,{signal:env.signal}),resources=(drafts.resources||[]).filter(r=>r.resourceId!=='ai-compose');if(resources.length)fail('UNSAVED_DRAFTS','请先保存或处理项目文件草稿。',{resources});const state=await this.owner.aiStatus?.(project.id,env.signal);if(state?.running)fail('AI_BUSY','AI 正在修改此项目，请完成或停止后同步。');}
  async state(project,env){const saved=await this.owner.store.read(`projects/${project.id}/.workbench/git-sync/state.json`,env.signal,true);if(!saved)return {version:null,value:{}};let value;try{value=JSON.parse(saved.content);}catch{fail('INVALID_DOCUMENT','同步状态文件损坏，请保留项目并检查。');}return {version:saved.version,value};}
  async saveState(project,patch,env){const current=await this.state(project,env);await this.owner.store.write(`projects/${project.id}/.workbench/git-sync/state.json`,JSON.stringify({...current.value,...patch}),current.version,env.signal,env.policy);}
  async run(operation,project,binding,env,extra={}){return this.engine.run(operation,{projectId:project.id,branch:binding.branch,remoteUrl:binding.repositoryUrl,scopePrefix:binding.projectPath,...extra},env);}
  async mirror(project,binding,env){const status=await this.run('status',project,binding,env);return status;}
  async init(project,binding,env){let state=await this.mirror(project,binding,env);state=await this.run('init',project,binding,env,{expectedHead:state.head??null});return state;}
  async read(project,binding,env,ref='head'){return decode(await this.run('readSnapshot',project,binding,env,{ref}));}
  async status(project,binding,env,{fetch=false}={}){
    if(!binding)return {projectRevision:project.revision,capabilities,binding:null,status:{branch:null,head:null,changes:[],dirty:false,ahead:0,behind:0,conflicts:[]}};
    if(fetch)await this.writable(project,env);
    let mirror=fetch?await this.init(project,binding,env):await this.mirror(project,binding,env),saved=await this.state(project,env);
    if(fetch){await this.writable(project,env);const credentials=await this.credentials(project,binding);mirror=await this.run('fetch',project,binding,env,{expectedHead:mirror.head??null,credentials});await this.saveState(project,{bindingKey:bindingKey(binding),checkedAt:new Date().toISOString()},env);saved=await this.state(project,env);}
    const before=mirror.head?await this.read(project,binding,env):null,current=await buildPortableProject(this.owner,project.id,{...env,expectedRevision:project.revision}),delta=changes(current,before);
    return {projectRevision:project.revision,binding:await this.publicBinding(project),capabilities,status:{branch:binding.branch,head:mirror.head??null,remoteHead:mirror.remoteHead??null,changes:delta,dirty:delta.length>0,ahead:mirror.ahead||0,behind:mirror.behind||0,conflicts:mirror.ahead>0&&mirror.behind>0?['branches-diverged']:[],checkedAt:saved.value.bindingKey===bindingKey(binding)?saved.value.checkedAt||null:null,initialImportPending:saved.value.bindingKey!==bindingKey(binding)||saved.value.initializedBusiness!==true}};
  }
  async execute(input,env={}){user(env);if(!SYNC_ACTIONS[input.action])fail('UNKNOWN_ACTION','未知项目同步操作。');return this.exclusive(input.projectId,()=>this.operation(input,env));}
  async operation(input,env){let project=await this.project(input.projectId,env.signal),binding=this.binding(project);env.signal?.throwIfAborted();
    if(input.action==='sync.detect'){const detected=await this.engine.run('detect',{projectId:project.id},env);return {detected,capabilities,binding:await this.publicBinding(project)};}
    if(input.action==='sync.test'||input.action==='sync.branches'){
      const draft=this.draftBinding(project,input),credentials=await this.credentials(project,draft,input),result=await this.run('probe',project,draft,env,{credentials});return {...result,reachable:result.reachable===true,capabilities};
    }
    if(input.action==='sync.save'){
      cas(project,input.expectedRevision);await this.writable(project,env);const next=this.draftBinding(project,input);text(next.author.name,'author name',200);text(next.author.email,'author email',320);if(!/^[^\s@]+@[^\s@]+$/.test(next.author.email))fail('INVALID_AUTHOR','请填写有效的 Git 提交邮箱。');
      if(next.authProfileId)await this.credentials(project,next,input);
      const credentialStore=this.owner.ctx.credentials,credentialKey=this.tokenKey(project,next),before=await credentialStore?.readRecord?.(credentialKey),changeToken=input.clearHttpsToken===true||typeof input.httpsToken==='string'&&input.httpsToken.length>0;
      if(changeToken){if(!credentialStore?.modifyRecord)fail('CREDENTIALS_UNAVAILABLE','原生凭据服务不可用。');if(input.clearHttpsToken)await credentialStore.deleteRecord(credentialKey);else await credentialStore.modifyRecord(credentialKey,async()=>({kind:'grant',payload:{token:input.httpsToken}}));}
      try{const saved=await this.owner.store.mutate(project.id,project.revision,'Bind project Git repository',p=>{p.workbench||={};p.workbench.sync={...p.workbench.sync,...next,updatedAt:new Date().toISOString()};},env.signal,env.policy,false);project=saved;}catch(error){if(changeToken){if(before)await credentialStore.modifyRecord(credentialKey,async()=>before);else await credentialStore.deleteRecord(credentialKey);}throw error;}
      return {project,projectRevision:project.revision,binding:await this.publicBinding(project),capabilities};
    }
    if(input.action==='sync.unbind'){cas(project,input.expectedRevision);await this.writable(project,env);project=await this.owner.store.mutate(project.id,project.revision,'Unbind project Git repository',p=>{const old=p.workbench?.sync||{};p.workbench.sync={portablePrefix:old.portablePrefix,systemMap:old.systemMap};},env.signal,env.policy,false);return {project,projectRevision:project.revision,binding:null,capabilities};}
    if(input.action==='sync.get'||input.action==='sync.status'||input.action==='sync.check')return this.status(project,binding,env,{fetch:input.fetch===true||input.action==='sync.check'});
    if(!binding)fail('SYNC_NOT_CONFIGURED','请先绑定仓库与分支。');cas(project,input.expectedRevision);await this.writable(project,env);await this.quiet(project,env);
    if(input.action==='sync.commit'||input.action==='sync.sync')text(input.message,'commit message',10000);
    let mirror=await this.init(project,binding,env),credentials=await this.credentials(project,binding),saved=await this.state(project,env);
    if(input.action==='sync.pull'||input.action==='sync.sync'||!mirror.head){mirror=await this.run('fetch',project,binding,env,{expectedHead:mirror.head??null,credentials});await this.saveState(project,{bindingKey:bindingKey(binding),checkedAt:new Date().toISOString()},env);}
    let remote=mirror.remoteHead?await this.read(project,binding,env,'remote'):null,current=await buildPortableProject(this.owner,project.id,{...env,expectedRevision:project.revision}),before=mirror.head?await this.read(project,binding,env):null;
    const initialized=saved.value.bindingKey===bindingKey(binding)&&saved.value.initializedBusiness===true;
    if(!initialized&&remote){if(input.action==='sync.commit'||input.action==='sync.push')fail('SYNC_REMOTE_PROJECT_EXISTS','仓库内已有项目，请先拉取并确认导入。');if(!input.allowInitialImport)fail('SYNC_INITIAL_IMPORT_CONFIRMATION_REQUIRED','该目录已有远端项目。确认导入后，当前已保存版本会保留在历史中。',{repositoryUrl:binding.repositoryUrl,branch:binding.branch,projectPath:binding.projectPath});}
    if(mirror.ahead>0&&mirror.behind>0)fail('SYNC_DIVERGED','本地与远端分支已分叉。请保留本地内容，使用新分支或先另存副本；不会强制覆盖。',{head:mirror.head,remoteHead:mirror.remoteHead});
    if(input.action==='sync.pull'||input.action==='sync.sync'){
      if(!remote){if(input.action==='sync.pull')fail('SYNC_REMOTE_PROJECT_MISSING','远端选定目录尚无 Designer 项目。');}
      else if(!initialized||mirror.behind>0){
        const remoteProjectChanged=signature(remote)!==signature(before);
        if(initialized&&remoteProjectChanged&&signature(current)!==signature(before)&&signature(current)!==signature(remote))fail('SYNC_LOCAL_CHANGES','本地与远端都有项目修改，不能直接覆盖。请先保存副本或提交到新分支。');
        if((!initialized||remoteProjectChanged)&&signature(current)!==signature(remote))project=await this.apply(project,remote,binding,env);
        mirror=await this.run('fastForward',project,binding,env,{expectedHead:mirror.head??null});await this.saveState(project,{bindingKey:bindingKey(binding),initializedBusiness:true,appliedHead:mirror.head,checkedAt:new Date().toISOString()},env);current=await buildPortableProject(this.owner,project.id,{...env,expectedRevision:project.revision});before=remote;
      }
      if(input.action==='sync.pull')return {project,projectRevision:project.revision,...await this.status(project,binding,env)};
    }
    if(input.action==='sync.commit'||input.action==='sync.sync'){
      if(!mirror.head&&mirror.remoteHead){mirror=await this.run('fastForward',project,binding,env,{expectedHead:null});before=remote;}
      if(signature(current)!==signature(before))mirror=await this.run('commit',project,binding,env,{expectedHead:mirror.head??null,message:input.message,author:binding.author,files:current.files.map(f=>({path:f.path,bytesBase64:Buffer.from(f.bytes).toString('base64')}))});
      else if(input.action==='sync.commit')fail('NO_CHANGES','项目没有需要提交的变化。');
      await this.saveState(project,{bindingKey:bindingKey(binding),initializedBusiness:true,committedHead:mirror.head},env);
      if(input.action==='sync.commit')return {project,projectRevision:project.revision,...await this.status(project,binding,env)};
    }
    if(input.action==='sync.push'||input.action==='sync.sync'){
      before=mirror.head?await this.read(project,binding,env):null;if(signature(current)!==signature(before))fail('SYNC_UNCOMMITTED_CHANGES','请先提交当前项目，再推送到云端。');
      await this.run('push',project,binding,env,{expectedHead:mirror.head??null,credentials});await this.saveState(project,{bindingKey:bindingKey(binding),initializedBusiness:true,pushedHead:mirror.head,checkedAt:new Date().toISOString()},env);
      return {project,projectRevision:project.revision,...await this.status(project,binding,env)};
    }
    fail('UNKNOWN_ACTION','未知项目同步操作。');
  }
  async apply(project,snapshot,binding,env){
    const prefix='designs/sync-'+randomUUID(),files=new Map(snapshot.files.map(f=>[f.path,Buffer.from(f.bytes)])),systemMap={...project.workbench?.sync?.systemMap};
    const existing=await buildPortableProject(this.owner,project.id,{...env,expectedRevision:project.revision});
    // Reuse only the exact normative bytes; a changed package never inherits
    // authority merely because its portable system ID/version was reused.
    for(const item of snapshot.manifest.systems||[]){const key=`${item.systemId}:v${item.version}`,raw=files.get(item.path);if(!raw)fail('INVALID_PACKAGE','规范快照缺失。');
      const old=existing.files.find(f=>f.path===item.path);
      if(systemMap[key]&&old&&hash(old.bytes)===hash(raw)){const local=await this.owner.store.systemGet(systemMap[key].systemId,env.signal,systemMap[key].version);if(local.versions.some(v=>v.version===systemMap[key].version))continue;}
let system;try{system=JSON.parse(raw.toString('utf8'));}catch{fail('INVALID_PACKAGE','规范快照格式无效。');}const result=await this.owner.workbench.execute({action:'system.import',system:system.system||system},{...env,user:true});const imported=result.system||result;systemMap[key]={systemId:imported.id,version:imported.versions?.at(-1)?.version||1};}
    const next=portableProjectMetadata(project,snapshot.manifest,{systemMap}),logicalPaths=new Set(snapshot.manifest.files.map(f=>f.path)),rebase=value=>typeof value==='string'&&logicalPaths.has(value)?`${prefix}/${value}`:value;
    const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(['path','htmlPath','requirementsPath','rulesPath','entry'].includes(key)&&typeof item==='string')value[key]=rebase(item);else if(['folder','sourceRoot'].includes(key)&&typeof item==='string')value[key]=`${prefix}/${item}`;else if(key==='files'&&value.kind==='schema')value[key]=item.map(rebase);else visit(item);}};visit(next.artboards);visit(next.workbench.designs);visit(next.workbench.files);next.workbench.requirementsPath=rebase(next.workbench.requirementsPath);next.workbench.rulesPath=rebase(next.workbench.rulesPath);
    // Local private content and readonly references never enter the cloud snapshot.
    // Keep their registrations when replacing the shared business view.
    const keepLocal=(current,incoming,predicate)=>{for(const item of current.filter(predicate)){if(incoming.some(other=>other.id===item.id))fail('SYNC_PRIVATE_ID_CONFLICT','远端内容与本地私有资源标识冲突，请先另存项目。');incoming.push(clone(item));}};
    const privateDesigns=new Set(project.workbench.designs.filter(d=>!d.deletedAt&&(d.private===true||d.visibility==='private')).map(d=>d.id));
    keepLocal(project.workbench.files,next.workbench.files,f=>!f.removedAt&&(f.private===true||f.visibility==='private'||privateDesigns.has(f.designId)||f.sourceId||f.sourceProjectId||f.type==='reference'||f.referenceOnly));
    keepLocal(project.workbench.designs,next.workbench.designs,d=>privateDesigns.has(d.id));
    keepLocal(project.artboards,next.artboards,p=>!p.deletedAt&&(p.private===true||p.visibility==='private'||privateDesigns.has(p.designId)));
    return this.owner.workbench.exclusive(project.id,async()=>{
      const latest=await this.project(project.id,env.signal);cas(latest,project.revision);await this.quiet(latest,env);
      for(const entry of snapshot.manifest.files){if(entry.path.startsWith('portable-systems/'))continue;const bytes=files.get(entry.path),destination=`${prefix}/${entry.path}`;let value;
        try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!decoded.includes('\0'))value=decoded;}catch{}
        const outcome=value===undefined?await this.owner.workbench.publishBytes(latest,destination,bytes,{...env,user:true}):await this.owner.workbench.writeAt(latest,destination,value,null,{...env,user:true});
        const f=next.workbench.files.find(f=>f.path===destination);if(f){f.sha256=hash(bytes);f.savedFsVersion=outcome.version;f.savedByteLength=bytes.length;}const page=next.artboards.find(a=>a.htmlPath===destination);if(page)page.contentHash=hash(bytes);
      }
      return this.owner.store.mutate(project.id,project.revision,'Import fast-forward Git project snapshot',p=>{const operational=p.workbench;for(const field of ['name','description','platform','canvas','artboards','systemId','systemVersion'])if(next[field]!==undefined)p[field]=next[field];p.workbench={...operational,...next.workbench,sync:{...operational.sync,...binding,portablePrefix:prefix,systemMap}};},env.signal,env.policy,true);
    });
  }
  dispose(){this.locks.clear();}
}
