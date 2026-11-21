import {runtimeSelector} from './runtime-style.js';
import {parse,serialize} from 'parse5';
import {createSelectionIdentity} from './selection-identity.js';

import {installDatePicker} from '../date-picker.js';
import {installPageFreeze,patchPageSource} from './freeze.js';
import {captureCurrentState} from "./current-state.js";

/** Runs inside an opaque iframe; every command is a read or a temporary view operation. */
export function installEditorBridge(config,installPrototype,createIdentity=createSelectionIdentity,installLayout,captureState=captureCurrentState,installFreeze,patchSource,installDatePicker,selectorFor=runtimeSelector){
  const nativeTimeout=window.setTimeout?.bind(window)||setTimeout;
  const nativeFrame=window.requestAnimationFrame?.bind(window)||(fn=>nativeTimeout(fn,16));
  if(config.interactive)window.addEventListener('keydown',event=>{
    if(event.isTrusted&&!event.repeat&&event.altKey&&event.shiftKey&&['KeyF','KeyS'].includes(event.code)){
      event.preventDefault();event.stopImmediatePropagation();post(event.code==='KeyS'?'screenshot':'toggleFreeze',{});
    }
  },true);
  const freezePage=config.interactive&&installFreeze?.();
  if(config.interactive)installDatePicker?.(true);
  let frozen=false,positionPreview=null;
  const identity=createIdentity(config,{document});
  const channel='dsh-workbench-frame';let mode=config.mode||'edit';
  installPrototype?.(()=>config.interactive?'preview':mode);
  const editingLayout=installLayout?.(config,()=>mode);
  const redact=value=>String(value||'').replace(/(\/api\/designer\/resource\/)[^/]+\//g,'$1[cap]/').slice(0,2400);
  const post=(kind,value,requestId)=>parent.postMessage({channel,token:config.token,pageId:config.pageId,kind,value,...(requestId?{requestId}:{})},'*');
  if(config.plainPreview){
    window.addEventListener('wheel',event=>{
      if(event.defaultPrevented||!event.cancelable)return;
      // Let authored scroll areas (e.g. an open dialog or horizontal tabs) consume their own axis.
      const horizontal=Math.abs(event.deltaX)>Math.abs(event.deltaY)||event.shiftKey;
      const delta=horizontal?event.deltaX||event.deltaY:event.deltaY;
      if(!event.ctrlKey&&!event.metaKey&&event.composedPath().some(node=>{
        if(!(node instanceof Element))return false;
        const style=getComputedStyle(node);
        if(node===document.scrollingElement)return false;
        const overflow=horizontal?style.overflowX:style.overflowY;
        if(!/^(auto|scroll|overlay)$/.test(overflow))return false;
        const room=horizontal?node.scrollWidth-node.clientWidth:node.scrollHeight-node.clientHeight;
        const offset=horizontal?node.scrollLeft:node.scrollTop;
        return room>1&&(delta>0?offset<room-1:offset>0);
      }))return;
      event.preventDefault();
      post('canvasWheel',{deltaMode:event.deltaMode,deltaX:event.deltaX,deltaY:event.deltaY,clientX:event.clientX,clientY:event.clientY,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey});
    },{passive:false});
  }
  if(config.interactive)document.addEventListener('pointerdown',()=>post('pageActive',{}),true);
  document.addEventListener('keydown',event=>{if(mode==='preview'&&event.key==='Escape'&&!event.isComposing){event.preventDefault();post('exitPreview',{});}});
  const cssNames=['display','position','left','top','right','bottom','z-index','translate','width','height','min-width','max-width','min-height','max-height','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','gap','row-gap','column-gap','flex-direction','flex-wrap','flex-grow','flex-shrink','align-items','align-self','justify-content','justify-self','direction','grid-row-start','grid-row-end','grid-column-start','grid-column-end','grid-template-columns','grid-template-rows','grid-auto-flow','grid-column','grid-row','color','background-color','background-image','font-family','font-size','font-weight','line-height','letter-spacing','text-align','border','border-color','border-width','border-style','border-radius','box-shadow','opacity','overflow','visibility','box-sizing','transform'];
  const all=()=>identity.all(),nodeFor=id=>identity.nodeFor(id),nodeId=node=>identity.identify(node)?.nodeId||null;
  const context=()=>{identity.setScene(window.__DSH_DESIGN_RUNTIME__?.getState?.()?.scene);return identity.context()};
  const locked=node=>!!node?.closest('[data-dsh-locked="true"]');
  const view=()=>{
    const contentHeight=editingLayout?.contentHeight();
    const root=document.documentElement;
    return {x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,documentWidth:root.scrollWidth,documentHeight:root.scrollHeight,contentHeight};
  };
  const transformed=node=>{for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current),rotated=style.rotate&&!['none','0deg','0rad','0turn','0grad'].includes(style.rotate),scaled=style.scale&&style.scale!=='none'&&style.scale.split(/\s+/).some(value=>Number(value)!==1);if(style.transform!=='none'&&style.transform||rotated||scaled||style.zoom&&Number.isFinite(parseFloat(style.zoom))&&parseFloat(style.zoom)!==1)return true}return false};
  const referenceIds=new WeakMap(),references=new Map();
  let referenceSequence=0;
  function liveReference(node){
    let id=referenceIds.get(node);
    if(!id){
      id=config.token+'-'+(++referenceSequence);
      referenceIds.set(node,id);
    }
    references.set(id,new WeakRef(node));
    if(references.size>256&&referenceSequence%128===0)for(const [key,ref] of references)if(!ref.deref()?.isConnected)references.delete(key);
    return {referenceId:id,runtimeSelector:!config.artifact||config.artifact.kind==='html'?selectorFor(node):null};
  }
  function target(args){
    if(!args.referenceId)return nodeFor(args.nodeId);
    const node=references.get(args.referenceId)?.deref();
    return node?.isConnected?node:null;
  }
  function describe(node){
    if(!node)return null;const runtimeContext=context(),mapped=identity.identify(node),bounds=node.getBoundingClientRect(),style=getComputedStyle(node);
    const childElements=Array.from(node.children).filter(child=>!child.hasAttribute('data-dsh-controlled')).map((child,index)=>({nodeId:nodeId(child),sourceNodeId:identity.identify(child)?.sourceNodeId||null,index,tag:child.tagName.toLowerCase()}));
    const inset=(a,b,c,e)=>style.boxSizing==='border-box'?0:[a,b,c,e].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
    return {inspectorFontSize:style.fontSize,inspectorInsets:{width:inset('paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'),height:inset('paddingTop','paddingBottom','borderTopWidth','borderBottomWidth')},...runtimeContext,...(mapped||{id:null,nodeId:null,...liveReference(node)}),...(mapped?.sourceNodeId?{sourceInstanceCount:identity.sourceInstanceCount(mapped.sourceNodeId)}:{}),...identity.element(node,mapped),tag:node.tagName.toLowerCase(),name:node.getAttribute('aria-label')||node.getAttribute('data-name')||node.id||node.tagName.toLowerCase(),text:node.textContent||'',parentId:mapped?nodeId(identity.parent(node)):null,childIds:childElements.map(child=>child.nodeId).filter(Boolean),childElements,elementChildCount:childElements.length,attributes:Object.fromEntries(Array.from(node.attributes).filter(attribute=>!/^on/i.test(attribute.name)).map(attribute=>[attribute.name,attribute.value])),styles:Object.fromEntries(cssNames.map(name=>[name,style.getPropertyValue(name)])),parentStyles:node.parentElement?{display:getComputedStyle(node.parentElement).display,'flex-direction':getComputedStyle(node.parentElement).flexDirection}:null,locked:locked(node),hidden:node.hidden||style.display==='none'||style.visibility==='hidden',bounds:{x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height},documentBounds:{x:bounds.left+scrollX,y:bounds.top+scrollY,width:bounds.width,height:bounds.height},transformed:transformed(node),referenceOnly:!mapped};
  }
  function hit(x,y,includeLocked){const node=document.elementFromPoint(x,y);if(!node)return null;const mapped=identity.identify(node);if(locked(node)&&!includeLocked)return {locked:true,...(mapped||{nodeId:null,referenceOnly:true})};return describe(node)}
  addEventListener('message',event=>{
    const packet=event.data;if(event.source!==parent||packet?.channel!==channel||packet.token!==config.token||packet.pageId!==config.pageId||packet.kind!=='command'||typeof packet.requestId!=='string')return;
    const {command,args={},requestId}=packet;let value;
    try{switch(command){
      case 'reference.measure':value=describe(target(args));break;
      case 'hitTest':if(![args.x,args.y].every(Number.isFinite))throw new Error('Invalid hit coordinates');value=hit(args.x,args.y,args.includeLocked===true);break;
      case 'measure':if(!Array.isArray(args.nodeIds))throw new Error('Invalid measurement selection');value=args.nodeIds.slice(0,200).map(id=>describe(nodeFor(id))).filter(Boolean);break;
      case 'previewPosition':{
        positionPreview?.cancel();positionPreview=null;
        if(config.interactive&&Number.isFinite(args.dx)&&Number.isFinite(args.dy)){
          const element=target(args);
          if(element&&!locked(element)){
            const frame={translate:args.dx+'px '+args.dy+'px',composite:'add'};
            positionPreview=element.animate([frame,frame],{duration:1,fill:'both'});positionPreview.pause();
          }
        }
        value={applied:!!positionPreview};break;
      }
      case 'snapGuides':{
        const node=target(args),parent=node?.parentElement;
        const vertical=new Set(),horizontal=new Set(),siblings=[];
        if(parent)for(const el of [parent,...parent.children]){
          if(el===node||!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
          const r=el.getBoundingClientRect();
          if(r.width<=0||r.height<=0||r.right<0||r.bottom<0||r.left>innerWidth||r.top>innerHeight)continue;
          if(el!==parent)siblings.push({id:nodeId(el),bounds:{x:r.x,y:r.y,width:r.width,height:r.height}});
          for(const x of [r.left,r.left+r.width/2,r.right])vertical.add(x);
          for(const y of [r.top,r.top+r.height/2,r.bottom])horizontal.add(y);
          if(vertical.size+horizontal.size>2000)break;
        }
        value={vertical:[...vertical],horizontal:[...horizontal],siblings,parentStyles:parent?Object.fromEntries(['display','flex-direction','grid-auto-flow','direction'].map(name=>[name,getComputedStyle(parent).getPropertyValue(name)])):{}};
        break;
      }
      case 'boxSelect':{const rect=args.rect;if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<0||rect.height<0)throw new Error('Invalid selection rectangle');const found=all().filter(node=>{const box=node.getBoundingClientRect(),style=getComputedStyle(node);return !locked(node)&&!['HTML','BODY'].includes(node.tagName)&&style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0&&box.left>=rect.x&&box.top>=rect.y&&box.right<=rect.x+rect.width&&box.bottom<=rect.y+rect.height});const ids=new Set(found.map(nodeId));value=found.filter(node=>!ids.has(nodeId(identity.parent(node)))).slice(0,200).map(describe);break;}
      case 'parent':value=describe(identity.parent(nodeFor(args.nodeId)));break;
      case 'element.read':value=identity.readElement(args);break;
      case 'source.instances':{
        if(!Array.isArray(args.sourceNodeIds)||args.sourceNodeIds.length<1||args.sourceNodeIds.length>200||args.sourceNodeIds.some(id=>typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(id)))throw new Error('Choose 1–200 valid source node IDs');
        const offset=args.offset??0,limit=args.limit??200,state=context();
        if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('Invalid source.instances range; limit is at most 200');
        if(!['react','vue'].includes(state.artifact.kind))throw new Error('Source instance lookup requires a React or Vue artifact');
        if(offset>0&&(typeof args.documentEpoch!=='string'||!Number.isSafeInteger(args.renderEpoch)||args.sceneId!==null&&typeof args.sceneId!=='string'))throw new Error('Continue source.instances with the first page documentEpoch, renderEpoch and sceneId');
        if(['documentEpoch','renderEpoch','sceneId'].some(key=>args[key]!==undefined&&args[key]!==state[key])||args.artifact&&['kind','entry','version','buildId'].some(key=>args.artifact[key]!==state.artifact[key]))throw new Error('Source instance context changed; restart the query for this document build');
        const sourceNodeIds=[...new Set(args.sourceNodeIds)],counts=new Map(sourceNodeIds.map(id=>[id,0]));
        const found=all().filter(node=>{const sourceId=identity.identify(node)?.sourceNodeId;if(!counts.has(sourceId))return false;counts.set(sourceId,counts.get(sourceId)+1);return true});
        if(offset>found.length)throw new Error('Source instance offset exceeds the current result');
        const objects=found.slice(offset,offset+limit).map(describe),endOffset=offset+objects.length,current=context();
        if(current.renderEpoch!==state.renderEpoch||current.sceneId!==state.sceneId)throw new Error('Source instance context changed during query; restart the query');
        value={objects,sourceNodeIds,counts:Object.fromEntries(counts),missingSourceNodeIds:sourceNodeIds.filter(id=>counts.get(id)===0),total:found.length,offset,limit,nextOffset:endOffset<found.length?endOffset:null,truncated:endOffset<found.length,done:endOffset===found.length,...state};break;
      }
      case 'scroll':{
        let scroller;
        if(args.at){for(let n=document.elementFromPoint(args.at.x,args.at.y);n;n=n.parentElement){
          const css=getComputedStyle(n);
          if((args.y&&/auto|scroll/.test(css.overflowY)&&(args.y>0?n.scrollTop+n.clientHeight<n.scrollHeight-1:n.scrollTop>0))||(args.x&&/auto|scroll/.test(css.overflowX)&&n.scrollWidth>n.clientWidth)){scroller=n;break}
        }}
        (scroller?scroller.scrollBy.bind(scroller):scrollBy)({left:Math.max(-10000,Math.min(10000,Number(args.x)||0)),top:Math.max(-10000,Math.min(10000,Number(args.y)||0)),behavior:'instant'});value=view();break;}
      case 'restoreScroll':scrollTo({left:Math.max(0,Number(args.x)||0),top:Math.max(0,Number(args.y)||0),behavior:'instant'});value=view();break;
      case 'locate':{const node=nodeFor(args.nodeId);node?.scrollIntoView({block:'center',inline:'center',behavior:'instant'});value={object:describe(node),view:view()};break;}
      case 'mode':mode=args.mode==='preview'?'preview':'edit';document.documentElement.setAttribute('data-dsh-view-mode',mode);editingLayout?.invalidate();layout();value={mode};break;
      case 'reset':if(!window.__DSH_DESIGN_RUNTIME__?.reset)throw new Error('Preview runtime is not ready');window.__DSH_DESIGN_RUNTIME__.reset();document.dispatchEvent(new CustomEvent('dsh:preview-reset',{detail:{applied:true}}));value={reset:true};break;
      case 'freeze':positionPreview?.cancel();positionPreview=null;if(!freezePage)throw Error('页面暂不支持冻结');frozen=args.enabled===true;freezePage(frozen);value={frozen};break;
      case 'patchSource':if(!config.interactive||!patchSource)throw Error('页面不支持局部刷新');value={applied:patchSource(args.before,args.after)};layout();break;
      case 'captureScreenshotState':value={...captureState({screenshot:true}),viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY}};break;
      case 'captureState':value=captureState();break;
      case 'state':value={pageId:config.pageId,mode,...view(),...context(),runtime:window.__DSH_DESIGN_RUNTIME__?.getState?.()||null};break;
      default:throw new Error('Only read-only geometry and temporary view commands are accepted');
    }post('response',value,requestId);}catch(error){post('response',{error:redact(error.message||error)},requestId)}
  });
  let queued;
  addEventListener('scroll',()=>{if(queued)return;queued=nativeFrame(()=>{queued=null;post('scroll',view())})},{passive:true,capture:true});
  addEventListener('error',event=>post('diagnostic',{code:'PREVIEW_RUNTIME_ERROR',severity:'error',message:redact(event.message||'Resource failed to load'),source:redact(event.filename||event.target?.src||event.target?.href),line:event.lineno||null}),true);
  addEventListener('unhandledrejection',event=>post('diagnostic',{code:'PREVIEW_ASYNC_ERROR',severity:'error',message:redact(event.reason?.message||event.reason||'Unhandled rejection')}));
  document.addEventListener('securitypolicyviolation',event=>post('diagnostic',{code:'PREVIEW_RESOURCE_BLOCKED',severity:'warning',message:'预览隔离策略阻止了 '+redact(event.blockedURI),directive:event.effectiveDirective}));
  document.addEventListener('dsh:navigate',event=>{if(typeof event.detail?.pageId==='string')post('navigate',{pageId:event.detail.pageId})});
  let layoutTimer;const layout=()=>{editingLayout?.invalidate();if(layoutTimer)return;layoutTimer=nativeTimeout(()=>{layoutTimer=null;post('layout',view())},80)};
  new MutationObserver(records=>{if(records.some(record=>record.type!=='attributes'||!['data-dsh-instance','data-dsh-view-mode','data-dsh-editor-expand'].includes(record.attributeName)))identity.advanceRender();layout()}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});new ResizeObserver(layout).observe(document.documentElement);document.fonts?.ready?.then(layout);addEventListener('resize',layout);document.addEventListener('load',layout,true);document.addEventListener('transitionend',layout);document.addEventListener('animationend',layout);
  const ready=()=>{document.documentElement.setAttribute('data-dsh-view-mode',mode);post('ready',{pageId:config.pageId,mode,...view(),...context(),runtime:!!window.__DSH_DESIGN_RUNTIME__})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>nativeTimeout(ready,0),{once:true});else setTimeout(ready,0);
}

