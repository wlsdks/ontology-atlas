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

/** 홈통 계약: `<md` 24px · `md+` 40px. */
const EXPECTED_GUTTER = (width: number) => (width >= 768 ? 40 : 24);

const WIDTHS = [
  { width: 1512, height: 982 },
  { width: 1512, height: 850 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
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
      const gutter = EXPECTED_GUTTER(viewport.width);

      for (const [name, x] of Object.entries(m.xs)) {
        expect(x, `${name} 의 x 를 못 읽었다`).not.toBeNull();
        expect(x, `${name} 이 홈통(${gutter}) 밖에 있다`).toBe(gutter);
      }

      // 판이 카메라가 예약한 영역 안에 있어야 그래프가 판 뒤로 안 파고든다.
      // 갭(24)까지 포함해 인셋 이하 — 구 판본은 1920 에서 640 > 544 였다.
      expect(m.plateRight, "판 오른끝을 못 읽었다").not.toBeNull();
      expect(m.plateRight! + 24).toBeLessThanOrEqual(m.safeInsetLeft);

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
