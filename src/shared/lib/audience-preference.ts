import { useCallback, useSyncExternalStore } from "react";

/**
 * 비개발(plain) 관객 모드 — 개발자 크롬(기록 · Atlas Git 등)을 숨긴다.
 *
 * 원래 `HomePage` 안에 지역 상태로만 있었다. 레일 하단 유틸 티어를 셸로 올리면서
 * (#65) 셸도 같은 값을 읽어야 해서 공용 스토어로 승격했다 — 두 곳이 각자
 * localStorage 를 읽으면 설정에서 바꿨을 때 한쪽만 갱신되는 고전적 drift 가 난다.
 *
 * `appearance-preferences` 와 같은 로컬-퍼스트 지속 문법: localStorage 가 진실원,
 * `useSyncExternalStore` 구독 + 커스텀 이벤트로 같은 탭 라이브 갱신. SSR/정적
 * export 프리렌더에서는 false 를 반환해 hydration 불일치를 피한다.
 */

const AUDIENCE_PLAIN_KEY = "demo:audience-plain:v1";
const AUDIENCE_EVENT = "ontology-atlas:audience-preference-change";

export function readAudiencePlain(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUDIENCE_PLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAudiencePlain(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIENCE_PLAIN_KEY, next ? "1" : "0");
  } catch {
    /* private mode — session-only, no persistence */
  }
  window.dispatchEvent(new Event(AUDIENCE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AUDIENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUDIENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

/** 현재 plain 모드 값 + setter. 어느 표면에서 바꿔도 모든 구독자가 함께 바뀐다. */
export function useAudiencePlain(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readAudiencePlain, getServerSnapshot);
  const set = useCallback((next: boolean) => writeAudiencePlain(next), []);
  return [value, set];
}
