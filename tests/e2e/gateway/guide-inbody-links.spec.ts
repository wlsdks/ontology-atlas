import { expect, test } from "@playwright/test";

/**
 * Source links are written without a locale prefix and the renderer must attach it;
 * contract tests on source strings cannot see that, so the links are opened in a browser.
 */

/** Both locales are checked — baking a locale into one drags the other with it. */
const LOCALES = ["ko", "en"] as const;

test.describe("가이드 본문 링크", () => {
  for (const locale of LOCALES) {
    test(`/${locale} — 본문 내부 링크가 로케일을 갖고 실제로 열린다`, async ({ page, baseURL }) => {
      test.setTimeout(180_000);

      await page.goto(`/${locale}/guide/`, { waitUntil: "domcontentloaded" });
      const chapters = await page.evaluate(
        (loc) => [
          ...new Set(
            [...document.querySelectorAll(`a[href^="/${loc}/guide/"]`)].map((a) =>
              a.getAttribute("href"),
            ),
          ),
        ],
        locale,
      );
      // Idling guard — with no chapter found, the loop below never runs at all.
      expect(chapters.length, "가이드 장을 하나도 못 찾았다 — 차례 셀렉터가 낡았다").toBeGreaterThan(5);

      const missingLocale: string[] = [];
      const dead: string[] = [];
      let checked = 0;

      for (const chapter of chapters) {
        await page.goto(`${chapter}`, { waitUntil: "domcontentloaded" });
        const hrefs = await page.evaluate(() => {
          const body = document.querySelector("article") ?? document.querySelector("main");
          if (!body) return [];
          return [...body.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href") ?? "");
        });
        for (const href of hrefs) {
          checked += 1;
          if (!new RegExp(`^/(ko|en)/`).test(href)) {
            missingLocale.push(`${chapter} → ${href}`);
            continue;
          }
          if (!href.startsWith(`/${locale}/`)) {
            missingLocale.push(`${chapter} → ${href} (다른 로케일로 샌다)`);
            continue;
          }
          const res = await page.request.get(`${baseURL}${href}`);
          if (!res.ok()) dead.push(`${chapter} → ${href} (${res.status()})`);
        }
      }

      // With 0 links the two assertions above pass as "nothing diverged" — that is not a pass.
      expect(checked, "본문 내부 링크를 하나도 못 찾았다 — 이 시험이 헛돈다").toBeGreaterThan(10);

      expect(
        missingLocale,
        "The body link has no locale: the renderer does not send internal links through Link. " +
          "Pressing it as it is gives a 404.",
      ).toEqual([]);
      expect(dead, "본문 링크가 열리지 않는다").toEqual([]);
    });
  }
});
