import { expect, test, type Page } from "@playwright/test";

import { routing } from "../../../src/i18n/routing";

/**
 * What the prerendered website promises a reader and a crawler, on the folder `pnpm site:build` writes:
 * the words are in the document before any script runs, the script that follows adopts them without a
 * single hydration complaint, and moving between pages is a page load, as the pages are separate documents.
 * Every pass here can fail: a page that waited for scripts, or one the browser re-rendered instead of
 * adopting, turns a line red.
 */

/** One page of each kind the site writes, with a sentence that only the page itself says. */
const PUBLIC_PAGES = [
  { path: "/guide/", reads: "gateway-doc-body" },
  { path: "/guide/relations/", reads: "gateway-doc-body" },
  { path: "/changelog/", reads: "gateway-doc-body" },
  { path: "/sample/", reads: "sample-map-size" },
  { path: "/download/", reads: "download-gnb" },
] as const;

function listenForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 240)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 240)}`));
  return problems;
}

test.describe("the prerendered website", () => {
  test.skip(!process.env.PLAYWRIGHT_STATIC, "only the built site folder holds prerendered pages; the dev server writes none, so this would only watch it fail");

  test.describe("with scripts off", () => {
    test.use({ javaScriptEnabled: false });

    test("has a public page's words in the document, and draws no map", async ({ page }) => {
      for (const locale of routing.locales) {
        for (const { path, reads } of PUBLIC_PAGES) {
          const address = `/${locale}${path}`;
          await page.goto(address);
          await expect(page.getByTestId(reads), address).toBeVisible();
          await expect(page.locator("main h1"), address).toHaveCount(1);
          // The download page's own stage is canvas markup in the document; the map and the sample's map run in scripts.
          if (path !== "/download/") await expect(page.locator("canvas"), address).toHaveCount(0);
        }
      }
    });

    test("has the guide's chapter text, not a loading picture", async ({ page }) => {
      for (const locale of routing.locales) {
        const address = `/${locale}/guide/relations/`;
        await page.goto(address);
        const body = await page.getByTestId("gateway-doc-body").innerText();
        // A chapter in a script of fewer letters per idea is still pages long; a loading picture is a line.
        expect(body.length, `${address}: the chapter body is empty`).toBeGreaterThan(800);
        await expect(page.getByTestId("gateway-doc-empty"), address).toHaveCount(0);
      }
    });

    test("has an app address's page that says the app is needed", async ({ page }) => {
      for (const locale of routing.locales) {
        await page.goto(`/${locale}/topology/`);
        await expect(page.getByTestId("app-only-page"), locale).toBeVisible();
      }
    });
  });

  test("adopts every public page in every language without a hydration complaint", async ({ page }) => {
    const problems = listenForProblems(page);
    for (const locale of routing.locales) {
      for (const { path } of PUBLIC_PAGES) {
        const address = `/${locale}${path}`;
        await page.goto(address);
        await page.waitForLoadState("networkidle");
        // React owns the whole document once it has hydrated it, and marks it so.
        const adopted = await page.evaluate(() => ({
          prerendered: document.getElementById("root")!.dataset.prerendered,
          owned: Object.keys(document).some((key) => key.startsWith("__reactContainer")),
        }));
        expect(adopted.prerendered, address).toBe(address);
        expect(adopted.owned, `${address} was never hydrated`).toBe(true);
      }
    }
    expect(problems).toEqual([]);
  });

  test("keeps the server's markup in the document while it hydrates", async ({ page }) => {
    await page.goto("/en/guide/relations/", { waitUntil: "commit" });
    // Mark a node of the prerendered page before scripts run; hydration keeps it, a fresh render replaces it.
    await page.waitForSelector('[data-testid="gateway-doc-body"]', { state: "attached" });
    await page.evaluate(() => {
      document.querySelector('[data-testid="gateway-doc-body"]')!.setAttribute("data-server-node", "kept");
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-server-node="kept"]')).toHaveCount(1);
  });

  test("moves from one guide chapter to the next as a page load", async ({ page, request }) => {
    const html = await (await request.get("/en/guide/")).text();
    test.skip(html.includes("/_next/"), "Next's export moves between guide chapters inside one document; this is the Vite prerender's rule");

    await page.goto("/en/guide/");
    await page.waitForLoadState("networkidle");
    const documents: string[] = [];
    page.on("request", (pending) => {
      if (pending.resourceType() === "document") documents.push(new URL(pending.url()).pathname);
    });
    await page.getByTestId("guide-nav-relations").first().click();
    await page.waitForURL("**/en/guide/relations/");
    expect(documents).toEqual(["/en/guide/relations/"]);
  });

  test("changes the language as a page load, so the new page keeps what only its own document holds", async ({ page, request }) => {
    const html = await (await request.get("/en/guide/")).text();
    test.skip(html.includes("/_next/"), "Next's export changes the language inside one document; this is the Vite prerender's rule");

    // The sample's size and a chapter's dates are recorded into each document at build time; a move inside the
    // router would render the new language's page without them.
    for (const { path, keeps } of [
      { path: "/sample/", keeps: "sample-map-size" },
      { path: "/guide/relations/", keeps: "gateway-doc-updated" },
    ]) {
      await page.goto(`/en${path}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId(keeps), `/en${path}`).toBeVisible();
      const documents: string[] = [];
      const noteDocument = (pending: { resourceType(): string; url(): string }) => {
        if (pending.resourceType() === "document") documents.push(new URL(pending.url()).pathname);
      };
      page.on("request", noteDocument);
      await page.getByRole("radio", { name: /^KO\b/ }).first().click();
      await page.waitForURL(`**/ko${path}`);
      await page.waitForLoadState("networkidle");
      page.off("request", noteDocument);
      expect(documents, `/ko${path} was not loaded as a document`).toEqual([`/ko${path}`]);
      await expect(page.getByTestId(keeps), `/ko${path} lost what its own document holds`).toBeVisible();
    }
  });
});
