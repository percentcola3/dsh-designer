// Session activity alone cannot prove completion. Use the exact native request
// lifecycle, and keep source save coverage separate from the native outcome.
export function conversationRequestId(state = {}, project = {}) {
  return state.request?.requestId || [...(state.messages || [])].reverse().find(message => message.role === 'user' && message.requestId)?.requestId
    || state.requestId || project.workbench?.lastTaskRef?.requestId || null;
}

// Host session activity can briefly be false while an admitted request is
// queued, entering a step or awaiting permission. Keep observing those states
// even when the Client history subscription could not open.
export function isAIRequestActive(state = {}) {
  return state?.running === true
    || (Array.isArray(state?.queue) && state.queue.length > 0)
    || ['requested', 'running'].includes(state?.request?.generation)
    || (Array.isArray(state?.pendingInput) && state.pendingInput.length > 0);
}

// Unknown/error/terminal states alone do not establish ongoing activity.
export function needsAIStatusPolling(state = {}) {
  return isAIRequestActive(state);
}

function sourceOutputDetail(record) {
  const saved = new Set(record.savedPageIds || record.savedPages?.map(page => page.pageId) || []).size;
  if (record.outputStatus === 'none' || !saved) return '尚无保存结果';
  if (Array.isArray(record.currentSavedPageIds) && new Set(record.currentSavedPageIds).size < saved) {
    return `已有 ${saved} 页保存记录 · 当前版本已变化，需重新核对`;
  }
  if (record.outputStatus !== 'saved' || record.coverageKnown !== true) {
    return `已保存 ${saved} 页 · ${record.coverageKnown === true ? '仅部分目标已保存' : '完整覆盖尚未确认'}`;
  }
  const review = [record.visualReview, record.interactionVerification].includes('failed')
    ? '视觉或交互核验未通过'
    : record.visualReview === 'passed' && record.interactionVerification === 'passed'
      ? '视觉与交互核验通过' : '视觉与交互仍需核验';
  return `当前目标 ${saved} 页已保存 · ${review}`;
}

export function selectAIConversationState(state = {}, project = {}, {cancelledRequestId = null} = {}) {
  const requestId = conversationRequestId(state, project);
  const source = requestId && (project.workbench?.sourceImports || []).find(source => {
    const record = source.generation;
    return !source.removedAt && record?.requestId === requestId && record.sessionId
      && record.sessionId === (state.sessionId || project.aiSessionId);
  });
  const record = source?.generation;
  const request = state.request?.requestId === requestId && state.request.sessionId
    && state.request.sessionId === (state.sessionId || project.aiSessionId) ? state.request : null;
  const lifecycle = request || record?.native;
  const native = lifecycle?.generation;
  const interruption = native === 'cancelled' ? describeAIInterruption(lifecycle) : null;
  const detail = [record ? sourceOutputDetail(record) : request?.terminalReason?.error?.message || '', interruption?.detail].filter(Boolean).join(' · ');
  const result = (kind, label, extra = detail) => ({kind, label, detail: extra, requestId});
  if (state.taskRecoveryError) return result('error', '任务恢复失败', state.taskRecoveryError.message || '请打开完整会话检查任务权限与绑定。');
  if (state.pendingInput?.length || state.waiting || state.status === 'waiting') return result('waiting', '等待审批或输入');
  if (state.queue?.length || native === 'requested') {
    if (!(state.cancelled || state.status === 'cancelled' || (requestId && requestId === cancelledRequestId))) return result('queued', '任务排队中');
  }
  if (interruption) return result('cancelled', interruption.label);
  if (state.running) return result('running', '正在设计…');
  if (state.cancelled || state.status === 'cancelled' || (requestId && requestId === cancelledRequestId)) return result('cancelled', '本轮已停止');
  if (native === 'running') return result('running', '正在设计…');
  if (state.error || ['error', 'failed'].includes(state.status) || native === 'failed' || (!request && record?.generation === 'failed')) return result('error', '任务出错');
  if (native === 'incomplete') return result('incomplete', '请求已结束 · 任务未完成');
  if (native === 'completed') return result('completed', record ? '原生请求已完成' : '本轮已完成');
  if (requestId || state.messages?.length) return result('unknown', '会话已停止 · 完成状态待确认');
  if (state.running === undefined && !state.sessionId) return result('loading', '正在读取会话…', '');
  return result('idle', '准备就绪', '描述需求后开始对话。');
}

// Native abort reasons describe the actual boundary; they do not prove that
// the person clicked Stop (workspace archive also uses the native user cause).
export function describeAIInterruption(request = {}) {
  const reason = request.terminalReason;
  const cause = reason?.kind === 'aborted' ? reason.reason : null;
  if (cause?.kind === 'disposed') return {label: '会话运行已结束 · 本轮中断', detail: '会话运行时已释放，本轮未完成。可重新打开完整会话检查后再提交。'};
  if (cause?.kind === 'parent') return {label: '上级运行已停止 · 本轮中断', detail: '中断由上级运行传递，本轮未完成。'};
  if (cause?.kind === 'hook') return {label: '本轮执行被中断', detail: cause.reason || '运行规则中断了本轮，任务未完成。'};
  if (cause?.kind === 'user') return {label: '本轮已停止', detail: '原生停止指令结束了本轮，任务未完成。'};
  return {label: '本轮已中断 · 原因待确认', detail: '原生记录未说明停止原因，不能据此认定是手动取消。'};
}

// Display-only compatibility for messages admitted before native context support.
// Do not use this parser to restore scope or rewrite the durable Session log.
export function legacyDesignerPrompt(text) {
  const prefix = 'DSH_WORKBENCH_REQUEST ', marker = '\n\nDSH_DESIGNER_ADMITTED_TASK_V1\n';
  if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
  const newline = text.indexOf('\n'), at = text.lastIndexOf(marker);
  if (newline < 0 || newline > 1_000_000 || at < newline) return null;
  try {
    const carrier = JSON.parse(text.slice(prefix.length, newline));
    const admission = JSON.parse(text.slice(at + marker.length));
    if (typeof carrier.userPrompt !== 'string' || !carrier.userPrompt.trim() || carrier.userPrompt.length > 20000
      || typeof carrier.requestId !== 'string' || admission.protocol !== 'designer-task/1'
      || admission.requestId !== carrier.requestId || !admission.sessionId
      || !carrier.taskDescriptor?.id || admission.descriptor?.id !== carrier.taskDescriptor.id) return null;
    return {text: carrier.userPrompt, requestId: carrier.requestId, sessionId: admission.sessionId};
  } catch { return null; }
}

export const designerLegacyPromptRule = {
  id: 'designer-task-prompt', order: -100,
  match(text, from) {
    if (from !== 0) return;
    const prompt = legacyDesignerPrompt(text);
    if (prompt) return {id: 'designer-task-prompt', start: 0, end: text.length, data: prompt};
  },
};

export function isConversationNearBottom({scrollHeight, clientHeight, scrollTop}, threshold = 48) {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}

// Layout changes and identical polls must not announce unseen messages.
export function conversationScrollUpdate({following, changed, visible}) {
  return {scrollToBottom: following && visible, unread: changed && !following};
}
