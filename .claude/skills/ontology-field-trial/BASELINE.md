# Field-trial baseline

Measured runs, newest first. **Append, never rewrite** — the previous row is
what the next run is compared against.

The repository under test is deliberately not named here (`.claude/rules/forbidden.md`
— no third-party brands in this repo's files). Describe it by its shape instead,
which is all a comparison needs.

---

## 2026-09-22 — two more unfamiliar repositories through the shipped replay, and what they taught the product

**Subjects**: an MIT Python HTTP client library (125 files) and an Apache-2.0
Go command-line framework (66 files), each through `scripts/acp-replay.sh`
with an Opus builder and `scripts/sealed-reader.sh` with a Sonnet reader on six
questions sealed before any vault existed.

### Construction

| measurement | Python library | Go framework |
|---|---:|---:|
| person turns | 2 | 2 |
| builder cost / wall | $6.43 / 499 s | $7.25 / 520 s |
| nodes | 24 (4 domains, 12 capabilities, 7 elements) | 22 (5 domains, 7 capabilities, 9 elements) |
| write-door findings | 0 | 0 |
| nodes stating an unknown | 24/24 | 22/22 |
| finalize receipt | written | written |

### Persisted-vault-only handoff

- Python: **6/6** answered with slug and path citations; every node's
  Uncertainty line states how much of the file was read ("first 60 of 406
  lines"). Five line counts exact, import claims true, class lists true.
  Invented: 0.
- Go: 3 full, 1 partial, 2 "the vault does not say" with the reason recorded.
  The two missed behaviours (help templates, misspelling suggestions) live at
  lines 781 and 863 of a 2,072-line file the builder read only at its head.
  `type Command struct` cited as line 53, actual 54. Invented: 0.

### What the runs exposed, and what changed because of them

1. Both vaults carried the three starter example nodes untouched and
   unmentioned. The replay had run `init` where the app's door creates an empty
   folder (the script now mirrors the door; `--starter` reproduces the other
   door), and the product gained `starter-example-node`: silent on a fresh `init`,
   one warning per starter kind once a real node of that kind exists (verified
   on an `init` vault plus one real domain), 0 on the dogfood vault.
2. Head-only reads. The bounded source reader gained `mode: 'outline'`, which
   lists a file's declarations with line numbers so the next lines read is
   exact; a 928-line synthetic Go file yields its method at line 921.
3. Recorded unknowns had no next step. `growth_plan` now reads Uncertainty
   sections into `nextReads`: on the dogfood vault, 0 write candidates against
   96 reads.
4. Declared dependencies with no witness in the citing file: `dependency-
   unwitnessed`, 15 on the dogfood vault; a product-driven repair turn
   re-pointed two paths, removed one relation with a stated reason and gave the
   rest a witness in `why`; the check then had to learn to read the file a
   `why` names, editor-style paths included, and the last two were re-typed as a
   relation and re-targeted through `replace_relation`. Dogfood: 0.

### The rerun (after the mechanisms shipped)

Go framework again, fresh shallow clone, same six sealed questions, same
reader. Build: 2 turns, $4.55, 340 s, 16 nodes (5 domains, 11 capabilities);
the builder's own words: "I read its outline and the `Command` struct, not
every method body." Two capabilities the first run lacked now exist:
did-you-mean suggestions and help-and-usage rendering. Reader: q4 answered
with `SuggestionsFor` at command.go:863 and `findSuggestions` at :781 (both
exact in the clone) and the edit-distance helper at cobra.go:192; q5 answered
with `Help`, `UsageTemplate`, `HelpTemplate` in command.go (lines cited and
checked). 10 turns, $0.29. Pass condition, stated before the run, met.

### The third repository (2026-09-23): a Rust command-line benchmarking tool

The falsifier asked for a third unknown repository. An MIT Rust CLI (66
files, 37 of them Rust, module tree under `src/`), same replay, same reader,
six questions sealed before the clone. Build: 2 turns, $6.69, 443 s, 18 nodes (4 domains,
9 capabilities, 5 elements), finalize written with `impact` left partial on
purpose ("no runtime call graph was traced"). The replay's own summary line
called the build "stopped short" because the final answer never used the word
finalize; the receipt on disk says otherwise, so that heuristic is wrong and
the receipt is the record.

Reader (Sonnet, 11 turns, $0.28): q1, q2, q3, q5, q6 answered with slug and
path citations, every cited path present in the clone, invented 0. q4 (what
happens on a non-zero exit) answered "the vault does not say" and named the
two facts it could find (exit code is collected; a failure has a warning
wording). The truth sits at `src/cli.rs:227` (`--ignore-failure`),
`src/options.rs:421-433` (the failure action is chosen) and
`src/benchmark/mod.rs:67`; the execution node's own Uncertainty line says
lines 141-220 of `run` were read and the rest was not, so the miss is declared,
not hidden. It is still a miss of the kind the falsifier names: the outline
mode existed and the builder cited `src/options.rs` as an entry point without
outlining it. The replay saves only each turn's result record, so whether any
outline read happened cannot be counted from the artifacts; the next script
revision keeps the tool trace.

The vault validated clean under the witness rule that shipped in this round.
Under the tightened rule (an import, not a word) it carries 2 unwitnessed
edges out of 12: execution → timer (the timer is used from `executor.rs`, not
from the cited `mod.rs`) and export → terminal formatting (used from
`markup.rs`). Both `why`s are beliefs about the right module with the witness
one file away. The dogfood vault showed 7 such edges under the same rule; the
old rule had passed all 9 on the strength of a word or a folder name.

### What this row does not show

Same limits as the row below: one run per arm, one builder model, the
coordinating agent as grader, the permission card replaced by an allow-list.
The first two scratch vaults and reader transcripts were discarded when the
session was resumed; their numbers were recorded before the loss and cannot be
re-derived from those artifacts. The rerun's clone is a later revision than
the first run's, and only the Go arm was rerun.

---

## 2026-09-21 — the app's ACP first-run door, reproduced headless, before and after the construction card

**Subject**: an unfamiliar MIT Node.js command-line argument-parsing library
(216 files, one entry file, six implementation files, hand-written type
declarations). Not a cold CLI bootstrap: this row reproduces the desktop app's
"Build a first ontology for my code" door without the app — `claude -p` with
the vault MCP attached at `<project>/atlas`, the session's exact appended
handoff as `--append-system-prompt`, the exact first-run prompt as turn one,
then "go ahead" resumed as turn two. Builder: Opus. Reader: Sonnet with the
Atlas read tools only and six questions sealed before any vault existed, plus a
seventh asked afterwards: which claims does the vault itself mark as unchecked.

### Construction

| measurement | before (main) | after (final committed card) |
|---|---:|---:|
| person turns until nodes existed | **3** (turn 2 dead-ended at `canWrite:false`, $3.23, empty vault) | **2** |
| builder cost / wall | $10.06 / 312 s | $5.18 / 173 s |
| nodes written | 16 (1 project, 3 domains, 8 capabilities, 4 elements) | 20 (1 project, 4 domains, 9 capabilities, 6 elements) |
| validate / path drift | 0 problems, 12/12 files | 0 problems, all `path:` entries files, slugs under kind folders |
| finalize receipt | not written (builder believed it gated) | written; `impact` honestly `partial` (static imports only) |
| write-door findings on the result | project `Excludes` carried 3 evidence-limit bullets | 0 |
| nodes stating an unknown (`## Uncertainty`) | 16/16 | **20/20** (an intermediate card without the clause produced 0/12) |

Two intermediate runs on the branch drove the last two card clauses: one wrote
19 nodes flat at the vault root (nothing warned; now `slug-outside-kind-folder`),
one read the Atlas MCP source outside the vault to learn the competency layout
(now a guide topic and the finalize refusal), and one, after both fixes, dropped
every per-node unknown (now clause 3 requires `## Uncertainty`).

### Persisted-vault-only handoff

- Before: 5 of 6 answered with slug and path citations; q4 (where the
  unknown-option error is raised) honestly partial. 29 turns, 135 s, $0.42.
- After: 5 of 6 answered with citations and line ranges; q4 again "the vault
  does not say", and this time the vault says why — each error node's
  Uncertainty line records that the throwing call sites were not read. The
  seventh question returned a per-node list for all 20 nodes (which lines were
  read of 2,790, that no code was executed, that the source reader refused the
  README so headings were corroborated by name only). 15 turns, 71 s, $0.37.

### Accuracy

Every cited fact was grepped in the clone: before **14/14**, after **12/12**
including the recorded line numbers (`node:child_process` import at line 2, the
executable-handler fields at lines 43–44, the lazily created help option at
lines 79–87). Invented claims: 0 in either arm.

### What this row does not show

One repository, one builder model, one run per arm; the grader was the
coordinating agent, not an independent one; the app's permission card was
replaced by an allow-list, so "the person approves every write" was assumed.
Node counts vary between runs of the same arm (12, 19, 20) under "prefer few,
well-evidenced concepts"; that is builder variance, not a measured effect.
The bounded source reader refused the README, so the project's own statement
of purpose reached the builder only through the package manifest.

---

## 2026-08-31 — bounded Rust dependency coverage replay

**Subject**: the same unfamiliar dual MIT/Apache-2.0 optical-record Rust
library and pinned revision as the preceding construction row. This was a
frozen-candidate replay against the new bounded Rust import receipt, not a new
cold construction-speed baseline.

### Construction and runtime evidence

| measurement | result |
|---|---:|
| approved release | **5 concepts · 5 relations · 11 accepted gaps** |
| approval → successful finalizer | **351.086 s** |
| 5,000-file Rust scan median, 5 warm runs | **205.59 ms** |
| slowest observed warm run | **209.94 ms** |
| scan result | **5,000 files · 5,000 external import receipts** |

The analyzer revalidated the unchanged plan and source digests after owner
approval, and the release helper emitted exactly one five-row concept batch and
one five-row relation batch. The written vault validated with zero problems,
compiled with zero unresolved edges or issues, connected to the pinned source,
and finalized with the eleven accepted evidence gaps still visible. The
persisted graph resolved the project/domain/element containment path, the
capability/element path, and the direct entrypoint/resampling dependency path.

The scan benchmark used 5,001 physical `.rs` files with `maxFiles: 5000`; one
warmup was excluded. The five measured samples were **203.19, 205.05, 205.59,
205.98, and 209.94 ms**. This is a local deterministic fixture measurement,
not a cross-machine latency promise.

### Persisted-vault-only handoff

A fresh reader received a sidecar-free vault copy and an intentionally empty
repository root.

- Full answers: **1** (`q3`).
- Partial answers: **5** (`q1`, `q2`, `q4`, `q5`, `q6`).
- `q4` now identifies `src/lib.rs` and serde as important direct source use;
  runtime criticality and comparative importance remain unmeasured.
- `q5` now resolves the typed entrypoint `depends_on` resampling path; runtime,
  reverse, and transitive impact remain unmeasured.
- Unknown / unanswered whole questions: **0 / 0**.

### Accuracy and correction history

The source-aware auditor verified **38/38 sealed pre-write claims**, **83/83
citations**, **19/19 path occurrences**, and **4/4 unique paths**. The first
persisted reader then over-attributed one empty-root phase observation to the
node bodies: independent audit **21/22**. A second pass corrected that but still
classified two business-impact absences as node-authored: **23/25**. The
immutable third pass separated node-authored facts, phase observations, and
reader qualifications and passed **27/27 (100%)**, with **8/8 typed paths**, no
contradictions, no unsupported impact promotion, and no missing qualifier.

### What this run changes

The named q4/q5 coverage improved without promoting static syntax to runtime or
business impact. The final corrected handoff holds 100% claim and path accuracy,
but the first persisted read did not. Therefore this row advances bounded Rust
coverage and the audited correction protocol; it does **not** advance the clean
first-pass accuracy baseline. The council falsifier remains visible: Rust stays
read-only coverage, never inferred importance or impact.

---

## 2026-08-31 — optical-record interchange construction and persisted handoff

**Subject**: an unfamiliar dual MIT/Apache-2.0 Rust library for reading,
writing, and validating optical spectral records, pinned at one clean revision.
The repository and its name remained outside the Atlas checkout. Six questions
were frozen and approved before construction.

### Phase 1 — cost and construction truth

| measurement | result | preceding clean exact-plan baseline |
|---|---:|---:|
| first valid rooted MCP → first reviewable candidate | **201.494 s** | 257.384 s |
| first valid rooted MCP → successful finalizer | **4,286.244 s** | 2,594.799 s |
| 40-minute exact-plan trigger | **FAIL by 1,886.244 s** | FAIL by 194.799 s |
| released candidate | **4 concepts · 3 relations · 5 proposal gaps** | 9 concepts · 10 relations · 10 gaps |

The reviewable-candidate path improved by **55.890 seconds (21.7%)**, which is
the named measurement this row advances. The gross finalizer path regressed by
**1,691.445 seconds (65.2%)** and remains the authoritative user-visible cost.
The exact joined acceptance request carried the five proposal gaps plus six
measured CQ/functional gap ids, for 11 accepted ids in total. The released rows
wrote exactly and finalized with the accepted evidence gaps still visible.

The first source-hidden evaluator found that the builder had run missing,
foreign, and truncated-manifest probes but had not sealed those receipts for an
independent reader. It stopped before `hidden`, and the concurrent audit was
discarded. The unchanged 29-claim candidate was resealed with one portable,
digest-bound interoperability witness. Fresh lanes then overlapped for **136
seconds**, verified **29/29 claims** and **57/57 citations**, and all eight
join/acceptance mutation probes failed without output.

### Phase 2 — citation accuracy

- Meaningful-slice path occurrences: **31 / 31** exist.
- Unique cited source paths: **3 / 3** exist.
- Persisted validation: zero problems; index and health path drift: zero.
- Five untouched starter records were named and excluded from subject accuracy.

### Phase 3 — persisted-vault-only handoff

A fresh reader received a sidecar-free nine-node copy and an intentionally empty
repository root. It selected the four authored project nodes and fetched all
**4/4 full bodies** in one untruncated batch.

- Full answers: **2** (`q3`, `q6`).
- Partial answers: **4** (`q1`, `q2`, `q4`, `q5`).
- Unknown / unanswered questions: **0 / 0**.
- Explicit unanswered evidence items: **6**.
- Atomic qualifier checks: **10** after source-aware expansion; missing
  qualifiers **0**.

The initial attempted all-in-one reader packet was rejected because
`get_concepts` requires explicit slugs or UIDs. It wrote no transcript and is
recorded as a transport usability failure, not a semantic result.

### Phase 4 — hallucination check

- Persisted-reader atomic claims: **21 / 21 verified**.
- Failed claims: **0**.
- Unsupported scope or impact promotion: **0**.
- Path hallucinations: **0**.

### What this run changes

This row advances only the time-to-reviewable-candidate baseline while holding
100% citation and claim accuracy. It does not advance total construction time.
The highest-value remaining gap is explicit: the static packet did not measure
Rust `use` / `mod` / macro dependency evidence, so the project-critical external
dependency and direct/runtime/transitive impact questions stayed partial. The
transport REDs also show that successful private probes are not qualification
evidence until their receipts are sealed for the source-hidden evaluator.

---

## 2026-08-31 — prospective exact-navigation construction and persisted handoff

**Subject**: an unfamiliar MIT-licensed Go library for reading and writing a
binary geospatial file format, pinned at one clean 2019 revision. The repository
and its name remain outside the Atlas checkout. The six questions were frozen
before construction, and the coding task remained unselected until after the
reviewed vault and all coordinates were sealed.

### Phase 1 — cost and construction truth

| measurement | result | preceding clean exact-plan baseline |
|---|---:|---:|
| first valid MCP → first reviewable candidate | **529.329 s** | 257.384 s |
| first valid MCP → successful finalizer | **3,081.883 s** | 2,594.799 s |
| 40-minute exact-plan trigger | **FAIL by 681.883 s** | FAIL by 194.799 s |
| released candidate | **6 concepts · 5 relations · 4 proposal gaps** | 9 concepts · 10 relations · 10 gaps |

The gross clock is authoritative and is 487.084 seconds slower than the prior
baseline. This run was deliberately interleaved with implementation review, so
it is not a clean same-subject speed comparison. The first Atlas-only pass
returned `filesScanned:0` and no file endpoints; the builder stopped instead of
inventing navigation. A bounded source-aware construction exception then used
one conventional file inventory and one declaration lookup only after meaning
had selected two elements. The analyzer reverified ten prospective coordinates.

The builder released one reviewable candidate after two rejected drafts. One
helper schema invocation failed because its output directory already existed
and was not retried; this run is not clean helper cold-start evidence. The
independent lanes later discovered their schemas correctly. Their access windows
overlapped for **548 seconds**. Qualification verified **50/50 claims** and
**81/81 citations**, with 24 unique source fragments reused 161 times, before
the exact owner accepted ten joined gaps. Mismatch join and pre-join acceptance
both failed without output. The released six-concept/five-relation plan wrote
exactly, validated with zero problems, compiled with zero issues/unresolved
edges, connected to the pinned source, and finalized as `needs_evidence` with
the accepted scope/domain/impact gaps still visible. Starter nodes were not in
the released plan and therefore were not deleted.

### Phase 2 — citation and coordinate accuracy

- Unique cited source paths: **6 / 6** exist.
- Proposal path/evidence occurrences: **20 / 20** resolve.
- Prospective coordinates: **10 / 10** accurate, 9 unique.
- Wrong, stale, ambiguous, or task-inferred coordinates: **0**.

### Phase 3 — persisted-vault-only handoff

A fresh reader received a sidecar-free copy of the written vault and no source,
builder packet, hidden answers, or audit output. It selected the six project
nodes and fetched all **6/6 full bodies** in one untruncated call.

- Full answers: **1** (`q6`, exact recorded boundaries).
- Partial answers: **5** (`q1`–`q5`), including direct impact explicitly unknown.
- Unknown/unanswered questions: **0 / 0** at whole-question level.
- Unanswered evidence list: **9** explicit items.
- Atomic qualifier checks: **14**, missing qualifiers **0**.

### Phase 4 — hallucination check

- Persisted-reader atomic claims: **34 / 34 verified**.
- Failed claims: **0**.
- Source paths: **6 / 6**.
- Coordinates: **10 / 10**.
- Unsupported scope/impact promotion: **0**.

### Performance generalization boundary

The post-vault unseen coding A/B did not produce a product measurement. The host
had no Go toolchain, so neither lane could run the required tests; a personal
orchestration skill also captured the treatment before source work. Both are
recorded setup contamination, not converted into Atlas success or failure.
Therefore this row earns coordinate accuracy and persisted-handoff trust only;
cross-repository coding speed remains unearned.

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
