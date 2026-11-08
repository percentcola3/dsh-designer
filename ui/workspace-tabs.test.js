import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspaceTabs,workspaceTabsReducer,globalWorkspaceTab,projectWorkspaceTab,projectSettingsTab} from './workspace-tabs.js';
const open=(state,tab)=>workspaceTabsReducer(state,{type:'open',tab});
test('project names can collide while identities and settings remain independent',()=>{
  let state=open(initialWorkspaceTabs,projectWorkspaceTab({id:'p-a',name:'官网'}));
  state=open(state,projectWorkspaceTab({id:'p-b',name:'官网'}));
  state=open(state,projectSettingsTab({id:'p-a',name:'官网'}));
  state=open(state,projectWorkspaceTab({id:'p-a',name:'更新后的官网'}));
  assert.equal(state.items.length,4);assert.equal(state.activeId,'project:p-a');
  assert.equal(state.items.find(item=>item.id==='project:p-a').label,'更新后的官网');
  assert.ok(state.items.some(item=>item.id==='project-settings:p-a'));
});
test('closing an active tab chooses a neighbor and never closes pinned home',()=>{
  let state=open(initialWorkspaceTabs,globalWorkspaceTab('skills'));
  state=open(state,globalWorkspaceTab('settings'));
  state=workspaceTabsReducer(state,{type:'close',id:'settings'});
  assert.equal(state.activeId,'skills');
  state=workspaceTabsReducer(state,{type:'close',id:'skills'});
  assert.deepEqual(state,initialWorkspaceTabs);
  assert.equal(workspaceTabsReducer(state,{type:'close',id:'home'}),state);
});
test('a delayed close of an inactive tab leaves the current page selected',()=>{
  let state=open(initialWorkspaceTabs,globalWorkspaceTab('skills'));
  state=open(state,globalWorkspaceTab('settings'));
  state=workspaceTabsReducer(state,{type:'close',id:'skills'});
  assert.equal(state.activeId,'settings');
  assert.equal(workspaceTabsReducer(state,{type:'activate',id:'missing'}),state);
});
test('a background admission can register its project without stealing the selected tab',()=>{
  const before=open(initialWorkspaceTabs,globalWorkspaceTab('skills'));
  const after=workspaceTabsReducer(before,{type:'open',activate:false,tab:projectWorkspaceTab({id:'p-background',name:'后台设计'})});
  assert.equal(after.activeId,'skills');assert.ok(after.items.some(item=>item.id==='project:p-background'));
});
test('removing an unavailable project removes only its workspace and settings tabs',()=>{
  let state=open(initialWorkspaceTabs,projectWorkspaceTab({id:'p-a',name:'A'}));
  state=open(state,projectSettingsTab({id:'p-a',name:'A'}));
  state=open(state,projectWorkspaceTab({id:'p-b',name:'B'}));
  state=workspaceTabsReducer(state,{type:'remove-project',projectId:'p-a'});
  assert.deepEqual(state.items.map(item=>item.id),['home','project:p-b']);assert.equal(state.activeId,'project:p-b');
});
