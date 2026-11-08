import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {projectPolicy} from './project-policy.js';
const fs={async resolve(value){return {key:path.resolve(value.replace('/alias-project','/workspace/project'))}},contains(a,b){return b.key===a.key||b.key.startsWith(a.key+'/');},processPath:t=>t.key};
test('project operations intersect native roots and remove unrelated writable roots without mutation',async()=>{
  const parent={mode:'workspace-write',workspaceRoot:'/workspace',additionalWritableRoots:['/knowledge','/other'],sessionId:'native'};
  const before=structuredClone(parent),scoped=await projectPolicy(fs,parent,'/alias-project');
  assert.deepEqual(scoped,{mode:'workspace-write',workspaceRoot:'/workspace/project',additionalWritableRoots:[],sessionId:'native'});assert.deepEqual(parent,before);
});
test('Full access becomes project workspace-write; readonly cannot be raised by opening a project',async()=>{
  assert.equal((await projectPolicy(fs,{mode:'danger-full-access',workspaceRoot:'/elsewhere'},'/workspace/project')).mode,'workspace-write');
  assert.equal((await projectPolicy(fs,{mode:'read-only',workspaceRoot:'/workspace'},'/workspace/project')).mode,'read-only');
});
test('a project outside every native grant stays read-only even when selected',async()=>{
  const outside=await projectPolicy(fs,{mode:'workspace-write',workspaceRoot:'/elsewhere',additionalWritableRoots:['/external']},'/workspace/project');assert.equal(outside.mode,'read-only');assert.deepEqual(outside.additionalWritableRoots,[]);
  assert.equal((await projectPolicy(fs,{mode:'workspace-write',workspaceRoot:'/elsewhere',additionalWritableRoots:['/workspace/project']},'/workspace/project')).mode,'workspace-write');
});
