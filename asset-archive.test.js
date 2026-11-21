import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
import { constants } from 'node:fs';
import { buildAssetBundle, collectRemoteResources, writeAssetFiles } from './asset-archive.js';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const b64 = bytes => Buffer.from(bytes).toString('base64');
const text = file => Buffer.from(file.bytesBase64,'base64').toString();
const source = {kind:'website',url:'https://example.test/page',title:'Example',width:1440,height:900};
const font = Buffer.concat([Buffer.from('wOF2'),Buffer.from([0,1,2,255,128,0])]);
const png = Buffer.from([137,80,78,71,13,10,26,10,0,255,128]);
const resource = (url,mimeType,bytes,extra = {}) => ({url,mimeType,bytesBase64:b64(bytes),...extra});
const input = extra => ({importId:'i-test',source,resources:[],...extra});

test('seven MiB captured TrueType data survives canonical base64 validation and full archive hashing',async()=>{
  const bytes=Buffer.alloc(7*1024*1024,37);bytes.writeUInt32BE(0x00010000);let fetches=0;const captured=resource('https://example.test/fonts/japanese.ttf','font/ttf',bytes);
  const collected=await collectRemoteResources([captured],{sourceUrl:source.url,maxBytes:64*1024*1024,fetch:async()=>{fetches++;throw Error('captured font must not be fetched')}});assert.equal(fetches,0);assert.deepEqual(collected.failures,[]);assert.equal(collected.resources.length,1);
  const bundle=buildAssetBundle(input({resources:collected.resources}));assert.equal(bundle.record.integrity,'complete');assert.equal(bundle.record.resourceSummary.fonts.bytes,bytes.length);verifyFiles(bundle);assert.deepEqual(Buffer.from(bundle.files.find(file=>file.mimeType==='font/ttf').bytesBase64,'base64'),bytes);
  const invalid=await collectRemoteResources([{...captured,bytesBase64:'='+captured.bytesBase64.slice(1)}]);assert.equal(invalid.resources.length,0);assert.equal(invalid.failures[0].code,'INVALID_BASE64');
});

test('static SVG export declarations and editor metadata sanitize without relaxing active or external reference guards',()=>{
  const svg='<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:version="1.0" viewBox="0 0 468 144"><metadata><editor-data href="https://editor.example/info"/></metadata><defs><linearGradient id="paint"><stop style="stop-color:#115DA6" offset="0"/></linearGradient><style>.logo{fill:url(#paint)}</style></defs><path class="logo" d="M5.129,136.483v-18.872h2.744v18.872H5.129z"/></svg>';
  const bundle=buildAssetBundle(input({html:'<img src="https://example.test/logo.svg">',resources:[resource('https://example.test/logo.svg','image/svg+xml',svg)]}));assert.equal(bundle.record.integrity,'complete');const saved=text(bundle.files.find(file=>file.mimeType==='image/svg+xml'));assert.ok(!/doctype|metadata|inkscape|editor-data/i.test(saved));assert.ok(saved.includes('stop-color:#115DA6'));assert.ok(saved.includes('url(#paint)'));assert.ok(saved.includes('viewBox="0 0 468 144"'));verifyFiles(bundle);
  for(const dangerous of ['<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///private/secret">]><svg/>','<svg><script>alert(1)</script></svg>','<svg onload="alert(1)"/>','<svg><image href="https://external.example/image.png"/></svg>','<svg><style>@import "https://external.example/style.css";</style></svg>','<svg><path style="fill:url(https://external.example/a.svg#paint)"/></svg>','<svg><use href="javascript:alert(1)"/></svg>']){const rejected=buildAssetBundle(input({resources:[resource('https://example.test/unsafe.svg','image/svg+xml',dangerous)]}));assert.equal(rejected.record.integrity,'incomplete');assert.ok(rejected.manifest.failures.some(failure=>failure.code==='ACTIVE_RESOURCE'));assert.equal(rejected.manifest.resources.length,0);}
});

