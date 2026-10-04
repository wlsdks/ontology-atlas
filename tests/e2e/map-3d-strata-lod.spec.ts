import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForDomeEntered } from "./settle";

interface StrataLodProbe {
  active: boolean;
  capability: number;
  element: number;
  sheets: number;
  dust: number;
  dustStates: { current: number; stale: number; unknown: number;
    };
  hoverSlot: number;
  hoverRamp: number;
  chords: number;
  chordEdges: number;
  hiddenEdges: number;
}

interface WakeProbe {
  wake: () => void;
  dome: () => { lod: StrataLodProbe;
    };
    idleDebug: () => {
        lastActiveMs: number;
    };
    nodes: () => {
        kind: string;
        x: number;
        y: number;
    }[];
    camera: () => {
        width: number;
    };
}

test.use({ viewport: { width: 1512, height: 982 } });

async function openStrata(page: Page, query: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem("atlas.appearance.structure", "off");
    localStorage.setItem("atlas.appearance.view3d", "on");
    localStorage.setItem("atlas.appearance.map-arrangement", "strata");
  });
  await page.goto(`/en/topology/?${query}guides=off&e2e=1`);
    await waitForDomeEntered(page);
    await page.waitForFunction(() => !(window as unknown as {
        __atlasMap: {
            dome: () => {
                lod: {
                    settling: boolean;
                };
            };
        };
    }).__atlasMap.dome().lod.settling);
}
async function drawCallsPerFrame(page: Page): Promise<number> {
    return page.evaluate(() => new Promise<number>((resolve, reject) => {
        const probe = (window as unknown as {
            __atlasMap: WakeProbe;
        }).__atlasMap;
        const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        let calls = 0;
        for (const name of ["stroke", "fill", "drawImage", "fillText", "strokeText", "fillRect", "strokeRect"]) {
            const original = proto[name];
            proto[name] = function (this: unknown, ...args: unknown[]) {
                calls += 1;
                return original.apply(this, args);
            };
        }
        const deadline = performance.now() + 30000;
        const perFrame: number[] = [];
        let last = calls;
        const sample = () => {
            if (calls > last)
                perFrame.push(calls - last);
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
    }));
}
async function lod(page: Page): Promise<StrataLodProbe> {
    return page.evaluate(() => (window as unknown as {
        __atlasMap: WakeProbe;
    }).__atlasMap.dome().lod);
}
async function pointAtBand(page: Page): Promise<void> {
    const box = await page.getByTestId("ontology-map-canvas").boundingBox();
    if (box === null)
        throw new Error("the map canvas has no box");
    const at = await page.evaluate(() => {
        const probe = (window as unknown as {
            __atlasMap: WakeProbe;
        }).__atlasMap;
        const width = probe.camera().width;
        let best: {
            x: number;
            y: number;
        } | null = null;
        for (const node of probe.nodes()) {
            if (node.kind !== "capability" || node.x < width * 0.45 || node.x > width * 0.8)
                continue;
            if (best === null || node.y > best.y)
                best = node;
        }
        return best;
    });
    if (at === null)
        throw new Error("no capability dust in the band to point at");
    await page.mouse.move(box.x + at.x, box.y + at.y + 1);
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            __atlasMap: WakeProbe;
        }).__atlasMap.dome().lod;
        return state.hoverSlot >= 0 && state.hoverRamp === 1;
    });
}
async function hiddenDependencyLine(page: Page): Promise<number> {
    const line = page.getByTestId("topology-light-legend-hidden-dependencies");
    await expect(line).toBeVisible();
    return Number(await line.getAttribute("data-hidden-dependencies"));
}
test("Strata's per-frame draw calls stay flat from 2,000 to 10,000 concepts", async ({ page }) => {
    test.setTimeout(120000);
    await openStrata(page, "synth=2000&");
    const twoThousand = await drawCallsPerFrame(page);
    await openStrata(page, "synth=10000&");
    const tenThousand = await drawCallsPerFrame(page);
    console.log(`[strata-lod] draw calls per frame: ${twoThousand} at 2,000 concepts, ${tenThousand} at 10,000`);
    expect(tenThousand, "10,000 concepts draw no more than 1.5x the calls of 2,000").toBeLessThan(twoThousand * 1.5);
    expect(tenThousand).toBeLessThan(5000);
    const state = await lod(page);
    expect(state).toMatchObject({ active: true, capability: 0, element: 0 });
    expect(state.dust).toBeGreaterThan(5000);
    expect(state.sheets).toBeGreaterThan(0);
});
test("a measured vault that is 85% stale keeps its stale concepts in the dust, marked, within the same budget", async ({ page }) => {
    test.setTimeout(120000);
    await openStrata(page, "synth=10000&");
    const unmeasured = await drawCallsPerFrame(page);
    await openStrata(page, "synth=10000&synthEvidence=85&");
    const measured = await drawCallsPerFrame(page);
    const state = await lod(page);
    console.log(`[strata-lod] 10,000 concepts, 85% stale: ${measured} draw calls (${unmeasured} unmeasured); dust ${JSON.stringify(state.dustStates)}`);
    expect(measured, "measured evidence draws no more than 1.5x the unmeasured calls").toBeLessThan(unmeasured * 1.5);
    expect(state.dust).toBeGreaterThan(5000);
    expect(state.dustStates.stale).toBeGreaterThan(state.dust * 0.8);
    expect(state.dustStates.current).toBeGreaterThan(0);
    await expect(page.getByTestId("topology-light-legend")).toHaveAttribute("data-evidence-availability", "measured");
});
test("dependencies with a dust end are counted on screen and ride directional chords for the pointed domain", async ({ page }) => {
    test.setTimeout(120000);
    await openStrata(page, "synth=10000&synthDeps=1&");
    const rest = await lod(page);
    expect(rest.chords).toBe(0);
    expect(rest.hiddenEdges).toBeGreaterThan(5000);
    await expect.poll(() => hiddenDependencyLine(page)).toBe(rest.hiddenEdges);
    await pointAtBand(page);
    const calls = await drawCallsPerFrame(page);
    const pointed = await lod(page);
    console.log(`[strata-lod] 10,000 concepts with dependencies: ${rest.hiddenEdges} hidden at rest; pointing at a domain draws ${pointed.chords} chords carrying ${pointed.chordEdges} in ${calls} draw calls, ${pointed.hiddenEdges} still hidden`);
    expect(pointed.chords).toBeGreaterThan(0);
    expect(pointed.chordEdges).toBeGreaterThan(0);
    expect(pointed.hiddenEdges).toBeLessThan(rest.hiddenEdges);
    expect(calls, "pointing at one domain draws its slice, not the vault").toBeLessThan(8000);
    await expect.poll(() => hiddenDependencyLine(page)).toBe(pointed.hiddenEdges);
});
test("leaving the canvas releases a pointed slice even after the map has gone to sleep", async ({ page }) => {
    test.setTimeout(120000);
    await openStrata(page, "synth=10000&");
    await pointAtBand(page);
    await page.waitForFunction(() => performance.now() - (window as unknown as {
        __atlasMap: WakeProbe;
    }).__atlasMap.idleDebug().lastActiveMs > 1500);
    const box = await page.getByTestId("ontology-map-canvas").boundingBox();
    if (box === null)
        throw new Error("the map canvas has no box");
    await page.mouse.move(box.x / 2, box.y + box.height / 2);
    await page.waitForFunction(() => {
        const state = (window as unknown as {
            __atlasMap: WakeProbe;
        }).__atlasMap.dome().lod;
        return state.hoverSlot === -1 && state.hoverRamp === 0;
    }, undefined, { timeout: 5000 });
});
test("a small vault never leaves the detailed Strata drawing", async ({ page }) => {
    await openStrata(page, "");
    expect(await lod(page)).toMatchObject({ active: false, capability: 1, element: 1, sheets: 0, dust: 0, chords: 0, hiddenEdges: 0 });
    await expect(page.getByTestId("topology-light-legend-hidden-dependencies")).toHaveCount(0);
});
