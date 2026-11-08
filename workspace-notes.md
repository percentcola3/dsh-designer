# WorkspaceService integration and verification

The original Workspace implementation is confined to [workspace-service.js](workspace-service.js), [workspace-service.test.js](workspace-service.test.js), and this document. Lead subsequently authorized the narrow reference-integrity correction and Store availability hardening in [store.js](store.js) / [store.test.js](store.test.js), described below. Workspace-core did not change the Host entry, editor, UI, manifest or package dependencies.

## Construction and public entry

```js
const workbench = new WorkspaceService(owner);
await workbench.execute({ action, projectId, ...options }, {
  signal, policy, user, agent,
  target: { projectId, designId, pageId, scope: 'read|selection|page|design|project' }
});
```

`owner.store` is DesignerStore and `owner.ctx.fs/shell` are the composed public SDK services. `execute({action:'help'})` returns the complete action directory and short shapes; `WORKSPACE_ACTIONS` is also exported for Host help integration. Nested `options` is accepted for the progressive tool wrapper. Changes return `{project,projectRevision,designs,pages,...}`. Existing `artboards` remain the page persistence model; create/clone return both `page` and `artboard` aliases.

Public operations:

- `workspace.open`, `project.open`, `project.initialize`, `project.clone`.
- `design.list/create/update/clone/delete/reorder`.
- `page.list/create/update/clone/delete/reorder`.
- `file.tree/read/create/write/rename/move/remove/copy/import/history/undo/redo/restore/reconcile`.
- `asset.import/replace/copy`.
- `binding.resolve/preview/set/apply`.
- `workspace.state.get/save`, `draft.get/save/remove`, `reference.resolve`.
- `system.list/get/create/import/copy/save/resource.read/export`.

`hasUnsavedDrafts(projectId,{signal})` returns `{dirty,resources:[{resourceId,kind,updatedAt?}]}` and includes persisted drafts and dirty tabs. Delivery uses it before Git operations that would change the working tree.

## Persisted shapes and compatibility

```js
project.workbench = {
  schemaVersion: 1,
  goal: '', requirementsPath: 'docs/requirements.md', rulesPath: 'docs/rules.md',
  designs: [{
    id: 'd-*', name, folder: 'designs/<readable-name>-<id>', platform,
    pageIds: ['a-*'], binding: { mode: 'inherit|independent|none', systemId?, version? },
    appliedSystem?, scenes?, createdAt, updatedAt, deletedAt?
  }],
  sourceProjects: [], // Delivery external registrations; not forcibly moved
  sourceImports: [],  // SourceWorkflows observations and immutable source versions
  files: [{
    id: 'f-*', path, type, mimeType, readonly,
    designId?, pageId?, source?, sha256?, savedFsVersion?, byteLength?, removedAt?
  }],
  fileHistory: { '<fileId>': { entries: [{id,path,contentPath,contentVersion?,sha256,mimeType,type,createdAt}], cursor, conflicts: [] } },
  permissions: { readOnlyPaths?: [], writablePaths?: [] },
  bindingApplications?: []
};
```

`migrateWorkbench(project)` is a pure, deterministic compatibility projection. Legacy pages are assigned to `d-legacy-<projectId>` without changing artboard IDs, hashes, HTML paths, imports, history, or AI session identity. Reading/opening a legacy project performs zero writes. Initialization or the first explicit mutation persists the projection. Unknown workbench fields, including the other workers' source and delivery data, survive mutations. Future schema versions are rejected explicitly.

An empty project receives README, empty user requirements/rules, design/resource entrypoint documentation and a `.gitignore` entry excluding `.workbench/`. No design, business content, or unrequested page is invented. `start.kind` accepts empty/website/mastergo/figma/source and returns the required next source action; capture/import/generation remain explicit source workflow actions. Optional default system selection pins its actual version at initialization.

New pages use `Design.folder/pages/<readable-name>-<pageId>/index.html`. Subsequent page writes keep stable page/file IDs and save a new immutable HTML path. Historical files stay readable. Design/page deletion marks removal, while `deleteFiles:true` performs only removals that do not destroy history; retained files carry `retainedForHistory`. `file.remove` defaults to unregistering; actual file deletion is explicit and rejects versioned resources needed by history with `HISTORY_REFERENCE`.

