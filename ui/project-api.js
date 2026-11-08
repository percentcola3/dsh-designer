function scopeError(message){return Object.assign(new Error(message),{code:'PROJECT_SCOPE'});}

/** Bind a project surface before its first request; never retry with another Session. */
export function bindProjectApi(api,{projectId,sessionId}){
  if(typeof api!=='function')throw new TypeError('A Designer API function is required');
  if(typeof projectId!=='string'||!projectId)throw scopeError('A project is required');
  const bind=args=>{
    const input=args||{};
    if(input.projectId!==undefined&&input.projectId!==projectId)throw scopeError('This API belongs to another project');
    if(typeof sessionId!=='string'||!sessionId)throw Object.assign(new Error('The project native Session is not ready'),{code:'PROJECT_SESSION_REQUIRED'});
    // A surface owns one prepared native Session. Explicit args cannot change it.
    if(Object.hasOwn(input,'contextSessionId')&&input.contextSessionId!==sessionId)throw scopeError('This API belongs to another native Session');
    return {...input,projectId,contextSessionId:sessionId};
  };
  const bound=(action,args={})=>api(action,bind(args));
  if(typeof api.upload==='function')bound.upload=(file,args={})=>api.upload(file,bind(args));
  return bound;
}
