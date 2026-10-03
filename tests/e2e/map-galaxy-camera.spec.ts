import { expect, test, type Page } from "@playwright/test";
import { waitForCosmosStill } from "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";

const CANVAS = '[data-testid="ontology-map-canvas"]';

async function openGalaxy(page: Page) {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?view=galaxy&e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.arrival().active)).toBe(false);
  await waitForCosmosStill(page);
}

const zoomRatio = (page: Page) => page.evaluate(() => window.__atlasCosmos!.camera().zoomRatio);
const selected = (page: Page) => page.evaluate(() => window.__atlasCosmos!.selection().nodeId);

async function liveStar(page: Page) {
  const star = await page.evaluate(() => {
    const probe = window.__atlasCosmos!;
    const biggest = probe.layout()!.galaxies.slice().sort((a, b) => b.members - a.members)[0]!;
    probe.flyTo(biggest.id);
    return biggest.id;
  });
  await waitForCosmosStill(page);
  await page.evaluate(() => window.__atlasCosmos!.armPaint(true));
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.painted().length)).toBeGreaterThan(0);
  const pick = await page.evaluate(
    ({ selector, domain }) => {
      const probe = window.__atlasCosmos!;
      const canvas = document.querySelector(selector)!;
      const box = canvas.getBoundingClientRect();
      const room = probe.room();
      return (
        probe
          .painted()
          .filter((p) => p.id !== domain && p.x > room.x + 40 && p.x < room.x + room.width - 40 && p.y > room.y + 40 && p.y < room.y + room.height - 40)
          .filter((p) => probe.hit(p.x, p.y).id === p.id && document.elementFromPoint(box.x + p.x, box.y + p.y) === canvas)
          .map((p) => ({ id: p.id, x: box.x + p.x, y: box.y + p.y }))[0] ?? null
      );
    },
    { selector: CANVAS, domain: star },
  );
  await page.evaluate(() => window.__atlasCosmos!.armPaint(false));
  expect(pick, "no live star clear of the chrome").not.toBeNull();
  return pick!;
}

test("Enter flies into a selected domain, Escape clears then returns to the overview, and 0 refits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openGalaxy(page);
  const domain = await page.evaluate(() => {
    const probe = window.__atlasCosmos!;
    const biggest = probe.layout()!.galaxies.slice().sort((a, b) => b.members - a.members)[0]!;
    probe.flyTo(biggest.id);
    return biggest.id;
  });
  await waitForCosmosStill(page);
  const box = (await page.locator(CANVAS).boundingBox())!;
  const nucleus = (await page.evaluate((id) => window.__atlasCosmos!.point(id), domain))!;
  await page.mouse.click(box.x + nucleus.x, box.y + nucleus.y);
  await expect.poll(() => selected(page)).toBe(domain);
  await waitForCosmosStill(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.press("0");
  await waitForCosmosStill(page);
  expect(Math.abs((await zoomRatio(page)) - 1)).toBeLessThan(0.01);

  await page.keyboard.press("Enter");
  await waitForCosmosStill(page);
  expect(await zoomRatio(page)).toBeGreaterThan(1.6);

  await page.locator(CANVAS).focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => selected(page)).toBeNull();
  await waitForCosmosStill(page);
  await page.locator(CANVAS).focus();
  await page.keyboard.press("Escape");
  await waitForCosmosStill(page);
  expect(Math.abs((await zoomRatio(page)) - 1)).toBeLessThan(0.01);

  await page.keyboard.press("=");
  await page.keyboard.press("=");
  await waitForCosmosStill(page);
  expect(await zoomRatio(page)).toBeGreaterThan(1.4);
  await page.keyboard.press("0");
  await waitForCosmosStill(page);
  expect(Math.abs((await zoomRatio(page)) - 1)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test("right-clicking a painted star opens the node context menu", async ({ page }) => {
  await openGalaxy(page);
  const star = await liveStar(page);
  await page.mouse.click(star.x, star.y, { button: "right" });
  const menu = page.getByTestId("map-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-label", /.+/);
});

test("a flick glides to rest with no overshoot", async ({ page }) => {
  await openGalaxy(page);
  const box = (await page.locator(CANVAS).boundingBox())!;
  const room = await page.evaluate(() => window.__atlasCosmos!.room());
  const from = { x: box.x + room.x + room.width * 0.3, y: box.y + room.y + room.height * 0.5 };
  await page.evaluate(() => {
    const w = window as unknown as { __flick: number[] };
    w.__flick = [];
    const sample = () => {
      w.__flick.push(window.__atlasCosmos!.camera().x);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const released = await page.evaluate(
    ({ selector, from }) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector(selector)!;
        const send = (type: string, x: number) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, bubbles: true, clientX: x, clientY: from.y }));
        let step = 0;
        const move = () => {
          step += 1;
          send("pointermove", from.x + step * 30);
          if (step < 8) return requestAnimationFrame(move);
          send("pointerup", from.x + step * 30);
          resolve((window as unknown as { __flick: number[] }).__flick.length);
        };
        requestAnimationFrame(move);
      }),
    { selector: CANVAS, from },
  );
  await page.mouse.up();
  await waitForCosmosStill(page);
  const result = await page.evaluate((start) => {
    const xs = (window as unknown as { __flick: number[] }).__flick.slice(start);
    const camera = window.__atlasCosmos!.camera();
    const glide = xs[0]! - camera.x;
    const overshoot = Math.max(0, ...xs.map((x) => (camera.x - x) * Math.sign(glide)));
    return { glidePx: Math.abs(glide) * camera.scale, overshootPx: overshoot * camera.scale };
  }, released);
  expect(result.glidePx, "the release was not read as a flick").toBeGreaterThan(20);
  expect(result.overshootPx).toBe(0);
});
