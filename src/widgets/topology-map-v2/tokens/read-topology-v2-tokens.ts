/**
 * The `--topology-v2-*` token reader (`docs/TOPOLOGY-V2-DESIGN.md` §2).
 *
 * Canvas 2D cannot consume CSS variables directly, so they are resolved once with
 * `getComputedStyle` and cached as JS values (colour strings and numbers) — reusing
 * the `skeletonInkRef` resolve-cache pattern from Design Guardian verdict a4. The
 * source of truth for the values is still `app/globals.css` alone; this file is a
 * read-only adapter.
 *
 * Token drift guard: if any of the §2 table's tokens (`TOKEN_SPECS.length` is the
 * source of truth for the exact count, pinned by a contract test) resolves to an
 * empty string — deleted from `app/globals.css`, or mistyped — it throws a
 * `TopologyV2TokenError` rather than silently falling back to a default, so a
 * missing token is never absorbed on a hunch.
 */

export interface TopologyV2Tokens {
  // 2.1 Node surfaces (per-kind fill/stroke tier)
  nodeFillProject: string;
  nodeFillDomain: string;
  nodeFillCapability: string;
  nodeFillElement: string;
  nodeStrokeProject: string;
  nodeStrokeDomain: string;
  nodeStrokeCapability: string;
  nodeStrokeElement: string;
  nodeFillDim: string;
  nodeStrokeDim: string;
  nodeFillStale: string;
  nodeStrokeStale: string;
  nodeHoleFill: string;
  indigo: string;
  indigoBright: string;
  amberHub: string;
  /** Teal reserved for the "recent changes" lens — it has to be distinct from the hub amber (owner call, 2026-08-02). */
  recentChange: string;
  numeralShadow: string;
  numeralFace: string;
  /** Cluster chip rest border — chrome is darker than content (the bottom step of the ramp). */
  clusterChipBorderRest: string;
  /** Cluster chip rest ink (shared by the `＋` and the number) — indigo is not used at rest. */
  clusterChipInkRest: string;
  nodeSheenTint: string;
  nodeSheenBlend: number;
  /** Canvas-emphasis slice — project hexagon's inner offset hairline (double-hairline "machined bezel", spec §A1). */
  projectHairlineInner: string;
  /** Canvas-emphasis slice — project hexagon's 4-direction chassis-leg pin ticks (spec §A2). */
  projectPinTick: string;
  /** Canvas-emphasis slice — the selected node's static 2px ring color (spec §B1). */
  selectionRingIndigo: string;
  /** Canvas-emphasis slice — the selected node's outer 6px hairline ring color (spec §B1). */
  selectionRingHairline: string;
  /** Canvas-emphasis slice — the hovered node's static 1px preview ring color (spec §C). */
  hoverRing: string;
  /** Design Guardian prescription L — hover shimmer arc length (a fraction of the circumference, `--topology-v2-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Design Guardian prescription L — hover shimmer period for one revolution (ms, `--topology-v2-hover-shimmer-period-ms`). */
  hoverShimmerPeriodMs: number;

  // 2.2 Edges · labels · background
  edgeContains: string;
  edgeDepends: string;
  edgeDim: string;
  /** Edge selection (pair focus) stroke — the pale indigo ramp (separated by value from the standard node-selection indigo). */
  edgeSelected: string;
  /**
   * S11 expansion-cohort membership ring ink — the third step of the indigo ramp
   * (desaturated). It separates from the node selection's solid indigo and the edge
   * selection's pale indigo by saturation and geometry (zero new hues).
   */
  expandedCohort: string;
  hullStroke: string;
  labelProject: string;
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
  labelMaxWidth: number;
  canvasBgNear: string;
  /** 3D dome latitude ring ink — consumed only in 3D. The rationale for the value is the doc-comment in `globals.css`. */
  domeRing: string;
  canvasBgFar: string;
  gridMinor: string;
  gridMajor: string;
  vignetteBaseAlpha: number;
  vignetteFarAlpha: number;

