# Backlog — ontology-atlas

> **The canonical current execution order.** When a user specifies a task ID, only that item is decomposed
> and implemented. Completion markers are first recorded in the evidence table of the active track below; the feature's current
> status is handled by `docs/FEATURES.md`, decision rationale by `docs/DECISIONS.md`, and user-visible changes
> by `docs/CHANGELOG.md`.
>
> Do not fixate on changing numbers in this document. The current dogfood census is
> checked via `node cli/src/index.mjs overview`; the public MCP/CLI surface is
> checked via `pnpm docs:surface:check`.

---

## Active Execution Track — Trust Contract → Meaning Contract (2026-08-09)

This track is created by contrasting the `gpt-5.6-sol` MCP/ontology audit results from the isolated
2026-08-09 installed app Codex Computer Use audit against the current HEAD.
**Only this section manages state.** Do not duplicate the same checklist in `docs/plans/`.

### PO Pass — Make documents canonical before implementation

**Prior record**: The decision to separate project meaning receipt into
structure, competency, and source currentness remains valid. However, in the actual
field trial, the finalizer rejected a witness approved by the proposal; this observation
falsified the premise that both stages share the same evidence meaning.

**Observed phenomena**:

- The analyzer proposal has `canWrite:true`, yet the same witness is rejected during finalize.
- A fresh source-checkout config shows `0/3` in the app, and a non-existent npm launch
  string can appear valid.
- Quick-start returns a failure code while outputting success/connection complete messages.
- Workshop misidentifies siblings of the same domain as `is_a` recommendations.

**User problem**: Users connecting a new product for the first time and agents cannot simultaneously judge "is the configuration actually executable, can the approved meaning be confirmed, are the recommended relationships trustworthy, what is the next procedure?" As a result, restarts, rewrites, source rediscovery, and source-hidden handoff failures occur.

**Phenomenon vs. Problem distinction**: Passes difference-through (leaving decision/trust/handoff loss) · Passes second observation (CLI exit/stdout mismatch, app readiness false positive/negative, finalize failure,
source-hidden answer loss) · Passes solution independence (holds without component or parser names).

**Target and moment**: Developers/FDEs creating a vault for the first time, people approving current meaning,
and new AI agents taking over that vault. **Current alternatives**: raw Markdown,
source search, manual config inspection, session dialogue re-explanation. **Ontology value**: Writer and reader interpret concept, typed
relation, evidence witness, and currentness identically. **Agent value**: From first contact through finalize and handoff, the next MCP/CLI action
remains in an executable state. **Simplification**: Strengthen existing spine and read-only surface without persisting new kinds or new topology modes. **Verification**: Node 24 fresh
fixture, source-hidden evaluator, focused contract, installed app, actual motion/perf proof.

| Item | 4-point criterion sentence | Score |
|---|---|---:|
| Problem insight | Names an observed phenomenon and the workflow damage | 4 |
| User moment | Specific audience, moment, trigger, and blocked decision | 4 |
| Differentiation | Deepens local-first ontology + agent-memory wedge | 4 |
| Ontology value | Clarifies concept, relation, evidence, provenance, impact, ownership, or update path | 4 |
| Agent value | Agent gets a better MCP/CLI/source-intelligence handoff or validation path | 4 |
| Verification | Runtime proof matches the affected surface, including installed macOS app when relevant | 4 |

**Self-score**: **24/24** (no critical zeros). **Verdict**: `Shape a slice` — after fixing the order and
no-gos below, proceed item by item with `Build and verify`. Items changing MCP/CLI external contracts, vault
schema, or Projects taxonomy require `/po-council` and appending to `docs/DECISIONS.md` upon entry. UI/motion items pass the design gate after PO.

### 2026-08-09 ontology-construction re-investigation checkpoint

Contrasted the initial investigation in `docs/FOUNDATIONS.md` with current construction rules as primary public literature. Directly verified Grüninger–Fox(CQ), OntoClean(`is_a`/subsumption), OQuaRE(multi-dimensional quality),
SAMOD(scenario+example+question regression), LOT/NeOn(requirement→implementation→maintenance), W3C
RDF/OWL/SHACL/PROV boundaries, and 2025~2026 LLM ontology/CQ research.

**To keep**: observed/proposed/shared separation, evidence tier, includes/excludes,
typed CQ witness, human approval, deterministic write plan, post-write validation,
source-hidden handoff. **To strengthen**: full lifecycle starting from purpose/authority,
CQ owner/revision provenance, examples+counterexamples, judgments separating semantic/structural/functional/
evidence/pragmatic/maintenance/interop, maker-independent qualification.
**To correct**: Do not call machine-readable formal semantics, nor introduce Atlas as an
RDF/OWL/SKOS/SHACL implementation. **Application principle**: LLM accelerates drafting and repairing requirements/models, but is neither the approver nor sole evaluator of its own output.

### Status and Order

Status uses only `ready` · `in_progress` · `blocked(<ID>)` · `hold(<observation condition>)` ·
`done(<commit>)`. Only one item is `in_progress` at a time.

| Order | ID | Status | One-sentence result |
|---:|---|---|---|
| 0 | D0 | done(D0 documentation commit) | Created this active track, decision, and canonical pointer; passed the document gate. |
| 0.5 | D1 | done(D1 research commit) | Re-validated ontology construction literature/standards and strengthened quality contract and priorities. |
| 1 | M1.1 | done(844104d73) | Proposal and finalizer use the same evidence witness meaning. |
| 2 | M1.2 | done(d375bada9) | App judges only actually executable agent configs as ready. |
| 3 | M1.3 | done(761d555a4) | Quick-start failure does not look like success. |
| 4 | M1.4 | done(dbc063364) | Current MCP inventory derives from the runtime registry in one place. |
| 5 | O1.2 | done(9ca7bf65c) | Honestly fix Atlas's 5-kind, relation, and formal/RDF/OWL boundaries. |
| 6 | O1.1 | done(67cfd4394) | Workshop does not recommend baseless `is_a`. |
| 7 | O1.3 | done(c1ba92e86) | Fix requirements, CQ, examples, counterexamples, and multi-dimensional quality evaluation contracts. |
| 8 | M1.5 | done(030269632) | MCP/skill/prompt enforce the same ontology-construction lifecycle. |
| 9 | O1.5 | done(0ef1c5aa4) | Human-owned exact plan closed qualification→write→finalize→source-hidden reuse. |
| 10 | U1.3 | done(84fb9d177) | Use the same ontology-construction easily at basic/expert depth. |
| 14 | U1.1 | done(0b8406b39; merged 8667c5c3a) | Projects no longer asks lifecycle questions twice via category/status. |
| 15 | U1.2 | done(350163ce2; merged 8667c5c3a) | Spotlight returns to idle after bounded motion. |
| gate | O1.4 | hold(repeated missing primitive) | Assume schema expansion only when missing primitives are repeatedly proven. |

