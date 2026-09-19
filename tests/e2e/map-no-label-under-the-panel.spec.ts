import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **A name painted under the inspector is a name nobody reads.**
 *
 * The label cull asks the safe rect whether a name has room, and that rect came
 * from `--map-safe-inset-right`, a static 120 px. The inspector that opens on a
 * selection is 352 px wide from x=1128, so the cull believed there was clear
 * canvas where a panel was sitting. Measured at 1512x982 on the sample folder,
 * clicking each of the five concepts the first frame offers: two of the five
 * painted a concept's name more than half underneath that panel. The name could
 * not be read, and it still spent one of the map's limited label slots.
 *
 * The camera has taken the larger of token and measurement since 2026-08-10;
 * this asserts the names get the same truth. Stated as a rule, so it holds for
 * whatever panel a future selection opens: no label may be painted mostly under
 * an open panel.
 */
test("no concept's name is painted under the open inspector", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  const box = (await page.locator("canvas").first().boundingBox())!;
  const drawn = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __atlasMap?: Record<string, () => unknown> }).__atlasMap!;
      // `alpha` alone is not visibility: a tier-hidden node still reports 1.
      return (m.nodes() as Array<{ id: string; x: number; y: number; alpha: number; hidden?: boolean }>)
        .filter((n) => !n.hidden && n.alpha > 0.5)
        .map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) }));
    });

  const offered = await drawn();
  expect(offered.length, "첫 화면에 고를 개념이 없다").toBeGreaterThan(2);

  const covered: Array<{ selection: string | null; names: string[] }> = [];
  for (const target of offered) {
    await page.keyboard.press("Escape");
    await waitForMapStill(page);
    const here = (await drawn()).find((n) => n.id === target.id);
    if (!here) continue;
    await page.mouse.click(box.x + here.x, box.y + here.y);
    await waitForMapStill(page);

    const reading = await page.evaluate(() => {
      const m = (window as unknown as { __atlasMap?: Record<string, (...a: unknown[]) => unknown> }).__atlasMap!;
      const panel = document.querySelector('[data-testid="map-detail-panel"]')?.getBoundingClientRect() ?? null;
      if (!panel) return null;
      const canvas = document.querySelector("canvas")!.getBoundingClientRect();
      const labels = m.labels() as Array<{ text: string; minX: number; minY: number; maxX: number; maxY: number }>;
      const mostlyUnder = labels.filter((label) => {
        const x0 = canvas.x + label.minX, x1 = canvas.x + label.maxX;
        const y0 = canvas.y + label.minY, y1 = canvas.y + label.maxY;
        const overlapX = Math.max(0, Math.min(x1, panel.right) - Math.max(x0, panel.left));
        const overlapY = Math.max(0, Math.min(y1, panel.bottom) - Math.max(y0, panel.top));
        return overlapX * overlapY > (x1 - x0) * (y1 - y0) * 0.5;
      });
      return {
        selection: (m.selection?.() as { nodeId: string | null }).nodeId,
        names: mostlyUnder.map((label) => label.text),
      };
    });
    if (reading && reading.names.length > 0) covered.push(reading);
  }

  expect(
    covered,
    `상세 패널 밑에 그려진 이름: ${JSON.stringify(covered)}`,
  ).toEqual([]);
});
