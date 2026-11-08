// The confirmation owns its source, command arguments and observed HEAD even
// when the user later changes the selected source in the surrounding panel.
export function freezeRuntimeAction(value, {projectId, sourceId, sourceName, head}) {
  if (!projectId || !sourceId) throw Object.assign(new Error('请先选择已登记源码。'), {code:'SOURCE_REQUIRED'});
  return structuredClone({
    ...value,
    projectId,
    sourceId,
    sourceName: sourceName || sourceId,
    args: {...value.args, projectId, sourceId, ...(head ? {expectedHead:head} : {})},
  });
}
