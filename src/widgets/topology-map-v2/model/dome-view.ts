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
/**
 * 원근 초점 거리(돔 단위) — 작을수록 넓은 렌즈, 즉 앞뒤 배율 차가 크다.
 *
 * 히어로 엔진에서 물려받은 값은 1050 이었다. 히어로는 **한 화면의 장식 오브젝트**
 * 라 원근이 세면 산만해지는 것이 맞다. 그런데 지도는 «이게 앞이고 저게 뒤»를
 * 읽으러 켜는 화면이고, 1050 에서는 그 차이가 거의 없다 — 바닥 링 반지름이
 * 224 이므로 가장 가까운 점 1050/(1050−224)=**1.27**, 가장 먼 점
 * 1050/(1050+224)=**0.82**, 배수로 1.55 다. 원판 하나의 지름 차이가 몇 px 이라
 * 크기로는 깊이가 안 읽히고, 결국 안개 혼자 깊이를 나르고 있었다.
 *
 * 760 으로 좁히면 1.42 / 0.77 = **1.84** 가 된다. 같은 장면에서 앞뒤 크기 차가
 * 19% 더 벌어지고, 회전할 때 앞으로 나오는 노드가 **커지면서** 나온다 — 그
 * 크기 변화 자체가 운동 시차의 일부라, 정지 화면과 회전 중 둘 다 깊이가
 * 세진다(Ware & Franck 1996 — 구조 있는 3D 운동이 스테레오보다 크게 기여).
 *
 * 더 좁히지 않는 이유: 500 아래에서는 바닥 링의 앞쪽 호가 화면 밖으로 밀려
 * 나가고(투영 배율 2 이상), 링이 잘리면 위도선이 깊이 단서 노릇을 못 한다.
 */
export const DOME_FOCAL = 760;
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
export const ORBIT_SMOOTH_TAU_MS = 14;

/*
 * ⚠️ **45 → 14 (2026-08-19, 소유자: *"마우스가 버벅 대면서 움직이던데"*).**
 *
 * 45ms 는 계단을 없애려고 넣은 값인데, 없애야 할 계단보다 **다섯 배 넓었다.**
 * 지수 추종에서 τ 는 목표의 63% 에 닿는 시간이라 45ms 면 95% 까지 약 135ms —
 * 120Hz 에서 **16프레임**이다. 그동안 돔은 손이 이미 지나간 자리를 따라간다.
 * 계단은 사라졌지만 그 대가로 「안 따라온다」가 생겼고, 직접 조작에서 그건
 * 계단보다 나쁜 병이다(직접 조작은 1:1 이 계약이다).
 *
 * 메우려던 구멍의 실제 크기: 포인터 60Hz + 화면 120Hz 면 **한 프레임(8.3ms)**
 * 이 빈다. τ=14ms 면 그 한 프레임을 두 프레임에 걸쳐 펴면서 지연은 한 프레임
 * 남짓이다. 즉 계단은 그대로 사라지고 지연만 사라진다.
 *
 * 값을 더 내리지 않는 이유: τ 가 프레임 간격 아래로 내려가면 스무딩이 사실상
 * 꺼져서 원래 계단이 돌아온다.
 */
/**
 * 릴리스 관성의 ms당 기하 감쇠 — `--topology-v2-camera-momentum-decay`(0.998)
 * 와 같은 값. 카메라 플릭과 같은 물성으로 미끄러지다 멎는다(R4 모션 헌법의
 * iOS 감속 상수 — 새 이징을 지어내지 않는다).
 */
export const ORBIT_VEL_DECAY_PER_MS = 0.998;
/**
 * ── 릴리스 투영과 «의미 있는 착지» ────────────────────────────────────────
 *
 * 관성만 있으면 돔은 **아무 각에서나** 멎는다. 물리적으로는 정직하지만
 * 제품으로는 우연이다: 손을 뗀 뒤 화면이 도착한 자리가 아무 뜻도 없다.
 *
 * Apple 의 «Designing Fluid Interfaces»(WWDC18 803)가 처방하는 것은 두 걸음이다.
 * ① 릴리스 속도로 **자연 착지점을 먼저 계산**하고, ② 그 착지점이 의미 있는
 * 자리 근처면 감속의 목표를 그 자리로 **다시 겨눈다**. UIScrollView 의 페이징이
 * 이것이고, 그래서 스크롤이 «임의의 위치»가 아니라 «다음 페이지»에서 멎는다.
 *
 * 이 돔에서 의미 있는 자리는 **도메인의 자오선**이다: 그 각에서 멎으면 도메인
 * 하나가 정면에 서고, 그 도메인의 containment 부채가 화면 중앙에 펴진다.
 * 읽으려고 돌리는 사람이 실제로 가려던 자리다.
 *
 * ## 왜 창이 좁은가 (이것이 이 기능의 안전장치다)
 *
 * 자연 착지점이 **이미 가까울 때만** 겨눈다. 넓게 잡으면 «내가 세운 자리를
 * 앱이 옮겼다»가 되고, 그건 직접 조작의 계약을 깨는 것이다. 창 밖이면 아무
 * 일도 안 하고 종전 관성 그대로 멎는다.
 */
export const ORBIT_SNAP_WINDOW_RAD = 0.14;

/**
 * 기하 감쇠의 **총 이동량 계수**(ms) — `Σ v·d^t dt = v / (−ln d)`.
 * 릴리스 순간의 속도에 이것을 곱하면 손대지 않았을 때 최종적으로 더 도는 각이다.
 */
export const ORBIT_DECAY_TRAVEL_MS = 1 / -Math.log(ORBIT_VEL_DECAY_PER_MS);

/** 릴리스 속도(rad/ms) → 손대지 않았을 때 멎는 yaw. */
export function projectOrbitLanding(yaw: number, yawVel: number): number {
  return yaw + yawVel * ORBIT_DECAY_TRAVEL_MS;
}

/**
 * 도메인이 **정면에 서는** yaw 들 — 이 돔의 «의미 있는 자리».
 *
 * 유도: `projectWithTrig` 에서 회전 후 깊이 항은 `zr = r·sin(θ + yaw)` 이고
 * (θ 는 그 노드의 링 위 방위), 카메라에 가장 가까운 것은 `zr` 이 최소일 때다.
 * 따라서 `θ + yaw = −π/2`, 즉 **yaw = −π/2 − θ**.
 */
