import React from 'react';
import {imageFrame} from './image-replacement.js';

const center={x:50,y:50};
const positions=['左上','居上','右上','居左','居中','居右','左下','居下','右下'];

export default function ImageReplacement({node,disabled,onReplace}){
  const input=React.useRef(null),locked=React.useRef(false),serial=React.useRef(0);
  const [file,setFile]=React.useState(null),[preview,setPreview]=React.useState(null),[fit,setFit]=React.useState('contain'),[position,setPosition]=React.useState(center);
  const [busy,setBusy]=React.useState(false),[dragging,setDragging]=React.useState(false),[error,setError]=React.useState(''),[saved,setSaved]=React.useState('');
  const frame=imageFrame(node);
  React.useEffect(()=>{
    if(!file)return;
    let active=true;
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{if(active)setPreview({url,width:image.naturalWidth,height:image.naturalHeight});};
    image.onerror=()=>{if(active)setError('无法读取图片，请重新选择图片文件。');};
    image.src=url;
    return ()=>{active=false;URL.revokeObjectURL(url);};
  },[file]);
  React.useEffect(()=>()=>{serial.current++;},[]);
  function choose(files){
    if(disabled||locked.current||!files?.length)return;
    serial.current++;setPreview(null);setFile(null);setSaved('');setError('');setPosition(center);setFit('contain');
    if(files.length!==1){setError('请一次选择一张替换图片。');return;}
    const selected=files[0];
    if(!selected.type.startsWith('image/')){setError('请选择图片或 SVG 文件。');return;}
    if(selected.size>64*1024*1024){setError('图片大小超过 64 MiB。');return;}
    setFile(selected);
  }
  async function save(){
    if(!preview||disabled||locked.current)return;
    const ticket=serial.current;
    locked.current=true;setBusy(true);setError('');
    try{
      await onReplace(file,{frame,fit,position},()=>ticket===serial.current);
      if(ticket===serial.current){setSaved('已替换图片');setFile(null);setPreview(null);}
    }catch(e){if(ticket===serial.current)setError(e.message||'图片替换失败。');}
    finally{locked.current=false;if(ticket===serial.current)setBusy(false);}
  }
  const targetRatio=frame?frame.width/frame.height:null;
  const suggest=preview&&targetRatio&&Math.abs(preview.width/preview.height/targetRatio-1)>0.015;
  const ratio=targetRatio||preview?.width/preview?.height||1;
  return <fieldset className="ec-image-replacement" disabled={disabled||busy}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=disabled||busy?'none':'copy';setDragging(!disabled&&!busy);}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragging(false);}}
    onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);choose(e.dataTransfer.files);}}>
    <legend>{node.tag==='svg'?'替换整个 SVG':'替换图片'}</legend>
    <input type="file" accept="image/*,.svg" hidden ref={input} onChange={e=>{choose(e.target.files);e.target.value='';}}/>
    <button type="button" className="ec-image-drop" data-dragging={dragging} onClick={()=>input.current?.click()}>{file?file.name:'选择图片或拖入文件'}</button>
    {preview&&<>
      <div className="ec-image-preview" style={{aspectRatio:ratio,width:`min(100%, ${160*ratio}px)`}}><img alt="替换效果预览" src={preview.url} style={{objectFit:fit,objectPosition:`${position.x}% ${position.y}%`}}/></div>
      <small>{preview.width} × {preview.height}{frame?` → ${Math.round(frame.width)} × ${Math.round(frame.height)}`:''}</small>
      {targetRatio&&<div className="ec-property-actions"><button type="button" aria-pressed={fit==='contain'} onClick={()=>{setFit('contain');setPosition(center);}}>显示全图</button><button type="button" aria-pressed={fit==='cover'} onClick={()=>setFit('cover')}>{suggest?'按元素比例裁切（建议）':'按元素比例裁切'}</button></div>}
      {fit==='cover'&&suggest&&<label>裁切位置<select value={position.y/50*3+position.x/50} onChange={e=>{const n=Number(e.target.value);setPosition({x:n%3*50,y:Math.floor(n/3)*50});}}>{positions.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label>}
      <div className="ec-property-actions"><button type="button" onClick={save}>应用替换</button><button type="button" onClick={()=>{setFile(null);setPreview(null);setError('');}}>取消</button></div>
    </>}
    {error&&<small role="alert" className="ec-property-error">{error}</small>}
    {(busy||saved)&&<small role="status">{busy?'正在替换…':saved}</small>}
  </fieldset>;
}
