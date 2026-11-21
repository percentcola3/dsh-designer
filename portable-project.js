import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail} from './store.js';
import {migrateWorkbench} from './workspace-service.js';

export const PORTABLE_MANIFEST_PATH='designer-project.json';
export const PORTABLE_LIMITS=Object.freeze({files:4000,fileBytes:32*1024*1024,totalBytes:128*1024*1024,metadataBytes:4*1024*1024});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const portableJSON=value=>JSON.stringify(stable(value),null,2)+'\n';
const compare=(a,b)=>a<b?-1:a>b?1:0;
const identifier=value=>typeof value==='string'&&/^[a-z]-[a-zA-Z0-9-]{1,100}$/.test(value);
export function portablePath(value,{system=false}={}){
  if(typeof value!=='string'||!value||value.length>2000||/[\\\u0000-\u001f\u007f]/.test(value)||path.posix.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/^(?:node_modules|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i.test(p))||/^(?:project\.json|snapshots|versions|delivery|sources|imports)(?:\/|$)/i.test(value)||!system&&/^portable-systems(?:\/|$)/.test(value))fail('INVALID_PORTABLE_PATH','Portable paths must identify public project content');
  return value;
}
const pick=(value,fields)=>Object.fromEntries(fields.filter(k=>value?.[k]!==undefined).map(k=>[k,copy(value[k])]));
// Arbitrary editor business objects may not smuggle local authority or machine paths.
function business(value,depth=0){
  if(depth>32)fail('INVALID_PORTABLE_METADATA','Business metadata is too deep');
  if(Array.isArray(value))return value.map(v=>business(v,depth+1));
  if(object(value))return Object.fromEntries(Object.entries(value).filter(([k])=>!/(?:credential|privatekey|passphrase|capability|authorization|writable|permission|session|taskref|rootpath|directory|machine|secret)/i.test(k)&&!['__proto__','prototype','constructor'].includes(k)).map(([k,v])=>[k,business(v,depth+1)]));
  if(typeof value==='string'&&(/^(?:file:|[A-Za-z]:[\\/]|\/(?:Users|home|private|tmp|var|etc)\/)/.test(value)))return null;
  return value;
}
function binding(value){
  if(!value)return {mode:'inherit'};
  if(!['inherit','independent','none'].includes(value.mode))fail('INVALID_PORTABLE_METADATA','Unknown design binding mode');
  if(value.mode!=='independent')return {mode:value.mode};
  if(!identifier(value.systemId)||!Number.isSafeInteger(value.version)||value.version<1)fail('INVALID_PORTABLE_METADATA','Independent bindings require a pinned system version');
  return {mode:'independent',systemId:value.systemId,version:value.version};
}
function schemaArtifact(page) {
  const source=page.artifact;
  const artifact=pick(source,['kind','schemaVersion','compilerVersion','entry','sourceRoot','files','sourceHash','version','buildId']);
  artifact.binding=business(pick(source.binding,['systemId','version','name','manifest','rootClass','tokens','resources']));
  artifact.sourceMap=Object.fromEntries(Object.entries(source.sourceMap||{}).map(([id,address])=>[id,pick(address,['nodeId','part','bind','recordKey','source','keyField','fieldId','field','index'])]));
  artifact.formFields=copy(source.formFields||{});
  artifact.history={entries:[{entry:source.entry,sourceHash:source.sourceHash,htmlPath:page.htmlPath,contentHash:page.contentHash,binding:copy(artifact.binding)}],cursor:0};
  return artifact;
}
function publicProject(project){
  const p=migrateWorkbench(project),designs=p.workbench.designs.filter(d=>!d.deletedAt&&d.private!==true&&d.visibility!=='private'),ids=new Set(designs.map(d=>d.id));
  const pages=p.artboards.filter(a=>!a.deletedAt&&a.private!==true&&a.visibility!=='private'&&(!a.designId||ids.has(a.designId)));
  for(const item of [...designs,...pages])if(!identifier(item.id))fail('INVALID_PORTABLE_METADATA','Invalid public design or page identity');
  const out=pick(p,['name','description','platform']);if(p.canvas!==undefined)out.canvas=pick(p.canvas,['x','y','zoom']);out.artboards=pages.map(a=>({...pick(a,['id','name','platform','revision','htmlPath','contentHash','designId']),...(a.position!==undefined?{position:pick(a.position,['x','y'])}:{}),...(a.viewport!==undefined?{viewport:pick(a.viewport,['width','height'])}:{}),...business(pick(a,['entry','scene'])),...(a.artifact?.kind==='schema'?{artifact:schemaArtifact(a)}:{})}));
  out.workbench={schemaVersion:1,...pick(p.workbench,['goal','requirementsPath','rulesPath']),designs:designs.map(d=>({...pick(d,['id','name','platform','folder']),pageIds:pages.filter(a=>a.designId===d.id||(d.pageIds||[]).includes(a.id)).map(a=>a.id),binding:binding(d.binding),...(d.scenes!==undefined?{scenes:business(d.scenes)}:{})})),files:[]};
  if(p.systemId){if(!identifier(p.systemId)||!Number.isSafeInteger(p.systemVersion)||p.systemVersion<1)fail('INVALID_PORTABLE_METADATA','Project binding requires a pinned system version');out.systemId=p.systemId;out.systemVersion=p.systemVersion;}else{out.systemId=null;out.systemVersion=null;}
  return out;
}
function publicFile(file){return !file.removedAt&&file.private!==true&&file.visibility!=='private'&&!file.sourceId&&!file.sourceProjectId&&file.type!=='reference'&&!file.referenceOnly;}
function unavailablePath(project,logical){return [...project.workbench.designs,...project.artboards].some(item=>{const rel=item.folder||item.htmlPath;return rel&&(logical===rel||logical.startsWith(rel+'/'))&&(item.deletedAt||item.private===true||item.visibility==='private');});}
function systemPackage(system,version){
  if(typeof system.name!=='string'||!system.name.trim()||system.name.length>200||!Array.isArray(system.platforms)||!system.platforms.length||system.platforms.some(p=>!['web','mobile'].includes(p)))fail('INVALID_PORTABLE_METADATA','Invalid public design-system metadata');
  const v=system.versions?.find(v=>v.version===version);if(!v)fail('PORTABLE_SYSTEM_MISSING','Pinned design-system version is unavailable');
  if(v.tokens!==undefined&&!object(v.tokens)||!Array.isArray(v.resources||[])||(v.resources||[]).length>500)fail('INVALID_PORTABLE_METADATA','Invalid embedded design-system business schema');
  const resourceIds=new Set(),resourcePaths=new Set();
  const resources=(v.resources||[]).map(r=>{
    if(!object(r)||typeof r.id!=='string'||!r.id||r.id.length>200||resourceIds.has(r.id))fail('INVALID_PORTABLE_METADATA','Invalid or duplicate design-system resource identity');resourceIds.add(r.id);
    const logicalPath=portablePath(r.logicalPath||r.path||r.name,{system:true});if(resourcePaths.has(logicalPath))fail('INVALID_PORTABLE_METADATA','Duplicate design-system resource path');resourcePaths.add(logicalPath);
    if(typeof r.bytesBase64!=='string')fail('PORTABLE_SYSTEM_MISSING','Design-system resources require embedded bytes');
    const bytes=Buffer.from(r.bytesBase64,'base64');if(bytes.toString('base64')!==r.bytesBase64||r.sha256&&sha(bytes)!==r.sha256)fail('INTEGRITY_MISMATCH','Design-system resource hash changed');
    return {...pick(r,['id','name','mimeType']),logicalPath,path:logicalPath,sha256:sha(bytes),byteLength:bytes.length,bytesBase64:r.bytesBase64};
  });
  return {...pick(system,['id','name','description','platforms']),schemaVersion:1,revision:version,versions:[{version,...business(pick(v,['tokens','guidelines','summary'])),resources}]};
}

