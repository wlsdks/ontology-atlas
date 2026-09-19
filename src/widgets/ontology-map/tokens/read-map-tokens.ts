/**
 * The `--map-*` token reader (`docs/ONTOLOGY-MAP-DESIGN.md` §2).
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
 * `OntologyMapTokenError` rather than silently falling back to a default, so a
 * missing token is never absorbed on a hunch.
 */

export interface OntologyMapTokens {
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
  /** `--map-ego-dim-label-alpha` — the name of a domain the ego focus dimmed; children stay at 0. */
  egoDimLabelAlpha: number;
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
  /**
   * The galaxy's colour temperature, one step per kind, warm to cool down the containment
   * ladder. It carries kind at altitudes where the silhouette has converged to a circle and the
   * shape channel no longer exists — see `model/galaxy.ts`.
   */
  galaxyProject: string;
  galaxyDomain: string;
  galaxyCapability: string;
  galaxyElement: string;
  /** Canvas-emphasis slice — the selected node's static 2px ring color (spec §B1). */
  selectionRingIndigo: string;
  /** Canvas-emphasis slice — the selected node's outer 6px hairline ring color (spec §B1). */
  selectionRingHairline: string;
  /** Canvas-emphasis slice — the hovered node's static 1px preview ring color (spec §C). */
  hoverRing: string;
  /** Design Guardian prescription L — hover shimmer arc length (a fraction of the circumference, `--map-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Design Guardian prescription L — hover shimmer period for one revolution (ms, `--map-hover-shimmer-period-ms`). */
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
  /**
   * The ink one Strata plane ring rises to while its legend row is hovered. It is
   * the application's existing tertiary text step rather than a new colour: the
   * ring is briefly promoted to the rank of something you are reading, and drops
   * straight back to `domeRing` when the pointer leaves.
   */
  domeRingRaised: string;
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
  /** `--map-realm-fill-radius-1` — the domain ring for a maxDepth=1 realm-expansion subtree (world units, `model/realm.ts#realmRingsForDepth`). */
  realmFillRadius1: number;
  /** `--map-realm-fill-radius-2` — the domain ring for a maxDepth=2 realm-expansion subtree. */
  realmFillRadius2: number;
  /** `--map-realm-fill-radius-3` — the domain ring for a maxDepth≥3 realm-expansion subtree (= the global spine ring). */
  realmFillRadius3: number;
  edgeBowContains: number;
  edgeBowDepends: number;
  edgeBlendContains: number;
  edgeBlendDepends: number;
  starCount: number;
  dustAreaPerPoint: number;

