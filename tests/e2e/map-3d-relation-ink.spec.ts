import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **Can you see the relations in 3D?** (2026-09-06, owner report.)
 *
 * ## What was wrong, in numbers
 *
 * Looking at the installed app in Cloud on the dogfood ontology, the owner asked
 * whether the lines could be improved: they were so faint that the connections
 * were all but invisible and only the selected pair's indigo edge read at all.
 *
 * Depth attenuates a line twice — fog multiplies its alpha (1.0 → 0.09,
 * `domeFogAlpha`) and the width factor thins the stroke (0.90 → 0.35,
 * `domeLineWidthFactor`) — and the two stack, so the far end of the arrangement
 * drew at 3.5% of the near end's ink. That is the same stacking that made the
 * Strata plane rings disappear at 0.12. Measured here on the sample vault at
 * 1512×982, DPR 2, nothing selected and nothing hovered, sampling each drawn
 * line's own pixels against the canvas ground 14 px beside it:
 *
 * | at rest | contains median | depends median |
 * |---|---|---|
 * | 2D map (untouched) | 5.80 : 1 | 3.58 : 1 |
 * | Cone before → after | 1.26 → **1.89** : 1 | 1.25 → **1.75** : 1 |
 * | Strata before → after | 1.33 → **1.75** : 1 | 1.14 → **1.78** : 1 |
 * | Cloud before → after | 1.14 → **1.78** : 1 | 1.11 → **1.78** : 1 |
 *
 * The fix is a floor under the **product** of the two attenuations
 * (`DOME_EDGE_INK_FLOOR`), spent on the line's alpha so that width, halo, node fog
 * and draw order keep carrying depth. Ego, hover and selected lines were already
 * exempt from fog and are unchanged; so is the dim state of non-ego lines while
 * something is selected, and so is the whole 2D map.
 *
 * ## Why pixels and not a token assertion
 *
 * The complaint is about what reaches the eye, and what reaches the eye is a
 * product of a token alpha, two depth ramps, an antialiased sub-pixel stroke width
 * and the halo cut of every line in front. Asserting the token would leave every
 * one of those free to move. So this gate reads the canvas back
 * (`getImageData`) and computes the WCAG contrast of the line against the ground
 * beside it, which is the same quantity `dome-rim-contrast.contract.test.ts`
 * derives for the node rim — this one measures it on the real frame instead.
 *
 * The floors are set well under the measured medians, the way the sibling drawing
 * specs set theirs. The direction's own bar is ≥ 1.8 : 1 for containment and
 * ≥ 1.5 : 1 for dependency at rest; what these floors defend is the distance
 * already travelled from 1.1–1.3 : 1, which is the regression that would
 * otherwise return unseen.
 *
 * ## …and the same frames on a screen that is not Retina (2026-09-07)
 *
 * The first version of this gate ran at DPR 2 only, and said so: "the same frame
 * that measures 1.89 : 1 here measures 1.23 : 1 at DPR 1, before and after the
 * floor alike". That is the whole gain given back on every non-Retina screen, and
 * it happens because a line's width is a **CSS** quantity: at ratio 1 a 0.32 px
 * stroke covers a third of a device pixel, the rasteriser spreads its alpha over
 * the two rows it straddles, and the peak — what a reader follows a line by, and
 * what this instrument samples — collapses even though the ink floor's budget is
 * intact.
 *
 * `DOME_EDGE_DEVICE_WIDTH_FLOOR` (1.0 **device** px, converted to CSS px by the
 * ratio the canvas is rasterising at) stops the resting stroke going sub-pixel on
 * the device. Measured on the sample vault at 1512×982, nothing selected or
 * hovered, contains / depends median:
 *
 * | at rest | DPR 2 before → after | DPR 1 before → after |
 * |---|---|---|
 * | Cone | 1.89 / 1.75 → **2.44 / 1.96** | 1.29 / 1.26 → **2.72 / 2.33** |
 * | Strata | 1.72 / 1.55 → **2.26 / 1.87** | 1.25 / 1.19 → **2.33 / 1.57** |
 * | Cloud | 1.83 / 1.78 → **2.51 / 2.08** | 1.27 / 1.25 → **2.52 / 2.05** |
 *
 * DPR 2 rises too, because a floor of one device pixel is 0.5 CSS px there and the
 * thinnest resting strokes were 0.32. That is the same defect a step smaller, not
 * a second change. The whole 2D map is untouched at either ratio: its canvas comes
 * back byte-identical (`render/traces.test.ts` pins the mechanism — no
 * `minWidthPx`, no difference).
 *
 * Strata's dependency at DPR 1 is the tightest reading in the file, 1.571, and it
 * is worth naming why: its cross-plane lines are dashed, so where the instrument's
 * three samples land relative to a gap moves the number more than the ink does.
 * The floors sit under that.
 */

/** Both device pixel ratios, because the defect above lives in exactly that gap. */
const RATIOS = [2, 1] as const;

/**
 * The three 3D arrangements, with the resting-ink floor each has to hold. One set
 * of floors for both ratios — the point of the width floor is that a resting line
 * reads the same whatever screen it is drawn on, so a gate that asked less of one
 * ratio would be conceding the thing being fixed.
 */
const ARRANGEMENTS = [
  { key: "ownership", name: "Cone", containsFloor: 1.9, dependsFloor: 1.4 },
  { key: "strata", name: "Strata", containsFloor: 1.9, dependsFloor: 1.4 },
  { key: "coupling", name: "Cloud", containsFloor: 1.9, dependsFloor: 1.4 },
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
  // Past the assembly (≈1.1s) and the entry sweep (1.5s).
  await page.waitForTimeout(6000);
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
    const canvas = document.querySelector('[data-testid="topology-map-v2-canvas"]') as HTMLCanvasElement | null;
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
