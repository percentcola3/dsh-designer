// Serialized into both portable desktop components and the designer frame.
export function installDatePicker(canvas = false) {
  if (document.querySelector('style[data-dsh-controlled="canvas-date-picker"]')) return;
  if (!HTMLElement.prototype.showPopover) return;
  let field, panel, root, month, observer, probe, draftDay;
  const labels = {date:'日期', month:'月份', week:'周', time:'时间', 'datetime-local':'日期时间', color:'颜色'};
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  let language = locale;
  try { language = Intl.getCanonicalLocales(document.documentElement.lang || locale)[0]; } catch { /* Use the browser locale for invalid lang attributes. */ }
  const dateLabel = new Intl.DateTimeFormat(language, {dateStyle: 'full', timeZone: 'UTC'});
  const monthLabel = new Intl.DateTimeFormat(language, {year: 'numeric', month: 'long', timeZone: 'UTC'});
  const weekday = new Intl.DateTimeFormat(language, {weekday: 'narrow', timeZone: 'UTC'});
  const day = 86400000;
  const iso = date => date.toISOString().split('T')[0];
  const parse = value => new Date(value + 'T00:00:00Z');
  const today = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  function close(returnFocus = false) {
    if (!panel) return;
    observer.disconnect();
    const previous = field;
    panel.remove();
    field = panel = root = null;
    if (returnFocus && previous.isConnected) previous.focus({preventScroll: true});
  }
  function place() {
    if (!panel) return;
    if (!field.isConnected || !field.getClientRects().length) { close(); return; }
    const rect = field.getBoundingClientRect(), gap = 4;
    const {width, height} = panel.getBoundingClientRect();
    const top = rect.bottom + gap + height <= innerHeight || rect.top < height + gap
      ? rect.bottom + gap : rect.top - height - gap;
    panel.style.left = Math.max(0, Math.min(rect.left, innerWidth - width)) + 'px';
    panel.style.top = Math.max(0, Math.min(top, innerHeight - height)) + 'px';
  }
  function allowed(value) {
    probe.value = value;
    return !!probe.value && probe.validity.valid && (field.type !== 'color' || /^#[0-9a-f]{6}$/i.test(value));
  }
  function commit(value) {
    const input = field;
    if (value && !allowed(value)) return;
    close(true);
    if (input.value === value) return;
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function weekValue(date) {
    const thursday = new Date(date);
    thursday.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay()+6)%7);
    const year = thursday.getUTCFullYear();
    const number = Math.ceil(((thursday - parse(pad(year,4)+'-01-01'))/day + 1)/7);
    return pad(year,4)+'-W'+pad(number);
  }
  function initialDay(value) {
    if (!value) return today();
    if (field.type === 'month') return value+'-01';
    if (field.type === 'week') {
      const [year, week] = value.split('-W');
      const jan4 = parse(year+'-01-04');
      return iso(new Date(+jan4 + (7*(Number(week)-1) - (jan4.getUTCDay()+6)%7)*day));
    }
    return field.type === 'datetime-local' ? value.split('T')[0] : field.type === 'date' ? value : today();
  }
  function draftValue() {
    if (field.type === 'color') return root.querySelector('[data-hex]').value.trim().toLowerCase();
    const parts = [...root.querySelectorAll('[data-part]')];
    if (parts.some(node => !node.value || !node.validity.valid)) return '';
    const [hours, minutes, seconds, milliseconds] = parts.map(node => pad(node.valueAsNumber, node.dataset.part === 'ms' ? 3 : 2));
    const time = hours+':'+minutes+(seconds ? ':'+seconds : '')+(milliseconds ? '.'+milliseconds : '');
    return field.type === 'time' ? time : draftDay+'T'+time;
  }
  function validateDraft() {
    const confirm = root.querySelector('[data-action=apply]');
    if (confirm) confirm.disabled = !allowed(draftValue());
  }
  function choice(grid, value, caption, label, selected, muted=false) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.date = value; button.textContent = caption;
    button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('muted', muted);
    if (field.type === 'datetime-local') {
      button.disabled = !!((field.min && value < field.min.split('T')[0]) || (field.max && value > field.max.split('T')[0]));
    } else button.disabled = !allowed(value);
    grid.append(button);
  }
  function render() {
    const grid = root.querySelector('.grid');
    grid.replaceChildren();
    root.querySelector('strong').textContent = monthLabel.format(month);
    if (field.type === 'month') {
      grid.classList.add('months');
      const year = pad(month.getUTCFullYear(),4);
      root.querySelector('strong').textContent = year;
      for(let m=1;m<=12;m++) {
        const value=year+'-'+pad(m);
        choice(grid,value,m+'月',value,value===field.value);
      }
    } else {
      for (let i=0;i<7;i++) {
        const label=document.createElement('span');
        label.textContent=weekday.format(new Date(Date.UTC(2024,0,1+i)));grid.append(label);
      }
      const offset=(month.getUTCDay()+6)%7;
      for(let i=0;i<42;i++) {
        const date=new Date(+month+(i-offset)*day);
        const value=field.type==='week'?weekValue(date):iso(date);
        choice(grid,value,String(date.getUTCDate()),dateLabel.format(date),value===(field.type==='datetime-local'?draftDay:field.value),date.getUTCMonth()!==month.getUTCMonth());
      }
    }
    const now = root.querySelector('[data-action=today]');
    const current = currentCalendarValue();
    now.disabled = field.type==='datetime-local' ? false : !allowed(current);
    place();
  }
  function currentCalendarValue() {
    const value=today();
    if(field.type==='week')return weekValue(parse(value));
    if(field.type==='month')return value.slice(0,7);
    return value;
  }
  function buildDraftControls() {
    const controls=root.querySelector('.draft');
    const apply=root.querySelector('[data-action=apply]');
    apply.hidden=false;
    if(field.type==='color'){
      controls.innerHTML='<label>颜色值<input data-hex maxlength="7" spellcheck="false" placeholder="#336699"></label><div class="swatches"></div>';
      controls.querySelector('[data-hex]').value=field.value;
      for(const color of ['#ffffff','#000000','#0000ff','#52c41a','#faad14','#ff4d4f','#722ed1','#13c2c2']){
        const btn=document.createElement('button');btn.type='button';btn.dataset.color=color;
        btn.style.background=color;btn.setAttribute('aria-label',color);controls.querySelector('.swatches').append(btn);
      }
    }else{
      const value=(field.type==='time'?field.value:field.value.split('T')[1]) || (field.type==='time'?field.min:field.min.split('T')[1]) || '00:00';
      const [hour,minute,sec='00']=value.split(':'), [second,ms='']=sec.split('.');
      const step=field.step==='any'?0:Number(field.step || 60);
      const limits=[value,field.min.split('T').pop(),field.max.split('T').pop(),field.defaultValue.split('T').pop()];
      const precision=limits.some(v=>v.includes('.')) || step%1!==0 || field.step==='any';
      const parts=[['h','时',23,hour],['m','分',59,minute]];
      if(precision || step%60!==0 || limits.some(v=>v.split(':').length===3))parts.push(['s','秒',59,second]);
      if(precision)parts.push(['ms','毫秒',999,ms.padEnd(3,'0')]);
      for(const [part,title,max,initial] of parts){
        const label=document.createElement('label');label.textContent=title;
        const n=document.createElement('input');n.type='number';n.inputMode='numeric';n.required=true;
        n.dataset.part=part;n.min='0';n.max=String(max);n.value=initial;
        label.append(n);controls.append(label);
      }
    }
    controls.addEventListener('input',validateDraft);
    validateDraft();
  }
  function open(input) {
    if (field === input) { close(true); return; }
    close();
    field=input;
    probe=document.createElement('input');probe.type=field.type;
    for(const name of ['min','max','step','value'])if(field.hasAttribute(name))probe.setAttribute(name,field.getAttribute(name));
    draftDay=initialDay(field.value || probe.min);
    month=parse(draftDay);
    if(!Number.isFinite(+month))month=parse(today());
    month.setUTCDate(1);
    panel = document.createElement('div');
    panel.dataset.dshControlled = 'canvas-date-picker';
    panel.popover = 'manual';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '选择'+labels[input.type]);
    const mobile=!!input.closest('.ds-mobile');
    panel.style.cssText = 'position:fixed;inset:auto;margin:0;padding:0;border:0;width:max-content;max-width:100vw;max-height:100vh;overflow:auto;background:transparent;color:inherit;';
    root = panel.attachShadow({mode: 'open'});
    root.innerHTML = `<style>
      .calendar{box-sizing:border-box;width:260px;max-width:100vw;padding:10px;color:var(--ds-text,CanvasText);background:var(--ds-input-bg,Canvas);border:1px solid var(--ds-input-border,#d9d9d9);border-radius:var(--ds-radius,6px);font:14px/1.4 system-ui,sans-serif}
      header,footer{display:flex;align-items:center;justify-content:space-between}button{background:transparent;color:inherit;font:inherit;border:0;border-radius:4px;cursor:pointer;min-height:28px}
      button:hover:enabled{background:var(--ds-primary-soft,#e6f4ff)}button:focus-visible{outline:2px solid var(--ds-primary,Highlight);outline-offset:-2px}
      .grid{display:grid;grid-template-columns:repeat(7,1fr);margin:6px 0}.grid span{text-align:center;padding:3px}.muted,button:disabled{color:#999}
      button[aria-pressed=true],button[aria-pressed=true]:hover{background:var(--ds-primary,Highlight);color:#fff}footer{border-top:1px solid var(--ds-input-border,#ddd);padding-top:4px;color:var(--ds-primary,Highlight)}
    .draft{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.draft label{flex:1;min-width:40px}.draft input{box-sizing:border-box;width:100%;height:var(--ds-control-height,32px);font:inherit;color:inherit;background:var(--ds-input-bg,Canvas);border:1px solid var(--ds-input-border,#ddd);border-radius:4px}
      .draft:not(:empty){margin:6px 0}.swatches{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.swatches button{border:1px solid var(--ds-input-border,#ddd)}.grid.months{grid-template-columns:repeat(3,1fr)}
      .mobile{--hit:var(--ds-touch-target,44px);width:calc(7 * var(--hit) + 14px);padding:6px}.mobile button{min-height:var(--hit);min-width:var(--hit)}.mobile .grid{grid-template-columns:repeat(7,minmax(var(--hit),1fr))}.mobile .grid.months{grid-template-columns:repeat(3,1fr)}
    </style><div class="calendar"><header><button type="button" data-action="previous" aria-label="上个月">‹</button><strong aria-live="polite"></strong><button type="button" data-action="next" aria-label="下个月">›</button></header><div class="grid"></div><div class="draft"></div><footer><button type="button" data-action="clear">清除</button><button type="button" data-action="today">今天</button><button type="button" hidden data-action="apply">确定</button></footer></div>`;
    root.querySelector('.calendar').classList.toggle('mobile',mobile);
    const calendar=!['time','color'].includes(field.type);
    if(!calendar){root.querySelector('header').remove();root.querySelector('.grid').remove();root.querySelector('[data-action=today]').remove();}
    if(field.type==='month')for(const [action,label] of [['previous','上一年'],['next','下一年']])root.querySelector('[data-action='+action+']').setAttribute('aria-label',label);
    if(field.type==='color')root.querySelector('[data-action=clear]').hidden=true;
    if(['time','datetime-local','color'].includes(field.type))buildDraftControls();
    root.addEventListener('click', event => {
      event.stopPropagation();
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      const action=button.dataset.action;
      if(action==='apply'){commit(draftValue());return;}
      if(action==='clear'){commit('');return;}
      if(button.dataset.color){root.querySelector('[data-hex]').value=button.dataset.color;validateDraft();return;}
      const value=button.dataset.date || (action==='today'?currentCalendarValue():null);
      if(value){
        if(field.type!=='datetime-local'){commit(value);return;}
        draftDay=value;month=parse(value);month.setUTCDate(1);render();validateDraft();return;
      }
      month.setUTCMonth(month.getUTCMonth()+(action==='next'?1:-1)*(field.type==='month'?12:1));
      render();
    });
    (input.closest('dialog,[popover]:popover-open,.ds-theme') || document.body).append(panel);
    observer = new ResizeObserver(place);
    observer.observe(input);
    panel.showPopover();
    if(calendar)render();else place();
    (root.querySelector('.draft input') || root.querySelector('[aria-pressed=true]:enabled') || root.querySelector('[data-date]:enabled') || root.querySelector('button')).focus({preventScroll: true});
  }
  const editable = input => input instanceof HTMLInputElement && Object.hasOwn(labels,input.type) && (canvas || input.closest('ds-input')) && !input.matches(':disabled') && !input.readOnly;
  const style = document.createElement('style');
  style.dataset.dshControlled = 'canvas-date-picker';
  style.textContent = Object.keys(labels).map(type=>(canvas?'':'ds-input ')+'input[type='+type+']::-webkit-calendar-picker-indicator').join(',')+'{pointer-events:none}';
  document.head.append(style);
  document.addEventListener('click', event => {
    const input = event.composedPath()[0];
    if (event.defaultPrevented || !editable(input)) return;
    event.preventDefault();
    open(input);
  });
  document.addEventListener('pointerdown', event => {
    if (panel && !event.composedPath().includes(panel) && event.target !== field) close();
  }, true);
  window.addEventListener('keydown', event => {
    if (panel && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); close(true);
    } else if (editable(event.target) && (event.key === 'F4' || (event.altKey && event.key === 'ArrowDown'))) {
      event.preventDefault(); event.stopImmediatePropagation(); open(event.target);
    }
  }, true);
  document.addEventListener('focusin', event => {
    if (panel && event.target !== field && !event.composedPath().includes(panel)) close();
  }, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('close', event => { if (panel && event.target.contains(field)) close(); }, true);
}