  // 2.4 Motion · camera
  /**
   * `--map-camera-spring-angfreq-interactive` — dive-zoom fix (owner:
   * "zoom in/out is slow" — zoom in/out is slow). Drives the scale axis (and pan
   * while wheel-zooming)
   * during a LIVE wheel gesture — crisp, ~0.40s 95%-settle. The single shared
   * `cameraSpringAngFreq` (2.941, ~1.61s settle) this replaces made every
   * camera move — including an interactive wheel zoom — feel as slow as a
   * cinematic dive.
   */
  cameraSpringAngFreqInteractive: number;
  /**
   * `--map-camera-spring-angfreq-transition` — the same dive-zoom fix's
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
   * `--map-camera-small-graph-scale-max` — #11: overview fit ceiling
   * for a very small graph (≤5 nodes). A tiny vault (just-onboarded, one or
   * two created nodes) has a minuscule spine bbox, so the plain fit zooms a
   * single hexagon up to `cameraScaleMax` and it fills half the screen. This
   * lower cap keeps a lone node at a sane size with breathing room. Only bites
   * when the graph is small; larger vaults have big enough bounds that the fit
   * scale never reaches this.
   */
  cameraSmallGraphScaleMax: number;
  /** `--map-camera-max-zoom-ratio` — the viewport-relative ceiling `computeEffectiveCameraScaleMax` derives the real zoom-in bound from (see that function's JSDoc for the audit finding this fixes). */
  cameraMaxZoomRatio: number;
  /** `--map-camera-min-zoom-ratio` — the viewport-relative floor `computeEffectiveCameraScaleMin` derives the real zoom-out bound from. */
  cameraMinZoomRatio: number;
  cameraFocusPanMargin: number;
  /**
   * `--map-camera-pan-leash` — the world radius the camera may stray **from
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
  /**
   * The fraction of the free canvas axis the fitted cone spans
   * (`ui/topology-camera-math.ts#computeDomeFitCameraTarget`). The cone's only
   * padding term — it replaces the 15% bounds pad plus 0.95 overview ratio it
   * used to inherit from the 2D overview fit.
   */
  domeFitFill: number;
  /** Screen px the cone fit leaves above itself for the floating tool lane. */
  domeFitInsetTop: number;
  /** Screen px the cone fit leaves below itself for the instrument readout. */
  domeFitInsetBottom: number;
  focusFitMaxScale: number;
  focusBboxMargin: number;
  /** The zoom-in ceiling for selection (ego) framing — a ratio against overviewEntryScale. */
  focusMaxZoomRatio: number;
  hysteresisPx: number;
  emphasisRiseTau: number;
  emphasisDecayTau: number;
  /**
   * `--map-focus-dim-tau` — the click-focus color-ramp time constant
   * (`model/focus-state.ts#stepFocusRamp`). One symmetric τ for the normal↔dim/
   * ego color transition so a click's dim/ego swap eases in on the camera-dive
   * time axis instead of hard-cutting, and a deselect eases it back out.
   */
  focusDimTau: number;
  /**
   * How long the trail lens takes to fade in and out **under reduced motion**, in ms.
   *
   * Reduced motion suppresses the ignition sweep, the twinkle and the travelling light, and
   * used to suppress the transition itself as well — the lens ramp snapped 0 to 1 in one
   * frame. A cut is the one thing the preference did not ask for; an opacity crossfade carries
   * no travel and no vestibular signal (design-motion, 2026-09-10).
   */
  trailReducedFadeMs: number;
  /**
   * `--map-cluster-reveal-tau` — the cluster expand/collapse reveal ramp
   * time constant (rank7). One symmetric τ so a collapsed parent's child subtree
   * fades IN (0→1) on expand and OUT (1→0) on collapse instead of hard-cutting,
   * consistent across zoom. Reuses `stepEmphasis` (`model/focus-state.ts`).
   */
  clusterRevealTau: number;
  /**
   * `--map-spotlight-rest-alpha` — the target alpha nodes and edges outside
   * the window sink to while the recent-changes spotlight lens is ON (council design,
   * 2026-07-23). Kept lighter than the ego dim so structural context stays readable
   * under a whole-map lens. The on/off transition reuses the existing `focusDimTau`
   * ramp (zero new easings).
   */
  spotlightRestAlpha: number;
  /** `--map-path-rest-alpha` — the rest alpha off the path while the path lens is ON; deeper than the spotlight's, a path being two ends and a line rather than a whole-map lens. */
  pathRestAlpha: number;
  /** `--map-spotlight-ring-speed` — rotation speed of the dashed ring on a changed node (px/ms). */
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
  /** `--map-drag-tug-1hop` — 1-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug1Hop: number;
  /** `--map-drag-tug-2hop` — 2-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug2Hop: number;
  /** `--map-drag-tug-radius` — world-space radius past which drag tug is exactly 0 (`interaction/drag-tug.ts#tugFalloffForDistance`). */
  dragTugRadius: number;
  /** `--map-mass-heavy-degree` — degree at which a node is fully heavy (`expressive/mass-spring.ts`). */
  massHeavyDegree: number;
  /** `--map-mass-angfreq` — ω of every release spring; mass rides ζ, not ω (`expressive/mass-spring.ts`). */
  massAngFreq: number;
  /** `--map-mass-heavy-zeta` — release spring ζ for a fully heavy node (below 1: one overshoot). */
  massHeavyZeta: number;
  /** `--map-mass-drop-max-px` — the farthest a released node may carry past its drop point (world units). */
  massDropMaxPx: number;
  /** `--map-ego-glow-blur-px` — canvas shadow blur (px) for the focused node's bloom and its lines' glow. */
  egoGlowBlurPx: number;
  /** `--map-trail-glow-alpha` — the walked line's glow, stronger than the ego glow. */
  trailGlowAlpha: number;
  /** `--map-trail-glow-blur-px` */
  trailGlowBlurPx: number;
  /** `--map-ego-glow-alpha` — alpha of the glow under the focused node's relation lines. */
  egoGlowAlpha: number;
  /** `--map-node-bloom-blur-px` — canvas shadow blur (px) of the bloom disc itself, wider than the line glow. */
  nodeBloomBlurPx: number;
  /** `--map-node-bloom-alpha` — alpha of the blurred indigo disc under the focused or hovered node. */
  nodeBloomAlpha: number;
  /** `--map-press-angfreq` — ω of the hover press step response. */
  pressAngFreq: number;
  /** `--map-press-zeta` — ζ of the hover press (below 1 overshoots). */
  pressZeta: number;
  /** `--map-select-pulse-scale-delta` — commit-pulse max ring growth as a fraction of the ring radius (A3: 0.15 was sub-perceptual on element nodes). */
  selectPulseScaleDelta: number;
  /** `--map-node-release-settle-ms` — drag-release settle budget in ms, replacing the refresh-rate-dependent 90-frame countdown (A4). */
  nodeReleaseSettleMs: number;
  /** `--map-node-home-spring-angfreq` — auto-arrange homing spring ω, decoupled from the camera transition spring (A5). */
  nodeHomeSpringAngFreq: number;
  /** `--map-ego-reveal-rise-tau` — focus ego-reveal rise τ, slower than hover so children resolve as the camera dive lands (A6). */
  egoRevealRiseTau: number;
  /** `--map-ego-reveal-decay-tau` — focus ego-reveal decay τ; exits don't earn time (A6). */
  egoRevealDecayTau: number;
  /** `--map-ripple-stagger-max-ms` — total hover-ripple stagger budget, so hub degree can't stretch the ripple into an enumeration (A7). */
  rippleStaggerMaxMs: number;
  /** `--map-edge-contains-l0` — project-tier containment ink (P3a hierarchy ladder: value+width, never hue). */
  edgeContainsL0: string;
  /** `--map-edge-contains-l2` — capability/element-tier containment ink (P3a; must stay darker than the pre-B1 1.32:1 floor). */
  edgeContainsL2: string;
  /** `--map-edge-passthrough-alpha` — ink demotion for edges crossing the viewport with BOTH endpoints off-screen (B2 residual). */
  edgePassthroughAlpha: number;
  /** `--map-node-min-separation-ratio` — overlap relaxation threshold, sim-active frames only (B7). */
  nodeMinSeparationRatio: number;
  /** `--map-radius-magnitude-k` — √childCount magnitude encoding strength for domain/capability radii (S2 part 2; +40% ceiling). */
  radiusMagnitudeK: number;
  /** `--map-dust-parallax-min/max` — the dust parallax depth range (B3 leftover). */
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
  key: keyof OntologyMapTokens;
  cssVar: string;
  kind: TokenKind;
}