### 2026-08-13 MCP FDE scale checkpoint

Repeatedly ran Codex/Claude Code in Atlas-only mode on fresh Pyspinel·Textual·Refined GitHub clones and 5-starter vaults. `analyze_repo_structure` could create a small review plan, but
the large `infer_imports` full payload swallowed agent context, reproducing the P0 of missing Python/TS
endpoints depending on source layout. The current slice strengthens source/import classification, automatically switches to a single compact review when expected MCP
responses exceed 128 KiB, and requires checking `allowLargeResponse:true` even for large explicit fulls. Automatic node/relation writes are zero.

**Remaining order**:

1. **Complete · focused import evidence** — Fresh Codex approved large-response checks, elevating `focusPath`/`reviewMode:"focus"` to P0 after falsifying the need to read full three times. Returns incoming/outgoing exact file edge counts for one endpoint and up to 100 receipts/cursors without a vault.
   It is a static source boundary and makes no claims about runtime/semantic impact or automatic relations.
2. **P1 · candidate-local endpoint repair** — Loads `absentEndpoints` and exact endpoint modeling repair arguments directly into global `nextReview` candidates. Do not mix focus evidence
   and semantic review queue into one packet.
3. **P1 · client registration isolation** — Separately verify the Codex/Claude
   precedence trap where registering multiple fresh vaults in the same cwd leaves the first client config behind and subsequent servers point to 0 tools or wrong vaults, in both installed app/source-checkout contexts. Do not mix MCP analysis quality with client
   registration quality into one verdict.
4. **P1 · 100+ semantic-node qualification** — This measurement proved bounded discovery of 874 review candidates and 253
   unique endpoints, but did not prove the quality of 100+ semantic nodes.
   Execute only when human approval, write, and source-hidden tasks are needed in scenarios with 100+ accepted concepts across different domains/CQs. Do not bulk-promote based on node count as a goal.
5. **P2 · unsupported languages** — Rust `use`/`mod`/macro graph remains explicitly unsupported.
   Do not interpret 0 edges as no dependencies; open only when repeated FDE demand exceeds Python/TS P1.

### Task Cards and Completion Criteria

#### D0 — Document Master Copy and Execution Ledger

- **IN**: This active track, decision ledger append, `PRODUCT-DIRECTION` current master copy
pointer correction, removal of obvious drift in the current surface prose.
- **OUT**: Product code, schema, MCP prompt, UI, and a human-gated gate for matching generated counts.
- **Done**: `pnpm docs:check`, `pnpm agents:check`, `pnpm checks:changed` are green and
the evidence table below records HEAD, command, and result.

#### D1 — Ontology-Construction Foundation Reverification

- **IN**: Public primary literature reverification, `FOUNDATIONS` formal/RDF/OWL/SHACL boundary correction,
construction lifecycle·quality vector·human-sovereign evaluator contract, execution order rearrangement.
- **OUT**: MCP/schema/skill/prompt/UI implementation, new kind, standard conformance implementation.
- **Done**: All new sources are actually opened or verified with official source metadata,
failed fetches are recovered with alternative sources or left unused. Generated docs and document gate
are green and results are logged in this ledger.

#### M1.1 — proposal ↔ finalizer witness parity

- **User Change**: Approved/written ontologies finalize without losing their basis,
and the new MCP process reads the same categorical assessment.
- **Scope**: Proposal evidence resolver, source witness/receipt inventory,
finalizer, app↔MCP mirror and contract fixture.
- **Prohibited**: Blindly relaxing the finalizer, storing private absolute paths, interpreting `canWrite`
as a completeness score, adding temporary exceptions per project.
- **RED**: A reduced fixture where analyzer-approved semantic documents and safe top-level source paths
are rejected by the current finalizer after write.
- **Done**: proposal → unchanged writePlan → source connect → finalize → fresh-process
`agent_brief` succeeds and private coordinates are absent from public handoff.
- **Verification**: Focused MCP unit/write/surface, app↔MCP source-witness contract,
source-hidden handoff, final `pnpm checks:changed -- <changed paths>`.

#### M1.2 — executable agent-config readiness

- **User Change**: Source checkout and app-bundled config are ready; dead npm launches and
different vault configs are marked for repair.
- **Scope**: Config parser/validator, CLI init·agent-setup templates, Settings readiness
denominator, actual `mcp-verify` connection.
- **Prohibited**: Checking only for the string `ontology-atlas-mcp`, reviving npm packages,
misrepresenting `.mcp.json.example` as a real connection file.
- **Done**: Source node entrypoint and bundled binary fixture are valid; `npx -y
ontology-atlas-mcp` is invalid; the role of the example file matches the UI count.
- **Verification**: Validator negative/positive corpus, fresh CLI init roundtrip, Settings status vs. actual MCP first contact in a freshly built installed app.

#### M1.3 — quick-start terminal truth

- **User Change**: Scaffold success and bootstrap/MCP verification failure are distinguished and
immediate recovery is possible.
- **Done**: Failure fixture has nonzero exit with green `done`, no `bootstrapped` or
`MCP already wired`, but includes “config written but unverified” and recovery commands.
The successful fixture maintains its short 3-step flow.
- **Verification**: CLI entry integration RED/GREEN, packed/source parity.

#### M1.4 — current MCP inventory single source

