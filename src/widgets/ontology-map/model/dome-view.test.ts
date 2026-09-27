import { describe, expect, it } from "vitest";

import type { CameraAxes } from "../engine/camera";
import { worldToScreen } from "../ui/topology-camera-math";
import {
  DOME_EDGE_DEVICE_WIDTH_FLOOR,
  domeEdgeMinWidthPx,
  buildDomeModel,
  beginDomeModelBuild,
  clampDomePitch,
  createDomeRuntime,
  decayOrbitVelocity,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_FOCAL,
  DOME_PITCH_DEFAULT,
  DOME_PITCH_MAX,
  DOME_PITCH_MIN,
  DOME_NODE_PX,
  DOME_PLANE,
  domeEgoWorldBounds,
  domeFocusYaw,
  DOME_HALO_MAX_PX,
  DOME_RING_ALPHA,
  DOME_RING_SAMPLES,
  chargeTierLag,
  CLOUD_ITERATIONS,
  commitDomeEntrySweep,
  DOME_FIT_RADIUS,
  domeFacingYaws,
  ORBIT_DECAY_TRAVEL_MS,
  ORBIT_SNAP_ARRIVE_RAD,
  ORBIT_SNAP_TAU_MAX_MS,
  ORBIT_SNAP_TAU_MIN_MS,
  ORBIT_SNAP_WINDOW_RAD,
  orbitSnapTauMs,
  projectOrbitLanding,
  clampOrbitReleaseVelocity,
  ORBIT_COAST_MAX_RAD,
  snapOrbitLanding,
  DOME_ENTRY_SWEEP_MS,
  DOME_GRIP_MARGIN,
  isInsideDomeGrip,
  DOME_POSE_LAG_SCALE,
  DOME_TIER_LAG,
  DOME_DETAIL_FADE_END,
  DOME_DETAIL_FADE_START,
  domeEdgeFogAlpha,
  domeEdgeWidthFactor,
  domeDetailFactor,
  domeFogAlpha,
  domeHaloPx,
  domeLineWidthFactor,
  domeNearestYawTurn,
  domeReachesRect,
  domeTierRamp,
  domeWorldBounds,
  KIND_DEPTH,
  projectDomeCoord,
  resistDomePitch,
  solveDomePlanePoint,
  stepDomeDragSpring,
  updateDomeFrame,
  beginDomeMorph,
  domeRingSampleCount,
  settleDomeRuntimeOffscreen,
  type DomeRuntime,
  buildStrataTargets,
  DOME_STRATA_RING_ALPHA,
  domeRingAlphaFor,
  type DomeCoord,
  type DomeInputNode,
  type DomeViewKind,
} from "./dome-view";

const cam = (x: number, y: number, scale: number): CameraAxes => ({
  x: { value: x, velocity: 0 },
  y: { value: y, velocity: 0 },
  scale: { value: scale, velocity: 0 },
});

const KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/** Small deterministic vault — 1 project · 2 domains · 3 capabilities · 3 elements. */
const NODES: readonly DomeInputNode[] = [
  { id: "atlas", kind: "project", x: 10, y: -20, parentId: null },
  { id: "dom-a", kind: "domain", x: -300, y: 40, parentId: "atlas" },
  { id: "dom-b", kind: "domain", x: 320, y: -60, parentId: "atlas" },
  { id: "cap-a1", kind: "capability", x: -420, y: 180, parentId: "dom-a" },
  { id: "cap-a2", kind: "capability", x: -380, y: -220, parentId: "dom-a" },
  { id: "cap-b1", kind: "capability", x: 460, y: 120, parentId: "dom-b" },
  { id: "el-1", kind: "element", x: -520, y: 260, parentId: "cap-a1" },
  { id: "el-2", kind: "element", x: 540, y: 200, parentId: "cap-b1" },
  { id: "el-orphan", kind: "element", x: 80, y: 420, parentId: null },
];

describe("dome-view heights and angles carry type facts", () => {
  it("KIND_DEPTH follows the spine order (project 0 to element 3)", () => {
    expect(KIND_DEPTH.project).toBe(0);
    expect(KIND_DEPTH.domain).toBe(1);
    expect(KIND_DEPTH.capability).toBe(2);
    expect(KIND_DEPTH.element).toBe(3);
  });

  it("lowers the ring height for deeper kinds: project at the apex, element at the floor", () => {
    expect(DOME_PLANE.project.y).toBeGreaterThan(DOME_PLANE.domain.y);
    expect(DOME_PLANE.domain.y).toBeGreaterThan(DOME_PLANE.capability.y);
    expect(DOME_PLANE.capability.y).toBeGreaterThan(DOME_PLANE.element.y);
    expect(DOME_PLANE.project.r).toBe(0);
    expect(DOME_PLANE.domain.r).toBeLessThan(DOME_PLANE.capability.r);
    expect(DOME_PLANE.capability.r).toBeLessThan(DOME_PLANE.element.r);
  });

  it("depth fog is the hero ramp: 1.0 near, 0.09 far, decreasing monotonically", () => {
    expect(domeFogAlpha(0)).toBeCloseTo(1, 12);
    expect(domeFogAlpha(1)).toBeCloseTo(0.09, 12);
    expect(domeFogAlpha(0.5)).toBeLessThan(domeFogAlpha(0.25));
    expect(domeLineWidthFactor(0)).toBeCloseTo(0.9, 12);
    expect(domeLineWidthFactor(1)).toBeCloseTo(0.35, 12);
  });

  it("lays out deterministically, taking angles from the containment parent", () => {
    const a = buildDomeModel(NODES);
    const b = buildDomeModel(NODES);
    for (const [id, coord] of a.coords) {
      expect(b.coords.get(id)).toEqual(coord);
    }
    // A lone project sits on the apex (the axis).
    expect(a.coords.get("atlas")).toEqual({ px: 0, py: DOME_PLANE.project.y, pz: 0 });
    // Capabilities stay inside their parent domain's arc — children of one parent
    // are angularly closer to it than to the opposite parent's children.
    const angleOf = (id: string) => {
      const c = a.coords.get(id)!;
      return Math.atan2(c.pz, c.px);
    };
    const angDist = (x: number, y: number) => {
      const d = Math.abs(x - y) % (Math.PI * 2);
      return d > Math.PI ? Math.PI * 2 - d : d;
    };
    expect(angDist(angleOf("cap-a1"), angleOf("dom-a"))).toBeLessThan(angDist(angleOf("cap-a1"), angleOf("dom-b")));
    expect(angDist(angleOf("el-2"), angleOf("cap-b1"))).toBeLessThan(angDist(angleOf("el-2"), angleOf("cap-a1")));
    // Every node carries the ring height of its own kind.
    for (const n of NODES) {
      expect(a.coords.get(n.id)!.py).toBe(DOME_PLANE[n.kind].y);
    }
  });
});

describe("dome-view frame map equals worldToScreen, one source for draw and hit", () => {
  it("worldToScreen(w + off) passes through the dome projection at ramp 1", () => {
    const model = buildDomeModel(NODES);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    runtime.yaw = 1.234;
    runtime.pitch = 0.4;
    /*
     * Turn the entry sweep off. This test's claim is that the frame map equals
     * the projection of the **drawn** pose, not of the raw yaw/pitch. While the
     * sweep is live the two poses differ, and that difference is correct
     * (`runtime.drawYaw/drawPitch` is the single source of the drawn pose — a
     * separate test below pins that contract).
     */
    runtime.entryArmed = false;
    const BASE_R = 10;
    const CAM_SCALE = 0.85;
    updateDomeFrame(runtime, NODES as unknown as Array<{ id: string; kind: DomeViewKind; x: number; y: number }>, () => BASE_R, 0, CAM_SCALE);
    const camera = cam(37.5, -18.25, CAM_SCALE);
    for (const n of NODES) {
      const off = runtime.frame.get(n.id)!;
      const direct = projectDomeCoord(model, model.coords.get(n.id)!, runtime.yaw, runtime.pitch);
      const via = worldToScreen(camera, 1512, 900, n.x + off.dx, n.y + off.dy);
      const want = worldToScreen(camera, 1512, 900, direct.wx, direct.wy);
      expect(via.x).toBeCloseTo(want.x, 9);
      expect(via.y).toBeCloseTo(want.y, 9);
      // `s` is a radius multiplier, and base × s × cameraScale is what the draw
      // paints — so the drawn radius is `DOME_NODE_PX[kind] × perspective` SCREEN
      // pixels, whatever the zoom. That is the whole point of the table: fitting
      // the cone bigger must buy spacing, not ink.
      expect(off.s * BASE_R * CAM_SCALE).toBeCloseTo(DOME_NODE_PX[n.kind] * direct.s, 9);
      expect(off.a).toBe(1);
      expect(off.u).toBeGreaterThanOrEqual(0);
      expect(off.u).toBeLessThanOrEqual(1);
    }
  });

  it("gives offset 0 and scale 1 at ramp 0, the same as 2D", () => {
    const model = buildDomeModel(NODES);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = 0;
    updateDomeFrame(runtime, NODES as unknown as Array<{ id: string; kind: DomeViewKind; x: number; y: number }>, () => 10);
    for (const n of NODES) {
      const off = runtime.frame.get(n.id)!;
      expect(off.dx).toBe(0);
      expect(off.dy).toBe(0);
      expect(off.s).toBe(1);
    }
  });

  it("staggers the assembly: project stands first and element last", () => {
    expect(domeTierRamp(0, "project")).toBe(0);
    expect(domeTierRamp(300, "project")).toBeGreaterThan(domeTierRamp(300, "domain"));
    expect(domeTierRamp(500, "domain")).toBeGreaterThan(domeTierRamp(500, "capability"));
    expect(domeTierRamp(700, "capability")).toBeGreaterThan(domeTierRamp(700, "element"));
    for (const kind of KINDS) {
      expect(domeTierRamp(DOME_ASSEMBLE_TOTAL_MS, kind)).toBe(1);
    }
  });
});

