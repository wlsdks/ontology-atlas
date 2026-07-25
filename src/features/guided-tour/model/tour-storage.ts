/**
 * 가이드 투어 완료/중단 상태 — 순수 localStorage read/write 헬퍼.
 * `first-run-starter/model/sample-node-hint.ts` 패턴 미러(key 주입 가능,
 * private-mode try/catch 안전 폴백).
 *
 * 중간 단계 저장은 하지 않는다 — 2분짜리 투어라 재진입 시 항상 처음부터
 * (spec §4). 완료 플래그는 재실행을 막지 않는다 — 진입 타일은 항상 동작.
 */
export const GUIDED_TOUR_STATUS_KEY = "guided-tour:v1";

export type GuidedTourStatus = "done" | "skipped";

/**
 * 목적지별 "봤음" 키. 지도(`guided-tour:v1`)와 분리해야 문서함을 본 사람에게
 * 공방 안내가 그대로 뜬다 — 하나로 묶으면 먼저 들어간 화면 하나가 나머지
 * 다섯 개의 안내를 통째로 삼킨다.
 */
export function destinationTourStatusKey(destination: string): string {
  return `guided-tour:${destination}:v1`;
}

export function writeGuidedTourStatus(
  status: GuidedTourStatus,
  key: string = GUIDED_TOUR_STATUS_KEY,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, status);
  } catch {
    /* private mode — skip */
  }
}

/**
 * 저장된 완료/중단 상태 읽기 — 없거나 알 수 없는 값이면 `null`. 첫 방문
 * 자동 시작 판정(HomePage)이 "한 번이라도 done/skipped 를 기록했으면 다시
 * 자동으로 띄우지 않는다" 에 쓴다.
 */
export function readGuidedTourStatus(
  key: string = GUIDED_TOUR_STATUS_KEY,
): GuidedTourStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === "done" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}
