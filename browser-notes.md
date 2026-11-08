# Browser engine integration

This worker owns only `browser-engine.js`, `browser-engine.test.js`, and this note. No bundle was installed, no other plugin file was changed, and no project/library files were written by the engine. The lead owns persistence and asset URL rewriting.

## Verified execution channel

Loaded `ego-browser` and `cordis-plugin-development`, ran `cordis_inspect_list`, and queried the exact Host `browserUse` contract. It exposes only provider `register(name)`, not Page APIs. Ran `ego-browser skill` and read its complete v2.2.0 guide including the end marker.

The working channel is the already-installed `ego-browser nodejs` CLI. Scripts execute ESM with supplied `taskSpace`, `Page`, and CDP globals. Each CLI invocation is a new Node process, but TaskSpace IDs and Page labels persist. `page.cdp(method, params, {timeout})` returns native CDP values; verified `Page.captureScreenshot -> {data:PNG-base64}`, `Page.captureSnapshot({format:'mhtml'}) -> {data:MHTML}`, `Page.getResourceTree`, and buffered `page.events()` records with `{method,params}`. No Playwright import, second browser, profile selection, cookie extraction, or profile filesystem inspection is used.

The constructor is lazy. It does not execute a CLI process or create a TaskSpace. Default executable is `EGO_BROWSER_CLI` or `~/.local/bin/ego-browser`. The host can instead inject a sandbox-aware `runner(source,{timeoutMs,maxOutputBytes})`:

1. Run the fixed installed CLI command `ego-browser nodejs` using the host's managed execution/policy service.
2. Pass `wrapCliScript(source)` through stdin, without shell interpolation.
3. Collect stdout and stderr (ego-browser currently forwards console output on stderr).
4. Return `parseCliOutput(combinedOutput, exitCode)`. Both helpers and `BROWSER_RESULT_MARKER` are exported.

The runner must enforce the supplied timeout/output bound. Default `createCliRunner` enforces these bounds and kills its own CLI child on overflow/timeout. It never kills Chromium. Browser-control/TaskSpace ownership errors are propagated; capture does not retry through an alternate channel after the user takes control.

## Public contract

```js
const engine = new BrowserEngine({ runner?, executable?, limits? });
const state = await engine.open({projectId, url, width:1280, height:800});
engine.info(state.browserId); // {browserId,projectId} or null, no IO
await engine.action({projectId,browserId:state.browserId,type:'click',x:100,y:200});
const capture = await engine.capture({projectId,browserId:state.browserId});
await engine.close({projectId,browserId:state.browserId});
await engine.dispose();
```

`action` supports:

- `navigate`: `url` (absolute HTTP(S), without embedded credentials).
- `resize`: `width,height`, integer 240–3840.
- `click`: semantic `selector`, or logical CSS pixels `x,y`.
- `type`: `text`, optionally `selector` for replace/fill; without selector inserts at current focus.
- `key`: `key` chord using ego-browser keyboard syntax.
- `scroll`: `deltaX,deltaY` (logical CSS pixels).
- `back`, `forward`: current Chromium navigation history.

`open` and `action` return `{browserId,projectId,url,title,width,height,documentHeight,scrollX,scrollY,screenshot}`. Screenshot is PNG data URL, viewport only. Every round reapplies `Emulation.setDeviceMetricsOverride` with `deviceScaleFactor:1`, since real testing showed metrics do not persist across CLI sessions. `height` is the viewport height; `documentHeight` is the actual document scroll height. The lead may clamp documentHeight when creating a full-page artboard. Capture additionally returns:

```js
{
  html, // static current DOM, absolute source asset references
  resources: [{url,mimeType,bytesBase64,category,source}],
  failures: [{url,reason}],
  warnings: [String],
  capturedAt, totalResourceBytes,
  browserId, projectId, url, title, width, height, documentHeight, screenshot
}
```

Resource category is `stylesheet`, `font`, `image`, or `other`; source is `mhtml`, `network`, `resource-cache`, or `page-fetch`. `html` is the restoration entry. Screenshot is for interaction/preview, not the reconstruction. Raw MHTML HTML is never trusted or returned as the static document. No output file is written here.

All mutating/capture/session methods require the matching projectId. Browser IDs are generated UUIDs and sessions are checked internally (`BROWSER_PROJECT_SCOPE`). Operations are serialized per engine to avoid racing page state. One engine owns one uniquely named TaskSpace; each simultaneous browser/project session owns a separate managed Page. `close` closes that Page only. `dispose` finishes that engine's TaskSpace once with `keep:[]`; SDK protection retains unknown/user-created tabs. The engine never adopts another user's tabs or claims another user's space.

