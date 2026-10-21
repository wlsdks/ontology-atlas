import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";
import { installDesktopBridge } from "../rounds-desktop-bridge";
import { waitForAnimationsDone, waitForBoxStill } from "../settle";

/*
 * A lone stage centres on the shell slot; a stage taller than the slot starts at the slot's top
 * instead (a stage that fills its parent has no slack to centre in). Without this, a destination can drift off-centre while every other gate stays green.
 */

const SIZES = [
  { width: 1512, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const;
const ROUTES = ["/ko/agents/", "/ko/agents/?tab=models", "/ko/automations/", "/ko/git/", "/ko/projects/"] as const;
const TOLERANCE = 4;

async function measure(page: Page, placement: "stage" | "list") {
  const stage = page.locator(`[data-placement="${placement}"]`).first();
  await expect(stage).toBeVisible({ timeout: 20_000 });
  await waitForAnimationsDone(stage);
  await waitForBoxStill(stage);
  return stage.evaluate((element) => {
    const railElement = document.querySelector<HTMLElement>('[data-testid="app-nav-rail"]');
    const rail = railElement && railElement.checkVisibility() ? railElement.getBoundingClientRect().width : 0;
    const tabbar = document.querySelector<HTMLElement>('nav[data-tabbar="primary"]');
    const bottom = tabbar && tabbar.checkVisibility() ? tabbar.getBoundingClientRect().top : window.innerHeight;
    const box = element.getBoundingClientRect();
    const parent = element.parentElement!;
    const parentBox = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    return {
      rail,
      bottom,
      innerWidth: window.innerWidth,
      top: box.top,
      height: box.height,
      centreX: box.left + box.width / 2,
      centreY: box.top + box.height / 2,
      contentTop: parentBox.top + parseFloat(style.paddingTop),
      contentHeight: parentBox.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
  });
}

function expectPlaced(label: string, m: Awaited<ReturnType<typeof measure>>) {
  if (m.height + 1 < m.contentHeight) {
    expect(Math.abs(m.centreY - m.bottom / 2), `${label}: vertical centre ${m.centreY} vs ${m.bottom / 2}`).toBeLessThanOrEqual(TOLERANCE);
    const centre = m.rail + (m.innerWidth - m.rail) / 2;
    expect(Math.abs(m.centreX - centre), `${label}: horizontal centre ${m.centreX} vs ${centre}`).toBeLessThanOrEqual(TOLERANCE);
  } else {
    expect(Math.abs(m.top - m.contentTop), `${label}: a tall stage starts at ${m.top}, not ${m.contentTop}`).toBeLessThanOrEqual(1);
  }
}

test.describe("stage placement", () => {
  test("a lone stage centres on the shell slot, or starts at its top when taller", async ({ page }) => {
    await seedFirstRunSeen(page);
    let measured = 0;
    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const route of ROUTES) {
        await page.goto(`${route}${route.includes("?") ? "&" : "?"}guides=off`);
        expectPlaced(`${size.width}x${size.height} ${route}`, await measure(page, "stage"));
        measured += 1;
      }
    }
    expect(measured, "no stage was measured").toBe(SIZES.length * ROUTES.length);
  });

  test("the desktop automations stage with no rounds centres on the slot", async ({ page }) => {
    await installDesktopBridge(page, { seedRounds: false });
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/en/");
    await page.getByRole("button", { name: /Open.*folder/i }).first().click();
    await expect(page.getByTestId("app-nav-rail")).toBeVisible();
    await page.goto("/en/automations/?guides=off");
    expectPlaced("desktop automations", await measure(page, "stage"));
  });

  test("a list starts at the top of the content", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/agents/?tab=mcp&guides=off");
    const m = await measure(page, "list");
    expect(Math.abs(m.top - m.contentTop), `the list starts at ${m.top}, not ${m.contentTop}`).toBeLessThanOrEqual(1);
  });
});
