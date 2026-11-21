import React from 'react';
import {Button, Modal, ErrorBox} from './common.jsx';
import {Icon} from './brand.jsx';
import ResourceView, {CodeEditor} from './ResourceView.jsx';
import {uploadFile} from './upload.js';
import {readSystemResource, readSystemResourceBytes, systemBytesBase64, inlineSystemResource, isTextSystemResource, replaceSystemResource, systemResourceFileBody} from './system-resource.js';
import {systemDirectoryFiles, systemFilePath} from '../system-directory.js';
import SystemThemeEditor from './SystemThemeEditor.jsx';
import themeStyles from './system-theme-styles.js';
import {MOBILE_THEME_FORMAT} from '../mobile-theme.js';
import {builtinSystems,selectableSystems} from './builtin-systems.js';
import galleryStyles from './resource-gallery-styles.js';
import ResourceCardCover from './ResourceCardCover.jsx';
import styles from './system-directory-styles.js';
import {systemPreviewDocument} from './system-preview.js';

const draftKey = draft => draft.id || draft.localId;
const fingerprint = draft => JSON.stringify([draft.name, draft.description, draft.platforms, [...draft.files].sort((a, b) => systemFilePath(a).localeCompare(systemFilePath(b)))]);
const changed = draft => draft && (draft.isNew || fingerprint(draft) !== draft.baseline);

function filePresentation(path) {
  if (path === 'rule.md') return {title: '设计规则', hint: 'AI 将遵循这份规则进行设计', tone: 'blue'};
  if (path === 'tokens.json') return {title: '设计变量', hint: '配色、字体、间距与组件变量', tone: 'amber'};
  if (/\.css$/i.test(path)) return {title: '样式文件', hint: '查看或编辑可复用的 CSS 样式', tone: 'violet'};
  if (/\.html?$/i.test(path)) return {title: '页面示例', hint: '预览组件外观，切换编辑可修改源码', tone: 'blue'};
  if (/\.(png|jpe?g|svg|webp|gif)$/i.test(path)) return {title: '图片资源', hint: '规范中可复用的视觉素材', tone: 'green'};
  return {title: '规范文件', hint: '此文件随规范目录一同保存', tone: 'violet'};
}

function directoryDraft(system, version = system.versions?.at(-1) || {}) {
  const draft = {id: system.id, localId: system.id ? undefined : crypto.randomUUID(), name: system.name, description: system.description || '',
    platforms: system.platforms || ['web', 'mobile'], revision: system.revision,
    version: version.version, files: systemDirectoryFiles(version), selected: 'rule.md', isNew: !system.id};
  draft.baseline = fingerprint(draft);
  return draft;
}

function FileTree({files, selected, onSelect, disabled}) {
  const root = {children: new Map()};
  for (const path of files.map(systemFilePath)) {
    let node = root, full = '';
    const parts = path.split('/').filter(Boolean);
    parts.forEach((name, index) => {
      full += (full ? '/' : '') + name;
      if (!node.children.has(name)) node.children.set(name, {name, path: full, children: new Map()});
      node = node.children.get(name);
      if (index === parts.length - 1 && !path.endsWith('/')) node.file = true;
    });
  }
  const render = node => [...node.children.values()].sort((a, b) =>
    (a.path === 'rule.md' ? -1 : b.path === 'rule.md' ? 1 : Number(a.file || false) - Number(b.file || false)) || a.name.localeCompare(b.name))
    .map(item => item.file ? <button key={item.path} type="button" disabled={disabled}
      className={`wb-spec-file ${selected === item.path ? 'is-selected' : ''}`}
      data-tone={filePresentation(item.path).tone} aria-current={selected === item.path ? 'page' : undefined}
      onClick={() => onSelect(item.path)} title={item.path}>
      <Icon name={item.path === 'rule.md' ? 'book' : 'file'} size={17}/>
      <span className="wb-spec-file-name">{item.path === 'rule.md' ? <><strong>设计规则</strong><small>rule.md</small></> : item.name}</span>
      {item.path === 'rule.md' && <small className="wb-spec-required">必需</small>}
    </button> : <details key={item.path} open>
      <summary><Icon name="chevron-right" size={12}/><Icon name="folder" size={17}/><span>{item.name}</span><small>{item.children.size}</small></summary>
      <div className="wb-spec-branch">{item.children.size ? render(item) : <span className="wb-spec-empty-folder">暂无文件</span>}</div>
    </details>);
  return <nav className="wb-spec-tree" aria-label="规范文件目录">{render(root)}</nav>;
}

