export const HOME_TAB={id:'home',kind:'home',label:'首页',icon:'home',closable:false};
export const initialWorkspaceTabs={items:[HOME_TAB],activeId:'home'};
export function workspaceTabsReducer(state=initialWorkspaceTabs,action={}){
  if(action.type==='open'){
    const tab=action.tab;
    if(!tab?.id||!tab.kind)return state;
    const current=state.items.find(item=>item.id===tab.id);
    return {items:current?state.items.map(item=>item.id===tab.id?{...item,...tab}:item):[...state.items,tab],activeId:action.activate===false?state.activeId:tab.id};
  }
  if(action.type==='activate')return state.items.some(item=>item.id===action.id)?{...state,activeId:action.id}:state;
  if(action.type==='close'){
    const index=state.items.findIndex(item=>item.id===action.id);
    if(index<0||state.items[index].closable===false||action.id==='home')return state;
    const items=state.items.filter(item=>item.id!==action.id);
    return {items,activeId:state.activeId===action.id?(items[Math.min(index,items.length-1)]?.id||'home'):state.activeId};
  }
  if(action.type==='rename-project'){
    let changed=false;
    const items=state.items.map(item=>{if(item.projectId!==action.projectId)return item;const label=item.kind==='project-settings'?`${action.name} · 设置`:action.name;if(item.label===label)return item;changed=true;return {...item,label};});
    return changed?{...state,items}:state;
  }
  if(action.type==='remove-project'){
    const items=state.items.filter(item=>item.projectId!==action.projectId);
    return {items,activeId:items.some(item=>item.id===state.activeId)?state.activeId:'home'};
  }
  return state;
}
export function projectWorkspaceTab(project){return {id:`project:${project.id}`,kind:'project',projectId:project.id,label:project.name||'未命名项目',icon:'layers',closable:true};}
export function projectSettingsTab(project){return {id:`project-settings:${project.id}`,kind:'project-settings',projectId:project.id,label:`${project.name||'项目'} · 设置`,icon:'settings',closable:true};}
export function globalWorkspaceTab(id){
  const definition={home:HOME_TAB,projects:{kind:'manager',label:'项目',icon:'folder'},systems:{kind:'systems',label:'设计体系',icon:'palette'},knowledge:{kind:'knowledge',label:'知识库',icon:'knowledge'},skills:{kind:'skills',label:'技能库',icon:'skill'},settings:{kind:'settings',label:'设置',icon:'settings'}}[id];
  return definition?{id,closable:id!=='home',...definition}:null;
}
