import test from 'node:test';
import assert from 'node:assert/strict';
import {hitSelectionIds,pageWithContentHeight,pageWithViewViewport,savedViewportOf,viewportOf,pagePoint,worldPoint,dragPagePosition,zoomAround,rectangle,flowDropIndex,mergeMeasurements,commonValue,relativePath,topmostIds,sharedContext,fitBounds,artifactOf,isFrameworkArtifact,artifactIdentity,assertCanvasOperations,selectionMetadata,frameworkOperations,sourceEditable,sourceDragOperations,requiresSourceTemplateConfirmation,sourceEditMessage} from './geometry.js';

test('temporary device viewports drive frame geometry while retaining saved page settings',()=>{
  const saved={id:'a',viewport:{width:1440,height:1800}},mobile=pageWithViewViewport(saved,{device:'mobile',viewport:{width:390,height:844}});
  assert.deepEqual(viewportOf(mobile),{width:390,height:844});assert.deepEqual(savedViewportOf(mobile),saved.viewport);
  assert.deepEqual(saved.viewport,{width:1440,height:1800});
  assert.equal(pageWithViewViewport(saved,{device:'responsive',viewport:{width:390,height:844}}),saved);
  assert.equal(pageWithViewViewport(saved,{device:'custom',viewport:{width:NaN,height:844}}),saved);
  assert.deepEqual(pagePoint({clientX:195,clientY:100},{left:0,top:0,width:195,height:422},viewportOf(mobile)),{x:390,y:200});
});
test('page and world coordinates account for scale without dividing existing origins',()=>{assert.deepEqual(pagePoint({clientX:260,clientY:140},{left:100,top:40,width:640,height:400},{width:1280,height:800}),{x:320,y:200});assert.deepEqual(worldPoint({clientX:160,clientY:110},{left:10,top:20},{x:50,y:40,zoom:.5}),{x:200,y:100});assert.deepEqual(dragPagePosition({x:800,y:400},{x:50,y:25},.5),{x:900,y:450});assert.deepEqual(dragPagePosition({x:800,y:400},{x:10,y:5},2,8),{x:808,y:400})});
test('pointer anchored zoom keeps the same world point under the cursor',()=>{const prior={x:100,y:60,zoom:.5},point={x:400,y:250},next=zoomAround(prior,2,point);assert.equal((point.x-prior.x)/prior.zoom,(point.x-next.x)/next.zoom);assert.equal((point.y-prior.y)/prior.zoom,(point.y-next.y)/next.zoom);const fit=fitBounds({x:100,y:200,width:400,height:600},{width:1000,height:800});assert.ok(fit.zoom>0&&fit.zoom<=2)});
test('real drag rectangles normalize reverse gestures and clip to document bounds',()=>{assert.deepEqual(rectangle({x:500,y:1800},{x:100,y:1200},{width:1280,height:2400}),{x:100,y:1200,width:400,height:600});assert.deepEqual(rectangle({x:-10,y:50},{x:2000,y:3000},{width:1000,height:2000}),{x:0,y:50,width:1000,height:1950})});
test('flow drop index uses numeric before/after and adjusts after removing moving siblings',()=>{const parent={childIds:['a','b','c'],styles:{display:'flex','flex-direction':'row'}};assert.equal(flowDropIndex({parent,targetId:'c',point:{x:260,y:20},targetBounds:{x:200,y:0,width:80,height:40},movingIds:['a']}),2);assert.equal(flowDropIndex({parent,targetId:'c',point:{x:210,y:20},targetBounds:{x:200,y:0,width:80,height:40},movingIds:['a']}),1);assert.equal(flowDropIndex({parent:{childElements:[{nodeId:null},{nodeId:'a'},{nodeId:'b'}],styles:{}},targetId:'b',point:{x:0,y:20},targetBounds:{x:0,y:30,width:50,height:40},movingIds:['a']}),1)});
test('full multi-selection measurements use canonical saved text, flags and all common values',()=>{const model={nodes:{a:{id:'a',tag:'p',text:'Saved A',style:{color:'red'},attributes:{id:'a'},childIds:[],locked:false},b:{id:'b',tag:'p',text:'Saved B',style:{color:'blue'},attributes:{id:'b'},childIds:[],locked:true}}};const values=mergeMeasurements(['a','b'],model,[{nodeId:'a',text:'untrusted runtime text',styles:{width:'100px',color:'green'},bounds:{x:0,y:0,width:100,height:30}},{nodeId:'b',locked:false,styles:{width:'100px',color:'blue'},bounds:{x:0,y:40,width:100,height:30}}]);assert.equal(values.length,2);assert.equal(values[0].text,'Saved A');assert.equal(values[1].locked,true);assert.deepEqual(commonValue(values,'width'),{value:'100px',mixed:false});assert.deepEqual(commonValue(values,'color'),{value:'',mixed:true})});
test('resource relative URLs encode real percent, spaces and Unicode segments exactly once',()=>{assert.equal(relativePath('designs/Test/pages/home/index.html','designs/Test/assets/a 100%.png'),'../../assets/a%20100%25.png');assert.equal(relativePath('a/index.html','a/示例 图.png'),'%E7%A4%BA%E4%BE%8B%20%E5%9B%BE.png')});
test('shared scope follows explicit root and slot identity, and moving uses selection roots only',()=>{const nodes={root:{id:'root',definitionId:'def-one'},child:{id:'child',parentId:'root',slot:'label'},nested:{id:'nested',parentId:'child'}};assert.deepEqual(sharedContext('child',nodes),{definitionId:'def-one',rootId:'root',isDefinition:true,slot:'label'});assert.deepEqual(topmostIds(['root','child','nested'],nodes),['root']);assert.equal(sharedContext('missing',nodes),null)});
test('framework measurements preserve distinct runtime instances and exact source metadata',()=>{
 const artifact={kind:'react',entry:'src/App.tsx',version:2,buildId:'build-a'},model={artifact,nodes:{one:{id:'one',text:'static wrapper',attributes:{id:'wrong'},style:{color:'red'},locked:true}}};
 const locator={id:'source-button',path:'src/App.tsx',start:40,end:80,line:3,column:2,sourceHash:'hash',native:true};
 const objects=['one','two'].map((id,index)=>({id,nodeId:id,instanceId:id,sourceNodeId:'source-button',sourceLocator:locator,text:`Rendered ${index}`,attributes:{id:`button-${index}`},styles:{color:'blue'},locked:false,documentEpoch:'document-a',renderEpoch:4,sceneId:null,artifact,outerHTML:`<button>${index}</button>`,outerHTMLTruncated:false}));
 const merged=mergeMeasurements(['one','two','gone'],model,objects);
 assert.equal(merged.length,2);assert.deepEqual(merged,objects);assert.equal(merged[0].text,'Rendered 0');assert.equal(merged[0].locked,false);assert.equal(merged[0].sourceLocator,locator);
 assert.deepEqual(selectionMetadata(merged),{documentEpoch:'document-a',renderEpoch:4,sceneId:null,artifact});
});
test('page artifact fallback keeps Vue instance measurements without inventing static nodes',()=>{
 const page={artifact:{kind:'vue',entry:'src/App.vue',version:1,buildId:'vue-a'}},model={nodes:{}};
 assert.equal(isFrameworkArtifact(model,page),true);assert.equal(artifactOf(model,page),page.artifact);
 const instance={nodeId:'runtime-a',instanceId:'runtime-a',sourceNodeId:'template-a',outerHTML:'<div>Vue</div>'};
 assert.deepEqual(mergeMeasurements(['runtime-a'],model,[instance],page),[{...instance,id:'runtime-a'}]);
 assert.deepEqual(mergeMeasurements(['runtime-a'],model,[instance]),[]);
});
test('artifact identity changes with build, version and manifest source hashes',()=>{
 const artifact={kind:'react',entry:'src/App.tsx',version:1,buildId:'a',manifest:[{id:'a',path:'src/App.tsx',start:0,end:10,sourceHash:'h1'}]},identity=artifactIdentity({artifact});
 for(const patch of [{version:2},{buildId:'b'},{manifest:[{...artifact.manifest[0],sourceHash:'h2'}]}])assert.notEqual(artifactIdentity({artifact:{...artifact,...patch}}),identity);
 assert.equal(artifactIdentity({artifact:structuredClone(artifact)}),identity);
});
function sourceObject(id,sourceId=id,extra={}){return {id,nodeId:id,instanceId:id,sourceNodeId:sourceId,sourceLocator:{id:sourceId,path:'src/App.tsx',native:true},sourceInstanceCount:1,styles:{translate:'none'},bounds:{x:0,y:0,width:100,height:40},...extra};}
test('dynamic source edit failures explain the unchanged binding and direct the owner to AI',()=>{for(const code of ['SOURCE_DYNAMIC_TEXT','SOURCE_DYNAMIC_STYLE','SOURCE_DYNAMIC_DUPLICATE','SOURCE_DUPLICATE_KEY','SOURCE_DYNAMIC_DELETE'])assert.match(sourceEditMessage({code,message:'internal detail'}),/AI/);assert.equal(sourceEditMessage({code:'OTHER',message:'保留原错误'}),'保留原错误');});
test('framework operation adapter keeps runtime IDs, null removal and new source operation names',()=>{
 const operations=frameworkOperations([{type:'text',nodeIds:['runtime','runtime'],value:'新文字'},{type:'style',nodeIds:['runtime'],styles:{color:'red','margin-top':null}},{type:'duplicate',nodeIds:['runtime']},{type:'remove',nodeIds:['runtime']}]);
 assert.deepEqual(operations,[{type:'text.set',nodeIds:['runtime'],text:'新文字'},{type:'style.set',nodeIds:['runtime'],styles:{color:'red','margin-top':null}},{type:'node.duplicate',nodeIds:['runtime']},{type:'node.delete',nodeIds:['runtime']}]);
 assert.throws(()=>frameworkOperations([{type:'move',nodeIds:['runtime']}]),error=>error.code==='FRAMEWORK_SOURCE_EDIT_REQUIRED');assert.throws(()=>frameworkOperations([{type:'text.set',nodeIds:[],text:'x'}]),error=>error.code==='SOURCE_SELECTION_REQUIRED');
});
test('source drag adds independent translate without overwriting transform or changing runtime DOM',()=>{
 const object=sourceObject('runtime','source',{styles:{translate:'10% 4px',transform:'none'}}),before=structuredClone(object);
 const ops=sourceDragOperations([object],{x:12,y:7},{snap:8});
 assert.deepEqual(ops,[{type:'style.set',nodeIds:['runtime'],styles:{translate:'26px 12px'}}]);assert.deepEqual(object,before);
 const second=sourceDragOperations([{...object,styles:{translate:'26px 12px'}}],{x:5,y:-2});assert.equal(second[0].styles.translate,'31px 10px');
});
test('source drag moves only selected roots, deduplicates templates and rejects conflicting geometry',()=>{
 const root=sourceObject('r','source-r'),child=sourceObject('c','source-c',{parentId:'r'});
 assert.deepEqual(sourceDragOperations([root,child],{x:4,y:5}).map(operation=>operation.nodeIds),[['r']]);
 assert.equal(sourceDragOperations([root,sourceObject('r2','source-r')],{x:4,y:5}).length,1);
 assert.throws(()=>sourceDragOperations([root,sourceObject('r2','source-r',{styles:{translate:'10px 0px'}})],{x:4,y:5}),error=>error.code==='SOURCE_INSTANCE_STYLE_CONFLICT');
 assert.throws(()=>sourceDragOperations([{...root,transformed:true}],{x:1,y:1}),error=>error.code==='SOURCE_TRANSFORMED_DRAG');
 assert.throws(()=>sourceDragOperations([{...root,styles:{translate:'calc(10% + 1px) 0px'}}],{x:1,y:1}),error=>error.code==='SOURCE_DYNAMIC_POSITION');
 assert.throws(()=>sourceDragOperations([{...root,referenceOnly:true}],{x:1,y:1}),error=>error.code==='SOURCE_MAPPING_REQUIRED');
});
test('shared source templates require explicit confirmation even when one runtime instance is selected',()=>{
 const first=sourceObject('a','source-a');assert.equal(sourceEditable(first),true);assert.equal(requiresSourceTemplateConfirmation([first]),false);
 assert.equal(requiresSourceTemplateConfirmation([{...first,sourceInstanceCount:4}]),true);
 assert.equal(requiresSourceTemplateConfirmation([first,sourceObject('b','source-a')]),true);
 assert.equal(requiresSourceTemplateConfirmation([first,sourceObject('b','source-b')]),false);
 assert.equal(sourceEditable({...first,referenceOnly:true}),false);assert.equal(sourceEditable({...first,sourceLocator:{id:'other',path:'x'}}),false);
});
test('framework source edits are denied before a save while page geometry remains supported',()=>{
 for(const kind of ['react','vue']){
  const model={artifact:{kind},nodes:{}};
  for(const type of ['text','style','move','remove','duplicate','insert','lock','undo','redo','scene.set'])assert.throws(()=>assertCanvasOperations(model,null,[{type}]),error=>error.code==='FRAMEWORK_SOURCE_EDIT_REQUIRED');
  assert.doesNotThrow(()=>assertCanvasOperations(model,null,[{type:'page.position'},{type:'page.viewport'}]));
  assert.throws(()=>assertCanvasOperations({}, {artifact:{kind}}, [{type:'text'}]),error=>error.code==='FRAMEWORK_SOURCE_EDIT_REQUIRED');
 }
 assert.doesNotThrow(()=>assertCanvasOperations({nodes:{}},null,[{type:'text'}]));
});

