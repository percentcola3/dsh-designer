import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'parse5';
import {normalizeDocument,applyDocumentOperations,validateDocument,resolveReferences,exportDocument,interactionRuntimeSource,documentOperationsHelp} from './document-model.js';
const page=body=>'<!doctype html><html><head><title>Design</title></head><body>'+body+'</body></html>';
const make=body=>normalizeDocument(page(body));
const id=(model,domId)=>Object.values(model.nodes).find(n=>n.attributes.id===domId)?.id;
const code=value=>error=>error?.code===value;
const apply=(model,ops,options={})=>applyDocumentOperations(typeof model==='string'?model:model.html,ops,options);
const node=(model,domId)=>model.nodes[id(model,domId)];

test('whole-page transactions resolve pending scene references before final strict validation',()=>{
  const html=page('<p data-dsh-node="label">Ready</p><script id="dsh-document-model" type="application/json">'+JSON.stringify({schemaVersion:1,scenes:{active:'default',items:[]}})+'</script>');
  const operations=[{type:'scene.set',scene:{id:'default',name:'Default',nodes:{}}}];
  assert.throws(()=>apply(html,operations),code('INVALID_DOCUMENT'));
  const result=apply(html,operations,{allowPendingScenes:true});
  assert.equal(result.scenes.active,'default');assert.equal(result.scenes.items.length,1);
  assert.equal(validateDocument(result.html).valid,true);
  assert.throws(()=>apply(html,[],{allowPendingScenes:true,strict:false}),code('INVALID_DOCUMENT'));
  assert.throws(()=>apply(html,operations,{allowPendingScenes:true,scopeMode:'selection',scopeNodeIds:['label']}),code('INVALID_SCOPE'));
  const malformed=html.replace('"schemaVersion":1','"schemaVersion":2');
  assert.throws(()=>apply(malformed,operations,{allowPendingScenes:true}),code('INVALID_DOCUMENT'));
});

test('legacy HTML gets deterministic identities and normalize is idempotent',()=>{
  const html=page('<main id="app"><p>Same</p><p>Same</p></main>');const a=normalizeDocument(html),b=normalizeDocument(html);
  assert.deepEqual(Object.keys(a.nodes),Object.keys(b.nodes));assert.equal(normalizeDocument(a.html).html,a.html);
  const c=normalizeDocument(page('<main id="app"><p>Different</p><p>Same</p></main>'));
  assert.notDeepEqual(Object.keys(a.nodes),Object.keys(c.nodes));assert.ok(!node(a,'app').text.includes('function boot'));
  assert.ok(a.html.includes('application/json'));assert.ok(a.html.includes('window.__DSH_DESIGN_RUNTIME__'));
});

test('ordinary text and style transactions retain all existing identities and original head scripts',()=>{
  const a=normalizeDocument('<!doctype html><html><head><script>window.userCode=1;</script><style>.card{color:blue}</style></head><body><h1 id="title">Hello</h1><div id="side">Unchanged</div></body></html>');
  const b=apply(a,[{type:'text',nodeIds:[id(a,'title')],value:'Edited'},{type:'style',nodeIds:[id(a,'title')],styles:{color:'#123',fontSize:24,padding:'8px 12px',borderRadius:8,boxShadow:'0 2px 6px #0002'}}]);
  assert.equal(node(b,'title').text,'Edited');assert.equal(node(b,'title').style['font-size'],'24px');assert.deepEqual(Object.keys(a.nodes),Object.keys(b.nodes));assert.equal(node(b,'side').hash,node(a,'side').hash);assert.ok(b.html.includes('window.userCode=1;'));assert.ok(b.html.includes('.card{color:blue}'));
});

test('previous HTML uses only explicit identities and unique exact anchors, never similar cards',()=>{
  const a=make('<main id="root"><article>Same</article><article>Same</article><b id="anchor">Before</b></main>');
  const b=normalizeDocument(page('<main id="root"><article>Same</article><article>Same</article><b id="anchor">After</b></main>'),{previousHtml:a.html});
  assert.equal(id(a,'root'),id(b,'root'));assert.equal(id(a,'anchor'),id(b,'anchor'));
  const oldCards=Object.values(a.nodes).filter(n=>n.tag==='article').map(n=>n.id),newCards=Object.values(b.nodes).filter(n=>n.tag==='article').map(n=>n.id);assert.ok(oldCards.every(x=>!newCards.includes(x)));
  const explicit=make('<section data-dsh-node="src-abc123">Source</section>');assert.ok(explicit.nodes['src-abc123']);
});

test('duplicate stable and DOM identities, malformed attributes and stale references reject saving',()=>{
  assert.equal(validateDocument(page('<p data-dsh-node="n-one">A</p><p data-dsh-node="n-one">B</p>')).valid,false);
  assert.equal(validateDocument(page('<p id="dup">A</p><p id="dup">B</p>')).valid,false);
  assert.throws(()=>normalizeDocument(page('<p class="a" class="b">Text</p>')),code('INVALID_DOCUMENT'));
  const a=make('<button id="go">Go</button><div id="panel">Panel</div>');
  assert.throws(()=>apply(a,[{type:'interaction.set',interaction:{id:'i-broken',type:'modal',sourceId:id(a,'go'),targetId:'n-missing'}}]),code('NODE_NOT_FOUND'));
});

test('multi-selection only edits granted descendants and cannot mutate ancestor or sibling',()=>{
  const a=make('<main id="parent"><section id="selected"><p id="a">A</p><p id="b">B</p></section><aside id="outside">Outside</aside></main>');
  const options={scopeMode:'selection',scopeNodeIds:[id(a,'selected')]};
  const b=apply(a,[{type:'style',nodeIds:[id(a,'a'),id(a,'b')],styles:{color:'red'}}],options);assert.equal(node(b,'a').style.color,'red');assert.equal(node(b,'outside').hash,node(a,'outside').hash);
  for(const target of ['parent','outside'])assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,target)],value:'No'}],options),code('SCOPE_DENIED'));
  assert.throws(()=>apply(a,[{type:'style',nodeIds:[id(a,'a')],styles:{color:'red'}}],{scopeMode:'read'}),code('SCOPE_DENIED'));
});

