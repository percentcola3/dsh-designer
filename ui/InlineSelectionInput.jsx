import React from 'react';
import {Compartment, EditorState, Prec, StateEffect, StateField} from '@codemirror/state';
import {Decoration, EditorView, WidgetType, drawSelection, keymap, placeholder as inputPlaceholder} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {selectionColor} from '../editor/selection-labels.js';
import {selectionToken, selectionTokenRanges, reconcileSelectionInput} from './selection-input-state.js';

class SelectionWidget extends WidgetType {
  constructor(chip, disabled, remove) {super(); this.chip = chip; this.disabled = disabled; this.remove = remove;}
  eq(other) {return this.chip.id === other.chip.id && this.chip.label === other.chip.label && this.disabled === other.disabled;}
  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'wb-designer-inline-chip';
    chip.style.setProperty('--selection-color', selectionColor(this.chip.label));
    chip.title = `${this.chip.label} · ${this.chip.object?.name || this.chip.object?.tag || '选中元素'}`;
    chip.setAttribute('contenteditable', 'false');
    const label = document.createElement('span');
    label.textContent = this.chip.label;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '×';
    button.disabled = this.disabled;
    button.setAttribute('aria-label', `移除选中元素 ${this.chip.label}`);
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {event.preventDefault(); this.remove(this.chip.id);});
    chip.append(label, button);
    return chip;
  }
  ignoreEvent() {return true;}
}

// Expose the same UTF-16 value/selection interface used by mentions and voice insertion.
const InlineSelectionInput = React.forwardRef(function InlineSelectionInput(props, forwardedRef) {
  const host = React.useRef(null), editor = React.useRef(null), live = React.useRef(props);
  const previousChips = React.useRef([]), pending = React.useRef(new Set()), synchronizing = React.useRef(false);
  const configure = React.useRef(new Compartment()), chipEffect = React.useRef(StateEffect.define());
  const [, retry] = React.useReducer(value => value + 1, 0);
  live.current = props;
  const input = React.useMemo(() => ({
    get element() {return host.current;},
    get value() {return editor.current?.state.doc.toString() ?? live.current.value;},
    get selectionStart() {return editor.current?.state.selection.main.from ?? live.current.value.length;},
    get selectionEnd() {return editor.current?.state.selection.main.to ?? live.current.value.length;},
    get style() {return host.current.style;},
    get scrollHeight() {return host.current?.scrollHeight || 0;},
    focus() {editor.current?.focus();},
    getBoundingClientRect() {return host.current.getBoundingClientRect();},
    setSelectionRange(start, end) {
      const view = editor.current;
      if (view) view.dispatch({selection: {anchor: Math.min(start, view.state.doc.length), head: Math.min(end, view.state.doc.length)}});
    },
  }), []);
  React.useImperativeHandle(forwardedRef, () => input, [input]);

  function change() {live.current.onChange?.({target: input, currentTarget: input});}
  function caretChanged() {live.current.onSelect?.({currentTarget: input});}
  function remove(id) {
    const view = editor.current;
    if (!view || live.current.disabled) return;
    const changes = selectionTokenRanges(view.state.doc.toString(), live.current.chips)
      .filter(range => range.chip.id === id).map(({from, to}) => ({from, to}));
    view.dispatch({changes});
    view.focus();
  }
  function options() {
    const value = live.current;
    return [EditorState.readOnly.of(value.disabled), EditorView.editable.of(!value.disabled),
      inputPlaceholder(value.placeholder), EditorView.contentAttributes.of({role: 'textbox', 'aria-multiline': 'true',
        'aria-label': value['aria-label'], 'aria-expanded': String(value['aria-expanded'] || false),
        'aria-controls': value['aria-controls'] || '', 'aria-activedescendant': value['aria-activedescendant'] || '',
        'aria-autocomplete': 'list', 'aria-disabled': String(value.disabled)})];
  }

  React.useLayoutEffect(() => {
    const field = StateField.define({
      create: () => ({chips: [], disabled: false, decorations: Decoration.none}),
      update(config, transaction) {
        for (const effect of transaction.effects) if (effect.is(chipEffect.current)) config = effect.value;
        const decorations = selectionTokenRanges(transaction.newDoc.toString(), config.chips)
          .map(({from, to, chip}) => Decoration.replace({widget: new SelectionWidget(chip, config.disabled, remove)}).range(from, to));
        return {...config, decorations: Decoration.set(decorations)};
      },
      provide: field => [EditorView.decorations.from(field, value => value.decorations),
        EditorView.atomicRanges.of(view => view.state.field(field).decorations)],
    });
    const view = new EditorView({parent: host.current, state: EditorState.create({doc: live.current.value,
      extensions: [field, configure.current.of(options()), history(), drawSelection(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping,
        EditorState.transactionFilter.of(transaction => !synchronizing.current && transaction.docChanged && transaction.newDoc.length > live.current.maxLength
          && transaction.newDoc.length > transaction.startState.doc.length ? [] : transaction),
        Prec.highest(EditorView.domEventHandlers({
          keydown(event) {live.current.onKeyDown?.(event); return event.defaultPrevented;},
          paste(event) {live.current.onPaste?.(event); return event.defaultPrevented;},
          compositionstart(event) {live.current.onCompositionStart?.(event);},
          compositionend(event) {live.current.onCompositionEnd?.({currentTarget: input, nativeEvent: event});},
          click() {caretChanged();},
          keyup() {caretChanged();},
        })),
        EditorView.updateListener.of(update => {
          if (synchronizing.current) return;
          if (update.docChanged) {
            const value = update.state.doc.toString(), before = update.startState.doc.toString();
            const removed = live.current.chips.filter(chip => before.includes(selectionToken(chip)) && !value.includes(selectionToken(chip)) && !pending.current.has(chip.id));
            for (const chip of removed) pending.current.add(chip.id);
            change();
            if (removed.length) Promise.resolve().then(() => {
              if (editor.current === view) return live.current.onRemoveChips?.(removed.map(chip => chip.id));
            }).catch(error => {
              if (editor.current !== view) return;
              for (const chip of removed) pending.current.delete(chip.id);
              live.current.onError?.(error); retry();
            });
          }
          if (update.docChanged || update.selectionSet) caretChanged();
        }),
      ]})});
    editor.current = view;
    return () => {editor.current = null; view.destroy();};
  }, []);

  React.useLayoutEffect(() => {
    const view = editor.current, {value, chips, disabled} = live.current;
    const ids = new Set(chips.map(chip => chip.id));
    for (const id of pending.current) if (!ids.has(id)) pending.current.delete(id);
    const reconciled = disabled ? {value, caret: input.selectionEnd}
      : reconcileSelectionInput(value, previousChips.current, chips, input.selectionEnd, pending.current);
    previousChips.current = chips;
    const effects = [configure.current.reconfigure(options()), chipEffect.current.of({chips, disabled})];
    const changed = view.state.doc.toString() !== reconciled.value;
    synchronizing.current = true;
    try {
      view.dispatch({...(changed ? {changes: {from: 0, to: view.state.doc.length, insert: reconciled.value},
        selection: {anchor: Math.min(reconciled.caret, reconciled.value.length)}} : {}), effects});
    } finally {synchronizing.current = false;}
    if (reconciled.value !== value) change();
  });

  return <div ref={host} className={`${props.className} wb-designer-compose-rich`} data-testid={props['data-testid']}/>;
});

export default InlineSelectionInput;
