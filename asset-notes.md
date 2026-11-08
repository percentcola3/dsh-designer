# Asset archive integration contract

This module uses only Node built-ins. It does not install packages or change the Harness profile. Its three exports are `buildAssetBundle`, `collectRemoteResources`, and `writeAssetFiles`.

## Build and persist

```js
const collected = await collectRemoteResources(capture.resources, {
  signal,
  sourceUrl: source.url, // the URL explicitly selected by the user
  maxFiles: 300,
  maxBytes: 64 * 1024 * 1024,
});
const bundle = buildAssetBundle({
  importId, // caller creates i-uuid; required, never generated inside the pure builder
  html: capture.html,
  source, // { kind: 'website' | 'figma' | 'mastergo', url, title, width?, height?, ... }
  resources: collected.resources,
  context: capture.context,
  preview: capture.preview, // image base64, or { bytesBase64 }; optional
  warnings: [...(capture.warnings || []), ...collected.warnings],
  failures: [...(capture.failures || []), ...collected.failures],
});
await writeAssetFiles({ store, fs: ctx.fs, shell: ctx.shell, projectId,
  files: bundle.files, policy, signal });
// Persist bundle.html through the existing artboard operation at html/h-id.html.
// Save bundle.record in project metadata, without bundle.files/base64.
```

`buildAssetBundle` is synchronous and deterministic: no network, filesystem, clock, random identifiers, or mutation of its inputs. `html` defaults to an empty string for design-source imports which only provide assets/context. `resources` entries are `{ url, mimeType, bytesBase64, category?, sha256?, byteLength?, finalUrl? }`. Base64 must be canonical. Optional captured SHA-256 and byte length must match the supplied bytes. Browser category aliases `image`, `font`, `stylesheet`, and `other` normalize to the plural archive directories. Recognized font MIME aliases and font magic bytes normalize to actual font types; WOFF2, WOFF, TTF, OTF and common raster-image signatures are checked. Executable HTML/JS responses and active SVG markup become explicit failures.

The return value is `{ html, manifest, files, record }`. A file is exactly `{ path, bytesBase64, mimeType, sha256 }`. Paths are relative to the project root:

- `assets/i-uuid/images/<final-sha256>-<safe-name>.ext`
- `assets/i-uuid/fonts/<final-sha256>-<safe-name>.ext`
- `assets/i-uuid/styles/<final-sha256>-<safe-name>.css`
- `assets/i-uuid/media/<final-sha256>-<safe-name>.ext`
- `imports/i-uuid/source.json`, `manifest.json`, optional `context.json`, optional `preview.png` / `preview.jpg` / `preview.webp` / `preview.gif`

Preview MIME/extension is identified from actual PNG/JPEG/WebP/GIF magic bytes, regardless of the declared MIME. `manifest.preview` is `{ path, mimeType, sha256, byteLength }` when present. Each JSON metadata document must be at most 4,000,000 bytes; oversized context/source/manifest fails explicitly with `METADATA_TOO_LARGE` before writing, matching the store read limit.

The builder does **not** include an HTML file in `files`. The caller saves the returned HTML using the existing artboard API. HTML references begin `../assets/i-uuid/...`, because artboard HTML lives at `html/h-id.html`. Each stylesheet resolves its original relative URLs against its own remote URL (the redirect destination, if applicable); its archived references are relative to `assets/i-uuid/styles/`, so fonts/images use `../fonts/...` and `../images/...`. Nested stylesheet imports reference sibling CSS filenames.

CSS filenames hash the final rewritten bytes. CSS dependency cycles are cut using an inert URL and recorded as `CSS_DEPENDENCY_CYCLE`; traversing resources in sorted URL order makes this deterministic. Both final and original hash/size are stored in the manifest. Local `#fragment` and CSS/data image URLs remain inline. Missing resources become inert `about:blank#asset-unavailable` references and explicit `MISSING_RESOURCE` entries, including every missing font. `src`, resource `href`, `srcset`, `imagesrcset`, `poster`, `background`, inline `style`, style blocks, CSS `url(...)`, and quoted/URL-form `@import` are handled. Normal anchor navigation is preserved after unsafe schemes are removed.

