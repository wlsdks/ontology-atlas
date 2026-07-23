/**
 * `--topology-v2-*` 토큰 리더 (`docs/TOPOLOGY-V2-DESIGN.md` §2).
 *
 * Canvas 2D 는 CSS 변수를 직접 소비하지 못한다 — `getComputedStyle` 로 1회
 * 해석해 JS 값(색 문자열 / 숫자)으로 캐싱한다(Design Guardian verdict a4 의
 * `skeletonInkRef` 해석-캐시 패턴 재사용). 값의 진실원은 여전히
 * `app/globals.css` 하나 — 이 파일은 읽기 전용 어댑터다.
 *
 * 토큰 drift 가드: §2 표의 토큰 전부(정확한 개수는 TOKEN_SPECS.length 가 진실원 — 테스트가 계약으로 고정)(C1 — camera-max/min-zoom-ratio +
 * drag-tug-1hop/2hop 4종 추가, dive-zoom fix — camera-spring-angfreq 를
 * -interactive/-transition 둘로 분리해 순증 1; canvas-emphasis 슬라이스 — 프로젝트
 * 헥사곤 이중 헤어라인/핀틱 2종 + 선택 링/선택 헤어라인/호버 링 3종 + 선택
 * 펄스 duration 1종, 순증 6) 중 하나라도 빈 문자열로 해석되면(=
 * `app/globals.css` 에서 삭제/오타) 조용히 기본값으로 폴백하지 않고
 * `TopologyV2TokenError` 를 던진다 — 누락을 "감"으로 흡수하지 않기 위해.
 */

export interface TopologyV2Tokens {
  // 2.1 노드 표면 (kind별 fill/stroke tier)
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
  numeralShadow: string;
  numeralFace: string;
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
  /** Design Guardian 처방 L — 호버 shimmer 아크 길이(둘레 비율, `--topology-v2-hover-shimmer-seg`). */
  hoverShimmerSeg: number;
  /** Design Guardian 처방 L — 호버 shimmer 1회전 주기(ms, `--topology-v2-hover-shimmer-period-ms`). */
  hoverShimmerPeriodMs: number;

  // 2.2 엣지 · 라벨 · 배경
  edgeContains: string;
  edgeDepends: string;
  edgeDim: string;
  /** 엣지 선택(페어 포커스) 스트로크 — 인디고 pale 사다리 (노드 선택 표준 인디고와 값으로 구분). */
  edgeSelected: string;
  hullStroke: string;
  labelProject: string;
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
  labelMaxWidth: number;
  canvasBgNear: string;
  canvasBgFar: string;
  gridMinor: string;
  gridMajor: string;
  vignetteBaseAlpha: number;
  vignetteFarAlpha: number;

  // 2.3 지오메트리 (반지름 · 레이아웃 · 모서리)
  radiusProject: number;
  radiusDomain: number;
  radiusCapability: number;
  radiusElement: number;
  layoutRingDomain: number;
  layoutRingCapability: number;
  layoutRingElement: number;
  /** `--topology-v2-realm-fill-radius-1` — 영역 전개 maxDepth=1 서브트리의 도메인 링(월드 유닛, `model/realm.ts#realmRingsForDepth`). */
  realmFillRadius1: number;
  /** `--topology-v2-realm-fill-radius-2` — 영역 전개 maxDepth=2 서브트리의 도메인 링. */
  realmFillRadius2: number;
  /** `--topology-v2-realm-fill-radius-3` — 영역 전개 maxDepth≥3 서브트리의 도메인 링(= 전역 스파인 링과 동일). */
  realmFillRadius3: number;
  edgeBowContains: number;
  edgeBowDepends: number;
  edgeBlendContains: number;
  edgeBlendDepends: number;
  starCount: number;
  dustAreaPerPoint: number;

