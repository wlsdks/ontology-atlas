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

export function readGuidedTourStatus(
  key: string = GUIDED_TOUR_STATUS_KEY,
): GuidedTourStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(key);
    return v === "done" || v === "skipped" ? v : null;
  } catch {
    // private mode 등 — 매번 새 투어로 보이는 것뿐, 안전한 폴백.
    return null;
  }
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
