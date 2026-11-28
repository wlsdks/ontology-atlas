import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUDITED_ROUTES, EXCLUDED_ROUTES } from "../../e2e/audited-routes";

/**
 * Every route is either measured or excluded with a reason in `EXCLUDED_ROUTES`; an unclassified
 * route fails. Reads the route modules on purpose: a copied route list would drift from the source.
 */

/** The route modules: `$locale/_app` holds the app's screens, `$locale/_site` the public pages. */
const ROUTES_DIR = path.resolve(__dirname, "../../../src/app/routes/$locale");

/**
 * Walks the route modules for route patterns. A layout folder (`_app`) adds no URL segment, `route.tsx`
 * is a layout, `index.tsx` is its folder's address, `$param` is a dynamic segment and `$.tsx` the
 * catch-all that answers "not found".
 */
function discoverRoutes(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      const segment = entry.startsWith("_") ? "" : `/${entry.replace(/^\$(.+)$/, "[$1]")}`;
      found.push(...discoverRoutes(full, `${prefix}${segment}`));
      continue;
    }
    if (!entry.endsWith(".tsx") || entry === "route.tsx" || entry === "$.tsx") continue;
    if (entry === "index.tsx") {
      if (prefix !== "") found.push(prefix);
      continue;
    }
    found.push(`${prefix}/${entry.slice(0, -".tsx".length).replace(/^\$(.+)$/, "[$1]")}`);
  }
  return found;
}

/**
 * Matches a route pattern against the URL a ratchet opens. A dynamic segment
 * (`[slug]`) is opened with a real value, so this compares **shape**, not text.
 */
function matchesAuditedUrl(routePattern: string, url: string): boolean {
  const patternParts = `/ko${routePattern}`.split("/").filter(Boolean);
  const urlParts = url.split("/").filter(Boolean);
  if (patternParts.length !== urlParts.length) return false;
  return patternParts.every((part, i) =>
    part.startsWith("[") && part.endsWith("]") ? urlParts[i].length > 0 : part === urlParts[i],
  );
}

describe("route coverage of the accessibility ratchet", () => {
  const routes = ["/", ...discoverRoutes(ROUTES_DIR)];

  it("actually finds the canonical inventory, so the detector does not idle on an empty set", () => {
    // Without this assertion `discoverRoutes` returning 0 would leave every check below green.
    expect(routes.length).toBeGreaterThanOrEqual(19);
    expect(routes).toContain("/topology");
    expect(routes).toContain("/git");
    expect(routes).toContain("/sample");
    expect(routes).toContain("/download");
  });

  it("every route is classified as measured or excluded with a reason", () => {
    const unclassified = routes.filter(
      (route) =>
        !(route in EXCLUDED_ROUTES) &&
        !AUDITED_ROUTES.some((url) => matchesAuditedUrl(route, url)),
    );

    expect(
      unclassified,
      `Some routes are outside the accessibility ratchet. To measure one, add its real URL to ` +
        `AUDITED_ROUTES in tests/e2e/audited-routes.ts; to leave it out, list it in EXCLUDED_ROUTES ` +
        `**with the reason**. When code cannot tell a route that slipped out from one left out on purpose, ` +
        `the next person builds the same blind spot.\n` +
        unclassified.map((r) => `  ${r}`).join("\n"),
    ).toEqual([]);
  });

  it("the exclusion list has no dead entry, since the reason for a vanished route is misinformation", () => {
    const stale = Object.keys(EXCLUDED_ROUTES).filter((route) => !routes.includes(route));
    expect(stale, `EXCLUDED_ROUTES points at a route that does not exist: ${stale.join(", ")}`).toEqual([]);
  });

  it("an exclusion reason is not empty", () => {
    for (const [route, reason] of Object.entries(EXCLUDED_ROUTES)) {
      expect(reason.trim().length, `the exclusion reason of ${route} is empty`).toBeGreaterThan(10);
    }
  });

  it("measures the 404 at two addresses, inside and outside the locale", () => {
    // Both addresses resolve to `app/not-found.tsx`; both are kept so a change to the not-found
    // wiring cannot slip an unaudited surface back in.
    expect(AUDITED_ROUTES.some((url) => /^\/ko\/.*does-not-exist/.test(url))).toBe(true);
    expect(AUDITED_ROUTES.some((url) => /^\/[^/]*does-not-exist/.test(url))).toBe(true);
  });
});
