import {selectionChips} from '../editor/selection-labels.js';
import React from 'react';
import InlineSelectionInput from './InlineSelectionInput.jsx';
import {createPortal} from 'react-dom';
import designerComposerStyles from './designer-composer-styles.js';
import {Icon} from './brand.jsx';
import {flattenFileTree} from './file-tree.js';
import {Modal,Button} from './common.jsx';
import {detectMention, mentionKey, applyInsertion, appendReference, mentionCandidates, mentionFileRows, isAvailable} from './composer-mentions.js';
import {selectableSystems,ensureSavedSystem} from './builtin-systems.js';

function Glyph({name, size = 16}) {
  const paths = {image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 4-6 5 7"/></>, selection: <><path d="m4 3 6 17 3-7 7-3Z"/><path d="m13 13 6 6"/></>, plus: <path d="M12 5v14M5 12h14"/>, up: <path d="M12 19V5m-6 6 6-6 6 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, file: <><path d="M14 3H6v18h12V7z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>, project: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 10v10"/></>, system: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/></>, down: <path d="m7 10 5 5 5-5"/>, stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>;
}
const errorMessage = error => error?.message || String(error || '操作失败，请重试。');

// Popups live inside the nearest workbench to inherit its theme, outside scrolling panels.
function ComposerPopup({rootRef, anchor, variant, kind, popupRef, children, label, onClose, onKeyDown, focusSearch}) {
  const [position, setPosition] = React.useState(null);
  React.useLayoutEffect(() => {if (focusSearch) popupRef.current?.querySelector('input')?.focus();}, [focusSearch, popupRef]);
  React.useLayoutEffect(() => {
    const trigger = anchor?.element || anchor || rootRef.current;
    if (!trigger) return;
    const place = () => {
      const rect = trigger.getBoundingClientRect(), width = Math.max(0, Math.min(kind === 'systems' ? 300 : 420, window.innerWidth - 16));
      const above = Math.max(0, rect.top - 16), below = Math.max(0, window.innerHeight - rect.bottom - 16);
      const up = variant === 'canvas' ? above >= Math.min(210, below) : below < 220 && above > below;
      const available = up ? above : below, maxHeight = Math.min(440, available);
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
  }, [anchor, variant, kind, rootRef, popupRef]);
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
  return createPortal(<div ref={popupRef} className="wb-designer-compose wb-designer-compose-popup" data-picker={kind} role="dialog" aria-label={label} style={position || {visibility: 'hidden'}} onKeyDown={onKeyDown}>
    <style>{designerComposerStyles}</style>{children}
  </div>, host);
}

function AttachmentChip({attachment,api,projectId,contextSessionId,conversation,disabled,onRemove,rootRef}){
  const receipt=attachment.receipt||attachment;
  const image=receipt.image||(receipt.type==='image'?receipt.attachment:null);
  const label=attachment.label||attachment.name||receipt.name||receipt.file?.name||image?.name||receipt.path||'附件';
  const mime=receipt.mimeType||image?.mediaType||receipt.file?.mediaType||attachment.mimeType||'';
  const isImage=Boolean(image)||receipt.kind==='image'||receipt.type==='image'||mime.startsWith('image/')||/\.(?:png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i.test(label);
  const sessionId=contextSessionId||receipt.receivingSessionId;
  const directUrl=receipt.previewUrl||image?.previewUrl||attachment.previewUrl;
  const [url,setUrl]=React.useState(null),[open,setOpen]=React.useState(false);
  const [failed,setFailed]=React.useState(false),[attempt,setAttempt]=React.useState(0);
  React.useEffect(()=>{
    if(!isImage)return;
    let current=true;
    setUrl(null);setFailed(false);
    async function load(){
      if(image?.attachmentId&&sessionId&&conversation?.imageUrl)return conversation.imageUrl(sessionId,image);
      if(projectId&&receipt.receiptId&&(!directUrl||attempt)){
        const result=await api('attachment.get',{projectId,contextSessionId,receiptId:receipt.receiptId});
        return result.previewUrl;
      }
      return directUrl;
    }
    load().then(result=>{if(current){setUrl(result);setFailed(!result);}},()=>{if(current)setFailed(true);});
    return ()=>{current=false;};
  },[api,isImage,conversation,image,sessionId,contextSessionId,projectId,receipt.receiptId,directUrl,attempt]);
  return <span className="wb-designer-compose-chip" data-attachment="true" title={label}>
    {isImage?<button type="button" className="wb-attachment-preview-trigger" aria-label={`预览图片 ${label}`} aria-haspopup="dialog" onClick={()=>setOpen(true)}>
      {url&&!failed?<img alt="" src={url} onError={()=>setFailed(true)}/>:<Glyph name="image" size={14}/>}
      <span className="wb-designer-compose-chip-label">{label}</span>
    </button>:<><Glyph name="file" size={14}/><span className="wb-designer-compose-chip-label">{label}</span></>}
    <button type="button" aria-label={`移除附件 ${label}`} disabled={disabled} onClick={onRemove}><Glyph name="close" size={12}/></button>
    {open&&createPortal(<Modal wide title={label} className="wb-attachment-preview" onClose={()=>setOpen(false)}>
      {failed?<div role="alert">图片加载失败。 <Button onClick={()=>setAttempt(n=>n+1)}>重试</Button></div>:url?<img src={url} alt={label} onError={()=>setFailed(true)}/>:<span role="status">正在读取图片…</span>}
    </Modal>,rootRef.current?.closest('.wb')||document.body)}
  </span>;
}

/** Controlled text composer. Native permissions/model/voice controls are supplied by the host. */
const DesignerComposer = React.forwardRef(function DesignerComposer({
  variant = 'home', compact = false, value = '', onChange, onSubmit, disabled = false, submitting = false, submitDisabled = false, stopDisabled = false, running = false, onStop,
  placeholder = '描述你的想法，输入 @ 引用项目…', ariaLabel = '设计需求', maxLength = 20000,
  api, conversation, projects = [], knowledge = [], projectId, contextSessionId, onPickDirectory, files = [], references = [], onReferencesChange,
  attachments = [], onFiles, onRemoveAttachment, canAttach = false, selectionContext, onRemoveSelection,
  systems = [], systemChoice = null, onSystemChange, leftControls, rightControls, onError,
}, forwardedRef) {
  const rootRef = React.useRef(null), inputRef = React.useRef(null), fileRef = React.useRef(null), systemRef = React.useRef(null), popupRef = React.useRef(null);
  const systemWrite = React.useRef(null);
  const [systemStatus,setSystemStatus] = React.useState(null);
  const composing = React.useRef(false), selection = React.useRef(null), dismissed = React.useRef(''), request = React.useRef(0), submitLock = React.useRef(false);
  const [menu, setMenu] = React.useState(null), [active, setActive] = React.useState(0), [busy, setBusy] = React.useState(false);
  const [expansion,setExpansion] = React.useState({});
  const [menuError, setMenuError] = React.useState(null), [localError, setLocalError] = React.useState(null), [systemDetails, setSystemDetails] = React.useState({}),[directoryDialog,setDirectoryDialog]=React.useState(null),[directoryBusy,setDirectoryBusy]=React.useState(false);
  const menuRef = React.useRef(menu), retryRef = React.useRef(null), id = React.useId();
  const availableSystems = selectableSystems([...systems, ...Object.values(systemDetails).filter(system => system.id && !systems.some(saved => saved.id === system.id))]);
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
    request.current++; menuRef.current = null; setMenu(null); setExpansion({}); setBusy(false); setMenuError(null); retryRef.current = null;
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
    const min = compact ? 34 : variant === 'canvas' ? 64 : 140, max = compact ? 80 : variant === 'canvas' ? 180 : 320;
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
    setExpansion({}); dismissed.current = ''; request.current++; setBusy(false); setMenuError(null); retryRef.current = null; setActive(0);
    const next = {kind: 'mentions', mention, search: mention.query, category: previous?.kind === 'mentions' ? previous.category : 'project', token: {}};
    menuRef.current = next; setMenu(next);
  }
  const mentionTabs = [{kind:'project', label:'项目'}, ...(variant === 'canvas' && projectId
    ? [{kind:'knowledge', label:'知识库'}, {kind:'file', label:'当前文件'}, {kind:'directory', label:'知识目录'}] : [])];
  const mentionCategory = menu?.category || 'project';
  const allCandidates = menu?.kind === 'mentions' ? mentionCandidates({variant, projects, knowledge, projectId, files, query:menu.search}) : [];
  const categoryCandidates = allCandidates.filter(candidate=>candidate.kind===mentionCategory);
  const fileTree = menu?.kind==='mentions' && mentionCategory==='file';
  const candidates = fileTree ? mentionFileRows(categoryCandidates,expansion,Boolean(menu.search.trim())) : categoryCandidates;
  function toggleFolder(row,index) {
    setExpansion(previous=>({...previous,[row.key]:!row.expanded}));
    setActive(index);
  }
  const mentionLabel = mentionTabs.find(tab => tab.kind === mentionCategory)?.label || '项目';
  function changeMentionTab(category) {
    if (busy || menuRef.current?.kind !== 'mentions') return;
    request.current++; setActive(0); setMenuError(null); retryRef.current = null;
    const next = {...menuRef.current, category, token:{}};
    menuRef.current = next; setMenu(next);
  }
  function mentionTabKey(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % mentionTabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + mentionTabs.length) % mentionTabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? mentionTabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); event.stopPropagation();
    changeMentionTab(mentionTabs[next].kind);
    popupRef.current?.querySelector(`[data-mention-tab="${mentionTabs[next].kind}"]`)?.focus();
  }
  const candidateKey = categoryCandidates.map(c => c.key).join('|');
  React.useEffect(() => {
    const firstFile=fileTree?candidates.findIndex(row=>row.kind==='file'):-1;
    setActive(Math.max(0,firstFile));
  }, [candidateKey,menu?.search,mentionCategory]);
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
      const items = candidate.kind==='folder' ? flattenFileTree(candidate.node.children).filter(node=>node.kind==='file').map(node=>node.file) : [candidate.item];
      const resolvedRefs=[];
      for(const item of items){
        if(!valid())return;
        let reference;
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
        resolvedRefs.push(reference);
      }
      if (!valid()) return;
      const insertion = applyInsertion(live.current, '', span, maxLength);
      if (!insertion) return;
      const existing = live.current.references, next = resolvedRefs.reduce(appendReference,existing);
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
    const next = {kind: 'systems', search: '', token: {}};
    menuRef.current = next; setMenu(next);
  }
  async function chooseSystem(next) {
    const currentMenu = menuRef.current;
    if (currentMenu?.kind !== 'systems' || !live.current.editable || busy || typeof live.current.onSystemChange !== 'function') return;
    const owner = live.current.owner, token = currentMenu.token, saveChoice = live.current.onSystemChange;
    if (systemWrite.current?.owner === owner && systemWrite.current.pending) return;
    const write = {owner,pending:true};
    systemWrite.current = write; setSystemStatus(write);
    const valid = () => live.current.mounted && live.current.owner === owner && systemWrite.current === write;
    setBusy(true); setLocalError(null); setMenuError(null); retryRef.current = () => chooseSystem(next);
    try {
      const builtin = availableSystems.find(system => system.builtin && system.id === next?.systemId);
      if (builtin) {
        const saved = await ensureSavedSystem(api,builtin,valid);
        if (!valid()) return;
        setSystemDetails(previous => ({...previous, [builtin.id]: saved}));
        next = {systemId: saved.id};
      }
      await saveChoice(next);
      if (valid()) {
        systemWrite.current = null; setSystemStatus(null);
        if (menuRef.current?.token === token) {closeMenu(); systemRef.current?.focus();}
      }
    }
    catch (error) {
      if (valid()) {
        const failed = {owner,pending:false};
        systemWrite.current = failed; setSystemStatus(failed); setMenuError(error); report(error);
      }
    } finally {if (live.current.owner === owner && menuRef.current?.token === token) setBusy(false);}
  }
  function changeSearch(event) {
    setExpansion({}); request.current++; setBusy(false); setMenuError(null); retryRef.current = null; setActive(0);
    const next = {...menuRef.current, search: event.target.value}; menuRef.current = next; setMenu(next);
  }
  const filteredSystems = availableSystems.filter(system => system?.id && isAvailable(system) && String(system.name || system.id).toLocaleLowerCase().includes((menu?.search || '').toLocaleLowerCase()));
  const systemOptions = menu?.kind === 'systems' ? [{kind: 'none', key: 'none'}, ...filteredSystems.map(system => ({kind:'system',key:system.id,system}))] : [];
  function activateSystem(option) {
    return chooseSystem(option.system ? {systemId:option.system.id} : null);
  }
  function menuKeys(event) {
    if (composing.current || event.nativeEvent?.isComposing || event.keyCode === 229) return false;
    if (event.key === 'Escape' && menuRef.current) {event.preventDefault(); event.stopPropagation(); closeMenu(); inputRef.current?.focus(); return true;}
    if (!menuRef.current) return false;
    if (event.target.closest?.('[role=tablist]')) return false;
    if (event.key === 'Enter' && event.target.closest?.('button:not([role=option]):not([role=treeitem])')) return false;
    const options = menuRef.current.kind === 'mentions' ? candidates : systemOptions;
    const focusedTreeRow=event.target.closest?.('[role=treeitem]');
    if(focusedTreeRow && fileTree && ['ArrowRight','ArrowLeft'].includes(event.key)){
      const index=Number(focusedTreeRow.dataset.index),row=candidates[index];
      if(!row)return false;
      event.preventDefault();event.stopPropagation();
      const right=event.key==='ArrowRight';
      if(row.kind==='folder'&&row.expanded!==right)toggleFolder(row,index);
      else {
        const target=right?(row.expanded?index+1:index):candidates.findIndex(parent=>parent.key===row.node.parentId);
        if(target>=0)popupRef.current?.querySelector(`[data-index="${target}"]`)?.focus();
      }
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (options.length) {
        const next=((focusedTreeRow?Number(focusedTreeRow.dataset.index):active)+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
        setActive(next);
        if(focusedTreeRow)popupRef.current?.querySelector(`[data-index="${next}"]`)?.focus();
      }
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!busy && options[active]) {if (menuRef.current.kind === 'mentions') chooseMention(options[focusedTreeRow?Number(focusedTreeRow.dataset.index):active]); else activateSystem(options[active]);}
      return true;
    }
    if (event.key === 'Tab' && !popupRef.current?.contains(event.target)) closeMenu();
    return false;
  }
  async function submit(event) {
    event.preventDefault();
    const current = live.current;
    if (composing.current || event.nativeEvent?.isComposing || current.disabled || current.submitting || (current.running ? current.stopDisabled : current.submitDisabled) || (!current.running && systemWrite.current?.owner === current.owner) || submitLock.current) return;
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
  const chosenSystem = availableSystems.find(system => system.id === systemChoice?.systemId), systemLabel = systemChoice ? (chosenSystem?.name || '设计体系') : '设计体系';
  const selectedChips=selectionChips(selectionContext);
  const Input=variant==='canvas'?InlineSelectionInput:'textarea';
  const sendDisabled = disabled || submitting || (running ? stopDisabled || typeof onStop !== 'function' : submitDisabled || systemStatus?.owner === state.owner || !value.trim() || value.length > maxLength || typeof onSubmit !== 'function');
  return <form ref={rootRef} className="wb-designer-compose wb-designer-compose-frame" data-variant={variant} data-compact={compact} aria-label={variant === 'home' ? '开始设计对话' : '设计对话输入'} aria-busy={submitting} onSubmit={submit}>
    <style>{designerComposerStyles}</style>
    {(references.length > 0 || attachments.length > 0) && <div className="wb-designer-compose-chips" aria-label="引用和附件">
      {references.map((reference, index) => {const ref = reference.reference || reference, label = ref.label || reference.summary || ref.path || ref.referencedProjectId || ref.fileId || ref.resourceId || '引用'; const filename=ref.type==='file'&&ref.path?ref.path.split('/').pop():label; return <span className="wb-designer-compose-chip" data-reference-type={ref.type || 'resource'} key={`reference:${index}`} title={`${ref.path||label} · 只读参考`}>
        <Glyph name={ref.type === 'project' ? 'project' : 'file'} size={14}/><span className="wb-designer-compose-chip-label">{filename}</span><button type="button" aria-label={`移除引用 ${filename}`} disabled={disabled || submitting || !onReferencesChange} onClick={() => onReferencesChange?.(references.filter((_, i) => i !== index))}><Glyph name="close" size={12}/></button>
      </span>;})}
      {attachments.map((attachment,index)=><AttachmentChip key={attachment.receipt?.receiptId||attachment.receiptId||attachment.id||index}
        attachment={attachment} api={api} projectId={projectId} contextSessionId={contextSessionId} conversation={conversation} rootRef={rootRef}
        disabled={disabled||submitting||!onRemoveAttachment} onRemove={()=>onRemoveAttachment?.(attachment,index)}/>)}
    </div>}
    <Input ref={inputRef} {...(variant==='canvas'?{chips:selectedChips,onRemoveChips:onRemoveSelection,onError:report}:{} )} className="wb-designer-compose-input" data-testid="designer-composer-input" aria-label={ariaLabel} placeholder={placeholder} value={value} maxLength={maxLength} disabled={disabled || submitting} rows={1}
      aria-expanded={menu?.kind === 'mentions'} aria-controls={menu?.kind === 'mentions' ? `${id}-mentions` : undefined} aria-autocomplete="list" aria-activedescendant={menu?.kind === 'mentions' && candidates[active] ? `${id}-option-${active}` : undefined}
      onChange={event => {setLocalError(null); commitText(event.target.value); updateMention(event.target);}}
      onSelect={event => updateMention(event.currentTarget)} onClick={event => updateMention(event.currentTarget)} onKeyUp={event => {if (!['Escape', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) updateMention(event.currentTarget);}}
      onCompositionStart={() => {composing.current = true; live.current.composing = true; live.current.revision++; closeMenu();}}
      onCompositionEnd={event => {composing.current = false; live.current.composing = false; dismissed.current = ''; updateMention(event.currentTarget);}}
      onPaste={event=>{const files=Array.from(event.clipboardData?.files||[]);if(!files.length||!live.current.editable||!canAttach||typeof live.current.onFiles!=='function')return;event.preventDefault();const owner=live.current.owner;Promise.resolve().then(()=>live.current.onFiles(files)).catch(error=>{if(live.current.mounted&&live.current.owner===owner)report(error);});}}
      onKeyDown={event => {if (menuKeys(event)) return; if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !composing.current && !event.nativeEvent?.isComposing && event.keyCode !== 229) {event.preventDefault();if(!live.current.running)submit(event);}}}/>
    {localError && <div className="wb-designer-compose-error" role="alert">{errorMessage(localError)}</div>}
    <div className="wb-designer-compose-toolbar">
      <div className="wb-designer-compose-left">
        <input ref={fileRef} type="file" multiple hidden disabled={!canAttach || disabled || submitting || !onFiles} onChange={upload}/>
        <button type="button" className="wb-designer-compose-control wb-designer-compose-plus" data-testid="designer-composer-attach" aria-label="添加附件" title={!canAttach ? '当前权限不允许添加附件，请在权限控件中选择可用权限。' : '添加图片或文件'} disabled={!canAttach || disabled || submitting || !onFiles} onClick={() => fileRef.current?.click()}><Glyph name="plus" size={16}/></button>
        {leftControls && <div className="wb-designer-compose-native wb-designer-compose-permissions">{leftControls}</div>}
        <button ref={systemRef} type="button" className="wb-designer-compose-control" data-testid="designer-composer-system" title={systemLabel} aria-label={`选择设计体系，当前${systemLabel}`} aria-haspopup="dialog" aria-expanded={menu?.kind === 'systems'} disabled={disabled || submitting || !onSystemChange} onClick={openSystems}><Glyph name="system" size={14}/><span className="wb-designer-compose-system-label">{systemStatus?.owner===state.owner?(systemStatus.pending?'正在绑定…':'请重选规范'):systemChoice?systemLabel:'未选规范'}</span></button>
      </div>
      <div className="wb-designer-compose-right">
        {rightControls && <div className="wb-designer-compose-native wb-designer-compose-model-voice">{rightControls}</div>}
        <button className="wb-designer-compose-send" data-testid="designer-composer-send" type="submit" disabled={sendDisabled} aria-label={running ? '停止生成' : submitting ? '正在发送' : '发送'} title={running ? '停止生成' : '发送（⌘ / Ctrl + Enter）'}><Glyph name={running ? 'stop' : 'up'} size={16}/></button>
      </div>
    </div>
    {menu && <ComposerPopup rootRef={rootRef} popupRef={popupRef} anchor={menu.kind === 'systems' ? systemRef.current : inputRef.current} variant={variant} kind={menu.kind} focusSearch={menu.kind === 'systems'} label={menu.kind === 'mentions' ? '选择引用' : '选择设计规范'} onClose={closeMenu} onKeyDown={menuKeys}>
      <div className="wb-designer-compose-popup-heading"><strong>{menu.kind === 'mentions' ? '添加引用' : '选择设计规范'}</strong><span>{busy ? '正在读取…' : 'Esc 关闭'}</span><button type="button" aria-label="关闭选择面板" onClick={closeMenu}><Glyph name="close" size={14}/></button></div>
      {menu.kind === 'mentions' && <div className="wb-designer-compose-tabs" role="tablist" aria-label="引用类别">
        {mentionTabs.map((tab,index) => <button key={tab.kind} type="button" role="tab" id={`${id}-tab-${tab.kind}`} data-mention-tab={tab.kind}
          aria-selected={mentionCategory === tab.kind} aria-controls={`${id}-mentions-panel`} tabIndex={mentionCategory === tab.kind ? 0 : -1}
          disabled={busy} onClick={()=>changeMentionTab(tab.kind)} onKeyDown={event=>mentionTabKey(event,index)}>
          {tab.label}{tab.kind !== 'directory' && <small>{allCandidates.filter(candidate=>candidate.kind === tab.kind).length}</small>}
        </button>)}
      </div>}
      {!(menu.kind === 'mentions' && mentionCategory === 'directory') && <input className="wb-designer-compose-search" aria-label={menu.kind === 'mentions' ? `搜索${mentionLabel}` : '搜索设计规范'} placeholder={menu.kind === 'mentions' ? `搜索${mentionLabel}…` : '搜索规范…'} value={menu.search} onChange={changeSearch}/>}
      {menuError && <div className="wb-designer-compose-popup-error" role="alert">{errorMessage(menuError)}<button type="button" disabled={busy} onClick={() => retryRef.current?.()}>重试</button></div>}
      <div id={`${id}-mentions-panel`} role={menu.kind === 'mentions' ? 'tabpanel' : undefined} aria-labelledby={menu.kind === 'mentions' ? `${id}-tab-${mentionCategory}` : undefined} className="wb-designer-compose-tab-panel">
      {menu.kind === 'mentions' && mentionCategory === 'directory' ? <div className="wb-designer-compose-directory">
        <button type="button" className="wb-designer-compose-option" data-reference-kind="directory" disabled={busy||!onReferencesChange} onClick={openDirectory}>
          <Icon name="folder" size={15}/><span className="wb-designer-compose-option-copy">选择本地知识目录</span><Glyph name="plus" size={14}/>
        </button>
        {references.filter(reference=>reference.type === 'directory').map(reference=><div key={reference.resourceId} className="wb-designer-compose-directory-current"><Glyph name="project"/><span><strong>{reference.label || '已引用目录'}</strong><small>{reference.rootPath}</small></span><small>已引用</small></div>)}
      </div> : <div className="wb-designer-compose-options" id={`${id}-mentions`} role={fileTree?"tree":"listbox"} aria-label={menu.kind === 'mentions' ? `可引用${mentionLabel}` : '设计规范'} aria-busy={busy}>
        {menu.kind === 'mentions' ? candidates.length ? candidates.map((candidate, index) => {
          const {node,level,expanded}=candidate,folder=candidate.kind==='folder';
          const label=node?.name || candidate.item.name || candidate.item.label || candidate.item.id;
          const title=folder?`引用 ${node.path||node.name} 下${menu.search.trim()?'匹配的':'的'}文件`:node?.location || (candidate.kind==='project'?`${label} · v${candidate.item.revision}`:label);
          const row=<button key={candidate.key} type="button" role={fileTree?'treeitem':'option'} aria-level={level} aria-label={node?.duplicateName?node.location:label} aria-expanded={folder?expanded:undefined}
            tabIndex={fileTree?(active===index?0:-1):undefined} data-index={index} aria-selected={active===index} id={`${id}-option-${index}`}
            className="wb-designer-compose-option" data-active={active===index} data-reference-kind={candidate.kind} title={title}
            disabled={busy||!onReferencesChange} onFocus={()=>setActive(index)} onPointerDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>chooseMention(candidate)}>
            <Icon name={folder?(expanded?'folder-open':'folder'):candidate.kind==='knowledge'?'knowledge':candidate.kind==='project'?'layout-sidebar':'file'} size={15}/>
            <span className="wb-designer-compose-option-title">{label}</span>
          </button>;
          if(!fileTree)return row;
          return <div key={candidate.key} role="none" className="wb-mention-tree-line" style={{paddingInlineStart:(level-1)*14}}>
            {folder?<button type="button" className="wb-mention-disclosure" tabIndex={-1} disabled={busy} aria-label={`${expanded?'收起':'展开'} ${node.name}`}
              onPointerDown={event=>event.preventDefault()} onClick={()=>toggleFolder(candidate,index)}><Icon name={expanded?'chevron-down':'chevron-right'} size={12}/></button>
              :<span className="wb-mention-disclosure" aria-hidden="true"/>}{row}
          </div>;
        }) : <div className="wb-designer-compose-empty">没有可引用的{mentionLabel}</div> : systemOptions.map((option, index) => <button type="button" role="option" aria-selected={option.kind === 'none' ? systemChoice === null : systemChoice?.systemId === option.system.id} key={option.key} className="wb-designer-compose-option" data-active={active === index} data-system-id={option.system?.id} disabled={busy} onPointerDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => activateSystem(option)}>
          <Glyph name="system" size={15}/><span className="wb-designer-compose-option-copy">{option.kind === 'none' ? '不使用规范' : option.system.name || option.system.id}</span>
        </button>)}
      </div>}
      </div>
    </ComposerPopup>}
    {directoryDialog&&createPortal(<Modal title="添加知识目录" onClose={()=>{if(!directoryBusy)setDirectoryDialog(null);}}><div className="wb-stack">
      <p className="wb-muted">AI 可以读取这个目录下的资料。项目的写入范围仍由当前设计稿决定。</p>
      <label>目录路径<input aria-label="知识目录路径" value={directoryDialog.path} disabled={directoryBusy} placeholder="输入目录的完整路径" onChange={event=>setDirectoryDialog(value=>({...value,path:event.target.value,error:null}))} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent?.isComposing){event.preventDefault();event.stopPropagation();addDirectory();}}}/></label>
      {directoryDialog.error&&<p role="alert">{errorMessage(directoryDialog.error)}</p>}
      <div className="wb-row">{onPickDirectory&&<Button disabled={directoryBusy} onClick={pickKnowledgeDirectory}>选择目录…</Button>}<span className="wb-grow"/><Button disabled={directoryBusy} onClick={()=>setDirectoryDialog(null)}>取消</Button><Button primary disabled={directoryBusy||!directoryDialog.path.trim()} onClick={addDirectory}>{directoryBusy?'正在读取…':'添加只读知识'}</Button></div>
    </div></Modal>,rootRef.current?.closest('.wb')||document.body)}
  </form>;
});
export default DesignerComposer;
