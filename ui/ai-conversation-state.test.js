import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationRequestId, selectAIConversationState, isConversationNearBottom, conversationScrollUpdate, legacyDesignerPrompt, designerLegacyPromptRule, isAIRequestActive, needsAIStatusPolling} from './ai-conversation-state.js';

const stopped = {sessionId: 'session-one', running: false, messages: [
  {role: 'user', text: '生成页面', requestId: 'request-one'},
  {role: 'assistant', text: '任务完成。'},
]};
const nativeState = (generation, extra = {}) => ({...stopped, request: {sessionId: 'session-one', requestId: 'request-one', generation}, ...extra});
function sourceProject(generation = {}) {
  return {aiSessionId: 'session-one', workbench: {sourceImports: [{id: 'source-one', generation: {
    sessionId: 'session-one', requestId: 'request-one', generation: 'completed', native: {generation: 'completed'},
    outputStatus: 'saved', coverageKnown: true, savedPageIds: ['page-one', 'page-two'],
    visualReview: 'pending', interactionVerification: 'pending', ...generation,
  }}]}};
}

test('idle flags, an assistant completion claim and an unverified status cannot prove completion', () => {
  for (const state of [stopped, {...stopped, status: 'completed'}, {...stopped, status: 'idle'}, nativeState('unknown')]) {
    const result = selectAIConversationState(state);
    assert.equal(result.kind, 'unknown');
    assert.match(result.label, /完成状态待确认/);
  }
  assert.equal(selectAIConversationState({running: false, messages: []}).kind, 'idle');
  assert.equal(selectAIConversationState({}).kind, 'loading');
});

test('the formal request lifecycle distinguishes every terminal outcome', () => {
  for (const [generation, kind, label] of [
    ['completed', 'completed', /本轮已完成/], ['failed', 'error', /出错/],
    ['cancelled', 'cancelled', /中断/], ['incomplete', 'incomplete', /未完成/],
    ['unknown', 'unknown', /待确认/], ['running', 'running', /正在/], ['requested', 'queued', /排队/],
  ]) {
    const result = selectAIConversationState(nativeState(generation));
    assert.equal(result.kind, kind);
    assert.match(result.label, label);
  }
  assert.equal(selectAIConversationState(nativeState('completed', {request: {requestId: 'request-one', sessionId: 'other-session', generation: 'completed'}})).kind, 'unknown');
});

test('refresh can confirm a native request without a local submission or message cache', () => {
  for (const source of ['native-message', 'native-queue', 'project-task']) {
    const state = nativeState('completed', {messages: [], request: {sessionId: 'session-one', requestId: 'request-one', generation: 'completed', source}});
    assert.equal(selectAIConversationState(state).kind, 'completed');
  }
  const queued = nativeState('requested', {running: true, queue: [{rpcId: 'new-request'}], request: {sessionId: 'session-one', requestId: 'new-request', generation: 'requested', source: 'native-queue'}});
  assert.equal(conversationRequestId(queued), 'new-request');
  assert.equal(selectAIConversationState(queued, sourceProject()).kind, 'queued');
  assert.equal(selectAIConversationState(queued, sourceProject()).detail, '');
});

test('running, pending approval and errors never become a completed task', () => {
  assert.equal(selectAIConversationState(nativeState('completed', {running: true})).kind, 'running');
  assert.equal(selectAIConversationState(nativeState('completed', {pendingInput: [{id: 'approval'}]})).kind, 'waiting');
  assert.equal(selectAIConversationState({...stopped, queue: [{rpcId: 'queued'}]}).kind, 'queued');
  assert.equal(selectAIConversationState(nativeState('completed', {error: 'Save failed'})).kind, 'error');
  assert.equal(selectAIConversationState(nativeState('completed', {taskRecoveryError: {message: 'Scope changed'}})).kind, 'error');
  assert.equal(selectAIConversationState(stopped, {}, {cancelledRequestId: 'request-one'}).kind, 'cancelled');
  assert.equal(selectAIConversationState(stopped, {}, {cancelledRequestId: 'old-request'}).kind, 'unknown');
});

