import {designPlatform,requireHtml} from '../design-platform.js';
const problem=(message,code)=>Object.assign(new Error(message),{code});

// A prepared native Session identifies the journey even when its prompt is edited.
export function homeCheckpointForDraft(checkpoint,prompt,sessionId=null){
  if(!checkpoint)return null;
  return sessionId?checkpoint.sessionId===sessionId?checkpoint:null:checkpoint.prompt===prompt?checkpoint:null;
}

export function validateHomeProjectOptions({platform='web',artifactKind='html'}={},locked=null){
  if(!['web','mobile'].includes(platform))throw problem('请选择 Web 或移动端平台。','INVALID_PLATFORM');
  requireHtml(artifactKind);
  if(locked?.projectId&&((locked.platform||'web')!==platform||(locked.artifactKind||'html')!==artifactKind))throw problem('项目已创建，请选择适用于原项目平台的设计规范后重试。','HOME_DESIGN_OPTIONS_LOCKED');
  return {platform,artifactKind};
}

export async function resolvePlatform(api,systemId,fallback='web'){
  return systemId?designPlatform((await api('system.get',{systemId})).platforms,fallback):fallback;
}

export async function createProjectWithOptions(api,input,{checkpoint=null,onCheckpoint=()=>{}}={}){
  const platform=await resolvePlatform(api,input.systemId,checkpoint?.platform??input.platform);
  const selection=validateHomeProjectOptions({...input,platform},checkpoint);
  let project;
  if(checkpoint?.projectId)project=(await api('project.get',{projectId:checkpoint.projectId})).project;
  else {
    const result=await api('project.create',{...input,...selection});project=result.project||result;
    if(!project?.id)throw problem('项目创建后未返回有效标识。','PROJECT_ID_MISSING');
    onCheckpoint({projectId:project.id,...selection,...(input.systemId?{systemId:input.systemId}:{})});
  }
  if(!project?.id||project.archived||project.deletedAt)throw problem('这个项目已不可用，请重新开始。','PROJECT_UNAVAILABLE');
  if(project.workbench?.initializedAt)return {project,projectRevision:project.revision};
  const {saveLocation,goal,start}=input;
  const initialized=await api('project.initialize',{projectId:project.id,expectedRevision:project.revision,...selection,...(input.systemId?{systemId:input.systemId}:{}),...(saveLocation?{saveLocation}:{}),...(goal!==undefined?{goal}:{}),...(start?{start}:{})});
  return {...initialized,project:initialized.project||project};
}
