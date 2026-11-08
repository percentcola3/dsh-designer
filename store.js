import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export class DesignerError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'DesignerError'; this.code = code; this.details = details; }
}
export function fail(code, message, details) { throw new DesignerError(code, message, details); }
export function text(value, label, max = 200, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail('INVALID_INPUT', `${label} must be ${empty ? 'a' : 'a nonempty'} string of at most ${max} characters`);
  return value;
}
function id(value) { if (typeof value !== 'string' || !/^[a-z]-[a-zA-Z0-9-]{1,80}$/.test(value)) fail('INVALID_ID', 'Invalid designer identifier'); return value; }
function platform(value = 'web') { if (!['web', 'mobile'].includes(value)) fail('INVALID_INPUT', 'platform must be web or mobile'); return value; }
function revision(value, current) { if (!Number.isSafeInteger(value) || value !== current) fail('VERSION_CONFLICT', 'The project changed. Reload before saving.', { expectedRevision: value ?? null, currentRevision: current }); }
function vector(value, fallback, keys, bounds) {
  if (value === undefined) return fallback;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', 'Invalid canvas geometry');
  const result = { ...fallback };
  for (const key of keys) if (value[key] !== undefined) {
    if (!Number.isFinite(value[key]) || value[key] < bounds[key][0] || value[key] > bounds[key][1]) fail('INVALID_INPUT', `Invalid ${key}`);
    result[key] = value[key];
  }
  return result;
}
const position = (v, fallback = { x: 0, y: 0 }) => vector(v, fallback, ['x','y'], { x:[-1000000,1000000], y:[-1000000,1000000] });
const viewport = (v, fallback) => vector(v, fallback, ['width','height'], { width:[100,10000], height:[100,20000] });
const canvas = (v, fallback = { x:0,y:0,zoom:1 }) => vector(v, fallback, ['x','y','zoom'], { x:[-1000000,1000000],y:[-1000000,1000000],zoom:[0.05,4] });
export async function policyAllowsTarget(fs,policy,target,signal){
  if(!policy||policy.mode==='read-only')return false;
  if(policy.mode==='danger-full-access')return true;
  for(const directory of [policy.workspaceRoot,...(policy.additionalWritableRoots||[])])if(directory&&fs.contains(await fs.resolve(directory,{signal}),target))return true;
  return false;
}
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${randomUUID()}`;
const clone = value => JSON.parse(JSON.stringify(value));
const contentHash = value => createHash('sha256').update(value).digest('hex');
const recordObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Only failures attributable to one saved entry may become an unavailable row.
// Policy denials, cancellation, unknown failures, and directory/index failures stay fatal.
const ITEM_UNAVAILABLE_CODES = new Set(['INVALID_DOCUMENT','INVALID_ID','NOT_FOUND','VERSION_CONFLICT','PROJECT_LOCATION_UNAVAILABLE','PROJECT_SCOPE','PATH_OUTSIDE_WORKSPACE','FS_NOT_FOUND','FS_NOT_REGULAR_FILE','FS_NOT_TEXT','FS_BINARY_FILE','FS_INVALID_UTF8','FS_TOO_LARGE','FS_STALE_VERSION','FS_PERMISSION_DENIED','ENOENT','ENOTDIR','EISDIR','EACCES','EPERM','ELOOP','ENODEV','ESTALE','EIO']);
function json(value, max = 2_000_000) { const result = JSON.stringify(value, null, 2); if (Buffer.byteLength(result) > max) fail('TOO_LARGE', 'Designer document is too large'); return result; }
function html(value) { text(value, 'html', 2_000_000); if (Buffer.byteLength(value) > 2_000_000) fail('TOO_LARGE','HTML exceeds 2 MB'); if (!/<(?:!doctype\s+html|html|body|main|section|div|header|article)\b/i.test(value)) fail('INVALID_HTML', 'Provide an HTML document or markup with a root element'); return value; }
function platforms(value = ['web','mobile']) { if (!Array.isArray(value) || !value.length || value.length > 2) fail('INVALID_INPUT', 'platforms must include web and/or mobile'); return [...new Set(value.map(platform))]; }
function tokens(value = {}) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', 'tokens must be an object'); json(value, 200000); return clone(value); }

/** Every I/O goes through the composed DSH provider; never imports node:fs. */
export class DesignerStore {
  constructor({ fs, workspaceRoot, root, policy }) {
    this.fs = fs; this.workspaceRoot = path.resolve(workspaceRoot); this.policy = policy;
    const selected = root || 'DesignerLibrary';
    if (typeof selected !== 'string' || selected.includes('\0') || (!path.isAbsolute(selected) && selected.split(/[\\/]/).includes('..'))) fail('PATH_OUTSIDE_WORKSPACE','A relative library path cannot traverse parent directories');
    this.root = path.resolve(this.workspaceRoot,selected);
    this.projectLocations = new Map(); this.locationLoad = null; this.locationQueue = Promise.resolve();
  }
  async loadProjectLocations(signal) {
    signal?.throwIfAborted();
    if(this.locationLoad)return this.locationLoad;
    this.locationLoad=(async()=>{
      const record=await this.read('.workbench/project-locations.json',signal,true);
      if(!record)return;
      const indexDetails={relative:'.workbench/project-locations.json',document:'project-locations'};
      let data;try{data=JSON.parse(record.content);}catch{fail('INVALID_DOCUMENT','Project location index is malformed',indexDetails);}
      if(!recordObject(data)||data.schemaVersion!==1||!Array.isArray(data.locations)||data.locations.length>1000)fail('INVALID_DOCUMENT','Invalid project location index',indexDetails);
      const next=new Map();for(const [entryIndex,entry] of data.locations.entries()){if(!recordObject(entry)||typeof entry.projectId!=='string'||!/^[a-z]-[a-zA-Z0-9-]{1,80}$/.test(entry.projectId)||typeof entry.root!=='string'||!path.isAbsolute(entry.root)||entry.root.includes('\0')||next.has(entry.projectId))fail('INVALID_DOCUMENT','Invalid registered project root',{...indexDetails,entryIndex});next.set(entry.projectId,path.resolve(entry.root));}
      this.projectLocations=next;
    })();
    try{await this.locationLoad;}catch(error){this.locationLoad=null;throw error;}
  }
  async projectPhysicalRoot(projectId,signal){id(projectId);await this.loadProjectLocations(signal);return this.projectLocations.get(projectId)||path.join(this.root,'projects',projectId);}
  async registerProjectLocation(projectId,location,{signal,policy=this.policy(),user=false,asParent=false}={}){
    if(!user)fail('USER_ONLY','Only the user can register a project save location');
    const operation=async()=>{
      id(projectId);await this.loadProjectLocations(signal);text(location,'location',4096);
      if(!path.isAbsolute(location))fail('INVALID_PATH','Choose an absolute save location');
      const record=await this.projectRecord(projectId,signal),p=record.value;
      let destination=path.resolve(location);
      if(asParent){const slug=p.name.normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/^\.+|[. ]+$/g,'').slice(0,70)||'project';destination=path.join(destination,`${slug}-${projectId}`);}
      const existing=this.projectLocations.get(projectId);if(existing){const canonicalDestination=this.fs.processPath(await this.fs.resolve(destination,{signal}));if(existing!==canonicalDestination)fail('PROJECT_LOCATION_FIXED','Moving an existing project requires an explicit migration');return {root:existing,registered:true};}
      if(p.artboards.length||(p.imports||[]).length||p.workbench?.initializedAt)fail('PROJECT_NOT_EMPTY','Save location registration is limited to a new empty project');
      const sourceRoot=await this.target(`projects/${projectId}`,signal),sourceEntries=await this.fs.listDir(sourceRoot,signal);
      if(sourceEntries.some(entry=>entry.name!=='project.json'))fail('PROJECT_NOT_EMPTY','The new project already contains files');
      const target=await this.fs.resolve(destination,{signal});destination=this.fs.processPath(target);
      if(!await policyAllowsTarget(this.fs,policy,target,signal))fail('FS_SANDBOX_DENIED','The selected project save location is outside the writable scope');
      const before=await this.fs.stat(target,signal);
      if(before&&(before.type!=='directory'||(await this.fs.listDir(target,signal)).length))fail('LOCATION_NOT_EMPTY','Choose a new or empty project directory; existing files are preserved');
      if(path.resolve(this.fs.processPath(sourceRoot))===destination)return {root:destination,registered:false};
      const output=await this.fs.resolve(path.join(destination,'project.json'),{signal});if(!this.fs.contains(target,output))fail('PROJECT_SCOPE','Project metadata leaves its save location');
      await this.fs.writeText(output,record.content,{kind:'createIfAbsent'},signal,policy);
      if((await this.fs.stat(record.target,signal))?.version!==record.version)fail('VERSION_CONFLICT','Project changed during save location registration');
      const index=await this.read('.workbench/project-locations.json',signal,true),locations=[...this.projectLocations].map(([projectId,root])=>({projectId,root}));locations.push({projectId,root:destination});
      await this.write('.workbench/project-locations.json',json({schemaVersion:1,locations}),index?.version,signal,policy);
      this.projectLocations.set(projectId,destination);
      return {root:destination,registered:true};
    };
    const pending=this.locationQueue.then(operation);this.locationQueue=pending.catch(()=>{});return pending;
  }
  async target(relative = '', signal) {
    if (typeof relative !== 'string' || relative.includes('\0') || relative.split(/[\\/]/).includes('..') || path.isAbsolute(relative)) fail('INVALID_PATH', 'Invalid library path');
    const projectPath=/^projects\/([a-z]-[a-zA-Z0-9-]{1,80})(?:\/(.*))?$/.exec(relative);
    if(projectPath){
      await this.loadProjectLocations(signal);
      const registered=this.projectLocations.get(projectPath[1]);
      const selected=registered||path.join(this.root,'projects',projectPath[1]);
      const projectRoot=await this.fs.resolve(selected,{signal});
      if(!registered){const libraryRoot=await this.fs.resolve(this.root,{signal});const expectedRoot=path.join(this.fs.processPath(libraryRoot),'projects',projectPath[1]);if(this.fs.processPath(projectRoot)!==expectedRoot)fail('PROJECT_SCOPE','An unregistered project root cannot alias another directory');}
      const target=await this.fs.resolve(path.join(selected,projectPath[2]||''),{signal});
      if(!registered&&!this.fs.contains(await this.fs.resolve(this.root,{signal}),target))fail('PATH_OUTSIDE_WORKSPACE','Canonical path leaves the selected designer library');
      if(!this.fs.contains(projectRoot,target))fail('PROJECT_SCOPE','Canonical path leaves its project');
      // Registered roots are user-owned save locations; writes still use each call policy.
      return target;
    }
    const root = await this.fs.resolve(this.root, { signal });
    const target = await this.fs.resolve(path.join(this.root, relative), { signal });
    if (!this.fs.contains(root, target)) fail('PATH_OUTSIDE_WORKSPACE', 'Canonical path leaves the selected designer library');
    return target;
  }
  async read(relative, signal, optional = false) {
    const target = await this.target(relative, signal);
    const before = await this.fs.stat(target, signal);
    if (!before) { if (optional) return null; fail('NOT_FOUND', 'Designer document was not found', { relative }); }
    if (before.type !== 'file' || (before.size || 0) > 4_000_000) fail('INVALID_DOCUMENT', 'Designer document is not a bounded regular file');
    const content = await this.fs.readText(target, signal);
    const after = await this.fs.stat(target, signal);
    if (after?.version !== before.version) fail('VERSION_CONFLICT', 'Document changed during read; retry');
    return { target, content, version: before.version };
  }
  async readJSON(relative, signal) {
    const record = await this.read(relative, signal);
    try { return { ...record, value: JSON.parse(record.content) }; } catch { fail('INVALID_DOCUMENT', 'Malformed designer JSON', { relative }); }
  }
  async write(relative, content, previous, signal, policy) {
    const target = await this.target(relative, signal);
    try { return await this.fs.writeText(target, content, previous ? { kind:'replaceIfVersion', version:previous } : { kind:'createIfAbsent' }, signal, policy || this.policy()); }
    catch (error) { if (['FS_STALE_VERSION','FS_ALREADY_EXISTS','FS_NOT_OBSERVED'].includes(error.code)) fail('VERSION_CONFLICT', 'Document changed. Reload before saving.'); throw error; }
  }
  async listDirectories(relative, signal) {
    const target = await this.target(relative, signal);
    if (!await this.fs.stat(target, signal)) return [];
    return (await this.fs.listDir(target, signal)).filter(entry => entry.type === 'directory' && /^[a-z]-[a-zA-Z0-9-]{1,80}$/.test(entry.name));
  }
  async groupRecord(groupId,signal) {
    const record = await this.readJSON(`groups/${id(groupId)}/group.json`,signal);
    if (!recordObject(record.value) || record.value.id !== groupId || record.value.schemaVersion !== 1 || !Number.isSafeInteger(record.value.revision)) fail('INVALID_DOCUMENT','Invalid project group');
    return record;
  }
  unavailableItem(kind,identifier,error,signal) {
    signal?.throwIfAborted();
    if (error?.name==='AbortError'||error?.code==='ABORT_ERR'||!ITEM_UNAVAILABLE_CODES.has(error?.code)) throw error;
    const common={schemaVersion:1,id:identifier,name:`Unavailable ${kind}`,revision:0,updatedAt:'',unavailable:true,error:{code:error.code,message:String(error.message||'Saved metadata is unavailable').slice(0,1000)}};
    if(kind==='project')return {...common,groupId:null,platform:'web',archived:false,deletedAt:null,artboards:[],history:[]};
    if(kind==='system')return {...common,description:'',platforms:[],archived:false};
    return {...common,deletedAt:null};
  }
  validateSummary(kind,identifier,value) {
    if(!recordObject(value)||value.id!==identifier||value.schemaVersion!==1||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.name!=='string'||!value.name.trim())fail('INVALID_DOCUMENT',`Invalid ${kind} metadata`,{id:identifier});
    if(kind==='project'&&(!Array.isArray(value.artboards)||typeof value.updatedAt!=='string'||value.artboards.some(board=>!recordObject(board)||typeof board.id!=='string')))fail('INVALID_DOCUMENT','Invalid project summary metadata',{id:identifier});
    if(kind==='system'&&(!Array.isArray(value.platforms)||value.platforms.some(p=>!['web','mobile'].includes(p))||!Array.isArray(value.versions)||typeof value.updatedAt!=='string'))fail('INVALID_DOCUMENT','Invalid design system summary metadata',{id:identifier});
    return value;
  }
  async groups(signal) {
    signal?.throwIfAborted();const groups = [];
    for (const entry of await this.listDirectories('groups',signal)) {
      signal?.throwIfAborted();
      try {const {value:group} = await this.groupRecord(entry.name,signal);this.validateSummary('group',entry.name,group);if (!group.deletedAt) groups.push(group);}
      catch(error){groups.push(this.unavailableItem('group',entry.name,error,signal));}
    }
    return groups.sort((a,b) => a.name.localeCompare(b.name));
  }
  async groupId(value,signal) {
    if (value === null || value === undefined) return null;
    const {value:group} = await this.groupRecord(value,signal);
    if (group.deletedAt) fail('GROUP_DELETED','This project group has been deleted');
    return group.id;
  }
  async normalizeProject(project,signal,activeGroups) {
    let groupId = project.groupId ?? null;
    if (groupId) {
      if (activeGroups) groupId = activeGroups.has(groupId) ? groupId : null;
      else {
        try {
          const record = await this.read(`groups/${id(groupId)}/group.json`,signal,true);
          if(!record)groupId=null;
          else {let group;try{group=JSON.parse(record.content);}catch{fail('INVALID_DOCUMENT','Malformed project group metadata',{groupId});}if(!recordObject(group)||group.id!==groupId||group.schemaVersion!==1)fail('INVALID_DOCUMENT','Invalid project group metadata',{groupId});if(group.deletedAt)groupId=null;}
        } catch(error) {
          // Preserve membership when a group is temporarily unreadable; state.groups
          // carries the unavailable row. A broken group must not block a valid project.
          this.unavailableItem('group',groupId,error,signal);
        }
      }
    }
    return {...project,groupId,deletedAt:project.deletedAt ?? null,imports:project.imports ?? []};
  }
  async groupCreate(input,signal,policy) {
    const stamp = now();
    const group = {schemaVersion:1,id:uid('g'),name:text(input.name,'name'),revision:1,deletedAt:null,createdAt:stamp,updatedAt:stamp};
    await this.write(`groups/${group.id}/group.json`,json(group),null,signal,policy);
    return group;
  }
  async groupUpdate(input,signal,policy,deleted = false) {
    const record = await this.groupRecord(input.groupId,signal);
    const group = record.value; revision(input.expectedRevision,group.revision);
    if (group.deletedAt) fail('GROUP_DELETED','This project group has been deleted');
    if (deleted) group.deletedAt = now(); else group.name = text(input.name,'name');
    group.revision++; group.updatedAt = now();
    await this.write(`groups/${group.id}/group.json`,json(group),record.version,signal,policy);
    return group;
  }
  async state(signal) {
    signal?.throwIfAborted();
    // The location index and top-level directory observations are shared foundations;
    // their failures are never converted into individual unavailable entries.
    await this.loadProjectLocations(signal);
    const groups = await this.groups(signal),errors=[];
    for(const group of groups)if(group.unavailable)errors.push({kind:'group',id:group.id,relative:`groups/${group.id}/group.json`,error:group.error});
    const activeGroups = new Set(groups.map(g => g.id));
    const projects = [],projectNames=new Set([...(await this.listDirectories('projects',signal)).map(entry=>entry.name),...this.projectLocations.keys()]);
    for (const name of projectNames) {
      signal?.throwIfAborted();const relative=`projects/${name}/project.json`;
      try {
        const record=await this.projectRecord(name,signal),p=await this.normalizeProject(this.validateSummary('project',name,record.value),signal,activeGroups),{history,...summary}=p;
        projects.push({...summary,artboards:p.artboards.map(a=>({...a}))});
      } catch(error) {
        if(this.projectLocations.has(name)&&['NOT_FOUND','FS_NOT_FOUND','ENOENT','ENOTDIR'].includes(error.code))error=new DesignerError('PROJECT_LOCATION_UNAVAILABLE','The registered project save location is unavailable.',{cause:error.code});
        const unavailable=this.unavailableItem('project',name,error,signal);projects.push(unavailable);errors.push({kind:'project',id:name,relative,error:unavailable.error});
      }
    }
    const systems = [];
    for (const entry of await this.listDirectories('systems', signal)) {
      signal?.throwIfAborted();const relative=`systems/${entry.name}/system.json`;
      try {const record=await this.readJSON(relative,signal),s=this.validateSummary('system',entry.name,record.value);systems.push({id:s.id,name:s.name,description:s.description,platforms:s.platforms,archived:s.archived||false,revision:s.revision,updatedAt:s.updatedAt});}
      catch(error){const unavailable=this.unavailableItem('system',entry.name,error,signal);systems.push(unavailable);errors.push({kind:'system',id:entry.name,relative,error:unavailable.error});}
    }
    projects.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    return { root:this.root, workspaceRoot:this.workspaceRoot,groups,projects,systems,errors };
  }
  async projectRecord(projectId, signal) {
    const record = await this.readJSON(`projects/${id(projectId)}/project.json`, signal);
    if (!recordObject(record.value) || record.value.id !== projectId || record.value.schemaVersion !== 1 || !Array.isArray(record.value.artboards) || (record.value.aiSessionId && record.value.aiSessionId !== `designer-${projectId}` && !/^designer-compose-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.value.aiSessionId))) fail('INVALID_DOCUMENT', 'Invalid project document or AI context binding');
    record.value = await this.normalizeProject(record.value,signal);
    return record;
  }
  async projectGet(projectId, signal) { const { value:project } = await this.projectRecord(projectId, signal); return { project,artboards:project.artboards,history:project.history }; }
  async projectCreate(input, signal, policy) {
    const stamp = now();
    const groupId = await this.groupId(input.groupId,signal);
    const project = { schemaVersion:1,id:uid('p'),revision:1,groupId,deletedAt:null,name:text(input.name,'name'),description:text(input.description ?? '','description',4000,true),platform:platform(input.platform),skillNames:[],skillContextSessionId:input.skillContextSessionId || null,systemId:null,systemVersion:null,canvas:canvas(),artboards:[],history:[],aiSessionId:null,archived:false,createdAt:stamp,updatedAt:stamp };
    await this.write(`projects/${project.id}/project.json`, json(project), null, signal, policy);
    return project;
  }
  async mutate(projectId, expectedRevision, summary, change, signal, policy, snapshot = true, allowDeleted = false, beforePublish) {
    const record = await this.projectRecord(projectId, signal);
    const before = record.value;
    revision(expectedRevision, before.revision);
    if (before.deletedAt && !allowDeleted) fail('PROJECT_DELETED','Restore the project from the recycle bin before changing it');
    const next = clone(before);
    await change(next);
    if (snapshot) {
      const snapshotId = uid('s');
      const state = { ...before,history:[] };
      await this.write(`projects/${before.id}/snapshots/${snapshotId}.json`, json(state), null, signal, policy);
      next.history = [{ id:snapshotId,revision:before.revision,summary:text(summary || 'Update design','summary',500),createdAt:now() },...before.history].slice(0,200);
    }
    await beforePublish?.();
    next.revision = before.revision + 1; next.updatedAt = now();
    await this.write(`projects/${before.id}/project.json`, json(next), record.version, signal, policy);
    return next;
  }
  async projectUpdate(input, signal, policy) {
    return this.mutate(input.projectId,input.expectedRevision,'Update project', async p => {
      for (const [field,max] of [['name',200],['description',4000]]) if (input[field] !== undefined) p[field] = text(input[field],field,max,field === 'description');
      if (input.canvas !== undefined) p.canvas = canvas(input.canvas,p.canvas);
      if (input.groupId !== undefined) p.groupId = await this.groupId(input.groupId,signal);
      if (input.skillNames !== undefined) {
        if (!Array.isArray(input.skillNames) || input.skillNames.length > 20) fail('INVALID_INPUT','Select at most 20 skills');
        p.skillNames = [...new Set(input.skillNames.map(name => text(name,'skill name',120)))];
        if (input.skillContextSessionId) p.skillContextSessionId = text(input.skillContextSessionId,'skill context session',200);
      }
      if (input.systemId !== undefined) {
        if (input.systemId === null || input.systemId === '') { p.systemId = null; p.systemVersion = null; }
        else { const s = await this.systemGet(input.systemId,signal); p.systemId = s.id; p.systemVersion = input.systemVersion ?? s.revision; if (!s.versions.some(v => v.version === p.systemVersion)) fail('NOT_FOUND','Design system version was not found'); }
      } else if (input.systemVersion !== undefined) {
        if (!p.systemId) fail('INVALID_INPUT','Select a design system first');
        const s = await this.systemGet(p.systemId,signal); if (!s.versions.some(v => v.version === input.systemVersion)) fail('NOT_FOUND','Design system version was not found'); p.systemVersion = input.systemVersion;
      }
    },signal,policy,false);
  }
  async projectArchive(input,signal,policy) { return this.mutate(input.projectId,input.expectedRevision,'Archive project', p => { p.archived = input.archived !== false; },signal,policy,false); }
  async projectDelete(input,signal,policy,restore = false) {
    return this.mutate(input.projectId,input.expectedRevision,restore ? 'Restore project' : 'Delete project',p => {p.deletedAt = restore ? null : p.deletedAt || now();if(restore)p.archived = false;},signal,policy,false,true);
  }
  board(project,artboardId) { const board = project.artboards.find(a => a.id === id(artboardId)); if (!board) fail('NOT_FOUND','Artboard was not found'); return board; }
  async artboardGet(projectId,artboardId,signal) {
    const { value:p } = await this.projectRecord(projectId,signal); const board = this.board(p,artboardId);
    const record = await this.read(`projects/${p.id}/${board.htmlPath}`,signal);
    if (board.contentHash && contentHash(record.content) !== board.contentHash) fail('VERSION_CONFLICT','The stored HTML was modified outside Designer; its saved content hash no longer matches');
    return { artboard:board,html:record.content,projectRevision:p.revision };
  }
  async artboardCreate(input,signal,policy) {
    let board;
    const project = await this.mutate(input.projectId,input.expectedRevision,'Create artboard', async p => {
      if (p.artboards.length >= 100) fail('LIMIT_REACHED','A project supports up to 100 artboards');
      const kind = platform(input.platform ?? p.platform); const stamp = now(); const boardId = uid('a');
      board = { id:boardId,name:text(input.name,'name'),platform:kind,revision:1,position:position(input.position,{x:p.artboards.length * (kind === 'mobile' ? 440:1520),y:0}),viewport:viewport(input.viewport,{width:kind === 'mobile' ? 390:1440,height:kind === 'mobile' ? 844:1000}),htmlPath:`html/${uid('h')}.html`,createdAt:stamp,updatedAt:stamp };
      const content = input.html === undefined ? '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>' : html(input.html);
      board.contentHash = contentHash(content);
      await this.write(`projects/${p.id}/${board.htmlPath}`,content,null,signal,policy); p.artboards.push(board);
    },signal,policy);
    return { project,artboard:board,projectRevision:project.revision };
  }
  async artboardCommit(input,signal,policy) {
    const content = html(input.html); let board;
    const project = await this.mutate(input.projectId,input.expectedRevision,input.summary || 'Save HTML',async p => {
      board = this.board(p,input.artboardId);
      if (input.expectedArtboardRevision !== undefined) revision(input.expectedArtboardRevision,board.revision);
      if (input.name !== undefined) board.name = text(input.name,'name');
      board.position = position(input.position,board.position); board.viewport = viewport(input.viewport,board.viewport);
      const basis = await this.read(`projects/${p.id}/${board.htmlPath}`,signal);
      if (board.contentHash && contentHash(basis.content) !== board.contentHash) fail('VERSION_CONFLICT','The HTML changed outside Designer. Reload and import the external changes before replacing it.');
      board.htmlPath = `html/${uid('h')}.html`; board.contentHash = contentHash(content); board.revision++; board.updatedAt = now();
      await this.write(`projects/${p.id}/${board.htmlPath}`,content,null,signal,policy);
    },signal,policy);
    return { project,artboard:board,projectRevision:project.revision };
  }
  async importCommit(input,signal,policy) {
    const imported=clone(input.record);id(imported.id);
    if(!imported.id.startsWith('i-')||!['website','figma','mastergo'].includes(imported.kind)||imported.manifestPath!==`imports/${imported.id}/manifest.json`)fail('INVALID_IMPORT','Invalid source import');
    const manifest=await this.readJSON(`projects/${id(input.projectId)}/${imported.manifestPath}`,signal);
    if(manifest.value.importId!==imported.id)fail('INVALID_IMPORT','Source manifest does not match');
    let board;const content=input.html===undefined?undefined:html(input.html);
    const project=await this.mutate(input.projectId,input.expectedRevision,'Import '+imported.kind,async p=>{
      if(p.archived)fail('PROJECT_ARCHIVED','Restore the project before importing');
      p.imports ||= [];if(p.imports.some(r=>r.id===imported.id))fail('IMPORT_EXISTS','Source was already imported');
      if(p.imports.length>=100)fail('LIMIT_REACHED','A project supports up to 100 source imports');
      if(content!==undefined){
        if(p.artboards.length>=100)fail('LIMIT_REACHED','A project supports up to 100 artboards');
        const stamp=now(),kind=platform(input.platform ?? (imported.width<768?'mobile':'web'));
        board={id:uid('a'),name:text(input.name||imported.title||'Imported design','name'),platform:kind,revision:1,position:position(undefined,{x:p.artboards.length*(kind==='mobile'?440:1520),y:0}),viewport:viewport({width:Math.max(100,Math.min(10000,imported.width||1440)),height:Math.max(100,Math.min(20000,imported.height||1000))}),htmlPath:`html/${uid('h')}.html`,contentHash:contentHash(content),importId:imported.id,createdAt:stamp,updatedAt:stamp};
        await this.write(`projects/${p.id}/${board.htmlPath}`,content,null,signal,policy);p.artboards.push(board);imported.artboardId=board.id;
      }
      p.imports.unshift({...imported,createdAt:now()});
    },signal,policy,content!==undefined);
    return {project,record:project.imports[0],...(board?{artboard:board}:{}),projectRevision:project.revision};
  }
  async importGet(projectId,importId,signal) {
    const {value:p}=await this.projectRecord(projectId,signal);id(importId);
    const record=p.imports.find(r=>r.id===importId);if(!record)fail('NOT_FOUND','Imported source was not found in this project');
    const saved=await this.readJSON(`projects/${p.id}/imports/${importId}/manifest.json`,signal);const manifest=saved.value;
    if(manifest.schemaVersion!==1||manifest.importId!==importId||!Array.isArray(manifest.resources)||!Array.isArray(manifest.failures))fail('INVALID_IMPORT','The source manifest identity is invalid');
    if(record.manifestHash&&contentHash(saved.content)!==record.manifestHash)fail('VERSION_CONFLICT','The source manifest changed outside Designer');
    return {record,manifest,projectRevision:p.revision};
  }
  async importContext(projectId,importId,{offset=0,limit=20000}={},signal) {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>30000)fail('INVALID_INPUT','Context offset/limit is invalid');
    const {record,manifest}=await this.importGet(projectId,importId,signal);
    const context=record.contextPath?await this.read(`projects/${id(projectId)}/imports/${id(importId)}/context.json`,signal):null;
    if(context&&record.contextHash&&contentHash(context.content)!==record.contextHash)fail('VERSION_CONFLICT','The design context changed outside Designer');
    const content=context?.content||'';return {record,text:content.slice(offset,offset+limit),offset,total:content.length,nextOffset:offset+limit<content.length?offset+limit:null,assets:manifest.resources.slice(0,100).map(r=>({path:r.path,mimeType:r.mimeType,url:r.url})),assetTotal:manifest.resources.length};
  }
  async artboardLayout(input,signal,policy) {
    let board;
    const project = await this.mutate(input.projectId,input.expectedRevision,'Move artboard',p => { board = this.board(p,input.artboardId); board.position = position(input.position,board.position); board.viewport = viewport(input.viewport,board.viewport); if (input.name !== undefined) board.name = text(input.name,'name'); board.updatedAt = now(); },signal,policy,false);
    return { project,artboard:board,projectRevision:project.revision };
  }
  async snapshotRestore(input,signal,policy) {
    id(input.projectId); id(input.snapshotId);
    const observations=new Map(),verifyVersions=async()=>{for(const [relative,seen]of observations){const current=await this.fs.stat(seen.target,signal);if(current?.version!==seen.version)fail('VERSION_CONFLICT','Source changed while restoring content',{path:relative,expectedVersion:seen.version,actualVersion:current?.version});}};
    const restored=await this.mutate(input.projectId,input.expectedRevision,'Restore snapshot',async p => {
      if (!p.history.some(s => s.id === input.snapshotId)) fail('NOT_FOUND','Snapshot is not in project history');
      const { value:old } = await this.readJSON(`projects/${p.id}/snapshots/${input.snapshotId}.json`,signal);
      if (old.id !== p.id || old.schemaVersion !== 1 || !Array.isArray(old.artboards)) fail('INVALID_DOCUMENT','Invalid snapshot');
      const verify=async(file,force=false)=>{if(!file.path||!file.sha256&&!force)return;const relative=`projects/${p.id}/${file.path}`,target=await this.target(relative,signal),before=await this.fs.stat(target,signal);if(!before||before.type!=='file')fail('VERSION_CONFLICT','Referenced content is unavailable',{path:file.path});const bytes=await this.fs.readBytes(target,signal,64*1024*1024);if((await this.fs.stat(target,signal))?.version!==before.version||file.sha256&&contentHash(bytes)!==file.sha256)fail('VERSION_CONFLICT','Source changed outside Designer; reconcile it before restoring content',{path:file.path});const prior=observations.get(relative);if(prior&&prior.version!==before.version)fail('VERSION_CONFLICT','Source changed during restore validation',{path:file.path});observations.set(relative,{target,version:before.version});return bytes;};
      for(const board of p.artboards)if(!board.deletedAt)await verify({path:board.htmlPath,sha256:board.contentHash});
      for(const file of p.workbench?.files||[])if(!file.removedAt)await verify(file);
      const {validateDocument}=await import('./document-model.js');
      for(const board of old.artboards){const bytes=await verify({path:board.htmlPath,sha256:board.contentHash},true);if(board.deletedAt)continue;let validation;try{validation=validateDocument(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{validation={valid:false,diagnostics:[{code:'INVALID_UTF8',severity:'error',message:'Historical page source is not valid UTF-8'}]};}if(!validation.valid)fail('INVALID_DOCUMENT','Historical page has invalid controlled metadata; its raw source remains available',{path:board.htmlPath,snapshotId:input.snapshotId,diagnostics:validation.diagnostics});}
      for(const file of old.workbench?.files||[])if(!file.removedAt)await verify(file);
      const {snapshotContent}=await import('./workspace-service.js'),currentBoards=p.artboards,next=snapshotContent(p,old);Object.assign(p,next);
      for(const board of p.artboards){board.revision=Math.max(board.revision,currentBoards.find(a=>a.id===board.id)?.revision||0)+1;board.updatedAt=now();}
      await verifyVersions();
    },signal,policy,true,false,verifyVersions);
    try{await verifyVersions();}catch(error){error.details={...error.details,committedProjectRevision:restored.revision};throw error;}
    return restored;
  }
  async bindSession(projectId,sessionId,signal,policy,expectedRevision) {
    const { value:p } = await this.projectRecord(projectId,signal);
    if(expectedRevision!==undefined)revision(expectedRevision,p.revision);
    return this.mutate(projectId,p.revision,'Bind AI context',next => { if (next.aiSessionId && next.aiSessionId !== sessionId) fail('SESSION_CONFLICT','Project already has an AI context'); next.aiSessionId = text(sessionId,'session ID',200); },signal,policy,false);
  }
  async systemCreate(input,signal,policy) {
    const stamp = now(); const data = { version:1,tokens:tokens(input.tokens),guidelines:text(input.guidelines ?? '','guidelines',30000,true),summary:'Initial version',createdAt:stamp };
    const system = { schemaVersion:1,id:uid('d'),name:text(input.name,'name'),description:text(input.description ?? '','description',4000,true),platforms:platforms(input.platforms),archived:false,revision:1,versions:[data],createdAt:stamp,updatedAt:stamp };
    await this.write(`systems/${system.id}/system.json`,json(system),null,signal,policy); return system;
  }
  async systemGet(systemId,signal) { const { value:s } = await this.readJSON(`systems/${id(systemId)}/system.json`,signal); if (s.id !== systemId || s.schemaVersion !== 1) fail('INVALID_DOCUMENT','Invalid design system'); return s; }
  async systemSave(input,signal,policy) {
    const record = await this.readJSON(`systems/${id(input.systemId)}/system.json`,signal); const s = record.value; revision(input.expectedRevision,s.revision);
    const previous = s.versions.at(-1); const stamp = now();
    if (input.name !== undefined) s.name = text(input.name,'name');
    if (input.description !== undefined) s.description = text(input.description,'description',4000,true);
    if (input.platforms !== undefined) s.platforms = platforms(input.platforms);
    if (input.archived !== undefined) {if (typeof input.archived !== 'boolean') fail('INVALID_INPUT','archived must be boolean');s.archived = input.archived;}
    if (s.versions.length >= 100) fail('LIMIT_REACHED','A design system supports up to 100 versions');
    s.revision++; s.updatedAt = stamp;
    s.versions.push({...clone(previous),version:s.revision,tokens:tokens(input.tokens ?? previous.tokens),guidelines:text(input.guidelines ?? previous.guidelines,'guidelines',30000,true),summary:text(input.summary || 'Update design system','summary',500),createdAt:stamp});
    await this.write(`systems/${s.id}/system.json`,json(s),record.version,signal,policy); return s;
  }
}