- **User Change**: All first-contact messages describe available tools without omission.
- **Scope**: Raw initialize instructions, current product docs, starter templates,
generated docs surface.
- **Prohibited**: Modifying historical numbers in records, manually copying new counts to multiple docs, testing sentences
with literal pinning.
- **Done**: `tools/list` → generated manifest creates current claims; initialize header/list/count match each other.
- **Verification**: Raw stdio initialize+tools/list, MCP surface integration,
`docs:surface:check`, starter locale tests.

#### O1.2 — Atlas meta-model truth boundary

- **User Change**: Humans and agents use the same discrimination method for domain/capability/element/document, and Atlas does not expect RDF/OWL/process inference it doesn't perform.
- **Scope**: Single definitions in `FOUNDATIONS`·`PRODUCT-DIRECTION`, 5-kind includes/excludes with
examples/counterexamples, relation direction/domain/range/inverse/world-assumption table,
`is_a` subsumption discrimination, bootstrap/field-trial/MCP prompt progressive-disclosure pointer.
- **Prohibited**: Equating “machine-readable = formal semantics”, implying RDF/OWL conformance,
making relation claims not present in actual relation enums like `evidence`, multiple copies of the same rule.
- **Done**: Docs·schema templates·skill·prompt point to one master copy; adversarial
concept fixtures do not auto-promote folder/team/workflow to domain/capability;
`is_a` is not created solely by same-domain·name similarity·folder nesting.

#### O1.1 — relation-specific Studio recommendation

- **User Change**: Empty UP sockets remain as relationship affordances but do not promote siblings to parent
concepts. Recommendations are attached only when there is basis and preflight.
- **Scope**: Studio picker scoring/labels/create+enhance states and relation-specific tests.
- **Prohibited**: Removing `is_a` itself, changing compass bearing, using same-domain as subsumption basis,
hiding recommendations behind other decorations.
- **Done**: Same-domain sibling negative fixture is green; neutral/recommended
accessibility names and visual hierarchy are distinguished in the installed app.
- **Verification**: TDD+gate-probe, focused Vitest, user walkthrough, design audit, rebuilt app.

#### O1.3 — requirements, CQ, quality evaluation contract

- **User Change**: C-level asks about outcome/risk; employees ask about purpose/role/process gap; FDE
asks about change/impact/verification; agents ask about evidence/currentness/next safe action.
- **Scope**: Motivating scenario, CQ owner/revision provenance, atomic CQ, expected answer,
quantifier, witness, refusal/unknown, exemplar/counterexample, source-hidden evaluator,
distinct judgments for semantic·structural·functional·evidence/provenance·pragmatic·maintenance·interop,
distinct metrics for time/cost/citation/claim accuracy.
- **Prohibited**: A single composite score, maker self-approval, using node count as quality.
- **Done**: Each CQ has a human owner and approval history; green on one judgment axis
does not mask red on another. Fixtures·expected answers·claim
ledgers·judgment rubrics for three unfamiliar product qualifications are reproducible and failure causes are classified by evidence·prompt·UI·missing
primitive.

#### M1.5 — ontology-construction lifecycle enforcement

- **User Change**: Fresh agents build not by collecting directory nouns but in the order: purpose→CQ→evidence→small
model→semantic/structural test→source-hidden task→human approval→regression.
- **Scope**: Derive existing `construction-spec.mjs`·node eligibility·write gate·bootstrap skill·
MCP instructions into one lifecycle and define step-by-step artifacts/diagnostics.
- **Entry Condition**: Public MCP/prompt contract change requires `/po-council` and decision append.
- **Prohibited**: Copying existing 3-layer rules, LLM self-approval, hiding failures in UI, preceding new kinds,
promoting source paths to concepts, folding all steps into one opaque confidence.
- **Done**: Node 24 fresh fixture fails closed on missing steps·lack of authority·unsupported `is_a`·
maker-only evaluation; only accepted write plans are written to the vault and previous CQs
are re-executed as regression.

#### O1.5 — three-product independent construction qualification

- **User Change**: FDE·employees·C-level·new agents get answers appropriate to source availability and next safe
actions, receiving an ontology that admits ignorance.
- **Scope**: Three different unfamiliar products, evaluator separated from maker, source-visible construction
+ source-hidden handoff, user-group-specific CQs, exact claim ledger, time/calls/supported claims measurement.
- **Prohibited**: Same agent creating and approving, passing based on node/edge count, secretly providing sources to
source-hidden evaluators, averaging unsupported claims with partial ones.
- **Done**: All three products pass semantic·functional·evidence·pragmatic
judgments in addition to structural validity. Failed axes remain red and do not proceed to K1/U1.

**2026-08-10 First Independent Execution — Failed, write 0**

Three builders and three source-hidden evaluators were separated into fresh `gpt-5.6-sol` sessions.
All scratch vaults remained at the 5 starters; write tool·approval·`writePlan` were
0 for all. Product names and clones are kept only in trial reports outside the repository.

| trial | semantic | structural | functional | evidence | pragmatic | maintenance | interop | source-hidden CQ | claim audit | time |
|---|---|---|---|---|---|---|---|---|---|---:|
| Python Research Ops Tool | fail | pass | fail | fail | pass | unknown | fail | executive/employee/agent answered, FDE partial | 13 supported · 1 partial · 1 unsupported | 11m34s |
| Rust Setup Infra CLI | fail | unknown | fail | fail | fail | unknown | unknown | executive/employee partial, FDE refused, agent answered | 9 supported · 5 partial · 3 unsupported | 7m49s |
| TypeScript Desktop Reader | unknown | pass | fail | fail | fail | unknown | unknown | executive/employee partial, FDE unknown, agent answered | 20 supported · 2 partial · 3 unsupported | 11m14s |

The common failure was not node count but **evidence selection for portable meaning packets**.
Python's architecture documents described dependencies·entrypoints but did not enter the packet,
and TypeScript's plan failed to propose canonical paths and elements for 5 capabilities. In Rust, we also identified more direct validator defects. Adding a common `js` path to the `claim-review-required` README caused us to count path existence as independent current-state meaning evidence, allowing the proposal to pass. The source-hidden evaluator judged 3 of the plan's 17 claims as unsupported.

