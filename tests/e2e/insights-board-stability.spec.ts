import { expect, test } from "@playwright/test";

/**
 * **Picking a subject must not move the control you just clicked.**
 *
 * The Analysis board has two rows: the subject (brief · concepts · wiki · guidance) and, for
 * concepts only, its seven questions. Between them sits the census strip, which counts the
 * ontology and is therefore drawn for concepts alone.
 *
 * Measured 2026-09-20: while the strip stood *above* the subject control, choosing concepts
 * inserted 188px over it — the control jumped from y=104 to y=292 at both 1512 and 1920, out
 * from under the pointer that had just clicked it, and the accessibility tree read the strip's
 * numbers before naming the subject they belonged to. Moving the strip between the rows fixes
 * it, and this measures the fix rather than the arrangement, so a later rearrangement is free
 * as long as the control stays still.
 */

const SUBJECTS = ["brief", "ontology", "library", "harness"] as const;

async function subjectControlTop(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="insights-core-switch"]');
    if (!el) throw new Error("the subject control is gone — this test is watching nothing");
    return Math.round(el.getBoundingClientRect().top);
  });
}

for (const [width, height] of [
  [1512, 900],
  [1920, 1080],
] as const) {
  test.describe(`분석 보드 — 주제를 골라도 그 컨트롤은 제자리다 (${width})`, () => {
    test.use({ viewport: { width, height } });

    test("네 주제 모두에서 주제 컨트롤의 위치가 같다", async ({ page }) => {
      await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

      const tops: Record<string, number> = {};
      for (const subject of SUBJECTS) {
        await page.getByTestId(`insights-core-${subject}`).click();
        await expect(page.getByTestId(`insights-core-${subject}`)).toHaveAttribute("aria-checked", "true");
        tops[subject] = await subjectControlTop(page);
      }

      // Idling guard — without the strip actually appearing under concepts there is nothing that
      // could have pushed the control, and four equal numbers would prove nothing.
      await page.getByTestId("insights-core-ontology").click();
      await expect(page.getByRole("tablist")).toBeVisible();
      const stripBelowControl = await page.evaluate(() => {
        const control = document.querySelector('[data-testid="insights-core-switch"]');
        const tablist = document.querySelector('[role="tablist"]');
        if (!control || !tablist) return null;
        const gap = tablist.getBoundingClientRect().top - control.getBoundingClientRect().bottom;
        return Math.round(gap);
      });
      expect(stripBelowControl, "주제 행과 질문 행 사이가 비어 있다 — 인구조사 띠가 없다").toBeGreaterThan(100);

      const distinct = new Set(Object.values(tops));
      expect(
        distinct.size,
        `주제를 바꾸면 그 컨트롤이 움직인다: ${JSON.stringify(tops)}`,
      ).toBe(1);
    });
  });
}
