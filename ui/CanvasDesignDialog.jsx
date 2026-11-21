import React from 'react';
import {Button,ErrorBox,Modal} from './common.jsx';
import {createCanvasDesign} from './canvas-workspace.js';

export default function CanvasDesignDialog({projectId,api,onCreated,onClose}) {
  const [name,setName]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(null);
  const checkpoint=React.useRef({}),lock=React.useRef(false);
  const submit=async event=>{
    event.preventDefault();if(!name.trim()||lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    try{const made=await createCanvasDesign(api,{projectId,name},checkpoint.current);await onCreated(made);onClose();}
    catch(failure){setError(failure);}finally{lock.current=false;setBusy(false);}
  };
  return <Modal title="新建设计稿" onClose={()=>!lock.current&&onClose()} className="wb-new-canvas-design"><ErrorBox error={error} onClose={()=>setError(null)} context="创建设计稿"/><form className="wb-form" onSubmit={submit}>
    <label>名称<input aria-label="设计稿名称" placeholder="例如：官网 Web、移动端" value={name} maxLength={160} required disabled={busy||!!checkpoint.current.designId} onChange={e=>setName(e.target.value)}/></label>
    <footer><Button disabled={busy} onClick={onClose}>取消</Button><Button primary type="submit" disabled={busy||!name.trim()}>{busy?'创建中…':checkpoint.current.designId?'继续创建':'创建'}</Button></footer>
  </form></Modal>;
}
