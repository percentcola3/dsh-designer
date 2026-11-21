import test from 'node:test';
import assert from 'node:assert/strict';
import {systemLogicalPath,isTextSystemResource,replaceSystemResource,inlineSystemResource,readSystemResource,systemResourceFileBody} from './system-resource.js';

test('relative system dependencies preserve exact directories instead of matching basenames',()=>{
 assert.equal(systemLogicalPath('examples/card/index.md','../../assets/card/icon.png'),'assets/card/icon.png');
 assert.equal(systemLogicalPath('examples/list/index.md','../../assets/list/icon.png'),'assets/list/icon.png');
 assert.notEqual(systemLogicalPath('examples/card/index.md','../../assets/card/icon.png'),systemLogicalPath('examples/list/index.md','../../assets/list/icon.png'));
});

test('replacement keeps logical identity and only carries new bytes into the next immutable package',()=>{
 const original={id:'icon',name:'Icon',logicalPath:'assets/card/icon.svg',path:'resources/immutable-old/assets/card/icon.svg',mimeType:'image/svg+xml',type:'asset',description:'Card icon',sha256:'old-hash',fsVersion:'old-fs',byteLength:99,previewUrl:'http://local/old-cap',downloadUrl:'http://local/old-cap',content:'old',bytesBase64:'b2xk',provenance:{kind:'old'}};
 const before=structuredClone(original),text=replaceSystemResource(original,{content:'<svg>新</svg>'});
 assert.equal(text.id,'icon');assert.equal(text.logicalPath,'assets/card/icon.svg');assert.equal(text.path,text.logicalPath);assert.equal(text.content,'<svg>新</svg>');
 for(const key of ['sha256','fsVersion','byteLength','previewUrl','downloadUrl','provenance','bytesBase64'])assert.equal(Object.hasOwn(text,key),false,key);
 const binary=replaceSystemResource(text,{bytesBase64:'AAEC/w==',mimeType:'image/png'});
 assert.equal(binary.logicalPath,original.logicalPath);assert.equal(binary.bytesBase64,'AAEC/w==');assert.equal(binary.mimeType,'image/png');assert.equal(Object.hasOwn(binary,'content'),false);
 assert.deepEqual(original,before);
 assert.equal(replaceSystemResource(original,{content:''}).content,'');
 assert.throws(()=>replaceSystemResource(original,{}),{code:'SYSTEM_RESOURCE_BODY_REQUIRED'});
 assert.throws(()=>replaceSystemResource(original,{content:'x',bytesBase64:'eA=='}),{code:'SYSTEM_RESOURCE_BODY_REQUIRED'});
});

test('inline replacement preview decodes Unicode text without a saved-resource reread',()=>{
 const inline=inlineSystemResource({path:'examples/card.md',mimeType:'text/markdown',bytesBase64:Buffer.from('# 新版本\n').toString('base64')});
 assert.equal(inline.content,'# 新版本\n');assert.equal(isTextSystemResource(inline),true);
 assert.equal(inlineSystemResource({path:'empty.txt',content:''}).content,'');
 assert.throws(()=>inlineSystemResource({path:'bad.txt',bytesBase64:'/w=='}),{code:'SYSTEM_RESOURCE_INVALID_UTF8'});
 const font=inlineSystemResource({path:'fonts/brand.woff2',mimeType:'font/woff2',bytesBase64:'AAEC/w=='});
 assert.equal(font.binary,true);assert.equal(isTextSystemResource(font),false);assert.ok(font.downloadUrl.startsWith('data:font/woff2;'));
});

test('saved resource reads stay pinned and readonly; cancellation and oversized replacements fail before reading',async()=>{
 let args;
 const value=await readSystemResource(async(action,input)=>{args={action,...input};return {systemId:'s',version:2,resource:{logicalPath:'rules.txt'},mimeType:'text/plain',content:'old'};},{systemId:'s',version:2,resourceId:'r'});
 assert.deepEqual(args,{action:'system.resource.read',systemId:'s',version:2,resourceId:'r'});assert.equal(value.readonly,true);assert.equal(value.content,'old');
 await assert.rejects(systemResourceFileBody(null),{code:'SYSTEM_RESOURCE_REPLACE_CANCELLED'});
 await assert.rejects(systemResourceFileBody({size:64*1024*1024+1}),{code:'SYSTEM_RESOURCE_TOO_LARGE'});
});

test('Unicode paths resolve exactly and external origins cannot become package paths',()=>{
 assert.equal(systemLogicalPath('示例/页面.md','../图片/图%20标.svg#view'),'图片/图 标.svg');
 assert.throws(()=>systemLogicalPath('index.md','https://other.invalid/private.png'),error=>error.code==='SYSTEM_RESOURCE_SCOPE');
});

test('desktop system text reads route exact local capability through native bridge and reject external origins', async () => {
 const oldLocation=globalThis.location, oldFetch=globalThis.fetch;
 try {
  globalThis.location={protocol:'dsh-app:',origin:'dsh-app://app'};
  let requested;
  globalThis.fetch=async(url,options)=>{requested={url,options};return {ok:true,text:async()=> '# Saved rule'};};
  const api=async()=>({mimeType:'text/markdown',logicalPath:'rule.md',downloadUrl:'http://127.0.0.1:5000/api/designer/file-resource/cap/rule.md?download=1'});
  const result=await readSystemResource(api,{systemId:'s',version:1,resourceId:'r'});
  assert.equal(result.content,'# Saved rule');
  assert.equal(requested.url,'/api/designer/file-resource/cap/rule.md?download=1');
  assert.equal(requested.options.credentials,'same-origin');
  for(const address of ['https://foreign.test/api/designer/file-resource/cap/rule.md','http://localhost:5000/private'])await assert.rejects(readSystemResource(async()=>({mimeType:'text/plain',downloadUrl:address}),{}),{code:'SYSTEM_RESOURCE_SCOPE'});
 } finally {globalThis.location=oldLocation;globalThis.fetch=oldFetch;}
});

test('directory downloads preserve binary bytes from metadata-only capabilities', async () => {
 const {readSystemResourceBytes}=await import('./system-resource.js');
 const oldLocation=globalThis.location,oldFetch=globalThis.fetch;
 try {
  globalThis.location={protocol:'dsh-app:',origin:'dsh-app://app'};
  const bytes=Uint8Array.of(0,255,128,1);
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer});
  const loaded=await readSystemResourceBytes(async()=>({mimeType:'image/png',downloadUrl:'http://127.0.0.1:5000/api/designer/file-resource/cap/image.png?download=1'}),{systemId:'s',version:1,resourceId:'r'});
  assert.deepEqual(loaded.bytes,bytes);
 } finally {globalThis.location=oldLocation;globalThis.fetch=oldFetch;}
});