/** In §2 table order — adding a token means updating both this array and globals.css. */
const TOKEN_SPECS: readonly TokenSpec[] = [
  { key: "nodeFillProject", cssVar: "--map-node-fill-project", kind: "color" },
  { key: "nodeFillDomain", cssVar: "--map-node-fill-domain", kind: "color" },
  { key: "nodeFillCapability", cssVar: "--map-node-fill-capability", kind: "color" },
  { key: "nodeFillElement", cssVar: "--map-node-fill-element", kind: "color" },
  { key: "nodeStrokeProject", cssVar: "--map-node-stroke-project", kind: "color" },
  { key: "nodeStrokeDomain", cssVar: "--map-node-stroke-domain", kind: "color" },
  { key: "nodeStrokeCapability", cssVar: "--map-node-stroke-capability", kind: "color" },
  { key: "nodeStrokeElement", cssVar: "--map-node-stroke-element", kind: "color" },
  { key: "nodeFillDim", cssVar: "--map-node-fill-dim", kind: "color" },
  { key: "nodeStrokeDim", cssVar: "--map-node-stroke-dim", kind: "color" },
  { key: "egoDimLabelAlpha", cssVar: "--map-ego-dim-label-alpha", kind: "number" },
  { key: "nodeFillStale", cssVar: "--map-node-fill-stale", kind: "color" },
  { key: "nodeStrokeStale", cssVar: "--map-node-stroke-stale", kind: "color" },
  { key: "nodeHoleFill", cssVar: "--map-node-hole-fill", kind: "color" },
  { key: "indigo", cssVar: "--map-indigo", kind: "color" },
  { key: "indigoBright", cssVar: "--map-indigo-bright", kind: "color" },
  { key: "amberHub", cssVar: "--map-amber-hub", kind: "color" },
  { key: "recentChange", cssVar: "--map-recent-change", kind: "color" },
  { key: "numeralShadow", cssVar: "--map-numeral-shadow", kind: "color" },
  { key: "numeralFace", cssVar: "--map-numeral-face", kind: "color" },
  { key: "clusterChipBorderRest", cssVar: "--map-cluster-chip-border-rest", kind: "color" },
  { key: "clusterChipInkRest", cssVar: "--map-cluster-chip-ink-rest", kind: "color" },
  { key: "nodeSheenTint", cssVar: "--map-node-sheen-tint", kind: "color" },
  { key: "nodeSheenBlend", cssVar: "--map-node-sheen-blend", kind: "number" },
  { key: "projectHairlineInner", cssVar: "--map-project-hairline-inner", kind: "color" },
  { key: "projectPinTick", cssVar: "--map-project-pin-tick", kind: "color" },
  { key: "galaxyProject", cssVar: "--map-galaxy-project", kind: "color" },
  { key: "galaxyDomain", cssVar: "--map-galaxy-domain", kind: "color" },
  { key: "galaxyCapability", cssVar: "--map-galaxy-capability", kind: "color" },
  { key: "galaxyElement", cssVar: "--map-galaxy-element", kind: "color" },
  { key: "selectionRingIndigo", cssVar: "--map-selection-ring-indigo", kind: "color" },
  { key: "selectionRingHairline", cssVar: "--map-selection-ring-hairline", kind: "color" },
  { key: "hoverRing", cssVar: "--map-hover-ring", kind: "color" },
  { key: "hoverShimmerSeg", cssVar: "--map-hover-shimmer-seg", kind: "number" },
  { key: "hoverShimmerPeriodMs", cssVar: "--map-hover-shimmer-period-ms", kind: "number" },

  { key: "edgeContains", cssVar: "--map-edge-contains", kind: "color" },
  { key: "edgeDepends", cssVar: "--map-edge-depends", kind: "color" },
  { key: "edgeDim", cssVar: "--map-edge-dim", kind: "color" },
  { key: "edgeSelected", cssVar: "--map-edge-selected", kind: "color" },
  { key: "expandedCohort", cssVar: "--map-expanded-cohort", kind: "color" },
  { key: "hullStroke", cssVar: "--map-hull-stroke", kind: "color" },
  { key: "labelProject", cssVar: "--map-label-project", kind: "color" },
  { key: "labelDomain", cssVar: "--map-label-domain", kind: "color" },
  { key: "labelCapability", cssVar: "--map-label-capability", kind: "color" },
  { key: "labelElement", cssVar: "--map-label-element", kind: "color" },
  { key: "labelMaxWidth", cssVar: "--map-label-max-width", kind: "number" },
  { key: "canvasBgNear", cssVar: "--map-canvas-bg-near", kind: "color" },
  { key: "canvasBgFar", cssVar: "--map-canvas-bg-far", kind: "color" },
  { key: "gridMinor", cssVar: "--map-grid-minor", kind: "color" },
  { key: "gridMajor", cssVar: "--map-grid-major", kind: "color" },
  { key: "domeRing", cssVar: "--map-dome-ring", kind: "color" },
  { key: "domeRingRaised", cssVar: "--color-text-tertiary", kind: "color" },
  { key: "vignetteBaseAlpha", cssVar: "--map-vignette-base-alpha", kind: "number" },
  { key: "vignetteFarAlpha", cssVar: "--map-vignette-far-alpha", kind: "number" },

  { key: "radiusProject", cssVar: "--map-radius-project", kind: "number" },
  { key: "radiusDomain", cssVar: "--map-radius-domain", kind: "number" },
  { key: "radiusCapability", cssVar: "--map-radius-capability", kind: "number" },
  { key: "radiusElement", cssVar: "--map-radius-element", kind: "number" },
  { key: "layoutRingDomain", cssVar: "--map-layout-ring-domain", kind: "number" },
  { key: "layoutRingCapability", cssVar: "--map-layout-ring-capability", kind: "number" },
  { key: "layoutRingElement", cssVar: "--map-layout-ring-element", kind: "number" },
  { key: "realmFillRadius1", cssVar: "--map-realm-fill-radius-1", kind: "number" },
  { key: "realmFillRadius2", cssVar: "--map-realm-fill-radius-2", kind: "number" },
  { key: "realmFillRadius3", cssVar: "--map-realm-fill-radius-3", kind: "number" },
  { key: "edgeBowContains", cssVar: "--map-edge-bow-contains", kind: "number" },
  { key: "edgeBowDepends", cssVar: "--map-edge-bow-depends", kind: "number" },
  { key: "edgeBlendContains", cssVar: "--map-edge-blend-contains", kind: "number" },
  { key: "edgeBlendDepends", cssVar: "--map-edge-blend-depends", kind: "number" },
  { key: "starCount", cssVar: "--map-star-count", kind: "number" },
  { key: "dustAreaPerPoint", cssVar: "--map-dust-area-per-point", kind: "number" },

  { key: "cameraSpringAngFreqInteractive", cssVar: "--map-camera-spring-angfreq-interactive", kind: "number" },
  { key: "cameraSpringAngFreqTransition", cssVar: "--map-camera-spring-angfreq-transition", kind: "number" },
  { key: "cameraDampingDefault", cssVar: "--map-camera-damping-default", kind: "number" },
  { key: "cameraDampingFlick", cssVar: "--map-camera-damping-flick", kind: "number" },
  { key: "cameraMomentumDecay", cssVar: "--map-camera-momentum-decay", kind: "number" },
  { key: "cameraReleaseVelocityWindowMs", cssVar: "--map-camera-release-velocity-window-ms", kind: "number" },
  { key: "cameraFlickMinSpeed", cssVar: "--map-camera-flick-min-speed", kind: "number" },
  { key: "cameraScaleMin", cssVar: "--map-camera-scale-min", kind: "number" },
  { key: "cameraScaleMax", cssVar: "--map-camera-scale-max", kind: "number" },
  { key: "cameraSmallGraphScaleMax", cssVar: "--map-camera-small-graph-scale-max", kind: "number" },
  { key: "cameraMaxZoomRatio", cssVar: "--map-camera-max-zoom-ratio", kind: "number" },
  { key: "cameraMinZoomRatio", cssVar: "--map-camera-min-zoom-ratio", kind: "number" },
  { key: "cameraFocusPanMargin", cssVar: "--map-camera-focus-pan-margin", kind: "number" },
  { key: "cameraPanLeash", cssVar: "--map-camera-pan-leash", kind: "number" },
  { key: "altitudeFarHighRatio", cssVar: "--map-altitude-far-high-ratio", kind: "number" },
  { key: "altitudeFarLowRatio", cssVar: "--map-altitude-far-low-ratio", kind: "number" },
  { key: "overviewEntryRatio", cssVar: "--map-overview-entry-ratio", kind: "number" },
  { key: "domeFitFill", cssVar: "--map-dome-fit-fill", kind: "number" },
  { key: "domeFitInsetTop", cssVar: "--map-dome-fit-inset-top", kind: "number" },
  { key: "domeFitInsetBottom", cssVar: "--map-dome-fit-inset-bottom", kind: "number" },
  { key: "focusFitMaxScale", cssVar: "--map-focus-fit-max-scale", kind: "number" },
  { key: "focusBboxMargin", cssVar: "--map-focus-bbox-margin", kind: "number" },
  { key: "focusMaxZoomRatio", cssVar: "--map-focus-max-zoom-ratio", kind: "number" },
  { key: "hysteresisPx", cssVar: "--map-hysteresis-px", kind: "number" },
  { key: "emphasisRiseTau", cssVar: "--map-emphasis-rise-tau", kind: "number" },
  { key: "emphasisDecayTau", cssVar: "--map-emphasis-decay-tau", kind: "number" },
  { key: "focusDimTau", cssVar: "--map-focus-dim-tau", kind: "number" },
  { key: "trailReducedFadeMs", cssVar: "--map-trail-reduced-fade-ms", kind: "number" },
  { key: "spotlightRestAlpha", cssVar: "--map-spotlight-rest-alpha", kind: "number" },
  { key: "pathRestAlpha", cssVar: "--map-path-rest-alpha", kind: "number" },
  { key: "spotlightRingSpeed", cssVar: "--map-spotlight-ring-speed", kind: "number" },
  { key: "clusterRevealTau", cssVar: "--map-cluster-reveal-tau", kind: "number" },
  { key: "rippleStaggerMs", cssVar: "--map-ripple-stagger-ms", kind: "number" },
  { key: "breatheAmplitude", cssVar: "--map-breathe-amplitude", kind: "number" },
  { key: "breatheFreqRad", cssVar: "--map-breathe-freq-rad", kind: "number" },
  { key: "pulseDurationMs", cssVar: "--map-pulse-duration-ms", kind: "number" },
  { key: "selectPulseDurationMs", cssVar: "--map-select-pulse-duration-ms", kind: "number" },
  { key: "tipFadeMs", cssVar: "--map-tip-fade-ms", kind: "number" },
  { key: "edgePulseSpeed", cssVar: "--map-edge-pulse-speed", kind: "number" },
  { key: "edgePulseSpeedEgo", cssVar: "--map-edge-pulse-speed-ego", kind: "number" },
  { key: "dragTug1Hop", cssVar: "--map-drag-tug-1hop", kind: "number" },
  { key: "dragTug2Hop", cssVar: "--map-drag-tug-2hop", kind: "number" },
  { key: "dragTugRadius", cssVar: "--map-drag-tug-radius", kind: "number" },
  { key: "massHeavyDegree", cssVar: "--map-mass-heavy-degree", kind: "number" },
  { key: "massAngFreq", cssVar: "--map-mass-angfreq", kind: "number" },
  { key: "massHeavyZeta", cssVar: "--map-mass-heavy-zeta", kind: "number" },
  { key: "massDropMaxPx", cssVar: "--map-mass-drop-max-px", kind: "number" },
  { key: "egoGlowBlurPx", cssVar: "--map-ego-glow-blur-px", kind: "number" },
  { key: "trailGlowAlpha", cssVar: "--map-trail-glow-alpha", kind: "number" },
  { key: "trailGlowBlurPx", cssVar: "--map-trail-glow-blur-px", kind: "number" },
  { key: "egoGlowAlpha", cssVar: "--map-ego-glow-alpha", kind: "number" },
  { key: "nodeBloomBlurPx", cssVar: "--map-node-bloom-blur-px", kind: "number" },
  { key: "nodeBloomAlpha", cssVar: "--map-node-bloom-alpha", kind: "number" },
  { key: "pressAngFreq", cssVar: "--map-press-angfreq", kind: "number" },
  { key: "pressZeta", cssVar: "--map-press-zeta", kind: "number" },
  { key: "selectPulseScaleDelta", cssVar: "--map-select-pulse-scale-delta", kind: "number" },
  { key: "nodeReleaseSettleMs", cssVar: "--map-node-release-settle-ms", kind: "number" },
  { key: "nodeHomeSpringAngFreq", cssVar: "--map-node-home-spring-angfreq", kind: "number" },
  { key: "egoRevealRiseTau", cssVar: "--map-ego-reveal-rise-tau", kind: "number" },
  { key: "egoRevealDecayTau", cssVar: "--map-ego-reveal-decay-tau", kind: "number" },
  { key: "rippleStaggerMaxMs", cssVar: "--map-ripple-stagger-max-ms", kind: "number" },
  { key: "edgeContainsL0", cssVar: "--map-edge-contains-l0", kind: "color" },
  { key: "edgeContainsL2", cssVar: "--map-edge-contains-l2", kind: "color" },
  { key: "edgePassthroughAlpha", cssVar: "--map-edge-passthrough-alpha", kind: "number" },
  { key: "nodeMinSeparationRatio", cssVar: "--map-node-min-separation-ratio", kind: "number" },
  { key: "radiusMagnitudeK", cssVar: "--map-radius-magnitude-k", kind: "number" },
  { key: "dustParallaxMin", cssVar: "--map-dust-parallax-min", kind: "number" },
  { key: "dustParallaxMax", cssVar: "--map-dust-parallax-max", kind: "number" },
  { key: "canvasBgParallax", cssVar: "--map-canvas-bg-parallax", kind: "number" },

  { key: "safeInsetLeft", cssVar: "--map-safe-inset-left", kind: "number" },
  { key: "safeInsetRight", cssVar: "--map-safe-inset-right", kind: "number" },
  { key: "safeInsetTop", cssVar: "--map-safe-inset-top", kind: "number" },
  { key: "safeInsetBottom", cssVar: "--map-safe-inset-bottom", kind: "number" },
];

