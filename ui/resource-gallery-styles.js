import projectCardStyles from './project-card-styles.js';

export default projectCardStyles + `
.wb-v2 .wb-resource-gallery{display:flex;flex-direction:column;gap:20px;width:100%;min-width:0;max-width:none;margin:0;container:wb-resource-gallery / inline-size}
.wb-v2 .wb-resource-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;min-height:38px;margin:0;min-width:0}
.wb-v2 .wb-resource-search{display:flex;align-items:center;gap:8px;min-width:0;width:280px;max-width:100%;min-height:38px;padding:0 12px;border:0;border-radius:var(--wb-radius,12px);background:var(--wb-field);color:var(--wb-muted)}
.wb-v2 .wb-resource-search>svg{flex-shrink:0}
.wb-v2 .wb-resource-search input{flex:1;min-width:0;width:100%;min-height:38px;margin:0;padding:9px 0;border:0;outline:0;border-radius:0;background:transparent!important;box-shadow:none;font:inherit;font-size:12px;color:var(--wb-text)}
.wb-v2 .wb-resource-search input:focus-visible{outline:0}
.wb-v2 .wb-resource-search:focus-within{background:color-mix(in srgb,var(--wb-brand-blue) 6%,var(--wb-field))}
.wb-v2 .wb-resource-search>button:not(.wb-button){display:grid;place-items:center;flex:none;width:24px;height:24px;padding:4px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-muted);cursor:pointer}
.wb-v2 .wb-resource-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;min-width:0;margin-left:auto}
.wb-v2 .wb-resource-actions .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:8px 12px;white-space:nowrap;border-radius:var(--wb-radius-sm,8px);font-size:12px}
.wb-v2 .wb-resource-actions select{max-width:220px;min-width:0;min-height:36px;padding:8px 10px;font-size:12px}
.wb-v2 .wb-resource-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));align-items:start;gap:18px 16px;width:100%;min-width:0}
.wb-v2 .wb-resource-card{position:relative;display:flex;flex-direction:column;gap:12px;min-width:0;min-height:176px;margin:0;padding:16px;border:0;border-radius:var(--wb-radius,12px);background:var(--wb-panel);color:var(--wb-text);box-shadow:inset 0 0 0 1px var(--wb-border);transform:none;transition:background-color .14s,box-shadow .14s}
.wb-v2 .wb-resource-card:hover,.wb-v2 .wb-resource-card:focus-within{background:color-mix(in srgb,var(--wb-brand-blue) 3%,var(--wb-panel));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wb-brand-blue) 25%,var(--wb-divider));transform:none}
.wb-v2 .wb-resource-card:has(details[open]){z-index:4}
.wb-v2 .wb-resource-open{display:flex;flex:1;flex-direction:column;align-items:stretch;gap:12px;min-width:0;width:100%;margin:0;padding:0;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wb-v2 .wb-resource-open:not(:disabled):hover{background:transparent;color:inherit}
.wb-v2 .wb-resource-open:disabled{background:transparent;color:var(--wb-muted);cursor:default;opacity:.7}
.wb-v2 .wb-resource-icon{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:var(--wb-radius-sm,8px);background:var(--wb-blue-08);color:var(--wb-brand-ink)}
.wb-v2 .wb-resource-icon[data-tone=violet]{background:var(--wb-violet-08);color:var(--wb-warning)}
.wb-v2 .wb-resource-icon[data-tone=coral]{background:var(--wb-coral-08);color:var(--wb-danger)}
.wb-v2 .wb-resource-card-header{display:flex;align-items:center;gap:10px;min-width:0}
.wb-v2 .wb-resource-card-header>.wb-resource-title{flex:1}
.wb-v2 .wb-resource-footer .wb-resource-open{display:inline-flex;flex:0 1 auto;flex-direction:row;align-items:center;justify-content:flex-start;gap:6px;width:auto;min-height:29px}
.wb-v2 .wb-resource-title{min-width:0;margin:0;color:var(--wb-text);font:inherit;font-size:14px;font-weight:600;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-v2 .wb-resource-description{display:-webkit-box;min-height:38px;margin:0;color:var(--wb-muted);font-size:12px;line-height:1.6;overflow:hidden;overflow-wrap:anywhere;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wb-v2 .wb-resource-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;min-width:0;color:var(--wb-faint);font-size:11px;line-height:1.6;overflow-wrap:anywhere}
.wb-v2 .wb-resource-meta>span{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-v2 .wb-resource-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;margin-top:auto;padding-top:2px;color:var(--wb-muted);font-size:11px;line-height:1.5}
.wb-v2 .wb-resource-footer .wb-button{min-height:29px;padding:5px 8px;font-size:11px}
.wb-v2 .wb-resource-footer label{display:inline-flex;align-items:center;gap:7px;min-width:0;cursor:pointer}
.wb-v2 .wb-resource-footer input[type=checkbox]{margin:0;accent-color:var(--wb-brand-blue)}
.wb-v2 .wb-resource-empty{display:flex;grid-column:1/-1;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:220px;padding:28px 18px;border-radius:var(--wb-radius,12px);color:var(--wb-faint);text-align:center;font-size:13px}
.wb-v2 .wb-resource-empty p{margin:0;color:var(--wb-muted)}
.wb-v2 .wb-resource-add-choices{display:grid;gap:10px;min-width:0}
.wb-v2 .wb-resource-add-choices .wb-button{display:flex;align-items:center;justify-content:flex-start;gap:10px;min-height:46px;padding:12px;text-align:left;white-space:normal}
.wb-resource-cover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;overflow:hidden;padding:14px 16px 0;background:linear-gradient(135deg,var(--wb-blue-08),var(--wb-soft) 70%);color:var(--wb-brand-ink);pointer-events:none}
.wb-resource-cover-label{display:flex;align-items:center;gap:6px;align-self:stretch;font-size:10px;line-height:1.5;color:var(--wb-muted)}
.wb-resource-cover-label>.wb-resource-cover-detail{margin-left:auto}
.wb-resource-cover-paper{display:flex;flex-direction:column;gap:8px;width:62%;max-width:190px;min-width:100px;min-height:140px;margin-top:16px;padding:18px;border-radius:10px 10px 0 0;background:var(--wb-panel);box-shadow:0 6px 22px color-mix(in srgb,var(--wb-brand-ink) 7%,transparent)}
.wb-resource-cover-file{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;font-weight:550;color:var(--wb-text)}
.wb-resource-cover-file>svg{color:var(--wb-brand-ink)}
.wb-resource-cover-line{display:block;flex:none;width:100%;height:4px;border-radius:999px;background:var(--wb-divider)}
.wb-resource-cover-line:nth-of-type(3){width:80%}
.wb-resource-cover-line:nth-of-type(4){width:58%}
.wb-resource-cover-samples{display:flex;gap:6px;margin-top:6px}
.wb-resource-cover-samples>i{width:15px;height:15px;border-radius:5px;background:var(--wb-brand-ink)}
.wb-resource-cover-samples>i:nth-child(2){opacity:.55}
.wb-resource-cover-samples>i:nth-child(3){opacity:.25}
.wb-resource-cover-samples>i:nth-child(4){background:var(--wb-divider)}

.wb-resource-cover[data-kind=knowledge]{--wb-cover-tint:var(--wb-violet-08)}
.wb-resource-cover[data-kind=skill]{--wb-cover-tint:var(--wb-coral-08)}
.wb-resource-cover{background:linear-gradient(135deg,var(--wb-cover-tint,var(--wb-blue-08)),var(--wb-soft) 70%)}
.wb-resource-cover-label>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wb-resource-cover-content{display:flex;flex:1;align-self:stretch;flex-direction:column;gap:9px;min-height:0;padding-top:13px;text-align:left;color:var(--wb-text)}
.wb-resource-cover-content>strong{display:-webkit-box;overflow:hidden;overflow-wrap:anywhere;font-size:13px;line-height:1.4;font-weight:600;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wb-resource-cover-content>span{display:-webkit-box;overflow:hidden;overflow-wrap:anywhere;color:var(--wb-muted);font-size:11px;line-height:1.65;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.wb-v2 .wb-skill-card .wb-skill-card-actions{min-height:46px;padding:8px 10px}
.wb-skill-card-menu{position:relative}
.wb-skill-card-menu>summary{list-style:none;cursor:pointer}
.wb-skill-card-menu>summary::-webkit-details-marker{display:none}
.wb-skill-card-menu-items{position:absolute;right:0;top:calc(100% + 5px);z-index:10;display:flex;flex-direction:column;gap:6px;width:190px;padding:6px;border-radius:var(--wb-radius-menu,18px);background:var(--wb-elevated);box-shadow:var(--wb-shadow-hover)}
.wb .wb-skill-card-menu-items>button{min-height:32px;padding:7px 10px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-text);text-align:left;font:inherit;font-size:12px}
.wb .wb-skill-card-menu-items>button:not(:disabled):hover{background:var(--wb-hover)}
.wb-skill-card-menu-items>span{padding:0 10px 6px;color:var(--wb-muted);font-size:10px;overflow-wrap:anywhere}
.wb-resource-grid>.wb-project-card:has(details[open]){position:relative;z-index:4}
.wb-v2 .wb-gallery-card-description{display:-webkit-box;min-height:32px;margin:0 10px 8px;color:var(--wb-muted);font-size:11px;line-height:1.5;overflow:hidden;overflow-wrap:anywhere;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wb-gallery-card-meta{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 10px;min-width:0;padding:0 10px 8px;color:var(--wb-faint);font-size:11px;line-height:1.5}
.wb-gallery-card-meta>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb .wb-gallery-card-meta>label{display:inline-flex;flex-direction:row;flex:none;align-items:center;gap:6px;width:auto;white-space:nowrap;cursor:pointer;color:var(--wb-muted)}
.wb-skill-card .wb-gallery-card-meta{flex-wrap:nowrap}
.wb-skill-card .wb-gallery-card-meta>span{flex:1}
.wb-gallery-card-meta input[type=checkbox]{margin:0;accent-color:var(--wb-brand-ink)}
.wb-v2 .wb-gallery-card-meta .wb-button{min-height:26px;padding:4px 7px;border:0;background:transparent;box-shadow:none;font-size:11px;color:var(--wb-muted)}
.wb-v2 .wb-gallery-card-meta .wb-button:not(:disabled):hover{background:var(--wb-panel);color:var(--wb-brand-ink)}

@container wb-resource-gallery (max-width:520px){.wb-v2 .wb-resource-grid{grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))}.wb-v2 .wb-resource-toolbar{gap:10px}.wb-v2 .wb-resource-search{flex:1 1 170px;width:auto}.wb-v2 .wb-resource-actions{gap:6px}.wb-v2 .wb-resource-actions select{max-width:170px}}
@media(prefers-reduced-motion:reduce){.wb-v2 .wb-resource-card{transition:none}}
`;
