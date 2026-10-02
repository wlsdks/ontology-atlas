import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodEvidenceVault } from "./hex-board-vaults";

type Pt = [number, number];
interface Face {
  id: string;
  top: Pt[];
  walls: Pt[][];
}
type ReliefProbe = Window & {
  __atlasHexRelief?: {
    setPitch(p: number, opts?: { animate?: boolean }): void;
    state(): { pitch: number; target: number; animating: boolean; frames: number };
    paintedFaces(): Face[];
  };
};

const CHROME_SETTLE_MS = 600;
const LEGEND = "▲ 높이와 숫자 = 이것에 의존한다고 적은 개념 수 (직접)";

async function openBoard(page: Page, { reduced, relief, pick }: { reduced: boolean; relief: boolean; pick: "hex" | "flat" }) {
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.addInitScript((on: boolean) => {
    if (sessionStorage.getItem("relief-seeded")) return;
    sessionStorage.setItem("relief-seeded", "1");
    localStorage.setItem("atlas.appearance.hex-relief", on ? "on" : "off");
  }, relief);
  const vault = dogfoodEvidenceVault();
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  if (pick === "hex") await chooseHex(page);
}

async function chooseHex(page: Page) {
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
}

async function still(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => {
          const s = (window as ReliefProbe).__atlasHexRelief?.state();
          const frame = document.querySelector<HTMLCanvasElement>('[data-testid="hex-board-map"] canvas')?.dataset.frame ?? "";
          return JSON.stringify([s?.pitch, s?.animating, frame]);
        });
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [250, 250, 250, 250, 250, 250, 250, 250] },
    )
    .toBe(true);
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true");
}

async function faces(page: Page): Promise<Face[]> {
  await page.evaluate(() => (window as ReliefProbe).__atlasHexRelief!.paintedFaces());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate(() => (window as ReliefProbe).__atlasHexRelief!.paintedFaces());
}

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function lastPainted(p: Pt, painted: Face[]): string | null {
  for (let i = painted.length - 1; i >= 0; i -= 1) {
    const f = painted[i]!;
    if (inside(p, f.top) || f.walls.some((w) => inside(p, w))) return f.id;
  }
  return null;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("the hex board tilts into relief by chip and Shift-drag, and a click picks the prism drawn under it", async ({ page }) => {
  test.setTimeout(300_000);
  await openBoard(page, { reduced: true, relief: false, pick: "hex" });
  const map = page.getByTestId("hex-board-map");
  await still(page);
  await expect(map).toHaveAttribute("data-hex-relief", "off");
  await expect(map).toHaveAttribute("data-hex-relief-pitch", "0.000");

  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="hex-board-map"]')!;
    const seen: string[] = [];
    (window as unknown as { __pitches: string[] }).__pitches = seen;
    new MutationObserver(() => seen.push(root.dataset.hexReliefPitch ?? "")).observe(root, { attributes: true, attributeFilter: ["data-hex-relief-pitch"] });
  });
  await page.getByTestId("hex-board-relief").click();
  await expect(map).toHaveAttribute("data-hex-relief-pitch", "0.750");
  const pitches = await page.evaluate(() => (window as unknown as { __pitches: string[] }).__pitches);
  expect(pitches[0], "reduced motion lands on the first frame").toBe("0.750");
  await expect(map).toHaveAttribute("data-hex-relief", "on");
  await expect(page.getByTestId("hex-board-relief")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("hex-board-relief-legend")).toHaveText(LEGEND);
  expect(await page.evaluate(() => localStorage.getItem("atlas.appearance.hex-relief"))).toBe("on");
  await still(page);

  const canvas = map.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const random = rng(20261003);
  const painted = await faces(page);
  expect(painted.length).toBeGreaterThan(20);
  const onCanvas = (p: Pt) =>
    page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === "CANVAS", [box.x + p[0], box.y + p[1]] as Pt);
  const points: Pt[] = [];
  const shuffled = [...painted].sort(() => random() - 0.5);
  for (const f of shuffled) {
    if (points.length >= 20) break;
    const c: Pt = [f.top.reduce((s, v) => s + v[0], 0) / 6, f.top.reduce((s, v) => s + v[1], 0) / 6];
    if (await onCanvas(c)) points.push(c);
  }
  for (const f of shuffled.filter((f) => f.walls.length > 0)) {
    if (points.length >= 40) break;
    const w = f.walls[Math.floor(random() * f.walls.length)]!;
    const a = 0.2 + random() * 0.6;
    const b = 0.2 + random() * 0.6;
    const top: Pt = [w[0]![0] + (w[1]![0] - w[0]![0]) * a, w[0]![1] + (w[1]![1] - w[0]![1]) * a];
    const base: Pt = [w[3]![0] + (w[2]![0] - w[3]![0]) * a, w[3]![1] + (w[2]![1] - w[3]![1]) * a];
    const p: Pt = [top[0] + (base[0] - top[0]) * b, top[1] + (base[1] - top[1]) * b];
    if (await onCanvas(p)) points.push(p);
  }
  expect(points).toHaveLength(40);

  const focus = async () => (JSON.parse((await canvas.getAttribute("data-frame")) ?? "{}") as { focus: string | null }).focus;
  const misses: string[] = [];
  for (const p of points) {
    const now = await faces(page);
    const expected = lastPainted(p, now);
    await page.mouse.click(box.x + p[0], box.y + p[1]);
    if (expected) await expect.poll(focus, { timeout: 2_000 }).not.toBeNull().catch(() => {});
    const chosen = await focus();
    if (chosen !== expected) misses.push(`${p.map(Math.round).join(",")}: drawn ${expected}, picked ${chosen}`);
    if (chosen) {
      await page.keyboard.press("Escape");
      await expect.poll(focus).toBeNull();
    }
    await page.waitForTimeout(CHROME_SETTLE_MS);
    await still(page);
  }
  expect(misses, "clicks that picked a prism other than the one drawn under them").toEqual([]);

  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const drag = async (dy: number, shift: boolean) => {
    await page.mouse.move(centre.x, centre.y);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(centre.x, centre.y + (dy * i) / 10);
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
    await still(page);
  };
  await drag(200, true);
  await expect(map).toHaveAttribute("data-hex-relief-pitch", "0.000");
  await expect(map).toHaveAttribute("data-hex-relief", "off");
  await drag(-200, true);
  await expect(map).toHaveAttribute("data-hex-relief-pitch", "0.750");
  await expect(map).toHaveAttribute("data-hex-relief", "on");
  const before = await canvas.getAttribute("data-frame");
  await drag(-120, false);
  await expect(map).toHaveAttribute("data-hex-relief-pitch", "0.750");
  expect(JSON.parse((await canvas.getAttribute("data-frame"))!).offset).not.toEqual(JSON.parse(before!).offset);

  const frames = await page.evaluate(() => (window as ReliefProbe).__atlasHexRelief!.state().frames);
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => (window as ReliefProbe).__atlasHexRelief!.state().frames), "frames painted at rest").toBe(frames);
});

