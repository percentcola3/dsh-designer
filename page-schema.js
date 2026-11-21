import {createHash} from 'node:crypto';
import {fail} from './store.js';

export const PAGE_SCHEMA_VERSION = 1;
export const SCHEMA_COMPILER_VERSION = '1.0.4';
export const schemaHash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const schemaObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeKey = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
const kinds = ['layout','text','image','component','repeat','html'];
const components = ['button','input','textarea','select','switch','checkbox','form','card','dialog','drawer','table','tabs','alert','tag','nav','steps'];
const componentAliases = {'nav-bar':'nav'};
export function schemaComponentRole(name) {
  const role = name.replace(/^ds-/,'');
  return Object.hasOwn(componentAliases,role) ? componentAliases[role] : role;
}
const actionTypes = ['focus','collection.append','sequence','state.set','state.reset','form.submit','form.errors','overlay.open','overlay.close','feedback.show','scene.enter','navigate','back','if','collection.update','collection.remove'];
const actionAliases = {set:'state.set',reset:'state.reset',submit:'form.submit',open:'overlay.open',close:'overlay.close',feedback:'feedback.show',scene:'scene.enter',condition:'if',update:'collection.update',append:'collection.append',remove:'collection.remove'};
const fieldTypes = ['input','textarea','select','switch','checkbox','radio'];

export function schemaPathParts(value) {
  if (typeof value !== 'string' || !value || value.length > 300) fail('SCHEMA_PATH', 'Use a state path with safe identifier segments');
  const parts = value.split('.');
  if (parts.some(part => !safeKey(part) || part.includes(':'))) fail('SCHEMA_PATH', 'State paths cannot contain prototype or malformed segments', {path:value});
  return parts;
}

export function schemaValue(state, path) {
  return schemaPathParts(path).reduce((value, key) => value?.[key], state);
}

export function setSchemaValue(state, path, value) {
  const parts = schemaPathParts(path), leaf = parts.pop();
  let target = state;
  for (const key of parts) {
    if (!schemaObject(target[key])) target[key] = {};
    target = target[key];
  }
  target[leaf] = structuredClone(value);
}

