import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **A short window does not keep tall reservations** (2026-09-19).
 *
 * The overview fit reserves a tool lane on top (148) and a readout band on
 * the bottom (96 plus the label allowance) — 268 px, sized for a tall desktop
 * window. On the 14-inch MacBook the browser gives the map 806 px, on a
 * 1024×768 window 764: a third of the height went to reservations that hold
 * nothing that tall, and the spine ring filled 64 % and 51 % of the height.
 * Below 880 px the bands shrink to the tool lane plus a chip and the readout
 * plus a name, and the ring fills the window it was given.
 */
async function ringFill(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  return page.evaluate(() => {
    const probe = window.__atlasMap!;
    const camera = probe.camera()!;
    const spine = probe.nodes().filter((n) => !n.hidden && (n.kind === "domain" || n.kind === "project"));
    const minY = Math.min(...spine.map((n) => n.y - n.radius));
    const maxY = Math.max(...spine.map((n) => n.y + n.radius));
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const controls = [...document.querySelectorAll<HTMLElement>("main button")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top < 120 && r.left > canvas.left);
    const toolbarBottom = Math.max(...controls.map((r) => r.bottom)) - canvas.top;
    const labels = probe.labels();
    return {
      fillH: (maxY - minY) / camera.height,
      top: minY,
      toolbarBottom,
      labelsOff: labels.filter((l) => l.minY < 0 || l.maxY > camera.height).map((l) => l.text),
      labelsUnderToolbar: labels.filter((l) => l.minY < toolbarBottom).map((l) => l.text),
    };
  });
}

test("the spine ring fills a short window instead of a tall reservation", async ({ page }) => {
  test.setTimeout(90_000);
  await seedFirstRunSeen(page);
  // At 1024 wide the ring is bound by the side lanes, not the height, so only
  // the 14-inch window carries a fill floor; both keep the clipping invariants.
  for (const [width, height, floor] of [
    [1512, 806, 0.7],
    [1024, 768, 0],
  ] as const) {
    const fill = await ringFill(page, width, height);
    if (floor > 0) {
      expect(fill.fillH, `${width}×${height}: 링이 높이의 ${Math.round(fill.fillH * 100)}%만 채운다`).toBeGreaterThanOrEqual(floor);
    }
    expect(fill.top, `${width}×${height}: 링이 툴바 아래로 들어갔다`).toBeGreaterThan(fill.toolbarBottom);
    expect(fill.labelsOff, `${width}×${height}: 화면 밖 이름`).toEqual([]);
    expect(fill.labelsUnderToolbar, `${width}×${height}: 툴바 아래 이름`).toEqual([]);
  }
});

/**
 * The lanes are read again on every viewport commit, so a window dragged
 * from tall to short refits with the short lanes without a reload — the
 * token cache used to hold the first read for the whole session.
 */
test("shrinking a tall window refits with the short lanes without a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await seedFirstRunSeen(page);
  const tall = await ringFill(page, 1512, 1000);
  expect(tall.top, "큰 창은 원래 예약(148)을 지킨다").toBeGreaterThanOrEqual(148);
  await page.setViewportSize({ width: 1512, height: 806 });
  await waitForMapStill(page);
  const short = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const camera = probe.camera()!;
    const spine = probe.nodes().filter((n) => !n.hidden && (n.kind === "domain" || n.kind === "project"));
    const minY = Math.min(...spine.map((n) => n.y - n.radius));
    const maxY = Math.max(...spine.map((n) => n.y + n.radius));
    return { fillH: (maxY - minY) / camera.height, top: minY, height: camera.height };
  });
  expect(short.height).toBeLessThan(880);
  expect(short.fillH, `줄인 창에서 링이 높이의 ${Math.round(short.fillH * 100)}%만 채운다`).toBeGreaterThanOrEqual(0.7);
});
