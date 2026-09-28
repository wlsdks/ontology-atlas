import { expect, test, type Page, type Route } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { waitForPageSettled } from "./settle";

function holdRequests(page: Page, matches: (url: URL) => boolean) {
  const held: Route[] = [];
  let holding = true;
  const registered = page.route(matches, (route) => {
    if (holding) held.push(route);
    else void route.continue();
  });
  return {
    registered,
    count: () => held.length,
    release: async () => {
      holding = false;
      for (const route of held.splice(0)) await route.continue();
    },
  };
}

test("a rail press made while the Ontology tab opens still reaches its destination", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedFirstRunSeen(page);
  const destination = holdRequests(
    page,
    (url) => url.pathname.startsWith("/en/automations/") && (url.pathname.endsWith(".txt") || url.searchParams.has("_rsc")),
  );
  await destination.registered;
  await page.goto("/en/library/?guides=off", { waitUntil: "domcontentloaded" });
  await waitForPageSettled(page);

  const docsView = holdRequests(page, (url) => url.pathname.startsWith("/_next/static/chunks/"));
  await docsView.registered;
  await page.getByTestId("library-workspace-ontology").click();
  await expect(page).toHaveURL((url) => url.searchParams.get("tab") === "ontology");
  await expect.poll(docsView.count, { message: "the docs view mounted before the rail press" }).toBeGreaterThan(0);

  await page.getByTestId("app-nav-rail-item-automations").click();
  await docsView.release();
  await expect(page).toHaveURL((url) => url.searchParams.has("slug"));
  await destination.release();
  await expect(page).toHaveURL((url) => url.pathname === "/en/automations/");

  await page.goBack();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/en/library/" && url.searchParams.get("tab") === "ontology" && url.searchParams.has("slug"),
  );
});

test("a document the address could not open is announced once, not again after a tab round trip", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedFirstRunSeen(page);
  await page.goto("/en/library/?guides=off&tab=ontology&slug=no-such-document", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("docs-missing-slug-banner")).toBeVisible();
  await expect(page).toHaveURL((url) => (url.searchParams.get("slug") ?? "no-such-document") !== "no-such-document");
  const opened = new URL(page.url()).searchParams.get("slug");

  await page.getByTestId("library-workspace-wiki").click();
  await expect(page).toHaveURL((url) => url.searchParams.get("tab") === "wiki");
  await page.getByTestId("library-workspace-ontology").click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("tab") === "ontology" && url.searchParams.get("slug") === opened,
  );
  await expect(page.locator("#library-workspace-tabpanel-ontology [data-docs-viewer]")).toBeVisible();
  await expect(page.getByTestId("docs-missing-slug-banner")).toHaveCount(0);
});
