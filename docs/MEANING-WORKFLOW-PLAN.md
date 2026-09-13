# Meaning workflow implementation plan — V1 to V4

This is the current detailed execution specification for the
[Atlas product thesis](PRODUCT-DIRECTION.md#the-atlas-product-thesis).
[BACKLOG.md](BACKLOG.md#current-priority--useful-meaning-across-real-tasks-2026-09-13)
is the single status ledger. This plan defines scope, dependencies, artifacts,
and acceptance; it does not duplicate live status or mark hypotheses as shipped.

## Outcome and working agreement

An owner can understand the relevant business rules and boundaries, distinguish
verified facts from unknowns, and correct or defer an agent's proposed meaning.
An agent can reuse accepted context in a later task. Confidence must remain
proportionate to evidence; convenience reduces the cost of that outcome.

Astra owns planning, evidence interpretation, code review, and acceptance of
verification results. Sol at low reasoning effort implements each bounded code
slice from an Astra-authored brief. The human remains the meaning acceptor.
A model or automated reviewer cannot fabricate that decision. Use the existing
solo/two-seat PO router, not a standing expanded council.

Work one registered slice at a time. Each implementation brief names file
ownership, exact checkout and Node runtime, read-only boundaries, scratch path,
port or no-server policy, baseline, positive and negative cases, and primary
sources. No shared stash, broad staging, or unrelated worktree cleanup. Draft
PRs land through `pnpm pr:land` after the required checks and Astra review.

The program does not promise support for every enterprise language, complete
runtime impact, automatic meaning acceptance, or a backend-only product.
Transactional backend code is the first evaluation target; frontend-owned
rules, database procedures, and external systems remain relevant when they own
behavior. No production data, private repository, or remote system is accessed
without the user's authorization. Preserve source licenses and notices.

## Completion evidence common to every slice

- State the user task and expected ability before implementation. Record what
  becomes possible, rather than only a new field, screen, or passing command.
- Keep observed code facts, proposed meaning, and accepted meaning distinct.
  Track source revision, evidence scope and omissions. No file path or graph
  health result proves semantic correctness.
- Record before/after and a deliberately failing case where the claim could
  become misleading. Do not add prose-pinning tests or weaken a gate to pass.
- Run every recommendation from `checks:changed`; UI proof follows
  `design:route`, and changed gates follow `gate-probe`. Changes to construction
  rules or content-affecting MCP reads/writes use the ontology field-trial
  protocol. Pure evaluation reporting is not a completed construction trial.
- Before each comparative run or user study, freeze its critical questions/errors,
  comparison, intended generalization, and decision rule for supported benefit,
  insufficient evidence, or failed claim in the existing run manifest. A completed
  experiment can have an unfavorable result; completion does not prove recovery.
- Archive primary results, rejected drafts, corrections, source-hidden answers,
  and source-aware audits. External repository artifacts stay outside Atlas;
  in-repo regression fixtures use original, generalized examples with clear
  licensing. Do not replace the first run with a corrected score.
- A slice is complete only for its stated contract. Keep unknowns and later
  dependencies visible. V1–V4 do not become complete because their enabling
  components or this plan exist.

## V1 — Recover defensible meaning from unfamiliar work code

### V1.0 — Make evaluation scope impossible to confuse with construction quality

**User situation:** a contributor sees candidate precision/recall and oracle
PASS and may mistake them for useful ontology construction.
**Inputs:** the current meaning corpus runner and candidate projection, which
omit definitions/competency answers and relax their thresholds.
**Deliverable:** an explicit typed measurement-scope result and corresponding
readable report distinguishing candidate discovery, golden-oracle consistency,
and unmeasured independent construction quality. Preserve existing diagnostic
counts and discovery pass/fail behavior; document the distinction at its owner.
**Acceptance:** a passing fixed corpus can still explicitly report construction
as not measured. Consumers can identify which dimensions were deliberately not
evaluated without interpreting a percentage or reading the runner source.
**Negative cases:** all discovery/oracle results green with zero projected
competency answers; one failed fixture hidden by good aggregate counts; empty
corpus. None may imply qualified construction or silently disappear.
**Dependencies/owners:** no later slice; `scripts/evaluate-meaning-corpus.mjs`,
its tests and `docs/ONTOLOGY-QUALITY.md`. This is the first implementation slice,
not an improvement claim about the analyzer's business interpretation.

### V1.1 — Register a source-first backend task and fixed answer contract

**User situation:** `common`, `impl`, `util`, stale docs, and indirect calls hide
business responsibilities that a task requires.
**Inputs:** a newly selected authorized/permissive repository, exact revision,
allowed source files, data/schema/ERD availability, language support, and a
human-reviewed question set. Choose a real policy/state/effect workflow.
**Deliverable:** a frozen task/evidence manifest, responsibility and predicate
questions, source-aware reference with explicit inference, and comparable
conditions with documents present/hidden. Name obfuscation is only a secondary
behavior-preserving control, not a substitute for real legacy complexity.
**Acceptance:** questions test actors, objects, rules, states, effects, rejection,
conditional dependencies and unknowns without revealing the desired domain names
to the builder. The source-aware reference is independently checked, not a
model-authored oracle treated as truth. Record model, Node, source and Atlas SHA.
**Negative cases:** stale document contradicts a current branch; absent backend
logic resides in a stored procedure/external system; unsupported language; a
fixture whose names reveal the answer. These become scoped limits or invalid
setup, not a successful semantic baseline.
**Dependencies/owners:** V1.0; field-trial/meaning qualification protocols.
Primary artifacts live in an isolated run directory with original license and
hashes, not in the dogfood vault or identifiers.

Retain the six owner-approved competency questions from the 13 September trial
(the following are English translations; the original approval and exact Korean
wording remain in that trial's `control/question-approval.json`):

1. Whose problem does this system solve, and what is that problem?
2. What are its core responsibility areas, and where are their boundaries?
3. What are a representative capability's inputs, outcomes, and preconditions?
4. Where should a change to that capability start in the implementation, and
   what are its main external dependencies?
5. If a core processing or validation rule changes, which capabilities and
   implementation parts are affected, and where does our knowledge stop?
6. What is explicitly out of scope, and what merely lacks evidence?

The semantic owner is the conversation user. Bind task-specific probes to these
questions before seeing results; record any question revision separately. The
prior approval covers the questions, not a new repository's proposed meaning,
gaps, or write plan. Keep `answered`, `partial`, and unknown/visible-gap outcomes
and evaluate the complete answer, not just a selected claim ledger.

### V1.2 — Supply bounded implementation evidence needed by that task

**User situation:** the agent receives entrypoint/import names but cannot read
the condition or effect that distinguishes competing business interpretations.
**Inputs:** V1.1's missing reads, actual available source/language tools, and
existing repository-root/source-currentness protections.
**Deliverable:** the smallest read path that exposes exact relevant source
ranges/symbols, supported caller/callee or data relationships, source identity,
coverage, and next read coordinates. Decide the existing-tool versus new-tool
seam from a measured missing read before changing a public MCP contract.
**Acceptance:** the agent can inspect the selected predicate, state write,
transaction/external effect, and a counterexample without a whole-repo dump.
Returned text is data; currentness and truncation are explicit. A disconnected
or unsupported edge remains unknown. File scope and byte/range budgets are
measured independently of semantic quality.
**Negative cases:** escaping/symlinked paths, forbidden source scope, source
changing during a read, oversized/truncated source, dynamic dispatch, and
instructions embedded in code/docs. No silent widening, fake completeness or
ontology write is permitted.
**Dependencies/owners:** V1.1; source analysis/read seams and MCP/CLI contract
owners identified in that slice. Rooted-reader and client compatibility must
be included if a new read operation is introduced.

### V1.3 — Preserve document/configuration context without making it the ontology

**User situation:** a tutorial or static package contract contains useful facts,
but a selected excerpt loses scope or merges current and planned behavior.
**Inputs:** independently witnessed gaps such as internal RST tutorials,
`setup.cfg` metadata/options, source contracts and conflicting README sections.
**Deliverable:** focused evidence discovery/read support and item-level source
context for current/planned/negated/conflicting statements. Read static manifests
without executing project setup code. Distinguish build/runtime declarations
from indispensability and actual deployment.
**Acceptance:** each returned claim keeps its heading/range/currentness and
nearby counterevidence. The caller can reach the missing internal text within
scope. A plan statement does not taint unrelated current evidence or become
current behavior. Document expansion alone does not count as source-first
business understanding.
**Negative cases:** mixed supported/planned list; stale roadmap with implemented
branch; dynamic metadata; recursive include; out-of-root document link; private
or differently licensed asset. Preserve partial evidence rather than invent it.
**Dependencies/owners:** V1.1 and scoped V1.2 decisions;
`mcp/src/analyze/semantic-evidence.mjs`, `package-contracts.mjs`, discovery/guards.
Split parser and public-contract changes into separately reviewable increments.

### V1.4 — Build and falsify business-meaning hypotheses

**User situation:** knowing files and tables still does not identify Refund,
Settlement, Eligibility, or their responsibility boundaries.
**Inputs:** current behavior/data/contract evidence from the selected workflow,
alternative interpretations, and source-aware negative examples.
**Deliverable:** a source-first investigation prompt/workflow tracing trigger →
predicate → state/effect → failure/retry → verification; intensional capability
and domain proposals with conditions, units, exclusions, citations and unknowns.
Preserve useful unassigned evidence without inventing a domain to unlock a schema.
**Acceptance:** nearby responsibilities are distinguishable by actual behavior
and counter-boundary. A table, name or import cannot alone establish a domain,
causality, or historical intent. Code's implemented policy and the owner's
intended policy remain distinguishable. The exact reviewed proposal is available
before writes under the unchanged human acceptance boundary.
**Negative cases:** same name/different context; authorization versus capture;
conditional versus universal dependency; UI affordance versus server rule;
original intent absent from code; plausible but unsupported exclusion.
**Dependencies/owners:** V1.2/V1.3 as needed for the chosen task; construction
rules, bootstrap guidance, proposal validation and evidence representation.
Astra owns hypothesis/contract design; Sol implements agreed source changes.

### V1.5 — Prove candidate and persisted meaning independently

**User situation:** a valid plan or successful finalizer may still leave a
successor unable to explain the system.
**Inputs:** exact proposal, fixed human-approved questions, current sources,
separate builder/evaluator/auditor contexts, and approved gaps.
**Deliverable:** candidate-only evaluation, exact acceptance/release and writer
receipts, full-body byte readback, source-hidden persisted handoff, full-answer
source audit, and a comparison to the frozen baseline. Use four matched conditions to
isolate cause: current prompt/current evidence, new prompt/current evidence,
current prompt/expanded source evidence, and new prompt/expanded source evidence.
Keep model, task, source revision, budgets and independent-run setup fixed.
Archive every applicable condition rather than selecting the best-looking run.
If access has no measured gap, record it as unchanged and omit duplicate arms;
do not introduce an evidence tool just to populate an experimental condition.
**Acceptance:** known responsibilities/rules/boundaries and bounded change
navigation survive with their qualifiers. Score missing critical meanings and
unsupported assertions separately; node totals or correct refusals alone do not
prove sufficient understanding. Source-hidden access is tested, not declared
by the builder. A holdout repository tests transfer after the known case.
**Negative cases:** claim/ref/digest mutation, same actor, leaked source, stale
source, unsupported acceptance, omitted material assertion, and missing scope
qualifier. Preserve first-pass failures and all setup cost.
**Dependencies/owners:** V1.4; existing field-trial and qualification helpers.
Human plan acceptance remains required at the exact write boundary.

## V2 — Make reviewed meaning useful before a real code change

### V2.1 — Resolve task scope without lexical false certainty

**Inputs:** current accepted vault, task/non-goals, aliases/language, matching
and conflicting definitions, several plausible capabilities.
**Deliverable:** supported task selection and bounded alternatives/abstention;
update the existing compact brief rather than creating a duplicate context API.
**Acceptance:** an unfamiliar agent can identify the relevant responsibility and
why it was selected. Ambiguous or cross-capability tasks are explicit; child
path/title matches do not override a conflicting parent boundary.
**Negative cases:** same name/different context, excluded behavior mentioned in
prose, Korean/English expressions, no accepted match, multi-domain task.
**Dependencies/owners:** V1.1 fixed tasks; a sufficiently reviewed starting vault
may isolate this reuse test from V1 construction. `agent-brief-compact.mjs` and
its actual task navigation/meaning owners.

### V2.2 — Preserve the facts needed for action in the compact brief

**Inputs:** selected meaning, source/graph revision, conditional rules,
implementation roles, tests and known/unknown dependency evidence.
**Deliverable:** concise task context with exact full-body/source follow-ups;
conditions, exceptions, source currentness and verification scope survive size
limits. Preserve request-local task behavior unless separately authorized.
**Acceptance:** an agent can state what to inspect/change, which condition not to
break, which check can verify it, and what remains unproven. Full detail is
reachable; an empty relation set is not independence or a safe blast radius.
**Negative cases:** budget truncates a qualifier, coordinates drift mid-read,
source exists but meaning is stale, static dependency promoted to runtime impact.
**Dependencies/owners:** V2.1; compact brief, task-navigation and source receipts.

### V2.3 — Enter the real agent workflow with explicit host boundaries

**Inputs:** one declared supported host and its MCP capabilities/permissions,
user-enabled integration, normal and unrelated tasks, unavailable/stale vault.
**Deliverable:** reliable task-context invocation and return-to-source behavior,
with a precise optional link to relevant human review. No global mandatory hook
or new telemetry by default.
**Acceptance:** meaningful tasks use the appropriate brief with no repeated
manual context paste. Small unrelated work is not charged unnecessary calls.
Unavailable context is visible, never silently trusted or globally blocking
without a repository policy. Test actual model-to-tool delivery, not config
file existence or server instructions alone.
**Negative cases:** wrong vault, host ignores instructions, disconnected server,
repeated same-task calls, stale context, unsupported inline visualization.
**Dependencies/owners:** V2.2; current connector/runtime integration. Establish
the task identity from V2.1/V2.2 before optional UI links. Human-review links
wait for V3.1 and do not block the initial MCP-only entry proof; the design
router owns their rendered proof.

### V2.4 — Compare real coding outcomes with equivalent source access

**Inputs:** fixed work task, same model/source tools/budgets, Atlas-on/off
conditions, current tests and independent source-aware review.
**Deliverable:** code and test outcomes, important condition/boundary fidelity,
unsupported claims, context use and owner effort, followed by costs.
**Acceptance:** a claimed benefit changes a supported decision or result, not
only the vocabulary used or number of MCP calls. A manually prepared vault is
reported with its acquisition cost, never counted as automatic construction.
**Negative cases:** Atlas-only words in the control's answer key, hidden source
answers in the off arm, green tests with wrong business policy, unreviewed
concepts presented as approved context.
**Dependencies/owners:** V2.3 for the measured host; V1.5 for construction claims.

## V3 — Let a person understand and judge this task's change

The following six items are separate implementation/verification commitments.
They are not satisfied by a generic dashboard or a single graph screenshot.

### V3.1 — Start from the current task and decision

**User situation:** an agent changed many files; the owner cannot identify the
business change or the one decision needing attention.
**Required data:** task identity and requested outcome/non-goals; exact starting
source/meaning revision; observed task-owned diff; proposed meaning; comparison
coverage. Concurrent unrelated changes must remain separate.
**Deliverable:** a task-bound review state and entry that names the decision,
change and relevant evidence before showing the larger map. Reuse existing
change-review/analysis/workbench seams where their contracts fit.
**Acceptance:** a reviewer can identify the task, comparison basis, relevant
capability/rule and next decision without exploring the whole graph. A link from
an agent lands at that task/claim, not a generic home screen. Scope can expand
without losing selection or hiding uninspected boundaries.
**Negative cases:** stale/missing baseline, wrong task, unrelated concurrent
file, expected-scope change that violates policy, legitimate out-of-scope refactor.
No diff comparison silently becomes a safety verdict.
**Dependencies/owners:** task identity/context from V2.1/V2.2 and sufficient V1
evidence (or a disclosed reviewed fixture); do not wait for V2.3 UI links. Existing
`ontology-change-review`, analysis records and workbench integration. Design
routing decides attention/information-architecture proof before UI code.

### V3.2 — Summary → small comparison → detailed review

**User situation:** raw facts overwhelm the reviewer, but hiding them prevents
inspection of what the agent is asking them to accept.
**Required data:** the same typed claims/conditions/unknowns at each depth,
selected claim identity, total/omitted coverage, precise source/document links.
**Deliverable:** a short summary, an optional local before/after comparison or
mini graph, and a full evidence/change review. Plain text is the fallback for
hosts without inline UI; not every task must open the app or display a graph.
**Acceptance:** each depth preserves selection, qualifiers and the approval
scope; the reviewer can drill down and return without losing the task. Every
batch item is inspectable. Unseen rows are not represented by the first item.
**Negative cases:** summary drops a condition, hidden rows affect an entire-batch
approval, narrow map implies complete coverage, unsupported host renders blank,
keyboard/focus navigation loses the selected claim.
**Dependencies/owners:** V3.1 and V3.3 typed content. Existing review components
and map detail surfaces; full responsive/accessibility proof follows routing.

### V3.3 — Meaning Diff preserves conditions, exceptions and unknowns

**User situation:** the edge set looks unchanged although a business threshold,
state condition, unit or exception changed; a new edge loses its condition.
**Required data:** verified old meaning where available, observed code diff,
new proposed meaning, exact rule predicates/units/time/actor/scope, source refs,
counterevidence, unknowns and stable concept identity.
**Deliverable:** explicit added/removed/changed/unchanged or uncomparable meaning
items, separating code observation, interpretation and accepted meaning. Show
missing before as missing, not empty. Use a table/sentence when clearer than a
map; use stable local graph alignment for relational changes.
**Acceptance:** the reviewer sees authorization→capture, threshold/unit/exception
changes even if nodes/edges are identical. A high-value-only dependency remains
conditional in summary, graph, full body and agent output. Cosmetic wording and
path renames alone do not become business changes.
**Negative cases:** missing/stale before; amount without currency; negation or
exception lost; conditional edge made universal; source limit promoted to
product exclusion; incomplete scan reported as no meaning change.
**Dependencies/owners:** V1.4 meaning/evidence and V3.1 comparison basis;
`ontology-change-set`, `ontology-change-review` and source/analysis records.
No public schema extension until an existing representation's concrete loss is
shown and reviewed.

### V3.4 — Separate meaning acceptance, code verification, merge and deployment

**User situation:** an ambiguous Approve or green mark appears to certify more
than the person actually reviewed or the system actually checked.
**Required data:** exact proposal/version/digest, requested action, code state,
individual verification artifacts and scope, merge/deployment facts only when
known, and concurrency guards.
**Deliverable:** distinct visible statuses and scoped actions; meaning acceptance
applies to the exact meaning delta only. Existing host/write authority remains
explicit. Rejection/defer does not imply rollback of code already written.
**Acceptance:** the reviewer can tell what each action changes, which checks ran,
and which decisions remain. A stale/mutated proposal cannot reuse an earlier
acceptance. A planned-scope checkmark never means a business rule passed.
**Negative cases:** missing test result painted green, accepted meaning silently
merges code, stale digest, partial batch, changed source during review, rejection
reported as code rollback, nonexistent deployment outcome.
**Dependencies/owners:** V3.1/V3.3 plus current exact-write/mtime/digest contracts;
existing review and permission surfaces. This is an authority-sensitive slice
and must follow the derived PO review.

### V3.5 — Test rapid orientation, not five-second approval

**User situation:** the reviewer needs to know what to check first and what is
known before spending effort on detail.
**Required data:** priority grounded in the task and evidence, actual verification
scope, unknown/omitted coverage and available intervention actions.
**Deliverable:** clear first-view hierarchy and a measured orientation task:
identify the principal change, first review item, verified boundary and next
possible action. Five seconds is an experimental orientation target, not a
safety SLA or an approval timer.
**Acceptance:** measure answer correctness and wrong reassurance with time.
Do not say 'the only thing to check' without adequate scope evidence. Accessible
text/markers carry the same facts as color and graph; relevant mobile/tablet/
desktop and EN/KO states remain readable and reachable.
**Negative cases:** many low-value facts bury the risk, alarming color on a normal
change, unknown hidden below the fold, ambiguous legend, cropped qualifier,
keyboard-only user cannot reach evidence, quick approval despite a planted error.
**Dependencies/owners:** V3.2–V3.4; design/a11y/responsive instruments. Use real
reviewer measurements and condition waits, not arbitrary timing assertions.

### V3.6 — Prove reviewers detect, correct or defer a wrong proposal

**User situation:** a persuasive agent account creates confidence without an
independent basis for trusting the change.
**Required data:** fixed correct/incorrect/incomplete cases, same facts across
text/diff and visual conditions, independent task judgments, reviewer expertise
and the actual edit/reject/defer actions.
**Deliverable:** a decision-quality study and executable UI contracts covering
error discovery, evidence inspection, correction/defer, false warnings and
review burden. Preserve first responses, order/learning effects and source scope. Before collecting reviewer results,
freeze the critical cases, expected accept/correct/defer decisions, benefit
measure and false-warning tolerance. A critical unsupported approval cannot be
hidden by faster average decisions or preference. Report a mixed or inconclusive
result when the predeclared benefit is absent or a protected outcome regresses.
**Acceptance:** identify dangerous mistaken acceptance, missed critical condition,
correct deferral and successful correction separately. Higher satisfaction or
faster approval cannot offset worse decisions. FDE/PM/customer claims require
actual appropriate participants/tasks; an agent-only study cannot establish them.
**Negative cases:** polished false explanation, rule changed inside expected
files, justified unexpected file, conditional dependency omission, stale base,
no test run, unseen impact boundary, answer sentence omitted from claim ledger.
**Dependencies/owners:** V3.1–V3.5 and independent evaluation. Keep the producing
agent's summary separate from verification; no new generic trust score.

## V4 — Preserve accepted meaning and demonstrate repeated value

### V4.1 — Record the code/meaning transition without confusing authorities

**Inputs:** exact code diff, accepted meaning delta/gaps, source/graph versions,
review decision, and ordinary Git state.
**Deliverable:** a traceable transition a future reviewer can open from the task
or history. Coordinate code and accepted Markdown in Git where applicable;
vault-scoped Git tools do not gain arbitrary source/merge/deploy authority.
**Acceptance:** identify what changed, why that interpretation was accepted,
which evidence applied, and which questions remained. No semantic delta is
created for every task by default. Unrelated dirty work remains untouched.
**Negative cases:** meaning accepted against another revision, partially written
batch, rejected proposal recorded as accepted, noisy no-op updates, hidden owner
notes lost, duplicated semantic state outside the canonical vault.
**Dependencies/owners:** V3.3/V3.4; existing vault writes, receipts and Git history.

### V4.2 — Complete A → B → C with a fresh successor

**Inputs:** fixed A bug task, B policy/exception change, C later related task;
source controls and reviewed starting meaning with acquisition cost disclosed.
**Deliverable:** B's accepted update is returned and correctly applied by a fresh
C agent without earlier conversation or owner coaching. Include an unrelated
task and a meaning-preserving refactor as no-update controls.
**Acceptance:** verify the changed condition, its exceptions and unknowns survive
retrieval and code inspection. Measure owner re-explanation, repeated discovery,
missed boundaries, unnecessary proposals and final task outcomes. Distinguish
source-hidden understanding proof from source-aware coding verification.
**Negative cases:** C receives old context, B's qualification is lost, future C
answer leaked into A's initial vault, forced tool calls counted as usefulness,
all controls use the same generic context despite conflicting task scope.
**Dependencies/owners:** V2.4/V4.1; benchmark lifecycle and independent evaluators.

### V4.3 — Observe repeat adoption and maintenance cost in actual work

**Inputs:** willing users and permitted work scope, relevant subsequent tasks,
local/consented measurement and an explicit ability to disable the integration.
**Deliverable:** repeat-use and decision outcomes with the costs of setup,
meaning acquisition, review, correction and maintaining current evidence.
**Acceptance:** measure useful reuse in eligible later tasks and whether the
integration is retained voluntarily. Record no-match/unknown/fallback cases and
false warnings; do not hide them in the denominator. App opens, MCP counts,
preference or confidence alone are not retention/benefit evidence.
**Negative cases:** repeated use caused by compulsory hooks, private task text
collected without consent, unused meaning grows, review debt overwhelms benefit,
quiet UI hides unverified work.
**Dependencies/owners:** V4.2; owner-approved real-use protocol, no backend/account
or default telemetry introduced merely for measurement.

## Registration and evidence locations

All live item states and evidence references are maintained in BACKLOG only.
A plan item can reference an existing contract or workbench; it does not require
a new route or tool. Link each completed slice's commit/PR and concise proof,
plus exact external artifact locations when their source license/scope keeps
them outside this repository. Frozen history and earlier failed trials remain
available. The owner can reprioritize, but dependency and proof gaps must stay
visible when the order changes.

## Conversation coverage map

| Owner requirement | Execution or maintained authority |
|---|---|
| Know what ontology means; use public sources lawfully | Existing meta-model/Foundations; common evidence agreement; V1.1/V1.5 |
| Recover work meaning from code, not README/folder names alone | V1.1–V1.4 |
| Investigate predicates, data/ERD, state, effects and exceptions | V1.1/V1.2/V1.4 |
| Build strong system/tool instructions and test their actual effect | V1.2/V1.4; separate prompt/access conditions in V1.5 |
| Backend-oriented first test without excluding frontend-owned rules | Working agreement and V1.1 |
| Task-aware Agent Brief as the repeated entry | V2.1–V2.4 |
| Current task/decision before full-system exploration | V3.1 |
| Summary, small comparison, detailed review | V3.2 |
| Meaning Diff retains conditions, exceptions and unknowns | V3.3 |
| Meaning acceptance, code verification, merge, deployment stay distinct | V3.4 |
| Rapidly identify what to inspect and the checked scope | V3.5 |
| Find, correct or defer an incorrect agent proposal | V3.6 |
| Code and accepted meaning share reviewable history | V4.1 |
| Next independent task reuses accepted meaning | V4.2 |
| User value and voluntary repeated use, not feature/app-open counts | V4.3 and common outcome |
| Atlas-specialist PO, consistent current public/internal language, mirrored skills | Product Direction/PO operating system and existing mirrored skills; retain solo/two-seat routing |
| Sol low implementation; Astra planning and review | Working agreement and every implementation brief |

This map is a coverage index, not another status board. Keep gaps visible when
an item is blocked or only its enabling infrastructure has been implemented.
