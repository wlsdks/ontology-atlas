import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bodyPoints } from "@/widgets/ontology-map/render/node-shapes";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";

/**
 * The kind to silhouette mapping is kept independently by the canvas (`render/node-shapes.ts`) and
 * DOM (`shared/ui/map-kind-glyph.tsx`) facades, and no single-file test or lint sees both. The file is
 * `.test.ts` with `createElement` because the vitest glob for `tests/contract/**` excludes `.tsx`.
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
  const { container, unmount } = render(createElement(OntologyMapKindGlyph, { kind }));
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