describe("dome-view in-plane unprojection, the coordinate contract of 3D node drag", () => {
  it("solve(project(p)) returns the in-plane coordinate", () => {
    const model = buildDomeModel(NODES);
    for (const [yaw, pitch] of [
      [0.55, DOME_PITCH_DEFAULT],
      [2.1, 0.2],
      [-1.3, 0.6],
    ] as const) {
      for (const id of ["dom-a", "cap-b1", "el-1"]) {
        const coord = model.coords.get(id)!;
        const p = projectDomeCoord(model, coord, yaw, pitch);
        const solved = solveDomePlanePoint(model, coord.py, p.wx, p.wy, yaw, pitch);
        expect(solved).not.toBeNull();
        expect(solved!.px).toBeCloseTo(coord.px, 6);
        expect(solved!.pz).toBeCloseTo(coord.pz, 6);
      }
    }
  });

  it("solve(project(p)) returns the in-plane coordinate from below (negative pitch)", () => {
    // The coordinate contract of opening pitch to the full range (2026-08-18,
    // second round). From below, the denominator's normal sign flips negative,
    // and the old unconditional positive floor pinned every drag to that floor
    // constant. The viewpoint decides the expected sign (`solveDomePlanePoint`).
    const model = buildDomeModel(NODES);
    for (const [yaw, pitch] of [
      [0.55, -DOME_PITCH_DEFAULT],
      [2.1, -0.9],
      [-1.3, DOME_PITCH_MIN + 0.05],
    ] as const) {
      for (const id of ["dom-a", "cap-b1", "el-1"]) {
        const coord = model.coords.get(id)!;
        const p = projectDomeCoord(model, coord, yaw, pitch);
        const solved = solveDomePlanePoint(model, coord.py, p.wx, p.wy, yaw, pitch);
        expect(solved).not.toBeNull();
        expect(solved!.px).toBeCloseTo(coord.px, 6);
        expect(solved!.pz).toBeCloseTo(coord.pz, 6);
      }
    }
  });

  it("caps the radius: a throw off screen keeps its direction within 1.5x the floor ring", () => {
    const model = buildDomeModel(NODES);
    const solved = solveDomePlanePoint(model, DOME_PLANE.element.y, model.centerX + model.unit * 5000, model.centerY, 0.55, DOME_PITCH_DEFAULT);
    expect(solved).not.toBeNull();
    expect(Math.hypot(solved!.px, solved!.pz)).toBeLessThanOrEqual(DOME_PLANE.element.r * 1.5 + 1e-9);
  });

  it("yields a finite point within the radius cap, without freezing, when the pointer crosses the plane horizon", () => {
    // Reproduces the owner report of 2026-08-18: "Some don't move properly even when clicked" (some of them don't move properly even when clicked). At low
    // pitch (side-on) dragging a node upward takes the denominator through 0, and
    // the earlier code returned either null (discarding that frame's move — the
    // node freezes) or a solution behind the camera (it flies off). Contract:
    // sweeping the full screen height always yields non-null, always finite,
    // always inside the radius cap.
    const model = buildDomeModel(NODES);
    for (const pitch of [DOME_PITCH_MIN, DOME_PITCH_DEFAULT, DOME_PITCH_MAX]) {
      for (const planeY of [DOME_PLANE.project.y, DOME_PLANE.domain.y, DOME_PLANE.element.y]) {
        for (let wy = -3000; wy <= 3000; wy += 60) {
          const solved = solveDomePlanePoint(model, planeY, model.centerX + 50, model.centerY + wy, 0.55, pitch);
          expect(solved, `pitch=${pitch} planeY=${planeY} wy=${wy}`).not.toBeNull();
          expect(Number.isFinite(solved!.px)).toBe(true);
          expect(Number.isFinite(solved!.pz)).toBe(true);
          expect(Math.hypot(solved!.px, solved!.pz)).toBeLessThanOrEqual(DOME_PLANE.element.r * 1.5 + 1e-9);
        }
      }
    }
  });

  it("returns non-null for a pointer exactly on the horizon where the denominator is 0", () => {
    const model = buildDomeModel(NODES);
    const pitch = DOME_PITCH_MIN;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // Solve for the uy where denom = F·sp + uy·cp = 0 and hit exactly that spot.
    const uy = (-DOME_FOCAL * sp) / cp;
    const wy = model.centerY + uy * model.unit;
    const solved = solveDomePlanePoint(model, DOME_PLANE.domain.y, model.centerX + 50, wy, 0.55, pitch);
    expect(solved).not.toBeNull();
    expect(Number.isFinite(solved!.px)).toBe(true);
    expect(Number.isFinite(solved!.pz)).toBe(true);
  });

  it("does not teleport to the opposite rim when the pointer moves one pixel across the horizon", () => {
    // Once the denominator crossed to 0−, the solution flipped behind the camera
    // and jumped to the rim at the opposite bearing — on screen, the node being
    // dragged teleports to the far side of the dome. Contract: a one-unit pointer
    // step may move the solution by at most one step along the rim.
    const model = buildDomeModel(NODES);
    const pitch = DOME_PITCH_MIN;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const uyHorizon = (-DOME_FOCAL * sp) / cp;
    const wyHorizon = model.centerY + uyHorizon * model.unit;
    let prev: { px: number; pz: number } | null = null;
    for (let dwy = 40; dwy >= -40; dwy -= 1) {
      const solved = solveDomePlanePoint(model, DOME_PLANE.domain.y, model.centerX + 50, wyHorizon + dwy * model.unit, 0.55, pitch);
      expect(solved).not.toBeNull();
      if (prev !== null) {
        const jump = Math.hypot(solved!.px - prev.px, solved!.pz - prev.pz);
        expect(jump, `dwy=${dwy}`).toBeLessThan(DOME_PLANE.element.r * 1.5);
      }
      prev = solved;
    }
  });
});

describe("dome-view physics: inertia, rubber band and spring", () => {
  it("decays inertia geometrically and snaps to 0 below the threshold", () => {
    let v = 0.002;
    for (let i = 0; i < 600; i++) v = decayOrbitVelocity(v, 16.7);
    expect(v).toBe(0);
    // dt-invariant — the same total time gives the same value regardless of how it is split into frames.
    const oneStep = decayOrbitVelocity(0.002, 100);
    let split = 0.002;
    for (let i = 0; i < 10; i++) split = decayOrbitVelocity(split, 10);
    expect(split).toBeCloseTo(oneStep, 12);
  });

  it("pitch is clamped to 0.15–0.95 rad: the lit planes are always seen from above", () => {
    // 2026-09-25 (lit strata): a tier disc seen from below reverses the level order and
    // an edge-on disc loses it, so both are walls now. This replaces the 2026-08-18
    // pole-to-pole range; the dissent is kept in the decision fragment.
    expect(DOME_PITCH_MIN).toBe(0.15);
    expect(DOME_PITCH_MAX).toBe(0.95);
    expect(clampDomePitch(0)).toBe(DOME_PITCH_MIN); // edge-on — locked
    expect(clampDomePitch(-0.8)).toBe(DOME_PITCH_MIN); // from below — locked
    expect(clampDomePitch(DOME_PITCH_DEFAULT)).toBe(DOME_PITCH_DEFAULT);
    expect(clampDomePitch(2)).toBe(DOME_PITCH_MAX);
    expect(clampDomePitch(-2)).toBe(DOME_PITCH_MIN);
  });

  it("rubber-bands pitch at quarter resistance and stops the overshoot at the cap, so the pole never flips", () => {
    expect(resistDomePitch(DOME_PITCH_MAX + 0.2)).toBeCloseTo(DOME_PITCH_MAX + 0.05, 12);
    expect(resistDomePitch(DOME_PITCH_MIN - 0.2)).toBeCloseTo(DOME_PITCH_MIN - 0.05, 12);
    // However hard you pull, the squash stops at 0.09 — even squashed it never passes π/2.
    expect(resistDomePitch(DOME_PITCH_MAX + 40)).toBeCloseTo(DOME_PITCH_MAX + 0.09, 12);
    expect(resistDomePitch(DOME_PITCH_MAX + 40)).toBeLessThan(Math.PI / 2);
    expect(resistDomePitch(DOME_PITCH_MIN - 40)).toBeCloseTo(DOME_PITCH_MIN - 0.09, 12);
    expect(resistDomePitch(0.3)).toBe(0.3);
  });

  it("converges the drag spring to its target without overshoot (critically damped)", () => {
    const spring = { px: 0, pz: 0, vx: 0, vz: 0 };
    for (let i = 0; i < 200; i++) stepDomeDragSpring(spring, 100, -60, 16.7, 15);
    expect(spring.px).toBeCloseTo(100, 1);
    expect(spring.pz).toBeCloseTo(-60, 1);
    expect(Math.abs(spring.vx)).toBeLessThan(0.1);
  });

  it("domeWorldBounds yields a finite bbox, the input of return to home", () => {
    const model = buildDomeModel(NODES);
    const bounds = domeWorldBounds(model, 0.55, DOME_PITCH_DEFAULT)!;
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
  });

  it("updateDomeFrame keeps the bbox of the drawn positions, the input of the pan leash anchor", () => {
    const model = buildDomeModel(NODES);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, NODES as unknown as Array<{ id: string; kind: DomeViewKind; x: number; y: number }>, () => 10);
    const b = runtime.drawnBounds!;
    expect(b).not.toBeNull();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of NODES) {
      const off = runtime.frame.get(n.id)!;
      minX = Math.min(minX, n.x + off.dx);
      maxX = Math.max(maxX, n.x + off.dx);
      minY = Math.min(minY, n.y + off.dy);
      maxY = Math.max(maxY, n.y + off.dy);
    }
    expect(b.minX).toBeCloseTo(minX, 9);
    expect(b.maxX).toBeCloseTo(maxX, 9);
    expect(b.minY).toBeCloseTo(minY, 9);
    expect(b.maxY).toBeCloseTo(maxY, 9);
  });
});

