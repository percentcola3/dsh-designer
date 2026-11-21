/** Light DOM presentation adapted to Vant 4's mobile component dimensions. */
export default `
.ds-mobile { margin:0;background:var(--ds-background);color:var(--ds-text);font:var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;overflow-wrap:break-word; }
.ds-mobile *, .ds-mobile *::before, .ds-mobile *::after { box-sizing:border-box; }
.ds-mobile [hidden] { display:none!important; }
.ds-mobile :is(button,input,select,textarea) { font:inherit; }
.ds-mobile :is(button,a,input,select,textarea) { touch-action:manipulation; }
.ds-mobile button { cursor:pointer; }
.ds-mobile button:disabled { cursor:not-allowed; }
.ds-mobile :is(button,a,input,textarea,select,[tabindex]):focus-visible { outline:2px solid var(--ds-focus-ring);outline-offset:2px; }
.ds-mobile ds-button, .ds-mobile ds-tag, .ds-mobile ds-badge { display:inline-block;vertical-align:middle; }
.ds-mobile :is(ds-input,ds-textarea,ds-select,ds-card,ds-tabs,ds-cell,ds-cell-group,ds-tabbar,ds-alert,ds-progress,ds-empty,ds-skeleton) { display:block; }
.ds-mobile ds-button { position:relative; }
.ds-mobile ds-button>button { display:inline-flex;align-items:center;justify-content:center;gap:8px;position:relative;min-height:max(var(--ds-control-height),var(--ds-touch-target));padding:0 15px;margin:0;border:1px solid var(--ds-button-border);border-radius:var(--ds-button-radius);background:var(--ds-surface);color:var(--ds-text);font-size:var(--ds-font-size);line-height:1.2;appearance:none;transition:opacity var(--ds-motion-mid); }
.ds-mobile ds-button[variant=primary]>button { background:var(--ds-primary);border-color:var(--ds-primary);color:var(--ds-primary-text); }
.ds-mobile ds-button[danger]>button { background:var(--ds-danger);border-color:var(--ds-danger);color:var(--ds-primary-text); }
.ds-mobile ds-button[plain]>button { background:var(--ds-surface); }
.ds-mobile ds-button[plain][variant=primary]>button { color:var(--ds-primary); }
.ds-mobile ds-button[plain][danger]>button { color:var(--ds-danger); }
.ds-mobile ds-button[variant=text]>button { border-color:transparent;background:transparent;color:var(--ds-primary); }
.ds-mobile ds-button>button:active:not(:disabled) { box-shadow:inset 0 0 0 100px rgb(0 0 0 / 10%); }
.ds-mobile ds-button>button:disabled { opacity:.5; }
.ds-mobile ds-button[loading]>button:disabled { opacity:1; }
.ds-mobile ds-button[loading]>button::before { content:'';width:20px;height:20px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:ds-mobile-spin .8s linear infinite; }
.ds-mobile ds-button[size=small] { display:inline-flex;align-items:center;min-height:var(--ds-touch-target); }
.ds-mobile ds-button[size=small]>button { min-height:var(--ds-control-height-sm);min-width:var(--ds-touch-target);padding:0 8px;font-size:12px; }
.ds-mobile ds-button[size=small]>button::after { content:'';position:absolute;inset:calc((var(--ds-control-height-sm) - var(--ds-touch-target)) / 2) 0; }
.ds-mobile ds-button[size=large], .ds-mobile ds-button[block] { display:block; }
.ds-mobile :is(ds-button[size=large],ds-button[block])>button { width:100%; }
.ds-mobile ds-button[size=large]>button { min-height:var(--ds-control-height-lg);font-size:16px; }
.ds-mobile ds-button[round]>button { border-radius:999px; }
.ds-mobile :is(ds-input>input,ds-textarea>textarea) { display:block;width:100%;min-width:0;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:var(--ds-text);font-size:var(--ds-font-size);line-height:24px;appearance:none; }
.ds-mobile ds-textarea>textarea { min-height:60px;resize:vertical; }
.ds-mobile :is(input,textarea)::placeholder { color:var(--ds-placeholder); }
.ds-mobile :is(ds-input,ds-textarea)[invalid] :is(input,textarea) { color:var(--ds-danger); }
.ds-mobile :is(ds-input,ds-textarea)[invalid] :is(input,textarea)::placeholder { color:var(--ds-danger); }
.ds-mobile :is(input,textarea):disabled { opacity:1;color:var(--ds-placeholder);-webkit-text-fill-color:var(--ds-placeholder); }
.ds-mobile .mobile-field { position:relative;display:grid;grid-template-columns:6.2em minmax(0,1fr);align-items:start;column-gap:12px;row-gap:0;min-height:var(--ds-cell-height);padding:10px var(--ds-page-padding);background:var(--ds-surface);font-size:var(--ds-font-size);line-height:24px; }
.ds-mobile .mobile-field:has(ds-select) { align-items:center;padding-block:0; }
.ds-mobile .mobile-field>small { grid-column:2;color:var(--ds-danger);font-size:12px;line-height:24px; }
.ds-mobile .mobile-field:has(input[type=search]) { grid-template-columns:1fr;background:var(--ds-surface);padding:10px 12px; }
.ds-mobile .mobile-field:has(input[type=search])>span { display:none; }
.ds-mobile .mobile-field input[type=search] { min-height:34px;padding:5px 12px 5px 32px;background:var(--ds-background);border-radius:var(--ds-radius); }
.ds-mobile .mobile-field:has(input[type=search])::before { position:absolute;left:20px;top:15px;font-family:DSHMobileIcons;font-size:16px;content:'\\e710';color:var(--ds-placeholder);pointer-events:none; }
.ds-mobile .mobile-fields { display:block;overflow:hidden;border-radius:var(--ds-card-radius);background:var(--ds-surface); }
.ds-mobile :is(.mobile-field:not(:last-child),ds-cell:not(:last-child))::after { position:absolute;right:var(--ds-page-padding);bottom:0;left:var(--ds-page-padding);border-bottom:1px solid var(--ds-cell-border);transform:scaleY(.5);content:'';pointer-events:none; }
.ds-mobile ds-select>[data-select-trigger] { position:relative;display:flex;align-items:center;gap:8px;min-width:0;width:100%;min-height:var(--ds-touch-target);color:var(--ds-text);background:transparent;border:0;line-height:24px;cursor:pointer; }
.ds-mobile [data-select-values] { min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ds-mobile [data-select-trigger][data-empty]:not([data-searchable])::before { content:attr(data-placeholder);color:var(--ds-placeholder);flex:1; }
.ds-mobile [data-select-search] { flex:1;min-width:20px;width:20px;height:var(--ds-touch-target);padding:0;border:0;outline:0;background:transparent;color:var(--ds-text);font:inherit; }
.ds-mobile [data-select-trigger][data-searchable]:not([data-multiple]) [data-select-values] { position:absolute;left:0;right:24px;pointer-events:none; }
.ds-mobile [data-select-trigger][data-searchable]:focus-within [data-select-values] { opacity:.45; }
.ds-mobile [data-select-trigger][data-multiple] { flex-wrap:wrap;gap:4px;padding:6px 0; }
.ds-mobile [data-select-trigger][data-multiple] [data-select-values] { display:contents; }
.ds-mobile [data-select-trigger][data-multiple] [data-select-search] { min-width:36px;height:28px; }
.ds-mobile [data-select-tag] { display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 6px;border-radius:2px;background:var(--ds-fill);color:var(--ds-text);font-size:12px;line-height:20px; }
.ds-mobile [data-select-tag]>span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ds-mobile [data-select-tag]>button { padding:0;border:0;background:transparent;color:var(--ds-muted);font-size:16px;line-height:20px; }
.ds-mobile [data-select-arrow] { flex:none;width:7px;height:7px;border-right:1px solid var(--ds-muted);border-bottom:1px solid var(--ds-muted);transform:rotate(45deg);margin-right:4px; }
.ds-mobile [data-select-clear] { flex:none;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:var(--ds-placeholder);color:var(--ds-surface);font-size:14px;line-height:18px; }
.ds-mobile [data-select-trigger][aria-disabled=true] { color:var(--ds-placeholder);cursor:not-allowed; }
.ds-mobile [data-select-options] { overflow:auto;padding:0;border:0;border-radius:var(--ds-option-radius);background:var(--ds-surface);color:var(--ds-text);font:var(--ds-font-size)/24px var(--ds-font-family);box-shadow:var(--ds-popup-shadow);scrollbar-width:thin;z-index:1100; }
.ds-mobile [data-select-options] [role=option] { display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:var(--ds-touch-target);padding:10px 16px;border:0;border-radius:var(--ds-option-radius);font-weight:400;cursor:pointer; }
.ds-mobile [data-select-options] [role=option]+[role=option] { margin-top:var(--ds-option-gap); }
.ds-mobile [data-select-options] [role=option]:is(:hover,[data-active]) { background:var(--ds-fill); }
.ds-mobile [data-select-options] [role=option][aria-selected=true] { color:var(--ds-primary); }
.ds-mobile [data-select-options] [role=option][aria-selected=true]::after { content:'\\e728';font:20px/1 DSHMobileIcons; }
.ds-mobile [data-select-options] [role=option][aria-disabled=true] { color:var(--ds-placeholder);background:transparent;cursor:not-allowed; }
.ds-mobile [data-option-text]>small { display:block;font-size:12px;line-height:18px;color:var(--ds-muted); }
.ds-mobile [data-select-group] { padding:8px 16px;color:var(--ds-muted);font-size:12px; }
.ds-mobile [data-select-empty] { padding:24px 16px;text-align:center;color:var(--ds-muted); }
.ds-mobile :is(ds-checkbox,ds-radio,ds-switch) { display:inline-flex;align-items:center;min-height:var(--ds-touch-target); }
.ds-mobile :is(ds-checkbox,ds-radio)>label { display:inline-flex;align-items:center;min-height:var(--ds-touch-target);line-height:20px;cursor:pointer; }
.ds-mobile :is(ds-checkbox,ds-radio) input { position:relative;flex:none;appearance:none;width:20px;height:20px;margin:0 8px 0 0;border:1px solid var(--ds-placeholder);border-radius:50%;background:var(--ds-surface);cursor:pointer; }
.ds-mobile ds-checkbox[shape=square] input { border-radius:2px; }
.ds-mobile :is(ds-checkbox,ds-radio) input:checked { background:var(--ds-primary);border-color:var(--ds-primary); }
.ds-mobile :is(ds-checkbox,ds-radio) input:checked::after { content:'\\e728';position:absolute;inset:0;display:grid;place-items:center;font:16px/1 DSHMobileIcons;color:var(--ds-primary-text); }
.ds-mobile :is(ds-checkbox,ds-radio) input:disabled { background:var(--ds-border);border-color:var(--ds-placeholder);cursor:not-allowed; }
.ds-mobile :is(ds-checkbox,ds-radio):has(input:disabled) { color:var(--ds-placeholder); }
.ds-mobile ds-switch input { position:relative;appearance:none;box-sizing:content-box;width:calc(var(--ds-switch-size)*1.8 + 4px);height:calc(var(--ds-switch-size) + 4px);margin:0;border:0;border-radius:999px;background:rgb(120 120 128 / 16%);cursor:pointer;transition:background var(--ds-motion-slow); }
.ds-mobile ds-switch input::after { content:'';position:absolute;left:2px;top:2px;width:var(--ds-switch-size);height:var(--ds-switch-size);border-radius:50%;background:var(--ds-surface);box-shadow:0 3px 1px rgb(0 0 0 / 5%);transition:transform var(--ds-motion-slow); }
.ds-mobile ds-switch input:checked { background:var(--ds-primary); }
.ds-mobile ds-switch input:checked::after { transform:translateX(calc(var(--ds-switch-size)*.8)); }
.ds-mobile ds-switch input:disabled { opacity:.5;cursor:not-allowed; }
.ds-mobile ds-nav-bar { position:relative;display:grid;grid-template-columns:minmax(60px,1fr) minmax(0,2fr) minmax(60px,1fr);align-items:center;min-height:var(--ds-nav-bar-height);padding:0 var(--ds-page-padding);background:var(--ds-nav-bar-bg); }
.ds-mobile ds-nav-bar::after, .ds-mobile ds-tabbar>[data-tab-list]::before { position:absolute;right:0;left:0;bottom:0;border-bottom:1px solid var(--ds-border);transform:scaleY(.5);content:'';pointer-events:none; }
.ds-mobile ds-nav-bar>strong { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:var(--ds-font-size-heading5);line-height:22px;font-weight:600; }
.ds-mobile ds-nav-bar>button { display:flex;align-items:center;gap:4px;min-height:var(--ds-touch-target);padding:0;border:0;background:transparent;color:var(--ds-primary);text-align:left; }
.ds-mobile ds-nav-bar>button:last-child { justify-content:flex-end;text-align:right; }
.ds-mobile ds-nav-bar>button:disabled { opacity:.5; }
.ds-mobile ds-nav-bar [data-nav-back]::before { content:'\\e668';font:16px/1 DSHMobileIcons; }
.ds-mobile ds-nav-bar[safe-area-top] { padding-top:env(safe-area-inset-top,0px); }
.ds-mobile ds-cell-group { overflow:hidden;background:var(--ds-cell-bg); }
.ds-mobile ds-cell-group[inset] { margin-inline:var(--ds-page-padding);border-radius:var(--ds-card-radius); }
.ds-mobile ds-cell { position:relative; }
.ds-mobile ds-cell>:is(button,a,[data-cell-content]) { display:flex;align-items:center;gap:4px;width:100%;min-height:max(var(--ds-cell-height),var(--ds-touch-target));padding:10px var(--ds-page-padding);margin:0;border:0;background:var(--ds-cell-bg);color:var(--ds-text);font:var(--ds-font-size)/24px var(--ds-font-family);text-align:left;text-decoration:none; }
.ds-mobile ds-cell>:is(button,a):active { background:var(--ds-fill); }
.ds-mobile ds-cell>:is(button,a,[data-cell-content])>span:first-child { flex:1;min-width:0; }
.ds-mobile ds-cell strong { display:block;font-weight:400; }
.ds-mobile ds-cell small { display:block;margin-top:4px;color:var(--ds-muted);font-size:12px;line-height:18px; }
.ds-mobile [data-cell-value] { color:var(--ds-muted);text-align:right; }
.ds-mobile [data-cell-arrow] { flex:none;width:16px;height:24px;color:var(--ds-muted);font:16px/24px DSHMobileIcons; }
.ds-mobile [data-cell-arrow]::before { content:'\\e660'; }
.ds-mobile [data-mobile-icon] { display:inline-grid;place-items:center;flex:none;font-family:DSHMobileIcons;font-style:normal;line-height:1; }
.ds-mobile ds-tabs [data-tab-list] { display:flex;overflow:auto;background:var(--ds-surface); }
.ds-mobile ds-tabs [data-tab] { position:relative;flex:1;min-width:0;min-height:44px;padding:0 4px;border:0;background:transparent;color:var(--ds-text-secondary);font:var(--ds-font-size)/20px var(--ds-font-family);white-space:nowrap; }
.ds-mobile ds-tabs [data-tab][aria-selected=true] { font-weight:600;color:var(--ds-text); }
.ds-mobile ds-tabs [data-tab][aria-selected=true]::after { content:'';position:absolute;bottom:0;left:50%;width:40px;height:3px;border-radius:3px;background:var(--ds-primary);transform:translateX(-50%); }
.ds-mobile ds-tabs [data-panel] { padding:16px 0; }
.ds-mobile ds-tabbar>[data-tab-list] { position:relative;display:flex;gap:0;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--ds-tabbar-bg); }
.ds-mobile ds-tabbar>[data-tab-list]::before { bottom:auto;top:0; }
.ds-mobile ds-tabbar [data-tab] { display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:max(var(--ds-tabbar-height),var(--ds-touch-target));padding:4px;border:0;background:var(--ds-tabbar-bg);color:var(--ds-text);font-size:12px;line-height:1; }
.ds-mobile ds-tabbar [data-tab][aria-selected=true] { color:var(--ds-tabbar-active-text); }
.ds-mobile ds-tabbar [data-mobile-icon] { font-size:22px; }
.ds-mobile ds-tag { width:fit-content;max-width:100%;padding:0 4px;border:1px solid transparent;border-radius:2px;background:var(--ds-muted);color:var(--ds-primary-text);font-size:12px;line-height:16px; }
.ds-mobile ds-tag[tone=primary] { background:var(--ds-primary); }
.ds-mobile ds-tag[tone=success] { background:var(--ds-success); }
.ds-mobile ds-tag[tone=warning] { background:var(--ds-warning); }
.ds-mobile ds-tag[tone=danger] { background:var(--ds-danger); }
.ds-mobile ds-tag[plain] { background:transparent;color:var(--ds-muted);border-color:currentColor; }
.ds-mobile ds-tag[plain][tone=primary] { color:var(--ds-primary); }
.ds-mobile ds-tag[plain][tone=success] { color:var(--ds-success); }
.ds-mobile ds-tag[plain][tone=warning] { color:var(--ds-warning); }
.ds-mobile ds-tag[plain][tone=danger] { color:var(--ds-danger); }
.ds-mobile ds-badge { display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border:1px solid var(--ds-surface);border-radius:999px;background:var(--ds-danger);color:var(--ds-primary-text);font-size:12px;line-height:14px; }
.ds-mobile ds-stepper { display:inline-flex;align-items:center;min-height:var(--ds-touch-target); }
.ds-mobile ds-stepper>button { position:relative;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:0;background:var(--ds-fill);color:var(--ds-text);font-size:20px;line-height:28px; }
.ds-mobile ds-stepper>button::after { content:'';position:absolute;inset:calc((28px - var(--ds-touch-target)) / 2) 0; }
.ds-mobile ds-stepper>button:first-child { border-radius:var(--ds-radius) 0 0 var(--ds-radius); }
.ds-mobile ds-stepper>button:last-child { border-radius:0 var(--ds-radius) var(--ds-radius) 0; }
.ds-mobile ds-stepper>button:disabled { background:var(--ds-background);color:var(--ds-placeholder); }
.ds-mobile ds-stepper>input { width:32px;height:28px;margin:0 2px;padding:0;border:0;border-radius:0;background:var(--ds-fill);color:var(--ds-text);font:var(--ds-font-size)/normal var(--ds-font-family);text-align:center;appearance:textfield; }
.ds-mobile ds-stepper input::-webkit-inner-spin-button { appearance:none; }
.ds-mobile :is(ds-dialog,ds-drawer)>dialog { position:fixed;margin:0;border:0;padding:0;background:var(--ds-surface);color:var(--ds-text);font:var(--ds-font-size)/var(--ds-line-height) var(--ds-font-family);box-shadow:none; }
.ds-mobile :is(ds-dialog,ds-drawer)>dialog::backdrop { background:rgb(0 0 0 / 70%); }
.ds-mobile ds-dialog>dialog { inset:45% auto auto 50%;width:var(--ds-dialog-width);max-width:90vw;max-height:85dvh;transform:translate(-50%,-50%);border-radius:var(--ds-popup-radius);overflow:hidden; }
.ds-mobile ds-dialog header { position:relative;padding:26px 24px 0;text-align:center;font-size:16px;font-weight:600;line-height:24px; }
.ds-mobile ds-dialog [data-dialog-body] { max-height:60dvh;overflow:auto;padding:8px 24px 26px;text-align:center;color:var(--ds-dialog-message-color,var(--ds-text));line-height:20px;white-space:pre-wrap; }
.ds-mobile ds-dialog header+[data-dialog-body] { color:var(--ds-dialog-message-color); }
.ds-mobile ds-dialog footer { position:relative;display:flex;overflow:hidden; }
.ds-mobile ds-dialog footer::before { content:'';position:absolute;top:0;right:0;left:0;border-top:1px solid var(--ds-border);transform:scaleY(.5);z-index:1;pointer-events:none; }
.ds-mobile ds-dialog footer ds-button { flex:1;display:block; }
.ds-mobile ds-dialog footer ds-button+ds-button { position:relative; }
.ds-mobile ds-dialog footer ds-button+ds-button::before { content:'';position:absolute;top:0;left:0;bottom:0;border-left:1px solid var(--ds-border);transform:scaleX(.5);z-index:1;pointer-events:none; }
.ds-mobile ds-dialog footer ds-button>button, .ds-mobile ds-dialog footer ds-button[variant=primary]>button { display:flex;width:100%;min-height:var(--ds-dialog-action-height);margin:0;padding:0;border:0;border-radius:0;background:var(--ds-surface);color:var(--ds-text);font-size:16px; }
.ds-mobile ds-dialog footer ds-button[variant=primary]>button { color:var(--ds-primary); }
.ds-mobile ds-dialog footer ds-button[danger]>button { background:var(--ds-surface);border-color:transparent;color:var(--ds-danger); }
.ds-mobile [data-overlay-close], .ds-mobile [data-feedback-close] { position:absolute;top:2px;right:4px;display:flex;align-items:center;justify-content:center;width:var(--ds-touch-target);height:var(--ds-touch-target);padding:0;border:0;background:transparent;color:var(--ds-placeholder);font-size:0;line-height:0;cursor:pointer; }
.ds-mobile [data-overlay-close]::before, .ds-mobile [data-feedback-close]::before { content:'\\e6a7';font:22px/1 DSHMobileIcons; }
.ds-mobile ds-drawer>dialog { inset:0 0 0 auto;width:85vw;max-width:85vw;height:100dvh; }
.ds-mobile ds-drawer[placement=left]>dialog { inset:0 auto 0 0; }
.ds-mobile ds-drawer>dialog:modal { display:flex;flex-direction:column; }
.ds-mobile ds-drawer[placement=bottom]>dialog { inset:auto 0 0;width:100%;max-width:100%;height:auto;max-height:80dvh;border-radius:var(--ds-popup-radius) var(--ds-popup-radius) 0 0;padding-bottom:env(safe-area-inset-bottom,0px); }
.ds-mobile ds-drawer header { position:relative;flex:none;min-height:48px;padding:0 48px;text-align:center;font-size:16px;font-weight:600;line-height:48px; }
.ds-mobile ds-drawer[placement=bottom] header>[data-overlay-close] { top:0;right:0;width:auto;min-width:var(--ds-touch-target);height:100%;padding:0 16px; }
.ds-mobile ds-drawer [data-dialog-body] { flex:1;min-height:0;overflow:auto;padding:var(--ds-page-padding);overscroll-behavior:contain; }
.ds-mobile ds-drawer footer { flex:none;padding:8px var(--ds-page-padding) 16px; }
.ds-mobile ds-drawer[data-kind=actions] [data-dialog-body] { padding:0; }
.ds-mobile [data-action-list] { display:flex;flex-direction:column; }
.ds-mobile [data-action-list]>button { width:100%;min-height:50px;padding:14px 16px;border:0;background:var(--ds-surface);color:var(--ds-text);font:16px/22px var(--ds-font-family); }
.ds-mobile [data-action-list]>button:active { background:var(--ds-fill); }
.ds-mobile [data-action-list]>button[data-danger] { color:var(--ds-danger); }
.ds-mobile ds-drawer[data-kind=actions] footer { padding:8px 0 0;background:var(--ds-background); }
.ds-mobile ds-drawer[data-kind=actions] footer ds-button>button { min-height:50px;border:0;border-radius:0;font-size:16px;color:var(--ds-dialog-message-color); }
.ds-mobile ds-drawer[data-kind=selection] header { display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0;line-height:20px; }
.ds-mobile ds-drawer[data-kind=selection] header>span { position:absolute;left:50%;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transform:translateX(-50%);pointer-events:none; }
.ds-mobile ds-drawer[data-kind=selection] header>button { min-height:44px;padding:0 16px;border:0;background:transparent;color:var(--ds-muted);font-size:14px;font-weight:400; }
.ds-mobile ds-drawer[data-kind=selection] header>button:last-child { color:var(--ds-primary); }
.ds-mobile ds-drawer[data-kind=selection] [data-dialog-body] { padding:0; }
.ds-mobile ds-drawer[data-kind=selection] ds-radio, .ds-mobile ds-drawer[data-kind=selection] ds-radio>label { width:100%; }
.ds-mobile ds-drawer[data-kind=selection] ds-radio>label { flex-direction:row-reverse;justify-content:space-between;padding:10px 16px;line-height:24px; }
.ds-mobile :is(ds-toast,ds-notification):not([open]) { display:none; }
.ds-mobile :is(ds-toast,ds-notification) { position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;color:var(--ds-text);font:var(--ds-font-size)/20px var(--ds-font-family);overflow:visible;z-index:1200; }
.ds-mobile ds-toast { top:50%;left:50%;transform:translate(-50%,-50%);max-width:70vw; }
.ds-mobile ds-toast [data-feedback-body] { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-sizing:content-box;width:88px;min-height:88px;padding:16px;background:rgb(0 0 0 / 70%);border-radius:8px;color:#fff;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere; }
.ds-mobile ds-toast [data-feedback-body]::before { content:'\\e728';font:36px/1 DSHMobileIcons; }
.ds-mobile ds-toast[tone=error] [data-feedback-body]::before { content:'\\e6a7'; }
.ds-mobile ds-toast[tone=warning] [data-feedback-body]::before { content:'!';font:32px/36px var(--ds-font-family); }
.ds-mobile ds-toast:not([tone]) [data-feedback-body], .ds-mobile ds-toast[tone=info] [data-feedback-body] { width:fit-content;min-width:96px;min-height:0;padding:8px 12px; }
.ds-mobile ds-toast:not([tone]) [data-feedback-body]::before, .ds-mobile ds-toast[tone=info] [data-feedback-body]::before { display:none; }
.ds-mobile ds-notification { inset:0 0 auto;width:100%;max-width:100%;padding:8px 44px 8px 16px;padding-top:max(8px,env(safe-area-inset-top,0px));background:var(--ds-primary);color:#fff;text-align:center; }
.ds-mobile ds-notification[tone=success] { background:var(--ds-success); }
.ds-mobile ds-notification[tone=warning] { background:var(--ds-warning); }
.ds-mobile ds-notification[tone=error] { background:var(--ds-danger); }
.ds-mobile ds-notification [data-feedback-body] strong { font-size:14px;font-weight:400; }
.ds-mobile ds-notification [data-feedback-body] p { margin:0; }
.ds-mobile ds-notification [data-feedback-close] { top:0;right:0;color:#fff; }
.ds-mobile ds-card { overflow:hidden;background:var(--ds-surface);border-radius:var(--ds-card-radius);box-shadow:var(--ds-card-shadow); }
.ds-mobile ds-card>header { padding:12px 16px;font-size:16px;font-weight:600; }
.ds-mobile ds-card>[data-card-body] { padding:16px; }
.ds-mobile ds-alert { padding:10px 16px;background:var(--ds-info-soft);color:var(--ds-info-active);font-size:14px;line-height:24px; }
.ds-mobile ds-alert[tone=success] { background:var(--ds-success-soft);color:var(--ds-success-active); }
.ds-mobile ds-alert[tone=warning] { background:var(--ds-warning-soft);color:var(--ds-warning-active); }
.ds-mobile ds-alert[tone=error] { background:var(--ds-danger-soft);color:var(--ds-danger-active); }
.ds-mobile ds-progress progress { display:block;appearance:none;width:100%;height:4px;border:0;border-radius:4px;overflow:hidden;background:var(--ds-border); }
.ds-mobile ds-progress progress::-webkit-progress-bar { background:var(--ds-border); }
.ds-mobile ds-progress progress::-webkit-progress-value { border-radius:4px;background:var(--ds-primary); }
.ds-mobile ds-progress progress::-moz-progress-bar { border-radius:4px;background:var(--ds-primary); }
.ds-mobile ds-empty { display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 16px;color:var(--ds-muted); }
.ds-mobile ds-empty::before { content:'\\e6ef';font:64px/1 DSHMobileIcons;color:var(--ds-placeholder); }
.ds-mobile ds-skeleton { display:flex;flex-direction:column;gap:12px; }
.ds-mobile ds-skeleton>span { display:block;height:16px;background:var(--ds-fill);animation:ds-mobile-pulse 1.2s ease-in-out infinite; }
.ds-mobile ds-skeleton>span:first-child { width:40%; }
.ds-mobile ds-skeleton>span:last-child { width:60%; }
@keyframes ds-mobile-spin { to { transform:rotate(360deg); } }
@keyframes ds-mobile-pulse { 50% { opacity:.4; } }
html[data-dsh-view-mode=edit] .ds-mobile [data-mobile-fixed] { position:static; }
@media(prefers-reduced-motion:reduce) { .ds-mobile *, .ds-mobile *::before, .ds-mobile *::after { transition:none!important;animation:none!important; } }
`;
