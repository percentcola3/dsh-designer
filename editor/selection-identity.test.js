import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createSelectionIdentity} from './selection-identity.js';

const hash='a'.repeat(64),source=(id='src_one',tag='li',extra={})=>({id,path:'src/App.jsx',tag,start:10,end:50,line:2,column:3,sourceHash:hash,elementHash:'b'.repeat(64),native:true,...extra});
const artifact=(manifest=[source()],extra={})=>({kind:'react',entry:'src/App.jsx',manifest,version:3,buildId:'build-one',...extra});
function element(tag='li',attributes={},outerHTML='<li>Example</li>'){
  const attrs=new Map(Object.entries(attributes));return {tagName:tag.toUpperCase(),isConnected:true,parentElement:null,children:[],outerHTML,getAttribute:name=>attrs.get(name)??null,setAttribute:(name,value)=>attrs.set(name,String(value)),removeAttribute:name=>attrs.delete(name)};
}
function fixture(nodes=[],value=artifact(),epoch='doc-test'){
  const document={querySelectorAll(selector){const attr=selector.slice(1,-1);return nodes.filter(node=>node.isConnected&&node.getAttribute(attr)!==null)}};
  return {nodes,document,identity:createSelectionIdentity({artifact:value},{document,documentEpoch:epoch})};
}

test('one source node has distinct runtime instances, WeakMap identity survives DOM moves and cloned instance attrs do not collide',()=>{
  const first=element('li',{'data-dsh-source':'src_one','data-dsh-instance':'pretend'}),second=element('li',{'data-dsh-source':'src_one','data-dsh-instance':'pretend'}),f=fixture([first,second]);
  const a=f.identity.identify(first),b=f.identity.identify(second);assert.notEqual(a.nodeId,b.nodeId);assert.equal(a.nodeId,a.instanceId);assert.equal(a.sourceNodeId,b.sourceNodeId);assert.equal(first.getAttribute('data-dsh-instance'),a.instanceId);
  first.parentElement=second;first.setAttribute('data-dsh-instance',b.instanceId);assert.equal(f.identity.identify(first).instanceId,a.instanceId);assert.equal(first.getAttribute('data-dsh-instance'),a.instanceId);
  const clone=element('li',{'data-dsh-source':'src_one','data-dsh-instance':a.instanceId});f.nodes.push(clone);assert.notEqual(f.identity.identify(clone).instanceId,a.instanceId);assert.equal(f.identity.nodeFor(a.instanceId),first);
});

test('dynamic React/Vue nodes map lazily and stale instances never resolve by source ID or copied DOM instance ID',()=>{
  for(const kind of ['react','vue']){
    const f=fixture([],artifact([source()],{kind}));assert.equal(f.identity.all().length,0);
    const late=element('li',{'data-dsh-source':'src_one'});f.nodes.push(late);f.identity.advanceRender();const selected=f.identity.identify(late);
    assert.equal(f.identity.all()[0],late);assert.equal(selected.renderEpoch,1);assert.equal(f.identity.nodeFor('src_one'),null);
    late.isConnected=false;assert.equal(f.identity.nodeFor(selected.nodeId),null);
    const replacement=element('li',{'data-dsh-source':'src_one','data-dsh-instance':selected.nodeId});f.nodes.push(replacement);assert.notEqual(f.identity.identify(replacement).nodeId,selected.nodeId);assert.equal(f.identity.nodeFor(selected.nodeId),null);
  }
});

test('source locators come only from copied trusted manifest entries; DOM path, offsets and custom attrs are not locator authority',()=>{
  const manifest=[source()],node=element('li',{'data-dsh-source':'src_one','data-dsh-path':'../../private/session','data-dsh-start':'0'}),f=fixture([node],artifact(manifest));
  const selected=f.identity.identify(node);assert.equal(selected.sourceLocator.path,'src/App.jsx');assert.equal(selected.sourceLocator.start,10);assert.equal(selected.sourceLocator.native,true);assert.equal(selected.sourceLocator.elementHash,'b'.repeat(64));
  manifest[0].path='src/Forged.jsx';selected.sourceLocator.path='src/Changed.jsx';assert.equal(f.identity.identify(node).sourceLocator.path,'src/App.jsx');
  const unmarked=element('span',{'data-dsh-instance':selected.instanceId,'data-dsh-node':selected.nodeId});unmarked.parentElement=node;f.nodes.push(unmarked);assert.equal(f.identity.identify(unmarked),null);assert.equal(f.identity.parent(unmarked),node);
});

