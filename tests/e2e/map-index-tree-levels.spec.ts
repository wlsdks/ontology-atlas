import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **The INDEX tree says its own shape on the real screen** (map round,
 * 2026-09-20).
 *
 * The rows are siblings in the DOM — no nested `role="group"` — and the
 * hierarchy is drawn with a left margin. Measured before the fix on the sample
 * map: 10 rows, 0 groups and not one `aria-level`, so a screen reader announced
 * the project and its nine domains as ten peers. This walks the live panel
 * rather than a fixture, because the levels have to survive the real tree the
 * map builds.
 */
test("INDEX 트리의 모든 행이 자기 단계를 말한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });
  await page.getByRole("button", { name: "여기서 둘러볼게요" }).click();
  const tree = page.getByTestId("topology-index-tree");
  await expect(tree).toBeVisible();

  const read = () =>
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="topology-index-tree"] [role="treeitem"]'));
      return rows.map((r) => ({
        text: (r.textContent ?? "").trim().slice(0, 12),
        level: r.getAttribute("aria-level"),
        pos: r.getAttribute("aria-posinset"),
        size: r.getAttribute("aria-setsize"),
      }));
    });

  const roots = await read();
  expect(roots.length, "트리에 행이 없다 — 이 스펙이 공회전한다").toBeGreaterThan(3);
  expect(roots.filter((r) => r.level === null), "단계를 말하지 않는 행").toEqual([]);
  // One project at level 1, its domains one step in.
  expect(roots[0].level).toBe("1");
  expect(new Set(roots.slice(1).map((r) => r.level))).toEqual(new Set(["2"]));
  for (const row of roots) {
    expect(Number(row.pos)).toBeGreaterThanOrEqual(1);
    expect(Number(row.pos)).toBeLessThanOrEqual(Number(row.size));
  }

  // Expanding a domain must not flatten its children into the same level.
  await page.locator('[data-testid="topology-index-tree"] [role="treeitem"]').nth(1).click();
  await expect.poll(async () => (await read()).length, { timeout: 10_000 }).toBeGreaterThan(roots.length);
  const expanded = await read();
  expect(expanded.filter((r) => r.level === null), "펼친 뒤 단계를 잃은 행").toEqual([]);
  expect(expanded.some((r) => r.level === "3"), "펼친 자식이 부모와 같은 단계로 읽힌다").toBe(true);
});
