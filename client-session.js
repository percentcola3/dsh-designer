import {setTimeout as delay} from 'node:timers/promises';
import {fail,text} from './store.js';

// A view owns its wait, not the shared Native Agent's creation/restoration.
export function waitForSession(operation,signal){
  if(!signal)return operation;
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    operation.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}
function sameSessionFailure(error,sessionId){
  const identified=error?.sessionId??error?.details?.sessionId??error?.data?.sessionId;
  return identified===undefined||identified===sessionId;
}
function missingSession(error,sessionId){return error?.code==='session/not-found'&&sameSessionFailure(error,sessionId);}
function ownershipConflict(error,sessionId){
  if(error?.code!==undefined&&error.code!=='session/writer-held'||!sameSessionFailure(error,sessionId))return false;
  return error?.code==='session/writer-held'||error?.name==='SessionAlreadyOwnedError'||error?.name==='SessionAlreadyExistsError'||error?.message===`session "${sessionId}" already exists`||error?.message===`agent "${sessionId}" is already registered`;
}

/** Resolve the exact persisted identity. Never use createSession: it may mint a replacement. */
export class ExactSessionAgents {
  #pending=new Map();
  constructor(owner,{retryDelays=[25,50,100,200,400,800]}={}){this.owner=owner;this.retryDelays=retryDelays;}
  resolve(sessionId,{signal,create}={}){
    text(sessionId,'sessionId',200);signal?.throwIfAborted();this.owner.lifetime?.signal.throwIfAborted();
    if(this.owner.disposed)fail('SERVICE_DISPOSED','The Designer service stopped');
    let pending=this.#pending.get(sessionId);
    if(!pending){
      pending={create};pending.operation=Promise.resolve().then(()=>this.#resolve(sessionId,pending));
      this.#pending.set(sessionId,pending);
      const forget=()=>{if(this.#pending.get(sessionId)===pending)this.#pending.delete(sessionId);};
      pending.operation.then(forget,forget);
    }else if(create&&!pending.create)pending.create=create;
    return waitForSession(pending.operation,signal);
  }
  async #resolve(sessionId,pending){
    const signal=this.owner.lifetime?.signal,ctx=this.owner.ctx;let created=false,ownershipFailure;
    for(let attempt=0;;attempt++){
      signal?.throwIfAborted();if(this.owner.disposed)fail('SERVICE_DISPOSED','The Designer service stopped');
      let failure;
      try{
        const result=await ctx.sessionController.resolveAgent(sessionId);
        if(result.agent)return this.#exact(result.agent,sessionId);
        failure=result.error;
        if(missingSession(failure,sessionId)&&pending.create&&!created&&!ownershipFailure){
          // Re-check through Native resolution on ownership races; never claim a second writer.
          created=true;
          try{return this.#exact(await pending.create(signal),sessionId);}catch(error){
            if(!ownershipConflict(error,sessionId))throw error;
            failure=error;
          }
        }
      }catch(error){failure=error;}
      if(ownershipConflict(failure,sessionId))ownershipFailure??=failure;
      // A stale negative observation cannot revoke proven same-ID writer ownership.
      // Keep only that original conflict through the bounded publication window.
      else if(ownershipFailure&&missingSession(failure,sessionId))failure=ownershipFailure;
      if(!ownershipConflict(failure,sessionId)||attempt>=this.retryDelays.length)throw failure||new Error('Native Session resolution failed');
      await delay(this.retryDelays[attempt],undefined,signal?{signal}:undefined);
    }
  }
  #exact(agent,sessionId){
    if(agent?.id!==sessionId||agent.session?.id!==sessionId)fail('COMPOSER_SESSION_INVALID','Native resolution returned a different Session');
    return agent;
  }
}