test('forged IDs, non-native components, tag mismatches and ambiguous duplicate manifest IDs fail closed',()=>{
  const cases=[[],[source('other')],[source('src_one','li',{native:false})],[source('src_one','span')],[source(),source('src_one','li',{path:'src/Other.jsx'})],[source('src_one','li',{path:'../secret'}),source()]];
  for(const manifest of cases){const node=element('li',{'data-dsh-source':'src_one','data-dsh-node':'html-pretend'}),f=fixture([node],artifact(manifest));assert.equal(f.identity.identify(node),null);assert.deepEqual(f.identity.all(),[]);assert.equal(f.identity.nodeFor('html-pretend'),null);}
});

test('unsafe or malformed artifact and locator fields cannot grant source mapping',()=>{
  const invalidSources=[{path:'/absolute.jsx'},{path:'https://evil.test/App.jsx'},{path:'src/%2e%2e/private.jsx'},{path:'src\\private.jsx'},{sourceHash:'not-a-hash'},{start:-1},{end:10},{line:0},{column:0},{native:undefined}];
  for(const patch of invalidSources){const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node],artifact([source('src_one','li',patch)]));assert.equal(f.identity.identify(node),null);}
  for(const patch of [{kind:'unknown'},{entry:'../App.jsx'},{entry:'https://evil.test'},{manifest:{}},{buildId:''},{version:null}]){const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node],artifact([source()],patch));assert.equal(f.identity.identify(node),null);}
});

test('inherited manifest fields and prototype payloads cannot impersonate compiler-owned locator records',()=>{
  const inherited=Object.assign(Object.create({native:true}),source());delete inherited.native;
  for(const record of [inherited,Object.create(source())]){const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node],artifact([record]));assert.equal(f.identity.identify(node),null);}
  const htmlNode=element('li',{'data-dsh-node':'n-pretend'});assert.equal(fixture([htmlNode],Object.create({kind:'html'})).identity.identify(htmlNode),null);
});

test('changing a reused DOM node to another source identity allocates a fresh instance',()=>{
  const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node],artifact([source(),source('src_two')])),first=f.identity.identify(node);
  node.setAttribute('data-dsh-source','src_two');const next=f.identity.identify(node);assert.notEqual(first.nodeId,next.nodeId);assert.equal(next.sourceNodeId,'src_two');assert.equal(f.identity.nodeFor(first.nodeId),null);
});

test('document epochs reject reloaded instance IDs while render batches and scenes preserve same-DOM identity',()=>{
  const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node],artifact(),'doc-first'),first=f.identity.identify(node);f.identity.advanceRender();f.identity.setScene('scene-success');const later=f.identity.identify(node);
  assert.equal(later.nodeId,first.nodeId);assert.equal(later.renderEpoch,1);assert.equal(later.sceneId,'scene-success');
  const reloaded=fixture([node],artifact(),'doc-second');assert.notEqual(reloaded.identity.identify(node).nodeId,first.nodeId);assert.equal(reloaded.identity.nodeFor(first.nodeId),null);assert.throws(()=>f.identity.readElement({nodeId:first.nodeId,documentEpoch:'doc-second'}),/epoch/);
});

test('HTML keeps saved node IDs, full outerHTML beyond old 8000 limit and rejects ambiguous duplicate saved IDs',()=>{
  const html='<section>'+('content'.repeat(2000))+'</section>',node=element('section',{'data-dsh-node':'n-original'},html),f=fixture([node],null),selected=f.identity.identify(node),detail=f.identity.element(node);
  assert.equal(selected.nodeId,'n-original');assert.equal(selected.instanceId,undefined);assert.equal(node.getAttribute('data-dsh-instance'),null);assert.equal(detail.outerHTML,html);assert.equal(detail.outerHTMLTruncated,false);assert.equal(detail.outerHTMLTotal,html.length);
  f.nodes.push(element('section',{'data-dsh-node':'n-original'}));assert.equal(f.identity.nodeFor('n-original'),null);
});