test('SVG generator comments before the standard DTD retain static logo styles and never hide active markup',()=>{
  const xml='<?xml version="1.0" encoding="utf-8"?>\n',comment='<!-- Generator: Adobe Illustrator 19.1.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n',dtd='<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';
  for(const viewBox of ['0 0 450 175','-160 63.2 127.9 49.8']){const svg=xml+comment+'<!-- Additional inert export note -->\n'+dtd+'<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+viewBox+'"><style>.st0{display:none}.st1{fill:url(#paint)}</style><defs><linearGradient id="paint"><stop offset="0" style="stop-color:#11A14E"/></linearGradient></defs><path class="st1" d="M0 0h10v10z"/></svg>',bundle=buildAssetBundle(input({resources:[resource('https://example.test/logo.svg','image/svg+xml',svg)]}));assert.equal(bundle.record.integrity,'complete');const saved=text(bundle.files.find(file=>file.mimeType==='image/svg+xml'));assert.ok(!/doctype|Generator:|Additional inert/.test(saved));assert.ok(saved.includes('viewBox="'+viewBox+'"'));assert.ok(saved.includes('.st0{display:none}'));assert.ok(saved.includes('fill:url(#paint)'));verifyFiles(bundle);}
  for(const unsafe of ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///private/secret">]><svg/>','<?xml-stylesheet type="text/css" href="https://external.example/style.css"?><svg/>','<svg><script>alert(1)</script></svg>','<svg><style>@import "https://external.example/style.css";</style></svg>','<!-- malformed -- comment --><svg/>']){const bundle=buildAssetBundle(input({resources:[resource('https://example.test/unsafe.svg','image/svg+xml',xml+comment+unsafe)]}));assert.equal(bundle.record.integrity,'incomplete');assert.ok(bundle.manifest.failures.some(failure=>failure.code==='ACTIVE_RESOURCE'));assert.equal(bundle.manifest.resources.length,0);}
});

test('design context retains complete long strings within the metadata byte limit',()=>{
  const context='图层上下文'.repeat(30000);const bundle=buildAssetBundle(input({source:{...source,kind:'figma'},context}));
  const file=bundle.files.find(f=>f.path===bundle.record.contextPath);assert.equal(JSON.parse(text(file)),context);
});

function verifyFiles(bundle) {
  for (const file of bundle.files) {
    const bytes = Buffer.from(file.bytesBase64,'base64');
    assert.equal(file.sha256,hash(bytes));
    if (file.path.startsWith('assets/')) assert.ok(path.posix.basename(file.path).startsWith(`${file.sha256}-`));
  }
  for (const entry of bundle.manifest.resources) {
    const file = bundle.files.find(f => f.path === entry.path);
    assert.equal(entry.sha256,file.sha256);
    assert.equal(entry.byteLength,Buffer.from(file.bytesBase64,'base64').length);
  }
}

test('archives actual font bytes, rewrites nested CSS and uses each file directory as its base', () => {
  const bundle = buildAssetBundle(input({html:'<!doctype html><html><head><link rel="stylesheet" href="https://example.test/css/root.css"></head><body style="background:url(https://example.test/image.png)"><img src="https://example.test/image.png" srcset="https://example.test/image.png 1x, https://example.test/image-2.png 2x" poster="https://example.test/image.png"></body></html>',resources:[
    resource('https://example.test/css/root.css','text/css','@import "nested/face.css" screen; .hero{background:url(../image.png#crop)}'),
    resource('https://example.test/css/nested/face.css','text/css','@font-face{font-family:Example;src:url("../../font.woff2") format("woff2")}'),
    resource('https://example.test/font.woff2','font/woff2',font),
    resource('https://example.test/image.png','image/png',png),
    resource('https://example.test/image-2.png','image/png',Buffer.concat([png,Buffer.from([2])]))
  ]}));
  assert.equal(bundle.record.integrity,'complete');
  assert.equal(bundle.record.resourceCount,5);
  const get = ending => bundle.manifest.resources.find(r => r.url.endsWith(ending));
  const face = get('/css/nested/face.css'), root = get('/css/root.css'), f = get('/font.woff2'), image = get('/image.png');
  assert.deepEqual(Buffer.from(bundle.files.find(x => x.path === f.path).bytesBase64,'base64'),font);
  assert.match(text(bundle.files.find(x => x.path === face.path)),new RegExp(`\\.\\./fonts/${path.posix.basename(f.path)}`));
  assert.ok(text(bundle.files.find(x => x.path === root.path)).includes(`url("${path.posix.basename(face.path)}") screen`));
  assert.ok(text(bundle.files.find(x => x.path === root.path)).includes(`../images/${path.posix.basename(image.path)}#crop`));
  assert.ok(bundle.html.includes(`href="../${root.path}"`));
  assert.ok(bundle.html.includes(`src="../${image.path}"`));
  assert.ok(bundle.html.includes(`poster="../${image.path}"`));
  assert.ok(bundle.html.includes(`../${image.path} 1x, ../assets/i-test/images/`));
  assert.equal(bundle.record.manifestPath,'imports/i-test/manifest.json');
  assert.ok(!JSON.stringify(bundle.record).includes('bytesBase64'));
  verifyFiles(bundle);
});

test('browser engine singular categories and font MIME aliases normalize to archive directories', async () => {
  const resources = [
    resource('https://example.test/image.png','image/png',png,{category:'image'}),
    resource('https://example.test/font','application/octet-stream',font,{category:'font'}),
    resource('https://example.test/alias.woff2','application/font-woff2',font,{category:'other'}),
    resource('https://example.test/style.css','text/css','body{}',{category:'stylesheet'})
  ];
  const captured = await collectRemoteResources(resources,{fetch:async () => { throw Error('captured bytes should be reused'); }});
  assert.equal(captured.failures.length,0);
  assert.equal(captured.resources.length,4);
  const bundle = buildAssetBundle(input(captured));
  assert.equal(bundle.record.integrity,'complete');
  for (const asset of bundle.manifest.resources) {
    assert.ok(asset.path.includes(`/${asset.category}/`));
    if (asset.mimeType === 'font/woff2') { assert.equal(asset.category,'fonts'); assert.ok(asset.path.endsWith('.woff2')); }
  }
});

test('retains data URIs and local fragments across CSS, HTML and srcset', () => {
  const data = 'data:image/png;base64,iVBORw0KGgo=';
  const bundle = buildAssetBundle(input({html:`<div style='filter:url(#blur);background:url(${data})'><img src="${data}" srcset="${data} 1x, https://example.test/image.png 2x"><svg><use href="#shape"></use></svg></div>`,resources:[resource('https://example.test/image.png','image/png',png)]}));
  assert.equal(bundle.record.integrity,'complete');
  assert.ok(bundle.html.includes('url(&quot;#blur&quot;)'));
  assert.ok(bundle.html.includes(`src="${data}"`));
  assert.ok(bundle.html.includes(`${data} 1x, ../assets/`));
  assert.ok(bundle.html.includes('href="#shape"'));
});

test('untrusted HTML loses scripts, event handlers, executable URLs, nested frames and meta refresh', () => {
  const bundle = buildAssetBundle(input({html:'<html><head><base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><script>alert(1)</script></head><body onload=alert(1)><img src="https://example.test/image.png" ONERROR="alert(1)"><a href="jav&#x61;script&#58;alert(1)" onclick=alert(1)>click</a><iframe srcdoc="<script>bad</script>"></iframe><svg><foreignObject><script>bad</script></foreignObject><animate attributeName="href" values="javascript:bad"></animate></svg><form action="https://evil.test"><input formaction="javascript:bad"></form></body></html>',resources:[resource('https://example.test/image.png','image/png',png)]}));
  assert.doesNotMatch(bundle.html,/<script|onload|onerror|onclick|javascript|<iframe|srcdoc|<base|http-equiv|foreignobject|<animate|formaction| action=/i);
  assert.ok(bundle.html.includes('>click</a>'));
});

test('active SVG assets become explicit failures while static SVG images are retained', () => {
  const bundle = buildAssetBundle(input({resources:[
    resource('https://example.test/icon.svg','image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
    resource('https://example.test/active.svg','image/svg+xml','<svg onload="alert(1)"><script>alert(1)</script></svg>')
  ]}));
  assert.equal(bundle.record.integrity,'incomplete');
  assert.equal(bundle.manifest.resources.length,1);
  assert.equal(bundle.manifest.failures[0].code,'ACTIVE_RESOURCE');
});

test('missing and corrupt fonts are recorded and completeness never silently succeeds', () => {
  const bundle = buildAssetBundle(input({html:'<link rel="stylesheet" href="https://example.test/style.css">',resources:[
    resource('https://example.test/style.css','text/css','@font-face{src:url(missing.woff2)} .bad{background:url(bad.woff2)}'),
    resource('https://example.test/bad.woff2','font/woff2','<html>unauthorized</html>')
  ],failures:[{url:'https://example.test/missing.woff2',code:'HTTP_403',message:'Forbidden'}]}));
  assert.equal(bundle.record.integrity,'incomplete');
  assert.ok(bundle.manifest.failures.some(f => f.code === 'HTTP_403'));
  assert.ok(bundle.manifest.failures.some(f => f.code === 'MIME_MISMATCH'));
  assert.ok(bundle.manifest.failures.some(f => f.code === 'MISSING_RESOURCE'));
  assert.equal(bundle.record.failedCount,bundle.manifest.failures.length);
  assert.ok(text(bundle.files.find(f => f.mimeType === 'text/css')).includes('about:blank#asset-unavailable'));
});

test('checks supplied original hash and byte count and detects conflicting URL bytes', () => {
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font,{sha256:'0'.repeat(64)}),resource('https://example.test/image.png','image/png',png,{byteLength:1})]}));
  assert.equal(bundle.manifest.resources.length,0);
  assert.equal(bundle.manifest.failures.length,2);
  assert.ok(bundle.manifest.failures.every(f => f.code === 'INTEGRITY_MISMATCH'));
  const duplicate = buildAssetBundle(input({resources:[resource('https://example.test/image.png','image/png',png),resource('https://example.test/image.png','image/png',Buffer.concat([png,Buffer.from([1])]))]}));
  assert.equal(duplicate.record.integrity,'incomplete');
  assert.ok(duplicate.manifest.failures.some(f => f.code === 'DUPLICATE_URL'));
});

