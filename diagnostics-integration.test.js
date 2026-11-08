import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAction,SCOPED_ACTIONS} from './ai-workbench.js';
import {DesignerService,designerMetadata} from './index.js';

const task={projectId:'p-diagnostic',scope:'read',pageIds:[],nodeIds:[],refs:[],designIds:[]};

test('diagnostic tools remain read actions in readonly and exact-file tasks',()=>{
  for(const action of ['diagnostics.run','diagnostics.catalog','diagnostics.guide']){
    assert.ok(SCOPED_ACTIONS.read.includes(action));
    for(const frozen of [task,{...task,scope:'selection',contentOnly:true},{...task,authority:{kind:'project-file',path:'docs/rules.md',readonly:true}}]){
      const result=assertAction({action,projectId:task.projectId},{task:frozen,policy:{mode:'read-only'}});
      assert.equal(result.readonly,true);
    }
    assert.throws(()=>assertAction({action,projectId:'p-other'},{task}),{code:'PROJECT_SCOPE'});
  }
  assert.throws(()=>assertAction({action:'diagnostics.repair',projectId:task.projectId},{task,policy:{mode:'read-only'}}),{code:'SCOPE_DENIED'});
});

test('global diagnostic routing uses current caller authority and does not manufacture owner access',async()=>{
  const service=Object.create(DesignerService.prototype),seen=[];
  Object.assign(service,{disposed:false,lifetime:new AbortController(),bindings:new Map(),permissionPolicy:async()=>({mode:'read-only'}),aiWorkbench:{taskFor:()=>undefined},diagnostics:{execute:async(input,env)=>{seen.push({input,env});return {readOnly:true,scope:{kind:'environment'}};}},store:{}});
  const value=await service.executeOperation({action:'diagnostics.run',categories:['environment']},{user:false,permissionAgent:{id:'ordinary'}});
  assert.equal(value.readOnly,true);assert.equal(seen.length,1);assert.equal(seen[0].env.user,false);assert.equal(seen[0].env.task,undefined);assert.equal(seen[0].env.policy.mode,'read-only');
  assert.ok(service.isWorkbenchAction('diagnostics.run'));assert.ok(service.isWorkbenchAction('diagnostics.catalog'));
});

test('discovery advertises diagnostics without adding a global tool or claiming automatic repair',()=>{
  const service=Object.create(DesignerService.prototype);service.instanceId='diagnostic-instance';
  const tool=service.workbenchTool();assert.equal(tool.name,'designer_workbench');assert.match(tool.description,/diagnostics\.run/);assert.match(tool.description,/diagnostics\.catalog\/guide/);
  assert.ok(designerMetadata(service).capabilities.includes('diagnostics-readonly'));
  assert.ok(designerMetadata(service).capabilities.includes('optimization-guides'));
});
