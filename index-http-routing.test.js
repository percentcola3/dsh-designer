import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {apply} from './index.js';
import packageInfo from './package.json' with {type:'json'};

const within=(root,value)=>value===root||value.startsWith(root+path.sep);
const failure=code=>Object.assign(new Error(code),{code});
class HostFs{
  async resolve(value){let cursor=path.resolve(value);const missing=[];for(;;){try{return {path:path.join(await fs.realpath(cursor),...missing.reverse())};}catch(error){if(error.code!=='ENOENT')throw error;missing.push(path.basename(cursor));const next=path.dirname(cursor);if(next===cursor)throw error;cursor=next;}}}
  processPath(t){return t.path;}contains(a,b){return within(a.path,b.path);}
  async stat(t,signal){signal?.throwIfAborted();try{const s=await fs.stat(t.path,{bigint:true});return {type:s.isDirectory()?'directory':'file',size:Number(s.size),version:[s.ino,s.size,s.mtimeNs].join(':')};}catch(error){if(error.code==='ENOENT')return;throw error;}}
  async readBytes(t,signal,max){signal?.throwIfAborted();const stat=await this.stat(t,signal);if(!stat)throw failure('FS_NOT_FOUND');if(stat.size>max)throw failure('FS_TOO_LARGE');return fs.readFile(t.path);}
  async readText(t,signal){return new TextDecoder('utf-8',{fatal:true}).decode(await this.readBytes(t,signal,128*1024*1024));}
  async listDir(t,signal){signal?.throwIfAborted();try{return (await fs.readdir(t.path,{withFileTypes:true})).map(d=>({name:d.name,type:d.isDirectory()?'directory':'file'}));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
  async writeText(t,value,intent,signal,policy){signal?.throwIfAborted();if(!policy||policy.mode==='read-only'||policy.mode==='workspace-write'&&![policy.workspaceRoot,...policy.additionalWritableRoots||[]].some(root=>within(root,t.path)))throw failure('FS_SANDBOX_DENIED');const old=await this.stat(t,signal);if(intent.kind==='createIfAbsent'&&old||intent.kind==='replaceIfVersion'&&old?.version!==intent.version)throw failure('FS_STALE_VERSION');await fs.mkdir(path.dirname(t.path),{recursive:true});await fs.writeFile(t.path,value);return {version:(await this.stat(t,signal)).version};}
}

async function fixture(t){
  const buildPath=fileURLToPath(new URL('./.build',import.meta.url));await fs.mkdir(buildPath,{recursive:true});
  const build=await fs.realpath(buildPath),root=await fs.realpath(await fs.mkdtemp(path.join(build,'http-routing-fixture-'))),provider=new HostFs(),exact=new Map(),prefixes=new Map(),globals=new Map(),contexts=[],shellCalls=[],fsCalls=[];let origin;
  for(const name of ['resolve','stat','readBytes','readText','listDir','writeText']){const original=provider[name].bind(provider);provider[name]=(...args)=>{fsCalls.push(name);return original(...args);};}
  // These routing semantics match the installed public WebServer.register/match
  // contract: duplicate (kind,path) throws; exact beats longest prefix; the
  // returned function deletes the registration. This is an independent real
  // node:http fixture, never the user's authenticated production listener.
  const webServer={getOrigin:()=>origin,register(route){const table=route.kind==='exact'?exact:prefixes;if(table.has(route.path))throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);table.set(route.path,route);return()=>table.delete(route.path);}};
  const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,origin).pathname;let route=exact.get(pathname);if(!route)for(const [prefix,candidate]of prefixes)if((pathname===prefix||pathname.startsWith(prefix+'/'))&&(!route||prefix.length>route.path.length))route=candidate;if(!route){res.writeHead(404);res.end();return;}try{await route.handler(req,res);}catch(error){if(res.headersSent)res.destroy();else{res.writeHead(500);res.end(JSON.stringify({error:error.code||'TEST_SERVER_ERROR'}));}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  const activate=async()=>{const effects=[],admissions=[],policy={mode:'workspace-write',workspaceRoot:root},ctx={fs:provider,webServer,fiber:{entry:{id:'http-routing-test'}},get:name=>ctx[name],effect(start){const off=start();assert.equal(typeof off,'function');effects.push(off);return off;},on(){const off=()=>{};effects.push(off);return off;},sandboxPolicy:{workspaceRoot:root,resolve:()=>policy},agentPresets:{compositionInventory:async()=>[{id:'minimal',rows:[]}]},agents:{list:()=>[]},agentDefaultModel:{currentSelection:()=>undefined},skills:{list:async()=>[]},systemPrompt:{section:()=>()=>{}},tools:{register(def){if(globals.has(def.name))throw new Error('Duplicate fixture tool');globals.set(def.name,def);return()=>globals.delete(def.name);},schemas:()=>[...globals.values()]}};
    // The test owns this isolated server's principals. No production cookies,
    // authorization headers, local profile files or login tokens are read.
    ctx.connection={requestRejection(req){return req.headers.origin&&req.headers.origin!==origin?403:undefined;},admit(req){const kind=req.headers['x-fixture-principal'];admissions.push(kind||'anonymous');return kind?{peer:{principal:{kind},signal:new AbortController().signal}}:{rejection:401};}};
    ctx.shell={resolve:spec=>spec,async execute(spec){shellCalls.push(spec);let child;const result=new Promise((resolve,reject)=>{child=spawn('/bin/sh',['-c',spec.command],{cwd:spec.workdir,signal:spec.signal,stdio:['pipe','pipe','pipe']});const stdout=[],stderr=[];child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));child.on('error',reject);child.on('close',exitCode=>resolve({exitCode,stdout:{text:Buffer.concat(stdout).toString()},stderr:{text:Buffer.concat(stderr).toString()}}));child.stdin.end(spec.stdin);});return {result:()=>result,kill:()=>child.kill()};}};
    const context={ctx,effects,admissions,async dispose(){for(const off of [...effects].reverse())await off();}};contexts.push(context);await apply(ctx,{workspaceRoot:root});return context;};
  const request=async(action,{principal='owner',method='POST',hint=action,body,headers={}}={})=>{const url=origin+'/api/designer'+(method==='GET'?'?'+new URLSearchParams({action}):''),response=await fetch(url,{method,headers:{'content-type':'application/json',...(principal?{'x-fixture-principal':principal}:{}),...(method==='POST'&&hint?{'x-designer-action':hint}:{}),...headers},...(method==='POST'?{body:body??JSON.stringify({action})}:{})});const text=await response.text();return {status:response.status,headers:response.headers,payload:text?JSON.parse(text):null};};
  t.after(async()=>{for(const context of [...contexts].reverse())await context.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(root),build);assert.ok(path.basename(root).startsWith('http-routing-fixture-'));await fs.rm(root,{recursive:true,force:true});});
  return {root,origin,exact,prefixes,globals,shellCalls,fsCalls,activate,request};
}

