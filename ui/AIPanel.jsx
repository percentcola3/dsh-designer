import React from "react";
import {Icon} from "./brand.jsx";
import {createPortal} from 'react-dom';
import ErrorToast from './ErrorToast.jsx';
import { Button, ErrorBox, Modal, errorValue } from "./common.jsx";
import {freezeAISubmission,confirmationIsCurrent,confirmedPayload} from './ai-confirmation.js';
import { acquireProjectSession, readyProjectSession } from "./session-retention.js";
import { uploadFile } from "./upload.js";
import { getComposeAdmission } from "./compose-admission.js";
import { chooseTargetScope, targetFromSelection, consumeTargetChoice, selectionForSubmission, sourceTemplateConfirmation } from "./target-state.js";
import { aiDockStyles } from "./ai-dock-styles.js";
import {isAIRequestActive, needsAIStatusPolling} from './ai-conversation-state.js';
import DesignerComposer from "./DesignerComposer.jsx";
import {useNativeDesignerComposer} from "./NativeComposerControls.jsx";
const scopes = [["read", "只读分析"], ["selection", "选中元素"], ["page", "当前页面"], ["design", "当前设计"],
["project", "整个项目"]];
function AIPanel({ ctx, api, legacy, nativeAccess={}, projects=[], knowledge=[], systems=[], project, activeDesignId=null, design, designs = [], pages, files = [], target, onTarget, binding, references,
onReferences, onLocate, onCompleted, onHide, onError, canvasSelection, onClearSelection, refreshToken, layout = "sidebar", onLayoutChange }) {
  const [state, setState] = React.useState({}), [draft, setDraft] = React.useState(""), [error, setError] = React.useState(
  null), [sending, setSending] = React.useState(false), [attachments, setAttachments] = React.useState([]), [draftVersion, setDraftVersion] = React.useState(null), [effectiveBinding, setEffectiveBinding] = React.
  useState(binding), [bindingLoading, setBindingLoading] = React.useState(false), [resolvedBindingKey, setResolvedBindingKey] = React.
  useState(""), [draftReady, setDraftReady] = React.useState(false);
  const [statusRefresh,setStatusRefresh]=React.useState(0);
  const stateRef=React.useRef(state);stateRef.current=state;
  const composerRef=React.useRef(null),panelRef=React.useRef(null),submissionLock=React.useRef(false);
  const [pendingTarget,setPendingTarget]=React.useState(null), [pendingSource,setPendingSource]=React.useState(null);
  const Conversation = legacy?.NativeConversation;
  const bindingDesignId=activeDesignId||target.designId,activeDesign=designs.find(d=>d.id===bindingDesignId)||design;
  const native=useNativeDesignerComposer({ctx:legacy?.nativeContext||ctx,api,projectId:project.id,useSessionAccess:nativeAccess.useSessionAccess,useRemoteAccess:nativeAccess.useRemoteAccess,composerRef,locked:sending||!draftReady,onError:setError,onSessionReady:(_sessionId,recovered)=>{if(recovered)setError(current=>current===recovered?null:current);}});
  const isDock = layout === "dock", [targetOpen, setTargetOpen] = React.useState(false),
    [dockExpanded, setDockExpanded] = React.useState(false),
    panelId = React.useId();
  const conversationExpanded = !isDock || dockExpanded;
  const targetId = `${panelId}-target`, historyId = `${panelId}-history`;
  const toggleConversationSize = () => setDockExpanded(value => !value);
  const composing = React.useRef(false), current = React.useRef({ draft, references, attachments, target }), restored = React.
  useRef(false), draftTimer = React.useRef(null), mounted = React.useRef(true), composeOwner = React.useRef({}),
  ownerProjectId = React.useRef(project.id).current, liveProjectId = React.useRef(project.id), projectRevision = React.useRef(project.revision);
  const compose = React.useMemo(() => getComposeAdmission(ownerProjectId), [ownerProjectId]);
  liveProjectId.current = project.id;
  const isLive = () => mounted.current && liveProjectId.current === ownerProjectId;
  const reportError=React.useRef(onError);reportError.current=onError;
  React.useEffect(()=>{if(error&&isLive())reportError.current?.(error);},[error]);
  const preparedSelection=React.useMemo(()=>target.pageId&&!target.path?selectionForSubmission(canvasSelection,{pageId:target.pageId}):undefined,[canvasSelection,target.pageId,target.path]);
  current.current = { draft, references, attachments, target, activeDesignId, bindingDesignId, selection:preparedSelection };
  compose.update(composeOwner.current, { prompt: draft, references, attachments });
  React.useEffect(() => {
    projectRevision.current = project.revision;
  }, [project.revision]);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const bindingIntent=React.useRef(new Map());
  const changeSystem=async choice=>{
    const designId=bindingDesignId;
    if(!designId)throw errorValue('请先在目标设置中选择一个设计。','DESIGN_REQUIRED');
    const owner=ownerProjectId;
    bindingIntent.current.set(designId,choice?.systemId??null);
    const nextBinding=choice?{mode:'independent',systemId:choice.systemId}:{mode:'none'};
    const latest=await api('project.get',{projectId:owner});
    if(!isLive()||current.current.bindingDesignId!==designId)return;
    const saved=await api('binding.set',{projectId:owner,designId,expectedRevision:latest.project.revision,binding:nextBinding,contextSessionId:native.sessionId});
    if(!isLive())return;
    const r=await api('binding.resolve',{projectId:owner,designId});
    if(!isLive()||current.current.bindingDesignId!==designId)return;
    const resolved=r.effectiveBinding||r.binding||r;
    if ((resolved.systemId??null)!==(choice?.systemId??null)) throw errorValue('规范绑定未确认，请重新选择后发送。','BINDING_CHANGED');
    setEffectiveBinding(resolved);
    setResolvedBindingKey(`${owner}:${designId}:${saved.projectRevision??saved.project?.revision??projectRevision.current}`);
  };
  const bindingKey = `${project.id}:${bindingDesignId || "project"}:${project.revision}`, bindingReady = resolvedBindingKey ===
  bindingKey && !bindingLoading && !effectiveBinding?.invalid && (!bindingIntent.current.has(bindingDesignId)||bindingIntent.current.get(bindingDesignId)===(effectiveBinding?.systemId??null));
  React.useEffect(() => {
    let live = true;
    setBindingLoading(true);
    setEffectiveBinding(null);
    api("binding.resolve", { projectId: project.id, designId: bindingDesignId }).then((r) => {
      if (live) {
        setEffectiveBinding(r.effectiveBinding || r.binding || r);
        setResolvedBindingKey(bindingKey);
      }
    }).catch((e) => {
      if (live) {
        setEffectiveBinding({ invalid: true, systemId: activeDesign?.binding?.systemId || project.systemId, version: activeDesign?.binding?.
        version || project.systemVersion });
        setError(e);
      }
    }).finally(() => {
      if (live) setBindingLoading(false);
    });
    return () => live = false;
  }, [project.id, bindingDesignId, project.revision]);
  const saveCompose = () => {
    const v = current.current;
    compose.update(composeOwner.current, { prompt: v.draft, references: v.references, attachments: v.attachments });
    const saved = compose.save(api);
    saved.then((r) => {
      if (isLive()) setDraftVersion(r.version ?? null);
    }).catch((e) => {
      if (isLive()) setError(e);
    });
    return saved;
  };
  React.useEffect(() => {
    let live = true;
    restored.current = false;
    const detach = compose.attach(composeOwner.current, (v) => {
      if (!live || !isLive()) return;
      current.current = { ...current.current, draft: v.prompt, references: v.references, attachments: v.attachments };
      setDraft(v.prompt);
      setAttachments(v.attachments);
      onReferences(v.references);
    });
    compose.load(api, composeOwner.current, (v) => {
      const merged = [...current.current.references];
      for (const ref of v.references || []) if (!merged.some((existing) => JSON.stringify(existing) === JSON.stringify(ref)))
       merged.push(ref);
      return { ...v, references: merged };
    }).then((r) => {
      if (!live || !isLive()) return;
      setDraftVersion(r.version ?? null);
      restored.current = true;
      setDraftReady(true);
    }).catch((e) => {
      if (live && isLive()) {
        setError(e);
        restored.current = true;
        setDraftReady(true);
      }
    });
    return () => {
      live = false;
      clearTimeout(draftTimer.current);
      if (restored.current) saveCompose();
      detach();
    };
  }, [project.id]);
  React.useEffect(() => {
    if (!restored.current) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveCompose();
    }, 650);
    return () => clearTimeout(draftTimer.current);
  }, [draft, references, attachments]);
  React.useEffect(() => {
    let live = true, unsubscribe = () => {
    }, reference, statusTimer, statusSequence=0, controller = new AbortController();
    const update = async () => {
      const sequence=++statusSequence;clearTimeout(statusTimer);
      try {
        const value = await api("ai.status", { projectId: project.id });
        if(!live||!isLive()||sequence!==statusSequence)return;
        if(needsAIStatusPolling(value))statusTimer=setTimeout(update,1000);
        const wasActive=isAIRequestActive(stateRef.current);stateRef.current=value;
        setState(value);
        if(wasActive&&!isAIRequestActive(value))onCompleted?.();
      } catch (e) {
        if (live) setError(e);
      }
    };
    update();
    if (legacy?.subscribeAI) {
      unsubscribe = legacy.subscribeAI(project.id, (s) => {
        if (live) setState(s);
      });
    } else if (project.aiSessionId && ctx?.sessions) {
      (async () => {
        reference = await acquireProjectSession(ctx.sessions, project.aiSessionId, controller.signal);
        if (!live) {
          reference.release();
          return;
        }
        const binding2 = await readyProjectSession(reference,ctx.sessions);
        if (!live) return;
        unsubscribe = binding2.session.subscribe(update);
        update();
      })().catch((e) => {
        if (live && !controller.signal.aborted) setError(e);
      });
    }
    return () => {
      live = false;
      controller.abort();clearTimeout(statusTimer);statusSequence++;
      unsubscribe?.();
      reference?.release();
    };
  }, [project.id, project.aiSessionId, legacy?.subscribeAI, refreshToken, statusRefresh]);
  const confirmationCurrent=pending=>confirmationIsCurrent(pending,{projectId:project.id,projectRevision:project.revision,activeDesignId,prompt:current.current.draft,references:current.current.references,attachments:current.current.attachments,target:current.current.target,selection:current.current.selection});
  React.useEffect(()=>{if(pendingTarget&&!confirmationCurrent(pendingTarget))setPendingTarget(null);},[pendingTarget,project.id,project.revision,activeDesignId,draft,references,attachments,target,canvasSelection]);
  const submit = async (event, prior, confirmation, sourceConfirmation) => {
    event?.preventDefault();
    if (!isLive() || composing.current || submissionLock.current || sending || state.running || !bindingReady || !draftReady || !native.canPrompt || htmlSelectionIncomplete) return;
    if(confirmation&&!confirmationCurrent(confirmation)){setPendingTarget(null);setError(errorValue('目标或草稿已变化，请重新提交确认。','TARGET_CONFIRMATION_STALE'));return;}
    if(sourceConfirmation&&!confirmationCurrent(sourceConfirmation)){setPendingSource(null);setError(errorValue("选区或草稿已变化，请重新提交确认。","SOURCE_CONFIRMATION_STALE"));return;}
    const snap = confirmation?.snapshot || sourceConfirmation?.snapshot || prior || { prompt: current.current.draft, target: structuredClone(current.current.target), references: structuredClone(
    current.current.references), attachments: structuredClone(current.current.attachments), selection: structuredClone(current.current.selection), binding: structuredClone(effectiveBinding ||
    {}) };
    if (!snap.prompt.trim()) return;
    if(sourceSelectionMode&&!sourceTemplateReady&&!confirmation) {
      if(!sourceElementReady)return;
      const approved=sourceConfirmation&&JSON.stringify(snap.target.sourceTemplateConfirmed)===JSON.stringify(sourceProof);
      if(!approved) {
        const guard=structuredClone({prompt:current.current.draft,references:current.current.references,attachments:current.current.attachments,target:current.current.target,selection:current.current.selection});
        setPendingSource({projectId:project.id,projectRevision:project.revision,activeDesignId:activeDesignId??null,guard,snapshot:{...structuredClone(snap),target:{...structuredClone(snap.target),sourceTemplateConfirmed:structuredClone(sourceProof)}}});
        return;
      }
    }
    let payload;try{payload=confirmation?confirmedPayload(confirmation):freezeAISubmission({snapshot:snap,activeDesignId,sessionId:native.sessionId,projectId:ownerProjectId});}catch(e){setError(e);return;}
    submissionLock.current=true;setSending(true);
    setError(null);
    const isRepeat=confirmation?confirmation.isRepeat:!!prior;
    const { scopeChoice, ...submittedTarget } = snap.target;
    const v = current.current, submittedGeneration = confirmation?.generation || compose.update(composeOwner.current, {
      prompt: v.draft, references: v.references, attachments: v.attachments
    }), releaseAdmission = compose.retain();
    try {
      const r = await api("ai.run", payload);
      if (r.accepted === false) throw errorValue(r.error?.message || r.error || "AI 没有接受任务", r.error?.code ||
      "AI_REJECTED", r.error?.details);
      // Native acceptance consumes the project-owned compose even after this
      // panel unmounts. Cleanup and a reopened panel share the same CAS chain.
      const consumed = !isRepeat ? compose.consume(api, submittedGeneration) : null;
      if (isLive()) {
        setPendingTarget(null);
        setStatusRefresh(value=>value+1);
        setState((s) => ({ ...s, ...r, error: null, cancelled: false, running: true, status: "running",
          request: {sessionId: r.sessionId, requestId: r.requestId, generation: 'requested'},
          messages: [...s.messages || [], { role: "user", requestId: r.requestId, text: snap.
        prompt, references: snap.references, target: r.target||submittedTarget, effectiveBinding:r.effectiveBinding||snap.binding }] }));
        if (!isRepeat) onTarget((current2) => isLive() ? consumeTargetChoice(current2, snap.target,{activeDesignId:current.current.activeDesignId}) : current2);
        onCompleted?.();
      }
      await consumed;
    } catch (e) {
      if (isLive()) {
        if(e.code==='TARGET_CONFIRMATION_REQUIRED'&&e.details?.token){
          setPendingTarget({details:e.details,payload:confirmation?.payload||payload,snapshot:structuredClone(snap),guard:confirmation?.guard||structuredClone({prompt:v.draft,references:v.references,attachments:v.attachments,target:v.target,selection:v.selection}),generation:submittedGeneration,isRepeat,projectId:ownerProjectId,projectRevision:e.details.projectRevision??project.revision,activeDesignId:activeDesignId??null});
        }else{setPendingTarget(null);setError(e);}
      }
    } finally {
      releaseAdmission();submissionLock.current=false;
      if (isLive()) setSending(false);
    }
  };
  const addFiles = async (files2) => {
    setSending(true);
    const releaseUpload = compose.retain();
    try {
      for (const file of files2) {
        const r = await uploadFile(api, file, { projectId: project.id, purpose: "attachment", contextSessionId:native.sessionId, name: file.name, mediaType: file.
        type || "application/octet-stream", designId: target.designId });
        const receipt = r.receiptId ? r : r.receipt || r.attachment;
        if (!receipt?.receiptId) throw errorValue("上传未返回真实 Session 附件凭据", "ATTACHMENT_RECEIPT_MISS\
ING");
        await compose.addAttachment(api, { ...receipt, label: receipt.file?.name || receipt.image?.name || file.name });
      }
    } catch (e) {
      if (isLive()) setError(e);
    } finally {
      releaseUpload();
      if (isLive()) setSending(false);
    }
  };
  const targetSummary = target.path ? `${target.sourceId ? project.workbench?.sourceProjects?.find((s) => s.id === target.sourceId)?.name || "外部源码" : "项目文件"} / ${target.path}` :
    `${target.designId ? designs.find((d) => d.id === target.designId)?.name || design?.name || "当前设计" : "项目需求"}${target.pageId ? " / " + (pages.find((p) => p.id === target.pageId)?.name || target.pageId) : ""}${target.nodeIds?.length ? ` / ${target.nodeIds.length} 个元素` : ""}`;
  const sourceSelection=preparedSelection,sourceProof=React.useMemo(()=>sourceTemplateConfirmation(preparedSelection),[preparedSelection]);
  const sourceSelectionMode=target.scope==='selection'&&Boolean(target.sourceSelection||['react','vue'].includes(sourceSelection?.artifact?.kind));
  const sourceElementReady=!!sourceProof&&sourceSelection.objects.every(row=>typeof row.outerHTML==='string'&&row.outerHTML&&!row.outerHTMLTruncated&&row.outerHTMLComplete!==false);
  const htmlSelectionIncomplete=target.scope==='selection'&&!sourceSelectionMode&&(!sourceSelection?.objects?.length||sourceSelection.objects.some(row=>typeof row.outerHTML!=='string'||!row.outerHTML||row.outerHTMLTruncated||row.outerHTMLComplete===false));
  const sourceTemplateReady=!htmlSelectionIncomplete&&(!sourceSelectionMode||sourceElementReady&&JSON.stringify(target.sourceTemplateConfirmed)===JSON.stringify(sourceProof));
  const scopeSummary = target.path && target.scope !== "read" ? "精确文件路径" : scopes.find(([value]) => value === target.scope)?.[1] || target.scope;
  const selectedContext = preparedSelection?.objects?.length || preparedSelection?.nodeIds?.length ? preparedSelection : null;
  React.useEffect(()=>{if(pendingSource&&!confirmationCurrent(pendingSource))setPendingSource(null);},[pendingSource,project.id,project.revision,activeDesignId,draft,references,attachments,target,canvasSelection]);
  React.useEffect(()=>{if(state.taskRecoveryError)setError(state.taskRecoveryError);},[state.taskRecoveryError]);
  return <aside ref={panelRef} className={`wb-ai ${isDock ? "wb-ai-dock" : "wb-ai-sidebar"}`} data-ai-layout={isDock ? "dock" : "sidebar"} data-conversation-expanded={conversationExpanded} aria-label="AI 设计助手">
    <style>{aiDockStyles}</style>
    <header className="wb-ai-header">
      <strong className="wb-grow"><Icon name="sparkles" size={14}/>设计助手</strong>
      <Button aria-label="本次修改范围" title={`${targetSummary} · ${scopeSummary}`} aria-expanded={targetOpen} aria-controls={targetId} onClick={()=>setTargetOpen(value=>!value)}><Icon name="settings" size={15}/></Button>
      <div className="wb-ai-layout-switch" role="group" aria-label="AI 面板布局">
        <Button aria-label={isDock ? '切换到侧边模式' : '切换到简易模式'} title={isDock ? '侧边模式' : '简易模式'} onClick={()=>onLayoutChange?.(isDock ? 'sidebar' : 'dock')}><Icon name={isDock ? 'layout-sidebar' : 'layout-dock'} size={15}/></Button>
      </div>
      {isDock&&<Button className="wb-ai-history-toggle" aria-label={conversationExpanded?'缩小对话区域':'扩大对话区域'} title={conversationExpanded?'缩小对话区域':'扩大对话区域'} aria-expanded={conversationExpanded} aria-controls={historyId} onClick={toggleConversationSize}><Icon name={conversationExpanded?'chevron-down':'chevron-up'} size={15}/></Button>}
      <Button aria-label="收起 AI" title="收起 AI" onClick={onHide}><Icon name="x" size={15}/></Button>
    </header>
    <div id={targetId} className="wb-ai-target" hidden={!targetOpen}><strong>目标 · {target.
  path ? `${target.sourceId ? project.workbench?.sourceProjects?.find((s) => s.id === target.sourceId)?.name || "外部源码" :
  "项目文件"} / ${target.path}` : design?.name || "项目需求"}{target.pageId ? " / " + (pages.find((p) => p.id ===
  target.pageId)?.name || target.pageId) : ""}{target.nodeIds?.length ? ` / ${target.nodeIds.length} 个元素` : ""}</strong><span>有效规范 · {bindingLoading ?
  "读取中…" : effectiveBinding?.system?.name || effectiveBinding?.name || effectiveBinding?.systemId || "未绑定"} · 来源 {effectiveBinding?.source || effectiveBinding?.mode || "项目"}</span>{target.
  path ? <><p>范围 · 仅 {target.path}</p><p className="wb-muted">{target.sourceId ? "登记环境：" + (project.workbench?.
  sourceProjects?.find((s) => s.id === target.sourceId)?.directory || project.workbench?.sourceProjects?.find((s) => s.id ===
  target.sourceId)?.root || target.sourceId) : "当前项目文件"} · {target.scope === "read" ? "只读分析" : "仅列明\
路径可写，不授权其他设计"}</p><Button onClick={() => onTarget({ projectId: project.id, designId: activeDesignId||designs[0]?.
  id, scope: "design" })}>切换为设计目标</Button></> : <><label className="wb-row">设计目标<select aria-label="AI 设计目标" value={target.
  designId || ""} onChange={(e) => onTarget(targetFromSelection(target, null, { source: "user", projectId: project.id, designId: e.
  target.value || void 0, defaultScope:'design' }))}><option value="">项目资料</option>{designs.map((d) => <option key={d.id} value={d.id}>{d.
  name}</option>)}</select></label><label className="wb-row">页面目标<select aria-label="AI 页面目标" value={target.
  pageId || ""} onChange={(e) => onTarget(targetFromSelection(target, null, { source: "user", projectId: project.id, designId: target.
  designId, pageId: e.target.value || void 0, defaultScope:'design' }))}><option value="">设计整体 / 新页面</option>{pages.filter((p) => !target.
  designId || p.designId === target.designId || designs.find((d) => d.id === target.designId)?.pageIds?.includes(p.id)).
  map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}<label className="wb-row">可修改范围<select aria-label="AI 可修改范围" value={target.
  scope} onChange={(e) => onTarget(chooseTargetScope(target, e.target.value, crypto.randomUUID()))}>{scopes.map(([value,
  label]) => <option key={value} value={value} disabled={!!target.sourceId&&value!=='read' || !!target.path && !["read", "project"].includes(value) || value ===
  "selection" && !target.nodeIds?.length || value === "page" && !target.pageId || value === "design" && !target.designId}>{target.
  path && value === "project" ? "精确文件路径" : label}</option>)}</select></label>{!target.path && <strong>写入范围 · {{
  read: "只读分析", selection: "仅选中元素", page: "当前页面", design: "整个设计", project: "整个项目" }[target.
  scope] || target.scope}{target.scopeChoice ? " · 本轮明确选择" : ""}</strong>}{(canvasSelection?.nodeIds?.length ||
  canvasSelection?.nodeId) && <Button onClick={() => onTarget(targetFromSelection(target, canvasSelection, { source: "us\
er", forceSelection: true, projectId: project.id, designId: pages.find((p) => p.id === canvasSelection.pageId)?.designId ||
  designs.find((d) => d.pageIds?.includes(canvasSelection.pageId))?.id, pageId: canvasSelection.pageId }))}>仅修改画布选中</Button>}<span className="wb-muted">项目共享对话 · 默认写入 {activeDesign?.folder||'当前项目'} · 外挂知识只读。跨设计稿写入会先确认。</span><details><summary>本次自动上下文</summary><p>项目目标 · {project.
  workbench?.goal || project.description || "尚未填写"}</p><p>需求 · {project.workbench?.requirementsPath || "无"}</p><p>规则 · {project.
  workbench?.rulesPath || "无"}</p><p>对象 · {target.nodeIds?.join(", ") || "未选择元素"}</p><p>当前查看参考不会授予额外修改范围。</p></details></div>
    {!onError&&<ErrorToast error={error} onClose={dismissed=>setError(current=>current===dismissed?null:current)}/>}
    <div id={historyId} className="wb-ai-conversation">
      {Conversation ? <Conversation reference={native.reference}>
      <DesignerComposer key={`${project.id}:${bindingDesignId||'project'}`} ref={composerRef} variant="canvas" compact={isDock} value={draft} onChange={setDraft}
        onSubmit={submit} disabled={!draftReady||sending} submitDisabled={!bindingReady||!native.canPrompt||htmlSelectionIncomplete||sourceSelectionMode&&!sourceElementReady} submitting={sending}
        running={Boolean(state.running)} stopDisabled={!native.canCancel} onStop={async()=>{
          try{const r=await api('ai.cancel',{projectId:project.id,contextSessionId:native.sessionId});if(isLive()){setState(s=>({...s,...r,running:false,status:'cancelled'}));}}catch(e){if(isLive())setError(e);}
        }} ariaLabel="设计要求" placeholder="描述设计、附上参考，输入 @ 引用项目、知识库或文件…" api={api} conversation={ctx?.uiConversation}
        projectId={project.id} contextSessionId={native.sessionId} onPickDirectory={ctx?.uiWorkspace?.pickDirectory?()=>ctx.uiWorkspace.pickDirectory():undefined} projects={projects} knowledge={knowledge} files={files} references={references} onReferencesChange={onReferences} selectionContext={selectedContext} onRemoveSelection={onClearSelection}
        attachments={attachments} onFiles={addFiles} canAttach={draftReady&&native.canUpload}
        onRemoveAttachment={(_attachment,index)=>setAttachments(values=>values.filter((_,i)=>i!==index))}
        systems={systems} systemChoice={effectiveBinding?.systemId?{systemId:effectiveBinding.systemId}:null}
        onSystemChange={changeSystem} leftControls={native.leftControls} rightControls={native.rightControls} onError={setError}/>
      </Conversation> : <p className="wb-muted" role="alert">当前宿主未提供原生对话视图，请重新加载插件。</p>}
    </div>
    {pendingSource&&createPortal(<Modal title="确认修改源码模板" onClose={()=>setPendingSource(null)}>
      <div className="wb-stack">
        <p>修改此源码模板会影响它的所有运行实例。</p>
        {pendingSource.snapshot.target.sourceTemplateConfirmed.sources.map(source=><p className="wb-muted" key={`${source.path}:${source.nodeId}`}>{source.path} · {source.nodeId}</p>)}
        <div className="wb-row"><Button onClick={()=>setPendingSource(null)}>返回修改</Button><span className="wb-grow"/><Button primary disabled={sending||!confirmationCurrent(pendingSource)} onClick={event=>{const pending=pendingSource;setPendingSource(null);submit(event,null,null,pending);}}>确认并发送</Button></div>
      </div>
    </Modal>,panelRef.current?.closest('.wb')||document.body)}
    {pendingTarget&&createPortal(<Modal title="确认本次写入目标" onClose={()=>{if(!sending)setPendingTarget(null);}}>
      <div className="wb-stack"><p>{pendingTarget.details.message||'这次要求的写入范围与当前激活的设计稿不同，请确认后继续。'}</p>
        <p>当前激活 · <strong>{activeDesign?.name||'项目资料'}</strong></p>
        <p>本次目标 · <strong>{pendingTarget.details.proposedTarget?.path||designs.find(d=>d.id===pendingTarget.details.proposedTarget?.designId)?.name||(pendingTarget.details.proposedTarget?.scope==='project'?'整个项目':'所选范围')}</strong></p>
        <p className="wb-muted">{pendingTarget.details.proposedTarget?.scope==='project'?'将按各设计稿分别绑定的规范处理。':`写入目录 · ${designs.find(d=>d.id===pendingTarget.details.proposedTarget?.designId)?.folder||pendingTarget.details.proposedTarget?.path||'项目内确认的范围'}`}</p>
        <p className="wb-muted">仅授权这一次请求；确认后使用目标设计稿的规范，项目对话继续共享。</p>
        <div className="wb-row"><Button disabled={sending} onClick={()=>setPendingTarget(null)}>返回修改</Button><span className="wb-grow"/><Button primary disabled={sending||!confirmationCurrent(pendingTarget)} onClick={event=>submit(event,null,pendingTarget)}>{sending?'正在提交…':'确认并继续'}</Button></div>
      </div>
    </Modal>,panelRef.current?.closest('.wb')||document.body)}
  </aside>;
}
export {
  AIPanel as default
};
