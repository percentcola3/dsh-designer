import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'parse5';
import {frameDocument,previewPolicy,trustedAssetRoot,installEditorBridge,installLocalPrototypeInteractions} from './bridge.js';
import {FrameSession,FRAME_CHANNEL,readCompleteElement,readSourceInstances} from './rpc.js';
const origin='http://127.0.0.1:53998',base='/api/designer/resource/'+('a'.repeat(64))+'/p-test/designs/a/pages/home/?v=2';
function nodes(root){const result=[];const walk=node=>{if(node.tagName)result.push(node);for(const child of node.childNodes||[])walk(child);if(node.content)walk(node.content)};walk(root);return result}
const attr=(node,name)=>node.attrs?.find(attribute=>attribute.name===name)?.value;

test('bridge script parses without execution and readiness waits for DOMContentLoaded',()=>{assert.doesNotThrow(()=>new vm.Script('('+installEditorBridge.toString()+')'));const source=installEditorBridge.toString();assert.ok(source.includes('DOMContentLoaded'));assert.ok(!source.includes("case 'edit'"));assert.ok(!source.includes("case 'apply'"))});
test('HTML5 parser injects policy before scripts, strips hostile base/refresh and preserves user script text',()=>{const user='const example="<head>"; window.userCode=1;';const html='<!doctype html><!-- <head fake> --><html><head><base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=/api/designer"><script>'+user+'</script></head><body><p>Real content</p></body></html>';const result=frameDocument(html,{token:'test',pageId:'a-test',assetBase:base,origin}),elements=nodes(parse(result)),head=elements.find(node=>node.tagName==='head');assert.equal(attr(head.childNodes[0],'http-equiv'),'Content-Security-Policy');assert.equal(elements.filter(node=>node.tagName==='base').length,1);assert.ok(attr(elements.find(node=>node.tagName==='base'),'href').startsWith(origin+'/api/designer/resource/'));assert.ok(!elements.some(node=>node.tagName==='meta'&&attr(node,'http-equiv')==='refresh'));assert.ok(elements.some(node=>node.tagName==='script'&&node.childNodes[0]?.value===user));for(const script of elements.filter(node=>node.tagName==='script'&&attr(node,'data-dsh-editor-bridge')))assert.doesNotThrow(()=>new vm.Script(script.childNodes[0].value))});
test('opaque frame policy permits only project capability resources and no Host APIs',()=>{const {csp}=previewPolicy(base,origin);assert.match(csp,/connect-src 'none'/);assert.match(csp,/form-action 'none'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/frame-src 'none'/);assert.ok(csp.includes(origin+'/api/designer/resource/'));assert.ok(!csp.includes('unsafe-eval'));assert.ok(!/img-src[^;]*https?:;/.test(csp));assert.throws(()=>trustedAssetRoot('https://evil.test/api/designer/resource/'+('a'.repeat(64))+'/p-test/',origin));assert.throws(()=>trustedAssetRoot('/api/designer',origin));assert.equal(trustedAssetRoot(base,origin).root,origin+'/api/designer/resource/'+('a'.repeat(64))+'/p-test/')});
test('bridge config escapes script terminators rather than adding executable nodes',()=>{const html=frameDocument('<html><body>Content</body></html>',{token:'</script><img src=x>',pageId:'a-test',origin});const elements=nodes(parse(html));assert.equal(elements.filter(node=>node.tagName==='img').length,0);const bridge=elements.find(node=>attr(node,'data-dsh-editor-bridge'));assert.doesNotThrow(()=>new vm.Script(bridge.childNodes[0].value))});
function fixture(){let sequence=0;const timers=new Map(),sent=[],events=[],source={postMessage:value=>sent.push(value)};const session=new FrameSession({token:'token-one',pageId:'a-one',getWindow:()=>source,onEvent:(kind,value)=>events.push({kind,value}),setTimer:fn=>{timers.set(++sequence,fn);return sequence},clearTimer:id=>timers.delete(id)});const receive=(kind,value,extra={})=>session.receive({source,data:{channel:FRAME_CHANNEL,token:'token-one',pageId:'a-one',kind,value,...extra}});return {session,source,sent,events,timers,receive}}

