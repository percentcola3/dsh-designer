import path from 'node:path';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const CATEGORIES = new Set(['images', 'fonts', 'styles', 'media']);
const MIME_EXT = { 'text/css':'css', 'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp', 'image/svg+xml':'svg', 'image/avif':'avif', 'image/x-icon':'ico', 'font/woff2':'woff2', 'font/woff':'woff', 'font/ttf':'ttf', 'font/otf':'otf', 'application/font-woff':'woff', 'application/vnd.ms-fontobject':'eot', 'audio/mpeg':'mp3', 'audio/ogg':'ogg', 'audio/wav':'wav', 'video/mp4':'mp4', 'video/webm':'webm', 'application/octet-stream':'bin' };
const EXT_MIME = { ...Object.fromEntries(Object.entries(MIME_EXT).map(([m,e]) => [e,m])), woff:'font/woff', jpg:'image/jpeg', jpeg:'image/jpeg', css:'text/css' };
const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|headers|signature|x-amz-|x-goog-)/i;
const MAX_FILE = 32 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const utf8 = bytes => new TextDecoder('utf-8', { fatal:true }).decode(bytes);
function error(code, message) { return Object.assign(new Error(message), { code }); }
function checkSignal(signal) { signal?.throwIfAborted(); }
function ident(value, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}-[a-zA-Z0-9-]{1,80}$`).test(value)) throw error('INVALID_ID', `Invalid ${prefix} identifier`);
  return value;
}
function decode64(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_TOTAL / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw error('INVALID_BASE64', 'Asset bytes must use canonical base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw error('INVALID_BASE64', 'Asset base64 is not canonical');
  return bytes;
}
function remoteURL(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw error('UNSAFE_URL', 'Only HTTP(S) resource URLs without embedded credentials are accepted');
  url.hash = '';
  return url.href;
}
function capturedURL(value,base){
  const url=new URL(value,base);if(url.protocol!=='blob:')return remoteURL(url.href);
  let owner,inner;try{owner=new URL(base);inner=new URL(url.pathname);}catch{throw error('UNSAFE_URL','Captured blob resources require an explicit HTTP(S) source origin');}
  if(!['http:','https:'].includes(owner.protocol)||!['http:','https:'].includes(inner.protocol)||owner.username||owner.password||inner.username||inner.password||inner.origin!==owner.origin)throw error('UNSAFE_URL','Captured blob resources must belong to the selected source origin');
  url.hash='';return url.href;
}
function safeURL(value) {
  try { const u = new URL(value); u.username = ''; u.password = ''; for (const key of [...u.searchParams.keys()]) if (SECRET_KEY.test(key)) u.searchParams.delete(key); return u.href; }
  catch { return String(value ?? '').slice(0, 2000); }
}
function cleanMetadata(value, depth = 0) {
  if (depth > 12) return null;
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? safeURL(value) : value;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.slice(0, 2000).map(v => cleanMetadata(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_KEY.test(k) && !['__proto__','constructor','prototype'].includes(k)).map(([k,v]) => [k, cleanMetadata(v, depth + 1)]));
  return null;
}
function failure(value, fallback = 'DOWNLOAD_FAILED') {
  return { url:safeURL(value?.url || ''), code:String(value?.code || fallback).slice(0,100), message:String(value?.message || 'Resource unavailable').slice(0,1000) };
}
function mimeOf(value, url = '', bytes) {
  let mime = String(value || '').split(';')[0].trim().toLowerCase();
  mime = ({'application/x-font-ttf':'font/ttf','application/x-font-truetype':'font/ttf','application/x-font-otf':'font/otf','application/x-font-opentype':'font/otf','application/x-font-woff':'font/woff','application/font-woff2':'font/woff2','application/woff2':'font/woff2'})[mime] || mime;
  if ((!mime || mime === 'application/octet-stream' || mime === 'application/font-sfnt') && bytes) {
    const magic = bytes.subarray(0,4).toString('latin1');
    mime = ({wOF2:'font/woff2',wOFF:'font/woff',OTTO:'font/otf',[Buffer.from([0,1,0,0]).toString('latin1')]:'font/ttf'})[magic] || mime;
  }
  if (!mime || mime === 'application/octet-stream') {
    try { const ext = path.posix.extname(new URL(url).pathname).slice(1).toLowerCase(); mime = EXT_MIME[ext] || mime; } catch { /* no extension */ }
  }
  return mime || 'application/octet-stream';
}
function categoryOf(mime, category) {
  category = ({image:'images',font:'fonts',stylesheet:'styles',style:'styles',other:'media',audio:'media',video:'media'})[category] || category;
  if (category !== undefined && !CATEGORIES.has(category)) throw error('INVALID_CATEGORY', 'Invalid resource category');
  if (mime === 'text/css') return 'styles';
  if (/^(?:font\/|application\/(?:font-|vnd.ms-fontobject))/.test(mime)) return 'fonts';
  if (mime.startsWith('image/')) return 'images';
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
  return category || 'media';
}
function validateBytes(bytes, mime) {
  if (bytes.length > MAX_FILE) throw error('ASSET_TOO_LARGE', 'A single resource exceeds 32 MiB');
  const signature = bytes.subarray(0,4).toString('latin1');
  if (mime === 'font/woff2' && signature !== 'wOF2') throw error('MIME_MISMATCH', 'WOFF2 bytes lack the wOF2 signature');
  if (['font/woff','application/font-woff'].includes(mime) && signature !== 'wOFF') throw error('MIME_MISMATCH', 'WOFF bytes lack the wOFF signature');
  if (mime === 'font/otf' && signature !== 'OTTO') throw error('MIME_MISMATCH', 'OpenType bytes lack the OTTO signature');
  if (mime === 'font/ttf' && ![Buffer.from([0,1,0,0]).toString('latin1'),'true','typ1'].includes(signature)) throw error('MIME_MISMATCH', 'Invalid TrueType signature');
  if (mime === 'image/png' && !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw error('MIME_MISMATCH','PNG bytes lack the PNG signature');
  if (mime === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) throw error('MIME_MISMATCH','JPEG bytes lack the JPEG signature');
  if (mime === 'image/gif' && !/^GIF8[79]a/.test(bytes.subarray(0,6).toString('latin1'))) throw error('MIME_MISMATCH','GIF bytes lack the GIF signature');
  if (mime === 'image/webp' && !(signature === 'RIFF' && bytes.subarray(8,12).toString('latin1') === 'WEBP')) throw error('MIME_MISMATCH','WebP bytes lack the WebP signature');
  if (mime === 'image/svg+xml') {
    const svg = entity(utf8(bytes));
    if (!/<svg\b/i.test(svg) || /<!doctype|<!entity|<\s*(?:script|foreignobject|iframe|object|embed|animate\w*|set)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:/i.test(svg)) throw error('ACTIVE_RESOURCE','SVG contains active or unsupported markup');
  }
  if (mime === 'text/css') utf8(bytes);
  if (/^(?:text\/html|application\/(?:javascript|x-javascript)|text\/javascript)/.test(mime)) throw error('ACTIVE_RESOURCE', 'Executable resources are not archived');
}
function filename(url, mime) {
  let basename = 'asset';
  try { basename = decodeURIComponent(path.posix.basename(new URL(url).pathname)); } catch { /* malformed filename */ }
  const stem = basename.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,60) || 'asset';
  return `${stem}.${MIME_EXT[mime] || 'bin'}`;
}
function fileEntry(relative, bytes, mimeType) { return { path:relative, bytesBase64:bytes.toString('base64'), mimeType, sha256:sha(bytes) }; }
const cssUnescape = value => value.replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff) || 0xfffd) : char);
// A bounded lexical walk preserves comments/strings and recognizes both @import "x" and url(...).
function transformCSS(css, transform) {
  let output = '', i = 0;
  while (i < css.length) {
    if (output.length > MAX_FILE) throw error('ASSET_TOO_LARGE','Rewritten CSS exceeds 32 MiB');
    if (css.startsWith('/*', i)) { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 2; output += ' '; continue; }
    const rest = css.slice(i);
    const imp = /^@import\s*(["'])((?:\\.|[^\\])*?)\1/i.exec(rest);
    if (imp) { output += `@import url("${escapeCSS(transform(cssUnescape(imp[2]), 'import'))}")`; i += imp[0].length; continue; }
    const url = /^url\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*?))\s*\)/i.exec(rest);
    if (url) { output += `url("${escapeCSS(transform(cssUnescape(url[1] ?? url[2] ?? url[3]).trim(), 'url'))}")`; i += url[0].length; continue; }
    if (css[i] === '"' || css[i] === "'") {
      const quote = css[i]; output += css[i++];
      while (i < css.length) { const ch = css[i++]; output += ch; if (ch === '\\' && i < css.length) output += css[i++]; else if (ch === quote) break; }
      continue;
    }
    output += css[i++];
  }
  // Legacy script expressions and style-tag breakout are never useful in captured static CSS.
  return output.replace(/expression\s*\([^;}]*/gi,'').replace(/-moz-binding\s*:[^;}]*/gi,'').replace(/<\/style/gi,'\\3c /style');
}
function escapeCSS(value) { return String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n\f]/g,' '); }
export function cssDependencyUrls(css,base,{allowBlob=false}={}){
  const result=[];
  transformCSS(css,value=>{if(value&&!/^(?:#|data:)/i.test(value)){try{const url=new URL(value,base);if((['http:','https:'].includes(url.protocol)||allowBlob&&url.protocol==='blob:')&&!url.username&&!url.password){url.hash='';result.push(url.href);}}catch{/* Invalid references are reported during archive rewriting. */}}return value;});
  return [...new Set(result)];
}
const cssDependencies=(css,base)=>cssDependencyUrls(css,base);
function entity(value) {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|([a-z]+));?/gi, (raw,n,name) => {
    if (n) { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd'; }
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',colon:':',tab:'\t',newline:'\n'})[name.toLowerCase()] ?? raw;
  });
}
function escapeAttr(value) { return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function srcset(value, rewrite) {
  // Data URL commas belong to the URL; descriptors terminate each candidate.
  let i = 0; const output = [];
  while (i < value.length) {
    while (/[\s,]/.test(value[i] || '') && i < value.length) i++;
    if (i >= value.length) break;
    const start = i; const data = value.slice(i,i+5).toLowerCase() === 'data:';
    while (i < value.length && !/\s/.test(value[i]) && (data || value[i] !== ',')) i++;
    let url = value.slice(start,i); let ended = false;
    if (data && url.endsWith(',')) { url = url.slice(0,-1); ended = true; }
    const descriptorStart = i;
    if (!ended) while (i < value.length && value[i] !== ',') i++;
    const descriptor = ended ? '' : value.slice(descriptorStart,i).trim();
    output.push(`${rewrite(url)}${descriptor ? ` ${descriptor}` : ''}`); if (value[i] === ',') i++;
  }
  return output.join(', ');
}
const BLOCKED_TAGS = new Set(['script','iframe','frame','frameset','object','embed','applet','base','portal','foreignobject','animate','animatemotion','animatetransform','set']);
function sanitizeHTML(html, rewrite, base) {
  // Tokenize quoted tags instead of regex-removing attributes from attacker-controlled markup.
  let output = '', i = 0;
  while (i < html.length) {
    const start = html.indexOf('<',i);
    if (start < 0) { output += html.slice(i); break; }
    output += html.slice(i,start); i = start;
    if (html.startsWith('<!--',i)) { const end = html.indexOf('-->',i+4); i = end < 0 ? html.length : end + 3; continue; }
    if (/^<!doctype\s+html\s*>/i.test(html.slice(i))) { const end = html.indexOf('>',i); output += '<!doctype html>'; i = end+1; continue; }
    const match = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)/i.exec(html.slice(i));
    if (!match) { output += '&lt;'; i++; continue; }
    let end = i + match[0].length, quote = '';
    for (; end < html.length; end++) { const ch = html[end]; if (quote) { if (ch === quote) quote = ''; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break; }
    if (end === html.length) { output += '&lt;'; i++; continue; }
    const tag = match[2].toLowerCase(); const closing = !!match[1]; const raw = html.slice(i+match[0].length,end); i = end+1;
    if (BLOCKED_TAGS.has(tag)) {
      if (!closing && ['script','iframe','object','applet','foreignobject'].includes(tag)) { const close = new RegExp(`<\\/\\s*${tag}\\s*>`,'ig'); close.lastIndex = i; const found = close.exec(html); i = found ? close.lastIndex : html.length; }
      continue;
    }
    if (closing) { output += `</${tag}>`; continue; }
    const attrs = []; const seen = new Set();
    const attrPattern = /([^\s=/>"'<`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let attr;
    while ((attr = attrPattern.exec(raw))) {
      const name = attr[1].toLowerCase(); let value = entity(attr[2] ?? attr[3] ?? attr[4] ?? '');
      if (seen.has(name) || /^on/.test(name) || ['srcdoc','nonce','integrity','crossorigin','ping','formaction','action','autofocus'].includes(name) || name.includes(':') && name !== 'xlink:href') continue;
      seen.add(name);
      if (name === 'http-equiv') continue;
      if (name === 'style') value = transformCSS(value, v => rewrite(v,base));
      else if (name === 'srcset' || name === 'imagesrcset') value = srcset(value,v => rewrite(v,base));
      else if (['src','href','poster','xlink:href','background'].includes(name)) {
        const normalized = value.replace(/[\u0000-\u0020\u007f]/g,'');
        if (/^(?:javascript|vbscript|file|blob):/i.test(normalized) || /^data:/i.test(normalized) && !/^data:(?:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)|font\/|audio\/|video\/)/i.test(normalized)) continue;
        if (name === 'href' && ['a','area'].includes(tag)) { if (!/^(?:#|https?:|mailto:|tel:|\/|\.)/i.test(value)) continue; value = safeURL(value); }
        else value = rewrite(value,base);
      }
      attrs.push(`${name}="${escapeAttr(value)}"`);
    }
    if (tag === 'meta' && /(?:refresh|content-security-policy)/i.test(raw)) continue;
    output += `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
    if (tag === 'style') { const close = /<\/\s*style\s*>/ig; close.lastIndex = i; const found = close.exec(html); output += transformCSS(html.slice(i,found?.index ?? html.length),v => rewrite(v,base)); if (found) output += '</style>'; i = found ? close.lastIndex : html.length; }
  }
  return output;
}

/** Pure, deterministic archive builder. No network, filesystem, timestamps or generated IDs. */
export function buildAssetBundle({ importId, html = '', resources = [], source, context, preview, warnings = [], failures = [] }) {
  ident(importId,'i');
  if (!source || !['website','figma','mastergo'].includes(source.kind)) throw error('INVALID_SOURCE', 'source.kind must be website, figma or mastergo');
  if (!Array.isArray(resources) || resources.length > 2000 || typeof html !== 'string') throw error('INVALID_INPUT','Invalid bounded import data');
  if(Buffer.byteLength(html)>4_000_000)throw Object.assign(error('SOURCE_HTML_TOO_LARGE','Source HTML exceeds the 4 MB archive limit; select a smaller page or source region'),{details:{maxBytes:4_000_000,actualBytes:Buffer.byteLength(html)}});
  const sourceRecord = cleanMetadata(source);
  const issues = failures.map(f => failure(f)); const warningList = warnings.map(w => cleanMetadata(w)); const table = new Map(); const files = []; const manifestResources = []; let originalBytes = 0;
  function issue(url,code,message) { const item = failure({url,code,message}); if (!issues.some(x => x.url === item.url && x.code === item.code)) issues.push(item); }
  for (const resource of resources) {
    try {
      const url = capturedURL(resource.url,source.url); const bytes = decode64(resource.bytesBase64); const mimeType = mimeOf(resource.mimeType,url,bytes); const category = categoryOf(mimeType,resource.category); validateBytes(bytes,mimeType);
      originalBytes += bytes.length; if (originalBytes > MAX_TOTAL) throw error('ASSETS_TOO_LARGE','Resources exceed 128 MiB');
      if (resource.sha256 && resource.sha256 !== sha(bytes) || resource.byteLength !== undefined && resource.byteLength !== bytes.length) throw error('INTEGRITY_MISMATCH','Captured resource hash or byte count does not match its bytes');
      const existing = table.get(url);
      if (existing) { if (!existing.original.equals(bytes)) issue(url,'DUPLICATE_URL','One URL supplied conflicting resource bytes'); continue; }
      const entry = {url,baseURL:resource.finalUrl ? remoteURL(resource.finalUrl) : url,original:bytes,mimeType,category,state:0};
      table.set(url,entry);
      if (!table.has(entry.baseURL)) table.set(entry.baseURL,entry);
    } catch (err) { issue(resource?.url,err.code || 'INVALID_RESOURCE',err.message); }
  }
  function rewrite(value, base, from = 'html/_') {
    if (!value || /^(?:#|data:)/i.test(value)) return value;
    try {
      const resolved = new URL(value,base); const fragment = resolved.hash; const url = capturedURL(resolved.href,source.url); const target = table.get(url);
      if (!target) { issue(url,'MISSING_RESOURCE','Referenced resource was not downloaded'); return 'about:blank#asset-unavailable'; }
      if (target.state === 1) { issue(url,'CSS_DEPENDENCY_CYCLE','Cyclic CSS dependency was disabled'); return 'about:blank#asset-cycle'; }
      materialize(target);
      if (target.state !== 2) return 'about:blank#asset-unavailable';
      return `${path.posix.relative(path.posix.dirname(from),target.path)}${fragment}`;
    } catch (err) { issue(value,err.code || 'INVALID_RESOURCE_URL',err.message); return 'about:blank#asset-unavailable'; }
  }
  function materialize(resource) {
    if (resource.state === 2 || resource.state === 3) return;
    resource.state = 1;
    try {
      const bytes = resource.mimeType === 'text/css' ? Buffer.from(transformCSS(utf8(resource.original),v => rewrite(v,resource.baseURL,`assets/${importId}/styles/_`))) : resource.original;
      validateBytes(bytes,resource.mimeType);
      resource.path = `assets/${importId}/${resource.category}/${sha(bytes)}-${filename(resource.url,resource.mimeType)}`; resource.state = 2;
      if (!files.some(f => f.path === resource.path)) files.push(fileEntry(resource.path,bytes,resource.mimeType));
      manifestResources.push({url:safeURL(resource.url),path:resource.path,mimeType:resource.mimeType,category:resource.category,sha256:sha(bytes),byteLength:bytes.length,originalSha256:sha(resource.original),originalByteLength:resource.original.length,status:'downloaded'});
    } catch (err) { resource.state = 3; issue(resource.url,err.code || 'RESOURCE_REWRITE_FAILED',err.message); }
  }
  // Sorted traversal makes CSS cycle resolution deterministic across capture order.
  for (const resource of [...table.values()].sort((a,b) => a.url.localeCompare(b.url))) materialize(resource);
  const rewrittenHTML = sanitizeHTML(html,(value,base) => rewrite(value,base),source.url);
  const root = `imports/${importId}`;
  let previewPath, previewInfo;
  if (preview !== undefined && preview !== null) {
    try {
      const bytes = decode64(typeof preview === 'string' ? preview : preview.bytesBase64);
      let mimeType;
      if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = 'image/png';
      else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = 'image/jpeg';
      else if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString('latin1'))) mimeType = 'image/gif';
      else if (bytes.subarray(0,4).toString('latin1') === 'RIFF' && bytes.subarray(8,12).toString('latin1') === 'WEBP') mimeType = 'image/webp';
      else throw error('MIME_MISMATCH','Preview must contain PNG, JPEG, WebP or GIF bytes');
      validateBytes(bytes,mimeType);
      previewPath = `${root}/preview.${MIME_EXT[mimeType]}`;
      previewInfo = {path:previewPath,mimeType,sha256:sha(bytes),byteLength:bytes.length};
      files.push(fileEntry(previewPath,bytes,mimeType));
    }
    catch (err) { issue('',err.code || 'INVALID_PREVIEW',err.message); }
  }
  const resourceSummary=Object.fromEntries(['styles','images','fonts','media','total'].map(category=>[category,{count:0,bytes:0}]));
  const publishedPaths=new Set();for(const resource of manifestResources){if(publishedPaths.has(resource.path))continue;publishedPaths.add(resource.path);for(const category of [resource.category,'total']){resourceSummary[category].count++;resourceSummary[category].bytes+=resource.byteLength;}}resourceSummary.failedCount=issues.length;
  const record = {resourceSummary,id:importId,kind:source.kind,sourceUrl:safeURL(source.url || ''),title:String(source.title || '').slice(0,1000),manifestPath:`${root}/manifest.json`,sourcePath:`${root}/source.json`,...(context !== undefined ? {contextPath:`${root}/context.json`} : {}),...(previewPath ? {previewPath} : {}),integrity:issues.length ? 'incomplete' : 'complete',resourceCount:manifestResources.length,failedCount:issues.length,totalBytes:files.reduce((n,f) => n+decode64(f.bytesBase64).length,0)};
  for (const key of ['width','height']) if (Number.isFinite(source[key]) && source[key] > 0) record[key] = source[key];
  const manifest = {schemaVersion:1,importId,source:sourceRecord,resourceSummary,resources:manifestResources.sort((a,b) => a.path.localeCompare(b.path)),...(previewInfo ? {preview:previewInfo} : {}),failures:issues,warnings:warningList,integrity:record.integrity};
  const metadata = [[record.sourcePath,sourceRecord],[record.manifestPath,manifest],...(context !== undefined ? [[record.contextPath,cleanMetadata(context)]] : [])];
  for (const [relative,value] of metadata) {
    const bytes = Buffer.from(JSON.stringify(value,null,2));
    if (bytes.length > 4_000_000) throw error('METADATA_TOO_LARGE',`${path.posix.basename(relative)} exceeds the 4 MB store document limit`);
    files.push(fileEntry(relative,bytes,'application/json'));
  }
  return {html:rewrittenHTML,manifest,files:files.sort((a,b) => a.path.localeCompare(b.path)),record};
}

function privateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if (h === 'localhost' || /\.(?:localhost|local|internal)$/.test(h) || !h.includes('.') && !isIP(h)) return true;
  if (h.includes(':')) { const s = h.replace(/^::ffff:/,''); if (s !== h && isIP(s) === 4) return privateHost(s); return /^(?:0*:|::|f[cd]|fe[89ab])/i.test(h); }
  if (isIP(h) === 4) { const [a,b] = h.split('.').map(Number); return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224; }
  return false;
}
async function networkAllowed(url, explicitOrigins, realFetch) {
  const parsed = new URL(url);
  if (explicitOrigins.has(parsed.origin)) return;
  if (privateHost(parsed.hostname)) throw error('PRIVATE_NETWORK_BLOCKED','Nested assets cannot introduce an unselected private-network origin');
  if (realFetch) { const addresses = await lookup(parsed.hostname,{all:true}); if (addresses.some(a => privateHost(a.address))) throw error('PRIVATE_NETWORK_BLOCKED','Nested asset DNS resolved to a private address'); }
}

/** Fetch only explicit resource seeds and CSS dependencies, without cookies or authentication. */
export async function collectRemoteResources(seedResources, {signal, fetch:fetcher = globalThis.fetch, maxFiles = 300, maxBytes = 64*1024*1024, timeoutMs = 30000, concurrency = 4, sourceUrl} = {}) {
  if (!Array.isArray(seedResources) || seedResources.length > 2000 || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 2000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_TOTAL || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) throw error('INVALID_LIMIT','Invalid bounded download limits');
  checkSignal(signal);
  const controller = new AbortController(); const onAbort = () => controller.abort(signal.reason); signal?.addEventListener('abort',onAbort,{once:true});
  const timer = setTimeout(() => controller.abort(error('DOWNLOAD_TIMEOUT','Asset download deadline exceeded')),timeoutMs);
  const pending = []; const queued = new Set(); const explicitOrigins = new Set(); const resources = []; const failures = []; const warnings = []; let total = 0; let attempts = 0;
  const addFailure = (url,err) => failures.push(failure({url,code:err.code || 'DOWNLOAD_FAILED',message:err.message}));
  const enqueue = seed => { const entry = typeof seed === 'string' ? {url:seed} : seed; try { const url = entry.bytesBase64!==undefined?capturedURL(entry.url,sourceUrl):remoteURL(entry.url); if (!queued.has(url)) { queued.add(url); pending.push({...entry,url}); } } catch (err) { addFailure(entry?.url,err); } };
  if (sourceUrl !== undefined) { try { explicitOrigins.add(new URL(remoteURL(sourceUrl)).origin); } catch (err) { clearTimeout(timer); signal?.removeEventListener('abort',onAbort); throw err; } }
  for (const seed of seedResources) enqueue(seed);
  // Abort races bound custom fetch implementations as well as native response streams.
  function bounded(promise) {
    checkSignal(controller.signal);
    return new Promise((resolve,reject) => { const aborted = () => reject(controller.signal.reason || error('ABORTED','Asset collection aborted')); controller.signal.addEventListener('abort',aborted,{once:true}); Promise.resolve(promise).then(resolve,reject).finally(() => controller.signal.removeEventListener('abort',aborted)); });
  }
  const account = bytes => { total += bytes; if (total > maxBytes) throw error('BYTE_LIMIT','Resources exceed the download byte limit'); };
  async function collect(entry) {
    if (controller.signal.aborted) { if (signal?.aborted) checkSignal(signal); addFailure(entry.url,controller.signal.reason); return; }
    if (attempts >= maxFiles) { addFailure(entry.url,error('FILE_LIMIT','Asset request count limit reached')); return; }
    attempts++;
    if (total >= maxBytes) { addFailure(entry.url,error('BYTE_LIMIT','Asset download byte limit reached')); return; }
    try {
      let bytes, mimeType, finalURL = entry.url;
      if (entry.bytesBase64 !== undefined) { bytes = decode64(entry.bytesBase64);account(bytes.length);if(bytes.length>MAX_FILE)throw error('BYTE_LIMIT','A resource exceeds the file byte limit');mimeType = mimeOf(entry.mimeType,entry.url); }
      else {
        let response;
        for (let redirects = 0; redirects <= 5; redirects++) {
          await bounded(networkAllowed(finalURL,explicitOrigins,fetcher === globalThis.fetch));
          response = await bounded(fetcher(finalURL,{signal:controller.signal,credentials:'omit',redirect:'manual',referrerPolicy:'no-referrer',headers:{Accept:'text/css,image/*,font/*,audio/*,video/*,application/octet-stream;q=0.5'}}));
          if ([301,302,303,307,308].includes(response.status)) { const location = response.headers.get('location'); await bounded(response.body?.cancel()); if (!location || redirects === 5) throw error('REDIRECT_LIMIT','Invalid or excessive resource redirects'); finalURL = remoteURL(location,finalURL); continue; }
          break;
        }
        if (!response.ok) { await bounded(response.body?.cancel()); throw error(`HTTP_${response.status}`,`Resource request returned HTTP ${response.status}`); }
        mimeType = mimeOf(response.headers.get('content-type'),finalURL);
        const declared = Number(response.headers.get('content-length')); if (declared > Math.min(MAX_FILE,maxBytes-total)) { await bounded(response.body?.cancel()); throw error('BYTE_LIMIT','Resource exceeds the remaining byte limit'); }
        const reader = response.body?.getReader();
        if (reader) { const chunks = [];let size = 0;try { while (true) { const {done,value} = await bounded(reader.read());if(done)break;size+=value.byteLength;account(value.byteLength);if(size>MAX_FILE)throw error('BYTE_LIMIT','Resource exceeds the file byte limit');chunks.push(Buffer.from(value)); } bytes=Buffer.concat(chunks,size); }catch(err){void reader.cancel().catch(()=>{});throw err;}finally{reader.releaseLock();} }
        else { bytes=Buffer.from(await bounded(response.arrayBuffer()));account(bytes.length);if(bytes.length>MAX_FILE)throw error('BYTE_LIMIT','Resource exceeds the file byte limit'); }
      }
      mimeType=mimeOf(mimeType,finalURL,bytes);validateBytes(bytes,mimeType);
      if(entry.sha256&&entry.sha256!==sha(bytes)||entry.byteLength!==undefined&&entry.byteLength!==bytes.length)throw error('INTEGRITY_MISMATCH','Captured resource hash or byte count does not match its bytes');
      return {resource:{url:entry.url,mimeType,bytesBase64:bytes.toString('base64'),category:categoryOf(mimeType,entry.category),sha256:sha(bytes),byteLength:bytes.length,...(finalURL!==entry.url?{finalUrl:finalURL}:{})},dependencies:mimeType==='text/css'?cssDependencies(utf8(bytes),finalURL):[]};
    } catch(err) { if(signal?.aborted)checkSignal(signal);addFailure(entry.url,err); }
  }
  try {
    while(pending.length){
      // Resolve a bounded batch concurrently, then enqueue CSS dependencies in
      // seed order so capture timing cannot reorder the persisted manifest.
      const batch=pending.splice(0,concurrency),results=await Promise.all(batch.map(collect));
      for(const result of results){if(!result)continue;resources.push(result.resource);for(const dependency of result.dependencies){if(queued.size>=maxFiles*8){addFailure(dependency,error('QUEUE_LIMIT','CSS dependency queue limit reached'));continue;}enqueue({url:dependency});}}
    }
  } finally { clearTimeout(timer);signal?.removeEventListener('abort',onAbort); }
  const ranks=new Map([...queued].map((url,index)=>[safeURL(url),index]));failures.sort((a,b)=>(ranks.get(a.url)??-1)-(ranks.get(b.url)??-1));
  return {resources,warnings,failures};
}

// Fixed source; paths and bytes enter ONLY through JSON stdin. This runs inside ctx.shell's sandbox.
const BINARY_WRITER_SOURCE = String.raw`
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const constants = require('node:fs').constants;
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const within = (root,target) => { const rel = path.relative(root,target); return rel === '' || !rel.startsWith('..'+path.sep) && rel !== '..' && !path.isAbsolute(rel); };
async function main(input) {
  if (!path.isAbsolute(input.root) || !Array.isArray(input.files)) throw Error('INVALID_ROOT');
  // Check canonical ancestors before creating anything; reject every symlink below the selected root.
  let ancestor = input.root;
  while (true) { try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw Error('SYMLINK_ROOT'); await fs.realpath(ancestor); break; } catch (e) { if (e.code !== 'ENOENT') throw e; const parent = path.dirname(ancestor); if (parent === ancestor) throw e; ancestor = parent; } }
  const canonicalAncestor = await fs.realpath(ancestor);
  if (!within(canonicalAncestor,input.root)) throw Error('PATH_ESCAPE');
  await fs.mkdir(input.root,{recursive:true});
  const root = await fs.realpath(input.root);
  if (root !== path.resolve(input.root)) throw Error('ROOT_CHANGED');
  const written = [];
  for (const file of input.files) {
    if (!file.relative || file.relative.includes('\\') || file.relative.includes('\0') || path.isAbsolute(file.relative) || file.relative.split('/').some(s => !s || s === '.' || s === '..')) throw Error('INVALID_PATH');
    const target = path.resolve(root,file.relative);
    if (!within(root,target) || target !== file.target) throw Error('PATH_ESCAPE');
    let parent = root;
    for (const part of file.relative.split('/').slice(0,-1)) {
      parent = path.join(parent,part);
      try { await fs.mkdir(parent); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !within(root,await fs.realpath(parent))) throw Error('UNSAFE_DIRECTORY');
    }
    if (await fs.realpath(root) !== root || await fs.realpath(parent) !== parent) throw Error('PATH_CHANGED');
    const bytes = Buffer.from(file.bytesBase64,'base64');
    if (bytes.toString('base64') !== file.bytesBase64 || digest(bytes) !== file.sha256) throw Error('INTEGRITY_MISMATCH');
    let handle;
    try {
      handle = await fs.open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      await handle.writeFile(bytes); await handle.sync();
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length) throw Error('ASSET_CONFLICT');
      const read = await fs.open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
      try { if (digest(await read.readFile()) !== file.sha256) throw Error('ASSET_CONFLICT'); } finally { await read.close(); }
    } finally { if (handle) await handle.close(); }
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length || await fs.realpath(parent) !== parent || await fs.realpath(target) !== target) throw Error('PATH_CHANGED');
    const verified = await fs.open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
    try { if (digest(await verified.readFile()) !== file.sha256) throw Error('INTEGRITY_MISMATCH'); } finally { await verified.close(); }
    if (await fs.realpath(root) !== root || await fs.realpath(parent) !== parent || await fs.realpath(target) !== target) throw Error('PATH_CHANGED');
    written.push(file.relative);
  }
  process.stdout.write(JSON.stringify({written}));
}
let raw = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; if (raw.length > 190000000) { process.stderr.write('INPUT_TOO_LARGE'); process.exit(1); } });
process.stdin.on('end', () => { Promise.resolve().then(() => main(JSON.parse(raw))).catch(e => { process.stderr.write(String(e.message)); process.exitCode = 1; }); });
`;
const BINARY_WRITER_COMMAND = `node -e '${BINARY_WRITER_SOURCE.replace(/'/g,"'\\''")}'`;
function validateFilePath(value) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0') || value.startsWith('/') || value.split('/').some(s => !s || s === '.' || s === '..')) throw error('INVALID_PATH','Asset path must be relative to its project');
  if (!/^(?:assets\/i-[a-zA-Z0-9-]{1,80}\/(?:images|fonts|styles|media)\/[a-f0-9]{64}-[a-zA-Z0-9_-]+\.[a-z0-9]+|imports\/i-[a-zA-Z0-9-]{1,80}\/(?:source\.json|manifest\.json|context\.json|preview\.(?:png|jpg|webp|gif)))$/.test(value)) throw error('INVALID_PATH','Path does not match the asset archive layout');
}

