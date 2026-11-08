# DeliveryService integration

`new DeliveryService(owner)` exports one business service. No plugin installation, profile edits, or direct Host filesystem/subprocess writes occur. The module uses the inspected `ctx.fs`, `ctx.shell`, `ctx.webServer` and optional `ctx.connection` public contracts. `managed shell` means `ctx.shell.resolve/execute` and its owned process handles; there is no separate live `managedShell` Service. ZIP STORE/CRC32 uses Node built-ins; HTML parsing reuses the project's existing parse5 dependency.

## Progressive discovery

`delivery.help()` is a pure static catalog: `{actions:[{action,description}]}` for 23 source, Git, export and share actions, with no detailed fields in the directory. `delivery.help(action)` returns `{action,description,fields,userOnly,returns,constraints?}` from the actual accepted DTOs. Unknown actions reject. Host translates the user-facing runtime prefix to source before calling this helper. It does not read Context/Store/SDK services, execute an operation or require a project/policy merely to discover fields.

Measured minified help-response size: compact directory 1,998 characters (~499.5 chars/4 tokens), versus 12,949 characters (~3,237.25 chars/4) when all action details are expanded. This measures deferred help-response content, not installed global tool-schema size, system-prompt tokens or actual tokenizer usage. The live global before/after measurement is recorded separately. The added static-help regression brings the Delivery suite to 20 tests.

## Owner and entry points

```js
const delivery = new DeliveryService(owner);
await delivery.execute({ action, projectId, ...input }, {
  signal, policy, user, agent,
});
await delivery.dispose();
```

Owner fields:

- `ctx.fs`, `ctx.shell`, `ctx.webServer`, `ctx.connection` (connection is required to admit owner-only HTTP requests).
- `store`: existing DesignerStore, with projectRecord/mutate/artboardGet and text read/write.
- `workbench.hasUnsavedDrafts(projectId, {signal}) -> {dirty, resources}`: authoritative index of persistent drafts and dirty workbench tabs; Git branch/pull/push refuse to proceed if unavailable or dirty.
- `bindings`: the existing agent-session-to-project map; model calls must be bound to this project.
- Optional `documentExport(html, options) -> {html, diagnostics}`; absent this adapter, the service dynamically uses document-model's `exportDocument`. Controlled independent interaction runtime is retained. Export passes delivery mode, selected page IDs, current page ID and offline relative pageURLs.
- Optional `imageCapture({projectId,pageId,expectedRevision,expectedArtboardRevision,html,logicalPath,files,viewport,region,nodeIds,scene,sceneId,quality,fullPage,background,editorMarks,format,signal,policy}) -> {bytesBase64,mimeType,width?,height?,metadata?,warnings?}`. `files` contains frozen HTML/CSS/images/fonts/JS as `{path,bytesBase64,mimeType}`. Lead owns actual BrowserEngine/CDP rendering. Without it, image export returns `CAPTURE_UNAVAILABLE`, never a fabricated image. Returned magic bytes must match requested PNG/JPEG/WebP. Node selection, scene aliases, zero quality and fullPage:false are preserved. The private export manifest.capture stores requested options plus an allowlisted receipt; savedSourceHash/sourceVersion/boundsVersion retain the trusted saved-page identity separately from rendered sourceHtmlHash; boundsVersion includes only pageRevision/sourceHash/scene and numeric viewport width/height, and runtime/region fields are restricted to their known shape, and capture credentials/capabilities are excluded. Adapter warnings are also exposed through manifest.warnings.

Every call receives the exact resolved current `policy`; it is passed unchanged into shell specs and Store mutations. Registering an external directory never adds writable roots or copies it into the design library. Runtime and Git mutations require `user === true` **and no agent**, even if a model attempts to pass a user-looking field. The outer Host authenticates that boolean, never the options payload.

Host route registration, using the existing ctx.effect cleanup pattern:

```js
ctx.webServer.register({kind:'prefix', path:'/api/designer/share/',
  handler:(req,res) => delivery.handleShare(req,res)});
ctx.webServer.register({kind:'prefix', path:'/api/designer/download/',
  handler:(req,res) => delivery.handleArtifact(req,res)});
```

