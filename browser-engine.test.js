import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {collectRemoteResources,buildAssetBundle} from './asset-archive.js';
import { BrowserEngine, createCliRunner, parseMhtml, restoreMhtmlReferences, cssResourceUrls, parseCliOutput, wrapCliScript, waitForCaptureAssets, BROWSER_RESULT_MARKER } from './browser-engine.js';

function fakeEngine(extra = {}) {
  const calls = [];
  const runner = async source => {
    calls.push(source);
    if (source.includes('value:{spaceId:')) return {spaceId:123};
    if (source.includes('value:{label}')) return {label:'p1'};
    if (source.includes('Page.captureSnapshot')) return {html:'<!doctype html><html></html>',resourceUrls:[],mhtml:'',warnings:[],width:900,height:700,title:'Current',url:'https://example.com/',screenshot:'data:image/png;base64,AA==',responses:[]};
    if (source.includes('value:{closed:true}')) return {closed:true};
    return {url:'https://example.com/',title:'Example',width:900,height:700,screenshot:'data:image/png;base64,AA==',responses:[]};
  };
  return {engine:new BrowserEngine({runner,...extra}),calls};
}

test('construction is lazy; open tracks owned project metadata and screenshots', async () => {
  const {engine,calls} = fakeEngine(); assert.equal(calls.length,0);
  const page = await engine.open({projectId:'p',url:'https://example.com',width:900,height:700});
  assert.equal(calls.length,3); assert.equal(page.projectId,'p'); assert.match(page.screenshot,/^data:image\/png;base64,/);
  assert.deepEqual(engine.info(page.browserId),{browserId:page.browserId,projectId:'p'});
  assert.match(calls.at(-1),/deviceScaleFactor:1/); assert.ok(!calls.join('\n').includes('profileId'));
  const capture=await engine.capture({browserId:page.browserId,projectId:'p'});assert.deepEqual(capture.resources,[]);assert.deepEqual(capture.failures,[]);assert.equal(capture.html,'<!doctype html><html></html>');
  await engine.dispose(); await engine.dispose(); assert.equal(calls.filter(s=>s.includes('task.finish')).length,1);
});

test('explicit existing-space resume preserves identity and never takes control or finishes the goal space',async()=>{
  const {engine,calls}=fakeEngine();
  await engine.open({projectId:'p',url:'https://example.com',spaceId:123});
  assert.equal(engine.spaceId,123);assert.equal(engine.retainSpace,true);assert.match(calls[0],/taskSpace\(123\)/);
  const before=calls.length;
  await assert.rejects(engine.open({projectId:'p',url:'https://example.com',spaceId:124}),{code:'BROWSER_SPACE_SCOPE'});
  await assert.rejects(engine.open({projectId:'p',url:'https://example.com',spaceId:-1}),{code:'INVALID_BROWSER_SPACE'});
  assert.equal(calls.length,before);await engine.dispose();
  assert.equal(calls.some(source=>source.includes('task.finish')),false);
  assert.equal(calls.some(source=>source.includes('takeOverTaskSpace')||source.includes('claimTaskSpace')),false);
});

test('existing-space control errors propagate without creating or switching spaces',async()=>{
  const {engine,calls}=fakeEngine();engine.runner=async source=>{calls.push(source);throw Object.assign(Error('user holds this TaskSpace'),{code:'EGO_CONTROL_LOST'});};
  await assert.rejects(engine.open({projectId:'p',url:'https://example.com',spaceId:123}),{code:'EGO_CONTROL_LOST'});
  assert.equal(calls.length,1);assert.match(calls[0],/taskSpace\(123\)/);assert.equal(engine.spaceId,null);
});

