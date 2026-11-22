import { describe, expect, it } from "vitest";

import {
  TREE_POSE_REST,
  aimTreeProjector,
  clampTreePitch,
  createTreeProjector,
  decayTreeYawVelocity,
  mixTreePose,
  resistTreePitch,
  treePoseFacing,
  zoomTreePoseAbout,
} from "./tree-camera";
import type { TreeLayout, TreeModel, TreePose, TreeRect, TreeScreenPoint } from "./tree-shapes";

const CANVAS = { width: 1512, height: 982 };
/** Off-centre and wide, so the fit must use the binding side and the area's own corner. */
const FREE: TreeRect = { x: 300, y: 50, width: 1200, height: 300 };
/** Off-centre and narrow, so width binds. */
const NARROW: TreeRect = { x: 40, y: 30, width: 260, height: 900 };
const TREE_PITCH_MIN = clampTreePitch(-Infinity);
const TREE_PITCH_MAX = clampTreePitch(Infinity);
const YAWS = Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2);

function pose(overrides: Partial<TreePose> = {}): TreePose {
  return { ...TREE_POSE_REST, ...overrides };
}

function point(): TreeScreenPoint {
  return { x: 0, y: 0, scale: 0, depth: 0 };
}

/**
 * A tree 20 units tall: a bare trunk to y = 10, then crowns between y = 10 and y = 20 reaching
 * up to 9 units from the axis, so a bounding sphere would leave the lower half nearly empty.
 */
function treeLayout(): TreeLayout {
  const nodes: [number, number, number][] = [[0, 10, 0]];
  for (let i = 0; i < 14; i++) {
    const azimuth = i * 2.4;
    const reach = 1.5 + ((i * 5) % 7) * 1.25;
    nodes.push([Math.cos(azimuth) * reach, 10.5 + i * 0.7, Math.sin(azimuth) * reach]);
  }
  nodes.push([0.4, 20, -0.3]);
  const count = nodes.length;
  const position = new Float32Array(nodes.flat());
  const control = new Float32Array(count * 6);
  // Control points bow outward past the straight branch and past its end, as curved boughs do.
  const bow = [2.4, 1.8];
  for (let node = 0; node < count; node++) {
    const from = node === 0 ? [0, 0, 0] : nodes[0];
    for (let c = 0; c < 2; c++) {
      const along = (c + 1) / 3;
      control[node * 6 + c * 3] = (from[0] + along * (nodes[node][0] - from[0])) * bow[c];
      control[node * 6 + c * 3 + 1] = from[1] + along * (nodes[node][1] - from[1]);
      control[node * 6 + c * 3 + 2] = (from[2] + along * (nodes[node][2] - from[2])) * bow[c];
    }
  }
  const centreY = 10;
  const radius = Math.max(centreY, ...nodes.map(([x, y, z]) => Math.hypot(x, y - centreY, z)));
  return {
    model: { count } as TreeModel,
    position,
    control,
    widthStart: new Float32Array(count),
    widthEnd: new Float32Array(count),
    bound: new Float32Array(count * 4),
    childPitch: new Float32Array(count),
    reach: new Float32Array(count),
    centre: [0, centreY, 0],
    radius,
  };
}

/** Every point the tree draws through: the trunk base, each node and each branch control point. */
function treePoints(layout: TreeLayout): [number, number, number][] {
  const out: [number, number, number][] = [[0, 0, 0]];
  for (let node = 0; node < layout.model.count; node++) {
    out.push([...layout.position.subarray(node * 3, node * 3 + 3)] as [number, number, number]);
    out.push([...layout.control.subarray(node * 6, node * 6 + 3)] as [number, number, number]);
    out.push([...layout.control.subarray(node * 6 + 3, node * 6 + 6)] as [number, number, number]);
  }
  return out;
}

const TREE = treeLayout();

function depthAt(layout: TreeLayout, node: number, at: TreePose): number {
  const projector = createTreeProjector();
  aimTreeProjector(projector, layout, at, CANVAS, FREE);
  const out = point();
  projector.project(layout.position[node * 3], layout.position[node * 3 + 1], layout.position[node * 3 + 2], out);
  return out.depth;
}