test('CSS cycles are deterministic, explicit failures with valid final content addressed hashes', () => {
  const resources = [resource('https://example.test/a.css','text/css','@import "b.css";'),resource('https://example.test/b.css','text/css','@import url(a.css);')];
  const a = buildAssetBundle(input({resources}));
  const b = buildAssetBundle(input({resources:[...resources].reverse()}));
  assert.deepEqual(a,b);
  assert.equal(a.record.integrity,'incomplete');
  assert.ok(a.manifest.failures.some(f => f.code === 'CSS_DEPENDENCY_CYCLE'));
  verifyFiles(a);
});

test('source kinds share archive layout, metadata credentials are stripped and PNG preview remains binary', () => {
  for (const kind of ['website','figma','mastergo']) {
    const bundle = buildAssetBundle(input({source:{...source,kind,url:'https://example.test/file?token=secret&node=2',headers:{Authorization:'Bearer secret'},accessToken:'secret'},context:{nodes:[{name:'Button',token:'secret'}],cookie:'secret',nested:{apiKey:'secret',url:'https://example.test/?signature=secret&id=1'}},preview:{bytesBase64:b64(png)}}));
    assert.equal(bundle.record.kind,kind);
    assert.equal(bundle.record.previewPath,'imports/i-test/preview.png');
    assert.deepEqual(bundle.manifest.preview,{path:bundle.record.previewPath,mimeType:'image/png',sha256:hash(png),byteLength:png.length});
    assert.deepEqual(Buffer.from(bundle.files.find(f => f.path.endsWith('preview.png')).bytesBase64,'base64'),png);
    const metadata = bundle.files.filter(f => f.mimeType === 'application/json').map(text).join('');
    assert.doesNotMatch(metadata,/secret|Authorization|accessToken|apiKey|cookie|signature/);
    assert.ok(metadata.includes('Button'));
    verifyFiles(bundle);
  }
  assert.throws(() => buildAssetBundle(input({importId:'i-../outside'})),{code:'INVALID_ID'});
  assert.throws(() => buildAssetBundle(input({source:{kind:'unknown'}})),{code:'INVALID_SOURCE'});
});

