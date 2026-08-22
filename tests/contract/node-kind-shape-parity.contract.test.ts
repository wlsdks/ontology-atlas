import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bodyPoints } from "@/widgets/topology-map-v2/render/node-shapes";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";

/**
 * Verifies the kind → silhouette mapping is identical across both render facades
 * (canvas and DOM).
 *
 * **Why a contract test.** The "node spec" section of `docs/DESIGN-SYSTEM.md`
 * records "project=hex · domain=square · capability=circle · element=square +
 * via-hole" as a **hard invariant**, and two facades — `render/node-shapes.ts`
 * (canvas) and `shared/ui/topology-v2-kind-glyph.tsx` (DOM) — each keep that rule
 * independently. But each file's own unit test (`node-shapes.test.ts`,
 * `topology-v2-kind-glyph.test.tsx`) checks consistency **within its own file
 * only**, so a kind mapping changed on one side is invisible to the other's test.
 * lint sees AST selectors within one file, so it cannot catch this divergence in
 * principle (the classification rule in .claude/rules/design.md: if the verdict
 * needs a value from another file, it is a contract test).
 *
 * Why `.test.ts` (using `createElement` rather than JSX): the vitest `include` glob
 * for `tests/contract/**` matches `.test.ts` and not `.tsx` (`vitest.config.ts`) —
 * rather than widening a shared glob for this one file, JSX is avoided and the
 * existing contracts stay untouched.
 *
 * Inventory before switching it on (2026-08-01): before this file there were zero
 * tests holding the two facades' mappings together — they agreed by coincidence,
 * not by contract.
 */

type ShapeFamily = "hex6" | "rect4" | "circle";

const KINDS = ["project", "domain", "capability", "element"] as const;

/** Canvas facade — classify the silhouette by the return shape of `bodyPoints`. */
function canvasShapeFamily(kind: (typeof KINDS)[number]): ShapeFamily {
  const points = bodyPoints(kind, 0, 0, 10);
  if (points === null) return "circle";
  if (points.length === 6) return "hex6";
  if (points.length === 4) return "rect4";
  throw new Error(`unexpected point count ${points.length} for kind=${kind}`);
}

/** DOM facade — classify by the rendered silhouette's SVG tag (element is a <rect> body + a via-hole <circle>). */
function domShapeFamily(kind: (typeof KINDS)[number]): ShapeFamily {
  const { container, unmount } = render(createElement(TopologyV2KindGlyph, { kind }));
  const svg = container.querySelector("svg")!;
  const tag = svg.querySelector("polygon, rect, circle")?.tagName.toLowerCase();
  unmount();
  if (tag === "polygon") return "hex6";
  if (tag === "rect") return "rect4";
  if (tag === "circle") return "circle";
  throw new Error(`no recognizable silhouette tag for kind=${kind}`);
}

describe("kind → 실루엣 매핑 — 캔버스 게이트웨이와 DOM 게이트웨이의 parity", () => {
  it.each(KINDS)("%s 는 두 게이트웨이에서 같은 도형 계열을 그린다", (kind) => {
    expect(domShapeFamily(kind)).toBe(canvasShapeFamily(kind));
  });

  it("project=hex · domain/element=사각 · capability=원 — 문서화된 불변 규칙 그대로", () => {
    expect(canvasShapeFamily("project")).toBe("hex6");
    expect(canvasShapeFamily("domain")).toBe("rect4");
    expect(canvasShapeFamily("capability")).toBe("circle");
    expect(canvasShapeFamily("element")).toBe("rect4");
  });
});