test('preview Escape events reach the owner only through the authenticated frame',()=>{
  const f=fixture();
  assert.equal(f.session.receive({source:{},data:{channel:FRAME_CHANNEL,token:'token-one',pageId:'a-one',kind:'exitPreview'}}),false);
  assert.equal(f.receive('exitPreview',{}),true);
  assert.deepEqual(f.events,[{kind:'exitPreview',value:{}}]);
});

test('view requests wait for authenticated readiness and unrelated messages cannot resolve them',async()=>{const f=fixture(),task=f.session.request('measure',{nodeIds:['n-one']});assert.equal(f.sent.length,0);assert.equal(f.session.receive({source:{},data:{channel:FRAME_CHANNEL,token:'token-one',pageId:'a-one',kind:'ready'}}),false);assert.equal(f.session.receive({source:f.source,data:{channel:FRAME_CHANNEL,token:'other',pageId:'a-one',kind:'ready'}}),false);assert.equal(f.session.receive({source:f.source,data:{channel:FRAME_CHANNEL,token:'token-one',pageId:'a-other',kind:'ready'}}),false);f.receive('ready',{});await Promise.resolve();assert.equal(f.sent.length,1);assert.equal(f.sent[0].command,'measure');f.receive('response',[{nodeId:'n-one'}],{requestId:f.sent[0].requestId});assert.deepEqual(await task,[{nodeId:'n-one'}]);assert.equal(f.timers.size,0)});
test('callback updates and readonly events preserve in-flight requests; raw edits are never consumed',async()=>{const f=fixture();f.receive('ready',{});const task=f.session.request('hitTest',{x:20,y:30});await Promise.resolve();f.session.onEvent=()=>{};f.receive('scroll',{x:0,y:500});assert.equal(f.session.pending.size,1);assert.equal(f.receive('edit',{operations:[{type:'remove'}]}),false);assert.equal(f.receive('command',{action:'edit.apply'}),false);f.receive('response',{nodeId:'n-one'},{requestId:f.sent[0].requestId});assert.equal((await task).nodeId,'n-one');await assert.rejects(f.session.request('edit.apply',{}),error=>error.code==='FRAME_COMMAND_DENIED')});
function prototypeFixture({checkpointBetweenListeners=false}={}){
  const listeners=new Map(),targets=new Map(),scrolls=[],microtasks=[],tasks=[];let mode='preview';
  const flushMicrotasks=()=>{while(microtasks.length)microtasks.shift()()};
  const document={documentElement:{scrollIntoView(){scrolls.push('root')}},getElementById:id=>targets.get(id),addEventListener(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list)}};
  class SubmitEvent {constructor(type,options){this.type=type;Object.assign(this,options)}preventDefault(){this.defaultPrevented=true}}
  const dispatch=(type,options={})=>{const event=options instanceof SubmitEvent?options:{button:0,key:'',defaultPrevented:false,preventDefault(){this.defaultPrevented=true},...options};event.eventPhase=3;try{for(const fn of listeners.get(type)||[]){fn(event);if(checkpointBetweenListeners)flushMicrotasks()}}finally{event.eventPhase=0}return event};
  vm.runInNewContext('('+installLocalPrototypeInteractions.toString()+')(getMode)',{document,getMode:()=>mode,SubmitEvent,Array,getComputedStyle:node=>({position:node.position||'static',scrollMarginTop:'12px'}),scrollY:900,scrollTo:value=>scrolls.push(value),queueMicrotask:fn=>microtasks.push(fn),setTimeout:fn=>tasks.push(fn),matchMedia:()=>({matches:true}),parseFloat,Math,decodeURIComponent});
  const form={noValidate:false,elements:[],valid:true,events:[],checks:0,reportValidity(){this.checks++;return this.valid},dispatchEvent(event){if(dispatch('submit',event).defaultPrevented)event.preventDefault();this.events.push(event);this.onSubmit?.(event);return !event.defaultPrevented},submit(){throw Error('Network submission forbidden')},requestSubmit(){throw Error('Native submission forbidden')}};
  const button={tagName:'BUTTON',type:'submit',form,disabled:false,closest(selector){return selector==='button,input'?this:null},click(){dispatch('click',{target:this})}};
  const input={tagName:'INPUT',type:'text',form,disabled:false};form.elements=[input,button];
  return {form,button,input,dispatch,targets,scrolls,document,flushMicrotasks,flushTasks(){while(tasks.length)tasks.shift()()},setMode:value=>{mode=value}};
}

