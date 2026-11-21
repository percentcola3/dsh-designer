import {labelSelection,removeSelectionElement} from './selection-labels.js';
import React from 'react';
import {pngClipboardBlob} from '../ui/export-clipboard.js';
import PageFrame from './PageFrame.jsx';
import Properties from './Properties.jsx';
import ImageReplacement from './ImageReplacement.jsx';
import {imageOperations,imageTarget} from './image-replacement.js';
import {uploadFile} from '../ui/upload.js';
import {readCompleteElements,readSourceInstances} from './rpc.js';
import Dialog from './Dialog.jsx';
import {canvasStyles} from './styles.js';
import {clamp,viewportOf,pageWithViewViewport,pageWithContentHeight,savedViewportOf,positionOf,zoomAround,fitBounds,unionBounds,selectionIds,mergeMeasurements,sharedContext,topmostIds,relativePath,escapeHTML,snapPage,artifactOf,isFrameworkArtifact,assertCanvasOperations,selectionMetadata,frameworkOperations,sourceEditable,requiresSourceTemplateConfirmation,sourceEditMessage} from './geometry.js';
import {operationNodeIds} from './property-model.js';
import {documentDelta,documentSnapshot} from './document-delta.js';
import DiffPanel from './DiffPanel.jsx';
import {canvasTransaction} from '../ui/canvas-transaction.js';
import {ErrorBox} from '../ui/common.jsx';
import {panelWidth} from '../ui/panel-layout.js';
import useCanvasNavigation from './useCanvasNavigation.js';
import {cameraGrid,wheelNavigation} from './canvas-navigation.js';
const cancelled=()=>Object.assign(new Error('已取消此次修改。'),{code:'EDIT_CANCELLED'});
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
const copy=value=>structuredClone(value);
const isDocument=value=>typeof value?.html==='string'&&value.valid!==false&&!(value.diagnostics||[]).some(item=>item.severity==='error');
const devicePresets={desktop:{width:1440,height:900},tablet:{width:768,height:1024},mobile:{width:390,height:844}};

