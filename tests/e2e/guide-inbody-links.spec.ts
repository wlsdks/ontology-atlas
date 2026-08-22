import { expect, test } from "@playwright/test";

/**
 * Do the guide's **body** links actually open — measured in a browser.
 *
 * **Why this must be e2e** (usability audit, 2026-08-07). **All 34** in-body links
 * across the guide's 13 chapters were 404s. The markdown source writes
 * `[…](/guide/reading-the-map)` without a locale prefix (one set of files serves both
 * `/ko` and `/en`, so a locale cannot be baked into the source), and the body renderer
 * passed that value straight into `<a href>`. The table of contents on the left of the
 * same screen used `Link` from the start and was fine, and since that is what people
 * mostly click, it went unnoticed.
 *
 * **Two checks are needed.** Whether the destination the source names exists is
 * checked by `tests/contract/guide-inbody-links.contract.test.ts`. But a valid
 * destination is **still a 404 if the renderer does not attach the locale**, and that
 * cannot be decided from source strings — it actually failed that way: a contract
 * regex asking "does it go through `Link`" still passed when the branch was disabled
 * with `if (false && …)`. What is written and what happens are different questions, so
 * this layer has to be opened and measured.
 *
 * **Why `docs:links` cannot catch it.** That check asks whether the **file path** a
 * document names exists. `/guide/relations` is a **route**, not a file, so it is not a
 * subject of that check at all.
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
        "본문 링크에 로케일이 안 붙었다 — 렌더러가 내부 링크를 Link 로 안 보낸다. " +
          "그대로 누르면 404 다.",
      ).toEqual([]);
      expect(dead, "본문 링크가 열리지 않는다").toEqual([]);
    });
  }
});
