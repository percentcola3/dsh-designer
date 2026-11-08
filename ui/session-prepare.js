const transientRejections=new Set(['UNKNOWN_ACTION','SERVICE_DISPOSED']);
export function waitForComposerRetry(delay,signal){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{let timer;const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason||new DOMException('Aborted','AbortError'));};timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);signal?.addEventListener('abort',abort,{once:true});});
}
// Retry only explicit service rejections during a plugin handover. Never fall
// back to a different Session or retry a permission/ownership failure.
export async function prepareComposerSession(api,args,{signal,wait=waitForComposerRetry}={}){
 const delays=[200,600,1200];
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{const result=await api('composer.prepare',args);signal?.throwIfAborted();return result;}
  catch(error){signal?.throwIfAborted();if(!transientRejections.has(error?.code)||attempt>=delays.length)throw error;await wait(delays[attempt],signal);}
 }
}