export default function SystemLibrary({api, library, onRefresh, registerGuard}) {
  const [systems, setSystems] = React.useState(library.systems || []);
  const [draft, setDraft] = React.useState(null), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null), [notice, setNotice] = React.useState('');
  const [query, setQuery] = React.useState(''), [newPath, setNewPath] = React.useState(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [visual, setVisual] = React.useState(false);
  const [resource, setResource] = React.useState(null), [preview, setPreview] = React.useState(true);
  const [interactive, setInteractive] = React.useState(false), [previewKey, setPreviewKey] = React.useState(0);
  const [cardAction, setCardAction] = React.useState(null);
  const themeView = React.useRef('components');
  const drafts = React.useRef(new Map()), cache = React.useRef(new Map()), rootRef = React.useRef(null), lock = React.useRef(false);
  const live = React.useRef({draft, busy, cardAction}); live.current = {draft, busy, cardAction};
  const folderPicker = React.useRef(null), assetPicker = React.useRef(null);

  const work = async fn => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null); setNotice('');
    try { return await fn(); } catch (failure) { setError(failure); } finally { lock.current = false; setBusy(false); }
  };
  const refresh = async () => {
    const result = await api('system.list', {});
    setSystems(result.systems || []);
  };
  React.useEffect(() => { work(refresh); }, []);
  React.useEffect(() => {if (infoOpen) rootRef.current?.querySelector('.wb-spec-info-form input')?.focus();}, [infoOpen]);
  React.useEffect(() => {
    const outside = event => rootRef.current?.querySelectorAll('.wb-spec-card-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  React.useEffect(() => registerGuard?.({manual: true,
    isDirty: () => changed(live.current.draft) || [...drafts.current.values()].some(changed) || !!live.current.cardAction && live.current.cardAction.name !== live.current.cardAction.system.name,
    isBusy: () => live.current.busy,
    inspect: () => { if (!live.current.draft) setDraft([...drafts.current.values()].find(changed) || null); },
    discard: () => { drafts.current.clear(); setDraft(null); setInfoOpen(false); setNewPath(null); setCardAction(null); }
  }), [registerGuard]);

  const update = patch => setDraft(current => {
    const next = {...current, ...patch};
    if (changed(next)) drafts.current.set(draftKey(next), next);
    else drafts.current.delete(draftKey(next));
    return next;
  });
  const show = system => {
    const next = directoryDraft(system);
    const previous = live.current.draft;
    if (previous?.id && previous.id === system.id && next.files.some(file => systemFilePath(file) === previous.selected)) next.selected = previous.selected;
    const kept = drafts.current.get(draftKey(next));
    setDraft(kept || next);
    setVisual(next.files.some(file => systemFilePath(file) === 'components.js') && next.files.some(file => systemFilePath(file) === 'tokens.json'));
    setPreview(true); setNotice('');
  };
  const open = system => {
    themeView.current = 'components';
    if (!system.builtin) return work(async () => show(await api('system.get', {systemId: system.id})));
    const kept = [...drafts.current.values()].find(draft => draft.builtinId === system.id);
    if (kept) {setDraft(kept); setVisual(true); setPreview(true); setNotice(''); setError(null); return;}
    create(system.name, system.createFiles(), {builtinId: system.id});
  };
  const create = (name, files, {builtinId} = {}) => {
    themeView.current = 'components';
    let platforms = ['web'];
    try {if (JSON.parse(files.find(file => systemFilePath(file) === 'tokens.json')?.content || 'null')?.format === MOBILE_THEME_FORMAT) platforms = ['mobile'];} catch {}
    const next = directoryDraft({name, platforms}, {resources: files});
    if (builtinId) {next.builtinId = builtinId; next.isNew = false;}
    if (changed(next)) drafts.current.set(draftKey(next), next);
    setDraft(next); setVisual(files.some(file => systemFilePath(file) === 'components.js')); setPreview(true); setNotice(''); setError(null);
  };
  const file = draft?.files.find(item => systemFilePath(item) === draft.selected);
  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!file) return;
    const key = `${draft.id}:${draft.version}:${systemFilePath(file)}`;
    (async () => {
      try {
        let value;
        if (file.content !== undefined || file.bytesBase64 !== undefined) value = inlineSystemResource(file);
        else {
          setResource(null);
          value = cache.current.get(key) || await readSystemResource(api, {systemId: draft.id, version: draft.version, resourceId: file.id});
          if (!isTextSystemResource(value)) {
            const loaded = await readSystemResourceBytes(api, {systemId: draft.id, version: draft.version, resourceId: file.id});
            value = inlineSystemResource({...value, bytesBase64: systemBytesBase64(loaded.bytes)});
          }
          cache.current.set(key, value);
        }
        if (preview && /\.html?$/i.test(systemFilePath(file))) value = {...value, previewHTML: await systemPreviewDocument(value.content || '', systemFilePath(file), async path => {
          const item = draft.files.find(item => systemFilePath(item) === path);
          if (!item) return null;
          return item.content !== undefined || item.bytesBase64 !== undefined ? item : readSystemResourceBytes(api, {systemId: draft.id, version: draft.version, resourceId: item.id});
        }, {interactive})};
        if (!cancelled) setResource({...value, path: systemFilePath(file), name: file.name, readonly: true, type: 'system-resource', mode: /\.html?$/i.test(systemFilePath(file)) ? 'render' : undefined, ...(isTextSystemResource(value) && value.mimeType === 'application/octet-stream' ? {mimeType: 'text/plain', binary: false} : {})});
      } catch (failure) { if (!cancelled) setError(failure); }
    })();
    return () => { cancelled = true; };
  }, [file, draft?.id, draft?.version, preview, interactive]);

  const save = () => work(async () => {
    if (!draft.name.trim()) throw new Error('请填写规范名称。');
    const rule = draft.files.find(item => systemFilePath(item) === 'rule.md');
    if (!rule) throw new Error('规范根目录需要 rule.md。');
    const args = {name: draft.name.trim(), description: draft.description, platforms: draft.platforms,
      format: 'directory', resources: draft.files, summary: '保存设计规范目录'};
    const saved = await uploadFile(api, new Blob([JSON.stringify(args)], {type: 'application/json'}), {
      purpose: 'system-package', name: draft.name + '.design-system.json', mediaType: 'application/json',
      ...(draft.id ? {systemId: draft.id, expectedRevision: draft.revision} : {}),
    });
    drafts.current.delete(draftKey(draft));
    show(saved);
    setDraft(current => ({...current, selected: draft.selected}));
    setPreview(preview); setNotice('已保存');
    await refresh(); await onRefresh();
  });
  const importFolder = files => files.length && work(async () => {
    const total = files.reduce((sum, item) => sum + item.size, 0);
    if (files.length > 500 || total > 64 * 1024 * 1024) throw new Error('规范最多包含 500 个文件，总大小不超过 64 MiB。');
    const rootName = files[0].webkitRelativePath.split('/')[0];
    const resources = await Promise.all(files.map(async file => ({logicalPath: file.webkitRelativePath.split('/').slice(1).join('/'), name: file.name, ...await systemResourceFileBody(file)})));
    if (!resources.some(item => item.logicalPath === 'rule.md')) throw new Error('请选择根目录包含 rule.md 的规范文件夹。');
    create(rootName, resources);
  });
  const addFiles = files => files.length && work(async () => {
    const additions = await Promise.all(files.map(async file => ({logicalPath: 'assets/' + file.name, name: file.name, ...await systemResourceFileBody(file)})));
    if (additions.some(item => draft.files.some(old => systemFilePath(old) === item.logicalPath))) throw new Error('同名文件已存在，请先移除旧文件再添加。');
    update({files: [...draft.files, ...additions], selected: additions[0].logicalPath});
  });
  const addTextFile = event => {
    event.preventDefault();
    const path = newPath.trim();
    if (!path || path.startsWith('/') || /[\\\u0000-\u001f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) { setError(new Error('请输入有效的相对文件路径。')); return; }
    if (draft.files.some(item => systemFilePath(item) === path)) { setError(new Error('该文件已存在。')); return; }
    update({files: [...draft.files, {logicalPath: path, name: path.split('/').at(-1), content: '', mimeType: /\.json$/i.test(path) ? 'application/json' : /\.css$/i.test(path) ? 'text/css' : 'text/plain'}], selected: path});
    setNewPath(null); setPreview(false);
  };
  const beginCardAction = (event, type, system) => {
    event.currentTarget.closest('details').open = false;
    setError(null);
    setCardAction({type, system, name: system.name});
  };
  const updateCard = (type, system, {name, platforms} = {}) => {
    return work(async () => {
      if (type === 'rename' && !name.trim()) throw new Error('请填写规范名称。');
      if (type === 'platforms' && !platforms.length) throw new Error('请至少选择一个适配场景。');
      const saved = await api(type === 'delete' ? 'system.archive' : 'system.save', {
        systemId: system.id, expectedRevision: system.revision,
        ...(type === 'rename' ? {name: name.trim()} : type === 'platforms' ? {platforms} : {}),
        summary: type === 'delete' ? '删除设计规范（归档）' : type === 'rename' ? '重命名设计规范' : '更新规范适配场景',
      });
      setSystems(values => values.map(value => value.id === saved.id ? saved : value));
      for (const [key, value] of drafts.current) {
        if (value.id !== system.id) continue;
        if (type === 'delete') drafts.current.delete(key);
        else if (value.revision === system.revision) {
          const baseline = JSON.parse(value.baseline);
          baseline[0] = saved.name; baseline[2] = saved.platforms;
          drafts.current.set(key, {...value, name: saved.name, platforms: saved.platforms, revision: saved.revision, baseline: JSON.stringify(baseline)});
        }
      }
      setCardAction(null);
      await refresh(); await onRefresh();
    });
  };
  const saveCardAction = event => {
    event.preventDefault();
    if (cardAction) return updateCard(cardAction.type, cardAction.system, {name: cardAction.name});
  };
  const isDirty = changed(draft);
  const patternFiles = draft?.files.filter(file => /^patterns\/.*\.html?$/i.test(systemFilePath(file))) || [];
  const presentation = draft ? filePresentation(draft.selected) : null;
  const availableSystems = selectableSystems(systems);
  const visibleSystems = availableSystems.filter(item => !item.archived && `${item.name} ${item.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section ref={rootRef} className={`wb-spec-library ${draft ? 'has-directory' : ''}`} aria-label="设计规范" aria-busy={busy}>
    <style>{galleryStyles + styles + themeStyles}</style>
    <input ref={folderPicker} type="file" webkitdirectory="" directory="" multiple hidden disabled={busy} onChange={event => {importFolder([...event.target.files]); event.target.value = '';}}/>
    <input ref={assetPicker} type="file" multiple hidden disabled={busy} onChange={event => {addFiles([...event.target.files]); event.target.value = '';}}/>
    <ErrorBox error={cardAction ? null : error} onClose={() => setError(null)} context="设计规范"/>
    {draft ? <>
      <header className="wb-spec-header">
        <Button className="wb-ghost wb-spec-back" aria-label="返回规范目录列表" title="返回列表，修改保留在草稿中" disabled={busy} onClick={() => {setDraft(null); setNotice('');}}>
          <Icon name="arrow-left" size={17}/><span>全部规范</span>
        </Button>
        <div className="wb-spec-identity">
          <h2>{draft.name || '未命名规范'}</h2>
          {draft.description && <p title={draft.description}>{draft.description}</p>}
        </div>
        <Button className="wb-ghost wb-icon-button" aria-label="编辑规范信息" title="编辑名称与描述" disabled={busy} onClick={() => setInfoOpen(true)}><Icon name="pencil" size={16}/></Button>
        <div className="wb-spec-save-state" role="status" data-dirty={!!isDirty}>{busy ? '正在处理…' : isDirty ? '有未保存修改' : notice || (draft.builtinId ? '内置规范' : '已保存')}</div>
        {draft.files.some(file => systemFilePath(file) === 'components.js') && <div className="wb-spec-view-switch" role="group" aria-label="规范编辑方式"><Button aria-pressed={visual} onClick={() => setVisual(true)}>可视化</Button><Button aria-pressed={!visual} onClick={() => setVisual(false)}>文件</Button>{patternFiles.length > 0 && <Button aria-label="维护页面范式" onClick={() => {update({selected: systemFilePath(patternFiles[0])}); setVisual(false); setPreview(true); setInteractive(true);}}>页面范式</Button>}</div>}
        <Button primary disabled={busy || (!isDirty && !draft.builtinId)} onClick={save} title="保存规范目录">{busy ? '处理中…' : '保存规范'}</Button>
      </header>
      {visual ? <SystemThemeEditor key={draftKey(draft)} draft={draft} api={api} busy={busy} runTask={work} initialView={themeView.current} onViewChange={view => {themeView.current = view;}} onChange={(files, platform) => update({files, ...(platform ? {platforms: [platform]} : {})})}/> : <div className="wb-spec-workspace">
        <aside className="wb-spec-sidebar">
          <header><strong>文件目录</strong><Button className="wb-ghost wb-icon-button" title="新建文本文件" aria-label="新建规范文件" disabled={busy} onClick={() => setNewPath('')}><Icon name="plus" size={17}/></Button><Button className="wb-ghost wb-icon-button" title="添加资源到 assets" aria-label="添加规范资源" disabled={busy} onClick={() => assetPicker.current.click()}><Icon name="upload" size={17}/></Button></header>
          <FileTree files={draft.files} selected={draft.selected} disabled={busy} onSelect={selected => {update({selected}); setPreview(true);}}/>
          <footer><span>{draft.files.length} 个文件</span><span>rule.md 必需</span></footer>
        </aside>
        <main className="wb-spec-content" aria-label="规范文件内容">
          <header className="wb-spec-document-header">
            <div className="wb-spec-document-title" data-tone={presentation.tone}>
              <Icon name={draft.selected === 'rule.md' ? 'book' : 'file'} size={20}/>
              <div><strong>{presentation.title}</strong><span title={draft.selected}>{draft.selected}</span></div>
            </div>
            {resource && resource.path === draft.selected && isTextSystemResource(resource) && <div className="wb-spec-modes" role="group" aria-label="文件查看方式">
              <Button disabled={busy} aria-pressed={preview && !interactive} onClick={() => {setPreview(true); setInteractive(false);}} title="预览文件内容"><Icon name="eye" size={15}/>预览</Button>
              <Button disabled={busy} aria-pressed={!preview} onClick={() => setPreview(false)} title="编辑文件内容"><Icon name="pencil" size={15}/>编辑</Button>
              {/\.html?$/i.test(draft.selected) && <Button disabled={busy} aria-pressed={preview && interactive} onClick={() => {setInteractive(true); setPreview(true);}}>交互调试</Button>}
              {preview && interactive && /\.html?$/i.test(draft.selected) && <Button disabled={busy} aria-label="重置范式预览" onClick={() => setPreviewKey(value => value + 1)}><Icon name="refresh" size={15}/></Button>}
            </div>}
            {draft.selected !== 'rule.md' && <details className="wb-spec-file-tools"><summary aria-label="当前文件更多操作" title="更多文件操作"><Icon name="more" size={18}/></summary><Button disabled={busy} className="wb-ghost" onClick={() => update({files: draft.files.filter(item => systemFilePath(item) !== draft.selected), selected: 'rule.md'})}><Icon name="trash" size={15}/>移除文件</Button></details>}
          </header>
          <p className="wb-spec-document-hint">{preview ? presentation.hint : '正在编辑此文件，修改后点击右上角保存规范。'}</p>
          <div className="wb-spec-view">{(!resource || resource.path !== draft.selected) ? <p className="wb-muted">{error ? '文件读取失败，可重选文件重试。' : '正在读取文件…'}</p> : !preview && isTextSystemResource(resource) ? <CodeEditor key={`${draftKey(draft)}:${draft.selected}`} path={draft.selected} value={resource.content || ''} readonly={busy} onChange={content => {
            const replacement = replaceSystemResource(file, {content});
            setResource(current => ({...current, content}));
            update({files: draft.files.map(item => systemFilePath(item) === draft.selected ? replacement : item)});
          }}/> : resource.previewHTML ? <iframe key={`${draft.selected}:${interactive}:${previewKey}`} title={draft.selected} className="wb-document-frame" sandbox={interactive ? 'allow-scripts' : ''} srcDoc={resource.previewHTML}/> : <ResourceView hideToolbar showOutline={false} key={`${draftKey(draft)}:${draft.selected}`} tab={resource} api={api} onUpdate={patch => setResource(current => ({...current, ...patch, readonly: true}))} onOpenFile={target => {
            if (draft.files.some(item => systemFilePath(item) === target.path)) update({selected: target.path});
            else setError(new Error('此规范目录中未找到文件 ' + target.path));
          }}/>}</div>
        </main>
      </div>}
    </> : <>
      <header className="wb-resource-toolbar wb-spec-list-toolbar" aria-label="设计规范工具栏">
        <h2>设计规范</h2>
        <div className="wb-resource-search"><Icon name="search" size={15}/><input aria-label="搜索设计规范" placeholder="搜索规范…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        <div className="wb-resource-actions">
          <Button disabled={busy} onClick={() => folderPicker.current.click()}><Icon name="folder" size={15}/>导入文件夹</Button>
          <details className="wb-spec-card-menu" onKeyDown={event => {
            if (event.key === 'Escape') {event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus();}
          }}>
            <summary className="wb-button wb-primary"><Icon name="plus" size={15}/>新建规范<Icon name="chevron-down" size={13}/></summary>
            <div className="wb-spec-card-menu-items">
              {builtinSystems.map(system=><button type="button" key={system.id} disabled={busy} onClick={()=>create('未命名规范',system.createFiles())}>{system.platforms[0]==='mobile'?'移动端':'Web 端'} · {system.name.split(' · ')[0]}</button>)}
            </div>
          </details>
        </div>
      </header>
      {[...drafts.current.values()].filter(changed).map(item => <button type="button" className="wb-spec-draft" key={draftKey(item)} disabled={busy} onClick={() => setDraft(item)}><Icon name="file-pen" size={16}/><span>继续草稿 · {item.name}</span></button>)}
      <div className="wb-resource-grid">{visibleSystems.map(system => <article className="wb-project-card wb-spec-card" key={system.id} aria-label={`设计规范 ${system.name}`}>
        <button type="button" className="wb-project-card-preview" aria-label={`打开规范 ${system.name}`} disabled={busy} onClick={() => open(system)}>
          <ResourceCardCover kind="system" label="设计规范" icon="book" file="rule.md" badges={<span className="wb-spec-platform-tags" aria-label={`${system.name}的适配场景`}>{(system.platforms || ['web', 'mobile']).map(platform => <span key={platform}>{platform === 'web' ? 'Web' : 'Mobile'}</span>)}</span>}/>
        </button>
        <div className="wb-project-card-actions">
          <button type="button" className="wb-project-card-name" title={system.name} aria-label={`打开规范 ${system.name} 的目录`} disabled={busy} onClick={() => open(system)}>{system.name}</button>
          <div className="wb-project-card-tools"><button type="button" className="wb-project-card-tool" title="复制当前规范" aria-label={`复制 ${system.name}`} disabled={busy} onClick={() => work(async () => {if (system.builtin) {create(system.name + ' 副本', system.createFiles()); return;} const copied = await api('system.copy', {systemId: system.id, name: system.name + ' 副本'}); show(copied); await refresh(); await onRefresh();})}><Icon name="copy" size={16}/></button>
            {!system.builtin && <details className="wb-spec-card-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }} onToggle={event => { if (event.currentTarget.open) rootRef.current?.querySelectorAll('.wb-spec-card-menu[open]').forEach(menu => { if (menu !== event.currentTarget) menu.open = false; }); }}>
              <summary className="wb-project-card-tool" aria-label={`${system.name}的更多操作`} title="更多操作"><Icon name="more" size={18}/></summary>
              <div className="wb-spec-card-menu-items">
                <button type="button" disabled={busy} onClick={event => beginCardAction(event, 'rename', system)}><Icon name="pencil" size={15}/>重命名</button>
                <fieldset className="wb-spec-card-platforms" disabled={busy}><legend>适配场景</legend>{[['web', 'Web'], ['mobile', 'Mobile']].map(([value, label]) => {
                  const platforms = system.platforms || ['web', 'mobile'];
                  return <label key={value}><input type="checkbox" aria-label={`适配 ${label}`} checked={platforms.includes(value)} disabled={busy || platforms.length === 1 && platforms.includes(value)} onChange={event => updateCard('platforms', system, {platforms: event.target.checked ? [...platforms, value] : platforms.filter(platform => platform !== value)})}/>{label}</label>;
                })}</fieldset>
                <button type="button" disabled={busy} onClick={event => beginCardAction(event, 'delete', system)} data-danger="true"><Icon name="trash" size={15}/>删除规范</button>
              </div>
            </details>}
          </div>
        </div>
      </article>)}</div>
      {!visibleSystems.length && <p className="wb-muted">{busy ? '正在加载…' : query.trim() ? '没有匹配的规范' : '新建一份 rule.md，即可开始使用设计规范。'}</p>}
    </>}
    {cardAction && <Modal title={cardAction.type === 'delete' ? '删除规范' : '重命名规范'} onClose={() => { if (!lock.current) { setCardAction(null); setError(null); } }}>
      <form className="wb-form wb-spec-card-form" aria-label="规范卡片设置" onSubmit={saveCardAction} aria-busy={busy}>
        {cardAction.type === 'rename' ? <label>规范名称<input autoFocus aria-label="规范名称" required maxLength={200} value={cardAction.name} disabled={busy} onChange={event => setCardAction(current => ({...current, name: event.target.value}))}/></label> : <p>将「{cardAction.system.name}」从规范列表移除。已有项目仍可使用这份规范。{[...drafts.current.values()].some(value => value.id === cardAction.system.id) && '此规范的未保存草稿也会清除。'}</p>}
        <ErrorBox error={error} onClose={() => setError(null)} context="规范设置"/>
        <footer><Button disabled={busy} onClick={() => { setCardAction(null); setError(null); }}>取消</Button><Button primary type="submit" disabled={busy || cardAction.type === 'rename' && !cardAction.name.trim()}>{busy ? '处理中…' : cardAction.type === 'delete' ? '删除' : '保存'}</Button></footer>
      </form>
    </Modal>}
    {infoOpen && draft && <Modal title="规范信息" className="wb-spec-info-dialog" onClose={() => setInfoOpen(false)}>
      <form className="wb-form wb-spec-info-form" onSubmit={event => {event.preventDefault(); setInfoOpen(false);}}>
        <label>规范名称<input autoFocus placeholder="输入规范名称" aria-label="规范名称" value={draft.name} onChange={event => update({name: event.target.value})} required maxLength={200}/></label>
        <label>描述<textarea aria-label="规范描述" rows={3} value={draft.description} onChange={event => update({description: event.target.value})} maxLength={4000} placeholder="例如，适用于企业后台和数据管理产品"/></label>
        <footer><span className="wb-muted">修改会随规范一同保存</span><Button primary type="submit">完成</Button></footer>
      </form>
    </Modal>}
    {newPath !== null && <Modal title="新建规范文件" onClose={() => setNewPath(null)}><form className="wb-form" onSubmit={addTextFile}><label>相对路径<input autoFocus value={newPath} placeholder="css/custom.css" onChange={event => setNewPath(event.target.value)} required/></label><Button type="submit" primary>创建文件</Button></form></Modal>}
  </section>;
}