  // 2.3 Geometry (radii · layout · corners)
  radiusProject: number;
  radiusDomain: number;
  radiusCapability: number;
  radiusElement: number;
  layoutRingDomain: number;
  layoutRingCapability: number;
  layoutRingElement: number;
  /** `--topology-v2-realm-fill-radius-1` — the domain ring for a maxDepth=1 realm-expansion subtree (world units, `model/realm.ts#realmRingsForDepth`). */
  realmFillRadius1: number;
  /** `--topology-v2-realm-fill-radius-2` — the domain ring for a maxDepth=2 realm-expansion subtree. */
  realmFillRadius2: number;
  /** `--topology-v2-realm-fill-radius-3` — the domain ring for a maxDepth≥3 realm-expansion subtree (= the global spine ring). */
  realmFillRadius3: number;
  edgeBowContains: number;
  edgeBowDepends: number;
  edgeBlendContains: number;
  edgeBlendDepends: number;
  starCount: number;
  dustAreaPerPoint: number;

  // 2.4 Motion · camera
  /**
   * `--topology-v2-camera-spring-angfreq-interactive` — dive-zoom fix (owner:
   * "zoom in/out is slow" — zoom in/out is slow). Drives the scale axis (and pan
   * while wheel-zooming)
   * during a LIVE wheel gesture — crisp, ~0.40s 95%-settle. The single shared
   * `cameraSpringAngFreq` (2.941, ~1.61s settle) this replaces made every
   * camera move — including an interactive wheel zoom — feel as slow as a
   * cinematic dive.
   */
  cameraSpringAngFreqInteractive: number;
  /**
   * `--topology-v2-camera-spring-angfreq-transition` — the same dive-zoom fix's
   * other half. Drives PROGRAMMATIC camera moves (focus dive, deselect return,
   * Auto-arrange, fit-view) — still cinematic, ~1.0s settle, but snappier than
   * the old shared value.
   */
  cameraSpringAngFreqTransition: number;
  cameraDampingDefault: number;
  cameraDampingFlick: number;
  cameraMomentumDecay: number;
  cameraReleaseVelocityWindowMs: number;
  cameraFlickMinSpeed: number;
  cameraScaleMin: number;
  cameraScaleMax: number;
  /**
   * `--topology-v2-camera-small-graph-scale-max` — #11: overview fit ceiling
   * for a very small graph (≤5 nodes). A tiny vault (just-onboarded, one or
   * two created nodes) has a minuscule spine bbox, so the plain fit zooms a
   * single hexagon up to `cameraScaleMax` and it fills half the screen. This
   * lower cap keeps a lone node at a sane size with breathing room. Only bites
   * when the graph is small; larger vaults have big enough bounds that the fit
   * scale never reaches this.
   */
  cameraSmallGraphScaleMax: number;
  /** `--topology-v2-camera-max-zoom-ratio` — the viewport-relative ceiling `computeEffectiveCameraScaleMax` derives the real zoom-in bound from (see that function's JSDoc for the audit finding this fixes). */
  cameraMaxZoomRatio: number;
  /** `--topology-v2-camera-min-zoom-ratio` — the viewport-relative floor `computeEffectiveCameraScaleMin` derives the real zoom-out bound from. */
  cameraMinZoomRatio: number;
  cameraFocusPanMargin: number;
  /**
   * `--topology-v2-camera-pan-leash` — the world radius the camera may stray **from
   * the fit** while nothing is focused. `0` (the default) means no leash, i.e. the
   * previous envelope (world bbox ± 320).
   *
   * A surface with no "fit the map" chrome — the gateway `/download` —
   * switches this on: allowing an irreversible pan on a screen with no way back
   * leaves the stage empty. The decision logic is
   * `topology-camera-math.ts#computeUnfocusedPanBounds`.
   */
  cameraPanLeash: number;
  altitudeFarHighRatio: number;
  altitudeFarLowRatio: number;
  overviewEntryRatio: number;
  focusFitMaxScale: number;
  focusBboxMargin: number;
  /** The zoom-in ceiling for selection (ego) framing — a ratio against overviewEntryScale. */
  focusMaxZoomRatio: number;
  hysteresisPx: number;
  emphasisRiseTau: number;
  emphasisDecayTau: number;
  /**
   * `--topology-v2-focus-dim-tau` — the click-focus color-ramp time constant
   * (`model/focus-state.ts#stepFocusRamp`). One symmetric τ for the normal↔dim/
   * ego color transition so a click's dim/ego swap eases in on the camera-dive
   * time axis instead of hard-cutting, and a deselect eases it back out.
   */
  focusDimTau: number;
  /**
   * `--topology-v2-cluster-reveal-tau` — the cluster expand/collapse reveal ramp
   * time constant (rank7). One symmetric τ so a collapsed parent's child subtree
   * fades IN (0→1) on expand and OUT (1→0) on collapse instead of hard-cutting,
   * consistent across zoom. Reuses `stepEmphasis` (`model/focus-state.ts`).
   */
  clusterRevealTau: number;
  /**
   * `--topology-v2-spotlight-rest-alpha` — the target alpha nodes and edges outside
   * the window sink to while the recent-changes spotlight lens is ON (council design,
   * 2026-07-23). Kept lighter than the ego dim so structural context stays readable
   * under a whole-map lens. The on/off transition reuses the existing `focusDimTau`
   * ramp (zero new easings).
   */
  spotlightRestAlpha: number;
  /** `--topology-v2-spotlight-ring-speed` — rotation speed of the dashed ring on a changed node (px/ms). */
  spotlightRingSpeed: number;
  rippleStaggerMs: number;
  breatheAmplitude: number;
  breatheFreqRad: number;
  pulseDurationMs: number;
  /**
   * Canvas-emphasis slice — the just-selected node's one-shot commit-pulse
   * duration (`model/selection-pulse.ts#computeSelectionPulse`), separate
   * from the unrelated (and much longer, 420ms) `pulseDurationMs` above —
   * that token is reserved for a different future pulse and this slice
   * doesn't touch it. Owner ceiling: ≤200ms; 180 leaves margin.
   */
  selectPulseDurationMs: number;
  tipFadeMs: number;
  edgePulseSpeed: number;
  edgePulseSpeedEgo: number;
  /** `--topology-v2-drag-tug-1hop` — 1-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug1Hop: number;
  /** `--topology-v2-drag-tug-2hop` — 2-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug2Hop: number;
  /** `--topology-v2-drag-tug-radius` — world-space radius past which drag tug is exactly 0 (`interaction/drag-tug.ts#tugFalloffForDistance`). */
  dragTugRadius: number;
  /** `--topology-v2-select-pulse-scale-delta` — commit-pulse max ring growth as a fraction of the ring radius (A3: 0.15 was sub-perceptual on element nodes). */
  selectPulseScaleDelta: number;
  /** `--topology-v2-node-release-settle-ms` — drag-release settle budget in ms, replacing the refresh-rate-dependent 90-frame countdown (A4). */
  nodeReleaseSettleMs: number;
  /** `--topology-v2-node-home-spring-angfreq` — auto-arrange homing spring ω, decoupled from the camera transition spring (A5). */
  nodeHomeSpringAngFreq: number;
  /** `--topology-v2-ego-reveal-rise-tau` — focus ego-reveal rise τ, slower than hover so children resolve as the camera dive lands (A6). */
  egoRevealRiseTau: number;
  /** `--topology-v2-ego-reveal-decay-tau` — focus ego-reveal decay τ; exits don't earn time (A6). */
  egoRevealDecayTau: number;
  /** `--topology-v2-ripple-stagger-max-ms` — total hover-ripple stagger budget, so hub degree can't stretch the ripple into an enumeration (A7). */
  rippleStaggerMaxMs: number;
  /** `--topology-v2-edge-contains-l0` — project-tier containment ink (P3a hierarchy ladder: value+width, never hue). */
  edgeContainsL0: string;
  /** `--topology-v2-edge-contains-l2` — capability/element-tier containment ink (P3a; must stay darker than the pre-B1 1.32:1 floor). */
  edgeContainsL2: string;
  /** `--topology-v2-edge-passthrough-alpha` — ink demotion for edges crossing the viewport with BOTH endpoints off-screen (B2 residual). */
  edgePassthroughAlpha: number;
  /** `--topology-v2-node-min-separation-ratio` — overlap relaxation threshold, sim-active frames only (B7). */
  nodeMinSeparationRatio: number;
  /** `--topology-v2-radius-magnitude-k` — √childCount magnitude encoding strength for domain/capability radii (S2 part 2; +40% ceiling). */
  radiusMagnitudeK: number;
  /** `--topology-v2-dust-parallax-min/max` — the dust parallax depth range (B3 leftover). */
  dustParallaxMin: number;
  dustParallaxMax: number;
  /** Constellation background parallax factor — 1 = welded to the world, <1 = a distant layer. See `model/background-parallax.ts`. */
  canvasBgParallax: number;

