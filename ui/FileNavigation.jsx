import React from 'react';
import {createFileTree, flattenFileTree, orderFileTree, reconcileFileViewState, reorderFileView, searchFileTree, visibleFileNodes} from './file-tree.js';

const EMPTY_VIEW = {};
const DRAG_TYPE = 'application/x-designer-file-view';
const sameArray = (a, b) => Array.isArray(a) && a.length === b.length && a.every((id, i) => id === b[i]);

/** Controlled view state belongs to the owning project's workspace.state.
 * onOpen(file, false) previews; onOpen(file, true) keeps the existing resource.
 * onReference receives the real file DTO (not the navigation-only node ID).
 * Dragging and Alt+Arrow reorder siblings in view state; no file API is called.
 */
export default function FileNavigation({files = [], query = '', viewState, onViewState, onOpen, onReference}) {
  const [localView, setLocalView] = React.useState(EMPTY_VIEW);
  const input = viewState ?? localView;
  const tree = React.useMemo(() => createFileTree(files), [files]);
  const state = React.useMemo(() => reconcileFileViewState(tree, input), [tree, input]);
  const ordered = React.useMemo(() => orderFileTree(tree, state), [tree, state]);
  const shown = React.useMemo(() => searchFileTree(ordered, query), [ordered, query]);
  const searching = Boolean(String(query).trim());
  const [searchFolds, setSearchFolds] = React.useState({query: '', ids: []});
  const folded = searchFolds.query === query ? searchFolds.ids : [];
  const expanded = searching ? flattenFileTree(shown).filter(node => node.kind !== 'file' && !folded.includes(node.id)).map(node => node.id) : state.expanded;
  const visible = visibleFileNodes(shown, expanded);
  const [focusedId, setFocusedId] = React.useState(null), [selectedId, setSelectedId] = React.useState(null);
  const [drop, setDrop] = React.useState(null), [dragging, setDragging] = React.useState(false);
  const root = React.useRef(null), items = React.useRef(new Map()), drag = React.useRef(null), pointer = React.useRef(null);
  const helpId = React.useId();
  const focusId = visible.some(node => node.id === focusedId) ? focusedId : visible[0]?.id;
  const emit = next => { setLocalView(next); onViewState?.(next); };
  React.useEffect(() => {
    if (!sameArray(input.expanded, state.expanded) || !sameArray(input.order, state.order)) {
      setLocalView(state); onViewState?.(state);
    }
  }, [input, state, onViewState]);
  const focus = id => {setFocusedId(id); items.current.get(id)?.focus();};
  const toggle = node => {
    if (searching) setSearchFolds({query, ids: folded.includes(node.id) ? folded.filter(id => id !== node.id) : [...folded, node.id]});
    else emit({...state, expanded: state.expanded.includes(node.id) ? state.expanded.filter(id => id !== node.id) : [...state.expanded, node.id]});
  };
  const open = (node, keep) => {
    if (node.kind !== 'file') {toggle(node); return;}
    setSelectedId(node.id); onOpen?.(node.file, keep);
  };
  const reorder = (from, to, after = false) => {
    const next = reorderFileView(tree, state, from, to, after);
    if (next) emit(next);
  };
  const canDrop = (from, to) => {
    const nodes = flattenFileTree(tree), a = nodes.find(node => node.id === from), b = nodes.find(node => node.id === to);
    return !!a && !!b && a.id !== b.id && a.parentId === b.parentId;
  };
  const dropAt = (id, y, element) => {
    if (!canDrop(drag.current, id)) {setDrop(null); return null;}
    const box = element.getBoundingClientRect(), target = {id, after: y > box.top + box.height / 2};
    setDrop(target); return target;
  };
  const finishDrag = () => {drag.current = null; pointer.current = null; setDrop(null); setDragging(false);};
  const pointerTarget = event => {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-file-navigation-row]');
    return row && root.current?.contains(row) ? dropAt(row.dataset.fileNavigationRow, event.clientY, row) : (setDrop(null), null);
  };
  const keyboard = (event, node) => {
    if (event.target !== event.currentTarget) return;
    const index = visible.findIndex(item => item.id === node.id), isOpen = expanded.includes(node.id);
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const siblings = flattenFileTree(ordered).filter(item => item.parentId === node.parentId), i = siblings.findIndex(item => item.id === node.id);
      const target = siblings[i + (event.key === 'ArrowUp' ? -1 : 1)];
      if (target) reorder(node.id, target.id, event.key === 'ArrowDown');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); focus(visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.id);}
    else if (event.key === 'Home' || event.key === 'End') {event.preventDefault(); focus(event.key === 'Home' ? visible[0]?.id : visible.at(-1)?.id);}
    else if (event.key === 'ArrowRight' && node.kind !== 'file') {event.preventDefault(); if (!isOpen) toggle(node); else if (node.children.length) focus(node.children[0].id);}
    else if (event.key === 'ArrowLeft') {event.preventDefault(); if (node.kind !== 'file' && isOpen) toggle(node); else if (node.parentId) focus(node.parentId);}
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.shiftKey && node.kind === 'file' && event.key === 'Enter') onReference?.(node.file);
      else open(node, event.key === 'Enter');
    } else if (event.key === 'Escape') finishDrag();
  };
  const render = (nodes, level = 1) => nodes.map((node, index) => {
    const isDirectory = node.kind !== 'file', isOpen = expanded.includes(node.id), readonly = !!node.file?.readonly;
    return <div key={node.id} role="treeitem" aria-label={`${node.name}${node.duplicateName ? ` · ${node.location}` : ''}${readonly ? ' · 只读' : ''}`} aria-level={level} aria-posinset={index + 1} aria-setsize={nodes.length} aria-expanded={isDirectory ? isOpen : undefined} aria-selected={selectedId === node.id} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Shift+Enter" tabIndex={focusId === node.id ? 0 : -1} ref={element => {if (element) items.current.set(node.id, element); else items.current.delete(node.id);}} style={{outline: 'none'}} onFocus={event => {if (event.target === event.currentTarget) setFocusedId(node.id);}} onKeyDown={event => keyboard(event, node)}>
      <div className="wb-nav-item" data-file-navigation-row={node.id} title={[node.location || [node.sourceId, node.path].filter(Boolean).join(' · '), readonly && '只读', node.file?.registered === true && '已登记'].filter(Boolean).join(' · ')} style={{paddingLeft: 7 + (level - 1) * 14, gap: 5, background: selectedId === node.id ? 'var(--wb-soft)' : undefined, boxShadow: focusedId === node.id ? 'inset 0 0 0 1px var(--wb-accent)' : undefined, borderTop: drop?.id === node.id && !drop.after ? '2px solid var(--wb-accent)' : '2px solid transparent', borderBottom: drop?.id === node.id && drop.after ? '2px solid var(--wb-accent)' : '2px solid transparent'}} draggable onClick={event => {event.stopPropagation(); focus(node.id); if (!dragging && (!event.detail || event.detail === 1)) open(node, false);}} onDoubleClick={event => {event.stopPropagation(); if (!isDirectory && !dragging) {focus(node.id); open(node, true);}}} onDragStart={event => {event.stopPropagation(); drag.current = node.id; setDragging(true); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(DRAG_TYPE, node.id);}} onDragOver={event => {event.stopPropagation(); if (canDrop(drag.current, node.id)) {event.preventDefault(); event.dataTransfer.dropEffect = 'move'; dropAt(node.id, event.clientY, event.currentTarget);} else setDrop(null);}} onDrop={event => {event.preventDefault(); event.stopPropagation(); const target = dropAt(node.id, event.clientY, event.currentTarget); if (target) reorder(drag.current, target.id, target.after); finishDrag();}} onDragEnd={finishDrag}>
        <span aria-hidden="true" style={{flexShrink: 0}}>{isDirectory ? (isOpen ? '▾' : '▸') : '⌑'}</span>
        <span className="wb-grow" style={{display: 'flex', flexDirection: 'column'}}><span>{node.name}</span>{node.duplicateName && <small className="wb-muted wb-ellipsis">{node.location}</small>}</span>
        {readonly && <small className="wb-muted" style={{flexShrink: 0}}>只读</small>}
        {node.file?.registered === true && <small className="wb-muted">已登记</small>}
        {!isDirectory && onReference && <button type="button" className="wb-button" tabIndex={-1} aria-label={`引用 ${node.name} · ${node.location}`} title="引用文件（Shift+Enter）" style={{padding: '0 5px', minHeight: 24}} onClick={event => {event.stopPropagation(); focus(node.id); onReference(node.file);}} onDoubleClick={event => event.stopPropagation()}>↗</button>}
        <button type="button" className="wb-button" tabIndex={-1} draggable={false} aria-label={`调整 ${node.name} 的显示顺序`} title="拖动调整同目录显示顺序；Alt+↑/↓" style={{padding: '0 4px', minHeight: 24, cursor: 'grab', touchAction: 'none', flexShrink: 0}} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onPointerDown={event => {if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); focus(node.id); drag.current = node.id; pointer.current = {x: event.clientX, y: event.clientY, moved: false}; event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event => {const p = pointer.current; if (!p) return; if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) < 5) return; p.moved = true; setDragging(true); pointerTarget(event);}} onPointerUp={event => {if (!pointer.current) return; if (pointer.current.moved) {const target = pointerTarget(event); if (target) reorder(drag.current, target.id, target.after);} if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finishDrag();}} onPointerCancel={finishDrag}>⠿</button>
      </div>
      {isDirectory && isOpen && <div role="group">{render(node.children, level + 1)}</div>}
    </div>;
  });
  return <div className="wb-tree" ref={root}>
    <p id={helpId} style={{position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)'}}>方向键浏览和展开目录；空格临时打开文件，回车保留文件，Shift+Enter 引用；Alt+上/下调整同目录显示顺序。</p>
    {shown.length ? <div role="tree" aria-label="项目文件" aria-describedby={helpId}>{render(shown)}</div> : <p className="wb-muted" role="status">{searching ? '没有匹配的文件。' : '项目中暂无可用文件。'}</p>}
  </div>;
}
