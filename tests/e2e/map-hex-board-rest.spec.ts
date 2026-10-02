import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1512, height: 982 } });

async function openBoard(page: Page, synth: number) {
  await page.goto(`/ko/topology/?synth=${synth}&view=hex&e2e=1&guides=off`, { waitUntil: "domcontentloaded" });
  const map = page.getByTestId("hex-board-map");
  await expect(map).toHaveAttribute("data-hex-ready", "true", { timeout: 90_000 });
  return map;
}

test("the board's camera rests still once it is ready", async ({ page }) => {
  test.setTimeout(240_000);
  for (let load = 0; load < 3; load++) {
    await openBoard(page, 10_000);
    const samples = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')!;
          const read = () => {
            const f = JSON.parse(canvas.dataset.frame ?? "{}") as { offset?: number[]; R?: number };
            return JSON.stringify([f.offset, f.R]);
          };
          const out: string[] = [];
          const start = performance.now() + 1000;
          const end = Math.max(6000, start + 250);
          const tick = () => {
            const now = performance.now();
            if (now >= start) out.push(read());
            if (now >= end) resolve(out);
            else window.setTimeout(tick, 250);
          };
          tick();
        }),
    );
    expect(samples.length).toBeGreaterThan(0);
    expect(new Set(samples).size, `load ${load + 1}`).toBe(1);
  }
});

test("a drag writes no mirror rows until the camera stops, then one per tile", async ({ page }) => {
  test.setTimeout(180_000);
  const map = await openBoard(page, 2000);
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="hex-board-map"]')!;
    const list = document.querySelector('[data-testid="hex-board-list"]')!;
    const w = window as unknown as { __marks: number; __sawFalse: boolean };
    w.__marks = 0;
    w.__sawFalse = false;
    new MutationObserver((records) => {
      w.__marks += records.length;
    }).observe(list, { subtree: true, attributes: true, attributeFilter: ["data-mark"] });
    new MutationObserver(() => {
      if (root.dataset.hexReady === "false") w.__sawFalse = true;
    }).observe(root, { attributes: true, attributeFilter: ["data-hex-ready"] });
  });
  const box = (await map.locator("canvas").boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(x0 + (300 * i) / 40, y0);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const during = await page.evaluate(() => {
    const w = window as unknown as { __marks: number; __sawFalse: boolean };
    return { marks: w.__marks, sawFalse: w.__sawFalse };
  });
  expect(during.marks).toBe(0);
  expect(during.sawFalse).toBe(true);
  await page.mouse.up();
  await expect(map).toHaveAttribute("data-hex-ready", "true", { timeout: 1000 });
  const tiles = await page.locator("[data-hex-id]").count();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __marks: number }).__marks), { timeout: 1000 }).toBe(tiles);
});
