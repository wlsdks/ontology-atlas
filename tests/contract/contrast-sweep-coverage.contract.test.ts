import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUDITED_ROUTES, EXCLUDED_ROUTES } from "../e2e/audited-routes";

/**
 * The contrast sweep must cover every route in `AUDITED_ROUTES`; an unmeasured screen is not a
 * passing screen. A new route breaks `audited-route-coverage` first, then this contract.
 */
const HARNESS = join(process.cwd(), "scripts/measure-contrast.mjs");

function harnessRoutes(): string[] {
  const source = readFileSync(HARNESS, "utf8");
  const block = /export const DEFAULT_ROUTES = \[([\s\S]*?)\];/.exec(source);
  if (!block) throw new Error("measure-contrast.mjs 에서 DEFAULT_ROUTES 를 못 찾았다");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const normalize = (route: string) => (route.endsWith("/") ? route : `${route}/`);

describe("대비 스윕 커버리지", () => {
  it("감사 대상 라우트를 하나도 빠뜨리지 않는다", () => {
    const swept = new Set(harnessRoutes().map(normalize));
    const missing = AUDITED_ROUTES.map(normalize).filter((route) => !swept.has(route));
    expect(missing, `대비를 안 재는 라우트: ${missing.join(", ")}`).toEqual([]);
  });

  it("제외한 라우트는 스윕에도 없다 — 제외 사유가 두 곳에서 어긋나지 않게", () => {
    const swept = new Set(harnessRoutes().map(normalize));
    const leaked = Object.keys(EXCLUDED_ROUTES)
      .map(normalize)
      .filter((route) => swept.has(route));
    expect(leaked, `제외 라우트인데 스윕에 있다: ${leaked.join(", ")}`).toEqual([]);
  });

  /**
   * Checks the detector is not **running on an empty set** (`/gate-probe`). If the
   * regex silently matches nothing, both assertions above go green with "nothing is
   * missing".
   */
  it("하네스에서 라우트를 실제로 읽어 온다", () => {
    expect(harnessRoutes().length).toBeGreaterThanOrEqual(AUDITED_ROUTES.length);
  });
});
