import { describe, expect, it } from "vitest";
import {
  getOntologyKindTone,
  ONTOLOGY_KIND_TONE,
  ONTOLOGY_VISUAL_KINDS,
} from "./tone";

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = parseRgba(a);
  const [br, bg, bb] = parseRgba(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function parseRgba(value: string): [number, number, number] {
  const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),/);
  if (!match) throw new Error(`Cannot parse rgba color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function rgbaAlpha(value: string): number {
  const match = value.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/);
  if (!match) throw new Error(`Cannot parse rgba alpha: ${value}`);
  return Number(match[1]);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const left = relativeLuminance(parseRgba(a));
  const right = relativeLuminance(parseRgba(b));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("ontology kind visual tone contract", () => {
  it("keeps one named qualitative hue for each visible ontology kind", () => {
    expect(ONTOLOGY_VISUAL_KINDS).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "unknown",
    ]);
    expect(ONTOLOGY_KIND_TONE.project.hueName).toBe("magenta");
    expect(ONTOLOGY_KIND_TONE.domain.hueName).toBe("cyan");
    expect(ONTOLOGY_KIND_TONE.capability.hueName).toBe("yellow");
    expect(ONTOLOGY_KIND_TONE.element.hueName).toBe("green");
    expect(ONTOLOGY_KIND_TONE.unknown.hueName).toBe("orange");
  });

  it("keeps categorical fills far enough apart for graph scanning", () => {
    for (let i = 0; i < ONTOLOGY_VISUAL_KINDS.length; i += 1) {
      for (let j = i + 1; j < ONTOLOGY_VISUAL_KINDS.length; j += 1) {
        const left = getOntologyKindTone(ONTOLOGY_VISUAL_KINDS[i]).fill;
        const right = getOntologyKindTone(ONTOLOGY_VISUAL_KINDS[j]).fill;
        expect(rgbDistance(left, right)).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it("keeps every graph fill visible against the dark topology canvas", () => {
    const darkCanvas = "rgba(8, 9, 10, 1)";
    for (const kind of ONTOLOGY_VISUAL_KINDS) {
      expect(contrastRatio(getOntologyKindTone(kind).fill, darkCanvas)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps chips saturated enough for small tree and builder controls", () => {
    for (const kind of ONTOLOGY_VISUAL_KINDS) {
      const tone = getOntologyKindTone(kind);
      expect(rgbaAlpha(tone.chipBg)).toBeGreaterThanOrEqual(0.24);
      expect(rgbaAlpha(tone.chipBorder)).toBeGreaterThanOrEqual(0.72);
    }
  });

  it("falls back to unknown so unclassified nodes are visibly review-needed", () => {
    expect(getOntologyKindTone("document")).toBe(ONTOLOGY_KIND_TONE.unknown);
    expect(getOntologyKindTone("legacy-kind")).toBe(ONTOLOGY_KIND_TONE.unknown);
    expect(getOntologyKindTone(null)).toBe(ONTOLOGY_KIND_TONE.unknown);
  });
});
