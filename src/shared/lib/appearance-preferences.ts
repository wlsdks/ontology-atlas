import { useCallback, useSyncExternalStore } from "react";

/**
 * 개인화 환경설정 (Phase 5, `docs/DESIGN-OVERHAUL-2026-07-25.md` #20/#21) —
 * 지도 캔버스 배경 3종과 노드 아이콘 세트 2종을 로컬에 저장하고, 모든 표면이
 * 같은 값을 실시간으로 읽는 단일 진실원.
 *
 * 왜 별도 스토어인가: 값이 지도 캔버스(비-React 렌더러)와 DOM 글리프
 * (INDEX·공방·팝오버 등 여러 위젯)에서 동시에 읽혀야 하고, 설정에서 바꾸면
 * 두 표면이 함께 즉시 바뀌어야 한다("한 표면만 안 바뀌면 결함", fable). Context
 * 프로바이더를 앱 전역에 두르는 대신, localStorage 를 진실원으로 두고
 * `useSyncExternalStore` 구독 + 커스텀 이벤트로 라이브 갱신한다 —
 * `docs-vault-local` / `audiencePlain` 선례와 같은 로컬-퍼스트 지속 문법.
 *
 * 지속은 localStorage 뿐(백엔드 0). SSR/정적 export 프리렌더에서는 기본값을
 * 반환해 hydration 불일치를 피한다(`getServerSnapshot`).
 */

/**
 * 지도 바닥 4종 — 도트(정적 기본) + 움직이는 셋.
 *
 * 구 `"constellation"`(정적 성좌) · `"contour"`(등고선)는 2026-07-29 소유자
 * 확정으로 **폐기**됐다. 등고선은 이 그래프에 없는 높이를 암시했고, 정적 성좌는
 * 도트가 이미 하는 일을 더 비싸게 반복했다. 배경 대체 근거는
 * `render/animated-background.ts` 의 헤더.
 */
export type CanvasBackground = "dot" | "flow" | "web" | "gravity";
export type GlyphSet = "geometric" | "line";

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = ["dot", "flow", "web", "gravity"];
export const GLYPH_SETS: readonly GlyphSet[] = ["geometric", "line"];

/**
 * 폐기된 값 → 계승자. 저장된 설정을 조용히 기본값으로 떨어뜨리면 **사용자가 고른
 * 것이 소리 없이 사라진다** — 성좌를 고른 사람은 성좌 계열(근접 성좌)로, 등고선을
 * 고른 사람은 남은 정적 배경(도트)으로 데려간다.
 */
const RETIRED_CANVAS_BACKGROUNDS: Readonly<Record<string, CanvasBackground>> = {
  constellation: "web",
  contour: "dot",
};

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = "dot";
export const DEFAULT_GLYPH_SET: GlyphSet = "geometric";

const CANVAS_BACKGROUND_KEY = "ontology-atlas:canvas-background:v1";
const GLYPH_SET_KEY = "ontology-atlas:glyph-set:v1";
const FOOTPRINT_KEY = "ontology-atlas:footprint:v1";

/** 설정 변경 시 같은 탭의 구독자에게 알리는 커스텀 이벤트(cross-tab 은 `storage`). */
const PREFERENCE_EVENT = "ontology-atlas:appearance-preference-change";

function isCanvasBackground(value: string | null): value is CanvasBackground {
  return value !== null && (CANVAS_BACKGROUNDS as readonly string[]).includes(value);
}

function isGlyphSet(value: string | null): value is GlyphSet {
  return value !== null && (GLYPH_SETS as readonly string[]).includes(value);
}

/** 저장값 → 살아 있는 값. 폐기된 값은 계승자로, 모르는 값은 기본값으로. 순수 함수. */
export function resolveCanvasBackground(saved: string | null): CanvasBackground {
  if (isCanvasBackground(saved)) return saved;
  if (saved !== null && saved in RETIRED_CANVAS_BACKGROUNDS) return RETIRED_CANVAS_BACKGROUNDS[saved];
  return DEFAULT_CANVAS_BACKGROUND;
}

