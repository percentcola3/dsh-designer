import path from 'node:path';
import {fail} from './store.js';
import {compilePageSchema} from './schema-compiler.js';
import {requirePageSchema,validatePageSchema,pageSchemaCatalog,schemaHash,setSchemaValue,schemaValue,schemaNodeId,pageSchemaJSONSchema,SCHEMA_COMPILER_VERSION} from './page-schema.js';

const clone = value => structuredClone(value);
const stamp = () => new Date().toISOString();
const sourceId = pageId => 'f-' + schemaHash(pageId + ':schema-source').slice(0,32);
const htmlId = pageId => 'f-' + schemaHash(pageId + ':schema-html').slice(0,32);
function sourceLocation(document, pointer, allowNewKey = false) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || /~(?![01])/.test(pointer)) {
    fail('SCHEMA_PATH','Provide a JSON Pointer such as /css or /nodes/form/props/fields/0/label');
  }
  const parts = pointer.slice(1).split('/').map(part => part.replaceAll('~1','/').replaceAll('~0','~'));
  let parent = document;
  for (const [index,key] of parts.entries()) {
    if (['__proto__','constructor','prototype'].includes(key)) fail('SCHEMA_PATH','Reserved source key',{pointer});
    if (parent === null || typeof parent !== 'object') fail('SCHEMA_PATH','Source pointer traverses a scalar',{pointer});
    const array = Array.isArray(parent);
    if (array && !/^(0|[1-9]\d*)$/.test(key)) fail('SCHEMA_PATH','Array indices must be nonnegative integers',{pointer});
    const last = index === parts.length - 1;
    if (!Object.hasOwn(parent,key) && !(last && allowNewKey && !array)) fail('SCHEMA_PATH','Source pointer does not exist',{pointer});
    if (last) return {parent,key};
    parent = parent[key];
  }
}
const merge = (base,patch) => {
  for (const [key,value] of Object.entries(patch)) {
    if(['__proto__','constructor','prototype'].includes(key))fail('SCHEMA_PATH','Reserved patch key');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!base[key] || typeof base[key] !== 'object' || Array.isArray(base[key])) base[key] = {};
      merge(base[key],value);
    } else base[key] = clone(value);
  }
  return base;
};
export const SCHEMA_ACTIONS = {
  'schema.catalog':{description:'Read the compact semantic page, component, action and scene contracts. The Host generates WC markup, dependencies and behavior.',fields:'components?: requested semantic component names'},
  'schema.read':{description:'Read the canonical page definition and saved compile identity.',fields:'pageId, pointer?: JSON Pointer for one value, nodeIds?: node identifiers, offset=0, limit<=12000'},
  'schema.apply':{description:'Update the canonical definition of an existing Schema page. New pages use designer_commit_html.',fields:'pageId, expectedRevision, document?: {schemaVersion:1,id,root,nodes,state,actions,scenes}, operations?: [{type:source.set,pointer,value} | {type:source.replaceText,pointer,find,replace} | {type:node.update|node.set|node.remove|state.set|scene.set|action.set,id?,patch?,node?,path?,value?,scene?,action?}], draftId?: handle returned by schema.validate, retryLast?:true to repair the same task failed definition with operations, rebind?: true to adopt this task pinned system'},
  'schema.validate':{description:'Validate a proposed page definition or read and validate the saved source.',fields:'pageId?, document?'},
  'schema.detach':{description:'Owner operation to convert a compiled page into editable HTML, preserving its current source in history.',fields:'pageId, expectedRevision'},
};

