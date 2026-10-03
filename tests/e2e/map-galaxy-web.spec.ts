import { expect, test, type Page } from "@playwright/test";
import "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

const widthOf = (count: number) => Math.min(2.4, 0.5 + 0.35 * Math.log2(1 + count));

async function openGalaxy(page: Page) {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    for (const key of ["galaxy", "view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
  });
  await page.goto("/en/topology/?synth=500&synthDeps=1&guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.arrival().active ?? true)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.pendingBuilds ?? 1)).toBe(0);
}

test.describe("Galaxy cosmic web", () => {
  test("counted strands at the overview carry the width formula and an opaque rest tone", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openGalaxy(page);

    const web = await page.evaluate(() => window.__atlasCosmos!.stats()!.web);
    expect(web.alpha).toBeCloseTo(1, 2);
    expect(web.items.length).toBeGreaterThanOrEqual(1);
    for (const item of web.items) expect(Math.abs(item.width - widthOf(item.count))).toBeLessThanOrEqual(0.01);

    const tone = await page.evaluate(() => {
      const probe = window.__atlasCosmos!;
      const style = getComputedStyle(document.documentElement);
      const hex = (name: string) => {
        const v = style.getPropertyValue(name).trim().replace("#", "");
        return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
      };
      const bg = hex("--map-canvas-bg-near");
      const domain = hex("--map-galaxy-domain");
      const ink = bg.map((c, i) => Math.round(c + (domain[i]! - c) * 0.42));
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
      const contrast = (lum(ink) + 0.05) / (lum(bg) + 0.05);

      const items = probe.stats()!.web.items.filter((i) => i.tone === "rest");
      const strand = [...items].sort((a, b) => Number(a.counted) - Number(b.counted) || b.width - a.width)[0]!;
      const galaxies = probe.layout()!.galaxies;
      const a = galaxies.find((g) => g.id === strand.from)!;
      const b = galaxies.find((g) => g.id === strand.to)!;
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="cosmos-map"] canvas')!;
      const ctx = canvas.getContext("2d")!;
      const ratio = canvas.width / canvas.clientWidth;
      const chord = Math.hypot(b.sx - a.sx, b.sy - a.sy);
      const nx = -(b.sy - a.sy) / chord;
      const ny = (b.sx - a.sx) / chord;
      const at = strand.counted ? 0.4 : 0.5;
      const mx = a.sx + (b.sx - a.sx) * at;
      const my = a.sy + (b.sy - a.sy) * at;
      let best = Infinity;
      for (let s = -0.4 * chord; s <= 0.4 * chord; s += 0.5) {
        const x = Math.round((mx + nx * s) * ratio);
        const y = Math.round((my + ny * s) * ratio);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
        const px = ctx.getImageData(x, y, 1, 1).data;
        best = Math.min(best, Math.max(Math.abs(px[0]! - ink[0]!), Math.abs(px[1]! - ink[1]!), Math.abs(px[2]! - ink[2]!)));
      }
      return { contrast, best };
    });
    expect(tone.contrast).toBeGreaterThanOrEqual(3);
    expect(tone.best).toBeLessThanOrEqual(6);
    expect(errors).toEqual([]);
  });

  test("zooming in past ratio 2.2 removes every strand", async ({ page }) => {
    await openGalaxy(page);
    const box = (await page.getByTestId("cosmos-map").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, -400);
          return page.evaluate(() => window.__atlasCosmos!.camera().zoomRatio);
        },
        { intervals: [120] },
      )
      .toBeGreaterThanOrEqual(2.2);
    await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.interaction().kind)).toBe("none");
    const web = await page.evaluate(() => window.__atlasCosmos!.stats()!.web);
    expect(web.alpha).toBe(0);
    expect(web.items).toHaveLength(0);
  });

  test("hovering a galaxy counts exactly its strands", async ({ page }) => {
    await openGalaxy(page);
    const target = await page.evaluate(() => {
      const probe = window.__atlasCosmos!;
      const items = probe.stats()!.web.items;
      const galaxies = probe.layout()!.galaxies;
      const degree = (id: string) => items.filter((i) => i.from === id || i.to === id).length;
      const pick = [...galaxies].filter((g) => degree(g.id) > 0 && probe.hit(g.sx, g.sy).galaxy >= 0).sort((a, b) => degree(b.id) - degree(a.id))[0]!;
      return { id: pick.id, sx: pick.sx, sy: pick.sy };
    });
    const box = (await page.getByTestId("cosmos-map").boundingBox())!;
    await page.mouse.move(box.x + target.sx, box.y + target.sy);
    await expect.poll(() => page.evaluate((id) => window.__atlasCosmos!.stats()!.web.items.some((i) => i.tone === "lit" && (i.from === id || i.to === id)), target.id)).toBe(true);
    const items = await page.evaluate(() => window.__atlasCosmos!.stats()!.web.items);
    const touches = (i: { from: string; to: string }) => i.from === target.id || i.to === target.id;
    expect(items.filter((i) => i.counted)).toEqual(items.filter(touches));
    for (const item of items) expect(item.tone).toBe(touches(item) ? "lit" : "receded");
  });
});
