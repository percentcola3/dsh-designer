// DSH owns transcript layout and interaction cards. These rules adapt the
// surrounding designer panel and public theme variables to its compact seat.
export const aiDockStyles = `
.wb .wb-ai.wb-ai-dock,.wb .wb-ai.wb-ai-sidebar{
 min-width:0;min-height:0;overflow:hidden;container-type:inline-size;
 --dsh-composer-side-clearance:0px;--dsh-chat-content-width:100%;
 --dsh-content-font-size:13px;--dsh-content-font-size-secondary:12px;
 --dsw-alias-bg-base:var(--wb-panel);--dsw-alias-bg-layer-1:var(--wb-panel);--dsw-alias-bg-layer-2:var(--wb-soft);
 --dsw-alias-bg-module-platform:var(--wb-panel);--dsw-alias-bg-overlay:var(--wb-elevated);--dsw-specific-input-major:var(--wb-soft);
 --dsw-specific-bubble:var(--wb-soft);--dsw-specific-bubble-highlight:var(--wb-hover);
 --dsw-alias-label-primary:var(--wb-text);--dsw-alias-label-secondary:var(--wb-text);--dsw-alias-label-tertiary:var(--wb-muted);--dsw-alias-label-caption:var(--wb-faint);
 --dsw-alias-label-dimmed:var(--wb-faint);--dsw-alias-label-primary-foreground:var(--wb-on-brand);
 --dsw-alias-border-l1:var(--wb-divider);--dsw-alias-border-l2:var(--wb-divider);--dsw-alias-border-l3:var(--wb-divider);--dsw-alias-border-l4:var(--wb-divider);
 --dsw-alias-border-l2-darkmode-thin:var(--wb-divider);--dsw-alias-separator-primary:var(--wb-divider);
 --dsw-alias-markdown-inline-code:var(--wb-soft);--dsw-alias-markdown-code-block:var(--wb-soft);
 --dsw-alias-interactive-bg-hover:var(--wb-hover);--dsw-alias-interactive-bg-hover-solid:var(--wb-hover);
 --dsw-alias-button-info-fill:var(--wb-brand-action);--dsw-alias-state-business-primary:var(--wb-brand-ink);
 --dsw-specific-sidebar-nav-item-active-accent:var(--wb-brand-soft);
 --dsw-alias-button-floating-fill:var(--wb-panel);--dsw-alias-button-floating-hover:var(--wb-hover);
 --dsw-alias-turn-trigger-bg:var(--wb-soft);--dsw-alias-turn-trigger-bg-hover:var(--wb-hover);
 --dsw-alias-scrollbar-bg-l2:var(--wb-divider);--dsw-alias-scrollbar-hover-l2:var(--wb-faint);--dsw-focus-ring-color:var(--wb-focus);
}
.wb .wb-ai [hidden]{display:none}
.wb .wb-ai .wb-ai-header{display:flex;align-items:center;flex:0 0 auto;gap:3px;min-height:36px;padding:3px 8px;border-bottom:1px solid var(--wb-divider);background:transparent}
.wb .wb-ai .wb-ai-header>strong{display:flex;align-items:center;gap:6px;min-width:0;margin-right:4px;font-size:12px;font-weight:600}
.wb .wb-ai .wb-ai-header .wb-button{display:grid;place-items:center;width:26px;height:26px;min-height:26px;padding:4px;border:0;background:transparent;color:var(--wb-muted)}
.wb .wb-ai .wb-ai-header .wb-button:hover{background:var(--wb-soft);color:var(--wb-brand-ink)}
.wb .wb-ai .wb-ai-layout-switch{display:flex;flex:none}
.wb .wb-ai .wb-ai-conversation,.wb-native-conversation{position:relative;display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;overflow:hidden}
.wb-native-conversation{--dsh-chat-flow-gap:6px}
/* The panel background takes precedence over Host ambient conversation themes. */
.wb .wb-ai .wb-native-conversation [data-conversation-scroll]{background:var(--wb-panel)}
.wb .wb-native-conversation [data-message-bubble]{background:var(--wb-soft)!important;color:var(--wb-text)!important;border:0!important;border-radius:12px!important;box-shadow:none!important}
.wb .wb-native-conversation [data-message-bubble]::after{content:none!important}
/* External conversation themes add decorative rails to these native prose seats. */
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"]) [data-slot="conversation.chat.node"]>div>div>div:not([data-turn-process-inline]):not(:has([data-variant="think"])){
 padding:0!important;border:0!important;background:none!important;font-family:inherit!important;line-height:1.6!important
}
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] [data-slot="conversation.chat.node"]>div>div>div::before,
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] [data-slot="conversation.chat.node"]>div>div>div::after{content:none!important}
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] :is(h1,h2,h3,h4,strong,code,blockquote,th){color:var(--wb-text)!important}
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] a{color:var(--wb-brand-ink)!important}
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] :is(h2,blockquote)::before,
.wb .wb-native-conversation [data-chat-flow-kind="assistant-step"] :is(h2,blockquote)::after{content:none!important}
.wb .wb-native-conversation :is(input,textarea,[contenteditable=true]){caret-color:var(--wb-text)!important}
.wb .wb-native-conversation [data-conversation-content]{--dsh-chat-content-width:100%;--dsh-composer-card-max-width:100%;--dsh-composer-side-clearance:0px;--dsh-composer-dock-inset:0px;min-width:0}
.wb .wb-native-conversation [data-composer-seat]{max-height:min(420px,60dvh);overflow:auto}
.wb-native-conversation [data-chat-flow]{font-size:13px;line-height:1.6}
.wb .wb-ai .wb-ai-conversation[hidden]{display:none}
.wb .wb-ai .wb-ai-empty{padding:12px 16px;line-height:1.6;font-size:12px}
.wb .wb-ai .wb-ai-target{flex:0 1 auto;min-height:0;max-height:240px;overflow:auto;gap:6px;padding:10px 12px;font-size:11px;background:var(--wb-soft)}
.wb .wb-ai .wb-ai-target>strong,.wb .wb-ai .wb-ai-target p{overflow-wrap:anywhere}
.wb .wb-ai .wb-ai-target label.wb-row>select{max-width:65%}
.wb .wb-ai .wb-ai-compose{flex:none;min-width:0;min-height:0;padding:7px 8px 8px;border-top:1px solid var(--wb-divider)}
.wb .wb-ai .wb-ai-compose .wb-designer-compose-input{min-height:52px;max-height:140px;padding:9px 11px;font-size:13px;line-height:20px}
.wb .wb-ai .wb-designer-compose-toolbar{min-height:32px;padding:3px 0 5px;margin-inline:8px}
.wb .wb-ai.wb-ai-sidebar{position:relative;inset:auto;flex:1 1 auto;width:100%;max-width:none;height:100%;max-height:100%;border:1px solid var(--wb-divider);border-radius:12px;box-shadow:var(--wb-shadow-soft)}
/* Compact and expanded seats keep the same native transcript and composer.
   Only the viewport height changes, including after a request has finished. */
.wb .wb-ai.wb-ai-dock{position:relative;inset:auto;flex:0 1 auto;width:100%;max-width:none;height:min(360px,calc(100dvh - 130px));max-height:100%;border:1px solid var(--wb-divider);border-radius:12px;background:var(--wb-panel);box-shadow:var(--wb-shadow-hover)}
.wb .wb-ai.wb-ai-dock[data-conversation-expanded=true]{height:min(560px,calc(100dvh - 130px))}
.wb .wb-ai-dock .wb-ai-conversation{flex:1 1 0;min-height:0}
.wb .wb-ai-dock .wb-ai-compose{padding:5px 6px 6px}
.wb .wb-ai-dock .wb-ai-compose .wb-designer-compose-input{min-height:34px;max-height:80px;padding:6px 8px}
.wb .wb-ai-dock .wb-designer-compose-chip-label{max-width:180px}
@container(max-width:450px){
 .wb-ai .wb-native-compose-permission .wb-native-compose-label{display:none}
 .wb-ai .wb-designer-compose-system-label{max-width:58px}
 .wb-ai .wb-designer-compose-left,.wb-ai .wb-designer-compose-right,.wb-ai .wb-designer-compose-native{gap:2px}
 .wb-ai .wb-native-compose-control{padding-inline:5px}
}
`;
