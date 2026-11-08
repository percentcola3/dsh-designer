import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DiagnosticService, DIAGNOSTIC_ACTIONS} from './diagnostics-service.js';
import {DIAGNOSTIC_CATALOG} from './diagnostics-guides.js';
import {DesignerStore} from './store.js';
import {WorkspaceService} from './workspace-service.js';
import {KnowledgeService} from './knowledge-service.js';

const policy = {mode: 'read-only', workspaceRoot: '/private/diagnostic-root'};
const forbidden = () => { throw new Error('Diagnostic side effect attempted'); };
const check = (report, id) => report.checks.find(row => row.id === id);
const value = (row, label) => row.evidence.find(item => item.label === label)?.value;
const secret = 'PRIVATE_SECRET_MODEL_AND_PROMPT';
const digest = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const project = {id: 'p-one', revision: 7, description: '', artboards: [{id: 'a-one', designId: 'd-one', viewport: {width: 390, height: 844}}], workbench: {goal: '', requirementsPath: 'docs/requirements.md', rulesPath: 'docs/rules.md', designs: [{id: 'd-one', platform: 'web'}], files: [], knowledgeIds: []}};
  const calls = [];
  const owner = {ctx: {fs: new Proxy({}, {get: () => forbidden}), shell: {execute: forbidden}, agentDefaultModel: {currentSelection: forbidden}, skills: {}, sessionController: {}, sandboxPolicy: {}, network: {fetch: forbidden}}, aiWorkbench: {}, workbench: {resolveBinding: async () => ({systemId: null})}, store: {
    async projectRecord(id) { calls.push(['project', id]); assert.equal(id, project.id); return {value: project}; },
    async listDirectories(kind) { calls.push(['list', kind]); return []; },
    systemGet: forbidden,
    state: forbidden,
    write: forbidden
  }, knowledge: {record: forbidden, execute: forbidden}, execute: forbidden};
  const service = new DiagnosticService(owner, {metadata: () => ({version: '0.4.12', capabilities: ['knowledge-fts-no-model', 'optimization-guides', secret], origin: 'https://private.invalid', model: secret})});
  const task = {projectId: project.id, projectVersion: 7, scope: 'page', designId: 'd-one', designIds: ['d-one'], pageIds: ['a-one'], refs: [], requirements: null, rules: null, effectiveBinding: {systemId: null}, effectiveBindingsByDesign: {}, knowledge: {warnings: [], citations: []}};
  return {project, owner, calls, service, task};
}

test('resource readme placeholders are not reported as missing-provenance media assets', async () => {
  const f=fixture();f.project.workbench.files=[{id:'f-readme',type:'asset',path:'assets/README.md',mimeType:'text/markdown'}];
  let report=await f.service.execute({action:'diagnostics.run',projectId:f.project.id,categories:['assets']},{user:true,policy});
  assert.equal(value(check(report,'assets.provenance'),'assetCount'),0);assert.equal(check(report,'assets.provenance').status,'unknown');
  f.project.workbench.files.push({id:'f-icon',type:'asset',path:'assets/icon.svg',mimeType:'image/svg+xml',sha256:'a'.repeat(64),source:{kind:'import'}});
  report=await f.service.execute({action:'diagnostics.run',projectId:f.project.id,categories:['assets']},{user:true,policy});
  assert.equal(value(check(report,'assets.provenance'),'assetCount'),1);assert.equal(check(report,'assets.provenance').status,'pass');
});

test('global no-task reports never enumerate or read projects, libraries, models or private configuration', async () => {
  const f = fixture();
  const report = await f.service.execute({action: 'diagnostics.run'}, {user: false, policy});
  assert.deepEqual(f.calls, []);
  assert.equal(report.scope.kind, 'environment');
  assert.equal(report.readOnly, true);
  assert.equal(check(report, 'environment.model').status, 'unknown');
  assert.equal(value(check(report, 'environment.model'), 'executionTested'), false);
  assert.ok(report.checks.filter(row => row.category !== 'environment').every(row => row.status === 'not-applicable'));
  const text = JSON.stringify(report);
  for (const needle of [secret, 'https://private.invalid', '/private/diagnostic-root', 'workspaceRoot', 'execPath', 'credential', 'PRIVATE_']) assert.ok(!text.includes(needle), needle);
  for (const action of ['diagnostics.run', 'diagnostics.catalog', 'diagnostics.guide']) await assert.rejects(f.service.execute({action, projectId: 'p-one', ...(action.endsWith('guide') ? {topic: 'assets'} : {})}, {user: false}), {code: 'TASK_REQUIRED'});
  assert.deepEqual(f.calls, []);
});

