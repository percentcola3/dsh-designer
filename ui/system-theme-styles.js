export default `
.wb-v2 .wb-theme-rule{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--wb-panel)}
.wb-v2 .wb-theme-rule>header{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;border-bottom:1px solid var(--wb-divider);flex:none;font-size:12px;color:var(--wb-muted)}
.wb-v2 .wb-theme-rule-content{flex:1;min-height:0;overflow:auto}
.wb-v2 .wb-theme-rule-content>.wb-muted{padding:20px}
.wb-v2 .wb-theme-preview>header{overflow-x:auto}
.wb-v2 .wb-theme-preview [role=group]{flex:none}

.wb-v2 .wb-theme-upgrade{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;padding:10px;border-radius:8px;background:var(--wb-bg);font-size:11px;color:var(--wb-muted)}
.wb-v2 .wb-theme-editor{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--wb-panel)}
.wb-v2 .wb-theme-controls{box-sizing:border-box;width:clamp(218px,18vw,252px);flex:none;overflow:auto;scrollbar-width:thin;scrollbar-color:transparent transparent;padding:10px 14px 20px;background:var(--wb-panel)}
.wb-v2 .wb-theme-controls:hover,.wb-v2 .wb-theme-controls:focus-within{scrollbar-color:var(--wb-divider) transparent}
.wb-v2 .wb-theme-controls>header{display:flex;align-items:center;height:26px;margin-bottom:10px;font-size:13px}
.wb-v2 .wb-theme-controls details+details{margin-top:14px}
.wb-v2 .wb-theme-controls summary{display:flex;align-items:center;justify-content:space-between;min-height:24px;cursor:pointer;font-size:11px;font-weight:600;color:var(--wb-muted);list-style:none}
.wb-v2 .wb-theme-controls summary::-webkit-details-marker{display:none}
.wb-v2 .wb-theme-controls summary::after{content:"";width:5px;height:5px;margin-right:5px;border:solid currentColor;border-width:0 1px 1px 0;transform:rotate(-45deg)}
.wb-v2 .wb-theme-controls details[open]>summary::after{transform:rotate(45deg)}
.wb-v2 .wb-theme-fields{display:grid;gap:3px;padding-top:4px}
.wb-v2 .wb-theme-field{display:grid;grid-template-columns:minmax(64px,1fr) minmax(0,132px);align-items:center;gap:6px;min-height:26px;font-size:12px;color:var(--wb-text)}
.wb-v2 .wb-theme-color,.wb-v2 .wb-theme-font,.wb-v2 .wb-theme-number{display:flex;align-items:center;min-width:0}
.wb-v2 .wb-theme-color{justify-self:end;flex-direction:row-reverse;gap:5px;padding:0 5px;height:24px;border-radius:6px;background:var(--wb-field)}
.wb-v2 .wb-theme-color input[type=text]{box-sizing:border-box;width:59px;height:22px;min-height:0;padding:0;border:0;background:transparent;border-radius:3px;color:var(--wb-text);font:11px/1.2 ui-monospace,monospace}
.wb-v2 .wb-theme-color input[type=color]{box-sizing:border-box;flex:none;width:17px;height:17px;min-height:0;padding:0;border:0;border-radius:4px;overflow:hidden;cursor:pointer;background:transparent}
.wb-v2 .wb-theme-color input::-webkit-color-swatch-wrapper{padding:0}
.wb-v2 .wb-theme-color input::-webkit-color-swatch{border:0;border-radius:4px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb-v2 .wb-theme-font{gap:4px}
.wb-v2 .wb-theme-font select{flex:1;min-width:0;width:0;height:24px;min-height:0;padding:0 5px;border:0;border-radius:6px;font-size:11px;text-overflow:ellipsis}
.wb-v2 .wb-theme-font button{display:grid;place-items:center;flex:none;width:24px;height:24px;min-height:0;padding:0;border:0;border-radius:6px;background:transparent;color:var(--wb-muted);cursor:pointer}
.wb-v2 .wb-theme-font button:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-v2 .wb-theme-number{gap:5px;font-variant-numeric:tabular-nums}
.wb-v2 .wb-theme-number input[type=range]{appearance:none;flex:1;min-width:0;width:0;height:24px;min-height:0;margin:0;padding:0;border:0;box-shadow:none;background:transparent;cursor:pointer}
.wb-v2 .wb-theme-number input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:4px;background:linear-gradient(to right,var(--wb-muted) var(--filled),var(--wb-divider) var(--filled))}
.wb-v2 .wb-theme-number input[type=range]::-webkit-slider-thumb{appearance:none;width:9px;height:9px;margin-top:-3px;border:0;border-radius:50%;background:var(--wb-text)}
.wb-v2 .wb-theme-number input[type=range]:is(:hover,:focus-visible)::-webkit-slider-thumb{background:var(--wb-brand-ink)}
.wb-v2 .wb-theme-number input[type=number]{appearance:textfield;box-sizing:border-box;width:38px;height:24px;min-height:0;padding:0 3px;text-align:center;font:inherit;font-size:11px;border:0;border-radius:6px;background:var(--wb-field)}
.wb-v2 .wb-theme-number input[type=number]::-webkit-inner-spin-button{appearance:none}
.wb-v2 .wb-theme-number small{width:12px;color:var(--wb-muted);font-size:10px}
.wb-v2 .wb-theme-preview{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;background:var(--wb-bg)}
.wb-v2 .wb-theme-preview>header{display:flex;align-items:center;min-height:38px;padding:3px 14px;background:var(--wb-panel);flex:none;scrollbar-width:none}
.wb-v2 .wb-theme-preview>header [role=group],.wb-v2 .wb-spec-header .wb-spec-view-switch{display:flex;gap:2px;padding:0;background:transparent}
.wb-v2 .wb-theme-preview>header .wb-button,.wb-v2 .wb-spec-header .wb-spec-view-switch .wb-button{min-height:25px;padding:3px 8px;border:0;border-radius:6px;background:transparent;box-shadow:none;color:var(--wb-muted);font-size:12px}
.wb-v2 .wb-theme-preview>header .wb-button[aria-pressed=true],.wb-v2 .wb-spec-header .wb-spec-view-switch .wb-button[aria-pressed=true]{background:var(--wb-hover);color:var(--wb-text);font-weight:600}
.wb-v2 .wb-theme-preview iframe{display:block;flex:1;width:100%;border:0;background:white;min-height:0}
.wb-v2 .wb-theme-preview[data-platform=mobile]:not([data-view=foundations]):not([data-view=rule]) iframe{width:390px;max-width:100%;align-self:center;border-inline:1px solid var(--wb-divider)}
`;
