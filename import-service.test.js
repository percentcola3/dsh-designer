import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {DesignerStore} from './store.js';
import {DesignerImports} from './import-service.js';
import {DesignerService,handleDesignerRequest} from './index.js';

// Minimal independent composed-Fs double. Does not import another test module.
class MemoryFS {
  files=new Map();counter=0;writes=[];aliases=new Map();reads=[];beforeWrite=null;
  async resolve(value,{cwd='/workspace'}={}) {let full=path.resolve(cwd,value);for(const [from,to] of this.aliases)if(full===from||full.startsWith(from+'/'))full=to+full.slice(from.length);return {targetKey:full,displayPath:full};}
  contains(parent,child){return child.targetKey===parent.targetKey||child.targetKey.startsWith(parent.targetKey+'/');}
  processPath(target){return target.targetKey;}
  async stat(target){const file=this.files.get(target.targetKey);if(file)return {type:'file',version:file.version,size:file.bytes.length};if(target.targetKey==='/workspace'||[...this.files.keys()].some(p=>p.startsWith(target.targetKey+'/')))return {type:'directory',version:'directory'};}
  async readText(target){return (await this.readBytes(target)).toString('utf8');}
  async readBytes(target,_signal,max=Infinity){this.reads.push(target.targetKey);const file=this.files.get(target.targetKey);if(!file)throw Object.assign(new Error('Missing'),{code:'FS_NOT_FOUND'});if(file.bytes.length>max)throw Object.assign(new Error('Too large'),{code:'FS_TOO_LARGE'});return file.bytes;}
  async listDir(target){const names=new Map();for(const p of this.files.keys())if(p.startsWith(target.targetKey+'/')){const remainder=p.slice(target.targetKey.length+1);const first=remainder.split('/')[0];names.set(first,{name:first,type:remainder.includes('/')?'directory':'file'});}return [...names.values()];}
  put(target,bytes){this.files.set(typeof target==='string'?target:target.targetKey,{bytes:Buffer.from(bytes),version:String(++this.counter)});}
  async writeText(target,content,intent,signal,policy){signal?.throwIfAborted();if(!policy||policy.mode==='read-only'||policy.mode==='workspace-write'&&!this.contains({targetKey:policy.workspaceRoot},target))throw Object.assign(new Error('denied'),{code:'FS_SANDBOX_DENIED'});if(this.beforeWrite)await this.beforeWrite(target,content);const previous=this.files.get(target.targetKey);if(intent.kind==='createIfAbsent'&&previous||intent.kind==='replaceIfVersion'&&previous?.version!==intent.version)throw Object.assign(new Error('stale'),{code:'FS_STALE_VERSION'});this.put(target,Buffer.from(content));this.writes.push({target:target.targetKey,intent,policy});return {version:this.files.get(target.targetKey).version};}
}
const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=','base64');
const doc=label=>`<!doctype html><html><body><main>${label}</main></body></html>`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const fs=new MemoryFS();const credentials=new Map();const credentialWrites=[];const shellCalls=[];
  const ctx={fs,connection:{requestRejection:()=>undefined,admit:()=>({peer:{principal:{kind:'owner'},signal:new AbortController().signal}})},credentials:{async readRecord(key){return credentials.get(key);},async modifyRecord(key,fn){credentialWrites.push(key);credentials.set(key,await fn(credentials.get(key)));},async deleteRecord(key){credentialWrites.push(key);credentials.delete(key);}},sandboxPolicy:{workspaceRoot:'/workspace',resolve:()=>policy},tools:{schemas:()=>[],register:()=>()=>{}},get:()=>undefined};
  ctx.shell={resolve:spec=>spec,async execute(spec){shellCalls.push(spec);const input=JSON.parse(spec.stdin);for(const file of input.files){assert.equal(sha(Buffer.from(file.bytesBase64,'base64')),file.sha256);assert.equal(spec.sandboxPolicy,policy);const existing=fs.files.get(file.target);if(existing)assert.ok(existing.bytes.equals(Buffer.from(file.bytesBase64,'base64')));else fs.put(file.target,Buffer.from(file.bytesBase64,'base64'));}return {async result(){return {exitCode:0,stdout:{text:JSON.stringify({written:input.files.map(f=>f.relative)})},stderr:{text:''}};}};}};
  const service=new DesignerService(ctx,{workspaceRoot:'/workspace'});
  const browser={async capture(){return {kind:'website',url:'https://example.com/',title:'Capture',width:900,height:700,documentHeight:1200,html:doc('current'),resources:[],warnings:[],failures:[]};},async dispose(){},async open(input){return input;},async action(input){return input;},async close(input){return input;}};
  const design={async probe(config){return {provider:config.provider,ok:true};},async read(){return {kind:'figma',sourceURL:'https://www.figma.com/design/abc/File',title:'Design',context:{layers:['one']},resources:[],warnings:[],failures:[]};}};
  const imports=new DesignerImports(service,{browser,design});service.imports=imports;
  return {fs,ctx,service,store:service.store,imports,browser,design,credentials,credentialWrites,shellCalls};
}
async function project(f,name='Project'){return f.store.projectCreate({name});}
async function publish(f,p,extra={}){return f.imports.publish({projectId:p.id},{kind:'website',url:'https://example.com/',title:'Imported',width:900,height:1200,html:doc('imported'),resources:[],warnings:[],failures:[],...extra},undefined,policy);}
async function resource(f,url,{method='GET'}={}){const req={method,url};const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};await f.imports.resource(req,res);return res;}
async function http(f,body,{admission,method='POST',query=''}={}){const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{method,url:'/api/designer'+query,headers:{'content-type':'application/json'}});const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};await handleDesignerRequest(f.service,{requestRejection:()=>undefined,admit:()=>admission||{peer:{principal:{kind:'owner'},signal:new AbortController().signal}}},req,res);return res;}

