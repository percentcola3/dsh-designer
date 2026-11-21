export default `
.wb .wb-source-panel[data-provider=website]{display:flex;flex:1;min-width:0;min-height:0;gap:0;overflow:hidden}
.wb .wb-website-browser{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;background:var(--wb-panel)}
.wb .wb-website-address{position:relative;display:flex;align-items:center;flex:none;gap:7px;margin:0;padding:6px 10px;background:var(--wb-panel)}
.wb .wb-website-navigation{display:flex;align-items:center;flex:none;gap:2px}
.wb .wb-website-navigation>.wb-button{display:grid;place-items:center;flex:none;width:24px;height:24px;min-height:24px;padding:4px;border:0;background:transparent;color:var(--wb-muted)}
.wb .wb-website-navigation>.wb-button:not(:disabled):hover{background:var(--wb-hover);color:var(--wb-text)}
.wb .wb-website-address>input{flex:1;min-width:0;height:28px;margin:0;padding:4px 9px;border:0;background:var(--wb-bg);font-size:12px;box-shadow:none}
.wb .wb-website-address>.wb-button{flex:none;min-height:24px;height:24px;padding:2px 8px;border:0;font-size:12px}
.wb .wb-website-progress{position:absolute;inset:auto 0 0;height:2px;overflow:hidden;background:var(--wb-brand-soft);pointer-events:none}
.wb .wb-website-progress::after{content:"";display:block;width:36%;height:100%;border-radius:2px;background:var(--wb-brand-ink);animation:wb-website-progress 1.4s ease-in-out infinite}
@keyframes wb-website-progress{from{transform:translateX(-100%)}to{transform:translateX(280%)}}
@media(prefers-reduced-motion:reduce){.wb .wb-website-progress::after{animation:none;margin-inline:auto}}
.wb .wb-website-viewport{display:flex;flex:1;min-width:0;min-height:0;overflow:auto;background:var(--wb-bg)}
.wb .wb-website-size{flex:none}
.wb .wb-website-size>.wb-project-group-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.wb.wb-v2 .wb-website-size .wb-project-group-trigger{height:24px;min-height:24px;padding:2px 6px;gap:4px;border-radius:7px;background:var(--wb-panel);font-size:12px}
.wb .wb-viewport-option{display:flex;align-items:center;gap:8px;white-space:nowrap}
.wb .wb-website-size .wb-project-group-trigger .wb-viewport-option{gap:5px}
.wb .wb-website-size .wb-project-group-trigger small,.wb .wb-website-size .wb-project-group-trigger [data-size=custom]>span{display:none}
.wb .wb-website-size .wb-project-group-trigger [data-size=custom]>small{display:inline;color:inherit}
.wb .wb-viewport-option small{color:var(--wb-muted);font-size:11px;font-variant-numeric:tabular-nums}
.wb.wb-v2 .wb-website-size .wb-project-group-list{right:0;left:auto;display:grid;gap:4px;width:184px;padding:5px;border-radius:10px;box-shadow:var(--wb-shadow-hover);z-index:15}
.wb.wb-v2 .wb-website-size [role=option]{height:27px;min-height:27px;padding:3px 7px;border-radius:6px}
.wb .wb-website-size [role=option]>span{flex:1}
.wb .wb-website-size [role=option][aria-selected=false]::after{content:"";flex:0 0 14px}
.wb .wb-website-size [role=option] small{margin-left:auto}
.wb .wb-website-size [role=option][aria-selected=true] small{color:inherit}
.wb.wb-v2 .wb-viewport-dialog{width:276px;max-width:100%;border-radius:14px}
.wb .wb-viewport-dialog>header{padding:9px 12px 5px;font-size:13px}
.wb.wb-v2 .wb-viewport-dialog>header .wb-icon-button{display:grid;place-items:center;flex:none;width:24px;height:24px;min-height:24px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--wb-muted)}
.wb.wb-v2 .wb-viewport-dialog>header .wb-icon-button:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb .wb-viewport-dialog .wb-modal-body{padding:4px 12px 12px}
.wb .wb-viewport-dialog .wb-form{display:grid;gap:11px}
.wb .wb-viewport-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.wb .wb-viewport-fields label{display:grid;gap:4px;min-width:0;font-size:11px;color:var(--wb-muted)}
.wb .wb-viewport-number{display:flex;align-items:center;gap:4px;padding:0 10px;background:var(--wb-soft);border:1px solid var(--wb-divider);border-radius:8px}
.wb .wb-viewport-number:focus-within{border-color:var(--wb-focus);box-shadow:var(--wb-ring)}
.wb.wb-v2 .wb-viewport-number input{flex:1;width:0;min-width:0;min-height:0;height:28px;margin:0;padding:0;background:transparent;border:0;box-shadow:none;outline:none;color:var(--wb-text);font-size:13px;font-variant-numeric:tabular-nums}
.wb .wb-viewport-dialog .wb-form>footer{display:flex;justify-content:flex-end;gap:8px;margin:0;padding:0}
.wb .wb-viewport-dialog footer .wb-button{width:auto;min-height:24px;height:24px;padding:2px 9px;font-size:12px}
.wb .wb-session-stage{display:grid;place-items:center;flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--wb-bg)}
.wb .wb-session-stage>img{display:block;width:auto;height:auto;max-width:100%;max-height:100%;min-height:0;min-width:0;cursor:pointer}
.wb .wb-session-stage>img:focus-visible{outline:2px solid var(--wb-focus);outline-offset:-2px}
.wb .wb-website-stage{display:flex;flex:1;min-width:0;min-height:0;align-items:center;justify-content:center;overflow:hidden}
.wb .wb-website-sheet{transform-origin:top left;background:white;overflow:hidden}
.wb .wb-website-sheet>iframe,.wb .wb-website-sheet>img{display:block;width:100%;height:100%;border:0;object-fit:contain}
.wb .wb-website-empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:10px;min-width:0;padding:24px;color:var(--wb-muted);text-align:center}
.wb .wb-website-empty-art{display:block;flex:none;width:220px;max-width:100%;height:auto;margin-bottom:8px;overflow:visible}
.wb .wb-website-empty-window{filter:drop-shadow(0 6px 12px color-mix(in srgb,var(--wb-text) 7%,transparent))}
.wb .wb-website-empty h2{margin:0;color:var(--wb-text);font-size:18px;font-weight:550;letter-spacing:-.02em}
.wb .wb-website-empty p{margin:0;font-size:12px;line-height:1.7}
.wb .wb-website-empty kbd{padding:2px 5px;border:0;border-radius:4px;background:var(--wb-panel);color:var(--wb-text);font:inherit;font-size:11px}
@media(max-height:480px){.wb .wb-website-empty-art{width:130px;margin:0}.wb .wb-website-empty{gap:6px;padding:12px}}
@media(max-width:520px){.wb .wb-website-address{gap:4px;padding:8px}.wb .wb-website-address>.wb-button{padding-inline:6px}}
`;
