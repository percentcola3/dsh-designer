export const emptyTabs = {items: [], activeId: null};
export function resourceKey(projectId, resource) { return `${projectId}:${resource.type || 'file'}:${resource.id || resource.path}`; }
export function tabReducer(state, action) {
  const items = state.items || [];
  if (action.type === 'restore') return {items: (action.state?.items || []).map(t => ({...t, loading: false})), activeId: action.state?.activeId || action.state?.items?.[0]?.id || null};
  if (action.type === 'open') {
    const tab = action.tab, found = items.find(t => t.id === tab.id);
    if (found) return {...state, activeId: found.id, items: items.map(t => t.id === found.id ? {...t, ...(action.keep ? {preview: false} : {})} : t)};
    const preview = items.find(t => t.preview && !t.dirty && !t.pinned);
    const next = action.keep || !preview ? [...items, {...tab, preview: !action.keep}] : items.map(t => t.id === preview.id ? {...tab, preview: true} : t);
    return {items: next, activeId: tab.id};
  }
  if (action.type === 'activate') return items.some(t => t.id === action.id) ? {...state, activeId: action.id} : state;
  if (action.type === 'update') return {...state, items: items.map(t => t.id === action.id ? {...t, ...action.patch, ...(action.patch.dirty ? {preview: false} : {})} : t)};
  if (action.type === 'keep') return {...state, items: items.map(t => t.id === action.id ? {...t, preview: false} : t)};
  if (action.type === 'pin') return {...state, items: items.map(t => t.id === action.id ? {...t, preview: false, pinned: !t.pinned} : t)};
  if (action.type === 'close') {
    const index = items.findIndex(t => t.id === action.id), next = items.filter(t => t.id !== action.id);
    return {items: next, activeId: state.activeId === action.id ? next[Math.min(index, next.length - 1)]?.id || null : state.activeId};
  }
  if (action.type === 'reorder') {
    const from = items.findIndex(t => t.id === action.id), to = items.findIndex(t => t.id === action.beforeId);
    if (from < 0 || to < 0 || from === to) return state;
    const next = [...items], [moved] = next.splice(from, 1); next.splice(to, 0, moved); return {...state, items: next};
  }
  return state;
}
export function tabTitle(tab, items) {
  const duplicates = items.filter(t => t.name === tab.name);
  if (duplicates.length < 2) return tab.name;
  const parent = (tab.path || '').split('/').slice(0, -1).join('/');
  return `${tab.name} — ${parent || tab.resourceId || tab.id}`;
}
export function closeCandidates(state, id, mode) {
  const i = state.items.findIndex(t => t.id === id);
  return state.items.filter((t, index) => !t.pinned && (mode === 'others' ? t.id !== id : mode === 'right' ? index > i : t.id === id)).map(t => t.id);
}