test('opening recovers an expired engine-owned space while invalidating its old browser handles',async()=>{
  const {engine,calls}=fakeEngine(),runner=engine.runner;
  const old=await engine.open({projectId:'p',url:'https://example.com'});
  engine.runner=async source=>{
    if(source.includes('value:{spaceId:')&&source.includes('taskSpace(123)'))throw Error('task space not found: 123');
    return runner(source);
  };
  const next=await engine.open({projectId:'p',url:'https://example.org'});
  assert.notEqual(next.browserId,old.browserId);
  assert.equal(engine.info(old.browserId),null);
  assert.equal(engine.info(next.browserId).projectId,'p');
  assert.ok(calls.some(source=>/taskSpace\("Designer /.test(source)));
});

test('an expired explicitly retained space never falls back to another space',async()=>{
  const {engine}=fakeEngine();
  await engine.open({projectId:'p',url:'https://example.com',spaceId:123});
  let calls=0;
  engine.runner=async()=>{calls++;throw Error('task space not found: 123');};
  await assert.rejects(engine.open({projectId:'p',url:'https://example.org'}),/task space not found/);
  assert.equal(calls,1);
  assert.equal(engine.spaceId,123);
});

test('invalid inputs and cross-project actions never reach the CLI', async () => {
  const {engine,calls}=fakeEngine();
  for(const url of ['file:///etc/passwd','javascript:alert(1)','https://user:password@example.com','broken']) await assert.rejects(engine.open({projectId:'p',url}),{code:'INVALID_URL'});
  await assert.rejects(engine.open({projectId:'p',url:'https://example.com',width:100000}),{code:'INVALID_VIEWPORT'});assert.equal(calls.length,0);
  const {browserId}=await engine.open({projectId:'p',url:'https://example.com'});const before=calls.length;
  for(const method of ['action','capture','close']) await assert.rejects(engine[method]({browserId,projectId:'other',type:'navigate',url:'https://example.com'}),{code:'BROWSER_PROJECT_SCOPE'});
  await assert.rejects(engine.capture({browserId}),{code:'BROWSER_PROJECT_SCOPE'});assert.equal(calls.length,before);
  await assert.rejects(engine.action({browserId,projectId:'p',type:'click',x:NaN,y:2}),{code:'INVALID_ACTION'});
  await assert.rejects(engine.action({browserId,projectId:'p',type:'scroll',deltaY:Infinity}),{code:'INVALID_ACTION'});
  await assert.rejects(engine.action({browserId,projectId:'p',type:'type',text:'x'.repeat(10001)}),{code:'INVALID_ACTION'});
  await assert.rejects(engine.action({browserId,projectId:'p',type:'navigate',url:'data:text/html,foo'}),{code:'INVALID_URL'});
  assert.equal(calls.length,before);await engine.dispose();
});

test('CLI source treats user text as JSON data and reapplies viewport each round',async()=>{
  const {engine,calls}=fakeEngine();const {browserId}=await engine.open({projectId:'p',url:'https://example.com'});
  const malicious='\"; await task.finish({keep:[]}); //\n` ${process.env.HOME}';
  await engine.action({browserId,projectId:'p',type:'type',selector:'#input',text:malicious});
  const source=calls.at(-1);assert.ok(source.includes(JSON.stringify(malicious)));assert.match(source,/Emulation.setDeviceMetricsOverride/);
  await engine.close({browserId,projectId:'p'});assert.equal(engine.info(browserId),null);await engine.dispose();
});

test('MHTML parses folded headers, quoted-printable CSS and binary assets',()=>{
  const archive='MIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\tboundary="test-boundary"\r\n\r\n--test-boundary\r\nContent-Type: text/css; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://example.com/style.css\r\n\r\nbody {color:=\r\n=23fff;}\r\n--test-boundary\r\nContent-Type: font/woff2\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://example.com/font.woff2\r\n\r\nAAECA/8=\r\n--test-boundary\r\nContent-Type: text/html\r\nContent-Location: https://example.com/\r\n\r\n<script>evil</script>\r\n--test-boundary--\r\n';
  const resources=parseMhtml(archive);assert.equal(resources.length,2);assert.equal(resources[0].category,'stylesheet');assert.equal(Buffer.from(resources[0].bytesBase64,'base64').toString(),'body {color:#fff;}');assert.deepEqual(Buffer.from(resources[1].bytesBase64,'base64'),Buffer.from([0,1,2,3,255]));assert.equal(resources[1].category,'font');
  assert.equal(parseMhtml(archive,{maxResourceBytes:2,maxTotalBytes:10}).length,0);assert.deepEqual(parseMhtml('not mhtml'),[]);
});

function cidArchive(suffix='one',reverse=false){const parts=[['cid:css-'+suffix+'@mhtml.blink','text/css','@import "cid:nested-'+suffix+'@mhtml.blink";@font-face{src:url("fonts/jp.ttf")}'],['cid:nested-'+suffix+'@mhtml.blink','text/css','body{color:#123}'],['https://example.test/pages/fonts/jp.ttf','font/ttf',Buffer.from([0,1,0,0,0,1,2])]];if(reverse)parts.reverse();return 'Content-Type: multipart/related; boundary="cid-test"\r\n\r\n'+parts.map(([url,mime,bytes])=>'--cid-test\r\nContent-Location: '+url+'\r\n'+(/^cid:/.test(url)?'Content-ID: <'+url.slice(4)+'>\r\n':'')+'Content-Type: '+mime+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from(bytes).toString('base64')+'\r\n').join('')+'--cid-test--\r\n';}

test('MHTML CID styles resolve only captured parts with stable content hashes and original document base',()=>{
  const aliases=new Map(),failures=[],first=parseMhtml(cidArchive(),{sourceUrl:'https://example.test/pages/view.html',onAlias:(id,url)=>aliases.set(id,url),onFailure:value=>failures.push(value)}),second=parseMhtml(cidArchive('different',true),{sourceUrl:'https://example.test/pages/view.html',onFailure:value=>failures.push(value)});
  assert.deepEqual(failures,[]);assert.deepEqual(first.map(resource=>resource.url).sort(),second.map(resource=>resource.url).sort());
  for(const resource of first.filter(resource=>resource.mimeType==='text/css')){const bytes=Buffer.from(resource.bytesBase64,'base64');assert.ok(resource.url.endsWith(createHash('sha256').update(bytes).digest('hex')+'.css'));assert.ok(!bytes.toString().includes('cid:'));}
  assert.ok(first.some(resource=>Buffer.from(resource.bytesBase64,'base64').toString().includes('https://example.test/pages/fonts/jp.ttf')));
  const html=restoreMhtmlReferences('<html><head><link rel="stylesheet" href="cid:css-one@mhtml.blink"></head><body style="background:url(cid:nested-one@mhtml.blink)"></body></html>',aliases,value=>failures.push(value));assert.ok(!html.includes('cid:'));assert.ok(html.includes(aliases.get('cid:css-one@mhtml.blink')));assert.deepEqual(failures,[]);
  const missing=[];const unknown=restoreMhtmlReferences('<img src="cid:absent@mhtml.blink">',aliases,value=>missing.push(value));assert.ok(unknown.includes('about:blank#snapshot-resource-unavailable'));assert.equal(missing[0].code,'MHTML_CID_MISSING');
  const limited=[],limitedAliases=[];parseMhtml(cidArchive(),{sourceUrl:'https://example.test/pages/view.html',maxResourceBytes:1,onAlias:(...args)=>limitedAliases.push(args),onFailure:value=>limited.push(value)});assert.equal(limitedAliases.length,0);assert.ok(limited.some(value=>value.code==='RESOURCE_LIMIT'));
});

test('capture and archive reconstruct CID stylesheet dependencies without issuing any CID or synthetic network fetch',async()=>{
  const {engine,calls}=fakeEngine(),runner=engine.runner;engine.runner=async(source,options)=>source.includes('Page.captureSnapshot')?(calls.push(source),{html:'<!doctype html><html><head><link rel="stylesheet" href="cid:css-one@mhtml.blink"></head><body>Frozen</body></html>',resourceUrls:['cid:css-one@mhtml.blink'],mhtml:cidArchive(),warnings:[],width:900,height:700,url:'https://example.test/pages/view.html',baseURL:'https://example.test/pages/view.html',responses:[]}):runner(source,options);
  const page=await engine.open({projectId:'p',url:'https://example.test/pages/view.html'}),before=calls.length,captured=await engine.capture({browserId:page.browserId,projectId:'p'});assert.equal(calls.length,before+1);assert.deepEqual(captured.failures,[]);assert.equal(captured.resources.length,3);assert.ok(!captured.html.includes('cid:'));
  let fetches=0;const collected=await collectRemoteResources(captured.resources,{sourceUrl:captured.url,fetch:async()=>{fetches++;throw Error('all CID and font bytes are already captured')}});assert.deepEqual(collected.failures,[]);assert.equal(fetches,0);const bundle=buildAssetBundle({importId:'i-cid-test',html:captured.html,source:{kind:'website',url:captured.url},resources:collected.resources});assert.equal(bundle.record.integrity,'complete');assert.equal(bundle.record.resourceSummary.styles.count,2);assert.equal(bundle.record.resourceSummary.fonts.count,1);assert.ok(!bundle.html.includes('cid:'));await engine.dispose();
});

test('MHTML rejects conflicting or unresolvable internal references without enabling the CID protocol',()=>{
  const failures=[],aliases=new Map(),data='Content-Type: multipart/related; boundary="b"\r\n\r\n'+[['https://example.test/a.css','a{}'],['https://example.test/b.css','b{}']].map(([url,body])=>'--b\r\nContent-Type: text/css\r\nContent-Location: '+url+'\r\nContent-ID: <same@mhtml.blink>\r\n\r\n'+body+'\r\n').join('')+'--b--\r\n';parseMhtml(data,{sourceUrl:'https://example.test/',onFailure:value=>failures.push(value),onAlias:(id,url)=>aliases.set(id,url)});assert.ok(failures.some(value=>value.code==='MHTML_CID_CONFLICT'));assert.equal(aliases.has('cid:same@mhtml.blink'),false);
  const missing=[];parseMhtml(cidArchive().replace(Buffer.from('@import "cid:nested-one@mhtml.blink";@font-face{src:url("fonts/jp.ttf")}').toString('base64'),Buffer.from('@import "cid:missing@mhtml.blink";').toString('base64')),{sourceUrl:'https://example.test/',onFailure:value=>missing.push(value)});assert.ok(missing.some(value=>value.code==='MHTML_CID_MISSING'));
  const deep=[],chain='Content-Type: multipart/related; boundary="chain"\r\n\r\n'+Array.from({length:120},(_,index)=>'--chain\r\nContent-Type: text/css\r\nContent-Location: cid:style-'+index+'@mhtml.blink\r\n\r\n'+(index<119?'@import "cid:style-'+(index+1)+'@mhtml.blink";':'body{}')+'\r\n').join('')+'--chain--\r\n';parseMhtml(chain,{sourceUrl:'https://example.test/',onFailure:value=>deep.push(value)});assert.ok(deep.some(value=>value.code==='MHTML_CID_DEPTH'));
});

test('source readiness waits boundedly for fonts and non-lazy images without DOM writes or scrolling',async()=>{
  let decoded=0;const document={fonts:{ready:Promise.resolve(),status:'loaded'},images:[{loading:'eager',complete:true,naturalWidth:10,async decode(){decoded++}},{loading:'lazy',complete:false,naturalWidth:0,decode(){throw Error('must not force lazy source images')}}]};
  const settle=vm.runInNewContext('('+waitForCaptureAssets.toString()+')',{document,setTimeout,clearTimeout});const ready=await settle({timeoutMs:20});assert.equal(decoded,1);assert.equal(ready.fontStatus,'loaded');assert.equal(ready.imageFailures,0);assert.equal(ready.timedOut,false);assert.equal(ready.warnings.length,0);
  document.fonts={ready:new Promise(()=>{}),status:'loading'};const timed=await settle({timeoutMs:1});assert.equal(timed.timedOut,true);assert.ok(timed.warnings.some(warning=>warning.includes('fonts')));
});

test('MHTML rejects unsafe or malformed resources and reports byte limits instead of silently losing parts',()=>{
  const archive=parts=>'Content-Type: multipart/related; boundary="b"\r\n\r\n'+parts.map(([url,mime,body])=>'--b\r\nContent-Location: '+url+'\r\nContent-Type: '+mime+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+body+'\r\n').join('')+'--b--\r\n',failures=[];
  const result=parseMhtml(archive([['https://example.test/a.css','TEXT/CSS; charset=utf-8',Buffer.from('body{}').toString('base64')],['https://user:secret@example.test/font.woff2','font/woff2','AA=='],['https://example.test/bad.png','image/png','!!!!'],['https://example.test/large.png','image/png',Buffer.alloc(20).toString('base64')]]),{maxResourceBytes:10,onFailure:value=>failures.push(value)});
  assert.equal(result.length,1);assert.equal(result[0].mimeType,'text/css');assert.equal(result[0].category,'stylesheet');assert.deepEqual(failures.map(failure=>failure.code),['UNSAFE_RESOURCE_URL','INVALID_RESOURCE_BYTES','RESOURCE_LIMIT']);
  const malformed=[];assert.deepEqual(parseMhtml('not a multipart snapshot',{onFailure:value=>malformed.push(value)}),[]);assert.equal(malformed[0].code,'INVALID_MHTML');
});

test('capture reuses cached MHTML styles images and fonts even when runtime URL hints are incomplete',async()=>{
  const parts=[['https://example.com/main.css','text/css','@font-face{src:url(font.woff2)}body{background:url(image.png)}'],['https://example.com/font.woff2','font/woff2','wOF2example'],['https://example.com/image.png','image/png','captured-image']];
  const mhtml='Content-Type: multipart/related; boundary="cache"\r\n\r\n'+parts.map(([url,mime,body])=>'--cache\r\nContent-Location: '+url+'\r\nContent-Type: '+mime+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from(body).toString('base64')+'\r\n').join('')+'--cache--\r\n';
  const {engine,calls}=fakeEngine(),runner=engine.runner;engine.runner=async(source,options)=>source.includes('Page.captureSnapshot')?(calls.push(source),{html:'<!doctype html><html></html>',resourceUrls:[],mhtml,warnings:[],width:900,height:700,title:'Cached',url:'https://example.com/',screenshot:'data:image/png;base64,AA==',responses:[]}):runner(source,options);
  const page=await engine.open({projectId:'p',url:'https://example.com'}),before=calls.length,result=await engine.capture({browserId:page.browserId,projectId:'p'});
  assert.equal(calls.length,before+1);assert.equal(result.resources.length,3);assert.deepEqual(result.failures,[]);assert.equal(result.captureDiagnostics.cachedResources,3);assert.equal(result.captureDiagnostics.provider,'ego-browser-cdp');assert.equal(result.captureDiagnostics.nativeElectronCapture,false);await engine.dispose();
});

test('permission denials inside optional snapshot capture stop immediately without DOM or fetch fallback',async()=>{
  const {engine,calls}=fakeEngine(),page=await engine.open({projectId:'p',url:'https://example.com'});await engine.capture({browserId:page.browserId,projectId:'p'});const source=calls.at(-1),AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  for(const code of ['FS_SANDBOX_DENIED','PERMISSION_DENIED','POLICY_DENIED','EGO_CONTROL_LOST']){
    const methods=[],error=Object.assign(new Error('denied'),{code}),owned={async cdp(method){methods.push(method);if(method==='Page.captureSnapshot')throw error;return {};},async evaluate(fn){if(fn.name==='waitForCaptureAssets')return {warnings:[]};throw new Error('DOM fallback must not run')}};
    await assert.rejects(new AsyncFunction('taskSpace','console',source)(async()=>({page:()=>owned}),{log(){}}),{code});assert.deepEqual(methods,['Emulation.setDeviceMetricsOverride','Page.captureSnapshot']);
  }
  await engine.dispose();
});

test('CSS dependency lexer handles escaped spaces quotes parentheses and strips fragment-only references',()=>{
  const css=String.raw`@import "nested\20 file.css";@font-face{src:url("\66 ont.woff2")} .x{background:url("hero (1).png#view")} .y{filter:url(#clip)}`;
  assert.deepEqual(cssResourceUrls(css,'https://example.com/styles/main.css'),['https://example.com/styles/nested%20file.css','https://example.com/styles/font.woff2','https://example.com/styles/hero%20(1).png']);
});

test('CSS dependency discovery handles imports and font/image URLs without credentials',()=>{
  assert.deepEqual(cssResourceUrls('@import "nested.css"; @import url(./more.css); @font-face{src:url(../font.woff2)} x{background:url("https://cdn.example/x.png")} y{background:url(data:image/png,abc)} z{background:url(https://u:p@example.com/secret)}','https://example.com/css/main.css'),['https://example.com/css/nested.css','https://example.com/css/more.css','https://example.com/font.woff2','https://cdn.example/x.png']);
});

test('CLI missing executable fails clearly without starting another browser',async()=>{
  await assert.rejects(createCliRunner({executable:'/nonexistent/dsh-test-ego-browser'})(''),{code:'BROWSER_CLI_UNAVAILABLE'});
});

test('sandbox runners can parse receipts and retain browser control errors',()=>{
  assert.deepEqual(parseCliOutput('noise\n'+BROWSER_RESULT_MARKER+JSON.stringify({ok:true,value:{title:'yes'}})+'\n'),{title:'yes'});
  let receipt;new Function('console',wrapCliScript("throw Object.assign(new Error('control changed'),{code:'EGO_CONTROL_LOST'})"))({log:value=>{receipt=value;}});
  assert.throws(()=>parseCliOutput(receipt),{code:'EGO_CONTROL_LOST'});
  assert.throws(()=>parseCliOutput('no marker',1),{code:'BROWSER_CLI_FAILED'});
  assert.throws(()=>parseCliOutput(BROWSER_RESULT_MARKER+JSON.stringify({ok:true,value:{}}),1),{code:'BROWSER_CLI_FAILED'});
});

test('resource timeouts return current HTML and explicit failures without retrying',async()=>{
  const {engine}=fakeEngine();const original=engine.runner;let resourceCalls=0;
  engine.runner=async source=>{
    if(source.includes('Page.captureSnapshot')) return {html:'<html>current state</html>',resourceUrls:['https://example.com/image.png'],mhtml:'',warnings:[],width:900,height:700,screenshot:'data:image/png;base64,AA==',responses:[]};
    if(source.includes('const requests =')) {resourceCalls++;throw Object.assign(new Error('bounded timeout'),{code:'BROWSER_TIMEOUT'});}
    return original(source);
  };
  const {browserId}=await engine.open({projectId:'p',url:'https://example.com'});const capture=await engine.capture({browserId,projectId:'p'});
  assert.equal(capture.html,'<html>current state</html>');assert.equal(resourceCalls,1);assert.equal(capture.failures[0].url,'https://example.com/image.png');assert.match(capture.failures[0].reason,/timeout/);assert.deepEqual(capture.resources,[]);await engine.dispose();
});

test('region screenshots validate project scope and bounded document CSS pixel clips',async()=>{
  const {engine,calls}=fakeEngine();const {browserId}=await engine.open({projectId:'p',url:'https://example.com'});const before=calls.length;
  await assert.rejects(engine.capture({projectId:'other',browserId,clip:{x:0,y:0,width:100,height:100}}),{code:'BROWSER_PROJECT_SCOPE'});await assert.rejects(engine.capture({projectId:'p',browserId,clip:{x:-1,y:0,width:100,height:100}}),{code:'INVALID_REGION'});assert.equal(calls.length,before);
  await engine.capture({projectId:'p',browserId,clip:{x:20,y:400,width:300,height:200}});assert.ok(calls.at(-1).includes('"captureBeyondViewport":true'));assert.ok(calls.at(-1).includes('"clip":{"x":20,"y":400,"width":300,"height":200,"scale":1}'));await engine.dispose();
});

// Opt-in integration uses the installed ego-browser Chromium and its existing profile.
// It creates ONE task space, serves only an in-memory loopback fixture, then finishes it.
test('real Chromium interaction captures CSS/image/font bytes and static current DOM',{skip:process.env.DSH_BROWSER_LIVE !== '1',timeout:120000},async()=>{
  const response=await fetch('https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf',{signal:AbortSignal.timeout(15000)});assert.ok(response.ok);const font=Buffer.from(await response.arrayBuffer());
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHZkAAAAASUVORK5CYII=','base64');
  const server=createServer((req,res)=>{
    const routes={'/':['text/html',`<!doctype html><html><head><title>Capture fixture</title><base href="/"><link rel="stylesheet" href="/styles/main.css"></head><body onload="window.loaded=true"><h1>Browser engine fixture</h1><input id="state" value="before"><input id="password" type="password" value="secret"><button id="button" onclick="document.querySelector('#state').value='clicked'">Apply</button><img loading="lazy" src="/pixel.png"><canvas width="20" height="20"></canvas><a href="java&#10;script:alert(1)">unsafe</a><script>const c=document.querySelector('canvas').getContext('2d');c.fillStyle='red';c.fillRect(0,0,20,20);</script></body></html>`],'/styles/main.css':['text/css','@import "./nested.css"; body {font-family:Fixture;font-size:22px;background:#eee;} h1::before {content:"★ ";color:red}'],'/styles/nested.css':['text/css','@font-face{font-family:Fixture;src:url("../font.ttf") format("truetype")} h1{background-image:url("../pixel.png")}'],'/font.ttf':['font/ttf',font],'/pixel.png':['image/png',png]};
    const found=routes[req.url];if(!found){res.writeHead(404);res.end('missing');return;}res.writeHead(200,{'content-type':found[0]});res.end(found[1]);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const engine=new BrowserEngine();
  try {
    const page=await engine.open({projectId:'fixture',url:`http://127.0.0.1:${server.address().port}/`,width:960,height:720});
    await engine.action({browserId:page.browserId,projectId:'fixture',type:'click',selector:'#button'});
    await engine.action({browserId:page.browserId,projectId:'fixture',type:'type',selector:'#state',text:'edited current state'});
    const capture=await engine.capture({browserId:page.browserId,projectId:'fixture'});
    assert.equal(capture.width,960);assert.equal(capture.height,720);assert.ok(capture.html.includes('edited current state'));assert.ok(!/<script[\s>]|<canvas[\s>]|<base[\s>]|onclick=|onload=|javascript:|value="secret"/i.test(capture.html));assert.ok(capture.html.includes('data:image/png;base64,'));assert.ok(capture.html.includes('@font-face'));assert.ok(capture.html.includes('::before'));
    assert.ok(capture.resources.some(r=>r.url.endsWith('/font.ttf')&&Buffer.from(r.bytesBase64,'base64').equals(font)));assert.ok(capture.resources.some(r=>r.url.endsWith('/pixel.png')&&Buffer.from(r.bytesBase64,'base64').equals(png)));assert.ok(capture.resources.some(r=>r.url.endsWith('/styles/nested.css')));assert.deepEqual(capture.failures,[]);
    await engine.action({browserId:page.browserId,projectId:'fixture',type:'resize',width:800,height:600});
    const example=await engine.action({browserId:page.browserId,projectId:'fixture',type:'navigate',url:'https://example.com'});assert.equal(example.title,'Example Domain');assert.equal(example.width,800);assert.equal(example.height,600);
  } finally { await engine.dispose();await new Promise(resolve=>server.close(resolve)); }
});
