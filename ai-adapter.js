import {randomUUID} from 'node:crypto';
import {AIWorkbench} from './ai-workbench.js';
import {normalizeDocument} from './document-model.js';
import {migrateWorkbench} from './workspace-service.js';
import {fail,text} from './store.js';

export const REQUEST_CARRIER_PREFIX='DSH_WORKBENCH_REQUEST ';
export const ADMITTED_TASK_MARKER='\n\nDSH_DESIGNER_ADMITTED_TASK_V1\n';
export const TASK_CONTEXT_NAME='local:designer-task';
const taskContexts=new WeakMap();
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const activeAdmissions=new WeakMap();
const projectUnavailable=project=>{if(project.deletedAt)fail('PROJECT_DELETED','Restore the project before submitting');if(project.archived)fail('PROJECT_ARCHIVED','Restore the project before submitting');};
const aiFor=owner=>owner.aiWorkbench||(owner.aiWorkbench=new AIWorkbench(owner));
const nativeEvents=agent=>agent.session?.snapshotEvents?.()||[];
const provider=(owner,name)=>owner.ctx?.[name]||owner.ctx?.get?.(name);

function parseTaskContext(text){
  if(typeof text!=='string')return null;
  const at=text.lastIndexOf(ADMITTED_TASK_MARKER);if(at<0)return null;
  try{return {record:JSON.parse(text.slice(at+ADMITTED_TASK_MARKER.length)),body:text.slice(0,at)};}catch{return null;}
}

/** Match the public runtime-context section to a human RPC in the same turn.
 * A copied descriptor, an Assistant claim or another turn never grants scope.
 * Older carrier messages remain readable without rewriting native history. */
export function admittedTaskRecords(agent){
  const events=nativeEvents(agent),result=[];let start=null,end=events.length;
  for(let index=0;index<events.length;index++){
    const contextEvent=events[index];
    if(contextEvent.type==='turn/start'){start=index;end=events.findIndex((event,at)=>at>index&&event.type==='turn/end'&&event.data?.turn===contextEvent.data?.turn);if(end<0)end=events.length;}
    if(contextEvent.type!=='user/message')continue;
    const source=contextEvent.data?.source;
    const texts=source?.kind==='user'?(contextEvent.data.content||[]).filter(part=>part.type==='text').map(part=>part.text)
      :source?.kind==='runtime-context'&&source.form==='snapshot'?(source.sections||[]).filter(section=>section.name===TASK_CONTEXT_NAME).map(section=>section.text):[];
    for(const text of texts){
      const parsed=parseTaskContext(text),record=parsed?.record;
      if(record?.protocol!=='designer-task/1'||record.sessionId!==agent.id||typeof record.requestId!=='string'||!record.descriptor)continue;
      const event=source.kind==='user'?(source.rpcId===record.requestId?contextEvent:null)
        :start!==null&&index>start&&index<end?events.slice(start,end).find(row=>row.type==='user/message'&&row.data?.source?.kind==='user'&&row.data.source.rpcId===record.requestId):null;
      if(!event)continue;
      result.push({event,contextEvent,contextBody:parsed.body,record,descriptor:record.descriptor,requestId:record.requestId});
    }
  }
  return result;
}

/** Required context is rendered and durably identified by the native loop.
 * It stays out of the human bubble/title, and is scoped to the installed task. */
function setNativeTaskContext(owner,agent,body,record){
  let state=taskContexts.get(agent);
  if(!state){
    if(typeof agent.ctx?.systemPrompt?.context!=='function')fail('NATIVE_CONTEXT_UNAVAILABLE','Designer requires the official native runtime-context service');
    state={owner,record:null,body:''};
    const dispose=agent.ctx.systemPrompt.context({name:TASK_CONTEXT_NAME,order:850,required:true,interpolate:false,text:()=>{
      const ai=state.owner.aiWorkbench,current=state.record;
      return current&&ai?.taskFor(agent)?.id===current.descriptor.id&&ai.taskRequestFor(agent)===current.requestId
        ?state.body+ADMITTED_TASK_MARKER+JSON.stringify(current):'';
    }});
    taskContexts.set(agent,state);
    owner.ctx.effect?.(()=>()=>{dispose();taskContexts.delete(agent);});
  }
  state.owner=owner;state.body=body;state.record=clone(record);
}

