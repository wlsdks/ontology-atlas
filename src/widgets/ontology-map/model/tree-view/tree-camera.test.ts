import { describe, expect, it } from "vitest";

import {
  TREE_PITCH_MAX,
  TREE_PITCH_MIN,
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
import type { TreeLayout, TreeModel, TreePose, TreeRect, TreeScreenPoint } from "./types";

const CANVAS = { width: 1512, height: 982 };
/** A panel covers the right third. */
const FREE: TreeRect = { x: 0, y: 0, width: 1000, height: 982 };
const SPHERE = { centre: [0.5, 6, -1] as const, radius: 7 };

function pose(overrides: Partial<TreePose> = {}): TreePose {
  return { ...TREE_POSE_REST, ...overrides };
}

function point(): TreeScreenPoint {
  return { x: 0, y: 0, scale: 0, depth: 0 };
}

/** Even points on the sphere's surface (golden-angle spiral). */
function spherePoints(count: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(1 - y * y);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    out.push([
      SPHERE.centre[0] + SPHERE.radius * ring * Math.cos(angle),
      SPHERE.centre[1] + SPHERE.radius * y,
      SPHERE.centre[2] + SPHERE.radius * ring * Math.sin(angle),
    ]);
  }
  return out;
}

/** Only `position`, `centre` and `radius` matter to the camera. */
function layoutWithPositions(positions: number[]): TreeLayout {
  const count = positions.length / 3;
  return {
    model: { count } as TreeModel,
    position: new Float32Array(positions),
    control: new Float32Array(count * 6),
    widthStart: new Float32Array(count),
    widthEnd: new Float32Array(count),
    bound: new Float32Array(count * 4),
    childPitch: new Float32Array(count),
    reach: new Float32Array(count),
    centre: SPHERE.centre,
    radius: SPHERE.radius,
  };
}

function depthAt(layout: TreeLayout, node: number, at: TreePose): number {
  const projector = createTreeProjector();
  aimTreeProjector(projector, layout, at, CANVAS, FREE);
  const out = point();
  projector.project(layout.position[node * 3], layout.position[node * 3 + 1], layout.position[node * 3 + 2], out);
  return out.depth;
}

describe("tree camera", () => {
  it("keeps the tree's sphere inside the free area at zoom 1 for every yaw and pitch", () => {
    const projector = createTreeProjector();
    const out = point();
    const surface = spherePoints(600);
    for (const pitch of [TREE_PITCH_MIN, TREE_POSE_REST.pitch, TREE_PITCH_MAX]) {
      for (let step = 0; step < 24; step++) {
        aimTreeProjector(projector, SPHERE, pose({ yaw: (step / 24) * Math.PI * 2, pitch }), CANVAS, FREE);
        for (const [x, y, z] of surface) {
          projector.project(x, y, z, out);
          expect(out.x).toBeGreaterThanOrEqual(FREE.x);
          expect(out.x).toBeLessThanOrEqual(FREE.x + FREE.width);
          expect(out.y).toBeGreaterThanOrEqual(FREE.y);
          expect(out.y).toBeLessThanOrEqual(FREE.y + FREE.height);
        }
      }
    }
  });

  it("bounds every depth in the sphere by near and far, which do not change with yaw", () => {
    const projector = createTreeProjector();
    const out = point();
    aimTreeProjector(projector, SPHERE, pose(), CANVAS, FREE);
    const { near, far } = projector;
    let nearest = Infinity;
    let farthest = -Infinity;
    for (let step = 0; step < 12; step++) {
      aimTreeProjector(projector, SPHERE, pose({ yaw: step * 0.53 }), CANVAS, FREE);
      expect([projector.near, projector.far]).toEqual([near, far]);
      for (const [x, y, z] of spherePoints(400)) {
        projector.project(x, y, z, out);
        nearest = Math.min(nearest, out.depth);
        farthest = Math.max(farthest, out.depth);
      }
    }
    expect(nearest).toBeGreaterThanOrEqual(near - 1e-9);
    expect(farthest).toBeLessThanOrEqual(far + 1e-9);
    expect(nearest - near).toBeLessThan(0.05 * (far - near));
    expect(far - farthest).toBeLessThan(0.05 * (far - near));
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
    const from = pose({ yaw: 1.1, zoom: 1.6, panX: -40, panY: 25 });
    const to = pose();
    const world: [number, number, number] = [3, 9, 2];
    aimTreeProjector(projector, SPHERE, from, CANVAS, FREE);
    projector.project(...world, before);
    for (const factor of [1.7, 0.6]) {
      zoomTreePoseAbout(from, factor, before.x, before.y, FREE, to);
      expect(to.zoom).not.toBe(from.zoom);
      aimTreeProjector(projector, SPHERE, to, CANVAS, FREE);
      projector.project(...world, after);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    }
  });

  it("mixes yaw the short way round", () => {
    const out = pose();
    mixTreePose(pose({ yaw: 0.2 }), pose({ yaw: 2 * Math.PI - 0.2 }), 0.5, out);
    expect(out.yaw).toBeCloseTo(0, 9);
    mixTreePose(pose({ yaw: 3 }), pose({ yaw: -3 }), 1, out);
    expect(out.yaw).toBeCloseTo(2 * Math.PI - 3, 9);
  });

  it("brings a faced node to the near side the short way, keeping pitch and zoom", () => {
    const layout = layoutWithPositions([0, 3, 0, 6, 8, 2, -4, 5, -5]);
    const from = pose({ yaw: 9, pitch: 0.6, zoom: 2.5 });
    const out = pose();
    for (const node of [1, 2]) {
      treePoseFacing(layout, node, from, out);
      expect(Math.abs(out.yaw - from.yaw)).toBeLessThanOrEqual(Math.PI);
      expect([out.pitch, out.zoom]).toEqual([from.pitch, from.zoom]);
      const faced = depthAt(layout, node, out);
      for (let step = 0; step < 36; step++) {
        expect(faced).toBeLessThanOrEqual(depthAt(layout, node, { ...out, yaw: (step / 36) * Math.PI * 2 }) + 1e-9);
      }
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
