import {parseFragment, serialize} from 'parse5';
import {parse as parseScript} from '@babel/parser';
import {normalizeDocument, applyDocumentOperations} from './document-model.js';
import {requirePageSchema,schemaHash,schemaValue,schemaRecordId,schemaNodeId,schemaComponentRole,SCHEMA_COMPILER_VERSION} from './page-schema.js';
import {installSchemaRuntime} from './schema-runtime.js';
import {fail} from './store.js';

const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const voids = new Set(['input','img','br','hr','meta','link']);
const unitless = /^(?:opacity|z-index|font-weight|line-height|flex|flex-grow|flex-shrink|order|grid-column|grid-row|aspect-ratio)$/;
const cssName = key => key.startsWith('--') ? key : key.replace(/[A-Z]/g,letter => '-' + letter.toLowerCase());
const cssValue = (key,value) => {
  const tokens = {'$space.xs':'calc(var(--ds-spacing,8px)*.5)','$space.sm':'var(--ds-spacing,8px)','$space.md':'calc(var(--ds-spacing,8px)*2)','$space.lg':'calc(var(--ds-spacing,8px)*3)','$space.xl':'calc(var(--ds-spacing,8px)*4)','$color.primary':'var(--ds-primary)','$color.text':'var(--ds-text)','$color.secondary':'var(--ds-text-secondary)','$color.surface':'var(--ds-surface)','$color.background':'var(--ds-background)','$radius.control':'var(--ds-radius)','$radius.card':'var(--ds-card-radius)'};
  if (typeof value === 'string' && value.startsWith('$')) {
    if (!Object.hasOwn(tokens,value)) fail('SCHEMA_TOKEN','Unknown semantic style token',{token:value});
    return tokens[value];
  }
  return typeof value === 'number' && !unitless.test(key) ? value + 'px' : String(value);
};
const style = values => Object.entries(values || {}).map(([key,value]) => cssName(key) + ':' + cssValue(cssName(key),value)).join(';');
const rowKey = schemaRecordId;
const nativeRoles = {button:'button',input:'input',textarea:'textarea',select:'select',switch:'input',checkbox:'input',radio:'input',dialog:'div',drawer:'div',card:'section',table:'div',tabs:'div',alert:'div',nav:'nav',steps:'ol'};
const plain = value => value === null || ['string','number','boolean'].includes(typeof value);
const requiredField = field => field.required === true || (field.rules || []).some(rule => (typeof rule === 'string' ? rule : rule.type) === 'required');

