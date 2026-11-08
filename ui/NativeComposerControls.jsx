import React from 'react';
import {createPortal} from 'react-dom';
import {Modal, Button} from './common.jsx';
import {makeNativeComposerAdapter, useNativeComposerAccess} from './native-composer-adapter.js';
import nativeComposerControlsStyles from './native-composer-controls-styles.js';
import {prepareComposerSession} from './session-prepare.js';
import {NATIVE_VOICE_BUNDLE, NativeSpeechRecording, nativeAudioBase64, observeNativeSpeech, remoteValue, speechAvailability} from './native-speech.js';

/**
 * Public-service footer. Required ctx.inject: sessions, uiSession.
 * Optional integrations (missing services remain explicit and retryable):
 * modelDirectories, remote.permissionPresets, remote.speech, connection, locale.
 * Root standard useSessionAccess / useRemoteAccess must be passed by the Surface.
 * No private slots, navigation selection, prompt, sendSession or ai.run is used.
 */
const noop = () => {};
const noRemoteAccess = () => undefined;
const service = (ctx, name) => {try {return ctx.get?.(name) || ctx[name];} catch {return undefined;}};
const EMPTY_MODELS = Object.freeze({groups: [], failures: [], current: null, pending: null, status: 'idle', error: null});
const errorOf = value => value instanceof Error ? value : new Error(value?.message || String(value));
const labelFor = (value, name = value) => {
  if (value === 'auto') return '自动审查';
  const native = {'read-only': ['Read Only', '仅可查看'], 'workspace-write': ['Workspace Write', '工作区内修改'], 'danger-full-access': ['Full access', '完全权限']};
  const builtIn = native[value];
  if (builtIn && (name === value || name === builtIn[0])) return builtIn[1];
  return typeof name === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') : name;
};

function useSource(source, empty) {
  const subscribe = React.useCallback(listener => source?.subscribe ? source.subscribe(listener) : noop, [source]);
  const snapshot = React.useCallback(() => source?.getSnapshot?.() ?? empty, [source, empty]);
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

function Glyph({kind}) {
  const paths = {
    permission: <><path d="M8 1.5 13 3.5v4c0 3-2.4 5-5 6.5-2.6-1.5-5-3.5-5-6.5v-4z"/><path d="m5.5 7.5 1.7 1.7 3.3-3.4"/></>,
    model: <><rect x="3" y="3" width="10" height="10" rx="2"/><path d="M6 6h4v4H6zM6 1v2m4-2v2M6 13v2m4-2v2M1 6h2m-2 4h2m10-4h2m-2 4h2"/></>,
    mic: <><rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2m-2.5 0h5"/></>,
  };
  return <span className="wb-native-compose-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg></span>;
}

function Notice({error, children, retry, busy = false}) {
  return <div className="wb-native-compose-message" role={error ? 'alert' : 'status'}>{error ? errorOf(error).message : children}{retry && <div className="wb-native-compose-actions"><button type="button" className="wb-native-compose-action" disabled={busy} onClick={retry} data-testid="native-composer-retry">重试</button></div>}</div>;
}

/** Fixed portal inherits the closest Designer theme and follows the visual viewport. */
function Popup({anchorRef, onClose, children, label, testId}) {
  const ref = React.useRef(null), [position, setPosition] = React.useState({visibility: 'hidden'});
  React.useLayoutEffect(() => {
    const anchor = anchorRef.current, panel = ref.current;
    if (!anchor || !panel) return;
    const doc = anchor.ownerDocument, win = doc.defaultView, viewport = win.visualViewport;
    const place = () => {
      const rect = anchor.getBoundingClientRect(), margin = 12, gap = 7;
      const vx = viewport?.offsetLeft || 0, vy = viewport?.offsetTop || 0;
      const vw = viewport?.width || win.innerWidth, vh = viewport?.height || win.innerHeight;
      const width = Math.max(1, Math.min(350, vw - margin * 2));
      const above = Math.max(0, rect.top - vy - margin - gap), below = Math.max(0, vy + vh - margin - rect.bottom - gap);
      const preferAbove = above >= Math.min(panel.scrollHeight, 260) || above >= below;
      const maxHeight = Math.max(1, Math.min(400, preferAbove ? above : below));
      const height = Math.min(panel.scrollHeight, maxHeight);
      setPosition({position: 'fixed', visibility: 'visible', width, maxHeight,
        left: Math.max(vx + margin, Math.min(rect.right - width, vx + vw - margin - width)),
        top: Math.max(vy + margin, preferAbove ? rect.top - gap - height : rect.bottom + gap)});
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(panel); observer?.observe(anchor);
    win.addEventListener('resize', place); win.addEventListener('scroll', place, true);
    viewport?.addEventListener('resize', place); viewport?.addEventListener('scroll', place);
    const pointer = event => {if (!panel.contains(event.target) && !anchor.contains(event.target)) onClose(false);};
    const key = event => {if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); onClose(true);}};
    doc.addEventListener('pointerdown', pointer, true); doc.addEventListener('keydown', key, true);
    const focus = panel.querySelector('input,button[aria-checked="true"]:not(:disabled),button:not(:disabled)');
    focus?.focus({preventScroll: true});
    return () => {
      observer?.disconnect(); win.removeEventListener('resize', place); win.removeEventListener('scroll', place, true);
      viewport?.removeEventListener('resize', place); viewport?.removeEventListener('scroll', place);
      doc.removeEventListener('pointerdown', pointer, true); doc.removeEventListener('keydown', key, true);
    };
  }, [anchorRef, onClose]);
  const anchor = anchorRef.current;
  if (!anchor) return null;
  return createPortal(<div ref={ref} className="wb-native-compose-popup" role="dialog" aria-label={label} style={position} data-testid={testId} onKeyDown={event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.target.tagName !== 'INPUT') {
      const rows = [...ref.current.querySelectorAll('button:not(:disabled)')];
      if (!rows.length) return;
      event.preventDefault();
      const index = rows.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next]?.focus();
    }
  }}>{children}</div>, anchor.closest('.wb') || anchor.ownerDocument.body);
}

