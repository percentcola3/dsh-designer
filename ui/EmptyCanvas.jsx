import React from 'react';
import {Button} from './common.jsx';
import {zoomAround} from '../editor/geometry.js';
import {cameraGrid} from '../editor/canvas-navigation.js';
import useCanvasNavigation from '../editor/useCanvasNavigation.js';

export default function EmptyCanvas({camera:initialCamera,tool,onTool,onCamera,onController,loading=false,error,onRetry}){
  const root=React.useRef(null),[camera,setCamera]=React.useState(initialCamera||{x:0,y:0,zoom:.5}),cameraRef=React.useRef(camera),callbacks=React.useRef(null);
  callbacks.current={onCamera,onController};
  const change=React.useCallback(value=>{cameraRef.current=value;setCamera(value);callbacks.current.onCamera?.(value);},[]);
  const zoom=React.useCallback(factor=>{const rect=root.current?.getBoundingClientRect();if(rect)change(zoomAround(cameraRef.current,factor,{x:rect.width/2,y:rect.height/2}));},[change]);
  const fit=React.useCallback(()=>change({x:0,y:0,zoom:.5}),[change]);
  const navigation=useCanvasNavigation({root,cameraRef,onCamera:change,hand:tool==='hand',onTool,onFit:fit,onZoom:zoom});
  React.useEffect(()=>{const register=callbacks.current.onController;register?.({zoomIn:()=>zoom(1.25),zoomOut:()=>zoom(.8),resetZoom:()=>zoom(1/cameraRef.current.zoom),fit});return()=>register?.(null);},[zoom,fit]);
  return <div ref={root} tabIndex={0} aria-label="设计画布" className={'wb-empty-stage '+(tool==='hand'||navigation.space?'wb-canvas-hand ':'')+(navigation.dragging?'wb-canvas-panning':'')} style={cameraGrid(camera)} {...navigation.handlers}>
    {(loading||error)&&<div className="wb-canvas-empty" role="status"><span>{loading?'正在加载设计稿…':'项目未能加载，请重新加载。'}</span>{error&&<Button onClick={onRetry}>重新加载项目</Button>}</div>}
  </div>;
}