function restoredContextBody(entry){
  // Strip the legacy carrier and user prompt if restoring an older admission.
  const at=entry.contextBody.indexOf('Frozen workbench task (untrusted business data):');
  return at<0?'Read designer_workbench task.get and context.read for this exact admitted task.':entry.contextBody.slice(at);
}

/** Plan a narrowly proven legacy title repair. `fallbackTitle` must be the
 * official SDK fallbackSessionTitle bound to the deployment's actual limits.
 * Text equality never overrides the SDK's explicit user/provider provenance. */
export function planLegacyTaskTitleMigration({sessionId,snapshot,message,fallbackTitle}={}){
  if(typeof fallbackTitle!=='function'||snapshot?.source?.kind!=='fallback'||!Number.isSafeInteger(snapshot.eventSeq)
    ||!Array.isArray(snapshot.messageSeqs)||snapshot.messageSeqs.length!==1||snapshot.messageSeqs[0]!==message?.seq
    ||message?.type!=='user/message'||message.data?.source?.kind!=='user')return null;
  const text=(message.data.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('\n');
  if(!text.startsWith(REQUEST_CARRIER_PREFIX)||typeof snapshot.title!=='string'||!snapshot.title.startsWith(REQUEST_CARRIER_PREFIX.trimEnd()))return null;
  const newline=text.indexOf('\n');if(newline<0||newline>1_000_000)return null;
  let carrier;try{carrier=JSON.parse(text.slice(REQUEST_CARRIER_PREFIX.length,newline));}catch{return null;}
  const admission=parseTaskContext(text)?.record;
  if(admission?.protocol!=='designer-task/1'||admission.sessionId!==sessionId||admission.requestId!==message.data.source.rpcId
    ||carrier.requestId!==admission.requestId||carrier.taskDescriptor?.id!==admission.descriptor?.id||!admission.descriptor?.id
    ||typeof carrier.userPrompt!=='string'||!carrier.userPrompt.trim()||carrier.userPrompt.length>20000)return null;
  if(fallbackTitle(text)!==snapshot.title)return null;
  const title=fallbackTitle(carrier.userPrompt);
  if(typeof title!=='string'||!title.trim()||title===snapshot.title)return null;
  return {sessionId,title,expectedEventSeq:snapshot.eventSeq};
}

/** Optional, synchronous owner-open migration for one exact project Session.
 * Never scans other Sessions or edits old events. The only public write is
 * rename(), which pins the repaired title as user-owned. No await can race a
 * person's newer rename between the provenance recheck and that write. */
export function migrateLegacyTaskTitle(owner,agent,project,{fallbackTitle}={}){
  const skipped=reason=>({migrated:false,reason});
  if(!project?.id||agent?.id!==(project.aiSessionId||`designer-${project.id}`)||owner.bindings?.get(agent.id)!==project.id)return skipped('project-session-mismatch');
  if(typeof fallbackTitle!=='function')return skipped('official-title-fallback-unavailable');
  let titles;try{titles=provider(owner,'sessionTitle');}catch{return skipped('native-title-service-unavailable');}
  if(typeof titles?.get!=='function'||typeof titles.rename!=='function')return skipped('native-title-service-unavailable');
  try{
    const snapshot=titles.get(agent.session);
    if(snapshot?.source?.kind!=='fallback')return skipped('title-is-not-fallback');
    const message=nativeEvents(agent).find(event=>event.seq===snapshot.messageSeqs?.[0]);
    const plan=planLegacyTaskTitleMigration({sessionId:agent.id,snapshot,message,fallbackTitle});
    if(!plan)return skipped('legacy-title-not-proven');
    const current=titles.get(agent.session);
    if(current?.eventSeq!==plan.expectedEventSeq||current?.source?.kind!=='fallback'||current.title!==snapshot.title)return skipped('title-changed');
    const accepted=titles.rename(agent.session,plan.title);
    return {migrated:true,sessionId:agent.id,title:accepted.title,eventSeq:accepted.eventSeq,pinned:true};
  }catch{return skipped('native-title-repair-unavailable');}
}

/** Explicit owner-authorized display repair, separate from fallback derivation.
 * Only a proven old fallback that visibly leaks the carrier prefix is renamed.
 * Native rename owns normalization/limits; no runtime configuration is guessed. */
export function migrateLegacyTaskDisplayTitle(owner,agent,project){
  const skipped=reason=>({migrated:false,reason});
  if(!project?.id||agent?.id!==(project.aiSessionId||`designer-${project.id}`)||owner.bindings?.get(agent.id)!==project.id)return skipped('project-session-mismatch');
  let titles;try{titles=provider(owner,'sessionTitle');}catch{return skipped('native-title-service-unavailable');}
  if(typeof titles?.get!=='function'||typeof titles.rename!=='function')return skipped('native-title-service-unavailable');
  try{
    const snapshot=titles.get(agent.session);
    if(snapshot?.source?.kind!=='fallback')return skipped('title-is-not-fallback');
    if(typeof snapshot.title!=='string'||!snapshot.title.startsWith(REQUEST_CARRIER_PREFIX)||!Number.isSafeInteger(snapshot.eventSeq)
      ||!Array.isArray(snapshot.messageSeqs)||snapshot.messageSeqs.length!==1)return skipped('legacy-title-not-proven');
    const message=nativeEvents(agent).find(event=>event.seq===snapshot.messageSeqs[0]);
    if(message?.type!=='user/message'||message.data?.source?.kind!=='user')return skipped('legacy-title-not-proven');
    const text=(message.data.content||[]).filter(part=>part.type==='text').map(part=>part.text).join('\n');
    if(!text.startsWith(REQUEST_CARRIER_PREFIX))return skipped('legacy-title-not-proven');
    const newline=text.indexOf('\n');if(newline<0||newline>1_000_000)return skipped('legacy-title-not-proven');
    let carrier;try{carrier=JSON.parse(text.slice(REQUEST_CARRIER_PREFIX.length,newline));}catch{return skipped('legacy-title-not-proven');}
    const record=parseTaskContext(text)?.record,descriptor=record?.descriptor;
    if(record?.protocol!=='designer-task/1'||record.sessionId!==agent.id||record.requestId!==message.data.source.rpcId
      ||carrier.requestId!==record.requestId||descriptor?.projectId!==project.id||!descriptor?.id
      ||!['id','projectId','path','sha256'].every(key=>carrier.taskDescriptor?.[key]===descriptor[key])
      ||typeof carrier.userPrompt!=='string'||carrier.userPrompt.length>20000)return skipped('legacy-title-not-proven');
    const title=carrier.userPrompt.split(/\r\n|\r|\n/u,1)[0].trim();
    if(!title)return skipped('legacy-title-not-proven');
    const current=titles.get(agent.session);
    if(current?.eventSeq!==snapshot.eventSeq||current?.source?.kind!=='fallback'||current.title!==snapshot.title)return skipped('title-changed');
    const accepted=titles.rename(agent.session,title);
    return {migrated:true,sessionId:agent.id,title:accepted.title,eventSeq:accepted.eventSeq,pinned:true};
  }catch{return skipped('native-title-repair-unavailable');}
}

function selectedSkills(project,available){
  const selected=[];
  for(const name of project.skillNames||[]){const skill=available.find(s=>s.name===name);if(!skill)fail('SKILL_NOT_FOUND',`Selected skill ${name} is unavailable`);selected.push({name:skill.name,description:skill.description||''});}
  return selected;
}

async function legacyTarget(owner,input,project,signal){
  const normalized=clone(input),target=clone(input.target||input.frozenTarget||{});
  const pageId=target.pageId??input.pageId??input.artboardId;
  if(input.selection&&!target.nodeIds?.length&&!input.nodeIds?.length){
    const ids=input.selection.nodeIds||(input.selection.nodeId?[input.selection.nodeId]:null);
    if(ids){target.nodeIds=ids;target.scope='selection';}
    else if(pageId){
      const loaded=await owner.store.artboardGet(project.id,pageId,signal),model=normalizeDocument(loaded.html,{strict:false});
      const stable=/data-dsh-node\s*=\s*["']([^"']+)["']/.exec(input.selection.outerHTML||input.selection.selector||'')?.[1];
      const htmlId=/^#([A-Za-z][\w:.-]*)$/.exec(input.selection.selector||'')?.[1];
      const exact=stable?[stable]:htmlId?Object.values(model.nodes).filter(n=>n.attributes.id===htmlId).map(n=>n.id):[];
      if(exact.length!==1||!model.nodes[exact[0]])fail('INVALID_SCOPE','Reselect the element using its exact stable node ID');
      target.nodeIds=exact;target.scope='selection';
    }
  }
  if(pageId)target.pageId=pageId;
  normalized.target={...target,projectId:project.id};
  normalized.mode=input.mode??(pageId?'edit':'generate');
  if(!['generate','edit'].includes(normalized.mode))fail('INVALID_INPUT','mode must be generate or edit');
  if(normalized.mode==='edit'&&!pageId&&target.scope!=='read'&&!target.designId&&!target.path&&!target.fileId&&!(target.scope==='project'&&(target.contentOnly&&target.pageIds?.length||Object.prototype.hasOwnProperty.call(input,'activeDesignId'))))fail('INVALID_INPUT','Select a page or design before editing');
  return normalized;
}

async function rollbackAnchor(owner,projectId,requestId,previous,policy){
  for(let attempt=0;attempt<3;attempt++){
    const {project}=await owner.store.projectGet(projectId);
    if(project.workbench?.lastTaskRef?.requestId!==requestId)return;
    try{await owner.store.mutate(projectId,project.revision,'Restore AI admission anchor',p=>{if(p.workbench?.lastTaskRef?.requestId===requestId){if(previous)p.workbench.lastTaskRef=clone(previous);else delete p.workbench.lastTaskRef;}},undefined,policy,false);return;}
    catch(error){if(error.code!=='VERSION_CONFLICT'||attempt===2)throw error;}
  }
}

async function requestWasAdmitted(owner,agent,requestId){
  if(nativeEvents(agent).some(e=>e.type==='user/message'&&e.data?.source?.kind==='user'&&e.data.source.rpcId===requestId))return true;
  const state=await owner.ctx.sessionController.state({sessionId:agent.id},new AbortController().signal);
  return !!state.queue?.some(item=>item.rpcId===requestId);
}

/** Business admission adapter. DSH alone creates/runs the Agent and owns every message and approval. */
export async function admitWorkbenchAI(owner,input,signal,policy,{user=false}={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_INPUT','Expected an AI request');
  text(input.prompt,'prompt',20000);text(input.projectId||input.target?.projectId||input.frozenTarget?.projectId,'projectId',120);
  const initiator=owner.ctx?.agents?.currentInitiator?.();
  if(initiator&&owner.bindings?.has(initiator.id))fail('USER_ONLY','A project Agent cannot submit another AI task');
  const requestedSourceWrite=input.sourceWrite||input.target?.sourceWrite||input.frozenTarget?.sourceWrite;
  if(!user&&requestedSourceWrite)fail('USER_ONLY','A model submission cannot grant external source write access');
  if(!policy)fail('POLICY_REQUIRED','AI admission requires the calling DSH policy');
  const projectId=input.projectId||input.target?.projectId||input.frozenTarget?.projectId;
  if((input.target?.projectId&&input.target.projectId!==projectId)||(input.frozenTarget?.projectId&&input.frozenTarget.projectId!==projectId))fail('PROJECT_SCOPE','Submission and frozen target projects differ');
  let locks=activeAdmissions.get(owner);if(!locks){locks=new Set();activeAdmissions.set(owner,locks);}
  if(locks.has(projectId))fail('AI_BUSY','An AI submission is already being admitted');locks.add(projectId);
  try{
    let {project}=await owner.store.projectGet(projectId,signal);projectUnavailable(project);
    const ai=aiFor(owner),targetResolution=ai.resolveTarget(input,migrateWorkbench(project),{policy,originUser:user}),resolvedInput=targetResolution.input;
    const requestedScope=resolvedInput.target?.scope??resolvedInput.frozenTarget?.scope??resolvedInput.scope;
    const readonly=requestedScope==='read'||policy.mode==='read-only';
    if(readonly&&requestedSourceWrite)fail('SCOPE_DENIED','Read analysis cannot carry source write grants');
    // Initialization belongs to writable business admission. A read task projects legacy metadata only.
    if(!readonly&&!project.workbench?.schemaVersion){
      const initialized=await owner.workbench.execute({action:'project.initialize',projectId,expectedRevision:project.revision},{signal,policy,user:true});
      project=initialized.project;
    }
    const expectedProjectRevision=project.revision+(!readonly&&!project.aiSessionId?1:0);
    const sessionProject=readonly?{...project,aiSessionId:project.aiSessionId||`designer-${project.id}`}:project;
    const {agent,sessionId}=await owner.projectAgent(sessionProject,signal,policy,{readonly,writableAdmission:!readonly});
    ({project}=await owner.store.projectGet(projectId,signal));projectUnavailable(project);
    if(targetResolution.enabled&&project.revision!==expectedProjectRevision)fail('VERSION_CONFLICT','Project changed after target confirmation; submit the current draft again');
    const previousRecord=admittedTaskRecords(agent).at(-1),previousAnchor=clone(project.workbench?.lastTaskRef),previousTask=ai.taskFor(agent),previousTaskRequest=ai.taskRequestFor(agent);
    const priorContext=taskContexts.get(agent),previousContext=priorContext?{body:priorContext.body,record:clone(priorContext.record)}:null;
    let previousRequest=previousRecord?.requestId||previousAnchor?.requestId;
    const admission=await ai.admissionState(agent,{requestId:previousRequest,signal});
    // An anchor with no native request, no queue and no running turn is an orphaned admission,
    // for example after prompt rejection or a crash before native admission. It grants no scope.
    if(admission.busy&&admission.reason==='awaiting-request-record')previousRequest=undefined;
    else if(admission.busy)fail('AI_BUSY','The project Agent has queued or unfinished work',{sessionId,...admission});
    if(!readonly&&owner.policy?.(agent)?.mode==='read-only')fail('PROJECT_SESSION_READ_ONLY','该项目的原生会话处于只读模式。请打开完整会话，通过 DSH 原生权限控件调整后重试，或选择只读分析。',{sessionId,openFullChat:true});
    let normalized=await legacyTarget(owner,resolvedInput,migrateWorkbench(project),signal);
    if(readonly){normalized={...normalized,allowedPaths:[],sourceWrite:undefined,target:{...normalized.target,scope:'read'}};}
    const available=await owner.skillList(projectId,signal),skills=selectedSkills(project,available);
    const prepared=await ai.prepare(normalized,{signal,policy,user:true,selectedSkills:skills,attachmentAgent:agent,originUser:user,targetResolution,expectedProjectRevision:targetResolution.enabled?expectedProjectRevision:undefined});
    const authority=prepared.task.authority,fileTarget=['project-file','source-file'].includes(authority.kind);
    const finalTarget={...clone(prepared.context.target),...(fileTarget?{type:authority.kind,path:authority.path,fileId:authority.fileId,...(authority.sourceProjectId?{sourceId:authority.sourceProjectId}:{}),allowedPaths:clone(prepared.task.allowedPaths)}:{}),...(!fileTarget&&(normalized.allowedPaths!==undefined||normalized.target.allowedPaths!==undefined)?{allowedPaths:clone(prepared.task.allowedPaths)}:{})};
    const targetResult={target:finalTarget,effectiveBinding:clone(prepared.context.binding),effectiveBindingsByDesign:clone(prepared.context.effectiveBindingsByDesign||{})};
    const requestId=`designer-wb-${randomUUID()}`;
    const attachments=await ai.attachmentsForSession(prepared,agent,signal),attachmentSummaries=ai.describePromptAttachments(attachments,agent);
    let descriptor=await ai.persistTask(prepared,{signal,policy,...(readonly?{storage:'dsh-attachment',sessionId,requestId}:{})});
    if(readonly){
      const uploads=provider(owner,'fileUploads'),files=provider(owner,'attachments');
      if(!uploads||!files)fail('ATTACHMENTS_UNAVAILABLE','Read analysis requires DSH file attachment services');
      const staged=await uploads.uploadStream({sessionId,data:files.readFileStream(descriptor.attachment,signal),signal,name:descriptor.attachment.name});
      descriptor={...descriptor,attachment:staged.file};
      ai.descriptors.set(prepared.task.id,Object.freeze(clone(descriptor)));
      attachments.push({type:'file',receiptId:staged.receiptId});
    }
    const stillIdle=await ai.admissionState(agent,{requestId:previousRequest,signal});
    if(stillIdle.busy)fail('AI_BUSY','Another DSH request entered this project during preparation',{sessionId,...stillIdle});
    let projectRevision=prepared.project.revision,anchored=false;
    if(!readonly){
      const saved=await owner.store.mutate(projectId,prepared.project.revision,'Admit frozen AI design task',p=>{projectUnavailable(p);p.workbench ||= {};p.workbench.lastTaskRef={...clone(descriptor),sessionId,requestId};},signal,policy,false);
      projectRevision=saved.revision;anchored=true;
    }
    const record={protocol:'designer-task/1',sessionId,requestId,descriptor,attachmentSummaries,referenceSummaries:prepared.task.refs.map(r=>({resourceId:r.resourceId,kind:r.kind,summary:r.summary?.slice(0,140),sourceVersion:r.sourceVersion,invalid:r.invalid,historical:r.historical,staleBounds:r.staleBounds}))};
    const prefix='Design task: '+normalized.prompt+'\n\n',body=prepared.prompt.startsWith(prefix)?prepared.prompt.slice(prefix.length):prepared.prompt;
    try{
      ai.setTask(agent,prepared.task,{requestId});
      setNativeTaskContext(owner,agent,body,record);
      await owner.ctx.sessionController.prompt({sessionId,requestId,mode:'queue',content:[{type:'text',text:input.prompt},...attachments]},signal||new AbortController().signal);
    }catch(error){
      let admitted=false;try{admitted=await requestWasAdmitted(owner,agent,requestId)}catch{}
      if(admitted)return {sessionId,accepted:true,projectRevision,taskId:prepared.task.id,requestId,readonly,...targetResult,admissionWarning:'DSH recorded this request before the transport reported failure'};
      if(previousTask&&owner.bindings.get(agent.id)===previousTask.projectId){
        ai.setTask(agent,previousTask,{requestId:previousTaskRequest});
        if(previousContext?.record)setNativeTaskContext(owner,agent,previousContext.body,previousContext.record);
      }else{ai.clearTask(agent);const context=taskContexts.get(agent);if(context){context.record=null;context.body='';}}
      if(anchored){try{await rollbackAnchor(owner,projectId,requestId,previousAnchor,policy)}catch(rollbackError){error.details={...(error.details||{}),rollback:{code:rollbackError.code||'ROLLBACK_FAILED',message:rollbackError.message}};}}
      throw error;
    }
    return {sessionId,accepted:true,projectRevision,taskId:prepared.task.id,requestId,readonly,...targetResult};
  }finally{locks.delete(projectId);}
}

/** Reconstruct scope only from the exact project's trusted native Session admission record. */
export async function restoreWorkbenchAgent(owner,agent,project,signal){
  const current=(await owner.store.projectGet(project.id,signal)).project;
  const expected=current.aiSessionId||`designer-${current.id}`;
  if(agent.id!==expected||owner.bindings?.has(agent.id)&&owner.bindings.get(agent.id)!==current.id)fail('PROJECT_SCOPE','DSH Session does not belong to this project');
  owner.bindings ||= new Map();owner.bindings.set(agent.id,current.id);
  const ai=aiFor(owner),entry=admittedTaskRecords(agent).at(-1);ai.clearTask(agent);
  if(!entry){ai.clearTask(agent);return {restored:false,reason:'NO_ADMITTED_TASK'};}
  const descriptor=entry.descriptor;
  if(descriptor.projectId!==current.id)fail('PROJECT_SCOPE','Logged task belongs to another project');
  if(descriptor.storage==='dsh-attachment'){
    const restored=await ai.restoreAttachmentTask(agent,descriptor,{signal,policy:owner.policy?.(agent)});
    setNativeTaskContext(owner,agent,restoredContextBody(entry),entry.record);
    ai.setTask(agent,restored.task,{requestId:entry.requestId});
    return {restored:true,...restored,requestId:entry.requestId,readonly:true};
  }
  const anchor=current.workbench?.lastTaskRef;
  if(!anchor||anchor.requestId!==entry.requestId||anchor.sessionId!==agent.id||anchor.id!==descriptor.id||anchor.path!==descriptor.path||anchor.sha256!==descriptor.sha256)fail('TASK_NOT_ANCHORED','Native request and project task anchor differ');
  const restored=await ai.restorePersistedTask(agent,descriptor,{signal,policy:owner.policy?.(agent)});
  setNativeTaskContext(owner,agent,restoredContextBody(entry),entry.record);
  ai.setTask(agent,restored.task,{requestId:entry.requestId});
  return {restored:true,...restored,requestId:entry.requestId,readonly:restored.task.scope==='read'};
}