/** Expand the document on the canvas while resolving viewport units against its design size. */
export function installEditingLayout(config,getMode){
  if(!config.interactive)return null;
  const baseHeight=Math.max(100,Number(config.viewport?.height)||800);
  const style=document.createElement('style');
  style.setAttribute('data-dsh-controlled','editor-layout');
  const root=config.plainPreview?'html':'html[data-dsh-view-mode=edit]';
  style.textContent=`
    html{--dsh-editor-vh:1vh;--dsh-editor-dvh:1dvh;--dsh-editor-svh:1svh;--dsh-editor-lvh:1lvh}
    ${root}{--dsh-editor-vh:${baseHeight/100}px;--dsh-editor-dvh:${baseHeight/100}px;--dsh-editor-svh:${baseHeight/100}px;--dsh-editor-lvh:${baseHeight/100}px}
    ${config.livePage||config.plainPreview?'':`${root},${root} body{min-height:${baseHeight}px!important}`}
    ${root},${root} body,${root} [data-dsh-editor-expand]{height:auto!important;max-height:none!important;overflow-y:visible!important}
    ${root} [data-dsh-editor-expand]{flex-shrink:0!important}
  `;
  document.head.append(style);
  let dirty=true;
  // Keep viewport units tied to the design viewport as the editing frame grows.
  // Quoted text and resource URLs are preserved verbatim.
  const units=/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\))|(-?(?:\d*\.)?\d+)([dsl]?vh)\b/gi;
  const rewrite=declaration=>{
    for(const name of Array.from(declaration)){
      const value=declaration.getPropertyValue(name);
      const next=value.replace(units,(match,literal,amount,unit)=>literal?match:`calc(${amount} * var(--dsh-editor-${unit.toLowerCase()}))`);
      if(next!==value)declaration.setProperty(name,next,declaration.getPropertyPriority(name));
    }
  };
  const rewriteRules=rules=>{for(const rule of Array.from(rules)){if(rule.style)rewrite(rule.style);if(rule.cssRules)rewriteRules(rule.cssRules);}};
  const update=()=>{
    if(!dirty||(!config.plainPreview&&getMode()!=='edit'))return;
    dirty=false;
    for(const sheet of Array.from(document.styleSheets)){
      if(sheet.ownerNode?.hasAttribute('data-dsh-controlled'))continue;
      try{rewriteRules(sheet.cssRules);}catch{/* Cross-origin sheets retain their authored rules. */}
    }
    const scrollers=[];
    for(const node of document.body?.querySelectorAll('*')||[]){
      if(node.hasAttribute('style'))rewrite(node.style);
      if(node.matches('textarea,select,iframe')||node.closest('dialog,[role=dialog],[role=listbox],[popover],ds-popup,ds-drawer,ds-action-sheet'))continue;
      const computed=getComputedStyle(node);
      if(node.scrollHeight<=node.clientHeight+1)continue;
      if(config.plainPreview){
        // A page-sized scroll shell belongs to the canvas. Local fields, menus and cards can still scroll.
        if(node.clientWidth<innerWidth*.5||node.clientHeight<Math.min(baseHeight,innerHeight)*.45)continue;
        if(!/^(auto|scroll|hidden|clip|overlay)$/.test(computed.overflowY))continue;
      }else if(!/^(auto|scroll)$/.test(computed.overflowY))continue;
      scrollers.push(node);
    }
    if(document.body?.hasAttribute('style'))rewrite(document.body.style);
    for(const scroller of scrollers){
      for(let node=scroller;node&&node!==document.body;node=node.parentElement){
        if(!node.hasAttribute('data-dsh-editor-expand'))node.setAttribute('data-dsh-editor-expand','');
      }
    }
  };
  return {
    invalidate(){dirty=true;},
    contentHeight(){
      update();
      const body=document.body;
      if(config.plainPreview){
        const bottom=(body?.getBoundingClientRect().bottom||0)+scrollY;
        const margin=body?parseFloat(getComputedStyle(body).marginBottom)||0:0;
        const overflow=document.documentElement.scrollHeight;
        return Math.ceil(Math.max(100,bottom+margin,(body?.offsetTop||0)+(body?.scrollHeight||0),overflow>innerHeight?overflow:0));
      }
      const overlay=config.livePage&&document.querySelector('dialog[open],:popover-open,[role="dialog"]:not([hidden]),ds-drawer[open],ds-dialog[open]');
      return Math.ceil(Math.max(config.livePage&&!overlay?100:baseHeight,body?.scrollHeight||0,body?.offsetHeight||0,(body?.getBoundingClientRect().bottom||0)+scrollY));
    },
  };
}

