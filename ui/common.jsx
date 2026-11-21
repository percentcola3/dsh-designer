import React from 'react';
import {Icon, PlantLogo} from './brand.jsx';
import ErrorToast from './ErrorToast.jsx';
export function Button({children, primary, className = '', ...props}) { return <button type="button" className={`wb-button ${primary ? 'wb-primary' : ''} ${className}`} {...props}>{children}</button>; }
export function ErrorBox({error, onClose, context, field = false}) { return field ? <FieldError error={error} context={context}/> : <ErrorToast error={error} onClose={onClose} context={context}/>; }
export function FieldError({error, context, id}) { return error ? <p id={id} className="wb-field-error" role="alert" style={{color:'var(--wb-danger)',margin:'4px 0',fontSize:12}}>{context && <strong>{context}：</strong>}{error.message || String(error)}</p> : null; }
export function Modal({title, children, onClose, wide = false, className = ''}) {
  const ref = React.useRef(null), titleId = React.useId();
  React.useEffect(() => { const previous = document.activeElement, node = ref.current; (node.querySelector('[data-modal-initial-focus]') || node.querySelector('input,textarea,select,button') || node).focus(); return () => previous?.isConnected && previous.focus(); }, []);
  return <div className="wb-modal-wrap" onPointerDown={e => {if (e.target === e.currentTarget) onClose();}}><section ref={ref} tabIndex={-1} className={`wb-modal ${wide ? 'wb-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={e => {
    if (e.key === 'Escape') {e.stopPropagation(); onClose();}
    if (e.key === 'Tab') { const els = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]; const i = els.indexOf(document.activeElement); if (e.shiftKey && i <= 0) {e.preventDefault(); els.at(-1)?.focus();} else if (!e.shiftKey && (i === els.length - 1 || i < 0)) {e.preventDefault(); els[0]?.focus();} }
  }}><header className="wb-row"><strong id={titleId} className="wb-grow">{title}</strong><Button className="wb-ghost wb-icon-button" aria-label="关闭对话框" onClick={onClose}><Icon name="x" size={14}/></Button></header><div className="wb-modal-body">{children}</div></section></div>;
}
export function Empty({title, children}) { return <div className="wb-empty"><div className="wb-empty-symbol"><PlantLogo size={44}/></div><h2>{title}</h2>{children}</div>; }
export function flattenFiles(files, parent = '') {
  return (files || []).flatMap(file => { const path = file.path || [parent, file.name].filter(Boolean).join('/'); return [{...file, path, id: file.id || path}, ...flattenFiles(file.children, path)]; });
}
export function errorValue(message, code = 'INVALID_INPUT', details) { return Object.assign(new Error(message), {code, details}); }
export const FileActionsContext=React.createContext(null);
export function useDownload(){
  const fileActions=React.useContext(FileActionsContext);
  return React.useCallback((value,name)=>downloadValue(value,name,fileActions),[fileActions]);
}
export async function downloadValue(value, name = 'download', fileActions) {
  const url=value?.downloadUrl||value?.url;
  let blob;
  if(url){
    const target=new URL(url,location.href);
    const nativeResource=location.protocol==='dsh-app:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&target.pathname.startsWith('/api/designer/');
    const response=await fetch(nativeResource?target.pathname+target.search:target.href,{credentials:'same-origin'});
    if(!response.ok)throw errorValue(`文件下载失败（HTTP ${response.status}），请重试。`,'DOWNLOAD_FAILED');
    blob=await response.blob();
  }else if(value?.content!==undefined||value?.html!==undefined){
    blob=new Blob([value.content??value.html],{type:value.mimeType||'application/octet-stream'});
  }else throw errorValue('服务没有返回可下载的文件地址或内容','MISSING_DOWNLOAD');
  if(fileActions)return fileActions.save({url:'',name:value.name||name,mediaType:blob.type,read:async()=>blob},'download');
  const objectURL=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectURL;link.download=value.name||name;link.rel='noopener';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
}
