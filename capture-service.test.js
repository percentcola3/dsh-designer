import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {CaptureService} from './capture-service.js';
import {parseCliOutput} from './browser-engine.js';

const policy={mode:'workspace-write',workspaceRoot:'/workspace'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=','base64');
const jpeg=Buffer.from([255,216,255,224,0,4,74,70,255,217]);
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=','base64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=(path,bytes,mimeType)=>({path,bytesBase64:Buffer.from(bytes).toString('base64'),mimeType});
const html='<!doctype html><html><head><link rel="stylesheet" href="../assets/main.css"><script>window.testReady=true;</script></head><body><main data-dsh-node="hero">Saved content<img src="../assets/pixel.png"></main></body></html>';
const defaultFiles=()=>[file('html/page.html',html,'text/html'),file('assets/main.css','@import "nested.css";main{background-image:url(pixel.png)}','text/css'),file('assets/nested.css','@font-face{font-family:Fixture;src:url(font.woff2)}','text/css'),file('assets/pixel.png',png,'image/png'),file('assets/font.woff2',Buffer.from('wOF2fake-font'),'font/woff2'),file('docs/context.json','TOP_SECRET_CONTEXT','application/json'),file('assets/unused.css','private unused resource','text/css')];
async function response(service,url,method='GET'){const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};res.handled=await service.handle({url,method},res);return res;}
function fixture(){
  const scope=new AsyncLocalStorage(),commands=[],pages=new Map(),settings={formatMismatch:false,shotError:null,content:{width:900,height:1400},imageFailures:0,gate:null},taskCalls=[];
  const user={label:'p-user',closed:false};pages.set(user.label,user);let pageNumber=0;let service;
  const createPage=()=>{const page={label:'capture-'+(++pageNumber),closed:false,urlValue:'about:blank',async goto(url){this.urlValue=url;const received=await response(service,new URL(url).pathname);assert.equal(received.status,200);assert.match(received.headers['Content-Security-Policy'],/sandbox allow-scripts/);},async url(){return this.urlValue;},async evaluate(fn,args){commands.push({method:'evaluate',args});assert.equal(typeof fn,'function');return {boxes:(args.nodeIds||[]).map(id=>({id,x:10,y:20,width:80,height:90,visible:true})),marked:args.editorMarks?(args.nodeIds.length||1):0,viewport:{width:900,height:700},fontStatus:'loaded',imageFailures:settings.imageFailures,runtime:{present:true,readyState:'complete',scene:args.scene||null}};},async cdp(method,params,options){commands.push({method,params,options});if(method==='Page.getLayoutMetrics')return {cssContentSize:settings.content};if(method==='Page.captureScreenshot'){if(settings.gate)await settings.gate;if(settings.shotError)throw settings.shotError;const bytes=settings.formatMismatch?png:params.format==='jpeg'?jpeg:params.format==='webp'?webp:png;return {data:bytes.toString('base64')};}return {};},async events(){return [];},async close(){this.closed=true;commands.push({method:'close',label:this.label});}};pages.set(page.label,page);return page;};
  const browser={spaceId:7,spaceName:'one-existing-goal',disposed:false,browsers:new Map([['user-browser',{browserId:'user-browser',projectId:'p-other',label:user.label,spaceId:7}]]),queue:Promise.resolve(),_serial(work){const result=this.queue.then(work);this.queue=result.catch(()=>{});return result;},async _run(source,timeout){await Promise.resolve();assert.equal(scope.getStore(),policy,'every native CLI call must retain exact caller ALS policy');assert.ok(timeout>0&&timeout<=40000);let receipt='';const taskSpace=async id=>{taskCalls.push(id);assert.equal(id,7,'resume the existing task space instead of creating another');return {spaceId:7,page:label=>{const page=pages.get(label);assert.ok(page&&!page.closed,'only operate a live owned Page');return page;},newPage:async()=>createPage()};};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction('taskSpace','console',source)(taskSpace,{log:value=>{receipt=value;}});return parseCliOutput(receipt);}};
  const project={id:'p-test',revision:3,artboards:[{id:'a-page',htmlPath:'html/page.html',revision:2,contentHash:sha(html),viewport:{width:900,height:700}}]};let fsReads=0;const owner={ctx:{webServer:{getOrigin:()=> 'http://127.0.0.1:53998'},fs:{readBytes(){fsReads++;assert.fail('finite capability requests must not read Fs');}}},store:{async projectGet(id){assert.equal(id,project.id);return {project};}},imports:{browser,browserScope:scope},delivery:{async snapshot(_project,input,env){assert.equal(input.pageId,'a-page');assert.equal(env.policy,policy);return {pages:project.artboards,files:defaultFiles().map(f=>({...f,bytes:Buffer.from(f.bytesBase64,'base64')}))};}}};
  let now=1000;service=new CaptureService(owner,{now:()=>now});const payload={projectId:'p-test',pageId:'a-page',html,logicalPath:'html/page.html',files:defaultFiles(),viewport:{width:900,height:700},policy};return {service,owner,browser,scope,commands,pages,user,settings,taskCalls,payload,project,get fsReads(){return fsReads;},advance(ms){now+=ms;}};
}

