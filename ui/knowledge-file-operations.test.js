import test from 'node:test';
import assert from 'node:assert/strict';
import {KNOWLEDGE_TRANSFER_PREFIX, knowledgeTransfer, parseKnowledgeTransfer, knowledgePastePaths, availableKnowledgePath, knowledgeDroppedFiles} from './knowledge-file-operations.js';

const hash='a'.repeat(64);
const documents=[{id:'d-one',relativePath:'docs/a.md',sha256:hash},{id:'d-two',relativePath:'docs/nested/b.md',sha256:hash}];

test('file clipboard payloads preserve exact original identities and validate before use',()=>{
 const payload=knowledgeTransfer('k-source',documents,{folder:'docs',cut:true});
 assert.deepEqual(parseKnowledgeTransfer(KNOWLEDGE_TRANSFER_PREFIX+JSON.stringify(payload)),payload);
 assert.equal(parseKnowledgeTransfer(JSON.stringify({...payload,cut:'true'})),null);
 assert.equal(parseKnowledgeTransfer(JSON.stringify({...payload,folder:'../bad'})),null);
 assert.equal(parseKnowledgeTransfer(JSON.stringify({...payload,files:[payload.files[0],payload.files[0]]})),null);
 assert.equal(parseKnowledgeTransfer('an ordinary text clipboard'),null);
});

test('copies choose one new folder root, preserve nested structure and never overwrite an existing file',()=>{
 const payload=knowledgeTransfer('k-source',documents,{folder:'docs'});
 const files=knowledgePastePaths(payload,'target',[{relativePath:'target/docs/original.md'}]);
 assert.deepEqual(files.map(file=>file.relativePath),['target/docs (2)/a.md','target/docs (2)/nested/b.md']);
 assert.deepEqual(files.map(file=>file.documentId),['d-one','d-two']);
 assert.equal(availableKnowledgePath('a.md',['a.md','a (2).md']),'a (3).md');
 assert.throws(()=>availableKnowledgePath('docs/a.md',['docs']),/同名文件/);
});

test('multi-selection across folders retains their shared hierarchy and legacy duplicate paths stay distinct',()=>{
 const payload=knowledgeTransfer('k-source',[...documents,{id:'d-other',relativePath:'other/c.md',sha256:hash}]);
 assert.equal(payload.basePath,'');
 assert.ok(parseKnowledgeTransfer(JSON.stringify(payload)));
 const duplicate=knowledgeTransfer('k-source',[documents[0],{...documents[0],id:'d-duplicate'}]);
 const copied=knowledgePastePaths(duplicate,'',[]);
 assert.deepEqual(copied.map(file=>file.relativePath),['a.md','a (2).md']);
});

test('cut moves preserve destination names and reject moving a directory into itself',()=>{
 const payload=knowledgeTransfer('k-source',documents,{folder:'docs',cut:true});
 assert.throws(()=>knowledgePastePaths(payload,'docs/nested',documents,true),/自身/);
 assert.deepEqual(knowledgePastePaths(payload,'archive',documents,true).map(file=>file.relativePath),['archive/docs/a.md','archive/docs/nested/b.md']);
});

test('directory drops exhaust all reader pages and skip hidden and dependency directories',async()=>{
 const reads=[];
 const file=(name)=>({name,isFile:true,file(resolve){reads.push(name);resolve(new File(['text'],name,{type:'text/plain'}));}});
 const directory=(name,children)=>({name,isDirectory:true,createReader(){let page=0;return {readEntries(resolve){resolve(page++<children.length?[children[page-1]]:[]);}};}});
 const root=directory('docs',[file('a.md'),directory('nested',[file('b.md')]),directory('node_modules',[file('dependency.js')]),directory('.git',[file('config')])]);
 const files=await knowledgeDroppedFiles({items:[{webkitGetAsEntry:()=>root}]});
 assert.deepEqual(files.map(file=>file.relativePath),['docs/a.md','docs/nested/b.md']);
 assert.deepEqual(reads,['a.md','b.md']);
});