  // 2.5 Safe area (fixed chrome insets, px — label culling plus camera fit)
  safeInsetLeft: number;
  safeInsetRight: number;
  safeInsetTop: number;
  safeInsetBottom: number;
}

type TokenKind = "color" | "number";

interface TokenSpec {
  key: keyof TopologyV2Tokens;
  cssVar: string;
  kind: TokenKind;
}

/** In §2 table order — adding a token means updating both this array and globals.css. */
const TOKEN_SPECS: readonly TokenSpec[] = [
  { key: "nodeFillProject", cssVar: "--topology-v2-node-fill-project", kind: "color" },
  { key: "nodeFillDomain", cssVar: "--topology-v2-node-fill-domain", kind: "color" },
  { key: "nodeFillCapability", cssVar: "--topology-v2-node-fill-capability", kind: "color" },
  { key: "nodeFillElement", cssVar: "--topology-v2-node-fill-element", kind: "color" },
  { key: "nodeStrokeProject", cssVar: "--topology-v2-node-stroke-project", kind: "color" },
  { key: "nodeStrokeDomain", cssVar: "--topology-v2-node-stroke-domain", kind: "color" },
  { key: "nodeStrokeCapability", cssVar: "--topology-v2-node-stroke-capability", kind: "color" },
  { key: "nodeStrokeElement", cssVar: "--topology-v2-node-stroke-element", kind: "color" },
  { key: "nodeFillDim", cssVar: "--topology-v2-node-fill-dim", kind: "color" },
  { key: "nodeStrokeDim", cssVar: "--topology-v2-node-stroke-dim", kind: "color" },
  { key: "nodeFillStale", cssVar: "--topology-v2-node-fill-stale", kind: "color" },
  { key: "nodeStrokeStale", cssVar: "--topology-v2-node-stroke-stale", kind: "color" },
  { key: "nodeHoleFill", cssVar: "--topology-v2-node-hole-fill", kind: "color" },
  { key: "indigo", cssVar: "--topology-v2-indigo", kind: "color" },
  { key: "indigoBright", cssVar: "--topology-v2-indigo-bright", kind: "color" },
  { key: "amberHub", cssVar: "--topology-v2-amber-hub", kind: "color" },
  { key: "recentChange", cssVar: "--topology-v2-recent-change", kind: "color" },
  { key: "numeralShadow", cssVar: "--topology-v2-numeral-shadow", kind: "color" },
  { key: "numeralFace", cssVar: "--topology-v2-numeral-face", kind: "color" },
  { key: "clusterChipBorderRest", cssVar: "--topology-v2-cluster-chip-border-rest", kind: "color" },
  { key: "clusterChipInkRest", cssVar: "--topology-v2-cluster-chip-ink-rest", kind: "color" },
  { key: "nodeSheenTint", cssVar: "--topology-v2-node-sheen-tint", kind: "color" },
  { key: "nodeSheenBlend", cssVar: "--topology-v2-node-sheen-blend", kind: "number" },
  { key: "projectHairlineInner", cssVar: "--topology-v2-project-hairline-inner", kind: "color" },
  { key: "projectPinTick", cssVar: "--topology-v2-project-pin-tick", kind: "color" },
  { key: "selectionRingIndigo", cssVar: "--topology-v2-selection-ring-indigo", kind: "color" },
  { key: "selectionRingHairline", cssVar: "--topology-v2-selection-ring-hairline", kind: "color" },
  { key: "hoverRing", cssVar: "--topology-v2-hover-ring", kind: "color" },
  { key: "hoverShimmerSeg", cssVar: "--topology-v2-hover-shimmer-seg", kind: "number" },
  { key: "hoverShimmerPeriodMs", cssVar: "--topology-v2-hover-shimmer-period-ms", kind: "number" },

  { key: "edgeContains", cssVar: "--topology-v2-edge-contains", kind: "color" },
  { key: "edgeDepends", cssVar: "--topology-v2-edge-depends", kind: "color" },
  { key: "edgeDim", cssVar: "--topology-v2-edge-dim", kind: "color" },
  { key: "edgeSelected", cssVar: "--topology-v2-edge-selected", kind: "color" },
  { key: "expandedCohort", cssVar: "--topology-v2-expanded-cohort", kind: "color" },
  { key: "hullStroke", cssVar: "--topology-v2-hull-stroke", kind: "color" },
  { key: "labelProject", cssVar: "--topology-v2-label-project", kind: "color" },
  { key: "labelDomain", cssVar: "--topology-v2-label-domain", kind: "color" },
  { key: "labelCapability", cssVar: "--topology-v2-label-capability", kind: "color" },
  { key: "labelElement", cssVar: "--topology-v2-label-element", kind: "color" },
  { key: "labelMaxWidth", cssVar: "--topology-v2-label-max-width", kind: "number" },
  { key: "canvasBgNear", cssVar: "--topology-v2-canvas-bg-near", kind: "color" },
  { key: "canvasBgFar", cssVar: "--topology-v2-canvas-bg-far", kind: "color" },
  { key: "gridMinor", cssVar: "--topology-v2-grid-minor", kind: "color" },
  { key: "gridMajor", cssVar: "--topology-v2-grid-major", kind: "color" },
  { key: "domeRing", cssVar: "--topology-v2-dome-ring", kind: "color" },
  { key: "vignetteBaseAlpha", cssVar: "--topology-v2-vignette-base-alpha", kind: "number" },
  { key: "vignetteFarAlpha", cssVar: "--topology-v2-vignette-far-alpha", kind: "number" },

  { key: "radiusProject", cssVar: "--topology-v2-radius-project", kind: "number" },
  { key: "radiusDomain", cssVar: "--topology-v2-radius-domain", kind: "number" },
  { key: "radiusCapability", cssVar: "--topology-v2-radius-capability", kind: "number" },
  { key: "radiusElement", cssVar: "--topology-v2-radius-element", kind: "number" },
  { key: "layoutRingDomain", cssVar: "--topology-v2-layout-ring-domain", kind: "number" },
  { key: "layoutRingCapability", cssVar: "--topology-v2-layout-ring-capability", kind: "number" },
  { key: "layoutRingElement", cssVar: "--topology-v2-layout-ring-element", kind: "number" },
  { key: "realmFillRadius1", cssVar: "--topology-v2-realm-fill-radius-1", kind: "number" },
  { key: "realmFillRadius2", cssVar: "--topology-v2-realm-fill-radius-2", kind: "number" },
  { key: "realmFillRadius3", cssVar: "--topology-v2-realm-fill-radius-3", kind: "number" },
  { key: "edgeBowContains", cssVar: "--topology-v2-edge-bow-contains", kind: "number" },
  { key: "edgeBowDepends", cssVar: "--topology-v2-edge-bow-depends", kind: "number" },
  { key: "edgeBlendContains", cssVar: "--topology-v2-edge-blend-contains", kind: "number" },
  { key: "edgeBlendDepends", cssVar: "--topology-v2-edge-blend-depends", kind: "number" },
  { key: "starCount", cssVar: "--topology-v2-star-count", kind: "number" },
  { key: "dustAreaPerPoint", cssVar: "--topology-v2-dust-area-per-point", kind: "number" },

  { key: "cameraSpringAngFreqInteractive", cssVar: "--topology-v2-camera-spring-angfreq-interactive", kind: "number" },
  { key: "cameraSpringAngFreqTransition", cssVar: "--topology-v2-camera-spring-angfreq-transition", kind: "number" },
  { key: "cameraDampingDefault", cssVar: "--topology-v2-camera-damping-default", kind: "number" },
  { key: "cameraDampingFlick", cssVar: "--topology-v2-camera-damping-flick", kind: "number" },
  { key: "cameraMomentumDecay", cssVar: "--topology-v2-camera-momentum-decay", kind: "number" },
  { key: "cameraReleaseVelocityWindowMs", cssVar: "--topology-v2-camera-release-velocity-window-ms", kind: "number" },
  { key: "cameraFlickMinSpeed", cssVar: "--topology-v2-camera-flick-min-speed", kind: "number" },
  { key: "cameraScaleMin", cssVar: "--topology-v2-camera-scale-min", kind: "number" },
  { key: "cameraScaleMax", cssVar: "--topology-v2-camera-scale-max", kind: "number" },
  { key: "cameraSmallGraphScaleMax", cssVar: "--topology-v2-camera-small-graph-scale-max", kind: "number" },
  { key: "cameraMaxZoomRatio", cssVar: "--topology-v2-camera-max-zoom-ratio", kind: "number" },
  { key: "cameraMinZoomRatio", cssVar: "--topology-v2-camera-min-zoom-ratio", kind: "number" },
  { key: "cameraFocusPanMargin", cssVar: "--topology-v2-camera-focus-pan-margin", kind: "number" },
  { key: "cameraPanLeash", cssVar: "--topology-v2-camera-pan-leash", kind: "number" },
  { key: "altitudeFarHighRatio", cssVar: "--topology-v2-altitude-far-high-ratio", kind: "number" },
  { key: "altitudeFarLowRatio", cssVar: "--topology-v2-altitude-far-low-ratio", kind: "number" },
  { key: "overviewEntryRatio", cssVar: "--topology-v2-overview-entry-ratio", kind: "number" },
  { key: "focusFitMaxScale", cssVar: "--topology-v2-focus-fit-max-scale", kind: "number" },
  { key: "focusBboxMargin", cssVar: "--topology-v2-focus-bbox-margin", kind: "number" },
  { key: "focusMaxZoomRatio", cssVar: "--topology-v2-focus-max-zoom-ratio", kind: "number" },
  { key: "hysteresisPx", cssVar: "--topology-v2-hysteresis-px", kind: "number" },
  { key: "emphasisRiseTau", cssVar: "--topology-v2-emphasis-rise-tau", kind: "number" },
  { key: "emphasisDecayTau", cssVar: "--topology-v2-emphasis-decay-tau", kind: "number" },
  { key: "focusDimTau", cssVar: "--topology-v2-focus-dim-tau", kind: "number" },
  { key: "spotlightRestAlpha", cssVar: "--topology-v2-spotlight-rest-alpha", kind: "number" },
  { key: "spotlightRingSpeed", cssVar: "--topology-v2-spotlight-ring-speed", kind: "number" },
  { key: "clusterRevealTau", cssVar: "--topology-v2-cluster-reveal-tau", kind: "number" },
  { key: "rippleStaggerMs", cssVar: "--topology-v2-ripple-stagger-ms", kind: "number" },
  { key: "breatheAmplitude", cssVar: "--topology-v2-breathe-amplitude", kind: "number" },
  { key: "breatheFreqRad", cssVar: "--topology-v2-breathe-freq-rad", kind: "number" },
  { key: "pulseDurationMs", cssVar: "--topology-v2-pulse-duration-ms", kind: "number" },
  { key: "selectPulseDurationMs", cssVar: "--topology-v2-select-pulse-duration-ms", kind: "number" },
  { key: "tipFadeMs", cssVar: "--topology-v2-tip-fade-ms", kind: "number" },
  { key: "edgePulseSpeed", cssVar: "--topology-v2-edge-pulse-speed", kind: "number" },
  { key: "edgePulseSpeedEgo", cssVar: "--topology-v2-edge-pulse-speed-ego", kind: "number" },
  { key: "dragTug1Hop", cssVar: "--topology-v2-drag-tug-1hop", kind: "number" },
  { key: "dragTug2Hop", cssVar: "--topology-v2-drag-tug-2hop", kind: "number" },
  { key: "dragTugRadius", cssVar: "--topology-v2-drag-tug-radius", kind: "number" },
  { key: "selectPulseScaleDelta", cssVar: "--topology-v2-select-pulse-scale-delta", kind: "number" },
  { key: "nodeReleaseSettleMs", cssVar: "--topology-v2-node-release-settle-ms", kind: "number" },
  { key: "nodeHomeSpringAngFreq", cssVar: "--topology-v2-node-home-spring-angfreq", kind: "number" },
  { key: "egoRevealRiseTau", cssVar: "--topology-v2-ego-reveal-rise-tau", kind: "number" },
  { key: "egoRevealDecayTau", cssVar: "--topology-v2-ego-reveal-decay-tau", kind: "number" },
  { key: "rippleStaggerMaxMs", cssVar: "--topology-v2-ripple-stagger-max-ms", kind: "number" },
  { key: "edgeContainsL0", cssVar: "--topology-v2-edge-contains-l0", kind: "color" },
  { key: "edgeContainsL2", cssVar: "--topology-v2-edge-contains-l2", kind: "color" },
  { key: "edgePassthroughAlpha", cssVar: "--topology-v2-edge-passthrough-alpha", kind: "number" },
  { key: "nodeMinSeparationRatio", cssVar: "--topology-v2-node-min-separation-ratio", kind: "number" },
  { key: "radiusMagnitudeK", cssVar: "--topology-v2-radius-magnitude-k", kind: "number" },
  { key: "dustParallaxMin", cssVar: "--topology-v2-dust-parallax-min", kind: "number" },
  { key: "dustParallaxMax", cssVar: "--topology-v2-dust-parallax-max", kind: "number" },
  { key: "canvasBgParallax", cssVar: "--topology-v2-canvas-bg-parallax", kind: "number" },

  { key: "safeInsetLeft", cssVar: "--topology-v2-safe-inset-left", kind: "number" },
  { key: "safeInsetRight", cssVar: "--topology-v2-safe-inset-right", kind: "number" },
  { key: "safeInsetTop", cssVar: "--topology-v2-safe-inset-top", kind: "number" },
  { key: "safeInsetBottom", cssVar: "--topology-v2-safe-inset-bottom", kind: "number" },
];