describe("dome-view selection reframe and auto-rotate arming", () => {
  it("domeNearestYawTurn picks the equivalent angle nearest the current yaw", () => {
    const TAU = Math.PI * 2;
    expect(domeNearestYawTurn(0.55, 0.6)).toBeCloseTo(0.55, 12);
    expect(domeNearestYawTurn(0.55, 6.6)).toBeCloseTo(0.55 + TAU, 12);
    expect(domeNearestYawTurn(0.55, -5.5)).toBeCloseTo(0.55 - TAU, 12);
    // Never turns more than half a revolution.
    for (const cur of [-9, -2.2, 0, 3.3, 14]) {
      expect(Math.abs(domeNearestYawTurn(0.55, cur) - cur)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it("domeFocusYaw brings the node to the front of the dome (minimum depth)", () => {
    const model = buildDomeModel(NODES);
    for (const id of ["dom-a", "cap-b1", "el-2"]) {
      const coord = model.coords.get(id)!;
      const yaw = domeFocusYaw(coord, 0.9);
      const at = projectDomeCoord(model, coord, yaw, DOME_PITCH_DEFAULT);
      // The theoretical minimum depth is −r·cos(pitch) − py·sin(pitch).
      const r = Math.hypot(coord.px, coord.pz);
      const zMin = -r * Math.cos(DOME_PITCH_DEFAULT) - coord.py * Math.sin(DOME_PITCH_DEFAULT);
      expect(at.z).toBeCloseTo(zMin, 6);
      // Equivalent-angle rule — never more than half a revolution from the current yaw.
      expect(Math.abs(yaw - 0.9)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    // A node on the axis (a lone project apex) gives no reason to rotate — the current yaw stands.
    const apex = model.coords.get("atlas")!;
    expect(domeFocusYaw(apex, 1.23)).toBe(1.23);
  });

  it("domeEgoWorldBounds yields a finite bbox from ids in the model and null when none are", () => {
    const model = buildDomeModel(NODES);
    const b = domeEgoWorldBounds(model, ["dom-a", "cap-a1", "ghost-id"], 0.55, DOME_PITCH_DEFAULT);
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThanOrEqual(b!.maxX);
    expect(Number.isFinite(b!.minY) && Number.isFinite(b!.maxY)).toBe(true);
    expect(domeEgoWorldBounds(model, ["ghost-id"], 0.55, DOME_PITCH_DEFAULT)).toBeNull();
  });

  it("starts a new runtime armed for rotation with no pose movement", () => {
    // The attract rotation is the default for a screen nobody has touched yet.
    // Disarming it on intervention (orbit, zoom, pinch, node drag, selection) is
    // the loop's and the pointer handlers' contract, not this one's.
    const runtime = createDomeRuntime(buildDomeModel(NODES));
    expect(runtime.spinArmed).toBe(true);
    expect(runtime.poseTween).toBeNull();
  });
});

describe("worldToScreen without a depth term matches the flat projection exactly", () => {
  it("the default path is the plain two-line formula", () => {
    const camera = cam(37.5, -18.25, 0.85);
    for (const [wx, wy] of [
      [0, 0],
      [1, 1],
      [-321.125, 654.875],
      [99999, -99999],
    ]) {
      const p = worldToScreen(camera, 1512, 900, wx, wy);
      // The same formula written out literally — a change to the function body is caught here.
      expect(p.x).toBe((wx - 37.5) * 0.85 + 1512 / 2);
      expect(p.y).toBe((wy - -18.25) * 0.85 + 900 / 2);
    }
  });

  it("a depth term with z=0 and lift=0 gives the same coordinates as the default path", () => {
    const camera = cam(5, 9, 1.3);
    const flat = worldToScreen(camera, 800, 600, 123.4, -56.7);
    const zero = worldToScreen(camera, 800, 600, 123.4, -56.7, { z: 0, lift: 0, focal: DOME_FOCAL });
    expect(zero.x).toBeCloseTo(flat.x, 12);
    expect(zero.y).toBeCloseTo(flat.y, 12);
  });
});

/* ── 3D quality layer: shell · meridians · halo · latitude rings ─────────── */

describe("depth halo lets the near occlude the far", () => {
  it("widens when near and converges to 0 when far", () => {
    expect(domeHaloPx(0)).toBeCloseTo(DOME_HALO_MAX_PX, 6);
    expect(domeHaloPx(1)).toBeCloseTo(0, 6);
    expect(domeHaloPx(0.3)).toBeGreaterThan(domeHaloPx(0.7));
  });

  it("clamps out-of-range input so a misnormalised frame yields no negative width", () => {
    expect(domeHaloPx(-2)).toBeCloseTo(DOME_HALO_MAX_PX, 6);
    expect(domeHaloPx(9)).toBeCloseTo(0, 6);
  });
});

describe("far-side detail ramp folds only the extra strokes of the back hemisphere, continuously in depth", () => {
  it("is exactly 1 on the front hemisphere, so no pixel on the viewer side changes", () => {
    expect(DOME_DETAIL_FADE_START).toBeGreaterThanOrEqual(0.5);
    for (let u = 0; u <= DOME_DETAIL_FADE_START + 1e-9; u += 0.01) {
      expect(domeDetailFactor(u)).toBe(1);
    }
  });

  it("is 0 past END and decreases monotonically between, 0.5 at the midpoint (smoothstep)", () => {
    expect(domeDetailFactor(DOME_DETAIL_FADE_END)).toBe(0);
    expect(domeDetailFactor(1)).toBe(0);
    expect(domeDetailFactor((DOME_DETAIL_FADE_START + DOME_DETAIL_FADE_END) / 2)).toBeCloseTo(0.5, 9);
    let prev = domeDetailFactor(DOME_DETAIL_FADE_START);
    for (let u = DOME_DETAIL_FADE_START; u <= DOME_DETAIL_FADE_END; u += 0.005) {
      const cur = domeDetailFactor(u);
      expect(cur).toBeLessThanOrEqual(prev + 1e-12);
      prev = cur;
    }
  });
});

describe("latitude rings are a coordinate system, not data", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d", kind: "domain", x: 100, y: 0, parentId: "p" },
    { id: "c", kind: "capability", x: 120, y: 40, parentId: "d" },
    { id: "e", kind: "element", x: 140, y: 80, parentId: "c" },
  ];

  it("rings are the cone floor circles of the model: a single chain (p to d to c to e) has only the project floor", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    // d, c each have one child → radius 0 → no base circle; only the project's ring.
    expect(runtime.rings).toHaveLength(1);
    expect(runtime.rings[0].kind).toBe("domain");
    expect(runtime.rings[0].points).toHaveLength(DOME_RING_SAMPLES);
    expect(runtime.rings[0].a).toBeGreaterThan(0.99);
  });

  it("scales the sample count with the radius, floor 12 and ceiling DOME_RING_SAMPLES", () => {
    expect(domeRingSampleCount(DOME_PLANE.domain.r)).toBe(DOME_RING_SAMPLES);
    expect(domeRingSampleCount(1)).toBe(12);
    expect(domeRingSampleCount(40)).toBeGreaterThan(12);
    expect(domeRingSampleCount(40)).toBeLessThan(DOME_RING_SAMPLES);
  });

  it("varies depth within one ring, or the ring gives no depth cue", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    const us = runtime.rings[0].points.map((point) => point.u);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.2);
    // Must be clamped on the same scale as the node frame, or the fog falls differently on the two.
    for (const u of us) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it("draws no ring at assembly ramp 0, so none in 2D", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = 0;
    updateDomeFrame(runtime, nodes, () => 10);
    for (const ring of runtime.rings) expect(ring.a).toBeLessThanOrEqual(0);
  });

  it("keeps ring ink below data ink, so the coordinate system never competes for attention", () => {
    expect(DOME_RING_ALPHA).toBeLessThan(0.5);
  });
});

describe("tier twist uses one function for hand and program", () => {
  const zero = () => ({ project: 0, domain: 0, capability: 0, element: 0 });

  it("lags deeper tiers further, or the hierarchy reads upside down", () => {
    const lag = zero();
    chargeTierLag(lag, 1);
    expect(lag.project).toBe(0);
    expect(Math.abs(lag.element)).toBeGreaterThan(Math.abs(lag.capability));
    expect(Math.abs(lag.capability)).toBeGreaterThan(Math.abs(lag.domain));
    expect(Math.abs(lag.domain)).toBeGreaterThan(Math.abs(lag.project));
  });

  it("twists against the rotation: a lag, not a lead", () => {
    const lag = zero();
    chargeTierLag(lag, 1);
    expect(lag.element).toBeLessThan(0);
    const back = zero();
    chargeTierLag(back, -1);
    expect(back.element).toBeGreaterThan(0);
  });

  /*
   * `/gate-probe` — **this assertion was red before the third round of
   * 2026-08-18.** The twist existed only on the hand-drag path; programmatic pose
   * moves (click-to-reframe, 「Recenter」) rotated the four rings as one
   * frozen block. The same rotation behaving like a different object depending on
   * who started it is exactly what reads as "a JS animation".
   */
  it("twists on program motion too, but weaker than by hand", () => {
    const hand = zero();
    chargeTierLag(hand, 0.2);
    const program = zero();
    chargeTierLag(program, 0.2, DOME_POSE_LAG_SCALE);
    expect(program.element).not.toBe(0);
    expect(Math.abs(program.element)).toBeLessThan(Math.abs(hand.element));
    expect(program.element).toBeCloseTo(hand.element * DOME_POSE_LAG_SCALE, 12);
  });

  it("defaults the multiplier to 1, so a hand drag is 1:1 direct manipulation", () => {
    const a = zero();
    const b = zero();
    chargeTierLag(a, 0.37);
    chargeTierLag(b, 0.37, 1);
    expect(a).toEqual(b);
    expect(a.element).toBeCloseTo(0.37 * DOME_TIER_LAG.element, 12);
  });

  it("accumulates the charge every frame while damping unwinds it separately", () => {
    const lag = zero();
    chargeTierLag(lag, 0.1);
    const once = lag.element;
    chargeTierLag(lag, 0.1);
    expect(lag.element).toBeCloseTo(once * 2, 12);
  });
});

describe("dome handle: where a drag rotates and where it pans", () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };

  it("the centre is inside the handle, so a drag on the dome rotates", () => {
    expect(isInsideDomeGrip(bounds, 0, 0)).toBe(true);
  });

  /*
   * `/gate-probe` — **this assertion is why the rule exists.** Testing against
   * the bbox makes the four corners count as "on the object": empty black screen
   * that rotates when you drag it — the exact spot the owner pointed at. Only an
   * ellipse makes the test match what the eye sees. Reverting to a rectangular
   * test turns this red.
   */
  it("bbox corners are outside the handle, so a drag there pans the map", () => {
    expect(isInsideDomeGrip(bounds, 100, 50)).toBe(false);
    expect(isInsideDomeGrip(bounds, -100, -50)).toBe(false);
  });

  it("axis edges are inside by the margin, so grabbing the dome rim never pans the map", () => {
    // With margin 1.08, 100% of the semi-axis is still inside; past 108% is outside.
    expect(isInsideDomeGrip(bounds, 100, 0)).toBe(true);
    expect(isInsideDomeGrip(bounds, 100 * DOME_GRIP_MARGIN + 1, 0)).toBe(false);
  });

  it("a far empty spot is always outside", () => {
    expect(isInsideDomeGrip(bounds, 900, 700)).toBe(false);
  });

  it("nothing drawn means outside, so the default (pan) wins without an object to judge", () => {
    expect(isInsideDomeGrip(null, 0, 0)).toBe(false);
    expect(isInsideDomeGrip({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 5, 5)).toBe(false);
  });

  it("a flat dome judges vertical by its own radius, not the horizontal one", () => {
    // A vertically very flat bbox: far horizontally is still inside, slightly off vertically is outside.
    const flat = { minX: -200, minY: -10, maxX: 200, maxY: 10 };
    expect(isInsideDomeGrip(flat, 150, 0)).toBe(true);
    expect(isInsideDomeGrip(flat, 0, 30)).toBe(false);
  });
});

describe("entry sweep is the single source of the drawn pose", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d", kind: "domain", x: 100, y: 0, parentId: "p" },
  ];

  it("the drawn pose differs from the raw pose while the sweep lives, and the frame follows the drawn one", () => {
    const model = buildDomeModel(nodes);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    runtime.yaw = 0.3;
    runtime.pitch = DOME_PITCH_DEFAULT;
    runtime.entryClock = 0;
    updateDomeFrame(runtime, nodes, () => 10);
    expect(runtime.drawPitch).toBeGreaterThan(runtime.pitch);
    expect(runtime.drawYaw).toBeLessThan(runtime.yaw);
    const off = runtime.frame.get("d")!;
    const drawn = projectDomeCoord(model, model.coords.get("d")!, runtime.drawYaw, runtime.drawPitch);
    expect(nodes[1].x + off.dx).toBeCloseTo(drawn.wx, 9);
    expect(nodes[1].y + off.dy).toBeCloseTo(drawn.wy, 9);
  });

  it("the drawn pose equals the raw pose once the sweep is spent", () => {
    const model = buildDomeModel(nodes);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    runtime.yaw = 0.3;
    runtime.entryClock = DOME_ENTRY_SWEEP_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    expect(runtime.drawPitch).toBeCloseTo(runtime.pitch, 9);
    expect(runtime.drawYaw).toBeCloseTo(runtime.yaw, 9);
  });

  /*
   * `/gate-probe` — simply setting `entryArmed = false` makes the drawn pose jump
   * in one frame: the screen jumps at the very moment the user touches it, which
   * breaks the contract this repo keeps consistently across camera, orbit, and
   * pose moves — a gesture takes over from where things are right now. This
   * assertion catches that jump.
   */
  it("folds the sweep into the pose on touch, keeping the drawn pose byte for byte", () => {
    const model = buildDomeModel(nodes);
    const runtime = createDomeRuntime(model);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    runtime.yaw = 0.3;
    runtime.entryClock = 400;
    updateDomeFrame(runtime, nodes, () => 10);
    const beforeYaw = runtime.drawYaw;
    const beforePitch = runtime.drawPitch;

    commitDomeEntrySweep(runtime);
    updateDomeFrame(runtime, nodes, () => 10);

    expect(runtime.entryArmed).toBe(false);
    expect(runtime.drawYaw).toBeCloseTo(beforeYaw, 9);
    expect(runtime.drawPitch).toBeCloseTo(beforePitch, 9);
    // The target must move too, or smoothing drags back toward the old one.
    expect(runtime.yawTarget).toBeCloseTo(runtime.yaw, 9);
    expect(runtime.pitchTarget).toBeCloseTo(runtime.pitch, 9);
  });

  it("does nothing when already disarmed, or a second call adds the angle twice", () => {
    const model = buildDomeModel(nodes);
    const runtime = createDomeRuntime(model);
    runtime.entryClock = 400;
    commitDomeEntrySweep(runtime);
    const yaw = runtime.yaw;
    const pitch = runtime.pitch;
    commitDomeEntrySweep(runtime);
    expect(runtime.yaw).toBe(yaw);
    expect(runtime.pitch).toBe(pitch);
  });
});

