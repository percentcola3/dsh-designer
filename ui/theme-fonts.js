import {systemBytesBase64} from './system-resource.js';

const formats={woff2:'woff2',woff:'woff',ttf:'truetype',otf:'opentype'};

export function themeFont(file){
  const path=file.logicalPath||file.path||'';
  const match=/^assets\/fonts\/([a-f0-9]{32})\.(woff2?|ttf|otf)$/.exec(path);
  if(!match)return null;
  const [,id,extension]=match, family='DSHFont'+id;
  return {file,path,family,value:family+', sans-serif',extension,label:file.name||path.split('/').pop()};
}

export async function importThemeFont(file){
  const extension=file.name.split('.').pop().toLowerCase();
  if(!Object.hasOwn(formats,extension))throw new Error('请选择 WOFF2、WOFF、TTF 或 OTF 字体。');
  if(file.size>64*1024*1024)throw new Error('单个规范资源最多 64 MiB。');
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  const magic=String.fromCharCode(...bytes.slice(0,4));
  const signatures={woff2:['wOF2'],woff:['wOFF'],ttf:['\x00\x01\x00\x00','true'],otf:['OTTO']};
  if(!signatures[extension].includes(magic))throw new Error('文件内容与字体格式不符。');
  try{await new FontFace('DSHFontCheck',buffer).load();}catch{throw new Error('浏览器无法读取这个字体文件。');}
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));
  const id=Array.from(digest.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return themeFont({logicalPath:'assets/fonts/'+id+'.'+extension,name:file.name,mimeType:'font/'+extension,bytesBase64:systemBytesBase64(bytes)});
}

export function themeFontFace(font,src=font?.path){
  if(!font||!src)return '';
  return '@font-face{font-family:'+font.family+';src:url("'+src+'") format("'+formats[font.extension]+'");font-display:swap;}\n';
}
