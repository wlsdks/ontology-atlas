import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import koMessages from "../../../messages/ko.json";
import enMessages from "../../../messages/en.json";

/**
 * `output: "export"` bakes the nearest Suspense fallback into HTML for `useSearchParams()` views,
 * so a `null` fallback leaves an empty body. Entry-route fallbacks must carry content.
 */

const SCAN_DIRS = [join(process.cwd(), "app"), join(process.cwd(), "src")];

/**
 * `RouteLoadingFallback` is the default, `MapEntryFallback` serves `/topology` and
 * `GatewayEntryFallback` serves `/`. The latter two must say different things.
 */
const APPROVED_FALLBACKS = [
  "RouteLoadingFallback",
  "InsightsLoadingView",
  "MapEntryFallback",
  "GatewayEntryFallback",
] as const;

/**
 * Places where the fallback is the page content: [route, the fallback that route must use]. The
 * pairing matters so the gate guards the right fallback for each route.
 */
const CONTENT_FALLBACK_ROUTES = [
  [join(process.cwd(), "app/[locale]/page.tsx"), "GatewayEntryFallback"],
  [join(process.cwd(), "app/[locale]/topology/page.tsx"), "MapEntryFallback"],
] as const;

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, out);
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("blank-screen gate on route entry", () => {
  const files = collectTsxFiles(SCAN_DIRS[0]).concat(
    collectTsxFiles(SCAN_DIRS[1]),
  );
  const suspenseFiles = files.filter((p) =>
    readFileSync(p, "utf-8").includes("<Suspense"),
  );
  const rel = (p: string) => p.replace(process.cwd() + "/", "");

  it("finds the Suspense boundaries to scan", () => {
    expect(suspenseFiles.length).toBeGreaterThan(5);
  });

  it("no Suspense leaves its fallback as null", () => {
    const offenders = suspenseFiles.filter((p) =>
      /fallback=\{\s*null\s*\}/.test(readFileSync(p, "utf-8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("a file that uses Suspense uses only the approved shared fallback", () => {
    const offenders = suspenseFiles.filter((p) => {
      const source = readFileSync(p, "utf-8");
      return !APPROVED_FALLBACKS.some((name) => source.includes(name));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("analysis has a named, busy destination while its implementation loads", () => {
    const shell = readFileSync("src/views/ontology-insights/ui/InsightsLoadingView.tsx", "utf8");
    expect(shell).toContain('<PageHeaderBar');
    expect(shell, 'the loading view names the page, so its title is the h1').not.toContain('titleAs=');
    expect(shell).toContain('aria-busy="true"');
    expect(shell).toContain('role="status"');
    expect(shell).toContain('data-route-loading="true"');
  });

  it("the placeholder wording exists in both ko and en", () => {
    for (const messages of [koMessages, enMessages]) {
      const value = (messages as { nav: Record<string, unknown> }).nav
        .surfaceLoading;
      expect(typeof value).toBe("string");
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  it("a route whose content is its own fallback uses the fallback for its own spot", () => {
    for (const [route, expected] of CONTENT_FALLBACK_ROUTES) {
      const source = readFileSync(route, "utf-8");
      expect(source, `${route} does not use ${expected}`).toContain(expected);
      // Using the other one makes that address describe a different screen.
      const other = expected === "MapEntryFallback" ? "GatewayEntryFallback" : "MapEntryFallback";
      expect(source, `${route} uses ${other}, which is not the screen of that address`).not.toContain(other);
    }
  });

  it("the gateway fallback also carries a product sentence rather than a loading caption", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/ui/fallbacks/gateway-entry-fallback.tsx"),
      "utf-8",
    );
    // The fallback carries the same sentences as the real screen: the headline plus the two places to go.
    expect(source).toContain("heroTitleLine1");
    expect(source).toContain("heroTitleLine2");
    expect(source).toContain("heroLead");
    expect(source).toContain("download/");
    expect(source).toContain("topology/");
  });

  it("that fallback carries a product sentence rather than a loading caption", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/ui/fallbacks/map-entry-fallback.tsx"),
      "utf-8",
    );
    // A headline and a lede are what keep the demo URL from reverting to a page with nothing to read.
    for (const key of ["headline", "lede"]) {
      expect(source).toContain(`t('${key}')`);
    }

    for (const messages of [koMessages, enMessages]) {
      const mapEntry = (messages as { mapEntry: Record<string, string> })
        .mapEntry;
      // Must be a real sentence, clearly longer than a one-line caption (roughly 40 characters).
      expect(mapEntry.headline.trim().length).toBeGreaterThan(10);
      expect(mapEntry.lede.trim().length).toBeGreaterThan(40);
    }
  });
});