test('managed Chromium runner restores large stderr receipts before parsing screenshots',async()=>{
  const f=fixture();const value={width:1100,screenshot:'data:image/png;base64,'+'A'.repeat(50000)};
  const receipt='__DSH_DESIGNER_BROWSER_RESULT__'+JSON.stringify({ok:true,value});
  f.fs.put('/workspace/browser-stderr.log',Buffer.from(receipt));
  f.ctx.shell.execute=async()=>({async result(){return {exitCode:0,stdout:{text:'',truncated:false},stderr:{text:receipt.slice(-1000),truncated:true,spillPath:'/workspace/browser-stderr.log'}};}});
  const imports=new DesignerImports(f.service);const result=await imports.browser.runner('console.log("receipt")',{timeoutMs:10000,maxOutputBytes:100000});
  assert.deepEqual(result,value);assert.ok(f.fs.reads.includes('/workspace/browser-stderr.log'));
});

test('provider credentials are user-only and public connection results never expose the token',async()=>{
  const f=fixture();const secret='private-token-123';
  for(const action of ['connection.save','connection.clear'])await assert.rejects(f.service.execute({action,provider:'figma',token:secret}),{code:'USER_ONLY'});
  assert.equal(f.credentialWrites.length,0);
  const saved=await f.service.execute({action:'connection.save',provider:'figma',endpoint:'https://mcp.figma.com/mcp',token:secret},{user:true});assert.ok(!JSON.stringify(saved).includes(secret));assert.equal(saved.connections.find(c=>c.provider==='figma').configured,true);
  const tool=f.imports.tool();assert.ok(!tool.parameters.properties.action.enum.includes('connection.save'));
  await assert.rejects(tool.execute({action:'connection.status'},{}),{code:'AGENT_REQUIRED'});
  await assert.rejects(tool.execute({action:'connection.save',projectId:'p-one',options:{provider:'figma',token:'replacement'}},{agent:{id:'ordinary'}}),{code:'USER_ONLY'});
  assert.equal((await f.imports.connectionConfig('figma')).token,secret);
  await f.service.execute({action:'connection.save',provider:'figma',endpoint:'http://127.0.0.1:3845/mcp',token:''},{user:true});assert.equal((await f.imports.connectionConfig('figma')).token,'');
});

