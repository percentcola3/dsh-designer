import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail} from './store.js';
import * as model from './document-model.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX_SOURCE=64*1024*1024;
const subtree=(nodes,id)=>{const found=new Set(),visit=id=>{if(found.has(id)||!nodes[id])return;found.add(id);for(const child of nodes[id].childIds||[])visit(child);};visit(id);return found;};

/** Canonical document transactions reuse Workspace file versions, conflicts and undo. */
export class EditorService {
  constructor(owner){this.owner=owner;this.cache=new Map();}
  help(){return {
    'edit.read':{projectId:'required',pageId:'required',sourceLimit:'Full bounded UTF-8 read up to 64 MiB; canonical canvas documents support the DocumentModel 8 MB limit. Larger source stays available through paged file.read.'},
    'edit.operations':{type:'optional operation type; returns its executable schema and examples'},
    'edit.apply':{projectId:'required',pageId:'required',expectedRevision:'required',expectedArtboardRevision:'optional',operations:'AST transactions; discover with edit.operations'},
    'edit.validate':{projectId:'required',pageId:'required'},
    'edit.impact':{projectId:'required',pageId:'required',nodeIds:'selection',definitionScope:'instance|definition'},
    'edit.undo':{projectId:'required',pageId:'required',expectedRevision:'required'},
    'edit.redo':{projectId:'required',pageId:'required',expectedRevision:'required'}
  };}
  async prepare(html,{project,page,previousHtml,htmlPath,env={}}){
    if(typeof html!=='string'||Buffer.byteLength(html)>MAX_SOURCE)fail('TOO_LARGE','Editable page source must be UTF-8 HTML at most 64 MiB');
    let identityRebuilt=false;if(previousHtml!==undefined){try{model.normalizeDocument(previousHtml);}catch(error){if(!(error instanceof model.DocumentModelError)||env.user!==true||env.agent)throw error;previousHtml=undefined;identityRebuilt=true;}}
    const initial=model.normalizeDocument(html,{previousHtml});
    const exists=new Map(),root=await this.owner.store.target(`projects/${project.id}`,env.signal);
    for(const resource of initial.resources||[]){const url=resource.url;if(!url||/^(?:#|data:|https?:|\/\/)/i.test(url))continue;
      if(/\/api\/designer\/(?:resource|file-resource|source-resource|capture|share)\//.test(url))fail('TEMPORARY_RESOURCE','Saved HTML must use portable resource paths');
      try{const raw=decodeURIComponent(url.split(/[?#]/,1)[0]),relative=raw.startsWith('/')?raw.slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(htmlPath||page.htmlPath),raw));if(relative.startsWith('../')||relative.includes('\\')||relative==='..'){exists.set(url,false);continue;}const target=await this.owner.store.target(`projects/${project.id}/${relative}`,env.signal);exists.set(url,this.owner.ctx.fs.contains(root,target)&&(await this.owner.ctx.fs.stat(target,env.signal))?.type==='file');}catch(error){if(env.signal?.aborted||/SANDBOX|PERMISSION/.test(error.code||''))throw error;exists.set(url,false);}
    }
    const document=model.normalizeDocument(initial.html,{previousHtml,resourceExists:url=>exists.get(url)});
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent);
    if(env.agent&&previousHtml)this.owner.aiWorkbench.assertCommitScope(model.normalizeDocument(previousHtml).html,document.html,task);
    if(identityRebuilt){document.identityRebuilt=true;document.diagnostics.push({code:'IDENTITY_REBUILT',severity:'warning',message:'Explicit user source repair rebuilt the invalid previous document. Old references must be revalidated; no similar-node matching was used.'});}
    return document;
  }
  async read(projectId,pageId,env={},options={}){
    const workspace=await this.owner.workbench.execute({action:'workspace.open',projectId},env),project=workspace.project,page=project.artboards.find(p=>p.id===pageId&&!p.deletedAt);
    if(!page)fail('PAGE_NOT_FOUND','The exact page no longer exists');
    const file=project.workbench.files.find(f=>f.pageId===pageId&&!f.removedAt&&f.path===page.htmlPath)||project.workbench.files.find(f=>f.path===page.htmlPath&&!f.removedAt);
    if(!file)fail('PAGE_FILE_NOT_FOUND','The page file is not registered');
    const record=await this.owner.workbench.readAt(project,page.htmlPath,env,MAX_SOURCE),html=new TextDecoder('utf-8',{fatal:true}).decode(record.bytes);
    const hash=sha(html);if(page.contentHash&&hash!==page.contentHash)fail('VERSION_CONFLICT','Page changed outside the workbench. Preserve the external content before saving.');
    const key=projectId+'/'+pageId,prior=this.cache.get(key);let document;
    try{document=['react','vue'].includes(page.artifact?.kind)?{html,nodes:{},tree:[],definitions:{},resources:[],interactions:[],scenes:{items:structuredClone(page.artifact.scenes||[]),defaultId:page.artifact.scenes?.[0]?.id||null},artifact:structuredClone(page.artifact),valid:true,diagnostics:[]}:prior?.hash===hash?prior.document:model.normalizeDocument(html,{previousHtml:prior?.document.html});this.cache.set(key,{hash,document});}catch(error){if(!(error instanceof model.DocumentModelError)||options.allowInvalid!==true||env.user!==true||env.agent)throw error;document={html,nodes:{},tree:[],invalid:true,diagnostics:[{code:error.code,message:error.message,severity:'error'}]};}
    const assetBase=typeof this.owner.pageAssetBase==='function'?await this.owner.pageAssetBase(projectId,page.htmlPath,env):undefined;
    return {project,page,file,version:record.version,sourceHash:hash,document:{...document,...(env.user===true&&!env.agent?{savedHTML:html}:{}),htmlPath:page.htmlPath,version:record.version,artboardRevision:page.revision,...(assetBase?{assetBase}:{})},projectRevision:project.revision};
  }
  impact(basis,input){
    const nodes=basis.document.nodes,selected=input.nodeIds||[],affected=new Set(),definitions=new Set();
    for(const id of selected){if(!nodes[id])fail('NODE_NOT_FOUND','Impact selection no longer exists',{nodeId:id});affected.add(id);if(input.definitionScope!=='definition')continue;
      let root=nodes[id];while(root&&!root.definitionId&&!root.instanceId)root=nodes[root.parentId];if(!root)continue;
      const definitionId=root.definitionId||root.instanceId,definition=basis.document.definitions[definitionId];if(!definition)continue;definitions.add(definitionId);
      const slot=id===root.id?null:nodes[id].slot;for(const targetId of [definition.rootId,...definition.instanceIds]){if(slot===null)for(const member of subtree(nodes,targetId))affected.add(member);else if(slot)for(const member of subtree(nodes,targetId))if(nodes[member].slot===slot)affected.add(member);}
    }
    return {pageId:basis.page.id,projectRevision:basis.project.revision,nodeIds:selected,definitionScope:input.definitionScope||'instance',affectedNodeIds:[...affected],affectedCount:affected.size,definitions:[...definitions],requiresExplicitScope:affected.size>selected.length};
  }
  async write(input,env={},basis){
    if(input.action==='file.write'&&(typeof input.expectedVersion!=='string'||!input.expectedVersion))fail('CAS_REQUIRED','Registered file writes require expectedVersion from the last file read');
    basis ||= await this.read(input.projectId,input.pageId||input.artboardId,env,{allowInvalid:env.user===true&&!env.agent});
    if(['react','vue'].includes(basis.page.artifact?.kind))fail('FRAMEWORK_SOURCE_REQUIRED','请修改对应源码；框架画布的 HTML 是生成产物，不能直接覆盖。');
    if(input.expectedRevision!==basis.project.revision||input.expectedArtboardRevision!==undefined&&input.expectedArtboardRevision!==basis.page.revision)fail('VERSION_CONFLICT','Project/page changed before saving');
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent),next=await this.prepare(input.html??input.content,{project:basis.project,page:basis.page,previousHtml:basis.document.html,htmlPath:basis.page.htmlPath,env});
    const saved=await this.owner.workbench.execute({action:'file.write',projectId:input.projectId,fileId:basis.file.id,content:next.html,expectedRevision:input.expectedRevision,expectedVersion:input.expectedVersion??basis.version,summary:input.summary||'Save design page'}, {...env,target:task?.scope==='selection'?{...task,scope:'page'}:env.target||task});
    this.cache.delete(input.projectId+'/'+basis.page.id);return {...saved,...await this.read(input.projectId,basis.page.id,env),saved:true,previewStatus:'pending',interactionVerification:'unverified',diagnostics:next.diagnostics,identityRebuilt:next.identityRebuilt===true};
  }
  async execute(input,env={}){
    const action=input.action.replace(/^workbench\./,'');
    if(action==='edit.help')return {actions:this.help()};
    if(action==='edit.operations')return model.documentOperationsHelp(input.type||input.operationType);
    const basis=await this.read(input.projectId,input.pageId||input.artboardId,env);
    if(action==='edit.read')return basis;
    if(action==='edit.validate'){let validated;try{const document=await this.prepare(basis.document.html,{project:basis.project,page:basis.page,previousHtml:basis.document.html,htmlPath:basis.page.htmlPath,env});validated={valid:true,diagnostics:document.diagnostics,resources:document.resources};}catch(error){validated={valid:false,diagnostics:error.details?.diagnostics||[{code:error.code,message:error.message,severity:'error'}]};}return {...validated,pageId:basis.page.id,contentHash:sha(basis.document.html),savedContentHash:basis.sourceHash,projectRevision:basis.project.revision,saved:true,previewStatus:'pending'};}
    if(action==='edit.impact')return this.impact(basis,input);
    if(input.expectedRevision!==basis.project.revision||input.expectedArtboardRevision!==undefined&&input.expectedArtboardRevision!==basis.page.revision)fail('VERSION_CONFLICT','Project/page changed before editing');
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent);if(env.agent)this.owner.aiWorkbench.assertAction({...input,action},{...env,task});
    let operations=input.operations;if(action==='edit.undo'||action==='edit.redo')operations=[{type:action.slice(5)}];
    if(!Array.isArray(operations)||!operations.length||operations.length>100)fail('INVALID_OPERATIONS','Supply 1–100 document operations');
    if(['react','vue'].includes(basis.page.artifact?.kind)&&!operations.every(op=>['page.position','page.viewport'].includes(op.type)))fail('FRAMEWORK_SOURCE_REQUIRED','请修改对应源码，不能把运行后的元素保存成 HTML。');
    if(operations.length===1&&['undo','redo'].includes(operations[0].type)){if(!env.user&&task?.scope==='selection')fail('WRITE_SCOPE','Selection scope cannot restore a whole page');const result=await this.owner.workbench.execute({action:'file.'+operations[0].type,projectId:input.projectId,fileId:basis.file.id,expectedRevision:input.expectedRevision,expectedVersion:basis.version},{...env,target:task});this.cache.delete(input.projectId+'/'+basis.page.id);return {...result,...await this.read(input.projectId,basis.page.id,env)};}
    if(operations.some(op=>op.type.startsWith('page.'))){if(operations.length!==1)fail('INVALID_OPERATIONS','Page layout changes are separate transactions');const op=operations[0];if(!['page.position','page.viewport'].includes(op.type))fail('INVALID_OPERATIONS','Unknown page geometry operation');const result=await this.owner.workbench.execute({action:'page.update',projectId:input.projectId,pageId:basis.page.id,expectedRevision:input.expectedRevision,...(op.type==='page.position'?{position:op.position}:{viewport:op.viewport})},{...env,target:task});return {...result,...await this.read(input.projectId,basis.page.id,env)};}
    const next=model.applyDocumentOperations(basis.document.html,operations,{scopeMode:env.user?'page':task?.scope==='read'?'read':task?.scope==='selection'?'selection':'page',scopeNodeIds:task?.nodeIds||[],allowUnlock:env.user&&input.allowUnlock===true,definitionScope:input.definitionScope||'instance'});
    return {...await this.write({...input,html:next.html},env,basis),changes:next.changes};
  }
}
