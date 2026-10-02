import { describe, expect, it } from "vitest";

import { DIAL_TOKEN_SPECS, resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";

import { readGlobalCss } from "../../scripts/lib/global-css.mjs";

const css = readGlobalCss();
const declared = new Map<string, string>();
for (const m of css.matchAll(/(--map-dial-[a-z0-9-]+)\s*:\s*([^;]+);/g)) declared.set(m[1]!, m[2]!.trim());
const panelInk = /--map-panel-text-primary\s*:\s*([^;]+);/.exec(css)?.[1] ?? "";
const t = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? panelInk : declared.get(v) ?? "0"));

const width = (base: number, gain: number, max: number, count: number) => Math.min(max, base + gain * Math.log2(1 + count));
const rest = (n: number) => width(t.flowRestBase, t.flowRestGain, t.flowRestMax, n);
const focus = (n: number) => width(t.flowFocusBase, t.flowFocusGain, t.flowFocusMax, n);

describe("map dial tokens", () => {
  it("declares exactly the names the reader reads", () => {
    expect([...declared.keys()].sort()).toEqual(DIAL_TOKEN_SPECS.map((s) => s.cssVar).sort());
  });

  it("keeps every value finite", () => {
    for (const value of declared.values()) expect(Number.isFinite(Number(value))).toBe(true);
  });

  it("keeps ordered pairs ordered", () => {
    expect(t.stubMinPx).toBeLessThan(t.stubMaxPx);
    expect(t.restNumbersMin).toBeLessThanOrEqual(t.restNumbersMax);
    expect(t.restStrongMin).toBeLessThanOrEqual(t.restStrongMax);
    expect(t.discMinPx).toBeLessThan(t.discMaxPx);
    expect(t.chipMinPx).toBeLessThan(t.chipMaxPx);
    expect(t.hubMinPx).toBeLessThan(t.hubMaxPx);
  });

  it("keeps ratios in range", () => {
    expect(t.flowQuietRatio).toBeGreaterThan(0);
    expect(t.flowQuietRatio).toBeLessThanOrEqual(1);
    expect(t.flowTaper).toBeGreaterThan(0);
    expect(t.flowTaper).toBeLessThanOrEqual(1);
    expect(t.chordArrival).toBeGreaterThan(0);
    expect(t.chordArrival).toBeLessThan(1);
  });

  it("draws focus at least as wide as rest, both non-decreasing", () => {
    for (let n = 1; n <= 64; n += 1) {
      expect(focus(n)).toBeGreaterThanOrEqual(rest(n));
      if (n > 1) {
        expect(rest(n)).toBeGreaterThanOrEqual(rest(n - 1));
        expect(focus(n)).toBeGreaterThanOrEqual(focus(n - 1));
      }
    }
  });

  it("keeps the floors", () => {
    expect(t.flowQuietRatio * rest(1)).toBeGreaterThanOrEqual(1);
    expect(t.numeralSize).toBeGreaterThanOrEqual(9.5);
  });

  it("hands capabilities over before their elements", () => {
    expect(t.capOnFrom).toBeLessThan(t.capOnFull);
    expect(t.capOnFull).toBeLessThanOrEqual(t.elementsAfterCapFrom);
    expect(t.elementsAfterCapFrom).toBeLessThan(t.elementsAfterCapFull);
  });

  it("resolves links only once capabilities are fully drawn", () => {
    expect(t.resolve).toBeGreaterThanOrEqual(t.capOnFull);
  });

  it("ramps elements in", () => {
    expect(t.elementOnFrom).toBeLessThan(t.elementOnFull);
  });

  it("keeps the rest budget ordered", () => {
    expect(t.restLinksMin).toBeLessThanOrEqual(t.restLinksMax);
  });

  it("lets every end keep at least two links", () => {
    expect(t.perEndCap).toBeGreaterThanOrEqual(2);
  });

  it("keeps spiral neighbours a pitch apart", () => {
    expect(t.spiralC).toBeGreaterThanOrEqual(0.6);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let n = 2; n <= 200; n += 1) {
      const pts = Array.from({ length: n }, (_, i) => {
        const r = t.spiralC * Math.sqrt(i + t.spiralK0);
        return [r * Math.cos(i * golden), r * Math.sin(i * golden)] as const;
      });
      let min = Infinity;
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) min = Math.min(min, Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]));
      expect(min).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("draws domain names at least 11 px", () => {
    expect(t.labelScale * 10).toBeGreaterThanOrEqual(11);
  });
});
