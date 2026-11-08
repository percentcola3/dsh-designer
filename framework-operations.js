import {randomUUID} from 'node:crypto';
import {parse as parseJS} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parse as parseSFC} from '@vue/compiler-sfc';
import {sourceElement} from './framework-compiler.js';

const traverse=traverseModule.default||traverseModule;
const SOURCE='data-dsh-source';
const REFERENCES=new Set(['htmlFor','for','aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-activedescendant','aria-details','aria-errormessage','aria-flowto','headers']);
const LINKS=new Set(['href','xlinkHref','xlink:href']);
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function fail(code,message){throw Object.assign(new Error(message),{code});}
const fresh=()=>`src_${randomUUID().replaceAll('-','')}`;
const quote=value=>JSON.stringify(value);
const html=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const camel=name=>name.startsWith('--')?name:name.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g,(_match,c)=>c.toUpperCase());
function splice(code,edits){let next=code;for(const edit of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,edit.start)+edit.text+next.slice(edit.end);return next;}
function literal(attr){if(attr?.value?.type==='StringLiteral')return attr.value.value;if(attr?.value?.type==='JSXExpressionContainer'&&attr.value.expression.type==='StringLiteral')return attr.value.expression.value;return undefined;}
function attrName(attr){return attr.name?.type==='JSXNamespacedName'?`${attr.name.namespace.name}:${attr.name.name.name}`:attr.name?.name;}
function openingEnd(code,start){let quote;for(let i=start;i<code.length;i++){const c=code[i];if(quote){if(c===quote)quote=undefined;}else if(c==='"'||c==="'")quote=c;else if(c==='>')return i+1;}fail('SOURCE_PARSE_ERROR','Unterminated source opening tag.');}

function inspect(options,nodeId){
  const selected=sourceElement({...options,nodeId});
  if(options.framework==='react'){
    const ast=parseJS(options.code,{sourceType:'unambiguous',plugins:[...(/\.[cm]?ts$/.test(options.path)?[]:['jsx']),'typescript','decorators-legacy']});
    const nodes=[];let target;
    traverse(ast,{JSXElement(p){nodes.push(p.node);if(p.node.start===selected.start)target=p;}});
    if(!target)fail('SOURCE_ELEMENT_NOT_FOUND','The selected JSX source node is unavailable.');
    return {selected,node:target.node,parent:target.parentPath,children:target.node.children,nodes:nodes.filter(n=>n.start>=selected.start&&n.end<=selected.end)};
  }
  const parsed=parseSFC(options.code,{filename:options.path});
  if(parsed.errors.length)fail('SOURCE_PARSE_ERROR','The Vue source cannot be parsed.');
  const nodes=[];let target;
  function walk(node,parent){if(node.type===1){nodes.push(node);if(node.loc.start.offset===selected.start)target={node,parent};}for(const child of node.children||[])walk(child,node);}
  walk(parsed.descriptor.template.ast,null);
  if(!target)fail('SOURCE_ELEMENT_NOT_FOUND','The selected Vue source node is unavailable.');
  return {selected,...target,children:target.node.children,nodes:nodes.filter(n=>n.loc.start.offset>=selected.start&&n.loc.end.offset<=selected.end)};
}

