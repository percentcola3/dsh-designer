const designerComposerStyles = `
.wb-designer-compose{box-sizing:border-box;color:var(--wb-text,#222);font-family:inherit;font-size:13px}
.wb-designer-compose *, .wb-designer-compose *::before,.wb-designer-compose *::after{box-sizing:border-box}
.wb-designer-compose.wb-designer-compose-frame{position:relative;min-width:0;width:100%;margin:0;border:0;border-radius:var(--wb-radius-composer,var(--wb-radius,12px));background:var(--wb-field,#f1f1f4);overflow:visible;box-shadow:none;outline:0}
.wb-designer-compose.wb-designer-compose-frame:focus-within{border:0;box-shadow:none}
.wb-designer-compose.wb-designer-compose-frame:has(.wb-designer-compose-input:focus-visible){outline:0;background:color-mix(in srgb,var(--wb-brand-blue,#1744F4) 3%,var(--wb-field,#f1f1f4))}
.wb-designer-compose textarea.wb-designer-compose-input{display:block;width:100%;min-width:0;min-height:140px;max-height:320px;margin:0;padding:17px 18px 13px;border:0;outline:0;border-radius:inherit;background:transparent!important;box-shadow:none!important;color:var(--wb-text,#222);font:inherit;font-size:14px;line-height:1.65;resize:none!important;overflow-y:auto;scrollbar-width:thin}
.wb-designer-compose[data-variant="canvas"] textarea.wb-designer-compose-input{min-height:64px;max-height:180px;padding:12px 14px 10px;font-size:13px}
.wb-designer-compose textarea.wb-designer-compose-input::placeholder{color:var(--wb-muted,#888)}
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
.wb-designer-compose .wb-designer-compose-plus{width:24px;padding:0}.wb-designer-compose-system-label{overflow:hidden;text-overflow:ellipsis;max-width:95px}
.wb-designer-compose .wb-designer-compose-send{display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:var(--wb-radius-sm,8px);color:var(--wb-on-brand,#fff);background:var(--wb-brand-action,#1744F4)}
.wb-designer-compose .wb-designer-compose-send:hover:not(:disabled){background:var(--wb-brand-action-hover,#2803B1)}
.wb-designer-compose .wb-designer-compose-send:disabled{background:var(--wb-hover,#eee);color:var(--wb-muted,#999);opacity:1}
.wb-designer-compose-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;min-width:0;max-height:132px;overflow-y:auto}
.wb-designer-compose-chip{display:inline-flex;align-items:center;gap:5px;min-width:0;max-width:100%;padding:4px 5px 4px 7px;border:0;border-radius:var(--wb-radius-sm,8px);background:var(--wb-panel,#fff);font-size:12px;color:var(--wb-muted,#666)}
.wb-designer-compose-chip-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:220px}.wb-designer-compose-chip img{width:26px;height:26px;object-fit:cover;border-radius:var(--wb-radius-sm,8px)}
.wb-designer-compose-chip button{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-muted,#888)}
.wb-designer-compose-chip button:hover:not(:disabled){background:var(--wb-hover,#eaeaf0);color:var(--wb-text,#222)}
.wb-designer-compose-error{margin:0 14px 10px;font-size:12px;color:var(--wb-text,#222);overflow-wrap:anywhere}
.wb-designer-compose-popup{position:fixed;z-index:180;display:flex;flex-direction:column;overflow:hidden;margin:0;padding:6px;border:0;border-radius:var(--wb-radius-sm,8px);background:var(--wb-elevated,var(--wb-panel,#fff));color:var(--wb-text,#222);box-shadow:var(--wb-shadow-hover,0 4px 16px #18181b0f);isolation:isolate}
.wb-designer-compose-popup-heading{display:flex;align-items:center;justify-content:space-between;padding:5px 7px 8px;font-size:12px;color:var(--wb-muted,#666)}
.wb-designer-compose .wb-designer-compose-search{flex:none;width:100%;height:33px;margin-bottom:5px;padding:6px 9px;border:0;border-radius:var(--wb-radius-input,var(--wb-radius,12px));background:var(--wb-field,#f1f1f4);color:var(--wb-text,#222);font:inherit;outline:0;box-shadow:none}
.wb-designer-compose .wb-designer-compose-search:focus-visible{outline:2px solid var(--wb-focus,#1744F4);outline-offset:-2px}
.wb-designer-compose-options{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.wb-designer-compose-group{padding:9px 8px 4px;font-size:11px;color:var(--wb-muted,#888)}
.wb-designer-compose .wb-designer-compose-option{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:7px 8px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-text,#222);text-align:left}
.wb-designer-compose-option:hover:not(:disabled),.wb-designer-compose-option[data-active="true"]{background:var(--wb-hover,#f4f4f4)}
.wb-designer-compose-option-copy{flex:1;min-width:0}.wb-designer-compose-option-title,.wb-designer-compose-option-detail{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.wb-designer-compose-option-detail{margin-top:2px;font-size:11px;color:var(--wb-muted,#888)}
.wb-designer-compose .wb-designer-compose-version{padding-left:32px}.wb-designer-compose-empty{padding:15px 9px;color:var(--wb-muted,#888);font-size:12px}.wb-designer-compose-popup-error{padding:9px;font-size:12px;overflow-wrap:anywhere}.wb-designer-compose-popup-error button{display:block;margin-top:7px;border:0;border-radius:var(--wb-radius-sm,8px);padding:4px 8px;background:var(--wb-hover,#eee);color:var(--wb-text,#222)}
@media(max-width:480px){.wb-designer-compose-toolbar{gap:2px;margin:0 7px}.wb-designer-compose-left,.wb-designer-compose-right,.wb-designer-compose-native{gap:2px}.wb-designer-compose .wb-designer-compose-control{max-width:96px;padding:0 5px}.wb-designer-compose-system-label{max-width:58px}.wb-designer-compose-native{overflow:hidden}.wb-designer-compose-native button{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-designer-compose-right{gap:3px}.wb-designer-compose-chip-label{max-width:180px}}
`;
export default designerComposerStyles;
export {designerComposerStyles};
