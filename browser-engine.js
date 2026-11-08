import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import {cssDependencyUrls} from './asset-archive.js';

export const BROWSER_RESULT_MARKER = '__DSH_DESIGNER_BROWSER_RESULT__';
const MARKER = BROWSER_RESULT_MARKER;

/** For a sandbox-aware injected runner: combine stdout/stderr, then parse this receipt. */
export function parseCliOutput(output, exitCode = 0) {
  const line = String(output).split(/\r?\n/).filter(line => line.startsWith(MARKER)).at(-1);
  if (!line) throw Object.assign(new Error(`ego-browser exited ${exitCode}: ${String(output).slice(-1800)}`),{code:'BROWSER_CLI_FAILED'});
  const result = JSON.parse(line.slice(MARKER.length));
  if (!result.ok) throw Object.assign(new Error(result.error),{code:result.code || 'BROWSER_OPERATION_FAILED'});
  if (exitCode !== 0) throw Object.assign(new Error(`ego-browser exited ${exitCode}`),{code:'BROWSER_CLI_FAILED'});
  return result.value;
}
const DEFAULTS = { timeoutMs: 45000, captureTimeoutMs: 60000, maxResources: 300, maxResourceBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, maxHtmlBytes: 12 * 1024 * 1024, maxNodes: 6000 };
const failure = (code, message) => Object.assign(new Error(message), { code });
function isControlStop(error) { return /EGO_.*(?:CONTROL|TASK_SPACE|OWNERSHIP|PERMISSION|HANDOFF)|(?:FS_)?SANDBOX_DENIED|PERMISSION_DENIED|POLICY_DENIED|space.*(?:inactive|unassigned)|user.*(?:control|take.?over)/i.test(`${error?.code || ''} ${error?.message || ''}`); }
const size = value => Buffer.byteLength(value, 'utf8');
const category = mime => /css/i.test(mime) ? 'stylesheet' : /font|woff|ttf|otf/i.test(mime) ? 'font' : /image/i.test(mime) ? 'image' : 'other';
function dimension(value, fallback) { const n = value ?? fallback; if (!Number.isInteger(n) || n < 240 || n > 3840) throw failure('INVALID_VIEWPORT', 'Viewport dimensions must be integers from 240 to 3840'); return n; }
function webUrl(value) { let u; try { u = new URL(value); } catch { throw failure('INVALID_URL', 'Expected an absolute http or https URL'); } if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw failure('INVALID_URL', 'Only http(s) URLs without embedded credentials are supported'); return u.href; }
function resourceUrl(value){const url=new URL(value);if(!['http:','https:','blob:'].includes(url.protocol)||url.username||url.password)throw failure('UNSAFE_RESOURCE_URL','Only static HTTP(S) or owned blob resources without credentials are supported');url.hash='';return url.href;}

export function wrapCliScript(source) { return `try {\n${source}\n} catch (error) { console.log(${JSON.stringify(MARKER)} + JSON.stringify({ok:false,code:error.code,error:error.message})); }\n`; }

/** Executes only the installed ego-browser CLI. No profile selection or browser launch. */
export function createCliRunner({ executable = process.env.EGO_BROWSER_CLI || path.join(homedir(), '.local/bin/ego-browser') } = {}) {
  return (source, { timeoutMs = DEFAULTS.timeoutMs, maxOutputBytes = 64 * 1024 * 1024 } = {}) => new Promise((resolve, reject) => {
    const child = spawn(executable, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(failure('BROWSER_TIMEOUT', 'ego-browser operation exceeded its time limit; resume or close the same browser')); }, timeoutMs);
    const receive = chunk => { bytes += chunk.length; if (bytes > maxOutputBytes) { child.kill('SIGTERM'); finish(failure('BROWSER_OUTPUT_LIMIT', 'Browser result exceeded the output limit')); } else chunks.push(chunk); };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', error => finish(failure('BROWSER_CLI_UNAVAILABLE', error.message)));
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (done) return;
      const output = Buffer.concat(chunks).toString('utf8');
      try { finish(null,parseCliOutput(output,code)); } catch (error) { finish(error); }
    });
    child.stdin.end(wrapCliScript(source));
  });
}
const emit = expression => `console.log(${JSON.stringify(MARKER)} + JSON.stringify({ok:true,value:${expression}}));`;
const resume = entry => `const task = await taskSpace(${JSON.stringify(entry.spaceId)}); const page = task.page(${JSON.stringify(entry.label)}); ${entry.width ? `await page.cdp('Emulation.setDeviceMetricsOverride',{width:${entry.width},height:${entry.height},deviceScaleFactor:1,mobile:false});` : ''}`;
const observe = `const meta = await page.evaluate(() => ({url:location.href,title:document.title,width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,scrollX,scrollY})); const shot = await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},{timeout:10000}); const events = await page.events(); const responses = events.filter(e => e.method === 'Network.responseReceived').map(e => ({requestId:e.params.requestId,url:e.params.response.url,mimeType:e.params.response.mimeType}));`;

