export default `
/* Theme colors are inherited from the Workbench root. */
.wb-shell {
  --wb-rail-size: 56px;
  display: grid;
  grid-template-columns: var(--wb-rail-size) minmax(0, 1fr);
  grid-template-rows: 48px minmax(0, 1fr);
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
  background: var(--wb-chrome-background,var(--wb-app-bg));
  color: var(--wb-text);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wb-shell, .wb-shell * { box-sizing: border-box; }
.wb-shell button { font: inherit; cursor: pointer; }
.wb-shell button:disabled { background: var(--wb-disabled); color: var(--wb-on-disabled); cursor: default; opacity: 1; }
.wb-shell button:focus-visible, .wb-shell-stage:focus-visible {
  outline: 2px solid var(--wb-focus);
  outline-offset: 2px;
}
.wb-shell svg { display: inline-block; flex-shrink: 0; vertical-align: middle; }
.wb-shell .wb-shell-sidebar {
  grid-column: 1;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--wb-rail-size);
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 8px;
  border: 0;
  border-right: 0;
  border-radius: 0;
  background: var(--wb-sidebar-background,var(--wb-panel));
  box-shadow: none;
}
.wb-shell[data-sidebar-visible=false] { grid-template-columns: 0 minmax(0, 1fr); }
.wb-shell .wb-shell-sidebar[hidden] { display: none; }
.wb-shell-brand { display: flex; align-items: center; justify-content: center; align-self: stretch; flex: 0 0 var(--wb-rail-size); width: var(--wb-rail-size); border-right: 0; }
.wb-shell .wb-shell-logo { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: var(--wb-radius-sm,8px); background: transparent; }
.wb-shell .wb-shell-logo:hover { background: var(--wb-hover); }
.wb-shell-sidebar-scroll { display: flex; flex: 1 1 auto; flex-direction: column; width: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
.wb-shell-navigation { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
.wb-shell .wb-shell-nav-item { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; min-height: 36px; padding: 8px; border: 0; border-radius: var(--wb-radius-sm,8px); background: transparent; color: var(--wb-muted); transition: background-color .15s ease, color .15s ease; }
.wb-shell .wb-shell-nav-item:hover { background: var(--wb-hover); color: var(--wb-text); }
.wb-shell .wb-shell-nav-item[aria-current=page] { background: var(--wb-selected); color: var(--wb-accent); font-weight: 600; }
.wb-shell .wb-shell-icon-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 6px; border: 0; border-radius: var(--wb-radius-sm,8px); color: var(--wb-muted); background: transparent; }
.wb-shell .wb-shell-icon-button:not(:disabled):hover { background: var(--wb-hover); color: var(--wb-accent); }
.wb-shell-sidebar-footer { display: flex; flex-shrink: 0; flex-direction: column; padding-top: 12px; }
.wb-shell-main { grid-column: 2; grid-row: 2; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 0; }
.wb-shell-workspace { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border: 0; border-radius: 0; background: var(--wb-bg); box-shadow: none; }
.wb-shell-topbar { position: relative; z-index: 60; grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; gap: 0; min-width: 0; height: 48px; padding: 0 10px 0 0; border-bottom: 1px solid transparent; background: var(--wb-chrome-background,var(--wb-panel)); }
.wb-shell-tab-rail { display: flex; align-items: stretch; align-self: stretch; flex: 1; min-width: 0; }
.wb-shell-tabs { display: flex; align-items: center; align-self: stretch; flex: 0 1 auto; gap: 6px; min-width: 0; padding: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.wb-shell-tabs::-webkit-scrollbar { display: none; }
.wb-shell .wb-shell-open { align-self: center; margin: 0 6px; }
.wb-shell .wb-shell-open[aria-expanded=true] { background: var(--wb-selected); color: var(--wb-accent); }
.wb-shell-actions { display: flex; align-items: center; flex-shrink: 0; gap: 2px; margin-left: 6px; }
.wb-shell-open-menu { position: absolute; top: calc(100% + 6px); z-index: 10; width: 256px; max-width: calc(100% - 16px); max-height: calc(100dvh - 64px); padding: 6px; overflow-y: auto; border: 0; border-radius: var(--wb-radius-sm,8px); background: var(--wb-elevated,var(--wb-panel)); box-shadow: var(--wb-shadow-hover); }
.wb-shell-open-menu [role=group] + [role=group] { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--wb-divider); }
.wb-shell-menu-label { padding: 4px 9px; color: var(--wb-faint); font-size: 11px; }
.wb-shell .wb-shell-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 34px; padding: 7px 9px; border: 0; border-radius: var(--wb-radius-sm,8px); background: transparent; color: var(--wb-text); text-align: left; }
.wb-shell .wb-shell-menu-item span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-shell .wb-shell-menu-item:not(:disabled):hover, .wb-shell .wb-shell-menu-item:not(:disabled):focus { background: var(--wb-hover); }
.wb-shell .wb-shell-menu-item:focus-visible { outline-offset: -2px; }
.wb-shell .wb-shell-menu-item[aria-current=page] { color: var(--wb-accent); }
.wb-shell-menu-empty { padding: 10px 9px; color: var(--wb-muted); }
/* Reserve two CJK glyphs plus the ellipsis before the rail starts scrolling.
   Chrome: 8px tab padding + 20px button padding + 16px icon + 8px gap. */
.wb-shell-tab { --wb-tab-close-width: 0px; --wb-tab-running-width: 0px; position: relative; display: flex; align-items: center; align-self: center; flex: 0 1 auto; min-width: calc(3em + 52px + var(--wb-tab-close-width) + var(--wb-tab-running-width)); max-width: calc(6em + 52px + var(--wb-tab-close-width) + var(--wb-tab-running-width)); min-height: 36px; height: 36px; margin: 0; padding: 0 4px; border-radius: var(--wb-radius-sm,8px); background: transparent; color: var(--wb-muted); font-size: 12px; transition: background-color .15s ease, color .15s ease; }
.wb-shell-tab[data-closable=true] { --wb-tab-close-width: 24px; }
.wb-shell-tab[data-running=true] { --wb-tab-running-width: 14px; }
.wb-shell-tab:not([data-active=true]):hover { background: var(--wb-hover); color: var(--wb-text); }
.wb-shell-tab[data-active=true] { background: var(--wb-tab-active-background,var(--wb-brand-soft)); color: var(--wb-brand-ink); box-shadow: none; }
.wb-shell .wb-shell-tab-select { display: flex; align-items: center; flex: 1 1 auto; gap: 8px; min-width: 0; min-height: 36px; padding: 7px 10px; border: 0; border-radius: var(--wb-radius-sm,8px); background: transparent; color: inherit; font-size: 12px; white-space: nowrap; }
.wb-shell .wb-shell-tab-select:hover { background: transparent; }
.wb-shell .wb-shell-tab-select:focus-visible { outline-offset: -3px; }
.wb-shell-tab[data-active=true] .wb-shell-tab-select { font-weight: 600; }
.wb-shell-tab-label { flex: 1 1 auto; min-width: 0; max-width: 6em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-shell .wb-shell-tab-close { display: grid; place-items: center; flex-shrink: 0; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: var(--wb-radius-sm,8px); background: transparent; color: inherit; }
.wb-shell .wb-shell-tab-close:hover { background: color-mix(in srgb, var(--wb-text) 8%, transparent); color: inherit; }
.wb-shell-running { width: 6px; height: 6px; flex-shrink: 0; border-radius: 50%; background: var(--wb-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--wb-success) 12%, transparent); }
.wb-shell .wb-shell-theme,.wb-shell .wb-shell-exit { width: 32px; height: 32px; margin: 0; border-radius: var(--wb-radius-sm,8px); color: var(--wb-muted); }
.wb-shell-stage { position: relative; display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border: 0; border-radius: 0; background: var(--wb-bg); box-shadow: none; }
.wb-shell-stage > .wb-body, .wb-shell-stage > .wb-workspace { flex: 1 1 auto; min-width: 0; min-height: 0; }
.wb-shell-stage .wb-management { background: var(--wb-bg); }
.wb-shell-stage .wb-card { border: 0; border-radius: var(--wb-radius-card,12px); box-shadow: var(--wb-shadow); }
.wb-shell-stage .wb-card:hover { box-shadow: var(--wb-shadow); }
.wb-shell-stage .wb-manager-tools, .wb-shell-stage .wb-card-footer { border: 0; }
.wb-v2.wb-focus .wb-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.wb-v2.wb-focus .wb-shell-main { grid-column: 1; grid-row: 1; }
@media (max-width: 760px) {
  .wb-shell-topbar { padding-right: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .wb-shell .wb-shell-nav-item, .wb-shell-tab { transition: none; }
}
`