Therefore, we maintain human approval·separated quality axes in the lifecycle. This is because unsupported plans
were actually blocked from write. First, fix the validator to prevent corroborating dangerous **meaning** claims without structural paths, and re-prove the detector with a representative product fresh trial. Then repair evidence ingress by placing current architecture/product contract and implementation entrypoints into bounded packets, and repeat qualification for the three products. The currently repeated defects are evidence/packet issues, not missing ontology primitives, so O1.4 and U1.3/K1/U1.1 are not opened.

**Post-validator repair, re-run of the representative**: The previous exact Rust proposal replay changed from `pass` to `fail` after modification and returned five instances of `risky-citation-unconfirmed` for project·2 concept·2 relation. A separate fresh Sol builder also resulted in `fail` for both the initial and final proposals over 198.84 seconds with 5 MCP calls, and did not elevate structural `js`/`site` to semantic source status. There were zero additional trusted semantic sources within the packet, while `reviewPlan`, `writePlan`, and write call counts remained at zero; the vault maintained the same hash as its five starters. This confirms detector repair but does not complete O1.5 qualification. The next tracer, evidence ingress, remains necessary.

**Bounded Evidence Ingress Implementation — Independent Re-execution Complete, Qualification Failed**: Without increasing existing public tools/schemas/kinds/UIs,
we locate semantic documents in root `ARCHITECTURE.md` and `docs/`·`site/`·`website/` within a maximum of 200, keeping the final packet within existing limits of max 6 entries·1,200 characters excerpt. Archives and repository-escaping symlinks are excluded. Proposal calls recalculate existing `infer_imports` receipts within the same call to verify TS/JS/Python exact endpoint citations and dependency directions without hidden state from previous calls. Forward proposals are reviewable; reversed direction is fail-closed.

When the three preserved subjects were deterministically re-analyzed, Python's semantic rows increased from 2→3 including root architecture; Rust's increased from 1→4 making CLI/library introduction and site contract current semantic evidence. TypeScript's semantic row remained 1, but exact import endpoint receipts that previously disappeared during proposal verification now exist within the same call. This number does not indicate qualification pass.

Fresh maker/source-hidden re-execution also kept all three vaults at 5 starters·write 0, all
`not-qualified`. Python gained root architecture provenance but retained 13 supported ·
1 partial · 1 unsupported and FDE partial. Rust created a reviewable plan with 5 supported · 2 partial · 1 gap/refusal using current site contract without risky README workarounds, but implementation path and impact were empty. TypeScript improved capability/elements from 5/0→2/4,
FDE from unknown→partial, but runtime·ownership·interop·human approval claims remained
unsupported. Raw counts of different claim ledgers are not compared as quality scores.

Council review identified a gap where the 200 limit counted only Markdown files, not limiting total directory walk and read bytes. General semantic Markdown stops reading at 256 KiB before reading, applying a 1,000 entry walk budget for three roots and visited-realpath cycle blocking. Even after proving each defect RED→GREEN, O1.5 remains `in_progress`. The next tracer is not new root/schema/UI but write→source-hidden reuse of one product with human-owned purpose/CQ/exact plan and implementation/impact witness. After this journey succeeds, repeat welfare across two different products, and close O1.5 only when all three mandatory quality axes are green.

#### U1.3 — progressive-disclosure construction UX

- **User change**: The default user only needs to confirm the goal, select ambiguous meanings, and give final approval; evidence exploration, CQ replay, validation, and regression are handled by the agent in the background. Expert users can expand CQ, witness, source span/digest, examples/counterexamples, relation rationale, quality-axis diagnosis, and write plan from the same result to review and edit directly.
- **Product contract**: Default/expert are not different ontologies or validators but **two disclosure depths of the same artifact**. Changing depth does not alter Markdown, receipt, or verdict results; the default screen does not hide red/unknown/conflict or require human approval. Automation covers investigation, suggestion, and verification; the accepted write plan approval right remains with humans.
- **Design conclusion**: No global Settings or remembered persona. `View verification result` in project detail opens a summary within the same page, and only `View evidence/diagnosis` expands detailed evidence for the same artifact. There are no labels like `layperson` or `expert mode` that stigmatize proficiency.
- **Prohibited**: Two schemas/two truths, expert-only correctness, silent auto-accept in default mode, folding important failures into green summaries, separate components/tokens/ramps outside the design system.
- **Done**: The first user finishes construction without learning internal terminology; experts trace and edit each verdict's evidence without escaping to raw Markdown. Both modes produce the same receipt and diff; design audit, responsive sweep, and rebuilt installed app WebView verification are green. In environments where the Codex Computer Use connector is provided, the same installed app journey is left as additional evidence.

#### U1.1 — Projects taxonomy contract

- **Entry condition**: PO Council + decision ledger. Decide on open frontmatter compatibility and actual user classification purposes first.
- **Options**: Define category as a structural grouping independent of lifecycle, or retire required category. Status owns only one axis of the lifecycle.
- **Done**: old vault roundtrip, default ID meaning duplication negative test, create/edit UI walkthrough. Do not perform automatic migration without separate approval.

#### U1.2 — bounded spotlight motion

- **Entry condition**: design-motion decision — static or token-defined one-shot.
- **Prohibited**: Keep the frame loop permanently active while spotlight is on.
- **Done**: normal motion changes phase during a bounded interval then goes idle; reduced-motion rotation 0; pan/drag perf regression 0.
- **Verification**: idle-gate contract, actual macOS recording/frame diff, map-perf.

#### O1.4 — schema expansion decision gate

This is not an implementation item currently being executed. Only after completing O1.5, if the same CQ repeatedly fails across independent trials with at least three unfamiliar products/organizations and user groups despite providing current evidence and improved prompts, and when evaluators agree on the cause as a **missing primitive** such as outcome identity, actor-role participation, or process ordering, will it be presented to `/po-council`. The first candidate is not a new root kind bundle but a qualified statement/provenance envelope.

### Things explicitly not working on

