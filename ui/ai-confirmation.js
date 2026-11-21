import {selectionForSubmission,sourceTemplateConfirmation} from './target-state.js';
const clone=value=>structuredClone(value);
export function freezeAISubmission({snapshot,activeDesignId,sessionId,projectId}){
  const snap=clone(snapshot),{scopeChoice,...target}=snap.target;
  if(target.path||target.fileId||!target.pageId)delete snap.selection;
  if(snap.selection)snap.selection=selectionForSubmission(snap.selection,target);
  if(snap.selection?.objects){let bytes=0;for(const row of snap.selection.objects){
    if(typeof row.outerHTML!=='string'||!row.outerHTML||row.outerHTMLTruncated||row.outerHTMLComplete===false)throw Object.assign(new Error('选区元素尚未完整恢复，请等待后重新提交。'),{code:'ELEMENT_CONTEXT_INCOMPLETE'});
    bytes+=new TextEncoder().encode(row.outerHTML).length;if(bytes>2*1024*1024)throw Object.assign(new Error('完整选区超过 2 MiB，请缩小选区；不会发送截断前缀。'),{code:'ELEMENT_CONTEXT_TOO_LARGE'});
  }}
  if(target.scope==='selection'&&['react','vue'].includes(snap.selection?.artifact?.kind)){
    const proof=sourceTemplateConfirmation(snap.selection);
    if(!proof||JSON.stringify(target.sourceTemplateConfirmed)!==JSON.stringify(proof)||snap.selection.objects.some(row=>!row.outerHTML||row.outerHTMLTruncated||row.outerHTMLComplete===false))throw Object.assign(new Error('请确认修改源码模板并等待完整元素与源码位置就绪。'),{code:'SOURCE_TEMPLATE_CONFIRMATION_REQUIRED'});
    target.nodeIds=[...new Set(proof.sources.map(row=>row.nodeId))];target.runtimeNodeIds=proof.instanceIds;target.sourceSelection=proof;
  }
  return {contextSessionId:sessionId,projectId,activeDesignId:activeDesignId??null,designId:target.designId,artboardId:target.pageId,
    mode:target.pageId||target.path?'edit':'generate',...snap,target,frozenTarget:clone(target),effectiveBinding:snap.binding,
    ...(target.designId && target.designId===(activeDesignId||target.designId) && snap.binding && Object.hasOwn(snap.binding,'systemId') ?
      {expectedDesignBinding:{designId:target.designId,systemId:snap.binding.systemId,version:snap.binding.version}}:{}),
    ...(target.sourceWrite?{sourceWrite:target.sourceWrite}:{}),...(target.allowedPaths?{allowedPaths:target.allowedPaths}:{})};
}
export function confirmationIsCurrent(pending,{projectId,projectRevision,activeDesignId,prompt,references,attachments,target,selection}){
  if(!pending||pending.projectId!==projectId||pending.projectRevision!==projectRevision||pending.activeDesignId!==(activeDesignId??null))return false;
  const a=pending.guard||pending.snapshot,b={prompt,references,attachments,target,selection};
  return ['prompt','references','attachments','target','selection'].every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]));
}
export function confirmedPayload(pending){
  if(!pending?.details?.token)throw new Error('确认凭据已失效，请重新提交。');
  return {...clone(pending.payload),targetConfirmation:pending.details.token};
}
