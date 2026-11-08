// Design.pageIds is the persisted ordering authority. Preserve unlisted legacy
// pages from this Design until an explicit reorder includes them.
export function orderedDesignPages(pages, design) {
  const live = pages.filter(page => !page.deletedAt);
  if (!design) return live;
  const byId = new Map(live.map(page => [page.id, page]));
  const ordered = [], seen = new Set();
  for (const id of design.pageIds || []) {
    const page = byId.get(id);
    if (page && (!page.designId || page.designId === design.id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(page);
    }
  }
  for (const page of live) if (page.designId === design.id && !seen.has(page.id)) {
    seen.add(page.id);
    ordered.push(page);
  }
  return ordered;
}

export function reorderPageBefore(pages, movedId, beforeId) {
  const ids = pages.map(page => page.id);
  if (!movedId || movedId === beforeId || !ids.includes(movedId) || !ids.includes(beforeId)) return null;
  const remaining = ids.filter(id => id !== movedId);
  remaining.splice(remaining.indexOf(beforeId), 0, movedId);
  return remaining;
}
