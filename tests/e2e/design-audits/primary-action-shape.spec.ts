import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";

/**
 * Primary actions are the `Button` primary at 32px on the chip corner. Measured from computed
 * style, so a class that stops producing the shape fails even when the markup still names it.
 */
const DOORS: readonly { name: string; url: string; door: (page: Page) => Locator }[] = [
  {
    name: "Harness",
    url: "/ko/architecture/?view=structure&guides=off",
    door: (page) => page.locator('main a[href$="/download/"]').first(),
  },
  {
    name: "Automations",
    url: "/ko/automations/?guides=off",
    door: (page) => page.getByTestId("automations-empty-workbench").locator('a[href$="/download/"]'),
  },
  {
    name: "Agents",
    url: "/ko/agents/?guides=off",
    door: (page) => page.getByTestId("app-settings-runtimes-get-app"),
  },
  {
    name: "Models",
    url: "/ko/agents/?tab=models&guides=off",
    door: (page) => page.getByTestId("ai-connection-download-link"),
  },
];

test("every web-only page door is the same primary shape: 32px on the chip corner, never a pill", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await seedFirstRunSeen(page);

  const measured: Record<string, { height: number; radius: number; background: string; fontSize: string }> = {};
  for (const { name, url, door } of DOORS) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const control = door(page);
    await expect(control, `${name}: the door is on screen`).toBeVisible({ timeout: 45_000 });
    measured[name] = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: Math.round(element.getBoundingClientRect().height),
        radius: parseFloat(style.borderTopLeftRadius),
        background: style.backgroundColor,
        fontSize: style.fontSize,
      };
    });
  }
  const chipRadius = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--radius-chip")),
  );
  expect(chipRadius).toBeGreaterThan(0);

  for (const [name, shape] of Object.entries(measured)) {
    expect(shape.radius, `${name} is a pill`).toBeLessThan(shape.height / 2);
    expect(shape.height, `${name} is not the 32px primary`).toBe(32);
    expect(shape.radius, `${name} does not wear the chip corner`).toBe(chipRadius);
  }
  const [first, ...rest] = Object.values(measured);
  for (const shape of rest) {
    expect(shape.background).toBe(first.background);
    expect(shape.fontSize).toBe(first.fontSize);
  }
});
