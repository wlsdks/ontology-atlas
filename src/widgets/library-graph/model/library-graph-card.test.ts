import { describe, expect, it } from "vitest";

import type { LibraryGraphEdge } from "./build-library-graph";
import {
  libraryGraphFlowEdges,
  libraryGraphStaleEdges,
  placeLibraryGraphCard,
  LIBRARY_CARD_GAP,
  LIBRARY_CARD_INSET,
} from "./library-graph-card";

/**
 * **Two claims about a card beside a dot, settled without a browser.**
 *
 * The first is the one direction B names as its own falsifier — *a card covers its own
 * mark or the strip* — and it is geometry, so it is decided here rather than by looking at
 * a screenshot. The second is which lines the drift runs along, which is a fact about the
 * folder's citations and nothing else.
 */

const BOX = { width: 1000, height: 600 };
const CARD = { width: 320, height: 220 };

/** Whether the card's rectangle and the mark's own square share any area at all. */
function overlaps(
  placement: { left: number; top: number; maxHeight: number },
  mark: { x: number; y: number },
  radius: number,
  width = CARD.width,
): boolean {
  const card = {
    left: placement.left,
    right: placement.left + width,
    top: placement.top,
    bottom: placement.top + placement.maxHeight,
  };
  return (
    card.left < mark.x + radius &&
    card.right > mark.x - radius &&
    card.top < mark.y + radius &&
    card.bottom > mark.y - radius
  );
}

describe("where the card stands", () => {
  it("hangs off the mark's right, one gap clear of it", () => {
    const mark = { x: 300, y: 300 };
    const placement = placeLibraryGraphCard({ mark, markRadius: 14, card: CARD, box: BOX });
    expect(placement.side).toBe("right");
    expect(placement.left).toBe(mark.x + 14 + LIBRARY_CARD_GAP);
    // Centred on the mark, so the eye travels sideways and not up or down.
    expect(placement.top + CARD.height / 2).toBeCloseTo(mark.y, 5);
  });

  it("flips to the left rather than spilling off the right edge", () => {
    const mark = { x: 900, y: 300 };
    const placement = placeLibraryGraphCard({ mark, markRadius: 10, card: CARD, box: BOX });
    expect(placement.side).toBe("left");
    expect(placement.left + CARD.width).toBe(mark.x - 10 - LIBRARY_CARD_GAP);
    expect(placement.left).toBeGreaterThanOrEqual(LIBRARY_CARD_INSET);
  });

  it("goes below the mark when neither side holds the card", () => {
    const narrow = { width: 380, height: 700 };
    const mark = { x: 190, y: 120 };
    const placement = placeLibraryGraphCard({ mark, markRadius: 9, card: CARD, box: narrow });
    expect(placement.side).toBe("below");
    expect(placement.top).toBe(mark.y + 9 + LIBRARY_CARD_GAP);
    expect(placement.left).toBeGreaterThanOrEqual(LIBRARY_CARD_INSET);
    expect(placement.left + CARD.width).toBeLessThanOrEqual(narrow.width - LIBRARY_CARD_INSET);
  });

  it("goes above when there is no room below either", () => {
    const narrow = { width: 380, height: 420 };
    const mark = { x: 190, y: 330 };
    const placement = placeLibraryGraphCard({ mark, markRadius: 9, card: CARD, box: narrow });
    expect(placement.side).toBe("above");
    expect(placement.top + CARD.height).toBe(mark.y - 9 - LIBRARY_CARD_GAP);
  });

  /**
   * ⚠️ **The falsifier, swept.** Every mark position on a 20×12 lattice, at three window
   * sizes and two mark radii: the card never overlaps the mark it belongs to, and never
   * leaves the canvas box — which begins *below* the caption row and the strip, so staying
   * inside it is the whole of "the card never covers the strip".
   */
  it("never covers its own mark, and never leaves the canvas, anywhere on the picture", () => {
    const boxes = [
      { width: 1088, height: 819 },
      { width: 616, height: 460 },
      { width: 1496, height: 940 },
    ];
    let checked = 0;
    for (const box of boxes) {
      for (const radius of [3.4, 28.8]) {
        for (let column = 0; column <= 20; column += 1) {
          for (let row = 0; row <= 12; row += 1) {
            const mark = { x: (box.width * column) / 20, y: (box.height * row) / 12 };
            const card = {
              width: Math.min(CARD.width, box.width - LIBRARY_CARD_INSET * 2),
              height: CARD.height,
            };
            const placement = placeLibraryGraphCard({ mark, markRadius: radius, card, box });
            const right = placement.left + card.width;
            // The card is never taller than the room it was given: it scrolls inside.
            const bottom = placement.top + placement.maxHeight;
            expect(placement.maxHeight).toBeLessThanOrEqual(card.height);
            expect(placement.left, `left at ${mark.x},${mark.y} in ${box.width}`).toBeGreaterThanOrEqual(
              LIBRARY_CARD_INSET - 0.001,
            );
            expect(right, `right at ${mark.x},${mark.y} in ${box.width}`).toBeLessThanOrEqual(
              box.width - LIBRARY_CARD_INSET + 0.001,
            );
            expect(placement.top, `top at ${mark.x},${mark.y} in ${box.width}`).toBeGreaterThanOrEqual(
              LIBRARY_CARD_INSET - 0.001,
            );
            expect(bottom, `bottom at ${mark.x},${mark.y} in ${box.width}`).toBeLessThanOrEqual(
              box.height - LIBRARY_CARD_INSET + 0.001,
            );
            expect(
              overlaps(placement, mark, radius, card.width),
              `the card covered its mark at ${mark.x},${mark.y} in ${box.width}×${box.height}`,
            ).toBe(false);
            checked += 1;
          }
        }
      }
    }
    // A sweep that measured nothing would pass too.
    expect(checked).toBe(boxes.length * 2 * 21 * 13);
  });

  it("keeps a card that cannot fit inside the box rather than pushing it off two edges", () => {
    const tiny = { width: 240, height: 180 };
    const placement = placeLibraryGraphCard({
      mark: { x: 120, y: 90 },
      markRadius: 6,
      card: CARD,
      box: tiny,
    });
    // The clamp collapses to the inset instead of producing a negative box, and the card
    // is handed the room it actually has rather than a height that cannot exist.
    expect(placement.left).toBe(LIBRARY_CARD_INSET);
    expect(placement.maxHeight).toBeLessThan(CARD.height);
    expect(placement.top).toBeGreaterThanOrEqual(LIBRARY_CARD_INSET);
  });
});

