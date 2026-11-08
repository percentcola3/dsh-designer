// A refresh can join a catalog pull that started before composer.prepare. Only
// the SDK's exact synchronous unknown-ID error permits one fresh catalog pull.
const isUnknownSession=(error,id)=>typeof id==='string'&&error instanceof Error&&error.name==='Error'&&error.code===undefined&&error.cause===undefined&&error.message===`sessions.retain: unknown session ${id}`;

// The public list exposes arrival phase, not the manager's private listError.
// Pending after a settled refresh is catalog unavailability, not proof that the
// saved Session was deleted. Preserve the exact unknown error as its cause.
function catalogFailure(sessions,id,cause){
  if(sessions.list?.getSnapshot?.()?.phase!=='pending')return cause;
  return Object.assign(new Error('原生会话目录暂不可用，请稍后重试。',{cause}),{code:'CLIENT_SESSION_CATALOG_UNAVAILABLE',sessionId:id});
}

// Releasing this reference only releases UI ownership; it never cancels execution.
export async function acquireProjectSession(sessions,id,signal) {
  signal?.throwIfAborted();
  for(let attempt=0;attempt<2;attempt++){
    await sessions.refresh(); // Public refresh rejections retain their original identity.
    signal?.throwIfAborted();
    try{
      const reference=sessions.retain(id,{source:'controllerOperation',signal});
      try{signal?.throwIfAborted();return reference;}catch(error){reference.release();throw error;}
    }catch(error){
      if(!isUnknownSession(error,id))throw error;
      const failure=catalogFailure(sessions,id,error);
      if(failure!==error||attempt===1)throw failure;
      signal?.throwIfAborted();
    }
  }
}

// `ready` can resolve with openState:error. A failed UI history opening is not
// a Host cancellation and must never be translated into a cancelled task.
export async function readyProjectSession(reference,sessions){
  try{
    const binding=await reference.ready;
    if(!binding||reference.binding!==binding||sessions.binding(reference.sessionId)!==binding)throw new Error('Designer Session reference belongs to an expired generation');
    const snapshot=binding.session.getSnapshot();
    if(snapshot.openState==='error')throw snapshot.openError instanceof Error?snapshot.openError:Object.assign(new Error(snapshot.openError?.message||'Designer Session history could not open'),{cause:snapshot.openError});
    return binding;
  }catch(error){reference.release();throw error;}
}
