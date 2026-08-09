import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **약속 그림이 띠가 되지 않는다.**
 *
 * 기록 셋업 화면의 오른쪽 미리보기(「연결이 끝나면 이 화면이 이렇게 채워져요」)는
 * **높이가 내용으로 고정**(229px)인데 폭에는 상한이 없었다. 왼쪽 말하는 칸은
 * 520px 로 묶여 있고 오른쪽만 남는 폭을 다 먹어서, 화면이 넓을수록 비율이
 * 무너졌다 — 소유자 지적: *"비율이 좀 아쉽지? 우측에 있는게 너무 길다 가로로."*
 *
 * | 창 폭 | 프리뷰 | 비율 |
 * |---|---|---|
 * | 1280 | 536×229 | 2.3 |
 * | 1440 | 696×229 | 3.0 |
 * | 1920 | 1176×229 | **5.1** |
 * | 2560 | 1810×229 | **7.9** |
 *
 * ⚠️ **비율로 잠근다, 폭이 아니라.** 폭을 못박으면 내용이 한 줄 늘어 높이가
 * 바뀔 때 이 시험이 엉뚱하게 터지고, 그러면 다음 사람은 상한 쪽을 지운다.
 * 무너진 것은 폭이 아니라 «화면처럼 보이는가» 였으므로 그것을 잰다.
 */

/** 화면 미리보기로 읽히는 상한. 실측에서 3.0(1440폭)까지는 읽혔고 그 위부터 무너졌다. */
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
