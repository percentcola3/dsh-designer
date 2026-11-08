import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail} from './store.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const flatten=refs=>(refs||[]).flatMap(r=>r.nodes?flatten(r.nodes):[r]);
const user=env=>env.user===true&&!env.agent;
const MAX_DIRECTORY_ENTRIES=10000;

// Knowledge reads are deliberately narrower than editable source-file reads.
export function privateKnowledgePath(value,{root=false}={}){
  if(typeof value!=='string'||value.includes('\\')||value.includes('\0'))return true;
  const segments=value.split('/').filter(Boolean);
  if(segments.some(s=>s.startsWith('.')||/^(?:node_modules|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i.test(s)))return true;
  return !root&&/^(?:project\.json|snapshots|versions|delivery|sources|imports)(?:\/|$)/i.test(value);
}
function relative(value=''){
  if(typeof value!=='string'||value.length>4096||value.includes('\\')||value.includes('\0')||path.posix.isAbsolute(value)||value&&value.split('/').some(s=>!s||s==='.'||s==='..'))fail('INVALID_PATH','Use a relative knowledge path without traversal');
  if(value&&privateKnowledgePath(value))fail('SCOPE_DENIED','Private source and machine paths are not knowledge references');
  return value;
}
function range(input,max,defaultLimit){
  const offset=input.offset??0,limit=input.limit??defaultLimit;
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>max)fail('INVALID_INPUT',`offset must be nonnegative and limit must be 1..${max}`);
  return {offset,limit};
}
function hidden(project,rel){
  if(!project)return false;
  return [...project.workbench.files,...project.workbench.designs,...project.artboards].some(f=>{
    const p=f.path||f.htmlPath||f.folder;
    return p&&(rel===p||rel.startsWith(p+'/'))&&(f.removedAt||f.deletedAt||f.private===true||f.visibility==='private');
  });
}