- relation rationale loss: Not reproduced in current vault, handoff, or focused roundtrip. It is not a task until byte-level reproduction for specific consumers.
- workspace stale slug and Insights evidence phrasing: Current HEAD implementation and E2E already exist.
- OWL reasoner, general process ontology, outcome/role/process root kind precedence addition.
- spotlight always-on repaint, full UI redesign, Orca removal.
- C-level Insights hierarchy: Only re-register as discovery when the same stall is reproduced twice in declared-knowledge walkthrough. Do not automatically merge with U1.3's default/expert depth.

### Completion Evidence Ledger

Fill one row of this table before changing to `done`. Do not paste large logs; only write HEAD/commit, the RED that caught the failure, focused checks, runtime/handoff proof, and remaining risks.

| ID | commit/HEAD | RED | focused checks | runtime/handoff proof | residual risk |
|---|---|---|---|---|---|
| D0 | D0 documentation commit (this row) | stale plan authority + stale 33/14 current claim | `docs:check`; `agents:check`; `decisions:check`; `checks:changed` | docs-vault regenerated; generated surface confirmed 35 MCP (19 read + 16 write), 54 CLI | product code untouched; `AGENTS.md` has 606-byte cap headroom |
| D1 | D1 research commit (this row) | `formal=machine-readable`, RDF/OWL conformance implied, missing lifecycle·quality-vector | `docs-vault:check`; `docs:check`; `agents:check`; `decisions:check`; `checks:changed` | Cross-verify classical methodologies, W3C standards, and 2025~2026 LLM/CQ primary sources to strengthen the canonical text and order | Implementation starts from M1.1; reflecting lifecycle's public contract is after M1.5 PO Council |
| M1.1 | `844104d73` | analyzer saved witness of approved `README.md` as unchanged writePlan, then finalizer rejected with `scope` unresolved | MCP unit 32; app/MCP focused Vitest 17; contract 1,559; MCP integration 115; TypeScript·ESLint; gate-probe RED→GREEN | Node 24 actual stdio proposal→write→connect→finalize→fresh `agent_brief`; scope resolved, intended impact gap maintained, private root exposure 0; dogfood MCP 35/35 | Only derive `Evidence`/`Paths` of exact `## Competency answers`, excluding arbitrary body paths; no UI changes; next is M1.2 executable config truth |
| M1.2 | `d375bada9` | source/bundle settings are false, dead `npx` is true, Settings counts up to `3` even for templates, CLI also judges `npx` as ready | app/config/Settings 161; CLI integration 289; contract 1,559; desktop bridge 135; desktop check 274; i18n 16; TypeScript·ESLint; gate-probe RED→GREEN | Node 24 fresh init's active config 4/4 + stdio MCP 35/35; verified Settings 2/2 and two rows only in rebuilt `/Applications/Ontology Atlas.app` with Codex Computer Use; bundled binary 35/35 | ready is the execution shape·target file·vault coordinate contract, and the live session itself is proven by separate `mcp-verify`; next is M1.3 terminal truth |
| M1.3 | `761d555a4` | outputs green `quick start done`, `bootstrapped`, `MCP already wired` even after bootstrap exit 2; actual tarball has runtime import missing, so normal quick-start also exits 2 | quick-start source 7; CLI integration 290; package contract MCP 41/CLI 90 reachable; packed CLI success+failure; ESLint; gate-probe RED→GREEN | Both source and new tarball installation succeed with existing 3-step; failure is nonzero + `quick start incomplete` + written-but-unverified + executable diagnose/retry commands; packed MCP missing runtime file recovery | Preserve scaffold/config write but do not promote to bootstrap/live MCP preparation; next is M1.4 runtime-derived inventory |
| M1.4 | `dbc063364` | full initialize is `33/19/14`, same session tools/list is `35/19/16`; read-only initialize also exposes 16 writes but actual list is 19 reads | formatter 3; verify 129; MCP surface 4; starter/Settings/launch 79; CLI mcp-verify integration 11; package 30; docs·agents·decision gates; count pollution·read-only write leak·current prose count injected respectively to RED→GREEN | Node 24 dogfood `mcp-verify` confirms live 35/35 and initialize exact count/name split; read-only integration is 19/19·write 0; packed CLI smoke proves new runtime module inclusion; generated surface is live 35/19/16; fresh `/Applications/Ontology Atlas.app`'s bundle MCP also spawned with 35 tools, and Codex Computer Use confirmed no numbers in `Current Tools` guide in EN·KO Settings, `mcp-verify` path, panel internal scroll·no trapping | `mcp/package.json` count is consumed by CLI/package verification and kept as machine metadata bound to generated registry; human prose·starter·Settings point to `tools/list`/`mcp-verify`; no new tokens·layouts·motions, reuse existing Settings recipe; next is O1.2 meta-model truth boundary |
| O1.2 | `9ca7bf65c` | New consumer contract 16/16 catches missing canonical export/pointer/prompt as RED; removing one line of boundary injection in MCP initialize makes exactly 1 item RED, restoring it to GREEN | contract 1,575; MCP unit 600; MCP integration 115 + guarded `broader` focused 1; starter/schema 170; CLI starter prune 3; TypeScript·ESLint; docs·agents·decision gates; Sol independent audit 3/3 approval | Node 24 live stdio MCP 35/35; `get_concept` mtime→full `broader` patch→validate success and `add_relation(type:is_a)` rejection; dogfood 71 nodes/154 edges, validator·compile·maintenance issue 0 | dogfood's authored `document`/`broader` 0 is not counted as completion evidence; public links are GitHub `main`, so keep compact offline fallback; fresh source-hidden understanding is repeatedly measured in O1.3/O1.5; no UI/design/app changes; next is O1.1 Studio recommendation |
| O1.1 | `67cfd4394` | same-domain sibling recommendation, unknown focal isA kind union, exact-name `Yes, link`, project→isA all-kind create fixed as RED respectively; 4 mutations reversing suggestion suppression·evidence guard·create/enhance neutral all RED | Node 24 focused Vitest 117; contract 1,575; desktop 274; i18n 16; TypeScript·ESLint; Studio fill E2E 1 | Playwright 1512×900 neutral socket 3·recommendation 0·overlap/overflow 0, isA suggestion 0 then Browse 9 domain/same kind node 8; 390px honest narrow state; `/Applications/Ontology Atlas.app` rebuild passes route/WebView/window screenshot, Codex Computer Use confirms `No recommendation evidence` and no candidates | Current producer does not create semantic receipts so positive recommendations are 0; O1.3 creates evidence/CQ contract first. React setState-in-render warning for existing draft save path is a separate debt; next is O1.3 |
| O1.3 | `c1ba92e86` | module missing RED then self-reported `coveredTargets`, maker self-evaluation, ignoring stale evidence axis, unrelated citation, only some claim's source-hidden pass, stale axis pass mutation injected respectively as RED; probe finds and strengthens bypass passes in independence tests | Node 24 focused 12; MCP all 579; package contract 30 + root/CLI 260; MCP docs 12; ESLint; docs links/vault; gate-probe RED→GREEN | Re-executed digest-bound representative packet for four user groups·seven axes to qualify, each adversarial packet not-qualified/invalid; dogfood 71 nodes/154 edges, validator·compile·maintenance issue 0, live MCP 35/35 | Internal pure contract, not yet used by MCP/bootstrap producer; representative fixture is not three actual product qualification evidence; no UI/app changes; next is M1.5 lifecycle enforcement requiring PO Council |
| M1.5 | `030269632` | Starts with RED for passing packet without lifecycle module and purpose/regression; proves 5 executable forced-true mutations, removing focused-advisor mapping, explaining previous direct-add respectively as RED then restores | Node 24 lifecycle+qualification 22, analyzer 55, MCP unit 622, integration 116, verify 126, advisor 69; package·docs·agents·decision·ESLint; gate-probe RED→GREEN | Both source and bundled MCP have 8 steps, first call `canWrite:false`, approval call `canWrite:true`, `reviewPlan === writePlan`; public source-hidden `not_measured` blocked without writePlan; live MCP 35/35, dogfood 71 nodes/154 edges, validation·compile·maintenance issue 0 | Detailed lifecycle/approval transcript does not persistently restore after restart, leaving only existing competency body+finalizer receipt; fixture/parity is not three actual product quality evidence so next is O1.5; no UI/design/app changes |
| O1.5 | `0ef1c5aa4` | Repeatedly repairs fail-closed for fresh maker/evaluator's exaggeration·wrong evidence·stale owner receipt·schema/closure bypass, maintaining write 0 until exact current-source human approval | current qualification 48/48 claim·citation, 4 CQ, 7 targets, 7 axes; exact analyzer `canWrite:true`; lifecycle executable; post-write validate errors/warnings 0; compile issue 0; independent final audit GO | Saves approved 9 concepts/9 relations as unchanged writePlan and source connect·finalizer success; 19-read/0-write source-hidden handoff with private absolute path 0; re-verifies current source and exact four-kind path | `needs_evidence/structure_not_ready` is starter island·relation maintenance outside approval, not auto-complemented; U1.3 owns disclosure of the same artifact |
| U1.3 | `84fb9d177` | Fixes malformed envelope, project/source/plan digest mismatch, review/write inequality respectively as fail-closed fixtures and reproduces digest gate mutation as RED | construction entity·session·panel·project detail focused 31; combined browser E2E 15; a11y opener 6/22; TypeScript·ESLint·surface-motion/control ratchet; full Vitest 6,665 pass | One local JSON in project detail opens `View evidence/diagnosis` for the same artifact as session-only summary, with write/vault/URL save 0; verifies `/Applications/Ontology Atlas.app` 1512×917 route/WebView and bundled MCP 35 tools rebuild | Codex Computer Use native pipe does not start in this environment so replaced with Orca; use official WebView·DOM·E2E as shipping evidence and add same journey observation when connector is provided |
| U1.1 | `0b8406b39` → `8667c5c3a` | Checks if mutation restoring category/status defaults reinvents omitted field as RED | Node 24 project 21 files/126 tests; contract 142 files/1665 tests; TypeScript; docs-vault surface/links | Preserves omitted category/status on latest main, maintains old vault roundtrip; static studio E2E 5/5; desktop smoke 282/282 | Full schema migration to resolve category/status meaning duplication is OUT before separate PO judgment; this slice only handles compatibility and removing implicit defaults |
| U1.2 | `350163ce2` → `8667c5c3a` | Mutation continuing spotlight phase even in idle makes 1 of 3 contracts RED, restores to GREEN | Node 24 topology 61 files/898 tests (+3 todo); TypeScript; desktop contract 282/282; map-perf node drag real mouse | Rebuilds/deployes new static export/Tauri app based on main; installed app route/window/WebView/screenshot pass; confirms idle stable interval after toggle transition in 30fps macOS recording (active crop mean 1.059, idle 0.032); actual node drag `Node grab ✓`, 3000-node p95 3.4ms/max 6.9ms, 31-node p95 1.5ms/max 1.9ms | reduced-motion closes pure contract with 0 rotation, separate system setting recording is not yet available; spotlight redesign·always-on repaint remains OUT |

