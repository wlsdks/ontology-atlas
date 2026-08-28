---
uid: 895c062c-28f0-4564-a6a5-0ef2a6b56e51
slug: capabilities/mcp-server
kind: capability
title: MCP Server
domain: domains/agent-integration
elements: []
path: mcp/src
created_by: "agent:unknown"
dependencies: [capabilities/vault-ontology]
relation_notes: { capabilities/vault-ontology: "The MCP server parses, validates, and writes the vault ontology schema, so schema changes alter the agent-facing read and write contract." }
display_ko: AI 연결 서버
display_en: AI Connection Server
---

# MCP Server

It provides a stdio JSON-RPC interface so that an AI coding agent can read and safely update local markdown vaults. People and agents use the same file as the source of truth, and the server does not own a separate database or model execution loop.

## User Outcomes

- The agent accurately finds meaning nodes in the project and reads relationships, evidence, and impact scope together.
- Upon connection, it verifies actual vault/repository coordinates and tool inventory to detect incorrect folders or stale client states.
- Before writing, it reads the current document and blocks concurrent edits, duplicates, broken relationships, and destructive changes with structured errors and dry-runs.

## Active Tool Inventory Contract

- The current set of tools is `TOOLS_FOR_LIST`, which applies annotations and a read-only filter to the registry in `mcp/src/index.js`. Both the `Tool inventory` section of `tools/list` and initialize derive from the same array, so no other document owns a numeric or full name list.
- A read-only server advertises neither write tools nor exposes them in its initial announcement. In both full mode and read-only mode, the header count and the set of read/write names must exactly match those in `tools/list`.
- `mcp-verify` independently compares the live `tools/list` with the counts, classifications, and name sets in the initialize announcement. Documents and configuration screens reference `tools/list` and `mcp-verify`, avoiding promises to users about mutable fixed counts.

## First-Answer Performance Boundary

`health`, `workspace_brief`, and `agent_brief` keep their complete nested validation receipt, including Git-backed summary freshness, because an agent must not receive a fast false-green handoff. The history reader uses one bounded union log and one `git cat-file --batch` read, then reuses cloned immutable revisions only for the same Git HEAD, vault, slug set, and history bound. Current Markdown, source-path drift, and project meaning/source currentness are still read per call; a new HEAD invalidates the history cache.

## Identity Boundaries

- `uid` is the permanent machine identity that persists across renames, while `slug` is the human-readable and editable current address. All node responses return both.
- Exact reads and external interop identities may use UIDs. Markdown relations, URLs, and graph operation inputs maintain slugs.
- rename/reclassify preserves the UID. merge preserves the target UID and records the absorbed UID in `merged_uids`. Standard patches cannot alter `uid` or `merged_uids`.
- `find_evidence` includes `isNode` in all search rows to distinguish graph nodes from standard Markdown. Only rows with `isNode:true` are required to have permanent `uid` and `kind`; standard documents do not fabricate these fields. `nodesOnly:true` is an explicit filter for handoffs requiring only nodes, while default searches do not hide local document evidence.

## Ontology Construction Lifecycle

The complete proposal from `analyze_repo_structure` is not immediate write permission. The first call returns only the exact `reviewPlan`, plan/source digest, eight-stage status, remaining gap IDs, and maintains `canWrite:false`. An evaluator separated from the maker executes human owner CQ, current claim/citation, seven quality axes, full source-hidden tasks, cold-start, or previous CQ regression. The user must then approve this exact plan and gaps. Only upon resubmitting the same proposal and digest-bound `constructionQualification:v1` packet will the identical `writePlan` be revealed for rows seen initially. Source/plan drift, maker-only status, `not_measured`, red mandatory axis, regression failure, or unapproved gaps result in a fail-closed state. The `admission` within the same response classifies shadow-only states as `self_qualified`, `partial_visible_gap`, `human_review_required`, and `hard_block`. `self_qualified` is merely a signal of an automatic reflection candidate where all independent evidence passed; actual writes do not bypass existing human approval or digest-bound `writePlan` gates. Measured feature gaps appear in partial state, while policy/ownership/domain boundaries/conflicts remain for human review, and stale/unsupported/non-independent evaluations/source-hidden/regression failures remain hard blocks. Each qualification claim must include `proposalRefs` pointing to the exact `concept:`, `relation:`, `competency:`, and `impact:` rows of the current `reviewPlan`, with lifecycle `proposalCoverage` classifying missing/external proposal/source-hidden unverified rows as fail-closed. This is a receipt ensuring target matching for evaluator handoff, not a score or semantic judgment automatically approving the business truth of the claim.

