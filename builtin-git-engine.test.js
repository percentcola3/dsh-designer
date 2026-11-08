import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {BuiltinGitEngine,BUILTIN_GIT_COMMAND} from './builtin-git-engine.js';

const scopePrefix='designer-projects/p-runner',remoteUrl='https://example.invalid/team/repository.git',author={name:'Runner',email:'runner@example.test'};
async function harness(t,{real=false}={}){
  const parent=await fs.realpath(os.tmpdir()),root=await fs.realpath(await fs.mkdtemp(path.join(parent,'dsh-git-runner-'))),calls=[];
  t.after(async()=>{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('dsh-git-runner-'));await fs.rm(root,{recursive:true,force:true});});
  const provider={async resolve(value){const absolute=path.resolve(value);let existing=absolute;const missing=[];for(;;){try{const canonical=await fs.realpath(existing);return {targetKey:path.join(canonical,...missing.reverse()),displayPath:path.join(canonical,...missing)};}catch(e){if(e.code!=='ENOENT')throw e;missing.push(path.basename(existing));const next=path.dirname(existing);if(next===existing)throw e;existing=next;}}},processPath:t=>t.targetKey,contains:(a,b)=>b.targetKey===a.targetKey||b.targetKey.startsWith(a.targetKey+path.sep),async stat(target){try{const s=await fs.stat(target.targetKey);return {type:s.isDirectory()?'directory':s.isFile()?'file':'other'};}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}};
  let next={exitCode:0,stdout:{text:JSON.stringify({ok:true,result:{head:null,initialized:false}})},stderr:{text:''}};
  const shell={resolve:spec=>spec,async execute(spec){calls.push(spec);return {result:async()=>{
    if(!real)return typeof next==='function'?next(spec):next;
    return new Promise((resolve,reject)=>{const child=spawn('/bin/sh',['-c',spec.command],{cwd:spec.workdir,env:{...process.env,PATH:''},signal:spec.signal,stdio:['pipe','pipe','pipe']}),out=[],err=[];child.stdout.on('data',c=>out.push(c));child.stderr.on('data',c=>err.push(c));child.on('error',reject);child.on('close',exitCode=>resolve({exitCode,stdout:{text:Buffer.concat(out).toString()},stderr:{text:Buffer.concat(err).toString()}}));child.stdin.end(spec.stdin);});
  }};}};
  const owner={ctx:{fs:provider,shell},store:{projectPhysicalRoot:async id=>{assert.equal(id,'p-runner');return root;}}},engine=new BuiltinGitEngine(owner),policy={mode:'workspace-write',workspaceRoot:root};
  const run=(op,extra={},env={})=>engine.run(op,{projectId:'p-runner',remoteUrl,scopePrefix,branch:'main',...extra},{policy,...env});
  return {owner,engine,root,calls,run,policy,setResult:value=>next=value};
}

test('runner sends only allowlisted JSON stdin to a fixed bundled Node helper',async t=>{
  const h=await harness(t),secret='secret $() `never-run`',file={path:'designs/main/page.html',bytesBase64:Buffer.from('<h1>你好</h1>').toString('base64')};
  await h.run('commit',{expectedHead:null,files:[file],message:'Save',author,credentials:{username:'fixture',password:secret},repositoryRoot:'/outside',projectRoot:'/outside',arbitraryCode:'do not execute'});
  const spec=h.calls[0],request=JSON.parse(spec.stdin);assert.equal(spec.command,BUILTIN_GIT_COMMAND);assert.equal(spec.command.includes(secret),false);assert.equal(spec.command.includes(remoteUrl),false);assert.equal(spec.command.includes('git '),false);assert.equal(request.projectRoot,h.root);assert.equal(request.repositoryRoot,undefined);assert.equal(request.arbitraryCode,undefined);assert.deepEqual(request.files,[file]);assert.equal(request.credentials.password,secret);
  assert.equal(spec.sandboxPolicy.workspaceRoot,h.root);assert.deepEqual(spec.sandboxPolicy.additionalWritableRoots,[]);assert.equal(spec.onExpiry,'kill');assert.equal(h.policy.additionalWritableRoots,undefined);
});

