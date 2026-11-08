const STORAGE_PREFIX = 'dsh-designer:recent-project-visits:v1:';
const MAX_VISITS = 100;

function storageKey(libraryRoot) {
  return typeof libraryRoot === 'string' && libraryRoot.trim()
    ? `${STORAGE_PREFIX}${encodeURIComponent(libraryRoot)}`
    : null;
}

function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function compactVisits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, time]) => id.trim() && typeof time === 'number' && Number.isFinite(time) && time >= 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_VISITS));
}

/** Read this library's local visit history; unavailable or corrupt storage is an empty history. */
export function readRecentProjectVisits(storage, libraryRoot) {
  const key = storageKey(libraryRoot);
  if (!key) return {};
  try {
    return compactVisits(JSON.parse(storage?.getItem(key) ?? 'null'));
  } catch {
    return {};
  }
}

/** Record UI navigation only. This never updates project metadata or writes project files. */
export function recordRecentProjectVisit(storage, libraryRoot, projectId, now = Date.now()) {
  const visits = readRecentProjectVisits(storage, libraryRoot);
  const key = storageKey(libraryRoot);
  if (!key || typeof projectId !== 'string' || !projectId.trim()) return visits;
  if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) return visits;
  const next = compactVisits({...visits, [projectId]: now});
  try {
    storage?.setItem(key, JSON.stringify(next));
  } catch {
    // Navigation still works when browser storage is disabled or full.
  }
  return next;
}

/** Stable, unique project summaries ordered by real project activity or this library's visits. */
export function getRecentProjects(projects, visits = {}, limit = 5) {
  const count = typeof limit === 'number' && Number.isFinite(limit)
    ? Math.max(0, Math.min(5, Math.floor(limit)))
    : 5;
  const seen = new Set();
  return (Array.isArray(projects) ? projects : [])
    .filter(project => {
      if (!project || typeof project.id !== 'string' || !project.id.trim()
        || project.deletedAt || project.archived || project.unavailable || seen.has(project.id)) return false;
      seen.add(project.id);
      return true;
    })
    .map((project, index) => ({
      project,
      index,
      time: Math.max(timestamp(project.updatedAt), timestamp(project.createdAt),
        Object.prototype.hasOwnProperty.call(visits || {}, project.id) ? timestamp(visits[project.id]) : 0),
    }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .slice(0, count)
    .map(({project}) => project);
}