describe("release projection lands inertia where it means something", () => {
  it("derives the projection distance from the damping constant: velocity times total travel factor", () => {
    // Σ v·d^t dt = v / (−ln d). Change the damping and this value must follow.
    expect(projectOrbitLanding(1, 0.002)).toBeCloseTo(1 + 0.002 * ORBIT_DECAY_TRAVEL_MS, 9);
    expect(projectOrbitLanding(1, 0), "zero velocity stays in place").toBe(1);
  });

  it("domain meridian puts the domain in front (minimum depth) at that angle", () => {
    const nodes: DomeInputNode[] = [
      { id: "p", kind: "project", x: 0, y: 0, parentId: null },
      { id: "d1", kind: "domain", x: 100, y: 0, parentId: "p" },
      { id: "d2", kind: "domain", x: -100, y: 0, parentId: "p" },
      { id: "d3", kind: "domain", x: 0, y: 100, parentId: "p" },
    ];
    const model = buildDomeModel(nodes);
    const yaws = domeFacingYaws(model);
    expect(yaws).toHaveLength(3);
    // Check which domain is actually nearest at each candidate yaw — if the
    // derivation (yaw = −π/2 − θ) is wrong, this turns red.
    for (const yaw of yaws) {
      let minZ = Infinity;
      for (const id of ["d1", "d2", "d3"]) {
        const p = projectDomeCoord(model, model.coords.get(id)!, yaw, DOME_PITCH_DEFAULT);
        if (p.z < minZ) minZ = p.z;
      }
      // A node standing front-on must be a full ring radius toward the camera in depth.
      expect(minZ).toBeLessThan(0);
    }
  });

  it("aims inside the window and does nothing outside it", () => {
    const candidates = [0, 1, 2];
    expect(snapOrbitLanding(1.05, candidates, 0.14)).toBeCloseTo(1, 9);
    expect(snapOrbitLanding(1.5, candidates, 0.14)).toBeNull();
  });

  it("treats candidates as 2pi periodic, folding many turns to the nearest equivalent angle", () => {
    const snapped = snapOrbitLanding(1 + 4 * Math.PI + 0.03, [1], 0.14);
    expect(snapped).not.toBeNull();
    expect(snapped! - (1 + 4 * Math.PI)).toBeCloseTo(0, 9);
  });

  it("keeps the default window narrow, or the app moves the place the person set", () => {
    expect(ORBIT_SNAP_WINDOW_RAD).toBeLessThan(0.25);
  });

  /*
   * `/gate-probe` — solving τ back out of the release velocity is what makes this
   * feature velocity-continuous. Revert to a fixed τ and the speed jumps on the
   * frame the hand lifts. This assertion pins the derivation: over the same
   * distance, a faster release must give a shorter τ.
   */
  it("derives tau from the release velocity: a faster release is shorter", () => {
    const slow = orbitSnapTauMs(0.2, 0.0005);
    const fast = orbitSnapTauMs(0.2, 0.002);
    expect(fast).toBeLessThan(slow);
    expect(orbitSnapTauMs(0.2, 0.002)).toBeCloseTo(100, 6);
  });

  it("keeps the arrival threshold below 1px and above 0, since exponential approach never arrives", () => {
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeGreaterThan(0);
    // 1px on the outer ring ≈ 0.008rad (the measured conversion in the doc-block).
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeLessThan(0.008);
  });

  it("clamps tau to its range, preventing both a teleport and a spin that never stops", () => {
    expect(orbitSnapTauMs(0.001, 1)).toBe(ORBIT_SNAP_TAU_MIN_MS);
    expect(orbitSnapTauMs(10, 0.00001)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    // With the opposite sign (target behind the direction of travel) the derivation is negative and falls to the cap.
    expect(orbitSnapTauMs(-0.2, 0.002)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    expect(orbitSnapTauMs(0.2, 0)).toBe(ORBIT_SNAP_TAU_MAX_MS);
  });
});

/* ── Placement basis: containment (dome) vs connection (cloud) ───────────── */

describe("coupling cloud lets relations decide positions", () => {
  /** Two groups linked only internally, joined to each other by a single bridge. */
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "a1", kind: "domain", x: 10, y: 0, parentId: "p" },
    { id: "a2", kind: "capability", x: 20, y: 10, parentId: "a1" },
    { id: "a3", kind: "capability", x: 30, y: 20, parentId: "a1" },
    { id: "b1", kind: "domain", x: -10, y: 0, parentId: "p" },
    { id: "b2", kind: "capability", x: -20, y: 10, parentId: "b1" },
    { id: "b3", kind: "capability", x: -30, y: 20, parentId: "b1" },
  ];
  const edges = [
    { sourceId: "a1", targetId: "a2" },
    { sourceId: "a1", targetId: "a3" },
    { sourceId: "a2", targetId: "a3" },
    { sourceId: "b1", targetId: "b2" },
    { sourceId: "b1", targetId: "b3" },
    { sourceId: "b2", targetId: "b3" },
    { sourceId: "a1", targetId: "b1" },
  ];

  const dist = (m: ReturnType<typeof buildDomeModel>, x: string, y: string) => {
    const a = m.coords.get(x)!;
    const b = m.coords.get(y)!;
    return Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz);
  };

  it("defaults to ownership, the plain dome without the option", () => {
    expect(buildDomeModel(nodes).arrangement).toBe("ownership");
  });

  /*
   * `/gate-probe` — **the first implementation died here.** Relaxing only the
   * bearing while pinning tier height drew the owner's verdict *"What I wanted was a completely different shape."* The cloud
   * only reads differently from the dome if connection decides height as well.
   * Pin the tiers again and this assertion turns red.
   */
  it("releases height from the kind plane, where the shape departs from the dome", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    expect(cloud.arrangement).toBe("coupling");
    const offPlane = nodes.filter((n) => {
      const c = cloud.coords.get(n.id)!;
      return Math.abs(c.py - DOME_PLANE[n.kind].y) > 1;
    });
    expect(offPlane.length, "every node still sits on its kind plane, so this is only a dome variant").toBeGreaterThan(
      nodes.length / 2,
    );
  });

  it("places members of one group closer than members of different groups", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    const within = (dist(cloud, "a2", "a3") + dist(cloud, "b2", "b3")) / 2;
    const across = (dist(cloud, "a2", "b2") + dist(cloud, "a3", "b3")) / 2;
    expect(within, `within group ${within.toFixed(1)}, across groups ${across.toFixed(1)}`).toBeLessThan(across);
  });

  it("leaves no overlap, so repulsion does work", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id >= b.id) continue;
        expect(dist(cloud, a.id, b.id), `${a.id} and ${b.id} overlap`).toBeGreaterThan(1);
      }
    }
  });

  it("centres the mass at the origin, or a small rotation swings the cloud off screen", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (const c of cloud.coords.values()) {
      mx += c.px;
      my += c.py;
      mz += c.pz;
    }
    const n = cloud.coords.size;
    expect(Math.hypot(mx / n, my / n, mz / n)).toBeLessThan(1e-6);
  });

  it("keeps the radius on the dome scale, so camera fit and fog apply alike to both layouts", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    let maxR = 0;
    for (const c of cloud.coords.values()) maxR = Math.max(maxR, Math.hypot(c.px, c.py, c.pz));
    expect(maxR).toBeCloseTo(DOME_FIT_RADIUS, 6);
  });

  it("is deterministic: the same input gives the same bytes (no randomness)", () => {
    const a = buildDomeModel(nodes, { arrangement: "coupling", edges });
    const b = buildDomeModel(nodes, { arrangement: "coupling", edges });
    for (const [id, ca] of a.coords) {
      const cb = b.coords.get(id)!;
      expect(cb.px).toBe(ca.px);
      expect(cb.py).toBe(ca.py);
      expect(cb.pz).toBe(ca.pz);
    }
  });

  it("keeps the ownership layout without relations, having no ground to move it", () => {
    const plain = buildDomeModel(nodes);
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges: [] });
    for (const [id, c] of plain.coords) {
      expect(cloud.coords.get(id)).toEqual(c);
    }
  });

  it("fixes the iteration count, or each machine draws a different picture", () => {
    expect(CLOUD_ITERATIONS).toBeGreaterThan(50);
  });

  it("draws no latitude ring for the cloud, which has no such coordinate system", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "coupling", edges }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    expect(runtime.rings).toHaveLength(0);
  });


});