test('preview formats are identified from actual bytes and are accepted by binary writer layout', async () => {
  const formats = [
    {mimeType:'image/png',ext:'png',bytes:png},
    {mimeType:'image/jpeg',ext:'jpg',bytes:Buffer.from([255,216,255,224,1,2,3])},
    {mimeType:'image/gif',ext:'gif',bytes:Buffer.from('GIF89a012345')},
    {mimeType:'image/webp',ext:'webp',bytes:Buffer.from('RIFF0123WEBP0123')}
  ];
  for (const format of formats) {
    const bundle = buildAssetBundle(input({preview:{bytesBase64:b64(format.bytes),mimeType:'image/png'}}));
    assert.equal(bundle.record.integrity,'complete');
    assert.deepEqual(bundle.manifest.preview,{path:`imports/i-test/preview.${format.ext}`,mimeType:format.mimeType,sha256:hash(format.bytes),byteLength:format.bytes.length});
    const h = shellHarness();
    await writeAssetFiles({...h,projectId:'p-test',files:bundle.files});
    assert.deepEqual(h.memory.entries.get(`/library/projects/p-test/${bundle.record.previewPath}`).bytes,format.bytes);
  }
});

test('metadata documents fail explicitly before exceeding the store 4 MB read cap', () => {
  const largeContext = Array.from({length:50},() => ({text:'a'.repeat(90000)}));
  assert.throws(() => buildAssetBundle(input({context:largeContext})),{code:'METADATA_TOO_LARGE'});
  assert.throws(() => buildAssetBundle(input({source:{...source,extra:largeContext}})),{code:'METADATA_TOO_LARGE'});
});

function fakeFetch(routes, calls = []) {
  return async (url,options) => {
    calls.push({url,options});
    const value = routes[url];
    if (!value) return new Response('missing',{status:404});
    if (value instanceof Response) return value;
    return new Response(value.bytes,{status:value.status || 200,headers:{'content-type':value.mimeType,...value.headers}});
  };
}

test('same-origin captured blob image and font bytes archive locally without any server blob fetch',async()=>{
  const imageURL='blob:https://example.test/image-object',fontURL='blob:https://example.test/font-object',seeds=[resource(imageURL,'image/png',png),resource(fontURL,'font/woff2',font)];let calls=0;
  const collected=await collectRemoteResources(seeds,{sourceUrl:source.url,fetch:async()=>{calls++;throw Error('blob bytes must never be fetched by the server')}});assert.equal(calls,0);assert.equal(collected.resources.length,2);assert.deepEqual(collected.failures,[]);
  const bundle=buildAssetBundle(input({html:'<!doctype html><html><head><style>@font-face{font-family:Captured;src:url("'+fontURL+'")}</style></head><body><img src="'+imageURL+'"></body></html>',resources:collected.resources}));
  assert.equal(bundle.record.integrity,'complete');assert.ok(!bundle.html.includes('blob:'));assert.equal(bundle.record.resourceSummary.images.count,1);assert.equal(bundle.record.resourceSummary.fonts.count,1);verifyFiles(bundle);
  for(const seeds of [[resource('blob:https://other.test/object','image/png',png)],['blob:https://example.test/not-captured'],[resource('file:///private/image.png','image/png',png)]]){const denied=await collectRemoteResources(seeds,{sourceUrl:source.url,fetch:async()=>{calls++;throw Error('unsafe URL must not be fetched')}});assert.equal(denied.resources.length,0);assert.ok(denied.failures.some(failure=>failure.code==='UNSAFE_URL'));}
  const ownerless=await collectRemoteResources([resource(imageURL,'image/png',png)],{fetch:async()=>{calls++;throw Error('must not fetch')}});assert.equal(ownerless.resources.length,0);assert.equal(calls,0);
});

