export default `
.wb-knowledge.kb-page{min-width:0}
.kb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.kb-actions .wb-button{gap:7px}
.kb-card-feedback{padding:0 10px 8px}.kb-card-feedback:empty{display:none}.kb-card-feedback>.kb-inline-error{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kb-detail{display:flex;flex-direction:column;gap:14px;min-width:0;padding:18px;border:0;border-radius:var(--wb-radius,12px);background:var(--wb-panel)}
.kb-detail-heading,.kb-detail-title{display:flex;align-items:center;gap:10px;min-width:0}.kb-detail-heading{justify-content:space-between;flex-wrap:wrap}.kb-detail-title{flex:1}.kb-detail-title>svg{flex-shrink:0;color:var(--wb-brand-ink)}.kb-detail-title h2{min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600}
.kb-search{display:flex;align-items:center;gap:9px;padding:5px 8px 5px 13px;background:var(--wb-field);border:0;border-radius:var(--wb-radius,12px);color:var(--wb-muted);min-width:0}
.wb .kb-search input{flex:1;min-width:0;padding:7px 0;background:transparent;border:0;box-shadow:none;font-size:13px}.kb-search>svg{flex-shrink:0}
.kb-search>button:not(.wb-button){display:grid;place-items:center;padding:5px;border:0;background:transparent;color:var(--wb-muted);border-radius:var(--wb-radius-sm,8px)}.kb-search .wb-button{font-size:12px;white-space:nowrap}
.kb-tree-name{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:0;background:transparent;color:var(--wb-text);font:inherit;text-align:left;cursor:pointer;padding:7px 0;border-radius:var(--wb-radius-sm,8px)}
.kb-tree-name>svg{flex-shrink:0;color:var(--wb-muted)}.kb-tree-name>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.kb-status{font-size:11px;color:var(--wb-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}.kb-status[data-tone=ready]{color:var(--wb-brand-ink)}.kb-status[data-tone=failed]{color:var(--wb-warning)}.kb-status[data-tone=pending]{color:var(--wb-muted)}
.kb-more{position:relative;flex-shrink:0}.kb-more>summary{display:grid;place-items:center;width:30px;height:30px;border-radius:var(--wb-radius-sm,8px);list-style:none;cursor:pointer;color:var(--wb-muted)}.kb-more>summary::-webkit-details-marker{display:none}.kb-more>summary:hover,.kb-more[open]>summary{background:var(--wb-hover);color:var(--wb-text)}
.kb-more-menu{position:absolute;right:0;top:calc(100% + 5px);z-index:30;min-width:175px;display:flex;flex-direction:column;gap:3px;padding:6px;border:0;border-radius:var(--wb-radius-sm,8px);background:var(--wb-elevated,var(--wb-panel));box-shadow:var(--wb-shadow-hover)}
.kb-more-menu .wb-button{justify-content:flex-start;border:0;background:transparent;box-shadow:none;min-height:31px;padding:7px 10px;font-size:12px;white-space:nowrap}.kb-more-menu .wb-button:hover{background:var(--wb-hover)}
.kb-directory-content{padding:5px 0 9px}.kb-tree{list-style:none;margin:0;padding:0;min-width:0}.kb-tree-row{display:flex;align-items:center;gap:10px;min-height:36px;padding:0 12px 0 calc(10px + var(--kb-indent,17px));min-width:0}.kb-tree-row:hover{background:var(--wb-hover)}
.kb-tree-name{font-size:12px;font-weight:400;min-height:35px;padding:5px 0}.kb-file-name{padding-left:21px}.kb-file-size{font-size:10px;color:var(--wb-faint);white-space:nowrap}.kb-original-only{font-size:10px;color:var(--wb-faint);white-space:nowrap}
.kb-tree-row .kb-download{display:grid;place-items:center;min-height:25px;width:26px;padding:4px;border:0;background:transparent;color:var(--wb-muted);box-shadow:none}.kb-download svg{transform:rotate(180deg)}
.kb-root-progress{padding:0 14px 6px;text-align:right}.kb-root-progress .wb-button{min-height:26px;padding:4px 8px;font-size:11px}
.kb-inline-error{font-size:12px;line-height:1.7;color:var(--wb-warning);margin:0;overflow-wrap:anywhere}
.kb-notice{font-size:12px;line-height:1.7;color:var(--wb-muted);margin:0;overflow-wrap:anywhere}.kb-notice button{border:0;background:transparent;font:inherit;color:var(--wb-accent);cursor:pointer;padding:0 5px}
.kb-empty{display:flex;align-items:center;flex-direction:column;gap:10px;min-height:260px;justify-content:center;padding:30px;color:var(--wb-faint);text-align:center}.kb-empty p{font-size:14px;color:var(--wb-muted)}.kb-empty span{font-size:12px}
.kb-empty-inline{font-size:12px;color:var(--wb-faint);padding:15px 36px;margin:0;line-height:1.8}
.kb-form{display:flex;flex-direction:column;gap:17px;min-width:0}.kb-form label{display:flex;flex-direction:column;gap:7px;font-size:12px}.kb-form footer{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.kb-picker-actions{display:flex;gap:8px;flex-wrap:wrap}.kb-picker-actions label.wb-button{display:inline-flex;align-items:center;flex-direction:row;gap:7px}
.kb-help{font-size:12px;line-height:1.7;color:var(--wb-muted);margin:0}.kb-source{font-size:12px;line-height:1.7;padding:10px 12px;background:var(--wb-soft);border-radius:8px;overflow-wrap:anywhere}
.kb-advanced>summary{font-size:12px;color:var(--wb-muted);cursor:pointer}.kb-advanced[open]>summary{margin-bottom:14px}.kb-advanced>label+label{margin-top:14px}.kb-advanced>.kb-help{margin-top:9px}
.kb-bindings{display:flex;flex-direction:column;gap:11px}.kb-form .kb-bindings label{display:flex;flex-direction:row;align-items:center;gap:10px}.kb-bindings label span{overflow-wrap:anywhere}
.kb-decision{display:flex;flex-direction:column;gap:13px;padding:15px;margin-bottom:17px;border-radius:10px;background:var(--wb-soft);font-size:13px}
.kb-import-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px}.kb-import-row>span{flex:1;min-width:120px}.kb-import-row small{color:var(--wb-muted)}.kb-import-row>.kb-inline-error{flex-basis:100%}
.kb-failures{font-size:12px;color:var(--wb-warning);line-height:1.8}.kb-failures summary{cursor:pointer}.kb-failures p{overflow-wrap:anywhere}
.kb-results{padding:0 20px}.kb-result-heading{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--wb-muted);padding:6px 0}.kb-results article{padding:14px 0;border-top:1px solid var(--wb-divider)}.kb-results article>button{font:inherit;font-size:12px;color:var(--wb-text);text-align:left;border:0;padding:0;background:transparent;overflow-wrap:anywhere;cursor:pointer}.kb-results article>p{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--wb-muted);margin-top:8px}
.wb-v2 .wb-knowledge[data-detail=true]{height:100%;min-height:360px;gap:0}
.wb-knowledge[data-detail=true] .kb-detail{flex:1;min-height:0;height:100%;padding:0;gap:12px;background:transparent}
.wb-knowledge .kb-detail-heading{flex:none;flex-wrap:nowrap;gap:10px;min-height:36px}
.wb-knowledge .kb-detail-title{flex:1;min-width:90px}
.wb-knowledge .kb-detail-title h2{font-size:14px}
.wb-knowledge .kb-detail-heading>.kb-search{flex:0 1 360px;min-width:160px;padding:0 5px 0 10px;border-radius:9px}
.wb-knowledge .kb-back{display:grid;place-items:center;width:30px;min-height:30px;padding:5px;flex:none}
.kb-workspace{display:flex;flex:1;min-height:0;overflow:hidden;border:1px solid var(--wb-divider);border-radius:10px;background:var(--wb-panel)}
.kb-workspace>.kb-directory-content{flex:0 0 240px;min-width:150px;max-width:40%;overflow:auto;padding:8px 4px;border-right:1px solid var(--wb-divider);--dsw-alias-bg-base:var(--wb-panel);--dsw-alias-label-primary:var(--wb-text);--dsw-alias-label-secondary:var(--wb-muted);--dsw-alias-interactive-bg-hover:var(--wb-hover);--dsw-specific-sidebar-nav-item-active-accent:var(--wb-brand-soft)}
.kb-directory-content .kb-tree-row{gap:4px;padding-right:4px}
.kb-directory-content .kb-tree-row[data-selected=true]{background:var(--wb-brand-soft);color:var(--wb-brand-ink);border-radius:7px}
.kb-directory-content .kb-file-size,.kb-directory-content .kb-original-only,.kb-directory-content .kb-download{display:none}
.kb-file-preview{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
.kb-file-heading{display:flex;align-items:center;gap:10px;flex:none;min-height:38px;padding:4px 12px;border-bottom:1px solid var(--wb-divider)}
.kb-file-heading>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.kb-file-heading>small{font-size:10px;color:var(--wb-muted);white-space:nowrap}
.kb-file-preview>.wb-resource{flex:1;min-height:0}
.kb-document-view{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.kb-document-view>.wb-resource{flex:1;min-height:0}
.kb-editor-actions{display:flex;align-items:center;gap:7px;flex:none;min-height:34px;padding:4px 10px;border-bottom:1px solid var(--wb-divider);font-size:11px;color:var(--wb-muted)}
.kb-editor-actions .wb-button{min-height:26px;padding:4px 9px;font-size:11px}
.kb-tree-toolbar{display:flex;align-items:center;gap:4px;min-height:32px;padding:0 4px 5px;position:sticky;top:-8px;z-index:2;background:var(--wb-panel)}
.kb-tree-toolbar>span{flex:1;padding-left:7px;font-size:11px;color:var(--wb-muted)}
.kb-tree-toolbar .wb-button{display:grid;place-items:center;width:25px;min-height:25px;padding:4px;border:0}
.kb-directory-content:focus-visible{outline:2px solid var(--wb-focus);outline-offset:-2px}
.kb-directory-content[data-drop-active=true]{box-shadow:inset 0 0 0 2px var(--wb-brand-ink)}
.wb .kb-directory-content button[data-kb-selected=true]{background:var(--wb-brand-soft);color:var(--wb-brand-ink);border-radius:6px}
.wb .kb-directory-content button[data-kb-drop=true]{outline:2px solid var(--wb-brand-ink);outline-offset:-2px;background:var(--wb-brand-soft)}
.kb-file-menu{position:fixed;z-index:1800;display:flex;flex-direction:column;gap:2px;width:190px;padding:5px;border:1px solid var(--wb-divider);border-radius:10px;background:var(--wb-elevated);box-shadow:var(--wb-shadow-soft)}
.wb .kb-file-menu>.wb-button{justify-content:flex-start;min-height:30px;padding:6px 9px;border:0;background:transparent;font-size:12px}
.wb .kb-file-menu>.wb-button:hover,.wb .kb-file-menu>.wb-button:focus-visible{background:var(--wb-hover)}
.wb .kb-file-menu>.kb-file-delete{color:var(--wb-danger)}
.kb-view-message{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:10px;margin:0;padding:24px;font-size:12px;color:var(--wb-muted);text-align:center}
.kb-file-preview>.kb-notice{flex:none;padding:7px 12px;background:var(--wb-soft)}
.kb-directory-content .kb-results{padding:0 8px}
@media(max-width:680px){.wb-knowledge .kb-detail-heading{overflow-x:auto}.wb-knowledge .kb-detail-title>.kb-status{display:none}.kb-workspace>.kb-directory-content{flex-basis:180px;min-width:130px}.wb-knowledge .kb-detail-heading>.kb-search{min-width:160px}.kb-search .wb-button{padding-inline:8px}}
`;
