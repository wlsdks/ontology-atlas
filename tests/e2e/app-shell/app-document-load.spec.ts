import { expect, test } from "@playwright/test";

/**
 * What a document of an app address holds. A plain browser is told the app is needed from the first
 * byte, with scripts or without, and never mounts the workbench (so it opens, reads and remembers no
 * folder); the installed app, which the boot script marks before first paint, gets the workbench.
 */

/** One address per kind of screen: the map, a document room, a form and a settings-bearing route. */
const APP_ADDRESSES = ["/ko/topology/", "/ko/library/", "/ko/project/new/", "/ko/agents/?tab=models", "/en/work-status/"] as const;

const DESKTOP_INIT = () => {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error("stub")),
    transformCallback: (cb: unknown) => cb,
  };
  (window as unknown as { isTauri?: boolean }).isTauri = true;
};

test.describe("an app address in a plain browser", () => {
  test("is the app-only page in the server's own HTML, before any script", async ({ request }) => {
    for (const address of APP_ADDRESSES) {
      const html = await (await request.get(address)).text();
      expect(html, address).toContain('data-testid="app-only-page"');
      expect(html, address).toContain('data-testid="app-only-download"');
      expect(html, address).toContain('data-testid="app-only-sample"');
    }
  });

  test.describe("with scripts off", () => {
    test.use({ javaScriptEnabled: false });

    test("shows the app-only page and none of the workbench", async ({ page }) => {
      for (const address of APP_ADDRESSES) {
        await page.goto(address);
        await expect(page.getByTestId("app-only-page"), address).toBeVisible();
        await expect(page.locator('[data-face="app-only"]'), address).toBeVisible();
        await expect(page.getByTestId("app-nav-rail"), address).toBeHidden();
      }
    });
  });

  test("keeps the app-only page, mounts nothing, and forgets a folder an old browser build remembered", async ({
    page,
  }) => {
    // The website's own pages run the same cleanup, so the old database is made once it has run.
    await page.goto("/ko/download/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("demo-kv", 1);
          open.onupgradeneeded = () => open.result.createObjectStore("kv");
          open.onsuccess = () => {
            open.result.close();
            resolve();
          };
          open.onerror = () => reject(open.error);
        }),
    );
    expect(await page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === "demo-kv"))).toBe(true);

    await page.goto("/ko/topology/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("app-only-page")).toBeVisible();
    // The workbench's HTML is in the document, inert: React gave none of its nodes a fiber.
    const rail = page.getByTestId("app-nav-rail");
    await expect(rail).toBeHidden();
    expect(await rail.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber")))).toBe(false);
    await expect
      .poll(() => page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === "demo-kv")))
      .toBe(false);
  });

  test("offers the download and the sample map, and the sample map opens", async ({ page }) => {
    await page.goto("/ko/topology/");
    await expect(page.getByTestId("app-only-download")).toHaveAttribute("href", /\/download\/?$/);
    await page.getByTestId("app-only-sample").click();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
  });

  test("`/` hands the browser on to the download page", async ({ page }) => {
    await page.goto("/ko/");
    await expect(page).toHaveURL(/\/ko\/download\/?$/, { timeout: 15_000 });
    await expect(page.getByTestId("app-only-page")).toHaveCount(0);
  });
});

test.describe("an app address in the installed app", () => {
  test("shows the workbench, never the app-only page", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.goto("/ko/library/");
    const rail = page.getByTestId("app-nav-rail");
    await expect(rail).toHaveCount(1, { timeout: 20_000 });
    // Mounted, not only present in the HTML: React gave the rail a fiber.
    await expect
      .poll(() => rail.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber"))), { timeout: 20_000 })
      .toBe(true);
    await expect(page.locator('[data-face="app-only"]')).toBeHidden();
  });
});
