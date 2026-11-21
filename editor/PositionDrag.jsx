import React from 'react';
import Moveable from 'moveable';

import {translated,snappedMovement} from './position-drag.js';

export default function PositionDrag(props){
  const target=React.useRef(null),instance=React.useRef(null),latest=React.useRef(props);
  latest.current=props;
  const {object,zoom,request,model,page}=props;
  const guides=React.useRef({}),vertical=React.useRef(null),horizontal=React.useRef(null);
  React.useLayoutEffect(()=>{
    const proxy=target.current,layer=proxy.parentElement;
    const mover=new Moveable(layer,{target:proxy,draggable:true,origin:false,
      hideDefaultLines:true,renderDirections:[]});
    let basis,alive=true,delta=[0,0],requestFrame=0;
    instance.current=mover;
    mover.on('dragStart',event=>{
      const {object,model,page,scope,projectRevision}=latest.current;
      const point=event.inputEvent,box=proxy.getBoundingClientRect();
      delta=[0,0];
      basis={clientX:point.clientX,clientY:point.clientY,bounds:object.bounds,scaleX:box.width/object.bounds.width,scaleY:box.height/object.bounds.height,id:object.id,referenceId:object.referenceId,selector:object.runtimeSelector,translate:object.styles.translate,version:model.version,revision:model.artboardRevision??page.revision,scope,projectRevision};
      event.set([0,0]);
    }).on('drag',event=>{
      // Resolve the final gesture in iframe CSS pixels. The host and page can
      // each have a different transform origin and viewport scale.
      const pointer=event.inputEvent;
      const movement=snappedMovement(basis.bounds,[(pointer.clientX-basis.clientX)/basis.scaleX,(pointer.clientY-basis.clientY)/basis.scaleY],guides.current,basis.scaleX,basis.scaleY);
      delta=movement.delta;
      for(const [i,node] of [vertical.current,horizontal.current].entries()){
        node.hidden=movement.lines[i]===null;
        if(!node.hidden)node.style[i?'top':'left']=movement.lines[i]+'px';
      }
      proxy.style.transform='translate('+delta[0]+'px,'+delta[1]+'px)';
      if(!requestFrame)requestFrame=requestAnimationFrame(()=>{
        requestFrame=0;request('previewPosition',{nodeId:basis.id,referenceId:basis.referenceId,dx:delta[0],dy:delta[1]}).catch(()=>{});
      });
    }).on('dragEnd',async event=>{
      if(vertical.current)vertical.current.hidden=true;
      if(horizontal.current)horizontal.current.hidden=true;
      cancelAnimationFrame(requestFrame);requestFrame=0;
      await request('previewPosition',{}).catch(()=>{});
      try{
        if(!alive||!basis||!event.isDrag||!event.lastEvent||event.inputEvent?.type?.includes('cancel'))return;
        if(!delta.some(Boolean))return;
        const styles={translate:translated(basis.translate,delta)};
        await latest.current.onChange({pageId:page.id,expectedRevision:basis.projectRevision,expectedFsVersion:basis.version,expectedArtboardRevision:basis.revision,definitionScope:basis.scope,...(basis.referenceId?{runtimeStyle:{referenceId:basis.referenceId,selector:basis.selector,styles}}:{operations:[{type:'style',nodeIds:[basis.id],styles,scope:basis.scope}]}),summary:'调整元素位置'});
      }catch(error){latest.current.onDiagnostic?.({code:error.code||'ELEMENT_MOVE',message:error.message,pageId:page.id});}
      finally{if(alive){proxy.style.transform='';mover.updateRect();latest.current.onMeasure();}}
    });
    return ()=>{alive=false;cancelAnimationFrame(requestFrame);request('previewPosition',{}).catch(()=>{});instance.current=null;mover.destroy();};
  },[object.id,page.id,zoom,request]);
  const {x,y,width,height}=object.bounds;
  React.useLayoutEffect(()=>{
    const mover=instance.current;
    if(!mover||mover.isDragging())return;
    let active=true;
    mover.updateRect();
    request('snapGuides',{nodeId:object.id,referenceId:object.referenceId}).then(({vertical,horizontal})=>{
      if(active)guides.current={vertical,horizontal};
    }).catch(()=>{});
    return ()=>{active=false;};
  },[object.id,x,y,width,height,zoom,request,model.version,props.layoutEpoch]);
  return <><i hidden ref={vertical} className="ec-snap-line ec-snap-x"/><i hidden ref={horizontal} className="ec-snap-line ec-snap-y"/><div ref={target} className="ec-move-proxy" title="拖动位置，靠近边缘或中心线时吸附" style={{left:x,top:y,width,height}}/></>;
}
