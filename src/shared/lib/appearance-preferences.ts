import { useCallback, useSyncExternalStore } from "react";

/**
 * 개인화 환경설정 (Phase 5, `docs/plans/DESIGN-OVERHAUL-2026-07-25.md` #20/#21) —
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
 * ## 셋만 남은 이유 (카운슬 2026-07-29 + 소유자 확정)
 *
 * 후보 열한 개가 전량 기각된 뒤 실측으로 원인이 나왔다: 잉크 **양**이 아니라
 * **형태**였다. 기각된 것들은 전부 선이거나 닫힌 도형 — 노드·관계선과 같은
 * 문법이라 "누가 주인공인가"를 다퉜다. 도트가 살아남은 이유는 정확히 **데이터인
 * 척을 안 해서**다. 그리고 상시 입자는 프레임당 바뀌는 픽셀의 78%가 정보를
 * 나르지 않았다.
 *
 * - `dot` — 정적 청사진 격자. 좌표계가 있다는 것만 말한다.
 * - `web` — 근접 성좌. 유일하게 살아남은 움직이는 배경(소유자 확정).
 * - `depth` — 깊이 도트. 같은 도트를 세 층으로 두고 **카메라에만** 반응한다.
 *   자율 운동이 0이라 유휴 연소가 구조적으로 불가능하다.
 *
 * 폐기: `constellation`(정적 성좌) · `contour`(등고선) · `flow`(흐름장) ·
 * `gravity`(중력장).
 */
export type CanvasBackground = "dot" | "web" | "depth";
export type GlyphSet = "geometric" | "line";

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = ["dot", "web", "depth"];
export const GLYPH_SETS: readonly GlyphSet[] = ["geometric", "line"];

/**
 * 폐기된 값 → 계승자. 저장된 설정을 조용히 기본값으로 떨어뜨리면 **사용자가 고른
 * 것이 소리 없이 사라진다** — 성좌를 고른 사람은 성좌 계열(근접 성좌)로, 등고선을
 * 고른 사람은 남은 정적 배경(도트)으로 데려간다.
 */
const RETIRED_CANVAS_BACKGROUNDS: Readonly<Record<string, CanvasBackground>> = {
  constellation: "web",
  contour: "dot",
  // 2026-07-29 카운슬 + 소유자 확정 — 흐름장·중력장 폐기. 둘 다 움직임을 고른
  // 사람이므로 살아남은 움직이는 배경(근접 성좌)으로 데려간다.
  flow: "web",
  gravity: "web",
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

/* ── 프레임 계기 ─────────────────────────────────────────────────────────── */

/**
 * 지도 위에 프레임 계기를 띄울까.
 *
 * ## 왜 설정에 있고 기본이 꺼짐인가
 *
 * 이건 **진단 도구**지 제품 크롬이 아니다. 지도를 읽으러 온 사람에게 숫자가
 * 상시로 떠 있으면 그건 정보가 아니라 소음이고, 이 앱의 주목 예산은 지도가
 * 가져야 한다. 그래서 발자국과 같은 자리(설정 →「지도」)에 옵트인으로 둔다.
 *
 * ## 왜 만드는가 — 「내 환경에선 안 느린데요」를 끝내려고
 *
 * 2026-07-31 소유자가 노드 드래그 렉을 보고했는데 재현 환경(Playwright
 * Chromium)에서는 프레임 작업이 2.1ms 였다. 녹화 영상의 프레임 타임스탬프로는
 * 150ms 정지가 실재했다 — **같은 코드가 환경에 따라 다르게 아팠다.** 그때
 * 필요한 것은 개발자의 재현이 아니라 **아픈 그 자리에서 나오는 숫자**다.
 * 화면에 숫자가 없으면 성능 논의는 매번 «느낌 vs 다른 사람의 벤치마크» 가 된다.
 */
const FRAME_METER_KEY = "atlas.appearance.frameMeter";

export const DEFAULT_FRAME_METER = false;

export function readFrameMeter(): boolean {
  if (typeof window === "undefined") return DEFAULT_FRAME_METER;
  try {
    return window.localStorage.getItem(FRAME_METER_KEY) === "on";
  } catch {
    return DEFAULT_FRAME_METER;
  }
}

export function writeFrameMeter(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FRAME_METER_KEY, value ? "on" : "off");
  } catch {
    // 위와 동일 — 저장이 막혀도 이벤트로 현재 세션은 갱신된다.
  }
  notifyPreferenceChange();
}

