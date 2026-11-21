import {zoomAround} from './geometry.js';

// Discrete mouse wheels zoom; high-resolution trackpad input pans. Pinch
// gestures arrive as ctrl+wheel in Chromium and always zoom at the pointer.
export function wheelNavigation(camera,event,rect,panWheel=false){
  const unit=event.deltaMode===1?16:event.deltaMode===2?rect.height:1;
  const dx=event.deltaX*unit,dy=event.deltaY*unit;
  const wheel=event.deltaMode!==0||(event.deltaX===0&&Number.isInteger(event.deltaY)&&Math.abs(event.deltaY)>=50);
  if(event.ctrlKey||event.metaKey||(!panWheel&&!event.shiftKey&&wheel))return zoomAround(camera,Math.exp(-Math.max(-240,Math.min(240,dy))*.002),{x:event.clientX-rect.left,y:event.clientY-rect.top});
  return {...camera,x:camera.x-(event.shiftKey&&!dx?dy:dx),y:camera.y-(event.shiftKey&&!dx?0:dy)};
}

export function pinchNavigation(camera,start,end){
  const distance=points=>Math.max(1,Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y));
  const center=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
  const a=center(start),b=center(end),next=zoomAround(camera,distance(end)/distance(start),a);
  return {...next,x:next.x+b.x-a.x,y:next.y+b.y-a.y};
}

// Keep the grid registered to world coordinates, including when it is empty.
export function cameraGrid(camera,spacing=48){
  const size=spacing*camera.zoom;
  return {backgroundPosition:`${camera.x}px ${camera.y}px`,backgroundSize:`${size}px ${size}px`};
}