test('a failed batch is atomic and subtree hash guards reject stale regional refresh',()=>{
  const a=make('<p id="a">A</p><p id="b">B</p>'),original=a.html;
  assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,'a')],value:'Unsaved'},{type:'text',nodeIds:['n-gone'],value:'Bad'}]),code('NODE_NOT_FOUND'));assert.equal(a.html,original);
  const b=apply(a,[{type:'text',nodeIds:[id(a,'a')],value:'User changed'}]);
  assert.throws(()=>apply(b,[{type:'replace',nodeIds:[id(a,'a')],expectedHash:node(a,'a').hash,html:'<p id="a">Source refreshed</p>'}]),code('NODE_VERSION_CONFLICT'));
});

test('locks are inherited and only explicit authorized unlock can clear them',()=>{
  const a=make('<section id="group" data-dsh-locked="true"><p id="child">Locked</p></section>');assert.equal(node(a,'child').locked,true);
  assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,'child')],value:'No'}]),code('LOCKED_NODE'));
  assert.throws(()=>apply(a,[{type:'lock',nodeIds:[id(a,'group')],locked:false}]),code('LOCKED_NODE'));
  const b=apply(a,[{type:'lock',nodeIds:[id(a,'group')],locked:false},{type:'text',nodeIds:[id(a,'child')],value:'Allowed'}],{allowUnlock:true});assert.equal(node(b,'child').locked,false);
  assert.throws(()=>apply(a,[{type:'attributes',nodeIds:[id(a,'group')],attributes:{'data-dsh-locked':null}}]),code('LOCKED_NODE'));
});

test('text leaf edits preserve nested markup unless direct text mode was explicitly requested',()=>{
  const a=make('<p id="p">Before <strong id="strong">nested</strong> after</p>');
  assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,'p')],value:'Would delete strong'}]),code('TEXT_NOT_LEAF'));
  const b=apply(a,[{type:'text',nodeIds:[id(a,'p')],value:'Updated ',mode:'direct'}]);assert.equal(node(b,'strong').text,'nested');assert.equal(id(a,'strong'),id(b,'strong'));
});

test('responsive styling, image attributes and hiding are part of real saved HTML',()=>{
  const a=make('<img id="image" src="assets/a.png" alt="Old"><div id="box">Box</div>');
  const b=apply(a,[{type:'attributes',nodeIds:[id(a,'image')],attributes:{src:'assets/b.png',alt:'New'}},{type:'style',nodeIds:[id(a,'box')],styles:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}},{type:'style',nodeIds:[id(a,'box')],styles:{gridTemplateColumns:'1fr'},breakpoint:'mobile'},{type:'visibility',nodeIds:[id(a,'image')],hidden:true}]);
  assert.equal(node(b,'image').attributes.src,'assets/b.png');assert.equal(node(b,'image').attributes.hidden,'');assert.equal(node(b,'image').attributes['data-dsh-hidden'],'true');assert.ok(b.html.includes('@media (max-width:767px)'));assert.equal(b.responsive[id(a,'box')].mobile['grid-template-columns'],'1fr');
  const c=apply(b,[{type:'visibility',nodeIds:[id(a,'image')],hidden:false}]);assert.equal(node(c,'image').hidden,false);
});

test('native hidden stays script controlled while explicit editor visibility remains authoritative',()=>{
  const source=page('<style>.panel{display:flex}@media(max-width:600px){.panel{display:none}}</style><div id="native" class="panel" hidden>Feedback</div><script>document.getElementById("native").hidden=false;</script>');
  const a=normalizeDocument(source);assert.equal(node(a,'native').hidden,true);assert.equal(node(a,'native').attributes['data-dsh-hidden'],undefined);assert.equal(normalizeDocument(a.html).html,a.html);
  const b=apply(a,[{type:'visibility',nodeIds:[id(a,'native')],hidden:true},{type:'style',nodeIds:[id(a,'native')],styles:{display:'grid'},breakpoint:'mobile'}]);
  assert.equal(node(b,'native').attributes['data-dsh-hidden'],'true');assert.ok(b.html.indexOf('@media (max-width:767px)')<b.html.indexOf('[data-dsh-hidden="true"]{display:none!important}'));
  assert.equal(node(apply(b,[{type:'visibility',nodeIds:[id(b,'native')],hidden:false}]),'native').attributes['data-dsh-hidden'],undefined);
  assert.ok(a.html.includes('document.getElementById("native").hidden=false;'));
});

test('runtime reveal preserves CSS responsive display and does not erase explicit editor visibility',()=>{
  let a=make('<button id="go">Open</button><div id="panel" hidden>Panel</div>');a=apply(a,[{type:'interaction.set',interaction:{id:'i-open',type:'modal',sourceId:id(a,'go'),targetId:id(a,'panel')}}]);
  const dom=runtimeDOM(a.html);dom.window.getComputedStyle=()=>({display:'none'});dom.get('go').dispatch('click');assert.equal(dom.get('panel').hidden,false);assert.equal(dom.get('panel').style.getPropertyValue('display'),'');assert.equal(dom.get('panel').getAttribute('data-dsh-hidden'),null);
  const explicit=apply(a,[{type:'visibility',nodeIds:[id(a,'panel')],hidden:true}]),other=runtimeDOM(explicit.html);other.get('go').dispatch('click');assert.equal(other.get('panel').getAttribute('data-dsh-hidden'),'true');assert.equal(other.get('panel').hidden,true);assert.equal(other.get('panel').getAttribute('aria-hidden'),'true');
});

