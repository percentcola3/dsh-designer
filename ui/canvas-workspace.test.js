import test from 'node:test';
import assert from 'node:assert/strict';
import {designCanvasTab,sourceCanvasTab,canvasFirstState,createCanvasDesign} from './canvas-workspace.js';

test('canvas-first restore keeps dirty resources but activates the selected design canvas',()=>{
 const designs=[{id:'web',name:'官网',pageIds:['a']},{id:'mobile',name:'移动端',pageIds:['b']}],pages=[{id:'a',designId:'web'},{id:'b',designId:'mobile'}];
 const dirty={id:'p:file:notes',type:'file',dirty:true,content:'unsaved'};
 const previous={id:'p:canvas:mobile',type:'canvas',designId:'mobile',activePageId:'b',view:{camera:{x:3,y:4,zoom:.8}}};
 const restored=canvasFirstState('p',designs,pages,{items:[dirty,previous],activeId:dirty.id},{designId:'mobile'});
 assert.equal(restored.design.id,'mobile');assert.equal(restored.tabs.activeId,previous.id);assert.equal(restored.tabs.items[0],dirty);assert.deepEqual(restored.tab.view,previous.view);
});
test('canvas restore refuses a foreign page and honors persisted page order',()=>{
 const tab=designCanvasTab('p',{id:'d',name:'D',pageIds:['second','first']},[{id:'first',designId:'d'},{id:'second',designId:'d'},{id:'foreign',designId:'other'}],{activePageId:'foreign',view:{grid:false}});
 assert.equal(tab.activePageId,'second');assert.equal(tab.preview,false);assert.deepEqual(tab.view,{grid:false});
});
test('source workflows reopen the same design-strip tab without becoming a floating resource',()=>{
  const design={id:'d-web',name:'Web'},tab=sourceCanvasTab('p-one',design,'website');
  assert.equal(tab.type,'source');assert.equal(tab.canvasWorkflow,true);assert.equal(tab.designId,design.id);assert.equal(tab.name,'网页复刻');
  const view={sourceId:'source-one',versionId:'frozen-one'},reopened=sourceCanvasTab('p-one',design,'website',{...tab,view});
  assert.equal(reopened.id,tab.id);assert.equal(reopened.view,view);assert.equal(reopened.preview,false);
  assert.notEqual(sourceCanvasTab('p-one',design,'mastergo').id,tab.id);
  assert.notEqual(sourceCanvasTab('p-two',design,'website').id,tab.id);
  assert.deepEqual(sourceCanvasTab('p-two',design,'website',{...tab,view}).view,{});
  assert.equal(sourceCanvasTab('p-one',null,'website'),null);
});
test('fresh initialized Web metadata activates its real canvas and preserves workflow identities',()=>{
  const design={id:'web',name:'Web',pageIds:['home']},source=sourceCanvasTab('p',design,'website');
  const result=canvasFirstState('p',[design],[{id:'home',designId:'web'}],{items:[source],activeId:source.id});
  assert.equal(result.design.name,'Web');assert.equal(result.tab.activePageId,'home');assert.equal(result.tabs.activeId,result.tab.id);
  assert.equal(result.tabs.items.find(tab=>tab.id===source.id),source);
});
test('empty project and empty design do not invent pages',()=>{
 assert.equal(canvasFirstState('p',[],[],{items:[]}).tab,null);
 const tab=designCanvasTab('p',{id:'d',name:'D'},[]);assert.equal(tab.activePageId,null);assert.equal(tab.designId,'d');
});
function fixture(){
 let project={id:'p',revision:1,workbench:{designs:[]},artboards:[]},failPage=true;
 const calls=[];
 const api=async(action,args)=>{
  calls.push({action,args});
  if(action==='project.get')return {project:structuredClone(project)};
  assert.equal(args.expectedRevision,project.revision,'writes must use current project revision');
  if(action==='design.create'){const design={id:'d',name:args.name,platform:args.platform};project={...project,revision:2,workbench:{designs:[design]}};return {project:structuredClone(project),design};}
  if(action==='page.create'){
   if(failPage){failPage=false;throw Error('temporary failure');}
   const page={id:'a',designId:args.designId,viewport:args.viewport};project={...project,revision:project.revision+1,artboards:[page]};return {project:structuredClone(project),page};
  }
  throw Error(action);
 };
 return {api,calls,bump:()=>{project.revision++}};
}
test('a partial design creation retries the same design using a fresh CAS revision',async()=>{
 const f=fixture(),checkpoint={},args={projectId:'p',name:' 移动端 ',platform:'mobile'};
 await assert.rejects(createCanvasDesign(f.api,args,checkpoint),/temporary failure/);assert.equal(checkpoint.designId,'d');f.bump();
 const result=await createCanvasDesign(f.api,args,checkpoint);assert.equal(result.design.id,'d');assert.deepEqual(result.page.viewport,{width:390,height:844});assert.equal(f.calls.filter(c=>c.action==='design.create').length,1);
 const retried=await createCanvasDesign(f.api,args,checkpoint);assert.equal(retried.page.id,result.page.id);assert.equal(f.calls.filter(c=>c.action==='page.create').length,2);
});
test('Web designs receive an actual blank Web artboard through the native page API',async()=>{
 const f=fixture(),args={projectId:'p',name:'Web',platform:'web'},checkpoint={};await assert.rejects(createCanvasDesign(f.api,args,checkpoint));
 const result=await createCanvasDesign(f.api,args,checkpoint);assert.deepEqual(result.page.viewport,{width:1440,height:1000});assert.equal(f.calls.find(c=>c.action==='design.create').args.name,'Web');assert.equal(f.calls.find(c=>c.action==='page.create').args.designId,'d');
});
test('native design bootstrap is reused without adding a duplicate artboard',async()=>{
 const calls=[],design={id:'d-bootstrap',name:'Web',platform:'web'},page={id:'a-bootstrap',designId:'d-bootstrap',htmlPath:'designs/web/index.html',viewport:{width:1440,height:1000}};
 const api=async(action,args)=>{calls.push(action);if(action==='project.get')return {project:{id:'p',revision:1,workbench:{designs:[]}}};if(action==='design.create')return {design,page,project:{id:'p',revision:2,workbench:{designs:[design]},artboards:[page]}};throw Error('Unexpected duplicate action: '+action);};
 const result=await createCanvasDesign(api,{projectId:'p',name:'Web'});assert.equal(result.page.id,page.id);assert.deepEqual(calls,['project.get','design.create']);
});
for(const artifactKind of ['react','vue'])test(`${artifactKind} canvas creation passes the selected source kind separately from platform`,async()=>{
  const f=fixture(),checkpoint={},args={projectId:'p',name:'源码设计',artifactKind,platform:'mobile'};
  await assert.rejects(createCanvasDesign(f.api,args,checkpoint),/temporary failure/);
  const result=await createCanvasDesign(f.api,args,checkpoint);
  const create=f.calls.find(call=>call.action==='design.create').args;
  assert.equal(create.artifactKind,artifactKind);assert.equal(create.platform,'mobile');
  assert.deepEqual(result.page.viewport,{width:390,height:844});
  assert.equal(f.calls.filter(call=>call.action==='design.create').length,1);
  assert.ok(f.calls.filter(call=>call.action==='page.create').every(call=>!Object.hasOwn(call.args,'artifactKind')),'new page inherits its owning design format');
});
test('HTML canvas creation retains the original request shape',async()=>{
  const f=fixture();await assert.rejects(createCanvasDesign(f.api,{projectId:'p',name:'HTML',artifactKind:'html'}));
  assert.deepEqual(f.calls.find(call=>call.action==='design.create').args,{projectId:'p',expectedRevision:1,name:'HTML',platform:'web',binding:{mode:'inherit'}});
});
test('a removed checkpoint design is never replaced by a duplicate',async()=>{
 let writes=0;await assert.rejects(createCanvasDesign(async action=>{if(action==='project.get')return {project:{revision:8,workbench:{designs:[]}}};writes++;},{projectId:'p',name:'D'},{designId:'removed'}),/不可用/);assert.equal(writes,0);
});
