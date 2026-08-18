/**
 * 3D 보기 (dome view) — 지도를 **kind 동심 링의 돔**으로 다시 배치하는 옵트인
 * 뷰 모드. 상단 툴바의 「3D」 칩이 켠다.
 *
 * ## 무엇이 3D 인가 — 투영 보정이 아니라 **다른 레이아웃**이다
 *
 * 첫 구현(2026-08-18 오전)은 같은 배치에 kind 별 z-lift 만 더했고, 소유자가
 * 켜 보고 "뭐가 달라졌는지 모르겠다"고 판정했다. 소유자가 가리킨 목표물은
 * 히어로 엔진(`hero-engine.js`)의 오브젝트다: **containment 스파인을 링으로
 * 편 돔** — project 가 꼭짓점, 그 아래 domain 링, capability 링, element 링.
 * 각 노드의 링 위 각도는 containment 부모에게서 온다(자식이 부모 부채꼴
 * 안에 퍼진다). 그래서 z(높이)와 각도 둘 다 **타입 있는 사실**을 나른다:
 * 높이 = kind 의 containment 티어, 각도 = 소속.
 *
 * ## 왜 기본이 아니라 옵트인인가 (도해석 실측)
 *
 * 같은 데이터를 돔으로 돌리면 엣지 교차가 크게 뛴다(히어로 실측 58.0 →
 * 190.7, 3.29× — 교차 최소화가 그래프 이해도의 지배 요인, Purchase 1997).
 * 그래서 기본 지도는 2D 그대로이고, 돔은 구조를 «형태로» 보고 싶을 때 켠다.
 * 이 모드의 실측 비용은 `docs/DECISIONS.md` 2026-08-18 항목에 있다.
 *
 * ## 카메라·회전 문법
 *
 * 돔 좌표는 **월드 2D 좌표로 투영된 뒤** 기존 카메라(팬 클램프·휠 줌·핏)를
 * 그대로 탄다 — 두 번째 렌더러도, 3D 라이브러리도 없다(약한 원근
 * `s = f/(f+z)` 뿐이다, 히어로와 동일). 렌더 전달은 S5 시차가 세운 오프셋
 * 문법 그대로: 월드 좌표는 불변, 드로우·히트테스트·계기가 **한 프레임 맵**
 * (`DomeRuntime.frame`)을 공유해 회전 중에도 클릭이 그려진 자리를 따라온다.
 *
 * - 자율 회전: `DOME_PERIOD_MS`(48s/바퀴). 포인터가 캔버스 위면 정지(조준한
 *   노드가 커서 밑에서 미끄러지지 않게), `prefers-reduced-motion` 이면 0.
 * - 궤도(orbit): 빈 곳 드래그 = yaw/pitch. 놓으면 관성으로 미끄러지다 멎는다
 *   (`--topology-v2-camera-momentum-decay` 와 같은 감쇠 상수). 사용자 개시
 *   조작이라 reduced-motion 에서도 1:1 추적은 유지하되 관성만 0 이다
 *   (WCAG 2.3.3 의 직접 조작 예외 — 팬/핀치와 같은 계약).
 * - 노드 드래그: **자기 kind 평면 안에서만** 움직인다(`solveDomePlanePoint`).
 *   화면 한 점에는 깊이가 무한히 대응하므로 자유 이동을 허용하면 노드가
 *   임의의 z 로 날아가 z 의 타입 사실이 깨진다.
 *
 * ## 배율·알파
 *
 * 원근 배율 `s` 는 기하라 항상 적용된다(노드 반지름 × s — 드로우·히트·계기
 * 동일식). 알파 안개는 새 사다리를 만들지 않고 S5 선명도 사다리
 * (`realmDepthClarityAlpha`)를 kind 티어로 부른다 — 가장 어두운 잉크
 * (`--topology-v2-ink-depth-leaf`)가 WCAG 1.4.11 의 3:1 바닥을 지키는 최소
 * 알파가 0.955 라(합성 실측, `topology-ink-contrast.contract.test.ts`) 회전에
 * 따른 연속 안개는 쓸 수 없다. 깊이감은 배율·위치·운동 시차가 나른다.
 *
 * ## 상수가 토큰이 아닌 이유
 *
 * `camera-easing.ts`/`realm-transition.ts` 선례 — 값이 감(기하·타이밍)을
 * 지배하지 테마 표면을 지배하지 않는다.
 */
export type DomeViewKind = "project" | "domain" | "capability" | "element";

const TAU = Math.PI * 2;

/**
 * kind → containment 티어 (project 루트가 꼭짓점, element 잎이 바닥 링).
 * `docs/ONTOLOGY-ATLAS-SPEC.md` §2 의 스파인 서열 — 이 표가 높이의 타입
 * 사실이다.
 */
export const KIND_DEPTH: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

/** 자율 회전 주기 — 히어로 엔진의 48s/바퀴 그대로. */
export const DOME_PERIOD_MS = 48000;
/** 기본 내려다보는 각(rad) — 히어로 엔진의 pitch 0.34 그대로. */
export const DOME_PITCH_DEFAULT = 0.34;
/**
 * pitch 극점 여유(rad) — 상한이 정확히 ±π/2 에 닿으면 그 너머에서 화면의
 * 「위」가 뒤집힌다(요 방향 반전). 이 여유가 그 반전만 막는다.
 */