describe("cone tree places children on a circle directly below the parent", () => {
  /** 1 project · 3 domains of unequal size · capabilities · elements. */
  const tree: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d-big", kind: "domain", x: 0, y: 0, parentId: "p" },
    { id: "d-mid", kind: "domain", x: 0, y: 0, parentId: "p" },
    { id: "d-one", kind: "domain", x: 0, y: 0, parentId: "p" },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `c-big-${i}`, kind: "capability" as const, x: 0, y: 0, parentId: "d-big" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `c-mid-${i}`, kind: "capability" as const, x: 0, y: 0, parentId: "d-mid" })),
    { id: "c-one", kind: "capability", x: 0, y: 0, parentId: "d-one" },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `e-big-0-${i}`, kind: "element" as const, x: 0, y: 0, parentId: "c-big-0" })),
    { id: "e-one", kind: "element", x: 0, y: 0, parentId: "c-one" },
    { id: "e-direct", kind: "element", x: 0, y: 0, parentId: "d-mid" },
    { id: "e-lost", kind: "element", x: 0, y: 0, parentId: "nowhere" },
  ];
  const horizontal = (a: { px: number; pz: number }, b: { px: number; pz: number }) => Math.hypot(a.px - b.px, a.pz - b.pz);

  it("keeps children within the parent (px, pz) circle, directly below rather than in a sector", () => {
    const m = buildDomeModel(tree);
    for (const n of tree) {
      if (n.parentId === null || n.parentId === "nowhere") continue;
      const parent = m.coords.get(n.parentId)!;
      const at = m.coords.get(n.id)!;
      // Never farther from its parent than the widest base times the stagger —
      // except a domain, which rests on the project's ring.
      expect(horizontal(at, parent)).toBeLessThanOrEqual((n.kind === "domain" ? DOME_PLANE.domain.r : 64 * 1.12) + 1e-9);
      // Height is still one value per kind — the in-plane drag contract.
      expect(at.py).toBe(DOME_PLANE[n.kind].y);
    }
  });

  it("an only child is a stem: the parent (px, pz) with no floor circle", () => {
    const m = buildDomeModel(tree);
    expect(horizontal(m.coords.get("c-one")!, m.coords.get("d-one")!)).toBeCloseTo(0, 9);
    expect(horizontal(m.coords.get("e-one")!, m.coords.get("c-one")!)).toBeCloseTo(0, 9);
    expect(m.circles.some((c) => c.kind === "capability" && Math.abs(c.cx - m.coords.get("d-one")!.px) < 1e-9 && Math.abs(c.cz - m.coords.get("d-one")!.pz) < 1e-9)).toBe(false);
  });

  it("gives one floor circle per parent with two or more children; the project floor is the domain ring", () => {
    const m = buildDomeModel(tree);
    const domainRing = m.circles.filter((c) => c.kind === "domain");
    expect(domainRing).toHaveLength(1);
    expect(domainRing[0].r).toBe(DOME_PLANE.domain.r);
    // d-big (6 children) and d-mid (3 children) get capability bases; d-one does not.
    expect(m.circles.filter((c) => c.kind === "capability")).toHaveLength(2);
    // c-big-0 (9 elements) gets an element base; c-one does not.
    const elementBases = m.circles.filter((c) => c.kind === "element");
    expect(elementBases).toHaveLength(1);
    const cBig0 = m.coords.get("c-big-0")!;
    expect(elementBases[0].cx).toBeCloseTo(cBig0.px, 9);
    expect(elementBases[0].cz).toBeCloseTo(cBig0.pz, 9);
    expect(elementBases[0].y).toBe(DOME_PLANE.element.y);
    for (const c of m.circles) expect(c.r).toBeGreaterThan(0);
  });

  it("sizes a domain sector by its subtree, so a larger domain gets a wider angle", () => {
    const m = buildDomeModel(tree);
    const bearing = (id: string) => {
      const c = m.coords.get(id)!;
      return Math.atan2(c.pz, c.px);
    };
    const gap = (a: number, b: number) => {
      const d = Math.abs(a - b) % (Math.PI * 2);
      return d > Math.PI ? Math.PI * 2 - d : d;
    };
    // Sorted by id: d-big, d-mid, d-one. The big domain's neighbours sit farther from it.
    expect(gap(bearing("d-big"), bearing("d-mid"))).toBeGreaterThan(gap(bearing("d-mid"), bearing("d-one")));
  });

  it("keeps sibling cones apart: floor circles are farther apart than their radii sum", () => {
    const m = buildDomeModel(tree);
    const bases = m.circles.filter((c) => c.kind === "capability");
    for (let i = 0; i < bases.length; i += 1) {
      for (let j = i + 1; j < bases.length; j += 1) {
        const d = Math.hypot(bases[i].cx - bases[j].cx, bases[i].cz - bases[j].cz);
        expect(d).toBeGreaterThan(bases[i].r + bases[j].r);
      }
    }
  });

  it("keeps the footprint inside the old floor ring, so camera fit, fog and handle contracts hold", () => {
    const m = buildDomeModel(tree);
    for (const c of m.coords.values()) {
      expect(Math.hypot(c.px, c.pz)).toBeLessThanOrEqual(DOME_FIT_RADIUS * 1.1);
    }
  });

  it("gives a node whose parent is outside the model a hashed bearing on its own plane, dropping none", () => {
    const m = buildDomeModel(tree);
    const lost = m.coords.get("e-lost")!;
    expect(lost.py).toBe(DOME_PLANE.element.y);
    expect(Math.hypot(lost.px, lost.pz)).toBeCloseTo(DOME_PLANE.element.r, 6);
  });

  it("is deterministic: the same input keeps coordinates and floor circles", () => {
    const a = buildDomeModel(tree);
    const b = buildDomeModel(tree);
    expect([...a.coords.entries()]).toEqual([...b.coords.entries()]);
    expect(a.circles).toEqual(b.circles);
  });


});

