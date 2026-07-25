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

export type CanvasBackground = "dot" | "constellation" | "contour";
export type GlyphSet = "geometric" | "line";

export const CANVAS_BACKGROUNDS: readonly CanvasBackground[] = [
  "dot",
  "constellation",
  "contour",
];
export const GLYPH_SETS: readonly GlyphSet[] = ["geometric", "line"];

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = "dot";
export const DEFAULT_GLYPH_SET: GlyphSet = "geometric";

const CANVAS_BACKGROUND_KEY = "ontology-atlas:canvas-background:v1";
const GLYPH_SET_KEY = "ontology-atlas:glyph-set:v1";

/** 설정 변경 시 같은 탭의 구독자에게 알리는 커스텀 이벤트(cross-tab 은 `storage`). */
const PREFERENCE_EVENT = "ontology-atlas:appearance-preference-change";

function isCanvasBackground(value: string | null): value is CanvasBackground {
  return value !== null && (CANVAS_BACKGROUNDS as readonly string[]).includes(value);
}

function isGlyphSet(value: string | null): value is GlyphSet {
  return value !== null && (GLYPH_SETS as readonly string[]).includes(value);
}

export function readCanvasBackground(): CanvasBackground {
  if (typeof window === "undefined") return DEFAULT_CANVAS_BACKGROUND;
  try {
    const saved = window.localStorage.getItem(CANVAS_BACKGROUND_KEY);
    return isCanvasBackground(saved) ? saved : DEFAULT_CANVAS_BACKGROUND;
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