export async function buildPortableProject(owner,projectId,env={}){
  const fs=owner.ctx.fs,original=migrateWorkbench((await owner.store.projectRecord(projectId,env.signal)).value);
  if(original.deletedAt||original.archived)fail('PROJECT_UNAVAILABLE','Restore the project before packaging');
  if(env.expectedRevision!==undefined&&env.expectedRevision!==original.revision)fail('VERSION_CONFLICT','Project changed before snapshot');
  const prefix=original.workbench.sync?.portablePrefix;if(prefix!==undefined)portablePath(prefix);
  const logicalPath=value=>prefix&&value.startsWith(prefix+'/')?value.slice(prefix.length+1):value;
  const project=publicProject(original);
  for(const d of project.workbench.designs)d.folder=logicalPath(d.folder);
  for(const p of project.artboards)p.htmlPath=logicalPath(p.htmlPath);
  for (const page of project.artboards.filter(page=>page.artifact?.kind==='schema')) {
    const artifact=page.artifact;
    artifact.entry=logicalPath(artifact.entry);
    artifact.sourceRoot=logicalPath(artifact.sourceRoot);
    artifact.files=artifact.files.map(logicalPath);
    for (const lock of [artifact.binding,...artifact.history.entries.map(entry=>entry.binding)]) for (const resource of Object.values(lock.resources||{})) resource.path=logicalPath(resource.path);
    for (const entry of artifact.history.entries) {entry.entry=logicalPath(entry.entry);entry.htmlPath=logicalPath(entry.htmlPath);}
  }
  for(const key of ['requirementsPath','rulesPath'])if(project.workbench[key])project.workbench[key]=logicalPath(project.workbench[key]);
  const root=await owner.store.target(`projects/${projectId}`,env.signal),files=[],included=new Set();let totalBytes=0;
  const add=(logical,bytes)=>{portablePath(logical,{system:true});if(logical===PORTABLE_MANIFEST_PATH||included.has(logical))fail('INVALID_PORTABLE_PATH','Duplicate or reserved portable path');if(bytes.length>PORTABLE_LIMITS.fileBytes||totalBytes+bytes.length>PORTABLE_LIMITS.totalBytes||files.length>=PORTABLE_LIMITS.files-1)fail('PORTABLE_LIMIT','Project exceeds 4000 files, 32 MiB per file, or 128 MiB total');included.add(logical);totalBytes+=bytes.length;files.push({path:logical,bytes});};
  const candidates=new Map();
  for(const f of original.workbench.files.filter(publicFile)){if(unavailablePath(original,f.path))continue;try{portablePath(f.path);}catch{continue;}if(f.designId&&!project.workbench.designs.some(d=>d.id===f.designId))continue;candidates.set(f.path,{file:f});}
  for(const page of original.artboards.filter(p=>project.artboards.some(a=>a.id===p.id))){portablePath(page.htmlPath);candidates.set(page.htmlPath,{...candidates.get(page.htmlPath),page});}
  for(const key of ['requirementsPath','rulesPath']){const rel=original.workbench[key];if(rel){try{portablePath(rel);}catch{delete project.workbench[key];continue;}const f=original.workbench.files.find(f=>f.path===rel);if(f&&!publicFile(f)||unavailablePath(original,rel)){delete project.workbench[key];continue;}candidates.set(rel,{...candidates.get(rel),optional:!f});}}
  for(const [logical,{file,page,optional}] of candidates){
    env.signal?.throwIfAborted();portablePath(logicalPath(logical));const target=await fs.resolve(path.join(fs.processPath(root),logical),{signal:env.signal});
    if(!fs.contains(root,target))fail('PROJECT_SCOPE','Canonical portable resource leaves the project');
    const canonical=path.relative(fs.processPath(root),fs.processPath(target)).split(path.sep).join('/');portablePath(canonical);portablePath(logicalPath(canonical));
    const canonicalFile=original.workbench.files.find(f=>f.path===canonical);if(canonicalFile&&!publicFile(canonicalFile)||unavailablePath(original,canonical))fail('PRIVATE_PORTABLE_RESOURCE','Canonical resource points to a private or external reference');
    const before=await fs.stat(target,env.signal);if(!before&&optional){for(const key of ['requirementsPath','rulesPath'])if(project.workbench[key]===logicalPath(logical))delete project.workbench[key];continue;}
    if(before?.type!=='file')fail('PORTABLE_FILE_MISSING','A saved public file is unavailable',{path:logical});if(before.size>PORTABLE_LIMITS.fileBytes)fail('PORTABLE_LIMIT','Public file exceeds 32 MiB');
    const bytes=Buffer.from(await fs.readBytes(target,env.signal,PORTABLE_LIMITS.fileBytes));if((await fs.stat(target,env.signal))?.version!==before.version)fail('VERSION_CONFLICT','Public file changed during snapshot',{path:logical});
    const hash=sha(bytes);if(page?.contentHash&&page.contentHash!==hash||file?.sha256&&file.sha256!==hash)fail('VERSION_CONFLICT','Public file differs from its saved hash',{path:logical});add(logicalPath(logical),bytes);
    project.workbench.files.push({...pick(file||{},['id','name','type','mimeType','designId','pageId']),...(!file?.id?{id:'f-'+sha(projectId+'\0'+logical).slice(0,32)}:{}),path:logicalPath(logical),sha256:hash,...(page?{type:'page',pageId:page.id,designId:page.designId}:{})});
  }
  const systems=[],needed=new Map(),reverse=new Map();
  for(const [portable,local]of Object.entries(original.workbench.sync?.systemMap||{})){const match=/^([a-z]-[a-zA-Z0-9-]{1,100}):v([1-9][0-9]*)$/.exec(portable);if(!match||!identifier(local?.systemId)||!Number.isSafeInteger(local.version)||local.version<1||!Number.isSafeInteger(Number(match[2])))fail('INVALID_PORTABLE_METADATA','Invalid local-to-portable system mapping');const key=local.systemId+':'+local.version;if(reverse.has(key))fail('INVALID_PORTABLE_METADATA','Ambiguous local-to-portable system mapping');reverse.set(key,{systemId:match[1],version:Number(match[2])});}
  const currentBindings=new Map();
  async function currentBinding(id) {
    if (currentBindings.has(id)) return currentBindings.get(id);
    const {system}=await owner.workbench.execute({action:'system.export',systemId:id},{...env,user:false});
    const revision=system.versions.at(-1)?.version;
    const stable=reverse.get(id+':'+revision)||{systemId:id,version:revision};
    needed.set(stable.systemId+':'+stable.version,{...stable,pkg:systemPackage(system,revision)});
    currentBindings.set(id,stable);
    return stable;
  }
  if(project.systemId){const stable=await currentBinding(project.systemId);project.systemId=stable.systemId;project.systemVersion=stable.version;}
  for(const d of project.workbench.designs)if(d.binding.mode==='independent')d.binding={mode:'independent',...await currentBinding(d.binding.systemId)};
  for(const {systemId,version,pkg} of [...needed.values()].sort((a,b)=>compare(a.systemId+':'+a.version,b.systemId+':'+b.version))){
    pkg.id=systemId;pkg.revision=version;pkg.versions[0].version=version;const logical=`portable-systems/${systemId}-v${version}.json`;add(logical,Buffer.from(portableJSON(pkg)));systems.push({systemId,version,path:logical});
  }
  project.workbench.files.sort((a,b)=>compare(a.path,b.path));files.sort((a,b)=>compare(a.path,b.path));
  const manifest={schemaVersion:1,format:'dsh-portable-project',sourceProjectId:projectId,sourceRevision:original.revision,project,systems,files:files.map(f=>({path:f.path,sha256:sha(f.bytes),byteLength:f.bytes.length})),totalBytes};manifest.manifestHash=sha(portableJSON(manifest));
  const bytes=Buffer.from(portableJSON(manifest));if(bytes.length>PORTABLE_LIMITS.metadataBytes||totalBytes+bytes.length>PORTABLE_LIMITS.totalBytes)fail('PORTABLE_LIMIT','Portable metadata exceeds its bound');files.push({path:PORTABLE_MANIFEST_PATH,bytes});
  const current=(await owner.store.projectRecord(projectId,env.signal)).value;if(current.revision!==original.revision||current.deletedAt||current.archived)fail('VERSION_CONFLICT','Project changed during portable snapshot');
  return validatePortableProject({files,manifest});
}

