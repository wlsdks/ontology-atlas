import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **The tier scale either sits beside its planes or stops claiming to.**
 *
 * Strata names its four planes on a rail down the right edge, and the rail's
 * whole claim is that a row's height answers "which ring is this name for"
 * without counting rings. The rail begins under the last utility tile, so a
 * plane projected above that tile is out of reach: measured at 1512x982 with the
 * sample folder expanded, the rows landed at 330, 350, 531 and 704 while the
 * planes sat at 124, 316, 507 and 614. The project's name stood 205 px from the
 * only project node — ten rows away — and dragged the domain row down until the
 * two touched at exactly one row's spacing, while the pair below them sat about
 * 175 px apart.
 *
 * The rule, not the outcome: whenever the rail is the shape drawn, no row may be
 * more than its own height from the plane it names. Losing a plane sends the
 * names to the corner stack, which gives up alignment out loud.
 */
test("no tier name is stranded from the plane it names", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);
  await page.getByTestId("topology-expand-all").click();
  await waitForMapStill(page);

  await page.getByTestId("topology-view-3d").click();
  const strata = page.getByTestId("topology-view-3d-choice-strata");
  await expect(strata).toBeVisible();
  await strata.click();
  await waitForMapStill(page).catch(() => {});
  await expect(page.getByTestId("topology-tier-legend")).toBeVisible();
  /*
   * The legend remounts whenever the map does, and on `main` the folder watch
   * still rebuilds the session every few seconds, so a single read can land on a
   * frame where the rail has measured no band yet and has drawn no row. Poll for
   * a complete reading and assert on that one.
   */
  const read = async () =>
    page.evaluate(() => {
      const legend = document.querySelector<HTMLElement>('[data-testid="topology-tier-legend"]');
      if (!legend) return null;
      const rowEls = [...legend.querySelectorAll<HTMLElement>("[data-tier-kind]")];
      if (rowEls.length !== 4) return null;
      const rows = rowEls.map((el) => {
        const r = el.getBoundingClientRect();
        return { kind: el.dataset.tierKind!, y: Math.round(r.y + r.height / 2) };
      });
      return {
        placement: legend.dataset.tierLegendPlacement ?? null,
        offset: legend.dataset.tierLegendOffset ?? null,
        rowHeight: Math.round(rowEls[0].getBoundingClientRect().height),
        rows,
        gaps: rows.slice(1).map((row, i) => row.y - rows[i].y),
      };
    });
  let captured: Awaited<ReturnType<typeof read>> = null;
  await expect
    .poll(async () => {
      const next = await read();
      if (next) captured = next;
      return captured !== null;
    }, { timeout: 30_000 })
    .toBe(true);
  const reading = captured!;
  expect(reading, "층 이름 네 줄이 안 그려진다").not.toBeNull();

  expect(reading.rows.length).toBe(4);
  // Whatever shape it chose, the attribute names the shape it actually drew.
  expect(["rail", "corner"]).toContain(reading.placement);

  if (reading.placement === "rail") {
    expect(reading.offset, "레일인데 어긋난 거리를 안 알려준다").not.toBeNull();
    expect(
      Number(reading.offset),
      `층 이름이 자기 평면에서 ${reading.offset}px 떨어져 있다 (행 높이 ${reading.rowHeight}px)`,
    ).toBeLessThanOrEqual(reading.rowHeight);
  } else {
    // The corner stack makes no per-plane claim, so its rows are evenly spaced —
    // the clamped rail's signature was one 20 px gap beside a 175 px one.
    const [min, max] = [Math.min(...reading.gaps), Math.max(...reading.gaps)];
    expect(max - min, `모서리 목록인데 행 간격이 고르지 않다: ${JSON.stringify(reading.gaps)}`).toBeLessThanOrEqual(2);
  }
});
