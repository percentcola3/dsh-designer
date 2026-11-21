const INDEX_STATES = {
  'not-indexed': ['等待整理', 'muted'], queued: ['等待整理', 'pending'], indexing: ['正在整理', 'pending'],
  ready: ['可搜索', 'ready'], failed: ['整理失败', 'failed'], stale: ['等待更新', 'pending'],
};
export function knowledgeIndexState(knowledge) {
  const index = knowledge?.index || {}; let state = index.state || 'not-indexed';
  if (state === 'ready' && (!Number.isSafeInteger(index.sourceVersion) || !Number.isSafeInteger(knowledge?.contentRevision))) state = 'unknown';
  else if (state === 'ready' && index.sourceVersion !== knowledge.contentRevision) state = 'stale';
  const [label, tone] = index.error?.code === 'INDEX_CANCELLED' ? ['已取消', 'muted'] : INDEX_STATES[state] || ['状态待确认', 'muted'];
  return { ...index, state, label, tone, error: index.error?.message || index.error || '', ready: state === 'ready' };
}
export function knowledgeIndexProgress(progress) {
  if (progress?.phase === 'cancelling') return '正在取消…';
  if (Number.isSafeInteger(progress?.completed) && Number.isSafeInteger(progress?.total) && progress.total > 0 && progress.completed >= 0 && progress.completed <= progress.total) return `${progress.completed}/${progress.total}`;
  if (Number.isSafeInteger(progress?.filesIndexed) && Number.isSafeInteger(progress?.filesTotal) && progress.filesTotal > 0 && progress.filesIndexed >= 0 && progress.filesIndexed <= progress.filesTotal) return `${progress.filesIndexed}/${progress.filesTotal}`;
  return '';
}
export function knowledgeImportState(job) {
  return { queued: '等待导入', scanning: '正在读取', fetching: '正在下载', importing: '正在导入', cancelling: '正在取消', completed: '导入完成', partial: '部分文件未导入', failed: '导入失败', cancelled: '已取消' }[job?.status] || '状态待确认';
}
export function knowledgeImportRunning(job) { return ['queued', 'scanning', 'fetching', 'importing', 'cancelling'].includes(job?.status); }
export function knowledgeDraftDirty(form) {
  if (!form?.draft || !form?.original) return false;
  return JSON.stringify(form.draft) !== JSON.stringify(form.original);
}
export function knowledgeViewTicket(view, requestId) { return { knowledgeId: view.knowledgeId || '', sequence: view.sequence || 0, requestId }; }
export function knowledgeResponseCurrent(ticket, view, requestId) { return ticket.knowledgeId === (view.knowledgeId || '') && ticket.sequence === (view.sequence || 0) && ticket.requestId === requestId; }
export function knowledgeUploadPath(file) {
  const path = file.webkitRelativePath || file.relativePath || file.name;
  if (typeof path !== 'string' || !path || path.length > 2000 || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('文件的相对路径无效。');
  return path;
}
function privateKnowledgePath(path) {
  return path.split('/').some(segment => segment.startsWith('.') || /^(?:node_modules|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|[^/]+\.(?:pem|key|p12|pfx))$/i.test(segment));
}
export function knowledgeUploadPlan(files) {
  const candidates = [], skipped = [];
  for (const file of files) {
    const relativePath = knowledgeUploadPath(file), name = file.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 500 || name === '.' || name === '..' || /[\x00-\x1f\x7f/\\]/.test(name)) throw new Error('文件名称无效。');
    if (privateKnowledgePath(relativePath) || privateKnowledgePath(name)) skipped.push(relativePath);
    else candidates.push({ file, relativePath });
  }
  return { candidates, skipped };
}
export async function uploadKnowledgeFiles({ files, knowledge, upload, onProgress, batchId, continueOnError = false }) {
  let current = knowledge, plan;
  const saved = [], failures = [];
  try { plan = knowledgeUploadPlan(files); }
  catch (cause) { throw Object.assign(new Error(`没有上传原件；文件路径检查失败：${cause.message}`), { code: 'KNOWLEDGE_INVALID_UPLOAD_PATH', cause, saved, skipped: [], knowledge: current }); }
  const { candidates, skipped } = plan;
  for (const { file, relativePath } of candidates) {
    try {
      const result = await upload(file, { purpose: 'knowledge', knowledgeId: current.id, expectedRevision: current.revision, relativePath, ...(batchId ? { batchId } : {}) });
      const next = result.knowledge || result;
      if (!Number.isInteger(next.revision)) throw Object.assign(new Error('上传响应缺少目录版本，请刷新后再继续。'), { code: 'KNOWLEDGE_UPLOAD_RESPONSE_INVALID' });
      current = { ...current, ...next }; saved.push(relativePath);
    } catch (cause) {
      failures.push({ path: relativePath, code: cause.code || 'KNOWLEDGE_UPLOAD_FAILED', message: cause.message });
      if (!continueOnError || /CONFLICT|STALE|ABORT|UPLOAD_RESPONSE_INVALID|FS_SANDBOX_DENIED|KNOWLEDGE_ARCHIVED|IMPORT_BATCH_CLOSED/.test(cause.code || '')) throw Object.assign(new Error(`已保存 ${saved.length}/${candidates.length} 个文件，跳过 ${skipped.length} 个；${relativePath} 上传失败：${cause.message}`), { code: cause.code || 'KNOWLEDGE_UPLOAD_FAILED', cause, path: relativePath, saved, skipped, failures, knowledge: current });
    }
    onProgress?.({ saved: [...saved], skipped: [...skipped], failures: [...failures], total: candidates.length, knowledge: current });
  }
  return { knowledge: current, saved, skipped, failures };
}
export async function importKnowledgeFiles({ files, knowledge, api, upload, onProgress }) {
  const plan = knowledgeUploadPlan(files);
  if (!plan.candidates.length) return { knowledge, saved: [], skipped: plan.skipped, failures: [], allSkipped: true };
  const started = await api('knowledge.import.begin', { knowledgeId: knowledge.id, expectedRevision: knowledge.revision, source: { kind: 'upload' } });
  let result, failure;
  try { result = await uploadKnowledgeFiles({ files, knowledge: started.knowledge, upload, onProgress, batchId: started.batchId, continueOnError: true }); }
  catch (error) { failure = error; result = { knowledge: error.knowledge || started.knowledge, saved: error.saved || [], skipped: error.skipped || plan.skipped, failures: error.failures || [] }; }
  if (failure && /CONFLICT|STALE/.test(failure.code || '')) {
    const latest = (await api('knowledge.get', { knowledgeId: knowledge.id })).knowledge;
    if (latest?.lastImport?.id !== started.batchId || latest.lastImport.state !== 'importing') throw Object.assign(failure, { knowledge: latest || result.knowledge });
    result.knowledge = latest;
  }
  let completed;
  try { completed = await api('knowledge.import.complete', { knowledgeId: knowledge.id, batchId: started.batchId, expectedRevision: result.knowledge.revision, failures: result.failures, ...(failure ? { cancelled: true } : {}) }); }
  catch (error) { throw Object.assign(error, { saved: result.saved, skipped: result.skipped, failures: result.failures, knowledge: result.knowledge }); }
  result = { ...result, ...completed, saved: result.saved, skipped: result.skipped, failures: result.failures };
  if (failure) throw Object.assign(failure, { knowledge: completed.knowledge || result.knowledge });
  return result;
}
export function buildKnowledgeTree(documents, query = '') {
  const roots = [], directories = new Map(), needle = query.trim().toLocaleLowerCase();
  for (const document of documents || []) {
    const path = knowledgeUploadPath({ name: document.name || document.id, relativePath: document.relativePath || document.name });
    if (needle && !path.toLocaleLowerCase().includes(needle)) continue;
    const parts = path.split('/'); let children = roots, parent = '';
    for (const name of parts.slice(0, -1)) {
      const directoryPath = parent ? `${parent}/${name}` : name;
      let directory = directories.get(directoryPath);
      if (!directory) { directory = { type: 'folder', name, path: directoryPath, children: [] }; directories.set(directoryPath, directory); children.push(directory); }
      children = directory.children; parent = directoryPath;
    }
    children.push({ type: 'file', name: parts.at(-1), path, document, key: document.id || path });
  }
  const sort = values => values.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'folder' ? -1 : 1).map(value => value.type === 'folder' ? { ...value, children: sort(value.children) } : value);
  return sort(roots);
}
export function knowledgeImportName(files = [], repositoryUrl = '') {
  const first = files[0]?.webkitRelativePath || files[0]?.relativePath || '';
  if (first.includes('/')) return first.split('/')[0];
  if (repositoryUrl.trim()) return repositoryUrl.trim().split(/[/:]/).filter(Boolean).at(-1)?.replace(/\.git$/i, '') || 'Git 项目';
  return files.length === 1 ? files[0].name : '本地资料';
}
export function knowledgeTextPreview(value) { return typeof value?.content === 'string' ? value.content : typeof value?.text === 'string' ? value.text : null; }
const TEXT_EXTENSIONS = /\.(?:svg|txt|md|mdx|rst|csv|tsv|json|jsonl|ya?ml|toml|ini|conf|config|log|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|py|rb|php|go|rs|c|cc|cpp|h|hpp|java|kt|swift|sh|bash|zsh|sql|graphql|gql|proto|dockerfile|gitignore)$/i;
export function isKnowledgeText(document) { return /^text\//i.test(document?.mimeType || '') || /^application\/(?:json|[a-z0-9.+-]+\+json|javascript|ecmascript|xml|[a-z0-9.+-]+\+xml|yaml|x-yaml|toml)$/i.test(document?.mimeType || '') || TEXT_EXTENSIONS.test(document?.name || '') || /^(?:Dockerfile|Makefile|LICENSE|README|\.gitignore)$/i.test(document?.name || ''); }
export async function loadKnowledgeTextPreview(value, document, fetcher = globalThis.fetch, maxBytes = 512 * 1024, signal) {
  if (!isKnowledgeText(document) || !value.originalUrl) return value;
  const response = await fetcher(value.originalUrl, { credentials: 'same-origin', ...(signal ? {signal} : {}) });
  if (!response.ok) throw new Error(`原件读取失败：HTTP ${response.status}`);
  if (!response.body?.getReader) throw new Error('当前环境不支持文本预览，请下载原件查看。');
  const reader = response.body.getReader(), chunks = []; let length = 0, truncated = false;
  try {
    while (true) { const { done, value: chunk } = await reader.read(); if (done) break; const remaining = maxBytes - length;
      if (chunk.byteLength > remaining) { chunks.push(chunk.subarray(0, remaining)); length += remaining; truncated = true; break; }
      chunks.push(chunk); length += chunk.byteLength; if (length === maxBytes) { truncated = true; break; }
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { ...value, content: new TextDecoder().decode(bytes), truncated };
}
export function knowledgeFileSize(bytes = 0) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

export function knowledgeTreeEntries(nodes) {
  return nodes.flatMap(node => node.type === 'folder'
    ? [{path: node.path, name: node.name, meta: {kind: 'directory'}}, ...knowledgeTreeEntries(node.children)]
    : [{path: `${node.path}#${node.document.id}`, name: node.name, meta: {kind: 'file', documentId: node.document.id}}]);
}

export function knowledgePreviewTab(value, document) {
  const text = isKnowledgeText(document);
  const media = /^image\/|^audio\/|^video\/|^application\/pdf$/i.test(document.mimeType || '') || /\.(?:pdf|png|jpe?g|gif|webp|avif|bmp|ico|mp3|wav|ogg|flac|aac|m4a|mp4|webm|mov|m4v)$/i.test(document.name);
  return {id: document.id, resourceId: document.id, name: document.name, path: document.relativePath || document.name,
    type: text || media ? 'file' : 'binary', binary: !text && !media,
    mimeType: text && document.mimeType === 'application/octet-stream' ? 'text/plain' : document.mimeType,
    readonly: true, content: knowledgeTextPreview(value) || '', previewUrl: value.originalUrl, downloadUrl: value.downloadUrl,
    byteLength: document.bytes, truncated: Boolean(value.truncated)};
}

export function knowledgeLinkedDocument(document, href, documents) {
  const resolved = new URL(href, `https://knowledge.local/${document.relativePath || document.name}`);
  if (resolved.origin !== 'https://knowledge.local') throw new Error('资源链接不在当前知识库内。');
  const path = decodeURIComponent(resolved.pathname.slice(1));
  const matches = documents.filter(item => (item.relativePath || item.name) === path);
  if (matches.length !== 1) throw new Error('知识库资源不存在或路径不唯一。');
  return matches[0];
}
