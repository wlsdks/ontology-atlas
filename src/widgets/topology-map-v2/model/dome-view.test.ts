import { describe, expect, it } from "vitest";

import type { CameraAxes } from "../engine/camera";
import { worldToScreen } from "../ui/topology-camera-math";
import {
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
  DOME_EDGE_BOW,
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
  domeDetailFactor,
  domeEdgeControl,
  domeFogAlpha,
  domeHaloPx,
  domeLineWidthFactor,
  domeShellRadiusAtY,
  domeNearestYawTurn,
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

describe("dome-view — 높이·각도는 타입 사실을 나른다", () => {
  it("KIND_DEPTH 는 스파인 서열(project 0 → element 3) 그대로다", () => {
    expect(KIND_DEPTH.project).toBe(0);
    expect(KIND_DEPTH.domain).toBe(1);
    expect(KIND_DEPTH.capability).toBe(2);
    expect(KIND_DEPTH.element).toBe(3);
  });

  it("링 높이는 깊은 kind 일수록 낮다 — project 꼭짓점, element 바닥", () => {
    expect(DOME_PLANE.project.y).toBeGreaterThan(DOME_PLANE.domain.y);
    expect(DOME_PLANE.domain.y).toBeGreaterThan(DOME_PLANE.capability.y);
    expect(DOME_PLANE.capability.y).toBeGreaterThan(DOME_PLANE.element.y);
    expect(DOME_PLANE.project.r).toBe(0);
    expect(DOME_PLANE.domain.r).toBeLessThan(DOME_PLANE.capability.r);
    expect(DOME_PLANE.capability.r).toBeLessThan(DOME_PLANE.element.r);
  });

  it("깊이 안개는 히어로 램프다 — 가까움 1.0, 멂 0.09, 단조 감소", () => {
    expect(domeFogAlpha(0)).toBeCloseTo(1, 12);
    expect(domeFogAlpha(1)).toBeCloseTo(0.09, 12);
    expect(domeFogAlpha(0.5)).toBeLessThan(domeFogAlpha(0.25));
    expect(domeLineWidthFactor(0)).toBeCloseTo(0.9, 12);
    expect(domeLineWidthFactor(1)).toBeCloseTo(0.35, 12);
  });

  it("레이아웃은 결정론이고, 각도의 출처는 containment 부모다", () => {
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

describe("dome-view — 프레임 맵은 worldToScreen 과 등가다 (드로우/히트 단일 출처)", () => {
  it("worldToScreen(w + off) 는 돔 투영을 그대로 지난다 (램프 1)", () => {
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

  it("램프 0 이면 오프셋 0 · 배율 1 — 2D 와 동일", () => {
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

  it("조립 스태거 — project 가 먼저 서고 element 가 마지막에 선다", () => {
    expect(domeTierRamp(0, "project")).toBe(0);
    expect(domeTierRamp(300, "project")).toBeGreaterThan(domeTierRamp(300, "domain"));
    expect(domeTierRamp(500, "domain")).toBeGreaterThan(domeTierRamp(500, "capability"));
    expect(domeTierRamp(700, "capability")).toBeGreaterThan(domeTierRamp(700, "element"));
    for (const kind of KINDS) {
      expect(domeTierRamp(DOME_ASSEMBLE_TOTAL_MS, kind)).toBe(1);
    }
  });
});

describe("dome-view — 평면 내 역투영(3D 노드 드래그의 좌표 계약)", () => {
  it("solve(project(p)) 가 자기 평면 좌표로 돌아온다", () => {
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

  it("아래 시점(음수 pitch)에서도 solve(project(p)) 가 자기 평면 좌표로 돌아온다", () => {
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

  it("반경 상한 — 화면 밖으로 던져도 바닥 링 1.5× 안에서 방향만 유지한다", () => {
    const model = buildDomeModel(NODES);
    const solved = solveDomePlanePoint(model, DOME_PLANE.element.y, model.centerX + model.unit * 5000, model.centerY, 0.55, DOME_PITCH_DEFAULT);
    expect(solved).not.toBeNull();
    expect(Math.hypot(solved!.px, solved!.pz)).toBeLessThanOrEqual(DOME_PLANE.element.r * 1.5 + 1e-9);
  });

  it("수평선 퇴화 — 포인터가 평면 수평선을 넘어도 얼지 않고 반경 상한 안의 유한한 점을 낸다", () => {
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

  it("수평선 정점 — 분모가 정확히 0 인 포인터도 비-null (종전: null → 노드 동결)", () => {
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

  it("수평선 횡단 연속성 — 한 픽셀 옮겼는데 반대편 림으로 순간이동하지 않는다 (종전: 부호 뒤집힘)", () => {
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

describe("dome-view — 물성(관성·러버밴드·스프링)", () => {
  it("관성은 기하 감쇠로 줄다 임계 밑에서 0 으로 스냅한다", () => {
    let v = 0.002;
    for (let i = 0; i < 600; i++) v = decayOrbitVelocity(v, 16.7);
    expect(v).toBe(0);
    // dt-invariant — the same total time gives the same value regardless of how it is split into frames.
    const oneStep = decayOrbitVelocity(0.002, 100);
    let split = 0.002;
    for (let i = 0; i < 10; i++) split = decayOrbitVelocity(split, 10);
    expect(split).toBeCloseTo(oneStep, 12);
  });

  it("pitch 는 극점 직전까지 전각이다 — 옆면(0)·아래 시점(음수)이 열려 있다", () => {
    // Owner report, 2026-08-18: *"Looking up from below
    // doesn't work."* The 0.12–0.72 range inherited from the hero was dropped. The
    // only wall left is the pole (±π/2), where the screen's up direction flips.
    expect(DOME_PITCH_MAX).toBeCloseTo(Math.PI / 2 - 0.12, 12);
    expect(DOME_PITCH_MIN).toBeCloseTo(-(Math.PI / 2 - 0.12), 12);
    expect(clampDomePitch(0)).toBe(0); // Side pass — does not lock
    expect(clampDomePitch(-0.8)).toBe(-0.8); // Looking up from below — open
    expect(clampDomePitch(2)).toBe(DOME_PITCH_MAX);
    expect(clampDomePitch(-2)).toBe(DOME_PITCH_MIN);
  });

  it("pitch 러버밴드 — 1/4 저항이되 오버슛은 상한에서 멎는다(극점 뒤집힘 방지)", () => {
    expect(resistDomePitch(DOME_PITCH_MAX + 0.2)).toBeCloseTo(DOME_PITCH_MAX + 0.05, 12);
    expect(resistDomePitch(DOME_PITCH_MIN - 0.2)).toBeCloseTo(DOME_PITCH_MIN - 0.05, 12);
    // However hard you pull, the squash stops at 0.09 — even squashed it never passes π/2.
    expect(resistDomePitch(DOME_PITCH_MAX + 40)).toBeCloseTo(DOME_PITCH_MAX + 0.09, 12);
    expect(resistDomePitch(DOME_PITCH_MAX + 40)).toBeLessThan(Math.PI / 2);
    expect(resistDomePitch(DOME_PITCH_MIN - 40)).toBeCloseTo(DOME_PITCH_MIN - 0.09, 12);
    expect(resistDomePitch(0.3)).toBe(0.3);
  });

  it("드래그 스프링은 목표로 수렴한다 (임계감쇠 — 오버슛 없이 정착)", () => {
    const spring = { px: 0, pz: 0, vx: 0, vz: 0 };
    for (let i = 0; i < 200; i++) stepDomeDragSpring(spring, 100, -60, 16.7, 15);
    expect(spring.px).toBeCloseTo(100, 1);
    expect(spring.pz).toBeCloseTo(-60, 1);
    expect(Math.abs(spring.vx)).toBeLessThan(0.1);
  });

  it("domeWorldBounds 는 유한 bbox 를 낸다 (「제자리로」의 입력)", () => {
    const model = buildDomeModel(NODES);
    const bounds = domeWorldBounds(model, 0.55, DOME_PITCH_DEFAULT)!;
    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
  });

  it("updateDomeFrame 은 그려진 자리의 bbox 를 남긴다 — 팬 리쉬 앵커의 입력", () => {
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

describe("dome-view — 선택 리프레임·자율 회전 무장 (2026-08-18 2차)", () => {
  it("domeNearestYawTurn — 같은 각의 등가각 중 현재에 가장 가까운 쪽을 고른다", () => {
    const TAU = Math.PI * 2;
    expect(domeNearestYawTurn(0.55, 0.6)).toBeCloseTo(0.55, 12);
    expect(domeNearestYawTurn(0.55, 6.6)).toBeCloseTo(0.55 + TAU, 12);
    expect(domeNearestYawTurn(0.55, -5.5)).toBeCloseTo(0.55 - TAU, 12);
    // Never turns more than half a revolution.
    for (const cur of [-9, -2.2, 0, 3.3, 14]) {
      expect(Math.abs(domeNearestYawTurn(0.55, cur) - cur)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it("domeFocusYaw — 그 yaw 로 투영하면 노드가 돔의 앞면(최소 깊이)에 온다", () => {
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

  it("domeEgoWorldBounds — 모델에 있는 id 만으로 유한 bbox, 전부 없으면 null", () => {
    const model = buildDomeModel(NODES);
    const b = domeEgoWorldBounds(model, ["dom-a", "cap-a1", "ghost-id"], 0.55, DOME_PITCH_DEFAULT);
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThanOrEqual(b!.maxX);
    expect(Number.isFinite(b!.minY) && Number.isFinite(b!.maxY)).toBe(true);
    expect(domeEgoWorldBounds(model, ["ghost-id"], 0.55, DOME_PITCH_DEFAULT)).toBeNull();
  });

  it("새 런타임은 회전 무장 상태로, 자세 이동 없이 시작한다", () => {
    // The attract rotation is the default for a screen nobody has touched yet.
    // Disarming it on intervention (orbit, zoom, pinch, node drag, selection) is
    // the loop's and the pointer handlers' contract, not this one's.
    const runtime = createDomeRuntime(buildDomeModel(NODES));
    expect(runtime.spinArmed).toBe(true);
    expect(runtime.poseTween).toBeNull();
  });
});

describe("worldToScreen — 깊이 항이 없으면 출력이 종전과 동일하다 (하드 계약)", () => {
  it("기본 경로는 기존 두 줄 식 그대로다", () => {
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

  it("z=0 · lift=0 깊이 항은 기본 경로와 같은 좌표를 낸다", () => {
    const camera = cam(5, 9, 1.3);
    const flat = worldToScreen(camera, 800, 600, 123.4, -56.7);
    const zero = worldToScreen(camera, 800, 600, 123.4, -56.7, { z: 0, lift: 0, focal: DOME_FOCAL });
    expect(zero.x).toBeCloseTo(flat.x, 12);
    expect(zero.y).toBeCloseTo(flat.y, 12);
  });
});

/* ── 3D quality layer: shell · meridians · halo · latitude rings ─────────── */

describe("돔 껍질 옆모습 — 볼록해야 자오선이 생긴다", () => {
  it("꼭짓점 높이에서 0, 바닥 링 높이에서 바닥 반지름", () => {
    expect(domeShellRadiusAtY(DOME_PLANE.project.y)).toBeCloseTo(0, 6);
    expect(domeShellRadiusAtY(DOME_PLANE.element.y)).toBeCloseTo(DOME_PLANE.element.r, 6);
  });

  it("범위 밖은 양 끝으로 클램프된다 — 드래그로 평면 밖에 나간 노드도 해가 있다", () => {
    expect(domeShellRadiusAtY(DOME_PLANE.project.y + 500)).toBeCloseTo(0, 6);
    expect(domeShellRadiusAtY(DOME_PLANE.element.y - 500)).toBeCloseTo(DOME_PLANE.element.r, 6);
  });

  it("아래로 갈수록 단조 증가한다 — 껍질이 안으로 접히면 자오선이 뒤집힌다", () => {
    let prev = -1;
    for (let y = DOME_PLANE.project.y; y >= DOME_PLANE.element.y; y -= 4) {
      const r = domeShellRadiusAtY(y);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  /*
   * `/gate-probe` — **the first implementation died exactly here.** With the
   * shell as a linear interpolation between the four rings, the midpoint of a
   * radial chord already lies on the shell, so the bulge is 0 and the screen
   * shows a tent rather than a dome. The other assertions would have been green
   * through that: linear interpolation satisfies both monotonic increase and the
   * two endpoint values. Only convexity catches that failure.
   */
  it("링 사이에서 링 반지름보다 바깥에 있다 — 볼록(= 선형 보간이 아니다)", () => {
    expect(domeShellRadiusAtY(DOME_PLANE.domain.y)).toBeGreaterThan(DOME_PLANE.domain.r);
    expect(domeShellRadiusAtY(DOME_PLANE.capability.y)).toBeGreaterThan(DOME_PLANE.capability.r);
  });
});

describe("자오선 제어점 — 관계선이 돔 속을 가로지르지 않는다", () => {
  const model = {
    arrangement: "ownership" as const,
    centerX: 0,
    centerY: 0,
    unit: 1,
    circles: [],
    coords: new Map([
      ["apex", { px: 0, py: DOME_PLANE.project.y, pz: 0 }],
      ["ring", { px: DOME_PLANE.domain.r, py: DOME_PLANE.domain.y, pz: 0 }],
      ["ringOpposite", { px: -DOME_PLANE.domain.r, py: DOME_PLANE.domain.y, pz: 0 }],
    ]),
  };

  it("꼭짓점 → 링 관계선의 제어점이 현의 중점보다 바깥에 있다", () => {
    const control = domeEdgeControl(model, "apex", "ring");
    expect(control).not.toBeNull();
    const chordMidR = DOME_PLANE.domain.r / 2;
    expect(Math.hypot(control!.px, control!.pz)).toBeGreaterThan(chordMidR);
  });

  it("2차 베지어의 중점이 껍질에 닿는다 — 제어점을 2배로 미는 계약", () => {
    const control = domeEdgeControl(model, "apex", "ring")!;
    // At t=0.5 this is (A + 2C + B)/4.
    const midX = (0 + 2 * control.px + DOME_PLANE.domain.r) / 4;
    const midZ = (0 + 2 * control.pz + 0) / 4;
    const midY = (DOME_PLANE.project.y + 2 * control.py + DOME_PLANE.domain.y) / 4;
    expect(Math.hypot(midX, midZ)).toBeCloseTo(domeShellRadiusAtY(midY) * DOME_EDGE_BOW, 0);
  });

  it("마주 본 두 노드는 축을 관통하지 않는다 — 방위 합이 0 이면 휘지 않는다", () => {
    const control = domeEdgeControl(model, "ring", "ringOpposite");
    expect(control).not.toBeNull();
    // Exact antipodes give no push direction → the chord midpoint stands; no arbitrary direction is picked.
    expect(control!.px).toBeCloseTo(0, 6);
    expect(control!.pz).toBeCloseTo(0, 6);
  });

  it("좌표가 없는 노드 쌍은 null — 호출부가 2D 제어점으로 떨어진다", () => {
    expect(domeEdgeControl(model, "apex", "nope")).toBeNull();
  });
});

describe("깊이 헤일로 — 가까운 것이 먼 것을 가린다", () => {
  it("가까울수록 넓고 멀수록 0 으로 수렴한다", () => {
    expect(domeHaloPx(0)).toBeCloseTo(DOME_HALO_MAX_PX, 6);
    expect(domeHaloPx(1)).toBeCloseTo(0, 6);
    expect(domeHaloPx(0.3)).toBeGreaterThan(domeHaloPx(0.7));
  });

  it("범위 밖 입력을 클램프한다 — 정규화가 어긋난 프레임에서도 음수 폭이 안 나온다", () => {
    expect(domeHaloPx(-2)).toBeCloseTo(DOME_HALO_MAX_PX, 6);
    expect(domeHaloPx(9)).toBeCloseTo(0, 6);
  });
});

describe("먼 쪽 상세 램프 — 뒤쪽 반구의 부가 획만 깊이 연속으로 접는다", () => {
  it("앞쪽 반구는 정확히 1 이다 — 관찰자 쪽 픽셀은 한 자리도 달라질 수 없다", () => {
    expect(DOME_DETAIL_FADE_START).toBeGreaterThanOrEqual(0.5);
    for (let u = 0; u <= DOME_DETAIL_FADE_START + 1e-9; u += 0.01) {
      expect(domeDetailFactor(u)).toBe(1);
    }
  });

  it("END 이후 0, 사이는 단조 감소·중점 0.5 (smoothstep)", () => {
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

describe("위도 링 — 좌표계이지 데이터가 아니다", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d", kind: "domain", x: 100, y: 0, parentId: "p" },
    { id: "c", kind: "capability", x: 120, y: 40, parentId: "d" },
    { id: "e", kind: "element", x: 140, y: 80, parentId: "c" },
  ];

  it("링은 모델의 원뿔 바닥 원이다 — 한 줄기 사슬(p→d→c→e)에는 프로젝트 바닥 하나뿐", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    // d, c each have one child → radius 0 → no base circle; only the project's ring.
    expect(runtime.rings).toHaveLength(1);
    expect(runtime.rings[0].kind).toBe("domain");
    expect(runtime.rings[0].points).toHaveLength(DOME_RING_SAMPLES);
    expect(runtime.rings[0].a).toBeGreaterThan(0.99);
  });

  it("표본 수는 반지름에 비례하고 바닥 12 · 천장 DOME_RING_SAMPLES 이다", () => {
    expect(domeRingSampleCount(DOME_PLANE.domain.r)).toBe(DOME_RING_SAMPLES);
    expect(domeRingSampleCount(1)).toBe(12);
    expect(domeRingSampleCount(40)).toBeGreaterThan(12);
    expect(domeRingSampleCount(40)).toBeLessThan(DOME_RING_SAMPLES);
  });

  it("한 링 안에서 깊이가 갈린다 — 앞뒤가 같으면 링은 깊이 단서가 아니다", () => {
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

  it("조립 램프가 0 이면 링도 0 — 2D 에서는 그리지 않는다", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = 0;
    updateDomeFrame(runtime, nodes, () => 10);
    for (const ring of runtime.rings) expect(ring.a).toBeLessThanOrEqual(0);
  });

  it("링 잉크는 데이터 잉크 아래에 머문다 — 좌표계가 주목을 다투면 안 된다", () => {
    expect(DOME_RING_ALPHA).toBeLessThan(0.5);
  });
});

describe("티어 비틀림 — 손과 프로그램이 같은 함수를 쓴다", () => {
  const zero = () => ({ project: 0, domain: 0, capability: 0, element: 0 });

  it("깊은 티어일수록 더 뒤처진다 — 뒤집히면 위계가 거꾸로 읽힌다", () => {
    const lag = zero();
    chargeTierLag(lag, 1);
    expect(lag.project).toBe(0);
    expect(Math.abs(lag.element)).toBeGreaterThan(Math.abs(lag.capability));
    expect(Math.abs(lag.capability)).toBeGreaterThan(Math.abs(lag.domain));
    expect(Math.abs(lag.domain)).toBeGreaterThan(Math.abs(lag.project));
  });

  it("비틀림의 부호는 회전 반대편이다 — 뒤처짐이지 앞서감이 아니다", () => {
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
  it("프로그램 이동도 비틀림을 만든다 — 다만 손보다 약하게", () => {
    const hand = zero();
    chargeTierLag(hand, 0.2);
    const program = zero();
    chargeTierLag(program, 0.2, DOME_POSE_LAG_SCALE);
    expect(program.element).not.toBe(0);
    expect(Math.abs(program.element)).toBeLessThan(Math.abs(hand.element));
    expect(program.element).toBeCloseTo(hand.element * DOME_POSE_LAG_SCALE, 12);
  });

  it("배수 기본값은 1 — 손 드래그는 1:1 직접 조작이다", () => {
    const a = zero();
    const b = zero();
    chargeTierLag(a, 0.37);
    chargeTierLag(b, 0.37, 1);
    expect(a).toEqual(b);
    expect(a.element).toBeCloseTo(0.37 * DOME_TIER_LAG.element, 12);
  });

  it("충전은 누적된다 — 프레임마다 더해지고 감쇠가 따로 되감는다", () => {
    const lag = zero();
    chargeTierLag(lag, 0.1);
    const once = lag.element;
    chargeTierLag(lag, 0.1);
    expect(lag.element).toBeCloseTo(once * 2, 12);
  });
});

describe("돔 손잡이 — 어디를 끌면 돌리고 어디를 끌면 옮기나", () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };

  it("중심은 손잡이 안이다 — 돔 위 드래그는 회전", () => {
    expect(isInsideDomeGrip(bounds, 0, 0)).toBe(true);
  });

  /*
   * `/gate-probe` — **this assertion is why the rule exists.** Testing against
   * the bbox makes the four corners count as "on the object": empty black screen
   * that rotates when you drag it — the exact spot the owner pointed at. Only an
   * ellipse makes the test match what the eye sees. Reverting to a rectangular
   * test turns this red.
   */
  it("bbox 모서리는 손잡이 **밖**이다 — 거기서 끌면 지도가 따라온다", () => {
    expect(isInsideDomeGrip(bounds, 100, 50)).toBe(false);
    expect(isInsideDomeGrip(bounds, -100, -50)).toBe(false);
  });

  it("축 위 가장자리는 여백만큼 안이다 — 돔 테두리를 잡았는데 지도가 밀리면 안 된다", () => {
    // With margin 1.08, 100% of the semi-axis is still inside; past 108% is outside.
    expect(isInsideDomeGrip(bounds, 100, 0)).toBe(true);
    expect(isInsideDomeGrip(bounds, 100 * DOME_GRIP_MARGIN + 1, 0)).toBe(false);
  });

  it("먼 검은 자리는 언제나 밖이다", () => {
    expect(isInsideDomeGrip(bounds, 900, 700)).toBe(false);
  });

  it("그려진 것이 없으면 밖이다 — 판정할 물체가 없으면 기본값(팬)이 이긴다", () => {
    expect(isInsideDomeGrip(null, 0, 0)).toBe(false);
    expect(isInsideDomeGrip({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 5, 5)).toBe(false);
  });

  it("납작한 돔에서도 세로 판정이 가로를 따라가지 않는다 — 축마다 자기 반지름", () => {
    // A vertically very flat bbox: far horizontally is still inside, slightly off vertically is outside.
    const flat = { minX: -200, minY: -10, maxX: 200, maxY: 10 };
    expect(isInsideDomeGrip(flat, 150, 0)).toBe(true);
    expect(isInsideDomeGrip(flat, 0, 30)).toBe(false);
  });
});

describe("진입 스윕 — 그린 자세의 단일 출처", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d", kind: "domain", x: 100, y: 0, parentId: "p" },
  ];

  it("스윕이 살아 있으면 그린 자세가 raw 자세와 다르다 — 그리고 프레임은 그린 쪽을 따른다", () => {
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

  it("스윕이 다 소진되면 그린 자세 = raw 자세", () => {
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
  it("손이 닿을 때 자세로 개어 넣는다 — 그린 자세가 바이트 그대로 유지된다", () => {
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

  it("이미 무장 해제됐으면 아무 일도 안 한다 — 두 번 부르면 각이 두 번 더해진다", () => {
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

describe("릴리스 투영 — 관성이 의미 있는 자리에 착지한다", () => {
  it("투영 거리는 감쇠 상수에서 나온다 — 속도 × 총 이동 계수", () => {
    // Σ v·d^t dt = v / (−ln d). Change the damping and this value must follow.
    expect(ORBIT_DECAY_TRAVEL_MS).toBeGreaterThan(400);
    expect(ORBIT_DECAY_TRAVEL_MS).toBeLessThan(600);
    expect(projectOrbitLanding(1, 0.002)).toBeCloseTo(1 + 0.002 * ORBIT_DECAY_TRAVEL_MS, 9);
    expect(projectOrbitLanding(1, 0), "속도 0 이면 제자리다").toBe(1);
  });

  it("도메인 자오선 — 그 각에서 도메인이 정면(깊이 최소)에 선다", () => {
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

  it("창 안이면 겨누고, 창 밖이면 아무 일도 안 한다", () => {
    const candidates = [0, 1, 2];
    expect(snapOrbitLanding(1.05, candidates, 0.14)).toBeCloseTo(1, 9);
    expect(snapOrbitLanding(1.5, candidates, 0.14)).toBeNull();
  });

  it("후보는 2π 주기다 — 여러 바퀴 돌아도 가장 가까운 등가각으로 접힌다", () => {
    const snapped = snapOrbitLanding(1 + 4 * Math.PI + 0.03, [1], 0.14);
    expect(snapped).not.toBeNull();
    expect(snapped! - (1 + 4 * Math.PI)).toBeCloseTo(0, 9);
  });

  it("창 기본값이 좁다 — 넓으면 「내가 세운 자리를 앱이 옮긴다」가 된다", () => {
    expect(ORBIT_SNAP_WINDOW_RAD).toBeLessThan(0.25);
  });

  /*
   * `/gate-probe` — solving τ back out of the release velocity is what makes this
   * feature velocity-continuous. Revert to a fixed τ and the speed jumps on the
   * frame the hand lifts. This assertion pins the derivation: over the same
   * distance, a faster release must give a shorter τ.
   */
  it("τ 를 릴리스 속도에서 역산한다 — 빠르게 놓을수록 짧다", () => {
    const slow = orbitSnapTauMs(0.2, 0.0005);
    const fast = orbitSnapTauMs(0.2, 0.002);
    expect(fast).toBeLessThan(slow);
    expect(orbitSnapTauMs(0.2, 0.002)).toBeCloseTo(100, 6);
  });

  it("도착 임계가 1px 보다 작다 — 그리고 0 이 아니다(지수 접근은 도달하지 않는다)", () => {
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeGreaterThan(0);
    // 1px on the outer ring ≈ 0.008rad (the measured conversion in the doc-block).
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeLessThan(0.008);
  });

  it("τ 를 범위 안으로 잠근다 — 순간이동도, 영원히 안 멎는 것도 막는다", () => {
    expect(orbitSnapTauMs(0.001, 1)).toBe(ORBIT_SNAP_TAU_MIN_MS);
    expect(orbitSnapTauMs(10, 0.00001)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    // With the opposite sign (target behind the direction of travel) the derivation is negative and falls to the cap.
    expect(orbitSnapTauMs(-0.2, 0.002)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    expect(orbitSnapTauMs(0.2, 0)).toBe(ORBIT_SNAP_TAU_MAX_MS);
  });
});

/* ── Placement basis: containment (dome) vs connection (cloud) ───────────── */

describe("결합 구름 — 관계가 자리를 정한다", () => {
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

  it("기본은 소유다 — 옵션을 안 주면 돔 그대로", () => {
    expect(buildDomeModel(nodes).arrangement).toBe("ownership");
  });

  /*
   * `/gate-probe` — **the first implementation died here.** Relaxing only the
   * bearing while pinning tier height drew the owner's verdict *"What I wanted was a completely different shape."* The cloud
   * only reads differently from the dome if connection decides height as well.
   * Pin the tiers again and this assertion turns red.
   */
  it("높이가 kind 평면에서 풀린다 — 이게 돔과 다른 모양이 되는 지점이다", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    expect(cloud.arrangement).toBe("coupling");
    const offPlane = nodes.filter((n) => {
      const c = cloud.coords.get(n.id)!;
      return Math.abs(c.py - DOME_PLANE[n.kind].y) > 1;
    });
    expect(offPlane.length, "모든 노드가 아직 자기 kind 평면 위에 있다 — 돔의 변주일 뿐이다").toBeGreaterThan(
      nodes.length / 2,
    );
  });

  it("같은 무리끼리가 다른 무리보다 가깝다 — 결합이 실제로 자리를 정했다", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    const within = (dist(cloud, "a2", "a3") + dist(cloud, "b2", "b3")) / 2;
    const across = (dist(cloud, "a2", "b2") + dist(cloud, "a3", "b3")) / 2;
    expect(within, `무리 안 ${within.toFixed(1)} · 무리 밖 ${across.toFixed(1)}`).toBeLessThan(across);
  });

  it("겹치지 않는다 — 밀어냄이 실제로 일한다", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id >= b.id) continue;
        expect(dist(cloud, a.id, b.id), `${a.id}·${b.id} 가 겹쳤다`).toBeGreaterThan(1);
      }
    }
  });

  it("무게중심이 원점이다 — 회전축이 구름 밖이면 조금만 돌려도 화면을 벗어난다", () => {
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

  it("반지름이 돔과 같은 스케일이다 — 카메라 핏과 안개가 두 배치에 같게 걸린다", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    let maxR = 0;
    for (const c of cloud.coords.values()) maxR = Math.max(maxR, Math.hypot(c.px, c.py, c.pz));
    expect(maxR).toBeCloseTo(DOME_FIT_RADIUS, 6);
  });

  it("결정론 — 같은 입력이면 바이트 그대로 같다 (난수 0)", () => {
    const a = buildDomeModel(nodes, { arrangement: "coupling", edges });
    const b = buildDomeModel(nodes, { arrangement: "coupling", edges });
    for (const [id, ca] of a.coords) {
      const cb = b.coords.get(id)!;
      expect(cb.px).toBe(ca.px);
      expect(cb.py).toBe(ca.py);
      expect(cb.pz).toBe(ca.pz);
    }
  });

  it("관계가 없으면 소유 배치 그대로다 — 정할 근거가 없으면 안 흔든다", () => {
    const plain = buildDomeModel(nodes);
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges: [] });
    for (const [id, c] of plain.coords) {
      expect(cloud.coords.get(id)).toEqual(c);
    }
  });

  it("반복 횟수가 고정이다 — 시간 기반이면 기계마다 다른 그림이 나온다", () => {
    expect(CLOUD_ITERATIONS).toBeGreaterThan(50);
  });

  it("구름에는 위도 링이 없다 — 없는 좌표계를 그리지 않는다", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes, { arrangement: "coupling", edges }));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    expect(runtime.rings).toHaveLength(0);
  });

  it("구름에는 껍질 휨이 없다 — 휘게 할 겉면이 없다", () => {
    const cloud = buildDomeModel(nodes, { arrangement: "coupling", edges });
    expect(domeEdgeControl(cloud, "a1", "a2")).toBeNull();
  });
});

describe("콘 트리 — 자식은 부모 바로 아래 원 위에 놓인다 (2026-09-02)", () => {
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

  it("자식은 부모의 (px, pz) 둘레 안에 있다 — 섹터가 아니라 바로 아래", () => {
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

  it("외자식은 줄기다 — 부모와 같은 (px, pz), 바닥 원 없음", () => {
    const m = buildDomeModel(tree);
    expect(horizontal(m.coords.get("c-one")!, m.coords.get("d-one")!)).toBeCloseTo(0, 9);
    expect(horizontal(m.coords.get("e-one")!, m.coords.get("c-one")!)).toBeCloseTo(0, 9);
    expect(m.circles.some((c) => c.kind === "capability" && Math.abs(c.cx - m.coords.get("d-one")!.px) < 1e-9 && Math.abs(c.cz - m.coords.get("d-one")!.pz) < 1e-9)).toBe(false);
  });

  it("자식이 둘 이상인 부모마다 바닥 원이 하나씩, 프로젝트 바닥은 도메인 링이다", () => {
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

  it("도메인 섹터는 서브트리 크기에 비례한다 — 큰 도메인이 더 넓은 각을 받는다", () => {
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

  it("형제 원뿔은 서로 겹치지 않는다 — 바닥 원 사이 거리가 반지름 합보다 크다", () => {
    const m = buildDomeModel(tree);
    const bases = m.circles.filter((c) => c.kind === "capability");
    for (let i = 0; i < bases.length; i += 1) {
      for (let j = i + 1; j < bases.length; j += 1) {
        const d = Math.hypot(bases[i].cx - bases[j].cx, bases[i].cz - bases[j].cz);
        expect(d).toBeGreaterThan(bases[i].r + bases[j].r);
      }
    }
  });

  it("발자국은 옛 바닥 링 안에 남는다 — 카메라 핏·안개·손잡이 계약이 그대로다", () => {
    const m = buildDomeModel(tree);
    for (const c of m.coords.values()) {
      expect(Math.hypot(c.px, c.pz)).toBeLessThanOrEqual(DOME_FIT_RADIUS * 1.1);
    }
  });

  it("부모가 모델 밖이면 자기 평면에서 해시 방위를 받는다 — 빠지는 노드는 없다", () => {
    const m = buildDomeModel(tree);
    const lost = m.coords.get("e-lost")!;
    expect(lost.py).toBe(DOME_PLANE.element.y);
    expect(Math.hypot(lost.px, lost.pz)).toBeCloseTo(DOME_PLANE.element.r, 6);
  });

  it("결정론 — 같은 입력이면 좌표와 바닥 원이 그대로다", () => {
    const a = buildDomeModel(tree);
    const b = buildDomeModel(tree);
    expect([...a.coords.entries()]).toEqual([...b.coords.entries()]);
    expect(a.circles).toEqual(b.circles);
  });

  it("담김 선은 곧고 관계선만 휜다 — 원뿔의 모서리는 직선이다", () => {
    const m = buildDomeModel(tree);
    expect(domeEdgeControl(m, "p", "d-big", "contains")).toBeNull();
    expect(domeEdgeControl(m, "d-big", "d-mid", "depends")).not.toBeNull();
    // Omitted kind keeps the bow — the older callers and the meridian tests above.
    expect(domeEdgeControl(m, "d-big", "d-mid")).not.toBeNull();
  });
});

describe("배치 모핑 — 전환은 컷이 아니라 이동이다 (2026-09-02)", () => {
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

  it("중간 프레임은 from 과 to 사이에 있고, 끝나면 morph 가 null 이다", () => {
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

  it("모핑 중에는 옛 바닥 원이 사라지는 중이고 새 원이 나타나는 중이다", () => {
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

  it("지속 0 은 컷이다 — reduced-motion", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    beginDomeMorph(runtime, buildDomeModel(nodes, { arrangement: "coupling", edges }), 1000, 0);
    expect(runtime.morph).toBeNull();
    expect(runtime.model.arrangement).toBe("coupling");
  });
});

describe("화면 밖 정착 — 3D 를 다녀온 2D 지도가 다시 잠든다 (2026-09-02)", () => {
  it("남아 있던 모션 상태를 전부 쉬게 한다", () => {
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

describe("플릭 코스트 상한 — 반 바퀴를 넘는 관성은 정보가 없다 (2026-09-02)", () => {
  it("상한 안의 속도는 그대로, 넘는 속도는 반 바퀴 코스트로 잘린다", () => {
    expect(clampOrbitReleaseVelocity(0.001)).toBe(0.001);
    expect(clampOrbitReleaseVelocity(-0.001)).toBe(-0.001);
    const capped = clampOrbitReleaseVelocity(0.05);
    expect(capped).toBeLessThan(0.05);
    expect(Math.abs(projectOrbitLanding(0, capped))).toBeCloseTo(ORBIT_COAST_MAX_RAD, 9);
    expect(projectOrbitLanding(0, clampOrbitReleaseVelocity(-0.05))).toBeCloseTo(-ORBIT_COAST_MAX_RAD, 9);
  });

  it("상한은 반 바퀴다 — 그 뒤로는 어느 면이 앞이었는지 잃는다", () => {
    expect(ORBIT_COAST_MAX_RAD).toBeCloseTo(Math.PI, 12);
  });
});

describe("구름 이완 슬라이스 — 쌍 루프 안에서 끊어도 결과는 바이트 그대로다 (2026-09-02)", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, kind: "domain" as const, x: i * 40, y: 0, parentId: "p" })),
    ...Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, kind: "capability" as const, x: i * 7, y: 30 + (i % 5) * 9, parentId: `d${i % 6}` })),
  ];
  const edges = Array.from({ length: 90 }, (_, i) => ({ sourceId: `c${i % 60}`, targetId: `c${(i * 7 + 3) % 60}` }));

  it("초미세 예산으로 여러 번 나눠 돌려도 한 번에 돌린 것과 좌표가 같다", () => {
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
