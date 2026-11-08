import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRegionNodeKey,selectedWebsiteNodes,websiteSelectionArgs,providerSelectionArgs,mergeSourceOutline,sourceRefreshArgs,sourceOutlineTree} from './source-selection.js';
test('website node selection keeps URLs, states, viewports and existing regions across pages',()=>{
 const source={pages:[{id:'one',url:'https://a.test',states:[{id:'menu',actions:[{type:'click',selector:'.menu'}]}],scope:'regions',regions:[{id:'manual',rect:{x:0,y:0,width:20,height:20}}]},{id:'two',url:'https://b.test',states:[{id:'other'}],scope:'page'}],viewports:[{id:'phone',width:390,height:844}]};
 const selected=websiteSelectionArgs(source,['one','two'],[sourceRegionNodeKey('one','dom')]);
 assert.deepEqual(selected.pageIds,['one','two']);assert.deepEqual(selected.pages[0].states,source.pages[0].states);assert.deepEqual(selected.pages[1],source.pages[1]);assert.equal(selected.pages[0].regions[0].id,'manual');assert.deepEqual(selected.pages[0].regions[1].nodeIds,['dom']);assert.deepEqual(selected.viewports,source.viewports);assert.equal(source.pages[0].regions.length,1);
 assert.deepEqual(selectedWebsiteNodes({pages:selected.pages}),[sourceRegionNodeKey('one','dom')]);
 assert.throws(()=>websiteSelectionArgs(source,[],[]),{code:'INVALID_SOURCE_SELECTION'});
});
test('official node mode keeps prior selected frame metadata and never sends website page replacements',()=>{
 const record={url:'https://figma.test/file',pages:[{id:'p1',sourceNodeId:'frame',name:'Existing',states:[{id:'state'}]}]};
 const args=providerSelectionArgs(record,'nodes',[],['frame','other'],[{id:'other',name:'Other'}]);assert.deepEqual(args.pages[0].states,record.pages[0].states);assert.equal(args.pages[1].sourceNodeId,'other');assert.equal(args.pages[1].url,record.url);
 assert.deepEqual(providerSelectionArgs(record,'pages',['frame'],[],[]),{pageIds:['p1']});
});
test('outline continuation merges only its actual capture and cycle-safe tree keeps orphan nodes accessible',()=>{
 const first=[{captureId:'a',nodes:[{id:'n1'}],nodeOffset:0},{captureId:'b',nodes:[{id:'b'}]}];
 const next=mergeSourceOutline(first,[{captureId:'a',nodeOffset:1,nextNodeOffset:null,nodes:[{id:'n2',parentId:'n1'}]}]);assert.deepEqual(next[0].nodes.map(n=>n.id),['n1','n2']);assert.equal(next[1].nodes[0].id,'b');assert.equal(first[0].nodes.length,1);
 const tree=sourceOutlineTree([{id:'a',parentId:'b'},{id:'b',parentId:'a'},{id:'orphan',parentId:'unloaded'}]);assert.ok(tree.roots.length>=2);assert.ok(tree.roots.some(n=>n.id==='orphan'));
});
test('fresh reread explicitly identifies source page state viewport while archived comparison remains frozen',()=>{
 const input={sourceId:'source',targetPageId:'target',version:{id:'old',captures:[{id:'oldCapture',pageId:'sourcePage',stateId:'menu',viewportId:'phone'}]},captureId:'oldCapture',nodeIds:['targetNode']};
 const fresh=sourceRefreshArgs({...input,fresh:true});assert.equal(fresh.freshRefresh,true);assert.deepEqual(fresh.captureSelection,{pageId:'sourcePage',stateId:'menu',viewportId:'phone'});
 assert.equal(sourceRefreshArgs({...input,fresh:false}).freshRefresh,undefined);assert.throws(()=>sourceRefreshArgs({...input,captureId:''}),{code:'INVALID_SOURCE_SELECTION'});
});
