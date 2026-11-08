import React from 'react';
import {Button} from './common.jsx';
import {sourceOutlineTree,sourceRegionNodeKey} from './source-selection.js';
const thumbnailURL=value=>{
  const url=typeof value==='string'?value:value?.url||value?.previewUrl;
  if(typeof url!=='string'||url.length>2_000_000)return null;
  if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(url))return url;
  try{const parsed=new URL(url);if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)return parsed.href;}catch{}
  return null;
};
function Thumbnail({value}){
  const url=thumbnailURL(value),[failed,setFailed]=React.useState(false);
  React.useEffect(()=>setFailed(false),[url]);
  return url&&!failed?<img src={url} alt="" width={48} height={36} loading="lazy" referrerPolicy="no-referrer" style={{objectFit:'contain'}} onError={()=>setFailed(true)}/>:value?<span className="wb-muted" aria-label="缩略图不可用" style={{fontSize:11}}>无预览</span>:null;
}
function OutlineGroup({group,website,selected,onSelect,disabled,onLoadMore,pageName,initialOpen}){
  const [open,setOpen]=React.useState(initialOpen),[expanded,setExpanded]=React.useState(new Set()),[query,setQuery]=React.useState('');
  const tree=React.useMemo(()=>sourceOutlineTree(group.nodes||[]),[group.nodes]);
  const needle=query.trim().toLocaleLowerCase(),shown=new Set();
  if(needle)for(const node of group.nodes||[])if((node.name||node.tag||node.id).toLocaleLowerCase().includes(needle)){shown.add(node.id);let parent=tree.parents.get(node.id);while(parent){shown.add(parent);parent=tree.parents.get(parent);}}
  const row=(node,depth=0)=>{
    if(needle&&!shown.has(node.id))return null;
    const children=tree.children.get(node.id)||[],isOpen=needle||expanded.has(node.id),key=website?sourceRegionNodeKey(group.pageId,node.id):node.id;
    return <div key={node.id} role="treeitem" aria-expanded={children.length?!!isOpen:undefined} aria-selected={selected.includes(key)}><div className="wb-row" style={{paddingLeft:Math.min(depth,16)*12,minHeight:32}}>{children.length?<button type="button" aria-label={(isOpen?'收起 ':'展开 ')+(node.name||node.id)} aria-expanded={!!isOpen} onClick={()=>setExpanded(old=>{const next=new Set(old);next.has(node.id)?next.delete(node.id):next.add(node.id);return next;})}>{isOpen?'▾':'▸'}</button>:<span style={{width:18}}/>}<label className="wb-row wb-grow"><input type="checkbox" disabled={disabled} checked={selected.includes(key)} onChange={event=>onSelect(key,event.target.checked)}/><Thumbnail value={node.thumbnail}/><span>{node.name||node.tag||node.id}</span></label></div>{isOpen&&children.length>0&&<div role="group">{children.map(child=>row(child,depth+1))}</div>}</div>;
  };
  return <section style={{border:'1px solid var(--wb-border)',borderRadius:6,padding:8}}><button type="button" className="wb-row" style={{width:'100%',textAlign:'left'}} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'▾':'▸'} {pageName||group.name||group.pageId||'官方文件提纲'}{group.stateId?' / '+group.stateId:''}{group.viewportId?' / '+group.viewportId:''} · 已载入 {group.nodes?.length||0} / {group.nodeTotal??group.nodes?.length??0}</button>{open&&<div className="wb-stack"><input aria-label="搜索当前已加载的来源节点" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索已加载节点…"/><div role="tree" aria-label="来源页面、画板与节点">{tree.roots.map(node=>row(node))}</div>{needle&&!shown.size&&<p className="wb-muted">已加载节点中没有匹配项，可继续读取后续节点。</p>}{group.nextNodeOffset!==null&&group.nextNodeOffset!==undefined&&<Button disabled={disabled} onClick={()=>onLoadMore(group)}>读取后续节点</Button>}</div>}</section>;
}
export default function SourceOutline({groups,website,selected,onSelect,disabled,onLoadMore,pages=[],captureId}){
  if(!groups.length)return <p className="wb-muted">读取来源快照或官方文件提纲后，在此选择页面、画板或节点。</p>;
  return <div className="wb-stack">{groups.map((group,index)=><OutlineGroup key={group.captureId} group={group} website={website} selected={selected} onSelect={onSelect} disabled={disabled} onLoadMore={onLoadMore} pageName={pages.find(page=>page.id===group.pageId)?.name} initialOpen={group.captureId===captureId||index===0}/>)}</div>;
}