export function readCanvasBackground(): CanvasBackground {
  if (typeof window === "undefined") return DEFAULT_CANVAS_BACKGROUND;
  try {
    return resolveCanvasBackground(window.localStorage.getItem(CANVAS_BACKGROUND_KEY));
  } catch {
    return DEFAULT_CANVAS_BACKGROUND;
  }
}

export function readGlyphSet(): GlyphSet {
  if (typeof window === "undefined") return DEFAULT_GLYPH_SET;
  try {
    const saved = window.localStorage.getItem(GLYPH_SET_KEY);
    return isGlyphSet(saved) ? saved : DEFAULT_GLYPH_SET;
  } catch {
    return DEFAULT_GLYPH_SET;
  }
}

function notifyPreferenceChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT));
}

export function writeCanvasBackground(value: CanvasBackground): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_BACKGROUND_KEY, value);
  } catch {
    // localStorage 불가(프라이빗 모드 등) — 세션 내 이벤트만으로도 라이브 갱신은 된다.
  }
  notifyPreferenceChange();
}

export function writeGlyphSet(value: GlyphSet): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLYPH_SET_KEY, value);
  } catch {
    // 위와 동일 — 저장 실패해도 이벤트로 현재 세션은 갱신된다.
  }
  notifyPreferenceChange();
}

