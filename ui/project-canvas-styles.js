export default `
.wb-canvas-editor{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.wb-design-strip{display:grid;grid-template-columns:minmax(var(--wb-control-height,28px),1fr) minmax(0,2fr) minmax(0,1fr) var(--wb-sidebar-space,0px);align-items:center;column-gap:0;flex-shrink:0;min-width:0;height:38px;padding:0 12px;background:var(--wb-panel);border-bottom:1px solid var(--wb-divider)}
.wb-design-strip-left{display:flex;align-items:center;min-width:0}
.wb-design-center{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:100%;overflow:hidden}
.wb-design-tabs{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:none}
.wb-design-tabs::-webkit-scrollbar{display:none}
.wb-v2 .wb-design-tab{display:flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;max-width:240px;height:var(--wb-tab-height,28px);padding:0 9px;border:1px solid transparent;border-radius:var(--wb-radius-control);background:transparent;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb-design-tab>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-design-tab>small{color:var(--wb-faint);font-size:9px}
.wb-design-workflow-tab{display:flex;align-items:center;flex:none;border:1px solid transparent;border-radius:var(--wb-radius-control);overflow:hidden}
.wb-v2 .wb-design-workflow-tab[data-selected=true]{border-color:var(--wb-brand-soft);background:var(--wb-brand-soft);color:var(--wb-brand-ink)}
.wb-v2 .wb-design-workflow-tab>.wb-design-tab{border:0;background:transparent;box-shadow:none;padding-right:4px}
.wb-v2 .wb-design-workflow-tab[data-selected=true]>.wb-design-tab{background:transparent;border-color:transparent;box-shadow:none}
.wb-v2 .wb-design-workflow-tab[data-selected=true]>.wb-design-workflow-close{color:var(--wb-brand-ink)}
.wb-design-workflow-close{display:grid;place-items:center;flex:none;width:22px;height:26px;margin-right:2px;padding:0;border:0;border-radius:var(--wb-radius-sm);background:transparent;color:var(--wb-muted)}
.wb-design-workflow-close:hover{background:var(--wb-hover)}
.wb-canvas-workflow{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--wb-bg)}
.wb-canvas-loading-conversation{display:flex;flex:1;flex-direction:column;gap:16px;min-height:180px;padding:18px;background:var(--wb-panel);border:1px solid var(--wb-divider);border-radius:var(--wb-radius-menu);font-size:12px;color:var(--wb-muted)}
.wb-canvas-loading-conversation>strong{color:var(--wb-text)}
.wb-v2 .wb-design-tab:not([aria-selected=true]):hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-v2 .wb-design-tab[aria-selected=true]{border-color:var(--wb-brand-soft);color:var(--wb-brand-ink);background:var(--wb-brand-soft);font-weight:600;box-shadow:none}
.wb-design-imports{grid-column:3 / -1;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}
.wb-v2 .wb-design-strip .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-height:var(--wb-control-height,28px);height:var(--wb-control-height,28px);padding:0 7px;border:0;border-radius:var(--wb-radius-control);background:transparent;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb-v2 .wb-design-strip .wb-button:not(:disabled):hover{background:var(--wb-panel);color:var(--wb-brand-ink)}
.wb-v2 .wb-design-strip .wb-design-files[aria-pressed=true]{background:var(--wb-panel);color:var(--wb-brand-ink)}
.wb-v2 .wb-design-center>.wb-design-add{display:grid;place-items:center;flex:none;width:var(--wb-control-height,28px);min-width:var(--wb-control-height,28px);padding:0}
@media(min-width:861px){.wb-canvas-editor[data-ai-layout=sidebar]{--wb-sidebar-margin:12px;--wb-sidebar-space:calc(var(--wb-conversation-width) + 2 * var(--wb-sidebar-margin))}}
@media(max-width:900px){.wb-design-strip{grid-template-columns:minmax(var(--wb-control-height,28px),1fr) minmax(0,3fr) minmax(0,1fr) var(--wb-sidebar-space,0px)}.wb-design-imports .wb-button>span,.wb-design-files>span{display:none}.wb-v2 .wb-design-strip .wb-button{width:var(--wb-control-height,28px);padding:0}}

.wb-canvas-board{position:relative;display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;background:var(--wb-canvas)}
.wb-canvas-board:has(>.wb-canvas-viewport>.wb-canvas-tools){background-image:radial-gradient(circle,color-mix(in srgb,var(--wb-text) 24%,transparent) .8px,transparent 1.25px);background-size:16px 16px}
.wb-canvas-viewport{position:relative;display:flex;flex:1;min-width:0;min-height:0;overflow:hidden}
.wb-canvas-surface{position:absolute;inset:0;display:flex;min-width:0;min-height:0}
.wb-canvas-surface>.wb-resource{flex:1;min-width:0;min-height:0;background:transparent}
.wb-empty-stage{display:flex;flex:1;min-width:0;min-height:0;outline:none;overflow:hidden;touch-action:none;overscroll-behavior:contain}
.wb-canvas-empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding-bottom:130px;color:var(--wb-faint);pointer-events:none;user-select:none}
.wb-canvas-empty>.wb-button{pointer-events:auto}
.wb-canvas-hand{cursor:grab}.wb-canvas-panning{cursor:grabbing;user-select:none}
.wb-v2 .wb-canvas-empty>.wb-button{background:var(--wb-panel);color:var(--wb-brand-ink);box-shadow:var(--wb-shadow-soft)}
.wb-canvas-tools{position:absolute;z-index:45;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;max-width:calc(100% - 24px);padding:3px 6px;border:1px solid color-mix(in srgb,var(--wb-text) 12%,var(--wb-panel));border-radius:999px;corner-shape:round;background:var(--wb-panel);box-shadow:0 2px 4px #10182814,0 5px 12px -3px #10182838}
.wb.wb-v2 .wb-canvas-tools .wb-button{display:grid;place-items:center;flex:none;width:24px;height:24px;min-height:24px;padding:4px;border:0;border-radius:7px;background:transparent;box-shadow:none;color:var(--wb-muted)}
.wb.wb-v2 .wb-canvas-tools .wb-button:not(:disabled):hover{background:var(--wb-hover);color:var(--wb-text)}
.wb.wb-v2 .wb-canvas-tools .wb-button[aria-pressed=true]{background:var(--wb-brand-soft);color:var(--wb-brand-ink)}
.wb-canvas-tools .wb-button{position:relative}
.wb-canvas-tools .wb-button[data-tooltip]::after{content:attr(data-tooltip);position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);padding:5px 8px;border-radius:7px;background:var(--wb-text);color:var(--wb-panel);font-size:11px;font-weight:400;line-height:1.5;white-space:nowrap;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s,visibility .12s}
.wb-canvas-tools .wb-button:hover::after,.wb-canvas-tools .wb-button:focus-visible::after{opacity:1;visibility:visible;transition-delay:.15s}
.wb-canvas-editor[data-preview=true]{position:fixed;inset:0;z-index:1200;background:var(--wb-panel)}
.wb-canvas-editor[data-preview=true]>.wb-design-strip,.wb-canvas-editor[data-preview=true] .wb-canvas-conversation,.wb-canvas-editor[data-preview=true] .wb-navigation,.wb-canvas-editor[data-preview=true] .wb-canvas-gesture-hint{display:none}
.wb-canvas-editor[data-preview=true] .wb-canvas-board{background:var(--wb-panel)}
.wb-canvas-editor[data-preview=true] .wb-canvas-tools{top:12px;right:14px;left:auto;transform:none}
.wb-canvas-editor[data-preview=true] .wb-canvas-tools .wb-button[data-tooltip]::after{left:auto;right:0;transform:none}
.wb-canvas-mode-group{display:flex;align-items:center;gap:2px}
.wb-canvas-tool-divider{flex:none;width:1px;height:14px;margin-inline:3px;background:var(--wb-divider)}
.wb-canvas-gesture-hint{position:absolute;z-index:5;left:16px;bottom:14px;max-width:calc(100% - 32px);font-size:10px;color:var(--wb-faint);pointer-events:none;user-select:none}
@media(max-width:1100px){.wb-canvas-gesture-hint{display:none}}
.wb-canvas-conversation{position:absolute;z-index:40;display:flex;min-width:0;min-height:0;left:50%;bottom:18px;transform:translateX(-50%);width:var(--wb-conversation-width,520px);max-width:calc(100% - 20px);max-height:calc(100% - 92px);pointer-events:none}
.wb-canvas-conversation>*{pointer-events:auto}
.wb-canvas-conversation[data-layout=sidebar]{position:relative;align-self:stretch;flex:0 0 var(--wb-conversation-width,400px);left:auto;bottom:auto;transform:none;width:var(--wb-conversation-width,400px);max-height:none;margin:var(--wb-sidebar-margin,12px)}
.wb-conversation-resizer{position:absolute;z-index:12;top:12px;bottom:12px;width:12px;cursor:col-resize;touch-action:none;outline:none;user-select:none}
.wb-conversation-resizer[data-resize-edge=left]{left:-6px}
.wb-conversation-resizer[data-resize-edge=right]{right:-6px}
.wb-conversation-resizer:focus-visible{outline:2px solid var(--wb-brand-ink);outline-offset:1px;border-radius:var(--wb-radius-sm)}
.wb-conversation-resize-shield{position:fixed;inset:0;z-index:95;cursor:col-resize;touch-action:none;user-select:none}
.wb-conversation-resizing{cursor:col-resize;user-select:none}
@media(max-width:860px){.wb-canvas-conversation[data-layout=sidebar]{z-index:60;position:absolute;inset:10px 10px 10px auto;flex:none;margin:0;max-width:calc(100% - 20px)}}
.wb-v2 .wb-canvas-editor .wb-navigation{position:absolute;z-index:35;left:16px;top:20px;bottom:20px;max-height:none;max-width:calc(100% - 32px);min-width:min(320px,calc(100% - 32px));margin:0;border:1px solid var(--wb-divider);border-radius:var(--wb-radius-surface);background:var(--wb-panel);box-shadow:var(--wb-shadow-hover);overflow:visible}
.wb-canvas-editor .wb-nav-body{flex:1;min-height:0;overflow:auto;padding:4px 6px 8px}
.wb .wb-file-row{height:32px;min-height:32px;padding-block:0;border-radius:var(--wb-radius-sm);font-size:12px;cursor:pointer;user-select:none}
.wb .wb-file-row .wb-file-disclosure{display:flex;align-items:center;width:12px;flex:none;color:var(--wb-faint)}
.wb .wb-file-row .wb-file-icon{flex:none}
.wb .wb-file-row{--wb-file-icon-color:#4889e6}
.wb .wb-file-row[data-file-kind=directory]{--wb-file-icon-color:#d99b37}
.wb .wb-file-row:is([data-file-extension=js],[data-file-extension=jsx],[data-file-extension=json],[data-file-extension=yml],[data-file-extension=yaml]){--wb-file-icon-color:#c99a23}
.wb .wb-file-row:is([data-file-extension=vue],[data-file-extension=svg],[data-file-extension=csv]){--wb-file-icon-color:#259d76}
.wb .wb-file-row:is([data-file-extension=html],[data-file-extension=pdf]){--wb-file-icon-color:#dc7456}
.wb .wb-file-row:is([data-file-extension=css],[data-file-extension=scss],[data-file-extension=mp4],[data-file-extension=wav],[data-file-extension=mp3]){--wb-file-icon-color:#9b79d3}
.wb .wb-file-row:is([data-file-extension=png],[data-file-extension=jpg],[data-file-extension=jpeg],[data-file-extension=webp],[data-file-extension=gif]){--wb-file-icon-color:#cf719c}
.wb .wb-file-row .wb-file-name{flex:1;min-width:0;line-height:28px}
.wb .wb-file-row .wb-file-readonly{color:var(--wb-faint);flex:none}
.wb-v2 .wb-canvas-editor .wb-nav-tabs{padding:6px;border:0;background:transparent;gap:4px}
.wb-v2 .wb-canvas-editor .wb-nav-tabs>.wb-button{flex:1;min-width:0;min-height:30px;font-size:11px}
.wb-resource-window{position:absolute;z-index:30;inset:78px 24px 190px;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--wb-divider);border-radius:var(--wb-radius-surface);background:var(--wb-panel);box-shadow:var(--wb-shadow-hover);overflow:hidden}
.wb-resource-window-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 8px;border-bottom:1px solid var(--wb-divider);background:var(--wb-panel)}
.wb-resource-window-head>.wb-tab-scroll{min-width:0}
.wb-resource-window-head>.wb-button{min-height:28px;padding:4px 7px;background:transparent}
.wb-resource-window .wb-tabpanel{display:flex;flex:1;min-height:0;min-width:0}
.wb-resource-window .wb-resource-bar{font-size:11px;gap:6px}
.wb-v2 .wb-resource-window .wb-content-tab{border:0;border-radius:var(--wb-radius-control);margin:2px;background:transparent}
.wb-v2 .wb-resource-window .wb-content-tab[aria-selected=true]{background:var(--wb-soft)}
.wb-canvas-editor .ec.ec-compact{--ec-brand:var(--wb-brand-ink)}
@media(max-width:680px){
 .wb-design-strip{padding-inline:6px}
 .wb-v2 .wb-design-tab{padding-inline:9px;max-width:190px}
 .wb-canvas-conversation[data-layout=dock]{bottom:10px}
 .wb-v2 .wb-canvas-editor .wb-navigation{left:10px;top:65px;bottom:185px;min-width:210px}
 .wb-resource-window{inset:65px 10px 185px}
}
@media(max-width:480px){.wb-design-strip{grid-template-columns:90px minmax(0,1fr) 90px}.wb-v2 .wb-design-tab{max-width:170px}.wb-design-tab>small{display:none}}
.wb-canvas-viewport:has(>.wb-canvas-tools)>.wb-canvas-surface{inset:48px 12px 12px}
.wb-preview-zoom{display:flex;align-items:center;gap:2px;border-inline:1px solid var(--wb-divider);padding:0 4px}
`;