/** Bounded readiness only: never scroll, click, submit, or rewrite the source DOM. */
export async function waitForCaptureAssets({timeoutMs=2000}={}){
  let timedOut=false,timer;const warnings=[];
  const images=[...document.images].filter(image=>image.loading!=='lazy'&&typeof image.decode==='function');
  try{await Promise.race([Promise.allSettled([document.fonts?.ready,...images.map(image=>Promise.resolve().then(()=>image.decode()))]),new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;resolve()},timeoutMs)})]);}finally{clearTimeout(timer);}
  if(timedOut)warnings.push('Visible source assets did not all settle before the bounded screenshot deadline');
  const fontStatus=document.fonts?.status||'unavailable',imageFailures=images.filter(image=>!image.complete||!image.naturalWidth).length;
  if(fontStatus==='loading')warnings.push('Source fonts were still loading when captured');
  if(imageFailures)warnings.push(imageFailures+' non-lazy source images were not decoded when captured');
  return {fontStatus,imageFailures,timedOut,warnings};
}

/** Page-context extraction. Deliberately self-contained so it can cross the CLI boundary. */
export function captureDocument({ maxNodes = 6000 } = {}) {
  const warnings = []; const resources = new Set(); const nodes = []; const identities = new WeakMap(); const identityCounts = new Map(); const paths = new WeakMap();
  const hash = value => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0),16777619); return (h >>> 0).toString(36); };
  const identity = node => {
    if (identities.has(node)) return identities.get(node);
    const parent = node.parentElement; const siblings = parent ? [...parent.children].filter(n => n.tagName === node.tagName) : [node];
    const elementPath = (parent ? (paths.get(parent) || parent.tagName.toLowerCase()) + ' > ' : '') + node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node)+1) + ')'; paths.set(node,elementPath);
    const authored = node.getAttribute('data-dsh-node'); const hint = node.id ? node.tagName + '#' + node.id : node.getAttribute('data-testid') ? node.tagName + '[testid=' + node.getAttribute('data-testid') + ']' : elementPath;
    const base = authored && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/.test(authored) && !['constructor','prototype','__proto__'].includes(authored) ? authored : 'src-' + hash(hint); const count = identityCounts.get(base) || 0; identityCounts.set(base,count+1); const id = count ? base + '-' + count : base; identities.set(node,id); return id;
  };
  const root = document.documentElement.cloneNode(true);
  const live = [document.documentElement, ...document.documentElement.querySelectorAll('*')];
  const clones = [root, ...root.querySelectorAll('*')];
  if (live.length > maxNodes) throw new Error(`Document has ${live.length} elements; capture limit is ${maxNodes}`);
  const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return value; } };
  const safeUrl = value => { try { const url = new URL(value,document.baseURI); return !url.username && !url.password && (['http:','https:','blob:'].includes(url.protocol) || (url.protocol === 'data:' && /^data:(?:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon)|font\/|application\/(?:font|x-font|vnd\.ms-fontobject))/i.test(value))); } catch { return false; } };
  const css = (text, base = document.baseURI) => text.replace(/expression\s*\([^)]*\)|(?:behavior|-moz-binding)\s*:[^;}]+/gi, '').replace(/@import\s+(['"])(.*?)\1/gi, (_all,_q,url) => `@import url(${JSON.stringify(url)})`).replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_all, _q, url) => { let result; try { const resolved = new URL(url, base); const current = new URL(location.href); if (resolved.hash && resolved.href.split('#')[0] === current.href.split('#')[0]) return `url(${JSON.stringify(resolved.hash)})`; result = resolved.href; } catch { return 'none'; } if (!safeUrl(result)) return 'none'; if (/^(https?:|blob:)/.test(result)) resources.add(result); return `url(${JSON.stringify(result)})`; });
  const props = ('display position box-sizing width height min-width min-height max-width max-height top right bottom left z-index float clear overflow overflow-x overflow-y margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius border-collapse border-spacing outline box-shadow opacity visibility color background background-image background-size background-position background-repeat background-clip background-origin font-family font-size font-weight font-style font-variant line-height letter-spacing word-spacing text-align text-decoration text-transform text-indent text-shadow white-space word-break overflow-wrap vertical-align list-style flex flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-content align-self justify-content justify-items justify-self order gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow grid-auto-columns grid-auto-rows grid-column grid-row transform transform-origin object-fit object-position aspect-ratio writing-mode direction fill stroke stroke-width clip-path filter mix-blend-mode isolation').split(' ');
  const declarations = (style, important = false) => props.map(p => `${p}:${css(style.getPropertyValue(p))}${important ? '!important' : ''}`).join(';');
  const extra = []; const sharedStyles = new Map();
  for (let i = 0; i < live.length; i++) {
    const node = live[i]; const copy = clones[i]; const nodeId = identity(node); copy.setAttribute('data-dsh-node',nodeId);
    if (node.shadowRoot) warnings.push('Open shadow DOM is represented by its host; shadow content may be incomplete');
    if (['SCRIPT','NOSCRIPT','TEMPLATE','IFRAME','FRAME','FRAMESET','OBJECT','EMBED','BASE','PORTAL','ANIMATE','ANIMATEMOTION','ANIMATETRANSFORM','SET'].includes(copy.tagName.toUpperCase())) { if (/FRAME/.test(copy.tagName)) warnings.push('Embedded frame omitted from static capture'); copy.remove(); continue; }
    if (copy.tagName === 'META' && (copy.hasAttribute('http-equiv') || copy.getAttribute('name')?.toLowerCase() === 'referrer')) { copy.remove(); continue; }
    if (copy.tagName === 'LINK' && !/^(stylesheet|icon)$/i.test(copy.getAttribute('rel') || '')) { copy.remove(); continue; }
    for (const attr of [...copy.attributes]) {
      const name = attr.name.toLowerCase();
      if (/^on/.test(name) || ['srcdoc','nonce','integrity','autofocus','autoplay','action','formaction','ping','target','download'].includes(name)) copy.removeAttribute(attr.name);
      else if (['src','href','xlink:href','poster','data','background'].includes(name)) {
        if (!safeUrl(attr.value)) copy.removeAttribute(attr.name);
        else if (attr.value && !attr.value.startsWith('#')) { const url = absolute(attr.value); copy.setAttribute(attr.name, url); if (name !== 'href' || copy.tagName === 'LINK' || copy.namespaceURI?.includes('svg')) if (/^(https?:|blob:)/.test(url)) resources.add(url); }
      }
    }
    copy.removeAttribute('srcset'); copy.removeAttribute('imagesrcset'); copy.removeAttribute('loading');
    if (node.tagName === 'IMG') { const url = node.currentSrc || node.src || node.getAttribute('data-src'); if (url && safeUrl(url)) { copy.setAttribute('src', absolute(url)); if (/^(https?:|blob:)/.test(absolute(url))) resources.add(absolute(url)); } }
    if (node.tagName === 'INPUT') { copy.setAttribute('value', node.type === 'password' || node.type === 'file' ? '' : node.value); node.checked ? copy.setAttribute('checked','') : copy.removeAttribute('checked'); }
    if (node.tagName === 'TEXTAREA') copy.textContent = node.value;
    if (node.tagName === 'OPTION') node.selected ? copy.setAttribute('selected','') : copy.removeAttribute('selected');
    if (node.tagName === 'DETAILS') node.open ? copy.setAttribute('open','') : copy.removeAttribute('open');
    if (node.tagName === 'STYLE') copy.textContent = css(node.textContent).replace(/<\/style/gi,'<\\/style');
    if (!['STYLE','LINK','META','TITLE','HEAD'].includes(node.tagName)) {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      const attrs = {}; for (const key of ['id','role','href','src','alt','aria-label','aria-expanded','aria-selected','aria-controls','type','name','open','hidden']) if (copy.hasAttribute(key)) attrs[key] = copy.getAttribute(key);
      if (node.tagName === 'INPUT' && !['password','file','hidden'].includes(node.type)) attrs.value = node.value;
      nodes.push({id:nodeId,parentId:node.parentElement ? identity(node.parentElement) : null,tag:node.tagName.toLowerCase(),selector:node.id ? '#' + CSS.escape(node.id) : paths.get(node),identity:node.id || node.getAttribute('data-dsh-node') || node.getAttribute('data-testid') ? 'authored' : 'structural',text:[...node.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim().slice(0,1500),attrs,layout:{x:Math.round((rect.x+scrollX)*10)/10,y:Math.round((rect.y+scrollY)*10)/10,width:Math.round(rect.width*10)/10,height:Math.round(rect.height*10)/10,display:style.display,position:style.position},visible:rect.width>0 && rect.height>0 && style.display!=='none' && style.visibility!=='hidden'});
      const declaration = declarations(style,true); nodes[nodes.length-1].styleHash = hash(declaration);
      if (!sharedStyles.has(declaration)) sharedStyles.set(declaration,String(sharedStyles.size));
      copy.removeAttribute('style'); copy.setAttribute('data-designer-style',sharedStyles.get(declaration));
      for (const pseudo of ['::before','::after','::marker']) {
        const ps = getComputedStyle(node,pseudo); const content = ps.getPropertyValue('content');
        if (content && !['none','normal','""'].includes(content)) { copy.setAttribute('data-designer-node', String(i)); extra.push(`[data-designer-node="${i}"]${pseudo}{${declarations(ps)};content:${css(content)};animation:none!important}`); }
      }
    }
    if (node.tagName === 'CANVAS') { try { const image = document.createElement('img'); for (const attr of [...copy.attributes]) image.setAttribute(attr.name,attr.value); image.src = node.toDataURL('image/png'); copy.replaceWith(image); } catch { warnings.push('A tainted canvas could not be rasterized'); } }
  }
  // Accessible author rules retain responsive rules, font-face, pseudo-elements and custom properties.
  for (const sheet of document.styleSheets) {
    try { extra.push([...sheet.cssRules].map(rule => css(rule.cssText, sheet.href || document.baseURI)).join('\n')); }
    catch { if (sheet.href) resources.add(sheet.href); warnings.push(`Stylesheet rules require cached resource: ${sheet.href || 'inline'}`); }
  }
  for (const [declaration,id] of sharedStyles) extra.push(`[data-designer-style="${id}"]{${declaration};animation:none!important;transition:none!important}`);
  const style = document.createElement('style'); style.setAttribute('data-designer-capture',''); style.textContent = extra.join('\n').replace(/<\/style/gi,'<\\/style'); (root.querySelector('head') || root).appendChild(style);
  const meta = document.createElement('meta'); meta.setAttribute('http-equiv','Content-Security-Policy'); meta.setAttribute('content', "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"); (root.querySelector('head') || root).prepend(meta);
  return { html:'<!DOCTYPE html>\n' + root.outerHTML, resourceUrls:[...resources], nodes, navigation:nodes.filter(n => n.tag === 'a' && n.attrs.href).map(n => ({nodeId:n.id,url:n.attrs.href,text:n.text})), warnings:[...new Set(warnings)], url:location.href,title:document.title,width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight };
}

/** Decode Chromium MHTML assets without writing or trusting its executable HTML. */
export function parseMhtml(data, { maxResourceBytes = DEFAULTS.maxResourceBytes, maxTotalBytes = DEFAULTS.maxTotalBytes, onFailure=()=>{} } = {}) {
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i.exec(data);
  if (!boundary) {if(data)onFailure({url:'',code:'INVALID_MHTML',reason:'Chromium snapshot did not contain a multipart boundary'});return [];}
  const results = []; let total = 0;
  for (const part of data.split('--' + (boundary[1] || boundary[2])).slice(1)) {
    const split = /\r?\n\r?\n/.exec(part); if (!split) continue;
    const headers = part.slice(0,split.index).replace(/\r?\n[\t ]+/g,' ');
    const get = name => new RegExp('(?:^|\\n)' + name + ':\\s*([^\\r\\n]+)','i').exec(headers)?.[1]?.trim();
    let url = get('Content-Location'); const mimeType = (get('Content-Type')?.split(';')[0] || 'application/octet-stream').trim().toLowerCase();
    if (!url || /(?:javascript|ecmascript|html)/i.test(mimeType)) continue;
    try{const parsed=new URL(url);if(!['http:','https:','blob:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Only static HTTP(S) or owned blob snapshot resources are supported');parsed.hash='';url=parsed.href;}catch(error){onFailure({url,code:'UNSAFE_RESOURCE_URL',reason:error.message});continue;}
    let body = part.slice(split.index + split[0].length).replace(/\r?\n$/, ''); const encoding = get('Content-Transfer-Encoding'); let bytes;
    if (/^base64$/i.test(encoding || '')) {const compact=body.replace(/\s/g,'');bytes=Buffer.from(compact,'base64');if(bytes.toString('base64')!==compact){onFailure({url,code:'INVALID_RESOURCE_BYTES',reason:'Snapshot resource has invalid base64'});continue;}}
    else if (/^quoted-printable$/i.test(encoding || '')) { body = body.replace(/=\r?\n/g,''); const octets = []; for (let i = 0; i < body.length; i++) { if (body[i] === '=' && /^[a-f\d]{2}$/i.test(body.slice(i+1,i+3))) { octets.push(parseInt(body.slice(i+1,i+3),16)); i += 2; } else octets.push(body.charCodeAt(i) & 255); } bytes = Buffer.from(octets); }
    else bytes = Buffer.from(body,'utf8');
    if (bytes.length > maxResourceBytes || total + bytes.length > maxTotalBytes) {onFailure({url,code:'RESOURCE_LIMIT',reason:'Snapshot resource exceeds capture byte limits'});continue;}
    total += bytes.length; results.push({url,mimeType,bytesBase64:bytes.toString('base64'),category:category(mimeType),source:'mhtml'});
  }
  return results;
}

export function cssResourceUrls(text,base){return cssDependencyUrls(text,base,{allowBlob:true});}

export class BrowserEngine {
  constructor(options = {}) {
    this.limits = {...DEFAULTS,...options.limits}; this.runner = options.runner || createCliRunner(options); this.browsers = new Map(); this.spaceId = null; this.retainSpace = false; this.spaceName = options.spaceName || `Designer ${randomUUID()}`; this.queue = Promise.resolve(); this.disposed = false;
  }
  _serial(work) { const run = this.queue.then(work); this.queue = run.catch(() => {}); return run; }
  _run(source, timeoutMs = this.limits.timeoutMs) { return this.runner(`const isControlStop = ${isControlStop.toString()};\n${source}`, {timeoutMs, maxOutputBytes:Math.max(8 * 1024 * 1024, this.limits.maxTotalBytes * 3)}); }
  _entry(id, projectId) { const entry = this.browsers.get(id); if (!entry) throw failure('BROWSER_NOT_FOUND','Browser is not managed by this engine'); if (typeof projectId !== 'string' || entry.projectId !== projectId) throw failure('BROWSER_PROJECT_SCOPE','Browser belongs to another project'); return entry; }
  info(browserId) { const entry = this.browsers.get(browserId); return entry ? {browserId:entry.browserId,projectId:entry.projectId} : null; }
  _update(entry, value) { for (const response of value.responses || []) { entry.responses.set(response.url,response); if (entry.responses.size > this.limits.maxResources * 10) entry.responses.delete(entry.responses.keys().next().value); } if (Number.isInteger(value.width)) entry.width = value.width; if (Number.isInteger(value.height)) entry.height = value.height; const {responses,...rest} = value; return {browserId:entry.browserId,projectId:entry.projectId,...rest}; }
  async open(input) { return this._serial(async () => {
    if (this.disposed) throw failure('BROWSER_DISPOSED','Browser engine has been disposed');
    if (!input?.projectId || typeof input.projectId !== 'string') throw failure('INVALID_PROJECT','projectId is required');
    const url = webUrl(input.url); const width = dimension(input.width,1280); const height = dimension(input.height,800);
    const requestedSpace=input.spaceId;
    if(requestedSpace!==undefined&&(!Number.isSafeInteger(requestedSpace)||requestedSpace<1))throw failure('INVALID_BROWSER_SPACE','Use the exact positive existing TaskSpace ID');
    if(requestedSpace!==undefined&&this.spaceId!==null&&requestedSpace!==this.spaceId)throw failure('BROWSER_SPACE_SCOPE','This workbench already uses another shared TaskSpace');
    const result = await this._run(`const task = await taskSpace(${JSON.stringify(this.spaceId ?? requestedSpace ?? this.spaceName)}); ${emit('{spaceId:task.spaceId}')} `);
    if(requestedSpace!==undefined&&result.spaceId!==requestedSpace)throw failure('BROWSER_SPACE_MISMATCH','Existing TaskSpace identity did not match; no fallback space was created');
    this.spaceId = result.spaceId;if(requestedSpace!==undefined)this.retainSpace=true;
    const entry = {browserId:randomUUID(),projectId:input.projectId,spaceId:this.spaceId,label:null,width,height,responses:new Map()};
    // The first space already owns p1; subsequent browser sessions get their own managed Page.
    try {
      const value = await this._run(`const task = await taskSpace(${JSON.stringify(this.spaceId)}); const pages = await task.pages(); const page = ${this.browsers.size === 0 ? "pages.find(p => p.label === 'p1') || await task.newPage()" : 'await task.newPage()'}; const label = page.label; ${emit('{label}')} `);
      entry.label = value.label; this.browsers.set(entry.browserId,entry);
      return this._update(entry,await this._run(`${resume(entry)} await page.cdp('Network.enable',{maxTotalBufferSize:${this.limits.maxTotalBytes},maxResourceBufferSize:${this.limits.maxResourceBytes}}); await page.cdp('Emulation.setDeviceMetricsOverride',{width:${width},height:${height},deviceScaleFactor:1,mobile:false}); await page.goto(${JSON.stringify(url)},{timeout:20000}); ${observe} ${emit("{...meta,screenshot:'data:image/png;base64,'+shot.data,responses}")}`));
    } catch (error) { if (entry.label && !isControlStop(error)) { try { await this._run(`${resume(entry)} await page.close(); ${emit('{closed:true}')}`); this.browsers.delete(entry.browserId); } catch {} } throw error; }
  }); }
  async action(input) { return this._serial(async () => {
    const entry = this._entry(input.browserId,input.projectId); let operation;
    const selector = JSON.stringify(input.selector || '');
    switch (input.type) {
      case 'navigate': operation = `await page.goto(${JSON.stringify(webUrl(input.url))},{timeout:20000});`; break;
      case 'resize': operation = `await page.cdp('Emulation.setDeviceMetricsOverride',{width:${dimension(input.width,1280)},height:${dimension(input.height,800)},deviceScaleFactor:1,mobile:false});`; break;
      case 'click': if (input.selector) operation = `await page.click(${selector},{label:'interact with page'});`; else { if (![input.x,input.y].every(Number.isFinite) || Math.abs(input.x) > 10000 || Math.abs(input.y) > 10000) throw failure('INVALID_ACTION','click requires selector or finite x/y'); operation = `await page.mouse.click(${input.x},${input.y},{label:'interact with page'});`; } break;
      case 'type': if (typeof input.text !== 'string' || input.text.length > 10000) throw failure('INVALID_ACTION','type requires text up to 10000 characters'); operation = input.selector ? `await page.fill(${selector},${JSON.stringify(input.text)});` : `await page.keyboard.insertText(${JSON.stringify(input.text)});`; break;
      case 'key': if (typeof input.key !== 'string' || input.key.length > 100) throw failure('INVALID_ACTION','key requires a key chord'); operation = `await page.keyboard.press(${JSON.stringify(input.key)});`; break;
      case 'scroll': { const dx = input.deltaX ?? 0; const dy = input.deltaY ?? 0; if (![dx,dy].every(Number.isFinite) || Math.abs(dx) > 10000 || Math.abs(dy) > 10000) throw failure('INVALID_ACTION','scroll delta must be finite and at most 10000'); operation = `const position = await page.evaluate(() => ({x:Math.floor(innerWidth/2),y:Math.floor(innerHeight/2)})); await page.mouse.move(position.x,position.y,{label:'scroll page content'}); await page.mouse.wheel(${dx},${dy},{label:'scroll page content'});`; break; }
      case 'back': case 'forward': operation = `const history = await page.cdp('Page.getNavigationHistory'); const destination = history.entries[history.currentIndex ${input.type === 'back' ? '-' : '+'} 1]; if (destination) await page.cdp('Page.navigateToHistoryEntry',{entryId:destination.id});`; break;
      default: throw failure('INVALID_ACTION','Unsupported browser action');
    }
    return this._update(entry,await this._run(`${resume(entry)} ${operation} ${observe} ${emit("{...meta,screenshot:'data:image/png;base64,'+shot.data,responses}")}`));
  }); }
  async capture({browserId,projectId,clip}) { return this._serial(async () => {
    const entry = this._entry(browserId,projectId); const limits = this.limits; const deadline = Date.now() + limits.captureTimeoutMs;
    if (clip && (!['x','y','width','height'].every(k => Number.isFinite(clip[k])) || clip.x < 0 || clip.y < 0 || clip.x > 1000000 || clip.y > 1000000 || clip.width < 1 || clip.height < 1 || clip.width > 3840 || clip.height > 3840)) throw failure('INVALID_REGION','Screenshot region must be bounded document CSS pixels');
    const observation = clip ? observe.replace("{format:'png',captureBeyondViewport:false}",JSON.stringify({format:'png',captureBeyondViewport:true,clip:{x:clip.x,y:clip.y,width:clip.width,height:clip.height,scale:1}})) : observe;
    const raw = await this._run(`${resume(entry)} const settled=await page.evaluate(${waitForCaptureAssets.toString()},{timeoutMs:2000}); let mhtml = ''; const warnings = [...(settled?.warnings||[])]; try { const value = await page.cdp('Page.captureSnapshot',{format:'mhtml'},{timeout:15000}); if (Buffer.byteLength(value.data) <= ${limits.maxTotalBytes * 2}) mhtml = value.data; else warnings.push('MHTML exceeded capture size limit'); } catch(error) { if (isControlStop(error)) throw error; warnings.push('MHTML unavailable: ' + error.message); } const dom = await page.evaluate(${captureDocument.toString()},${JSON.stringify({maxNodes:limits.maxNodes})}); ${observation} ${emit("{...dom,screenshot:'data:image/png;base64,'+shot.data,responses,mhtml,warnings:[...dom.warnings,...warnings]}")}`,Math.min(limits.timeoutMs,limits.captureTimeoutMs));
    if (size(raw.html) > limits.maxHtmlBytes) throw failure('CAPTURE_HTML_LIMIT','Captured document exceeds the HTML size limit');
    const snapshot = this._update(entry,raw); const resources = new Map(); const failures = []; let total = 0;
    const add = resource => { const bytes = Buffer.from(resource.bytesBase64,'base64').length; if (resources.has(resource.url)) return; if (bytes > limits.maxResourceBytes || total + bytes > limits.maxTotalBytes || resources.size >= limits.maxResources) { failures.push({url:resource.url,reason:'Resource byte/count limit exceeded'}); return; } total += bytes; resources.set(resource.url,resource); };
    const snapshotFailures=[],cached = new Map(parseMhtml(raw.mhtml,{...limits,onFailure:value=>snapshotFailures.push(value)}).map(r => [r.url,r]));
    const pending=new Set(),remember=url=>{try{pending.add(resourceUrl(url));}catch(error){failures.push({url,code:error.code||'UNSAFE_RESOURCE_URL',reason:error.message});}};
    for(const url of raw.resourceUrls||[])remember(url);
    for(const resource of cached.values())if(resource.category!=='other'||/^(?:audio|video)\//.test(resource.mimeType))remember(resource.url);
    for(const item of snapshotFailures)if(item.url&&/^(?:https?:|blob:)/i.test(item.url))remember(item.url);
    const seen = new Set(); let interrupted = false;
    while (!interrupted && pending.size && seen.size < limits.maxResources && Date.now() < deadline - 1000) {
      const batch = [...pending].filter(url => !seen.has(url)).slice(0,8); if (!batch.length) break;
      const missing = [];
      for (const url of batch) { pending.delete(url); seen.add(url); if (cached.has(url)) add(cached.get(url)); else missing.push({url,requestId:entry.responses.get(url)?.requestId,mimeType:entry.responses.get(url)?.mimeType}); }
      if (missing.length) {
        const remainingBytes = limits.maxTotalBytes - total;
        const fetched = await this._run(`${resume(entry)} const requests = ${JSON.stringify(missing)}; const results = []; const stop = Date.now() + ${Math.max(1,Math.min(15000,deadline-Date.now()-500))}; let remaining = ${remainingBytes}; let tree; try { tree = await page.cdp('Page.getResourceTree',{}, {timeout:3000}); } catch(error) { if (isControlStop(error)) throw error; } const frames = []; const walk = t => { if (!t) return; frames.push(t); for (const c of t.childFrames || []) walk(c); }; walk(tree?.frameTree);
for (const request of requests) {
 if (Date.now() >= stop || remaining <= 0) { results.push({url:request.url,error:'Capture time/byte limit exceeded'}); continue; }
 let found; let mimeType = request.mimeType;
 try {
  if (request.requestId) { try { const body = await page.cdp('Network.getResponseBody',{requestId:request.requestId},{timeout:2000}); found = {bytesBase64:body.base64Encoded ? body.body : Buffer.from(body.body).toString('base64'),source:'network'}; } catch(error) { if (isControlStop(error)) throw error; } }
  if (!found) { const frame = frames.find(f => f.resources?.some(r => r.url === request.url)); if (frame) { try { const body = await page.cdp('Page.getResourceContent',{frameId:frame.frame.id,url:request.url},{timeout:2000}); mimeType ||= frame.resources.find(r => r.url === request.url)?.mimeType; found = {bytesBase64:body.base64Encoded ? body.content : Buffer.from(body.content).toString('base64'),source:'resource-cache'}; } catch(error) { if (isControlStop(error)) throw error; } } }
  if (!found) { const response = await page.evaluate(async ({url,limit,timeout}) => { const target = new URL(url,location.href); if (!['http:','https:','blob:'].includes(target.protocol) || target.username || target.password) throw new Error('Unsupported resource URL'); if (target.protocol === 'blob:' && target.origin !== location.origin) throw new Error('Foreign blob URL'); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),timeout); try { const response = await fetch(target.href,{credentials:target.origin === location.origin ? 'same-origin' : 'omit',redirect:'error',signal:controller.signal}); if (!response.ok || response.type === 'opaque') throw new Error('Resource HTTP ' + response.status); if (Number(response.headers.get('content-length')) > limit) throw new Error('Resource byte limit exceeded'); const reader = response.body.getReader(); const chunks = []; let length = 0; while (true) { const {done,value} = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); throw new Error('Resource byte limit exceeded'); } chunks.push(value); } let binary = ''; for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 16384) binary += String.fromCharCode(...chunk.subarray(i,i+16384)); return {bytesBase64:btoa(binary),mimeType:response.headers.get('content-type')?.split(';')[0]}; } finally { clearTimeout(timer); } },{url:request.url,limit:Math.min(${limits.maxResourceBytes},remaining),timeout:Math.max(1,Math.min(3500,stop-Date.now()))}); found = {...response,source:'page-fetch'}; mimeType ||= response.mimeType; }
  const bytes = Buffer.from(found.bytesBase64,'base64').length; if (bytes > ${limits.maxResourceBytes} || bytes > remaining) throw new Error('Resource byte limit exceeded'); remaining -= bytes; results.push({url:request.url,mimeType:mimeType || 'application/octet-stream',...found});
 } catch(error) { if (isControlStop(error)) throw error; results.push({url:request.url,error:error.message}); }
}
${emit('{results}')}`,Math.max(1000,Math.min(limits.timeoutMs,deadline-Date.now()))).catch(error => { if (!['BROWSER_TIMEOUT','BROWSER_OUTPUT_LIMIT'].includes(error.code)) throw error; interrupted = true; return {results:missing.map(r => ({url:r.url,error:error.message}))}; });
        for (const resource of fetched.results) if (resource.error) failures.push({url:resource.url,reason:resource.error}); else add({...resource,category:category(resource.mimeType)});
      }
      for (const url of batch) { const resource = resources.get(url); if (resource?.category === 'stylesheet') for (const nested of cssResourceUrls(Buffer.from(resource.bytesBase64,'base64').toString('utf8'),url)) if (!seen.has(nested)) pending.add(nested); }
    }
    for (const url of pending) if (!seen.has(url)) failures.push({url,code:'RESOURCE_LIMIT',reason:'Capture time/resource count limit exceeded'});
    for(const item of snapshotFailures)if(item.url&&!resources.has(item.url)&&!failures.some(f=>f.url===item.url))failures.push(item);
    const {mhtml,resourceUrls,...result} = snapshot;
    return {...result,resources:[...resources.values()],failures,captureDiagnostics:{provider:'ego-browser-cdp',nativeElectronCapture:false,cachedResources:cached.size,capturedResources:resources.size,failedResources:failures.length,totalBytes:total},warnings:[...new Set([...(result.warnings||[]),...snapshotFailures.map(item=>'Snapshot resource: '+item.reason),...(failures.length ? [`${failures.length} resources could not be captured; inspect failures`] : [])])],capturedAt:new Date().toISOString(),totalResourceBytes:total};
  }); }
  async close({browserId,projectId}) { return this._serial(async () => { const entry = this._entry(browserId,projectId); await this._run(`${resume(entry)} await page.close(); ${emit('{closed:true}')}`); this.browsers.delete(browserId); return {browserId,closed:true}; }); }
  async dispose() { return this._serial(async () => { if (this.disposed) return; if (this.spaceId !== null&&!this.retainSpace) await this._run(`const task = await taskSpace(${JSON.stringify(this.spaceId)}); await task.finish({keep:[]}); ${emit('{closed:true}')}`); this.browsers.clear(); this.disposed = true; }); }
}
