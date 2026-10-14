import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime, mountDesktopVault } from "../../desktop-rail-arrival-harness";
import { waitForBoxStill } from "../../settle";

/**
 * The kind chip and domain chip share height, radius and type size; the close button matches
 * that height, rows end on one right edge, and the title stays the largest type.
 */

for (const width of [1512] as const) {
  test(`inspector header chips share one grammar at ${width}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page);
    await page.goto("/ko/topology/?e2e=1&guides=off&p=capability%3Ainvoice", { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("map-detail-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await waitForBoxStill(page.getByTestId("map-detail-panel-domain"), { frames: 10 });

    const m = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { height: r.height, right: r.right, centre: r.top + r.height / 2, radius: cs.borderTopLeftRadius, font: parseFloat(cs.fontSize) };
      };
      return {
        title: read('[data-testid="map-detail-panel"] h2'),
        kind: read('[data-testid="map-detail-panel-kind"]'),
        close: read('[data-testid="map-detail-panel-close"]'),
        domain: read('[data-testid="map-detail-panel-domain"]'),
        updated: read('[data-testid="map-datasheet-updated-at"]'),
      };
    });
    console.log(`[inspector-header] ${width} ${JSON.stringify(m)}`);
    const { title, kind, close, domain, updated } = m;
    expect(title && kind && close && domain && updated, "a header part is not drawn").toBeTruthy();
    if (!title || !kind || !close || !domain || !updated) return;

    expect(Math.abs(kind.height - domain.height), "kind and domain chip heights differ").toBeLessThanOrEqual(0.5);
    expect(kind.radius, "kind and domain chip radii differ").toBe(domain.radius);
    expect(kind.font, "kind and domain chip type sizes differ").toBe(domain.font);
    expect(Math.abs(close.height - kind.height), "close button is not the chips' height").toBeLessThanOrEqual(0.5);
    expect(Math.abs(close.right - domain.right), "the two rows end on different right edges").toBeLessThanOrEqual(0.5);
    expect(Math.abs(kind.centre - close.centre), "row 1 controls are not centred on one line").toBeLessThanOrEqual(0.5);
    expect(Math.abs(title.centre - kind.centre), "the title is off row 1's centre").toBeLessThanOrEqual(1);
    expect(Math.abs(updated.centre - domain.centre), "row 2 is not centred on one line").toBeLessThanOrEqual(1);
    expect(title.font, "the title must stay the header's largest type").toBeGreaterThan(Math.max(kind.font, domain.font, updated.font));
  });
}
