import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

const HANGUL = /[가-힣]/;

/**
 * **The Korean map screen says what it filters by in Korean.**
 *
 * The map's search palette writes every one of its own strings in Korean — the
 * placeholder, the match count, the footer keys, the result kind chips. Two
 * were missed: the filter row's group labels came back from `messages/ko.json`
 * as the English `Kind` and `Project · {count}`. Measured on that file: 2 of
 * the palette namespace's 27 strings carried no Hangul at all, and both sat
 * side by side at the top of the open palette.
 *
 * The check is a character class, not a sentence: whatever the group labels are
 * called, on the Korean screen they are written in Korean. The words themselves
 * are the ones the rest of the product already uses for these two things.
 */
test("the map search palette names its filter groups in Korean", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  await page.getByTestId("topology-concept-search").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The group labels are the filter row's own text — not the chips, which carry
  // concept and project names that are legitimately whatever the folder called them.
  const groupLabels = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-testid="global-search-filter-row"]');
    if (!row) return null;
    return [...row.querySelectorAll<HTMLElement>("span")]
      .filter((s) => s.closest("button") === null && (s.textContent ?? "").trim().length > 0)
      .map((s) => (s.textContent ?? "").trim());
  });
  expect(groupLabels, "필터 행을 못 찾았다").not.toBeNull();
  const labels = groupLabels ?? [];
  const latinOnly = labels.filter((t) => /[A-Za-z]/.test(t) && !HANGUL.test(t));
  expect(latinOnly, `한국어 화면인데 영어로만 쓰인 라벨이 있다: ${JSON.stringify(labels)}`).toEqual([]);
  expect(labels.some((t) => HANGUL.test(t)), "필터 행에 한국어 라벨이 하나도 없다").toBe(true);
});