test('resource validation reports local uncertainty, missing assets and unsafe schemes',()=>{
  const html=page('<link rel="stylesheet" href="styles/a.css"><img id="a" src="assets/a.png"><div style="background-image:url(assets/b.svg)"></div><style>@font-face{font-family:Demo;src:url(fonts/demo.woff2)}</style>');
  const unverified=validateDocument(html);assert.equal(unverified.valid,true);assert.ok(unverified.diagnostics.some(d=>d.code==='UNVERIFIED_RESOURCE'));
  const failed=validateDocument(html,{resourceExists:url=>!url.endsWith('.woff2')});assert.equal(failed.valid,false);assert.ok(failed.resources.some(r=>r.url==='assets/b.svg'));
  assert.equal(validateDocument(page('<img src="file:///private/secret.png">')).valid,false);
});

test('insert, move, duplicate and remove preserve flow and make deleted references invalid',()=>{
  const a=make('<main id="root"><div id="a"><span id="leaf">A</span></div><div id="b">B</div></main>');
  const b=apply(a,[{type:'insert',parentId:id(a,'root'),index:1,html:'<section id="inserted">Inserted</section>'},{type:'move',nodeIds:[id(a,'b')],parentId:id(a,'a'),index:1}]);
  assert.equal(node(b,'b').parentId,id(a,'a'));assert.equal(node(b,'b').style.position,undefined);assert.equal(node(b,'root').childIds[1],id(b,'inserted'));
  const c=apply(b,[{type:'duplicate',nodeIds:[id(a,'a')]}]);assert.equal(c.changes.insertedNodeIds.length,3);assert.ok(c.changes.insertedNodeIds.every(x=>!a.nodes[x]));assert.ok(Object.values(c.nodes).some(n=>n.attributes.id?.startsWith('leaf-copy-')));
  const d=apply(c,[{type:'remove',nodeIds:[id(a,'leaf')]}]);const refs=resolveReferences(d,[id(a,'leaf'),{nodeId:id(a,'b'),kind:'selection'}]);assert.equal(refs.invalid.length,1);assert.equal(refs.resolved.length,1);
});

test('batch copies fill data and provide predictable IDs while remapping controls and scenes',()=>{
  const source=normalizeDocument(page('<main data-dsh-node="list"><section data-dsh-node="row"><label for="name">姓名</label><input id="name" data-dsh-node="name" value="张明"><span data-dsh-node="title">张明</span><button data-dsh-node="open">展开</button><p data-dsh-node="detail" hidden>内容</p></section></main>'));
  const a=apply(source,[{type:'interaction.set',interaction:{id:'toggle',type:'toggle',sourceId:'open',targetId:'detail'}},{type:'scene.set',scene:{id:'details',name:'详情',nodes:{detail:{hidden:false}}}}]);
  const b=apply(a,[{type:'duplicate',nodeIds:['row'],copies:[
    {prefix:'second',nodes:{row:{attributes:{'data-record':'2'}},title:{text:'李晓'},name:{attributes:{value:'李晓'}}}},
    {prefix:'third',nodes:{title:{text:'王敏'},detail:{styles:{color:'#123456'}}}},
  ]},{type:'text',nodeIds:['third:title'],value:'王敏 · 已确认'}]);
  assert.deepEqual(b.nodes.list.childIds,['row','second:row','third:row']);
  assert.equal(b.nodes.title.text,'张明');assert.equal(b.nodes['second:title'].text,'李晓');
  assert.equal(b.nodes['third:title'].text,'王敏 · 已确认');assert.equal(b.nodes['second:name'].attributes.value,'李晓');
  assert.equal(b.nodes['second:row'].attributes['data-record'],'2');assert.equal(b.nodes['third:detail'].style.color,'#123456');
  const label=Object.values(b.nodes).find(n=>n.parentId==='second:row'&&n.tag==='label');
  assert.equal(label.attributes.for,b.nodes['second:name'].attributes.id);assert.notEqual(label.attributes.for,'name');
  assert.ok(b.interactions.some(i=>i.sourceId==='second:open'&&i.targetId==='second:detail'));
  assert.equal(b.scenes.items[0].nodes['third:detail'].hidden,false);
  assert.equal(b.changes.copies[0].nodeIdMap.title,'second:title');assert.equal(b.changes.copies[1].rootId,'third:row');
  assert.equal(validateDocument(b.html).valid,true);
});

test('copy data cannot target other subtrees, overwrite identities or bypass locked/shared fields',()=>{
  const a=normalizeDocument(page('<section data-dsh-node="row"><span data-dsh-node="name" data-dsh-slot="name">Name</span></section><aside data-dsh-node="outside">Outside</aside>'));
  for(const copies of [
    [{prefix:'one',nodes:{outside:{text:'No'}}}],
    [{prefix:'one'},{prefix:'one'}],
    [{prefix:'one',nodes:{name:{attributes:{'data-dsh-node':'outside'}}}}],
    [{prefix:'one',nodes:{name:{attributes:{onclick:'bad()'}}}}],
  ])assert.throws(()=>apply(a,[{type:'duplicate',nodeIds:['row'],copies}]));
  assert.equal(a.nodes.outside.text,'Outside');
  const locked=apply(a,[{type:'lock',nodeIds:['name'],locked:true}]);
  assert.throws(()=>apply(locked,[{type:'duplicate',nodeIds:['row'],copies:[{prefix:'one',nodes:{name:{text:'No'}}}]}]),code('LOCKED_NODE'));
  const shared=apply(a,[{type:'definition.set',definition:{id:'def',rootId:'row',instanceIds:[]}}]);
  const copied=apply(shared,[{type:'duplicate',nodeIds:['row'],scope:'instance',copies:[{prefix:'one',nodes:{name:{text:'Local'}}}]}]);
  const propagated=apply(copied,[{type:'text',nodeIds:['name'],scope:'definition',value:'Shared'}]);
  assert.equal(propagated.nodes.name.text,'Shared');assert.equal(propagated.nodes['one:name'].text,'Local');
});

