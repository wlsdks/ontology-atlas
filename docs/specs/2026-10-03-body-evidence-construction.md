---
title: Source-backed construction with compact evidence continuations
doc_type: spec
status: current
area: agents
date: 2026-10-03
decisions: [f2fbf5f3-9708-4437-bfd8-e4174dcf6ee2]
---

# Source-backed construction with compact evidence continuations

## Person and moment

The owner asked to improve ACP and local-model ontology construction, measure tool efficiency, and judge whether the resulting map preserves real meaning. After seeing the bounded baseline, they explicitly authorized improvement. The lost ability is **handoff**: a fresh reader cannot reliably recover priority, failure boundaries, or customization from the produced map. The routed pass is observed / handoff / public-contract, one-way meaning review with moment, evidence, boundaries, and spec lenses. Truth, transfer, agent-write, and human-correction remain unchanged.

## Today

- Unfamiliar-repository meaning recovery is the central product risk; structure and graph health do not establish understanding (`docs/PRODUCT-DIRECTION.md:59-75`).
- The Sonnet paired baseline fully answered 3/6 questions with full discovery and 2/6 with construction discovery. The latter lost precedence, misstated missing-value/default behavior, and repeated a wrong responsibility boundary; both need dependency review (`docs/benchmark/CONSTRUCTION.md:112-129`).
- The shipped local loop has no repository analysis tools and earned no persisted-map quality score (`docs/benchmark/CONSTRUCTION.md:131-139`). Native source access is not supplied by this slice.
- The first-turn prompt requests a definition, inclusions/exclusions, and a proving file, then small reviewed writes after approval; it now requires body/setup/callee tracing, counterexamples, returned range/hash citations and qualified project boundaries (`src/features/first-run-starter/model/build-from-code-prompt.ts:24-54`).
- Full-mode sourceReads performs repository analysis; opt-in source-only continuations return the same evidence without that scan; proposal calls additionally inspect source and import evidence (`mcp/src/tools/repo-analysis.mjs:52-112`). A full-mode bounded continuation still returns unrelated candidates and lifecycle data; source-only delivery omits them.
- Source selectors already enforce 1–8 reads, exact ranges/outlines, hashes, byte budgets, path exclusions, and stable non-symlink reads (`mcp/src/source-evidence.mjs:16-28,81-142,155-215,265-357`). Outlines carry no claim citation (`mcp/src/server/registry.mjs:4128-4129`).
- The public output schema exposes sourceEvidence under properties and retains full-analysis requirements in one branch and source-only requirements in the other (`mcp/src/server/registry.mjs:4405-4510`).
- The modeled boundary separates observed source from meaning and writes (`docs/ontology/capabilities/repo-structure-analysis.md:18-25`; `docs/ontology/elements/bounded-source-read.md:17-23`). Targeted list_kinds/list_concepts/get_concept confirmed the live vault and concept; no semantic acceptance was inferred.

Retain decision 9435a468-7e20-40ee-94fd-b471d7108b71: bounded observed source ranges add evidence, preserve lifecycle/approval, and must not promote raw source into meaning. Its repeated-analysis cost dissent motivates this extension; its historical trial does not prove current quality.

## Problem and alternatives

Rank: (1) preserve core behavior in node bodies, because missing rules directly defeat handoff; (2) make exact source continuations compact, because needless full packets discourage investigation; (3) separately expand native local source access when its trust boundary is reviewed. Faster transport alone does not repair a thin map.

| Option | Value and usability | Feasibility / local-first fit | Cost / decision |
|---|---|---|---|
| Status quo | Preserves all existing behavior | Already local | Retains observed handoff failures; baseline only |
| Require body tracing and add opt-in compact continuations to the existing tool | Readers gain auditable rules; builders can inspect exact ranges without another full packet | Reuses current local source policy and approval workflow | Selected smallest slice; quality remains a measured hypothesis |
| Add a new source tool or native local tool surface now | Could enable another model surface | Requires new inventory or native access review | Deferred; duplicates transport or widens the trust scope |
| Increase model effort or prompt budget alone | May increase exploration | Depends on model availability | Existing xhigh attempts timed out; no evidence of restored handoff |

Existing users lose no default behavior. sourceOnly is explicit per call; omit it or use false to recover full analysis. Source data remains untrusted and available for human inspection and correction.

## Flow

1. When an agent starts construction, Atlas's prompt requests one normal discovery call and an account of the product's core capabilities before any writes.
2. When a capability needs behavior evidence, the agent traces its named entry point, normal/default priority, refusal/failure path, customization, and relevant callees through exact source lines. For long files, an outline locates subsequent body reads; declarations, imports, and test names cannot substitute for those reads.
3. When the agent requests analyze_repo_structure with sourceOnly:true, Atlas requires 1–8 sourceReads and rejects proposal or qualification whenever supplied, including null. Existing root, selector, ignore, hash, size, sensitive-path, and symlink rules still apply.
4. When that read succeeds, Atlas returns only {rootPath, delivery:'source_only', canWrite:false, sourceEvidence}; it does not rescan, generate candidates, or compute/release a review or write plan. The output schema retains properties.sourceEvidence and distinguishes source-only/full shapes through conditional oneOf requirements.
5. When evidence is refused, omitted, stale, or incomplete, the agent follows the existing continuation/hash rules, corrects its selector, or records the exact gap. It cannot claim repository completeness or fill the gap from a symbol name.
6. When proposing meaning, the agent preserves actual rules and their conditions in node bodies with supporting line citations. It declares depends_on only for a necessary prerequisite in the evidenced direction and condition; optional convenience, alternatives, and caller use become relates or explicit uncertainty.
7. When the owner approves, the existing small reviewed batches, write permission checkpoints, validation, binding, and finalization remain. Formal proposal/qualification replay uses full mode and retains every existing gate; this branch grants no candidate release or human competency acceptance.
8. When comparing builds, a fresh source-hidden reader reconstructs meaning from full node bodies; a separate source audit checks atomic claims and dependency necessity/direction. The README reports observations and failed attempts without promoting speed or meaning quality prematurely.

