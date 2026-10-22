import { describe, expect, it } from "vitest";

import { DIAL_INK_SPECS, DIAL_TOKEN_SPECS, resolveDialTokens } from "@/widgets/ontology-map/dial/tokens";
import { scaledLabelFontSize } from "@/widgets/ontology-map/render/labels";

import { readGlobalCss } from "../../../scripts/lib/design/global-css.mjs";

const css = readGlobalCss();
const declared = new Map<string, string>();
for (const m of css.matchAll(/(--map-dial-[a-z0-9-]+)\s*:\s*([^;]+);/g)) declared.set(m[1]!, m[2]!.trim());
const panelInk = /--map-panel-text-primary\s*:\s*([^;]+);/.exec(css)?.[1] ?? "";
const t = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? panelInk : declared.get(v) ?? "0"));

const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const width = (base: number, gain: number, max: number, count: number) => Math.min(max, base + gain * Math.log2(1 + count));
const rest = (n: number) => width(t.flowRestBase, t.flowRestGain, t.flowRestMax, n);
const focus = (n: number) => width(t.flowFocusBase, t.flowFocusGain, t.flowFocusMax, n);

describe("map dial tokens", () => {
  it("declares exactly the names the reader reads", () => {
    expect([...declared.keys()].sort()).toEqual([...DIAL_TOKEN_SPECS, ...DIAL_INK_SPECS].map((s) => s.cssVar).sort());
  });

  it("keeps every value finite", () => {
    for (const { cssVar } of DIAL_TOKEN_SPECS) expect(Number.isFinite(Number(declared.get(cssVar)))).toBe(true);
  });

  it("keeps neutral kind outlines above 3:1 and their fills below the outlines", () => {
    const ground = /--map-canvas-bg-near\s*:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? "";
    for (const { cssVar } of DIAL_INK_SPECS) expect(declared.get(cssVar)).toMatch(/^#[0-9a-f]{6}$/);
    const c = (ink: string) => contrast(ink, ground);
    expect(c(t.strokeDomain)).toBeGreaterThan(c(t.strokeCapability) + 1);
    expect(c(t.strokeCapability)).toBeGreaterThan(c(t.strokeElement) + 1);
    expect(c(t.strokeElement)).toBeGreaterThanOrEqual(3);
    expect(c(t.fillDomain)).toBeGreaterThan(c(t.fillCapability));
    expect(c(t.fillDomain)).toBeLessThan(c(t.strokeDomain));
    expect(c(t.fillCapability)).toBeLessThan(c(t.strokeCapability));
    const projectFill = /--map-node-fill-project\s*:\s*([^;]+);/.exec(css)![1]!.trim();
    expect(projectFill).not.toBe(t.fillDomain);
    console.info("[dial-material-contrast]", JSON.stringify(Object.fromEntries(["strokeDomain", "strokeCapability", "strokeElement", "fillDomain", "fillCapability"].map((key) => [key, Number(c(t[key as keyof typeof t] as string).toFixed(2))]))));
  });

  it("keeps ordered pairs ordered", () => {
    expect(t.stubMinPx).toBeLessThan(t.stubMaxPx);
    expect(t.restNumbersMin).toBeLessThanOrEqual(t.restNumbersMax);
    expect(t.discMinPx).toBeLessThan(t.discMaxPx);
    expect(t.chipMinPx).toBeLessThan(t.chipMaxPx);
    expect(t.hubMinPx).toBeLessThan(t.hubMaxPx);
  });

  it("keeps ratios in range", () => {
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

  it("sets every map name kind on the locked type ramp at the shipped label scale", () => {
    const ramp = ["caption", "label", "body", "body-lg", "title", "display", "hero"].map((step) => Number(new RegExp(`--text-${step}:\\s*([\\d.]+)rem`).exec(css)?.[1]) * 16);
    expect(ramp).toEqual([9.5, 11, 12.5, 14, 16, 23, 30]);
    for (const kind of ["project", "domain", "capability", "element"] as const) {
      expect(ramp, `${kind} at --map-dial-label-scale ${t.labelScale}`).toContain(scaledLabelFontSize(kind, t.labelScale));
    }
  });

  it("keeps the floors", () => {
    expect(rest(1)).toBeGreaterThanOrEqual(1);
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
    expect(scaledLabelFontSize("domain", t.labelScale)).toBeGreaterThanOrEqual(11);
  });
});