test('finite capabilities include only selected HTML and recursively referenced static dependencies',async()=>{
  const f=fixture();const snapshot=await f.service.prepare(f.payload,{policy,deadline:Date.now()+10000});assert.deepEqual([...snapshot.files.keys()].sort(),['assets/font.woff2','assets/main.css','assets/nested.css','assets/pixel.png','html/page.html']);const cap=f.service.issue(snapshot),base=new URL(cap.prefix).pathname;
  const entry=await response(f.service,base+'html/page.html');assert.equal(entry.status,200);assert.equal(entry.headers['Cache-Control'],'no-store');assert.equal(entry.headers['Access-Control-Allow-Origin'],'*');assert.equal(entry.headers['Access-Control-Allow-Credentials'],undefined);assert.ok(entry.headers['Content-Security-Policy'].includes("connect-src 'none'"));assert.ok(!entry.headers['Content-Security-Policy'].includes('allow-same-origin'));assert.ok(!entry.headers['Content-Security-Policy'].includes("'unsafe-inline'; style-src"));assert.ok(!entry.body.toString().includes('TOP_SECRET_CONTEXT'));
  assert.equal((await response(f.service,base+'docs/context.json')).status,404);assert.equal((await response(f.service,base+'assets/unused.css')).status,404);assert.equal((await response(f.service,base+'index.html')).status,404);assert.equal(f.fsReads,0);
  const head=await response(f.service,base+'assets/pixel.png','HEAD');assert.equal(head.status,200);assert.equal(head.body,undefined);assert.equal(Number(head.headers['Content-Length']),png.length);assert.equal((await response(f.service,base+'html/page.html','POST')).status,405);
});

test('capabilities expire/revoke and reject traversal, encoded separators, wrong prefixes and modified bytes',async()=>{
  const f=fixture();const cap=f.service.issue(await f.service.prepare(f.payload,{policy,deadline:Date.now()+10000})),base=new URL(cap.prefix).pathname;
  for(const name of ['../html/page.html','%2e%2e/html/page.html','html%2fpage.html','assets/%5c..%5csecret','assets/%00secret','assets/%E0%A4%A'])assert.notEqual((await response(f.service,base+name)).status,200);
  assert.equal((await response(f.service,'/wrong'+base+'html/page.html')).handled,false);assert.equal((await response(f.service,base.replace(cap.token,'wrong')+'html/page.html')).status,410);
  cap.files.get('assets/pixel.png').bytes=Buffer.from('tampered');assert.equal((await response(f.service,base+'assets/pixel.png')).status,409);f.advance(60001);assert.equal((await response(f.service,base+'html/page.html')).status,410);assert.equal(f.service.capabilities.size,0);
  const second=f.service.issue(await f.service.prepare(f.payload,{policy,deadline:Date.now()+10000}));f.service.revoke(second.token);assert.equal((await response(f.service,new URL(second.prefix).pathname+'html/page.html')).status,410);
});

test('snapshot ownership, MIME, hash and remote resource checks happen before native browser work',async()=>{
  const f=fixture();await assert.rejects(f.service.capture({...f.payload,pageId:'a-other'}),{code:'PROJECT_SCOPE'});await assert.rejects(f.service.capture({...f.payload,logicalPath:'../private.html'}),{code:'INVALID_CAPTURE_PATH'});
  await assert.rejects(f.service.capture({...f.payload,files:f.payload.files.map(x=>x.path==='assets/pixel.png'?{...x,bytes:{length:2**40}}:x)}),{code:'INVALID_CAPTURE_BYTES'});
  const bad=f.payload.files.map(x=>x.path==='assets/pixel.png'?{...x,mimeType:'text/javascript'}:x);await assert.rejects(f.service.capture({...f.payload,files:bad}),{code:'CAPTURE_MIME_MISMATCH'});
  const changed=f.payload.files.map(x=>x.path==='assets/pixel.png'?{...x,sha256:sha(Buffer.from('other'))}:x);await assert.rejects(f.service.capture({...f.payload,files:changed}),{code:'CAPTURE_INTEGRITY'});
  await assert.rejects(f.service.capture({...f.payload,html:'<html><body><img src="https://foreign.example/secret.png"></body></html>'}),{code:'CAPTURE_REMOTE_RESOURCE'});assert.equal(f.taskCalls.length,0);assert.equal(f.service.capabilities.size,0);
});

