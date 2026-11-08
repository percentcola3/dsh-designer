import test from 'node:test';
import assert from 'node:assert/strict';
import {invalidateIdentityState} from './identity-state.js';

test('identity repair clears only affected view selections and marks original refs without remapping IDs',()=>{
 const state={tabs:[{id:'a',type:'canvas',selection:{pageId:'a',nodeIds:['old']}},{id:'b',type:'canvas',selection:{pageId:'b',nodeIds:['kept']}}],target:{projectId:'p',designId:'d',pageId:'a',nodeIds:['old'],scope:'selection'},references:[{pageId:'a',nodeIds:['old'],label:'original'},{pageId:'b',nodeIds:['kept']}]};
 const next=invalidateIdentityState(state,{pageIds:['a'],designIds:['d']});
 assert.equal(next.tabs[0].selection,null);assert.equal(next.tabs[1],state.tabs[1]);assert.equal(next.target.scope,'read');assert.equal(next.target.nodeIds,undefined);assert.equal(next.references[0].stale,true);assert.deepEqual(next.references[0].nodeIds,['old']);assert.equal(next.references[0].label,'original');assert.equal(next.references[1],state.references[1]);assert.deepEqual(state.tabs[0].selection.nodeIds,['old']);
});

test('repairing Canvas nodes cannot steal an independent exact source target or immutable source snapshot',()=>{
 const target={type:'source-file',sourceId:'r',path:'src/App.tsx',scope:'project',sourceWrite:{sourceProjectId:'r',paths:['src/App.tsx']}};
 const source={type:'source-region',pageId:'a',sourceId:'source',sourceVersion:'version',captureId:'capture'};
 const next=invalidateIdentityState({tabs:[],target,references:[source]},{pageIds:['a'],designIds:['d']});
 assert.equal(next.target,target);assert.equal(next.references[0],source);
});

test('a previously broad grant covering repaired identities is narrowed to analysis',()=>{
 const next=invalidateIdentityState({tabs:[],target:{projectId:'p',designId:'d',scope:'design',scopeChoice:{id:'old'}},references:[]},{pageIds:['a'],designIds:['d']});
 assert.equal(next.target.scope,'read');assert.equal(next.target.scopeChoice,undefined);
});