function textChange(options,found,text){
  if(typeof text!=='string'||text.length>100000)fail('INVALID_SOURCE_OPERATION','Text must be a string of at most 100000 characters.');
  const {node}=found;
  const tag=options.framework==='react'?node.openingElement.name.type==='JSXIdentifier'&&node.openingElement.name.name:node.tag;
  if(VOID.has(tag))fail('SOURCE_DYNAMIC_TEXT','A native void element cannot contain editable text.');
  if(options.framework==='react'){
    if(node.openingElement.attributes.some(a=>a.type==='JSXSpreadAttribute'||a.type==='JSXAttribute'&&['children','dangerouslySetInnerHTML'].includes(attrName(a)))||node.children.some(child=>child.type!=='JSXText'&&!(child.type==='JSXExpressionContainer'&&child.expression.type==='StringLiteral')))fail('SOURCE_DYNAMIC_TEXT','Only a source element containing plain text can be changed as text.');
    const value=`{${quote(text)}}`;
    if(node.openingElement.selfClosing){const opening=options.code.slice(node.start,node.openingElement.end).replace(/\/>$/,'>'),tag=options.code.slice(node.openingElement.name.start,node.openingElement.name.end);return {start:node.start,end:node.end,text:opening+value+`</${tag}>`};}
    return {start:node.openingElement.end,end:node.closingElement.start,text:value};
  }
  if(node.props.some(p=>p.type===7&&(['text','html'].includes(p.name)||p.name==='bind'&&(!p.arg||['innerHTML','textContent'].includes(p.arg.content))))||node.children.some(child=>child.type!==2))fail('SOURCE_DYNAMIC_TEXT','Only a Vue source element containing plain text can be changed as text.');
  // Numeric entities prevent a literal {{...}} from becoming a new Vue binding.
  const value=html(text).replaceAll('{','&#123;').replaceAll('}','&#125;'),end=openingEnd(options.code,node.loc.start.offset);
  if(node.isSelfClosing){const opening=options.code.slice(node.loc.start.offset,end).replace(/\/>$/,'>');return {start:node.loc.start.offset,end:node.loc.end.offset,text:opening+value+`</${node.tag}>`};}
  const close=options.code.lastIndexOf('</',node.loc.end.offset-1);
  // HTML void elements cannot acquire children without changing their tag.
  if(close<end)fail('SOURCE_DYNAMIC_TEXT','A void source element cannot contain editable text.');
  return {start:end,end:close,text:value};
}

function stylesInput(styles){
  if(!styles||typeof styles!=='object'||Array.isArray(styles))fail('INVALID_SOURCE_OPERATION','Styles must be a property-to-value object.');
  const entries=Object.entries(styles);
  if(!entries.length||entries.length>100)fail('INVALID_SOURCE_OPERATION','Choose between one and 100 style properties.');
  for(const [name,value] of entries){
    if(!/^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/.test(name)||name.length>100)fail('INVALID_SOURCE_OPERATION','Use a CSS property name.');
    if(value!==null&&!(typeof value==='string'&&value.length<=10000)&&!(typeof value==='number'&&Number.isFinite(value)))fail('INVALID_SOURCE_OPERATION','Style values must be finite numbers, strings or null.');
  }
  return entries;
}
function propertyName(property){
  if(property.type!=='ObjectProperty'&&property.type!=='ObjectMethod')return undefined;
  if(property.key.type==='StringLiteral'||property.key.type==='NumericLiteral')return String(property.key.value);
  return !property.computed&&property.key.type==='Identifier'?property.key.name:undefined;
}
function reactStyles(options,found,entries){
  const {openingElement:opening}=found.node,attributes=opening.attributes.filter(a=>a.type==='JSXAttribute'&&attrName(a)==='style');
  if(attributes.length>1)fail('SOURCE_DYNAMIC_STYLE','An element with multiple style attributes cannot be safely changed.');
  const attr=attributes[0],expression=attr?.value?.type==='JSXExpressionContainer'?attr.value.expression:null;
  const remove=entries.some(([,value])=>value===null),keys=new Set(entries.map(([key])=>camel(key)));
  if(opening.attributes.some(a=>a.type==='JSXSpreadAttribute'&&(!attr||a.start>attr.end)))fail('SOURCE_DYNAMIC_STYLE','A later business spread supplies an unknown style binding; edit that binding in source.');
  let existing=[];
  if(attr){
    if(expression?.type==='ObjectExpression'){
      if(remove&&expression.properties.some(p=>p.type==='SpreadElement'||propertyName(p)===undefined))fail('SOURCE_DYNAMIC_STYLE','A dynamic style object may supply the removed property; edit its binding in source.');
      existing=expression.properties.filter(p=>!keys.has(camel(propertyName(p)||''))).map(p=>options.code.slice(p.start,p.end));
    }else{
      if(!expression||expression.type==='JSXEmptyExpression'||remove)fail('SOURCE_DYNAMIC_STYLE','The dynamic style binding cannot safely remove an inline property.');
      existing=[`...(${options.code.slice(expression.start,expression.end)})`];
    }
  }
  const pairs=entries.filter(([,value])=>value!==null).map(([name,value])=>`${quote(camel(name))}: ${quote(value)}`),body=[...existing,...pairs].join(', '),replacement=`style={{${body}}}`;
  if(attr)return [{start:attr.start,end:attr.end,text:replacement}];
  const insert=opening.end-(opening.selfClosing?2:1);
  return [{start:insert,end:insert,text:' '+replacement}];
}

