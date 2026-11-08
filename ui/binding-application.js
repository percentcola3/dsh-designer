import {orderedDesignPages} from './page-order.js';

export function prepareBindingScope(project,design,pages,mode='design',selectedIds=[],selection={}){
  if(!design)throw Object.assign(new Error('请先选择设计。'),{code:'DESIGN_REQUIRED'});
  selection=selection||{};
  const all=orderedDesignPages(pages,design);
  const ids=new Set(mode==='selection'?[selection.pageId]:selectedIds);
  const chosen=mode==='design'?all:all.filter(page=>ids.has(page.id));
  if(!chosen.length)throw Object.assign(new Error('请选择至少一个当前设计中的页面。'),{code:'TARGET_REQUIRED'});
  const nodeIds=mode==='selection'?[...new Set((selection.nodeIds||[]).filter(id=>typeof id==='string'&&id))]:[];
  if(mode==='selection'&&!nodeIds.length)throw Object.assign(new Error('请先在当前设计画布选择实际对象。'),{code:'TARGET_REQUIRED'});
  return {designName:design.name,pageNames:chosen.map(page=>page.name),args:{projectId:project.id,expectedRevision:project.revision,designIds:[design.id],pageIds:chosen.map(page=>page.id),scope:mode==='selection'?'selection':'design',...(nodeIds.length?{nodeIds}:{})}};
}

export function bindingApplicationState(application) {
  const status=application?.status||'unknown';
  const labels={pending:'待执行',running:'任务运行中',partial:'部分页面已保存',applied:'当前范围已保存',failed:'应用任务失败',error:'应用任务失败',cancelled:'任务已取消',unknown:'状态待确认'};
  return {
    status,
    label:labels[status]||status,
    applied:status==='applied',
    savedPageIds:[...new Set((application?.savedPageIds||[]).filter(id=>typeof id==='string'))],
    visualLabel:['verified','passed'].includes(application?.visualReview)?'已核对':'待核对',
  };
}

export function bindingRetryArgs(original,error,latestRevision) {
  const details=error?.details;
  if(error?.code!=='AI_BUSY'||details?.retry?.action!=='binding.apply')return null;
  const ids=details.retry.applicationIds||details.pendingApplications||[];
  const revision=Number.isSafeInteger(latestRevision)&&latestRevision>0?latestRevision:Number.isSafeInteger(details.projectRevision)&&details.projectRevision>0?details.projectRevision:original.expectedRevision;
  return {
    ...original,
    designIds:[...(original.designIds||[])],
    ...(original.pageIds?{pageIds:[...original.pageIds]}:{}),
    ...(original.nodeIds?{nodeIds:[...original.nodeIds]}:{}),
    expectedRevision:revision,
    applicationIds:[...new Set(ids.filter(id=>typeof id==='string'))],
  };
}
