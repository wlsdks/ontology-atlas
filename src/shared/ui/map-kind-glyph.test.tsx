import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OntologyMapKindGlyph } from "./map-kind-glyph";
import type { GlyphSet } from "@/shared/lib/appearance-preferences";

const KINDS = ["project", "domain", "capability", "element"] as const;

/** The silhouette element each kind renders — must be identical across sets. */
function silhouetteTag(container: HTMLElement): string {
  const svg = container.querySelector("svg");
  // first shape child (polygon / rect / circle) is the silhouette
  const shape = svg?.querySelector("polygon, rect, circle");
  return shape?.tagName.toLowerCase() ?? "";
}

function silhouetteGeometry(container: HTMLElement): string {
  const svg = container.querySelector("svg");
  const shape = svg?.querySelector("polygon, rect, circle");
  if (!shape) return "";
  // capture the geometry-defining attributes only (never fill/stroke)
  return ["points", "x", "y", "width", "height", "rx", "cx", "cy", "r"]
    .map((attr) => `${attr}=${shape.getAttribute(attr) ?? ""}`)
    .join("|");
}

describe("OntologyMapKindGlyph — silhouette invariance across sets (#21 hard rule)", () => {
  it("maps each kind to the SAME silhouette tag + geometry in both geometric and line sets", () => {
    for (const kind of KINDS) {
      const geo = render(<OntologyMapKindGlyph kind={kind} glyphSet="geometric" />);
      const line = render(<OntologyMapKindGlyph kind={kind} glyphSet="line" />);
      expect(silhouetteTag(line.container)).toBe(silhouetteTag(geo.container));
      expect(silhouetteGeometry(line.container)).toBe(silhouetteGeometry(geo.container));
      geo.unmount();
      line.unmount();
    }
  });

  it("changes only the RENDER style: line set is stroke-only (fill none), geometric fills", () => {
    for (const kind of KINDS) {
      const geo = render(<OntologyMapKindGlyph kind={kind} glyphSet="geometric" />);
      const line = render(<OntologyMapKindGlyph kind={kind} glyphSet="line" />);
      const geoShape = geo.container.querySelector("polygon, rect, circle")!;
      const lineShape = line.container.querySelector("polygon, rect, circle")!;
      expect(lineShape.getAttribute("fill")).toBe("none");
      expect(geoShape.getAttribute("fill")).not.toBe("none");
      geo.unmount();
      line.unmount();
    }
  });

  it("stamps the active set on the svg for both surfaces to read", () => {
    for (const set of ["geometric", "line"] as GlyphSet[]) {
      const { container, unmount } = render(<OntologyMapKindGlyph kind="capability" glyphSet={set} />);
      expect(container.querySelector("svg")?.getAttribute("data-glyph-set")).toBe(set);
      unmount();
    }
  });

  it("draws a page, never another kind's silhouette, for a kind the map does not draw", () => {
    // The vault README (`vault-readme`) used to wear the element's square and via-hole on the Git
    // step chips, and "Document" looked exactly like "Element" in the new-document kind picker.
    const element = render(<OntologyMapKindGlyph kind="element" glyphSet="geometric" />);
    const elementShape = element.container.querySelector("svg")?.innerHTML;
    element.unmount();
    for (const kind of ["document", "vault-readme", "not-a-kind", ""]) {
      for (const set of ["geometric", "line"] as GlyphSet[]) {
        const { container, unmount } = render(<OntologyMapKindGlyph kind={kind} glyphSet={set} size={12} />);
        const svg = container.querySelector("svg")!;
        expect(svg.getAttribute("data-kind-glyph")).toBe("document");
        expect(svg.getAttribute("data-glyph-set")).toBe(set);
        // No silhouette of the four map kinds (hex, chip, circle, via-pad) is drawn.
        expect(svg.querySelector("polygon, rect, circle")).toBeNull();
        expect(svg.innerHTML).not.toBe(elementShape);
        expect(svg.getAttribute("width")).toBe("12");
        unmount();
      }
    }
  });
});
