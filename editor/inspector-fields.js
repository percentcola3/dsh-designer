import {translated} from './position-drag.js';

const media=new Set(['img','picture','svg','image','path','use','rect','line','circle','polygon','polyline','ellipse','video','canvas','iframe']);
const textTags=new Set(['p','span','h1','h2','h3','h4','h5','h6','label','button','a','input','textarea','select','option','strong','em','small']);

export function inspectorFields(objects){
  const fields=[['width','宽度'],['height','高度'],['x','横向位置'],['y','纵向位置']];
  if(objects.length&&objects.every(o=>!media.has(o.tag)&&(textTags.has(o.tag)||o.text?.trim()))){
    fields.push(['font-size','字号'],['color','文字颜色']);
  }
  fields.push(['background-color','背景颜色']);
  return fields;
}

const round=value=>Math.round(value*100)/100;
const isPosition=key=>key==='x'||key==='y';
const frame=o=>o.documentBounds||o.bounds;
export function fieldValue(objects,key){
  const values=objects.map(o=>{
    if(isPosition(key)||key==='width'||key==='height')return frame(o)?.[key];
    if(key==='font-size')return parseFloat(o.inspectorFontSize||o.styles?.['font-size']);
    return o.styles?.[key];
  }).map(value=>typeof value==='number'?(Number.isFinite(value)?round(value):''):value??'');
  if(isPosition(key)&&values.length&&values.every(Number.isFinite))return {value:Math.min(...values)};
  const mixed=values.some(v=>v!==values[0]);
  return {value:mixed?'':values[0]??'',mixed};
}

export function positionEditable(o){
  return !!frame(o)&&!o.transformed&&!['html','body'].includes(o.tag)&&
    /^(none|-?[\d.]+(?:px|%)(?: -?[\d.]+(?:px|%))?)$/.test(o.styles?.translate||'none');
}

export function inspectorStyles(object,values,origin){
  const styles={},delta=[0,0];
  for(const [key,value] of Object.entries(values)){
    if(key==='color'||key==='background-color'){
      if(value&&globalThis.CSS?.supports&&!CSS.supports(key,value))throw Error('请输入有效的颜色。');
      styles[key]=value||null;
      continue;
    }
    const n=Number(value);
    if(value===''||!Number.isFinite(n)||(!isPosition(key)&&n<0))throw Error('请输入有效的像素数值。');
    if(isPosition(key)){
      if(!positionEditable(object))throw Error('当前元素的位置无法直接调整。');
      delta[key==='x'?0:1]=n-origin[key];
    }else{
      const inset=object.inspectorInsets?.[key]||0;
      styles[key]=round(Math.max(0,n-inset))+'px';
    }
  }
  if(delta.some(Boolean))styles.translate=translated(object.styles?.translate,delta);
  if(object.styles?.display==='inline'&&!media.has(object.tag)&&
     (styles.translate||styles.width||styles.height))styles.display='inline-block';
  return styles;
}
