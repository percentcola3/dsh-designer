import {ChangeSet, Text} from '@codemirror/state';

export const selectionToken = chip => `【${chip.label}】`;

export function selectionTokenRanges(value, chips) {
  const ranges = [];
  for (const chip of chips) {
    const token = selectionToken(chip);
    let from = value.indexOf(token);
    while (from !== -1) {
      ranges.push({from, to: from + token.length, chip});
      from = value.indexOf(token, from + token.length);
    }
  }
  return ranges.sort((a, b) => a.from - b.from);
}

// Apply canvas changes without moving surviving chips or discarding surrounding prose.
export function reconcileSelectionInput(value, previous, chips, caret, pending = new Set()) {
  const ids = new Set(chips.map(chip => chip.id));
  const removed = selectionTokenRanges(value, previous.filter(chip => !ids.has(chip.id)));
  const deletion = ChangeSet.of(removed.map(({from, to}) => ({from, to})), value.length);
  const afterRemoval = deletion.apply(Text.of(value.split('\n')));
  const missing = chips.filter(chip => !pending.has(chip.id) && !afterRemoval.toString().includes(selectionToken(chip)));
  const position = deletion.mapPos(Math.min(value.length, Math.max(0, caret)));
  const insertion = ChangeSet.of({from: position, insert: missing.map(selectionToken).join('')}, afterRemoval.length);
  return {value: insertion.apply(afterRemoval).toString(), caret: insertion.mapPos(position, 1)};
}
