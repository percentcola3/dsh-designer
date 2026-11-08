// This module is executed only by the managed shell, never imported by Host code.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import git from 'isomorphic-git';
import nodeHttp from 'isomorphic-git/http/node';

const fsp=fs.promises;
const MAX_FILE=32*1024*1024,MAX_TOTAL=128*1024*1024,MAX_FILES=4000,MAX_JSON=190*1024*1024;
const WRITES=new Set(['init','commit','fetch','push','fastForward']);
const OPERATIONS=new Set([...WRITES,'status','branches','readSnapshot','detect','probe']);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const oid=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
function fail(code,message,details){throw Object.assign(new Error(message),{code,...(details?{details}:{})});}
function check(signal){signal?.throwIfAborted();}
function inside(root,candidate){const rel=path.relative(root,candidate);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function branchName(value='main'){
  if(typeof value!=='string'||!value||value.length>240||value==='HEAD'||value.startsWith('-')||value.startsWith('refs/')||/[\s\x00-\x20\x7f~^:?*\[\\]/.test(value)||value.includes('..')||value.includes('@{')||value.endsWith('.')||value.split('/').some(p=>!p||p.startsWith('.')||p.endsWith('.lock')))fail('GIT_INVALID_BRANCH','Choose a valid named Git branch');return value;
}
function publicPath(value){
  if(typeof value!=='string'||!value||value.length>2000||value.includes('\\')||/[\x00-\x1f\x7f]/.test(value)||path.posix.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/^\.(?:git|workbench|ssh)$/i.test(p)||/^\.env(?:\.|$)/i.test(p)||/^(?:node_modules|\.npmrc|\.netrc)$/i.test(p)))fail('GIT_INVALID_PATH','Snapshot paths must be public, relative regular files');return value;
}
function scopePrefix(value){const prefix=publicPath(value);if(prefix.split('/').some(p=>p.startsWith('.')))fail('GIT_INVALID_SCOPE','Choose an explicit ordinary repository directory for this project');return prefix;}
function snapshotFiles(files){
  if(!Array.isArray(files)||files.length>MAX_FILES)fail('GIT_SNAPSHOT_LIMIT','Snapshot exceeds the supported file count');
  const seen=new Set(),lower=new Set();let total=0;
  const result=files.map(file=>{
    const name=publicPath(file?.path);if(seen.has(name)||lower.has(name.normalize('NFC').toLowerCase()))fail('GIT_INVALID_PATH','Snapshot has duplicate or case-colliding paths');seen.add(name);lower.add(name.normalize('NFC').toLowerCase());
    if(typeof file.bytesBase64!=='string'||file.bytesBase64.length>Math.ceil(MAX_FILE/3)*4)fail('GIT_SNAPSHOT_LIMIT','Snapshot file exceeds the supported size');
    const bytes=Buffer.from(file.bytesBase64,'base64');if(bytes.toString('base64')!==file.bytesBase64)fail('GIT_INVALID_BYTES','Snapshot requires canonical base64 bytes');
    total+=bytes.length;if(bytes.length>MAX_FILE||total>MAX_TOTAL)fail('GIT_SNAPSHOT_LIMIT','Snapshot exceeds the supported byte size');return {path:name,bytes};
  });
  for(const name of seen){let parent=path.posix.dirname(name);while(parent!=='.'){if(seen.has(parent))fail('GIT_INVALID_PATH','Snapshot file and directory paths collide');parent=path.posix.dirname(parent);}}
  return result;
}
async function statMaybe(target){try{return await fsp.lstat(target);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function canonicalDirectory(target,{create=false}={}){
  const existing=await statMaybe(target);
  if(!existing){if(!create)return false;await fsp.mkdir(target,{mode:0o700});}
  const stat=await fsp.lstat(target);if(!stat.isDirectory()||stat.isSymbolicLink()||await fsp.realpath(target)!==target)fail('GIT_UNSAFE_PATH','The private Git repository contains an unsafe directory');return true;
}
async function projectRoot(value){
  if(typeof value!=='string'||!path.isAbsolute(value)||path.resolve(value)!==value||value.includes('\0'))fail('GIT_UNSAFE_PATH','A canonical absolute project directory is required');
  if(!await canonicalDirectory(value))fail('GIT_PROJECT_NOT_FOUND','The project directory is unavailable');return value;
}
async function scanNoLinks(root,signal){
  let count=0;const pending=[root];
  while(pending.length){check(signal);const directory=pending.pop();for(const item of await fsp.readdir(directory,{withFileTypes:true})){
    if(++count>100000)fail('GIT_REPOSITORY_LIMIT','The private repository exceeds the supported entry count');
    const target=path.join(directory,item.name),stat=await fsp.lstat(target);
    if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||stat.isFile()&&stat.nlink>1||await fsp.realpath(target)!==target)fail('GIT_UNSAFE_PATH','Git paths must not contain symlinks, aliases or special files');
    if(stat.isDirectory())pending.push(target);
  }}
}
async function lockIsStale(lockPath){
  let handle;try{handle=await fsp.open(lockPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||stat.size>1024)return false;const record=JSON.parse(await handle.readFile('utf8'));if(!Number.isSafeInteger(record.pid)||record.pid<=0||typeof record.token!=='string'||!record.token)return false;try{process.kill(record.pid,0);}catch(error){return error.code==='ESRCH';}return false;}catch{return false;}finally{await handle?.close();}
}
async function acquireLock(lockPath){
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=await fsp.open(lockPath,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);await handle.writeFile(JSON.stringify({pid:process.pid,token:randomUUID()}));return handle;}
    catch(error){if(error.code!=='EEXIST')throw error;}
    let reader,stale=false;
    try{
      reader=await fsp.open(lockPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const before=await reader.stat();if(!before.isFile()||before.nlink!==1||before.size>1024)fail('GIT_BUSY','The private Git lock needs manual inspection');
      const content=await reader.readFile('utf8');let record;try{record=JSON.parse(content);}catch{fail('GIT_BUSY','The private Git lock needs manual inspection');}
      if(!Number.isSafeInteger(record.pid)||record.pid<=0||typeof record.token!=='string'||!record.token)fail('GIT_BUSY','The private Git lock needs manual inspection');
      try{process.kill(record.pid,0);}catch(error){if(error.code==='ESRCH')stale=true;}
      if(!stale)fail('GIT_BUSY','Another Git operation holds the private mirror lock');
      const current=await fsp.lstat(lockPath),verified=await fsp.open(lockPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      try{const stat=await verified.stat(),bytes=await verified.readFile('utf8');if(current.ino!==before.ino||current.dev!==before.dev||stat.ino!==before.ino||stat.dev!==before.dev||bytes!==content)fail('GIT_BUSY','The private Git lock changed during recovery');}finally{await verified.close();}
      // The exact dead process record and inode were verified. No repository
      // objects or live project files participate in stale-lock recovery.
      if(!path.isAbsolute(lockPath)||path.basename(lockPath)!=='engine.lock'||path.basename(path.dirname(lockPath))!=='git-sync')fail('GIT_UNSAFE_PATH','Private Git lock identity changed');
      await fsp.unlink(lockPath);
    }finally{await reader?.close();}
  }
  fail('GIT_BUSY','Another Git operation holds the private mirror lock');
}
async function head(options){try{return await git.resolveRef({...options,ref:'HEAD'});}catch(e){if(e.code==='NotFoundError')return null;throw e;}}
async function resolveMaybe(options,ref){try{return await git.resolveRef({...options,ref});}catch(e){if(e.code==='NotFoundError')return null;throw e;}}
async function selectedBranch(options){return await git.currentBranch({...options,fullname:false})||null;}
function expectHead(input,current){if(!own(input,'expectedHead')||input.expectedHead!==null&&!oid(input.expectedHead))fail('GIT_HEAD_REQUIRED','Pass the exact expected HEAD, or null for an unborn branch');if(current!==input.expectedHead)fail('GIT_HEAD_CHANGED','Git HEAD changed; refresh repository status before retrying',{expectedHead:input.expectedHead,head:current});}
async function ancestry(options,start,signal){const result=new Set(),pending=[start];while(pending.length){check(signal);const next=pending.pop();if(!next||result.has(next))continue;if(result.size>=20000)fail('GIT_HISTORY_LIMIT','Repository history exceeds the supported comparison bound');result.add(next);const {commit}=await git.readCommit({...options,oid:next});pending.push(...commit.parent);}return result;}
async function dirtyFiles(repo){
  const result=[];for(const entry of await fsp.readdir(repo,{withFileTypes:true}))if(entry.name!=='.git')result.push({path:entry.name,head:0,workdir:2,stage:0});
  if(await statMaybe(path.join(repo,'.git','index')))result.push({path:'.git/index',head:0,workdir:2,stage:0});return result;
}
async function status(options,branch,signal){
  const current=await head(options),remoteHead=await resolveMaybe(options,`refs/remotes/origin/${branch}`),currentBranch=await selectedBranch(options),localBranches=await git.listBranches(options),remoteBranches=await git.listBranches({...options,remote:'origin'}),files=await dirtyFiles(options.dir);
  let ahead=0,behind=0,diverged=false;
  if(current&&remoteHead){const [local,remote]=await Promise.all([ancestry(options,current,signal),ancestry(options,remoteHead,signal)]);ahead=[...local].filter(v=>!remote.has(v)).length;behind=[...remote].filter(v=>!local.has(v)).length;diverged=ahead>0&&behind>0;}
  else if(current)ahead=(await ancestry(options,current,signal)).size;else if(remoteHead)behind=(await ancestry(options,remoteHead,signal)).size;
  return {initialized:true,head:current,branch:currentBranch,remoteHead,ahead,behind,diverged,dirty:files.length>0,status:files,branches:[...localBranches,...remoteBranches.filter(n=>n!=='HEAD').map(n=>'origin/'+n)],localBranches,remoteBranches:remoteBranches.filter(n=>n!=='HEAD')};
}
function clean(state){if(state.dirty)fail('GIT_DIRTY','The private mirror has unexpected working files or an index; preserve them and repair the mirror before synchronizing',{status:state.status});}
async function treeEntries(options,treeOid){return treeOid?(await git.readTree({...options,oid:treeOid})).tree:[];}
async function rootTree(options,commitOid){return commitOid?(await git.readCommit({...options,oid:commitOid})).commit.tree:null;}
async function subtree(options,commitOid,prefix){let tree=await rootTree(options,commitOid);for(const part of prefix.split('/')){const entry=(await treeEntries(options,tree)).find(e=>e.path===part);if(!entry)return null;if(entry.type!=='tree'||entry.mode!=='040000')fail('GIT_SCOPE_CONFLICT','The project namespace collides with a repository file or link');tree=entry.oid;}return tree;}
async function readFiles(options,commitOid,prefix,signal){
  const tree=await subtree(options,commitOid,prefix);if(!tree)return [];
  const result=[],seen=new Set();let total=0;
  async function visit(id,parent,depth){
    check(signal);if(depth>100)fail('GIT_SNAPSHOT_LIMIT','Snapshot directory nesting exceeds the supported bound');
    for(const entry of await treeEntries(options,id)){
      const relative=parent?parent+'/'+entry.path:entry.path;publicPath(relative);
      if(entry.path.includes('/')||entry.path.includes('\\'))fail('GIT_INVALID_PATH','Git tree contains an invalid path component');
      if(entry.type==='tree'&&entry.mode==='040000'){await visit(entry.oid,relative,depth+1);continue;}
      if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode))fail('GIT_UNSAFE_SNAPSHOT','Project snapshots must not contain symlinks or submodules');
      if(result.length>=MAX_FILES)fail('GIT_SNAPSHOT_LIMIT','Snapshot exceeds the supported file count');
      const key=relative.normalize('NFC').toLowerCase();if(seen.has(key))fail('GIT_INVALID_PATH','Snapshot has case-colliding paths');seen.add(key);
      const {blob}=await git.readBlob({...options,oid:entry.oid});total+=blob.length;if(blob.length>MAX_FILE||total>MAX_TOTAL)fail('GIT_SNAPSHOT_LIMIT','Snapshot exceeds the supported byte size');
      result.push({path:relative,bytesBase64:Buffer.from(blob).toString('base64')});
    }
  }
  await visit(tree,'',0);return result.sort((a,b)=>a.path.localeCompare(b.path));
}
async function snapshotTree(options,files){
  const root={directories:new Map(),files:[]};
  for(const file of files){const parts=file.path.split('/');let node=root;for(const part of parts.slice(0,-1)){if(!node.directories.has(part))node.directories.set(part,{directories:new Map(),files:[]});node=node.directories.get(part);}node.files.push({mode:'100644',path:parts.at(-1),oid:await git.writeBlob({...options,blob:file.bytes}),type:'blob'});}
  async function write(node){const tree=[...node.files];for(const [name,child]of node.directories)tree.push({mode:'040000',path:name,oid:await write(child),type:'tree'});return git.writeTree({...options,tree});}
  return write(root);
}
async function replaceSubtree(options,oldTree,parts,replacement){
  const name=parts[0],entries=await treeEntries(options,oldTree),existing=entries.find(e=>e.path===name);
  if(existing&&(existing.type!=='tree'||existing.mode!=='040000'))fail('GIT_SCOPE_CONFLICT','The project namespace collides with a repository file or link');
  const next=parts.length===1?replacement:await replaceSubtree(options,existing?.oid,parts.slice(1),replacement);
  return git.writeTree({...options,tree:[...entries.filter(e=>e.path!==name),{mode:'040000',path:name,oid:next,type:'tree'}]});
}
export async function repositoryPath(project,remoteUrl,branch='main'){
  const {parseGitRemote}=await import('./git-ssh-transport.js');let remote;try{remote=parseGitRemote(remoteUrl);}catch{fail('GIT_INVALID_REMOTE','Use a supported repository URL without embedded credentials');}
  const canonical=remote.type==='ssh'?`ssh://${remote.username}@${remote.host}:${remote.port}/${remote.path.startsWith('/')?'absolute/':'relative/'}${remote.path}`:remote.url.replace(/\/$/,'');
  return path.join(project,'.workbench','git-sync','repository',createHash('sha256').update(canonical+'\n'+branchName(branch)).digest('hex'));
}
async function probe(input,signal){
  const transport=await remoteTransport(input,signal),info=await git.getRemoteInfo2({...transport,protocolVersion:1,onAuth:authentication(input.credentials),onAuthFailure:()=>fail('GIT_AUTH_FAILED','Git authentication was refused')});
  const refs=info.refs||[],branches=refs.filter(r=>r.ref.startsWith('refs/heads/')).map(r=>branchName(r.ref.slice(11))),defaultRef=refs.find(r=>r.ref==='HEAD')?.target||info.capabilities?.symref;
  const match=typeof defaultRef==='string'?/(?:HEAD:)?refs\/heads\/(.+)$/.exec(defaultRef):null;
  return {reachable:true,branches,branchExists:branches.includes(branchName(input.branch)),defaultBranch:match?.[1]||null};
}
async function remoteTransport(input,signal){
  const value=input.remoteUrl;
  if(typeof value!=='string'||value.length>4096||/[\x00-\x20\x7f]/.test(value))fail('GIT_INVALID_REMOTE','Use an explicit HTTPS, HTTP or SSH repository URL');
  if(!/^https?:\/\//i.test(value)){
    const {createSSHTransport,parseGitRemote}=await import('./git-ssh-transport.js');const parsed=parseGitRemote(value);if(parsed.type!=='ssh')fail('GIT_INVALID_REMOTE','Use a supported repository URL');return createSSHTransport({remoteUrl:value,credentials:input.credentials||{},signal,timeoutMs:input.timeoutMs||60000,maxResponseBytes:MAX_TOTAL});
  }
  let remote;try{remote=new URL(value);}catch{fail('GIT_INVALID_REMOTE','Use a valid HTTP repository URL');}
  if(!['http:','https:'].includes(remote.protocol)||!remote.hostname||remote.username||remote.password||remote.search||remote.hash||decodeURIComponent(remote.pathname).includes('..'))fail('GIT_INVALID_REMOTE','Repository URLs cannot contain credentials, query parameters or path traversal');
  const base=remote.href.replace(/\/$/,'');
  return {url:base,http:{async request(request){
    const target=new URL(request.url);if(target.origin!==remote.origin||!target.pathname.startsWith(remote.pathname.replace(/\/$/,'')+'/'))fail('GIT_HTTP_SCOPE','Git transport attempted to leave the selected repository');
    let response;try{response=await nodeHttp.request({...request,signal,fetchOptions:{followRedirects:false,maxRedirects:0,timeout:input.timeoutMs||60000}});}catch{check(signal);fail('GIT_NETWORK_FAILED','Cannot connect to the Git repository');}
    if(response.statusCode>=300&&response.statusCode<400){await response.body.return?.();fail('GIT_REDIRECT_DENIED','Repository redirects require an explicit updated repository URL');}
    const body=response.body;return {...response,body:(async function*(){let size=0;try{for await(const chunk of body){check(signal);size+=chunk.byteLength;if(size>MAX_TOTAL)fail('GIT_TRANSPORT_LIMIT','Git response exceeds the supported size');yield chunk;}}finally{await body.return?.();}})()};
  }}};
}
function authentication(credentials={}){return ()=>({username:typeof credentials.username==='string'?credentials.username:'oauth2',password:typeof credentials.password==='string'?credentials.password:typeof credentials.token==='string'?credentials.token:''});}
function safeError(error){
  if(error?.name==='AbortError')return {code:'GIT_ABORTED',message:'The Git operation was cancelled'};
  if(error?.name==='TimeoutError')return {code:'GIT_TIMEOUT',message:'The Git operation exceeded its time limit'};
  if(typeof error?.code==='string'&&/^(?:GIT_|SSH_)/.test(error.code))return {code:error.code,message:error.message,details:error.details};
  if(['PushRejectedError','MergeNotSupportedError','FastForwardError'].includes(error?.code))return {code:'GIT_NON_FAST_FORWARD',message:'Repository histories diverged; force push and automatic merging are disabled'};
  if(['HttpError','HTTPError'].includes(error?.code)){const statusCode=error.data?.statusCode;return {code:statusCode===401||statusCode===403?'GIT_AUTH_FAILED':'GIT_REMOTE_ERROR',message:statusCode===401||statusCode===403?'Git authentication was refused':'The remote repository refused the Git request',...(Number.isSafeInteger(statusCode)?{details:{statusCode}}:{})};}
  return {code:'GIT_OPERATION_FAILED',message:'The built-in Git operation failed; local project files were preserved'};
}
async function detect(root){
  const gitdir=path.join(root,'.git'),stat=await statMaybe(gitdir);if(!stat)return {existingRepository:false,branch:null,remotes:[]};
  if(stat.isSymbolicLink())fail('GIT_UNSAFE_PATH','The project Git directory is a symlink');
  if(stat.isFile())return {existingRepository:true,branch:null,remotes:[],unsupportedGitdir:true};
  if(!stat.isDirectory()||await fsp.realpath(gitdir)!==gitdir)fail('GIT_UNSAFE_PATH','The project Git directory is unsafe');
  for(const name of ['HEAD','config']){const candidate=path.join(gitdir,name),s=await statMaybe(candidate);if(s&&(s.isSymbolicLink()||!s.isFile()||s.nlink>1||s.size>1024*1024))fail('GIT_UNSAFE_PATH','Project Git metadata is unsafe');}
  const options={fs,dir:root,gitdir},remotes=[];
  for(const entry of await git.listRemotes(options)){
    let url=null;try{if(/^https?:\/\//i.test(entry.url)){const u=new URL(entry.url);if(!u.username&&!u.password&&!u.search&&!u.hash)url=u.href;}else{const {parseGitRemote}=await import('./git-ssh-transport.js');url=parseGitRemote(entry.url).url;}}catch{}
    remotes.push({remote:entry.remote,url,...(!url?{redacted:true}:{})});
  }
  return {existingRepository:true,branch:await selectedBranch(options),remotes};
}

/** Run against a private object database; project source files are never checked out. */
export async function runBuiltinGit(input,{signal}={}){
  if(!input||typeof input!=='object'||!OPERATIONS.has(input.operation))fail('GIT_INVALID_OPERATION','Unknown built-in Git operation');
  const root=await projectRoot(input.projectRoot);if(input.operation==='detect')return detect(root);
  if(input.operation==='probe'){try{return await probe(input,signal);}catch(error){const safe=safeError(error);throw Object.assign(new Error(safe.message),safe);}}
  const branch=branchName(input.branch),write=WRITES.has(input.operation),validatedFiles=input.operation==='commit'?snapshotFiles(input.files):null,prefix=['commit','readSnapshot'].includes(input.operation)?scopePrefix(input.scopePrefix):null;
  if(write&&(!own(input,'expectedHead')||input.expectedHead!==null&&!oid(input.expectedHead)))fail('GIT_HEAD_REQUIRED','Pass the exact expected HEAD, or null for an unborn branch');
  const parent=path.join(root,'.workbench'),syncRoot=path.join(parent,'git-sync'),base=path.join(syncRoot,'repository'),repo=await repositoryPath(root,input.remoteUrl,branch),gitdir=path.join(repo,'.git');
  for(const directory of [parent,syncRoot,base,repo])if(!await canonicalDirectory(directory,{create:input.operation==='init'})){
    if(write)fail('GIT_NOT_INITIALIZED','Initialize the private Git mirror before writing');return input.operation==='readSnapshot'?{head:null,files:[]}:{initialized:false,head:null,branch,remoteHead:null,ahead:0,behind:0,dirty:false,status:[],branches:[],localBranches:[],remoteBranches:[]};
  }
  const lockPath=path.join(syncRoot,'engine.lock');if(!inside(root,lockPath))fail('GIT_UNSAFE_PATH','Private Git lock leaves the project');
  let lock;if(write)lock=await acquireLock(lockPath);
  else if(await statMaybe(lockPath)&&!await lockIsStale(lockPath))fail('GIT_BUSY','Another Git operation holds the private mirror lock');
  try{
    check(signal);await scanNoLinks(repo,signal);const options={fs,dir:repo,gitdir};
    const exists=await canonicalDirectory(gitdir);
    if(!exists){if(input.operation!=='init')fail('GIT_NOT_INITIALIZED','Initialize the private Git mirror before writing');expectHead(input,null);await git.init({...options,bare:true,defaultBranch:branch});}
    if(await git.getConfig({...options,path:'core.bare'})!==true)fail('GIT_UNSAFE_REPOSITORY','The private Git mirror must be an isolated bare object database');
    const before=await status(options,branch,signal);if(write)expectHead(input,before.head);
    if(write)clean(before);
    if(write&&input.operation!=='init'&&before.branch!==branch)fail('GIT_BRANCH_MISMATCH','Select the configured branch before synchronizing',{branch:before.branch,requestedBranch:branch});
    if(input.operation==='init'){
      if(before.branch!==branch){await git.writeRef({...options,ref:'HEAD',value:`refs/heads/${branch}`,symbolic:true,force:true});}
      // Every remote URL and branch has an independent object database. Switching
      // a binding can never push another repository's history to the new server.
      await git.setConfig({...options,path:'remote.origin.url',value:input.remoteUrl});
      await git.setConfig({...options,path:'remote.origin.fetch',value:'+refs/heads/*:refs/remotes/origin/*'});
      return status(options,branch,signal);
    }
    if(input.operation==='status'||input.operation==='branches')return before;
    if(input.operation==='readSnapshot'){
      const requested=input.ref??'head',ref=requested==='head'||requested==='HEAD'?'HEAD':requested==='remote'?`refs/remotes/origin/${branch}`:requested;
      if(!oid(ref)&&ref!=='HEAD'&&ref!==`refs/heads/${branch}`&&ref!==`refs/remotes/origin/${branch}`)fail('GIT_INVALID_REF','Read only the selected branch or an explicit commit object');
      const commit=oid(ref)?ref:await resolveMaybe(options,ref);return {head:commit,files:commit?await readFiles(options,commit,prefix,signal):[]};
    }
    if(input.operation==='commit'){
      if(typeof input.message!=='string'||!input.message.trim()||input.message.length>10000||input.message.includes('\0'))fail('GIT_INVALID_COMMIT','Use a bounded commit message');
      const author=input.author;if(!author||['name','email'].some(key=>typeof author[key]!=='string'||!author[key].trim()||author[key].length>200||/[\x00-\x1f<>]/.test(author[key])))fail('GIT_INVALID_AUTHOR','Configure the commit author name and email');
      // Inspect only this namespace. Other repository files, links and submodules
      // remain untouched tree entries and are never materialized on disk.
      await readFiles(options,before.head,prefix,signal);
      const replacement=await snapshotTree(options,validatedFiles),previousTree=await rootTree(options,before.head),tree=await replaceSubtree(options,previousTree,prefix.split('/'),replacement);
      if(tree===previousTree)return {...before,created:false,commit:before.head};
      check(signal);const commit=await git.writeCommit({...options,commit:{tree,parent:before.head?[before.head]:[],author:{name:author.name,email:author.email,timestamp:Math.floor(Date.now()/1000),timezoneOffset:0},committer:{name:author.name,email:author.email,timestamp:Math.floor(Date.now()/1000),timezoneOffset:0},message:input.message.trim()+'\n'}});
      expectHead(input,await head(options));await git.writeRef({...options,ref:`refs/heads/${branch}`,value:commit,force:true});return {...await status(options,branch,signal),created:true,commit};
    }
    if(input.operation==='fastForward'){
      const remoteHead=await resolveMaybe(options,`refs/remotes/origin/${branch}`);if(!remoteHead)fail('GIT_REMOTE_BRANCH_NOT_FOUND','Fetch the selected remote branch before pulling');
      if(before.head&&before.head!==remoteHead&&!await git.isDescendent({...options,oid:remoteHead,ancestor:before.head}))fail('GIT_NON_FAST_FORWARD','Repository histories diverged; automatic merging and reset are disabled');
      check(signal);expectHead(input,await head(options));if(before.head!==remoteHead)await git.writeRef({...options,ref:`refs/heads/${branch}`,value:remoteHead,force:true});return {...await status(options,branch,signal),updated:before.head!==remoteHead};
    }
    const transport=await remoteTransport(input,signal),network={...options,...transport,remote:'origin',ref:branch,onAuth:authentication(input.credentials),onAuthFailure:()=>fail('GIT_AUTH_FAILED','Git authentication was refused'),onProgress:()=>check(signal),onMessage:()=>{}};
    if(input.operation==='fetch'){
      const remote=await probe({...input,branch},signal);
      if(!remote.branchExists){await git.deleteRef({...options,ref:`refs/remotes/origin/${branch}`});return {...await status(options,branch,signal),fetched:true,branchExists:false,fetchHead:null,remoteBranches:remote.branches};}
      const result=await git.fetch({...network,singleBranch:false,tags:false});expectHead(input,await head(options));return {...await status(options,branch,signal),fetched:true,branchExists:true,fetchHead:result.fetchHead||null};
    }
    if(input.operation==='push'){
      if(!before.head)fail('GIT_NO_COMMITS','Create a commit before pushing');
      const result=await git.push({...network,remoteRef:branch,force:false});expectHead(input,await head(options));if(!result.ok||result.error||Object.values(result.refs||{}).some(ref=>!ref.ok))fail('GIT_REMOTE_REJECTED','The remote refused one or more Git updates');
      await git.writeRef({...options,ref:`refs/remotes/origin/${branch}`,value:before.head,force:true});return {...await status(options,branch,signal),pushed:true};
    }
  }catch(error){const safe=safeError(error);throw Object.assign(new Error(safe.message),safe);}
  finally{if(lock){await lock.close();if(path.resolve(lockPath)!==path.join(root,'.workbench','git-sync','engine.lock'))fail('GIT_UNSAFE_PATH','Private Git lock identity changed');await fsp.unlink(lockPath);}}
}

async function cli(){
  let size=0;const chunks=[];for await(const chunk of process.stdin){size+=chunk.length;if(size>MAX_JSON)fail('GIT_INPUT_LIMIT','Git helper input exceeds the supported size');chunks.push(chunk);}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('GIT_INVALID_INPUT','Git helper input must be JSON');}
  const timeout=Number.isSafeInteger(input.timeoutMs)&&input.timeoutMs>=1000&&input.timeoutMs<=120000?input.timeoutMs:60000;
  const result=await runBuiltinGit(input,{signal:AbortSignal.timeout(timeout)});process.stdout.write(JSON.stringify({ok:true,result}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch(error=>{process.stdout.write(JSON.stringify({ok:false,error:safeError(error)}));process.exitCode=1;});
