import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

// Keep the web connection pane within two screens, with at most one copy action
// in the first viewport and four overall. Native setup needs installed-app proof.
const CEILING = { copyVisibleFirstScreen: 1, copyTotal: 4, scrollRatio: 2 };

test("the connection pane keeps its first screen simple and its content within reach", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter"), "the fixture vault must be attached before measuring").toHaveCount(0);
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
  await page.getByTestId("agents-tab-mcp").click();

  const pane = page.getByTestId("agent-setup-section");
  await expect(pane).toBeVisible();
  const census = await pane.evaluate((root) => {
    const copyButtons = [...root.querySelectorAll("button")].filter((button) =>
      /복사|copy/i.test(`${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`),
    );
    return {
      copyTotal: copyButtons.length,
      copyVisibleFirstScreen: copyButtons.filter((button) => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
      }).length,
      scrollHeight: root.scrollHeight,
      visibleHeight: Math.min(root.clientHeight, window.innerHeight),
    };
  });
  await testInfo.attach("agent-connect-census.json", {
    body: JSON.stringify(census, null, 2),
    contentType: "application/json",
  });
  expect(census.copyTotal, "the pane must contain copy actions before measuring their density").toBeGreaterThan(0);
  expect(census.visibleHeight, "the pane must occupy visible space").toBeGreaterThan(0);
  expect(census.copyVisibleFirstScreen, "fold secondary copy actions below the first screen").toBeLessThanOrEqual(CEILING.copyVisibleFirstScreen);
  expect(census.copyTotal).toBeLessThanOrEqual(CEILING.copyTotal);
  expect(census.scrollHeight / census.visibleHeight, "the pane must fit within two visible screens").toBeLessThanOrEqual(CEILING.scrollRatio);
});
