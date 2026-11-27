import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { atlasSampleFiles, installDesktopRailRuntime, mountDesktopVault, storefrontSampleFiles } from "../desktop-rail-arrival-harness";

/**
 * Detects interactive elements that are not accessible, per route.
 *   - A <button> with neither an aria-label nor inner text — a screen reader cannot
 *     announce it.
 *   - The same rule for <a>.
 *   - Decorative aria-hidden="true" is exempt.
 *
 * A find fails the spec, so a new interactive element arriving unlabelled is caught
 * automatically.
 */

/* The slug must be a node of the Storefront folder the app has open. */
const FOCUS_NODE_ID = "capability:cart";

/** Each route is read in the folder it measured: Storefront, or the Atlas sample for its own project. */
const ROUTES = [
  { url: "/en/", folder: "storefront" },
  { url: "/en/project/ontology-atlas/", folder: "atlas" },
  { url: "/en/docs/", folder: "storefront" },
  { url: "/en/topology/", folder: "storefront" },
  { url: `/ko/topology/?mode=focus&p=${encodeURIComponent(FOCUS_NODE_ID)}`, folder: "storefront" },
] as const;

const windows: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(windows.splice(0).map((context) => context.close()));
});

/** A window of its own: the app remembers the folder a window chose, so two folders need two. Closed after the test. */
async function openApp(browser: Browser, baseURL: string | undefined, folder: "storefront" | "atlas"): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  windows.push(context);
  const page = await context.newPage();
  await installDesktopRailRuntime(page, folder === "atlas" ? atlasSampleFiles() : storefrontSampleFiles(), undefined, { replaceFixture: true });
  await mountDesktopVault(page, "en");
  return page;
}

/** Minimum scanned count: an empty violation list passes automatically on a screen that never mounted. */
const MIN_SCANNED_PER_ROUTE = 5;

test("detects buttons and links without accessible names", async ({ browser, baseURL }) => {
  const apps = { storefront: await openApp(browser, baseURL, "storefront"), atlas: await openApp(browser, baseURL, "atlas") };
  const findings: string[] = [];
  /** How many were scanned per screen — the denominator that blocks "passed having seen 0". */
  const scannedPerRoute: string[] = [];

  for (const { url, folder } of ROUTES) {
    const page = apps[folder];
    await page.goto(url === "/en/docs/" ? "/en/library/?tab=ontology" : url, {
      waitUntil: "domcontentloaded",
    });
    if (url === "/en/docs/") {
      await expect(page).toHaveURL(
        (current) =>
          current.pathname === "/en/library/" && current.searchParams.get("tab") === "ontology",
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }
    /*
     * Wait on **something existing to look at** rather than a fixed delay — 600 ms is a
     * fast machine's number, and on a slow one there was nothing to scan, so the
     * violation list was empty and it passed.
     */
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.querySelectorAll('button, [role="button"], a').length,
          ),
        { timeout: 20_000, message: `no control to scan appeared on ${url}` },
      )
      .toBeGreaterThanOrEqual(MIN_SCANNED_PER_ROUTE);

    const scanned = await page.evaluate(
      () => document.querySelectorAll('button, [role="button"], a').length,
    );
    scannedPerRoute.push(`${url} → ${scanned}`);

    const offenders = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"], a'),
      );
      return els
        .filter((el) => {
          const hasLabel = Boolean(
            el.getAttribute("aria-label")?.trim() ||
              el.getAttribute("aria-labelledby"),
          );
          const text = (el.textContent ?? "").trim();
          if (hasLabel || text.length > 0) return false;
          if (el.getAttribute("aria-hidden") === "true") return false;
          return true;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          html: el.outerHTML.slice(0, 160),
        }));
    });
    if (offenders.length > 0) {
      for (const o of offenders) {
        findings.push(`${url} · <${o.tag}> ${o.html}`);
      }
    }
    if (url.includes("/topology/")) {
      const hiddenInteractive = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            [
              '[aria-hidden="true"] button',
              '[aria-hidden="true"] [role="button"]',
              '[aria-hidden="true"] a',
              '[aria-hidden="true"] [tabindex]:not([tabindex="-1"])',
            ].join(","),
          ),
        );
        return els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          html: el.outerHTML.slice(0, 160),
        }));
      });
      if (hiddenInteractive.length > 0) {
        for (const o of hiddenInteractive) {
          findings.push(`${url} · aria-hidden subtree exposes <${o.tag}> ${o.html}`);
        }
      }
    }
  }

  /*
   * Did the focused screen really open? If the name disappears again this breaks here.
   * The map is a canvas so the DOM cannot be asked, and the instrument (`__atlasMap`) is
   * used instead — but that window opens only on pages carrying `?e2e=1`
   * (`atlas-map-probe.ts`). So the page is opened once more at the instrument address
   * rather than the audit address.
   */
  const storefront = apps.storefront;
  await storefront.goto(`/ko/topology/?e2e=1&mode=focus&p=${encodeURIComponent(FOCUS_NODE_ID)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(
      () =>
        storefront.evaluate(() => {
          const map = (window as unknown as { __atlasMap?: { selection?: () => { nodeId: string | null } } }).__atlasMap;
          return map?.selection?.().nodeId ?? null;
        }),
      { timeout: 20_000, message: "the focus screen did not open that node, so the audit target is empty" },
    )
    .toBe(FOCUS_NODE_ID);

  console.log(`[A11Y-AUDIT] scanned=${scannedPerRoute.join(" · ")}`);
  console.log(`[A11Y-AUDIT] findings=${findings.length}`);
  for (const f of findings.slice(0, 20)) console.log(`[A11Y-AUDIT]   ${f}`);
  expect(
    findings,
    `${findings.length} interactive elements without an accessible label:\n${findings.slice(0, 10).join("\n")}`,
  ).toHaveLength(0);
});
