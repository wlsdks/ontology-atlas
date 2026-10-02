import { describe, expect, it } from "vitest";
import { scaledLabelFontSize } from "../render/labels";
import { createMeasureText, dialOverviewPad } from "./fit";
import type { DialCluster, DialLabels, DialModel, DialScene, DialTokens } from "./types";

const TOKENS = { nameMaxPx: 160, chipMaxPx: 17, labelScale: 1.1 } as DialTokens;
const LABELS: DialLabels = {
  units: (c, e) => `${c} caps · ${e} els`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} loose`,
  more: (n) => `+${n} more`,
  ring: (min, max) => (max === null ? `${min}+` : `${min}–${max}`),
  reading: (r, t) => `${r}/${t}`,
  settling: () => "settling",
  linksShown: (s, t) => `${s} of ${t}`,
};
const measure = (text: string) => text.length * 6;
const CLEARANCE = 17 + 5;
const LINE_GAP = scaledLabelFontSize("domain", 1.1) * 1.25;

function fixture(names: string[], radii: number[] = names.map(() => 300), orphans: { ids: string[]; x: number; y: number } | null = null) {
  const clusters: DialCluster[] = names.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
    const r = radii[i]!;
    return { domainId: `d${i}`, step: 0, angle, chip: { x: Math.cos(angle) * r, y: Math.sin(angle) * r }, footprint: 40, items: [] };
  });
  const xs = clusters.flatMap((c) => [c.chip.x - 40, c.chip.x + 40]);
  const ys = clusters.flatMap((c) => [c.chip.y - 40, c.chip.y + 40]);
  if (orphans) {
    xs.push(orphans.x - 20, orphans.x + 20);
    ys.push(orphans.y - 20, orphans.y + 20);
  }
  const domains = names.map((label, i) => ({ id: `d${i}`, label, capabilityIds: ["a"], directElementIds: [], elementCount: 12 }));
  const model = { domainById: new Map(domains.map((d) => [d.id, d])) } as unknown as DialModel;
  const scene = {
    clusters,
    orphans: { ids: orphans ? ["x"] : [], centre: { x: orphans?.x ?? 0, y: orphans?.y ?? 0 }, pitch: 5, radius: 20 },
    extent: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  } as unknown as DialScene;
  return { model, scene };
}

describe("dialOverviewPad", () => {
  it("takes the widest label block per side from the cluster bounds on the extent", () => {
    const { model, scene } = fixture(["Top", "Right side", "Bottom", "Left"]);
    const pad = dialOverviewPad(scene, model, LABELS, measure, TOKENS);
    const units = "1 caps · 12 els".length * 6;
    expect(pad.right).toBeCloseTo(Math.max(units, "Right side".length * 6) + CLEARANCE);
    expect(pad.left).toBeCloseTo(Math.max(units, "Left".length * 6) + CLEARANCE);
    expect(pad.top).toBeCloseTo(LINE_GAP * 2 + CLEARANCE);
    expect(pad.bottom).toBeCloseTo(LINE_GAP * 2 + CLEARANCE);
  });

  it("measures the widest of several blocks on one side", () => {
    const { model, scene } = fixture(["Top", "A much longer domain name here", "Bottom", "L"]);
    const pad = dialOverviewPad(scene, model, null, measure, TOKENS);
    expect(pad.right).toBeCloseTo("A much longer domain name".length * 6 + CLEARANCE);
  });

  it("ignores a name whose cluster stands inside the extent", () => {
    const { model, scene } = fixture(["Top", "A very wide inner name", "Bottom", "L", "Outer"], [300, 120, 300, 300, 300]);
    const pad = dialOverviewPad(scene, model, null, measure, TOKENS);
    expect(pad.right).toBeLessThan("A very wide inner name".length * 6);
  });

  it("leaves units out of the pads without labels", () => {
    const { model, scene } = fixture(["Top", "R", "Bottom", "L"]);
    const pad = dialOverviewPad(scene, model, null, measure, TOKENS);
    expect(pad.right).toBeCloseTo(6 + CLEARANCE);
    expect(pad.top).toBeCloseTo(LINE_GAP + CLEARANCE);
  });

  it("adds the orphan caption on the side its cluster reaches", () => {
    const base = fixture(["Top", "R", "Bottom", "L"]);
    const withOrphans = fixture(["Top", "R", "Bottom", "L"], undefined, { ids: ["x"], x: 400, y: 0 });
    const a = dialOverviewPad(base.scene, base.model, LABELS, measure, TOKENS);
    const b = dialOverviewPad(withOrphans.scene, withOrphans.model, LABELS, measure, TOKENS);
    expect(b.right).toBeCloseTo("1 loose".length * 6 + 8);
    expect(b.left).toBe(a.left);
  });
});

describe("createMeasureText", () => {
  it("memoises by font and text", () => {
    const m = createMeasureText();
    const w = m("hello", "600 12px sans-serif");
    expect(w).toBeGreaterThan(0);
    expect(m("hello", "600 12px sans-serif")).toBe(w);
  });
});