### Track Common Termination Rules

1. Before starting, verify that preceding IDs in this table are `done`.
2. Implementers do not approve their own changes. Separate source-hidden or built-surface evaluation from maker.
3. When adding/modifying gates, prove violation census→RED→GREEN with `/gate-probe`.
4. UI is created only when solving observed ontology workflow problems. Visual changes follow the order `/design-directions`, `/design-build`, `/design-audit` after PO if there is a structural choice. Values are owned by token/ramp and existing primitives in `DESIGN-SYSTEM.md`, not creating raw parallel specs. Execute responsive/motion/map instruments based on impact, and for desktop impact, rebuild/run the installed app to verify with official WebView verifier. If Codex Computer Use connector is provided, observe the same journey additionally, but do not claim pass by replacing with other computer-use implementations.
5. The last command is always `pnpm checks:changed -- <paths...>` passing the change path.
6. At completion, synchronize `docs/CHANGELOG.md` and dogfood ontology if needed, updating only this table as the state canonical text.

---

## Below is historical backlog

Do not delete the completion records·reasons for discard·recommended order below. Current work status and order follow only the **active execution tracks** above. If the `recommended progress order` or fixed surface count below differs from active tracks, it is a historical value, not a new directive.

## ✅ Done (R12-R14, 2026-05-04 ~ 2026-05-05)

