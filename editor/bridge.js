import {parse,serialize} from 'parse5';
import {createSelectionIdentity} from './selection-identity.js';

/** Runs inside an opaque iframe; every command is a read or a temporary view operation. */
export function installEditorBridge(config,installPrototype,createIdentity=createSelectionIdentity){
  const identity=createIdentity(config,{document});
  const channel='dsh-workbench-frame';let mode=config.mode||'edit';
  installPrototype?.(()=>mode);
  const redact=value=>String(value||'').replace(/(\/api\/designer\/resource\/)[^/]+\//g,'$1[cap]/').slice(0,2400);
  const post=(kind,value,requestId)=>parent.postMessage({channel,token:config.token,pageId:config.pageId,kind,value,...(requestId?{requestId}:{})},'*');
  const cssNames=['display','position','left','top','right','bottom','z-index','translate','width','height','min-width','max-width','min-height','max-height','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','gap','row-gap','column-gap','flex-direction','flex-wrap','flex-grow','flex-shrink','align-items','align-self','justify-content','justify-self','grid-template-columns','grid-template-rows','grid-auto-flow','grid-column','grid-row','color','background-color','background-image','font-family','font-size','font-weight','line-height','letter-spacing','text-align','border','border-color','border-width','border-style','border-radius','box-shadow','opacity','overflow','visibility','box-sizing','transform'];
  const all=()=>identity.all(),nodeFor=id=>identity.nodeFor(id),nodeId=node=>identity.identify(node)?.nodeId||null;
  const context=()=>{identity.setScene(window.__DSH_DESIGN_RUNTIME__?.getState?.()?.scene);return identity.context()};
  const locked=node=>!!node?.closest('[data-dsh-locked="true"]');
  const view=()=>({x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight});
  const transformed=node=>{for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current),rotated=style.rotate&&!['none','0deg','0rad','0turn','0grad'].includes(style.rotate),scaled=style.scale&&style.scale!=='none'&&style.scale.split(/\s+/).some(value=>Number(value)!==1);if(style.transform!=='none'&&style.transform||rotated||scaled||style.zoom&&Number.isFinite(parseFloat(style.zoom))&&parseFloat(style.zoom)!==1)return true}return false};
  function describe(node){
    if(!node)return null;const runtimeContext=context(),mapped=identity.identify(node),bounds=node.getBoundingClientRect(),style=getComputedStyle(node);
    const childElements=Array.from(node.children).filter(child=>!child.hasAttribute('data-dsh-controlled')).map((child,index)=>({nodeId:nodeId(child),sourceNodeId:identity.identify(child)?.sourceNodeId||null,index,tag:child.tagName.toLowerCase()}));
    return {...runtimeContext,...(mapped||{id:null,nodeId:null}),...(mapped?.sourceNodeId?{sourceInstanceCount:identity.sourceInstanceCount(mapped.sourceNodeId)}:{}),...identity.element(node,mapped),tag:node.tagName.toLowerCase(),name:node.getAttribute('aria-label')||node.getAttribute('data-name')||node.id||node.tagName.toLowerCase(),text:node.textContent||'',parentId:mapped?nodeId(identity.parent(node)):null,childIds:childElements.map(child=>child.nodeId).filter(Boolean),childElements,elementChildCount:childElements.length,attributes:Object.fromEntries(Array.from(node.attributes).filter(attribute=>!/^on/i.test(attribute.name)).map(attribute=>[attribute.name,attribute.value])),styles:Object.fromEntries(cssNames.map(name=>[name,style.getPropertyValue(name)])),parentStyles:node.parentElement?{display:getComputedStyle(node.parentElement).display,'flex-direction':getComputedStyle(node.parentElement).flexDirection}:null,locked:locked(node),hidden:node.hidden||style.display==='none'||style.visibility==='hidden',bounds:{x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height},documentBounds:{x:bounds.left+scrollX,y:bounds.top+scrollY,width:bounds.width,height:bounds.height},transformed:transformed(node),referenceOnly:!mapped};
  }
  function hit(x,y,includeLocked){const node=document.elementFromPoint(x,y);if(!node)return null;const mapped=identity.identify(node);if(locked(node)&&!includeLocked)return {locked:true,...(mapped||{nodeId:null,referenceOnly:true})};return describe(node)}
  addEventListener('message',event=>{
    const packet=event.data;if(event.source!==parent||packet?.channel!==channel||packet.token!==config.token||packet.pageId!==config.pageId||packet.kind!=='command'||typeof packet.requestId!=='string')return;
    const {command,args={},requestId}=packet;let value;
    try{switch(command){
      case 'hitTest':if(![args.x,args.y].every(Number.isFinite))throw new Error('Invalid hit coordinates');value=hit(args.x,args.y,args.includeLocked===true);break;
      case 'measure':if(!Array.isArray(args.nodeIds))throw new Error('Invalid measurement selection');value=args.nodeIds.slice(0,200).map(id=>describe(nodeFor(id))).filter(Boolean);break;
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
      case 'scroll':scrollBy({left:Math.max(-10000,Math.min(10000,Number(args.x)||0)),top:Math.max(-10000,Math.min(10000,Number(args.y)||0)),behavior:'instant'});value=view();break;
      case 'restoreScroll':scrollTo({left:Math.max(0,Number(args.x)||0),top:Math.max(0,Number(args.y)||0),behavior:'instant'});value=view();break;
      case 'locate':{const node=nodeFor(args.nodeId);node?.scrollIntoView({block:'center',inline:'center',behavior:'instant'});value={object:describe(node),view:view()};break;}
      case 'mode':mode=args.mode==='preview'?'preview':'edit';document.documentElement.setAttribute('data-dsh-view-mode',mode);value={mode};break;
      case 'scene':{const runtime=window.__DSH_DESIGN_RUNTIME__;if(args.reset||!args.id){if(runtime?.resetScene)runtime.resetScene();else document.dispatchEvent(new CustomEvent('dsh:scene',{detail:{reset:true}}));value={scene:null};}else{if(!runtime?.setScene||runtime.setScene(args.id)===false)throw new Error('Scene is not available in the saved document');value={scene:args.id};}break;}
      case 'elementState':{const runtime=window.__DSH_DESIGN_RUNTIME__;if(!runtime?.setState||!Array.isArray(args.nodeIds))throw new Error('State runtime is not available');for(const id of args.nodeIds)if(!runtime.setState(id,args.state))throw new Error('This object has no saved state configuration');value={nodeIds:args.nodeIds,state:args.state};break;}
      case 'formState':{if(!Array.isArray(args.nodeIds))throw new Error('Choose saved form fields');const fields=[],skipped=[];for(const id of args.nodeIds.slice(0,200)){const node=nodeFor(id);if(!node||!['INPUT','TEXTAREA','SELECT'].includes(node.tagName)||['password','file','hidden'].includes(node.type)){skipped.push(id);continue}const raw=String(node.value??'');fields.push({nodeId:id,value:raw.slice(0,100000),...(node.tagName==='INPUT'&&['checkbox','radio'].includes(node.type)?{checked:!!node.checked}:{}),truncated:raw.length>100000})}value={fields,skipped};break;}
      case 'reset':if(!window.__DSH_DESIGN_RUNTIME__?.reset)throw new Error('Preview runtime is not ready');window.__DSH_DESIGN_RUNTIME__.reset();value={reset:true};break;
      case 'state':value={pageId:config.pageId,mode,...view(),...context(),runtime:window.__DSH_DESIGN_RUNTIME__?.getState?.()||null};break;
      default:throw new Error('Only read-only geometry and temporary view commands are accepted');
    }post('response',value,requestId);}catch(error){post('response',{error:redact(error.message||error)},requestId)}
  });
  let queued;
  addEventListener('scroll',()=>{if(queued)return;queued=requestAnimationFrame(()=>{queued=null;post('scroll',view())})},{passive:true});
  addEventListener('error',event=>post('diagnostic',{code:'PREVIEW_RUNTIME_ERROR',severity:'error',message:redact(event.message||'Resource failed to load'),source:redact(event.filename||event.target?.src||event.target?.href),line:event.lineno||null}),true);
  addEventListener('unhandledrejection',event=>post('diagnostic',{code:'PREVIEW_ASYNC_ERROR',severity:'error',message:redact(event.reason?.message||event.reason||'Unhandled rejection')}));
  document.addEventListener('securitypolicyviolation',event=>post('diagnostic',{code:'PREVIEW_RESOURCE_BLOCKED',severity:'warning',message:'预览隔离策略阻止了 '+redact(event.blockedURI),directive:event.effectiveDirective}));
  document.addEventListener('dsh:navigate',event=>{if(typeof event.detail?.pageId==='string')post('navigate',{pageId:event.detail.pageId})});
  let layoutTimer;const layout=()=>{if(layoutTimer)return;layoutTimer=setTimeout(()=>{layoutTimer=null;post('layout',view())},80)};
  new MutationObserver(records=>{if(records.some(record=>record.type!=='attributes'||!['data-dsh-instance','data-dsh-view-mode'].includes(record.attributeName)))identity.advanceRender();layout()}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});new ResizeObserver(layout).observe(document.documentElement);document.fonts?.ready?.then(layout);addEventListener('resize',layout);document.addEventListener('transitionend',layout);document.addEventListener('animationend',layout);
  const ready=()=>{document.documentElement.setAttribute('data-dsh-view-mode',mode);post('ready',{pageId:config.pageId,mode,...view(),...context(),runtime:!!window.__DSH_DESIGN_RUNTIME__})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(ready,0),{once:true});else setTimeout(ready,0);
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
export function frameDocument(html,{token,pageId,assetBase,mode='edit',artifact,origin=globalThis.location?.origin||'http://localhost'}={}){
  const policy=previewPolicy(assetBase,origin),root=parse(String(html||'<!doctype html><html><head></head><body></body></html>'));let head;
  walk(root,node=>{if(node.tagName==='head')head=node;if(!node.childNodes)return;node.childNodes=node.childNodes.filter(child=>child.tagName!=='base'&&!(child.tagName==='meta'&&['content-security-policy','refresh'].includes((attr(child,'http-equiv')||'').toLowerCase())))});
  const config=JSON.stringify({token,pageId,mode,...(artifact?{artifact}:{})}).replaceAll('<','\\u003c');const injected=[make('meta',{'http-equiv':'Content-Security-Policy',content:policy.csp}),...(policy.base?[make('base',{href:policy.base})]:[]),make('script',{'data-dsh-editor-bridge':'true'},`(${installEditorBridge.toString()})(${config},${installLocalPrototypeInteractions.toString()},${createSelectionIdentity.toString()});`)];
  for(const node of injected)node.parentNode=head;head.childNodes.unshift(...injected);return serialize(root);
}