describe("layout morph moves nodes instead of cutting", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d1", kind: "domain", x: 100, y: 0, parentId: "p" },
    { id: "d2", kind: "domain", x: -100, y: 0, parentId: "p" },
    { id: "c1", kind: "capability", x: 120, y: 40, parentId: "d1" },
    { id: "c2", kind: "capability", x: 140, y: 40, parentId: "d1" },
  ];
  const edges = [
    { sourceId: "d1", targetId: "c1" },
    { sourceId: "d2", targetId: "c2" },
  ];
  const drawnOffset = (runtime: DomeRuntime, id: string) => {
    const f = runtime.frame.get(id)!;
    return { dx: f.dx, dy: f.dy };
  };

  it("keeps middle frames between from and to and clears morph at the end", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10, 0);
    const before = drawnOffset(runtime, "c2");
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    beginDomeMorph(runtime, cloud, 1000, 750);
    expect(runtime.morph).not.toBeNull();
    updateDomeFrame(runtime, nodes, () => 10, 1000 + 375);
    const mid = drawnOffset(runtime, "c2");
    updateDomeFrame(runtime, nodes, () => 10, 1000 + 750);
    const after = drawnOffset(runtime, "c2");
    expect(runtime.morph).toBeNull();
    const dist = (a: { dx: number; dy: number }, b: { dx: number; dy: number }) => Math.hypot(a.dx - b.dx, a.dy - b.dy);
    expect(dist(before, after)).toBeGreaterThan(1);
    expect(dist(before, mid)).toBeLessThan(dist(before, after));
    expect(dist(mid, after)).toBeLessThan(dist(before, after));
  });

  it("fades the old floor circles out and the new ones in during the morph", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10, 0);
    const treeRings = runtime.rings.length;
    expect(treeRings).toBeGreaterThan(0);
    beginDomeMorph(runtime, buildDomeModel(nodes, { arrangement: "coupling", edges }), 1000, 750);
    updateDomeFrame(runtime, nodes, () => 10, 1000 + 375);
    // The cloud has no rings, so every ring drawn now is a fading tree ring.
    expect(runtime.rings).toHaveLength(treeRings);
    for (const ring of runtime.rings) {
      expect(ring.a).toBeGreaterThan(0);
      expect(ring.a).toBeLessThan(1);
    }
    updateDomeFrame(runtime, nodes, () => 10, 1000 + 750);
    expect(runtime.rings).toHaveLength(0);
  });

  it("a duration of 0 is a cut, for reduced motion", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    beginDomeMorph(runtime, buildDomeModel(nodes, { arrangement: "coupling", edges }), 1000, 0);
    expect(runtime.morph).toBeNull();
    expect(runtime.model.arrangement).toBe("coupling");
  });
});

describe("off-screen settling lets the 2D map sleep again after a 3D visit", () => {
  it("rests every remaining motion state", () => {
    const runtime = createDomeRuntime(
      buildDomeModel([{ id: "p", kind: "project", x: 0, y: 0, parentId: null }]),
    );
    runtime.poseTween = { startYaw: 0, startPitch: 0, targetYaw: 1, targetPitch: 0.3, startMs: 0, durationMs: 750 };
    runtime.lag.element = -0.036;
    runtime.yawVel = 0.01;
    runtime.yawSnap = 1.2;
    runtime.entryArmed = true;
    runtime.pitch = DOME_PITCH_MAX + 0.05;
    settleDomeRuntimeOffscreen(runtime);
    expect(runtime.poseTween).toBeNull();
    expect(runtime.lag).toEqual({ project: 0, domain: 0, capability: 0, element: 0 });
    expect(runtime.yawVel).toBe(0);
    expect(runtime.yawSnap).toBeNull();
    expect(runtime.entryArmed).toBe(false);
    expect(runtime.morph).toBeNull();
    expect(runtime.pitch).toBe(DOME_PITCH_MAX);
    expect(runtime.pitchTarget).toBe(runtime.pitch);
  });
});