/** Binary publication uses the composed shell; there is no Host node:fs fallback. */
export async function writeAssetFiles({store,fs,shell,projectId,files,policy,signal}) {
  ident(projectId,'p'); checkSignal(signal);
  if (!policy || !['read-only','workspace-write','danger-full-access'].includes(policy.mode) || typeof policy.workspaceRoot !== 'string') throw error('MISSING_POLICY','Pass the exact current call sandbox policy');
  if (!Array.isArray(files) || files.length > 2010) throw error('INVALID_FILES','Invalid asset file list');
  const validated = []; const seen = new Map(); let total = 0;
  for (const file of files) {
    validateFilePath(file.path); const bytes = decode64(file.bytesBase64); total += bytes.length;
    if (total > MAX_TOTAL + 8_000_000 || bytes.length > MAX_FILE && file.mimeType !== 'application/json') throw error('ASSETS_TOO_LARGE','Archive exceeds the write limits');
    if (sha(bytes) !== file.sha256) throw error('INTEGRITY_MISMATCH','File SHA-256 does not match its bytes');
    if (file.path.startsWith('assets/') && !path.posix.basename(file.path).startsWith(`${file.sha256}-`)) throw error('INTEGRITY_MISMATCH','Asset filename does not match its content hash');
    if (seen.has(file.path)) { if (seen.get(file.path) !== file.sha256) throw error('ASSET_CONFLICT','Conflicting files share one path'); continue; }
    seen.set(file.path,file.sha256); validated.push({...file,bytes});
  }
  if (!validated.length) return {written:[]};
  const projectRoot = await store.target(`projects/${projectId}`,signal); const root = fs.processPath(projectRoot);
  const binary = []; const metadata = [];
  for (const file of validated) {
    const target = await store.target(`projects/${projectId}/${file.path}`,signal);
    if (!fs.contains(projectRoot,target)) throw error('PATH_OUTSIDE_PROJECT','Asset target leaves its project');
    const processTarget = fs.processPath(target);
    if (file.mimeType === 'application/json' && file.path.endsWith('.json')) { const content = utf8(file.bytes); JSON.parse(content); metadata.push({...file,content}); }
    else binary.push({relative:file.path,target:processTarget,bytesBase64:file.bytesBase64,sha256:file.sha256});
  }
  const written = [];
  if (binary.length) {
    if (!shell?.resolve || !shell?.execute) throw error('SHELL_REQUIRED','Binary assets require the composed shell service');
    const spec = shell.resolve({command:BINARY_WRITER_COMMAND,workdir:fs.processPath(await store.target('',signal)),stdin:JSON.stringify({root,files:binary}),signal,sandboxPolicy:policy,timeoutMs:30000,onExpiry:'kill',stdoutMaxBytes:512000});
    const execution = await shell.execute(spec); const result = await execution.result(); checkSignal(signal);
    if (result.exitCode !== 0 || result.timedOut || result.aborted || result.sandbox?.denied || result.stdout?.truncated) throw error(result.sandbox?.denied ? 'SANDBOX_DENIED' : 'ASSET_WRITE_FAILED',`Binary asset publication failed: ${String(result.stderr?.text || 'process did not complete').slice(0,1000)}`);
    let receipt; try { receipt = JSON.parse(result.stdout.text); } catch { throw error('INVALID_WRITE_RECEIPT','Binary writer returned an invalid receipt'); }
    if (!Array.isArray(receipt.written) || receipt.written.length !== binary.length || binary.some(f => !receipt.written.includes(f.relative))) throw error('INVALID_WRITE_RECEIPT','Binary writer did not confirm every asset');
    written.push(...receipt.written);
  }
  // Metadata is published last, after every binary asset has been confirmed.
  for (const file of metadata) { checkSignal(signal); await store.write(`projects/${projectId}/${file.path}`,file.content,null,signal,policy); written.push(file.path); }
  return {written};
}
