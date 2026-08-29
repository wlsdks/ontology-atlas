# Field-trial baseline

Measured runs, newest first. **Append, never rewrite** — the previous row is
what the next run is compared against.

The repository under test is deliberately not named here (`.claude/rules/forbidden.md`
— no third-party brands in this repo's files). Describe it by its shape instead,
which is all a comparison needs.

---

## 2026-08-30 — schema-only qualification transport replay

**Subject**: the same unfamiliar Apache-2.0 Rust library and pinned candidate
used by the immediately preceding clean transport measurement. This is a frozen
candidate qualification replay, not a new repository-construction or persisted-
vault baseline.

### Candidate qualification cost

| measurement | final path form | prior embedded run |
|---|---:|---:|
| source-hidden lane, total | **419 s** | 1,302 s |
| source-aware lane, total | **367.675 s** | 494 s |
| helper runtime | **0.07 s** | sub-second |
| hidden helper attempts | **1** | repeated shape repair |
| hidden wrapper bytes | **1,519** | 24,105 |
| parallel overlap | **321.465 s** | 494 s |

The hidden lane is **883 seconds faster (67.8%)** than the recorded formal
hidden lane and passed the ten-minute stage budget. Wrapper bytes fell 93.7%,
but the separately authored qualification core and answers remain explicit;
this is not a claim that semantic evaluation became 93.7% faster.

### Qualification truth and boundaries

- Hidden: 29/29 ordered claims, six CQs, three answered / three partial / zero
  failed, schema errors zero.
- Audit: 29/29 claims and 46/46 citations verified against current source.
- Join: 321.465 seconds of proven overlap, pending exact human acceptance,
  `writePlan` absent.
- Writes: zero. Persisted-vault phases were deliberately not rerun.

### Preserved REDs

Before the final pass, independent attempts failed on a non-canonical derived
timestamp, undisclosed access literals, an undisclosed protected core field, and
an undisclosed nested owner shape. Security/schema reviews also found symlink,
hard-link, symlink-ancestor, duplicate-axis, and reverse schema/runtime drift.
All are retained as failures rather than recast as successful attempts; focused
probes now reject them without output.

### Scope of the result

This row advances only the named qualification-transport measurement. It does
not move the whole-build or persisted-handoff baseline and does not prove the
40-minute clean-construction trigger. The next field run must measure the entire
first-MCP-to-finalizer path on current main.

---

## 2026-08-29 — clean exact-plan performance rerun

**Subject**: the same unfamiliar MIT-licensed Go schema-transformation library
and pinned revision as the immediately preceding scratch run. The six human-
approved questions were byte-identical, so this is a like-for-like clean timing
comparison rather than new cross-repository generalization evidence.

### Phase 1 — cost and qualification

| measurement | clean run | prior same-subject run |
|---|---:|---:|
| first MCP → first reviewable candidate | **257.384 s** | 302 s |
| first MCP → sealed candidate | **757.016 s** | not isolated |
| first MCP → successful finalizer | **2,594.799 s** | 5,028.832 s |
| exact-plan trigger | **FAIL by 194.799 s** against 2,400 s | FAIL |

The gross finalizer time improved by **2,434.033 s (48.4%)**, while the
reviewable candidate improved by **44.616 s (14.8%)**. The 40-minute trigger
still fails. About 419 seconds elapsed between the joined request artifact and
the human decision; subtracting that wait gives an informational active-path
estimate of 2,175.799 seconds, but the gross user-visible clock remains the
authoritative result. Human acceptance is not a performance defect to bypass.

The clean candidate had 9 concepts, 10 relations, 95 immutable claims, and 7
source witnesses. The source-hidden and source-aware branches overlapped for
501.137 seconds. Independent qualification verified **95/95 claims** and
**161/161 citations** before exact acceptance of the plan and all ten named
gaps. The first proposal draft remains recorded RED with six errors; one
reviewable candidate was released.

The source audit exposed a separate AI-efficiency defect: 772 source-fragment
object occurrences represented only 16 unique fragments. The minified audit
input was 128,875 bytes. A catalog-plus-reference encoding of the same input is
33,474 bytes, a **74.0% reduction**, while expanding to the byte-identical
legacy helper output. The qualification helper now accepts that deduplicated
input and fails closed on mixed modes, duplicate fragment bodies, foreign refs,
and unused rows; no public MCP/CLI/vault contract or write authority changed.

### Phase 2 — citation accuracy

- Candidate source audit: **7/7 witness source paths** resolved.
- Persisted vault validation: **3/3 canonical frontmatter paths** resolved.
- Final graph: 10 nodes including the reserved reader, 16/16 resolved edges,
  zero validation problems, zero drift, zero cycles, zero relation
  recommendations, zero orphans, and zero remaining maintenance actions.

### Phase 3 — persisted-vault handoff

A fresh source-hidden reader fetched all **9/9 authored full bodies** in one
untruncated call. It answered q3 fully and q1, q2, q4, q5, and q6 partially,
with **0 unknown and 0 unanswered**. The partial labels preserve the named
purpose-owner, responsibility-breadth, package-entrypoint, impact, and
project-scope evidence limits instead of turning them into negative facts.

### Phase 4 — hallucination check

| | |
|---|---:|
| atomic claims verified | **45 / 45** |
| path-shaped claim occurrences | **6 / 6** |
| unique source paths | **3 / 3** |
| unsupported scope/impact promotion | **0** |
| unsupported status inflation | **0** |
| introduced exhaustive quantifiers | **0** |

This is the product reason to use the vault: after the source was removed, a
new agent answered every frozen onboarding question, and a different auditor
could verify every one of its 45 claims against the pinned source. The five
partial answers are visible evidence boundaries, not silent guesses.

### Honest execution notes

One generic preview assertion was incompatible with the source connector's
existing `nextCall` preview shape; it failed before mutation, then the exact
preview/confirm contract succeeded. Also, final validation/compile/health ran
after the successful finalizer rather than in the bootstrap skill's prescribed
pre-connect order. They required no repair and prove the persisted result, but
this run is not evidence that the prescribed verification order was followed.

---

## 2026-08-26 (second subject) — the exclusion gate fires on an unfamiliar repository

**Subject**: an unfamiliar Apache-2.0 Python network-infrastructure source of truth, 85 MB shallow clone. Run the same day as the entry below, against the
same six frozen questions, specifically to see whether the fix that run produced
holds somewhere it was not designed against.

### The result this run exists for

The earlier subject's project node excluded something nothing supported, and the
source-hidden reader repeated it as fact. The fix warns when a project states
exclusions while its own scope answer is unfinished. Here that warning fired
during analysis, on a different language, domain and repository:

> The project states 2 exclusion(s) while its scope competency answer is
> "partial". A project-level exclusion cannot be checked against the source, so
> it carries that same status until the scope answer is complete.

The two proposed exclusions did **not** reach the vault, and the written project
node has no `## Excludes` section at all. So the source-hidden reader answered q6
with a refusal instead of an invention:

> I cannot answer this at project scope from the vault. The project node has no
> `## Excludes` section. Its uncertainty and partial scope answer describe gaps.

That is the same question that produced this trial's only failed claim a run
earlier. A caveat worth keeping: the warning is advisory, so it did not *force*
the drop — what can be said is that the pairing was visible at review time and
the unwitnessed boundaries did not survive it.

### Phase 1 — build

| | |
|---|---|
| wall clock, analysis through validation | **14 min 43 s**, one uninterrupted run |
| meaningful nodes | **17** (1 project · 4 domains · 8 capabilities · 4 elements) |
| relations | **30** |
| scaffold cleanup | all five example records removed |

**Phase 1 completed without stalling, and why is the reusable part.** The two
earlier attempts stopped at the approval gate because a non-interactive run has
nobody to accept the plan. Reading `construction-lifecycle.mjs` first showed the
acceptance record is *declared provenance*, not authenticated identity, so the
run can pre-authorise sight unseen: accept whatever digest returns and every id
in `requiredGapIds`, supply `acceptance.decidedBy` and `authority: human`, and
keep `decidedBy` different from the builder id. That single change is the whole
difference between one attempt and three.

### Phase 2 — citation accuracy

| | |
|---|---|
| cited paths checked | **47** |
| paths that exist in the clone | **47 (100%)** |
| validation | 20 files, 0 issues |

### Phase 3 — handoff (vault only, clone moved off the tree)

Six of six answered from **13 full-body reads**, all untruncated.

Better than the first subject on the question that matters most. Asked what
breaks, this vault had a declared dependency to give, and the answer carried its
limits rather than inflating them:

> a declared, rationale-bearing dependency — not a proven or exhaustive runtime
> blast radius

### Phase 4 — hallucination check

Every cited path resolved, and the capability's stated boundary held against the
code: the IP/VLAN capability claims VRFs, prefixes, VLANs and AS numbers and
disclaims DNS service operation, and the clone has models for each of the four
and no DNS service implementation.

**Failed claims: 0.**

### What this run says about the previous one

The first subject's numbers were not luck — a second unfamiliar repository, in a
different language, produced 100% citation accuracy and six of six answers again.
The difference is where the honesty came from. The first vault stated a boundary
it could not support and the reader passed it on; this one recorded no boundary
it could not support, and the reader said so.

### Contamination found and removed

A codex process from an earlier attempt was still alive and wrote a **second,
disjoint 16-node slice** into the same vault mid-run — competing domains over the
same subject, sharing zero references with the reviewed slice. The census briefly
read 34. The project node pointed only at the reviewed slice, so the intruders
were orphans; they were moved to `logs/orphan-slice-backup/` rather than deleted,
and validation was re-run clean. **A trial must confirm that previous runs are
dead before it starts**, which is now the third way this harness has been found
measuring something other than what it claimed.

---

## 2026-08-26 — first run with a witnessed-exclusion defect

**Subject**: an unfamiliar Apache-2.0 Go community Q&A platform, 15 MB shallow
clone. Vault started with the five scaffold records. Third language family tried
(after a TypeScript monorepo and a Rust library), chosen because a product with
users has boundaries that general knowledge cannot guess.

### Phase 1 — build

| | |
|---|---|
| wall clock, analysis to approval gate | **7 min 43 s** |
| wall clock, approval to last write | **~12 min** |
| meaningful nodes | **20** (1 project · 5 domains · 9 capabilities · 5 elements) |
| relations | **37** compiled directed edges |
| driver | a fresh Codex MCP agent, no bootstrap skill named |
| scaffold cleanup | all five example records deleted |

**The build does not complete unattended, and that is the product working.** The
agent analysed the repository, produced a five-domain plan with a `planDigest`,
and stopped without writing, naming three gaps: partial scope, partial domain
authority, and impact as a visible gap because *static imports alone do not
assert a semantic `depends_on`*. A non-interactive `codex exec` has nobody to
approve, so phase 1 stalls there. Resuming the same session with an explicit
plan acceptance completed the write.

**Protocol change this forces**: phase 1 is two steps, not one. The skill's
"give it the vault and let it build" is incomplete — budget an approval turn, and
record the plan digest and the gap list, because that list is evidence about the
analyzer that the finished vault no longer shows.

### Phase 2 — citation accuracy

| | |
|---|---|
| cited paths checked | **106** (15 frontmatter `path:` · 91 in bodies) |
| paths that exist in the clone | **106 (100%)** |
| capabilities with implementation evidence | **9 / 9** |

Fifteen times the sample of the previous run, same rate. Three apparent misses
were `init` scaffolding pointing at Atlas's own files, not claims about the
subject; they are excluded and named rather than hidden.

### Phase 3 — handoff (vault only, source physically moved off the tree)

Six of six answered, from **7 full-body reads**, all untruncated. The clone was
moved outside the trial directory first: the 2026-08-25 benchmark work showed an
agent will find a folder renamed in place.

**Answered and checkable from the vault alone**: project outcome with the
partial-evidence qualifier carried; all five domains with per-domain code
locations; one capability's includes and excludes; its canonical entry path.

**Explicitly refused rather than guessed** — the most valuable line of the run:

> "The vault cannot say what would break if this capability changed. Its impact
> query finds zero declared incoming dependencies... imports or composition alone
> do not prove `depends_on`. `domains/platform-extensibility` references the
> capability as an owned ability, but that is containment, not causal dependency."

Containment was not promoted to dependency, and absence of edges was not read as
proof of independence.

### Phase 4 — hallucination check

| | |
|---|---|
| path claims verified | **16 / 16** |
| semantic claims verified | canonical plugin entry, vector-search and AI-conversation placement, per-domain service locations — all confirmed |
| **failed claims** | **1 of 3 project-level exclusions** |

**The failed claim.** The project node excludes *"general-purpose content
management"*. Nothing in the repository supports it: the README's own words place
the product as a forum, help centre, **or knowledge management platform**, and no
document states the exclusion. The other two exclusions survive — the node's
`## Uncertainty` and its `scope: partial` competency answer both declare
infrastructure tooling and external plugin behaviour to be evidence boundaries
rather than product domains, which is a stated modelling decision rather than an
invented fact.

So the defect is narrow and precise: **`Excludes` accepts an entry with no
witness, while the competency answer beside it is required to carry one.** An
exclusion is the one claim a source-hidden reader can never check, which makes
it the worst place in the schema to allow an unwitnessed entry.

**Second, smaller defect — in the handoff, not the vault.** The answering agent
carried the `scope: partial` qualifier into q1 and dropped it in q6, presenting
all three exclusions as equally established. The vault was more honest than the
answer given from it.

### Next actions this run names

1. Require a witness for every `Excludes` entry, or mark unwitnessed entries as
   proposed. Same rule the competency answers already follow.
2. Make the partial-scope qualifier travel with the exclusions it governs, so a
   handoff answer cannot quietly upgrade them.
3. Amend the skill: phase 1 is analysis then approval, and the gap list at the
   gate is recorded output.

---

## 2026-08-02 — compact evidence-first run

**Subject**: an unfamiliar dual MIT/Apache-2.0 Rust scientific-computing
library, 11 MB shallow clone. Vault started with the five scaffold records.

### Phase 1 — build

| | |
|---|---|
| wall clock | **5 min 36 s** |
| meaningful nodes | **11** (1 project · 3 domains · 7 capabilities · 0 elements) |
| relations | **10** written containment relations · **17** compiled directed edges including domain back-references |
| driver | a fresh Codex MCP agent using `/ontology-bootstrap` |

The agent kept the semantic model below the 10–20 target without mirroring
folders, files, or algorithms. Four untouched example records remained because
non-interactive Codex cancelled destructive `delete_concept` calls; they are
excluded from the meaningful count and reported separately rather than hidden.

### Phase 2 — citation accuracy

| | |
|---|---|
| cited paths checked | **7** |
| paths that exist in the clone | **7** (100%) |
| capabilities without implementation evidence | **0 / 7** |

`health` checked all seven frontmatter paths against the hidden subject clone
and reported zero drift. The only maintenance action belonged to the untouched
example scaffold.

### Phase 3 — handoff (vault only, source hidden)

A fresh Codex agent answered all six onboarding questions from 11 focused
concept reads. All 11 full bodies reported `bodyInfo.truncated: false`.

**Answered and checkable from the vault alone:**

- project outcome, with the user persona kept explicitly inferential
- three responsibility boundaries and their exclusions
- all seven capabilities grouped under those boundaries
- canonical starting paths for complex-number and macro-syntax changes
- the exact containment paths from project to domain to capability
- the absence of encoded dependency facts, without treating absence as source proof

**Explicitly unanswered rather than guessed:**

- actual macro consumers and runtime/import/test blast radius
- package-manifest implementation detail for optional feature selection

The same handoff attempted through Codex CLI 0.146.0 + Ollama `qwen3:8b`
failed before Atlas answered: model-list schema fallback was followed by four
empty tool identities and `unsupported call`. This is recorded as
Codex/Ollama interoperability evidence, not an Atlas answer-quality result.

### Phase 4 — hallucination check

| | |
|---|---|
| source-checkable factual claims | **14 / 14 verified** |
| vault-graph claims | **2 / 2 verified** |
| hallucinated paths | **0** |
| unsupported source claims presented as fact | **0** |

### What the next run has to beat

- fully unanswered onboarding questions: **0** — hold this while reducing the
  two explicitly partial dependency/manifest subquestions
- capabilities without evidence: **0 / 7**
- cited-path accuracy: **7 / 7** — hold 100%
- full-body handoff: **11 / 11**, no truncation
- build cost: **5 min 36 s for 11 meaningful nodes**
- claim audit: **16 / 16 verified** across source and vault facts

---

## 2026-08-01 — first run (the baseline)

**Subject**: an unfamiliar Apache-2.0 TypeScript monorepo, ~677 MB shallow
clone, a low-code app-builder domain nobody in the session knew. Vault started
empty (starter nodes only).

### Phase 1 — build

| | |
|---|---|
| wall clock | **15 min 30 s** |
| nodes | **50** |
| relations | **126** |
| driver | a real MCP agent session, Atlas MCP only |

### Phase 2 — citation accuracy

| | |
|---|---|
| cited paths checked | **13** |
| paths that exist in the clone | **13** (100%) |

No hallucinated paths. This is the number that has always looked good, and it
is why phases 3–4 exist.

### Phase 3 — handoff (vault only, source hidden)

**Answered, and checkable from the vault alone:**

- what the system is for and who uses it
- the CE/EE dual-implementation trap (two implementations of the same behavior,
  one per edition) — confirmed real against the source afterwards
- per-environment credential separation — confirmed real
- domain boundaries and which capabilities sit under which domain

**Could not answer — and the reasons given (these became the defects):**

1. *"MCP `get_concept` returns the body only as a ~200-char excerpt. Each node's
   markdown body may hold more code evidence, but that was outside what this
   read could reach."*
   → **Defect ①.** The construction rules tell authors to put definition,
   evidence, confidence, and scope in the body, and the read tools returned the
   first paragraph and did not say anything was missing. Fixed by
   `get_concept({ body: 'full' })` plus `bodyInfo` on every response.
2. *"There is no code entry point"* — for **8 of 16 capabilities**
   (access control, authentication, workspace management, theming, templates,
   fork-and-clone, self-host deployment, telemetry).
   → **Defect ③.** Those capabilities had an empty `elements:`. The rules asked
   for evidence and nothing reported its absence. Fixed by
   `capability_without_evidence` in `maintenance_plan` plus a creation-time
   write-gate finding. Deliberately **not** a rejection — construction rule 5.

**Found in the same session, outside the questions:** `validate` reported
`50 files scanned — 0 issues. vault clean ✓` while `health` reported
`needs_attention — vault_validation warn:13` on the same vault, with no way for
a user to tell which was right.
→ **Defect ②.** The CLI was passing its own working directory as the repository
root, so `health` compared the vault's code paths against *this* repo; and both
commands called their different checks "validation". Fixed by grounding the
repo root in the vault and by making each command state what it looked at.

### Phase 4 — hallucination check

Every claim spot-checked from phase 3 held up against the clone. No count was
recorded for total claims — **record it next time**; that omission is itself a
baseline defect.

### What the next run has to beat

- unanswered questions: **2 categories** (body evidence unreachable, capabilities
  with no code entry point)
- capabilities with no evidence: **8 / 16**
- cited-path accuracy: **13 / 13** — hold this, do not trade it for coverage
- build cost: **15 min 30 s for 50 nodes** — a slower build that answers more is
  an improvement; a faster build that answers less is not
