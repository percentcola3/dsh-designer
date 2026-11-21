const fail=message=>{throw new Error(message);};

/** All writes use freshly read project revisions; UI summaries are never CAS authority. */
export async function projectCardAction(api,action,projectId,values={}) {
  if(!['clone','rename','move','delete','restore'].includes(action))fail('不支持的项目操作。');
  let name,groupId;
  if(action==='rename'){
    name=typeof values.name==='string'?values.name.trim():'';
    if(!name||name.length>160)fail('请填写 1–160 字的项目名称。');
  }
  if(action==='move'){
    if(values.groupId!==null&&typeof values.groupId!=='string')fail('请选择项目分组。');
    groupId=values.groupId||null;
  }
  const latest=action==='restore'?(await api('state')).projects?.find(project=>project.id===projectId):(await api('project.get',{projectId})).project;
  if(!latest||latest.id!==projectId||action!=='restore'&&(latest.deletedAt||latest.archived))fail('项目已不可用，请刷新列表。');
  const args={projectId,expectedRevision:latest.revision};
  if(action==='restore')return latest.deletedAt||latest.archived?api('project.restore',args):{project:latest};
  if(action==='rename')return name===latest.name?{project:latest}:api('project.update',{...args,name});
  if(action==='move')return (latest.groupId||null)===groupId?{project:latest}:api('project.update',{...args,groupId});
  if(action==='clone')return api('project.clone',{...args,name:(latest.name||'未命名项目').slice(0,156)+' 副本'});
  // Soft deletion only: the native API retains the project's files and history.
  return api('project.delete',args);
}
