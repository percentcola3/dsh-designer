// Fixed managed-shell helper. Never imported by the Host service.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import git from 'isomorphic-git';
import nodeHttp from 'isomorphic-git/http/node';
import {parseGitRemote,createSSHTransport} from './git-ssh-transport.js';

const fsp=fs.promises,MAX_FILE=64*1024*1024,MAX_TOTAL=128*1024*1024,MAX_FILES=2000,MAX_INPUT=2*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const check=signal=>signal?.throwIfAborted();
export function importPublicPath(value){return typeof value==='string'&&!!value&&value.length<=2000&&!/[\\\x00-\x1f\x7f]/.test(value)&&!path.posix.isAbsolute(value)&&!/^[A-Za-z]:/.test(value)&&!value.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/^(?:node_modules|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|[^/]+\.(?:pem|key|p12|pfx)|credentials?(?:[.-].*)?|secrets?(?:[.-].*)?|project\.json|snapshots|versions|delivery)$/i.test(p));}
export function importBranch(value){if(typeof value!=='string'||!value||value.length>200||value==='HEAD'||value.startsWith('-')||value.startsWith('refs/')||/[\s\x00-\x20\x7f~^:?*\[\\]/.test(value)||value.includes('..')||value.includes('@{')||value.endsWith('.')||value.split('/').some(p=>!p||p.startsWith('.')||p.endsWith('.lock')))fail('IMPORT_INVALID_BRANCH','Choose a named repository branch');return value;}
function inside(root,target){return target===root||target.startsWith(root+path.sep);}
async function regularDirectory(target,{create=false}={}){if(create)await fsp.mkdir(target,{mode:0o700});const info=await fsp.lstat(target);if(!info.isDirectory()||info.isSymbolicLink()||await fsp.realpath(target)!==target)fail('IMPORT_UNSAFE_CACHE','Private import cache must be a canonical directory');}
async function jobRoot(input){
  if(typeof input.jobId!=='string'||!/^i-[a-zA-Z0-9-]{1,80}$/.test(input.jobId)||typeof input.knowledgeId!=='string'||!/^k-[a-zA-Z0-9-]{1,80}$/.test(input.knowledgeId)||typeof input.jobRoot!=='string'||!path.isAbsolute(input.jobRoot)||path.resolve(input.jobRoot)!==input.jobRoot||path.basename(input.jobRoot)!==input.jobId||path.basename(path.dirname(input.jobRoot))!=='knowledge-imports'||path.basename(path.dirname(path.dirname(input.jobRoot)))!=='.workbench'||path.basename(path.resolve(input.jobRoot,'../../..'))!==input.knowledgeId)fail('IMPORT_UNSAFE_CACHE','Use the exact private knowledge import directory');
  await regularDirectory(input.jobRoot);const marker=path.join(input.jobRoot,'owner.json'),stat=await fsp.lstat(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>1000)fail('IMPORT_UNSAFE_CACHE','Private import owner receipt is invalid');let owner;try{owner=JSON.parse(await fsp.readFile(marker,'utf8'));}catch{fail('IMPORT_UNSAFE_CACHE','Private import owner receipt is invalid');}if(owner.jobId!==input.jobId||owner.knowledgeId!==input.knowledgeId)fail('IMPORT_UNSAFE_CACHE','Private import owner identity differs');return input.jobRoot;
}
function remoteURL(value){let parsed;try{parsed=parseGitRemote(value);}catch{fail('IMPORT_INVALID_REMOTE','Use an HTTP(S) or SSH Git URL without embedded credentials');}if(parsed.type==='http'||parsed.type==='https'){let decoded;try{decoded=decodeURIComponent(/^https?:\/\/[^/]+(\/[^?#]*)/.exec(value)?.[1]||'/');}catch{fail('IMPORT_INVALID_REMOTE','Invalid repository URL');}if(/[\\\x00-\x1f\x7f]/.test(decoded)||decoded.split('/').some(p=>p==='.'||p==='..'))fail('IMPORT_INVALID_REMOTE','Repository URL cannot traverse paths');return {parsed,url:parsed.url.replace(/\/$/,'')};}return {parsed,url:value};}
async function transport(input,signal){
  const {parsed,url}=remoteURL(input.repositoryUrl);
  if(parsed.type==='ssh')return createSSHTransport({remoteUrl:url,credentials:input.credentials||{},signal,timeoutMs:90000,maxResponseBytes:MAX_TOTAL});
  const remote=new URL(url);return {url,http:{async request(request){
    const target=new URL(request.url);if(target.origin!==remote.origin||!target.pathname.startsWith(remote.pathname.replace(/\/$/,'')+'/'))fail('IMPORT_HTTP_SCOPE','Git transport cannot leave the selected repository');
    let response;try{response=await nodeHttp.request({...request,signal,fetchOptions:{followRedirects:false,maxRedirects:0,timeout:90000}});}catch{check(signal);fail('IMPORT_NETWORK_FAILED','Cannot connect to the Git repository');}
    if(response.statusCode>=300&&response.statusCode<400){await response.body.return?.();fail('IMPORT_REDIRECT_DENIED','Use the final repository URL; redirects are not followed');}
    const body=response.body;return {...response,body:(async function*(){let total=0;try{for await(const chunk of body){check(signal);total+=chunk.byteLength;if(total>MAX_TOTAL)fail('IMPORT_TRANSPORT_LIMIT','Git response exceeds 128 MiB');yield chunk;}}finally{await body.return?.();}})()};
  }}};
}
export async function extractImportTree(options,tree,filesRoot,{signal}={}){
  const files=[],failures=[],skipped={private:0,links:0,unsupported:0},seen=new Set();let totalBytes=0,visited=0,stopped=false;
  const visit=async(oid,prefix,depth)=>{check(signal);if(depth>64)fail('IMPORT_TREE_LIMIT','Repository tree exceeds 64 levels');const result=await git.readTree({...options,oid});
    for(const entry of result.tree){if(stopped)return;check(signal);if(++visited>20000)fail('IMPORT_TREE_LIMIT','Repository tree exceeds 20000 entries');const logical=prefix?prefix+'/'+entry.path:entry.path;
      if(!importPublicPath(logical)){skipped.private++;continue;}if(entry.type==='commit'||entry.mode==='160000'||entry.mode==='120000'){skipped.links++;continue;}
      if(entry.type==='tree'){if(entry.mode!=='040000'){skipped.unsupported++;continue;}await visit(entry.oid,logical,depth+1);continue;}
      if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode)){skipped.unsupported++;continue;}
      if(files.length+failures.length>=MAX_FILES){failures.push({path:logical,code:'IMPORT_BATCH_LIMIT',message:'Repository import stops at 2000 attempts'});stopped=true;return;}const key=logical.normalize('NFC').toLowerCase();if(seen.has(key)){failures.push({path:logical,code:'IMPORT_PATH_COLLISION',message:'Case-colliding file was skipped'});continue;}seen.add(key);
      const {blob}=await git.readBlob({...options,oid:entry.oid}),bytes=Buffer.from(blob);if(bytes.length>MAX_FILE){failures.push({path:logical,code:'IMPORT_FILE_LIMIT',message:'File exceeds 64 MiB'});continue;}if(totalBytes+bytes.length>MAX_TOTAL){failures.push({path:logical,code:'IMPORT_BYTE_LIMIT',message:'Repository import stops at 128 MiB'});stopped=true;return;}
      const storedPath='files/'+sha(logical+'\0'+entry.oid)+'.bin',target=path.join(filesRoot,path.basename(storedPath));if(!inside(filesRoot,target))fail('IMPORT_UNSAFE_CACHE','Staged file leaves the private cache');await fsp.writeFile(target,bytes,{flag:'wx',mode:0o600});totalBytes+=bytes.length;files.push({path:logical,storedPath,size:bytes.length,sha256:sha(bytes)});
    }
  };await visit(tree,'',0);return {files,failures,skipped,totalBytes};
}
export async function runKnowledgeGitImport(input,{signal}={}){
  check(signal);const root=await jobRoot(input);if(input.operation==='cleanup'){if(await fsp.realpath(root)!==root||path.basename(root)!==input.jobId)fail('IMPORT_UNSAFE_CACHE','Cleanup target changed');await fsp.rm(root,{recursive:true,force:true});return {cleaned:true};}if(input.operation!=='fetch')fail('IMPORT_INVALID_OPERATION','Unknown knowledge import helper operation');
  const remote=remoteURL(input.repositoryUrl),repository=path.join(root,'repository'),filesRoot=path.join(root,'files');await regularDirectory(repository,{create:true});await regularDirectory(filesRoot,{create:true});
  const options={fs,dir:repository,gitdir:repository,cache:{}},network=await transport(input,signal),credentials=input.credentials||{},onAuth=()=>({username:typeof credentials.username==='string'?credentials.username:'git',password:typeof credentials.password==='string'?credentials.password:typeof credentials.token==='string'?credentials.token:''});
  let branch=input.branch===undefined?null:importBranch(input.branch);
  if(!branch){const info=await git.getRemoteInfo2({...network,protocolVersion:1,onAuth,onAuthFailure:()=>fail('IMPORT_AUTH_FAILED','Git authentication was refused')}),head=info.refs?.find(r=>r.ref==='HEAD')?.target||info.capabilities?.symref;const match=typeof head==='string'?/(?:HEAD:)?refs\/heads\/(.+)$/.exec(head):null;if(!match)fail('IMPORT_BRANCH_REQUIRED','Select a branch; this repository has no default branch');branch=importBranch(match[1]);}
  await git.init({...options,bare:true,defaultBranch:branch});await git.setConfig({...options,path:'remote.origin.url',value:network.url});await git.setConfig({...options,path:'remote.origin.fetch',value:`+refs/heads/${branch}:refs/remotes/origin/${branch}`});check(signal);const fetched=await git.fetch({...options,...network,ref:branch,singleBranch:true,depth:1,tags:false,onAuth,onAuthFailure:()=>fail('IMPORT_AUTH_FAILED','Git authentication was refused'),onProgress:()=>check(signal)});check(signal);
  const head=fetched.fetchHead;if(typeof head!=='string'||!/^[0-9a-f]{40}$/.test(head))fail('IMPORT_NO_COMMIT','The selected branch has no importable commit');const {commit}=await git.readCommit({...options,oid:head}),result=await extractImportTree(options,commit.tree,filesRoot,{signal});
  return {...result,branch,head,repositoryUrl:remote.url};
}
export function importHelperError(error){if(error?.name==='AbortError')return {code:'IMPORT_ABORTED',message:'Knowledge import was cancelled'};if(error?.name==='TimeoutError')return {code:'IMPORT_TIMEOUT',message:'Knowledge import timed out'};if(typeof error?.code==='string'&&/^(?:IMPORT_|SSH_)[A-Z_]+$/.test(error.code))return {code:error.code,message:String(error.message).slice(0,300)};if(['HttpError','HTTPError'].includes(error?.code))return {code:'IMPORT_AUTH_OR_REMOTE_FAILED',message:'Git authentication or remote access was refused'};return {code:'IMPORT_GIT_FAILED',message:'Git import failed; no repository code was executed'};}
async function main(){const parts=[];let total=0;for await(const chunk of process.stdin){total+=chunk.length;if(total>MAX_INPUT)fail('IMPORT_INPUT_LIMIT','Import request exceeds its bound');parts.push(chunk);}let input;try{input=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('IMPORT_INVALID_INPUT','Invalid import helper request');}try{console.log(JSON.stringify({ok:true,result:await runKnowledgeGitImport(input)}));}catch(error){console.log(JSON.stringify({ok:false,error:importHelperError(error)}));process.exitCode=1;}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