/** JSON input is bounded before tree, binding and action reference validation. */
export function validatePageSchema(input) {
  const diagnostics = [], error = (path, message) => diagnostics.push({code:'SCHEMA_INVALID',severity:'error',path,message});
  let spec;
  try { spec = structuredClone(typeof input === 'string' ? JSON.parse(input) : input); }
  catch { return {valid:false,diagnostics:[{code:'SCHEMA_INVALID',severity:'error',path:'$',message:'Provide a JSON page definition'}]}; }
  if (!schemaObject(spec)) return {valid:false,diagnostics:[{code:'SCHEMA_INVALID',severity:'error',path:'$',message:'The page definition must be an object'}]};
  try {if (JSON.stringify(spec).length > 500000) error('$','A page definition exceeds 500000 characters');}
  catch {return {valid:false,diagnostics:[{code:'SCHEMA_INVALID',severity:'error',path:'$',message:'JSON must not contain cycles or non-JSON values'}]};}
  const scan = (value, path, depth = 0) => {
    if (depth > 40) {error(path,'JSON nesting exceeds 40 levels'); return;}
    if (typeof value === 'number' && !Number.isFinite(value) || value === undefined || typeof value === 'bigint') error(path,'Use finite JSON values');
    if (schemaObject(value)) for (const [key, child] of Object.entries(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) error(path + '.' + key,'Reserved object key');
      if (['ref','bind','model','source','filter'].includes(key) && typeof child === 'string') try {schemaPathParts(child);} catch {error(path + '.' + key,'Use safe identifier paths');}
      scan(child,path + '.' + key,depth + 1);
    }
    else if (Array.isArray(value)) value.forEach((child,index) => scan(child,path + '[' + index + ']',depth + 1));
  };
  scan(spec,'$');
  const topKeys=new Set(['schemaVersion','id','title','root','nodes','state','actions','scenes','css','script','documentOperations']);
  for(const key of Object.keys(spec))if(!topKeys.has(key))error(key,'Unknown page field; read schema.catalog');
  if (spec.schemaVersion !== PAGE_SCHEMA_VERSION) error('schemaVersion','Use schemaVersion 1');
  if (!safeKey(spec.id)) error('id','Use a stable page identifier');
  if (!schemaObject(spec.nodes) || !Object.keys(spec.nodes).length || Object.keys(spec.nodes).length > 1000) error('nodes','Provide 1–1000 keyed nodes');
  if (!schemaObject(spec.state ?? {})) error('state','Initial state must be an object');
  if (!schemaObject(spec.actions ?? {})) error('actions','Actions must be a keyed object');
  if (!schemaObject(spec.scenes ?? {})) error('scenes','Scenes must be a keyed object');
  for (const key of ['title','css','script']) if (spec[key] !== undefined && typeof spec[key] !== 'string') error(key,'Use text');
  if (diagnostics.length) return {valid:false,diagnostics};
  spec.state ??= {}; spec.actions ??= {}; spec.scenes ??= {};
  const ids = new Set(Object.keys(spec.nodes)), actions = new Set(Object.keys(spec.actions));
  const pathAt = (value,at) => {try {schemaPathParts(value);} catch {error(at,'Use a safe state path');}};
  const conditionAt = (value,at) => {
    if (!schemaObject(value)) {error(at,'Use {ref,eq}, {ref,not} or {ref,truthy}');return;}
    pathAt(value.ref,at + '.ref');
    if (Object.keys(value).some(key => !['ref','eq','not','truthy'].includes(key))) error(at,'Unknown condition property');
    if (value.truthy !== undefined && typeof value.truthy !== 'boolean') error(at + '.truthy','Use a boolean');
  };
  const listAt = (value,at,check) => {
    if (!Array.isArray(value) || !value.length) {error(at,'Provide a nonempty array');return;}
    value.forEach((item,index) => {
      if (!schemaObject(item)) error(at + '[' + index + ']','Use an object');
      else check(item,at + '[' + index + ']');
    });
  };
  const optionsAt = (value,at) => listAt(value,at,(option,where) => {
    if (!['string','number','boolean'].includes(typeof option.value) || typeof option.label !== 'string') error(where,'Options require scalar values and visible labels');
  });
  const buttonAt = (button,at) => {
    if (typeof button.text !== 'string' || !actions.has(button.action)) error(at,'Buttons require text and a declared action');
    if (button.id !== undefined && !safeKey(button.id)) error(at + '.id','Use a stable identifier');
  };
  const nativeFieldAt = (field,control,at) => {
    for (const [alias,name] of Object.entries({maxLength:'maxlength',minLength:'minlength',inputMode:'inputmode',autoComplete:'autocomplete'})) {
      if (!Object.hasOwn(field,alias)) continue;
      if (Object.hasOwn(field,name) && field[name] !== field[alias]) error(at+'.'+alias,'Conflicting spellings of '+name);
      else field[name] = field[alias];
      delete field[alias];
    }
    if (field.required !== undefined && typeof field.required !== 'boolean') error(at+'.required','Use true or false');
    for (const name of ['minlength','maxlength']) {
      if (field[name] !== undefined && (!Number.isSafeInteger(field[name]) || field[name] < 0)) error(at+'.'+name,'Use a nonnegative integer');
    }
    if (field.minlength > field.maxlength) error(at+'.maxlength','Maximum length must cover minimum length');
    if (field.autocomplete !== undefined && typeof field.autocomplete !== 'string') error(at+'.autocomplete','Use HTML autocomplete tokens');
    if (field.inputmode !== undefined && !['none','text','decimal','numeric','tel','search','email','url'].includes(field.inputmode)) error(at+'.inputmode','Use an HTML inputmode value');
    if (field.patternMessage !== undefined && typeof field.patternMessage !== 'string') error(at+'.patternMessage','Use a visible validation message');
    if (field.pattern !== undefined) {
      if (control !== 'input' || !['text','tel','url','email','password','search'].includes(field.inputType || 'text')) error(at+'.pattern','HTML pattern applies to text-like inputs');
      else if (typeof field.pattern !== 'string') error(at+'.pattern','Provide an HTML pattern string');
      else try {new RegExp(field.pattern,'v');} catch {error(at+'.pattern','Use a valid HTML Unicode pattern');}
    }
    if ((field.maxlength !== undefined || field.minlength !== undefined) && control !== 'textarea' && !(control === 'input' && ['text','tel','url','email','password','search'].includes(field.inputType || 'text'))) {
      error(at,'HTML minlength and maxlength apply to text-like inputs and textareas');
    }
  };
  if (!ids.has(spec.root)) error('root','Root must name an existing node');
  for (const [id,node] of Object.entries(spec.nodes)) {
    const at = 'nodes.' + id;
    if (!safeKey(id) || id.startsWith('schema-')) error(at,'Node IDs must be stable identifiers without the reserved schema- prefix');
    if (!schemaObject(node) || !kinds.includes(node.kind)) {error(at,'Supported kinds are ' + kinds.join(', ')); continue;}
    if (Array.isArray(node.use) && node.use.length === 1) node.use=node.use[0];
    if (node.kind === 'component') {
      const role = typeof node.use === 'string' ? schemaComponentRole(node.use) : undefined;
      if (components.includes(role)) node.use = role;
      else error(at + '.use','Unsupported component use ' + JSON.stringify(node.use) + '. Choose a supported role from schema.catalog, kind:"text" for a label, or kind:"html" for this local fragment. Keep the surrounding page, actions and scenes.');
    }
    const nodeKeys=new Set(['kind','layout','gap','columns','children','style','tag','text','bind','src','alt','html','use','props','events','when','hidden','label']);
    for(const key of Object.keys(node))if(!nodeKeys.has(key))error(at+'.'+key,'Unknown node field; read schema.catalog');
    if (node.props !== undefined && !schemaObject(node.props)) {error(at + '.props','Component props must be an object');continue;}
    if (node.style !== undefined && !schemaObject(node.style)) error(at + '.style','Style must be a CSS property object');
    if (node.children !== undefined && (!Array.isArray(node.children) || node.children.some(child => !ids.has(child)) || new Set(node.children).size !== node.children.length)) error(at + '.children','Children must reference unique existing node IDs');
    if (node.events !== undefined && (!schemaObject(node.events) || Object.values(node.events).some(action => !actions.has(action)))) error(at + '.events','Events reference declared action IDs');
    if (node.bind !== undefined) try {schemaPathParts(node.bind);} catch {error(at + '.bind','Use a safe state path');}
    if (node.when !== undefined) conditionAt(node.when,at + '.when');
    if (node.hidden !== undefined && typeof node.hidden !== 'boolean') error(at + '.hidden','Use a boolean');
    if (node.style && Object.values(node.style).some(value => !['string','number'].includes(typeof value))) error(at + '.style','CSS values must be strings or finite numbers');
    const props = node.props || {};
    if (node.kind === 'component' && ['input','textarea','select','switch','checkbox'].includes(node.use)) nativeFieldAt(props,node.use,at+'.props');
    for (const key of ['disabled','block','round','searchable','multiple','clearable']) if (props[key] !== undefined && typeof props[key] !== 'boolean') error(at + '.props.' + key,'Use a boolean');
    if (node.kind === 'component' && ['input','textarea','select','switch','checkbox','tabs','steps'].includes(node.use)) pathAt(props.bind,at + '.props.bind');
    if (props.back !== undefined && !actions.has(props.back)) error(at + '.props.back','Back must reference a declared action');
    if (node.use === 'select') optionsAt(props.options,at + '.props.options');
    if (node.use === 'tag') {
      if (props.bind !== undefined) pathAt(props.bind,at + '.props.bind');
      if (props.tone !== undefined && typeof props.tone !== 'string') error(at + '.props.tone','Use a tone name from the design system');
      if (props.plain !== undefined && typeof props.plain !== 'boolean') error(at + '.props.plain','Use a boolean for an outline tag');
    }
    if (['dialog','drawer'].includes(node.use)) {
      if (props.closable !== undefined && typeof props.closable !== 'boolean') error(at + '.props.closable','Use a boolean for the header close button');
      if (props.closeLabel !== undefined && (typeof props.closeLabel !== 'string' || !props.closeLabel.trim())) error(at + '.props.closeLabel','Provide a nonempty accessible close label');
    }
    if (node.use === 'tabs' || node.use === 'steps') {
      const itemIds = new Set();
      listAt(props.items,at + '.props.items',(item,where) => {
        if (!safeKey(item.id) || itemIds.has(item.id) || typeof item.label !== 'string') error(where,'Items require unique IDs and visible labels');
        itemIds.add(item.id);
        if (node.use === 'tabs' && !ids.has(item.nodeId)) error(where + '.nodeId','Tab panels must reference existing nodes');
      });
    }
    if (node.use === 'table') listAt(props.columns,at + '.props.columns',(column,where) => {
      if (!safeKey(column.id) || typeof column.title !== 'string') error(where,'Columns require IDs and visible titles');
    });
    if (node.kind === 'layout' && !['stack','row','grid','free'].includes(node.layout || 'stack')) error(at + '.layout','Use stack, row, grid or free');
    if (node.kind === 'repeat' || node.use === 'table') {
      try {schemaPathParts(props.source);} catch {error(at + '.props.source','Collections require a state source path');}
      if (!safeKey(props.key || 'id')) error(at + '.props.key','Provide a stable record key');
      const rows = (() => {try{return schemaValue(spec.state,props.source);}catch{return null;}})();
      if (!Array.isArray(rows) || rows.length > 500) error(at + '.props.source','Initial collections must be arrays of at most 500 records');
      else {
        const values = rows.map(row => row?.[props.key || 'id']);
        if (values.some(value => !['string','number'].includes(typeof value)) || new Set(values.map(String)).size !== values.length) error(at + '.props.key','Records require unique stable keys');
      }
      for (const [sceneId,scene] of Object.entries(spec.scenes)) {
        let records;try {records=schemaValue(scene?.state,props.source);} catch {}
        if (records === undefined) continue;
        const where='scenes.' + sceneId + '.state.' + props.source;
        if (!Array.isArray(records) || records.length>500) {error(where,'Scene collections require arrays of up to 500 records');continue;}
        const keys=records.map(row=>row?.[props.key||'id']);
        if (keys.some(value=>!['string','number'].includes(typeof value)) || new Set(keys.map(String)).size!==keys.length) error(where,'Scene records require unique stable keys');
      }
      if (node.kind === 'repeat' && (!Array.isArray(node.children) || !node.children.length)) error(at + '.children','Repeat requires a child template');
    }
    if (node.use === 'form') {
      try {schemaPathParts(props.model);} catch {error(at + '.props.model','Forms require a state model path');}
      if (!Array.isArray(props.fields) || !props.fields.length || props.fields.length > 100) error(at + '.props.fields','Forms require 1–100 fields');
      else {
        const seen = new Set();
        props.fields.forEach((field,index) => {
          const fieldAt = at + '.props.fields[' + index + ']';
          if (!schemaObject(field) || typeof field.id!=='string' || !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(field.id) || seen.has(field.id)) {error(fieldAt,'Fields require unique single-segment IDs');return;}
          seen.add(field.id);
          nativeFieldAt(field,field.control || 'input',fieldAt);
          if (typeof field.label !== 'string') error(fieldAt + '.label','Provide a visible field label');
          if (!fieldTypes.includes(field.control || 'input')) error(fieldAt + '.control','Unsupported field control');
          if (field.control === 'select') optionsAt(field.options,fieldAt + '.options');
          if (field.control === 'radio' && field.options !== undefined) {
            optionsAt(field.options,fieldAt + '.options');
            if (Array.isArray(field.options)) {
              const values = field.options.map(option=>option?.value);
              if (new Set(values).size !== values.length) error(fieldAt + '.options','Radio choices require distinct values');
            }
          }
          if (field.rules !== undefined && (!Array.isArray(field.rules) || field.rules.some(rule => !['required','email','phone','number'].includes(typeof rule === 'string' ? rule : rule?.type)))) error(fieldAt + '.rules','Rules support required, email, phone and number');
        });
      }
      if (props.submit !== undefined) {
        if (!schemaObject(props.submit)) error(at + '.props.submit','Use a submit button object');
        else buttonAt(props.submit,at + '.props.submit');
      }
    }
    if (props.actions !== undefined && !Array.isArray(props.actions)) {error(at + '.props.actions','Actions must be an array');continue;}
    for (const [index,button] of (props.actions || []).entries()) {
      if (!schemaObject(button)) error(at + '.props.actions[' + index + ']','Use a button object');
      else buttonAt(button,at + '.props.actions[' + index + ']');
    }
  }
  if (diagnostics.length) return {valid:false,diagnostics,spec};
  const visiting = new Set(), visited = new Set(), owners = new Set();
  const walk = id => {
    if (visiting.has(id)) {error('nodes.' + id,'Child references contain a cycle');return;}
    if (visited.has(id)) {error('nodes.' + id,'A node has multiple parents; use repeat for repeated content');return;}
    visiting.add(id); owners.add(id);
    const node = spec.nodes[id];
    const children = [...new Set([...(node?.children || []),...(node?.use === 'tabs' ? (node.props?.items || []).map(item => item.nodeId) : [])])];
    for (const child of children) {if(ids.has(child))walk(child);else error('nodes.' + id,'Child node does not exist');}
    visiting.delete(id); visited.add(id);
  };
  if (ids.has(spec.root)) walk(spec.root);
  for (const [id,node] of Object.entries(spec.nodes)) if (['dialog','drawer'].includes(node.use) && !owners.has(id)) walk(id);
  for (const id of ids) if (!owners.has(id)) error('nodes.' + id,'Node is unreachable from the root');
  let actionCount = 0;
  const checkAction = (action,at,chain=[]) => {
    if (++actionCount > 3000) {if(actionCount===3001)error(at,'Action expansion exceeds 3000 operations');return;}
    if (typeof action === 'string') {
      if (!actions.has(action)) error(at,'Unknown action reference');
      else if (chain.includes(action)) error(at,'Action references contain a cycle');
      else checkAction(spec.actions[action],at,chain.concat(action));
      return;
    }
    if (Array.isArray(action)) {action.forEach((step,index) => checkAction(step,at + '[' + index + ']',chain));return;}
    if (schemaObject(action) && Object.hasOwn(actionAliases,action.type)) action.type=actionAliases[action.type];
    if (!schemaObject(action) || !actionTypes.includes(action.type)) {error(at,'Read schema.catalog for supported action types');return;}
    const fields = ['type','target','path','value','steps','onValid','onInvalid','then','else','text','tone','duration','scene','condition','key','id','pageId','url','errors','field','scroll'];
    if (Object.keys(action).some(key => !fields.includes(key))) error(at,'Unknown action property');
    if (action.type === 'sequence' && !Array.isArray(action.steps)) error(at + '.steps','Sequence requires an array of steps');
    if (['state.set','collection.update','collection.append','collection.remove'].includes(action.type)) pathAt(action.path,at + '.path');
    if (['state.set','collection.update','collection.append'].includes(action.type) && !Object.hasOwn(action,'value')) error(at + '.value','Provide the value');
    if (['collection.update','collection.remove'].includes(action.type) && !Object.hasOwn(action,'id')) error(at + '.id','Provide a record ID or reference');
    if (action.type.startsWith('collection.')) {
      let rows;try {rows=schemaValue(spec.state,action.path);} catch {}
      if (!Array.isArray(rows)) error(at + '.path','Collection actions require an initial array');
      if (action.key !== undefined && !safeKey(action.key)) error(at + '.key','Use a stable record key');
      if (['collection.append','collection.update'].includes(action.type) && !schemaObject(action.value)) error(at + '.value','Provide a record object or {ref}');
    }
    if (action.type === 'if') conditionAt(action.condition,at + '.condition');
    if (action.type === 'navigate' && (typeof action.pageId !== 'string' && typeof action.url !== 'string')) error(at,'Navigation requires pageId or url');
    if (action.type === 'feedback.show' && !(typeof action.text==='string'&&action.text.trim() || schemaObject(action.text)&&typeof action.text.ref==='string')) error(at + '.text','Feedback requires visible text or a state reference');
    if (action.tone !== undefined && !['success','error','warning','info'].includes(action.tone)) error(at + '.tone','Unknown feedback tone');
    if (action.duration !== undefined && (!Number.isFinite(action.duration) || action.duration < 0)) error(at + '.duration','Use a nonnegative duration');
    if (action.scroll !== undefined && (action.type !== 'focus' || typeof action.scroll !== 'boolean')) error(at + '.scroll','focus.scroll must be boolean');
    if (action.field !== undefined) {
      const target = spec.nodes[action.target];
      if (action.type !== 'focus' || target?.use !== 'form' || !Array.isArray(target.props?.fields) || !target.props.fields.some(field=>field?.id===action.field)) {
        error(at + '.field','focus.field must reference a field on its target form');
      }
    }
    if (['focus','form.submit','form.errors','overlay.open','overlay.close'].includes(action.type) && !ids.has(action.target)) error(at + '.target','Action target does not exist');
    if (action.type.startsWith('form.') && spec.nodes[action.target]?.use !== 'form') error(at + '.target','The target must be a form');
    if (action.type === 'form.errors' && (!schemaObject(action.errors) || Object.entries(action.errors).some(([key,value])=>typeof value!=='string'||!spec.nodes[action.target]?.props?.fields?.some(field=>field.id===key)))) error(at + '.errors','Errors map declared field IDs to messages');
    if (action.type.startsWith('overlay.') && !['dialog','drawer'].includes(spec.nodes[action.target]?.use)) error(at + '.target','Overlay target must be a dialog or drawer');
    if (action.type === 'scene.enter' && !Object.hasOwn(spec.scenes,action.scene)) error(at + '.scene','Scene does not exist');
    if (['state.set','state.reset','collection.update','collection.remove','collection.append'].includes(action.type) && action.path !== undefined) try {schemaPathParts(action.path);} catch {error(at + '.path','Use a safe state path');}
    for (const key of ['steps','onValid','onInvalid','then','else']) if (action[key] !== undefined) checkAction(action[key],at + '.' + key,chain);
  };
  for (const [id,action] of Object.entries(spec.actions)) {
    if (!safeKey(id)) error('actions.' + id,'Invalid action identifier');
    checkAction(action,'actions.' + id,[id]);
  }
  if (Object.keys(spec.scenes).length > 100) error('scenes','At most 100 named scenes are supported');
  for (const [id,scene] of Object.entries(spec.scenes)) {
    if (!safeKey(id) || !schemaObject(scene) || typeof scene.name !== 'string' || !scene.name.trim()) {error('scenes.' + id,'Scenes require stable IDs and business names');continue;}
    if (scene.state !== undefined && !schemaObject(scene.state)) error('scenes.' + id + '.state','Scene state must be a partial state object');
    if (scene.ui !== undefined && !schemaObject(scene.ui)) error('scenes.' + id + '.ui','Scene UI must be a keyed object');
    for (const [key,value] of Object.entries(scene.ui || {})) {
      const at = 'scenes.' + id + '.ui.' + key;
      if (key !== 'feedback' && !ids.has(key)) error(at,'Scene UI target does not exist');
      if (!schemaObject(value)) {error(at,'Scene UI must be an object');continue;}
      const fields = key === 'feedback' ? ['text','tone','persistent'] : ['hidden','open','disabled','loading','validation','errors'];
      if (Object.keys(value).some(key => !fields.includes(key))) error(at,'Unknown scene UI property');
      for (const flag of ['hidden','open','disabled','loading','persistent']) if (value[flag] !== undefined && typeof value[flag] !== 'boolean') error(at + '.' + flag,'Use a boolean');
      if (value.validation !== undefined && !['submitted','none'].includes(value.validation)) error(at + '.validation','Use submitted or none');
      if (value.errors !== undefined && (!schemaObject(value.errors) || Object.entries(value.errors).some(([field,message])=>typeof message!=='string'||!spec.nodes[key]?.props?.fields?.some(item=>item.id===field)))) error(at + '.errors','Errors map declared form fields to messages');
    }
  }
  if (spec.documentOperations !== undefined && (!Array.isArray(spec.documentOperations) || spec.documentOperations.length > 5000)) error('documentOperations','Provide up to 5000 retained document operations');
  return {valid:diagnostics.length === 0,diagnostics,spec};
}

