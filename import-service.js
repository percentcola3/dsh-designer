import {randomBytes,randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fail,text} from './store.js';
import {BrowserEngine,wrapCliScript,parseCliOutput} from './browser-engine.js';
import {DesignImportEngine,DESIGN_PROVIDERS,normalizeDesignConfig} from './design-import.js';
import {buildAssetBundle,collectRemoteResources,writeAssetFiles} from './asset-archive.js';

const ACTIONS=['help','browser.open','browser.action','browser.capture','browser.close','source.import','import.get','import.context','connection.status','connection.test'];
const connectionKey=provider=>'dsh-designer:connection:'+provider;
const providerId=value=>{if(!Object.hasOwn(DESIGN_PROVIDERS,value))fail('INVALID_PROVIDER','Choose figma or mastergo');return value;};
const safeTitle=value=>String(value||'Imported design').trim().slice(0,200)||'Imported design';
/** Project import operations shared by authenticated UI actions and model tools. */
export class DesignerImports {
  constructor(owner,{browser,design}={}){
    this.owner=owner;this.browserScope=new AsyncLocalStorage();
    this.browser=browser||new BrowserEngine({runner:async(source,{timeoutMs,maxOutputBytes})=>{
      const shell=owner.ctx.shell;if(!shell)fail('BROWSER_UNAVAILABLE','The managed shell service is not available');
      const handle=await shell.execute(shell.resolve({command:'ego-browser nodejs',stdin:wrapCliScript(source),workdir:owner.store.workspaceRoot,timeoutMs,onExpiry:'kill',stdoutMaxBytes:maxOutputBytes,sandboxPolicy:this.browserScope.getStore()||owner.policy()}));
      const result=await handle.result();
      const complete=async stream=>{
        if(!stream.truncated)return stream.text;
        if(!stream.spillPath)fail('BROWSER_OUTPUT_LIMIT','Browser output was truncated without a complete output file');
        const target=await owner.ctx.fs.resolve(stream.spillPath);const info=await owner.ctx.fs.stat(target);
        if(!info||info.type!=='file'||info.size>maxOutputBytes)fail('BROWSER_OUTPUT_LIMIT','Browser output exceeds the capture limit');
        return owner.ctx.fs.readText(target);
      };
      // ego-browser console receipts use stderr; restore either spilled stream before decoding.
      const [stdout,stderr]=await Promise.all([complete(result.stdout),complete(result.stderr)]);
      return parseCliOutput(stdout+'\n'+stderr,result.exitCode);
    }});
    this.design=design||new DesignImportEngine();this.capabilities=new Map();this.pending=new Set();
  }
  base(projectId){
    let token=this.capabilities.get(projectId);if(!token){token=randomBytes(32).toString('hex');this.capabilities.set(projectId,token);}
    return `/api/designer/resource/${token}/${projectId}/html/`;
  }
  async connectionConfig(provider){
    providerId(provider);const stored=await this.owner.ctx.credentials.readRecord(connectionKey(provider));
    return normalizeDesignConfig({provider,...(stored?.kind==='grant'?stored.payload:{})});
  }
  async connections(){
    const result=[];for(const provider of Object.keys(DESIGN_PROVIDERS)){
      const config=await this.connectionConfig(provider);result.push({provider,endpoint:config.endpoint,transport:config.transport,configured:!!config.token,docs:DESIGN_PROVIDERS[provider].docs});
    }return {connections:result};
  }
  async configure(input){
    const provider=providerId(input.provider);const previous=await this.connectionConfig(provider);
    const config=normalizeDesignConfig({provider,endpoint:input.endpoint||previous.endpoint,transport:input.transport||previous.transport,token:input.token===undefined||input.token===''?(input.endpoint&&input.endpoint!==previous.endpoint?'':previous.token):input.token});
    await this.owner.ctx.credentials.modifyRecord(connectionKey(provider),async()=>({kind:'grant',payload:{endpoint:config.endpoint,transport:config.transport,token:config.token}}));
    return this.connections();
  }
  async activeProject(projectId,signal){
    const {project}=await this.owner.store.projectGet(projectId,signal);
    if(project.deletedAt||project.archived)fail('PROJECT_UNAVAILABLE','Restore the project before importing or browsing');return project;
  }
  modelFootprint(){
    const meter=this.owner.ctx.get?.('tokenMeter');if(!meter)return {};
    const schema=t=>({name:t.name,description:t.description,parameters:t.parameters});
    const base=[schema(this.owner.manageTool())],after=[...base,schema(this.tool())];
    const estimate=tools=>meter.estimateMessage({id:'designer-tool-schema',role:'system',source:{kind:'system-prompt'},content:[{type:'text',text:JSON.stringify(tools)}]});
    const beforeTokens=estimate(base),afterTokens=estimate(after);return {firstTurnToolSchemaEstimate:{beforeTokens,afterTokens,addedTokens:afterTokens-beforeTokens,method:'DSH fixed heuristic over serialized tool schemas; excludes conversation context'}};
  }
  async execute(input,{policy,signal,user=false}={}){
    const {store}=this.owner;
    switch(input.action){
      case 'help':return {...this.modelFootprint(),actions:{'browser.open':{projectId:'required',url:'http(s) page',spaceId:'optional exact existing agent-owned TaskSpace ID; resume only, no takeover or fallback; retained across plugin disposal',width:'240–3840, default 1280',height:'240–3840, default 800'},'browser.action':{projectId:'required',browserId:'from browser.open',type:'navigate|resize|click|type|key|scroll|back|forward',url:'navigate',width:'resize',height:'resize',x:'click',y:'click',text:'type',key:'key',deltaX:'scroll',deltaY:'scroll'},'browser.capture':{projectId:'required',browserId:'required',name:'optional artboard name',allowPartial:'default false; explicitly accept missing resources'},'browser.close':{projectId:'required',browserId:'required'},'source.import':{projectId:'required',provider:'figma|mastergo',url:'design URL or desktop selection',nodeId:'optional frame/layer ID',name:'optional design name',generate:'default true, restore HTML with project AI',allowPartial:'default false'},'import.get':{projectId:'required',importId:'required'},'import.context':{projectId:'required',importId:'required',offset:'default 0',limit:'1–30000, default 20000'},'connection.status':{},'connection.test':{provider:'figma|mastergo'}},directory:'html/h-id.html; assets/i-id/{images,fonts,styles,media}; imports/i-id/{source,manifest,context}.json',credentials:'Provider connection settings and credentials are configured by the user in the project import dialog.'};
      case 'connection.status':return this.connections();
      case 'connection.save':if(!user)fail('USER_ONLY','Connection authority is configured by the user');return this.configure(input);
      case 'connection.clear':if(!user)fail('USER_ONLY','Connection authority is configured by the user');await this.owner.ctx.credentials.deleteRecord(connectionKey(providerId(input.provider)));return this.connections();
      case 'connection.test':return this.design.probe(await this.connectionConfig(input.provider),{signal});
      case 'import.get':{const data=await store.importGet(input.projectId,input.importId,signal);return user?{...data,assetBase:this.base(input.projectId)}:data;}
      case 'import.context':return store.importContext(input.projectId,input.importId,input,signal);
      case 'browser.open':await this.activeProject(input.projectId,signal);return this.browserScope.run(policy,()=>this.browser.open(input));
      case 'browser.action':await this.activeProject(input.projectId,signal);return this.browserScope.run(policy,()=>this.browser.action(input));
      case 'browser.close':return this.browserScope.run(policy,()=>this.browser.close(input));
      case 'browser.capture':{const value=await this.capture(input,signal,policy);return user?{...value,assetBase:this.base(input.projectId)}:value;}
      case 'source.import':{const value=await this.importDesign(input,signal,policy);return user?{...value,assetBase:this.base(input.projectId)}:value;}
      default:fail('UNKNOWN_ACTION','Unknown import action');
    }
  }
  async publish(input,captured,signal,policy){
    const id='i-'+randomUUID();const source={kind:captured.kind||'website',url:captured.sourceURL||captured.url,title:safeTitle(input.name||captured.title||captured.sourceURL||captured.url),width:captured.width||input.width||1440,height:Math.min(20000,captured.documentHeight||captured.height||input.height||1000)};
    const downloaded=await collectRemoteResources(captured.resources||captured.assets||[],{signal,sourceUrl:captured.assetOrigin||source.url});
    let preview=captured.preview;
    if(!preview&&captured.screenshot?.startsWith('data:image/png;base64,'))preview={bytesBase64:captured.screenshot.split(',')[1],mimeType:'image/png'};
    if(preview?.url){
      const p=await collectRemoteResources([{url:preview.url,mimeType:preview.mimeType||'image/png'}],{signal,sourceUrl:captured.assetOrigin||source.url,maxFiles:1,maxBytes:8*1024*1024});
      preview=p.resources[0];if(!preview)preview=undefined;
      downloaded.warnings.push(...p.warnings);
    }
    const bundle=buildAssetBundle({importId:id,html:captured.html,resources:downloaded.resources,source,context:captured.context,preview,warnings:[...(captured.warnings||[]),...downloaded.warnings],failures:[...(captured.failures||[]),...downloaded.failures]});
    bundle.record.manifestHash=bundle.files.find(f=>f.path===bundle.record.manifestPath)?.sha256;
    if(bundle.record.contextPath)bundle.record.contextHash=bundle.files.find(f=>f.path===bundle.record.contextPath)?.sha256;
    if(bundle.record.integrity!=='complete'&&input.allowPartial!==true)fail('IMPORT_INCOMPLETE','Some resources could not be saved. Retry, or explicitly allow a partial import.',{failures:bundle.manifest.failures.slice(0,20),failedCount:bundle.record.failedCount,warnings:bundle.manifest.warnings.slice(0,12)});
    await writeAssetFiles({store:this.owner.store,fs:this.owner.ctx.fs,shell:this.owner.ctx.shell,projectId:input.projectId,files:bundle.files,policy,signal});
    // Admit against the latest revision after the potentially long capture, preserving other edits.
    const current=await this.activeProject(input.projectId,signal);
    const saved=await this.owner.store.importCommit({projectId:input.projectId,expectedRevision:current.revision,record:bundle.record,html:captured.html?bundle.html:undefined,name:source.title},signal,policy);
    return {...saved,manifest:bundle.manifest};
  }
  async exclusive(projectId,operation){if(this.pending.has(projectId))fail('IMPORT_BUSY','An import is already running for this project');this.pending.add(projectId);try{return await operation();}finally{this.pending.delete(projectId);}}
  async capture(input,signal,policy){
    await this.activeProject(input.projectId,signal);if(policy?.mode==='read-only')fail('FS_SANDBOX_DENIED','Import needs write access');
    return this.exclusive(input.projectId,async()=>this.publish(input,await this.browserScope.run(policy,()=>this.browser.capture(input)),signal,policy));
  }
  async importDesign(input,signal,policy){
    await this.activeProject(input.projectId,signal);if(policy?.mode==='read-only')fail('FS_SANDBOX_DENIED','Import needs write access');
    return this.exclusive(input.projectId,async()=>{
      const config=await this.connectionConfig(input.provider);
      const data=await this.design.read({...config,url:input.url||undefined,nodeId:input.nodeId||undefined,projectDir:path.join(this.owner.store.root,'projects',input.projectId),includeAssets:true,includePreview:true},{signal});
      data.assetOrigin=config.endpoint;
      if(data.contextTruncated)data.failures=[...(data.failures||[]),{url:data.sourceURL,code:'CONTEXT_TRUNCATED',message:'Design context exceeded the read limit. Select a smaller frame for a complete import.'}];
      const saved=await this.publish(input,data,signal,policy);
      if(input.generate===false)return saved;
      try{
        const ai=await this.owner.runAI({projectId:input.projectId,importId:saved.record.id,prompt:`将刚导入的 ${input.provider} 设计稿「${saved.record.title}」还原成完整 HTML。忠实还原图层结构、布局、尺寸、文字、色彩和字体，不重新设计。先用 designer_project 的 import.context 读取 source import ${saved.record.id} 的上下文，再用 import.get 查看本地资源映射。使用 ../assets/ 下已经下载的图片、字体和样式，不引用原服务的临时 URL。以 designer_commit_html 保存新设计稿。`,mode:'generate'},signal,policy);
        return {...saved,ai};
      }catch(error){return {...saved,ai:{accepted:false,error:error.message}};}
    });
  }
  tool(){return {name:'designer_import',description:'Browse and replicate a website into a Designer project, or import Figma/MasterGo designs through an already configured official MCP connection. Assets and fonts are saved locally with a manifest. Use help for action fields; read imported context in bounded pages. Credentials are configured in the UI.',parameters:{type:'object',properties:{action:{type:'string',enum:ACTIONS},projectId:{type:'string',description:'Project identifier for browser and imported-source actions.'},options:{type:'object',additionalProperties:true,description:'Action fields returned by help.'}},required:['action'],additionalProperties:false},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:async(args,exec)=>{
      if(!exec.agent)fail('AGENT_REQUIRED','Import needs a session permission context');
      if(this.owner.bindings.has(exec.agent.id))fail('ACTION_NOT_ALLOWED','Project design agents read imported sources through designer_project');
      const value=await this.execute({...args.options,action:args.action,projectId:args.projectId},{policy:this.owner.policy(exec.agent),signal:exec.signal});
      if(value.screenshot){const {screenshot,...metadata}=value;return {...metadata,screenshotAvailableInProjectUI:true};}
      if(['browser.capture','source.import'].includes(args.action))return {record:value.record,...(value.artboard?{artboard:value.artboard}:{}),projectRevision:value.projectRevision,...(value.ai?{ai:value.ai}:{}),manifest:{integrity:value.manifest.integrity,resourceCount:value.manifest.resources.length,failedCount:value.manifest.failures.length,warnings:value.manifest.warnings.slice(0,12),failures:value.manifest.failures.slice(0,12)}};
      if(args.action==='connection.test'&&value.tools)return {...value,tools:value.tools.map(t=>({name:t.name}))};
      return value;
    }};}
  async resource(req,res){
    const send=(status,message)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(message);};
    try{
      if(!['GET','HEAD'].includes(req.method))return send(405,'Read only');
      const raw=new URL(req.url,'http://localhost').pathname.split('/').slice(4).map(decodeURIComponent);
      const [token,projectId,...parts]=raw;const relative=parts.join('/');
      if(!token||this.capabilities.get(projectId)!==token)return send(403,'Unknown asset capability');
      if(parts.some(p=>!p||p==='.'||p==='..'||p.includes('/')||p.includes('\\')))return send(404,'Unknown asset');
      let mimeType,sha256;
      if(/^assets\/i-[a-zA-Z0-9-]+\/(?:images|fonts|styles|media)\/[a-zA-Z0-9._-]+$/.test(relative)||/^imports\/i-[a-zA-Z0-9-]+\/preview\.(?:png|webp|jpg|gif)$/.test(relative)){
        const {manifest}=await this.owner.store.importGet(projectId,parts[1]);const item=manifest.resources.find(r=>r.path===relative)||manifest.preview?.path===relative&&manifest.preview;
        mimeType=item?.mimeType;sha256=item?.sha256;
      }else{
        const {project}=await this.owner.store.projectGet(projectId);
        const item=project.workbench?.files?.find(file=>file.path===relative&&!file.removedAt&&file.sha256);
        // This capability serves render dependencies, never project/context/HTML documents.
        if(item&&/^(?:image\/|font\/|audio\/|video\/|text\/css$|(?:text|application)\/javascript$|application\/x-font-)/.test(item.mimeType||'')&&!/^(?:project\.json|\.workbench\/|snapshots\/|docs\/|rules\/)/.test(relative)){mimeType=item.mimeType;sha256=item.sha256;}
      }
      if(!mimeType||!sha256)return send(404,'Asset not listed');
      const target=await this.owner.store.target(`projects/${projectId}/${relative}`);
      const projectRoot=await this.owner.store.target(`projects/${projectId}`);
      if(!this.owner.ctx.fs.contains(projectRoot,target))return send(403,'Asset leaves its project');
      const bytes=Buffer.from(await this.owner.ctx.fs.readBytes(target,undefined,32*1024*1024));
      if(sha256&&createHash('sha256').update(bytes).digest('hex')!==sha256)return send(409,'Asset changed outside Designer');
      res.writeHead(200,{'Content-Type':mimeType,'Content-Length':bytes.length,'Cache-Control':'private, max-age=3600','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox; style-src 'unsafe-inline'; img-src data:"});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){send(error.code==='NOT_FOUND'?404:400,'Asset unavailable');}
  }
  async dispose(){this.capabilities.clear();await this.browser.dispose();}
}