test('fresh apply routes actual HTTP knowledge runtime status through owner admission and production service',async t=>{
  const f=await fixture(t),context=await f.activate();
  const anonymous=await f.request('knowledge.runtime.status',{principal:null});assert.equal(anonymous.status,401);assert.equal(anonymous.payload.error.code,'UNAUTHORIZED');assert.equal(f.shellCalls.length,0);
  const guest=await f.request('knowledge.runtime.status',{principal:'guest'});assert.equal(guest.status,403);assert.equal(guest.payload.error.code,'FORBIDDEN');assert.equal(f.shellCalls.length,0);
  const foreign=await f.request('knowledge.runtime.status',{headers:{origin:'https://untrusted.example'}});assert.equal(foreign.status,403);assert.equal(foreign.payload.error.code,'UNAUTHORIZED');
  const response=await f.request('knowledge.runtime.status');assert.equal(response.status,200,JSON.stringify(response.payload));assert.equal(response.payload.ok,true);assert.equal(typeof response.payload.value.engine,'string');assert.equal(typeof response.payload.value.available,'boolean');assert.ok(context.admissions.includes('owner'));
});

test('public HTTP metadata is static and bodyless on HEAD; its availability does not bypass owner admission',async t=>{
  const f=await fixture(t),context=await f.activate(),reads=f.fsCalls.length,calls=f.shellCalls.length,admissions=context.admissions.length;
  const response=await fetch(f.origin+'/api/designer/meta?action=knowledge.list',{headers:{origin:'https://untrusted.example'}}),meta=await response.json();assert.equal(response.status,200);assert.deepEqual(Object.keys(meta).sort(),['capabilities','instanceId','name','sourceFingerprint','transportVersion','version']);assert.equal(meta.name,'dsh-designer');assert.equal(meta.version,packageInfo.version);assert.equal(meta.transportVersion,2);assert.equal(meta.sourceFingerprint,'knowledge-directory-autoindex-v2');assert.match(meta.instanceId,/^[a-f0-9-]{36}$/);assert.ok(meta.capabilities.includes('knowledge-directory'));assert.ok(meta.capabilities.includes('knowledge-fts-no-model'));assert.equal(response.headers.get('access-control-allow-origin'),null);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-designer-version'),meta.version);assert.equal(response.headers.get('x-designer-instance'),meta.instanceId);
  const head=await fetch(f.origin+'/api/designer/meta',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('x-designer-instance'),meta.instanceId);assert.equal(head.headers.get('cache-control'),'no-store');
  for(const method of ['POST','PUT','DELETE','OPTIONS']){const denied=await fetch(f.origin+'/api/designer/meta',{method});assert.equal(denied.status,405);assert.equal(denied.headers.get('allow'),'GET, HEAD');assert.equal(denied.headers.get('cache-control'),'no-store');assert.equal(denied.headers.get('access-control-allow-origin'),null);}
  assert.equal(f.fsCalls.length,reads,'Public metadata must not touch knowledge, project or runtime files');assert.equal(f.shellCalls.length,calls);assert.equal(context.admissions.length,admissions,'Public metadata does not resolve an owner or manufacture a principal');
  const business=await f.request('knowledge.runtime.status',{principal:null});assert.equal(business.status,401);assert.equal(business.payload.error.code,'UNAUTHORIZED');assert.equal(business.headers.get('x-designer-version'),meta.version);assert.equal(business.headers.get('x-designer-instance'),meta.instanceId);assert.equal(f.fsCalls.length,reads);assert.equal(f.shellCalls.length,calls);
});