export const DOME_PITCH_POLE_MARGIN = 0.12;
/**
 * 궤도 드래그가 갈 수 있는 pitch 범위 — **극점 직전까지 전부**.
 *
 * 히어로에서 물려받은 첫 값은 0.12–0.72(6.9°–41.3°)였는데, 소유자가 정확히
 * 그 벽에 부딪혔다(2026-08-18: *"밑에서 위로는 안되던데"*). 이 모드의 헌장은
 * «요리조리» 돌려보는 것이라, 잠글 이유가 실재하는 것만 잠근다:
 *
 * - **±π/2(극점)**: 넘어가면 화면의 위가 뒤집히고 yaw 드래그 방향이 반전된다
 *   — 이것만 진짜 벽이라 `DOME_PITCH_POLE_MARGIN` 으로 잠근다. 벽의 물성은
 *   `resistDomePitch` 의 1/4 저항 + 오버슛 상한이 «여기가 끝»이라고 말한다.
 * - **0°(옆면)**: 링들이 한 줄로 겹치는 퇴화각이지만 **지나가는 각**이다 —
 *   아래에서 올려다보는 시점(pitch<0)으로 가는 유일한 길이라 잠그지 않는다.
 *   깊이 안개·선 굵기는 프레임 단위 z 정규화라 어느 각에서도 유효하고,
 *   라벨은 온디맨드(호버·포커스·트레일)라 겹침 폭발이 없다.
 * - **±83°(평면도/저면도)**: 링이 동심원으로 펴진다 — 깊이 단서 대신 소속
 *   (각도)이 가장 잘 읽히는 각이라 퇴화가 아니라 다른 읽기다. 허용.
 */
export const DOME_PITCH_MAX = Math.PI / 2 - DOME_PITCH_POLE_MARGIN;
export const DOME_PITCH_MIN = -DOME_PITCH_MAX;
/**
 * 러버밴드 오버슛 상한(rad) — 1/4 저항이 선형이라 세게 끌면 극점을 넘을 수
 * 있어, 눌림 자체를 이 폭에서 멈춘다. `POLE_MARGIN`(0.12)보다 작아야 눌린
 * 채로도 화면의 위가 뒤집히지 않는다.
 */
export const DOME_PITCH_OVERSHOOT_CAP = 0.09;
/** 약한 원근 초점 거리(돔 단위) — 히어로 엔진의 f=1050 그대로. */
export const DOME_FOCAL = 1050;
/** 2D↔3D 조립/해체 램프(ms) — 카메라 프로그램 이동과 같은 시네마틱 급. */
export const DOME_RAMP_MS = 700;
/**
 * 프로그램 자세 이동(「제자리로」·선택 리프레임)의 최대 길이(ms) — 반 바퀴
 * (π, 최근접 등가각 규칙의 최악)가 이 시간을 받는다. 2D 카메라 트윈 상한
 * (420ms)은 팬·줌의 것이라 회전 반 바퀴에는 너무 급해 휘돌아 보인다(실측
 * 93ms 에 2.3rad) — 「제자리로」가 처음부터 쓰던 750ms 를 자세 이동의 상한
 * 이름으로 올린 것.
 */
export const DOME_POSE_MS = 750;
/**
 * 궤도 드래그 감도 — 화면 px → yaw(rad).
 *
 * 히어로는 0.006(작은 히어로 캔버스 기준)이었는데 소유자가 지도 캔버스에서
 * "회전이 뻑뻑하다"고 판정했다(2026-08-18). three.js OrbitControls 의 표준
 * 매핑은 `2π × dx / clientHeight` — 우리 지도 캔버스 높이(~900px)로 환산하면
 * ≈0.007/px 다. 그 기준에 맞춰 0.0075 로 올렸다(한 바퀴 = 838px 드래그).
 * 공식이 아니라 상수인 이유: 캔버스 높이에 묶으면 창 리사이즈가 감도를
 * 바꿔 버려 테스트가 재현 불가가 된다.
 */
export const ORBIT_YAW_PER_PX = 0.0075;
/** 궤도 드래그 감도 — 화면 px → pitch(rad). yaw 보다 낮춰 수평이 주 축이 되게. */
export const ORBIT_PITCH_PER_PX = 0.005;
/**
 * 궤도 입력 스무딩의 시간 상수(ms) — 드래그 중 yaw/pitch 는 포인터가 만든
 * **목표**(`yawTarget`)를 매 프레임 `1−exp(−dt/τ)` 로 따라간다.
 *
 * 왜 목표-따라가기인가 (2026-08-18 실측): 종전에는 pointermove 이벤트마다
 * yaw 를 직접 더했는데, 이벤트 주기가 프레임 주기보다 길면(120Hz ProMotion
 * 화면 + 60Hz 포인터, 혹은 계측 환경 25ms 이벤트 간격) 회전이 «한 프레임
 * 23px 점프 → 두 프레임 정지»의 계단으로 그려졌다 — 총량은 1:1 인데 전달이
 * 덜컥거려 "뻑뻑"으로 읽힌다. τ=45ms 는 그 계단을 프레임에 분산시키면서도
 * 지각 한계(~100ms) 아래라 «손을 안 따라온다»로 읽히지 않는다 — three.js
 * OrbitControls 의 dampingFactor(60Hz 기준 ≈τ90ms)·yomotsu camera-controls
 * 의 smoothTime 과 같은 원리의, 더 팽팽한 값이다(기법만 참고, 코드 이식
 * 아님). reduced-motion 은 스무딩 없이 목표로 스냅한다(1:1 직접 조작 유지).
 */
export const ORBIT_SMOOTH_TAU_MS = 45;
/**
 * 릴리스 관성의 ms당 기하 감쇠 — `--topology-v2-camera-momentum-decay`(0.998)
 * 와 같은 값. 카메라 플릭과 같은 물성으로 미끄러지다 멎는다(R4 모션 헌법의
 * iOS 감속 상수 — 새 이징을 지어내지 않는다).
 */
