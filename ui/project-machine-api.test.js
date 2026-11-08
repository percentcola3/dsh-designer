import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectMachineApi} from './project-machine-api.js';
test('native composer and draft persistence share one preparation before first write',async()=>{
 const calls=[];const client=createProjectMachineApi(async(action,args)=>{calls.push([action,args]);return action==='composer.prepare'?{projectId:args.projectId,sessionId:'native-project'}:{version:'v1'};});
 const [ready,saved]=await Promise.all([client.prepare({projectId:'p-one'}),client.call('draft.save',{projectId:'p-one',resourceId:'ai-compose',draft:{prompt:'Keep me'},expectedVersion:null})]);
 assert.equal(ready.sessionId,'native-project');assert.equal(saved.version,'v1');assert.deepEqual(calls.map(c=>c[0]),['composer.prepare','draft.save']);assert.equal(calls[1][1].contextSessionId,'native-project');
});
test('a queued save retains its own project identity while another tab prepares',async()=>{
 const pending=new Map(),writes=[];const client=createProjectMachineApi(async(action,args)=>{if(action==='composer.prepare')return new Promise(resolve=>pending.set(args.projectId,resolve));writes.push(args);return {version:'saved'};});
 const a=client.call('draft.save',{projectId:'p-a',draft:{prompt:'A'}}),b=client.call('workspace.state.save',{projectId:'p-b',state:{tabs:[]}});await Promise.resolve();
 pending.get('p-b')({projectId:'p-b',sessionId:'session-b'});pending.get('p-a')({projectId:'p-a',sessionId:'session-a'});await Promise.all([a,b]);assert.deepEqual(writes.map(w=>[w.projectId,w.contextSessionId]).sort(),[['p-a','session-a'],['p-b','session-b']]);
});
test('sandbox refusal is surfaced without preparing or retrying with another identity',async()=>{
 const calls=[];const denied=Object.assign(new Error('denied'),{code:'FS_SANDBOX_DENIED'});const client=createProjectMachineApi(async(action,args)=>{calls.push([action,args]);if(action==='composer.prepare')return {projectId:args.projectId,sessionId:'same-native'};throw denied;});
 await assert.rejects(client.call('draft.save',{projectId:'p-one'}),error=>error===denied);assert.equal(calls.length,2);assert.equal(calls[1][1].contextSessionId,'same-native');
});
test('foreign or missing preparation prevents publication and ordinary business actions stay outside this API',async()=>{
 for(const prepared of [{projectId:'p-other',sessionId:'foreign'},{projectId:'p-one'}]){let calls=0;const client=createProjectMachineApi(async()=>{calls++;return prepared;});await assert.rejects(client.call('draft.save',{projectId:'p-one'}));assert.equal(calls,1);}
 const client=createProjectMachineApi(()=>assert.fail('must not publish'));await assert.rejects(client.call('project.clone',{projectId:'p-one'}),{code:'ACTION_NOT_ALLOWED'});
});