test('copies reconnect native form ownership, datalists and component ID triggers',()=>{
  const a=make('<section id="source"><form id="form"></form><input id="field" form="form" list="choices" aria-errormessage="error"><datalist id="choices"><option value="A"></option></datalist><p id="error">说明</p><button id="open" data-ds-open="panel" data-ds-show="notice" aria-controls="panel">打开</button><div id="panel">面板</div><div id="notice">提示</div></section>');
  const b=apply(a,[{type:'duplicate',nodeIds:[id(a,'source')],copies:[{prefix:'copy'}]}]),map=b.changes.copies[0].nodeIdMap;
  const copied=domId=>b.nodes[map[id(a,domId)]].attributes;
  assert.equal(copied('field').form,copied('form').id);assert.equal(copied('field').list,copied('choices').id);
  assert.equal(copied('field')['aria-errormessage'],copied('error').id);
  assert.equal(copied('open')['data-ds-open'],copied('panel').id);assert.equal(copied('open')['data-ds-show'],copied('notice').id);
  assert.equal(copied('open')['aria-controls'],copied('panel').id);
});

test('region replacement preserves its root/confirmed children and every outside identity',()=>{
  const a=make('<section id="region"><h2 id="title">Old</h2><p>Old unanchored</p></section><aside id="outside">Keep</aside>');
  const b=apply(a,[{type:'replace',nodeIds:[id(a,'region')],html:'<section id="region"><h2 id="title">New</h2><p>New unanchored</p></section>'}],{scopeMode:'selection',scopeNodeIds:[id(a,'region')]});
  assert.equal(id(b,'region'),id(a,'region'));assert.equal(id(b,'title'),id(a,'title'));assert.equal(node(b,'outside').hash,node(a,'outside').hash);assert.ok(b.changes.removedNodeIds.length===1);assert.ok(b.changes.insertedNodeIds.length===1);
  assert.throws(()=>apply(a,[{type:'replace',nodeIds:[id(a,'region')],html:`<div data-dsh-node="${id(a,'outside')}">Hijack</div>`}],{scopeMode:'selection',scopeNodeIds:[id(a,'region')]}),code('DUPLICATE_NODE_ID'));
});

test('selection structure cannot insert global effects or move into arbitrary ancestors/siblings',()=>{
  const a=make('<main id="root"><section id="selected"><p id="child">Child</p></section><aside id="outside"></aside></main>'),options={scopeMode:'selection',scopeNodeIds:[id(a,'selected')]};
  assert.throws(()=>apply(a,[{type:'insert',parentId:id(a,'selected'),html:'<style>body{display:none}</style>'}],options),code('SCOPED_ACTIVE_CONTENT'));
  assert.throws(()=>apply(a,[{type:'insert',parentId:id(a,'selected'),html:'<button onclick="parent.postMessage(1,\'*\')">Bad</button>'}],options),code('SCOPED_ACTIVE_CONTENT'));
  assert.throws(()=>apply(a,[{type:'move',nodeIds:[id(a,'child')],parentId:id(a,'outside')}],options),code('SCOPE_DENIED'));
  assert.throws(()=>apply(a,[{type:'move',nodeIds:[id(a,'selected')],parentId:id(a,'child')}]),code('INVALID_STRUCTURE'));
});

test('invalid container structure is rejected instead of serializing away or relocating nodes',()=>{
  const a=make('<ul id="list"><li>A</li></ul><p id="paragraph">P</p><img id="void" src="x.png">');
  assert.throws(()=>apply(a,[{type:'insert',parentId:id(a,'list'),html:'<div>Invalid list child</div>'}]),code('INVALID_DOCUMENT'));
  assert.throws(()=>apply(a,[{type:'insert',parentId:id(a,'paragraph'),html:'<div>Cannot be nested in paragraph</div>'}]),code('INVALID_DOCUMENT'));
  assert.throws(()=>apply(a,[{type:'insert',parentId:id(a,'void'),html:'<span>Would disappear</span>'}]),code('INVALID_DOCUMENT'));
});

test('align/distribute edit ordinary flex/grid flow and require parent scope for distribution',()=>{
  const a=make('<div id="row" style="display:flex;flex-direction:row"><button id="a">A</button><button id="b">B</button></div>');
  const b=apply(a,[{type:'align',nodeIds:[id(a,'a'),id(a,'b')],axis:'vertical',value:'center'},{type:'distribute',nodeIds:[id(a,'a'),id(a,'b')],axis:'horizontal',gap:20}]);
  assert.equal(node(b,'a').style['align-self'],'center');assert.equal(node(b,'row').style.gap,'20px');assert.equal(node(b,'row').style.position,undefined);
  assert.throws(()=>apply(a,[{type:'distribute',nodeIds:[id(a,'a'),id(a,'b')],axis:'horizontal'}],{scopeMode:'selection',scopeNodeIds:[id(a,'a'),id(a,'b')]}),code('SCOPE_DENIED'));
});

test('shared slots require explicit scope, update exact instances and protect local overrides',()=>{
  let a=make('<div id="definition"><span id="def-text" data-dsh-slot="label">Base</span></div><div id="one"><span id="one-text" data-dsh-slot="label">Base</span></div><div id="two"><span id="two-text" data-dsh-slot="label">Base</span></div>');
  a=apply(a,[{type:'definition.set',definition:{id:'def-card',name:'Card',rootId:id(a,'definition'),instanceIds:[id(a,'one'),id(a,'two')]}}]);
  assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,'one-text')],value:'Ambiguous'}]),code('SHARED_SCOPE_REQUIRED'));
  const b=apply(a,[{type:'text',nodeIds:[id(a,'one-text')],scope:'instance',value:'Custom'}]);
  const c=apply(b,[{type:'text',nodeIds:[id(b,'def-text')],scope:'definition',value:'Shared new'}]);
  assert.equal(node(c,'one-text').text,'Custom');assert.equal(node(c,'two-text').text,'Shared new');assert.ok(c.changes.affectedNodeIds.includes(id(c,'two-text')));assert.ok(c.changes.skippedOverrides.length);
  const d=apply(c,[{type:'override.reset',nodeIds:[id(c,'one-text')]}]);assert.equal(node(d,'one-text').text,'Shared new');
  assert.throws(()=>apply(a,[{type:'text',nodeIds:[id(a,'one-text')],scope:'definition',value:'Leak'}],{scopeMode:'selection',scopeNodeIds:[id(a,'one')]}),code('SCOPE_DENIED'));
});