function usePopup(locked) {
  const [open, setOpen] = React.useState(false), anchorRef = React.useRef(null);
  const close = React.useCallback((focus = true) => {setOpen(false); if (focus) anchorRef.current?.focus();}, []);
  React.useEffect(() => {if (locked) close(false);}, [locked, close]);
  return {open: open && !locked, setOpen, anchorRef, close};
}

function assertOwned(ctx, binding, reference) {
  if (!binding || reference.binding !== binding || ctx.sessions.binding(reference.sessionId) !== binding) throw new Error('Designer Session reference belongs to an expired generation');
  const snapshot = binding.session.getSnapshot();
  if (snapshot.openState === 'error') throw errorOf(snapshot.openError || 'Designer Session history could not open');
  return binding.session;
}

/** Real prepare -> retain -> exact-generation readiness, with one owning request. */
export function useNativeDesignerComposer({ctx, api, projectId, onSessionReady, useSessionAccess, useRemoteAccess, composerRef, locked = false, onError}) {
  const callbacks = React.useRef({onSessionReady, onError}); callbacks.current = {onSessionReady, onError};
  const [attempt, setAttempt] = React.useState(0), [state, setState] = React.useState(null);
  const owner = React.useMemo(() => ({}), [ctx, api, projectId, attempt]);
  const activeOwner = React.useRef(owner), preparationFailure=React.useRef(null); activeOwner.current = owner;
  const report = React.useCallback(error => {try {callbacks.current.onError?.(errorOf(error));} catch { /* UI still owns the failure */ }}, []);
  React.useEffect(() => {
    let alive = true, reference, stop;
    const abort = new AbortController();
    const owns = () => alive && activeOwner.current === owner;
    const fail = error => {
      if (!owns()) return;
      stop?.(); stop = undefined; abort.abort(); reference?.release();
      const failure=errorOf(error);preparationFailure.current=failure;
      setState({owner, error: failure}); report(failure);
    };
    setState({owner});
    (async () => {
      try {
        const adapter = makeNativeComposerAdapter(ctx);
        if (typeof api !== 'function') throw new Error('Designer composer.prepare service is unavailable');
        const prepared = await prepareComposerSession(api,projectId ? {projectId} : {},{signal:abort.signal});
        if (!owns()) return;
        if (typeof prepared?.sessionId !== 'string' || !prepared.sessionId.trim()) throw new Error('composer.prepare did not return a real Native Session');
        reference = adapter.retainSession(prepared.sessionId, {signal: abort.signal});
        const binding = await adapter.readySession(reference);
        if (!owns()) return;
        assertOwned(ctx, binding, reference);
        const inspect = () => {try {assertOwned(ctx, binding, reference);} catch (error) {fail(error);}};
        stop = binding.session.subscribe?.(inspect);
        assertOwned(ctx, binding, reference);
        setState({owner, sessionId: prepared.sessionId, binding, reference, adapter});
        // Only this still-mounted preparation owner may publish the Session.
        const recovered=preparationFailure.current;preparationFailure.current=null;
        try {callbacks.current.onSessionReady?.(prepared.sessionId,recovered);} catch (error) {report(error);}
      } catch (error) {fail(error);}
    })();
    return () => {alive = false; stop?.(); abort.abort(); reference?.release();};
  }, [ctx, api, projectId, owner, report]);
  const current = state?.owner === owner ? state : null;
  const sessionId = current?.sessionId, ready = Boolean(sessionId && current.binding && !current.error);
  const access = useNativeComposerAccess({sessionId: ready ? sessionId : undefined, useSessionAccess});
  const speechAccess = (useRemoteAccess || noRemoteAccess)('speech/transcribe');
  const followAccess = (useRemoteAccess || noRemoteAccess)('speech/follow');
  const retry = React.useCallback(() => setAttempt(value => value + 1), []);
  const controls = ready ? {ctx, sessionId, binding: current.binding, reference: current.reference, adapter: current.adapter, locked, report} : null;
  return {
    sessionId, ready, error: current?.error || null,
    canUpload: ready && !locked && access.canUpload,
    canPrompt: ready && !locked && access.canPrompt,
    canCancel: ready && access.canCancel,
    leftControls: <React.Fragment key={projectId || 'home'}><style data-designer-native-composer="true">{nativeComposerControlsStyles}</style>{controls ? <PermissionControl key={sessionId} {...controls}/> : <SessionStatus error={current?.error} retry={retry}/>}</React.Fragment>,
    rightControls: controls ? <React.Fragment key={sessionId}><ModelControl {...controls}/><VoiceControl {...controls} composerRef={composerRef} speechAccess={speechAccess} followAccess={followAccess}/></React.Fragment> : null,
  };
}

