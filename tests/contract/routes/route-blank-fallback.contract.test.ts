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

describe("라우트 진입 빈 화면 게이트", () => {
  const files = collectTsxFiles(SCAN_DIRS[0]).concat(
    collectTsxFiles(SCAN_DIRS[1]),
  );
  const suspenseFiles = files.filter((p) =>
    readFileSync(p, "utf-8").includes("<Suspense"),
  );
  const rel = (p: string) => p.replace(process.cwd() + "/", "");

  it("스캔 대상 Suspense 경계를 찾는다", () => {
    expect(suspenseFiles.length).toBeGreaterThan(5);
  });

  it("어떤 Suspense 도 fallback 을 null 로 두지 않는다", () => {
    const offenders = suspenseFiles.filter((p) =>
      /fallback=\{\s*null\s*\}/.test(readFileSync(p, "utf-8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("Suspense 를 쓰는 파일은 승인된 공용 fallback 만 쓴다", () => {
    const offenders = suspenseFiles.filter((p) => {
      const source = readFileSync(p, "utf-8");
      return !APPROVED_FALLBACKS.some((name) => source.includes(name));
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("analysis has a named, busy destination while its implementation loads", () => {
    const shell = readFileSync("src/views/ontology-insights/ui/InsightsLoadingView.tsx", "utf8");
    expect(shell).toContain('<h1');
    expect(shell).toContain('aria-busy="true"');
    expect(shell).toContain('role="status"');
    expect(shell).toContain('data-route-loading="true"');
  });

  it("자리표시자 문구가 ko · en 양쪽에 있다", () => {
    for (const messages of [koMessages, enMessages]) {
      const value = (messages as { nav: Record<string, unknown> }).nav
        .surfaceLoading;
      expect(typeof value).toBe("string");
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  it("내용이 곧 fallback 인 라우트는 각자 자기 자리의 fallback 을 쓴다", () => {
    for (const [route, expected] of CONTENT_FALLBACK_ROUTES) {
      const source = readFileSync(route, "utf-8");
      expect(source, `${route} 가 ${expected} 를 안 쓴다`).toContain(expected);
      // Using the other one makes that address describe a different screen.
      const other = expected === "MapEntryFallback" ? "GatewayEntryFallback" : "MapEntryFallback";
      expect(source, `${route} 가 ${other} 를 쓴다 — 그 주소의 화면이 아니다`).not.toContain(other);
    }
  });

  it("관문 fallback 도 로딩 자막이 아니라 제품 문장을 싣는다", () => {
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

  it("그 fallback 은 로딩 자막이 아니라 제품 문장을 싣는다", () => {
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
