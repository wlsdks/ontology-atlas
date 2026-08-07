import { expect, test } from "@playwright/test";

/**
 * 가이드 **본문** 링크가 실제로 열리는지 — 브라우저에서 잰다.
 *
 * ## 왜 e2e 여야 하나 (2026-08-07 사용성 감사)
 *
 * 가이드 13장의 본문 내부 링크 **34개 전부가 404** 였다. 마크다운 원본은
 * 로케일 접두사 없이 `[…](/guide/reading-the-map)` 라고 쓰고(한 벌이 `/ko`·`/en`
 * 을 함께 서빙하므로 원본에 로케일을 박을 수 없다), 본문 렌더러가 그 값을 그대로
 * `<a href>` 에 실었다. 같은 화면의 왼쪽 차례는 처음부터 `Link` 를 써서 멀쩡했고,
 * 사람이 주로 누르는 쪽이 그쪽이라 눈에 안 띄었다.
 *
 * **두 검사가 필요하다.** 원본이 가리키는 목적지가 실재하는지는
 * `tests/contract/guide-inbody-links.contract.test.ts` 가 본다. 그러나 목적지가
 * 멀쩡해도 **렌더러가 로케일을 안 붙이면 똑같이 404** 이고, 그건 소스 문자열로는
 * 판정할 수 없다 — 실제로 그렇게 실패했다: 계약에서 정규식으로 «`Link` 를
 * 거치는가» 를 봤더니 분기를 `if (false && …)` 로 막아도 통과했다. 무엇이
 * 적혀 있나와 무엇이 일어나나는 다른 질문이라, 이 층은 열어서 재야 한다.
 *
 * ## 왜 `docs:links` 가 못 잡나
 *
 * 그 검사는 문서가 가리키는 **파일 경로**가 실재하는지를 본다. `/guide/relations`
 * 는 파일이 아니라 **라우트**라 애초에 검사 대상이 아니다.
 */

/** 두 로케일 다 본다 — 한쪽에 로케일을 박으면 다른 쪽이 끌려간다. */
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
      // 공회전 차단 — 장을 못 찾으면 아래 루프가 통째로 안 돈다.
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

      // 링크가 0개면 위 두 단언이 «어긋난 것 없음» 으로 통과한다 — 그건 통과가 아니다.
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
