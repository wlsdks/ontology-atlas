# Dogfood — blank folder to usable ontology over MCP (2026-07-23)

> Scope: start from a genuinely empty folder, create a small FSD TypeScript
> product, initialize a vault, bootstrap it, connect a dedicated MCP stdio
> server, exercise read/write/error/recovery flows, absorb agent policy, repeat
> bootstrap, and finish with the installed-style `mcp-verify` gate.
>
> Fixture: `.tmp/atlas-blank-dogfood` (`Claim Ledger`). It is intentionally
> gitignored. The fixture begins with no vault and four small source modules.

## Executive verdict

**The MCP/graph engine is technically strong after a human has shaped a valid
vault, but the cold-start product loop is not trustworthy enough yet.**

- Final state: 12 nodes, 18 resolved edges, 0 unresolved edges, 0 validator
  problems, 0 maintenance actions, agent readiness 100/100.
- Final MCP verification: 61 reported pass lines, 25/25 tools, all structured
  response contracts, destructive dry-runs, stale-write conflict guard, graph
  queries, and read-census consistency passed.
- Custom MCP client: 32 explicit call sites plus looped relation writes (roughly
  40 workflow calls) covered read, write, rename, patch, idempotence, delete,
  path, traversal, brief, maintenance, and validation flows.
- Cold-start failure: the first official `bootstrap` produced four schema
  warnings, five actionable graph islands, three empty domains, and no import
  edges while reporting `errors: 0`.
- Repeat failure: a second `bootstrap` was not idempotent. It recreated a
  rejected concept and reintroduced project-to-capability shortcuts into the
  curated graph, again reporting `errors: 0`.

PO verdict: **Shape a slice.** Do not add more graph-query breadth first. Make
`init -> bootstrap -> first agent brief` correct, idempotent, root-safe, and
self-repairing.

## Test product

Claim Ledger turns meeting notes into reviewable, source-backed product claims.
The sample code contains:

- `src/features/capture-evidence`
- `src/features/review-claims`
- `src/entities/claim`
- `src/widgets/review-board`
- README product areas: Evidence intake, Claim review, Agent handoff

This shape is deliberately small enough that a human can judge every proposed
node and edge, while still exercising project/domain/capability/element and
document behavior.

## Journey and observed outcomes

| Phase | Action | Result | Product judgment |
|---|---|---|---|
| 1 | `ontology-atlas init vault` | 5 starters plus root/vault MCP and Codex configs | Good setup ergonomics; restart is clearly required |
| 2 | `analyze_repo_structure(rootPath)` | 1 project, 3 domains, 3 capabilities, 1 element | Useful skeleton, but one entity was misclassified |
| 3 | `bootstrap . --vault ./vault` | 9 nodes, 3 edges, 4 warnings | Command success did not mean usable ontology |
| 4 | strict validate | 4 `missing-expected-field` warnings | Correctly caught bootstrap output |
| 5 | health/workspace brief | `healthy`, despite 5 actionable islands | Status is too optimistic |
| 6 | maintenance plan | 4 review actions, none executable initially | Diagnosis exists but cannot close the loop |
| 7 | MCP repair | domains assigned, relations added, entity renamed/retyped | Writes, conflict guards, and dry-runs worked well |
| 8 | semantic cleanup | removed direct project shortcuts manually | No `remove_relation` tool exists |
| 9 | MCP verify | all checks passed at 10 nodes/16 edges | Strong engine once graph is curated |
| 10 | repeat bootstrap | recreated `capabilities/claim` and 3 shortcuts | Non-idempotent and harmful |
| 11 | absorb AGENTS.md | 2 policy docs written with backup/pointer | Safe text movement, weak graph integration |
| 12 | connect absorbed docs | 2 `describes` edges added manually | Final graph connected |
| 13 | final MCP verify | 12 nodes/18 edges, 61 pass lines | Runtime contracts solid |

## What works well

### MCP contract and safety

- All 25 tools are discoverable with read/write/destructive/idempotent/local
  annotations.
- Unknown arguments and enum typos fail closed with closest-value hints.
- Batch writers isolate bad rows instead of aborting unrelated rows.
- Batch caps reject 51-row calls explicitly.
- Rename, merge, and delete default to dry-run.
- `patch_concept(expected_mtime)` rejects stale writes with `vault_conflict`.
- `delete_concept` previews captured content and backlinks before confirmation.
- Duplicate `add_relation` is idempotent and preserved the original rationale.
- Every tested read/write surface returned structured content, not only prose.

### Graph reads

- `find_path`, `neighbors`, `project_map`, `project_scope`, `match_nodes`,
  `match_edges`, `facets`, `schema`, `all_paths`, and compile indexes agreed on
  census and edge resolution.
- Query results include boundedness and follow-up evidence rather than inviting
  unbounded graph scans.
