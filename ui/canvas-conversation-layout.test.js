import test from 'node:test';
import assert from 'node:assert/strict';
import {CONVERSATION_LAYOUT_KEY,normalizeConversationLayout,readConversationLayout,saveConversationLayout,conversationWidthBounds,fitConversationWidth,draggedConversationWidth} from './canvas-conversation-layout.js';
test('mode and independent widths survive remount while unrelated state is omitted',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 saveConversationLayout(storage,{mode:'sidebar',dockWidth:900,sideWidth:500,prompt:'private draft'});
 assert.deepEqual(readConversationLayout(storage),{mode:'sidebar',dockWidth:900,sideWidth:500});assert.equal(values.has(CONVERSATION_LAYOUT_KEY),true);assert.equal(values.get(CONVERSATION_LAYOUT_KEY).includes('prompt'),false);
});
test('missing, malformed and blocked preferences retain a usable simple panel',()=>{
 const defaults={mode:'dock',dockWidth:760,sideWidth:400};
 assert.deepEqual(readConversationLayout(null),defaults);assert.deepEqual(readConversationLayout({getItem:()=>'{broken'}),defaults);assert.deepEqual(readConversationLayout({getItem(){throw Error('blocked')}}),defaults);
 assert.deepEqual(normalizeConversationLayout({mode:'invalid',dockWidth:null,sideWidth:'bad'}),defaults);
});
test('drag edges preserve a centered simple panel while a sidebar keeps its right edge',()=>{
 assert.equal(draggedConversationWidth(760,40,'right','dock',1440),840);assert.equal(draggedConversationWidth(760,-40,'left','dock',1440),840);
 assert.equal(draggedConversationWidth(400,-40,'left','sidebar',1440),440);assert.equal(draggedConversationWidth(400,40,'left','sidebar',1440),360);
});
test('dragging and viewport changes stay within bounds without overwriting the preferred width',()=>{
 assert.deepEqual(conversationWidthBounds('dock',360),{min:340,max:340});assert.equal(fitConversationWidth(950,'dock',360),340);assert.equal(fitConversationWidth(950,'dock',1440),950);
 assert.equal(draggedConversationWidth(400,-10000,'left','sidebar',1440),720);assert.equal(draggedConversationWidth(400,10000,'left','sidebar',1440),320);
 assert.equal(fitConversationWidth(400,'sidebar',360),336);assert.equal(fitConversationWidth(400,'sidebar',0),0);
});