Approval is declared provenance, not identity verification or a truth certificate. Project Markdown persists existing competency answers/witnesses/visible gaps; the finalizer receipt persists its body and current graph/source combination. Detailed CQ revision, axes, exact gap acceptance, and pre-write regression are execution evidence in MCP responses/agent transcripts and do not claim automatic restoration after restart. No new tools, kinds, sidecars, or writer tokens are created.

## Source Connection

`connect_project_source` / `disconnect_project_source` bind and unbind project nodes to/from the local code folder they describe. Previously, `agent_brief` would output `connect_source` as the next action without a tool to execute it; the only path was the macOS app's folder picker. Both tools write nothing before `confirm: true`, leaving the absolute root only in gitignored `.ontology-atlas/project-sources.json`.

## Core Flow

1. Connect `connection_info` → `list_kinds` / `list_concepts` → `validate_vault` to check connection and vault status first.
2. Read only the necessary scope of meaning, evidence, paths, and impacts using `get_concept` / `get_concepts` and graph query tools.
3. Review new meaning candidates for code evidence and duplication, writing only those approved by the user.
4. Pass the previous `mtime` for existing node writes. Destructive operations like rename/merge/delete require explicit confirmation after preview.
5. After changes, re-validate the graph via `validate_vault`, compile, and health/maintenance flows.

## Constraints: Source binding and currentness

After the installed app binds a human-selected source root to the sidecar, new MCP processes reproduce the same bounded fingerprint locally. Source currentness is read as `current` only when matching the storage receipt exactly; changes fail-closed as `source_changed`. Private absolute paths and raw source inventory are not included in MCP responses.

## Constraints: Competency qualification

When a repository proposal signs competency as `answered`, it only checks that the required witness array is not empty. It verifies that `abilities` cover all proposed domains via typed domain→capability witnesses, and that `evidence` cites every capability slug and canonical path together. If only some are covered, it returns a structured error with the missing target slugs and does not create a write plan. Honest `partial`/`visible-gap` proposals can still be reviewed and stored.

If project purpose, proposed domain, or project→domain relation has confidence ≥0.8, or `scope`/`domains` are `answered`, two distinct current semantic sources must actually support the non-literal meaning of that claim. The purpose requires both sources to align with the purpose claim; domains require both sources to provide a domain name and an explicit responsibility sentence. Duplicated text across documents, unrelated trusted documents, roadmap/negated/deprecated evidence, package manifests, and implementation paths do not count as a second semantic authority. If only one source exists, it remains below confidence 0.8 with an explicit `partial` gap (reviewable), but inflating it to high-confidence/completed causes failure before review/write plan. The analyzer also prioritizes project identity sentences over later feature sentences, and marks domains as corroborated candidates only when separate product/architecture responsibility sentences exist. Implementation elements overlapping domain names or having only one candidate are not auto-assigned roles but remain as project-scoped evidence.

## Constraints: Cold-start evidence reading

Do not blindly truncate the first 1,200 characters of README. Preserve purpose, responsibility/architecture, and ability/capability prose within heading-scoped blocks, structurally excluding sponsor/backer/funding/donation/TOC and link/image-only decorations, then pass them in original order. Do not change the existing limits: 1,200 chars/doc, 8 headings/doc, 6 docs/packet, and 256 KiB pre-read cap. A finite `Definition` / `Includes` list remains representative unless a same-boundary cited source explicitly establishes completeness; `agent_brief` handoffs say the vault names/models those items and never introduce `only` / `all` / `every` / `exactly` from list membership. `Excludes` should contain only product/concept boundaries stated by the source. "Not yet proven", "outside bounded scan", or "not named/listed in bounded evidence" are `Uncertainty`/competency gaps; if a proposal includes these as exclusions, block them via `epistemic-exclusion-boundary` before write plan.

Cold-start semantic evidence is carried by existing `semanticEvidence` packets from classified current Markdown under root `ARCHITECTURE.md`, `docs/`, `site/`, and `website/`. Explore up to 200 Markdown files and 1,000 directory entries across all three roots, stopping at 256 KiB pre-read for general semantic documents. Visit each actual path in the same directory only once; exclude archives and symlinks that are broken or outside the repository. Maintain the final packet limit of 6 docs and 1,200 chars/doc. For proposals arriving in the same call, recalculate existing read-only import receipts to verify TS/JS/Python file endpoints and Go importing-file/package-directory endpoints and directions. These documents and paths serve as evidence/provenance only; they do not auto-approve business meaning or `depends_on`. Without maker-independent qualification and human exact-plan approval, do not open `writePlan`. If relationship rationale directly names the exact repository `path:` of both endpoint concepts, that path must also appear in evidence for the same relationship. Fail closed with `relation-path-citation-mismatch` if only other documents are cited; do not block general semantic sentences by guessing filenames.

