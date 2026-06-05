---
status: validated (planner team 2026-05-31 — 8 agents, 3/3 adversarial validators endorse)
created: 2026-05-31
owner: user (jinan) — vision; loop executes
supersedes: the "converged / mostly-NO-OP" steady-state (DECISION-JOURNAL 수렴 노트)
---

# Atlas Vision Roadmap — 4 pillars → validated backlog

> User directive (2026-05-31): stand up a planner team → plan/deliberate/validate → compare vs current
> features → at the right moment rebuild-or-update **inside the loop**. This is the deliverable.
> Grounded gap-analysis + adversarial validation done by `atlas-vision-planner-team` workflow (every
> claim verified against source). Full raw output archived in the run transcript.

## Vision (north star) — see [[memory: project_atlas-vision-4pillars]]

1. **AI-agent-native** — the ontology must genuinely *help development* for Claude Code/Codex, not be a passive store.
2. **Real-time interaction** — excellent, low-latency, bidirectional (local-first should make it near-instant).
3. **Human design surface (설계도)** — fluid add/draft(임시저장)/delete/experiment as a living blueprint canvas in meetings.
4. **Business expansion** — Atlas as a platform that keeps driving growth.

## Current state (verified, per pillar)

- **P1 agent-native — most mature, the moat.** 23-tool MCP + ~40 query_ontology ops, agent_brief/workspace_brief handoff, 3 ingress skills, SessionStart hook, code-bridges (`analyze_repo_structure`, `infer_imports` walks 569 files → 454 edges). BUT the engine "stops one set-diff short": `infer_imports` doesn't reconcile vs the 419 compiled vault edges; `audit-vault-paths` drift logic is a build-time script, not agent-callable; `/ontology-sync` is 100% agent-eyeball of `git diff`; `find_evidence` is a flat `includes()` sweep (no ranking).
- **P2 real-time — wired end-to-end.** Tauri OS file-watch = instant desktop push; web = 5s polling fallback (`AUTO_REFRESH_INTERVAL_MS=5000`, getFile-per-file fingerprint). Gaps: web feels laggy; open editor has no "changed underneath you" signal (conflict caught only at save via `expectedMtime`).
- **P3 human design surface — weakest vs vision.** Builder writes existing-node edits to disk *immediately* (`renameVaultDoc`/`editVaultArrayKey`/`writeVaultRelation`/`persistVaultPosition` → `vault.updateFrontmatter`); only new palette nodes are staged (ephemeral, lost on reload). **No undo/redo anywhere.** Present mode was deleted (495dd47f). No whole-canvas draft/staging.
- **P4 business — hard block.** Neither npm package is published (both 404), **zero git tags, empty GitHub Releases** → the `npx ontology-atlas` quick-start AND the "Download macOS app" CTA both dead-end. Launch playbook fully drafted but unfired.

## Track A — Autonomous spine (build now; pillars 1+2; read-only/local/charter-safe, isolated to mcp/ or client)

Ordered by leverage + dependency. The loop executes these via the v2.2 gate (objective test + adversarial critic).

1. **`infer_imports` edge reconciliation** (P1, high) — **TOP FIRST STEP.** Set-diff 454 code edges vs compiled `via==='depends_on'` edges → `inCodeMissing` / `inVaultNotInCode` / `inBoth`. *Must normalize both sides through the compiler's `aliasToSlug` (+`ambiguousAliases`) before diffing — make the normalizer + ambiguous-alias fixtures first-class in the failing test (validators insisted).*
2. **`detect_drift` MCP tool + CLI cmd** (P1, high) — extract `audit-vault-paths` existsSync-over-frontmatter logic into a **shared module** both the script and the new read-only tool import (mirror the schema-mirror discipline; preserve the `looksLikePath && !isOntologySlug` filter to avoid false positives).
3. **git-aware `/ontology-sync`** (P1, med) — pure fn mapping `git diff --name-status` → owning vault nodes via path index + reconcile output. *Depends on #1 + #2 (build those primitives first — don't write three parallel diffs).*
4. **`find_evidence` relevance ranking** (P1, med) — additive score field (token-overlap/title-weighted, top-N). No `matches[]` shape break (shared across 5 read tools).
5. **Per-document live-staleness banner** (P2, high) — open editor watches manifest mtime; dirty draft + advanced mtime → non-destructive reload/keep bar. Never auto-discard.
6. **Adaptive web polling** (P2, high) — burst ~1–1.5s after a detected change/local write, decay to 5s idle. Pure client, visible-only discipline kept.
7. **Incremental fingerprint** (P2, med) — cached path→mtime short-circuit; add an absolute-ms ceiling to the perf test. Keep mtime-only semantics.
8. **Curated starter templates** `init --template <…>` (P4, med) — bundled markdown, instant first-value, SEO surface. *Sequence after npm publish so `init` is runnable.*

