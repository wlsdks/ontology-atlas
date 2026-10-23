import { describe, expect, it } from "vitest";
import { emptyDialFrameMarks, type DialMarksInput } from "../frame/marks";
import { overlaps } from "../label-marks";
import type { Box, DialRowPick, GlyphMark, TextMark } from "../types";
import { settleBranchNames } from "./name-occupancy";

const glyph = (id: string, x: number, y: number, r = 12): GlyphMark => ({ id, kind: "capability", x, y, r, egoState: "center", fill: "#101014", stroke: "#f4f4f8", hovered: false, agentFocus: false, selectionPulse: null, count: null, stalePip: false });
function setup(role: TextMark["role"] = "capability") {
  const input = {
    focusedNodeId: "active", attention: { capabilityId: "active", domainId: null, needsCaps: new Set(), usedByCaps: new Set(), relatesCaps: new Set() },
    viewportWidth: 1440, viewportHeight: 1000, freeRect: { minX: 320, minY: 100, maxX: 1000, maxY: 900 },
    tokens: { chipMinPx: 8 },
  } as unknown as DialMarksInput;
  const out = emptyDialFrameMarks();
  const text: TextMark = { id: "active", role, text: "Selected concept name", x: 1000, y: 400, align: "left", font: "14px sans-serif", ink: 0, box: { minX: 998, maxX: 1182, minY: 390, maxY: 410 }, parts: null };
  out.texts.push(text);
  const rows: DialRowPick[] = [{ id: "active", box: text.box }];
  const names = new Map<string, Box>();
  const settle = () => settleBranchNames(input, out, names, rows);
  return { input, out, text, rows, names, settle };
}