test('large source HTML fails with an explicit bounded archive diagnosis before publication',()=>{
  assert.throws(()=>buildAssetBundle(input({html:'x'.repeat(4_000_001)})),error=>error.code==='SOURCE_HTML_TOO_LARGE'&&error.details.maxBytes===4_000_000&&error.details.actualBytes===4_000_001);
});

test('resource summary counts only successfully published local assets and deduplicates identical paths',()=>{
  const bundle=buildAssetBundle(input({resources:[resource('https://example.test/image.png?v=1','image/png',png),resource('https://example.test/image.png?v=2','image/png',png),resource('https://example.test/font.woff2','font/woff2',font),resource('https://example.test/bad.woff2','font/woff2','not font bytes')]}));
  assert.deepEqual(bundle.manifest.resourceSummary.images,{count:1,bytes:png.length});assert.deepEqual(bundle.record.resourceSummary.fonts,{count:1,bytes:font.length});assert.equal(bundle.record.resourceSummary.total.count,2);assert.equal(bundle.record.resourceSummary.total.bytes,png.length+font.length);assert.equal(bundle.record.resourceSummary.failedCount,1);assert.equal(bundle.record.integrity,'incomplete');
});

test('bounded parallel collector starts independent downloads together and retains deterministic seed order',{timeout:2000},async()=>{
  let entered,active=0,peak=0;const started=new Promise(resolve=>{entered=resolve}),releases=[];
  const fetch=async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');active++;peak=Math.max(peak,active);if(active===2)entered();await new Promise(resolve=>releases.push(resolve));active--;return new Response(url.endsWith('a.css')?'a{}':'b{}',{headers:{'content-type':'text/css'}});};
  const collecting=collectRemoteResources(['https://example.test/a.css','https://example.test/b.css'],{fetch,concurrency:2});await started;assert.equal(peak,2);releases[1]();releases[0]();const result=await collecting;assert.deepEqual(result.failures,[]);assert.deepEqual(result.resources.map(resource=>resource.url),['https://example.test/a.css','https://example.test/b.css']);
});

test('parallel collector shares one byte budget and does not start later requests after it is exhausted',async()=>{
  const calls=[],result=await collectRemoteResources(['https://example.test/a.css','https://example.test/b.css','https://example.test/c.css'],{concurrency:2,maxBytes:15,fetch:async url=>{calls.push(url);return new Response('0123456789',{headers:{'content-type':'text/css'}});}});
  assert.equal(calls.length,2);assert.ok(result.resources.reduce((sum,resource)=>sum+resource.byteLength,0)<=15);assert.ok(result.failures.some(failure=>failure.code==='BYTE_LIMIT'));assert.ok(!calls.some(url=>url.endsWith('/c.css')));
  await assert.rejects(collectRemoteResources([],{concurrency:0}),{code:'INVALID_LIMIT'});await assert.rejects(collectRemoteResources([],{concurrency:9}),{code:'INVALID_LIMIT'});
});

test('collector downloads nested CSS fonts and images without credentials or caller headers', async () => {
  const calls = [];
  const result = await collectRemoteResources([{url:'https://example.test/root.css',headers:{Authorization:'must-not-be-sent'}}],{fetch:fakeFetch({
    'https://example.test/root.css':{mimeType:'text/css',bytes:'@import "nested/face.css";body{background:url(https://cdn.test/image.png)}'},
    'https://example.test/nested/face.css':{mimeType:'text/css',bytes:'@font-face{src:url(../font.woff2)}'},
    'https://example.test/font.woff2':{mimeType:'font/woff2',bytes:font},
    'https://cdn.test/image.png':{mimeType:'image/png',bytes:png}
  },calls)});
  assert.equal(result.failures.length,0);
  assert.equal(result.resources.length,4);
  for (const {options} of calls) { assert.equal(options.credentials,'omit'); assert.equal(options.redirect,'manual'); assert.equal(options.referrerPolicy,'no-referrer'); assert.equal(options.headers.Authorization,undefined); }
  const bundle = buildAssetBundle(input({...result,html:'<link href="https://example.test/root.css" rel="stylesheet">'}));
  assert.equal(bundle.record.integrity,'complete'); verifyFiles(bundle);
});

test('collector resolves CSS against redirect destination and builder preserves that base', async () => {
  const result = await collectRemoteResources(['https://example.test/root.css'],{fetch:fakeFetch({
    'https://example.test/root.css':new Response('',{status:302,headers:{location:'https://cdn.test/nested/root.css'}}),
    'https://cdn.test/nested/root.css':{mimeType:'text/css',bytes:'@font-face{src:url(../font.woff2)}'},
    'https://cdn.test/font.woff2':{mimeType:'font/woff2',bytes:font}
  })});
  assert.equal(result.failures.length,0);
  assert.equal(result.resources[0].finalUrl,'https://cdn.test/nested/root.css');
  const bundle = buildAssetBundle(input({...result}));
  assert.equal(bundle.record.integrity,'complete');
  assert.ok(text(bundle.files.find(f => f.mimeType === 'text/css')).includes('../fonts/'));
});