Project cloning copies saved content and snapshots and preserves page/design/resource IDs within the new project namespace. The clone and its historical snapshots clear task/session anchors, pending binding/runtime/generation state, source write authorizations, shares and capability fields. Nested `.git` and `.workbench` entries are excluded. Source registrations located inside the original physical project root are rebased to the clone root; external observations retain their origin and become readonly with no writable grant. Known export manifests receive the new project owner and a recomputed manifest hash while artifact bytes remain unchanged.

Frozen source capture owner fields, preview and region screenshot project identities are rebased deliberately. Capture JSON hashes, version capture hashes, version hashes, and live/historical source-version anchors are updated together. `context` and observed provenance are preserved, with `clonedFrom` retaining the original project/source/version/hash. Real SourceWorkflows reads and source references succeed after the provider forbids every read into the original project root. Cloning an active file whose actual hash differs from the saved baseline fails and requires reconciliation.

## Save locations

Every project content path is resolved through `store.target('projects/<id>/...')`; the service does not change the Store's library root or invent a competing root map. When a location is selected, initialization calls:

```js
await owner.registerProjectLocation(projectId, location, {
  signal, policy, user,
  asParent: !input.location && !!(input.saveLocation || input.rootLocation)
});
```

`location` is an exact fresh directory. `saveLocation`/`rootLocation` mean a parent under which the owner creates the readable project directory. The Lead's owner adapter privately persists the physical-root registry and updates Store target resolution. The same execution policy reaches the selected location; the service never expands writable roots. Without the adapter, a location request fails before project creation with `LOCATION_REGISTRATION_REQUIRED`.

## Files, resources and references

`file.read({fileId|path,offset?,limit?,revisionId?,encoding?})` returns stable identity, role, MIME, readonly, byteLength and FsVersion. For text it returns equal `text`/`content`, and bounded reads use the inspected `fs.readByteRange`. `offset` and `nextOffset` are UTF-8 byte positions (`offsetUnit:'utf8-bytes'`); limit is at most 30,000 UTF-16 code units, with surrogate and UTF-8 boundaries preserved. Consumers must use returned `nextOffset`. `total` is the byte length. Displayed text keeps bounded window buffers; integrity checks can separately stream complete bytes when a saved FsVersion changes.

Every ordinary read reports `storedHash`, `actualHash`, `externallyModified` and `hashStatus`. Text windows compare a complete-file digest: an unchanged saved FsVersion can reuse its verified digest; changed versions are hashed incrementally in 256 KiB ranges with a final version/size check. A window hash is never compared with a whole-file hash. The version-keyed cache is bounded to 128 observations.

With the Host ResourceService, user binary previews return stat/identity metadata without loading bytes. The Host signs an exact readonly resource capability for streaming/Range/HEAD. A 2 GiB sparse-provider regression proves this branch does not call a whole-file byte read. `actualHash:null` and explicit hash status represent an unverified metadata observation. Model reads and explicit `encoding:'base64'` retain bounded byte/hash validation up to 64 MiB. The compatibility owner without ResourceService retains bounded data-URI previews. A renderer must use an image context for SVG and a sandboxed document context for HTML.

`asset.import`/`file.import` accept `{expectedRevision,path?|name,bytesBase64,mimeType,type?,source?,readonly?}`. `asset.replace` additionally needs fileId and expectedVersion; it retains the resource ID, publishes a new immutable path in the original Design/assets scope and rewrites active page/style/module references. A dependency graph preflights all direct and transitive affected pages, readonly flags, frozen page subsets and Design boundaries before publishing the new asset. Registered pages use `file.write` or reconciliation instead of asset replacement. Original bytes and previous HTML remain available. `asset.copy`/`file.copy` create a new identity and provenance. Importing original reference/source artifacts can mark them read-only; `sources/` and `imports/` artifacts are read-only when discovered through the file view.

Cross-design copies recursively carry HTML/CSS URLs, quoted CSS imports, responsive srcset resources and JavaScript module dependencies. Destinations are readable and unique; repeated copies do not overwrite earlier copies. Controlled `dsh-document-model` JSON rewrites exact page/design/resource identities when cloning designs. DOM node IDs are preserved within each copied page. Missing local dependencies fail explicitly instead of leaving a silently broken copy. Page moves preserve original HTML for snapshots and rebase resource URLs. Asset replacement/moves rewrite active references while preserving immutable page history.