describe("flick coast cap: inertia past half a turn carries no information", () => {
  it("keeps a velocity under the cap and clips one above it to a half-turn coast", () => {
    expect(clampOrbitReleaseVelocity(0.001)).toBe(0.001);
    expect(clampOrbitReleaseVelocity(-0.001)).toBe(-0.001);
    const capped = clampOrbitReleaseVelocity(0.05);
    expect(capped).toBeLessThan(0.05);
    expect(Math.abs(projectOrbitLanding(0, capped))).toBeCloseTo(ORBIT_COAST_MAX_RAD, 9);
    expect(projectOrbitLanding(0, clampOrbitReleaseVelocity(-0.05))).toBeCloseTo(-ORBIT_COAST_MAX_RAD, 9);
  });

  it("caps at half a turn, past which the front face is lost", () => {
    expect(ORBIT_COAST_MAX_RAD).toBeCloseTo(Math.PI, 12);
  });
});

describe("cloud relaxation slices give the same bytes when cut inside the pair loop", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, kind: "domain" as const, x: i * 40, y: 0, parentId: "p" })),
    ...Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, kind: "capability" as const, x: i * 7, y: 30 + (i % 5) * 9, parentId: `d${i % 6}` })),
  ];
  const edges = Array.from({ length: 90 }, (_, i) => ({ sourceId: `c${i % 60}`, targetId: `c${(i * 7 + 3) % 60}` }));

  it("gives the same coordinates run in many tiny budgets as run at once", () => {
    const whole = buildDomeModel(nodes, { arrangement: "coupling", edges });
    const build = beginDomeModelBuild(nodes, { arrangement: "coupling", edges });
    let calls = 0;
    while (!build.step!(0.02)) {
      calls += 1;
      if (calls > 100000) throw new Error("slicing never finishes");
    }
    // A 0.02 ms budget has to pause inside the pair loop many times.
    expect(calls).toBeGreaterThan(10);
    for (const [id, coord] of whole.coords) expect(build.model.coords.get(id)).toEqual(coord);
  });
});

describe("Strata — four labelled planes, and drops that cannot cross (2026-09-06)", () => {
  /** 1 project · 2 domains · 3 capabilities · 2 elements · 1 element with no parent in the model. */
  const tree: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d-a", kind: "domain", x: -200, y: 0, parentId: "p" },
    { id: "d-b", kind: "domain", x: 200, y: 0, parentId: "p" },
    { id: "c-a1", kind: "capability", x: -260, y: 120, parentId: "d-a" },
    { id: "c-a2", kind: "capability", x: -180, y: 200, parentId: "d-a" },
    { id: "c-b1", kind: "capability", x: 240, y: 140, parentId: "d-b" },
    { id: "e-a1", kind: "element", x: -300, y: 260, parentId: "c-a1" },
    { id: "e-b1", kind: "element", x: 280, y: 240, parentId: "c-b1" },
    { id: "e-loose", kind: "element", x: 40, y: 380, parentId: null },
  ];
  const bearing = (c: DomeCoord) => Math.atan2(c.pz, c.px);
  const radius = (c: DomeCoord) => Math.hypot(c.px, c.pz);

  it("puts height on the tier and nothing else — no per-parent nesting", () => {
    const { coords } = buildStrataTargets(tree);
    for (const node of tree) {
      expect(coords.get(node.id)!.py).toBe(DOME_PLANE[node.kind].y);
    }
  });

  it("gives an only child its parent's whole sector, so the drop is exactly vertical", () => {
    const chain: DomeInputNode[] = [
      { id: "p", kind: "project", x: 0, y: 0, parentId: null },
      { id: "d", kind: "domain", x: 0, y: 0, parentId: "p" },
      { id: "c", kind: "capability", x: 0, y: 0, parentId: "d" },
      { id: "e", kind: "element", x: 0, y: 0, parentId: "c" },
    ];
    const { coords } = buildStrataTargets(chain);
    const d = bearing(coords.get("d")!);
    expect(bearing(coords.get("c")!)).toBeCloseTo(d, 12);
    expect(bearing(coords.get("e")!)).toBeCloseTo(d, 12);
    // A lone project is the axis the structure stands on.
    expect(radius(coords.get("p")!)).toBe(0);
  });

  it("keeps a whole subtree inside its own arc, so two domains never share a bearing band", () => {
    const { coords } = buildStrataTargets(tree);
    // Bearings measured from where the walk starts (−π/2), so an arc that
    // straddles ±π is still one interval rather than two.
    const arc = (id: string) => (bearing(coords.get(id)!) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
    const spanOf = (rootId: string) => {
      const seen: number[] = [];
      const walk = (id: string) => {
        seen.push(arc(id));
        for (const child of tree.filter((n) => n.parentId === id)) walk(child.id);
      };
      walk(rootId);
      return { min: Math.min(...seen), max: Math.max(...seen) };
    };
    const a = spanOf("d-a");
    const b = spanOf("d-b");
    expect(a.max).toBeLessThan(b.min);
  });

  it("draws no two containment drops that cross, seen from above", () => {
    const { coords } = buildStrataTargets(tree);
    const drops = tree
      .filter((n) => n.parentId !== null && coords.has(n.parentId))
      .map((n) => {
        const a = coords.get(n.parentId!)!;
        const b = coords.get(n.id)!;
        return { ax: a.px, az: a.pz, bx: b.px, bz: b.pz, ids: [n.parentId!, n.id] };
      });
    const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
      Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
    let crossings = 0;
    for (let i = 0; i < drops.length; i += 1) {
      for (let j = i + 1; j < drops.length; j += 1) {
        const s = drops[i];
        const t = drops[j];
        // Drops that share a node meet at it by construction; meeting is not crossing.
        if (s.ids.some((id) => t.ids.includes(id))) continue;
        const d1 = side(s.ax, s.az, s.bx, s.bz, t.ax, t.az);
        const d2 = side(s.ax, s.az, s.bx, s.bz, t.bx, t.bz);
        const d3 = side(t.ax, t.az, t.bx, t.bz, s.ax, s.az);
        const d4 = side(t.ax, t.az, t.bx, t.bz, s.bx, s.bz);
        if (d1 !== d2 && d3 !== d4) crossings += 1;
      }
    }
    expect(drops.length).toBeGreaterThan(5);
    expect(crossings).toBe(0);
  });

  it("drops an unparented node onto its plane's outer rim, outside where placed nodes sit", () => {
    const { coords } = buildStrataTargets(tree);
    expect(radius(coords.get("e-loose")!)).toBeCloseTo(DOME_PLANE.element.r, 9);
    expect(radius(coords.get("e-a1")!)).toBeLessThan(DOME_PLANE.element.r);
  });

  it("emits one named ring per populated plane, and none for a level this vault does not have", () => {
    const { circles } = buildStrataTargets(tree);
    expect(circles.map((c) => c.kind)).toEqual(["project", "domain", "capability", "element"]);
    for (const circle of circles) {
      expect(circle.named).toBe(true);
      expect(circle.cx).toBe(0);
      expect(circle.cz).toBe(0);
      expect(circle.y).toBe(DOME_PLANE[circle.kind].y);
    }
    expect(circles[0].r).toBeGreaterThan(0); // the project plane needs a rim the apex never had
    const noElements = buildStrataTargets(tree.filter((n) => n.kind !== "element"));
    expect(noElements.circles.map((c) => c.kind)).toEqual(["project", "domain", "capability"]);
  });

  it("is deterministic — the same vault draws the same picture", () => {
    const first = buildStrataTargets(tree);
    const second = buildStrataTargets([...tree].reverse());
    for (const node of tree) {
      expect(second.coords.get(node.id)).toEqual(first.coords.get(node.id));
    }
  });

  it("interleaves a crowded parent's children on two radii rather than fusing them on one", () => {
    const crowded: DomeInputNode[] = [
      { id: "p", kind: "project", x: 0, y: 0, parentId: null },
      { id: "d", kind: "domain", x: 0, y: 0, parentId: "p" },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `c-${i}`,
        kind: "capability" as const,
        x: 0,
        y: 0,
        parentId: "d",
      })),
    ];
    const { coords } = buildStrataTargets(crowded);
    const radii = new Set(
      Array.from({ length: 12 }, (_, i) => radius(coords.get(`c-${i}`)!).toFixed(6)),
    );
    expect(radii.size).toBe(2);
  });

  it("orders siblings by the barycenter of their relations, so dependency arcs stop crossing", () => {
    /*
     * Two domains, two capabilities each, and one relation from each capability
     * on the left to its counterpart on the right. In id order the two arcs
     * interleave and cross exactly once; the barycenter sweep swaps the left
     * pair inside its own sector — it never leaves that sector — and the arcs
     * nest instead. This is the one-sided crossing reduction of the Sugiyama
     * framework with a circular key (Bachmaier, IEEE TVCG 13(3), 2007).
     */
    const pair: DomeInputNode[] = [
      { id: "p", kind: "project", x: 0, y: 0, parentId: null },
      { id: "d-a", kind: "domain", x: 0, y: 0, parentId: "p" },
      { id: "d-b", kind: "domain", x: 0, y: 0, parentId: "p" },
      { id: "c-a1", kind: "capability", x: 0, y: 0, parentId: "d-a" },
      { id: "c-a2", kind: "capability", x: 0, y: 0, parentId: "d-a" },
      { id: "c-b1", kind: "capability", x: 0, y: 0, parentId: "d-b" },
      { id: "c-b2", kind: "capability", x: 0, y: 0, parentId: "d-b" },
    ];
    const relations = [
      { sourceId: "c-a1", targetId: "c-b1" },
      { sourceId: "c-a2", targetId: "c-b2" },
    ];
    /** Do the two relation chords cross, seen from above? */
    const crosses = (coords: ReadonlyMap<string, DomeCoord>): boolean => {
      const side = (p: DomeCoord, q: DomeCoord, r: DomeCoord) =>
        Math.sign((q.px - p.px) * (r.pz - p.pz) - (q.pz - p.pz) * (r.px - p.px));
      const [e1, e2] = relations.map((r) => [coords.get(r.sourceId)!, coords.get(r.targetId)!] as const);
      return (
        side(e1[0], e1[1], e2[0]) !== side(e1[0], e1[1], e2[1]) &&
        side(e2[0], e2[1], e1[0]) !== side(e2[0], e2[1], e1[1])
      );
    };
    expect(crosses(buildStrataTargets(pair).coords), "the id order is the crossing one").toBe(true);
    expect(crosses(buildStrataTargets(pair, relations).coords)).toBe(false);
    // …and the reorder stayed inside the sector: both capabilities are still on
    // their own domain's side of the disc.
    const { coords } = buildStrataTargets(pair, relations);
    const arc = (id: string) =>
      (Math.atan2(coords.get(id)!.pz, coords.get(id)!.px) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
    expect(Math.max(arc("c-a1"), arc("c-a2"))).toBeLessThan(Math.min(arc("c-b1"), arc("c-b2")));
  });



  it("gives its plane rings their own base opacity, and leaves the cone's bases on theirs", () => {
    expect(domeRingAlphaFor("strata")).toBe(DOME_STRATA_RING_ALPHA);
    // Below 1: at full ink the four ellipses read as the subject rather than as
    // the stage (measured 2026-09-06 — see the constant's doc-block).
    expect(DOME_STRATA_RING_ALPHA).toBeLessThan(1);
    expect(domeRingAlphaFor("ownership")).toBe(DOME_RING_ALPHA);
    expect(domeRingAlphaFor("coupling")).toBe(DOME_RING_ALPHA);
  });

  it("names its plane rings and leaves the cone's bases unnamed", () => {
    const strata = buildDomeModel(tree, { arrangement: "strata" });
    const runtime = createDomeRuntime(strata);
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, tree, () => 8);
    const named = runtime.rings.filter((r) => r.label !== null);
    expect(named.map((r) => r.kind)).toEqual(["project", "domain", "capability", "element"]);
    for (const ring of named) {
      // The anchor is the ring's screen-rightmost sample — stable under rotation.
      expect(ring.label!.wx).toBe(Math.max(...ring.points.map((p) => p.wx)));
    }
    const coneRuntime = createDomeRuntime(buildDomeModel(tree, { arrangement: "ownership" }));
    coneRuntime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(coneRuntime, tree, () => 8);
    expect(coneRuntime.rings.every((r) => r.label === null)).toBe(true);
  });
});

