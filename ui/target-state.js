import {labelSelection} from '../editor/selection-labels.js';
const isFileTarget=target=>!!target?.path&&['file','source-file'].includes(target.type);
const idsOf=selection=>[...new Set((selection?.nodeIds||[selection?.nodeId]).filter(Boolean))];
const identity=target=>JSON.stringify([target?.projectId,target?.designId,target?.pageId,target?.type,target?.sourceId,target?.fileId,target?.resourceId,target?.path,idsOf(target),target?.sourceSelection]);

// Keep the complete runtime observation separate from the stable source target.
// DOM ancestry is never promoted into a source locator.
export function selectionForSubmission(selection,target={}) {
  if(!selection)return undefined;
  const value=structuredClone(selection),first=value.objects?.[0];
  value.pageId??=target.pageId;value.artifact??=first?.artifact;
  for(const key of ['documentEpoch','renderEpoch','sceneId'])value[key]??=first?.[key];
  if(!value.nodeIds?.length&&value.objects?.length)value.nodeIds=value.objects.map(row=>row.instanceId||row.nodeId||row.id).filter(Boolean);
  return labelSelection(value);
}

export function sourceTemplateConfirmation(selection) {
  const value=selectionForSubmission(selection),artifact=value?.artifact;
  if(!['react','vue'].includes(artifact?.kind)||typeof artifact.entry!=='string'||typeof artifact.buildId!=='string'||!artifact.buildId||!Number.isSafeInteger(artifact.version)||artifact.version<1||!value.objects?.length)return null;
  if(['documentEpoch','renderEpoch','sceneId'].some(key=>value[key]===undefined||value.objects.some(row=>row[key]!==undefined&&row[key]!==value[key])))return null;
  if(value.objects.some(row=>row.artifact&&['kind','entry','version','buildId'].some(key=>row.artifact[key]!==artifact[key])))return null;
  const targets=new Map();
  for(const row of value.objects){const locator=row.sourceLocator;if(!row.sourceNodeId||!locator?.path||!/^[a-f0-9]{64}$/.test(locator.sourceHash||'')||locator.id!==row.sourceNodeId||typeof locator.tag!=='string'||!Number.isSafeInteger(locator.start)||!Number.isSafeInteger(locator.end)||locator.start<0||locator.end<=locator.start||!Number.isSafeInteger(locator.line)||locator.line<1||!Number.isSafeInteger(locator.column)||locator.column<0)return null;
    const target={path:locator.path,nodeId:row.sourceNodeId,sourceHash:locator.sourceHash},key=`${target.path}\0${target.nodeId}`,prior=targets.get(key);if(prior&&prior.sourceHash!==target.sourceHash)return null;targets.set(key,target);}
  return {kind:'source-template',buildId:artifact.buildId,version:artifact.version,documentEpoch:value.documentEpoch,renderEpoch:value.renderEpoch,sceneId:value.sceneId,
    sources:[...targets.values()].sort((a,b)=>`${a.path}\0${a.nodeId}`.localeCompare(`${b.path}\0${b.nodeId}`)),instanceIds:[...new Set(value.objects.map(row=>row.instanceId||row.nodeId||row.id).filter(Boolean))].sort()};
}

export function chooseTargetScope(target,scope,choiceId) {
  const next={...target,scope,readonlyChoice:scope==='read',scopeChoice:{id:choiceId,scope,projectId:target.projectId,designId:target.designId,pageId:target.pageId}};
  if(scope!==target.scope)delete next.sourceTemplateConfirmed;
  if(isFileTarget(target)){
    delete next.sourceWrite;delete next.allowedPaths;
    if(scope==='project'){
      if(target.sourceId)next.sourceWrite={sourceProjectId:target.sourceId,paths:[target.path]};
      else next.allowedPaths=[target.path];
    }
  }
  return next;
}

export function targetFromSelection(current,selection,context) {
  if(context.source!=='user')return current;
  if(isFileTarget(current)&&!context.forceSelection)return current;
  const captured=selectionForSubmission(selection),sourceProof=sourceTemplateConfirmation(captured),runtimeNodeIds=idsOf(captured),nodeIds=sourceProof?[...new Set(sourceProof.sources.map(row=>row.nodeId))]:runtimeNodeIds,pageId=selection?.pageId||context.pageId;
  const next={projectId:context.projectId,designId:context.designId,pageId,nodeIds:nodeIds.length?nodeIds:undefined,scope:current?.readonlyChoice?'read':nodeIds.length?'selection':context.defaultScope||'read',...(current?.readonlyChoice?{readonlyChoice:true}:{}),...(sourceProof?{runtimeNodeIds,sourceSelection:sourceProof}:{})};
  const choice=current?.scopeChoice;
  if(!context.forceSelection&&choice?.id&&choice.scope===current.scope&&choice.projectId===next.projectId){
    const matches=choice.scope==='project'||choice.scope==='read'||choice.designId===next.designId&&(choice.scope==='design'||choice.pageId===next.pageId);
    if(matches){next.scope=choice.scope;next.scopeChoice=choice;}
  }
  return next;
}

// A broad scope explicitly chosen for one submission is not authority for the
// next submission. Do not consume a newer choice made while admission waited.
export function consumeTargetChoice(current,submitted,context={}) {
  if(current?.scope!==submitted?.scope||current?.scopeChoice?.id!==submitted?.scopeChoice?.id)return current;
  const sameChoice=current?.scopeChoice?.id&&current.scopeChoice.id===submitted?.scopeChoice?.id&&current.projectId===submitted.projectId;
  if(!sameChoice&&identity(current)!==identity(submitted))return current;
  const {scopeChoice,sourceTemplateConfirmed,...next}=current;
  if(!isFileTarget(current)&&current.scope!=='read'){
    if(context.activeDesignId){
      if(current.designId!==context.activeDesignId||current.scope==='project')return {projectId:current.projectId,designId:context.activeDesignId,scope:'design'};
      next.scope=idsOf(current).length?'selection':current.scope==='page'&&current.pageId?'page':'design';
    }else next.scope=idsOf(current).length?'selection':'read';
  }
  return next;
}