test('large Unicode element snapshots retain a complete immutable UTF-16 paging chain even when live DOM changes',()=>{
  const html='<li>'+('预约🌿'.repeat(50000))+'</li>',node=element('li',{'data-dsh-source':'src_one'},html),f=fixture([node]),selected=f.identity.identify(node),detail=f.identity.element(node,selected);
  assert.equal(detail.outerHTMLTruncated,true);assert.ok(detail.outerHTMLTotalBytes>256*1024);assert.equal(detail.outerHTMLTotal,html.length);assert.equal(detail.outerHTMLUnit,'utf16');assert.ok(detail.elementReadId);
  node.outerHTML='<li>Changed after selection</li>';f.identity.advanceRender();f.identity.setScene('scene-new');let content='',offset=0,page;
  do{page=f.identity.readElement({readId:detail.elementReadId,nodeId:selected.nodeId,documentEpoch:'doc-test',offset,limit:4093});content+=page.content;offset=page.nextOffset;assert.equal(page.renderEpoch,0);assert.equal(page.sceneId,null);assert.equal(page.unit,'utf16');}while(!page.done);
  assert.equal(content,html);assert.equal(page.total,html.length);assert.equal(page.truncated,false);assert.equal(page.nextOffset,null);assert.equal(page.endOffset,html.length);
});

test('element.read validates ranges and ownership and requires a snapshot ID for subsequent pages',()=>{
  const node=element('li',{'data-dsh-source':'src_one'},'<li>ABC🌿DEF</li>'),f=fixture([node]),id=f.identity.identify(node).nodeId;
  const first=f.identity.readElement({nodeId:id,limit:7});assert.equal(first.offset,0);assert.equal(first.nextOffset,7);assert.equal(first.total,node.outerHTML.length);
  for(const args of [{nodeId:id,offset:1},{readId:first.readId,offset:-1},{readId:first.readId,limit:262145},{readId:first.readId,limit:1.1},{readId:first.readId,offset:10000},{readId:first.readId,nodeId:'other'},{readId:'forged'}])assert.throws(()=>f.identity.readElement(args));
  const rest=f.identity.readElement({readId:first.readId,offset:first.nextOffset});assert.equal(first.content+rest.content,node.outerHTML);
});

test('expired complete snapshots fail explicitly and unmapped element evidence remains read-only',()=>{
  const node=element('aside',{},'<aside>'+('x'.repeat(300000))+'</aside>'),f=fixture([node]),detail=f.identity.element(node,null);
  assert.equal(f.identity.identify(node),null);assert.equal(f.identity.readElement({readId:detail.elementReadId,limit:10}).nodeId,null);
  assert.equal(f.identity.element(node,null).elementReadId,detail.elementReadId);
  for(let i=0;i<8;i++){node.outerHTML='<aside>'+i+'x'.repeat(300000)+'</aside>';f.identity.element(node,null);}assert.throws(()=>f.identity.readElement({readId:detail.elementReadId}),/expired/);assert.throws(()=>f.identity.readElement({nodeId:'aside'}),/Mapped element/);
});

test('reading an active snapshot refreshes its LRU lease while unrelated older evidence can expire',()=>{
  const f=fixture(),ids=[];
  for(let i=0;i<8;i++)ids.push(f.identity.element(element('aside',{},'<aside>'+i+'x'.repeat(270000)+'</aside>'),null).elementReadId);
  f.identity.readElement({readId:ids[0],limit:1});f.identity.element(element('aside',{},'<aside>new'+'x'.repeat(270000)+'</aside>'),null);
  assert.ok(f.identity.readElement({readId:ids[0],limit:1}));assert.throws(()=>f.identity.readElement({readId:ids[1],limit:1}),/expired/);
});

test('serialized identity factory is self-contained and executes without module imports',()=>{
  const node=element('li',{'data-dsh-source':'src_one'}),f=fixture([node]),factory=vm.runInNewContext('('+createSelectionIdentity.toString()+')'),identity=factory({artifact:artifact()},{document:f.document,documentEpoch:'doc-serialized'});
  assert.equal(identity.identify(node).sourceNodeId,'src_one');assert.equal(identity.identify(node).documentEpoch,'doc-serialized');
});
