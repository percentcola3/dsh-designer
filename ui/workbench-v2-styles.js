export default `
/* Content cards retain their surfaces; editor panels meet at shared dividers. */
.wb-v2 .wb-shell-stage{background:var(--wb-bg);box-shadow:none}
.wb-v2 .wb-management{padding:32px clamp(18px,3vw,48px) 36px}
.wb-v2 .wb-home-management{padding:0}
.wb-v2 .wb-home-project-dialog{width:560px}
.wb-v2 .wb-home-project-dialog .wb-modal-body{padding:18px 24px 22px}
.wb-v2 .wb-dialog-project .wb-home-project-options{display:flex;flex-direction:column;gap:20px}
.wb-v2 .wb-home-project-options>footer{margin-top:0;padding-top:16px;border-top:1px solid var(--wb-divider)}
.wb-project-create-fields{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px}
.wb .wb-project-create-fields>label{display:flex;flex-direction:column;gap:8px;min-width:0;color:var(--wb-text);font-size:12px}
.wb.wb-v2 .wb-project-create-fields input,.wb.wb-v2 .wb-project-group-trigger{height:36px;min-height:36px;border:1px solid var(--wb-divider);border-radius:var(--wb-radius-input);background:var(--wb-soft)}
.wb.wb-v2 .wb-project-create-fields input{width:100%;padding:8px 10px;font-size:13px}
.wb-project-group-select{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0}
.wb-project-group-label{color:var(--wb-text);font-size:12px}
.wb.wb-v2 .wb-project-group-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:7px 10px;color:var(--wb-text);font:inherit;font-size:13px;cursor:pointer;text-align:left}
.wb-project-group-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-project-group-trigger>svg{flex:none;color:var(--wb-muted);transition:transform .14s}
.wb-project-group-trigger[aria-expanded=true]>svg{transform:rotate(180deg)}
.wb.wb-v2 .wb-project-group-trigger:not(:disabled):hover{border-color:var(--wb-faint)}
.wb-project-group-trigger:disabled{opacity:.65;cursor:default}
.wb.wb-v2 .wb-project-group-list{position:absolute;z-index:10;top:calc(100% + 6px);left:0;width:100%;min-width:0;max-height:min(220px,30dvh);overflow:auto;padding:4px;border:1px solid var(--wb-divider);border-radius:10px;background:var(--wb-elevated);box-shadow:var(--wb-shadow-soft)}
.wb.wb-v2 .wb-project-group-list>[role=option]{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:32px;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:var(--wb-text);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.wb-project-group-list>[role=option]>span{min-width:0;overflow-wrap:anywhere}
.wb-project-group-list>[role=option]>svg{flex:none}
.wb.wb-v2 .wb-project-group-list>[role=option][aria-selected=true]{background:var(--wb-brand-soft);color:var(--wb-brand-ink)}
.wb.wb-v2 .wb-project-group-list>[role=option][data-active=true]{background:var(--wb-hover);outline:1px solid var(--wb-divider);outline-offset:-1px}
.wb.wb-v2 .wb-project-group-list>[role=option][aria-selected=true][data-active=true]{background:var(--wb-brand-soft);outline-color:var(--wb-brand-ink)}
@media(max-width:420px){.wb-project-create-fields{grid-template-columns:1fr}}
@media(max-width:520px){.wb-v2 .wb-home-project-dialog .wb-modal-body{padding:16px}}
.wb-v2 .wb-library-warning{margin:12px 18px 0;padding:12px 16px;border:0;border-radius:12px;background:var(--wb-warning-bg);color:var(--wb-warning)}
.wb-v2 .wb-manager-content{max-width:1180px}
.wb-v2 .wb-manager-head{margin-bottom:24px;gap:18px}
.wb-v2 .wb-manager-head h1{font-size:27px;letter-spacing:-.045em}
.wb-v2 .wb-manager-head>.wb-button{border-radius:var(--wb-radius-sm);min-height:var(--wb-control-height,28px);padding-inline:11px;box-shadow:none}
.wb-v2 .wb-manager-tools{border:0;padding-bottom:0;margin-bottom:25px;gap:12px;flex-wrap:wrap}
.wb-v2 .wb-search-field{border:0;border-radius:var(--wb-radius-input);background:var(--wb-field);box-shadow:none;min-width:130px}
.wb-v2 .wb-search-field input{min-height:42px;background:transparent}
.wb-v2 .wb-card-grid{grid-template-columns:repeat(auto-fill,minmax(min(285px,100%),1fr));gap:20px}
.wb-v2 .wb-card{background:var(--wb-panel);border:0;border-radius:var(--wb-radius-card);padding:18px;min-height:216px;gap:12px;box-shadow:var(--wb-shadow);transition:background-color .15s}
.wb-v2 .wb-card:hover{background:color-mix(in srgb,var(--wb-panel) 97%,var(--wb-blue));box-shadow:var(--wb-shadow)}
.wb-v2 .wb-card-icon{border:0;border-radius:var(--wb-radius-sm);width:36px;height:36px;background:var(--wb-soft)}
.wb-v2 .wb-card h3{font-size:16px}
.wb-v2 .wb-card-description{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.wb-v2 .wb-card-footer{border:0;padding-top:5px}
.wb-v2 .wb-card-footer .wb-primary{border-radius:var(--wb-radius-sm)}
.wb-v2 .wb-card-footer select{border:0;background:var(--wb-soft);border-radius:var(--wb-radius-input)}
.wb-v2 .wb-manager-empty{flex:0 0 auto;max-width:620px;width:100%;min-height:280px;margin:24px auto;padding:30px 24px;gap:15px;border:0;border-radius:var(--wb-radius-card);background:var(--wb-panel);box-shadow:var(--wb-shadow)}
.wb-v2 .wb-empty-brand{width:56px;height:56px;border:0;border-radius:var(--wb-radius);background:var(--wb-soft);box-shadow:none}
.wb-v2 .wb-manager-empty h2{font-size:20px}
.wb-v2 .wb-manager-empty p{max-width:350px}
.wb-v2 .wb-settings-page{max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:20px;min-width:0}
.wb-v2 .wb-page-heading{display:flex;align-items:center;gap:16px;justify-content:space-between;margin-bottom:7px;min-width:0}
.wb-v2 .wb-page-heading>div{min-width:0}
.wb-v2 .wb-page-heading h1{font-size:27px;letter-spacing:-.04em;overflow-wrap:anywhere;margin-top:6px}
.wb-v2 .wb-page-heading p{font-size:13px;color:var(--wb-muted);margin-top:8px}
.wb-v2 .wb-page-eyebrow{font-size:11px;letter-spacing:.06em;color:var(--wb-faint)}
.wb-v2 .wb-settings-card{display:flex;align-items:center;gap:16px;padding:20px;border-radius:var(--wb-radius-card);background:var(--wb-panel);box-shadow:var(--wb-shadow);min-width:0;flex-wrap:wrap}
.wb-v2 .wb-settings-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--wb-radius-sm);background:var(--wb-brand-soft);color:var(--wb-accent);flex-shrink:0}
.wb-v2 .wb-settings-copy{flex:1;min-width:180px}
.wb-v2 .wb-settings-copy h2{font-size:15px;font-weight:600}
.wb-v2 .wb-settings-copy p{font-size:12px;line-height:1.8;color:var(--wb-muted);margin-top:5px}
.wb-v2 .wb-settings-group-list{flex-basis:100%;display:flex;flex-direction:column;gap:12px;padding-top:5px}
.wb-v2 .wb-settings-path{display:block;margin-top:10px;max-width:100%;font-size:11px;line-height:1.7;color:var(--wb-muted);overflow-wrap:anywhere}
.wb-v2 .wb-settings-badge{font-size:11px;color:var(--wb-accent);background:var(--wb-brand-soft);border-radius:var(--wb-radius-sm);padding:4px 8px}
.wb-v2 label.wb-settings-switch{flex-direction:row;align-items:center;gap:9px;cursor:pointer}
.wb-v2 .wb-settings-form{background:var(--wb-panel);border-radius:var(--wb-radius);padding:22px;box-shadow:var(--wb-shadow)}
.wb-v2 .wb-settings-form-body{display:flex;flex-direction:column;gap:20px}
.wb-v2 .wb-settings-form label{gap:8px}
.wb-v2 .wb-settings-form input,.wb-v2 .wb-settings-form textarea,.wb-v2 .wb-settings-form select{border:0;border-radius:var(--wb-radius-input);padding:10px 12px;background:var(--wb-field);box-shadow:none}
.wb-v2 .wb-settings-form footer{display:flex;align-items:center;gap:10px;margin-top:24px;flex-wrap:wrap}
.wb-v2 .wb-workspace,.wb-v2 .wb-toolbar,.wb-v2 .wb-editor-row,.wb-v2 .wb-navigation,.wb-v2 .wb-content,.wb-v2 .wb-ai-frame,.wb-v2 .wb-ai,.wb-v2 .wb-nav-tabs,.wb-v2 .wb-ai-header,.wb-v2 .wb-ai-target,.wb-v2 .wb-resource-bar,.wb-v2 .wb-content-tabs,.wb-v2 .wb-status{margin:0;border:0;border-radius:0;box-shadow:none}
.wb-v2 .wb-workspace,.wb-v2 .wb-editor-row{gap:0;padding:0}
.wb-v2 .wb-toolbar{border-bottom:1px solid var(--wb-divider);background:var(--wb-panel);padding:8px 12px;gap:7px}
/* Keep the navigation's 6px resizer visible across its shared edge. */
.wb-v2 .wb-navigation{border-right:1px solid var(--wb-divider);background:var(--wb-panel);overflow:visible}
.wb-v2 .wb-content,.wb-v2 .wb-ai{background:var(--wb-panel);overflow:hidden}
/* The frame owns the AI resizer; its sibling panel must stay below that hit area. */
.wb-v2 .wb-ai-frame .wb-ai{border-left:1px solid var(--wb-divider);z-index:auto}
.wb-v2 .wb-nav-tabs,.wb-v2 .wb-ai-header,.wb-v2 .wb-ai-target,.wb-v2 .wb-resource-bar,.wb-v2 .wb-content-tabs{border-bottom:1px solid var(--wb-divider)}
.wb-v2 .wb-nav-tabs,.wb-v2 .wb-resource-bar,.wb-v2 .wb-content-tabs,.wb-v2 .wb-ai-target{background:var(--wb-soft)}
.wb-v2 .wb-content-tab{border-right:1px solid var(--wb-divider);border-bottom:2px solid transparent;border-radius:0;margin:0;padding-inline:9px;box-shadow:none}
.wb-v2 .wb-content-tab[aria-selected=true]{border-bottom-color:var(--wb-accent);background:var(--wb-panel);color:var(--wb-accent)}
.wb-v2 .wb-ai-header{padding:12px}
.wb-v2 .wb-ai-compose,.wb-v2 .wb-status{border-top:1px solid var(--wb-divider)}
.wb-v2 .wb-status{background:var(--wb-panel);padding:4px 12px;gap:15px}
.wb-v2.wb-focus .wb-shell-sidebar,.wb-v2.wb-focus .wb-shell-topbar{display:none}
@media(max-width:760px){
  .wb-v2 .wb-management{padding:24px 18px}
  .wb-v2 .wb-home-management{padding:0}
  .wb-v2 .wb-manager-head{flex-wrap:wrap;gap:14px}
  .wb-v2 .wb-manager-head h1,.wb-v2 .wb-page-heading h1{font-size:23px}
  .wb-v2 .wb-page-heading{flex-wrap:wrap}
  .wb-v2 .wb-settings-card{padding:19px;gap:14px}
  .wb-v2 .wb-settings-form{padding:20px}
  .wb-v2 .wb-settings-copy{min-width:130px}
}
@media(prefers-reduced-motion:reduce){.wb-v2 .wb-card{transition:none}}
`;
