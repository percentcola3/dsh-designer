# Raw upload ingress

`UploadService` is a separate Host module. It does not modify the existing JSON endpoint, create a server, read a personal profile/cookie file, or bypass DesignerStore/WorkspaceService writes. Public SDK contracts for Connection, fileUploads and attachments were read through live Inspect before implementation.

## Integration

```js
import {UploadService} from './upload-service.js';
owner.upload = new UploadService(owner);
// Existing WebServer exact route, before the generic Designer JSON handler:
// path: '/api/designer/upload'
handler: (req,res) => owner.upload.handleUpload(req,res)
// Context cleanup:
await owner.upload.dispose();
```

`handleUpload` returns false outside that exact path. Only POST is accepted. It calls Connection.requestRejection(req) and Connection.admit(req) with the full request, and requires the actual owner principal. A query/body field user:true, policy or mode cannot authorize anything.

The Host adapter must provide the confirmed `owner.resolveUploadPolicy(contextSessionId,signal)` method. It resolves the requested native context Agent, then calls the ordinary owner.policy(agent). With a supplied contextSessionId, a missing resolver fails 503 and never falls back to an unrestricted owner policy. Without a selected context session the normal owner policy applies. The same resolved policy is passed unchanged into Core imports and projectAgent. readonly permits only native analysis attachments, never asset/system writes.

The GUI helper should always send its current contextSessionId, matching normal Owner API calls. The raw request body is the File/Blob bytes. It is not JSON, multipart or Base64. Name and declared MIME go in query; Content-Type is that MIME (application/octet-stream is accepted as a neutral transport type).

## Shared request fields

POST `/api/designer/upload?purpose=...&name=...&mediaType=...&contextSessionId=...`

- name: safe display basename, at most 500 characters, with no directory separators/control characters.
- mediaType: valid MIME string. An explicit non-octet Content-Type must agree with it.
- contextSessionId: current GUI context Session, resolved by the Host adapter described above.
- projectId: required for attachment and asset, omitted for a global system-package import.

Declared Content-Length is checked before any body read and against the actual counted bytes. Chunked/unknown-length bodies are bounded by counting each yielded Uint8Array. Cancelled, incomplete, over-limit or length-mismatched uploads never receive a success response. Request aborted/unfinished response close and the owner's Peer signal cancel the iterator; dispose aborts and awaits all active handlers. Normal request completion is not treated as an abort. There is no blanket whole-body aggregation on the attachment path.

Defaults exposed as service.limits:

| Purpose | Ingress limit | Storage path |
| --- | --- | --- |
| attachment | 512 MiB | Native DSH fileUploads stream |
| asset | 64 MiB | Bounded buffer, existing Workspace asset import/replace |
| system-package | 96 MiB JSON | Bounded UTF-8 parse, existing Core system.import |

The constructor can lower asset/package limits for deployment or tests; it cannot exceed those Core bounds. Native images additionally obey the deployment's authoritative image type/byte/pixel limits. A 64-MiB asset ingress ceiling does not promise that a deployment will admit a 64-MiB raster image. Images accepted through the native image path are decoded/normalized by DSH rather than accepted on declared MIME alone.

## purpose=attachment

Query: projectId, purpose=attachment, name, mediaType, contextSessionId.

The receiving Session is always designer-<projectId>. The module calls `owner.projectAgent({...project, aiSessionId: receivingSessionId}, signal, policy)` so a read-only analysis upload does not bind/write the project just to obtain a native Session.

For images it invokes the exact public `ctx.fileUploads.uploadImageStream({sessionId,data,name,mediaType,signal})`. Other files use `uploadStream({sessionId,data,name,signal})`, whose contract has no mediaType field. DSH owns durable binary storage and receipt staging. After the SDK finishes consuming the bounded iterator, the returned receipt is resolved again for that exact receiving Session; file byte length must equal the counted upload length. An incomplete/unscoped receipt is never returned as success.

Response follows the normal API envelope:

```js
{ok:true,value:{receiptId,file,receivingSessionId}}
// or
{ok:true,value:{receiptId,image,receivingSessionId}}
```

file is native `{attachmentId,name,bytes}`. image is native `{attachmentId,mediaType,bytes,width,height,name?,originalDimensions?}`. No Base64 body or invented image reference is returned. The UI can pass the native receipt value to ai.run.attachments; authoritative admission resolves it again before adding `{type:'file',receiptId}` to the native prompt. Native receipt retirement/history preview belongs to AIWorkbench.resolveAttachment and ResourceService. Storage that had already begun may leave a native content-addressed object after cancellation, as specified by the SDK, but this API returns no fake receipt or success.

## purpose=asset

Query: projectId, expectedRevision, name, mediaType, contextSessionId, and optionally designId, path, type=reference.

After a bounded raw body is collected, supported raster types call the public attachments.validateImage decoder. The exact bytes are passed to WorkspaceService.execute `{action:'asset.import',bytesBase64,...}` in-process; this internal bounded business-service argument is not a JSON network upload. Core owns SHA verification, actual byte publication, project metadata, permissions, history and CAS. SVG/text resources use Core's UTF-8/resource semantics.

With designId and no path, the destination is beneath that design's actual folder/assets/local/r-uuid/name. A supplied path or replacement cannot leave the explicitly chosen design. type=reference is retained, including Core's read-only reference behavior.

Replacement adds replace=true, fileId (or exact existing path), expectedVersion and expectedRevision. It calls Core asset.replace, retaining stable identity and existing dependency-rewrite/history behavior. Missing CAS fails; there is no generic source/private-file write path or implicit override of readonly resources. Source binary replacement is not authorized by this ingress.

Success value is the original Core result: `{project,projectRevision,file,...}`. The UI should read file.id/path/mimeType/sha256/byteLength from that actual descriptor rather than inventing a path from the upload name.

## purpose=system-package

Alias: purpose=system-import. Query needs only purpose, name, mediaType=application/json, contextSessionId; no projectId/systemId/version is required for a global library import.

The bounded raw body is decoded as fatal UTF-8 and parsed as JSON. The module calls Core `{action:'system.import',system:parsed.system||parsed}` with the current resolved policy. Core owns self-contained package validation, per-resource/aggregate decoded-byte limits, logical-to-physical paths, ID handling and immutable version snapshots. Query fields and package references cannot grant cross-project/source filesystem access through this module. Success is `{ok:true,value:<original Core system.import result>}`.

## Errors and verification

Errors use `{ok:false,error:{code,message}}`, with 413 for ingress byte limits, 409 for CAS conflicts, 403 for readonly/write scope or owner denial, 503 for missing authority/SDK adapters, and a clear failure for decoder/JSON/length/cancellation issues. No failure includes a success value.

`node --test upload-service.test.js`: 7 tests, using real temporary storage and raw Node HTTP ingress, exercise >2.5-MiB file attachment/asset bodies, exact receiving Session, no project binding mutation, readonly analysis uploads, image-decoder delegation/failure, actual persisted asset bytes/SHA, design/CAS/replace/reference passthrough, global package import, origin/auth checks, restrictive context policy, counted chunked overflow and cancellation without receipts. Native storage/decoding and WorkspaceService are explicit authority doubles here; those tests verify the boundary and byte flow, not a claim that the installed DSH image decoder or full Core has been reimplemented. The Host/browser integration owner must perform the real composed-service and GUI upload/attachment rendering smoke tests.
