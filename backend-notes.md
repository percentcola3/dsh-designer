# Designer Host integration notes

## v0.3 import update (supersedes older transport/IO notes below)

Runtime now adds `DesignerImports`, `BrowserEngine`, `DesignImportEngine` and the asset archive module. All use Node built-ins; no dependency installation is needed. Host injects `credentials` and `shell` as well as existing services.

- `designer_import` is a compact global entry with deferred action fields through `help`; its first-turn schema cost measured by the live DSH fixed heuristic is 746 → 957 tokens across the two Designer global schemas (+211), excluding conversation context. Browser tool output omits base64 screenshots; the authenticated UI receives them. Project agents only read their own `import.get` / `import.context` through `designer_project`.
- UI and tools share `DesignerImports.execute`. Connection save/clear stay user-only; credentials use the DSH record store and are not written into projects. Probes consume real MCP tool schemas. Unauthorized providers fail explicitly.
- Browser CLI execution uses the resolved per-call sandbox policy and managed `shell.resolve/execute`. CLI console receipts arrive on stderr; both stdout and stderr spilled output must be restored before parsing a large screenshot. Project assets use fixed Node writer code with JSON stdin, canonical per-project paths, exact sandbox policy, create-if-absent bytes, and read-back SHA verification. JSON publications remain composed-Fs CAS writes.
- Project HTML retains portable `../assets/...` references. The authenticated artboard read supplies a temporary preview base. `/api/designer/resource/<capability>/<projectId>/...` exposes only manifest-listed asset/preview bytes, with bounded reads, project canonical containment, hash checks, CORS for opaque-iframe fonts, nosniff and sandbox CSP. This is a scoped read capability; it does not grant access to HTML, context, metadata or credentials.
- Source imports are immutable `imports/i-id` records and `assets/i-id` resources. `importCommit` publishes against the latest revision following download, with CAS protecting the final race. Manifest/context hashes catch external replacement. Bounded context pages expose `nextOffset` and complete source strings are retained within the 4 MB metadata limit.
- Default incomplete imports fail before publishing. Only literal `allowPartial:true` opts in; UI imports remain strict. Resource failures and provenance remain in the manifest.

The installed service was exercised with an owned temporary project: real Chromium navigation, viewport change, static DOM capture, preview binary publication and HTML/project CAS all succeeded. Temporary test data is cleaned after verification. Separate real Chromium fixture tests cover original CSS/image/font bytes; native-local shell integration covers binary/CSS archive and conflict refusal. Figma desktop was not enabled and official remote endpoints required authorization, so account design fidelity is not claimed. Actual GUI visual/mouse verification remains unavailable.


The Host implementation is ordinary JavaScript ESM. Runtime imports use only `node:path`, `node:crypto` and the sibling store module. No package installation or build is required by these files. The lead owns the manifest, patch, Client and display resources. This worker has not installed or activated the bundle.

## Inspected contracts

Discovery began with `cordis_inspect_list`, followed by exact Host `Service.listService` queries for `webServer`, `connection`, `fs`, `sandboxPolicy`, `agents`, `tools`, `skills`, `sessions`, `sessionController`, `workingDirectory`, `agentDefaultModel`, `systemPrompt`, `configEditor`, `agentPresets`, and `permissionPresets`. `Event.listEvents` confirmed serial `agent/created`. Config queries located the installed packages and schemas. Installed package documentation and built code were read with the Host read tool, including files inside app.asar; no shell reads of app.asar were used.

- `webServer.register({kind:'exact',path:'/api/designer',handler})` owns the route.
- `connection.admit(req)` applies the native trusted Host/Origin and credential checks and supplies the live Peer. Only an owner principal is accepted.
- `fs.resolve/contains/stat/readText/listDir/writeText` provide all runtime filesystem access. Every write supplies `FsWriteIntent` and the exact resolved sandbox execution policy.
- `sessionController.resolveAgent/create` discovery established the session domain; implementation uses `resolveAgent`, `prompt`, `state`, `events`, and `cancel`, plus `agents.create` for dedicated design sessions.
- `agentPresets.compositionInventory()` selects an existing non-PTC preset, preferring `minimal`. The active global native executor was confirmed by Config discovery and its installed source. No preset or profile composition is rewritten. New sessions explicitly record the selected existing preset rather than inheriting a possibly PTC default.
- The existing standard `sandbox/mode` event and its `{mode}` payload were verified in the installed sandbox-policy package; its public setter is precisely `session.append('sandbox/mode',{mode})`. New design sessions inherit the initiating policy at creation, capped at workspace-write, with cwd equal to the exact project directory. Existing session policies are preserved.

