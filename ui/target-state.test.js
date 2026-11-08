import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTargetScope,targetFromSelection,consumeTargetChoice,selectionForSubmission,sourceTemplateConfirmation} from './target-state.js';
const context={source:'user',projectId:'p',designId:'d',pageId:'a'};
const selection={pageId:'a',nodeIds:['button']};

test('ordinary selection narrows a default generation target to the actual object',()=>{
 const next=targetFromSelection({projectId:'p',designId:'d',scope:'design'},selection,context);
 assert.equal(next.scope,'selection');assert.deepEqual(next.nodeIds,['button']);assert.equal(next.pageId,'a');
});

test('a broad explicit choice lasts one submission and remains bound to its design',()=>{
 const chosen=chooseTargetScope({projectId:'p',designId:'d',scope:'read'},'design','choice-1');
 const same=targetFromSelection(chosen,selection,context);assert.equal(same.scope,'design');
 const other=targetFromSelection(chosen,{pageId:'b',nodeIds:['other']},{...context,designId:'other-design',pageId:'b'});assert.equal(other.scope,'selection');assert.equal(other.scopeChoice,undefined);
 const consumed=consumeTargetChoice(same,same);assert.equal(consumed.scope,'selection');assert.equal(consumed.scopeChoice,undefined);
});

test('source and local exact file targets survive unrelated Canvas selection',()=>{
 for(const target of [{type:'source-file',path:'src/App.jsx',sourceId:'r',scope:'project',sourceWrite:{sourceProjectId:'r',paths:['src/App.jsx']}},{type:'file',path:'README.md',fileId:'f',scope:'project',allowedPaths:['README.md']}]){
  assert.equal(targetFromSelection(target,selection,context),target);
  const switched=targetFromSelection(target,selection,{...context,forceSelection:true});assert.equal(switched.scope,'selection');assert.equal(switched.sourceWrite,undefined);assert.equal(switched.allowedPaths,undefined);assert.equal(switched.path,undefined);
 }
});

test('measurement, invalidation, reference location and unknown view events never change authority',()=>{
 const target={projectId:'p',designId:'d',scope:'read'};
 for(const source of ['measurement','invalidation','locate','view',undefined])assert.equal(targetFromSelection(target,selection,{...context,source}),target);
 assert.equal(targetFromSelection(target,selection,context).scope,'selection');
});

test('explicit readonly analysis remains readonly on a user selection',()=>{
 const target=chooseTargetScope({projectId:'p',designId:'d',scope:'design'},'read','read-choice');
 assert.equal(targetFromSelection(target,selection,context).scope,'read');
});

test('admission completion cannot consume a newer scope choice',()=>{
 const original=chooseTargetScope({projectId:'p',designId:'d',pageId:'a',nodeIds:['button'],scope:'read'},'design','old');
 const newer=chooseTargetScope(original,'project','new');
 assert.equal(consumeTargetChoice(newer,original),newer);
});

test('read-only analysis completion never grants selection writing',()=>{
 const target=chooseTargetScope({projectId:'p',designId:'d',pageId:'a',nodeIds:['button'],scope:'selection'},'read','read-once');
 const next=consumeTargetChoice(target,target);assert.equal(next.scope,'read');assert.equal(next.scopeChoice,undefined);
});

test('changing the selection while admission waits does not extend an old broad choice',()=>{
 const submitted=chooseTargetScope({projectId:'p',designId:'d',pageId:'a',nodeIds:['button'],scope:'read'},'design','once');
 const current=targetFromSelection(submitted,{pageId:'a',nodeIds:['different']},context);
 const next=consumeTargetChoice(current,submitted);assert.equal(next.scope,'selection');assert.deepEqual(next.nodeIds,['different']);assert.equal(next.scopeChoice,undefined);
});

