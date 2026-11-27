import { expect, test } from "@playwright/test";
import { routing } from "../../../src/i18n/routing";
import { architectureRoutes } from "../../contract/architecture-routes";
import { readOldStore, seedOldStore } from "../old-browser-folder-store";

/**
 * What a plain browser sees at an app address: the app-only page from the first byte, with scripts or
 * without, marked noindex, never the workbench (so it opens, reads and remembers no folder). The installed
 * app's side is `tests/e2e/app-shell/app-document-load.spec.ts`.
 */

/** One address per kind of screen: the map, a document room, a form and a settings-bearing route. */
const APP_ADDRESSES = ["/ko/topology/", "/ko/library/", "/ko/project/new/", "/ko/agents/?tab=models", "/en/work-status/"] as const;

const WEBSITE_ROUTES = /^\/(?:download|guide|changelog|sample)(?:\/|$)/;

/** Every page of the route list that is a screen of the app: not the website's, not the entry, not dynamic. */
const APP_ROUTES = architectureRoutes(process.cwd()).filter(
  (route) => route !== "/" && !WEBSITE_ROUTES.test(route) && !route.includes("["),
);

test.describe("an app address in a plain browser", () => {
  test("is the app-only page, marked noindex, in the server's own HTML of every app route and locale", async ({ request }) => {
    expect(APP_ROUTES.length, "the route list names no app route").toBeGreaterThan(10);
    for (const locale of routing.locales) {
      for (const route of APP_ROUTES) {
        const address = `/${locale}${route}/`;
        const html = await (await request.get(address)).text();
        expect(html, address).toContain('data-testid="app-only-page"');
        expect(html, address).toMatch(/<meta name="robots" content="noindex/);
        expect(html, address).not.toContain('rel="canonical"');
      }
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

  test("keeps the app-only page and mounts nothing", async ({ page }) => {
    await page.goto("/ko/topology/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("app-only-page")).toBeVisible();
    // The workbench's HTML is in the document, inert: React gave none of its nodes a fiber.
    const rail = page.getByTestId("app-nav-rail");
    await expect(rail).toBeHidden();
    expect(await rail.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber")))).toBe(false);
  });

  test("forgets the folder a browser's earlier website remembered, and only that", async ({ page }) => {
    // The website's own pages run the same cleanup, so the old database is made once it has run.
    await page.goto("/ko/download/");
    await page.waitForLoadState("networkidle");
    await seedOldStore(page, [
      { key: "docs-vault:fs-handle:current", kind: "browser-folder" },
      { key: "docs-vault:current-handle", kind: "browser-folder" },
      { key: "docs-vault:fs-handle:other-folder", kind: "app-folder" },
      { key: "appearance", kind: "other" },
    ]);
    expect(Object.keys(await readOldStore(page)).sort()).toEqual([
      "appearance",
      "docs-vault:current-handle",
      "docs-vault:fs-handle:current",
      "docs-vault:fs-handle:other-folder",
    ]);

    await page.goto("/ko/topology/");
    await page.waitForLoadState("networkidle");

    // Only the browser's folder handles go: the record naming a path on disk and the other key stay,
    // with every byte they held.
    await expect.poll(async () => readOldStore(page)).toEqual({
      "docs-vault:fs-handle:other-folder": 200_000,
      appearance: 200_000,
    });
  });

  test("offers the download and the sample map, and the sample map opens", async ({ page }) => {
    await page.goto("/ko/topology/");
    await expect(page.getByTestId("app-only-download")).toHaveAttribute("href", /\/download\/?$/);
    await page.getByTestId("app-only-sample").click();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
  });

  test("`/ko/` goes to the download page from the document head, with no app address fetched on the way", async ({ page }) => {
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents.push(new URL(request.url()).pathname);
    });
    await page.goto("/ko/");
    await expect(page).toHaveURL(/\/ko\/download\/?$/, { timeout: 15_000 });
    await expect(page.getByTestId("app-only-page")).toHaveCount(0);
    await expect(page.locator('[data-tabbar="primary"]')).toBeHidden();
    expect(documents).toEqual(["/ko/", "/ko/download/"]);
  });
});
