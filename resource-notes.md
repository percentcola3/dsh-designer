# ResourceService

The runtime module imports Node path/crypto/events, parse5 and DesignerError helpers only. It never uses Host node:fs, child_process, a new server, shell, a writable policy, or project mutation. All project/source content reads use the inspected public `ctx.fs.resolve/stat/contains/processPath/readByteRange(target,{offset,length},signal)` contracts. Tests alone use temporary native files and an ephemeral HTTP test carrier.

## Host integration

```js
import {ResourceService} from './resource-service.js';
owner.resources = new ResourceService(owner);
// After the authorized business read:
value = await owner.resources.decorate(input, value, env);
// Owner execute dispatch:
if (input.action === 'attachment.get')
  return owner.resources.attachment(input, env);
// Register both prefixes in the existing WebServer:
// /api/designer/file-resource/
// /api/designer/source-resource/
handler: (req,res) => owner.resources.handle(req,res)
// On Context disposal:
await owner.resources.dispose();
```

`handle` returns false outside those prefixes, otherwise true after handling the response. No own listener is created in production. `dispose` is idempotent, revokes all tokens, aborts and awaits active transfers. Aborting a request, revoking a resource, or disposing this service never stops a registered source command.

Required owner: ctx.fs, ctx.webServer.getOrigin, store.target/projectRecord, and WorkspaceService (project/entry) for current file identity. `owner.pageAssetBase(projectId,htmlPath,env)` supplies the existing registered-project asset service. `owner.aiWorkbench.resolveAttachment(input,env)` supplies authoritative native attachment history. Optional `owner.onResourceError(error)` is a private diagnostic hook, never sent to a capability visitor.

## User read decoration

Only env.user===true with no env.agent can mint links. A caller payload user:true is irrelevant. Model calls return their original business read result and receive no resource token.

Supported actions:

- `file.read`: the successful result must contain id/fileId, path, MIME and version/fsVersion. It is resolved again against the current project file registry or registered external source. Changed path/identity/FsVersion rejects before a link is issued. Historical file reads remain bound to their exact registered history blob.
- `system.resource.read`: requires systemId, numeric pinned version, resourceId, and result.fsVersion from Core's metadata-only read. The exact physical path comes only from store.systemGet(...).versions[version].resources[id].path. Issuance and every subsequent transfer call owner.workbench.systemTarget(systemId,relativePath,{signal}); older owners use equivalent canonical library/systems/id root and containment checks. A redirected system root cannot become another project's or system's read scope. Nested symlink aliases are additionally rejected. Caller package paths cannot grant access.

Result preserves the business metadata/text window and adds previewUrl, downloadUrl, resourceExpiresAt and, for HTML/Markdown/SVG, assetBase/assetRoot. Old Base64/data-URI download fields are replaced; redundant bytesBase64 is omitted for user views. Binary Core reads must use the owner.resources metadata-only branch, otherwise an after-read decorator cannot prevent the old full read. Explicit Base64/model business reads retain Core's separate bounded semantics.

A token is random 256-bit, in-memory, read-only, expires after 60 minutes, and is bound to one project/fileId/path/version/sourceId or exact system/version/resource. Issuance does not add writable roots or change a policy. At most 1,000 tokens are retained, expired grants are pruned and old grants evicted. Stable repeated reads may reuse the same still-valid grant without extending its original expiry. `revoke(token)` closes all active transfers using that token. No token is persisted in project/source/system metadata.

## Single-file HTTP

URL: `/api/designer/file-resource/<token>/<encoded-safe-filename>`.

Only that exact display filename is accepted. Route names are decoded once per segment, rejecting encoded slashes/backslashes, controls, dot segments, malformed URI escapes and extra path segments. The filesystem target always comes from the stored scoped selection, never the request suffix. Each request rechecks the current project/resource identity and canonical target, including source registration and system-version membership. Project/source symbolic-link aliases are denied even when their target remains inside the root; canonical root aliases themselves are resolved by Fs.

Raw downloads use `?download=1`, Content-Disposition:attachment and exact original bytes. RFC 5987 filenames preserve Unicode, spaces and literal percent signs. Preview and raw source remain separate: HTML preview `?preview=1` can render a bounded derived document; the editable read content and raw download are never rewritten with temporary capability URLs.

Raw binary/PDF/media and source files support:

- GET and HEAD; single explicit, open-ended and suffix byte ranges; 206/Content-Range; unsatisfiable/multipart/overflow ranges produce 416 with bytes */size.
- ETag from scoped path and FsVersion, If-None-Match including weak validators, and If-Range fallback to full 200. Cache-Control is no-cache, so mutable dependencies revalidate.
- At most 64 KiB per Fs byte read and per transfer write. Reads check the same FsVersion before publication and after each chunk. A version change before headers returns 409 with a reopen message. A change after a stream starts destroys the incomplete response rather than pretending it succeeded.
- Backpressure through drain and cancellation through req.aborted, unfinished res.close, the issuing context signal and owner disposal. Normal request completion is not treated as disconnect.

HTML, SVG, XML and other text documents receive CSP sandbox without allow-same-origin or allow-scripts, script-src none, nosniff, no-referrer, no forms, no frames/objects/connect. PDF has fixed application/pdf and nosniff, but no document sandbox flag: Chrome's native PDF plugin may otherwise be disabled. PDF/media visual behavior still requires the lead's actual GUI verification. No Host bridge or credentials are embedded. Cross-origin static resource responses provide Access-Control-Allow-Origin:* without Allow-Credentials, so opaque-frame fonts work anonymously.