`dispose()` must be awaited by the owner. Closing a content tab is a view-state operation and must not call source.stop or service.dispose.

## Source projects and runtime

Actions below are `source.*`; the UI's `runtime.*` namespace may be mapped by the Host adapter. Every input includes `projectId`. Metadata mutations require `expectedRevision`.

| Action | Additional input | Result |
| --- | --- | --- |
| source.register | directory (root/path aliases), name?, command?, port?, url?, readonly?/writable?/writablePaths?, expectedRevision | {source,project,projectRevision} |
| source.list | — | {sources,projectRevision} |
| source.update | sourceId, expectedRevision, changed fields | {source,project,projectRevision} |
| source.unregister | sourceId, expectedRevision | {removed,project,projectRevision} |
| source.start | sourceId, command?/port?/url? | {source,run} |
| source.status | sourceId | {source:{...source,run},projectRevision} |
| source.logs | sourceId, stdoutOffset?, stderrOffset? | {run,stdout:{text,nextOffset,lossy},stderr:{text,nextOffset,lossy}} |
| source.stop | sourceId | {source,stopped} |
| source.map | sourceId, generatedFile, line, column?, mapPath? | source location or explicit reference result |

Source records live in `project.workbench.sourceProjects`, distinct from website/MCP `sourceImports`. A source is `{id:'r-uuid',name,directory,root,readonly,writable,writablePaths?,referenceOnly:true,command?,port?,url?,createdAt,updatedAt}`. `directory` and `root` are the same canonical subprocess-world absolute path. The default is readonly; explicit user selection can enable writable source paths, still subject to the current policy and WorkspaceService file API. Commands, URL and port can be cleared with null (empty command/URL also clears). Updating the directory requires the command to be stopped, resolves the new existing canonical root, and updates registration without copying files. Unregister stops and awaits any owned command but does not delete source files.

Run shape: `{id,status:'running'|'exited'|'stopped'|'failed',startedAt,endedAt,exitCode,url,port,readiness:'unverified',error}`. A configured/user-selected URL or a declared localhost port is shown honestly as unverified; command spawn alone is not a successful health check. No public URL is invented. Processes use onExpiry:none and their own abort controller, remain alive across status/log reads and tab close, and are stopped/awaited on explicit stop, call-signal abort or owner disposal. Logs use non-destructive observed stream offsets; common bearer/auth-token patterns are redacted.

Source mapping accepts source-map v3 VLQ mappings, a present generated file, contained real source/map targets and a matching map.file. When sourcesContent is supplied, it must equal the current source bytes. No matching map, indexed/invalid map, outside paths, missing file or stale source content returns `{mode:'reference',referenceOnly:true,reason,sourceId,generatedFile}`. A valid location returns `{mode:'source',referenceOnly:false,sourceId,file,path,line,column,generatedFile,generatedLine,generatedColumn}`. Input/generated/original line is 1-based; column is 0-based. This service never writes source from a canvas operation; a source location is an input to a separately authorized file edit, not a claim that writeback succeeded.

## Git

Readonly actions are `git.status`, `git.diff`, `git.branches`, with sourceId. Diff accepts `paths?` and `staged?`; it disables external diff/textconv. Status returns `{branch,head,files:[{path,index,worktree,from?}],conflicts,sourceId}`; branches returns `{branches:[string],current,sourceId}`; diff returns `{diff,sourceId}`. Git executes via a fixed Node program through composed shell, with argv arrays and literal pathspecs. It never interpolates selected paths or commit text into shell code. GIT_OPTIONAL_LOCKS=0 prevents incidental status index refresh writes; GIT_TERMINAL_PROMPT=0 avoids guessing credentials.

All Git writes are user-only:

