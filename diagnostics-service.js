import {fail} from './store.js';
import {DIAGNOSTIC_GUIDES, DIAGNOSTIC_CATALOG} from './diagnostics-guides.js';

const CATEGORIES = Object.freeze(['environment', 'generation', 'assets', 'knowledge']);
const MAX_RECORDS = 100, MAX_ITEMS = 500, MAX_REFS = 130, MAX_GUIDE = 12000;
const SCOPES = new Set(['read', 'selection', 'page', 'design', 'project']);
const MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const CAPABILITIES = new Set(['knowledge-directory', 'knowledge-auto-index', 'knowledge-import-local', 'knowledge-import-git', 'knowledge-fts-no-model', 'prepared-owner-contexts', 'native-json-lossless', 'prototype-local-submit', 'diagnostics-readonly', 'optimization-guides']);
const fields = values => Object.freeze(values);
export const DIAGNOSTIC_ACTIONS = Object.freeze({
  'diagnostics.run': fields({projectId: '可选；仅所有者或当前冻结任务的精确项目', categories: '可选、不重复的类别数组 environment|generation|assets|knowledge；默认全部，最多4项'}),
  'diagnostics.guide': fields({topic: '必填，来自目录的指南ID', offset: '可选，非负字符偏移', limit: '可选，1..12000；默认6000'}),
  'diagnostics.catalog': fields({})
});
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value, key) => Object.hasOwn(value, key);
const list = value => Array.isArray(value) ? value : null;
const nonempty = value => typeof value === 'string' ? !!value.trim() : undefined;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const identifier = (value, prefix = 'p') => typeof value === 'string' && new RegExp(`^${prefix}-[A-Za-z0-9-]{1,80}$`).test(value);
const evidence = values => Object.entries(values).filter(([, value]) => value !== undefined).map(([label, value]) => ({label, value}));
const version = value => typeof value === 'string' && /^v?\d{1,3}\.\d{1,3}\.\d{1,5}(?:-[a-zA-Z0-9.-]{1,30})?$/.test(value) ? value : undefined;
function validate(input) {
  if (!plain(input)) fail('INVALID_INPUT', '诊断输入必须是普通操作对象');
  let options = {};
  if (own(input, 'options')) {
    if (!plain(input.options)) fail('INVALID_INPUT', '诊断 options 必须是普通对象');
    options = input.options;
  }
  const merged = {...options, ...input};
  delete merged.options;
  if (typeof merged.action !== 'string' || !own(DIAGNOSTIC_ACTIONS, merged.action)) fail('UNKNOWN_ACTION', '未知诊断操作');
  const allowed = new Set(['action', 'projectId', ...Object.keys(DIAGNOSTIC_ACTIONS[merged.action])]);
  if (Object.keys(merged).some(key => !allowed.has(key))) fail('INVALID_INPUT', '包含不支持的诊断字段');
  return merged;
}
function refsOf(value, remaining = {count: MAX_REFS}, depth = 0) {
  if (!Array.isArray(value) || depth > 8) return [];
  const result = [];
  for (const row of value) {
    if (--remaining.count < 0) break;
    if (!row || typeof row !== 'object') continue;
    if (Array.isArray(row.nodes)) result.push(...refsOf(row.nodes, remaining, depth + 1));
    else result.push(row);
  }
  return result;
}
function documentPresence(doc) {
  if (doc === null) return false;
  if (!doc || typeof doc !== 'object') return undefined;
  if (doc.invalid === true) return false;
  if (typeof doc.text === 'string') return !!doc.text.trim();
  if (count(doc.total) !== undefined) return doc.total > 0;
  return undefined;
}
function knownArrayCount(value) { return Array.isArray(value) ? Math.min(value.length, MAX_ITEMS) : undefined; }

