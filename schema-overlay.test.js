import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {compilePageSchema} from './schema-compiler.js';
import {validatePageSchema} from './page-schema.js';
import {normalizeDocument} from './document-model.js';

function fixture(use,props={},events){
  return {
    schemaVersion:1,id:'settings',root:'overlay',
    nodes:{overlay:{kind:'component',use,...(events?{events}:{}),props:{title:'设置',actions:[
      {id:'cancel',text:'取消',action:'cancel'},
      {id:'confirm',text:'确定',action:'confirm'},
    ],...props}}},
    state:{dismissals:[]},
    actions:{
      cancel:{type:'collection.append',path:'dismissals',value:{id:'cancel'}},
      dismissed:{type:'collection.append',path:'dismissals',value:{id:'explicit'}},
      confirm:[{type:'state.set',path:'saved',value:true},{type:'overlay.close',target:'overlay'}],
    },
    scenes:{open:{name:'查看设置',ui:{overlay:{open:true}}}},
  };
}
const binding={manifest:{components:[{tag:'ds-dialog'},{tag:'ds-drawer'},{tag:'ds-button'}]}};

test('native and WC dialog/drawer headers have one labeled close control and independently keep their footer actions',()=>{
  for(const use of ['dialog','drawer'])for(const options of [{},{binding}]){
    const source=fixture(use,{closeLabel:'退出设置'});
    const {nodes}=normalizeDocument(compilePageSchema(source,options).html);
    const close=nodes['overlay:header:close'];
    assert.equal(close.tag,'button');
    assert.equal(close.attributes.type,'button');
    assert.equal(close.attributes['aria-label'],'退出设置');
    assert.ok(Object.hasOwn(close.attributes,'data-overlay-close'));
    assert.ok(Object.hasOwn(close.attributes,'data-ds-close'));
    assert.deepEqual(nodes['overlay:header'].childIds,['overlay:title','overlay:header:close']);
    assert.equal(nodes[options.binding?'overlay:dialog':'overlay'].attributes['aria-labelledby'],'overlay:title');
    source.nodes.overlay.props.closable=false;
    const hidden=normalizeDocument(compilePageSchema(source,options).html).nodes;
    assert.equal(hidden['overlay:header:close'],undefined);
    assert.ok(hidden['overlay:cancel']&&hidden['overlay:confirm']);
  }
});

test('invalid overlay button options identify the failing property',()=>{
  for(const [field,value] of [['closable','false'],['closeLabel',' ']]){
    const result=validatePageSchema(fixture('dialog',{[field]:value}));
    assert.equal(result.valid,false);
    assert.ok(result.diagnostics.some(item=>item.path==='nodes.overlay.props.'+field));
  }
});

function runtimeFixture(use,wc,explicit){
  const built=compilePageSchema(fixture(use,{},explicit?{close:'dismissed'}:undefined),wc?{binding}:{});
  const listeners=new Map(),window={__DSH_DESIGN_RUNTIME__:{}};
  const native={localName:'dialog',open:false};
  const host=wc?{localName:'ds-'+use,open:false}:native;
  Object.assign(host,{
    dataset:{schemaDefinition:'overlay',schemaOwner:'overlay',dshNode:'overlay'},
    firstElementChild:wc?native:null,
    closest:selector=>selector==='[data-schema-definition]'?host:null,
    hasAttribute:key=>key==='open'&&host.open,
    toggleAttribute(){},
    showModal(){host.open=true;native.open=true;},
    close(){host.open=false;native.open=false;},
  });
  if(wc)native.closest=selector=>selector==='[data-schema-definition]'?host:null;
  const document={
    readyState:'complete',documentElement:{dataset:{}},
    addEventListener(type,listener){listeners.set(type,listener);},
    querySelector:selector=>selector==='[data-dsh-node="overlay"]'?host:null,
    querySelectorAll:selector=>selector==='[data-schema-definition]'?[host]:[],
  };
  const script=built.html.match(/<script[^>]*data-dsh-schema-runtime[^>]*>([\s\S]*?)<\/script>/)[1];
  runInNewContext(script,{window,document,crypto:globalThis.crypto,structuredClone,clearTimeout,setTimeout});
  const dispatch=(type,target)=>listeners.get(type)({target,preventDefault(){}});
  const dismissButton={closest:selector=>selector==='[data-schema-dismiss]'?dismissButton:selector==='[data-schema-definition]'?host:null};
  return {api:window.__DSH_SCHEMA_RUNTIME__,native,host,dispatch,dismissButton};
}

test('native Escape/close, WC close and header clicks update the same scene exactly once; queued close cannot cancel a reopened overlay',()=>{
  for(const wc of [false,true])for(const explicit of [false,true]){
    const {api,native,host,dispatch,dismissButton}=runtimeFixture(wc?'drawer':'dialog',wc,explicit);
    api.setScene('open');
    dispatch('click',dismissButton);
    dispatch('close',native);
    if(wc)dispatch('ds-close',host);
    api.render();
    assert.equal(host.open,false);
    assert.deepEqual([...api.getState().schemaState.dismissals].map(row=>row.id),[explicit?'explicit':'cancel']);
    api.setScene('open');
    native.open=false; // Browser default action for Escape has closed the native dialog.
    dispatch('close',native);
    if(wc)dispatch('ds-close',host);
    api.render();
    assert.equal(host.open,false);
    assert.equal(api.getState().schemaState.dismissals.length,1);
    api.setScene('open');
    dispatch('close',native); // Delayed close event from a previous showing.
    assert.equal(api.getState().schemaUI.overlay.open,true);
    api.execute('confirm');
    dispatch('close',native);
    assert.equal(api.getState().schemaState.dismissals.length,0);
    assert.equal(api.getState().schemaState.saved,true);
  }
});