test('task project equality applies to run and wrapper-injected static actions without metadata reads', async () => {
  const f = fixture();
  for (const action of ['diagnostics.run', 'diagnostics.catalog', 'diagnostics.guide']) {
    await assert.rejects(f.service.execute({action, projectId: 'p-other', ...(action.endsWith('guide') ? {topic: 'assets'} : {})}, {task: f.task}), {code: 'PROJECT_SCOPE'});
  }
  const catalog = await f.service.execute({action: 'diagnostics.catalog', projectId: 'p-one'}, {task: f.task});
  assert.ok(catalog.topics.length >= 6);
  await f.service.execute({action: 'diagnostics.guide', projectId: 'p-one', topic: 'assets'}, {task: f.task});
  await f.service.execute({action: 'diagnostics.run', categories: ['environment']}, {task: f.task});
  assert.deepEqual(f.calls, []);
});

test('scoped assets and bindings never inspect sibling Design metadata or live system/library APIs', async () => {
  const f = fixture();
  const sibling = {id: 'd-sibling', get platform() { forbidden(); }, get binding() { forbidden(); }};
  const file = {designId: 'd-sibling', get type() { forbidden(); }, get path() { forbidden(); }, get removedAt() { forbidden(); }, get source() { forbidden(); }};
  const page = {id: 'a-sibling', get viewport() { forbidden(); }, get deletedAt() { forbidden(); }};
  f.project.workbench.designs.push(sibling);
  f.project.workbench.files.push(file, {id: 'f-one', designId: 'd-one', type: 'asset', mimeType: 'image/png', sha256: 'a'.repeat(64), source: {kind: 'attachment', private: secret}});
  f.project.artboards.push(page);
  f.task.effectiveBindingsByDesign = {get 'd-sibling'() { forbidden(); }, 'd-one': {systemId: 'd-system', version: 2, system: {tokens: {color: secret}, guidelines: secret}}};
  f.owner.workbench.resolveBinding = forbidden;
  const report = await f.service.execute({action: 'diagnostics.run', categories: ['assets']}, {task: f.task, agent: {id: 'agent'}, policy});
  assert.equal(value(check(report, 'assets.provenance'), 'assetCount'), 1);
  assert.equal(value(check(report, 'assets.specification'), 'pinnedBindings'), 1);
  assert.equal(check(report, 'assets.tokens').status, 'pass');
  assert.deepEqual(f.calls, [['project', 'p-one']]);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes('sibling'));
});

test('task knowledge uses only exact admitted refs and frozen summaries, never live library enumeration', async () => {
  const f = fixture();
  const ref = {type: 'knowledge', projectId: 'p-one', knowledgeId: 'k-one', resourceId: 'knowledge:k-one', sourceVersion: 3, readonly: true};
  f.task.refs = [{kind: 'knowledge', readonly: true, reference: ref}];
  f.task.knowledge = {text: secret, citations: [{knowledgeId: 'k-one', sourceVersion: 3, snippet: secret}, {knowledgeId: 'k-other', sourceVersion: 3}, {knowledgeId: 'k-one', sourceVersion: 2}], warnings: [{message: secret}]};
  f.project.workbench.knowledgeIds = ['k-private-sibling'];
  const report = await f.service.execute({action: 'diagnostics.run', categories: ['knowledge']}, {task: f.task, policy});
  assert.equal(value(check(report, 'knowledge.context'), 'admittedCitationCount'), 1);
  assert.equal(check(report, 'knowledge.context').status, 'warning');
  assert.equal(check(report, 'knowledge.indexes').status, 'unknown');
  assert.deepEqual(f.calls, [['project', 'p-one']]);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes('k-private'));
});

test('stale task versions warn truthfully without changing frozen bindings or task data', async () => {
  const f = fixture();
  f.project.revision = 9;
  const before = JSON.stringify(f.task);
  const report = await f.service.execute({action: 'diagnostics.run', categories: ['generation']}, {task: f.task, policy});
  assert.equal(check(report, 'generation.taskVersion').status, 'warning');
  assert.equal(value(check(report, 'generation.taskVersion'), 'currentRevision'), 9);
  assert.equal(value(check(report, 'generation.taskVersion'), 'submittedRevision'), 7);
  assert.equal(JSON.stringify(f.task), before);
  assert.equal(report.summary.status, 'attention');
});

