import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkbenchApi,workbenchActionScope} from './workbench-api.js';

function fixture(){const calls=[];const api=async(action,args)=>{calls.push({action,args});if(action==='composer.prepare')return args.scope==='library'?{scope:'library',sessionId:'library-owner'}:{projectId:args.projectId,sessionId:'native-'+args.projectId};return {saved:true};};api.upload=async(file,args)=>{calls.push({action:'upload',file,args});return {saved:true};};return {calls,api,call:createWorkbenchApi(api)};}

test('all project writes select their exact native owner before the first request',async()=>{
 const f=fixture();for(const action of ['file.write','edit.viewport','export.create','package.export','project.update','knowledge.project.bind'])await f.call(action,{projectId:'p-one',expectedRevision:3});
 assert.equal(f.calls.filter(c=>c.action==='composer.prepare').length,1);
 for(const c of f.calls.filter(c=>c.action!=='composer.prepare'))assert.equal(c.args.contextSessionId,'native-p-one');
 await f.call('file.write',{projectId:'p-two'});assert.equal(f.calls.at(-1).args.contextSessionId,'native-p-two');
});
test('shared systems, knowledge, manual creation and clone use the library, not the source project',async()=>{
 const f=fixture();for(const action of ['system.create','knowledge.import.git','project.create','project.clone','group.create'])await f.call(action,action==='project.clone'?{projectId:'p-source'}:{});
 assert.equal(f.calls.filter(c=>c.action==='composer.prepare').length,5);
 for(const c of f.calls.filter(c=>c.action!=='composer.prepare'))assert.equal(c.args.contextSessionId,'library-owner');
 assert.equal(workbenchActionScope('knowledge.project.bind',{projectId:'p-source'}),'project');
});
test('explicit authority is preserved exactly and denials never retry under another identity',async()=>{
 const f=fixture();for(const action of ['file.write','draft.save','workspace.state.save'])for(const contextSessionId of ['explicit-readonly',null,''])await f.call(action,{projectId:'p-one',contextSessionId});
 assert.equal(f.calls.length,9);assert.deepEqual(f.calls.map(c=>c.args.contextSessionId),Array.from({length:3},()=>['explicit-readonly',null,'']).flat());
 const calls=[],failure=Object.assign(Error('Denied'),{code:'FS_SANDBOX_DENIED'}),call=createWorkbenchApi(async(action,args)=>{calls.push({action,args});if(action==='composer.prepare')return {projectId:'p-one',sessionId:'native-p-one'};throw failure;});
 await assert.rejects(call('file.write',{projectId:'p-one'}),error=>error===failure);assert.deepEqual(calls.map(c=>c.action),['composer.prepare','file.write']);
});
test('concurrent library admission shares one preparation; later actions revalidate, upload captures its owner',async()=>{
 const f=fixture();await Promise.all([f.call('system.create',{}),f.call('knowledge.create',{})]);assert.equal(f.calls.filter(c=>c.action==='composer.prepare').length,1);
 await f.call.upload({name:'a.txt'},{projectId:'p-one'});assert.equal(f.calls.at(-1).args.contextSessionId,'native-p-one');
 await f.call.upload({name:'a.txt'},{batchId:'batch-one'});assert.equal(f.calls.at(-1).args.contextSessionId,'library-owner');
 for(const purpose of ['system-package','system-import']){await f.call.upload({name:'system.json'},{purpose});assert.equal(f.calls.at(-1).args.contextSessionId,'library-owner');}
});
test('invalid preparation cannot send a mutation or retain a rejected library admission',async()=>{
 const calls=[],call=createWorkbenchApi(async(action,args)=>{calls.push(action);return {sessionId:'foreign'};});
 await assert.rejects(call('system.create',{}),{code:'LIBRARY_SCOPE'});await assert.rejects(call('system.create',{}),{code:'LIBRARY_SCOPE'});assert.deepEqual(calls,['composer.prepare','composer.prepare']);
});

test('recycle-bin restore prepares the library owner without opening a deleted project Session',async()=>{
 const f=fixture();await f.call('project.restore',{projectId:'p-deleted',expectedRevision:9});
 assert.deepEqual(f.calls.map(c=>c.action),['composer.prepare','project.restore']);
 assert.equal(f.calls[0].args.scope,'library');assert.equal(f.calls[1].args.contextSessionId,'library-owner');
});