test('import tool cannot inject credentials, change action through options, or use a project design agent',async()=>{
  const f=fixture();const p=await project(f);await f.service.execute({action:'connection.save',provider:'figma',token:'saved-secret'},{user:true});let received;
  f.design.read=async config=>{received=config;return {kind:'figma',sourceURL:'https://www.figma.com/design/abc/File',context:{nodes:[]},resources:[],warnings:[],failures:[]};};
  const result=await f.imports.tool().execute({action:'source.import',projectId:p.id,options:{action:'connection.save',projectId:'p-wrong',provider:'figma',token:'injected',endpoint:'https://evil.example/mcp',generate:false}},{agent:{id:'ordinary'}});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);assert.equal((await f.store.projectGet(p.id)).project.imports[0].id,result.record.id);assert.equal(received.token,'saved-secret');assert.notEqual(received.endpoint,'https://evil.example/mcp');assert.ok(!JSON.stringify(result).includes('saved-secret'));
  f.service.bindings.set('designer',p.id);await assert.rejects(f.imports.tool().execute({action:'connection.status'},{agent:{id:'designer'}}),{code:'ACTION_NOT_ALLOWED'});
});

test('design source context is published before AI restoration without creating an empty HTML artboard',async()=>{
  const f=fixture();const p=await project(f);let admitted;
  f.service.runAI=async input=>{admitted=input;const saved=await f.store.importGet(p.id,input.importId);assert.equal(saved.record.kind,'figma');return {sessionId:'designer-'+p.id,accepted:true};};
  const saved=await f.imports.execute({action:'source.import',projectId:p.id,provider:'figma'},{policy,user:true});
  assert.equal(saved.project.artboards.length,0);assert.equal(saved.project.imports.length,1);assert.equal(saved.ai.accepted,true);assert.equal(admitted.importId,saved.record.id);assert.ok(saved.assetBase);
  const context=await f.store.importContext(p.id,saved.record.id);assert.ok(context.text.includes('layers'));
});

test('model browser results omit base64 screenshots and keep project browser identifiers',async()=>{
  const f=fixture();const p=await project(f);f.browser.open=async()=>({browserId:'owned-browser',projectId:p.id,width:900,height:700,screenshot:'data:image/png;base64,'+png.toString('base64')});
  const result=await f.imports.tool().execute({action:'browser.open',projectId:p.id,options:{url:'https://example.com/'}},{agent:{id:'ordinary'}});
  assert.equal(result.browserId,'owned-browser');assert.equal(result.screenshotAvailableInProjectUI,true);assert.equal(result.screenshot,undefined);
});

test('capture tool returns lossless JSON without optional undefined fields',async()=>{
  const f=fixture();const p=await project(f);const saved=await f.imports.tool().execute({action:'browser.capture',projectId:p.id,options:{browserId:'owned'}},{agent:{id:'ordinary'}});
  assert.deepEqual(JSON.parse(JSON.stringify(saved)),saved);assert.ok(saved.artboard.id);assert.equal(saved.manifest.integrity,'complete');
});

test('incomplete imports reject by default before writes and require explicit partial acceptance',async()=>{
  const f=fixture();const p=await project(f);f.browser.capture=async()=>({url:'https://example.com/',html:doc('partial'),width:900,height:700,resources:[],failures:[{url:'https://example.com/locked.png',reason:'HTTP 403'}],warnings:[]});const before=f.fs.writes.length;
  await assert.rejects(f.imports.execute({action:'browser.capture',projectId:p.id,browserId:'b'}, {policy}),{code:'IMPORT_INCOMPLETE'});assert.equal(f.fs.writes.length,before);assert.equal((await f.store.projectGet(p.id)).project.revision,1);
  const saved=await f.imports.execute({action:'browser.capture',projectId:p.id,browserId:'b',allowPartial:true},{policy});assert.equal(saved.record.integrity,'incomplete');assert.equal(saved.manifest.failures.length,1);assert.equal(saved.projectRevision,2);
});

test('partial acceptance requires literal boolean true, not a truthy option string or object',async()=>{
  const f=fixture();const p=await project(f);for(const allowPartial of ['false','true',{},1])await assert.rejects(f.imports.publish({projectId:p.id,allowPartial},{kind:'website',url:'https://example.com/',html:doc('partial'),resources:[],failures:[{url:'https://example.com/missing.png',reason:'HTTP 403'}]},undefined,policy),error=>['IMPORT_INCOMPLETE','INVALID_INPUT'].includes(error.code));assert.equal((await f.store.projectGet(p.id)).project.revision,1);
});

