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

/**
 * **The landing's action has to act.**
 *
 * The board holds its tab in component state and writes the address itself, so a link to
 * `?tab=do-next` changed the address and left the reader on the brief. A hard load of the same
 * address worked, which is what made it read as a routing problem rather than a dead control
 * (walkthrough, 2026-09-20). This is the click a person actually makes.
 */
test.describe("분석 브리핑 — 「열기」는 같은 화면 안에서 그 질문을 연다", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("고칠 것으로 보내는 줄을 누르면 주제와 판이 따라온다", async ({ page }) => {
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("insights-core-switch")).toBeVisible({ timeout: 20_000 });

    const repair = page.locator('[data-brief-destination="do-next"]').first();
    await expect(repair, "브리핑에 같은 화면으로 보내는 줄이 없다 — 이 시험이 공회전한다").toBeVisible();
    await repair.click();

    await expect(page.getByTestId("insights-core-ontology")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-insights-panel="do-next"]')).toBeVisible();
    // The address follows, and the flags that were already on it survive.
    await expect(page).toHaveURL(/tab=do-next/);
    await expect(page).toHaveURL(/guides=off/);
  });
});