### R14 (#155-#163, 2026-05-05) — AI agent ↔ vault auto sync + web immediate reflection

| PR | Item | Result |
|---|---|---|
| #155 | vault polling 5s | ✅ visible-only `setInterval`, fingerprint diff |
| #156 | graph diff pulse | ✅ New node amber sine 5s on `/topology` |
| #157 | added toast | ✅ 'Added: <slug>' on all pages |
| #158 | modified toast | ✅ Same slug + mtime change 'Edited: <slug>' |
| #159 | walkthrough 5 fix + topology↔ontology recovery | ✅ /topology 1 node → 68 nodes 112 edges |
| #160 | frontmatter schema form (3 entry points sync) | ✅ `mcp/cli/src/lib/schema.mjs` single source |
| #161 | CLI `import` — normalize external .md then settle in vault | ✅ cli 5 → 6 commands |
| #162 | `/ontology-sync` skill + AGENTS read-while-coding rules | ✅ Explicit trigger branch |
| #163 | SessionStart hook — auto inject vault census | ✅ Implicit trigger branch |

### R13 (#43-#67, 2026-05-04) — AI agent quality first measurement + VSCode plugin

| PR | Item | Result |
|---|---|---|
| #47 #48 | AI agent benchmark 7 task × 3 categories cross-agent (Claude Code + Codex) | ✅ n=2, MCP value measurable (CC: hallucination 9→0, Codex: tool calls -76%) |
| #45 | MCP `instructions` field (v0.7.1) | ✅ Session-level prompt guidance |
| #49-#67 | VSCode plugin v0.1.0 → v0.9.0 | ✅ status bar / backlinks / add concept / MCP connect — **Remove plugin itself in R15** (daily driver shifts to AI-agent terminal) |

### R12 (#27-#42, 2026-05-04) — developer-primary decision + CLI 5 commands + dogfood graph completion

| Item | Result |
|---|---|
| Primary audience = developer + AI agent (PM drop) | ✅ PRODUCT-DIRECTION v3 |
| CLI 4 new commands (`list / validate / add / find`) | ✅ cli v0.2.0 |
| Cross-package contract 4-way (parser) / 3-way (validator) | ✅ 12fix×4 + 8fix×3 = 72 cases |
| dogfood graph orphan 8 → 1 (intentional 1) | ✅ |

### R11 (2026-05-04) — vault tooling + parser contract + MCP graph-level write

| Item | Result |
|---|---|
| `pnpm vault:validate` / `vault:migrate` | ✅ |
| MCP v0.7.0 — 14 tools (8 read + 6 write, `rename_concept` / `merge_concepts` added) | ✅ |
| 3-way frontmatter parser contract | ✅ |
| MCP conflict guard (mtime-based silent overwrite blocking) | ✅ |

### Resolved Open Questions

- **Q1** — `/` auto vault switch → ✅ (a) adopted, useOntologyInsight introduced
- **Q2** — remove share-doc system → ✅ commit d27e3d0
- **T30** MCP `find_path(from, to)` → ✅ R11 v0.7.0
- **T31** MCP `list_kinds` → ✅ R11 v0.7.0 (`list_domains` covered by `list_concepts({ kind: 'domain' })`)

---

## ~~Decisions Needed (unblock after user input)~~ — Q3-Q8 self-invalid

The cloud-era questions below were retired with the local-first model; current
ontology boundaries are defined in `docs/ONTOLOGY-ATLAS-SPEC.md`.

- **Q1·Q2** — Resolved (mission v2 cleanup)
- **Q3-Q7** — Answer confirmed (2026-05-02, default adoption of user recommendations)
- **Q8** — V1.4 self N/A (functions/ closure removed server-side action) → immediate impact 0

V2 integration itself is a cloud collection merge that is `invisible` in the `mission v2 default path`, so ⏸ N/A. **After R10b (permanent firebase removal), the V1.x evolution cloud-side context itself is dead**. The spec is preserved in archive to reactivate when future server adoption decisions are made.

---

## P0 — Immediately Executable (Low Risk, High Value)

### M1. 10-minute memory loop proof — *launch readiness gate*

- **Goal**: In a fresh repo, `init -> analyze/bootstrap -> MCP first-contact ->
  agent answer improvement -> sync proposal -> git diff review` must demonstrate
  value within 10 minutes.
- **Automatic gate**: `pnpm smoke:memory-loop` runs `init ->
  bootstrap -> validate -> workspace_brief -> agent_brief -> node_profile` in a temporary TS repo,
  then adds a new feature file and verifies within the 10-minute budget whether
  `analyze_repo_structure` proposes side-effect-free sync candidates and if the git diff matches those code changes.
- **Verification**: Select one new/unfamiliar TS repo and measure with a recordable procedure. If writing ontology manually takes too long, it fails.
- **Success criteria**: The agent grasps the structure faster based on `workspace_brief` / `health` / `query_ontology`, and post-work vault diff proposals match actual code changes.
- **Current meaning verification boundary**: `finalize_project_meaning` fixes five
  competency answers for the current project as a versioned receipt, and subsequent `agent_brief --project
  SLUG` re-compares structure, competency, and source dimensions. Do not interpret receipt write success or
  structure readiness as confidence scores.
- **Why P0**: Marketability lies not in the ontology itself but in the loop of reducing agent memory maintenance costs.
  If this loop isn't visible, it's a good engine but not yet a product.

### ~~T28. demo blueprint mission v2 alignment~~ — VOID

`src/shared/mocks/demo-blueprint.ts` itself has already been removed (git log unverified on which round it disappeared — cleanup already complete). The residual text in manifest.json is a build-time generated docs citation, not a direct target for manual intervention.

### ~~T29. /docs/ first-time UX — dogfood vault hint~~ — DONE (2026-05-09)

`/docs/?intent=local` displays the `docs/ontology/` dogfood hint immediately when opening the vault picker. Fix first-time hint copy via E2E.

