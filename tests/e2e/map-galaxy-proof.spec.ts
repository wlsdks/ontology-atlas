import { expect, test, type Page } from "@playwright/test";
import { waitForCosmosStill } from "./atlas-cosmos-probe";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { seedFirstRunSeen } from "./first-run-seed";
import { dogfoodEvidenceVault } from "./hex-board-vaults";
import { waitForAnimationsDone, waitForMapSettled } from "./settle";

const CANVAS = '[data-testid="ontology-map-canvas"]';
const POINTS = 40;
const MISSES = 10;
const MAX_OFFSET_PX = 6;
const NEAREST_PX = 10;
const MISS_CLEARANCE_PX = 14;

async function cosmosReady(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0), { timeout: 90_000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const probe = window.__atlasCosmos!;
          const stats = probe.stats();
          return Boolean(stats && stats.pendingBuilds === 0 && !probe.arrival().active);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await waitForCosmosStill(page);
}

async function pickGalaxy(page: Page): Promise<void> {
  await page.getByTestId("topology-view-3d").click();
  await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
  await page.getByTestId("topology-view-3d-choice-galaxy").click();
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await cosmosReady(page);
}

async function openSample(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    for (const key of ["galaxy", "view3d", "territories", "hex-board"]) window.localStorage.setItem(`atlas.appearance.${key}`, "off");
  });
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await waitForMapSettled(page);
  await pickGalaxy(page);
}

async function openDogfood(page: Page): Promise<void> {
  const vault = dogfoodEvidenceVault();
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/en/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  await pickGalaxy(page);
}

async function clearSelection(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.evaluate(() => window.__atlasCosmos!.selection().nodeId)); i += 1) {
    await page.locator(CANVAS).focus();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.selection().nodeId)).toBeNull();
  }
}

interface Frame {
  x: number;
  y: number;
  scale: number;
}

async function flyInto(page: Page, id: string): Promise<Frame> {
  await clearSelection(page);
  await waitForCosmosStill(page);
  await page.evaluate((galaxy) => window.__atlasCosmos!.flyTo(galaxy), id);
  await waitForCosmosStill(page);
  return page.evaluate(() => {
    const { x, y, scale } = window.__atlasCosmos!.camera();
    return { x, y, scale };
  });
}

function expectSameFrame(now: Frame, recorded: Frame, name: string): void {
  const drift = Math.max(Math.abs(now.x - recorded.x), Math.abs(now.y - recorded.y)) * recorded.scale;
  expect(drift, `${name}: the camera returns to the recorded frame (px)`).toBeLessThan(0.5);
  expect(Math.abs(now.scale / recorded.scale - 1), `${name}: the recorded zoom`).toBeLessThan(0.001);
}

interface Plan {
  hits: { x: number; y: number; expected: string }[];
  misses: { x: number; y: number }[];
}

async function planClicks(page: Page, galaxy: string, hitBudget: number): Promise<Plan> {
  await page.evaluate(() => window.__atlasCosmos!.armPaint(true));
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.painted().length)).toBeGreaterThan(0);
  const plan = await page.evaluate(
    ({ selector, galaxy, hitBudget, misses, maxOffset, nearestPx, clearance }) => {
      const probe = window.__atlasCosmos!;
      const canvas = document.querySelector(selector)!;
      const box = canvas.getBoundingClientRect();
      const room = probe.room();
      const painted = probe.painted();
      const inside = (x: number, y: number) =>
        x > room.x + 24 && x < room.x + room.width - 24 && y > room.y + 24 && y < room.y + room.height - 24 && document.elementFromPoint(box.x + x, box.y + y) === canvas;
      const nearest = (x: number, y: number) => {
        let best: string | null = null;
        let bestD = Infinity;
        for (const p of painted) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d <= nearestPx && d <= bestD) [best, bestD] = [p.id, d];
        }
        return best;
      };
      const usable = painted.filter((p) => inside(p.x, p.y));
      const stride = Math.max(1, Math.floor(usable.length / hitBudget));
      const hits: { x: number; y: number; expected: string }[] = [];
      for (let i = 0; i < usable.length && hits.length < hitBudget; i += stride) {
        const p = usable[i]!;
        const angle = hits.length * 2.399;
        const offset = (hits.length % 4) * (maxOffset / 3);
        const x = p.x + Math.cos(angle) * offset;
        const y = p.y + Math.sin(angle) * offset;
        const expected = nearest(x, y);
        if (expected && inside(x, y)) hits.push({ x: box.x + x, y: box.y + y, expected });
      }
      const g = probe.layout()!.galaxies.find((item) => item.id === galaxy)!;
      const found: { x: number; y: number }[] = [];
      for (let i = 0; i < 4000 && found.length < misses; i += 1) {
        const r = g.rho * Math.sqrt(((i * 0.618034) % 1) * 0.8);
        const a = i * 2.399;
        const x = g.sx + Math.cos(a) * r;
        const y = g.sy + Math.sin(a) * r;
        if (inside(x, y) && painted.every((p) => Math.hypot(p.x - x, p.y - y) >= clearance)) found.push({ x: box.x + x, y: box.y + y });
      }
      return { hits, misses: found };
    },
    { selector: CANVAS, galaxy, hitBudget, misses: MISSES, maxOffset: MAX_OFFSET_PX, nearestPx: NEAREST_PX, clearance: MISS_CLEARANCE_PX },
  );
  await page.evaluate(() => window.__atlasCosmos!.armPaint(false));
  return plan;
}