test('PNG adapter runs the native script in shared policy scope, forwards presentation flags and returns original bytes',async()=>{
  const f=fixture();const result=await f.service.capture({...f.payload,background:false,editorMarks:true,nodeIds:['hero'],scene:'success'});assert.equal(result.mimeType,'image/png');assert.ok(Buffer.from(result.bytesBase64,'base64').equals(png));assert.deepEqual(result.metadata.region,{x:10,y:20,width:80,height:90,scale:1});assert.equal(result.metadata.editorMarkCount,1);assert.equal(result.metadata.runtime.scene,'success');assert.equal(result.metadata.savedSourceHash,sha(html));assert.deepEqual(result.metadata.sourceVersion,{pageRevision:2,sourceHash:sha(html)});assert.notEqual(result.metadata.sourceHtmlHash,result.metadata.savedSourceHash);assert.deepEqual(result.metadata.boundsVersion,{pageRevision:2,sourceHash:sha(html),viewport:result.metadata.requestedViewport,scene:'success'});
  assert.deepEqual(f.commands.find(c=>c.method==='Emulation.setDefaultBackgroundColorOverride').params.color,{r:0,g:0,b:0,a:0});const evaluated=f.commands.find(c=>c.method==='evaluate').args;assert.equal(evaluated.background,false);assert.equal(evaluated.editorMarks,true);assert.deepEqual(evaluated.nodeIds,['hero']);assert.equal(f.commands.find(c=>c.method==='Page.captureScreenshot').params.captureBeyondViewport,true);
  assert.equal(f.user.closed,false);assert.equal(f.browser.browsers.size,1);assert.equal(f.service.pages.size,0);assert.equal(f.service.capabilities.size,0);assert.equal(f.scope.getStore(),undefined);assert.ok(f.taskCalls.every(id=>id===7));
});

test('full-page height beyond 3840 is captured through native CDP bounds without a fake resized image',async()=>{
  const f=fixture();f.settings.content={width:900,height:12500};const result=await f.service.capture(f.payload);assert.equal(result.height,12500);assert.equal(result.width,900);assert.equal(f.commands.find(c=>c.method==='Page.captureScreenshot').params.clip.height,12500);assert.equal(result.metadata.scope,'page');assert.equal(f.user.closed,false);const fractional=await f.service.capture({...f.payload,region:{x:5.2,y:6.1,width:80.1,height:90.2}});assert.deepEqual(fractional.metadata.region,{x:5,y:6,width:81,height:91,scale:1});
});

test('JPEG and WebP request actual native formats; alpha JPEG and encoder mismatch reject honestly',async()=>{
  for(const [format,bytes,mime]of [['jpeg',jpeg,'image/jpeg'],['webp',webp,'image/webp']]){const f=fixture();const result=await f.service.capture({...f.payload,format,quality:72,region:{x:5,y:6,width:80,height:90}});assert.equal(result.mimeType,mime);assert.ok(Buffer.from(result.bytesBase64,'base64').equals(bytes));const shot=f.commands.find(c=>c.method==='Page.captureScreenshot');assert.equal(shot.params.format,format);assert.equal(shot.params.quality,72);assert.deepEqual(shot.params.clip,{x:5,y:6,width:80,height:90,scale:1});}
  const f=fixture();await assert.rejects(f.service.capture({...f.payload,format:'jpeg',background:false}),{code:'CAPTURE_ALPHA_UNSUPPORTED'});assert.equal(f.taskCalls.length,0);f.settings.formatMismatch=true;await assert.rejects(f.service.capture({...f.payload,format:'webp'}),{code:'CAPTURE_FORMAT_MISMATCH'});assert.equal(f.service.pages.size,0);assert.equal(f.service.capabilities.size,0);
});

test('unsupported native encoder, runtime failures and oversized clips close only the owned page',async()=>{
  const f=fixture();f.settings.shotError=Error('Invalid parameters: format is not supported');await assert.rejects(f.service.capture({...f.payload,format:'webp'}),{code:'CAPTURE_FORMAT_UNSUPPORTED'});assert.equal(f.service.pages.size,0);assert.equal(f.service.capabilities.size,0);assert.equal(f.user.closed,false);
  const next=fixture();next.settings.content={width:900,height:21000};await assert.rejects(next.service.capture(next.payload),{code:'CAPTURE_BOUNDS'});assert.equal(next.service.pages.size,0);assert.equal(next.service.capabilities.size,0);assert.equal(next.user.closed,false);
});

