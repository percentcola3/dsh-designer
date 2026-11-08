// Pure PDF view geometry/search state. Page numbers are always one-based.
export const PDF_CSS_UNITS = 96 / 72;
export const PDF_MAX_MOUNTED_PAGES = 7;
export const PDF_MAX_SEARCH_RESULTS = 10000;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function normalizePDFViewState(value = {}, pageCount = Infinity) {
  value = value && typeof value === 'object' ? value : {};
  const legacyZoom = Number(value.pdfZoom) / 100;
  return {
    page: clamp(Math.trunc(finite(value.page, 1)), 1, Math.max(1, pageCount)),
    zoom: clamp(finite(value.zoom, legacyZoom > 0 ? legacyZoom : 1), 0.25, 4),
    pageOffset: clamp(finite(value.pageOffset, 0), -1, 1),
    scrollLeft: Math.max(0, finite(value.scrollLeft, 0)),
    search: typeof value.search === 'string' ? value.search.slice(0, 500) : '',
    searchIndex: Math.max(0, Math.trunc(finite(value.searchIndex, 0))),
  };
}
export function createPDFLayout(pageCount, sizes = {}, zoom = 1) {
  const first = sizes[1] || { width: 612, height: 792 };
  const scale = normalizePDFViewState({ zoom }).zoom * PDF_CSS_UNITS;
  let top = 20, width = 0;
  const pages = Array.from({ length: Math.max(0, Math.trunc(pageCount)) }, (_, index) => {
    const size = sizes[index + 1] || first;
    const w = Math.max(1, finite(size.width, first.width)) * scale;
    const h = Math.max(1, finite(size.height, first.height)) * scale;
    const page = { page: index + 1, top, bottom: top + h, width: w, height: h };
    top = page.bottom + 20;
    width = Math.max(width, w);
    return page;
  });
  return { pages, height: top, width: width + 40 };
}
function firstIntersecting(pages, top) {
  let lo = 0, hi = pages.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pages[mid].bottom <= top) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, Math.max(0, pages.length - 1));
}
export function currentPDFPage(layout, scrollTop, viewportHeight) {
  const { pages } = layout;
  if (!pages.length) return 1;
  const top = Math.max(0, scrollTop), bottom = top + Math.max(1, viewportHeight);
  let best = firstIntersecting(pages, top), area = -1;
  for (let i = best; i < pages.length && pages[i].top < bottom; i++) {
    const visible = Math.max(0, Math.min(bottom, pages[i].bottom) - Math.max(top, pages[i].top));
    if (visible > area) { best = i; area = visible; }
  }
  return pages[best].page;
}
export function visiblePDFPages(layout, scrollTop, viewportHeight, maxPages = PDF_MAX_MOUNTED_PAGES) {
  const { pages } = layout;
  if (!pages.length) return [];
  const current = currentPDFPage(layout, scrollTop, viewportHeight) - 1;
  const limit = Math.max(1, Math.trunc(maxPages));
  // Keep the actual current page mounted even in very tall viewports.
  const start = Math.max(0, Math.min(current - 2, pages.length - limit));
  return pages.slice(start, start + limit);
}
export function pdfScrollState(layout, scrollTop, viewportHeight, scrollLeft = 0) {
  const page = currentPDFPage(layout, scrollTop, viewportHeight);
  const box = layout.pages[page - 1];
  return { page, pageOffset: box ? clamp((scrollTop - box.top) / box.height, -1, 1) : 0, scrollLeft: Math.max(0, scrollLeft) };
}
export function pdfScrollTarget(layout, value) {
  const state = normalizePDFViewState(value, layout.pages.length);
  const box = layout.pages[state.page - 1];
  return { top: Math.max(0, box ? box.top + box.height * state.pageOffset : 0), left: state.scrollLeft };
}
export function buildPDFText(items) {
  let text = '';
  const spans = [];
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const start = text.length;
    text += item.str;
    spans.push({ start, end: text.length });
    if (item.hasEOL) text += '\n';
  }
  return { text, spans };
}
function foldedPDFText(text) {
  let folded = '', starts = [], ends = [], offset = 0;
  for (const char of text) {
    const start = offset;
    offset += char.length;
    const expanded = char.normalize('NFKC').toLowerCase();
    for (const unit of expanded) {
      if (/\s/u.test(unit)) {
        if (folded.endsWith(' ')) { ends[ends.length - 1] = offset; continue; }
        folded += ' '; starts.push(start); ends.push(offset);
      } else {
        folded += unit;
        for (let i = 0; i < unit.length; i++) { starts.push(start); ends.push(offset); }
      }
    }
  }
  return { text: folded, starts, ends };
}
export function findPDFMatches(text, query, limit = PDF_MAX_SEARCH_RESULTS) {
  const needle = foldedPDFText(String(query || '')).text.trim();
  if (!needle || limit <= 0) return [];
  const haystack = foldedPDFText(text), matches = [];
  let offset = 0;
  while (matches.length < limit) {
    const at = haystack.text.indexOf(needle, offset);
    if (at < 0) break;
    const match = { start: haystack.starts[at], end: haystack.ends[at + needle.length - 1] };
    const previous = matches[matches.length - 1];
    if (!previous || previous.start !== match.start || previous.end !== match.end) matches.push(match);
    offset = at + needle.length;
  }
  return matches;
}
export function pdfMatchSegments(start, end, matches) {
  return matches.flatMap((match, index) => {
    const a = Math.max(start, match.start), b = Math.min(end, match.end);
    return a < b ? [{ start: a - start, end: b - start, index }] : [];
  });
}
export function nextPDFSearchIndex(index, direction, count) {
  return count > 0 ? ((Math.trunc(index) + direction) % count + count) % count : 0;
}
// Shared by page render tasks; aborted queued tasks never acquire a canvas.
export function createPDFTaskQueue(concurrency = 2) {
  let active = 0;
  const pending = [];
  const abortError = () => Object.assign(new Error('PDF task cancelled'), { name: 'AbortError' });
  const pump = () => {
    while (active < Math.max(1, concurrency) && pending.length) {
      const entry = pending.shift();
      entry.signal?.removeEventListener('abort', entry.abort);
      if (entry.signal?.aborted) { entry.reject(abortError()); continue; }
      active++;
      Promise.resolve().then(() => {
        if (entry.signal?.aborted) throw abortError();
        return entry.run();
      }).then(entry.resolve, entry.reject).finally(() => { active--; pump(); });
    }
  };
  return (run, signal) => new Promise((resolve, reject) => {
    const entry = { run, signal, resolve, reject, abort: null };
    entry.abort = () => {
      const index = pending.indexOf(entry);
      if (index >= 0) { pending.splice(index, 1); reject(abortError()); }
    };
    if (signal?.aborted) { reject(abortError()); return; }
    signal?.addEventListener('abort', entry.abort, { once: true });
    pending.push(entry);
    pump();
  });
}
