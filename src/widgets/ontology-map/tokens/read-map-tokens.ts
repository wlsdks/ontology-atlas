/**
 * The `--map-*` token reader (`docs/design/ontology-map.md` section 2). Canvas 2D cannot read CSS
 * variables, so they are resolved once and cached. A token resolving to an empty string throws
 * `OntologyMapTokenError` rather than falling back to a default.
 */
export interface OntologyMapTokens {
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
  /** `--map-ego-rest-alpha`: the one alpha ego-dimmed nodes, lines, chips and names sink to; a colour ramp alone left dimmed siblings reading as ego members without names. */
  egoRestAlpha: number;
  nodeFillStale: string;
  nodeStrokeStale: string;
  nodeHoleFill: string;
  indigo: string;
  indigoBright: string;
  amberHub: string;
  /** Teal reserved for the recent changes lens; distinct from the hub amber. */
  recentChange: string;
  /**
   * The lit 3D map's kind light: the kind ramp triples (`--color-kind-*-rgb`, "r g b"), the same
   * hues as the legend, so a node's light and its legend dot agree.
   */
  kindRgbProject: string;
  kindRgbDomain: string;
  kindRgbCapability: string;
  kindRgbElement: string;
  /** The product's one warning hue — a stale node's evidence ring. */
  statusWarning: string;
  numeralShadow: string;
  numeralFace: string;
  /** Cluster chip rest border — chrome is darker than content (the bottom step of the ramp). */
  clusterChipBorderRest: string;
  /** Cluster chip rest ink (shared by the `＋` and the number) — indigo is not used at rest. */
  clusterChipInkRest: string;
  nodeSheenTint: string;
  nodeSheenBlend: number;
  /** The project hexagon's inner offset hairline (double-hairline bezel). */
  projectHairlineInner: string;
  /** The project hexagon's 4-direction pin ticks. */
  projectPinTick: string;
  /** The selected node's static 2px ring colour. */
  selectionRingIndigo: string;
  /** The selected node's outer 6px hairline ring colour. */
  selectionRingHairline: string;
  /** The hovered node's static 1px preview ring colour. */
  hoverRing: string;
  /** Hover shimmer arc length, a fraction of the circumference (`--map-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Hover shimmer period for one revolution, ms (`--map-hover-shimmer-period-ms`). */
  hoverShimmerPeriodMs: number;

  edgeContains: string;
  edgeDepends: string;
  edgeDim: string;
  /** Edge selection (pair focus) stroke: the pale indigo ramp, told from node-selection indigo by value. */
  edgeSelected: string;
  /** Expansion-cohort membership ring ink: the third, desaturated step of the indigo ramp, told from node selection's solid indigo and edge selection's pale indigo by saturation and geometry (zero new hues). */
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
  /** The ink a Strata plane ring rises to while its legend row is hovered: the existing tertiary text step, dropping back to `domeRing` when the pointer leaves. */
  domeRingRaised: string;
  canvasBgFar: string;
  gridMinor: string;
  gridMajor: string;
  vignetteBaseAlpha: number;
  vignetteFarAlpha: number;

  radiusProject: number;
  radiusDomain: number;
  radiusCapability: number;
  radiusElement: number;
  layoutRingDomain: number;
  layoutRingCapability: number;
  layoutRingElement: number;
  /** `--map-realm-fill-radius-1`: the domain ring for a maxDepth=1 realm-expansion subtree, world units (`model/realm/realm.ts#realmRingsForDepth`). */
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

