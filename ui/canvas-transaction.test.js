import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasTransaction} from './canvas-transaction.js';
const latest={project:{revision:20},design:{id:'design-new'},pages:[{id:'page',designId:'design-new',revision:12}],documents:{page:{version:'fs-new'}}};

test('older frozen Canvas basis survives newer UI metadata without implicit rebase',()=>{
 const change={pageId:'page',designId:'design-frozen',operations:[{type:'text',nodeIds:['n'],value:'draft'}],expectedRevision:7,expectedArtboardRevision:4,expectedVersion:'fs-old'};
 const result=canvasTransaction(change,latest);
 assert.equal(result.expectedRevision,7);assert.equal(result.expectedArtboardRevision,4);assert.equal(result.expectedVersion,'fs-old');assert.equal(result.expectedFsVersion,'fs-old');assert.equal(result.designId,'design-frozen');assert.equal(result.operations,change.operations);
});

test('explicit invalid frozen values remain invalid instead of acquiring current authority',()=>{
 const result=canvasTransaction({pageId:'page',expectedRevision:null,expectedArtboardRevision:undefined,expectedVersion:null,expectedFsVersion:'metadata-only'},latest);
 assert.equal(result.expectedRevision,null);assert.equal(result.expectedArtboardRevision,undefined);assert.equal(result.expectedVersion,null);assert.equal(result.expectedFsVersion,'metadata-only');
});

test('only an operation without a frozen basis receives the currently visible basis',()=>{
 const result=canvasTransaction({pageId:'page',operations:[]},latest);
 assert.equal(result.expectedRevision,20);assert.equal(result.expectedArtboardRevision,12);assert.equal(result.expectedVersion,'fs-new');assert.equal(result.designId,'design-new');
 const legacy=canvasTransaction({pageId:'page',expectedFsVersion:'fs-legacy'},latest);
 assert.equal(legacy.expectedVersion,'fs-legacy');
});