export const ORBIT_VEL_DECAY_PER_MS = 0.998;
/** |yawVel| 이 이 밑이면 0 으로 스냅(rad/ms) — 무한꼬리 방지. */
export const ORBIT_VEL_EPS = 0.000005;

/**
 * kind → 링 높이(y, 위가 양수)·반지름 — 히어로 엔진의 PLANE 표 그대로
 * (620 단위 세계 기준). 실제 월드로는 `DomeModel.unit` 이 배율한다.
 */
export const DOME_PLANE: Readonly<Record<DomeViewKind, { y: number; r: number }>> = {
  project: { y: 148, r: 0 },
  domain: { y: 56, r: 148 },
  capability: { y: -48, r: 192 },
  element: { y: -150, r: 224 },
};

/** 돔의 명목 바닥 반지름(돔 단위) — element 링. 월드 배율의 분모. */
export const DOME_FIT_RADIUS = DOME_PLANE.element.r;

/** 평면 내 드래그의 반경 상한(돔 단위) — 바닥 링의 1.5×. 밖은 방향 유지 축소. */
export const DOME_DRAG_MAX_RADIUS = DOME_FIT_RADIUS * 1.5;

/**
 * 평면 역투영 분모의 양의 하한(돔 단위) — 포인터가 평면 수평선을 넘어도
 * 해가 카메라 뒤로 뒤집히지 않게 잠근다(`solveDomePlanePoint` 참고).
 * pitch 하한(0.12)에서의 `F·sin(pitch)` ≈ 125 보다 충분히 작아 정상 영역의
 * 해는 건드리지 않는다.
 */
export const DOME_PLANE_SOLVE_DENOM_MIN = 30;

/**
 * 깊이 안개 — 히어로 엔진의 fog 램프 그대로: 가까운 노드 1.0, 먼 노드 0.09,
 * 2 차 감쇠. *«이 대비가 곧 3D 다»* (히어로 주석). 2D 지도의 잉크 대비 바닥
 * (3:1)보다 훨씬 깊은데, 이것은 소유자가 3D 모드에 한해 연 유예다
 * (`docs/DECISIONS.md` «3D 유예 목록») — 대신 읽어야 할 때(호버·포커스·ego·
 * 트레일)는 드로우가 안개를 면제해 도로 밝힌다. `u` 는 이번 프레임에서
 * 정규화한 깊이(0 가까움 → 1 멂).
 */
export function domeFogAlpha(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.09 + 0.91 * Math.pow(1 - c, 1.8);
}

/** 깊이 → 선 굵기 배수 — 히어로의 lw(0.45→1.60) 감쇠를 배수로 옮긴 것. */
export function domeLineWidthFactor(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.35 + 0.55 * (1 - c);
}

/**
 * kind → 점 반지름(돔 단위) — 히어로 NODE_R 그대로. 3D 는 데이터 표가 아니라
 * **형태**를 보는 층이라, 숫자 칩 대신 점으로 그린다(소유자 판정: 히어로의
 * 그 느낌). 화면 반지름은 `× 2.1 × unit × 원근 s` (히어로와 같은 비율).
 */
export const DOME_NODE_R: Readonly<Record<DomeViewKind, number>> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

/** 결정론적 해시 → [0,1) — 히어로 엔진의 FNV-1a 지터 그대로(각도 안정성). */
export function domeHash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface DomeInputNode {
  id: string;
  kind: DomeViewKind;
  x: number;
  y: number;
  parentId: string | null;
}

/** 한 노드의 돔 좌표(돔 단위) — px/pz 는 링 평면, py 는 kind 높이. */
export interface DomeCoord {
  px: number;
  py: number;
  pz: number;
}

export interface DomeModel {
  /** 2D 레이아웃 중심(월드) — 돔이 이 위에 앉는다(카메라 연속성). */
  centerX: number;
  centerY: number;
  /** 돔 단위 → 월드 단위 배율 — element 링이 2D 레이아웃 반경과 겹치게. */
  unit: number;
  coords: Map<string, DomeCoord>;
}

/**
 * 돔 레이아웃 — 히어로 엔진 `layout()` 의 이식.
 *
 * 각도의 출처는 containment 부모다: domain 은 자기 링에 균등(슬러그 정렬 —
 * 결정론), capability 는 부모 domain 의 부채꼴 안에 부채(fan), element 는
 * 부모(capability 우선, 없으면 domain)의 부채꼴 안에 부채. 부모가 없으면
 * 결정론 해시 각도. 혼잡한 부채는 두 겹 보조 링으로 번갈아 앉힌다(히어로
 * 동일). project 는 꼭짓점(둘 이상이면 소반경 링).
 */
