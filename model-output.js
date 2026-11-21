import {fail} from './store.js';

// Model-facing values are detached JSON data, never owner preview capabilities.
const PRIVATE_KEYS=new Set(['capability','previewTicket','assetBase','assetRoot','savedHTML','bytesBase64','imageBase64','accessToken','refreshToken','authorization','password','privateKey','passphrase','httpsToken']);
const PREVIEW_LINK=/(?:https?:\/\/[^\s/"'<>]+)?\/api\/designer\/(?:share|capture|resource|file-resource|source-resource|knowledge-resource|download)\/[^\s"'<>)]*/g;
const bounded=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';

function invalid(reason){const error=new TypeError(`Designer model output contains ${reason}`);error.code='INVALID_MODEL_OUTPUT';throw error;}

/**
 * Preserve the existing modelSafe redactions and explicitly handle optional JS
 * values: omit undefined object fields and use null for undefined/holes in arrays.
 * Reject unsupported data instead of silently stringifying NaN, functions, etc.
 * Do not invoke getters or toJSON hooks, including those on private fields.
 */
export function modelSafe(value){
  const ancestors=new WeakSet();
  function visit(value){
    if(value===undefined||value===null)return null;
    if(typeof value==='string')return /^data:[^,]*;base64,/i.test(value)?'[binary attachment omitted]':value.replace(PREVIEW_LINK,'[owner preview link omitted]');
    if(typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))invalid('a non-finite number');return Object.is(value,-0)?0:value;}
    if(typeof value!=='object')invalid('an unsupported value type');
    if(ancestors.has(value))invalid('a circular reference');
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
    if(!array&&prototype!==Object.prototype&&prototype!==null)invalid('a non-plain object');
    ancestors.add(value);
    try{
      if(array){
        const result=[];
        for(let index=0;index<value.length;index++){
          const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
          if(descriptor&&!Object.hasOwn(descriptor,'value'))invalid('an accessor');
          result.push(visit(descriptor?.value));
        }
        for(const key of Reflect.ownKeys(value))if(key!=='length'&&!(typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<value.length))invalid('an extra array property');
        return result;
      }
      const result={};
      for(const key of Reflect.ownKeys(value)){
        if(typeof key==='string'&&PRIVATE_KEYS.has(key))continue;
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(!descriptor?.enumerable)continue;
        if(typeof key!=='string')invalid('a symbol property');
        if(!Object.hasOwn(descriptor,'value'))invalid('an accessor');
        if(descriptor.value===undefined)continue;
        Object.defineProperty(result,key,{value:visit(descriptor.value),enumerable:true,writable:true,configurable:true});
      }
      return result;
    }finally{ancestors.delete(value);}
  }
  return visit(value);
}

function modelPage(page) {
  if(page?.artifact?.kind!=='schema')return page;
  const {kind,entry,sourceRoot,sourceHash,compilerVersion,version,buildId}=page.artifact;
  return {...page,artifact:{kind,entry,sourceRoot,sourceHash,compilerVersion,version,buildId}};
}

function pageIdentity(page) {
  if (!page) return undefined;
  const {id,designId,name,platform,revision,htmlPath,contentHash,position,viewport,artifact} = page;
  return {id,designId,name,platform,revision,htmlPath,contentHash,position,viewport,
    artifact:artifact && {kind:artifact.kind,entry:artifact.entry,sourceHash:artifact.sourceHash,buildId:artifact.buildId}};
}

function sourceExcerpt(html, input) {
  const offset = Math.max(0, Number.isSafeInteger(input.offset) ? input.offset : 0);
  const query = typeof input.query === 'string' && input.query.trim() ? input.query : '';
  const limit = Math.min(12000, Math.max(1, Number.isSafeInteger(input.limit) ? input.limit : (query ? 900 : 6000)));
  const matchOffset = query ? html.indexOf(query, offset) : undefined;
  const found = matchOffset !== -1;
  const nextMatch = query && found ? html.indexOf(query, matchOffset + query.length) : -1;
  let start = offset;
  if (query && found) start = Math.max(offset, matchOffset - Math.max(0, Math.floor((limit - query.length) / 2)));
  return {
    text:found ? html.slice(start, start + limit) : '', offset:start, offsetUnit:'characters', total:html.length,
    nextOffset:found && start + limit < html.length ? start + limit : null,
    ...(query ? {matchOffset:found ? matchOffset : null,nextMatchOffset:nextMatch >= 0 ? nextMatch : null} : {}),
  };
}

