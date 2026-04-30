import { describe, expect, it } from "vitest";
import {
  ontologyBorderTone,
  ONTOLOGY_BORDER_WIDTH,
} from "./ontology-tone";

describe("ontologyBorderTone", () => {
  it("returns null for ontology-empty projects (호출자 fallback)", () => {
    expect(ontologyBorderTone(null)).toBeNull();
  });

  it("returns blue-gray border for domain dominant", () => {
    const tone = ontologyBorderTone("domain");
    expect(tone?.borderColor).toBe("rgba(186, 194, 206, 0.95)");
    expect(tone?.borderWidth).toBe(ONTOLOGY_BORDER_WIDTH);
  });

  it("returns indigo border (alpha 낮음) for capability dominant", () => {
    const tone = ontologyBorderTone("capability");
    expect(tone?.borderColor).toBe("rgba(94, 106, 210, 0.75)");
  });

  it("returns teal-gray border for element dominant", () => {
    const tone = ontologyBorderTone("element");
    expect(tone?.borderColor).toBe("rgba(176, 190, 190, 0.95)");
  });

  it("returns amber border for unknown (stub 검수 신호)", () => {
    const tone = ontologyBorderTone("unknown");
    expect(tone?.borderColor).toBe("rgba(255, 179, 71, 0.95)");
  });

  it("uses single width for all kinds (size 변동 최소 정책)", () => {
    const widths = (["domain", "capability", "element", "unknown"] as const).map(
      (k) => ontologyBorderTone(k)?.borderWidth,
    );
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(ONTOLOGY_BORDER_WIDTH);
  });
});
