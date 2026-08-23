import { expect, test } from "@playwright/test";

/**
 * The first-run card is the entire screen the visitor sees, composed of strings written by the app. Unlike user data,
 * there is no reason to truncate them, so we measure text truncation and term-table
 * `term = definition` row/column alignment in both English and Korean using actual DOM rects.
 *
 * I separated this check from `chrome-text-fit.spec.ts`, which lived with the INDEX footer.
 * Even if the footer is removed, the first-run card's independent contract must not disappear.
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
