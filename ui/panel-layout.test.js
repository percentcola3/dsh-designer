import test from 'node:test';
import assert from 'node:assert/strict';
import {readPanelLayout,savePanelLayout,PANEL_LAYOUT_KEY} from './panel-layout.js';
test('panel preferences use only a dedicated machine key and retain bounded widths',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  savePanelLayout(storage,{groupWidth:999,aiWidth:400,groupOpen:false,irrelevant:'not saved'});
  assert.deepEqual(readPanelLayout(storage),{groupWidth:340,aiWidth:400,groupOpen:false});
  assert.deepEqual([...values.keys()],[PANEL_LAYOUT_KEY]);assert.equal(values.get(PANEL_LAYOUT_KEY).includes('irrelevant'),false);
  values.set(PANEL_LAYOUT_KEY,'broken');assert.deepEqual(readPanelLayout(storage),{groupWidth:216,aiWidth:328,groupOpen:true});
  assert.deepEqual(readPanelLayout({getItem(){throw Error('storage blocked')}}),{groupWidth:216,aiWidth:328,groupOpen:true});
});