test('collector blocks private seeds, CSS and redirects but permits explicitly selected localhost source', async () => {
  const calls = [];
  const result = await collectRemoteResources(['https://example.test/root.css'],{fetch:fakeFetch({
    'https://example.test/root.css':{mimeType:'text/css',bytes:'@import "http://127.0.0.1:53998/private.css"; .a{background:url(http://169.254.169.254/meta)} @import "https://example.test/redirect.css";'},
    'https://example.test/redirect.css':new Response('',{status:302,headers:{location:'http://localhost:53998/private.css'}})
  },calls)});
  assert.equal(result.failures.filter(f => f.code === 'PRIVATE_NETWORK_BLOCKED').length,3);
  assert.ok(calls.every(c => new URL(c.url).protocol === 'https:'));
  const blockedSeed = await collectRemoteResources(['http://127.0.0.1:53998/internal'],{fetch:async () => { throw Error('must not access unselected private source'); }});
  assert.equal(blockedSeed.failures[0].code,'PRIVATE_NETWORK_BLOCKED');
  const local = await collectRemoteResources(['http://localhost:8000/root.css'],{sourceUrl:'http://localhost:8000/user-selected-page',fetch:fakeFetch({
    'http://localhost:8000/root.css':{mimeType:'text/css',bytes:'@font-face{src:url(font.woff2)}'},
    'http://localhost:8000/font.woff2':{mimeType:'font/woff2',bytes:font}
  })});
  assert.equal(local.resources.length,2);
  assert.equal(local.failures.length,0);
});

test('collector bounds counts and streamed bytes, records HTTP failures, and rejects unsafe protocols', async () => {
  const count = await collectRemoteResources(['https://example.test/a.png','https://example.test/b.png'],{maxFiles:1,fetch:fakeFetch({'https://example.test/a.png':{mimeType:'image/png',bytes:png}})});
  assert.ok(count.failures.some(f => f.code === 'FILE_LIMIT'));
  const limit = await collectRemoteResources(['https://example.test/a.png','file:///tmp/a','https://example.test/missing'],{maxBytes:2,fetch:fakeFetch({'https://example.test/a.png':{mimeType:'image/png',bytes:png}})});
  assert.ok(limit.failures.some(f => f.code === 'BYTE_LIMIT'));
  assert.ok(limit.failures.some(f => f.code === 'UNSAFE_URL'));
  const http = await collectRemoteResources(['https://example.test/missing'],{fetch:fakeFetch({})});
  assert.ok(http.failures.some(f => f.code === 'HTTP_404'));
  assert.equal(limit.resources.length,0);
});

test('failed requests consume count and invalid bytes consume byte budgets before the next serial request', async () => {
  const countCalls = [];
  const count = await collectRemoteResources(['https://example.test/failed','https://example.test/not-requested'],{concurrency:1,maxFiles:1,fetch:fakeFetch({},countCalls)});
  assert.equal(countCalls.length,1);
  assert.deepEqual(count.failures.map(f => f.code),['HTTP_404','FILE_LIMIT']);
  const byteCalls = [];
  const bytes = await collectRemoteResources(['https://example.test/bad.woff2','https://example.test/not-requested'],{concurrency:1,maxBytes:10,fetch:fakeFetch({'https://example.test/bad.woff2':{mimeType:'font/woff2',bytes:Buffer.alloc(10)}},byteCalls)});
  assert.equal(byteCalls.length,1);
  assert.deepEqual(bytes.failures.map(f => f.code),['MIME_MISMATCH','BYTE_LIMIT']);
});

test('collector has an overall deadline even when a fetch implementation ignores AbortSignal', async () => {
  const result = await collectRemoteResources(['https://example.test/a.css'],{timeoutMs:15,fetch:async () => new Promise(() => {})});
  assert.equal(result.failures[0].code,'DOWNLOAD_TIMEOUT');
});

test('collector propagates caller cancellation and supports captured bytes without fetching again', async () => {
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(collectRemoteResources(['https://example.test/a.css'],{signal:controller.signal}),/cancelled/);
  const result = await collectRemoteResources([resource('https://example.test/font.woff2','font/woff2',font)],{fetch:async () => { throw Error('must not fetch'); }});
  assert.equal(result.resources.length,1); assert.equal(result.failures.length,0);
});