test('read-only imports do not capture, and a project admits only one active import',async()=>{
  const f=fixture();const p=await project(f);let captureCalls=0;let release;const gate=new Promise(resolve=>{release=resolve;});const original=f.browser.capture;
  f.browser.capture=async()=>{captureCalls++;await gate;return original();};
  await assert.rejects(f.imports.capture({projectId:p.id,browserId:'b'},undefined,{...policy,mode:'read-only'}),{code:'FS_SANDBOX_DENIED'});assert.equal(captureCalls,0);
  let ready;const entered=new Promise(resolve=>{ready=resolve;});f.browser.capture=async()=>{captureCalls++;ready();await gate;return original();};
  const first=f.imports.capture({projectId:p.id,browserId:'b'},undefined,policy);await entered;
  await assert.rejects(f.imports.capture({projectId:p.id,browserId:'b'},undefined,policy),{code:'IMPORT_BUSY'});assert.equal(captureCalls,1);release();await first;assert.equal(f.imports.pending.size,0);
});

test('capture admits against the latest revision after long browser work and preserves concurrent settings',async()=>{
  const f=fixture();const p=await project(f);const original=f.browser.capture;
  f.browser.capture=async()=>{await f.store.projectUpdate({projectId:p.id,expectedRevision:1,description:'edited while browsing'});return original();};
  const saved=await f.imports.capture({projectId:p.id,browserId:'b'},undefined,policy);assert.equal(saved.projectRevision,3);assert.equal(saved.project.description,'edited while browsing');assert.equal(saved.artboard.viewport.height,1200);
});

test('publication CAS rejects a race after download without losing the winning edit',async()=>{
  const f=fixture();const p=await project(f);let injected=false;
  f.fs.beforeWrite=async target=>{if(target.targetKey.endsWith(`/projects/${p.id}/project.json`)&&!injected){injected=true;f.fs.beforeWrite=null;await f.store.projectUpdate({projectId:p.id,expectedRevision:1,name:'Concurrent winner'});}};
  await assert.rejects(publish(f,p),{code:'VERSION_CONFLICT'});const current=(await f.store.projectGet(p.id)).project;assert.equal(current.name,'Concurrent winner');assert.equal(current.revision,2);assert.equal(current.imports.length,0);
});

test('source membership and bounded context pages stay inside their project',async()=>{
  const f=fixture();const p=await project(f);const q=await project(f,'Other');const saved=await publish(f,p,{context:{text:'层级😀'.repeat(80)}});const id=saved.record.id;
  await assert.rejects(f.store.importGet(q.id,id),{code:'NOT_FOUND'});await assert.rejects(f.store.importContext(q.id,id),{code:'NOT_FOUND'});
  await assert.rejects(f.store.importGet(p.id,'../outside'),{code:'INVALID_ID'});
  for(const options of [{offset:-1},{offset:1.1},{limit:0},{limit:30001}])await assert.rejects(f.store.importContext(p.id,id,options),{code:'INVALID_INPUT'});
  const expected=f.fs.files.get(`${f.store.root}/projects/${p.id}/imports/${id}/context.json`).bytes.toString('utf8');let combined='',offset=0;let count=0;
  while(true){const page=await f.store.importContext(p.id,id,{offset,limit:17});assert.equal(page.offset,offset);assert.equal(page.total,expected.length);combined+=page.text;count++;if(page.nextOffset===null)break;offset=page.nextOffset;}
  assert.ok(count>1);assert.equal(combined,expected);const pastEnd=await f.store.importContext(p.id,id,{offset:expected.length+10,limit:1});assert.equal(pastEnd.text,'');assert.equal(pastEnd.nextOffset,null);
});

