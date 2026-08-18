import { describe, expect, it } from "vitest";

import type { CameraAxes } from "../engine/camera";
import { worldToScreen } from "../ui/topology-camera-math";
import {
  buildDomeModel,
  clampDomePitch,
  createDomeRuntime,
  decayOrbitVelocity,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_FOCAL,
  DOME_PITCH_DEFAULT,
  DOME_PITCH_MAX,
  DOME_PITCH_MIN,
  DOME_NODE_R,
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
  snapOrbitLanding,
  DOME_ENTRY_SWEEP_MS,
  DOME_GRIP_MARGIN,
  isInsideDomeGrip,
  DOME_POSE_LAG_SCALE,
  DOME_TIER_LAG,
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
  type DomeInputNode,
  type DomeViewKind,
} from "./dome-view";

const cam = (x: number, y: number, scale: number): CameraAxes => ({
  x: { value: x, velocity: 0 },
  y: { value: y, velocity: 0 },
  scale: { value: scale, velocity: 0 },
});

const KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/** 작은 결정론 볼트 — project 1 · domain 2 · capability 3 · element 3. */
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
    // 단일 project 는 꼭짓점(축) 위.
    expect(a.coords.get("atlas")).toEqual({ px: 0, py: DOME_PLANE.project.y, pz: 0 });
    // capability 는 부모 domain 각도의 부채꼴 안 — 같은 부모의 자식들이
    // 반대편 부모의 자식들보다 자기 부모에 각도상 가깝다.
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
    // 모든 노드가 자기 kind 의 링 높이를 갖는다.
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
     * 진입 스윕을 끈다 — 이 시험의 주장은 «프레임 맵이 **그린 자세**의 투영과
     * 같다» 이지 «raw yaw/pitch 의 투영과 같다» 가 아니다. 스윕이 살아 있으면
     * 두 자세가 갈리고, 그 갈림 자체는 정상이다(`runtime.drawYaw/drawPitch` 가
     * 그린 자세의 단일 출처다 — 아래 별도 시험이 그 계약을 잡는다).
     */
    runtime.entryArmed = false;
    const BASE_R = 10;
    updateDomeFrame(runtime, NODES as unknown as Array<{ id: string; kind: DomeViewKind; x: number; y: number }>, () => BASE_R);
    const camera = cam(37.5, -18.25, 0.85);
    for (const n of NODES) {
      const off = runtime.frame.get(n.id)!;
      const direct = projectDomeCoord(model, model.coords.get(n.id)!, runtime.yaw, runtime.pitch);
      const via = worldToScreen(camera, 1512, 900, n.x + off.dx, n.y + off.dy);
      const want = worldToScreen(camera, 1512, 900, direct.wx, direct.wy);
      expect(via.x).toBeCloseTo(want.x, 9);
      expect(via.y).toBeCloseTo(want.y, 9);
      // s 는 반지름 배수 — base × s = 히어로 점 반지름(NODE_R × 2.1 × unit × 원근).
      // project 는 나침 십자 글리프가 화면을 가로지르지 않게 1.1× 로 잠근다.
      const expected =
        n.kind === "project"
          ? Math.min(DOME_NODE_R[n.kind] * 2.1 * model.unit * direct.s, 1.1 * BASE_R)
          : DOME_NODE_R[n.kind] * 2.1 * model.unit * direct.s;
      expect(off.s * BASE_R).toBeCloseTo(expected, 9);
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
    // pitch 전각 개방(2026-08-18 2차)의 좌표 계약 — 분모의 정상 부호가 음수로
    // 뒤집히는 저면 시점에서 예전의 «무조건 양의 하한» 잠금은 모든 드래그를
    // 하한 상수에 붙였다. 시점이 기대 부호를 정한다(`solveDomePlanePoint`).
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
    // 2026-08-18 소유자 실보고("클릭해도 제대로 안움직여지는 것도 있고")의
    // 재현 조건: 낮은 pitch(옆면 시점)에서 노드를 위로 끌면 분모가 0 을
    // 지나며 종전 코드는 null(그 프레임 이동 폐기 = 노드 동결) 또는 카메라
    // 뒤 해(비행)를 냈다. 계약: 화면 세로 전 구간을 훑어도 항상 비-null,
    // 항상 유한, 항상 반경 상한 안.
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
    // denom = F·sp + uy·cp = 0 이 되는 uy 를 역산해 정확히 그 자리를 찌른다.
    const uy = (-DOME_FOCAL * sp) / cp;
    const wy = model.centerY + uy * model.unit;
    const solved = solveDomePlanePoint(model, DOME_PLANE.domain.y, model.centerX + 50, wy, 0.55, pitch);
    expect(solved).not.toBeNull();
    expect(Number.isFinite(solved!.px)).toBe(true);
    expect(Number.isFinite(solved!.pz)).toBe(true);
  });

  it("수평선 횡단 연속성 — 한 픽셀 옮겼는데 반대편 림으로 순간이동하지 않는다 (종전: 부호 뒤집힘)", () => {
    // 분모가 0− 로 넘어가면 해가 카메라 뒤로 뒤집혀 정반대 방위의 림으로
    // 튀었다 — 화면에서는 드래그하던 노드가 돔 반대편으로 순간이동한다.
    // 계약: 포인터 1 유닛 스텝에 해는 최대 «림 위 한 걸음» 이상 못 간다.
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
    // dt 불변 — 같은 총 시간이면 프레임 분할과 무관하게 같은 값.
    const oneStep = decayOrbitVelocity(0.002, 100);
    let split = 0.002;
    for (let i = 0; i < 10; i++) split = decayOrbitVelocity(split, 10);
    expect(split).toBeCloseTo(oneStep, 12);
  });

  it("pitch 는 극점 직전까지 전각이다 — 옆면(0)·아래 시점(음수)이 열려 있다", () => {
    // 2026-08-18 소유자 실보고 *"밑에서 위로는 안되던데"* — 히어로에서 물려받은
    // 0.12–0.72 는 폐기됐다. 남은 벽은 화면의 위가 뒤집히는 극점(±π/2)뿐이다.
    expect(DOME_PITCH_MAX).toBeCloseTo(Math.PI / 2 - 0.12, 12);
    expect(DOME_PITCH_MIN).toBeCloseTo(-(Math.PI / 2 - 0.12), 12);
    expect(clampDomePitch(0)).toBe(0); // 옆면 통과 — 잠기지 않는다
    expect(clampDomePitch(-0.8)).toBe(-0.8); // 아래에서 올려다보기 — 열려 있다
    expect(clampDomePitch(2)).toBe(DOME_PITCH_MAX);
    expect(clampDomePitch(-2)).toBe(DOME_PITCH_MIN);
  });

  it("pitch 러버밴드 — 1/4 저항이되 오버슛은 상한에서 멎는다(극점 뒤집힘 방지)", () => {
    expect(resistDomePitch(DOME_PITCH_MAX + 0.2)).toBeCloseTo(DOME_PITCH_MAX + 0.05, 12);
    expect(resistDomePitch(DOME_PITCH_MIN - 0.2)).toBeCloseTo(DOME_PITCH_MIN - 0.05, 12);
    // 아무리 세게 끌어도 눌림은 상한(0.09)까지 — 눌린 채로도 π/2 를 넘지 않는다.
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
    // 반 바퀴 이상 돌지 않는다.
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
      // 깊이의 이론 최솟값은 −r·cos(pitch) − py·sin(pitch).
      const r = Math.hypot(coord.px, coord.pz);
      const zMin = -r * Math.cos(DOME_PITCH_DEFAULT) - coord.py * Math.sin(DOME_PITCH_DEFAULT);
      expect(at.z).toBeCloseTo(zMin, 6);
      // 등가각 규칙 — 현재 yaw 에서 반 바퀴 이상 돌지 않는다.
      expect(Math.abs(yaw - 0.9)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    // 축 위(단일 project 꼭짓점)는 회전할 이유가 없다 — 현재 yaw 그대로.
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
    // 시선 끌기(attract) 회전은 «아직 만지지 않은 화면»의 기본값이고, 개입
    // (궤도·줌·핀치·노드 드래그·선택)이 내리는 쪽은 루프·포인터 핸들러 계약.
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
      // 리터럴로 같은 식을 적는다 — 함수 몸이 바뀌면 여기서 걸린다.
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

/* ── 3D 품질 층: 껍질 · 자오선 · 헤일로 · 위도 링 ─────────────────────────── */

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
   * `/gate-probe` — **첫 구현이 정확히 여기서 죽었다.** 껍질을 링 넷의 선형
   * 보간으로 두면 반지름 방향 현의 중점이 이미 껍질 위에 있어 휨이 0 이 되고,
   * 화면은 돔이 아니라 천막으로 남는다. 그때 이 단언은 초록이었을 것이다 —
   * 「단조 증가」도 「양 끝 값」도 선형 보간이 다 만족하기 때문이다.
   * 볼록성만이 그 실패를 잡는다.
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
    // t=0.5 에서 (A + 2C + B)/4.
    const midX = (0 + 2 * control.px + DOME_PLANE.domain.r) / 4;
    const midZ = (0 + 2 * control.pz + 0) / 4;
    const midY = (DOME_PLANE.project.y + 2 * control.py + DOME_PLANE.domain.y) / 4;
    expect(Math.hypot(midX, midZ)).toBeCloseTo(domeShellRadiusAtY(midY) * DOME_EDGE_BOW, 0);
  });

  it("마주 본 두 노드는 축을 관통하지 않는다 — 방위 합이 0 이면 휘지 않는다", () => {
    const control = domeEdgeControl(model, "ring", "ringOpposite");
    expect(control).not.toBeNull();
    // 완전한 대척점이라 밀 방향이 없다 → 현 중점 그대로(임의 방향을 고르지 않는다).
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

describe("위도 링 — 좌표계이지 데이터가 아니다", () => {
  const nodes: DomeInputNode[] = [
    { id: "p", kind: "project", x: 0, y: 0, parentId: null },
    { id: "d", kind: "domain", x: 100, y: 0, parentId: "p" },
    { id: "c", kind: "capability", x: 120, y: 40, parentId: "d" },
    { id: "e", kind: "element", x: 140, y: 80, parentId: "c" },
  ];

  it("링 셋(domain·capability·element)을 표본 수만큼 채운다", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    expect(runtime.rings).toHaveLength(3);
    for (const ring of runtime.rings) {
      expect(ring.points).toHaveLength(DOME_RING_SAMPLES);
      expect(ring.a).toBeGreaterThan(0.99);
    }
  });

  it("한 링 안에서 깊이가 갈린다 — 앞뒤가 같으면 링은 깊이 단서가 아니다", () => {
    const runtime = createDomeRuntime(buildDomeModel(nodes));
    runtime.rampClock = DOME_ASSEMBLE_TOTAL_MS;
    updateDomeFrame(runtime, nodes, () => 10);
    const us = runtime.rings[0].points.map((point) => point.u);
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.2);
    // 노드 프레임과 같은 척도로 클램프돼 있어야 안개가 둘에 같게 걸린다.
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
   * `/gate-probe` — **2026-08-18 3차 이전에는 이 단언이 빨갰다.** 비틀림은 손
   * 드래그 경로에만 있었고, 프로그램 자세 이동(클릭 리프레임 · 「제자리로」)은
   * 네 링을 한 덩어리로 굳혀 돌렸다. 같은 회전이 누가 돌렸느냐에 따라 다른
   * 물건처럼 움직이는 것이 「JS 애니메이션」의 인상이다.
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
   * `/gate-probe` — **이 단언이 이 규칙의 존재 이유다.** bbox 로 판정하면 네
   * 모서리가 «물체 위»가 된다: 화면에는 아무것도 없는 검은 자리인데 끌면
   * 회전한다(소유자가 가리킨 바로 그 자리). 타원이어야 눈에 보이는 것과
   * 판정이 같다. 사각형 판정으로 되돌리면 여기가 빨개진다.
   */
  it("bbox 모서리는 손잡이 **밖**이다 — 거기서 끌면 지도가 따라온다", () => {
    expect(isInsideDomeGrip(bounds, 100, 50)).toBe(false);
    expect(isInsideDomeGrip(bounds, -100, -50)).toBe(false);
  });

  it("축 위 가장자리는 여백만큼 안이다 — 돔 테두리를 잡았는데 지도가 밀리면 안 된다", () => {
    // margin 1.08 이므로 반축의 100% 지점은 아직 안, 108% 를 넘으면 밖.
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
    // 세로로 매우 납작한 bbox: 가로로 멀어도 안, 세로로 조금만 벗어나도 밖.
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
   * `/gate-probe` — 그냥 `entryArmed = false` 로 끄면 그리는 자세가 한 프레임에
   * 튄다. 사용자가 손을 대는 그 순간 화면이 점프하는 것이라, 이 저장소가
   * 카메라·궤도·자세 이동에서 일관되게 지키는 «제스처는 지금 자리를 이어받는다»
   * 계약을 정확히 어긴다. 이 단언이 그 점프를 잡는다.
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
    // 목표도 함께 옮겨야 스무딩이 옛 목표로 도로 끌어당기지 않는다.
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
    // Σ v·d^t dt = v / (−ln d). 감쇠를 바꾸면 이 값이 따라 움직여야 한다.
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
    // 각 후보 yaw 에서 어떤 도메인이 실제로 가장 가까운지 확인한다 — 유도식
    // (yaw = −π/2 − θ)이 틀리면 여기가 빨개진다.
    for (const yaw of yaws) {
      let minZ = Infinity;
      for (const id of ["d1", "d2", "d3"]) {
        const p = projectDomeCoord(model, model.coords.get(id)!, yaw, DOME_PITCH_DEFAULT);
        if (p.z < minZ) minZ = p.z;
      }
      // 정면에 선 노드의 깊이는 링 반지름만큼 카메라 쪽으로 나와 있어야 한다.
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
   * `/gate-probe` — τ 를 릴리스 속도에서 역산하는 것이 이 기능의 «속도 연속»
   * 이다. 고정 τ 로 되돌리면 손을 뗀 프레임에 속도가 튄다. 이 단언이 그
   * 역산을 잡는다: 같은 거리라도 빠르게 놓으면 τ 가 짧아야 한다.
   */
  it("τ 를 릴리스 속도에서 역산한다 — 빠르게 놓을수록 짧다", () => {
    const slow = orbitSnapTauMs(0.2, 0.0005);
    const fast = orbitSnapTauMs(0.2, 0.002);
    expect(fast).toBeLessThan(slow);
    expect(orbitSnapTauMs(0.2, 0.002)).toBeCloseTo(100, 6);
  });

  it("도착 임계가 1px 보다 작다 — 그리고 0 이 아니다(지수 접근은 도달하지 않는다)", () => {
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeGreaterThan(0);
    // 바깥 링 1px ≈ 0.008rad (독블록의 실측 환산).
    expect(ORBIT_SNAP_ARRIVE_RAD).toBeLessThan(0.008);
  });

  it("τ 를 범위 안으로 잠근다 — 순간이동도, 영원히 안 멎는 것도 막는다", () => {
    expect(orbitSnapTauMs(0.001, 1)).toBe(ORBIT_SNAP_TAU_MIN_MS);
    expect(orbitSnapTauMs(10, 0.00001)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    // 부호가 반대(목표가 진행 방향 뒤)면 역산이 음수라 상한으로 떨어진다.
    expect(orbitSnapTauMs(-0.2, 0.002)).toBe(ORBIT_SNAP_TAU_MAX_MS);
    expect(orbitSnapTauMs(0.2, 0)).toBe(ORBIT_SNAP_TAU_MAX_MS);
  });
});

/* ── 배치 기준: 소유(돔) vs 결합(구름) ──────────────────────────────────── */

describe("결합 구름 — 관계가 자리를 정한다", () => {
  /** 두 무리가 각각 안에서만 이어지고 둘 사이는 다리 하나로 붙은 그래프. */
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
   * `/gate-probe` — **첫 구현이 여기서 죽었다.** 티어 높이를 고정한 채 방위만
   * 완화했더니 소유자 판정이 *"내가 원한건 … 아예 다른 모양"* 이었다. 구름은
   * 높이까지 관계가 정해야 돔과 다른 읽기가 된다. 티어를 다시 붙잡으면 이
   * 단언이 빨개진다.
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
