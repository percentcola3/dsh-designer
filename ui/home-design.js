import {getComposeAdmission} from './compose-admission.js';
import {homeCheckpointForDraft,homeProjectOptions,validateHomeProjectOptions} from './home-project-options.js';

function problem(message,code='HOME_DESIGN_FAILED'){return Object.assign(new Error(message),{code});}
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
// The prepared ordinary Session owns the homepage draft, model and native receipts.
// Adoption keeps that exact Session; retrying an unaccepted draft keeps saved IDs.
export async function startHomeDesign(api,prompt,{checkpoint=null,onCheckpoint=()=>{},onPrepared=async()=>{},requestProjectOptions,sessionId=null,references=[],attachments=[],systemChoice=null,artifactKind,platform}={}){
  const text=typeof prompt==='string'?prompt.trim():'';
  if(!text||text.length>20000)throw problem('请填写不超过 20000 字的设计需求。','INVALID_PROMPT');
  const saved=homeCheckpointForDraft(checkpoint,text,sessionId);
  let progress=saved?{...saved}:{prompt:text,sessionId};
  if(progress.accepted)return progress;
  let selected={platform:platform??saved?.platform??'web',artifactKind:artifactKind??saved?.artifactKind??'html'};
  if(requestProjectOptions){
    selected=await requestProjectOptions(homeProjectOptions({checkpoint,prompt:text,sessionId,...selected}));
    if(selected==null)return {cancelled:true};
  }
  ({platform,artifactKind}=validateHomeProjectOptions(selected,progress));
  const artifactArgs=artifactKind==='html'?{}:{artifactKind};
  const platformArgs={platform};
  const previousChoice=progress.systemChoice;
  const commit=patch=>{progress={...progress,...patch};onCheckpoint(progress);};
  let detach,compose,submittedGeneration;
  try{
    if(progress.accepted)return progress;
    if(progress.projectId&&((progress.artifactKind||'html')!==artifactKind||(progress.platform||'web')!==platform))throw problem('这次尝试已创建设计稿，请保留原来的平台和产物类型后重试；其他类型请另建项目。','HOME_DESIGN_OPTIONS_LOCKED');
    commit({prompt:text,sessionId,artifactKind,platform});
    let project;
    if(!progress.projectId){
      const name=Array.from(text.split('\n',1)[0]).slice(0,30).join('')||'新的设计项目';
      const result=await api('project.create',{name,platform,...artifactArgs,goal:text,start:{kind:'empty'}});
      project=result.project||result;
      if(!project.id)throw problem('项目创建后未返回有效标识。');
      commit({projectId:project.id});
    }else project=(await api('project.get',{projectId:progress.projectId})).project;
    if(!project?.id||project.deletedAt||project.archived)throw problem('这个项目已不可用，请重新开始。','PROJECT_UNAVAILABLE');
    if(!project.workbench?.initializedAt){
      const initialized=await api('project.initialize',{projectId:project.id,expectedRevision:project.revision,...artifactArgs,...platformArgs,goal:text,start:{kind:'empty'}});
      project=initialized.project||(await api('project.get',{projectId:project.id})).project;
    }
    if(sessionId){
      const adopted=await api('composer.adopt',{projectId:project.id,sessionId,expectedRevision:project.revision});
      project=adopted.project||(await api('project.get',{projectId:project.id})).project;
    }
    const selectedBinding=systemChoice?{mode:'independent',systemId:systemChoice.systemId,version:systemChoice.version}:{mode:sessionId?'none':'inherit'};
    if(!progress.designId){
      const initial=project.workbench?.designs?.find(design=>!design.deletedAt);
      if(initial){
        if((initial.artifactKind||'html')!==artifactKind||(initial.platform||'web')!==platform)throw problem('初始设计稿与所选平台或产物类型不一致，请新建对应类型的设计稿。','HOME_DESIGN_OPTIONS_MISMATCH');
        if(!same(initial.binding||{mode:'inherit'},selectedBinding)){
          const result=await api('binding.set',{projectId:project.id,designId:initial.id,expectedRevision:project.revision,binding:selectedBinding});
          project=result.project||project;
        }
        commit({designId:initial.id,systemChoice});
      }else{
        const result=await api('design.create',{projectId:project.id,expectedRevision:project.revision,name:platform==='mobile'?'移动端设计稿':'Web 设计稿',platform,...artifactArgs,binding:selectedBinding});
        if(!result.design?.id)throw problem('设计创建后未返回有效标识。');
        project=result.project||project;
        commit({designId:result.design.id,systemChoice});
      }
    }else if(sessionId&&!same(previousChoice,systemChoice)){
      const result=await api('binding.set',{projectId:project.id,designId:progress.designId,expectedRevision:project.revision,binding:selectedBinding});
      project=result.project||project;
      commit({systemChoice});
    }
    const target={projectId:project.id,designId:progress.designId,scope:'design'};
    const resolved=await api('binding.resolve',{projectId:project.id,designId:progress.designId});
    const snapshot={prompt:text,references:structuredClone(references).map(ref=>({...ref,projectId:project.id})),attachments:structuredClone(attachments)};
    if(sessionId){
      compose=getComposeAdmission(project.id);const token={};detach=compose.attach(token,()=>{});
      await compose.load(api,token,()=>snapshot);
      submittedGeneration=compose.capture(token,snapshot);
      if(submittedGeneration!==null)await compose.save(api);
    }
    await onPrepared({projectId:project.id,designId:progress.designId,target,project});
    const result=await api('ai.run',{projectId:project.id,designId:progress.designId,mode:'generate',...snapshot,target:{...target},frozenTarget:{...target},effectiveBinding:resolved.effectiveBinding||resolved.binding||resolved});
    if(result.accepted===false)throw problem(result.error?.message||'AI 尚未接受这项设计任务。',result.error?.code||'AI_REJECTED');
    if(!result.sessionId||!result.requestId)throw problem('任务尚未返回可确认的会话与请求信息，请到项目中检查执行状态。','AI_STATUS_UNKNOWN');
    commit({accepted:true,result});
    if(compose&&submittedGeneration!==null){try{await compose.consume(api,submittedGeneration);}catch(error){commit({composeError:{code:error.code,message:error.message}});}}
    return progress;
  }catch(error){error.homeCheckpoint=progress;throw error;}
  finally{detach?.();}
}
