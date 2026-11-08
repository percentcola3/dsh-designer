import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import git from 'isomorphic-git';
import {runBuiltinGit,repositoryPath} from './builtin-git-helper.js';

const fsp=fs.promises,remoteUrl='https://example.invalid/team/project.git',author={name:'Fixture',email:'fixture@example.test'},scopePrefix='designer-projects/p-one';
const encoded=(name,value)=>({path:name,bytesBase64:Buffer.from(value).toString('base64')});
async function fixture(t){
  const parent=await fsp.realpath(os.tmpdir()),root=await fsp.realpath(await fsp.mkdtemp(path.join(parent,'dsh-builtin-git-')));
  t.after(async()=>{assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('dsh-builtin-git-'));await fsp.rm(root,{recursive:true,force:true});});
  const run=(operation,extra={})=>runBuiltinGit({operation,projectRoot:root,remoteUrl,branch:'main',scopePrefix,...extra});
  return {root,run,async options(url=remoteUrl,branch='main'){const dir=await repositoryPath(root,url,branch);return {fs,dir,gitdir:path.join(dir,'.git')};}};
}
async function commit(f,expectedHead,files=[encoded('portable-manifest.json','{"schemaVersion":1}'),encoded('designs/main/page.html','<h1>Hello</h1>')]){return f.run('commit',{expectedHead,files,author,message:'Save portable project'});}
async function foreignCommit(options,tree,parent=[]){return git.writeCommit({...options,commit:{tree,parent,author:{...author,timestamp:1,timezoneOffset:0},committer:{...author,timestamp:1,timezoneOffset:0},message:'Existing application\n'}});}

test('bare object DB round-trips portable manifest and binary files without a working tree',async t=>{
  const f=await fixture(t),initial=await f.run('status');assert.equal(initial.initialized,false);assert.equal((await fsp.readdir(f.root)).length,0);
  await f.run('init',{expectedHead:null});const files=[encoded('portable-manifest.json','{}'),encoded('设计稿/像素.png',Buffer.from([0,255,13,10,240]))],saved=await commit(f,null,files);
  assert.equal(saved.created,true);assert.equal(saved.dirty,false);assert.equal(saved.ahead,1);assert.deepEqual((await f.run('readSnapshot',{ref:'head'})).files,files.sort((a,b)=>a.path.localeCompare(b.path)));
  const options=await f.options();assert.deepEqual(await fsp.readdir(options.dir),['.git']);assert.equal(await git.getConfig({...options,path:'core.bare'}),true);
  assert.equal((await commit(f,saved.head,files)).created,false);
});

test('prefix replacement preserves application trees, foreign symlinks and other project namespaces',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const options=await f.options(),readme=await git.writeBlob({...options,blob:Buffer.from('Existing app README')}),link=await git.writeBlob({...options,blob:Buffer.from('/outside/private')}),workflow=await git.writeBlob({...options,blob:Buffer.from('name: CI')}),github=await git.writeTree({...options,tree:[{mode:'100644',path:'workflow.yml',type:'blob',oid:workflow}]}),tree=await git.writeTree({...options,tree:[{mode:'100644',path:'README.md',type:'blob',oid:readme},{mode:'120000',path:'foreign-link',type:'blob',oid:link},{mode:'040000',path:'.github',type:'tree',oid:github}]}),base=await foreignCommit(options,tree);
  await git.writeRef({...options,ref:'refs/heads/main',value:base,force:true});
  assert.deepEqual((await f.run('readSnapshot',{ref:'head'})).files,[]);
  const saved=await commit(f,base),other=await f.run('commit',{expectedHead:saved.head,scopePrefix:'designer-projects/p-two',files:[encoded('portable-manifest.json','other project')],author,message:'Another project'}),replaced=await commit(f,other.head,[encoded('portable-manifest.json','new snapshot')]);
  const entries=(await git.readTree({...options,oid:replaced.head})).tree;assert.equal(entries.find(e=>e.path==='README.md').oid,readme);assert.equal(entries.find(e=>e.path==='foreign-link').mode,'120000');assert.equal(entries.find(e=>e.path==='.github').oid,github);
  assert.equal(Buffer.from((await f.run('readSnapshot',{scopePrefix:'designer-projects/p-two'})).files[0].bytesBase64,'base64').toString(),'other project');assert.equal((await f.run('readSnapshot')).files.length,1);
});

