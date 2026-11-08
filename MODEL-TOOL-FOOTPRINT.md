# Designer model-tool footprint

Baseline artifact created: 2026-11-05T08:51:57.754Z.

The before sample is the actual Host Tool.listTools result visible to this delegated Agent before the lead installs v0.4. It is not reconstructed from source or package-cache metadata.

| Live global tool | Schema chars | Approx. tokens (chars/4) | outputSchema reported |
| --- | ---: | ---: | --- |
| designer_manage | 2964 | 741 | no; not inferred |
| designer_import | 844 | 211 | no; not inferred |
| **Total (2)** | **3808** | **952** | |

Not present in this live sample: designer_workbench.

Measurement serializes only the exact reported name, description, parameters and optional outputSchema, without whitespace. The sum excludes array framing, provider/MCP wrappers, system prompts and conversation text. chars/4 is a size heuristic, not an actual tokenizer measurement. Unreported output schemas are neither invented nor counted as empty schemas.

The complete extracted schemas and raw-inspect capture hash/path are retained in the adjacent JSON artifact. Other tools from the raw registry are not copied into this report.

After: pending the lead’s installed notification and a fresh live Tool.listTools query. No before/after reduction claim is made. The after total must include any newly installed designer_workbench tool; compatibility-only subset changes will be shown separately.

Scoped schema construction: not yet sampled. If added from production Service factories with contract stubs, it will be explicitly labeled authored/pure construction, not a live scoped-Agent, UI, permission or runtime execution test.
