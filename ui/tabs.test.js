import test from 'node:test';
import assert from 'node:assert/strict';
import {tabReducer,emptyTabs,resourceKey,closeCandidates,tabTitle} from './tabs.js';
const open=(state,id,options={})=>tabReducer(state,{type:'open',tab:{id,name:id,path:'docs/'+id},...options});
test('only disposable preview is replaced; dirty tab cannot be overwritten',()=>{
 let s=open(emptyTabs,'a');s=open(s,'b');assert.deepEqual(s.items.map(t=>t.id),['b']);
 s=tabReducer(s,{type:'update',id:'b',patch:{dirty:true,content:'mine'}});s=open(s,'c');assert.deepEqual(s.items.map(t=>t.id),['b','c']);assert.equal(s.items[0].content,'mine');assert.equal(s.items[0].preview,false);
});
test('keep, pin and duplicate resource opens preserve model and camera',()=>{
 let s=open(emptyTabs,'a');s=tabReducer(s,{type:'update',id:'a',patch:{view:{zoom:2,cursor:33},content:'draft'}});s=tabReducer(s,{type:'pin',id:'a'});s=open(s,'b');s=open(s,'a');assert.equal(s.items.length,2);assert.deepEqual(s.items[0].view,{zoom:2,cursor:33});assert.equal(s.items[0].content,'draft');assert.equal(s.items[0].pinned,true);assert.equal(s.activeId,'a');
});
test('resource identity is project and stable id, not display path or title',()=>{
 const a=resourceKey('p1',{id:'same',type:'file',name:'A'});assert.equal(a,resourceKey('p1',{id:'same',type:'file',name:'Renamed'}));assert.notEqual(a,resourceKey('p2',{id:'same',type:'file'}));assert.notEqual(a,resourceKey('p1',{id:'same',type:'canvas'}));
});
test('close neighbors, reorder and bulk close keep pinned resources',()=>{
 let s=['a','b','c','d'].reduce((s,id)=>open(s,id,{keep:true}),emptyTabs);s=tabReducer(s,{type:'pin',id:'c'});assert.deepEqual(closeCandidates(s,'b','right'),['d']);assert.deepEqual(closeCandidates(s,'b','others'),['a','d']);s=tabReducer(s,{type:'reorder',id:'d',beforeId:'a'});assert.deepEqual(s.items.map(t=>t.id),['d','a','b','c']);s=tabReducer(s,{type:'close',id:'d'});assert.equal(s.activeId,'a');
});
test('restoring full view keeps dirty buffer but clears transient loading',()=>{
 const saved={items:[{id:'a',dirty:true,content:'local',mode:'split',view:{scrollTop:90,selection:{ranges:[{anchor:4,head:8}]}},loading:true}],activeId:'a'};const s=tabReducer(emptyTabs,{type:'restore',state:saved});assert.equal(s.items[0].dirty,true);assert.equal(s.items[0].loading,false);assert.equal(s.items[0].view.scrollTop,90);assert.equal(s.items[0].mode,'split');
});
test('same titled files expose parent path and distinct resources remain separate',()=>{
 const items=[{id:'x',name:'index.html',path:'designs/a/index.html'},{id:'y',name:'index.html',path:'designs/b/index.html'}];assert.equal(tabTitle(items[0],items),'index.html — designs/a');assert.notEqual(tabTitle(items[0],items),tabTitle(items[1],items));
});
