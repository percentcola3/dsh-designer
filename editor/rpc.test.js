import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {FrameSession,VIEW_COMMANDS,readCompleteElement,readCompleteElements,MAX_ELEMENT_BYTES,readSourceInstances} from './rpc.js';

test('default iframe timers retain their browser Window receiver through readiness, requests and cleanup',async()=>{
 const timers=new Map();let sequence=0,browser;
 const sandbox=vm.createContext({
  setTimeout:function(fn){assert.equal(this,browser,'browser timers must be called on Window');timers.set(++sequence,fn);return sequence;},
  clearTimeout:function(id){assert.equal(this,browser,'browser timer cleanup must be called on Window');timers.delete(id);},
 });
 browser=vm.runInContext('globalThis',sandbox);
 const source=readFileSync(new URL('./rpc.js',import.meta.url),'utf8').replace(/^export /gm,'');
 vm.runInContext(source+'\nglobalThis.FrameSession=FrameSession',sandbox);
 const sent=[],target={postMessage:packet=>sent.push(packet)},session=new sandbox.FrameSession({token:'t',pageId:'p',getWindow:()=>target});
 const receive=(kind,value,extra={})=>session.receive({source:target,data:{channel:'dsh-workbench-frame',token:'t',pageId:'p',kind,value,...extra}});
 const ready=session.whenReady();assert.equal(timers.size,1);receive('ready',{});await ready;assert.equal(timers.size,0);
 const response=session.request('measure',{nodeIds:[]});await Promise.resolve();assert.equal(sent.length,1);assert.equal(timers.size,1);receive('response',[],{requestId:sent[0].requestId});assert.deepEqual(await response,[]);assert.equal(timers.size,0);
 const pending=session.request('state');await Promise.resolve();session.close();await assert.rejects(pending,error=>error.code==='FRAME_CLOSED');assert.equal(timers.size,0);
});

