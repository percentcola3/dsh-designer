import {createLimiter} from './async.js';
import {projectPreviewDocument} from './project-preview-document.js';

// Only pending reads are shared. Never retain expiring capabilities or document bodies.
const pendingByApi = new WeakMap();
const limitReads = createLimiter(3);
const live = value => value && !value.deletedAt && !value.removedAt;

export function projectPreviewKey(project) {
  return JSON.stringify([project?.id ?? null, project?.revision ?? null, project?.updatedAt ?? null]);
}

export function selectProjectPreviewPage(project) {
  const designs = Array.isArray(project?.workbench?.designs) ? project.workbench.designs : [];
  const activeDesigns = designs.filter(live);
  const pages = (Array.isArray(project?.artboards) ? project.artboards : []).filter(page => {
    if (!live(page) || typeof page.htmlPath !== 'string' || !page.htmlPath.trim()) return false;
    if (page.designId) return !designs.some(design => design.id === page.designId && !live(design));
    return !designs.some(design => !live(design) && design.pageIds?.includes(page.id))
      || activeDesigns.some(design => design.pageIds?.includes(page.id));
  });
  for (const design of activeDesigns) {
    for (const id of design.pageIds || []) {
      const page = pages.find(page => page.id === id && (!page.designId || page.designId === design.id));
      if (page) return page;
    }
  }
  return pages[0] || null;
}

export function projectPreviewViewport(project, page) {
  const design = project?.workbench?.designs?.find(design => design.id === page?.designId
    || design.pageIds?.includes(page?.id));
  const mobile = (page?.platform || design?.platform || project?.platform) === 'mobile';
  const defaults = mobile ? {width:390,height:844} : {width:1440,height:1000};
  const viewport = page?.viewport || {};
  return {
    width: Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : defaults.width,
    height: Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : defaults.height,
  };
}

export function fitProjectPreview(container, viewport) {
  if (!(container?.width > 0 && container?.height > 0)) return null;
  const scale = Math.max(container.width / viewport.width, container.height / viewport.height);
  return {scale, width:viewport.width * scale, height:viewport.height * scale};
}

export function controlledProjectPreviewUrl(value, origin = globalThis.location?.origin) {
  if (typeof value !== 'string' || !value || /[\s\\\x00-\x1f\x7f]/.test(value)) return null;
  const relative = value.startsWith('/api/designer/');
  if (!relative && !/^https?:\/\//i.test(value)) return null;
  try {
    const base = origin ? new URL(origin).origin : 'https://preview.invalid';
    if (!relative && !origin) return null;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base || url.username || url.password
      || !url.pathname.startsWith('/api/designer/') || /%(?:2f|5c|00)/i.test(url.pathname)) return null;
    return relative ? url.pathname + url.search + url.hash : url.href;
  } catch { return null; }
}

function usableProject(project) {
  return typeof project?.id === 'string' && !!project.id && live(project) && !project.unavailable;
}

function sameProjectResponse(expected, actual) {
  return usableProject(actual) && expected.id === actual.id
    && (expected.revision == null || expected.revision === actual.revision)
    && (expected.updatedAt == null || expected.updatedAt === actual.updatedAt);
}

export function loadProjectPreview(api, project) {
  if (typeof api !== 'function' || !usableProject(project)) return Promise.resolve(null);
  let pending = pendingByApi.get(api);
  if (!pending) { pending = new Map(); pendingByApi.set(api, pending); }
  const key = projectPreviewKey(project);
  if (pending.has(key)) return pending.get(key);
  const request = limitReads(async () => {
    let full = project;
    // State summaries may omit pages/designs; project.get remains a read-only operation.
    if (!Array.isArray(full.artboards) || !Array.isArray(full.workbench?.designs)) {
      const result = await api('project.get', {projectId:project.id});
      if (!sameProjectResponse(project, result?.project)) return null;
      full = result.project;
    }
    const page = selectProjectPreviewPage(full);
    if (!page) return null;
    const result = await api('file.read', {projectId:project.id, path:page.htmlPath});
    if (!result || result.projectId && result.projectId !== project.id
      || result.path && result.path !== page.htmlPath
      || project.revision != null && result.projectRevision != null && result.projectRevision !== project.revision
      || result.sourceId || result.removedAt || result.deletedAt) return null;
    if(typeof result.content==='string'){
      let content=result.content,offset=result.nextOffset,reads=0;
      while(offset!=null){
        if(content.length>2*1024*1024||++reads>72)return null;
        const part=await api('file.read',{projectId:project.id,path:page.htmlPath,offset,limit:30000});
        if(part.projectId&&part.projectId!==project.id||part.sourceId||part.version!==result.version||part.path!==page.htmlPath||typeof part.content!=='string'||part.nextOffset!=null&&part.nextOffset<=offset||project.revision!=null&&part.projectRevision!=null&&part.projectRevision!==project.revision)return null;
        content+=part.content;offset=part.nextOffset;
      }
      const html=projectPreviewDocument(content,{assetBase:result.assetBase,projectId:project.id});
      return html?{html,pageId:page.id,viewport:projectPreviewViewport(full,page)}:null;
    }
    const url = controlledProjectPreviewUrl(result.previewUrl);
    return url ? {url, pageId:page.id, viewport:projectPreviewViewport(full, page)} : null;
  });
  pending.set(key, request);
  const clear = () => { if (pending.get(key) === request) pending.delete(key); };
  request.then(clear, clear);
  return request;
}
