import React from 'react';
import {Button,FieldError} from './common.jsx';
import {Icon} from './brand.jsx';
import styles from './website-browser-styles.js';

// Only the remote browser executes the website. The workbench receives viewport images.
export default function WebsiteSession({api,projectId,url,width,height,onCapture,onCancel,onSave}){
  const [frame,setFrame]=React.useState(null),[steps,setSteps]=React.useState([]),[busy,setBusy]=React.useState(true),[error,setError]=React.useState(null);
  const [attempt,retry]=React.useReducer(n=>n+1,0),[text,setText]=React.useState('');
  const current=React.useRef(null),callbacks=React.useRef(null);
  callbacks.current={api,onCapture,onSave};
  const capture=async(session)=>{
    const callback=callbacks.current.onCapture;
    if(!callback)return;
    if(session.steps.length>=36)throw new Error('已录制 36 个状态，请保存本次录制');
    const result=await callback(session.id,session.fingerprint);
    if(current.current!==session||result.unchanged)return;
    session.fingerprint=result.fingerprint;
    session.steps.push({versionId:result.versionId,captureId:result.captureId,trigger:session.trigger});
    session.trigger=undefined;
    setSteps([...session.steps]);
    if(result.preview?.url)setFrame(last=>({...last,screenshot:result.preview.url}));
  };
  React.useEffect(()=>{
    const session={id:null,busy:true,steps:[]};current.current=session;
    const call=(action,args)=>callbacks.current.api(action,{projectId,...args});
    async function open(){
      try{
        if(current.current!==session)return;
        const opened=await call('browser.open',{url,width,height});
        session.id=opened.browserId;
        if(current.current!==session){await call('browser.close',{browserId:session.id});return;}
        setFrame(opened);await capture(session);
      }catch(e){if(current.current===session)setError(e);}
      finally{if(current.current===session){setBusy(false);session.busy=false;}}
    }
    setFrame(null);setSteps([]);setBusy(true);setError(null);queueMicrotask(open);
    return ()=>{current.current=null;if(session.id)call('browser.close',{browserId:session.id}).catch(()=>{});};
  },[projectId,url,width,height,attempt]);
  async function run(action,{checkpoint=false,finish=false}={}){
    const session=current.current;
    if(!session?.id||session.busy)return;
    session.busy=true;setBusy(true);setError(null);
    try{
      if(action){
        const next=await api('browser.action',{projectId,browserId:session.id,...action});
        if(current.current!==session)return;
        setFrame(next);
        if(action.type==='click'||action.type==='back')session.trigger=next.clickSelector||undefined;
      }
      if(checkpoint)await capture(session);
      if(finish&&current.current===session)await callbacks.current.onSave([...session.steps]);
    }catch(e){if(current.current===session)setError(e);}
    finally{if(current.current===session){session.busy=false;setBusy(false);}}
  }
  const click=event=>{
    event.currentTarget.focus();
    const bounds=event.currentTarget.getBoundingClientRect();
    const x=Math.min(width-1,Math.max(0,Math.floor((event.clientX-bounds.left)*width/bounds.width)));
    const y=Math.min(height-1,Math.max(0,Math.floor((event.clientY-bounds.top)*height/bounds.height)));
    run({type:'click',x,y,recordTarget:true},{checkpoint:!!onCapture});
  };
  return <section className="wb-website-browser" aria-label="交互录制">
    <style>{styles}</style><div className="wb-website-address">
      <Button disabled={busy||!frame} title="后退" aria-label="在线网页后退" onClick={()=>run({type:'back'},{checkpoint:!!onCapture})}><Icon name="arrow-left" size={14}/></Button>
      <Button disabled={busy||!frame} title="更新当前画面" aria-label="更新当前画面" onClick={()=>run({type:'observe'})}><Icon name="refresh" size={14}/></Button>
      <span className="wb-grow wb-ellipsis" title={frame?.url||url}>{'已录 '+steps.length+' 个状态'}</span>
      {onCapture&&<><Button disabled={busy||!frame||steps.length>=36} onClick={()=>run({type:'observe'},{checkpoint:true})}>记录当前状态</Button>
        <Button disabled={busy&&!!steps.length} onClick={onCancel}>取消</Button>
        <Button primary disabled={busy||!steps.length} onClick={()=>run(null,{checkpoint:steps.length<36,finish:true})}>结束并复刻</Button></>}
      {busy&&<div className="wb-website-progress" role="progressbar" aria-label="正在读取网页"/>}
    </div>
    <FieldError error={error}/>{error&&!frame&&<Button onClick={retry}>重新连接</Button>}
    {frame&&<><div className="wb-session-stage">
      <img src={frame.screenshot} width={width} height={height} tabIndex={0} draggable={false} alt="正在录制的网页" onClick={click}
        onWheel={e=>run({type:'scroll',deltaX:Math.round(e.deltaX),deltaY:Math.round(e.deltaY)})}
        onKeyDown={e=>{
          if(!['Enter','Escape','Backspace','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Tab',' '].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey)return;
          if(e.key==='Tab')return;
          e.preventDefault();run({type:'key',key:e.key===' '?'Space':e.key},{checkpoint:!!onCapture&&e.key==='Enter'});
        }}/>
    </div><form className="wb-website-address" onSubmit={e=>{e.preventDefault();if(!busy&&text){run({type:'type',text});setText('');}}}>
      <input aria-label="向网页输入文字" placeholder="点选网页输入框后，在这里输入文字" value={text} onChange={e=>setText(e.target.value)}/>
      <Button type="submit" disabled={busy||!text}>输入</Button>
    </form></>}
  </section>;
}
