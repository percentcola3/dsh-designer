import {selectionChips,selectionColor} from './selection-labels.js';
import React from 'react';
import {frameDocument} from './bridge.js';
import {FrameSession,lifecycleError,readCompleteElements} from './rpc.js';
import {pagePoint,rectangle,selectionIds,hitSelectionIds,viewportOf,positionOf,dragPagePosition,flowDropIndex,flowDropEdge,gridPlacementSwap,topmostIds,resizedBox,spacingGuides,resizeStyles,artifactOf,artifactIdentity,isFrameworkArtifact,selectionMetadata,sourceEditable,sourceDragOperations} from './geometry.js';
import ScreenshotRegion from './ScreenshotRegion.jsx';
import PositionDrag from './PositionDrag.jsx';
import {canPositionDrag,snappedMovement,translated} from './position-drag.js';
import {sourceChildren} from './property-model.js';
const forbiddenText=new Set(['img','input','select','textarea','video','audio','svg','canvas','br','hr']);
const voidTags=new Set(['img','input','br','hr','meta','link','source','area','embed','param','track','wbr']);
export default function PageFrame(props){
  const {page,document:model,mode,selection,readonly,immersive=false,hidden=false,previewScale=1,zoom=1,snap,helpers,tool,interactive=false,frozen=false,onSelect,onMeasured,onChange,onReference,onNavigate,onDiagnostic,onController,onMovePage,onScroll,onGesture,onStatus,onLayout,changedIds=[]}=props;
  const iframe=React.useRef(null),hitLayer=React.useRef(null),current=React.useRef(props),gesture=React.useRef(null),intent=React.useRef(0),scroll=React.useRef({x:0,y:0}),measurement=React.useRef({sequence:0,running:false,again:false}),measureRef=React.useRef(null),pageDrag=React.useRef(null),inlineTask=React.useRef(null);
  current.current=props;const viewport=viewportOf(page),selected=selection?.pageId===page.id,ids=selected?selectionIds(selection):[],idsKey=ids.join('|'),selectionLabels=new Map(selected?selectionChips(selection).map(chip=>[chip.id,chip.label]):[]);
  const [ready,setReady]=React.useState(false),[objects,setObjects]=React.useState([]),[box,setBox]=React.useState(null),[region,setRegion]=React.useState(null),[drop,setDrop]=React.useState(null),[inline,setInline]=React.useState(null),[frameError,setFrameError]=React.useState(null),[state,setState]=React.useState(null),[textSaving,setTextSaving]=React.useState(false),[resize,setResize]=React.useState(null),[changedObjects,setChangedObjects]=React.useState([]),[layoutEpoch,setLayoutEpoch]=React.useState(0);
  const [hovered,setHovered]=React.useState(null);
  const hoverQueue=React.useRef(null),hoverBusy=React.useRef(false),hoverEpoch=React.useRef(0);
  const frameViewport=page.previewViewport||viewport,captureInput=frozen||tool==='pan'||mode==='edit'&&(!interactive||tool==='pick');
  const [sourcePreview,setSourcePreview]=React.useState(null);
  const artifact=artifactOf(model,page),framework=isFrameworkArtifact(model,page),artifactKey=artifactIdentity(model,page);
  // Mode changes use the bridge so the live application's state survives switching.
  const html=typeof model==='string'?model:(model?.previewHTML??model?.html);
  const [loaded,setLoaded]=React.useState(()=>({html}));
  if(loaded.html===undefined&&html!==undefined)setLoaded({html});
  const liveHTML=interactive&&!framework?loaded.html:html;
  const [pendingReload,setPendingReload]=React.useState(false);
  // Adding an image changes the resource inventory version, not the frame's trust root.
  // Hold that version while frozen so an asset upload cannot dismiss a live dialog.
  const nextAssetBase=model?.assetBase;
  const assetVersion=React.useRef({seen:nextAssetBase,base:nextAssetBase});
  if(assetVersion.current.seen!==nextAssetBase){
    const sameDirectory=assetVersion.current.base?.split('?')[0]===nextAssetBase?.split('?')[0];
    assetVersion.current={seen:nextAssetBase,base:frozen&&sameDirectory?assetVersion.current.base:nextAssetBase};
  }
  const assetBase=assetVersion.current.base;
  const source=React.useMemo(()=>{const token=crypto.randomUUID();try{return {token,html:frameDocument(liveHTML,{token,pageId:page.id,assetBase,mode,interactive,viewport:frameViewport,plainPreview:immersive,artifact})}}catch(error){return {token,error}}},[liveHTML,loaded,assetBase,page.id,artifactKey,interactive,immersive,frameViewport.width,frameViewport.height]);
  const session=React.useMemo(()=>new FrameSession({token:source.token,pageId:page.id,getWindow:()=>iframe.current?.contentWindow,onEvent:(kind,value)=>{
    const p=current.current;if(kind==='ready'){const finish=result=>{if(source.token!==sessionRef.current.token||sessionRef.current.closed)return;setReady(true);setFrameError(null);scroll.current=result||value||{x:0,y:0};setState(result||value);p.onLayout?.(page.id,result||value);p.onStatus?.(page.id,{...value,status:'ready',runtime:!!value?.runtime});};const saved=!p.immersive&&p.viewState?.scroll;if(saved)sessionRef.current.request('restoreScroll',saved).then(finish).catch(error=>{if(!lifecycleError(error)){p.onDiagnostic?.({code:'RESTORE_SCROLL',message:error.message,pageId:page.id});finish(value)}});else finish(value);}
    else if(kind==='canvasWheel'&&p.immersive&&value&&[value.clientX,value.clientY,value.deltaX,value.deltaY].every(Number.isFinite)){
      const rect=iframe.current.getBoundingClientRect();
      p.onCanvasWheel?.({...value,clientX:rect.left+value.clientX*p.zoom,clientY:rect.top+value.clientY*p.zoom});
    }
    else if(kind==='screenshot'&&document.activeElement===iframe.current&&navigator.userActivation?.isActive)p.onScreenshot?.();
    else if(kind==='toggleFreeze')p.onFreezeShortcut?.(page.id);
    else if(kind==='pageActive'&&p.activePageId!==page.id)p.onNavigate?.({pageId:page.id});
    else if(kind==='exitPreview'&&p.mode==='preview')p.onGesture?.('exitPreview');
    else if(kind==='scroll'){scroll.current=value||{x:0,y:0};setState(value);p.onScroll?.(page.id,value);measureRef.current?.();}
    else if(kind==='layout'){p.onLayout?.(page.id,value);setState(value);setLayoutEpoch(value=>value+1);measureRef.current?.();}
    else if(kind==='diagnostic'){setFrameError(value?.severity==='error'?value.message:null);p.onDiagnostic?.({...value,pageId:page.id});p.onStatus?.(page.id,{status:value?.severity==='error'?'runtime-error':'warning',diagnostic:value});}
    else if(kind==='navigate'&&(p.mode==='preview'||p.interactive))p.onNavigate?.(value);
  }}),[source.token,page.id]);
  const changedKey=changedIds.join('|');
  const [showChanges,setShowChanges]=React.useState(false);
  React.useEffect(()=>{if(!changedKey){setShowChanges(false);return;}setShowChanges(true);const timer=setTimeout(()=>setShowChanges(false),3000);return()=>clearTimeout(timer);},[changedKey,source.token]);
  React.useEffect(()=>{let canceled=false;if(!ready||!helpers||!showChanges||!changedIds.length){setChangedObjects([]);return}const valid=changedIds.filter(id=>isFrameworkArtifact(current.current.document,current.current.page)||current.current.document?.nodes?.[id]);const nodeIds=(isFrameworkArtifact(current.current.document,current.current.page)?valid:topmostIds(valid,current.current.document?.nodes||{})).slice(0,100);session.request('measure',{nodeIds}).then(values=>{if(!canceled)setChangedObjects((Array.isArray(values)?values:[]).filter(object=>nodeIds.includes(object.nodeId||object.id)&&object.bounds?.width>0&&object.bounds?.height>0))}).catch(error=>{if(!canceled&&!lifecycleError(error))current.current.onDiagnostic?.({code:error.code,message:error.message,pageId:page.id})});return()=>{canceled=true}},[session,ready,helpers,showChanges,changedKey,state?.x,state?.y,layoutEpoch]);
  const sessionRef=React.useRef(session);sessionRef.current=session;
  const request=React.useCallback((command,args)=>sessionRef.current.request(command,args),[]);
  const synced=React.useRef({session,html:liveHTML}),syncQueue=React.useRef(Promise.resolve());
  if(synced.current.session!==session)synced.current={session,html:liveHTML};
  const syncSource=React.useCallback((next,hold)=>{
    const active=sessionRef.current;
    const work=async()=>{
      if(active!==sessionRef.current||active.closed)return;
      const before=synced.current.html;
      if(before===next){setPendingReload(false);return;}
      if(before===undefined){setLoaded({html:next});setPendingReload(false);return;}
      const result=await active.request('patchSource',{before,after:next});
      if(active!==sessionRef.current||active.closed)return;
      if(result.applied)synced.current.html=next;
      if(!result.applied&&!hold)setLoaded({html:next});
      setPendingReload(!result.applied&&hold);
    };
    const result=syncQueue.current.then(work);syncQueue.current=result.catch(()=>{});return result;
  },[]);
  React.useLayoutEffect(()=>{
    if(!interactive||framework||html===undefined)return;
    syncSource(html,frozen).catch(error=>{if(!lifecycleError(error))current.current.onDiagnostic?.({code:error.code,message:error.message,pageId:page.id});});
  },[html,session,interactive,framework,frozen,syncSource,page.id]);
  React.useLayoutEffect(()=>{
    if(!interactive||!ready)return;
    session.request('freeze',{enabled:frozen}).catch(error=>{if(!lifecycleError(error))current.current.onDiagnostic?.({code:error.code,message:error.message,pageId:page.id});});
  },[ready,frozen,session,interactive,page.id]);
  const safeObjects=React.useCallback(values=>{const p=current.current,nodes=p.document?.nodes||{},framework=isFrameworkArtifact(p.document,p.page);return (Array.isArray(values)?values:[]).slice(0,200).filter(value=>value&&typeof(value.nodeId||value.id)==='string'&&(framework||nodes[value.nodeId||value.id])).map(value=>({...value,id:value.nodeId||value.id,nodeId:value.nodeId||value.id,...(!framework?{locked:!!nodes[value.nodeId||value.id].locked}:{})}));},[]);
  const completeObjects=React.useCallback(async values=>{const active=sessionRef.current,objects=await readCompleteElements((command,args)=>active.request(command,args),safeObjects(values));if(active!==sessionRef.current||active.closed)throw Object.assign(new Error('页面已更新，请重新选择元素。'),{code:'FRAME_RELOADED'});return objects;},[safeObjects]);
  const measure=React.useCallback(async explicitIds=>{
    const p=current.current;
    const reference=p.selection?.pageId===p.page.id&&p.selection.referenceOnly&&p.selection.objects?.[0];
    if(!explicitIds&&reference?.referenceId){
      const activeSession=sessionRef.current;
      const result=await request('reference.measure',{referenceId:reference.referenceId}).catch(()=>undefined);
      if(activeSession!==sessionRef.current||current.current.selection?.objects?.[0]?.referenceId!==reference.referenceId||result===undefined)return [];
      if(!result){await p.onSelect?.(null);return [];}
      p.onMeasured?.(p.page.id,[{...result,selectionLabel:reference.selectionLabel}],[]);
      return [result];
    }
    const targetIds=Array.isArray(explicitIds)?explicitIds:p.selection?.pageId===p.page.id?selectionIds(p.selection):[];if(!targetIds.length){setObjects([]);return []}
    const sequence=++measurement.current.sequence,token=sessionRef.current.token;try{const values=await completeObjects(await request('measure',{nodeIds:targetIds}));if(token!==sessionRef.current.token)throw Object.assign(new Error('页面已更新，请重新选择元素。'),{code:'FRAME_RELOADED'});if(sequence!==measurement.current.sequence)return values;setObjects(values);p.onMeasured?.(p.page.id,values,targetIds);return values}catch(error){if(!lifecycleError(error))current.current.onDiagnostic?.({code:error.code||'FRAME_MEASURE',message:error.message,pageId:p.page.id});if(Array.isArray(explicitIds))throw error;return []}
  },[request,completeObjects]);measureRef.current=()=>{if(measurement.current.running){measurement.current.again=true;return}measurement.current.running=true;measure().finally(()=>{measurement.current.running=false;if(measurement.current.again){measurement.current.again=false;measureRef.current?.()}})};
  React.useLayoutEffect(()=>{
    hoverEpoch.current++;hoverQueue.current=null;setHovered(null);setReady(false);setSourcePreview(null);setObjects([]);setBox(null);setRegion(null);setDrop(null);setResize(null);setInline(value=>framework?null:value&&value.value!==value.original?value:null);gesture.current=null;intent.current++;
    if(framework&&current.current.selection?.pageId===page.id&&(selectionIds(current.current.selection).length||current.current.selection.objects?.length))Promise.resolve(current.current.onSelect?.({pageId:page.id,nodeIds:[],objects:[],invalidated:true,artifact,reason:'framework-frame-reloaded'})).catch(error=>current.current.onDiagnostic?.({code:error.code||'SELECTION_INVALIDATED',message:error.message,pageId:page.id}));
    if(source.error){setFrameError(source.error.message);current.current.onDiagnostic?.({code:'FRAME_DOCUMENT',message:source.error.message,pageId:page.id});return()=>session.close('FRAME_RELOADED')}
    const receive=event=>{if(event.source!==iframe.current?.contentWindow)return;if(event.data?.type==='dsh:runtime'&&(current.current.mode==='preview'||current.current.interactive)){if(event.data.action==='navigate'&&typeof event.data.pageId==='string')current.current.onNavigate?.({pageId:event.data.pageId,runtime:true});else if(event.data.action==='back')current.current.onNavigate?.({back:true,runtime:true});return}session.receive(event)};
    addEventListener('message',receive);return()=>{removeEventListener('message',receive);session.close('FRAME_RELOADED')};
  },[session,source.error,page.id]);
  React.useEffect(()=>{if(!ready)return;request('mode',{mode}).then(()=>measureRef.current?.()).catch(error=>{if(!lifecycleError(error))current.current.onDiagnostic?.({code:error.code,message:error.message,pageId:page.id})})},[ready,mode,request]);
  React.useEffect(()=>{if(ready)measureRef.current?.()},[ready,idsKey,selection?.objects?.[0]?.referenceId,model?.artboardRevision]);
  React.useEffect(()=>{
    const controller={request,measure,async freeze(enabled){await syncQueue.current;return request('freeze',{enabled});},invalidateIdentity:()=>{intent.current++;gesture.current=null;measurement.current.sequence++;setObjects([]);setChangedObjects([]);setBox(null);setRegion(null);setDrop(null);setResize(null)},whenReady:()=>sessionRef.current.whenReady(),flush:()=>saveRef.current(),hasDirty:()=>!!inlineRef.current&&inlineRef.current.value!==inlineRef.current.original,locate:async value=>{await sessionRef.current.whenReady();if(value.rect||value.region){const region=value.rect||value.region,viewport=viewportOf(current.current.page);const view=await request('restoreScroll',{x:Math.max(0,region.x+region.width/2-viewport.width/2),y:Math.max(0,region.y+region.height/2-viewport.height/2)});scroll.current=view;setState(view);return {view,region}}const id=selectionIds(value)[0]||value.nodeId;if(!id)return {view:await request('state')};const state=await request('state');if(isFrameworkArtifact(current.current.document,current.current.page)&&value.documentEpoch!==undefined&&value.documentEpoch!==state.documentEpoch)throw Object.assign(new Error('引用属于旧的组件构建，请重新选择运行实例。'),{code:'ELEMENT_IDENTITY_CHANGED'});const result=await request('locate',{nodeId:id});if(!result?.object)throw Object.assign(new Error('运行实例已不存在，请重新选择元素。'),{code:'ELEMENT_NOT_FOUND'});scroll.current=result?.view||scroll.current;setState(result?.view);const objects=await measure(selectionIds(value).length?selectionIds(value):[id]);return {...result,object:objects.find(object=>object.id===id)||result.object,objects}},reset:()=>request('reset'),state:()=>request('state')};
    onController?.(page.id,controller);return()=>onController?.(page.id,null);
  },[page.id,onController,request,measure]);
  React.useEffect(()=>{
    const layer=hitLayer.current?.closest('.ec-page');if(!layer||mode!=='edit')return;let delta={x:0,y:0},timer=null,running=false;
    const flush=async()=>{if(running)return;const value=delta;delta={x:0,y:0};if(!value.x&&!value.y)return;running=true;try{const result=await request('scroll',value);scroll.current=result;setState(result);current.current.onScroll?.(page.id,result);measureRef.current?.()}catch(error){if(!lifecycleError(error))current.current.onDiagnostic?.({code:'PAGE_SCROLL',message:error.message,pageId:page.id})}finally{running=false;if(delta.x||delta.y)flush()}};
    const wheel=event=>{
      if(current.current.immersive)return; // The stage handles wheel events on editing overlays.
      if(gesture.current||pageDrag.current){event.preventDefault();event.stopPropagation();return;}if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||current.current.tool==='pan')return;event.preventDefault();event.stopPropagation();const unit=event.deltaMode===1?16:event.deltaMode===2?viewportOf(current.current.page).height:1;delta.x+=event.deltaX*unit/current.current.zoom;delta.y+=event.deltaY*unit/current.current.zoom;clearTimeout(timer);timer=setTimeout(flush,16)};
    layer.addEventListener('wheel',wheel,{passive:false});return()=>{layer.removeEventListener('wheel',wheel);clearTimeout(timer)};
  },[mode,request,page.id,captureInput]);
  const point=event=>pagePoint(event,hitLayer.current.getBoundingClientRect(),viewportOf(current.current.page));
  const canonical=id=>isFrameworkArtifact(current.current.document,current.current.page)?null:current.current.document?.nodes?.[id];
  const choose=async(event,double=false,sequence=++intent.current,context=false)=>{
    const p=current.current,position=point(event);const found=await request('hitTest',position);if(sequence!==intent.current||!found)return null;const id=found.nodeId||found.id,node=canonical(id);
    if(found.locked||node?.locked){p.onDiagnostic?.({code:'LOCKED_OBJECT',message:'对象已锁定，请从图层中明确解锁。',pageId:page.id});return null}
    if(found.referenceOnly||!node&&!isFrameworkArtifact(p.document,p.page)){await p.onSelect?.({pageId:page.id,nodeIds:[],objects:[{...found,referenceOnly:true}],referenceOnly:true,...selectionMetadata([found])});if(double&&sequence===intent.current&&isFrameworkArtifact(p.document,p.page))p.onGesture?.('properties');return {found,nodeIds:[],objects:[found]}}
    const previous=p.selection?.pageId===page.id?selectionIds(p.selection):[],next=hitSelectionIds(previous,id,{additive:p.tool==='pick'||event.shiftKey,context,double});
    const values=await completeObjects(await request('measure',{nodeIds:next}));if(sequence!==intent.current)return null;await current.current.onSelect?.({pageId:page.id,nodeIds:next,objects:values,bounds:found.bounds,...selectionMetadata(values)});if(sequence!==intent.current)return null;setObjects(values);
    if(double&&isFrameworkArtifact(p.document,p.page)){p.onGesture?.('properties');return {found,nodeIds:next,objects:values};}
    if(double&&!p.readonly){if(node.childIds.length===0&&!found.elementChildCount&&!forbiddenText.has(node.tag))setInline({id,value:found.text||'',original:found.text||'',bounds:found.bounds,scope:p.definitionScope||'instance',artboardRevision:p.document?.artboardRevision??p.page.revision,fsVersion:p.document?.version});else p.onDiagnostic?.({code:'TEXT_CONTAINER',message:'此对象包含子对象，请选择具体文字叶子或使用属性面板。',pageId:page.id})}
    return {found,nodeIds:next,objects:values};
  };
  const down=event=>{if(event.target.closest('.ec-move-proxy,.moveable-control-box'))return;if(event.button!==0||tool==='pan'||tool==='interact')return;event.preventDefault();event.stopPropagation();hitLayer.current.focus();if(tool==='pick'){choose(event).catch(error=>current.current.onDiagnostic?.({code:error.code||'ELEMENT_SELECT',message:error.message,pageId:page.id}));return;}const start=point(event),sequence=++intent.current,kind=event.altKey&&event.shiftKey?'region':event.ctrlKey||event.metaKey?'box':framework?'sourceMove':'move';const value={pointerId:event.pointerId,start,startClient:{x:event.clientX,y:event.clientY},startDocument:{x:start.x+(scroll.current.x||0),y:start.y+(scroll.current.y||0)},kind,sequence,shift:event.shiftKey,modelVersion:model?.version,projectRevision:current.current.projectRevision};gesture.current=value;hitLayer.current.setPointerCapture(event.pointerId);if(kind==='move'||kind==='sourceMove')value.choice=choose(event,false,sequence).then(chosen=>{value.objects=chosen?.objects||[];
      if(value.kind==='move'&&value.objects.length===1){
        value.guideRequest=request('snapGuides',{nodeId:value.objects[0].id}).then(guides=>{value.guides=guides;}).catch(()=>{});
      }
      return chosen;}).catch(error=>{current.current.onDiagnostic?.({code:error.code||'ELEMENT_SELECT',message:error.message,pageId:page.id});return null});else if(kind==='box')setBox({x:start.x,y:start.y,width:0,height:0});else setRegion({x:start.x,y:start.y,width:0,height:0})};
  const resizeDown=(event,object)=>{if(event.button!==0||readonly||framework&&!sourceEditable(object)||canonical(object.id)?.locked)return;event.preventDefault();event.stopPropagation();if(object.transformed||['inline','contents','table-row','table-row-group'].includes(object.styles?.display)){onDiagnostic?.({severity:'info',code:'FLOW_RESIZE_UNAVAILABLE',message:object.transformed?'此对象带有变换，请在属性中明确修改 CSS 宽高。':'此对象的 display 不采用独立宽高，请调整字体或显式选择 inline-block / flex / grid 布局。',pageId:page.id});return}hitLayer.current.focus();gesture.current={pointerId:event.pointerId,kind:'resize',sequence:++intent.current,start:point(event),startClient:{x:event.clientX,y:event.clientY},bounds:object.bounds,object,nodeId:object.id,scope:current.current.definitionScope||'instance',version:model.version,revision:model.artboardRevision??page.revision,projectRevision:current.current.projectRevision};hitLayer.current.setPointerCapture(event.pointerId);setResize(object.bounds)};
  const clearHover=()=>{hoverEpoch.current++;hoverQueue.current=null;setHovered(null);};
  const hover=async event=>{
    if(current.current.tool!=='pick'||gesture.current)return;
    hoverQueue.current={position:point(event),epoch:++hoverEpoch.current};
    if(hoverBusy.current)return;
    hoverBusy.current=true;
    try{
      while(hoverQueue.current){
        const next=hoverQueue.current;hoverQueue.current=null;
        const found=await request('hitTest',next.position);
        if(next.epoch===hoverEpoch.current&&current.current.tool==='pick')setHovered(found?.bounds&&!found.locked?found:null);
      }
    }catch(error){if(!lifecycleError(error))setHovered(null);}
    finally{hoverBusy.current=false;}
  };
  React.useEffect(()=>{intent.current++;gesture.current=null;clearHover();return()=>{hoverEpoch.current++;hoverQueue.current=null;};},[tool,mode,source.token]);
  const move=event=>{const value=gesture.current;if(!value){hover(event);return;}const position=point(event);if(value.kind==='resize')setResize(resizedBox(value.bounds,{x:position.x-value.start.x,y:position.y-value.start.y},{snap:snap?8:0,aspect:event.shiftKey}));if(value.kind==='box')setBox(rectangle(value.start,position,viewport));if(value.kind==='region')setRegion(rectangle(value.start,position,viewport));if(value.kind==='sourceMove'&&value.objects?.length&&Math.hypot(event.clientX-value.startClient.x,event.clientY-value.startClient.y)>7){const dx=position.x-value.start.x,dy=position.y-value.start.y;setSourcePreview({objects:value.objects,dx:snap?Math.round(dx/8)*8:dx,dy:snap?Math.round(dy/8)*8:dy});}if(value.kind==='move'&&Math.hypot(event.clientX-value.startClient.x,event.clientY-value.startClient.y)>7){
      if(frozen&&value.objects?.length===1&&['absolute','fixed'].includes(value.objects[0].styles?.position)&&canPositionDrag(value.objects[0])){
        const {delta}=snappedMovement(value.objects[0].bounds,[position.x-value.start.x,position.y-value.start.y],value.guides,zoom,zoom);
        setSourcePreview({objects:value.objects,dx:delta[0],dy:delta[1]});return;
      }
      const hit=value.guides?.siblings.find(({bounds:r})=>position.x>=r.x&&position.x<=r.x+r.width&&position.y>=r.y&&position.y<=r.y+r.height);
      if(hit&&!event.altKey)setDrop({...flowDropEdge(value.guides.parentStyles,position,hit.bounds).line,label:'放置到此处'});
      else if(event.altKey)setDrop({x:position.x-18,y:position.y,width:36,height:2,label:'放入容器'});
      else setDrop(null);
    }};

  const up=async event=>{
    const value=gesture.current;gesture.current=null;setSourcePreview(null);setBox(null);setRegion(null);setDrop(null);setResize(null);if(!value)return;const position=point(event),distance=Math.hypot(event.clientX-value.startClient.x,event.clientY-value.startClient.y);try{if(hitLayer.current.hasPointerCapture(event.pointerId))hitLayer.current.releasePointerCapture(event.pointerId);
      if(value.sequence!==intent.current)return;
      if(value.kind==='resize'){const box=resizedBox(value.bounds,{x:position.x-value.start.x,y:position.y-value.start.y},{snap:snap?8:0,aspect:event.shiftKey});await current.current.onChange?.({pageId:page.id,expectedRevision:value.projectRevision,selection:{pageId:page.id,nodeIds:[value.nodeId],objects:[value.object],...selectionMetadata([value.object])},expectedVersion:value.version,expectedArtboardRevision:value.revision,operations:[{type:'style',nodeIds:[value.nodeId],styles:resizeStyles(value.object,box),scope:value.scope}],definitionScope:value.scope,summary:'调整真实流式尺寸'});return}
      if(value.kind==='region'){const rect=rectangle(value.startDocument,{x:position.x+(scroll.current.x||0),y:position.y+(scroll.current.y||0)},{width:state?.documentWidth||viewport.width,height:Math.max(state?.documentHeight||0,viewport.height)});if(rect.width<3||rect.height<3)throw new Error('请拖出至少 3 × 3 像素的实际引用区域。');await current.current.onReference?.({pageId:page.id,rect,viewport,sourceVersion:value.modelVersion,artboardRevision:model?.artboardRevision??page.revision});return}
      if(value.kind==='box'){if(distance<4)return;const values=safeObjects(await request('boxSelect',{rect:rectangle(value.start,position,viewport)})).filter(object=>!canonical(object.id)?.locked),previous=current.current.selection?.pageId===page.id&&value.shift?selectionIds(current.current.selection):[],next=[...new Set([...previous,...values.map(object=>object.id)])];const measured=await completeObjects(await request('measure',{nodeIds:next}));if(value.sequence!==intent.current)return;await current.current.onSelect?.({pageId:page.id,nodeIds:next,objects:measured,...selectionMetadata(measured)});if(value.sequence!==intent.current)return;setObjects(measured);return}
      if(value.kind==='sourceMove'){try{const chosen=await value.choice;if(distance<7||readonly||!chosen?.nodeIds?.length||value.sequence!==intent.current)return;const operations=sourceDragOperations(chosen.objects,{x:position.x-value.start.x,y:position.y-value.start.y},{snap:snap?8:0});await current.current.onChange?.({pageId:page.id,expectedRevision:value.projectRevision,selection:{pageId:page.id,nodeIds:chosen.nodeIds,objects:chosen.objects,...selectionMetadata(chosen.objects)},operations,summary:'拖动并保存组件源码位置'});}finally{setSourcePreview(null);}return;}
      const chosen=await value.choice;if(distance<7||readonly||isFrameworkArtifact(current.current.document,current.current.page)||!chosen?.nodeIds?.length||value.sequence!==intent.current)return;if(frozen&&chosen.objects.some(object=>['absolute','fixed'].includes(object.styles?.position))){
        if(chosen.objects.length!==1||!canPositionDrag(chosen.objects[0]))throw new Error('请选择单个可定位元素；带有复杂变换的元素请使用属性面板。');
        const object=chosen.objects[0];
        await value.guideRequest;
        const {delta}=snappedMovement(object.bounds,[position.x-value.start.x,position.y-value.start.y],value.guides,zoom,zoom);
        setSourcePreview(null);
        if(delta.some(Boolean))await current.current.onChange?.({pageId:page.id,expectedRevision:value.projectRevision,expectedFsVersion:value.modelVersion,definitionScope:props.definitionScope,operations:[{type:'style',nodeIds:[object.id],styles:{translate:translated(object.styles.translate,delta)},scope:props.definitionScope||'instance'}],summary:'调整元素位置'});
        return;
      }
      const moving=topmostIds(chosen.nodeIds,model.nodes);let target=await request('hitTest',position);
      if(frozen&&!event.altKey&&moving.length===1&&target?.nodeId){
        const parentId=model.nodes[moving[0]]?.parentId;
        let sibling=model.nodes[target.nodeId];
        while(sibling&&sibling.parentId!==parentId)sibling=model.nodes[sibling.parentId];
        if(sibling&&sibling.id!==target.nodeId)[target]=await request('measure',{nodeIds:[sibling.id]});
      }if(!target?.nodeId||!canonical(target.nodeId))throw new Error('放置目标没有可编辑的源对象映射。');if(canonical(target.nodeId).locked)throw new Error('目标容器已锁定。');if(moving.includes(target.nodeId))return;let parentId,index;
      if(event.altKey){if(voidTags.has(target.tag))throw new Error('此对象不能包含子元素，请选择容器。');parentId=target.nodeId;index=sourceChildren(model,parentId).filter(child=>!moving.includes(child.nodeId)).length;}
      else {parentId=canonical(target.nodeId).parentId;if(target.parentId!==parentId)throw new Error('运行时改变了此对象层级，请选择明确的源容器。');if(!parentId)throw new Error('目标不支持排序。');const parent=safeObjects(await request('measure',{nodeIds:[parentId]}))[0];if(!parent)throw new Error('目标容器已改变。');if(frozen&&moving.length===1&&parent.styles?.display?.includes('grid')&&canonical(moving[0]).parentId===parentId){
        const swap=gridPlacementSwap(chosen.objects[0],target);
        if(swap){await current.current.onChange?.({pageId:page.id,expectedRevision:value.projectRevision,expectedFsVersion:value.modelVersion,operations:swap,summary:'交换网格位置'});return;}
      }
      index=flowDropIndex({parent:{...parent,childElements:sourceChildren(model,parentId)},targetId:target.nodeId,point:position,targetBounds:target.bounds,movingIds:moving})}
      await current.current.onChange?.({pageId:page.id,expectedRevision:value.projectRevision,expectedFsVersion:value.modelVersion,operations:[{type:'move',nodeIds:moving,parentId,index,scope:'instance'}],summary:event.altKey?'移动到明确容器':'按正常文档流调整顺序'});
    }catch(error){if(error.code!=='EDIT_CANCELLED'&&!error.canvasReported)current.current.onDiagnostic?.({code:error.code||'CANVAS_GESTURE',message:error.message,pageId:page.id})}
  };
  const saveInline=React.useCallback(()=>{if(inlineTask.current)return inlineTask.current;const value=inlineRef.current;if(!value)return Promise.resolve();if(value.value===value.original){inlineRef.current=null;setInline(null);return Promise.resolve()}setTextSaving(true);const task=(async()=>{const result=await current.current.onChange?.({pageId:page.id,expectedArtboardRevision:value.artboardRevision,expectedFsVersion:value.fsVersion,operations:[{type:'text',nodeIds:[value.id],value:value.value,scope:value.scope}],definitionScope:value.scope,summary:'保存直接编辑的文字'});inlineRef.current=null;setInline(null);return result})();inlineTask.current=task.finally(()=>{inlineTask.current=null;setTextSaving(false)});return inlineTask.current},[page.id]);
  const inlineRef=React.useRef(inline);inlineRef.current=inline;const saveRef=React.useRef(saveInline);saveRef.current=saveInline;
  React.useEffect(()=>{
    if(!props.fitPage||!ready)return;
    let live=true;
    request('state').then(view=>{if(live)current.current.onLayout?.(page.id,view);}).catch(()=>{});
    return ()=>{live=false;};
  },[props.fitPage,props.fitKey,ready,page.id,request]);
  const titleDown=event=>{
    if(event.button!==0||event.target.closest('button')||mode==='preview'||readonly||tool==='pan'||pageDrag.current)return;
    event.preventDefault();event.stopPropagation();
    const origin=positionOf(current.current.page),start={x:event.clientX,y:event.clientY},node=event.currentTarget,pointerId=event.pointerId,startZoom=zoom;let active=false;
    const position=e=>dragPagePosition(origin,{x:e.clientX-start.x,y:e.clientY-start.y},startZoom,current.current.snap?8:0);
    const clean=()=>{pageDrag.current=null;node.removeEventListener('pointermove',moved);node.removeEventListener('pointerup',done);node.removeEventListener('pointercancel',cancel);node.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',cancel);if(node.hasPointerCapture(pointerId))node.releasePointerCapture(pointerId);};
    const moved=e=>{if(e.pointerId!==pointerId)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>=4)active=true;if(active)current.current.onMovePage?.(page.id,position(e),true);};
    const done=e=>{if(e.pointerId!==pointerId)return;const next=position(e);clean();if(active&&(next.x!==origin.x||next.y!==origin.y))current.current.onMovePage?.(page.id,next,false);};
    const cancel=e=>{if(e?.pointerId!==undefined&&e.pointerId!==pointerId)return;clean();if(active)current.current.onMovePage?.(page.id,origin,true);};
    pageDrag.current={cancel};node.setPointerCapture(pointerId);node.addEventListener('pointermove',moved);node.addEventListener('pointerup',done);node.addEventListener('pointercancel',cancel);node.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);
  };
  React.useEffect(()=>()=>pageDrag.current?.cancel(),[page.id,tool,mode,readonly]);
  const visualObjects=sourcePreview?sourcePreview.objects.map(object=>({...object,bounds:object.bounds?{...object.bounds,x:object.bounds.x+sourcePreview.dx,y:object.bounds.y+sourcePreview.dy}:null})):selected&&selection.referenceOnly?selection.objects||[]:objects.filter(object=>selected&&(ids.includes(object.nodeId||object.id)||selection?.referenceOnly));
  return <article className={'ec-page '+(selected&&mode==='edit'?'ec-page-active':'')} hidden={hidden} style={{left:immersive?'50%':positionOf(page).x,top:immersive?`calc(50% + ${props.centerOffset||0}px)`:positionOf(page).y,width:viewport.width,...(immersive?{height:viewport.height,transform:`translate(-50%,-50%) scale(${previewScale})`}:{})}} data-page-id={page.id} data-view-mode={mode}>
    {!immersive&&<header className="ec-page-title" style={{top:-35/zoom,width:viewport.width*zoom,transform:`scale(${1/zoom})`,transformOrigin:'0 0'}} onPointerDown={titleDown}><button onClick={()=>onNavigate?.({pageId:page.id,focus:true})} onDoubleClick={()=>onNavigate?.({pageId:page.id,single:true})}>{page.name}</button><span>{viewport.width} × {viewport.height}{mode==='edit'?' · 完整内容':' · 预览视口'}</span><span>{!ready?'加载中':frameError?'运行诊断':'已刷新'}</span></header>}
    <div className="ec-frame-container" style={{height:viewport.height}}>{html!==undefined&&!source.error?<iframe ref={iframe} title={page.name} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source.html} style={{width:viewport.width,height:viewport.height}}/>:<div className="ec-frame-placeholder">{source.error?.message||'正在读取此页的真实内容…'}</div>}
      {(mode==='edit'||tool==='pan')&&<div ref={hitLayer} tabIndex={-1} className="ec-hit-layer" style={{pointerEvents:captureInput?undefined:'none',cursor:tool==='pick'?'crosshair':undefined}} onPointerLeave={clearHover} onContextMenu={event=>{if(tool==='pan'||mode!=='edit')return;event.preventDefault();event.stopPropagation();const x=event.clientX,y=event.clientY;choose(event,false,++intent.current,true).then(chosen=>{if(chosen?.objects?.length)current.current.onGesture?.('contextmenu',{pageId:page.id,nodeIds:chosen.nodeIds,objects:chosen.objects,x,y,...selectionMetadata(chosen.objects)});}).catch(error=>current.current.onDiagnostic?.({code:error.code||'SOURCE_CONTEXT_MENU',message:error.message,pageId:page.id}));}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{gesture.current=null;intent.current++;setSourcePreview(null);setBox(null);setRegion(null);setDrop(null)}} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();if(tool==='pan'||tool==='pick'||mode!=='edit')return;choose(event,true).catch(error=>onDiagnostic?.({code:'TEXT_SELECT',message:error.message,pageId:page.id}))}}>
        {interactive&&(tool==='pick'||frozen&&tool==='select')&&!model?.schemaSource&&!framework&&!readonly&&visualObjects.length===1&&canPositionDrag(visualObjects[0])&&<PositionDrag key={visualObjects[0].referenceId||visualObjects[0].id} object={visualObjects[0]} zoom={zoom} request={request} model={model} page={page} scope={props.definitionScope||'instance'} projectRevision={props.projectRevision} layoutEpoch={layoutEpoch} onChange={onChange} onDiagnostic={onDiagnostic} onMeasure={()=>measureRef.current?.()}/>}
        {tool==='pick'&&hovered?.bounds&&!ids.includes(hovered.nodeId||hovered.id)&&<div className="ec-hovered-object" style={{left:hovered.bounds.x,top:hovered.bounds.y,width:hovered.bounds.width,height:hovered.bounds.height,borderWidth:1/zoom}}/>}
        {helpers&&changedObjects.filter(object=>!ids.includes(object.nodeId||object.id)).map(object=><div key={'changed-'+(object.nodeId||object.id)} className="ec-changed-object" style={{left:object.bounds.x,top:object.bounds.y,width:object.bounds.width,height:object.bounds.height,borderWidth:2/zoom}}><span style={{transform:`scale(${1/zoom})`,transformOrigin:'0 100%'}}>保存内容已更新</span></div>)}
        {(interactive||helpers)&&visualObjects.map(object=>object.bounds&&<div key={object.referenceId||object.id} className={'ec-selected-object '+(changedIds.includes(object.id)?'ec-object-changed':'')} style={{left:object.bounds.x,top:object.bounds.y,width:object.bounds.width,height:object.bounds.height,borderWidth:1/zoom,borderColor:selectionColor(object.selectionLabel||selectionLabels.get(object.nodeId||object.id))}}><span className="ec-object-name ec-object-index" aria-label={`选中元素 ${object.selectionLabel||selectionLabels.get(object.nodeId||object.id)||'A'}`} title={`${object.name||object.tag||'元素'} · ${Math.round(object.bounds.width)} × ${Math.round(object.bounds.height)}`} style={{background:selectionColor(object.selectionLabel||selectionLabels.get(object.nodeId||object.id)),transform:`scale(${1/zoom})`,transformOrigin:'0 100%'}}>{object.selectionLabel||selectionLabels.get(object.nodeId||object.id)||'A'}</span>{!object.referenceOnly&&tool==='select'&&(!interactive||frozen)&&!readonly&&(!framework||sourceEditable(object))&&!object.locked&&!object.hidden&&object.bounds.width>0&&object.bounds.height>0&&<i className="ec-resize-handle" title="拖动调整流式尺寸，Shift 保持比例" style={{width:9/zoom,height:9/zoom,right:-5/zoom,bottom:-5/zoom}} onPointerDown={event=>resizeDown(event,object)}/>}</div>)}
        {helpers&&tool!=='pick'&&spacingGuides(objects).map((guide,index)=><div key={'gap-'+index} className="ec-spacing" style={guide.axis==='x'?{left:guide.start,top:guide.cross,width:guide.length,height:1/zoom,borderTop:(1/zoom)+'px solid currentColor'}:{left:guide.cross,top:guide.start,width:1/zoom,height:guide.length,borderLeft:(1/zoom)+'px solid currentColor'}}><span style={{fontSize:10/zoom,top:-16/zoom}}>{Math.round(guide.length)} px</span></div>)}
        {resize&&<div className="ec-selection-box" style={{left:resize.x,top:resize.y,width:resize.width,height:resize.height,borderWidth:2/zoom}}><span className="ec-object-name" style={{transform:`scale(${1/zoom})`,transformOrigin:'0 100%'}}>流式尺寸 {Math.round(resize.width)} × {Math.round(resize.height)}</span></div>}
        {box&&<div className="ec-selection-box" style={{left:box.x,top:box.y,width:box.width,height:box.height}}/>}{region&&<div className="ec-region-box" style={{left:region.x,top:region.y,width:region.width,height:region.height}}><span>截图引用 · {Math.round(region.width)} × {Math.round(region.height)}</span></div>}{drop&&<div className="ec-drop-line" style={{left:drop.x,top:drop.y,width:drop.width}}><span>{drop.label}</span></div>}
      </div>}
      {inline&&!framework&&mode==='edit'&&<textarea autoFocus disabled={textSaving} aria-label={inline.fsVersion!==model?.version?'保留的早期版本文字草稿，保存将进行版本检查':'直接编辑文字'} className="ec-inline-text" style={{left:inline.bounds.x,top:inline.bounds.y,width:Math.max(130/zoom,inline.bounds.width),height:Math.max(46/zoom,inline.bounds.height),fontSize:14/zoom,borderWidth:2/zoom}} value={inline.value} onChange={event=>setInline(value=>({...value,value:event.target.value}))} onBlur={()=>saveInline().catch(error=>onDiagnostic?.({code:error.code||'TEXT_SAVE',message:error.message,pageId:page.id}))} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){inlineRef.current=null;setInline(null)}if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();saveInline().catch(error=>onDiagnostic?.({code:error.code||'TEXT_SAVE',message:error.message,pageId:page.id}))}}}/>} 
      {props.selectingScreenshot&&<ScreenshotRegion viewport={viewport} onCancel={props.onCancelScreenshot} onCopy={props.onCopyScreenshot}/>}
      {!ready&&html!==undefined&&<div className="ec-frame-loading">正在刷新已保存版本…</div>}
    </div>
    {pendingReload&&frozen&&<div role="status" className="ec-frame-placeholder">页面结构或脚本已更新，恢复交互时加载。</div>}
    {!interactive&&selected&&mode==='edit'&&ids.length>0&&<div className="ec-object-actions" style={{top:viewport.height+10/zoom,transform:`scale(${1/zoom})`,transformOrigin:'0 0'}}><button onClick={()=>onGesture?.('reference',{pageId:page.id,nodeIds:ids,label:objects[0]?.name||'选中对象'})}>加入对话</button><button onClick={()=>onGesture?.('properties')}>属性</button><button onClick={()=>onGesture?.(framework?'properties':'layers')}>{framework?'源码位置':'定位图层'}</button><button onClick={()=>request('parent',{nodeId:ids[0]}).then(async parent=>{if(!parent)return;const objects=parent.referenceOnly?await readCompleteElements(request,[parent]):await completeObjects([parent]);return current.current.onSelect?.({pageId:page.id,nodeIds:parent.id?[parent.id]:[],objects,referenceOnly:!!parent.referenceOnly,...selectionMetadata(objects)});}).catch(error=>current.current.onDiagnostic?.({code:error.code||'ELEMENT_PARENT',message:error.message,pageId:page.id}))}>父容器</button></div>}
  </article>;
}