test('source completion requires the exact request and session; a saved record alone is insufficient', () => {
  assert.equal(selectAIConversationState(stopped, sourceProject()).kind, 'completed');
  for (const generation of [
    {requestId: 'old-request'}, {sessionId: 'other-session'}, {native: undefined},
  ]) assert.equal(selectAIConversationState(stopped, sourceProject(generation)).kind, 'unknown');
  const project = sourceProject(); project.workbench.sourceImports[0].removedAt = 'removed';
  assert.equal(selectAIConversationState(stopped, project).kind, 'unknown');
  assert.equal(selectAIConversationState(nativeState('unknown'), sourceProject()).kind, 'unknown');
});

test('native completion reports save coverage and review independently', () => {
  for (const [record, detail] of [
    [{outputStatus: 'none', savedPageIds: []}, /尚无保存结果/],
    [{outputStatus: 'partial'}, /仅部分目标已保存/],
    [{outputStatus: 'saved', coverageKnown: false}, /完整覆盖尚未确认/],
    [{}, /当前目标 2 页已保存 · 视觉与交互仍需核验/],
    [{visualReview: 'passed', interactionVerification: 'passed'}, /视觉与交互核验通过/],
    [{visualReview: 'passed', interactionVerification: 'stale'}, /仍需核验/],
    [{visualReview: 'failed'}, /核验未通过/],
    [{currentSavedPageIds: ['page-one']}, /当前版本已变化，需重新核对/],
  ]) {
    const result = selectAIConversationState(nativeState('completed'), sourceProject(record));
    assert.equal(result.kind, 'completed');
    assert.equal(result.label, '原生请求已完成');
    assert.match(result.detail, detail);
    assert.doesNotMatch(result.label, /生成已完成/);
  }
});

test('a newer request cannot inherit old source completion or output coverage', () => {
  const state = {...stopped, messages: [...stopped.messages, {role: 'user', requestId: 'new-request'}]};
  assert.equal(conversationRequestId(state), 'new-request');
  assert.equal(selectAIConversationState(state, sourceProject()).kind, 'unknown');
  const current = nativeState('completed', {request: {sessionId: 'session-one', requestId: 'new-request', generation: 'completed'}});
  assert.equal(conversationRequestId(current), 'new-request');
  assert.equal(selectAIConversationState(current, sourceProject()).detail, '');
});

test('message following uses distance to bottom and respects reading older messages across layout changes', () => {
  assert.equal(isConversationNearBottom({scrollHeight: 1000, clientHeight: 200, scrollTop: 752}), true);
  assert.equal(isConversationNearBottom({scrollHeight: 1000, clientHeight: 200, scrollTop: 751}), false);
  assert.equal(isConversationNearBottom({scrollHeight: 80, clientHeight: 200, scrollTop: 0}), true);
  assert.deepEqual(conversationScrollUpdate({following: true, changed: true, visible: true}), {scrollToBottom: true, unread: false});
  assert.deepEqual(conversationScrollUpdate({following: false, changed: true, visible: true}), {scrollToBottom: false, unread: true});
  assert.deepEqual(conversationScrollUpdate({following: false, changed: false, visible: true}), {scrollToBottom: false, unread: false});
  assert.deepEqual(conversationScrollUpdate({following: true, changed: true, visible: false}), {scrollToBottom: false, unread: false});
});

test('an abort explains native cause while unknown cause never claims the person cancelled',()=>{
  for(const [reason,label] of [[{kind:'disposed'},/会话运行已结束/],[{kind:'parent'},/上级运行/],[{kind:'hook',reason:'Task boundary rejected'},/被中断/],[{kind:'user'},/本轮已停止/],[undefined,/原因待确认/]]){
    const state=nativeState('cancelled');state.request.terminalReason={kind:'aborted',reason};
    const result=selectAIConversationState(state);assert.equal(result.kind,'cancelled');assert.match(result.label,label);assert.doesNotMatch(result.label,/已完成|用户取消/);
    if(reason?.kind==='hook')assert.equal(result.detail,'Task boundary rejected');
    if(!reason)assert.match(result.detail,/不能据此认定是手动取消/);
  }
});