/** Layout and component markup are compiled from the pinned public component contracts. */
export function compilePageSchema(input,{binding={},platform='web',pageURLs={}}={}) {
  const spec = requirePageSchema(input), manifest = binding.manifest;
  if (spec.script) {
    if (typeof spec.script !== 'string') fail('SCHEMA_INVALID','script must be browser JavaScript');
    try {parseScript(spec.script,{sourceType:'script'});} catch (error) {fail('SCHEMA_SCRIPT','Browser extension script has invalid syntax',{message:error.message});}
  }
  if (spec.css !== undefined && typeof spec.css !== 'string') fail('SCHEMA_INVALID','css must be text');
  const mobile = platform === 'mobile';
  const tags = new Map((manifest?.components || []).map(component => [schemaComponentRole(component.semanticRole || component.tag),component.tag]));
  const tagFor = role => {
    if (!manifest) return nativeRoles[role];
    const tag = tags.get(role);
    if (!tag) fail('SCHEMA_COMPONENT_UNAVAILABLE','The pinned design system lacks semantic component ' + role + '. Choose an available role, or use a local text/html node for this component.',{role,systemId:binding.systemId,version:binding.version});
    return tag;
  };
  const sourceMap = {}, formFields = {}, rendered = new Set();
  let auto = 0;
  const h = (tag,attributes={},content='') => {
    const attrs = {...attributes};
    if (!['script','style','meta','link','title','head'].includes(tag) && !attrs['data-dsh-node']) attrs['data-dsh-node'] = 'schema-auto-' + ++auto;
    if (attrs['data-dsh-node']) {
      const logical = attrs['data-dsh-node'];
      attrs['data-dsh-node'] = schemaNodeId(logical);
      if (logical !== attrs['data-dsh-node']) attrs['data-schema-identity'] = logical;
    }
    const text = Object.entries(attrs).filter(([,value]) => value !== undefined && value !== null && value !== false).map(([key,value]) => ' ' + key + '="' + escape(value === true ? '' : value) + '"').join('');
    return '<' + tag + text + '>' + (voids.has(tag) ? '' : content + '</' + tag + '>');
  };
  const map = (id,address) => {sourceMap[schemaNodeId(id)] = address; return id;};
  const button = (owner,item,index,prefix='') => {
    const id = prefix + owner + ':' + (item.id || 'action-' + index);
    const attrs = {'data-dsh-node':map(id,{nodeId:owner,part:'action',index}),variant:item.variant || 'default',size:item.size,block:mobile || item.block,round:item.round,disabled:item.disabled};
    const control = h('button',{'data-dsh-node':map(id + ':button',{nodeId:owner,part:'action.text',index}),type:'button','data-schema-action':item.action,disabled:item.disabled},escape(item.text));
    return manifest ? h(tagFor('button'),attrs,control) : h('button',{...attrs,type:'button','data-schema-action':item.action},escape(item.text));
  };
  const optionsHTML = (options,value,owner) => (options || []).map((option,index) => {
    if (!option || !plain(option.value) || typeof option.label !== 'string') fail('SCHEMA_OPTIONS','Options require scalar values and visible labels',{nodeId:owner,index});
    const optionValue = String(option.value);
    return h('option',{'data-dsh-node':owner + ':option-' + index,value:optionValue,selected:Array.isArray(value) ? value.some(item => String(item) === optionValue) : String(value ?? '') === optionValue,disabled:option.disabled},escape(option.label));
  }).join('');
  const control = (id,type,props,value,bind) => {
    const location = {nodeId:props.owner || id,bind,...(props.context?.item?{recordKey:props.context.key,source:props.context.source,keyField:props.context.keyField||'id'}:{})};
    const native = type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input';
    const required = requiredField(props);
    const attrs = {'data-dsh-node':map(id + ':input',{...location,part:'value'}),id:id + ':input',name:props.name || props.fieldId || id,type:['switch','checkbox','radio'].includes(type) ? type === 'radio' ? 'radio' : 'checkbox' : native === 'input' ? props.inputType || 'text' : undefined,value:!['switch','checkbox','radio','textarea','select'].includes(type) ? value ?? '' : undefined,checked:['switch','checkbox','radio'].includes(type) ? Boolean(value) : undefined,'data-schema-bind':bind,'aria-label':props.label,placeholder:props.placeholder,disabled:props.disabled,multiple:props.multiple,'aria-describedby':props.describedBy,rows:props.rows || (type === 'textarea' ? 3 : undefined)};
    const body = native === 'select' ? optionsHTML(props.options,value,id) : native === 'textarea' ? escape(value) : '';
    Object.assign(attrs,{required,'aria-required':required ? 'true' : undefined,pattern:props.pattern,
      minlength:props.minlength,maxlength:props.maxlength,inputmode:props.inputmode,autocomplete:props.autocomplete});
    const child = h(native,attrs,body);
    const hostAttrs = {'data-dsh-node':map(id,{...location,part:'control'}),'data-schema-owner':props.owner || id,'data-schema-definition':props.definition,style:style(props.style)};
    if (!manifest) return h('span',{...hostAttrs,class:'schema-native-control'},child);
    const hostValue = ['input','textarea'].includes(type) || type === 'select' && !props.multiple ? String(value ?? '') : undefined;
    return h(tagFor(type),{...hostAttrs,value:hostValue,checked:['switch','checkbox','radio'].includes(type) ? Boolean(value) : undefined,disabled:props.disabled,searchable:props.searchable,clearable:props.clearable,multiple:props.multiple,'aria-label':props.label},child);
  };
  const radioGroup = (id,field,value,bind) => {
    const address = {nodeId:field.owner,fieldId:field.id};
    const {context} = field;
    const selection = {...address,bind,...(context.item ? {recordKey:context.key,source:context.source,keyField:context.keyField || 'id'} : {})};
    const required = requiredField(field);
    const options = field.options.map((option,index) => {
      const choiceId = id + ':option-' + index;
      const mapped = {...selection,part:'radio.choice',index};
      const checked = value === option.value, disabled = field.disabled || option.disabled;
      const input = h('input',{'data-dsh-node':map(choiceId + ':input',mapped),id:choiceId + ':input',type:'radio',name:id,
        value:String(option.value),'data-schema-radio-value':JSON.stringify(option.value),'data-schema-bind':bind,checked,disabled,required,'aria-describedby':field.describedBy});
      const caption = h('span',{'data-dsh-node':map(choiceId + ':text',{...address,part:'field.option.label',index})},escape(option.label));
      const label = h('label',{'data-dsh-node':choiceId + ':label'},input + caption);
      return tags.has('radio') ? h(tags.get('radio'),{'data-dsh-node':map(choiceId,mapped),checked,disabled},label) : label;
    }).join('');
    return h('div',{'data-dsh-node':id,role:'radiogroup','aria-labelledby':id + ':label','aria-describedby':field.describedBy,'aria-required':required ? 'true' : undefined,
      class:'schema-radio-group','data-schema-owner':field.owner,style:style(field.style)},options);
  };
  const collectionRecords = (path,keyField='id') => {
    const records = new Map();
    for (const state of [spec.state,...Object.values(spec.scenes).map(scene => scene.state || {})]) {
      const list = (() => {try{return schemaValue(state,path);}catch{return [];}})();
      if (Array.isArray(list)) for (const item of list) records.set(String(item[keyField]),item);
    }
    return [...records.values()];
  };
  const render = (id,context={},prefix='') => {
    rendered.add(id);
    const node = spec.nodes[id], props = node.props || {}, actual = prefix + id;
    const valueAt = path => path?.startsWith('item.') ? path.slice(5).split('.').reduce((value,key) => value?.[key],context.item) : schemaValue(spec.state,path);
    const attrs = {'data-dsh-node':map(actual,{nodeId:id,part:'node',...(context.item ? {recordKey:context.key,source:context.source,keyField:context.keyField || 'id'} : {})}),'data-schema-owner':id,'data-schema-definition':id,style:style(node.style),'aria-label':node.label,hidden:node.hidden};
    const children = () => (node.children || []).map(child => render(child,context,prefix)).join('');
    if (node.kind === 'layout') {
      const layout = node.layout || 'stack';
      attrs.class = 'schema-layout schema-' + layout;
      attrs.style = style({gap:node.gap || '$space.md',...(layout === 'grid' ? {gridTemplateColumns:typeof node.columns === 'number' ? 'repeat(' + node.columns + ', minmax(0,1fr))' : node.columns || 'repeat(2,minmax(0,1fr))'} : {}),...node.style});
      return h(node.tag === 'main' ? 'main' : 'section',attrs,children());
    }
    if (node.kind === 'text') {
      const text = node.bind ? valueAt(node.bind) : node.text;
      const tag = ['h1','h2','h3','h4','p','span','label','strong','small'].includes(node.tag) ? node.tag : 'p';
      attrs['data-schema-text'] = node.bind;
      sourceMap[schemaNodeId(actual)] = {...sourceMap[schemaNodeId(actual)],part:'text',bind:node.bind};
      return h(tag,attrs,escape(text));
    }
    if (node.kind === 'image') return h('img',{...attrs,src:node.src,alt:node.alt || ''});
    if (node.kind === 'html') {
      const fragment = parseFragment(String(node.html || ''));
      const assign = (current,trail='') => {
        if (current.tagName && !['script','style'].includes(current.tagName)) {
          current.attrs = (current.attrs || []).filter(attr => attr.name !== 'data-dsh-node');
          current.attrs.push({name:'data-dsh-node',value:schemaNodeId(actual + ':html' + trail)});
        }
        (current.childNodes || []).forEach((child,index) => assign(child,trail + '-' + index));
      };
      assign(fragment);
      return h('section',attrs,serialize(fragment));
    }
    if (node.kind === 'repeat') {
      attrs['data-schema-collection'] = props.source;
      const rows = collectionRecords(props.source,props.key || 'id').map(item => {
        const key = String(item[props.key || 'id']), rowId = actual + ':' + rowKey(key), rowPrefix = rowId + ':';
        return h('section',{'data-dsh-node':map(rowId,{nodeId:id,part:'row',source:props.source,recordKey:key,keyField:props.key||'id'}),'data-schema-row':key,'data-schema-record-key':props.key || 'id'},(node.children || []).map(child => render(child,{item,key,source:props.source,keyField:props.key || 'id'},rowPrefix)).join(''));
      }).join('');
      const prototype=(node.children||[]).map(child=>render(child,{item:{},key:'prototype',source:props.source,keyField:props.key||'id'},actual+':prototype:')).join('');
      return h('section',attrs,rows+h('template',{'data-schema-repeat-template':actual},h('section',{'data-dsh-node':actual+':prototype','data-schema-record-key':props.key||'id'},prototype))) + h('p',{'data-dsh-node':actual + ':empty',class:'schema-empty',hidden:true},escape(props.emptyText || '暂无内容'));
    }
    if (node.use === 'button') {
      const controlAttrs = {'data-dsh-node':map(actual + ':button',{nodeId:id,part:'props.text'}),type:'button','data-schema-action':node.events?.click,disabled:props.disabled};
      if (manifest) return h(tagFor('button'),{...attrs,variant:props.variant || 'primary',size:props.size,block:props.block,round:props.round,disabled:props.disabled},h('button',controlAttrs,escape(props.text || '按钮')));
      sourceMap[schemaNodeId(actual)] = {...sourceMap[schemaNodeId(actual)],part:'props.text'};
      return h('button',{...controlAttrs,...attrs},escape(props.text || '按钮'));
    }
    if (['input','textarea','select','switch','checkbox'].includes(node.use)) return control(actual,node.use,{...props,style:{...node.style,...props.style},owner:id,definition:id,context},valueAt(props.bind),props.bind);
    if (node.use === 'form') {
      const fields = props.fields.map(field => {
        const fieldId = actual + ':' + field.id, bind = props.model + '.' + field.id;
        formFields[fieldId] = {nodeId:id,fieldId:field.id,bind};
        const help = field.help ? h('p',{'data-dsh-node':map(fieldId + ':help',{nodeId:id,part:'field.help',fieldId:field.id}),id:fieldId + ':help',class:'schema-help'},escape(field.help)) : '';
        const group = field.control === 'radio' && Array.isArray(field.options);
        const controlProps = {...field,owner:id,fieldId:field.id,context,describedBy:fieldId + ':error' + (field.help ? ' ' + fieldId + ':help' : '')};
        const input = group ? radioGroup(fieldId,controlProps,valueAt(bind),bind) : control(fieldId,field.control || 'input',controlProps,valueAt(bind),bind);
        const label = h(mobile || group ? 'span' : 'label',{'data-dsh-node':map(fieldId + ':label',{nodeId:id,part:'field.label',fieldId:field.id}),id:group ? fieldId + ':label' : undefined,for:mobile || group ? undefined : fieldId + ':input','data-schema-required':requiredField(field)},escape(field.label));
        const error = h('p',{'data-dsh-node':fieldId + ':error',id:fieldId + ':error',class:'schema-error',role:'alert',hidden:true},'');
        return h(mobile && !group ? 'label' : 'div',{'data-dsh-node':fieldId + ':field',class:mobile ? 'mobile-field' : 'schema-field'},label + input + help + error);
      }).join('');
      const actions = [...(props.actions || []),...(props.submit ? [{...props.submit,id:'submit',variant:'primary'}] : [])].map((item,index) => button(actual,item,index)).join('');
      return h('form',{...attrs,novalidate:true,'data-schema-submit':props.submit?.action},h('div',{'data-dsh-node':actual + ':fields',class:mobile ? 'mobile-fields' : 'schema-fields',style:style({gridTemplateColumns:'repeat(' + (props.columns || 1) + ',minmax(0,1fr))'})},fields) + h('footer',{'data-dsh-node':actual + ':actions',class:'schema-actions'},actions));
    }
    if (node.use === 'card') return h(tagFor('card'),attrs,(props.title ? h('header',{'data-dsh-node':map(actual + ':title',{nodeId:id,part:'props.title'})},escape(props.title)) : '') + h('div',{'data-dsh-node':actual + ':body','data-card-body':true},children()));
    if (['dialog','drawer'].includes(node.use)) {
      const titleId = actual + ':title';
      const title = h('span',{'data-dsh-node':map(titleId,{nodeId:id,part:'props.title'}),id:titleId},escape(props.title));
      const closeLabel = props.closeLabel || (props.title ? '关闭「' + props.title + '」' : node.use === 'dialog' ? '关闭弹窗' : '关闭抽屉');
      const close = props.closable === false ? '' : h('button',{'data-dsh-node':actual + ':header:close',type:'button','aria-label':closeLabel,'data-schema-dismiss':true,'data-overlay-close':true,'data-ds-close':true},'×');
      const heading = h('header',{'data-dsh-node':actual + ':header'},title + close);
      const body = h('div',{'data-dsh-node':actual + ':body','data-dialog-body':true},(props.text ? h('p',{'data-dsh-node':map(actual + ':text',{nodeId:id,part:'props.text'})},escape(props.text)) : '') + children());
      const footer = h('footer',{'data-dsh-node':actual + ':actions'},(props.actions || []).map((item,index) => button(actual,item,index)).join(''));
      return h(manifest ? tagFor(node.use) : 'dialog',{...attrs,id:actual,'aria-labelledby':manifest ? undefined : titleId,placement:props.placement || (mobile && node.use === 'drawer' ? 'bottom' : undefined)},manifest ? h('dialog',{'data-dsh-node':actual + ':dialog','aria-labelledby':actual + ':title'},heading + body + footer) : heading + body + footer);
    }
    if (node.use === 'alert') return h(manifest ? tagFor('alert') : 'div',{...attrs,tone:props.tone || 'info',role:props.tone === 'error' ? 'alert' : 'status',class:'schema-alert'},escape(props.text) + children());
    if (node.use === 'tag') {
      const tag = tags.get('tag') || 'span', bind = props.bind ?? node.bind;
      const literal = props.text ?? node.text;
      const address = {...sourceMap[schemaNodeId(actual)],part:bind || props.text === undefined && node.text !== undefined ? 'text' : 'props.text',bind};
      const text = escape(bind ? valueAt(bind) : literal);
      const host = {...attrs,tone:props.tone,plain:props.plain,class:tag === 'span' ? 'schema-native-tag' : undefined};
      if (node.children?.length) {
        const label = bind || literal !== undefined ? h('span',{'data-dsh-node':map(actual + ':text',address),'data-schema-text':bind},text) : '';
        return h(tag,host,label + children());
      }
      sourceMap[schemaNodeId(actual)] = address;
      return h(tag,{...host,'data-schema-text':bind},text);
    }
    if (node.use === 'nav') {
      const tag = tags.get('nav'), title = h('strong',{'data-dsh-node':map(actual + ':title',{nodeId:id,part:'props.title'})},escape(props.title));
      let back = '';
      if (props.back && (tag || manifest && !tags.has('button'))) {
        const address = {nodeId:id,part:'props.backText'};
        back = h('button',{'data-dsh-node':map(actual + ':back:button',address),type:'button','data-nav-back':true,'data-schema-action':props.back},h('span',{'data-dsh-node':map(actual + ':back',address)},escape(props.backText || '返回')));
      } else if (props.back) back = button(actual,{id:'back',text:props.backText || '返回',action:props.back},0);
      else if (tag) back = h('span',{'data-dsh-node':actual + ':leading','aria-hidden':'true'});
      return h(tag || 'header',{...attrs,class:'schema-nav'},back + title + children());
    }
    if (node.use === 'steps') return h('ol',{...attrs,class:'schema-steps'},(props.items || []).map(item => h('li',{'data-dsh-node':actual + ':' + item.id,'data-schema-step':item.id},escape(item.label))).join(''));
    if (node.use === 'tabs') {
      const active = valueAt(props.bind), tabs = (props.items || []).map(item => h('button',{'data-dsh-node':actual + ':tab:' + item.id,type:'button','data-tab':item.id,'data-schema-tab':item.id,role:'tab'},escape(item.label))).join('');
      const panels = (props.items || []).map(item => h('section',{'data-dsh-node':actual + ':panel:' + item.id,'data-panel':item.id,hidden:active !== item.id},render(item.nodeId,context,prefix))).join('');
      return h(tagFor('tabs'),{...attrs,value:active},h('div',{'data-dsh-node':actual + ':tablist','data-tab-list':true,role:'tablist'},tabs) + panels);
    }
    if (node.use === 'table') {
      const columns = props.columns || [], records = collectionRecords(props.source,props.key || 'id'), actionItems = props.actions || [];
      const heading = columns.map(column => h('th',{'data-dsh-node':actual + ':heading:' + column.id,scope:'col'},escape(column.title))).join('') + (actionItems.length ? h('th',{'data-dsh-node':actual + ':heading:actions',scope:'col'},'操作') : '');
      const rows = records.map(item => {
        const key = String(item[props.key || 'id']), rowId = actual + ':' + rowKey(key);
        const cells = columns.map(column => h('td',{'data-dsh-node':map(rowId + ':' + column.id,{nodeId:id,part:'record',source:props.source,recordKey:key,keyField:props.key || 'id',field:column.id}),'data-schema-column':column.id},escape(item[column.id]))).join('');
        return h('tr',{'data-dsh-node':map(rowId,{nodeId:id,part:'row',source:props.source,recordKey:key,keyField:props.key||'id'}),'data-schema-row':key,'data-schema-record-key':props.key || 'id'},cells + (actionItems.length ? h('td',{'data-dsh-node':rowId + ':actions'},actionItems.map((item,index) => button(actual,item,index,rowId + ':')).join('')) : ''));
      }).join('');
      return h(tagFor('table'),{...attrs,'data-schema-collection':props.source},h('table',{'data-dsh-node':actual + ':table'},h('thead',{'data-dsh-node':actual + ':head'},h('tr',{'data-dsh-node':actual + ':head-row'},heading)) + h('tbody',{'data-dsh-node':actual + ':rows'},rows))) + h('p',{'data-dsh-node':actual + ':empty',class:'schema-empty',hidden:records.length > 0},escape(props.emptyText || '暂无记录'));
    }
    fail('SCHEMA_COMPONENT_UNAVAILABLE','Unsupported component',{nodeId:id,use:node.use});
  };
  let content = render(spec.root);
  for (const [id,node] of Object.entries(spec.nodes)) if (['dialog','drawer'].includes(node.use) && !rendered.has(id)) content += render(id);
  const sceneItems = Object.entries(spec.scenes).map(([id,scene]) => ({id,name:scene.name,nodes:{}}));
  const referencedURLs = {};
  const visitAction = action => {
    if (Array.isArray(action)) {action.forEach(visitAction);return;}
    if (!action || typeof action !== 'object') return;
    if (action.type === 'navigate' && Object.hasOwn(pageURLs,action.pageId)) referencedURLs[action.pageId] = pageURLs[action.pageId];
    for (const key of ['steps','onValid','onInvalid','then','else']) if (action[key]) visitAction(action[key]);
  };
  Object.values(spec.actions).forEach(visitAction);
  const metadata = {schemaVersion:1,scenes:{active:null,items:sceneItems},interactions:[],states:{},responsive:{},definitions:{},overrides:{},runtime:{mode:'preview',pageURLs:referencedURLs}};
  const links = Object.entries(binding.resources || {}).filter(([logical]) => logical === 'theme.css').map(([,resource]) => h('link',{rel:'stylesheet',href:resource.url})).join('');
  const script = binding.resources?.['components.js'] ? h('script',{src:binding.resources['components.js'].url,defer:true}) : '';
  const config = {spec,formFields,roles:{button:manifest?tags.get('button'):'button',select:tags.get('select'),radio:tags.get('radio')}};
  const runtime = h('script',{'data-dsh-schema-runtime':true},'(' + installSchemaRuntime.toString() + ')(' + json(config) + ',' + schemaRecordId.toString() + ',' + schemaNodeId.toString() + ');');
  const feedback = h('div',{'data-dsh-node':'schema-feedback',class:'schema-feedback',role:'status',hidden:true},'');
  let html = '<!DOCTYPE html>' + h('html',{lang:'zh-CN','data-dsh-node':'schema-html'},h('head',{},h('meta',{charset:'utf-8'}) + h('meta',{name:'viewport',content:'width=device-width,initial-scale=1,viewport-fit=cover'}) + h('title',{},escape(spec.title || spec.id)) + links + h('style',{},schemaStyles(mobile) + '\n' + (spec.css || '')) + script + h('script',{id:'dsh-document-model',type:'application/json'},json(metadata))) + h('body',{'data-dsh-node':'schema-body',class:(binding.rootClass || 'ds-theme') + (mobile ? ' ds-mobile schema-mobile' : '')},content + feedback + runtime + (spec.script ? h('script',{'data-dsh-schema-extension':true},spec.script.replace(/<\/script/gi,'<\\/script')) : '')));
  const normalized = normalizeDocument(html);
  html = normalized.html;
  for (let offset = 0; offset < (spec.documentOperations?.length || 0); offset += 100) html = applyDocumentOperations(html,spec.documentOperations.slice(offset,offset + 100),{scopeMode:'page'}).html;
  return {html,spec,sourceMap,formFields,diagnostics:[],compilerVersion:SCHEMA_COMPILER_VERSION,sourceHash:schemaHash(spec),sceneIds:sceneItems.map(item => item.id),components:[...new Set(Object.values(spec.nodes).filter(node => node.kind === 'component').map(node => node.use))]};
}