`record` contains:

```js
{
  id: importId,
  kind: source.kind,
  sourceUrl, title, width?, height?,
  manifestPath: `imports/${importId}/manifest.json`,
  sourcePath: `imports/${importId}/source.json`,
  contextPath?, previewPath?,
  integrity: 'complete' | 'incomplete',
  resourceCount, failedCount, totalBytes
}
```

`totalBytes` covers assets and the optional preview, excluding JSON metadata. The manifest is `{ schemaVersion: 1, importId, source, resources, preview?, failures, warnings, integrity }`; each downloaded resource is `{ url, path, mimeType, category, sha256, byteLength, originalSha256, originalByteLength, status: 'downloaded' }`. Failures are `{ url, code, message }`. The two integrity states describe the supplied capture and download results. A capture engine must supply failures for assets it could not enumerate/capture (e.g. inaccessible cross-origin stylesheet rules or missing design fonts); the builder cannot infer unseen resources or unavailable fonts from the absence of evidence. `integrity: 'incomplete'` must remain visible to users; a screenshot does not establish font completeness.

URL metadata removes embedded user/password and credential-like query parameters. Structured metadata recursively drops headers, cookies, auth/token/password/secret/credential/API-key/signature fields. Neither API accepts request-header credentials for download or persistence. Callers should supply purpose-built design context rather than raw request/response dumps. HTML that embeds inline credentials as ordinary visible content is outside automatic credential discovery.

## Bounded downloads and private sources

`collectRemoteResources(seedResources, { signal, fetch?, maxFiles?, maxBytes?, timeoutMs?, sourceUrl? })` returns `{ resources, warnings, failures }`. Seeds may be URL strings or resource objects. Supplied captured bytes are reused without another request; captured CSS is still inspected for nested dependencies. Requests use HTTP(S) only, reject URL userinfo, `credentials: 'omit'`, `redirect: 'manual'`, `referrerPolicy: 'no-referrer'`, and a fixed Accept header. It never forwards caller headers, cookies, Figma tokens, MasterGo tokens, or browser authentication. Authentication failures remain failures; it does not guess authorization.

Defaults: 300 resource attempts, 64 MiB total bytes, 30 seconds overall. Explicit maxima: 2,000 attempts/seeds, 128 MiB total, 32 MiB per file, 120 seconds, and 5 redirects per resource. The queue is also bounded. Streaming responses enforce the byte bound while reading; bytes consumed by invalid resources count toward the total. Caller abort rejects immediately; the independent overall deadline produces `DOWNLOAD_TIMEOUT` failures, including for a custom fetch that ignores its signal. Individual HTTP errors, size limits, MIME mismatches and queued resources beyond the file limit are included in `failures`.

`sourceUrl` must be the user's selected source, **not** a discovered asset URL. Only that origin can introduce private-network requests. Thus a user-selected `http://localhost:8000/demo` can fetch same-origin CSS/fonts. Unselected private seeds, new private origins introduced by CSS, and redirects to Harness localhost are blocked with `PRIVATE_NETWORK_BLOCKED`. Native fetch additionally checks DNS results before public-origin requests; custom fetch implementations own their transport/DNS correctness. DNS preflight is not a replacement for an OS network sandbox against an actively rebinding DNS adversary. No HTML navigation, internal-target crawling, or unrelated application discovery occurs.

## Exact DSH I/O contract

Contracts were read from live Host `Service.listService` for `fs`, `shell`, and `sandboxPolicy` after `cordis_inspect_list`.

