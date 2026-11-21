import {parse} from 'parse5';
import {CSS_FIELDS} from './property-model.js';

// Serialized into the preview bridge. Repeated records need their own stable
// identity before a style can be written back into the saved HTML.
export function runtimeSelector(node){
  const name=/^[a-zA-Z_][\w-]*$/,value=/^[\w-]{1,160}$/;
  const path=[];
  for(let el=node;el&&el!==document.body&&path.length<12;el=el.parentElement){
    const tag=el.localName;
    if(!name.test(tag))return null;
    for(const attr of ['id','aria-labelledby','data-product-id','data-item-id','data-id','data-key']){
      const key=el.getAttribute(attr);
      if(!key||!value.test(key))continue;
      const anchor=tag+'['+attr+'="'+key+'"]';
      const selector=[anchor,...path].join(' > ');
      if(document.querySelectorAll(anchor).length===1&&document.querySelectorAll(selector).length===1&&node.matches(selector))return selector;
    }
    if(el.hasAttribute('data-dsh-node'))break;
    path.unshift([tag,...Array.from(el.classList).filter(c=>name.test(c))].join('.'));
  }
  return null;
}

const properties=new Set(['translate','content','object-fit','object-position',...CSS_FIELDS.map(([name])=>name)]);
export function applyRuntimeStyle(html,selector,styles){
  if(typeof selector!=='string'||selector.length>1600||!/^\w[\w-]*\[(?:id|aria-labelledby|data-product-id|data-item-id|data-id|data-key)="[\w-]+"\](?: > [\w-]+(?:\.[\w-]+)*)*$/.test(selector))throw Error('元素缺少唯一的样式定位。');
  const tree=parse(html,{sourceCodeLocationInfo:true});
  const head=tree.childNodes.find(n=>n.tagName==='html')?.childNodes.find(n=>n.tagName==='head');
  if(!head?.sourceCodeLocation?.endTag)throw Error('设计稿缺少可保存样式的 head。');
  const key=encodeURIComponent(selector),prior=head.childNodes.find(n=>n.tagName==='style'&&n.attrs.some(a=>a.name==='data-dsh-object-style'&&a.value===key));
  const sheet=new CSSStyleSheet();
  sheet.replaceSync(prior?prior.childNodes.map(n=>n.value).join(''):selector+'{}');
  const rule=sheet.cssRules[0];
  if(sheet.cssRules.length!==1||!(rule instanceof CSSStyleRule))throw Error('该元素的样式规则无效。');
  for(const [property,value] of Object.entries(styles)){
    if(!properties.has(property))throw Error('不支持此样式属性。');
    if(value==null||value===''){rule.style.removeProperty(property);continue;}
    if(typeof value!=='string'||/[<>]/.test(value)||!CSS.supports(property,value))throw Error('样式值无效。');
    rule.style.setProperty(property,value,'important');
  }
  if(rule.cssText.includes('<'))throw Error('样式包含无效字符。');
  const css=rule.style.length?'<style data-dsh-object-style="'+key+'">'+rule.cssText+'</style>':'';
  const start=prior?.sourceCodeLocation.startOffset??head.sourceCodeLocation.endTag.startOffset;
  return html.slice(0,start)+css+html.slice(prior?.sourceCodeLocation.endOffset??start);
}