test('picker clicks toggle multiple elements and a context click preserves the selected group',()=>{
  const first=hitSelectionIds([], 'heading', {additive:true});
  const both=hitSelectionIds(first, 'button', {additive:true});
  assert.deepEqual(both,['heading','button']);
  assert.deepEqual(hitSelectionIds(both,'heading',{additive:true}),['button']);
  assert.deepEqual(hitSelectionIds(both,'heading',{additive:true,context:true}),both);
  assert.deepEqual(hitSelectionIds(both,'input',{additive:true,context:true}),['input']);
  assert.deepEqual(hitSelectionIds(both,'heading'),both);
  assert.deepEqual(hitSelectionIds(both,'heading',{double:true}),['heading']);
});

test('editing frames expand to complete content while preview and saved dimensions stay fixed',()=>{
  const page={id:'long-page',viewport:{width:1440,height:900}};
  const expanded=pageWithContentHeight(page,'edit',42137.4);
  assert.deepEqual(expanded.viewport,{width:1440,height:42138});
  assert.deepEqual(expanded.previewViewport,page.viewport);
  assert.deepEqual(savedViewportOf(expanded),page.viewport);
  assert.equal(pageWithContentHeight(page,'preview',42137.4),page);
  assert.equal(pageWithContentHeight(page,'edit',300),page);
  assert.equal(pageWithContentHeight(page,'edit',NaN),page);
  assert.deepEqual(page.viewport,{width:1440,height:900});
  const mobile=pageWithViewViewport(page,{device:'mobile',viewport:{width:390,height:844}});
  const fullMobile=pageWithContentHeight(mobile,'edit',2500);
  assert.deepEqual(fullMobile.previewViewport,{width:390,height:844});
  assert.deepEqual(savedViewportOf(fullMobile),page.viewport);
});

test('one live page can shrink and grow while retaining its authored viewport units',()=>{
  const page={viewport:{width:1440,height:1000}};
  for(const height of [250,48000,760]){
    const live=pageWithContentHeight(page,'live',height);
    assert.equal(live.viewport.height,height);
    assert.deepEqual(live.previewViewport,page.viewport);
  }
});
