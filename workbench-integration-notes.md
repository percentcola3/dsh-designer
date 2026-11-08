# Workbench cross-service integration tests

The independent integration task adds [workbench-integration.test.js](workbench-integration.test.js) and this document. Production [workspace-service.js](workspace-service.js), [editor-service.js](editor-service.js), [store.js](store.js), [ai-workbench.js](ai-workbench.js), [delivery-service.js](delivery-service.js), and [source-workflows.js](source-workflows.js) are imported and exercised without substituting their business methods. Production corrections discovered by the suite are described below; the later Workspace reference correction was explicitly authorized separately by Lead.

## How to run

```sh
node --test workbench-integration.test.js
```

Latest execution: **18 integration cases passed, 0 failed**. The combined Store, Workspace, integration, AIWorkbench, Editor, document-model, Host and Resource suites pass **207/207**, with no skipped/todo cases. The earlier task-admission failure is resolved. Original root/reference assertions remain, with later Lead-authorized production fixes covering reconciliation, clone isolation, scoped file authority, and exact package resource layout.

## Real services under test

Each fixture creates a new DesignerStore, owner, WorkspaceService, EditorService and AIWorkbench. The owner location callback invokes the real Store `registerProjectLocation`, and model actions pass through real AIWorkbench `authorizeAction` before Editor dispatch. Admission uses actual frozen task preparation and DSH-agent/project bindings. Editor operations invoke the real document model, then actual Workspace file/version transactions and Store metadata persistence. Restart tests construct a separate Store and owner against the same persisted fixture data.

The file provider is a strict in-memory implementation of the inspected public Fs contract. Its target keys are deliberately opaque. Reads expose bytes/ranges and versions; all mutations reject missing policy/CAS and enforce the configured writable root. Canonical aliases emulate the public Fs identity/containment contract, including aliases to other projects. This is storage/protocol integration evidence, **not actual DSH sandbox enforcement or native OS symlink testing**. No Host filesystem adapter, subprocess, or sandbox replacement is used. The test shell throws if any service unexpectedly asks to execute a process.

Every test owns a unique virtual workspace and clears its provider maps through `t.after`. No temporary host directory, user project, profile setting, runtime service, Git working tree, browser, or actual exported file is created or removed. Production files are only read/imported by the test runner.

## Covered outcomes

1. Real Editor text, style, attribute and structural insert transactions save through Workspace. A fresh owner reloads the persisted source with the same page/file/node identities and the correct DOM attributes, parent relationships and styles. Editor undo removes the inserted control and restores original content; redo restores the exact inserted stable ID and modified content. Unrelated sibling hashes remain unchanged.
2. A real normalized document-model candidate saved through `file.write` reloads as the identical Editor document and remains part of Editor undo/redo. Original HTML bytes remain available at the historical immutable path.
3. A filesystem version/content-hash conflict preserves externally saved HTML and the complete incoming AST candidate separately. The recovery record is read from actual Store persistence and parsed back into the real document model. Editor refuses to treat the externally modified page as its last valid saved version.
4. Two concurrent real Editor commits against the same revision admit exactly one save. The losing candidate is persisted in the recovery file; both distinct submitted texts are recoverable, and only one project revision is published.
5. Real AIWorkbench selection admission permits a selected descendant text change and rejects a sibling, an ancestor, injected global styles, and a raw page `file.write` that changes an unselected sibling. The latter invokes the real Editor `prepare` through the production HTML hook before Core publication. Rejected transactions publish zero files and do not advance project revision.
6. Read-only filesystem policy, readonly page registration and a frozen read task independently prevent Editor publication. Viewer/editor access does not imply write authorization.
7. `saveLocation` invokes the real `asParent` root registration. The actual Store maps page HTML, requirements and project metadata into the selected readable project directory. The private root index persists that mapping, and a new Store reloads it before reading/writing the project. Library project enumeration reports the current mapped revision.
8. Raw project JSON contains no absolute selected root, `physicalRoot` or `saveLocation` field. Real Delivery snapshot generation and `zipStored` produce portable design-package bytes without the absolute root, private draft content, or `.workbench` files. This tests actual export preparation/ZIP bytes, not the download route or shell publication of an export artifact.
9. Exact root registration denies readonly policy, outside-workspace destinations under workspace-write policy, non-user authority and nonempty target directories. Existing target contents stay unchanged. An explicitly empty exact directory can be registered, and a later attempt to move the registered project to another root is refused.
10. Unregistered project aliases escaping the library and aliases escaping a registered project's child scope are rejected. The original security regression now also verifies rejection of aliases from an unregistered project to a sibling project inside the same library.
11. Delivery can write partial workbench metadata before migration. A real Delivery mutation creates only schemaVersion, deliveryRecords and sourceProjects on a legacy project; Workspace open remains zero-write, maps the original artboard to its stable default Design, and preserves file/page IDs, hashes and history. Explicit initialization persists the projection without dropping Delivery or source-registration fields.

