import { expect, test, type Page } from "@playwright/test";

import "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

const ROUTE = "/ko/topology/?e2e=1&guides=off";
const SAMPLES = 24;

interface RevealFrame {
  t: number;
  selected: string | null;
  edges: Record<string, number[]>;
}

interface RevealWindow {
  __reveal?: { frames: RevealFrame[]; run: boolean };
  __atlasMap?: { setComets?: (on: boolean) => void };
}

async function openMap(page: Page) {
  await page.setViewportSize({ width: 1400, height: 860 });
  await seedFirstRunSeen(page);
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => window.__atlasMap?.nodes().filter((n) => !n.hidden).length ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await waitForMapStill(page);
  await page.evaluate(() => (window as unknown as RevealWindow).__atlasMap?.setComets?.(false));
}

async function pickTarget(page: Page): Promise<{ id: string; label: string }> {
  const target = await page.evaluate(() => {
    const map = window.__atlasMap!;
    const nodes = new Map(map.nodes().map((n) => [n.id, n]));
    const onScreen = (id: string) => {
      const n = nodes.get(id);
      return !!n && !n.hidden && (n.alpha ?? 1) > 0.5 && n.x > 60 && n.y > 60 && n.x < innerWidth - 480 && n.y < innerHeight - 60;
    };
    const count = new Map<string, { all: number; outgoing: number }>();
    for (const e of map.edges()) {
      if (!onScreen(e.sourceId) || !onScreen(e.targetId)) continue;
      if (Math.hypot(e.bx - e.ax, e.by - e.ay) < 60) continue;
      for (const end of [e.sourceId, e.targetId]) {
        if (nodes.get(end)?.kind === "project") continue;
        const c = count.get(end) ?? { all: 0, outgoing: 0 };
        c.all += 1;
        if (end === e.sourceId) c.outgoing += 1;
        count.set(end, c);
      }
    }
    const [id] =
      [...count.entries()]
        .filter(([, c]) => c.all >= 3 && c.outgoing >= 1)
        .sort((a, b) => b[1].outgoing - a[1].outgoing || b[1].all - a[1].all)[0] ?? [];
    return id ? { id, label: nodes.get(id)!.label } : null;
  });
  expect(target, "a concept with three drawn relations is on screen").not.toBeNull();
  return target!;
}

async function startSampler(page: Page, targetId: string) {
  await page.evaluate(
    ({ targetId, samples }) => {
      const w = window as unknown as RevealWindow;
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
      const ctx = canvas.getContext("2d")!;
      const state = { frames: [] as RevealFrame[], run: true };
      w.__reveal = state;
      const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const sample = () => {
        const map = window.__atlasMap!;
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width;
        const sy = canvas.height / rect.height;
        const own = map
          .edges()
          .filter((e) => (e.sourceId === targetId || e.targetId === targetId) && !(e as { hidden?: boolean }).hidden);
        const xs = own.flatMap((e) => [e.ax, e.bx, e.controlX]);
        const ys = own.flatMap((e) => [e.ay, e.by, e.controlY]);
        if (own.length === 0) {
          state.frames.push({ t: performance.now(), selected: map.selection().nodeId, edges: {} });
          return;
        }
        const x0 = Math.max(0, Math.floor((Math.min(...xs) - 16) * sx));
        const y0 = Math.max(0, Math.floor((Math.min(...ys) - 16) * sy));
        const x1 = Math.min(canvas.width, Math.ceil((Math.max(...xs) + 16) * sx));
        const y1 = Math.min(canvas.height, Math.ceil((Math.max(...ys) + 16) * sy));
        const boxWidth = Math.max(1, x1 - x0);
        const boxHeight = Math.max(1, y1 - y0);
        const image = ctx.getImageData(x0, y0, boxWidth, boxHeight).data;
        const strip = (x: number, y: number, ux: number, uy: number) => {
          const values: number[] = [];
          for (let along = -4; along <= 4; along += 1) {
            for (let across = -1; across <= 1; across += 1) {
              const px = Math.min(boxWidth - 1, Math.max(0, Math.round((x + ux * along - uy * across * 0.5) * sx) - x0));
              const py = Math.min(boxHeight - 1, Math.max(0, Math.round((y + uy * along + ux * across * 0.5) * sy) - y0));
              values.push(lum(image, (py * boxWidth + px) * 4));
            }
          }
          return values;
        };
        const contrast = (x: number, y: number, ux: number, uy: number) => {
          const ground = strip(x - uy * 12, y + ux * 12, ux, uy);
          const base = ground.reduce((a, b) => a + b, 0) / ground.length;
          return Math.max(...strip(x, y, ux, uy).map((v) => Math.abs(v - base)));
        };
        const edges: Record<string, number[]> = {};
        for (const e of own) {
          const row: number[] = [];
          for (let i = 0; i < samples; i += 1) {
            const t = 0.15 + (0.7 * i) / (samples - 1);
            const u = 1 - t;
            const x = u * u * e.ax + 2 * u * t * e.controlX + t * t * e.bx;
            const y = u * u * e.ay + 2 * u * t * e.controlY + t * t * e.by;
            const tx = 2 * u * (e.controlX - e.ax) + 2 * t * (e.bx - e.controlX);
            const ty = 2 * u * (e.controlY - e.ay) + 2 * t * (e.by - e.controlY);
            const len = Math.hypot(tx, ty) || 1;
            row.push(contrast(x, y, tx / len, ty / len));
          }
          edges[`${e.sourceId}>${e.targetId}`] = row;
        }
        state.frames.push({ t: performance.now(), selected: map.selection().nodeId, edges });
      };
      const loop = () => {
        if (!state.run) return;
        setTimeout(() => {
          sample();
          requestAnimationFrame(loop);
        }, 0);
      };
      requestAnimationFrame(loop);
    },
    { targetId, samples: SAMPLES },
  );
}

