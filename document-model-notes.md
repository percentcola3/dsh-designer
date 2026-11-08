# Unified HTML document contract

Only document-model.js and its tests implement this contract; no filesystem or profile access. The sole external dependency is public parse5, installed by the lead. All content is actual HTML, with stable `data-dsh-node` IDs. `data-dsh-hidden="true"` is accompanied by the native `hidden` attribute; `data-dsh-locked="true"` is an editor lock inherited by descendants. Preview and delivery consume the same HTML and controlled metadata/runtime; editor overlays do not belong in saved content.

## Public exports

- `normalizeDocument(html,{previousHtml?,strict?:true,resourceExists?,pageIds?,runtime?:{mode:'preview'|'delivery',pageId?,pageURLs?}}={})` returns `{html,tree,nodes,interactions,scenes,definitions,states,responsive,diagnostics,resources}`. Strict normalization rejects invalid structure, duplicate identity and dangling controlled references instead of silently publishing browser-repaired content. Set strict:false only for diagnostic inspection.
- `validateDocument(html,options={})` returns `{valid,diagnostics,resources}` without throwing for invalid document content.
- `applyDocumentOperations(html,operations,options={})` returns the normalized shape plus `changes:{operations,changedNodeIds,affectedNodeIds,removedNodeIds,insertedNodeIds,invalidatedReferences}`. A batch is one in-memory transaction: it returns no partial HTML on failure. The owner must persist the returned HTML under its filesystem policy/CAS.
- `resolveReferences(htmlOrModel,references)` returns `{resolved,invalid}`. Each reference is a node ID string or `{nodeId,...}`; invalid references retain their identity and a reason. Deleted identities are never redirected to a similar object.
- `documentOperationsHelp(type?)` returns a compact operation index or one exact operation schema with executable examples; interaction and scenario fields are discovered only when requested.
- `interactionRuntimeSource()` returns self-contained browser JavaScript.
- `exportDocument(html,{mode:'delivery',pageId?,pageURLs?,...validationOptions})` returns `{html,diagnostics}`. Explicit editor-overlay nodes are removed and reported on delivery; original user code/content is preserved. The runtime uses `pageURLs[pageId]` or `pages/<pageId>.html` for standalone page navigation.

`nodes` is an object keyed by stable ID: `{id,tag,parentId,childIds,text,attributes,style,hidden,locked,ownLocked,definitionId?,instanceId?,slot?,hash}`. `style` is a kebab-case property map; `hash` is SHA-256 of that element's serialized actual subtree. `tree` contains nested `{id,tag,name,hidden,locked,children}` roots. Script/style/head metadata are not editable layer nodes, but their HTML is preserved. html/body are protected structural nodes.

## Scope and shared-object rules

`options.scopeMode` is `page` (default), `selection`, or `read`. Selection requires nonempty `scopeNodeIds`; it grants the selected nodes and their descendants, never arbitrary ancestor or sibling property edits. Removing a selected node, duplicating it adjacent to itself, and same-parent reordering only change the selected object/its derived copy. Inserting into another parent or moving into another subtree requires that parent in the granted range. New children inherit the grant; removed IDs immediately stop resolving. Locked ancestors block edits. Only an explicit `lock {locked:false}` with trusted `options.allowUnlock:true` can unlock, and it must still pass scope checks.

Shared roots are marked `data-dsh-definition="definitionId"` or `data-dsh-instance="definitionId"`. Corresponding descendants use unique `data-dsh-slot="slotName"` values. A shared edit must state `scope:'instance'` or `scope:'definition'`; it is never inferred. Definition-scope property edits update exact corresponding slots in the definition and instances, report all affected IDs, respect locks and still require authorization for every affected node. Missing/ambiguous slots fail rather than changing a similar node. Structural operations are local instance edits; restructuring a definition must be performed as explicit per-root operations. The implementation records instance overrides; definition changes retain existing overridden fields unless explicitly reset.

## Operations

All operations are JSON objects with `type`. `changes.affectedNodeIds` reports shared definition propagation; `changes.skippedOverrides` reports instance fields retained during that propagation. State variants also require explicit instance/definition scope on shared objects. Removing a definition still used by instances is rejected until it is detached or all its roots are explicitly removed. Targeted operations use `nodeIds:[id,...]`; `expectedHash` (single target) or `expectedHashes:{[id]:hash}` can guard subtree versions. A node must still exist at the moment its operation runs. Selection may be single or multiple.