## States

| State | Web | macOS app |
|---|---|---|
| Empty / first build | Out of scope — external MCP reads; no new web control | Existing construction prompt gains tracing guidance; existing next action is agent review |
| Loading / source-only read | Out of scope — MCP result, no loader introduced | Out of scope — no native source bridge or loading UI introduced |
| Error / invalid selector or mode combination | Out of scope — existing MCP failure channel | Out of scope — external MCP diagnostic; shipped local loop remains source-unavailable |
| Partial / refused, omitted, changed source | Out of scope — existing evidence packet | Existing agent transcript can state gaps; owner inspects or defers through current review |
| Largest measured vault / 100 nodes | Out of scope — no geometry or scale claim | Out of scope — no map rendering change |
| Full analysis / recovery | Out of scope — omit sourceOnly or set false | Out of scope — external MCP registration/call behavior; existing approval remains |

## Copy

None — no new screen strings or message catalogues. The existing generated user prompt gains behavior-tracing instructions; registry and MCP README document the exact optional flag, non-writing result, invalid combinations, and recovery. Technical diagnostic wording is not a fixed product UI promise.

## Edge cases

- Empty/single/100-node vaults do not select a mode; first-run source reads still require verified roots. Eight selectors are the packet ceiling, not repository coverage.
- Hangul paths retain well-formed Unicode and literal relative-path rules; no localized identifiers or new parser behavior.
- Moved/renamed/unreadable folders and symlinks use current root proof and refusal paths; never fall back to a wider root.
- Concurrent edits use returned hashes and stable-file checks; a source-only read is not a repository-wide snapshot or qualification receipt.
- Offline source reads stay local; ACP/local model availability is separate. Read-only registration may read but cannot write; source text cannot act as instructions.

## Out of scope

Native local source-access expansion, frontend controls, new tools, semantic auto-acceptance, relaxed source limits, model leaderboards, and broad speed claims. No alternate meta-model or mandatory whole-repository dump. No invented human competency acceptance in a headless harness.

## Acceptance criteria

1. **Strict branch:** Given true with valid 1–8 selectors, when calling through MCP, then exactly the four source-only fields return and no candidates/lifecycle payload appears. Missing/empty/oversized reads, nonboolean values, and any supplied proposal/qualification including null fail without writes. Check focused integration cases in mcp/src/integration.test.mjs.
2. **Guard parity:** Given escaped/sensitive/symlink/unreadable/oversized/changed source or stale expectedSha256, when reading in source-only mode, then current refusal/omission and byte ceilings remain and no source escapes. Check existing source-evidence unit guards plus source-only MCP integration, including read-only mode.
3. **Full recovery:** Given omitted/false sourceOnly, when running full discovery and proposal/qualification replay, then the prior full result and lifecycle gates remain. Check full-path integration parity and schema shape tests; properties.sourceEvidence remains inspectable, and source-only/full responses validate in their own oneOf branch.
4. **Packet efficiency:** Given identical selectors and a frozen root, when measuring full versus source-only responses, then sourceEvidence is identical and source-only serialized bytes are lower. Preserve byte counts; no claim about host tokens, total construction speed, or semantic accuracy follows from this probe.
5. **Meaning recovery:** Given the calibrated repository and six sealed questions, when the same model/source/profile/approval conditions build fresh paired vaults with only the tracing/transport changes, then source-hidden answers and source audit improve the previously deficient priority (Q3), failure (Q4), and extension (Q5) recovery without introducing false source or dependency claims. Audit citations and qualifiers atomically; otherwise report failure to prove improvement, not success from node totals.
6. **Operational comparison:** Given ACP and an MCP-capable local headless harness, when trials run, then preserve prompts/digests, traces, original reader answers, failed attempts, call errors, packet bytes, gross wall time, and completion. Validate/compile artifacts separately. A blocked local run earns no map-quality score; the shipped app's source limitation remains explicit.
7. **Public evidence:** Given trial artifacts, when updating the README and construction report, then label the now-known repository as calibration, identify changed instructions, measured versus unknown fields, and headless/native limitations. A fresh permissive repository with six new questions frozen before construction is required later for generalization.
8. **Completion:** Given the final delta, when the lead runs pnpm checks:changed -- --run, then every recommendation completes, including focused MCP integration, source-read safety, and the actual-agent field trial selected for this change. Report only commands actually run; passing structural checks do not satisfy criterion 5.

## Risks

1. Guidance produces plausible rules without body support: source-hidden reader plus atomic source/citation audit, especially priority and negative claims.
2. Compact mode leaks source or bypasses lifecycle: reuse current guards, reject lifecycle fields, require exact non-writing shape, and test default/full recovery.
3. Calibration or faster packets are marketed as general quality: retain baseline and failed lanes, publish bounded findings, and require a fresh frozen trial before broader claims.

## Later

1. Native local construction access — next after a reviewed source trust boundary and native permission/recovery evidence; compact transport alone does not enable it.
2. Fresh unfamiliar permissive-repository trial — next after this calibrated mechanism stabilizes and six new questions are sealed before building.
3. Reversed-order repeated trials and further packet changes — next when quality survives and measured cost justifies them.

## Owner question

None — the owner authorized improvement; per-call opt-in and unchanged full mode provide recovery without widening write or native access authority.