test('interaction targets must be authorized and deleting a target reports invalidated behavior',()=>{
  let a=make('<button id="go">Go</button><section id="modal" hidden>Dialog</section>');
  const interaction={id:'i-open',type:'modal',sourceId:id(a,'go'),targetId:id(a,'modal')};
  assert.throws(()=>apply(a,[{type:'interaction.set',interaction}],{scopeMode:'selection',scopeNodeIds:[id(a,'go')]}),code('SCOPE_DENIED'));
  a=apply(a,[{type:'interaction.set',interaction}]);assert.equal(a.interactions.length,1);
  const b=apply(a,[{type:'remove',nodeIds:[id(a,'modal')]}]);assert.equal(b.interactions.length,0);assert.equal(b.changes.invalidatedReferences[0].id,'i-open');assert.equal(validateDocument(b.html).valid,true);
});

test('state/scenario configuration is saved in HTML, responsive and resettable',()=>{
  const a=make('<button id="button">Send</button><p id="status">Normal</p>');
  const b=apply(a,[{type:'state.set',nodeIds:[id(a,'button')],states:{hover:{styles:{backgroundColor:'red'}},disabled:{attributes:{disabled:true}},loading:{text:'Working'}},active:'default'},{type:'scene.set',scene:{id:'scene-error',kind:'error',name:'Error',nodes:{[id(a,'status')]:{text:'Try again',styles:{color:'red'}}}},activate:true}]);
  assert.equal(b.states[id(a,'button')].variants.loading.text,'Working');assert.equal(b.scenes.active,'scene-error');assert.ok(b.html.includes('scene-error'));
  const c=apply(b,[{type:'scene.reset',id:'scene-error'},{type:'state.reset',nodeIds:[id(a,'button')]}]);assert.equal(c.scenes.active,null);assert.equal(c.states[id(a,'button')],undefined);
});

test('delivery preserves user content and runtime with a safe offline page map',()=>{
  let a=make('<button id="next">Next</button>');a=apply(a,[{type:'interaction.set',interaction:{id:'i-next',type:'navigate',sourceId:id(a,'next'),pageId:'page-two'}}]);
  const exported=exportDocument(a.html,{mode:'delivery',pageId:'page-one',pageURLs:{'page-two':'../html/page-two.html'}});
  assert.ok(exported.html.includes('../html/page-two.html'));assert.ok(exported.html.includes('dsh:runtime'));assert.ok(exported.html.includes('dsh:preview-reset'));assert.ok(exported.html.includes('__DSH_DESIGN_RUNTIME__'));assert.equal(validateDocument(exported.html).valid,true);
  const overlay=exportDocument(page('<main>Real content</main><div data-dsh-editor-overlay="true">Editor selection</div>'));
  assert.ok(!overlay.html.includes('Editor selection'));assert.ok(overlay.diagnostics.some(d=>d.code==='EDITOR_OVERLAY_REMOVED'));
});

test('raw legacy reads and transactions rebuild the same IDs across independent calls',()=>{
  const raw=page('<p id="title">Old</p>'),model=normalizeDocument(raw);
  const result=applyDocumentOperations(raw,[{type:'text',nodeIds:[id(model,'title')],value:'Edited'}],{scopeMode:'selection',scopeNodeIds:[id(model,'title')]});assert.equal(result.nodes[id(model,'title')].text,'Edited');
  const replacement=normalizeDocument(page('<p id="title">AI edit</p>'),{previousHtml:raw});assert.equal(id(replacement,'title'),id(model,'title'));
});

test('deleting or replacing an unlocked container cannot erase locked descendants',()=>{
  const a=make('<section id="region"><p id="locked" data-dsh-locked="true">Protected</p></section>');
  for(const operation of [{type:'remove',nodeIds:[id(a,'region')]},{type:'replace',nodeIds:[id(a,'region')],html:'<section>Erased</section>'}])assert.throws(()=>apply(a,[operation]),code('LOCKED_NODE'));
});

test('selection deletion/duplication cannot invalidate external interaction sources or targets',()=>{
  let a=make('<button id="outside">Open</button><section id="region">Target</section>');a=apply(a,[{type:'interaction.set',interaction:{id:'i-link',type:'modal',sourceId:id(a,'outside'),targetId:id(a,'region')}}]);
  assert.throws(()=>apply(a,[{type:'remove',nodeIds:[id(a,'region')]}],{scopeMode:'selection',scopeNodeIds:[id(a,'region')]}),code('SCOPE_DENIED'));
  assert.throws(()=>apply(a,[{type:'duplicate',nodeIds:[id(a,'outside')]}],{scopeMode:'selection',scopeNodeIds:[id(a,'outside')]}),code('SCOPE_DENIED'));
});

test('shared definition copies register their new instance, and detaching permits independent deletion',()=>{
  let a=make('<div id="master">Master</div><div id="instance">Instance</div>');a=apply(a,[{type:'definition.set',definition:{id:'def-one',rootId:id(a,'master'),instanceIds:[id(a,'instance')]}}]);
  assert.throws(()=>apply(a,[{type:'remove',nodeIds:[id(a,'master')],scope:'instance'}]),code('DEFINITION_IN_USE'));
  const b=apply(a,[{type:'duplicate',nodeIds:[id(a,'master')],scope:'instance'}]);assert.equal(b.definitions['def-one'].instanceIds.length,2);assert.equal(validateDocument(b.html).valid,true);
  const c=apply(b,[{type:'definition.remove',id:'def-one'},{type:'remove',nodeIds:[id(a,'master')]}]);assert.equal(c.definitions['def-one'],undefined);assert.equal(node(c,'instance').attributes['data-dsh-instance'],undefined);
});

