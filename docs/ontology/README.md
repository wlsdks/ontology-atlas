---
uid: c467d5e2-50ac-45f2-bbf0-996a1b6e1dd7
slug: README
kind: vault-readme
title: Ontology Atlas: its own ontology vault
display_ko: 아틀라스 자기 볼트
display_en: Atlas self-ontology vault
created_by: "agent:unknown"
---

# Ontology Atlas: its own ontology vault

This folder is **Ontology Atlas described in its own data format** (dogfooding).
Every `.md` file here is one node of the product's meaning model: the same
`project / domain / capability / element` graph the app draws and the MCP
server serves to AI agents. If you are an agent reading this: this vault *is*
the shared mental model between the humans building Atlas and you.

## Where to start

- `ontology-atlas.md`: the `kind: project` root. Everything hangs off it.
- `domains/`: the six functional areas (agent integration, graph modeling,
  local vault management, onboarding & shell, project portfolio, topology
  navigation). Domain boundaries are human judgment: see `created_by:`.
- `capabilities/`: user-visible features inside those domains, including the
  two agent surfaces: `capabilities/mcp-server` (runtime-advertised tools in
  `mcp/`) and `capabilities/cli-developer-entry` (local commands in `cli/`).
- `elements/`: implementation evidence. Each element names a *role* (flat
  slug); the file location lives in its `path:` frontmatter, never in the slug.

**No document writes the census number**: it rots the moment anyone adds a
node. Ask the vault itself:

```bash
node cli/src/index.mjs overview        # from the repo root
```

## How this vault is written

- Frontmatter is the graph; git is the review. Plain markdown, no backend.
- Every node has immutable lowercase UUIDv4 `uid` identity and a mutable,
  readable `slug` address. Relations stay slug-based; exact agent handoff and
  `urn:uuid:<uid>` export identity use UID. Never hand-patch UID or
  merge-owned `merged_uids`.
- Slugs are flat identifiers under their kind folder (`elements/topology-map-v2`,
  never `elements/src/widgets/topology-map-v2`): path-style slugs collide on
  tail aliases and are rejected at every write door.
- Every node carries `created_by:`: `human` for nodes that exist only because
  a person judged them (project definition, domain boundaries, the charter
  capabilities), `agent:*` for everything derivable from code.
- Agents write through the MCP server (`add_concept`, `patch_concept`,
  `rename_concept`, …) or the CLI (`node cli/src/index.mjs add …`); both stamp
  provenance and run the same construction gates.

## What a section is for

A node body holds two different things, and only one of them earns its context
cost. **Decisions** (which capability sits in which domain, what is explicitly
excluded, which limit must not be crossed, why one shape beat another) exist
nowhere in the source. **Descriptions** of what the code does can be re-derived
by any agent that reads the code.

So the test for a sentence is: *if the source were deleted, would this be lost?*
If no, it is a second copy that can drift out of date. Write it in the code, not
here.

The failure to avoid is not length. It is **a decision wearing a descriptive
heading**. A rule filed under `Core Flow` or `Definition` is a rule nobody can
find. Give it a heading that says what it is:

| Heading | Holds |
|---|---|
| `Definition` | One paragraph. What this node *is*, not how it works. |
| `Core Flow` | The ordered steps, and nothing that is not a step. |
| `Constraints: <topic>` | Limits, fail-closed rules, and what must never happen. |
| `<topic> Contract` | An enumerated obligation another surface relies on. |
| `Inclusions / Exclusions`, `<topic> Boundary` | Where this node stops. |
| `Evidence`, `Grounds` | The source paths that ground the claims above. |

Those names are examples, not a fixed vocabulary: `Identity Boundaries` and
`Active Tool Inventory Contract` were each invented for one node and are the
best sections in this vault. Invent a name when the node needs one.

`tests/contract/vault-section-shape.contract.test.ts` caps a single section at
6,600 bytes. When it fails, the fix is to name the second idea, never to delete
the text.

## Verify the agent loop

After connecting an agent (the installed app's connect button, or
`agent-setup` from this checkout), ask it to prove the connection before it
edits anything. `agent-setup --json` also labels each config's launch scope:
source-checkout configs are **source-bound**, while only the installed app's
bundled binary is portable across working directories. A relative
`./mcp/src/index.js` example copied into an unrelated empty folder is a review
template, not a live connection:

> Use the ontology-atlas MCP server to run `validate_vault`, then
> `query_ontology({ "operation""workspace_brief" })`, then
> `query_ontology({ "operation""health" })`. Tell me whether this vault is
> readable and graph-clean before proposing changes.

The CLI equivalents, from the repo root:

```bash
node cli/src/index.mjs validate docs/ontology
node cli/src/index.mjs health
node cli/src/index.mjs maintenance docs/ontology
node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000
```

In a multi-project vault, select one containment tree explicitly instead of
combining project ontologies:

```bash
node cli/src/index.mjs agent-brief docs/ontology --project <project-slug> --json
```

After accepted concept/relation writes and validation, MCP
`finalize_project_meaning` binds the human-editable project Markdown competency
section to current graph/source provenance. A later `agent_brief` locally repeats the
installed app's bounded probe against the human-bound source root, without returning
that root or raw inventory. A matching fingerprint is `current`; a changed source is
`review_required`; an unavailable recheck remains `review_required` rather than
becoming `verified_current`.

## Relations (frontmatter keys)

| Key | What it expresses |
|---|---|
| `depends_on:` / `dependencies:` | This node depends on other nodes |
| `capabilities: [...]` | Capabilities this domain / project provides |
| `elements: [...]` | Elements this capability / domain uses |
| `domain: <slug>` | Parent domain of this capability/element |
| `relates: [...]` | Loose related-to references |

## Kinds

- `project`: top-level (`ontology-atlas.md`).
- `domain`: a large functional area.
- `capability`: a user-visible feature inside a domain.
- `element`: a smaller unit a capability uses; evidence lives in `path:`.
- `document`: narrative doc tied to the graph.

Full MCP tool reference: https://github.com/wlsdks/ontology-atlas/tree/main/mcp
