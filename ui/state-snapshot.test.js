import test from 'node:test';
import assert from 'node:assert/strict';
import {compactState} from './state-snapshot.js';

test('persisted recovery keeps identities and positions but excludes nested transport capabilities',()=>{
 const input={tabs:[{id:'p:file:f',type:'file',resourceId:'f',sourceId:'source',path:'src/a.ts',version:'v1',content:'private draft',text:'same draft',assetBase:'/api/designer/resource/cap/',previewUrl:'http://local/cap',downloadUrl:'http://local/download',bytesBase64:'secret',view:{scrollTop:123,zoom:1.5,selection:{ranges:[{anchor:0,head:2}],main:0}}}],activeTabId:'p:file:f',references:[{sourceId:'x',sourceVersion:'xv',sourceSnapshot:{path:'imports/i/preview.png',scope:'viewport',url:'http://local/cap'},screenshot:{exportId:'e',path:'deliveries/e/artifact.png',sha256:'hash',url:'http://local/download'}}]};
 const state=compactState(input),tab=state.tabs[0];
 assert.equal(tab.resourceId,'f');assert.equal(tab.sourceId,'source');assert.equal(tab.path,'src/a.ts');assert.equal(tab.version,'v1');assert.equal(tab.view.scrollTop,123);assert.equal(tab.view.selection.ranges[0].anchor,0);
 for(const key of ['content','text','assetBase','previewUrl','downloadUrl','bytesBase64'])assert.equal(Object.hasOwn(tab,key),false);
 assert.equal(state.references[0].sourceSnapshot.path,'imports/i/preview.png');assert.equal(state.references[0].screenshot.exportId,'e');assert.equal(state.references[0].sourceSnapshot.url,undefined);assert.equal(state.references[0].screenshot.url,undefined);
 assert.equal(input.tabs[0].content,'private draft');
});

test('unsent conversation data and inline bodies never enter view recovery',()=>{
 const state=compactState({prompt:'do not persist here',draft:{prompt:'pending'},messages:[{text:'private'}],attachments:[{receiptId:'r'}],selection:{pageId:'a',nodeIds:['n'],objects:[{outerHTML:'private html'}]},tabs:[{id:'image',resourceId:'f',preview:'data:image/png;base64,secret',view:{paused:false,scrollTop:0}}]});
 assert.equal(state.prompt,undefined);assert.equal(state.draft,undefined);assert.equal(state.messages,undefined);assert.equal(state.attachments,undefined);assert.deepEqual(state.selection,{pageId:'a',nodeIds:['n']});assert.equal(state.tabs[0].preview,undefined);assert.equal(state.tabs[0].view.paused,false);assert.equal(state.tabs[0].view.scrollTop,0);
});
