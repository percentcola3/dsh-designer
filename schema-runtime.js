/** Serialized into portable HTML; all state and rendering stay inside the page. */
export function installSchemaRuntime(config,recordId,nodeId) {
  const start = () => {
    const {spec} = config;
    let state = structuredClone(spec.state), ui = {}, scene = null, dirty = false, feedbackTimer;
    const authoredDisabled = new WeakMap();
    let pendingFocus;
    const element = id => document.querySelector('[data-dsh-node="' + nodeId(id) + '"]');
    const parts = path => String(path).split('.');
    const get = (value,path) => parts(path).reduce((value,key) => value?.[key],value);
    const set = (value,path,next) => {
      const keys = parts(path), leaf = keys.pop();
      let target = value;
      for (const key of keys) {
        if (!target[key] || typeof target[key]!=='object' || Array.isArray(target[key])) target[key]={};
        target = target[key];
      }
      target[leaf] = structuredClone(next);
    };
    const merge = (base,patch) => {
      for (const [key,value] of Object.entries(patch || {})) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          if (!base[key] || typeof base[key] !== 'object' || Array.isArray(base[key])) base[key] = {};
          merge(base[key],value);
        } else base[key] = structuredClone(value);
      }
      return base;
    };
    const read = (value,context={}) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (typeof value.ref === 'string') {
          const [head,...tail] = parts(value.ref);
          if (head === 'item') return tail.length ? get(context.item,tail.join('.')) : context.item;
          if (head === 'event') return tail.length ? get(context.event,tail.join('.')) : context.event;
          return get(state,value.ref);
        }
        return Object.fromEntries(Object.entries(value).map(([key,child]) => [key,read(child,context)]));
      }
      if (Array.isArray(value)) return value.map(child => read(child,context));
      return value;
    };
    const condition = (rule,context) => {
      if (!rule) return true;
      const value = read({ref:rule.ref},context);
      if (Object.hasOwn(rule,'eq')) return value === read(rule.eq,context);
      if (Object.hasOwn(rule,'not')) return value !== read(rule.not,context);
      return rule.truthy === false ? !Boolean(value) : Boolean(value);
    };
    const contextFor = node => {
      const row = node?.closest('[data-schema-row]');
      if (!row) return {};
      const source = row.closest('[data-schema-collection]')?.dataset.schemaCollection;
      const key = row.dataset.schemaRecordKey || 'id';
      return {item:(get(state,source) || []).find(item => String(item[key]) === row.dataset.schemaRow),prefix:(row.dataset.schemaIdentity || row.dataset.dshNode) + ':'};
    };
    const writeBinding = (path,value,node) => {
      if (path.startsWith('item.')) {
        const context = contextFor(node);
        if (context.item) set(context.item,path.slice(5),value);
      } else set(state,path,value);
    };
    const modelValue = (node,value) => {
      const host = node.parentElement;
      if (node.dataset.schemaRadioValue !== undefined) {
        const checked = node.dataset.schemaRadioValue === JSON.stringify(value);
        node.checked = checked;
        const radio = host?.parentElement;
        if (radio?.localName === config.roles.radio && radio.hasAttribute('checked') !== checked) radio.toggleAttribute('checked',checked);
        return;
      }
      if (node.localName === 'select') {
        const component = host?.localName === config.roles.select ? host : null;
        if (node.multiple) {
          const selected = new Set(Array.isArray(value) ? value.map(String) : []);
          const options = [...node.options];
          if (options.some(option => option.selected !== selected.has(option.value))) {
            if (component && 'values' in component) component.values = [...selected];
            else for (const option of options) option.selected = selected.has(option.value);
          }
        } else {
          const next = String(value ?? '');
          // The component getter reads the native selection. Update the host first so it repaints its label.
          if (component && (component.getAttribute('value') !== next || node.value !== next)) {
            component.setAttribute('value',next);
          }
          if (node.value !== next) node.value = next;
        }
        return;
      }
      if (node.matches('input[type=checkbox],input[type=radio]')) node.checked = Boolean(value);
      else if ('value' in node && node.value !== String(value ?? '')) node.value = value ?? '';
      if (host?.matches('ds-switch,ds-checkbox,ds-radio')) host.checked = Boolean(value);
    };
    const validate = (id,showErrors=true,actual=id) => {
      const node = spec.nodes[id], values = read({ref:node.props.model},contextFor(element(actual))) || {};
      let valid = true, first;
      for (const field of node.props.fields) {
        const host = element(actual + ':' + field.id), message = element(actual + ':' + field.id + ':error');
        const group = field.control === 'radio' && Array.isArray(field.options);
        const choices = group ? [...(host?.querySelectorAll('input[type=radio]') || [])] : [];
        const input = group ? choices.find(choice=>choice.checked && !choice.disabled) || choices.find(choice=>!choice.disabled) : element(actual + ':' + field.id + ':input');
        const value = values[field.id], rules = field.rules || [];
        const empty = group ? !field.options.some(option=>option.value === value) : value == null || value === '' || value === false || typeof value === 'string' && !value.trim();
        let error = '';
        for (const descriptor of showErrors ? rules : []) {
          const type = typeof descriptor === 'string' ? descriptor : descriptor.type;
          if (type === 'required' && empty) error = '请填写' + field.label;
          if (!empty && type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) error = '请输入有效的邮箱地址';
          if (!empty && type === 'phone' && !/^\+?[\d\s()-]{7,20}$/.test(String(value))) error = '请输入有效的手机号';
          if (!empty && type === 'number' && !Number.isFinite(Number(value))) error = '请输入有效的数字';
          if (error) {error = descriptor.message || error; break;}
        }
        if (showErrors && !empty && field.pattern !== undefined && input?.validity?.patternMismatch) {
          error = field.patternMessage || (field.label + '格式不正确');
        } else if (showErrors && !error) {
          if (empty && field.required) error = '请填写' + field.label;
          else if (!empty && field.minlength !== undefined && String(value).length < field.minlength) error = field.label + '至少需要 ' + field.minlength + ' 个字符';
          else if (!empty && field.maxlength !== undefined && String(value).length > field.maxlength) error = field.label + '最多允许 ' + field.maxlength + ' 个字符';
        }
        if (showErrors && ui[actual]?.errors?.[field.id]) error=ui[actual].errors[field.id];
        host?.toggleAttribute('invalid',Boolean(error));
        if (group) {
          host?.setAttribute('aria-invalid',String(Boolean(error)));
          for (const choice of choices) choice.setAttribute('aria-invalid',String(Boolean(error)));
        } else input?.setAttribute('aria-invalid',String(Boolean(error)));
        if (message) {message.textContent = error; message.hidden = !error;}
        if (error) {valid = false; first ||= input;}
      }
      return {valid,first};
    };
    const renderCollections = () => {
      for (const container of document.querySelectorAll('[data-schema-collection]')) {
        const node = spec.nodes[container.dataset.schemaOwner], rows = get(state,container.dataset.schemaCollection) || [];
        const owner=container.dataset.schemaOwner, keyField=node.props.key||'id', target=node.use==='table'?container.querySelector('tbody'):container;
        for(const record of rows){
          const key=String(record[keyField]);
          let row=[...container.querySelectorAll('[data-schema-row]')].find(row=>row.closest('[data-schema-collection]')===container&&row.dataset.schemaRow===key);
          if(!row){
            const id=owner+':'+recordId(key);
            if(node.use==='table'){
              row=document.createElement('tr');row.dataset.dshNode=nodeId(id);row.dataset.schemaIdentity=id;
              for(const column of node.props.columns||[]){const cell=document.createElement('td');cell.dataset.dshNode=nodeId(id+':'+column.id);cell.dataset.schemaColumn=column.id;row.append(cell);}
              if(node.props.actions?.length){
                const cell=document.createElement('td');cell.dataset.dshNode=nodeId(id+':actions');
                node.props.actions.forEach((action,index)=>{
                  const host=document.createElement(config.roles.button||'button'),button=config.roles.button==='button'?host:document.createElement('button');
                  const actionId=id+':'+owner+':'+(action.id||'action-'+index);
                  host.dataset.dshNode=nodeId(actionId);host.setAttribute('variant',action.variant||'default');
                  button.type='button';button.dataset.dshNode=nodeId(actionId+':button');button.dataset.schemaAction=action.action;button.textContent=action.text;
                  if(button!==host)host.append(button);cell.append(host);
                });row.append(cell);
              }
            }else{
              const prototype=container.querySelector('template[data-schema-repeat-template]');
              row=prototype?.content.firstElementChild?.cloneNode(true);
              if(!row)continue;
              for(const child of [row,...row.querySelectorAll('*')]) {
                for (const attribute of ['data-dsh-node','id','for','aria-labelledby','aria-describedby','name']) {
                  const value = child.getAttribute(attribute);
                  if (value) {
                    const logical = (attribute === 'data-dsh-node' ? child.dataset.schemaIdentity || value : value).replaceAll(owner+':prototype',id);
                    child.setAttribute(attribute,attribute === 'data-dsh-node' ? nodeId(logical) : logical);
                    if (attribute === 'data-dsh-node') child.dataset.schemaIdentity = logical;
                  }
                }
              }
            }
            row.dataset.schemaRow=key;row.dataset.schemaRecordKey=keyField;target.append(row);
          }
          target.append(row);
        }
        const query = node.props.filter ? String(get(state,node.props.filter) || '').toLowerCase() : '';
        for (const row of container.querySelectorAll('[data-schema-row]')) {
          if (row.closest('[data-schema-collection]') !== container) continue;
          const record = rows.find(item => String(item[node.props.key || 'id']) === row.dataset.schemaRow);
          row.hidden = !record || Boolean(query && !Object.values(record).join(' ').toLowerCase().includes(query));
          if (!record) continue;
          for (const cell of row.querySelectorAll('[data-schema-column]')) cell.textContent = record[cell.dataset.schemaColumn] ?? '';
        }
        const empty = element(container.dataset.schemaOwner + ':empty');
        if (empty) empty.hidden = [...container.querySelectorAll('[data-schema-row]')].some(row => !row.hidden);
      }
    };
    const render = () => {
      renderCollections();
      for (const node of document.querySelectorAll('[data-schema-bind]')) {
        const value = read({ref:node.dataset.schemaBind},contextFor(node));
        modelValue(node,value);
      }
      for (const node of document.querySelectorAll('[data-schema-text]')) node.textContent = read({ref:node.dataset.schemaText},contextFor(node)) ?? '';
      const tabs = [];
      for (const node of document.querySelectorAll('[data-schema-definition]')) {
        const id = node.dataset.schemaDefinition, definition = spec.nodes[id], props = definition.props || {};
        const actual = node.dataset.schemaIdentity || node.dataset.dshNode, prefix = actual.slice(0,-id.length);
        node.hidden = Boolean(definition.hidden) || Boolean(definition.when && !condition(definition.when,contextFor(node)));
        const variant=ui[actual]||ui[id]||{};
        if(variant.hidden!==undefined)node.hidden=Boolean(variant.hidden);
        node.toggleAttribute('loading',Boolean(variant.loading));
        if(definition.use==='form')for(const input of node.querySelectorAll('input,select,textarea,button')) {
          if (!authoredDisabled.has(input)) authoredDisabled.set(input,input.disabled);
          input.disabled=Boolean(authoredDisabled.get(input)||variant.disabled||variant.loading);
        }
        else if(definition.use==='button'){const button=node.querySelector('button')||node;button.disabled=Boolean(props.disabled||variant.disabled||variant.loading);}
        if (['dialog','drawer'].includes(definition.use)) {
          const open = variant.open === true;
          if (open && !node.hasAttribute('open')) {
            node.hidden = false;
            if (typeof node.showModal === 'function') node.showModal(); else {node.setAttribute('open','');node.querySelector('dialog')?.showModal();}
          }
          if (!open && node.hasAttribute('open')) {
            if (typeof node.close === 'function') node.close(); else {node.removeAttribute('open');node.querySelector('dialog')?.close();}
          }
        }
        if (definition.use === 'form') validate(id,variant.validation === 'submitted',actual);
        if (definition.use === 'tabs') {
          const active = read({ref:props.bind},contextFor(node));
          if ('value' in node && node.value !== active) node.value = active;
          for (const item of props.items || []) {
            tabs.push({panel:element(prefix + item.nodeId),wrapper:element(actual + ':panel:' + item.id),hidden:item.id !== active});
            const tab = node.querySelector('[data-schema-tab="' + item.id + '"]');
            if (tab) {
              tab.setAttribute('aria-selected',String(item.id === active));
              tab.tabIndex = item.id === active ? 0 : -1;
            }
          }
        }
        if (definition.use === 'steps') for (const item of node.querySelectorAll('[data-schema-step]')) {
          const active = item.dataset.schemaStep === get(state,props.bind);
          if (active) item.setAttribute('aria-current','step'); else item.removeAttribute('aria-current');
        }
      }
      for (const {panel,wrapper,hidden} of tabs) {
        if (panel) panel.hidden = hidden;
        if (wrapper) wrapper.hidden = hidden;
      }
      const feedback = element('schema-feedback');
      if (feedback) {
        const value = ui.feedback;
        feedback.hidden = !value?.text;
        if (value?.text) {
          feedback.textContent = value.text;
          feedback.setAttribute('tone',value.tone || 'success');
          feedback.setAttribute('role',value.tone === 'error' ? 'alert' : 'status');
        }
      }
    };
    const enterScene = id => {
      if (!Object.hasOwn(spec.scenes,id)) return false;
      clearTimeout(feedbackTimer);
      state = merge(structuredClone(spec.state),spec.scenes[id].state);
      ui = structuredClone(spec.scenes[id].ui || {});
      scene = id; dirty = false; render();
      return true;
    };
    const requestFocus = (action,context) => {
      const request = {};
      pendingFocus = request;
      queueMicrotask(() => {
        if (pendingFocus !== request || document.documentElement.dataset.dshViewMode === 'edit') return;
        pendingFocus = null;
        const id = action.field ? action.target + ':' + action.field : action.target;
        const host = (context.prefix && element(context.prefix + id)) || element(id);
        const unavailable = '[hidden],[inert],[aria-hidden="true"],[disabled],[aria-disabled="true"]';
        if (!host || host.closest(unavailable)) return;
        const selector = 'button,input:not([type=hidden]),select,textarea,a[href],[tabindex],[contenteditable=true]';
        const control = action.field || ['button','input','textarea','checkbox','switch','select'].includes(spec.nodes[action.target]?.use);
        const delegates = host.focus !== HTMLElement.prototype.focus || host.shadowRoot?.delegatesFocus;
        let target = host;
        if (control && !delegates && !host.matches(selector)) {
          const candidates = [...host.querySelectorAll(selector)].filter(node =>
            !node.closest(unavailable) && !node.matches(':disabled') && node.getClientRects().length && getComputedStyle(node).visibility === 'visible');
          target = candidates.find(node=>node.dataset?.schemaRadioValue !== undefined && node.checked) || candidates[0];
        }
        if (!target || target.matches(':disabled') || getComputedStyle(target).visibility !== 'visible') return;
        if (!target.getClientRects().length && !(delegates && getComputedStyle(target).display === 'contents')) return;
        if (!delegates && !target.matches(selector)) {
          target.setAttribute('tabindex','-1');
          target.addEventListener('blur',() => {
            if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
          },{once:true});
        }
        target.focus({preventScroll:true});
        const active = document.activeElement;
        if (action.scroll !== false && active && (active === target || target.contains(active))) {
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          active.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduced ? 'instant' : 'smooth'});
        }
      });
    };
    const execute = (action,context={},depth=0) => {
      if (!action || depth > 30) return;
      if (typeof action === 'string') return execute(spec.actions[action],context,depth + 1);
      if (Array.isArray(action)) {for (const step of action) execute(step,context,depth + 1); return;}
      dirty = true;
      switch (action.type) {
        case 'sequence': execute(action.steps,context,depth + 1); break;
        case 'state.set': set(state,action.path,read(action.value,context)); break;
        case 'state.reset':
          if (action.path) set(state,action.path,get(spec.state,action.path));
          else state = structuredClone(spec.state);
          ui = {}; break;
        case 'form.submit': {
          const actual = (context.prefix || '') + action.target;
          ui[actual] = {...ui[actual],validation:'submitted',errors:{}};
          const result = validate(action.target,true,actual);
          execute(result.valid ? action.onValid : action.onInvalid,context,depth + 1);
          if (!result.valid) result.first?.focus();
          break;
        }
        case 'form.errors': {
          const actual=(context.prefix||'')+action.target;
          ui[actual]={...ui[actual],validation:'submitted',errors:structuredClone(action.errors)};
          validate(action.target,true,actual).first?.focus();
          break;
        }
        case 'overlay.open':
        case 'overlay.close': {
          const instance = context.prefix && context.prefix + action.target;
          const target = instance && element(instance) ? instance : action.target;
          ui[target] = {...ui[target],open:action.type === 'overlay.open'};
          break;
        }
        case 'feedback.show':
          clearTimeout(feedbackTimer);
          ui.feedback = {text:read(action.text,context),tone:action.tone || 'success'};
          if (action.duration !== 0) feedbackTimer = setTimeout(() => {ui.feedback = null;render();},action.duration || 3000);
          break;
        case 'scene.enter': enterScene(action.scene); break;
        case 'focus': requestFocus(action,context); break;
        case 'if': execute(condition(action.condition,context) ? action.then : action.else,context,depth + 1); break;
        case 'collection.update': {
          const rows = get(state,action.path), id = read(action.id,context), key = action.key || 'id', record = rows.find(row => row[key] === id);
          if (record) {const stableKey=record[key];Object.assign(record,read(action.value,context));record[key]=stableKey;}
          break;
        }
        case 'collection.append': {
          const rows=get(state,action.path),item=structuredClone(read(action.value,context)),key=action.key||'id';
          if(item[key]===undefined||rows.some(row=>row[key]===item[key]))item[key]='record-'+crypto.randomUUID();
          rows.push(item);break;
        }
        case 'collection.remove': {
          const id = read(action.id,context), key = action.key || 'id';
          set(state,action.path,get(state,action.path).filter(row => row[key] !== id)); break;
        }
        case 'navigate':
        case 'back': {
          if ((action.type === 'back' || action.pageId) && window.parent !== window && document.querySelector('script[data-dsh-editor-bridge]')) {
            window.parent.postMessage({type:'dsh:runtime',action:action.type,pageId:action.pageId},'*');
          } else if (action.type === 'back') {
            history.back();
          } else {
            const model = document.getElementById('dsh-document-model');
            const urls = model && JSON.parse(model.textContent).runtime?.pageURLs;
            const url = action.pageId ? urls?.[action.pageId] : action.url;
            if (typeof url === 'string' && url) location.href = url;
          }
          break;
        }
      }
      render();
    };
    const dismissOverlay = host => {
      const id = host?.dataset.schemaDefinition, definition = spec.nodes[id];
      if (!['dialog','drawer'].includes(definition?.use)) return;
      const actual = host.dataset.schemaIdentity || host.dataset.dshNode;
      const variant = ui[actual] || ui[id];
      if (!variant?.open) return;
      ui[actual] = {...variant,open:false};
      dirty = true;
      const footer = definition.props?.actions || [];
      const cancel = footer.find(button => /^(cancel|close)$/i.test(button.id || ''))
        || footer.find(button => /^(取消|关闭|cancel|close)$/i.test(button.text.trim()));
      const callback = definition.events?.close || cancel?.action;
      if (callback) execute(callback,contextFor(host));
      render();
    };
    document.addEventListener('click',event => {
      const dismiss = event.target.closest('[data-schema-dismiss]');
      if (dismiss && !dismiss.disabled) {
        event.preventDefault();
        dismissOverlay(dismiss.closest('[data-schema-definition]'));
        return;
      }
      const tab = event.target.closest('[data-schema-tab]');
      if (tab) {
        const owner = tab.closest('[data-schema-owner]')?.dataset.schemaOwner;
        if (spec.nodes[owner]?.use === 'tabs') {
          writeBinding(spec.nodes[owner].props.bind,tab.dataset.schemaTab,tab);
          dirty = true;
          render();
        }
      }
      const button = event.target.closest('[data-schema-action]');
      if (!button || button.disabled) return;
      event.preventDefault();
      execute(button.dataset.schemaAction,{...contextFor(button),event:{value:button.value}});
    });
    document.addEventListener('keydown',event => {
      const tab=event.target.closest('[data-schema-tab]'),host=tab?.closest('[data-schema-definition]');
      if (!tab || host?.localName !== 'div' || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tabs=[...host.querySelectorAll('[data-schema-tab]')],index=tabs.indexOf(tab);
      const offset=event.key==='ArrowLeft'?-1:1;
      let target=tabs[(index+offset+tabs.length)%tabs.length];
      if(event.key==='Home')target=tabs[0];
      if(event.key==='End')target=tabs.at(-1);
      event.preventDefault();
      writeBinding(spec.nodes[host.dataset.schemaDefinition].props.bind,target.dataset.schemaTab,target);
      dirty=true;render();target.focus();
    });
    document.addEventListener('submit',event => {
      const form = event.target.closest('[data-schema-submit]');
      if (!form) return;
      event.preventDefault(); execute(form.dataset.schemaSubmit,contextFor(form));
    });
    const inputChange = event => {
      const input = event.target.closest('[data-schema-bind]');
      if (!input) return;
      if (input.dataset.schemaRadioValue !== undefined && !input.checked) return;
      const value = input.dataset.schemaRadioValue !== undefined ? JSON.parse(input.dataset.schemaRadioValue)
        : input.matches('input[type=checkbox],input[type=radio]') ? input.checked
        : input.multiple ? [...input.selectedOptions].map(option => option.value)
        : input.type === 'number' && input.value !== '' ? input.valueAsNumber : input.value;
      writeBinding(input.dataset.schemaBind,value,input);
      dirty = true;
      const owner = input.closest('[data-schema-owner]')?.dataset.schemaOwner, definition = spec.nodes[owner];
      const form=input.closest('form[data-schema-submit]');
      if (form) {const id=form.dataset.schemaIdentity||form.dataset.dshNode;if(ui[id])ui[id].errors={};}
      if (definition?.events?.change) execute(definition.events.change,{event:{value}});
      render();
    };
    document.addEventListener('input',inputChange);
    document.addEventListener('change',inputChange);
    document.addEventListener('ds-close',event => {
      const host = event.target;
      if (!host.hasAttribute('open')) dismissOverlay(host);
    });
    document.addEventListener('close',event => {
      const dialog = event.target;
      // Native close events are queued. A newer scene may have reopened the same dialog.
      if (dialog.localName !== 'dialog' || dialog.open) return;
      const host = dialog.closest('[data-schema-definition]');
      if (host === dialog || host?.firstElementChild === dialog) dismissOverlay(host);
    },true);
    document.addEventListener('ds-change',event => {
      const id = event.target.dataset.dshNode, node = spec.nodes[id];
      if (node?.use === 'tabs' && node.props.bind) {writeBinding(node.props.bind,event.detail.value,event.target);dirty = true;render();}
    });
    const original = window.__DSH_DESIGN_RUNTIME__;
    const setScene = id => {
      pendingFocus = null;
      if (!Object.hasOwn(spec.scenes,id)) return original?.setScene?.(id) ?? false;
      enterScene(id);
      original?.setScene?.(id);
      render();
      return true;
    };
    const resetScene = () => {
      pendingFocus = null;
      state = structuredClone(spec.state); ui = {}; scene = null; dirty = false;
      original?.resetScene?.(); render();
    };
    const getState = () => ({...original?.getState?.(),scene,sceneId:scene,dirty,schemaState:structuredClone(state),schemaUI:structuredClone(ui)});
    window.__DSH_DESIGN_RUNTIME__ = {...original,setScene,resetScene,reset:resetScene,getState};
    window.__DSH_SCHEMA_RUNTIME__ = {execute,getState,setScene,render};
    document.addEventListener('dsh:scene',event => {
      if (!event.detail?.applied) event.detail?.reset ? resetScene() : setScene(event.detail?.id);
    });
    const initial=JSON.parse(document.querySelector('#dsh-document-model')?.textContent||'{}').scenes?.active;
    if(initial&&Object.hasOwn(spec.scenes,initial))setScene(initial);else render();
  };
  const ready = () => {
    if (window.__DSH_DESIGN_RUNTIME__) start();
    else document.addEventListener('dsh:runtime-ready',start,{once:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready,{once:true});
  else ready();
}
