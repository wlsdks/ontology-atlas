import { expect, test } from "@playwright/test";

import { installUnboundHarnessRuntime, mountHarnessVault } from "../harness-tab-fixture";

/** The Harness tab on a folder whose repository has not been connected yet. */
test.describe("harness connect", () => {
  test("names the repository that holds the folder and fills Setup in one press", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installUnboundHarnessRuntime(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");

    const connect = page.getByTestId("harness-connect-found");
    await expect(connect).toHaveText("storefront 연결", { timeout: 30_000 });
    await expect(page.getByTestId("harness-connect-pick")).toBeVisible();
    await expect(page.getByTestId("harness-setup")).toHaveCount(0);

    await connect.click();
    await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("harness-connect-found")).toHaveCount(0);
  });
});