export default function CanvasEditor(props){
  const {project,design,pages:providedPages=[],documents:providedDocuments={},activePageId,selection,mode='edit',viewState={},readonly=false,compactChrome=false,onCreatePage,t}=props;
  const root=React.useRef(null),container=React.useRef(null),current=React.useRef(props),projectRef=React.useRef(project),documentsRef=React.useRef({}),pagesRef=React.useRef([]),selectionRef=React.useRef(selection),frames=React.useRef(new Map()),frameWaiters=React.useRef(new Map()),propertyController=React.useRef(null),queue=React.useRef(Promise.resolve()),mounted=React.useRef(true),viewRef=React.useRef(viewState),modalRef=React.useRef(null),reads=React.useRef(new Map()),measurementSignatures=React.useRef(new Map()),controller=React.useRef({}),flushRef=React.useRef(async()=>{}),history=React.useRef({entries:[],index:-1});
  current.current=props;selectionRef.current=selection;viewRef.current={...viewRef.current,...viewState};if(projectRef.current?.id!==project?.id||Number(project?.revision)>=Number(projectRef.current?.revision||0))projectRef.current=project;
  const [camera,setCamera]=React.useState(()=>viewState.camera||{x:50,y:70,zoom:.5}),[single,setSingle]=React.useState(!!viewState.single),[hand,setHand]=React.useState(false),[grid,setGrid]=React.useState(viewState.grid!==false),[snap,setSnap]=React.useState(viewState.snap!==false),[helpers,setHelpers]=React.useState(viewState.helpers!==false),[checker,setChecker]=React.useState(!!viewState.checker),[properties,setProperties]=React.useState(false),[scope,setScope]=React.useState('instance'),[saving,setSaving]=React.useState(false),[error,setError]=React.useState(null),[modal,setModal]=React.useState(null),[overrides,setOverrides]=React.useState({}),[positions,setPositions]=React.useState({}),[measurements,setMeasurements]=React.useState({}),[statuses,setStatuses]=React.useState({}),[changed,setChanged]=React.useState({}),[background,setBackground]=React.useState(viewState.background||''),[snapshotBusy,setSnapshotBusy]=React.useState(false),[guides,setGuides]=React.useState([]),[diffs,setDiffs]=React.useState({});
  const [picking,setPicking]=React.useState(false),[contentHeights,setContentHeights]=React.useState({});
  const [frozenPages,setFrozenPages]=React.useState(()=>new Set());
  const freezeLock=React.useRef(false);
  const immersive=compactChrome;
  const [manualScale,setManualScale]=React.useState(null);
  const [pageExtent,setPageExtent]=React.useState(null);
  const [fitRequest,setFitRequest]=React.useState(0);
  const [previewSize,setPreviewSize]=React.useState({width:1440,height:900});
  React.useLayoutEffect(()=>{
    if(!immersive||!root.current)return;
    const node=root.current,measure=()=>{const rect=node.getBoundingClientRect();setPreviewSize({width:rect.width,height:rect.height});};
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[immersive]);
  const [optionsOpen,setOptionsOpen]=React.useState(false),[contextMenu,setContextMenu]=React.useState(null);
  const frameworkEditRef=React.useRef(null),pendingSourceSelection=React.useRef(null),reselectSourceRef=React.useRef(null);
  const [propertiesWidth,setPropertiesWidth]=React.useState(()=>panelWidth(viewState.propertiesWidth,270,520,330));
  React.useEffect(()=>{setPropertiesWidth(panelWidth(viewState.propertiesWidth,270,520,330));},[project.id,design?.id]);
  const selectionRemovalQueue=React.useRef(Promise.resolve());
  const documentHistory=React.useRef(new Map()),identityPending=React.useRef(new Map()),selectionIntent=React.useRef(0);
  const [identityEpoch,setIdentityEpoch]=React.useState(0);
  const cameraRef=React.useRef(camera);cameraRef.current=camera;const snapRef=React.useRef(snap);snapRef.current=snap;modalRef.current=modal;
  const validCache=React.useRef(new Map());const designIds=new Set(design?.pageIds||[]),sourcePages=providedPages.filter(page=>!page.deletedAt&&(!design?.id||designIds.has(page.id)||page.designId===design.id));
  const pages=sourcePages.map(page=>{const latest=projectRef.current?.artboards?.find(value=>value.id===page.id&&!value.deletedAt);return pageWithContentHeight(pageWithViewViewport({...page,...(latest&&Number(latest.revision)>=Number(page.revision)?latest:{}),position:positions[page.id]||latest?.position||page.position||{x:0,y:0}},viewState),mode,compactChrome?undefined:contentHeights[page.id])});pagesRef.current=pages;
  const documents={};for(const page of pages){const incoming=providedDocuments[page.id],local=overrides[page.id]?.__editorOwnerId===project.id?overrides[page.id]:undefined;let candidate=local&&(!incoming||Number(local.artboardRevision||0)>Number(incoming.artboardRevision||0)||local.version===incoming.version)?local:incoming;if(!candidate&&local)candidate=local;if(isDocument(candidate)){validCache.current.set(project.id+'/'+page.id,candidate);documents[page.id]=candidate}else documents[page.id]=validCache.current.get(project.id+'/'+page.id)||candidate;}
  documentsRef.current=documents;const active=pages.find(page=>page.id===activePageId)||pages[0],selectedPage=pages.find(page=>page.id===selection?.pageId)||active,selectedIds=selectionIds(selection),selectedModel=documents[selectedPage?.id],selectedFramework=isFrameworkArtifact(selectedModel,selectedPage),activeFramework=isFrameworkArtifact(documents[active?.id],active),selectedObjects=selection?.referenceOnly?selection.objects||[]:mergeMeasurements(selectedIds,selectedModel,measurements[selectedPage?.id]||selection?.objects||[],selectedPage),shown=(compactChrome||single)&&active?[active]:pages;
  const deviceWidth=design?.platform==='mobile'||['mobile','tablet','custom'].includes(viewState.device)?viewportOf(active).width:Infinity;
  const baseWidth=Math.max(100,Math.floor(Math.min(previewSize.width,deviceWidth)));
  const baseHeight=Math.max(100,Math.floor(previewSize.height));
  const previewKey=JSON.stringify([project.id,active?.id,baseWidth,baseHeight]);
  const extent=pageExtent?.key===previewKey?pageExtent:{width:baseWidth,height:baseHeight};
  const fitScale=Math.min(1,baseWidth/extent.width,baseHeight/extent.height);
  const previewZoom=manualScale??(fitRequest?fitScale:Math.min(1,baseWidth/extent.width));
  // Keep the top of a long page in view while its content loads or changes.
  const pageCenterOffset=fitRequest?0:(extent.height-baseHeight)*previewZoom/2;
  // Zoom and pan the whole document without changing its CSS layout viewport.
  const previewViewport=extent;
  const [pan,setPan]=React.useState({x:0,y:0});
  const previewCamera=React.useRef(null);
  previewCamera.current={x:previewSize.width/2+pan.x,y:previewSize.height/2+pan.y,zoom:previewZoom};
  function movePreview(next){
    if(next.zoom!==previewCamera.current.zoom)setManualScale(next.zoom);
    previewCamera.current=next;
    setPan({x:next.x-previewSize.width/2,y:next.y-previewSize.height/2});
  }
  function frameWheel(event){
    const stage=root.current;
    if(stage)movePreview(wheelNavigation(previewCamera.current,event,stage.getBoundingClientRect(),true));
  }
  React.useLayoutEffect(()=>{setManualScale(null);setFitRequest(0);setPageExtent(null);setPan({x:0,y:0});},[project.id,active?.id]);
  function changePreviewZoom(action){
    if(action==='fit'){setPan({x:0,y:0});setManualScale(null);setFitRequest(value=>value+1);return;}
    const zoom=clamp(previewZoom*(action==='in'?1.25:.8),Math.min(.25,fitScale),3);
    movePreview(zoomAround(previewCamera.current,zoom/previewZoom,{x:previewSize.width/2,y:previewSize.height/2}));
  }
  const hasElementSelection=Boolean((!compactChrome||selection?.pageId===active?.id)&&selection?.pageId&&selection.pageId===selectedPage?.id&&(selectedObjects.length||(selectedFramework&&selectedIds.length)));
  const [screenshotPage,setScreenshotPage]=React.useState(null);
  const [copyNotice,setCopyNotice]=React.useState('');
  const cancelScreenshot=React.useCallback(()=>setScreenshotPage(null),[]);
  React.useEffect(()=>{
    if(!copyNotice)return;
    const timer=setTimeout(()=>setCopyNotice(''),2500);
    return ()=>clearTimeout(timer);
  },[copyNotice]);
  const showProperties=properties&&hasElementSelection;
  React.useLayoutEffect(()=>{
    if(!immersive)return;
    setScreenshotPage(null);setCopyNotice('');
    // Leaving a page unmounts its live document, including its frozen state.
    setFrozenPages(previous=>previous.size?new Set():previous);
    setPicking(false);
  },[immersive,project.id,design?.id,active?.id]);
  React.useLayoutEffect(()=>{
    if(properties&&!hasElementSelection)setProperties(false);
  },[properties,hasElementSelection]);
  React.useLayoutEffect(()=>{const view=current.current.viewState||{};viewRef.current=view;const next=view.camera||{x:50,y:70,zoom:.5};cameraRef.current=next;setCamera(next);setSingle(!!view.single);setGrid(view.grid!==false);setSnap(view.snap!==false);setHelpers(view.helpers!==false);setChecker(!!view.checker);setBackground(view.background||'');setPositions({});setContentHeights({});setMeasurements({});setDiffs({});setGuides([]);measurementSignatures.current.clear();setScope('instance');setOptionsOpen(false);setContextMenu(null);pendingSourceSelection.current=null;selectionIntent.current++;setError(null);history.current={entries:[],index:-1};modalRef.current?.reject?.(cancelled());setModal(null);},[project.id,design?.id]);
  React.useEffect(()=>{const updates={},marks={};for(const page of pagesRef.current){const document=documentsRef.current[page.id];if(!isDocument(document))continue;const key=project.id+'/'+page.id,previous=documentHistory.current.get(key),next=documentSnapshot(document,page);if(previous&&previous.document.html!==document.html){const delta=documentDelta(previous.document,document);updates[page.id]={before:previous,after:next,delta};marks[page.id]=delta.affectedNodeIds}documentHistory.current.set(key,next)}if(Object.keys(updates).length){setDiffs(values=>({...values,...updates}));setChanged(values=>({...values,...marks}))}},[project.id,providedDocuments,overrides]);
  const diagnose=React.useCallback(value=>{if(!mounted.current||value?.code==='EDIT_CANCELLED')return;const diagnostic={severity:'error',...value};if(diagnostic.severity==='error')setError(diagnostic);current.current.onDiagnostics?.(diagnostic)},[]);
  const emitView=React.useCallback(patch=>{viewRef.current={...viewRef.current,...patch};current.current.onViewState?.(viewRef.current)},[]);
  const cameraChange=React.useCallback(value=>{const next=typeof value==='function'?value(cameraRef.current):value;cameraRef.current=next;setCamera(next);emitView({camera:next})},[emitView]);
  const acceptResult=React.useCallback((result,ownerId)=>{if(!result)return;if((ownerId&&ownerId!==current.current.project.id)||(result.project?.id&&result.project.id!==current.current.project.id))return result;if(result.project&&(!projectRef.current||Number(result.project.revision)>=Number(projectRef.current.revision)))projectRef.current=result.project;if(result.document&&result.page?.id){const document={...result.document,__editorOwnerId:result.project?.id||ownerId||current.current.project.id};documentsRef.current={...documentsRef.current,[result.page.id]:document};setOverrides(values=>({...values,[result.page.id]:document}));}if(result.changes?.affectedNodeIds&&result.page?.id)setChanged(values=>({...values,[result.page.id]:result.changes.affectedNodeIds}));return result},[]);
  const commit=React.useCallback(input=>{
    const perform=async()=>{if(!mounted.current||input.ownerProjectId&&input.ownerProjectId!==current.current.project.id)throw cancelled();if(identityPending.current.has(projectRef.current.id+'/'+input.pageId))throw fail('IDENTITY_REFRESH_PENDING','源身份正在重新读取，旧事务保持冻结且不会自动重放。');if(current.current.readonly)throw fail('READ_ONLY','当前设计为只读。');const project=projectRef.current,page=pagesRef.current.find(page=>page.id===input.pageId),document=documentsRef.current[input.pageId];if(!project||!page)throw fail('PAGE_NOT_FOUND','页面已不在当前设计中。');assertCanvasOperations(document,page,input.operations);if(typeof current.current.onChange!=='function')throw fail('SAVE_UNAVAILABLE','当前工作台没有提供真实保存接口。');setSaving(true);setError(null);try{const {ownerProjectId,...change}=input;const result=await current.current.onChange(canvasTransaction(change,{project,design:current.current.design,pages:pagesRef.current,documents:documentsRef.current}));if(!result?.saved&&!result?.project&&!result?.document)throw fail('SAVE_UNCONFIRMED','保存接口没有返回已保存版本，继续保留当前内容。');if(mounted.current)acceptResult(result,project.id);return result}catch(error){diagnose({code:error.code||'EDIT_FAILED',message:error.message,details:error.details,pageId:input.pageId});throw error}finally{if(mounted.current)setSaving(false)}};
    const task=queue.current.catch(()=>{}).then(perform);queue.current=task;return task;
  },[acceptResult,diagnose]);
  const impact=React.useCallback(async input=>{const p=current.current,model=documentsRef.current[input.pageId],ids=input.nodeIds||[...new Set((input.operations||[]).flatMap(operation=>operationNodeIds(operation,model)))];if(!p.api)throw fail('IMPACT_UNAVAILABLE','共享修改需要连接真实影响范围接口。');const result=await p.api('edit.impact',{projectId:projectRef.current.id,pageId:input.pageId,nodeIds:ids,definitionScope:input.definitionScope||'definition'});if(result.projectRevision!==projectRef.current.revision)throw fail('VERSION_CONFLICT','影响预览期间项目已更新，请重新预览。');return {...result,requestedNodeIds:ids}},[]);
  const applyOperations=React.useCallback(async input=>{
    input={...input,ownerProjectId:input.ownerProjectId||current.current.project.id};if(identityPending.current.has(input.ownerProjectId+'/'+input.pageId))throw fail('IDENTITY_REFRESH_PENDING','源身份已变化，旧事务保留原版本，等待页面重新读取。');const model=documentsRef.current[input.pageId];if(!model)throw fail('DOCUMENT_NOT_READY','页面内容尚未加载。');if(input.runtimeStyle){
      const {referenceId,selector}=input.runtimeStyle;
      const frame=frames.current.get(input.pageId);
      const target=await frame?.request('reference.measure',{referenceId});
      if(!target||target.locked||!selector||target.runtimeSelector!==selector||model.schemaSource||isFrameworkArtifact(model))throw fail('ELEMENT_CHANGED','此对象已经变化，请重新拾取。');
      return commit(input);
    }
    if(model.schemaSource)input={...input,sceneId:Object.hasOwn(input,'sceneId')?input.sceneId:viewRef.current.pages?.[input.pageId]?.scene??current.current.scene??null};if(!Array.isArray(input.operations)||!input.operations.length)throw fail('INVALID_OPERATIONS','缺少真实文档操作。');if(input.operations.length>100)throw fail('OPERATION_LIMIT','本次操作超过 100 项，请缩小明确选择范围。');if(isFrameworkArtifact(model,pagesRef.current.find(page=>page.id===input.pageId))&&input.operations.some(operation=>!['page.position','page.viewport'].includes(operation.type)))return frameworkEditRef.current(input);try{assertCanvasOperations(model,pagesRef.current.find(page=>page.id===input.pageId),input.operations);}catch(error){diagnose({code:error.code,message:error.message,pageId:input.pageId});throw error;}const definitionScope=input.definitionScope||scopeRef.current,operations=input.operations.map(operation=>{if(operation.scope||['undo','redo','page.position','page.viewport','lock'].includes(operation.type))return operation;const ids=operationNodeIds(operation,model),shared=ids.some(id=>sharedContext(id,model.nodes));return shared?{...operation,scope:['move','remove','duplicate','replace','insert'].includes(operation.type)?'instance':definitionScope}:operation});
    const shared=operations.some(operation=>operation.scope==='definition'&&operationNodeIds(operation,model).some(id=>sharedContext(id,model.nodes)));if(!input.requiresImpact&&!shared)return commit({...input,operations});
    const preview=await impact({...input,operations,definitionScope:'definition'}),page=pagesRef.current.find(page=>page.id===input.pageId),frozen=copy({...input,operations,expectedRevision:Object.hasOwn(input,'expectedRevision')?input.expectedRevision:preview.projectRevision,expectedArtboardRevision:Object.hasOwn(input,'expectedArtboardRevision')?input.expectedArtboardRevision:model.artboardRevision??page?.revision,expectedFsVersion:Object.hasOwn(input,'expectedFsVersion')?input.expectedFsVersion:model.version});return new Promise((resolve,reject)=>setModal({type:'impact',preview,input:frozen,resolve,reject}));
  },[commit,impact,diagnose]);
  const scopeRef=React.useRef(scope);scopeRef.current=scope;
  const getFrame=React.useCallback(async pageId=>{if(frames.current.has(pageId))return frames.current.get(pageId);return new Promise((resolve,reject)=>{const entry={resolve,reject,timer:setTimeout(()=>{frameWaiters.current.get(pageId)?.delete(entry);reject(fail('FRAME_NOT_READY','目标页面尚未挂载。'))},8000)};if(!frameWaiters.current.has(pageId))frameWaiters.current.set(pageId,new Set());frameWaiters.current.get(pageId).add(entry)})},[]);
  const registerFrame=React.useCallback((id,value)=>{if(value){frames.current.set(id,value);for(const entry of frameWaiters.current.get(id)||[]){clearTimeout(entry.timer);entry.resolve(value)}frameWaiters.current.delete(id)}else frames.current.delete(id)},[]);
  const registerProperties=React.useCallback(value=>{propertyController.current=value},[]);
  const flush=React.useCallback(async()=>{await propertyController.current?.flush();for(const frame of frames.current.values())await frame.flush?.();await queue.current.catch(()=>{});},[]);flushRef.current=flush;
  const validate=React.useCallback(async()=>{await flush();const p=current.current,page=pagesRef.current.find(value=>value.id===p.activePageId)||pagesRef.current[0];if(!page)return {valid:true};if(!p.api)throw fail('VALIDATION_UNAVAILABLE','当前连接没有真实文档校验接口。');const report=await p.api('edit.validate',{projectId:projectRef.current.id,pageId:page.id});if(report.valid===false)throw fail('VALIDATION_FAILED',report.diagnostics?.filter(item=>item.severity==='error').map(item=>item.message).join('\n')||'页面校验失败。',report);return report},[flush]);
  const ensureDocument=React.useCallback(async pageId=>{const existing=documentsRef.current[pageId];if(isDocument(existing))return existing;const projectId=projectRef.current.id,readKey=projectId+'/'+pageId;if(reads.current.has(readKey))return reads.current.get(readKey);const task=(async()=>{if(!current.current.api)throw fail('DOCUMENT_UNAVAILABLE','尚未提供页面读取接口。');const result=await current.current.api('edit.read',{projectId,pageId});if(!mounted.current||projectRef.current.id!==projectId)return;if(!isDocument(result.document))throw fail('DOCUMENT_INVALID','新版本校验失败，保留最近有效页面。',result.document?.diagnostics);acceptResult(result);return result.document})();reads.current.set(readKey,task);try{return await task}finally{reads.current.delete(readKey)}},[acceptResult]);
  React.useEffect(()=>{let canceled=false;const missing=shown.filter(page=>!isDocument(documentsRef.current[page.id]));let next=0;const worker=async()=>{while(!canceled&&next<missing.length){const page=missing[next++];try{await ensureDocument(page.id)}catch(error){if(!canceled)diagnose({code:error.code||'PAGE_READ',message:error.message,pageId:page.id})}}};Promise.all(Array.from({length:Math.min(4,missing.length)},worker));return()=>{canceled=true}},[project.id,design?.id,shown.map(page=>page.id).join('|'),ensureDocument,diagnose]);
  const measureSelection=React.useCallback(async()=>{const selection=selectionRef.current;if(selection?.pageId)return frames.current.get(selection.pageId)?.measure()},[]);
  const resolveSelection=React.useCallback(async value=>{
    if(!value?.pageId||!selectionIds(value).length&&!value.objects?.length)return value;
    const ownerId=projectRef.current.id,page=pagesRef.current.find(page=>page.id===value.pageId),model=documentsRef.current[value.pageId];if(!page||!model)throw fail('PAGE_NOT_FOUND','目标页面已不在当前设计中。');const frame=await getFrame(value.pageId),ids=selectionIds(value);
    let objects=value.objects||[];
    if(ids.some(id=>!objects.some(object=>(object.nodeId||object.id)===id)))objects=await frame.request('measure',{nodeIds:ids});
    if(ids.some(id=>!objects.some(object=>(object.nodeId||object.id)===id)))throw fail('ELEMENT_NOT_FOUND','部分运行实例已不存在，请重新选择后再引用。');
    objects=await readCompleteElements(frame.request,objects);
    if(projectRef.current.id!==ownerId)throw cancelled();
    if(isFrameworkArtifact(model,page)){
      const state=await frame.state(),epoch=value.documentEpoch??objects[0]?.documentEpoch,artifact=artifactOf(model,page);
      if(epoch===undefined||state.documentEpoch!==epoch||objects.some(object=>object.documentEpoch!==epoch||['kind','entry','version','buildId'].some(key=>object.artifact?.[key]!==artifact?.[key])))throw fail('ELEMENT_IDENTITY_CHANGED','组件构建已更新，旧实例不能继续引用，请重新选择元素。');
    }
    if(!mounted.current||projectRef.current.id!==ownerId||!pagesRef.current.some(page=>page.id===value.pageId))throw cancelled();
    return {...value,...selectionMetadata(objects),objects};
  },[getFrame]);
  const editFramework=React.useCallback(async input=>{
    const ownerId=current.current.project.id,expectedRevision=input.expectedRevision??projectRef.current.revision;
    try{
      if(current.current.readonly)throw fail('READ_ONLY','当前设计为只读。');
      if(input.ownerProjectId&&input.ownerProjectId!==ownerId)throw cancelled();
      if(!current.current.api)throw fail('SOURCE_EDIT_UNAVAILABLE','当前连接没有提供源码保存接口。');
      const operations=frameworkOperations(input.operations),ids=[...new Set(operations.flatMap(operation=>operation.nodeIds))],frame=await getFrame(input.pageId),basis=input.selection||selectionRef.current||{},objects=await frame.request('measure',{nodeIds:ids});
      const selected=await resolveSelection({...basis,pageId:input.pageId,nodeIds:ids,objects});
      if(selected.objects.some(object=>!sourceEditable(object)))throw fail('SOURCE_MAPPING_REQUIRED','选区含没有可信源码映射的元素，请选择原生组件节点或加入对话。');
      let confirmed=input.sourceTemplateConfirmed===true;
      if(!confirmed&&requiresSourceTemplateConfirmation(selected.objects))confirmed=await new Promise((resolve,reject)=>setModal({type:'sourceTemplate',objects:selected.objects,resolve,reject}));
      if(projectRef.current.id!==ownerId)throw cancelled();
      const frozen=copy({projectId:ownerId,pageId:input.pageId,expectedRevision,selection:selected,operations,...(confirmed?{sourceTemplateConfirmed:true}:{})});
      const perform=async()=>{
        if(!mounted.current||projectRef.current.id!==ownerId)throw cancelled();setSaving(true);setError(null);setContextMenu(null);
        try{
          const result=await current.current.api('framework.edit',frozen);
          if(result?.saved!==true||result?.sourceSaved!==true||!result.document||!result.page)throw fail('SOURCE_SAVE_UNCONFIRMED','接口没有确认源码已保存并重新编译，继续保留属性草稿。');
          if(!mounted.current||projectRef.current.id!==ownerId)return result;
          pendingSourceSelection.current=result.selectedSourceIds?.length?{ownerId,pageId:input.pageId,sourceIds:result.selectedSourceIds,artifact:artifactOf(result.document,result.page)||result.artifact}:null;
          selectionIntent.current++;selectionRef.current={pageId:input.pageId,nodeIds:[],objects:[],invalidated:true};current.current.onSelect?.(selectionRef.current,{source:'source-edit'});
          measurementSignatures.current.delete(input.pageId);setMeasurements(values=>({...values,[input.pageId]:[]}));
          acceptResult(result,ownerId);return result;
        }finally{if(mounted.current)setSaving(false);}
      };
      const task=queue.current.catch(()=>{}).then(perform);queue.current=task;return await task;
    }catch(error){if(error.code!=='EDIT_CANCELLED'){diagnose({code:error.code||'SOURCE_EDIT_FAILED',message:sourceEditMessage(error),details:{originalMessage:error.message,...(error.details!==undefined?{diagnostic:error.details}:{})},pageId:input.pageId});error.canvasReported=true;}throw error;}
  },[getFrame,resolveSelection,acceptResult,diagnose]);frameworkEditRef.current=editFramework;
  reselectSourceRef.current=async(pageId,status)=>{
    const pending=pendingSourceSelection.current;if(!pending||pending.pageId!==pageId||pending.ownerId!==projectRef.current.id)return;
    if(['kind','entry','version','buildId'].some(key=>status.artifact?.[key]!==pending.artifact?.[key]))return;
    pendingSourceSelection.current=null;const intent=selectionIntent.current;
    try{const frame=await getFrame(pageId),result=await readSourceInstances(frame.request,pending.sourceIds,{documentEpoch:status.documentEpoch,artifact:pending.artifact});if(projectRef.current.id!==pending.ownerId)return;
      if(!result.objects.length||result.missingSourceNodeIds?.length)throw fail('SOURCE_RESELECT_MISSING','部分源码节点当前没有渲染，请在画布中重新选择。');
      const paths=new Map((pending.artifact?.manifest||[]).map(locator=>[locator.id,locator.path]));if(result.objects.some(object=>paths.get(object.sourceNodeId)!==object.sourceLocator?.path))throw fail('SOURCE_RESELECT_MISMATCH','新构建的源码位置不匹配，请手动重新选择。');
      const next=await resolveSelection({pageId,nodeIds:result.objects.map(object=>object.nodeId),objects:result.objects,...selectionMetadata(result.objects)});if(intent!==selectionIntent.current)return;selectionIntent.current++;selectionRef.current=next;current.current.onSelect?.(next,{source:'source-edit'});setMeasurements(values=>({...values,[pageId]:next.objects}));
    }catch(error){diagnose({code:'SOURCE_RESELECT_FAILED',message:'源码已保存并重新编译；自动重选未完成：'+error.message,pageId});}
  };
  const select=React.useCallback(async value=>{if(value?.pageId&&identityPending.current.has(projectRef.current.id+'/'+value.pageId))throw fail('IDENTITY_REFRESH_PENDING','源身份已变化，正在重新读取；旧选区不能成为修改目标。');const intent=++selectionIntent.current;await flushRef.current();value=await resolveSelection(value);if(intent!==selectionIntent.current)return;value=labelSelection(value,selectionRef.current);selectionRef.current=value;if(current.current.compactChrome)setProperties(Boolean(value?.objects?.length||selectionIds(value).length));current.current.onSelect?.(value,{source:value?.invalidated?'invalidation':'user'});if(value?.pageId)current.current.onNavigate?.({pageId:value.pageId,selection:true});},[resolveSelection]);
  const removeSelections=React.useCallback(ids=>{
    const ownerId=projectRef.current.id,designId=current.current.design?.id;
    const operation=selectionRemovalQueue.current.then(()=>{
      if(projectRef.current.id!==ownerId||current.current.design?.id!==designId)throw cancelled();
      return select(ids.reduce(removeSelectionElement,selectionRef.current));
    });
    selectionRemovalQueue.current=operation.catch(()=>{});
    return operation;
  },[select]);
  const measured=React.useCallback((pageId,objects,ids)=>{const signature=JSON.stringify(objects);if(measurementSignatures.current.get(pageId)===signature)return;measurementSignatures.current.set(pageId,signature);setMeasurements(values=>({...values,[pageId]:objects}));const selection=selectionRef.current;if(selection?.pageId===pageId&&selectionIds(selection).join('|')===ids.join('|')){const framework=isFrameworkArtifact(documentsRef.current[pageId],pagesRef.current.find(page=>page.id===pageId)),valid=framework?ids.filter(id=>objects.some(object=>(object.nodeId||object.id)===id)):ids;const next={...selection,...selectionMetadata(objects),nodeIds:valid,objects,measurement:true,...(valid.length!==ids.length?{invalidated:true}:{})};selectionRef.current=next;current.current.onSelect?.(next,{source:valid.length!==ids.length?'invalidation':'measurement'})}},[]);
  const referenceElement=React.useCallback(async input=>{
    const requested=input||selectionRef.current;if(!requested?.pageId)throw fail('ELEMENT_SELECTION_REQUIRED','请先选择要引用的元素。');
    await flush();const ownerId=projectRef.current.id,page=pagesRef.current.find(page=>page.id===requested.pageId),document=documentsRef.current[requested.pageId];if(!page||!document)throw fail('PAGE_NOT_FOUND','引用页面已不存在。');
    const ids=selectionIds(requested),frame=await getFrame(page.id),objects=ids.length?await frame.request('measure',{nodeIds:ids}):requested.objects||[];
    if(!objects.length)throw fail('ELEMENT_NOT_FOUND','未找到可引用的完整元素，请重新选择。');
    const complete=await resolveSelection({...requested,pageId:page.id,nodeIds:ids,objects});if(projectRef.current.id!==ownerId)throw cancelled();
    const first=complete.objects[0],reference={...complete,type:'element',projectId:ownerId,designId:current.current.design?.id,pageId:page.id,sourceVersion:document.artboardRevision??page.revision,artboardRevision:document.artboardRevision??page.revision,fsVersion:document.version,elementContext:complete.objects,...(complete.objects.length===1?{nodeId:first.nodeId,instanceId:first.instanceId,sourceNodeId:first.sourceNodeId,sourceLocator:first.sourceLocator,outerHTML:first.outerHTML,outerHTMLTotal:first.outerHTMLTotal,outerHTMLTotalBytes:first.outerHTMLTotalBytes,outerHTMLTruncated:false}:{}),label:requested.label||first.name||'选中元素'};
    await current.current.onReference?.(reference);return reference;
  },[flush,getFrame,resolveSelection]);
  const fit=React.useCallback((selectedOnly=false)=>{const element=root.current;if(!element)return;const rect=element.getBoundingClientRect(),p=current.current,selected=selectionRef.current;let boxes;if(selectedOnly&&selected?.pageId){const page=pagesRef.current.find(value=>value.id===selected.pageId),objects=mergeMeasurements(selectionIds(selected),documentsRef.current[selected.pageId],measurementsRef.current[selected.pageId]||selected.objects||[],page);boxes=objects.map(object=>object.bounds&&({x:positionOf(page).x+object.bounds.x,y:positionOf(page).y+object.bounds.y,width:object.bounds.width,height:object.bounds.height})).filter(Boolean)}else{const pages=singleRef.current?pagesRef.current.filter(page=>page.id===(p.activePageId||pagesRef.current[0]?.id)):pagesRef.current;boxes=pages.map(page=>({x:positionOf(page).x,y:positionOf(page).y-36,width:viewportOf(page).width,height:viewportOf(page).height+36}))}const bounds=unionBounds(boxes),next=bounds&&fitBounds(bounds,p.compactChrome?{width:rect.width,height:Math.max(200,rect.height-180)}:rect,50);if(next)cameraChange(next)},[cameraChange]);
  const singleRef=React.useRef(single),measurementsRef=React.useRef(measurements);singleRef.current=single;measurementsRef.current=measurements;
  const locate=React.useCallback(async reference=>{const page=pagesRef.current.find(value=>value.id===reference.pageId);if(!page)throw fail('PAGE_NOT_FOUND','引用页面已不在当前设计中。');if(identityPending.current.has(projectRef.current.id+'/'+page.id))throw fail('IDENTITY_REFRESH_PENDING','源身份已变化，当前引用需重新校验，不能定位至猜测的新对象。');current.current.onNavigate?.({pageId:page.id,focus:true});await ensureDocument(page.id);const frame=await getFrame(page.id);let result;for(let attempt=0;attempt<2;attempt++){try{result=await frame.locate(reference);break}catch(error){if(error.code!=='FRAME_RELOADED'||attempt)throw error}}const ids=selectionIds(reference).filter(id=>isFrameworkArtifact(documentsRef.current[page.id],page)?result?.objects?.some(object=>(object.nodeId||object.id)===id):documentsRef.current[page.id]?.nodes?.[id]);if(ids.length&&!reference.rect&&!reference.region){const next={...reference,pageId:page.id,nodeIds:ids,objects:result?.objects||[],...selectionMetadata(result?.objects)};selectionRef.current=next;current.current.onSelect?.(next,{source:'locate'})}const rect=root.current?.getBoundingClientRect();if(!rect||current.current.compactChrome)return;const pos=positionOf(page),viewport=viewportOf(page),region=reference.rect||reference.region,object=result?.object,view=result?.view||{};let x=viewport.width/2,y=viewport.height/2;if(region){x=region.x-(view.x||0)+region.width/2;y=region.y-(view.y||0)+region.height/2}else if(object?.bounds){x=object.bounds.x+object.bounds.width/2;y=object.bounds.y+object.bounds.height/2}cameraChange({...cameraRef.current,x:rect.width/2-(pos.x+x)*cameraRef.current.zoom,y:rect.height/2-(pos.y+y)*cameraRef.current.zoom});},[ensureDocument,getFrame,cameraChange]);
  const navigate=React.useCallback(value=>{
    if(value.back){const h=history.current;if(h.index<=0){diagnose({severity:'info',code:'PREVIEW_HISTORY_EMPTY',message:'当前设计尚无可返回的页面。'});return}h.index--;current.current.onNavigate?.({pageId:h.entries[h.index],runtime:true,back:true});return}
    if(!value.pageId||!pagesRef.current.some(page=>page.id===value.pageId)){if(value.pageId)diagnose({code:'NAVIGATION_TARGET_MISSING',message:'跳转目标不属于当前设计页面。'});return}
    if(value.runtime){const h=history.current;if(h.entries[h.index]!==value.pageId){h.entries=h.entries.slice(0,h.index+1);h.entries.push(value.pageId);h.index=h.entries.length-1}}
    if(value.single){setSingle(true);emitView({single:true})}current.current.onNavigate?.(value);if(value.focus||value.single||value.runtime)locate({pageId:value.pageId}).catch(error=>diagnose({code:error.code,message:error.message}));
  },[diagnose,emitView,locate]);
  React.useEffect(()=>{if(mode==='preview'&&active){const h=history.current;if(h.index<0){h.entries=[active.id];h.index=0}}},[mode,active?.id]);
  const undo=React.useCallback(async type=>{await flush();const pageId=selectionRef.current?.pageId||current.current.activePageId||pagesRef.current[0]?.id;if(pageId)return applyOperations({pageId,operations:[{type}],summary:type==='undo'?'撤销页面最近保存':'重做页面保存'})},[flush,applyOperations]);
  const invalidateIdentity=React.useCallback(({pageIds=[],reason,projectId}={})=>{if(projectId&&projectId!==projectRef.current.id)return {invalidatedPageIds:[]};const affected=new Set(pageIds.filter(id=>pagesRef.current.some(page=>page.id===id)));for(const id of affected){identityPending.current.set(projectRef.current.id+'/'+id,{document:current.current.documents?.[id]});measurementSignatures.current.delete(id);frames.current.get(id)?.invalidateIdentity?.()}setMeasurements(values=>Object.fromEntries(Object.entries(values).filter(([id])=>!affected.has(id))));setOverrides(values=>Object.fromEntries(Object.entries(values).filter(([id])=>!affected.has(id))));setChanged(values=>Object.fromEntries(Object.entries(values).filter(([id])=>!affected.has(id))));const value=selectionRef.current;if(affected.has(value?.pageId)){const next={...value,nodeIds:[],objects:[],invalidated:true};selectionRef.current=next;current.current.onSelect?.(next,{source:'invalidation'})}setIdentityEpoch(value=>value+1);diagnose({severity:'warning',code:'IDENTITY_INVALIDATED',message:reason||'源身份已重建，旧选区与引用需重新确认。',pageIds:[...affected]});return {invalidatedPageIds:[...affected]}},[diagnose]);
  React.useEffect(()=>{let changed=false;for(const [key,record]of identityPending.current){const [owner,...parts]=key.split('/'),id=parts.join('/'),document=providedDocuments[id];if(owner===project.id&&isDocument(document)&&document!==record.document){identityPending.current.delete(key);changed=true}}if(changed)setIdentityEpoch(value=>value+1)},[project.id,providedDocuments]);
  React.useEffect(()=>{mounted.current=true;const before=event=>{if(propertyController.current?.hasDirty?.()||[...frames.current.values()].some(frame=>frame.hasDirty?.())){event.preventDefault();event.returnValue=''}};addEventListener('beforeunload',before);return()=>{mounted.current=false;removeEventListener('beforeunload',before);modalRef.current?.reject?.(cancelled());for(const values of frameWaiters.current.values())for(const entry of values){clearTimeout(entry.timer);entry.reject(cancelled())}frameWaiters.current.clear()}},[]);
  React.useEffect(()=>{if(!selection?.pageId||!selectedModel?.nodes||isFrameworkArtifact(selectedModel,selectedPage))return;const invalid=selectedIds.filter(id=>!selectedModel.nodes[id]);if(invalid.length){const valid=selectedIds.filter(id=>selectedModel.nodes[id]);diagnose({severity:'warning',code:'SELECTION_INVALIDATED',message:invalid.length+' 个原选中对象已删除，引用不会转移到相似对象。',pageId:selection.pageId,nodeIds:invalid});const next={...selection,nodeIds:valid,objects:mergeMeasurements(valid,selectedModel,measurementsRef.current[selection.pageId]||[])};selectionRef.current=next;current.current.onSelect?.(next,{source:'invalidation'})}},[selectedModel?.html,selection?.pageId,selectedIds.join('|'),diagnose]);
  const frameScroll=React.useCallback((pageId,scroll)=>{const pages=viewRef.current.pages||{};emitView({pages:{...pages,[pageId]:{...pages[pageId],scroll:{x:scroll?.x||0,y:scroll?.y||0}}}})},[emitView]);
  const frameLayout=(pageId,view)=>{
    if(!immersive){
      const height=Number(view?.contentHeight);
      if(Number.isFinite(height)&&height>0)setContentHeights(values=>values[pageId]===height?values:{...values,[pageId]:height});
      return;
    }
    if(pageId!==active?.id||!view||Math.abs(view.width-previewViewport.width)>1)return;
    const width=Math.max(baseWidth,view.documentWidth);
    const height=Math.ceil(Math.max(baseHeight,view.contentHeight));
    if(!Number.isFinite(width)||!Number.isFinite(height))return;
    setPageExtent(previous=>{
      const same=previous?.key===previewKey;
      // An external sheet or script can size content relative to the growing iframe.
      // Stop a resize that only reproduces or increases its own overflow.
      const nextExtent=(size,frameSize,priorSize,priorOverflow)=>{
        const overflow=size-frameSize;
        return same&&priorSize===frameSize&&priorOverflow>0&&overflow>=priorOverflow?priorSize:size;
      };
      const nextWidth=nextExtent(width,view.width,previous?.width,previous?.overflowX);
      const nextHeight=nextExtent(height,view.height,previous?.height,previous?.overflowY);
      const overflowX=width-view.width,overflowY=height-view.height;
      if(same&&previous.width===nextWidth&&previous.height===nextHeight&&previous.overflowX===overflowX&&previous.overflowY===overflowY)return previous;
      return {key:previewKey,width:nextWidth,height:nextHeight,overflowX,overflowY};
    });
  };
  const frameStatus=React.useCallback((pageId,status)=>{setStatuses(values=>({...values,[pageId]:status}));if(status.status==='ready')reselectSourceRef.current?.(pageId,status);current.current.onDiagnostics?.({severity:status.status==='runtime-error'?'error':'info',code:status.status==='ready'?'PREVIEW_READY':'PREVIEW_STATUS',pageId,message:status.status==='ready'?'已加载当前保存版本；交互尚未验收。':status.status,previewStatus:status.status})},[]);
  const pageMove=React.useCallback((pageId,position,temporary)=>{const page=pagesRef.current.find(page=>page.id===pageId);if(!page)return;const snapping=snapRef.current?snapPage(position,viewportOf(page),pagesRef.current.filter(value=>value.id!==pageId).map(value=>({...positionOf(value),...viewportOf(value)})),cameraRef.current.zoom):{position,guides:[]};position=snapping.position;setGuides(temporary?snapping.guides:[]);setPositions(values=>({...values,[pageId]:position}));if(!temporary)applyOperations({pageId,operations:[{type:'page.position',position}],summary:'保存画板总览位置'}).catch(error=>{setPositions(values=>{const next={...values};delete next[pageId];return next});diagnose({code:error.code||'PAGE_POSITION',message:error.message,pageId})})},[applyOperations,diagnose]);
  const zoomAt=React.useCallback((factor,clientX,clientY)=>{const rect=root.current?.getBoundingClientRect();if(rect)cameraChange(zoomAround(cameraRef.current,factor,{x:clientX-rect.left,y:clientY-rect.top}))},[cameraChange]);
  const zoomCentered=React.useCallback(factor=>{const rect=root.current?.getBoundingClientRect();if(rect)zoomAt(factor,rect.left+rect.width/2,rect.top+rect.height/2)},[zoomAt]);
  const zoomIn=React.useCallback(()=>zoomCentered(1.25),[zoomCentered]);
  const zoomOut=React.useCallback(()=>zoomCentered(.8),[zoomCentered]);
  const resetZoom=React.useCallback(()=>zoomCentered(1/cameraRef.current.zoom),[zoomCentered]);
  const setTool=React.useCallback(tool=>{if(compactChrome){setPicking(tool==='pick'||tool==='hand');setHand(false);return;}if(tool==='select'||tool==='hand')setHand(tool==='hand')},[compactChrome]);
  React.useEffect(()=>{props.onToolChange?.(compactChrome?(picking?'pick':'interact'):hand?'hand':'select')},[compactChrome,picking,hand,props.onToolChange,project.id,design?.id]);
  const toggleProperties=React.useCallback(async()=>{try{await flush();setProperties(value=>!value)}catch(error){diagnose({code:error.code||'PROPERTY_FLUSH',message:error.message});throw error}},[flush,diagnose]);
  const toggleOptions=React.useCallback(()=>setOptionsOpen(value=>!value),[]);
  async function capturePageState(pageId) {
    const page=pagesRef.current.find(row=>row.id===pageId), doc=documentsRef.current[pageId];
    if (!isDocument(doc)||!page||page.artifact) throw fail('PAGE_NOT_READY','请先打开普通 HTML 页面的预览。');
    const snapshot=await (await getFrame(pageId)).request('captureState');
    return {...snapshot,expectedArtboardRevision:doc.artboardRevision??page.revision};
  }
  async function toggleFreeze(id=active?.id){
    if(!id||freezeLock.current)return;
    freezeLock.current=true;
    try{
      if(active?.id!==id)current.current.onNavigate?.({pageId:id});
      const enabled=!frozenPages.has(id);
      if(!enabled)await flush();
      const frame=await getFrame(id);
      await frame.freeze(enabled);
      if(!mounted.current||frames.current.get(id)!==frame)return;
      setFrozenPages(previous=>{const next=new Set(previous);if(enabled)next.add(id);else next.delete(id);return next;});
      if(!enabled)setProperties(false);
    }finally{freezeLock.current=false;}
  }
  React.useEffect(()=>{props.onFrozenChange?.(frozenPages.has(active?.id));},[frozenPages,active?.id,props.onFrozenChange]);
  const captureLock=React.useRef(false);
  function screenshot(){
    if(!active||captureLock.current)return;
    setCopyNotice('');
    setScreenshotPage(previous=>previous===active.id?null:active.id);
  }
  async function copyScreenshot(region){
    if(!active||captureLock.current)return;
    setScreenshotPage(null);
    captureLock.current=true;
    props.onCaptureBusy?.(true);
    try{
      if(!navigator.clipboard?.write||!globalThis.ClipboardItem)throw fail('CLIPBOARD_PNG_UNAVAILABLE','当前环境无法将截图写入系统剪贴板。');
      const image=(async()=>{
        const frame=await getFrame(active.id);
        const snapshot=await frame.request('captureScreenshotState',{});
        const payload=await props.api('preview.screenshot',{projectId:project.id,pageId:active.id,expectedArtboardRevision:documents[active.id]?.artboardRevision??active.revision,html:snapshot.html,viewport:snapshot.viewport,scroll:snapshot.scroll,region});
        return pngClipboardBlob(payload);
      })();
      // Reserve the clipboard write during pointerup, before asynchronous rendering.
      await Promise.all([image,navigator.clipboard.write([new ClipboardItem({'image/png':image})])]);
      if(mounted.current)setCopyNotice('选区截图已复制');
    }catch(error){diagnose({code:error.code||'PREVIEW_SCREENSHOT',message:error.name==='NotAllowedError'?'无法写入系统剪贴板，请允许剪贴板权限后重试。':error.message})}
    finally{captureLock.current=false;props.onCaptureBusy?.(false)}
  }
  Object.assign(controller.current,{changePreviewZoom,screenshot,toggleFreeze,capturePageState,invalidateIdentity,flush,validate,clearSelection:()=>select(null),removeSelectionElement:id=>select(removeSelectionElement(selectionRef.current,id)),removeSelectionElements:removeSelections,undo:()=>undo('undo'),redo:()=>undo('redo'),fit,locate,reference:referenceElement,measure:measureSelection,applyOperations,setTool,zoomIn,zoomOut,resetZoom,toggleProperties,toggleOptions});
  React.useEffect(()=>{const register=props.onController;register?.(controller.current);return()=>register?.(null)},[project.id,design?.id]);
  function frameTool(pageId){
    if(hand||space)return 'pan';
    if(compactChrome&&picking&&mode==='edit')return 'pick';
    return compactChrome&&!frozenPages.has(pageId)?'interact':'select';
  }
  const navigation=useCanvasNavigation({root,cameraRef:immersive?previewCamera:cameraRef,onCamera:immersive?movePreview:cameraChange,panWheel:immersive,hand,onTool:immersive?undefined:setTool,onClear:()=>select(null).catch(()=>{}),onFit:immersive?()=>changePreviewZoom('fit'):fit,onZoom:immersive?factor=>changePreviewZoom(factor>1?'in':'out'):zoomCentered});
  const space=navigation.space;
  React.useEffect(()=>{navigation.reset()},[project.id,design?.id,mode,navigation.reset]);
  React.useEffect(()=>{setHand(false);setPicking(false);},[project.id,design?.id]);
  React.useEffect(()=>{if(mode==='preview')setPicking(false);},[mode]);
  React.useEffect(()=>{const down=event=>{if(!container.current?.contains(event.target)||event.target.closest('input,textarea,select,[contenteditable=true],.ec-dialog')||event.isComposing)return;const selection=selectionRef.current,ids=selectionIds(selection);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!current.current.readonly){event.preventDefault();undo(event.shiftKey?'redo':'undo').catch(()=>{})}if(current.current.mode!=='edit'||current.current.readonly||!ids.length)return;if(isFrameworkArtifact(documentsRef.current[selection.pageId],pagesRef.current.find(page=>page.id===selection.pageId))&&(['Delete','Backspace'].includes(event.key)||(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d')){event.preventDefault();applyOperations({pageId:selection.pageId,selection,operations:[{type:['Delete','Backspace'].includes(event.key)?'node.delete':'node.duplicate',nodeIds:ids}],summary:['Delete','Backspace'].includes(event.key)?'删除组件源码节点':'复制组件源码节点'}).catch(()=>{});return;}if(['Delete','Backspace'].includes(event.key)){event.preventDefault();applyOperations({pageId:selection.pageId,operations:[{type:'remove',nodeIds:topmostIds(ids,documentsRef.current[selection.pageId]?.nodes||{}),scope:'instance'}],summary:'删除选中对象'}).catch(()=>{})}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='d'){event.preventDefault();applyOperations({pageId:selection.pageId,operations:[{type:'duplicate',nodeIds:topmostIds(ids,documentsRef.current[selection.pageId]?.nodes||{}),scope:'instance'}],summary:'复制选中对象'}).catch(()=>{})}if(event.altKey&&event.key==='ArrowUp'){event.preventDefault();frames.current.get(selection.pageId)?.request('parent',{nodeId:ids[0]}).then(parent=>parent&&select({pageId:selection.pageId,nodeIds:parent.id?[parent.id]:[],objects:[parent],referenceOnly:!!parent.referenceOnly,...selectionMetadata([parent])})).catch(error=>diagnose({code:error.code,message:error.message}))}};addEventListener('keydown',down);return()=>{removeEventListener('keydown',down)}},[undo,applyOperations,select,diagnose]);
  const closeModal=()=>{const value=modalRef.current;setModal(null);value?.reject?.(cancelled())};
  const screenshotReference=React.useCallback(async input=>{if(input.ownerProjectId&&input.ownerProjectId!==current.current.project.id)throw cancelled();if(!current.current.api)throw fail('CAPTURE_UNAVAILABLE','当前连接没有真实截图接口。');await flush();const project=projectRef.current,page=pagesRef.current.find(page=>page.id===input.pageId),doc=documentsRef.current[input.pageId];if(!page)throw fail('PAGE_NOT_FOUND','截图页面已不存在。');if(input.sourceVersion!==undefined&&input.sourceVersion!==doc.version)throw fail('CAPTURE_VERSION_CHANGED','页面已更新，请在保存后的页面重新圈选区域。');setSnapshotBusy(true);try{const view=input.confirmedSavedSnapshot?null:await (await getFrame(page.id)).state(),scene=Object.hasOwn(input,'captureSceneId')?input.captureSceneId:view?.runtime?.scene;if(view?.runtime?.dirty&&!input.confirmedSavedSnapshot){setSnapshotBusy(false);return await new Promise((resolve,reject)=>setModal({type:'captureSaved',pageId:page.id,scene:scene||null,input:{...copy(input),ownerProjectId:project.id,captureSceneId:scene||null,confirmedSavedSnapshot:true},resolve,reject}))}if(scene&&!doc.scenes?.items?.some(item=>item.id===scene))throw fail('CAPTURE_SCENE_INVALID','当前页面已变化，请重新选择截图区域。');const result=await current.current.api('export.create',{projectId:project.id,expectedRevision:project.revision,pageId:page.id,expectedPageRevisions:{[page.id]:input.artboardRevision??doc.artboardRevision??page.revision},format:'png',viewport:input.viewport||viewportOf(page),region:input.rect,...(scene?{scene}:{}),background:true,editorMarks:false});acceptResult(result);const artifact=result.export;if(!artifact?.artifactPath||!artifact?.sha256)throw fail('CAPTURE_UNCONFIRMED','截图接口未返回可验证的真实图片文件。');const reference={type:'region',kind:'page-region',projectId:project.id,pageId:page.id,nodeIds:[],rect:input.rect,region:input.rect,viewport:input.viewport||viewportOf(page),sourceVersion:doc.artboardRevision??page.revision,artboardRevision:doc.artboardRevision??page.revision,contentHash:result.manifest?.capture?.metadata?.savedSourceHash||page.contentHash,...(scene?{scene}:{}),label:`${page.name} 已保存${scene?'场景':'页面'}区域 ${Math.round(input.rect.width)} × ${Math.round(input.rect.height)}`,screenshot:{path:artifact.artifactPath,mimeType:artifact.mimeType,sha256:artifact.sha256,exportId:artifact.id,url:artifact.downloadUrl}};if(mounted.current&&current.current.project.id===project.id)current.current.onReference?.(reference);return result}catch(error){diagnose({code:error.code||'REGION_CAPTURE',message:error.message,pageId:page.id});throw error}finally{if(mounted.current)setSnapshotBusy(false)}},[flush,acceptResult,diagnose,getFrame]);
  const resetPreview=React.useCallback(()=>{const pageId=selectionRef.current?.pageId||current.current.activePageId||pagesRef.current[0]?.id;return getFrame(pageId).then(frame=>frame.request('reset',{})).then(value=>{frames.current.get(pageId)?.measure();return value})},[getFrame]);
  const gesture=React.useCallback((kind,value)=>{if(kind==='exitPreview'){current.current.onModeChange?.('edit');return;}if(kind==='contextmenu'){if(current.current.compactChrome)flushRef.current().then(()=>setProperties(true)).catch(error=>diagnose({code:error.code,message:error.message}));else setContextMenu(value);}if(kind==='properties')flushRef.current().then(()=>setProperties(true)).catch(error=>diagnose({code:error.code,message:error.message}));if(kind==='layers'){const selected=selectionRef.current;if(isFrameworkArtifact(documentsRef.current[selected?.pageId],pagesRef.current.find(page=>page.id===selected?.pageId)))setProperties(true);else current.current.onViewState?.({navigation:'layers',locateSelection:selected});}if(kind==='reference')return referenceElement({...selectionRef.current,...value}).catch(error=>diagnose({code:error.code||'ELEMENT_REFERENCE',message:error.message}))},[emitView,diagnose,referenceElement]);
  const dropImage=async event=>{event.preventDefault();if(readonly||mode!=='edit')return;const file=event.dataTransfer.files[0];if(!file?.type.startsWith('image/'))return;try{if(isFrameworkArtifact(documentsRef.current[active?.id],active))throw fail('FRAMEWORK_SOURCE_EDIT_REQUIRED','组件页面请通过源码添加图片，将目标元素加入对话后继续。');await flush();if(!current.current.api||!active)throw fail('IMAGE_IMPORT_UNAVAILABLE','先打开目标设计页面。');if(file.size>24*1024*1024)throw fail('IMAGE_TOO_LARGE','请使用 24 MB 以内图片。');const pageId=active.id,ownerId=projectRef.current.id,bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let index=0;index<bytes.length;index+=32768)binary+=String.fromCharCode(...bytes.subarray(index,index+32768));const imported=await current.current.api('asset.import',{projectId:ownerId,designId:design?.id,name:file.name,mimeType:file.type,bytesBase64:btoa(binary)});acceptResult(imported);if(!mounted.current||projectRef.current.id!==ownerId)return;const asset=imported.file||imported.asset,doc=documentsRef.current[pageId],page=pagesRef.current.find(value=>value.id===pageId),selected=selectionRef.current?.pageId===pageId?selectionIds(selectionRef.current):[],candidate=selected[0]&&doc.nodes[selected[0]],parentId=candidate&&!['img','input','br','hr'].includes(candidate.tag)?candidate.id:candidate?.parentId||Object.values(doc.nodes).find(node=>node.tag==='body')?.id;if(!asset?.path||!parentId)throw fail('IMAGE_STORED','图片已入库，请从资源列表插入明确容器。');const src=relativePath(page.htmlPath||doc.htmlPath,asset.path);await applyOperations({pageId,operations:[{type:'insert',parentId,html:`<img src="${escapeHTML(src)}" alt="${escapeHTML(file.name)}">`,scope:'instance'}],summary:'入库并插入图片'});}catch(error){diagnose({code:error.code||'IMAGE_IMPORT',message:error.message})}};
  React.useEffect(()=>{if(!contextMenu)return;const dismiss=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&event.target.closest?.('.ec-source-menu'))return;setContextMenu(null);};document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss);};},[contextMenu]);
  const contextAction=async type=>{const value=contextMenu;setContextMenu(null);if(!value)return;try{if(type==='reference')return await referenceElement(value);return await applyOperations({pageId:value.pageId,selection:value,operations:[{type:type==='duplicate'?'duplicate':'remove',nodeIds:value.nodeIds}],summary:type==='duplicate'?'复制选中节点':'删除选中节点'});}catch(error){if(!error.canvasReported)diagnose({code:error.code||'CONTEXT_ACTION',message:error.message});}};
  const pickedImage=showProperties&&!selectedModel?.schemaSource&&selectedObjects.length===1?selectedObjects[0]:null;
  const renderedImage=pickedImage&&['img','svg'].includes(pickedImage.tag)&&
    (selectedFramework?sourceEditable(pickedImage):pickedImage.referenceOnly&&pickedImage.runtimeSelector)?pickedImage:null;
  const targetImage=renderedImage||(!selectedFramework&&pickedImage&&selectedIds.length===1?imageTarget(pickedImage,selectedModel):null);
  const uploadedImages=React.useRef(new WeakMap());
  async function replaceImage(file,options,isCurrent){
    const ownerId=project.id,pageId=selectedPage.id,designId=selectedPage.designId||design?.id;
    if(!designId||!targetImage||readonly||targetImage.locked)throw fail('IMAGE_TARGET','请选择可编辑的设计稿图片。');
    await flush();
    if(!isCurrent()||projectRef.current.id!==ownerId)throw cancelled();
    const doc=documentsRef.current[pageId],node=doc?.nodes?.[targetImage.id];
    if(!doc||!renderedImage&&(!node||node.hash!==targetImage.hash))throw fail('IMAGE_TARGET_CHANGED','图片已变化，请重新选择。');
    const basis={ownerProjectId:ownerId,pageId,expectedArtboardRevision:doc.artboardRevision??selectedPage.revision,expectedFsVersion:doc.version};
    let asset=uploadedImages.current.get(file);
    if(!asset||asset.designId!==designId||asset.projectId!==ownerId){
      const result=await uploadFile(current.current.api,file,{purpose:'asset',projectId:ownerId,designId,expectedRevision:projectRef.current.revision});
      acceptResult(result,ownerId);
      if(!result.file?.path)throw fail('IMAGE_IMPORT','图片导入未返回文件路径。');
      asset={projectId:ownerId,designId,path:result.file.path};
      uploadedImages.current.set(file,asset);
    }
    if(!isCurrent()||projectRef.current.id!==ownerId)throw cancelled();
    const url=relativePath(doc.htmlPath||selectedPage.htmlPath,asset.path);
    let change;
    if(renderedImage){
      const styles={content:'url("'+url+'")','object-fit':options.fit,'object-position':options.position.x+'% '+options.position.y+'%'};
      change=selectedFramework?{selection,operations:[{type:'style',nodeIds:selectedIds,styles}]}:
        {runtimeStyle:{referenceId:renderedImage.referenceId,selector:renderedImage.runtimeSelector,styles}};
    }else change={operations:imageOperations(doc,node,{...options,url,mime:file.type})};
    try{await applyOperations({...basis,...change,summary:'替换图片'});}
    catch(error){throw fail(error.code||'IMAGE_REPLACE',`原图已保存到 ${asset.path}，页面替换未完成：${error.message}`);}
  }
  const changeViewport=async viewport=>{if(!active)return;await flush();await applyOperations({pageId:active.id,operations:[{type:'page.viewport',viewport}],summary:'保存页面设备尺寸'})};
  return <section ref={container} data-immersive={immersive} className={'ec '+(compactChrome?'ec-compact ec-html-preview':checker?'ec-checker':'')}><style>{canvasStyles}</style>
    <ErrorBox error={error} onClose={()=>setError(null)} context="画布操作"/>
    <div ref={root} className={'ec-stage '+(!compactChrome&&grid?'ec-grid ':'')+(hand||space?'ec-hand ':'')+(navigation.dragging?'ec-panning':'')} tabIndex={0} aria-label={compactChrome?"HTML 页面预览":"设计画布"} style={compactChrome?undefined:{...cameraGrid(camera,compactChrome?48:32),...(background?{backgroundColor:background}:{})}} {...navigation.handlers} onDragOver={event=>{if(!readonly&&mode==='edit')event.preventDefault()}} onDrop={dropImage}>
      <div className="ec-world" style={{transform:immersive?`translate(${pan.x}px,${pan.y}px)`:`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`}}>{shown.map(page=><PageFrame key={page.id} immersive={immersive} hidden={immersive&&page.id!==active?.id} onCanvasWheel={frameWheel} fitPage={immersive} fitKey={previewKey} previewScale={previewZoom} centerOffset={pageCenterOffset} page={immersive?{...page,viewport:previewViewport,previewViewport:viewportOf(page)}:page} selectingScreenshot={screenshotPage===page.id} onCancelScreenshot={cancelScreenshot} onCopyScreenshot={copyScreenshot} onScreenshot={screenshot} activePageId={active?.id} frozen={frozenPages.has(page.id)} onFreezeShortcut={id=>toggleFreeze(id).catch(error=>diagnose({code:error.code,message:error.message,pageId:id}))} projectRevision={projectRef.current.revision} document={documents[page.id]} mode={mode} selection={selection} readonly={readonly||identityPending.current.has(project.id+'/'+page.id)} zoom={compactChrome?previewZoom:camera.zoom} snap={compactChrome||snap} helpers={(helpers||picking||frozenPages.has(page.id))&&mode==='edit'} interactive={compactChrome} tool={frameTool(page.id)} definitionScope={scope} onSelect={select} onMeasured={measured} onChange={applyOperations} onReference={screenshotReference} onNavigate={navigate} onDiagnostic={diagnose} onController={registerFrame} onMovePage={pageMove} onScroll={frameScroll} onGesture={gesture} onStatus={frameStatus} onLayout={frameLayout} viewState={viewRef.current.pages?.[page.id]} changedIds={changed[page.id]||[]}/>)}{guides.map((guide,index)=><div key={'edge-'+index} className="ec-guide" style={guide.axis==='x'?{left:guide.position,top:-camera.y/camera.zoom,width:1/camera.zoom,height:(root.current?.clientHeight||800)/camera.zoom}:{left:-camera.x/camera.zoom,top:guide.position,width:(root.current?.clientWidth||1200)/camera.zoom,height:1/camera.zoom}}/>)}</div>
      {!pages.length&&<div className="ec-empty">{compactChrome?<><span>暂无页面</span>{typeof onCreatePage==='function'&&<button disabled={readonly} onClick={()=>onCreatePage()}>添加页面</button>}</>:'当前设计没有页面。请从页面导航创建真实页面。'}</div>}
    </div>
    {contextMenu&&<div className="ec-source-menu" role="menu" aria-label="元素操作" style={{position:'fixed',left:Math.max(8,Math.min(contextMenu.x,innerWidth-180)),top:Math.max(8,Math.min(contextMenu.y,innerHeight-150)),zIndex:1600,display:'flex',flexDirection:'column',gap:4,padding:8,borderRadius:10,border:'1px solid var(--wb-divider)',background:'var(--wb-elevated,var(--wb-panel))',boxShadow:'var(--wb-shadow-hover)'}}><button role="menuitem" autoFocus disabled={readonly||saving} onClick={()=>contextAction('duplicate')}>复制节点</button><button role="menuitem" disabled={readonly||saving} onClick={()=>contextAction('delete')}>删除节点</button><button role="menuitem" onClick={()=>contextAction('reference')}>加入对话</button></div>}
    {!compactChrome&&<div className={'ec-tools'+(compactChrome?' ec-options-panel':'')} aria-label={compactChrome?'高级画布工具':'画布工具'}>
      {compactChrome&&<header className="ec-options-header"><strong>画布选项</strong><button aria-label="关闭画布选项" onClick={toggleOptions}>关闭</button></header>}
      <button aria-pressed={!hand} onClick={()=>setTool('select')}>选择</button><button aria-pressed={hand} onClick={()=>setTool(hand?'select':'hand')}>手型</button><button aria-pressed={single} onClick={()=>setSingle(value=>{emitView({single:!value});return !value})}>{single?'设计总览':'单页工作'}</button><button onClick={()=>fit()}>适合窗口</button><button disabled={!diffs[active?.id]} onClick={()=>setModal({type:'diff',diff:diffs[active.id]})}>查看真实变更{diffs[active?.id]?' · '+(diffs[active.id].delta.affectedNodeIds.length+diffs[active.id].delta.removedNodeIds.length):''}</button><button disabled={!selectedIds.length} onClick={()=>fit(true)}>适合选区</button><button onClick={resetZoom}>100%</button><button aria-label="缩小" onClick={zoomOut}>−</button><span>{Math.round(camera.zoom*100)}%</span><button aria-label="放大" onClick={zoomIn}>＋</button>{mode==='edit'&&<><button aria-pressed={grid} onClick={()=>setGrid(value=>{emitView({grid:!value});return !value})}>网格</button><button aria-pressed={snap} onClick={()=>setSnap(value=>{emitView({snap:!value});return !value})}>吸附</button><button aria-pressed={helpers} onClick={()=>setHelpers(value=>{emitView({helpers:!value});return !value})}>辅助标记</button></>}<button aria-pressed={checker} onClick={()=>setChecker(value=>{emitView({checker:!value});return !value})}>透明棋盘</button><label title="仅工作台背景，不修改页面"><span>背景</span><input aria-label="画布背景色" type="color" value={background||'#eceef1'} onChange={event=>{setBackground(event.target.value);emitView({background:event.target.value})}}/></label><button disabled={!active} onClick={()=>resetPreview().catch(error=>diagnose({code:error.code,message:error.message}))}>重置预览数据</button><button disabled={history.current.index<=0} onClick={()=>navigate({back:true})}>返回页面</button>{mode==='edit'&&<><button disabled={readonly||saving||!active||activeFramework} onClick={()=>undo('undo').catch(()=>{})}>撤销</button><button disabled={readonly||saving||!active||activeFramework} onClick={()=>undo('redo').catch(()=>{})}>重做</button><button disabled={!hasElementSelection} aria-pressed={showProperties} onClick={()=>toggleProperties().catch(()=>{})}>属性</button></>}
      {active&&<><select aria-label="页面设备预设" value="" disabled={readonly} onChange={event=>{if(event.target.value)changeViewport(devicePresets[event.target.value]).catch(()=>{})}}><option value="">设备尺寸…</option><option value="desktop">桌面 1440 × 900</option><option value="tablet">平板 768 × 1024</option><option value="mobile">手机 390 × 844</option></select><button disabled={readonly} onClick={()=>changeViewport({width:viewportOf(active).height,height:viewportOf(active).width}).catch(()=>{})}>横 / 竖屏</button><button onClick={()=>setModal({type:'page',pageId:active.id,width:savedViewportOf(active).width,height:savedViewportOf(active).height,name:active.name})}>页面设置…</button></>}
    </div>}
    <div className="ec-view-status"><span>{saving?'正在保存真实内容':'保存队列空闲'} · {active?.name||'空设计'} · {statuses[active?.id]?.status==='ready'?'已刷新当前保存版本':statuses[active?.id]?.status||'等待读取'}</span><span>{mode==='edit'?(activeFramework?'Shift 多选 · Ctrl/Cmd 拖框 · 双击查看源码 · Alt+Shift 拖框截图引用':'Shift 多选 · Ctrl/Cmd 拖框 · Alt 拖入容器 · Alt+Shift 拖框截图引用'):'示例输入与跳转只在预览中临时生效'}</span></div>
    {showProperties&&mode==='edit'&&selectedPage&&isDocument(selectedModel)&&<Properties imageReplacement={targetImage&&<ImageReplacement key={project.id+'/'+selectedPage.id+'/'+(targetImage.referenceId||targetImage.id)} node={targetImage} onReplace={replaceImage} disabled={readonly||saving||identityPending.current.has(project.id+'/'+selectedPage.id)}/>} side={compactChrome?'left':'right'} width={propertiesWidth} onWidthChange={width=>{setPropertiesWidth(width);emitView({propertiesWidth:width});}} key={project.id+':'+design?.id} page={selectedPage} model={selectedModel} selection={selection} objects={selectedObjects} projectRevision={projectRef.current.revision} onApply={applyOperations} onClose={()=>flush().then(()=>setProperties(false))} onController={registerProperties} readonly={readonly||identityPending.current.has(project.id+'/'+selectedPage.id)} saving={saving}/>}
    {copyNotice&&<div className="ec-saving" role="status">{copyNotice}</div>}
    {snapshotBusy&&<div className="ec-saving">正在生成并校验真实区域截图…</div>}
    {modal&&<Dialog wide={modal.type==='diff'} title={{sourceTemplate:'确认修改源码模板',impact:'明确修改影响范围',captureSaved:'截图来源为保存版本',page:'页面设置',diff:'真实保存内容变化'}[modal.type]} onClose={closeModal} busy={saving}>
      {modal.type==='sourceTemplate'&&<><p>选中元素来自重复渲染的源码模板。此次修改会写回组件源文件，并影响相同源码节点的全部实例。</p><ul className="ec-impact-list">{[...new Map(modal.objects.map(object=>[object.sourceLocator.path+':'+object.sourceNodeId,object])).values()].map(object=><li key={object.sourceNodeId}>{object.sourceLocator.path}:{object.sourceLocator.line} · 当前 {object.sourceInstanceCount||1} 个实例</li>)}</ul><footer><button onClick={closeModal}>取消，保持源码不变</button><button onClick={()=>{const value=modal;setModal(null);value.resolve(true);}}>确认修改此源码模板的全部实例</button></footer></>}
      {modal.type==='diff'&&<><p>「{modal.diff.after.pageName}」保存版本 {modal.diff.before.pageRevision} → {modal.diff.after.pageRevision}。左侧为此前保存内容，右侧为此次保存内容；此对比不会修改文件或移动画布视角。</p>{(modal.diff.before.canonical||modal.diff.after.canonical)&&<p className="ec-muted">当前连接缺少原始保存正文，已明确使用规范化 HTML 对比。</p>}<p className="ec-muted">新增 {modal.diff.delta.insertedNodeIds.length}、移除 {modal.diff.delta.removedNodeIds.length}；定位到 {modal.diff.delta.affectedNodeIds.length} 个现有或新增对象。文件版本：{String(modal.diff.before.version)} → {String(modal.diff.after.version)}</p><DiffPanel before={modal.diff.before.html} after={modal.diff.after.html}/><footer><button onClick={closeModal}>关闭对比</button></footer></>}
      {modal.type==='impact'&&<><p>{modal.readonly?'只读影响预览，不会修改内容。':'确认后保存以下已冻结操作；其他设计与页面不会被自动纳入。'}</p><p>当前页：{pages.find(page=>page.id===modal.preview.pageId)?.name||modal.preview.pageId} · Host 计算影响 {modal.preview.affectedCount} 个对象。</p><p className="ec-muted">定义：{modal.preview.definitions?.join('、')||'当前明确对象'} · 项目版本 {modal.preview.projectRevision}</p><ul className="ec-impact-list">{(modal.preview.affectedNodeIds||[]).map(id=><li key={id}>{documents[modal.preview.pageId]?.nodes?.[id]?.attributes?.id||id}</li>)}</ul><footer><button onClick={closeModal}>{modal.readonly?'关闭':'取消'}</button>{!modal.readonly&&<button disabled={saving} onClick={async()=>{const value=modal;setModal(null);try{const result=await commit(value.input);value.resolve(result)}catch(error){value.reject(error)}}}>确认修改这些对象</button>}</footer></>}
      {modal.type==='captureSaved'&&<><p>当前预览有临时输入或交互状态。此截图来自「{pages.find(page=>page.id===modal.pageId)?.name}」的已保存{modal.scene?'场景 '+modal.scene:'页面'}。临时更改不会出现在截图中。</p><footer><button onClick={closeModal}>取消</button><button onClick={async()=>{const value=modal;setModal(null);try{value.resolve(await screenshotReference(value.input))}catch(error){value.reject(error)}}}>明确继续保存版本截图</button></footer></>}
      {modal.type==='page'&&<><p>画板名称、设备视口与总览位置属于页面设置；内部元素仍按正常文档流排版。</p><label>页面名<input value={modal.name} disabled={readonly} onChange={event=>setModal(value=>({...value,name:event.target.value}))}/></label><div className="ec-property-grid"><label>宽度<input type="number" min="100" max="16000" value={modal.width} disabled={readonly} onChange={event=>setModal(value=>({...value,width:event.target.value}))}/></label><label>高度<input type="number" min="100" max="16000" value={modal.height} disabled={readonly} onChange={event=>setModal(value=>({...value,height:event.target.value}))}/></label></div><footer><button onClick={closeModal}>取消</button><button disabled={readonly||saving} onClick={async()=>{const width=Number(modal.width),height=Number(modal.height);try{if(![width,height].every(value=>Number.isInteger(value)&&value>=100&&value<=16000))throw fail('VIEWPORT_INVALID','页面宽高需要在 100–16000 之间。');await flush();const page=pagesRef.current.find(page=>page.id===modal.pageId);if(modal.name.trim()!==page.name){const result=await current.current.api('page.update',{projectId:projectRef.current.id,pageId:page.id,name:modal.name.trim(),expectedRevision:projectRef.current.revision});acceptResult(result)}await applyOperations({pageId:page.id,operations:[{type:'page.viewport',viewport:{width,height}}],summary:'保存页面视口尺寸'});setModal(null)}catch(error){diagnose({code:error.code||'PAGE_SETTINGS',message:error.message})}}}>保存页面设置</button></footer></>}
    </Dialog>}
  </section>;
}
