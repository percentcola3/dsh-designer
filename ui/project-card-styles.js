export default `
.wb-project-card{display:flex;flex-direction:column;align-self:start;min-width:0;padding:6px;border:0;border-radius:var(--wb-radius,12px);background:transparent;color:var(--wb-text);box-shadow:none;transform:none;transition:background-color .14s}
.wb-project-card:hover,.wb-project-card:has(:focus-visible){background:var(--wb-hover);box-shadow:none;transform:none}
.wb .wb-project-card-preview{position:relative;display:block;flex:none;isolation:isolate;width:100%;aspect-ratio:16/9;min-height:0;margin:0;padding:0;overflow:hidden;border:0;border-radius:var(--wb-radius-sm,8px);background:var(--wb-soft);color:var(--wb-muted);box-shadow:none;text-align:left;transform:none;transition:none}
.wb .wb-project-card-preview:disabled{opacity:1}
.wb-project-card-preview-fill{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}
.wb-project-card-preview-fill>*{position:absolute;inset:0;width:100%;height:100%}
.wb-project-card .wb-project-card-actions{display:flex;align-items:center;gap:8px;min-width:0;min-height:46px;padding:8px 10px}
.wb .wb-project-card-name{flex:1;min-width:0;max-width:100%;margin:0;padding:3px 0;border:0;background:transparent;color:var(--wb-text);text-align:left;font:inherit;font-size:12px;font-weight:550;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb .wb-project-card-name:not(:disabled):hover{color:var(--wb-brand-ink)}
.wb-project-card-tools{display:flex;align-items:center;gap:2px;flex:none}
.wb .wb-project-card-tool{display:grid;place-items:center;flex:none;width:28px;height:28px;margin:0;padding:6px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-muted);transition:background-color .14s,color .14s}
.wb .wb-project-card-tool:not(:disabled):hover,.wb .wb-project-card-tool[aria-expanded=true]{background:var(--wb-panel);color:var(--wb-brand-ink)}
.wb .wb-project-card-tool:disabled,.wb .wb-project-card-name:disabled{opacity:.5;cursor:default}
.wb-project-card-feedback{min-height:0;padding:0 10px;color:var(--wb-success);font-size:11px;line-height:1.5}
.wb-project-card-feedback:empty{display:none}
.wb-project-card>.wb-error{margin:0 8px 8px;font-size:11px;overflow-wrap:anywhere}
.wb-project-cover{--cover-a:color-mix(in srgb,#9ccbf5 65%,var(--wb-panel));--cover-b:color-mix(in srgb,#b9a3ee 60%,var(--wb-panel));--cover-c:color-mix(in srgb,#f4c5b3 65%,var(--wb-panel));position:absolute;inset:0;display:block;overflow:hidden;background:radial-gradient(ellipse at 8% 12%,var(--cover-a),transparent 68%),radial-gradient(ellipse at 98% 24%,var(--cover-b),transparent 66%),radial-gradient(ellipse at 52% 110%,var(--cover-c),transparent 72%),var(--wb-panel);isolation:isolate}
.wb-project-cover[data-tone="1"]{--cover-a:color-mix(in srgb,#b7a1ed 65%,var(--wb-panel));--cover-b:color-mix(in srgb,#efb9cf 65%,var(--wb-panel));--cover-c:color-mix(in srgb,#a5d7e9 65%,var(--wb-panel))}
.wb-project-cover[data-tone="2"]{--cover-a:color-mix(in srgb,#9ed7c3 65%,var(--wb-panel));--cover-b:color-mix(in srgb,#a9c7f1 65%,var(--wb-panel));--cover-c:color-mix(in srgb,#f1cd9d 65%,var(--wb-panel))}
.wb-project-card-menu{position:fixed;z-index:130;display:flex;flex-direction:column;gap:3px;max-height:calc(100dvh - 16px);overflow:auto;box-sizing:border-box;padding:6px;border:0;border-radius:var(--wb-radius-menu,18px);background:var(--wb-elevated);color:var(--wb-text);box-shadow:var(--wb-shadow-hover);font-size:12px}
.wb .wb-project-card-menu>button{display:flex;align-items:center;gap:8px;flex:none;width:100%;min-height:36px;padding:8px 10px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-text);text-align:left;font:inherit}
.wb .wb-project-card-menu>button:not(:disabled):hover,.wb .wb-project-card-menu>button:focus-visible{background:var(--wb-hover)}
.wb .wb-project-card-menu>button.wb-project-card-danger{color:var(--wb-danger)}
.wb-project-card-dialog-host{position:fixed;inset:0;z-index:140}
.wb-project-card-dialog-host>.wb-modal-wrap{position:absolute;inset:0}
.wb-project-card-dialog{width:420px}
.wb-project-card-form{display:flex;flex-direction:column;gap:18px}
.wb-project-card-form label{gap:9px}
.wb .wb-project-card-form input,.wb .wb-project-card-form select{width:100%;min-height:40px;padding:10px 12px}
.wb-project-card-form>footer{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.wb-project-card-delete-copy{overflow-wrap:anywhere;color:var(--wb-muted);font-size:13px;line-height:1.8}
.wb-v2 .wb-project-card-dialog .wb-button.wb-project-card-delete:not(:disabled){background:var(--wb-danger);color:var(--wb-panel)}
.wb-v2 .wb-project-card-dialog .wb-button.wb-project-card-delete:not(:disabled):hover{background:var(--wb-danger);filter:brightness(.94)}
@media(prefers-reduced-motion:reduce){.wb .wb-project-card,.wb .wb-project-card-preview,.wb .wb-project-card-tool{transition:none}}
`;
