// Text offsets are UTF-16 offsets, matching textarea.selectionStart/End.
export function detectMention(value, start, end = start) {
  if (typeof value !== 'string' || !Number.isInteger(start) || start < 0 || start > value.length || start !== end) return null;
  const before = value.slice(0, start);
  const match = /(?:^|[\s([{，。；：、！？])@([^\s@]*)$/u.exec(before);
  if (!match) return null;
  return {start: start - match[1].length - 1, end: start, query: match[1]};
}

export function mentionKey(mention) {
  return mention ? JSON.stringify([mention.start, mention.end, mention.query]) : '';
}

// A failed asynchronous insertion must leave both the draft and selection alone.
export function applyInsertion(current, text, span, maxLength = 20000) {
  if (!current?.mounted || !current.editable || current.composing || typeof text !== 'string' || !span
    || span.owner !== current.owner || span.revision !== current.revision) return null;
  const {start, end} = span, value = current.value;
  if (typeof value !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end < start || end > value.length) return null;
  const next = value.slice(0, start) + text + value.slice(end);
  if (next.length > maxLength) return null;
  return {value: next, caret: start + text.length};
}

export function referenceKey(reference) {
  const ref = reference?.reference || reference;
  if (ref?.type === 'project') return `project:${ref.referencedProjectId || ref.resourceId}`;
  if (ref?.type === 'directory') return `directory:${ref.projectId||''}:${ref.resourceId||ref.rootPath}`;
  if (ref?.type === 'knowledge') return `knowledge:${ref.projectId||''}:${ref.knowledgeId||ref.resourceId}`;
  if (ref?.type === 'file' || ref?.fileId) return JSON.stringify(['file', ref.sourceId || '', ref.fileId || ref.resourceId]);
  return JSON.stringify(ref);
}

export function appendReference(references, reference) {
  const index=references.findIndex(existing=>referenceKey(existing)===referenceKey(reference));
  if(index<0)return [...references,reference];
  const previous=references[index]?.reference||references[index],next=reference?.reference||reference;
  if(next?.type==='knowledge'&&previous.sourceVersion!==next.sourceVersion)return references.map((item,i)=>i===index?reference:item);
  return references;
}

export function isAvailable(item) {
  return Boolean(item) && !item.deleted && !item.deletedAt && !item.removedAt && !item.archived && !item.archivedAt
    && !item.unavailable && item.available !== false && !['deleted', 'archived', 'unavailable'].includes(item.status);
}

export function mentionCandidates({variant, projects = [], knowledge = [], projectId, files = [], query = ''}) {
  const search = query.trim().toLocaleLowerCase(), seen = new Set();
  const matches = item => [item.name, item.label, item.path].some(value => String(value || '').toLocaleLowerCase().includes(search));
  const others = projects.filter(p => {
    if (!p?.id || p.id === projectId || !isAvailable(p) || !matches(p) || seen.has(`p:${p.id}`)) return false;
    // A project overview requires a real fixed project revision.
    if (!Number.isSafeInteger(p.revision) || p.revision < 1) return false;
    seen.add(`p:${p.id}`); return true;
  }).map(project => ({kind: 'project', key: `project:${project.id}`, item: project}));
  const walk = (entries, parent = '') => entries.flatMap(file => {
    if (!isAvailable(file)) return [];
    const path = file.path || [parent, file.name].filter(Boolean).join('/');
    const item = {...file, path}, id = file.id || file.fileId;
    const directory = file.type === 'directory' || file.kind === 'directory' || file.isDirectory || Array.isArray(file.children);
    const key = JSON.stringify(['file', file.sourceId || '', id]);
    const include = id && !directory && matches(item) && !seen.has(key);
    if (include) seen.add(key);
    return [...(include ? [{kind: 'file', key, item}] : []), ...walk(file.children || [], path)];
  });
  const libraries=variant==='canvas'&&projectId?knowledge.filter(item=>item?.id&&isAvailable(item)&&matches(item)&&!seen.has(`k:${item.id}`)&&seen.add(`k:${item.id}`)).map(item=>({kind:'knowledge',key:`knowledge:${item.id}`,item})):[];
  return [...others, ...libraries, ...(variant === 'canvas' && projectId ? walk(files) : [])];
}