test('import context cannot resolve into a sibling project through a canonical alias',async()=>{
  const f=fixture();const p=await project(f);const q=await project(f,'Sibling');const saved=await publish(f,p,{context:{public:'own source'}});const own=`${f.store.root}/projects/${p.id}/imports/${saved.record.id}/context.json`;const sibling=`${f.store.root}/projects/${q.id}/private-context.json`;f.fs.put(sibling,Buffer.from('SECRET_SIBLING_PROJECT_CONTEXT'));f.fs.aliases.set(own,sibling);await assert.rejects(f.store.importContext(p.id,saved.record.id),error=>['PROJECT_SCOPE','PATH_OUTSIDE_PROJECT','PATH_OUTSIDE_WORKSPACE','INVALID_PATH','INVALID_DOCUMENT'].includes(error.code));assert.ok(!f.fs.reads.includes(sibling));
});

test('dedicated designer tools can page their own context but cannot switch projects',async()=>{
  const f=fixture();const p=await project(f);const q=await project(f,'Other');const saved=await publish(f,p,{context:{nodes:['one','two']}});const scoped=new Map();
  const agent={id:'designer-test',ctx:{tools:{register(def){scoped.set(def.name,def);return ()=>scoped.delete(def.name);},guard:()=>()=>{},restrict:()=>()=>{}},systemPrompt:{section:()=>()=>{}},effect:fn=>fn()}};f.service.installAgent(agent,p.id);
  const read=await scoped.get('designer_project').execute({action:'import.context',importId:saved.record.id,offset:0,limit:10},{});assert.equal(read.text.length,10);
  await assert.rejects(f.service.execute({action:'import.context',projectId:q.id,importId:saved.record.id},{agent}),{code:'PROJECT_SCOPE'});
  await assert.rejects(f.service.execute({action:'connection.save',projectId:p.id,provider:'figma',token:'x'},{agent,user:true}),{code:'ACTION_NOT_ALLOWED'});
});

test('resource capability URL resolves from artboard base and protects project/manifest/hash boundaries',async()=>{
  const f=fixture();const p=await project(f);const q=await project(f,'Other');const saved=await publish(f,p,{html:'<html><body><img src="https://example.com/pixel.png"></body></html>',resources:[{url:'https://example.com/pixel.png',mimeType:'image/png',bytesBase64:png.toString('base64'),category:'images'}]});const item=saved.manifest.resources[0];const base=f.imports.base(p.id);const url=new URL('../'+item.path,'http://localhost'+base).pathname;
  const good=await resource(f,url);assert.equal(good.status,200);assert.ok(good.body.equals(png));assert.equal(good.headers['Access-Control-Allow-Origin'],'*');assert.equal(good.headers['Access-Control-Allow-Credentials'],undefined);assert.equal(good.headers['X-Content-Type-Options'],'nosniff');assert.equal(good.headers['Referrer-Policy'],'no-referrer');
  const head=await resource(f,url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,undefined);assert.equal(head.headers['Content-Length'],png.length);
  assert.equal((await resource(f,url,{method:'POST'})).status,405);
  assert.equal((await resource(f,url.replace(base.split('/')[4],'wrong-token'))).status,403);
  assert.equal((await resource(f,url.replace(p.id,q.id))).status,403);
  assert.equal((await resource(f,url.replace(path.posix.basename(item.path),'missing.png'))).status,404);
  for(const segment of ['..%2f..%2fsecret','%5c..%5csecret','%00secret','%E0%A4%A'])assert.notEqual((await resource(f,url.replace(path.posix.basename(item.path),segment))).status,200);
  const target=await f.store.target(`projects/${p.id}/${item.path}`);f.fs.put(target,Buffer.concat([png,Buffer.from('modified')]));assert.equal((await resource(f,url)).status,409);
});

test('resource routes cannot follow a canonical asset symlink outside the library',async()=>{
  const f=fixture();const p=await project(f);const saved=await publish(f,p,{resources:[{url:'https://example.com/pixel.png',mimeType:'image/png',bytesBase64:png.toString('base64'),category:'images'}]});const item=saved.manifest.resources[0];const target=`${f.store.root}/projects/${p.id}/${item.path}`;f.fs.aliases.set(target,'/private/secret.png');f.fs.put('/private/secret.png',png);const url=new URL('../'+item.path,'http://localhost'+f.imports.base(p.id)).pathname;assert.notEqual((await resource(f,url)).status,200);assert.ok(!f.fs.reads.includes('/private/secret.png'));
});