describe("which lines the drift runs along", () => {
  const edges: LibraryGraphEdge[] = [
    { id: "c1", source: "page:a", target: "source:x", relation: "cites", certainty: "current" },
    { id: "c2", source: "page:a", target: "source:y", relation: "cites", certainty: "unverified" },
    { id: "c3", source: "page:b", target: "source:x", relation: "cites", certainty: "current" },
    { id: "m1", source: "page:a", target: "concept:k", relation: "mentions", certainty: "current" },
  ];

  it("takes a page's citations, from either end, and never its mentions", () => {
    const fromPage = libraryGraphFlowEdges({ edges }, "page:a");
    expect([...fromPage.flow]).toEqual(["c1", "c2"]);
    expect([...fromPage.stale]).toEqual(["c2"]);

    // Read from the file's end it is the same relation, so it is the same set of lines:
    // one direction of travel in the product, two ways to ask about it.
    const fromSource = libraryGraphFlowEdges({ edges }, "source:x");
    expect([...fromSource.flow]).toEqual(["c1", "c3"]);
    expect([...fromSource.stale]).toEqual([]);
  });

  it("has nothing to flow for a concept, or for nothing at all", () => {
    expect(libraryGraphFlowEdges({ edges }, "concept:k").flow.size).toBe(0);
    expect(libraryGraphFlowEdges({ edges }, null).flow.size).toBe(0);
  });

  it("finds every citation the folder cannot vouch for, for the home's one breath", () => {
    expect([...libraryGraphStaleEdges({ edges })]).toEqual(["c2"]);
  });
});
