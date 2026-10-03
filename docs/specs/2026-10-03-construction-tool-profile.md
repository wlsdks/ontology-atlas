---
title: Opt-in construction tool discovery and bounded comparison
doc_type: spec
status: current
area: agents
date: 2026-10-03
decisions: [4d79f051-dc10-4a30-ac9e-d97f9661d912, 68ea16ba-05a8-4db8-8846-4567c2d4e538]
---

# Opt-in construction tool discovery and bounded comparison

## Person and moment

The owner asked to improve ontology construction, measure ACP and local LLM
workflows, examine whether tools are used efficiently, and judge whether the
result represents useful codebase meaning. They authorized investigation and
implementation and asked for measured comparisons in the README. They selected Claude ACP, Codex ACP, and the installed local model as comparison lanes.

The lost ability is **judge**: distinguish cheaper tool discovery from correct
construction and compare supported workflows without mistaking node counts,
fast completion, or a successful connection for a useful ontology.

The routed pass supplied by the lead is observed / judge / public-contract;
truth, transfer, agent-write, and human-correction are unchanged. The computed
route is review, meaning, with moment/evidence/boundaries followed by spec.

## Today

- The product thesis names unfamiliar-repository meaning recovery as the central
  risk and distinguishes structure from business understanding
  (`docs/PRODUCT-DIRECTION.md:59-75`).
- The default registry advertises the full inventory; read-only and opt-in construction discovery filter it;
  annotations and strict input schemas are retained
  (`mcp/src/server/registry.mjs:4883-4918`).
- The initialize instructions and `tools/list` share `TOOLS_FOR_LIST`
  (`mcp/src/server/instance.mjs:13-19`, `mcp/src/index.js:103`).
- Read-only rejection occurs before argument normalization; write consent occurs
  before tool dispatch (`mcp/src/index.js:109-137`). A discovery list is therefore
  distinct from permission to execute a call.
- Clients can register a source or bundled stdio server with environment values
  (`mcp/README.md:320-338`). Read-only registration rejects direct write calls
  even with cached tool lists (`mcp/README.md:340-367`).
- The modeled server owns advertised schemas and connection proof; construction
  guidance owns instructions and warnings, not authorization
  (`docs/ontology/capabilities/mcp-tool-server.md:16-25`,
  `docs/ontology/capabilities/construction-guidance.md:14-25`).
- The lead's current wire measurement is 40 tools, 712,536 raw `tools/list`
  bytes, and 127,270 input-only definition bytes. Component measurements are
  48,408 description bytes, 76,683 input-schema bytes, and 579,443 output-schema
  bytes. These are lead-supplied observations; this planner did not reproduce
  them. Component totals use a different envelope and need not sum to wire bytes.
