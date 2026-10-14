import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { waitForMapStill } from "../../settle";

/**
 * The label placer must reserve the dashed ring six pixels outside a changed node's disc,
 * so no name crosses a ring.
 */
test("under the spotlight, no name crosses another node's ring", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page, {});
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);
  await page.getByTestId("topology-spotlight-toggle").click();
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "recent");
  await waitForMapStill(page);

  const crossings = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const discs = probe.nodes().filter((n) => !n.hidden && (n.alpha ?? 1) > 0.05 && n.radius > 0);
    // The ring sits 6 px outside the disc; a name inside that band crosses it.
    const ring = 6;
    return probe.labels().flatMap((label) =>
      discs
        .filter((d) => d.id !== label.nodeId)
        .filter((d) => {
          const r = d.radius + ring;
          return label.minX < d.x + r && d.x - r < label.maxX && label.minY < d.y + r && d.y - r < label.maxY;
        })
        .map((d) => `${label.text} ↔ ${d.label}`),
    );
  });
  expect(crossings, "바뀐 노드의 링을 가로지른 이름").toEqual([]);
});