## Configuration and root selection

Host row configuration accepts `workspaceRoot` (an absolute workspace path) and optional `libraryRoot`. The default library is `<workspaceRoot>/DesignerLibrary`. A relative library path cannot contain parent traversal. Absolute configured roots may be outside the workspace; all data paths remain canonically contained beneath the selected root, and the composed filesystem still enforces the caller's write policy. A full-access owner can select and write an external root; workspace-write and read-only callers cannot use that selection to exceed their policy.

`root.set` is user-only and uses `configEditor.edit(ctx.fiber.entry,...)`. Normal configuration reconciliation restarts the Host plugin; callers should reload state after completion. It rejects outside roots unless the current user context is full-access. It never edits the profile patch directly.

The UI can pass `contextSessionId` with every request. A nonempty ID is resolved to an Agent, then used only as the sandbox and skill context. This identity is separate from the scope-bound Agent used by dedicated project tools. Null, empty or omitted context uses the deployment default policy. `state.permissions` reports the resolved mode and workspace root so missing context does not silently imply write permission.

## Transport

POST `/api/designer` with `Content-Type: application/json` and `{action,...parameters,contextSessionId?}`. GET `/api/designer?action=...` supports only the read actions below. Same-origin browser fetch should include normal credentials. There is no custom bearer token or permissive CORS route.

Success is `{ok:true,value}`. Failure is `{ok:false,error:{code,message,details}}`. Conflicts use HTTP 409, missing records 404, sandbox refusals 403, invalid inputs 400. The body cap is 2.5 MB and HTML is capped at 2 MB of UTF-8. Returned HTML is JSON text, never rendered by this Host route. The Client should use an isolated sandboxed iframe and validate postMessage sources.

| Action | Parameters | Value |
| --- | --- | --- |
| `state` (GET allowed) | none | `{root,workspaceRoot,permissions,projects,systems}`; project summaries include artboards and omit history |
| `project.create` | `name,description?,platform?:'web'|'mobile'` | complete project |
| `project.get` (GET allowed) | `projectId` | `{project,artboards,history}` |
| `project.update` | `projectId,expectedRevision,name?,description?,skillNames?,systemId?,systemVersion?,canvas?` | complete project |
| `project.archive` | `projectId,expectedRevision,archived?` | complete project; `archived:false` restores |
| `artboard.create` | `projectId,expectedRevision,name,platform?,html?,position?,viewport?` | `{project,artboard,projectRevision}` |
| `artboard.get` (GET allowed) | `projectId,artboardId` | `{artboard,html,projectRevision}` |
| `artboard.commit` | `projectId,artboardId,expectedRevision,html,expectedArtboardRevision?,name?,summary?,position?,viewport?` | `{project,artboard,projectRevision}` |
| `artboard.layout` | `projectId,artboardId,expectedRevision,position?,viewport?,name?` | same shape, without a new HTML snapshot |
| `snapshot.restore` | `projectId,snapshotId,expectedRevision` | complete restored project with a new revision and undo snapshot |
| `skills.list` (GET allowed) | `projectId?` | `{skills:[...]}` with user-selectable skill summaries |
| `skill.get` (GET allowed) | `projectId?,name` | `{name,description,content,resourceBase?}` |
| `system.create` | `name,description?,platforms?,tokens?,guidelines?` | complete versioned design system |
| `system.get` (GET allowed) | `systemId` | complete versioned design system |
| `system.save` | `systemId,expectedRevision,name?,description?,platforms?,tokens?,guidelines?,summary?` | complete system with appended immutable version |
| `system.archive` | `systemId,expectedRevision,archived?` | complete system; reversible archive creates a version |
| `ai.run` | `projectId,prompt,artboardId?,mode?:'generate'|'edit',selection?:{selector,tag,text,outerHTML}` | `{sessionId,accepted:true,projectRevision}` |
| `ai.status` (GET allowed) | `projectId` | `{sessionId,running,messages:[{role,text}],error?}` |
| `ai.cancel` | `projectId` | `{sessionId,accepted}` |
| `root.set` | `root` | `{root,saved:true}`; user-only |