  /**
   * `--map-camera-spring-angfreq-interactive`: drives the scale axis (and pan while wheel-zooming)
   * during a live wheel gesture; crisp, about 0.40s settle, unlike the cinematic transition spring.
   */
  cameraSpringAngFreqInteractive: number;
  /** `--map-camera-spring-angfreq-transition`: drives programmatic camera moves (focus dive, deselect, Auto-arrange, fit-view); cinematic, ~1.0 s settle. */
  cameraSpringAngFreqTransition: number;
  cameraDampingDefault: number;
  cameraReleaseVelocityWindowMs: number;
  cameraFlickMinSpeed: number;
  cameraScaleMin: number;
  cameraScaleMax: number;
  /**
   * `--map-camera-small-graph-scale-max`: overview fit ceiling for a very small graph (≤5 nodes), whose tiny spine bbox
   * would otherwise zoom a lone hexagon up to `cameraScaleMax` and fill half the screen.
   */
  cameraSmallGraphScaleMax: number;
  /** `--map-camera-max-zoom-ratio`: the viewport-relative ceiling `computeEffectiveCameraScaleMax` derives the zoom-in bound from. */
  cameraMaxZoomRatio: number;
  /** `--map-camera-min-zoom-ratio` — the viewport-relative floor `computeEffectiveCameraScaleMin` derives the real zoom-out bound from. */
  cameraMinZoomRatio: number;
  cameraFocusPanMargin: number;
  /**
   * `--map-camera-pan-leash`: the world radius the camera may stray from the fit while nothing is focused; 0 (default) means
   * no leash. A surface with no "fit the map" chrome (the gateway `/download`) switches it on, since an irreversible pan
   * there leaves the stage empty (`target/pan-leash.ts#computeUnfocusedPanBounds`).
   */
  cameraPanLeash: number;
  altitudeFarHighRatio: number;
  altitudeFarLowRatio: number;
  overviewEntryRatio: number;
  /**
   * Fraction of the free canvas axis the fitted cone spans (`computeDomeFitCameraTarget`); the
   * cone's only padding term.
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
  /** `--map-focus-dim-tau`: one symmetric τ for the click-focus normal↔dim/ego colour ramp (`focus-state.ts#stepFocusRamp`), easing on the camera-dive time axis instead of hard-cutting. */
  focusDimTau: number;
  /**
   * Trail lens fade time in ms under reduced motion: an opacity crossfade carries no travel, so the
   * lens fades instead of snapping in one frame.
   */
  trailReducedFadeMs: number;
  /** `--map-cluster-reveal-tau`: one symmetric τ so a collapsed parent's children fade in on expand and out on collapse, consistent across zoom (`stepEmphasis`). */
  clusterRevealTau: number;
  /**
   * `--map-spotlight-rest-alpha`: alpha nodes and edges outside the window sink to while the
   * recent-changes spotlight is on. Lighter than the ego dim so structural context stays readable;
   * reuses the `focusDimTau` ramp.
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
  /** Duration of the just-selected node's one-shot commit pulse (`computeSelectionPulse`), separate from `pulseDurationMs`; the ceiling is 200 ms. */
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
  lightSpeed: number;
  lightHopMinMs: number;
  lightHopMaxMs: number;
  lightPathMaxMs: number;
  lightTail: number;
  lightCorePx: number;
  lightHaloPx: number;
  lightIntensity: number;
  lightBloomTau: number;
  /** `--map-select-pulse-scale-delta`: commit-pulse max ring growth as a fraction of the ring radius. */
  selectPulseScaleDelta: number;
  /** `--map-node-release-settle-ms`: drag-release settle budget in ms, independent of refresh rate. */
  nodeReleaseSettleMs: number;
  /** `--map-node-home-spring-angfreq`: auto-arrange homing spring ω, decoupled from the camera transition spring. */
  nodeHomeSpringAngFreq: number;
  /** `--map-ego-reveal-rise-tau`: focus ego-reveal rise τ, slower than hover so children resolve as the camera dive lands. */
  egoRevealRiseTau: number;
  /** `--map-ego-reveal-decay-tau`: focus ego-reveal decay τ; exits do not earn time. */
  egoRevealDecayTau: number;
  /** `--map-ripple-stagger-max-ms`: total hover-ripple stagger budget, so hub degree cannot stretch the ripple into an enumeration. */
  rippleStaggerMaxMs: number;
  /** `--map-edge-contains-l0`: project-tier containment ink (a hierarchy ladder of value and width, never hue). */
  edgeContainsL0: string;
  /** `--map-edge-contains-l2`: capability/element-tier containment ink. */
  edgeContainsL2: string;
  /** `--map-edge-passthrough-alpha`: ink demotion for edges crossing the viewport with both endpoints off-screen. */
  edgePassthroughAlpha: number;
  /** `--map-node-min-separation-ratio`: overlap relaxation threshold, sim-active frames only. */
  nodeMinSeparationRatio: number;
  /** `--map-radius-magnitude-k`: √childCount magnitude encoding strength for domain/capability radii (+40% ceiling). */
  radiusMagnitudeK: number;
  /** `--map-dust-parallax-min/max`: the dust parallax depth range. */
  dustParallaxMin: number;
  dustParallaxMax: number;
  /** Constellation background parallax factor — 1 = welded to the world, <1 = a distant layer. See `model/camera/background-parallax.ts`. */
  canvasBgParallax: number;

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
  { key: "egoRestAlpha", cssVar: "--map-ego-rest-alpha", kind: "number" },
  { key: "nodeFillStale", cssVar: "--map-node-fill-stale", kind: "color" },
  { key: "nodeStrokeStale", cssVar: "--map-node-stroke-stale", kind: "color" },
  { key: "nodeHoleFill", cssVar: "--map-node-hole-fill", kind: "color" },
  { key: "indigo", cssVar: "--map-indigo", kind: "color" },
  { key: "indigoBright", cssVar: "--map-indigo-bright", kind: "color" },
  { key: "amberHub", cssVar: "--map-amber-hub", kind: "color" },
  { key: "recentChange", cssVar: "--map-recent-change", kind: "color" },
  { key: "kindRgbProject", cssVar: "--color-kind-project-rgb", kind: "color" },
  { key: "kindRgbDomain", cssVar: "--color-kind-domain-rgb", kind: "color" },
  { key: "kindRgbCapability", cssVar: "--color-kind-capability-rgb", kind: "color" },
  { key: "kindRgbElement", cssVar: "--color-kind-element-rgb", kind: "color" },
  { key: "statusWarning", cssVar: "--color-status-warning", kind: "color" },
  { key: "numeralShadow", cssVar: "--map-numeral-shadow", kind: "color" },
  { key: "numeralFace", cssVar: "--map-numeral-face", kind: "color" },
  { key: "clusterChipBorderRest", cssVar: "--map-cluster-chip-border-rest", kind: "color" },
  { key: "clusterChipInkRest", cssVar: "--map-cluster-chip-ink-rest", kind: "color" },
  { key: "nodeSheenTint", cssVar: "--map-node-sheen-tint", kind: "color" },
  { key: "nodeSheenBlend", cssVar: "--map-node-sheen-blend", kind: "number" },
  { key: "projectHairlineInner", cssVar: "--map-project-hairline-inner", kind: "color" },
  { key: "projectPinTick", cssVar: "--map-project-pin-tick", kind: "color" },
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
  { key: "lightSpeed", cssVar: "--map-light-speed", kind: "number" },
  { key: "lightHopMinMs", cssVar: "--map-light-hop-min-ms", kind: "number" },
  { key: "lightHopMaxMs", cssVar: "--map-light-hop-max-ms", kind: "number" },
  { key: "lightPathMaxMs", cssVar: "--map-light-path-max-ms", kind: "number" },
  { key: "lightTail", cssVar: "--map-light-tail", kind: "number" },
  { key: "lightCorePx", cssVar: "--map-light-core-px", kind: "number" },
  { key: "lightHaloPx", cssVar: "--map-light-halo-px", kind: "number" },
  { key: "lightIntensity", cssVar: "--map-light-intensity", kind: "number" },
  { key: "lightBloomTau", cssVar: "--map-light-bloom-tau", kind: "number" },
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
  { key: "safeInsetBottom", cssVar: "--map-safe-inset-bottom", kind: "number" }
];