function schemaStyles(mobile) {
  return [
    '*{box-sizing:border-box}[hidden]{display:none!important}',
    'body{margin:0;font:var(--ds-font-size,14px)/var(--ds-line-height,1.5) var(--ds-font-family,system-ui,sans-serif);color:var(--ds-text,#202535);background:var(--ds-background,#f7f8fa)}',
    '.schema-layout{min-width:0;display:flex}.schema-stack{flex-direction:column}.schema-row{flex-direction:row;align-items:center}.schema-grid{display:grid}.schema-free{position:relative;display:block}',
    'body>section,body>main{width:100%;min-height:100vh;padding:' + (mobile ? 'var(--ds-page-padding,16px)' : '32px') + ';margin:0 auto}',
    'h1,h2,h3,h4,p{margin:0}h1{font-size:' + (mobile ? '20px' : '24px') + ';line-height:1.4}h2{font-size:' + (mobile ? '18px' : '18px') + '}',
    'img{max-width:100%;object-fit:cover}ds-card,ds-table,ds-alert,ds-nav-bar{display:block}',
    '.schema-fields{display:grid;gap:calc(var(--ds-spacing,8px)*2)}.schema-field{display:grid;align-content:start;gap:var(--ds-spacing,8px);min-width:0}.schema-field>label{font-weight:500}',
    '.schema-field :is(ds-input,ds-select,ds-textarea),.schema-native-control,.schema-native-control :is(input:not([type=checkbox]),select,textarea){width:100%}',
    '.schema-help{color:var(--ds-text-secondary,#646566);font-size:12px}.schema-error{color:var(--ds-danger,#ee0a24);font-size:12px}',
    '.schema-radio-group{display:flex;min-width:0;align-items:center;flex-wrap:wrap;gap:0 calc(2 * var(--ds-spacing,8px))}.schema-radio-group label{display:inline-flex;align-items:center;gap:0;cursor:pointer}.schema-radio-group>label{gap:var(--ds-spacing,8px);min-height:var(--ds-control-height,32px)}.schema-radio-group input{accent-color:var(--ds-primary)}',
    '[data-schema-required]:not(:has(.req-mark))::after{content:" *";color:var(--ds-danger-active,var(--ds-danger,#c43d38))}',
    '.schema-actions{display:flex;justify-content:flex-end;gap:var(--ds-spacing,8px);padding-top:calc(var(--ds-spacing,8px)*3);flex-wrap:wrap}',
    '.schema-feedback{position:fixed;z-index:1000;left:50%;top:24px;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:12px 20px;border-radius:var(--ds-radius,6px);background:var(--ds-surface,#fff);color:var(--ds-text,#202535);box-shadow:0 4px 24px #0002;border:1px solid var(--ds-border,#d9d9d9)}',
    '.schema-feedback[tone=error]{color:var(--ds-danger,#ee0a24)}.schema-feedback[tone=success]{border-color:var(--ds-success,#07c160)}',
    'header:has(> :is([data-overlay-close],[data-ds-close],button.dialog-close):not([data-schema-dismiss]))>[data-schema-dismiss]{display:none!important}',
    'dialog[data-schema-definition]>header{display:flex;align-items:center;justify-content:space-between;gap:var(--ds-spacing,8px)}',
    'dialog[data-schema-definition]>header>[data-schema-dismiss]{display:grid;place-items:center;padding:0;min-width:var(--ds-touch-target,24px);min-height:var(--ds-touch-target,24px);border:0;border-radius:var(--ds-radius,4px);color:var(--ds-muted,#646566);background:transparent;font:inherit;font-size:22px;cursor:pointer}',
    'dialog[data-schema-definition]>header>[data-schema-dismiss]:hover{background:var(--ds-background,#f5f5f5);color:var(--ds-text,#202535)}',
    '.schema-empty{padding:24px;text-align:center;color:var(--ds-text-secondary,#646566)}',
    'header.schema-nav{display:flex;align-items:center;gap:16px;justify-content:space-between}.schema-steps{display:flex;gap:16px;list-style:none;padding:0}.schema-steps [aria-current=step]{color:var(--ds-primary,#1677ff);font-weight:600}',
    '.schema-native-tag{display:inline-block;width:fit-content;padding:0 var(--ds-spacing,8px);font-size:var(--ds-font-size-sm,12px);border:1px solid var(--schema-tag-border,var(--ds-border,#d9d9d9));border-radius:var(--ds-radius,4px);background:var(--schema-tag-bg,var(--ds-background,#fafafa));color:var(--schema-tag-text,var(--ds-text,#262626))}',
    ...[['primary','#0958d9'],['success','#237804'],['warning','#874d00'],['danger','#a8071a']].map(([tone,fallback]) => '.schema-native-tag[tone='+tone+']{--schema-tag-text:var(--ds-'+tone+'-active,var(--ds-'+tone+','+fallback+'));--schema-tag-bg:var(--ds-'+tone+'-soft,var(--ds-surface,#fff));--schema-tag-border:var(--ds-'+tone+'-border,currentColor)}'),
    '.schema-native-tag[plain]{background:transparent;border-color:currentColor}',
    '.schema-native-control input,.schema-native-control select,.schema-native-control textarea{font:inherit;padding:7px 10px;border:1px solid var(--ds-border,#d9d9d9);border-radius:var(--ds-radius,6px);background:var(--ds-surface,#fff);color:inherit}',
    'section>button{font:inherit}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--ds-primary,#1677ff);outline-offset:2px}',
    'div[data-schema-owner][id]:not([open]){display:none}div[data-schema-owner][id][open]{position:fixed;inset:20% 20%;z-index:100;background:var(--ds-surface,#fff);padding:24px;border:1px solid var(--ds-border,#d9d9d9);border-radius:12px}',
    mobile ? '.schema-mobile .schema-actions{padding:16px;gap:12px}.schema-mobile .schema-actions>ds-button{flex:1}.schema-mobile .mobile-field .schema-error,.schema-mobile .mobile-field .schema-help{grid-column:1/-1}.schema-mobile .schema-feedback{top:40%;}' : '',
    '@media(max-width:680px){.schema-fields{grid-template-columns:1fr!important}.schema-row{flex-wrap:wrap}}',
    'html[data-dsh-view-mode=edit] body>section,html[data-dsh-view-mode=edit] body>main{min-height:0}',
  ].join('\n');
}