describe("branch name placement near occupied geometry", () => {
  it("flips a required label away from its own selected circle beside the right inspector", () => {
    const test = setup();
    test.out.glyphs.push(glyph("active", 980, 400));
    test.settle();
    expect(test.text.box.maxX).toBeLessThanOrEqual(980 - 12 - 8 - 8);
    expect(test.text.box.minX).toBeGreaterThanOrEqual(test.input.freeRect.minX);
    expect(test.text.y).toBe(400);
    expect(test.names.get("active")).toEqual(test.text.box);
    expect(test.rows.find((row) => row.id === "active")?.box).toEqual(test.text.box);
  });

  for (const relation of ["needsCaps", "usedByCaps", "relatesCaps"] as const) {
    it(`${relation}: keeps an attended cross-domain partner named inside the free canvas`, () => {
      const test = setup();
      test.input.focusedNodeId = "selected";
      test.input.attention.capabilityId = "selected";
      test.input.attention[relation] = new Set(["active"]);
      test.out.discs.push({ id: "active", x: 980, y: 400, r: 12, fill: 0, rim: 0, dashed: false, lineWidth: 1 });
      test.out.squares.push({ id: "implementation", x: 880, y: 400, half: 3, fill: 0, rim: 0 });
      test.settle();
      expect(test.out.texts).toContain(test.text);
      expect(test.text.box.minX).toBeGreaterThanOrEqual(test.input.freeRect.minX);
      expect(test.text.box.maxX).toBeLessThanOrEqual(test.input.freeRect.maxX);
      expect(overlaps(test.text.box, { minX: 968, maxX: 992, minY: 388, maxY: 412 })).toBe(false);
      expect(overlaps(test.text.box, { minX: 877, maxX: 883, minY: 397, maxY: 403 })).toBe(false);
      expect(test.rows.find((row) => row.id === "active")?.box).toBe(test.text.box);
    });
  }

  for (const promotion of ["partner", "comparison"] as const) {
    it(`${promotion}: withholds a promoted name when every placement intersects an unrelated card`, () => {
      const test = setup();
      test.input.focusedNodeId = "selected";
      test.input.attention.capabilityId = "selected";
      if (promotion === "partner") test.input.attention.needsCaps = new Set(["active"]);
      else test.input.requiredBranchIds = new Set(["active"]);
      const disc = { id: "active", x: 980, y: 400, r: 12, fill: 0, rim: 0, dashed: false, lineWidth: 1 };
      test.out.discs.push(disc);
      test.out.blocks = [{ id: "unrelated", box: { ...test.input.freeRect }, fill: 0, rim: 0, alpha: 1 }];
      test.settle();
      expect(test.out.texts).not.toContain(test.text);
      expect(test.names.has("active")).toBe(false);
      expect(test.rows.some((row) => row.id === "active")).toBe(false);
      expect(test.out.discs).toContain(disc);
    });
  }

  it("uses a vertical leader when another disc blocks the clear horizontal anchor", () => {
    const test = setup();
    test.out.glyphs.push(glyph("active", 980, 400));
    test.out.discs.push({ id: "neighbor", x: 880, y: 400, r: 18, fill: 0, rim: 0, dashed: false, lineWidth: 1 });
    test.settle();
    const circle = { minX: 960, maxX: 1000, minY: 380, maxY: 420 };
    const disc = { minX: 862, maxX: 898, minY: 382, maxY: 418 };
    expect(overlaps(test.text.box, circle)).toBe(false);
    expect(overlaps(test.text.box, disc)).toBe(false);
    expect(test.text.y).not.toBe(400);
    expect(test.out.leaders).toContainEqual(expect.objectContaining({ id: "active" }));
    expect(test.rows.find((row) => row.id === "active")?.box).toEqual(test.text.box);
  });

  it("avoids its own element square after bounds clamping", () => {
    const test = setup("element");
    test.out.squares.push({ id: "active", x: 980, y: 400, half: 4, fill: 0, rim: 0 });
    test.settle();
    expect(overlaps(test.text.box, { minX: 976, maxX: 984, minY: 396, maxY: 404 })).toBe(false);
  });

  it("relocates a resting domain name obstructed by its glyph without dropping its orientation", () => {
    const test = setup("domain");
    test.input.focusedNodeId = null;
    test.input.attention.capabilityId = null;
    test.text.x = 820;
    test.text.box = { minX: 818, maxX: 1000, minY: 390, maxY: 410 };
    test.rows[0]!.box = test.text.box;
    test.out.glyphs.push({ ...glyph("active", 980, 400), egoState: "normal" });
    test.settle();
    expect(test.text.box.maxX).toBeLessThanOrEqual(980 - 12 - 8);
    expect(test.out.texts).toContain(test.text);
    expect(test.rows.find((row) => row.id === "active")?.box).toEqual(test.text.box);
  });

  it("keeps capability names outside cards even when their ids match", () => {
    const test = setup();
    test.text.x = 400;
    test.text.y = 280;
    test.text.box = { minX: 398, maxX: 582, minY: 270, maxY: 290 };
    const card = { minX: 350, maxX: 700, minY: 200, maxY: 400 };
    test.out.blocks = [{ id: "active", box: card, fill: 0, rim: 0, alpha: 1 }];
    test.settle();
    expect(overlaps(test.text.box, card)).toBe(false);
    expect(test.out.texts).toContain(test.text);
  });

  for (const role of ["domain", "project"] as const) {
    it(`${role}: keeps a name inside its own card while avoiding its own marker and a foreign card`, () => {
      const test = setup(role);
      test.text.x = 400;
      test.text.y = 280;
      test.text.box = { minX: 398, maxX: 582, minY: 270, maxY: 290 };
      test.rows[0]!.box = test.text.box;
      test.out.glyphs.push(glyph("active", 330, 280));
      const own = { minX: 300, maxX: 700, minY: 200, maxY: 400 };
      test.out.blocks = [{ id: "active", box: own, fill: 0, rim: 0, alpha: 1 }];
      test.settle();
      expect(test.text.box).toEqual({ minX: 398, maxX: 582, minY: 270, maxY: 290 });
      const foreign = { minX: 390, maxX: 600, minY: 260, maxY: 300 };
      test.out.blocks.push({ id: "other", box: foreign, fill: 0, rim: 0, alpha: 1 });
      test.settle();
      expect(overlaps(test.text.box, foreign)).toBe(false);
      expect(test.text.box.minX).toBeGreaterThanOrEqual(test.input.freeRect.minX);
      expect(test.text.box.maxX).toBeLessThanOrEqual(test.input.freeRect.maxX);
      expect(test.out.texts).toContain(test.text);
    });
  }
  it("removes auxiliary labels and action picks that lie outside the free canvas", () => {
    const test = setup();
    for (const role of ["units", "more", "status"] as const) {
      const auxiliary = { ...test.text, role, box: { minX: 990, maxX: 1100, minY: 100, maxY: 120 } };
      test.out.texts.push(auxiliary);
      if (role === "more") test.rows.push({ id: "active", box: auxiliary.box, action: { type: "branch-members", domainId: "active", direction: "more" } });
    }
    test.settle();
    expect(test.out.texts.some((text) => text.role === "units" || text.role === "more" || text.role === "status")).toBe(false);
    expect(test.rows.some((row) => row.action)).toBe(false);
    expect(test.names.has("active")).toBe(true);
  });

  it("relocates a focused branch member name around nearby implementation squares", () => {
    const test = setup();
    test.input.attention = { ...test.input.attention, domainId: "domain", capabilityId: null };
    test.input.focusedNodeId = "domain";
    test.input.model = { capabilityById: new Map([["active", { domainId: "domain" }]]) } as unknown as DialMarksInput["model"];
    test.text.x = 650;
    test.text.box = { minX: 648, maxX: 832, minY: 390, maxY: 410 };
    test.rows[0]!.box = test.text.box;
    test.out.discs.push({ id: "active", x: 850, y: 400, r: 10, fill: 0, rim: 0, dashed: false, lineWidth: 1 });
    test.out.squares.push({ id: "implementation", x: 820, y: 400, half: 3, fill: 0, rim: 0 });
    test.settle();
    expect(test.out.texts).toContain(test.text);
    expect(overlaps(test.text.box, { minX: 817, maxX: 823, minY: 397, maxY: 403 })).toBe(false);
    expect(test.rows.find((row) => row.id === "active")?.box).toEqual(test.text.box);
    expect(test.out.leaders.some((leader) => leader.id === "active")).toBe(true);
  });

  it("reserves and relocates a focused branch Collapse control instead of dropping its target", () => {
    const test = setup("domain");
    test.input.attention = { ...test.input.attention, domainId: "active", capabilityId: null };
    test.text.x = 520;
    test.text.box = { minX: 518, maxX: 702, minY: 390, maxY: 410 };
    test.rows[0]!.box = test.text.box;
    const control: TextMark = { ...test.text, role: "more", text: "Collapse", box: { ...test.text.box } };
    const action: DialRowPick = { id: "active", box: control.box, action: { type: "branch-members", domainId: "active", direction: "less" } };
    test.out.texts.push(control);
    test.rows.push(action);
    test.settle();
    expect(test.out.texts).toContain(control);
    expect(overlaps(test.text.box, control.box)).toBe(false);
    expect(test.rows).toContain(action);
    expect(action.box).toBe(control.box);
    expect(test.names.get("active")).toBe(test.text.box);
    expect(test.out.leaders.some((leader) => leader.id === "active")).toBe(true);
  });

  it("keeps compact domain names on the member side while retaining names inside full cards", () => {
    for (const alpha of [0.3, 1]) {
      const test = setup("domain");
      test.input.scene = { clusterByDomain: new Map([["active", { branchSide: -1 }]]) } as unknown as DialMarksInput["scene"];
      test.text.x = 726;
      test.text.box = { minX: 724, maxX: 908, minY: 390, maxY: 410 };
      test.rows[0]!.box = test.text.box;
      test.out.glyphs.push({ ...glyph("active", 700, 400), egoState: "normal" });
      test.out.blocks = [{ id: "active", box: { minX: 400, maxX: 1000, minY: 350, maxY: 500 }, fill: 0, rim: 0, alpha }];
      test.settle();
      if (alpha < 0.5) expect(test.text.box.maxX).toBeLessThanOrEqual(700 - 12 - 8);
      else expect(test.text.box).toEqual({ minX: 724, maxX: 908, minY: 390, maxY: 410 });
      expect(test.rows.find((row) => row.id === "active")?.box).toBe(test.text.box);
    }
  });

});
