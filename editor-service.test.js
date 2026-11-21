import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorService} from './editor-service.js';
import {normalizeDocument} from './document-model.js';

const html='<!doctype html><html><head><style>.feedback{display:flex}@media(max-width:600px){.feedback{display:none}}</style></head><body><form id="form"><input name="name"><button>Save</button></form><p id="feedback" class="feedback" hidden>Saved</p><script>document.getElementById("form").addEventListener("submit",event=>{event.preventDefault();document.getElementById("feedback").hidden=false;});</script></body></html>';
const byId=(document,id)=>Object.values(document.nodes).find(node=>node.attributes.id===id);

test('missing stable nodes return exact HTML-id candidates and current versions without saving',async()=>{
  const document=normalizeDocument('<!doctype html><html><body><p id="title" data-dsh-node="stable-title">Title</p></body></html>');
  const editor=new EditorService({});let writes=0;
  editor.read=async()=>({project:{id:'p',revision:7},page:{id:'page',revision:3},document});
  editor.write=async()=>{writes++;};
  await assert.rejects(editor.execute({action:'edit.apply',projectId:'p',pageId:'page',expectedRevision:7,operations:[{type:'text',nodeIds:['title'],value:'Updated'}]},{user:true}),error=>{
    assert.equal(error.code,'NODE_NOT_FOUND');
    assert.deepEqual(error.details.recovery.htmlIdMatches,[{nodeId:'stable-title',htmlId:'title',tag:'p'}]);
    assert.equal(error.details.recovery.expectedRevision,7);assert.equal(error.details.recovery.expectedArtboardRevision,3);
    assert.deepEqual(error.details.recovery.read,{action:'edit.read',pageId:'page',query:'title'});
    return true;
  });
  assert.equal(writes,0);
  await assert.rejects(editor.execute({action:'edit.apply',expectedRevision:7,operations:[{type:'text',nodeIds:[42],value:'Updated'}]},{user:true}),error=>error.code==='NODE_NOT_FOUND');
  await assert.rejects(editor.execute({action:'edit.read',query:''}),{code:'INVALID_INPUT'});
  await assert.rejects(editor.execute({action:'edit.read',query:'x'.repeat(201)}),{code:'INVALID_INPUT'});
});

test('Editor preparation keeps authored hidden and scripts through both normalization passes',async()=>{
  const owner={store:{target:async relative=>'/library/'+relative},ctx:{fs:{}}},editor=new EditorService(owner),project={id:'p-test'},page={id:'a-test',htmlPath:'designs/site/index.html'};
  const first=await editor.prepare(html,{project,page}),next=await editor.prepare(first.html,{project,page,previousHtml:first.html});
  assert.equal(next.html,first.html);assert.equal(byId(next,'feedback').attributes.hidden,'');assert.equal(byId(next,'feedback').attributes['data-dsh-hidden'],undefined);
  assert.ok(next.html.includes('event.preventDefault();document.getElementById("feedback").hidden=false;'));
  assert.ok(next.html.includes('@media(max-width:600px){.feedback{display:none}}'));
});

test('Editor reads normalize only in memory and preserve exact saved HTML without changing projects',async()=>{
  const page={id:'a-test',htmlPath:'designs/site/index.html',revision:1},project={id:'p-test',revision:1,artboards:[page],workbench:{files:[{id:'f-test',pageId:page.id,path:page.htmlPath}]}},calls=[];
  const owner={workbench:{async execute(input){calls.push(input.action);assert.equal(input.action,'workspace.open');return {project}},async readAt(){return {bytes:new TextEncoder().encode(html),version:'v-one'}}}},editor=new EditorService(owner);
  const read=await editor.read(project.id,page.id,{user:true});
  assert.equal(read.document.savedHTML,html);assert.equal(byId(read.document,'feedback').attributes['data-dsh-hidden'],undefined);assert.deepEqual(calls,['workspace.open']);
  const again=await editor.read(project.id,page.id,{agent:{id:'model'}});assert.equal(again.document.savedHTML,undefined);assert.equal(again.document.html,read.document.html);assert.deepEqual(calls,['workspace.open','workspace.open']);
});

test('inspect is a read-only alias and unknown editor actions fail before reading or saving',async()=>{
  const editor=new EditorService({});let reads=0;
  editor.read=async()=>{reads++;return {saved:true}};
  assert.deepEqual(await editor.execute({action:'edit.inspect',projectId:'p',pageId:'a'}),{saved:true});
  assert.equal(reads,1);
  await assert.rejects(editor.execute({action:'edit.inspect',operations:[{type:'scene.create'}]}),{code:'INVALID_INPUT'});
  await assert.rejects(editor.execute({action:'edit.typo'}),{code:'UNKNOWN_ACTION'});
  assert.equal(reads,1);
});

test('validation reports saved state coverage, sample fields and transitions in one read',async()=>{
  const editor=new EditorService({}),document={html:'<html></html>',nodes:{panel:{},field:{}},scenes:{active:null,items:[{id:'detail',name:'详情',nodes:{panel:{hidden:false},field:{attributes:{value:'示例'}}}}]},interactions:[{id:'open',type:'scene',sourceId:'button',sceneId:'detail'}],diagnostics:[],resources:[]};
  let reads=0;editor.read=async()=>{reads++;return {project:{id:'p',revision:8},page:{id:'a',name:'首页',revision:2,htmlPath:'index.html'},document,sourceHash:'hash'}};editor.prepare=async()=>document;
  const result=await editor.execute({action:'edit.validate',projectId:'p',pageId:'a',requiredSceneIds:['detail','empty']});
  assert.equal(reads,1);assert.equal(result.valid,false);assert.deepEqual(result.sceneCoverage.missingSceneIds,['empty']);assert.equal(result.sceneCoverage.items[0].sampleValueCount,1);assert.equal(result.sceneCoverage.items[0].nodeCount,2);assert.deepEqual(result.sceneCoverage.items[0].missingNodeIds,[]);assert.equal(result.interactions[0].sceneId,'detail');assert.equal(result.page.revision,2);
  assert.equal((await editor.execute({action:'edit.validate',requiredSceneIds:['detail']})).valid,true);
  await assert.rejects(editor.execute({action:'edit.validate',requiredSceneIds:'detail'}),{code:'INVALID_INPUT'});
});

test('a new HTML commit can include the saved state inventory with authored stable identifiers',async()=>{
  const editor=new EditorService({store:{target:async()=>'/library/p'},ctx:{fs:{}}});
  const metadata={schemaVersion:1,scenes:{active:null,items:[{id:'detail',name:'详情',nodes:{panel:{hidden:false}}}]},interactions:[{id:'open-detail',type:'scene',sourceId:'open',sceneId:'detail'}]};
  const html=`<!doctype html><html><head></head><body><button data-dsh-node="open">详情</button><section data-dsh-node="panel" hidden>示例详情</section><script id="dsh-document-model" type="application/json">${JSON.stringify(metadata)}</script></body></html>`;
  const document=await editor.prepare(html,{project:{id:'p'},page:{id:'a',htmlPath:'index.html'}});
  assert.equal(document.scenes.items[0].id,'detail');assert.equal(document.nodes.panel.text,'示例详情');assert.equal(document.interactions[0].sourceId,'open');assert.ok(!document.diagnostics.some(d=>d.severity==='error'));
});