test('HTTP metadata and the registered model tool identify the same activation; reactivation gets a new instance',async t=>{
  const f=await fixture(t),first=await f.activate(),meta=await (await fetch(f.origin+'/api/designer/meta')).json(),model=f.globals.get('designer_workbench'),agent={id:'fixture-main',session:{id:'fixture-main',header:{cwd:f.root}}},tool=await model.execute({action:'workbench.status',options:{}},{agent,signal:new AbortController().signal});
  assert.deepEqual(tool.server,{...meta,origin:f.origin});const httpStatus=await f.request('workbench.status');assert.equal(httpStatus.status,200);assert.deepEqual(httpStatus.payload.value.server,tool.server);assert.equal(httpStatus.headers.get('x-designer-instance'),meta.instanceId);
  await first.dispose();assert.equal((await fetch(f.origin+'/api/designer/meta')).status,404);await f.activate();const next=await (await fetch(f.origin+'/api/designer/meta')).json();assert.notEqual(next.instanceId,meta.instanceId);assert.equal(next.version,meta.version);await first.dispose();assert.deepEqual(await (await fetch(f.origin+'/api/designer/meta')).json(),next);
});

test('actual HTTP preserves action fingerprints and rejects malformed requests before dispatch',async t=>{
  const f=await fixture(t);await f.activate();
  const knowledge=await f.request('knowledge.not-a-real-action');assert.equal(knowledge.status,400);assert.equal(knowledge.payload.error.code,'UNKNOWN_ACTION');assert.equal(knowledge.payload.error.message,'Unknown knowledge action');
  const other=await f.request('not-a-real-designer-action');assert.equal(other.status,400);assert.equal(other.payload.error.message,'Unknown designer action: not-a-real-designer-action');
  const wrongMethod=await f.request('knowledge.runtime.status',{method:'GET'});assert.equal(wrongMethod.status,400);assert.equal(wrongMethod.payload.error.code,'METHOD_NOT_ALLOWED');
  const mismatch=await f.request('knowledge.runtime.status',{hint:'state'});assert.equal(mismatch.status,400);assert.equal(mismatch.payload.error.code,'INVALID_INPUT');
  const malformed=await f.request('knowledge.runtime.status',{body:'{not JSON'});assert.equal(malformed.status,400);assert.equal(malformed.payload.error.code,'INVALID_INPUT');assert.equal(f.shellCalls.length,0);
});

