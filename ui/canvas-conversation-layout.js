export const CONVERSATION_LAYOUT_KEY='dsh-designer:canvas-conversation:1';
export const CONVERSATION_DEFAULTS=Object.freeze({mode:'dock',dockWidth:760,sideWidth:400});
const width=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function normalizeConversationLayout(value={}){
  return {mode:value?.mode==='sidebar'?'sidebar':'dock',dockWidth:width(value?.dockWidth,360,1100,760),sideWidth:width(value?.sideWidth,320,720,400)};
}
export function readConversationLayout(storage){try{return normalizeConversationLayout(JSON.parse(storage?.getItem(CONVERSATION_LAYOUT_KEY)||'{}'));}catch{return {...CONVERSATION_DEFAULTS};}}
export function saveConversationLayout(storage,value){try{storage?.setItem(CONVERSATION_LAYOUT_KEY,JSON.stringify(normalizeConversationLayout(value)));}catch{}}
export function conversationWidthBounds(mode,available){
  const side=mode==='sidebar',space=Number.isFinite(available)?Math.max(0,available):1440;
  const max=Math.min(side?720:1100,Math.max(0,space-(side?24:20)));
  return {min:Math.min(side?320:360,max),max};
}
export function fitConversationWidth(preferred,mode,available){const {min,max}=conversationWidthBounds(mode,available);return width(preferred,min,max,Math.max(min,Math.min(max,mode==='sidebar'?400:760)));}
export function draggedConversationWidth(start,delta,edge,mode,available){
  const factor=(mode==='sidebar'?1:2)*(edge==='left'?-1:1);
  return fitConversationWidth(start+delta*factor,mode,available);
}