async function proveSelection(page: Page, name: string): Promise<void> {
  const largest = await page.evaluate(() =>
    window.__atlasCosmos!.layout()!.galaxies.slice().sort((a, b) => b.members - a.members).slice(0, 3).map((g) => g.id),
  );
  const panel = page.getByTestId("map-detail-panel");
  let selected = 0;
  let total = 0;
  let missSelected = 0;
  let missTotal = 0;
  for (const [index, galaxy] of largest.entries()) {
    const camera = await flyInto(page, galaxy);
    const budget = Math.ceil((POINTS - total) / (largest.length - index));
    const plan = await planClicks(page, galaxy, budget);
    expect(plan.hits.length, `${name}: click points in ${galaxy}`).toBe(budget);
    for (const point of plan.hits) {
      expectSameFrame(await flyInto(page, galaxy), camera, name);
      await page.mouse.click(point.x, point.y);
      total += 1;
      const got = await page.evaluate(() => window.__atlasCosmos!.selection().nodeId);
      if (got === point.expected) selected += 1;
      else console.log(`[galaxy-proof] ${name}: expected ${point.expected}, got ${got}`);
      await expect(panel).toHaveAttribute("data-selected-node-id", point.expected);
      await expect(panel).toContainText((await panel.getAttribute("data-selected-node-title")) ?? "\u0000");
    }
    if (index === 0) {
      for (const point of plan.misses) {
        expectSameFrame(await flyInto(page, galaxy), camera, name);
        await page.mouse.click(point.x, point.y);
        await waitForCosmosStill(page);
        missTotal += 1;
        if (await page.evaluate(() => window.__atlasCosmos!.selection().nodeId)) missSelected += 1;
      }
    }
  }
  console.log(`[galaxy-proof] ${name}: ${selected}/${total} selected as painted; ${missSelected}/${missTotal} empty points selected`);
  expect(total).toBe(POINTS);
  expect(selected).toBe(POINTS);
  expect(missTotal).toBe(MISSES);
  expect(missSelected).toBe(0);
}

test.describe("names at 10,000 concepts", () => {
  for (const size of [
    { width: 1512, height: 982, all: true },
    { width: 1440, height: 900, all: true },
    { width: 1040, height: 720, all: false },
  ]) {
    test(`synth 10,000 at ${size.width}x${size.height} names its galaxies`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await seedFirstRunSeen(page);
      await page.goto("/en/topology/?view=galaxy&synth=10000&synthDeps=1&guides=off&e2e=1", { waitUntil: "domcontentloaded" });
      await cosmosReady(page);
      const result = await page.evaluate(() => {
        const probe = window.__atlasCosmos!;
        const ids = probe.layout()!.galaxies.map((g) => g.id);
        const named = new Set(probe.stats()!.labels.filter((l) => l.kind === "galaxy").map((l) => l.id));
        const unnamed = ids.filter((id) => !named.has(id));
        const mirrored = unnamed.filter((id) => document.querySelector(`[data-testid="cosmos-galaxy-list"] [data-cosmos-id="${CSS.escape(id)}"]`));
        return { galaxies: ids.length, named: ids.length - unnamed.length, unnamed: unnamed.length, mirrored: mirrored.length };
      });
      console.log(`[galaxy-proof] names ${size.width}x${size.height}: ${result.named}/${result.galaxies}`);
      expect(result.galaxies).toBe(33);
      if (size.all) expect(result.named).toBe(result.galaxies);
      else expect(result.named).toBeGreaterThanOrEqual(30);
      expect(result.mirrored).toBe(result.unnamed);
    });
  }
});

test("the sample selects 40 of 40 points as painted and nothing between stars", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openSample(page);
  await proveSelection(page, "sample");
});

test("the dogfood vault selects 40 of 40 points as painted and nothing between stars", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openDogfood(page);
  await proveSelection(page, "dogfood");
});

test("opening Galaxy from the picker runs the cosmos layout once", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openSample(page);
  expect(await page.evaluate(() => window.__atlasCosmos!.layoutRuns())).toBe(1);
});
