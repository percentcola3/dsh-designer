import {desktopComponentsScript} from './desktop-components.js';

/** Shared native form/overlay behavior plus mobile-specific Light DOM components. */
export function installMobileComponents(win) {
  const {customElements, HTMLElement, document} = win;
  const Base = customElements.get('ds-card');
  class Stepper extends customElements.get('ds-input') {
    connect() {
      super.connect();
      this.control.type = 'number';
      if (!this.initialValueSet) {this.control.defaultValue = this.control.value; this.initialValueSet = true;}
      for (const [direction, text, label] of [['down', '−', '减少'], ['up', '+', '增加']]) {
        let button = this.querySelector(`[data-step="${direction}"]`);
        if (!button) {
          button = document.createElement('button'); button.dataset.step = direction; button.textContent = text;
          if (direction === 'down') this.prepend(button); else this.append(button);
        }
        button.type = 'button';
        button.setAttribute('aria-label', label + (this.getAttribute('aria-label') || '数量'));
        this.listen(button, 'click', () => {
          if (this.control.disabled || this.control.readOnly) return;
          try {this.control.stepUp(direction === 'up' ? 1 : -1);} catch {this.control.reportValidity(); return;}
          this.control.dispatchEvent(new win.Event('input', {bubbles: true}));
          this.control.dispatchEvent(new win.Event('change', {bubbles: true}));
        });
      }
      this.listen(this.control, 'input', () => this.syncButtons());
      this.listen(this.control, 'change', () => this.syncButtons());
      if (this.control.form) this.listen(this.control.form, 'reset', () => win.setTimeout(() => {if (this.isConnected) this.syncButtons();}, 0));
      this.syncButtons();
    }
    sync(changed) {super.sync(changed); this.syncButtons();}
    syncButtons() {
      if (!this.control) return;
      const value = this.control.valueAsNumber;
      const limits = {down: Number(this.control.min || '-Infinity'), up: Number(this.control.max || 'Infinity')};
      for (const direction of ['down', 'up']) {
        const button = this.querySelector(`[data-step="${direction}"]`);
        if (button) button.disabled = this.control.disabled || this.control.readOnly || (direction === 'down' ? value <= limits.down : value >= limits.up);
      }
    }
  }
  class NavBar extends Base {
    connect() {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'navigation');
      if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', '页面导航');
    }
  }
  const definitions = {
    'ds-nav-bar': NavBar,
    'ds-tabbar': class extends customElements.get('ds-tabs') {},
    'ds-stepper': Stepper,
    'ds-cell': class extends Base {},
    'ds-cell-group': class extends Base {},
    'ds-badge': class extends HTMLElement {},
  };
  for (const [name, Component] of Object.entries(definitions)) if (!customElements.get(name)) customElements.define(name, Component);
  if (!win.__dshMobileComponents) document.addEventListener('click', event => {
    const navigation = event.target.closest('[data-mobile-tab]');
    if (navigation) {
      const tabs = navigation.closest('ds-tabbar');
      const target = tabs?.tabs?.find(tab => tab.dataset.tab === navigation.dataset.mobileTab);
      if (target && !target.disabled) tabs.activate(target);
    }
    const apply = event.target.closest('[data-mobile-apply]');
    if (apply) {
      const panel = apply.closest('ds-drawer'), name = apply.dataset.mobileApply;
      const choice = [...(panel?.querySelectorAll('input[type=radio]:checked') || [])].find(input => input.name === name);
      if (!choice) return;
      for (const target of document.querySelectorAll('[data-mobile-choice]')) if (target.dataset.mobileChoice === name) target.textContent = choice.closest('label')?.textContent.trim() || choice.value;
      panel.dispatchEvent(new win.CustomEvent('ds-change', {bubbles: true, composed: true, detail: {name, value: choice.value}}));
    }
  });
  win.__dshMobileComponents = '1.1.2';
}

export const MOBILE_COMPONENT_VERSION = '1.1.2';
export const mobileComponentsScript = () => desktopComponentsScript() + `\n/* DSH Mobile Components ${MOBILE_COMPONENT_VERSION} */\n(${installMobileComponents.toString()})(window);\n`;
