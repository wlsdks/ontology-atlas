import { describe, expect, it } from "vitest";

import { computeLabelAlpha } from "./labels";

/**
 * `render/labels.ts#draw`'s canvas text painting has no extractable
 * geometric invariant beyond the alpha formula below — its visual contrast/
 * legibility (light mode in particular) is a Design Guardian screenshot-review
 * question the design doc explicitly defers (§2.2: "라이트 대비는 P3 게이트에서
 * 스크린샷 필수"), left as `test.todo`.
 */
describe("computeLabelAlpha", () => {
  it("project is always fully visible, regardless of altitude", () => {
    expect(computeLabelAlpha("project", 0, 1, "normal")).toBe(1);
    expect(computeLabelAlpha("project", 1, 1, "normal")).toBe(1);
  });

  it("domain alpha ramps 1:1 with farT (sky-chart label arrives with altitude)", () => {
    expect(computeLabelAlpha("domain", 0, 1, "normal")).toBe(0);
    expect(computeLabelAlpha("domain", 0.5, 1, "normal")).toBe(0.5);
    expect(computeLabelAlpha("domain", 1, 1, "normal")).toBe(1);
  });

  it("capability fades out toward far field and requires close zoom", () => {
    expect(computeLabelAlpha("capability", 0, 0.5, "normal")).toBe(0); // below the 0.75 zoom gate
    expect(computeLabelAlpha("capability", 0, 1.02, "normal")).toBeCloseTo(1, 6);
    expect(computeLabelAlpha("capability", 1, 1.02, "normal")).toBe(0); // farT=1 kills it regardless of zoom
  });

  it("element requires the deepest zoom gate (1.55-1.95), stricter than capability", () => {
    expect(computeLabelAlpha("element", 0, 1.02, "normal")).toBe(0);
    expect(computeLabelAlpha("element", 0, 1.95, "normal")).toBeCloseTo(1, 6);
  });

  it("is 0 whenever the node is dim, regardless of kind/farT/zoom", () => {
    expect(computeLabelAlpha("project", 0, 1, "dim")).toBe(0);
    expect(computeLabelAlpha("domain", 1, 1, "dim")).toBe(0);
  });

  it("floors domain alpha to fully visible when focused or a focus neighbor, once far enough along (farT>0.5)", () => {
    expect(computeLabelAlpha("domain", 0.6, 1, "center")).toBe(1);
    expect(computeLabelAlpha("domain", 0.6, 1, "neighbor")).toBe(1);
  });

  it("does NOT floor domain alpha while focused if farT<=0.5 (floor only kicks in past the halfway altitude)", () => {
    expect(computeLabelAlpha("domain", 0.3, 1, "center")).toBeCloseTo(0.3, 6);
  });

  it("capability/element labels stay zoom-gated even while focused — the floor explicitly excludes them", () => {
    expect(computeLabelAlpha("capability", 0.6, 0.5, "center")).toBe(0);
    expect(computeLabelAlpha("element", 0.6, 0.5, "neighbor")).toBe(0);
  });

  it.todo(
    "light-mode label color contrast (labelDomain/labelCapability/labelElement tokens) — design doc §2.2 explicitly defers exact light values to a P3 Design Guardian pass",
  );
});
