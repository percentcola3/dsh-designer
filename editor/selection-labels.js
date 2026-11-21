const nodeId = (object, index) => object.instanceId || object.nodeId || object.id || `reference-${index}`;
const idsOf = selection => [...new Set((selection?.nodeIds || [selection?.nodeId]).filter(Boolean))];

export function selectionLetter(index) {
  let label = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + (value - 1) % 26) + label;
  }
  return label;
}

export function selectionColor(label = 'A') {
  const colors = ['#148575', '#8b5cc7', '#bd7519', '#c34f7b', '#257ea8', '#79852d'];
  let index = 0;
  for (const letter of label) index = index * 26 + letter.charCodeAt(0) - 64;
  return colors[Math.max(0, index - 1) % colors.length];
}

// Keep letters stable while the selection is refined, including after a chip is removed.
export function labelSelection(selection, previous) {
  if (!selection) return selection;
  const ids = idsOf(selection), objects = selection.objects || [];
  const keys = ids.length ? ids : objects.map(nodeId);
  if (!keys.length) return {...selection, labels: {}, nextLabelIndex: 0};
  const prior = previous?.pageId === selection.pageId ? labelSelection(previous) : null;
  const labels = {}, used = new Set([...Object.values(prior?.labels || {}), ...Object.values(selection.labels || {})]);
  let nextIndex = Math.max(prior?.nextLabelIndex || 0, selection.nextLabelIndex || 0);
  for (const id of keys) {
    let label = selection.labels?.[id] || prior?.labels?.[id];
    if (!label) {
      while (used.has(selectionLetter(nextIndex))) nextIndex++;
      label = selectionLetter(nextIndex++);
      used.add(label);
    }
    labels[id] = label;
  }
  return {...selection, labels, nextLabelIndex: nextIndex,
    objects: objects.map((object, index) => ({...object, selectionLabel: labels[nodeId(object, index)]}))};
}

export function selectionChips(selection) {
  const labeled = labelSelection(selection);
  if (!labeled) return [];
  const ids = idsOf(labeled), objects = labeled.objects || [];
  const keys = ids.length ? ids : objects.map(nodeId);
  return keys.map(id => ({id, label: labeled.labels[id], object: objects.find((object, index) => nodeId(object, index) === id)}));
}

export function removeSelectionElement(selection, id) {
  if (!selection) return null;
  const labeled = labelSelection(selection);
  const nodeIds = idsOf(labeled).filter(value => value !== id);
  const objects = labeled.objects.filter((object, index) => nodeId(object, index) !== id);
  if (!nodeIds.length && !objects.length) return null;
  const {nodeId: singleId, bounds, ...rest} = labeled;
  return labelSelection({...rest, nodeIds, objects}, labeled);
}
