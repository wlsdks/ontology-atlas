/**
 * `--topology-v2-*` 토큰 리더 (`docs/TOPOLOGY-V2-DESIGN.md` §2).
 *
 * Canvas 2D 는 CSS 변수를 직접 소비하지 못한다 — `getComputedStyle` 로 1회
 * 해석해 JS 값(색 문자열 / 숫자)으로 캐싱한다(Design Guardian verdict a4 의
 * `skeletonInkRef` 해석-캐시 패턴 재사용). 값의 진실원은 여전히
 * `app/globals.css` 하나 — 이 파일은 읽기 전용 어댑터다.
 *
 * 토큰 drift 가드: §2 표에 있는 81개 토큰(C1 — camera-max/min-zoom-ratio +
 * drag-tug-1hop/2hop 4종 추가) 중 하나라도 빈 문자열로 해석되면
 * (= `app/globals.css` 에서 삭제/오타) 조용히 기본값으로 폴백하지 않고
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

  // 2.2 엣지 · 라벨 · 배경
  edgeContains: string;
  edgeDepends: string;
  edgeDim: string;
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
  edgeBowContains: number;
  edgeBowDepends: number;
  edgeBlendContains: number;
  edgeBlendDepends: number;
  starCount: number;
  dustAreaPerPoint: number;

  // 2.4 모션 · 카메라
  cameraSpringAngFreq: number;
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
  rippleStaggerMs: number;
  breatheAmplitude: number;
  breatheFreqRad: number;
  pulseDurationMs: number;
  tipFadeMs: number;
  edgePulseSpeed: number;
  edgePulseSpeedEgo: number;
  /** `--topology-v2-drag-tug-1hop` — 1-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug1Hop: number;
  /** `--topology-v2-drag-tug-2hop` — 2-hop neighbor displacement factor during node drag (`interaction/drag-tug.ts`). */
  dragTug2Hop: number;

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

  { key: "edgeContains", cssVar: "--topology-v2-edge-contains", kind: "color" },
  { key: "edgeDepends", cssVar: "--topology-v2-edge-depends", kind: "color" },
  { key: "edgeDim", cssVar: "--topology-v2-edge-dim", kind: "color" },
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
  { key: "edgeBowContains", cssVar: "--topology-v2-edge-bow-contains", kind: "number" },
  { key: "edgeBowDepends", cssVar: "--topology-v2-edge-bow-depends", kind: "number" },
  { key: "edgeBlendContains", cssVar: "--topology-v2-edge-blend-contains", kind: "number" },
  { key: "edgeBlendDepends", cssVar: "--topology-v2-edge-blend-depends", kind: "number" },
  { key: "starCount", cssVar: "--topology-v2-star-count", kind: "number" },
  { key: "dustAreaPerPoint", cssVar: "--topology-v2-dust-area-per-point", kind: "number" },

  { key: "cameraSpringAngFreq", cssVar: "--topology-v2-camera-spring-angfreq", kind: "number" },
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
  { key: "rippleStaggerMs", cssVar: "--topology-v2-ripple-stagger-ms", kind: "number" },
  { key: "breatheAmplitude", cssVar: "--topology-v2-breathe-amplitude", kind: "number" },
  { key: "breatheFreqRad", cssVar: "--topology-v2-breathe-freq-rad", kind: "number" },
  { key: "pulseDurationMs", cssVar: "--topology-v2-pulse-duration-ms", kind: "number" },
  { key: "tipFadeMs", cssVar: "--topology-v2-tip-fade-ms", kind: "number" },
  { key: "edgePulseSpeed", cssVar: "--topology-v2-edge-pulse-speed", kind: "number" },
  { key: "edgePulseSpeedEgo", cssVar: "--topology-v2-edge-pulse-speed-ego", kind: "number" },
  { key: "dragTug1Hop", cssVar: "--topology-v2-drag-tug-1hop", kind: "number" },
  { key: "dragTug2Hop", cssVar: "--topology-v2-drag-tug-2hop", kind: "number" },

  { key: "safeInsetLeft", cssVar: "--topology-v2-safe-inset-left", kind: "number" },
  { key: "safeInsetRight", cssVar: "--topology-v2-safe-inset-right", kind: "number" },
  { key: "safeInsetTop", cssVar: "--topology-v2-safe-inset-top", kind: "number" },
  { key: "safeInsetBottom", cssVar: "--topology-v2-safe-inset-bottom", kind: "number" },
];

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
 * `getComputedStyle` 결과(또는 테스트용 대체 함수)에서 77개 토큰 전부를
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
