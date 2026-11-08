export default `
.wb-project-sync{display:flex;flex-direction:column;gap:18px;min-width:0;width:100%}
.wb-sync-heading{display:flex;align-items:flex-start;gap:14px;justify-content:space-between;flex-wrap:wrap}
.wb-sync-heading h2{font-size:17px;font-weight:600}.wb-sync-heading p{font-size:12px;line-height:1.8;color:var(--wb-muted);margin-top:6px}
.wb-sync-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.wb-sync-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:8px;font-size:11px;background:var(--wb-soft);color:var(--wb-muted)}
.wb-sync-badge[data-tone=success]{background:var(--wb-brand-soft);color:var(--wb-brand-ink)}.wb-sync-badge[data-tone=warning]{background:var(--wb-warning-bg);color:var(--wb-warning)}
.wb-sync-surface{display:flex;flex-direction:column;gap:16px;min-width:0;padding:22px;border-radius:16px;background:var(--wb-panel);box-shadow:var(--wb-shadow-soft)}
.wb-sync-repository{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.wb-sync-repository>div{flex:1;min-width:min(220px,100%)}
.wb-sync-repository strong{font-size:14px;font-weight:550;overflow-wrap:anywhere}.wb-sync-repository code{display:block;font-size:11px;color:var(--wb-muted);margin-top:7px;overflow-wrap:anywhere;white-space:normal}
.wb-sync-metrics{display:flex;gap:12px;flex-wrap:wrap}.wb-sync-metrics>div{display:flex;align-items:baseline;gap:8px;padding:10px 13px;border-radius:11px;background:var(--wb-soft)}.wb-sync-metrics strong{font-size:19px;font-weight:600}.wb-sync-metrics span{font-size:12px;color:var(--wb-muted)}
.wb-sync-note{padding:12px 15px;border-radius:11px;background:var(--wb-soft);font-size:12px;line-height:1.8;color:var(--wb-muted);overflow-wrap:anywhere;white-space:pre-wrap}
.wb-sync-warning{background:var(--wb-warning-bg);color:var(--wb-warning)}
.wb-sync-muted{font-size:12px;line-height:1.8;color:var(--wb-muted);overflow-wrap:anywhere}
.wb-sync-changes{display:flex;flex-direction:column;max-height:310px;overflow:auto;min-width:0}.wb-sync-change{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--wb-divider);font-size:12px}.wb-sync-change:last-child{border-bottom:0}.wb-sync-change code{flex:1;min-width:0;overflow-wrap:anywhere;white-space:normal}.wb-sync-change span{flex-shrink:0;color:var(--wb-muted);font-size:11px}
.wb-sync-form{display:flex;flex-direction:column;gap:17px;min-width:0}.wb-sync-form label{display:flex;flex-direction:column;gap:8px;font-size:12px}.wb-sync-form label.wb-sync-check{flex-direction:row;align-items:center;gap:9px}.wb-sync-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.wb-sync-form input,.wb-sync-form textarea,.wb-sync-form select{width:100%;min-width:0}.wb-sync-form input[type=checkbox]{width:auto}.wb-sync-form footer{display:flex;justify-content:flex-end;align-items:center;gap:9px;flex-wrap:wrap}
.wb-sync-branches{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.wb-sync-branches>label{flex:1;min-width:140px}
.wb-sync-ssh{display:flex;flex-direction:column;gap:13px;min-width:0}.wb-sync-ssh>summary{cursor:pointer;color:var(--wb-muted);font-size:12px}.wb-sync-ssh[open]>summary{margin-bottom:14px}
.wb-sync-profile{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:13px;border-radius:11px;background:var(--wb-soft)}.wb-sync-profile>div{flex:1;min-width:140px}.wb-sync-profile strong{font-size:12px}.wb-sync-profile code{display:block;overflow-wrap:anywhere;white-space:normal;font-size:11px;line-height:1.8;color:var(--wb-muted);margin-top:5px}
.wb-sync-public-key{width:100%;font-family:monospace;font-size:11px;line-height:1.8;overflow-wrap:anywhere;white-space:pre-wrap;padding:13px;border-radius:10px;background:var(--wb-soft);max-height:200px;overflow:auto}
.wb-sync-decision{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:11px;background:var(--wb-soft);margin-bottom:16px}
.wb-sync-trust{display:flex;flex-direction:column;gap:13px}.wb-sync-trust code{font-size:12px;line-height:1.8;overflow-wrap:anywhere;white-space:normal}
@media(max-width:680px){.wb-sync-surface{padding:17px}.wb-sync-form-grid{grid-template-columns:minmax(0,1fr)}.wb-sync-metrics{gap:8px}.wb-sync-metrics>div{flex:1;padding:10px}.wb-sync-heading>.wb-sync-actions{width:100%}}
`;