async function selectBySearch(page: Page, label: string) {
  const palette = page.getByRole("dialog", { name: "이 지도에서 검색" });
  await page.locator('[data-testid="topology-concept-search"]').click();
  await expect(palette).toBeVisible();
  await page.keyboard.type(label);
  await expect(palette.locator('[role="option"][aria-selected="true"]')).toContainText(label);
  await expect(palette).toBeVisible();
  await page.keyboard.press("Enter");
}

async function collect(page: Page, targetId: string): Promise<RevealFrame[]> {
  await expect.poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null)).toBe(targetId);
  await waitForMapStill(page);
  await page.waitForFunction(
    () => {
      const frames = (window as unknown as RevealWindow).__reveal!.frames;
      if (frames.length < 12) return false;
      const sums = frames.slice(-10).map((f) => Object.values(f.edges).flat().reduce((a, b) => a + b, 0));
      const top = Math.max(...sums.map(Math.abs), 1);
      return Math.max(...sums) - Math.min(...sums) <= top * 0.005;
    },
    undefined,
    { timeout: 20_000 },
  );
  return page.evaluate(() => {
    const state = (window as unknown as RevealWindow).__reveal!;
    state.run = false;
    return state.frames;
  });
}

interface Analysis {
  focusIndex: number;
  progress: number[];
  shares: number[];
  pointProgress: (index: number) => number[][];
}

function analyse(frames: RevealFrame[], targetId: string): Analysis {
  const focusIndex = frames.findIndex((f) => f.selected === targetId);
  expect(focusIndex, "the sampler saw the frame before the focus").toBeGreaterThan(0);
  const before = frames[focusIndex - 1];
  const after = frames[frames.length - 1];
  const keys = Object.keys(after.edges).filter((k) => before.edges[k] && frames.slice(focusIndex).every((f) => f.edges[k]));
  expect(keys.length, "three relations stayed drawn through the reveal").toBeGreaterThanOrEqual(3);
  const total = keys.reduce((acc, k) => acc + after.edges[k].reduce((s, v, i) => s + v - before.edges[k][i], 0), 0);
  expect(Math.abs(total), "the selection changed the ink on its relations").toBeGreaterThan(keys.length * SAMPLES * 2);
  const progress = frames.slice(focusIndex - 1).map((f) =>
    keys.reduce((acc, k) => acc + f.edges[k].reduce((s, v, i) => s + v - before.edges[k][i], 0), 0) / total,
  );
  const shares = progress.slice(1).map((p, i) => {
    const interval = frames[focusIndex + i].t - frames[focusIndex + i - 1].t;
    return (p - progress[i]) * Math.max(1, 16.7 / interval);
  });
  const outgoing = keys.filter((k) => k.startsWith(`${targetId}>`));
  expect(outgoing.length, "one relation leaves the selected concept").toBeGreaterThanOrEqual(1);
  const pointProgress = (index: number) =>
    outgoing.map((k) =>
      frames[focusIndex - 1 + index].edges[k].map((v, i) => {
        const span = after.edges[k][i] - before.edges[k][i];
        return Math.abs(span) < 1 ? Number.NaN : (v - before.edges[k][i]) / span;
      }),
    );
  return { focusIndex, progress, shares, pointProgress };
}

const mean = (values: number[]) => {
  const finite = values.filter(Number.isFinite);
  return finite.reduce((a, b) => a + b, 0) / Math.max(1, finite.length);
};

test("a keyboard selection draws its relations source to target without a cut", async ({ page }) => {
  test.setTimeout(120_000);
  await openMap(page);
  const target = await pickTarget(page);
  await startSampler(page, target.id);
  await selectBySearch(page, target.label);
  const frames = await collect(page, target.id);
  const { progress, shares, pointProgress } = analyse(frames, target.id);

  const ffs = shares[0];
  const mfs = Math.max(...shares);
  test.info().annotations.push({ type: "reveal", description: JSON.stringify({ ffs, mfs, frames: shares.length }) });
  expect(ffs, "first focused frame carries at most a fifth of the change").toBeLessThanOrEqual(0.2);
  expect(mfs, "no frame is a hard cut").toBeLessThan(0.6);

  for (const q of [0.25, 0.5, 0.75]) {
    const index = progress.findIndex((p) => p >= q);
    expect(index, `the reveal passes ${q}`).toBeGreaterThan(0);
    const rows = pointProgress(index);
    const third = Math.floor(SAMPLES / 3);
    const source = mean(rows.flatMap((r) => r.slice(0, third)));
    const targetEnd = mean(rows.flatMap((r) => r.slice(-third)));
    test.info().annotations.push({ type: `reveal@${q}`, description: JSON.stringify({ source, target: targetEnd }) });
    expect(source, `at ${q} the source end is lit ahead of the target end`).toBeGreaterThan(targetEnd);
  }
});

test("under reduced motion the relations are lit on the first focused frame", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMap(page);
  const target = await pickTarget(page);
  await startSampler(page, target.id);
  await selectBySearch(page, target.label);
  const frames = await collect(page, target.id);
  const { progress } = analyse(frames, target.id);
  expect(progress[1], "all lit on the first focused frame").toBeGreaterThanOrEqual(0.85);
});
