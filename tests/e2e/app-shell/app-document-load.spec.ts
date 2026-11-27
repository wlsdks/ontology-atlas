import { expect, test, type Page } from "@playwright/test";
import { routing } from "../../../src/i18n/routing";
import { architectureRoutes } from "../../contract/architecture-routes";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";

/**
 * What a document of an app address holds. A plain browser is told the app is needed from the first
 * byte, with scripts or without, and never mounts the workbench (so it opens, reads and remembers no
 * folder); the installed app, which the boot script marks before first paint, gets the workbench and,
 * once hydrated, no second page.
 */

/** One address per kind of screen: the map, a document room, a form and a settings-bearing route. */
const APP_ADDRESSES = ["/ko/topology/", "/ko/library/", "/ko/project/new/", "/ko/agents/?tab=models", "/en/work-status/"] as const;

const WEBSITE_ROUTES = /^\/(?:download|guide|changelog|sample)(?:\/|$)/;

/** Every page of the route list that is a screen of the app: not the website's, not the entry, not dynamic. */
const APP_ROUTES = architectureRoutes(process.cwd()).filter(
  (route) => route !== "/" && !WEBSITE_ROUTES.test(route) && !route.includes("["),
);

const DESKTOP_INIT = () => {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error("stub")),
    transformCallback: (cb: unknown) => cb,
  };
  (window as unknown as { isTauri?: boolean }).isTauri = true;
};

const OLD_STORE = { database: "demo-kv", store: "kv" } as const;

/** Writes entries into the database an earlier website kept its remembered folder in. */
async function seedOldStore(page: Page, entries: Array<{ key: string; kind: "browser-folder" | "app-folder" | "other" }>) {
  await page.evaluate(
    async ({ database, store, entries: seeded }) => {
      const opfs = await navigator.storage.getDirectory();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(database, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        for (const { key, kind } of seeded) {
          const weight = new Uint8Array(200_000);
          const value =
            kind === "browser-folder"
              ? { id: "current", handle: opfs, name: "old folder", weight }
              : kind === "app-folder"
                ? { id: "current", handle: { name: "app folder" }, desktopRootPath: "/Users/probe/atlas-vault", weight }
                : { weight };
          tx.objectStore(store).put(value, key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { ...OLD_STORE, entries },
  );
}

/** What the old database still holds: each key with the bytes it keeps. */
async function readOldStore(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async ({ database, store }) => {
    const known = await indexedDB.databases();
    if (!known.some((entry) => entry.name === database)) return {};
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(database, 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const kept: Record<string, number> = {};
    await new Promise<void>((resolve, reject) => {
      const walk = db.transaction(store, "readonly").objectStore(store).openCursor();
      walk.onsuccess = () => {
        const cursor = walk.result;
        if (!cursor) return resolve();
        kept[String(cursor.key)] = (cursor.value as { weight?: Uint8Array }).weight?.byteLength ?? 0;
        cursor.continue();
      };
      walk.onerror = () => reject(walk.error);
    });
    db.close();
    return kept;
  }, OLD_STORE);
}

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

test.describe("an app address in the installed app", () => {
  test("shows the workbench and, once hydrated, no app-only page: the first main is the workbench's", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.goto("/ko/library/");
    const rail = page.getByTestId("app-nav-rail");
    await expect(rail).toHaveCount(1, { timeout: 20_000 });
    // Mounted, not only present in the HTML: React gave the rail a fiber.
    await expect
      .poll(() => rail.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber"))), { timeout: 20_000 })
      .toBe(true);

    await expect(page.locator('[data-face="app-only"]')).toHaveCount(0);
    await expect(page.getByTestId("app-only-page")).toHaveCount(0);
    await expect(page.locator("#main")).toHaveCount(1);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("the skip link lands focus inside the workbench", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.goto("/ko/library/");
    await expect(page.locator("#main")).toHaveCount(1, { timeout: 20_000 });
    await page.locator('a[href="#main"]').focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[data-face="workbench"]') !== null && document.activeElement !== document.body))
      .toBe(true);
  });

  test("runs no cleanup: every record, with or without a path on disk, keeps its bytes", async ({ page }) => {
    await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true });
    await page.goto("/ko/guide/");
    await page.waitForLoadState("networkidle");
    await seedOldStore(page, [
      { key: "docs-vault:fs-handle:other-folder", kind: "app-folder" },
      { key: "docs-vault:fs-handle:browser-folder", kind: "browser-folder" },
      { key: "appearance", kind: "other" },
    ]);
    await page.goto("/ko/library/");
    await expect(page.getByTestId("app-nav-rail")).toHaveCount(1, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    // The app writes its own record beside these. The cleanup is the browser's alone, so even a record
    // with no path on disk stays here, and every seeded key keeps its bytes.
    expect(await readOldStore(page)).toMatchObject({
      "docs-vault:fs-handle:other-folder": 200_000,
      "docs-vault:fs-handle:browser-folder": 200_000,
      appearance: 200_000,
    });
  });
});
