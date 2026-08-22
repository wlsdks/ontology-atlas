import { expect, test } from "@playwright/test";

/**
 * 첫 실행 카드는 방문자가 보는 첫 화면 전체가 앱이 쓴 문자열이다. 사용자 데이터와
 * 달리 잘라야 할 이유가 없으므로, 영문/국문 양쪽에서 텍스트 잘림과 용어 표의
 * `용어 = 정의` 행·열 정렬을 실제 DOM rect로 잰다.
 *
 * 이 검사는 INDEX 푸터와 함께 살던 `chrome-text-fit.spec.ts`에서 분리했다.
 * 푸터가 제거됐다고 첫 실행 카드의 독립 계약까지 사라지면 안 된다.
 */
const VIEWPORTS = [
  { label: "1512", width: 1512, height: 950 },
  { label: "1024", width: 1024, height: 800 },
] as const;

const LOCALES = ["en", "ko"] as const;

test.describe("첫 실행 카드 텍스트 맞춤", () => {
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`${locale} · ${viewport.label}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/${locale}/topology/?guides=off`, {
          waitUntil: "domcontentloaded",
        });

        const card = page.getByTestId("first-run-starter");
        await expect(card).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("first-run-starter-glossary")).toBeVisible();

        const measurement = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="first-run-starter"]');
          if (!root) {
            return {
              clipped: [{ text: "first-run-starter not found", scrollWidth: 1, clientWidth: 0 }],
              columns: { terms: [], equals: [], definitions: [] },
            };
          }
          const clipped: Array<{ text: string; scrollWidth: number; clientWidth: number }> = [];
          const visit = (element: Element) => {
            const text = (element.textContent ?? "").trim();
            if (text && element.children.length === 0 && element.scrollWidth > element.clientWidth) {
              clipped.push({
                text,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
              });
            }
            for (const child of Array.from(element.children)) visit(child);
          };
          visit(root);

          const glossary = root.querySelector('[data-testid="first-run-starter-glossary"]');
          const rects = (selector: string) =>
            Array.from(glossary?.querySelectorAll(selector) ?? []).map((element) => {
              const rect = element.getBoundingClientRect();
              return { x: Math.round(rect.x), y: Math.round(rect.y) };
            });
          return {
            clipped,
            columns: {
              terms: rects("dt"),
              equals: rects("span"),
              definitions: rects("dd"),
            },
          };
        });

        expect(
          measurement.clipped,
          `첫 실행 카드가 자기 문자열을 자른다:\n${measurement.clipped
            .map((row) => `  "${row.text}" ${row.scrollWidth}px → ${row.clientWidth}px`)
            .join("\n")}`,
        ).toEqual([]);

        const { terms, equals, definitions } = measurement.columns;
        expect(terms.length, "용어 사전 행이 없다").toBeGreaterThan(0);
        expect(new Set(terms.map((row) => row.x)).size).toBe(1);
        expect(new Set(equals.map((row) => row.x)).size).toBe(1);
        expect(new Set(definitions.map((row) => row.x)).size).toBe(1);
        for (let index = 0; index < terms.length; index += 1) {
          expect(
            new Set([terms[index]?.y, equals[index]?.y, definitions[index]?.y]).size,
            `${index}번째 용어가 한 줄에 서지 않는다`,
          ).toBe(1);
        }
      });
    }
  }
});
