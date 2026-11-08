// UI recovery stores identities and view positions, never document bodies,
// unsent conversation text, transport bytes or temporary resource capabilities.
const transientKeys = new Set(['content','text','html','outerHTML','innerHTML','remoteContent','url','previewUrl','downloadUrl','assetBase','bytesBase64','base64','imageRef','screenshotData','dataUrl','dataURL','prompt','draft','drafts','messages','attachments','objects','scopeChoice','reconciling','editorNavigation']);
export function stableViewState(value) {
  if(typeof value==='string')return /^(?:data:|blob:)/i.test(value)?undefined:value;
  if(Array.isArray(value))return value.map(stableViewState).filter(item=>item!==undefined);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!transientKeys.has(key)).map(([key,item])=>[key,stableViewState(item)]).filter(([,item])=>item!==undefined));
  return value;
}
export const compactState = state => stableViewState(state);
