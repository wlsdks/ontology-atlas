import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **문서(html)는 스크롤하지 않는다 — 뷰포트는 셸이 소유한다.**
 *
 * ## 무엇이 났나 (2026-08-08 반응형 전수 실측)
 *
 * 관문(`/`)에서 「받아도 되는 이유」를 펼치고 휠로 끝까지 내리면 **화면 전체가
 * 빈 검정**이 됐다 (600×900 실측: 푸터가 뷰포트 위로 −270px, 문서 scrollHeight
 * 862→1970). 본문은 셸의 내부 스크롤 슬롯이 갖고 있는데 문서 자체도 스크롤
 * 범위를 얻어 **이중 스크롤**이 됐고, 휠 체이닝이 내부를 다 쓰고 나면 문서를
 * 콘텐츠 전체 너머로 밀었다.
 *
 * ## 원인 둘 — 이 스펙이 재는 성질의 반례들
 *
 * 1. **positioned 조상이 없는 `absolute` 원소는 문서를 늘린다.** 펼친 내용 속
 *    `sr-only`(= `position:absolute`) 스팬의 위치 기준이 — 셸 루트가 `static`
 *    이라 — **뷰포트**가 됐고, 정적 `overflow-hidden` 은 자기 containing block
 *    이 아닌 원소를 자르지 못하므로 문서 스크롤 범위가 그 스팬까지 늘었다.
 *    수리: 셸 루트에 `relative` — 이후 어떤 absolute 원소도 문서를 못 늘린다.
 * 2. **body 의 탭바 예약 패딩(56px)은 셸 이전 시대의 유산이다** (2026-04-30
 *    최초 임포트부터). 셸이 `h-dvh` 로 뷰포트를 소유한 지금, 그 패딩은 아무
 *    것도 보호하지 않으면서 `<md` 전 페이지에 56px 의 죽은 문서 스크롤을 만든다.
 *
 * ## 왜 이 모양의 게이트인가
 *
 * `scroll-end-gap.spec.ts` 는 **닫힌 기본 상태**의 스크롤 끝 여백을 잰다 —
 * 접힘 표면을 펼친 상태는 재지 않았고, 그래서 이 결함군은 그 게이트를 영원히
 * 통과했다. 여기서는 상태를 바꿔 가며(펼침 포함) **문서 스크롤 범위가 0** 인지
 * 하나만 잰다. 성질이 하나면 반례도 명확하다: 문서가 1px 이라도 스크롤되면
 * 어떤 원소가 뷰포트 밖으로 샌 것이다.
 */

const WIDTHS = [
  { w: 600, h: 900 },
  { w: 1440, h: 900 },
] as const;

const ROUTES = ["/ko/?guides=off", "/ko/topology/?guides=off", "/ko/docs/?guides=off"] as const;

async function documentScrollSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - el.clientHeight;
  });
}

test.describe("문서 스크롤 잠금 — 셸이 뷰포트를 소유한다", () => {
  for (const { w, h } of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} @ ${w}×${h} — 문서 스크롤 범위 0`, async ({ page }) => {
        await seedFirstRunSeen(page);
        await page.setViewportSize({ width: w, height: h });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        // 관문은 Suspense 교체 창에 <main> 이 잠깐 2개다 — first() 로 준비만 확인.
        await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
        // hydration 이 레이아웃을 흔들 수 있다 — 정착값을 폴링한다.
        await expect
          .poll(() => documentScrollSlack(page), { timeout: 10_000 })
          .toBeLessThanOrEqual(0);
      });
    }

    /*
     * [삭제 2026-08-19] 「관문 「받아도 되는 이유」 … 문서는 안 자란다」.
     *
     * 주어(`download-trust` 검증 레일 + 그 안의 체크섬 복사 버튼)가 설치 절과
     * 함께 사라졌다 — 소유자: *"맨 마지막 이거는 없어도 될듯? 어차피 맨 위에
     * 다 있어서"*. 이 시험이 지키던 성질(관문에서 가장 긴 상태에서도 문서
     * 스크롤 여유가 0)은 위 루프의 `/ko/?guides=off` 시험이 그대로 진다 —
     * 관문에서 가장 긴 상태가 이제 그 첫 페인트다.
     */
  }
});