export function requirePageSchema(input) {
  const result = validatePageSchema(input);
  if (!result.valid) fail('SCHEMA_INVALID','Page definition validation failed\n' + JSON.stringify({diagnostics:result.diagnostics.slice(0,40)}),{diagnostics:result.diagnostics});
  return result.spec;
}

export function pageSchemaCatalog() {
  return {
    schemaVersion:PAGE_SCHEMA_VERSION, compilerVersion:SCHEMA_COMPILER_VERSION,
    machineContract:{action:'schema.catalog',view:'json-schema'},
    document:{schemaVersion:1,id:'stable-page-id',title:'页面标题',root:'root-node-id',nodes:'{id:node}',state:'initial JSON data',actions:'{id:action}',scenes:'{id:{name,state?,ui?}}',css:'optional task-specific CSS',script:'optional browser extension JavaScript'},
    nodes:{
      layout:{kind:'layout',layout:'stack',gap:'CSS length or $space.lg',columns:'CSS grid-template-columns',children:['node-id'],style:'optional CSS property object'},
      text:{kind:'text',text:'visible text',tag:'h1|h2|h3|p|span|label|strong',bind:'optional state path or item.field in repeat',style:{}},
      image:{kind:'image',src:'portable image URL',alt:'image description',style:{}},
      component:{kind:'component',use:'button',props:{text:'按钮'},supportedRoles:components,children:['optional content IDs'],events:{click:'action-id',change:'action-id'},when:{ref:'state.path',eq:'value'}},
      repeat:{kind:'repeat',props:{source:'records',key:'id',filter:'optional state query path'},children:['template-node-id']},
      html:{kind:'html',html:'custom editable HTML fragment',style:{}},
    },
    props:{
      form:{model:'draft',fields:[{id:'email',label:'通知邮箱',control:'input',inputType:'email',rules:['required','email'],help:'optional description',placeholder:'optional',style:{}},{id:'frequency',label:'频率',control:'radio',options:[{value:'daily',label:'每日'},{value:'weekly',label:'每周'}]}],submit:{text:'保存',action:'save'},actions:[{id:'reset',text:'恢复默认',action:'confirm'}],columns:1},
      button:{text:'按钮',variant:'primary|default|text',size:'small|default|large',disabled:false,block:false,round:false},
      dialog:{title:'确认',text:'说明',closable:true,closeLabel:'可选关闭按钮名称',actions:[{id:'cancel',text:'取消',action:'cancel'},{id:'confirm',text:'确认',action:'confirm',variant:'primary'}]},
      drawer:{title:'标题',closable:true,placement:'left|right|bottom',actions:[]},
      table:{source:'records',key:'id',columns:[{id:'name',title:'名称'}],actions:[{id:'detail',text:'详情',action:'show-detail'}],filter:'optional query state path'},
      input:{bind:'state path',inputType:'text|email|tel|number|search',placeholder:'optional'},
      select:{bind:'state path',options:[{value:'daily',label:'每日'}],searchable:false,multiple:false,clearable:false},
      tabs:{bind:'activeTab',items:[{id:'first',label:'第一项',nodeId:'child-panel-id'}]},
      card:{title:'可选标题'},alert:{text:'反馈',tone:'success|warning|error|info'},
      tag:{text:'状态文字',bind:'optional state path in place of text',tone:'optional; primary|success|warning|danger in the built-in themes',plain:'optional outline when the system supports it'},
      nav:{title:'标题',back:'optional action-id',backText:'optional visible label',aliases:['nav-bar','ds-nav-bar']},steps:{bind:'step',items:[{id:'one',label:'填写信息'},{id:'two',label:'确认'}]},
    },
    actions:{
      'sequence':{type:'sequence',steps:['action-id']},
      'state.set':{type:'state.set',path:'state.path',value:'literal or {ref:"state.path"} or {ref:"item.id"}'},
      'state.reset':{type:'state.reset',path:'optional model path; omitted resets initial state'},
      'form.submit':{type:'form.submit',target:'form-node',onValid:[{type:'feedback.show',tone:'success',text:'已保存'}],onInvalid:[]},
      'form.errors':{type:'form.errors',target:'form-node',errors:{email:'该邮箱已被使用'}},
      'overlay.open':{type:'overlay.open',target:'dialog-node'},'overlay.close':{type:'overlay.close',target:'dialog-node'},
      'feedback.show':{type:'feedback.show',text:'操作成功',tone:'success',duration:3000},
      'scene.enter':{type:'scene.enter',scene:'scene-id'},
      focus:{type:'focus',target:'node-id',field:'optional field ID when targeting a form',scroll:'boolean, defaults to true; nearest visible position, respects reduced motion'},
      'if':{type:'if',condition:{ref:'step',eq:'one'},then:[],else:[]},
      'collection.update':{type:'collection.update',path:'records',key:'id',id:{ref:'selected.id'},value:{ref:'draft'}},
      'collection.append':{type:'collection.append',path:'records',key:'id',value:{ref:'draft'}},
      'collection.remove':{type:'collection.remove',path:'records',key:'id',id:{ref:'selected.id'}},
      navigate:{type:'navigate',pageId:'saved target page ID or url portable URL'},back:{type:'back'},
    },
    sceneUI:{node:{hidden:'boolean',disabled:'boolean',loading:'boolean'},overlay:{open:'boolean'},form:{validation:'submitted or none',errors:{email:'业务校验消息'}},feedback:{text:'visible text',tone:'success/error/warning/info',persistent:'boolean'}},
    sceneExample:{name:'邮箱格式错误',state:{draft:{email:'bad'}},ui:{'form-node':{validation:'submitted'},feedback:{text:'请检查输入',tone:'error',persistent:true}}},
    example:{schemaVersion:1,id:'example',root:'page',nodes:{page:{kind:'layout',children:['title','form','confirm']},title:{kind:'text',tag:'h1',text:'联系信息'},form:{kind:'component',use:'form',props:{model:'draft',fields:[{id:'email',label:'邮箱',inputType:'email',rules:['required','email']}],submit:{text:'保存',action:'save'},actions:[{text:'恢复默认',action:'open'}]}},confirm:{kind:'component',use:'dialog',props:{title:'恢复默认？',actions:[{text:'取消',action:'close'},{text:'确认',action:'reset'}]}}},state:{draft:{email:'team@example.com'}},actions:{save:{type:'form.submit',target:'form',onValid:[{type:'feedback.show',text:'保存成功'}]},open:{type:'overlay.open',target:'confirm'},close:{type:'overlay.close',target:'confirm'},reset:[{type:'state.reset'},{type:'overlay.close',target:'confirm'}]},scenes:{default:{name:'默认'},error:{name:'校验错误',state:{draft:{email:'bad'}},ui:{form:{validation:'submitted'}}},confirmation:{name:'确认',ui:{confirm:{open:true}}}}},
    fieldAttributes:{names:['required','pattern','patternMessage','minlength','maxlength','autocomplete','inputmode'],example:{id:'postalCode',label:'邮政编码',inputmode:'numeric',autocomplete:'postal-code',pattern:'[0-9]{6}',patternMessage:'请输入六位数字',maxlength:6},usage:'phone accepts international formats. Use a regional HTML pattern when required. form.submit and scene.ui[formId].validation="submitted" share field validation and required markers.'},
    recipes:{form:'form.submit validates and focuses the first error, onValid performs state/action/feedback changes',flow:'Use a step state and layout.when for panels. onValid sets the next step, then {type:"focus",target:"next-heading"} focuses the visible heading or control. Going back retains state.',overlay:'Dialogs and drawers include a labeled header close button. closable:false hides that button. Header dismissal and Escape use events.close or the cancel/close footer action; explicit footer actions retain their own behavior. overlay.open/close and scene.ui[nodeId].open share the overlay.',collection:'Use repeat/table with one records array and stable keys. Collection actions keep rendered rows synchronized.'},
    sourceEdits:{
      read:{action:'schema.read',options:{pageId:'<page>',pointer:'/nodes/form/props/fields/0'}},
      operations:[{type:'source.set',pointer:'/nodes/form/props/fields/0/help',value:'请输入工作邮箱'},{type:'source.replaceText',pointer:'/css',find:'max-width:700px',replace:'max-width:720px'}],
      usage:'After the first save, send schema.apply with pageId, current expectedRevision and just the changed operations. JSON Pointers address source values including /title, /css, /script, nodes, actions and scenes. source.set sets a property or existing array item. source.replaceText replaces one unique literal match. Read only the affected pointer when its value is unknown.',
    },
    guidance:'Use schema.apply with the existing pageId, expectedRevision and document. Link content nodes into the root through children or tabs.items.nodeId. Detached dialogs/drawers are document portals. The Host resolves and copies the pinned system resources, compiles stable native controls and WC markup, registers scenes, and saves the source and HTML together. Later schema.apply accepts {type:"node.update",id,patch}, {type:"state.set",path,value}, {type:"scene.set",id,scene}, {type:"action.set",id,action}. schema.apply validates while saving. A separate schema.validate returns a next request with draftId for saving the validated definition without resending it. Use that exact next request. Validation diagnostics include retryLast:true recovery for small corrective operations. edit.apply canvas operations are recorded in the canonical source and survive rebuild. Read rule.md for visual guidance. Compose the requested layout and data. Common form, overlay, collection and flow behavior uses the declarative actions. html/css/script extend task-specific behavior beyond those capabilities. Schema compilation is currently for HTML pages; existing React/Vue sources retain their own tools.',
  };
}

