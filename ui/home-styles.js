export default `
.wb-home {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--wb-home-background,var(--wb-bg));
  color: var(--wb-text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wb-home *, .wb-home *::before, .wb-home *::after { box-sizing: border-box; }
.wb-home .wb-home-inner { flex: 0 0 auto; width: min(100%, 1440px); margin: auto; padding: 40px 36px 56px; }
.wb-home .wb-home-composer-host { max-width:920px; margin:0 auto; }
.wb-home .wb-home-error { max-width: 920px; margin: 0 auto; }
.wb-home .wb-home-error .wb-error { margin-top: 16px; border: 0; border-radius: var(--wb-radius, 12px); background: var(--wb-danger-bg); color: var(--wb-danger); padding: 13px 16px; overflow-wrap: anywhere; font-size: 12px; }
.wb-home .wb-home-error .wb-error pre { max-height: 200px; overflow: auto; white-space: pre-wrap; }
.wb-home .wb-home-recent { margin-top: 32px; container: wb-home-recent / inline-size; }
.wb-home .wb-home-recent-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.wb-home .wb-home-recent-header h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.025em; }
.wb-home .wb-home-project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 18px 16px; }
@container wb-home-recent (max-width: 520px) {
  .wb-home .wb-home-project-grid { grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); }
}
.wb-home button:focus-visible { outline: 2px solid var(--wb-focus); outline-offset: 4px; }
@media (min-width: 1400px) {
  .wb-home .wb-home-recent { margin-top: 36px; }
}
@media (max-width: 850px) {
  .wb-home .wb-home-inner { padding: 32px 28px 44px; }
}
@media (max-width: 520px) {
  .wb-home .wb-home-inner { padding: 24px 18px 36px; }
  .wb-home .wb-home-recent { margin-top: 36px; }
  .wb-home .wb-home-recent-header { align-items: flex-start; gap: 10px; }
  .wb-home .wb-home-project-grid { gap: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .wb-home *, .wb-home *::before, .wb-home *::after { transition: none !important; }
}
`;