- `git.commit {sourceId,paths:[explicit relative regular files],message,expectedHead?}`. It builds an isolated temporary index from HEAD, adds only the selected exact files, verifies changed names, writes a tree/commit, and CAS-updates HEAD. It then synchronizes only selected entries in the real index. Unrelated staged blobs remain staged and never enter the commit. No directories, wildcard expansion, symlink file selection, arbitrary CLI flags, auto push or auto rebase. Return `{success:true,commit,paths,indexWarning,status,sourceId}`; any index-sync warning is explicit. This uses commit-tree and does not run commit hooks.
- `git.checkout {sourceId,branch,create?,expectedHead?}` switches a valid named branch. Selecting an already-fetched remote tracking branch creates or reuses the matching local tracking branch, and refuses to replace a conflicting local branch. `git.pull/push {sourceId,remote?='origin',branch?,expectedHead?}` use an existing configured remote. Pull is always ff-only and no-rebase; push never forces. All three check unsaved drafts, and checkout/pull also refuse an existing dirty worktree/index. Conflicts are surfaced rather than committed/resolved automatically.
- Operational results are `{success,stdout,stderr,status,code,sourceId}`. Existing conflicts, stale expectedHead, dirty state, invalid branches or missing remotes produce explicit errors with status details. There is no automatic add/commit/push/rebase outside the selected commit action.

## Exports

`export.create {expectedRevision,pageIds?/pageId?/artboardId?,designIds?/designId?,expectedPageRevisions?,format?,region?,background?,editorMarks?}`. Formats: zip (default), design-package, png, jpeg, webp. Design and page selection can be combined; deleted designs/pages are excluded. Images require exactly one page. The captured version is the current saved immutable artboard version; no tab/draft/context contents are silently mixed into it.

Export returns `{export,manifest,project,projectRevision}`. Export record:

```js
{id:'e-uuid',format,revision:1,projectRevision,pageIds,
 manifestPath,manifestHash,artifactPath,mimeType,sha256,byteLength,
 createdAt,downloadUrl}
```

`export.list -> {exports,projectRevision}`; `export.get {exportId} -> {export,manifest,projectRevision}`. A record references a manifest, never base64. Metadata lives under `workbench.deliveryRecords={exports:[],shares:[]}`. Export files are under `delivery/e-uuid/files/<original-project-relative-path>`, with artifact and private manifest in that same export directory. Existing artboard paths such as html/h-id.html and deeper Design.folder/pages/.../index.html are retained. Resolving dependencies starts from each real file's directory and recursively copies/rebases local CSS URLs/imports, image/font/media resources, module script imports and their static resources. Root-relative static references become relative portable references; JavaScript module imports retain ./ or ../ instead of becoming bare specifiers. Unicode, spaces and literal percent signs are correctly URL-encoded. Static new URL(..., import.meta.url) assets are collected. Unresolved dynamic module specifiers fail explicitly. Assets referenced only by interaction/state/scene style variants, responsive rules and controlled attribute overrides are collected too. The exported controlled model is restricted to its known design schema, and runtime configuration is rebuilt from delivery mode/pageId/pageURLs so private context, preview bridge credentials and host assetBase fields are not serialized. Local fragments/data URIs remain inline. External anchor navigation remains navigation. Controlled page-ID navigation to an unselected page fails document validation so it cannot silently lose its required target; include that page for a complete multi-page interaction export. A missing, unarchived remote, unsafe, or unsupported resource fails export explicitly; it never emits a ZIP claiming to be complete while leaving remote fonts behind.

The output ZIP includes index.html, selected page HTML, all collected static dependencies, and the independent interaction runtime supplied by document-model. A design-package additionally includes editable selected design/page metadata in design-package.json; it excludes project secrets, requirements/rules, source conversations/context, and all .workbench machine tabs/camera/drafts/conflicts. Local links to nonselected pages are disabled and reported as warnings. Dynamic server backends/bare JavaScript module specifiers require a built/bundled static source, rather than an invented offline substitute.

ZIP32 uses method STORE, UTF-8 names, deterministic timestamps, real local/central headers and CRC32. Bounds: 100 pages, 4,000 entries, 32 MiB per content file, 128 MiB content. Binary publication uses fixed shell code and JSON stdin, create-if-absent/no-follow, realpath and SHA checks. Snapshot content and the ZIP/artifact are sent in separate bounded writer calls so a large package is not duplicated in a single stdin payload. Archive-directory overhead is independently bounded by 16 MB beyond the content cap. A file with different existing bytes is never overwritten. Publication is not a multi-file transaction; a project CAS failure can leave an unreferenced isolated export folder, not a falsely published record.

