import React from 'react';
import {wheelNavigation,pinchNavigation} from './canvas-navigation.js';

const editable='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const control='button,a[href],input,textarea,select,[contenteditable]:not([contenteditable="false"])';
export default function useCanvasNavigation({root,cameraRef,onCamera,hand=false,onTool,onClear,onFit,onZoom,enabled=true}){
  const latest=React.useRef(null),drag=React.useRef(null),touches=React.useRef(new Map()),inside=React.useRef(false);
  const [space,setSpace]=React.useState(false),[dragging,setDragging]=React.useState(false);
  latest.current={onCamera,hand,onTool,onClear,onFit,onZoom,space};
  const stop=React.useCallback(()=>{const ids=new Set(touches.current.keys());if(drag.current)ids.add(drag.current.pointerId);drag.current=null;touches.current.clear();for(const id of ids)if(root.current?.hasPointerCapture(id))root.current.releasePointerCapture(id);setDragging(false);},[root]);
  const reset=React.useCallback(()=>{setSpace(false);stop();},[stop]);
  React.useEffect(()=>{
    const node=root.current;if(!node||!enabled)return;
    const wheel=event=>{if(event.target.closest(editable))return;event.preventDefault();event.stopPropagation();if(!drag.current)latest.current.onCamera(wheelNavigation(cameraRef.current,event,node.getBoundingClientRect()));};
    const keydown=event=>{
      if(event.isComposing||event.target.closest?.(editable)||event.target.closest?.('[role="dialog"]'))return;
      if(!node.contains(event.target)&&!(inside.current&&event.target===document.body)&&!event.target.closest?.('.wb-canvas-tools'))return;
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      if(event.code==='Space'&&!event.target.closest?.('button,a[href]')){event.preventDefault();setSpace(true);return;}
      const key=event.key.toLowerCase();
      if(key==='h'||key==='v'){event.preventDefault();latest.current.onTool?.(key==='h'?'hand':'select');}
      if(key==='+'||key==='='||key==='-'){event.preventDefault();latest.current.onZoom?.(key==='-'?.8:1.25);}
      if(key==='0'){event.preventDefault();latest.current.onFit?.();}
    };
    const keyup=event=>{if(event.code==='Space'){setSpace(false);stop();}};
    const blur=()=>{setSpace(false);stop();};
    node.addEventListener('wheel',wheel,{passive:false});
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{node.removeEventListener('wheel',wheel);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);drag.current=null;touches.current.clear();};
  },[root,cameraRef,enabled,stop]);
  const start=(event,capture)=>{
    if(!enabled||event.target.closest(editable))return;
    const node=root.current,panTool=hand||space,middle=event.button===1,touch=event.pointerType==='touch';
    if(capture ? !middle&&!panTool&&!touch : event.target!==node)return;
    if(touch&&touches.current.size>=2){event.preventDefault();event.stopPropagation();return;}
    if(!middle&&event.button!==0)return;
    if(event.target.closest(control)&&!event.target.closest('.ec-page-title')&&!middle)return;
    if(drag.current&&!touch)return;
    event.preventDefault();event.stopPropagation();node.focus({preventScroll:true});
    if(touch){const rect=node.getBoundingClientRect();touches.current.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});}
    drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,camera:cameraRef.current,clear:!panTool&&!middle&&!touch};
    setDragging(true);node.setPointerCapture(event.pointerId);
  };
  return {space,dragging,stop,reset,handlers:{
    onPointerEnter:()=>{inside.current=true;},onPointerLeave:()=>{inside.current=false;},
    onPointerDownCapture:event=>start(event,true),onPointerDown:event=>start(event,false),
    onPointerMove:event=>{
      const value=drag.current;if(!value)return;
      if((value.pointerId===event.pointerId||touches.current.has(event.pointerId))&&!root.current.hasPointerCapture(event.pointerId)){stop();return;}
      if(event.pointerType==='touch'&&touches.current.has(event.pointerId)){
        const before=[...touches.current.values()],rect=root.current.getBoundingClientRect();
        touches.current.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});
        if(touches.current.size===2){latest.current.onCamera(pinchNavigation(cameraRef.current,before,[...touches.current.values()]));return;}
      }
      if(value.pointerId!==event.pointerId)return;
      latest.current.onCamera({...value.camera,x:value.camera.x+event.clientX-value.x,y:value.camera.y+event.clientY-value.y});
    },
    onPointerUp:event=>{
      const value=drag.current;if(!value)return;
      if(touches.current.has(event.pointerId)){
        touches.current.delete(event.pointerId);
        const remaining=[...touches.current.entries()][0];
        if(remaining){const rect=root.current.getBoundingClientRect();drag.current={pointerId:remaining[0],x:remaining[1].x+rect.left,y:remaining[1].y+rect.top,camera:cameraRef.current};return;}
      }else if(value.pointerId!==event.pointerId)return;
      stop();if(value.clear&&Math.hypot(event.clientX-value.x,event.clientY-value.y)<4)latest.current.onClear?.();
      if(root.current.hasPointerCapture(event.pointerId))root.current.releasePointerCapture(event.pointerId);
    },onPointerCancel:event=>{if(drag.current?.pointerId===event.pointerId||touches.current.has(event.pointerId))stop();},onLostPointerCapture:event=>{if(drag.current?.pointerId===event.pointerId||touches.current.has(event.pointerId))stop();},
    onAuxClick:event=>{if(event.button===1)event.preventDefault();},
  }};
}
