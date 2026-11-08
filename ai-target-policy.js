import {createHash,randomUUID} from 'node:crypto';
import {fail} from './store.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const within=(candidate,root)=>typeof candidate==='string'&&typeof root==='string'&&(candidate===root||candidate.startsWith(root+'/'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,stable(value[k])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};

// Deliberately recognize direct write instructions only. Mentioning another Design as
// inspiration, including an @ reference, never changes the writable target.
function writesLabel(prompt,label){
  if(typeof label!=='string'||!label.trim())return false;
  const name=escape(label),identity=`(?:[「『“"'\x60]?${name}[」』”"'\x60]?)`,verb='(?:修改|改写|更新|编辑|调整|重做|重写|创建|写入|保存|删除|改成|edit|modify|update|rewrite|redesign|create|write|save|delete)';
  return String(prompt||'').split(/[，。；\n,;!?！？]/).some(clause=>{
    if(/(?:不要|别|勿|无需|不必|不修改|只读|do\s+not|don['’]t|never|read.only)/i.test(clause))return false;
    return new RegExp(`${verb.replace('|改成','')}\\s*(?:(?:设计稿|设计|目录|文件|design|folder|file)\\s*)?${identity}(?=$|[\\s/的中里：:「『“"'\x60])`,'i').test(clause)
      ||new RegExp(`(?:把|将)\\s*(?:(?:设计稿|设计|目录|文件)\\s*)?${identity}[^\\n，。；,;]{0,40}${verb}`,'i').test(clause)
      ||new RegExp(`${verb}\\s+(?:[^\\n,;]{0,32}?\\s+)?(?:in|to|under)\\s+${identity}(?=$|[\\s/])`,'i').test(clause);
  });
}

function normalizeTarget(input,project,active){
  const target=clone(input.target||input.frozenTarget||{});
  for(const key of ['designId','pageId','scope','nodeIds','pageIds'])if(target[key]===undefined&&input[key]!==undefined)target[key]=clone(input[key]);
  target.pageId??=input.artboardId;
  target.projectId??=project.id;
  if(target.projectId!==project.id)fail('PROJECT_SCOPE','Submission and target project differ');
  const page=project.artboards?.find(p=>p.id===target.pageId&&!p.deletedAt);
  const file=project.workbench.files?.find(f=>f.id===target.fileId&&!f.removedAt);
  if(page){if(target.designId&&target.designId!==page.designId)fail('SCOPE_DENIED','Target page does not belong to the selected design');target.designId??=page.designId;}
  if(file){if(target.path&&target.path!==file.path)fail('SCOPE_DENIED','File target ID and path differ');target.path=file.path;}
  const fileTarget=!!(target.path||target.fileId),source=target.sourceProjectId??target.sourceId;
  if(fileTarget&&!source){const owner=project.workbench.designs?.find(d=>!d.deletedAt&&within(target.path,d.folder));target.designId=owner?.id;if(!owner&&target.scope==='design')target.scope='project';}
  if(!target.designId&&!fileTarget&&!target.pageId&&!['project','read'].includes(target.scope))target.designId=active?.id;
  target.scope??=target.pageId?'page':target.designId?'design':fileTarget?'project':input.mode==='generate'?'project':'read';
  if(source)target.scope='read';
  return target;
}

/** Ephemeral user confirmation capabilities. They never become model write grants. */
export class AITargetPolicy {
  constructor({now=()=>Date.now(),ttl=10*60*1000}={}){this.now=now;this.ttl=ttl;this.challenges=new Map();this.resolutions=new WeakSet();}
  owns(resolution){return !!resolution&&this.resolutions.has(resolution);}
  resolve(input,project,{policy,originUser=false}={}){
    // Older internal callers intentionally retain their existing explicit task contract.
    if(!own(input,'activeDesignId'))return this.result(input,null,null,false);
    const designs=(project.workbench.designs||[]).filter(d=>!d.deletedAt),activeId=input.activeDesignId;
    if(activeId!==null&&(typeof activeId!=='string'||!designs.some(d=>d.id===activeId)))fail('INVALID_ACTIVE_DESIGN','The active Design no longer exists; reopen the Design before submitting');
    const active=designs.find(d=>d.id===activeId),target=normalizeTarget(input,project,active);
    if(input.projectId&&input.projectId!==project.id)fail('PROJECT_SCOPE','Submission belongs to another project');
    if(input.sourceWrite||target.sourceWrite)fail('SCOPE_DENIED','Referenced projects and registered directories are read-only. Open their owning project to edit them.');
    const readonly=policy?.mode==='read-only'||target.scope==='read';
    if(readonly)return this.result({...input,target:{...target,scope:'read'},allowedPaths:[],sourceWrite:undefined},activeId,null,true);
    let proposedTarget=target,reason=null;
    const requestedDesign=target.designId?designs.find(d=>d.id===target.designId):null;
    if(target.designId&&!requestedDesign)fail('SCOPE_DENIED','Target Design no longer exists');
    // A direct instruction may identify a different target than the selected canvas.
    const named=designs.filter(d=>[d.name,d.folder].some(label=>writesLabel(input.prompt,label)));
    const commonFile=(project.workbench.files||[]).filter(f=>!f.removedAt&&!f.readonly&&!designs.some(d=>within(f.path,d.folder))).find(f=>writesLabel(input.prompt,f.path));
    if(named.length===1&&named[0].id!==target.designId){proposedTarget={projectId:project.id,designId:named[0].id,scope:'design'};reason='prompt-target-mismatch';}
    else if(commonFile&&!target.path){proposedTarget={projectId:project.id,path:commonFile.path,fileId:commonFile.id,scope:'project'};reason='prompt-target-mismatch';}
    const paths=input.allowedPaths??proposedTarget.allowedPaths??(proposedTarget.path?[proposedTarget.path]:[]);
    if(!Array.isArray(paths))fail('INVALID_INPUT','allowedPaths must be an array');
    if(!reason&&(proposedTarget.scope==='project'||!active||proposedTarget.designId&&proposedTarget.designId!==active.id||paths.some(p=>!within(p,active?.folder))||proposedTarget.path&&!within(proposedTarget.path,active?.folder)))reason=proposedTarget.scope==='project'?'project-scope':'active-design-mismatch';
    // A file inside another Design needs that Design's independent specification.
    if(proposedTarget.path){const owner=designs.find(d=>within(proposedTarget.path,d.folder));if(owner)proposedTarget={...proposedTarget,designId:owner.id};}
    if(!reason&&proposedTarget.designId!==active?.id)reason='active-design-mismatch';
    const resolvedInput={...input,target:proposedTarget};
    if(reason==='prompt-target-mismatch')for(const key of ['frozenTarget','designId','pageId','artboardId','nodeIds','pageIds','scope','selection'])delete resolvedInput[key];
    if(!reason)return this.result(resolvedInput,activeId,null,true);
    if(!originUser)fail('USER_ONLY','Only a user may confirm a different writable target');
    const payload=clone(input);delete payload.targetConfirmation;
    const fingerprint=digest({payload,projectId:project.id,projectRevision:project.revision,activeDesignId:activeId,proposedTarget});
    for(const [key,row]of this.challenges)if(row.expiresAt<=this.now())this.challenges.delete(key);
    const supplied=input.targetConfirmation,existing=typeof supplied==='string'?this.challenges.get(supplied):null;
    if(existing&&existing.fingerprint===fingerprint){
      return this.result(resolvedInput,activeId,{confirmed:true,reason,projectRevision:project.revision,requestedTarget:target,finalTarget:proposedTarget},true);
    }
    // Bound memory even when an untrusted caller repeatedly previews distinct drafts.
    while(this.challenges.size>=128)this.challenges.delete(this.challenges.keys().next().value);
    const token=randomUUID(),expiresAt=this.now()+this.ttl;
    this.challenges.set(token,{fingerprint,expiresAt});
    const design=designs.find(d=>d.id===proposedTarget.designId);
    fail('TARGET_CONFIRMATION_REQUIRED','写入意图与当前激活设计稿不同，请确认本次写入目标。',{
      token,expiresAt,projectId:project.id,projectRevision:project.revision,activeDesignId:activeId,reason,
      requestedTarget:clone(target),proposedTarget:clone(proposedTarget),
      message:proposedTarget.path?`本次将写入项目文件 ${proposedTarget.path}，请确认。`:proposedTarget.scope==='project'?'本次将允许修改当前项目的多个设计稿及公共文件，各设计稿使用各自规范，请确认。':`本次将写入设计稿「${design?.name||design?.id}」并使用其规范，请确认。`,
      ...(supplied?{confirmationInvalid:true}:{})
    });
  }
  result(input,activeDesignId,confirmation,enabled){const result=freeze({input:clone(input),activeDesignId,confirmation:clone(confirmation),enabled});this.resolutions.add(result);return result;}
}
