// AIPanel owns these rules in both layouts; all selectors stay inside the panel.
// The parent owns panel placement, width and drag handles.
export const aiDockStyles = `
.wb .wb-ai.wb-ai-dock,.wb .wb-ai.wb-ai-sidebar{min-height:0;overflow:hidden;container-type:inline-size}
@container(max-width:450px){.wb-ai .wb-native-compose-permission .wb-native-compose-label{display:none}.wb-ai .wb-designer-compose-system-label{max-width:58px}.wb-ai .wb-designer-compose-left,.wb-ai .wb-designer-compose-right,.wb-ai .wb-designer-compose-native{gap:2px}.wb-ai .wb-native-compose-control{padding-inline:5px}}
.wb .wb-ai [hidden]{display:none}
.wb .wb-ai .wb-ai-header{flex:0 0 auto;flex-wrap:wrap;gap:6px;min-width:0}
.wb .wb-ai .wb-ai-layout-switch{display:flex;align-items:center;gap:2px;flex-shrink:0}
.wb .wb-ai .wb-ai-layout-switch .wb-button,.wb .wb-ai .wb-ai-history-toggle{min-height:28px;padding:3px 6px;font-size:11px}
.wb .wb-ai .wb-ai-layout-switch .wb-button[aria-pressed=true]{background:var(--wb-soft);color:var(--wb-accent);border-color:var(--wb-border)}
.wb .wb-ai .wb-ai-conversation{position:relative;display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;overflow:hidden}
.wb .wb-ai .wb-ai-messages{flex:1 1 0;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scroll-padding-bottom:40px}
.wb .wb-ai .wb-ai-messages>*{flex-shrink:0}
.wb .wb-ai .wb-message{overflow-wrap:anywhere;min-width:0}
.wb .wb-ai .wb-ai-empty{padding:4px 0;line-height:1.7}
.wb .wb-ai .wb-ai-jump-latest{position:absolute;bottom:8px;right:12px;min-height:28px;padding:3px 10px;font-size:11px;box-shadow:var(--wb-shadow);background:var(--wb-bg)}
.wb .wb-ai .wb-ai-task-status{display:flex;flex-direction:column;flex:0 0 auto;gap:2px;padding:7px 13px;border-top:1px solid var(--wb-border);font-size:11px;color:var(--wb-muted);overflow-wrap:anywhere;max-height:100px;overflow:auto}
.wb .wb-ai .wb-ai-task-status>strong{font-weight:500}
.wb .wb-ai .wb-ai-task-status[data-state=completed]{color:var(--wb-accent)}
.wb .wb-ai .wb-ai-task-status[data-state=error]{color:var(--wb-danger)}
.wb .wb-ai .wb-ai-compose{flex:0 0 auto;min-width:0;min-height:0}
.wb .wb-ai .wb-error{flex-shrink:0;overflow-wrap:anywhere}
.wb .wb-ai.wb-ai-sidebar{position:relative;inset:auto;width:100%;min-width:0;max-width:none;flex:1 1 auto;height:100%;max-height:100%;border:1px solid var(--wb-border);border-radius:14px;box-shadow:var(--wb-shadow-soft)}
.wb .wb-ai .wb-ai-sidebar-target-toggle{display:flex;justify-content:space-between;flex:0 0 auto;min-width:0;min-height:30px;margin:0 10px 5px;padding:4px 7px;font-size:11px;background:var(--wb-soft)}
.wb .wb-ai-sidebar-target-toggle>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb .wb-ai-sidebar .wb-ai-target{flex:0 1 auto;min-height:0;max-height:min(240px,30%);overflow:auto;overscroll-behavior:contain}
.wb .wb-ai-sidebar .wb-ai-header>.wb-grow{min-width:100px}
.wb .wb-ai-sidebar .wb-ai-compose textarea{max-height:min(180px,24dvh)}
.wb .wb-ai.wb-ai-dock{
  position:relative;inset:auto;width:100%;min-width:0;max-width:none;
  height:auto;max-height:min(680px,calc(100dvh - 110px));flex:0 1 auto;
  border:1px solid var(--wb-border);border-radius:16px;background:var(--wb-panel);
  box-shadow:0 12px 40px color-mix(in srgb,var(--wb-text) 13%,transparent),0 2px 8px color-mix(in srgb,var(--wb-text) 5%,transparent);
  z-index:10;
}
.wb .wb-ai.wb-ai-dock:focus-within{border-color:color-mix(in srgb,var(--wb-brand-ink) 40%,transparent)}
.wb .wb-ai-dock .wb-ai-header{padding:7px 10px;border:0;background:transparent}
.wb .wb-ai-dock .wb-ai-header .wb-button{min-height:28px;padding:3px 7px;border-color:transparent;background:transparent;font-size:11px}
.wb .wb-ai-dock .wb-ai-dock-mark{padding-inline:3px;color:var(--wb-accent);font-size:16px;flex-shrink:0}
.wb .wb-ai-dock .wb-ai-dock-target{justify-content:flex-start;flex-shrink:1;overflow:hidden;text-align:left;min-width:100px}
.wb .wb-ai-dock .wb-ai-dock-target-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wb .wb-ai-dock .wb-ai-dock-scope{flex-shrink:0;color:var(--wb-muted);font-size:10px}
.wb .wb-ai-dock .wb-ai-history-toggle{color:var(--wb-muted)}
.wb .wb-ai-dock .wb-ai-target{
  flex:0 1 auto;min-height:0;max-height:min(220px,28dvh);overflow:auto;
  gap:7px;padding:10px 14px;border-block:1px solid var(--wb-border);font-size:11px;
}
.wb .wb-ai-dock .wb-ai-target>strong,.wb .wb-ai-dock .wb-ai-target p{overflow-wrap:anywhere}
.wb .wb-ai-dock .wb-ai-target label.wb-row>select{max-width:65%}
.wb .wb-ai-dock .wb-ai-conversation{flex:0 1 180px;max-height:220px}
.wb .wb-ai-dock .wb-ai-conversation[data-has-messages=false]{flex-basis:64px}
.wb .wb-ai-dock .wb-ai-messages{padding:12px 14px;gap:10px;border-top:1px solid var(--wb-border);font-size:12px}
.wb .wb-ai-dock .wb-ai-compose{padding:0 12px 10px;gap:7px;border:0}
.wb .wb-ai-dock .wb-ai-compose textarea{
  min-height:58px;height:58px;max-height:140px;resize:vertical;padding:8px 10px;
  line-height:20px;font-size:13px;border:0;border-radius:10px;background:transparent;box-shadow:none;outline:none;
}
.wb .wb-ai-dock .wb-ai-compose>.wb-row{gap:6px;flex-wrap:wrap}
.wb .wb-ai-dock .wb-ai-compose .wb-button{min-height:29px;padding:4px 9px;font-size:11px;line-height:19px}
.wb .wb-ai-dock .wb-references{max-height:62px;gap:5px}
.wb .wb-ai-dock .wb-references:empty{display:none}
.wb .wb-ai-dock .wb-reference{max-width:min(300px,100%);font-size:11px}
.wb .wb-ai-dock .wb-reference>button:first-child{min-width:0}
.wb .wb-ai-dock .wb-reference>button:last-child{flex-shrink:0;min-width:18px;min-height:22px}
.wb .wb-ai-dock .wb-ai-history-actions{padding-top:7px;border-top:1px solid var(--wb-border)}
@media(max-width:520px){
  .wb .wb-ai-dock .wb-ai-header{gap:3px;padding-inline:7px}
  .wb .wb-ai-dock .wb-ai-dock-scope{max-width:70px;overflow:hidden;text-overflow:ellipsis}
  .wb .wb-ai-dock .wb-ai-compose{padding-inline:10px}
  .wb .wb-ai-dock .wb-shortcuts{font-size:0}
}
`;