test('missing evidence is unknown, known absent frozen docs warn, and known docs can pass', async () => {
  const f = fixture();
  delete f.task.rules;
  f.task.requirements = {text: 'Concrete acceptance criteria', invalid: false};
  const report = await f.service.execute({action: 'diagnostics.run', categories: ['generation', 'assets']}, {task: f.task});
  assert.equal(check(report, 'generation.rules').status, 'unknown');
  assert.equal(check(report, 'generation.requirements').status, 'pass');
  assert.equal(check(report, 'generation.goal').status, 'warning');
  assert.equal(check(report, 'assets.tokens').status, 'unknown');
  assert.equal(check(report, 'generation.interactions').status, 'unknown');
});

test('untrusted action/options/category shapes reject prototype injection and unsupported fixes', async () => {
  const f = fixture();
  const invalid = [
    Object.assign(Object.create({projectId: 'p-other'}), {action: 'diagnostics.run'}),
    {action: 'diagnostics.run', options: Object.create({categories: ['assets']})},
    JSON.parse('{"action":"diagnostics.run","__proto__":{"projectId":"p-other"}}'),
    {action: '__proto__'}, {action: 'constructor'}, {action: {}},
    {action: 'diagnostics.fix'}, {action: 'diagnostics.run', repair: true},
    {action: 'diagnostics.run', categories: ['environment', 'assets', 'generation', 'knowledge', 'environment']},
    {action: 'diagnostics.run', categories: ['assets', 'assets']},
    {action: 'diagnostics.run', categories: []},
    {action: 'diagnostics.run', categories: ['__proto__']},
    {action: 'diagnostics.run', categories: 'assets'},
    {action: 'diagnostics.run', projectId: '/private/root'},
    {action: 'diagnostics.guide', topic: '__proto__'},
    {action: 'diagnostics.guide', topic: 'constructor'},
    {action: 'diagnostics.guide', topic: 'assets', limit: 12001},
    {action: 'diagnostics.guide', topic: 'assets', limit: 0},
    {action: 'diagnostics.guide', topic: 'assets', offset: -1},
    {action: 'diagnostics.guide', topic: 'assets', offset: 0.1}
  ];
  for (const input of invalid) await assert.rejects(f.service.execute(input, {user: false}));
  assert.deepEqual(f.calls, []);
  assert.throws(() => f.service.help('constructor'), {code: 'UNKNOWN_ACTION'});
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('guides are static progressive bounded windows with practical iteration and honest feature limits', async () => {
  const f = fixture();
  for (const topic of DIAGNOSTIC_CATALOG) {
    const first = await f.service.execute({action: 'diagnostics.guide', topic: topic.id, limit: 40});
    const second = await f.service.execute({action: 'diagnostics.guide', topic: topic.id, offset: first.nextOffset, limit: 12000});
    const all = await f.service.execute({action: 'diagnostics.guide', topic: topic.id, limit: 12000});
    assert.equal(first.text + second.text, all.text);
    assert.equal(second.nextOffset, null);
    assert.ok(all.text.length <= 12000);
    assert.equal(all.offsetUnit, 'characters');
  }
  const feedback = await f.service.execute({action: 'diagnostics.guide', topic: 'feedback', limit: 12000});
  for (const action of ['diagnostics.run', 'diagnostics.guide', 'task.get', 'file.write', 'asset.fromSystemResource', 'asset.fromAttachment']) assert.ok(feedback.text.includes(action));
  const framework = await f.service.execute({action: 'diagnostics.guide', topic: 'frameworks'});
  assert.match(framework.text, /Rsbuild/);
  assert.match(framework.text, /NOT IMPLEMENTED/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(Object.keys(DIAGNOSTIC_ACTIONS), ['diagnostics.run', 'diagnostics.guide', 'diagnostics.catalog']);
});

class MemoryFS {
  files = new Map(); writes = 0; reads = []; sealed = false;
  async resolve(raw) { return {targetKey: path.resolve(raw)}; }
  processPath(target) { return target.targetKey; }
  contains(root, target) { return target.targetKey === root.targetKey || target.targetKey.startsWith(root.targetKey + '/'); }
  async stat(target) { const row = this.files.get(target.targetKey); return row ? {type: 'file', size: Buffer.byteLength(row.text), version: row.version} : [...this.files.keys()].some(key => key.startsWith(target.targetKey + '/')) ? {type: 'directory'} : undefined; }
  async listDir(target) { const rows = new Map(); for (const key of this.files.keys()) if (key.startsWith(target.targetKey + '/')) { const tail = key.slice(target.targetKey.length + 1), name = tail.split('/')[0]; rows.set(name, {name, type: tail.includes('/') ? 'directory' : 'file'}); } return [...rows.values()]; }
  async readText(target) { this.reads.push(target.targetKey); const row = this.files.get(target.targetKey); if (!row) throw Object.assign(new Error('missing'), {code: 'NOT_FOUND'}); return row.text; }
  async writeText(target, text) { if (this.sealed) forbidden(); const version = String(++this.writes); this.files.set(target.targetKey, {text, version}); return {version}; }
  deleteFile = forbidden; moveFile = forbidden;
  async readBytes(target) { if (this.sealed) forbidden(); const row = this.files.get(target.targetKey); if (!row) throw Object.assign(new Error('missing'), {code: 'NOT_FOUND'}); return Buffer.from(row.text); }
  async readByteRange(target, {offset, length}) { return (await this.readBytes(target)).subarray(offset, offset + length); }
}
async function realFixture() {
  const fs = new MemoryFS(), writable = {mode: 'workspace-write', workspaceRoot: '/private/diagnostic-root'};
  const store = new DesignerStore({fs, workspaceRoot: writable.workspaceRoot, policy: () => writable});
  const owner = {store, ctx: {fs, shell: {execute: forbidden}, fetch: forbidden, agentDefaultModel: {currentSelection: forbidden}}, policy: () => writable};
  owner.workbench = new WorkspaceService(owner);
  owner.knowledge = new KnowledgeService(owner, {engine: {index: forbidden, search: forbidden, runtimeStatus: forbidden}});
  const created = await owner.workbench.execute({action: 'project.initialize', name: secret, goal: 'Actual user goal'}, {user: true, policy: writable});
  const system = await store.systemCreate({name: secret, tokens: {color: 'red'}, guidelines: 'Use actual components', platforms: ['web']}, undefined, writable);
  const knowledge = (await owner.knowledge.execute({action: 'knowledge.create', name: secret}, {user: true, policy: writable})).knowledge;
  const target = await owner.knowledge.target(knowledge.id, 'knowledge.json');
  const original = JSON.parse(await fs.readText(target));
  original.documents = [{id: 'd-original', name: secret + '.pdf', relativePath: 'source.pdf', mimeType: 'application/pdf', bytes: 100, sha256: 'a'.repeat(64), chunks: [], searchable: false}, {id: 'd-text', name: secret + '.md', relativePath: 'guide.md', mimeType: 'text/markdown', bytes: 4, sha256: digest('text'), chunks: [], searchable: true, projection: {bytes: 4, sourceHash: digest('text'), sha256: digest('text')}}];
  original.index = {state: 'ready', sourceVersion: 1, indexId: 'local-index'};
  await fs.writeText(target, JSON.stringify(original));
  fs.sealed = true;
  const service = new DiagnosticService(owner, {metadata: () => ({version: '0.4.12', capabilities: ['optimization-guides']})});
  return {fs, store, owner, service, created, system, knowledge, target};
}

test('real store/workspace/knowledge owner flow recognizes d- systems, docs, projections and unsupported originals with no writes', async () => {
  const f = await realFixture(), writes = f.fs.writes, before = [...f.fs.files].map(([key, row]) => [key, {...row}]);
  assert.match(f.system.id, /^d-/);
  const report = await f.service.execute({action: 'diagnostics.run'}, {user: true, policy});
  assert.equal(value(check(report, 'assets.library'), 'inspected'), 1);
  assert.equal(value(check(report, 'assets.library'), 'withTokens'), 1);
  assert.equal(value(check(report, 'generation.library'), 'withRegisteredRules'), 1);
  assert.equal(value(check(report, 'generation.library'), 'withRegisteredRequirements'), 1);
  assert.equal(value(check(report, 'knowledge.library'), 'originalCount'), 2);
  assert.equal(value(check(report, 'knowledge.library'), 'searchableCount'), 1);
  assert.equal(value(check(report, 'knowledge.library'), 'nonsearchableCount'), 1);
  assert.equal(check(report, 'knowledge.indexes').status, 'pass');
  assert.equal(f.fs.writes, writes);
  assert.deepEqual([...f.fs.files], before);
  assert.ok(f.fs.reads.every(key => /(?:project-locations|project|system|knowledge)\.json$/.test(key)));
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!JSON.stringify(report).includes('/private/'));
  assert.ok(!JSON.stringify(report).includes('source.pdf'));
  const projectReport = await f.service.execute({action: 'diagnostics.run', projectId: f.created.project.id, categories: ['generation']}, {user: true, policy});
  assert.equal(check(projectReport, 'generation.rules').status, 'pass');
  assert.equal(check(projectReport, 'generation.requirements').status, 'pass');
});

test('owner failures remain partial and sanitized; failed metadata does not become a fake pass', async () => {
  const f = fixture();
  f.owner.store.listDirectories = async kind => kind === 'knowledge' ? [{name: 'k-good'}, {name: 'k-bad'}] : [{name: kind === 'systems' ? 'd-bad' : 'p-one'}];
  f.owner.store.systemGet = async () => { throw new Error(secret + '/private/root'); };
  f.owner.knowledge.record = async id => { if (id === 'k-bad') throw new Error(secret); return {value: {id, contentRevision: 2, documents: [{searchable: true}], index: {state: 'ready', sourceVersion: 1}}}; };
  const report = await f.service.execute({action: 'diagnostics.run'}, {user: true, policy});
  assert.equal(value(check(report, 'knowledge.library'), 'inspected'), 1);
  assert.equal(value(check(report, 'knowledge.library'), 'unavailable'), 1);
  assert.equal(value(check(report, 'knowledge.indexes'), 'stale'), 1);
  assert.equal(check(report, 'assets.library').status, 'unknown');
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(report.checks.some(row => row.category === 'environment'));
});

test('owner index ready with unknown source version is unknown and interrupted indexing is not a pass', async () => {
  const f = fixture();
  f.owner.store.listDirectories = async kind => kind === 'knowledge' ? [{name: 'k-one'}] : [];
  f.owner.knowledge.record = async id => ({value: {id, contentRevision: 2, documents: [], index: {state: 'ready', sourceVersion: null}}});
  let report = await f.service.execute({action: 'diagnostics.run', categories: ['knowledge']}, {user: true, policy});
  assert.equal(check(report, 'knowledge.indexes').status, 'unknown');
  f.owner.knowledge.effectiveIndex = () => ({state: 'failed', sourceVersion: 2});
  report = await f.service.execute({action: 'diagnostics.run', categories: ['knowledge']}, {user: true, policy});
  assert.equal(check(report, 'knowledge.indexes').status, 'warning');
});

test('owner library reads are capped and selected projects never enumerate other libraries', async () => {
  const f = fixture(); let reads = 0;
  f.owner.store.listDirectories = async kind => kind === 'knowledge' ? Array.from({length: 150}, (_, index) => ({name: 'k-' + index})) : [];
  f.owner.knowledge.record = async id => { reads++; return {value: {id, contentRevision: 1, documents: Array.from({length: 600}, () => ({searchable: false})), index: {state: 'not-indexed', sourceVersion: null}}}; };
  const report = await f.service.execute({action: 'diagnostics.run', categories: ['knowledge']}, {user: true, policy});
  assert.equal(reads, 100);
  assert.equal(report.limits.truncated, true);
  assert.equal(value(check(report, 'knowledge.library'), 'originalCount'), 50000);
  f.owner.store.listDirectories = forbidden;
  f.project.workbench.knowledgeIds = ['k-bound'];
  const selected = await f.service.execute({action: 'diagnostics.run', projectId: 'p-one', categories: ['knowledge']}, {user: true, policy});
  assert.equal(selected.scope.kind, 'project');
  assert.equal(value(check(selected, 'knowledge.bindings'), 'boundLibraries'), 1);
  assert.equal(reads, 101);
});

test('metadata callback failure is safe and model configuration is never queried', async () => {
  const f = fixture();
  const service = new DiagnosticService(f.owner, {metadata: () => { throw new Error(secret); }});
  const report = await service.execute({action: 'diagnostics.run', categories: ['environment']});
  assert.equal(check(report, 'environment.plugin').status, 'unknown');
  assert.equal(check(report, 'environment.model').status, 'unknown');
  assert.ok(!JSON.stringify(report).includes(secret));
});

test('cancellation propagates instead of being converted to partial metadata failures', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort(new Error('cancelled'));
  await assert.rejects(f.service.execute({action: 'diagnostics.run'}, {signal: controller.signal}), /cancelled/);
  assert.deepEqual(f.calls, []);
});
