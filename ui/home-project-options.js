const problem=(message,code)=>Object.assign(new Error(message),{code});

// A prepared native Session identifies the journey even when its prompt is edited.
export function homeCheckpointForDraft(checkpoint,prompt,sessionId=null){
  if(!checkpoint)return null;
  return sessionId?checkpoint.sessionId===sessionId?checkpoint:null:checkpoint.prompt===prompt?checkpoint:null;
}

export function validateHomeProjectOptions({platform='web',artifactKind='html'}={},locked=null){
  if(!['web','mobile'].includes(platform))throw problem('请选择 Web 或移动端平台。','INVALID_PLATFORM');
  if(!['html','react','vue'].includes(artifactKind))throw problem('请选择 HTML、React 或 Vue 产物类型。','INVALID_ARTIFACT_KIND');
  if(locked?.projectId&&((locked.platform||'web')!==platform||(locked.artifactKind||'html')!==artifactKind))throw problem('这次尝试已创建项目，请使用该项目的平台和产物类型重试；其他类型请另建项目。','HOME_DESIGN_OPTIONS_LOCKED');
  return {platform,artifactKind};
}

// Shared by explicit project-create dialogs. Checkpoint immediately after creation,
// so an initializer or list-refresh failure cannot create a second project on retry.
export async function createProjectWithOptions(api,input,{checkpoint=null,onCheckpoint=()=>{}}={}){
  const selection=validateHomeProjectOptions(input,checkpoint);
  let project;
  if(checkpoint?.projectId)project=(await api('project.get',{projectId:checkpoint.projectId})).project;
  else {
    const result=await api('project.create',{...input,...selection});project=result.project||result;
    if(!project?.id)throw problem('项目创建后未返回有效标识。','PROJECT_ID_MISSING');
    onCheckpoint({projectId:project.id,...selection});
  }
  if(!project?.id||project.archived||project.deletedAt)throw problem('这个项目已不可用，请重新开始。','PROJECT_UNAVAILABLE');
  if(project.workbench?.initializedAt)return {project,projectRevision:project.revision};
  const {saveLocation,goal,start}=input;
  const initialized=await api('project.initialize',{projectId:project.id,expectedRevision:project.revision,...selection,...(saveLocation?{saveLocation}:{}),...(goal!==undefined?{goal}:{}),...(start?{start}:{})});
  return {...initialized,project:initialized.project||project};
}

// Opening and cancelling this choice are entirely local: no project or message exists yet.
export function homeProjectOptions({checkpoint=null,prompt='',sessionId=null,platform='web',artifactKind='html'}={}){
  const saved=homeCheckpointForDraft(checkpoint,prompt,sessionId),locked=Boolean(saved?.projectId);
  return {...validateHomeProjectOptions(locked?{platform:saved.platform||'web',artifactKind:saved.artifactKind||'html'}:{platform,artifactKind}),locked,...(locked?{projectId:saved.projectId}:{})};
}
