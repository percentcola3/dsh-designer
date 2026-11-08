# CaptureService integration contract

The module provides a complete deferred renderer and a temporary resource handler. Construction performs no browser work, filesystem access, registration or publication. It is separate from generation: its input is a frozen saved-page export, and its result is a real browser image, never replacement design HTML.

```js
import {CaptureService} from './capture-service.js';
this.captureService = new CaptureService(this);
this.imageCapture = payload => this.captureService.capture(payload, {
  policy: payload.policy,
  signal: payload.signal,
});
// In the existing webServer prefix registration:
(req, res) => this.captureService.handle(req, res)
// During owner disposal, before disposing the shared import browser:
await this.captureService.dispose();
```

Register only `/api/designer/capture/` for this handler. It returns false for other paths and true after responding. The current owner already has `delivery.snapshot`, `store`, `ctx.webServer.getOrigin`, and `imports.browser/browserScope`; no new dependency injection, profile connection, raw Host Fs or new BrowserEngine is needed. The shared engine's existing `spaceId` is resumed; if it has never been initialized, the adapter initializes that engine's own existing `spaceName`, just as its first browser.open would. It never chooses a separate capture space name/profile or switches spaces after an error. The integrating lead owns the one goal-wide browser-space acceptance and final finish.

## Input

`capture(payload, env?)` accepts:

```js
{
  projectId, pageId, // artboardId is also accepted
  expectedRevision?, expectedArtboardRevision?,
  html?, logicalPath?, files?, // frozen Delivery snapshot; preferred internal path
  // files: [{path, bytesBase64, mimeType, sha256?, public?}]
  viewport?: {width, height},
  assetBase?, // optional trusted old base for rewriting finite supplied assets
  format?: 'png' | 'jpeg' | 'jpg' | 'webp',
  quality?: 0..100,
  region?: {x,y,width,height}, // document CSS pixels, not screen/canvas coordinates
  nodeIds?: ['stable-node-id'], // measured union when region is absent
  scene?: 'saved-scene-id', // sceneId alias
  background?: boolean, // false means transparent document/artboard background
  editorMarks?: boolean,
  fullPage?: boolean, // defaults true; ignored when region/nodeIds set
  allowIncomplete?: true, // explicit internal override of failed render refusal
  policy, signal?
}
```

`env.policy/env.signal` take precedence over payload values. Policy is mandatory and is not recovered from a stronger owner default. Missing policy is rejected before browser work. The project/page must be currently present, and supplied logicalPath must exactly equal that page's trusted current htmlPath. A provided page/project CAS is checked before work. Delivery now passes its frozen project/page revisions, and its final persistence CAS handles concurrent edits while capture runs.

Without complete html/files, the service asks the existing `owner.delivery.snapshot(project,{pageId,format:'png',editorMarks},env)` for a frozen page export. This public internal helper performs the composed Fs reads and canonical project containment. The capture service itself constructs no physical project path and exposes no Fs path route, so registered custom project roots work through the same Store/Delivery locator. Inputs are memory copies, not live Fs views. There is no general directory scan or Host fs import.

The selected entry HTML and recursively referenced CSS/JS/images/fonts/media enter a finite map. It follows HTML src/link/srcset/style, nested CSS imports/URLs, relative JS modules/new URL literals, and the saved controlled model's state/scene/responsive resource references. Root-relative references are rewritten into the finite capability tree. Unreferenced CSS, all other HTML, docs, JSON context, drafts and hidden workspace metadata are not served even if present in files. Missing/remote assets, bare/dynamic module imports, conflicting paths, mismatched MIME/hash and nested iframe/object/embed content fail explicitly; bundle/localize these through Delivery first. Data image/font URLs remain inline. Navigation is not used as a resource-read fallback.

## Actual render path

All native calls run inside `owner.imports.browserScope.run(env.policy, ...)` and the shared browser's existing `_serial` queue. The adapter intentionally uses that engine's exact `_run`, `spaceId/spaceName`, and managed browser registry instead of creating another browser instance. Its three bounded native rounds create one owned Page, render/capture, and close that Page. Other managed/user pages are not navigated, resized or closed.

The render round sets CDP device metrics with scale factor 1, enables the saved runtime, navigates the opaque sandboxed entry, waits for fonts/images with bounded observable waits, applies an explicit saved runtime scene if requested, and records the actual viewport/readiness. It sets CDP default background plus only html/body background-color/image for transparent export; nested design backgrounds remain design content. JPEG with background:false is refused because JPEG cannot encode alpha. PNG and WebP use real native encoder formats; JPEG/WebP quality goes to CDP. Unsupported encoders are reported instead of changing a suffix.

Editor marks are real blue bounds/labels added to this temporary document, restricted to requested node IDs or the first 300 saved elements. They are removed by page disposal and never written to project HTML. With marks disabled, known editor-overlay/capture-marker nodes are removed from this temporary document. Runtime hidden/scene state is retained.

Node boxes use actual getBoundingClientRect + scroll offsets. Full page uses CDP Page.getLayoutMetrics plus captureBeyondViewport; it does not resize a returned bitmap or substitute a fixed viewport image. Fractional rectangles expand to integer pixel boundaries. Clip output is bounded to 10000px width, 20000px height, 80 megapixels and 32 MiB encoded bytes. The same width/height/pixel limits apply to the emulated canvas. Page/image work uses the existing SDK, a 10s create budget, up to 40s render, and a 5s close budget within the 60s admission deadline. At most two service operations are admitted concurrently; existing shared-engine operations may occupy its queue before a capture runs, and expired work checks its signal before creating a Page.

