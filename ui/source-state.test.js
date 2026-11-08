import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSourceRecord,hydrateSourceForm,sourceViewTransition,sourceResponseCurrent,sourceFormAfterResponse,normalizeWebsiteURL,pinnedSourceBinding,websitePlanInput,websiteDraftKey,websitePreviewReady} from './source-state.js';
const websiteForm={url:'https://example.com',name:'',width:1440,height:900,faithful:true,pagesText:'',statesText:'',regionsText:'',viewportsText:'',captureScope:'page'};
test('website plans normalize HTTP URLs and reject credentials and invalid JSON with field context',()=>{assert.equal(normalizeWebsiteURL(' https://example.com '),'https://example.com/');for(const url of ['example.com','javascript:alert(1)','ftp://example.com','https://user:pass@example.com'])assert.throws(()=>normalizeWebsiteURL(url),error=>error.code==='SOURCE_FIELD_INVALID'&&error.details.field==='url');assert.throws(()=>websitePlanInput({...websiteForm,statesText:'{'},null),error=>error.details.field==='statesText');assert.throws(()=>websitePlanInput({...websiteForm,width:100},null),error=>error.details.field==='viewportsText');});
test('adaptation freezes a concrete resolved binding and cannot invent an unbound/latest system',()=>{const pin=pinnedSourceBinding({effectiveBinding:{systemId:'s-one',version:4,system:{name:'规范'}}});assert.deepEqual(pin,{systemId:'s-one',version:4,name:'规范'});for(const value of [{systemId:'s-one'},{systemId:'s-one',version:'latest'},{systemId:'s-one',version:4,invalid:true}])assert.equal(pinnedSourceBinding(value),null);assert.throws(()=>websitePlanInput({...websiteForm,faithful:false},null),error=>error.code==='SYSTEM_REQUIRED');const plan=websitePlanInput({...websiteForm,faithful:false},pin);assert.equal(plan.mode,'system-adaptation');assert.equal(plan.systemVersion,4);assert.equal(plan.systemId,'s-one');assert.equal(websitePlanInput(websiteForm,pin).systemId,undefined);});
test('replication requires displayed proof for the exact URL options source version capture and target design',()=>{const key=websiteDraftKey(websiteForm),preview={draftKey:key,sourceId:'x-one',versionId:'xv-one',captureId:'xc-one',image:'/frozen'};const current={draftKey:key,sourceId:'x-one',versionId:'xv-one',captureId:'xc-one',designId:'d-one',seen:true};assert.equal(websitePreviewReady(preview,current),true);for(const patch of [{seen:false},{designId:null},{sourceId:'x-other'},{versionId:'xv-other'},{captureId:'xc-other'},{draftKey:websiteDraftKey({...websiteForm,url:'https://different.test'})}])assert.equal(websitePreviewReady(preview,{...current,...patch}),false);const pin={systemId:'s-one',version:4};assert.notEqual(websiteDraftKey({...websiteForm,faithful:false},pin),websiteDraftKey({...websiteForm,faithful:false},{...pin,version:5}));});
const source={id:'b',kind:'mastergo',name:'Mobile library',url:'https://mastergo.com/file/b',mode:'system-adaptation',pages:[{id:'page',sourceNodeId:'frame',url:'https://mastergo.com/file/b',selected:true,scope:'regions',regions:[{rect:{x:0,y:0,width:300,height:600}}],states:[{name:'menu',actions:[]}]}],viewports:[{id:'phone',width:390,height:844}],latestVersionId:'v-b'};

test('a new source form never silently selects the first archived source',()=>{
 assert.equal(selectSourceRecord([source]),null);assert.equal(selectSourceRecord([source],'missing'),null);assert.equal(selectSourceRecord([source],'b'),source);
});

test('an explicit source selection hydrates its provider, URL, scope and viewport together',()=>{
 const form=hydrateSourceForm(source);
 assert.equal(form.source,'mastergo');assert.equal(form.url,source.url);assert.equal(form.name,'Mobile library');assert.equal(form.faithful,false);assert.deepEqual(form.selected,['frame']);assert.equal(form.width,390);assert.equal(form.height,844);assert.equal(form.captureScope,'regions');assert.equal(form.versionId,'v-b');assert.match(form.statesText,/menu/);assert.match(form.regionsText,/300/);
});

test('same-source acquisition metadata cannot overwrite form edits made while it waited',()=>{
 const edited={...hydrateSourceForm(source),name:'Unsaved name',url:'https://mastergo.com/file/next',faithful:true};
 assert.equal(sourceFormAfterResponse('b',{...source,name:'Server old name'},edited),edited);
 const next=sourceFormAfterResponse('b',{id:'c',kind:'figma'},edited);
 assert.equal(next.source,'figma');assert.equal(next.name,'');assert.equal(next.url,'');assert.equal(next.versionId,'');assert.deepEqual(next.selected,[]);
});

test('a slow A response cannot select B or change its preview',()=>{
 const a={sourceId:'a',sequence:1},ticket={...a,requestId:7};
 const b=sourceViewTransition(a,'b');
 assert.equal(sourceResponseCurrent(ticket,b,7,'a'),false);assert.equal(sourceResponseCurrent(ticket,b,8,'b'),false);
 assert.equal(sourceResponseCurrent(ticket,a,7,'a'),true);
});

test('new-source adoption is allowed only for the still-current initiating view',()=>{
 const view={sourceId:null,sequence:0},ticket={...view,requestId:1};
 assert.equal(sourceResponseCurrent(ticket,view,1,'created',{createsSource:true}),true);
 assert.equal(sourceResponseCurrent(ticket,sourceViewTransition(view,'other'),2,'created',{createsSource:true}),false);
 assert.equal(sourceResponseCurrent(ticket,view,1,'created'),false);
});

test('switching frozen versions invalidates older requests even for the same source',()=>{
 const view={sourceId:'a',sequence:1},ticket={...view,requestId:1};
 assert.equal(sourceResponseCurrent(ticket,sourceViewTransition(view,'a'),2,'a'),false);
 assert.equal(sourceResponseCurrent(ticket,view,2,'a'),false);
});
