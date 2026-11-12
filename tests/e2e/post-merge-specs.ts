/**
 * The specs excluded from the pull-request gate; they run in the daily and
 * manual full runs, when CI's impact plan maps a change to them, and in an
 * unfiltered local run. `pnpm pr:land` warns while the daily run is red.
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
  "map/3d/map-3d-grip.spec.ts",
  "map/flat-dial/map-flat-dial-frame-work.spec.ts",
  "map/frame-loop/map-frame-allocation.spec.ts",
  "map/hex-board/map-hex-frame-work.spec.ts",
  "map/frame-loop/map-hover-release.spec.ts",
  "map/frame-loop/map-sleep-frames.spec.ts",
  "map/chrome/map-trail.spec.ts",
  "app-shell/route-cycle-leak.spec.ts",
  "map/3d/map-3d-lit-strata.spec.ts",
  "map/hex-board/map-hex-board.spec.ts",
  "app-shell/route-transition-input.spec.ts",
  // Every route at every width
  "design-audits/focus-ring-contrast.spec.ts",
  "design-audits/overflow-sweep.spec.ts",
  "design-audits/responsive-overflow-audit.spec.ts",
  // Motion curves and frame samples on shared building blocks
  "motion/motion-disclosure.spec.ts",
  "motion-sampler.spec.ts",
  "map/frame-loop/map-layout-morph.spec.ts",
  // Download page animation, frame budgets and layout sweeps
  "gateway/download-hero-release.spec.ts",
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
  // 3D view pixel and ink placement
  // Map free-area and label placement
  "map/labels/map-label-collision.spec.ts",
  // Width, locale and text-size sweeps
  "typography/cjk-locale-sweep.spec.ts",
  "typography/cjk-font-fallback.spec.ts",
  "settings/settings-text-size.spec.ts",
  // Layout and visual geometry of single screens
  "library/answers/library-question-desk.spec.ts",
  "git/git-workbench-stacked-floor.spec.ts",
  // Placement halves of map specs whose behaviour moved to map-canvas-focus and map-escape-from-chrome
  // Geometry halves split from specs whose behaviour stays on the gate
] as const;