## Static source dependencies

HTML/Markdown/SVG user reads from a registered source receive:

`/api/designer/source-resource/<token>/<projectId>/<sourceId>/<directory>/`

Root registration accepts root/directory/path/rootPath and is re-resolved on each request. Unregistering or changing the canonical registered root invalidates the capability. A project/source token cannot be replayed under another project or source ID. The token grants only CSS, JS/mjs, images/SVG, fonts and audio/video extensions beneath that canonical root. Hidden paths, metadata/documents, HTML, JSON, source maps, credentials/secret files and symlink aliases are rejected. Static reads are independent of source readonly/writable flags and never grant writes.

HTML preview uses parse5, a controlled base and relative/root-relative URL rebasing, including srcset with inline data URLs. CSS dependencies rebase local URLs/imports without exposing a generic filesystem route. Local asset URIs remain beneath the admitted source or registered project asset root; unsupported/outside-root URI references cannot become Host API grants. The UI can continue using the unchanged source content and assetBase for its own opaque read frame. Scripts stay disabled on the server preview. This raw viewer does not compile a Vite/server application; actual source execution remains the explicitly controlled runtime URL.

Derived HTML/CSS preview buffers are limited to 8 MiB and still read in bounded Fs chunks with before/after version checks. Larger documents use the paged source reader or exact streaming raw download. This avoids buffering huge HTML solely for a preview. Ordinary media/files have no 64-MiB transport read ceiling.

## Pinned system-package dependencies

`system.resource.read` also returns assetRoot and assetBase. assetRoot is `/api/designer/source-resource/<token>/<systemId>/<version>/`; assetBase appends the selected resource's exact logical parent directory. This uses a separate system-assets capability kind; it cannot be replayed as a project/source grant. Members are frozen from the actual pinned system version's registered resources, never the caller's resolveMap. Only registered CSS/JS/images/fonts/audio/video with an explicit SHA participate; HTML, JSON, documents and unregistered paths are not dependency grants. The selected HTML/SVG itself retains its separate single-file capability.

Each dependency request rechecks the exact live resource ID, logical/physical path, MIME, SHA and saved FsVersion against that frozen member, then uses Core.systemTarget and the canonical alias guard. A recorded FsVersion must still match; legacy entries without it are SHA-verified through bounded 64-KiB reads before any response bytes. Verification is cached only for that exact target/version/SHA and cleared on disposal. Corrupted legacy content fails 409. The cache is bounded to 256 entries.

HTML and SVG server preview URLs use preview=1 and rewrite resource URIs from the saved logicalPath, including CSS dependencies and root-relative URLs. Package CSS rewrites its own imports/font/image URLs to the same signed version root. SVG uses SVG-fragment serialization, with no HTML wrapper. Original download URLs return the original bytes. The UI should render SVG as an opaque iframe; SVG-as-image contexts may prohibit external dependencies. External SVG use references across opaque origins still follow browser restrictions and are not claimed visually successful here. Derived previews and their output size are limited to 8 MiB, while raw downloads retain bounded streaming.

## Native uploaded attachments

`attachment({projectId,receiptId? | attachmentId?}, env)` is owner-only. It calls AIWorkbench.resolveAttachment to verify the exact designer-<projectId> staged receipt or durable reference from that session's real user/message parts. A retired receipt can resolve through admitted native history; a caller path, MIME, nested file/image ref or dimensions never supplies authority. A stage-only native resolver is available when AIWorkbench is absent, but durable IDs require that authoritative history resolver.

Returns `{attachmentId,receivingSessionId,name,mimeType,byteLength,readonly:true,previewUrl,downloadUrl,resourceExpiresAt}`. Tokens use the same single-file route. Images use public attachments.readImage(ref,signal), which verifies normalized format/length/dimensions. For files, a provider-published fileHostPath may be mapped through public Fs.processPathFromHostPath and read with exact bounded byte ranges. No arbitrary Host path is accepted or exposed. When no such backend mapping exists, readFileStream is a forward-only bounded-memory fallback: it skips to the requested range, consumes/verifies the complete immutable stream, then finishes the response. That fallback intentionally omits Content-Length so a late integrity failure cannot look like a completed chunked response; it cannot offer efficient random backend seeks without an actual public range capability.

## Verification

`node --test resource-service.test.js` has 12 tests, including the actual Core systemTarget method against real cross-system/project symlinks, pinned HTML/CSS/SVG/font/image dependency routing, raw-download preservation and legacy SHA corruption rejection. They use real temporary files and real Node HTTP transfers, including a 70-MiB sparse file, exact suffix seeks and full streaming without readBytes, HEAD/ETag/If-Range/416, Unicode/% filenames, scoped aliases/traversal denial, mutable/static version checks, source-root revocation, system snapshot resource identity, source font CORS, active-document CSP, expiry/cancellation/idempotent disposal and native-attachment authority adapters.

The native test FsVersion uses dev/ino/size/mtimeNs. macOS may asynchronously update only ctime metadata, so that field is not treated as content mutation in the test adapter. Production always compares the actual provider's opaque FsVersion exactly and never weakens it. Native attachment/Connection services are authority doubles in these standalone tests; actual DSH storage, browser decoding, PDF rendering and real route registration remain integration verification, not claims made by protocol tests.
