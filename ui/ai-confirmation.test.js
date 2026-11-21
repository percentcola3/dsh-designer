import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeAISubmission,confirmationIsCurrent,confirmedPayload} from './ai-confirmation.js';
import {labelSelection} from '../editor/selection-labels.js';
import {sourceTemplateConfirmation} from './target-state.js';
const snapshot={prompt:'修改移动端',target:{projectId:'p',designId:'mobile',scope:'design',scopeChoice:{id:'one'}},references:[{type:'directory',rootPath:'/knowledge',readonly:true}],attachments:[],binding:{systemId:'brand',version:3}};
const input={projectId:'p',projectRevision:4,activeDesignId:'web',prompt:snapshot.prompt,target:snapshot.target,references:snapshot.references,attachments:[]};
const make=()=>({projectId:'p',projectRevision:4,activeDesignId:'web',snapshot:structuredClone(snapshot),payload:freezeAISubmission({snapshot,activeDesignId:'web',sessionId:'shared-project',projectId:'p'}),details:{token:'server-confirmation'}});
test('confirmation retries the original request with only its server capability added',()=>{
  const pending=make(),before=structuredClone(pending.payload),result=confirmedPayload(pending);
  assert.equal(result.activeDesignId,'web');assert.equal(result.target.designId,'mobile');assert.equal(result.target.scopeChoice,undefined);assert.equal(result.contextSessionId,'shared-project');assert.deepEqual(result.frozenTarget,result.target);
  const {targetConfirmation,...rest}=result;assert.equal(targetConfirmation,'server-confirmation');assert.deepEqual(rest,before);
  result.references[0].rootPath='/changed';assert.equal(pending.payload.references[0].rootPath,'/knowledge');assert.equal(snapshot.target.scopeChoice.id,'one');
});
test('switching canvas, editing prompt, changing references or project revision invalidates pending confirmation',()=>{
  const pending=make();assert.equal(confirmationIsCurrent(pending,input),true);
  for(const patch of [{activeDesignId:'mobile'},{projectId:'other'},{projectRevision:5},{prompt:'不同要求'},{references:[]},{attachments:[{receiptId:'new'}]},{target:{...input.target,scope:'project'}}])assert.equal(confirmationIsCurrent(pending,{...input,...patch}),false);
});
test('repeating history uses a guard for the current draft and does not consume an unrelated draft',()=>{
  const pending=make();pending.guard={...structuredClone(snapshot),prompt:'保留的新草稿'};
  assert.equal(confirmationIsCurrent(pending,{...input,prompt:'保留的新草稿'}),true);
  assert.equal(confirmedPayload(pending).prompt,'修改移动端');
});

function sourceSnapshot(){
 const artifact={kind:'react',entry:'designs/mobile/source-a/App.jsx',version:7,buildId:'build-7'},locator={id:'source-button',path:artifact.entry,tag:'button',start:35,end:100,line:2,column:6,sourceHash:'a'.repeat(64)};
 const objects=[1,2].map(i=>({id:`runtime-${i}`,instanceId:`runtime-${i}`,nodeId:`runtime-${i}`,sourceNodeId:locator.id,sourceLocator:locator,artifact,documentEpoch:'document-7',renderEpoch:4,sceneId:'query',outerHTML:`<button>${'完整元素'.repeat(7000)} ${i}</button>`}));
 const selection=labelSelection({pageId:'a',artifact,documentEpoch:'document-7',renderEpoch:4,sceneId:'query',nodeIds:objects.map(row=>row.nodeId),objects});
 return {...structuredClone(snapshot),selection,target:{projectId:'p',designId:'mobile',pageId:'a',scope:'selection',nodeIds:['runtime-1','runtime-2'],sourceTemplateConfirmed:sourceTemplateConfirmation(selection)}};
}

test('framework submission freezes full elements, manifest locators and artifact while separating source and runtime IDs',()=>{
 const snap=sourceSnapshot(),result=freezeAISubmission({snapshot:snap,projectId:'p',activeDesignId:'mobile',sessionId:'session-p'});
 assert.deepEqual(result.selection.objects.map(object=>object.selectionLabel),['A','B']);assert.equal(result.mode,'edit');assert.deepEqual(result.target.nodeIds,['source-button']);assert.deepEqual(result.target.runtimeNodeIds,['runtime-1','runtime-2']);assert.deepEqual(result.selection,snap.selection);assert.deepEqual(result.frozenTarget,result.target);assert.ok(result.selection.objects[0].outerHTML.length>12000);
 result.selection.objects[0].outerHTML='changed';result.selection.objects[0].sourceLocator.path='elsewhere.jsx';assert.notEqual(snap.selection.objects[0].outerHTML,'changed');assert.equal(snap.selection.objects[0].sourceLocator.path,snap.selection.artifact.entry);
});

