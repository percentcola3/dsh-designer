export default `
.wb-toast-layer{position:fixed;z-index:1800;inset:calc(var(--dsh-frame-top-clearance,0px) + 64px) 18px auto auto;width:min(420px,calc(100vw - 36px));max-height:calc(100dvh - var(--dsh-frame-top-clearance,0px) - 88px);overflow:auto;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.wb .wb-toast{display:flex;align-items:flex-start;gap:10px;width:100%;padding:14px;border:1px solid var(--wb-divider);border-radius:14px;background:var(--wb-elevated,var(--wb-panel));color:var(--wb-text);box-shadow:var(--wb-shadow-hover);pointer-events:auto;animation:wb-toast-enter .16s ease-out}
.wb-toast-icon{display:grid;place-items:center;flex:none;width:20px;height:20px;border-radius:50%;background:var(--wb-danger-bg);color:var(--wb-danger);font-size:13px;font-weight:650}
.wb-toast-content{flex:1;min-width:0}.wb-toast-content>strong{display:block;font-size:13px;font-weight:600;line-height:20px}.wb-toast-content>p{margin:4px 0 0;color:var(--wb-muted);font-size:12px;line-height:1.65;overflow-wrap:anywhere}
.wb-toast-content details{margin-top:7px;font-size:11px;color:var(--wb-muted)}.wb-toast-content summary{display:inline-block;cursor:pointer;color:var(--wb-muted)}.wb-toast-content summary:hover{color:var(--wb-text)}
.wb-toast-content pre{max-height:180px;overflow:auto;overscroll-behavior:contain;margin:8px 0 0;padding:9px;border-radius:8px;background:var(--wb-soft);color:var(--wb-muted);font-size:10px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
.wb .wb-toast-close{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--wb-muted)}.wb .wb-toast-close:hover{background:var(--wb-hover);color:var(--wb-text)}
@keyframes wb-toast-enter{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){.wb-toast-layer{inset:calc(var(--dsh-frame-top-clearance,0px) + 58px) 12px auto;width:calc(100vw - 24px)}}
@media(prefers-reduced-motion:reduce){.wb .wb-toast{animation:none}}
`;
