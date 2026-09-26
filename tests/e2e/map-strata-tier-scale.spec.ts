import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { waitForDomeEntered, waitForMapStill } from "./settle";

/**
 * **Every tier name stands beside the plane it names** (2026-09-26).
 *
 * Strata named its four planes on a rail down the canvas's right edge, and wherever
 * the rail could not align a row with its plane the names fell to a stack in the
 * bottom-right corner. That was the usual case: measured on the product's own ontology
 * at 1512×949 the four names sat in the corner, 64 px wide and 64 px tall, naming no
 * plane and repeating the lit legend's key along the bottom (owner report).
 *
 * The rule, measured against the planes the frame drew (`__atlasMap.tierPlanes()`):
 * a name stands at its plane's height, a gap outside the rim's right or left extreme,
 * and nowhere else — no list in a corner. A plane with no clear place beside its rim
 * goes unnamed; at this size every plane has one.
 */

type Plane = { kind: string; left: number; right: number; top: number; bottom: number; y: number };
type Row = { kind: string; side: string; minX: number; maxX: number; minY: number; maxY: number };

async function readNames(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const legend = document.querySelector<HTMLElement>('[data-testid="topology-tier-legend"]');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="topology-tier-legend-row-"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        kind: el.dataset.tierKind ?? "",
        side: el.dataset.tierSide ?? "",
        minX: r.left - canvas.left,
        maxX: r.right - canvas.left,
        minY: r.top - canvas.top,
        maxY: r.bottom - canvas.top,
      };
    });
    const probe = (window as unknown as { __atlasMap?: { tierPlanes?: () => readonly Plane[] } }).__atlasMap;
    return { placement: legend?.dataset.tierLegendPlacement ?? null, rows, planes: [...(probe?.tierPlanes?.() ?? [])] };
  });
}

test("each Strata tier name stands beside its own plane's rim", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, dogfoodVaultFiles(), undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  await page.getByTestId("topology-view-3d").click();
  await page.getByTestId("topology-view-3d-choice-strata").click();
  await waitForDomeEntered(page, 60_000);
  await waitForMapStill(page).catch(() => {});

  // The names are measured, then placed on the next frame: poll for a complete reading.
  let reading: Awaited<ReturnType<typeof readNames>> | null = null;
  await expect
    .poll(
      async () => {
        reading = await readNames(page);
        return reading.rows.length;
      },
      { timeout: 30_000, message: "no tier name was drawn" },
    )
    .toBe(4);
  const { placement, rows, planes } = reading!;
  expect(placement, "the names are not anchored to their planes").toBe("anchored");
  expect(planes.map((plane) => plane.kind)).toEqual(["project", "domain", "capability", "element"]);

  const failures: string[] = [];
  for (const row of rows as Row[]) {
    const plane = (planes as Plane[]).find((p) => p.kind === row.kind);
    if (!plane) {
      failures.push(`${row.kind}: no drawn plane to stand beside`);
      continue;
    }
    // At the plane's height, within a pixel.
    const dy = (row.minY + row.maxY) / 2 - plane.y;
    if (Math.abs(dy) > 1.5) failures.push(`${row.kind}: ${dy.toFixed(1)}px off its plane's height`);
    // A gap outside the rim's extreme on its side — beside the plane, not across the map.
    const gap = row.side === "left" ? plane.left - row.maxX : row.minX - plane.right;
    if (!(gap >= 4 && gap <= 12)) failures.push(`${row.kind}: ${gap.toFixed(1)}px from its rim on the ${row.side}`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
