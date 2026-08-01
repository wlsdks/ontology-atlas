# Field-trial baseline

Measured runs, newest first. **Append, never rewrite** — the previous row is
what the next run is compared against.

The repository under test is deliberately not named here (`.claude/rules/forbidden.md`
— no third-party brands in this repo's files). Describe it by its shape instead,
which is all a comparison needs.

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