test('active design work keeps its design default after submission and deselection',()=>{
 const current={projectId:'p',designId:'d',scope:'design'};
 assert.equal(targetFromSelection(current,null,{...context,defaultScope:'design'}).scope,'design');
 assert.equal(consumeTargetChoice(current,current,{activeDesignId:'d'}).scope,'design');
 const project=chooseTargetScope(current,'project','all');
 assert.deepEqual(consumeTargetChoice(project,project,{activeDesignId:'d'}),{projectId:'p',designId:'d',scope:'design'});
 const other={projectId:'p',designId:'other',scope:'design'};
 assert.deepEqual(consumeTargetChoice(other,other,{activeDesignId:'d'}),{projectId:'p',designId:'d',scope:'design'});
 const read=chooseTargetScope(current,'read','readonly');
 assert.equal(targetFromSelection(read,null,{...context,defaultScope:'design'}).scope,'read');
});

test('deselecting has no implicit full-design fallback',()=>{
 const next=targetFromSelection({projectId:'p',designId:'d',scope:'design'},null,context);
 assert.equal(next.scope,'read');assert.equal(next.nodeIds,undefined);
});

function sourcePick(){
 const artifact={kind:'react',entry:'designs/d/source-a/App.jsx',version:4,buildId:'build-4'};
 const objects=[1,2].map(i=>({id:`instance-${i}`,nodeId:`instance-${i}`,instanceId:`instance-${i}`,sourceNodeId:'src-button',sourceLocator:{id:'src-button',path:artifact.entry,tag:'button',start:30,end:90,line:2,column:5,sourceHash:'a'.repeat(64)},artifact,documentEpoch:'document-2',renderEpoch:3,sceneId:'list',sourceInstanceCount:2,outerHTML:`<button>${'完整'.repeat(9000)} ${i}</button>`}));
 return {pageId:'a',nodeIds:['instance-1','instance-2'],objects};
}

test('framework targeting keeps source templates and runtime instances as distinct identities',()=>{
 const picked=sourcePick(),next=targetFromSelection({projectId:'p',designId:'d',scope:'read'},picked,context);
 assert.equal(next.scope,'selection');assert.deepEqual(next.nodeIds,['src-button']);assert.deepEqual(next.runtimeNodeIds,['instance-1','instance-2']);assert.equal(next.sourceSelection.sources.length,1);assert.equal(next.sourceSelection.kind,'source-template');assert.equal(next.sourceTemplateConfirmed,undefined);
 const captured=selectionForSubmission(picked,next);assert.equal(captured.artifact.buildId,'build-4');assert.equal(captured.documentEpoch,'document-2');assert.equal(captured.renderEpoch,3);assert.equal(captured.sceneId,'list');assert.equal(captured.objects[0].outerHTML,picked.objects[0].outerHTML);assert.ok(captured.objects[0].outerHTML.length>12000);
 captured.objects[0].outerHTML='changed';assert.notEqual(picked.objects[0].outerHTML,'changed');
});

test('source template acknowledgement is explicit, single submission, and invalidated by new source/build/scene evidence',()=>{
 const picked=sourcePick(),first=targetFromSelection({scope:'read'},picked,context),confirmed={...first,sourceTemplateConfirmed:sourceTemplateConfirmation(picked)};
 assert.equal(consumeTargetChoice(confirmed,confirmed).sourceTemplateConfirmed,undefined);
 assert.equal(chooseTargetScope(confirmed,'page','page-choice').sourceTemplateConfirmed,undefined);
 for(const change of [value=>{value.objects[0].sourceLocator.sourceHash='b'.repeat(64);value.objects[1].sourceLocator.sourceHash='b'.repeat(64)},value=>{for(const row of value.objects)row.artifact.buildId='next-build'},value=>{for(const row of value.objects)row.sceneId='create'}]){
  const next=structuredClone(picked);change(next);const target=targetFromSelection(confirmed,next,context);assert.equal(target.scope,'selection');assert.equal(target.sourceTemplateConfirmed,undefined);assert.notDeepEqual(target.sourceSelection,confirmed.sourceSelection);
 }
});

test('source proof includes the source file and rejects DOM paths as source identity',()=>{
 const picked=sourcePick();picked.objects[1].sourceLocator.path='designs/d/source-a/Card.jsx';
 const proof=sourceTemplateConfirmation(picked);assert.equal(proof.sources.length,2);assert.notEqual(proof.sources[0].path,proof.sources[1].path);
 const forged=sourcePick();for(const row of forged.objects){delete row.sourceLocator;row.path='body > main > button:nth-child(2)';}
 assert.equal(sourceTemplateConfirmation(forged),null);
});
