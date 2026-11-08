import React from 'react';
import { getDocument, TextLayer, PasswordResponses } from 'pdfjs-dist/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import bundledAssets from 'designer:pdf-assets';
import {
  PDF_CSS_UNITS, PDF_MAX_SEARCH_RESULTS, normalizePDFViewState, createPDFLayout,
  visiblePDFPages, pdfScrollState, pdfScrollTarget, buildPDFText, findPDFMatches,
  pdfMatchSegments, nextPDFSearchIndex, createPDFTaskQueue,
} from './pdf-state.js';

// This is PDF.js's actual worker protocol/decoder running in its supported
// main-thread mode. Static imports keep both decoder and assets in the host's
// CJS bundle; no Worker(), dynamic worker import, eval or CDN is needed.
function assetBytes(name) {
  const encoded = bundledAssets[name];
  if (!encoded) throw new Error(`PDF decoder asset is not packaged: ${name}`);
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
class LocalCMapReaderFactory {
  async fetch({ name }) { return { cMapData: assetBytes(`${name}.bcmap`), compressionType: 1 }; }
}
class LocalStandardFontDataFactory {
  async fetch({ filename }) { return assetBytes(filename); }
}
const cancelled = (error) => ['AbortError', 'AbortException', 'RenderingCancelledException'].includes(error?.name);
const sameState = (a, b) => Object.keys(a).every((key) => a[key] === b[key]);
function previewError(error, code = 'PDF_PREVIEW_FAILED') {
  if (error instanceof Error && error.code) return error;
  return Object.assign(new Error(error?.message || 'PDF 不可读取，或预览地址已过期，请刷新资源。'), { code, cause: error });
}
async function readText(page, signal) {
  const reader = page.streamTextContent().getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const content = { items: [], styles: Object.create(null), lang: null };
  try {
    if (signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      if (done) return content;
      content.items.push(...value.items);
      Object.assign(content.styles, value.styles);
      content.lang ||= value.lang;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
const styles = `
canvas.hiddenCanvasElement{position:absolute;top:0;left:0;width:0;height:0;display:none}
.wb-pdf{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;height:100%;color:var(--wb-text,#ddd);background:var(--wb-bg,#202124)}
.wb-pdf .wb-pdf-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--wb-border,#555);flex-shrink:0}
.wb-pdf button,.wb-pdf input{font:inherit;color:inherit;background:var(--wb-panel,#303134);border:1px solid var(--wb-border,#666);border-radius:4px;padding:4px 7px}
.wb-pdf button:disabled{opacity:.45}.wb-pdf button{cursor:pointer}.wb-pdf label{display:flex;gap:5px;align-items:center}
.wb-pdf button:focus-visible,.wb-pdf input:focus-visible,.wb-pdf-scroller:focus-visible{outline:2px solid #79b8ff;outline-offset:2px}
.wb-pdf-scroller{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;background:#55565a}
.wb-pdf-page{position:absolute;background:#fff;box-shadow:0 1px 5px #0007;color:#222}
.wb-pdf-page canvas{position:absolute;inset:0;display:block;width:100%;height:100%}
.wb-pdf-text{position:absolute;text-align:initial;inset:0;overflow:clip;line-height:1;text-size-adjust:none;-webkit-text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText}
.wb-pdf-text :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.wb-pdf-text span.markedContent{top:0;height:0}.wb-pdf-text mark{color:transparent;background:#ffe10088;padding:0;font:inherit;line-height:inherit}
.wb-pdf-text mark[data-selected=true]{background:#ff8c0088;outline:1px solid #c75b00}
.wb-pdf-text ::selection{background:#3399ff66}.wb-pdf-text br::selection{background:transparent}
.wb-pdf-text[data-main-rotation="90"]{transform:rotate(90deg) translateY(-100%)}
.wb-pdf-text[data-main-rotation="180"]{transform:rotate(180deg) translate(-100%,-100%)}
.wb-pdf-text[data-main-rotation="270"]{transform:rotate(270deg) translateX(-100%)}
.wb-pdf-message{padding:16px;line-height:1.5}.wb-pdf-page-message{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px}
.wb-pdf-results{display:flex;gap:8px;align-items:center;padding:5px 8px;font-size:12px;flex-shrink:0;flex-wrap:wrap}
`;

function PDFPage({ pdf, box, stageWidth, zoom, queue, matches, selectedStart, onSize, onError, onMatchReady }) {
  const canvas = React.useRef(null), textHost = React.useRef(null), layerRef = React.useRef(null);
  const [ready, setReady] = React.useState(0), [error, setError] = React.useState(null), [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController(), node = canvas.current, host = textHost.current;
    let renderTask, layer, page;
    setError(null); setReady(0); host.replaceChildren(); layerRef.current = null;
    queue(async () => {
      page = await pdf.getPage(box.page);
      if (controller.signal.aborted) { page.cleanup(); return; }
      const natural = page.getViewport({ scale: 1 });
      onSize(box.page, { width: natural.width, height: natural.height });
      const viewport = page.getViewport({ scale: zoom * PDF_CSS_UNITS });
      // Limit both DPR and backing pixels (four million per mounted page).
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (viewport.width * viewport.height)), 8192 / viewport.width, 8192 / viewport.height);
      node.width = Math.max(1, Math.floor(viewport.width * ratio));
      node.height = Math.max(1, Math.floor(viewport.height * ratio));
      const context = node.getContext('2d', { alpha: false });
      if (!context) throw new Error('当前环境无法创建 PDF Canvas。');
      renderTask = page.render({ canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0], background: 'rgb(255,255,255)' });
      // Observe both promises immediately so cancellation cannot leave an
      // unhandled rejected render while text is still being extracted.
      const canvasDone = renderTask.promise;
      canvasDone.catch(() => {});
      const content = await readText(page, controller.signal);
      if (controller.signal.aborted) return;
      layer = new TextLayer({ textContentSource: content, container: host, viewport });
      await Promise.all([canvasDone, layer.render()]);
      if (controller.signal.aborted) return;
      layerRef.current = { layer, ...buildPDFText(content.items) };
      setReady((n) => n + 1);
    }, controller.signal).catch((cause) => {
      renderTask?.cancel(); layer?.cancel();
      if (controller.signal.aborted || cancelled(cause)) return;
      const failure = previewError(cause, 'PDF_PAGE_FAILED');
      setError(failure); onError(failure);
    });
    return () => {
      controller.abort(); renderTask?.cancel(); layer?.cancel(); layerRef.current = null;
      node.width = 0; node.height = 0; host.replaceChildren();
      // PDF.js declines cleanup while this page still has an active render.
      // Defer the final attempt until cancellation has settled.
      Promise.resolve(renderTask?.promise).catch(() => {}).finally(() => { page?.cleanup(); });
    };
  }, [pdf, box.page, zoom, queue, retry, onSize, onError]);
  React.useEffect(() => {
    const data = layerRef.current;
    if (!data || !ready) return;
    data.layer.textDivs.forEach((div, index) => {
      const span = data.spans[index];
      if (!span) return;
      const original = data.text.slice(span.start, span.end), segments = pdfMatchSegments(span.start, span.end, matches);
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const segment of segments) {
        fragment.append(document.createTextNode(original.slice(offset, segment.start)));
        const mark = document.createElement('mark'), match = matches[segment.index];
        mark.textContent = original.slice(segment.start, segment.end);
        mark.dataset.pdfMatch = `${box.page}:${match.start}`;
        mark.dataset.selected = String(match.start === selectedStart);
        fragment.append(mark); offset = segment.end;
      }
      fragment.append(document.createTextNode(original.slice(offset)));
      div.replaceChildren(fragment);
    });
    if (selectedStart != null) onMatchReady(box.page, selectedStart, textHost.current);
  }, [ready, matches, selectedStart, box.page, onMatchReady]);
  return <section className="wb-pdf-page" aria-label={`第 ${box.page} 页`} style={{ top: box.top, left: Math.max(20, (stageWidth - box.width) / 2), width: box.width, height: box.height, '--scale-factor': zoom * PDF_CSS_UNITS }}>
    <canvas ref={canvas} aria-hidden="true" />
    <div className="wb-pdf-text" ref={textHost} />
    {!ready && !error && <div className="wb-pdf-page-message" role="status">正在渲染第 {box.page} 页…</div>}
    {error && <div className="wb-pdf-page-message" role="alert"><span>第 {box.page} 页：{error.message}</span><button onClick={() => setRetry((n) => n + 1)}>重试此页</button></div>}
  </section>;
}

