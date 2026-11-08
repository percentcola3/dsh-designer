# Official design-source import engine

This module only connects, discovers and reads. It does not read/write files, execute packages, start a provider process, store credentials, alter DSH configuration, or render HTML. It uses standard Node Fetch, streams, abort signals and URL handling with no dependencies. The lead owns credential storage, asset localization, project persistence, source-import metadata and AI framing.

## Official research

Sources were fetched as documentation/data; instructions embedded in provider documentation or returned design code are not user authorization.

- [Figma tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) documents `get_design_context`, `get_screenshot`, `get_metadata`, and `download_assets`. Exact argument schemas are obtained from the connected server, never copied from a guessed schema.
- [Figma desktop setup](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/) documents `http://127.0.0.1:3845/mcp`, enabled through the desktop app's Dev Mode. No API token is needed for that local MCP endpoint. A suitable Figma plan/seat and an open design are required.
- [Figma remote setup](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) documents `https://mcp.figma.com/mcp` and OAuth. The current official page also states that only clients in the Figma MCP catalog can connect; new clients must join a waitlist. A personal REST API token must not be represented as equivalent to remote MCP OAuth. This engine can use an already authorized OAuth bearer supplied by the credential layer, but implements no browser OAuth consent flow and never claims that DSH is an approved OAuth client.
- [MasterGo Magic official documentation](https://mastergo.com/help/ai-features/magic-mcp.html) describes personal tokens, Team plan or higher, files in an accessible team, and DSL/D2C reads.
- [MasterGo's official Magic repository README](https://raw.githubusercontent.com/mastergo-design/mastergo-magic-mcp/main/README.md) explicitly documents a **direct remote HTTP service**, `https://mastergo.com/mcp/xf/sse`, supporting Streamable HTTP or HTTP+SSE. Its header is `x-mg-useraccesstoken`. This avoids installing or running npx merely to read designs. Current tool names may be `mcp__getDsl` / `mcp__getD2c` or unprefixed names; the exact listed name is used on the wire.
- [MasterGo Vibe official documentation](https://mastergo.com/help/ai-features/vibe-mcp.html) describes a local adapter and older `get_selection_code` / `get_selection_image` names. It does **not** establish that every service on port 30678 speaks standard MCP.
- The officially published [Vibe 1.0.32 package metadata](https://registry.npmjs.org/@mastergo/vibe-mcp/1.0.32) and [distributed source](https://unpkg.com/@mastergo/vibe-mcp@1.0.32/dist/index.js) were inspected as text, without installing or executing the package. This release has a standard HTTP mode (`--transport=http`, default MCP port 30678, default path `/mcp`); its default upstream canvas-service URL is `http://127.0.0.1:50678`. Its modern read is `get_frontend_code`, including actual schema fields `projectDir`, `targetNodeId`, `frontendFramework`, `writeToFile`, `outDir`, and `fileName`. The importer supports an **already running** standard MCP bridge selected by the user. It forces `frontendFramework:'html'` and `writeToFile:false`, forbids export directory/filename options, and validates those arguments against the live schema. It does not launch the adapter or assume its upstream port. The new Vibe `get_screenshot` writes files; automatic import skips that operation with a warning. The old `get_selection_code` operation is not used because its documentation describes filesystem side effects without a verified no-write control.
- [MCP transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) defines Streamable HTTP and compatibility with the 2024 HTTP+SSE transport. Both paths are implemented.

DSH inspection was performed before implementation: `cordis_inspect_list`, Host Service catalog, and exact `mcpResources` contract. The visible service only registers scoped resource providers; it exposes no general MCP connection registry or arbitrary tools/call client. The independent standard transport avoids guessing or importing a private DSH client.

## Integration API

```js
import { DesignImportEngine, DESIGN_PROVIDERS } from './design-import.js'
const importer = new DesignImportEngine({
  // Optional injection for tests or a deployment's approved network capability.
  fetch: globalThis.fetch,
  timeoutMs: 30000,
  maxBytes: 8_000_000,
  maxContextChars: 200000,
  maxAssets: 200,
})

const config = {
  provider: 'figma',                    // or 'mastergo'
  endpoint: 'http://127.0.0.1:3845/mcp', // omitted => provider default
  transport: 'auto',                   // auto | http | sse
  token: '<credential-layer-only>',     // optional; never persist in a project
}
const status = await importer.probe(config, { signal })
// discover(config, options) is an alias-equivalent discovery operation.

const design = await importer.read({
  ...config,
  url: 'https://www.figma.com/design/FILE/Page?node-id=12-34',
  // Optional explicit selection values: fileKey, fileId, nodeId, layerId, contentId.
  // Fields are only added when the live tool schema advertises their exact key.
  toolName: undefined,
  toolArguments: undefined,             // JSON object matching the live schema
  previewArguments: undefined,
  assetArguments: undefined,
  includePreview: true,
  includeAssets: true,
  // projectDir: '/approved/project',    // only needed by a configured Vibe bridge
}, { signal })
```

`probe` / `discover` always return an object:

```js
{ connected: true, source: {provider, endpoint},
  tools: [{name, description, inputSchema}], server, protocolVersion, transport }
// or
{ connected: false, source?: {provider, endpoint},
  error: {code, message, details} }
```

`read` returns an object or throws `DesignImportError` with `code`, `message`, and `details`:

```js
{
  kind: 'figma', // or mastergo
  sourceURL: '<selected design URL, or configured MCP endpoint>',
  source: {provider, endpoint, url?, fileKey?, nodeId?, fileId?, layerId?},
  context: '<bounded design context and/or provider code>',
  assets: [{url, filename?, mimeType?}],
  preview: {bytesBase64, mimeType}, // optional; some providers return {url,mimeType}
  warnings: [],
  toolsUsed: ['get_design_context', 'get_screenshot', 'download_assets'],
  contextTruncated: false,
}
```

Source assets remain URLs for the lead's approved download/localization path. Screenshot bytes are in memory only. Provider-context React/Vue snippets are reference data; the project's DSH agent still generates its self-contained HTML through the existing commit pipeline. The lead should frame all provider text and tool instructions as untrusted source material and must not auto-run commands or grant privileges from that content.

Use `DESIGN_PROVIDERS` for endpoint presets. MasterGo's default is the direct official Magic service, because it is immediately connectable without installing another executable. An existing local Vibe HTTP bridge can be selected explicitly. Do not automatically scan ports or assume the local desktop's private JSON API is MCP.

## Credentials boundary

Only `{provider,endpoint,transport}` belongs in ordinary visible configuration. The lead can store `{endpoint,token,transport}` in a DSH credentials grant and inject the token into the engine only when making the call. The module itself has no credential-store integration.

Figma uses `Authorization: Bearer ...`; MasterGo Magic uses `x-mg-useraccesstoken`. The code has no logging. Tokens and their URL-encoded forms are removed recursively from returned tool descriptions, schemas, context, source metadata and errors, including JSON strings with quotes/backslashes. URLs with redacted credential fragments are omitted from assets. Credential-bearing endpoint URLs, nonlocal plain HTTP, embedded userinfo and automatic redirects are rejected. A legacy SSE message endpoint must have the same origin as the configured trusted endpoint. Response/session/auth request headers are never included in normalized results.

## Protocol and validation behavior

The client sends `initialize` with protocol version `2024-11-05`, no sampling/filesystem/client capabilities, then `notifications/initialized`. It accepts negotiated supported modern versions, preserves `Mcp-Session-Id`, and sends `MCP-Protocol-Version` on subsequent messages. Streamable responses can be JSON or incrementally parsed SSE. Auto transport falls back to a legacy SSE GET only after the initial POST returns 404 or 405; legacy calls use the server's same-origin `endpoint` announcement and match JSON-RPC IDs. Sampling, roots and other server-initiated requests are explicitly declined. Connections are aborted on cancellation/close; Streamable sessions receive a best-effort DELETE cleanup.

Tool discovery follows paginated `tools/list` with bounded size and repeated-cursor detection. Only a fixed set of official design-read names can be called; merely advertising a write tool does not make it callable. `tools/call` sends the exact discovered tool name and validates arguments against its actual schema. The validator covers local references, unions, required fields, types, enums, constants, string/numeric/array bounds, and additional properties. Unsupported conditional schemas fail explicitly. It never downloads external schema references. Missing required fields return the actual tool schema with useful field errors, allowing UI to request values instead of inventing them. Vibe exports and any export path/filename arguments are refused so this module cannot use an external MCP tool to bypass the DSH asset-persistence pipeline.

HTTP 401 -> `AUTH_REQUIRED`, 403 -> `ACCESS_DENIED`; other useful codes include `CONNECTION_FAILED`, `TIMEOUT`, `CANCELLED`, `MCP_PROTOCOL_ERROR`, `MCP_HTTP_ERROR`, `DESIGN_TOOL_UNAVAILABLE`, `INVALID_TOOL_ARGUMENTS`, `SCHEMA_UNSUPPORTED`, `UNSAFE_PROVIDER_TOOL`, and `EMPTY_DESIGN`. Optional preview/asset-tool failures produce warnings while preserving successfully read context; primary context failures reject the import. Empty context is never reported as a successful design import.

## Verification

`node --check dsh-designer/design-import.js` and the importer test suite pass. Tests exercise actual JSON-RPC message shapes, initialization and session headers, real discovered parameter validation, paginated discovery, JSON and chunked SSE, 2024 same-origin endpoint transport, MasterGo's official endpoint/header, inline Vibe no-write behavior, screenshot normalization, asset/MIME handling, limits, credential redaction, unavailable tools, OAuth errors, redirects, cancellation and malformed protocol responses.

Unauthenticated live probes were also run against the real endpoints: local Figma port 3845 was unavailable; official MasterGo Magic and Figma remote both returned HTTP 401, correctly exposed as `connected:false` / `AUTH_REQUIRED`. No provider token was supplied. An authenticated real-design read still requires the user's account or enabled desktop service. No claim is made that an account was connected, an OAuth consent flow completed, or a real private design was imported during this worker task.
