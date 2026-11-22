import { describe, expect, it } from "vitest";

import { hitTestWorld, worldToScreen } from "./topology-camera-math";

describe("hitTestWorld: 3D depth first (of overlapping discs the nearer node wins)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  // far (dead-centre) vs near (4px off) — both discs cover the cursor.
  const nodes = [
    { id: "far", kind: "domain", x: 0, y: 0, magnitudeScale: 1 },
    { id: "near", kind: "domain", x: 4, y: 0, magnitudeScale: 1 }
    ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  // The viewport 800×600's centre (400,300) is world (0,0).

  it("without depthForNode it is as before, and distance to the centre wins", () => {
    expect(hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300)).toBe("far");
  });

  it("with depthForNode the nearer node (smaller u) wins, the same rule as painter order", () => {
    const depth = (n: { id: string;
        }) => (n.id === "far" ? 0.9 : 0.1);
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, undefined, depth as never)).toBe("near");
  });

  it("when the cursor is outside the nearer node's disc the farther node is hit, since depth competes only inside the disc", () => {
    const depth = (n: { id: string;
        }) => (n.id === "far" ? 0.9 : 0.1);
    // Both discs have radius 17+5=22, so a point covering only far has to sit on
    // far's opposite side from near: x=379 is 21 from far (inside) and 25 from near
    // (outside).
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 379, 300, undefined, undefined, undefined, depth as never)).toBe("far");
  });
});

describe("hitTestWorld: drawn ink beats the margin ring (regression for clicking the middle of a 3D disc)", () => {
  const camera = {
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  };
  const tokens = { radiusProject: 30, radiusDomain: 17, radiusCapability: 11, radiusElement: 7 } as unknown as Parameters<typeof hitTestWorld>[4];
  const nodes = [
    { id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 },
    { id: "domain", kind: "domain", x: 20, y: 0, magnitudeScale: 1 }
    ];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
  } as unknown as Parameters<typeof hitTestWorld>[0];
  const depth = (n: { id: string;
    }) => (n.id === "element" ? 0.9 : 0.1);
  // Both are scaled the way the dome scales them: element 7→3.5, domain 17→10.2.
  const radiusScale = (n: { id: string;
    }) => (n.id === "element" ? 0.5 : 0.6);
  // Viewport 800×600 puts world (0,0) at (400,300).

  it("the middle of a far node's drawn disc is not stolen by a nearer node's margin ring", () => {
    // domain: centre 20 px away, drawn radius 10.2, slack radius 15.2 — the cursor
    // is inside its slack ring but on no domain pixel.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 400, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("element");
  });

  it("when two discs truly overlap the nearer one (smaller u) still wins", () => {
    // x=409 is 9 px from the element's centre — outside its 3.5 px disc — and 11 px
    // from the domain's, inside its 10.2 px disc. Real occlusion, near node wins.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 409, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("domain");
  });

  it("when no ink is touched depth decides inside the margin ring, as before", () => {
    // x=406 is 6 px from the element (slack only, 3.5+5=8.5) and 14 px from the
    // domain (slack only, 10.2+5=15.2). Neither is painted here, so depth decides.
    expect(
      hitTestWorld(world, camera as never, 800, 600, tokens, 406, 300, undefined, undefined, radiusScale as never, depth as never)).toBe("domain");
  });

  it("the hit disc uses the same projection as the screen coordinates the instrument reports, one projection", () => {
    /*
     * `__atlasMap.nodes()` reports `(n.x + dome.dx − cam) × scale + viewport/2`
     * and multiplies the radius by `dome.s`. The hit test must land on that same
     * point from the same two inputs, or a click at a reported centre is judged
     * against a node that is somewhere else. `dome-view.test.ts` proves the frame
     * offset itself is `projectDomeCoord`; this proves the hit test consumes it.
     */
    const offset = (n: { id: string;
        }) => (n.id === "element" ? { x: 120, y: -80 } : { x: 0, y: 0 });
    const moved = [{ id: "element", kind: "element", x: 0, y: 0, magnitudeScale: 1 }];
    const movedWorld = {
      nodes: moved,
      nodeById: new Map(moved.map((n) => [n.id, n])),
    } as unknown as Parameters<typeof hitTestWorld>[0];
    const reported = worldToScreen(camera as never, 800, 600, 0 + 120, 0 + -80);
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x, reported.y, undefined, offset as never, radiusScale as never)).toBe("element");
    // …and two pixels off the reported centre, the same answer. Below the drawn
    // radius (3.5), so this is the disc itself rather than the courtesy ring.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, reported.x + 2, reported.y, undefined, offset as never, radiusScale as never)).toBe("element");
    // The un-offset position is empty canvas — the offset is not decorative.
    expect(
      hitTestWorld(movedWorld, camera as never, 800, 600, tokens, 400, 300, undefined, offset as never, radiusScale as never)).toBeNull();
  });
});