  // 2.4 모션 · 카메라
  /**
   * `--topology-v2-camera-spring-angfreq-interactive` — dive-zoom fix (owner:
   * "줌 인/아웃이 느림"). Drives the scale axis (and pan while wheel-zooming)
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
  /** `--topology-v2-camera-max-zoom-ratio` — the viewport-relative ceiling `computeEffectiveCameraScaleMax` derives the real zoom-in bound from (see that function's JSDoc for the audit finding this fixes). */
  cameraMaxZoomRatio: number;
  /** `--topology-v2-camera-min-zoom-ratio` — the viewport-relative floor `computeEffectiveCameraScaleMin` derives the real zoom-out bound from. */
  cameraMinZoomRatio: number;
  cameraFocusPanMargin: number;
  altitudeFarHighRatio: number;
  altitudeFarLowRatio: number;
  overviewEntryRatio: number;
  focusFitMaxScale: number;
  focusBboxMargin: number;
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
   * `--topology-v2-spotlight-rest-alpha` — 최근 변경 스포트라이트 렌즈 ON 일 때
   * 창 밖 노드/엣지가 가라앉는 목표 알파(협의회 설계 2026-07-23). ego dim 보다
   * 옅게 유지해 전체-지도 렌즈에서 구조 맥락이 계속 읽히게 한다. 켜고 끄는
   * 전이는 기존 `focusDimTau` 램프를 재사용한다(신규 easing 0).
   */
  spotlightRestAlpha: number;
  /** `--topology-v2-spotlight-ring-speed` — 변경-노드 파선 링 회전 속도(px/ms). */
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
  /** `--topology-v2-radius-magnitude-k` — √childCount magnitude encoding strength for domain/capability radii (S2 파트 2; +40% 상한). */
  radiusMagnitudeK: number;
  /** `--topology-v2-dust-parallax-min/max` — dust 시차 깊이 범위 (B3 잔여). */
  dustParallaxMin: number;
  dustParallaxMax: number;

  // 2.5 안전 영역 (fixed chrome inset, px — 라벨 컬링 + 카메라 fit)
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

/** §2 표 순서 그대로 — 신규 토큰 추가 시 이 배열 + globals.css 양쪽 갱신. */
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
  { key: "numeralShadow", cssVar: "--topology-v2-numeral-shadow", kind: "color" },
  { key: "numeralFace", cssVar: "--topology-v2-numeral-face", kind: "color" },
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
  { key: "cameraMaxZoomRatio", cssVar: "--topology-v2-camera-max-zoom-ratio", kind: "number" },
  { key: "cameraMinZoomRatio", cssVar: "--topology-v2-camera-min-zoom-ratio", kind: "number" },
  { key: "cameraFocusPanMargin", cssVar: "--topology-v2-camera-focus-pan-margin", kind: "number" },
  { key: "altitudeFarHighRatio", cssVar: "--topology-v2-altitude-far-high-ratio", kind: "number" },
  { key: "altitudeFarLowRatio", cssVar: "--topology-v2-altitude-far-low-ratio", kind: "number" },
  { key: "overviewEntryRatio", cssVar: "--topology-v2-overview-entry-ratio", kind: "number" },
  { key: "focusFitMaxScale", cssVar: "--topology-v2-focus-fit-max-scale", kind: "number" },
  { key: "focusBboxMargin", cssVar: "--topology-v2-focus-bbox-margin", kind: "number" },
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

  { key: "safeInsetLeft", cssVar: "--topology-v2-safe-inset-left", kind: "number" },
  { key: "safeInsetRight", cssVar: "--topology-v2-safe-inset-right", kind: "number" },
  { key: "safeInsetTop", cssVar: "--topology-v2-safe-inset-top", kind: "number" },
  { key: "safeInsetBottom", cssVar: "--topology-v2-safe-inset-bottom", kind: "number" },
];

/** 토큰 개수 계약 — 주석 속 숫자가 아니라 이 값이 진실원 (테스트가 픽스처 커버리지를 이 값에 고정). */
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
 * `getComputedStyle` 결과(또는 테스트용 대체 함수)에서 TOKEN_SPECS 의 토큰 전부를
 * 해석한다. 하나라도 빈 문자열이면 `TopologyV2TokenError` 를 던진다 — 이게
 * §2.3 "누락 시 명시적 실패" 계약.
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

/** `document.documentElement` 의 computed style 을 어댑터로 감싼다. */
function readFromElement(element: Element): TopologyV2Tokens {
  const styles = getComputedStyle(element);
  return resolveTopologyV2Tokens((name) => styles.getPropertyValue(name));
}

let cached: TopologyV2Tokens | null = null;

/**
 * 캐시된 토큰 읽기 — 마운트 시 1회만 `getComputedStyle` 을 호출하고, 이후엔
 * 캐시를 반환한다. 다크/라이트 테마 전환처럼 토큰 값이 바뀔 수 있는 지점에서는
 * `clearTopologyV2TokensCache()` 를 먼저 호출한다.
 */
export function getTopologyV2Tokens(element?: Element): TopologyV2Tokens {
  if (cached) return cached;
  cached = readFromElement(element ?? document.documentElement);
  return cached;
}

/** 테마 전환 / 테스트 격리용 캐시 무효화. */
export function clearTopologyV2TokensCache(): void {
  cached = null;
}
