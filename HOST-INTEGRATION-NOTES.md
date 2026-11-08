# Host integration acceptance notes

The Host is ready for packaging and the Lead's native GUI acceptance. Final regression command:

```sh
node --test --test-reporter=spec dsh-designer/*.test.js
```

Result at handoff: **393 tests, 392 passed, 0 failed, 1 skipped**, about 3.3 seconds. The skipped case is the opt-in real Chromium browser test. This result does not claim live DSH sandbox, visual interaction, image pixels or installation acceptance; those are the Lead's single shared BrowserEngine TaskSpace acceptance.

## Canonical persistence

[Host dispatch](</Users/congbai/Desktop/找文章/dsh-designer/index.js>) routes old artboard creation/commits and registered-page `file.write` through [EditorService](</Users/congbai/Desktop/找文章/dsh-designer/editor-service.js>) and the real Workspace transaction. Canonical page creation uses the actual final design/page path from the Workspace preparation hook. An admitted design target remains that design. A project generation task without a design creates and reuses an explicit default design for that task in the current service lifetime; it does not choose an unrelated existing design.

The persisted page/file IDs, immutable revisions, actual FsVersion CAS and history come from Workspace. Existing `artboard`, `project` and `projectRevision` DTOs remain available. `file.write` requires its explicit `expectedVersion`; the compatibility artboard operation retains project/page CAS and an actual source/hash check.

Full HTML selection saves run `assertCommitScope` against canonical previous/current documents before the internal page transaction. AIWorkbench supplies the registered-page witness for an exact current page file ID; an arbitrary HTML source file cannot impersonate it. Ordinary source-code HTML remains code.

Editor reads the complete source with a **64 MiB Fs bound**. Canonical canvas documents retain DocumentModel's explicit **8 MB limit**. The regression includes a 4.35 MB UTF-8 page beyond the old Store reader limit and verifies its final node and complete text. Oversized/invalid canvas projection leaves paged source available with diagnostics.

Resource preflight awaits canonical Fs checks, then supplies DocumentModel a synchronous lookup callback. Broken resources/invalid documents cannot replace the valid saved page. Shared impact resolves actual definition metadata and ancestor roots/slots; operation discovery delegates to the real typed operation help.

GUI reads additionally expose `document.savedHTML`, the raw source already read from Fs; `sourceHash` still hashes that raw source and `document.html` is the canonical frame projection. Model output removes `savedHTML` and returns bounded node/result data.

## Source repair

A registered legacy page with malformed controlled model JSON remains readable through user `file.read`: original paged text plus `readonlyCanvas`, `sourceRepairRequired` and diagnostics. An explicit user full-file repair can rebuild invalid previous identities without similar-node matching. Models and selected-scope operations cannot use this fallback.

The real integration verifies raw broken JSON remains visible, a model repair is refused, user repair reports `IDENTITY_REBUILT`, and the real Editor reopens the valid document. Workspace preserves raw backups and signals identity/reference reset. External hash changes still require explicit reconcile; invalid historical HTML is refused before activation.

## Native AI and application state

All submissions use the native admission adapter and native SessionController. `user` reaches admission. Native RPC/user-message records and the trusted project task anchor remain mandatory. The Store test fixture now writes genuine `user/message` envelopes with `source.rpcId` and implements `snapshotEvents`; no production guard was weakened for tests.

Recovery serializes per Agent and runs before a new admission, so an older asynchronous recovery cannot replace a newly admitted task. Read-only deterministic sessions restore without persisting `project.aiSessionId` or writing project files. Status unwraps only the request carrier's user prompt while retaining native file/image attachment metadata, reference summaries, queue state and recovery errors. Cancellation is native.

`binding.apply` launches one actual native task for the selected existing page set. Multiple designs use a frozen per-target system/version/resource matrix, `contentOnly` and `existingOnly`; the project default does not replace per-design pins. Busy admission reports pending application IDs and a retry descriptor. A retry reuses matching pending IDs. New pages, configuration changes and out-of-scope objects remain denied.

Application records begin pending/running. Actual authorized page saves create task/request/hash receipts; only matching saved pages advance partial/applied state. Admission linking handles a page save arriving before the request/task link. `visualReview` and interaction verification remain pending/unverified. These states establish actual saves, not a claim that semantic styling or pixels have been reviewed.

## HTTP and lifetime

Registered routes:

| Route | Adapter / authority |
| --- | --- |
| `/api/designer` | Connection trusted-origin/authentication check, then owner admission; GET read allowlist |
| `/api/designer/upload` | UploadService raw streaming, owner/trusted-origin admission, exact initiating Session policy |
| `/api/designer/resource/` | Existing read-only project static resource capabilities |
| `/api/designer/file-resource/` | ResourceService selected file/system/native-attachment capabilities |
| `/api/designer/source-resource/` | ResourceService static registered source dependencies |
| `/api/designer/capture/` | CaptureService finite frozen-page dependency capability |
| `/api/designer/share/` | Delivery's explicitly selected owner/local/unlisted read scope |
| `/api/designer/download/` | Trusted-origin/authentication plus Delivery owner artifact admission |

User `file.read` and `system.resource.read` invoke resource decoration. Owner-only `attachment.get` resolves the native receipt/history object before issuing a readonly capability. Supplied upload `contextSessionId` resolves to the actual permission Agent; a missing Session never falls back to owner Full access.

