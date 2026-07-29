import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **관문의 그리드는 한 벌이다** — 폭이 독립 변수라 lint 도 jsdom 도 못 잰다.
 *
 * ## 이 게이트가 막는 회귀
 *
 * 2026-07-29 실측: `/download` 는 판을 무대 **왼쪽에 붙이는** 설계인데, 판을
 * 감싼 래퍼가 본문과 같은 `mx-auto max-w-[var(--page-max)]` 를 쓰고 있었다.
 * 그래서 판의 x 가 뷰포트 폭의 함수가 됐다:
 *
 * | 폭 | 판 오른끝 | 카메라가 예약한 인셋 | 어긋남 |
 * |---|---|---|---|
 * | 1512 | 520 | 544 | 0 (여기서만 맞았다) |
 * | 1920 | 640 | 544 | **+96** |
 * | 2560 | 960 | 544 | **+416** |
 *
 * 카메라는 토큰이 말한 544 만 피하므로, 넓은 화면일수록 그래프가 판 뒤로
 * 파고든다. **한 폭에서 눈으로 맞춰 놓으면 나머지 폭에서 조용히 틀리는**
 * 종류라 사람 검수를 통과한다.
 *
 * 게다가 바닥 절은 `--page-col-utility` 로 한 번 더 중앙정렬돼 있어서, 같은
 * 페이지 안에 정렬 기준이 **둘**이었다(1920 에서 판 x=160 · 바닥 x=480).
 *
 * ## 무엇을 재나
 *
 * 1. GNB 로고 · 헤드라인 · 판 · 캡션 · 설치 띠 · 푸터의 x 가 **전부 같다**.
 * 2. 판의 오른끝이 카메라 인셋 안에 든다(`plate.right + 갭 ≤ safeInsetLeft`).
 * 3. 첫 화면 약속 폭에서 **세로 스크롤 0**.
 * 4. 판 안의 어떤 컨트롤도 판의 안쪽 폭을 넘지 않는다(ko/en 둘 다).
 */

/**
 * ⚠️ **홈통 값을 여기 베끼지 않는다** (2026-07-29 「체계」 처방).
 *
 * 예전엔 `width >= 768 ? 40 : 24` 였다. 그러면 이 파일이 **두 번째 진실원**이
 * 된다 — 시험이 검증하는 것이 "렌더된 x 가 토큰이 말하는 값과 같은가" 가
 * 아니라 "렌더된 x 가 내가 여기 베껴 둔 숫자와 같은가" 가 되고, 토큰을
 * 바꾸면 시험이 **제품이 아니라 자기 복사본을 지키느라** 빨개진다.
 *
 * 이제 `--gateway-gutter` 를 라이브로 읽는다. `<md` 는 그 토큰이 아니라
 * `max(1.5rem, safe-area)` 가 정하므로 24 가 남는다 — 이건 값이 아니라
 * **다른 규칙이 지배하는 구간**이라는 사실의 표현이다.
 */
const SMALL_GUTTER = 24;

const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
  // 홈통 스텝 경계 — 이 두 폭이 없으면 1536~2399 구간이 한 번도 안 실린다.
  { width: 1536, height: 960 },
  { width: 2400, height: 1350 },
];

/** 스크롤 0 을 약속하는 폭 — 14인치 실창과 풀스크린, 그리고 그 위. */
const NO_SCROLL_VIEWPORTS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const bx = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? Math.round(el.getBoundingClientRect().x) : null;
    };
    const plate = document.querySelector('[data-testid="download-plate"]');
    const plateRect = plate ? plate.getBoundingClientRect() : null;
    const scrollDelta = [...document.querySelectorAll("*")]
      .filter(
        (el) =>
          el.scrollHeight - el.clientHeight > 2 &&
          ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      )
      .map((el) => el.scrollHeight - el.clientHeight);
    return {
      xs: {
        gnb: bx('[data-testid="download-gnb"] a'),
        headline: bx("h1"),
        plate: bx('[data-testid="download-plate"]'),
        caption: bx('[data-testid="download-portrait-caption"] span'),
        install: bx('[data-testid="download-install"]'),
        footer: bx("main footer > div"),
      },
      plateRight: plateRect ? Math.round(plateRect.right) : null,
      // 관문 그리드의 원자값 — `app/globals.css` 의 `:root`. 시험은 값을
      // 베끼지 않고 이 셋을 읽어 파생이 실제로 돌았는지 확인한다.
      gutterToken: Number(
        getComputedStyle(document.documentElement).getPropertyValue("--gateway-gutter").trim(),
      ),
      plateWidthToken: Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--gateway-plate-width")
          .trim(),
      ),
      plateGapToken: Number(
        getComputedStyle(document.documentElement).getPropertyValue("--gateway-plate-gap").trim(),
      ),
      safeInsetLeft: Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--topology-v2-safe-inset-left")
          .trim(),
      ),
      scrollDelta,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

