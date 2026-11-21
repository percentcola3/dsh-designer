import React from 'react';

function colorHex(value){
  if(/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value))return value.toUpperCase();
  if(/^#[\da-f]{3,4}$/i.test(value))return '#'+[...value.slice(1)].map(c=>c+c).join('').toUpperCase();
  if(value==='transparent')return '#00000000';
  const rgb=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
  if(!rgb)return null;
  const channels=rgb.slice(1,4).map(Number);
  if(rgb[4]!==undefined&&Number(rgb[4])<1)channels.push(Math.round(Number(rgb[4])*255));
  return '#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
}

function ColorField({id,title,value,mixed,disabled,onValue,onCommit}){
  const [typing,setTyping]=React.useState(false);
  const hex=colorHex(value);
  // The native picker sends input while scrubbing and change on confirmation.
  const picker=React.useRef(null),commit=React.useRef(onCommit);
  commit.current=onCommit;
  React.useEffect(()=>{
    const node=picker.current,save=()=>commit.current();
    node.addEventListener('change',save);
    return ()=>node.removeEventListener('change',save);
  },[]);
  return <span className="ec-color-field">
    <span className="ec-color-chip" title={title+'色盘'}>
      <span style={{backgroundColor:mixed?'transparent':value}}/>
      <input ref={picker} type="color" aria-label={title+'色盘'} disabled={disabled} value={hex?.slice(0,7)||'#000000'} onInput={e=>{
        const alpha=hex?.slice(7);
        onValue(e.currentTarget.value+(alpha&&alpha!=='00'?alpha:''));
      }} onChange={()=>{}}/>
    </span>
    <input id={id} aria-label={title} type="text" spellCheck={false} disabled={disabled} placeholder={mixed?'混合值':'#RRGGBB'} value={typing?value:hex||value}
      onChange={e=>{setTyping(true);onValue(e.target.value);}} onBlur={()=>{setTyping(false);onCommit();}}/>
  </span>;
}

export default function StyleField({property,title,value='',mixed,disabled,onValue,onCommit}){
  const id=React.useId(),color=property==='color'||property==='background-color';
  return <div className="ec-style-field">
    <label htmlFor={id}>{title}</label>
    {color?<ColorField id={id} title={title} value={value} mixed={mixed} disabled={disabled} onValue={onValue} onCommit={onCommit}/>:
      <div className="ec-pixel-field"><input id={id} aria-label={title} type="number" step="any" min={property==='x'||property==='y'?undefined:0}
        value={value} disabled={disabled} placeholder={mixed?'多个值':'—'} onChange={e=>onValue(e.currentTarget.value)}
        onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={onCommit}/><span aria-hidden="true">px</span></div>}
  </div>;
}
