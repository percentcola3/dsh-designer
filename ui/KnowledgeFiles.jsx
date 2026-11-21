import React from 'react';
import {Button, Modal, FieldError, useDownload} from './common.jsx';
import {Icon} from './brand.jsx';
import {uploadFile} from './upload.js';
import KnowledgeDocumentView from './KnowledgeDocumentView.jsx';
import {buildKnowledgeTree, knowledgeTreeEntries, knowledgeFileSize, knowledgeUploadPath, importKnowledgeFiles} from './knowledge-panel-state.js';
import {KNOWLEDGE_TRANSFER_TYPE, KNOWLEDGE_TRANSFER_PREFIX, knowledgeTransfer, parseKnowledgeTransfer, knowledgePastePaths, availableKnowledgePath, knowledgeFileWithPath, knowledgeDroppedFiles} from './knowledge-file-operations.js';

function KnowledgeFiles({api, knowledge, query, searchResult, onClearSearch, onChanged, onRefresh, NativeFileTree, locked, onBusyChange}, ref) {
  const documents = knowledge.documents || [];
  const [selectedId, setSelectedId] = React.useState(''), [selectedIds, setSelectedIds] = React.useState([]), [folder, setFolder] = React.useState(null);
  const [folders, setFolders] = React.useState(new Set()), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(null);
  const [menu, setMenu] = React.useState(null), [dialog, setDialog] = React.useState(null), [input, setInput] = React.useState(''), [removed, setRemoved] = React.useState(null), [notice, setNotice] = React.useState(''), [dropPath, setDropPath] = React.useState(null);
  const root = React.useRef(null), menuRef = React.useRef(null), editor = React.useRef(null), uploadInput = React.useRef(null), replaceInput = React.useRef(null), uploadDestination = React.useRef(''), replacement = React.useRef(null);
  const lock = React.useRef(false), mounted = React.useRef(true), anchor = React.useRef('');
  const consumedCuts = React.useRef(new Set());
  const downloadValue = useDownload(), blocked = locked || busy || knowledge.archived;
  const active = documents.find(document => document.id === selectedId) || documents[0];
  const tree = React.useMemo(() => buildKnowledgeTree(documents, query), [documents, query]);
  const entries = React.useMemo(() => knowledgeTreeEntries(tree), [tree]);
  const expanded = query.trim() ? entries.filter(entry => entry.meta.kind === 'directory').map(entry => entry.path) : [...folders];
  const results = searchResult?.results || searchResult?.resources || [];
  React.useEffect(() => {mounted.current = true; return () => {mounted.current = false; onBusyChange?.(false);};}, [onBusyChange]);
  React.useEffect(() => {
    if (!active) return;
    const parts = (active.relativePath || active.name).split('/');
    const ancestors = parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
    if (ancestors.length) setFolders(previous => new Set([...previous, ...ancestors]));
  }, [active?.id, active?.relativePath]);
  React.useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button:not(:disabled)')?.focus();
    const dismiss = event => {if (!menuRef.current?.contains(event.target)) setMenu(null);};
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [menu]);
  function navigate(proceed) {
    if (lock.current || locked) return;
    if (editor.current?.isDirty()) setDialog({type: 'unsaved', proceed});
    else proceed();
  }
  React.useImperativeHandle(ref, () => ({
    isDirty: () => Boolean(editor.current?.isDirty() || dialog && ['create', 'rename'].includes(dialog.type) && input !== dialog.initial),
    isBusy: () => lock.current,
    save: () => editor.current?.isDirty() ? editor.current.save() : submitDialog(),
    discard: () => {editor.current?.discard(); setDialog(null);},
    navigate,
  }));
  async function run(task) {
    if (lock.current || locked || knowledge.archived) return null;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError(null); setNotice(''); setMenu(null);
    try {
      const result = await task();
      if (!mounted.current) return result;
      if (result?.knowledge) onChanged(result);
      if (result?.indexError) setError(new Error('文件已保存，索引更新未完成，可在知识库菜单中重试整理。'));
      try {await onRefresh?.();} catch (failure) {if (mounted.current) setError(failure);}
      return result;
    } catch (failure) {
      if (mounted.current) {
        if (failure.result?.knowledge) onChanged(failure.result);
        setError(failure);
        try {await onRefresh?.();} catch {}
      }
      return null;
    }
    finally {lock.current = false; if (mounted.current) {setBusy(false); onBusyChange?.(false);}}
  }
  const latest = async () => {const value = await api('knowledge.get', {knowledgeId: knowledge.id}); return value.knowledge || value;};
  function select(document) {
    navigate(() => {setSelectedId(document.id); setSelectedIds([document.id]); setFolder(null); anchor.current = document.id;});
  }
  function selection(target) {
    if (target?.folder !== undefined) return documents.filter(document => document.relativePath.startsWith(target.folder + '/'));
    if (target?.documentId) return selectedIds.includes(target.documentId) && selectedIds.length > 1 ? documents.filter(document => selectedIds.includes(document.id)) : documents.filter(document => document.id === target.documentId);
    if (folder !== null) return documents.filter(document => document.relativePath.startsWith(folder + '/'));
    return documents.filter(document => (selectedIds.length ? selectedIds : [active?.id]).includes(document.id));
  }
  const destination = () => folder ?? (active?.relativePath || '').split('/').slice(0, -1).join('/');
  function transferFor(target, cut = false) {
    const files = selection(target);
    return files.length ? knowledgeTransfer(knowledge.id, files, {folder: target?.folder ?? (target ? undefined : folder ?? undefined), cut}) : null;
  }
  function copyEvent(event, cut) {
    if (blocked || event.target.closest('input,textarea,[contenteditable=true]')) return;
    const value = transferFor(null, cut);
    if (!value) return;
    event.preventDefault();
    consumedCuts.current.delete(JSON.stringify(value));
    event.clipboardData.setData(KNOWLEDGE_TRANSFER_TYPE, JSON.stringify(value));
    event.clipboardData.setData('text/plain', KNOWLEDGE_TRANSFER_PREFIX + JSON.stringify(value));
    setNotice(`${cut ? '已剪切' : '已复制'} ${value.files.length} 个文件`);
  }
  async function copyMenu(target, cut) {
    const value = transferFor(target, cut);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(KNOWLEDGE_TRANSFER_PREFIX + JSON.stringify(value));
      consumedCuts.current.delete(JSON.stringify(value)); setNotice(`${cut ? '已剪切' : '已复制'} ${value.files.length} 个文件`);
    } catch (failure) {setError(failure);}
    setMenu(null); root.current?.focus();
  }
  async function pasteTransfer(value, targetFolder) {
    if (!value) return;
    if (value.cut && consumedCuts.current.has(JSON.stringify(value))) {setNotice('剪切操作已完成，请重新选择文件。'); return;}
    navigate(() => run(async () => {
      const current = await latest(), moving = value.cut && value.knowledgeId === knowledge.id;
      const files = knowledgePastePaths(value, targetFolder, current.documents, moving);
      if (moving) for (const file of files) {
        const document = current.documents.find(document => document.id === file.documentId);
        const original = value.files.find(item => item.documentId === file.documentId);
        if (!document || document.sha256 !== file.expectedSha256 || document.relativePath !== original.relativePath) throw new Error('剪切的文件已变化，请重新选择。');
      }
      const result = await api(moving ? 'knowledge.document.move' : 'knowledge.document.copy', {knowledgeId: knowledge.id, expectedRevision: current.revision, sourceKnowledgeId: value.knowledgeId, files});
      if (value.cut) {
        consumedCuts.current.add(JSON.stringify(value));
        if (!moving) {
          try {
            const sourceResult = await api('knowledge.get', {knowledgeId: value.knowledgeId}), source = sourceResult.knowledge || sourceResult;
            if (value.files.some(file => !source.documents.some(document => document.id === file.documentId && document.sha256 === file.expectedSha256 && document.relativePath === file.relativePath))) throw new Error('原文件已变化');
            await api('knowledge.document.remove', {knowledgeId: value.knowledgeId, expectedRevision: source.revision, documentIds: value.files.map(file => file.documentId)});
          } catch (failure) {
            if (mounted.current) {setFolder(targetFolder || null); setNotice(`已复制 ${files.length} 个文件到目标知识库`); setError(new Error(`原文件删除失败，请到原知识库核对后删除。${failure.message}`));}
            return result;
          }
        }
      }
      if (mounted.current) {
        setFolder(null);
        if (result.documents?.length) {setSelectedId(result.documents[0].id); setSelectedIds(result.documents.map(document => document.id));}
        else if (moving) {setSelectedId(files[0].documentId); setSelectedIds(files.map(file => file.documentId));}
        setNotice(`已${value.cut ? '移动' : '粘贴'} ${files.length} 个文件`);
      }
      return result;
    }));
  }
  function pasteEvent(event) {
    if (blocked || event.target.closest('input,textarea,[contenteditable=true]')) return;
    const files = Array.from(event.clipboardData.files || []);
    const value = parseKnowledgeTransfer(event.clipboardData.getData(KNOWLEDGE_TRANSFER_TYPE)) || parseKnowledgeTransfer(event.clipboardData.getData('text/plain'));
    if (!files.length && !value) return;
    event.preventDefault();
    if (files.length) addFiles(files, destination());
    else pasteTransfer(value, destination());
  }
  async function pasteMenu(targetFolder) {
    setMenu(null);
    try {
      const text = await navigator.clipboard.readText();
      const value = parseKnowledgeTransfer(text);
      if (!value) throw new Error('剪贴板中没有可粘贴的知识库文件，可使用快捷键粘贴本机文件。');
      pasteTransfer(value, targetFolder);
    } catch (failure) {setError(failure);}
  }
  function addFiles(files, targetFolder) {
    if (!files.length) return;
    navigate(() => run(async () => {
      const current = await latest(), occupied = current.documents.map(document => document.relativePath);
      const incoming = files.map(file => {
        const path = knowledgeUploadPath(file), next = availableKnowledgePath(targetFolder ? `${targetFolder}/${path}` : path, occupied);
        occupied.push(next);
        return knowledgeFileWithPath(file, next);
      });
      const result = await importKnowledgeFiles({files: incoming, knowledge: current, api, upload: (file, options) => uploadFile(api, file, options)});
      if (result.failures?.length) throw Object.assign(new Error(`已添加 ${result.saved.length} 个文件，${result.failures.length} 个文件失败，请重试失败文件。`), {result});
      if (mounted.current) {setNotice(`已添加 ${result.saved.length} 个文件`); setFolder(targetFolder || null);}
      return result;
    }));
  }
  function pickFiles(targetFolder) {
    uploadDestination.current = targetFolder;
    setMenu(null); uploadInput.current?.click();
  }
  function replace(document) {
    navigate(() => {replacement.current = document; setMenu(null); replaceInput.current?.click();});
  }
  async function replaceFile(file) {
    const document = replacement.current;
    if (!file || !document) return;
    if (file.name.split('.').pop().toLowerCase() !== document.name.split('.').pop().toLowerCase()) {setError(new Error('请选择相同文件类型进行替换。')); return;}
    await run(async () => {
      const current = await latest();
      const result = await uploadFile(api, file, {purpose: 'knowledge', knowledgeId: knowledge.id, expectedRevision: current.revision, documentId: document.id, expectedSha256: document.sha256, name: document.name, relativePath: document.relativePath, mediaType: file.type || document.mimeType});
      if (mounted.current) {setSelectedId(result.document.id); setSelectedIds([result.document.id]); setNotice('文件已替换');}
      return result;
    });
  }
  async function write(document, content) {
    return run(async () => {
      const current = await latest();
      const result = await api('knowledge.document.write', {knowledgeId: knowledge.id, expectedRevision: current.revision, documentId: document.id, expectedSha256: document.sha256, content});
      if (mounted.current) {setSelectedId(result.document.id); setSelectedIds([result.document.id]); setNotice('文件已保存');}
      return result;
    });
  }
  function openCreate(targetFolder) {
    navigate(() => {const value = targetFolder ? `${targetFolder}/新文件.md` : '新文件.md'; setInput(value); setDialog({type: 'create', initial: value}); setMenu(null);});
  }
  function openRename(target) {
    navigate(() => {
      const value = target.folder ?? documents.find(document => document.id === target.documentId)?.relativePath;
      if (!value) return;
      setInput(value); setDialog({type: 'rename', target, initial: value}); setMenu(null);
    });
  }
  function remove(target) {
    navigate(() => {const files = selection(target); if (files.length) setDialog({type: 'remove', files}); setMenu(null);});
  }
  async function submitDialog() {
    const pending = dialog;
    if (!pending || !['create', 'rename', 'remove'].includes(pending.type)) return false;
    const result = await run(async () => {
      const current = await latest(), base = {knowledgeId: knowledge.id, expectedRevision: current.revision};
      if (pending.type === 'create') return api('knowledge.document.write', {...base, relativePath: input.trim(), content: ''});
      if (pending.type === 'remove') {
        const result = await api('knowledge.document.remove', {...base, documentIds: pending.files.map(document => document.id)});
        if (mounted.current) {setRemoved(result.removed); setSelectedIds([]); setNotice(`已删除 ${result.removed.length} 个文件`);}
        return result;
      }
      const files = selection(pending.target).map(document => ({documentId: document.id,
        relativePath: pending.target.folder !== undefined ? input.trim() + document.relativePath.slice(pending.target.folder.length) : input.trim()}));
      return api('knowledge.document.move', {...base, files});
    });
    if (result && mounted.current) {setDialog(null); if (result.document) {setSelectedId(result.document.id); setSelectedIds([result.document.id]); setFolder(null);}}
    return Boolean(result);
  }
  function restore() {
    if (!removed) return;
    const value = knowledgeTransfer(knowledge.id, removed);
    value.basePath = '';
    navigate(() => run(async () => {
      const current = await latest(), occupied = current.documents.map(document => document.relativePath);
      const files = value.files.map(file => {
        const relativePath = availableKnowledgePath(file.relativePath, occupied);
        occupied.push(relativePath);
        return {...file, relativePath};
      });
      const result = await api('knowledge.document.copy', {knowledgeId: knowledge.id, expectedRevision: current.revision, sourceKnowledgeId: knowledge.id, files});
      if (mounted.current) {setRemoved(null); setFolder(null); setSelectedId(result.documents[0].id); setSelectedIds(result.documents.map(document => document.id)); setNotice(`已恢复 ${files.length} 个文件`);}
      return result;
    }));
  }
  function showMenu(event, target) {
    if (blocked) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({target, left: Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - 200)), top: Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - 310))});
  }
  function rowProps(entry) {
    const directory = entry.meta.kind === 'directory', target = directory ? {folder: entry.path} : {documentId: entry.meta.documentId};
    return {
      draggable: !blocked,
      'data-kb-selected': !directory && selectedIds.includes(entry.meta.documentId),
      'data-kb-drop': directory && dropPath === entry.path,
      onClickCapture: event => {
        if (directory || !(event.metaKey || event.ctrlKey || event.shiftKey)) return;
        event.preventDefault(); event.stopPropagation();
        navigate(() => {
          const id = entry.meta.documentId;
          if (event.shiftKey) {
            const visible = entries.filter(item => item.meta.kind === 'file' && item.path.split('/').slice(0, -1).every((_part, index, parts) => expanded.includes(parts.slice(0, index + 1).join('/'))));
            const first = visible.findIndex(item => item.meta.documentId === (anchor.current || active?.id)), last = visible.findIndex(item => item.meta.documentId === id);
            setSelectedIds(visible.slice(Math.min(Math.max(0, first), last), Math.max(first, last) + 1).map(item => item.meta.documentId));
          } else setSelectedIds(previous => {const current = previous.length ? previous : [active?.id]; return current.includes(id) ? current.filter(value => value !== id) : [...current, id];});
          setFolder(null);
        });
      },
      onContextMenu: event => showMenu(event, target),
      onDragStart: event => {
        if (editor.current?.isDirty()) {event.preventDefault(); setNotice('请先保存当前文件，再拖动。'); return;}
        const value = transferFor(target, true);
        if (!value) return;
        event.dataTransfer.effectAllowed = 'copyMove';
        event.dataTransfer.setData(KNOWLEDGE_TRANSFER_TYPE, JSON.stringify(value));
      },
      onDragOver: event => {if (blocked) return; event.preventDefault(); event.stopPropagation(); setDropPath(directory ? entry.path : '');},
      onDrop: event => drop(event, directory ? entry.path : entry.path.split('/').slice(0, -1).join('/')),
    };
  }
  async function drop(event, targetFolder) {
    if (blocked) return;
    event.preventDefault(); event.stopPropagation(); setDropPath(null);
    const value = parseKnowledgeTransfer(event.dataTransfer.getData(KNOWLEDGE_TRANSFER_TYPE));
    if (value) {pasteTransfer({...value, cut: !(event.altKey || event.ctrlKey) && value.knowledgeId === knowledge.id}, targetFolder); return;}
    try {const files = await knowledgeDroppedFiles(event.dataTransfer); if (mounted.current) addFiles(files, targetFolder);}
    catch (failure) {setError(failure);}
  }
  function fallback(nodes) {
    return <ul className="kb-tree">{nodes.map(node => {
      const entry = entries.find(entry => node.type === 'folder' ? entry.path === node.path : entry.meta.documentId === node.document.id);
      return <li key={entry.path}><button type="button" className="kb-tree-name" {...rowProps(entry)} onClick={() => node.type === 'folder' ? toggle(entry, !folders.has(entry.path)) : select(node.document)}><Icon name={node.type === 'folder' ? 'folder' : 'file'} size={15}/><span>{node.name}</span></button>{node.type === 'folder' && expanded.includes(node.path) && fallback(node.children)}</li>;
    })}</ul>;
  }
  function toggle(entry, open) {
    setFolder(entry.path); setSelectedIds([]);
    setFolders(previous => {const next = new Set(previous); open ? next.add(entry.path) : next.delete(entry.path); return next;});
  }
  const menuFolder = menu?.target?.folder ?? destination();
  const menuDocument = documents.find(document => document.id === menu?.target?.documentId);
  return <>
    <FieldError error={error} context="知识库文件"/>
    {(notice || removed) && <p className="kb-notice" role="status">{notice}{removed && <button type="button" disabled={blocked} onClick={restore}>撤销删除</button>}</p>}
    <div className="kb-workspace">
      <aside ref={root} tabIndex={0} className="kb-directory-content" aria-label="知识库文件树" aria-busy={busy}
        onCopy={event => copyEvent(event, false)} onCut={event => copyEvent(event, true)} onPaste={pasteEvent}
        onContextMenu={event => showMenu(event, {folder: ''})}
        onDragOver={event => {if (!blocked) {event.preventDefault(); setDropPath('');}}} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget)) setDropPath(null);}} onDrop={event => drop(event, '')}
        data-drop-active={dropPath !== null}
        onKeyDown={event => {
          if (event.target.closest('input,textarea,[contenteditable=true]')) return;
          if (event.key === 'Escape') {setMenu(null); setDropPath(null);}
          if (blocked) return;
          if (event.key === 'Delete' || event.key === 'Backspace') {event.preventDefault(); remove();}
          if (event.key === 'F2' && active) {event.preventDefault(); openRename(folder !== null ? {folder} : {documentId: active.id});}
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {event.preventDefault(); setSelectedIds(documents.map(document => document.id)); setFolder(null);}
        }}>
        <div className="kb-tree-toolbar"><span>文件</span><Button className="wb-ghost wb-icon-button" disabled={blocked} aria-label="新建知识库文件" title="新建文件" onClick={() => openCreate(destination())}><Icon name="plus" size={14}/></Button><Button className="wb-ghost wb-icon-button" disabled={blocked} aria-label="添加知识库文件" title="添加文件" onClick={() => pickFiles(destination())}><Icon name="arrow-up" size={14}/></Button></div>
        {searchResult ? <div className="kb-results"><div className="kb-result-heading"><span>{results.length} 条匹配</span><Button onClick={onClearSearch}>返回目录</Button></div>{results.map((result, index) => <article key={`${result.documentId}:${index}`}><button type="button" onClick={() => {const document = documents.find(document => document.id === result.documentId); if (document) select(document);}}>{result.path}{result.line ? `:${result.line}` : ''}</button><p>{result.snippet || result.abstract}</p></article>)}{!results.length && <p className="kb-empty-inline">没有匹配内容。</p>}</div>
          : NativeFileTree && entries.length ? <NativeFileTree root="" entries={entries} expanded={expanded} current={entries.find(entry => entry.meta.documentId === active?.id)?.path} rowTriggerProps={rowProps} onToggle={toggle} onOpen={entry => {const document = documents.find(document => document.id === entry.meta.documentId); if (document) select(document);}}/>
            : fallback(tree)}
        {!entries.length && !searchResult && <p className="kb-empty-inline">{query.trim() ? '没有匹配的文件' : '拖放文件到此处添加'}</p>}
      </aside>
      <section className="kb-file-preview" aria-label="知识库文件内容">
        {active ? <><div className="kb-file-heading"><span title={active.relativePath}>{active.relativePath || active.name}</span><small>{knowledgeFileSize(active.bytes)}</small><Button className="wb-ghost wb-icon-button" disabled={busy} aria-label={`下载 ${active.name}`} title="下载原件" onClick={async () => {try {const value = await api('knowledge.document.get', {knowledgeId: knowledge.id, documentId: active.id}); await downloadValue(value, active.name);} catch (failure) {setError(failure);}}}><Icon name="arrow-up" size={14} style={{transform: 'rotate(180deg)'}}/></Button><Button className="wb-ghost wb-icon-button" disabled={blocked} aria-label="文件操作" onClick={event => showMenu(event, {documentId: active.id})}><Icon name="more" size={16}/></Button></div>
          <KnowledgeDocumentView ref={editor} key={`${knowledge.id}:${active.id}:${active.sha256}`} api={api} knowledgeId={knowledge.id} document={active} documents={documents} locked={blocked} onWrite={knowledge.archived ? undefined : write} onSelect={select}/></> : <p className="kb-view-message">选择左侧文件查看内容</p>}
      </section>
    </div>
    <input ref={uploadInput} type="file" hidden multiple onChange={event => {const files = Array.from(event.target.files || []); event.target.value = ''; addFiles(files, uploadDestination.current);}}/>
    <input ref={replaceInput} type="file" hidden onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; replaceFile(file);}}/>
    {menu && <div ref={menuRef} role="menu" aria-label="知识库文件操作" className="kb-file-menu" style={{left: menu.left, top: menu.top}} onKeyDown={event => {if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); setMenu(null); root.current?.focus();}}}>
      {menu.target?.folder !== undefined && <><Button role="menuitem" onClick={() => openCreate(menuFolder)}>新建文件</Button><Button role="menuitem" onClick={() => pickFiles(menuFolder)}>添加文件</Button></>}
      {(menuDocument || menu.target?.folder) && <><Button role="menuitem" onClick={() => openRename(menu.target)}>重命名 / 移动</Button><Button role="menuitem" onClick={() => copyMenu(menu.target, false)}>复制</Button><Button role="menuitem" onClick={() => copyMenu(menu.target, true)}>剪切</Button></>}
      <Button role="menuitem" onClick={() => pasteMenu(menuFolder)}>粘贴</Button>
      {menuDocument && <Button role="menuitem" onClick={() => replace(menuDocument)}>替换文件</Button>}
      {(menuDocument || menu.target?.folder) && <Button role="menuitem" className="kb-file-delete" onClick={() => remove(menu.target)}>删除</Button>}
    </div>}
    {dialog && <Modal title={{create: '新建文件', rename: '重命名 / 移动', remove: '删除文件', unsaved: '保存当前文件'}[dialog.type]} onClose={() => {if (!busy) setDialog(null);}}>
      {dialog.type === 'unsaved' ? <div className="kb-form"><p>当前文件有未保存修改。</p><footer><Button onClick={() => setDialog(null)}>继续编辑</Button><Button onClick={() => {editor.current?.discard(); const proceed = dialog.proceed; setDialog(null); proceed();}}>放弃修改并继续</Button><Button primary onClick={async () => {if (await editor.current?.save()) {const proceed = dialog.proceed; setDialog(null); proceed();}}}>保存并继续</Button></footer></div>
        : <form className="kb-form" onSubmit={event => {event.preventDefault(); submitDialog();}}><FieldError error={error}/>{dialog.type === 'remove' ? <p>删除选中的 {dialog.files.length} 个文件？删除后可以撤销。</p> : <label>文件路径<input required autoFocus value={input} disabled={busy} onChange={event => setInput(event.target.value)}/></label>}<footer><Button disabled={busy} onClick={() => setDialog(null)}>取消</Button><Button primary type="submit" disabled={busy || dialog.type !== 'remove' && !input.trim()}>{busy ? '处理中…' : dialog.type === 'remove' ? '删除' : '保存'}</Button></footer></form>}
    </Modal>}
  </>;
}

export default React.forwardRef(KnowledgeFiles);
