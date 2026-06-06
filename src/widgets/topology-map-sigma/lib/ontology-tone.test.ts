import { describe, expect, it } from "vitest";
import {
  ontologyFillTone,
  ontologyBorderTone,
  ONTOLOGY_BORDER_WIDTH,
  TOPOLOGY_ONTOLOGY_KINDS,
} from "./ontology-tone";

const KINDS = TOPOLOGY_ONTOLOGY_KINDS;

function rgbDistance(a: string, b: string): number {
  const parse = (value: string) => {
    const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),/);
    if (!match) throw new Error(`Cannot parse rgba color: ${value}`);
    return match.slice(1, 4).map(Number);
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function rgbaAlpha(value: string): number {
  const match = value.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/);
  if (!match) throw new Error(`Cannot parse rgba alpha: ${value}`);
  return Number(match[1]);
}

describe("ontologyBorderTone", () => {
  it("returns null for ontology-empty projects (호출자 fallback)", () => {
    expect(ontologyBorderTone(null)).toBeNull();
  });

  it("returns indigo border for project scope", () => {
    const tone = ontologyBorderTone("project");
    expect(tone?.borderColor).toBe("rgba(126, 134, 216, 0.88)");
    expect(tone?.borderWidth).toBe(ONTOLOGY_BORDER_WIDTH);
  });

  it("returns teal border for domain dominant", () => {
    const tone = ontologyBorderTone("domain");
    expect(tone?.borderColor).toBe("rgba(74, 177, 196, 0.88)");
    expect(tone?.borderWidth).toBe(ONTOLOGY_BORDER_WIDTH);
  });

  it("returns amber border for capability dominant", () => {
    const tone = ontologyBorderTone("capability");
    expect(tone?.borderColor).toBe("rgba(211, 159, 73, 0.88)");
  });

  it("returns sage border for element dominant", () => {
    const tone = ontologyBorderTone("element");
    expect(tone?.borderColor).toBe("rgba(105, 177, 121, 0.88)");
  });

  it("returns brick border for unknown (stub 검수 신호)", () => {
    const tone = ontologyBorderTone("unknown");
    expect(tone?.borderColor).toBe("rgba(196, 92, 92, 0.88)");
  });

  it("returns distinct fill tones for the visible topology legend", () => {
    const fills = KINDS.map((k) => ontologyFillTone(k));
    expect(new Set(fills).size).toBe(5);
    expect(ontologyFillTone("project")).toBe("rgba(126, 134, 216, 0.94)");
    expect(ontologyFillTone("domain")).toBe("rgba(74, 177, 196, 0.94)");
    expect(ontologyFillTone("capability")).toBe("rgba(211, 159, 73, 0.94)");
    expect(ontologyFillTone("element")).toBe("rgba(105, 177, 121, 0.94)");
    expect(ontologyFillTone("unknown")).toBe("rgba(196, 92, 92, 0.94)");
  });

  it("keeps every visible kind color far enough apart for quick graph scanning", () => {
    for (let i = 0; i < KINDS.length; i += 1) {
      for (let j = i + 1; j < KINDS.length; j += 1) {
        const left = ontologyFillTone(KINDS[i]);
        const right = ontologyFillTone(KINDS[j]);
        expect(rgbDistance(left, right)).toBeGreaterThanOrEqual(70);
      }
    }
  });

  it("uses enough fill opacity for topology while avoiding neon-heavy tones", () => {
    for (const kind of KINDS) {
      expect(rgbaAlpha(ontologyFillTone(kind))).toBeGreaterThanOrEqual(0.9);
      expect(rgbaAlpha(ontologyFillTone(kind))).toBeLessThanOrEqual(0.94);
    }
  });

  it("uses single width for all kinds (size 변동 최소 정책)", () => {
    const widths = KINDS.map((k) => ontologyBorderTone(k)?.borderWidth);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(ONTOLOGY_BORDER_WIDTH);
  });
});
