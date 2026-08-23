---
uid: b4af8e2b-05f1-4931-9544-f8a6aae4aef7
slug: capabilities/project-source-evidence
kind: capability
title: Project Source Evidence Receipt
display_ko: 프로젝트 코드 근거 영수증
display_en: Project Source Evidence Receipt
domain: domains/project-portfolio
path: src/shared/lib/project-source-receipt.ts
created_by: "agent:codex"
dependencies: [capabilities/vault-ontology]
relation_notes: { capabilities/vault-ontology: "Source receipts derive project scope, capability and element path claims, and typed relations from the ontology schema; schema changes alter which witnesses and impacts the receipt can verify." }
---

## Definition

The ability to connect a single Git repository or local folder to one project node, and compare the implementation paths of capabilities/elements declared by the ontology against actual source lists, leaving versioned categorical receipts. Map datasheets, full details, CLI, and MCP
`agent_brief` read the same state, recency, first gap, and next action.

The connection itself is possible across all three surfaces: installed app, MCP, and CLI. `connect_project_source`
(CLI `connect-source`) names the git repository wrapping the vault if `rootPath` is omitted, or the nearest ancestor manifest folder if absent, and assigns confidence based on how many of the `path:` values declared by nodes actually exist within that candidate. The reason for naming and scoring separately is that `path:` is a relative path to the repository, so it cannot point to an absolute root. Nothing is written before `confirm: true`, and `disconnect_project_source` (CLI `disconnect-source`) reverts it.

The `Git repository` indicator denotes the selected source type and does not imply a GitHub account or remote repository connection. Absolute paths are stored only in the vault-local `.ontology-atlas/project-sources.json` sidecar, while copy handoffs and MCP pass only source-relative witnesses. A new MCP process re-executes only bounded probes like installed apps within that private root connected by the user. It is `current` only when kind, identity, revision, and fingerprint all match; if any differ, it is `source_changed`. It remains `unavailable` with the existing receipt preserved only when re-verification is impossible due to permissions, filesystem, or Git failures.

The internal `meaningAssessment:v1` derived contract ties structural readiness, a fixed evaluator, and typed witnesses of five competency question receipts bound to the graph hash. It verifies source ID, revision, fingerprint, measurement timestamp, and currentness together. Raw witnesses are not copied into results; only categorical judgments and inventory provenance remain. Even if structure is ready, meaning witness is empty, or the source cannot be re-verified as current, it does not elevate to `verified_current`. If the source receipt itself is stale, it becomes `source_changed → remeasure_source`; however, if the source is `verified_current/current` but only the stored competency receipt is bound to an old source fingerprint, it becomes `competency_source_changed → reevaluate_competency`. In this case, the source dimension remains current, and the overall meaning state closes with failure as `review_required`.

Qualifications containing `each` in questions like `abilities` and `evidence` do not pass merely because a witness type has appeared once. By deriving the target set from current project→domain→capability containment, `abilities` must cover typed capability relations for all domains, and `evidence` must cover concept/path grounds for all capabilities to be `answered`. Missing slugs remain unresolved targets, and `partial`/`visible-gap` remain valid intermediate states.

The internal `constructionQualification:v1` extends these per-question judgments into a re-execution contract for the entire construction. It binds executive, employee, FDE, and agent scenarios along with user-approved CQ revisions to the graph/source digest, re-deriving coverage from current witnesses and supported claims per target. The semantic, structural, functional, evidence/provenance, pragmatic, maintainability, and interop axes are independent of each other and do not collapse into a single sum. Source-hidden evaluators and builders must differ, and the final acceptance is owned by the user. This contract is a pure qualification boundary that does not use vault or public MCP responses; actual lifecycle connections are handled by subsequent M1.5.

The proposal writer and finalizer also share the meaning of source witnesses. From the exact `## Competency answers` section in project Markdown, the renderer derives backtick `Evidence`/`Paths` as source claims along with canonical `path:`, ensuring the app and MCP generate the same set. Arbitrary body filenames are not claims; paths that are unsafe or malformed close with failure as an empty set. Thus, grounds for the approved write plan persist from source receipt → finalize → new `agent_brief`, but paths not in the actual source inventory remain unsupported to the end.

## Grounds

- `src/shared/lib/project-source-receipt.ts`: Receipt, currentness, gap, and handoff contracts
- `src/views/home/model/use-project-source-model.ts`: Selection, measurement, atomic storage, and re-measurement
- `src-tauri/src/lib.rs`: Git tracked/unignored inventory and bounded fingerprint
- `mcp/src/project-source-inspection.mjs`: Private local probe reproducing app fingerprint
- `mcp/src/project-source-receipt.mjs`: `agent_brief` read model with private paths removed + sidecar write/removal
- `mcp/src/project-source-mint.mjs`: Pure receipt issuance shared by app, CLI, and MCP
- `mcp/src/project-source-discovery.mjs`: Bounded walk naming source root from vault location
- `mcp/src/project-source-inference.mjs`: Pure ground for candidate ranking, confidence, and rationale
- `mcp/src/project-source-remedy.mjs`: Diagnostic action id → executable tool/command/rollback
- `mcp/src/project-meaning-evidence.mjs` · `src/shared/lib/project-meaning-evidence.ts`:
  MCP/app isomorphic derivation of persisted competency source witness
- `mcp/src/project-meaning-inventory.mjs`: Scoped evidence admission shared by source receipt and finalizer
- `mcp/src/meaning-assessment.mjs`: Pure meaning judgment ground closing false-green without numbers
- `mcp/src/competency-coverage.mjs`: Quantified target/covered/uncovered judgment shared by proposal and new process receipt
- `mcp/src/construction-qualification.mjs`: Pure contract judging user-owned CQ, per-target grounds, exact claim/citation ledger, seven quality axes, and source-hidden tasks without summing
- `tests/fixtures/construction-qualification/qualified.json`: Portable digest-bound representative packet executing all four user groups and seven axes

## Boundary

- Does not claim repository-wide accuracy or numeric confidence.
- A project has at most one active source; duplicate bindings are recovered only via explicit replacement.
- Estimation extends only to proposal. It does not auto-confirm. If a wrong root issues a receipt claiming `verified_current`, `finalize_project_meaning` will trust it.
- If the project scope is incomplete and cannot produce a project graph hash, connections fail-closed.
- Folder deselection, measurement failure, or storage failure preserve existing binding and receipt.
- Does not conflate current source with old competency provenance as a single source defect.
- Re-evaluation does not auto-approve existing typed witnesses nor write/finalize; it maintains user approval.
- Representative qualification fixture is evidence of contract execution, not quality evidence for three actual products.