test('opaque preview submits locally on click and Enter, validates and always cancels native submission',()=>{
  const f=prototypeFixture();f.form.onSubmit=event=>{assert.ok(!event.defaultPrevented);event.preventDefault();f.form.feedback='Saved'};
  assert.equal(f.dispatch('click',{target:f.button}).defaultPrevented,true);assert.equal(f.form.events.length,1);assert.equal(f.form.events[0].submitter,f.button);assert.equal(f.form.events[0].bubbles,true);assert.equal(f.form.events[0].cancelable,true);assert.equal(f.form.events[0].defaultPrevented,true);assert.equal(f.form.feedback,'Saved');
  f.dispatch('keydown',{target:f.input,key:'Enter'});assert.equal(f.form.events.length,2);
  f.form.valid=false;f.dispatch('click',{target:f.button});assert.equal(f.form.events.length,2);assert.equal(f.form.checks,3);
  f.button.formNoValidate=true;f.dispatch('click',{target:f.button});assert.equal(f.form.events.length,3);
  f.button.formNoValidate=false;f.form.noValidate=true;f.dispatch('click',{target:f.button});assert.equal(f.form.events.length,4);
  f.button.disabled=true;f.dispatch('keydown',{target:f.input,key:'Enter'});assert.equal(f.form.events.length,4);
  f.button.disabled=false;f.form.onSubmit=null;f.dispatch('click',{target:f.button});assert.equal(f.form.events.length,5);assert.equal(f.form.events[4].defaultPrevented,true);
  f.dispatch('click',{target:f.button,defaultPrevented:true});f.dispatch('keydown',{target:f.input,key:'Enter',isComposing:true});f.dispatch('keydown',{target:{...f.input,tagName:'TEXTAREA'},key:'Enter'});assert.equal(f.form.events.length,5);
  f.setMode('edit');f.dispatch('click',{target:f.button});f.dispatch('keydown',{target:f.input,key:'Enter'});assert.equal(f.form.events.length,5);
});

test('fragment navigation measures sticky flow position, restores authored styles and leaves external URLs alone',()=>{
  const f=prototypeFixture();let inline='color:red',measured=false;
  const sticky={position:'sticky',style:{setProperty(name,value,priority){assert.equal(name,'position');assert.equal(value,'static');assert.equal(priority,'important');inline='position:static!important'}},getAttribute:()=>inline,setAttribute(name,value){assert.equal(name,'style');inline=value},getBoundingClientRect(){measured=inline==='position:static!important';return {top:-880}},removeAttribute(){inline=null}};
  const link=href=>({target:'',hasAttribute:()=>false,getAttribute:()=>href,closest(){return this}});
  f.targets.set('header',sticky);const click=f.dispatch('click',{target:link('#header'),defaultPrevented:true});assert.equal(click.defaultPrevented,true);assert.equal(measured,false);assert.equal(f.scrolls.length,0);f.flushMicrotasks();assert.equal(measured,true);assert.equal(inline,'color:red');assert.equal(f.scrolls[0].top,8);
  let ordinary=0,focused=0,tabindex=null;f.targets.set('a:b',{getAttribute:()=>tabindex,setAttribute(name,value){assert.equal(name,'tabindex');tabindex=value},removeAttribute(){tabindex=null},focus(options){assert.equal(options.preventScroll,true);assert.equal(tabindex,'-1');focused++},scrollIntoView(){ordinary++}});f.dispatch('click',{target:link('#a%3Ab')});assert.equal(ordinary,1);assert.equal(focused,1);assert.equal(tabindex,null);f.dispatch('click',{target:link('#a%3Ab'),defaultPrevented:true});assert.equal(ordinary,1);
  for(const href of ['https://evil.test/#header','javascript:alert(1)','/page#header','#missing','#%zz'])assert.equal(f.dispatch('click',{target:link(href)}).defaultPrevented,false);
  assert.equal(f.dispatch('click',{target:link('#header'),ctrlKey:true}).defaultPrevented,false);assert.equal(f.scrolls.length,1);
});

