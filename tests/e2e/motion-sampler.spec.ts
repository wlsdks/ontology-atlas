import { expect, test, type Page } from "@playwright/test";

import {
  FRAME_INTERVAL_BUDGET_MS,
  expectSmoothMotion,
  installMotionSampler,
  motionShares,
  smoothnessViolations,
  startSampling,
  startSmoothness,
  stopSampling,
  stopSmoothness,
  translateY,
} from "./motion-sampler";

const PROBE = `<!doctype html><html><head><style>
  body { margin: 0; background: #000; }
  .box { position: absolute; top: 20px; width: 80px; height: 40px; background: #fff; }
  #cut { left: 20px; }
  #ease { left: 120px; transition: translate 180ms ease; }
  #ease.moved { translate: 0 60px; }
  #cut.moved { translate: 0 60px; }
  #press-ok { left: 220px; transition: translate 180ms ease; }
  #press-ok:active { translate: 0 1px; }
  #press-bad { left: 320px; transition: transform 180ms ease; }
  #press-bad:active { translate: 0 1px; }
  #grow { left: 420px; transition: width 180ms ease; }
  #grow.wide { width: 160px; }
  #shift { position: static; margin-top: 200px; }
  canvas { position: absolute; top: 300px; left: 20px; width: 64px; height: 64px; }
</style></head><body>
  <div class="box" id="cut"></div><div class="box" id="ease"></div>
  <div class="box" id="press-ok"></div><div class="box" id="press-bad"></div>
  <div class="box" id="grow"></div>
  <div class="box" id="shift"></div>
  <canvas width="64" height="64"></canvas>
</body></html>`;

