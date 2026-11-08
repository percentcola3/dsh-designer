import React from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './brand.jsx';
import {createToastStore, toastErrorMessage, toastErrorDetails} from './toast-error.js';
import toastStyles from './toast-styles.js';

export const ToastContext = React.createContext(null);

export function ToastNotice({entry, onClose}) {
  const [hovered, setHovered] = React.useState(false), [focused, setFocused] = React.useState(false), [expanded, setExpanded] = React.useState(false);
  const remaining = React.useRef(9000), closeRef = React.useRef(onClose); closeRef.current = onClose;
  React.useEffect(() => {
    if (hovered || focused || expanded) return;
    const started = Date.now(), timer = setTimeout(() => closeRef.current(), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [hovered, focused, expanded]);
  return <section className="wb-toast" role="alert" aria-atomic="true" aria-label={entry.context || '操作未完成'} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <span className="wb-toast-icon" aria-hidden="true">!</span><div className="wb-toast-content"><strong>{entry.context ? `${entry.context}未完成` : '操作未完成'}</strong><p>{toastErrorMessage(entry.error)}</p><details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>查看详情</summary><pre>{toastErrorDetails(entry.error)}</pre></details></div><button type="button" className="wb-toast-close" aria-label="关闭错误提示" onClick={onClose}><Icon name="x" size={15}/></button>
  </section>;
}

function ToastViewport({store}) {
  const entries = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const target = entries.find(entry => entry.target?.isConnected)?.target;
  if (!entries.length) return null;
  const content = <><style>{toastStyles}</style><div className="wb-toast-layer">{entries.map(entry => <ToastNotice key={entry.id} entry={entry} onClose={() => store.dismissError(entry.id)}/>)}</div></>;
  // Keep theme variables inherited from the workbench even when the provider wraps it.
  return target ? createPortal(content, target) : content;
}

export function ToastProvider({children}) {
  const [store] = React.useState(createToastStore);
  return <ToastContext.Provider value={store}>{children}<ToastViewport store={store}/></ToastContext.Provider>;
}

export function useToast() {
  const store = React.useContext(ToastContext);
  if (!store) throw new Error('useToast must be used inside ToastProvider');
  return store;
}