/** The token-count contract — this value, not a number in a comment, is the source of truth (the test pins fixture coverage to it). */
export const TOPOLOGY_V2_TOKEN_COUNT = TOKEN_SPECS.length;

export class TopologyV2TokenError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(
      `TopologyV2 token drift: missing/empty CSS custom propert${
        missing.length === 1 ? "y" : "ies"
      } — ${missing.join(", ")}. Check app/globals.css.`,
    );
    this.name = "TopologyV2TokenError";
  }
}

/**
 * Resolve every token in TOKEN_SPECS from a `getComputedStyle` result (or a test
 * substitute). Any one of them resolving to an empty string throws a
 * `TopologyV2TokenError` — that is the §2.3 "fail explicitly on a missing token"
 * contract.
 */
export function resolveTopologyV2Tokens(
  getPropertyValue: (name: string) => string,
): TopologyV2Tokens {
  const missing: string[] = [];
  const result = {} as Record<string, string | number>;

  for (const spec of TOKEN_SPECS) {
    const raw = getPropertyValue(spec.cssVar).trim();
    if (raw === "") {
      missing.push(spec.cssVar);
      continue;
    }
    if (spec.kind === "number") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        missing.push(`${spec.cssVar} (non-numeric: "${raw}")`);
        continue;
      }
      result[spec.key] = parsed;
    } else {
      result[spec.key] = raw;
    }
  }

  if (missing.length > 0) {
    throw new TopologyV2TokenError(missing);
  }

  return result as unknown as TopologyV2Tokens;
}

