export function bindingFormArgs(values,{projectId,designId,systems=[]}){
  const projectScope=values.bindingScope==='project';
  const mode=projectScope?(values.systemId?'independent':'none'):values.bindingMode;
  const systemId=mode==='independent'?(values.systemId||null):null;
  let version=null;
  if(systemId){
    const explicit=values.version!==undefined&&values.version!==null&&String(values.version).trim()!=='';
    const current=systems.find(system=>system.id===systemId);
    version=explicit?Number(values.version):current?.version??current?.revision;
    if(!Number.isSafeInteger(version)||version<1)throw Object.assign(new Error('请选择正整数的固定体系版本。'),{code:'INVALID_BINDING_VERSION'});
  }
  if(projectScope)return {projectId,scope:'project',systemId,version};
  if(!designId)throw Object.assign(new Error('请先选择设计。'),{code:'DESIGN_REQUIRED'});
  if(!['inherit','independent','none'].includes(mode)||mode==='independent'&&!systemId)throw Object.assign(new Error('请选择有效的继承方式和固定体系。'),{code:'INVALID_BINDING'});
  return {projectId,designId,scope:'design',binding:{mode,...(systemId?{systemId,version}:{})}};
}
