import { expect, test, type Page } from "@playwright/test";

import type { AtlasMapProbe } from "./atlas-map-probe";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled } from "./settle";

interface Frame {
  t: number;
  cam: [number, number, number] | null;
  pos: Record<string, [number, number]>;
}

interface SamplerWindow {
  __atlasMap?: AtlasMapProbe;
  __assembly: {
    frames: Frame[];
    kinds: Record<string, string>;
    parent: Record<string, string>;
    rafTimes: number[];
    pressedAt: number | null;
  };
}

async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as SamplerWindow;
    w.__assembly = { frames: [], kinds: {}, parent: {}, rafTimes: [], pressedAt: null };
    addEventListener(
      "pointerdown",
      () => {
        w.__assembly.pressedAt ??= performance.now();
      },
      { capture: true },
    );
    let tracked: Set<string> | null = null;
    let queued = false;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      raf((time) => {
        w.__assembly.rafTimes.push(performance.now());
        callback(time);
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          const probe = w.__atlasMap;
          const nodes = probe?.nodes() ?? [];
          if (nodes.length === 0) return;
          if (tracked === null) {
            tracked = new Set();
            for (const edge of probe?.edges() ?? []) {
              if (edge.kind === "contains") w.__assembly.parent[edge.targetId] = edge.sourceId;
            }
            const perKind: Record<string, number> = {};
            for (const node of nodes) {
              if ((perKind[node.kind] = (perKind[node.kind] ?? 0) + 1) > 30) continue;
              tracked.add(node.id);
              w.__assembly.kinds[node.id] = node.kind;
              const parent = w.__assembly.parent[node.id];
              if (parent) tracked.add(parent);
            }
          }
          const cam = probe?.camera();
          if (!cam) return;
          const pos: Record<string, [number, number]> = {};
          for (const node of nodes) {
            if (!tracked.has(node.id)) continue;
            pos[node.id] = [(node.x - cam.width / 2) / cam.scale + cam.x, (node.y - cam.height / 2) / cam.scale + cam.y];
          }
          w.__assembly.frames.push({
            t: performance.now(),
            cam: [cam.x, cam.y, cam.scale],
            pos,
          });
        });
      });
  });
}

function displacement(frames: Frame[]): number[] {
  const last = frames.at(-1)!.pos;
  return frames.map((frame) =>
    Object.keys(last).reduce((sum, id) => {
      const p = frame.pos[id];
      return p ? sum + Math.hypot(p[0] - last[id][0], p[1] - last[id][1]) : sum;
    }, 0),
  );
}

async function readFrames(page: Page) {
  return page.evaluate(() => (window as unknown as SamplerWindow).__assembly);
}

const STILL_THROUGH_TIER_HOLD = 60;

async function waitPastAssembly(page: Page): Promise<void> {
  await waitForMapSettled(page, { frames: STILL_THROUGH_TIER_HOLD });
}

test.describe("first-open map assembly", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await installSampler(page);
  });

  test("the tiers rise in order out of a still project under a still camera, then the map sleeps", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/ko/topology/?synth=300&guides=off&e2e=1");
    await waitPastAssembly(page);
    const { frames, kinds, parent } = await readFrames(page);
    const d = displacement(frames);
    const start = d.findIndex((v) => v > 0.5);
    expect(start).toBeGreaterThanOrEqual(0);
    const motion = frames.slice(start);

    const projectId = Object.keys(kinds).find((id) => kinds[id] === "project")!;
    const projectPath = motion.map((f) => f.pos[projectId]).filter(Boolean);
    expect(new Set(projectPath.map((p) => p.join(","))).size).toBe(1);

    expect(new Set(motion.map((f) => JSON.stringify(f.cam))).size).toBe(1);

    const leftParent = (kind: string) => {
      const index = motion.findIndex((frame) =>
        Object.keys(kinds).some((id) => {
          const pid = parent[id];
          const a = frame.pos[id];
          const b = pid ? frame.pos[pid] : undefined;
          return kinds[id] === kind && a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5;
        }),
      );
      return index < 0 ? Infinity : motion[index].t;
    };
    const domainAt = leftParent("domain");
    const capabilityAt = leftParent("capability");
    expect(domainAt).toBeLessThan(capabilityAt);
    expect(capabilityAt).toBeLessThan(Infinity);

    const total = Math.max(...d);
    const shares = [];
    for (let i = start + 1; i < d.length; i += 1) {
      const interval = frames[i].t - frames[i - 1].t;
      if (interval <= 0) continue;
      shares.push(((d[i - 1] - d[i]) / total) * Math.max(1, 16.7 / interval));
    }
    const firstMoving = shares.find((s) => s > 0) ?? 0;
    expect(firstMoving).toBeGreaterThan(0);
    expect(firstMoving).toBeLessThanOrEqual(0.2);
    expect(Math.max(...shares)).toBeLessThanOrEqual(0.25);

    await page.waitForFunction(
      () => {
        const times = (window as unknown as SamplerWindow).__assembly.rafTimes;
        return performance.now() - (times.at(-1) ?? 0) > 3_000;
      },
      undefined,
      { polling: 250, timeout: 60_000 },
    );
  });

  test("a press mid-assembly lands every concept on the next frames", async ({ page }) => {
    await page.goto("/ko/topology/?synth=300&guides=off&e2e=1");
    const canvas = page.getByTestId("ontology-map-canvas");
    await canvas.waitFor();
    await page.waitForFunction(() => {
      const frames = (window as unknown as SamplerWindow).__assembly.frames;
      const first = frames[0]?.pos;
      const last = frames.at(-1)?.pos;
      if (!first || !last) return false;
      return Object.keys(first).some((id) => last[id] && Math.hypot(last[id][0] - first[id][0], last[id][1] - first[id][1]) > 2);
    });
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height - 12);
    await page.mouse.down();
    await page.mouse.up();
    await waitForMapSettled(page);
    const { frames, pressedAt } = await readFrames(page);
    expect(pressedAt).not.toBeNull();
    const d = displacement(frames);
    const after = frames.map((f, i) => ({ t: f.t, d: d[i] })).filter((f) => f.t > pressedAt!);
    expect(Math.max(...d)).toBeGreaterThan(0.5);
    expect(after.slice(2).every((f) => f.d < 0.5)).toBe(true);
  });

  test("a second visit in the same session opens assembled", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/ko/topology/?guides=off&e2e=1");
    await waitPastAssembly(page);
    expect(Math.max(...displacement((await readFrames(page)).frames))).toBeGreaterThan(0.5);

    const rail = page.getByTestId("app-nav-rail");
    await rail.getByTestId("app-nav-rail-item-library").click();
    await expect(page).toHaveURL(/\/library/);
    await page.evaluate(() => {
      (window as unknown as SamplerWindow).__assembly.frames = [];
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/topology\/\?guides=off&e2e=1$/);
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
    await waitPastAssembly(page);
    expect(Math.max(...displacement((await readFrames(page)).frames))).toBeLessThan(0.5);
  });

  test("a ?p= arrival opens assembled", async ({ page }) => {
    await page.goto("/ko/topology/?p=capability%3Acheckout&guides=off&e2e=1");
    await waitPastAssembly(page);
    expect(Math.max(...displacement((await readFrames(page)).frames))).toBeLessThan(0.5);
  });

  test("reduced motion places every concept on the first frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ko/topology/?synth=300&guides=off&e2e=1");
    await waitPastAssembly(page);
    expect(Math.max(...displacement((await readFrames(page)).frames))).toBeLessThan(0.5);
  });
});