test("a remembered relief comes back on the next visit", async ({ page }) => {
  test.setTimeout(240_000);
  await openBoard(page, { reduced: true, relief: true, pick: "hex" });
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-relief-pitch", "0.750");
  await page.reload({ waitUntil: "domcontentloaded" });
  const open = page.getByTestId("first-run-open");
  if (await open.isVisible({ timeout: 10_000 }).catch(() => false)) await open.click();
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 90_000 });
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-relief-pitch", "0.750");
  expect(await page.evaluate(() => localStorage.getItem("atlas.appearance.hex-relief"))).toBe("on");
});

async function landing(page: Page): Promise<Map<string, number>> {
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-hex").click();
  const finals = await page.waitForFunction(
    () => {
      const morph = (window as unknown as { __atlasMapMorph?: { live(): { durationMs: number } | null; marks(at?: number): { id: string; x: number; y: number }[] } }).__atlasMapMorph;
      const live = morph?.live();
      return live && live.durationMs > 0 ? morph!.marks(live.durationMs) : null;
    },
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
  const ghost = new Map(((await finals.jsonValue()) as { id: string; x: number; y: number }[]).map((m) => [m.id, m]));
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-ready", "true", { timeout: 60_000 });
  await page.waitForTimeout(CHROME_SETTLE_MS);
  await still(page);
  const mirror = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-hex-id][data-mark]")].map((el) => {
      const [x, y] = el.dataset.mark!.split(",").map(Number) as [number, number];
      return { id: el.dataset.hexId!, x, y };
    }),
  );
  return new Map(mirror.filter((m) => ghost.has(m.id)).map((m) => [m.id, Math.hypot(ghost.get(m.id)!.x - m.x, ghost.get(m.id)!.y - m.y)]));
}

test("the glide from Flat lands on the relief's drawn tops as closely as on the top-down board", async ({ page }) => {
  test.setTimeout(240_000);
  await openBoard(page, { reduced: false, relief: false, pick: "flat" });
  await page.waitForTimeout(1_500);
  const flat = await landing(page);
  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-flat").click();
  await expect(page.getByTestId("hex-board-map")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("atlas.appearance.hex-relief", "on"));
  await page.waitForTimeout(1_500);
  const relief = await landing(page);
  await expect(page.getByTestId("hex-board-map")).toHaveAttribute("data-hex-relief-pitch", "0.750");
  expect(relief.size).toBeGreaterThan(20);
  const worse = [...relief].filter(([id, d]) => d > 1.3 * (flat.get(id) ?? 0) + 1).map(([id, d]) => `${id}: ${d.toFixed(1)} px in relief, ${flat.get(id)?.toFixed(1)} px top-down`);
  expect(worse, "ghost final marks further from the drawn tops in relief than top-down").toEqual([]);
});
