import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import { smoothnessViolations, startSmoothness, stopSmoothness } from "../../motion-sampler";
import { waitForAnimationsDone, waitFrames } from "../../settle";

type HeldWindow = Window & { __releaseVaultRestore: () => void };

async function holdVaultRestore(page: Page) {
  await page.addInitScript(() => {
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as unknown as HeldWindow).__releaseVaultRestore = () => release();
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory["open"]>) {
      const request = open.apply(this, args);
      Object.defineProperty(request, "onsuccess", {
        set(handler: ((this: IDBRequest, event: Event) => void) | null) {
          request.addEventListener("success", (event) => void released.then(() => handler?.call(request, event)));
        },
      });
      return request;
    };
  });
}

test("the map toolbar holds still when the sample mode is decided after it paints", async ({ page }) => {
  await seedFirstRunSeen(page);
  await holdVaultRestore(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/topology?guides=off&e2e=1");
  await expect(page.getByTestId("topology-search-action-lane")).toBeVisible();
  await waitFrames(page, 2);
  await expect(page.getByTestId("topology-switch-to-my-data")).toHaveCount(0);

  await startSmoothness(page);
  await page.evaluate(() => (window as unknown as HeldWindow).__releaseVaultRestore());
  await expect(page.getByTestId("topology-switch-to-my-data")).toBeVisible();
  await waitForAnimationsDone(page.getByTestId("topology-utility-action-lane"));
  await waitFrames(page, 2);
  expect(smoothnessViolations(await stopSmoothness(page))).toEqual([]);
});
