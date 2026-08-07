import { expect, test } from "@playwright/test";

/**
 * 관문의 **읽을거리에 좁은 화면에서도 닿는가.**
 *
 * ## 무엇이 있었나 (2026-08-07 실측 · 정적 export · 볼트 없음)
 *
 * | | 1512 | 768 | 390 |
 * |---|---|---|---|
 * | `/ko/` 에서 보이는 가이드·변경 내역 링크 | 1·1 | 1·1 | **0·0** |
 * | `/ko/guide/*` 에서 보이는 가이드 장 | 13 | **1** | **0** |
 *
 * 폰으로 링크를 받아 가이드 한 장을 연 사람에게 13장은 **서로 못 가는 13개의
 * 막다른 길**이었다. 그 안에 「에이전트 연결」과 「CLI」가 있으므로 막힌 것은
 * 읽을거리가 아니라 **에이전트를 붙이는 경로**다.
 *
 * ## 왜 코드로는 못 잡나
 *
 * 위반이 **코드에 아무 값도 안 남긴다.** `hidden … sm:flex` 도 `hidden lg:block`
 * 도 그 자체로는 정당한 반응형 표기이고, 결함은 「접은 뒤에 대체가 있는가」라는
 * **다른 파일 사이의 관계**다. 실제로 코드 주석 둘이 대체를 약속하고 있었는데
 * **둘 다 사실이 아니었다** — 크롬의 「가이드」 칩(`<sm` 에서 같이 접힌다)과
 * 관문 푸터(어느 폭에서도 링크 0개). **주석은 게이트가 아니다.**
 *
 * ## 무엇을 재나
 *
 * 「보이는가」가 아니라 **「닿는가」**. 닫힌 펼침 안의 링크는 보이지 않는 것이
 * 맞지만 막다른 길은 아니다 — 그래서 펼침이 있으면 **한 번 눌러 보고** 다시
 * 센다. 조작 한 번으로 닿으면 통과다.
 */

/** 관문 표면 넷. 이 목록이 곧 사정거리다. */
const GATEWAY_ROUTES = [
  "/ko/",
  "/ko/download/",
  "/ko/guide/",
  "/ko/guide/connect-agent/",
  "/ko/changelog/",
] as const;

/** 좁은 폭이 문제였다 — 넓은 폭도 같이 재서 「원래 없던 것」과 구별한다. */
const WIDTHS = [
  { w: 1512, h: 900 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
] as const;

const PAINTED = `(el) => {
  const c = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  if (b.width < 2 || b.height < 2) return false;
  if (c.visibility === 'hidden' || c.display === 'none' || Number(c.opacity) < 0.05) return false;
  if (el.closest('details:not([open])')) return false;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cc = getComputedStyle(n);
    if (cc.display === 'none' || cc.visibility === 'hidden') return false;
  }
  return true;
}`;

/**
 * ⚠️ **「/guide 를 담은 링크 수」를 세면 안 된다** — 프로브가 이 구멍을 잡았다.
 *
 * 처음엔 그렇게 셌는데, 가이드 장 펼침을 통째로 지워도 768·390 이 **초록**
 * 이었다. 페이지 아래의 읽을거리 줄이 가진 `/guide`(색인) 링크 하나가
 * 「가이드에 닿는다」로 세어졌기 때문이다. 즉 **장에 한 곳도 못 가는데** 검사는
 * 통과했다. 지키려는 사실은 「가이드라는 낱말이 어딘가 링크로 있다」가 아니라
 * **「다른 장으로 갈 수 있다」** 이므로, 세는 단위를 **서로 다른 장**으로 바꾼다.
 */
const countReading = (page: import("@playwright/test").Page) =>
  page.evaluate((src: string) => {
    const painted = eval(src) as (el: Element) => boolean;
    const hrefs = [...document.querySelectorAll('a[href]')]
      .filter(painted)
      .map((a) => (a.getAttribute("href") ?? "").split(/[?#]/)[0].replace(/\/$/, ""));
    const chapters = new Set(
      hrefs.map((h) => /^\/(?:ko|en)\/guide\/([^/]+)$/.exec(h)?.[1]).filter(Boolean) as string[],
    );
    return {
      guide: hrefs.filter((h) => h.includes("/guide")).length,
      chapters: chapters.size,
      changelog: hrefs.filter((h) => h.includes("/changelog")).length,
    };
  }, PAINTED);

test.describe("관문 읽을거리 — 좁은 화면에서도 닿는다", () => {
  for (const { w, h } of WIDTHS) {
    test(`${w}×${h} — 관문 표면 어디서든 가이드와 변경 내역에 닿는다`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: h });

      const dead: string[] = [];
      let measured = 0;

      for (const route of GATEWAY_ROUTES) {
        await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(700);

        // 펼침이 있으면 한 번 눌러 본다 — 조작 한 번으로 닿으면 막다른 길이 아니다.
        const summary = page.getByTestId("guide-chapter-picker-summary");
        if ((await summary.count()) > 0 && (await summary.isVisible())) {
          await summary.click();
          await page.waitForTimeout(250);
        }

        const seen = await countReading(page);
        measured += 1;
        if (seen.guide < 1) dead.push(`${route} → 가이드 0`);
        if (seen.changelog < 1) dead.push(`${route} → 변경 내역 0`);
        // 가이드 안에서는 **다른 장으로 갈 수 있어야** 한다. 색인 링크 하나로는
        // 「가이드에 닿았다」가 되지 않는다 — 위 주석의 구멍이 그것이었다.
        if (route.startsWith("/ko/guide") && seen.chapters < 5) {
          dead.push(`${route} → 갈 수 있는 장 ${seen.chapters}개 (차례가 없다)`);
        }
      }

      // 공회전 차단 — 라우트를 한 곳도 못 열었으면 아래 0 은 「깨끗해서」가 아니다.
      expect(measured, "관문 라우트를 하나도 안 쟀다").toBe(GATEWAY_ROUTES.length);

      expect(
        dead,
        `이 폭에서 읽을거리에 닿을 길이 없다 — 크롬이 접었으면 판이 대신 내야 한다 ` +
          `(관문/내려받기는 푸터의 GatewayReadingLinks, 가이드 장은 GuideChapterPicker)`,
      ).toEqual([]);
    });
  }

  /**
   * 차례는 **한 벌**이다 — 넓은 폭의 사이드바와 좁은 폭의 펼침이 같은 목록을
   * 그려야 한다. 두 벌이 되면 장을 더할 때 한쪽만 는다.
   */
  test("좁은 폭 차례가 넓은 폭 차례와 같은 장을 담는다", async ({ page }) => {
    const chapters = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="guide-nav-"]')].map((a) =>
          a.getAttribute("data-testid"),
        ),
      );

    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/guide/connect-agent/?guides=off", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const wide = [...new Set(await chapters())].sort();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ko/guide/connect-agent/?guides=off", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    await page.getByTestId("guide-chapter-picker-summary").click();
    await page.waitForTimeout(250);
    const narrow = [...new Set(await chapters())].sort();

    expect(wide.length, "넓은 폭에서 장을 못 찾았다 — 이 시험이 헛돈다").toBeGreaterThan(5);
    expect(narrow, "좁은 폭 차례가 넓은 폭과 다른 장을 담는다 — 목록이 두 벌이 됐다").toEqual(wide);
  });
});