test('HEAD CAS, dirty mirror and selected branch checks fail before changing refs',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const saved=await commit(f,null),options=await f.options();
  await assert.rejects(commit(f,null),{code:'GIT_HEAD_CHANGED'});await assert.rejects(f.run('commit',{files:[],author,message:'No expected head'}),{code:'GIT_HEAD_REQUIRED'});
  await fsp.writeFile(path.join(options.dir,'unexpected.txt'),'preserve me');const state=await f.run('status');assert.equal(state.dirty,true);await assert.rejects(commit(f,saved.head),{code:'GIT_DIRTY'});assert.equal(await fsp.readFile(path.join(options.dir,'unexpected.txt'),'utf8'),'preserve me');
  const unexpected=path.join(options.dir,'unexpected.txt');assert.equal(path.dirname(unexpected),options.dir);await fsp.unlink(unexpected);
  await git.writeRef({...options,ref:'HEAD',symbolic:true,value:'refs/heads/wrong',force:true});await assert.rejects(commit(f,null),{code:'GIT_BRANCH_MISMATCH'});
});

test('snapshot path aliases, invalid bytes and private tree links are rejected',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});
  for(const name of ['../escape','/absolute','.git/config','styles/.workbench/token','.env.local','a\\b'])await assert.rejects(commit(f,null,[encoded(name,'x')]),{code:'GIT_INVALID_PATH'});
  await assert.rejects(commit(f,null,[encoded('Theme.css','a'),encoded('theme.css','b')]),{code:'GIT_INVALID_PATH'});
  await assert.rejects(commit(f,null,[encoded('a','x'),encoded('a/b','y')]),{code:'GIT_INVALID_PATH'});
  await assert.rejects(commit(f,null,[{path:'bad.bin',bytesBase64:'not-base64'}]),{code:'GIT_INVALID_BYTES'});
  const options=await f.options(),blob=await git.writeBlob({...options,blob:Buffer.from('/outside')}),inner=await git.writeTree({...options,tree:[{mode:'120000',path:'link',type:'blob',oid:blob}]}),projects=await git.writeTree({...options,tree:[{mode:'040000',path:'p-one',type:'tree',oid:inner}]}),tree=await git.writeTree({...options,tree:[{mode:'040000',path:'designer-projects',type:'tree',oid:projects}]}),head=await foreignCommit(options,tree);await git.writeRef({...options,ref:'refs/heads/main',value:head,force:true});
  await assert.rejects(f.run('readSnapshot'),{code:'GIT_UNSAFE_SNAPSHOT'});await assert.rejects(commit(f,head),{code:'GIT_UNSAFE_SNAPSHOT'});
});

test('remote URL and branch changes use isolated databases and cannot inherit prior history',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const saved=await commit(f,null),other='https://example.invalid/other/repo.git';
  for(const extra of [{remoteUrl:other},{branch:'release'}]){assert.equal((await f.run('status',extra)).head,null);await f.run('init',{...extra,expectedHead:null});assert.equal((await f.run('status',extra)).head,null);assert.deepEqual((await f.run('readSnapshot',extra)).files,[]);}
  assert.equal((await f.run('status')).head,saved.head);assert.notEqual(await repositoryPath(f.root,remoteUrl,'main'),await repositoryPath(f.root,other,'main'));
});

test('private mirror rejects filesystem symlinks, gitdir aliases and hard links',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const options=await f.options(),target=path.join(options.gitdir,'linked');await fsp.symlink(f.root,target);
  await assert.rejects(f.run('status'),{code:'GIT_UNSAFE_PATH'});assert.equal(path.dirname(target),options.gitdir);await fsp.unlink(target);
  const original=path.join(options.gitdir,'HEAD'),alias=path.join(options.gitdir,'alias');await fsp.link(original,alias);await assert.rejects(f.run('status'),{code:'GIT_UNSAFE_PATH'});
});

