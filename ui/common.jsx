import React from 'react';
import {PlantLogo} from './brand.jsx';
import ErrorToast from './ErrorToast.jsx';
export function Button({children, primary, className = '', ...props}) { return <button type="button" className={`wb-button ${primary ? 'wb-primary' : ''} ${className}`} {...props}>{children}</button>; }
export function ErrorBox({error, onClose, context, field = false}) { return field ? <FieldError error={error} context={context}/> : <ErrorToast error={error} onClose={onClose} context={context}/>; }
export function FieldError({error, context, id}) { return error ? <p id={id} className="wb-field-error" role="alert" style={{color:'var(--wb-danger)',margin:'4px 0',fontSize:12}}>{context && <strong>{context}：</strong>}{error.message || String(error)}</p> : null; }
export function Modal({title, children, onClose, wide = false, className = ''}) {
  const ref = React.useRef(null), titleId = React.useId();
  React.useEffect(() => { const previous = document.activeElement, node = ref.current; (node.querySelector('input,textarea,select,button') || node).focus(); return () => previous?.isConnected && previous.focus(); }, []);
  return <div className="wb-modal-wrap" onPointerDown={e => {if (e.target === e.currentTarget) onClose();}}><section ref={ref} tabIndex={-1} className={`wb-modal ${wide ? 'wb-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={e => {
    if (e.key === 'Escape') {e.stopPropagation(); onClose();}
    if (e.key === 'Tab') { const els = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]; const i = els.indexOf(document.activeElement); if (e.shiftKey && i <= 0) {e.preventDefault(); els.at(-1)?.focus();} else if (!e.shiftKey && (i === els.length - 1 || i < 0)) {e.preventDefault(); els[0]?.focus();} }
  }}><header className="wb-row"><strong id={titleId} className="wb-grow">{title}</strong><Button className="wb-ghost wb-icon-button" aria-label="关闭对话框" onClick={onClose}>×</Button></header><div className="wb-modal-body">{children}</div></section></div>;
}
export function Empty({title, children}) { return <div className="wb-empty"><div className="wb-empty-symbol"><PlantLogo size={44}/></div><h2>{title}</h2>{children}</div>; }
export function flattenFiles(files, parent = '') {
  return (files || []).flatMap(file => { const path = file.path || [parent, file.name].filter(Boolean).join('/'); return [{...file, path, id: file.id || path}, ...flattenFiles(file.children, path)]; });
}
export function errorValue(message, code = 'INVALID_INPUT', details) { return Object.assign(new Error(message), {code, details}); }
export function downloadValue(value, name = 'download') {
  const url = value?.downloadUrl || value?.url;
  if (url) { const a = document.createElement('a'); a.href = url; a.download = value.name || name; a.rel = 'noopener'; a.click(); return; }
  if (value?.content !== undefined || value?.html !== undefined) { const objectURL = URL.createObjectURL(new Blob([value.content ?? value.html], {type: value.mimeType || 'application/octet-stream'})); const a = document.createElement('a'); a.href = objectURL; a.download = value.name || name; a.click(); setTimeout(() => URL.revokeObjectURL(objectURL), 1000); return; }
  throw errorValue('服务没有返回可下载的文件地址或内容', 'MISSING_DOWNLOAD');
}