export function domeFacingYaws(model: DomeModel, kind: DomeViewKind = "domain"): number[] {
  const out: number[] = [];
  const planeR = DOME_PLANE[kind].r;
  for (const coord of model.coords.values()) {
    if (Math.abs(coord.py - DOME_PLANE[kind].y) > 1e-6) continue;
    if (planeR <= 0) continue;
    const theta = Math.atan2(coord.pz, coord.px);
    out.push(-Math.PI / 2 - theta);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 자연 착지점 근처의 «의미 있는 자리» — 없으면 null(종전 관성 그대로).
 * 후보는 2π 주기이므로 착지점에 **가장 가까운 등가각**으로 접어서 비교한다.
 */
export function snapOrbitLanding(
  landing: number,
  candidates: readonly number[],
  windowRad = ORBIT_SNAP_WINDOW_RAD,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    // landing 에 가장 가까운 c + 2πk.
    const turns = Math.round((landing - c) / TAU);
    const near = c + turns * TAU;
    const dist = Math.abs(near - landing);
    if (dist < bestDist) {
      bestDist = dist;
      best = near;
    }
  }
  return best !== null && bestDist <= windowRad ? best : null;
}

/**
 * 착지로 데려가는 지수 접근의 시간 상수(ms) — **릴리스 속도와 이어지도록**
 * 역산한다: `d/dt = (target − yaw)/τ` 가 릴리스 순간 `yawVel` 과 같아야 하므로
 * `τ = (target − yaw)/yawVel`.
 *
 * 이 한 줄이 «속도 연속»이다. 고정 τ 를 쓰면 손을 뗀 프레임에 속도가 튄다.
 * 범위는 잠근다: 너무 짧으면 순간이동, 너무 길면 영원히 안 멎는다.
 */
export const ORBIT_SNAP_TAU_MIN_MS = 90;
/**
 * 상한 320ms 인 이유는 **꼬리 길이**다(2026-08-18 실측). 600ms 였을 때 큰
 * 플릭이 2.6초 뒤에도 목표에서 0.033rad 남아 있었다 — 눈에는 안 보이지만
 * (바깥 링에서 1px 보다 작다) 그동안 rAF 루프가 계속 깨어 있다. 320ms 면
 * 최악에서도 2초 안에 화면 판정 임계(`ORBIT_SNAP_ARRIVE_RAD`) 안으로 들어온다.
 */
export const ORBIT_SNAP_TAU_MAX_MS = 320;

/**
 * 착지 완료로 치는 잔차(rad) — **1px 보다 작아야** 한다.
 *
 * 바깥 링에서 1px 이 몇 rad 인지 실측: `224(돔 단위) × unit(≈1.8) × 배율
 * (≈0.315) ≈ 127px/rad` 이므로 1px ≈ 0.008rad. 그 절반을 쓴다. 지수 접근은
 * 원리적으로 목표에 도달하지 않으므로, 이 임계가 없으면 루프가 영원히 깨어 있다.
 */
export const ORBIT_SNAP_ARRIVE_RAD = 0.004;

export function orbitSnapTauMs(delta: number, yawVel: number): number {
  if (Math.abs(yawVel) < 1e-9) return ORBIT_SNAP_TAU_MAX_MS;
  const tau = delta / yawVel;
  if (!Number.isFinite(tau) || tau <= 0) return ORBIT_SNAP_TAU_MAX_MS;
  return Math.min(ORBIT_SNAP_TAU_MAX_MS, Math.max(ORBIT_SNAP_TAU_MIN_MS, tau));
}

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

/**
 * 깊이 헤일로 — **가까운 것이 먼 것을 실제로 가린다**는 사실을 2D 캔버스에서
 * 만들어 내는 장치. 선을 긋기 직전에 같은 곡선을 **캔버스 바탕색으로** 조금
 * 더 굵게 한 번 긋는다. 그러면 뒤에 이미 그려진 선·점이 그 폭만큼 잘려 나가고,
 * 눈은 그 절단을 «앞뒤»로 읽는다.
 *
 * 근거: Everts et al., *Depth-Dependent Halos: Illustrative Rendering of Dense
 * Line Data*, IEEE TVCG 15(6), 2009 (IEEE Vis 2009 Best Paper) — 헤일로 폭을
 * **깊이에 따라** 주면 선이 빽빽해도 다발 구조가 읽힌다. 같은 논문이 헤일로와
 * **선 굵기 감쇠**를 함께 쓰라고 처방하는데, 굵기 감쇠는 이 파일에 이미 있다
 * (`domeLineWidthFactor`). 계보는 Appel et al. 의 haloed line(1979)이다.
 *
 * ## 왜 이것이 「빛나게 하기」가 아닌가
 *
 * 헤일로는 **바탕색**이다 — 잉크를 더하는 것이 아니라 지우는 것이다. 헌장이
 * 금지한 glow 는 색을 사방으로 번지게 해 잉크를 **더한다**. 방향이 반대다.
 *
 * ## 왜 깊이에 따라 폭이 다른가
 *
 * 헤일로가 하는 일은 «내가 앞에 있다»는 주장이다. 먼 선이 굵은 헤일로를 두르면
 * 자기가 가리지도 못할 것을 가리겠다고 주장하는 셈이라, 깊이 단서가 오히려
 * 뒤집힌다. 그래서 가까울수록 넓고 멀수록 0 으로 수렴한다.
 *
 * 단위는 **화면 px** 다(월드가 아니다) — 헤일로는 잉크의 성질이지 물체의
 * 크기가 아니라, 줌을 해도 절단 폭이 같아야 한다.
 */
export const DOME_HALO_MAX_PX = 3.4;

/** 깊이 → 헤일로 반폭(화면 px). u=0 가까움 → 최대, u=1 멂 → 0. */
export function domeHaloPx(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return DOME_HALO_MAX_PX * Math.pow(1 - c, 1.35);
}

/**
 * 헤일로의 불투명도 배수 — 그 선이 지금 그려지는 알파에 곱한다.
 *
 * 잘라 내려면 헤일로가 **잘리는 쪽보다 진해야** 한다. 그런데 안개가 먼 선을
 * 이미 0.09 까지 낮췄으므로, 알파를 그대로 쓰면 가까운 선의 헤일로도 같이
 * 옅어져 아무것도 못 자른다. 그래서 곱해서 올리되 상한을 둔다 — 1.0 으로
 * 고정하면 «거의 안 보이는 먼 선»이 바탕에 진한 자국을 남긴다.
 */
export const DOME_HALO_ALPHA_GAIN = 2.4;
export const DOME_HALO_ALPHA_CAP = 0.96;

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
  /**
   * 이 좌표가 어느 배치로 만들어졌나 — 드로우가 «링을 그릴까»를 이걸로 정한다.
   * 결합 구름에는 kind 평면이 없으므로 위도 링은 좌표계가 아니라 거짓말이 된다.
   */
  arrangement: DomeArrangement;
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
/**
 * ── 배치 기준 — 「소유」와 「결합」 ────────────────────────────────────────
 *
 * 돔의 기하는 **두 가지 사실**을 적는다: 높이 = kind 티어, 방위 = 소속.
 * 그중 **방위만** 갈아끼우는 것이 이 축이다.
 *
 * - `ownership`(기본): 방위가 **containment 부모**에게서 온다. 답하는 질문은
 *   「이건 어디에 속하고 누가 소유하나」다.
 * - `coupling`: 방위를 **모든 관계**가 정한다(힘 완화). 답하는 질문은
 *   「조직도와 무관하게 무엇이 무엇에 붙어 있나」다. containment 가 가려 놓은
 *   `depends_on` 뭉침이 링 안에서 드러난다.
 *
 * ## 왜 티어는 안 푸는가 (자유 3D 힘 구름을 안 만든 이유)
 *
 * 티어를 풀면 높이가 나르던 타입 사실이 사라지고, 남는 것은 «예쁜 구름»이다.
 * 조사에서 이름 없는 계열로 지목된 **티어 구속 하이브리드**가 이 데이터에
 * 맞는 이유가 그것이다 — 티어는 계속 읽히고, 결합만 각도로 드러난다.
 * (Kobourov & Wampler 2005 의 구면 구속 스프링 임베더 계열; 우리 돔은 이미
 * 그 계열의 «위도=티어» 멤버다.)
 *
 * ## 결정론 — 이 축의 가장 중요한 성질
 *
 * 난수가 **하나도 없다.** 완화는 소유 배치가 낸 각도에서 **워밍스타트**하고
 * 반복 횟수가 고정이다. 그래서 같은 볼트는 언제 열어도 같은 그림이고, 두 배치
 * 사이를 오가도 노드가 제자리를 지킨다. 힘 배치가 새로고침마다 지도를 섞으면
 * 사용자의 공간 기억이 매번 깨진다 — 이 저장소의 고정 스케일 계약이 지키려는
 * 것과 같은 성질이다.
 */
export type DomeArrangement = "ownership" | "coupling";

/**
 * ── 「결합 구름」의 물성 ──────────────────────────────────────────────────
 *
 * 소유 배치가 **기하로 규칙을 적는 것**이라면(높이=티어, 방위=부모), 결합
 * 배치는 **아무 규칙도 안 적고 관계가 자리를 정하게** 둔다. 그래서 모양이
 * 돔이 아니라 구름이고, 그것이 요점이다 — 두 배치가 비슷하게 생겼으면 둘 중
 * 하나는 존재할 이유가 없다.
 *
 * ## 왜 티어를 안 붙잡나 (중간에 한 번 그렇게 만들었다가 되돌렸다)
 *
 * 처음에는 높이를 고정하고 방위만 완화하는 «티어 구속 하이브리드»로 만들었다.
 * 소유자 판정은 *"내가 원한건 원래 기존거 1개랑.. 아예 다른 모양"* 이었다.
 * 옳은 지적이다: 링에 묶인 채 각도만 틀어진 것은 돔의 변주이지 다른 읽기가
 * 아니다. 높이까지 관계가 정하게 두어야 «선언한 계층과 무관하게 무엇이
 * 뭉치나» 라는 질문에 답한다.
 *
 * ## 결정론 — 난수가 하나도 없다
 *
 * 씨앗은 **소유 배치의 좌표**다. 반복 횟수는 고정이고 무작위 흔들기가 없다.
 * 그래서 같은 볼트는 언제 열어도 같은 구름이고, 배치를 오가도 노드가 대충
 * 제자리에서 출발한다. 힘 배치가 새로고침마다 지도를 섞으면 사용자의 공간
 * 기억이 매번 깨진다 — 이 저장소의 고정 스케일 계약이 지키려는 성질이다.
 */
/**
 * 반복 상한. **수렴하면 이보다 먼저 멈춘다**(`settleEpsilon`) — 이 값은 목표가
 * 아니라 천장이다. 420 에서 260 으로 내린 근거는 실측이다: 전환이 메인 스레드를
 * 잡는 시간이 143ms 였고, 쌍 루프를 합쳐 100ms, 상한을 내려 그 아래로 왔다.
 * 사람이 «즉시»로 느끼는 한계가 100ms 다(Nielsen 1993).
 */
export const CLOUD_ITERATIONS = 260;
/** 모든 쌍이 서로 미는 세기. 거리 제곱에 반비례한다(쿨롱꼴). */
export const CLOUD_REPULSION = 16000;
/** 관계가 당기는 세기 — 훅 스프링. */
export const CLOUD_SPRING = 0.008;
/** 관계 하나의 자연 길이(돔 단위). */
export const CLOUD_REST_LENGTH = 92;

/**
 * ── 겹침 금지 ────────────────────────────────────────────────────────────
 *
 * 밀어냄만으로는 **겹치지 않는다는 보장이 없다.** 거리 제곱 반비례 힘은 가까울
 * 수록 세지지만 유한 스텝으로 적분하므로, 관계가 많은 노드는 스프링에 눌려
 * 이웃 위에 얹힌다. 소유자 판정(2026-08-18): *"너무 붙어있어서 좀 별론가?"*
 *
 * 그래서 매 반복 끝에 **원판이 실제로 안 겹치도록 밀어내는 패스**를 따로 돈다.
 * 힘이 아니라 위치 보정이라 스텝 크기와 무관하게 성립한다(d3-force 의
 * `forceCollide` 와 같은 문법).
 *
 * 반지름은 kind 별 점 반지름(`DOME_NODE_R`)에서 온다 — 화면에 그려지는 크기가
 * 곧 자리를 차지하는 크기여야 «보기에» 안 겹친다. 배수는 그 위의 여유다:
 * 1.0 이면 서로 닿고, 2.4 는 원판 사이에 원판 하나가 더 들어갈 만큼 벌린다.
 */
export const CLOUD_COLLIDE_RADIUS_SCALE = 2.4;
/** 한 번의 보정이 겹침의 몇 %를 해소하나. 1.0 은 진동하므로 절반씩 푼다. */
export const CLOUD_COLLIDE_RELAX = 0.5;

/**
 * ── 구름은 더 깊은 안개와 더 작은 점을 쓴다 ──────────────────────────────
 *
 * 힘 상수를 아무리 키워도 화면 밀도가 안 풀린다. 이유는 기하다: 배치가 끝나면
 * 반지름을 정규화하므로 **전체를 키우면 다시 줄어들고**, 남는 것은 모양의
 * 균일함뿐이다. 그런데 125개를 공 안에 채우면 투영 중앙은 언제나 앞뒤가 겹친다
 * — 그건 힘의 문제가 아니라 «부피를 평면에 눌러 담는» 문제다.
 *
 * 이 계열의 화면들이 실제로 쓰는 처방은 배치가 아니라 **렌더**다: 깊은 안개 +
 * 생각보다 작은 점 + 아주 얇은 선. 뒤쪽 절반을 대기로 물러나게 해 **눈에 들어오는
 * 밀도 자체를 반으로 줄인다.** 돔에는 층이라는 구조가 있어 이만큼 필요 없었다.
 *
 * 구현은 새 경로를 안 만든다 — `updateDomeFrame` 이 프레임 맵에 써 넣는 두 항
 * (`u` 깊이 · `s` 반지름 배수)을 구름에서만 다시 매긴다. 드로우·히트·계기가
 * 전부 그 두 항을 이미 읽으므로 배선이 0이다.
 */
export const CLOUD_DEPTH_GAMMA = 0.62;
export const CLOUD_NODE_SCALE = 0.78;
/** 원점으로 되당기는 아주 약한 힘 — 구름이 무한히 부풀지 않게. */
export const CLOUD_CENTERING = 0.0016;
/** 한 반복에서 노드가 움직일 수 있는 최대 거리 — 폭주 방지. */
export const CLOUD_MAX_STEP = 9;
/**
 * 쌍마다 미는 O(n²) 을 그대로 도는 상한. 이 볼트(82~125노드)는 한참 아래고,
 * 넘으면 반복을 줄여 시간이 선형에 가깝게 유지되게 한다. 옥트리(Barnes-Hut)는
 * 실제로 큰 볼트가 관측된 뒤에 만든다 — 지금 만들면 검증할 데이터가 없다.
 */
export const CLOUD_FULL_ITERATION_NODE_CAP = 400;

/**
 * 결합 구름 완화의 **재개 가능한 손잡이** — `step(budgetMs)` 를 반복 호출해
 * 예산 단위로 진행하고, 완료 프레임에 true 를 받는다.
 *
 * ## 왜 스텝퍼인가 (2026-08-19 실측)
 *
 * 완화는 O(n²)×반복이라 2,000 노드에서 **한 번에 돌리면 ~350ms** 다. 구름
 * 배치를 켠 채 지도를 열면 그 전부가 **첫 rAF 프레임 하나**에 실려, 부팅이
 * 단일 프레임 346~368ms 히치로 시작했다(실측, headless:false). 반복은 순수하게
 * 순차적이라 상태(좌표 배열 + 반복 카운터)만 들고 있으면 어디서든 끊었다
 * 이을 수 있고, **끊어 돌려도 부동소수점 연산의 순서가 완전히 같으므로 결과가
 * 비트 단위로 동일하다** — 같은 볼트는 언제 열어도 같은 구름이라는 결정론
 * 계약이 그대로 산다. 호출자(use-topology-loop)는 프레임마다 예산만큼 진행
 * 시키고, 완료 전에는 돔 런타임을 만들지 않는다.
 */
export interface CouplingCloudRelaxer {
  /** budgetMs 동안 반복을 진행한다. 완료(수렴 포함)면 true. */
  step(budgetMs: number): boolean;
}

/**
 * 결합 구름 — 관계가 자리를 정하는 3D 배치. `coords` 를 제자리 갱신한다.
 *
 * 힘 셋: ① 모든 쌍 밀어냄(거리 제곱 반비례) ② 관계 스프링(자연 길이로)
 * ③ 원점으로의 아주 약한 되당김. 감쇠는 반복이 진행될수록 세져서(냉각)
 * 마지막에는 자리가 굳는다 — 냉각이 없으면 고정 반복 끝에서 여전히 떨고 있어
 * 같은 입력이 미세하게 다른 그림을 낸다.
 *
 * 한 번에 끝까지 돌리는 종전 진입점 — 내부는 위 스텝퍼와 같은 코드라 결과가
 * 동일하다.
 */
export function relaxCouplingCloud(
  coords: Map<string, DomeCoord>,
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[],
): void {
  const relaxer = createCouplingCloudRelaxer(coords, nodes, edges);
  while (!relaxer.step(Number.POSITIVE_INFINITY)) {
    // step(∞) 은 한 호출에 완주한다 — 루프는 형식일 뿐 두 번 돌지 않는다.
  }
}

export function createCouplingCloudRelaxer(
  coords: Map<string, DomeCoord>,
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[],
): CouplingCloudRelaxer {
  const ids = nodes.map((n) => n.id).filter((id) => coords.has(id));
  const n = ids.length;
  if (n < 2) return { step: () => true };
  const index = new Map(ids.map((id, i) => [id, i]));

  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = coords.get(ids[i])!;
    px[i] = c.px;
    py[i] = c.py;
    pz[i] = c.pz;
  }

  const links: Array<[number, number]> = [];
  for (const e of edges) {
    const a = index.get(e.sourceId);
    const b = index.get(e.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    links.push([a, b]);
  }

  /*
   * 겹침 반지름 — kind 별 점 반지름에서 온다(`CLOUD_COLLIDE_RADIUS_SCALE`).
   * `DOME_NODE_R × 2.1` 이 드로우가 쓰는 돔 단위 반지름이라 그것을 기준으로 한다.
   */
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  const collideR = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const kind = kindOf.get(ids[i]) ?? "element";
    collideR[i] = DOME_NODE_R[kind] * 2.1 * CLOUD_COLLIDE_RADIUS_SCALE;
  }

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);
  const iterations =
    n <= CLOUD_FULL_ITERATION_NODE_CAP
      ? CLOUD_ITERATIONS
      : Math.max(60, Math.round((CLOUD_ITERATIONS * CLOUD_FULL_ITERATION_NODE_CAP) / n));

  /**
   * 수렴하면 멈춘다 — 한 반복에서 **가장 많이 움직인 노드**가 이 거리(돔 단위)
   * 밑이면 남은 반복은 화면을 안 바꾼다. 고정 반복만 돌면 이미 자리를 잡은
   * 배치에도 끝까지 계산을 낸다(실측: 전환이 메인 스레드를 143ms 잡았다).
   * 임계는 상수라 같은 입력이면 같은 반복 수에서 멈춘다 — 결정론 유지.
   */
  const settleEpsilon = 0.05;

  let iter = 0;
  let settled = false;
  let done = false;

  /** 원 for-루프의 한 바퀴 — 냉각 계수·수렴 판정까지 그대로다. */
  const runIteration = (): void => {
    fx.fill(0);
    fy.fill(0);
    fz.fill(0);

    /*
     * ①+② 밀어냄과 겹침을 **한 쌍 루프에서** 처리한다.
     *
     * 둘 다 같은 (dx, dy, dz, d) 를 필요로 하는데 따로 돌면 쌍 계산이 두 번이다
     * (반복당 2×n²/2). 합치면 그 절반이 그대로 사라진다 — 이 볼트에서 반복
     * 420회 × 7,750쌍 기준으로 **325만 쌍 계산이 준다**.
     *
     * 겹침은 힘이 아니라 **위치 보정**이라 힘 누적과 성격이 다르지만, 완화
     * 알고리즘에서는 같은 반복 안에서 순서만 지키면 된다(여기서는 위치 보정을
     * 먼저 적용하고 힘은 아래에서 한 번에 적분한다).
     */
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let dz = pz[i] - pz[j];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          // 정확히 겹친 쌍 — 결정론을 지키려면 난수 대신 **지수로** 가른다.
          dx = (i - j) * 1e-3;
          dy = 1e-3;
          dz = (j - i) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);

        // 밀어냄 — 거리 제곱 반비례(쿨롱꼴).
        const inv = CLOUD_REPULSION / d2 / d;
        const ux = dx * inv;
        const uy = dy * inv;
        const uz = dz * inv;
        fx[i] += ux;
        fy[i] += uy;
        fz[i] += uz;
        fx[j] -= ux;
        fy[j] -= uy;
        fz[j] -= uz;

        // 겹침 — 원판이 실제로 안 겹치도록 위치를 직접 민다.
        const want = collideR[i] + collideR[j];
        if (d < want) {
          const push = ((want - d) / d) * CLOUD_COLLIDE_RELAX * 0.5;
          px[i] += dx * push;
          py[i] += dy * push;
          pz[i] += dz * push;
          px[j] -= dx * push;
          py[j] -= dy * push;
          pz[j] -= dz * push;
        }
      }
    }

    // ③ 관계 스프링 — 자연 길이로 당기거나 민다.
    for (const [a, b] of links) {
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const dz = pz[b] - pz[a];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const pull = (d - CLOUD_REST_LENGTH) * CLOUD_SPRING;
      const ux = (dx / d) * pull;
      const uy = (dy / d) * pull;
      const uz = (dz / d) * pull;
      fx[a] += ux;
      fy[a] += uy;
      fz[a] += uz;
      fx[b] -= ux;
      fy[b] -= uy;
      fz[b] -= uz;
    }

    // ④ 원점 되당김 + 냉각 적용.
    const cool = 1 - iter / iterations;
    let maxStep = 0;
    for (let i = 0; i < n; i += 1) {
      fx[i] -= px[i] * CLOUD_CENTERING;
      fy[i] -= py[i] * CLOUD_CENTERING;
      fz[i] -= pz[i] * CLOUD_CENTERING;
      const step = Math.hypot(fx[i], fy[i], fz[i]);
      const scale = (step > CLOUD_MAX_STEP ? CLOUD_MAX_STEP / step : 1) * cool;
      const mx2 = fx[i] * scale;
      const my2 = fy[i] * scale;
      const mz2 = fz[i] * scale;
      px[i] += mx2;
      py[i] += my2;
      pz[i] += mz2;
      const moved = Math.hypot(mx2, my2, mz2);
      if (moved > maxStep) maxStep = moved;
    }
    if (maxStep < settleEpsilon) settled = true;
    iter += 1;
  };

  /*
   * **무게중심을 원점으로 옮긴다** — 회전축이 구름 밖에 있으면 안 된다.
   *
   * 투영은 언제나 원점을 중심으로 돈다. 구름의 무게중심이 원점에서 벗어나
   * 있으면 궤도 드래그가 «구름을 회전»시키는 것이 아니라 «구름을 원점 둘레로
   * 휘두르는» 것이 되어, 조금만 돌려도 화면 밖으로 쓸려 나간다(실측:
   * 12스텝 드래그에 구름이 화면 우하단으로 이탈). 돔은 애초에 원점 대칭이라
   * 이 문제가 없었고, 그래서 구름을 만들 때 처음으로 드러났다.
   */
  const finalize = (): void => {
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < n; i += 1) {
      mx += px[i];
      my += py[i];
      mz += pz[i];
    }
    mx /= n;
    my /= n;
    mz /= n;

    // 카메라 핏과 안개 정규화가 돔과 같은 스케일을 보도록 반지름을 맞춘다.
    let maxR = 0;
    for (let i = 0; i < n; i += 1) {
      const r = Math.hypot(px[i] - mx, py[i] - my, pz[i] - mz);
      if (r > maxR) maxR = r;
    }
    const norm = maxR > 1e-6 ? DOME_FIT_RADIUS / maxR : 1;
    for (let i = 0; i < n; i += 1) {
      const c = coords.get(ids[i])!;
      c.px = (px[i] - mx) * norm;
      c.py = (py[i] - my) * norm;
      c.pz = (pz[i] - mz) * norm;
    }
  };

  return {
    step(budgetMs: number): boolean {
      if (done) return true;
      // 예산 시계 — 반복 하나(쌍 루프 O(n²))가 최소 단위라, 예산을 넘긴 채
      // 끝난 반복까지는 인정하고 다음 호출에서 이어 간다.
      const start = performance.now();
      while (iter < iterations && !settled) {
        runIteration();
        if (performance.now() - start >= budgetMs) break;
      }
      if (iter >= iterations || settled) {
        finalize();
        done = true;
      }
      return done;
    },
  };
}