test('metadata resources and offline mappings are validated, including state/scenario asset changes',()=>{
  const a=make('<div id="box">Box</div>');
  assert.throws(()=>apply(a,[{type:'state.set',nodeIds:[id(a,'box')],states:{loading:{styles:{backgroundImage:'url(assets/missing.png)'}}}}],{resourceExists:()=>false}),code('INVALID_DOCUMENT'));
  assert.throws(()=>exportDocument(a.html,{mode:'delivery',pageURLs:{'page-other':'javascript:alert(1)'}}),code('INVALID_DOCUMENT'));
  assert.throws(()=>apply(a,[{type:'style',nodeIds:[id(a,'box')],styles:{color:'red;position:absolute'}}]),code('INVALID_STYLE'));
  assert.throws(()=>apply(a,[{type:'attributes',nodeIds:[id(a,'box')],attributes:{onclick:'alert(1)'}}]),code('RESERVED_ATTRIBUTE'));
});

test('controlled JSON safely preserves literal closing tags and malformed metadata returns diagnostics',()=>{
  const a=make('<p id="text">Text</p>'),value='</script><img src=x onerror=bad>';
  const b=apply(a,[{type:'scene.set',scene:{id:'scene-text',nodes:{[id(a,'text')]:{text:value}}}}]);assert.equal(Object.values(b.nodes).filter(n=>n.tag==='img').length,0);assert.equal(b.scenes.items[0].nodes[id(a,'text')].text,value);assert.ok(b.html.includes('\\u003c/script>'));
  const invalid=page('<p data-dsh-node="n-one">Text</p><script id="dsh-document-model" type="application/json">'+JSON.stringify({schemaVersion:1,interactions:[null],scenes:{active:null,items:[]},states:{'n-one':null},responsive:{},definitions:{},overrides:{},runtime:{mode:'preview',pageURLs:{}}})+'</script>');
  const report=validateDocument(invalid);assert.equal(report.valid,false);assert.ok(report.diagnostics.some(d=>d.code==='INVALID_INTERACTION'));assert.ok(report.diagnostics.some(d=>d.code==='INVALID_STATE'));
});

test('CSS custom properties keep case, and unclosed comments cannot corrupt other responsive rules',()=>{
  const a=make('<div id="box" style="--Brand:red;color:var(--Brand)">Box</div>');assert.equal(node(a,'box').style['--Brand'],'red');
  const b=apply(a,[{type:'style',nodeIds:[id(a,'box')],styles:{'--Brand':'blue','-webkit-appearance':'none'}}]);assert.equal(node(b,'box').style['--Brand'],'blue');
  const c=apply(b,[{type:'style',nodeIds:[id(a,'box')],styles:{'--Brand':null}}]);assert.equal(node(c,'box').style['--Brand'],undefined);
  assert.throws(()=>apply(a,[{type:'style',nodeIds:[id(a,'box')],breakpoint:'mobile',styles:{color:'red/*'}}]),code('INVALID_STYLE'));
});

test('shared state and responsive overrides have explicit scope and reset to their own definition fields',()=>{
  let a=make('<div id="master"><span id="master-label" data-dsh-slot="label">Master</span></div><div id="instance"><span id="instance-label" data-dsh-slot="label">Instance</span></div>');a=apply(a,[{type:'definition.set',definition:{id:'def-state',rootId:id(a,'master'),instanceIds:[id(a,'instance')]}}]);
  assert.throws(()=>apply(a,[{type:'state.set',nodeIds:[id(a,'instance-label')],states:{loading:{text:'Wait'}}}]),code('SHARED_SCOPE_REQUIRED'));
  a=apply(a,[{type:'state.set',nodeIds:[id(a,'instance-label')],scope:'instance',states:{loading:{text:'Custom wait'}}},{type:'style',nodeIds:[id(a,'instance-label')],scope:'instance',styles:{width:280},breakpoint:'mobile'},{type:'state.set',nodeIds:[id(a,'master-label')],scope:'definition',states:{loading:{text:'Shared wait'}}},{type:'style',nodeIds:[id(a,'master-label')],scope:'definition',styles:{width:200},breakpoint:'mobile'}]);
  assert.equal(a.states[id(a,'instance-label')].variants.loading.text,'Custom wait');assert.equal(a.responsive[id(a,'instance-label')].mobile.width,'280px');
  const b=apply(a,[{type:'override.reset',nodeIds:[id(a,'instance-label')],keys:['state','responsive.mobile.width']}]);assert.equal(b.states[id(a,'instance-label')].variants.loading.text,'Shared wait');assert.equal(b.responsive[id(a,'instance-label')].mobile.width,'200px');
});

test('progressive operation help exposes executable interaction examples without dumping all schemas',()=>{
  const overview=documentOperationsHelp();assert.ok(overview.operations.includes('interaction.set'));assert.equal(overview.schema,undefined);
  const help=documentOperationsHelp('interaction.set'),example=help.examples[0];let a=make('<button id="open">Open</button><div id="dialog" hidden>Dialog</div>');
  const op={...example,interaction:{...example.interaction,sourceId:id(a,'open'),targetId:id(a,'dialog')}};a=apply(a,[op]);assert.equal(a.interactions[0].type,'modal');assert.equal(help.schema.common.type.includes('modal'),true);assert.equal(documentOperationsHelp('unknown').error,'UNKNOWN_OPERATION');
});

