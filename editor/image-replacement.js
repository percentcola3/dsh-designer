import {parseFragment,serializeOuter} from 'parse5';
import {nodeHTML} from './property-model.js';

export function imageTarget(object,model){
  if(!object||object.referenceOnly||object.locked)return null;
  let node=model?.nodes?.[object.nodeId||object.id];
  if(!node)return ['img','svg','image'].includes(object.tag)?object:null;
  while(node){
    if(['img','svg','image'].includes(node.tag)){
      if(node.locked)return null;
      return node.id===(object.nodeId||object.id)?{...node,bounds:object.bounds}:node;
    }
    node=model.nodes[node.parentId];
  }
  return null;
}

function viewBoxOf(node){
  const values=String(node.attributes?.viewBox||'').trim().split(/[\s,]+/).map(Number);
  return values.length===4&&values.every(Number.isFinite)&&values[2]>0&&values[3]>0?values:null;
}

export function imageFrame(node){
  const box=viewBoxOf(node);
  const width=node.bounds?.width||Number(node.attributes?.width)||box?.[2];
  const height=node.bounds?.height||Number(node.attributes?.height)||box?.[3];
  return width>0&&height>0?{width,height}:null;
}

export function imageAlignment(fit,position){
  const x=['Min','Mid','Max'][position.x/50],y=['Min','Mid','Max'][position.y/50];
  return `x${x}Y${y} ${fit==='cover'?'slice':'meet'}`;
}

// Replace only the selected image. A picture's sources take precedence over img.src.
export function imageOperations(model,node,{url,mime,fit,position,frame}){
  const nodeIds=[node.id],attr=(ids,attributes)=>({type:'attributes',nodeIds:ids,attributes,scope:'instance'});
  if(node.tag==='img'){
    const attributes={src:url,srcset:null,sizes:null};
    if(frame){
      if(!node.attributes?.width)attributes.width=String(Math.max(1,Math.round(frame.width)));
      if(!node.attributes?.height)attributes.height=String(Math.max(1,Math.round(frame.height)));
    }
    const ops=[attr(nodeIds,attributes)];
    const parent=model.nodes[node.parentId];
    if(parent?.tag==='picture'){
      const sources=parent.childIds.filter(id=>model.nodes[id]?.tag==='source');
      if(sources.length)ops.push(attr(sources,{srcset:url,type:mime,sizes:null}));
    }
    const styles={'object-fit':fit,'object-position':`${position.x}% ${position.y}%`};
    if(frame)styles['aspect-ratio']=`${frame.width} / ${frame.height}`;
    return [...ops,{type:'style',nodeIds,styles,scope:'instance'}];
  }
  const preserveAspectRatio=imageAlignment(fit,position);
  if(node.tag==='image')return [attr(nodeIds,{href:url,preserveAspectRatio})];
  const root=parseFragment(nodeHTML(model,node.id)).childNodes.find(n=>n.tagName==='svg');
  if(!root)throw new Error('所选 SVG 已变化，请重新选择。');
  const [x,y,width,height]=viewBoxOf(node)||[0,0,frame?.width||100,frame?.height||100];
  if(!viewBoxOf(node))root.attrs.push({name:'viewBox',value:`0 0 ${width} ${height}`});
  const image={nodeName:'image',tagName:'image',namespaceURI:root.namespaceURI,parentNode:root,childNodes:[],
    attrs:Object.entries({href:url,x,y,width,height,preserveAspectRatio}).map(([name,value])=>({name,value:String(value)}))};
  root.childNodes=root.childNodes.filter(n=>['title','desc'].includes(n.tagName)).concat(image);
  return [{type:'replace',nodeIds,html:serializeOuter(root),scope:'instance'}];
}
