import path from 'node:path';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fail,policyAllowsTarget} from './store.js';

const OPERATIONS=new Set(['init','status','branches','commit','fetch','push','fastForward','readSnapshot','detect','probe','localCheckpoint']);
const WRITES=new Set(['init','commit','fetch','push','fastForward','localCheckpoint']);
// Linked plugins must launch the physical entry path so Node's CLI guard runs.
const HELPER=realpathSync(fileURLToPath(new URL('./builtin-git-helper.js',import.meta.url)));
const quote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
// Only these bundled paths appear in command text. All project data and secrets
// are JSON stdin, including repository URLs and binary portable snapshot files.
export const BUILTIN_GIT_COMMAND=`ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${quote(HELPER)}`;
const LIMIT=190*1024*1024;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));

export class BuiltinGitEngine {
  constructor(owner){this.owner=owner;this.pending=new Set();}
  async run(operation,input={},env={}){
    if(!OPERATIONS.has(operation))fail('GIT_INVALID_OPERATION','Unknown built-in Git operation');
    if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.projectId!=='string')fail('INVALID_INPUT','A project identifier is required');
    const {signal,policy}=env;signal?.throwIfAborted();
    if(!policy)fail('POLICY_REQUIRED','Built-in Git requires the current native file policy');
    const fs=this.owner.ctx.fs,shell=this.owner.ctx.shell;
    if(!shell?.resolve||!shell?.execute)fail('SHELL_UNAVAILABLE','Built-in Git requires the managed shell runtime');
    const physical=this.owner.projectPhysicalRoot?await this.owner.projectPhysicalRoot(input.projectId,signal):await this.owner.store.projectPhysicalRoot(input.projectId,signal);
    const root=await fs.resolve(physical,{signal}),projectRoot=fs.processPath(root),info=await fs.stat(root,signal);
    if(info?.type!=='directory'||!path.isAbsolute(projectRoot))fail('GIT_PROJECT_NOT_FOUND','The project directory is unavailable');
    const mirror=await fs.resolve(path.join(projectRoot,'.workbench','git-sync','repository'),{signal});
    if(operation!=='localCheckpoint'&&(!fs.contains(root,mirror)||fs.processPath(mirror)!==path.join(projectRoot,'.workbench','git-sync','repository')))fail('GIT_UNSAFE_PATH','Private Git repository canonical identity changed');
    if(WRITES.has(operation)){
      if(policy.mode==='read-only'||!await policyAllowsTarget(fs,policy,root,signal))fail('FS_SANDBOX_DENIED','The native policy does not allow writes to this project');
      if(operation!=='localCheckpoint'&&(!own(input,'expectedHead')||input.expectedHead!==null&&!/^[a-f0-9]{40}$/.test(input.expectedHead)))fail('GIT_HEAD_REQUIRED','Pass the exact expected HEAD, or null for an unborn branch');
    }
    if(this.pending.has(projectRoot))fail('GIT_BUSY','A Git operation is already running for this project');
    this.pending.add(projectRoot);
    try{
      // Do not forward arbitrary input keys (or caller-supplied paths) into the helper.
      const request={operation,projectRoot};
      for(const key of ['branch','remoteUrl','expectedHead','scopePrefix','files','message','author','credentials','ref','timeoutMs'])if(own(input,key))request[key]=clone(input[key]);
      const stdin=JSON.stringify(request);if(Buffer.byteLength(stdin)>LIMIT)fail('GIT_INPUT_LIMIT','Git snapshot input exceeds the supported size');
      const currentPolicy={...policy,mode:policy.mode==='read-only'?'read-only':'workspace-write',workspaceRoot:operation==='localCheckpoint'?path.join(projectRoot,'.git'):projectRoot,additionalWritableRoots:[]};
      // A read operation under a writable parent may still use a read-only helper.
      // fetch/probe network transport uses Node; no system git or ssh is invoked.
      if(!WRITES.has(operation))currentPolicy.mode='read-only';
      const spec=shell.resolve({command:BUILTIN_GIT_COMMAND,stdin,workdir:projectRoot,signal,sandboxPolicy:currentPolicy,timeoutMs:125000,onExpiry:'kill',stdoutMaxBytes:operation==='readSnapshot'?LIMIT:2*1024*1024});
      const result=await(await shell.execute(spec)).result();signal?.throwIfAborted();
      if(result.sandbox?.denied)fail('FS_SANDBOX_DENIED','The native sandbox refused the built-in Git operation');
      if(result.timedOut)fail('GIT_TIMEOUT','The built-in Git operation exceeded its time limit');
      if(result.aborted)fail('GIT_ABORTED','The built-in Git operation was cancelled');
      if(result.stdout?.truncated)fail('GIT_OUTPUT_LIMIT','The built-in Git result exceeded its bounded output size');
      let payload;try{payload=JSON.parse(result.stdout?.text||'');}catch{fail('GIT_PROCESS_FAILED','The built-in Git helper returned no valid receipt');}
      if(!payload||typeof payload.ok!=='boolean')fail('GIT_PROCESS_FAILED','The built-in Git helper returned an invalid receipt');
      if(!payload.ok){const code=/^(?:GIT_|SSH_)[A-Z_]+$/.test(payload.error?.code)?payload.error.code:'GIT_PROCESS_FAILED';fail(code,typeof payload.error?.message==='string'?payload.error.message.slice(0,1000):'The built-in Git operation failed',payload.error?.details);}
      if(result.exitCode!==0)fail('GIT_PROCESS_FAILED','The built-in Git helper did not finish successfully');
      return payload.result;
    }finally{this.pending.delete(projectRoot);}
  }
  execute(operation,input,env){return this.run(operation,input,env);}
}
