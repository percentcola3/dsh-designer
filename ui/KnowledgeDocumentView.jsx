import React from 'react';
import ResourceView from './ResourceView.jsx';
import {Button} from './common.jsx';
import {isKnowledgeText, loadKnowledgeTextPreview, knowledgePreviewTab, knowledgeLinkedDocument} from './knowledge-panel-state.js';

function KnowledgeDocumentView({api, knowledgeId, document, documents, onSelect, onWrite, locked}, ref) {
  const [state, setState] = React.useState({loading: true}), [revision, setRevision] = React.useState(0);
  const current = React.useRef(state), saving = React.useRef(false), mounted = React.useRef(true);
  current.current = state;
  React.useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const dirty = value => Boolean(value.editing && value.tab?.content !== value.savedContent);
  async function save() {
    if (!dirty(current.current)) return true;
    if (saving.current || locked) return false;
    saving.current = true;
    try {
      const result = await onWrite?.(document, current.current.tab.content);
      if (!result?.document) return false;
      if (mounted.current) setState(value => ({...value, editing: false, savedContent: value.tab.content, tab: {...value.tab, readonly: true, dirty: false, mode: undefined}}));
      return true;
    } finally {saving.current = false;}
  }
  function discard() {
    setState(value => value.tab ? {...value, editing: false, tab: {...value.tab, content: value.savedContent, readonly: true, dirty: false, mode: undefined}} : value);
  }
  React.useImperativeHandle(ref, () => ({isDirty: () => dirty(current.current), save, discard}));
  React.useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setState({loading: true});
    api('knowledge.document.get', {knowledgeId, documentId: document.id})
      .then(value => loadKnowledgeTextPreview(value, document, globalThis.fetch, 512 * 1024, controller.signal))
      .then(value => {if (live) {const tab = knowledgePreviewTab(value, document); setState({tab, savedContent: tab.content, editing: false});}})
      .catch(error => {if (live) setState({error});});
    return () => {live = false; controller.abort();};
  }, [api, knowledgeId, document.id, document.sha256, revision]);
  if (state.loading) return <p className="kb-view-message" role="status">正在读取文件…</p>;
  if (state.error) return <div className="kb-view-message" role="alert"><p>{state.error.message}</p><Button onClick={() => setRevision(value => value + 1)}>重试</Button></div>;
  const resolveAsset = async href => {
    const target = knowledgeLinkedDocument(document, href, documents);
    const value = await api('knowledge.document.get', {knowledgeId, documentId: target.id});
    return value.originalUrl;
  };
  const editable = isKnowledgeText(document) && !state.tab.truncated && (!document.projectionReason || document.projectionReason === 'empty-text');
  return <div className="kb-document-view" onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {event.preventDefault(); event.stopPropagation(); save();}
  }}>
    {editable && onWrite && <div className="kb-editor-actions">
      {state.editing ? <><span className="wb-grow">{dirty(state) ? '有未保存修改' : '编辑文件'}</span><Button disabled={locked} onClick={discard}>取消编辑</Button><Button primary disabled={locked || !dirty(state)} onClick={save}>保存</Button></>
        : <><span className="wb-grow"/><Button disabled={locked} onClick={() => setState(value => ({...value, editing: true, tab: {...value.tab, readonly: false, mode: 'source'}}))}>编辑文件</Button></>}
    </div>}
    {state.tab.truncated && <p className="kb-notice">已显示前 512 KB，可下载完整原件。</p>}
    <ResourceView tab={state.tab} api={api} hideToolbar showOutline={false}
      onUpdate={patch => setState(current => ({...current, tab: {...current.tab, ...patch}}))}
      resolveAsset={resolveAsset} onOpenFile={file => {
        const target = documents.find(item => (item.relativePath || item.name) === file.path);
        if (!target) throw new Error('知识库中没有此文件。');
        onSelect(target);
      }}/>
  </div>;
}
export default React.forwardRef(KnowledgeDocumentView);