## Constraints: Meaning repair review

When a fresh `agent_brief` reads current source and incomplete competency together, set the first `nextActions` to `review_competency_repair`. The connected `meaningRepair:v2` compact manifest contains only disposition count, provenance, `reviewRevision`, and the first `meaning_repair_review` call; a separate `meaningRepairReviewPage:v1` carries current project Markdown declarations, structural review candidates from typed containment, canonical-path candidates directly supported by current source receipts, and all unresolved targets. Containment and path existence are not human semantic approval or action proof, so do not auto-convert candidates to `answered` or write them. If source/provenance/scope/validation/mtime is unstable, block repair while preserving existing source/health behavior. The first review read splits project, domain, and capability into deterministic, stateless cursors by their exact union. Each page has max 20 items, ≤5 KiB JSON, and provides literal `get_concepts(body:"full")` calls for the same target. `reviewRevision` binds graph/source/typed row/mtime; the verifier checks missing/duplicate/order/size/recency up to the last page, plus kind/mmtime/non-truncation of each full-body and source/bundle parity.

## Constraints: Import inference by language

In Python cold start, read `README.rst`, non-executed static `setup.py` package contract, and top-level `__init__.py` package as bounded evidence. `infer_imports` condenses static imports from that package into file/module edges. This result is implementation evidence; do not auto-promote to domain/capability/semantic `depends_on`. Each module edge carries up to 5 exact file-edge receipts and presence of other evidence. Edges not in the vault return `rationale_review_required` instead of executable `proposedAction`. If the implementation path is already known, use `focusPath` or `reviewMode:"focus"` first. This mode returns exact incoming/outgoing static import counts (up to 100 receipts) and a stateless cursor for that file without a loadable vault. Empty results do not imply no impact; they fix symbol/test/dynamic behavior and ontology meaning as still pending separate confirmation. If `reviewMode` is omitted, return the existing full graph only when expected MCP total response (text + structured content) is ≤128 KiB. For larger reconciled scans, return only one review candidate, exact evidence, preflight calls for both concepts/relations, stop conditions, stateless cursor, and a `delivery` receipt with auto-selection reason/expected bytes instead of the full array. `reviewMode:"next"` explicitly requests this compact packet. `reviewMode:"full"` preserves the full shape but requires a second confirmation `allowLargeResponse:true` if exceeding 128 KiB. Oversized omission calls without a loadable vault for reconciliation return structured errors with two recovery options instead of faking safe packets. Internal analysis of `index_project` fixes explicit full to ensure this delivery default does not change existing plan meaning. Separate product/test code and value/type-only usage per evidence; calculate `productValueCount` (intersection of two-dimensional counts across all imports, not bounded samples) for module edges. Explicit type imports in JS/TS and imports inside Python's explicit `TYPE_CHECKING` guard are type-only. `value` means other static imports, not claiming runtime execution. If product code value usage is 0, do not hide test/type evidence but do not ask that import alone to approve product `depends_on`; require separate product meaning evidence. Additionally, the agent must read both concepts and direction, explain semantic rationale, and ask the human; record only one approved item with a non-empty `why`.

Go repositories with a root `go.mod` read module-local imports as bounded text without running compiler, `go list`, module cache, or network. Do not mix package directories into existing file edges or fabricate arbitrary target files; instead, preserve importing file and repository-relative source/target package directory, literal import spec, and production/test role in a separate `goPackageImports:v1` receipt. Full scans share existing file caps; each Go file stops at 256 KiB/256 imports; nested and external modules are explicitly out of scope. Exclude import-like text inside multi-line raw strings and `vendor`/`testdata`/underscore-prefixed fixture trees as evidence outside Go build boundaries. The analyzer passes package directories with high production/value import participation as up to 24 implementation element/path candidates only; do not promote folder names to domain/capability or auto-approve package edges as semantic `depends_on`. Compact/focus responses leave package evidence count and explicit full-evidence calls to prevent large graphs from silently disappearing.

C/Autotools repositories also do not report empty import graph as "no dependencies." If bounded manifest/source discovery confirms actual `.c`/`.h` files, `infer_imports.coverage` marks `c` as unsupported language and returns `allDetectedLanguagesSupported:false`. Use static `AC_INIT` literals as project name evidence; in bounded README prose, prioritize sentences stating purpose over release status. Do not create domain/capability from this evidence alone; do not analyze C include/build dependency graphs or auto-promote to semantic relations.

