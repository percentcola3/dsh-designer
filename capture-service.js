import path from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {parse,serialize} from 'parse5';
import {fail} from './store.js';
import {BROWSER_RESULT_MARKER} from './browser-engine.js';

const MAX_FILE=32*1024*1024,MAX_TOTAL=128*1024*1024,MAX_PIXELS=80_000_000;
const TTL=60000,PREFIX='/api/designer/capture/';
const HASH=bytes=>createHash('sha256').update(bytes).digest('hex');
const MIME={css:'text/css',js:'text/javascript',mjs:'text/javascript',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',eot:'application/vnd.ms-fontobject',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav'};
const logical=value=>{if(typeof value!=='string'||!value||value.length>2000||value.includes('\0')||value.includes('\\')||value.startsWith('/')||/^[a-z]:/i.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git'||p==='.workbench'||p.startsWith('.env')))fail('INVALID_CAPTURE_PATH','Capture resources must be canonical project-relative paths');return value;};
const extension=value=>path.posix.extname(value).slice(1).toLowerCase();
const encodePath=value=>value.split('/').map(encodeURIComponent).join('/');
const controlStop=error=>/EGO_.*(?:CONTROL|TASK_SPACE|OWNERSHIP|PERMISSION|HANDOFF)|(?:FS_)?SANDBOX_DENIED|PERMISSION_DENIED|POLICY_DENIED|space.*(?:inactive|unassigned)|user.*(?:control|take.?over)/i.test(`${error?.code||''} ${error?.message||''}`);
const receipt=value=>`console.log(${JSON.stringify(BROWSER_RESULT_MARKER)}+JSON.stringify({ok:true,value:${value}}));`;
function check(env){env.signal?.throwIfAborted();if(Date.now()>env.deadline)fail('CAPTURE_TIMEOUT','Image capture exceeded its time budget');}
function b64(value,max=MAX_FILE){if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||value.length%4!==0||/[^A-Za-z0-9+/=]/.test(value))fail('INVALID_CAPTURE_BYTES','Capture file bytes must be bounded canonical base64');const bytes=Buffer.from(value,'base64');if(bytes.toString('base64')!==value)fail('INVALID_CAPTURE_BYTES','Capture file base64 is not canonical');return bytes;}
function copiedBytes(value){if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))fail('INVALID_CAPTURE_BYTES','Native capture files require Buffer/Uint8Array bytes or canonical base64');if(value.byteLength>MAX_FILE)fail('CAPTURE_RESOURCE_LIMIT','Capture file exceeds 32 MiB');return Buffer.from(value);}
function mimeFor(file){const ext=extension(file.path),expected=MIME[ext];if(!expected)return null;let actual=String(file.mimeType||expected).split(';')[0].trim().toLowerCase();if(['application/javascript','application/ecmascript','text/ecmascript'].includes(actual))actual='text/javascript';actual=({'application/font-woff':'font/woff','application/font-woff2':'font/woff2','application/x-font-ttf':'font/ttf','application/x-font-opentype':'font/otf'})[actual]||actual;if(actual!==expected)fail('CAPTURE_MIME_MISMATCH','A static resource MIME does not match its filename',{path:file.path});return actual;}
function validateImage(bytes,format){const valid=format==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):format==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)fail('CAPTURE_FORMAT_MISMATCH','Chromium did not return the requested actual image format');if(bytes.length>MAX_FILE)fail('CAPTURE_IMAGE_LIMIT','Captured image exceeds 32 MiB');return format==='jpeg'?'image/jpeg':`image/${format}`;}
function cssRewrite(css,rewrite){return css.replace(/@import\s+(['"])(.*?)\1/gi,(_all,_q,url)=>`@import url(${JSON.stringify(rewrite(url))})`).replace(/url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi,(_all,a,b,c)=>`url(${JSON.stringify(rewrite((a??b??c).trim()))})`);}
function srcsetRewrite(value,rewrite){let i=0;const result=[];while(i<value.length){while(/[\s,]/.test(value[i]||'')&&i<value.length)i++;if(i>=value.length)break;const start=i,data=value.slice(i,i+5).toLowerCase()==='data:';while(i<value.length&&!/\s/.test(value[i])&&(data||value[i]!==','))i++;let url=value.slice(start,i);const ended=data&&url.endsWith(',');if(ended)url=url.slice(0,-1);const descriptor=i;if(!ended)while(i<value.length&&value[i]!==',')i++;result.push(rewrite(url)+(ended?'':value.slice(descriptor,i)));if(value[i]===',')i++;}return result.join(', ');}
function jsRewrite(js,rewrite){if([...js.matchAll(/\bimport\s*\(\s*([^\s])/g)].some(m=>!['"',"'"].includes(m[1])))fail('CAPTURE_DYNAMIC_DEPENDENCY','Bundle dynamic module specifiers before image capture');const specifier=url=>{if(!/^(?:\.|\/|https?:|data:)/i.test(url))fail('CAPTURE_UNBUNDLED_MODULE','Bundle bare module imports before capture');const mapped=rewrite(url);return /^(?:\.|\/|data:)/i.test(mapped)?mapped:'./'+mapped;};return js.replace(/(\bnew\s+URL\s*\(\s*["'])([^"'\n]+)(["']\s*,\s*import\s*\.\s*meta\s*\.\s*url\s*\))/g,(_all,a,url,b)=>a+specifier(url)+b).replace(/(\b(?:import|export)\s*(?:[^;\n"']*?\bfrom\s*)?["'])([^"'\n]+)(["'])|(\bimport\s*\(\s*["'])([^"'\n]+)(["']\s*\))/g,(_all,a,url,b,c,d,e)=>(a??c)+specifier(url??d)+(b??e));}

/** Trusted page-side presentation only; executes on this capture's owned target. */
export async function prepareCapturePage(options){
  const timeout=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  if(document.fonts)await Promise.race([document.fonts.ready,timeout(3000)]);
  await Promise.race([Promise.all([...document.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});}))),timeout(3000)]);
  if(options.liveScroll){
    for(const el of document.querySelectorAll('[data-snapshot-top]')){
      if(el.dataset.snapshotTop==='modal'&&el.localName==='dialog'){el.removeAttribute('open');el.showModal();}
      else if(el.hasAttribute('popover'))el.showPopover();
    }
    for(const el of document.querySelectorAll('[data-preview-scroll-x],[data-preview-scroll-y]'))
      el.scrollTo({left:Number(el.dataset.previewScrollX)||0,top:Number(el.dataset.previewScrollY)||0,behavior:'instant'});
    scrollTo({left:options.liveScroll.x,top:options.liveScroll.y,behavior:'instant'});
  }
  const runtime=window.__DSH_DESIGN_RUNTIME__;
  if(options.scene){if(!runtime?.setScene||runtime.setScene(options.scene)===false)return {error:{code:'CAPTURE_SCENE_UNAVAILABLE',message:'Requested scene cannot be activated in the saved runtime'}};await Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),timeout(250)]);}
  document.documentElement.setAttribute('data-dsh-view-mode','preview');
  for(const node of document.querySelectorAll('[data-dsh-editor-overlay],[data-dsh-capture-marks]'))node.remove();
  if(!options.background)for(const node of [document.documentElement,document.body])if(node){node.style.setProperty('background-color','transparent','important');node.style.setProperty('background-image','none','important');}
  const all=[...document.querySelectorAll('[data-dsh-node]')],wanted=new Set(options.nodeIds||[]),selected=all.filter(node=>wanted.has(node.getAttribute('data-dsh-node')));
  if(wanted.size&&selected.length!==wanted.size)return {error:{code:'CAPTURE_NODE_MISSING',message:'A requested node is absent from the saved page'}};
  const boxes=selected.map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {id:node.getAttribute('data-dsh-node'),x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};});
  if(boxes.some(box=>!box.visible))return {error:{code:'CAPTURE_NODE_HIDDEN',message:'A requested node is hidden in the selected scene'}};
  let marked=0;
  if(options.editorMarks){const overlay=document.createElement('div');overlay.setAttribute('data-dsh-capture-marks','true');Object.assign(overlay.style,{position:'absolute',left:'0',top:'0',width:'0',height:'0',zIndex:'2147483647',pointerEvents:'none'});for(const node of (wanted.size?selected:all).slice(0,300)){const r=node.getBoundingClientRect();if(!r.width||!r.height)continue;const mark=document.createElement('div');Object.assign(mark.style,{position:'absolute',left:(r.x+scrollX)+'px',top:(r.y+scrollY)+'px',width:r.width+'px',height:r.height+'px',border:'2px solid #2563eb',boxSizing:'border-box',pointerEvents:'none'});const label=document.createElement('span');label.textContent=node.getAttribute('data-dsh-node')+' '+Math.round(r.width)+'×'+Math.round(r.height);Object.assign(label.style,{position:'absolute',left:'0',top:'0',font:'11px sans-serif',color:'#fff',background:'#2563eb',padding:'1px 3px',whiteSpace:'nowrap',maxWidth:Math.max(0,r.width-4)+'px',overflow:'hidden'});mark.appendChild(label);overlay.appendChild(mark);marked++;}document.documentElement.appendChild(overlay);}
  await Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),timeout(250)]);
  return {boxes,marked,viewport:{width:innerWidth,height:innerHeight},fontStatus:document.fonts?.status||'unavailable',fontFailures:document.fonts?[...document.fonts].filter(face=>face.status==='error').length:0,imageFailures:[...document.images].filter(image=>!image.complete||!image.naturalWidth).length,runtime:{present:!!runtime,readyState:document.readyState,scene:runtime?.getState?.().scene||options.scene||null}};
}