`sourceId + path` on file.tree/read/write/create/rename/move/remove addresses an already registered external source. Delivery registration root/rootPath/path is resolved canonically; source readonly/writable/writablePaths remain authoritative. File operations do not relocate the external source or grant write access merely because it is visible. A partial provider move reports `MOVE_PARTIAL` with destination/source information; it is never reported as a clean move.

`reference.resolve` requires an exact stable resource identity. It resolves pages, nodes, files, Designs, fixed design-system versions, and SourceWorkflows' `x-*` sources. File `sourceVersion` is always that file's actual FsVersion, including copied files; origin metadata stays in `file.source` and a separate `provenance` result. Page sourceVersion remains its artboard revision. File and page resolution reads stable actual bytes, verifies any saved SHA/contentHash, and returns actual `contentHash`, Fs `version` and read-only file/page hash projections. Missing stored hashes are calculated for the result without writing metadata. Read races, stale versions or mismatched saved hashes throw `REFERENCE_VERSION_CONFLICT`; unavailable IDs/files/nodes throw `REFERENCE_NOT_FOUND`. Node lookup reuses the same verified page bytes. Source node/region references still require exact `xv-*` version and capture IDs, with canonical source/capture hashes verified. There is no name or similarity fallback. Saved source versions can remain valid after a newer source observation exists.

## Policy, CAS and conflict recovery

This worker personally called `cordis_inspect_list`, then exact Host Service contracts for `fs` and `shell`, before implementing I/O. Inspected calls used here:

```text
fs.resolve(path,{cwd?,signal?}); fs.processPath(target); fs.contains(root,target)
fs.stat(target,signal?); fs.listDir(target,signal?)
fs.readText(target,signal?); fs.readBytes(target,signal,maxBytes)
fs.readByteRange(target,{offset,length},signal?)
fs.writeText(target,text,{kind:createIfAbsent|replaceIfVersion,version?},signal,policy)
fs.deleteFile(target,{version},signal,policy)
fs.moveFile(source,dest,{expectedSource:{version},expectedDestination:{kind:createIfAbsent}},signal,policy)
shell.execute(shell.resolve({command,stdin,workdir,signal,timeoutMs,onExpiry,stdoutMaxBytes,sandboxPolicy})).result()
```

There is no Host `node:fs` import or fallback. The fixed binary writer runs only through composed Shell. Binary payloads/paths enter as JSON stdin, never as shell code. It rejects path escapes and symlinked directory ancestors, stages and syncs bytes privately, atomically hard-links to an absent destination, then verifies saved bytes through Fs. The explicit binary CAS intent is `createIfAbsent`; replacement and undo publish a new immutable resource path.

Project writes require expectedRevision, file writes additionally require expectedVersion (null only for creation). Project permissions, readonly resource registrations, canonical containment, and read/selection/page/design/project target scopes are checked in code. Selected-node changes must pass the real AST scope checks, including a canonical registered-page source write through the owner helper. Project tasks cannot save shared systems. Switching viewer mode never changes permissions. No operation silently expands sandbox roots.

A stale file version, stale project metadata version, existing create destination, stale draft or stale workspace-state save preserves the incoming candidate in `.workbench/conflicts/c-*.json` and throws `VERSION_CONFLICT` with `details.recovery`. Existing saved bytes are not overwritten on a stale FsVersion. Recovery records include file-history locations when a later metadata publication fails. File contents and project metadata are separate CAS publications; a multi-file failure is surfaced, with immutable versions and recovery data retained, rather than claimed to be one atomic filesystem transaction.

File history stores real immutable byte snapshots in `versions/files/<fileId>/...`. `file.history` exposes IDs, content paths, hashes and the current history cursor. Undo/redo/restore validate the current file FsVersion and historical hash, then restore actual bytes; binary restoration publishes a new path. `file.read({fileId,revisionId})` views that exact saved version read-only.

## Explicit conflict reconciliation and controlled HTML

```js
await workbench.execute({
  action: 'file.reconcile', projectId, fileId, sourceId,
  expectedProjectRevision, expectedVersion,
  mode: 'adopt-external|keep-local|merge',
  content, localContent
}, { user: true, policy, signal });
```