/**
 * 프레임이 결합 구름 완화 한 슬라이스에 쓰는 예산(ms).
 *
 * 왜 28 인가: long task 문턱(50ms) 아래에 여유를 두면서, 종전 동기 히치
 * (2,000 노드 ~350ms)와 총 소요가 비슷하게 유지되는 값이다 — 12 슬라이스
 * ×28ms ≈ 340ms 계산에 프레임 경계 양보가 몇 ms 씩 더해져, 조립 시작 시점은
 * 종전과 수십 ms 안쪽으로 같다(연출 타이밍 보존). 더 줄이면 완화가 프레임
 * 수십 개에 걸쳐 조립 시작이 눈에 띄게 밀리고, 더 키우면 도로 히치가 된다.
 */
export const DOME_BUILD_SLICE_MS = 28;

export interface DomeModelBuild {
  /** 완성 전에는 쓰면 안 되는 모델 — `step` 이 true 를 낸 뒤에만 유효하다. */
  model: DomeModel;
  /** null 이면 이미 완성. 아니면 완료 프레임까지 예산 단위로 호출한다. */
  step: ((budgetMs: number) => boolean) | null;
}

/**
 * `buildDomeModel` 의 **단계형** 진입점 — 기하 씨앗(소유 배치)은 즉시 짓고,
 * 결합 구름의 O(n²) 완화만 `step` 으로 넘긴다. 왜 필요한가:
 * `CouplingCloudRelaxer` 독블록(부팅 단일 프레임 346~368ms 히치 실측).
 * 슬라이스로 돌려도 결과는 비트 단위로 동일하다.
 */
