import React from 'react';
import { Button, Modal, ErrorBox } from './common.jsx';
import { Icon } from './brand.jsx';
import { uploadFile } from './upload.js';
import styles from './knowledge-panel-styles.js';
import galleryStyles from './resource-gallery-styles.js';
import ResourceCardCover from './ResourceCardCover.jsx';
import KnowledgeFiles from './KnowledgeFiles.jsx';
import { knowledgeIndexState, knowledgeIndexProgress, knowledgeImportState, knowledgeImportRunning, knowledgeImportName, knowledgeDraftDirty, knowledgeViewTicket, knowledgeResponseCurrent, knowledgeUploadPlan, importKnowledgeFiles } from './knowledge-panel-state.js';

const getKnowledge = value => value?.knowledge || value;
const formKey = form => `${form.type}:${form.draft?.knowledgeId || form.knowledgeId || form.project?.id || 'new'}`;
const metadata = value => ({ name: value?.name || '', description: value?.description || '' });
function errorText(error) {
  if (!error) return '';
  if (error.code === 'KNOWLEDGE_NOT_SEARCHABLE') return '没有可检索文本，原件已保存。';
  if (error.code === 'FS_SANDBOX_DENIED') return '当前权限不允许更新，原件仍可查看。';
  if (['IMPORT_ABORTED', 'IMPORT_CANCELLED', 'ABORT_ERR'].includes(error.code)) return '已取消导入，已保存文件保留。';
  return error.message || String(error);
}
function InlineError({ error }) { return error ? <p className="kb-inline-error" role="alert">{errorText(error)}</p> : null; }
function MoreMenu({ label = '更多', children }) { return <details className="kb-more" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}><summary aria-label={label}><Icon name="more" size={18}/></summary><div className="kb-more-menu">{children}</div></details>; }
const menuClick = (event, fn) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; fn(); };