function elementSnapshot(content,extra={}){
 const bytes=new TextEncoder().encode(content).byteLength,object={id:'instance-a',nodeId:'instance-a',instanceId:'instance-a',sourceNodeId:'source-a',sourceLocator:{id:'source-a',path:'src/App.vue',line:12,column:4,start:100,end:160,sourceHash:'sha'},documentEpoch:'doc-a',renderEpoch:5,sceneId:null,artifact:{kind:'vue',entry:'src/App.vue',version:3,buildId:'build-a'},outerHTML:content.slice(0,8),outerHTMLTotal:content.length,outerHTMLTotalBytes:bytes,outerHTMLTruncated:true,outerHTMLUnit:'utf16',elementReadId:'snapshot-a',...extra};
 const request=async(command,args)=>{assert.equal(command,'element.read');assert.equal(args.readId,'snapshot-a');const end=Math.min(args.offset+args.limit,content.length);return {readId:args.readId,nodeId:object.nodeId,sourceNodeId:object.sourceNodeId,documentEpoch:object.documentEpoch,renderEpoch:object.renderEpoch,sceneId:object.sceneId,artifact:{buildId:'build-a',version:3,entry:'src/App.vue',kind:'vue'},content:content.slice(args.offset,end),offset:args.offset,nextOffset:end<content.length?end:null,total:content.length,totalBytes:bytes,unit:'utf16',truncated:end<content.length,done:end===content.length};};
 return {object,request};
}
test('large Unicode element restores frozen UTF16 segments and preserves complete metadata',async()=>{
 const content='<section>'+('🙂中文'.repeat(50000))+'</section>',{object,request}=elementSnapshot(content);
 const restored=await readCompleteElement(request,object,{limit:65535});
 assert.equal(restored.outerHTML,content);assert.equal(restored.outerHTMLTruncated,false);assert.equal(restored.outerHTMLTotal,content.length);assert.equal(restored.sourceLocator,object.sourceLocator);assert.equal(restored.instanceId,'instance-a');assert.equal(object.outerHTMLTruncated,true,'do not mutate the original snapshot');
});
test('oversized or missing element context is explicit and never delivered as a silent prefix',async()=>{
 let calls=0;const {object}=elementSnapshot('<div>short prefix</div>',{outerHTMLTotalBytes:MAX_ELEMENT_BYTES+1});
 await assert.rejects(readCompleteElement(async()=>{calls++;},object),error=>error.code==='ELEMENT_TOO_LARGE');assert.equal(calls,0);
 await assert.rejects(readCompleteElement(async()=>{}, {nodeId:'a'}),error=>error.code==='ELEMENT_CONTEXT_MISSING');
 await assert.rejects(readCompleteElement(async()=>{}, {...object,outerHTMLTotalBytes:100,elementReadId:null}),error=>error.code==='ELEMENT_READ_UNAVAILABLE');
 await assert.rejects(readCompleteElement(async()=>{}, {outerHTML:'中文中文',outerHTMLTruncated:false},{maxBytes:8}),error=>error.code==='ELEMENT_TOO_LARGE');
});
test('gaps, altered epochs, inconsistent totals and bytes reject incomplete element references',async()=>{
 for(const mutate of [chunk=>({...chunk,offset:1}),chunk=>({...chunk,documentEpoch:'other'}),chunk=>({...chunk,renderEpoch:99}),chunk=>({...chunk,sourceNodeId:'other-source'}),chunk=>({...chunk,total:chunk.total+1}),chunk=>({...chunk,totalBytes:chunk.totalBytes+1}),chunk=>({...chunk,nextOffset:null,done:true})]){
  const {object,request}=elementSnapshot('<div>'+('abc'.repeat(100))+'</div>');
  await assert.rejects(readCompleteElement(async(command,args)=>mutate(await request(command,args)),object,{limit:17}),error=>/^ELEMENT_/.test(error.code));
 }
});
test('a closed frame or expired snapshot rejects the whole multi-element reference',async()=>{
 const {object,request}=elementSnapshot('<p>frozen</p>');
 const expired=Object.assign(new Error('snapshot expired'),{code:'FRAME_VIEW_ERROR'});
 await assert.rejects(readCompleteElements(async(command,args)=>{if(args.offset>0)throw expired;return request(command,args);},[object],{limit:4}),error=>error===expired);
 const full=await readCompleteElements(request,[{...object,outerHTML:'<p>a</p>',outerHTMLTotal:8,outerHTMLTotalBytes:8,outerHTMLTruncated:false}]);assert.equal(full[0].outerHTML,'<p>a</p>');
});
test('source reselect only accepts complete current-build runtime instances and never silently clips loops',async()=>{
 const artifact={kind:'react',entry:'src/App.tsx',version:2,buildId:'new'},object={nodeId:'new-instance',sourceNodeId:'source',documentEpoch:'new-doc',artifact,outerHTML:'<p>x</p>',outerHTMLTotal:8,outerHTMLTruncated:false};
 const response={objects:[object],sourceNodeIds:['source'],counts:{source:1},missingSourceNodeIds:[],total:1,offset:0,nextOffset:null,truncated:false,done:true,documentEpoch:'new-doc',artifact};
 const calls=[],request=async(command,args)=>{calls.push({command,args});return response;};
 const result=await readSourceInstances(request,['source','source'],{documentEpoch:'new-doc',artifact});assert.equal(result.objects[0].nodeId,'new-instance');assert.equal(result.objects[0].outerHTML,'<p>x</p>');assert.deepEqual(calls[0].args.sourceNodeIds,['source']);
 await assert.rejects(readSourceInstances(async()=>({...response,total:201,truncated:true,done:false,nextOffset:200}),['source'],{documentEpoch:'new-doc',artifact}),error=>error.code==='SOURCE_INSTANCE_LIMIT');
 await assert.rejects(readSourceInstances(async()=>({...response,documentEpoch:'old-doc'}),['source'],{documentEpoch:'new-doc',artifact}),error=>error.code==='ELEMENT_IDENTITY_CHANGED');
 await assert.rejects(readSourceInstances(async()=>({...response,objects:[{...object,sourceNodeId:'foreign'}]}),['source'],{documentEpoch:'new-doc',artifact}),error=>error.code==='SOURCE_INSTANCES_INVALID');
 await assert.rejects(readSourceInstances(async()=>({...response,total:2}),['source'],{documentEpoch:'new-doc',artifact}),error=>error.code==='ELEMENT_IDENTITY_CHANGED');
 assert.ok(VIEW_COMMANDS.has('source.instances'));
});
test('element.read is an authenticated read-only frame command and edit commands stay forbidden',async()=>{
 assert.ok(VIEW_COMMANDS.has('element.read'));assert.equal(VIEW_COMMANDS.has('element.write'),false);
 const sent=[],window={postMessage:value=>sent.push(value)},session=new FrameSession({token:'secret',pageId:'p',getWindow:()=>window});
 session.receive({source:window,data:{channel:'dsh-workbench-frame',token:'secret',pageId:'p',kind:'ready'}});
 const response=session.request('element.read',{readId:'read-a',offset:0,limit:20});await Promise.resolve();
 assert.equal(sent[0].command,'element.read');
 assert.equal(session.receive({source:{},data:{channel:'dsh-workbench-frame',token:'secret',pageId:'p',kind:'response',requestId:sent[0].requestId,value:{content:'foreign'}}}),false);
 session.receive({source:window,data:{channel:'dsh-workbench-frame',token:'secret',pageId:'p',kind:'response',requestId:sent[0].requestId,value:{content:'frozen'}}});assert.deepEqual(await response,{content:'frozen'});
 await assert.rejects(session.request('element.write',{}),error=>error.code==='FRAME_COMMAND_DENIED');session.close();
});
