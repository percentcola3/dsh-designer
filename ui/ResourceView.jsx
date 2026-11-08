import React from "react";
import { EditorState, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { MergeView } from "@codemirror/merge";
import { systemLogicalPath } from "./system-resource.js";
import { editorPosition } from "./editor-location.js";
const PDFView=React.lazy(()=>import('./PDFView.jsx'));
class PDFBoundary extends React.Component{
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error){this.props.onError?.(Object.assign(new Error('PDF 阅读器暂不可用，请刷新工作台后重试。'),{code:'PDF_READER_UNAVAILABLE',cause:error}));}
  render(){return this.state.error?<Empty title="PDF 阅读器暂不可用"><p>请刷新工作台后重试，或下载原件查看。</p></Empty>:this.props.children;}
}
import { Button, Empty, ErrorBox, FieldError, downloadValue } from "./common.jsx";
const extensions = (path) => {
  const ext = (path || "").split(".").pop().toLowerCase();
  return ext === "html" || ext === "svg" ? html() : ext === "css" ? css() : ["js", "jsx", "ts", "tsx", "mjs"].includes(ext) ? javascript({ typescript: ["ts", "tsx"].includes(ext), jsx: ["jsx", "tsx"].includes(ext) }) : ext === "md" ? markdown() : ext === "json" ? json() : [];
};
function resourceType(file) {
  const path = (file.path || file.name || "").toLowerCase(), mime = file.mimeType || "";
  if (file.type === "canvas" || file.type === "compare") return file.type;
  if (/\.svg$/.test(path) || mime.includes("svg")) return "svg";
  if (/\.(md|markdown)$/.test(path)) return "markdown";
  if (/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/.test(path) || mime.startsWith("image/")) return "image";
  if (/\.pdf$/.test(path) || mime === "application/pdf") return "pdf";
  if (/\.(mp3|wav|ogg|flac|aac|m4a)$/.test(path) || mime.startsWith("audio/")) return "audio";
  if (/\.(mp4|webm|mov|m4v)$/.test(path) || mime.startsWith("video/")) return "video";
  if (file.type === "binary" || file.binary || mime === "application/octet-stream") return "binary";
  return "text";
}
function restoreSelection(viewState, document) {
  const clamp = (n) => Math.max(0, Math.min(document.length, Number.isFinite(n) ? Math.trunc(n) : 0)), saved = viewState?.selection;
  if (saved?.ranges?.length) {
    const ranges = saved.ranges.map((r) => EditorSelection.range(clamp(r.anchor), clamp(r.head)));
    return EditorSelection.create(ranges, Math.max(0, Math.min(ranges.length - 1, saved.main || 0)));
  }
  if (saved && Number.isFinite(saved.anchor)) return { anchor: clamp(saved.anchor), head: clamp(saved.head ?? saved.anchor) };
  if (viewState?.line) return { anchor: clamp(document.split("\n").slice(0, Math.max(0, viewState.line - 1)).reduce((sum, line) => sum + line.length + 1, 0) + (viewState.column || 0)) };
  return void 0;
}
function CodeEditor({ value, path, readonly, viewState, navigation, onNavigated, onChange, onViewState }) {
  const host = React.useRef(null), instance = React.useRef(null), callbacks = React.useRef({ onChange, onViewState, onNavigated });
  callbacks.current = { onChange, onViewState, onNavigated };
  React.useEffect(() => {
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: value || "", selection: restoreSelection(viewState, value || ""), extensions: [basicSetup, extensions(path), EditorState.readOnly.of(!!readonly), EditorView.editable.of(!readonly), EditorView.theme({ "&": { height: "100%", backgroundColor: "var(--wb-bg)", color: "var(--wb-text)" }, ".cm-scroller": { fontFamily: "ui-monospace,SFMono-Regular,monospace", overflow: "auto" }, ".cm-gutters": { backgroundColor: "var(--wb-panel)", color: "var(--wb-muted)", borderRight: "1px solid var(--wb-border)" }, ".cm-activeLine,.cm-activeLineGutter": { backgroundColor: "var(--wb-soft)" }, ".cm-cursor": { borderLeftColor: "var(--wb-text)" }, ".cm-selectionBackground": { backgroundColor: "var(--wb-soft)!important" } }), EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.current.onChange?.(update.state.doc.toString());
      if (update.selectionSet || update.docChanged) callbacks.current.onViewState?.({ selection: update.state.selection.toJSON(), cursor: update.state.selection.main.head, scrollTop: update.view.scrollDOM.scrollTop, scrollLeft: update.view.scrollDOM.scrollLeft });
    }), EditorView.domEventHandlers({ scroll: (_, v) => {
      callbacks.current.onViewState?.({ scrollTop: v.scrollDOM.scrollTop, scrollLeft: v.scrollDOM.scrollLeft });
    } })] }) });
    instance.current = view;
    const rememberScroll = () => callbacks.current.onViewState?.({ scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft });
    view.scrollDOM.addEventListener("scroll", rememberScroll);
    view.scrollDOM.scrollTop = viewState?.scrollTop || 0;
    view.scrollDOM.scrollLeft = viewState?.scrollLeft || 0;
    if (viewState?.line && !viewState.scrollTop) view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }) });
    return () => {
      callbacks.current.onViewState?.({ selection: view.state.selection.toJSON(), scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft });
      instance.current = null;
      view.scrollDOM.removeEventListener("scroll", rememberScroll);
      view.destroy();
    };
  }, [path, readonly]);
  React.useEffect(() => {
    const v = instance.current;
    if (v && value !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value || "" } });
  }, [value]);
  React.useEffect(()=>{
    const view=instance.current;if(!view||!navigation?.id)return;
    const position=editorPosition(view.state.doc,navigation);
    view.dispatch({selection:{anchor:position},effects:EditorView.scrollIntoView(position,{y:'center'})});
    view.focus();callbacks.current.onNavigated?.(navigation.id);
  },[navigation?.id,path,readonly]);
  return <div ref={host} className="wb-source" />;
}
function DiffView({ before, after, path }) {
  const host = React.useRef(null);
  React.useEffect(() => {
    const view = new MergeView({ parent: host.current, a: { doc: before || "", extensions: [basicSetup, extensions(path), EditorState.readOnly.of(true)] }, b: { doc: after || "", extensions: [basicSetup, extensions(path), EditorState.readOnly.of(true)] }, collapseUnchanged: { margin: 3, minSize: 6 }, highlightChanges: true, gutter: true });
    return () => view.destroy();
  }, [before, after, path]);
  return <div className="wb-source" ref={host} />;
}
function MarkdownView({ content, viewState, onViewState, onLink, resolveAsset, onError }) {
  const root = React.useRef(null);
  const rendered = React.useMemo(() => {
    const sanitized = DOMPurify.sanitize(marked.parse(content || "", { gfm: true, breaks: false }));
    const parsed = new DOMParser().parseFromString(sanitized, "text/html");
    parsed.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src");
      if (!/^(https?:|data:|blob:)/i.test(src)) {
        img.setAttribute("data-wb-src", src);
        img.removeAttribute("src");
      }
    });
    return parsed.body.innerHTML;
  }, [content]);
  const [headings, setHeadings] = React.useState([]);
  React.useEffect(() => {
    let live = true;
    for (const img of root.current.querySelectorAll("img[data-wb-src]")) {
      resolveAsset?.(img.getAttribute("data-wb-src")).then((url) => {
        if (live && url) img.src = url;
      }).catch((e) => {
        if (live) {
          img.alt = (img.alt || "图片") + "（资源不可访问）";
          img.title = e.message;
          onError?.(e);
        }
      });
    }
    return () => live = false;
  }, [rendered]);
  React.useEffect(() => {
    const nodes = [...root.current.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    nodes.forEach((n, i) => n.id = `wb-heading-${i}`);
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent, level: Number(n.tagName[1]) })));
    root.current.querySelectorAll("pre code").forEach((n) => {
      try {
        hljs.highlightElement(n);
      } catch {
      }
    });
    root.current.scrollTop = viewState?.readScroll || 0;
  }, [rendered]);
  return <><nav className="wb-heading-nav" aria-label="文档标题">{headings.map((h) => <a key={h.id} href={`#${h.id}`} style={{ paddingLeft: (h.level - 1) * 8 }} onClick={(e) => {
    e.preventDefault();
    root.current.querySelector(`#${h.id}`)?.scrollIntoView({ block: "start" });
  }}>{h.text}</a>)}</nav><article ref={root} className="wb-render" onClick={(e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("#")) {
      e.preventDefault();
      root.current.querySelector(href)?.scrollIntoView();
      return;
    }
    e.preventDefault();
    onLink?.(href);
  }} onScroll={(e) => onViewState({ readScroll: e.currentTarget.scrollTop })} dangerouslySetInnerHTML={{ __html: rendered }} /></>;
}
function ImageView({ url, name, viewState = {}, onViewState, onMetadata, onError }) {
  const img = React.useRef(null), canvas = React.useRef(null), [paused, setPaused] = React.useState(false), [size, setSize] = React.useState({ width: 0, height: 0 }), [pan, setPan] = React.useState(viewState.pan || { x: 0, y: 0 }), gesture = React.useRef(null), zoom = viewState.zoom || 1;
  const pause = () => {
    if (paused) {
      setPaused(false);
      return;
    }
    const image = img.current, c = canvas.current;
    if (!image?.naturalWidth) return;
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    c.getContext("2d").drawImage(image, 0, 0);
    setPaused(true);
  };
  return <><div className="wb-resource-bar"><Button onClick={() => onViewState({ zoom: Math.max(0.05, zoom / 1.25) })}>−</Button><span>{Math.round(zoom * 100)}%</span><Button onClick={() => onViewState({ zoom: Math.min(16, zoom * 1.25) })}>＋</Button><Button onClick={() => {
    onViewState({ zoom: 1, pan: { x: 0, y: 0 } });
    setPan({ x: 0, y: 0 });
  }}>原始尺寸</Button><Button onClick={() => {
    const parent = img.current?.parentElement;
    if (parent && size.width) {setPan({x:0,y:0});onViewState({ zoom: Math.min(parent.clientWidth / size.width, parent.clientHeight / size.height, 1),pan:{x:0,y:0} });}
  }}>适应</Button>{/\.gif($|\?)/i.test(name || url || "") && <Button onClick={pause}>{paused ? "播放 GIF" : "暂停 GIF"}</Button>}<span className="wb-muted">{size.width} × {size.height} · 拖动平移</span></div><div className="wb-image-stage" onPointerDown={(e) => {
    if (e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={(e) => {
    const g = gesture.current;
    if (g) setPan({ x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y });
  }} onPointerUp={() => {
    gesture.current = null;
    onViewState({ pan });
  }} onPointerCancel={() => {
    gesture.current = null;
  }} onWheel={(e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onViewState({ zoom: Math.max(0.05, Math.min(16, zoom * Math.exp(-e.deltaY * 5e-3))) });
    }
  }}><img ref={img} src={url} alt={name} draggable={false} onError={() => onError?.(Object.assign(new Error("图片不可读取或预览地址已过期，请刷新资源。"), { code: "IMAGE_PREVIEW_FAILED" }))} onLoad={(e) => {
    const s = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
    setSize(s);
    onMetadata?.(s);
  }} style={{ display: paused ? "none" : "block", width: size.width ? size.width * zoom : void 0, transform: `translate(${pan.x}px,${pan.y}px)` }} /><canvas ref={canvas} style={{ display: paused ? "block" : "none", width: size.width * zoom, transform: `translate(${pan.x}px,${pan.y}px)` }} /></div></>;
}
function ResourceView({ tab, onUpdate, onSave, onReference, api, projectId, onOpenFile, onRefresh, onHistoryAction, onAssetAction, onReconcile, onSetTarget, canSetTarget = true }) {
  const [error, setError] = React.useState(null), [metadata, setMetadata] = React.useState({}), [history, setHistory] = React.useState(null), [diff, setDiff] = React.useState(null), [loading, setLoading] = React.useState(false), mediaRef = React.useRef(null);
  const handleLink = (href) => {
    try {
      const u = new URL(href, "https://project.local/" + (tab.path || ""));
      if (u.hostname === "project.local") {
        const path = decodeURIComponent(u.pathname.slice(1));
        if (!path || path.split("/").includes("..")) throw new Error("链接不在项目内");
        if (!onOpenFile) throw new Error("此资源的相对文档链接需要在所属项目中打开。");
        onOpenFile({ path, name: path.split("/").pop(), sourceId: tab.sourceId }, true);
      } else if (["http:", "https:", "mailto:"].includes(u.protocol)) window.open(u.href, "_blank", "noopener,noreferrer");
      else throw new Error("不支持此链接协议");
    } catch (e) {
      setError(e);
    }
  };
  const loadMore = async () => {
    setLoading(true);
    try {
      const value = await api("file.read", { projectId, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId, offset: tab.nextOffset, limit: 3e4 });
      onUpdate({ content: (tab.content || "") + (value.content ?? value.text ?? ""), nextOffset: value.nextOffset, total: value.total });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  const kind = resourceType(tab), mode = tab.mode || (kind === "markdown" ? "read" : kind === "svg" ? "render" : "source"), content = tab.content ?? "", url = tab.previewUrl || tab.url || tab.downloadUrl;
  const updateView = (patch) => onUpdate({ view: { ...tab.view, ...patch } }), setMode = (mode2) => onUpdate({ mode: mode2 });
  const text = ["text", "markdown", "svg"].includes(kind);
  const svgError = React.useMemo(() => {
    if (kind !== "svg" || !content) return null;
    const document = new DOMParser().parseFromString(content, "image/svg+xml");
    const error2 = document.querySelector("parsererror");
    return error2 ? { code: "INVALID_SVG", message: error2.textContent.slice(0, 1e3) } : null;
  }, [kind, content]);
  const renderSource = () => <CodeEditor value={content} path={tab.path || tab.name} readonly={tab.reconciling || tab.readonly || tab.nextOffset != null || !!tab.error} viewState={tab.view} navigation={tab.editorNavigation} onNavigated={()=>onUpdate({editorNavigation:null})} onViewState={updateView} onChange={(value) => {
    if (value !== content) onUpdate({ content: value, dirty: true, preview: false });
  }} />;
  const renderedHTML = React.useMemo(() => {
    if (kind === "svg") return DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } });
    let html2 = DOMPurify.sanitize(content, { WHOLE_DOCUMENT: true, ADD_TAGS: ["link"], ADD_ATTR: ["rel", "href"] });
    const parsed = new DOMParser().parseFromString(html2, "text/html");
    parsed.querySelectorAll("base").forEach((n) => n.remove());
    parsed.querySelectorAll("meta[http-equiv]").forEach((n) => {
      if (["content-security-policy", "refresh"].includes(n.getAttribute("http-equiv").trim().toLowerCase())) n.remove();
    });
    html2 = parsed.documentElement.outerHTML;
    let base = "";
    try {
      if (tab.assetBase) {
        const url2 = new URL(tab.assetBase, location.origin);
        if (url2.origin === location.origin) base = '<base href="' + url2.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">';
      }
    } catch {
    }
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: https: http:; style-src 'unsafe-inline' https: http:; font-src data: https: http:; form-action 'none'; base-uri ${location.origin};">${base}`;
    return /<head\b[^>]*>/i.test(html2) ? html2.replace(/<head\b[^>]*>/i, (m) => m + policy) : policy + html2;
  }, [kind, content, tab.assetBase]);
  const renderContent = () => kind === "markdown" ? <MarkdownView content={content} viewState={tab.view} onViewState={updateView} onLink={handleLink} onError={setError} resolveAsset={async (href) => {
    if (tab.resolveMap) {
      const logicalPath = systemLogicalPath(tab.logicalPath || tab.path || "", href), entry = tab.resolveMap[logicalPath];
      if (!entry) throw Object.assign(new Error("固定版本资料缺少精确资源：" + logicalPath), { code: "SYSTEM_RESOURCE_MISSING" });
      const asset = await api("system.resource.read", { systemId: tab.systemId, version: tab.version, resourceId: entry.resourceId });
      const address = asset.previewUrl || asset.downloadUrl || asset.url;
      if (!address) throw new Error("固定版本资源没有可预览地址：" + logicalPath);
      return address;
    }
    if (tab.assetBase) {
      const base = new URL(tab.assetBase, location.origin), resolved = new URL(href, base);
      if (base.origin !== location.origin || resolved.origin !== location.origin) throw new Error("资源基准或图片路径不在可信预览地址内");
      return resolved.href;
    }
    const u = new URL(href, "https://project.local/" + (tab.path || ""));
    const value = await api("file.read", { projectId, sourceId: tab.sourceId, path: decodeURIComponent(u.pathname.slice(1)) });
    if (!value.previewUrl && !value.url) throw new Error("图片资源没有可用预览地址：" + href);
    return value.previewUrl || value.url;
  }} /> : <iframe title={tab.name} className="wb-document-frame" sandbox="" src={tab.systemId ? tab.previewUrl : void 0} srcDoc={tab.systemId && tab.previewUrl ? void 0 : renderedHTML} />;
  const download = async () => {
    try {
      if (tab.downloadUrl || url) downloadValue({ url: tab.downloadUrl || url, name: tab.name });
      else if (text) downloadValue({ content, name: tab.name, mimeType: tab.mimeType });
      else downloadValue(await api("asset.copy", { projectId, fileId: tab.resourceId, path: tab.path, external: true }), tab.name);
    } catch (e) {
      setError(e);
    }
  };
  return <div className="wb-resource"><div className="wb-resource-bar"><span className="wb-grow wb-ellipsis" title={tab.path}>{tab.path || tab.name}</span>{tab.reconciling && <span className="wb-chip" role="status">正在协调资源…</span>}{text && <><Button aria-pressed={mode === "source"} onClick={() => setMode("source")}>源码</Button><Button aria-pressed={mode === "render" || mode === "read"} onClick={() => setMode(kind === "markdown" ? "read" : "render")}>阅读 / 渲染</Button><Button aria-pressed={mode === "split"} onClick={() => setMode("split")}>分栏</Button><Button disabled={tab.reconciling || tab.readonly || !tab.dirty} onClick={() => onSave(tab)}>保存</Button>{projectId && tab.type === "file" && !tab.sourceId && <><Button onClick={async () => {
    try {
      await onRefresh?.(tab);
    } catch (e) {
      setError(e);
    }
  }}>重读</Button><Button onClick={async () => {
    try {
      setHistory(await api("file.history", { projectId, fileId: tab.resourceId, path: tab.path }));
    } catch (e) {
      setError(e);
    }
  }}>文件历史</Button><Button disabled={tab.reconciling || tab.readonly} onClick={() => onHistoryAction?.("undo", tab).catch(setError)}>撤销保存</Button><Button disabled={tab.reconciling || tab.readonly} onClick={() => onHistoryAction?.("redo", tab).catch(setError)}>重做保存</Button></>}</>}{tab.sourceId && onRefresh && <Button onClick={() => onRefresh(tab).catch(setError)}>重读源码</Button>}{tab.sourceId && <Button onClick={async () => {
    try {
      setHistory(await api("file.history", { projectId, sourceId: tab.sourceId, path: tab.path, fileId: tab.resourceId }));
    } catch (e) {
      setError(e);
    }
  }}>源码保存点</Button>}{tab.viewerReadonly && !tab.permissionReadonly && <Button onClick={() => onUpdate({ viewerReadonly: false, readonly: false })}>编辑此本地资源</Button>}{onSetTarget && tab.type === "file" && <Button disabled={!canSetTarget || (tab.permissionReadonly ?? tab.readonly)} title={!canSetTarget ? "此资源只读或路径不在允许修改的登记范围内" : "只有明确点击才会授权本轮修改此文件"} onClick={() => onSetTarget(tab)}>设为本轮修改目标</Button>}{onReference && !tab.receiptId && <Button disabled={kind==='pdf'&&metadata.status!=='ready'} title={kind==='pdf'?'引用当前实际显示的 PDF 页':'引用当前文件'} onClick={() => onReference({ type: "file", resourceId: tab.resourceId, path: tab.path, label: tab.name, sourceVersion: tab.version, sourceId: tab.sourceId, pageNumber: kind === "pdf" ? tab.view?.page || 1 : void 0 })}>引用</Button>}{onAssetAction && tab.type === "file" && !tab.sourceId && <><Button onClick={() => onAssetAction("copy", tab)}>复制资源</Button><Button disabled={tab.reconciling || tab.readonly} onClick={() => onAssetAction("replace", tab)}>替换资源</Button></>}{!text && onRefresh && <Button onClick={() => {
    setError(null);
    onRefresh(tab).catch(setError);
  }}>刷新资源</Button>}{kind === "pdf" && url && <a href={url} target="_blank" rel="noopener noreferrer">外部打开 PDF ↗</a>}<Button onClick={download}>下载原件</Button></div><ErrorBox error={error || tab.error} onClose={() => setError(null)} context="文件操作"/><FieldError error={svgError} context={`${tab.name || '当前文件'} · SVG 语法`}/>{tab.conflict && <div className="wb-stack" style={{ padding: 10, borderBottom: "1px solid var(--wb-border)" }}><strong>文件已在外部改变，保留了本地草稿</strong><div className="wb-row"><Button onClick={() => setDiff({ before: tab.conflict.remoteContent, after: tab.content })}>比较远端与草稿</Button><Button disabled={tab.reconciling || tab.readonly || !onReconcile} onClick={() => onReconcile("keep-local", tab, tab.content).catch(setError)}>明确保留本地并保存新版本</Button><Button disabled={tab.reconciling || tab.readonly || !onReconcile} onClick={() => onReconcile("adopt-external", tab).catch(setError)}>明确采用外部版本</Button><Button disabled={tab.reconciling || tab.readonly || !onReconcile} onClick={() => onReconcile("merge", tab, tab.content).catch(setError)}>将当前编辑内容保存为合并版本</Button></div></div>}{diff && <div style={{ height: 300, minHeight: 200, display: "flex", flexDirection: "column", borderBottom: "1px solid var(--wb-border)" }}><div className="wb-resource-bar"><strong className="wb-grow">保存版本 / 本地内容</strong><Button onClick={() => setDiff(null)}>关闭差异</Button></div><DiffView before={diff.before} after={diff.after} path={tab.path} /></div>}{history && <div style={{ maxHeight: 220, overflow: "auto", padding: 10, borderBottom: "1px solid var(--wb-border)" }}><div className="wb-row"><strong className="wb-grow">文件版本</strong><Button onClick={() => setHistory(null)}>关闭</Button></div>{(history.entries || history.history || history.versions || []).map((h, i) => <div className="wb-row" key={h.id || h.version || i}><span className="wb-grow">{h.summary || h.version || h.id} {h.createdAt || ""}</span><Button onClick={async () => {
    try {
      const value = await api("file.read", { projectId, fileId: tab.resourceId, path: tab.path, sourceId: tab.sourceId, revisionId: h.id, version: h.version || h.id });
      setDiff({ before: value.content ?? value.text ?? "", after: tab.content });
    } catch (e) {
      setError(e);
    }
  }}>比较</Button><Button disabled={tab.reconciling || tab.readonly} onClick={() => onHistoryAction?.("restore", tab, { revisionId: h.id }).catch(setError)}>恢复此保存点</Button></div>)}</div>}{tab.nextOffset != null && <div className="wb-resource-bar"><span className="wb-muted wb-grow">已按需读取 {content.length} / {tab.total || "未知"} 字符；完整载入后可编辑保存。</span><Button disabled={loading} onClick={loadMore}>{loading ? "读取中…" : "加载下一段"}</Button></div>}{kind === "image" ? url ? <ImageView url={url} name={tab.name} viewState={tab.view} onViewState={updateView} onMetadata={setMetadata} onError={setError} /> : <Empty title="图片没有可用地址"><p>文件服务需返回项目范围的只读预览 URL。</p></Empty> : kind === "pdf" ? url ? <PDFBoundary key={url} onError={setError}><React.Suspense fallback={<Empty title="正在载入 PDF 阅读器…"/>}><PDFView key={tab.resourceId||tab.id} url={url} name={tab.name} viewState={tab.view} onViewState={updateView} onMetadata={setMetadata} onError={setError}/></React.Suspense></PDFBoundary> : <Empty title="PDF 没有可用地址"/> : kind === "audio" || kind === "video" ? <><div className="wb-resource-body">{url ? React.createElement(kind, { ref: mediaRef, className: "wb-media", src: url, controls: true, preload: "metadata", onError: () => setError(Object.assign(new Error("媒体不可读取、格式不支持或预览地址已过期。"), { code: "MEDIA_PREVIEW_FAILED" })), onLoadedMetadata: (e) => {
    setMetadata({ duration: e.currentTarget.duration, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
    const media=e.currentTarget,rate=Number(tab.view?.playbackRate),time=Number(tab.view?.currentTime);
    media.playbackRate=Number.isFinite(rate)&&rate>=0.25&&rate<=4?rate:1;
    if(Number.isFinite(time)&&time>=0)media.currentTime=Number.isFinite(media.duration)?Math.min(time,media.duration):time;
  }, onTimeUpdate: (e) => updateView({ currentTime: e.currentTarget.currentTime }), onRateChange: (e) => updateView({ playbackRate: e.currentTarget.playbackRate }) }) : <Empty title="媒体没有可用地址" />}</div><div className="wb-resource-bar">{tab.mimeType} · {Number(metadata.duration || 0).toFixed(1)} 秒 {metadata.width ? `· ${metadata.width} × ${metadata.height}` : ""}<select aria-label="播放速度" value={tab.view?.playbackRate || 1} onChange={(e) => {
    const el = mediaRef.current;
    if (el) el.playbackRate = Number(e.target.value);
    updateView({ playbackRate: Number(e.target.value) });
  }}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => <option key={v} value={v}>{v}×</option>)}</select></div></> : kind === "binary" ? <div className="wb-binary-info wb-stack"><h2>{tab.name}</h2><p className="wb-muted">二进制资源 · 此类型使用外部应用查看。</p><dl><dt>路径</dt><dd>{tab.path}</dd><dt>格式</dt><dd>{tab.mimeType || "未知"}</dd><dt>大小</dt><dd>{tab.byteLength ?? tab.size ?? "未知"} bytes</dd><dt>版本</dt><dd>{tab.version || "未提供"}</dd></dl><Button onClick={download}>下载外部副本</Button>{onAssetAction && tab.type === "file" && !tab.sourceId && <Button onClick={() => onAssetAction("copy", tab)}>复制到项目资源</Button>}</div> : <div className="wb-resource-body">{(mode === "source" || mode === "split") && renderSource()}{(mode === "render" || mode === "read" || mode === "split") && renderContent()}</div>}</div>;
}
export {
  CodeEditor,
  ResourceView as default,
  resourceType
};
