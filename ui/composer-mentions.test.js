import test from 'node:test';
import assert from 'node:assert/strict';
import {detectMention, applyInsertion, appendReference, mentionCandidates} from './composer-mentions.js';

test('knowledge mentions stay project-scoped, hide unavailable libraries and refresh only explicit library selections',()=>{
  const knowledge=[{id:'k-business',name:'业务代码',contentRevision:3},{id:'k-broken',name:'业务坏库',unavailable:true},{id:'k-archived',name:'业务归档',archived:true},{id:'k-business',name:'业务重复'}];
  assert.deepEqual(mentionCandidates({variant:'canvas',projectId:'p-current',knowledge,query:'业务'}).map(x=>[x.kind,x.item.id]),[['knowledge','k-business']]);
  assert.deepEqual(mentionCandidates({variant:'home',knowledge,query:''}),[]);
  assert.deepEqual(mentionCandidates({variant:'canvas',knowledge,query:''}),[]);
  const old={type:'knowledge',projectId:'p-current',knowledgeId:'k-business',resourceId:'knowledge:k-business',sourceVersion:2,readonly:true},refs=[old],fresh={...old,sourceVersion:3};
  assert.equal(appendReference(refs,{...old,label:'新名称'}),refs);assert.deepEqual(appendReference(refs,fresh),[fresh]);assert.equal(refs[0],old);
  assert.equal(appendReference(refs,{...fresh,projectId:'p-other'}).length,2);
});

test('@ detection accepts independent queries and excludes email, nested @ and selections', () => {
  assert.deepEqual(detectMention('@项目', 3), {start: 0, end: 3, query: '项目'});
  assert.deepEqual(detectMention('说明（ @src/app', 12), {start: 4, end: 12, query: 'src/app'});
  assert.deepEqual(detectMention('设计 @', 4), {start: 3, end: 4, query: ''});
  for (const value of ['a@example.com', 'hello@p', '@@p', '@a b', 'https://x/@a']) assert.equal(detectMention(value, value.length), null);
  assert.equal(detectMention('@hello', 3, 4), null);
  assert.equal(detectMention('@hello', -1), null);
});

test('insertion uses owner/revision CAS and preserves Unicode text outside the selected span', () => {
  const owner = {}, current = {owner, revision: 2, mounted: true, editable: true, composing: false, value: '🌱草稿'};
  const span = {owner, revision: 2, start: 2, end: 3};
  assert.deepEqual(applyInsertion(current, '新', span), {value: '🌱新稿', caret: 3});
  for (const change of [{owner: {}}, {revision: 3}, {mounted: false}, {editable: false}, {composing: true}]) assert.equal(applyInsertion({...current, ...change}, '新', span), null);
  for (const change of [{start: -1}, {end: 99}, {start: 4, end: 2}, {start: 1.5}]) assert.equal(applyInsertion(current, '新', {...span, ...change}), null);
  assert.equal(applyInsertion(current, '超长文本', span, 4), null);
  assert.equal(current.value, '🌱草稿');
});

test('returning to an old draft does not make an older captured revision valid', () => {
  const owner = {}, span = {owner, revision: 1, start: 0, end: 0};
  assert.equal(applyInsertion({owner, revision: 3, mounted: true, editable: true, value: ''}, 'voice', span), null);
  assert.deepEqual(applyInsertion({owner, revision: 3, mounted: true, editable: true, value: ''}, 'voice', {...span, revision: 3}), {value: 'voice', caret: 5});
});

test('references deduplicate stable identity without replacing an existing frozen version', () => {
  const existing = [{type: 'file', projectId: 'p', fileId: 'f', sourceVersion: 'old'}];
  assert.equal(appendReference(existing, {...existing[0], sourceVersion: 'new'}), existing);
  assert.equal(appendReference([{type: 'file', resourceId: 'f', sourceVersion: 'old'}], existing[0]).length, 1);
  assert.equal(appendReference(existing, {...existing[0], fileId: 'other'}).length, 2);
  const project = [{type: 'project', referencedProjectId: 'q', resourceId: 'project:q', sourceVersion: 1}];
  assert.equal(appendReference(project, {...project[0], sourceVersion: 2}), project);
  const directory=[{type:'directory',projectId:'p',resourceId:'directory:root',label:'Knowledge',rootPath:'/knowledge',readonly:true}];
  assert.equal(appendReference(directory,{...directory[0],label:'Renamed label'}),directory);
  assert.equal(appendReference(directory,{...directory[0],projectId:'other'}).length,2);
});

test('home excludes files; canvas filters unavailable entries and uses stable file IDs', () => {
  const input = {projectId: 'p', projects: [{id: 'p', revision: 1}, {id: 'q', name: 'Other', revision: 2}, {id: 'archived', revision: 1, archived: true}, {id: 'missing-version'}], files: [{id: 'dir', type: 'directory', name: 'src', children: [{fileId: 'f', name: 'App.jsx'}, {id: 'removed', name: 'Gone', removedAt: 'now'}]}, {path: 'unstable.txt'}, {id: 'gone', unavailable: true}]};
  assert.deepEqual(mentionCandidates({...input, variant: 'home'}).map(c => c.kind), ['project']);
  assert.deepEqual(mentionCandidates({...input, variant: 'canvas', query: 'src/app'}).map(c => c.item.fileId), ['f']);
  assert.deepEqual(mentionCandidates({...input, variant: 'canvas'}).map(c => c.kind), ['project', 'file']);
});
