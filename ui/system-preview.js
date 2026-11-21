import {parse, parseFragment, serialize} from 'parse5';
import {systemLogicalPath, systemBytesBase64} from './system-resource.js';
import {frozenSourceHTML} from './source-preview.js';

async function replaceAsync(text, expression, replacement) {
  const matches = [...text.matchAll(expression)];
  const values = await Promise.all(matches.map(match => replacement(match)));
  let index = 0;
  return text.replace(expression, () => values[index++]);
}

// A self-contained static preview also works for unsaved directory files and the
// desktop protocol, whose authenticated resource endpoints cannot be navigated.
export async function systemPreviewDocument(html, path, read, {interactive = false} = {}) {
  const pending = new Map();
  const dataURL = async (href, from, ancestors = []) => {
    if (!href || /^(?:#|data:)/i.test(href)) return href;
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return 'about:blank#external';
    const logical = systemLogicalPath(from, href);
    if (ancestors.includes(logical)) throw new Error('规范样式存在循环引用 ' + logical);
    if (!pending.has(logical)) pending.set(logical, Promise.resolve().then(() => read(logical)));
    const file = await pending.get(logical);
    const encoded = await (async () => {
      if (!file) throw new Error('规范目录缺少预览资源 ' + logical);
      let content = file.content;
      let mimeType = file.mimeType || 'application/octet-stream';
      let base64 = file.bytesBase64;
      if (/\.css$/i.test(logical)) {
        mimeType = 'text/css';
        if (content === undefined) content = new TextDecoder('utf-8', {fatal: true}).decode(file.bytes || Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
        content = await css(content, logical, [...ancestors, logical]);
      }
      if (content !== undefined || file.bytes) {
        const bytes = content !== undefined ? new TextEncoder().encode(content) : file.bytes;
        base64 = systemBytesBase64(bytes);
      }
      return `data:${mimeType};base64,${base64}`;
    })();
    return encoded + (href.includes('#') ? '#' + href.split('#').slice(1).join('#') : '');
  };
  const css = (content, from, ancestors = []) => replaceAsync(
    content.replace(/@import\s+(['"])(.*?)\1/gi, (_match, _quote, href) => `@import url(${JSON.stringify(href)})`),
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    async match => `url(${JSON.stringify(await dataURL((match[1] ?? match[2] ?? match[3]).trim(), from, ancestors))})`,
  );
  const document = parse(interactive ? html : frozenSourceHTML(html, {origin: 'data:'}));
  if (interactive) {
    const clean = node => {
      node.childNodes = (node.childNodes || []).filter(child => !['base', 'iframe', 'object', 'embed'].includes(child.tagName)
        && !(child.tagName === 'meta' && child.attrs?.some(attr => attr.name === 'http-equiv' && ['refresh', 'content-security-policy'].includes(attr.value.trim().toLowerCase()))));
      if (node.attrs) node.attrs = node.attrs.filter(attr => !(node.tagName === 'a' && ['href', 'target', 'download'].includes(attr.name)) && !(node.tagName === 'form' && ['action', 'target'].includes(attr.name)));
      for (const child of node.childNodes) clean(child);
      if (node.content) clean(node.content);
    };
    clean(document);
    const head = document.childNodes.find(node => node.tagName === 'html')?.childNodes.find(node => node.tagName === 'head');
    const policy = parseFragment(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">`).childNodes[0];
    policy.parentNode = head;
    head.childNodes.unshift(policy);
  }
  const walk = async node => {
    for (const attr of node.attrs || []) {
      if (['srcset', 'imagesrcset'].includes(attr.name)) attr.value = '';
      if (['src', 'poster', 'background'].includes(attr.name)
        || node.tagName === 'link' && attr.name === 'href') attr.value = await dataURL(attr.value, path);
      if (attr.name === 'style') attr.value = await css(attr.value, path);
    }
    if (node.tagName === 'style') for (const child of node.childNodes || []) if (child.nodeName === '#text') child.value = await css(child.value, path);
    for (const child of node.childNodes || []) await walk(child);
    if (node.content) await walk(node.content);
  };
  await walk(document);
  return serialize(document);
}
