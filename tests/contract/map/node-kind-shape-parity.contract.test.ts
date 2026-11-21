import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bodyPoints } from "@/widgets/ontology-map/render/node-shapes/silhouette";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";

/**
 * The kind to silhouette mapping is kept independently by the canvas (`render/node-shapes.ts`) and
 * DOM (`shared/ui/ontology-node/map-kind-glyph.tsx`) facades, and no single-file test or lint sees both. The file is
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

describe("kind to silhouette mapping: parity between the canvas gateway and the DOM gateway", () => {
  it.each(KINDS)("%s draws the same shape family in both gateways", (kind) => {
    expect(domShapeFamily(kind)).toBe(canvasShapeFamily(kind));
  });

  it("project=hex, domain/element=square, capability=circle, exactly as the documented invariant says", () => {
    expect(canvasShapeFamily("project")).toBe("hex6");
    expect(canvasShapeFamily("domain")).toBe("rect4");
    expect(canvasShapeFamily("capability")).toBe("circle");
    expect(canvasShapeFamily("element")).toBe("rect4");
  });
});
