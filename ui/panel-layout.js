export const PANEL_LAYOUT_KEY='dsh-designer:panel-layout:1';
export const panelWidth=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function readPanelLayout(storage){
  try{const value=JSON.parse(storage?.getItem(PANEL_LAYOUT_KEY)||'{}');return {groupWidth:panelWidth(value.groupWidth,170,340,216),aiWidth:panelWidth(value.aiWidth,270,520,328),groupOpen:typeof value.groupOpen==='boolean'?value.groupOpen:true};}
  catch{return {groupWidth:216,aiWidth:328,groupOpen:true};}
}
export function savePanelLayout(storage,layout){
  try{storage?.setItem(PANEL_LAYOUT_KEY,JSON.stringify({groupWidth:panelWidth(layout.groupWidth,170,340,216),aiWidth:panelWidth(layout.aiWidth,270,520,328),groupOpen:!!layout.groupOpen}));}catch{}
}