// Execute the fixed child script with an in-memory filesystem. No Host writes or real shell.
class MemoryBinaryFS {
  constructor() { this.entries = new Map([['/',{type:'directory'}],['/library',{type:'directory'}],['/library/projects',{type:'directory'}],['/library/projects/p-test',{type:'directory'}]]); this.opens = []; }
  err(code) { return Object.assign(Error(code),{code}); }
  async lstat(p) { const e = this.entries.get(p); if (!e) throw this.err('ENOENT'); return {isSymbolicLink:() => e.type === 'symlink',isFile:() => e.type === 'file',isDirectory:() => e.type === 'directory',size:e.bytes?.length || 0}; }
  async realpath(p) { const parts = p.split('/').filter(Boolean); let current = ''; for (const part of parts) { current += `/${part}`; const e = this.entries.get(current); if (!e) throw this.err('ENOENT'); if (e.type === 'symlink') return `${e.target}${p.slice(current.length)}`; } return p; }
  async mkdir(p,options) { if (this.entries.has(p)) { if (options?.recursive) return; throw this.err('EEXIST'); } if (!this.entries.has(path.posix.dirname(p))) { if (options?.recursive) await this.mkdir(path.posix.dirname(p),options); else throw this.err('ENOENT'); } this.entries.set(p,{type:'directory'}); }
  async open(p,flags) {
    this.opens.push({p,flags});
    const existing = this.entries.get(p);
    if (existing && flags & constants.O_EXCL) throw this.err('EEXIST');
    if (existing?.type === 'symlink' && flags & constants.O_NOFOLLOW) throw this.err('ELOOP');
    if (!existing && !(flags & constants.O_CREAT)) throw this.err('ENOENT');
    if (!existing) this.entries.set(p,{type:'file',bytes:Buffer.alloc(0)});
    const e = this.entries.get(p);
    return {writeFile:async bytes => { e.bytes = Buffer.from(bytes); },readFile:async () => Buffer.from(e.bytes),sync:async () => {},close:async () => {}};
  }
}
function shellHarness(memory = new MemoryBinaryFS()) {
  const requests = []; const policy = {mode:'workspace-write',workspaceRoot:'/library',sessionId:'session-test'}; const writes = [];
  const store = {target:async relative => ({displayPath:path.posix.join('/library',relative),targetKey:`opaque:${relative}`}),write:async (...args) => { writes.push(args); }};
  const fs = {processPath:t => t.displayPath,contains:(a,b) => b.displayPath === a.displayPath || b.displayPath.startsWith(`${a.displayPath}/`)};
  const shell = {
    resolve(request) { requests.push(request); return {...request,resolved:true}; },
    async execute(spec) {
      assert.equal(spec.resolved,true);
      const result = new Promise(resolve => {
        let out = '', err = ''; let settled = false;
        const finish = exitCode => { if (!settled) { settled = true; resolve({exitCode,timedOut:false,aborted:false,stdout:{text:out,truncated:false},stderr:{text:err,truncated:false}}); } };
        const stdin = new EventEmitter(); stdin.setEncoding = () => {};
        const processMock = {stdin,stdout:{write:s => { out += s; finish(0); }},stderr:{write:s => { err += s; }},exit:finish,set exitCode(n) { finish(n); }};
        const prefix = "node -e '"; assert.ok(spec.command.startsWith(prefix) && spec.command.endsWith("'"));
        const script = spec.command.slice(prefix.length,-1).replace(/'\\''/g,"'");
        vm.runInNewContext(script,{Buffer,process:processMock,require:name => ({'node:fs/promises':memory,'node:path':path,'node:crypto':crypto,'node:fs':{constants}})[name]});
        stdin.emit('data',spec.stdin); stdin.emit('end');
      });
      return {result:async () => result};
    }
  };
  return {store,fs,shell,policy,requests,writes,memory};
}

test('writer uses exact shell resolve/execute contract, fixed command, JSON stdin and current policy object', async () => {
  const h = shellHarness();
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  const result = await writeAssetFiles({...h,projectId:'p-test',files:bundle.files});
  const archived = bundle.files.find(f => f.mimeType === 'font/woff2');
  assert.deepEqual(h.memory.entries.get(`/library/projects/p-test/${archived.path}`).bytes,font);
  assert.equal(h.requests[0].sandboxPolicy,h.policy);
  assert.equal(h.requests[0].onExpiry,'kill');
  assert.ok(!h.requests[0].command.includes(archived.bytesBase64));
  assert.ok(h.requests[0].stdin.includes(archived.bytesBase64));
  assert.equal(h.writes.length,2);
  for (const args of h.writes) { assert.equal(args[2],null); assert.equal(args[4],h.policy); }
  assert.equal(result.written.length,bundle.files.length);
});

test('binary CAS accepts identical existing bytes and never overwrites different bytes', async () => {
  const h = shellHarness(); const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  const files = bundle.files.filter(f => f.path.startsWith('assets/'));
  await writeAssetFiles({...h,projectId:'p-test',files});
  await writeAssetFiles({...h,projectId:'p-test',files});
  assert.deepEqual(h.memory.entries.get(`/library/projects/p-test/${files[0].path}`).bytes,font);
  const different = Buffer.from(font); different[different.length-1] = 9;
  h.memory.entries.get(`/library/projects/p-test/${files[0].path}`).bytes = different;
  await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files:bundle.files}),err => err.code === 'ASSET_WRITE_FAILED' && /ASSET_CONFLICT/.test(err.message));
  assert.deepEqual(h.memory.entries.get(`/library/projects/p-test/${files[0].path}`).bytes,different);
  assert.equal(h.writes.length,0,'metadata is not written after binary conflict');
  assert.ok(h.memory.opens.every(o => o.flags & constants.O_NOFOLLOW));
});

