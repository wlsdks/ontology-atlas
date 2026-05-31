# SPEC — The Self-Drawing Diff (the one strength to push)

> Date: 2026-06-01 · Branch: `self-improve` · Status: **strength validated; push-moves proposed; two big bets are USER decisions (surface-first).**
>
> Derived by an adversarial workflow (`find-the-one-strength`, 2026-06-01): 5 diverse-lens
> generators → 11 candidates → 3 independent default-deny judges → synthesis. Grounded in
> `docs/FOUNDATIONS.md`. Not a single self-opinion — judge consensus + verified-shipped mechanic.

## The strength (one line)

> **Review the codebase's MEANING the way you review a PR.** The agent *authors* the ontology;
> every edit lands as a deterministic added/changed/removed delta on a live map; the human
> evolves the project by **reviewing that redrawn delta — not by authoring an ontology.**

## Why this is THE one (clears all three of the user's gates with a single act)

- **Agent power** — a *closed perception-action loop on its own memory.* `snapshotOntology()` takes a
  session baseline; after each `add_concept`/`add_relation`/`rename_concept`/`merge_concepts` the agent
  calls `computeOntologyChangeset()` (pure, deterministic — `src/shared/lib/ontology-tree/ontology-changeset.ts`)
  to read back *exactly* what its own write changed, and every write tool already returns
  `postWriteMaintenance` so it sees whether it introduced drift (orphan / dangling edge / unknown kind)
  **in the same turn.** The opposite of fire-and-forget into an opaque store (the MemGPT/Zep/Mem0 mode).
- **Human evolves by looking** — open `/topology` or `/ontology` after a task: new slugs amber-pulse
  ~5s, an "Added/Edited: \<slug\>" toast fires on the adaptive 1.5–5s poll, the changeset names exactly
  which nodes/edges moved (`removedNodeKinds` even says a *domain* vs an *element* was deleted). One
  glance → nod, or correct in the builder. **Looking at the moving map IS steering.**
- **Accessibility (the historical failure, dissolved)** — ontology was hard because the *human* had to
  author classes/slots/constraints (Noy & McGuinness: expert work). Here the **agent pays the authoring
  cost; the human pays only a review cost**, rendered as a visual git-diff-shaped delta (Tufte: show only
  what changed). A PM/junior who can't write OWL *can* read "two new boxes, one arrow — is that right?"
  And because the source of truth is markdown frontmatter, the delta is also literally a normal `git diff`.

> **Operationalizes Studer/Fensel:** the instant a human approves or corrects a redrawn changeset *is*
> "a **shared** conceptualization" made real — the moment of agreement between human and agent over one artifact.

## Defensibility (maps onto FOUNDATIONS prior-art gaps)

The defensible thing is the **tuple**: *agent-authored + markdown-IS-source-of-truth + pure deterministic
changeset + live pulse review surface.* It exists only here:
- **Zep/Graphiti** — temporal, but opaque graph DB, agent-only; no human review surface, no visual delta.
- **GraphRAG** — generates its graph as a throwaway index; no human-in-the-loop diff (a re-run overwrites).
- **Glean/CodeQL/tree-sitter** — regenerate machine-true *structural* facts wholesale; no "the agent
  changed its mind about what this MEANS — approve?" moment (FOUNDATIONS §3: they lack the why/owns/impacts layer).
- **Protégé** — no agent author, no live delta. **Notion** — no typed graph, no deterministic changeset.

## How it realizes the vibe-coding vision (user, 2026-06-01)

A non-developer vibe-coding with Claude Code/Codex describes a system + a business workflow → the agent
ontologizes it → **the map names its own gaps** and redraws as a reviewable diff → the human steers by
*reviewing meaning*, not writing code or OWL → the agent re-grounds on the same artifact and builds faster.
The Self-Drawing Diff is the **engine** that makes "non-developers use ontology" possible at all — because
it removes authoring, the thing that made ontology inaccessible.

