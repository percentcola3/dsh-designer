import {applyRuntimeStyle} from '../editor/runtime-style.js';
import React from "react";
import styles from "./styles.js";
import ErrorToast from './ErrorToast.jsx';
import {createWorkbenchApi} from './workbench-api.js';
import {ToastProvider} from './toast-provider.jsx';
import refinedStyles from './workbench-v2-styles.js';
import themeStyles from './theme-styles.js';
import {readTheme,saveTheme,THEME_KEY} from './theme.js';
import { tabReducer, emptyTabs, resourceKey, tabTitle, closeCandidates } from "./tabs.js";
import { Button, ErrorBox, Modal, Empty, flattenFiles, errorValue } from "./common.jsx";
import ResourceView, { resourceType } from "./ResourceView.jsx";
import AIPanel from "./AIPanel.jsx";
import SourcePanel from "./SourcePanel.jsx";
import RuntimePanel from "./RuntimePanel.jsx";
import LibraryPanel from "./LibraryPanel.jsx";
import SystemLibrary from "./SystemLibrary.jsx";
import KnowledgePanel from './KnowledgePanel.jsx';
import { mapInBatches, createLimiter } from "./async.js";
import { acquireProjectSession } from "./session-retention.js";
import { uploadFile } from "./upload.js";
import { compactState } from "./state-snapshot.js";
import { canvasTransaction } from "./canvas-transaction.js";
import { bindingApplicationState } from "./binding-application.js";
import { targetFromSelection } from "./target-state.js";
import {invalidateIdentityState} from './identity-state.js';
import {orderedDesignPages,reorderPageBefore} from './page-order.js';
import FileNavigation from './FileNavigation.jsx';
import {panelWidth,readPanelLayout,savePanelLayout} from './panel-layout.js';
import {readConversationLayout,saveConversationLayout} from './canvas-conversation-layout.js';
import {Icon} from './brand.jsx';
import WorkbenchShell from './WorkbenchShell.jsx';
import HomePanel from './HomePanel.jsx';
import ProjectManagerPanel from './ProjectManagerPanel.jsx';
import SettingsPanel,{ProjectSettingsPanel} from './SettingsPanel.jsx';
import {initialWorkspaceTabs,workspaceTabsReducer,projectWorkspaceTab,projectSettingsTab,globalWorkspaceTab} from './workspace-tabs.js';
import {readRecentProjectVisits,recordRecentProjectVisit,getRecentProjects} from './recent-projects.js';
import {startHomeDesign} from './home-design.js';
import ProjectCanvasLayout from './ProjectCanvasLayout.jsx';
import EmptyCanvas from './EmptyCanvas.jsx';
import CanvasDesignDialog from './CanvasDesignDialog.jsx';
import {designCanvasTab,sourceCanvasTab,canvasFirstState} from './canvas-workspace.js';
import {projectCardAction} from './project-card-actions.js';
function localStorageOrNull(){try{return globalThis.localStorage;}catch{return null;}}
function Workbench({ ctx, Canvas, api, onExit, legacy = {}, t }) {
  const [library, setLibrary] = React.useState({ projects: [], groups: [], systems: [], knowledge: [] }), [appTabs, dispatchWorkspaceTabs] = React.useReducer(workspaceTabsReducer, initialWorkspaceTabs), [opened, setOpened] = React.useState([]), [projectRuns, setProjectRuns] = React.useState({}), [projectId, setProjectId] = React.useState(null), [workspaces, setWorkspaces] = React.useState({}), [tabs, dispatch] = React.useReducer(tabReducer, emptyTabs), [designId, setDesignId] = React.useState(null), [selection, setSelection] = React.useState(null), [target, setTarget] = React.useState(null), [references, setReferences] = React.useState([]), [device, setDevice] = React.useState("responsive"), [customViewport, setCustomViewport] = React.useState({ width: 1280, height: 800 }), [nav, setNav] = React.useState("pages"), [navOpen, setNavOpen] = React.useState(false), [navWidth, setNavWidth] = React.useState(320), [aiOpen, setAiOpen] = React.useState(true), [focus, setFocus] = React.useState(false), [fullscreen, setFullscreen] = React.useState(false), [managerQuery, setManagerQuery] = React.useState(""), [group, setGroup] = React.useState("all"), [error, setError] = React.useState(null), [busy, setBusy] = React.useState(false), [modal, setModal] = React.useState(null), [tabMenu, setTabMenu] = React.useState(null), [closeFailure, setCloseFailure] = React.useState(null), [diagnostics, setDiagnostics] = React.useState([]), [status, setStatus] = React.useState({ save: "\u5DF2\u4FDD\u5B58", validation: "\u5F85\u9A8C\u8BC1", preview: "\u672A\u9884\u89C8", runtime: "\u672A\u542F\u52A8" }), [binding, setBinding] = React.useState(null);
  const [canvasFrozen,setCanvasFrozen]=React.useState(false);
  const activeAppTab=appTabs.items.find(item=>item.id===appTabs.activeId)||initialWorkspaceTabs.items[0];
  const screen=activeAppTab.kind;
  const appTabsRef=React.useRef(appTabs);appTabsRef.current=appTabs;
  const [homeComposeOptions,setHomeComposeOptions]=React.useState({references:[],attachments:[],systemChoice:null,sessionId:null});
  const homeOptionsRef=React.useRef(homeComposeOptions);homeOptionsRef.current=homeComposeOptions;
  const [homeDraft,setHomeDraft]=React.useState(''),[homeBusy,setHomeBusy]=React.useState(false),[homeError,setHomeError]=React.useState(null),[homeResult,setHomeResult]=React.useState(null),[recentVisits,setRecentVisits]=React.useState({}),[settingsDecision,setSettingsDecision]=React.useState(null);
  const homeCheckpoint=React.useRef(null),homeSubmission=React.useRef(false),projectOpenHandler=React.useRef(null),settingsGuards=React.useRef(new Map()),navigationEpoch=React.useRef(0);
  const homeCompose=React.useRef({draft:homeDraft,busy:homeBusy});homeCompose.current={draft:homeDraft,busy:homeBusy||Boolean(homeComposeOptions.uploading),options:homeComposeOptions};
  React.useEffect(()=>{const guard={manual:true,isDirty:()=>!!homeCompose.current.draft.trim()||!!homeCompose.current.options.uploading||!!homeCompose.current.options.attachments?.length||!!homeCompose.current.options.references?.length,isBusy:()=>homeCompose.current.busy,discard:()=>{setHomeDraft('');setHomeComposeOptions(value=>({...value,references:[],attachments:[]}));}};settingsGuards.current.set('home',guard);return()=>{if(settingsGuards.current.get('home')===guard)settingsGuards.current.delete('home');};},[]);
  React.useEffect(()=>{setRecentVisits(readRecentProjectVisits(localStorageOrNull(),library.root));},[library.root]);
  const workspace = workspaces[projectId], project = workspace?.project, designs = workspace?.designs || [], pages = workspace?.pages || [], design = designs.find((d) => d.id === designId) || designs[0], active = tabs.items.find((t2) => t2.id === tabs.activeId), documents = workspace?.documents || {}, loadSequence = React.useRef(0), resourceOpenSequence = React.useRef(0), pageLoads = React.useRef(/* @__PURE__ */ new Map()), pageLimit = React.useRef(createLimiter(4)), uploadRefresh = React.useRef(null), canvasControllers = React.useRef(/* @__PURE__ */ new Map()), pendingLocate = React.useRef(null), tabRef = React.useRef(tabs), projectRef = React.useRef(project), viewVersions = React.useRef({}), restoreGuard = React.useRef(false), saveQueue = React.useRef(Promise.resolve()), draftQueues = React.useRef(/* @__PURE__ */ new Map()), draftTimers = React.useRef(/* @__PURE__ */ new Map()), draftVersions = React.useRef(/* @__PURE__ */ new Map()), sessionViews = React.useRef(/* @__PURE__ */ new Map()), currentWorkspace = React.useRef(workspace);
  const [navigationViews,setNavigationViews]=React.useState({});
  const [projectSettingsRefresh,setProjectSettingsRefresh]=React.useState({});
  const [projectSidebarOpen,setProjectSidebarOpen]=React.useState(false),[resourceVisible,setResourceVisible]=React.useState(false),[canvasTool,setCanvasTool]=React.useState('interact'),[newDesignProjectId,setNewDesignProjectId]=React.useState(null);
  const designSwitch=React.useRef(0),pageCreation=React.useRef(false),projectActionLocks=React.useRef(new Set());
  const [capturing,setCapturing]=React.useState(false);
  const [projectLoadErrors,setProjectLoadErrors]=React.useState({});
  React.useEffect(()=>{if(screen==='project'){setProjectSidebarOpen(false);setNavOpen(false);setResourceVisible(false);}},[screen,projectId]);
  const [panelLayout,setPanelLayout]=React.useState(()=>readPanelLayout(localStorageOrNull()));
  const [conversationLayout,setConversationLayout]=React.useState(()=>readConversationLayout(localStorageOrNull()));
  React.useEffect(()=>{saveConversationLayout(localStorageOrNull(),conversationLayout);},[conversationLayout]);
  const setConversationMode=React.useCallback(mode=>setConversationLayout(value=>({...value,mode:mode==='sidebar'?'sidebar':'dock'})),[]);
  const setConversationWidth=React.useCallback((mode,width)=>setConversationLayout(value=>({...value,[mode==='sidebar'?'sideWidth':'dockWidth']:width})),[]);
  const [theme,setTheme]=React.useState(()=>readTheme(localStorageOrNull()));
  React.useEffect(()=>{savePanelLayout(localStorageOrNull(),panelLayout);},[panelLayout]);
  React.useEffect(()=>{saveTheme(localStorageOrNull(),theme);},[theme]);
  React.useEffect(()=>{const sync=event=>{if(event.key===THEME_KEY)setTheme(event.newValue==='dark'?'dark':'light');};globalThis.addEventListener('storage',sync);return()=>globalThis.removeEventListener('storage',sync);},[]);
  const workspacesRef = React.useRef(workspaces);
  workspacesRef.current = workspaces;
  tabRef.current = tabs;
  projectRef.current = project;
  currentWorkspace.current = workspace;
  const cacheApiResult = React.useCallback((result, args = {}) => {
    if (result?.project?.id) {
      const p = result.project;
      if (projectRef.current?.id === p.id && projectRef.current.revision <= p.revision) projectRef.current = p;
      setWorkspaces((w) => w[p.id] && w[p.id].project.revision <= p.revision ? { ...w, [p.id]: { ...w[p.id], project: p, pages: p.artboards ? p.artboards.map((page) => ({ ...w[p.id].pages?.find((existing) => existing.id === page.id), ...page })) : w[p.id].pages, designs: p.workbench?.designs ? p.workbench.designs.filter((d) => !d.deletedAt) : w[p.id].designs } } : w);
      setLibrary((l) => ({ ...l, projects: l.projects.map((item) => item.id === p.id && item.revision <= p.revision ? p : item) }));
    } else if (args.projectId && result?.projectRevision) {
      const id = args.projectId;
      if (projectRef.current?.id === id && projectRef.current.revision <= result.projectRevision) projectRef.current = { ...projectRef.current, revision: result.projectRevision };
      setWorkspaces((w) => w[id] && w[id].project.revision < result.projectRevision ? { ...w, [id]: { ...w[id], project: { ...w[id].project, revision: result.projectRevision } } } : w);
    }
    return result;
  }, []);
  const scopedApi=React.useMemo(()=>createWorkbenchApi(api),[api,library.root]);
  const invoke = React.useCallback(async (action, args = {}) => {
    const result=cacheApiResult(await scopedApi(action,args),args);
    if(result?.localHistory?.state==='failed')setError({code:result.localHistory.error.code,message:result.localHistory.error.message});
    return result;
  }, [cacheApiResult,scopedApi]);
  const homeApi=React.useCallback((action,args={})=>{const sessionId=homeOptionsRef.current.sessionId;return invoke(action,{...(sessionId?{contextSessionId:sessionId}:{}),...(action==='composer.prepare'&&!args.projectId&&sessionId?{sessionId}:{}),...args});},[invoke,library.root]);
  const projectPreviewApi=React.useCallback((action,args)=>api(action,args),[api,library.root]);
  invoke.upload = React.useCallback(async (file, args = {}) => {
    const result = cacheApiResult(await uploadFile(scopedApi, file, args), args);
    if (args.replace) await uploadRefresh.current?.(result, args);
    return result;
  }, [scopedApi, cacheApiResult]);
  homeApi.upload = invoke.upload;
  const refreshLibrary = React.useCallback(async () => {
    const result = await invoke("state");
    setLibrary({ projects: [], groups: [], systems: [], knowledge: [], ...result });
    return result;
  }, [invoke]);
  React.useEffect(() => {
    refreshLibrary().catch(setError);
  }, [refreshLibrary]);
  const ensurePages = React.useCallback(async (id, ids, force = false) => {
    const cache = currentWorkspace.current?.project?.id === id ? currentWorkspace.current : null;
    await mapInBatches([...new Set(ids.filter(Boolean))], async (pageId) => {
      const page = cache?.pages?.find((p) => p.id === pageId), key = `${id}:${pageId}:${page?.revision || ""}:${force ? crypto.randomUUID() : ""}`;
      if (!force && cache?.documents?.[pageId] && cache.documents[pageId]._revision === page?.revision && !cache.documents[pageId].error) return;
      if (pageLoads.current.has(key)) return pageLoads.current.get(key);
      const pending = pageLimit.current(async () => {
        try {
          const document = await invoke("artboard.get", { projectId: id, artboardId: pageId });
          setWorkspaces((w) => w[id] ? { ...w, [id]: { ...w[id], documents: { ...w[id].documents, [pageId]: { ...document, _revision: document.artboard?.revision ?? page?.revision, error: null } } } } : w);
        } catch (e) {
          setWorkspaces((w) => w[id] ? { ...w, [id]: { ...w[id], documents: { ...w[id].documents, [pageId]: { ...w[id].documents?.[pageId], _revision: page?.revision, error: { code: e.code, message: e.message, details: e.details } } } } } : w);
          setDiagnostics((d) => [...d.filter((v) => v.pageId !== pageId), { pageId, severity: "error", code: e.code, message: e.message }]);
        } finally {
          pageLoads.current.delete(key);
        }
      });
      pageLoads.current.set(key, pending);
      return pending;
    });
  }, [invoke]);
  const loadWorkspace = React.useCallback(async (id, { restore = false, invalidateDocuments = false } = {}) => {
    if (!restore && !restoreGuard.current) return currentWorkspace.current;
    const seq = ++loadSequence.current;
    const value = await invoke("workspace.open", { projectId: id });
    if (seq !== loadSequence.current) return;
    const docs = { ...(!invalidateDocuments&&currentWorkspace.current?.project?.id===id?currentWorkspace.current.documents:{}), ...value.documents };
    if (seq !== loadSequence.current) return;
    const next = { ...value, pages: value.pages || value.project?.artboards || [], documents: docs };
    projectRef.current = next.project;
    setWorkspaces((w) => ({ ...w, [id]: next }));
    if (!restore) {
      const files = flattenFiles(next.files || []);
      for (const tab of tabRef.current.items.filter((t2) => t2.id.startsWith(id + ":") && t2.type === "file" && !t2.sourceId)) {
        const file = files.find((f) => f.id === tab.resourceId || f.path === tab.path);
        if (file) dispatch({ type: "update", id: tab.id, patch: { path: file.path, name: file.name || file.path.split("/").pop() } });
        else dispatch({ type: "update", id: tab.id, patch: { readonly: true, error: { code: "RESOURCE_UNAVAILABLE", message: "\u8D44\u6E90\u5DF2\u5220\u9664\u3001\u79FB\u9664\u767B\u8BB0\u6216\u4E0D\u53EF\u8BBF\u95EE\u3002\u5F53\u524D\u7F13\u51B2\u4ECD\u4FDD\u7559\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u6B63\u5E38\u4FDD\u5B58\u3002" } } });
      }
    }
    if (restore) {
      const saved = await invoke("workspace.state.get", { projectId: id });
      if (seq !== loadSequence.current) return;
      const state = sessionViews.current.get(id) || saved.state || {};
      const savedTabs = Array.isArray(state.tabs) ? { items: state.tabs, activeId: state.activeTabId } : state.tabs || emptyTabs;
      viewVersions.current[id] = saved.version ?? null;
      const restoredTabs = { ...savedTabs, items: await mapInBatches(savedTabs.items || [], async (tab) => {
        if (tab.type === "runPreview") {
          try {
            const runtime = await invoke("runtime.status", { projectId: id, sourceId: tab.sourceId || tab.resourceId });
            const run = runtime.run || runtime.source?.run;
            if (!run?.url || !["running", "starting"].includes(run.status)) return { ...tab, url: void 0, error: { code: "RUNTIME_NOT_RUNNING", message: "\u767B\u8BB0\u7684\u8FD0\u884C\u670D\u52A1\u5C1A\u672A\u542F\u52A8\u6216\u5DF2\u7ECF\u505C\u6B62\u3002\u8BF7\u5230\u6E90\u7801\u6807\u7B7E\u68C0\u67E5\u72B6\u6001\u4E0E\u65E5\u5FD7\u3002" } };
            return { ...tab, url: run.url, error: null };
          } catch (e) {
            return { ...tab, error: { code: e.code, message: e.message } };
          }
        }
        if (tab.type === "system") {
          try {
            const system = await invoke("system.get", { systemId: tab.systemId, version:tab.systemVersion });
            const version = system.versions.find((v) => v.version === tab.systemVersion);
            if (!version) throw errorValue("\u56FA\u5B9A\u89C4\u8303\u7248\u672C\u5DF2\u5931\u6548", "REFERENCE_STALE");
            return { ...tab, content: JSON.stringify(version, null, 2), readonly: true, error: null };
          } catch (e) {
            return { ...tab, error: { code: e.code, message: e.message }, readonly: true };
          }
        }
        if (tab.type === "attachment") {
          try {
            return { ...tab, ...await invoke("attachment.get", { projectId: id, receiptId: tab.receiptId }), readonly: true };
          } catch (e) {
            return { ...tab, error: { code: e.code, message: e.message }, readonly: true };
          }
        }
        if (tab.type !== "file") return tab;
        try {
          const file = await invoke("file.read", { projectId: id, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId });
          const draft = await invoke("draft.get", { projectId: id, resourceId: tab.resourceId });
          draftVersions.current.set(tab.id, draft.version ?? null);
          const hasDraft = !!draft.draft || tab.dirty && tab.content !== void 0;
          return { ...tab, ...file, id: tab.id, type: "file", resourceId: tab.resourceId, content: hasDraft ? draft.draft?.content ?? tab.content : file.content ?? file.text ?? "", dirty: hasDraft, nextOffset: hasDraft ? null : file.nextOffset, baseVersion: draft.draft?.baseVersion ?? tab.baseVersion, conflict: file.externallyModified || hasDraft && tab.version !== file.version ? { remoteContent: file.content ?? file.text ?? "", remoteVersion: file.version } : void 0, version: hasDraft ? tab.version : file.version, draftVersion: draft.version ?? null, error: null, permissionReadonly: !!file.readonly, readonly: !!(tab.readonly || file.readonly) };
        } catch (e) {
          return { ...tab, error: { code: e.code, message: e.message, details: e.details }, readonly: true };
        }
      }) };
      if (seq !== loadSequence.current) return;
      const initial=canvasFirstState(id,next.designs||[],next.pages||[],restoredTabs,state);
      dispatch({ type: "restore", state: initial.tabs });
      setDesignId(initial.design?.id||null);
      setTarget({projectId:id,designId:initial.design?.id,pageId:initial.tab?.activePageId||undefined,scope:state.target?.readonlyChoice?'read':initial.design?'design':'read',readonlyChoice:!!state.target?.readonlyChoice});
      setReferences(state.references || []);
      setSelection(initial.tab?.selection || null);

      setDevice(state.device || "responsive");
      setCustomViewport(state.customViewport || { width: 1280, height: 800 });
      setNav("files");
      setNavWidth(panelWidth(state.navWidth, 320, 480, 320));
      setNavigationViews(state.navigationViews||{});
      setNavOpen(false);setAiOpen(true);
      restoreGuard.current = true;

    }
    return next;
  }, [invoke]);
  const sessionTargets = JSON.stringify(opened.map((id) => {
    const p = library.projects.find((p2) => p2.id === id);
    return p?.aiSessionId ? [id, p.aiSessionId] : null;
  }).filter(Boolean));
  React.useEffect(() => {
    if (!ctx?.sessions) return;
    let live = true;
    const cleanup = [];
    for (const [id, sessionId] of JSON.parse(sessionTargets)) {
      const controller = new AbortController();
      let reference, unsubscribe = () => {
      }, pending = false, again = false, wasRunning = false;
      const update = async () => {
        if (!live) return;
        if (pending) {
          again = true;
          return;
        }
        pending = true;
        try {
          const next = await invoke("ai.status", { projectId: id });
          if (!live) return;
          setProjectRuns((s) => ({ ...s, [id]: next }));
          if (wasRunning && !next.running) {
            if (projectRef.current?.id === id) await loadWorkspace(id);
            await refreshLibrary();
          }
          wasRunning = !!next.running;
        } catch (e) {
          if (live) setError(e);
        } finally {
          pending = false;
          if (again) {
            again = false;
            update();
          }
        }
      };
      cleanup.push(() => {
        controller.abort();
        unsubscribe();
        reference?.release();
      });
      (async () => {
        await update();
        reference = await acquireProjectSession(ctx.sessions, sessionId, controller.signal);
        if (!live) {
          reference.release();
          return;
        }
        const binding2 = await reference.ready;
        if (!live) return;
        unsubscribe = binding2.session.subscribe(update);
        update();
      })().catch((e) => {
        if (live && !controller.signal.aborted) setError(e);
      });
    }
    return () => {
      live = false;
      cleanup.forEach((fn) => fn());
    };
  }, [sessionTargets, ctx, invoke, loadWorkspace, refreshLibrary]);
  const captureState = () => ({ tabs: tabRef.current.items, activeTabId: tabRef.current.activeId, designId: design?.id, target, references, selection, device, customViewport, nav, navWidth, navOpen, aiOpen, navigationViews });
  const flushView = async () => {
    for (const controller of canvasControllers.current.values()) await controller.flush();
    if (projectId && project && restoreGuard.current) {
      const state = captureState();
      sessionViews.current.set(projectId, state);
      saveQueue.current = saveQueue.current.catch(() => {
      }).then(async () => {
        const r = await invoke("workspace.state.save", { projectId, state: compactState(state), expectedVersion: viewVersions.current[projectId] ?? null });
        viewVersions.current[projectId] = r.version ?? null;
      });
      await saveQueue.current;
    }
    for (const [id, timer] of draftTimers.current) {
      clearTimeout(timer);
      draftTimers.current.delete(id);
      const tab = tabRef.current.items.find((t2) => t2.id === id);
      if (tab?.dirty) await persistDraft(tab);
    }
    await Promise.all([...draftQueues.current.values()].map((p) => p.catch(() => {
    })));
  };
  const openProject = async (id) => {
    const epoch=++navigationEpoch.current;
    if(projectId===id&&screen==='project'&&workspace&&!projectLoadErrors[id])return workspace;
    const listed = library.projects.find((p) => p.id === id);
    if (listed?.unavailable) {
      setError(listed.error || errorValue("\u6B64\u9879\u76EE\u6682\u4E0D\u53EF\u8BBF\u95EE", "PROJECT_UNAVAILABLE"));
      return;
    }
    if (projectId !== id || screen !== "project") {
      try {
        await flushView();
      } catch (e) {
        setError(e);
        return;
      }
    }
    if(epoch!==navigationEpoch.current)return;
    setError(null);
    resourceOpenSequence.current++;
    if (projectId !== id) {
      dispatch({ type: "restore", state: emptyTabs });
      setTarget(null);
      setSelection(null);
      setReferences([]);
    }
    setProjectId(id);
    dispatchWorkspaceTabs({type:'open',tab:projectWorkspaceTab(listed||workspaces[id]?.project||{id,name:'正在加载项目…'})});
    setOpened((o) => o.includes(id) ? o : [...o, id]);
    setBusy(true);
    setAiOpen(true);
    setProjectLoadErrors(values=>({...values,[id]:null}));
    restoreGuard.current = false;
    try {
      const next=await loadWorkspace(id, { restore: true });
      if(epoch!==navigationEpoch.current||!next)return;
      dispatchWorkspaceTabs({type:'rename-project',projectId:id,name:next.project.name});
      setRecentVisits(recordRecentProjectVisit(localStorageOrNull(),library.root,id));
      return next;
    } catch (e) {
      if(epoch===navigationEpoch.current){setProjectLoadErrors(values=>({...values,[id]:e}));setError(e);}
    } finally {
      if(epoch===navigationEpoch.current)setBusy(false);
    }
  };
  projectOpenHandler.current=openProject;
  React.useEffect(() => {
    if (!projectId || !project || !restoreGuard.current) return;
    const timer = setTimeout(() => {
      const state = { tabs: tabs.items, activeTabId: tabs.activeId, designId: design?.id, target, references, selection, device, customViewport, nav, navWidth, navOpen, aiOpen, navigationViews };
      saveQueue.current = saveQueue.current.catch(() => {
      }).then(async () => {
        const r = await invoke("workspace.state.save", { projectId, state: compactState(state), expectedVersion: viewVersions.current[projectId] ?? null });
        viewVersions.current[projectId] = r.version ?? null;
      }).catch(setError);
    }, 500);
    return () => clearTimeout(timer);
  }, [projectId, tabs, design?.id, target, references, selection, device, customViewport, nav, navWidth, navOpen, aiOpen, navigationViews]);
  React.useEffect(() => {
    if (!project || !design) return;
    let live = true;
    const requested = design.binding?.mode === "independent" ? design.binding : { mode: design.binding?.mode || "inherit", systemId: project.systemId, version: project.systemVersion };
    setBinding({ ...requested, source: "\u8BFB\u53D6\u4E2D" });
    invoke("binding.resolve", { projectId: project.id, designId: design.id }).then((r) => {
      if (live) setBinding(r.effectiveBinding || r.binding || r);
    }).catch((e) => {
      if (live) {
        setBinding({ ...requested, source: "\u7ED1\u5B9A\u5931\u6548", invalid: true });
        setError(e);
      }
    });
    return () => live = false;
  }, [project?.id, design?.id, project?.revision]);
  React.useEffect(() => {
    if (project && active?.type === "canvas") ensurePages(project.id, [active.activePageId, ...active.view?.visiblePageIds || []]).catch(setError);
  }, [project?.id, project?.revision, active?.id, active?.activePageId, (active?.view?.visiblePageIds || []).join("|"), ensurePages]);
  const refreshRenderablePages = async () => {
    const id = projectRef.current?.id;
    if (!id) return;
    setWorkspaces((w) => w[id] ? { ...w, [id]: { ...w[id], documents: Object.fromEntries(Object.entries(w[id].documents || {}).map(([pageId, doc]) => [pageId, { ...doc, _revision: null }])) } } : w);
    const tab = tabRef.current.items.find((t2) => t2.id === tabRef.current.activeId);
    if (tab?.type === "canvas") await ensurePages(id, [tab.activePageId, ...tab.view?.visiblePageIds || []], true);
  };
  uploadRefresh.current = async (result, args = {}) => {
    if (args.projectId && args.projectId !== projectRef.current?.id) return;
    await refreshRenderablePages();
    const fileId = result?.fileId || result?.file?.id;
    const tab = tabRef.current.items.find((t2) => t2.type === "file" && t2.resourceId === fileId);
    if (tab) await refreshFile(tab);
  };
  const mutate = async (action, args = {}, reload = true) => {
    setBusy(true);
    setError(null);
    try {
      const p = projectRef.current;
      const result = await invoke(action, { projectId: p?.id, ...p ? { expectedRevision: p.revision } : {}, ...args });
      if (action === "asset.replace") await uploadRefresh.current?.(result, { ...args, projectId: p?.id });
      try {
        if (reload && p) await loadWorkspace(p.id);
        await refreshLibrary();
      } catch (refreshError) {
        setError(errorValue("\u64CD\u4F5C\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u754C\u9762\u5237\u65B0\u5931\u8D25\uFF1A" + refreshError.message, "REFRESH_FAILED", { cause: refreshError.code }));
      }
      return result;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const updateTab = (id, patch) => dispatch({ type: "update", id, patch });
  const activateTab = (id) => {
    const selectedTab=tabRef.current.items.find(t=>t.id===id);
    setResourceVisible(selectedTab?.type!=="canvas"&&!selectedTab?.canvasWorkflow);
    dispatch({ type: "activate", id });
    const tab = tabRef.current.items.find((t2) => t2.id === id);
    if (tab?.type === "canvas") {
      setDesignId(tab.designId);
      setSelection(tab.selection || null);
    } else if(tab?.canvasWorkflow){
      setDesignId(tab.designId);setSelection(null);
      setTarget(previous=>({projectId:projectRef.current?.id,designId:tab.designId,scope:previous?.readonlyChoice?'read':'design',readonlyChoice:!!previous?.readonlyChoice}));
    }
  };
  const openResource = async (file, keep = false) => {
    if (!project) return;
    setResourceVisible(true);
    setNavOpen(false);
    const request = ++resourceOpenSequence.current;
    const editorNavigation=Number.isFinite(file.view?.line)?{id:crypto.randomUUID(),line:file.view.line,column:file.view.column||0}:undefined;
    let resourceId = file.fileId || file.id || file.path, id = resourceKey(project.id, { id: resourceId, type: "file" });
    if (tabRef.current.items.some((t2) => t2.id === id)) {
      dispatch({ type: "open", tab: { id }, keep });
      if(editorNavigation)updateTab(id,{editorNavigation,mode:'source'});
      return;
    }
    setBusy(true);
    try {
      const value = await invoke("file.read", { projectId: project.id, sourceId: file.sourceId, ...file.path ? { path: file.path } : { fileId: resourceId } });
      if (request !== resourceOpenSequence.current) return;
      resourceId = value.fileId || value.id || resourceId;
      id = resourceKey(project.id, { id: resourceId, type: "file" });
      if (tabRef.current.items.some((t2) => t2.id === id)) {
        dispatch({ type: "open", tab: { id }, keep });
        if(editorNavigation)updateTab(id,{editorNavigation,mode:'source'});
        return;
      }
      const draft = await invoke("draft.get", { projectId: project.id, resourceId }).catch((e) => {
        if (e.code === "NOT_FOUND") return {};
        throw e;
      });
      if (request !== resourceOpenSequence.current) return;
      const saved = draft.draft;
      draftVersions.current.set(id, draft.version ?? null);
      dispatch({ type: "open", keep: keep || !!saved, tab: { ...file, ...value, id, resourceId, type: "file", name: file.name || value.path?.split("/").pop() || resourceId, path: value.path || file.path, content: saved?.content ?? value.content ?? value.text ?? "", dirty: !!saved, nextOffset: saved ? null : value.nextOffset, version: saved?.baseVersion ?? value.version, conflict: value.externallyModified || saved?.baseVersion && saved.baseVersion !== value.version ? { remoteContent: value.content ?? value.text ?? "", remoteVersion: value.version, remoteNextOffset: value.nextOffset } : void 0, draftVersion: draft.version ?? null, view: saved?.view || file.view || {}, editorNavigation, mode: editorNavigation?'source':saved?.mode, readonly: !!(file.readonly || value.readonly), viewerReadonly: !!file.readonly && !value.readonly, permissionReadonly: !!value.readonly, projectId: project.id } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const openCanvas = (page, keep = false, savedDesign) => {
    if (!project) return;
    setResourceVisible(false);
    resourceOpenSequence.current++;
    const d = savedDesign || designs.find((d2) => d2.id === page.designId || d2.pageIds?.includes(page.id)) || design;
    setDesignId(d?.id);
    const id = resourceKey(project.id, { id: d?.id || "default", type: "canvas" });
    dispatch({ type: "open", keep, tab: { id, type: "canvas", resourceId: d?.id || "default", designId: d?.id, name: d?.name || "\u8BBE\u8BA1\u753B\u5E03", activePageId: page.id, view: {} } });
    updateTab(id, { activePageId: page.id,selection:null });
    setTarget(previous=>({projectId:project.id,designId:d?.id,pageId:page.id,scope:previous?.readonlyChoice?"read":"page",readonlyChoice:!!previous?.readonlyChoice}));
    setSelection(null);
  };
  const canTargetResource = (tab) => {
    if (tab.permissionReadonly ?? tab.readonly) return false;
    if (!tab.sourceId) return true;
    const source = project?.workbench?.sourceProjects?.find((s) => s.id === tab.sourceId && !s.removedAt);
    return !!source && (source.writable === true || source.readonly === false) && (!source.writablePaths?.length || source.writablePaths.some((path) => tab.path === path || tab.path.startsWith(path + "/")));
  };
  const setResourceTarget = (tab) => {
    try {
      if (tab.permissionReadonly ?? tab.readonly) throw errorValue("\u6B64\u8D44\u6E90\u7684\u5B9E\u9645\u6743\u9650\u4E3A\u53EA\u8BFB\uFF0C\u53EA\u80FD\u4F5C\u4E3A\u53C2\u8003", "READONLY");
      if (tab.sourceId) {
        const source = project.workbench?.sourceProjects?.find((s) => s.id === tab.sourceId && !s.removedAt);
        if (!source || source.writable !== true && source.readonly !== false) throw errorValue("\u6B64\u6E90\u7801\u767B\u8BB0\u672A\u6388\u6743\u5199\u5165", "SOURCE_READONLY");
        if (source.writablePaths?.length && !source.writablePaths.some((path) => tab.path === path || tab.path.startsWith(path + "/"))) throw errorValue("\u8BE5\u8DEF\u5F84\u4E0D\u5728\u5DF2\u6388\u6743\u7684\u6E90\u7801\u76EE\u5F55\u5185", "SOURCE_WRITE_SCOPE");
        setTarget({ projectId: project.id, type: "source-file", sourceId: tab.sourceId, resourceId: tab.resourceId, path: tab.path, scope: "read", readonlyChoice:true });
      } else setTarget({ projectId: project.id, designId: tab.designId, type: "file", fileId: tab.resourceId, resourceId: tab.resourceId, path: tab.path, scope: "project", allowedPaths: [tab.path] });
      setAiOpen(true);
    } catch (e) {
      setError(e);
    }
  };
  const addReference = (ref) => setReferences((items) => items.some((r) => JSON.stringify(r) === JSON.stringify(ref)) ? items : [...items, { projectId: project.id, ...ref }]);
  const locate = async (ref) => {
    try {
      if (ref.receiptId) {
        const attachment = await invoke("attachment.get", { projectId: project.id, receiptId: ref.receiptId });
        openContent("attachment", { ...attachment, resourceId: ref.receiptId, receiptId: ref.receiptId, name: attachment.name || ref.file?.name || ref.label || "\u9644\u4EF6", readonly: true });
        return;
      }
      if (ref.type === "source-region" || ref.kind === "source-region") {
        await invoke("workbench.source.read", { projectId: project.id, sourceId: ref.sourceId, versionId: ref.sourceVersion, captureId: ref.captureId });
        openContent("source", { sourceId: ref.sourceId, designId: ref.designId, referenceToLocate: { ...ref, locateNonce: Date.now() } });
        return;
      }
      if (ref.type === "system") {
        const system = await invoke("system.get", { systemId: ref.systemId, version:ref.version });
        const version = system.versions.find((v) => v.version === ref.version);
        if (!version) throw errorValue("\u6B64\u56FA\u5B9A\u89C4\u8303\u7248\u672C\u5DF2\u5931\u6548", "REFERENCE_STALE");
        openContent("system", { resourceId: `${ref.systemId}:v${ref.version}`, name: system.name, readonly: true, systemId: ref.systemId, systemVersion: ref.version, path: `systems/${system.name}.json`, content: JSON.stringify(version, null, 2) });
        return;
      }
      if (ref.sourceId && ref.path) {
        const file = await invoke("file.read", { projectId: project.id, sourceId: ref.sourceId, path: ref.path });
        if (ref.sourceVersion && file.version !== ref.sourceVersion) throw errorValue("\u6E90\u7801\u5F15\u7528\u7248\u672C\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F53\u524D\u6587\u4EF6", "REFERENCE_STALE");
        await openResource({ ...file, sourceId: ref.sourceId, id: file.fileId, readonly: true }, true);
        return;
      }
      if(ref.pageId&&(ref.sourceLocator||ref.objects?.some(object=>object.sourceLocator))){const object=ref.objects?.find(item=>item.sourceLocator)||ref,locator=object.sourceLocator,checked=await invoke('framework.element.get',{projectId:project.id,pageId:ref.pageId,path:locator.path,nodeId:locator.id,expectedSourceHash:locator.sourceHash});if((ref.artifact||object.artifact)?.buildId!==checked.artifact.buildId)throw errorValue('引用的源码构建已更新，请重新拾取元素。','REFERENCE_STALE');const page=pages.find(item=>item.id===ref.pageId);if(!page)throw errorValue('引用的页面已不存在。','REFERENCE_MISSING');const previousTarget=target;openCanvas(page,true);setTarget(previousTarget);const ownerDesign=designs.find(item=>item.id===page.designId),canvasId=resourceKey(project.id,{type:'canvas',id:ownerDesign?.id||'default'}),controller=canvasControllers.current.get(canvasId);if(controller?.locate)await controller.locate(ref);else pendingLocate.current={tabId:canvasId,reference:ref};return;}
      const normalized = { ...ref, resourceId: ref.resourceId || ref.pageId, nodeId: ref.nodeId || ref.nodeIds?.[0] };
      const r = await invoke("reference.resolve", { projectId: ref.projectId || project.id, reference: normalized });
      if (r.valid === false || r.status === "missing" || r.status === "stale") throw errorValue(r.message || "\u5F15\u7528\u5DF2\u5931\u6548\uFF0C\u8D44\u6E90\u88AB\u5220\u9664\u6216\u7248\u672C\u5DF2\u53D8\u5316", "REFERENCE_STALE", r);
      if (ref.pageId || r.pageId || r.page?.id) {
        for (const nodeId of (ref.nodeIds || []).slice(1)) await invoke("reference.resolve", { projectId: project.id, reference: { ...normalized, nodeId } });
        const page = pages.find((p) => p.id === (r.pageId || r.page?.id || ref.pageId));
        if (!page) throw errorValue("\u5F15\u7528\u7684\u9875\u9762\u5DF2\u4E0D\u5B58\u5728", "REFERENCE_MISSING");
        const previousTarget = target;
        openCanvas(page, true);
        setTarget(previousTarget);
        const locatedSelection = ref.nodeIds?.length ? { pageId: page.id, nodeIds: ref.nodeIds } : null;
        setSelection(locatedSelection);
        const ownerDesign = designs.find((d) => d.id === page.designId || d.pageIds?.includes(page.id)) || design;
        const canvasId = resourceKey(project.id, { type: "canvas", id: ownerDesign?.id || "default" });
        updateTab(canvasId, { selection: locatedSelection });
        const controller = canvasControllers.current.get(canvasId);
        if (controller?.locate) await controller.locate({ ...ref, pageId: page.id });
        else pendingLocate.current = { tabId: canvasId, reference: { ...ref, pageId: page.id } };
      } else {
        await openResource({ ...r.file, ...!r.file ? ref : {}, id: r.file?.id || ref.resourceId, readonly: true }, true);
        if (ref.pageNumber) {
          const id = resourceKey(project.id, { type: "file", id: r.file?.id || ref.resourceId });
          updateTab(id, { view: { ...tabRef.current.items.find((t2) => t2.id === id)?.view || {}, page: ref.pageNumber } });
        }
      }
    } catch (e) {
      setError(e);
    }
  };
  const saveTab = async (tab) => {
    if (!tab.dirty) return;
    if (tab.readonly) throw errorValue("\u53EA\u8BFB\u8D44\u6E90\u65E0\u6CD5\u4FDD\u5B58", "READONLY");
    if (tab.conflict || tab.externallyModified) throw errorValue("\u8D44\u6E90\u5B58\u5728\u5916\u90E8\u53D8\u5316\uFF0C\u8BF7\u5148\u6BD4\u8F83\u5E76\u660E\u786E\u91C7\u7528\u3001\u4FDD\u7559\u6216\u5408\u5E76", "EXTERNAL_RECONCILIATION_REQUIRED");
    if (tab.nextOffset != null) throw errorValue("\u8BF7\u5148\u5B8C\u6574\u52A0\u8F7D\u6587\u4EF6\u518D\u4FDD\u5B58\uFF0C\u907F\u514D\u8986\u76D6\u672A\u8BFB\u53D6\u5185\u5BB9", "PARTIAL_RESOURCE");
    if (/\.svg$/i.test(tab.path || tab.name || "")) {
      const parsed = new DOMParser().parseFromString(tab.content || "", "image/svg+xml");
      if (parsed.querySelector("parsererror")) throw errorValue("SVG \u7ED3\u6784\u65E0\u6548\uFF0C\u8BF7\u4FEE\u590D\u6E90\u7801\u540E\u4FDD\u5B58", "INVALID_SVG");
    }
    setStatus((s) => ({ ...s, save: "\u4FDD\u5B58\u4E2D\u2026" }));
    try {
      clearTimeout(draftTimers.current.get(tab.id));
      draftTimers.current.delete(tab.id);
      await draftQueues.current.get(tab.id)?.catch(() => {
      });
      const p = projectRef.current;
      const result = await invoke("file.write", { projectId: p.id, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId, content: tab.content, expectedRevision: p.revision, expectedVersion: tab.version });
      const currentTab = tabRef.current.items.find((t2) => t2.id === tab.id) || tab, unchanged = currentTab.content === tab.content, nextVersion = result.version ?? result.file?.version ?? result.outcome?.version;
      updateTab(tab.id, { dirty: !unchanged, version: nextVersion, path: result.file?.path || tab.path, preview: false, ...(unchanged&&typeof result.sourceContent==='string'?{content:result.sourceContent}:{}) });
      const draftVersion = draftVersions.current.get(tab.id) ?? tab.draftVersion ?? null;
      if (unchanged && draftVersion !== null) await invoke("draft.remove", { projectId: p.id, resourceId: tab.resourceId, expectedVersion: draftVersion });
      if (unchanged) {
        draftVersions.current.set(tab.id, null);
        updateTab(tab.id, { draftVersion: null });
      } else {
        clearTimeout(draftTimers.current.get(tab.id));
        draftTimers.current.delete(tab.id);
        await persistDraft({ ...currentTab, version: nextVersion });
      }
      if (result.project) {
        projectRef.current = result.project;
        setWorkspaces((w) => ({ ...w, [p.id]: { ...w[p.id], project: result.project } }));
      } else if (result.projectRevision) {
        const updated = { ...p, revision: result.projectRevision };
        projectRef.current = updated;
        setWorkspaces((w) => ({ ...w, [p.id]: { ...w[p.id], project: updated } }));
      }
      if (!tab.sourceId && /\.(?:html?|css|m?js|jsx|tsx?|vue|svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf)$/i.test(tab.path || "")) await refreshRenderablePages();
      setStatus((s) => ({ ...s, save: unchanged ? "\u5DF2\u4FDD\u5B58" : "\u65B0\u7F16\u8F91\u5C1A\u672A\u4FDD\u5B58" }));
      if (!unchanged) throw errorValue("\u4FDD\u5B58\u671F\u95F4\u6709\u65B0\u7684\u7F16\u8F91\uFF0C\u5DF2\u4FDD\u7559\u65B0\u8349\u7A3F\u3002\u8BF7\u518D\u4FDD\u5B58\u4E00\u6B21\u3002", "NEWER_DRAFT");
      return result;
    } catch (e) {
      setStatus((s) => ({ ...s, save: "\u4FDD\u5B58\u5931\u8D25" }));
      throw e;
    }
  };
  const closeTab = async (id) => {
    const tab = tabRef.current.items.find((t2) => t2.id === id);
    if (!tab) return true;
    if (tab.type === "canvas") {
      try {
        await flushCanvas(id);
      } catch (e) {
        setError(e);
        return false;
      }
    }
    if (tab.dirty) {
      try {
        await saveTab(tab);
      } catch (e) {
        setCloseFailure({ tab, error: e });
        return false;
      }
    }
    dispatch({ type: "close", id });
    return true;
  };
  const closeMany = async (id, mode2) => {
    setTabMenu(null);
    for (const candidate of closeCandidates(tabRef.current, id, mode2)) {
      if (!await closeTab(candidate)) break;
    }
  };
  const flushCanvas = async (id = tabs.activeId) => {
    const controller = canvasControllers.current.get(id);
    if (controller) await controller.flush();
  };
  const saveAll = async () => {
    setError(null);
    try {
      for (const controller of canvasControllers.current.values()) await controller.flush();
      for (const tab of tabRef.current.items) await saveTab(tab);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  const persistDraft = (tab) => {
    const ownerId = tab.projectId || projectId;
    const previous = draftQueues.current.get(tab.id) || Promise.resolve();
    const pending = previous.catch(() => {
    }).then(async () => {
      const r = await invoke("draft.save", { projectId: ownerId, resourceId: tab.resourceId, expectedVersion: draftVersions.current.has(tab.id) ? draftVersions.current.get(tab.id) : tab.draftVersion ?? null, draft: { content: tab.content, view: tab.view, mode: tab.mode, baseVersion: tab.version } });
      draftVersions.current.set(tab.id, r.version ?? null);
      updateTab(tab.id, { draftVersion: r.version ?? null });
    });
    draftQueues.current.set(tab.id, pending);
    pending.catch(setError);
    return pending;
  };
  const onFileUpdate = (tab, patch) => {
    updateTab(tab.id, patch);
    if (patch.dirty || tab.dirty && patch.content !== void 0) {
      clearTimeout(draftTimers.current.get(tab.id));
      const value = { ...tab, ...patch, projectId };
      draftTimers.current.set(tab.id, setTimeout(() => {
        draftTimers.current.delete(tab.id);
        persistDraft(value);
      }, 500));
    }
  };
  const refreshFile = async (tab) => {
    try {
      const value = await invoke("file.read", { projectId, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId });
      if (tab.dirty && value.version !== tab.version || value.externallyModified) updateTab(tab.id, { conflict: { remoteContent: value.content ?? value.text ?? "", remoteVersion: value.version }, permissionReadonly: !!value.readonly });
      else if (!tab.dirty) updateTab(tab.id, { ...value, type: "file", content: value.content ?? value.text ?? "", error: null, permissionReadonly: !!value.readonly, readonly: !!value.readonly || !!tab.viewerReadonly });
      return value;
    } catch (e) {
      updateTab(tab.id, { readonly: true, error: { code: e.code, message: e.message, details: e.details } });
      throw e;
    }
  };
  const reconcileFile = async (mode2, tab, content) => {
    const ownerId=tab.projectId||projectId;
    const cachedProject=workspacesRef.current[ownerId]?.project;
    const activeProject=projectRef.current?.id===ownerId?projectRef.current:null;
    const ownerProject=activeProject&&(!cachedProject||activeProject.revision>=cachedProject.revision)?activeProject:cachedProject;
    if(!ownerProject)throw errorValue('所属项目尚未加载，请重新打开项目后协调。','PROJECT_UNAVAILABLE');
    const ownerRevision=ownerProject.revision;
    if (tab.readonly) throw errorValue("\u53EA\u8BFB\u5F15\u7528\u4E0D\u80FD\u534F\u8C03\u4E3A\u53EF\u5199\u5185\u5BB9", "READONLY");
    if (tab.nextOffset != null && mode2 !== "adopt-external") throw errorValue("\u8BF7\u5B8C\u6574\u52A0\u8F7D\u6587\u4EF6\u540E\u518D\u4FDD\u7559\u6216\u5408\u5E76", "PARTIAL_RESOURCE");
    updateTab(tab.id,{reconciling:true});
    try {
    clearTimeout(draftTimers.current.get(tab.id));
    draftTimers.current.delete(tab.id);
    await draftQueues.current.get(tab.id)?.catch(() => {
    });
    const result = await invoke("file.reconcile", { projectId: ownerId, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId, expectedProjectRevision: ownerRevision, expectedVersion: tab.conflict?.remoteVersion || tab.version, mode: mode2, content: mode2 === "adopt-external" ? void 0 : content, localContent: tab.content });
    if(result.identityReset||result.invalidatedReferences){
      const ownerPages=workspacesRef.current[ownerId]?.pages||[];
      const affected=ownerPages.filter(page=>page.id===result.pageId||page.id===result.page?.id||page.id===result.file?.pageId||page.htmlFileId===tab.resourceId||page.htmlPath===tab.path);
      const pageIds=(affected.length?affected:ownerPages).map(page=>page.id);
      const designIds=[...new Set((affected.length?affected:ownerPages).map(page=>page.designId).filter(Boolean))];
      setWorkspaces(values=>values[ownerId]?{...values,[ownerId]:{...values[ownerId],documents:Object.fromEntries(Object.entries(values[ownerId].documents||{}).map(([id,doc])=>[id,pageIds.includes(id)?{...doc,_revision:null,_identityInvalid:true}:doc]))}}:values);
      if(projectRef.current?.id===ownerId){
        const scope={pageIds,designIds,resourceId:tab.resourceId};
        const reset=invalidateIdentityState({tabs:tabRef.current.items,target:null,references:[]},scope);
        for(const next of reset.tabs)if(next.type==='canvas')updateTab(next.id,{selection:next.selection});
        setTarget(current=>invalidateIdentityState({tabs:[],target:current,references:[]},scope).target);
        setReferences(current=>invalidateIdentityState({tabs:[],target:null,references:current},scope).references);setSelection(value=>pageIds.includes(value?.pageId)?null:value);
        if(pageIds.includes(pendingLocate.current?.reference?.pageId))pendingLocate.current=null;
        for(const controller of canvasControllers.current.values())await Promise.resolve(controller.invalidateIdentity?.({pageIds,reason:'IDENTITY_REBUILT',projectId:ownerId})).catch(setError);
        setError(errorValue('受控节点身份已重建，旧选区已清除，旧引用需要重新验证。','IDENTITY_REBUILT',{pageIds}));
        setStatus(value=>({...value,preview:'重新读取节点身份'}));
      }
      await ensurePages(ownerId,pageIds,true);
    }
    const current = await invoke("file.read", { projectId: ownerId, fileId: result.fileId || tab.resourceId, path: result.file?.path || tab.path, sourceId: tab.sourceId });
    updateTab(tab.id, { ...current, type: "file", resourceId: result.fileId || tab.resourceId, path: current.path, content: current.content ?? current.text ?? "", dirty: false, conflict: void 0, externallyModified: false, version: current.version });
    const draftVersion = draftVersions.current.get(tab.id) ?? tab.draftVersion ?? null;
    if (draftVersion !== null) await invoke("draft.remove", { projectId: ownerId, resourceId: tab.resourceId, expectedVersion: draftVersion });
    draftVersions.current.set(tab.id, null);
    updateTab(tab.id, { draftVersion: null });
    if (projectRef.current?.id===ownerId && !tab.sourceId && /\.(?:html?|css|m?js|jsx|tsx?|vue|svg|png|jpe?g|webp|gif|avif|woff2?|ttf|otf)$/i.test(current.path || tab.path || "")) await refreshRenderablePages();
    if(projectRef.current?.id===ownerId)setStatus((s) => ({ ...s, save: "\u5DF2\u534F\u8C03\u5E76\u4FDD\u5B58\u65B0\u7248\u672C" }));
    return result;
    } finally {updateTab(tab.id,{reconciling:false});}
  };
  const fileHistoryAction = async (action, tab, args = {}) => {
    if (tab.sourceId && action === "restore") {
      const historical = await invoke("file.read", { projectId: projectRef.current.id, sourceId: tab.sourceId, path: tab.path, revisionId: args.revisionId });
      if (historical.nextOffset != null) throw errorValue("\u6B64\u4FDD\u5B58\u70B9\u9700\u8981\u5B8C\u6574\u8BFB\u53D6\u540E\u518D\u6062\u590D", "PARTIAL_RESOURCE");
      return reconcileFile("keep-local", tab, historical.content ?? historical.text ?? "");
    }
    if (tab.dirty) {
      const saved = await saveTab(tab);
      tab = { ...tab, version: saved.version ?? saved.file?.version, dirty: false };
    }
    const p = projectRef.current, result = await invoke("file." + action, { projectId: p.id, fileId: tab.resourceId, path: tab.path, expectedRevision: p.revision, expectedVersion: tab.version, ...args });
    if (result.project) {
      projectRef.current = result.project;
      setWorkspaces((w) => ({ ...w, [p.id]: { ...w[p.id], project: result.project } }));
    }
    await refreshFile({ ...tab, dirty: false, path: result.file?.path || tab.path });
    await loadWorkspace(p.id);
  };
  const canvasChange = async (change) => {
    try {
      const transaction = canvasTransaction(change, { project: projectRef.current, design, pages, documents });
      let result;
      if(change.runtimeStyle){
        const model=documents[change.pageId];
        if(!model||model.version!==transaction.expectedVersion)throw Error('页面已更新，请重新选择元素。');
        const {selector,styles}=change.runtimeStyle;
        const html=applyRuntimeStyle(model.savedHTML??model.html,selector,styles);
        result=await mutate('artboard.commit',{artboardId:change.pageId,html,summary:change.summary,expectedVersion:transaction.expectedVersion,expectedRevision:transaction.expectedRevision,expectedArtboardRevision:transaction.expectedArtboardRevision},false);
      }else result=await mutate("edit.apply",transaction,false);
      setWorkspaces((w) => ({ ...w, [project.id]: { ...w[project.id], project: result.project || w[project.id].project, documents: { ...w[project.id].documents, [change.pageId]: result.document || result } } }));
      setStatus((s) => ({ ...s, save: "\u5DF2\u4FDD\u5B58", validation: (result.diagnostics || []).some((d) => d.severity === "error") ? "\u5B58\u5728\u9519\u8BEF" : "\u901A\u8FC7", preview: "\u5DF2\u66F4\u65B0" }));
      return result;
    } catch (e) {
      setStatus((s) => ({ ...s, save: "\u4FDD\u5B58\u5931\u8D25" }));
      throw e;
    }
  };
  const openContent = (type, values = {}) => {
    setResourceVisible(true);
    resourceOpenSequence.current++;
    const resourceId = values.resourceId || values.sourceId || values.designId || design?.id || "project", id = resourceKey(projectId, { id: resourceId, type });
    dispatch({ type: "open", keep: true, tab: { ...values, id, type, resourceId, name: values.name || (type === "source" ? "\u6765\u6E90\u4E0E\u5BF9\u6BD4" : type === "runtime" ? "\u6E90\u7801\u4E0E Git" : "\u8FD0\u884C\u9884\u89C8") } });
    if (tabRef.current.items.some((t2) => t2.id === id)) updateTab(id, values);
  };
  const navigateWorkspace=async tab=>{
    if(!tab||appTabsRef.current.activeId===tab.id)return;
    if(tab.kind==='project')return openProject(tab.projectId);
    const epoch=++navigationEpoch.current;
    try{
      if(screen==='project')await flushView();
      if(epoch!==navigationEpoch.current)return;
      loadSequence.current++;resourceOpenSequence.current++;
      dispatchWorkspaceTabs({type:'open',tab});setError(null);
    }catch(e){setError(e);}
  };
  const navigate=id=>{
    if(id==='projects')setGroup('all');
    return navigateWorkspace(globalWorkspaceTab(id));
  };
  const openProjectSettings=(record,focusSync=false)=>navigateWorkspace({...projectSettingsTab(record),focusSync});
  const withSettingsGuard=(ids,proceed)=>{
    if(ids.some(value=>settingsGuards.current.get(value)?.isBusy())){setError(errorValue('正在保存设置，请稍候再关闭。','SETTINGS_BUSY'));return;}
    const id=ids.find(value=>settingsGuards.current.get(value)?.isDirty());
    if(!id){proceed();return;}
    const guard=settingsGuards.current.get(id);
    setSettingsDecision({id,guard,proceed:()=>withSettingsGuard(ids.filter(value=>value!==id),proceed)});
  };
  const closeWorkspaceTab=id=>{
    const tab=appTabsRef.current.items.find(item=>item.id===id);
    if(!tab||tab.closable===false)return;
    withSettingsGuard([id],async()=>{
      try{
        if(tab.kind==='project'&&tab.projectId===projectId){if(!await saveAll())return;await flushView();}
        const before=appTabsRef.current,next=workspaceTabsReducer(before,{type:'close',id});
        dispatchWorkspaceTabs({type:'close',id});
        if(tab.kind==='project')setOpened(values=>values.filter(value=>value!==tab.projectId));
        if(before.activeId===id){const selected=next.items.find(item=>item.id===next.activeId);if(selected?.kind==='project')await openProject(selected.projectId);}
      }catch(e){setError(e);}
    });
  };
  const exitWorkbench=()=>{if(projectActionLocks.current.size){setError(errorValue('项目操作正在进行，请完成后再退出。','PROJECT_BUSY'));return;}return withSettingsGuard(appTabsRef.current.items.map(item=>item.id),async()=>{
    try{if(!await saveAll())return;await flushView();onExit?.();}catch(e){setError(e);}
  });};
  const pickDirectory=async()=>{
    try{
      if(projectActionLocks.current.size)throw errorValue('项目操作正在进行，请完成后再切换目录。','PROJECT_BUSY');
      const directory=await ctx.uiWorkspace.pickDirectory();
      if(directory){await invoke('root.set',{root:directory});await refreshLibrary();}
    }catch(e){setError(e);}
  };
  const onProjectCardAction=async(action,record,values={})=>{
    const id=record.id;
    if(projectActionLocks.current.has(id))throw errorValue('项目操作正在进行，请稍候。','PROJECT_BUSY');
    const settings=settingsGuards.current.get(`project-settings:${id}`);
    if(settings?.isBusy?.()||settings?.isDirty?.())throw errorValue('此项目的设置仍有未保存的更改，请先回到设置标签保存。','SETTINGS_DIRTY');
    projectActionLocks.current.add(id);
    let committed=false;
    try{
      if(projectRef.current?.id===id){if(!await saveAll())throw errorValue('请先处理未保存的资源。','SAVE_FAILED');await flushView();}
      const result=await projectCardAction(invoke,action,id,values);committed=true;
      if(action==='rename'||action==='move')setProjectSettingsRefresh(state=>({...state,[id]:(state[id]||0)+1}));
      if(action==='delete'){
        setOpened(list=>list.filter(value=>value!==id));
        dispatchWorkspaceTabs({type:'remove-project',projectId:id});
        setLibrary(state=>({...state,projects:state.projects.filter(p=>p.id!==id)}));
      }else if(action==='clone'&&result.project){
        setLibrary(state=>({...state,projects:[result.project,...state.projects.filter(p=>p.id!==result.project.id)]}));
      }else if(action==='rename')dispatchWorkspaceTabs({type:'rename-project',projectId:id,name:result.project?.name||values.name.trim()});
      try{await refreshLibrary();}catch(refreshError){setError(errorValue('项目操作已完成，但列表暂未刷新，请稍后刷新页面。','LIST_REFRESH_FAILED',refreshError));}
      return result;
    }catch(failure){if(!committed)await refreshLibrary().catch(()=>{});throw failure;}
    finally{projectActionLocks.current.delete(id);}
  };
  const projectUnavailable=async id=>{
    setOpened(values=>values.filter(value=>value!==id));
    dispatchWorkspaceTabs({type:'remove-project',projectId:id});
    await refreshLibrary();
  };
  const startFromHome=async (prompt,options={})=>{
    if(homeSubmission.current)return;
    homeSubmission.current=true;setHomeBusy(true);setHomeError(null);setHomeResult(null);
    try{
      let prepared;
      const submitApi=(action,args={})=>invoke(action,{...args,...(options.sessionId?{contextSessionId:options.sessionId}:{})});
      const result=await startHomeDesign(submitApi,prompt,{...options,checkpoint:homeCheckpoint.current,onCheckpoint:value=>{homeCheckpoint.current=value;},onPrepared:async value=>{prepared=value;}});
      // Acknowledgement precedes navigation: failed admission keeps the home draft
      // and its native receipts visible, and no canvas owner races the CAS queue.
      await refreshLibrary();
      if(prepared){
        if(appTabsRef.current.activeId==='home'){
          const openedWorkspace=await projectOpenHandler.current(prepared.projectId);
          if(openedWorkspace){setDesignId(prepared.designId);setTarget(prepared.target);setAiOpen(true);}
          else setError(errorValue('任务已提交，但工作区未能打开，请从项目列表进入。','WORKSPACE_OPEN_FAILED'));
        }else{
          dispatchWorkspaceTabs({type:'open',activate:false,tab:projectWorkspaceTab(prepared.project)});
          setOpened(values=>values.includes(prepared.projectId)?values:[...values,prepared.projectId]);
        }
      }
      setHomeDraft('');setHomeComposeOptions({references:[],attachments:[],systemChoice:null,sessionId:null});setHomeResult(result);homeCheckpoint.current=null;await refreshLibrary();
    }catch(e){setHomeError(e);setError(e);if(homeCheckpoint.current?.projectId)await refreshLibrary().catch(()=>{});throw e;}
    finally{homeSubmission.current=false;setHomeBusy(false);}
  };
  const showForm = (type, values = {}) => {
    if(type==='newDesign'){beginCanvasDesign();return;}
    if(type==='project'&&values.projectId){openProjectSettings({...values,id:values.projectId});return;}
    if (project && ["source", "runtime"].includes(type)) {
      openContent(type, values);
      return;
    }
    setModal({ type, ...type === "binding" ? { bindingMode: design?.binding?.mode || "inherit", systemId: binding?.systemId || "", version: binding?.version, bindingScope: "design" } : {}, ...values });
  };
  const exitProject = async () => {
    if (!await saveAll()) return;
    try {
      await flushView();
      dispatchWorkspaceTabs({type:'open',tab:globalWorkspaceTab('projects')});
    } catch (e) {
      setError(e);
    }
  };
  const resizeNav = (e) => {
    const start = e.clientX, width = navWidth, node = e.currentTarget;
    node.setPointerCapture(e.pointerId);
    const move = (ev) => setNavWidth(Math.max(320, Math.min(480, width + ev.clientX - start)));
    const done = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", done);
      node.removeEventListener("pointercancel", done);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", done);
    node.addEventListener("pointercancel", done);
  };
  const shellNavigation=[{id:'home',label:'首页',icon:'home'},{id:'projects',label:'项目',icon:'folder'},{id:'systems',label:'设计体系',icon:'palette'},{id:'knowledge',label:'知识库',icon:'knowledge'},{id:'skills',label:'技能库',icon:'skill'},{id:'settings',label:'设置',icon:'settings',bottom:true}];
  const settingsTabs=appTabs.items.filter(item=>item.kind==='project-settings');
  const isActiveProject=id=>projectRef.current?.id===id&&appTabsRef.current.activeId===`project:${id}`;
  const currentCanvasTab=project&&design?tabs.items.find(t=>t.type==='canvas'&&t.designId===design.id):null;
  const canvasPageId=currentCanvasTab?.activePageId||orderedDesignPages(pages,design)[0]?.id;
  const canvasSourceTabs=tabs.items.filter(t=>t.type==='source'&&t.canvasWorkflow&&t.projectId===projectId&&designs.some(d=>d.id===t.designId));
  const currentSourceTab=canvasSourceTabs.find(t=>t.id===tabs.activeId);
  const resourceTabs=tabs.items.filter(t=>t.type!=='canvas'&&!t.canvasWorkflow);
  const switchCanvasDesign=async id=>{
    const owner=projectRef.current?.id,sequence=++designSwitch.current;
    try{
      if(!owner||!await saveAll())return;
      await flushView();
      if(sequence!==designSwitch.current||!isActiveProject(owner))return;
      const w=currentWorkspace.current,d=w?.designs?.find(item=>item.id===id);
      if(!d)return;
      const old=tabRef.current.items.find(t=>t.type==='canvas'&&t.designId===id),next=designCanvasTab(owner,d,w.pages,old);
      resourceOpenSequence.current++;setDesignId(id);setSelection(null);setResourceVisible(false);
      dispatch({type:'open',keep:true,tab:next});updateTab(next.id,{...next});
      setTarget(previous=>({projectId:owner,designId:id,pageId:next.activePageId||undefined,scope:previous?.readonlyChoice?'read':'design',readonlyChoice:!!previous?.readonlyChoice}));
    }catch(failure){setError(failure);}
  };
  const beginCanvasDesign=async()=>{
    const owner=projectRef.current?.id;
    try{if(!owner||!await saveAll())return;await flushView();if(isActiveProject(owner))setNewDesignProjectId(owner);}catch(failure){setError(failure);}
  };
  const openCanvasSource=async provider=>{
    const owner=projectRef.current?.id,d=design,sequence=++designSwitch.current;
    try{
      if(!owner||!d||!await saveAll())return;await flushView();
      if(!isActiveProject(owner)||sequence!==designSwitch.current)return;
      const fresh=sourceCanvasTab(owner,d,provider),previous=tabRef.current.items.find(tab=>tab.id===fresh?.id),tab=sourceCanvasTab(owner,d,provider,previous);if(!tab)return;
      setNavOpen(false);setResourceVisible(false);setSelection(null);setAiOpen(true);
      dispatch({type:'open',keep:true,tab});setTarget(previous=>({projectId:owner,designId:d.id,scope:previous?.readonlyChoice?'read':'design',readonlyChoice:!!previous?.readonlyChoice}));
    }catch(failure){setError(failure);}
  };
  const switchCanvasSource=async id=>{
    const owner=projectRef.current?.id,sequence=++designSwitch.current;
    try{if(!owner||!await saveAll())return;await flushView();if(isActiveProject(owner)&&sequence===designSwitch.current)activateTab(id);}catch(failure){setError(failure);}
  };
  const closeCanvasSource=async id=>{
    const selected=tabRef.current.activeId===id;
    if(await closeTab(id)&&selected){setResourceVisible(false);const canvas=tabRef.current.items.find(tab=>tab.type==='canvas'&&tab.designId===designId);if(canvas)dispatch({type:'activate',id:canvas.id});}
  };
  const addCanvasPage=async()=>{
    if(pageCreation.current||!project||!design)return;
    const owner=project.id,d=design;pageCreation.current=true;
    const own=orderedDesignPages(currentWorkspace.current?.pages||[],d),position=own.length?{x:Math.max(...own.map(p=>(p.position?.x||0)+(p.viewport?.width||(d.platform==='mobile'?390:1440))))+120,y:0}:{x:0,y:0};
    try{const result=await mutate('page.create',{designId:d.id,name:'新画板',position,viewport:d.platform==='mobile'?{width:390,height:844}:{width:1440,height:1000}});if(isActiveProject(owner)&&result.page){openCanvas(result.page,true);requestAnimationFrame(()=>canvasControllers.current.get(resourceKey(owner,{type:'canvas',id:d.id}))?.fit?.());}}
    catch(failure){setError(failure);}finally{pageCreation.current=false;}
  };
  const openProjectFiles=kind=>{setNav(kind||'files');setNavOpen(true);};
  const projectOpenItems=screen==='project'&&project?[
    {id:'files',label:'项目文件',icon:'folder',onSelect:()=>openProjectFiles('files')},
    {id:'requirements',label:'项目需求',icon:'book',onSelect:()=>project.workbench?.requirementsPath&&openResource({path:project.workbench.requirementsPath,name:'requirements.md'},true)},
    {id:'new-design',label:'新建设计稿',icon:'plus',onSelect:beginCanvasDesign},
    ...designs.map(d=>({id:d.id,label:d.name,icon:'layers',onSelect:()=>switchCanvasDesign(d.id)})),
    {id:'project-settings',label:'项目设置',icon:'settings',onSelect:()=>openProjectSettings(project)},
  ]:[];
  const renderCanvas=tab=><div className="wb-resource">{design?.websiteReplica?.recordingKey&&<div className="wb-resource-bar"><select aria-label="录制的页面" value={tab.activePageId} onChange={e=>openCanvas(pages.find(p=>p.id===e.target.value),true,design)}>{orderedDesignPages(pages,design).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}<ErrorBox error={documents[tab.activePageId]?.error} /><Canvas compactChrome onCaptureBusy={setCapturing} onFrozenChange={setCanvasFrozen} onToolChange={setCanvasTool} onCreatePage={addCanvasPage} onController={(controller) => {
    if (controller) {
      canvasControllers.current.set(tab.id, controller);
      if (pendingLocate.current?.tabId === tab.id) {
        const reference = pendingLocate.current.reference;
        pendingLocate.current = null;
        Promise.resolve(controller.locate?.(reference)).catch(setError);
      }
    } else canvasControllers.current.delete(tab.id);
  }} ctx={ctx} api={invoke} project={project} design={designs.find((d) => d.id === tab.designId) || design} pages={orderedDesignPages(pages,designs.find(d=>d.id===tab.designId)||design)} documents={documents} activePageId={tab.activePageId} selection={tab.selection || null} mode="edit" scene={tab.scene} viewState={{ ...tab.view, device, viewport: device === "custom" ? customViewport : device === "mobile" ? { width: 390, height: 844 } : device === "tablet" ? { width: 768, height: 1024 } : device === "desktop" ? { width: 1440, height: 900 } : void 0 }} onSelect={(pageOrSelection, value, meta) => {
    const legacySelection = typeof pageOrSelection === 'string';
    const s = legacySelection ? {pageId:pageOrSelection,...value} : pageOrSelection;
    const provenance = legacySelection ? meta : value;
    setSelection(s);
    if(canvasTool==='pick'&&s?.objects?.length)setAiOpen(true);
    updateTab(tab.id, {selection:s});
    setTarget(old=>targetFromSelection(old,s,{source:provenance?.source||'view',forceSelection:canvasTool==='pick'&&provenance?.source==='user',projectId:project.id,designId:tab.designId,pageId:s?.pageId||tab.activePageId,defaultScope:'design'}));
  }} onNavigate={(id) => updateTab(tab.id, { activePageId: typeof id === "string" ? id : id.pageId })} onChange={canvasChange} onViewState={(view) => {const {navigation,locateSelection,...savedView}=view;if(navigation==='layers'){setNav('layers');setNavOpen(true);if(locateSelection)setSelection(locateSelection);}updateTab(tab.id,{view:{...tab.view,...savedView}});}} onReference={addReference} onDiagnostics={(d) => {
    const incoming=Array.isArray(d)?d:d?[d]:[];
    setDiagnostics(previous=>Array.isArray(d)?incoming:[...previous,...incoming].slice(-200));
    setStatus(s=>({...s,validation:incoming.some(item=>item.severity==='error')?'存在错误':Array.isArray(d)?'通过':s.validation,preview:d?.previewStatus==='ready'?'已加载保存版本 · 交互待核对':d?.previewStatus||s.preview}));
  }} readonly={!!documents[tab.activePageId]?._identityInvalid||(tab.view?.visiblePageIds||[]).some(id=>documents[id]?._identityInvalid)} onInspect={legacy.onInspect} /></div>;
  const renderResource=tab=>tab.type === "source" ? <div style={{ display:"flex", minHeight:0, flex:1, overflow: tab.provider==='website'?"hidden":"auto", padding: tab.provider==='website'?0:20, width: "100%" }}><SourcePanel key={`${project.id}:${tab.designId}:${tab.id}`} api={invoke} project={project} design={designs.find((d) => d.id === tab.designId) || design} provider={tab.provider} activePanel={tabs.activeId===tab.id} onOpenReplica={(page,created)=>openCanvas(page,true,created)} initialSourceId={tab.sourceId} referenceToLocate={tab.referenceToLocate} viewState={tab.view} onViewState={(view) => updateTab(tab.id, { view: { ...tab.view, ...view } })} legacy={legacy} t={t} mutate={mutate} onReference={addReference} selection={selection} /></div> : tab.type === "runtime" ? <div style={{ overflow: "auto", padding: 20, width: "100%" }}><RuntimePanel viewState={tab.view} onViewState={view=>updateTab(tab.id,{view:{...tab.view,...view}})} api={invoke} project={project} mutate={mutate} onStatus={setStatus} onOpenFile={openResource} onOpenRuntime={(r) => openContent("runPreview", { ...r, resourceId: r.id })} /></div> : tab.type === "runPreview" ? <div className="wb-resource"><ErrorBox error={tab.error} />{tab.url ? <><div className="wb-resource-bar"><span className="wb-grow wb-ellipsis">{tab.url}</span><a href={tab.url} target="_blank" rel="noopener noreferrer">外部打开 ↗</a></div><iframe className="wb-document-frame" title={tab.name} src={tab.url} sandbox="allow-scripts allow-forms allow-popups" /></> : <Empty title="运行服务不可用"><Button onClick={() => showForm("runtime")}>检查源码、运行状态与日志</Button></Empty>}</div> : <ResourceView tab={tab} api={invoke} projectId={projectId} onOpenFile={openResource} onRefresh={tab.type === "attachment" ? async (item) => updateTab(item.id, { ...await invoke("attachment.get", { projectId, receiptId: item.receiptId }), error: null }) : refreshFile} onHistoryAction={fileHistoryAction} onReconcile={reconcileFile} onSetTarget={setResourceTarget} canSetTarget={canTargetResource(tab)} onAssetAction={async (action, item) => {
    if (action === "replace") {
      showForm("file", { path: item.path, fileId: item.resourceId, replace: true, fileAction: "asset" });
      return;
    }
    try {
      const r = await mutate("asset.copy", { fileId: item.resourceId, path: item.path });
      if (r.file) await openResource(r.file, true);
    } catch {
    }
  }} onUpdate={(patch) => onFileUpdate(tab, patch)} onSave={(tab2) => saveTab(tab2).catch(setError)} onReference={addReference} />;
  return <div data-theme={theme} className={`wb wb-v2 ${focus ? "wb-focus" : ""} ${fullscreen ? "wb-fullscreen" : ""}`}><ToastProvider><style>{styles+refinedStyles+themeStyles}</style>
    <WorkbenchShell pluginVersion={library.pluginVersion} sidebarVisible={screen!=='project'||projectSidebarOpen} onToggleSidebar={screen==='project'?()=>setProjectSidebarOpen(v=>!v):undefined} openItems={projectOpenItems} theme={theme} onToggleTheme={()=>setTheme(value=>value==='dark'?'light':'dark')}
      navigation={shellNavigation} activeNavigationId={screen==='project'||screen==='project-settings'||screen==='manager'?'projects':activeAppTab.id}
      onNavigate={navigate}
      tabs={appTabs.items.map(item=>({...item,running:item.kind==='project'&&projectRuns[item.projectId]?.running}))} activeTabId={appTabs.activeId}
      onSelectTab={id=>navigateWorkspace(appTabsRef.current.items.find(item=>item.id===id))} onCloseTab={closeWorkspaceTab} onExit={exitWorkbench}>
      <ErrorToast error={error} onClose={dismissed=>setError(current=>current===dismissed?null:current)}/>
      {library.errors?.length>0&&screen!=='project'&&<details className="wb-library-warning"><summary>部分条目暂不可用（{library.errors.length}）</summary>{library.errors.map((entry,index)=><p className="wb-muted" key={index}>{entry.kind} · {entry.id} · {entry.error?.message}</p>)}</details>}
        <div className="wb-management wb-persistent-page" style={{display:screen==='knowledge'?'block':'none'}}><KnowledgePanel NativeFileTree={legacy?.NativeKnowledgeTree} key={library.root||'default-library'} api={invoke} library={library} onPickDirectory={()=>ctx.uiWorkspace.pickDirectory()} onRefresh={refreshLibrary} registerGuard={guard=>{settingsGuards.current.set('knowledge',guard);return()=>{if(settingsGuards.current.get('knowledge')===guard)settingsGuards.current.delete('knowledge');};}}/></div>
        {['systems','skills'].map(kind=>{const Panel=kind==='systems'?SystemLibrary:LibraryPanel;return <div key={kind} className={`wb-management wb-persistent-page ${kind==='systems'?'wb-spec-management':''}`} style={{display:screen===kind?'block':'none'}}><Panel kind={kind} api={invoke} library={library} onRefresh={refreshLibrary} registerGuard={guard=>{settingsGuards.current.set(kind,guard);return()=>{if(settingsGuards.current.get(kind)===guard)settingsGuards.current.delete(kind);};}}/></div>;})}
        <div className="wb-management wb-persistent-page wb-project-management" style={{display:screen==='manager'?'flex':'none'}}>
          <ProjectManagerPanel previewApi={projectPreviewApi} onProjectAction={onProjectCardAction} library={library} api={invoke} onRefresh={refreshLibrary} group={group} onGroupChange={setGroup} query={managerQuery} onQueryChange={setManagerQuery} onOpenProject={openProject}
            onProjectSettings={record=>showForm('project',{...record,projectId:record.id})} onManageGroup={record=>showForm('group',record)}
            registerGuard={guard=>{settingsGuards.current.set('projects',guard);return()=>{if(settingsGuards.current.get('projects')===guard)settingsGuards.current.delete('projects');};}}/>
        </div>
        {settingsTabs.map(item=><div key={`${item.id}:${projectSettingsRefresh[item.projectId]||0}`} className="wb-management wb-persistent-page" style={{display:activeAppTab.id===item.id?'block':'none'}}><ProjectSettingsPanel projectId={item.projectId} focusSync={!!item.focusSync} api={invoke} groups={library.groups} onOpenProject={openProject}
          registerGuard={guard=>{settingsGuards.current.set(item.id,guard);return()=>{if(settingsGuards.current.get(item.id)===guard)settingsGuards.current.delete(item.id);};}}
          onSaved={async record=>{dispatchWorkspaceTabs({type:'rename-project',projectId:record.id,name:record.name});const previous=workspacesRef.current[record.id]?.project;if(projectRef.current?.id===record.id){const imported=record.workbench?.sync?.portablePrefix!==previous?.workbench?.sync?.portablePrefix;if(imported){sessionViews.current.set(record.id,{tabs:[],references:[]});await loadWorkspace(record.id,{restore:true,invalidateDocuments:true});}else await loadWorkspace(record.id);}await refreshLibrary();}}
          onBeforeChange={async id=>{if(id===projectId){if(!await saveAll())return false;await flushView();}return true;}} onUnavailable={projectUnavailable}/></div>)}
      {screen!=='project'?<main className={`wb-management ${screen==='home'?'wb-home-management':''}`} style={{display:['home','settings'].includes(screen)?undefined:'none'}}>
        {screen==='home'&&<HomePanel api={homeApi} previewApi={projectPreviewApi} ctx={legacy?.nativeContext||ctx} nativeAccess={legacy?.nativeAccess} systems={library.systems||[]} allProjects={library.projects||[]} composeOptions={homeComposeOptions} onComposeOptionsChange={setHomeComposeOptions} groups={library.groups} onProjectAction={onProjectCardAction} recentProjects={getRecentProjects(library.projects,recentVisits)} draft={homeDraft} onDraftChange={setHomeDraft} onStart={startFromHome} onOpenProject={openProject} busy={homeBusy} error={homeError}/>}
        {screen==='settings'&&<SettingsPanel api={invoke} theme={theme} onThemeChange={setTheme} library={library} onPickDirectory={pickDirectory} onExit={exitWorkbench}/>}
</main> : <ProjectCanvasLayout onZoom={canvasPageId?action=>canvasControllers.current.get(currentCanvasTab?.id)?.changePreviewZoom(action):undefined} capturing={capturing} onScreenshot={canvasPageId?()=>canvasControllers.current.get(currentCanvasTab?.id)?.screenshot():undefined} conversationLayout={conversationLayout} onConversationWidthChange={setConversationWidth} designs={designs} designId={design?.id} workflowTabs={canvasSourceTabs} activeWorkflowId={currentSourceTab?.id} onSelectWorkflow={switchCanvasSource} onCloseWorkflow={closeCanvasSource} conversationOpen={aiOpen} onOpenConversation={()=>setAiOpen(true)} onSelectDesign={switchCanvasDesign} onCreateDesign={beginCanvasDesign} onImportDesign={()=>openCanvasSource('mastergo')} onReplicateWebsite={()=>openCanvasSource('website')} navOpen={navOpen} onToggleFiles={()=>{setNav('files');setNavOpen(v=>!v);}} tool={canvasTool} onTool={tool=>{setCanvasTool(tool);canvasControllers.current.get(currentCanvasTab?.id)?.setTool?.(tool);}} frozen={canvasFrozen} onFreeze={canvasPageId?()=>canvasControllers.current.get(currentCanvasTab?.id)?.toggleFreeze().catch(setError):undefined} busy={busy||!project}
        navigation={navOpen&&<aside className="wb-navigation" style={{width:navWidth}} aria-label="项目文件面板"><div className="wb-nav-body"><Navigation viewState={navigationViews.files||{}} onViewState={view=>setNavigationViews(values=>({...values,files:view}))} nav="files" workspace={workspace} design={design} query="" active={currentCanvasTab||active} selection={selection} onOpen={async(file,keep)=>{
          const page=!file.sourceId&&pages.find(item=>item.htmlPath===file.path&&!item.deletedAt);
          if(page&&!keep){if(await saveAll()){openCanvas(page,true);setNavOpen(false);}return;}
          return openResource(file,keep);
        }} onPage={openCanvas} onReference={addReference} onSelect={(s) => {
    setSelection(s);
    if (currentCanvasTab) updateTab(currentCanvasTab.id, { selection: s });
    setResourceVisible(false);
    Promise.resolve(canvasControllers.current.get(currentCanvasTab?.id)?.locate?.(s)).catch(setError);
    setTarget((old) => targetFromSelection(old, s, { source: "user", projectId: project.id, designId: currentCanvasTab?.designId, pageId: s.pageId, defaultScope:'design' }));
  }} onForm={showForm} mutate={mutate} onOperation={(change) => {
    const controller = canvasControllers.current.get(active?.id);
    Promise.resolve(controller?.applyOperations ? controller.applyOperations(change) : canvasChange(change)).catch(setError);
  }} /></div><div role="separator" aria-orientation="vertical" aria-label="导航宽度" tabIndex={0} className="wb-resizer" onPointerDown={resizeNav} onKeyDown={e=>{if(e.key==='ArrowLeft')setNavWidth(w=>Math.max(320,w-10));if(e.key==='ArrowRight')setNavWidth(w=>Math.min(480,w+10));}}/></aside>} conversation={aiOpen&&project&&target?<AIPanel layout={conversationLayout.mode} onLayoutChange={setConversationMode} projects={library.projects||[]} knowledge={library.knowledge||[]} systems={library.systems||[]} nativeAccess={legacy?.nativeAccess} key={project.id} refreshToken={homeResult?.projectId===project.id?homeResult.result?.requestId:null} ctx={ctx} api={invoke} legacy={legacy} project={project} activeDesignId={design?.id||null} design={designs.find((d) => d.id === target.designId)} designs={designs} files={flattenFiles(workspace?.files || [])} pages={pages} target={target} canvasSelection={selection} onClearSelection={ids=>canvasControllers.current.get(currentCanvasTab?.id)?.removeSelectionElements?.(Array.isArray(ids)?ids:[ids])} onTarget={value=>{if(isActiveProject(project.id))setTarget(value);}} binding={binding} references={references} onReferences={value=>{if(isActiveProject(project.id))setReferences(value);}} onLocate={value=>{if(isActiveProject(project.id))locate(value);}} onError={value=>{if(isActiveProject(project.id))setError(value);}} onCompleted={() => {
    if(isActiveProject(project.id))loadWorkspace(project.id).catch(setError);
    refreshLibrary().catch(setError);
  }} onHide={() => setAiOpen(false)} />:aiOpen?<div className="wb-canvas-loading-conversation" aria-label="AI 设计助手"><strong>✧ AI 设计助手</strong><span>{projectLoadErrors[projectId]?'项目加载失败，重新加载后恢复对话。':'正在连接项目对话…'}</span>{projectLoadErrors[projectId]&&<Button onClick={()=>openProject(projectId)}>重新加载项目</Button>}</div>:null}>
        <div className="wb-canvas-surface"><div style={{display:currentSourceTab?'none':'flex',flex:1,minWidth:0,minHeight:0}}>{currentCanvasTab&&Canvas?renderCanvas(currentCanvasTab):<EmptyCanvas key={projectId} loading={busy&&!projectLoadErrors[projectId]} error={projectLoadErrors[projectId]} onRetry={()=>openProject(projectId)}/>}</div>{canvasSourceTabs.map(tab=><div key={tab.id} className="wb-canvas-workflow" role="tabpanel" aria-label={tab.name} hidden={currentSourceTab?.id!==tab.id} style={{display:currentSourceTab?.id===tab.id?'flex':'none'}}>{renderResource(tab)}</div>)}</div>
        {resourceVisible&&resourceTabs.length>0&&<section className="wb-resource-window" aria-label="项目资源窗口"><header className="wb-resource-window-head"><div className="wb-tab-scroll" role="tablist" aria-label="项目资源">{resourceTabs.map(tab=><div role="tab" aria-selected={tabs.activeId===tab.id} className="wb-content-tab" key={tab.id}><button className="wb-tab-name" onClick={()=>activateTab(tab.id)}>{tab.name}{tab.dirty?' ●':''}</button><button aria-label={'关闭 '+tab.name} onClick={()=>closeTab(tab.id)}>×</button></div>)}</div><Button aria-label="关闭资源窗口，返回预览" onClick={()=>setResourceVisible(false)}><Icon name="x" size={16}/></Button></header><div className="wb-tabpanel">{resourceTabs.map(tab=><div key={tab.id} hidden={active?.id!==tab.id} data-resource-id={tab.id} style={{display:active?.id===tab.id?'flex':'none',flex:1,minWidth:0,minHeight:0}}>{renderResource(tab)}</div>)}</div></section>}
      </ProjectCanvasLayout>}</WorkbenchShell>{newDesignProjectId&&<CanvasDesignDialog key={newDesignProjectId} projectId={newDesignProjectId} api={invoke} onClose={()=>setNewDesignProjectId(null)} onCreated={async({design:created})=>{const owner=newDesignProjectId;if(isActiveProject(owner)){const next=await loadWorkspace(owner);if(isActiveProject(owner)){const d=next?.designs?.find(item=>item.id===created.id);if(!d)throw errorValue('设计稿已创建，但列表未刷新，请重试。');const tab=designCanvasTab(owner,d,next.pages);setDesignId(d.id);dispatch({type:'open',keep:true,tab});setResourceVisible(false);setSelection(null);setTarget({projectId:owner,designId:d.id,pageId:tab.activePageId,scope:'design'});}}await refreshLibrary();}}/>}{modal && <WorkbenchDialogs key={`${modal.type}:${modal.projectId || modal.designId || modal.page?.id || ""}`} ctx={ctx} modal={modal} setModal={setModal} project={project} design={design} designs={designs} pages={pages} selection={selection} library={library} workspace={workspace} api={invoke} mutate={mutate} refreshLibrary={refreshLibrary} onOpenProject={openProject} onOpenFile={openResource} onOpenContent={openContent} onOpenReplica={(page,created)=>openCanvas(page,true,created)} onBeforeProjectExit={async () => {
    if (!await saveAll()) return false;
    await flushView();
    return projectRef.current || true;
  }} onProjectUnavailable={projectUnavailable} onTarget={setTarget} onReference={addReference} legacy={legacy} t={t} diagnostics={diagnostics} onStatus={setStatus} onError={setError} />} {settingsDecision&&<Modal title="还有未保存的更改" onClose={()=>!settingsDecision.busy&&setSettingsDecision(null)}><div className="wb-stack"><p>此标签中还有未保存的内容，请先处理这些更改。</p><ErrorBox error={settingsDecision.error}/><div className="wb-row" style={{flexWrap:'wrap'}}><Button disabled={settingsDecision.busy} onClick={()=>setSettingsDecision(null)}>继续编辑</Button><span className="wb-grow"/><Button disabled={settingsDecision.busy} onClick={()=>{const decision=settingsDecision;decision.guard.discard();setSettingsDecision(null);decision.proceed();}}>放弃更改并继续</Button><Button primary disabled={settingsDecision.busy} onClick={async()=>{const decision=settingsDecision;if(decision.guard.manual){setSettingsDecision(null);await navigateWorkspace(appTabsRef.current.items.find(item=>item.id===decision.id)||globalWorkspaceTab(decision.id));decision.guard.inspect?.();return;}setSettingsDecision(value=>({...value,busy:true}));try{await decision.guard.save();setSettingsDecision(null);decision.proceed();}catch(e){setSettingsDecision({...decision,error:e,busy:false});}}}>{settingsDecision.busy?'正在保存…':settingsDecision.guard.manual?'查看草稿':'保存并继续'}</Button></div></div></Modal>}{closeFailure && <Modal title="保存失败，标签页仍保持打开" onClose={() => setCloseFailure(null)}><div className="wb-stack"><ErrorBox error={closeFailure.error} /><p>{closeFailure.tab.name} 的更改尚未保存。保留草稿可以稍后继续。</p><Button primary onClick={async () => {
    try {
      await saveTab(closeFailure.tab);
      dispatch({ type: "close", id: closeFailure.tab.id });
      setCloseFailure(null);
    } catch (e) {
      setCloseFailure((v) => ({ ...v, error: e }));
    }
  }}>重试保存并关闭</Button><Button onClick={() => setCloseFailure(null)}>继续保留标签页</Button><Button onClick={async () => {
    try {
      const version = draftVersions.current.get(closeFailure.tab.id) ?? closeFailure.tab.draftVersion ?? null;
      if (version !== null) await invoke("draft.remove", { projectId, resourceId: closeFailure.tab.resourceId, expectedVersion: version });
      dispatch({ type: "close", id: closeFailure.tab.id });
      setCloseFailure(null);
    } catch (e) {
      setCloseFailure((v) => ({ ...v, error: e }));
    }
  }}>明确放弃未保存更改</Button></div></Modal>}</ToastProvider></div>;
}
function Navigation({ viewState,onViewState,nav, workspace, design, query, active, selection, onOpen, onPage, onReference, onSelect, onForm, mutate, onOperation }) {
  const project = workspace?.project, files = flattenFiles(workspace?.files || []), pages = workspace?.pages || [], match = (s) => String(s || "").toLowerCase().includes(query.toLowerCase());
  const layerRoot=React.useRef(null);
  React.useEffect(()=>{if(nav!=='layers'||!layerRoot.current)return;const id=selection?.nodeIds?.[0];if(!id)return;const node=[...layerRoot.current.querySelectorAll('[data-layer-id]')].find(node=>node.dataset.layerId===id);if(!node)return;let ancestor=node.parentElement;while(ancestor&&ancestor!==layerRoot.current){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}node.scrollIntoView({block:'nearest',inline:'nearest'});},[nav,active?.activePageId,selection?.nodeIds?.join('|'),workspace?.documents?.[active?.activePageId]]);
  if (!project) return <p className="wb-muted" role="status">正在读取项目文件…</p>;
  if (nav === "pages") return <div className="wb-tree">{(workspace?.designs || []).map((d) => <details open key={d.id} onDragOver={(e) => {
    if (e.dataTransfer.types.includes("application/x-wb-design")) e.preventDefault();
  }} onDrop={(e) => {
    const id = e.dataTransfer.getData("application/x-wb-design");
    if (!id) return;
    e.preventDefault();
    const ids = workspace.designs.map((v) => v.id).filter((v) => v !== id);
    ids.splice(ids.indexOf(d.id), 0, id);
    mutate("design.reorder", { ids }).catch(() => {
    });
  }}><summary draggable onDragStart={(e) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/x-wb-design", d.id);
  }}>{d.name} <span className="wb-muted">{d.binding?.mode === "independent" ? "\u72EC\u7ACB\u89C4\u8303" : d.binding?.mode === "none" ? "\u65E0\u89C4\u8303" : "\u7EE7\u627F"}</span></summary><div>{orderedDesignPages(pages,d).filter((p) => match(p.name)).map((p) => <div className="wb-row" key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("application/x-wb-page", p.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-wb-page");
    const ids = reorderPageBefore(orderedDesignPages(pages,d),id,p.id);
    if(!ids)return;
    e.stopPropagation();
    mutate("page.reorder", { designId: d.id, ids }).catch(() => {
    });
  }}><button className="wb-nav-item" aria-current={active?.activePageId === p.id} onClick={() => onPage(p)} onDoubleClick={() => onPage(p, true)}><span>▧ {p.name}</span></button><Button aria-label={"\u9875\u9762\u64CD\u4F5C " + p.name} onClick={() => onForm("page", { page: p, designId: d.id })}>⋯</Button></div>)}<Button onClick={() => onForm("page", { designId: d.id })}>＋ 页面</Button><Button onClick={() => onForm("design", { ...d, designId: d.id })}>设置</Button></div></details>)}</div>;
  if (nav === "layers") {
    const pageId = active?.activePageId, doc = workspace?.documents?.[pageId];
    const fullTree = doc?._identityInvalid?[]:Array.isArray(doc?.tree) ? doc.tree : doc?.tree ? [doc.tree] : [];
    const findBody = (list2) => {
      for (const node of list2) {
        if (String(node.tag || node.tagName || "").toLowerCase() === "body") return node;
        const body2 = findBody(node.children || []);
        if (body2) return body2;
      }
      return null;
    };
    const body = findBody(fullTree), nonVisual = /* @__PURE__ */ new Set(["head", "meta", "style", "script", "title", "link", "base", "template"]);
    const projectTree = (list2) => list2.flatMap((node) => {
      const tag = String(node.tag || node.tagName || "").toLowerCase();
      if (nonVisual.has(tag)) return [];
      if (tag === "html") return projectTree(node.children || []);
      const children = projectTree(node.children || []);
      if (query && !match(node.name || node.text || tag) && !children.length) return [];
      return [{ ...node, children }];
    });
    const nodes = projectTree(body ? [body] : fullTree);
    const render = (list2, depth = 0) => (Array.isArray(list2) ? list2 : [list2]).filter(Boolean).map((n, i) => {
      const id = n.id || n.nodeId, detail = doc.nodes?.[id] || n, ownLocked = detail.ownLocked ?? n.locked;
      return <details open key={id || i}><summary className="wb-row" style={{ paddingLeft: depth ? 5 : 0 }}>{n.children?.length > 0 && <Button aria-label={"\u5C55\u5F00\u6216\u6298\u53E0 " + n.name} onClick={(e) => {
        e.preventDefault();
        const detail2 = e.currentTarget.closest("details");
        if (detail2) detail2.open = !detail2.open;
      }}>▸</Button>}<button className="wb-nav-item" data-layer-id={id} disabled={n.locked} title={n.locked ? "\u6B64\u56FE\u5C42\u5DF2\u9501\u5B9A\uFF0C\u8BF7\u5148\u660E\u786E\u89E3\u9501" : ""} aria-current={selection?.nodeIds?.includes(id)} onClick={(e) => {
        e.preventDefault();
        onSelect({ pageId, nodeIds: [id] });
      }}><span>{n.children?.length ? "\u25B8 " : ""}{n.tag || n.tagName || n.type} {n.name || n.text?.slice(0, 40)}</span></button><Button aria-label={(n.hidden ? "\u663E\u793A" : "\u9690\u85CF") + "\u56FE\u5C42 " + n.name} disabled={n.locked} title="修改真实内容可见性（不只是工作台辅助隐藏）" onClick={(e) => {
        e.preventDefault();
        onOperation({ pageId, operations: [{ type: "visibility", scope: "instance", nodeIds: [id], hidden: !n.hidden }], summary: n.hidden ? "\u663E\u793A\u56FE\u5C42" : "\u9690\u85CF\u56FE\u5C42" });
      }}>{n.hidden ? "\u25CC" : "\u25C9"}</Button><Button aria-label={(ownLocked ? "\u89E3\u9501" : "\u9501\u5B9A") + "\u56FE\u5C42 " + n.name} disabled={n.locked && !ownLocked} title={n.locked && !ownLocked ? "\u9501\u5B9A\u6765\u81EA\u7236\u56FE\u5C42" : "\u660E\u786E\u4FEE\u6539\u56FE\u5C42\u9501\u5B9A\u72B6\u6001"} onClick={(e) => {
        e.preventDefault();
        onOperation({ pageId, allowUnlock: !!ownLocked, operations: [{ type: "lock", nodeIds: [id], locked: !ownLocked }], summary: ownLocked ? "\u7528\u6237\u89E3\u9501\u56FE\u5C42" : "\u9501\u5B9A\u56FE\u5C42" });
      }}>{n.locked ? "\u25A3" : "\u25AB"}</Button></summary>{n.children && <div style={{ paddingLeft: 10 }}>{render(n.children, depth + 1)}</div>}</details>;
    });
    return nodes.length || nodes.children ? <div className="wb-tree" ref={layerRoot}>{render(nodes)}</div> : <p className="wb-muted">在设计画布选择页面后显示图层。</p>;
  }
  const special = nav === "requirements" ? project?.workbench?.requirementsPath : nav === "rules" ? project?.workbench?.rulesPath : null;
  const list = nav === "references" ? files.filter((f) => f.reference || f.path?.startsWith("references/") || f.path?.startsWith("imports/")) : special ? files.filter((f) => f.path === special) : files;
  return <div className="wb-stack">{special && !list.length && <Button onClick={() => onOpen({ path: special, name: special.split("/").pop() })}>打开 {nav === "requirements" ? "\u9700\u6C42" : "\u89C4\u8303"}文档</Button>}<FileNavigation key={project.id+':'+nav} files={list} query={query} viewState={viewState} onViewState={onViewState} onOpen={(file,keep)=>onOpen(nav==='references'?{...file,readonly:true}:file,keep)} onReference={file=>onReference({type:'file',resourceId:file.fileId||file.id,path:file.path,sourceId:file.sourceId,label:file.name})}/>{nav === "references" && <Button onClick={() => onForm("source")}>来源选择与对比</Button>}{nav === "rules" && <Button onClick={() => onForm("binding")}>设计体系与绑定</Button>}</div>;
}
import WorkbenchDialogs from "./WorkbenchDialogs.jsx";
var stdin_default = Workbench;
export {
  Workbench,
  stdin_default as default
};
