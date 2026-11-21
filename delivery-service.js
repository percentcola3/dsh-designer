import path from 'node:path';
import { createHash, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { DesignerError } from './store.js';

const MAX_FILE = 32 * 1024 * 1024, MAX_PACKAGE = 128 * 1024 * 1024, MAX_ARCHIVE = MAX_PACKAGE + 16_000_000;
const MIME = {html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',eot:'application/vnd.ms-fontobject',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',json:'application/json',zip:'application/zip'};
const STATIC_EXT = new Set(['css','js','mjs','png','jpg','jpeg','webp','gif','svg','avif','ico','woff','woff2','ttf','otf','eot','mp4','webm','mp3','ogg','wav']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = () => new Date().toISOString();
const uid = prefix => `${prefix}-${randomUUID()}`;
const clone = value => JSON.parse(JSON.stringify(value));
function fail(code,message,details={}) { throw new DesignerError(code,message,details); }
function id(value,prefix) { if (typeof value !== 'string' || !new RegExp(`^${prefix}-[a-zA-Z0-9-]{1,80}$`).test(value)) fail('INVALID_ID',`Invalid ${prefix} identifier`); return value; }
function text(value,label,max=1000) { if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))fail('INVALID_INPUT',`Invalid ${label}`);return value; }
function relative(value) { text(value,'relative path',2000);if(value.includes('\\')||path.posix.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..')||value.split('/').some(p=>p==='.git'||p==='.workbench'||p.startsWith('.env')))fail('INVALID_PATH','Path must stay inside the selected public content scope');return value; }
function signalCheck(signal) { signal?.throwIfAborted(); }
function policyCheck(policy) { if(!policy||!['read-only','workspace-write','danger-full-access'].includes(policy.mode)||typeof policy.workspaceRoot!=='string')fail('MISSING_POLICY','The current call sandbox policy is required');return policy; }
function userOnly(context) { if(context.user!==true||context.agent)fail('USER_ONLY','This action requires an explicit user operation'); }
function httpURL(value) {const u=new URL(text(value,'URL',4096));if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('INVALID_URL','Use an HTTP(S) URL without embedded credentials');return u.href;}
function urlPath(value) {return value.split('/').map(segment=>segment==='..'||segment==='.'?segment:encodeURIComponent(segment)).join('/');}
function mimeFor(name) {return MIME[path.posix.extname(name).slice(1).toLowerCase()]||'application/octet-stream';}
function base64(value) {if(typeof value!=='string'||value.length>Math.ceil(MAX_PACKAGE/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))fail('INVALID_BASE64','Expected canonical bounded base64');const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)fail('INVALID_BASE64','Noncanonical base64');return bytes;}
function redact(value) {return String(value||'').replace(/(Bearer\s+)[\w.\-+/=]+/gi,'$1[redacted]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@').replace(/((?:token|password|secret|authorization|api[_-]?key)\s*[=:]\s*)[^\s&]+/gi,'$1[redacted]').slice(0,512000);}
function safeCaptureMetadata(value) {
  if(!value||typeof value!=='object')return {};
  const result={},keys=['captureId','projectId','pageId','projectRevision','pageRevision','sourceHtmlHash','savedSourceHash','resourceCount','scope','background','editorMarks','editorMarkCount','fontStatus','imageFailures','capabilityRevoked'];
  for(const key of keys){const item=value[key];if(typeof item==='string')result[key]=item.slice(0,2000);else if(typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))result[key]=item;}
  if(Array.isArray(value.nodeIds))result.nodeIds=value.nodeIds.filter(item=>typeof item==='string'&&item.length<=128).slice(0,200);
  for(const [key,fields]of Object.entries({region:['x','y','width','height','scale'],viewport:['width','height'],documentBounds:['width','height'],runtime:['present','readyState','scene'],sourceVersion:['pageRevision','sourceHash'],boundsVersion:['pageRevision','sourceHash','scene']}))if(value[key]&&typeof value[key]==='object'){const item={};for(const field of fields){const entry=value[key][field];if(typeof entry==='string')item[field]=entry.slice(0,2000);else if(entry===null||typeof entry==='boolean'||typeof entry==='number'&&Number.isFinite(entry))item[field]=entry;}result[key]=item;}
  if(result.boundsVersion&&value.boundsVersion?.viewport&&typeof value.boundsVersion.viewport==='object')result.boundsVersion.viewport=Object.fromEntries(['width','height'].filter(key=>Number.isFinite(value.boundsVersion.viewport[key])).map(key=>[key,value.boundsVersion.viewport[key]]));
  return result;
}
function stripCapabilities(value) {if(Array.isArray(value))return value.map(stripCapabilities);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='capability').map(([key,item])=>[key,stripCapabilities(item)]));return value;}
function redactDetails(value) {if(typeof value==='string')return redact(value);if(Array.isArray(value))return value.map(redactDetails);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,redactDetails(item)]));return value;}
function htmlEscape(value) {return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function metadata(value) {const result=JSON.stringify(value,null,2);if(Buffer.byteLength(result)>4_000_000)fail('TOO_LARGE','Delivery metadata exceeds 4 MB');return result;}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
/** Portable deterministic ZIP32, method STORE, UTF-8 names, independently checked CRCs. */
export function zipStored(files) {
  if(!Array.isArray(files)||files.length>4000)fail('ZIP_LIMIT','Too many archive entries');
  const chunks=[],central=[],seen=new Set();let offset=0,total=0;
  for(const file of [...files].sort((a,b)=>a.path.localeCompare(b.path))){
    const name=Buffer.from(relative(file.path),'utf8'),bytes=Buffer.isBuffer(file.bytes)?file.bytes:base64(file.bytesBase64);
    if(seen.has(file.path)||name.length>65535)fail('INVALID_ZIP_ENTRY','Duplicate or oversized ZIP name');seen.add(file.path);total+=bytes.length;
    if(total>MAX_PACKAGE||bytes.length>MAX_FILE)fail('ZIP_LIMIT','Archive exceeds the bounded package size');
    const crc=crc32(bytes),local=Buffer.alloc(30),entry=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
    entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(0,10);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
    chunks.push(local,name,bytes);central.push(entry,name);offset+=local.length+name.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);if(offset+directory.length+end.length>MAX_ARCHIVE)fail('ZIP_LIMIT','ZIP directory overhead exceeds the archive limit');return Buffer.concat([...chunks,directory,end]);
}

// All script inputs are JSON stdin. This fixed program executes only inside the
// composed shell world; Host code never imports node:fs or child_process.
const HELPER = String.raw`
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),C=require('node:fs').constants;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const within=(root,p)=>{const r=path.relative(root,p);return r===''||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
const bad=(code,message,details={})=>{throw Object.assign(Error(message),{code,details})};
function git(cwd,args,env={},input){const r=cp.spawnSync('git',['--literal-pathspecs','-c','core.fsmonitor=false',...args],{cwd,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',...env},input,encoding:'utf8',timeout:90000,maxBuffer:2000000});return {code:r.status??-1,stdout:r.stdout||'',stderr:r.stderr||String(r.error?.message||'')}}
function checked(cwd,args,env={},input){const r=git(cwd,args,env,input);if(r.code!==0)bad('GIT_FAILED',r.stderr||'Git failed',{...r,args:args[0]});return r.stdout}
function status(cwd){const raw=checked(cwd,['status','--porcelain=v1','-z','--untracked-files=all']),parts=raw.split('\0'),files=[];for(let i=0;i<parts.length;i++){if(!parts[i])continue;const p=parts[i],xy=p.slice(0,2),name=p.slice(3);files.push({path:name,index:xy[0],worktree:xy[1],...(xy.includes('R')||xy.includes('C')?{from:parts[++i]}:{})})}return {branch:git(cwd,['symbolic-ref','--quiet','--short','HEAD']).stdout.trim()||null,head:git(cwd,['rev-parse','--verify','HEAD']).stdout.trim()||null,files,conflicts:files.filter(f=>['DD','AU','UD','UA','DU','AA','UU'].includes(f.index+f.worktree)).map(f=>f.path)}}
function paths(cwd,values){if(!Array.isArray(values)||!values.length||values.length>200)bad('PATH_SELECTION_REQUIRED','Select explicit file paths');for(const p of values){if(typeof p!=='string'||!p||p.includes('\0')||p.includes('\\')||path.isAbsolute(p)||p.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git'))bad('INVALID_PATH','Invalid selected Git file');if(!within(cwd,path.resolve(cwd,p)))bad('INVALID_PATH','Git path escapes source')}return [...new Set(values)]}
async function publish(input){const root=await fs.realpath(input.root);if(root!==path.resolve(input.root))bad('PATH_CHANGED','Delivery root changed');const written=[];for(const file of input.files){const rel=file.path;if(typeof rel!=='string'||rel.includes('\\')||rel.split('/').some(x=>!x||x==='.'||x==='..')||path.isAbsolute(rel))bad('INVALID_PATH','Invalid delivery path');const target=path.resolve(root,rel);if(!within(root,target)||target!==file.target)bad('PATH_ESCAPE','Delivery target escapes root');let parent=root;for(const part of rel.split('/').slice(0,-1)){parent=path.join(parent,part);try{await fs.mkdir(parent)}catch(e){if(e.code!=='EEXIST')throw e}const s=await fs.lstat(parent);if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(parent)!==parent)bad('PATH_ESCAPE','Unsafe delivery directory')}const bytes=Buffer.from(file.bytesBase64,'base64');if(bytes.toString('base64')!==file.bytesBase64||sha(bytes)!==file.sha256)bad('INTEGRITY_MISMATCH','Delivery bytes do not match hash');let h;try{h=await fs.open(target,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);await h.writeFile(bytes);await h.sync()}catch(e){if(e.code!=='EEXIST')throw e;const s=await fs.lstat(target);if(!s.isFile()||s.isSymbolicLink()||s.size!==bytes.length)bad('FILE_CONFLICT','Delivery artifact already has different bytes')}finally{if(h)await h.close()}const read=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);try{if(sha(await read.readFile())!==file.sha256)bad('FILE_CONFLICT','Delivery file hash differs')}finally{await read.close()}if(await fs.realpath(root)!==root||await fs.realpath(parent)!==parent||await fs.realpath(target)!==target)bad('PATH_CHANGED','Delivery publication path changed');written.push(rel)}return {written}}
async function main(input){if(input.op==='write')return publish(input);const cwd=await fs.realpath(input.cwd);if(cwd!==input.cwd)bad('PATH_CHANGED','Source directory changed');if(input.op==='status')return status(cwd);if(input.op==='branches')return {branches:checked(cwd,['for-each-ref','--format=%(refname:short)','refs/heads/','refs/remotes/']).trim().split('\n').filter(Boolean),current:status(cwd).branch};if(input.op==='diff'){const args=['diff','--no-ext-diff','--no-textconv',...(input.staged?['--cached']:[]),'--',...(input.paths?paths(cwd,input.paths):[])];return {diff:checked(cwd,args)}}
if(input.op==='commit'){const chosen=paths(cwd,input.paths),before=status(cwd);if(before.conflicts.length)bad('GIT_CONFLICT','Resolve existing Git conflicts',{status:before});if(input.expectedHead!==undefined&&input.expectedHead!==before.head)bad('VERSION_CONFLICT','Git HEAD changed',{status:before});for(const p of chosen){try{const s=await fs.lstat(path.join(cwd,p));if(!s.isFile())bad('INVALID_PATH','Select regular files, not directories or symlinks')}catch(e){if(e.code!=='ENOENT')throw e;if(git(cwd,['ls-files','--error-unmatch','--',p]).code!==0)bad('INVALID_PATH','Selected missing file is not tracked')}}const gitDir=await fs.realpath(checked(cwd,['rev-parse','--absolute-git-dir']).trim()),token=crypto.randomUUID(),temporary=path.join(gitDir,'dsh-delivery-index-'+token),env={GIT_INDEX_FILE:temporary};let result;try{checked(cwd,before.head?['read-tree',before.head]:['read-tree','--empty'],env);checked(cwd,['add','-A','--',...chosen],env);const changed=checked(cwd,['diff','--cached','--name-only','-z',...(before.head?[before.head]:[]),'--'],env).split('\0').filter(Boolean);if(!changed.length)bad('NO_CHANGES','Selected paths have no changes');if(changed.some(p=>!chosen.includes(p)))bad('GIT_SCOPE','Isolated index contains unselected changes');const tree=checked(cwd,['write-tree'],env).trim(),commit=checked(cwd,['commit-tree',tree,...(before.head?['-p',before.head]:[])],env,input.message+'\n').trim();checked(cwd,['update-ref','-m','Designer selected-path commit','HEAD',commit,before.head||'']);const reset=git(cwd,['reset','-q',commit,'--',...chosen]);result={success:true,commit,paths:changed,indexWarning:reset.code?reset.stderr:null,status:status(cwd)}}finally{for(const file of [temporary,temporary+'.lock']){if(path.dirname(file)!==gitDir||!path.basename(file).startsWith('dsh-delivery-index-'+token))bad('PATH_ESCAPE','Invalid temporary Git index cleanup');await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e})}}return result}
if(['pull','push','checkout'].includes(input.op)){const before=status(cwd);if(before.conflicts.length)bad('GIT_CONFLICT','Resolve existing Git conflicts',{status:before});if(input.expectedHead!==undefined&&input.expectedHead!==before.head)bad('VERSION_CONFLICT','Git HEAD changed',{status:before});if(input.op!=='push'&&before.files.length)bad('GIT_DIRTY','Commit or discard source changes before changing branches or pulling',{status:before});let r;if(input.op==='checkout'){if(!input.branch||input.branch.startsWith('-')||git(cwd,['check-ref-format','--branch',input.branch]).code!==0)bad('INVALID_BRANCH','Invalid Git branch');if(input.create)r=git(cwd,['switch','-c',input.branch]);else if(git(cwd,['show-ref','--verify','--quiet','refs/heads/'+input.branch]).code===0)r=git(cwd,['switch','--',input.branch]);else if(git(cwd,['show-ref','--verify','--quiet','refs/remotes/'+input.branch]).code===0){const remote=checked(cwd,['remote']).trim().split('\n').sort((a,b)=>b.length-a.length).find(name=>input.branch.startsWith(name+'/'));if(!remote)bad('INVALID_BRANCH','Remote tracking branch has no configured remote');const local=input.branch.slice(remote.length+1);if(local==='HEAD')bad('INVALID_BRANCH','Select a named remote branch');if(git(cwd,['show-ref','--verify','--quiet','refs/heads/'+local]).code===0){const upstream=checked(cwd,['for-each-ref','--format=%(upstream:short)','refs/heads/'+local]).trim();if(upstream!==input.branch)bad('BRANCH_EXISTS','A local branch with this name tracks a different source',{branch:local,upstream});r=git(cwd,['switch','--',local])}else r=git(cwd,['switch','--track','-c',local,input.branch])}else r=git(cwd,['switch','--',input.branch])}else{const remotes=checked(cwd,['remote']).trim().split('\n');if(!remotes.includes(input.remote))bad('REMOTE_NOT_FOUND','Select a configured Git remote');const branch=input.branch||before.branch;if(!branch||branch.startsWith('-')||git(cwd,['check-ref-format','--branch',branch]).code!==0)bad('INVALID_BRANCH','Select a named Git branch');r=git(cwd,input.op==='pull'?['pull','--ff-only','--no-rebase','--',input.remote,branch]:['push','--',input.remote,branch])}return {success:r.code===0,stdout:r.stdout,stderr:r.stderr,status:status(cwd),code:r.code===0?null:'GIT_OPERATION_FAILED'}}bad('INVALID_OPERATION','Unknown helper operation')}
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{raw+=s;if(raw.length>220000000)process.exit(1)});process.stdin.on('end',()=>main(JSON.parse(raw)).then(value=>process.stdout.write(JSON.stringify({ok:true,value}))).catch(e=>{process.stdout.write(JSON.stringify({ok:false,error:{code:e.code||'DELIVERY_FAILED',message:e.message,details:e.details||{}}}));process.exitCode=1}));
`;
const COMMAND=`node -e '${HELPER.replace(/'/g,"'\\''")}'`;

function deliveryHelp(action){
  const project={projectId:'required project ID'},source={...project,sourceId:'required registered r- source ID'},cas={expectedRevision:'required current project revision'},configuration={name:'optional display name, up to 200 characters',directory:'optional existing source directory; root/path are aliases',root:'alias of directory',path:'alias of directory',writable:'optional boolean; true opts into source editing within the existing sandbox',readonly:'optional boolean; false opts into source editing; writable=true takes precedence',writablePaths:'optional array of at most 200 canonical source-relative paths',command:'optional start command, up to 16000 characters; null/empty clears it',port:'optional integer 1..65535; null clears it',url:'optional HTTP(S) URL without embedded credentials; null/empty clears it'},selection={designId:'optional single saved design; designIds takes precedence',designIds:'optional nonempty design ID array restricting selected pages',pageId:'optional single saved page; pageIds takes precedence',pageIds:'optional nonempty page ID array within the selected designs',artboardId:'alias of pageId when pageIds/pageId are omitted',expectedPageRevisions:'optional map of selected page IDs to their expected revisions'},image={viewport:'optional temporary image viewport {width,height}; does not change the saved page size',region:'optional page-coordinate rectangle for image export',nodeIds:'optional selected node IDs for image capture',scene:'optional scene ID; takes precedence over sceneId',sceneId:'alias of scene',quality:'optional image encoder quality; 0 is preserved',fullPage:'optional boolean, default true; false keeps viewport capture',background:'optional boolean, default true; false requests transparent background',editorMarks:'optional boolean, default false'},exportFields={...project,...cas,...selection,format:'optional zip (default), design-package, png, jpeg or webp; image formats require exactly one saved page',...image};
  const definitions={
    'source.register':{description:'Register an existing source directory (user).',fields:{...project,...cas,...configuration,directory:'required existing source directory, unless root/path is supplied'},userOnly:true,returns:'source, project, projectRevision',constraints:['Registration keeps the source in place and does not broaden sandbox access.']},
    'source.list':{description:'List registered sources and their current runs.',fields:project,returns:'sources[], projectRevision'},
    'source.status':{description:'Read one registered source and its run state.',fields:source,returns:'source including run, projectRevision'},
    'source.update':{description:'Update a stopped source registration (user).',fields:{...source,...cas,...configuration},userOnly:true,returns:'source, project, projectRevision',constraints:['Stop a running command before changing its registration.']},
    'source.unregister':{description:'Stop and unregister a source (user).',fields:{...source,...cas},userOnly:true,returns:'removed source ID, project, projectRevision',constraints:['Stops and awaits the owned run; does not delete source files.']},
    'source.start':{description:'Start the registered source command (user).',fields:{...source,command:'optional override; otherwise uses registered command',port:'optional integer 1..65535; otherwise uses registered port',url:'optional HTTP(S) URL without embedded credentials; otherwise uses registered URL'},userOnly:true,returns:'source, run with status/startedAt/url/port/readiness',constraints:['Uses the current sandbox; readiness is unverified until the actual runtime is observed. A running source must be stopped first.']},
    'source.stop':{description:'Stop and await the owned source command (user).',fields:source,userOnly:true,returns:'source, stopped'},
    'source.logs':{description:'Read redacted incremental source-command output.',fields:{...source,stdoutOffset:'optional nonnegative integer, default 0; resume from returned stdout.nextOffset',stderrOffset:'optional nonnegative integer, default 0; resume from returned stderr.nextOffset'},returns:'run, stdout/stderr {text,nextOffset,lossy}; no run yields empty streams'},
    'source.map':{description:'Resolve a generated location using its source map.',fields:{...source,generatedFile:'required canonical source-relative generated file path',mapPath:'optional source-relative map path; default generatedFile + .map',line:'required generated line, 1-based positive integer',column:'optional generated column, 0-based nonnegative integer; default 0'},returns:'mode=source with path/file/line/column, or mode=reference with reason/referenceOnly',constraints:['Only existing contained source-map targets with reliable mappings become editable source locations.']},
    'git.status':{description:'Read the registered repository status.',fields:source,returns:'branch, head, files[{path,index,worktree,from?}], conflicts[], sourceId'},
    'git.diff':{description:'Read a bounded repository diff.',fields:{...source,paths:'optional explicit source-relative files, at most 200; omitted means all changes',staged:'optional boolean, default false; true reads the index diff'},returns:'diff, sourceId'},
    'git.branches':{description:'List local and remote-tracking branches.',fields:source,returns:'branches[], current, sourceId'},
    'git.commit':{description:'Commit only explicitly selected files (user).',fields:{...source,paths:'required nonempty array of at most 200 canonical relative regular files or tracked deletions',message:'required commit message, up to 10000 characters',expectedHead:'optional expected HEAD commit; mismatch rejects'},userOnly:true,returns:'success, commit, paths[], indexWarning, status, sourceId',constraints:['Keeps unrelated staged files outside the new commit; existing conflicts must be resolved first. Does not push.']},
    'git.pull':{description:'Pull a configured remote with fast-forward only (user).',fields:{...source,remote:'optional configured remote name, default origin',branch:'optional named branch, default current branch',expectedHead:'optional expected HEAD commit; mismatch rejects'},userOnly:true,returns:'success, stdout, stderr, status, sourceId',constraints:['Requires saved/discarded project drafts and a clean conflict-free repository; does not rebase or resolve conflicts.']},
    'git.push':{description:'Push HEAD to a configured remote branch (user).',fields:{...source,remote:'optional configured remote name, default origin',branch:'optional destination branch, default current branch',expectedHead:'optional expected HEAD commit; mismatch rejects'},userOnly:true,returns:'success, stdout, stderr, status, sourceId',constraints:['Requires saved/discarded project drafts and no existing conflicts; does not create commits or force push.']},
    'git.checkout':{description:'Switch or create a source branch (user).',fields:{...source,branch:'required valid local branch or remote-tracking branch name',create:'optional boolean, default false; true creates a local branch',expectedHead:'optional expected HEAD commit; mismatch rejects'},userOnly:true,returns:'success, stdout, stderr, status, sourceId',constraints:['Requires saved/discarded project drafts and a clean conflict-free repository; remote-tracking names switch/create their local tracking branch.']},
    'export.create':{description:'Export saved pages with their local dependencies.',fields:{...exportFields,captures:'optional 1–24 image requests sharing the selected page and format; each may override scene, sceneId, nodeIds, viewport, region, quality, fullPage, background or editorMarks. Saved sequentially in one call. Returns complete, captures and projectRevision; an incomplete batch includes failedIndex and error. Retry the remaining requests with the returned current revision.'},returns:'single export record and manifest, or bounded batch capture receipts, projectRevision',constraints:['Requires write permission. Saves no unsaved draft. Selected content must fit 100 pages, 4000 files, 32 MiB per file and 128 MiB total static content. Missing/remote dependencies fail; image formats need the browser capture adapter.']},
    'export.list':{description:'List recorded versioned exports.',fields:project,returns:'exports[], projectRevision'},
    'export.get':{description:'Read one export record and its verified manifest.',fields:{...project,exportId:'required recorded e- export ID'},returns:'export, manifest, projectRevision'},
    'share.create':{description:'Create a versioned local preview link (user).',fields:{...exportFields,exportId:'optional existing export ID; omitted creates a saved-page export using the selection/format fields',scope:'required owner, local-link or unlisted',hosting:'optional local (default); external fails until a publisher is configured'},userOnly:true,returns:'share with owner-visible URL, project, projectRevision',constraints:['Requires explicit access scope and current project CAS. Frozen files form the read-only allowlist; external deployment is not connected.']},
    'share.list':{description:'List share records and revocation state.',fields:project,returns:'shares[], projectRevision; capability URLs are returned only to the owner user'},
    'share.update':{description:'Update share access or its frozen export (user).',fields:{...project,...cas,shareId:'required s- share ID',expectedShareRevision:'required current share revision',scope:'optional owner, local-link or unlisted',exportId:'optional existing export ID replacing the frozen version; stable URL is preserved'},userOnly:true,returns:'share, project, projectRevision',constraints:['A revoked share cannot be updated; create a new share instead.']},
    'share.revoke':{description:'Revoke a local preview link immediately (user).',fields:{...project,...cas,shareId:'required s- share ID',expectedShareRevision:'required current share revision'},userOnly:true,returns:'share with revokedAt, project, projectRevision'}
  };
  if(action===undefined||action===null||action==='')return {actions:Object.entries(definitions).map(([action,value])=>({action,description:value.description}))};
  if(typeof action!=='string'||!Object.hasOwn(definitions,action))fail('UNKNOWN_ACTION','Unknown delivery help action');return clone({action,userOnly:false,...definitions[action]});
}

export class DeliveryService {
  constructor(owner) {this.owner=owner;this.ctx=owner.ctx;this.store=owner.store;this.runs=new Map();this.disposed=false;this.pending=new Set();this.lifetime=new AbortController();this.shareTickets=new Map();}
  help(action){return deliveryHelp(action);}
  execute(input,context={}) {
    const signal=AbortSignal.any([this.lifetime.signal,...(context.signal?[context.signal]:[])]),operation=this._execute(input,{...context,signal}).then(value=>context.user===true&&!context.agent?value:stripCapabilities(value));this.pending.add(operation);operation.then(()=>this.pending.delete(operation),()=>this.pending.delete(operation));return operation;
  }
  async _execute(input,context={}) {
    text(input?.action,'action',80);id(input.projectId,'p');policyCheck(context.policy);signalCheck(context.signal);
    if(this.disposed)fail('DISPOSED','Delivery service has been disposed');
    if(context.agent&&this.owner.bindings?.get(context.agent.id)!==input.projectId)fail('PROJECT_SCOPE','This agent is not bound to the requested project');
    if(input.action.startsWith('source.'))return this.source(input,context);
    if(input.action.startsWith('git.'))return this.git(input,context);
    if(input.action.startsWith('export.'))return this.exports(input,context);
    if(input.action.startsWith('share.'))return this.shares(input,context);
    fail('UNKNOWN_ACTION','Unknown delivery action');
  }
  async project(projectId,signal) {const {value}=await this.store.projectRecord(id(projectId,'p'),signal);return value;}
  async mutate(input,context,summary,change) {return this.store.mutate(input.projectId,input.expectedRevision,summary,p=>{p.workbench||={schemaVersion:1};return change(p,p.workbench)},context.signal,context.policy,false);}
  records(project) {const value=project.workbench?.deliveryRecords;return value&&typeof value==='object'&&!Array.isArray(value)?value:{exports:[],shares:[]};}
  async helper(input,context,workdir) {
    const spec=this.ctx.shell.resolve({command:COMMAND,stdin:JSON.stringify(input),workdir,signal:context.signal,sandboxPolicy:context.policy,timeoutMs:120000,onExpiry:'kill',stdoutMaxBytes:2_000_000});
    const handle=await this.ctx.shell.execute(spec);const result=await handle.result();signalCheck(context.signal);
    if(result.sandbox?.denied)fail('FS_SANDBOX_DENIED','The current sandbox refused this delivery operation');
    if(result.timedOut||result.aborted||result.stdout.truncated)fail('DELIVERY_PROCESS_FAILED','Delivery process did not complete within its limits');
    let payload;try{payload=JSON.parse(result.stdout.text)}catch{fail('DELIVERY_PROCESS_FAILED',redact(result.stderr?.text)||'Delivery process returned no valid receipt')}
    if(!payload.ok)fail(payload.error.code,redact(payload.error.message),redactDetails(payload.error.details));
    if(result.exitCode!==0)fail('DELIVERY_PROCESS_FAILED',redact(result.stderr?.text));return payload.value;
  }
  async directory(source,signal) {const target=await this.ctx.fs.resolve(source.directory,{signal});const info=await this.ctx.fs.stat(target,signal);if(info?.type!=='directory')fail('SOURCE_NOT_FOUND','Registered source directory is unavailable');const directory=this.ctx.fs.processPath(target);if(directory!==source.directory)fail('SOURCE_MOVED','Source directory canonical identity changed; register it again');return {target,directory};}
  sourceRecord(project,input) {const source=(project.workbench?.sourceProjects||[]).find(s=>s.id===id(input.sourceId,'r'));if(!source)fail('SOURCE_NOT_FOUND','Source project is not registered');return source;}
  runView(run) {return run?{id:run.id,status:run.status,startedAt:run.startedAt,endedAt:run.endedAt||null,exitCode:run.exitCode??null,url:run.url||null,port:run.port||null,readiness:'unverified',error:run.error||null}:null;}
  sourceView(project,source) {return {...source,run:this.runView(this.runs.get(`${project.id}:${source.id}`))};}
  async source(input,context) {
    const project=await this.project(input.projectId,context.signal),action=input.action.slice(7);
    if(action==='list')return {sources:(project.workbench?.sourceProjects||[]).map(s=>this.sourceView(project,s)),projectRevision:project.revision};
    if(action==='register'){
      userOnly(context);const target=await this.ctx.fs.resolve(text(input.directory||input.root||input.path,'source directory',4096),{signal:context.signal});if((await this.ctx.fs.stat(target,context.signal))?.type!=='directory')fail('INVALID_SOURCE','Select an existing source directory');
      const source={id:uid('r'),name:text(input.name||path.basename(this.ctx.fs.processPath(target)),'source name',200),directory:this.ctx.fs.processPath(target),root:this.ctx.fs.processPath(target),readonly:true,writable:false,referenceOnly:true,createdAt:stamp(),updatedAt:stamp()};
      this.configureSource(source,input);const next=await this.mutate(input,context,'Register source project',(_p,w)=>{w.sourceProjects||=[];if(w.sourceProjects.some(s=>s.directory===source.directory))fail('SOURCE_EXISTS','Directory is already registered');w.sourceProjects.push(source)});return {source,project:next,projectRevision:next.revision};
    }
    const source=this.sourceRecord(project,input),key=`${project.id}:${source.id}`,run=this.runs.get(key);
    if(action==='status')return {source:this.sourceView(project,source),projectRevision:project.revision};
    if(action==='logs'){
      if(!run)return {run:null,stdout:{text:'',nextOffset:0},stderr:{text:'',nextOffset:0}};
      const stdoutOffset=input.stdoutOffset??0,stderrOffset=input.stderrOffset??0;if(!Number.isSafeInteger(stdoutOffset)||stdoutOffset<0||!Number.isSafeInteger(stderrOffset)||stderrOffset<0)fail('INVALID_OFFSET','Log offsets must be nonnegative integers');
      const read=(stream,offset)=>{const value=stream.readFrom(offset);return {text:redact(value.text),nextOffset:value.nextOffset,lossy:!!value.lossy}};
      return {run:this.runView(run),stdout:read(run.handle.observed.stdout,stdoutOffset),stderr:read(run.handle.observed.stderr,stderrOffset)};
    }
    if(action==='map')return this.mapSource(source,input,context);
    if(action==='start'){
      userOnly(context);if(run?.status==='running')fail('SOURCE_RUNNING','Source command is already running');const {directory}=await this.directory(source,context.signal),command=text(input.command??source.command,'start command',16000),url=input.url?httpURL(input.url):source.url,port=input.port??source.port;
      if(port!==undefined&&(!Number.isSafeInteger(port)||port<1||port>65535))fail('INVALID_PORT','Choose a port between 1 and 65535');
      const controller=new AbortController(),onAbort=()=>controller.abort(context.signal.reason);context.signal?.addEventListener('abort',onAbort,{once:true});
      let handle;try{handle=await this.ctx.shell.execute(this.ctx.shell.resolve({command,workdir:directory,signal:controller.signal,sandboxPolicy:context.policy,onExpiry:'none',timeoutMs:120000,stdoutMaxBytes:512000}))}catch(error){context.signal?.removeEventListener('abort',onAbort);throw error}
      const entry={id:uid('run'),status:'running',startedAt:stamp(),controller,handle,url:url||(port?`http://127.0.0.1:${port}/`:null),port};
      entry.finished=handle.result().then(result=>{entry.exitCode=result.exitCode;entry.status=entry.status==='stopped'||result.aborted?'stopped':result.exitCode===0&&!result.aborted&&!result.timedOut?'exited':'failed';if(result.sandbox?.denied)entry.error='Sandbox denied source command';},error=>{entry.status='failed';entry.error=redact(error.message)}).finally(()=>{entry.endedAt=stamp();context.signal?.removeEventListener('abort',onAbort)});
      this.runs.set(key,entry);if(this.disposed){await this.stopRun(entry);fail('DISPOSED','Delivery owner was disposed while starting')};return {source:{...source,run:this.runView(entry)},run:this.runView(entry)};
    }
    if(action==='stop'){userOnly(context);if(run)await this.stopRun(run);return {source:this.sourceView(project,source),stopped:!!run};}
    if(action==='update'||action==='unregister'){
      userOnly(context);if(action==='update'&&run?.status==='running')fail('SOURCE_RUNNING','Stop the source command before changing its registration');if(action==='unregister'&&run)await this.stopRun(run);
      let changedDirectory;const requestedDirectory=input.directory??input.root??input.path;if(action==='update'&&requestedDirectory!==undefined){const target=await this.ctx.fs.resolve(text(requestedDirectory,'source directory',4096),{signal:context.signal});if((await this.ctx.fs.stat(target,context.signal))?.type!=='directory')fail('INVALID_SOURCE','Choose an existing source directory');changedDirectory=this.ctx.fs.processPath(target)}
      const next=await this.mutate(input,context,action==='update'?'Update source project':'Unregister source project',(_p,w)=>{const current=w.sourceProjects.find(s=>s.id===source.id);if(action==='unregister')w.sourceProjects=w.sourceProjects.filter(s=>s.id!==source.id);else{if(changedDirectory){if(w.sourceProjects.some(other=>other.id!==source.id&&other.directory===changedDirectory))fail('SOURCE_EXISTS','Directory is already registered');current.directory=changedDirectory;current.root=changedDirectory}if(input.name!==undefined)current.name=text(input.name,'source name',200);this.configureSource(current,input);current.updatedAt=stamp()}});if(action==='unregister')this.runs.delete(key);return {project:next,projectRevision:next.revision,...(action==='update'?{source:next.workbench.sourceProjects.find(s=>s.id===source.id)}:{removed:source.id})};
    }
    fail('UNKNOWN_ACTION','Unknown source project action');
  }
  configureSource(source,input) {if(input.writable!==undefined||input.readonly!==undefined){source.writable=input.writable===true||input.readonly===false;source.readonly=!source.writable}if(input.writablePaths!==undefined){if(!Array.isArray(input.writablePaths)||input.writablePaths.length>200)fail('INVALID_INPUT','Invalid source writable paths');source.writablePaths=input.writablePaths.map(relative)}if(input.command!==undefined){if(input.command===null||input.command==='')delete source.command;else source.command=text(input.command,'start command',16000)}if(input.port!==undefined){if(input.port===null)delete source.port;else{if(!Number.isSafeInteger(input.port)||input.port<1||input.port>65535)fail('INVALID_PORT','Invalid source port');source.port=input.port}}if(input.url!==undefined){if(input.url===null||input.url==='')delete source.url;else source.url=httpURL(input.url)}}
  async stopRun(run) {if(run.status==='running'){run.status='stopped';run.controller.abort();run.handle.kill()}await run.handle.done;await run.finished;}
  async git(input,context) {
    const project=await this.project(input.projectId,context.signal),source=this.sourceRecord(project,input),{directory}=await this.directory(source,context.signal),operation=input.action.slice(4);
    if(!['status','diff','branches','commit','pull','push','checkout'].includes(operation))fail('UNKNOWN_ACTION','Unknown Git action');
    if(['commit','pull','push','checkout'].includes(operation))userOnly(context);
    if(['pull','push','checkout'].includes(operation)){
      if(!this.owner.workbench?.hasUnsavedDrafts)fail('DRAFT_CHECK_UNAVAILABLE','Cannot change Git state until the draft index can be checked');const drafts=await this.owner.workbench.hasUnsavedDrafts(input.projectId,{signal:context.signal});if(drafts.dirty)fail('UNSAVED_DRAFTS','Save or discard drafts before this Git operation',{resources:drafts.resources});
    }
    if(operation==='commit')text(input.message,'commit message',10000);
    const value=await this.helper({op:operation,cwd:directory,paths:input.paths,staged:!!input.staged,message:input.message,expectedHead:input.expectedHead,remote:input.remote||'origin',branch:input.branch,create:!!input.create},context,directory);
    if(value.diff)value.diff=redact(value.diff);if(value.stderr)value.stderr=redact(value.stderr);if(value.stdout)value.stdout=redact(value.stdout);return {...value,sourceId:source.id};
  }
  async mapSource(source,input,context) {
    const fallback=reason=>({mode:'reference',referenceOnly:true,reason,sourceId:source.id,generatedFile:input.generatedFile||null});
    try {
      const {target:root}=await this.directory(source,context.signal),generated=relative(input.generatedFile),mapPath=relative(input.mapPath||`${generated}.map`);
      const generatedTarget=await this.ctx.fs.resolve(path.join(source.directory,generated),{signal:context.signal});if(!this.ctx.fs.contains(root,generatedTarget)||(await this.ctx.fs.stat(generatedTarget,context.signal))?.type!=='file')return fallback('GENERATED_FILE_UNAVAILABLE');
      const target=await this.ctx.fs.resolve(path.join(source.directory,mapPath),{signal:context.signal});if(!this.ctx.fs.contains(root,target))return fallback('MAP_OUTSIDE_SOURCE');const info=await this.ctx.fs.stat(target,context.signal);if(info?.type!=='file'||info.size>4_000_000)return fallback('NO_RELIABLE_SOURCE_MAP');
      const map=JSON.parse(await this.ctx.fs.readText(target,context.signal));if(map.version!==3||!Array.isArray(map.sources)||typeof map.mappings!=='string'||map.sections)return fallback('UNSUPPORTED_SOURCE_MAP');
      if(map.file&&path.posix.basename(map.file)!==path.posix.basename(generated))return fallback('SOURCE_MAP_FILE_MISMATCH');
      const location=decodeMapping(map.mappings,input.line,input.column??0);if(!location)return fallback('NO_MAPPING_AT_LOCATION');let sourceName=map.sources[location.source];if(typeof sourceName!=='string')return fallback('SOURCE_MAP_SOURCE_MISSING');
      sourceName=sourceName.replace(/^webpack:\/\/[^/]*\//,'').replace(/^\.\//,'');const sourceFile=path.resolve(source.directory,path.posix.dirname(mapPath),map.sourceRoot||'',sourceName),sourceTarget=await this.ctx.fs.resolve(sourceFile,{signal:context.signal});if(!this.ctx.fs.contains(root,sourceTarget)||(await this.ctx.fs.stat(sourceTarget,context.signal))?.type!=='file')return fallback('MAPPED_SOURCE_UNAVAILABLE');
      if(typeof map.sourcesContent?.[location.source]==='string'&&hash(await this.ctx.fs.readText(sourceTarget,context.signal))!==hash(map.sourcesContent[location.source]))return fallback('SOURCE_MAP_CONTENT_STALE');
      return {mode:'source',referenceOnly:false,sourceId:source.id,file:this.ctx.fs.processPath(sourceTarget),path:path.relative(source.directory,this.ctx.fs.processPath(sourceTarget)).split(path.sep).join('/'),line:location.line+1,column:location.column,generatedFile:generated,generatedLine:input.line,generatedColumn:input.column??0};
    }catch{signalCheck(context.signal);return fallback('NO_RELIABLE_SOURCE_MAP')}
  }
  async readProjectBytes(projectId,logical,signal,maxBytes=MAX_FILE) {
    relative(logical);const root=await this.store.target(`projects/${projectId}`,signal),target=await this.store.target(`projects/${projectId}/${logical}`,signal);
    if(!this.ctx.fs.contains(root,target))fail('PATH_OUTSIDE_PROJECT','Delivery resource leaves its project');const before=await this.ctx.fs.stat(target,signal);if(before?.type!=='file')fail('EXPORT_RESOURCE_MISSING','A referenced delivery resource is missing',{path:logical});
    const bytes=Buffer.from(await this.ctx.fs.readBytes(target,signal,maxBytes));const after=await this.ctx.fs.stat(target,signal);if(before.version!==after?.version)fail('VERSION_CONFLICT','Resource changed during export',{path:logical});return bytes;
  }
  async writeFiles(projectId,files,context) {
    const root=await this.store.target(`projects/${projectId}`,context.signal),rootPath=this.ctx.fs.processPath(root),prepared=[];let total=0;
    for(const file of files){relative(file.path);const bytes=file.bytes||base64(file.bytesBase64);total+=bytes.length;if(total>MAX_ARCHIVE+4_000_000)fail('EXPORT_LIMIT','Delivery snapshot and package exceed the write limit');const target=await this.store.target(`projects/${projectId}/${file.path}`,context.signal);if(!this.ctx.fs.contains(root,target))fail('PATH_OUTSIDE_PROJECT','Delivery target leaves the project');prepared.push({path:file.path,target:this.ctx.fs.processPath(target),bytesBase64:bytes.toString('base64'),sha256:hash(bytes)})}
    const result=await this.helper({op:'write',root:rootPath,files:prepared},context,rootPath);if(result.written.length!==prepared.length||prepared.some(f=>!result.written.includes(f.path)))fail('INVALID_RECEIPT','Not all delivery files were confirmed');return result;
  }
  selectedPages(project,input) {
    const allDesigns=project.workbench?.designs||[],designs=allDesigns.filter(d=>!d.deletedAt),deletedDesigns=allDesigns.filter(d=>d.deletedAt);let pages=project.artboards.filter(p=>!p.deletedAt&&!deletedDesigns.some(d=>d.id===p.designId||(d.pageIds||[]).includes(p.id)));
    const designIds=input.designIds||(input.designId?[input.designId]:null);if(designIds){if(!Array.isArray(designIds)||!designIds.length)fail('INVALID_SELECTION','Select at least one design');const chosen=designIds.map(value=>{const design=designs.find(d=>d.id===value);if(!design)fail('DESIGN_NOT_FOUND','Selected design is unavailable');return design});const ids=new Set(chosen.flatMap(d=>d.pageIds||[]));pages=pages.filter(p=>ids.has(p.id)||chosen.some(d=>d.id===p.designId));}
    const pageIds=input.pageIds||(input.pageId?[input.pageId]:input.artboardId?[input.artboardId]:null);if(pageIds){if(!Array.isArray(pageIds)||!pageIds.length)fail('INVALID_SELECTION','Select at least one page');const chosen=pageIds.map(value=>{const page=pages.find(p=>p.id===value);if(!page)fail('PAGE_NOT_FOUND','Selected page is unavailable');return page});pages=[...new Map(chosen.map(p=>[p.id,p])).values()]}
    if(!pages.length||pages.length>100)fail('EMPTY_EXPORT','Select between one and 100 saved pages');
    for(const page of pages)if(input.expectedPageRevisions?.[page.id]!==undefined&&input.expectedPageRevisions[page.id]!==page.revision)fail('VERSION_CONFLICT','A selected page changed',{pageId:page.id,currentRevision:page.revision});return {pages,designs:designs.filter(d=>pages.some(p=>p.designId===d.id||(d.pageIds||[]).includes(p.id)))};
  }
  async snapshot(project,input,context) {
    const selected=this.selectedPages(project,input),files=new Map(),warnings=[],pages=[],queue=[];let total=0;
    const add=(logical,bytes,mimeType,publicFile=true)=>{relative(logical);const existing=files.get(logical);if(existing){if(hash(existing.bytes)!==hash(bytes))fail('EXPORT_PATH_COLLISION','Export files share a path with different bytes',{path:logical});return}total+=bytes.length;if(total>MAX_PACKAGE||files.size>=4000||bytes.length>MAX_FILE)fail('EXPORT_LIMIT','Export content exceeds package limits');files.set(logical,{path:logical,bytes,mimeType,public:publicFile})};
    const pagePaths=new Set(selected.pages.map(p=>relative(p.htmlPath)));
    const resolve=(value,from,navigation=false)=>{
      if(!navigation&&/^about:blank#asset-(?:unavailable|cycle)$/.test(value))return 'data:,';
      if(!value||/^(?:#|data:|mailto:|tel:)/i.test(value))return value;
      if(/^[a-z][a-z0-9+.-]*:/i.test(value)||value.startsWith('//')){if(navigation&&/^https?:\/\//i.test(value))return value;fail('EXPORT_REMOTE_RESOURCE','Archive every remote asset before exporting',{url:redact(value),from})}
      const match=/^([^?#]*)([?#][\s\S]*)?$/.exec(value),pathname=decodeURIComponent(match[1]),suffix=match[2]||'';
      if(!pathname)return value;const logical=path.posix.normalize(pathname.startsWith('/')?pathname.slice(1):path.posix.join(path.posix.dirname(from),pathname));relative(logical);
      if(navigation){if(!pagePaths.has(logical)){warnings.push({code:'UNEXPORTED_NAVIGATION',from,path:logical});return '#unexported-page'}}
      else {if(!STATIC_EXT.has(path.posix.extname(logical).slice(1).toLowerCase()))fail('EXPORT_UNSUPPORTED_RESOURCE','A resource is not an allowed static delivery asset',{path:logical});if(!files.has(logical))queue.push(logical)}
      const rewritten=path.posix.relative(path.posix.dirname(from),logical);return `${urlPath(rewritten||path.posix.basename(logical))}${suffix}`;
    };
    const parser=await import('parse5');
    const render=async(page)=>{
      const current=await this.store.artboardGet(project.id,page.id,context.signal);if(current.artboard.revision!==page.revision)fail('VERSION_CONFLICT','Page changed during export',{pageId:page.id});
      const documentExport=this.owner.documentExport||(await import('./document-model.js')).exportDocument;
      const result=await documentExport(current.html,{mode:'delivery',editorMarks:!!input.editorMarks,pageId:page.id,pageIds:selected.pages.map(p=>p.id),pageURLs:Object.fromEntries(selected.pages.map(p=>[p.id,urlPath(path.posix.relative(path.posix.dirname(page.htmlPath),p.htmlPath))]))});for(const diagnostic of result.diagnostics||[])if(diagnostic.severity==='warning'&&diagnostic.code!=='UNVERIFIED_RESOURCE')warnings.push({...diagnostic,pageId:page.id});const document=parser.parse(result.html);
      const walk=node=>{
        if(node.childNodes){node.childNodes=node.childNodes.filter(child=>child.tagName!=='base');for(const child of node.childNodes)walk(child)}if(node.content)walk(node.content);
        if(!node.tagName)return;const attrs=node.attrs||[];
        for(const attr of attrs){const name=attr.name.toLowerCase();if(['src','poster','background'].includes(name)||name==='href'&&node.tagName==='link'||name==='href'&&['use','image','feimage'].includes(node.tagName.toLowerCase()))attr.value=resolve(attr.value,page.htmlPath);else if(name==='href'&&['a','area'].includes(node.tagName))attr.value=resolve(attr.value,page.htmlPath,true);else if(name==='srcset'||name==='imagesrcset')attr.value=rewriteSrcset(attr.value,value=>resolve(value,page.htmlPath));else if(name==='style')attr.value=rewriteCSS(attr.value,value=>resolve(value,page.htmlPath));}
        if(node.tagName==='style')for(const child of node.childNodes||[])if(child.nodeName==='#text')child.value=rewriteCSS(child.value,value=>resolve(value,page.htmlPath));
        if(node.tagName==='script'&&attrs.some(a=>a.name==='id'&&a.value==='dsh-document-model'))for(const child of node.childNodes||[])if(child.nodeName==='#text'){const parsed=JSON.parse(child.value),allowed=['schemaVersion','interactions','scenes','states','responsive','definitions','overrides','runtime'],model=Object.fromEntries(allowed.filter(key=>parsed[key]!==undefined).map(key=>[key,parsed[key]]));model.runtime={mode:'delivery',pageId:page.id,pageURLs:Object.fromEntries(selected.pages.map(p=>[p.id,urlPath(path.posix.relative(path.posix.dirname(page.htmlPath),p.htmlPath))]))};rewriteModelResources(model,(value,navigation=false)=>resolve(value,page.htmlPath,navigation));child.value=JSON.stringify(model).replace(/</g,'\\u003c');}
        if(node.tagName==='script'&&!attrs.some(a=>a.name==='src')&&!attrs.some(a=>a.name==='type'&&/json|importmap/i.test(a.value)))for(const child of node.childNodes||[])if(child.nodeName==='#text')child.value=rewriteJS(child.value,value=>resolve(value,page.htmlPath));
      };
      walk(document);const html=parser.serialize(document);add(page.htmlPath,Buffer.from(html),'text/html; charset=utf-8');pages.push({id:page.id,name:page.name,htmlPath:page.htmlPath,revision:page.revision,contentHash:hash(html),viewport:page.viewport,designId:page.designId||null});
    };
    for(const page of selected.pages)await render(page);
    const visited=new Set();while(queue.length){signalCheck(context.signal);const logical=queue.shift();if(visited.has(logical)||files.has(logical))continue;visited.add(logical);let bytes=await this.readProjectBytes(project.id,logical,context.signal);const extension=path.posix.extname(logical).slice(1).toLowerCase();if(extension==='css')bytes=Buffer.from(rewriteCSS(new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=>resolve(value,logical)));if(['js','mjs'].includes(extension))bytes=Buffer.from(rewriteJS(new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=>resolve(value,logical)));add(logical,bytes,mimeFor(logical));}
    if(!files.has('index.html'))add('index.html',Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(project.name)}</title></head><body><main><h1>${htmlEscape(project.name)}</h1><nav>${pages.map(page=>`<p><a href="${htmlEscape(urlPath(page.htmlPath))}">${htmlEscape(page.name)}</a></p>`).join('')}</nav></main></body></html>`),'text/html; charset=utf-8');
    if(input.format==='design-package'){
      const designData={schemaVersion:1,project:{id:project.id,name:project.name,platform:project.platform},designs:selected.designs.map(d=>({id:d.id,name:d.name,platform:d.platform,folder:d.folder,pageIds:pages.filter(p=>p.designId===d.id||(d.pageIds||[]).includes(p.id)).map(p=>p.id),binding:d.binding?Object.fromEntries(['mode','systemId','version'].filter(key=>d.binding[key]!==undefined).map(key=>[key,d.binding[key]])):null})),pages};add('design-package.json',Buffer.from(metadata(designData)),'application/json',false);
    }
    return {files:[...files.values()],pages,warnings,entryPath:pages[0].htmlPath};
  }
  exportRecord(project,input) {const record=(this.records(project).exports||[]).find(e=>e.id===id(input.exportId,'e'));if(!record)fail('EXPORT_NOT_FOUND','Export is unavailable');return record;}
  async exportManifest(project,record,signal) {const saved=await this.store.read(`projects/${project.id}/${record.manifestPath}`,signal);if(hash(saved.content)!==record.manifestHash)fail('INTEGRITY_MISMATCH','Export manifest changed');const manifest=JSON.parse(saved.content);if(manifest.exportId!==record.id||!Array.isArray(manifest.files))fail('INVALID_EXPORT','Export manifest identity is invalid');return manifest;}
  exportView(projectId,record) {return {...record,downloadUrl:`${this.origin()}/api/designer/download/${projectId}/${record.id}`};}
  origin() {return httpURL(this.ctx.webServer.getOrigin()).replace(/\/$/,'');}
  async captureBatch(input,project,context) {
    const {captures, ...base} = input;
    const imageOptions = new Set(['scene','sceneId','nodeIds','viewport','region','quality','fullPage','background','editorMarks']);
    if (!['png','jpeg','webp'].includes(base.format) || !Array.isArray(captures) || !captures.length || captures.length > 24) {
      fail('INVALID_CAPTURE_BATCH','Supply 1–24 capture requests and an image format');
    }
    for (const request of captures) {
      if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !imageOptions.has(key))) {
        fail('INVALID_CAPTURE_BATCH','Each capture may override image options only');
      }
    }
    if ((this.records(project).exports?.length || 0) + captures.length > 100) fail('LIMIT_REACHED','A project supports 100 recorded exports');
    let projectRevision = project.revision;
    const results = [];
    for (const [index, capture] of captures.entries()) {
      signalCheck(context.signal);
      try {
        const ownScene = Object.hasOwn(capture,'scene') || Object.hasOwn(capture,'sceneId');
        const scene = ownScene ? capture.scene ?? capture.sceneId ?? null : base.scene ?? base.sceneId ?? null;
        let request = {...base, ...capture, scene, sceneId:scene, expectedRevision:projectRevision};
        let effectiveContext = context;
        if (context.agent) {
          const authority = await this.owner.aiWorkbench.authorizeAction(request,context);
          request = authority.input || request;
          effectiveContext = {...context,policy:authority.policy || context.policy};
        }
        const saved = await this.exports(request,effectiveContext);
        projectRevision = saved.projectRevision;
        results.push({index,scene,
          export:saved.export,capture:saved.manifest.capture,warnings:saved.manifest.warnings});
      } catch (error) {
        signalCheck(context.signal);
        return {complete:false,captures:results,failedIndex:index,projectRevision:error.details?.currentRevision ?? projectRevision,
          error:{code:error.code || 'CAPTURE_FAILED',message:redact(error.message),details:redactDetails(error.details)}};
      }
    }
    return {complete:true,captures:results,projectRevision};
  }
  async exports(input,context) {
    const project=await this.project(input.projectId,context.signal),action=input.action.slice(7);
    if(action==='list')return {exports:(this.records(project).exports||[]).map(record=>this.exportView(project.id,record)),projectRevision:project.revision};
    if(action==='get'){const record=this.exportRecord(project,input);return {export:this.exportView(project.id,record),manifest:await this.exportManifest(project,record,context.signal),projectRevision:project.revision}}
    if(action!=='create')fail('UNKNOWN_ACTION','Unknown export action');if(input.expectedRevision!==project.revision)fail('VERSION_CONFLICT','Project changed before export',{currentRevision:project.revision});
    const format=input.format||'zip';if(!['zip','design-package','png','jpeg','webp'].includes(format))fail('INVALID_FORMAT','Choose ZIP, design package, PNG, JPEG or WebP');
    if(input.captures!==undefined)return this.captureBatch({...input,format},project,context);
    const snapshot=await this.snapshot(project,{...input,format},context),exportId=uid('e'),folder=`delivery/${exportId}`;let artifact,mimeType,extension,captureReceipt;
    if(['png','jpeg','webp'].includes(format)){
      if(snapshot.pages.length!==1)fail('IMAGE_PAGE_SELECTION','Choose exactly one page for an image export');if(typeof this.owner.imageCapture!=='function')fail('CAPTURE_UNAVAILABLE','The browser image capture adapter is unavailable');
      const page=snapshot.pages[0],html=snapshot.files.find(file=>file.path===page.htmlPath).bytes.toString('utf8');
      const viewport=input.viewport??page.viewport;if(!viewport||!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)||viewport.width<100||viewport.width>10000||viewport.height<100||viewport.height>20000||viewport.width*viewport.height>80_000_000)fail('INVALID_CAPTURE_VIEWPORT','Choose a bounded image viewport');
       const options={viewport:{width:viewport.width,height:viewport.height},region:input.region||null,nodeIds:input.nodeIds??[],scene:input.scene??input.sceneId??null,sceneId:input.sceneId??input.scene??null,quality:input.quality,fullPage:input.fullPage!==false,background:input.background!==false,editorMarks:!!input.editorMarks};
      const capture=await this.owner.imageCapture({projectId:project.id,pageId:page.id,expectedRevision:project.revision,expectedArtboardRevision:page.revision,html,logicalPath:page.htmlPath,files:snapshot.files.map(file=>({path:file.path,bytesBase64:file.bytes.toString('base64'),mimeType:file.mimeType})),viewport:page.viewport,...options,format,signal:context.signal,policy:context.policy});artifact=base64(capture.bytesBase64);mimeType=validateImage(artifact,format);extension=format==='jpeg'?'jpg':format;
      const receipt=safeCaptureMetadata(capture.metadata);
      const warnings=(Array.isArray(capture.warnings)?capture.warnings:[]).slice(0,100).map(warning=>({code:typeof warning?.code==='string'?warning.code.slice(0,100):'CAPTURE_WARNING',message:redact(typeof warning==='string'?warning:warning?.message||warning?.text||'Image capture reported a warning').slice(0,2000),...(Number.isFinite(warning?.count)?{count:warning.count}:{})}));
      captureReceipt={format,...(Number.isFinite(capture.width)?{width:capture.width}:{}),...(Number.isFinite(capture.height)?{height:capture.height}:{}),requested:{...safeCaptureMetadata(options),scene:typeof options.scene==='string'?options.scene.slice(0,128):null,fullPage:options.fullPage,...(Number.isFinite(options.quality)?{quality:options.quality}:{})},metadata:receipt,warnings};snapshot.warnings.push(...warnings);
    }else{artifact=zipStored(snapshot.files);mimeType='application/zip';extension='zip'}
    const artifactPath=`${folder}/artifact.${extension}`,manifest={schemaVersion:1,exportId,projectId:project.id,projectRevision:project.revision,format,...(captureReceipt?{capture:captureReceipt}:{}),pages:snapshot.pages,entryPath:snapshot.entryPath,warnings:snapshot.warnings,files:snapshot.files.map(file=>({path:file.path,storedPath:`${folder}/files/${file.path}`,mimeType:file.mimeType,sha256:hash(file.bytes),byteLength:file.bytes.length,public:file.public})),artifact:{path:artifactPath,mimeType,sha256:hash(artifact),byteLength:artifact.length}};
    const manifestText=metadata(manifest),manifestPath=`${folder}/manifest.json`,record={id:exportId,format,revision:1,projectRevision:project.revision,pageIds:snapshot.pages.map(page=>page.id),manifestPath,manifestHash:hash(manifestText),artifactPath,mimeType,sha256:hash(artifact),byteLength:artifact.length,createdAt:stamp()};
    await this.writeFiles(project.id,snapshot.files.map(file=>({path:`${folder}/files/${file.path}`,bytes:file.bytes})),context);
    await this.writeFiles(project.id,[{path:artifactPath,bytes:artifact},{path:manifestPath,bytes:Buffer.from(manifestText)}],context);
    const next=await this.mutate(input,context,'Create portable export',(_p,w)=>{w.deliveryRecords||={exports:[],shares:[]};w.deliveryRecords.exports||=[];if(w.deliveryRecords.exports.length>=100)fail('LIMIT_REACHED','A project supports 100 recorded exports');w.deliveryRecords.exports.unshift(record)});return {export:this.exportView(project.id,record),manifest,project:next,projectRevision:next.revision};
  }
  shareView(projectId,record,user) {const {capability,...publicRecord}=record;return {...publicRecord,...(user?{url:record.externalUrl||`${this.origin()}/api/designer/share/${projectId}/${record.id}/${capability}/`}:{})};}
  async shares(input,context) {
    if(input.captures!==undefined)fail('INVALID_INPUT','Batch captures use export.create');
    let project=await this.project(input.projectId,context.signal);const action=input.action.slice(6);
    if(action==='list')return {shares:(this.records(project).shares||[]).map(record=>this.shareView(project.id,record,context.user===true&&!context.agent)),projectRevision:project.revision};
    userOnly(context);
    if(action==='create'){
      if(input.hosting!==undefined&&!['local','external'].includes(input.hosting))fail('INVALID_HOSTING','Choose local hosting or a configured external deployment');if(input.hosting==='external')fail('PUBLISHER_NOT_CONFIGURED','No external deployment service is connected; local versioned preview links are available');
      const scope=input.scope;if(!['owner','local-link','unlisted'].includes(scope))fail('SHARE_SCOPE_REQUIRED','Choose owner, local-link or unlisted access explicitly');
      let exported;if(input.exportId)exported=this.exportRecord(project,input);else{const created=await this.exports({...input,action:'export.create',format:input.format||'zip'},context);project=created.project;exported=created.export;}
      const manifest=await this.exportManifest(project,exported,context.signal),record={id:uid('s'),revision:1,exportId:exported.id,projectRevision:exported.projectRevision,entryPath:manifest.entryPath,scope,hosting:'local',capability:randomBytes(32).toString('base64url'),createdAt:stamp(),updatedAt:stamp(),revokedAt:null};
      const next=await this.mutate({...input,expectedRevision:project.revision},context,'Create versioned local share',(_p,w)=>{w.deliveryRecords||={exports:[],shares:[]};w.deliveryRecords.shares||=[];if(w.deliveryRecords.shares.length>=100)fail('LIMIT_REACHED','A project supports 100 shares');w.deliveryRecords.shares.unshift(record)});return {share:this.shareView(project.id,record,true),project:next,projectRevision:next.revision};
    }
    const share=(this.records(project).shares||[]).find(record=>record.id===id(input.shareId,'s'));if(!share)fail('SHARE_NOT_FOUND','Share is unavailable');
    if(!['update','revoke'].includes(action))fail('UNKNOWN_ACTION','Unknown share action');if(input.expectedShareRevision!==share.revision)fail('VERSION_CONFLICT','Share changed; reload its version',{currentRevision:share.revision});
    let newExport,newManifest;if(action==='update'){
      if(share.revokedAt)fail('SHARE_REVOKED','Create a new share after revocation');if(input.scope!==undefined&&!['owner','local-link','unlisted'].includes(input.scope))fail('INVALID_SCOPE','Unknown share access scope');
      if(input.exportId){newExport=this.exportRecord(project,input);newManifest=await this.exportManifest(project,newExport,context.signal)}
    }
    const next=await this.mutate(input,context,action==='revoke'?'Revoke local share':'Update local share',(_p,w)=>{const current=w.deliveryRecords.shares.find(record=>record.id===share.id);if(current.revision!==input.expectedShareRevision)fail('VERSION_CONFLICT','Share changed');if(action==='revoke')current.revokedAt=stamp();else{if(input.scope)current.scope=input.scope;if(newExport){current.exportId=newExport.id;current.projectRevision=newExport.projectRevision;current.entryPath=newManifest.entryPath}}current.revision++;current.updatedAt=stamp()});const saved=next.workbench.deliveryRecords.shares.find(record=>record.id===share.id);return {share:this.shareView(project.id,saved,true),project:next,projectRevision:next.revision};
  }
  ownerRequest(req) {try{return this.ctx.connection?.admit(req)?.peer?.principal?.kind==='owner'}catch{return false}}
  async handleArtifact(req,res) {
    if(!String(req.url||'').startsWith('/api/designer/download/'))return false;
    try{if(!['GET','HEAD'].includes(req.method))return respond(res,405,'Method not allowed',{'Allow':'GET, HEAD'});if(!this.ownerRequest(req))return respond(res,401,'Owner authentication required');const parts=new URL(req.url,'http://delivery.invalid').pathname.split('/').filter(Boolean);if(parts.length!==5)fail('NOT_FOUND','Artifact not found');const project=await this.project(parts[3]),record=this.exportRecord(project,{exportId:parts[4]}),bytes=await this.readProjectBytes(project.id,record.artifactPath,undefined,MAX_ARCHIVE);if(hash(bytes)!==record.sha256)fail('INTEGRITY_MISMATCH','Artifact hash changed');return respond(res,200,req.method==='HEAD'?null:bytes,{'Content-Type':record.mimeType,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${record.id}.${path.posix.extname(record.artifactPath).slice(1)}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})}catch(error){return respond(res,error.code==='INTEGRITY_MISMATCH'?409:404,'Artifact unavailable')}
  }
  async handleShare(req,res) {
    if(!String(req.url||'').startsWith('/api/designer/share/'))return false;
    if(this.disposed)return respond(res,410,'Preview service stopped');
    try{
      if(!['GET','HEAD'].includes(req.method))return respond(res,405,'Method not allowed',{'Allow':'GET, HEAD'});
      const parts=new URL(req.url,'http://delivery.invalid').pathname.split('/').filter(Boolean);if(parts.length<6)fail('NOT_FOUND','Share not found');
      const project=await this.project(parts[3]),record=(this.records(project).shares||[]).find(share=>share.id===parts[4]);
      if(!record||!['owner','local-link','unlisted'].includes(record.scope)||record.revokedAt||!equalToken(record.capability,parts[5]))fail('NOT_FOUND','Share not found');
      let ticketKey=null,start=6;
      if(parts[6]?.startsWith('~')){ticketKey=parts[6].slice(1);const ticket=this.shareTickets.get(ticketKey);if(!ticket||ticket.expiresAt<Date.now()||ticket.projectId!==project.id||ticket.shareId!==record.id||ticket.revision!==record.revision||ticket.exportId!==record.exportId)fail('NOT_FOUND','Preview ticket expired');start=7;}
      if(record.scope==='owner'&&!ticketKey&&!this.ownerRequest(req))return respond(res,401,'Owner authentication required');
      if(record.scope==='local-link'&&!isLoopback(req.socket?.remoteAddress))return respond(res,403,'This link is restricted to the local computer');
      const exported=this.exportRecord(project,{exportId:record.exportId}),manifest=await this.exportManifest(project,exported),logical=relative(parts.slice(start).map(decodeURIComponent).join('/')||record.entryPath),file=manifest.files.find(entry=>entry.path===logical&&entry.public===true);
      if(!file)fail('NOT_FOUND','File is not in the published preview');
      if(parts.length===start||record.scope==='owner'&&!ticketKey&&file.mimeType.startsWith('text/html')){
        if(record.scope==='owner'&&!ticketKey){for(const [key,ticket]of this.shareTickets)if(ticket.expiresAt<Date.now())this.shareTickets.delete(key);if(this.shareTickets.size>=1000)this.shareTickets.delete(this.shareTickets.keys().next().value);ticketKey=randomBytes(32).toString('base64url');this.shareTickets.set(ticketKey,{projectId:project.id,shareId:record.id,revision:record.revision,exportId:record.exportId,expiresAt:Date.now()+60*60*1000});}
        return respond(res,302,null,{Location:`${this.origin()}/api/designer/share/${project.id}/${record.id}/${record.capability}/${ticketKey?'~'+ticketKey+'/':''}${urlPath(logical)}`,'Referrer-Policy':'no-referrer'});
      }
      const bytes=await this.readProjectBytes(project.id,file.storedPath);if(hash(bytes)!==file.sha256||bytes.length!==file.byteLength)fail('INTEGRITY_MISMATCH','Shared snapshot file changed');
      const latest=await this.project(project.id),current=(this.records(latest).shares||[]).find(share=>share.id===record.id);if(!current||current.revokedAt||current.revision!==record.revision||current.exportId!==record.exportId||!equalToken(current.capability,record.capability))fail('NOT_FOUND','Share changed while reading its snapshot');
      const prefix=`${this.origin()}/api/designer/share/${project.id}/${record.id}/${record.capability}/${ticketKey?'~'+ticketKey+'/':''}`;
      const headers={'Content-Type':file.mimeType,'Content-Length':String(bytes.length),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','Content-Security-Policy':await shareCSP(prefix,file.mimeType.startsWith('text/html')?bytes.toString('utf8'):'')};return respond(res,200,req.method==='HEAD'?null:bytes,headers);
    }catch(error){return respond(res,error.code==='INTEGRITY_MISMATCH'?409:404,'Preview unavailable')}
  }
  async dispose() {this.disposed=true;this.lifetime.abort();await Promise.allSettled([...this.pending]);await Promise.all([...this.runs.values()].map(run=>this.stopRun(run)));this.runs.clear();this.shareTickets.clear();}
}

function respond(res,status,body,headers={}) {res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body??undefined);return true;}
function equalToken(expected,actual) {if(typeof expected!=='string'||typeof actual!=='string')return false;const a=Buffer.from(expected),b=Buffer.from(actual);return a.length===b.length&&timingSafeEqual(a,b);}
function isLoopback(value) {return value==='127.0.0.1'||value==='::1'||value==='::ffff:127.0.0.1';}
async function shareCSP(prefix,html) {
  const eventHashes=[];if(html){const {parse}=await import('parse5'),root=parse(html),walk=node=>{for(const attribute of node.attrs||[])if(/^on/i.test(attribute.name))eventHashes.push(`'sha256-${createHash('sha256').update(attribute.value).digest('base64')}'`);for(const child of node.childNodes||[])walk(child);if(node.content)walk(node.content)};walk(root)}
  const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(match=>!(/\bsrc\s*=/i.test(match[1]))&&!/\btype\s*=\s*["']application\/(?:json|ld\+json)["']/i.test(match[1])).map(match=>`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  return `sandbox allow-scripts; default-src 'none'; script-src ${prefix} ${[...new Set(hashes)].join(' ')} ${eventHashes.length?"'unsafe-hashes' "+[...new Set(eventHashes)].join(' '):''}; style-src 'unsafe-inline' ${prefix}; img-src data: ${prefix}; font-src data: ${prefix}; media-src ${prefix}; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
}
function validateImage(bytes,format) {if(bytes.length>MAX_FILE)fail('IMAGE_TOO_LARGE','Captured image exceeds 32 MiB');const valid=format==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):format==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)fail('CAPTURE_FORMAT_MISMATCH','Image capture did not return the requested real image format');return format==='jpeg'?'image/jpeg':`image/${format}`;}
const unescapeCSS=value=>value.replace(/\\([a-f0-9]{1,6})\s?|\\([^\r\n])/gi,(_all,hex,char)=>hex?String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff)||0xfffd):char);
function rewriteCSS(css,rewrite) {
  let result='',i=0;while(i<css.length){if(css.startsWith('/*',i)){const end=css.indexOf('*/',i+2);if(end<0){result+=css.slice(i);break}result+=css.slice(i,end+2);i=end+2;continue}
    const rest=css.slice(i),quoted=/^@import\s*(["'])((?:\\.|[^\\])*?)\1/i.exec(rest),url=/^url\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*?))\s*\)/i.exec(rest);
    if(quoted||url){const match=quoted||url,value=quoted?quoted[2]:url[1]??url[2]??url[3],mapped=rewrite(unescapeCSS(value).trim()).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,' ');result+=`${quoted?'@import ':''}url("${mapped}")`;i+=match[0].length;continue}
    if(css[i]==='"'||css[i]==="'"){const quote=css[i];result+=css[i++];while(i<css.length){const char=css[i++];result+=char;if(char==='\\'&&i<css.length)result+=css[i++];else if(char===quote)break}continue}result+=css[i++];if(result.length>MAX_FILE)fail('EXPORT_LIMIT','Rewritten CSS exceeds its file limit');
  }return result;
}
function rewriteModelResources(model,rewrite) {
  const visit=(value,parentKey='',responsive=false)=>{
    if(!value||typeof value!=='object')return;if(Array.isArray(value)){for(const item of value)visit(item,parentKey,responsive);return}
    for(const [key,item]of Object.entries(value)){
      if(typeof item==='string'){
        if(parentKey==='styles'||responsive)value[key]=rewriteCSS(item,url=>rewrite(url));
        else if(parentKey==='attributes'&&['src','poster','background'].includes(key))value[key]=rewrite(item);
        else if(parentKey==='attributes'&&['srcset','imagesrcset'].includes(key))value[key]=rewriteSrcset(item,url=>rewrite(url));
        else if(parentKey==='attributes'&&key==='style')value[key]=rewriteCSS(item,url=>rewrite(url));
        else if(parentKey==='attributes'&&key==='href')value[key]=rewrite(item,!STATIC_EXT.has(path.posix.extname(item.split(/[?#]/)[0]).slice(1).toLowerCase()));
        else if(key==='url'&&value.type==='navigate')value[key]=rewrite(item,true);
      }else visit(item,key,responsive||key==='responsive');
    }
  };visit(model);
}
function rewriteJS(js,rewrite) {
  const moduleURL=value=>{const mapped=rewrite(value);return /^(?:[./#]|[a-z][a-z0-9+.-]*:)/i.test(mapped)?mapped:'./'+mapped};
  if([...js.matchAll(/\bimport\s*\(\s*([^\s])/g)].some(match=>!['"',"'"].includes(match[1])))fail('EXPORT_DYNAMIC_IMPORT','Build dynamic module specifiers into a static delivery first');
  js=js.replace(/(\bnew\s+URL\s*\(\s*["'])([^"'\n]+)(["']\s*,\s*import\s*\.\s*meta\s*\.\s*url\s*\))/g,(_all,prefix,url,suffix)=>`${prefix}${moduleURL(url)}${suffix}`);
  return js.replace(/(\b(?:import|export)\s*(?:[^;\n"']*?\bfrom\s*)?["'])([^"'\n]+)(["'])|(\bimport\s*\(\s*["'])([^"'\n]+)(["']\s*\))/g,(all,prefix,url,suffix,dynamicPrefix,dynamicURL,dynamicSuffix)=>{
    const value=url??dynamicURL;if(!/^(?:\.|\/|https?:|data:)/i.test(value))fail('EXPORT_UNBUNDLED_MODULE','Bundle bare JavaScript module imports before portable delivery',{specifier:value});return `${prefix??dynamicPrefix}${moduleURL(value)}${suffix??dynamicSuffix}`;
  });
}
function rewriteSrcset(value,rewrite) {let i=0;const parts=[];while(i<value.length){while(i<value.length&&/[\s,]/.test(value[i]))i++;if(i>=value.length)break;const start=i,data=value.slice(i,i+5).toLowerCase()==='data:';while(i<value.length&&!/\s/.test(value[i])&&(data||value[i]!==','))i++;let url=value.slice(start,i),ended=false;if(data&&url.endsWith(',')){url=url.slice(0,-1);ended=true}const descriptorStart=i;if(!ended)while(i<value.length&&value[i]!==',')i++;const descriptor=ended?'':value.slice(descriptorStart,i).trim();parts.push(`${rewrite(url)}${descriptor?' '+descriptor:''}`);if(value[i]===',')i++}return parts.join(', ');}

function decodeMapping(mappings,line,column) {
  if(!Number.isSafeInteger(line)||line<1||!Number.isSafeInteger(column)||column<0)return null;
  let source=0,originalLine=0,originalColumn=0,selected=null;const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lines=mappings.split(';');if(line>lines.length)return null;
  for(let row=0;row<line;row++){let generated=0;for(const segment of lines[row].split(',')){if(!segment)continue;const values=[];let value=0,shift=0;for(const char of segment){const digit=chars.indexOf(char);if(digit<0||shift>30)return null;value|=(digit&31)<<shift;if(digit&32)shift+=5;else{values.push(value&1?-(value>>>1):value>>>1);value=0;shift=0}}if(shift)return null;generated+=values[0]||0;if(values.length>=4){source+=values[1];originalLine+=values[2];originalColumn+=values[3];if(row===line-1&&generated<=column)selected={source,line:originalLine,column:originalColumn}}else if(row===line-1&&generated<=column)selected=null;}}
  return selected&&selected.source>=0&&selected.line>=0&&selected.column>=0?selected:null;
}