test('readSnapshot remote ref can be inspected before fast-forward and divergence never resets local history',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const saved=await commit(f,null),options=await f.options(),first=await git.readCommit({...options,oid:saved.head}),remote=await foreignCommit(options,first.commit.tree,[saved.head]);await git.writeRef({...options,ref:'refs/remotes/origin/main',value:remote,force:true});
  const preview=await f.run('readSnapshot',{ref:'remote'});assert.equal(preview.head,remote);assert.equal((await f.run('status')).head,saved.head);assert.equal((await f.run('fastForward',{expectedHead:saved.head})).head,remote);
  const fork=await foreignCommit(options,first.commit.tree,[]);await git.writeRef({...options,ref:'refs/remotes/origin/main',value:fork,force:true});await assert.rejects(f.run('fastForward',{expectedHead:remote}),{code:'GIT_NON_FAST_FORWARD'});assert.equal((await f.run('status')).head,remote);
});

test('detect checks only the project root and redacts credential-bearing repository config',async t=>{
  const f=await fixture(t);await git.init({fs,dir:f.root,defaultBranch:'application'});await git.setConfig({fs,dir:f.root,path:'remote.origin.url',value:'https://user:secret@example.invalid/repo.git'});
  const detected=await f.run('detect');assert.equal(detected.existingRepository,true);assert.equal(detected.branch,'application');assert.equal(detected.remotes[0].url,null);assert.equal(JSON.stringify(detected).includes('secret'),false);
  const child=path.join(f.root,'nested');await fsp.mkdir(child);assert.equal((await runBuiltinGit({operation:'detect',projectRoot:child})).existingRepository,false);
});

// System Git is used solely to provide a real smart HTTP server fixture. The
// implementation under test never spawns git, ssh, or any child process.
async function smartServer(t){
  const available=spawnSync('git',['--version'],{encoding:'utf8'});assert.equal(available.status,0,'Fixture requires Git to host a real smart server');
  const parent=await fsp.realpath(os.tmpdir()),root=await fsp.realpath(await fsp.mkdtemp(path.join(parent,'dsh-smart-http-'))),remote=path.join(root,'remote.git');
  assert.equal(spawnSync('git',['init','--bare','--initial-branch=main',remote]).status,0);assert.equal(spawnSync('git',['--git-dir='+remote,'config','http.receivepack','true']).status,0);
  let rejected=false,secretSeen=false;const expected='Basic '+Buffer.from('fixture:top-secret').toString('base64');
  const server=http.createServer(async(req,res)=>{
    if(req.url.startsWith('/redirect')){res.writeHead(302,{location:'/remote.git/info/refs?service=git-upload-pack'});res.end();return;}
    if(req.headers.authorization!==expected){res.writeHead(401,{'www-authenticate':'Basic realm="fixture"'});res.end('Access denied');return;}secretSeen=true;
    if(rejected&&req.url.includes('git-receive-pack')){res.writeHead(403);res.end('refused');return;}
    const url=new URL(req.url,'http://fixture'),parts=[];for await(const chunk of req)parts.push(chunk);
    const child=spawn('git',['http-backend'],{env:{...process.env,GIT_PROJECT_ROOT:root,GIT_HTTP_EXPORT_ALL:'1',PATH_INFO:url.pathname,QUERY_STRING:url.search.slice(1),REQUEST_METHOD:req.method,CONTENT_TYPE:req.headers['content-type']||'',CONTENT_LENGTH:String(Buffer.concat(parts).length),REMOTE_USER:'fixture',SERVER_PROTOCOL:'HTTP/1.1'},stdio:['pipe','pipe','pipe']});
    const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.stderr.resume();child.on('close',()=>{const bytes=Buffer.concat(chunks),boundary=bytes.indexOf('\r\n\r\n'),header=bytes.subarray(0,boundary).toString(),headers={};let status=200;for(const line of header.split('\r\n')){const at=line.indexOf(':');if(at<0)continue;const key=line.slice(0,at),value=line.slice(at+1).trim();if(key.toLowerCase()==='status')status=Number(value.split(' ')[0]);else headers[key]=value;}res.writeHead(status,headers);res.end(bytes.subarray(boundary+4));});child.stdin.end(Buffer.concat(parts));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('dsh-smart-http-'));await fsp.rm(root,{recursive:true,force:true});});
  return {url:`http://127.0.0.1:${server.address().port}/remote.git`,root,remote,credentials:{username:'fixture',password:'top-secret'},setRejected:v=>rejected=v,get secretSeen(){return secretSeen;}};
}

