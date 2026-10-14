import { expect, test, type Page } from "@playwright/test";
import { waitForDomeEntered, waitForMapStill } from "../../settle";

import { seedFirstRunSeen } from "../../first-run-seed";

/**
 * Reads the canvas back (`getImageData`) and measures WCAG contrast of each 3D line
 * against the ground beside it; floors sit well under the measured medians.
 * `DOME_EDGE_INK_FLOOR` and `DOME_EDGE_DEVICE_WIDTH_FLOOR` keep lines legible at DPR 2 and 1.
 */

/** Both device pixel ratios, because the defect above lives in exactly that gap. */
const RATIOS = [2, 1] as const;

/**
 * The two 3D arrangements, with the resting-ink floor each has to hold. One set
 * of floors for both ratios — the point of the width floor is that a resting line
 * reads the same whatever screen it is drawn on, so a gate that asked less of one
 * ratio would be conceding the thing being fixed.
 */
const ARRANGEMENTS = [
  { key: "strata", name: "Strata", containsFloor: 1.9, dependsFloor: 1.4 },
  { key: "coupling", name: "Neural", containsFloor: 1.9, dependsFloor: 1.4 },
] as const;

async function open3d(page: Page, arrangement: string) {
  // Reduced motion, so the pose the pixels are read at is the parked one — the
  // same reason the two drawing specs do it.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.addInitScript((arr) => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", arr);
  }, arrangement);
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  // Past the assembly and the entry sweep: while either is alive the drawn pose
  // keeps moving and the fit is still in flight. Both clocks belong to the dome,
  // so it is asked whether it has arrived rather than given six seconds to.
  await waitForDomeEntered(page);
  await waitForMapStill(page, { what: "camera" });
}

/**
 * Reads the drawn relation lines' own pixels. For each edge the instrument
 * reports, walk the **drawn** quadratic curve (not its chord), take a point clear
 * of every disc, read the ground 14 px off the line on the emptier side, and keep
 * the strongest sample within ±2.5 px of the centreline. A line the frame did not
 * stroke at all — collapsed by the density gate or rejected by the tier — reads as
 * the ground itself and is excluded rather than counted as an invisible line.
 */
async function readRelationInk(page: Page) {
  return page.evaluate(() => {
    const probe = (
      window as unknown as {
        __atlasMap?: {
          nodes: () => Array<{ x: number; y: number; radius: number; hidden: boolean }>;
          edges: () => ReadonlyArray<{
            kind: string;
            ax: number;
            ay: number;
            bx: number;
            by: number;
            controlX: number;
            controlY: number;
          }>;
        };
      }
    ).__atlasMap;
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]') as HTMLCanvasElement | null;
    if (!probe || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const at = (x: number, y: number): [number, number, number] | null => {
      const px = Math.round(x * dpr);
      const py = Math.round(y * dpr);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
      const i = (py * img.width + px) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    const lum = (c: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]) => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const nodes = probe.nodes().filter((n) => !n.hidden);
    const edges = probe.edges();
    const quad = (
      a: { x: number; y: number },
      c: { x: number; y: number },
      b: { x: number; y: number },
      t: number,
    ) => ({
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    });
    const onADisc = (p: { x: number; y: number }) =>
      nodes.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < n.radius + 6);

    const byKind: Record<string, number[]> = { contains: [], depends: [] };
    for (const edge of edges) {
      const a = { x: edge.ax, y: edge.ay };
      const b = { x: edge.bx, y: edge.by };
      const c = { x: edge.controlX, y: edge.controlY };
      for (const t of [0.35, 0.5, 0.65]) {
        const p = quad(a, c, b, t);
        if (onADisc(p)) continue;
        const next = quad(a, c, b, Math.min(1, t + 0.01));
        const len = Math.hypot(next.x - p.x, next.y - p.y) || 1;
        const nx = -(next.y - p.y) / len;
        const ny = (next.x - p.x) / len;
        const groundA = at(p.x + nx * 14, p.y + ny * 14);
        const groundB = at(p.x - nx * 14, p.y - ny * 14);
        if (!groundA || !groundB) continue;
        const ground = lum(groundA) <= lum(groundB) ? groundA : groundB;
        let best = -1;
        for (let s = -2.5; s <= 2.5; s += 0.5) {
          const q = at(p.x + nx * s, p.y + ny * s);
          if (!q) continue;
          const r = ratio(q, ground);
          if (r > best) best = r;
        }
        // 1.03 : 1 is the ground itself — the frame stroked nothing here.
        if (best >= 1.03) byKind[edge.kind]?.push(best);
        break;
      }
    }
    const stat = (rows: number[]) => {
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((x, y) => x - y);
      return {
        drawn: sorted.length,
        median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
        max: Number(sorted[sorted.length - 1].toFixed(3)),
      };
    };
    return { contains: stat(byKind.contains), depends: stat(byKind.depends) };
  });
}

for (const dpr of RATIOS) {
  test.describe(`device pixel ratio ${dpr}`, () => {
    test.use({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: dpr });

for (const arrangement of ARRANGEMENTS) {
  test(`${arrangement.name} 1512x982 @${dpr}x — resting relation lines are visible against the ground`, async ({ page }) => {
    test.setTimeout(120_000);
    await open3d(page, arrangement.key);
    const read = await readRelationInk(page);
    expect(read, "read no canvas pixels at all — the instrument is idling").not.toBeNull();
    const ink = read!;

    expect(ink.contains, "no containment line was stroked at all").not.toBeNull();
    expect(ink.depends, "no dependency line was stroked at all").not.toBeNull();
    expect(ink.contains!.drawn, "too few drawn containment lines to describe the frame").toBeGreaterThan(20);
    expect(ink.depends!.drawn, "too few drawn dependency lines to describe the frame").toBeGreaterThan(10);

    expect(
      ink.contains!.median,
      `containment lines at rest: median ${ink.contains!.median} : 1 over ${ink.contains!.drawn} drawn lines`,
    ).toBeGreaterThanOrEqual(arrangement.containsFloor);
    expect(
      ink.depends!.median,
      `dependency lines at rest: median ${ink.depends!.median} : 1 over ${ink.depends!.drawn} drawn lines`,
    ).toBeGreaterThanOrEqual(arrangement.dependsFloor);
  });
}

  });
}
