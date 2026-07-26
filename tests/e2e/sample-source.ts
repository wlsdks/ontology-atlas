import type { Page } from '@playwright/test';

/** 첫 실행 카드의 샘플 선택이 저장되는 자리 — `src/shared/lib/sample-source.ts` 와 같은 키. */
const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

/**
 * 이 spec 이 **dogfood 샘플**(이 앱 자신의 코드 지도)에서 돌아야 한다고 선언한다.
 *
 * 2026-07-26 에 기본 샘플이 dogfood → 예시 비즈니스로 바뀌었다. 그때 세 spec 이
 * 한꺼번에 깨졌는데, 전부 dogfood 전용 데이터(문서 제목 · 프로젝트 이름 ·
 * `?p=` 딥링크 슬러그)를 박아 두고 **그게 기본값이라는 사실에 조용히 기대고**
 * 있었다. 테스트의 주제는 "기본값이 dogfood 다" 가 아니라 "dogfood 데이터에서
 * 이게 동작한다" 이므로, 기대는 것 대신 **명시 선택**하게 한다.
 *
 * `goto` 보다 먼저 불러야 한다 — 앱이 첫 렌더에서 이 값을 읽는다.
 */
export async function useDogfoodSample(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode — 기본값으로 떨어지고 spec 이 알아서 실패한다 */
      }
    },
    [SAMPLE_SOURCE_KEY, 'dogfood'] as const,
  );
}