export function buildDomeModel(nodes: readonly DomeInputNode[]): DomeModel {
  let cx = 0;
  let cy = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
  }
  const count = Math.max(1, nodes.length);
  cx /= count;
  cy /= count;
  let radius = 0;
  for (const n of nodes) {
    const d = Math.hypot(n.x - cx, n.y - cy);
    if (d > radius) radius = d;
  }
  // 아주 작은 볼트(스타터 5노드)에서도 돔이 점으로 붕괴하지 않게 하한.
  const unit = Math.max(radius, 220) / DOME_FIT_RADIUS;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const angle = new Map<string, number>();
  const coords = new Map<string, DomeCoord>();

  const domains = nodes.filter((n) => n.kind === "domain").sort((a, b) => (a.id < b.id ? -1 : 1));
  domains.forEach((d, i) => {
    angle.set(d.id, (i / Math.max(1, domains.length)) * TAU - Math.PI / 2);
  });

  const projects = nodes.filter((n) => n.kind === "project").sort((a, b) => (a.id < b.id ? -1 : 1));
  projects.forEach((p, i) => {
    if (projects.length === 1) {
      coords.set(p.id, { px: 0, py: DOME_PLANE.project.y, pz: 0 });
    } else {
      const a = (i / projects.length) * TAU - Math.PI / 2;
      coords.set(p.id, { px: Math.cos(a) * 26, py: DOME_PLANE.project.y, pz: Math.sin(a) * 26 });
    }
    angle.set(p.id, 0);
  });
  domains.forEach((d) => {
    const a = angle.get(d.id) ?? 0;
    coords.set(d.id, {
      px: Math.cos(a) * DOME_PLANE.domain.r,
      py: DOME_PLANE.domain.y,
      pz: Math.sin(a) * DOME_PLANE.domain.r,
    });
  });

  /** 부모(→조부모) 각도를 좇고, 끝내 없으면 결정론 해시 각도. */
  const baseAngleFor = (n: DomeInputNode): number => {
    const p = n.parentId;
    if (p !== null) {
      const direct = angle.get(p);
      if (direct !== undefined) return direct;
      const grand = byId.get(p)?.parentId;
      if (grand != null) {
        const inherited = angle.get(grand);
        if (inherited !== undefined) return inherited;
      }
    }
    return domeHash01(n.id) * TAU;
  };

  const fan = (kids: readonly DomeInputNode[], ringR: number, planeY: number, sectorW: number): void => {
    const groups = new Map<number, DomeInputNode[]>();
    for (const k of kids) {
      const a = baseAngleFor(k);
      const g = groups.get(a);
      if (g) g.push(k);
      else groups.set(a, [k]);
    }
    for (const [a0, group] of groups) {
      group.sort((a, b) => (a.id < b.id ? -1 : 1));
      group.forEach((k, i) => {
        const t = group.length === 1 ? 0 : i / (group.length - 1) - 0.5;
        const a = a0 + t * sectorW;
        const r = ringR + (group.length > 4 ? (i % 2 ? 26 : -12) : 0) + (domeHash01(k.id) - 0.5) * 10;
        angle.set(k.id, a);
        coords.set(k.id, { px: Math.cos(a) * r, py: planeY, pz: Math.sin(a) * r });
      });
    }
  };

  const sector = TAU / Math.max(1, domains.length);
  fan(
    nodes.filter((n) => n.kind === "capability"),
    DOME_PLANE.capability.r,
    DOME_PLANE.capability.y,
    sector * 0.62,
  );
  fan(
    nodes.filter((n) => n.kind === "element"),
    DOME_PLANE.element.r,
    DOME_PLANE.element.y,
    sector * 0.78,
  );

  return { centerX: cx, centerY: cy, unit, coords };
}

export interface DomeProjection {
  /** 투영된 월드 2D 좌표 — 기존 카메라가 이 위를 본다. */
  wx: number;
  wy: number;
  /** 약한 원근 배율 s = f/(f+z) — 반지름·히트 디스크가 같이 곱한다. */
  s: number;
  /** 카메라계 깊이 z2 — 프레임 단위 안개 정규화(`updateDomeFrame`)의 입력. */
  z: number;
}

/** 한 돔 좌표를 yaw/pitch 로 월드 2D 에 투영 — 히어로 `project()` 의 이식. */
export function projectDomeCoord(model: DomeModel, coord: DomeCoord, yaw: number, pitch: number): DomeProjection {
  return projectWithTrig(model, coord, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
}

function projectWithTrig(
  model: DomeModel,
  coord: DomeCoord,
  cy: number,
  sy: number,
  cp: number,
  sp: number,
): DomeProjection {
  const x = coord.px * cy - coord.pz * sy;
  const zr = coord.px * sy + coord.pz * cy;
  const y2 = coord.py * cp + zr * sp;
  const z2 = -coord.py * sp + zr * cp;
  const s = DOME_FOCAL / (DOME_FOCAL + z2);
  return {
    wx: model.centerX + x * s * model.unit,
    wy: model.centerY - y2 * s * model.unit,
    s,
    z: z2,
  };
}

/* ── 3D 전용 물성 상수 — 이 명공간 밖으로 새지 않는다 ─────────────────────── *
 *
 * 소유자 유예(2026-08-18): 3D 모드는 앱 모션 규약(duration 3단 램프 등)에
 * 묶이지 않는다. 그 대가로 값은 전부 이 모듈 안에만 산다 — 규격화는 나중에
 * 이 파일 하나를 보고 결정한다(`docs/DECISIONS.md` «3D 유예 목록»).      */

/**
 * 티어 비틀림(torsion) — 궤도 드래그 중 깊은 티어가 살짝 뒤처졌다가 스프링
 * 백. 히어로 엔진의 elastic torsion(LAGW) 그대로 — 고전 애니메이션의
 * follow-through(2차 운동) 원리를 yaw 축에 적용한 것이다. 한 프레임의 티어별
 * yaw 가 달라지므로 두 티어를 잇는 엣지는 어느 단일 투영에도 없는 기하를
 * 지나가지만, 비틀림은 드래그 중·직후 수백 ms 만 살고 0 으로 감쇠한다.
 */
export const DOME_TIER_LAG: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};
/** 비틀림의 ms당 기하 감쇠 — 히어로의 프레임당 0.90(@60fps)을 dt 불변으로. */
export const DOME_TIER_LAG_DECAY_PER_MS = 0.9937;

/**
 * 조립 스태거 — 켜는 순간 project 스파인부터 링이 차례로 솟는다(히어로
 * tierDelay 그대로). 끄면 같은 시계가 역재생돼 잎부터 내려앉는다.
 */
