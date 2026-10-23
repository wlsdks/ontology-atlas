import { describe, expect, it } from "vitest";
import { placeHoverCard } from "./hover-card-placement";

const bounds = { x: 0, y: 0, w: 1400, h: 800 };
const size = { w: 200, h: 80 };
const anchor = { x: 600, y: 400 };

describe("placeHoverCard", () => {
  it("sits at the pointer's lower right when nothing is there", () => {
    const placement = placeHoverCard(anchor, size, [], bounds);
    expect(placement).toMatchObject({ corner: "bottom-right", left: 614, top: 414, overlap: 0 });
  });

  it("moves to the next clear corner when the lower right covers a node", () => {
    // A node disc where the default card would land.
    const node = { x: 700, y: 440, w: 40, h: 40 };
    const placement = placeHoverCard(anchor, size, [node], bounds);
    expect(placement.corner).toBe("bottom-left");
    expect(placement.overlap).toBe(0);
    expect(placement.left).toBe(600 - 14 - 200);
  });

  it("takes the least overlap when every corner covers something", () => {
    const everywhere = [
      { x: 614, y: 414, w: 200, h: 80 }, // bottom-right, full overlap
      { x: 386, y: 414, w: 100, h: 80 }, // bottom-left, half
      { x: 614, y: 306, w: 200, h: 80 }, // top-right, full
      { x: 386, y: 306, w: 150, h: 80 }, // top-left, three quarters
    ];
    const placement = placeHoverCard(anchor, size, everywhere, bounds);
    expect(placement.corner).toBe("bottom-left");
    expect(placement.overlap).toBe(100 * 80);
  });

  it("stays inside the bounds and never lands under the pointer to do so", () => {
    // Pointer in the bottom-right corner: the lower-right card is pushed back
    // on both axes until it lies under the pointer, so the lower-left corner,
    // which only needs the vertical push, wins.
    const placement = placeHoverCard({ x: 1395, y: 795 }, size, [], bounds);
    expect(placement.left + size.w).toBeLessThanOrEqual(bounds.w);
    expect(placement.top + size.h).toBeLessThanOrEqual(bounds.h);
    expect(placement.corner).toBe("bottom-left");
    expect(placement.overlap).toBe(0);
  });

  it("gives up a clear view of a node before it covers chrome", () => {
    const node = { x: 700, y: 440, w: 40, h: 40 };
    const index = { x: 300, y: 380, w: 290, h: 200 };
    const placement = placeHoverCard(anchor, size, [node], bounds, 14, [index]);
    const card = { x: placement.left, y: placement.top, w: size.w, h: size.h };
    const onIndex =
      card.x < index.x + index.w && index.x < card.x + card.w && card.y < index.y + index.h && index.y < card.y + card.h;
    expect(onIndex).toBe(false);
  });

  it("keeps a narrow utility overlap out of a dense drawing", () => {
    const tile = { x: 980, y: 304, w: 36, h: 36 };
    const cardSize = { w: 280, h: 124 };
    const drawing = [
      { x: 400, y: 150, w: 300, h: 400 },
      { x: 720, y: 180, w: 280, h: 124 },
    ];
    const placement = placeHoverCard({ x: 712.9, y: 322.3 }, cardSize, drawing,
      { x: 8, y: 8, w: 1024, h: 704 }, 14, [tile]);
    const overlapsTile = placement.left < tile.x + tile.w &&
      placement.left + cardSize.w > tile.x && placement.top < tile.y + tile.h &&
      placement.top + cardSize.h > tile.y;
    expect(overlapsTile).toBe(false);
  });
});