test('sticky correction runs after late author handlers with either end-of-dispatch or between-listener microtask checkpoints',()=>{
  for(const checkpointBetweenListeners of [false,true]){
  const f=prototypeFixture({checkpointBetweenListeners});let inline='color:red';
  const sticky={position:'sticky',style:{setProperty(){inline='position:static!important'}},getAttribute:()=>inline,setAttribute(_name,value){inline=value},removeAttribute(){inline=null},getBoundingClientRect(){return {top:-900}},scrollIntoView(){f.scrolls.push({author:true,top:900})}};
  const link={target:'',hasAttribute:()=>false,getAttribute:()=>'#header',closest(selector){return selector==='a[href]'?this:null}};
  f.targets.set('header',sticky);
  // The authored body script installs this delegated handler after the bridge.
  f.document.addEventListener('click',event=>{event.preventDefault();inline='color:blue';sticky.scrollIntoView({behavior:'smooth',block:'start'})});
  f.dispatch('click',{target:link});
  assert.deepEqual(f.scrolls,[{author:true,top:900}]);
  f.flushMicrotasks();if(checkpointBetweenListeners){assert.equal(f.scrolls.length,1);f.flushTasks()}assert.equal(f.scrolls.length,2);assert.equal(f.scrolls[1].top,0);assert.equal(inline,'color:blue');
  f.scrolls.length=0;const ordinary={scrollIntoView(){f.scrolls.push({ordinary:true})}};f.targets.set('header',ordinary);
  f.dispatch('click',{target:link});const authoredLast=f.scrolls.at(-1);assert.equal(authoredLast.author,true);f.flushMicrotasks();f.flushTasks();assert.equal(f.scrolls.at(-1),authoredLast);
  }
});

test('queued sticky corrections skip detached targets, changed positioning and leaving preview',()=>{
  for(const change of [(f,node)=>{node.isConnected=false},(f,node)=>{node.position='static'},f=>f.setMode('edit')]){
    const f=prototypeFixture(),node={position:'sticky',isConnected:true},link={target:'',hasAttribute:()=>false,getAttribute:()=>'#header',closest(){return this}};
    f.targets.set('header',node);f.dispatch('click',{target:link});change(f,node);f.flushMicrotasks();assert.equal(f.scrolls.length,0);
  }
});

