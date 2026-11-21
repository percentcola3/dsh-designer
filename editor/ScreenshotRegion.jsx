import React from 'react';
import {pagePoint,rectangle} from './geometry.js';

export default function ScreenshotRegion({viewport,onCancel,onCopy}){
  const layer=React.useRef(null),drag=React.useRef(null);
  const [selection,setSelection]=React.useState(null);
  React.useLayoutEffect(()=>{layer.current.focus({preventScroll:true});},[]);
  React.useEffect(()=>{
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onCancel();}};
    window.addEventListener('keydown',escape,true);
    window.addEventListener('blur',onCancel);
    return ()=>{window.removeEventListener('keydown',escape,true);window.removeEventListener('blur',onCancel);};
  },[onCancel]);
  const point=event=>pagePoint(event,layer.current.getBoundingClientRect(),viewport);
  const down=event=>{
    if(event.button!==0||drag.current)return;
    event.preventDefault();
    drag.current={pointer:event.pointerId,start:point(event)};
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection(null);
  };
  const move=event=>{
    if(drag.current?.pointer===event.pointerId)setSelection(rectangle(drag.current.start,point(event),viewport));
  };
  const up=event=>{
    if(drag.current?.pointer!==event.pointerId)return;
    const region=rectangle(drag.current.start,point(event),viewport);
    drag.current=null;
    setSelection(null);
    if(region.width>=1&&region.height>=1)onCopy(region);
  };
  const interrupted=event=>{if(drag.current?.pointer===event.pointerId)onCancel();};
  return <div ref={layer} className="ec-screenshot-region" role="group" aria-label="框选截图区域" tabIndex={-1}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onLostPointerCapture={interrupted} onPointerCancel={interrupted}>
    {selection&&<div className="ec-screenshot-box" style={{left:selection.x,top:selection.y,width:selection.width,height:selection.height}}/>}
    <span className="ec-screenshot-hint">拖动框选，松开复制 · Esc 取消</span>
  </div>;
}