describe("tree camera", () => {
  it.each([
    ["wide", FREE],
    ["narrow", NARROW],
  ])("keeps every point of the tree inside a %s free area at zoom 1 for every yaw and settled pitch", (_, free) => {
    const projector = createTreeProjector();
    const out = point();
    for (const pitch of [TREE_PITCH_MIN, TREE_POSE_REST.pitch, TREE_PITCH_MAX]) {
      for (const yaw of YAWS) {
        aimTreeProjector(projector, TREE, pose({ yaw, pitch }), CANVAS, free);
        for (const [x, y, z] of treePoints(TREE)) {
          projector.project(x, y, z, out);
          expect(out.x).toBeGreaterThanOrEqual(free.x);
          expect(out.x).toBeLessThanOrEqual(free.x + free.width);
          expect(out.y).toBeGreaterThanOrEqual(free.y);
          expect(out.y).toBeLessThanOrEqual(free.y + free.height);
        }
      }
    }
  });

  it.each([
    ["wide", FREE],
    ["narrow", NARROW],
  ])("fills at least 88%% of a %s free area's binding side at the worst-case pitch, its box centred", (_, free) => {
    const projector = createTreeProjector();
    const out = point();
    let fill = 0;
    for (let step = 0; step <= 26; step++) {
      const pitch = TREE_PITCH_MIN + ((TREE_PITCH_MAX - TREE_PITCH_MIN) * step) / 26;
      let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const yaw of YAWS) {
        aimTreeProjector(projector, TREE, pose({ yaw, pitch }), CANVAS, free);
        for (const [x, y, z] of treePoints(TREE)) {
          projector.project(x, y, z, out);
          [left, right, top, bottom] = [Math.min(left, out.x), Math.max(right, out.x), Math.min(top, out.y), Math.max(bottom, out.y)];
        }
      }
      expect(Math.abs((top + bottom) / 2 - (free.y + free.height / 2))).toBeLessThan(0.02 * free.height);
      expect(Math.abs((left + right) / 2 - (free.x + free.width / 2))).toBeLessThan(0.02 * free.width);
      fill = Math.max(fill, (right - left) / free.width, (bottom - top) / free.height);
    }
    expect(fill).toBeGreaterThanOrEqual(0.88);
  });

  it("uses one scale at every yaw and pitch", () => {
    const projector = createTreeProjector();
    aimTreeProjector(projector, TREE, pose(), CANVAS, FREE);
    const unit = projector.unit;
    for (const pitch of [TREE_PITCH_MIN, 0.3, TREE_POSE_REST.pitch, 0.55, TREE_PITCH_MAX, resistTreePitch(TREE_PITCH_MAX + 0.4)]) {
      for (const yaw of YAWS) {
        aimTreeProjector(projector, TREE, pose({ yaw, pitch }), CANVAS, FREE);
        expect(projector.unit).toBe(unit);
      }
    }
  });

  it("scans a layout once however often the projector is aimed at it", () => {
    const layout = treeLayout();
    const { position } = layout;
    let scans = 0;
    Object.defineProperty(layout, "position", {
      get: () => {
        scans++;
        return position;
      },
    });
    const projector = createTreeProjector();
    for (let i = 0; i < 200; i++) {
      aimTreeProjector(projector, layout, pose({ yaw: i * 0.1, pitch: 0.2 + (i % 5) * 0.1, zoom: 1 + i / 50 }), CANVAS, { ...FREE, width: 600 + i });
    }
    expect(scans).toBe(1);
  });

  it("bounds every depth in the tree by near and far, which do not change with yaw", () => {
    const projector = createTreeProjector();
    const out = point();
    aimTreeProjector(projector, TREE, pose(), CANVAS, FREE);
    const { near, far } = projector;
    expect(far).toBeGreaterThan(near);
    for (const yaw of YAWS) {
      aimTreeProjector(projector, TREE, pose({ yaw }), CANVAS, FREE);
      expect([projector.near, projector.far]).toEqual([near, far]);
      for (const [x, y, z] of treePoints(TREE)) {
        projector.project(x, y, z, out);
        expect(out.depth).toBeGreaterThanOrEqual(near);
        expect(out.depth).toBeLessThanOrEqual(far);
      }
    }
  });

  it("draws a nearer point at a larger scale", () => {
    const projector = createTreeProjector();
    const near = point();
    const far = point();
    aimTreeProjector(projector, TREE, pose({ yaw: 0.8 }), CANVAS, FREE);
    projector.project(0, 14, 0, near);
    projector.project(0, 6, 0, far);
    expect(near.depth).toBeLessThan(far.depth);
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it("resists pitch past either limit and settles back inside the range", () => {
    for (const [limit, past] of [
      [TREE_PITCH_MAX, TREE_PITCH_MAX + 0.5],
      [TREE_PITCH_MIN, TREE_PITCH_MIN - 0.5],
    ]) {
      const resisted = resistTreePitch(past);
      expect(Math.abs(resisted - limit)).toBeGreaterThan(0);
      expect(Math.abs(resisted - limit)).toBeLessThan(Math.abs(past - limit) / 2);
      expect(clampTreePitch(resisted)).toBe(limit);
    }
    expect(resistTreePitch(TREE_PITCH_MIN - 10)).toBeGreaterThan(0);
    expect(resistTreePitch(TREE_POSE_REST.pitch)).toBe(TREE_POSE_REST.pitch);
  });

  it("keeps the world point under the pointer where it was while zooming", () => {
    const projector = createTreeProjector();
    const before = point();
    const after = point();
    const from = pose({ yaw: 1.1, pitch: 0.6, zoom: 1.6, panX: -40, panY: 25 });
    const to = pose();
    const world: [number, number, number] = [3, 15, 2];
    const elsewhere: [number, number, number] = [-4, 3, 1];
    const elsewhereBefore = point();
    aimTreeProjector(projector, TREE, from, CANVAS, FREE);
    projector.project(...world, before);
    projector.project(...elsewhere, elsewhereBefore);
    for (const factor of [1.7, 0.6]) {
      zoomTreePoseAbout(from, factor, before.x, before.y, FREE, to);
      aimTreeProjector(projector, TREE, to, CANVAS, FREE);
      projector.project(...world, after);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
      projector.project(...elsewhere, after);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(
        Math.hypot(elsewhereBefore.x - before.x, elsewhereBefore.y - before.y) * factor,
        6,
      );
    }
  });

  it("zooms about the canvas centre when the free area is empty", () => {
    const projector = createTreeProjector();
    const before = point();
    const after = point();
    const empty: TreeRect = { x: 0, y: 0, width: 0, height: 0 };
    const to = pose();
    const [centreX, centreY] = [CANVAS.width / 2, CANVAS.height / 2];
    zoomTreePoseAbout(pose(), 2, 100, 100, empty, to);
    for (const world of treePoints(TREE).slice(0, 12)) {
      aimTreeProjector(projector, TREE, pose(), CANVAS, empty);
      projector.project(...world, before);
      aimTreeProjector(projector, TREE, to, CANVAS, empty);
      projector.project(...world, after);
      expect(after.x - centreX).toBeCloseTo(2 * (before.x - centreX), 6);
      expect(after.y - centreY).toBeCloseTo(2 * (before.y - centreY), 6);
    }
  });

  it("clamps zoom at both limits", () => {
    const out = pose();
    const zoomed = (factor: number) => {
      zoomTreePoseAbout(pose(), factor, 400, 200, FREE, out);
      return out.zoom;
    };
    expect(zoomed(1e6)).toBeGreaterThan(1);
    expect(Number.isFinite(zoomed(1e6))).toBe(true);
    expect(zoomed(1e9)).toBe(zoomed(1e6));
    expect(zoomed(1e-6)).toBeLessThan(1);
    expect(zoomed(1e-6)).toBeGreaterThan(1e-3);
    expect(zoomed(1e-9)).toBe(zoomed(1e-6));
  });

  it("mixes yaw the short way round", () => {
    const out = pose();
    mixTreePose(pose({ yaw: 0.2 }), pose({ yaw: 2 * Math.PI - 0.2 }), 0.5, out);
    expect(out.yaw).toBeCloseTo(0, 9);
    mixTreePose(pose({ yaw: 3 }), pose({ yaw: -3 }), 1, out);
    expect(out.yaw).toBeCloseTo(2 * Math.PI - 3, 9);
  });

  it("mixes pitch and pan linearly and zoom geometrically", () => {
    const out = pose();
    mixTreePose(pose({ pitch: 0.2, zoom: 1, panX: -10, panY: 40 }), pose({ pitch: 0.6, zoom: 4, panX: 30, panY: 0 }), 0.5, out);
    expect(out.pitch).toBeCloseTo(0.4, 9);
    expect(out.zoom).toBeCloseTo(2, 9);
    expect([out.panX, out.panY]).toEqual([10, 20]);
  });

  it("brings a faced node to the near side the short way, keeping pitch and zoom", () => {
    const from = pose({ yaw: 9, pitch: 0.6, zoom: 2.5 });
    const out = pose();
    for (const node of [3, 8]) {
      treePoseFacing(TREE, node, from, out);
      expect(Math.abs(out.yaw - from.yaw)).toBeLessThanOrEqual(Math.PI);
      expect([out.pitch, out.zoom]).toEqual([from.pitch, from.zoom]);
      const faced = depthAt(TREE, node, out);
      for (const yaw of YAWS) expect(faced).toBeLessThanOrEqual(depthAt(TREE, node, { ...out, yaw }) + 1e-9);
    }
  });

  it("decays yaw momentum at the same rate for any frame interval and comes to rest", () => {
    const start = 0.004;
    expect(decayTreeYawVelocity(decayTreeYawVelocity(start, 8), 8)).toBeCloseTo(decayTreeYawVelocity(start, 16), 12);
    expect(Math.abs(decayTreeYawVelocity(-start, 16))).toBeLessThan(start);
    let v = start;
    let frames = 0;
    while (v !== 0 && frames < 10_000) {
      v = decayTreeYawVelocity(v, 16);
      frames++;
    }
    expect(v).toBe(0);
  });
});