test('abort revokes capabilities immediately and drains owned-page cleanup without finishing the shared space',async()=>{
  const f=fixture(),controller=new AbortController();let release,entered;f.settings.gate=new Promise(resolve=>{release=resolve;});const reached=new Promise(resolve=>{entered=resolve;});const original=f.browser._run;f.browser._run=async(source,timeout)=>{if(source.includes('Page.captureScreenshot'))entered();return original.call(f.browser,source,timeout);};const capture=f.service.capture(f.payload,{policy,signal:controller.signal});await reached;controller.abort();assert.equal(f.service.capabilities.size,0);release();await assert.rejects(capture,error=>error.name==='AbortError');assert.equal(f.service.pages.size,0);assert.equal(f.user.closed,false);assert.equal(f.browser.browsers.size,1);await f.service.dispose();assert.equal(f.user.closed,false);
});

test('partial asset rendering is refused by default and explicit incomplete mode records failures',async()=>{
  const f=fixture();f.settings.imageFailures=1;await assert.rejects(f.service.capture(f.payload),{code:'CAPTURE_RENDER_INCOMPLETE'});assert.equal(f.service.pages.size,0);assert.equal(f.service.capabilities.size,0);const result=await f.service.capture({...f.payload,allowIncomplete:true});assert.equal(result.metadata.imageFailures,1);assert.equal(result.warnings[0].code,'CAPTURE_IMAGE_LOAD_FAILED');
});

test('saved source identity comes from trusted project data rather than supplied capture metadata',async()=>{
  const f=fixture();const result=await f.service.capture({...f.payload,savedSourceHash:'forged',sourceVersion:{pageRevision:999,sourceHash:'forged'}});assert.equal(result.metadata.savedSourceHash,sha(html));assert.deepEqual(result.metadata.sourceVersion,{pageRevision:2,sourceHash:sha(html)});await assert.rejects(f.service.capture({...f.payload,expectedArtboardRevision:1}),{code:'VERSION_CONFLICT'});
});

test('user control stops further browser commands and revokes the data capability immediately',async()=>{
  const f=fixture();f.settings.shotError=Object.assign(new Error('User took control'),{code:'EGO_USER_CONTROL'});await assert.rejects(f.service.capture(f.payload),{code:'EGO_USER_CONTROL'});assert.equal(f.service.capabilities.size,0);assert.equal(f.commands.filter(c=>c.method==='close').length,0);const calls=f.taskCalls.length;await f.service.dispose();assert.equal(f.taskCalls.length,calls);assert.equal(f.user.closed,false);
});

test('direct adapter can ask Delivery for a frozen dependency snapshot and never exposes general Fs paths',async()=>{
  const f=fixture();let prepared=false;const original=f.owner.delivery.snapshot;f.owner.delivery.snapshot=async(...args)=>{prepared=true;return original(...args);};const result=await f.service.capture({projectId:'p-test',pageId:'a-page',policy});assert.equal(prepared,true);assert.equal(result.metadata.pageRevision,2);assert.equal(f.fsReads,0);assert.equal(f.service.capabilities.size,0);assert.equal(f.service.pages.size,0);
});

test('sandbox and policy denials revoke capture capability without fallback or further browser control',async()=>{
  for(const code of ['FS_SANDBOX_DENIED','PERMISSION_DENIED','POLICY_DENIED']){
    const f=fixture();f.settings.shotError=Object.assign(new Error('capture denied'),{code});await assert.rejects(f.service.capture(f.payload),{code});
    assert.equal(f.service.capabilities.size,0);assert.equal(f.user.closed,false);assert.equal(f.commands.filter(command=>command.method==='Page.captureScreenshot').length,1);assert.equal(f.commands.some(command=>command.method==='close'),false);await f.service.dispose();assert.equal(f.commands.some(command=>command.method==='close'),false);
  }
});

test('dispose revokes pending capabilities and owns no browser-wide finish action',async()=>{
  const f=fixture();f.service.issue(await f.service.prepare(f.payload,{policy,deadline:Date.now()+10000}));await f.service.dispose();assert.equal(f.service.capabilities.size,0);assert.equal(f.user.closed,false);assert.equal(f.browser.browsers.size,1);await assert.rejects(f.service.capture(f.payload),{code:'CAPTURE_DISPOSED'});assert.ok(!f.commands.some(c=>c.method==='finish'));
});