function SessionStatus({error, retry}) {
  const popup = usePopup(false);
  return <><button type="button" className="wb-native-compose-control" ref={popup.anchorRef} data-testid="native-composer-session-status" data-state={error?'error':'connecting'} aria-label={error?'重新连接会话':'正在连接会话'} title={error?'连接失败，点击重试':'正在连接会话'} aria-expanded={popup.open} onClick={() => error ? retry() : popup.setOpen(!popup.open)}><Glyph kind="permission"/><span className="wb-native-compose-label">{error ? '重连' : '连接中'}</span></button>{popup.open && <Popup {...popup} onClose={popup.close} label="会话连接"><Notice>正在连接…</Notice></Popup>}</>;
}

function ModelControl({ctx, sessionId, binding, reference, adapter, locked, report}) {
  const popup = usePopup(locked), [directory, setDirectory] = React.useState(null), [failure, setFailure] = React.useState(null), [attempt, setAttempt] = React.useState(0), [query, setQuery] = React.useState(''), [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(false), active = React.useRef(null), submitting = React.useRef(false);
  const state = useSource(directory?.store, EMPTY_MODELS);
  const load = React.useCallback(() => setAttempt(value => value + 1), []);
  React.useEffect(() => {
    let alive = true; mounted.current = true; setFailure(null); setDirectory(null);
    (async () => {try {
      assertOwned(ctx, binding, reference);
      const value = adapter.modelDirectoryFor(sessionId); setDirectory(value); active.current = value;
      await value.load();
    } catch (error) {if (alive) {setFailure(errorOf(error)); report(error);}}})();
    return () => {alive = false; mounted.current = false; active.current = null;};
  }, [ctx, binding, reference, adapter, sessionId, attempt, report]);
  const choices = state.groups.flatMap(group => group.models.map(model => ({group, model})));
  const current = choices.find(({group, model}) => group.id === state.current?.provider && model.id === state.current?.model);
  const reasoning = current?.model.reasoning, effort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
  const effortLabel = reasoning?.efforts?.find(item => item.id === effort)?.name;
  const label = current?.model.name || '模型', title = [label, effortLabel].filter(Boolean).join(' · ');
  const selecting = busy || state.pending != null;
  const select = async (groupId, modelId, reasoningEffort, explicitEffort = false) => {
    if (locked || selecting || submitting.current || !directory) return;
    const own = directory;
    try {
      assertOwned(ctx, binding, reference);
      const fresh = directory.store.getSnapshot();
      const model = fresh.groups.find(group => group.id === groupId)?.models.find(model => model.id === modelId);
      if (!model) throw new Error('该模型已不在 Native 目录中，请重试。');
      if (explicitEffort && reasoningEffort !== undefined && !model.reasoning?.efforts.some(item => item.id === reasoningEffort)) throw new Error('该推理强度未由模型广告。');
      const selectedEffort = explicitEffort ? reasoningEffort : model.reasoning?.defaultEffort;
      submitting.current = true; setBusy(true); setFailure(null);
      remoteValue(await directory.select({provider: groupId, model: modelId, ...(selectedEffort === undefined ? {} : {reasoningEffort: selectedEffort})}), 'Model selection');
      if (mounted.current && active.current === own) popup.close();
    } catch (error) {if (mounted.current && active.current === own) {setFailure(errorOf(error)); report(error);}}
    finally {if (mounted.current && active.current === own) {submitting.current = false; setBusy(false);}}
  };
  const open = () => {setQuery(''); popup.setOpen(!popup.open);};
  return <><button type="button" className="wb-native-compose-control wb-native-compose-model" ref={popup.anchorRef} disabled={locked} aria-label={`选择模型，当前：${title}`} title={title} aria-expanded={popup.open} aria-haspopup="dialog" data-testid="native-composer-model" onClick={open}><Glyph kind="model"/><span className="wb-native-compose-label">{label}</span>{effortLabel && <span className="wb-native-compose-label wb-native-compose-effort">{effortLabel}</span>}<span className="wb-native-compose-chevron" aria-hidden="true">{selecting ? '…' : '⌄'}</span></button>
    {popup.open && <Popup anchorRef={popup.anchorRef} onClose={popup.close} label="模型与推理强度" testId="native-composer-model-menu">
      {choices.length > 4 && <input className="wb-native-compose-search" aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={event => setQuery(event.target.value)}/>}
      {(failure || state.error) && <Notice error={failure || state.error} retry={load} busy={selecting}/>}
      {(state.status === 'loading' || !directory && !failure) && <Notice>正在读取 Native 模型目录…</Notice>}
      <div className="wb-native-compose-scroll" role="group" aria-label="模型">
        {state.groups.map(group => {
          const models = group.models.filter(model => model.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
          return models.length ? <React.Fragment key={group.id}><div className="wb-native-compose-heading">{group.provider?.name || group.name}</div>{models.map(model => <button key={model.id} type="button" className="wb-native-compose-option" role="menuitemradio" aria-checked={state.current?.provider === group.id && state.current?.model === model.id} disabled={selecting || locked} title={model.name} data-testid="native-composer-model-option" data-provider-id={group.id} data-model-id={model.id} onClick={() => select(group.id, model.id)}><span className="wb-native-compose-option-copy wb-native-compose-label">{model.name}</span><span className="wb-native-compose-check">{state.current?.provider === group.id && state.current?.model === model.id ? '✓' : ''}</span></button>)}</React.Fragment> : null;
        })}
        {!choices.some(({model}) => model.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && state.status !== 'loading' && <Notice>{choices.length ? '没有匹配的模型。' : '没有可用模型。'}</Notice>}
        {state.failures.map((failure, index) => <Notice key={failure.id || index} error={new Error(`${failure.name || failure.id}: ${failure.message}`)} retry={load} busy={selecting}/>)}
        {reasoning && <><div className="wb-native-compose-heading">推理强度</div>{[...(reasoning.defaultEffort === undefined ? [{id: undefined, name: '服务默认'}] : []), ...reasoning.efforts].map(item => <button key={item.id ?? 'provider-default'} type="button" className="wb-native-compose-option" role="menuitemradio" aria-checked={effort === item.id} disabled={selecting || locked} data-testid="native-composer-effort-option" data-effort={item.id} onClick={() => select(current.group.id, current.model.id, item.id, true)}><span className="wb-native-compose-option-copy wb-native-compose-label">{item.name}</span><span className="wb-native-compose-check">{effort === item.id ? '✓' : ''}</span></button>)}</>}
      </div>
    </Popup>}
  </>;
}

function usePermissionCatalog(ctx, report) {
  const [state, setState] = React.useState({catalog: null, error: null, loading: true, epoch: 0}), [attempt, setAttempt] = React.useState(0);
  const latest = React.useRef(state), serial = React.useRef(0);
  React.useEffect(() => {
    let alive = true, epoch = 0, stopEvent, stopGeneration;
    const publish = value => {latest.current = value; setState(value);};
    const connection = service(ctx, 'connection'), generation = connection?.generation;
    const read = async () => {
      const own = epoch = ++serial.current, id = generation?.getSnapshot?.()?.id;
      publish({catalog: null, error: null, loading: true, epoch: own});
      try {
        if (!ctx.remote?.permissionPresets?.catalog) throw new Error('DSH permissionPresets service is unavailable');
        if (!generation) throw new Error('DSH connection generation service is unavailable');
        if (id === undefined) throw new Error('DSH permission catalog has no active Host connection');
        const value = remoteValue(await ctx.remote.permissionPresets.catalog(), 'Permission catalog');
        if (!Array.isArray(value?.options)) throw new Error('DSH permission catalog has no complete options');
        if (alive && own === epoch && id === generation.getSnapshot()?.id) publish({catalog: value, error: null, loading: false, epoch: own});
      } catch (error) {if (alive && own === epoch && id === generation?.getSnapshot?.()?.id) {publish({catalog: null, error: errorOf(error), loading: false, epoch: own}); report(error);}}
    };
    try {
      stopEvent = ctx.remote?.$on?.('permission-presets/catalog-changed', read);
      stopGeneration = generation?.subscribe(read);
      read();
    } catch (error) {epoch = ++serial.current; publish({catalog: null, error: errorOf(error), loading: false, epoch}); report(error);}
    return () => {alive = false; epoch = ++serial.current; latest.current = {catalog: null, error: null, loading: true, epoch}; stopEvent?.(); stopGeneration?.();};
  }, [ctx, attempt, report]);
  return {...state, retry: React.useCallback(() => setAttempt(value => value + 1), []), latest};
}

function PermissionControl({ctx, binding, reference, adapter, sessionId, locked, report}) {
  const popup = usePopup(locked), catalog = usePermissionCatalog(ctx, report);
  const projection = React.useMemo(() => {try {return adapter.permissionProjectionFor(sessionId);} catch {return undefined;}}, [adapter, sessionId, catalog.epoch]);
  const selection = useSource(projection, undefined);
  const [confirm, setConfirm] = React.useState(null), [acknowledged, setAcknowledged] = React.useState(false), [busy, setBusy] = React.useState(false), [failure, setFailure] = React.useState(null);
  const alive = React.useRef(true), submitting = React.useRef(false), current = React.useRef({locked, selection, epoch: catalog.epoch}); current.current = {locked, selection, epoch: catalog.epoch};
  React.useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  const closeConfirmation = React.useCallback(() => {setConfirm(null); setAcknowledged(false);}, []);
  React.useEffect(() => {popup.close(false); closeConfirmation();}, [catalog.epoch, locked, selection === undefined, popup.close, closeConfirmation]);
  const selected = catalog.catalog?.options.find(option => option.value === selection?.currentValue);
  const label = selection ? labelFor(selection.currentValue, selected?.name || selection.currentValue) : '权限状态不可用';
  const submit = async (value, epoch) => {
    if (current.current.locked || submitting.current) return;
    try {
      const snapshot = catalog.latest.current;
      if (epoch !== snapshot.epoch || !snapshot.catalog?.options.some(option => option.value === value && value !== 'custom')) throw new Error('权限目录已更新，请重新选择。');
      if (current.current.selection === undefined) throw new Error('Native Session 权限投影尚不可用。');
      const session = assertOwned(ctx, binding, reference);
      submitting.current = true; setBusy(true); setFailure(null); closeConfirmation();
      const result = remoteValue(await session.command(`/permission ${value}`), 'Permission selection');
      if (!result?.matched) throw new Error('The host offers no /permission command');
      if (alive.current) popup.close();
    } catch (error) {if (alive.current) {setFailure(errorOf(error)); report(error); popup.setOpen(true);}}
    finally {submitting.current = false; if (alive.current) setBusy(false);}
  };
  const choose = value => {
    if (locked || busy || value === 'custom' || value === selection?.currentValue) {popup.close(); return;}
    if (!catalog.catalog?.options.some(option => option.value === value)) return;
    if (value === 'danger-full-access' || value === 'auto') {popup.close(); setConfirm({value, epoch: catalog.epoch}); setAcknowledged(false);}
    else submit(value, catalog.epoch);
  };
  const auto = confirm?.value === 'auto';
  const shortLabel={'read-only':'只读','workspace-write':'编辑','danger-full-access':'完全访问',auto:'自动',custom:'自定义'}[selection?.currentValue]||'权限';
  return <><button ref={popup.anchorRef} type="button" className="wb-native-compose-control wb-native-compose-permission" disabled={locked || busy} title={`访问模式，当前：${label}`} aria-label={`访问模式，当前：${label}`} aria-haspopup="dialog" aria-expanded={popup.open} data-testid="native-composer-permission" onClick={() => popup.setOpen(!popup.open)}><Glyph kind="permission"/><span className="wb-native-compose-label">{shortLabel}</span><span className="wb-native-compose-chevron" aria-hidden="true">{busy ? '…' : '⌄'}</span></button>
    {popup.open && <Popup anchorRef={popup.anchorRef} onClose={popup.close} label="Session 权限" testId="native-composer-permission-menu">
      {(catalog.error || failure) && <Notice error={failure || catalog.error} retry={() => {setFailure(null); catalog.retry();}} busy={busy}/>}
      {catalog.loading && <Notice>正在读取 Native 权限目录…</Notice>}
      {selection === undefined && <Notice retry={catalog.retry}>当前 Session 未提供 permissions 投影。</Notice>}
      <div className="wb-native-compose-scroll" role="group" aria-label="访问模式">{catalog.catalog?.options.filter(option => option.value !== 'custom').map(option => <button key={option.value} type="button" className="wb-native-compose-option" role="menuitemradio" aria-checked={selection?.currentValue === option.value} disabled={locked || busy || selection === undefined} data-testid="native-composer-permission-option" data-preset={option.value} onClick={() => choose(option.value)}><span className="wb-native-compose-option-copy"><span className="wb-native-compose-label">{labelFor(option.value, option.name)}</span>{option.description && <span className="wb-native-compose-detail">{option.description}</span>}</span>{option.value === 'auto' && <span className="wb-native-compose-badge">EXP</span>}<span className="wb-native-compose-check">{selection?.currentValue === option.value ? '✓' : ''}</span></button>)}</div>
    </Popup>}
    {confirm && !locked && createPortal(<Modal title={auto ? '确认启用自动审查（实验）？' : '确认启用完全权限？'} onClose={closeConfirmation} className="wb-native-compose-confirm" ><p className="wb-native-compose-confirm-copy">{auto ? '自动审查不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查；审查拒绝的调用由你批准或拒绝。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。' : '启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。'}</p><label className="wb-native-compose-acknowledge"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} data-testid="native-composer-permission-acknowledge"/>{auto ? '我已了解这些风险，并愿意继续' : '我已了解风险，并愿意继续'}</label><div className="wb-native-compose-actions"><Button onClick={closeConfirmation}>取消</Button><Button primary disabled={!acknowledged || busy || catalog.epoch !== confirm.epoch || !catalog.catalog?.options.some(option => option.value === confirm.value)} data-testid="native-composer-permission-confirm" onClick={() => {if (acknowledged) submit(confirm.value, confirm.epoch);}}>{auto ? '启用自动审查' : '启用完全权限'}</Button></div></Modal>, popup.anchorRef.current?.closest('.wb') || document.body)}
  </>;
}

function VoiceControl({ctx, sessionId, binding, reference, locked, composerRef, speechAccess, followAccess, report}) {
  const popup = usePopup(false), [readiness, setReadiness] = React.useState({catalog: null, connected: false, error: null}), [attempt, setAttempt] = React.useState(0);
  const [phase, setPhase] = React.useState('idle'), [message, setMessage] = React.useState(''), [failure, setFailure] = React.useState(null), [pending, setPending] = React.useState('');
  const operation = React.useRef(null), generation = React.useRef(0), alive = React.useRef(false), props = React.useRef(null);
  props.current = {locked, composerRef, speechAccess, readiness};
  const availability = speechAvailability(readiness, speechAccess);
  const cancel = React.useCallback((update = true) => {
    ++generation.current;
    const active = operation.current; operation.current = null;
    if (active) {clearTimeout(active.timer); active.abort.abort(); active.capture.dispose().catch(noop);}
    if (update && alive.current) {setPhase('idle'); setMessage(''); setFailure(null);}
  }, []);
  React.useEffect(() => {
    alive.current = true;
    const visibility = () => {if (document.hidden) {cancel(); popup.close(false);}};
    const blur = () => {if (operation.current?.phase === 'recording') cancel();};
    const escape = event => {if (event.key === 'Escape' && operation.current) {event.preventDefault(); cancel();}};
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur); document.addEventListener('keydown', escape);
    return () => {alive.current = false; cancel(false); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur); document.removeEventListener('keydown', escape);};
  }, [sessionId, cancel, popup.close]);
  React.useEffect(() => {
    let active = true;
    setReadiness({catalog: null, connected: false, error: followAccess === true ? null : new Error(followAccess === false ? '当前连接没有语音服务状态读取权限。' : '正在确认语音服务状态读取权限。')});
    if (followAccess !== true) return;
    const observer = observeNativeSpeech(ctx, value => {if (active) setReadiness(value);});
    return () => {active = false; observer.dispose().catch(noop);};
  }, [ctx, followAccess, attempt]);
  React.useEffect(() => {if (locked || speechAccess !== true || followAccess !== true || !readiness.connected) cancel();}, [locked, speechAccess, followAccess, readiness.connected, cancel]);
  const fail = error => {if (alive.current) {setFailure(errorOf(error)); setPhase('feedback'); popup.setOpen(true); report(error);}};
  const finish = async () => {
    const active = operation.current;
    if (!active || active.phase !== 'recording') return;
    active.phase = 'transcribing'; clearTimeout(active.timer); setPhase('transcribing');
    const accepts = () => alive.current && operation.current === active && generation.current === active.generation && !active.abort.signal.aborted;
    try {
      const audio = await active.capture.stop(active.maxDurationSeconds);
      if (!accepts()) return;
      assertOwned(ctx, binding, reference);
      if (props.current.locked || props.current.speechAccess !== true) throw new Error('当前无法插入语音转写。');
      if (audio.byteLength > active.maxAudioBytes) throw new Error('录音已超过 DSH 允许的音频大小。');
      const result = remoteValue(await ctx.remote.speech.transcribe({audioBase64: nativeAudioBase64(audio), ...active.selection}, active.abort.signal), 'Speech transcription');
      if (!accepts()) return;
      assertOwned(ctx, binding, reference);
      const text = result?.text;
      if (typeof text !== 'string') throw new Error('DSH 未返回语音转写文本。');
      if (!text.trim()) {setMessage('没有识别到语音，请重新录音。'); setPhase('feedback'); popup.setOpen(true); return;}
      if (props.current.locked || !props.current.composerRef?.current?.insertText(text, active.span)) {
        setPending(text); setMessage('草稿已变更，转写文本已保留。请选择插入或丢弃。'); setPhase('feedback'); popup.setOpen(true);
      } else {props.current.composerRef?.current?.focus?.(); setPhase('idle'); popup.close(false);}
    } catch (error) {if (accepts()) fail(error);}
    finally {await active.capture.dispose().catch(noop); if (accepts()) operation.current = null;}
  };
  const start = async () => {
    if (props.current.locked || operation.current) return;
    const usable = speechAvailability(props.current.readiness, props.current.speechAccess);
    if (!usable.ready || !ctx.remote?.speech?.transcribe) {setMessage(usable.reason || 'DSH speech.transcribe service is unavailable'); setFailure(null); popup.setOpen(true); return;}
    if (pending) {popup.setOpen(true); return;}
    try {assertOwned(ctx, binding, reference);} catch (error) {fail(error); return;}
    const active = {abort: new AbortController(), generation: ++generation.current, phase: 'requesting', span: props.current.composerRef?.current?.captureInsertion(), selection: {...usable.catalog.selection}, maxDurationSeconds: usable.catalog.maxDurationSeconds, maxAudioBytes: usable.catalog.maxAudioBytes};
    if (!active.span) {setMessage('当前草稿无法捕获插入位置，请结束输入后重试。'); popup.setOpen(true); return;}
    active.capture = new NativeSpeechRecording({maxAudioBytes: active.maxAudioBytes, onError: error => {if (operation.current === active) {cancel(false); fail(error);}}});
    operation.current = active; setFailure(null); setMessage(''); setPhase('requesting'); popup.close(false);
    try {
      await active.capture.start();
      if (!alive.current || operation.current !== active || active.abort.signal.aborted) return;
      active.phase = 'recording'; setPhase('recording');
      // PCM overhead participates in the same advertised limit as duration.
      const duration = Math.min(active.maxDurationSeconds, (active.maxAudioBytes - 44) / 32000);
      active.timer = setTimeout(finish, Math.max(1, duration * 1000));
    } catch (error) {if (alive.current && operation.current === active) {operation.current = null; fail(error);}}
  };
  const insertPending = () => {
    if (locked || !pending) return;
    try {
      assertOwned(ctx, binding, reference);
      const input = composerRef?.current, span = input?.captureInsertion();
      if (!span || !input.insertText(pending, span)) {setMessage('当前草稿无法插入，转写文本仍已保留。'); return;}
      setPending(''); setMessage(''); setFailure(null); setPhase('idle'); popup.close(false); input.focus?.();
    } catch (error) {fail(error);}
  };
  const settings = service(ctx, 'pluginNavigation');
  const recording = ['requesting', 'recording', 'transcribing'].includes(phase);
  return <>
    <button ref={popup.anchorRef} type="button" className="wb-native-compose-control" disabled={locked} aria-label={pending ? '查看保留的语音转写' : availability.ready ? '开始语音输入，使用系统默认麦克风' : '语音输入设置与状态'} title={availability.ready ? '语音输入 · 系统默认麦克风' : undefined} aria-expanded={popup.open} aria-haspopup="dialog" data-testid="native-composer-voice" onMouseDown={event => event.preventDefault()} onClick={() => recording ? popup.setOpen(!popup.open) : start()}><Glyph kind="mic"/></button>
    {recording && <span className="wb-native-compose-recording" role="status" data-testid="native-composer-recording"><span className="wb-native-compose-recording-indicator"/>{phase === 'requesting' ? '等待麦克风…' : phase === 'transcribing' ? '转写中…' : '录音中'}{phase === 'recording' && <button type="button" className="wb-native-compose-action" data-testid="native-composer-voice-stop" onClick={finish}>停止</button>}<button type="button" className="wb-native-compose-action" data-testid="native-composer-voice-cancel" onClick={() => cancel()}>取消</button></span>}
    {popup.open && <Popup anchorRef={popup.anchorRef} onClose={popup.close} label="语音输入" testId="native-composer-voice-panel">
      <Notice error={failure}>{pending ? message : message || availability.reason || '使用 DSH 语音服务，将转写文本插入草稿。'}</Notice>
      <Notice>录音使用系统默认麦克风；识别服务与语言由 DSH 管理。</Notice>
      {pending && <><div className="wb-native-compose-transcript" data-testid="native-composer-voice-transcript">{pending}</div><div className="wb-native-compose-actions"><button type="button" className="wb-native-compose-action" disabled={locked} data-testid="native-composer-voice-insert" onClick={insertPending}>插入草稿</button><button type="button" className="wb-native-compose-action" data-testid="native-composer-voice-discard" onClick={() => {setPending(''); setMessage(''); setFailure(null); setPhase('idle'); popup.close();}}>丢弃</button></div></>}
      {!pending && !recording && <div className="wb-native-compose-actions">{availability.ready && <button type="button" className="wb-native-compose-action" disabled={locked} onClick={start}>重新录音</button>}<button type="button" className="wb-native-compose-action" data-testid="native-composer-voice-retry" onClick={() => {setAttempt(value => value + 1); setFailure(null); setMessage('');}}>刷新服务状态</button>{settings?.openBundle && <button type="button" className="wb-native-compose-action" data-testid="native-composer-voice-settings" onClick={() => {try {Promise.resolve(settings.openBundle(NATIVE_VOICE_BUNDLE)).catch(fail);} catch (error) {fail(error);}}}>打开 DSH 识别设置</button>}</div>}
    </Popup>}
  </>;
}