test('fresh apply route disposers release HTTP and tools before reactivation; duplicate exact routes cannot steal requests',async t=>{
  const f=await fixture(t),first=await f.activate();assert.ok(f.exact.has('/api/designer'));assert.ok(f.globals.has('designer_workbench'));
  assert.throws(()=>first.ctx.webServer.register({kind:'exact',path:'/api/designer',handler(){}}),/duplicate exact route/);
  const live=await f.request('knowledge.not-a-real-action');assert.equal(live.payload.error.message,'Unknown knowledge action');await first.dispose();assert.equal(f.exact.size,0);assert.equal(f.prefixes.size,0);assert.equal(f.globals.size,0);assert.equal((await f.request('state')).status,404);
  const second=await f.activate();await first.dispose();assert.ok(f.exact.has('/api/designer'),'Double disposal of a previous activation cannot remove the new route');const current=await f.request('knowledge.runtime.status');assert.equal(current.status,200,JSON.stringify(current.payload));assert.equal(current.payload.ok,true);await second.dispose();assert.equal(f.exact.size,0);assert.equal(f.globals.size,0);
});

test('diagnostics are discoverable through actual HTTP and model tools without runtime side effects',async t=>{
  const f=await fixture(t);await f.activate();const beforeWrites=f.fsCalls.filter(name=>name==='writeText').length;
  const anonymous=await f.request('diagnostics.run',{principal:null});assert.equal(anonymous.status,401);
  const guest=await f.request('diagnostics.catalog',{principal:'guest'});assert.equal(guest.status,403);
  const owner=await f.request('diagnostics.run');assert.equal(owner.status,200,JSON.stringify(owner.payload));assert.equal(owner.payload.value.readOnly,true);assert.equal(owner.payload.value.scope.kind,'library');assert.ok(owner.payload.value.checks.length>0);
  const catalog=await f.request('diagnostics.catalog');assert.equal(catalog.status,200);assert.ok(catalog.payload.value.topics.some(topic=>topic.id==='generation'));assert.ok(catalog.payload.value.topics.some(topic=>topic.id==='feedback'));
  const guide=await f.request('diagnostics.guide',{body:JSON.stringify({action:'diagnostics.guide',topic:'generation',limit:200})});assert.equal(guide.status,200);assert.ok(guide.payload.value.text.length<=200);assert.equal(typeof guide.payload.value.nextOffset,'number');
  const model=f.globals.get('designer_workbench'),agent={id:'diagnostic-main',session:{id:'diagnostic-main',header:{cwd:f.root}}};
  const report=await model.execute({action:'diagnostics.run',options:{}},{agent,signal:new AbortController().signal});assert.equal(report.scope.kind,'environment');assert.equal(report.limits.libraryEnumerationAllowed,false);
  const topics=await model.execute({action:'diagnostics.catalog',options:{}},{agent,signal:new AbortController().signal});assert.ok(topics.topics.length>=6);
  const help=await model.execute({action:'help',options:{topic:'diagnostics.run'}},{agent,signal:new AbortController().signal});assert.equal(help.readOnly,true);
  assert.equal(f.fsCalls.filter(name=>name==='writeText').length,beforeWrites);assert.equal(f.shellCalls.length,0);
});