A project contains `id,revision,name,description,platform,skillNames,skillContextSessionId,systemId,systemVersion,canvas,artboards,history,aiSessionId,archived,createdAt,updatedAt,schemaVersion`. Canvas is `{x,y,zoom}`. Each artboard contains `id,name,platform,revision,position:{x,y},viewport:{width,height},htmlPath,contentHash,createdAt,updatedAt`. History entries contain `id,revision,summary,createdAt`. Design systems contain `id,name,description,platforms,archived,revision,versions,createdAt,updatedAt,schemaVersion`; each version has `version,tokens,guidelines,summary,createdAt`.

The design-system editor should use `versions.at(-1)` for current tokens and guidelines. Project bindings pin a particular version instead of automatically following later system saves.

## Durable data and conflicts

Each project has a real directory under `projects/<projectId>`. Its atomically replaced `project.json` is the publication point. HTML lives in immutable, uniquely named `html/<id>.html` files. A mutation writes its new HTML and previous-state snapshot first, then conditionally publishes project metadata with `replaceIfVersion`. A loser in a concurrent save cannot overwrite the winning metadata. A crash can leave unused immutable files; it cannot publish a pointer before its data exists. No automatic orphan deletion is performed.

A prior-state snapshot has its own immutable JSON file. Restoring validates the referenced HTML, publishes a fresh project revision, and retains an undo snapshot of the state being replaced. Snapshot metadata retains 200 entries; layout/canvas-only saves do not create HTML history. Design systems retain up to 100 immutable versions in their atomically version-checked document.

HTML hashes detect external changes to files that Designer treats as immutable. Reads, replacement and snapshot restoration reject mismatched hashes rather than silently accepting modified history. These files are ordinary local files, so an external editor can alter them; import external work as a new artboard instead of editing historical storage in place.

## AI and tool surfaces

- Global `designer_manage` exposes the same service to ordinary Agents, deriving sandbox permission from `exec.agent`. It does not restrict or reconfigure the caller's ordinary session and cannot change the root.
- Each project owns a deterministic, independent session ID `designer-<projectId>`, persisted in the project. Existing sessions resume with their history. No API key is collected; provider/model selection comes from DSH's default-model service.
- Dedicated design sessions receive `designer_project` and `designer_commit_html`. Other tools are guarded, and global tool definitions are restricted away for that Agent only. This prevents shell/file writes from bypassing the commit protocol.
- `designer_project` loads metadata/HTML/skills on demand. Its history page is 10 records; `historyOffset` and `historyTotal` make older records retrievable. `designer_commit_html` either creates an artboard or replaces a selected one and requires the current project revision.
- Source skill-provider scope is preserved separately in `skillContextSessionId`. Listing or loading uses the initiating ordinary session's providers, even though the design session selects a minimal native preset. Full bodies are loaded on demand; only selected summaries enter the generation task.
- UI should retain/subscribe to the actual returned DSH session. There is no `agent/status` polling loop or plugin SSE stream. Call `ai.status` once on a relevant session notification and refresh project data after completion. User-visible status messages strip internal task context and HTML payloads.

## Validation

`node --check dsh-designer/index.js`, `node --check dsh-designer/store.js`, and `node --test dsh-designer/store.test.js` pass. Sixteen tests exercise initial empty state, persistence reconstruction, Web/Mobile defaults, stale and simultaneous commits, snapshot recovery, geometry-only saves, system version pinning, traversal/symlink containment, sandbox refusals including external full-access roots, external-version and HTML-integrity changes, bounded input, shared UI/tool business operations, independent AI contexts, source skill scope, new-session policy caps, cancellation, sanitized AI status, trusted-peer rejection, GET nonmutation and conflict responses.

Tests use a contract-faithful in-memory composed filesystem and mocked Agent/session services. Live bundle activation, actual model generation and Client rendering remain integration checks for the lead. No claim of live visual verification is made here.