/** Wraps `document.documentElement`'s computed style as an adapter. */
function readFromElement(element: Element): TopologyV2Tokens {
  const styles = getComputedStyle(element);
  return resolveTopologyV2Tokens((name) => styles.getPropertyValue(name));
}

let cached: TopologyV2Tokens | null = null;

/**
 * Cached token reads — `getComputedStyle` is called once at mount and the cache is
 * returned thereafter. Call `clearTopologyV2TokensCache()` first at any point where
 * the token values can change, such as a dark/light theme switch.
 */
export function getTopologyV2Tokens(element?: Element): TopologyV2Tokens {
  if (cached) return cached;
  cached = readFromElement(element ?? document.documentElement);
  return cached;
}

/** Cache invalidation for theme switches and test isolation. */
export function clearTopologyV2TokensCache(): void {
  cached = null;
}

/**
 * The tokens `html[data-topology-index]` actually changes — **this list is the
 * contract**.
 *
 * It holds only what the `html[data-topology-index="collapsed"]` block in
 * `app/globals.css` redefines. Writing one more token into that block means adding
 * one line here; skipping it leaves that value stale alone — a quieter failure than
 * a full invalidation, which is why it is pinned in a comment.
 */
const INDEX_DEPENDENT_TOKEN_KEYS = ["safeInsetLeft"] as const;