// A small DOM contract fixture exercises generated standalone runtime behavior,
// not a renderer or an alternative document model. Browser layout remains an integration check.
function runtimeDOM(html){
  const ast=parse(html),events=new Map(),domNodes=[],walk=(n,parent)=>{if(n.tagName){const attrs=new Map((n.attrs||[]).map(a=>[a.name,a.value])),listeners=new Map(),styles=new Map();const node={tagName:n.tagName.toUpperCase(),parent,children:[],hidden:attrs.has('hidden'),disabled:attrs.has('disabled'),checked:attrs.has('checked'),value:attrs.get('value')||'',tabIndex:0,open:false,get attributes(){return [...attrs].map(([name,value])=>({name,value}))},get textContent(){return (n.childNodes||[]).map(text).join('')},set textContent(value){n.childNodes=[{nodeName:'#text',value:String(value)}];this.children=[]},getAttribute:k=>attrs.has(k)?attrs.get(k):null,setAttribute(k,v){attrs.set(k,String(v));if(k==='disabled')this.disabled=true;if(k==='hidden')this.hidden=true},removeAttribute(k){attrs.delete(k);if(k==='disabled')this.disabled=false;if(k==='hidden')this.hidden=false},style:{setProperty(k,v){styles.set(k,v)},removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''},classList:{toggle(k){const values=new Set((attrs.get('class')||'').split(/\s+/).filter(Boolean));if(values.has(k))values.delete(k);else values.add(k);attrs.set('class',[...values].join(' '))}},addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(fn)},dispatch(k,target=this){const e={type:k,target,preventDefault(){this.defaultPrevented=true}};for(const fn of listeners.get(k)||[])fn(e);return e},contains(other){for(let at=other;at;at=at.parent)if(at===this)return true;return false},querySelector(){return this.children[0]||null},focus(){document.activeElement=this},scrollIntoView(){this.scrolled=true},setCustomValidity(){}};domNodes.push(node);if(parent)parent.children.push(node);for(const child of n.childNodes||[])walk(child,node);return node}for(const child of n.childNodes||[])walk(child,parent)};
  const text=n=>n.nodeName==='#text'?n.value:(n.childNodes||[]).map(text).join('');
  const document={readyState:'complete',activeElement:null,getElementById:value=>domNodes.find(n=>n.getAttribute('id')===value),querySelectorAll:()=>domNodes.filter(n=>n.getAttribute('data-dsh-node')),addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn)},dispatchEvent(event){this.dispatch(event.type,event.detail);return true},dispatch(name,detail){for(const fn of events.get(name)||[])fn({detail,key:detail?.key,preventDefault(){}})}};
  walk(ast,null);const messages=[],location={href:'about:blank'},history={count:0,back(){this.count++}},window={parent:{postMessage:msg=>messages.push(msg)}};vm.runInNewContext(interactionRuntimeSource(),{document,window,location,history,Map,Set,Array,JSON,Object,String,RegExp,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail}},getComputedStyle:node=>({display:node.hidden?'none':'block',visibility:'visible'})});return {document,window,location,history,messages,get:id=>document.getElementById(id)};
}

test('standalone modal/toggle/tabs/filter/form/feedback work and reset example data',()=>{
  let a=make('<button id="open">Open</button><div id="modal" hidden>Dialog</div><button id="toggle">Toggle</button><p id="target" hidden>Details</p><div id="tabs"><button id="tab-a">A</button><button id="tab-b">B</button></div><section id="panel-a">A content</section><section id="panel-b">B content</section><input id="search"><p id="apple">Apple</p><p id="pear">Pear</p><p id="empty" hidden>Empty</p><form id="form"><input id="email"><button>Send</button></form><p id="success" hidden>Good</p><p id="error" hidden>Bad</p><button id="feedback">Feedback</button><p id="message" hidden>Message</p>');
  const refs={};for(const name of ['open','modal','toggle','target','tabs','tab-a','tab-b','panel-a','panel-b','search','apple','pear','empty','form','email','success','error','feedback','message'])refs[name]=id(a,name);
  const interactions=[{id:'i-modal',type:'modal',sourceId:refs.open,targetId:refs.modal},{id:'i-toggle',type:'toggle',sourceId:refs.toggle,targetId:refs.target},{id:'i-tabs',type:'tabs',sourceId:refs.tabs,items:[{triggerId:refs['tab-a'],panelId:refs['panel-a']},{triggerId:refs['tab-b'],panelId:refs['panel-b']}]},{id:'i-filter',type:'filter',sourceId:refs.search,items:[refs.apple,refs.pear],emptyTargetId:refs.empty},{id:'i-form',type:'form',sourceId:refs.form,rules:[{nodeId:refs.email,required:true,type:'email'}],successTargetId:refs.success,errorTargetId:refs.error,successMessage:'Sent'},{id:'i-feedback',type:'feedback',sourceId:refs.feedback,targetId:refs.message,text:'Saved'}];
  a=apply(a,interactions.map(interaction=>({type:'interaction.set',interaction})));const dom=runtimeDOM(a.html);
  dom.get('open').dispatch('click');assert.equal(dom.get('modal').hidden,false);dom.get('toggle').dispatch('click');assert.equal(dom.get('target').hidden,false);
  dom.get('tabs').dispatch('click',dom.get('tab-b'));assert.equal(dom.get('panel-a').hidden,true);assert.equal(dom.get('panel-b').hidden,false);
  dom.get('search').value='apple';dom.get('search').dispatch('input');assert.equal(dom.get('pear').hidden,true);assert.equal(dom.get('apple').hidden,false);
  dom.get('email').value='bad';dom.get('form').dispatch('submit');assert.equal(dom.get('error').hidden,false);assert.equal(dom.get('success').hidden,true);
  dom.get('email').value='good@example.com';dom.get('form').dispatch('submit');assert.equal(dom.get('success').hidden,false);assert.equal(dom.get('success').textContent,'Sent');
  dom.get('feedback').dispatch('click');assert.equal(dom.get('message').textContent,'Saved');dom.document.dispatch('dsh:preview-reset');assert.equal(dom.get('message').textContent,'Message');assert.equal(dom.get('search').value,'');assert.equal(dom.get('email').value,'');
});

