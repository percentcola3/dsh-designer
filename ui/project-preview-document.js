import {parse,serialize} from 'parse5';
import {trustedAssetRoot} from '../editor/bridge.js';

// Only prove the initial document is empty. Unknown markup or styling keeps the
// saved preview, including CSS-only designs and content removed by sandboxing.
function isBlankProjectPreviewDocument(doc){
  const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
  const text=node=>(node.childNodes||[]).filter(n=>n.nodeName==='#text').map(n=>n.value).join('');
  const blank=node=>{
    if(node.nodeName==='#comment'||node.nodeName==='#documentType')return true;
    if(node.nodeName==='#text')return !node.value.trim();
    if((node.attrs||[]).some(a=>['style','background','bgcolor'].includes(a.name)&&a.value.trim()))return false;
    if(['#document','html','head','body'].includes(node.tagName||node.nodeName))return (node.childNodes||[]).every(blank);
    if(['meta','title','base'].includes(node.tagName))return true;
    if(node.tagName==='style'){
      const css=text(node).replace(/\/\*[\s\S]*?\*\//g,'').trim();
      return !css||attr(node,'id')==='dsh-document-styles'&&attr(node,'data-dsh-controlled')==='styles'
        &&css.replace(/\s/g,'')==='[data-dsh-hidden="true"]{display:none!important}';
    }
    if(node.tagName==='script')return attr(node,'id')==='dsh-document-model'&&attr(node,'type')==='application/json'
      ||attr(node,'id')==='dsh-document-runtime'&&attr(node,'data-dsh-controlled')==='runtime';
    return false;
  };
  return blank(doc);
}

export function projectPreviewDocument(html,{assetBase,projectId,origin=globalThis.location?.origin||'http://localhost'}={}){
  if(typeof html!=='string'||html.length>2*1024*1024)return null;
  let asset=null;
  if(assetBase){try{asset=trustedAssetRoot(assetBase,origin);const parts=new URL(asset.root).pathname.split('/');if(decodeURIComponent(parts[5])!==projectId)return null;}catch{return null;}}
  const resolve=value=>{
    if(!value||/^(?:#|data:|https?:|\/\/)/i.test(value))return value;
    if(!asset||/^[a-z][a-z0-9+.-]*:/i.test(value))return 'about:blank#blocked';
    try{const url=new URL(value.startsWith('/')?value.slice(1):value,value.startsWith('/')?asset.root:asset.base);return url.href.startsWith(asset.root)?url.href:'about:blank#blocked';}catch{return 'about:blank#blocked';}
  };
  const css=value=>value.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,(_all,a,b,c)=>`url(${JSON.stringify(resolve((a??b??c).trim()))})`).replace(/@import\s+(['"])(.*?)\1/gi,(_all,_q,url)=>`@import url(${JSON.stringify(resolve(url))})`);
  const doc=parse(html);
  if(isBlankProjectPreviewDocument(doc))return null;
  const walk=node=>{
    node.childNodes=(node.childNodes||[]).filter(child=>!['script','iframe','object','embed','base'].includes(child.tagName)&&!(child.tagName==='meta'&&(child.attrs||[]).some(a=>a.name==='http-equiv'&&/^(?:refresh|content-security-policy)$/i.test(a.value))));
    node.attrs=(node.attrs||[]).filter(a=>!/^on/i.test(a.name)&&a.name!=='autofocus');
    for(const a of node.attrs){if(['src','href','poster','background'].includes(a.name))a.value=resolve(a.value);if(a.name==='style')a.value=css(a.value);if(a.name==='srcset'||a.name==='imagesrcset')a.value='';}
    if(node.tagName==='style')for(const child of node.childNodes)if(child.nodeName==='#text')child.value=css(child.value);
    for(const child of node.childNodes)walk(child);if(node.content)walk(node.content);
  };walk(doc);
  const head=doc.childNodes.find(n=>n.tagName==='html')?.childNodes.find(n=>n.tagName==='head');
  if(!head)return null;
  const local=asset?.root||'',policy=`default-src 'none'; script-src 'none'; img-src data: ${local}; style-src 'unsafe-inline' ${local}; font-src data: ${local}; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri ${local||"'none'"}; navigate-to 'none'`;
  const extra=parse(`<html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"></head></html>`).childNodes.find(n=>n.tagName==='html').childNodes.find(n=>n.tagName==='head').childNodes;
  for(const node of extra)node.parentNode=head;head.childNodes.unshift(...extra);
  return serialize(doc);
}