/** Canonical JSON and generated HTML are immutable files published by one project CAS. */
export class SchemaService {
  constructor(owner) {this.owner = owner; this.workbench = owner.workbench; this.failedDefinitions = new Map(); this.validatedDefinitions = new Map();}
  attemptKey(project,page,env) {return [env.task?.id||env.agent?.id||'owner',project.id,page.id].join('/');}
  page(project,id) {return this.workbench.page(project,id);}
  sourceRoot(project,page) {return this.workbench.design(project,page.designId).folder + '/schema-' + page.id;}
  internalEnv(env,page,paths) {
    const target = env.task || env.target || env.scope;
    const fileTarget = target?.authority?.kind === 'project-file';
    const derivedTarget = fileTarget && page ? {...target,scope:'page',pageId:page.id,designId:page.designId,pageIds:[page.id]} : target;
    const scope = derivedTarget?.scope === 'selection' ? {...derivedTarget,scope:'page'} : derivedTarget;
    return {...env,schemaDerived:true,schemaDerivedPaths:paths,schemaSourcePageId:page?.id,schemaSourceFileId:page ? sourceId(page.id) : undefined,...(scope ? {target:scope,scope} : {})};
  }
  assertPage(project,page,env,{read=false}={}) {
    if(env.user&&!env.agent)return;
    const task=env.task||env.target||this.owner.aiWorkbench.taskFor(env.agent);
    if(!task||task.projectId!==project.id)fail('PROJECT_SCOPE','Schema operations require the admitted project');
    if(!read&&(env.policy?.mode==='read-only'||task.scope==='read'))fail('SCOPE_DENIED','The current task is read-only');
    if (task.authority?.kind === 'project-file') {
      const file = project.workbench.files.find(file => file.id === sourceId(page.id) && file.path === page.artifact?.entry && !file.removedAt);
      if (!file || (task.authority.fileId ? task.authority.fileId !== file.id : task.authority.path !== file.path)) fail('SCOPE_DENIED','Schema compilation requires the exact registered source file');
    }
    if(task.scope!=='project'&&task.designId&&task.designId!==page.designId)fail('SCOPE_DENIED','Schema page is outside the frozen Design');
    if(['page','selection'].includes(task.scope)&&task.pageId!==page.id)fail('SCOPE_DENIED','Schema page is outside the frozen target');
  }
  async record(project,page,env={}) {
    if (page.artifact?.kind !== 'schema') fail('SCHEMA_SOURCE_REQUIRED','This page has no canonical page definition');
    const entry = page.artifact.entry, root = this.sourceRoot(project,page);
    if (typeof entry !== 'string' || !entry.startsWith(root + '/') || entry.includes('..') || entry.includes('\\')) fail('SCHEMA_PATH','Canonical source leaves its owning page');
    const file = project.workbench.files.find(file => file.id === sourceId(page.id) && file.path === entry && !file.removedAt);
    if (!file) fail('SCHEMA_SOURCE_REQUIRED','The registered page definition is unavailable');
    const saved = await this.workbench.readAt(project,entry,env,2 * 1024 * 1024);
    if (schemaHash(saved.bytes.toString('utf8')) !== page.artifact.sourceHash) fail('VERSION_CONFLICT','Page definition changed outside Designer; reconcile the saved source');
    const document = requirePageSchema(saved.bytes.toString('utf8'));
    return {document,file,version:saved.version,text:saved.bytes.toString('utf8')};
  }
  async read(input,env={}) {
    const project = await this.workbench.project(input.projectId,env.signal), page = this.page(project,input.pageId);
    this.assertPage(project,page,env,{read:true});
    if (env.agent && !page.artifact && await this.workbench.isInitialPage(project,page,env)) {
      const status = {status:'initial-page',pageId:page.id,projectRevision:project.revision,schemaSaved:false};
      const target = {projectId:project.id,artboardId:page.id,expectedRevision:project.revision};
      try { this.owner.aiWorkbench.assertAction({action:'artboard.commit',...target},env); }
      catch (error) { if (error.code === 'SCOPE_DENIED') return status; throw error; }
      return {...status,guidance:'Save the requested HTML directly to the current page.',next:{tool:'designer_commit_html',artboardId:page.id,expectedRevision:project.revision}};
    }
    const record = await this.record(project,page,env);
    if (input.nodeIds !== undefined && (!Array.isArray(input.nodeIds) || input.nodeIds.length > 100 || input.nodeIds.some(id=>typeof id!=='string'))) fail('INVALID_INPUT','Read at most 100 node IDs');
    if (input.pointer !== undefined && input.nodeIds !== undefined) fail('INVALID_INPUT','Choose either pointer or nodeIds for a scoped source read');
    let document = record.document;
    if (input.pointer !== undefined) {
      const {parent,key} = sourceLocation(document,input.pointer);
      document = parent[key];
    } else if (input.nodeIds) {
      document = {...document,nodes:Object.fromEntries(input.nodeIds.filter(id => Object.hasOwn(document.nodes,id)).map(id => [id,document.nodes[id]]))};
    }
    const text = JSON.stringify(document,null,2), offset = input.offset ?? 0, limit = input.limit ?? 12000;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 12000) fail('INVALID_INPUT','Use a nonnegative offset and limit up to 12000');
    const result = {pageId:page.id,projectRevision:project.revision,sourcePath:record.file.path,sourceFileId:record.file.id,sourceVersion:record.version,sourceHash:page.artifact.sourceHash,compilerVersion:page.artifact.compilerVersion,binding:this.bindingSummary(page.artifact.binding),...(input.pointer === undefined ? {} : {pointer:input.pointer}),text:text.slice(offset,offset + limit),offset,total:text.length,nextOffset:offset + limit < text.length ? offset + limit : null};
    return env.user && !env.agent ? {...result,document} : result;
  }
  bindingSummary(binding) {return binding ? {systemId:binding.systemId,version:binding.version,name:binding.name,componentVersion:binding.manifest?.version,resourceHashes:Object.fromEntries(Object.entries(binding.resources || {}).map(([key,value]) => [key,value.sha256]))} : {systemId:null};}
  async binding(project,page,input,env) {
    if (page.artifact?.kind === 'schema' && input.rebind !== true) return {binding:clone(page.artifact.binding),projectRevision:project.revision};
    let task = env.task;
    if (!task) {
      const resolved=await this.workbench.execute({action:'binding.resolve',projectId:project.id,designId:page.designId},env);
      if(!resolved.systemId||resolved.mode==='none')return {binding:{systemId:null,resources:{}},projectRevision:project.revision};
      const prepared = await this.owner.aiWorkbench.prepare({projectId:project.id,prompt:'Compile the selected design page',mode:'edit',target:{projectId:project.id,designId:page.designId,pageId:page.id,scope:'page'}},env);
      task = prepared.task;
    }
    const admitted = task.effectiveBindingsByDesign?.[page.designId] || task.effectiveBinding;
    if (!admitted?.systemId || admitted.mode === 'none') return {binding:{systemId:null,resources:{}},projectRevision:project.revision};
    const copied = await this.owner.aiWorkbench.assetFromSystemResource({resourceId:'binding-design:' + page.designId,designId:page.designId,pageId:page.id,expectedRevision:project.revision},{...env,user:false,task,target:task});
    const latest = await this.workbench.project(project.id,env.signal), resources = {};
    for (const [logical,entry] of Object.entries(copied.resourceMap)) {
      if (['theme.css','components.js','components.json','tokens.json'].includes(logical)) resources[logical] = {path:entry.path,sha256:entry.sha256,mimeType:entry.mimeType};
    }
    const decode = async logical => {
      if (!resources[logical]) return null;
      const value = await this.workbench.readAt(latest,resources[logical].path,env,2 * 1024 * 1024);
      return JSON.parse(value.bytes.toString('utf8'));
    };
    const manifest = await decode('components.json'), tokens = await decode('tokens.json');
    if (!resources['theme.css'] || !resources['components.js'] || !manifest) fail('SCHEMA_SYSTEM_UNSUPPORTED','The pinned system needs theme.css, components.js and components.json for semantic compilation');
    return {binding:{systemId:admitted.systemId,version:admitted.version,name:admitted.system?.name,manifest:{name:manifest.name,version:manifest.version,dom:manifest.dom,components:manifest.components.map(component => ({tag:component.tag,native:component.native,semanticRole:component.semanticRole}))},rootClass:manifest.rootClass || 'ds-theme',tokens,resources},projectRevision:copied.projectRevision};
  }
  async compile(project,page,document,binding,env,htmlPath) {
    const resources = {};
    for (const [logical,resource] of Object.entries(binding?.resources || {})) {
      const file = await this.workbench.readAt(project,resource.path,env,4 * 1024 * 1024);
      if (schemaHash(file.bytes.toString('utf8')) !== resource.sha256) fail('REFERENCE_VERSION_CONFLICT','Pinned schema dependency changed',{path:resource.path});
      resources[logical] = {...resource,url:path.posix.relative(path.posix.dirname(htmlPath),resource.path)};
    }
    const directory = path.posix.dirname(htmlPath), pages = project.artboards.filter(target => !target.deletedAt);
    const pageURLs = Object.fromEntries(pages.map(target => {
      const targetPath = target.id === page.id ? htmlPath : target.htmlPath;
      return [target.id,path.posix.relative(directory,targetPath).split('/').map(encodeURIComponent).join('/')];
    }));
    return compilePageSchema(document,{platform:page.platform || project.platform,binding:{...binding,resources},pageURLs});
  }
  async publishInProject(project,page,document,binding,env,{history}={}) {
    const root = this.sourceRoot(project,page), source = JSON.stringify(requirePageSchema(document),null,2) + '\n';
    const sourceHash = schemaHash(source), sourcePath = root + '/' + sourceHash.slice(0,24) + '/page.design.json';
    const buildHash=schemaHash(sourceHash+JSON.stringify(this.bindingSummary(binding))+SCHEMA_COMPILER_VERSION);
    const htmlPath = path.posix.dirname(page.htmlPath) + '/revision-schema-' + buildHash.slice(0,16) + '-' + (page.revision + 1) + '.html';
    const compiled = await this.compile(project,page,document,binding,env,htmlPath);
    const prepared = await this.owner.editor.prepare(compiled.html,{project,page,previousHtml:undefined,htmlPath,env:this.internalEnv(env)});
    const previous = page.artifact?.kind === 'schema' ? {entry:page.artifact.entry,sourceHash:page.artifact.sourceHash,htmlPath:page.htmlPath,contentHash:page.contentHash,binding:clone(page.artifact.binding)} : null;
    const sourceFile = {...project.workbench.files.find(file => file.id === sourceId(page.id)),id:sourceId(page.id),path:sourcePath,name:'page.design.json',type:'file',mimeType:'application/json',readonly:false,pageId:page.id,designId:page.designId,sha256:sourceHash,updatedAt:stamp()};
    const oldHTML = project.workbench.files.find(file => file.path === page.htmlPath && file.pageId === page.id);
    const pageFile = {...oldHTML,id:oldHTML?.id || htmlId(page.id),path:htmlPath,type:'page',mimeType:'text/html',readonly:false,pageId:page.id,designId:page.designId,sha256:schemaHash(prepared.html),updatedAt:stamp()};
    this.workbench.register(project,sourceFile); this.workbench.register(project,pageFile);
    const internal = this.internalEnv(env,page,[sourcePath,htmlPath]);
    const existing = await this.workbench.fs.stat(await this.workbench.target(project,sourcePath,internal),env.signal);
    if (existing) {
      const value = await this.workbench.readAt(project,sourcePath,internal);
      if (schemaHash(value.bytes.toString('utf8')) !== sourceHash) fail('VERSION_CONFLICT','Immutable source revision was modified');
    } else await this.workbench.writeAt(project,sourcePath,source,null,internal);
    const existingHTML=await this.workbench.fs.stat(await this.workbench.target(project,htmlPath,internal),env.signal);
    if(existingHTML){const saved=await this.workbench.readAt(project,htmlPath,internal);if(schemaHash(saved.bytes.toString('utf8'))!==schemaHash(prepared.html))fail('VERSION_CONFLICT','Immutable build revision changed');}
    else await this.workbench.writeAt(project,htmlPath,prepared.html,null,internal);
    sourceFile.savedFsVersion = (await this.workbench.fs.stat(await this.workbench.target(project,sourcePath,internal),env.signal)).version;
    pageFile.readonly = true;
    pageFile.savedFsVersion = (await this.workbench.fs.stat(await this.workbench.target(project,htmlPath,internal),env.signal)).version;
    await this.workbench.retainFileVersion(project,sourceFile,internal);
    await this.workbench.retainFileVersion(project,pageFile,internal);
    page.htmlPath = htmlPath; page.contentHash = pageFile.sha256; page.revision++; page.updatedAt = stamp();
    const priorHistory = page.artifact?.kind === 'schema' ? page.artifact.history || {entries:[],cursor:-1} : {entries:[],cursor:-1};
    const entries = history?.entries || [...priorHistory.entries.slice(0,priorHistory.cursor + 1)];
    if (!history && previous && !entries.length) entries.push(previous);
    const current = {entry:sourcePath,sourceHash,htmlPath,contentHash:page.contentHash,binding:clone(binding)};
    if (!history) entries.push(current);
    page.artifact = {kind:'schema',schemaVersion:1,compilerVersion:SCHEMA_COMPILER_VERSION,entry:sourcePath,sourceRoot:root,files:[sourcePath],sourceHash,binding:clone(binding),sourceMap:compiled.sourceMap,formFields:compiled.formFields,version:(page.artifact?.version || 0) + 1,buildId:'schema-' + schemaHash(buildHash+page.contentHash).slice(0,24),history:{entries,cursor:history?.cursor ?? entries.length - 1}};
    this.owner.editor.cache.delete(project.id + '/' + page.id);
    return {compiled,sourceFile,pageFile};
  }
  applyOperations(document,operations) {
    if (!Array.isArray(operations) || !operations.length || operations.length > 100) fail('SCHEMA_OPERATIONS','Provide 1–100 source operations');
    for (const operation of operations) {
      if (!operation || typeof operation !== 'object') fail('SCHEMA_OPERATIONS','Use a source operation object');
      if(operation.id!==undefined&&(!/^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/.test(operation.id)||['__proto__','constructor','prototype'].includes(operation.id)))fail('SCHEMA_OPERATIONS','Invalid operation identifier');
      if(operation.patch!==undefined&&(!operation.patch||typeof operation.patch!=='object'||Array.isArray(operation.patch)))fail('SCHEMA_OPERATIONS','Node patches must be objects');
      switch (operation.type) {
        case 'source.set': {
          if (!Object.hasOwn(operation,'value')) fail('SCHEMA_OPERATIONS','source.set requires a value');
          const {parent,key} = sourceLocation(document,operation.pointer,true);
          parent[key] = clone(operation.value);
          break;
        }
        case 'source.replaceText': {
          const {parent,key} = sourceLocation(document,operation.pointer);
          const current = parent[key], {find,replace} = operation;
          if (typeof current !== 'string' || typeof find !== 'string' || !find || typeof replace !== 'string') {
            fail('SCHEMA_OPERATIONS','source.replaceText requires a string target, a nonempty find string and a replacement string');
          }
          const at = current.indexOf(find);
          if (at < 0 || current.indexOf(find,at + 1) >= 0) {
            fail('SCHEMA_OPERATIONS','The find string must match exactly once. Read this pointer and choose a unique fragment.',{pointer:operation.pointer});
          }
          parent[key] = current.slice(0,at) + replace + current.slice(at + find.length);
          break;
        }
        case 'node.update':
          if (!Object.hasOwn(document.nodes,operation.id)) fail('NODE_NOT_FOUND','Schema node does not exist',{nodeId:operation.id});
          merge(document.nodes[operation.id],operation.patch); break;
        case 'node.set': document.nodes[operation.id] = clone(operation.node); break;
        case 'node.remove':
          delete document.nodes[operation.id];
          for (const node of Object.values(document.nodes)) if (node.children) node.children = node.children.filter(id => id !== operation.id);
          break;
        case 'state.set': setSchemaValue(document.state,operation.path,operation.value); break;
        case 'scene.set': document.scenes[operation.id] = clone(operation.scene); break;
        case 'action.set': document.actions[operation.id] = clone(operation.action); break;
        default: fail('SCHEMA_OPERATIONS','Unknown source operation',{type:operation.type});
      }
    }
    return document;
  }
  async apply(input,env={}) {
    let project = await this.workbench.project(input.projectId,env.signal), page = this.page(project,input.pageId);
    this.assertPage(project,page,env);
    if((env.task||env.target)?.scope==='selection'&&!env.schemaScopedEdit)fail('SCOPE_DENIED','Selected elements use scoped edit.apply');
    if (project.revision !== input.expectedRevision) fail('VERSION_CONFLICT','Project changed before schema compilation');
    if (page.artifact && page.artifact.kind !== 'schema') fail('SCHEMA_SOURCE_REQUIRED','Existing source-format pages retain their source workflow');
    const previous = page.artifact?.kind === 'schema' ? await this.record(project,page,env) : null;
    if (input.expectedVersion !== undefined && input.expectedVersion !== previous?.version) fail('VERSION_CONFLICT','Canonical page definition changed before save');
    const attemptKey = this.attemptKey(project,page,env), failed = input.retryLast ? this.failedDefinitions.get(attemptKey) : null;
    const staged = input.draftId ? this.validatedDefinitions.get(attemptKey) : null;
    if (input.draftId && (!staged || staged.id !== input.draftId || staged.projectRevision !== project.revision)) fail('VERSION_CONFLICT','The validated draft is unavailable or its project changed; validate the current definition again');
    if (input.retryLast && (!failed || failed.projectRevision !== project.revision)) fail('VERSION_CONFLICT','The failed definition is unavailable or its project changed; read the current saved source');
    if (!previous && !failed && !staged && input.document === undefined) fail('SCHEMA_SOURCE_REQUIRED','Provide a complete page definition for the first build');
    let candidate = input.document ?? clone(staged?.document);
    if (candidate === undefined) candidate = this.applyOperations(clone(failed?.document || previous.document),input.operations);
    else if (staged && input.operations) candidate=this.applyOperations(candidate,input.operations);
    const validated = validatePageSchema(candidate);
    if (!validated.valid) {
      if (validated.spec) {
        this.failedDefinitions.set(attemptKey,{document:validated.spec,projectRevision:project.revision});
        if (this.failedDefinitions.size > 64) this.failedDefinitions.delete(this.failedDefinitions.keys().next().value);
      }
      const recovery = validated.spec ? {action:'schema.apply',pageId:page.id,expectedRevision:project.revision,retryLast:true,repairVia:'operations'} : {action:'schema.validate',provide:'a corrected document'};
      fail('SCHEMA_INVALID',JSON.stringify({message:'Page definition validation failed',diagnostics:validated.diagnostics.slice(0,40),recovery}),{diagnostics:validated.diagnostics,recovery});
    }
    const document = validated.spec;
    const resolved = await this.binding(project,page,input,env);
    return this.workbench.exclusive(input.projectId,async () => {
      project = await this.workbench.project(input.projectId,env.signal); page = this.page(project,input.pageId);
      if (project.revision !== resolved.projectRevision) fail('VERSION_CONFLICT','Project changed while resolving schema dependencies');
      let published;
      const saved = await this.workbench.mutate({...input,expectedRevision:project.revision},this.internalEnv(env),input.summary || 'Save semantic page definition',async next => {
        published = await this.publishInProject(next,this.page(next,page.id),document,resolved.binding,env);
      });
      this.failedDefinitions.delete(attemptKey);
      this.validatedDefinitions.delete(attemptKey);
      return this.receipt(saved,page.id,published);
    });
  }
  receipt(project,pageId,published) {
    const page = this.page(project,pageId);
    return {...this.workbench.result(project,{page,artboard:page}),file:published.sourceFile,version:published.sourceFile.savedFsVersion,saved:true,sourceSaved:true,sourceHash:page.artifact.sourceHash,sourcePath:page.artifact.entry,compilerVersion:page.artifact.compilerVersion,binding:this.bindingSummary(page.artifact.binding),sceneIds:published.compiled.sceneIds,compiledBytes:Buffer.byteLength(published.compiled.html),definitionBytes:Buffer.byteLength(JSON.stringify(published.compiled.spec)),diagnostics:published.compiled.diagnostics,previewStatus:'built',interactionVerification:'unverified'};
  }
  async edit(input,env,basis,next) {
    const record = await this.record(basis.project,basis.page,env), document = clone(record.document);
    const sourceMap = compilePageSchema(record.document,{binding:basis.page.artifact.binding,platform:basis.page.platform||basis.project.platform}).sourceMap;
    const scene=input.sceneId ? document.scenes[input.sceneId] : null;
    if (input.sceneId && !scene) fail('SCENE_NOT_FOUND','The edited scene no longer exists');
    const state=scene ? merge(clone(document.state),scene.state||{}) : document.state;
    const saveValue=(path,value)=>setSchemaValue(scene ? (scene.state ||= {}) : document.state,path,value);
    const updateValue = (address,value) => {
      const node=document.nodes[address.nodeId];if(!node)return false;
      if(address.bind?.startsWith('item.')&&address.source){const rows=schemaValue(state,address.source),row=rows.find(row=>String(row[address.keyField||'id'])===address.recordKey);if(row){setSchemaValue(row,address.bind.slice(5),value);saveValue(address.source,rows);return true;}}
      if(address.part==='text'&&address.bind){saveValue(address.bind,value);return true;}
      if(address.part==='text'&&!address.bind&&!address.recordKey){node.text=value;return true;}
      if(address.part?.startsWith('props.')){setSchemaValue(node,address.part,value);return true;}
      if(address.part==='field.label'||address.part==='field.help'){
        const field=node.props.fields.find(field=>field.id===address.fieldId);
        field[address.part.slice(6)]=value;return true;
      }
      if(address.part==='field.option.label'){
        node.props.fields.find(field=>field.id===address.fieldId).options[address.index].label=value;return true;
      }
      if(address.part==='action.text'){
        const item=node.props.actions?.[address.index]||node.props.submit;if(item){item.text=value;return true;}
      }
      if(address.part==='record'){
        const rows=schemaValue(state,address.source),row=rows.find(row=>String(row[address.keyField])===address.recordKey);
        if(row){row[address.field]=value;saveValue(address.source,rows);return true;}
      }
      return false;
    };
    const retained=[];
    for(const operation of input.operations){
      let translated=false;
      if(operation.type==='text'){
        const ids=operation.nodeIds||[operation.nodeId];
        if(ids.length&&ids.every(id=>sourceMap[id])){
          const results=ids.map(id=>updateValue(sourceMap[id],operation.value));
          translated=results.every(Boolean);
        }
      }
      if(operation.type==='attributes'){
        for(const id of operation.nodeIds||[operation.nodeId]){
          const address=sourceMap[id];
          if(!address?.bind)continue;
          for(const [key,value]of Object.entries(operation.attributes||{})){
            if(key!=='value'&&key!=='checked')continue;
            if(address.part!=='radio.choice'){updateValue({...address,part:'text'},key==='checked'?value!==null&&value!==false:value);continue;}
            const option=document.nodes[address.nodeId].props.fields.find(field=>field.id===address.fieldId).options[address.index];
            if(key==='checked'){
              const current=address.bind.startsWith('item.')&&address.source
                ? schemaValue(schemaValue(state,address.source)?.find(row=>String(row[address.keyField||'id'])===address.recordKey),address.bind.slice(5))
                : schemaValue(state,address.bind);
              if(value!==null&&value!==false)updateValue({...address,part:'text'},option.value);
              else if(current===option.value)updateValue({...address,part:'text'},null);
            }else{
              const original=option.value;
              let next=value;
              if(typeof original!=='string' && typeof value==='string'){
                try{next=JSON.parse(value);}catch{next=value;}
              }
              option.value=next;
              // Selection snapshots follow the renamed option, including saved scene overrides.
              for(const snapshot of [document.state,...Object.values(document.scenes).map(scene=>scene.state).filter(Boolean)]){
                if(address.bind.startsWith('item.')&&address.source){
                  for(const row of schemaValue(snapshot,address.source)||[])if(schemaValue(row,address.bind.slice(5))===original)setSchemaValue(row,address.bind.slice(5),next);
                }else if(schemaValue(snapshot,address.bind)===original)setSchemaValue(snapshot,address.bind,next);
              }
            }
          }
        }
        translated=Object.keys(operation.attributes||{}).every(key=>['value','checked'].includes(key))&&(operation.nodeIds||[]).every(id=>sourceMap[id]?.bind);
      }
      if (operation.type === 'visibility') {
        const remaining=[];
        for (const id of operation.nodeIds||[]) {
          const address=sourceMap[id];
          if (address&&!address.recordKey&&id===schemaNodeId(address.nodeId)) {
            if (scene) {scene.ui ||= {};scene.ui[address.nodeId]={...scene.ui[address.nodeId],hidden:operation.hidden};}
            else document.nodes[address.nodeId].hidden=operation.hidden;
          } else remaining.push(id);
        }
        if (remaining.length) retained.push({...clone(operation),nodeIds:remaining});
        translated=true;
      }
      if (operation.type === 'remove') {
        const remaining=[];
        for (const id of operation.nodeIds||[]) {
          const address=sourceMap[id];
          if (address?.part==='row') {
            const rows=schemaValue(state,address.source).filter(row=>String(row[address.keyField])!==address.recordKey);
            setSchemaValue(state,address.source,rows);saveValue(address.source,rows);
          } else remaining.push(id);
        }
        if (remaining.length) retained.push({...clone(operation),nodeIds:remaining});
        translated=true;
      }
      if(operation.type==='scene.set'){
        const scene=operation.scene, state=clone(scene.schemaState||{}),ui=clone(scene.schemaUI||{});
        if((env.task||env.target)?.scope==='selection'&&(scene.schemaState||scene.schemaUI))fail('SCOPE_DENIED','Whole-state snapshots require the page target');
        for(const key of Object.keys(state))if(!Object.hasOwn(document.state,key))fail('SCHEMA_SNAPSHOT','Preview state contains an undeclared model',{path:key});
        for(const input of Object.values(basis.document.nodes))if(['password','file','hidden'].includes(input.attributes.type)&&input.attributes['data-schema-bind'])setSchemaValue(state,input.attributes['data-schema-bind'],schemaValue(document.state,input.attributes['data-schema-bind'])??'');

        for(const [id,variant]of Object.entries(scene.nodes||{})){
          const address=sourceMap[id];
          if(address?.bind)for(const [key,value]of Object.entries(variant.attributes||{}))if(key==='value'||key==='checked')setSchemaValue(state,address.bind,key==='checked'?value!==null&&value!==false:value);
          const node=document.nodes[address?.nodeId];
          if (node && address.part === 'node' && variant.hidden !== undefined) ui[address.nodeId] = {...ui[address.nodeId],hidden:variant.hidden};
          if(node&&['dialog','drawer'].includes(node.use)&&Object.hasOwn(variant.attributes||{},'open'))ui[address.nodeId]={open:variant.attributes.open!==false&&variant.attributes.open!==null};
        }
        document.scenes[scene.id]={...document.scenes[scene.id],name:scene.name,state:merge(clone(document.scenes[scene.id]?.state||{}),state),ui:merge(clone(document.scenes[scene.id]?.ui||{}),ui)};
      }
      if (operation.type === 'scene.reset' && operation.remove) delete document.scenes[operation.id];
      if(!translated){const saved=clone(operation);if(saved.type==='scene.set'){delete saved.scene.schemaState;delete saved.scene.schemaUI;}retained.push(saved);}
    }
    if (retained.length) document.documentOperations = [...document.documentOperations || [],...retained];
    return this.apply({...input,document,expectedVersion:record.version},{...env,schemaScopedEdit:true});
  }
  async restore(input,env) {
    return this.workbench.exclusive(input.projectId,async () => {
      const project = await this.workbench.project(input.projectId,env.signal), page = this.page(project,input.pageId);
      if (project.revision !== input.expectedRevision) fail('VERSION_CONFLICT','Project changed before schema history restore');
      this.assertPage(project,page,env);
      await this.record(project,page,env);
      const prior = page.artifact.history;
      let cursor = input.direction === 'redo' ? prior.cursor + 1 : prior.cursor - 1;
      if(input.revisionId){const file=this.workbench.entry(project,input),entry=project.workbench.fileHistory?.[file.id]?.entries.find(entry=>entry.id===input.revisionId);if(!entry)fail('NOT_FOUND','Exact file revision was not found');cursor=prior.entries.findIndex(item=>[item.sourceHash,item.contentHash].includes(entry.sha256));}
      const item = prior.entries[cursor];
      if (!item) fail('HISTORY_BOUNDARY','No saved schema revision exists in that direction');
      const source = await this.workbench.readAt(project,item.entry,env);
      if (schemaHash(source.bytes.toString('utf8')) !== item.sourceHash) fail('VERSION_CONFLICT','Historical source revision changed');
      let published;
      const saved = await this.workbench.mutate(input,this.internalEnv(env),'Restore semantic page definition',async next => {
        published = await this.publishInProject(next,this.page(next,page.id),JSON.parse(source.bytes.toString('utf8')),item.binding,env,{history:{entries:prior.entries,cursor}});
      });
      return this.receipt(saved,page.id,published);
    });
  }
  async clonePage(project,original,page,env,dependencyMap) {
    const source = await this.record(project,original,env), binding = clone(original.artifact.binding);
    for (const resource of Object.values(binding.resources || {})) if (dependencyMap.has(resource.path)) resource.path = dependencyMap.get(resource.path);
    delete page.artifact;
    return this.publishInProject(project,page,source.document,binding,env);
  }
  async execute(input,env={}) {
    if (input.action === 'schema.catalog') {
      if(input.view==='json-schema')return pageSchemaJSONSchema();
      const catalog=pageSchemaCatalog();
      if(Array.isArray(input.components))catalog.props=Object.fromEntries(Object.entries(catalog.props).filter(([key])=>input.components.includes(key)));
      return catalog;
    }
    if (input.action === 'schema.read') return this.read(input,env);
    if (input.action === 'schema.validate') {
      const project = input.projectId && (input.pageId || input.document === undefined) ? await this.workbench.project(input.projectId,env.signal) : null;
      if (project) this.assertPage(project,this.page(project,input.pageId),env,{read:true});
      const document = input.document ?? (await this.record(project,this.page(project,input.pageId),env)).document;
      const validated=validatePageSchema(document),result={valid:validated.valid,diagnostics:validated.diagnostics};
      if (project && input.document && validated.spec) {
        const page=this.page(project,input.pageId),key=this.attemptKey(project,page,env);
        if (validated.valid) {
          const id='draft-'+schemaHash(validated.spec).slice(0,24);
          this.validatedDefinitions.set(key,{id,document:validated.spec,projectRevision:project.revision});
          if (this.validatedDefinitions.size>64) this.validatedDefinitions.delete(this.validatedDefinitions.keys().next().value);
          result.next={action:'schema.apply',pageId:page.id,expectedRevision:project.revision,draftId:id};
        } else {
          this.failedDefinitions.set(key,{document:validated.spec,projectRevision:project.revision});
          if (this.failedDefinitions.size>64) this.failedDefinitions.delete(this.failedDefinitions.keys().next().value);
          result.recovery={action:'schema.apply',pageId:page.id,expectedRevision:project.revision,retryLast:true,repairVia:'operations'};
        }
      }
      return result;
    }
    if (input.action === 'schema.apply') {
      const project=await this.workbench.project(input.projectId,env.signal);
      const page=this.page(project,input.pageId);
      this.assertPage(project,page,env);
      if (!page.artifact) fail('INVALID_ARTIFACT_KIND','新设计稿仅支持 HTML。');
      return this.apply(input,env);
    }
    if (input.action === 'schema.detach') {
      if (!env.user || env.agent) fail('USER_ONLY','Converting a source format requires an owner operation');
      const saved = await this.workbench.mutate(input,env,'Convert schema page to HTML',async project => {
        const page = this.page(project,input.pageId);
        await this.record(project,page,env);
        delete page.artifact;
        const file = project.workbench.files.find(file => file.pageId === page.id && file.path === page.htmlPath);
        file.readonly = false;
      });
      return this.workbench.result(saved,{saved:true,page:this.page(saved,input.pageId)});
    }
    fail('UNKNOWN_ACTION','Unknown schema action');
  }
}
