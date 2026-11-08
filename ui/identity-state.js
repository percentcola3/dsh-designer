export function invalidateIdentityState(state,{pageIds=[],designIds=[],resourceId}={}) {
  const pages=new Set(pageIds),designs=new Set(designIds);
  const affectedPage=id=>pages.size?pages.has(id):!!id;
  const target=state.target;
  const targetAffected=!target?.path&&(affectedPage(target?.pageId)||target?.scope==='project'||target?.scope==='design'&&designs.has(target.designId));
  return {
    ...state,
    target:targetAffected?{...target,nodeIds:undefined,scope:'read',scopeChoice:undefined}:target,
    tabs:state.tabs.map(tab=>tab.type==='canvas'&&affectedPage(tab.selection?.pageId)?{...tab,selection:null}:tab),
    references:state.references.map(ref=>!ref.sourceId&&(affectedPage(ref.pageId)||resourceId&&ref.resourceId===resourceId)?{...ref,stale:true,invalidatedReferences:true,invalidReason:'受控节点身份已重建，需要重新验证原始引用'}:ref),
  };
}