/**
 * After an INDEX state (`data-topology-index`) transition, re-read **only the tokens
 * that can have changed**.
 *
 * ## Why full invalidation is wrong here (performance trace, 2026-07-28)
 *
 * `HomePage` called `clearTopologyV2TokensCache()` on every INDEX state change, and
 * **selecting a node changes that state.** So every single node click made the next
 * frame run `getPropertyValue` **115 times** inside one `getComputedStyle`, forcing a
 * style recalculation that burned **58ms** (the top Chrome ForcedReflow insight — the
 * next cause exposed after the earlier `useRowDisclosure` fix).
 *
 * Yet exactly **one** token depends on that attribute:
 * `--topology-v2-safe-inset-left`. 115 were being thrown away to refresh one.
 *
 * With no cache yet it does nothing — the next read fetches current values anyway.
 */
export function refreshIndexDependentTokens(element?: Element): void {
  if (!cached) return;
  if (typeof document === "undefined") return;
  const styles = getComputedStyle(element ?? document.documentElement);
  const patch: Record<string, string | number> = {};
  for (const key of INDEX_DEPENDENT_TOKEN_KEYS) {
    const spec = TOKEN_SPECS.find((s) => s.key === key);
    if (!spec) continue;
    const raw = styles.getPropertyValue(spec.cssVar).trim();
    if (raw === "") continue;
    if (spec.kind === "number") {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) patch[spec.key] = parsed;
    } else {
      patch[spec.key] = raw;
    }
  }
  cached = { ...cached, ...patch } as TopologyV2Tokens;
}
