const designerComposerStyles = `
.wb-designer-compose{box-sizing:border-box;color:var(--wb-text,#222);font-family:inherit;font-size:13px}
.wb-designer-compose *, .wb-designer-compose *::before,.wb-designer-compose *::after{box-sizing:border-box}
.wb-designer-compose.wb-designer-compose-frame{position:relative;min-width:0;width:100%;margin:0;border:0;border-radius:var(--wb-radius-composer,var(--wb-radius,12px));background:var(--wb-field,#fff);overflow:visible;box-shadow:none;outline:0}
.wb-designer-compose.wb-designer-compose-frame:focus-within{border:0;box-shadow:none}
.wb-designer-compose.wb-designer-compose-frame:has(.wb-designer-compose-input:focus-visible){outline:0;background:var(--wb-field,#fff)}
.wb-designer-compose .wb-designer-compose-input,.wb-designer-compose .wb-designer-compose-input:focus-visible{display:block;width:100%;min-width:0;min-height:140px;max-height:320px;margin:0;padding:17px 18px 13px;border:0;outline:0;border-radius:inherit;background:transparent!important;box-shadow:none!important;color:var(--wb-text,#222);font:inherit;font-size:14px;line-height:1.65;resize:none!important;overflow-y:auto;scrollbar-width:thin}
.wb-designer-compose[data-variant="canvas"] .wb-designer-compose-input{min-height:64px;max-height:180px;padding:12px 14px 10px;font-size:13px}
.wb-designer-compose textarea.wb-designer-compose-input::placeholder{color:var(--wb-muted,#888)}
.wb-designer-compose .wb-designer-compose-chips{padding:9px 12px 0;gap:6px;max-height:96px}
.wb-designer-compose .wb-designer-compose-chip{height:22px;min-height:22px;padding:1px 3px 1px 6px;border:0;border-radius:var(--wb-radius-sm,12px);background:var(--wb-soft)}
.wb-designer-compose .wb-designer-compose-chip[data-selection=true]{color:var(--wb-brand-ink);background:var(--wb-brand-soft);gap:3px;font-size:11px;font-weight:600}
.wb-designer-compose .wb-designer-compose-chip[data-selection=true] button{width:16px;height:16px;min-height:16px;padding:0;border-radius:50%}

.wb-designer-compose .wb-designer-compose-rich .cm-editor,.wb-designer-compose .wb-designer-compose-rich .cm-focused{background:transparent;color:inherit;outline:none;font:inherit;line-height:inherit}
.wb-designer-compose-rich .cm-scroller{font:inherit;line-height:inherit;overflow:visible}
.wb-designer-compose-rich .cm-content{padding:0;min-height:20px;caret-color:var(--wb-text)}
.wb-designer-compose-rich .cm-line{padding:0}
.wb-designer-compose-rich .cm-placeholder{color:var(--wb-muted);pointer-events:none}
.wb-designer-compose-rich .cm-cursor{border-left-color:var(--wb-text)}
.wb-designer-compose-rich .cm-selectionBackground{background:var(--wb-brand-soft)!important}
.wb-designer-inline-chip{display:inline-flex;align-items:center;vertical-align:baseline;height:18px;gap:2px;margin:0 2px;padding:0 3px 0 5px;border:0;border-radius:6px;background:color-mix(in srgb,var(--selection-color) 12%,transparent);color:var(--selection-color);font-size:11px;font-weight:600;line-height:18px;white-space:nowrap;user-select:none}
.wb .wb-designer-inline-chip button{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;min-height:14px;padding:0;border:0;border-radius:50%;background:transparent;box-shadow:none;color:inherit;font-size:13px;line-height:14px;cursor:pointer}
.wb .wb-designer-inline-chip button:hover{background:color-mix(in srgb,var(--selection-color) 15%,transparent)}
.wb-designer-compose-input:disabled{opacity:.6;cursor:default}
.wb-designer-compose-toolbar{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0;min-height:38px;margin:0 12px;padding:5px 0 8px;border:0}
.wb-designer-compose-left,.wb-designer-compose-right,.wb-designer-compose-native{display:flex;align-items:center;gap:3px;min-width:0}
.wb-designer-compose-left{flex:0 1 auto}.wb-designer-compose-right{flex:1 1 auto;justify-content:flex-end;gap:5px}.wb-designer-compose-native{flex:0 1 auto;max-width:100%;overflow:hidden}
.wb-designer-compose-native>*{min-width:0;max-width:100%;flex-shrink:1}
.wb-designer-compose-native button{min-width:0;max-width:100%}
.wb-designer-compose button{font:inherit;cursor:pointer}.wb-designer-compose button:disabled{cursor:default;opacity:.45}
.wb-designer-compose .wb-designer-compose-control{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:0 0 auto;height:24px;max-width:120px;padding:0 5px;font-size:11px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-muted,#666);white-space:nowrap}
.wb-designer-compose .wb-designer-compose-control:hover:not(:disabled),.wb-designer-compose .wb-designer-compose-control[aria-expanded="true"]{background:var(--wb-hover,#f4f4f4);color:var(--wb-text,#222)}
.wb-designer-compose .wb-designer-compose-control:focus-visible,.wb-designer-compose .wb-designer-compose-send:focus-visible,.wb-designer-compose-chip button:focus-visible,.wb-designer-compose-option:focus-visible{outline:2px solid var(--wb-focus,#1744F4);outline-offset:2px}
.wb-designer-compose .wb-designer-compose-plus{width:28px;height:28px;padding:0;background:var(--wb-soft,#f3f3f5)}.wb-designer-compose-system-label{overflow:hidden;text-overflow:ellipsis;max-width:95px}
.wb-designer-compose .wb-designer-compose-send{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;padding:0;border:0;border-radius:50%;corner-shape:round;color:var(--wb-on-brand,#fff);background:var(--wb-brand-action,#1744F4)}
.wb-designer-compose .wb-designer-compose-send:hover:not(:disabled){background:var(--wb-brand-action-hover,#2803B1)}
.wb-designer-compose .wb-designer-compose-send:disabled{background:var(--wb-hover,#eee);color:var(--wb-muted,#999);opacity:1}
.wb-designer-compose-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;min-width:0;max-height:132px;overflow-y:auto}
.wb-designer-compose-chip{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;padding:4px 5px 4px 7px;border:0;border-radius:var(--wb-radius-sm,8px);background:var(--wb-panel,#fff);font-size:12px;color:var(--wb-muted,#666)}
.wb-designer-compose-chip-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:220px}.wb-designer-compose-chip img{width:26px;height:26px;object-fit:cover;border-radius:var(--wb-radius-sm,8px)}
.wb-designer-compose-chip button{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-muted,#888)}
.wb-designer-compose-chip button.wb-attachment-preview-trigger{width:auto;max-width:100%;min-width:0;min-height:18px;height:18px;flex:0 1 auto;gap:5px;padding:0 2px;cursor:zoom-in}
.wb .wb-designer-compose .wb-designer-compose-chip[data-attachment=true]{height:24px;padding:2px 3px;gap:2px;border-radius:8px;align-items:center;overflow:hidden}
.wb .wb-designer-compose-chip[data-attachment=true] button{min-height:0;height:20px;margin:0;border:0;box-shadow:none}
.wb .wb-designer-compose-chip button.wb-attachment-preview-trigger{padding:0 3px;gap:5px;border-radius:5px}
.wb .wb-designer-compose-chip .wb-attachment-preview-trigger img{display:block;width:16px;height:16px;flex:none;object-fit:cover;border-radius:3px}
.wb .wb-designer-compose-chip[data-attachment=true] button:focus-visible{outline:2px solid var(--wb-focus,#1744f4);outline-offset:-2px}
.wb .wb-attachment-preview .wb-modal-body{display:grid;place-items:center;min-height:70px}
.wb .wb-attachment-preview .wb-modal-body>img{display:block;max-width:100%;max-height:70vh;object-fit:contain}
.wb-designer-compose-chip button:hover:not(:disabled){background:var(--wb-hover,#eaeaf0);color:var(--wb-text,#222)}
.wb-designer-compose-error{margin:0 14px 10px;font-size:12px;color:var(--wb-text,#222);overflow-wrap:anywhere}
.wb-designer-compose-popup{position:fixed;z-index:180;display:flex;flex-direction:column;overflow:hidden;margin:0;padding:6px;border:0;border-radius:var(--wb-radius-menu,18px);background:var(--wb-elevated,var(--wb-panel,#fff));color:var(--wb-text,#222);box-shadow:var(--wb-shadow-hover,0 4px 16px #18181b0f);isolation:isolate}
.wb-designer-compose-popup-heading{display:flex;align-items:center;justify-content:space-between;padding:5px 7px 8px;font-size:12px;color:var(--wb-muted,#666)}
.wb-designer-compose .wb-designer-compose-search{flex:none;width:100%;height:33px;margin-bottom:5px;padding:6px 9px;border:0;border-radius:var(--wb-radius-input,var(--wb-radius,12px));background:var(--wb-field,#fff);color:var(--wb-text,#222);font:inherit;outline:0;box-shadow:none}
.wb-designer-compose .wb-designer-compose-search:focus-visible{outline:2px solid var(--wb-focus,#1744F4);outline-offset:-2px}
.wb-designer-compose-options{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.wb-designer-compose-group{padding:9px 8px 4px;font-size:11px;color:var(--wb-muted,#888)}
.wb-designer-compose .wb-designer-compose-option{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:7px 8px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-text,#222);text-align:left}
.wb-designer-compose-option:hover:not(:disabled),.wb-designer-compose-option[data-active="true"]{background:var(--wb-hover,#f4f4f4)}
.wb-designer-compose-option-copy{flex:1;min-width:0}.wb-designer-compose-option-title,.wb-designer-compose-option-detail{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.wb-designer-compose-option-detail{margin-top:2px;font-size:11px;color:var(--wb-muted,#888)}
.wb-designer-compose .wb-designer-compose-version{padding-left:32px}.wb-designer-compose-empty{padding:15px 9px;color:var(--wb-muted,#888);font-size:12px}.wb-designer-compose-popup-error{padding:9px;font-size:12px;overflow-wrap:anywhere}.wb-designer-compose-popup-error button{display:block;margin-top:7px;border:0;border-radius:var(--wb-radius-sm,8px);padding:4px 8px;background:var(--wb-hover,#eee);color:var(--wb-text,#222)}

/* Keep the chooser visually separate from its owning conversation. */
.wb.wb-v2 .wb-designer-compose-popup{padding:0;border:1px solid var(--wb-divider);border-radius:var(--wb-radius-menu,18px);background:var(--wb-elevated);box-shadow:0 16px 48px color-mix(in srgb,var(--wb-text) 18%,transparent),0 3px 12px color-mix(in srgb,var(--wb-text) 8%,transparent)}
.wb .wb-designer-compose-popup-heading{flex:none;gap:8px;padding:12px 14px;color:var(--wb-text)}
.wb .wb-designer-compose-popup-heading>strong{flex:1;font-size:13px;font-weight:600}
.wb .wb-designer-compose-popup-heading>span{font-size:11px;color:var(--wb-muted)}
.wb .wb-designer-compose-popup-heading>button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:var(--wb-radius-control,12px);background:transparent;color:var(--wb-muted)}
.wb .wb-designer-compose-popup-heading>button:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb .wb-designer-compose-tabs{display:flex;flex:none;gap:3px;margin:0 10px 10px;padding:3px;border-radius:var(--wb-radius-input,14px);background:var(--wb-soft)}
.wb .wb-designer-compose-tabs>button{display:flex;align-items:center;justify-content:center;flex:1;gap:4px;min-width:0;height:30px;padding:0 6px;border:0;border-radius:var(--wb-radius-control,12px);background:transparent;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb.wb-v2 .wb-designer-compose-tabs>button[aria-selected=true]{background:var(--wb-elevated);color:var(--wb-brand-ink);box-shadow:0 1px 3px #0000000a;text-shadow:none}
.wb .wb-designer-compose-tabs small{font-size:10px;opacity:.7}
.wb.wb-v2 .wb-designer-compose-popup>input.wb-designer-compose-search{box-sizing:border-box;flex:none;align-self:center;width:calc(100% - 20px);min-width:0;max-width:calc(100% - 20px);height:32px;margin:0 10px 8px;padding:6px 9px;border-radius:8px;background:var(--wb-bg)}
.wb.wb-v2 .wb-designer-compose-popup>input.wb-designer-compose-search:focus-visible{outline:2px solid var(--wb-focus);outline-offset:-2px}
.wb .wb-designer-compose-tab-panel{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden;padding:0 8px 8px}
.wb .wb-designer-compose-popup .wb-designer-compose-options{display:flex;flex-direction:column;gap:0;min-height:0;padding:1px 2px}
.wb .wb-designer-compose-popup .wb-designer-compose-option{flex:none;gap:6px;min-height:28px;padding:3px 6px;border:0;border-radius:4px;background:transparent}
.wb.wb-v2 .wb-designer-compose-popup .wb-designer-compose-option:is(:hover,[data-active=true],[aria-selected=true]){border-color:color-mix(in srgb,var(--wb-brand-ink) 30%,var(--wb-divider));background:var(--wb-brand-soft);color:var(--wb-text);box-shadow:none;text-shadow:none}
.wb .wb-mention-tree-line{display:flex;align-items:center;flex:none;min-width:0;border-radius:4px}
.wb .wb-mention-tree-line:has([data-active=true]),.wb .wb-mention-tree-line:hover{background:var(--wb-brand-soft)}
.wb .wb-mention-tree-line .wb-designer-compose-option{flex:1;min-width:0;width:auto;padding-inline:2px 6px}
.wb .wb-mention-disclosure{display:grid;place-items:center;flex:0 0 20px;width:20px;height:28px;min-height:0;padding:0;border:0;background:transparent;color:var(--wb-muted)}
.wb .wb-designer-compose-option[data-reference-kind=folder]>svg{color:var(--wb-muted)}
.wb .wb-designer-compose-option>svg{flex:none;color:var(--wb-brand-ink)}
.wb .wb-designer-compose-option[data-reference-kind=knowledge]>svg{color:#9975c9}
.wb .wb-designer-compose-option[data-reference-kind=directory]>svg{color:#c59436}
.wb .wb-designer-compose-popup .wb-designer-compose-option-title{font-size:12px;font-weight:500;line-height:1.5}
.wb .wb-designer-compose-popup .wb-designer-compose-option-detail{font-size:10px;line-height:1.5}
.wb .wb-designer-compose-popup[data-picker=mentions] .wb-designer-compose-tabs{align-self:flex-start;max-width:calc(100% - 20px);padding:2px;gap:2px;border-radius:8px}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=mentions] .wb-designer-compose-tabs>button{flex:0 1 auto;height:24px;min-height:24px;padding:0 7px;gap:3px;border-radius:6px;line-height:16px}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=mentions] .wb-designer-compose-popup-heading>button{width:20px;height:20px;min-width:20px;min-height:20px;border-radius:6px}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=mentions] .wb-designer-compose-option{min-height:24px;padding-block:2px;gap:5px}
.wb .wb-designer-compose-popup[data-picker=mentions] .wb-mention-disclosure{flex-basis:18px;width:18px;height:24px}
.wb .wb-designer-compose-popup[data-picker=mentions] .wb-designer-compose-option>svg{width:13px;height:13px}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=systems]{border:0;box-shadow:var(--wb-shadow-hover)}
.wb .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-popup-heading{padding:9px 10px 7px}
.wb .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-popup-heading>strong{font-size:12px}
.wb .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-options{gap:2px;min-height:0;padding:0}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-option{gap:8px;min-height:32px;padding:6px 8px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;font-size:12px;line-height:1.5}
.wb.wb-v2 .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-option:is(:hover,[data-active=true],[aria-selected=true]){background:var(--wb-hover);color:var(--wb-text);box-shadow:none}
.wb .wb-designer-compose-popup[data-picker=systems] .wb-designer-compose-version{padding-left:30px}
.wb .wb-designer-compose-directory{display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto}
.wb .wb-designer-compose-directory-current{display:flex;align-items:center;gap:8px;padding:8px 10px;color:var(--wb-muted);font-size:11px}
.wb .wb-designer-compose-directory-current>span{display:flex;flex:1;flex-direction:column;min-width:0}
.wb .wb-designer-compose-directory-current small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
@media(max-width:480px){.wb-designer-compose-toolbar{gap:2px;margin:0 7px}.wb-designer-compose-left,.wb-designer-compose-right,.wb-designer-compose-native{gap:2px}.wb-designer-compose .wb-designer-compose-control{max-width:96px;padding:0 5px}.wb-designer-compose-system-label{max-width:58px}.wb-designer-compose-native{overflow:hidden}.wb-designer-compose-native button{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-designer-compose-right{gap:3px}.wb-designer-compose-chip-label{max-width:180px}}
`;
export default designerComposerStyles;
export {designerComposerStyles};