- `match_nodes` and `match_edges` correctly label rows as candidates and supply
  follow-up calls before an agent treats them as proof.
- Once containment was repaired, project/domain/capability/element placement was
  accurate and agent readiness reached 100/100.

### Local-first recovery

- All graph state remained inspectable Markdown.
- Absorb created `AGENTS.md.pre-absorb.bak` before rewriting the source as a
  slim pointer.
- The final vault passed strict validation without network, backend, or login.
- Root and vault-local `.mcp.json` and `.codex/config.toml` files were all
  reported ready by `agent-setup`.

## Findings and required product work

### P0 — prevent silent wrong-project analysis

`mcp-verify` connected to the new vault correctly but its default
`analyze_repo_structure`, `infer_imports`, and `index_project` calls analyzed the
Ontology Atlas source checkout instead of Claim Ledger. Evidence:

- wrong default: 904 files, 526 module edges, 5 domains, 18 capabilities,
  29 elements;
- explicit Claim Ledger root: 4 files, 0 resolved module edges, 3 domains,
  3 capability candidates, 1 element candidate.

The server knows `OATLAS_VAULT` but has no authoritative codebase root. Process
cwd is not a safe product contract.

Required slice:

1. Add `OATLAS_REPO_ROOT` to generated MCP/Codex configs.
2. Return `vaultRoot`, `repoRoot`, and how each was resolved in
   `workspace_brief` and analysis responses.
3. Add `set_workspace` only if multi-root clients require runtime switching;
   otherwise fail closed when repo root is ambiguous.
4. Make verify assert that analyzed `package.json.name` matches the configured
   workspace project, rather than only asserting that analysis returned rows.

### P0 — make bootstrap idempotent and curation-preserving

The second bootstrap did all of the following:

- recreated `capabilities/claim` after it had been curated into
  `elements/src/entities/claim`;
- re-added project -> capability shortcuts;
- reported seven row conflicts but summarized `errors: 0`;
- grew the vault from 10 to 11 nodes and dirtied an otherwise clean graph.

Required slice:

1. Persist candidate provenance/fingerprint (`analyzer`, source path, candidate
   role) so reruns can reconcile instead of blindly add.
2. Treat rename redirects or source-path identity as the same concept.
3. Default repeat bootstrap to plan-only when the vault is no longer a starter
   vault.
4. Add an idempotence result: `graphHashBefore`, `graphHashAfter`, `changed`,
   `reintroducedCandidates`, `conflicts`, and a non-zero/attention exit status.
5. Never report `errors: 0` while row results contain conflicts unless a separate
   `conflicts` count is visible beside it.

### P1 — bootstrap must not generate a vault that its own verifier rejects

The first bootstrap wrote capabilities and an element without domains, created
three disconnected domains, and connected the project directly to capabilities.
Immediate results:

- strict validate: 4 warning files;
- health: 6 components, 5 actionable components;
- maintenance: 1 unassigned node and 3 empty domains;
- `mcp-verify`: stopped at `list_concepts vaultWarnings present`.

Required slice:

- Candidate output must include an explicit domain assignment or a review state.
- Suggested relations should follow the documented containment spine:
  project -> domains -> capabilities -> elements.
- `bootstrap --apply` should run strict validation before commit and either:
  apply a coherent graph, stop at a review plan, or clearly return
  `needs_attention`; it should not call the result a zero-error success.
- Add `bootstrap --accept-reviewed-plan <plan-id>` so an agent can review once
  and land the exact candidate set without rebuilding it.

### P1 — classification needs role evidence, not folder-name promotion

`src/entities/claim` became `capabilities/claim`, although its only evidence was
an implementation path and a type declaration. This contradicts agent guidance
that path-only evidence starts as an element. `Architecture` in AGENTS.md was
also suggested as a capability even though it described dependency policy.

Required slice:

- Emit `candidateKind`, `confidence`, `evidenceFor`, `evidenceAgainst`, and
  `alternateKind` for every candidate.
- Apply the same classification contract in `analyze_repo_structure`,
  `absorb_document`, and agent brief guidance.
- Treat `src/entities/*` as elements by default unless README/user-workflow
  evidence proves a capability.
- Introduce a first-class `review` candidate state instead of writing a
  low-confidence role into a canonical kind.

### P1 — add `remove_relation` and relation replacement tools

There is no safe narrow operation for removing one bad edge. Repair required
reading the full `contains` array and replacing it with `patch_concept`. That
creates avoidable lost-update and accidental-deletion risk.

Required tools:

- `remove_relation(from, to, type, expected_mtime?, confirm?)`
- `replace_relation(old, next, expected_mtime?, confirm?)`
- Both should dry-run, show the exact frontmatter key and rationale removed, and
  return post-write maintenance.
