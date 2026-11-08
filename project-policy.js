import {policyAllowsTarget,fail} from './store.js';

/** Intersect native permission with the canonical project root for each call.
 * Readable knowledge never appears in additionalWritableRoots. */
export async function projectPolicy(fs,parent,physicalRoot,signal){
  if(!parent)fail('POLICY_REQUIRED','Project tools require the native permission policy');
  const root=await fs.resolve(physicalRoot,{signal});
  const allowed=await policyAllowsTarget(fs,parent,root,signal);
  return {...parent,mode:parent.mode==='read-only'||!allowed?'read-only':'workspace-write',workspaceRoot:fs.processPath(root),additionalWritableRoots:[]};
}