| Type | Parameters |
| --- | --- |
| `text` | `nodeIds,value,mode?:'leaf'|'direct',scope?`; leaf rejects element children; direct replaces only direct text nodes and retains nested elements |
| `style` | `nodeIds,styles:{cssProperty:string|number|null},breakpoint?,scope?`; null removes a declaration; base edits preserve other inline declarations |
| `attributes` | `nodeIds,attributes:{name:string|boolean|null},scope?`; reserved identity/flags and event handlers cannot be bypassed through this action |
| `visibility` | `nodeIds,hidden:boolean,scope?` |
| `lock` | `nodeIds,locked:boolean`; unlock also requires allowUnlock |
| `insert` | `parentId,html,index?`; index counts element children; fresh identities are assigned |
| `replace` | `nodeIds:[oneId],html`; exactly one root element; that root deliberately keeps the selected region identity; descendants only keep explicit identities or confirmed unique HTML anchors |
| `remove` | `nodeIds`; protected document roots cannot be removed |
| `duplicate` | `nodeIds`; clones inserted adjacent, all IDs fresh; internal references remapped |
| `move` | `nodeIds,parentId,index?`; preserves IDs and flow layout, rejects cycles/invalid HTML nesting |
| `align` | `nodeIds,axis:'horizontal'|'vertical',value:'start'|'center'|'end'|'stretch',layout?:{display,direction}`; layout may carry the bridge's measured parent flex/grid context; uses normal flex/grid/self/text properties, no absolute positioning |
| `distribute` | `nodeIds,axis:'horizontal'|'vertical',gap?:string|number`; selected items must have one parent and all relevant siblings must be authorized; sets the parent's flex flow/gap |
| `interaction.set` | `interaction:{id?,type,sourceId,event?,...}`; replaces by ID or adds a new interaction |
| `interaction.remove` | `id` |
| `state.set` | `nodeIds,states:{default?,hover?,disabled?,loading?},active?`; variants accept `{styles?,attributes?,text?,hidden?}` |
| `state.reset` | `nodeIds`; restores default runtime state/config |
| `scene.set` | `scene:{id,name?,kind?:'empty'|'loading'|'error'|'success'|'custom',nodes:{[nodeId]:variant}},activate?` |
| `scene.reset` | `id?`; deactivates scenes; `remove:true` deletes the named scene definition |
| `definition.set` | `definition:{id,name?,rootId,instanceIds:[ids]}`; all roots must be authorized |
| `definition.remove` | `id`; detaches the authorized definition and its instances while retaining actual HTML |
| `override.reset` | `nodeIds,keys?`; resets selected instance override fields from their exact definition slot |

Breakpoints are `mobile` (max 767), `tablet` (768–1023), `desktop` (min 1024), or `{minWidth?,maxWidth?}`. They are written to controlled real CSS and remain responsive outside DSH.

## Interaction metadata

Supported types are `navigate`, `back`, `modal`, `drawer`, `tabs`, `toggle`, `form`, `filter`, `feedback`, `state`, and `scene`. Default event is click, except form submit and filter input. Common fields are `{id,type,sourceId,event?}`.

- navigate: `targetId?`, `pageId?`, `url?`; target scrolls within the page, pageId uses preview navigation/delivery URL, URL supports safe web/relative/mail/tel links.
- back: no target fields; preview emits a read-only view-history request, standalone delivery calls browser `history.back()`.
- modal/drawer: `targetId,action?:'open'|'close'|'toggle',display?:'block'|'flex'|'grid'|...`; display can explicitly restore a CSS-hidden component's intended layout when revealed.
- tabs: `items:[{triggerId,panelId}],activeId?`.
- toggle: `targetId,property?:'hidden'|'class'|'aria-pressed',className?`.
- form: `rules:[{nodeId,required?,minLength?,maxLength?,pattern?,type?:'email',equalsNodeId?}],successTargetId?,errorTargetId?,successMessage?,errorMessage?`. This is local demonstration validation, never an invented network submission.
- filter: `items:[nodeId],emptyTargetId?,caseSensitive?`.
- feedback: `targetId,text,kind?:'info'|'success'|'error'`.
- state: `targetId?,state:'default'|'hover'|'disabled'|'loading'`.
- scene: `sceneId`.

