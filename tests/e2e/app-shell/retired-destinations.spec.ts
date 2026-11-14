import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";

/*
 * A retired destination stays a static page that replaces itself with its target, so a saved link or
 * the installed app's remembered route still lands, and Back never returns to the redirect.
 */

const ANALYSIS_ROWS = [
  {
    from: "/ko/ontology/insights/?tab=harness&focus=main",
    to: /\/ko\/architecture\/\?focus=main&view=overview$/,
    ready: '[data-testid="harness-views"]',
  },
  {
    from: "/ko/ontology/insights/?tab=library",
    to: /\/ko\/library\/\?tab=wiki$/,
    ready: "#library-workspace-tabpanel-wiki",
  },
  {
    from: "/ko/ontology/insights/?tab=connections&review=analysis%3Acapability%3Amcp-tool-server",
    to: /\/ko\/topology\/\?p=capability%3Amcp-tool-server$/,
    ready: '[data-testid="topology-concept-search"]',
  },
  {
    from: "/ko/ontology/insights/?node=capabilities%2Fmcp-tool-server",
    to: /\/ko\/topology\/\?p=capability%3Amcp-tool-server$/,
    ready: '[data-testid="topology-concept-search"]',
  },
  {
    from: "/ko/ontology/insights/?tab=brief&via=insights%3Ado-next&review=relation%3Aedge-1",
    to: /\/ko\/topology\/$/,
    ready: '[data-testid="topology-concept-search"]',
  },
] as const;

/* A pushed redirect would leave Back on the retired address, which forwards again to the target. */
const START = { url: "/ko/automations/?guides=off", at: /\/ko\/automations\/\?guides=off$/ };

test.describe("retired Analysis addresses", () => {
  for (const row of ANALYSIS_ROWS) {
    test(`${row.from} lands on its target without a history entry`, async ({ page }) => {
      await seedFirstRunSeen(page);
      await page.goto(START.url, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(START.at);

      await page.goto(row.from, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(row.to, { timeout: 30_000 });
      await expect(page.locator(row.ready).first()).toBeVisible({ timeout: 30_000 });

      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect(page, "Back returned to the retired address, so the redirect pushed an entry").toHaveURL(START.at, {
        timeout: 30_000,
      });
    });
  }

  test("the rail offers no Analysis door", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-nav-rail-item-map")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("app-nav-rail-item-insights")).toHaveCount(0);
  });
});
