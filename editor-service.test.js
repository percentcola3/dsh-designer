import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorService} from './editor-service.js';

const html='<!doctype html><html><head><style>.feedback{display:flex}@media(max-width:600px){.feedback{display:none}}</style></head><body><form id="form"><input name="name"><button>Save</button></form><p id="feedback" class="feedback" hidden>Saved</p><script>document.getElementById("form").addEventListener("submit",event=>{event.preventDefault();document.getElementById("feedback").hidden=false;});</script></body></html>';
const byId=(document,id)=>Object.values(document.nodes).find(node=>node.attributes.id===id);

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
