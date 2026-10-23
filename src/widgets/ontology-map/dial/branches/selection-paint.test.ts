import { describe, expect, it } from "vitest";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { emptyDialFrameMarks } from "../frame/marks";
import { paintDialMarks } from "../frame/paint";

const map = { canvasBgNear: "#101014", selectionRingIndigo: "#8b8cff", selectionRingHairline: "#5a5cc0", nodeSheenTint: "#232329", nodeSheenBlend: 0 } as OntologyMapTokens;
function strokes(selectionInk?: string) {
  const colors: string[] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy(state, {
    get(target, key: string) {
      if (key === "stroke") return () => colors.push(String(target.strokeStyle));
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop: () => undefined });
      if (key === "getLineDash") return () => [];
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key: string, value) { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const marks = emptyDialFrameMarks();
  marks.glyphs.push({ id: "c", kind: "capability", x: 100, y: 100, r: 12, egoState: "center", stroke: "#777777", fill: "#101014", hovered: false, agentFocus: false, selectionPulse: null, count: null, stalePip: false, selectionInk });
  paintDialMarks(context, marks, map, { now: 0, reducedMotion: true, numeralHaloPx: 0 });
  return colors;
}

describe("branch static selection", () => {
  it("paints both static rings in neutral ink while preserving the shared selection palette", () => {
    expect(strokes("#f4f4f8").filter((color) => color === "#f4f4f8")).toHaveLength(2);
    expect(strokes("#f4f4f8")).not.toContain(map.selectionRingIndigo);
    expect(strokes()).toContain(map.selectionRingIndigo);
    expect(strokes()).toContain(map.selectionRingHairline);
  });
});