test('resource canonical containment is per project, including sibling projects inside the library',async()=>{
  const f=fixture();const p=await project(f);const q=await project(f,'Sibling');const saved=await publish(f,p,{resources:[{url:'https://example.com/pixel.png',mimeType:'image/png',bytesBase64:png.toString('base64'),category:'images'}]});const item=saved.manifest.resources[0];const target=`${f.store.root}/projects/${p.id}/${item.path}`;const sibling=`${f.store.root}/projects/${q.id}/private.png`;f.fs.aliases.set(target,sibling);f.fs.put(sibling,png);const url=new URL('../'+item.path,'http://localhost'+f.imports.base(p.id)).pathname;assert.notEqual((await resource(f,url)).status,200);assert.ok(!f.fs.reads.includes(sibling));
});

test('HTTP owner admission protects credential writes and GET cannot invoke imports',async()=>{
  const f=fixture();const body={action:'connection.save',provider:'mastergo',token:'private-ui-token'};
  assert.equal((await http(f,body,{admission:{rejection:403}})).status,403);assert.equal(f.credentialWrites.length,0);
  assert.equal((await http(f,body,{admission:{peer:{principal:{kind:'agent'}}}})).status,403);assert.equal(f.credentialWrites.length,0);
  const accepted=await http(f,body);assert.equal(accepted.status,200);assert.ok(!JSON.stringify(accepted.body).includes('private-ui-token'));assert.equal(f.credentialWrites.length,1);
  assert.equal((await http(f,undefined,{method:'GET',query:'?action=source.import'})).status,400);
});

// Regression specifications remain normal assertions: the lead owns fixes in production files.
test('browser-normalized singular resource categories remain importable',async()=>{
  const f=fixture();const p=await project(f);const saved=await publish(f,p,{html:'<html><body><img src="https://example.com/pixel.png"></body></html>',resources:[{url:'https://example.com/pixel.png',mimeType:'image/png',bytesBase64:png.toString('base64'),category:'image'}]});assert.equal(saved.record.integrity,'complete');assert.equal(saved.manifest.resources.length,1);
});

test('saved screenshot preview is listed and retrievable through the resource capability',async()=>{
  const f=fixture();const p=await project(f);const saved=await publish(f,p,{screenshot:'data:image/png;base64,'+png.toString('base64')});const url=new URL('../'+saved.record.previewPath,'http://localhost'+f.imports.base(p.id)).pathname;const response=await resource(f,url);assert.equal(response.status,200);assert.ok(response.body.equals(png));
});

test('manifest and source context hashes reject external replacement with unchanged identity',async()=>{
  const f=fixture();const p=await project(f);const saved=await publish(f,p,{context:{nodes:['one']}});assert.match(saved.record.manifestHash,/^[a-f0-9]{64}$/);assert.match(saved.record.contextHash,/^[a-f0-9]{64}$/);
  const contextTarget=await f.store.target(`projects/${p.id}/${saved.record.contextPath}`);f.fs.put(contextTarget,Buffer.from('{"nodes":["changed"]}'));await assert.rejects(f.store.importContext(p.id,saved.record.id),{code:'VERSION_CONFLICT'});
  const manifestTarget=await f.store.target(`projects/${p.id}/${saved.record.manifestPath}`);f.fs.put(manifestTarget,Buffer.from(JSON.stringify({...saved.manifest,warnings:['changed externally']})));await assert.rejects(f.store.importGet(p.id,saved.record.id),{code:'VERSION_CONFLICT'});
});

test('importGet rejects a manifest whose identity no longer matches its imported source',async()=>{
  const f=fixture();const p=await project(f);const saved=await publish(f,p);const target=await f.store.target(`projects/${p.id}/${saved.record.manifestPath}`);const corrupt={...saved.manifest,importId:'i-other'};f.fs.put(target,Buffer.from(JSON.stringify(corrupt)));await assert.rejects(f.store.importGet(p.id,saved.record.id),error=>['INVALID_IMPORT','INVALID_DOCUMENT','VERSION_CONFLICT'].includes(error.code));
});