12. Explicit user merge reads a real saved draft and actual external mutation, invokes the real canonical normalize/validate helpers, and publishes a new immutable revision. Fresh owner reload preserves node IDs and the unrelated sibling hash; Editor undo/redo restores the original/merged versions while the externally changed original path remains unchanged. External/local/candidate backups are independently readable.
13. A real AIWorkbench `project-file` target performs two authorize→Core saves after current file reads. Both change immutable HTML paths while preserving file ID and expected task ownership. The new source reopens through Editor. Sibling paths, forged sibling identities and rename expansion are refused.
14. Real SourceWorkflows plan/finishVersion creates frozen capture/version JSON, then Core clones the project. The provider refuses every subsequent byte/text read into the original project root. SourceWorkflows read, exact source reference resolution and internal source-file reads still succeed from the new root. Owned capture/preview/region identities and hash anchors are rebased; observed `context.originalProjectId` remains unchanged. Export ownership/manifest hashes are rebased while artifact bytes stay equal. AI admission sees the new clone as idle with no old task request; explicitly supplying the old request reproduces the busy state.

## Production defect found and verified fixed

**Unregistered sibling-project aliases previously bypassed `Store.target` project isolation.**

The reproduction creates real Store projects A and B, then lets the provider resolve the unregistered `Library/projects/A` path to the existing canonical `Library/projects/B` directory. Before the correction, `store.target('projects/A/private.md')` succeeded and identified B's file. The initial suite failed with `Missing expected rejection`.

Library containment and containment within an already aliased project root were insufficient: both checks could be true after A's root had been reinterpreted as B's root. Lead corrected Store to compare the canonical process path of an unregistered project root with its expected path beneath the canonical library root. The same test now receives the expected project-scope rejection; explicit registered save roots and registered-root child containment tests still pass. No production source was changed by this test task.

The provider deliberately uses opaque target keys, so the regression also protects against a correction that improperly parses Fs targetKey strings instead of using Fs processPath/contains.

## Additional reference-integrity regressions

Four new normal blocking tests cover the following protocol requirements:

- An imported reference with fixed origin provenance must not return a stale saved SHA after its real local bytes change. Even when no sourceVersion is supplied, an existing recorded hash mismatch must report `REFERENCE_VERSION_CONFLICT`. The original readonly metadata and origin version remain intact; AI revalidation should mark the frozen reference invalid.
- A page reference must verify real saved HTML against the recorded contentHash, even when the caller only references its page ID and unchanged artboard revision without a node ID.
- A copied file's reference sourceVersion must identify that copy's actual FsVersion, as returned by `file.read`. The original file's version remains provenance in `file.source.version`; it must not cause a valid copy reference to be rejected.
- A legacy registered file with no recorded SHA must return the digest of its actual current bytes as a read-only result projection. Resolving the reference must not backfill or otherwise write metadata. It uses the file's FsVersion for file reference identity, independently of origin provenance.

After explicit Lead authorization, the narrow production correction makes file reference sourceVersion use actual FsVersion, preserves origin metadata separately as provenance, and verifies the real bytes of both files and page-only references against recorded hashes. Results return actual contentHash and read-only hash projections, including for legacy files without a recorded digest. All four regressions now pass; unit cases additionally cover unchanged bytes with a changed FsVersion, caller mutation of result projections, binary byte hashes, read races and missing files. SourceImports' `x-*` references still use exact `xv-*` source versions and remain a separate identity domain.

## Verification limits

The real domain services, document AST operations, version persistence, immutable saves, source reloading, AI scope enforcement, root-index persistence, export preparation and ZIP generation are exercised. This suite does not claim actual DSH sandbox enforcement, actual OS filesystem atomicity/symlink behavior, HTTP authentication/routing, mounted UI interactions, or export/download publication. Those checks require the live composed Harness services and remain separate integration acceptance work.