A service AbortController combines with every owner operation's caller signal. Scoped callback execution, the legacy import tool and Source/Workspace work participate in the in-flight drain. Disposal aborts old service operations, drains them and all four resource/upload/capture/delivery modules, then closes Imports/its owned browser resources. Failure cleanup unregisters global tools/routes. Operation disposal does not call native Session cancellation. At full plugin uninstall/reload, the SDK may tear down its fiber-owned Agent instance; the durable native Session remains, and the new plugin recovers the frozen task/history without automatically resubmitting interrupted writes.

## Progressive tools and measured schema footprint

There are three global tools and three per-project scoped tools, with native restrictions hiding unrelated globals. Global help initially returns action names and short descriptions. `help` with `options.action` preserves that inner action and reveals its exact fields. Source aliases map to the workbench workflow namespace. Editor operation help is progressive by operation type. Delivery supplies its own static field help.

Measurements serialize the actual `{name, description, parameters}` definitions. Token estimates use `ceil(chars / 4)` per tool; they exclude conversation/system prompt and are not tokenizer measurements.

| Scope | Retained two-tool compatibility subset | Current three tools | Increase |
| --- | ---: | ---: | ---: |
| Global | 3,808 chars / ~952 tokens | 4,491 chars / ~1,123 tokens | +683 chars / ~171 tokens |
| Project scoped | 2,673 chars / ~669 tokens | 3,238 chars / ~811 tokens | +565 chars / ~142 tokens |

The compatibility tools remain installed. **No reduction in total schema or first-turn tokens is claimed.** Current status reports authored/installed definitions and the explicitly labeled retained compatibility subset.

Reproduce the definition measurement with:

```sh
DSH_DESIGNER_SCHEMA_REPORT=1 node --test --test-reporter=spec dsh-designer/host-integration.test.js
```

[The Host integration suite](</Users/congbai/Desktop/找文章/dsh-designer/host-integration.test.js>) has 17 passing real-module composition cases. Supporting changes are limited to the authorized async `assetBase` awaits in [SourceWorkflows](</Users/congbai/Desktop/找文章/dsh-designer/source-workflows.js>), and trusted `metadata.boundsVersion` in [CaptureService](</Users/congbai/Desktop/找文章/dsh-designer/capture-service.js>). The bounds version is `{pageRevision, sourceHash: savedSourceHash, viewport: requestedViewport, scene}`; rendered `sourceHtmlHash` remains separate. Capture still uses the single shared BrowserEngine and only reuses default `p1` when it created a new space.

The actual SourceWorkflows → Workspace `project.clone` regression now verifies the cloned capture belongs to the new project. The Core worker repaired ownership fields and the immutable capture/version/hash anchor chain; Source scope/integrity checks were not relaxed.

## Installation effect contract and cold SDK evidence

The initial Host `apply` incorrectly returned its service object. That return was removed. The package now resolves `apply` to `undefined`; the existing `ctx.effect` owns disposal. Fixture coverage now rejects non-function disposer values and exercises the registered tools instead of obtaining a service from the plugin return value.

The still-running Host subsequently reported `TypeError: Invalid effect` after replacing the package with 0.4.1. No additional production change was guessed. The actual installed public Cordis SDK was extracted from the application's ASAR into a temporary diagnostic directory, without reading credentials or profile configuration.

[The actual Cordis 4.1.0 runtime](</var/folders/j6/ml_fgxxj1vgc8fj0ljm93pcc0000gn/T/dsh-cordis-contract-BarbqS/node_modules/@deepseek-ai/cordis/lib/index.js>) establishes the contract at lines 429–460: a function is collected as a disposer, null/undefined are accepted, and a Promise is awaited before the same check. A Promise resolving to a service object is rejected by `safeCollect` at line 434. The reproduced error stack is `safeCollect:434 → Fiber._reload:677 → Fiber.await:728`. A real `Context.plugin` test loads `async () => {}` successfully and rejects `async () => ({service:true})` with that exact stack.

Both the workspace module and the actual installed 0.4.1 module were then cold-mounted with the real Cordis `Context`, `plugin`, `Fiber`, `effect` and `on` implementations. Business dependencies used inert stand-ins; there was no server, GUI, real project I/O or browser TaskSpace. Both complete mounts loaded all three tools and eight routes, and real fiber disposal removed all registrations.

[Installed-module cold-mount evidence](</var/folders/j6/ml_fgxxj1vgc8fj0ljm93pcc0000gn/T/dsh-cordis-contract-BarbqS/installed-cold-mount-evidence.json>) records the outcomes and SHA-256 values:

```text
Cordis lib/index.js:
627409afa06a265f7253200d3bc4648e88805c39fd3768568eb9b9518a31fe8f

Workspace and installed Designer index.js, identical:
466e8b655c6f122f74080a63d62715b62233ca8be8863dd8d728ae52573b7bd4
```

This confirms that the corrected installed bytes satisfy the actual cold Cordis effect contract. It does not inspect or prove the identity of the old module namespace retained by the running Host. A stale generation remains consistent with the repeated live error and the documented package-replacement lifecycle.

Fresh public Host Service inspection exposes `ctx.hmr.runExclusive(() => ctx.hmr.reconcileProfile(requiredEntryIds))`. Its contract detects changed modules below the profile directory and linked package targets, evicts affected modules, stops their running entries, publishes/recomposes the profile generation and starts affected entries using current files. Its scope is profile-wide changed modules, not just Designer. It returns `{warnings, pending, restartReason?}`, where `restartReason` may be `module-comparison` or `package-moved`, and pending modules load after a process restart. This is a reconciliation API, not a process restart API. No public Host process restart/relaunch method was found in the inspected Service directory. No reconciliation, restart, profile write or manual process termination was performed by this worker.