/** Local prototype actions work without granting sandbox form/navigation privileges. */
export function installLocalPrototypeInteractions(getMode){
  const preview=()=>getMode()==='preview',localSubmissions=new WeakSet();
  const submitterFor=target=>target?.closest?.('button,input');
  const isSubmitter=node=>node?.form&&!node.disabled&&!node.matches?.(':disabled')&&(node.tagName==='BUTTON'&&node.type==='submit'||node.tagName==='INPUT'&&['submit','image'].includes(node.type));
  const submit=(form,submitter)=>{
    if(!form||submitter?.matches?.(':disabled'))return;
    if(!form.noValidate&&!submitter?.formNoValidate&&!form.reportValidity())return;
    // Dispatch only the event: never call submit/requestSubmit or follow action URLs.
    const event=new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:submitter||null});
    localSubmissions.add(event);
    try{form.dispatchEvent(event)}finally{event.preventDefault();localSubmissions.delete(event)}
  };
  document.addEventListener('submit',event=>{if(!localSubmissions.has(event))event.preventDefault()},true);
  document.addEventListener('click',event=>{
    if(!preview()||event.defaultPrevented||event.button!==0)return;
    const button=submitterFor(event.target);
    if(isSubmitter(button)){event.preventDefault();submit(button.form,button)}
  });
  document.addEventListener('keydown',event=>{
    if(!preview()||event.defaultPrevented||event.key!=='Enter'||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const field=event.target;
    if(field?.tagName!=='INPUT'||!field.form||field.disabled||!['text','search','url','tel','email','password','date','month','week','time','datetime-local','number'].includes(field.type))return;
    const form=field.form,button=Array.from(form.elements).find(node=>node.tagName==='BUTTON'&&node.type==='submit'||node.tagName==='INPUT'&&['submit','image'].includes(node.type));
    if(button){event.preventDefault();if(!button.disabled)button.click();return;}
    const blockers=Array.from(form.elements).filter(node=>node.tagName==='INPUT'&&['text','search','url','tel','email','password','date','month','week','time','datetime-local','number'].includes(node.type));
    if(blockers.length===1){event.preventDefault();submit(form,null)}
  });
  document.addEventListener('click',event=>{
    if(!preview()||event.button!==0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const link=event.target?.closest?.('a[href]'),href=link?.getAttribute('href');
    if(!href?.startsWith('#')||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
    let id;try{id=decodeURIComponent(href.slice(1))}catch{return}
    const target=id?document.getElementById(id):document.documentElement;if(!target)return;
    const style=getComputedStyle(target),sticky=style.position==='sticky';
    // Authored handlers retain regular scrolling; sticky targets need their flow
    // position because scrollIntoView sees the already pinned viewport rectangle.
    if(event.defaultPrevented&&!sticky)return;
    if(!event.defaultPrevented&&typeof target.focus==='function'){
      const tabindex=target.getAttribute('tabindex');
      if(tabindex===null)target.setAttribute('tabindex','-1');
      try{target.focus({preventScroll:true})}finally{if(tabindex===null)target.removeAttribute('tabindex')}
    }
    event.preventDefault();
    if(!sticky){target.scrollIntoView({block:'start'});return;}
    // Body scripts can register delegated click handlers after this head bridge.
    // Correct the pinned target only after their synchronous scrollIntoView calls.
    const correctSticky=()=>{
      if(!preview()||target.isConnected===false)return;
      const currentStyle=getComputedStyle(target);if(currentStyle.position!=='sticky')return;
      const saved=target.getAttribute('style');let top;
      try{target.style.setProperty('position','static','important');top=target.getBoundingClientRect().top+scrollY-(parseFloat(currentStyle.scrollMarginTop)||0)}
      finally{if(saved===null)target.removeAttribute('style');else target.setAttribute('style',saved)}
      scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    };
    queueMicrotask(()=>{
      // Trusted browser events can checkpoint microtasks between listeners. If
      // dispatch is still active, yield one task so later author handlers finish.
      if(event.eventPhase)setTimeout(correctSticky,0);else correctSticky();
    });
  });
}

const attr=(node,name)=>node.attrs?.find(attribute=>attribute.name===name)?.value;
const setAttr=(node,name,value)=>{node.attrs ||= [];node.attrs.push({name,value})};
const text=value=>({nodeName:'#text',value});
function make(tag,attributes={},value){const node={nodeName:tag,tagName:tag,namespaceURI:'http://www.w3.org/1999/xhtml',attrs:Object.entries(attributes).map(([name,value])=>({name,value})),childNodes:[]};if(value!==undefined){const child=text(value);child.parentNode=node;node.childNodes.push(child)}return node}
function walk(root,fn){fn(root);for(const child of root.childNodes||[])walk(child,fn);if(root.content)walk(root.content,fn)}
export function trustedAssetRoot(assetBase,origin){if(!assetBase)return null;const base=new URL(assetBase,origin),expected=new URL(origin);const match=base.pathname.match(/^(\/api\/designer\/resource\/[A-Za-z0-9_-]{24,128}\/[^/]+\/)/);if(base.origin!==expected.origin||!match)throw new Error('预览资源地址必须来自当前项目的受控资源路由。');return {base:base.href,root:base.origin+match[1]}}
export function previewPolicy(assetBase,origin){const asset=trustedAssetRoot(assetBase,origin),local=asset?.root||'';return {base:asset?.base,csp:`default-src 'none'; img-src data: blob: ${local}; media-src data: blob: ${local}; font-src data: ${local}; style-src 'unsafe-inline' ${local}; script-src 'unsafe-inline' ${local}; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri ${local||"'none'"}; navigate-to 'none'`}}
export function frameDocument(html,{token,pageId,assetBase,mode='edit',interactive=false,plainPreview=false,viewport,artifact,origin=globalThis.location?.origin||'http://localhost'}={}){
  if (artifact?.kind==='schema') artifact=Object.fromEntries(['kind','entry','version','buildId'].map(key=>[key,artifact[key]]));
  const policy=previewPolicy(assetBase,origin),root=parse(String(html||'<!doctype html><html><head></head><body></body></html>'));let head;
  walk(root,node=>{if(node.tagName==='head')head=node;if(!node.childNodes)return;node.childNodes=node.childNodes.filter(child=>child.tagName!=='base'&&!(child.tagName==='meta'&&['content-security-policy','refresh'].includes((attr(child,'http-equiv')||'').toLowerCase())))});
  const config=JSON.stringify({token,pageId,mode,interactive,plainPreview,livePage:interactive&&!artifact,viewport,...(artifact?{artifact}:{})}).replaceAll('<','\\u003c');const injected=[make('meta',{'http-equiv':'Content-Security-Policy',content:policy.csp}),...(policy.base?[make('base',{href:policy.base})]:[]),make('script',{'data-dsh-editor-bridge':'true'},`(${installEditorBridge.toString()})(${config},${installLocalPrototypeInteractions.toString()},${createSelectionIdentity.toString()},${installEditingLayout.toString()},${captureCurrentState.toString()},${installPageFreeze.toString()},${patchPageSource.toString()},${installDatePicker.toString()},${runtimeSelector.toString()});`)];
  if(plainPreview)injected.push(make('style',{'data-dsh-controlled':'preview-scrollbars'},'html,body,*{scrollbar-width:none!important;scrollbar-gutter:auto!important}::-webkit-scrollbar{display:none!important}'));
  for(const node of injected)node.parentNode=head;head.childNodes.unshift(...injected);return serialize(root);
}
