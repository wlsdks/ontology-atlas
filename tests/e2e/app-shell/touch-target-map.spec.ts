import { test, expect } from "@playwright/test";
import { mountDesktopVault, installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { AUDIT_258, type Audit258Result } from "../touch-target-audit";

/**
 * The 24x24 floor (WCAG 2.5.8 AA) on the map's own controls: the screen a plain browser never mounts, so it
 * is measured in the app folder under the faked app runtime. The website's pages are
 * `gateway/touch-target-contract.spec.ts`, which reads the site folder.
 */
test.describe("minimum target contract on the map (pointer: fine)", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 860 } });

  test("a target on the map in the installed app under 24×24 must prove either the inline exemption or the spacing exception", async ({ page }) => {
    await installDesktopRailRuntime(page);
    await mountDesktopVault(page, "ko");
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const { scanned, failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
    // The rail, the map's controls and the settings entry: fewer means the workbench did not mount.
    expect(scanned, `too few targets were scanned on the map (${scanned})`).toBeGreaterThanOrEqual(15);
    expect(failures, `2.5.8 shortfall: ${JSON.stringify(failures)}`).toEqual([]);
  });
});