async function frames(page: Page, n: number) {
  await page.evaluate(
    (count) => new Promise<void>((done) => {
      let left = count;
      const step = () => (--left <= 0 ? done() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }),
    n,
  );
}

async function inputTime(page: Page) {
  return page.evaluate(() => performance.now());
}

test.describe("motion sampler self-test", () => {
  test.beforeEach(async ({ page }) => {
    await installMotionSampler(page);
    await page.setContent(PROBE);
    await frames(page, 4);
  });

  test("a hard cut reads MFS ≥ 0.9 and a 180 ms ease stays soft", async ({ page }) => {
    await startSampling(page, { tracks: [{ name: "cut", selector: "#cut" }, { name: "ease", selector: "#ease" }] });
    await frames(page, 3);
    const t0 = await inputTime(page);
    await page.evaluate(() => ["cut", "ease"].forEach((id) => document.getElementById(id)!.classList.add("moved")));
    await frames(page, 30);
    const rec = await stopSampling(page);
    const cut = motionShares(rec.tracks.cut.map((v) => translateY(v!.translate)), rec.frames, t0);
    const ease = motionShares(rec.tracks.ease.map((v) => translateY(v!.translate)), rec.frames, t0);
    expect(cut.mfs).toBeGreaterThanOrEqual(0.9);
    expect(ease.ffs).toBeLessThanOrEqual(0.15);
    expect(ease.mfs).toBeLessThanOrEqual(0.27);
    expect(ease.intermediate).toBeGreaterThan(3);
  });

  test("press travel on `translate` animates; a `transform` transition shows no intermediate", async ({ page }) => {
    for (const [id, animates] of [["press-ok", true], ["press-bad", false]] as const) {
      await startSampling(page, { tracks: [{ name: id, selector: `#${id}` }] });
      const box = (await page.locator(`#${id}`).boundingBox())!;
      await page.mouse.move(box.x + 10, box.y + 10);
      await frames(page, 2);
      const t0 = await inputTime(page);
      await page.mouse.down();
      await frames(page, 30);
      await page.mouse.up();
      await frames(page, 4);
      const rec = await stopSampling(page);
      const ys = rec.tracks[id].map((v) => translateY(v!.translate));
      const shares = motionShares(ys, rec.frames, t0);
      expect(Math.max(...ys), id).toBe(1);
      expect(shares.intermediate > 0, id).toBe(animates);
      expect(rec.inputs.some((i) => i.type === "pointerdown"), id).toBe(true);
    }
  });

  test("a planted layout shift counts once", async ({ page }) => {
    await startSampling(page, { tracks: [] });
    await frames(page, 2);
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.style.height = "120px";
      document.body.prepend(el);
    });
    await frames(page, 10);
    const rec = await stopSampling(page);
    expect(rec.layoutShifts).toHaveLength(1);
  });

  test("canvas ink follows a planted alpha fade monotonically", async ({ page }) => {
    await page.evaluate(() => {
      const c = document.querySelector("canvas")!;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 64, 64);
      c.style.transition = "opacity 180ms linear";
    });
    await frames(page, 2);
    await startSampling(page, { tracks: [], inkSelector: "canvas" });
    await frames(page, 2);
    await page.evaluate(() => (document.querySelector("canvas")!.style.opacity = "0"));
    await frames(page, 30);
    const rec = await stopSampling(page);
    const falling = rec.ink.slice(1).every((v, i) => v <= rec.ink[i] + 1e-6);
    expect(rec.ink[0]).toBeGreaterThan(0);
    expect(rec.ink.at(-1)).toBe(0);
    expect(falling).toBe(true);
    expect(new Set(rec.ink).size).toBeGreaterThan(4);
  });

  test("a width transition is a smoothness violation", async ({ page }) => {
    await startSmoothness(page);
    await frames(page, 3);
    await page.evaluate(() => document.getElementById("grow")!.classList.add("wide"));
    await frames(page, 30);
    const report = await stopSmoothness(page, "#grow");
    expect(smoothnessViolations(report)).toEqual(["div.box: width animates outside a declared reflow"]);
    expect(smoothnessViolations(report, { reflow: ["width"] })).toEqual([]);
    expect(smoothnessViolations({ ...report, animated: report.animated.map((a) => ({ ...a, inside: false })) }, { reflow: ["width"] })).toEqual([
      "div.box: width animates outside a declared reflow",
    ]);
  });

  test("a shift with no input is a violation and a declared reflow waives only its own element", async ({ page }) => {
    const shiftLater = (id: string) =>
      page.evaluate(
        (elementId) =>
          new Promise<void>((done) => {
            setTimeout(() => {
              const el = document.createElement("div");
              el.id = elementId;
              el.style.height = "120px";
              document.body.prepend(el);
              done();
            }, 800);
          }),
        id,
      );
    await startSmoothness(page);
    await shiftLater("late");
    await frames(page, 10);
    const report = await stopSmoothness(page, "body");
    expect(report.layoutShifts.length).toBeGreaterThan(0);
    expect(smoothnessViolations(report).some((v) => v.startsWith("layout shift"))).toBe(true);
    expect(smoothnessViolations(report, { reflow: ["height"] })).toEqual([]);
    await startSmoothness(page);
    await shiftLater("later");
    await frames(page, 10);
    const other = await stopSmoothness(page, "#grow");
    expect(smoothnessViolations(other, { reflow: ["height"] }).some((v) => v.startsWith("layout shift"))).toBe(true);
  });

  test("a recording that saw no animation fails unless it says it is still", async ({ page }) => {
    await startSmoothness(page);
    await frames(page, 8);
    const report = await stopSmoothness(page);
    expect(() => expectSmoothMotion(report)).toThrow();
    expect(() => expectSmoothMotion(report, { still: true })).not.toThrow();
  });

  test("a translate-only move has no smoothness violation", async ({ page }) => {
    await startSmoothness(page);
    await frames(page, 3);
    await page.evaluate(() => document.getElementById("ease")!.classList.add("moved"));
    await frames(page, 30);
    const report = await stopSmoothness(page);
    expect(report.animated.map((a) => a.property)).toContain("translate");
    expect(smoothnessViolations(report)).toEqual([]);
  });

  test("a blocked frame reads above the frame-interval budget", async ({ page }) => {
    await startSmoothness(page);
    await frames(page, 3);
    await page.evaluate(
      (blockMs) => new Promise<void>((done) => {
        requestAnimationFrame(() => {
          const end = performance.now() + blockMs;
          while (performance.now() < end);
          done();
        });
      }),
      FRAME_INTERVAL_BUDGET_MS * 2,
    );
    await frames(page, 4);
    const report = await stopSmoothness(page);
    expect(report.maxIntervalMs).toBeGreaterThan(FRAME_INTERVAL_BUDGET_MS);
  });
});