export function validatePortableProject(snapshot){
  if(!object(snapshot)||!Array.isArray(snapshot.files)||!snapshot.files.length||snapshot.files.length>PORTABLE_LIMITS.files)fail('INVALID_PORTABLE_PACKAGE','A bounded portable file set is required');
  const files=snapshot.files.map(file=>{const logical=file.path;if(logical!==PORTABLE_MANIFEST_PATH)portablePath(logical,{system:true});let bytes;if(Buffer.isBuffer(file.bytes)||file.bytes instanceof Uint8Array)bytes=Buffer.from(file.bytes);else if(typeof file.bytesBase64==='string'){bytes=Buffer.from(file.bytesBase64,'base64');if(bytes.toString('base64')!==file.bytesBase64)fail('INVALID_PORTABLE_PACKAGE','Noncanonical portable base64');}else fail('INVALID_PORTABLE_PACKAGE','Portable files require bytes');if(bytes.length>PORTABLE_LIMITS.fileBytes)fail('PORTABLE_LIMIT','Portable file exceeds its bound');return {path:logical,bytes};});
  const seen=new Set();for(const f of files){if(seen.has(f.path))fail('INVALID_PORTABLE_PACKAGE','Duplicate portable file');seen.add(f.path);}if(files.reduce((n,f)=>n+f.bytes.length,0)>PORTABLE_LIMITS.totalBytes)fail('PORTABLE_LIMIT','Portable package exceeds 128 MiB');
  const descriptor=files.find(f=>f.path===PORTABLE_MANIFEST_PATH);if(!descriptor||descriptor.bytes.length>PORTABLE_LIMITS.metadataBytes)fail('INVALID_PORTABLE_PACKAGE','Portable manifest is missing or too large');let manifest;try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(descriptor.bytes));}catch{fail('INVALID_PORTABLE_PACKAGE','Portable manifest must be UTF-8 JSON');}
  if(!descriptor.bytes.equals(Buffer.from(portableJSON(manifest))))fail('INVALID_PORTABLE_PACKAGE','Portable manifest must use its canonical JSON representation');
  if(manifest.schemaVersion!==1||manifest.format!=='dsh-portable-project'||!identifier(manifest.sourceProjectId)||!Number.isSafeInteger(manifest.sourceRevision)||manifest.sourceRevision<1||!Array.isArray(manifest.files)||!Array.isArray(manifest.systems)||!object(manifest.project))fail('INVALID_PORTABLE_PACKAGE','Unsupported portable project manifest');
  if(Object.keys(manifest).some(k=>!['schemaVersion','format','sourceProjectId','sourceRevision','project','systems','files','totalBytes','manifestHash'].includes(k)))fail('INVALID_PORTABLE_METADATA','Unexpected portable manifest metadata');
  const {manifestHash,...unhashed}=manifest;if(sha(portableJSON(unhashed))!==manifestHash||snapshot.manifest&&portableJSON(snapshot.manifest)!==portableJSON(manifest))fail('INTEGRITY_MISMATCH','Portable manifest hash differs');
  if(typeof manifest.project.name!=='string'||!manifest.project.name.trim()||manifest.project.name.length>200||manifest.project.description!==undefined&&(typeof manifest.project.description!=='string'||manifest.project.description.length>30000)||!['web','mobile'].includes(manifest.project.platform)||!Array.isArray(manifest.project.artboards)||!object(manifest.project.workbench)||!Array.isArray(manifest.project.workbench.designs)||!Array.isArray(manifest.project.workbench.files)||manifest.project.workbench.designs.length>1000||manifest.project.artboards.length>1000)fail('INVALID_PORTABLE_METADATA','Invalid portable project business schema');
  const geometry=(v,keys)=>v===undefined||object(v)&&Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Number.isFinite(v[k]));
  if(!geometry(manifest.project.canvas,['x','y','zoom'])||manifest.project.workbench.goal!==undefined&&(typeof manifest.project.workbench.goal!=='string'||manifest.project.workbench.goal.length>30000))fail('INVALID_PORTABLE_METADATA','Invalid portable project geometry or requirements');
  const normalized=publicProject({...manifest.project,id:manifest.sourceProjectId,revision:manifest.sourceRevision});normalized.workbench.files=manifest.project.workbench?.files?.map(f=>({...pick(f,['id','name','type','mimeType','designId','pageId','path','sha256'])}))||[];
  if(portableJSON(normalized)!==portableJSON(manifest.project))fail('INVALID_PORTABLE_METADATA','Portable project contains nonpublic or unsupported metadata');
  const indexed=new Set();let total=0;for(const item of manifest.files){if(!object(item)||Object.keys(item).some(k=>!['path','sha256','byteLength'].includes(k)))fail('INVALID_PORTABLE_METADATA','Unexpected portable file metadata');portablePath(item.path,{system:true});if(item.path===PORTABLE_MANIFEST_PATH||indexed.has(item.path))fail('INVALID_PORTABLE_PACKAGE','Invalid portable index');indexed.add(item.path);const file=files.find(f=>f.path===item.path);if(!file||sha(file.bytes)!==item.sha256||file.bytes.length!==item.byteLength)fail('INTEGRITY_MISMATCH','Portable file hash or length differs',{path:item.path});total+=item.byteLength;}
  if(total!==manifest.totalBytes||files.length!==indexed.size+1)fail('INVALID_PORTABLE_PACKAGE','Portable file index is incomplete');
  const ids=new Set();for(const f of manifest.project.workbench.files){if(['name','type','mimeType'].some(k=>f[k]!==undefined&&(typeof f[k]!=='string'||f[k].length>200)))fail('INVALID_PORTABLE_METADATA','Invalid public file description');portablePath(f.path);if(!identifier(f.id)||ids.has(f.id)||!indexed.has(f.path)||!publicFile(f)||manifest.files.find(x=>x.path===f.path)?.sha256!==f.sha256)fail('INVALID_PORTABLE_METADATA','Public file metadata differs from payload');ids.add(f.id);}
  const designIds=new Set();for(const d of manifest.project.workbench.designs){if(typeof d.name!=='string'||d.name.length>200||!['web','mobile'].includes(d.platform))fail('INVALID_PORTABLE_METADATA','Invalid portable design');portablePath(d.folder);if(designIds.has(d.id))fail('INVALID_PORTABLE_METADATA','Duplicate design identity');designIds.add(d.id);}
  const pageIds=new Set();for(const p of manifest.project.artboards){if(!geometry(p.position,['x','y'])||!geometry(p.viewport,['width','height'])||typeof p.name!=='string'||p.name.length>200||!Number.isSafeInteger(p.revision)||p.revision<1||!['web','mobile'].includes(p.platform))fail('INVALID_PORTABLE_METADATA','Invalid portable page');portablePath(p.htmlPath);if(pageIds.has(p.id)||p.designId&&!designIds.has(p.designId)||!indexed.has(p.htmlPath)||p.contentHash!==manifest.files.find(x=>x.path===p.htmlPath)?.sha256)fail('INVALID_PORTABLE_METADATA','Page metadata differs from its saved bytes');pageIds.add(p.id);}
  const systemIds=new Set();for(const s of manifest.systems){if(!object(s)||Object.keys(s).some(k=>!['systemId','version','path'].includes(k)))fail('INVALID_PORTABLE_METADATA','Unexpected embedded system metadata');if(!identifier(s.systemId)||!Number.isSafeInteger(s.version)||s.version<1||s.path!==`portable-systems/${s.systemId}-v${s.version}.json`||!indexed.has(s.path)||systemIds.has(s.systemId+':'+s.version))fail('INVALID_PORTABLE_METADATA','Invalid pinned system package');systemIds.add(s.systemId+':'+s.version);let pkg;try{pkg=JSON.parse(files.find(f=>f.path===s.path).bytes.toString('utf8'));}catch{fail('INVALID_PORTABLE_METADATA','Invalid embedded system JSON');}if(pkg.id!==s.systemId||portableJSON(systemPackage(pkg,s.version))!==portableJSON(pkg))fail('INVALID_PORTABLE_METADATA','Embedded system must be a self-contained public package');}
  const declared=new Set([...manifest.project.workbench.files.map(f=>f.path),...manifest.systems.map(s=>s.path)]);for(const item of manifest.files)if(!declared.has(item.path))fail('INVALID_PORTABLE_METADATA','Portable index contains an undeclared business file');
  const required=[...(manifest.project.systemId?[{systemId:manifest.project.systemId,version:manifest.project.systemVersion}]:[]),...manifest.project.workbench.designs.filter(d=>d.binding.mode==='independent').map(d=>d.binding)];for(const b of required)if(!systemIds.has(b.systemId+':'+b.version))fail('PORTABLE_SYSTEM_MISSING','A design binding has no portable system snapshot');
  return {files,manifest};
}

/** Overlay only public content; local sessions, grants and operational settings survive. */
export function portableProjectMetadata(current,manifest,{systemMap={}}={}){
  const next=copy(current),incoming=copy(manifest.project);for(const key of ['name','description','platform','canvas','artboards','systemId','systemVersion']){if(incoming[key]!==undefined)next[key]=incoming[key];else delete next[key];}
  next.workbench={...next.workbench,...incoming.workbench};
  const mapped=(id,version)=>{const value=systemMap[id+':v'+version]??systemMap[id];return typeof value==='string'?{systemId:value,version}:object(value)?{systemId:value.systemId,version:value.version}:{systemId:id,version};};
  if(next.systemId){const value=mapped(next.systemId,next.systemVersion);next.systemId=value.systemId;next.systemVersion=value.version;}
  for(const d of next.workbench.designs)if(d.binding?.systemId)d.binding={mode:'independent',...mapped(d.binding.systemId,d.binding.version)};
  return next;
}
