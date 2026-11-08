import React from 'react';
export default function PanelResize({label,value,min,max,onChange,edge='right'}){
  const cleanup=React.useRef(()=>{}),latest=React.useRef(onChange);latest.current=onChange;
  React.useEffect(()=>()=>cleanup.current(),[]);
  const clamp=next=>Math.max(min,Math.min(max,next)),direction=edge==='left'?-1:1;
  return <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0} title="拖动调整宽度；方向键微调；Home / End 最小或最大" style={{position:'absolute',[edge]:0,top:0,bottom:0,width:6,zIndex:8,cursor:'col-resize',touchAction:'none'}} onKeyDown={event=>{
    let next;if(event.key==='ArrowLeft')next=value-10*direction;if(event.key==='ArrowRight')next=value+10*direction;if(event.key==='Home')next=min;if(event.key==='End')next=max;
    if(next!==undefined){event.preventDefault();latest.current(clamp(next));}
  }} onPointerDown={event=>{
    if(event.button!==0)return;event.preventDefault();cleanup.current();const node=event.currentTarget,start=event.clientX,pointer=event.pointerId;
    node.focus();node.setPointerCapture(pointer);
    const move=e=>{if(e.pointerId===pointer)latest.current(clamp(value+(e.clientX-start)*direction));};
    const finish=e=>{if(e&&e.pointerId!==pointer)return;cleanup.current();};
    cleanup.current=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',finish);node.removeEventListener('pointercancel',finish);if(node.hasPointerCapture(pointer))node.releasePointerCapture(pointer);cleanup.current=()=>{};};
    node.addEventListener('pointermove',move);node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);
  }}/>;
}