function bridgeDOMNode(tag,attrs={},text=''){
  const attributes=new Map(Object.entries(attrs));const node={tagName:tag.toUpperCase(),parentElement:null,children:[],textContent:text,hidden:false,isConnected:true,bounds:{left:10,top:20,width:30,height:40},get id(){return attributes.get('id')||''},get attributes(){return [...attributes].map(([name,value])=>({name,value}))},getAttribute:name=>attributes.get(name)??null,hasAttribute:name=>attributes.has(name),setAttribute:(name,value)=>attributes.set(name,String(value)),removeAttribute:name=>attributes.delete(name),getBoundingClientRect(){return {...this.bounds,right:this.bounds.left+this.bounds.width,bottom:this.bounds.top+this.bounds.height}},closest(selector){const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);for(let current=this;current;current=current.parentElement)if(match&&current.hasAttribute(match[1])&&(match[2]===undefined||current.getAttribute(match[1])===match[2]))return current;return null},scrollIntoView(){this.scrolled=true},get outerHTML(){return this.htmlOverride??'<'+tag+[...attributes].map(([name,value])=>' '+name+'="'+value+'"').join('')+'>'+text+this.children.map(child=>child.outerHTML).join('')+'</'+tag+'>'}};return node;
}
function runningBridge({artifact,body=[]}={}){
  const nodes=[...body],events=new Map(),documentEvents=new Map(),sent=[],timers=[];let hit=nodes[0]||null,mutation;
  const root=bridgeDOMNode('html');root.scrollWidth=1000;root.scrollHeight=2000;
  const document={documentElement:root,readyState:'loading',querySelectorAll(selector){const attr=selector.slice(1,-1);return nodes.filter(node=>node.isConnected&&node.hasAttribute(attr))},elementFromPoint:()=>hit,addEventListener(name,fn){const handlers=documentEvents.get(name)||[];handlers.push(fn);documentEvents.set(name,handlers)}};
  const parent={postMessage:value=>sent.push(value)},window={__DSH_DESIGN_RUNTIME__:{getState:()=>({scene:'scene-preview'})}};
  const globals={CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},document,parent,window,scrollX:4,scrollY:7,innerWidth:800,innerHeight:600,addEventListener(name,fn){events.set(name,fn)},getComputedStyle:node=>({display:'block',visibility:'visible',transform:'none',zoom:'1',flexDirection:'row',...node.computed,getPropertyValue:name=>node.computed?.[name]??(name==='display'?'block':'')}),setTimeout(fn){timers.push(fn);return timers.length},MutationObserver:class{constructor(fn){mutation=fn}observe(){}},ResizeObserver:class{observe(){}}};
  const framed=frameDocument('<!doctype html><html><head></head><body></body></html>',{token:'bridge-token',pageId:'page-one',artifact,origin});
  const bridge=nodesOfFrame(framed).find(node=>attr(node,'data-dsh-editor-bridge'));
  vm.runInNewContext(bridge.childNodes[0].value,globals);
  let request=0;
  return {nodes,document,window,parent,sent,setHit:node=>{hit=node},mutate:records=>mutation(records),command(command,args={},override={}){const before=sent.length;events.get('message')({source:parent,data:{channel:FRAME_CHANNEL,token:'bridge-token',pageId:'page-one',kind:'command',requestId:String(++request),command,args},...override});return sent.length===before?undefined:sent.at(-1).value}};
}
const nodesOfFrame=html=>nodes(parse(html));
const sourceRecord=(id,tag)=>({id,path:'src/App.jsx',tag,start:0,end:30,line:1,column:1,sourceHash:'a'.repeat(64),native:true});
const frameworkArtifact={kind:'react',entry:'src/App.jsx',version:'v-one',buildId:'build-one',manifest:[sourceRecord('src_list','ul'),sourceRecord('src_item','li')]};

test('injected framework bridge resolves hit measure box parent and late DOM by exact runtime instances',()=>{
  const list=bridgeDOMNode('ul',{'data-dsh-source':'src_list'}),a=bridgeDOMNode('li',{'data-dsh-source':'src_item','data-dsh-path':'../private'}),b=bridgeDOMNode('li',{'data-dsh-source':'src_item','data-dsh-instance':'forged'});a.parentElement=list;b.parentElement=list;list.children=[a,b];list.bounds={left:0,top:0,width:400,height:400};b.bounds.left=50;
  const f=runningBridge({artifact:frameworkArtifact,body:[list,a,b]});f.setHit(a);const first=f.command('hitTest',{x:10,y:20});f.setHit(b);const second=f.command('hitTest',{x:50,y:20});
  assert.notEqual(first.nodeId,second.nodeId);assert.equal(first.nodeId,first.instanceId);assert.equal(first.sourceNodeId,'src_item');assert.equal(first.sourceInstanceCount,2);assert.equal(first.sourceLocator.path,'src/App.jsx');assert.equal(first.sceneId,'scene-preview');assert.equal(first.outerHTMLTruncated,false);assert.ok(first.outerHTML.includes('data-dsh-source="src_item"'));
  assert.equal(f.command('measure',{nodeIds:[first.nodeId]})[0].nodeId,first.nodeId);assert.equal(f.command('measure',{nodeIds:['src_item','forged']}).length,0);
  const parent=f.command('parent',{nodeId:first.nodeId});assert.equal(parent.sourceNodeId,'src_list');assert.equal(first.parentId,parent.nodeId);assert.deepEqual(Array.from(parent.childIds),[first.nodeId,second.nodeId]);
  const box=f.command('boxSelect',{rect:{x:0,y:0,width:100,height:100}});assert.deepEqual(Array.from(box,item=>item.nodeId),[first.nodeId,second.nodeId]);
  const late=bridgeDOMNode('li',{'data-dsh-source':'src_item'});late.parentElement=list;list.children.push(late);f.nodes.push(late);f.mutate([{type:'childList'}]);f.setHit(late);const fresh=f.command('hitTest',{x:10,y:20});assert.notEqual(fresh.nodeId,first.nodeId);assert.equal(fresh.sourceInstanceCount,3);assert.equal(fresh.renderEpoch,1);assert.equal(f.command('measure',{nodeIds:[fresh.nodeId]})[0].nodeId,fresh.nodeId);
  f.mutate([{type:'attributes',attributeName:'data-dsh-instance'}]);assert.equal(f.command('state').renderEpoch,1);
  const raw=bridgeDOMNode('span',{'data-dsh-node':first.nodeId,'data-dsh-instance':first.nodeId,'data-dsh-path':'src/App.jsx'});raw.parentElement=a;f.nodes.push(raw);f.setHit(raw);const reference=f.command('hitTest',{x:10,y:20});assert.equal(reference.referenceOnly,true);assert.equal(reference.nodeId,null);assert.equal(reference.sourceLocator,undefined);assert.equal(reference.parentId,null);
});