test('runtime API contract preserves live input through style states and applies/reset saved scene values',()=>{
  let model=make('<input id="email" value="initial"><input id="check" type="checkbox">');model=apply(model,[{type:'state.set',nodeIds:[id(model,'email')],states:{hover:{styles:{opacity:'.5'}}}},{type:'scene.set',scene:{id:'scene-filled',nodes:{[id(model,'email')]:{attributes:{value:'saved@example.test'}},[id(model,'check')]:{attributes:{checked:true}}}}}]);const dom=runtimeDOM(model.html),runtime=dom.window.__DSH_DESIGN_RUNTIME__;dom.get('email').value='temporary@example.test';runtime.setState(id(model,'email'),'hover');assert.equal(dom.get('email').value,'temporary@example.test');assert.equal(runtime.getState().dirty,true);runtime.setScene('scene-filled');assert.equal(dom.get('email').value,'saved@example.test');assert.equal(dom.get('check').checked,true);runtime.reset();assert.equal(dom.get('email').value,'initial');assert.equal(dom.get('check').checked,false);assert.equal(runtime.getState().dirty,false);
});

test('saved back interaction requests only preview view history and uses standalone browser history on delivery',()=>{
  let a=make('<button id="back">Back</button>');a=apply(a,[{type:'interaction.set',interaction:{id:'i-back',type:'back',sourceId:id(a,'back')}}]);const preview=runtimeDOM(a.html);preview.get('back').dispatch('click');assert.equal(preview.messages[0].action,'back');assert.equal(preview.history.count,0);
  const delivery=runtimeDOM(exportDocument(a.html,{mode:'delivery'}).html);delivery.get('back').dispatch('click');assert.equal(delivery.history.count,1);assert.equal(delivery.messages.length,0);assert.ok(documentOperationsHelp('interaction.set').schema.back);
});

test('runtime state, scene events and preview vs delivery page navigation share the same saved content',()=>{
  let a=make('<button id="button">Send</button><p id="status">Ready</p><a id="next">Next</a>');
  a=apply(a,[{type:'state.set',nodeIds:[id(a,'button')],states:{hover:{styles:{color:'red'}},loading:{text:'Loading'},disabled:{text:'Disabled'}}},{type:'scene.set',scene:{id:'scene-error',kind:'error',nodes:{[id(a,'status')]:{text:'Failed'}}}},{type:'interaction.set',interaction:{id:'i-next',type:'navigate',sourceId:id(a,'next'),pageId:'page-next'}}]);
  const preview=runtimeDOM(a.html);preview.window.__DSH_DESIGN_RUNTIME__.setState(id(a,'button'),'loading');assert.equal(preview.get('button').textContent,'Loading');preview.document.dispatch('dsh:scene',{id:'scene-error'});assert.equal(preview.get('status').textContent,'Failed');preview.document.dispatch('dsh:scene',{reset:true});assert.equal(preview.get('status').textContent,'Ready');preview.get('next').dispatch('click');assert.equal(preview.messages[0].type,'dsh:runtime');assert.equal(preview.messages[0].pageId,'page-next');assert.equal(preview.location.href,'about:blank');
  const delivery=runtimeDOM(exportDocument(a.html,{mode:'delivery',pageURLs:{'page-next':'./other.html'}}).html);delivery.get('next').dispatch('click');assert.equal(delivery.location.href,'./other.html');assert.equal(delivery.messages.length,0);
});

test('applied scene notifications reach business listeners without applying saved variants twice',()=>{
  let model=make('<p id="status">Initial</p>');
  model=apply(model,[{type:'scene.set',scene:{id:'saved',nodes:{[id(model,'status')]:{text:'Saved'}}}}]);
  const dom=runtimeDOM(model.html),runtime=dom.window.__DSH_DESIGN_RUNTIME__;
  runtime.setScene('saved');dom.get('status').textContent='Business listener value';
  dom.document.dispatch('dsh:scene',{id:'saved',applied:true});
  assert.equal(dom.get('status').textContent,'Business listener value');
  dom.document.dispatch('dsh:scene',{id:'saved'});assert.equal(dom.get('status').textContent,'Saved');
  runtime.reset();dom.get('status').textContent='Reset listener value';
  dom.document.dispatch('dsh:preview-reset',{applied:true});assert.equal(dom.get('status').textContent,'Reset listener value');
});

test('misnamed metadata markers produce a concrete diagnostic while source remains readable',()=>{
  const document=normalizeDocument('<!doctype html><html><body><p data-dsh-node="text">Content</p><script id="dsh-model" data-dsh-document-model type="application/json">{"schemaVersion":1,"scenes":{"items":[]}}</script></body></html>');
  assert.ok(document.diagnostics.some(d=>d.code==='MODEL_ID_REQUIRED'&&d.message.includes('dsh-document-model')));assert.equal(document.nodes.text.text,'Content');
});

test('Escape closes component-hosted modal methods and restores the original trigger focus',()=>{
  let model=make('<button id="open">Open</button><ds-dialog id="panel"><button id="close">Close</button></ds-dialog>');
  model=apply(model,[{type:'interaction.set',interaction:{id:'open-panel',type:'modal',sourceId:id(model,'open'),targetId:id(model,'panel')}}]);
  const dom=runtimeDOM(model.html),panel=dom.get('panel'),trigger=dom.get('open');
  delete panel.open;
  panel.showModal=()=>{panel.setAttribute('open','');dom.get('close').focus();};
  let closed=0;
  panel.close=()=>{closed++;panel.removeAttribute('open');dom.document.dispatch('ds-close',{target:panel});};
  trigger.focus();trigger.dispatch('click');
  assert.equal(dom.document.activeElement,dom.get('close'));
  assert.equal(dom.window.__DSH_DESIGN_RUNTIME__.getState().controls.open[id(model,'panel')],true);
  dom.document.dispatch('keydown',{key:'Escape'});
  assert.equal(closed,1);assert.equal(panel.getAttribute('open'),null);
  assert.equal(panel.hidden,true);assert.equal(dom.document.activeElement,trigger);
  assert.equal(dom.window.__DSH_DESIGN_RUNTIME__.getState().controls.open[id(model,'panel')],false);
});