/** The token-count contract — this value, not a number in a comment, is the source of truth (the test pins fixture coverage to it). */
export const ONTOLOGY_MAP_TOKEN_COUNT = TOKEN_SPECS.length;

export class OntologyMapTokenError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(
      `OntologyMap token drift: missing/empty CSS custom propert${
        missing.length === 1 ? "y" : "ies"
      } — ${missing.join(", ")}. Check app/globals.css.`,
    );
    this.name = "OntologyMapTokenError";
  }
}

/**
 * Resolve every token in TOKEN_SPECS from a `getComputedStyle` result (or a test
 * substitute). Any one of them resolving to an empty string throws a
 * `OntologyMapTokenError` — that is the §2.3 "fail explicitly on a missing token"
 * contract.
 */
export function resolveOntologyMapTokens(
  getPropertyValue: (name: string) => string,
): OntologyMapTokens {
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
    throw new OntologyMapTokenError(missing);
  }

  return result as unknown as OntologyMapTokens;
}

/** Wraps `document.documentElement`'s computed style as an adapter. */
function readFromElement(element: Element): OntologyMapTokens {
  const styles = getComputedStyle(element);
  return resolveOntologyMapTokens((name) => styles.getPropertyValue(name));
}

let cached: OntologyMapTokens | null = null;