test('source.instances resolves trusted source IDs to independent current instances and reports missing mappings without preview style writes',()=>{
  const a=bridgeDOMNode('li',{'data-dsh-source':'src_item'}),b=bridgeDOMNode('li',{'data-dsh-source':'src_item'}),unknown=bridgeDOMNode('li',{'data-dsh-source':'src_unknown'}),wrongTag=bridgeDOMNode('span',{'data-dsh-source':'src_item'}),f=runningBridge({artifact:frameworkArtifact,body:[a,b,unknown,wrongTag]});
  const query=f.command('source.instances',{sourceNodeIds:['src_item','src_item','src_missing'],limit:10});
  assert.equal(query.total,2);assert.equal(query.offset,0);assert.equal(query.truncated,false);assert.equal(query.done,true);assert.equal(query.nextOffset,null);assert.deepEqual(Array.from(query.sourceNodeIds),['src_item','src_missing']);assert.deepEqual({...query.counts},{src_item:2,src_missing:0});assert.deepEqual(Array.from(query.missingSourceNodeIds),['src_missing']);
  assert.notEqual(query.objects[0].nodeId,query.objects[1].nodeId);assert.equal(query.objects[0].sourceNodeId,'src_item');assert.equal(query.objects[0].referenceOnly,false);assert.equal(query.objects[0].documentEpoch,query.documentEpoch);assert.equal(query.objects[0].outerHTML,a.outerHTML);assert.equal(a.getAttribute('style'),null);
  assert.equal(f.command('measure',{nodeIds:['src_item']}).length,0);assert.equal(f.command('measure',{nodeIds:[query.objects[1].nodeId]})[0].nodeId,query.objects[1].nodeId);
  const late=bridgeDOMNode('li',{'data-dsh-source':'src_item'});f.nodes.push(late);f.mutate([{type:'childList'}]);const later=f.command('source.instances',{sourceNodeIds:['src_item']});assert.equal(later.total,3);assert.equal(later.renderEpoch,1);assert.equal(later.objects[0].nodeId,query.objects[0].nodeId);assert.notEqual(later.objects[2].nodeId,query.objects[0].nodeId);
});