test('read operations run under read-only policy and never require expected HEAD',async t=>{
  const h=await harness(t);await h.run('status');assert.equal(h.calls[0].sandboxPolicy.mode,'read-only');assert.equal(JSON.parse(h.calls[0].stdin).expectedHead,undefined);
  await h.run('probe',{credentials:{username:'u',password:'p'}});assert.equal(h.calls[1].sandboxPolicy.mode,'read-only');
  await assert.rejects(h.run('init',{expectedHead:null},{policy:{...h.policy,mode:'read-only'}}),{code:'FS_SANDBOX_DENIED'});
  await assert.rejects(h.run('init',{}),{code:'GIT_HEAD_REQUIRED'});await assert.rejects(h.run('init',{expectedHead:null},{policy:{mode:'workspace-write',workspaceRoot:'/unrelated'}}),{code:'FS_SANDBOX_DENIED'});
});

test('native sandbox rejection, truncated output and process failures never surface stderr secrets',async t=>{
  const h=await harness(t),stderr={text:'password=do-not-show privateKey=never-return'};
  for(const [result,code]of [[{sandbox:{denied:true},stderr},'FS_SANDBOX_DENIED'],[{exitCode:1,stdout:{text:''},stderr},'GIT_PROCESS_FAILED'],[{exitCode:0,stdout:{text:'partial',truncated:true},stderr},'GIT_OUTPUT_LIMIT'],[{timedOut:true,stderr},'GIT_TIMEOUT'],[{aborted:true,stderr},'GIT_ABORTED']]){
    h.setResult(result);await assert.rejects(h.run('status'),error=>{assert.equal(error.message.includes('do-not-show'),false);assert.equal(error.message.includes('never-return'),false);return error.code===code;});
  }
  h.setResult({exitCode:1,stdout:{text:JSON.stringify({ok:false,error:{code:'GIT_HEAD_CHANGED',message:'Git HEAD changed',details:{head:'a'.repeat(40)}}})},stderr});await assert.rejects(h.run('status'),{code:'GIT_HEAD_CHANGED'});
});

test('canonical private mirror alias is refused before launching the helper',async t=>{
  const h=await harness(t);await fs.mkdir(path.join(h.root,'.workbench'));await fs.symlink(os.tmpdir(),path.join(h.root,'.workbench','git-sync'));
  await assert.rejects(h.run('init',{expectedHead:null}),{code:'GIT_UNSAFE_PATH'});assert.equal(h.calls.length,0);
});

test('concurrent operations for one project are rejected and failure releases the runner lock',async t=>{
  const h=await harness(t);let release,started;const ready=new Promise(resolve=>started=resolve);h.setResult(()=>{started();return new Promise(resolve=>release=resolve);});
  const first=h.run('status');await ready;await assert.rejects(h.run('status'),{code:'GIT_BUSY'});release({exitCode:0,stdout:{text:JSON.stringify({ok:true,result:{head:null}})}});await first;
  h.setResult({exitCode:0,stdout:{text:JSON.stringify({ok:true,result:{head:null}})}});assert.equal((await h.run('status')).head,null);
});

test('actual managed helper runs init/commit/readSnapshot with an empty executable PATH',async t=>{
  const h=await harness(t,{real:true});await h.run('init',{expectedHead:null});
  const files=[{path:'portable-manifest.json',bytesBase64:Buffer.from('{"portable":true}').toString('base64')},{path:'designs/main/pixel.bin',bytesBase64:Buffer.from([0,255,13,10]).toString('base64')}],saved=await h.run('commit',{expectedHead:null,files,message:'Portable snapshot without installed git',author}),read=await h.run('readSnapshot',{ref:'head'});
  assert.equal(saved.created,true);assert.equal(read.head,saved.head);assert.deepEqual(read.files,files.sort((a,b)=>a.path.localeCompare(b.path)));assert.equal(h.calls.length,3);assert.equal(h.calls[2].stdoutMaxBytes,190*1024*1024);
});
