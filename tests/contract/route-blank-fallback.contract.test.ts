import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import koMessages from "../../messages/ko.json";
import enMessages from "../../messages/en.json";

/**
 * Gate against a blank screen right after entry (2026-07-27, audit D1 and D2).
 *
 * Background: every full-screen route in this app is a client view using
 * `useSearchParams()`. `output: 'export'` cannot prerender such a view and
 * **bakes the nearest Suspense fallback into the HTML instead**. If that fallback
 * is `null`, the deployed `index.html` body contains nothing — not even the
 * `#main` landmark. Until the bundle downloads and hydrates, the user sees a black
 * screen with only the rail, and during that time "broken", "empty vault", and
 * "loading" all look identical.
 *
 * Measured (static export, 2026-07-27): under 6× CPU throttling both the studio
 * and insights were blank in 50/50 samples at 500ms after entry; adding fast3G
 * left them blank in 30/30 samples even at 3s. A timing defect returns quietly, so
 * it is locked with a source gate.
 *
 * What this test locks:
 *  1. Nowhere in `app/` or `src/` is there a `<Suspense fallback={null}>`. It
 *     covers not just route `page.tsx` files but **boundaries inside views** — if
 *     an inner boundary is nearer, its fallback is what gets baked into the HTML,
 *     so fixing only the route leaves surfaces such as the docs vault silently
 *     blank (measured 2026-07-27).
 *  2. Files using Suspense use **approved shared fallbacks** only (hand-made
 *     placeholders per screen mean nobody notices when one is missing).
 *  3. The placeholder copy exists in both locales.
 *  4. The fallbacks for the entry routes (`/`, `/topology`) carry **content**, not
 *     a loading caption. In a static export the HTML body of those two routes is
 *     the fallback and nothing else, and `/topology` is the **demo URL** that the
 *     README and launch assets point at — measured 2026-07-27, it served 197KB
 *     containing 142 human-readable characters whose key sentence was "loading the
 *     screen". That was the entire page content seen by link-preview cards and
 *     crawlers. This row locks that regression.
 */

const SCAN_DIRS = [join(process.cwd(), "app"), join(process.cwd(), "src")];

/**
 * The approved shared fallbacks, each with a different job.
 *
 * - `RouteLoadingFallback` — the default. One sentence: this screen is still
 *   coming.
 * - `MapEntryFallback` — for the map entry route (`/topology`) only.
 * - `GatewayEntryFallback` — for the root `/` only.
 *
 * **Why a third exists** (2026-07-30): `/` changed from the map to the gateway
 * (the product's face) — the ledger's reversal of "root-first-open". Both places
 * share the property that the HTML body is nothing but the fallback, but **what
 * they must say differs**: one describes the map, the other the product's face.
 * Merging them makes the link preview of the primary address say something other
 * than what actually opens.
 *
 * Keeping this array short is the contract. Adding a fourth requires first
 * establishing why that screen needs its own placeholder.
 */
const APPROVED_FALLBACKS = [
  "RouteLoadingFallback",
  "MapEntryFallback",
  "GatewayEntryFallback",
] as const;

/**
 * Places where the fallback *is* the page content — [route, the fallback that
 * place must use].
 *
 * **The pairing matters.** It used to be "both use `MapEntryFallback`", and if
 * that check still passed after `/` became the face, the gate would be guarding
 * exactly the wrong thing.
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
      join(process.cwd(), "src/shared/ui/gateway-entry-fallback.tsx"),
      "utf-8",
    );
    // What the face must say: what it is (the headline) plus the two places to go.
    // 2026-08-18 remake: the headline key moved from `stageTitle` to
    // `heroTitleLine1/2` — following this file's own contract that the fallback
    // carries the same sentences as the real screen (the old key vanished from the
    // catalogue while this source kept requesting it, so `/ko/` printed
    // MISSING_MESSAGE).
    expect(source).toContain("heroTitleLine1");
    expect(source).toContain("heroTitleLine2");
    expect(source).toContain("heroLead");
    expect(source).toContain("download/");
    expect(source).toContain("topology/");
  });

  it("그 fallback 은 로딩 자막이 아니라 제품 문장을 싣는다", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/ui/map-entry-fallback.tsx"),
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
