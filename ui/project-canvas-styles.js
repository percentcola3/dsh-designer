export default `
.wb-canvas-editor{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.wb-design-strip{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);align-items:center;gap:12px;flex-shrink:0;min-width:0;height:52px;padding:0 16px;background:var(--wb-soft);border-bottom:1px solid var(--wb-divider)}
.wb-design-strip-left{display:flex;align-items:center;min-width:0}
.wb-design-center{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;height:100%;overflow:hidden}
.wb-design-tabs{display:flex;align-items:center;gap:4px;min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:none}
.wb-design-tabs::-webkit-scrollbar{display:none}
.wb-v2 .wb-design-tab{display:flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0;max-width:240px;height:34px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb-design-tab>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-design-tab>small{color:var(--wb-faint);font-size:9px}
.wb-design-workflow-tab{display:flex;align-items:center;flex:none;border:1px solid transparent;border-radius:8px;overflow:hidden}
.wb-design-workflow-tab[data-selected=true]{border-color:var(--wb-divider);background:var(--wb-panel)}
.wb-v2 .wb-design-workflow-tab>.wb-design-tab{border:0;background:transparent;box-shadow:none;padding-right:4px}
.wb-design-workflow-close{display:grid;place-items:center;flex:none;width:24px;height:28px;margin-right:3px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--wb-muted)}
.wb-design-workflow-close:hover{background:var(--wb-hover)}
.wb-canvas-workflow{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--wb-bg)}
.wb-canvas-loading-conversation{display:flex;flex:1;flex-direction:column;gap:16px;min-height:180px;padding:18px;background:var(--wb-panel);border:1px solid var(--wb-divider);border-radius:12px;font-size:12px;color:var(--wb-muted)}
.wb-canvas-loading-conversation>strong{color:var(--wb-text)}
.wb-v2 .wb-design-tab:not([aria-selected=true]):hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-v2 .wb-design-tab[aria-selected=true]{border-color:var(--wb-divider);color:var(--wb-brand-ink);background:var(--wb-panel);font-weight:600;box-shadow:0 1px 3px #00000008}
.wb-design-imports{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}
.wb-v2 .wb-design-strip .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;min-height:32px;height:32px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb-v2 .wb-design-strip .wb-button:not(:disabled):hover{background:var(--wb-panel);color:var(--wb-brand-ink)}
.wb-v2 .wb-design-strip .wb-design-files[aria-pressed=true]{background:var(--wb-panel);color:var(--wb-brand-ink)}
.wb-v2 .wb-design-center>.wb-design-add{display:grid;place-items:center;flex:none;width:32px;min-width:32px;padding:0}
@media(max-width:900px){.wb-design-strip{grid-template-columns:minmax(0,1fr) minmax(0,3fr) minmax(0,1fr);gap:8px}.wb-design-imports .wb-button>span,.wb-design-files>span{display:none}.wb-v2 .wb-design-strip .wb-button{width:32px;padding:0}}

.wb-canvas-board{position:relative;display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;background-color:var(--wb-canvas);background-image:linear-gradient(var(--wb-divider) 1px,transparent 1px),linear-gradient(90deg,var(--wb-divider) 1px,transparent 1px);background-size:24px 24px}
.wb-canvas-viewport{position:relative;display:flex;flex:1;min-width:0;min-height:0;overflow:hidden}
.wb-canvas-surface{position:absolute;inset:0;display:flex;min-width:0;min-height:0}
.wb-canvas-surface>.wb-resource{flex:1;min-width:0;min-height:0;background:transparent}
.wb-empty-stage{display:flex;flex:1;min-width:0;min-height:0;outline:none;overflow:hidden;touch-action:none;overscroll-behavior:contain;background-color:var(--wb-canvas);background-image:linear-gradient(var(--wb-divider) 1px,transparent 1px),linear-gradient(90deg,var(--wb-divider) 1px,transparent 1px)}
.wb-canvas-empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding-bottom:130px;color:var(--wb-faint);pointer-events:none;user-select:none}
.wb-canvas-empty>.wb-button{pointer-events:auto}
.wb-canvas-hand{cursor:grab}.wb-canvas-panning{cursor:grabbing;user-select:none}
.wb-v2 .wb-canvas-empty>.wb-button{background:var(--wb-panel);color:var(--wb-brand-ink);box-shadow:var(--wb-shadow-soft)}
.wb-canvas-tools{position:absolute;z-index:45;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:3px;max-width:calc(100% - 24px);padding:6px;border:1px solid var(--wb-divider);border-radius:14px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover)}
.wb-v2 .wb-canvas-tools>.wb-button{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:33px;height:33px;min-height:33px;padding:6px;background:transparent;border-radius:8px;color:var(--wb-muted)}
.wb-v2 .wb-canvas-tools>.wb-button[aria-pressed=true]{color:var(--wb-brand-ink);background:var(--wb-brand-soft)}
.wb-v2 .wb-canvas-tools>.wb-canvas-save{width:auto;padding-inline:12px;color:var(--wb-text)}
.wb-canvas-tools>i{display:block;width:1px;height:18px;margin:0 3px;background:var(--wb-divider);flex-shrink:0}
.wb-v2 .wb-canvas-zoom{border:0;background:transparent;padding:5px;font-size:10px;font-variant-numeric:tabular-nums;color:var(--wb-muted);min-width:36px;text-align:center;border-radius:6px;cursor:pointer}
.wb-canvas-gesture-hint{position:absolute;z-index:5;left:16px;bottom:14px;max-width:calc(100% - 32px);font-size:10px;color:var(--wb-faint);pointer-events:none;user-select:none}
@media(max-width:1100px){.wb-canvas-gesture-hint{display:none}}
.wb-canvas-more{position:relative;flex-shrink:0}
.wb-canvas-more>summary{display:grid;place-items:center;width:33px;height:33px;cursor:pointer;border-radius:8px;list-style:none;color:var(--wb-muted)}
.wb-canvas-more>summary::-webkit-details-marker{display:none}
.wb-canvas-more>summary:hover{background:var(--wb-hover)}
.wb-canvas-more-menu{position:absolute;right:0;top:42px;display:flex;flex-direction:column;gap:3px;width:180px;max-height:min(440px,60vh);overflow:auto;padding:7px;border:1px solid var(--wb-divider);border-radius:12px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover)}
.wb-v2 .wb-canvas-more-menu>.wb-button{justify-content:flex-start;text-align:left;min-height:33px;background:transparent;font-size:12px}
.wb-canvas-conversation{position:absolute;z-index:40;display:flex;min-width:0;min-height:0;left:50%;bottom:18px;transform:translateX(-50%);width:var(--wb-conversation-width,760px);max-width:calc(100% - 20px);max-height:calc(100% - 92px);pointer-events:none}
.wb-canvas-conversation>*{pointer-events:auto}
.wb-canvas-conversation[data-layout=sidebar]{position:relative;align-self:stretch;flex:0 0 var(--wb-conversation-width,400px);left:auto;bottom:auto;transform:none;width:var(--wb-conversation-width,400px);max-height:none;margin:12px}
.wb-conversation-resizer{position:absolute;z-index:12;top:12px;bottom:12px;width:12px;cursor:col-resize;touch-action:none;outline:none;user-select:none}
.wb-conversation-resizer[data-resize-edge=left]{left:-6px}
.wb-conversation-resizer[data-resize-edge=right]{right:-6px}
.wb-conversation-resizer::after{content:'';position:absolute;top:50%;left:4px;transform:translateY(-50%);width:3px;height:38px;border-radius:3px;background:var(--wb-faint);opacity:.35;transition:opacity .15s,background .15s}
.wb-conversation-resizer:hover::after,.wb-conversation-resizer:focus-visible::after,.wb-conversation-resizing .wb-conversation-resizer::after{opacity:1;background:var(--wb-brand-ink)}
.wb-conversation-resizer:focus-visible{outline:2px solid var(--wb-brand-ink);outline-offset:1px;border-radius:6px}
.wb-conversation-resize-shield{position:fixed;inset:0;z-index:95;cursor:col-resize;touch-action:none;user-select:none}
.wb-conversation-resizing{cursor:col-resize;user-select:none}
@media(max-width:860px){.wb-canvas-conversation[data-layout=sidebar]{z-index:60;position:absolute;inset:10px 10px 10px auto;flex:none;margin:0;max-width:calc(100% - 20px)}}
.wb-v2 .wb-canvas-editor .wb-navigation{position:absolute;z-index:35;left:16px;top:78px;bottom:190px;max-height:650px;max-width:calc(100% - 32px);min-width:220px;margin:0;border:1px solid var(--wb-divider);border-radius:14px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover);overflow:visible}
.wb-canvas-editor .wb-nav-body{flex:1;min-height:0;overflow:auto}
.wb-floating-nav-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-bottom:1px solid var(--wb-divider);font-size:12px}
.wb-floating-nav-head>.wb-button{padding:3px 6px;min-height:26px;background:transparent}
.wb-v2 .wb-canvas-editor .wb-nav-tabs{padding:6px;border:0;background:transparent;gap:4px}
.wb-v2 .wb-canvas-editor .wb-nav-tabs>.wb-button{flex:1;min-width:0;min-height:30px;font-size:11px}
.wb-resource-window{position:absolute;z-index:30;inset:78px 24px 190px;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--wb-divider);border-radius:14px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover);overflow:hidden}
.wb-resource-window-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 8px;border-bottom:1px solid var(--wb-divider);background:var(--wb-panel)}
.wb-resource-window-head>.wb-tab-scroll{min-width:0}
.wb-resource-window-head>.wb-button{min-height:28px;padding:4px 7px;background:transparent}
.wb-resource-window .wb-tabpanel{display:flex;flex:1;min-height:0;min-width:0}
.wb-resource-window .wb-resource-bar{font-size:11px;gap:6px}
.wb-v2 .wb-resource-window .wb-content-tab{border:0;border-radius:8px;margin:2px;background:transparent}
.wb-v2 .wb-resource-window .wb-content-tab[aria-selected=true]{background:var(--wb-soft)}
.wb-canvas-editor .ec.ec-compact{--ec-brand:var(--wb-brand-ink)}
@media(max-width:680px){
 .wb-design-strip{padding-inline:6px}
 .wb-v2 .wb-design-tab{padding-inline:9px;max-width:190px}
 .wb-canvas-tools{top:10px;gap:1px;padding:4px}
 .wb-v2 .wb-canvas-tools>.wb-button{width:30px;height:32px;padding:5px}
 .wb-v2 .wb-canvas-tools>.wb-canvas-save{width:auto;padding-inline:7px;font-size:11px}
 .wb-canvas-tools>i{margin-inline:1px}
 .wb-canvas-more>summary{width:30px}
 .wb-canvas-conversation[data-layout=dock]{bottom:10px}
 .wb-v2 .wb-canvas-editor .wb-navigation{left:10px;top:65px;bottom:185px;min-width:210px}
 .wb-resource-window{inset:65px 10px 185px}
}
@media(max-width:480px){.wb-design-strip{grid-template-columns:70px minmax(0,1fr) 70px;gap:6px}.wb-v2 .wb-design-tab{max-width:170px}.wb-design-tab>small{display:none}}
@media(max-width:400px){.wb-canvas-zoom{display:none}.wb-canvas-tools>i{display:none}}
`;