Every controlled node reference is checked. Selection-scoped deletion/duplication that would invalidate or add interactions with outside sources/targets is rejected and requires a broader explicit grant. CSS-bearing ID duplicates are renamed to retain valid unique HTML IDs and emit DUPLICATE_DOM_ID_RENAMED; inline/class styles and controlled responsive/state configuration are copied, while external CSS rules keyed only by the original DOM ID require review. Deleting content explicitly invalidates attached metadata and returns those invalidations in changes; external references remain unresolved and are never reassigned. Shared updates cannot bypass a selection grant through interaction targets.

Runtime public API: `window.__DSH_DESIGN_RUNTIME__={setScene(id),reset(),getState()}` plus setState/resetScene helpers. It listens for document `CustomEvent('dsh:scene',{detail:{id}})` / `{reset:true}` and `dsh:preview-reset`. Preview page navigation emits only `parent.postMessage({type:'dsh:runtime',action:'navigate',pageId},'*')`; the parent must validate the source and treat this as read-only view navigation. Runtime never consumes Host edit commands, performs privileged requests, or accesses Host services. Back uses the same read-only packet with action `back`.

`getState()` additionally exposes readonly `dirty` and `controls` projections of declared interaction targets: visibility/display, known toggle class tokens, pressed state, known leaf feedback text and native-dialog open flags. They are view evidence, never edit authority. Plain input/change and declared interactions mark dirty; reset clears it. Variant attributes synchronize live `value`/`checked` properties; changing style states preserves temporary input values unless the variant explicitly overrides them. Parent-owned explicit save-scene controls must validate this projection against the current canonical IDs and known schemas before constructing scene operations.

Shared interaction records use explicit per-source IDs rather than implicit event-selector cloning. The Canvas expands a definition edit through exact root/slot correspondences and preserves records marked `instanceOverride`. Updating an existing grouped instance interaction locally marks that override; all source and controlled-target authorization still applies.

## Validation and identity

The initial IDs for HTML without IDs are deterministic SHA-256 identities derived from the exact source bytes and exact AST path/namespace/tag; independent reads, direct transactions on legacy content and restarts reconstruct the same initial IDs. Different source bytes do not inherit IDs through structural position. Existing explicit stable IDs, including src-* browser capture identities, are preserved. When previousHtml is supplied, missing IDs can only inherit from unique exact DOM id/data-dsh-key anchors of the same tag, plus unique structural html/body identities; no text-similarity, nth-child or duplicate-card matching occurs. Ordinary AST text/style/structure edits retain all unaffected identities. Duplicate operations and new inserted nodes never reuse old identities.

Resource validation collects image/src/srcset, media, linked stylesheets, inline/CSS URLs and font references. Unsafe schemes, duplicate DOM/stable IDs, invalid HTML nesting and dangling controlled targets are errors. Pure code cannot assert a relative file exists: pass a synchronous `resourceExists(url,context)` callback to validate it against the owner's manifest/filesystem. Unchecked local resources are reported as unverified instead of silently claiming completeness. Preview isolation/CSP remains the Host/Client responsibility; user scripts are preserved, while new active/global content is refused in selection-scoped structural operations. Full-HTML AI commits must additionally pass the Host's frozen-range comparison and old-lock check: previousHtml normalization proves identity, not authority. No filesystem write, package installation, Host API invocation, fetch, or user message exists in this module.

## Verification

`node --check dsh-designer/document-model.js` passes. `node --test dsh-designer/document-model.test.js` passes 32/32 tests covering deterministic/previous identities, transaction rollback and stale hashes, selected-node authorization, inherited locks and protected descendants, structure roundtrip, scoped active content, resources including metadata assets, shared propagation/override/reset/detach, controlled JSON escaping, real HTML config persistence, and standalone runtime interaction behavior. Runtime unit checks use a DOM API contract fixture and do not claim browser layout, CSP or Harness GUI integration verification; the lead performs those on the real application.
