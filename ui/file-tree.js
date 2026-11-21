// Navigation identities are view-only. Never pass these keys to file APIs.
// sourceId is authority; file.source is provenance and must not create a scope.
const key = (kind, sourceId, identity) => JSON.stringify([kind, sourceId || '', identity]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const basename = path => path.split('/').filter(Boolean).at(-1) || path;
const directory = file => file.entryType ? file.entryType === 'directory' : file.type === 'directory' || file.kind === 'directory' || (Array.isArray(file.children) && file.children.length > 0);
const cleanPath = value => String(value || '').replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');

export function fileNavigationId(file) {
  const identity = file.fileId || file.id;
  return key(identity ? 'file' : 'file-path', file.sourceId, identity || file.path);
}

/** Accept both Workspace's flat physical entries and nested directory DTOs.
 * Only directories implied by actual entries are synthesized; no files are invented.
 * File DTOs retain canonical IDs, source identity, registration and permission data.
 */
export function createFileTree(files = []) {
  const roots = [], directories = new Map(), seen = new Set(), leaves = [];
  const sourceRoot = (sourceId, name) => {
    if (!sourceId) return null;
    const id = key('source', sourceId, '');
    if (!directories.has(id)) {
      const node = {id, kind: 'source', sourceId, path: '', name: name || sourceId, parentId: null, children: []};
      directories.set(id, node); roots.push(node);
    }
    return directories.get(id);
  };
  const ensureDirectory = (path, sourceId, sourceName) => {
    if (!path) return sourceRoot(sourceId, sourceName);
    const id = key('directory', sourceId, path);
    if (!directories.has(id)) {
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const parent = ensureDirectory(parentPath, sourceId, sourceName);
      const node = {id, kind: 'directory', sourceId, path, name: basename(path), parentId: parent?.id || null, children: []};
      directories.set(id, node); (parent ? parent.children : roots).push(node);
    }
    return directories.get(id);
  };
  const visit = (entries, parentPath = '', inherited = {}) => {
    for (const original of Array.isArray(entries) ? entries : []) {
      if (!original || original.removedAt || original.deletedAt) continue;
      const sourceId = original.sourceId ?? inherited.sourceId ?? '';
      const sameScope = sourceId === (inherited.sourceId || '');
      const sourceName = original.sourceName || (sameScope ? inherited.sourceName : '') || sourceId;
      // Explicit paths are canonical. Only path-less nested DTOs use their parent.
      const path = cleanPath(original.path || [sameScope ? parentPath : '', original.name].filter(Boolean).join('/'));
      if (!path || path.split('/').some(part => /^(?:\.git(?:ignore|attributes|modules|keep)?|\.github|\.gitlab|\.gitlab-ci\.yml)$/i.test(part))) continue;
      const file = {...original, path, name: original.name || basename(path)};
      if (sourceId) file.sourceId = sourceId;
      if (sameScope && inherited.readonly) file.readonly = true;
      if (!file.id && file.fileId) file.id = file.fileId;
      if (directory(original)) {
        const node = ensureDirectory(path, sourceId, sourceName);
        node.file = file;
        node.name = file.name;
        visit(original.children, path, {sourceId, sourceName, readonly: file.readonly});
      } else {
        const id = fileNavigationId(file);
        if (seen.has(id)) continue;
        seen.add(id);
        const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const parent = ensureDirectory(parentPath, sourceId, sourceName);
        const node = {id, kind: 'file', sourceId, path, name: file.name, file, parentId: parent?.id || null, children: []};
        (parent ? parent.children : roots).push(node); leaves.push(node);
      }
    }
  };
  visit(files);
  const counts = new Map();
  for (const node of leaves) counts.set(node.name, (counts.get(node.name) || 0) + 1);
  for (const node of leaves) {
    node.duplicateName = counts.get(node.name) > 1;
    node.location = [node.sourceId, node.path].filter(Boolean).join(' · ');
  }
  const sort = nodes => {
    nodes.sort((a, b) => Number(a.kind === 'file') - Number(b.kind === 'file') || compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.path, b.path) || compare(a.id, b.id));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

export function flattenFileTree(tree) {
  return tree.flatMap(node => [node, ...flattenFileTree(node.children)]);
}

/** Persist this result inside the owning project's workspace.state, not metadata.
 * Unknown fields survive; stale/duplicate IDs are pruned without losing valid order.
 * An absent expanded array defaults to opening the root directory groups.
 */
export function reconcileFileViewState(tree, viewState = {}) {
  const nodes = flattenFileTree(tree), ids = new Set(nodes.map(node => node.id));
  const directories = new Set(nodes.filter(node => node.kind !== 'file').map(node => node.id));
  const prune = (values, valid) => [...new Set((Array.isArray(values) ? values : []).filter(id => valid.has(id)))];
  return {...viewState,
    expanded: Array.isArray(viewState.expanded) ? prune(viewState.expanded, directories) : tree.filter(node => node.kind !== 'file').map(node => node.id),
    order: prune(viewState.order, ids)};
}

export function orderFileTree(tree, viewState = {}) {
  const positions = new Map((viewState.order || []).map((id, i) => [id, i]));
  const visit = nodes => nodes.map(node => ({...node, children: visit(node.children)})).sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  return visit(tree);
}

/** Ancestors of matches stay visible. Matching a directory reveals its subtree. */
export function searchFileTree(tree, query = '') {
  const term = String(query).trim().toLowerCase();
  if (!term) return tree;
  const visit = (nodes, ancestorMatched = false) => nodes.flatMap(node => {
    const matches = ancestorMatched || [node.name, node.path, node.sourceId, node.file?.sourceName].some(value => String(value || '').toLowerCase().includes(term));
    const children = visit(node.children, matches);
    return matches || children.length ? [{...node, children}] : [];
  });
  return visit(tree);
}

export function visibleFileNodes(tree, expanded = []) {
  const open = new Set(expanded);
  const visit = (nodes, level = 1) => nodes.flatMap(node => [{...node, level}, ...(open.has(node.id) ? visit(node.children, level + 1) : [])]);
  return visit(tree);
}

/** Only sibling view ordering changes. Cross-directory/source moves are rejected. */
export function reorderFileView(tree, viewState, movedId, targetId, after = false) {
  const state = reconcileFileViewState(tree, viewState);
  const ordered = orderFileTree(tree, state), nodes = flattenFileTree(ordered);
  const moved = nodes.find(node => node.id === movedId), target = nodes.find(node => node.id === targetId);
  if (!moved || !target || moved.id === target.id || moved.parentId !== target.parentId) return null;
  const siblings = (moved.parentId ? nodes.find(node => node.id === moved.parentId).children : ordered).map(node => node.id).filter(id => id !== movedId);
  siblings.splice(siblings.indexOf(targetId) + Number(after), 0, movedId);
  // Replace just this group's slots, retaining every other group's relative order.
  const siblingSet = new Set(siblings), all = nodes.map(node => node.id);
  let index = 0;
  return {...state, order: all.map(id => siblingSet.has(id) ? siblings[index++] : id)};
}
