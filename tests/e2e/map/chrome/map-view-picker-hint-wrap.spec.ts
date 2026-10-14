import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { FIT_LOCALES, FIT_VIEWPORTS } from "../../locales";

/**
 * The picker is a fixed 240px surface with `text-wrap: balance`; a two-line description must
 * split into comparable lines. Measured from each word's first client rect, in both locales.
 */
for (const locale of FIT_LOCALES) {
  // The picker is a fixed 240px surface, so one window proves both locales' wraps.
  for (const viewport of FIT_VIEWPORTS) {
    test(`${locale} ${viewport.width}: every view description wraps without a lone last word`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await seedFirstRunSeen(page);
      await page.goto(`/${locale}/topology/?e2e=1&guides=off`, { waitUntil: "domcontentloaded" });
      const chip = page.getByTestId("topology-view-3d");
      await expect(chip).toBeVisible({ timeout: 45_000 });
      await chip.click();
      const menu = page.getByTestId("topology-view-3d-menu");
      await expect(menu).toHaveAttribute("data-state", "open");

      const hints = await menu.evaluate((box) =>
        [...box.querySelectorAll('[role="radio"]')].map((row) => {
          const hint = row.querySelectorAll("span")[1] as HTMLElement;
          const text = hint.textContent ?? "";
          const node = hint.firstChild as Text;
          const tops: number[] = [];
          for (const match of text.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index ?? 0);
            range.setEnd(node, (match.index ?? 0) + match[0].length);
            tops.push(Math.round(range.getClientRects()[0].top));
          }
          const lines = [...new Set(tops)].sort((a, b) => a - b);
          const last = lines.at(-1);
          const hintBox = hint.getBoundingClientRect();
          const rowBox = row.getBoundingClientRect();
          return {
            choice: row.getAttribute("data-testid"),
            text,
            lines: lines.length,
            lastLineWords: tops.filter((top) => top === last).length,
            insideRow: hintBox.left >= rowBox.left - 0.5 && hintBox.right <= rowBox.right + 0.5,
          };
        }),
      );

      expect(hints).toHaveLength(6);
      for (const hint of hints) {
        expect(hint.insideRow, `${hint.choice} runs past its row`).toBe(true);
        if (hint.lines > 1) {
          expect(hint.lastLineWords, `${hint.choice} ends on a lone word: "${hint.text}"`).toBeGreaterThan(1);
        }
      }
    });
  }
}
