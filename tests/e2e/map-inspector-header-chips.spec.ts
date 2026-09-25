import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { waitForBoxStill } from "./settle";

/**
 * **The node inspector's header speaks one chip grammar** (owner report, 2026-09-25,
 * installed app: the invoice capability with its kind chip and the domain chip under it).
 *
 * Measured before the fix at 1512: the kind badge was 24px tall at a 6px radius, the
 * domain chip 34px at the card's 9px radius, the close button 24px ending 4px past the
 * domain chip's right edge (1469 vs 1465). Two shapes that mean the same kind of thing
 * ("a fact about this node you can read, one of them pressable") read as unrelated.
 *
 * Claims at 1280 and 1512: the kind chip and the domain chip share height, radius and
 * type size; the close button matches that height; the rows end on one right edge; each
 * row's controls share a vertical centre; the title stays the largest type in the header.
 */

for (const width of [1280, 1512] as const) {
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