/**
 * Cached token reads — `getComputedStyle` is called once at mount and the cache is
 * returned thereafter. Call `clearOntologyMapTokensCache()` first at any point where
 * the token values can change, such as a dark/light theme switch.
 */
export function getOntologyMapTokens(element?: Element): OntologyMapTokens {
  if (cached) return cached;
  cached = readFromElement(element ?? document.documentElement);
  return cached;
}

/** Cache invalidation for theme switches and test isolation. */
export function clearOntologyMapTokensCache(): void {
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
// The top and bottom lanes follow the viewport height (`@media (max-height)`
// in globals.css), so they are refreshed with the INDEX-dependent left lane
// on every viewport commit — three reads, not the 115 of a blanket refresh.
const INDEX_DEPENDENT_TOKEN_KEYS = ["safeInsetLeft", "safeInsetTop", "safeInsetBottom"] as const;

/**
 * After an INDEX state (`data-topology-index`) transition, re-read **only the tokens
 * that can have changed**.
 *
 * ## Why full invalidation is wrong here (performance trace, 2026-07-28)
 *
 * `HomePage` called `clearOntologyMapTokensCache()` on every INDEX state change, and
 * **selecting a node changes that state.** So every single node click made the next
 * frame run `getPropertyValue` **115 times** inside one `getComputedStyle`, forcing a
 * style recalculation that burned **58ms** (the top Chrome ForcedReflow insight — the
 * next cause exposed after the earlier `useRowDisclosure` fix).
 *
 * Yet exactly **one** token depends on that attribute:
 * `--map-safe-inset-left`. 115 were being thrown away to refresh one.
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
  cached = { ...cached, ...patch } as OntologyMapTokens;
}