- `relation_check` should return a proposed removal when it detects an invalid
  or redundant shortcut.

### P1 — health must include validator and semantic-schema health

`health.status` and `workspace_brief.status` were `healthy` while the vault had
four schema warnings and five actionable disconnected islands. Later,
`maintenance_plan` had four actions while `workspace_brief.growthActions` was
zero. A renamed capability became an element but retained a capability body
template; validator and maintenance both passed it.

Required slice:

- Fold `validate_vault` problem counts into health.
- Define status levels consistently: `healthy`, `needs_attention`, `failing`.
- Use the same action census across growth, maintenance, workspace brief, and
  agent brief, or label the scopes distinctly.
- Add semantic lint for common illegal/suspicious patterns:
  project -> element shortcuts, capability body under `kind: element`, missing
  relation rationale, and kind/path convention mismatch.
- Make `health` explain why an info-level island does or does not lower the
  overall status.

### P1 — unresolved imports must not be summarized as “in sync”

The TypeScript sample used Node-style `.js` import specifiers that resolve to
`.ts` sources at build time. `infer_imports` returned two
`relative-not-found` rows, but reconciliation said:

> code import graph and vault depends_on edges are in sync (0 shared, no drift)

Required slice:

- Resolve `.js`/`.mjs` specifiers to `.ts`/`.tsx`/`.mts` under TypeScript
  NodeNext/Bundler conventions.
- Include `unresolvedImports` in reconciliation summary and never say “in sync”
  when unresolved imports exist.
- Provide suggested candidate paths for basename-compatible unresolved imports.

### P1 — rename/retype must protect semantic invariants

Renaming `capabilities/claim` to `elements/src/entities/claim` correctly rewrote
backlinks, but it preserved the old project shortcut. Patching `kind: element`
also left the generated body saying “A capability is…”. Both states validated.

Required slice:

- Add a `reclassify_concept` graph operation that changes kind, canonical slug
  folder, body template, domain requirement, and relation legality as one
  previewable transaction.
- Make `rename_concept` report newly suspicious schema patterns after rewrite.
- Offer to migrate or preserve custom body text explicitly when reclassifying.

### P2 — first-contact output needs progressive disclosure

At readiness 75/100, `agent_brief --prompt` emitted more than 30 CLI commands,
six graph DB recipes, multiple playbooks, full kind policy, traversal policy,
result contracts, and write guardrails. The immediate repair was only four
domain/containment decisions.

Required slice:

- Default brief: status, top blocker, one evidence row, and next 1-3 calls.
- `detail=full` or dedicated operations for graph DB pack, policies, and
  playbooks.
- When not ready, lead with repair actions; do not lead with exploration packs.
- Return an executable `nextAction` whenever the repair is deterministic.

### P2 — absorption needs relation proposals

`absorb` safely wrote two policy documents but left both disconnected. Health
reported three actionable components until two manual `describes` edges were
added. The operation moved text successfully but did not complete the meaning
model.

Required slice:

- For every absorbed document, propose `describes` targets using title/body
  evidence and `similar_nodes`.
- Include relation candidates in the same dry-run plan and let the user accept
  node and edge rows independently.
- Check `source:` path drift for document nodes; current path drift checks focus
  on `path:` and `elements:`.

### P2 — multi-vault workflow needs a clearer contract

The active Codex session remained connected to the repository's original
105-node dogfood vault after a new folder was initialized. This is technically
expected because MCP clients cache server configuration until restart, but it
is easy to mistake `analyze_repo_structure(rootPath)` for a full target switch:
reads/writes still go to the old vault.

Required slice:

- Every write response should include `vaultRoot`.
- Every analysis response should include both `repoRoot` and `vaultRoot`, plus a
  warning when they appear unrelated.
- `agent-setup` should expose a concise “restart required / active server cannot
  be switched in this session” state.
- Consider a read-only `connection_info` tool rather than hiding this in long
  initialize instructions.

### P3 — small consistency defects

- `agent-setup` documentation says MCP verify lists 24 tools; runtime lists 25.
- `find_orphans` can call document nodes “orphans” even when their outgoing
  `describes` edges connect them to the graph; the term appears to mean “no
  incoming owner” rather than “isolated.” Rename or clarify the contract.
- Relation rationales are valuable, but maintenance proposals omit `why` even
  when the reason text could seed one.
- Project and domain starter bodies are generic and remain generic after
  bootstrap; generated bodies should incorporate README evidence.

## Proposed tool surface changes

The next useful tools are not more read aggregations. They close write and
onboarding loops.

