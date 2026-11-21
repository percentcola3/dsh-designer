import {installDatePicker} from './date-picker.js';

/** Portable, dependency-free PC component behavior. Visual styles live in theme.css. */
export function installDesktopComponents(win) {
  const {document, HTMLElement, customElements, AbortController, CustomEvent} = win;
  let serial = 0;
  const emit = (node, name, detail, cancelable = false) => node.dispatchEvent(new CustomEvent(name, {detail, bubbles: true, composed: true, cancelable}));
  class Base extends HTMLElement {
    connectedCallback() {
      this.lifecycle?.abort();
      this.lifecycle = new AbortController();
      if (document.readyState === 'loading') this.listen(document, 'DOMContentLoaded', () => this.connect());
      else this.connect();
    }
    disconnectedCallback() {this.lifecycle?.abort();}
    listen(target, event, handler) {target.addEventListener(event, handler, {signal: this.lifecycle.signal});}
    followPopup(anchor, popup, position) {
      const update = () => { if (popup.matches(':popover-open')) position(); };
      const options = {capture: true, passive: true, signal: this.lifecycle.signal};
      win.addEventListener('scroll', update, options);
      win.addEventListener('resize', update, options);
      const observer = new win.ResizeObserver(update);
      observer.observe(anchor);
      this.lifecycle.signal.addEventListener('abort', () => observer.disconnect(), {once: true});
    }
    connect() {}
  }
  class Control extends Base {
    static observedAttributes = ['disabled', 'loading', 'value', 'checked', 'name', 'type', 'placeholder', 'required', 'readonly', 'invalid', 'min', 'max', 'step', 'maxlength', 'aria-label'];
    connect() {
      const tag = this.localName === 'ds-button' ? 'button' : this.localName === 'ds-select' ? 'select' : this.localName === 'ds-textarea' ? 'textarea' : 'input';
      this.control = this.querySelector(tag);
      if (!this.control) {
        this.control = document.createElement(tag);
        if (tag === 'button') {this.control.append(...this.childNodes); this.control.type = 'button';}
        this.prepend(this.control);
      }
      if (tag === 'button' && !this.control.hasAttribute('type') && !this.hasAttribute('type')) this.control.type = 'button';
      if (['ds-checkbox', 'ds-switch'].includes(this.localName)) this.control.type = 'checkbox';
      if (this.localName === 'ds-radio') this.control.type = 'radio';
      if (this.localName === 'ds-switch') this.control.setAttribute('role', 'switch');
      this.defaults ||= {disabled: this.control.disabled, required: this.control.required, readOnly: this.control.readOnly};
      this.mirrored ||= new Set();
      this.sync(this.initialized ? 'reconnect' : undefined); this.initialized = true;
      const detail = () => ({value: this.control.value, checked: this.control.checked === true, ...(this.control.multiple ? {values: [...this.control.selectedOptions].map(option => option.value)} : {})});
      this.listen(this.control, 'input', () => emit(this, 'ds-input', detail()));
      this.listen(this.control, 'change', () => emit(this, 'ds-change', detail()));
    }
    attributeChangedCallback(name) {this.sync(name);}
    sync(changed) {
      if (!this.control) return;
      const control = this.control;
      control.disabled = this.defaults.disabled || this.hasAttribute('disabled') || this.hasAttribute('loading');
      if (this.hasAttribute('loading')) control.setAttribute('aria-busy', 'true');
      else control.removeAttribute('aria-busy');
      for (const name of ['name', 'placeholder', 'min', 'max', 'step', 'maxlength', 'aria-label']) {
        if (this.hasAttribute(name)) {control.setAttribute(name, this.getAttribute(name)); this.mirrored.add(name);}
        else if (this.mirrored.delete(name)) control.removeAttribute(name);
      }
      if (this.hasAttribute('type') && !['ds-checkbox', 'ds-switch', 'ds-radio'].includes(this.localName)) control.setAttribute('type', this.getAttribute('type'));
      if ((!changed || changed === 'value') && this.hasAttribute('value') && control.value !== this.getAttribute('value')) control.value = this.getAttribute('value');
      if (!changed || changed === 'checked') {
        if (this.hasAttribute('checked')) control.checked = true;
        else if (changed === 'checked') control.checked = false;
      }
      control.required = this.defaults.required || this.hasAttribute('required');
      control.readOnly = this.defaults.readOnly || this.hasAttribute('readonly');
      if (this.hasAttribute('invalid')) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
    get value() {return this.control?.value ?? this.getAttribute('value') ?? '';}
    set value(value) {this.setAttribute('value', String(value));}
    get checked() {return Boolean(this.control?.checked);}
    set checked(value) {this.toggleAttribute('checked', Boolean(value));}
    focus(options) {this.control?.focus(options);}
    checkValidity() {return this.control?.checkValidity() ?? true;}
  }
  const positionPopup = (popup, anchor, above = false, matchWidth = true) => {
    const rect = anchor.getBoundingClientRect(), width = Math.min((matchWidth ? rect.width : Math.max(rect.width, popup.offsetWidth)), win.innerWidth - 16);
    popup.style.width = width + 'px';
    const height = Math.min(popup.scrollHeight, 264, win.innerHeight - 24);
    const top = above || win.innerHeight - rect.bottom < height + 12 ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
    Object.assign(popup.style, {position: 'fixed', margin: '0', inset: 'auto', width: width + 'px', maxHeight: height + 'px', left: Math.max(8, Math.min(rect.left, win.innerWidth - width - 8)) + 'px', top: top + 'px'});
  };
  class Select extends Control {
    static observedAttributes = [...Control.observedAttributes, 'multiple', 'searchable', 'clearable', 'empty-text', 'size'];
    connect() {
      super.connect();
      this.nativeMultiple ??= this.control.multiple;
      this.control.hidden = true;
      this.control.tabIndex = -1;
      this.control.setAttribute('aria-hidden', 'true');
      this.query = '';
      this.trigger = this.querySelector('[data-select-trigger]');
      if (this.trigger?.tagName === 'BUTTON') {this.trigger.remove(); this.trigger = null;}
      if (!this.trigger) {
        this.trigger = document.createElement('div');
        this.trigger.dataset.selectTrigger = '';
        this.trigger.innerHTML = '<span data-select-values></span><input data-select-search autocomplete="off"><button type="button" data-select-clear aria-label="清除选择">×</button><span data-select-arrow aria-hidden="true"></span>';
        this.append(this.trigger);
      }
      this.searchInput = this.trigger.querySelector('[data-select-search]');
      this.valuesNode = this.trigger.querySelector('[data-select-values]');
      this.clearButton = this.trigger.querySelector('[data-select-clear]');
      this.popup = this.querySelector('[data-select-options]');
      if (!this.popup) {this.popup = document.createElement('div'); this.popup.dataset.selectOptions = ''; this.append(this.popup);}
      this.popup.id ||= 'ds-select-options-' + ++serial;
      this.popup.setAttribute('role', 'listbox');
      this.popup.setAttribute('popover', 'manual');
      this.popup.hidden = true;
      this.listen(this.trigger, 'click', event => {
        if (this.control.disabled) return;
        const remove = event.target.closest('[data-remove-option]');
        if (remove) {this.removeSelection(Number(remove.dataset.removeOption)); return;}
        if (event.target.closest('[data-select-clear]')) {this.clear(); return;}
        this.setExpanded(this.searchable || !this.expanded);
        this.focus();
      });
      this.listen(this.trigger, 'keydown', event => this.key(event));
      this.listen(this.searchInput, 'compositionstart', () => {this.composing = true;});
      this.listen(this.searchInput, 'compositionend', () => {this.composing = false; this.filter();});
      this.listen(this.searchInput, 'input', event => {event.stopPropagation(); if (!this.composing) this.filter();});
      this.listen(this.searchInput, 'change', event => event.stopPropagation());
      this.listen(this.searchInput, 'focus', () => {if (!this.control.disabled) this.setExpanded(true);});
      this.listen(this.popup, 'pointerdown', event => event.preventDefault());
      this.listen(this.popup, 'pointermove', event => {
        const row = event.target.closest('[data-option-index]');
        if (row && row.getAttribute('aria-disabled') !== 'true') this.highlight(Number(row.dataset.optionIndex), false);
      });
      this.listen(this.popup, 'click', event => {const row = event.target.closest('[data-option-index]'); if (row) this.choose(Number(row.dataset.optionIndex));});
      this.listen(document, 'pointerdown', event => {if (!this.contains(event.target)) this.setExpanded(false);});
      this.listen(this, 'focusout', event => {if (!this.contains(event.relatedTarget)) this.setExpanded(false);});
      this.followPopup(this.trigger, this.popup, () => positionPopup(this.popup, this.trigger));
      this.listen(this.control, 'change', () => this.renderOptions());
      this.listen(this.control, 'invalid', event => {event.preventDefault(); this.focus(); this.combobox.setAttribute('aria-invalid', 'true');});
      if (this.control.form) this.listen(this.control.form, 'reset', () => win.setTimeout(() => {if (this.isConnected) {this.query = ''; this.renderOptions();}}, 0));
      this.observer?.disconnect();
      this.observer = new win.MutationObserver(() => this.renderOptions());
      this.observer.observe(this.control, {childList: true, subtree: true, attributes: true, characterData: true});
      this.renderOptions();
    }
    disconnectedCallback() {this.setExpanded(false); this.observer?.disconnect(); super.disconnectedCallback();}
    sync(changed) {
      super.sync(changed);
      if (this.control) this.control.disabled = this.defaults.disabled || this.hasAttribute('disabled');
      if (this.searchInput) this.renderOptions();
    }
    get searchable() {return this.hasAttribute('searchable') || this.control?.multiple;}
    get combobox() {return this.searchable ? this.searchInput : this.trigger;}
    get values() {return [...(this.control?.selectedOptions || [])].map(option => option.value);}
    set values(values) {
      if (!Array.isArray(values)) throw new TypeError('Select values must be an array');
      this.pendingValues = values.map(String);
      if (this.control) {for (const option of this.control.options) option.selected = this.pendingValues.includes(option.value); this.pendingValues = null; this.renderOptions();}
    }
    label() {
      return this.getAttribute('aria-label') || [...(this.control.labels || [])].map(label => [...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim()).join(' ') || '选择选项';
    }
    renderValues() {
      const selected = [...this.control.selectedOptions].filter(option => !option.hidden);
      this.valuesNode.replaceChildren();
      if (this.control.multiple) {
        for (const option of selected) {
          const chip = document.createElement('span'); chip.dataset.selectTag = '';
          const text = document.createElement('span'); text.textContent = option.label; chip.append(text);
          if (!this.control.disabled && !this.disabledOption(option)) {
            const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.removeOption = this.options.indexOf(option);
            remove.setAttribute('aria-label', '移除 ' + option.label); remove.textContent = '×'; chip.append(remove);
          }
          this.valuesNode.append(chip);
        }
      } else this.valuesNode.textContent = selected[0]?.label || '';
      this.valuesNode.hidden = !selected.length || !this.control.multiple && Boolean(this.query);
      const placeholder = this.getAttribute('placeholder') || '请选择';
      this.searchInput.placeholder = selected.length ? '' : placeholder;
      if (this.searchInput.value !== this.query) this.searchInput.value = this.query;
      this.trigger.toggleAttribute('data-empty', !selected.length);
      this.trigger.toggleAttribute('data-filtering', Boolean(this.query));
      this.trigger.toggleAttribute('data-multiple', this.control.multiple);
      this.trigger.toggleAttribute('data-searchable', Boolean(this.searchable));
      this.trigger.setAttribute('data-placeholder', placeholder);
      this.searchInput.hidden = !this.searchable;
      this.searchInput.disabled = this.control.disabled;
      this.trigger.tabIndex = !this.searchable && !this.control.disabled ? 0 : -1;
      this.trigger.setAttribute('aria-disabled', String(this.control.disabled));
      this.clearButton.hidden = !this.hasAttribute('clearable') || !selected.length;
      this.clearButton.disabled = this.control.disabled;
      this.trigger.querySelector('[data-select-arrow]').hidden = this.control.multiple;
      for (const node of [this.trigger, this.searchInput]) {
        node.removeAttribute('role'); node.removeAttribute('aria-controls'); node.removeAttribute('aria-activedescendant');
        node.removeAttribute('aria-expanded'); node.removeAttribute('aria-autocomplete');
      }
      this.combobox.setAttribute('role', 'combobox');
      this.combobox.setAttribute('aria-label', this.label());
      this.combobox.setAttribute('aria-haspopup', 'listbox');
      this.combobox.setAttribute('aria-controls', this.popup.id);
      this.combobox.setAttribute('aria-expanded', String(Boolean(this.expanded)));
      this.combobox.setAttribute('aria-invalid', String(this.hasAttribute('invalid')));
      this.combobox.setAttribute('aria-busy', String(this.hasAttribute('loading')));
      if (this.searchable) this.combobox.setAttribute('aria-autocomplete', 'list');
    }
    disabledOption(option) {return option.disabled || option.parentElement?.disabled === true;}
    renderOptions() {
      if (!this.searchInput) return;
      const multiple = this.hasAttribute('multiple') || this.nativeMultiple;
      if (this.control.multiple !== multiple) this.control.multiple = multiple;
      this.options = [...this.control.options];
      if (this.pendingValues) {for (const option of this.options) option.selected = this.pendingValues.includes(option.value); this.pendingValues = null;}
      this.renderValues();
      this.popup.setAttribute('aria-label', this.label());
      this.popup.setAttribute('aria-multiselectable', String(this.control.multiple));
      this.popup.toggleAttribute('data-multiple', this.control.multiple);
      this.popup.replaceChildren(); this.rows = new Map();
      const query = this.query.trim().toLocaleLowerCase();
      let group = null, container = this.popup;
      for (const [index, option] of this.options.entries()) {
        const parent = option.parentElement, groupLabel = parent?.tagName === 'OPTGROUP' ? parent.label : '';
        if (option.hidden || ![option.label, option.value, option.dataset.description || '', groupLabel].join(' ').toLocaleLowerCase().includes(query)) continue;
        if (group !== parent) {
          group = parent; container = this.popup;
          if (groupLabel) {
            container = document.createElement('div'); container.setAttribute('role', 'group'); container.setAttribute('aria-label', groupLabel);
            const heading = document.createElement('div'); heading.dataset.selectGroup = ''; heading.setAttribute('role', 'presentation'); heading.textContent = groupLabel;
            container.append(heading); this.popup.append(container);
          }
        }
        const row = document.createElement('div'); row.dataset.optionIndex = index; row.id = this.popup.id + '-' + index;
        row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.selected)); row.setAttribute('aria-disabled', String(this.disabledOption(option)));
        const text = document.createElement('span'); text.dataset.optionText = ''; text.textContent = option.label; row.append(text);
        if (option.dataset.description) {const description = document.createElement('small'); description.textContent = option.dataset.description; text.append(description);}
        container.append(row); this.rows.set(index, row);
      }
      this.enabled = [...this.rows.keys()].filter(index => !this.disabledOption(this.options[index]));
      if (!this.rows.size || this.hasAttribute('loading')) {
        this.popup.replaceChildren(); this.rows.clear(); this.enabled = [];
        const empty = document.createElement('div'); empty.dataset.selectEmpty = ''; empty.setAttribute('role', 'status');
        empty.textContent = this.hasAttribute('loading') ? '加载中…' : this.getAttribute('empty-text') || (query ? '无匹配选项' : '暂无选项'); this.popup.append(empty);
      }
      const active = this.enabled.includes(this.activeIndex) ? this.activeIndex : this.enabled.find(index => this.options[index].selected) ?? this.enabled[0] ?? -1;
      this.highlight(active, false);
      if (this.control.disabled) this.setExpanded(false);
      else if (this.expanded) positionPopup(this.popup, this.trigger);
    }
    filter() {this.query = this.searchInput.value; this.renderOptions(); this.setExpanded(true); emit(this, 'ds-search', {query: this.query});}
    setExpanded(open) {
      if (!this.popup || !this.searchInput || open && this.control.disabled) return;
      const changed = this.expanded !== open; this.expanded = open;
      if (!open && this.query) {this.query = ''; this.renderOptions();}
      this.combobox.setAttribute('aria-expanded', String(open));
      if (open) {
        this.popup.hidden = false;
        if (this.popup.showPopover && !this.popup.matches(':popover-open')) this.popup.showPopover();
        positionPopup(this.popup, this.trigger); this.highlight(this.activeIndex);
      } else {
        if (this.popup.hidePopover && this.popup.matches(':popover-open')) this.popup.hidePopover();
        this.popup.hidden = true; this.combobox.removeAttribute('aria-activedescendant');
      }
      if (changed) emit(this, 'ds-open-change', {open});
    }
    highlight(index, scroll = true) {
      this.activeIndex = index;
      for (const [at, row] of this.rows || []) row.toggleAttribute('data-active', at === index);
      const row = this.rows?.get(index);
      if (row && this.expanded) {this.combobox.setAttribute('aria-activedescendant', row.id); if (scroll) row.scrollIntoView({block: 'nearest'});}
      else this.combobox?.removeAttribute('aria-activedescendant');
    }
    notify(previous) {
      if (JSON.stringify(previous) !== JSON.stringify(this.values)) {
        this.control.dispatchEvent(new win.Event('input', {bubbles: true}));
        this.control.dispatchEvent(new win.Event('change', {bubbles: true}));
      } else this.renderOptions();
    }
    choose(index) {
      const option = this.options[index];
      if (!option || this.control.disabled || this.disabledOption(option) || option.hidden) return;
      const previous = this.values;
      if (this.control.multiple) option.selected = !option.selected;
      else this.control.selectedIndex = index;
      this.query = ''; this.notify(previous);
      this.setExpanded(Boolean(this.control.multiple)); this.focus();
    }
    removeSelection(index) {
      const option = this.options[index];
      if (!option || this.control.disabled || this.disabledOption(option)) return;
      const previous = this.values; option.selected = false; this.notify(previous); this.focus();
    }
    clear() {
      if (this.control.disabled) return;
      const previous = this.values;
      if (this.control.multiple) for (const option of this.options) option.selected = false;
      else this.control.selectedIndex = -1;
      this.query = ''; this.notify(previous); this.setExpanded(false); this.focus(); emit(this, 'ds-clear', {});
    }
    key(event) {
      if (event.target.closest('button') && ['Enter', ' ', 'Backspace', 'Delete'].includes(event.key)) return;
      if (event.isComposing || this.composing || this.control.disabled) return;
      if (event.key === 'Tab') {this.setExpanded(false); return;}
      if (event.key === 'Escape') {if (this.expanded) {event.preventDefault(); event.stopPropagation(); this.setExpanded(false);} return;}
      if (event.key === 'Backspace' && this.control.multiple && !this.query) {
        const option = [...this.control.selectedOptions].reverse().find(option => !this.disabledOption(option));
        if (option) {event.preventDefault(); this.removeSelection(this.options.indexOf(option));} return;
      }
      if (event.key === 'Enter' || event.key === ' ' && !this.searchable) {
        event.preventDefault(); this.expanded ? this.choose(this.activeIndex) : this.setExpanded(true); return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        if (this.searchable && ['Home', 'End'].includes(event.key) && !this.expanded) return;
        event.preventDefault(); const wasOpen = this.expanded; this.setExpanded(true);
        const current = this.enabled.indexOf(this.activeIndex);
        const at = event.key === 'Home' ? 0 : event.key === 'End' ? this.enabled.length - 1 : !wasOpen ? Math.max(current, 0) : (current + (event.key === 'ArrowDown' ? 1 : -1) + this.enabled.length) % this.enabled.length;
        if (this.enabled[at] !== undefined) this.highlight(this.enabled[at]);
      } else if (!this.searchable && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        this.search = (Date.now() - (this.searchTime || 0) < 700 ? this.search || '' : '') + event.key.toLocaleLowerCase(); this.searchTime = Date.now();
        const found = this.enabled.find(index => this.options[index].label.toLocaleLowerCase().startsWith(this.search));
        if (found !== undefined) {event.preventDefault(); this.setExpanded(true); this.highlight(found);}
      }
    }
    focus(options) {if (this.control?.disabled) return; this.combobox ? this.combobox.focus(options) : super.focus(options);}
  }
  class Tabs extends Base {
    static observedAttributes = ['value'];
    connect() {
      const list = this.querySelector('[data-tab-list]');
      list?.setAttribute('role', 'tablist');
      this.tabs = [...this.querySelectorAll('button[data-tab]')];
      this.panels = [...this.querySelectorAll('[data-panel]')];
      const prefix = this.id || 'ds-tabs-' + ++serial;
      for (const [index, tab] of this.tabs.entries()) {
        tab.type = 'button'; tab.setAttribute('role', 'tab');
        tab.id ||= prefix + '-tab-' + index;
        const panel = this.panels.find(panel => panel.dataset.panel === tab.dataset.tab);
        if (panel) {
          panel.id ||= prefix + '-panel-' + index;
          panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
          tab.setAttribute('aria-controls', panel.id);
        }
        this.listen(tab, 'click', () => {if (!tab.disabled) this.activate(tab);});
        this.listen(tab, 'keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const enabled = this.tabs.filter(item => !item.disabled), at = enabled.indexOf(tab);
          const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(at + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
          if (next) {event.preventDefault(); next.focus(); this.activate(next);}
        });
      }
      this.sync();
    }
    activate(tab) {this.setAttribute('value', tab.dataset.tab); emit(this, 'ds-change', {value: tab.dataset.tab});}
    attributeChangedCallback() {this.sync();}
    sync() {
      if (!this.tabs?.length) return;
      const selected = this.tabs.find(tab => !tab.disabled && tab.dataset.tab === this.getAttribute('value')) || this.tabs.find(tab => !tab.disabled);
      for (const tab of this.tabs) {const active = tab === selected; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;}
      for (const panel of this.panels) panel.hidden = panel.dataset.panel !== selected?.dataset.tab;
    }
    get value() {return this.tabs?.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.tab || '';}
    set value(value) {this.setAttribute('value', value);}
  }
  class Dialog extends Base {
    static observedAttributes = ['open'];
    connect() {
      this.dialog = this.querySelector('dialog');
      if (!this.dialog) {this.dialog = document.createElement('dialog'); this.dialog.append(...this.childNodes); this.append(this.dialog);}
      this.listen(this.dialog, 'close', () => {if (this.dialog.open) return; this.removeAttribute('open'); emit(this, 'ds-close', {returnValue: this.dialog.returnValue});});
      this.listen(this.dialog, 'cancel', event => {if (!emit(this, 'ds-cancel', {}, true)) event.preventDefault();});
      this.listen(this.dialog, 'click', event => {if (event.target.closest('[data-ds-close]')) this.close();});
      this.sync();
    }
    attributeChangedCallback() {this.sync();}
    sync() {
      if (!this.dialog || !this.isConnected) return;
      if (this.hasAttribute('open') && !this.dialog.open) this.dialog.showModal();
      if (!this.hasAttribute('open') && this.dialog.open) this.dialog.close();
    }
    showModal() {this.setAttribute('open', '');}
    close(value = '') {this.dialog?.close(value); this.removeAttribute('open');}
  }
  class Dropdown extends Base {
    connect() {
      this.details = this.querySelector('details'); this.menu = this.querySelector('[data-menu]');
      if (!this.details || !this.menu) return;
      this.menu.setAttribute('popover', 'manual'); this.menu.hidden = true;
      this.listen(this.details, 'toggle', () => this.sync());
      this.listen(document, 'pointerdown', event => {if (!this.contains(event.target)) this.close();});
      const anchor = this.details.querySelector('summary');
      if (anchor) this.followPopup(anchor, this.menu, () => positionPopup(this.menu, anchor, false, false));
      this.listen(this, 'keydown', event => {
        if (event.key === 'Escape' && this.details.open) {event.preventDefault(); event.stopPropagation(); this.close(); this.details.querySelector('summary')?.focus();}
        if (!this.details.open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...this.menu.querySelectorAll('button:not(:disabled)')];
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index].focus();
      });
      this.listen(this.menu, 'click', event => {if (event.target.closest('button:not(:disabled)')) this.close();});
      this.sync();
    }
    sync() {
      if (!this.menu || !this.isConnected) return;
      if (this.details.open) {
        this.menu.hidden = false;
        if (this.menu.showPopover && !this.menu.matches(':popover-open')) this.menu.showPopover();
        positionPopup(this.menu, this.details.querySelector('summary'), false, false);
      } else {
        if (this.menu.hidePopover && this.menu.matches(':popover-open')) this.menu.hidePopover();
        this.menu.hidden = true;
      }
    }
    close() {if (this.details) {this.details.open = false; this.sync();}}
    disconnectedCallback() {this.close(); super.disconnectedCallback();}
  }
  class Table extends Base {
    connect() {
      this.listen(this, 'click', event => {
        const button = event.target.closest('button[data-sort]');
        if (!button || !this.contains(button)) return;
        const heading = button.closest('th'), table = heading?.closest('table'), body = table?.tBodies[0];
        if (!body) return;
        const ascending = heading.getAttribute('aria-sort') !== 'ascending';
        const rows = [...body.rows].sort((a, b) => (a.cells[heading.cellIndex]?.textContent || '').localeCompare(b.cells[heading.cellIndex]?.textContent || '', undefined, {numeric: true}) * (ascending ? 1 : -1));
        for (const th of table.querySelectorAll('th[aria-sort]')) th.removeAttribute('aria-sort');
        heading.setAttribute('aria-sort', ascending ? 'ascending' : 'descending'); body.append(...rows);
        emit(this, 'ds-sort', {column: button.dataset.sort, direction: ascending ? 'ascending' : 'descending'});
      });
    }
  }
  class Floating extends Base {
    static observedAttributes = ['open'];
    connect() {
      this.trigger = this.querySelector('[data-trigger]') || this.querySelector('button');
      this.popup = this.querySelector('[data-floating-content]');
      if (!this.popup || !this.trigger) return;
      this.followPopup(this.trigger, this.popup, () => positionPopup(this.popup, this.trigger, this.localName === 'ds-tooltip', false));
      this.popup.id ||= 'ds-floating-' + ++serial;
      this.popup.setAttribute('popover', this.localName === 'ds-tooltip' ? 'manual' : 'auto'); this.popup.hidden = true;
      if (this.localName === 'ds-tooltip') {
        this.popup.setAttribute('role', 'tooltip'); this.trigger.setAttribute('aria-describedby', this.popup.id);
        this.listen(this, 'pointerenter', () => this.setAttribute('open', ''));
        this.listen(this, 'pointerleave', () => this.removeAttribute('open'));
        this.listen(this.trigger, 'focus', () => this.setAttribute('open', ''));
        this.listen(this.trigger, 'blur', () => this.removeAttribute('open'));
      } else {
        this.trigger.setAttribute('aria-controls', this.popup.id);
        this.listen(this.trigger, 'click', () => this.toggleAttribute('open'));
        this.listen(this.popup, 'click', event => {
          const confirm = event.target.closest('[data-confirm]'), cancel = event.target.closest('[data-cancel]');
          if (confirm && emit(this, 'ds-confirm', {}, true) || cancel) this.removeAttribute('open');
        });
      }
      this.listen(this, 'keydown', event => {if (event.key === 'Escape' && this.hasAttribute('open')) {event.preventDefault(); event.stopPropagation(); this.removeAttribute('open'); this.trigger.focus();}});
      this.listen(this.popup, 'toggle', event => {if (event.newState === 'closed' && !this.popup.matches(':popover-open')) this.removeAttribute('open');});
      this.sync();
    }
    attributeChangedCallback() {this.sync();}
    sync() {
      if (!this.popup || !this.isConnected) return;
      const open = this.hasAttribute('open'); this.trigger.setAttribute('aria-expanded', String(open));
      if (open) {this.popup.hidden = false; if (this.popup.showPopover && !this.popup.matches(':popover-open')) this.popup.showPopover(); positionPopup(this.popup, this.trigger, this.localName === 'ds-tooltip', false);}
      else {if (this.popup.hidePopover && this.popup.matches(':popover-open')) this.popup.hidePopover(); this.popup.hidden = true;}
    }
    disconnectedCallback() {this.removeAttribute('open'); super.disconnectedCallback();}
  }
  const layoutFeedback = tag => {
    let offset = 24;
    for (const node of document.querySelectorAll(tag + '[open]')) {node.style.setProperty('--ds-feedback-top', offset + 'px'); offset += node.getBoundingClientRect().height + 12;}
  };
  class Feedback extends Base {
    static observedAttributes = ['open', 'duration'];
    connect() {
      this.setAttribute('popover', 'manual');
      this.setAttribute('role', this.getAttribute('tone') === 'error' ? 'alert' : 'status');
      this.setAttribute('aria-live', this.getAttribute('tone') === 'error' ? 'assertive' : 'polite');
      if (!this.querySelector('[data-feedback-body]')) {
        const body = document.createElement('div'); body.dataset.feedbackBody = ''; body.append(...this.childNodes); this.append(body);
      }
      if (this.localName === 'ds-notification' && !this.querySelector('[data-feedback-close]')) {
        const close = document.createElement('button'); close.type = 'button'; close.dataset.feedbackClose = ''; close.setAttribute('aria-label', '关闭通知'); close.textContent = '×'; this.append(close);
      }
      this.listen(this, 'click', event => {if (event.target.closest('[data-feedback-close]')) this.close();});
      this.listen(this, 'pointerenter', () => win.clearTimeout(this.timer));
      this.listen(this, 'pointerleave', () => this.startTimer());
      this.listen(this, 'focusin', () => win.clearTimeout(this.timer));
      this.listen(this, 'focusout', () => this.startTimer());
      this.sync();
    }
    attributeChangedCallback() {this.sync();}
    sync() {
      if (!this.lifecycle || !this.isConnected || !this.querySelector('[data-feedback-body]')) return;
      win.clearTimeout(this.timer);
      if (this.hasAttribute('open')) {
        if (this.showPopover && !this.matches(':popover-open')) this.showPopover();
        layoutFeedback(this.localName); this.startTimer();
      } else {if (this.hidePopover && this.matches(':popover-open')) this.hidePopover(); layoutFeedback(this.localName);}
    }
    startTimer() {
      win.clearTimeout(this.timer);
      const duration = this.hasAttribute('duration') ? Number(this.getAttribute('duration')) : this.localName === 'ds-toast' ? 3000 : 4500;
      if (this.hasAttribute('open') && Number.isFinite(duration) && duration > 0) this.timer = win.setTimeout(() => this.close(), duration);
    }
    show(message, options = {}) {
      if (message !== undefined) this.querySelector('[data-feedback-body]').textContent = String(message);
      if (options.tone) this.setAttribute('tone', options.tone);
      if (options.duration !== undefined) this.setAttribute('duration', String(options.duration));
      this.setAttribute('role', this.getAttribute('tone') === 'error' ? 'alert' : 'status');
      this.setAttribute('aria-live', this.getAttribute('tone') === 'error' ? 'assertive' : 'polite');
      this.setAttribute('open', ''); this.sync();
    }
    close() {this.removeAttribute('open'); emit(this, 'ds-close', {});}
    disconnectedCallback() {win.clearTimeout(this.timer); super.disconnectedCallback();}
  }
  class Progress extends Base {
    static observedAttributes = ['value', 'max'];
    connect() {this.control = this.querySelector('progress'); if (!this.control) {this.control = document.createElement('progress'); this.append(this.control);} this.sync();}
    attributeChangedCallback() {this.sync();}
    sync() {if (!this.control) return; this.control.max = Math.max(1, Number(this.getAttribute('max')) || 100); this.control.value = Math.max(0, Number(this.getAttribute('value')) || 0); this.control.setAttribute('aria-label', this.getAttribute('aria-label') || '进度');}
  }
  const definitions = {'ds-tabs': Tabs, 'ds-dialog': Dialog, 'ds-dropdown': Dropdown, 'ds-table': Table, 'ds-select': Select, 'ds-drawer': class extends Dialog {}, 'ds-toast': class extends Feedback {}, 'ds-notification': class extends Feedback {}, 'ds-tooltip': class extends Floating {}, 'ds-popconfirm': class extends Floating {}, 'ds-progress': Progress};
  for (const name of ['ds-button', 'ds-input', 'ds-textarea', 'ds-checkbox', 'ds-switch', 'ds-radio']) definitions[name] = class extends Control {};
  for (const name of ['ds-card', 'ds-tag', 'ds-alert', 'ds-empty', 'ds-skeleton']) definitions[name] = class extends Base {};
  for (const [name, Component] of Object.entries(definitions)) if (!customElements.get(name)) customElements.define(name, Component);
  if (!win.__dshDesktopComponents) {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-ds-open]');
      const feedback = event.target.closest('[data-ds-show]');
      if (feedback) {const node = document.getElementById(feedback.dataset.dsShow); if (['ds-toast', 'ds-notification'].includes(node?.localName)) node.show();}
      if (trigger) {const dialog = document.getElementById(trigger.dataset.dsOpen); if (['ds-dialog', 'ds-drawer'].includes(dialog?.localName)) dialog.showModal();}
    });
    win.__dshDesktopComponents = '1.2.2';
  }
}