test('source.instances pagination is explicit and rejects unpinned or stale document render scene and build contexts',()=>{
  const nodes=Array.from({length:201},()=>bridgeDOMNode('li',{'data-dsh-source':'src_item'})),f=runningBridge({artifact:frameworkArtifact,body:nodes}),first=f.command('source.instances',{sourceNodeIds:['src_item']});
  assert.equal(first.objects.length,200);assert.equal(first.total,201);assert.equal(first.counts.src_item,201);assert.equal(first.truncated,true);assert.equal(first.done,false);assert.equal(first.nextOffset,200);
  const continuation={sourceNodeIds:['src_item'],offset:200,documentEpoch:first.documentEpoch,renderEpoch:first.renderEpoch,sceneId:first.sceneId,artifact:first.artifact},last=f.command('source.instances',continuation);
  assert.equal(last.objects.length,1);assert.equal(last.objects[0].nodeId,nodes[200].getAttribute('data-dsh-instance'));assert.equal(last.nextOffset,null);assert.equal(last.truncated,false);assert.equal(last.total,201);
  assert.ok(f.command('source.instances',{sourceNodeIds:['src_item'],offset:200}).error.includes('first page'));
  for(const patch of [{documentEpoch:'stale'},{renderEpoch:9},{sceneId:'other'},{artifact:{...first.artifact,buildId:'other'}},{artifact:{...first.artifact,version:'other'}}])assert.ok(f.command('source.instances',{...continuation,...patch}).error.includes('context changed'));
  f.mutate([{type:'childList'}]);assert.ok(f.command('source.instances',continuation).error.includes('context changed'));
  for(const args of [{sourceNodeIds:[]},{sourceNodeIds:Array(201).fill('src_item')},{sourceNodeIds:['[data-dsh-source]']},{sourceNodeIds:['src_item'],limit:201},{sourceNodeIds:['src_item'],offset:-1}])assert.ok(f.command('source.instances',args).error);
  assert.ok(runningBridge({body:[bridgeDOMNode('li',{'data-dsh-node':'n-html'})]}).command('source.instances',{sourceNodeIds:['n-html']}).error.includes('React or Vue'));
});

test('real source-instance RPC restores a new frame selection and explicitly rejects truncated loop results',async()=>{
  const item=()=>bridgeDOMNode('li',{'data-dsh-source':'src_item'},'预约🌿'.repeat(35000)),first=runningBridge({artifact:frameworkArtifact,body:[item()]});
  const before=first.command('source.instances',{sourceNodeIds:['src_item']}),next=runningBridge({artifact:{...frameworkArtifact,version:'v-two',buildId:'build-two'},body:[item()]}),state=next.command('state');
  const restored=await readSourceInstances((command,args)=>Promise.resolve(next.command(command,args)),['src_item'],state);
  assert.equal(restored.objects.length,1);assert.notEqual(restored.objects[0].nodeId,before.objects[0].nodeId);assert.equal(restored.objects[0].outerHTMLTruncated,false);assert.equal(restored.objects[0].outerHTML,next.nodes[0].outerHTML);assert.equal(restored.objects[0].artifact.buildId,'build-two');
  const many=runningBridge({artifact:frameworkArtifact,body:Array.from({length:201},()=>bridgeDOMNode('li',{'data-dsh-source':'src_item'}))});
  await assert.rejects(readSourceInstances((command,args)=>Promise.resolve(many.command(command,args)),['src_item'],many.command('state')),error=>error.code==='SOURCE_INSTANCE_LIMIT');
});

test('describe exposes positioning translation transform and border properties for source editing',()=>{
  const item=bridgeDOMNode('li',{'data-dsh-source':'src_item'});item.computed={position:'absolute',left:'10px',top:'20px',right:'auto',bottom:'auto','z-index':'3',translate:'4px 5px',transform:'none','border-color':'rgb(1, 2, 3)','border-width':'2px','border-style':'solid'};
  const f=runningBridge({artifact:frameworkArtifact,body:[item]}),object=f.command('source.instances',{sourceNodeIds:['src_item']}).objects[0];
  for(const [property,value] of Object.entries(item.computed))assert.equal(object.styles[property],value);
});

test('geometry flags independent CSS scale and rotate in parent chains while preserving translate drag baselines',()=>{
  const parent=bridgeDOMNode('div'),item=bridgeDOMNode('li',{'data-dsh-source':'src_item'});item.parentElement=parent;item.computed={translate:'12px 20px'};
  const f=runningBridge({artifact:frameworkArtifact,body:[parent,item]});const pick=()=>f.command('source.instances',{sourceNodeIds:['src_item']}).objects[0];
  assert.equal(pick().transformed,false);parent.computed={scale:'2'};assert.equal(pick().transformed,true);parent.computed={scale:'1 1',rotate:'30deg'};assert.equal(pick().transformed,true);parent.computed={scale:'1 1',rotate:'0deg'};assert.equal(pick().transformed,false);
});

