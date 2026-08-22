/**
 * Specs deferred to the post-merge sweep — **the only list excluded from the PR
 * gate.**
 *
 * **The boundary** (2026-08-21, split approved by the owner). What stays in the PR is
 * **behavioural contracts and ratchets**: user journeys, the accessibility ratchet
 * (which caught two real defects that day), the contrast ratchet, degradation honesty.
 * What comes here is **measurement sweeps**: frame/motion/performance instruments that
 * collect wall-clock samples measured in seconds, and matrix measurements walking every
 * route × every width. That category ① spends tens of seconds per spec ② guards
 * prescriptions that rarely change ③ catches its defects identically on the first main
 * run after merge.
 *
 * **When it runs** — three triggers, not "later":
 *
 * ① On every push to main (= right after merge) — `e2e.yml`'s suite job runs
 *    everything with no project filter on push. ② On a PR touching e2e infrastructure
 *    (`tests/e2e/**`, `playwright.config.ts`) — you see your own spec go red in your own
 *    PR (classify's `e2e` output). ③ Locally, `pnpm exec playwright test` runs every
 *    project unfiltered.
 *
 * **Discipline**
 *
 * - **A new spec defaults to the PR gate.** A spec not on this list runs in smoke, so
 *   the direction of a mistake is "the PR got a little slower" rather than "the gate
 *   disappeared".
 * - Whether the listed files exist, and whether a spec the workflow invokes by filename
 *   has been mixed in here, is guarded by
 *   `tests/contract/e2e-suite-split.contract.test.ts` — renaming a spec breaks that
 *   contract first.
 */
export const POST_MERGE_SPECS = [
  // ── Frame, motion, and performance instruments — wall-clock sampling (seconds to 40s per spec) ──
  "camera-transition.spec.ts",
  "datasheet-hover-map-brush.spec.ts",
  "gateway-idle-sleep.spec.ts",
  "map-3d-grip.spec.ts",
  "map-expand-all.spec.ts",
  "map-hover-release.spec.ts",
  "map-trail.spec.ts",
  "nav-yield-map-frames.spec.ts",
  "offscreen-node-census.spec.ts",
  // ── Every route × every width matrix — the layout and style drift sweep ──
  "cursor-affordance.spec.ts",
  "focus-ring-contrast.spec.ts",
  "hover-contrast.spec.ts",
  "korean-word-break.spec.ts",
  "overflow-sweep.spec.ts",
  "responsive-overflow-audit.spec.ts",
  "screen-hierarchy.spec.ts",
  "scroll-end-gap.spec.ts",
  "surface-vocabulary-ratchet.spec.ts",
] as const;
