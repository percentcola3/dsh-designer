# Import service independent review

Scope: this review writes only `import-service.test.js` and this note. The previously delivered browser engine files are locked and unchanged. No bundle installation, project-file write, browser operation, new TaskSpace, or real provider credential use occurred during this review. Production changes are owned by the lead/asset worker.

## Review result

The independent suite uses its own minimal MemoryFS, credential store, fake browser/design provider, and a contract-shaped managed shell receipt. It imports production modules, not another test module. Binary fixtures enter the fake composed shell via the real archive writer's JSON stdin contract; tests never execute its writer command on the host filesystem.

The initial review identified the following integration defects, and production owners fixed them during the review:

1. Browser resources use singular categories (`image`, `font`, `stylesheet`, `other`); archive previously accepted only plural categories. Compatibility normalization is now covered by a passing regression.
2. Archive preview was saved to disk but omitted from `manifest.preview`, so the capability route returned 404 for every screenshot. Manifest preview path/MIME/hash now exists; the exact preview bytes are retrievable in the regression.
3. `importGet` initially accepted a modified manifest with an unrelated importId. The store now verifies schemaVersion/importId and resource/failure array shape. Manifest/context content hashes are anchored in the published project record and checked when reading. Both identity mismatch and unchanged-identity external replacement are covered.
4. Canonical containment initially stopped only at the library root. A project-A asset/context path could resolve into project B inside that library. Store target resolution now checks the canonical project root for every project child; resource lookup also checks project containment. Tests assert refusal *before* reading the sibling file, including when sibling bytes match the legitimate asset hash.

The final input-semantics regression found one additional defect: `allowPartial: 'false'` or `{}` passed the previous truthy check and permitted incomplete publication. The lead fixed the production gate to require literal boolean true; other truthy values now refuse incomplete publication.

A source-level limit mismatch was also reported: archive permits a 32 MiB resource, while resource-route readBytes initially capped reads at 16 MiB. A valid media asset in that interval could be saved but not served. The lead synchronized the route cap to 32 MiB; source inspection confirms the updated limit. This was identified by comparing production contracts, without allocating a large binary fixture.

## Covered invariants

- UI credential save/clear requires `user:true`. Ordinary tools cannot change authority; project design agents cannot invoke the general import tool. Tools cannot inject token/endpoint through source.import options, override action through options, or replace the outer project ID. Public connection/import responses omit saved credentials.
- The HTTP application route admits only a trusted owner peer before business execution. GET cannot invoke source imports. The resource route intentionally uses a random capability plus project ID and manifest membership rather than the application's credential cookie.
- Artboard `assetBase` resolves relative `../assets/...` paths to the correct capability prefix. Unknown tokens, another project ID, unlisted filenames, malformed escapes, encoded separators, traversal attempts and non-GET/HEAD methods are denied. HEAD returns headers without bytes. Opaque-frame asset use has wildcard ACAO but no credential allowance, with nosniff and no-referrer headers.
- Resource bytes must match manifest SHA-256. External changes produce conflict instead of serving altered bytes. Canonical aliases outside the library and into sibling projects are denied before the unrelated target is read.
- Incomplete capture fails before archive publication unless explicitly accepted. Read-only import does not invoke browser capture. One active import per project is enforced, with pending state cleared after completion.
- An edit made during long capture survives import publication, because publication reads the latest project revision. A second race after admission is rejected by filesystem CAS, retaining the winning edit and publishing no stale import metadata. Unreferenced immutable files may remain after a failed CAS, as expected by the storage protocol.
- Import membership is project-specific. Models can use their own designer_project tool to read context, but cannot request another project's import. Context accepts only safe integer offsets and limits 1–30000. Small pages reconstruct exact stored content, including Chinese/emoji data, and terminate correctly beyond EOF.
- Manifest and context external replacements are rejected by the hashes stored at publication. The screenshot preview and browser category mappings remain functional after archive hardening.

## Validation boundary

This suite checks production application, archive, store, route handlers, scoped tools and permission arguments through faithful in-memory dependencies. It does not establish native webServer prefix dispatch, connected Frame rendering/CORS behavior, real credential persistence, a real shell sandbox, real MCP authorization, or provider asset downloads. Those are separate live integration checks for the lead and asset/provider workers. Earlier browser-engine real Chromium validation remains documented in browser-notes.md; this review did not repeat it.

Command: `node --test dsh-designer/import-service.test.js`.

Lead final validation: **22 import-service tests passed, 0 failed**. The complete plugin suite is **99 tests: 98 passed, 0 failed, 1 opt-in browser test skipped**. All independent findings above are resolved. Added regressions also cover long stderr screenshot receipt recovery, source context publication before AI restoration, bounded model screenshot results and lossless JSON tool responses. The installed DSH service separately performed real Chromium navigation, viewport resizing, DOM capture, preview binary persistence and project/HTML publication; its temporary project was verified and removed. Actual GUI visual/Frame CORS behavior and authenticated Figma/MasterGo design fidelity remain outside this in-memory suite.