test('real smart HTTP probe/fetch/nonforce push/read work with empty and advancing remote branches',async t=>{
  const server=await smartServer(t),a=await fixture(t),b=await fixture(t),extra={remoteUrl:server.url,credentials:server.credentials};
  const before=await fsp.readdir(a.root),probe=await a.run('probe',extra);assert.equal(probe.reachable,true);assert.equal(probe.branchExists,false);assert.deepEqual(await fsp.readdir(a.root),before);
  await a.run('init',{...extra,expectedHead:null});const empty=await a.run('fetch',{...extra,expectedHead:null});assert.equal(empty.remoteHead,null);assert.equal(empty.branchExists,false);
  const snapshot=await a.run('commit',{...extra,expectedHead:null,files:[encoded('portable-manifest.json','first')],author,message:'Cloud snapshot'});
  const pushed=await a.run('push',{...extra,expectedHead:snapshot.head});assert.equal(pushed.pushed,true);assert.equal(pushed.remoteHead,snapshot.head);assert.equal(pushed.ahead,0);assert.equal(server.secretSeen,true);
  await b.run('init',{...extra,expectedHead:null});const fetched=await b.run('fetch',{...extra,expectedHead:null});assert.equal(fetched.remoteHead,snapshot.head);assert.equal(fetched.head,null);assert.equal((await b.run('readSnapshot',{...extra,ref:'remote'})).files[0].bytesBase64,encoded('','first').bytesBase64);
  await b.run('fastForward',{...extra,expectedHead:null});const second=await b.run('commit',{...extra,expectedHead:snapshot.head,files:[encoded('portable-manifest.json','second')],author,message:'Next snapshot'});await b.run('push',{...extra,expectedHead:second.head});
  const local=await a.run('commit',{...extra,expectedHead:snapshot.head,files:[encoded('portable-manifest.json','local fork')],author,message:'Local fork'});await assert.rejects(a.run('push',{...extra,expectedHead:local.head}),e=>e.code==='GIT_NON_FAST_FORWARD'||e.code==='GIT_REMOTE_REJECTED');assert.equal(spawnSync('git',['--git-dir='+server.remote,'rev-parse','main'],{encoding:'utf8'}).stdout.trim(),second.head);
});

test('dead-process locks recover on the next write while live or unknown locks remain intact',async t=>{
  const f=await fixture(t);await f.run('init',{expectedHead:null});const lock=path.join(f.root,'.workbench','git-sync','engine.lock'),deadPid=2147483647;
  assert.throws(()=>process.kill(deadPid,0),error=>error.code==='ESRCH');
  const stale=JSON.stringify({pid:deadPid,token:'dead-fixture'});await fsp.writeFile(lock,stale);assert.equal((await f.run('status')).head,null);assert.equal(await fsp.readFile(lock,'utf8'),stale);await f.run('init',{expectedHead:null});await assert.rejects(fsp.stat(lock),{code:'ENOENT'});
  for(const content of [JSON.stringify({pid:process.pid,token:'live-fixture'}),'unknown lock']){await fsp.writeFile(lock,content);await assert.rejects(f.run('init',{expectedHead:null}),{code:'GIT_BUSY'});assert.equal(await fsp.readFile(lock,'utf8'),content);assert.equal(path.dirname(lock),path.join(f.root,'.workbench','git-sync'));await fsp.unlink(lock);}
});

test('aborting an HTTP probe closes the network request without creating a private mirror',async t=>{
  const f=await fixture(t),server=http.createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await assert.rejects(runBuiltinGit({operation:'probe',projectRoot:f.root,remoteUrl:`http://127.0.0.1:${server.address().port}/repo.git`,branch:'main'},{signal:AbortSignal.timeout(30)}),{code:'GIT_TIMEOUT'});assert.deepEqual(await fsp.readdir(f.root),[]);
});

test('HTTP authentication failure and redirects are explicit and do not disclose credentials',async t=>{
  const server=await smartServer(t),f=await fixture(t);
  await assert.rejects(f.run('probe',{remoteUrl:server.url,credentials:{username:'fixture',password:'wrong-secret'}}),error=>{assert.equal(JSON.stringify({code:error.code,message:error.message,details:error.details}).includes('wrong-secret'),false);return error.code==='GIT_AUTH_FAILED';});
  await assert.rejects(f.run('probe',{remoteUrl:server.url.replace('/remote.git','/redirect'),credentials:server.credentials}),{code:'GIT_REDIRECT_DENIED'});
});
