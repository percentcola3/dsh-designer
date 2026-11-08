import React from 'react';
import {createPortal} from 'react-dom';
import designerComposerStyles from './designer-composer-styles.js';
import {Modal,Button} from './common.jsx';
import {detectMention, mentionKey, applyInsertion, appendReference, mentionCandidates, isAvailable} from './composer-mentions.js';

function Glyph({name, size = 16}) {
  const paths = {plus: <path d="M12 5v14M5 12h14"/>, up: <path d="M12 19V5m-6 6 6-6 6 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, file: <><path d="M14 3H6v18h12V7z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>, project: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/></>, system: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/></>, down: <path d="m7 10 5 5 5-5"/>, stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
const errorMessage = error => error?.message || String(error || '操作失败，请重试。');

// Popups live inside the nearest workbench to inherit its theme, outside scrolling panels.
function ComposerPopup({rootRef, anchor, variant, popupRef, children, label, onClose, onKeyDown, focusSearch}) {
  const [position, setPosition] = React.useState(null);
  React.useLayoutEffect(() => {if (focusSearch) popupRef.current?.querySelector('input')?.focus();}, [focusSearch, popupRef]);
  React.useLayoutEffect(() => {
    const trigger = anchor || rootRef.current;
    if (!trigger) return;
    const place = () => {
      const rect = trigger.getBoundingClientRect(), width = Math.max(0, Math.min(360, window.innerWidth - 16));
      const above = Math.max(0, rect.top - 16), below = Math.max(0, window.innerHeight - rect.bottom - 16);
      const up = variant === 'canvas' ? above >= Math.min(210, below) : below < 220 && above > below;
      const available = up ? above : below, maxHeight = Math.min(380, available);
      const height = Math.min(popupRef.current?.scrollHeight || 340, maxHeight);
      setPosition({width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: up ? Math.max(8, rect.top - height - 8) : Math.min(window.innerHeight - height - 8, rect.bottom + 8), maxHeight});
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    if (popupRef.current) observer?.observe(popupRef.current);
    observer?.observe(trigger);
    return () => {window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer?.disconnect();};
  }, [anchor, variant, rootRef, popupRef]);
  React.useEffect(() => {
    const outside = event => {
      if (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true);};
  }, [onClose, rootRef, popupRef]);
  const host = rootRef.current?.closest('.wb') || (typeof document !== 'undefined' ? document.body : null);
  if (!host) return null;
  return createPortal(<div ref={popupRef} className="wb-designer-compose wb-designer-compose-popup" role="dialog" aria-label={label} style={position || {visibility: 'hidden'}} onKeyDown={onKeyDown}>
    <style>{designerComposerStyles}</style>{children}
  </div>, host);
}

/** Controlled text composer. Native permissions/model/voice controls are supplied by the host. */
const DesignerComposer = React.forwardRef(function DesignerComposer({
  variant = 'home', value = '', onChange, onSubmit, disabled = false, submitting = false, submitDisabled = false, stopDisabled = false, running = false, onStop,
  placeholder = '描述你的想法，输入 @ 引用项目…', ariaLabel = '设计需求', maxLength = 20000,
  api, projects = [], knowledge = [], projectId, contextSessionId, onPickDirectory, files = [], references = [], onReferencesChange,
  attachments = [], onFiles, onRemoveAttachment, canAttach = false,
  systems = [], systemChoice = null, onSystemChange, leftControls, rightControls, onError,
}, forwardedRef) {
  const rootRef = React.useRef(null), inputRef = React.useRef(null), fileRef = React.useRef(null), systemRef = React.useRef(null), popupRef = React.useRef(null);
  const composing = React.useRef(false), selection = React.useRef(null), dismissed = React.useRef(''), request = React.useRef(0), submitLock = React.useRef(false);
  const [menu, setMenu] = React.useState(null), [active, setActive] = React.useState(0), [busy, setBusy] = React.useState(false);
  const [menuError, setMenuError] = React.useState(null), [localError, setLocalError] = React.useState(null), [systemDetails, setSystemDetails] = React.useState({}),[directoryDialog,setDirectoryDialog]=React.useState(null),[directoryBusy,setDirectoryBusy]=React.useState(false);
  const menuRef = React.useRef(menu), retryRef = React.useRef(null), id = React.useId();
  const live = React.useRef({owner: {}, revision: 0, value, mounted: true, editable: !disabled && !submitting, context: [variant, projectId]});
  const state = live.current;
  if (state.context[0] !== variant || state.context[1] !== projectId) {
    state.owner = {}; state.revision++; state.context = [variant, projectId]; request.current++;
  }
  if (state.value !== value || state.editable !== (!disabled && !submitting)) state.revision++;
  Object.assign(state, {value, editable: !disabled && !submitting, composing: composing.current, onChange, onReferencesChange, references, onError, onSystemChange, onFiles, onSubmit, onStop, disabled, submitting, submitDisabled, stopDisabled, running, maxLength});
  menuRef.current = menu;
  React.useEffect(() => {
    live.current.mounted = true;
    return () => {live.current.mounted = false; live.current.owner = {}; live.current.revision++; request.current++;};
  }, []);
  const closeMenu = React.useCallback(() => {
    const current = menuRef.current;
    if (current?.kind === 'mentions') dismissed.current = mentionKey(current.mention);
    request.current++; menuRef.current = null; setMenu(null); setBusy(false); setMenuError(null); retryRef.current = null;
  }, []);
  React.useEffect(() => {closeMenu(); dismissed.current = ''; setSystemDetails({}); setLocalError(null);}, [variant, projectId, closeMenu]);
  React.useEffect(() => {if (disabled || submitting) closeMenu();}, [disabled, submitting, closeMenu]);

  function report(error) {if (live.current.mounted) {setLocalError(error); live.current.onError?.(error);}}
  function captureInsertion() {
    const current = live.current, input = inputRef.current;
    return {owner: current.owner, revision: current.revision, start: input?.selectionStart ?? current.value.length, end: input?.selectionEnd ?? current.value.length};
  }
  function commitText(next, caret) {
    const current = live.current;
    current.value = next; current.revision++;
    if (caret !== undefined) selection.current = {owner: current.owner, revision: current.revision, caret};
    current.onChange?.(next);
  }
  function insertText(text, span) {
    const result = applyInsertion(live.current, text, span, live.current.maxLength);
    if (!result || typeof live.current.onChange !== 'function') return false;
    closeMenu(); commitText(result.value, result.caret); inputRef.current?.focus();
    return true;
  }
  React.useImperativeHandle(forwardedRef, () => ({captureInsertion, insertText, focus: () => inputRef.current?.focus()}));
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    const min = variant === 'canvas' ? 64 : 140, max = variant === 'canvas' ? 180 : 320;
    input.style.height = `${Math.min(max, Math.max(min, input.scrollHeight))}px`;
    const saved = selection.current;
    if (saved && saved.owner === live.current.owner && saved.revision === live.current.revision && input.value === live.current.value) {
      input.setSelectionRange(saved.caret, saved.caret); selection.current = null;
    }
    const currentMenu = menuRef.current;
    if (currentMenu?.kind === 'mentions' && mentionKey(detectMention(input.value, input.selectionStart, input.selectionEnd)) !== mentionKey(currentMenu.mention)) closeMenu();
  });
  function updateMention(input) {
    if (!live.current.editable || composing.current) return;
    const mention = detectMention(live.current.value, input.selectionStart, input.selectionEnd), key = mentionKey(mention);
    if (!mention) {if (menuRef.current?.kind === 'mentions') closeMenu(); dismissed.current = ''; return;}
    if (key === dismissed.current) return;
    const previous = menuRef.current;
    if (previous?.kind === 'mentions' && mentionKey(previous.mention) === key) return;
    dismissed.current = ''; request.current++; setBusy(false); setMenuError(null); retryRef.current = null; setActive(0);
    const next = {kind: 'mentions', mention, search: mention.query, token: {}};
    menuRef.current = next; setMenu(next);
  }
  const candidates = menu?.kind === 'mentions' ? mentionCandidates({variant, projects, knowledge, projectId, files, query: menu.search}) : [];
  const candidateKey = candidates.map(c => c.key).join('|');
  React.useEffect(() => {setActive(0);}, [candidateKey]);
  React.useEffect(() => {popupRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({block: 'nearest'});}, [active]);

  async function chooseMention(candidate) {
    const currentMenu = menuRef.current, current = live.current;
    if (currentMenu?.kind !== 'mentions' || !current.editable || busy || typeof current.onReferencesChange !== 'function') return;
    if (current.value.slice(currentMenu.mention.start, currentMenu.mention.end) !== `@${currentMenu.mention.query}`) {closeMenu(); return;}
    const span = {...currentMenu.mention, owner: current.owner, revision: current.revision};
    const sequence = ++request.current, token = currentMenu.token, search = currentMenu.search;
    const valid = () => live.current.mounted && live.current.editable && !composing.current && live.current.owner === span.owner
      && live.current.revision === span.revision && menuRef.current?.token === token && menuRef.current.search === search && request.current === sequence;
    setBusy(true); setMenuError(null); retryRef.current = () => chooseMention(candidate);
    try {
      let reference;
      const item = candidate.item;
      if (!isAvailable(item)) throw new Error('引用已不可用，请重新选择。');
      if (candidate.kind === 'project') {
        reference = {type: 'project', referencedProjectId: item.id, resourceId: `project:${item.id}`, sourceVersion: item.revision, label: item.name || item.label || item.id};
      } else if(candidate.kind==='knowledge'){
        if(typeof api!=='function')throw new Error('知识库引用服务不可用。');
        const resolved=await api('knowledge.reference',{projectId,knowledgeId:item.id});reference=resolved.reference;
        if(reference?.type!=='knowledge'||reference.projectId!==projectId||reference.knowledgeId!==item.id||reference.readonly!==true||!Number.isSafeInteger(reference.sourceVersion))throw new Error('知识库未返回有效的只读引用，请刷新后重试。');
      } else {
        if (typeof api !== 'function') throw new Error('文件引用服务不可用。');
        const fileId = item.id || item.fileId;
        const resolved = await api('reference.resolve', {projectId, reference: {type: 'file', fileId, ...(item.sourceId ? {sourceId: item.sourceId} : {})}});
        if (resolved?.sourceVersion === undefined || resolved.sourceVersion === null) throw new Error('引用服务未返回文件的实际版本，请重试。');
        reference = {type: 'file', projectId, fileId, resourceId: fileId, path: item.path, label: item.name || item.label || item.path || fileId, ...(item.sourceId ? {sourceId: item.sourceId} : {}), sourceVersion: resolved.sourceVersion};
      }
      if (!valid()) return;
      const insertion = applyInsertion(live.current, '', span, maxLength);
      if (!insertion) return;
      const existing = live.current.references, next = appendReference(existing, reference);
      if (next !== existing) live.current.onReferencesChange(next);
      // Only remove the exact @query after resolution; never add a duplicated text label.
      commitText(insertion.value, insertion.caret); closeMenu(); inputRef.current?.focus();
    } catch (error) {
      if (valid()) {setMenuError(error); live.current.onError?.(error);}
    } finally {if (live.current.mounted && request.current === sequence) setBusy(false);}
  }

  function openDirectory(){
    const current=live.current,mention=menuRef.current?.mention;
    if(!mention||!projectId||!current.editable)return;
    const span={...mention,owner:current.owner,revision:current.revision};
    closeMenu();setDirectoryDialog({path:'',span,owner:current.owner,error:null});
  }
  async function pickKnowledgeDirectory(){
    if(!onPickDirectory||directoryBusy)return;
    const owner=live.current.owner;setDirectoryBusy(true);
    try{const path=await onPickDirectory();if(path&&live.current.mounted&&live.current.owner===owner)setDirectoryDialog(value=>value?{...value,path,error:null}:value);}
    catch(error){if(live.current.mounted&&live.current.owner===owner)setDirectoryDialog(value=>value?{...value,error}:value);}
    finally{if(live.current.mounted)setDirectoryBusy(false);}
  }
  async function addDirectory(){
    const captured=directoryDialog;if(!captured?.path.trim()||directoryBusy||typeof api!=='function')return;
    setDirectoryBusy(true);
    try{
      const result=await api('reference.create',{projectId,contextSessionId,directory:captured.path.trim()});
      const reference=result.reference;
      if(reference?.type!=='directory'||reference.readonly!==true||!reference.resourceId)throw new Error('目录引用服务没有返回只读引用，请重试。');
      const current=live.current,insertion=applyInsertion(current,'',captured.span,maxLength);
      if(!insertion)return;
      const next=appendReference(current.references,reference);if(next!==current.references)current.onReferencesChange?.(next);
      commitText(insertion.value,insertion.caret);setDirectoryDialog(null);inputRef.current?.focus();
    }catch(error){if(live.current.mounted&&live.current.owner===captured.owner)setDirectoryDialog(value=>value?{...value,error}:value);}
    finally{if(live.current.mounted)setDirectoryBusy(false);}
  }
  function openSystems() {
    if (menuRef.current?.kind === 'systems') {closeMenu(); return;}
    closeMenu(); setActive(0);
    const next = {kind: 'systems', search: '', expanded: null, token: {}};
    menuRef.current = next; setMenu(next);
  }
  async function loadSystem(system) {
    const currentMenu = menuRef.current;
    if (currentMenu?.kind !== 'systems' || !live.current.editable) return;
    const token = currentMenu.token, owner = live.current.owner, sequence = ++request.current;
    const next = {...currentMenu, expanded: system.id}; menuRef.current = next; setMenu(next);
    setBusy(true); setMenuError(null); retryRef.current = () => loadSystem(system);
    const valid = () => live.current.mounted && live.current.owner === owner && live.current.editable && menuRef.current?.token === token && request.current === sequence;
    try {
      if (typeof api !== 'function') throw new Error('设计体系服务不可用。');
      const result = await api('system.get', {systemId: system.id});
      if (!Array.isArray(result?.versions)) throw new Error('设计体系未返回真实版本列表，请重试。');
      if (valid()) setSystemDetails(previous => ({...previous, [system.id]: result}));
    } catch (error) {if (valid()) {setMenuError(error); live.current.onError?.(error);}}
    finally {if (valid()) setBusy(false);}
  }
  async function chooseSystem(next) {
    const currentMenu = menuRef.current;
    if (currentMenu?.kind !== 'systems' || !live.current.editable || busy || typeof live.current.onSystemChange !== 'function') return;
    const owner = live.current.owner, token = currentMenu.token, sequence = ++request.current;
    const valid = () => live.current.mounted && live.current.owner === owner && live.current.editable && menuRef.current?.token === token && request.current === sequence;
    setBusy(true); setMenuError(null); retryRef.current = () => chooseSystem(next);
    try {await live.current.onSystemChange(next); if (valid()) {closeMenu(); systemRef.current?.focus();}}
    catch (error) {if (valid()) {setMenuError(error); live.current.onError?.(error);}}
    finally {if (valid()) setBusy(false);}
  }
  function changeSearch(event) {
    request.current++; setBusy(false); setMenuError(null); retryRef.current = null; setActive(0);
    const next = {...menuRef.current, search: event.target.value}; menuRef.current = next; setMenu(next);
  }
  const filteredSystems = systems.filter(system => system?.id && isAvailable(system) && String(system.name || system.id).toLocaleLowerCase().includes((menu?.search || '').toLocaleLowerCase()));
  const systemOptions = menu?.kind === 'systems' ? [{kind: 'none', key: 'none'}, ...filteredSystems.flatMap(system => [
    {kind: 'system', key: system.id, system}, ...(menu.expanded === system.id ? (systemDetails[system.id]?.versions || []).filter(v => Number.isSafeInteger(v.version) && v.version > 0).map(version => ({kind: 'version', key: `${system.id}:${version.version}`, system, version})) : []),
  ])] : [];
  function activateSystem(option) {
    if (option.kind === 'none') chooseSystem(null);
    else if (option.kind === 'system') loadSystem(option.system);
    else chooseSystem({systemId: option.system.id, version: option.version.version});
  }
  function menuKeys(event) {
    if (composing.current || event.nativeEvent?.isComposing || event.keyCode === 229) return false;
    if (event.key === 'Escape' && menuRef.current) {event.preventDefault(); event.stopPropagation(); closeMenu(); inputRef.current?.focus(); return true;}
    if (!menuRef.current) return false;
    const options = menuRef.current.kind === 'mentions' ? candidates : systemOptions;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (options.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!busy && options[active]) {if (menuRef.current.kind === 'mentions') chooseMention(options[active]); else activateSystem(options[active]);}
      return true;
    }
    if (event.key === 'Tab') closeMenu();
    return false;
  }
  async function submit(event) {
    event.preventDefault();
    const current = live.current;
    if (composing.current || event.nativeEvent?.isComposing || current.disabled || current.submitting || (current.running ? current.stopDisabled : current.submitDisabled) || submitLock.current) return;
    const callback = current.running ? current.onStop : current.onSubmit;
    if (typeof callback !== 'function' || (!current.running && (!current.value.trim() || current.value.length > current.maxLength))) return;
    submitLock.current = true;
    const owner = current.owner;
    try {await callback(event);} catch (error) {if (live.current.owner === owner) report(error);} finally {submitLock.current = false;}
  }
  async function upload(event) {
    const selected = Array.from(event.target.files || []); event.target.value = '';
    if (!selected.length || !live.current.editable || !canAttach || typeof live.current.onFiles !== 'function') return;
    const owner = live.current.owner;
    try {await live.current.onFiles(selected);} catch (error) {if (live.current.mounted && live.current.owner === owner) report(error);}
  }
  const chosenSystem = systems.find(system => system.id === systemChoice?.systemId), systemLabel = systemChoice ? `${chosenSystem?.name || '设计体系'} · v${systemChoice.version}` : '设计体系';
  const sendDisabled = disabled || submitting || (running ? stopDisabled || typeof onStop !== 'function' : submitDisabled || !value.trim() || value.length > maxLength || typeof onSubmit !== 'function');
  return <form ref={rootRef} className="wb-designer-compose wb-designer-compose-frame" data-variant={variant} aria-label={variant === 'home' ? '开始设计对话' : '设计对话输入'} aria-busy={submitting} onSubmit={submit}>
    <style>{designerComposerStyles}</style>
    <textarea ref={inputRef} className="wb-designer-compose-input" data-testid="designer-composer-input" aria-label={ariaLabel} placeholder={placeholder} value={value} maxLength={maxLength} disabled={disabled || submitting} rows={1}
      aria-expanded={menu?.kind === 'mentions'} aria-controls={menu?.kind === 'mentions' ? `${id}-mentions` : undefined} aria-autocomplete="list" aria-activedescendant={menu?.kind === 'mentions' && candidates[active] ? `${id}-option-${active}` : undefined}
      onChange={event => {setLocalError(null); commitText(event.target.value); updateMention(event.target);}}
      onSelect={event => updateMention(event.currentTarget)} onClick={event => updateMention(event.currentTarget)} onKeyUp={event => {if (!['Escape', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) updateMention(event.currentTarget);}}
      onCompositionStart={() => {composing.current = true; live.current.composing = true; live.current.revision++; closeMenu();}}
      onCompositionEnd={event => {composing.current = false; live.current.composing = false; dismissed.current = ''; updateMention(event.currentTarget);}}
      onPaste={event=>{const files=Array.from(event.clipboardData?.files||[]);if(!files.length||!live.current.editable||!canAttach||typeof live.current.onFiles!=='function')return;event.preventDefault();const owner=live.current.owner;Promise.resolve().then(()=>live.current.onFiles(files)).catch(error=>{if(live.current.mounted&&live.current.owner===owner)report(error);});}}
      onKeyDown={event => {if (menuKeys(event)) return; if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) {event.preventDefault();if(!live.current.running)submit(event);}}}/>
    {(references.length > 0 || attachments.length > 0) && <div className="wb-designer-compose-chips" aria-label="引用和附件">
      {references.map((reference, index) => {const ref = reference.reference || reference, label = ref.label || reference.summary || ref.path || ref.referencedProjectId || ref.fileId || ref.resourceId || '引用'; return <span className="wb-designer-compose-chip" data-reference-type={ref.type || 'resource'} key={`reference:${index}`} title={`${label} · 只读参考`}>
        <Glyph name={ref.type === 'project' ? 'project' : 'file'} size={14}/><span className="wb-designer-compose-chip-label">{label}</span><button type="button" aria-label={`移除引用 ${label}`} disabled={disabled || submitting || !onReferencesChange} onClick={() => onReferencesChange?.(references.filter((_, i) => i !== index))}><Glyph name="close" size={12}/></button>
      </span>;})}
      {attachments.map((attachment, index) => {const receipt = attachment.receipt || attachment, label = attachment.label || attachment.name || receipt.name || receipt.file?.name || receipt.image?.name || receipt.path || '附件', previewUrl = receipt.previewUrl || receipt.image?.previewUrl || attachment.previewUrl, mime = String(receipt.mimeType || receipt.image?.mimeType || attachment.mimeType || attachment.type || ''); return <span className="wb-designer-compose-chip" data-attachment="true" key={`attachment:${attachment.id || receipt.receiptId || index}`} title={label}>
        {typeof previewUrl === 'string' && previewUrl && (mime.startsWith('image/') || receipt.type === 'image' || receipt.kind === 'image' || receipt.image || attachment.kind === 'image') ? <img src={previewUrl} alt=""/> : <Glyph name="file" size={14}/>}<span className="wb-designer-compose-chip-label">{label}</span><button type="button" aria-label={`移除附件 ${label}`} disabled={disabled || submitting || !onRemoveAttachment} onClick={() => onRemoveAttachment?.(attachment, index)}><Glyph name="close" size={12}/></button>
      </span>;})}
    </div>}
    {localError && <div className="wb-designer-compose-error" role="alert">{errorMessage(localError)}</div>}
    <div className="wb-designer-compose-toolbar">
      <div className="wb-designer-compose-left">
        <input ref={fileRef} type="file" multiple hidden disabled={!canAttach || disabled || submitting || !onFiles} onChange={upload}/>
        <button type="button" className="wb-designer-compose-control wb-designer-compose-plus" data-testid="designer-composer-attach" aria-label="添加附件" title={!canAttach ? '当前权限不允许添加附件，请在权限控件中选择可用权限。' : '添加图片或文件'} disabled={!canAttach || disabled || submitting || !onFiles} onClick={() => fileRef.current?.click()}><Glyph name="plus" size={16}/></button>
        {leftControls && <div className="wb-designer-compose-native wb-designer-compose-permissions">{leftControls}</div>}
        <button ref={systemRef} type="button" className="wb-designer-compose-control" data-testid="designer-composer-system" title={systemLabel} aria-label={`选择设计体系，当前${systemLabel}`} aria-haspopup="dialog" aria-expanded={menu?.kind === 'systems'} disabled={disabled || submitting || !onSystemChange} onClick={openSystems}><Glyph name="system" size={14}/><span className="wb-designer-compose-system-label">{systemChoice?systemLabel:'规范'}</span></button>
      </div>
      <div className="wb-designer-compose-right">
        {rightControls && <div className="wb-designer-compose-native wb-designer-compose-model-voice">{rightControls}</div>}
        <button className="wb-designer-compose-send" data-testid="designer-composer-send" type="submit" disabled={sendDisabled} aria-label={running ? '停止生成' : submitting ? '正在发送' : '发送'} title={running ? '停止生成' : '发送（⌘ / Ctrl + Enter）'}><Glyph name={running ? 'stop' : 'up'} size={16}/></button>
      </div>
    </div>
    {menu && <ComposerPopup rootRef={rootRef} popupRef={popupRef} anchor={menu.kind === 'systems' ? systemRef.current : inputRef.current} variant={variant} focusSearch={menu.kind === 'systems'} label={menu.kind === 'mentions' ? '选择引用' : '选择设计体系'} onClose={closeMenu} onKeyDown={menuKeys}>
      <div className="wb-designer-compose-popup-heading"><span>{menu.kind === 'mentions' ? '添加引用' : '选择固定版本'}</span><span>{busy ? '正在读取…' : 'Esc 关闭'}</span></div>
      <input className="wb-designer-compose-search" aria-label={menu.kind === 'mentions' ? '搜索项目、知识库或文件' : '搜索设计体系'} placeholder={menu.kind === 'mentions' ? variant === 'canvas' ? '搜索项目、知识库、文件或路径…' : '搜索其他项目…' : '搜索设计体系…'} value={menu.search} onChange={changeSearch}/>
      {menuError && <div className="wb-designer-compose-popup-error" role="alert">{errorMessage(menuError)}<button type="button" disabled={busy} onClick={() => retryRef.current?.()}>重试</button></div>}
      <div className="wb-designer-compose-options" id={`${id}-mentions`} role="listbox" aria-label={menu.kind === 'mentions' ? '可引用资源' : '设计体系版本'} aria-busy={busy}>
        {menu.kind === 'mentions' ? candidates.length ? candidates.map((candidate, index) => <React.Fragment key={candidate.key}>
          {(index === 0 || candidates[index - 1].kind !== candidate.kind) && <div className="wb-designer-compose-group">{candidate.kind === 'project' ? '其他项目' : candidate.kind==='knowledge'?'知识库 · 只读检索':'当前项目文件'}</div>}
          <button type="button" role="option" aria-selected={active === index} id={`${id}-option-${index}`} className="wb-designer-compose-option" data-active={active === index} data-reference-kind={candidate.kind} disabled={busy || !onReferencesChange} onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => chooseMention(candidate)}>
            <Glyph name={candidate.kind === 'project' ? 'project' : 'file'}/><span className="wb-designer-compose-option-copy"><span className="wb-designer-compose-option-title">{candidate.item.name || candidate.item.label || candidate.item.path || candidate.item.id}</span>{candidate.kind === 'file' && <span className="wb-designer-compose-option-detail">{candidate.item.path}</span>}</span>
          </button>
        </React.Fragment>) : <div className="wb-designer-compose-empty">{variant === 'canvas' ? '没有可引用的项目、知识库或文件' : '没有可引用的其他项目'}</div> : systemOptions.map((option, index) => <button type="button" role="option" aria-selected={option.kind === 'none' ? systemChoice === null : option.kind === 'version' && systemChoice?.systemId === option.system.id && systemChoice?.version === option.version.version} key={option.key} className={`wb-designer-compose-option ${option.kind === 'version' ? 'wb-designer-compose-version' : ''}`} data-active={active === index} data-system-id={option.system?.id} data-system-version={option.version?.version} disabled={busy} onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => activateSystem(option)}>
          {option.kind !== 'version' && <Glyph name="system" size={15}/>}<span className="wb-designer-compose-option-copy">{option.kind === 'none' ? '不使用设计体系' : option.kind === 'system' ? option.system.name || option.system.id : `v${option.version.version}`}</span>{option.kind === 'system' && <Glyph name="down" size={13}/>}
        </button>)}
      </div>
      {menu.kind==='mentions'&&variant==='canvas'&&projectId&&<button type="button" className="wb-designer-compose-option" disabled={busy||!onReferencesChange} onPointerDown={event=>event.preventDefault()} onClick={openDirectory}><Glyph name="project"/><span className="wb-designer-compose-option-copy"><span>选择知识目录…</span><small>读取目录资料，作为当前项目的只读参考</small></span></button>}
    </ComposerPopup>}
    {directoryDialog&&createPortal(<Modal title="添加知识目录" onClose={()=>{if(!directoryBusy)setDirectoryDialog(null);}}><div className="wb-stack">
      <p className="wb-muted">AI 可以读取这个目录下的资料。项目的写入范围仍由当前设计稿决定。</p>
      <label>目录路径<input aria-label="知识目录路径" value={directoryDialog.path} disabled={directoryBusy} placeholder="输入目录的完整路径" onChange={event=>setDirectoryDialog(value=>({...value,path:event.target.value,error:null}))} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();addDirectory();}}}/></label>
      {directoryDialog.error&&<p role="alert">{errorMessage(directoryDialog.error)}</p>}
      <div className="wb-row">{onPickDirectory&&<Button disabled={directoryBusy} onClick={pickKnowledgeDirectory}>选择目录…</Button>}<span className="wb-grow"/><Button disabled={directoryBusy} onClick={()=>setDirectoryDialog(null)}>取消</Button><Button primary disabled={directoryBusy||!directoryDialog.path.trim()} onClick={addDirectory}>{directoryBusy?'正在读取…':'添加只读知识'}</Button></div>
    </div></Modal>,rootRef.current?.closest('.wb')||document.body)}
  </form>;
});
export default DesignerComposer;