test('injected HTML bridge preserves original node IDs and returns complete or explicitly pageable outerHTML',()=>{
  const small=bridgeDOMNode('p',{'data-dsh-node':'n-small'},'x'.repeat(9000)),large=bridgeDOMNode('article',{'data-dsh-node':'n-large'},'预约🌿'.repeat(50000)),f=runningBridge({body:[small,large]});f.setHit(small);
  const detail=f.command('hitTest',{x:0,y:0});assert.equal(detail.nodeId,'n-small');assert.equal(detail.outerHTML,small.outerHTML);assert.equal(detail.outerHTMLTruncated,false);
  f.setHit(large);const huge=f.command('hitTest',{x:0,y:0});assert.equal(huge.outerHTMLTruncated,true);assert.equal(huge.outerHTMLTotal,large.outerHTML.length);assert.equal(huge.outerHTMLUnit,'utf16');assert.ok(huge.elementReadId);
  const original=large.outerHTML;large.htmlOverride='<article>Changed</article>';let offset=0,content='',page;
  do{page=f.command('element.read',{readId:huge.elementReadId,nodeId:huge.nodeId,documentEpoch:huge.documentEpoch,offset,limit:65536});assert.equal(page.error,undefined);content+=page.content;offset=page.nextOffset;}while(!page.done);
  assert.equal(content,original);assert.equal(f.command('element.read',{readId:huge.elementReadId,documentEpoch:'stale'}).error.includes('epoch'),true);
});

test('real complete-element RPC restores large mapped and reference-only selections from injected bridge snapshots',async()=>{
  for(const mapped of [true,false]){
    const node=bridgeDOMNode('li',mapped?{'data-dsh-source':'src_item'}:{},'预约🌿'.repeat(45000)),f=runningBridge({artifact:frameworkArtifact,body:[node]});
    const detail=f.command('hitTest',{x:0,y:0}),original=node.outerHTML;assert.equal(detail.referenceOnly,!mapped);node.htmlOverride='<li>New render</li>';f.mutate([{type:'childList'}]);
    const restored=await readCompleteElement((command,args)=>Promise.resolve(f.command(command,args)),detail,{limit:4093});
    assert.equal(restored.outerHTML,original);assert.equal(restored.outerHTMLTruncated,false);assert.equal(restored.documentEpoch,detail.documentEpoch);assert.equal(restored.renderEpoch,0);
  }
});

test('artifact config escapes script terminators and selection commands still require the exact parent channel token and page',()=>{
  const hostile={...frameworkArtifact,manifest:[{...sourceRecord('src_item','li'),path:'</script><img src=x>'}]};
  const framed=frameDocument('<html><body>Preview</body></html>',{token:'safe',pageId:'one',artifact:hostile,origin});assert.equal(nodesOfFrame(framed).filter(node=>node.tagName==='img').length,0);
  const f=runningBridge({artifact:hostile,body:[bridgeDOMNode('li',{'data-dsh-source':'src_item'})]});assert.equal(f.command('hitTest',{x:0,y:0}).referenceOnly,true);
  for(const data of [{channel:'other'},{token:'other'},{pageId:'other'},{kind:'response'}])assert.equal(f.command('state',{}, {data:{channel:FRAME_CHANNEL,token:'bridge-token',pageId:'page-one',kind:'command',requestId:'fake',command:'state',...data}}),undefined);
  assert.equal(f.command('state',{}, {source:{}}),undefined);assert.ok(f.command('edit.apply',{}).error.includes('Only read-only'));
});

test('only real document reload/close rejects pending RPC and clears all timers',async()=>{const f=fixture();f.receive('ready',{});const task=f.session.request('state',{});await Promise.resolve();f.session.close('FRAME_RELOADED');await assert.rejects(task,error=>error.code==='FRAME_RELOADED');assert.equal(f.timers.size,0);assert.equal(f.session.pending.size,0);assert.equal(f.receive('ready',{}),false)});

test('only preview reset is forwarded to the document runtime',()=>{
  const f=runningBridge(),events=[];
  f.document.dispatchEvent=event=>events.push(event.type);
  let resets=0;
  f.window.__DSH_DESIGN_RUNTIME__={reset:()=>resets++};
  for (const command of ['scene','elementState','formState']) assert.ok(f.command(command,{}).error);
  assert.equal(f.command('reset').error,undefined);
  assert.equal(resets,1);
  assert.deepEqual(events,['dsh:preview-reset']);
});
