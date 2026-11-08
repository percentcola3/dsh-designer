import test from 'node:test';
import assert from 'node:assert/strict';
import {skillFileDraft,skillFileDraftChanged,downloadedSkillFileDraft} from './skill-file-draft.js';

const valid={name:'design-review',description:'检查设计规范与交互。',instructions:'# 审查\n\n先检查，再提出具体修改。'};
test('a download uses a flat Markdown filename and complete native frontmatter with the real body',()=>{
  const file=skillFileDraft(valid),lines=file.content.split('\n');
  assert.equal(file.name,'design-review.md');assert.equal(file.mimeType,'text/markdown;charset=utf-8');
  assert.equal(lines[0],'---');assert.equal(lines[3],'---');
  assert.equal(JSON.parse(lines[1].slice('name: '.length)),valid.name);
  assert.equal(JSON.parse(lines[2].slice('description: '.length)),valid.description);
  assert.equal(lines.slice(5).join('\n'),valid.instructions+'\n');
});

test('quotes, newlines, frontmatter delimiters, YAML tags and Unicode separators cannot inject metadata',()=>{
  const description='a "quote": yes\n---\nname: attacker\n!!js/function &anchor *alias\r\nuser-invocable: false\u2028next\u2029end';
  const file=skillFileDraft({...valid,description}),lines=file.content.split('\n');
  assert.equal(lines[3],'---');assert.equal(JSON.parse(lines[2].slice('description: '.length)),description);
  assert.equal(lines.slice(0,4).filter(line=>line==='---').length,2);
  assert.ok(!lines[2].includes('\u2028'));assert.ok(!lines[2].includes('\u2029'));
  assert.equal(lines.filter(line=>line.startsWith('name: ')).length,1);
});

test('names cannot escape the download directory, inject markup or exceed native name bounds',()=>{
  for(const name of ['', '../escape','/absolute','nested/name','nested\\name','bad.md','has space','UPPER','-leading','trailing-','two--dashes','a\nname','a\0b','a'.repeat(65),'💡'])assert.throws(()=>skillFileDraft({...valid,name}),{code:'INVALID_SKILL_FILE'});
  assert.equal(skillFileDraft({...valid,name:'a'.repeat(64)}).name,'a'.repeat(64)+'.md');
});

test('required descriptions and bodies reject invalid or unbounded drafts without producing partial files',()=>{
  for(const description of ['', '   ',null,'x'.repeat(4001),'a\0b'])assert.throws(()=>skillFileDraft({...valid,description}),error=>error.code==='INVALID_SKILL_FILE'&&error.details.field==='description');
  for(const instructions of ['', '\n ',null,'x'.repeat(200001),'a\0b'])assert.throws(()=>skillFileDraft({...valid,instructions}),error=>error.code==='INVALID_SKILL_FILE'&&error.details.field==='instructions');
});

test('body indentation and Markdown delimiters remain body text and CRLF is normalized',()=>{
  const instructions='    indented code\r\n---\r\n# real body\r\n';
  const file=skillFileDraft({...valid,instructions});
  assert.ok(file.content.endsWith('    indented code\n---\n# real body\n'));
});

test('download acknowledges only that draft; edits become dirty and restoring it clears dirty state',()=>{
  assert.equal(skillFileDraftChanged({name:'',description:'',instructions:''}),false);
  assert.equal(skillFileDraftChanged(valid),true);
  const original=structuredClone(valid),downloaded=downloadedSkillFileDraft(valid);
  assert.deepEqual(valid,original);assert.equal(skillFileDraftChanged(downloaded),false);
  assert.equal(skillFileDraftChanged({...downloaded,instructions:valid.instructions+'\nMore'}),true);
  assert.equal(skillFileDraftChanged({...downloaded,instructions:valid.instructions}),false);
});
