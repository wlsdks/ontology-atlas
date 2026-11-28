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
 * `GatewayEntryFallback` serves `/`, which hands a browser on to `/download`. The latter two must say different things.
 */
const APPROVED_FALLBACKS = [
  "RouteLoadingFallback",
  "MapEntryFallback",
  "GatewayEntryFallback",
  // The Vite app's client form of `MapEntryFallback`, which is a server component and cannot render there.
  "MapEntryPending",
] as const;

/**
 * A boundary that holds hydration on purpose has no fallback to show: React keeps the server's HTML
 * for a dehydrated boundary that suspends, so the page stays as exported. `AppAddressFaces` is that
 * boundary: a plain browser keeps the app's screen as inert HTML under the app-only page.
 */
const HYDRATION_HOLDS = [
  join("src", "app", "providers", "AppAddressFaces.tsx"),
  // The wrapper itself: its `fallback={null}` is the point, and where it may stand is checked below.
  join("src", "shared", "ui", "fallbacks", "silent-suspense.tsx"),
  // The not-found and error screens load as one chunk with their own words, and stand where the loading
  // picture of `index.html` or the screen they replace already is; they cannot read the workbench's messages.
  join("src", "app", "routes", "__root.tsx"),
  join("src", "app", "routes", "$locale", "_app", "route.tsx"),
];

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
  const suspenseFiles = files.filter(
    (p) =>
      readFileSync(p, "utf-8").includes("<Suspense") &&
      !HYDRATION_HOLDS.some((hold) => p.endsWith(hold)),
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

  it("a silent boundary wraps only a lazily loaded piece, never a screen's content", () => {
    // `<SilentSuspense>` shows nothing while its child loads, which is right for a control or overlay whose
    // chunk arrives after the screen is drawn, and a blank screen for anything that is the content.
    const users = files.filter((p) => readFileSync(p, "utf-8").includes("<SilentSuspense"));
    expect(users.length, "no silent boundary found; the check would idle").toBeGreaterThan(3);
    const offenders = users.flatMap((p) => {
      const source = readFileSync(p, "utf-8");
      return [...source.matchAll(/<SilentSuspense>\s*<([A-Z]\w*)/gu)]
        .map((match) => match[1]!)
        .filter((child) => !new RegExp(`const ${child} = lazy\\(`, "u").test(source))
        .map((child) => `${rel(p)}: ${child}`);
    });
    expect(offenders).toEqual([]);
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
    expect(source).toContain("sample/");
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