export function useFrameMeter(): boolean {
  const getSnapshot = useCallback(() => readFrameMeter(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_FRAME_METER, []);
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
 * 발자국 색 2택 — 자유 컬러피커가 아니다.
 *
 * 이 지도에서 노랑은 **이미 뜻이 있다**("여기가 중심" — 허브 앰버 `#d4b478`).
 * 발자국을 같은 비트로 칠하면 "이건 중심이다"와 "여기 걸었다"가 한 색이 된다.
 * 그래서 노랑은 쓰되 **같은 계열의 다른 값**(`--color-footprint-trail`)으로 가른다.
 */
export type FootprintTone = "amber" | "indigo";

/**
 * 선 위 자국의 밀도 — 숫자 슬라이더가 아니다.
 *
 * 개수는 선 길이를 균등 분할한 **장식**인데, 숫자로 노출하면 "이 길을 4번
 * 지났다"는 **데이터**로 읽힌다. 화면이 하지 않은 약속을 컨트롤이 대신 하는
 * 셈이라, 2단(성기게/촘촘히)으로만 연다.
 */
export type FootprintEdgeDensity = "sparse" | "dense";

/** 밀도 2단 → 선 하나에 찍히는 자국 수. */
export const FOOTPRINT_EDGE_COUNT: Readonly<Record<FootprintEdgeDensity, number>> = {
  sparse: 2,
  dense: 5,
};

/**
 * 선 위 자국의 크기 배율 — **설정이 아니라 상수**다. 자유롭게 열면 자국 크기와
 * 곱해져 간선 자국이 가장 작은 노드(지름 34px)보다 커지는 상태가 만들어진다.
 */
export const FOOTPRINT_EDGE_SCALE = 0.9;

/**
 * 발자국 표현 설정 — 소유자가 직접 만지는 값들(2026-07-29 지시).
 *
 * **모양은 설정이 아니다.** 신발 자국(양발)로 고정한다 — 모양까지 고르게 하면
 * 사용자마다 다른 그림을 보게 되고, 그러면 "이 표시가 무슨 뜻인가"를 화면이 더
 * 이상 말할 수 없다. 고를 수 있는 것은 **같은 뜻을 얼마나 세게 말하느냐**뿐이다.
 *
 * 소유자가 부른 11값은 8개로 줄었다(카운슬 2026-07-29). 줄인 셋은 전부
 * "값은 있는데 결정이 없던" 것들이다 — 선 자국 크기(고정), 선에서 띄우는 거리
 * (노드와 한 문장으로 통합), 선 자국 수(밀도 2단으로 대체).
 *
 * 이름은 전부 값이 아니라 **보이는 것**으로 짓는다("알파" 대신 "진하기") —
 * 설정 화면은 코드 리뷰가 아니다.
 */
export interface FootprintPreference {
  /** 자국 크기(px) — 한 발의 긴 축 길이. */
  size: number;
  /** 채움 방식 — 끄면 윤곽선(라인아트). */
  filled: boolean;
  /** 테두리 굵기(px). **윤곽선일 때만 화면에 영향이 있다**(채움이면 죽은 값). */
  strokeWidth: number;
  /** 노드·선에서 자국을 띄우는 거리(px). 둘이 한 값인 이유는 사용자에게 한 문장이라서다. */
  gap: number;
  /** 진하기 0..1. */
  opacity: number;
  /** 색 2택. */
  tone: FootprintTone;
  /** 번짐(px) — 0 이 기본. 헌장 예외 1건(정적 헤일로)이라 상한이 낮다. */
  bloom: number;
  /** 선 위에도 자국을 남길지. */
  onEdges: boolean;
  /** 선 위 자국 밀도. */
  edgeDensity: FootprintEdgeDensity;
  /** 선 기준 놓는 자리. */
  placement: FootprintPlacement;
}

export const DEFAULT_FOOTPRINT: FootprintPreference = {
  size: 13,
  filled: true,
  strokeWidth: 1.5,
  gap: 8,
  opacity: 0.7,
  tone: "amber",
  bloom: 0,
  onEdges: true,
  edgeDensity: "dense",
  placement: "right",
};

/**
 * 각 값의 허용 범위 — 슬라이더 min/max 와 저장값 clamp 의 단일 출처.
 *
 * 하한이 넉넉하지 않다: `size` 6px 에서는 신발 자국의 앞꿈치/뒤꿈치가 뭉개져
 * **모양이라는 채널이 죽고**, `opacity` 0.1 은 캔버스 위 유효 대비가 3:1 에
 * 한참 못 미친다(도해 실측). 사용자가 고를 수 있는 범위는 **여전히 읽히는
 * 범위**여야 한다 — 안 보이게 만들 자유는 설정이 아니라 결함이다.
 */
export const FOOTPRINT_RANGES = {
  size: { min: 9, max: 26, step: 1 },
  strokeWidth: { min: 0.5, max: 1.8, step: 0.1 },
  gap: { min: 0, max: 28, step: 1 },
  opacity: { min: 0.5, max: 1, step: 0.05 },
  bloom: { min: 0, max: 6, step: 1 },
} as const satisfies Record<string, { min: number; max: number; step: number }>;

/**
 * 프리셋 3 — 첫 화면에 보이는 것. 11개(지금 8개) 슬라이더를 첫 화면에 쏟으면
 * 고르려는 사람이 아니라 컨트롤이 주목을 가져간다. 세부는 「직접 맞추기」 뒤에 있다.
 */
export const FOOTPRINT_PRESETS = {
  subtle: { size: 10, opacity: 0.5, bloom: 0, edgeDensity: "sparse" },
  default: { size: 13, opacity: 0.7, bloom: 0, edgeDensity: "dense" },
  bold: { size: 17, opacity: 0.95, bloom: 3, edgeDensity: "dense" },
} as const satisfies Record<string, Partial<FootprintPreference>>;

export type FootprintPresetName = keyof typeof FOOTPRINT_PRESETS;

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
    filled: typeof src.filled === "boolean" ? src.filled : DEFAULT_FOOTPRINT.filled,
    strokeWidth: num("strokeWidth"),
    gap: num("gap"),
    opacity: num("opacity"),
    tone: src.tone === "indigo" || src.tone === "amber" ? src.tone : DEFAULT_FOOTPRINT.tone,
    bloom: num("bloom"),
    onEdges: typeof src.onEdges === "boolean" ? src.onEdges : DEFAULT_FOOTPRINT.onEdges,
    edgeDensity:
      src.edgeDensity === "sparse" || src.edgeDensity === "dense"
        ? src.edgeDensity
        : DEFAULT_FOOTPRINT.edgeDensity,
    placement: src.placement === "both" || src.placement === "right" ? src.placement : DEFAULT_FOOTPRINT.placement,
  };
}

/** 프리셋을 현재 설정 위에 얹는다 — 프리셋이 정하지 않은 값(색·배치 등)은 보존한다. */
export function applyFootprintPreset(
  current: FootprintPreference,
  preset: FootprintPresetName,
): FootprintPreference {
  return resolveFootprint({ ...current, ...FOOTPRINT_PRESETS[preset] });
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
