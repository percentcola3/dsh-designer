import test from 'node:test';
import assert from 'node:assert/strict';
import {systemVersionDraft,parseSystemVersionDraft,systemVersionForm,systemVersionDraftKey,systemVersionDraftFingerprint,hasSystemVersionChanges,applySystemResourceDraft} from './system-version.js';
test('history switching starts from authoritative metadata while kept version drafts restore independently',()=>{
 const v1={version:1,tokens:{old:true},resources:[{id:'r',logicalPath:'a.txt',path:'resources/old/a.txt'}]},v2={version:2,tokens:{current:true},resources:[]};
 const system={id:'s',name:'Saved name',description:'Saved description',platforms:['web'],revision:2,versions:[v1,v2]};
 const form=systemVersionForm(system,v2);assert.equal(hasSystemVersionChanges(form),false);
 const dirty={...form,name:'Draft name',description:'Draft description',resourceDrafts:{'a.txt':{content:'draft'}}};
 const history=systemVersionForm(dirty.sourceSystem,v1);
 assert.equal(history.name,'Saved name');assert.equal(history.description,'Saved description');assert.equal(history.editingVersion,1);assert.deepEqual(history.resourceDrafts,{});
 const restored=systemVersionForm(system,v2,dirty);assert.equal(restored.name,'Draft name');assert.deepEqual(restored.resourceDrafts,dirty.resourceDrafts);assert.equal(hasSystemVersionChanges(restored),true);
 assert.deepEqual(system.versions[0].resources,v1.resources);
});

test('draft apply updates only the selected logical resource and preserves complete historical metadata',()=>{
  const old={version:2,tokens:{color:'old'},guidelines:'old',examples:[{path:'examples/card.md'}],skeletons:[{id:'shell'}],variables:{space:4},resources:[{id:'card',logicalPath:'examples/card.md',path:'resources/old/examples/card.md',sha256:'old'},{id:'icon',logicalPath:'assets/icon.png',path:'resources/old/assets/icon.png'}]};
  const draft={id:'s',name:'Brand',...systemVersionDraft(old),resourceDrafts:{'examples/card.md':{content:'new'}}};
  draft.baseline=systemVersionDraftFingerprint({...draft,resourceDrafts:{}});
  assert.equal(hasSystemVersionChanges(draft),true);
  assert.throws(()=>parseSystemVersionDraft(draft),{code:'SYSTEM_RESOURCE_DRAFT_PENDING'});
  const applied=applySystemResourceDraft(draft,0,{id:'card',logicalPath:'examples/card.md',path:'examples/card.md',content:'new'});
  assert.equal(applied.resources[0].content,'new');assert.deepEqual(applied.resources[1],old.resources[1]);assert.deepEqual(applied.resourceDrafts,{});
  assert.equal(hasSystemVersionChanges(applied),true);assert.equal(draft.resources[0].sha256,'old');assert.equal(old.resources[0].content,undefined);
  for(const key of ['tokens','examples','skeletons','variables'])assert.deepEqual(parseSystemVersionDraft(applied)[key],old[key]);
  assert.throws(()=>applySystemResourceDraft(draft,1,applied.resources[0]),{code:'SYSTEM_RESOURCE_DRAFT_CONFLICT'});
  assert.notEqual(systemVersionDraftKey(draft),systemVersionDraftKey({...draft,editingVersion:3}));
  assert.notEqual(systemVersionDraftKey(draft),systemVersionDraftKey({...draft,id:'other'}));
  const clean={...applied};clean.baseline=systemVersionDraftFingerprint(clean);assert.equal(hasSystemVersionChanges(clean),false);
});

test('historical editing loads and saves one complete system version rather than latest hidden metadata',()=>{
  const old={version:1,tokens:{color:'blue'},guidelines:'Old rule',examples:[{name:'Old card'}],skeletons:[{name:'Old shell'}],variables:{spacing:4},resources:[{id:'icon',path:'icons/old.svg'}]};
  const draft=systemVersionDraft(old),content=parseSystemVersionDraft(draft);
  assert.equal(draft.resourceVersion,1);assert.equal(draft.editingVersion,1);
  for(const key of ['tokens','examples','skeletons','variables'])assert.deepEqual(content[key],old[key]);
  draft.resources[0].path='changed.svg';assert.equal(old.resources[0].path,'icons/old.svg');
  draft.examples='[]';assert.deepEqual(parseSystemVersionDraft(draft).examples,[]);
  draft.skeletons='bad';assert.throws(()=>parseSystemVersionDraft(draft),error=>error.code==='INVALID_SYSTEM_JSON'&&error.details.field==='skeletons');
  assert.throws(()=>parseSystemVersionDraft({...systemVersionDraft(),tokens:'null'}),{code:'INVALID_SYSTEM_JSON'});
});
