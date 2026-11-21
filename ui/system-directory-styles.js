export default `
.wb-v2 .wb-spec-info-dialog{width:440px;border-radius:16px}
.wb-v2 .wb-spec-info-dialog>header{padding:16px 20px}
.wb-v2 .wb-spec-info-dialog .wb-modal-body{padding:18px 20px 20px}
.wb-v2 .wb-spec-info-form{gap:18px}
.wb-v2 .wb-spec-info-form label{gap:8px;color:var(--wb-text);font-size:12px;font-weight:500}
.wb-v2 .wb-spec-info-form input,.wb-v2 .wb-spec-info-form textarea{width:100%;padding:10px 12px;border:1px solid var(--wb-divider);border-radius:9px;background:var(--wb-bg);color:var(--wb-text);font:inherit;font-size:13px;font-weight:400;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--wb-text) 3%,transparent)}
.wb-v2 .wb-spec-info-form input{min-height:38px}
.wb-v2 .wb-spec-info-form textarea{min-height:92px;resize:vertical}
.wb-v2 .wb-spec-info-form input:focus-visible,.wb-v2 .wb-spec-info-form textarea:focus-visible{outline:0;border-color:var(--wb-brand-blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--wb-brand-blue) 12%,transparent);background:var(--wb-panel)}
.wb-v2 .wb-spec-info-form footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:4px}
.wb-v2 .wb-spec-info-form footer>span{font-size:11px}
.wb-v2 .wb-spec-info-form footer>.wb-button{width:auto;min-width:72px;padding:7px 18px;border-radius:9px}

.wb-v2 .wb-spec-list-toolbar{flex-wrap:nowrap;gap:12px;overflow-x:auto;flex:none}
.wb-v2 .wb-spec-list-toolbar h2{margin:0;font-size:18px;white-space:nowrap;flex:none}
.wb-v2 .wb-spec-list-toolbar .wb-resource-search{width:240px;min-width:120px;flex:0 1 240px}
.wb-v2 .wb-spec-list-toolbar .wb-resource-actions{flex-wrap:nowrap;flex:none}

.wb-v2 .wb-spec-library{display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0;width:100%}
.wb-v2 .wb-spec-library h2{font-size:22px;margin:0 0 7px;letter-spacing:-.5px}
.wb-v2 .wb-spec-library p{margin:0;line-height:1.7}
.wb-v2 .wb-management.wb-spec-management:has(.has-directory){padding:0}
.wb-v2 .wb-spec-library.has-directory{height:100%;gap:0;overflow:hidden;background:var(--wb-panel);border-radius:0}
.wb-v2 .wb-spec-header{display:flex;align-items:center;gap:14px;padding:10px 16px;min-height:56px;flex:none;min-width:0}
.wb-v2 .wb-spec-header .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;font-size:12px;min-height:34px;padding:7px 12px;border-radius:11px}
.wb-v2 .wb-spec-header .wb-spec-back{padding:7px 0;margin-right:8px;color:var(--wb-muted)}
.wb-v2 .wb-spec-identity{min-width:100px;max-width:420px}
.wb-v2 .wb-spec-library .wb-spec-identity h2{margin:0;font-size:18px;line-height:1.5;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-v2 .wb-spec-identity p{max-width:100%;font-size:12px;color:var(--wb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px}
.wb-v2 .wb-spec-header .wb-icon-button{width:34px;height:34px;padding:8px;flex:none}
.wb-v2 .wb-spec-save-state{margin-left:auto;color:var(--wb-muted);font-size:11px;white-space:nowrap;display:flex;align-items:center;gap:6px}
.wb-v2 .wb-spec-save-state::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--wb-success)}
.wb-v2 .wb-spec-save-state[data-dirty=true]::before{background:#d69d36}
.wb-v2 .wb-spec-header select{width:auto;max-width:150px;min-height:34px;font-size:12px;border:0;background:var(--wb-bg);padding:6px 10px;border-radius:10px}
.wb-v2 .wb-spec-workspace{display:flex;flex:1;min-height:0;overflow:hidden;padding:0 12px 12px;gap:12px}
.wb-v2 .wb-spec-sidebar{width:246px;max-width:34%;display:flex;flex-direction:column;flex:none;background:var(--wb-bg);padding:14px 10px 10px;border-radius:14px;min-height:0}
.wb-v2 .wb-spec-sidebar>header{display:flex;align-items:center;gap:5px;padding:0 8px 14px}
.wb-v2 .wb-spec-sidebar>header strong{font-size:13px;font-weight:600;flex:1}
.wb-v2 .wb-spec-sidebar .wb-icon-button{width:28px;height:28px;min-height:28px;padding:5px;display:grid;place-items:center;border-radius:9px}
.wb-v2 .wb-spec-tree{overflow:auto;flex:1;min-height:0;font-size:13px}
.wb-v2 .wb-spec-tree details{margin-top:6px}
.wb-v2 .wb-spec-tree details>summary{list-style:none;display:flex;align-items:center;gap:8px;padding:9px 10px;min-height:38px;cursor:pointer;color:var(--wb-text);border-radius:10px}
.wb-v2 .wb-spec-tree details>summary:hover{background:var(--wb-panel)}
.wb-v2 .wb-spec-tree details>summary::-webkit-details-marker{display:none}
.wb-v2 .wb-spec-tree details>summary>svg:first-child{color:var(--wb-muted);transition:transform .15s}
.wb-v2 .wb-spec-tree details[open]>summary>svg:first-child{transform:rotate(90deg)}
.wb-v2 .wb-spec-tree details>summary>svg:nth-child(2){color:#d69d36;flex:none}
.wb-v2 .wb-spec-tree .wb-spec-branch{padding-left:19px}
.wb-v2 .wb-spec-file{display:flex;align-items:center;gap:10px;text-align:left;width:100%;min-height:38px;margin:2px 0;padding:9px 12px;border:0;border-radius:10px;background:transparent;color:var(--wb-text);cursor:pointer;font:inherit;min-width:0}
.wb-v2 .wb-spec-file-name,.wb-v2 .wb-spec-tree summary>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.wb-v2 .wb-spec-file-name{display:flex;flex-direction:column;gap:1px}
.wb-v2 .wb-spec-file-name strong{font-size:13px;font-weight:600}
.wb-v2 .wb-spec-file>svg{color:#8a75cf;flex:none}
.wb-v2 .wb-spec-file[data-tone=blue]>svg{color:#4470d8}
.wb-v2 .wb-spec-file[data-tone=amber]>svg{color:#bf8a38}
.wb-v2 .wb-spec-file[data-tone=green]>svg{color:#408f79}
.wb-v2 .wb-spec-file:hover{background:var(--wb-panel)}
.wb-v2 .wb-spec-file.is-selected{background:var(--wb-panel);color:var(--wb-text);font-weight:500;box-shadow:0 2px 10px #00000003}
.wb-v2 .wb-spec-file.is-selected>svg{color:var(--wb-brand-blue)}
.wb-v2 .wb-spec-tree small{font-size:10px;font-weight:400;color:var(--wb-muted)}
.wb-v2 .wb-spec-tree summary>small{margin-left:auto;min-width:15px;text-align:center}
.wb-v2 .wb-spec-required{padding:2px 5px;background:var(--wb-bg);border-radius:5px;margin-left:auto}
.wb-v2 .wb-spec-empty-folder{display:block;padding:6px 10px 8px 30px;font-size:11px;color:var(--wb-muted)}
.wb-v2 .wb-spec-sidebar>footer{display:flex;justify-content:space-between;font-size:10px;color:var(--wb-muted);padding:16px 8px 2px}
.wb-v2 .wb-spec-content{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
.wb-v2 .wb-spec-document-header{display:flex;align-items:center;gap:12px;padding:10px 24px 8px;min-height:60px;flex:none}
.wb-v2 .wb-spec-document-title{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.wb-v2 .wb-spec-document-title>svg{color:var(--wb-brand-blue);flex:none}
.wb-v2 .wb-spec-document-title>div{display:flex;align-items:baseline;gap:10px;min-width:0}
.wb-v2 .wb-spec-document-title strong{font-size:14px;font-weight:600;white-space:nowrap}
.wb-v2 .wb-spec-document-title span{font-size:11px;color:var(--wb-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-v2 .wb-spec-content .wb-spec-modes{display:flex;align-items:center;gap:3px;background:var(--wb-bg);padding:3px;border-radius:11px;flex:none}
.wb-v2 .wb-spec-modes .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:28px;padding:4px 10px;font-size:11px;border:0;background:transparent;color:var(--wb-muted);border-radius:8px}
.wb-v2 .wb-spec-modes .wb-button[aria-pressed=true]{background:var(--wb-panel);color:var(--wb-brand-blue);box-shadow:0 1px 4px #00000008}
.wb-v2 .wb-spec-document-hint{flex:none;padding:0 24px 16px;color:var(--wb-muted);font-size:11px}
.wb-v2 .wb-spec-file-tools{position:relative;flex:none}
.wb-v2 .wb-spec-file-tools>summary{display:grid;place-items:center;list-style:none;width:28px;height:28px;border-radius:9px;cursor:pointer;color:var(--wb-muted)}
.wb-v2 .wb-spec-file-tools>summary:hover{background:var(--wb-bg)}
.wb-v2 .wb-spec-file-tools>summary::-webkit-details-marker{display:none}
.wb-v2 .wb-spec-file-tools>.wb-button{position:absolute;top:34px;right:0;display:flex;align-items:center;gap:8px;z-index:5;min-width:125px;white-space:nowrap;padding:10px 14px;border:0;border-radius:11px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover);font-size:12px}
.wb-v2 .wb-spec-view{display:flex;flex:1;min-width:0;min-height:0;overflow:hidden;border-radius:12px;background:var(--wb-panel)}
.wb-v2 .wb-spec-view>.wb-muted{padding:20px 24px}
.wb-v2 .wb-spec-view>.wb-resource,.wb-v2 .wb-spec-view>.wb-source{flex:1;min-width:0;min-height:0}
.wb-v2 .wb-spec-view .wb-resource{border-radius:0}
.wb-v2 .wb-spec-view .wb-render{font-size:15px;line-height:1.85;padding:20px 24px 48px;scroll-padding-top:20px}
.wb-v2 .wb-spec-view .wb-render>*{max-width:880px}
.wb-v2 .wb-spec-view .wb-render h1{font-size:28px;line-height:1.4;letter-spacing:-.6px;margin:0 0 22px;font-weight:650}
.wb-v2 .wb-spec-view .wb-render h2{font-size:20px;line-height:1.5;margin:32px 0 14px;font-weight:600}
.wb-v2 .wb-spec-view .wb-render h3{font-size:16px;line-height:1.5;margin:24px 0 10px}
.wb-v2 .wb-spec-view .wb-render p{margin:0 0 16px}
.wb-v2 .wb-spec-view .wb-render ul,.wb-v2 .wb-spec-view .wb-render ol{padding-left:22px;margin:0 0 20px}
.wb-v2 .wb-spec-view .wb-render li+li{margin-top:7px}
.wb-v2 .wb-spec-view .wb-render code{font-size:.87em}
.wb-v2 .wb-spec-view .wb-render pre{border-radius:12px;font-size:12px}
.wb-v2 .wb-spec-draft{display:flex;align-items:center;gap:9px;border:0;border-radius:12px;padding:12px 15px;background:var(--wb-panel);color:var(--wb-text);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.wb-v2 .wb-spec-library .wb-resource-actions>label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:12px}
.wb-spec-card-menu{position:relative}
.wb-spec-card-menu>summary{list-style:none;cursor:pointer}
.wb-spec-card-menu>summary::-webkit-details-marker{display:none}
.wb-spec-card-menu-items{position:absolute;right:0;top:calc(100% + 5px);z-index:10;display:flex;flex-direction:column;gap:3px;min-width:145px;padding:6px;border-radius:var(--wb-radius-menu,18px);background:var(--wb-elevated);box-shadow:var(--wb-shadow-hover)}
.wb .wb-spec-card-menu-items>button{display:flex;align-items:center;gap:8px;min-height:32px;padding:7px 10px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;color:var(--wb-text);text-align:left;font:inherit;font-size:12px;white-space:nowrap}
.wb .wb-spec-card-menu-items>button:not(:disabled):hover{background:var(--wb-hover)}
.wb .wb-spec-card-menu-items>button[data-danger=true]{color:var(--wb-danger)}
.wb-resource-cover-label>.wb-spec-platform-tags{display:inline-flex;flex:none;align-items:center;gap:4px;margin-left:2px;overflow:visible}
.wb-spec-platform-tags>span{padding:1px 5px;border-radius:5px;background:var(--wb-brand-soft);color:var(--wb-brand-ink);font-size:9px;line-height:1.5}
.wb-spec-card-platforms{display:flex;flex-direction:column;gap:2px;margin:3px 0;padding:5px 0;border:0;border-top:1px solid var(--wb-divider);border-bottom:1px solid var(--wb-divider)}
.wb-spec-card-platforms legend{padding:3px 10px;color:var(--wb-muted);font-size:10px}
.wb .wb-spec-card-platforms>label{display:flex;flex-direction:row;align-items:center;gap:8px;min-height:30px;padding:5px 10px;border-radius:var(--wb-radius-sm,8px);font-size:12px;cursor:pointer}
.wb .wb-spec-card-platforms>label:hover{background:var(--wb-hover)}
.wb .wb-spec-card-platforms input[type=checkbox]{margin:0;accent-color:var(--wb-brand-ink)}
.wb-spec-card-form>footer{display:flex;justify-content:flex-end;gap:8px}

@media(max-width:900px){
.wb-v2 .wb-management.wb-spec-management:has(.has-directory){padding:0}
.wb-v2 .wb-spec-header{padding:14px;gap:8px;flex-wrap:wrap}
.wb-v2 .wb-spec-identity{flex:1;max-width:none}
.wb-v2 .wb-spec-save-state{margin-left:0}
.wb-v2 .wb-spec-sidebar{width:210px}
.wb-v2 .wb-spec-document-header{padding:8px 14px}
.wb-v2 .wb-spec-document-hint{padding:0 14px 12px}
.wb-v2 .wb-spec-view .wb-render{padding:18px 14px 32px}
.wb-v2 .wb-spec-document-title>div{display:block}
.wb-v2 .wb-spec-document-title span{display:block;margin-top:2px}
}
@media(max-width:600px){
.wb-v2 .wb-spec-back>span{display:none}
.wb-v2 .wb-spec-sidebar{width:170px;max-width:42%;padding-inline:5px}
.wb-v2 .wb-spec-workspace{gap:4px;padding:0 6px 6px}
.wb-v2 .wb-spec-document-header{flex-wrap:wrap;gap:8px}
.wb-v2 .wb-spec-document-title{flex-basis:100%}
.wb-v2 .wb-spec-view .wb-render{font-size:14px}
}
`;
