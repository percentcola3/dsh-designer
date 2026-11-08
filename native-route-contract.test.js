import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Electron's bundled Node understands app.asar and resolves the installed SDK's
// own dependencies. These checks need no extraction, dependency install, listener,
// browser, owner credentials or user files. Native Fs/Session boundaries are idle.
const resources=process.env.DSH_APP_RESOURCES||'/Applications/DeepSeek Harness.app/Contents/Resources';
const runtime=path.resolve(resources,'../MacOS/DeepSeek Harness');
const sdk=pathToFileURL(path.join(resources,'app.asar/dsh/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js')).href;
const designer=new URL('./index.js',import.meta.url).href;
const bootstrap=`
import assert from 'node:assert/strict';
import path from 'node:path';
import {WebServer} from ${JSON.stringify(sdk)};
import {apply} from ${JSON.stringify(designer)};
function router(){
  // Avoid starting the Service listener; register/match are the installed,
  // unmodified WebServer implementation rather than a replica of its matcher.
  const value=Object.create(WebServer.prototype);
  value.exact=new Map();value.prefixes=new Map();value.upgrades=new Map();
  value.config={host:'127.0.0.1',port:0};value.listenedPort=0;
  return value;
}
const bases=['resource','file-resource','source-resource','capture','knowledge-resource','share','download'].map(name=>'/api/designer/'+name);
async function mounted(){
  const webServer=router(),effects=[],tools=new Map();let denied=0;
  const fs={async resolve(value,{cwd='/workspace'}={}){return {key:path.resolve(cwd,value)};},processPath:value=>value.key,contains:(a,b)=>b.key===a.key||b.key.startsWith(a.key+'/'),async stat(){return undefined;},async listDir(){return [];},async readText(){throw Object.assign(Error('Missing fixture file'),{code:'FS_NOT_FOUND'});},async readBytes(){throw Object.assign(Error('Missing fixture file'),{code:'FS_NOT_FOUND'});}};
  const ctx={fs,webServer,sandboxPolicy:{workspaceRoot:'/workspace',resolve:()=>({mode:'workspace-write',workspaceRoot:'/workspace'})},connection:{requestRejection(){denied++;return 403;},admit:()=>({rejection:403})},tools:{register(def){tools.set(def.name,def);return ()=>tools.delete(def.name);},schemas:()=>[...tools.values()]},agents:{list:()=>[],get:()=>undefined},agentPresets:{compositionInventory:async()=>[{id:'minimal',rows:[]}]},on:()=>()=>{},effect(start){const off=start();assert.equal(typeof off,'function');effects.push(off);return off;}};
  await apply(ctx,{workspaceRoot:'/workspace'});
  return {webServer,get denied(){return denied;},async close(){for(const off of effects.reverse())await off();}};
}
function response(){return {status:0,headers:{},writeHead(status,headers={}){this.status=status;this.headers=headers;},end(){this.ended=true;}};}
`;
function runNative(t,body){
  if(!existsSync(runtime)||!existsSync(path.join(resources,'app.asar'))){t.skip('Installed DeepSeek Harness runtime unavailable; set DSH_APP_RESOURCES');return;}
  const result=spawnSync(runtime,['--input-type=module'],{input:bootstrap+'\n'+body,encoding:'utf8',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:20000,maxBuffer:1024*1024});
  assert.ifError(result.error);assert.equal(result.signal,null,result.stderr);assert.equal(result.status,0,result.stderr||result.stdout);
}

test('installed WebServer prefix matching requires a segment base without a trailing slash',t=>runNative(t,`
const web=router(),handler=()=>true;
for(const base of bases){
  const broken={kind:'prefix',path:base+'/',handler},off=web.register(broken);
  assert.equal(web.match(base+'/p-test/item'),undefined,base+' trailing slash must reproduce the original miss');
  assert.equal(web.match(base+'//p-test/item'),broken,base+' original matcher adds its own separator');
  off();
  const correct={kind:'prefix',path:base,handler},remove=web.register(correct);
  assert.equal(web.match(base+'/p-test/item'),correct);assert.equal(web.match(base),correct);
  for(const suffix of ['-other/p-test/item','ish/p-test/item','%2Fp-test/item'])assert.equal(web.match(base+suffix),undefined,base+suffix);
  remove();
}
`));

test('Designer apply registers every prefix so normal URLs reach the installed native matcher',t=>runNative(t,`
const f=await mounted();try{
  assert.equal(f.webServer.prefixes.size,bases.length);
  for(const base of bases){
    const registered=f.webServer.prefixes.get(base);assert.ok(registered,'Missing canonical prefix '+base);
    assert.equal(registered.kind,'prefix');assert.equal(f.webServer.match(base+'/p-test/item'),registered);
    assert.equal(f.webServer.match(base+'-other/p-test/item'),undefined);
    assert.equal(f.webServer.match(base+'ish/p-test/item'),undefined);
  }
  for(const exact of ['/api/designer','/api/designer/meta','/api/designer/upload']){
    assert.equal(f.webServer.match(exact),f.webServer.exact.get(exact));
    assert.equal(f.webServer.match(exact+'/unregistered'),undefined);
  }
}finally{await f.close();}
`));

test('double slashes still select the same real handler and cannot skip method or owner checks',t=>runNative(t,`
const f=await mounted();try{
  for(const base of bases){
    const normal=f.webServer.match(base+'/p-test/item'),doubled=f.webServer.match(base+'//p-test/item');
    assert.ok(normal);assert.equal(doubled,normal,'Double slash must not escape to fallback');
    for(const separator of ['/','//']){
      const res=response();await f.webServer.match(base+separator+'p-test/item').handler({method:'POST',url:base+separator+'p-test/item',headers:{}},res);
      assert.equal(res.status,base.endsWith('/download')?403:405,base+separator+' method/owner rejection');assert.equal(res.ended,true);
    }
  }
  assert.equal(f.denied,2,'Both download URL forms must execute the owner gate');
}finally{await f.close();}
`));
