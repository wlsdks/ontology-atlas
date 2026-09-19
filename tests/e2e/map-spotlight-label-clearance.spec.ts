import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **A name does not cross a changed node's ring** (2026-09-19).
 *
 * With the recent-changes lens on, every changed node wears a dashed ring six
 * pixels outside its disc. The label placer reserved only the disc, so names
 * were laid across the rings of neighbouring changed nodes: on the fixture
 * vault two names crossed a ring by four pixels or more, and the corner under
 * the settlement domain read as a pile. The reservation now includes the ring
 * while the node wears one.
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
