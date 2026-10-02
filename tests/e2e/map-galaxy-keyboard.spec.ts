import { expect, test, type Page } from "@playwright/test";
import "./atlas-cosmos-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

async function openGalaxy(page: Page, query = "") {
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    for (const key of ["galaxy", "view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
  });
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`, { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.arrival().active ?? true), { timeout: 20_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.pendingBuilds ?? 1)).toBe(0);
}

async function grabMap(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await expect
    .poll(() => page.evaluate(() => (document.activeElement?.closest("[data-testid='cosmos-map']") ? document.activeElement.getAttribute("data-surface-role") : "")))
    .toBe("map-canvas");
}

async function focusByKeyboard(page: Page) {
  await page.keyboard.press("Shift");
  await page.getByTestId("ontology-map-canvas").focus();
}

const selected = (page: Page) => page.evaluate(() => window.__atlasCosmos!.selection().nodeId);

async function pressAndWait(page: Page, from: string | null): Promise<string | null> {
  await page.keyboard.press("ArrowRight");
  try {
    await expect.poll(() => selected(page), { timeout: 1_000 }).not.toBe(from);
  } catch {
    return from;
  }
  return selected(page);
}

test.describe("Galaxy keyboard walk and mirror", () => {
  test("G M grabs the canvas", async ({ page }) => {
    await openGalaxy(page);
    await grabMap(page);
  });

  test("the keyboard-focused canvas outlines in the indigo focus token", async ({ page }) => {
    await openGalaxy(page);
    await focusByKeyboard(page);
    const colours = await page.evaluate(() => {
      const canvas = document.activeElement as HTMLElement;
      const swatch = document.createElement("span");
      swatch.style.transition = "none";
      swatch.style.color = "var(--color-indigo-focus-ring)";
      document.body.append(swatch);
      const token = getComputedStyle(swatch).color;
      swatch.remove();
      const style = getComputedStyle(canvas);
      return { outline: style.outlineColor, style: style.outlineStyle, token };
    });
    expect(colours.style).not.toBe("none");
    expect(colours.outline).toBe(colours.token);
  });

  test("arrows select a concept, then walk right inside the ±60° cone", async ({ page }) => {
    await openGalaxy(page);
    await focusByKeyboard(page);
    expect(await selected(page)).toBeNull();
    const first = await pressAndWait(page, null);
    expect(first).not.toBeNull();
    const next = await pressAndWait(page, first);
    expect(next).not.toBe(first);
    const [a, b] = await page.evaluate(([x, y]) => [window.__atlasCosmos!.point(x!), window.__atlasCosmos!.point(y!)], [first, next]);
    const along = b!.x - a!.x;
    expect(along).toBeGreaterThan(0);
    expect(Math.abs(b!.y - a!.y)).toBeLessThanOrEqual(along * Math.tan(Math.PI / 3) + 0.5);
  });

  test("the rightmost galaxy announces a dead end once, then stays quiet for the cooldown", async ({ page }) => {
    await openGalaxy(page);
    await focusByKeyboard(page);
    await page.evaluate(() => {
      const w = window as unknown as { __walkLog: { keys: number[]; notices: number[] } };
      w.__walkLog = { keys: [], notices: [] };
      window.addEventListener("keydown", () => w.__walkLog.keys.push(performance.now()), true);
      new MutationObserver(() => w.__walkLog.notices.push(performance.now())).observe(document.querySelector("[data-testid='cosmos-walk-notice']")!, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    const log = () => page.evaluate(() => (window as unknown as { __walkLog: { keys: number[]; notices: number[] } }).__walkLog);
    let current: string | null = null;
    for (let i = 0; i < 60; i += 1) {
      const next = await pressAndWait(page, current);
      if (next === current) break;
      current = next;
    }
    await expect.poll(async () => (await log()).notices.length).toBeGreaterThanOrEqual(1);
    const atDeadEnd = await log();
    expect(atDeadEnd.notices).toHaveLength(1);
    const lastKey = atDeadEnd.keys[atDeadEnd.keys.length - 1]!;
    expect(atDeadEnd.notices[0]! - lastKey).toBeLessThanOrEqual(300);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    const until = atDeadEnd.notices[0]! + 1_150;
    const left = await page.evaluate((t) => t - performance.now(), until);
    // measurement window: the live region must stay unchanged until the 1.2 s cooldown has nearly passed.
    if (left > 0) await page.waitForTimeout(left);
    expect((await log()).notices).toHaveLength(1);
  });

  test("a drag writes no data-mark until the camera rests, then one write per row", async ({ page }) => {
    await openGalaxy(page, "synth=2000&synthDeps=1&");
    const list = page.getByTestId("cosmos-galaxy-list");
    await expect(list).toHaveAttribute("data-cosmos-ready", "true", { timeout: 20_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __markLog: { marks: string[]; notReady: number } };
      w.__markLog = { marks: [], notReady: 0 };
      const root = document.querySelector("[data-testid='cosmos-galaxy-list']") as HTMLElement;
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as HTMLElement;
          if (r.attributeName === "data-mark") w.__markLog.marks.push(el.dataset.cosmosId ?? "");
          if (r.attributeName === "data-cosmos-ready" && el.dataset.cosmosReady === "false") w.__markLog.notReady += 1;
        }
      }).observe(root, { attributes: true, subtree: true, attributeFilter: ["data-mark", "data-cosmos-ready"] });
    });
    const markLog = () => page.evaluate(() => (window as unknown as { __markLog: { marks: string[]; notReady: number } }).__markLog);
    const room = await page.evaluate(() => window.__atlasCosmos!.room());
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    const x0 = box.x + room.x + room.width * 0.3;
    const y0 = box.y + room.y + room.height * 0.8;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 40; i += 1) await page.mouse.move(x0 + (300 * i) / 40, y0);
    expect((await markLog()).marks).toHaveLength(0);
    await page.mouse.up();
    const upAt = Date.now();
    await expect.poll(async () => (await markLog()).notReady, { timeout: 1_000 }).toBeGreaterThanOrEqual(1);
    await expect(list).toHaveAttribute("data-cosmos-ready", "true", { timeout: 1_000 });
    expect(Date.now() - upAt).toBeLessThanOrEqual(1_000);
    const after = await markLog();
    const rows = await list.locator("[data-mark]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.cosmosId ?? ""));
    expect(rows.length).toBeGreaterThan(1);
    expect([...after.marks].sort()).toEqual([...rows].sort());
  });
});