export const DOME_TIER_DELAY_MS: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 180,
  capability: 380,
  element: 600,
};
/** 한 티어가 솟는 데 걸리는 시간(ms) — 히어로의 520ms ease-out cubic. */
export const DOME_TIER_RISE_MS = 520;
/** 조립 시계 전체 길이(ms) = 마지막 티어 지연 + 상승. */
export const DOME_ASSEMBLE_TOTAL_MS = DOME_TIER_DELAY_MS.element + DOME_TIER_RISE_MS;

/** ease-out cubic — 히어로 tierAlpha 의 그 곡선. */
export function domeEaseOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** 조립 시계(0..TOTAL) → 한 kind 의 eased 램프 0..1. */
export function domeTierRamp(clockMs: number, kind: DomeViewKind): number {
  return domeEaseOutCubic((clockMs - DOME_TIER_DELAY_MS[kind]) / DOME_TIER_RISE_MS);
}

/**
 * 이번 프레임 한 노드의 렌더 전달값 — 오프셋(월드)과 원근 배율.
 * 드로우·히트테스트·팝오버 앵커·`__atlasMap` 계기가 전부 **같은 맵**을 읽어야
 * 회전 중에도 클릭·측정이 그려진 자리를 따라온다. 항은 제자리 갱신된다
 * (프레임당 할당 0 에 수렴 — 노드 집합이 안정인 동안 Map 도 항도 재사용).
 */
export interface DomeNodeFrame {
  dx: number;
  dy: number;
  /**
   * 반지름 배수 — 2D 기본 반지름(radiusForKind × magnitudeScale)에 곱하면
   * 돔의 점 반지름(DOME_NODE_R 비율 × 원근)이 나오도록 **역산해 담는다**.
   * 드로우·히트·계기가 전부 base × s 를 쓰므로 셋이 구조적으로 일치한다.
   */
  s: number;
  /** 이 노드 kind 의 조립 램프 0..1 — 표현층 크로스페이드(라벨·안개·굵기)의 보간자. */
  a: number;
  /** 이번 프레임의 정규화 깊이 0(가까움)..1(멂) — 안개·선굵기의 입력. */
  u: number;
}

/**
 * 런타임의 프레임 맵을 현재 자세(yaw + kind 비틀림, pitch)·조립 시계로 제자리
 * 갱신한다. kind 마다 trig 를 한 번만 계산하고(4쌍), 노드 항은 재사용한다.
 */