/** Serializable read references only: this service never registers a writable root. */
export class KnowledgeReferenceService {
  constructor(workspace){this.workspace=workspace;this.fs=workspace.fs;}
  identity(projectId,rootPath){const id=hash(projectId+'\0'+rootPath);return {resourceId:'directory:'+id,sourceVersion:hash('directory-v1\0'+rootPath)};}
  async create(project,input,env){
    if(!user(env))fail('USER_ONLY','Only a user can select a knowledge directory');
    if(typeof input.directory!=='string'||!path.isAbsolute(input.directory)||input.directory.length>4096||privateKnowledgePath(input.directory,{root:true}))fail('INVALID_PATH','Select a public absolute directory');
    const root=await this.fs.resolve(input.directory,{signal:env.signal}),rootPath=this.fs.processPath(root);
    if(privateKnowledgePath(rootPath,{root:true}))fail('SCOPE_DENIED','Private directories cannot become knowledge roots');
    const observed=await this.fs.stat(root,env.signal);if(observed?.type!=='directory')fail('NOT_DIRECTORY','Select an existing directory');
    const label=typeof input.label==='string'?input.label.slice(0,200):path.basename(rootPath);
    const reference={type:'directory',projectId:project.id,...this.identity(project.id,rootPath),rootPath,label,readonly:true};
    return {projectId:project.id,reference,readonly:true};
  }
  admitted(project,ref,env){
    if(user(env))return null;
    const task=env.task||this.workspace.owner.aiWorkbench?.taskFor(env.agent);
    const admitted=task?.projectId===project.id&&flatten(task.refs).find(r=>!r.invalid&&r.readonly===true&&r.kind===ref.type&&r.resourceId===ref.resourceId&&r.sourceVersion===ref.sourceVersion&&r.reference?.type===ref.type&&(!r.reference.projectId||r.reference.projectId===project.id)&&(ref.type==='directory'?r.reference.rootPath===ref.rootPath:r.reference.referencedProjectId===ref.referencedProjectId));
    if(!admitted)fail('SCOPE_DENIED','This exact read reference was not admitted to the task');
    return admitted;
  }
  async directory(project,ref,env){
    if(ref.projectId&&ref.projectId!==project.id)fail('PROJECT_SCOPE','Reference belongs to another project');
    if(typeof ref.rootPath!=='string'||ref.rootPath.length>4096||!path.isAbsolute(ref.rootPath)||privateKnowledgePath(ref.rootPath,{root:true}))fail('SCOPE_DENIED','Invalid public directory reference');
    if(['fileId','pageId','designId','nodeId','sourceId','sourceProjectId','systemId','path','referencedProjectId'].some(k=>ref[k]!==undefined))fail('INVALID_INPUT','Directory references require an exact directory identity');
    const identity=this.identity(project.id,ref.rootPath);
    if(ref.resourceId!==identity.resourceId||ref.sourceVersion!==identity.sourceVersion)fail('REFERENCE_VERSION_CONFLICT','Directory identity changed');
    this.admitted(project,ref,env);
    const root=await this.fs.resolve(ref.rootPath,{signal:env.signal});
    if(this.fs.processPath(root)!==ref.rootPath)fail('REFERENCE_VERSION_CONFLICT','Knowledge root now resolves to a different directory');
    if((await this.fs.stat(root,env.signal))?.type!=='directory')fail('REFERENCE_NOT_FOUND','Knowledge directory is unavailable');
    return {root,projectId:project.id,resourceId:ref.resourceId,sourceVersion:ref.sourceVersion,directoryReference:{name:path.basename(ref.rootPath)},readonly:true,resolved:true};
  }
  async resolve(project,ref,env){const {root,...result}=await this.directory(project,ref,env);return result;}
  async scope(project,ref,env){
    if(ref?.type==='directory')return this.directory(project,ref,env);
    if(ref?.type!=='project')fail('INVALID_INPUT','Directory reads require a directory or project reference');
    const admitted=this.admitted(project,ref,env),overview=await this.workspace.projectReference(project,ref,env);
    if(admitted&&(!admitted.contentHash||admitted.contentHash!==overview.contentHash))fail('REFERENCE_VERSION_CONFLICT','Referenced project overview changed');
    const source=await this.workspace.project(ref.referencedProjectId,env.signal);
    return {root:await this.workspace.root(source,env),source,projectId:project.id,resourceId:ref.resourceId,sourceVersion:ref.sourceVersion,readonly:true};
  }
  async unchanged(scope,env){
    if(!scope.source)return;
    const current=await this.workspace.project(scope.source.id,env.signal);
    if(current.deletedAt||current.archived)fail('REFERENCE_NOT_FOUND','Referenced project is unavailable');
    if(current.revision!==scope.source.revision)fail('REFERENCE_VERSION_CONFLICT','Referenced project changed during knowledge access');
  }
  async target(scope,rel,env){
    relative(rel);if(hidden(scope.source,rel))fail('SCOPE_DENIED','Private project resources are not knowledge references');
    const target=await this.fs.resolve(path.join(this.fs.processPath(scope.root),rel),{signal:env.signal});
    if(!this.fs.contains(scope.root,target))fail('REFERENCE_SCOPE','Canonical knowledge path leaves the admitted directory');
    const canonical=path.relative(this.fs.processPath(scope.root),this.fs.processPath(target)).split(path.sep).join('/');
    if(canonical&&privateKnowledgePath(canonical)||hidden(scope.source,canonical))fail('SCOPE_DENIED','Canonical path points to private knowledge');
    return target;
  }
  async list(project,input,env){
    const {offset,limit}=range(input,200,100),scope=await this.scope(project,input.reference,env),rel=relative(input.path??''),target=await this.target(scope,rel,env);
    const observed=await this.fs.stat(target,env.signal);if(observed?.type!=='directory')fail('NOT_DIRECTORY','Knowledge list requires a directory');
    const all=await this.fs.listDir(target,env.signal);if(all.length>MAX_DIRECTORY_ENTRIES)fail('TREE_LIMIT','Knowledge directory exceeds 10000 entries');
    const entries=[];
    for(const item of all){
      if(typeof item.name!=='string'||item.name.includes('/')||item.name.includes('\\')||!item.name||item.name==='.'||item.name==='..')continue;
      const child=rel?rel+'/'+item.name:item.name;
      if(privateKnowledgePath(child)||hidden(scope.source,child))continue;
      try{const canonical=await this.target(scope,child,env),stat=await this.fs.stat(canonical,env.signal);if(!stat||!['file','directory'].includes(stat.type))continue;entries.push({name:item.name,path:child,type:stat.type,...(stat.type==='file'?{size:stat.size,version:stat.version}:{}),readonly:true});}
      catch(error){if(!['REFERENCE_SCOPE','SCOPE_DENIED'].includes(error.code))throw error;}
    }
    entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    if((await this.fs.stat(target,env.signal))?.version!==observed.version)fail('REFERENCE_VERSION_CONFLICT','Knowledge directory changed during listing');
    await this.unchanged(scope,env);
    return {projectId:project.id,resourceId:scope.resourceId,sourceVersion:scope.sourceVersion,path:rel,entries:entries.slice(offset,offset+limit),offset,total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null,readonly:true};
  }
  async read(project,input,env){
    const {offset,limit}=range(input,12000,6000),scope=await this.scope(project,input.reference,env),rel=relative(input.path);
    if(!rel)fail('INVALID_PATH','Choose a relative knowledge file');
    const target=await this.target(scope,rel,env),before=await this.fs.stat(target,env.signal);
    if(before?.type!=='file')fail('REFERENCE_NOT_FOUND','Knowledge file is unavailable');
    if(input.expectedVersion!==undefined&&input.expectedVersion!==before.version)fail('REFERENCE_VERSION_CONFLICT','Knowledge file changed between pages');
    const bytes=Buffer.from(await this.fs.readByteRange(target,{offset,length:limit*4+4},env.signal));
    let value;try{value=Array.from(new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:offset+bytes.length<before.size})).slice(0,limit).join('');}catch{fail('UNSUPPORTED_ENCODING','Knowledge reads require UTF-8 text');}
    if(value.includes('\0'))fail('UNSUPPORTED_ENCODING','Binary files cannot be read as knowledge text');
    const consumed=Buffer.byteLength(value),next=offset+consumed;
    if((await this.fs.stat(target,env.signal))?.version!==before.version)fail('REFERENCE_VERSION_CONFLICT','Knowledge file changed during read');
    await this.unchanged(scope,env);
    return {projectId:project.id,resourceId:scope.resourceId,sourceVersion:scope.sourceVersion,path:rel,text:value,version:before.version,contentHash:hash(value),offset,total:before.size,nextOffset:next<before.size?next:null,offsetUnit:'bytes',readonly:true};
  }
}
