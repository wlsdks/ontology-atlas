import { describe, expect, it } from "vitest";
import { scaledLabelFontSize } from "../render/labels";
import { createMeasureText, dialOverviewPad } from "./fit";
import type { DialLabels, DialModel, DialScene, DialSector, DialTokens } from "./types";

const TOKENS = { nameMaxPx: 160, chipMaxPx: 22 } as DialTokens;
const LABELS: DialLabels = {
  units: (c, e) => `${c} caps · ${e} els`,
  stale: (n) => `${n} stale`,
  orphans: (n) => `${n} loose`,
  more: (n) => `+${n} more`,
};
const measure = (text: string) => text.length * 6;
const CLEARANCE = 22 + 10;

function fixture(names: string[], orphans: string[] = []) {
  const sectors: DialSector[] = names.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
    return { domainId: `d${i}`, angle, start: angle, end: angle, chip: { x: 0, y: 0 }, rows: 1, petals: [] };
  });
  const domains = names.map((label, i) => ({ id: `d${i}`, label, capabilityIds: ["a"], directElementIds: [], elementCount: 12 }));
  const model = { domainById: new Map(domains.map((d) => [d.id, d])) } as unknown as DialModel;
  const scene = { sectors, orphans } as unknown as DialScene;
  return { model, scene };
}

describe("dialOverviewPad", () => {
  it("takes the widest label block per side", () => {
    const { model, scene } = fixture(["Top", "Right side", "Bottom", "Left"]);
    const pad = dialOverviewPad(scene, model, LABELS, measure, TOKENS);
    const units = "1 caps · 12 els".length * 6;
    const lineGap = scaledLabelFontSize("domain", 1) * 1.25;
    expect(pad.right).toBeCloseTo(Math.max(units, "Right side".length * 6) + CLEARANCE);
    expect(pad.left).toBeCloseTo(Math.max(units, "Left".length * 6) + CLEARANCE);
    expect(pad.top).toBeCloseTo(lineGap * 2 + CLEARANCE);
    expect(pad.bottom).toBeCloseTo(lineGap * 2 + CLEARANCE);
  });

  it("measures the widest of several blocks on one side", () => {
    const { model, scene } = fixture(["A", "Short", "A much longer domain name here", "B", "C", "Mid", "D", "E"]);
    const pad = dialOverviewPad(scene, model, null, measure, TOKENS);
    expect(pad.right).toBeCloseTo("A much longer domain name".length * 6 + CLEARANCE);
  });

  it("leaves units out of the pads without labels", () => {
    const { model, scene } = fixture(["Top", "R", "Bottom", "L"]);
    const pad = dialOverviewPad(scene, model, null, measure, TOKENS);
    expect(pad.right).toBeCloseTo(6 + CLEARANCE);
    expect(pad.top).toBeCloseTo(scaledLabelFontSize("domain", 1) * 1.25 + CLEARANCE);
  });

  it("adds the orphan caption to the bottom", () => {
    const base = fixture(["Top", "R", "Bottom", "L"]);
    const withOrphans = fixture(["Top", "R", "Bottom", "L"], ["x"]);
    const a = dialOverviewPad(base.scene, base.model, LABELS, measure, TOKENS);
    const b = dialOverviewPad(withOrphans.scene, withOrphans.model, LABELS, measure, TOKENS);
    expect(b.bottom).toBeGreaterThan(a.bottom);
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
