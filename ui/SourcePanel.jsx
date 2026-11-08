import React from "react";
import { Button, ErrorBox, FieldError, errorValue } from "./common.jsx";
import {readFrozenSource} from './source-preview.js';
import { uploadFile } from "./upload.js";
import {requireSavedSourceResult} from './source-result.js';
import SourceOutline from './SourceOutline.jsx';
import {selectedWebsiteNodes,websiteSelectionArgs,providerSelectionArgs,mergeSourceOutline,sourceRefreshArgs} from './source-selection.js';
import {sourceStateLabel,selectSourceRecord,hydrateSourceForm,sourceViewTransition,sourceResponseCurrent,sourceFormAfterResponse,pinnedSourceBinding,websitePlanInput,websiteDraftKey,websitePreviewReady} from './source-state.js';
const imageURL = (p) => typeof p === "string" ? p : p?.url || p?.previewUrl || p?.screenshotUrl || p?.imageUrl || p?.screenshot;
function SourcePanel({ api, project, design, provider = "website", legacy = {}, t, mutate, onReference, selection: canvasSelection, onViewState, viewState = {}, initialSourceId, referenceToLocate }) {
  const existing = project.workbench?.sourceImports || [];
  const initialRecord=React.useRef(selectSourceRecord(existing,initialSourceId||viewState.sourceId)).current;
  const resumeDraft=!initialSourceId||initialSourceId===viewState.sourceId;
  const initialForm=React.useRef({...hydrateSourceForm(initialRecord,viewState.source||provider),...(resumeDraft?Object.fromEntries(['url','name','faithful','width','height','pagesText','statesText','regionsText','captureScope','viewportsText'].filter(key=>viewState[key]!==undefined).map(key=>[key,viewState[key]])):{})}).current;
  const [nodeSelection,setNodeSelection]=React.useState(initialRecord?.kind==='website'?selectedWebsiteNodes(initialRecord):(initialRecord?.pages||[]).map(page=>page.sourceNodeId).filter(Boolean)),[selectionMode,setSelectionMode]=React.useState(viewState.selectionMode||'pages'),[discovery,setDiscovery]=React.useState(null);
  const [reviewKind,setReviewKind]=React.useState('visual'),[reviewOutcome,setReviewOutcome]=React.useState('passed'),[reviewNote,setReviewNote]=React.useState(''),[reviewPages,setReviewPages]=React.useState([]);
  const recordRef=React.useRef(initialRecord),sourceView=React.useRef({sourceId:initialRecord?.id||initialSourceId||viewState.sourceId||null,sequence:0}),requestSerial=React.useRef(0),revisionRef=React.useRef(project.revision);
  const [source, setSource] = React.useState(initialForm.source), [url, setURL] = React.useState(initialForm.url), [name, setName] = React.useState(initialForm.name), [selected, setSelected] = React.useState(initialForm.selected), [record, setRecord] = React.useState(initialRecord), [version, setVersion] = React.useState(null), [outline, setOutline] = React.useState([]), [comparison, setComparison] = React.useState(null), [result, setResult] = React.useState(null), [error, setError] = React.useState(null), [busy, setBusy] = React.useState(false), [importOpen, setImportOpen] = React.useState(false), [compareMode, setCompareMode] = React.useState(viewState.compareMode || "side"), [opacity, setOpacity] = React.useState(viewState.opacity ?? 0.5), [zoom, setZoom] = React.useState(viewState.zoom || 1), [sync, setSync] = React.useState(true), [region, setRegion] = React.useState(null), [faithful, setFaithful] = React.useState(initialForm.faithful), [width, setWidth] = React.useState(initialRecord?initialForm.width:viewState.width||1440), [height, setHeight] = React.useState(initialRecord?initialForm.height:viewState.height||900), [refresh, setRefresh] = React.useState(null), [targetPageId, setTargetPageId] = React.useState(viewState.targetPageId ?? design?.pageIds?.[0] ?? ""), [pagesText, setPagesText] = React.useState(initialForm.pagesText), [statesText, setStatesText] = React.useState(initialForm.statesText), [regionsText, setRegionsText] = React.useState(initialForm.regionsText), [captureScope, setCaptureScope] = React.useState(initialForm.captureScope), [viewportsText, setViewportsText] = React.useState(initialForm.viewportsText), [path, setPath] = React.useState(initialRecord?initialForm.path:viewState.path||""), [captureId, setCaptureId] = React.useState(viewState.captureId || ""), [regionSelect, setRegionSelect] = React.useState(false), [versionId, setVersionId] = React.useState((!initialSourceId||initialSourceId===viewState.sourceId?viewState.versionId:undefined)||initialForm.versionId), [revision, setRevision] = React.useState(project.revision);
  const panels = React.useRef([]), frames = React.useRef([]), drag = React.useRef(null), scrollLock = React.useRef(false), savedScroll = React.useRef(viewState.scroll || [{ top: 0, left: 0 }, { top: 0, left: 0 }]), token = React.useRef("compare-" + crypto.randomUUID());
  const [websitePreview,setWebsitePreview]=React.useState(null),[previewSeen,setPreviewSeen]=React.useState(false),[websitePhase,setWebsitePhase]=React.useState('idle'),[websiteFieldError,setWebsiteFieldError]=React.useState(null),[binding,setBinding]=React.useState(null),[bindingLoading,setBindingLoading]=React.useState(false),[bindingProblem,setBindingProblem]=React.useState(false),[connection,setConnection]=React.useState(null);
  const fidelityChosen=React.useRef(!!initialRecord||typeof viewState.faithful==='boolean');
  const websiteRun=React.useRef(null),previewRef=React.useRef(null),bindingEpoch=React.useRef(0),mounted=React.useRef(true),ownerRef=React.useRef('');ownerRef.current=project.id+':'+(design?.id||'');previewRef.current=websitePreview;
  const websiteBusy=['planning','capturing','reading'].includes(websitePhase),websiteForm={url,name,width,height,pagesText,statesText,regionsText,viewportsText,captureScope,faithful},draftKey=websiteDraftKey(websiteForm,binding);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;websiteRun.current=null;bindingEpoch.current++;};},[]);
  const loadBinding=async()=>{const epoch=++bindingEpoch.current,owner=ownerRef.current;setBindingLoading(true);setBindingProblem(false);try{const response=await api('binding.resolve',{projectId:project.id,designId:design?.id});if(mounted.current&&epoch===bindingEpoch.current&&owner===ownerRef.current){const pin=pinnedSourceBinding(response);setBinding(pin);if(!fidelityChosen.current)setFaithful(!pin);}}catch{if(mounted.current&&epoch===bindingEpoch.current&&owner===ownerRef.current){setBinding(null);setBindingProblem(true);}}finally{if(mounted.current&&epoch===bindingEpoch.current&&owner===ownerRef.current)setBindingLoading(false);}};
  React.useEffect(()=>{if(source==='website')loadBinding();},[project.id,design?.id,project.revision,source]);
  React.useEffect(()=>{revisionRef.current=Math.max(revisionRef.current,project.revision);setRevision(revisionRef.current);},[project.revision]);
  const applyForm=form=>{setSource(form.source);setURL(form.url);setName(form.name);setSelected(form.selected);setFaithful(form.faithful);setWidth(form.width);setHeight(form.height);setPagesText(form.pagesText);setStatesText(form.statesText);setRegionsText(form.regionsText);setCaptureScope(form.captureScope);setViewportsText(form.viewportsText);setPath(form.path);};
  const chooseSource=(next,{force=false,versionId:chosenVersion}={})=>{
    const id=next?.id||null,previousId=recordRef.current?.id||null,changed=previousId!==id;
    if(force){websiteRun.current=null;setWebsitePhase('idle');setWebsitePreview(null);setPreviewSeen(false);setWebsiteFieldError(null);}
    if(force||sourceView.current.sourceId!==id){sourceView.current=sourceViewTransition(sourceView.current,id);requestSerial.current++;setBusy(false);}
    if(changed||force){if(changed){setNodeSelection(next?.kind==='website'?selectedWebsiteNodes(next):(next?.pages||[]).map(page=>page.sourceNodeId).filter(Boolean));setSelectionMode('pages');setDiscovery(null);setReviewNote('');setReviewPages([]);}if(changed)applyForm(sourceFormAfterResponse(previousId,next,{},provider));setVersion(null);setVersionId(chosenVersion??next?.latestVersionId??'');setCaptureId('');setOutline([]);setComparison(null);setResult(null);setError(null);setRegion(null);setRefresh(null);savedScroll.current=[{top:0,left:0},{top:0,left:0}];}
    recordRef.current=next;setRecord(next);
  };
  React.useEffect(() => {
    onViewState?.({ compareMode, opacity, zoom, selectionMode, sourceId: record?.id, source, url, name, faithful, pagesText, statesText, regionsText, captureScope, viewportsText, versionId, captureId, targetPageId, width, height, path, comparisonOpen: !!comparison });
  }, [compareMode, opacity, zoom, selectionMode, record?.id, source, url, name, faithful, pagesText, statesText, regionsText, captureScope, viewportsText, versionId, captureId, targetPageId, width, height, path, !!comparison]);
  const focusSource=(id,options={})=>{const found=selectSourceRecord(existing,id)||(recordRef.current?.id===id?recordRef.current:null);if(found)chooseSource(found,{force:true,...options});else{chooseSource(null,{force:true,...options});sourceView.current=sourceViewTransition(sourceView.current,id);requestSerial.current++;}};
  const work = async (action,args={})=>{
    if(action!=='plan'&&args.sourceId&&args.sourceId!==sourceView.current.sourceId)return null;
    const ticket={...sourceView.current,requestId:++requestSerial.current},owner=ownerRef.current;
    setBusy(true);setError(null);
    try {
      const r=await api('workbench.source.'+action,{projectId:project.id,designId:design?.id,expectedRevision:revisionRef.current,...args});
      if(!mounted.current||owner!==ownerRef.current)return null;
      revisionRef.current=Math.max(revisionRef.current,r.projectRevision||r.project?.revision||0);setRevision(revisionRef.current);
      let metadataWarning=null;
      if(['generate','rebuild','applyRefresh','review'].includes(action)&&mutate)await mutate('workspace.open',{},true);
      else if(['plan','select','capture','import','refreshPreview'].includes(action)){try{await api('workspace.open',{projectId:project.id});}catch(error){metadataWarning=errorValue('来源操作已保存，库元数据刷新失败：'+error.message,'SOURCE_METADATA_REFRESH_FAILED');}}
      if(!mounted.current||owner!==ownerRef.current||!sourceResponseCurrent(ticket,sourceView.current,requestSerial.current,r.source?.id,{createsSource:action==='plan'}))return null;
      if(r.source)chooseSource(r.source);
      if(r.version){setVersion(r.version);setVersionId(r.version.id);setCaptureId(current=>r.captureId||(r.version.captures?.some(c=>c.id===current)?current:r.version.captures?.[0]?.id||''));}
      if(r.outline)setOutline(previous=>mergeSourceOutline(previous,r.outline));
      if(action==='discover'){setDiscovery(r);if(r.status==='available')setOutline(previous=>mergeSourceOutline(previous,[{captureId:'discovery:'+ticket.sourceId,kind:'discovery',name:'官方文件提纲',nodes:r.nodes||[],nodeOffset:r.nodeOffset||0,nodeTotal:r.nodeTotal,nextNodeOffset:r.nextNodeOffset}]));}
      setResult(r);if(r.error||metadataWarning)setError(r.error||metadataWarning);
      return r;
    } catch(error){if(mounted.current&&owner===ownerRef.current&&sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setError(error);return null;}
    finally {if(mounted.current&&owner===ownerRef.current&&sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setBusy(false);}
  };
  React.useEffect(()=>{if(initialSourceId&&!referenceToLocate&&recordRef.current?.id!==initialSourceId){focusSource(initialSourceId);work('read',{sourceId:initialSourceId});}},[initialSourceId]);
  const sourceId = record?.id || record?.sourceId, frozenVersion = versionId || record?.latestVersionId;
  const nodeItems = outline.flatMap((o) => (o.nodes || []).map((n) => ({ ...n, captureId: o.captureId, pageId: o.pageId }))), pageItems = record?.pages || [];
  const read = async (id) => {
    const r = await work("read", { sourceId: id || sourceId, versionId: frozenVersion || void 0 });

    return r;
  };
  const startPlan = async () => {
    const viewAtStart={...sourceView.current};
    try {
      const urls = pagesText.split("\n").map((s) => s.trim()).filter(Boolean);
      const states = statesText.trim() ? JSON.parse(statesText) : void 0;
      const regions = regionsText.trim() ? JSON.parse(regionsText) : void 0;
      const pageURLs = urls.length ? urls : url ? [url] : [];
      const pages = pageURLs.length ? pageURLs.map((u, i) => ({ name: name || "\u9875\u9762 " + (i + 1), url: u, states, regions, scope: captureScope })) : void 0;
      const viewports = viewportsText.trim() ? JSON.parse(viewportsText) : [{ id: "custom", width: Number(width), height: Number(height) }];
      const effective = !faithful ? pinnedSourceBinding(await api("binding.resolve", { projectId: project.id, designId: design?.id })) : null;
      if(viewAtStart.sequence!==sourceView.current.sequence||viewAtStart.sourceId!==sourceView.current.sourceId)return;
      if (!faithful && !effective?.systemId) throw errorValue("\u6309\u4F53\u7CFB\u6539\u7248\u9700\u8981\u5148\u7ED1\u5B9A\u56FA\u5B9A\u7248\u672C\u7684\u8BBE\u8BA1\u4F53\u7CFB", "SYSTEM_REQUIRED");
      const r = await work("plan", { systemId: effective?.systemId, systemVersion: effective?.version, kind: source === "export" ? "files" : source, name: name || "\u8BBE\u8BA1\u6765\u6E90", url: source === "export" ? void 0 : url || void 0, pages, viewports, mode: faithful ? "faithful" : "system-adaptation" });
      if (r) {
        setVersion(null);
        setVersionId("");
        setOutline([]);
        setSelected(r.source?.pages?.map((p) => p.id) || []);
      }
    } catch (e) {
      setError(e);
    }
  };
  const saveSelection=async()=>{
    try{
      const args=record?.kind==='website'?websiteSelectionArgs(record,selected,nodeSelection):providerSelectionArgs(record,selectionMode,selected,nodeSelection,nodeItems);
      await work('select',{sourceId,...args,viewports:record?.viewports||[{id:'custom',width:Number(width),height:Number(height)}]});
    }catch(error){setError(error);}
  };
  const loadMoreOutline=group=>group.kind==='discovery'?work('discover',{sourceId,offset:group.nextNodeOffset,limit:200}):work('read',{sourceId,versionId:frozenVersion,outlineCaptureId:group.captureId,outlineOffset:group.nextNodeOffset,outlineLimit:200});
  const previewRefresh=async fresh=>{
    try{
      const args=sourceRefreshArgs({sourceId,targetPageId,version,captureId,nodeIds:canvasSelection?.pageId===targetPageId?canvasSelection.nodeIds:[],fresh});
      setRefresh(null);
      const response=await work('refreshPreview',{...args,...(fresh&&path?{path}:{})});
      if(response?.error||response?.status==='connection-required'){setError(response.error||errorValue('重新读取来源失败，请检查连接或导出资料路径。','SOURCE_REFRESH_FAILED'));return;}
      if(response&&(response.proposalId||response.id)){setRefresh(response);const visual=await work('compare',{sourceId,versionId:response.sourceVersion||response.version?.id||version.id,captureId:response.captureId||captureId,pageId:targetPageId});if(visual)setComparison(visual);}
    }catch(error){setError(error);}
  };
  const capture = async () => {
    const r = await work((record?.kind||source) === "website" ? "capture" : "import", { sourceId, ...path ? { path } : {}, allowPartial: false });
    if (r?.version) {
      await work("read", { sourceId, versionId: r.version.id });
    }
  };
  const previewWebsite=async()=>{
    if(websiteRun.current||busy)return;const token={},owner=ownerRef.current,snapshot={...websiteForm};websiteRun.current=token;const current=()=>mounted.current&&websiteRun.current===token&&owner===ownerRef.current;
    setWebsitePhase('planning');setWebsitePreview(null);setPreviewSeen(false);setWebsiteFieldError(null);setError(null);
    try{
      let pin=null;if(!snapshot.faithful||!fidelityChosen.current){bindingEpoch.current++;setBindingLoading(false);pin=pinnedSourceBinding(await api('binding.resolve',{projectId:project.id,designId:design?.id}));if(!current())return;setBinding(pin);if(!fidelityChosen.current){snapshot.faithful=!pin;setFaithful(snapshot.faithful);}}
      const input=websitePlanInput(snapshot,pin),key=websiteDraftKey(snapshot,pin),planned=await work('plan',input);if(!current()||!planned)return;
      if(!planned.source?.id)throw errorValue('采集计划没有返回来源标识，请重试。','SOURCE_PLAN_INVALID');
      applyForm({...snapshot,source:'website',selected:planned.source.pages?.map(page=>page.sourceNodeId||page.id)||[],path});
      setWebsitePhase('capturing');const captured=await work('capture',{sourceId:planned.source.id,allowPartial:false});if(!current()||!captured)return;requireSavedSourceResult(captured);
      setWebsitePhase('reading');const frozen=await work('read',{sourceId:planned.source.id,versionId:captured.version.id});if(!current()||!frozen)return;
      const selectedCapture=frozen.version?.captures?.[0]||captured.version.captures?.[0];if(!selectedCapture?.id)throw errorValue('浏览器没有保存可预览的冻结快照，请检查连接后重试。','SOURCE_PREVIEW_MISSING');
      const loaded=await readFrozenSource(args=>current()?work('read',args):Promise.resolve(null),{sourceId:planned.source.id,versionId:captured.version.id,captureId:selectedCapture.id,preview:selectedCapture.preview,origin:location.origin,assetBase:frozen.assetBase});if(!current()||!loaded)return;
      setCaptureId(selectedCapture.id);setWebsitePreview({...loaded,draftKey:key,pin,url:input.url,createdAt:frozen.version?.createdAt});setWebsitePhase('ready');
    }catch(error){if(current()){if(error.code==='SOURCE_FIELD_INVALID')setWebsiteFieldError(error);else setError(error);setWebsitePhase('idle');}}
    finally{if(current()){websiteRun.current=null;setWebsitePhase(value=>['planning','capturing','reading'].includes(value)?'idle':value);}}
  };
  const previewFrozenHTML=async()=>{const prior=websitePreview;if(!prior||websiteRun.current||busy)return;const token={},owner=ownerRef.current;websiteRun.current=token;const current=()=>mounted.current&&websiteRun.current===token&&owner===ownerRef.current&&previewRef.current===prior;setWebsitePhase('reading');setPreviewSeen(false);try{const loaded=await readFrozenSource(args=>current()?work('read',args):Promise.resolve(null),{...prior,origin:location.origin,preferHTML:true});if(current()&&loaded){setWebsitePreview({...prior,...loaded});setWebsitePhase('ready');}}catch(error){if(current()){setError(error);setWebsitePhase('preview-error');}}finally{if(websiteRun.current===token){websiteRun.current=null;setWebsitePhase(value=>value==='reading'?'preview-error':value);}}};
  const replicateWebsite=async()=>{if(!websitePreviewReady(websitePreview,{draftKey,sourceId,versionId:frozenVersion,captureId,seen:previewSeen,designId:design?.id})){setError(errorValue('请先预览当前地址与选项对应的冻结网页，再开始复刻。','SOURCE_PREVIEW_REQUIRED'));return;}await work('generate',{sourceId:websitePreview.sourceId,versionId:websitePreview.versionId,captureIds:[websitePreview.captureId],target:{projectId:project.id,designId:design.id,scope:'design'}});};
  const inspectConnection=async()=>{setError(null);try{const response=await api('connection.status',{});const items=Array.isArray(response)?response:response.connections||[];setConnection(items.find(item=>item.provider===source)||{provider:source,configured:false});}catch(error){setError(error);}};
  const generate = async (rebuild = false) => {
    if (!frozenVersion) {
      setError(errorValue("\u5148\u91C7\u96C6\u6765\u6E90\u5E76\u9009\u62E9\u51BB\u7ED3\u7248\u672C", "SOURCE_VERSION_REQUIRED"));
      return;
    }
    const target = rebuild ? { projectId: project.id, designId: design?.id, pageId: canvasSelection?.pageId || targetPageId, nodeIds: canvasSelection?.nodeIds, scope: "selection" } : { projectId: project.id, designId: design?.id, pageId: targetPageId || void 0, scope: targetPageId ? "page" : "design" };
    if (rebuild && !target.nodeIds?.length) {
      setError(errorValue("\u8BF7\u5148\u5728\u8BBE\u8BA1\u753B\u5E03\u9009\u62E9\u9700\u8981\u91CD\u505A\u7684\u771F\u5B9E\u5143\u7D20\uFF1B\u5708\u9009\u5FEB\u7167\u53EA\u63D0\u4F9B\u89C6\u89C9\u53C2\u8003", "TARGET_REQUIRED"));
      return;
    }
    await work(rebuild ? "rebuild" : "generate", { sourceId, versionId: frozenVersion, target, captureIds: captureId ? [captureId] : void 0, prompt: rebuild && region ? `\u4EC5\u91CD\u505A\u5DF2\u9009\u76EE\u6807\uFF0C\u53C2\u8003\u539F\u56FE\u533A\u57DF ${JSON.stringify(region)}\u3002\u4FDD\u7559\u76EE\u6807\u4E4B\u5916\u7684\u9875\u9762\u548C\u7528\u6237\u4FEE\u6539\u3002` : void 0 });
  };
  const compare = async () => {
    const r = await work("compare", { sourceId, versionId: frozenVersion,captureId:captureId||undefined, pageId: targetPageId || void 0 });
    if (r) setComparison(r);
  };
  const referenceRegion = async () => {
    if (!region) return;
    const ticket={...sourceView.current,requestId:++requestSerial.current};
    setBusy(true);
    setError(null);
    try {
      const sourceView = comparison?.views?.source?.find((s) => s.captureId === captureId) || comparison?.views?.source?.[0];
      let screenshot;
      if (targetPageId) {
        const page = project.artboards?.find((p) => p.id === targetPageId);
        const exported = await api("export.create", { projectId: project.id, expectedRevision: revision, pageId: targetPageId, expectedPageRevisions: { [targetPageId]: page?.revision }, format: "png", region, background: true, editorMarks: false });
        revisionRef.current=Math.max(revisionRef.current,exported.projectRevision||exported.project?.revision||0);setRevision(revisionRef.current);
        screenshot = { scope: "region", region, pageId: targetPageId, exportId: exported.export.id, path: exported.export.artifactPath, mimeType: exported.export.mimeType, sha256: exported.export.sha256, url: exported.export.downloadUrl };
      }
      onReference({ type: "source-region", projectId: project.id, sourceId, sourceVersion: frozenVersion, captureId: captureId || sourceView?.captureId || version?.captures?.[0]?.id, designId: design?.id, pageId: targetPageId || void 0, sourcePageId: version?.captures?.find((c) => c.id === (captureId || sourceView?.captureId))?.pageId, region, label: screenshot ? "\u6765\u6E90\u5DEE\u5F02\u533A\u57DF \xB7 \u5DF2\u4FDD\u5B58\u76EE\u6807\u622A\u56FE" : "\u6765\u6E90\u5DEE\u5F02\u533A\u57DF \xB7 \u539F\u56FE\u4E0E\u5750\u6807", readonly: true, sourceSnapshot: sourceView?.preview ? { ...sourceView.preview, scope: sourceView.preview.scope || "viewport" } : void 0, screenshot });
    }catch(error){if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setError(error);}
    finally{if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setBusy(false);}
  };
  React.useEffect(() => {
    if (!viewState.comparisonOpen || !record?.id || referenceToLocate) return;
    (async () => {
      const loaded=await work("read", { sourceId: record.id, versionId: viewState.versionId || record.latestVersionId });if(!loaded)return;
      const compared = await work("compare", { sourceId: record.id, versionId: viewState.versionId || record.latestVersionId, pageId: viewState.targetPageId || void 0 });
      if (compared) setComparison(compared);
    })();
  }, [project.id]);
  React.useEffect(() => {
    if (!comparison) return;
    panels.current.forEach((panel, index) => {
      if (panel) {
        panel.scrollTop = savedScroll.current[index]?.top || 0;
        panel.scrollLeft = savedScroll.current[index]?.left || 0;
      }
    });
  }, [comparison]);
  React.useEffect(() => {
    if (!referenceToLocate) return;
    focusSource(referenceToLocate.sourceId,{versionId:referenceToLocate.sourceVersion});
    setRegion(referenceToLocate.region || referenceToLocate.rect || null);
    setVersionId(referenceToLocate.sourceVersion || "");
    setCaptureId(referenceToLocate.captureId || "");
    work("read", { sourceId: referenceToLocate.sourceId, versionId: referenceToLocate.sourceVersion, captureId: referenceToLocate.captureId }).then((r) => {
      if (r?.capture) {
        setComparison({ views: { source: [{ captureId: r.capture.id, preview: r.capture.preview }], result: null } });
      }
    });
  }, [referenceToLocate]);
  const syncPosition = (index, top, left) => {
    savedScroll.current[index] = { top, left };
    if (sync) savedScroll.current[1 - index] = { top, left };
    onViewState?.({ scroll: savedScroll.current.map((v) => ({ ...v })) });
    if (!sync || scrollLock.current) return;
    scrollLock.current = true;
    const other = panels.current[1 - index];
    if (other) {
      other.scrollTop = top;
      other.scrollLeft = left;
    }
    frames.current[1 - index]?.contentWindow?.postMessage({ wbCompare: token.current, type: "scrollTo", top: top / zoom, left: left / zoom }, "*");
    queueMicrotask(() => scrollLock.current = false);
  };
  React.useEffect(() => {
    const receive = (e) => {
      if (e.data?.wbCompare !== token.current || e.data?.type !== "scroll") return;
      const index = frames.current.findIndex((f) => f?.contentWindow === e.source);
      if (index < 0 || ![e.data.top, e.data.left].every(Number.isFinite)) return;
      syncPosition(index, e.data.top * zoom, e.data.left * zoom);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sync, zoom]);
  const bridgedHTML = (html, assetBase) => {
    const parsed = new DOMParser().parseFromString(html || "", "text/html");
    parsed.querySelectorAll("base").forEach((node) => node.remove());
    parsed.querySelectorAll("meta[http-equiv]").forEach((node) => {
      if (["content-security-policy", "refresh"].includes(node.getAttribute("http-equiv").trim().toLowerCase())) node.remove();
    });
    let base = "";
    try {
      if (assetBase) {
        const resolved = new URL(assetBase, location.origin);
        if (resolved.origin === location.origin) base = '<base href="' + resolved.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">';
      }
    } catch {
    }
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https: http:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri ${location.origin};">${base}<script>(()=>{const token=${JSON.stringify(token.current)};let silent=false;addEventListener('scroll',()=>{if(!silent)parent.postMessage({wbCompare:token,type:'scroll',top:scrollY,left:scrollX},'*')});addEventListener('message',e=>{if(e.source!==parent||e.data?.wbCompare!==token||e.data?.type!=='scrollTo')return;silent=true;scrollTo(e.data.left,e.data.top);requestAnimationFrame(()=>silent=false)});})();<\/script>${parsed.documentElement.outerHTML}`;
  };
  const renderPreview = (side, index) => {
    const preview = side?.preview || side, screenshot = imageURL(preview), html = side?.html || preview?.html, sourceCapture = version?.captures?.find((c) => c.id === side?.captureId), sourceViewport = record?.viewports?.find((v) => v.id === sourceCapture?.viewportId), previewWidth = side?.width || preview?.width || sourceViewport?.width || Number(width);
    return <div ref={(el) => panels.current[index] = el} className={"wb-compare-panel " + (compareMode === "overlay" && index === 1 ? "wb-compare-overlay" : "")} style={compareMode === "overlay" && index === 1 ? { opacity } : void 0} onScroll={(e) => syncPosition(index, e.currentTarget.scrollTop, e.currentTarget.scrollLeft)} onPointerDown={(e) => {
      if (!regionSelect || e.button !== 0 || index !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      drag.current = { x: e.clientX - rect.left + e.currentTarget.scrollLeft, y: e.clientY - rect.top + e.currentTarget.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={(e) => {
      if (!drag.current) return;
      const rect = e.currentTarget.getBoundingClientRect(), x = e.clientX - rect.left + e.currentTarget.scrollLeft, y = e.clientY - rect.top + e.currentTarget.scrollTop;
      setRegion({ x: Math.min(x, drag.current.x) / zoom, y: Math.min(y, drag.current.y) / zoom, width: Math.abs(x - drag.current.x) / zoom, height: Math.abs(y - drag.current.y) / zoom });
    }} onPointerUp={() => drag.current = null} onPointerCancel={() => drag.current = null}>{side?.htmlTruncated&&<span className="wb-message" style={{position:'absolute',top:6,left:6,zIndex:2,pointerEvents:'none'}}>来源资料较大，请选择更小范围预览。</span>}{screenshot ? <img src={screenshot} alt={index ? "\u751F\u6210\u7ED3\u679C" : "\u6765\u6E90\u539F\u59CB\u5FEB\u7167"} onLoad={() => {
      const panel = panels.current[index];
      if (panel) {
        panel.scrollTop = savedScroll.current[index]?.top || 0;
        panel.scrollLeft = savedScroll.current[index]?.left || 0;
      }
    }} style={{ width: previewWidth * zoom, pointerEvents: regionSelect ? "none" : void 0 }} /> : html ? <div style={{ width: previewWidth * zoom, height: Math.max(500, Number(height)) * zoom }}><iframe ref={(el) => frames.current[index] = el} title={index ? "\u751F\u6210\u7ED3\u679C" : "\u6765\u6E90\u9884\u89C8"} srcDoc={bridgedHTML(html, side?.assetBase || preview?.assetBase)} onLoad={(e) => e.currentTarget.contentWindow?.postMessage({ wbCompare: token.current, type: "scrollTo", top: (savedScroll.current[index]?.top || 0) / zoom, left: (savedScroll.current[index]?.left || 0) / zoom }, "*")} sandbox="allow-scripts" style={{ width: previewWidth, height: Math.max(500, Number(height)), transform: `scale(${zoom})`, transformOrigin: "top left", pointerEvents: regionSelect ? "none" : void 0 }} /></div> : <p className="wb-muted" style={{ padding: 25 }}>尚未取得{index ? "\u751F\u6210\u7ED3\u679C" : "\u6765\u6E90"}预览。资料获取、生成和核对分别记录。</p>}{region && index === 0 && <div className="wb-region" style={{ left: region.x * zoom, top: region.y * zoom, width: region.width * zoom, height: region.height * zoom }} />}</div>;
  };
  const importDispatch = React.useRef(null);
  importDispatch.current=async(action,args={})=>{
    if(action!=='browser.capture'&&action!=='source.import')return api(action,{...args,projectId:args.projectId||project.id,designId:design?.id,target:{projectId:project.id,designId:design?.id,scope:'design'}});
    let currentSource=recordRef.current,currentRevision=revisionRef.current;
    if(action==='browser.capture'&&(!currentSource?.id||currentSource.kind!=='website'))throw errorValue('先创建网站采集计划，再捕获浏览器状态','SOURCE_PLAN_REQUIRED');
    let ticket={...sourceView.current,requestId:++requestSerial.current};setBusy(true);
    const advance=result=>{currentRevision=result.projectRevision||result.project?.revision||currentRevision;revisionRef.current=Math.max(revisionRef.current,currentRevision);setRevision(revisionRef.current);};
    try {
      if(action==='source.import'){
        if(!currentSource?.id||currentSource.kind!==args.provider){
          const created=await api('workbench.source.plan',{projectId:project.id,expectedRevision:currentRevision,kind:args.provider,name:args.name||name||'平台设计来源',url:args.url||url,viewports:[{id:'custom',width:Number(width),height:Number(height)}],mode:'faithful'});advance(created);currentSource=created.source;
          if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current,currentSource.id,{createsSource:true})){chooseSource(currentSource);ticket={...sourceView.current,requestId:++requestSerial.current};setBusy(true);}
        }
        if(args.nodeId||args.url){const selected=await api('workbench.source.select',{projectId:project.id,sourceId:currentSource.id,expectedRevision:currentRevision,pages:[{name:args.name||'选择的设计节点',sourceNodeId:args.nodeId,url:args.url||currentSource.url}]});advance(selected);currentSource=selected.source||currentSource;}
      }
      const captured=await api('workbench.source.'+(action==='browser.capture'?'capture':'import'),{projectId:project.id,sourceId:currentSource.id,expectedRevision:currentRevision,browserId:args.browserId,useCurrentState:action==='browser.capture',allowPartial:false});requireSavedSourceResult(captured);advance(captured);
      const current=sourceResponseCurrent(ticket,sourceView.current,requestSerial.current,captured.source?.id||currentSource.id);
      if(current){if(captured.source)chooseSource(captured.source);if(captured.version){setVersion(captured.version);setVersionId(captured.version.id);setCaptureId(captured.version.captures?.[0]?.id||'');}setResult(captured);}
      return {...captured,uiViewIgnored:!current};
    } finally {if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setBusy(false);}
  };
  const ImportDialog = React.useMemo(() => legacy.createImportDialog ? legacy.createImportDialog((action, args) => importDispatch.current(action, args)) : null, [legacy.createImportDialog, legacy.ImportDialog]);
  const state=record?.generation||result?.state||{};
  const savedReviewPages=state.savedPageIds||[];
  React.useEffect(()=>{setReviewPages([]);setReviewNote('');},[state.taskId,state.requestId]);
  React.useEffect(()=>{const latest=existing.find(item=>item.id===recordRef.current?.id);if(latest&&latest!==recordRef.current){recordRef.current=latest;setRecord(latest);}},[existing]);
  const readyToReplicate=websitePreviewReady(websitePreview,{draftKey,sourceId,versionId:frozenVersion,captureId,seen:previewSeen,designId:design?.id});
  const markPreviewLoaded=preview=>{if(previewRef.current===preview){setPreviewSeen(true);setWebsitePhase('ready');}};
  const websiteEntry=<section className="wb-stack" aria-label="网页复刻" aria-busy={websiteBusy}>
    <form className="wb-row" onSubmit={event=>{event.preventDefault();previewWebsite();}}><label className="wb-grow">网页地址<input aria-label="网页地址" type="url" required placeholder="https://example.com" disabled={websiteBusy||busy} value={url} aria-invalid={websiteFieldError?.details?.field==='url'} onChange={event=>{const next=event.target.value;setPagesText(value=>value.trim()===url.trim()?'':value);setURL(next);setWebsitePreview(null);setPreviewSeen(false);setWebsitePhase('idle');setWebsiteFieldError(null);}}/></label><Button primary type="submit" disabled={websiteBusy||busy||!url.trim()}>{websiteBusy?'正在取得预览…':websitePreview?'重新预览':'预览网页'}</Button></form>
    <FieldError error={websiteFieldError} context={websiteFieldError?.details?.field==='url'?'网页地址':'采集选项'}/>
    {websiteBusy&&<p className="wb-muted" role="status">{{planning:'正在准备采集计划…',capturing:'正在通过浏览器采集网页与依赖资源…',reading:'正在读取已保存的冻结预览…'}[websitePhase]}</p>}
    <section className="wb-stack" aria-label="复刻规范"><label className="wb-row"><input type="checkbox" checked={!faithful} disabled={websiteBusy||busy||bindingLoading||!binding&&faithful} onChange={event=>{fidelityChosen.current=true;setFaithful(!event.target.checked);}}/>按当前设计规范改版</label><p className="wb-muted">{bindingLoading?'正在读取当前设计稿的固定规范版本…':bindingProblem?'当前规范暂时无法读取，请重试。':binding?`目标已绑定 ${binding.name} · 固定 v${binding.version}；${faithful?'本次保留原网页样式':'本次按该版本改版'}`:'当前未绑定规范，可原样复刻，或先到设计设置中绑定固定版本。'}</p><Button disabled={websiteBusy||busy||bindingLoading} onClick={loadBinding}>刷新规范信息</Button><p className="wb-muted">{faithful?'忠实保留原网页的布局、文字和视觉样式。':'预览时会固定当前规范版本，再按该版本复刻。'} 更改地址、规范或高级采集选项后，需要重新预览。</p></section>
    {websitePreview&&<section className="wb-stack" aria-label="浏览器冻结预览"><div className="wb-row"><strong className="wb-grow">{previewSeen?'已保存的冻结预览':'正在载入冻结预览…'}</strong><span className="wb-muted">{websitePreview.pin?`${websitePreview.pin.name} · v${websitePreview.pin.version}`:'忠实还原'}</span></div><p className="wb-muted" style={{overflowWrap:'anywhere'}}>{websitePreview.url}</p>
      <div style={{height:440,maxHeight:'60vh',overflow:'auto',border:'1px solid var(--wb-divider)',borderRadius:10,background:'var(--wb-panel)'}}>{websitePreview.image?<img key={websitePreview.versionId+websitePreview.captureId} src={websitePreview.image} alt="浏览器采集并保存的网页冻结快照" onLoad={()=>markPreviewLoaded(websitePreview)} onError={()=>{if(previewRef.current===websitePreview){setPreviewSeen(false);setWebsitePhase('preview-error');}}} style={{display:'block',width:'100%',height:'auto'}}/>:<iframe key={websitePreview.versionId+websitePreview.captureId+':html'} title="已冻结的网页 HTML 预览" srcDoc={websitePreview.html} sandbox="" tabIndex={-1} onLoad={()=>markPreviewLoaded(websitePreview)} style={{width:Number(width),minWidth:'100%',height:Math.max(440,Number(height)),border:0,pointerEvents:'none'}}/>}</div>
      {!websitePreview.image&&<p className="wb-muted">{websitePreview.hasScreenshot?'当前展示已保存的只读 HTML。':'此快照暂无可显示的截图，当前展示已保存的只读 HTML。'} 动态交互需在复刻后验证。</p>}
      {websitePhase==='preview-error'&&<p className="wb-muted" role="status">冻结截图未能载入，可读取已保存的 HTML，或重新预览网页。</p>}{websitePreview.image&&<Button disabled={websiteBusy||busy} onClick={previewFrozenHTML}>查看只读冻结 HTML</Button>}
      {websitePreview.resources?<div className="wb-row" aria-label="已落地资源摘要"><span>CSS {websitePreview.resources.styles.count}</span><span>图片 {websitePreview.resources.images.count}</span><span>字体 {websitePreview.resources.fonts.count}</span><span className="wb-muted">已保存 {websitePreview.resources.total.count} 个外部资源 · {Math.ceil(websitePreview.resources.total.bytes/1024)} KiB{websitePreview.resources.failedCount?` · ${websitePreview.resources.failedCount} 项失败`:''}</span></div>:<p className="wb-muted">此冻结快照尚未提供资源落地明细。</p>}
      {(websitePreview.warnings.length>0||websitePreview.failures.length>0)&&<details><summary>采集提示与资源缺失</summary><ul>{[...websitePreview.warnings,...websitePreview.failures].map((item,index)=><li key={index} style={{overflowWrap:'anywhere'}}>{typeof item==='string'?item:item.message||item.code}</li>)}</ul></details>}
      {websitePreview.draftKey!==draftKey&&<p className="wb-muted" role="status">采集选项或规范已改变，请重新预览后复刻。</p>}
      <div className="wb-row"><Button primary disabled={websiteBusy||busy||!readyToReplicate||['requested','pending','running'].includes(state.generation)} onClick={replicateWebsite}>复刻到当前设计稿</Button><span className="wb-muted">目标：{design?.name||'请先选择设计稿'}</span></div>
      {state.taskId&&<p className="wb-muted" role="status">复刻任务：{sourceStateLabel(state.generation||'unknown')} · 实际保存 {savedReviewPages.length} 页 · {sourceStateLabel(state.outputStatus||'none')}<Button disabled={busy||websiteBusy} onClick={()=>read()}>刷新实际状态</Button></p>}
    </section>}
  </section>;
  const platformEntry=<section className="wb-stack" aria-label="设计平台连接说明"><strong>{source==='mastergo'?'MasterGo':'Figma'} 设计导入</strong><ol><li>在导入连接设置中配置官方连接和访问凭据，并确认该账号能访问目标文件。</li><li>填写完整设计文件链接，优先选择一个明确画板或节点，再读取官方提纲与资料。</li><li>连接未就绪时，可从原平台导出 HTML、结构 JSON 或含图片/字体/CSS 的 ZIP，在下方上传。只有图片时会保留视觉参考，不会声明已取得可编辑结构。</li></ol><div className="wb-row"><Button disabled={busy||websiteBusy} onClick={inspectConnection}>检查连接配置</Button>{ImportDialog&&<Button disabled={busy||websiteBusy} onClick={()=>setImportOpen(true)}>打开导入连接设置</Button>}</div>{connection?.provider===source&&<p className="wb-muted" role="status">{connection.configured?'已配置连接；文件访问与读取仍需实际操作确认。':'尚未配置访问凭据，请打开导入设置完成官方连接，或上传导出资料。'}</p>}</section>;
  return <div className="wb-stack">{source==='website'&&websiteEntry}{['mastergo','figma'].includes(source)&&platformEntry}<details open={source!=='website'}><summary>{source==='website'?'高级选项、归档来源与结果核对':'来源范围、导出资料与结果核对'}</summary><fieldset disabled={websiteBusy} style={{border:0,padding:0,margin:'12px 0 0',minWidth:0}}><div className="wb-stack"><p className="wb-muted">数据取得、设计生成、视觉核对和交互验证分别记录。截图与平台资料作为冻结来源，生成结果须保存到目标设计稿。</p><div className="wb-row"><label className="wb-grow">已归档来源<select value={sourceId || ""} onChange={(e) => {
    chooseSource(selectSourceRecord(existing,e.target.value),{force:true});
  }}><option value="">新建来源…</option>{existing.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.kind}</option>)}{record && !existing.some((s) => s.id === sourceId) && <option value={sourceId}>{record.name}</option>}</select></label>{sourceId && <Button onClick={() => read()}>读取来源记录</Button>}</div><div className="wb-operation-grid"><label>来源类型<select value={source} onChange={(e) => {
    chooseSource(null,{force:true});applyForm(hydrateSourceForm(null,e.target.value));
  }}>{[["website", "\u7F51\u7AD9"], ["mastergo", "MasterGo"], ["figma", "Figma"], ["files", "\u5BFC\u51FA HTML / JSON / \u8D44\u6E90\u5305"]].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label><label>还原策略<select value={faithful ? "faithful" : "system-adaptation"} onChange={(e) => {fidelityChosen.current=true;setFaithful(e.target.value === "faithful");}}><option value="faithful">忠实还原（不套用体系）</option><option value="system-adaptation">明确按当前体系改版</option></select></label></div><label>来源名称<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>设计 / 网站链接<input value={url} onChange={(e) => setURL(e.target.value)} placeholder="https://…" /></label><details><summary>多页面、状态操作与自定义视口</summary><div className="wb-stack"><label>多页面链接（每行一个）<textarea rows={3} value={pagesText} onChange={(e) => setPagesText(e.target.value)} /></label><label>状态操作 JSON（可选，states 数组）<textarea rows={4} value={statesText} onChange={(e) => setStatesText(e.target.value)} placeholder={'[{"name":"\u83DC\u5355\u5C55\u5F00","actions":[{"type":"click","selector":"button.menu"}]}]'} /></label><label>采集范围<select value={captureScope} onChange={(e) => setCaptureScope(e.target.value)}><option value="page">整页</option><option value="regions">仅指定区域</option></select></label><label>区域 JSON（真实 nodeIds 或 rect）<textarea rows={3} value={regionsText} onChange={(e) => setRegionsText(e.target.value)} placeholder={'[{"name":"\u9996\u5C4F","rect":{"x":0,"y":0,"width":1440,"height":900}}]'} /></label><label>多个视口 JSON（留空使用下方宽高）<textarea rows={3} value={viewportsText} onChange={(e) => setViewportsText(e.target.value)} placeholder={'[{"id":"desktop","width":1440,"height":900},{"id":"mobile","width":390,"height":844}]'} /></label></div></details><div className="wb-row"><label>宽度<input type="number" min={240} max={3840} value={width} onChange={(e) => setWidth(e.target.value)} /></label><label>高度<input type="number" min={240} max={3840} value={height} onChange={(e) => setHeight(e.target.value)} /></label><Button primary disabled={busy} onClick={startPlan}>创建来源采集计划</Button>{ImportDialog && <Button onClick={() => setImportOpen(true)}>连接设置 / 浏览器</Button>}</div><ErrorBox error={error} />{sourceId && <><h3>选择文件、页面、画板或节点</h3>{pageItems.map((n, i) => {
    const id = n.sourceNodeId || n.id || n.nodeId || String(i);
    return <label key={id} className="wb-row"><input type="checkbox" disabled={busy||record?.kind!=='website'&&selectionMode==='nodes'} checked={selected.includes(id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, id] : s.filter((v) => v !== id))} /><span>{n.name || n.tag || id}</span></label>;
  })}{['figma','mastergo'].includes(record?.kind)&&<><label>保存范围<select disabled={busy} value={selectionMode} onChange={event=>setSelectionMode(event.target.value)}><option value="pages">上方已归档页面</option><option value="nodes">下方所选页面、画板或节点</option></select></label><Button disabled={busy} onClick={()=>work('discover',{sourceId,offset:0,limit:200})}>读取官方文件提纲</Button>{discovery&&discovery.status!=='available'&&<p className="wb-message">{discovery.reason||discovery.error?.message||'当前官方连接不能提供文件提纲。可填写明确节点链接，或导入导出资料。'}</p>}</>}{record?.kind==='website'&&<p className="wb-muted">下方节点作为所选网页的区域，保留原页面、状态和视口。重新采集会验证这些来源对象仍存在。</p>}<SourceOutline groups={outline} website={record?.kind==='website'} selected={nodeSelection} disabled={busy||record?.kind!=='website'&&selectionMode!=='nodes'} pages={pageItems} captureId={captureId} onSelect={(id,checked)=>setNodeSelection(previous=>checked?[...new Set([...previous,id])]:previous.filter(item=>item!==id))} onLoadMore={loadMoreOutline}/><div className="wb-row"><Button disabled={busy} onClick={saveSelection}>保存所选页面 / 节点范围</Button><Button disabled={busy} onClick={capture}>{source === "website" ? "\u91C7\u96C6\u9875\u9762\u548C\u72B6\u6001" : "\u8BFB\u53D6\u5E73\u53F0\u8D44\u6599 / \u5BFC\u51FA\u6587\u4EF6"}</Button></div><label>导入平台导出资料（HTML / JSON / ZIP / 图片）<input type="file" accept=".html,.htm,.json,.zip,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={async (e) => {
    const file=e.target.files[0];if(!file)return;
    const ticket={...sourceView.current,requestId:++requestSerial.current};
    setBusy(true);
    setError(null);
    try {
      const r = await uploadFile(api, file, { projectId: project.id, purpose: "asset", designId: design?.id, expectedRevision: revisionRef.current, name: file.name, mediaType: file.type || "application/octet-stream", type: "reference" });
      revisionRef.current=Math.max(revisionRef.current,r.projectRevision||r.project?.revision||0);setRevision(revisionRef.current);
      if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current)){setPath(r.file?.path||r.path);setResult(r);}
    }catch(error){if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current))setError(error);}
    finally{if(sourceResponseCurrent(ticket,sourceView.current,requestSerial.current)){setBusy(false);e.target.value='';}}
  }} /></label><label>备用导出资料路径（官方连接不可用时）<input value={path} onChange={(e) => setPath(e.target.value)} placeholder="已通过文件资源导入的 HTML / JSON / ZIP / 图片路径" /></label><div className="wb-operation-grid"><label>冻结来源版本<select value={frozenVersion || ""} onChange={e=>{focusSource(sourceId,{versionId:e.target.value});work('read',{sourceId,versionId:e.target.value});}}><option value="">先采集来源</option>{record?.versions?.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.createdAt}</option>)}{frozenVersion && !record?.versions?.some((v) => v.id === frozenVersion) && <option value={frozenVersion}>{frozenVersion}</option>}</select></label><label>来源快照<select value={captureId} onChange={(e) => {
    sourceView.current=sourceViewTransition(sourceView.current,sourceId);requestSerial.current++;setBusy(false);
    setCaptureId(e.target.value);
    const c = version?.captures?.find((c2) => c2.id === e.target.value), v = record?.viewports?.find((v2) => v2.id === c?.viewportId);
    if (v) {
      setWidth(v.width);
      setHeight(v.height);
    }
  }}><option value="">全部已选快照</option>{version?.captures?.map((c) => <option key={c.id} value={c.id}>{c.pageId} / {c.stateId} / {c.viewportId}</option>)}</select></label></div><label>生成目标页面（留空为当前设计内新页面）<select value={targetPageId} onChange={e=>{sourceView.current=sourceViewTransition(sourceView.current,sourceId);requestSerial.current++;setBusy(false);setTargetPageId(e.target.value);setComparison(null);setRefresh(null);}}><option value="">当前设计 · {design?.name}</option>{project.artboards?.filter((p) => !design || p.designId === design.id || design.pageIds?.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="wb-row"><Button disabled={busy || !frozenVersion} primary onClick={() => generate(false)}>生成可编辑设计</Button><Button disabled={busy || !frozenVersion} onClick={compare}>视觉核对 / 差异</Button><Button disabled={busy} onClick={()=>read()}>刷新实际生成状态</Button></div>{state.taskId&&<p className="wb-muted">实际保存 {savedReviewPages.length} 页 · {sourceStateLabel(state.outputStatus||'none')}{state.generation==='incomplete'?' · 原生请求输出不完整':state.generation==='unknown'?' · 原生请求终态尚未确认':''}</p>}{savedReviewPages.length>0&&<details><summary>记录视觉或交互核验结果</summary><div className="wb-stack"><p className="wb-muted">核验结果关联此任务实际保存的版本；请先检查对应页面，再填写具体证据。</p><div className="wb-row"><label>核验类型<select value={reviewKind} onChange={event=>setReviewKind(event.target.value)}><option value="visual">视觉核对</option><option value="interaction">交互验证</option></select></label><label>结果<select value={reviewOutcome} onChange={event=>setReviewOutcome(event.target.value)}><option value="passed">通过</option><option value="failed">未通过</option></select></label></div>{savedReviewPages.map(id=><label key={id} className="wb-row"><input type="checkbox" checked={reviewPages.includes(id)} onChange={event=>setReviewPages(previous=>event.target.checked?[...previous,id]:previous.filter(item=>item!==id))}/>{project.artboards?.find(page=>page.id===id)?.name||id}</label>)}<label>实际检查内容与证据<textarea rows={4} value={reviewNote} onChange={event=>setReviewNote(event.target.value)} placeholder="检查了哪些页面、视口或交互，结果是什么…"/></label><Button disabled={busy||!reviewNote.trim()||!reviewPages.length} onClick={()=>work('review',{sourceId,taskId:state.taskId,requestId:state.requestId,kind:reviewKind,outcome:reviewOutcome,pageIds:reviewPages,evidence:{note:reviewNote}})}>保存所选已保存页面的核验记录</Button></div></details>}<div className="wb-row">{[["\u6570\u636E\u53D6\u5F97", state.dataAcquisition || (frozenVersion ? "available" : "pending")], ["\u8BBE\u8BA1\u751F\u6210", state.generation || "pending"], ["\u89C6\u89C9\u6838\u5BF9", state.visualReview || "pending"], ["\u4EA4\u4E92\u9A8C\u8BC1", state.interactionVerification || "pending"]].map(([label, value]) => <span className="wb-chip" key={label}>{label} · {sourceStateLabel(value)}</span>)}</div></>}{comparison && <div className="wb-comparison"><div className="wb-resource-bar"><strong className="wb-grow">原始来源 ↔ 设计结果</strong><Button aria-pressed={compareMode === "side"} onClick={() => setCompareMode("side")}>并排</Button><Button aria-pressed={compareMode === "overlay"} onClick={() => setCompareMode("overlay")}>叠加</Button><Button aria-pressed={regionSelect} onClick={() => setRegionSelect((v) => !v)}>圈选差异</Button><label className="wb-row"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />同步滚动 / 缩放</label><Button onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))}>−</Button><span>{Math.round(zoom * 100)}%</span><Button onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>＋</Button>{compareMode === "overlay" && <input aria-label="叠加透明度" type="range" min="0" max="1" step=".01" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />}</div><div className="wb-compare-panels">{renderPreview(comparison.views?.source?.find((s) => s.captureId === captureId) || comparison.views?.source?.[0] || comparison.original, 0)}{renderPreview(comparison.views?.result || comparison.result, 1)}</div><div className="wb-resource-bar"><span className="wb-muted wb-grow">圈选原图差异，并在 Canvas 选择对应真实元素后局部重做。</span><Button disabled={!region || busy} onClick={referenceRegion}>圈选差异加入 AI</Button><Button disabled={busy || !region || !canvasSelection?.nodeIds?.length} onClick={() => generate(true)}>仅重做所选真实元素</Button></div><details><summary>来源差异、缺失资源与未验证交互</summary><pre>{JSON.stringify(comparison.diffs || comparison, null, 2)}</pre></details></div>}{sourceId && targetPageId && <div className="wb-row"><Button disabled={busy} onClick={async () => {
    await previewRefresh(true);
  }}>重新读取来源并预览差异</Button><Button disabled={busy||!captureId} onClick={()=>previewRefresh(false)}>使用冻结快照预览差异</Button>{refresh && <Button primary disabled={busy} onClick={async () => {
    const page = project.artboards?.find((p) => p.id === targetPageId);
    const r = await work("applyRefresh", { sourceId, proposalId: refresh.proposalId || refresh.id, pageId: targetPageId, nodeIds: refresh.affectedNodeIds || refresh.patches?.map((p) => p.nodeId) || [], expectedArtboardRevision: page?.revision });
    if (r) setRefresh(null);
  }}>确认应用所提差异</Button>}</div>}{refresh && <pre>{JSON.stringify(refresh, null, 2)}</pre>}{result && <details><summary>来源证据与业务结果</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}{importOpen && ImportDialog && <ImportDialog project={project} t={(key) => ({ importRead: "\u8BFB\u53D6\u5E76\u4FDD\u5B58\u6765\u6E90\u8D44\u6599", importCapture: "\u6355\u83B7\u6765\u6E90\uFF08\u4E0D\u521B\u5EFA\u9875\u9762\uFF09", importDone: "\u6765\u6E90\u8D44\u6599\u5DF2\u4FDD\u5B58\uFF0C\u8FD4\u56DE\u540E\u751F\u6210\u53EF\u7F16\u8F91\u8BBE\u8BA1" })[key] || (t ? t(key) : key)} initialTab={source === "website" ? "web" : "design"} initialProvider={source === "mastergo" ? "mastergo" : "figma"} initialURL={url} initialName={name} onClose={() => setImportOpen(false)} onImported={async (r) => {
    if(!r?.uiViewIgnored&&r?.source?.id===sourceView.current.sourceId)setResult(r);
  }} />}</div></fieldset></details></div>;
}
export {
  SourcePanel as default
};
