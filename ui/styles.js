export default `
/* Theme-neutral fallbacks; Arc-inspired light/dark tokens are applied at the root. */
.wb{
  color-scheme:only light;
  --wb-bg:#fafafa;
  --wb-panel:#ffffff;
  --wb-elevated:#ffffff;
  --wb-soft:#f2f2f4;
  --wb-canvas:#ededf0;
  --wb-border:#e2e2e6;
  --wb-border-strong:#cdcdD3;
  --wb-text:#28282d;
  --wb-muted:#696971;
  --wb-faint:#75757e;
  --wb-accent:#6840bd;
  --wb-primary:#7046c5;
  --wb-primary-hover:#5c35ae;
  --wb-on-primary:#ffffff;
  --wb-danger:#b42318;
  --wb-shadow:0 4px 18px #202c2508;
  box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;
  padding-top:var(--dsh-frame-top-clearance,0px);display:flex;flex-direction:column;
  overflow:hidden;background:var(--wb-bg);color:var(--wb-text);
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;
  font-size:13px;line-height:1.5;isolation:isolate;-webkit-font-smoothing:antialiased;
}
.wb *{box-sizing:border-box}
.wb button,.wb input,.wb select,.wb textarea{font:inherit;color:inherit}
.wb button{cursor:pointer}
.wb button:disabled{opacity:.45;cursor:default}
.wb button:focus-visible,.wb input:focus-visible,.wb textarea:focus-visible,.wb select:focus-visible{outline:2px solid var(--wb-accent);outline-offset:1px}
.wb input,.wb textarea,.wb select{background:var(--wb-bg);border:1px solid var(--wb-border);border-radius:6px;padding:7px 9px;min-width:0}
.wb input:not([type=checkbox]):not([type=range]),.wb textarea{width:100%}
.wb textarea{resize:vertical;line-height:1.6}
.wb h1,.wb h2,.wb h3,.wb p{margin:0}
.wb h1{font-size:25px;letter-spacing:-.03em}
.wb h2{font-size:19px}
.wb h3{font-size:14px}
.wb pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}
.wb label{display:flex;flex-direction:column;gap:5px;color:var(--wb-muted);font-size:12px}
.wb label.wb-row{flex-direction:row;align-items:center;justify-content:space-between}
.wb .wb-ai-target label.wb-row>select{flex:1;min-width:0;max-width:190px;margin-left:12px}
.wb .wb-ai-target{gap:8px;padding:13px 14px}
.wb a{color:var(--wb-accent)}
.wb-row{display:flex;align-items:center;gap:8px;min-width:0}
.wb-stack{display:flex;flex-direction:column;gap:12px;min-width:0}
.wb-grow{flex:1;min-width:0}
.wb-muted{color:var(--wb-muted);font-size:12px}
.wb-ellipsis{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb .wb-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;flex-shrink:0;border:1px solid var(--wb-border);background:var(--wb-bg);color:var(--wb-text);border-radius:8px;padding:6px 11px;white-space:nowrap;font-weight:500;line-height:20px;transition:background-color .15s,border-color .15s,color .15s}
.wb .wb-button:not(:disabled):hover{background:var(--wb-soft);border-color:var(--wb-border-strong)}
.wb .wb-button[aria-pressed=true]{background:var(--wb-soft);color:var(--wb-accent);border-color:transparent}
/* More specific than the generic .wb button color reset, including hover/focus. */
.wb .wb-button.wb-primary{background:var(--wb-primary);color:var(--wb-on-primary);border-color:transparent;font-weight:600;padding-inline:14px}
.wb .wb-button.wb-primary:not(:disabled):hover{background:var(--wb-primary-hover);color:var(--wb-on-primary)}
.wb .wb-button.wb-primary:not(:disabled):active{filter:brightness(.94)}
.wb .wb-button.wb-ghost{background:transparent;border-color:transparent;color:var(--wb-muted);box-shadow:none}
.wb .wb-button.wb-ghost:not(:disabled):hover{background:var(--wb-soft);color:var(--wb-text)}
.wb .wb-icon-button{width:32px;min-height:32px;padding:6px}
.wb svg{flex-shrink:0;vertical-align:middle}
.wb .plant-logo{display:inline-block;flex-shrink:0;border-radius:23%;vertical-align:middle;overflow:hidden}
.wb-chip{display:inline-flex;align-items:center;gap:4px;background:var(--wb-soft);border:1px solid var(--wb-border);border-radius:6px;padding:2px 7px;font-size:11px;max-width:100%}
.wb-top{min-height:62px;flex-shrink:0;padding:12px 24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid var(--wb-border);background:var(--wb-bg)}
.wb-brand-lockup{display:flex;align-items:center;gap:10px;flex-shrink:0}
.wb-brand{font-weight:650;font-size:18px;letter-spacing:-.04em}
.wb-brand-context{border-left:1px solid var(--wb-border);padding-left:16px;color:var(--wb-muted);font-size:12px;white-space:nowrap}
.wb .wb-top-group-toggle{margin-left:2px}
.wb-top-actions{display:flex;align-items:center;gap:8px;margin-left:auto}
.wb-project-tabs{display:flex;align-items:center;gap:4px;padding:6px 18px;border-bottom:1px solid var(--wb-border);flex-shrink:0;overflow:auto;background:var(--wb-bg);scrollbar-width:thin}
.wb-project-tabs .wb-button{border-color:transparent;background:transparent;min-height:30px}
.wb-project-tabs .wb-button[aria-pressed=true]{background:var(--wb-soft);color:var(--wb-accent)}
.wb-body{position:relative;display:flex;flex:1;min-height:0;min-width:0;overflow:hidden}
.wb-groups{width:216px;padding:22px 12px 12px;border-right:1px solid var(--wb-border);display:flex;flex-direction:column;gap:16px;background:var(--wb-panel);flex-shrink:0;min-height:0}
.wb-groups-heading{display:flex;align-items:center;justify-content:space-between;padding:0 7px;flex-shrink:0;color:var(--wb-muted);font-size:11px;letter-spacing:.04em;font-weight:600}
.wb-group-list{display:flex;flex:1;min-height:40px;flex-direction:column;gap:4px;overflow:auto;scrollbar-width:thin}
.wb-group-row{display:flex;align-items:center;gap:3px;min-width:0}
.wb .wb-group{width:100%;min-width:0;text-align:left;display:flex;align-items:center;gap:10px;min-height:40px;border:0;background:transparent;border-radius:8px;padding:9px 11px;color:var(--wb-muted);font-size:13px;transition:background-color .15s,color .15s}
.wb .wb-group:hover{background:var(--wb-soft);color:var(--wb-text)}
.wb .wb-group[aria-pressed=true]{background:var(--wb-soft);color:var(--wb-accent);font-weight:600}
.wb-group-count{font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--wb-faint);padding-left:4px}
.wb-group-tools{display:flex;flex-direction:column;gap:3px;padding-top:14px;border-top:1px solid var(--wb-border);flex-shrink:0}
.wb-library-location{border:1px solid var(--wb-border);border-radius:10px;padding:11px 10px;background:var(--wb-bg);flex-shrink:0;margin-top:2px}
.wb-library-heading{display:flex;align-items:center;gap:8px;color:var(--wb-muted);font-size:11px;margin-bottom:4px}
.wb-library-heading>span{flex:1}
.wb-library-dot{width:5px;height:5px;border-radius:50%;background:var(--wb-accent);flex-shrink:0}
.wb-library-name{display:flex;align-items:center;gap:6px;min-width:0}
.wb-library-name strong{flex:1;min-width:0;font-size:12px;font-weight:500}
.wb .wb-library-action{min-height:25px;padding:2px 5px;font-size:11px;gap:3px}
.wb-management{flex:1;min-width:0;min-height:0;overflow:auto;padding:38px clamp(24px,4vw,64px) 32px}
.wb-manager-content{max-width:1180px;min-height:100%;margin:0 auto;display:flex;flex-direction:column}
.wb-manager-head{display:flex;align-items:center;gap:20px;margin-bottom:27px;flex-shrink:0}
.wb-manager-head h1{font-size:27px;font-weight:650;letter-spacing:-.045em;line-height:1.4}
.wb-manager-head .wb-stack{gap:8px}
.wb-manager-head p{font-size:13px;color:var(--wb-muted)}
.wb-manager-tools{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:22px;border-bottom:1px solid var(--wb-border);margin-bottom:26px;flex-shrink:0}
.wb-search-field{display:flex;align-items:center;gap:9px;border:1px solid var(--wb-border);border-radius:9px;background:var(--wb-panel);padding:0 12px;width:310px;max-width:100%;color:var(--wb-faint)}
.wb .wb-search-field input{border:0;background:transparent;outline:none;box-shadow:none;min-height:37px;padding:8px 0;color:var(--wb-text);font-size:12px}
.wb .wb-search-field:focus-within{outline:2px solid color-mix(in srgb,var(--wb-accent) 35%,transparent);border-color:var(--wb-accent);outline-offset:1px}
.wb .wb-search-field input:focus-visible{outline:none}
.wb-project-count{font-size:12px;color:var(--wb-faint);white-space:nowrap}
.wb-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:20px;align-content:start}
.wb-card{border:1px solid var(--wb-border);border-radius:14px;padding:21px;background:var(--wb-bg);display:flex;flex-direction:column;gap:14px;min-height:248px;box-shadow:var(--wb-shadow);transition:border-color .15s,box-shadow .15s}
.wb-card:hover{border-color:color-mix(in srgb,var(--wb-accent) 42%,var(--wb-border));box-shadow:0 6px 22px color-mix(in srgb,var(--wb-text) 6%,transparent)}
.wb-card-icon{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--wb-border);border-radius:10px;color:var(--wb-accent);background:var(--wb-panel)}
.wb-card h3{font-size:15px;font-weight:600;letter-spacing:-.02em;overflow-wrap:anywhere}
.wb-card-description{flex:1;color:var(--wb-muted);font-size:12px;line-height:1.75;overflow-wrap:anywhere}
.wb-card-footer{display:flex;align-items:center;gap:7px;border-top:1px solid var(--wb-border);padding-top:14px}
.wb-card-footer select{max-width:45%;font-size:11px}
.wb-manager-empty{flex:1;min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px 70px;gap:16px}
.wb-empty-brand{display:grid;place-items:center;width:80px;height:80px;margin-bottom:5px;border:1px solid var(--wb-border);border-radius:22px;background:var(--wb-elevated);box-shadow:var(--wb-shadow)}
.wb-manager-empty h2{font-size:22px;font-weight:600;letter-spacing:-.035em}
.wb-manager-empty p{max-width:370px;font-size:13px;line-height:1.85;color:var(--wb-muted);text-wrap:balance}
.wb-manager-empty>.wb-button{margin-top:4px;min-height:38px;padding-inline:18px}
.wb-empty-steps{display:flex;align-items:center;gap:22px;margin-top:15px;color:var(--wb-faint);font-size:11px}
.wb-empty-steps>span{display:flex;align-items:center;gap:6px}
.wb .ec{--ec-bg:var(--wb-canvas);--ec-panel:var(--wb-bg);--ec-soft:var(--wb-soft);--ec-text:var(--wb-text);--ec-muted:var(--wb-muted);--ec-border:var(--wb-border);--ec-brand:var(--wb-accent)}
.wb .ds{--d-bg:var(--wb-bg);--d-panel:var(--wb-panel);--d-soft:var(--wb-soft);--d-border:var(--wb-border);--d-text:var(--wb-text);--d-muted:var(--wb-muted);--d-accent:var(--wb-accent)}
.wb-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--wb-border);min-height:48px;background:var(--wb-panel);flex-shrink:0}
.wb-workspace{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}
.wb-editor-row{position:relative;flex:1;display:flex;min-height:0;min-width:0}
.wb-navigation{display:flex;flex-direction:column;width:244px;min-width:150px;flex-shrink:0;position:relative;border-right:1px solid var(--wb-border);background:var(--wb-panel)}
.wb-nav-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:8px;border-bottom:1px solid var(--wb-border)}
.wb-nav-tabs button{font-size:11px;padding:4px 3px}
.wb-nav-content{padding:9px;overflow:auto;flex:1;min-height:0}
.wb-nav-item{display:flex;align-items:center;gap:5px;min-height:30px;width:100%;border:0;background:transparent;text-align:left;padding:5px 7px;border-radius:5px}
.wb-nav-item:hover,.wb-nav-item[aria-current=true]{background:var(--wb-soft)}
.wb-nav-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-nav-search{padding:8px}
.wb-resizer{position:absolute;right:-3px;top:0;bottom:0;width:6px;cursor:col-resize;z-index:8}
.wb-resizer:hover{background:var(--wb-accent)}
.wb-content{display:flex;flex-direction:column;min-width:0;flex:1;min-height:0;overflow:hidden}
.wb-content-tabs{display:flex;align-items:stretch;flex-shrink:0;min-height:37px;background:var(--wb-panel);border-bottom:1px solid var(--wb-border)}
.wb-tab-scroll{display:flex;flex:1;overflow:auto;scrollbar-width:thin}
.wb-content-tab{display:flex;align-items:center;gap:3px;border-right:1px solid var(--wb-border);border-bottom:2px solid transparent;min-width:90px;max-width:260px;padding:0 5px 0 9px;flex-shrink:0}
.wb-content-tab[aria-selected=true]{background:var(--wb-bg);border-bottom-color:var(--wb-accent)}
.wb-content-tab>button{border:0;background:transparent;padding:4px;color:inherit;min-width:0}
.wb-content-tab[data-preview=true] .wb-tab-name{font-style:italic}
.wb-tab-name{max-width:195px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-tabpanel{flex:1;min-height:0;min-width:0;display:flex;position:relative;overflow:hidden}
.wb-resource{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}
.wb-resource-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:7px 10px;border-bottom:1px solid var(--wb-border);background:var(--wb-panel);flex-shrink:0}
.wb-resource-body{flex:1;display:flex;min-height:0;min-width:0;overflow:hidden}
.wb-source{flex:1;min-width:0;overflow:auto;background:var(--wb-bg);font:12px/1.7 ui-monospace,SFMono-Regular,monospace}
.wb-source .cm-editor{height:100%}
.wb-source .cm-scroller{overflow:auto}
.wb-render{flex:1;min-width:0;overflow:auto;padding:26px 32px;line-height:1.8}
.wb-render table{border-collapse:collapse;max-width:100%}
.wb-render td,.wb-render th{border:1px solid var(--wb-border);padding:6px 10px}
.wb-render pre{padding:14px;background:var(--wb-soft);overflow:auto;white-space:pre;font-size:12px}
.wb-render img{max-width:100%}
.wb-render h1,.wb-render h2,.wb-render h3{margin:18px 0 10px}
.wb-heading-nav{width:160px;flex-shrink:0;padding:16px 10px;overflow:auto;border-right:1px solid var(--wb-border)}
.wb-heading-nav a{display:block;font-size:11px;padding:4px;text-decoration:none;color:var(--wb-muted)}
.wb-document-frame{border:0;width:100%;height:100%;background:var(--wb-bg)}
.wb-image-stage{flex:1;overflow:auto;display:flex;position:relative;align-items:center;justify-content:center;touch-action:none;background-color:var(--wb-bg);background-image:conic-gradient(var(--wb-soft) 25%,transparent 0 50%,var(--wb-soft) 0 75%,transparent 0);background-size:20px 20px}
.wb-image-stage img,.wb-image-stage canvas{max-width:none;flex-shrink:0;user-select:none}
.wb-media{margin:auto;max-width:95%;max-height:80%}
.wb-ai{width:328px;min-width:328px;max-width:328px;display:flex;flex-direction:column;border-left:1px solid var(--wb-border);background:var(--wb-panel);z-index:10;flex-shrink:0}
.wb-ai-header{padding:12px;border-bottom:1px solid var(--wb-border)}
.wb-ai-target{padding:10px 12px;border-bottom:1px solid var(--wb-border);font-size:11px;display:flex;flex-direction:column;gap:5px}
.wb-ai-messages{flex:1;min-height:70px;overflow:auto;padding:16px 13px;display:flex;flex-direction:column;gap:14px}
.wb-message{padding:11px;border:1px solid var(--wb-border);border-radius:8px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.wb-message[data-role=user]{background:var(--wb-soft);margin-left:18px}
.wb-message[data-role=assistant]{margin-right:6px}
.wb-ai-compose{padding:12px;border-top:1px solid var(--wb-border);display:flex;flex-direction:column;gap:8px}
.wb-ai-compose textarea{min-height:106px;max-height:300px;resize:vertical;background:var(--wb-bg)}
.wb-references{display:flex;gap:5px;flex-wrap:wrap;max-height:96px;overflow:auto}
.wb-reference{max-width:100%;display:flex;gap:4px;align-items:center;border:1px solid var(--wb-border);border-radius:5px;padding:3px 5px;background:var(--wb-soft);font-size:11px}
.wb-reference button{border:0;background:none;padding:0;color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-status{min-height:27px;padding:4px 11px;border-top:1px solid var(--wb-border);display:flex;gap:15px;flex-wrap:wrap;font-size:10px;color:var(--wb-muted);background:var(--wb-panel);flex-shrink:0}
.wb-error{display:flex;gap:8px;align-items:flex-start;padding:9px 12px;background:var(--wb-soft);color:var(--wb-danger);border-bottom:1px solid var(--wb-border);font-size:12px;max-height:180px;overflow:auto}
.wb-error>div{flex:1}
.wb-empty{margin:auto;max-width:600px;padding:40px 24px;text-align:center;display:flex;flex-direction:column;gap:15px;align-items:center}
.wb-empty-symbol{font-size:45px;color:var(--wb-accent);line-height:1}
.wb-modal-wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:90;background:light-dark(#202c2540,#00000080);backdrop-filter:blur(3px);padding:20px}
.wb-modal{width:500px;max-width:100%;max-height:94%;display:flex;flex-direction:column;background:var(--wb-panel);border:1px solid var(--wb-border);box-shadow:0 12px 70px color-mix(in srgb,var(--wb-text) 18%,transparent);border-radius:12px;overflow:hidden}
.wb-modal>header{padding:14px 20px;border-bottom:1px solid var(--wb-border);flex-shrink:0;font-size:14px}
.wb-modal-body{padding:20px;min-height:0;overflow:auto}
.wb-dialog-project{width:600px}
.wb-dialog-project .wb-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:16px}
.wb-dialog-project .wb-form>label[data-field],.wb-dialog-project .wb-form>div,.wb-dialog-project .wb-form>p,.wb-dialog-project .wb-form>footer,.wb-dialog-project .wb-form>.wb-button{grid-column:1/-1}
.wb-dialog-project textarea{height:72px;min-height:60px}
.wb-dialog-project .wb-form>footer{margin-top:4px;border-top:1px solid var(--wb-border);padding-top:16px}
.wb-wide{width:min(1120px,96vw)}
.wb-form{display:flex;flex-direction:column;gap:14px}
.wb-form footer{display:flex;justify-content:flex-end;gap:8px;padding-top:9px}
.wb-menu{position:absolute;top:39px;right:8px;z-index:40;background:var(--wb-panel);border:1px solid var(--wb-border);border-radius:8px;padding:6px;max-height:60vh;overflow:auto;box-shadow:0 6px 25px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb-menu button{display:block;width:100%;text-align:left;margin:2px 0}
.wb-comparison{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.wb-compare-panels{display:flex;position:relative;flex:1;min-height:250px;overflow:hidden}
.wb-compare-panel{flex:1;min-width:0;overflow:auto;position:relative;border-right:1px solid var(--wb-border)}
.wb-compare-panel img{display:block;max-width:none;transform-origin:top left}
.wb-compare-panel iframe{width:100%;height:100%;min-height:400px;border:0}
.wb-compare-overlay{position:absolute;inset:0;pointer-events:none}
.wb-region{position:absolute;border:2px solid var(--wb-accent);background:color-mix(in srgb,var(--wb-accent) 12%,transparent);pointer-events:none}
.wb-focus .wb-navigation,.wb-focus .wb-ai,.wb-fullscreen .wb-navigation,.wb-fullscreen .wb-ai{display:none}
.wb-fullscreen .wb-top,.wb-fullscreen .wb-project-tabs{display:none}
.wb-shortcuts{font-size:10px;color:var(--wb-muted)}
.wb-runtime-log{font:11px/1.65 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;max-height:350px;padding:12px;background:var(--wb-bg);border:1px solid var(--wb-border);border-radius:5px}
.wb-operation-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.wb-binary-info{padding:24px;max-width:650px;margin:auto}
.wb .wb-tree details>summary{cursor:pointer;padding:5px 3px}
.wb .wb-tree details>div{padding-left:12px}
.wb .wb-tabpanel>[hidden]{display:none!important}
.wb-drawer-toggle{display:none}

.wb .cm-mergeView{height:100%;overflow:auto}
.wb .cm-mergeViewEditors{height:100%}
.wb .hljs-keyword,.wb .hljs-selector-tag,.wb .hljs-title,.wb .hljs-attr{color:var(--wb-accent)}
.wb .hljs-comment,.wb .hljs-quote{color:var(--wb-muted);font-style:italic}
.wb .hljs-string,.wb .hljs-literal,.wb .hljs-number{color:var(--wb-text)}
.wb .hljs-section,.wb .hljs-strong{font-weight:650}
.wb .wb-groups{overflow-y:auto}

@media(max-width:1150px){.wb-toolbar .wb-binding-label{max-width:150px}
.wb-navigation{width:210px}
.wb-toolbar{gap:4px}
.wb-toolbar .wb-button{font-size:11px;padding:4px 6px}
}

@media(max-width:950px){.wb-navigation{position:absolute;left:0;top:0;bottom:0;z-index:25;box-shadow:8px 0 30px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb-drawer-toggle{display:inline-flex}
.wb-management{padding:25px 20px}
.wb-groups{width:175px}
.wb-top .wb-muted{display:none}
}

@media(max-width:680px){.wb-ai{position:absolute;right:0;top:0;bottom:0;box-shadow:-8px 0 30px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb-groups{width:140px;padding:10px 6px}
.wb-management{padding:20px 12px}
.wb-manager-head{flex-wrap:wrap}
.wb-operation-grid{grid-template-columns:1fr}
.wb-heading-nav{width:110px}
.wb-render{padding:16px}
.wb-card-grid{grid-template-columns:1fr}
}

.wb .wb-body{position:relative}
.wb .wb-manager-groups{position:relative}
.wb .wb-ai-frame{position:relative;display:flex;flex:0 0 auto;min-width:0;max-width:calc(100% - 48px);height:100%}
.wb .wb-ai-frame .wb-ai{position:static;width:100%;min-width:0;max-width:none;height:100%;flex:1}
.wb .wb-group-backdrop,.wb .wb-ai-backdrop{display:none}
.wb.wb-focus .wb-ai-frame,.wb.wb-fullscreen .wb-ai-frame,.wb.wb-focus .wb-ai-backdrop,.wb.wb-fullscreen .wb-ai-backdrop{display:none}
.wb [role=separator]:focus-visible{outline:2px solid var(--wb-accent);outline-offset:-2px;background:var(--wb-soft)}

@media(max-width:950px){.wb .wb-manager-groups{position:absolute;left:0;top:0;bottom:0;z-index:36;max-width:calc(100% - 48px);box-shadow:8px 0 30px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb .wb-group-backdrop{display:block;position:absolute;inset:0;border:0;border-radius:0;background:#0004;z-index:35}
.wb .wb-ai-frame{position:absolute;right:0;top:0;bottom:0;z-index:36;box-shadow:-8px 0 30px color-mix(in srgb,var(--wb-text) 12%,transparent)}
.wb .wb-ai-backdrop{display:block;position:absolute;inset:0;border:0;border-radius:0;background:#0004;z-index:35}
}

.wb input::placeholder,.wb textarea::placeholder{color:var(--wb-faint);opacity:1}
.wb input[type=checkbox],.wb input[type=range]{accent-color:var(--wb-accent)}
.wb input,.wb textarea,.wb select{border-radius:8px}
.wb ::selection{background:color-mix(in srgb,var(--wb-accent) 24%,transparent)}
@media(max-width:680px){
  .wb-top{padding:10px 14px;gap:10px;min-height:58px}
  .wb-manager-head{gap:16px;margin-bottom:22px}
  .wb-manager-head h1{font-size:24px}
  .wb-manager-tools{gap:12px;margin-bottom:20px}
  .wb-manager-empty{min-height:320px;padding:28px 12px 44px}
  .wb-manager-empty h2{font-size:20px}
  .wb-empty-steps{gap:16px;flex-wrap:wrap;justify-content:center}
  .wb-card{padding:18px}
}
@media(max-width:520px){
  .wb-brand-context{display:none}
  .wb-top-actions{gap:2px}
  .wb .wb-return-chat{font-size:12px;padding-inline:8px}
  .wb-empty-steps{gap:12px}
}
@media(prefers-reduced-motion:reduce){
  .wb .wb-button,.wb .wb-group,.wb-card{transition:none}
}
`;