- `store.target(relative, signal)` returns an opaque `FsTarget`; it is not a path string.
- `fs.processPath(target)` returns the subprocess-visible canonical absolute path. Never parse `targetKey` or substitute a Host path.
- `fs.contains(projectTarget, fileTarget)` validates canonical containment.
- `shell.resolve({ command, workdir, stdin, signal, sandboxPolicy: policy, timeoutMs, onExpiry, stdoutMaxBytes })` returns a `ShellExecSpec`.
- `await shell.execute(spec)` returns the execution handle; `await handle.result()` returns `{ exitCode, timedOut, aborted, stdout: { text, truncated }, stderr: { text, truncated }, sandbox? }`.
- The current call resolves `policy` using `ctx.sandboxPolicy.resolve({ session: agent.session })` (or the equivalent actual initiating session). Pass the **same exact policy object** to `writeAssetFiles`; do not widen the mode or add roots.
- `store.write(relative, utf8Content, null, signal, policy)` creates metadata with the composed Fs text provider. Fs exposes `writeText`, not `writeBytes`.

`writeAssetFiles` validates identifier/layout, strict relative paths, canonical base64, final SHA-256, the asset filename hash, and total bytes before execution. It obtains every target through `store.target`, checks project containment, then converts targets using `fs.processPath`. Its command is a fixed single-quoted Node program. **All** paths, hashes and base64 enter via JSON stdin, never shell interpolation. No Host `node:fs` fallback exists. If shell is unavailable or denied, the operation fails explicitly.

Inside the composed shell sandbox, the Node child rechecks ancestors/root, directory types and realpaths before and after publication. Symlinks beneath the project are rejected. Binary files use `O_CREAT | O_EXCL | O_NOFOLLOW` and are never overwritten. If a target exists, its regular-file type, size and SHA-256 must match; otherwise `ASSET_CONFLICT` fails the operation. Newly written and existing bytes are read back with `O_NOFOLLOW` and hash-verified before the receipt is returned. Metadata is written only after every binary has been confirmed. A kill can leave an unpublished/partial asset without a manifest; subsequent conflicting bytes fail closed. This is not a multi-file transaction, and directory rechecks do not provide a kernel-level directory-descriptor lock against a privileged concurrent filesystem attacker. The per-call OS sandbox remains the write boundary.

`writeAssetFiles` returns `{ written: [projectRelativePath, ...] }`. Existing identical binary files are accepted. Metadata uses create-if-absent through `store.write`, so publication of an already-existing import ID reports the store's version conflict rather than overwriting its metadata; use a fresh import ID for a new import.

## Preview and route boundary

The HTML sanitizer removes script elements, event attributes, executable URL schemes, frames, objects, base tags, refresh meta, SVG animation/foreignObject, form actions, and script-bearing attributes. It canonicalizes quoted attributes. This bounded static serializer is not a standards-complete browser HTML sanitizer. The renderer must retain an opaque sandbox iframe and deny scripts/forms/top navigation. Keep the captured page's permissions separate from the Harness session.

The resource route belongs to the integrating feature, not this module. Serve only manifest-listed paths under a read-only scoped capability in the URL path, with actual MIME types, `X-Content-Type-Options: nosniff`, no Harness cookie credentials, and font-compatible `Access-Control-Allow-Origin: *`. Apply a restrictive CSP (including sandbox/script denial, especially for direct SVG navigation). The iframe's `assetBase` should resolve `../assets/...` through that capability; stylesheet-relative font and image references then work unchanged. Do not use a bearer credential in the archived HTML or persist the transient capability URL into imported project metadata.

## Verification

Run `node --test asset-archive.test.js`. Tests exercise final file hashes/byte sizes, real binary representation of font and preview bytes, nested CSS and redirect bases, HTML/CSS/data/fragment/srcset rewriting, HTML script removal, incomplete-font manifests, private-network blocking, request/file/byte/deadline bounds, and signal handling. The fixed child script runs inside `node:vm` with an in-memory filesystem for CAS collision, directory-symlink and policy propagation tests. These tests do not invoke the real shell, install the plugin, alter the Harness profile, or prove browser font rendering. The lead owns real composed-shell integration and resource-route/browser verification.
