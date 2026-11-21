import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installEditingLayout} from './bridge.js';

function declaration(values={}){
  const fields=new Map(Object.entries(values)),priorities=new Map();
  return {
    [Symbol.iterator]:()=>fields.keys(),
    getPropertyValue:name=>fields.get(name)||'',
    getPropertyPriority:name=>priorities.get(name)||'',
    setProperty(name,value,priority){fields.set(name,value);priorities.set(name,priority);},
  };
}

function fixture(config={}){
  let mode='preview',height=2504;
  const rule=declaration({'height':'calc(100vh - 60px)','content':'"100vh"','background-image':'url(/asset-100vh.png)'});
  const node=(parentElement,overflowY='visible')=>{
    const attributes=new Map();
    return {parentElement,style:declaration(),scrollHeight:1800,clientHeight:700,clientWidth:1200,overflowY,
      hasAttribute:name=>attributes.has(name),setAttribute:(name,value)=>attributes.set(name,value),
      matches:()=>false,closest:()=>null};
  };
  const body=node(null),wrapper=node(body),scroller=node(wrapper,'auto');
  body.querySelectorAll=()=>[wrapper,scroller];
  Object.defineProperties(body,{scrollHeight:{get:()=>height},offsetHeight:{get:()=>height}});
  body.getBoundingClientRect=()=>({bottom:height});
  const sheets=[{cssRules:[{style:rule}]}];
  let layoutStyle;
  const document={body,documentElement:{get scrollHeight(){return Math.max(900,height);}},styleSheets:sheets,head:{append(style){layoutStyle=style;sheets.push({ownerNode:style,cssRules:[]});}},
    createElement(){return node(null);}};
  const layout=vm.runInNewContext(`(${installEditingLayout.toString()})(config,getMode)`,{
    config:{interactive:true,viewport:{width:1440,height:900},...config},getMode:()=>mode,document,scrollY:0,innerWidth:1440,innerHeight:900,
    getComputedStyle:element=>({overflowY:element.overflowY}),
  });
  return {layout,rule,wrapper,scroller,get layoutStyle(){return layoutStyle;},setMode(value){mode=value;},setHeight(value){height=value;}};
}

test('editing expands nested scrolling content and freezes viewport units without rewriting text or URLs',()=>{
  const f=fixture();
  f.layout.contentHeight();
  assert.equal(f.rule.getPropertyValue('height'),'calc(100vh - 60px)');
  assert.equal(f.scroller.hasAttribute('data-dsh-editor-expand'),false);
  f.setMode('edit');
  assert.equal(f.layout.contentHeight(),2504);
  assert.equal(f.rule.getPropertyValue('height'),'calc(calc(100 * var(--dsh-editor-vh)) - 60px)');
  assert.equal(f.rule.getPropertyValue('content'),'"100vh"');
  assert.equal(f.rule.getPropertyValue('background-image'),'url(/asset-100vh.png)');
  assert.equal(f.scroller.hasAttribute('data-dsh-editor-expand'),true);
  assert.equal(f.wrapper.hasAttribute('data-dsh-editor-expand'),true);
  assert.match(f.layoutStyle.textContent,/--dsh-editor-vh:9px/);
});

test('content measurements shrink after deletion and newly rendered inline viewport units are handled',()=>{
  const f=fixture();f.setMode('edit');
  assert.equal(f.layout.contentHeight(),2504);
  f.setHeight(650);
  assert.equal(f.layout.contentHeight(),900);
  f.scroller.setAttribute('style','');
  f.scroller.style.setProperty('min-height','80dvh','important');
  f.layout.invalidate();f.layout.contentHeight();
  assert.equal(f.scroller.style.getPropertyValue('min-height'),'calc(80 * var(--dsh-editor-dvh))');
  assert.equal(f.scroller.style.getPropertyPriority('min-height'),'important');
});

test('the live HTML canvas expands the page scroller in preview and measures the shorter filtered page',()=>{
  const f=fixture({plainPreview:true});
  const local={...f.scroller,clientWidth:240,clientHeight:150,hasAttribute:()=>false,
    setAttribute:()=>assert.fail('local controls keep their own scroll area')};
  f.wrapper.parentElement.querySelectorAll=()=>[f.wrapper,f.scroller,local];
  assert.equal(f.layout.contentHeight(),2504);
  assert.equal(f.scroller.hasAttribute('data-dsh-editor-expand'),true);
  assert.equal(f.wrapper.hasAttribute('data-dsh-editor-expand'),true);
  f.setHeight(650);
  assert.equal(f.layout.contentHeight(),650);
});
