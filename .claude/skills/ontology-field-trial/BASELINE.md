# Field-trial baseline

Measured runs, newest first. **Append, never rewrite** — the previous row is
what the next run is compared against.

The repository under test is deliberately not named here (`.claude/rules/forbidden.md`
— no third-party brands in this repo's files). Describe it by its shape instead,
which is all a comparison needs.

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