| Priority | Tool/operation | Why it is needed |
|---|---|---|
| P0 | `connection_info` | Prove active vault, repo root, config source, server version, and restart state |
| P0 | `bootstrap_plan` + `apply_bootstrap_plan` | Stable reviewed plan, idempotence, provenance, exact replay |
| P1 | `remove_relation` | Safely remove one wrong edge without replacing an array |
| P1 | `replace_relation` | Correct type/direction atomically with backlinks/rationale preserved |
| P1 | `reclassify_concept` | Move kind + slug + domain + body + legal edges in one transaction |
| P1 | `repair_vault` | Execute selected deterministic maintenance actions with a plan id |
| P2 | `explain_health` | Reconcile validator, graph, growth, maintenance, and readiness status |
| P2 | `link_document` | Attach absorbed policy/evidence docs to described concepts |
| P2 | `resolve_import` | Accept a suggested source resolution and materialize the correct edge |

`query_ontology` already contains broad analytical power. Adding more operations
inside it has lower value than making the lifecycle safe and comprehensible.

## Recommended implementation order

Using reach/impact/confidence/effort as rough 1-5 values:

| Slice | R | I | C | E | Score | Decision |
|---|---:|---:|---:|---:|---:|---|
| Root-safe connection contract | 5 | 5 | 5 | 2 | 62.5 | Build first |
| Idempotent bootstrap plan/apply | 5 | 5 | 5 | 4 | 31.3 | Build second |
| Bootstrap domain/containment assignment | 5 | 5 | 5 | 3 | 41.7 | Same bootstrap slice |
| Health/status unification | 5 | 4 | 5 | 3 | 33.3 | Build third |
| Remove/replace relation | 4 | 5 | 5 | 2 | 50.0 | Build with write safety |
| Reclassify concept | 3 | 5 | 5 | 3 | 25.0 | Build after relation removal |
| Compact agent brief | 5 | 3 | 5 | 2 | 37.5 | Quick usability win |
| Absorb relation proposals | 3 | 3 | 4 | 3 | 12.0 | Later |

Trust risks override the numerical ordering: wrong-root analysis and destructive
repeat bootstrap should block broader onboarding promotion.

## Final clean-state proof

After manual curation and cleanup:

- 12 nodes: project 1, domains 3, capabilities 3, elements 2, documents 2,
  vault README 1;
- 18 resolved edges, 0 external, 0 unresolved;
- strict validator: 0 problems;
- maintenance plan: 0 actions;
- health: connected component pass;
- agent brief: ready 100/100;
- MCP verify: all passed, 25/25 tools, structuredContent coverage complete;
- agent setup: 4/4 root/vault configs ready.

The final graph proves Atlas can support a coherent human-and-agent ontology.
The amount of manual reasoning required to reach it proves that the next product
work belongs in cold-start correctness and repair closure, not additional query
breadth.

## Implementation closure — 2026-07-23

The trust-critical findings above were implemented and re-run against the MCP
surface. The server now exposes 31 tools: 18 read and 13 write, with eight
destructive tools explicitly annotated and guarded. The completed slice adds:

- `connection_info`, including distinct repository and vault roots;
- path-aware single and batch concept creation;
- safer, more coherent repository analysis and repeatable bootstrap planning;
- `remove_relation`, `replace_relation`, and `reclassify_concept`, each with
  preview/confirmation or conflict guards appropriate to its risk;
- validator-backed health output so graph health cannot silently hide invalid
  frontmatter;
- `git_status` and `git_snapshot`, with exact-HEAD confirmation, vault-only
  pathspec staging, operation-in-progress blocking, outside-vault change
  warnings, and validation gates.

The Git boundary is intentional. Agents can inspect repository state and create
a local, reviewable vault snapshot through MCP, but MCP cannot initialize a
repository or push to a remote. Remote publication changes external state and
remains an explicit developer/host workflow. This gives agents a safe checkpoint
primitive without turning ordinary ontology maintenance into implicit delivery.

Runtime support is now Node.js 24 only (`>=24 <25`), with CI and local version
metadata aligned. The production MCP SDK remains the latest stable 1.x release,
`@modelcontextprotocol/sdk` 1.29.0; the upstream 2.x line was still pre-alpha on
the audit date and was not treated as a safe production upgrade. Direct
dependencies were upgraded to current compatible releases, root and standalone
MCP production audits both report zero known vulnerabilities, and remaining
major-version holds are explicit: Node typings stay on 24, and ESLint stays on 9
until the active React plugin peer range supports ESLint 10.

Closure verification covered unit, integration, contract, documentation,
strict TypeScript, lint, build, vault validation/audit, onboarding/memory-loop
smokes, package contents, the installed MCP verifier, and the Git safety tests.
The MCP verifier passed all 31 tools under both the workstation Node 24 runtime
and the latest Node 24.18.0 runtime used for the compatibility proof.

PO verdict: **Build and verify — completed for the trust slice.** The remaining
P2/P3 items above are follow-up usability work, not blockers for safe agent-led
ontology maintenance.
