export default `
.wb-v2 .wb-project-management{flex-direction:column;padding:24px;scrollbar-width:none}
.wb-project-management::-webkit-scrollbar{display:none}
.wb-projects-page{display:flex;flex:1;flex-direction:column;gap:20px;min-width:0;min-height:0;width:100%;max-width:none;margin:0;container:wb-projects / inline-size}
.wb-v2 .wb-projects-head{gap:12px;margin:0;flex-wrap:wrap;justify-content:space-between}
.wb-projects-head>.wb-primary{margin-left:auto}
.wb-projects-search{display:flex;align-items:center;gap:8px;width:280px;max-width:100%;min-height:38px;padding:0 12px;background:var(--wb-soft);color:var(--wb-muted);border-radius:var(--wb-radius,12px)}
.wb-v2 .wb-projects-search input{flex:1;min-width:0;width:100%;padding:9px 0;border:0;outline:0;background:transparent;box-shadow:none;font-size:12px}
.wb-v2 .wb-projects-search input:focus-visible{outline:none}
.wb-projects-search:focus-within{box-shadow:inset 0 0 0 1px var(--wb-faint)}
.wb-projects-search>button{display:grid;place-items:center;border:0;background:transparent;padding:4px;color:var(--wb-muted);border-radius:var(--wb-radius-sm,8px)}
.wb-projects-groups{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.wb.wb-v2 .wb-projects-groups>button{display:inline-flex;align-items:center;gap:5px;max-width:100%;min-height:32px;padding:6px 11px;border:0;border-radius:var(--wb-radius-sm,8px);background:transparent;background-image:none;box-shadow:none;color:var(--wb-muted);font:inherit;font-size:12px;overflow-wrap:anywhere}
.wb.wb-v2 .wb-projects-groups>button:hover{background:var(--wb-hover);color:var(--wb-text)}
.wb.wb-v2 .wb-projects-groups>button[aria-pressed=true]{background:var(--wb-brand-soft);background-image:none;color:var(--wb-brand-ink);box-shadow:none;font-weight:550}
.wb-projects-groups>.wb-projects-add-group{color:var(--wb-faint)}
.wb-projects-groups>.wb-projects-group-settings{padding:6px 8px}
.wb-projects-create{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:14px;background:var(--wb-panel);border:0;border-radius:var(--wb-radius,12px);box-shadow:var(--wb-shadow-soft)}
.wb-v2 .wb-projects-create>input{flex:1 1 180px;width:auto;min-width:100px;padding:10px 12px}
.wb-v2 .wb-projects-create>select{max-width:220px;min-height:38px;padding:8px 12px}
.wb-v2 .wb-projects-create .wb-button.wb-primary:not(:disabled){background:var(--wb-brand-action);color:var(--wb-on-brand)}
.wb-v2 .wb-projects-create .wb-button.wb-primary:not(:disabled):hover{background:var(--wb-brand-action-hover)}
.wb-projects-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:18px 16px;width:100%;max-width:none}
@container wb-projects (max-width:520px){.wb-projects-grid{grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))}}
.wb-projects-empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:240px;padding:36px 16px;color:var(--wb-faint);text-align:center}
.wb-projects-empty>span{font-size:13px;color:var(--wb-muted)}
@media(max-width:680px){
 .wb-projects-page{gap:17px}
 .wb-v2 .wb-project-management{padding:18px}
 .wb-projects-search{flex:1 1 150px;min-width:0;width:auto}
 .wb-projects-create>input{flex-basis:100%}
 .wb-projects-create>select{flex:1;min-width:100px}
 .wb-projects-grid{gap:12px}
}
.wb-project-recovery{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:22px;border:1px solid var(--wb-divider);border-radius:var(--wb-radius,12px);background:var(--wb-panel)}
.wb-project-recovery h3,.wb-project-recovery p{margin:0;overflow-wrap:anywhere}
`;
