import { describe, it } from "vitest";

/**
 * `render/labels.ts#draw` is pure Canvas 2D text painting with no extractable
 * geometric invariant (unlike node-shapes/traces) — its correctness is a
 * visual contrast/legibility question the design doc explicitly defers to
 * Design Guardian screenshot review (§2.2: "라이트 대비는 P3 게이트에서
 * 스크린샷 필수"), not a unit-testable formula. Marked `test.todo` per this
 * scaffold's instruction rather than fabricating a canvas-mock assertion
 * that would not actually catch a legibility regression.
 */
describe("render/labels draw()", () => {
  it.todo(
    "domain label alpha ramps with farT and capability/element labels stay zoom-gated even while focused (prototype drawLabel()) — needs a canvas-mock harness, deferred to P3/P4 implementation + Design Guardian screenshot gate",
  );
  it.todo(
    "light-mode label color contrast (labelDomain/labelCapability/labelElement tokens) — design doc §2.2 explicitly defers exact light values to a P3 Design Guardian pass",
  );
});
