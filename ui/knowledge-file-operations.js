import {knowledgeUploadPath} from './knowledge-panel-state.js';

export const KNOWLEDGE_TRANSFER_TYPE = 'application/x-dsh-knowledge-files';
export const KNOWLEDGE_TRANSFER_PREFIX = 'DSH_KNOWLEDGE_FILES_V1\n';

export function knowledgeTransfer(knowledgeId, documents, {folder, cut = false} = {}) {
  const parents = documents.map(document => (document.relativePath || document.name).split('/').slice(0, -1));
  const common = parents[0] || [];
  const basePath = folder === undefined ? common.filter((_part, index) => parents.every(parts => parts.slice(0, index + 1).join('/') === common.slice(0, index + 1).join('/'))).join('/') : folder.split('/').slice(0, -1).join('/');
  return {version: 1, knowledgeId, cut, folder, basePath,
    files: documents.map(document => ({documentId: document.id, relativePath: document.relativePath || document.name, expectedSha256: document.sha256}))};
}

export function parseKnowledgeTransfer(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) return null;
  try {
    const value = JSON.parse(text.startsWith(KNOWLEDGE_TRANSFER_PREFIX) ? text.slice(KNOWLEDGE_TRANSFER_PREFIX.length) : text);
    if (value.version !== 1 || typeof value.cut !== 'boolean' || !/^k-[a-zA-Z0-9-]{1,80}$/.test(value.knowledgeId) || !Array.isArray(value.files) || !value.files.length || value.files.length > 2000 || new Set(value.files.map(file => file?.documentId)).size !== value.files.length || typeof value.basePath !== 'string') return null;
    if (value.basePath) knowledgeUploadPath({relativePath: value.basePath});
    if (value.folder !== undefined && typeof value.folder !== 'string') return null;
    if (value.folder) knowledgeUploadPath({relativePath: value.folder});
    for (const file of value.files) {
      if (!/^d-[a-zA-Z0-9-]{1,80}$/.test(file.documentId) || !/^[a-f0-9]{64}$/.test(file.expectedSha256)) return null;
      knowledgeUploadPath({relativePath: file.relativePath});
      if (value.basePath && !file.relativePath.startsWith(value.basePath + '/')) return null;
      if (value.folder && !file.relativePath.startsWith(value.folder + '/')) return null;
    }
    return value;
  } catch {return null;}
}

export function availableKnowledgePath(path, occupied, directory = false) {
  const slash = path.lastIndexOf('/'), parent = path.slice(0, slash + 1), name = path.slice(slash + 1);
  const dot = directory ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : '';
  let candidate = path, count = 2;
  while (occupied.some(value => value === candidate || value.startsWith(candidate + '/') || candidate.startsWith(value + '/'))) {
    // A destination whose ancestor is a file needs a different directory.
    if (occupied.some(value => candidate.startsWith(value + '/'))) throw new Error('目标目录路径被同名文件占用。');
    candidate = `${parent}${stem} (${count++})${extension}`;
  }
  return candidate;
}

export function knowledgePastePaths(transfer, destination, documents, moving = false) {
  if (destination) knowledgeUploadPath({relativePath: destination});
  if (moving && transfer.folder !== undefined && (destination === transfer.folder || destination.startsWith(transfer.folder + '/'))) throw new Error('无法将目录移动到自身或其子目录。');
  const occupied = documents.map(document => document.relativePath || document.name), roots = new Map(), allocated = new Set();
  return transfer.files.map(file => {
    const suffix = file.relativePath.slice(transfer.basePath ? transfer.basePath.length + 1 : 0);
    const parts = suffix.split('/'), root = parts[0];
    if (!roots.has(root)) {
      const target = destination ? `${destination}/${root}` : root;
      const next = moving ? target : availableKnowledgePath(target, occupied, parts.length > 1);
      roots.set(root, next);
      occupied.push(next);
    }
    let relativePath = [roots.get(root), ...parts.slice(1)].join('/');
    if (!moving && allocated.has(relativePath)) relativePath = availableKnowledgePath(relativePath, [...occupied, ...allocated]);
    allocated.add(relativePath);
    return {...file, relativePath};
  });
}

export function knowledgeFileWithPath(file, relativePath) {
  knowledgeUploadPath({relativePath});
  const result = new File([file], file.name, {type: file.type, lastModified: file.lastModified});
  Object.defineProperty(result, 'relativePath', {value: relativePath});
  return result;
}

export async function knowledgeDroppedFiles(dataTransfer) {
  const entries = Array.from(dataTransfer.items || []).map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dataTransfer.files || []);
  const files = [];
  async function visit(entry, parent = '') {
    const path = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return;
    knowledgeUploadPath({relativePath: path});
    if (entry.isFile) {
      if (files.length >= 2000) throw new Error('一次最多添加 2000 个文件。');
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      files.push(knowledgeFileWithPath(file, path));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!children.length) break;
        for (const child of children) await visit(child, path);
      }
    }
  }
  for (const entry of entries) await visit(entry);
  return files;
}
