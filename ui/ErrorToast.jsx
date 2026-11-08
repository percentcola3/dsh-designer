import React from 'react';
import {ToastContext, ToastNotice} from './toast-provider.jsx';
import {toastErrorKey} from './toast-error.js';
import toastStyles from './toast-styles.js';

// Compatibility bridge for components that keep operation errors in local state.
export default function ErrorToast({error,onClose,context}){
 const store=React.useContext(ToastContext),anchor=React.useRef(null),source=React.useRef(Symbol('error-toast'));
 const latest=React.useRef(onClose);latest.current=onClose;
 const [dismissed,setDismissed]=React.useState(null);
 const key=error?toastErrorKey(error):'';
 React.useEffect(()=>{
  if(!store||!error)return;
  return store.reportError(error,{context,target:anchor.current?.closest('.wb'),source:source.current,onClose:failure=>latest.current?.(failure)});
 },[store,error,key,context]);
 const close=()=>{setDismissed(error);latest.current?.(error);};
 return store?<span ref={anchor} hidden aria-hidden="true"/>:error&&dismissed!==error?<><style>{toastStyles}</style><div className="wb-toast-layer"><ToastNotice key={key} entry={{error,context}} onClose={close}/></div></>:null;
}