test.describe("관문 다운로드의 그리드", () => {
  for (const viewport of WIDTHS) {
    test(`${viewport.width}×${viewport.height} — 여섯 원소가 같은 x 에 선다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      await page.goto("/ko/download/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

      const m = await measure(page);
      const gutter = viewport.width >= 768 ? m.gutterToken : SMALL_GUTTER;

      for (const [name, x] of Object.entries(m.xs)) {
        expect(x, `${name} 의 x 를 못 읽었다`).not.toBeNull();
        expect(x, `${name} 이 홈통(${gutter}) 밖에 있다`).toBe(gutter);
      }

      /**
       * **파생이 실제로 돌았는가.**
       *
       * 예약폭은 이제 리터럴이 아니라 원자값 셋의 합이다
       * (`src/views/download/lib/gateway-grid.ts`, `StageMap` 마운트 effect).
       * 그 effect 가 삭제되거나 깨지면 CSS 폴백(544)이 살아남아 **그럴듯한
       * 값**이 나오므로, 합을 직접 확인하지 않으면 아무도 모른다.
       */
      expect(Number.isFinite(m.safeInsetLeft), "예약폭이 숫자가 아니다 — 파생이 안 돌았다").toBe(
        true,
      );
      expect(m.safeInsetLeft, "예약폭이 원자값의 합이 아니다").toBe(
        m.gutterToken + m.plateWidthToken + m.plateGapToken,
      );

      // 판이 카메라가 예약한 영역 안에 있어야 그래프가 판 뒤로 안 파고든다.
      // 틈도 토큰에서 읽는다 — 구 판본은 `+ 24` 리터럴이라 틈을 바꾸면
      // 시험이 옛 값을 지키느라 빨개졌다.
      expect(m.plateRight, "판 오른끝을 못 읽었다").not.toBeNull();
      expect(m.plateRight! + m.plateGapToken).toBeLessThanOrEqual(m.safeInsetLeft);

      expect(m.overflowX, "가로 오버플로").toBe(0);
    });
  }

  for (const viewport of NO_SCROLL_VIEWPORTS) {
    test(`${viewport.width}×${viewport.height} — 첫 화면이 스크롤 없이 끝난다`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      await page.goto("/ko/download/", { waitUntil: "networkidle" });
      await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

      const m = await measure(page);
      // 무대가 `flex-1` 로 남는 자리를 전부 먹으므로, 바닥 띠까지가 정확히
      // 한 화면이다. 구 `min(46rem,88vh)` 고정 바닥은 850 창에서 270px 을
      // 접었고, 접힌 것이 하필 설치 3단이었다.
      expect(m.scrollDelta, `세로 스크롤이 생겼다: ${JSON.stringify(m.scrollDelta)}`).toEqual([]);
    });
  }

  for (const locale of ["ko", "en"]) {
    test(`320px ${locale} — 판 안의 컨트롤이 판을 뚫지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await seedFirstRunSeen(page);
      await page.goto(`/${locale}/download/`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("download-plate")).toBeVisible({ timeout: 15_000 });

      const worst = await page.evaluate(() => {
        const plate = document.querySelector('[data-testid="download-plate"]')!;
        const cs = getComputedStyle(plate);
        const innerLeft = plate.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
        const innerRight = plate.getBoundingClientRect().right - parseFloat(cs.paddingRight);
        let overflow = -Infinity;
        let culprit = "";
        for (const el of plate.querySelectorAll("a, button, p, div")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const over = Math.max(r.right - innerRight, innerLeft - r.left);
          if (over > overflow) {
            overflow = over;
            culprit = (el.getAttribute("data-testid") ?? el.tagName) + ": " + el.textContent?.slice(0, 40);
          }
        }
        return { overflow: Math.round(overflow), culprit };
      });

      // `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이
      // 컨테이너를 뚫는다. 무대가 `overflow-hidden` 이라 스크롤바도 안 생기고
      // 그냥 잘렸다 — 실측(320, en): 주 CTA 가 22px 넘쳤다.
      expect(worst.overflow, `판을 넘는 원소: ${worst.culprit}`).toBeLessThanOrEqual(0);
    });
  }
});
