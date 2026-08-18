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
  domeFogAlpha,
  domeLineWidthFactor,
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