// Split only top-level CSS declarations: quoted semicolons, functions, custom
// properties and comments are retained rather than parsed with a naive split.
function declarations(text){
  const result=[];let start=0,quote,depth=0,comment=false,escaped=false;
  for(let i=0;i<=text.length;i++){
    const c=text[i],next=text[i+1];
    if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=undefined;continue;}
    if(c==='/'&&next==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='('||c==='['||c==='{')depth++;else if(c===')'||c===']'||c==='}')depth--;
    if(depth<0)fail('SOURCE_DYNAMIC_STYLE','The static style declaration is malformed.');
    if((c===';'&&depth===0)||i===text.length){const raw=text.slice(start,i),clean=raw.replace(/\/\*[\s\S]*?\*\//g,'').trim();if(clean){const at=clean.indexOf(':');if(at<1)fail('SOURCE_DYNAMIC_STYLE','The static style declaration cannot be safely edited.');result.push({name:clean.slice(0,at).trim(),raw});}start=i+1;}
  }
  if(quote||comment||depth)fail('SOURCE_DYNAMIC_STYLE','The static style declaration is malformed.');
  return result;
}
function vueStyles(options,found,entries){
  const {node}=found;
  if(node.props.some(p=>p.type===7&&p.name==='bind'&&(!p.arg||p.arg.content==='style')))fail('SOURCE_DYNAMIC_STYLE','This Vue style is dynamically bound; edit its binding in source.');
  const attrs=node.props.filter(p=>p.type===6&&p.name==='style');
  if(attrs.length>1)fail('SOURCE_DYNAMIC_STYLE','An element with multiple style attributes cannot be safely changed.');
  const attr=attrs[0],keys=new Set(entries.map(([key])=>key.startsWith('--')?key:key.toLowerCase()));
  const kept=declarations(attr?.value?.content||'').filter(p=>!keys.has(p.name.startsWith('--')?p.name:p.name.toLowerCase())).map(p=>p.raw);
  for(const [key,value] of entries)if(value!==null){
    // A style field is one declaration, never an opportunity to inject siblings.
    const parts=declarations(`${key}:${value}`);if(parts.length!==1||parts[0].name!==key)fail('INVALID_SOURCE_OPERATION','A style value must contain exactly one CSS declaration.');
    kept.push(`${key}: ${value}`);
  }
  const value=kept.join(';')+(kept.length?';':''),replacement=`style="${html(value)}"`;
  if(attr)return [{start:attr.loc.start.offset,end:attr.loc.end.offset,text:replacement}];
  const end=openingEnd(options.code,node.loc.start.offset),insert=end-(options.code[end-2]==='/'?2:1);
  return [{start:insert,end:insert,text:' '+replacement}];
}

function guardVueBranch(found,type){
  if(!found.node.props.some(p=>p.type===7&&['if','else-if'].includes(p.name)))return;
  const siblings=found.parent?.children||[],at=siblings.indexOf(found.node),next=siblings.slice(at+1).find(node=>node.type!==3&&!(node.type===2&&!node.content.trim()));
  if(next?.type===1&&next.props.some(p=>p.type===7&&['else','else-if'].includes(p.name)))fail(type==='node.delete'?'SOURCE_DYNAMIC_DELETE':'SOURCE_DYNAMIC_DUPLICATE','This Vue node owns a conditional chain; edit the complete branch structure in source.');
}
function reactAttrs(node){return node.openingElement.attributes;}
function vueAttrs(node){return node.props;}
function sourceId(node,framework){const attrs=framework==='react'?reactAttrs(node):vueAttrs(node);const attr=attrs.find(a=>framework==='react'?a.type==='JSXAttribute'&&attrName(a)===SOURCE:a.type===6&&a.name===SOURCE);return framework==='react'?literal(attr):attr?.value?.content;}
function duplicate(options,found){
  const react=options.framework==='react',idMap=new Map(),newSourceIds=new Map(),edits=[];
  for(const node of found.nodes){
    const source=sourceId(node,options.framework);if(!source)fail('SOURCE_ID_REQUIRED','Normalize and persist all source IDs before duplicating a subtree.');newSourceIds.set(source,fresh());
    for(const attr of react?reactAttrs(node):vueAttrs(node)){
      if(react&&attr.type==='JSXSpreadAttribute'||!react&&attr.type===7&&attr.name==='bind'&&!attr.arg)fail('SOURCE_DYNAMIC_DUPLICATE','A business spread may contain an ID or key; duplicate it in source.');
      if(!react&&attr.type===7&&['else','else-if','for'].includes(attr.name))fail('SOURCE_DYNAMIC_DUPLICATE','Duplicating a Vue loop or conditional branch requires editing its source structure.');
      const name=react?attrName(attr):attr.type===6?attr.name:attr.name==='bind'?attr.arg?.content:undefined;
      if(name==='id'){
        const value=react?literal(attr):attr.type===6?attr.value?.content:undefined;
        if(value===undefined||!value||idMap.has(value))fail('SOURCE_DYNAMIC_DUPLICATE','Business IDs must be unique static strings to duplicate this subtree.');
        idMap.set(value,`${value}--copy-${randomUUID().replaceAll('-','')}`);
      }
    }
  }
  const changeAttribute=(attr,value)=>{
    if(react)edits.push({start:attr.start,end:attr.end,text:`${attrName(attr)}={${quote(value)}}`});
    else edits.push({start:attr.loc.start.offset,end:attr.loc.end.offset,text:`${attr.name}="${html(value)}"`});
  };
  for(const node of found.nodes){
    for(const attr of react?reactAttrs(node):vueAttrs(node)){
      const name=react?attrName(attr):attr.type===6?attr.name:attr.name==='bind'?attr.arg?.content:undefined;
      if(!name)continue;
      const value=react?literal(attr):attr.type===6?attr.value?.content:undefined;
      if(name===SOURCE)changeAttribute(attr,newSourceIds.get(value));
      else if(name==='id')changeAttribute(attr,idMap.get(value));
      else if(REFERENCES.has(name)||LINKS.has(name)){
        if(value===undefined&&idMap.size)fail('SOURCE_DYNAMIC_DUPLICATE','A dynamic ID reference cannot be rewritten safely when duplicating.');
        if(value!==undefined){const next=LINKS.has(name)?value.startsWith('#')&&idMap.has(value.slice(1))?'#'+idMap.get(value.slice(1)):value:value.split(/(\s+)/).map(part=>idMap.get(part)||part).join('');if(next!==value)changeAttribute(attr,next);}
      }
    }
  }
  const child=react&&['JSXElement','JSXFragment'].includes(found.parent?.node.type),rootAttrs=react?reactAttrs(found.node):vueAttrs(found.node),key=rootAttrs.find(a=>react?a.type==='JSXAttribute'&&attrName(a)==='key':a.type===6&&a.name==='key'||a.type===7&&a.name==='bind'&&a.arg?.content==='key');
  if(key){
    if(react&&!child)fail('SOURCE_DUPLICATE_KEY','Duplicating a keyed JSX expression requires an explicit keyed container in source.');
    if(!react&&key.type!==6)fail('SOURCE_DUPLICATE_KEY','Duplicating a dynamically keyed Vue node requires editing its source binding.');
    changeAttribute(key,newSourceIds.get(found.selected.id));
  }
  const original=options.code.slice(found.selected.start,found.selected.end),copy=splice(options.code,edits).slice(found.selected.start,found.selected.end+edits.reduce((sum,e)=>sum+e.text.length-(e.end-e.start),0));
  return {edit:{start:found.selected.start,end:found.selected.end,text:react&&!child?`<>${original}${copy}</>`:original+copy},selectedSourceIds:[newSourceIds.get(found.selected.id)],createdSourceIds:[...newSourceIds.values()]};
}

/** Apply up to 100 ordered, atomic source-ID operations without printing a file.
 * Full file sourceHash checks and owner admission belong to the calling service.
 */
export function applyFrameworkOperations({framework,path,code,operations}){
  if(!['react','vue'].includes(framework))fail('UNSUPPORTED_FRAMEWORK','Choose React or Vue source operations.');
  if(typeof code!=='string')fail('INVALID_SOURCE','Source code must be a string.');
  if(!Array.isArray(operations)||!operations.length||operations.length>100)fail('INVALID_SOURCE_OPERATION','Choose between one and 100 source operations.');
  let next=code,selectedSourceIds=[];const changes=[];
  for(const operation of operations){
    if(!operation||!['text.set','style.set','node.duplicate','node.delete'].includes(operation.type)||!Array.isArray(operation.nodeIds)||!operation.nodeIds.length||operation.nodeIds.length>100||operation.nodeIds.some(id=>typeof id!=='string'||!id))fail('INVALID_SOURCE_OPERATION','Each operation needs a supported type and one to 100 source node IDs.');
    const ids=[...new Set(operation.nodeIds)];selectedSourceIds=[];
    for(const nodeId of ids){
      const options={framework,path,code:next},found=inspect(options,nodeId);let edits,selected=[nodeId],createdSourceIds;
      if(framework==='vue'&&['node.duplicate','node.delete'].includes(operation.type))guardVueBranch(found,operation.type);
      if(operation.type==='text.set')edits=[textChange(options,found,operation.text)];
      else if(operation.type==='style.set'){const entries=stylesInput(operation.styles);edits=framework==='react'?reactStyles(options,found,entries):vueStyles(options,found,entries);}
      else if(operation.type==='node.delete'){edits=[{start:found.selected.start,end:found.selected.end,text:framework==='react'&&!['JSXElement','JSXFragment'].includes(found.parent?.node.type)?'null':''}];selected=[];}
      else{const copy=duplicate(options,found);edits=[copy.edit];selected=copy.selectedSourceIds;createdSourceIds=copy.createdSourceIds;}
      const changed=splice(next,edits);
      // Validate IDs and syntax without normalizing or changing outside bytes.
      if(selected.length)sourceElement({framework,path,code:changed,nodeId:selected[0]});
      else if(framework==='react')parseJS(changed,{sourceType:'unambiguous',plugins:[...(/\.[cm]?ts$/.test(path)?[]:['jsx']),'typescript','decorators-legacy']});
      else{const parsed=parseSFC(changed,{filename:path});if(parsed.errors.length)fail('SOURCE_PARSE_ERROR','The operation would produce invalid Vue source.');}
      next=changed;selectedSourceIds.push(...selected);changes.push({type:operation.type,nodeIds:[nodeId],...(createdSourceIds?{createdSourceIds}:{}),changed:changed!==options.code});
    }
  }
  return {code:next,changes,selectedSourceIds:[...new Set(selectedSourceIds)],diagnostics:[]};
}