test('binary readback detects a corrupted write before metadata publication', async () => {
  const h = shellHarness();
  const originalOpen = h.memory.open.bind(h.memory);
  h.memory.open = async (p,flags) => {
    const handle = await originalOpen(p,flags);
    if (flags & constants.O_CREAT) handle.writeFile = async bytes => { const corrupted = Buffer.from(bytes); corrupted[corrupted.length-1] ^= 255; h.memory.entries.get(p).bytes = corrupted; };
    return handle;
  };
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files:bundle.files}),err => err.code === 'ASSET_WRITE_FAILED' && /INTEGRITY_MISMATCH/.test(err.message));
  assert.equal(h.writes.length,0);
});

test('shell metacharacters in a selected library path enter only through JSON stdin', async () => {
  const h = shellHarness();
  const root = "/library/a'$(touch owned)`id`";
  h.store.target = async relative => ({displayPath:path.posix.join(root,relative),targetKey:`opaque:${relative}`});
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  const files = bundle.files.filter(f => f.path.startsWith('assets/'));
  await writeAssetFiles({...h,projectId:'p-test',files});
  assert.ok(!h.requests[0].command.includes('touch owned'));
  assert.ok(h.requests[0].stdin.includes('touch owned'));
  assert.deepEqual(h.memory.entries.get(`${root}/projects/p-test/${files[0].path}`).bytes,font);
});

test('writer rejects path escapes, malformed archives and hash changes before invoking shell', async () => {
  const h = shellHarness(); const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  const file = bundle.files.find(f => f.path.startsWith('assets/'));
  for (const value of ['../outside','/tmp/outside','assets/i-test/fonts/../../outside','assets\\i-test\\fonts\\outside','imports/i-test/source.json/../preview.png']) {
    await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files:[{...file,path:value}]}),{code:'INVALID_PATH'});
  }
  await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files:[{...file,bytesBase64:b64('different')}]}),{code:'INTEGRITY_MISMATCH'});
  await assert.rejects(writeAssetFiles({...h,projectId:'p-../outside',files:[file]}),{code:'INVALID_ID'});
  await assert.rejects(writeAssetFiles({...h,policy:undefined,projectId:'p-test',files:[file]}),{code:'MISSING_POLICY'});
  assert.equal(h.requests.length,0);
});

test('writer rechecks composed target containment and child directory symlinks', async () => {
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  const files = bundle.files.filter(f => f.path.startsWith('assets/'));
  const h = shellHarness(); h.fs.contains = () => false;
  await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files}),{code:'PATH_OUTSIDE_PROJECT'});
  assert.equal(h.requests.length,0);
  const symlink = shellHarness();
  symlink.memory.entries.set('/library/projects/p-test/assets',{type:'symlink',target:'/outside'});
  await assert.rejects(writeAssetFiles({...symlink,projectId:'p-test',files}),err => err.code === 'ASSET_WRITE_FAILED' && /UNSAFE_DIRECTORY/.test(err.message));
  assert.ok(![...symlink.memory.entries.keys()].some(p => p.startsWith('/outside/')));
});

test('sandbox denial and incomplete receipts fail closed without publishing metadata', async () => {
  const bundle = buildAssetBundle(input({resources:[resource('https://example.test/font.woff2','font/woff2',font)]}));
  for (const result of [
    {exitCode:1,sandbox:{denied:true},stderr:{text:'denied'}},
    {exitCode:0,stdout:{text:JSON.stringify({written:[]})}},
    {exitCode:0,stdout:{text:'not JSON'}}
  ]) {
    const h = shellHarness(); h.shell.execute = async () => ({result:async () => result});
    await assert.rejects(writeAssetFiles({...h,projectId:'p-test',files:bundle.files}));
    assert.equal(h.writes.length,0);
  }
});

test('mislabelled raster bytes keep the original URL and are archived with their actual MIME and extension',async()=>{
  const url=source.url+'/partner.jpg';
  const captured=await collectRemoteResources([resource(url,'image/jpeg',png)]);
  assert.deepEqual(captured.failures,[]);
  const bundle=buildAssetBundle(input({html:'<img src="'+url+'">',resources:captured.resources}));
  const image=bundle.manifest.resources.find(item=>item.url===url);
  assert.equal(bundle.record.integrity,'complete');assert.equal(image.mimeType,'image/png');
  assert.match(image.path,/\.png$/);assert.ok(bundle.html.includes(image.path));
  const invalid=await collectRemoteResources([resource(url,'image/jpeg','<html>Unavailable</html>')]);
  assert.equal(invalid.failures[0].code,'MIME_MISMATCH');assert.equal(invalid.resources.length,0);
});
