import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { waitForMapStill } from "../settle";

/**
 * Re-reading an already open folder must not drop the session to `loading`: the rail keeps the
 * folder name, and the INDEX does not bring its reading line back while the watch re-reads.
 */
test("the open folder keeps its name and the INDEX stays settled while the watch re-reads", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  const read = () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-testid="topology-index-panel"]');
      const rail = document.querySelector('[data-testid="vault-switch-rail-tile"]');
      return {
        named: (rail?.getAttribute("aria-label") ?? "").includes("atlas-vault"),
        settled: panel !== null && panel.querySelector('[data-testid="topology-index-source"]') === null,
        recent: (document.querySelector('[data-testid="topology-index-segment-recent"]')?.textContent ?? "").trim(),
      };
    });

  const first = await read();
  expect(first.named, "the rail does not name the open folder").toBe(true);
  expect(first.settled, "the INDEX still shows its reading line after the first read").toBe(true);

  // Long enough to contain more than one watch cycle: the blink was ~3.5s out of ~8.6s,
  // so a 20-second window could not miss it.
  const samples: Array<{ at: number; named: boolean; settled: boolean; recent: string }> = [];
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    samples.push({ at: Date.now() - started, ...(await read()) });
    // measurement window: the sampling interval of a 20-second watch; the claim is that nothing blinks during it.
    await page.waitForTimeout(500);
  }

  const blank = samples.filter((s) => !s.named || !s.settled);
  expect(
    blank.map((s) => `${Math.round(s.at / 100) / 10}s`),
    `the folder name left the rail or the INDEX went back to reading during a re-read (${blank.length}/${samples.length} samples)`,
  ).toEqual([]);

  const drifted = samples.filter((s) => s.recent !== first.recent);
  expect(
    drifted.map((s) => `${Math.round(s.at / 100) / 10}s ${s.recent}`),
    `the recent-change count drifted with nothing touched (first "${first.recent}")`,
  ).toEqual([]);
});
