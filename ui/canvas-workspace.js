import {resourceKey} from './tabs.js';
import {orderedDesignPages} from './page-order.js';

export function designCanvasTab(projectId,design,pages=[],previous) {
  if(!design)return null;
  const ownPages=orderedDesignPages(pages,design);
  const selected=ownPages.find(p=>p.id===previous?.activePageId)||ownPages[0];
  return {...previous,id:resourceKey(projectId,{id:design.id,type:'canvas'}),projectId,type:'canvas',resourceId:design.id,designId:design.id,name:design.name,activePageId:selected?.id||null,preview:false,view:previous?.view||{grid:true}};
}

export function sourceCanvasTab(projectId,design,provider,previous) {
  if(!design||!['website','mastergo'].includes(provider))return null;
  const resourceId=`import-${provider}-${design.id}`,id=resourceKey(projectId,{id:resourceId,type:'source'});
  const retained=previous?.id===id&&previous.projectId===projectId&&previous.designId===design.id&&previous.provider===provider?previous:null;
  return {...retained,id,projectId,type:'source',resourceId,designId:design.id,provider,canvasWorkflow:true,name:provider==='website'?'网页复刻':'MasterGo 导入',preview:false,view:retained?.view||{}};
}

export function canvasFirstState(projectId,designs,pages,restored,state={}) {
  const design=designs.find(d=>d.id===state.designId)||designs[0];
  const items=restored.items||[];
  const previous=items.find(t=>t.type==='canvas'&&t.designId===design?.id);
  const tab=designCanvasTab(projectId,design,pages,previous);
  return {design,tab,tabs:{items:tab?[...items.filter(t=>t.id!==tab.id),tab]:items,activeId:tab?.id||restored.activeId||null}};
}

// A retry resumes the exact design/page already created, including refresh failures.
export async function createCanvasDesign(api,{projectId,name,platform='web',artifactKind='html'},checkpoint={}) {
  if(!['html','react','vue'].includes(artifactKind))throw new Error('请选择 HTML、React 或 Vue 产物类型。');
  let project=(await api('project.get',{projectId})).project;
  let design=project.workbench?.designs?.find(d=>d.id===checkpoint.designId&&!d.deletedAt);
  if(checkpoint.designId&&!design)throw new Error('刚创建的设计稿已不可用，请关闭后重新创建。');
  let initialPage;
  if(!design){
    const made=await api('design.create',{projectId,expectedRevision:project.revision,name:name.trim(),platform,...artifactKind!=='html'?{artifactKind}:{},binding:{mode:'inherit'}});
    design=made.design;checkpoint.designId=design.id;initialPage=made.page||made.artboard;
    project=made.project||(await api('project.get',{projectId})).project;
  }
  let page=initialPage||project.artboards?.find(p=>!p.deletedAt&&p.designId===design.id);
  if(!page){
    const made=await api('page.create',{projectId,designId:design.id,expectedRevision:project.revision,name:platform==='mobile'?'移动端页面':'首页',viewport:platform==='mobile'?{width:390,height:844}:{width:1440,height:1000}});
    page=made.page;checkpoint.pageId=page.id;
  }
  return {design,page};
}
