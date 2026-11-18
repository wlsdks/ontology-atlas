/**
 * The measurement specs, the `post-merge` Playwright project. CI runs them in
 * the full suite on every push to main, and before merge only when the impact
 * plan maps a change to them; `pnpm pr:land` names main's failing specs while
 * that run is red. A train otherwise runs its mapped specs and the merge smoke
 * set in `scripts/ci/merge-smoke-specs.mjs`, so the split below now chooses
 * what `--project=smoke` runs locally rather than what a train runs.
 *
 * The pull-request gate keeps user journeys and behaviour, security and
 * privacy boundaries, the accessibility and contrast ratchets, and one smoke
 * per screen. Measurement moves here: frame, motion and performance samples,
 * scale, pixel placement and geometry, and width, locale and text-size sweeps.
 * A new spec defaults to the gate; `e2e-suite-split.contract.test.ts` keeps
 * this list, the Playwright projects and the workflow in step.
 */
export const POST_MERGE_SPECS = [
  // Frame, motion and performance instruments sampling wall-clock time
  "map/camera/camera-transition.spec.ts",
  "map/neural/map-neural-grip.spec.ts",
  "map/flat-graph/map-flat-graph-scale.spec.ts",
  "map/flat-graph/map-flat-graph-star-motion.spec.ts",
  "map/frame-loop/map-frame-allocation.spec.ts",
  "map/hex-board/map-hex-frame-work.spec.ts",
  "map/frame-loop/map-hover-release.spec.ts",
  "map/frame-loop/map-sleep-frames.spec.ts",
  "map/chrome/map-trail.spec.ts",
  "app-shell/route-cycle-leak.spec.ts",
  "map/neural/map-neural-lit.spec.ts",
  "map/hex-board/map-hex-board.spec.ts",
  "app-shell/route-transition-input.spec.ts",
  // Every route at every width
  "design-audits/focus-ring-contrast.spec.ts",
  "design-audits/hover-contrast.spec.ts",
  "gray-area/text-scale.spec.ts",
  "design-audits/overflow-sweep.spec.ts",
  "design-audits/responsive-overflow-audit.spec.ts",
  // Motion curves and frame samples on shared building blocks
  "motion/motion-disclosure.spec.ts",
  "motion-sampler.spec.ts",
  "map/frame-loop/map-layout-morph.spec.ts",
  // Download page animation, frame budgets and layout sweeps
  "gateway/download-scroll-budget.spec.ts",
  "gateway/download-still.spec.ts",
  "gateway/gateway-reading-reach.spec.ts",
  // Performance, memory release and 2,000–10,000-concept folders
  "vault-session/vault-switch-release.spec.ts",
  "library/graph/library-renderer-disposal.spec.ts",
  "library/graph/library-graph-islands.spec.ts",
  "map/map-open-folder-stays-named.spec.ts",
  // Hex board placement and glide
  "map/hex-board/map-hex-relief.spec.ts",
  // Map free-area and label placement
  "map/labels/map-label-collision.spec.ts",
  // Width, locale and text-size sweeps
  "typography/cjk-locale-sweep.spec.ts",
  "typography/cjk-font-fallback.spec.ts",
  "settings/settings-text-size.spec.ts",
  // Layout and visual geometry of single screens
  "library/answers/library-question-desk.spec.ts",
  "git/git-workbench-stacked-floor.spec.ts",
] as const;