Artifact downloads at `/api/designer/download/<projectId>/<exportId>` require a live owner Connection admission and verify stored artifact SHA before serving. No unauthenticated ZIP endpoint exposes private design-package metadata.

## Versioned local preview shares

`share.create {expectedRevision,exportId?,scope:'owner'|'local-link'|'unlisted',...exportSelection?}` is always user-only. Without exportId it first creates the saved-version snapshot export; with exportId it binds that immutable export. Scope is mandatory, never inferred. Local service URLs come from webServer.getOrigin, with random 256-bit capability in the path. The returned share URL ends at the capability root and redirects to the frozen entry page, preserving relative asset bases; explicit share version updates keep that stable link. The response is `{share,project,projectRevision}` where share includes `{id:'s-uuid',revision,exportId,projectRevision,entryPath,scope,hosting:'local',url,createdAt,updatedAt,revokedAt}`. Local hosting is labeled local even for an unlisted capability; it does not claim a deployed public internet address. External hosting without a configured real deployment service returns PUBLISHER_NOT_CONFIGURED.

- owner: the stable entry requires the correct capability **and** actual ctx.connection.admit(req) owner admission. The owner is redirected to an in-memory, one-hour readonly preview ticket beneath that share path. This ticket contains no DSH/session credential, is not persisted to the project, and grants only the already-frozen public snapshot. Opaque iframe font/ES-module requests can then omit DSH cookies and still load the exact allowlisted resource. Every ticket is bound to project/share/export/share revision; scope/version updates and revocation immediately invalidate it. Expired tickets require reopening the stable owner entry.
- local-link: correct capability and loopback socket remote address.
- unlisted: capability grants readonly preview; no account/DSH session token is embedded.

`share.list -> {shares,projectRevision}`. Model calls do not receive capability or share URL. Delivery also strips capability keys from model export results that include project metadata; outer project.get/workspace.open model entry points must apply the same redaction rather than exposing raw private records. `share.update {shareId,expectedRevision,expectedShareRevision,scope?,exportId?}` changes only the explicitly selected scope/export; it never refreshes from edited drafts on its own. `share.revoke` with the same revision fields persists revokedAt. Reusing an old URL then returns 404. Every request reads current metadata and rechecks its share revision after reading snapshot bytes, so revocation works across service instances/restart and blocks a response revoked during I/O rather than merely deleting an in-memory link.

The preview handler permits GET/HEAD and exact manifest-listed public HTML/CSS/images/fonts/media/JS only. Source package metadata, manifests, project JSON, requirements, imports/context/chat, hidden state and arbitrary paths are never exposed. Every served snapshot file is checked against size/SHA. Responses carry no-store, nosniff, no-referrer, font-compatible Access-Control-Allow-Origin:*, and a CSP sandbox without allow-same-origin. Only frozen inline script hashes, explicit hashes for existing inline event handlers (CSP unsafe-hashes, not unsafe-inline script), and scripts/styles/media beneath that capability/ticket path can load; connect/frame/object/form/base access is denied. Untrusted page JS is isolated from Harness cookies and APIs by the opaque sandbox and CSP. This boundary still needs the lead's actual Host/browser verification, including font CORS and declarative interactions.

## Verification and remaining integration ownership

Run `node --test delivery-service.test.js` (19 tests passing at handoff). Tests create only unique UUID directories beneath the test cwd and validate exact canonical cleanup paths before removal. Native Fs and bash adapters exercise actual child writer bytes and actual Git commits; they do not claim to exercise the deployed DSH sandbox, authentication cookies, web route registration or browser rendering. Tests independently inspect ZIP headers/CRC/files, ensure staged isolation, exercise lifetime abort/disposal and local share permissions, revision freezing, revocation and tamper rejection. Lead supplies and verifies the real imageCapture adapter, Host routes, authenticated user authority, async disposal registration and browser runtime/font behavior. No external host deployment or actual remote account push occurs during these tests.