/** Machine-readable core contract. Semantic checks add graph and binding diagnostics. */
export function pageSchemaJSONSchema() {
  const identifier={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_.:-]{0,95}$'};
  const string={type:'string'},object={type:'object'};
  return {
    $schema:'https://json-schema.org/draft/2020-12/schema',
    title:'DSH semantic page definition',type:'object',additionalProperties:false,
    required:['schemaVersion','id','root','nodes'],
    properties:{
      schemaVersion:{const:1},id:identifier,title:string,root:identifier,
      nodes:{type:'object',minProperties:1,maxProperties:1000,propertyNames:identifier,additionalProperties:{$ref:'#/$defs/node'}},
      state:object,
      actions:{type:'object',propertyNames:identifier,additionalProperties:{$ref:'#/$defs/action'}},
      scenes:{type:'object',maxProperties:100,propertyNames:identifier,additionalProperties:{$ref:'#/$defs/scene'}},
      css:string,script:string,documentOperations:{type:'array',maxItems:5000,items:object},
    },
    $defs:{
      condition:{type:'object',required:['ref'],properties:{ref:string,eq:{},not:{},truthy:{type:'boolean'}},additionalProperties:false},
      node:{type:'object',required:['kind'],additionalProperties:false,properties:{
        kind:{enum:kinds},layout:{enum:['stack','row','grid','free']},gap:{type:['string','number']},columns:{type:['string','number']},
        children:{type:'array',items:identifier,uniqueItems:true},style:object,tag:string,text:{type:['string','number']},bind:string,src:string,alt:string,html:string,use:{enum:[...components,...Object.keys(componentAliases)].flatMap(role=>[role,'ds-'+role])},props:object,
        events:{type:'object',additionalProperties:identifier},when:{$ref:'#/$defs/condition'},hidden:{type:'boolean'},label:string,
      }},
      action:{oneOf:[identifier,{type:'array',items:{$ref:'#/$defs/action'}},{type:'object',required:['type'],additionalProperties:false,properties:{
        type:{enum:[...actionTypes,...Object.keys(actionAliases)]},target:identifier,path:string,value:{},steps:{$ref:'#/$defs/action'},onValid:{$ref:'#/$defs/action'},onInvalid:{$ref:'#/$defs/action'},then:{$ref:'#/$defs/action'},else:{$ref:'#/$defs/action'},
        field:identifier,scroll:{type:'boolean'},errors:object,text:{},tone:{enum:['success','error','warning','info']},duration:{type:'number',minimum:0},scene:identifier,condition:{$ref:'#/$defs/condition'},key:string,id:{},pageId:string,url:string,
      }}]},
      scene:{type:'object',required:['name'],additionalProperties:false,properties:{name:{type:'string',minLength:1},state:object,ui:object}},
    },
  };
}

/** Shared deterministic identity for compiled and newly-created preview records. */
export function schemaRecordId(value) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64,hash * 1099511628211n);
  }
  return 'r-' + hash.toString(16).padStart(16,'0');
}

/** Document identities remain bounded even for deeply nested repeat instances. */
export function schemaNodeId(value) {
  if (value.length <= 128) return value;
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) hash = BigInt.asUintN(64,(hash ^ BigInt(byte)) * 1099511628211n);
  return 'schema-node-' + hash.toString(16).padStart(16,'0');
}