/** 같은 탭 커스텀 이벤트 + cross-tab `storage` 이벤트 둘 다 구독. */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCanvasBackground(): CanvasBackground {
  const getSnapshot = useCallback(() => readCanvasBackground(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_CANVAS_BACKGROUND, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useGlyphSet(): GlyphSet {
  const getSnapshot = useCallback(() => readGlyphSet(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GLYPH_SET, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ── 발자국 (걸어온 길) ──────────────────────────────────────────────────── */

/**
 * 발자국을 어디에 놓는가.
 *
 * - `right` — 진행 방향 기준 **오른쪽 한 줄**. 선을 가리지 않고 "지나갔다"만 말한다.
 * - `both` — 선을 가운데 두고 **좌우 번갈아**. 걷는 사람의 보행에 가장 가깝다.
 */
export type FootprintPlacement = "right" | "both";

/**
 * 발자국 표현 설정 — 소유자가 직접 만지는 값들(2026-07-29 지시).
 *
 * **모양은 설정이 아니다.** 신발 자국(양발)로 고정한다 — 모양까지 고르게 하면
 * 사용자마다 다른 그림을 보게 되고, 그러면 "이 표시가 무슨 뜻인가"를 화면이 더
 * 이상 말할 수 없다. 고를 수 있는 것은 **같은 뜻을 얼마나 세게 말하느냐**뿐이다.
 *
 * 이름은 전부 값이 아니라 **보이는 것**으로 짓는다("알파" 대신 "진하기",
 * "선에서" 대신 "선에서 떨어진 거리") — 설정 화면은 코드 리뷰가 아니다.
 */
export interface FootprintPreference {
  /** 발자국 크기(px) — 한 발의 긴 축 길이. */
  size: number;
  /** 테두리 굵기(px). */
  strokeWidth: number;
  /** 안을 채울지 — 끄면 라인아트. */
  filled: boolean;
  /** 노드에서 떨어진 거리(px). */
  nodeGap: number;
  /** 진하기 0..1. */
  opacity: number;
  /** 번짐(px) — 0 이 기본. 헌장상 글로우는 금지라 기본은 항상 0이다. */
  bloom: number;
  /** 선 위에도 발자국을 남길지. */
  onEdges: boolean;
  /** 선 하나에 남기는 발자국 수. */
  perEdge: number;
  /** 선 기준 놓는 자리. */
  placement: FootprintPlacement;
  /** 선에서 떨어진 거리(px). */
  edgeGap: number;
  /** 선 위 발자국 크기 배율 — 노드 옆 발자국 대비. */
  edgeScale: number;
}

export const DEFAULT_FOOTPRINT: FootprintPreference = {
  size: 13,
  strokeWidth: 1.5,
  filled: true,
  nodeGap: 8,
  opacity: 0.7,
  bloom: 0,
  onEdges: true,
  perEdge: 4,
  placement: "right",
  edgeGap: 10,
  edgeScale: 1,
};

/** 각 값의 허용 범위 — 슬라이더 min/max 와 저장값 clamp 의 단일 출처. */
export const FOOTPRINT_RANGES = {
  size: { min: 6, max: 26, step: 1 },
  strokeWidth: { min: 0.5, max: 3, step: 0.1 },
  nodeGap: { min: 0, max: 28, step: 1 },
  opacity: { min: 0.1, max: 1, step: 0.05 },
  bloom: { min: 0, max: 12, step: 1 },
  perEdge: { min: 1, max: 8, step: 1 },
  edgeGap: { min: 2, max: 26, step: 1 },
  edgeScale: { min: 0.5, max: 1.6, step: 0.05 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * 저장된 JSON → 유효한 설정. 범위 밖 값은 잘라 넣고, 없는 키는 기본값으로 채운다.
 * 순수 함수(테스트 대상) — 손으로 편집된 localStorage 나 구버전 값이 렌더러에
 * `NaN` 을 흘리면 발자국이 통째로 사라지는데, 그 실패는 조용하다.
 */
export function resolveFootprint(raw: unknown): FootprintPreference {
  if (typeof raw !== "object" || raw === null) return DEFAULT_FOOTPRINT;
  const src = raw as Record<string, unknown>;
  const num = (key: keyof typeof FOOTPRINT_RANGES): number => {
    const v = src[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_FOOTPRINT[key];
    return clamp(v, FOOTPRINT_RANGES[key].min, FOOTPRINT_RANGES[key].max);
  };
  return {
    size: num("size"),
    strokeWidth: num("strokeWidth"),
    filled: typeof src.filled === "boolean" ? src.filled : DEFAULT_FOOTPRINT.filled,
    nodeGap: num("nodeGap"),
    opacity: num("opacity"),
    bloom: num("bloom"),
    onEdges: typeof src.onEdges === "boolean" ? src.onEdges : DEFAULT_FOOTPRINT.onEdges,
    perEdge: num("perEdge"),
    placement: src.placement === "both" || src.placement === "right" ? src.placement : DEFAULT_FOOTPRINT.placement,
    edgeGap: num("edgeGap"),
    edgeScale: num("edgeScale"),
  };
}

export function readFootprint(): FootprintPreference {
  if (typeof window === "undefined") return DEFAULT_FOOTPRINT;
  try {
    const saved = window.localStorage.getItem(FOOTPRINT_KEY);
    return saved === null ? DEFAULT_FOOTPRINT : resolveFootprint(JSON.parse(saved));
  } catch {
    return DEFAULT_FOOTPRINT;
  }
}

export function writeFootprint(value: FootprintPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOOTPRINT_KEY, JSON.stringify(resolveFootprint(value)));
  } catch {
    // 위와 동일 — 저장 실패해도 이벤트로 현재 세션은 갱신된다.
  }
  notifyPreferenceChange();
}

/**
 * 훅은 **매 호출 새 객체를 만들면 안 된다** — `useSyncExternalStore` 는 스냅샷을
 * `Object.is` 로 비교하므로 새 객체를 돌려주면 매 렌더 재구독 → 무한 렌더가 된다.
 * 그래서 파싱 결과를 저장 문자열로 캐시한다.
 */
let footprintCacheKey: string | null = null;
let footprintCacheValue: FootprintPreference = DEFAULT_FOOTPRINT;

function footprintSnapshot(): FootprintPreference {
  if (typeof window === "undefined") return DEFAULT_FOOTPRINT;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(FOOTPRINT_KEY);
  } catch {
    return DEFAULT_FOOTPRINT;
  }
  if (raw === footprintCacheKey) return footprintCacheValue;
  footprintCacheKey = raw;
  footprintCacheValue = readFootprint();
  return footprintCacheValue;
}

export function useFootprint(): FootprintPreference {
  const getSnapshot = useCallback(() => footprintSnapshot(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_FOOTPRINT, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