/**
 * Controlled PDF reader. onViewState receives a mergeable complete PDF patch:
 * {page, zoom, pageOffset, scrollLeft, search, searchIndex}. page is one-based;
 * zoom is numeric (.25–4); pageOffset is a signed fraction of that page's
 * displayed height. Host must merge the patch into this resource's view state.
 * Passwords are transient component state and never enter callbacks/storage.
 */
export default function PDFView({ url, name, viewState = {}, onViewState, onError, onMetadata }) {
  const callbacks = React.useRef({ onViewState, onError, onMetadata });
  callbacks.current = { onViewState, onError, onMetadata };
  const [state, setState] = React.useState(() => normalizePDFViewState(viewState));
  const stateRef = React.useRef(state); stateRef.current = state;
  const lastPublished = React.useRef(null), previousProps = React.useRef(normalizePDFViewState(viewState));
  const [pdf, setPDF] = React.useState(null), [sizes, setSizes] = React.useState({});
  const [status, setStatus] = React.useState('loading'), [error, setError] = React.useState(null);
  const [passwordRequest, setPasswordRequest] = React.useState(null), [password, setPassword] = React.useState('');
  const [reload, setReload] = React.useState(0), [viewport, setViewport] = React.useState({ top: 0, left: 0, height: 600, width: 800 });
  const [search, setSearch] = React.useState({ query: '', matches: [], scanned: 0, running: false, limited: false, failed: 0 });
  const scroller = React.useRef(null), searchInput = React.useRef(null), frame = React.useRef(null);
  const loadingTask = React.useRef(null), cancelledLoad = React.useRef(null), queue = React.useMemo(() => createPDFTaskQueue(2), [url, reload]);
  const pendingPosition = React.useRef(null), pendingMatch = React.useRef(null), loading = React.useRef(true);
  const layout = React.useMemo(() => createPDFLayout(pdf?.numPages || 0, sizes, state.zoom), [pdf, sizes, state.zoom]);
  const layoutRef = React.useRef(layout); layoutRef.current = layout;
  const reportError = React.useCallback((failure) => callbacks.current.onError?.(failure), []);
  const publish = React.useCallback((patch) => {
    const next = normalizePDFViewState({ ...stateRef.current, ...patch }, layoutRef.current.pages.length || Infinity);
    if (sameState(next, stateRef.current) && lastPublished.current) return;
    stateRef.current = next; lastPublished.current = next; setState(next);
    callbacks.current.onViewState?.(next);
  }, []);
  const measure = React.useCallback(() => {
    const node = scroller.current;
    if (!node || loading.current) return;
    setViewport({ top: node.scrollTop, left: node.scrollLeft, width: node.clientWidth, height: node.clientHeight });
    publish(pdfScrollState(layoutRef.current, node.scrollTop, node.clientHeight, node.scrollLeft));
  }, [publish]);
  const scheduleMeasure = React.useCallback(() => {
    if (frame.current == null) frame.current = requestAnimationFrame(() => { frame.current = null; measure(); });
  }, [measure]);
  const navigate = React.useCallback((page, extra = {}) => {
    const next = normalizePDFViewState({ ...stateRef.current, ...extra, page, pageOffset: 0 }, layoutRef.current.pages.length || Infinity);
    pendingPosition.current = next; pendingMatch.current = null;
    publish(next);
    const node = scroller.current;
    if (node && layoutRef.current.pages.length) {
      const target = pdfScrollTarget(layoutRef.current, next);
      node.scrollTop = target.top; node.scrollLeft = target.left;
      pendingPosition.current = null; scheduleMeasure();
    }
  }, [publish, scheduleMeasure]);

  // Echoes of our callbacks do not reposition the viewport. New external state
  // (reference navigation, restoration, another controller) does reposition it.
  const incoming = normalizePDFViewState(viewState);
  React.useEffect(() => {
    if (sameState(incoming, previousProps.current)) return;
    previousProps.current = incoming;
    if (lastPublished.current && sameState(incoming, lastPublished.current)) return;
    const next = normalizePDFViewState(incoming, pdf?.numPages || Infinity);
    const moved = next.page !== stateRef.current.page || next.zoom !== stateRef.current.zoom || next.pageOffset !== stateRef.current.pageOffset || next.scrollLeft !== stateRef.current.scrollLeft;
    if (moved) { pendingPosition.current = next; pendingMatch.current = null; }
    stateRef.current = next; setState(next);
  }, [incoming.page, incoming.zoom, incoming.pageOffset, incoming.scrollLeft, incoming.search, incoming.searchIndex, pdf]);

  React.useEffect(() => {
    let live = true;
    loading.current = true; setPDF(null); setSizes({}); setStatus('loading'); setError(null);
    setPasswordRequest(null); setPassword(''); setSearch({ query: '', matches: [], scanned: 0, running: false, limited: false, failed: 0 });
    pendingMatch.current = null;
    const restored = normalizePDFViewState(viewState);
    stateRef.current = restored; setState(restored); lastPublished.current = null;
    pendingPosition.current = restored;
    callbacks.current.onMetadata?.({ status: 'loading', pageCount: 0, numPages: 0, decoder: 'pdfjs-main-thread' });
    let task;
    const fail = (cause) => {
      if (!live || cancelledLoad.current === task || cancelled(cause)) return;
      const failure = previewError(cause, cause?.name === 'InvalidPDFException' ? 'PDF_INVALID' : 'PDF_LOAD_FAILED');
      loading.current = false; setStatus('error'); setError(failure); setPasswordRequest(null); setPassword('');
      task?.destroy().catch(() => {});
      callbacks.current.onMetadata?.({ status: 'error', pageCount: 0, numPages: 0, decoder: 'pdfjs-main-thread' });
      reportError(failure);
    };
    try {
      if (!url) throw new Error('PDF 没有可用预览地址。');
      globalThis.pdfjsWorker = { WorkerMessageHandler };
      task = getDocument({ url, isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true, rangeChunkSize: 65536, stopAtErrors: true,
        useWorkerFetch: false, CMapReaderFactory: LocalCMapReaderFactory,
        StandardFontDataFactory: LocalStandardFontDataFactory,
        // Canvas path glyphs avoid a dependency on the shell's font-src CSP.
        disableFontFace: true, useSystemFonts: false, isOffscreenCanvasSupported: false });
      loadingTask.current = task;
      task.onPassword = (update, reason) => {
        if (!live) return;
        setPassword(''); setPasswordRequest({ update, incorrect: reason === PasswordResponses.INCORRECT_PASSWORD }); setStatus('password');
        callbacks.current.onMetadata?.({ status: 'password', passwordRequired: true, incorrectPassword: reason === PasswordResponses.INCORRECT_PASSWORD, pageCount: 0, numPages: 0, decoder: 'pdfjs-main-thread' });
      };
      task.promise.then(async (document) => {
        if (!live) return;
        const firstPage = await document.getPage(1), first = firstPage.getViewport({ scale: 1 });
        const initial = normalizePDFViewState(stateRef.current, document.numPages), measured = { 1: { width: first.width, height: first.height } };
        if (initial.page !== 1) {
          const page = await document.getPage(initial.page), size = page.getViewport({ scale: 1 });
          measured[initial.page] = { width: size.width, height: size.height };
        }
        if (!live) return;
        stateRef.current = initial; setState(initial); pendingPosition.current = initial;
        setSizes(measured); setPDF(document); setStatus('ready'); setPasswordRequest(null); setPassword('');
        loading.current = false;
        const metadata = { status: 'ready', pageCount: document.numPages, numPages: document.numPages, width: first.width, height: first.height, fingerprint: document.fingerprints[0], decoder: 'pdfjs-main-thread' };
        callbacks.current.onMetadata?.(metadata);
        document.getMetadata().then(({ info }) => {
          if (live) callbacks.current.onMetadata?.({ ...metadata, title: info.Title || '', author: info.Author || '', pdfVersion: info.PDFFormatVersion || '' });
        }).catch(() => {});
        callbacks.current.onViewState?.(initial); lastPublished.current = initial;
      }).catch(fail);
    } catch (cause) { fail(cause); }
    return () => {
      live = false; loading.current = true; pendingMatch.current = null;
      if (loadingTask.current === task) loadingTask.current = null;
      if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null; }
      Promise.resolve(task?.destroy()).catch(() => {}).finally(() => TextLayer.cleanup());
    };
  }, [url, reload, reportError]);

  React.useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !pdf) return;
    if (pendingPosition.current) {
      const target = pdfScrollTarget(layout, pendingPosition.current);
      node.scrollTop = target.top; node.scrollLeft = target.left;
      pendingPosition.current = null;
    }
    scheduleMeasure();
  }, [layout, pdf, state.page, state.pageOffset, state.scrollLeft, scheduleMeasure]);
  React.useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const resize = () => {
      setViewport((old) => ({ ...old, width: node.clientWidth, height: node.clientHeight }));
      scheduleMeasure();
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(node); window.addEventListener('resize', resize); resize();
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, [scheduleMeasure, status]);
  const onSize = React.useCallback((page, size) => {
    setSizes((old) => {
      if (old[page]?.width === size.width && old[page]?.height === size.height) return old;
      const node = scroller.current;
      if (node && !pendingPosition.current) pendingPosition.current = { ...stateRef.current, ...pdfScrollState(layoutRef.current, node.scrollTop, node.clientHeight, node.scrollLeft) };
      return { ...old, [page]: size };
    });
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const query = state.search;
    if (!pdf || !query.trim()) {
      setSearch({ query, matches: [], scanned: 0, running: false, limited: false, failed: 0 });
      pendingMatch.current = null;
      return () => controller.abort();
    }
    const timer = setTimeout(async () => {
      const matches = []; let failed = 0;
      setSearch({ query, matches: [], scanned: 0, running: true, limited: false, failed: 0 });
      for (let number = 1; number <= pdf.numPages; number++) {
        if (controller.signal.aborted) return;
        let page;
        try {
          await queue(async () => {
            page = await pdf.getPage(number);
            if (controller.signal.aborted) return;
            const content = await readText(page, controller.signal);
            const found = findPDFMatches(buildPDFText(content.items).text, query, PDF_MAX_SEARCH_RESULTS - matches.length);
            for (const match of found) matches.push({ page: number, ...match });
          }, controller.signal);
        } catch (cause) {
          if (controller.signal.aborted || cancelled(cause)) return;
          failed++; reportError(previewError(cause, 'PDF_SEARCH_PAGE_FAILED'));
        } finally { page?.cleanup(); }
        if (controller.signal.aborted) return;
        const limited = matches.length >= PDF_MAX_SEARCH_RESULTS;
        // Compact matches only; full document text is never retained.
        setSearch({ query, matches: matches.slice(), scanned: number, running: number < pdf.numPages && !limited, limited, failed });
        if (limited) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [pdf, state.search, queue, reportError]);
  const activeMatches = search.query === state.search ? search.matches : [];
  const selected = activeMatches[state.searchIndex];
  const goToMatch = React.useCallback((index) => {
    const match = activeMatches[index];
    if (!match) return;
    navigate(match.page, { searchIndex: index });
    pendingMatch.current = `${match.page}:${match.start}`;
  }, [activeMatches, navigate]);
  // Re-evaluate selection as incremental search discovers the restored index.
  React.useEffect(() => {
    if (selected) goToMatch(state.searchIndex);
  }, [selected?.page, selected?.start, state.searchIndex, state.search]);
  React.useEffect(() => {
    if (!search.running && search.query === state.search && activeMatches.length && state.searchIndex >= activeMatches.length) publish({ searchIndex: activeMatches.length - 1 });
  }, [search.running, search.query, state.search, state.searchIndex, activeMatches.length, publish]);
  const onMatchReady = React.useCallback((page, start, host) => {
    if (pendingMatch.current !== `${page}:${start}`) return;
    const mark = host.querySelector(`mark[data-pdf-match="${page}:${start}"]`), node = scroller.current;
    if (!mark || !node) return;
    const rect = mark.getBoundingClientRect(), parent = node.getBoundingClientRect();
    node.scrollTop += rect.top - parent.top - Math.min(node.clientHeight / 3, 100);
    node.scrollLeft += rect.left - parent.left - Math.min(node.clientWidth / 3, 100);
    pendingMatch.current = null; scheduleMeasure();
  }, [scheduleMeasure]);
  const zoomTo = (zoom) => {
    zoom = normalizePDFViewState({ zoom }).zoom;
    if (zoom === stateRef.current.zoom) return;
    const node = scroller.current;
    const anchor = node ? pdfScrollState(layoutRef.current, node.scrollTop, node.clientHeight, node.scrollLeft) : {};
    pendingPosition.current = { ...stateRef.current, ...anchor, zoom };
    publish({ ...anchor, zoom });
  };
  const mounted = visiblePDFPages(layout, viewport.top, viewport.height);
  const stageWidth = Math.max(layout.width, viewport.width);
  const groupedMatches = React.useMemo(() => {
    const groups = new Map();
    for (const match of activeMatches) {
      if (!groups.has(match.page)) groups.set(match.page, []);
      groups.get(match.page).push(match);
    }
    return groups;
  }, [activeMatches]);
  const emptyMatches = React.useMemo(() => [], []);
  return <div className="wb-pdf" aria-label={name ? `PDF：${name}` : 'PDF 阅读器'} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); searchInput.current?.focus(); searchInput.current?.select();
    }
  }}>
    <style>{styles}</style>
    <div className="wb-pdf-toolbar" role="toolbar" aria-label="PDF 阅读控制">
      <button disabled={!pdf || state.page <= 1} aria-label="PDF 上一页" onClick={() => navigate(state.page - 1)}>上一页</button>
      <label>页码 <input aria-label="PDF 页码" type="number" min="1" max={pdf?.numPages || 1} disabled={!pdf} value={state.page} style={{ width: 70 }} onChange={(event) => { if (event.target.value) navigate(Number(event.target.value)); }} /></label>
      <span aria-label="PDF 总页数">/ {pdf?.numPages || '—'}</span>
      <button disabled={!pdf || state.page >= pdf.numPages} aria-label="PDF 下一页" onClick={() => navigate(state.page + 1)}>下一页</button>
      <button disabled={!pdf || state.zoom <= 0.25} aria-label="PDF 缩小" onClick={() => zoomTo(state.zoom / 1.25)}>−</button>
      <span>{Math.round(state.zoom * 100)}%</span>
      <button disabled={!pdf || state.zoom >= 4} aria-label="PDF 放大" onClick={() => zoomTo(state.zoom * 1.25)}>＋</button>
      <button disabled={!pdf} onClick={() => {
        const size = sizes[state.page] || sizes[1];
        if (size) zoomTo((Math.max(100, scroller.current?.clientWidth || viewport.width) - 40) / (size.width * PDF_CSS_UNITS));
      }}>适应宽度</button>
      <button disabled={!pdf} onClick={() => zoomTo(1)}>100%</button>
      <label>搜索 <input ref={searchInput} aria-label="PDF 搜索" type="search" maxLength={500} value={state.search} disabled={!pdf} onChange={(event) => { pendingMatch.current = null; publish({ search: event.target.value, searchIndex: 0 }); }} onKeyDown={(event) => {
        if (event.key === 'Enter' && activeMatches.length) { event.preventDefault(); goToMatch(nextPDFSearchIndex(state.searchIndex, event.shiftKey ? -1 : 1, activeMatches.length)); }
      }} /></label>
      <button disabled={!activeMatches.length} aria-label="PDF 上一个匹配" onClick={() => goToMatch(nextPDFSearchIndex(state.searchIndex, -1, activeMatches.length))}>↑</button>
      <button disabled={!activeMatches.length} aria-label="PDF 下一个匹配" onClick={() => goToMatch(nextPDFSearchIndex(state.searchIndex, 1, activeMatches.length))}>↓</button>
    </div>
    {state.search.trim() && <div className="wb-pdf-results" role="status" aria-live="polite">
      <span>{activeMatches.length ? `${Math.min(state.searchIndex + 1, activeMatches.length)} / ${activeMatches.length}${search.limited ? '+' : ''} 个匹配` : search.running || search.query !== state.search ? '正在搜索…' : '没有匹配'}</span>
      {search.running && <span>已搜索 {search.scanned} / {pdf?.numPages || 0} 页</span>}
      {search.limited && <span>已达到 {PDF_MAX_SEARCH_RESULTS} 个结果上限，请缩小搜索范围。</span>}
      {!!search.failed && <span>有 {search.failed} 页无法提取文本。</span>}
    </div>}
    {status === 'loading' && <div className="wb-pdf-message" role="status">正在读取 PDF…</div>}
    {status === 'password' && <form className="wb-pdf-message" onSubmit={(event) => { event.preventDefault(); const request = passwordRequest; setPassword(''); setStatus('loading'); request?.update(password); }}>
      <p role="status">{passwordRequest?.incorrect ? '密码不正确，请重试。' : '此 PDF 需要密码。'}</p>
      <label>PDF 密码 <input aria-label="PDF 密码" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
      <button type="submit">解锁</button> <button type="button" onClick={() => {
        cancelledLoad.current = loadingTask.current; loadingTask.current?.destroy().catch(() => {});
        loading.current = false; setPassword(''); setPasswordRequest(null); setStatus('error');
        callbacks.current.onMetadata?.({ status: 'error', passwordRequired: false, pageCount: 0, numPages: 0, decoder: 'pdfjs-main-thread' });
        const failure = previewError(new Error('已取消输入 PDF 密码。'), 'PDF_PASSWORD_CANCELLED'); setError(failure); reportError(failure);
      }}>取消</button>
    </form>}
    {status === 'error' && <div className="wb-pdf-message" role="alert"><p>{error?.message || 'PDF 加载失败。'}</p><button onClick={() => setReload((value) => value + 1)}>重新读取 PDF</button></div>}
    <div ref={scroller} className="wb-pdf-scroller" tabIndex={0} role="region" aria-label="PDF 页面" style={{ display: status === 'ready' ? undefined : 'none' }} onScroll={scheduleMeasure} onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); navigate(stateRef.current.page + (event.key === 'PageDown' ? 1 : -1)); }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); navigate(event.key === 'Home' ? 1 : pdf?.numPages || 1); }
    }}>
      <div style={{ height: layout.height, width: stageWidth, position: 'relative' }}>
        {mounted.map((box) => <PDFPage key={box.page} pdf={pdf} box={box} stageWidth={stageWidth} zoom={state.zoom} queue={queue} matches={groupedMatches.get(box.page) || emptyMatches} selectedStart={selected?.page === box.page ? selected.start : null} onSize={onSize} onError={reportError} onMatchReady={onMatchReady} />)}
      </div>
    </div>
  </div>;
}
