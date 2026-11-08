const failure=message=>Object.assign(new Error(message),{code:'INVALID_SOURCE_SELECTION'});
export const sourceRegionNodeKey=(pageId,nodeId)=>JSON.stringify([pageId,nodeId]);
const regionId='workbench-selected-nodes';
export function selectedWebsiteNodes(record){
  return (record?.pages||[]).flatMap(page=>(page.regions||[]).filter(region=>region.id===regionId).flatMap(region=>(region.nodeIds||[]).map(id=>sourceRegionNodeKey(page.id,id))));
}
export function websiteSelectionArgs(record,selectedPages,selectedNodes){
  const selected=new Set(selectedPages),nodes=new Set(selectedNodes);
  const pageIds=(record.pages||[]).filter(page=>selected.has(page.sourceNodeId||page.id)).map(page=>page.id);
  if(!pageIds.length)throw failure('请至少选择一个网站页面。');
  const pages=(record.pages||[]).map(page=>{
    const ids=[];
    for(const key of nodes){let pair;try{pair=JSON.parse(key);}catch{throw failure('网站区域选择已失效，请重新选择。');}if(Array.isArray(pair)&&pair[0]===page.id&&typeof pair[1]==='string')ids.push(pair[1]);}
    const existing=(page.regions||[]).filter(region=>region.id!==regionId);
    const regions=ids.length?[...existing,{id:regionId,name:'所选来源对象',nodeIds:[...new Set(ids)]}]:existing;
    const changed=ids.length||page.regions?.some(region=>region.id===regionId);
    return {...structuredClone(page),...(changed?{regions,scope:regions.length?'regions':'page'}:{})};
  });
  return {pages,pageIds,viewports:structuredClone(record.viewports)};
}
export function providerSelectionArgs(record,mode,selectedPages,selectedNodes,nodeItems){
  if(mode!=='nodes'){
    const pageIds=(record.pages||[]).filter(page=>selectedPages.includes(page.sourceNodeId||page.id)).map(page=>page.id);
    if(!pageIds.length)throw failure('请选择至少一个来源页面。');
    return {pageIds};
  }
  const ids=[...new Set(selectedNodes)];
  if(!ids.length)throw failure('请选择至少一个官方页面、画板或节点。');
  const existing=new Map((record.pages||[]).filter(page=>page.sourceNodeId).map(page=>[page.sourceNodeId,page]));
  const known=new Map(nodeItems.map(node=>[node.id,node]));
  return {pages:ids.map(id=>{
    if(existing.has(id))return {...structuredClone(existing.get(id)),selected:true};
    const node=known.get(id);if(!node)throw failure('部分所选节点尚未载入，请读取提纲后重新选择。');
    return {name:node.name||id,sourceNodeId:id,url:node.url||record.url,selected:true};
  })};
}
export function mergeSourceOutline(previous,incoming){
  const groups=new Map(previous.map(group=>[group.captureId,group]));
  for(const group of incoming){
    const old=groups.get(group.captureId),append=(group.nodeOffset||0)>0;
    const nodes=new Map((append?old?.nodes||[]:[]).map(node=>[node.id,node]));
    for(const node of group.nodes||[])nodes.set(node.id,node);
    groups.set(group.captureId,{...old,...group,nodes:[...nodes.values()]});
  }
  return [...groups.values()];
}
export function sourceOutlineTree(nodes){
  const byId=new Map(nodes.map(node=>[node.id,node])),parents=new Map();
  for(const node of nodes)if(node.parentId&&node.parentId!==node.id&&byId.has(node.parentId))parents.set(node.id,node.parentId);
  for(const node of nodes){const seen=new Set([node.id]);let parent=parents.get(node.id);while(parent){if(seen.has(parent)){parents.delete(node.id);break;}seen.add(parent);parent=parents.get(parent);}}
  const roots=[],children=new Map();
  for(const node of byId.values()){const parent=parents.get(node.id);if(!parent)roots.push(node);else{const list=children.get(parent)||[];list.push(node);children.set(parent,list);}}
  return {roots,children,parents};
}
export function sourceRefreshArgs({sourceId,targetPageId,version,captureId,nodeIds,fresh}){
  const capture=version?.captures?.find(item=>item.id===captureId);
  if(!capture)throw failure('请先选择一个明确的来源快照。');
  return {sourceId,pageId:targetPageId,versionId:version.id,captureId,nodeIds:[...(nodeIds||[])],...(fresh?{freshRefresh:true,captureSelection:{pageId:capture.pageId,stateId:capture.stateId,viewportId:capture.viewportId}}:{})};
}
