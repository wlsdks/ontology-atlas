import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The promise image must not become a ribbon.**
 *
 * The right-hand preview on the history setup screen ("this is how the screen fills
 * once connected") has a **content-fixed height** of 229px but had no width cap. The
 * left explanatory column is capped at 520px while the right one consumed all
 * remaining width, so the wider the screen the more the ratio collapsed. The owner's
 * report: *"비율이 좀 아쉽지? 우측에 있는게 너무 길다 가로로."* (the proportions are
 * off — the right-hand one is far too wide).
 *
 * | Window width | Preview | Ratio |
 * |---|---|---|
 * | 1280 | 536×229 | 2.3 |
 * | 1440 | 696×229 | 3.0 |
 * | 1920 | 1176×229 | **5.1** |
 * | 2560 | 1810×229 | **7.9** |
 *
 * ⚠️ **Lock the ratio, not the width.** Pinning the width makes this test break
 * spuriously when one extra line of content changes the height, and then the next
 * person deletes the cap. What collapsed was not the width but whether it still reads
 * as a screen, so that is what is measured.
 */

/** The cap at which it still reads as a screen preview. Measured: legible up to 3.0 (at 1440 wide) and collapsing above that. */
const MAX_RATIO = 3.2;

test("기록 셋업의 약속 그림이 넓은 화면에서 띠가 되지 않는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  const measured: { width: number; ratio: number; w: number; h: number }[] = [];

  for (const width of [1280, 1680, 1920, 2560]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/ko/git/?guides=off");
    const preview = page.getByTestId("atlas-git-setup-preview");
    await expect(preview).toBeAttached({ timeout: 15_000 });
    const box = await preview.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(box.h, `${width}px 에서 그림 높이가 0이다 — 이 시험이 헛돈다`).toBeGreaterThan(50);
    measured.push({ width, ratio: box.w / box.h, w: box.w, h: box.h });
  }

  expect(measured.length, "폭을 하나도 못 재면 이 시험이 헛돈다").toBe(4);
  const worst = measured.reduce((a, b) => (a.ratio > b.ratio ? a : b));
  expect(
    Number(worst.ratio.toFixed(2)),
    `${worst.width}px 에서 ${worst.w}×${worst.h} = ${worst.ratio.toFixed(2)}:1 — 화면이 아니라 띠다`,
  ).toBeLessThanOrEqual(MAX_RATIO);
});