`sourceId`, `content` and `localContent` are optional according to the selected mode. Reconciliation is user-only and rejects an agent even if a user flag is also supplied. Both project revision and the actual disk FsVersion must match. Disagreeing expectedRevision/expectedProjectRevision aliases are rejected. External bytes, a persisted draft or explicit local candidate, and the chosen candidate are preserved before final validation/publication. Alternatives are `fileHistory.conflicts`; committed history contains accepted results. Recovery records remain in `.workbench/conflicts/`. The service does not remove a UI draft.

Standalone files publish a new immutable working path; registered pages receive a new HTML revision. Explicit external-source keep/merge may CAS-write the original working-tree path only after backups, `source.writable === true`, writablePaths and the actual initiating DSH policy permit it. Source and project-metadata publication are separate operations; a late race reports recovery and any already-committed project revision. It does not silently roll back a later human write.

Initial page/file/asset saves retain byte-exact history before external editing can destroy the sole original. Direct file operations protect snapshots, immutable backups, metadata and inactive historical paths. Ordinary saves reject a changed saved baseline. An optional `owner.preparePageHtml(html,{project,page,previousHtml,htmlPath,env})` runs before registered page create/write/reconcile publication. Reconciliation also invokes the real canonical normalize/validate helpers.

An explicitly user-initiated repair of invalid previous controlled metadata may rebuild identity using the valid new candidate. Results and reconciliation records report `diagnostics`, `IDENTITY_REBUILT`, `identityReset:true`, and `invalidatedReferences:true`; old raw backups remain readable. Model operations cannot use that fallback. Undo/restore rejects an invalid historical page before publication. A trusted private `env.immutableDependency:true` grants only a new create-if-absent asset import inside the real selected page's Design/assets directory. Input/options cannot grant it, target scope is preserved, and it cannot replace assets, write ordinary files, or open another Design/canonical alias.

## Bindings and system packages

Project default is zero or one system. Design bindings use inherit/independent/none. Independent and default selections pin explicit immutable versions; publishing a new shared version does not automatically advance a binding. Resolve reports the effective source (`project`, `design`, or `none`), pinned version, actual tokens/guidelines/resources and platform compatibility. Preview returns only truly affected designs, full before/after effective versions and platform differences. Setting a binding never rewrites existing HTML.

`binding.apply` requires explicit design IDs and optional page/node scopes. It copies fixed system resources into `Design.folder/assets/system-<systemId>-v<version>/<logicalPath>`, verifies source hashes, retains original backups, stores a pending application request and returns `{requests,requiresAI:true,rewritesContent:false}`. Each trusted request contains `resourceMap[logicalPath] = {logicalPath,resourceId,fileId,path,sha256,mimeType,fsVersion}` identifying actual project-local copies. Repeated application reuses exact matching bytes. It deliberately does not claim the pages were changed. Lead runs the subsequent scoped AI task, persists real HTML/CSS, and records successful/failed application completion. Delivery must export saved HTML/CSS and local dependencies; this service injects no private preview-only system CSS.

Versioned system create/import/copy/save preserves tokens, guidelines, examples, skeletons, variables and resource metadata. Each resource carries exact `logicalPath`; one version's batch shares `resources/<packageId>/<logicalPath>` so HTML/MD/CSS/image/font relative layouts survive copying and round-trip export/import. Equal basenames in separate folders remain distinct. Copy keeps every source version with independently saved bytes. Saving retains previous immutable resources unless a replacement resource list is explicitly supplied.

Raw `system.import` validates every version before creating a system and requires inline `bytesBase64` or UTF-8 `content`. Resource project/file/source/system IDs and root/directory authority fields are rejected with `PACKAGE_AUTHORITY`; package paths never authorize filesystem reads. Explicit user system create/save can instead select `projectId + fileId` resources, validate their actual saved baseline/version, and retain readonly provenance. Selected known-system copy/save references must match registered source resources. Canonical system roots and resource containment reject aliases into another system or project.