### ~~F1. dogfood vscode-plugin capability update~~ — VOID (R15)

R15 removes the vscode-plugin itself. The `vscode-plugin-ide-entry` capability is also deleted. The target for update no longer exists.

### ~~F2. VaultDiffToaster diff logic unit test~~ — DONE (2026-05-09)

`diffVaultManifest` and `planVaultDiffToasts` have been fully separated into pure helpers. Regression blocked by 14 unit cases covering added/modified classification, monotonic mtime increase, null mtime skip, ignored removals, preview limits, and overflow toast planning.

### C3. AI agent benchmark scale n=2 → n=5+ — *user-triggered*

- **Current**: R13 cross-agent (Claude Code + Codex) benchmark n=2. Strong confirming evidence
- **Status**: Added "Current measurement status" + re-measurement guide (`pnpm benchmark --bypass` etc.) to `docs/benchmark/README.md` in R14 closeout. Actual measurement requires explicit user trigger
  - Codex automatic: Requires `--dangerously-bypass-approvals-and-sandbox`, needing explicit user approval
  - Claude Code self: Manual walk in a new session
- **Re-measurement value timing**: When vault reaches 25 → 50 nodes (whether effects scale or saturate)

---

## ~~P1 — V1.x Evolution (cloud-first assumption)~~ — All N/A or Merged

After R10b (permanent removal of firebase / functions / firestore), the cloud-side evolution context itself disappears. Progress status table in archive (2026-05-02):

| Track | Status |
|---|---|
| V1.1 — Statement Qualifiers + Rank | ✅ Merged (PR #10) |
| V1.5 — Relation Cardinality | ✅ Merged (PR #23) |
| V1.2 — Literal Properties | 🟡 vault-adaptation (no new cloud collection, PR in progress for direct frontmatter scalar editing) |
| V1.3 — Rich References | ⏸ N/A — cloud LLM extraction flow abandoned |
| V1.4 — Action Type | ⏸ N/A — server-side action gate abandoned |
| V2 — Integrated KnowledgeStatement | ⏸ N/A — cloud collection invisible |

Reactivate from archive when future cloud collaboration phase is reintroduced. No P1 items currently.

---

## P3 — Infrastructure / Regression Blocking

### T37. Playwright MCP routine QA

- Navigate core routes and check console errors on every PR or nightly
- Needs: CI runner capable of executing Playwright MCP
- Est: 1-2 commits

### F3. .mcp.json git-tracked (✅ Added in this R14 closeout)

- When a user opens Claude Code after git clone, the MCP surface at that time is automatically registered.

### ~~T23. mode-aware e2e tests~~ — VOID (R10b)

R10b removes firebase. The distinction between cloud / static modes itself disappears.

### ~~T38. functions Firestore collection archival~~ — VOID (R10b)
### ~~T24. knowledge-* collection integration review~~ — VOID (R10b)

---

## P4 — Marginal value (defer)

### CHANGELOG batch cleanup
Remove completed ✅ items from BACKLOG and move to CHANGELOG. Operational task, marginal value.

### T12. NodeDetailPanel evidence excerpt modal
After T20 (rich references).

### T27. Clean up large view files
- `KnowledgeDocumentDetailPage` (already cleaned -300 lines, 1100+ lines remaining) — defer

### T40. Re-route physical force control v2 — revive if needed as a real feature
The force slider (repel/linkDistance/collide) removed in the "map controls" panel teardown on 2026-07-21 was dead UI that the v2 canvas loop didn't consume. If the owner wants layout physics tuning as a **real feature**, redesign it as a control actually wired to `useTopologyLoop`'s ForceAtlas2 parameters (not just restoring the old UI, but connecting from the consumer side). Apply the same principle to depth/hubsOnly/search filters — ensure the loop's actual read path exists first.

---

## ~~P2 — Phase 4 (Refining non-developer surface)~~ — DROPPED (R12 #33)

PRODUCT-DIRECTION v3 reverted the PM-primary decision.
> Primary audience = developer + their AI agent. PM-friendly surface = bonus, not target.

T33-36 downgraded to *if-bonus*. Re-evaluate if explicit user requests come in.

---

## Recommended Execution Order

P1 V1.x evolution has all been closed as ✅/N/A, and the current surface is being reorganized into macOS app · CLI · MCP · Website. The Website serves for promo/download/read-only demo, while actual local vault work resides in the app/CLI/MCP. Currently *signal-driven* — focused on explicit product calls from users or user reports.

1. **Remaining P0 (C3 user-trigger)** — Run `pnpm benchmark --bypass` when user time permits
2. **T37** — Infrastructure (Playwright MCP CI) — review nightly QA value
3. **V1.2 vault-adaptation** — Direct editing of frontmatter literal properties (description / color / releasedAt) via builder inspector — close if PR is in progress
4. **User product call** — Re-evaluate non-developer surface (R12 dropped) / npm publish (cli · mcp), etc., triggered explicitly by users

## Reference Documents

- `docs/PRODUCT-DIRECTION.md` — mission v3 direction
- `docs/FEATURES.md` — all features currently available to users
- `docs/ONTOLOGY-ATLAS-SPEC.md` — current ontology model and conformance boundary
- `docs/CHANGELOG.md` — chronological user-visible changes
- `mcp/README.md` — current MCP tool surface and registration contract
- `docs/benchmark/` — AI agent quality measurement matrix


## ~~4 Pre-failed Contract Tests~~ — ✅ Resolved (2026-07-21, PR #457)

check-package-contracts 55/55 green. The natural-exit regex only fixed return types; naming contracts updated to the current rail-rollout surface; verify census transcripts regenerated with 105 nodes measured; the mcp/README add_relation why document broken by P6 restored to its original place. Also restored desktop verify's Sigma/Relief pre-failures in the same PR to v2 canvas contracts (#458, installed app proof green).

## Remaining Gates (Next Round)

- **P3c Hover Microcard** — Only after verifying P3b edge popovers (gate maintained).
- **Bootstrap Multiple createDoc Reload Merge** — Domain fileization (D) resulted in 1 reload per domain. If perceived issues arise, use batch write + single refresh.
