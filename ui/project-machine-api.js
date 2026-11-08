import {bindProjectApi} from './project-api.js';
const actions=new Set(['draft.get','draft.save','draft.remove','workspace.state.get','workspace.state.save']);
export const isProjectMachineAction=action=>actions.has(action);
const failure=(code,message)=>Object.assign(new Error(message),{code});
// Share the same formal preparation used by the visible native composer. Keep
// the binding in each queued request, rather than reading the active tab later.
export function createProjectMachineApi(api){
 const pending=new Map();
 const prepare=(args={})=>{
  const projectId=args.projectId;if(typeof projectId!=='string'||!projectId)return Promise.reject(failure('PROJECT_SCOPE','A project is required'));
  const key=JSON.stringify([projectId,Object.hasOwn(args,'contextSessionId')?args.contextSessionId:null]);
  if(pending.has(key))return pending.get(key);
  const request=Promise.resolve().then(()=>api('composer.prepare',args)).then(value=>{if(value?.projectId!==projectId)throw failure('PROJECT_SCOPE','Prepared Session belongs to another project');if(typeof value.sessionId!=='string'||!value.sessionId)throw failure('PROJECT_SESSION_REQUIRED','The project native Session is not ready');return value;});
  pending.set(key,request);request.catch(()=>{if(pending.get(key)===request)pending.delete(key);});return request;
 };
 return {prepare,async call(action,args={}){
  if(!actions.has(action))throw failure('ACTION_NOT_ALLOWED','This API only stores project view state and drafts');
  const {projectId}=args,prepared=await prepare({projectId});
  return bindProjectApi(api,{projectId,sessionId:prepared.sessionId})(action,args);
 }};
}
