import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fail} from './store.js';
import * as model from './document-model.js';
import {scriptTargetDiagnostics} from './script-references.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX_SOURCE=64*1024*1024;
const subtree=(nodes,id)=>{const found=new Set(),visit=id=>{if(found.has(id)||!nodes[id])return;found.add(id);for(const child of nodes[id].childIds||[])visit(child);};visit(id);return found;};

/** Canonical document transactions reuse Workspace file versions, conflicts and undo. */
export class EditorService {
  constructor(owner){this.owner=owner;this.cache=new Map();}
  help(){return {
    'edit.read':{projectId:'required',pageId:'required',view:'summary(default)|nodes|source for native model reads',query:'optional literal search, 1–200 characters, over stable ID, HTML id, label, tag or leaf text; with view=source it locates a case-sensitive HTML excerpt',nodeIds:'optional IDs for detailed nodes',nodeOffset:'optional node page offset',nodeLimit:'optional 0–100 nodes; summary defaults to 12 and query/nodes to 40',offset:'source character offset when view=source',limit:'source characters, at most 12000',sourceLimit:'Full bounded UTF-8 read up to 64 MiB; canonical canvas documents support the DocumentModel 8 MB limit. Larger source stays available through paged file.read.'},
    'edit.operations':{type:'optional operation type; returns its executable schema and examples'},
    'edit.apply':{projectId:'required',pageId:'required',expectedRevision:'required',expectedArtboardRevision:'optional',operations:'AST transactions; discover with edit.operations'},
    'edit.validate':{projectId:'required',pageId:'required',requiredSceneIds:'optional up to 2000 expected scene IDs; returns missing IDs, saved scene inventory and control transitions'},
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
    document.diagnostics.push(...scriptTargetDiagnostics(document.html));
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent);
    if(env.agent&&previousHtml&&!env.schemaDerived)this.owner.aiWorkbench.assertCommitScope(model.normalizeDocument(previousHtml).html,document.html,task);
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
    if(page.artifact?.kind==='schema')document={...document,schemaSource:true};
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
    if(basis.page.artifact?.kind==='schema')fail('SCHEMA_SOURCE_REQUIRED','Edit the canonical page.design.json through schema.read/apply',{sourcePath:basis.page.artifact.entry});
    if(['react','vue'].includes(basis.page.artifact?.kind))fail('FRAMEWORK_SOURCE_REQUIRED','请修改对应源码；框架画布的 HTML 是生成产物，不能直接覆盖。');
    if(input.expectedRevision!==basis.project.revision||input.expectedArtboardRevision!==undefined&&input.expectedArtboardRevision!==basis.page.revision)fail('VERSION_CONFLICT','Project/page changed before saving');
    if(input.expectedVersion!==undefined&&input.expectedVersion!==basis.version)fail('VERSION_CONFLICT','Page file changed before saving');
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent);
    let systemUsage;
    if(env.agent&&task&&this.owner.aiWorkbench?.prepareGeneratedHTML){
      const prepared=await this.owner.aiWorkbench.prepareGeneratedHTML({...input,html:input.html??input.content},basis.project,basis.page.designId,basis.page,{...env,task});
      input=prepared.input;systemUsage=prepared.systemUsage;
    }
    const next=await this.prepare(input.html??input.content,{project:basis.project,page:basis.page,previousHtml:basis.document.html,htmlPath:basis.page.htmlPath,env});
    const saved=await this.owner.workbench.execute({action:'file.write',projectId:input.projectId,fileId:basis.file.id,content:next.html,expectedRevision:input.expectedRevision,expectedVersion:input.expectedVersion??basis.version,summary:input.summary||'Save design page'}, {...env,target:task?.scope==='selection'?{...task,scope:'page'}:env.target||task});
    this.cache.delete(input.projectId+'/'+basis.page.id);return {...saved,...await this.read(input.projectId,basis.page.id,env),saved:true,...(systemUsage?{systemUsage}:{}),previewStatus:'pending',interactionVerification:'unverified',diagnostics:next.diagnostics,identityRebuilt:next.identityRebuilt===true};
  }
  async execute(input,env={}){
    const requested=input.action.replace(/^workbench\./,''),action=requested==='edit.inspect'?'edit.read':requested;
    if(!Object.hasOwn(this.help(),action)&&action!=='edit.help')fail('UNKNOWN_ACTION','Unknown editor action',{action:requested});
    if(action==='edit.read'&&input.operations!==undefined)fail('INVALID_INPUT','edit.read and edit.inspect are read-only. Save operations with edit.apply.');
    if(action==='edit.help')return {actions:this.help()};
    if(action==='edit.operations')return model.documentOperationsHelp(input.type||input.operationType);
    const basis=await this.read(input.projectId,input.pageId||input.artboardId,env);
    if(action==='edit.read') {
      if(input.query!==undefined&&(typeof input.query!=='string'||!input.query.trim()||input.query.length>200))fail('INVALID_INPUT','Node query must contain 1–200 literal characters');
      const artifact = basis.page?.artifact;
      if (env.user && !env.agent && artifact?.kind === 'schema' && (
        artifact.compilerVersion === '1.0.0' && /"type":"(?:navigate|back)"/.test(basis.document.html)
        || ['1.0.0','1.0.1','1.0.2'].includes(artifact.compilerVersion) && /<select\b[^>]*\bdata-schema-bind=/.test(basis.document.html)
      )) {
        const source = await this.owner.schema.record(basis.project,basis.page,env);
        const preview = await this.owner.schema.compile(basis.project,basis.page,source.document,artifact.binding,env,basis.page.htmlPath);
        basis.document.previewHTML = preview.html;
      }
      return basis;
    }
    if(action==='edit.validate') {
      const required = input.requiredSceneIds ?? [];
      if (!Array.isArray(required) || required.length > 2000 || required.some(id => typeof id !== 'string' || !id || id.length > 128)) {
        fail('INVALID_INPUT','Supply up to 2000 required scene IDs');
      }
      let validated;
      try {
        const document = await this.prepare(basis.document.html,{project:basis.project,page:basis.page,previousHtml:basis.document.html,htmlPath:basis.page.htmlPath,env});
        validated = {valid:true,diagnostics:document.diagnostics,resources:document.resources};
      } catch(error) {
        validated = {valid:false,diagnostics:error.details?.diagnostics || [{code:error.code,message:error.message,severity:'error'}]};
      }
      const semantic=basis.page.artifact?.kind==='schema'?(await this.owner.schema.record(basis.project,basis.page,env)).document:null;
      const items = basis.document.scenes?.items || [];
      const missingSceneIds = [...new Set(required)].filter(id => !items.some(scene => scene.id === id));
      const scenes = items.map(scene => ({
        id:scene.id,name:scene.name,kind:scene.kind || 'custom',
        nodeCount:Object.keys(scene.nodes || {}).length,
        sampleValueCount:Object.values(scene.nodes || {}).filter(variant => variant.text !== undefined || variant.attributes?.value !== undefined || variant.attributes?.checked !== undefined).length+(semantic?Object.keys(semantic.scenes[scene.id]?.state||{}).length:0),
        ...(semantic?{state:semantic.scenes[scene.id]?.state||{},ui:semantic.scenes[scene.id]?.ui||{},sourceFormat:'schema'}:{}),
        missingNodeIds:Object.keys(scene.nodes || {}).filter(id => !basis.document.nodes[id]),
      }));
      return {...validated,valid:validated.valid && !missingSceneIds.length,
        page:{id:basis.page.id,name:basis.page.name,revision:basis.page.revision,htmlPath:basis.page.htmlPath},
        sceneCoverage:{requiredSceneIds:required,missingSceneIds,active:basis.document.scenes?.active || null,items:scenes},
        ...(semantic?{semanticActions:Object.entries(semantic.actions).map(([id,action])=>({id,type:action.type||'sequence',target:action.target}))}:{}),
        interactions:(basis.document.interactions || []).map(({id,type,sourceId,targetId,sceneId,pageId}) => ({id,type,sourceId,targetId,sceneId,pageId})),
        pageId:basis.page.id,contentHash:sha(basis.document.html),savedContentHash:basis.sourceHash,
        projectRevision:basis.project.revision,saved:true,previewStatus:'pending'};
    }
    if(action==='edit.impact')return this.impact(basis,input);
    if(input.expectedRevision!==basis.project.revision||input.expectedArtboardRevision!==undefined&&input.expectedArtboardRevision!==basis.page.revision)fail('VERSION_CONFLICT','Project/page changed before editing');
    const task=env.task||this.owner.aiWorkbench?.taskFor?.(env.agent);if(env.agent)this.owner.aiWorkbench.assertAction({...input,action},{...env,task});
    let operations=input.operations;if(action==='edit.undo'||action==='edit.redo')operations=[{type:action.slice(5)}];
    if(!Array.isArray(operations)||!operations.length||operations.length>100)fail('INVALID_OPERATIONS','Supply 1–100 document operations');
    if(['react','vue'].includes(basis.page.artifact?.kind)&&!operations.every(op=>['page.position','page.viewport'].includes(op.type)))fail('FRAMEWORK_SOURCE_REQUIRED','请修改对应源码，不能把运行后的元素保存成 HTML。');
    if(basis.page.artifact?.kind==='schema'&&operations.length===1&&['undo','redo'].includes(operations[0].type))return this.owner.schema.restore({...input,pageId:basis.page.id,direction:operations[0].type},env);
    if(operations.length===1&&['undo','redo'].includes(operations[0].type)){if(!env.user&&task?.scope==='selection')fail('WRITE_SCOPE','Selection scope cannot restore a whole page');const result=await this.owner.workbench.execute({action:'file.'+operations[0].type,projectId:input.projectId,fileId:basis.file.id,expectedRevision:input.expectedRevision,expectedVersion:basis.version},{...env,target:task});this.cache.delete(input.projectId+'/'+basis.page.id);return {...result,...await this.read(input.projectId,basis.page.id,env)};}
    if (basis.page.artifact?.kind === 'schema') {
      operations=operations.map(operation=>{
        const saved=structuredClone(operation);
        if (['insert','replace','duplicate','scene.set','interaction.set'].includes(saved.type)) saved.identitySeed ||= randomUUID();
        if (saved.type==='scene.set'&&saved.scene&&!saved.scene.id) saved.scene.id='s-'+sha(saved.identitySeed).slice(0,24);
        if (saved.type==='interaction.set'&&saved.interaction&&!saved.interaction.id) saved.interaction.id='i-'+sha(saved.identitySeed).slice(0,24);
        return saved;
      });
      input={...input,operations};
    }
    if(operations.some(op=>op.type.startsWith('page.'))){if(operations.length!==1)fail('INVALID_OPERATIONS','Page layout changes are separate transactions');const op=operations[0];if(!['page.position','page.viewport'].includes(op.type))fail('INVALID_OPERATIONS','Unknown page geometry operation');const result=await this.owner.workbench.execute({action:'page.update',projectId:input.projectId,pageId:basis.page.id,expectedRevision:input.expectedRevision,...(op.type==='page.position'?{position:op.position}:{viewport:op.viewport})},{...env,target:task});return {...result,...await this.read(input.projectId,basis.page.id,env)};}
    let next;
    try {
      next=model.applyDocumentOperations(basis.document.html,operations,{scopeMode:env.user?'page':task?.scope==='read'?'read':task?.scope==='selection'?'selection':'page',scopeNodeIds:task?.nodeIds||[],allowUnlock:env.user&&input.allowUnlock===true,definitionScope:input.definitionScope||'instance'});
    } catch(error) {
      if(error instanceof model.DocumentModelError && error.code==='NODE_NOT_FOUND' && typeof error.details?.nodeId==='string' && error.details.nodeId) {
        const requestedId=error.details.nodeId;
        const matches=Object.values(basis.document.nodes).filter(node=>node.attributes?.id===requestedId);
        error.details={...error.details,recovery:{
          pageId:basis.page.id,expectedRevision:basis.project.revision,expectedArtboardRevision:basis.page.revision,
          htmlIdMatches:matches.slice(0,10).map(node=>({nodeId:node.id,htmlId:node.attributes.id,tag:node.tag})),
          read:{action:'edit.read',pageId:basis.page.id,query:requestedId.slice(0,200)},
          message:'Operations use data-dsh-node identities. Inspect these exact HTML-id matches or search the saved nodes, then retry the intended batch with current revisions.',
        }};
      }
      throw error;
    }
    if(basis.page.artifact?.kind==='schema'){const saved=await this.owner.schema.edit({...input,pageId:basis.page.id},env,basis,next);return {...saved,...await this.read(input.projectId,basis.page.id,env),changes:next.changes};}
    return {...await this.write({...input,html:next.html},env,basis),changes:next.changes};
  }
}