- The saved ACP artifacts report Claude 104,869 ms and Codex 250,187 ms
  (`claude-run.json`, `codex-run.json` in this session's scratch directory).
  They used different models; Codex records `gpt-6-luna[low]`. The lead observed
  six and three nodes respectively and argument failures. Neither is a matched
  model comparison or a semantic qualification result.
- The local trial harness imports the shipped vault-agent catalog and executor
  and calls `atlas-qwen3.8:27b` (`local-app.mjs:21-35` in scratch). The baseline ran for 189,140 ms, made four model requests and two successful
  reads, then failed after two attempts to force a read of nonexistent concepts
  (`local-app-run.json` in scratch). It inspected no source and proposed no write.

Standing decisions retained: runtime registry owns mode-aware inventories
(`docs/DECISIONS.md:3452-3458`); qualification must expose incomplete obligations
rather than reward larger graphs (`docs/DECISIONS.md:3983-3989`). Historical
counts and passed trials in those records are not current proof. This slice
extends the inventory selection while retaining both decisions' boundaries.

## Problem and alternatives

Ranked by value and cost:

1. Preserve a reproducible baseline and separate cost, tool operability, and
   semantic usefulness. Without this, a performance change cannot be judged.
2. Offer a narrower first-construction discovery list. It can reduce irrelevant
   choices and advertised bytes while retaining source reading and correction.
   It is a bounded hypothesis, not a demonstrated explanation for slow trials.
3. Repair observed tool argument failures. Invalid calls waste work directly;
   logs must distinguish obsolete prompts from API mistakes before selecting a
   repair. The lead's existing prompt extraction fix remains separate.
4. Expand local source investigation only after measuring its actual limitation.
   Adding that ability is a separate product/surface change with its own review.

| Option | Value and usability | Feasibility / local-first fit | Cost / decision |
|---|---|---|---|
| Keep full discovery | Existing workflows retain every advertised operation | Existing local stdio mechanism | Retains measured bytes; control arm and default |
| Opt-in first-construction profile | Focuses initial discovery while preserving evidence and corrective patching | Existing environment registration, local only | Selected first slice; effect needs paired trials |
| Shorten all schemas or descriptions | Could reduce every client's advertised input | Risks weakening typed evidence and recovery hints | Rejected for this slice; no evidence yet justifies contract loss |
| Expand shipped local agent tools | May restore source investigation if absence is confirmed | Crosses a different surface's capability boundary | Deferred; discovery filtering cannot establish this need |

Existing users lose no default advertised tools. A person opting in loses
discovery of maintenance, deletion, merging, rename, wiki, constellation, and
structured concept filtering (`query_concepts`) until reverting to full. Calls to those known tools
remain dispatchable under their existing guards; no authorization is inferred
from their absence in discovery.

## Flow

1. When the person registers a server without the profile variable, Atlas
   advertises the existing full tool list and preserves existing behavior.
2. When the person sets `OATLAS_TOOL_PROFILE=construction` for a first build and
   restarts that server, Atlas advertises exactly these 20 tools:
   `connection_info`, `list_kinds`, `list_concepts`, `get_concept`, `get_concepts`,
   `find_evidence`, `find_path`, `find_backlinks`, `query_ontology`, `read_source`,
   `analyze_repo_structure`, `index_project`, `infer_imports`, `add_concepts`, `add_relations`,
   `patch_concept`, `validate_vault`, `compile_ontology`,
   `connect_project_source`, and `finalize_project_meaning`.
3. When the client initializes or calls `connection_info`, Atlas reports names and count at initialization, and names, count, and hash
   through `connection_info`, derived from the actual advertised inventory.
   The agent verifies roots before investigation or writes.
4. When read-only registration is also enabled, Atlas advertises the intersection:
   15 construction read tools. Direct writes remain rejected. With consent
   enabled, existing allow/reject checkpoints remain in force.
5. When the agent is wrong or evidence is missing, it corrects with the existing
   source-read and patch workflow or records uncertainty. Validation and compile
   do not promote that uncertainty into accepted meaning.
6. When the person needs a tool omitted from discovery, they remove the variable
   or set `OATLAS_TOOL_PROFILE=full`, restart, and verify the restored inventory.
   A client that already knows a tool may call it with unchanged semantics.
7. When a profile value is invalid, Atlas refuses startup with an actionable
   configuration error instead of silently selecting an unintended inventory.
8. When the owner reads the comparison, the README shows measured scope and
   separates advertisement cost, execution reliability, and semantic findings.
   An unsupported lane is explicitly unmeasured or blocked, not a quality loser.

## States

| State | Web | macOS app |
|---|---|---|
| Empty / first-build vault | Out of scope — environment profile is an external MCP registration contract | Out of scope — no first-run or vault-agent change |
| Loading / profile selected | Out of scope — no web loader introduced | Out of scope — restart occurs in the MCP host, no app control introduced |
| Error / invalid profile | Out of scope — process startup diagnostic, no web message | Out of scope — external MCP process diagnostic, no app message |
| Partial / missing evidence | Out of scope — existing read/write results retain their contract | Out of scope — existing graph and review surfaces retain their contract |
| Largest measured vault | Out of scope — no rendered geometry change | Out of scope — no rendered geometry change |
| Full discovery restored | Out of scope — environment registration recovery | Out of scope — environment registration recovery |

## Copy

None — no screen strings or message catalogues change. The startup diagnostic
names the invalid environment value and accepted `full` / `construction` values;
the MCP README documents unset-as-full, restart, and discovery-only semantics.
Exact diagnostic wording remains technical validation copy, not a new product UI.

## Edge cases

- Empty and single-node vaults receive the same discovery list; node count never
  selects a mode. The largest reported working vault is the lead's current
  100-node repository vault; scale and latency there remain unmeasured.
- First run requires explicit profile opt-in; inherited client caches require
  restart and inventory proof. Unknown values, including whitespace-only values,
  are rejected; missing variable means full.
- Hangul input retains existing tool schemas and localized data behavior;
  the profile changes no field names or parsing rules.
- Moved, renamed, or unreadable source folders use existing root proof and source
  receipt errors. Discovery reduction does not repair stale source bindings.
- Concurrent edits retain `expected_mtime` and existing overwrite/consent rules.
- Offline operation remains local. ACP hosting/model availability is measured
  separately; local inference availability is not created by this profile.

## Out of scope

- App launch wiring, UI controls, internal agent tools, and local source access
  expansion — each changes a different shipped capability.
- New tools, schema compression, relaxed argument parsing, or omitted output
  schemas — no evidence yet supports weakening these contracts.
- Automatic selection by vault size, tool phase, or model — would add hidden
  state and make matched comparisons harder to reproduce.
- A generic ontology quality score, speed promise, or model leaderboard — a
  bounded repository trial does not establish broad superiority.
- Changes to write authority, human approval, meaning acceptance, source trust,
  or correction capability — all four routed boundaries remain unchanged.

## Acceptance criteria

1. **Default recovery:** Given unset or explicit `full`, when initializing and
   listing tools, then names, schemas, annotations, and inventory proof equal
   the baseline. Check in `mcp/src/integration.test.mjs` and
   `mcp/src/tool-inventory.test.mjs`; restoring full after construction is covered.
2. **Selected discovery:** Given `construction`, when initializing, listing, and
   reading connection proof, then the exact 20 unique names above agree across
   those surfaces and retain their schemas/annotations. Check profile integration
   tests in `mcp/src/integration.test.mjs`.
3. **Guard preservation:** Given construction plus read-only or consent mode,
   when a direct known write is attempted, then read-only rejects it and consent
   still requires its existing approval outcome before mutation. A known tool
   omitted only by the profile still dispatches under existing guards. Check
   profile integration and `mcp/src/write-consent.test.mjs`; never claim hidden
   tools cannot execute merely because they are not advertised.
4. **Invalid selection:** Given an unsupported or whitespace-only value, when
   launching, then startup exits nonzero and identifies profile recovery; when
   corrected to full or construction, initialization succeeds. Check integration
   startup probes with valid and invalid values.
5. **Cost comparison:** Given the same frozen source, prompts, model, host,
   approval conditions, and fresh vaults, when comparing full and construction,
   then report raw wire bytes and input-only definition bytes separately, wall
   time, available token/cache counts, calls, errors, and completion. Preserve
   commands and artifacts; no speed claim without a matched measured result.
6. **Meaning recovery:** Given each constructed artifact and six sealed
   `questions.json` questions, without repository source fallback, when a fresh
   evaluator answers, then report supported, partial, unknown, and unsupported
   answers with node/evidence references. Audit source claims separately against
   source, including wrong or missing evidence. Check the field-trial packet;
   fail the usefulness claim if key behavior cannot be reconstructed or a false
   assertion survives. Node totals and structural validation remain separate.
7. **Public measurement:** Given ACP and local observations, when updating the
   README, then every comparison identifies model, transport/surface, date,
   bounded repository, source/prompt identity, and measured/unmeasured status;
   different source capabilities or unmatched models carry an explicit caveat.
   Check README claim audit against the stored trial packet.
8. **Completion:** Given the final delta, when the lead runs
   `pnpm checks:changed -- --run`, then every returned recommendation completes,
   including relevant list/profile/read-only integration checks and real trials.
   Preserve evidence; passing checks do not substitute for criterion 6.

## Risks

1. Cached hosts continue showing the full inventory. Require restart and matching
   initialize/list/connection proof before attributing a trial to the profile.
2. An omitted tool is essential for a first build or repair. Run the actual build
   and missing-evidence case; retain corrective patching and reversible full mode.
3. Smaller inputs or faster runs mask worse meaning or incomparable surfaces.
   Use matched same-model comparisons, source-hidden questions, and separate
   claim audits; mark local source limits and failed lanes explicitly.

## Later

1. Fix confirmed tool argument failures — next when logs identify reproducible
   contract/prompt mismatch rather than ordinary model uncertainty.
2. Improve local source investigation — next when the shipped-loop trial confirms
   a blocked required question and a reviewed boundary-preserving design exists.
3. Repeat on an unfamiliar repository and in reversed run order — next before a
   general construction efficiency or model-quality claim.
4. Phase-aware discovery or further schema reduction — next only when measured
   profile benefit survives meaning recovery and omitted-tool burden is known.

## Owner question

None — explicit opt-in preserves existing users, full mode is the recovery path,
and scope is bounded to discovery plus honest measurements.