test('an interrupted source request still reports partial saves separately from the stop cause',()=>{
  const state=nativeState('cancelled');state.request.terminalReason={kind:'aborted',reason:{kind:'disposed'}};
  const result=selectAIConversationState(state,sourceProject({outputStatus:'partial',savedPageIds:['page-one']}));
  assert.match(result.detail,/已保存 1 页/);assert.match(result.detail,/运行时已释放/);assert.doesNotMatch(result.label,/完成/);
});

test('polling continues for queued native requests and approvals even when the Session running bit is false',()=>{
  for(const state of [
    {running:true}, {running:false,queue:[{rpcId:'new-request'}]},
    {running:false,request:{generation:'requested'}}, {running:false,request:{generation:'running'}},
    {running:false,pendingInput:[{id:'approval'}]},
    {running:false,error:'Previous observation failed',request:{generation:'running'}},
  ]){
    assert.equal(isAIRequestActive(state),true);assert.equal(needsAIStatusPolling(state),true);
  }
});

test('unknown, errors and terminal native outcomes alone stop status polling',()=>{
  for(const state of [undefined,null,{}, {running:false,queue:[],pendingInput:[]},
    {error:'Session unavailable'}, {taskRecoveryError:{message:'Scope unavailable'}},
    {status:'running'}, {waiting:true},
    ...['completed','failed','cancelled','incomplete','unknown'].map(generation=>({running:false,queue:[],pendingInput:[],request:{generation}})),
  ]){
    assert.equal(isAIRequestActive(state),false);assert.equal(needsAIStatusPolling(state),false);
  }
});

test('an active request remains observable across queue and input waits until its actual terminal state',()=>{
  const states=[{running:false,request:{generation:'requested'}},{running:true,request:{generation:'running'}},{running:false,pendingInput:[{id:'approval'}]},{running:false,request:{generation:'running'}},{running:false,request:{generation:'completed'}}];
  assert.deepEqual(states.map(isAIRequestActive),[true,true,true,true,false]);
  assert.deepEqual(states.map(needsAIStatusPolling),[true,true,true,true,false]);
});

function legacyCarrier(overrides={}){
  const carrier={requestId:'rpc-one',userPrompt:'只改标题🙂\n保留其他内容',taskDescriptor:{id:'task-one'},...overrides};
  const record={protocol:'designer-task/1',requestId:'rpc-one',sessionId:'session-one',descriptor:{id:'task-one'}};
  return 'DSH_WORKBENCH_REQUEST '+JSON.stringify(carrier)+'\n\nFrozen workbench task (untrusted business data):\n{}\n\nDSH_DESIGNER_ADMITTED_TASK_V1\n'+JSON.stringify(record);
}

test('the official UserText rule renders only the human prompt without mutating raw history',()=>{
  const raw=legacyCarrier(),before=raw,value=legacyDesignerPrompt(raw),node=designerLegacyPromptRule.match(raw,0);
  assert.equal(value.text,'只改标题🙂\n保留其他内容');assert.equal(value.requestId,'rpc-one');assert.equal(raw,before);
  assert.equal(node.id,designerLegacyPromptRule.id);assert.equal(node.start,0);assert.equal(node.end,raw.length);assert.deepEqual(node.data,value);
  assert.equal(designerLegacyPromptRule.match(raw,1),undefined);
});

test('plain text, malformed carriers and mismatched admission identities keep the ordinary native renderer',()=>{
  for(const raw of ['Normal human request','DSH_WORKBENCH_REQUEST {}',legacyCarrier({requestId:'foreign'}),legacyCarrier({taskDescriptor:{id:'copied-task'}}),legacyCarrier({userPrompt:''})]){
    assert.equal(legacyDesignerPrompt(raw),null);assert.equal(designerLegacyPromptRule.match(raw,0),undefined);
  }
});