export class CaptureService {
  constructor(owner,{now=()=>Date.now()}={}){this.owner=owner;this.now=now;this.capabilities=new Map();this.pages=new Map();this.pending=new Set();this.controllers=new Set();this.disposed=false;}
  origin(){const url=new URL(this.owner.ctx.webServer.getOrigin());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('CAPTURE_ORIGIN','A trusted local web origin is required');return url.origin;}
  async prepare(payload,env){
    const project=(await this.owner.store.projectGet(payload.projectId,env.signal)).project;
    if(project.deletedAt||project.archived)fail('PROJECT_UNAVAILABLE','Restore the project before capturing');
    const page=project.artboards.find(p=>p.id===(payload.pageId||payload.artboardId)&&!p.deletedAt);if(!page)fail('PROJECT_SCOPE','Capture page is not in this project');
    if(payload.expectedRevision!==undefined&&payload.expectedRevision!==project.revision||payload.expectedArtboardRevision!==undefined&&payload.expectedArtboardRevision!==page.revision)fail('VERSION_CONFLICT','Capture target changed');
    let savedSourceHash=page.contentHash;if(!/^[a-f0-9]{64}$/.test(savedSourceHash||'')){const saved=await this.owner.store.artboardGet(project.id,page.id,env.signal);savedSourceHash=HASH(saved.html);}
    let files=payload.files,html=payload.html,entry=logical(payload.logicalPath||page.htmlPath);
    if(entry!==page.htmlPath)fail('PROJECT_SCOPE','Capture entry must be the selected saved page path');
    if(!Array.isArray(files)||typeof html!=='string'){
      if(typeof this.owner.delivery?.snapshot!=='function')fail('CAPTURE_EXPORT_UNAVAILABLE','The finite delivery snapshot adapter is unavailable');
      const frozen=await this.owner.delivery.snapshot(project,{pageId:page.id,format:'png',editorMarks:!!payload.editorMarks},env);files=frozen.files;entry=logical(frozen.pages[0].htmlPath);
      if(payload.livePreviewHtml!==undefined){
        // Only reuse dependencies admitted for this saved page. Never run source
        // scripts or event handlers supplied by a live iframe snapshot.
        const tree=parse(payload.livePreviewHtml);
        const clean=node=>{
          if(node.attrs)node.attrs=node.attrs.filter(attr=>!/^on/i.test(attr.name));
          if(node.childNodes){node.childNodes=node.childNodes.filter(child=>child.tagName!=='script');node.childNodes.forEach(clean);}
          if(node.content)clean(node.content);
        };
        clean(tree);html=serialize(tree);files=files.filter(file=>file.path!==entry);
      }else html=Buffer.from(files.find(f=>f.path===entry).bytes).toString('utf8');
    }
    if(files.length>4000||Buffer.byteLength(html)>MAX_FILE)fail('CAPTURE_RESOURCE_LIMIT','Capture snapshot exceeds resource limits');
    const supplied=new Map();let total=0;
    for(const file of files){const name=logical(file.path);if(name!==entry&&!MIME[extension(name)])continue;if(file.public===false)continue;const mimeType=name===entry?'text/html; charset=utf-8':mimeFor(file);const bytes=name===entry?Buffer.from(html):file.bytes?copiedBytes(file.bytes):b64(file.bytesBase64);if(bytes.length>MAX_FILE||(total+=bytes.length)>MAX_TOTAL)fail('CAPTURE_RESOURCE_LIMIT','Capture snapshot exceeds byte limits');if(file.sha256&&HASH(bytes)!==file.sha256)fail('CAPTURE_INTEGRITY','A supplied resource hash does not match');if(supplied.has(name)&&HASH(supplied.get(name).bytes)!==HASH(bytes))fail('CAPTURE_PATH_COLLISION','Duplicate capture paths have conflicting bytes');supplied.set(name,{path:name,bytes,mimeType});}
    supplied.set(entry,{path:entry,bytes:Buffer.from(html),mimeType:'text/html; charset=utf-8'});
    const result=new Map(),queue=[entry],queued=new Set(queue),inlineHashes=new Set(),eventHashes=new Set(),warnings=[];
    const assetBase=payload.assetBase?new URL(payload.assetBase,this.origin()+'/'):null;
    const assetRoot=assetBase?new URL('../'.repeat(path.posix.dirname(entry)==='.'?0:path.posix.dirname(entry).split('/').length),assetBase):null;
    const rewrite=(value,from)=>{
      if(!value||/^(?:#|data:)/i.test(value))return value;
      let url;try{url=new URL(value,'https://capture.invalid/'+from);}catch{fail('CAPTURE_RESOURCE_URL','Invalid static resource URL');}
      let target;
      if(url.origin==='https://capture.invalid')target=decodeURIComponent(url.pathname.slice(1));
      else if(assetRoot&&url.href.startsWith(assetRoot.href))target=decodeURIComponent(url.pathname.slice(assetRoot.pathname.length));
      else fail('CAPTURE_REMOTE_RESOURCE','Localize external resources before image capture',{from,url:url.origin+url.pathname});
      target=logical(target);if(target!==entry&&!MIME[extension(target)])fail('CAPTURE_RESOURCE_TYPE','Only the selected HTML and static dependencies may be served',{path:target});if(!supplied.has(target))fail('CAPTURE_RESOURCE_MISSING','A referenced resource is not in the frozen snapshot',{path:target});
      if(!queued.has(target)){queued.add(target);queue.push(target);}const relative=path.posix.relative(path.posix.dirname(from),target)||path.posix.basename(target);return encodePath(relative)+url.search+url.hash;
    };
    const modelResources=(value,from,parent='',responsive=false)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(v=>modelResources(v,from,parent,responsive));return;}for(const [key,item]of Object.entries(value)){if(typeof item==='string'){if(parent==='styles'||responsive)value[key]=cssRewrite(item,v=>rewrite(v,from));else if(parent==='attributes'&&['src','poster','background'].includes(key))value[key]=rewrite(item,from);else if(parent==='attributes'&&['srcset','imagesrcset'].includes(key))value[key]=srcsetRewrite(item,v=>rewrite(v,from));else if(parent==='attributes'&&key==='style')value[key]=cssRewrite(item,v=>rewrite(v,from));}else modelResources(item,from,key,responsive||key==='responsive');}};
    let rewrittenTotal=0;while(queue.length){check(env);const name=queue.shift(),file=supplied.get(name);let bytes=file.bytes;
      if(name===entry){const document=parse(bytes.toString('utf8'));const walk=node=>{
        if(node.childNodes)node.childNodes=node.childNodes.filter(child=>child.tagName!=='base'&&!(child.tagName==='meta'&&child.attrs?.some(a=>a.name==='http-equiv')));
        if(['iframe','object','embed','portal'].includes(node.tagName))fail('CAPTURE_UNSUPPORTED_CONTENT','Nested frames/plugins must be flattened into saved design content before capture');
        for(const attr of node.attrs||[]){const key=attr.name.toLowerCase();if(['src','poster','background'].includes(key)||key==='href'&&['link','use','image','feimage'].includes(node.tagName?.toLowerCase()))attr.value=rewrite(attr.value,name);else if(['srcset','imagesrcset'].includes(key))attr.value=srcsetRewrite(attr.value,v=>rewrite(v,name));else if(key==='style')attr.value=cssRewrite(attr.value,v=>rewrite(v,name));else if(/^on/i.test(key))eventHashes.add(`'sha256-${createHash('sha256').update(attr.value).digest('base64')}'`);}
        if(node.tagName==='style')for(const child of node.childNodes||[])if(child.nodeName==='#text')child.value=cssRewrite(child.value,v=>rewrite(v,name));
        if(node.tagName==='script'&&!node.attrs?.some(a=>a.name==='src'))for(const child of node.childNodes||[])if(child.nodeName==='#text'){
          const type=node.attrs?.find(a=>a.name==='type')?.value||'';
          if(node.attrs?.some(a=>a.name==='id'&&a.value==='dsh-document-model')){const model=JSON.parse(child.value);modelResources(model,name);child.value=JSON.stringify(model).replace(/</g,'\\u003c');}
          else if(!/json|importmap/i.test(type)){child.value=jsRewrite(child.value,v=>rewrite(v,name));inlineHashes.add(`'sha256-${createHash('sha256').update(child.value).digest('base64')}'`);}
        }
        for(const child of node.childNodes||[])walk(child);if(node.content)walk(node.content);
      };walk(document);bytes=Buffer.from(serialize(document));
      }else if(file.mimeType==='text/css')bytes=Buffer.from(cssRewrite(bytes.toString('utf8'),v=>rewrite(v,name)));
      else if(file.mimeType==='text/javascript')bytes=Buffer.from(jsRewrite(bytes.toString('utf8'),v=>rewrite(v,name)));
      if(bytes.length>MAX_FILE||(rewrittenTotal+=bytes.length)>MAX_TOTAL)fail('CAPTURE_RESOURCE_LIMIT','Rewritten capture resources exceed their byte limit');result.set(name,{path:name,bytes:Buffer.from(bytes),mimeType:file.mimeType,sha256:HASH(bytes)});
    }
    return {projectId:project.id,pageId:page.id,pageRevision:page.revision,savedSourceHash,projectRevision:project.revision,entryPath:entry,files:result,inlineHashes:[...inlineHashes],eventHashes:[...eventHashes],viewport:payload.viewport||page.viewport||{width:1440,height:1000},warnings};
  }
  issue(snapshot){if(this.disposed)fail('CAPTURE_DISPOSED','Capture service stopped');for(const [key,value]of this.capabilities)if(value.expiresAt<=this.now())this.capabilities.delete(key);if(this.capabilities.size>=20)fail('CAPTURE_BUSY','Too many active image captures');const token=randomBytes(32).toString('base64url'),prefix=this.origin()+PREFIX+token+'/';const value={...snapshot,token,prefix,expiresAt:this.now()+TTL};this.capabilities.set(token,value);return value;}
  revoke(token){return this.capabilities.delete(token);}
  async handle(req,res){
    if(!String(req.url||'').startsWith(PREFIX))return false;
    const send=(status,body,headers={})=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(req.method==='HEAD'?undefined:body);return true;};
    if(!['GET','HEAD'].includes(req.method))return send(405,'Read only',{Allow:'GET, HEAD'});
    try{const segments=String(req.url).split(/[?#]/,1)[0].slice(PREFIX.length).split('/').map(decodeURIComponent),token=segments.shift();if(!token||segments.some(v=>!v||v==='.'||v==='..'||/[\\/\0]/.test(v)))return send(404,'Unknown capture resource');const cap=this.capabilities.get(token);if(!cap||cap.expiresAt<=this.now()||this.disposed){if(cap)this.revoke(token);return send(410,'Capture expired');}const name=segments.join('/'),file=cap.files.get(name);if(!file)return send(404,'Resource is outside this capture');if(file.bytes.length>MAX_FILE||HASH(file.bytes)!==file.sha256)return send(409,'Capture bytes changed');
      const csp=`sandbox allow-scripts; default-src 'none'; script-src ${cap.prefix} ${cap.inlineHashes.join(' ')} ${cap.eventHashes.length?"'unsafe-hashes' "+cap.eventHashes.join(' '):''}; style-src 'unsafe-inline' ${cap.prefix}; img-src data: blob: ${cap.prefix}; font-src data: ${cap.prefix}; media-src ${cap.prefix}; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
      return send(200,file.bytes,{'Content-Type':file.mimeType,'Content-Length':String(file.bytes.length),'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','Content-Security-Policy':csp});
    }catch{return send(404,'Capture unavailable');}
  }
  async capture(payload,environment={}){
    if(this.disposed)fail('CAPTURE_DISPOSED','Capture service stopped');if(this.controllers.size>=2)fail('CAPTURE_BUSY','Wait for an existing image capture to finish');const policy=environment.policy||payload.policy;if(!policy||!['read-only','workspace-write','danger-full-access'].includes(policy.mode))fail('MISSING_POLICY','The caller execution policy is required');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Object.assign(new Error('Image capture exceeded 60 seconds'),{code:'CAPTURE_TIMEOUT'})),TTL);this.controllers.add(controller);const signal=AbortSignal.any([controller.signal,...(environment.signal||payload.signal?[environment.signal||payload.signal]:[])]);const env={...environment,policy,signal,deadline:Date.now()+TTL};
    const operation=this.run(payload,env);this.pending.add(operation);try{return await operation;}finally{clearTimeout(timer);this.controllers.delete(controller);this.pending.delete(operation);}
  }
  async run(payload,env){
    check(env);const format=payload.format==='jpg'?'jpeg':payload.format||'png';if(!['png','jpeg','webp'].includes(format))fail('CAPTURE_FORMAT_UNSUPPORTED','Choose actual PNG, JPEG or WebP');if(format==='jpeg'&&payload.background===false)fail('CAPTURE_ALPHA_UNSUPPORTED','JPEG cannot represent a transparent background; choose PNG or WebP');
    const quality=payload.quality??90;if(!Number.isInteger(quality)||quality<0||quality>100)fail('INVALID_CAPTURE_QUALITY','Image quality must be an integer from 0 to 100');
    const nodeIds=payload.nodeIds||[];if(!Array.isArray(nodeIds)||nodeIds.length>200||new Set(nodeIds).size!==nodeIds.length||nodeIds.some(v=>typeof v!=='string'||v.length>128))fail('INVALID_CAPTURE_NODES','Choose at most 200 distinct stable nodes');
    if(payload.region&&(!['x','y','width','height'].every(k=>Number.isFinite(payload.region[k]))||payload.region.x<0||payload.region.y<0||payload.region.width<=0||payload.region.height<=0||payload.region.width>10000||payload.region.height>20000))fail('INVALID_CAPTURE_REGION','Region must use bounded positive document CSS pixels');
    const snapshot=await this.prepare(payload,env);check(env);const width=snapshot.viewport.width,height=snapshot.viewport.height;if(!Number.isInteger(width)||!Number.isInteger(height)||width<100||width>10000||height<100||height>20000||width*height>MAX_PIXELS)fail('INVALID_CAPTURE_VIEWPORT','Capture viewport exceeds the bounded 10000×20000 / 80MP canvas');
    if(payload.livePreviewHtml!==undefined&&payload.region){
      const {x,y,width:regionWidth,height:regionHeight}=payload.region;
      if(x+regionWidth>width+0.001||y+regionHeight>height+0.001)fail('INVALID_CAPTURE_REGION','框选区域已超出当前预览，请重新框选。');
    }
    const cap=this.issue(snapshot),captureId='c-'+randomUUID();const browser=this.owner.imports?.browser,scope=this.owner.imports?.browserScope;if(!browser?._serial||!browser?._run||!scope?.run){this.revoke(cap.token);fail('CAPTURE_BROWSER_UNAVAILABLE','The existing managed browser and policy scope are required');}
    const warnings=[...snapshot.warnings];
    let entry;const abort=()=>this.revoke(cap.token);env.signal.addEventListener('abort',abort,{once:true});
    try{return await scope.run(env.policy,()=>browser._serial(async()=>{
      try{check(env);if(browser.disposed)fail('CAPTURE_BROWSER_UNAVAILABLE','The shared browser is disposed');
        const created=await this.acquirePage(browser,env);
        browser.spaceId=created.spaceId;entry={browserId:captureId,projectId:snapshot.projectId,spaceId:created.spaceId,label:created.label,width,height,responses:new Map()};browser.browsers.set(captureId,entry);this.pages.set(captureId,{entry,policy:env.policy});check(env);
        const options={nodeIds,...(payload.livePreviewHtml!==undefined?{liveScroll:{x:Math.max(0,Number(payload.scroll?.x)||0),y:Math.max(0,Number(payload.scroll?.y)||0)}}:{}),background:payload.background!==false,editorMarks:payload.editorMarks===true,scene:payload.scene||payload.sceneId||null};
        const entryURL=cap.prefix+encodePath(cap.entryPath);
        const result=await browser._run(`const task=await taskSpace(${JSON.stringify(entry.spaceId)});const page=task.page(${JSON.stringify(entry.label)}); await page.cdp('Runtime.enable'); await page.cdp('Network.enable'); await page.cdp('Emulation.setDeviceMetricsOverride',{width:${width},height:${height},deviceScaleFactor:1,mobile:false}); await page.cdp('Emulation.setDefaultBackgroundColorOverride',{color:${JSON.stringify(options.background?{r:255,g:255,b:255,a:1}:{r:0,g:0,b:0,a:0})}});await page.goto(${JSON.stringify(entryURL)},{timeout:15000});const presentation=await page.evaluate(${prepareCapturePage.toString()},${JSON.stringify(options)});if(presentation.error)throw Object.assign(new Error(presentation.error.message),{code:presentation.error.code}); const actualURL=await page.url();if(actualURL!==${JSON.stringify(entryURL)})throw Object.assign(new Error('Saved runtime navigated away from its frozen capture page'),{code:'CAPTURE_NAVIGATION_BLOCKED'});const metrics=await page.cdp('Page.getLayoutMetrics');const content=metrics.cssContentSize||metrics.contentSize;const bounds={width:Math.max(${width},Math.ceil(content.width)),height:Math.max(${height},Math.ceil(content.height))};let clip=${JSON.stringify(payload.region||null)};if(${Boolean(options.liveScroll)}){const offset=metrics.cssVisualViewport||metrics.visualViewport;const region=clip||{x:0,y:0,width:${width},height:${height}};clip={...region,x:offset.pageX+region.x,y:offset.pageY+region.y};}if(!clip&&presentation.boxes.length){const boxes=presentation.boxes;clip={x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),width:Math.max(...boxes.map(b=>b.x+b.width))-Math.min(...boxes.map(b=>b.x)),height:Math.max(...boxes.map(b=>b.y+b.height))-Math.min(...boxes.map(b=>b.y))};}if(!clip)clip={x:0,y:0,width:${payload.fullPage===false?width:'bounds.width'},height:${payload.fullPage===false?height:'bounds.height'}};const left=Math.floor(clip.x),top=Math.floor(clip.y);clip={x:left,y:top,width:Math.ceil(clip.x+clip.width)-left,height:Math.ceil(clip.y+clip.height)-top,scale:1};if(clip.x<0||clip.y<0||clip.width<1||clip.height<1||clip.width>10000||clip.height>20000||clip.width*clip.height>${MAX_PIXELS}||clip.x+clip.width>bounds.width+1||clip.y+clip.height>bounds.height+1)throw Object.assign(new Error('Requested image bounds exceed the saved page or capture pixel limit'),{code:'CAPTURE_BOUNDS'});let image;try{image=await page.cdp('Page.captureScreenshot',{format:${JSON.stringify(format)},${format==='png'?'':`quality:${quality},`}fromSurface:true,captureBeyondViewport:true,clip},{timeout:12000});}catch(error){if(/format|parameter|not supported/i.test(error.message))error.code='CAPTURE_FORMAT_UNSUPPORTED';throw error;}if(image.data.length>${Math.ceil(MAX_FILE/3)*4})throw Object.assign(new Error('Image exceeds 32 MiB'),{code:'CAPTURE_IMAGE_LIMIT'});const events=await page.events();const exceptions=events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>({type:'runtime-error',message:String(e.params?.exceptionDetails?.text||'Runtime exception').slice(0,300)})).slice(0,10); ${receipt('{bytesBase64:image.data,width:clip.width,height:clip.height,clip,presentation,exceptions,bounds}')}`,Math.max(1,Math.min(40000,env.deadline-Date.now()-5000)));
        check(env);if(payload.allowIncomplete!==true&&(result.presentation.imageFailures||result.presentation.fontFailures||result.presentation.fontStatus==='loading'||result.exceptions.length))fail('CAPTURE_RENDER_INCOMPLETE','Saved runtime or assets did not finish rendering; fix the reported dependencies before exporting',{imageFailures:result.presentation.imageFailures,fontFailures:result.presentation.fontFailures||0,fontStatus:result.presentation.fontStatus,errors:result.exceptions});const bytes=b64(result.bytesBase64),mimeType=validateImage(bytes,format);warnings.push(...result.exceptions);if(result.presentation.imageFailures)warnings.push({code:'CAPTURE_IMAGE_LOAD_FAILED',count:result.presentation.imageFailures});return {bytesBase64:bytes.toString('base64'),mimeType,width:result.width,height:result.height,format,metadata:{captureId,projectId:snapshot.projectId,pageId:snapshot.pageId,projectRevision:snapshot.projectRevision,pageRevision:snapshot.pageRevision,savedSourceHash:snapshot.savedSourceHash,sourceVersion:{pageRevision:snapshot.pageRevision,sourceHash:snapshot.savedSourceHash},boundsVersion:{pageRevision:snapshot.pageRevision,sourceHash:snapshot.savedSourceHash,viewport:{width,height},scene:result.presentation.runtime.scene||null},sourceHtmlHash:cap.files.get(cap.entryPath).sha256,resourceCount:cap.files.size-1,scope:payload.region?'region':nodeIds.length?'selection':payload.fullPage===false?'viewport':'page',nodeIds,region:result.clip,background:options.background,editorMarks:options.editorMarks,editorMarkCount:result.presentation.marked,viewport:result.presentation.viewport||{width,height},requestedViewport:{width,height},documentBounds:result.bounds,runtime:result.presentation.runtime,fontStatus:result.presentation.fontStatus,fontFailures:result.presentation.fontFailures||0,imageFailures:result.presentation.imageFailures,capabilityRevoked:true},warnings};
      }catch(error){if(controlStop(error)&&entry)this.pages.get(entry.browserId).controlStopped=true;throw error;}finally{
        if(entry&&!this.pages.get(entry.browserId)?.controlStopped){
          const closed=await this.closeOwned(entry,env.policy,browser);
          if(!closed)warnings.push({code:'CAPTURE_PAGE_CLOSE_PENDING',message:'The image was captured. The browser has not yet confirmed capture tab cleanup.'});
        }
      }
    }));}catch(error){if(env.signal.aborted)throw env.signal.reason;throw error;}finally{env.signal.removeEventListener('abort',abort);this.revoke(cap.token);}
  }
  async acquirePage(browser,env){
    const pending=[...this.pages.values()].find(record=>record.closePending&&!record.controlStopped&&record.entry.spaceId===browser.spaceId);
    const timeout=Math.max(1,Math.min(10000,env.deadline-Date.now()-5000));
    const initial=browser.spaceId==null&&!browser.browsers.size;
    // A close can finish after the CLI times out. Only reuse that exact owned label if it is still live.
    const choose=pending
      ? `(await task.pages()).find(page=>page.label===${JSON.stringify(pending.entry.label)}) || await task.newPage()`
      : initial ? "task.page('p1')" : 'await task.newPage()';
    const created=await browser._run(`const task=await taskSpace(${JSON.stringify(browser.spaceId??browser.spaceName)});const page=${choose};${receipt('{spaceId:task.spaceId,label:page.label}')}`,timeout);
    if(pending)this.pages.delete(pending.entry.browserId);
    return created;
  }
  async closeOwned(entry,policy,browser=this.owner.imports.browser){
    const record=this.pages.get(entry.browserId);
    if(!record)return true;
    try{
      const {closed}=await this.owner.imports.browserScope.run(policy,()=>browser._run(`
        const task=await taskSpace(${JSON.stringify(entry.spaceId)});
        const label=${JSON.stringify(entry.label)};
        const page=${record.closePending?'(await task.pages()).find(page=>page.label===label)':'task.page(label)'};
        let closed=true;
        if(page)try{await page.close();}catch(error){
          if((error.code && error.code!=='BROWSER_OPERATION_FAILED') || !/^page .+ did not close within [0-9]+ms$/i.test(error.message||''))throw error;
          closed=!(await task.pages()).some(live=>live.label===label);
        }
        ${receipt('{closed}')}`,5000));
      browser.browsers.delete(entry.browserId);
      if(closed)this.pages.delete(entry.browserId);
      else record.closePending=true;
      return closed;
    }catch(error){
      if(controlStop(error))record.controlStopped=true;
      throw error;
    }
  }
  async dispose(){this.disposed=true;for(const controller of this.controllers)controller.abort(Object.assign(new Error('Capture service stopped'),{code:'CAPTURE_DISPOSED'}));this.capabilities.clear();await Promise.allSettled([...this.pending]);await Promise.allSettled([...this.pages.values()].filter(record=>!record.controlStopped).map(({entry,policy})=>this.closeOwned(entry,policy)));}
}