`system.resource.read({systemId,version,resourceId,encoding?})` includes `logicalPath` and `resolveMap[logicalPath] = {resourceId,logicalPath,mimeType,sha256}` for exact lookup. User reads with ResourceService return readonly metadata and actual `fsVersion`, keeping numeric system `version` separate; saved FsVersion mismatch fails, while legacy unrecorded versions are explicit. Model/explicit base64 reads verify actual bytes/hash. `system.export({systemId,version?})` forces verified inline bytes even with user metadata-only previews enabled, returning `{system,filename,mimeType}`. Resource batches and aggregate export bytes are capped at 64 MiB; metadata/version counts are bounded.

## View and draft persistence

Machine-specific state lives only in `.workbench/state.json`, `.workbench/drafts/<hash>.json`, and `.workbench/conflicts/`. Delivery explicitly excludes the entire `.workbench` directory from exports; default Git ignore is initialized with the same exclusion.

State is project-local and preserves tabs, resource identities, temporary/pinned/dirty flags, mode, cursor, scroll, camera, selection, target and references without turning them into document content. Tabs/targets cannot restore into another project. State and drafts use their own FsVersion CAS and never increment project revision or design history. A stale draft removal never deletes the current draft. Missing initial state/drafts return version:null; callers must not replace a newer version using that null token.

## Store availability hardening

The separately authorized Store correction isolates recoverable failures per project, group and system. State retains each saved directory/registered project ID and returns an `unavailable:true`, revision:0 summary with `{error:{code,message}}`; `state.errors` also lists `{kind,id,relative,error}`. A malformed entry is never silently discarded or overwritten. Shape validation occurs before sorting/summary consumption. A valid project whose group is temporarily malformed remains readable/editable and keeps its membership. A registered save root that is missing or temporarily unreadable stays explicitly unavailable instead of falling back to stale internal metadata. Externally repairing metadata makes the next state read available without recovery writes or history loss.

Only known item-level document/read/scope errors are isolated. Sandbox policy denials, AbortError/aborted signals, unknown provider failures, global directory observations and the shared location index still fail upward. A malformed location index reports `INVALID_DOCUMENT` with its explicit `.workbench/project-locations.json` document identity; the service does not guess or reset save roots. Root registration stores canonical process paths, remains idempotent when the user reselects the same canonical alias, and reloads that mapping. The unregistered sibling-project root guard remains active.

Eight Store hardening regressions pass independently, including actual Owner.initialize against mixed damaged metadata. Existing Host tests now use returned project revisions after initialization, explicitly assert all three scoped business tools, and preserve guards rejecting Fs/read/write/shell tools. These are public-contract/in-memory-provider tests, not a claim of live DSH or native filesystem sandbox enforcement.

## Verification and integration status

Latest combined execution passes **207/207**, with zero failed/skipped/todo cases: `node --test store.test.js workspace-service.test.js workbench-integration.test.js ai-workbench.test.js editor-service.test.js document-model.test.js host-integration.test.js resource-service.test.js`. Workspace contains 53 cases and cross-service integration contains 18; all original Workspace cases remain. The old task-admission failure is resolved in Host integration. New evidence includes dual-CAS reconciliation, complete-file range hashes, first-save/raw recovery, legacy identity repair, source working-tree authorization, narrow binary dependency publication, transitive asset impact preflight, clone session/share/FK/hash isolation, exact logical package round-trips, self-contained import authority confinement, real AI stable-ID saves, and ResourceService metadata-only integration. Tests exercise strict public-contract Fs/Shell doubles which reject missing policy/CAS, not the live OS sandbox. Covered behavior includes deterministic migration and zero-write reads, complete identity/history preservation, no unsolicited pages, location delegation, Design/page CRUD/order, recursive dependency copies, exact source IDs, missing dependencies, immutable page saves/moves, resource replacement URL rewrites, binary move/undo, real file history, external/stale metadata conflicts retaining candidates, canonical path and scope rejection, readonly originals, binding matrix/version pinning/platform previews, system package resource round-trip, and independent multi-project tab/draft persistence.

Requirements matrix backend evidence: A05; B07–B09 persistence portions; C06/C11 resource/page portions; D01–D04 and D06 backend portions; E01–E05 business/persistence portions; F01/F02/F09 file/asset entry portions; G01/G06–G08 controlled file/persistence portions. UI behavior, actual AI application, browser interaction, live composed-sandbox enforcement and installed Harness rendering remain integration verification responsibilities. These unit results do not claim those separate checks passed.