export const DESKTOP_COMPONENT_VERSION = '1.2.2';
export const desktopOverlayCloseButton = label => `<button type="button" data-ds-close aria-label="${label}">×</button>`;
// Public integration recipes for this runtime version, shared by new and pinned systems.
export const desktopComponentUsage = {
  startup: 'Load components.js with defer. Initialize business handlers in DOMContentLoaded, after deferred component registration. querySelector/getElementById can access native Light DOM children. Give business script targets HTML ids. The shipped runtime owns option search, popup positioning, keyboard navigation, tab selection, modal lifecycle and feedback timers. Page scripts implement business data, validation and actions through these public APIs.',
  components: {
    'ds-button': {read: 'Native button receives click. Put type=submit and form=... on the native button when submitting a form outside the dialog.', example: '<ds-button variant="primary"><button type="submit" form="reply-form">发送回复</button></ds-button>'},
    'ds-input': {read: 'host.value or host.querySelector("input").value', write: 'host.value = text or host.setAttribute("value", text)', events: 'Native input/change bubble. ds-input/ds-change detail is {value,checked}.', validation: 'host.toggleAttribute("invalid", invalid); associate native input id with label for and an error message.'},
    'ds-textarea': {read: 'host.value or host.querySelector("textarea").value', write: 'host.value = text', events: 'Native input/change bubble. Use native form submit with preventDefault for local demo actions.', example: '<label for="reply-text">回复内容</label><ds-textarea id="reply-field"><textarea id="reply-text" rows="4"></textarea></ds-textarea>'},
    'ds-select': {read: 'host.value for one value. host.values for multiple', write: 'host.value = optionValue. Changing the native select directly should dispatch a bubbling change event to refresh the visible selection.', events: 'ds-change detail.value is the single value, detail.values contains multiple values. ds-search concerns the internal option search.', structure: 'Provide the native select/options. The runtime creates its search input, popup, option rows, selected chips and clear button.', example: '<ds-select id="assignee" searchable clearable placeholder="搜索负责人"><select><option value="">请选择负责人</option><option value="lin">林晓</option><option value="chen">陈然</option></select></ds-select>'},
    'ds-tabs': {read: 'host.value', write: 'host.value = "history" or host.setAttribute("value", "history")', events: 'ds-change detail.value is the chosen data-tab string. The runtime manages selected tab, panel.hidden and arrow-key focus.', lifecycle: 'Keep the connected host, tab buttons and panel wrappers stable. Update record-specific text or children inside the panels when the active record changes.', example: '<ds-tabs id="detail-tabs" value="messages"><div data-tab-list><button data-tab="messages">沟通记录</button><button data-tab="history">操作历史</button></div><section data-panel="messages">消息内容</section><section data-panel="history">历史内容</section></ds-tabs>', scene: 'Set the ds-tabs host attributes.value to the target tab string.'},
    'ds-dialog': {open: 'host.showModal() or host.setAttribute("open", "")', close: 'host.close(). Inner button[data-ds-close] closes its containing overlay. button[data-ds-open="overlay-id"] opens the matching host HTML id.', events: 'ds-close detail.returnValue follows close. ds-cancel is cancelable. Native Escape handling is provided.', example: `<ds-dialog id="confirm-dialog"><dialog aria-labelledby="confirm-title"><header><span id="confirm-title">确认操作</span>${desktopOverlayCloseButton('关闭')}</header><div data-dialog-body>确认内容</div><footer><ds-button><button type="button" data-ds-close>取消</button></ds-button><ds-button variant="primary"><button type="button" id="confirm-action">确认</button></ds-button></footer></dialog></ds-dialog>`, scene: 'Set attributes.open="" on the ds-dialog host to expose the same content for editing.'},
    'ds-drawer': {open: 'Same dialog structure and API as ds-dialog: host.showModal(), host.close(), open attribute and data-ds-close. placement=left|right.', scene: 'Set attributes.open="" on the ds-drawer host.'},
    'ds-toast': {show: 'host.show("操作成功", {tone:"success", duration:3000}); host.close()', structure: 'Provide ds-toast in the initial DOM before DOMContentLoaded so its feedback body is connected before show().', example: '<ds-toast id="feedback" tone="success" duration="3000">操作成功</ds-toast>', scene: 'Set attributes.open="" and attributes.duration="0" for a persistent editable success/error state.'},
    'ds-alert': {structure: 'Inline message, displayed as ordinary page content. Choose role=alert for validation errors, role=status for feedback. Toggle native hidden to control visibility.', example: '<ds-alert id="reply-error" tone="error" role="alert" hidden>请输入回复内容</ds-alert>'},
  },
};
export const desktopComponentsScript = () => `/* DSH Desktop Components ${DESKTOP_COMPONENT_VERSION} */\n(${installDesktopComponents.toString()})(window);\n(${installDatePicker.toString()})();\n`;