/** Bounded editor receipt, retaining durable save identities and warnings. */
export function modelResult(value, input = {}, {compact = false} = {}) {
  if (compact && input.action === 'context.read' && value?.frozen && value.systemId && value.path === 'rule.md') {
    return modelSafe({...value,hostWorkflow:'Use the public component structures from system.usage. For new pages write HTML directly and save with designer_commit_html. The host attaches the bound theme and runtime. Editor entries are only needed if the user requests them.'});
  }
  const deduplicateText = compact && ['file.read', 'context.read'].includes(input.action);
  if (deduplicateText && typeof value?.text === 'string' && value.content === value.text) {
    const {content, ...result} = value;
    return modelSafe(result);
  }

  if (compact && input.action === 'export.create' && Array.isArray(value?.captures)) {
    return modelSafe({...value, captures:value.captures.map(item => {
      const metadata=item.capture?.metadata;
      if (!metadata) return item;
      return {...item, capture:{
        format:item.capture.format,width:item.capture.width,height:item.capture.height,
        requested:item.capture.requested,warnings:item.capture.warnings,
        metadata:{
          captureId:metadata.captureId,pageId:metadata.pageId,pageRevision:metadata.pageRevision,
          sourceHtmlHash:metadata.sourceHtmlHash,savedSourceHash:metadata.savedSourceHash,
          resourceCount:metadata.resourceCount,fontStatus:metadata.fontStatus,fontFailures:metadata.fontFailures,imageFailures:metadata.imageFailures,
          scope:metadata.scope,nodeIds:metadata.nodeIds,capabilityRevoked:metadata.capabilityRevoked,
          runtime:metadata.runtime,region:metadata.region,viewport:metadata.viewport,documentBounds:metadata.documentBounds,
        },
      }, details:{action:'export.get',exportId:item.export?.id}};
    })});
  }

  if(input.action?.startsWith('schema.')&&value?.saved)return modelSafe({saved:true,page:modelPage(value.page),projectRevision:value.projectRevision,sourcePath:value.sourcePath,sourceHash:value.sourceHash,sourceVersion:value.version,compilerVersion:value.compilerVersion,binding:value.binding,sceneIds:value.sceneIds,compiledBytes:value.compiledBytes,definitionBytes:value.definitionBytes,diagnostics:value.diagnostics,previewStatus:value.previewStatus,interactionVerification:value.interactionVerification});

  const board = value?.artboard;
  const initialPage = board && !board.artifact && board.revision === 1 && !board.scene && !board.entry
    && Boolean(board.initialTemplateHash) && board.contentHash === board.initialTemplateHash;
  if (compact && input.action === 'artboard.get' && (board?.artifact?.kind === 'schema' || initialPage) && input.view !== 'full') {
    const {artboard,html,...receipt} = value;
    return modelSafe({...receipt,artboard:pageIdentity(artboard),
      ...(input.view === 'source' ? sourceExcerpt(html,input) : {
        ...(initialPage ? {status:'initial-page',save:{tool:'designer_commit_html',artboardId:artboard.id,expectedRevision:receipt.projectRevision}} : {source:{action:'schema.read',pageId:artboard.id}}),
        htmlCharacters:html.length,
        renderedSource:{action:'edit.read',pageId:artboard.id,view:'source'},
      }),
    });
  }

  const documentAction = /^edit\./.test(input.action) || ['file.write', 'artboard.commit'].includes(input.action);
  if (documentAction && value?.document) {
    const read = ['edit.read', 'edit.inspect'].includes(input.action);
    const allNodes = Object.values(value.document.nodes || {});
    let nodes = input.nodeIds ? allNodes.filter(node => input.nodeIds.includes(node.id)) : allNodes;
    if (read && typeof input.query === 'string' && input.query.trim()) {
      const query = input.query.trim().toLowerCase();
      nodes = nodes.filter(node => [node.id, node.attributes?.id, node.attributes?.['aria-label'], node.tag,
        // Leaf text avoids repeating a whole page's matches on its ancestors.
        node.childIds?.length ? '' : node.text].some(value => typeof value === 'string' && value.toLowerCase().includes(query)));
    }
    const offset = Math.max(0, Number.isSafeInteger(input.nodeOffset) ? input.nodeOffset : 0);
    const summary = compact && read && input.view !== 'nodes' && !input.nodeIds;
    const defaultLimit = compact ? (read ? (summary && !input.query ? 12 : 40) : 0) : 60;
    const limit = Math.min(100, Math.max(0, Number.isSafeInteger(input.nodeLimit) ? input.nodeLimit : defaultLimit));
    const receipt = {
      projectRevision: value.projectRevision,
      page: compact && read ? pageIdentity(value.page) : modelPage(value.page),
      artboard: compact && read ? {id:value.page?.id,revision:value.page?.revision} : modelPage(value.artboard ?? value.page),
      file: compact && read && value.file ? {id:value.file.id,path:value.file.path,readonly:value.file.readonly} : value.file,
      version: value.version,
      sourceHash: value.sourceHash,
      changes: value.changes,
      diagnostics: value.diagnostics || value.document.diagnostics,
      sceneCount: value.document.scenes?.items?.length || 0,
      interactionCount: value.document.interactions?.length || 0,
      saved: value.saved,
      previewStatus: value.previewStatus,
      interactionVerification: value.interactionVerification,
      systemUsage: value.systemUsage,
      receiptWarning: value.receiptWarning,
    };
    if (read && input.view === 'source') {
      return modelSafe({...receipt,...sourceExcerpt(value.document.html,input)});
    }
    const summaries = nodes.slice(offset, offset + limit).map(node => {
      if (summary) {
        return {
          id: node.id,
          tag: node.tag,
          htmlId: node.attributes?.id,
          parentId: node.parentId,
          childCount: node.childIds?.length,
          text: node.childIds?.length ? undefined : bounded(node.text, 160),
        };
      }
      return {...node, text: bounded(node.text, 160), ...(node.text?.length > 160 ? {textTruncated: true} : {})};
    });
    return modelSafe({
      ...receipt,
      nodes: summaries,
      nodeOffset: offset,
      nodeTotal: nodes.length,
      nextNodeOffset: limit && offset + limit < nodes.length ? offset + limit : null,
      ...(read ? {scenes: value.document.scenes, interactions: value.document.interactions} : {}),
      more: {
        action: 'edit.read',
        pageId: value.page?.id,
        fileId: value.file?.id,
        view: summary ? 'summary' : 'nodes',
        nodeOffset: offset + limit,
        nodeLimit: limit || 40,
        ...(input.nodeIds ? {nodeIds:input.nodeIds} : {}),
        ...(input.query ? {query:input.query} : {}),
      },
    });
  }

  if (compact && value?.project) {
    const {project, ...result} = value;
    const workbench = project.workbench || {};
    const summary = {
      id: project.id,
      name: project.name,
      description: project.description,
      revision: project.revision,
      aiSessionId: project.aiSessionId,
      artboards: project.artboards?.map(input.action === 'project.get' && input.view !== 'full' ? pageIdentity : modelPage),
      systemId: project.systemId,
      systemVersion: project.systemVersion,
      skillNames: project.skillNames,
      historyTotal: project.history?.length || 0,
      workbench: {
        schemaVersion: workbench.schemaVersion,
        goal: workbench.goal,
        requirementsPath: workbench.requirementsPath,
        rulesPath: workbench.rulesPath,
        designs: workbench.designs,
        ...(input.action === 'project.get' && input.view !== 'full'
          ? {fileCount:workbench.files?.length,filesRequest:{action:'file.tree'}}
          : {files:workbench.files}),
        sourceProjects: workbench.sourceProjects,
      },
    };
    if (input.action === 'project.get') {
      const rows = result.history || project.history || [];
      const offset = input.historyOffset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 200) fail('INVALID_INPUT','historyOffset must be between 0 and 200');
      return modelSafe({
        ...result,
        project: summary,
        artboards: input.view === 'full' ? result.artboards : summary.artboards,
        history: rows.slice(offset, offset + 10),
        historyOffset: offset,
        historyTotal: rows.length,
      });
    }
    const {history, ...receipt} = result;
    const includeProject = ['workspace.open', 'project.open'].includes(input.action);
    return modelSafe({
      ...receipt,
      ...(receipt.artboard?.artifact?.kind === 'schema' ? {artboard:modelPage(receipt.artboard)} : {}),
      ...(includeProject ? {project: summary} : {}),
      projectId: project.id,
      projectRevision: value.projectRevision ?? project.revision,
    });
  }
  return modelSafe(value);
}