export function updateDomeFrame(
  runtime: DomeRuntime,
  nodes: ReadonlyArray<{ id: string; kind: DomeViewKind; x: number; y: number }>,
  /** 노드의 2D 기본 반지름(월드) — radiusForKind × magnitudeScale. `s` 역산의 분모. */
  baseRadiusFor: (node: { id: string; kind: DomeViewKind }) => number,
): void {
  const { model, frame } = runtime;
  const cp = Math.cos(runtime.pitch);
  const sp = Math.sin(runtime.pitch);
  const trig: Record<DomeViewKind, [number, number]> = {
    project: [0, 0],
    domain: [0, 0],
    capability: [0, 0],
    element: [0, 0],
  };
  const ramp: Record<DomeViewKind, number> = { project: 0, domain: 0, capability: 0, element: 0 };
  for (const kind of DOME_KINDS) {
    const yawK = runtime.yaw + runtime.lag[kind];
    trig[kind] = [Math.cos(yawK), Math.sin(yawK)];
    ramp[kind] = domeTierRamp(runtime.rampClock, kind);
  }
  // 1 패스 — 투영 + 이번 프레임의 깊이 범위(안개 정규화는 프레임 단위가
  // 정직하다: 히어로와 같은 규칙) + **그려지는 월드 bbox**(카메라 팬 리쉬의
  // 앵커 — 2D 레이아웃 bbox 가 아니라 돔이 실제로 앉은 자리를 앵커로 줘야
  // 줌/궤도 중 탄성 클램프가 돔을 2D 중심으로 끌어가지 않는다).
  let zMin = Infinity;
  let zMax = -Infinity;
  let bMinX = Infinity;
  let bMinY = Infinity;
  let bMaxX = -Infinity;
  let bMaxY = -Infinity;
  for (const node of nodes) {
    const coord = model.coords.get(node.id);
    if (!coord) {
      frame.delete(node.id);
      continue;
    }
    const [cy, sy] = trig[node.kind];
    const r = ramp[node.kind];
    // r=0 티어는 투영을 건너뛴다 — 오프셋 0(−0 아님)·배율 1, 2D 와 동일.
    const p = r > 0 ? projectWithTrig(model, coord, cy, sy, cp, sp) : null;
    const dx = p === null ? 0 : (p.wx - node.x) * r;
    const dy = p === null ? 0 : (p.wy - node.y) * r;
    let s = 1;
    if (p !== null) {
      const baseR = baseRadiusFor(node);
      const domeR = DOME_NODE_R[node.kind] * 2.1 * model.unit * p.s;
      // project 꼭짓점 글리프(나침 십자)는 2D 반지름보다 커지지 않게 잠근다 —
      // 히어로의 정점은 «약간 큰 점»이지 화면을 가로지르는 십자가 아니다.
      let target = baseR > 0 ? domeR / baseR : 1;
      if (node.kind === "project") target = Math.min(target, 1.1);
      s = 1 + (target - 1) * r;
    }
    if (p !== null) {
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    const drawnX = node.x + dx;
    const drawnY = node.y + dy;
    if (drawnX < bMinX) bMinX = drawnX;
    if (drawnX > bMaxX) bMaxX = drawnX;
    if (drawnY < bMinY) bMinY = drawnY;
    if (drawnY > bMaxY) bMaxY = drawnY;
    const entry = frame.get(node.id);
    if (entry) {
      entry.dx = dx;
      entry.dy = dy;
      entry.s = s;
      entry.a = r;
      entry.u = p === null ? 0 : p.z;
    } else {
      frame.set(node.id, { dx, dy, s, a: r, u: p === null ? 0 : p.z });
    }
  }
  // 2 패스 — z 를 0..1 로 정규화(u). 전부 r=0 이면 span 이 없다 → u 0.
  const span = zMax - zMin;
  if (Number.isFinite(span) && span > 1e-9) {
    for (const entry of frame.values()) {
      if (entry.a > 0) entry.u = (entry.u - zMin) / span;
      else entry.u = 0;
    }
  } else {
    for (const entry of frame.values()) entry.u = 0;
  }
  runtime.drawnBounds = Number.isFinite(bMinX)
    ? { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY }
    : null;
  runtime.frameEpoch++;
}

export const DOME_KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/**
 * 역투영 — 월드 2D 한 점을 **높이 py 의 평면 위** 돔 좌표로 푼다(닫힌 형).
 * 3D 노드 드래그의 핵심: 화면 한 점에는 깊이가 무한히 대응하므로, 노드는
 * 자기 kind 평면 안에서만 움직인다(z 의 타입 사실 보존). 분모가 0 에
 * 가까우면(수평 시선) null — 호출부는 그 프레임의 이동을 버린다.
 */
export function solveDomePlanePoint(
  model: DomeModel,
  planeY: number,
  wx: number,
  wy: number,
  yaw: number,
  pitch: number,
): { px: number; pz: number } | null {
  const ux = (wx - model.centerX) / model.unit;
  const uy = (wy - model.centerY) / model.unit;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // uy = −(py·cp + zr·sp)·s, s = F/(F + (−py·sp + zr·cp)) 를 zr 에 대해 푼다.
  //
  // 퇴화 처리 (2026-08-18, 소유자 "클릭해도 제대로 안움직여지는 것도 있고"):
  // 포인터가 이 평면의 **수평선**(화면에서 평면이 소실되는 선)에 다가가면
  // denom → 0 이고, 넘어가면 부호가 뒤집혀 해가 카메라 뒤로 튄다. 종전에는
  // 여기서 null 을 돌려줬는데, 호출부가 그 프레임의 이동을 버리므로 낮은
  // pitch(옆면에 가까운 시점)에서 노드를 위로 끌면 **아무 반응이 없었다**.
  // null 대신 denom 을 양의 하한으로 잠그면 해가 «수평선 방향의 먼 점»으로
  // 연속적으로 밀려나고, 아래 반경 상한이 그것을 링 가장자리에 잡아 둔다 —
  // 얼어붙는 대신 가장자리로 미끄러진다.
  //
  // pitch 전각 개방(2026-08-18 2차) 후속 — 아래에서 올려다보는 시점(sp<0)은
  // 정상 영역의 분모 부호가 **음수**다. 예전처럼 무조건 양의 하한으로 잠그면
  // 저면 시점의 모든 드래그가 하한 상수에 붙어 버린다. 시점(카메라가 위/아래
  // 어느 쪽인가 = sp 부호)이 기대 부호를 정하고, 그 부호 쪽으로 크기만 잠근다
  // — 수평선 횡단의 연속성(부호 뒤집힘 방지)은 양쪽 시점에서 동일하게 성립.
  const rawDenom = DOME_FOCAL * sp + uy * cp;
  const denom =
    sp >= 0
      ? Math.max(rawDenom, DOME_PLANE_SOLVE_DENOM_MIN)
      : Math.min(rawDenom, -DOME_PLANE_SOLVE_DENOM_MIN);
  const zr = -(uy * (DOME_FOCAL - planeY * sp) + DOME_FOCAL * planeY * cp) / denom;
  const z2 = -planeY * sp + zr * cp;
  const s = DOME_FOCAL / Math.max(DOME_FOCAL + z2, DOME_FOCAL * 0.05);
  if (!Number.isFinite(s) || !Number.isFinite(zr)) return null;
  const x = ux / s;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let px = x * cy + zr * sy;
  let pz = -x * sy + zr * cy;
  const r = Math.hypot(px, pz);
  if (r > DOME_DRAG_MAX_RADIUS) {
    const k = DOME_DRAG_MAX_RADIUS / r;
    px *= k;
    pz *= k;
  }
  return { px, pz };
}

/** pitch 를 허용 범위로 잠근다 — 옆면/평면도로 무너지지 않게. */
export function clampDomePitch(pitch: number): number {
  return Math.min(DOME_PITCH_MAX, Math.max(DOME_PITCH_MIN, pitch));
}

/**
 * 드래그 중 pitch 러버밴드 — 한계를 넘는 몫은 1/4 저항으로만 먹힌다(iOS
 * 스크롤 경계와 같은 문법). 손을 놓으면 루프가 `clampDomePitch` 목표로
 * 지수 복귀시킨다 — 벽에 딱 붙는 대신 눌렸다 되돌아오는 물성.
 */
export function resistDomePitch(pitch: number): number {
  if (pitch > DOME_PITCH_MAX)
    return DOME_PITCH_MAX + Math.min(DOME_PITCH_OVERSHOOT_CAP, (pitch - DOME_PITCH_MAX) * 0.25);
  if (pitch < DOME_PITCH_MIN)
    return DOME_PITCH_MIN - Math.min(DOME_PITCH_OVERSHOOT_CAP, (DOME_PITCH_MIN - pitch) * 0.25);
  return pitch;
}

/** 릴리스 관성의 프레임 감쇠 — dt 에 무관하게 같은 물성(기하 감쇠/ms). */
export function decayOrbitVelocity(velRadPerMs: number, dtMs: number): number {
  const v = velRadPerMs * Math.pow(ORBIT_VEL_DECAY_PER_MS, dtMs);
  return Math.abs(v) < ORBIT_VEL_EPS ? 0 : v;
}

/**
 * 평면 내 노드 드래그의 임계감쇠 스프링 한 스텝(semi-implicit Euler).
 * 노드가 포인터를 즉발 대신 **질량을 가진 것처럼** 따라오게 한다 — 잡은
 * 순간의 속도가 이어지고, 놓아도 목표(마지막 포인터 자리)로 이어 정착한다.
 * `angFreq` 는 `--topology-v2-camera-spring-angfreq-interactive`(크리스프
 * 층)를 그대로 받는다 — 새 이징을 짓지 않고 기존 값 층을 3D 축으로 확장.
 */
export interface DomeDragSpring {
  px: number;
  pz: number;
  vx: number;
  vz: number;
}

export function stepDomeDragSpring(
  spring: DomeDragSpring,
  targetPx: number,
  targetPz: number,
  dtMs: number,
  angFreq: number,
): void {
  const dt = Math.min(dtMs, 64) / 1000;
  const ax = angFreq * angFreq * (targetPx - spring.px) - 2 * angFreq * spring.vx;
  const az = angFreq * angFreq * (targetPz - spring.pz) - 2 * angFreq * spring.vz;
  spring.vx += ax * dt;
  spring.vz += az * dt;
  spring.px += spring.vx * dt;
  spring.pz += spring.vz * dt;
}

/** 돔이 현재 yaw/pitch 로 차지하는 월드 bbox — 3D 의 「제자리로」(핏 뷰) 입력. */
export function domeWorldBounds(
  model: DomeModel,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * `target` 과 같은 각(mod 2π)들 중 `current` 에 가장 가까운 등가각 —
 * 프로그램 회전(「제자리로」·선택 리프레임)이 반대로 반 바퀴 돌지 않게 한다.
 */
export function domeNearestYawTurn(target: number, current: number): number {
  return target + Math.round((current - target) / TAU) * TAU;
}

/**
 * 선택 리프레임의 yaw 목표 — 이 노드가 돔의 **앞면**(카메라에 가장 가까운
 * 자리, z2 최소)으로 오는 각. 투영에서 깊이는 `zr = r·sin(yaw + θ)`
 * (θ = atan2(pz, px)) 이므로 `yaw + θ = −π/2` 가 최솟값이다. 반환은 현재
 * yaw 에서 가장 가까운 등가각 — 회전 방향이 항상 짧은 쪽이다.
 *
 * 왜 앞면인가 (2026-08-18 2차, 소유자 *"클릭했을때도 적절한 카메라 이동
 * 모션이 필요할듯"*): 돔에서 노드는 구조의 **뒷면**에 있을 수 있고, 그때
 * 줌만 하면 대상이 다른 링들 뒤에 가려진 채 커진다. 2D 의 포커스 다이브가
 * «대상을 화면 가운데로»라면, 돔의 등가물은 «대상을 구조의 앞으로» — yaw 가
 * 카메라의 세 번째 축이라 회전이 곧 카메라 이동이다.
 */
export function domeFocusYaw(coord: DomeCoord, currentYaw: number): number {
  const r = Math.hypot(coord.px, coord.pz);
  // 축 위(project 꼭짓점 등)는 각이 없다 — 회전할 이유도 없다.
  if (r < 1e-6) return currentYaw;
  const theta = Math.atan2(coord.pz, coord.px);
  return domeNearestYawTurn(-Math.PI / 2 - theta, currentYaw);
}

/**
 * 주어진 자세에서 노드 집합(ego: 선택 노드 + 1-hop)이 투영되는 월드 bbox —
 * 선택 리프레임의 카메라 목표 입력. 모델에 없는 id 는 건너뛴다.
 */
export function domeEgoWorldBounds(
  model: DomeModel,
  ids: Iterable<string>,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const coord = model.coords.get(id);
    if (!coord) continue;
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * 프로그램 자세 이동(「제자리로」·선택 리프레임) — 카메라 트윈과 같은 큐빅
 * ease-in-out 시계를 yaw/pitch 에 태운다. 루프가 매 프레임 보간하고, 궤도
 * 드래그·휠·포인터다운이 시작되면 즉시 버려져 제스처가 이어받는다
 * (2D 카메라 트윈과 같은 중단 계약).
 */
export interface DomePoseTween {
  startYaw: number;
  startPitch: number;
  targetYaw: number;
  targetPitch: number;
  /** `performance.now()` 시계 — 카메라 트윈과 같은 기준. */
  startMs: number;
  durationMs: number;
}

/**
 * 돔 런타임 — 루프(`use-topology-loop.ts`)가 소유하고 매 프레임 갱신하는
 * 단일 상태 상자. 포인터 핸들러(궤도 드래그·평면 내 노드 드래그·히트테스트)
 * 와 계기가 **이 상자 하나**를 통해 이번 프레임의 좌표·자세를 공유한다 —
 * 제스처 판정(노드 vs 궤도)은 2D 와 같은 `hitTestWorld` 가 내린다(두 번째
 * 진실원을 만들지 않는다).
 */
export interface DomeRuntime {
  model: DomeModel;
  /** 마지막으로 그린 프레임의 노드별 전달 맵 — 히트/계기의 판정 기준. */
  frame: Map<string, DomeNodeFrame>;
  /**
   * 마지막 프레임에 그려진 노드들의 월드 bbox — 카메라 팬 리쉬(탄성 클램프)의
   * 앵커. 2D `world.bounds` 를 그대로 쓰면 돔 핏이 앉힌 카메라 중심과 리쉬
   * 앵커가 어긋나, 휠 줌 첫 틱에 클램프가 카메라를 2D 중심으로 끌어갔다
   * (2026-08-18 실측 — 커서 아래 월드 점이 175 유닛 이탈). `updateDomeFrame`
   * 이 매 프레임 갱신하고, 프레임이 비면 null(2D 경로 그대로).
   */
  drawnBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * 돔 전체가 15% 여백으로 화면에 앉는 카메라 배율 — 돔 핏이 계산해 넣는다.
   * 돔이 켜진 동안 카메라 배율 **하한**이 이 값까지 내려간다(2D 하한과의 min).
   *
   * 왜 (2026-08-18 실측): 돔의 투영 bbox 는 2D 스파인 bbox 보다 넓어서 핏
   * 배율(0.391)이 2D 앵커 기준 하한(0.574)보다 **아래**였다. 종전에는 핏이
   * 목표만 0.391 로 적고 스프링이 하한에 걸려 0.574 에 머물렀다 — 목표≠값인
   * 채로 첫 휠 틱이 목표 배율(0.391) 기준으로 앵커를 계산해 화면이 옆으로
   * 튀었고(월드 175 유닛), 핏 직후 줌아웃은 영원한 no-op 이었다(이미 목표가
   * 하한 밑). 하한을 핏 배율까지 내리면 목표가 도달 가능해져 목표=값이 서고,
   * 줌아웃은 «돔 전체 프레임»까지 돌아갈 수 있다. null = 돔 꺼짐(2D 그대로).
   */
  fitScale: number | null;
  /** 프레임 세대 — 엣지 후보 캐시 무효화 키(항이 제자리 갱신되므로 필요). */
  frameEpoch: number;
  yaw: number;
  pitch: number;
  /**
   * 궤도 드래그의 목표 자세 — 포인터 이벤트가 즉시 채우고, 루프가 매 프레임
   * `ORBIT_SMOOTH_TAU_MS` 로 yaw/pitch 를 이쪽으로 완화한다(이벤트 주기가
   * 프레임 주기보다 길 때의 계단 제거). 드래그 밖에서는 항상 yaw/pitch 와
   * 같게 동기화된다.
   */
  yawTarget: number;
  pitchTarget: number;
  /** 궤도 릴리스 관성(rad/ms) — `decayOrbitVelocity` 가 매 프레임 줄인다. */
  yawVel: number;
  /** pitch 릴리스 관성(rad/ms) — 같은 감쇠. */
  pitchVel: number;
  /**
   * 자율 회전 무장 여부 — 시선 끌기(attract) 루프는 **아직 아무도 만지지
   * 않은 화면**의 것이다 (2026-08-18 2차, 소유자 *"클릭하고 나서 좀
   * 안돌아가게 해주고"*). 사용자가 개입하면(궤도·줌·핀치·노드 드래그·선택)
   * false 로 내려가 되살아나지 않는다 — 작업 중인 자세와 회전이 싸우지 않게.
   * 명시적 복귀로는 「자동 정렬」 칩(자세 홈 이징)과 3D 재진입이 재무장한다.
   */
  spinArmed: boolean;
  /**
   * 진행 중인 프로그램 자세 이동 — 「제자리로」와 선택 리프레임이 채우고,
   * 루프가 매 프레임 큐빅으로 보간한다. 어떤 제스처든 시작되면 즉시 null
   * (제스처가 현재 자세에서 그대로 이어받는다 — 2D 트윈과 같은 계약).
   */
  poseTween: DomePoseTween | null;
  /** kind 별 yaw 비틀림(rad) — 궤도 드래그가 채우고 매 프레임 감쇠한다. */
  lag: Record<DomeViewKind, number>;
  /** 조립 시계 ms, 0..`DOME_ASSEMBLE_TOTAL_MS` — 켬은 정방향, 끔은 역방향. */
  rampClock: number;
  /** 타깃이 켬(3D)이고 영역(realm) 비활성 — 궤도/평면 드래그 분기 조건. */
  active: boolean;
  /** 궤도 드래그 진행 중(빈 곳 드래그) — 자율 회전·관성 정지 조건. */
  orbiting: boolean;
  /**
   * 평면 내 노드 드래그 — 잡힌 노드의 스프링 상태. `released` 후에도 스프링이
   * 마지막 목표로 이어 정착할 때까지 남는다(속도 연속 — 루프가 정착을 보고
   * 지운다).
   */
  drag: { nodeId: string; spring: DomeDragSpring; targetPx: number; targetPz: number; released?: boolean } | null;
}

/** 새 돔 런타임 — 자세는 기본값, 조립 시계 0(2D)에서 시작. */
export function createDomeRuntime(model: DomeModel): DomeRuntime {
  return {
    model,
    frame: new Map(),
    drawnBounds: null,
    fitScale: null,
    frameEpoch: 0,
    yaw: 0.55,
    pitch: DOME_PITCH_DEFAULT,
    yawTarget: 0.55,
    pitchTarget: DOME_PITCH_DEFAULT,
    yawVel: 0,
    pitchVel: 0,
    spinArmed: true,
    poseTween: null,
    lag: { project: 0, domain: 0, capability: 0, element: 0 },
    rampClock: 0,
    active: false,
    orbiting: false,
    drag: null,
  };
}
