# Canvas integration handoff

Production source is frozen for the lead's package build and native GUI acceptance. All implementation changes stay within this editor directory, plus the separately authorized document helper/back/live-value/readonly-state changes. This worker did not write the generated client, install a profile, create a browser TaskSpace, or claim visual acceptance.

## Implemented controls

- [CanvasEditor.jsx](/Users/congbai/Desktop/找文章/dsh-designer/editor/CanvasEditor.jsx) owns trusted user operations, serial saves, frozen CAS, instance/definition impact confirmation, camera/overview/single-page/device controls, viewport settings, undo/redo and immutable region screenshot references.
- [PageFrame.jsx](/Users/congbai/Desktop/找文章/dsh-designer/editor/PageFrame.jsx) measures all selected stable IDs, supports single/Shift/box selection, parent selection, direct leaf text, normal-flow reordering/container moves and dimensions. Resizing converts border-box pointer geometry to content-box CSS widths, preserves source position, and explains unsupported transformed/inline layout cases. Wheel uses a native nonpassive listener, consumes page scrolling once and normalizes physical movement by zoom. Page title, action and selection labels remain usable at zoom.
- [Properties.jsx](/Users/congbai/Desktop/找文章/dsh-designer/editor/Properties.jsx) writes actual text/image/style/flex/grid/responsive operations. Interactions, state and scene editors submit the real schema; advanced JSON remains available for tabs/form/filter details. Saved scene previews are temporary until explicitly saved. Unsaved property/configuration buffers participate in controller flush and retain their original file/page basis. Closing either property-panel control flushes; an unsaved configuration must be saved or explicitly discarded.
- [bridge.js](/Users/congbai/Desktop/找文章/dsh-designer/editor/bridge.js) injects a parser-built CSP and read-only bridge into an opaque script sandbox. Resources are limited to the project's static capability root plus data/blob as declared; connect/form/object/frame/worker access is denied. Ready follows DOMContentLoaded and controlled runtime initialization. Font/DOM/layout changes trigger geometry refresh. It accepts geometry and temporary view commands, never HTML edit operations or Host API requests.
- [rpc.js](/Users/congbai/Desktop/找文章/dsh-designer/editor/rpc.js) keeps requests across render/callback changes and rejects only real reload/unmount. Window source, channel, token, page and response correlation are checked. The token is correlation, not edit authority.
- [scene-model.js](/Users/congbai/Desktop/找文章/dsh-designer/editor/scene-model.js) translates only canonical, declared input/component state into real scene variants. It excludes password/file/hidden inputs, rejects malformed/truncated values and ignores arbitrary frame HTML/JS/operations. Confirmation displays the input/component count. Modal/tabs/toggle/feedback and configured node states are mapped through the saved schema.
- [document-delta.js](/Users/congbai/Desktop/找文章/dsh-designer/editor/document-delta.js) compares canonical stable node hashes and direct structure; identical siblings are never substituted. External saves highlight affected source objects without changing selection authority or camera. [DiffPanel.jsx](/Users/congbai/Desktop/找文章/dsh-designer/editor/DiffPanel.jsx) uses a readonly CodeMirror MergeView, preferring exact GUI-only savedHTML and explicitly marking a canonical fallback. Changed-object measurements are independent of selection and currently bounded to 100 IDs per page; full source changes remain available in the diff.

## Controller and authority

The root controller exposes `flush`, `validate`, `undo`, `redo`, `fit`, `locate`, `measure`, `applyOperations`, and `invalidateIdentity({pageIds,reason,projectId?})`. Selection callbacks include explicit provenance: user, measurement, invalidation, or locate. Only the first is a user selection; reference location and restored measurements grant nothing.

Identity invalidation clears only the affected page's geometry caches, highlights and old selection; camera and other-page drafts remain. The affected page is temporarily readonly until the parent returns a new valid document object. Old drafts retain old CAS/IDs; they are not rebased. Caller-supplied frozen values use the shared [canvas-transaction.js](/Users/congbai/Desktop/找文章/dsh-designer/ui/canvas-transaction.js) adapter without replacing explicit null/undefined values.

Region drag references use document CSS coordinates derived from the actual drag and scroll, not a fixed rectangle. `export.create` performs the actual immutable PNG capture with project/page CAS. The reference uses numeric page revision, verified screenshot path/hash/export ID and source content hash. The image comes from saved HTML or a saved scene; when runtime dirty is set, the user must explicitly continue that saved snapshot or first save the current declared scenario. It never claims to capture arbitrary unsaved runtime pixels.

## Verified baseline

The existing [package.json](/Users/congbai/Desktop/找文章/dsh-designer/package.json) official test script already includes every added editor test via `editor/*.test.js`; no temporary-only test registration was used.

```text
npm test
463 tests: 462 passed, 0 failed, 1 skipped (opt-in live browser acceptance)

Canvas esbuild external React, browser es2022, write:false
1,588,051 bytes, successful; no generated client written
```

The document unit suite is 32 tests; editor tests cover geometry, script parsing/CSP/correlation, source-aware flow operations, shared interactions/overrides, strict scene translation, raw/canonical diff snapshots and external node identity deltas. Runtime unit tests use a documented DOM API contract fixture, not a renderer. Real fonts, pointer gestures, native prototype interactions, scene appearance, actual PNG pixels and the installed Harness GUI remain the lead's native acceptance step.
