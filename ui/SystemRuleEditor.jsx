import React from 'react';
import ResourceView, {CodeEditor} from './ResourceView.jsx';
import {Button, ErrorBox} from './common.jsx';
import {systemFilePath} from '../system-directory.js';
import {inlineSystemResource, readSystemResource, replaceSystemResource} from './system-resource.js';

export default function SystemRuleEditor({draft, api, busy, onChange}) {
  const [resource, setResource] = React.useState(null), [editing, setEditing] = React.useState(false), [error, setError] = React.useState(null);
  const file = draft.files.find(file => systemFilePath(file) === 'rule.md');
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!file) throw new Error('当前规范缺少 rule.md。');
        const value = file.content !== undefined || file.bytesBase64 !== undefined ? inlineSystemResource(file) : await readSystemResource(api, {systemId: draft.id, version: draft.version, resourceId: file.id});
        if (alive) {setResource({...value, path: 'rule.md', name: 'rule.md', mimeType: 'text/markdown', readonly: true}); setError(null);}
      } catch (failure) {if (alive) setError(failure);}
    })();
    return () => {alive = false;};
  }, [file, api, draft.id, draft.version]);
  return <section className="wb-theme-rule" aria-label="使用规则">
    <header><span>AI 使用指导</span><div role="group" aria-label="规则查看方式"><Button aria-pressed={!editing} onClick={() => setEditing(false)}>预览</Button><Button disabled={busy || !resource} aria-pressed={editing} onClick={() => setEditing(true)}>编辑规则</Button></div></header>
    <ErrorBox error={error}/>
    <div className="wb-theme-rule-content">{resource ? editing ? <CodeEditor path="rule.md" value={resource.content || resource.text || ''} readonly={busy} onChange={content => {
      const replacement = replaceSystemResource(file, {content, mimeType: 'text/markdown'});
      setResource(current => ({...current, content}));
      onChange(draft.files.map(item => systemFilePath(item) === 'rule.md' ? replacement : item));
    }}/> : <ResourceView hideToolbar showOutline={false} tab={resource} api={api}/> : !error && <p className="wb-muted">正在读取设计规则…</p>}</div>
  </section>;
}
