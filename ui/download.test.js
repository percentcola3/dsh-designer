import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('./common.jsx',import.meta.url),'utf8');
function fixture({protocol='dsh-app:',status=200}={}){
  const requests=[],links=[],timers=[];let appended=false,removed=false;
  class DownloadURL extends URL {static createObjectURL(){return 'blob:download';}static revokeObjectURL(){}}
  const link={click(){assert.equal(appended,true);links.push({...this});},remove(){removed=true;}};
  const download=runInNewContext(source.slice(source.indexOf('export async function downloadValue')).replace('export ','')+'\ndownloadValue',{
    URL:DownloadURL,Blob,location:{protocol,href:protocol==='dsh-app:'?'dsh-app://app/':'http://127.0.0.1:5000/'},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:status===200,status,blob:async()=>new Blob(['ZIP'])};},
    document:{createElement:()=>link,body:{append(){appended=true;}}},setTimeout:(callback,delay)=>timers.push(delay),
    errorValue:(message,code)=>Object.assign(Error(message),{code})
  });
  return {download,requests,links,timers,removed:()=>removed};
}

test('native downloads use the authenticated relative API and a browser-owned blob',async()=>{
  const f=fixture();await f.download({downloadUrl:'http://127.0.0.1:5000/api/designer/download/p-one/e-two',name:'Project.zip'});
  assert.equal(f.requests[0].url,'/api/designer/download/p-one/e-two');assert.equal(f.requests[0].options.credentials,'same-origin');
  assert.equal(f.links[0].href,'blob:download');assert.equal(f.links[0].download,'Project.zip');assert.equal(f.removed(),true);assert.equal(f.timers[0],60000);
});

test('download authorization errors remain visible and never produce a fake file',async()=>{
  const f=fixture({status:401});await assert.rejects(f.download({url:'http://127.0.0.1:5000/api/designer/download/p-one/e-two'}),{code:'DOWNLOAD_FAILED'});assert.equal(f.links.length,0);
});

test('web downloads and external hosts keep their authority while inline contents need no network',async()=>{
  const f=fixture({protocol:'http:'});await f.download({url:'http://127.0.0.1:5000/api/designer/download/p-one/e-two'});assert.equal(f.requests[0].url,'http://127.0.0.1:5000/api/designer/download/p-one/e-two');
  const other=fixture();await other.download({url:'https://example.com/api/designer/resource/file'});assert.equal(other.requests[0].url,'https://example.com/api/designer/resource/file');
  const inline=fixture();await inline.download({content:'{}',name:'system.json'});assert.equal(inline.requests.length,0);assert.equal(inline.links[0].download,'system.json');
});

test('the public native fileActions service returns actual completion instead of a browser request',async()=>{
  const f=fixture();let captured;
  const saved=await f.download({content:'original bytes',name:'Project.zip'},undefined,{async save(source,mode){captured={source,mode};return {status:'saved',path:'/Downloads/Project.zip'};}});
  assert.equal(saved.status,'saved');assert.equal(captured.mode,'download');assert.equal(await (await captured.source.read()).text(),'original bytes');assert.equal(f.links.length,0);
});