describe("domeEdgeFogAlpha x domeEdgeWidthFactor floors the depth ink of relation lines", () => {
  /**
   * The floor the two functions are tuned to, spelled out here rather than
   * imported: 0.62 alpha x 0.72 width. The module keeps both numbers private, so
   * this is the one place that states what they are supposed to multiply to, and
   * it fails the moment either moves without the other.
   */
  const INK_FLOOR = 0.4464;
  const ink = (u: number) => domeEdgeFogAlpha(u) * domeEdgeWidthFactor(u);

  it("leaves the near side unchanged, since the raw ramp product is already above the floor", () => {
    for (const u of [0, 0.05, 0.1]) {
      expect(domeEdgeFogAlpha(u)).toBeCloseTo(domeFogAlpha(u), 9);
      expect(domeEdgeWidthFactor(u)).toBeCloseTo(domeLineWidthFactor(u), 9);
    }
  });

  it("never lets ink fall below the floor at any depth", () => {
    for (let u = 0; u <= 1.0001; u += 0.05) {
      expect(ink(u)).toBeGreaterThanOrEqual(INK_FLOOR - 1e-9);
    }
    // Before the floor the far end drew at 0.09 x 0.35 = 3.5% of the near end's
    // ink, and the owner's report was that the relations were invisible there.
    expect(domeFogAlpha(1) * domeLineWidthFactor(1)).toBeLessThan(0.04);
    expect(ink(1) / ink(0)).toBeGreaterThan(0.4);
  });

  it("decreases ink monotonically with depth and never exceeds the near value", () => {
    /*
     * The invariant is on the **product**, not on either factor. Past the
     * crossover the two trade against each other at a fixed total — the alpha
     * rises exactly as fast as the width falls — so asserting a falling alpha
     * would be asserting the wrong thing, while a rising product would mean a far
     * line drawn stronger than a near one.
     */
    let previous = Infinity;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const value = ink(u);
      expect(value).toBeLessThanOrEqual(ink(0) + 1e-9);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      expect(domeEdgeFogAlpha(u)).toBeLessThanOrEqual(1);
      previous = value;
    }
    // The width keeps a real falloff of its own rather than going flat.
    expect(domeEdgeWidthFactor(1)).toBeLessThan(domeEdgeWidthFactor(0));
  });

  it("leaves the node and ring ramps alone; the floor is for relation lines only", () => {
    // `domeFogAlpha` and `domeLineWidthFactor` are what the node fill, the rim and
    // the plane rings read; only the edge pass reads the floored pair.
    expect(domeFogAlpha(1)).toBeCloseTo(0.09, 9);
    expect(domeLineWidthFactor(1)).toBeCloseTo(0.35, 9);
    expect(domeFogAlpha(0.8)).toBeLessThan(domeEdgeFogAlpha(0.8));
  });
});

/**
 * **The resting line's device-pixel width floor.** The ink floor above holds
 * `alpha × width factor`, and that product only reaches the eye while the stroke
 * covers a device pixel; below that the rasteriser spreads it over two rows and
 * the peak collapses. So the floor is a device length, and the caller converts it
 * with the ratio it is actually rasterising at.
 */
describe("domeEdgeMinWidthPx", () => {
  it("asks for one device pixel, whatever the ratio", () => {
    expect(domeEdgeMinWidthPx(1) * 1).toBeCloseTo(DOME_EDGE_DEVICE_WIDTH_FLOOR, 10);
    expect(domeEdgeMinWidthPx(2) * 2).toBeCloseTo(DOME_EDGE_DEVICE_WIDTH_FLOOR, 10);
    expect(domeEdgeMinWidthPx(3) * 3).toBeCloseTo(DOME_EDGE_DEVICE_WIDTH_FLOOR, 10);
  });

  it("asks for more CSS width the coarser the screen is", () => {
    expect(domeEdgeMinWidthPx(1)).toBeGreaterThan(domeEdgeMinWidthPx(2));
  });

  it("falls back to ratio 1 — the widest floor — rather than to none", () => {
    expect(domeEdgeMinWidthPx(0)).toBe(domeEdgeMinWidthPx(1));
    expect(domeEdgeMinWidthPx(Number.NaN)).toBe(domeEdgeMinWidthPx(1));
    expect(domeEdgeMinWidthPx(-2)).toBe(domeEdgeMinWidthPx(1));
  });
});

/**
 * **Would the chrome on the canvas's edge cover a node?** (2026-09-26) — asked by the 3D fit
 * before it lets a drawing use the utility rail's column. The answer is read off the same
 * projection the fit frames, so a node the rect would cover is found wherever it projects.
 */
describe("domeReachesRect", () => {
  const model = buildDomeModel(NODES);
  const yaw = 0.55;
  const pitch = DOME_PITCH_DEFAULT;
  const bounds = domeWorldBounds(model, yaw, pitch)!;
  // A camera that puts the drawing's right extreme at x 900 on a 1000-wide canvas.
  const tscale = 1;
  const target = { tx: bounds.maxX - 400, ty: (bounds.minY + bounds.maxY) / 2, tscale };

  it("finds the node the rect stands on", () => {
    const column = { left: 880, right: 1000, top: 0, bottom: 800 };
    expect(domeReachesRect(model, yaw, pitch, target, 1000, 800, column, 0)).toBe(true);
  });

  it("reports a column the drawing stays out of as free", () => {
    const column = { left: 920, right: 1000, top: 0, bottom: 800 };
    expect(domeReachesRect(model, yaw, pitch, target, 1000, 800, column, 0)).toBe(false);
    // …until a node's disc is counted in.
    expect(domeReachesRect(model, yaw, pitch, target, 1000, 800, column, 24)).toBe(true);
  });

  it("only covers what stands inside its own height", () => {
    const tiles = { left: 880, right: 1000, top: -400, bottom: -300 };
    expect(domeReachesRect(model, yaw, pitch, target, 1000, 800, tiles, 0)).toBe(false);
  });
});

