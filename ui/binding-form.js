export function bindingFormArgs(values,{projectId,designId}){
  const projectScope=values.bindingScope==='project';
  const mode=projectScope?(values.systemId?'independent':'none'):values.bindingMode;
  const systemId=mode==='independent'?(values.systemId||null):null;
  if(projectScope)return {projectId,scope:'project',systemId};
  if(!designId)throw Object.assign(new Error('请先选择设计。'),{code:'DESIGN_REQUIRED'});
  if(!['inherit','independent','none'].includes(mode)||mode==='independent'&&!systemId)throw Object.assign(new Error('请选择有效的继承方式和设计规范。'),{code:'INVALID_BINDING'});
  return {projectId,designId,scope:'design',binding:{mode,...(systemId?{systemId}:{})}};
}