test('source template confirmation cannot be a bare boolean, reused for new build/scene, or sent with partial elements',()=>{
 for(const mutate of [value=>{delete value.target.sourceTemplateConfirmed},value=>{value.target.sourceTemplateConfirmed=true},value=>{value.selection.artifact.buildId='new-build'},value=>{value.selection.renderEpoch++},value=>{value.selection.sceneId='create'},value=>{value.selection.objects[0].outerHTMLTruncated=true},value=>{value.selection.objects[0].outerHTMLComplete=false},value=>{value.selection.objects[0].sourceLocator=undefined}]){
  const snap=sourceSnapshot();mutate(snap);assert.throws(()=>freezeAISubmission({snapshot:snap,projectId:'p',sessionId:'session-p'}),error=>['SOURCE_TEMPLATE_CONFIRMATION_REQUIRED','ELEMENT_CONTEXT_INCOMPLETE'].includes(error.code));
 }
 const readonly=sourceSnapshot();readonly.target.scope='read';delete readonly.target.sourceTemplateConfirmed;assert.equal(freezeAISubmission({snapshot:readonly,projectId:'p',sessionId:'session-p'}).target.scope,'read');
});

test('an exact file target ignores unrelated canvas evidence without granting a DOM selection',()=>{
 const snap=sourceSnapshot();snap.target={projectId:'p',type:'file',path:'src/App.jsx',scope:'project',allowedPaths:['src/App.jsx']};snap.selection.objects[0].outerHTMLTruncated=true;
 const result=freezeAISubmission({snapshot:snap,projectId:'p',sessionId:'session-p'});assert.equal(result.selection,undefined);assert.equal(result.target.path,'src/App.jsx');assert.deepEqual(result.allowedPaths,['src/App.jsx']);assert.equal(result.mode,'edit');
});

test('HTML submission retains its complete runtime element and frame metadata and rejects partial or oversized input',()=>{
 const outerHTML='<section data-dsh-node="html-node">'+('完整元素'.repeat(9000))+'</section>',snap={...structuredClone(snapshot),target:{projectId:'p',designId:'mobile',pageId:'a',scope:'selection',nodeIds:['html-node']},selection:{pageId:'a',nodeIds:['html-node'],documentEpoch:'html-frame',renderEpoch:5,sceneId:'loading',artifact:{kind:'html',version:2},objects:[{id:'html-node',nodeId:'html-node',outerHTML,sourceLocator:{path:'saved.html',id:'html-node'},documentEpoch:'html-frame',renderEpoch:5,sceneId:'loading'}]}};
 const freeze=value=>freezeAISubmission({snapshot:value,projectId:'p',sessionId:'session-p'}),result=freeze(snap);assert.equal(result.selection.objects[0].outerHTML,outerHTML);assert.equal(result.selection.documentEpoch,'html-frame');assert.equal(result.selection.renderEpoch,5);assert.equal(result.selection.sceneId,'loading');assert.deepEqual(result.target.nodeIds,['html-node']);assert.equal(result.selection.objects[0].sourceLocator.path,'saved.html');
 const partial=structuredClone(snap);partial.selection.objects[0].outerHTMLTruncated=true;assert.throws(()=>freeze(partial),error=>error.code==='ELEMENT_CONTEXT_INCOMPLETE');
 const large=structuredClone(snap);large.selection.objects[0].outerHTML='中'.repeat(700000);assert.throws(()=>freeze(large),error=>error.code==='ELEMENT_CONTEXT_TOO_LARGE');
});

test('a canvas scene, runtime element, source hash or build change invalidates pending target confirmation even at the same project revision',()=>{
 const snap=sourceSnapshot(),pending={projectId:'p',projectRevision:4,activeDesignId:'mobile',snapshot:snap},current={projectId:'p',projectRevision:4,activeDesignId:'mobile',prompt:snap.prompt,references:snap.references,attachments:snap.attachments,target:snap.target,selection:snap.selection};
 assert.equal(confirmationIsCurrent(pending,current),true);
 for(const mutate of [value=>{value.sceneId='create'},value=>{value.renderEpoch++},value=>{value.documentEpoch='next-document'},value=>{value.artifact.version++},value=>{value.objects[0].outerHTML='changed'},value=>{value.objects[0].sourceLocator.sourceHash='b'.repeat(64)}]){
  const selected=structuredClone(snap.selection);mutate(selected);assert.equal(confirmationIsCurrent(pending,{...current,selection:selected}),false);
 }
});
