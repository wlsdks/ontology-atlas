# MCP dogfood round 4 — Builder · Git history · live toolset proof

Date: 2026-07-23
Target: `main-2` source checkout + `docs/ontology` dogfood vault
Runtime: Node 24

## Why this round was different

Earlier rounds emphasized blank-folder bootstrap, destructive-write safety, and
general graph health. This round followed four different agent moments:

1. an upgraded repository whose already-running MCP client still exposes an old
   tool list;
2. a coding agent asking which commits changed the ontology, without reading
   unrelated repository history;
3. an agent handing a persisted graph focus to the visual Builder;
4. a mature repository running `index_project`, where raw candidates must not
   be confused with net-new vault work.

The PO verdict was **Build and verify** for a narrow read-first slice. No remote
Git transport, hidden UI automation, or new database was added.

## Live evidence

The connected Codex MCP namespace exposed 25 Atlas tools. The source checkout
at the same moment contained the newer 31-tool server. Because the running
25-tool process did not include `connection_info`, the agent could detect the
missing names but could not ask the server for a self-describing inventory.
This proved a real restart/version contract gap rather than a hypothetical one.

The connected MCP was then used against the real dogfood vault:

- `list_kinds`: 105 nodes;
- `validate_vault`: 105 files, 0 problems, 0 path drift;
- `compile_ontology`: 105 nodes, 571 edges, 0 issues;
- `workspace_brief`: one connected component, no dependency cycle;
- `find_evidence({title:"Builder"})`: Builder write/focus/relation capabilities
  found without opening source files;
- `find_path(builder-canvas-polish → mcp-server)`: a three-hop ontology route;
- `relation_check(builder-canvas-polish → mcp-server, relates)`: `safe_to_add`
  under an existing capability-to-capability schema;
- `index_project`: 906 source files scanned, 119 thresholded module edges, 53
  raw concept candidates, 529 import edges with absent endpoints, and 27 vault
  dependency edges requiring staleness review.

An intentional error-recovery probe called `find_evidence({query:"Builder"})`.
The runtime correctly rejected the unknown key and returned structured
`unknown_argument` repair fields, but the server instructions themselves used
the same wrong `find_evidence(query)` spelling. The repaired call with `title`
worked immediately. The guidance, not the validator, was defective.

## Changes selected from the evidence

An independent Luna pass added 33 temporary-fixture scenarios after the first
implementation. It found two real asymmetries: Builder emitted `domain:auth`
but could not accept it back, and `index_project` treated an ambiguous `shared`
tail alias as new. Both were fixed with round-trip/review-bucket regressions.
The same pass established Git history behavior for Unicode, spaces,
sibling-prefix paths, unborn repositories, and shallow clones; its
completeness concern led to the metadata below.

### 1. `git_history` read tool

Returns newest-first commit hash, short hash, subject, and authored timestamp
for commits that touched the active vault pathspec. It excludes commits that
changed only repository files outside the vault. `limit` defaults to 20 and is
bounded at 100. `limited` / `hasMore`, shallow-repository state, and
`historyComplete` keep agents from treating a truncated view as complete
history. It never initializes, fetches, pulls, commits, or pushes.

This closes the common “what changed in our meaning model?” question without
giving an agent remote-transport authority.

### 2. `query_ontology({operation:"builder_context"})`

Returns:

- the canonical `/ontology/edit/?node=<kind:slug>` focus URL;
- a bounded persisted-vault neighborhood;
- each visible node's `canvasPosition` and `expected_mtime`;
- the explicit low-level write sequence:
  `add_concepts → relation_check → add_relations → patch_concept`.

It explicitly reports `unsavedDraftsIncluded:false`. MCP cannot inspect an
ephemeral browser/desktop canvas draft until the user saves it to markdown, and
the response does not pretend otherwise.

### 3. Live toolset proof in `connection_info`

`connection_info.server` now returns:

- `readOnly`;
- the actually advertised `toolCount`;
- ordered `toolNames`;
- SHA-256 `toolsetHash` over the advertised definitions.

The same call fingerprints the filtered 19-tool read-only surface when
`OATLAS_READ_ONLY=1`, rather than always claiming the full server inventory.
The server also discovers the active vault's Git top-level when
`OATLAS_REPO_ROOT` is absent. This was added after package-local verification
misclassified 242 valid source paths as drift because its process cwd was
`mcp/`.

### 4. Recovery and mature-index handoff

All missing-slug guidance now emits executable
`find_evidence({title:"..."})` syntax, and structured recovery parsing accepts
that same contract.

`index_project.plan.conceptDelta` distinguishes raw candidates from existing
vault slugs/aliases, ambiguous aliases requiring review, and genuinely new
concepts. `next.reviewCalls` gives exact read-only calls for
retrieving the full candidate and import rows. The checkpoint stays compact
without telling an agent that all raw candidates are directly writable.

## Deliberately not built

| Candidate | Decision | Reason |
|---|---|---|
| `git_pull` MCP tool | Do not build | Pull is remote transport plus merge-state mutation. CLI/Tauri can keep the explicit human-owned workflow. |
| `git_diff` top-level tool | Defer | `git_status`, `git_history`, normal source diff tools, and CLI diff cover the current evidence. Add only after a repeated MCP-only failure. |
| `apply_builder_changes` atomic writer | Shape later | Concepts, relations, and positions need a real transaction/journal and rollback contract before one call can safely mutate several markdown files. |
| Unsaved Builder draft inspection | Do not fake | That state lives in a running UI process, not the persisted vault. A future explicit app bridge may expose it, but filesystem MCP must state the boundary. |
| More top-level Builder tools | Do not build | `builder_context` fits the existing query engine and avoids increasing tool-selection noise beyond the one justified Git read tool. |

## Verification matrix

The implementation is covered at four levels:

1. pure Git helper tests using temporary repositories, including outside-only
   commits, bounded history, Unicode paths, stale HEAD, detached HEAD, and
   vault-only snapshots;
2. graph-engine tests for alias resolution, canonical Builder URL, bounded
   layout rows, mtime handoff, and explicit unsaved-state limits;
3. real stdio JSON-RPC integration for the full and read-only tool lists,
   connection fingerprints, `git_history`, `builder_context`, and structured
   error recovery;
4. package/verifier/dogfood-vault gates, followed by a source checkout MCP
   verify and repeated health/compile checks.

Final command counts and commit/PR references are recorded in the PR and the
top-level changelog entry rather than frozen here.
