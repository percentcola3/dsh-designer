export default `
/* Shared geometry and sampled brand colors; neutral surfaces carry the layout. */
.wb[data-theme]{
  --wb-brand-blue:#1744F4;
  --wb-brand-coral:#FF586F;
  --wb-brand-violet:#2803B1;
  --wb-blue:var(--wb-brand-blue);
  --wb-coral:var(--wb-brand-coral);
  --wb-violet:var(--wb-brand-violet);
  --wb-blue-08:#1744F414;
  --wb-blue-16:#1744F429;
  --wb-blue-24:#1744F43D;
  --wb-coral-08:#FF586F14;
  --wb-coral-16:#FF586F29;
  --wb-coral-24:#FF586F3D;
  --wb-violet-08:#2803B114;
  --wb-violet-16:#2803B129;
  --wb-violet-24:#2803B13D;
  --wb-radius:12px;
  --wb-radius-sm:8px;
  --wb-radius-surface:var(--wb-radius);
  --wb-radius-card:var(--wb-radius);
  --wb-radius-input:var(--wb-radius);
  --wb-radius-modal:var(--wb-radius);
  --wb-radius-composer:var(--wb-radius);
  --wb-radius-control:var(--wb-radius-sm);
  --wb-radius-menu:var(--wb-radius-sm);
}
.wb[data-theme=light]{
  color-scheme:light;
  --wb-logo-bg:transparent;
  --wb-logo-ink:var(--wb-blue);
  --wb-app-bg:#f3f3f5;
  --wb-bg:#fafafa;
  --wb-panel:#ffffff;
  --wb-elevated:#ffffff;
  --wb-soft:#f3f3f5;
  --wb-field:#f1f1f4;
  --wb-canvas:#ededf0;
  --wb-hover:#eaeaf0;
  --wb-selected:var(--wb-blue-08);
  --wb-divider:#e2e2e6;
  --wb-text:#28282d;
  --wb-muted:#696971;
  --wb-faint:#75757e;
  --wb-accent:var(--wb-blue);
  --wb-focus:var(--wb-blue);
  --wb-primary:var(--wb-blue);
  --wb-primary-hover:color-mix(in srgb,var(--wb-blue) 86%,var(--wb-violet));
  --wb-on-primary:#ffffff;
  --wb-brand-ink:var(--wb-blue);
  --wb-brand-soft:var(--wb-blue-08);
  --wb-brand-muted:color-mix(in srgb,var(--wb-violet) 60%,var(--wb-muted));
  --wb-brand-hover:var(--wb-blue-08);
  --wb-brand-action:var(--wb-blue);
  --wb-brand-action-hover:var(--wb-primary-hover);
  --wb-on-brand:#ffffff;
  --wb-disabled:#e7e7eb;
  --wb-on-disabled:#95959e;
  --wb-danger:color-mix(in srgb,var(--wb-coral) 67%,var(--wb-text));
  --wb-danger-bg:var(--wb-coral-08);
  --wb-warning:var(--wb-violet);
  --wb-warning-bg:var(--wb-violet-08);
  --wb-success:var(--wb-blue);
  --wb-shadow:0 1px 3px #18181b06;
  --wb-shadow-hover:0 4px 16px #18181b0f;
  --wb-shadow-soft:0 1px 4px #18181b08;
  --wb-ring:0 0 0 2px var(--wb-blue-24);
  --wb-overlay:#18181b60;
  --wb-chrome-background:#f5f5f6;
  --wb-sidebar-background:#f5f5f6;
  --wb-home-background:#fafafa;
  --wb-tab-active-background:var(--wb-blue-08);
  --wb-heading-color:var(--wb-brand-ink);
  --wb-heading-gradient:var(--wb-heading-color);
}
.wb[data-theme=dark]{
  color-scheme:dark;
  --wb-logo-bg:transparent;
  --wb-logo-ink:color-mix(in srgb,var(--wb-blue) 55%,white);
  --wb-app-bg:#171719;
  --wb-bg:#1c1c1f;
  --wb-panel:#252528;
  --wb-elevated:#2e2e32;
  --wb-soft:#303034;
  --wb-field:#2b2b2f;
  --wb-canvas:#19191c;
  --wb-hover:#38383e;
  --wb-selected:var(--wb-blue-24);
  --wb-divider:#3b3b41;
  --wb-text:#f0f0f3;
  --wb-muted:#bcbcc5;
  --wb-faint:#a2a2ad;
  --wb-accent:color-mix(in srgb,var(--wb-blue) 55%,white);
  --wb-focus:var(--wb-accent);
  --wb-primary:var(--wb-blue);
  --wb-primary-hover:color-mix(in srgb,var(--wb-blue) 90%,white);
  --wb-on-primary:#ffffff;
  --wb-brand-ink:var(--wb-accent);
  --wb-brand-soft:var(--wb-blue-16);
  --wb-brand-muted:color-mix(in srgb,var(--wb-violet) 36%,white);
  --wb-brand-hover:var(--wb-blue-16);
  --wb-brand-action:var(--wb-blue);
  --wb-brand-action-hover:var(--wb-primary-hover);
  --wb-on-brand:#ffffff;
  --wb-disabled:#36363c;
  --wb-on-disabled:#888893;
  --wb-danger:color-mix(in srgb,var(--wb-coral) 72%,white);
  --wb-danger-bg:var(--wb-coral-16);
  --wb-warning:color-mix(in srgb,var(--wb-violet) 36%,white);
  --wb-warning-bg:var(--wb-violet-16);
  --wb-success:var(--wb-accent);
  --wb-shadow:0 1px 3px #00000020;
  --wb-shadow-hover:0 4px 16px #00000030;
  --wb-shadow-soft:0 1px 4px #00000024;
  --wb-ring:0 0 0 2px color-mix(in srgb,var(--wb-focus) 32%,transparent);
  --wb-overlay:#00000090;
  --wb-chrome-background:#222225;
  --wb-sidebar-background:#222225;
  --wb-home-background:#1c1c1f;
  --wb-tab-active-background:var(--wb-blue-16);
  --wb-heading-color:var(--wb-brand-ink);
  --wb-heading-gradient:var(--wb-heading-color);
}
.wb[data-theme]{--wb-border:color-mix(in srgb,var(--wb-divider) 72%,transparent);--wb-border-strong:var(--wb-divider);background:var(--wb-app-bg);accent-color:var(--wb-brand-action)}
.wb[data-theme] .wb-native-compose-control{color:var(--wb-muted)}
.wb[data-theme] .wb-native-compose-control:hover:not(:disabled),.wb[data-theme] .wb-native-compose-control[aria-expanded=true],.wb[data-theme] .wb-native-compose-option:hover:not(:disabled),.wb[data-theme] .wb-native-compose-option:focus-visible{background:var(--wb-hover);color:var(--wb-text)}
.wb[data-theme] .wb-native-compose-popup{background:var(--wb-elevated);color:var(--wb-text);border-color:var(--wb-divider);box-shadow:var(--wb-shadow-hover)}
.wb[data-theme] .wb-native-compose-heading,.wb[data-theme] .wb-native-compose-detail,.wb[data-theme] .wb-native-compose-message,.wb[data-theme] .wb-native-compose-recording{color:var(--wb-muted)}
.wb[data-theme] .wb-native-compose-message[role=alert]{color:var(--wb-danger)}
.wb-v2 .wb-shell .wb-shell-logo{background:transparent}
.wb-v2 .wb-shell .wb-shell-nav-item[aria-current=page]{background:var(--wb-brand-soft);color:var(--wb-brand-ink);box-shadow:none}
.wb-v2 .wb-shell .wb-shell-nav-item:not([aria-current=page]):hover{background:var(--wb-brand-hover)}
.wb-v2 .wb-shell .wb-shell-nav-item[aria-current=page]>svg{color:var(--wb-brand-ink)}
.wb-v2 .wb-shell-tab[data-active=true] .wb-shell-tab-select,.wb-v2 .wb-shell-tab[data-active=true] .wb-shell-tab-close{color:var(--wb-brand-ink)}
.wb-v2 .wb-manager-head>.wb-button.wb-primary:not(:disabled),.wb-v2 .wb-modal .wb-button.wb-primary:not(:disabled),.wb-v2 .wb-ai-compose .wb-button.wb-primary:not(:disabled){background:var(--wb-brand-action);color:var(--wb-on-brand)}
.wb-v2 .wb-manager-head>.wb-button.wb-primary:not(:disabled):hover,.wb-v2 .wb-modal .wb-button.wb-primary:not(:disabled):hover,.wb-v2 .wb-ai-compose .wb-button.wb-primary:not(:disabled):hover{background:var(--wb-brand-action-hover);color:var(--wb-on-brand)}
.wb-v2 .wb-card-icon,.wb-v2 .wb-settings-icon{color:var(--wb-brand-ink)}
.wb-v2 .wb-appearance-option[aria-pressed=true] svg{color:var(--wb-brand-ink)}
.wb-v2 .wb-shell-actions{display:flex;align-items:center;flex-shrink:0;gap:5px}
.wb-v2 .wb-shell-theme{width:36px;height:36px;border-radius:var(--wb-radius-sm)}
.wb-v2 .wb-button{border:0;border-radius:var(--wb-radius-sm);background:var(--wb-soft);color:var(--wb-text)}
.wb-v2 .wb-button:not(:disabled):hover{background:var(--wb-hover);border-color:transparent}
.wb-v2 .wb-button[aria-pressed=true]{background:var(--wb-selected);color:var(--wb-text)}
.wb-v2 .wb-button.wb-primary{background:var(--wb-primary);color:var(--wb-on-primary)}
.wb-v2 .wb-button.wb-primary:not(:disabled):hover{background:var(--wb-primary-hover);color:var(--wb-on-primary)}
.wb-v2 .wb-button.wb-ghost{background:transparent;color:var(--wb-muted)}
.wb-v2 .wb-button.wb-ghost:not(:disabled):hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-v2 button:focus-visible,.wb-v2 input:focus-visible,.wb-v2 textarea:focus-visible,.wb-v2 select:focus-visible{outline:2px solid var(--wb-focus);outline-offset:2px}
.wb-v2 input:where(:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])),.wb-v2 textarea,.wb-v2 select{border:0;border-radius:var(--wb-radius-input);background:var(--wb-field);color:var(--wb-text);box-shadow:none}
.wb-v2 input::placeholder,.wb-v2 textarea::placeholder{color:var(--wb-faint)}
.wb[data-theme] input:where(:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])):focus-visible,.wb[data-theme] textarea:focus-visible,.wb[data-theme] select:focus-visible{outline:0;box-shadow:none;background:color-mix(in srgb,var(--wb-brand-blue) 6%,var(--wb-field))}
.wb-v2 .wb-form label:focus-within{color:var(--wb-brand-ink)}
.wb-v2 .wb-search-field,.wb-v2 .wb-projects-search{border:0;border-radius:var(--wb-radius-input);background:var(--wb-field);box-shadow:none}
.wb-v2 .wb-search-field:focus-within,.wb-v2 .wb-projects-search:focus-within{border:0;outline:0;box-shadow:none}
.wb-v2 .wb-search-field:has(input:focus-visible),.wb-v2 .wb-projects-search:has(input:focus-visible){outline:0;background:color-mix(in srgb,var(--wb-brand-blue) 6%,var(--wb-field))}
.wb-v2 .wb-card,.wb-v2 .wb-card-icon,.wb-v2 .wb-chip,.wb-v2 .wb-message,.wb-v2 .wb-reference,.wb-v2 .wb-menu,.wb-v2 .wb-runtime-log{border:0}
.wb-v2 .wb-message{border-radius:var(--wb-radius)}
.wb-v2 .wb-reference{border-radius:var(--wb-radius-sm)}
.wb-v2 .wb-menu{border-radius:var(--wb-radius-sm);background:var(--wb-elevated);box-shadow:var(--wb-shadow-hover)}
.wb-v2 .wb-modal-wrap{background:var(--wb-overlay)}
.wb-v2 .wb-modal{border:0;border-radius:var(--wb-radius-modal);background:var(--wb-panel);box-shadow:var(--wb-shadow-hover)}
.wb-v2 .wb-modal>header,.wb-v2 .wb-form>footer{border:0}
.wb-v2 .wb-error{border:0;border-radius:12px;background:var(--wb-danger-bg);color:var(--wb-danger)}
.wb-v2 .wb-appearance-options{display:flex;align-items:center;gap:5px;padding:5px;border-radius:var(--wb-radius);background:var(--wb-soft)}
.wb-v2 .wb-appearance-option{display:flex;align-items:center;justify-content:center;gap:7px;padding:8px 12px;border:0;border-radius:var(--wb-radius-sm);background:transparent;color:var(--wb-muted);font:inherit;font-size:12px;cursor:pointer}
.wb-v2 .wb-appearance-option:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb-v2 .wb-appearance-option[aria-pressed=true]{background:var(--wb-elevated);color:var(--wb-text);box-shadow:var(--wb-shadow-soft)}
.wb-v2 .ec{--ec-brand:var(--wb-brand-ink)}
.wb-v2 .wb-pdf button,.wb-v2 .wb-pdf input{border:0;border-radius:8px}
.wb-v2 .wb-pdf-scroller{background:var(--wb-canvas)}
/* Component styles mount after the root style; scope these surfaces explicitly. */
.wb-v2 .wb-diagnostics,.wb-v2 .kb-directory-list,.wb-v2 .wb-sync-surface,.wb-v2 .wb-resource-window,.wb-v2 .wb-canvas-tools,.wb.wb-v2 .wb-toast{border-radius:var(--wb-radius)}
.wb.wb-v2 .wb-canvas-editor .wb-navigation{border-radius:var(--wb-radius)}
.wb.wb-v2 .wb-ai.wb-ai-sidebar,.wb.wb-v2 .wb-ai.wb-ai-dock{border-radius:var(--wb-radius);box-shadow:var(--wb-shadow-soft)}
.wb-v2 .wb-diagnostics .diag-summary,.wb-v2 .kb-decision,.wb-v2 .kb-preview pre{border-radius:var(--wb-radius)}
.wb-v2 .kb-heading .wb-button,.wb-v2 .kb-more-menu,.wb-v2 .wb-diagnostics .diag-badge{border-radius:var(--wb-radius-sm)}
.wb-v2 .kb-more-menu{border:0}
.wb-v2 .kb-search{border:0;border-radius:var(--wb-radius-input);background:var(--wb-field);box-shadow:none}
.wb-v2 .kb-search input:focus-visible{outline:0}
.wb-v2 .kb-search:has(input:focus-visible){outline:0;background:color-mix(in srgb,var(--wb-brand-blue) 6%,var(--wb-field))}
`;