The same Autotools analysis reads literal declarations in root or one-level-down `Makefile.am` pointed to by static `AC_CONFIG_FILES` without execution. Distinguish install-target headers, existing `.h.in` templates, non-`EXTRA` core source, raw/API specialized source, and optional platform backends from `EXTRA_*_SOURCES`, preserving role-based representatives within 36 sources first. Internal `noinst_HEADERS`, variables/shell/wildcards/absolute/parent paths do not serve as role evidence. This build-role is observation evidence for implementation handoff; it does not auto-approve canonical capability or C impact.

Rust repositories also do not report empty import graph as "no dependencies." `infer_imports.coverage` explicitly states that `use`/`mod`/macro dependency scan is unsupported when Cargo is detected, limiting the meaning of 0 edges to "no observed static imports" within supported languages. Instead, `analyze_repo_structure.configurationEvidence` and `index_project.configurationEvidence` preserve `[features]` declarations of root package or literal direct workspace members inside the repository, and literal `cfg`/`cfg_attr` feature predicates of conventional Cargo target sources as path/line/form/polarity/source role. This receipt does not evaluate predicates or execute build scripts/macros; it does not claim/write runtime impact, import dependency, or semantic `depends_on`. It does not hide workspace/package/feature/mapping/source limits or rejected members/predicates. Schema match in `relation_check` is also not semantic approval. New `depends_on` returns `approvalGate.writeAllowed:false` without executable `proposedAction`, written only after human explicit approval of observable capability, semantic rationale, and exact direction. The analyzer connects up to 12 element/path candidates for Python implementation boundaries participating in actual imports. Base on direct module/package boundaries, but allow security/policy/risk exact endpoints to reserve up to 2 slots to prevent risk ownership from being diluted in long import responses. Exclude unused files and conflicting flat slugs. `depends_on` proposed based on this path must match observed import direction to pass proposal validation. The model may select up to 4 exact import file endpoints outside auto-candidates for different exploration roles. The server does not auto-node these files; it fail-closes verifying only the proposal's exact path/limit/file-edge direction.

## Constraints: Impact and blast radius

`impact` and `blast_radius` follow only declared `depends_on`. Containment/domain/element relations are structural evidence for `reachability`/`subgraph`; do not promote to impact or risk. Return `review_required` if no `relation_notes` on declared dependency, `declared_with_rationale` if present. Both are currently not source-backed due to lack of current-source receipt per relation unit; keep completeness and risk as `unknown`. Therefore, 0 dependency declarations are not interpreted as low-risk or no impact.

## Inclusions / Exclusions

- Included: MCP tool registration and I/O contracts, Vault parser/writer, deterministic compiler and
  graph query, concurrency/dry-run/validation safeguards, bundled server for installed apps.
- Excluded: AST/source search engine, embedding store, model selection/agent loop, backend/accounts,
  auto-saving creation proposals without human approval.

## Implementation Basis

- `mcp/src/index.js` · `mcp/src/tool-inventory.mjs`: Boundary that creates both
  `tools/list` and mode-specific initialize inventory from the active tool registry.
- `mcp/src/analyze.mjs` · `mcp/src/rust-feature-evidence.mjs` ·
  `mcp/src/infer-imports.mjs`: Bounded repository meaning ingress, Rust configuration provenance,
  evidence for TS/JS/Python file-imports and Go package-imports without execution, Autotools C/Rust unsupported
  scope and exact-path relationship evidence.
- `mcp/src/vault.mjs` · `mcp/src/schema.mjs`: File read/write and UID/slug specifications.
- `mcp/src/ontology-compiler.mjs` · `mcp/src/ontology-engine.mjs`: Compile/query.
- `mcp/src/competency-coverage.mjs` · `mcp/src/meaning-evaluation.mjs`: Quantified
  competency coverage and source-backed proposal write gate.
- `mcp/src/construction-qualification.mjs` · `mcp/src/construction-lifecycle.mjs`:
  Maker-independent categorical qualification, exact plan/source/approval binding, step-by-step
  write eligibility.
- `mcp/src/project-source-inspection.mjs` · `mcp/src/project-source-receipt.mjs`:
  Re-verification of bounded source currentness for installed apps and public receipt boundary.
- `mcp/src/meaning-repair.mjs` · `mcp/src/project-meaning-inventory.mjs`: Current declarations,
  separating structure/source candidates and unresolved targets into action-first human approval packets.
- `mcp/scripts/verify.mjs` · `mcp/src/integration.test.mjs` ·
  `scripts/dogfood-mcp-walk.mjs`: Initialize/tools-list exact parity and installation/live usage verification.
- `mcp/README.md`: Detailed single source of truth for the current public tool contract.

## Confidence

high (0.95): Registry, parser/compiler contract, and source/packed binary dogfood are verified against the same
Vault.
