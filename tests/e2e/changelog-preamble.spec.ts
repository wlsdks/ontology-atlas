import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The changelog must not open with the maintainer-facing English preamble**
 * (measured 2026-08-13).
 *
 * The blockquote at the top of `docs/CHANGELOG.md` ("Major change history … not
 * PR-level granularity") is meta addressed to repository contributors. The
 * screen's own lead already says the same thing in the user's language, so a KO
 * visitor's first paragraph being an English maintenance note was both a
 * duplicate and a vocabulary leak. The body must start at the first dated
 * entry.
 */
test("변경 내역 본문은 기여자용 머리말 없이 첫 항목부터 시작한다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/ko/changelog/?guides=off", { waitUntil: "domcontentloaded" });
  const body = page.getByTestId("gateway-doc-body");
  await expect(body).toBeVisible();
  await expect(body).not.toContainText("PR-level granularity");
  // The first child is the dated entry (h2), not a blockquote — this also
  // measures that nothing else quietly took the preamble's place.
  const firstTag = await body.evaluate((el) => el.firstElementChild?.tagName ?? null);
  expect(firstTag).toBe("H2");
});