## Push-moves (sequenced; ⚑ = local-first, autonomously buildable · ★ = USER decision / surface-first)

1. ⚑ **Land the review VERB.** Today: pulse + toast + drag-edit only. Add an explicit per-node
   **Accept / Correct / Reject** control on the changeset overlay so reviewing a meaning-diff is a
   first-class gesture (like a GitHub PR review). Converts a passive "pretty pulse" into the steering
   wheel. Highest-leverage retention hook — *every agent task ends in a review the human must touch.*
   Reuses `ontology-changeset.ts` + existing `rename_concept`/`merge_concepts`/`patch_concept` write
   guards (`expectedMtime`). **← recommended first build.**
2. ⚑ **Graft the runner-up: blast-radius on the diff.** `buildTopologyOntologyDrawerModel` already
   computes transitive `reach.dependents` off `buildOntologyReachability`. Show, next to each
   added/changed node, "touches N transitive dependents across M domains" — and the agent's brief carries
   the *identical* number (runner-up candidate 10's "can't drift" guarantee, absorbed). Review becomes
   *consequential*, not cosmetic.
3. ⚑ **Cross-session diff (git-HEAD).** An MCP/CLI read tool that diffs the vault against git `HEAD` /
   a prior commit (the in-app changeset explicitly punts this per `ontology-changeset.ts` header). The
   agent opens a session reading "here's everything that changed in the shared model since you last
   looked." Durable cross-session re-grounding. **This is also the seed of cross-system interop (#★b).**
4. ⚑ **Propose-changeset (draft) mode.** Agent writes stage as a *draft* delta the human approves before
   it commits to markdown (lightweight meaning-PR; reuse the existing dry-run pattern). Closes the loop's
   missing back half: agent proposes → human reviews → merge.
5. ⚑ **"Since you were away" digest.** On SessionStart / topology open, the accumulated changeset (counts
   + top touched nodes + any `postWriteMaintenance` drift) as one glanceable card. The recurring re-entry
   hook that turns a one-time wow into a *daily review habit.*

### The honest risk (a hard design constraint on ALL push-moves)

**Alarm fatigue.** If the human ignores the pulse — or a high-volume agent produces changesets faster than
anyone reviews — the surface trains the user to *stop* reviewing, and an unreviewed agent-authored graph
silently accumulates confidently-wrong meaning: *the exact drift this was meant to prevent.* **Mitigation
(non-negotiable):** ruthless prioritization — surface only **meaning-threshold-crossing** changes loudly
(new cross-domain edge · high-blast-radius node · removed domain) and let trivial deltas land silently.
Every push-move must respect this or it harms the thesis.

## ★ Big bets that are USER decisions (do NOT auto-build — surface-first per charter §5)

These came from the user's broader vision and **reverse current charter/architecture commitments**:

- **★a Non-developer as a primary audience** — reverses R11 ("비개발자 = bonus, not target"). The
  Self-Drawing Diff *enables* this (review-not-author), but making non-devs the primary surface reshapes
  onboarding/language/IA. **User must confirm the pivot.**
- **★b Cross-system connection ("connect Atlas to other systems")** — reverses R10 (backend permanently
  removed; local-first). Cross-system reading/contribution to the same ontology needs an interop
  layer/protocol/API. **Recommended sequencing: LATER.** Harden the local-first review loop (#1–#5)
  first; #3's git-HEAD diff is the portable seed. When pursued, design as a *protocol over the
  git-native artifact* (keep markdown as source of truth) rather than a hosted backend, if possible.
- **★c Business-workflow ontology (not just code)** — extends node kinds beyond
  project/domain/capability/element to business/workflow concepts. A model extension; revisit after #1.

## Recommendation

Push-moves #1–#5 are **local-first, additive, retention-core, and reuse shipped code** — buildable now
through the v2 gate (TDD + adversarial critic), one per firing, **#1 first** (the review verb). The big
bets ★a/★b/★c wait for an explicit user decision; ★b (cross-system) should be *later* regardless.