export default function KnowledgePanel({ api, library = {}, onRefresh, registerGuard, onPickDirectory, NativeFileTree }) {
  const fileManager = React.useRef(null);
  const [fileBusy, setFileBusy] = React.useState(false);
  const [items, setItems] = React.useState(Array.isArray(library.knowledge) ? library.knowledge : []), [knowledgeId, setKnowledgeId] = React.useState(''), [knowledge, setKnowledge] = React.useState(null);
  const [query, setQuery] = React.useState(''), [libraryQuery, setLibraryQuery] = React.useState(''), [searchResult, setSearchResult] = React.useState(null), [includeArchived, setIncludeArchived] = React.useState(false);
  const [ownBusy, setBusy] = React.useState(false), [error, setError] = React.useState(null), [notice, setNotice] = React.useState(''), [progress, setProgress] = React.useState(null), [failures, setFailures] = React.useState([]);
  const [modal, setModal] = React.useState(null), [decision, setDecision] = React.useState(false), [keptCount, setKeptCount] = React.useState(0), [profiles, setProfiles] = React.useState([]), [jobs, setJobs] = React.useState([]);
  const busy = ownBusy || fileBusy;
  const mounted = React.useRef(true), lifecycle = React.useRef(0), lock = React.useRef(null), view = React.useRef({ knowledgeId: '', sequence: 0 }), requestId = React.useRef(0), listRequest = React.useRef(0), modalEpoch = React.useRef(0), polling = React.useRef(false);
  const live = React.useRef({}), drafts = React.useRef(new Map()), detailRef = React.useRef(null); live.current = { modal, knowledge, jobs, items };
  React.useEffect(() => { if (knowledgeId) detailRef.current?.scrollIntoView({ block: 'start' }); }, [knowledgeId]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; lifecycle.current++; requestId.current++; listRequest.current++; modalEpoch.current++; lock.current = null; }; }, []);
  const alive = epoch => mounted.current && lifecycle.current === epoch;
  const current = ticket => mounted.current && knowledgeResponseCurrent(ticket, view.current, requestId.current);
  const run = async fn => {
    if (lock.current || fileManager.current?.isBusy()) return;
    const ticket = { epoch: lifecycle.current }; lock.current = ticket; requestId.current++;
    setBusy(true); setError(null); setNotice(''); setProgress(null);
    try { return await fn(ticket.epoch); } catch (cause) { if (alive(ticket.epoch)) { setError(cause); if (cause.failures) setFailures(cause.failures); } }
    finally { if (lock.current === ticket) { lock.current = null; if (alive(ticket.epoch)) setBusy(false); } }
  };
  const adopt = value => {
    const next = getKnowledge(value); if (!next?.id) return;
    setItems(previous => {
      const found = previous.find(item => item.id === next.id); if (found && found.revision > next.revision) return previous;
      const summary = { ...next, documentCount: next.documentCount ?? next.documents?.length ?? 0 }; delete summary.documents;
      return found ? previous.map(item => item.id === next.id ? summary : item) : [...previous, summary];
    });
    if (view.current.knowledgeId === next.id) setKnowledge(previous => previous?.id === next.id && previous.revision > next.revision ? previous : next);
  };
  const refreshList = async () => {
    const epoch = lifecycle.current, ticket = ++listRequest.current, value = await api('knowledge.list', { includeArchived: true });
    if (alive(epoch) && ticket === listRequest.current) setItems(Array.isArray(value) ? value : value.knowledge || []);
  };
  const load = async (id = view.current.knowledgeId, action = 'knowledge.get') => {
    if (!id) return;
    const ticket = knowledgeViewTicket(view.current, ++requestId.current), value = await api(action, { knowledgeId: id });
    if (current(ticket)) adopt(value); return value;
  };
  const refresh = async () => { await Promise.all([refreshList(), load()]); await onRefresh?.(); };
  React.useEffect(() => { run(refreshList); }, [api]);
  const watch = jobs.some(knowledgeImportRunning) || items.some(item => ['queued', 'indexing'].includes(item.index?.state));
  React.useEffect(() => {
    if (!watch) return;
    const timer = setInterval(async () => {
      if (!mounted.current || lock.current || polling.current) return;
      const epoch = lifecycle.current; polling.current = true;
      try {
        for (const job of live.current.jobs.filter(knowledgeImportRunning)) {
          const value = await api('knowledge.import.status', { jobId: job.id }); if (!alive(epoch)) return;
          setJobs(previous => previous.map(item => item.id === job.id ? value.job : item)); if (value.knowledge) adopt(value);
        }
        await refreshList();
        if (view.current.knowledgeId) await load(view.current.knowledgeId, 'knowledge.status');
      } catch (cause) { if (alive(epoch)) setError(cause); }
      finally { polling.current = false; }
    }, 1800);
    return () => clearInterval(timer);
  }, [api, watch]);
  const select = (id, confirmed = false) => {
    if (!confirmed && fileManager.current?.isDirty()) {fileManager.current.navigate(() => select(id, true)); return;}
    if (fileManager.current?.isBusy()) return;
    if (lock.current || live.current.items.some(item => item.id === id && item.unavailable)) return;
    const next = view.current.knowledgeId === id ? '' : id;
    view.current = { knowledgeId: next, sequence: view.current.sequence + 1 }; requestId.current++;
    setKnowledgeId(next); setKnowledge(null); setQuery(''); setSearchResult(null); setError(null);
    if (next) run(() => load(next));
  };
  const openForm = (form, confirmed = false) => {if (!confirmed && fileManager.current?.isDirty()) {fileManager.current.navigate(() => openForm(form, true)); return;}  modalEpoch.current++; setDecision(false); setError(null); setModal(drafts.current.get(formKey(form)) || form); };
  const updateDraft = (key, value) => setModal(previous => ({ ...previous, draft: { ...previous.draft, [key]: value } }));
  const forget = form => { drafts.current.delete(formKey(form)); setKeptCount(drafts.current.size); };
  const openLocal = target => {
    const draft = { knowledgeId: target?.id || '', name: '', source: 'files', path: '', projectId: '', selection: [] };
    openForm({ type: 'local', draft, original: draft, files: [] });
  };
  const openGit = target => {
    const draft = { knowledgeId: target?.id || '', name: '', repositoryUrl: '', branch: '', authProfileId: '', httpsUsername: '', httpsToken: '' };
    openForm({ type: 'git', draft, original: draft });
    run(async epoch => { const value = await api('ssh.profile.list', {}); if (alive(epoch)) setProfiles(value.profiles || []); });
  };
  const edit = item => run(async epoch => {
    const value = item?.id ? getKnowledge(await api('knowledge.get', { knowledgeId: item.id })) : null;
    if (!alive(epoch)) return; const draft = metadata(value); openForm({ type: item ? 'rename' : 'new', knowledgeId: value?.id, revision: value?.revision, draft, original: draft });
  });
  const close = () => {
    if (lock.current) return;
    if (decision) { setDecision(false); return; }
    if (knowledgeDraftDirty(modal)) { setDecision(true); return; }
    modalEpoch.current++; setModal(null);
  };
  const chooseFiles = files => {
    if (!files.length) return;
    setModal(previous => ({ ...previous, files, draft: { ...previous.draft, source: 'files', path: '', projectId: '', selection: files.map(file => file.webkitRelativePath || file.name), name: previous.draft.name || knowledgeImportName(files) } }));
  };
  const chooseNative = () => run(async epoch => {
    const owner = modalEpoch.current, value = await onPickDirectory?.(), path = typeof value === 'string' ? value : value?.path;
    if (!path || !alive(epoch) || owner !== modalEpoch.current) return;
    setModal(previous => ({ ...previous, files: [], draft: { ...previous.draft, source: 'path', path, projectId: '', selection: [], name: previous.draft.name || path.split(/[\\/]/).filter(Boolean).at(-1) } }));
  });
  const adoptNewSelection = value => {
    const next = getKnowledge(value); if (!next?.id) return;
    view.current = { knowledgeId: next.id, sequence: view.current.sequence + 1 }; requestId.current++;
    setKnowledgeId(next.id); setKnowledge(next); setQuery(''); setSearchResult(null); adopt(value);
  };
  const submitImport = async (form, epoch) => {
    const input = form.draft;
    if (form.type === 'local' && input.source === 'files') {
      if (!form.files?.length) throw new Error('请先选择文件夹或文件。');
      const plan = knowledgeUploadPlan(form.files);
      if (!plan.candidates.length) { setNotice(`已跳过 ${plan.skipped.length} 个私密或依赖文件，没有导入文件。`); return; }
      let target = input.knowledgeId ? getKnowledge(await api('knowledge.get', { knowledgeId: input.knowledgeId })) : getKnowledge(await api('knowledge.create', { name: input.name.trim() || knowledgeImportName(form.files) }));
      if (!alive(epoch)) return; adoptNewSelection({ knowledge: target });
      setModal(previous => ({ ...previous, draft: { ...previous.draft, knowledgeId: target.id } }));
      let result;
      try { result = await importKnowledgeFiles({ files: form.files, knowledge: target, api, upload: (file, options) => uploadFile(api, file, options), onProgress: value => { if (alive(epoch)) { setProgress(value); adopt({ knowledge: value.knowledge }); } } }); }
      catch (cause) {
        if (alive(epoch) && cause.saved?.length) setModal(previous => { const files = previous.files.filter(file => !cause.saved.includes(file.webkitRelativePath || file.relativePath || file.name)); return { ...previous, files, draft: { ...previous.draft, selection: files.map(file => file.webkitRelativePath || file.relativePath || file.name) } }; });
        throw cause;
      }
      if (!alive(epoch)) return; adopt(result); setFailures(result.failures || []); if (result.indexError) setError(result.indexError);
      setNotice(`已导入 ${result.saved.length} 个文件${result.skipped.length ? `，跳过 ${result.skipped.length} 个` : ''}${result.failures.length ? `，${result.failures.length} 个失败` : ''}。`);
      return;
    }
    const args = {};
    if (input.knowledgeId) { const target = getKnowledge(await api('knowledge.get', { knowledgeId: input.knowledgeId })); args.knowledgeId = target.id; args.expectedRevision = target.revision; }
    else if (input.name.trim()) args.name = input.name.trim();
    let action;
    if (form.type === 'git') {
      if (!input.repositoryUrl.trim()) throw new Error('请填写 Git 仓库地址。');
      action = 'knowledge.import.git'; args.repositoryUrl = input.repositoryUrl.trim();
      if (input.branch.trim()) args.branch = input.branch.trim(); if (input.authProfileId) args.authProfileId = input.authProfileId; if (input.httpsToken) args.httpsToken = input.httpsToken; if (input.httpsUsername?.trim()) args.httpsUsername = input.httpsUsername.trim();
    } else {
      action = 'knowledge.import.local';
      if (input.source === 'path' && input.path) args.path = input.path;
      else if (input.source === 'project' && input.projectId) args.projectId = input.projectId;
      else throw new Error('请先选择本地目录或项目。');
    }
    const value = await api(action, args); if (!alive(epoch)) return;
    setJobs(previous => [...previous.filter(job => job.id !== value.job.id), value.job]);
    if (value.knowledge) adoptNewSelection(value); setNotice('已开始导入。');
  };
  const submit = () => run(async epoch => {
    const form = live.current.modal, owner = modalEpoch.current; setFailures([]);
    try {
      if (['local', 'git'].includes(form.type)) await submitImport(form, epoch);
      else if (form.type === 'mount') await api('knowledge.project.bind', { projectId: form.project.id, expectedRevision: form.project.revision, knowledgeIds: form.draft.knowledgeIds });
      else {
        if (!form.draft.name.trim()) throw new Error('请填写目录名称。');
        const value = await api(form.type === 'new' ? 'knowledge.create' : 'knowledge.update', { name: form.draft.name.trim(), description: form.draft.description || '', ...(form.knowledgeId ? { knowledgeId: form.knowledgeId, expectedRevision: form.revision } : {}) });
        if (alive(epoch)) adopt(value);
      }
      if (!alive(epoch)) return; forget(form);
      if (owner === modalEpoch.current) { modalEpoch.current++; setModal(null); setDecision(false); }
    } finally { if (alive(epoch)) { await refreshList(); if (view.current.knowledgeId) await load(); await onRefresh?.(); } }
  });
  const submitRef = React.useRef(submit); submitRef.current = submit;
  React.useEffect(() => registerGuard?.({ manual: true, isDirty: () => knowledgeDraftDirty(live.current.modal) || drafts.current.size > 0 || Boolean(fileManager.current?.isDirty()), isBusy: () => !!lock.current || Boolean(fileManager.current?.isBusy()),
    inspect: () => { if (!live.current.modal && drafts.current.size) { modalEpoch.current++; setModal([...drafts.current.values()].at(-1)); } }, save: () => fileManager.current?.isDirty() ? fileManager.current.save() : submitRef.current(),
    discard: () => { fileManager.current?.discard(); drafts.current.clear(); setKeptCount(0); modalEpoch.current++; setModal(null); setDecision(false); },
  }), [registerGuard]);
  const reloadForm = () => run(async epoch => {
    const form = live.current.modal, owner = modalEpoch.current;
    if (form.type === 'rename') { const latest = getKnowledge(await api('knowledge.get', { knowledgeId: form.knowledgeId })); if (alive(epoch) && owner === modalEpoch.current) setModal(previous => ({ ...previous, revision: latest.revision, original: metadata(latest) })); }
    if (form.type === 'mount') { const value = await api('project.get', { projectId: form.project.id }), project = value.project || value; if (alive(epoch) && owner === modalEpoch.current) setModal(previous => ({ ...previous, project, original: { knowledgeIds: project.workbench?.knowledgeIds || [] } })); }
  });
  const selectProject = id => run(async epoch => {
    const owner = modalEpoch.current, value = await api('project.get', { projectId: id }), project = value.project || value; if (!alive(epoch) || owner !== modalEpoch.current) return;
    const draft = { knowledgeIds: project.workbench?.knowledgeIds || [] }; openForm({ type: 'mount', project, draft, original: draft });
  });
  const archive = () => run(async epoch => {
    const target = live.current.modal.item, latest = getKnowledge(await api('knowledge.get', { knowledgeId: target.id }));
    await api('knowledge.archive', { knowledgeId: target.id, expectedRevision: latest.revision, archived: !target.archived });
    if (alive(epoch)) { setModal(null); if (!target.archived && view.current.knowledgeId === target.id) { view.current = { knowledgeId: '', sequence: view.current.sequence + 1 }; setKnowledgeId(''); setKnowledge(null); } await refresh(); }
  });
  const retry = item => run(async epoch => {
    const latest = getKnowledge(await api('knowledge.get', { knowledgeId: item.id })); const value = await api('knowledge.index', { knowledgeId: item.id, expectedRevision: latest.revision, mode: 'bm25' }); if (alive(epoch)) { adopt(value); await refreshList(); }
  });
  const cancelJob = job => run(async epoch => { const value = await api('knowledge.import.cancel', { jobId: job.id }); if (alive(epoch)) setJobs(previous => previous.map(item => item.id === job.id ? value.job : item)); });
  const search = event => {
    event.preventDefault(); if (!query.trim() || !knowledge) return;
    if (!knowledgeIndexState(knowledge).ready) { const state = knowledgeIndexState(knowledge).state; setNotice(['queued', 'indexing'].includes(state) ? '资料正在整理，可先按文件名查找。' : documents.every(document => !document.searchable) ? '当前目录只有原件，可按文件名查找。' : state === 'failed' ? '整理失败，可从更多菜单重试。' : '资料尚不可搜索，可先按文件名查找。'); return; }
    const owner = view.current.knowledgeId, sequence = view.current.sequence;
    run(async epoch => { const value = await api('knowledge.search', { knowledgeId: owner, query: query.trim(), mode: 'bm25', limit: 12 }); if (alive(epoch) && view.current.knowledgeId === owner && view.current.sequence === sequence) setSearchResult(value); });
  };
  const projects = (library.projects || []).filter(project => !project.deletedAt && !project.archived), documents = knowledge?.documents || [];
  const unavailable = items.find(item => item.id === knowledgeId && item.unavailable);
  const selectedItem = items.find(item => item.id === knowledgeId) || knowledge;
  const visible = items.filter(item => (includeArchived || !item.archived) && (!libraryQuery.trim() || `${item.name} ${item.description || ''}`.toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase())));
  const targets = items.filter(item => !item.archived && !item.unavailable && !jobs.some(job => job.knowledgeId === item.id && knowledgeImportRunning(job)));
  const resourceState = item => {
    const value = knowledgeId === item.id && knowledge ? knowledge : item, index = knowledgeIndexState(value), job = [...jobs].reverse().find(job => job.knowledgeId === item.id), importing = job && knowledgeImportRunning(job);
    const count = value.documentCount ?? value.documents?.length ?? 0, originalsOnly = (value.searchableCount ?? value.documents?.filter(document => document.searchable).length) === 0 && count > 0;
    return { value, index, job, importing, count, label: item.unavailable ? '不可用' : item.archived ? '已归档' : importing ? knowledgeImportState(job) : originalsOnly ? '仅原件' : !count ? '空知识库' : `${index.label}${knowledgeIndexProgress(index.progress) ? ` ${knowledgeIndexProgress(index.progress)}` : ''}`, tone: item.unavailable ? 'failed' : importing ? 'pending' : index.tone, error: item.error || job?.error || job?.result?.indexError || value.index?.error || value.lastImport?.indexError || (index.error ? { message: index.error } : null), importFailures: job?.result?.failures || value.lastImport?.failures || [], failedCount: job?.result?.failedCount ?? value.lastImport?.failedCount ?? 0 };
  };
  const resourceMenu = (item, state) => <MoreMenu label={`${item.name || '知识库'}的更多操作`}>
    <Button disabled={busy || item.archived || item.unavailable || state.importing} onClick={event => menuClick(event, () => openLocal(item))}>导入本地到此知识库</Button><Button disabled={busy || item.archived || item.unavailable || state.importing} onClick={event => menuClick(event, () => openGit(item))}>导入 Git 到此知识库</Button><Button disabled={busy} onClick={event => menuClick(event, () => openForm({ type: 'mount-picker' }))}>项目绑定</Button><Button disabled={busy || item.unavailable} onClick={event => menuClick(event, () => edit(item))}>重命名</Button>{state.index.state === 'failed' && <Button disabled={busy || item.archived || item.unavailable} onClick={event => menuClick(event, () => retry(item))}>重试整理</Button>}<Button disabled={busy || item.unavailable} onClick={event => menuClick(event, () => openForm({ type: 'archive', item }))}>{item.archived ? '恢复知识库' : '归档知识库'}</Button><Button disabled={busy} onClick={event => menuClick(event, () => run(refresh))}>刷新</Button>
  </MoreMenu>;
  return <section className="wb-knowledge kb-page wb-resource-gallery" data-detail={Boolean(knowledgeId)} aria-label="知识库">
    <style>{galleryStyles + styles}</style>
    {!knowledgeId && <header className="wb-resource-toolbar"><div className="wb-resource-search"><Icon name="search" size={16}/><input aria-label="搜索知识库" placeholder="搜索知识库…" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)}/>{libraryQuery && <Button className="wb-ghost wb-icon-button" aria-label="清除知识库搜索" onClick={() => setLibraryQuery('')}><Icon name="x" size={14}/></Button>}</div><div className="wb-resource-actions"><Button primary disabled={busy} onClick={() => openForm({ type: 'add' })}><Icon name="plus" size={16}/>新增</Button><MoreMenu label="知识库更多操作"><Button disabled={busy} onClick={event => menuClick(event, () => openForm({ type: 'mount-picker' }))}>项目绑定</Button><Button onClick={event => menuClick(event, () => setIncludeArchived(value => !value))}>{includeArchived ? '隐藏归档知识库' : '显示归档知识库'}</Button><Button disabled={busy} onClick={event => menuClick(event, () => run(refresh))}>刷新</Button></MoreMenu></div></header>}
    <ErrorBox error={error} onClose={() => setError(null)} context="知识库操作"/>{notice && <p className="kb-notice" role="status">{notice}</p>}{busy && <p className="kb-notice" role="status">{progress ? `正在导入 ${progress.saved.length}/${progress.total}${progress.skipped.length ? ` · 跳过 ${progress.skipped.length}` : ''}` : '正在处理…'}</p>}
    {failures.length > 0 && <details className="kb-failures"><summary>{failures.length} 个文件未导入</summary>{failures.map((failure, index) => <p key={failure.path || index}>{failure.path} · {failure.message || failure.code}</p>)}</details>}
    {keptCount > 0 && <p className="kb-notice">有 {keptCount} 份未完成草稿 <button type="button" onClick={() => { modalEpoch.current++; setModal([...drafts.current.values()].at(-1)); }}>继续编辑</button></p>}
    {jobs.filter(job => !job.knowledgeId || !items.some(item => item.id === job.knowledgeId)).map(job => <div className="kb-import-row" key={job.id}><Icon name="folder" size={17}/><span>{job.name || '导入项目'}</span><small>{knowledgeImportState(job)}</small>{knowledgeImportRunning(job) && <Button disabled={busy || job.status === 'cancelling'} onClick={() => cancelJob(job)}>取消</Button>}<InlineError error={job.error}/></div>)}
    {!knowledgeId && <div className="wb-resource-grid" aria-label="知识库列表">
      {visible.map(item => { const selected = knowledgeId === item.id, state = resourceState(item), source = state.value.lastImport?.source?.kind; return <article className="wb-project-card kb-resource-card" key={item.id} aria-label={`知识库 ${item.name}`} data-selected={selected}>
        <button type="button" className="wb-project-card-preview" disabled={busy || item.unavailable} aria-label={`打开知识库 ${item.name}`} aria-expanded={selected} onClick={() => select(item.id)}><ResourceCardCover kind="knowledge" label={source === 'git' ? 'Git 知识库' : '知识库'} icon="knowledge" file="知识文档"/></button>
        <div className="wb-project-card-actions"><button type="button" className="wb-project-card-name" title={item.name} disabled={busy || item.unavailable} onClick={() => select(item.id)}>{item.unavailable ? '知识库不可用' : item.name}</button><div className="wb-project-card-tools">{resourceMenu(item, state)}</div></div>
        {state.importing && <div className="wb-gallery-card-meta"><span className="kb-status" data-tone={state.tone}>{state.label}</span><Button disabled={busy || state.job.status === 'cancelling'} onClick={() => cancelJob(state.job)}>取消导入</Button></div>}
        <div className="kb-card-feedback"><InlineError error={state.error}/></div>
      </article>; })}
      {!visible.length && !busy && <div className="wb-resource-empty"><Icon name="knowledge" size={28}/><p>{libraryQuery.trim() ? '没有匹配的知识库' : '还没有知识库'}</p>{!libraryQuery.trim() && <Button onClick={() => openForm({ type: 'add' })}>新增知识库</Button>}</div>}
    </div>}
    {knowledgeId && selectedItem && (() => { const state = resourceState(selectedItem); return <section ref={detailRef} className="kb-detail" aria-label={`${selectedItem.name}的文件`}>
      <header className="kb-detail-heading">
        <Button className="kb-back" disabled={busy} aria-label="返回知识库" title="返回知识库" onClick={() => select(knowledgeId)}><Icon name="arrow-left" size={16}/></Button>
        <div className="kb-detail-title"><Icon name="knowledge" size={18}/><h2>{selectedItem.name}</h2><span className="kb-status" data-tone={state.tone}>{state.label}</span></div>
        <form className="kb-search" onSubmit={search}><Icon name="search" size={15}/><input aria-label="搜索此知识库的文件或内容" placeholder="搜索文件或内容…" value={query} onChange={event => {setQuery(event.target.value); setSearchResult(null);}}/>{query && <button type="button" aria-label="清除文件搜索" onClick={() => {setQuery(''); setSearchResult(null);}}><Icon name="x" size={14}/></button>}<Button type="submit" disabled={busy || !query.trim() || !knowledge}>搜索内容</Button></form>
        <div className="kb-actions">{resourceMenu(selectedItem, state)}</div>
      </header>
      <InlineError error={state.error}/>{state.importFailures.length > 0 ? <details className="kb-failures"><summary>{state.importFailures.length} 个文件未导入</summary>{state.importFailures.map((failure, position) => <p key={`${failure.path}:${position}`}>{failure.path} · {failure.message || failure.code}</p>)}</details> : state.failedCount > 0 && <p className="kb-notice">{state.failedCount} 个文件未导入。</p>}{state.importing && <div className="kb-root-progress"><Button disabled={busy || state.job.status === 'cancelling'} onClick={() => cancelJob(state.job)}>取消导入</Button></div>}
      {!unavailable && (knowledge ? <KnowledgeFiles ref={fileManager} key={knowledgeId} api={api} knowledge={knowledge} query={query} searchResult={searchResult} onClearSearch={() => {setQuery(''); setSearchResult(null);}} onChanged={value => {adopt(value); setSearchResult(null);}} onRefresh={refresh} NativeFileTree={NativeFileTree} locked={ownBusy} onBusyChange={setFileBusy}/> : <p className="kb-empty-inline">正在读取目录…</p>)}

    </section>; })()}
    {modal && <Modal key={modal.type} title={({ add: '新增知识库', local: '导入本地', git: '导入 Git', rename: '重命名目录', new: '新建知识库', 'mount-picker': '项目绑定', mount: '项目绑定', archive: modal.item?.archived ? '恢复目录' : '归档目录' })[modal.type] || '知识库'} onClose={close}>
      {error && ['rename', 'mount'].includes(modal.type) && <Button disabled={busy} onClick={reloadForm}>读取最新信息，保留修改</Button>}
      {decision && <div className="kb-decision" role="alertdialog" aria-label="尚未完成的修改"><strong>修改尚未完成</strong><div className="kb-actions"><Button primary disabled={busy} onClick={() => setDecision(false)}>继续编辑</Button><Button disabled={busy} onClick={() => { drafts.current.set(formKey(modal), modal); setKeptCount(drafts.current.size); setDecision(false); modalEpoch.current++; setModal(null); }}>保留草稿并关闭</Button><Button disabled={busy} onClick={() => { forget(modal); setDecision(false); modalEpoch.current++; setModal(null); }}>丢弃并关闭</Button></div></div>}
      <div inert={decision || busy ? true : undefined}>
        {modal.type === 'add' && <div className="wb-resource-add-choices"><Button onClick={() => openLocal()}><Icon name="folder-open" size={19}/>导入本地</Button><Button onClick={() => openGit()}><Icon name="git" size={19}/>导入 Git</Button><Button onClick={() => edit()}><Icon name="plus" size={19}/>新建知识库</Button></div>}
        {['local', 'git', 'rename', 'new', 'mount'].includes(modal.type) && <form className="kb-form" onSubmit={event => { event.preventDefault(); submit(); }}>
          {['local', 'git'].includes(modal.type) && <><label>保存到<select value={modal.draft.knowledgeId} onChange={event => updateDraft('knowledgeId', event.target.value)}><option value="">新目录</option>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{!modal.draft.knowledgeId && <label>目录名称<input value={modal.draft.name} placeholder={modal.type === 'git' ? '默认使用仓库名称' : '选择文件后自动填写'} onChange={event => updateDraft('name', event.target.value)} /></label>}</>}
          {modal.type === 'local' && <><div className="kb-picker-actions"><label className="wb-button"><Icon name="folder-open" size={16}/>选择文件夹<input hidden type="file" multiple webkitdirectory="" directory="" onChange={event => { chooseFiles(Array.from(event.target.files || [])); event.target.value = ''; }}/></label><label className="wb-button">选择文件<input hidden type="file" multiple onChange={event => { chooseFiles(Array.from(event.target.files || [])); event.target.value = ''; }}/></label>{onPickDirectory && <Button onClick={chooseNative}>本机目录…</Button>}</div>{modal.draft.source === 'files' && modal.files.length > 0 && <p className="kb-source">已选择 {modal.files.length} 个文件</p>}{modal.draft.source === 'path' && <p className="kb-source">{modal.draft.path}</p>}{projects.length > 0 && <details className="kb-advanced"><summary>导入已有项目</summary><label>项目<select value={modal.draft.projectId} onChange={event => setModal(previous => ({ ...previous, files: [], draft: { ...previous.draft, source: 'project', projectId: event.target.value, path: '', selection: [], name: previous.draft.name || projects.find(project => project.id === event.target.value)?.name || '' } }))}><option value="">选择项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></details>}<p className="kb-help">导入后自动整理；私密文件和依赖目录会跳过。</p></>}
          {modal.type === 'git' && <><label>Git 仓库地址<input required autoComplete="off" value={modal.draft.repositoryUrl} placeholder="https://host/team/project.git" onChange={event => updateDraft('repositoryUrl', event.target.value)}/></label><label>分支<input value={modal.draft.branch} placeholder="默认分支" onChange={event => updateDraft('branch', event.target.value)}/></label><details className="kb-advanced"><summary>访问凭据（可选）</summary><label>SSH 配置<select value={modal.draft.authProfileId} onChange={event => updateDraft('authProfileId', event.target.value)}><option value="">不使用 SSH 配置</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><label>HTTPS 用户名<input autoComplete="username" placeholder="git" value={modal.draft.httpsUsername} onChange={event => updateDraft('httpsUsername', event.target.value)}/></label><label>HTTPS 访问令牌<input type="password" autoComplete="new-password" value={modal.draft.httpsToken} onChange={event => updateDraft('httpsToken', event.target.value)}/></label><p className="kb-help">令牌仅用于本次导入。</p></details></>}
          {['rename', 'new'].includes(modal.type) && <label>目录名称<input required maxLength={200} value={modal.draft.name} onChange={event => updateDraft('name', event.target.value)}/></label>}
          {modal.type === 'mount' && <><p className="kb-help">{modal.project.name}</p><div className="kb-bindings">{items.filter(item => !item.archived || modal.draft.knowledgeIds.includes(item.id)).map(item => <label key={item.id}><input type="checkbox" disabled={(item.unavailable || item.archived) && !modal.draft.knowledgeIds.includes(item.id)} checked={modal.draft.knowledgeIds.includes(item.id)} onChange={event => updateDraft('knowledgeIds', event.target.checked ? [...modal.draft.knowledgeIds, item.id] : modal.draft.knowledgeIds.filter(id => id !== item.id))}/><span>{item.name}{item.unavailable ? ' · 不可用' : item.archived ? ' · 已归档' : ''}</span></label>)}</div></>}
          <footer><Button disabled={busy} onClick={close}>取消</Button><Button primary type="submit" disabled={busy || ['rename', 'new', 'mount'].includes(modal.type) && !knowledgeDraftDirty(modal)}>{['local', 'git'].includes(modal.type) ? '开始导入' : '保存'}</Button></footer>
        </form>}
        {modal.type === 'mount-picker' && <div className="kb-form"><label>项目<select defaultValue="" onChange={event => event.target.value && selectProject(event.target.value)}><option value="">选择项目</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>{!projects.length && <p className="kb-help">还没有项目。</p>}</div>}
        {modal.type === 'archive' && <div className="kb-form"><p>{modal.item.archived ? '恢复后会重新显示此目录。' : '归档后保留文件，可从更多菜单中显示并恢复。'}</p><footer><Button onClick={close}>取消</Button><Button primary onClick={archive}>确认{modal.item.archived ? '恢复' : '归档'}</Button></footer></div>}

      </div>
    </Modal>}
  </section>;
}