## Track B — Surface-first decisions (the loop must NOT auto-build; need the user)

1. **npm publish CLI + MCP + first signed Release** — #1 growth unblock; everything downstream is dead until this. Hard-gated (forbidden.md + hook). Loop only runs `npm pack --dry-run` audit + recommends.
2. **Invest in the human meeting/design surface at all?** — current PRODUCT-DIRECTION marks PM/meeting "bonus, not target"; present mode was deleted as no-value. **The user's pillar-3 vision overrides this** → if confirmed, update PRODUCT-DIRECTION.md, then build staging overlay + undo/redo. *(undo/redo reframed as a developer-trust-in-write-path win, so it survives even if meeting-surface is declined.)*
3. **Builder write/commit model** — immediate-write vs staging/draft (default-on or toggled). Big-IA + reshapes trust.
4. **Landing positioning** — agent-memory-first hero + benchmark chip (per Atlas's own guardrail). Also revisits the web-demo-suppression decision (PR #274 + `check-hosted-download-surface.mjs` guard) that the pillar-3/4 vision implies reopening.
5. **Hosted-sync / collaboration / share-link** — collides with R10 no-backend/no-auth. Pillar-4 business expansion likely *wants* some of this → deliberate product-direction decision + freshly-designed auth/sync, never silent.

## Sequencing

Track A spine runs autonomously in the loop now (start with #1). Track B waits on the user's answers below; once answered, the confirmed items enter the loop's backlog. Pillar-3 trio (staging/undo/draft-persist) is **hard-gated** behind decision B2, not advisory.

## Decisions (2026-05-31, user — Track B resolved)

- **B2 design surface → Staging/draft 기본 (greenlit).** Builder gets a unified whole-canvas staging/draft layer: edits accumulate as pending diffs (added=indigo underline, removed=dashed — charter border-style), vault written only on "Apply N changes"; "Discard" throws away. This is the developer's *meeting design canvas* (NOT a pivot to PM/non-dev targeting — audience stays developer+agent). Big-IA → needs a focused design step first, then TDD. **B3 (commit model) resolved: staging-default.** PRODUCT-DIRECTION updated to mark the human design-surface a target *capability*.
- **B5 business → local-first 집중, hosted 나중에 결정.** Near-term growth stays strictly local-first (templates, shareable static-HTML export, npm/launch — all autonomous). NO backend/auth now. Hosted/collaboration/share-link parked until real demand → revisited as a deliberate product-direction decision then.
- **B1 launch → 승인용으로 준비.** `npm pack --dry-run` audited 2026-05-31: CLI `ontology-atlas@0.11.0` (219kB/91 files) + MCP `ontology-atlas-mcp@0.12.0` (209kB/19 files) both pack clean. Hygiene: both tarballs ship `*.test.mjs` (add to `files`/`.npmignore`). Remaining for the user: trigger `npm publish` (hard-gated) + cut first signed Release + signed DMG + demo gif (launch checklist prerequisites). Loop does NOT publish.
- **B4 positioning** — downstream of B1; revisit (agent-memory-first hero + web-demo discoverability, incl. the PR #274 / `check-hosted-download-surface.mjs` guard) once launch is live.

### Expanded loop backlog (post-decision)

Track A spine (1→8) **plus**: pillar-3 staging/draft layer (design step → build), undo/redo (developer-trust framing), starter templates (after publish), npm packaging hygiene (`files`/`.npmignore`). All autonomous except the actual `npm publish` + Release (user-only).
