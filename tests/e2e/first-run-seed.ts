import type { Page } from "@playwright/test";
import { DESTINATION_TOURS } from "../../src/features/guided-tour/model/tour-steps";
import { destinationTourStatusKey } from "../../src/features/guided-tour/model/tour-storage";

/**
 * "첫 방문 자동 표면을 이미 본 사용자" 로 세션을 시작한다.
 *
 * 왜 필요한가: 지도와 다섯 목적지(문서함·공방·인사이트·프로젝트·기록)는 첫
 * 방문에 스크림 + 카드로 화면을 덮는 안내를 자동으로 띄운다. 그 자체는 의도된
 * 동작이지만, **돌아온 사용자의 화면**을 검증하는 스펙에서는 그 오버레이가
 * 클릭을 삼켜 느린 러너에서만 터지는 타임아웃이 된다(2026-07-26 CI 실측:
 * 문서 목록 펼치기 버튼이 문서함 안내에 가려 60초 타임아웃).
 *
 * 키 목록을 스펙마다 손으로 적으면 목적지가 늘 때 조용히 썩으므로
 * `DESTINATION_TOURS` 에서 직접 파생한다 — 안내를 추가하면 시드도 같이 는다.
 *
 * 안내 자체의 회귀는 `guided-tour.spec.ts`(수동 진입)와
 * `responsive-overflow-audit.spec.ts`(자동 진입 시 오버레이 배타)가 검증한다.
 */
export const FIRST_RUN_SEEN_ENTRIES: readonly (readonly [string, string])[] = [
  // 폴더-우선 안내 시트 — 이 키만 '1' 을 읽는다.
  ["vault-open-guide:auto:v1", "1"],
  // 지도의 8단계 여정.
  ["guided-tour:v1", "done"],
  ...Object.keys(DESTINATION_TOURS).map(
    (id) => [destinationTourStatusKey(id), "done"] as const,
  ),
];

export async function seedFirstRunSeen(page: Page): Promise<void> {
  await page.addInitScript((entries: readonly (readonly [string, string])[]) => {
    for (const [key, value] of entries) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode */
      }
    }
  }, FIRST_RUN_SEEN_ENTRIES);
}
