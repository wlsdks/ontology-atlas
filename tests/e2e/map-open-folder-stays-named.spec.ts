import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **Re-reading a folder that is already open is not opening one.**
 *
 * The vault watch re-reads the folder whenever its fingerprint moves, and that
 * rebuild used to drop the session back to `loading`. Everything the screen
 * derives from "loaded" went with it. Measured on the map at 1512x982 with
 * nothing touched, sampling twice a second for 22 seconds: the INDEX lost the
 * folder's name and its document count for about 3.5 s out of every 8.6 s —
 * roughly two fifths of the time — and while it was gone the recent filter claimed nothing at
 * all in seven days on a folder where 20 of 20 documents had changed that day.
 *
 * A zero that is false is worse than one that is stale, and a person should not
 * have to wonder which folder they are looking at. This watches the settled
 * screen and asserts it never blinks.
 */
test("the open folder keeps its name and its count while the watch re-reads", async ({ page }) => {
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
      const text = panel?.textContent ?? "";
      return {
        named: text.includes("atlas-vault"),
        docs: /(\d+)\s*문서/.exec(text)?.[1] ?? null,
        recent: (document.querySelector('[data-testid="topology-index-segment-recent"]')?.textContent ?? "").trim(),
      };
    });

  const first = await read();
  expect(first.named, "폴더 이름이 처음부터 없다").toBe(true);
  expect(first.docs, "문서 수가 처음부터 없다").not.toBeNull();

  // Long enough to contain more than one watch cycle: the blink was ~3.5s out of ~8.6s,
  // so a 20-second window could not miss it.
  const samples: Array<{ at: number; named: boolean; docs: string | null; recent: string }> = [];
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    samples.push({ at: Date.now() - started, ...(await read()) });
    // measurement window: the sampling interval of a 20-second watch; the claim is that nothing blinks during it.
    await page.waitForTimeout(500);
  }

  const blank = samples.filter((s) => !s.named || s.docs === null);
  expect(
    blank.map((s) => `${Math.round(s.at / 100) / 10}s`),
    `다시 읽는 동안 열린 폴더 이름/문서 수가 사라졌다 (${blank.length}/${samples.length} 표본)`,
  ).toEqual([]);

  const drifted = samples.filter((s) => s.recent !== first.recent);
  expect(
    drifted.map((s) => `${Math.round(s.at / 100) / 10}s ${s.recent}`),
    `아무것도 안 건드렸는데 최근 변경 수가 달라졌다 (기준 "${first.recent}")`,
  ).toEqual([]);
});