## Static capture and resources

Capture prioritizes CDP `Page.captureSnapshot(MHTML)`, decoding quoted-printable and base64 asset parts. It then clones the live DOM through `page.evaluate` so the current clicked/typed state is represented. It removes executable script nodes (including SVG scripts), templates, event attributes, base/refresh/source CSP, unsafe URL schemes, action/formaction, frame/plugin embeds, SVG animation, and prefetch links; freezes input/textarea/select/details state; excludes password/file values; uses current image src; and rasterizes readable canvas to inline PNG. Tainted canvas and unavailable frame/shadow content produce warnings. A new static CSP disables scripts, objects, forms, and base changes. The lead's trusted Frame may replace this CSP with its own policy before adding its bridge and asset base.

Layout properties are read from current computed style, deduplicated into shared `data-designer-style` rules, and applied as important static rules. This avoids repeating long inline declarations for equal elements. Accessible author styles retain `@font-face`, custom properties, media rules and pseudo-elements; visible pseudo-elements also receive captured computed rules. CSS asset URLs and string imports are normalized. Same-document SVG fragment URLs remain fragments. Resource manifests recursively cover CSS `@import` and `url(...)` dependencies, including font files.

If MHTML does not contain required bytes, fetch order is `Network.getResponseBody` for observed requests, `Page.getResourceContent` for the current Page's cached resource tree, then bounded fetch in that Page context. Same-origin fetch uses same-origin credentials; cross-origin fetch explicitly omits credentials; redirects are rejected. No cookies, tokens, authorization headers, or browser credentials are exported/replayed. Cross-origin CORS/opaque responses and authentication failures are recorded in `failures`, rather than bypassed with node fetch or credential transfer. The host must rewrite absolute references in both HTML and CSS resources when persisting. It must preserve resource MIME types and treat import bytes as untrusted content.

Defaults: 45 seconds per CLI operation, 60 seconds capture budget, 100 attempted resources, 5 MiB/resource, 24 MiB total resource bytes, 12 MiB captured HTML, 6000 elements. Limits are configurable by trusted constructor options. DOM/HTML limits fail explicitly. Resource time/byte/count limits return current HTML plus failures; a timed-out resource CLI is not retried. Very large documents, inaccessible closed shadow DOM, cross-origin frames, tainted canvas, protected fonts, CSS constructs with unusual escaped URL syntax, video frames, and sites depending on live JS can have fidelity limits. This is a static current-state capture, not an offline reimplementation of application logic. The store's HTML cap must be consistent with configured `maxHtmlBytes`; shared styles reduce typical document size but cannot guarantee every page fits 2 MiB.

## Validation performed

`node --test dsh-designer/browser-engine.test.js`: eight tests passed; one optional real-browser test is skipped by default. Tests cover lazy initialization, project boundaries, invalid schemes and credentials, JSON-safe CLI arguments, viewport restoration, resource timeout failures without retry, binary MHTML/quoted-printable decoding, recursive CSS discovery, sandbox runner receipts, missing CLI, and idempotent TaskSpace disposal.

A real CLI/Chromium run used exactly one research/validation TaskSpace: ID 2, Page p1. It navigated publicly to `https://example.com`, then used a temporary in-memory loopback HTTP fixture (not a replacement DSH GUI or mock preview). The fixture included an actual 123,720-byte Roboto TTF, nested main/nested stylesheets, PNG, pseudo-element, input/button, and painted canvas. It clicked the button, typed a new input value, captured, and verified current form value, removal of script/on* attributes/base, canvas conversion, exact font and PNG bytes, and nested CSS manifest coverage. Capture returned no warnings/failures. Main/nested CSS and PNG came from MHTML; font bytes came from same-origin Page fetch. It resized and navigated back to `example.com`, confirmed `Example Domain`, and awaited `task.finish({keep:[]})`. No test browser Pages remain.

The Roboto fixture source is the Google Fonts OFL distribution: https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap and https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf . No font bytes are vendored by this module. The opt-in reproducible integration test (`DSH_BROWSER_LIVE=1 node --test dsh-designer/browser-engine.test.js`) retrieves that public font, creates its own test space, serves only loopback fixture data, verifies capture and finishes the space in finally. Run it as a new validation task; it is intentionally not repeated automatically after the already-finished research space.

The real run detected that viewport metrics reset between CLI rounds. The subsequent per-round restore fix and stylesheet deduplication are covered by unit/code checks; they were not re-run in another space within this same research goal. The opt-in integration test now asserts retained width/height after capture and navigation. Live plugin/Frame/asset persistence integration belongs to the lead.
