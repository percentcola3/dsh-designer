import {bindProjectApi} from './project-api.js';
import {createProjectMachineApi,isProjectMachineAction} from './project-machine-api.js';

// Shared-library writes and a clone's destination are not in the source project.
export function workbenchActionScope(action,args={}){
 if(action.startsWith('composer.'))return 'raw';
 if(/^(group\.|system\.|ssh\.profile\.)/.test(action)||action.startsWith('knowledge.')&&action!=='knowledge.project.bind'||action==='reference.create'||action==='project.create'||action==='project.clone'||action==='project.initialize'&&!args.projectId)return 'library';
 return args.projectId?'project':'raw';
}
const failure=(code,message)=>Object.assign(new Error(message),{code});

/** Choose the action's owner before I/O. Never retry a denial under another identity. */
export function createWorkbenchApi(api){
 const machine=createProjectMachineApi(api);
 let libraryPending;
 const prepareLibrary=()=>{
  if(libraryPending)return libraryPending;
  const pending=Promise.resolve().then(()=>api('composer.prepare',{scope:'library'})).then(value=>{
   if(value?.scope!=='library'||typeof value.sessionId!=='string'||!value.sessionId||value.projectId)throw failure('LIBRARY_SCOPE','The library native Session is not ready');
   return value;
  });
  libraryPending=pending;pending.finally(()=>{if(libraryPending===pending)libraryPending=undefined;}).catch(()=>{});
  return pending;
 };
 const bind=async(action,args)=>{
  if(Object.hasOwn(args,'contextSessionId'))return args;
  const scope=workbenchActionScope(action,args);
  if(scope==='library'){const prepared=await prepareLibrary();return {...args,contextSessionId:prepared.sessionId};}
  if(scope==='project'){const prepared=await machine.prepare({projectId:args.projectId});return {...args,contextSessionId:prepared.sessionId};}
  return args;
 };
 const call=async(action,args={})=>{
  if(action==='composer.prepare'&&args.projectId)return args.refresh===true?api(action,args):machine.prepare(args);
  if(Object.hasOwn(args,'contextSessionId'))return api(action,args);
  if(isProjectMachineAction(action))return machine.call(action,args);
  const input=await bind(action,args);
  if(workbenchActionScope(action,args)==='project'&&!Object.hasOwn(args,'contextSessionId'))return bindProjectApi(api,{projectId:args.projectId,sessionId:input.contextSessionId})(action,args);
  return api(action,input);
 };
 if(typeof api.upload==='function')call.upload=async(file,args={})=>api.upload(file,await bind(['system-package','system-import'].includes(args.purpose)?'system.upload':args.knowledgeId||args.batchId||args.purpose==='knowledge'?'knowledge.upload':'upload',args));
 return call;
}