/** The token-count contract: the test pins fixture coverage to this value. */
export const ONTOLOGY_MAP_TOKEN_COUNT = TOKEN_SPECS.length;

export class OntologyMapTokenError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `OntologyMap token drift: missing/empty CSS custom propert${
        missing.length === 1 ? "y" : "ies"
      } — ${missing.join(", ")}. Check app/globals.css.`);
        this.missing = missing;
        this.name = "OntologyMapTokenError";
    }
}
/** Resolves every token in TOKEN_SPECS from a `getComputedStyle` result (or a test substitute); one resolving to an empty string throws `OntologyMapTokenError`, so a missing token fails explicitly. */
export function resolveOntologyMapTokens(getPropertyValue: (name: string) => string): OntologyMapTokens {
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
        }
        else {
            result[spec.key] = raw;
        }
    }
    if (missing.length > 0) {
        throw new OntologyMapTokenError(missing);
    }
    return result as unknown as OntologyMapTokens;
}
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
    if (cached)
        return cached;
    cached = readFromElement(element ?? document.documentElement);
    return cached;
}
export function clearOntologyMapTokensCache(): void {
    cached = null;
}
/** The tokens `html[data-topology-index]` changes: exactly what the `collapsed` block in `app/globals.css` redefines. A token added there needs a line here, or that value goes stale alone. */
// The top and bottom lanes follow the viewport height and the right lane the utility rail (half an inset under the agent
// dock); all change the canvas size, so they refresh with the INDEX-dependent left lane on every viewport commit (four reads, not 115).
const INDEX_DEPENDENT_TOKEN_KEYS = ["safeInsetLeft", "safeInsetRight", "safeInsetTop", "safeInsetBottom"] as const;
/**
 * Re-reads only the tokens that depend on `data-topology-index` after an INDEX state transition. A
 * full cache clear would redo 115 reads and force a style recalculation. No-op without a cache.
 */
export function refreshIndexDependentTokens(element?: Element): void {
    if (!cached)
        return;
    if (typeof document === "undefined")
        return;
    const styles = getComputedStyle(element ?? document.documentElement);
    const patch: Record<string, string | number> = {};
    for (const key of INDEX_DEPENDENT_TOKEN_KEYS) {
        const spec = TOKEN_SPECS.find((s) => s.key === key);
        if (!spec)
            continue;
        const raw = styles.getPropertyValue(spec.cssVar).trim();
        if (raw === "")
            continue;
        if (spec.kind === "number") {
            const parsed = Number(raw);
            if (!Number.isNaN(parsed))
                patch[spec.key] = parsed;
        }
        else {
            patch[spec.key] = raw;
        }
    }
    cached = { ...cached, ...patch } as OntologyMapTokens;
}