export function beginDomeModelBuild(
  nodes: readonly DomeInputNode[],
  options?: {
    /** 방위를 무엇이 정하나 — 위 `DomeArrangement` 독블록. 생략 시 `ownership`. */
    arrangement?: DomeArrangement;
    /** `coupling` 일 때 각도를 정하는 관계들. 생략하면 소유 배치와 같아진다. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModelBuild {
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

  /*
   * 「결합」 배치 — 소유 배치가 낸 각도에서 **워밍스타트**해서 완화한다.
   * 처음부터 임의 각으로 시작하지 않는 이유는 결정론과 공간 기억이다
   * (`DomeArrangement` 독블록).
   */
  const model: DomeModel = {
    centerX: cx,
    centerY: cy,
    unit,
    coords,
    arrangement: options?.arrangement ?? "ownership",
  };
  if (options?.arrangement === "coupling" && options.edges && options.edges.length > 0) {
    const relaxer = createCouplingCloudRelaxer(coords, nodes, options.edges);
    return { model, step: (budgetMs: number) => relaxer.step(budgetMs) };
  }
  return { model, step: null };
}

export function buildDomeModel(
  nodes: readonly DomeInputNode[],
  options?: {
    /** 방위를 무엇이 정하나 — 위 `DomeArrangement` 독블록. 생략 시 `ownership`. */
    arrangement?: DomeArrangement;
    /** `coupling` 일 때 각도를 정하는 관계들. 생략하면 소유 배치와 같아진다. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModel {
  const build = beginDomeModelBuild(nodes, options);
  if (build.step !== null) {
    while (!build.step(Number.POSITIVE_INFINITY)) {
      // step(∞) 은 한 호출에 완주한다 — 위 relaxCouplingCloud 와 같은 형식.
    }
  }
  return build.model;
}

/**
 * 높이 y 에서의 **껍질 반지름** — 링 넷을 지나는 **볼록한** 곡면.
 *
 * ## 왜 링 사이를 직선으로 잇지 않나 (2026-08-18 실측으로 되돌린 첫 시도)
 *
 * 처음에는 (y, r) 표본 넷을 선형 보간했다. 그러면 아래 `domeEdgeControl` 의
 * 휨이 **정확히 0 이 된다** — 꼭짓점에서 링으로 내려가는 현(chord)의 중점이
 * 이미 그 선형 보간값 위에 있기 때문이다. 선형 껍질에서 반지름 방향 관계선은
 * 껍질을 «따라가는» 것이 아니라 껍질 **그 자체**다. 화면은 그대로 천막이었다.
 *
 * 그래서 껍질을 구면 옆모습으로 바꾼다: 꼭짓점 높이에서 0, 바닥 링 높이에서
 * 바닥 반지름, 그 사이는 `√(1−t²)` 로 **바깥으로 부푼다**. 링 넷은 이 곡면
 * 안쪽에 앉는다(실측: domain 148 vs 곡면 162 · capability 192 vs 210) — 즉
 * 링은 데이터가 앉는 자리이고 곡면은 관계선이 타고 넘는 겉면이라, 둘이 겹치지
 * 않는 것이 오히려 맞다.
 *
 * 값은 표에서 유도한다(상수 재입력 0): 꼭짓점 높이·바닥 링의 높이와 반지름.
 */
export function domeShellRadiusAtY(y: number): number {
  const top = DOME_PLANE.project.y;
  const bottom = DOME_PLANE.element.y;
  const rMax = DOME_PLANE.element.r;
  const span = top - bottom;
  if (span <= 1e-6) return rMax;
  const t = (y - bottom) / span; // 0 바닥 … 1 꼭짓점
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return rMax * Math.sqrt(Math.max(0, 1 - c * c));
}

/**
 * 관계선의 **자오선 휨** 정도 — 0 이면 직선 현(chord), 1 이면 곡선의 중점이
 * 껍질에 정확히 닿는다.
 *
 * ## 왜 휘어야 하나 — 이것이 「천막」과 「돔」을 가른다
 *
 * 첫 구현의 관계선은 전부 **현**이었다. 꼭짓점에서 아래 링으로 내려가는 선이
 * 돔 **속을** 가로질러서, 화면에는 꼭짓점에서 뻗은 살들이 남고 그 실루엣은
 * 돔이 아니라 **천막(원뿔)** 이다. 그리고 그 살들은 전부 한 점을 지나므로
 * 중앙이 가장 빽빽해진다 — 실제로 가장 안 읽히는 자리가 가장 중요한 자리
 * (project·domain)였다.
 *
 * 중점을 껍질까지 밀면 같은 두 점을 잇는 선이 **겉면을 타고** 간다. 셋이 동시에
 * 좋아진다: ① 실루엣이 구면이 된다 ② 중앙이 비어서 스파인이 읽힌다 ③ 서로 다른
 * 부모의 자오선이 각자 자기 방위로 갈라져 교차가 준다.
 *
 * 1 이 아니라 0.9 인 이유: 껍질에 딱 붙이면 가장 바깥 자오선이 화면 실루엣의
 * 윤곽선과 겹쳐 «테두리를 그린 것»처럼 보인다. 한 뼘 안쪽에 둔다.
 *
 * 3D 라이브러리의 같은 개념은 `linkCurvature`(vasturiano/3d-force-graph)다 —
 * 기법만 참고했고 코드 이식은 없다(이 저장소는 그래프 렌더 의존성을 두 번
 * 걷어낸 전례가 있다, 원장 2026-08-18 (76) 기각 ③).
 */
export const DOME_EDGE_BOW = 0.9;

/**
 * 두 노드를 잇는 관계선의 제어점(돔 좌표) — 위 `DOME_EDGE_BOW` 참고.
 * 둘 중 하나라도 좌표가 없으면 null(호출부가 2D 제어점을 그대로 쓴다).
 *
 * ## 제어점은 곡선이 지나는 점이 아니다 — 2배로 민다
 *
 * 2차 베지어는 t=0.5 에서 `(A + 2C + B)/4` 를 지난다. 즉 곡선의 중점은 현의
 * 중점과 제어점의 **한가운데**다. 그래서 곡선을 껍질까지 보내려면 제어점을 그
 * **두 배**로 밀어야 한다. 이 한 줄을 빼면 휨이 늘 의도의 절반이 되고, 그
 * 절반은 «휜 것 같기도 한데» 로 읽힌다.
 */
export function domeEdgeControl(model: DomeModel, sourceId: string, targetId: string): DomeCoord | null {
  // 결합 구름에는 껍질이 없다 — 휘게 할 겉면이 없으므로 곧게 간다(호출부가
  // null 을 2D 제어점으로 받아 처리한다).
  if (model.arrangement === "coupling") return null;
  const a = model.coords.get(sourceId);
  const b = model.coords.get(targetId);
  if (!a || !b) return null;
  const mx = (a.px + b.px) / 2;
  const my = (a.py + b.py) / 2;
  const mz = (a.pz + b.pz) / 2;
  const chordR = Math.hypot(mx, mz);
  const shellR = domeShellRadiusAtY(my);
  // 이미 껍질 밖(드래그로 밀려난 노드, 지름 방향으로 마주 본 쌍)이면 더 밀지
  // 않는다 — 안쪽으로 끌어당기면 그 선만 반대로 휘어 «저건 왜 저러지» 가 된다.
  const target = Math.max(chordR, shellR * DOME_EDGE_BOW);
  const controlR = chordR + (target - chordR) * 2;
  if (chordR < 1e-6) {
    /*
     * 중점이 축 위다 — 지름 방향으로 마주 본 두 노드이거나 꼭짓점 바로 아래다.
     * 밀어낼 방향이 없으므로 **두 끝점의 방위 합**으로 민다. 그래야 마주 본 두
     * 노드를 잇는 선도 축을 관통하지 않고 한쪽으로 돌아간다. 그 합마저 0 이면
     * (완전한 대척점) 휘지 않는다 — 어느 쪽으로 도는지 데이터가 말하지 않는데
     * 임의로 고르면 회전 중 방향이 튄다.
     */
    const sx = a.px + b.px;
    const sz = a.pz + b.pz;
    const n = Math.hypot(sx, sz);
    if (n < 1e-6) return { px: mx, py: my, pz: mz };
    return { px: (sx / n) * controlR, py: my, pz: (sz / n) * controlR };
  }
  const k = controlR / chordR;
  return { px: mx * k, py: my, pz: mz * k };
}

/**
 * ── 돔의 «손잡이» — 어디를 끌면 돌리고 어디를 끌면 옮기나 ─────────────────
 *
 * 3D 에서 빈 곳 드래그는 처음부터 **전부 궤도 회전**이었다. 그래서 지도를
 * 옮길 방법이 하나도 없었다(소유자 실보고 2026-08-18: *"이 캔버스 자체를
 * 움직이고 싶은 경우에 방법이 없는데?"*). 2D 에서 늘 하던 «빈 곳을 끌면
 * 지도가 따라온다»가 3D 에서만 사라진 것이라, 이건 3D 의 새 규칙이 아니라
 * **기존 규칙이 덮인 것**이다.
 *
 * 가르는 기준은 소유자가 말한 그대로다: **물체 위면 돌리고, 물체 밖이면
 * 옮긴다.** 모드 토글도, 보조키도, 오른쪽 버튼도 없다 — 손이 무엇 위에
 * 있는지가 곧 무엇을 잡았는지다(직접 조작).
 *
 * ## 왜 bbox 가 아니라 타원인가
 *
 * 그려진 노드의 bbox 는 사각형이고 돔은 둥글다. 사각형으로 판정하면 **네
 * 모서리**가 «물체 위»가 된다 — 화면에는 아무것도 없는 검은 자리인데 끌면
 * 회전한다. 소유자가 가리킨 «이런 검은 부분»이 정확히 그 자리다. bbox 에
 * 내접하는 타원은 돔의 실루엣과 거의 겹치므로 눈에 보이는 것과 판정이 같다.
 *
 * ## 여백을 두는 이유
 *
 * 가장 바깥 노드의 중심이 곧 실루엣은 아니다(원판 반지름·라벨·선택 링이 그
 * 밖에 있다). 여백 없이 자르면 «분명 돔 가장자리를 잡았는데 지도가 옮겨진다»가
 * 된다. 반대로 크게 두면 검은 데를 끌어도 회전한다. 1.08 은 가장 바깥 노드
 * 원판(반지름 몇 px)과 그 선택 링을 덮는 최소치다.
 */
export const DOME_GRIP_MARGIN = 1.08;

/**
 * 이 월드 좌표가 돔의 «손잡이» 안인가 — true 면 궤도 회전, false 면 카메라 팬.
 * `bounds` 는 `DomeRuntime.drawnBounds`(이번 프레임에 실제로 그려진 노드들의
 * 월드 bbox)다. bbox 가 없으면(2D·조립 전) false — 판정할 물체가 없으면
 * 기본값인 팬이 이긴다.
 */
export function isInsideDomeGrip(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  worldX: number,
  worldY: number,
  margin = DOME_GRIP_MARGIN,
): boolean {
  if (bounds === null) return false;
  const halfW = ((bounds.maxX - bounds.minX) / 2) * margin;
  const halfH = ((bounds.maxY - bounds.minY) / 2) * margin;
  if (halfW <= 0 || halfH <= 0) return false;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const nx = (worldX - cx) / halfW;
  const ny = (worldY - cy) / halfH;
  return nx * nx + ny * ny <= 1;
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

/**
 * 관계선 제어점을 **월드 2D** 로 — `domeEdgeControl` + 현재 자세 투영.
 * 자세는 티어 비틀림 없는 `runtime.yaw` 를 쓴다: 제어점은 곡선의 모양을 정하는
 * 보조점이지 어느 티어에 속한 물체가 아니고, 비틀림을 섞으면 드래그 중 곡선이
 * 양 끝과 다른 박자로 흔들린다.
 */
export function domeEdgeControlWorld(
  runtime: DomeRuntime,
  sourceId: string,
  targetId: string,
): { wx: number; wy: number } | null {
  const coord = domeEdgeControl(runtime.model, sourceId, targetId);
  if (coord === null) return null;
  // 프레임당 한 번 구해 둔 삼각함수를 쓴다(`drawCosYaw` 독블록) — 엣지마다
  // cos/sin 을 다시 구하면 이 볼트에서만 프레임당 천 번이 넘는다.
  const p = projectWithTrig(
    runtime.model,
    coord,
    runtime.drawCosYaw,
    runtime.drawSinYaw,
    runtime.drawCosPitch,
    runtime.drawSinPitch,
  );
  return { wx: p.wx, wy: p.wy };
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
 * **프로그램 자세 이동에도 비틀림을 먹인다** — 이 배수만큼.
 *
 * ## 왜 (2026-08-18 3차)
 *
 * 비틀림(follow-through)은 손 드래그에서만 충전되고 있었다. 그래서 같은 회전이
 * **누가 돌렸느냐에 따라 다른 물건처럼** 움직였다: 손으로 돌리면 깊은 링이
 * 뒤처졌다 스프링백하는데, 노드를 클릭해 카메라가 날아갈 때는 네 링이 한 덩어리로
 * 굳어 돌았다. 후자가 곧 「JS 애니메이션」의 인상이다 — 물체가 자기 운동에
 * 반응하지 않는다.
 *
 * 고전 애니메이션의 follow-through 는 원인이 무엇이든 **질량이 있으면** 생긴다.
 * 카메라가 미는 회전도 물체 입장에서는 같은 회전이다. 그래서 같은 상수를 같은
 * 방식으로 먹이되, 배수 하나를 둔다 — 프로그램 이동은 손보다 훨씬 빨라
 * (반 바퀴를 750ms) 1.0 이면 잎 링이 12° 가까이 뒤처져 «부러진» 느낌이 난다.
 *
 * 부수 효과 하나가 그대로 정착 모션이다: 이동이 끝나면 충전이 멈추고 기존 감쇠가
 * 링을 제자리로 되감으므로, **도착 뒤 짧은 안정화 흔들림**이 공짜로 생긴다.
 * 새 이징도, 새 타이머도, 상시 회전도 없다.
 */
export const DOME_POSE_LAG_SCALE = 0.55;

/**
 * 이번 프레임의 yaw 이동만큼 티어 비틀림을 충전한다 — **손 드래그와 프로그램
 * 이동이 같은 함수를 쓴다.**
 *
 * 갈라 두면 갈라진다: 비틀림이 드래그 경로에만 있었기 때문에 같은 회전이
 * 누가 돌렸느냐에 따라 다른 물건처럼 움직였다(위 `DOME_POSE_LAG_SCALE` 참고).
 * 두 호출부가 한 함수를 쓰면 그 어긋남이 구조적으로 불가능해진다.
 *
 * `scale` 은 원인마다 다른 «미는 세기» 다: 손은 1(1:1 직접 조작), 프로그램
 * 이동은 훨씬 빨라 `DOME_POSE_LAG_SCALE`.
 */
export function chargeTierLag(lag: Record<DomeViewKind, number>, deltaYaw: number, scale = 1): void {
  const d = deltaYaw * scale;
  lag.project += d * DOME_TIER_LAG.project;
  lag.domain += d * DOME_TIER_LAG.domain;
  lag.capability += d * DOME_TIER_LAG.capability;
  lag.element += d * DOME_TIER_LAG.element;
}

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

/**
 * ── 진입 스윕 — 돔이 **일어서면서 돌아** 자리를 잡는다 ────────────────────
 *
 * 조립 스태거(위 `DOME_TIER_DELAY_MS`)는 링이 *솟는* 것만 안무한다. 카메라
 * 자세는 첫 프레임부터 최종값이라, 켜는 순간 **완성된 각도에 물건만 채워지는**
 * 모양이었다. 모션 그래픽에서 그 컷은 «배치»이지 «등장»이 아니다.
 *
 * 그래서 조립 시계에 자세를 하나 더 묶는다.
 *
 * - **pitch 는 위에서 시작한다**(거의 평면도). 링이 동심원으로 펴진 상태가
 *   먼저 보이므로 **구조가 먼저 읽히고**, 그다음 돔이 일어서면서 그 구조가
 *   입체가 된다. 정보 순서가 형태 순서와 같다.
 * - **yaw 는 조금 돌아 들어온다.** 회전은 운동 시차를 만드는 유일한 축이고,
 *   그 시차가 «이건 3D 다»를 말한다(Ware & Franck 1996 — 구조 있는 3D 운동이
 *   스테레오보다 이해도에 크게 기여한다. 다만 상시 회전은 읽기와 싸우므로
 *   여기서는 **진입에만** 쓰고 도착하면 0 이 된다).
 *
 * 값은 조립 램프의 잔여분(`1 − ease`)에 곱해 더해지므로, 램프가 끝나면 정확히
 * 0 이다 — 진입이 끝난 뒤에는 이 절이 존재하지 않는 것과 같다.
 */
export const DOME_ENTRY_PITCH_LIFT = 0.62;
export const DOME_ENTRY_YAW_SWEEP = 0.45;

/**
 * 진입 스윕의 **자기 시계**(ms) — 조립 시계를 쓰지 않는다.
 *
 * 처음에는 조립 시계(`rampClock`)에 묶었는데 화면에서 거의 안 보였다. 이유가
 * 기하에 있다: 조립 중 노드의 오프셋은 `(투영 위치 − 2D 위치) × 티어 램프` 라,
 * 램프가 낮은 동안에는 **자세를 어떻게 돌려도 노드가 거의 안 움직인다.** 즉
 * 스윕이 가장 센 구간과 그것이 보이는 구간이 어긋나 있었다.
 *
 * 그래서 시계를 따로 둔다. 스윕은 조립보다 **길게 살아서**(1500ms vs 1120ms)
 * 링이 다 올라온 뒤에도 남은 각을 마저 내려놓는다 — 그 마지막 구간이 실제로
 * 운동 시차가 읽히는 유일한 구간이다.
 *
 * 앞의 `HOLD` 동안은 1.0 에 머문다: 그 시간에는 스파인만 떠 있어서 자세를
 * 움직여 봐야 나를 정보가 없다. 붙잡아 두었다가 물건이 생긴 뒤에 내려놓는다.
 */
export const DOME_ENTRY_SWEEP_MS = 1500;
export const DOME_ENTRY_SWEEP_HOLD_MS = 220;

/**
 * 진입 스윕을 **자세에 개어 넣고** 무장을 내린다 — 손이 닿는 순간 호출한다.
 *
 * 그냥 `entryArmed = false` 로 끄면 그리는 자세가 한 프레임에 스윕 오프셋만큼
 * **툭 튄다**. 사용자가 잡은 그 프레임에 화면이 점프하는 것이라, 이 저장소가
 * 카메라 트윈·궤도 관성·자세 이동에서 일관되게 지키는 «제스처는 지금 그 자리를
 * 그대로 이어받는다» 계약을 정확히 어긴다.
 *
 * 그래서 오프셋을 실제 yaw/pitch 로 옮긴다: 그리는 자세는 바이트 그대로 유지되고,
 * 이후 프레임부터는 스윕이라는 개념 자체가 사라진다. pitch 는 한계 안으로
 * 잠근다(스윕은 표현층이라 한계를 몰랐다).
 */
export function commitDomeEntrySweep(runtime: DomeRuntime): void {
  if (!runtime.entryArmed) return;
  const sweep = domeEntrySweep(runtime.entryClock);
  runtime.entryArmed = false;
  if (sweep <= 0) return;
  runtime.pitch = clampDomePitch(runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep);
  runtime.yaw = runtime.yaw - DOME_ENTRY_YAW_SWEEP * sweep;
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

export function domeEntrySweep(entryClockMs: number): number {
  const t = (entryClockMs - DOME_ENTRY_SWEEP_HOLD_MS) / (DOME_ENTRY_SWEEP_MS - DOME_ENTRY_SWEEP_HOLD_MS);
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - domeEaseOutCubic(c);
}
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
  /*
   * 진입 스윕 — 그리는 자세에만 더한다(`DOME_ENTRY_PITCH_LIFT` 독블록).
   * `runtime.yaw/pitch` 를 직접 밀지 않는 이유: 그러면 진입 애니메이션이
   * 자율 회전·궤도 목표·자세 트윈과 같은 변수를 놓고 다투게 되고, 셋이
   * 겹치는 프레임에서 무엇이 이기는지가 코드에 없다. 오프셋은 표현층이라
   * 다툴 상대가 없다.
   */
  const sweep = runtime.entryArmed ? domeEntrySweep(runtime.entryClock) : 0;
  const drawPitch = runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep;
  const drawYawOffset = -DOME_ENTRY_YAW_SWEEP * sweep;
  const cp = Math.cos(drawPitch);
  const sp = Math.sin(drawPitch);
  runtime.drawYaw = runtime.yaw + drawYawOffset;
  runtime.drawPitch = drawPitch;
  runtime.drawCosYaw = Math.cos(runtime.drawYaw);
  runtime.drawSinYaw = Math.sin(runtime.drawYaw);
  runtime.drawCosPitch = cp;
  runtime.drawSinPitch = sp;
  const trig: Record<DomeViewKind, [number, number]> = {
    project: [0, 0],
    domain: [0, 0],
    capability: [0, 0],
    element: [0, 0],
  };
  const ramp: Record<DomeViewKind, number> = { project: 0, domain: 0, capability: 0, element: 0 };
  for (const kind of DOME_KINDS) {
    const yawK = runtime.yaw + runtime.lag[kind] + drawYawOffset;
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
      // 구름은 점이 작아야 밀도가 읽힌다(위 독블록).
      if (model.arrangement === "coupling") target *= CLOUD_NODE_SCALE;
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
  /*
   * 위도 링 표본 — 노드와 **같은 자세**(kind 별 yaw 비틀림 포함)로 투영한다.
   * 비틀림을 안 주면 드래그 중 링만 제자리에 남아 자기 티어에서 미끄러진다.
   *
   * 링의 z 는 정규화 범위(zMin/zMax)에 **넣지 않는다.** 링은 노드가 없는
   * 각도까지 한 바퀴를 다 도니 z 폭이 늘 노드보다 넓고, 그것을 범위에 넣으면
   * 노드 사이의 안개 대비가 그만큼 눌린다 — 좌표계가 데이터의 표현을 바꾸는
   * 셈이다. 링 자신의 u 는 아래에서 같은 범위로 클램프해 읽는다.
   */
  // 결합 구름에는 kind 평면이 없다 — 링을 그리면 없는 좌표계를 주장하는 것이다.
  const ringKinds = model.arrangement === "coupling" ? [] : DOME_RING_KINDS;
  for (let i = 0; i < ringKinds.length; i++) {
    const kind = ringKinds[i];
    const plane = DOME_PLANE[kind];
    const [cyK, syK] = trig[kind];
    let ring = runtime.rings[i];
    if (!ring || ring.kind !== kind) {
      ring = { kind, a: 0, points: [] };
      runtime.rings[i] = ring;
    }
    ring.a = ramp[kind];
    for (let k = 0; k < DOME_RING_SAMPLES; k++) {
      const theta = (k / DOME_RING_SAMPLES) * TAU;
      const p = projectWithTrig(
        model,
        { px: Math.cos(theta) * plane.r, py: plane.y, pz: Math.sin(theta) * plane.r },
        cyK,
        syK,
        cp,
        sp,
      );
      const point = ring.points[k];
      if (point) {
        point.wx = p.wx;
        point.wy = p.wy;
        point.u = p.z;
      } else {
        ring.points[k] = { wx: p.wx, wy: p.wy, u: p.z };
      }
    }
    ring.points.length = DOME_RING_SAMPLES;
  }
  runtime.rings.length = ringKinds.length;

  // 2 패스 — z 를 0..1 로 정규화(u). 전부 r=0 이면 span 이 없다 → u 0.
  const span = zMax - zMin;
  // 구름은 깊이를 더 가파르게 읽는다(`CLOUD_DEPTH_GAMMA` 독블록) — 뒤쪽이
  // 빨리 대기로 물러나야 앞쪽 무리가 읽힌다.
  const cloud = model.arrangement === "coupling";
  if (Number.isFinite(span) && span > 1e-9) {
    for (const entry of frame.values()) {
      if (entry.a > 0) {
        const t = (entry.u - zMin) / span;
        entry.u = cloud ? Math.pow(t, CLOUD_DEPTH_GAMMA) : t;
      } else entry.u = 0;
    }
  } else {
    for (const entry of frame.values()) entry.u = 0;
  }
  // 링도 같은 척도로 읽되 클램프한다(위 독블록 — 범위에는 안 넣고 읽기만 한다).
  if (Number.isFinite(span) && span > 1e-9) {
    for (const ring of runtime.rings) {
      for (const point of ring.points) {
        const t = (point.u - zMin) / span;
        point.u = t <= 0 ? 0 : t >= 1 ? 1 : t;
      }
    }
  } else {
    for (const ring of runtime.rings) for (const point of ring.points) point.u = 0;
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
/**
 * 링 위도선의 표본 한 점 — 월드 2D 좌표 + 이번 프레임의 정규화 깊이.
 * 노드 프레임(`DomeNodeFrame`)과 **같은 정규화**를 쓴다: 안개가 노드와 선에
 * 대해 다른 척도를 쓰면 같은 깊이의 둘이 다른 밝기로 그려진다.
 */
export interface DomeRingSample {
  wx: number;
  wy: number;
  u: number;
}

/** 한 kind 평면의 위도 링 — 표본 폴리라인 + 그 티어의 조립 램프. */
export interface DomeRing {
  kind: DomeViewKind;
  /** 조립 램프 0..1 — 2D↔3D 전환에서 링이 티어와 함께 뜨고 진다. */
  a: number;
  points: DomeRingSample[];
}

/**
 * 위도 링 — **돔이 돔으로 읽히게 하는 단 하나의 장치**.
 *
 * 링 없이 점과 선만 그리면 이 배치는 «꼭짓점에서 뻗은 살»(원뿔·천막)로 읽힌다.
 * 실제로 첫 구현이 그랬다. 각 kind 평면의 원을 실제로 그려 주면 세 가지가
 * 동시에 생긴다:
 *
 * 1. **높이가 타입 사실이라는 것이 보인다** — 링 셋이 층이므로 «위가 project,
 *    아래가 element» 가 설명 없이 읽힌다.
 * 2. **회전에 기준이 생긴다** — 타원의 납작함이 곧 pitch 이고, 링 위의 어느
 *    호가 앞인지가 곧 yaw 다. 링이 없으면 돌려도 «뭐가 달라졌는지» 모른다
 *    (같은 판정이 z-lift 안을 기각시켰다 — 원장 2026-08-18 (76)).
 * 3. **깊이가 연속 신호가 된다** — 노드는 이산이라 앞뒤 판단에 표본이 부족한데,
 *    링은 한 바퀴 내내 밝기가 이어져 안개 램프 자체를 눈에 보이게 만든다.
 *
 * 링은 **데이터가 아니라 좌표계**다 — 그래서 배경 도트 격자와 같은 역할
 * («좌표계가 있다는 것만 말한다»)이고, 잉크도 그 급으로 가장 낮다.
 */
export const DOME_RING_KINDS: readonly DomeViewKind[] = ["domain", "capability", "element"];

/**
 * 한 링의 표본 수. 96 이면 가장 큰 링(r=224)에서도 세그먼트 현-호 오차가
 * 0.1 돔 단위 밑이라 눈에 각지지 않는다. 3링 × 96 = 288 투영/프레임 —
 * 노드 125개 투영의 2.3배지만 둘 다 프레임 예산의 소수점 이하다.
 */
export const DOME_RING_SAMPLES = 96;

/**
 * 링 잉크의 기준 불투명도 — 안개·램프를 곱하기 전 값.
 *
 * 이 값이 커지면 좌표계가 데이터와 주목을 다툰다. 배경 도트 격자와 같은
 * 급(«있다는 것만 말한다»)이 되도록 낮게 잡는다. 가까운 호는 이 값 그대로,
 * 먼 호는 안개가 0.09 를 곱해 사실상 사라진다.
 */
export const DOME_RING_ALPHA = 0.34;

/** 링 헤어라인의 기준 굵기(화면 px) — 깊이 굵기 감쇠를 그대로 곱한다. */
export const DOME_RING_WIDTH_PX = 1;

export interface DomeRuntime {
  model: DomeModel;
  /**
   * 이번 프레임의 위도 링(월드 좌표) — `updateDomeFrame` 이 제자리 갱신한다.
   * 항과 배열이 재사용되므로 프레임당 할당은 0 에 수렴한다.
   */
  rings: DomeRing[];
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
   * 릴리스 관성이 겨누는 «의미 있는 착지» yaw — 없으면 null(순수 관성).
   * 포인터업이 자연 착지점을 투영해 채우고, 루프가 속도 연속 지수 접근으로
   * 데려간다. 어떤 새 입력이든 들어오면 즉시 null 이다(입력이 항상 이긴다).
   * 근거: `ORBIT_SNAP_WINDOW_RAD` 독블록.
   */
  yawSnap: number | null;
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
  /**
   * 진입 스윕이 아직 살아 있는가 — 손이 닿는 순간 꺼진다(`spinArmed` 와 같은
   * 계약). 스윕은 그리는 자세에만 더해지는 오프셋이라, 켜진 채로 노드를 잡으면
   * **평면 역투영이 그린 자세와 다른 자세를 풀어** 노드가 손에서 튄다.
   * 자세를 두 곳에서 정의하지 않는 가장 싼 방법이 «만지면 끈다» 다.
   */
  entryArmed: boolean;
  /** 진입 스윕의 자기 시계(ms) — 재진입마다 0 부터. `DOME_ENTRY_SWEEP_MS` 참고. */
  entryClock: number;
  /**
   * 이번 프레임이 **실제로 그린** 자세 — `yaw/pitch` + 진입 스윕 오프셋.
   * `updateDomeFrame` 이 매 프레임 써넣고, 그 프레임의 기하를 다시 계산해야
   * 하는 소비처(관계선 자오선 제어점)가 이것을 읽는다. `yaw/pitch` 를 읽으면
   * 진입 중 **제어점만 최종 자세**라 곡선이 끝점과 다른 세계를 지나간다.
   */
  drawYaw: number;
  drawPitch: number;
  /**
   * 그린 자세의 삼각함수 — **프레임당 한 번만** 구한다.
   *
   * 자오선 제어점은 엣지마다 불리므로(이 볼트 258회) 그 안에서 `cos/sin` 을
   * 다시 구하면 프레임당 천 번이 넘는다. 자세는 프레임 안에서 상수라 한 번
   * 구해 두면 되고, 그 캐시가 여기다.
   */
  drawCosYaw: number;
  drawSinYaw: number;
  drawCosPitch: number;
  drawSinPitch: number;
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
    rings: [],
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
    yawSnap: null,
    entryArmed: true,
    entryClock: 0,
    drawYaw: 0,
    drawPitch: DOME_PITCH_DEFAULT,
    drawCosYaw: 1,
    drawSinYaw: 0,
    drawCosPitch: Math.cos(DOME_PITCH_DEFAULT),
    drawSinPitch: Math.sin(DOME_PITCH_DEFAULT),
    lag: { project: 0, domain: 0, capability: 0, element: 0 },
    rampClock: 0,
    active: false,
    orbiting: false,
    drag: null,
  };
}