Default capture refuses missing images/font errors/still-loading fonts/runtime exceptions with CAPTURE_RENDER_INCOMPLETE. An explicit allowIncomplete:true preserves the actual captured frame plus warnings. Readiness means the saved document/runtime loaded; it does not establish all interactions work. This renderer uses the saved HTML/selected scene, not unsaved editor DOM or arbitrary current form input. The editor must save its draft before export, as in the current region-reference flow.

## Temporary capability route

The route is `/api/designer/capture/<256-bit-random-token>/<exact-logical-member>`, with a 60-second lifetime. Each request is GET/HEAD only and checks current token membership, expiry, decoded path segments, MIME, byte limit and SHA256 membership before sending a copied byte buffer. There are no directory listings, redirects, manifest/context endpoints, cookie-based read escalation or fallback Fs reads. Revocation immediately removes the finite resource map. Wrong/expired/revoked tokens are unavailable; byte tampering returns 409. HEAD has the same metadata and no body.

Responses use no-store, nosniff, no-referrer, CORS '*' without credentials, and an opaque `sandbox allow-scripts` CSP. Executable inline scripts/event handlers require hashes from this selected HTML; scripts and static resources are limited to this capability prefix/data where appropriate. connect/form/object/frame/worker access is disabled. The saved controlled runtime can execute; host DSH boot/session/context data is not injected. The route is never a share record and remains revoked after return or failure.

Regular errors, timeout and abort revoke the capability and await closing only the owned Page. Abort is checked between native rounds; an already running SDK/CLI call retains its native hard deadline before cleanup. Failed cleanup leaves the owned registry entry for a later owner disposal retry rather than pretending it closed. If the SDK reports user takeover/inactive/unassigned/permission control stop, no follow-up browser commands or finish/retry are issued; the token is revoked and the handed-off Page remains tracked for the lead's authorized control workflow. This follows the installed ego-browser stop rule and protects user-controlled pages. Service dispose aborts active work, clears all capabilities, drains pending work and retries its still-agent-owned entries; it never finishes the shared TaskSpace.

## Output and trusted provenance

```js
{
  bytesBase64, mimeType, width, height, format,
  metadata: {
    captureId, projectId, pageId, projectRevision, pageRevision,
    savedSourceHash,
    sourceVersion: {pageRevision, sourceHash: savedSourceHash},
    sourceHtmlHash,
    resourceCount, scope: 'page'|'viewport'|'region'|'selection',
    nodeIds, region: {x,y,width,height,scale:1},
    background, editorMarks, editorMarkCount,
    viewport, requestedViewport, documentBounds,
    runtime: {present,readyState,scene},
    fontStatus, fontFailures, imageFailures,
    capabilityRevoked: true
  },
  warnings
}
```

savedSourceHash/sourceVersion come from the trusted current page record.contentHash (or Store.artboardGet + SHA256 for old hashless records), never caller metadata. They identify the original saved page. sourceHtmlHash instead identifies the actual security/resource/runtime-serialized render HTML, which can legitimately differ. Delivery whitelists these receipt fields into manifest.capture and anchors that manifest by record.manifestHash. Native returned bytes are checked against requested PNG/JPEG/WebP magic and bounds; no PNG is relabeled as another format. No temporary capability URL is returned/persisted.

For editor region references, reuse existing `export.create` with project/page CAS, format:'png', document region, background/editorMarks flags. Delivery calls this adapter and persists the immutable artifact. The frontend reference contains its actual `{path,mimeType,sha256,exportId,url}` plus region/pageId/sourceVersion. A full source preview remains a source snapshot with scope:'viewport'/'snapshot'; a target region screenshot is marked scope:'region' and is not called a source crop. Actual source BrowserEngine clips have explicit scope:'region' metadata.

## Verification

The 13 capture tests run the production native orchestration script through a contract-shaped TaskSpace/Page runner, real AsyncLocalStorage and real route handler. They exercise exact native format/quality/clip arguments, long page bounds, fractional clips, source identity, CAS, opaque/no-store resource membership, recursive dependency closure, local fonts/images, forbidden docs/unreferenced members, MIME/hash validation, traversal, HEAD, expiry/revocation, abort, disposal, render-incomplete refusal and no commands after user takeover. They verify only the captured bytes are returned unchanged and that unrelated managed/user pages remain open.

The test Page.evaluate returns a deterministic browser-side receipt; it does not paint real pixels. JPEG/WebP fixture signatures establish a transport/format contract, not encoder visual quality. The installed ego-browser v2.2.0 API guide was read through its end marker. No new browser study TaskSpace, mock HTML shell, rasterizer, plugin install or profile mutation was used. Fresh native visual acceptance remains the lead's goal-wide check: real fonts/images/runtime, actual alpha/marks, all formats and a >3840px page/selected region, followed by cleanup/URL revocation. Do not label it pixel verified before that check.

Latest joint command:

```bash
node --test dsh-designer/capture-service.test.js dsh-designer/source-workflows.test.js dsh-designer/browser-engine.test.js dsh-designer/document-model.test.js dsh-designer/delivery-service.test.js
```

Result: **96 tests, 95 passed, 1 skipped** (the opt-in live-browser test), zero failures. After the final aggregate-byte/native-buffer guards and fractional-clip assertion, the source+capture-only rerun passed **36/36**. Source tests also now use actual AsyncLocalStorage assertions across every browser open/action/state/region call; missing policy/ALS fails BROWSER_POLICY rather than silently executing a fallback.