/** Read-only metadata composition. Never dispatches actions, runs a probe, or writes a cache. */
export class DiagnosticService {
  constructor(owner, {metadata} = {}) {
    if (!owner || typeof owner !== 'object') throw new TypeError('DiagnosticService 需要所有者服务对象');
    if (metadata !== undefined && typeof metadata !== 'function') throw new TypeError('metadata 必须是安全元数据回调');
    this.owner = owner;
    this.metadata = metadata;
  }
  help(topic) {
    if (topic !== undefined) {
      if (typeof topic !== 'string' || !own(DIAGNOSTIC_ACTIONS, topic)) fail('UNKNOWN_ACTION', '未知诊断帮助主题');
      return {action: topic, fields: DIAGNOSTIC_ACTIONS[topic], readOnly: true};
    }
    return {actions: DIAGNOSTIC_ACTIONS, readOnly: true, categories: [...CATEGORIES], scopes: '全局模型仅可读取环境和静态指南；项目智能体仅限精确冻结任务；所有者可读取有上限的库或所选项目元数据。', execution: '不执行 shell、网络、模型调用、写入、索引、修复或插件修改。'};
  }
  async execute(raw, env = {}) {
    const input = validate(raw);
    env.signal?.throwIfAborted();
    // Scoped tool wrappers inject projectId even for static guides; validate it without reading project metadata.
    if (input.projectId !== undefined) {
      if (!identifier(input.projectId)) fail('INVALID_ID', '项目标识符无效');
      if (env.task && input.projectId !== env.task.projectId) fail('PROJECT_SCOPE', '诊断仅允许当前冻结任务的精确项目');
      if (!(env.user === true && !env.agent) && !env.task) fail('TASK_REQUIRED', '请先提交项目任务，再诊断项目元数据');
    }
    if (input.action === 'diagnostics.catalog') return {schemaVersion: 1, readOnly: true, topics: DIAGNOSTIC_CATALOG.map(row => ({...row}))};
    if (input.action === 'diagnostics.guide') {
      if (typeof input.topic !== 'string' || !own(DIAGNOSTIC_GUIDES, input.topic)) fail('INVALID_INPUT', '请从 diagnostics.catalog 选择指南ID');
      const offset = input.offset ?? 0, limit = input.limit ?? 6000;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GUIDE) fail('INVALID_INPUT', 'offset 必须非负，limit 必须为1..12000');
      const guide = DIAGNOSTIC_GUIDES[input.topic], next = offset + limit;
      return {schemaVersion: 1, readOnly: true, topic: guide.id, title: guide.title, intent: guide.intent, text: guide.text.slice(offset, next), offset, limit, total: guide.text.length, nextOffset: next < guide.text.length ? next : null, offsetUnit: 'characters'};
    }
    return this.run(input, env);
  }
  async run(input, env) {
    const categories = input.categories ?? [...CATEGORIES];
    if (!Array.isArray(categories) || categories.length < 1 || categories.length > 4 || new Set(categories).size !== categories.length || categories.some(category => !CATEGORIES.includes(category))) fail('INVALID_INPUT', '请选择1至4个不重复的诊断类别');
    const owner = env.user === true && !env.agent, task = env.task;
    if (task && (!SCOPES.has(task.scope) || !identifier(task.projectId))) fail('TASK_REQUIRED', '需要有效的冻结任务');
    if (input.projectId !== undefined && !identifier(input.projectId)) fail('INVALID_ID', '项目标识符无效');
    if (task && input.projectId !== undefined && input.projectId !== task.projectId) fail('PROJECT_SCOPE', '诊断仅允许当前冻结任务的精确项目');
    if (!owner && !task && input.projectId !== undefined) fail('TASK_REQUIRED', '请先提交项目任务，再诊断项目元数据');
    const projectId = task?.projectId ?? input.projectId;
    const report = {
      schemaVersion: 1, readOnly: true,
      scope: {kind: task ? 'task' : projectId ? 'project' : owner ? 'library' : 'environment', ...(projectId ? {projectId} : {})},
      summary: {}, checks: [], guideTopics: [],
      limits: {maxRecordsPerLibrary: MAX_RECORDS, maxItemsPerProject: MAX_ITEMS, maxTaskReferences: MAX_REFS, maxGuideCharacters: MAX_GUIDE, metadataOnly: true, modelExecutionTested: false, networkTested: false, fileContentsInspected: false, libraryEnumerationAllowed: owner && !task && !projectId, truncated: false}
    };
    const add = (id, category, title, status, values, recommendation, guideId = category, finding, actions) => {
      report.checks.push({id, category, title, status, evidence: evidence(values), ...(finding ? {finding} : {}), recommendation, guideId, ...(actions?.length ? {actions} : {})});
    };
    const suggest = (action, args, reason, requires = task ? 'current-task' : 'owner') => ({action, args, requires, reason});
    const present = (id, category, title, value, recommendation, guideId = category, actions) => add(id, category, title, value === undefined ? 'unknown' : value ? 'pass' : 'warning', {present: value}, recommendation, guideId, value === undefined ? '没有可下结论的元数据证据。' : undefined, actions);
    if (categories.includes('environment')) await this.environment(env, add);
    if (!owner && !task) {
      for (const category of categories.filter(value => value !== 'environment')) add(`${category}.scope`, category, '项目与库证据需要准入', 'not-applicable', {taskAdmitted: false, libraryEnumerated: false}, '可由所有者提供 GUI 报告，或为目标项目提交只读任务；现在即可读取静态指南。', category);
    } else if (!projectId) {
      await this.library(categories, env, report, add, present, suggest);
    } else if (categories.some(category => category !== 'environment')) {
      let project;
      try {
        const record = await this.owner.store?.projectRecord?.(projectId, env.signal);
        project = record?.value;
        if (!project || project.id !== projectId) throw new Error('Unavailable metadata');
      } catch {
        env.signal?.throwIfAborted();
        for (const category of categories.filter(value => value !== 'environment')) add(`${category}.metadata`, category, '项目元数据可用性', 'unknown', {metadataAvailable: false}, '请重新打开所选项目并核对当前元数据；本次未检查项目内容。', category);
      }
      if (project) await this.project(project, task, categories, env, report, add, present, suggest);
    }
    const counts = {total: report.checks.length, pass: 0, warning: 0, error: 0, unknown: 0, notApplicable: 0};
    for (const check of report.checks) counts[check.status === 'not-applicable' ? 'notApplicable' : check.status]++;
    report.summary = {status: counts.error ? 'blocked' : counts.warning ? 'attention' : counts.unknown ? 'unknown' : counts.pass ? 'ok' : 'unknown', ...counts};
    const topics = new Set(report.checks.map(check => check.guideId));
    report.guideTopics = DIAGNOSTIC_CATALOG.filter(row => topics.has(row.id)).map(row => ({...row}));
    return report;
  }
  async environment(env, add) {
    const ctx = this.owner.ctx || {};
    add('environment.runtime', 'environment', '内置运行时元数据', 'pass', {nodeVersion: version(process.version), platform: ['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32', 'android'].includes(process.platform) ? process.platform : 'other', architecture: ['arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x64'].includes(process.arch) ? process.arch : 'other'}, '使用内置 Node/Git 插件服务；此项未测试系统 CLI 或外部连接。');
    const available = {filesystem: !!ctx.fs, store: !!this.owner.store, workspace: !!this.owner.workbench, aiWorkbench: !!this.owner.aiWorkbench, knowledge: !!this.owner.knowledge, skills: !!ctx.skills, sessionController: !!ctx.sessionController, sandboxPolicy: !!ctx.sandboxPolicy};
    add('environment.services', 'environment', '已注入的 Designer 服务', available.filesystem && available.store ? 'pass' : 'error', available, '通过现有所有者环境控件核对缺失服务的注册。服务存在不证明实际执行或外部连接成功。');
    const mode = MODES.has(env.policy?.mode) ? env.policy.mode : undefined;
    add('environment.policy', 'environment', '当前权限模式', mode ? 'pass' : 'unknown', {mode}, mode === 'read-only' ? '可以诊断；后续修改仍须通过现有所有者或任务权限校验。' : '后续操作使用当前原生权限控件；诊断不会扩大授权。');
    let metadata;
    try { metadata = await this.metadata?.(); } catch { env.signal?.throwIfAborted(); }
    const safeVersion = version(metadata?.version);
    const caps = Array.isArray(metadata?.capabilities) ? [...new Set(metadata.capabilities.filter(cap => CAPABILITIES.has(cap)))].slice(0, 32) : undefined;
    add('environment.plugin', 'environment', '公开插件元数据', safeVersion ? 'pass' : 'unknown', {version: safeVersion, knownCapabilityCount: caps?.length, ...(caps ? Object.fromEntries(caps.map(cap => [cap, true])) : {})}, '核对已安装版本和能力是否覆盖所需行为；不支持的集成需另行提出实现方案。');
    add('environment.model', 'environment', '模型配置与执行证据', 'unknown', {configurationProven: false, executionTested: false}, '通过 DSH 原生模型控件核对配置，再提交小型真实任务验证生成。未实测不代表模型不可用。', 'environment', '当前没有公开安全 API 能证明模型配置或模型执行成功。');
  }
  async directories(kind, env, report) {
    if (typeof this.owner.store?.listDirectories !== 'function') return null;
    const entries = await this.owner.store.listDirectories(kind, env.signal);
    if (!Array.isArray(entries)) return null;
    const prefix = {projects: 'p', systems: 'd', knowledge: 'k'}[kind];
    const ids = entries.filter(entry => identifier(entry?.name, prefix)).map(entry => entry.name);
    if (kind === 'projects' && typeof this.owner.store.loadProjectLocations === 'function') {
      await this.owner.store.loadProjectLocations(env.signal);
      if (this.owner.store.projectLocations instanceof Map) for (const id of this.owner.store.projectLocations.keys()) if (identifier(id) && !ids.includes(id)) ids.push(id);
    }
    if (ids.length > MAX_RECORDS) report.limits.truncated = true;
    return {ids: ids.slice(0, MAX_RECORDS), total: ids.length};
  }
  async library(categories, env, report, add, present, suggest) {
    if (categories.includes('generation')) {
      let rows;
      try { rows = await this.directories('projects', env, report); } catch { env.signal?.throwIfAborted(); }
      let inspected = 0, unavailable = 0, goals = 0, requirements = 0, rules = 0;
      if (rows) for (const id of rows.ids) {
        env.signal?.throwIfAborted();
        try {
          const p = (await this.owner.store.projectRecord(id, env.signal)).value;
          if (!p || p.id !== id) throw new Error('Unavailable metadata');
          if (p.deletedAt || p.archived) continue;
          inspected++;
          goals += nonempty(p.workbench?.goal || p.description) === true ? 1 : 0;
          const files = list(p.workbench?.files)?.slice(0, MAX_ITEMS);
          if ((p.workbench?.files?.length || 0) > MAX_ITEMS) report.limits.truncated = true;
          if (files) { requirements += files.some(f => !f.removedAt && (f.type === 'requirements' || typeof p.workbench?.requirementsPath === 'string' && f.path === p.workbench.requirementsPath)) ? 1 : 0; rules += files.some(f => !f.removedAt && (f.type === 'rules' || typeof p.workbench?.rulesPath === 'string' && f.path === p.workbench.rulesPath)) ? 1 : 0; }
        } catch { env.signal?.throwIfAborted(); unavailable++; }
      }
      add('generation.library', 'generation', '项目准备元数据', !rows || unavailable ? 'unknown' : inspected === 0 || goals < inspected || requirements < inspected || rules < inspected ? 'warning' : 'pass', {registered: rows?.total, inspected, unavailable, withGoals: goals, withRegisteredRequirements: requirements, withRegisteredRules: rules}, '打开所选项目，明确目标并在提交前核对真实需求、规则。登记数量不能验证文档质量。');
    }
    if (categories.includes('assets')) {
      let rows;
      try { rows = await this.directories('systems', env, report); } catch { env.signal?.throwIfAborted(); }
      let inspected = 0, unavailable = 0, tokens = 0, guidelines = 0, resources = 0, examples = 0;
      if (rows) for (const id of rows.ids) {
        env.signal?.throwIfAborted();
        try {
          const s = await this.owner.store.systemGet(id, env.signal);
          if (!s || s.id !== id) throw new Error('Unavailable metadata');
          if (s.archived) continue;
          const snapshot = list(s.versions)?.at(-1);
          if (!snapshot) { unavailable++; continue; }
          inspected++;
          tokens += plain(snapshot.tokens) && Object.keys(snapshot.tokens).length > 0 ? 1 : 0;
          guidelines += nonempty(snapshot.guidelines) === true ? 1 : 0;
          resources += Math.min(list(snapshot.resources)?.length || 0, MAX_ITEMS);
          examples += Math.min(list(snapshot.examples)?.length || 0, MAX_ITEMS);
          if ((snapshot.resources?.length || 0) > MAX_ITEMS || (snapshot.examples?.length || 0) > MAX_ITEMS) report.limits.truncated = true;
        } catch { env.signal?.throwIfAborted(); unavailable++; }
      }
      add('assets.library', 'assets', '设计体系库准备情况', !rows || unavailable ? 'unknown' : !inspected || tokens < inspected || guidelines < inspected ? 'warning' : 'pass', {registered: rows?.total, inspected, unavailable, withTokens: tokens, withGuidelines: guidelines, registeredResources: resources}, '整理有版本的令牌、规则和真实 CSS/主题/图标/字体资源，记录来源并在所选项目中验证示例。', 'components');
      add('assets.libraryExamples', 'assets', '显式设计体系示例', examples ? 'pass' : 'unknown', {explicitExampleCount: examples}, '请提供具体组件和交互示例。缺少示例元数据，不能证明已准入资源内部没有示例。', 'components');
    }
    if (categories.includes('knowledge')) await this.ownerKnowledge(env, report, add, suggest);
  }
  async ownerKnowledge(env, report, add, suggest) {
    let rows;
    try { rows = await this.directories('knowledge', env, report); } catch { env.signal?.throwIfAborted(); }
    let inspected = 0, unavailable = 0, originals = 0, searchable = 0, searchableKnown = 0, stale = 0, missingIndex = 0, indexUnknown = 0, partialImports = 0;
    if (rows) for (const id of rows.ids) {
      env.signal?.throwIfAborted();
      try {
        const value = (await this.owner.knowledge?.record?.(id, env.signal))?.value;
        if (!value || value.id !== id || !Array.isArray(value.documents)) throw new Error('Unavailable metadata');
        if (value.archived) continue;
        inspected++;
        const documents = value.documents.slice(0, MAX_ITEMS);
        if (value.documents.length > MAX_ITEMS) report.limits.truncated = true;
        originals += documents.length;
        searchable += documents.filter(doc => doc.searchable === true).length;
        searchableKnown += documents.filter(doc => typeof doc.searchable === 'boolean').length;
        const index = this.owner.knowledge?.effectiveIndex ? this.owner.knowledge.effectiveIndex(value) : value.index;
        if (!index || !['not-indexed', 'indexing', 'ready', 'failed', 'stale'].includes(index.state) || index.state === 'ready' && (!Number.isSafeInteger(index.sourceVersion) || !Number.isSafeInteger(value.contentRevision))) indexUnknown++;
        else if (index.state === 'stale' || Number.isSafeInteger(index.sourceVersion) && index.sourceVersion !== value.contentRevision) stale++;
        else if (index.state !== 'ready') missingIndex++;
        if (['partial', 'failed', 'cancelled'].includes(value.lastImport?.state)) partialImports++;
      } catch { env.signal?.throwIfAborted(); unavailable++; }
    }
    add('knowledge.library', 'knowledge', '本地原件与可检索性', !rows || unavailable || searchableKnown < originals ? 'unknown' : !inspected || searchable < originals ? 'warning' : 'pass', {registered: rows?.total, inspected, unavailable, originalCount: originals, searchableCount: searchable, nonsearchableCount: searchableKnown - searchable, partialImports}, '保留原件，为不可检索格式提供支持的 UTF-8 文本配套资料。显式检查部分导入情况；诊断不提取文件或建立索引。');
    add('knowledge.indexes', 'knowledge', '本地索引时效', !rows || unavailable || indexUnknown ? 'unknown' : stale || missingIndex ? 'warning' : inspected ? 'pass' : 'not-applicable', {inspected, stale, notReady: missingIndex, unknown: indexUnknown}, '对选定库使用 knowledge.status；仅由所有者在需要恢复时携带当前版本显式请求 knowledge.index。BM25 不需要下载模型。', 'knowledge', undefined, [suggest('help', {topic: 'knowledge.status'}, '选择知识库前先查看真实状态操作契约。')]);
  }
  async project(p, task, categories, env, report, add, present, suggest) {
    const workbench = p.workbench || {}, scoped = !!task;
    const ids = scoped ? [...new Set([...(list(task.designIds) || []), task.designId].filter(id => identifier(id, 'd')))].slice(0, MAX_ITEMS) : null;
    const allDesigns = list(workbench.designs), allPages = list(p.artboards), allFiles = list(workbench.files);
    const designs = allDesigns ? scoped ? ids.map(id => allDesigns.find(d => d.id === id)).filter(d => d && !d.deletedAt) : allDesigns.filter(d => !d.deletedAt).slice(0, MAX_ITEMS) : null;
    const pageIds = scoped ? (list(task.pageIds) || []).slice(0, MAX_ITEMS) : null;
    const pages = allPages ? scoped ? pageIds.map(id => allPages.find(page => page.id === id)).filter(page => page && !page.deletedAt) : allPages.filter(page => !page.deletedAt).slice(0, MAX_ITEMS) : null;
    const files = allFiles ? allFiles.filter(file => {
      // Decide membership before reading any other file metadata. Never inspect sibling Design resources.
      if (scoped && (!ids.includes(file.designId) || file.pageId && !pageIds.includes(file.pageId))) return false;
      return !file.removedAt;
    }).slice(0, MAX_ITEMS) : null;
    if (!scoped && ((allDesigns?.length || 0) > MAX_ITEMS || (allPages?.length || 0) > MAX_ITEMS) || (allFiles && files?.length === MAX_ITEMS)) report.limits.truncated = true;
    const infoCategory = categories.find(category => category !== 'environment');
    if (infoCategory && scoped) {
      const current = count(p.revision), submitted = count(task.projectVersion);
      add('generation.taskVersion', infoCategory, '冻结任务与当前项目版本', current === undefined || submitted === undefined ? 'unknown' : current === submitted ? 'pass' : 'warning', {currentRevision: current, submittedRevision: submitted, matching: current !== undefined && submitted !== undefined ? current === submitted : undefined}, '使用冻结绑定与已准入引用。如变更影响目标，请核对当前版本并重新提交，不要扩大当前任务范围。', 'feedback', current !== undefined && submitted !== undefined && current !== submitted ? '项目在任务提交后已变化；本报告不会刷新冻结任务。' : undefined, [suggest('task.get', {}, '下一轮设计迭代前先核对已准入任务。')]);
    }
    if (categories.includes('generation')) {
      present('generation.goal', 'generation', '项目目标', nonempty(workbench.goal || p.description), '下次提交前明确用户群体、首要目标和验收标准。');
      for (const kind of ['requirements', 'rules']) {
        const value = scoped ? documentPresence(task[kind]) : allFiles ? allFiles.slice(0, MAX_ITEMS).some(file => !file.removedAt && (file.type === kind || typeof workbench[kind + 'Path'] === 'string' && file.path === workbench[kind + 'Path'])) : undefined;
        present(`generation.${kind}`, 'generation', scoped ? (kind === 'rules' ? '当前任务规则内容' : '当前任务需求内容') : (kind === 'rules' ? '规则文档登记' : '需求文档登记'), value, scoped ? '读取已准入上下文；缺失或无效文档需要所有者修改，或提交明确授予文件权限的任务。' : '检查真实登记文档及内容；仅有登记不能证明需求或规则内容有效。');
      }
      const references = scoped ? Array.isArray(task.refs) ? refsOf(task.refs) : null : null;
      present('generation.examples', 'generation', '已准入的视觉与引用示例', references ? references.some(ref => !ref.invalid && ref.kind !== 'knowledge') : undefined, '下次任务准入具体截图、页面或组件示例，并说明应遵循哪些特征。');
      add('generation.platform', 'generation', '平台与视口证据', !designs || !pages ? 'unknown' : designs.some(d => !['web', 'mobile'].includes(d.platform)) ? 'warning' : designs.length ? 'pass' : 'unknown', {designCount: designs?.length, webDesigns: designs?.filter(d => d.platform === 'web').length, mobileDesigns: designs?.filter(d => d.platform === 'mobile').length, pageCount: pages?.length, withViewport: pages?.filter(page => Number.isFinite(page.viewport?.width) && Number.isFinite(page.viewport?.height) && page.viewport.width > 0 && page.viewport.height > 0).length}, '区分 Web/mobile 平台与视口尺寸，再在保存结果上验证响应式行为。');
      add('generation.interactions', 'generation', '交互体验验证', 'unknown', {behaviorTested: false}, '测试保存页面的真实导航、表单、对话框和空/加载/错误/成功状态；元数据不能证明控件可用。', 'components');
    }
    if (categories.includes('assets')) {
      const assetFiles = files?.filter(file => !/^(?:text\/markdown|text\/plain)$/.test(file.mimeType || '') && !/(?:^|\/)readme(?:\.[^/]*)?$/i.test(file.path || '') && (file.type === 'asset' || /^(?:image|font)\//.test(file.mimeType || '') || file.type === 'style'));
      present('assets.project', 'assets', '已登记的目标资产', assetFiles ? assetFiles.length > 0 : undefined, '使用真实已准入附件或固定体系资源；通过现有资产操作实体化，并使用返回的真实相对位置。', 'assets');
      add('assets.provenance', 'assets', '资产哈希与来源元数据', !assetFiles || !assetFiles.length ? 'unknown' : assetFiles.every(file => /^[a-f0-9]{64}$/i.test(file.sha256 || '') && typeof file.source?.kind === 'string' && file.source.kind.length > 0) ? 'pass' : 'warning', {assetCount: assetFiles?.length, withHash: assetFiles?.filter(file => /^[a-f0-9]{64}$/i.test(file.sha256 || '')).length, withSource: assetFiles?.filter(file => typeof file.source?.kind === 'string' && file.source.kind.length > 0).length, bytesVerified: false}, '复用有验证证据的哈希和固定资源身份；复制 CSS、主题、图标、字体前核对来源。已保存元数据不验证当前文件字节。');
      const bindings = [];
      if (scoped) {
        if (plain(task.effectiveBindingsByDesign)) for (const id of ids) if (own(task.effectiveBindingsByDesign, id)) bindings.push(task.effectiveBindingsByDesign[id]);
        if (!bindings.length && task.effectiveBinding) bindings.push(task.effectiveBinding);
      } else if (designs && this.owner.workbench?.resolveBinding) {
        for (const design of designs.slice(0, MAX_RECORDS)) {
          try { bindings.push(await this.owner.workbench.resolveBinding(p, design.id, env)); }
          catch { env.signal?.throwIfAborted(); bindings.push(null); }
        }
        if (designs.length > MAX_RECORDS) report.limits.truncated = true;
      }
      const bound = bindings.filter(binding => binding && !binding.invalid && binding.systemId && Number.isSafeInteger(binding.version));
      const known = bindings.length && bindings.every(binding => binding && own(binding, 'systemId'));
      add('assets.specification', 'assets', '固定规范绑定', !known ? 'unknown' : bound.length < bindings.length ? 'warning' : 'pass', {inspectedBindings: bindings.length, pinnedBindings: bound.length, invalidBindings: bindings.filter(binding => binding?.invalid).length}, '提交前选择所需规范版本；当前任务只使用自身冻结的各 Design 绑定。', 'generation');
      const systems = bound.flatMap(binding => binding.system ? [binding.system] : Object.values(binding.systems || {})).slice(0, MAX_RECORDS);
      present('assets.tokens', 'assets', '固定设计令牌元数据', !systems.length ? undefined : systems.every(system => plain(system.tokens) && Object.keys(system.tokens).length > 0), '由所有者通过显式库操作整理可复用颜色、字体、间距和状态令牌。', 'components');
      present('assets.guidelines', 'assets', '固定设计体系规则', !systems.length ? undefined : systems.every(system => nonempty(system.guidelines) === true), '固定有示例的具体样式与交互规则，使用有真实来源的 CSS/主题/图标/字体。', 'components');
    }
    if (categories.includes('knowledge')) {
      if (scoped) {
        const refs = Array.isArray(task.refs) ? refsOf(task.refs) : null;
        const admitted = refs?.filter(ref => !ref.invalid && ref.kind === 'knowledge' && ref.readonly === true && ref.reference?.type === 'knowledge' && ref.reference.projectId === task.projectId && ref.reference.resourceId === 'knowledge:' + ref.reference.knowledgeId && identifier(ref.reference.knowledgeId, 'k') && Number.isSafeInteger(ref.reference.sourceVersion) && ref.reference.sourceVersion > 0 && ref.reference.readonly === true);
        const admittedIds = new Set(admitted?.map(ref => ref.reference.knowledgeId));
        const summary = task.knowledge;
        const warnings = list(summary?.warnings);
        const citations = list(summary?.citations)?.filter(citation => admittedIds.has(citation.knowledgeId) && admitted.some(ref => ref.reference.knowledgeId === citation.knowledgeId && ref.reference.sourceVersion === citation.sourceVersion));
        present('knowledge.admission', 'knowledge', '精确已准入知识引用', admitted ? admitted.length > 0 : undefined, '由所有者提交所需只读知识内容版本；诊断不枚举其他知识库。');
        add('knowledge.context', 'knowledge', '冻结知识检索摘要', !summary || !warnings ? 'unknown' : warnings.length ? 'warning' : admitted?.length && citations?.length ? 'pass' : 'unknown', {admittedReferences: admitted?.length, invalidReferences: refs?.filter(ref => ref.kind === 'knowledge' && ref.invalid).length, warningCount: warnings?.length, admittedCitationCount: citations?.length}, '通过精确已准入引用分段读取引用原文；所需内容版本变化时重新提交。');
        add('knowledge.indexes', 'knowledge', '当前索引与原件元数据', 'unknown', {liveLibrariesInspected: false, indexTested: false}, '请所有者核对当前库的精简状态。冻结检索摘要不能证明当前索引时效或原件可检索性。');
      } else {
        // Only explicitly bound libraries of this selected project; no library-wide enumeration.
        const ids = list(workbench.knowledgeIds);
        const selected = ids?.filter(id => identifier(id, 'k')).slice(0, MAX_RECORDS);
        if (ids && ids.length > MAX_RECORDS) report.limits.truncated = true;
        if (!selected) add('knowledge.admission', 'knowledge', '项目知识绑定元数据', 'unknown', {}, '准入知识引用前先核对所选项目的绑定。');
        else {
          let documents = 0, searchable = 0, stale = 0, unavailable = 0, indexUnknown = 0;
          for (const id of selected) {
            try {
              const value = (await this.owner.knowledge?.record?.(id, env.signal))?.value;
              if (!value || value.id !== id || !Array.isArray(value.documents)) throw new Error('Unavailable metadata');
              const docs = value.documents.slice(0, MAX_ITEMS);
              if (value.documents.length > MAX_ITEMS) report.limits.truncated = true;
              documents += docs.length; searchable += docs.filter(doc => doc.searchable === true).length;
              const index = this.owner.knowledge?.effectiveIndex ? this.owner.knowledge.effectiveIndex(value) : value.index;
              if (!index || !['not-indexed', 'indexing', 'ready', 'failed', 'stale'].includes(index.state) || index.state === 'ready' && (!Number.isSafeInteger(index.sourceVersion) || !Number.isSafeInteger(value.contentRevision))) indexUnknown++;
              else if (index.state !== 'ready' || index.sourceVersion !== value.contentRevision) stale++;
            } catch { env.signal?.throwIfAborted(); unavailable++; }
          }
          add('knowledge.bindings', 'knowledge', '已绑定知识库元数据', unavailable || indexUnknown ? 'unknown' : !selected.length || stale || searchable < documents ? 'warning' : 'pass', {boundLibraries: selected.length, unavailable, unknownIndexes: indexUnknown, originalCount: documents, searchableCount: searchable, nonsearchableCount: documents - searchable, notCurrent: stale}, '提供支持检索的配套文本，核对所选库状态，由所有者显式更新过期索引后再提交新任务。');
        }
      }
    }
  }
}
