import { describe, expect, it } from "vitest";
import {
  getOntologyKindTone,
  ONTOLOGY_KIND_TONE,
  ONTOLOGY_VISUAL_KINDS,
} from "./tone";

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

describe("ontology kind visual tone contract", () => {
  it("keeps one named qualitative hue for each visible ontology kind", () => {
    expect(ONTOLOGY_VISUAL_KINDS).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "unknown",
    ]);
    expect(ONTOLOGY_KIND_TONE.project.hueName).toBe("red");
    expect(ONTOLOGY_KIND_TONE.domain.hueName).toBe("blue");
    expect(ONTOLOGY_KIND_TONE.capability.hueName).toBe("amber");
    expect(ONTOLOGY_KIND_TONE.element.hueName).toBe("green");
    expect(ONTOLOGY_KIND_TONE.unknown.hueName).toBe("violet");
  });

  it("keeps categorical fills far enough apart for graph scanning", () => {
    for (let i = 0; i < ONTOLOGY_VISUAL_KINDS.length; i += 1) {
      for (let j = i + 1; j < ONTOLOGY_VISUAL_KINDS.length; j += 1) {
        const left = getOntologyKindTone(ONTOLOGY_VISUAL_KINDS[i]).fill;
        const right = getOntologyKindTone(ONTOLOGY_VISUAL_KINDS[j]).fill;
        expect(rgbDistance(left, right)).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it("falls back to unknown so unclassified nodes are visibly review-needed", () => {
    expect(getOntologyKindTone("document")).toBe(ONTOLOGY_KIND_TONE.unknown);
    expect(getOntologyKindTone("legacy-kind")).toBe(ONTOLOGY_KIND_TONE.unknown);
    expect(getOntologyKindTone(null)).toBe(ONTOLOGY_KIND_TONE.unknown);
  });
});
