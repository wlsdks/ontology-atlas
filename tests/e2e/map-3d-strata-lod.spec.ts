import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForDomeEntered } from "./settle";

interface StrataLodProbe {
  active: boolean;
  capability: number;
  element: number;
  sheets: number;
  dust: number;
  chords: number;
  chordEdges: number;
  hiddenEdges: number;
}

interface WakeProbe {
  wake: () => void;
  dome: () => { lod: StrataLodProbe };
}

test.use({ viewport: { width: 1512, height: 982 } });

async function openStrata(page: Page, query: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem("atlas.appearance.galaxy", "off");
    localStorage.setItem("atlas.appearance.view3d", "on");
    localStorage.setItem("atlas.appearance.map-arrangement", "strata");
  });
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`);
  await waitForDomeEntered(page);
}

async function drawCallsPerFrame(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const probe = (window as unknown as { __atlasMap: WakeProbe }).__atlasMap;
        const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        let calls = 0;
        for (const name of ["stroke", "fill", "drawImage", "fillText", "strokeText", "fillRect", "strokeRect"]) {
          const original = proto[name];
          proto[name] = function (this: unknown, ...args: unknown[]) {
            calls += 1;
            return original.apply(this, args);
          };
        }
        const deadline = performance.now() + 30_000;
        const perFrame: number[] = [];
        let last = calls;
        const sample = () => {
          if (calls > last) perFrame.push(calls - last);
          last = calls;
          if (perFrame.length >= 24) {
            perFrame.sort((a, b) => a - b);
            resolve(perFrame[perFrame.length >> 1]);
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error(`the map drew ${perFrame.length} frames before the deadline`));
            return;
          }
          probe.wake();
          requestAnimationFrame(sample);
        };
        probe.wake();
        requestAnimationFrame(sample);
      }),
  );
}

async function lod(page: Page): Promise<StrataLodProbe> {
  return page.evaluate(() => (window as unknown as { __atlasMap: WakeProbe }).__atlasMap.dome().lod);
}

test("Strata's per-frame draw calls stay flat from 2,000 to 10,000 concepts", async ({ page }) => {
  test.setTimeout(120_000);
  await openStrata(page, "synth=2000&");
  const twoThousand = await drawCallsPerFrame(page);
  await openStrata(page, "synth=10000&");
  const tenThousand = await drawCallsPerFrame(page);
  console.log(`[strata-lod] draw calls per frame: ${twoThousand} at 2,000 concepts, ${tenThousand} at 10,000`);
  expect(tenThousand, "10,000 concepts draw no more than 1.5x the calls of 2,000").toBeLessThan(twoThousand * 1.5);
  expect(tenThousand).toBeLessThan(5_000);
  const state = await lod(page);
  expect(state).toMatchObject({ active: true, capability: 0, element: 0 });
  expect(state.dust).toBeGreaterThan(5_000);
  expect(state.sheets).toBeGreaterThan(0);
});

test("dependencies with a dust end ride counted domain chords within the same budget", async ({ page }) => {
  test.setTimeout(120_000);
  await openStrata(page, "synth=10000&synthDeps=1&");
  const calls = await drawCallsPerFrame(page);
  const state = await lod(page);
  console.log(
    `[strata-lod] 10,000 concepts with dependencies: ${calls} draw calls, ${state.chords} chords carrying ${state.chordEdges} dependencies, ${state.hiddenEdges} hidden inside one domain or outside every domain`,
  );
  expect(calls).toBeLessThan(5_000);
  expect(state.chords).toBeGreaterThan(0);
  expect(state.chordEdges).toBeGreaterThan(1_000);
});

test("a small vault never leaves the detailed Strata drawing", async ({ page }) => {
  await openStrata(page, "");
  expect(await lod(page)).toMatchObject({ active: false, capability: 1, element: 1, sheets: 0, dust: 0, chords: 0 });
});
