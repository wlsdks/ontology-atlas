/**
 * "영역 전개" 전환 상태기계 + 모션 수학 (S4, fable 설계).
 *
 * 순수 모듈 — DOM/canvas/타이머 지식 없음. `ui/use-topology-loop.ts` 가 이
 * 리듀서로 phase 를 굴리고, 매 프레임 아래 evaluate 함수들로 노드 좌표·결계
 * 드로잉 진행·시차 팩터를 계산해 월드에 적용한다.
 *
 * 전환 안무 (600ms 상한, `prefers-reduced-motion` 은 즉시 전환):
 * - 영역 **안** 노드: 구좌표→신좌표 FLIP 보간 (ease-out ~300ms).
 * - 영역 **밖** 노드: 중심 기준 방사+접선 곡선 궤적으로 가속 이탈 (ease-in
 *   ~240ms) — "중력 재편" 느낌으로 화면 밖으로 밀려난 뒤 언마운트.
 * - 결계 링: stroke dash 자기 드로잉 ~200ms.
 * - 배경 도트 그리드: 전환 순간에만 중심 방사 시차 낙하 (rise→settle, 600ms
 *   후 정지). 지속 애니메이션 아님.
 *
 * 상수는 토큰이 아니라 문서화된 모듈 상수다 — `model/camera-easing.ts` 의
 * min/max duration 과 같은 "아직 토큰 없음" 선례. 값은 감(타이밍)을 지배하지
 * 테마 표면을 지배하지 않는다.
 */

/** 전환 총 상한(ms) — 안무 전체가 이 안에서 끝난다. */
export const REALM_ENVELOPE_MS = 600;
/** 영역 안 노드 FLIP duration(ms) — ease-out. */
export const REALM_INSIDE_FLIP_MS = 300;
/** 영역 밖 노드 이탈 fling duration(ms) — ease-in 가속. */
export const REALM_OUTSIDE_FLING_MS = 240;
/** 결계 링 자기 드로잉 duration(ms). */
export const REALM_WARDING_DRAW_MS = 200;
/** 도트 그리드 시차 낙하 rise→settle duration(ms). */
export const REALM_DUST_SETTLE_MS = 600;

/** 이탈 노드가 중심에서 추가로 밀려나는 거리(월드 유닛) — 화면 밖으로 확실히 보내는 양. */
export const REALM_FLING_REACH = 4200;
/** 이탈 궤적의 접선 컬(라디안) — 곧게 날아가지 않고 살짝 휘어 "재편" 느낌. */
export const REALM_FLING_CURL = 0.5;

export type RealmPhase = "idle" | "entering" | "active" | "exiting";

export interface RealmTransitionState {
  phase: RealmPhase;
  /** 현재/직전 영역 루트 id (idle 이면 null). */
  rootId: string | null;
  /** 현재 전환 시작 시각(performance.now 호환). idle/active 는 의미 없음. */
  startMs: number;
  /** 이번 전환 duration(ms). reduced-motion 이면 0(즉시). */
  durationMs: number;
}

export const INITIAL_REALM_TRANSITION_STATE: RealmTransitionState = {
  phase: "idle",
  rootId: null,
  startMs: 0,
  durationMs: 0,
};

export type RealmTransitionEvent =
  | { type: "enter"; rootId: string; now: number; reducedMotion: boolean }
  | { type: "exit"; now: number; reducedMotion: boolean }
  | { type: "tick"; now: number };

/**
 * 전환 리듀서 — 순수. `enter` 는 어떤 상태에서도 새 루트로 재진입(전환 시작).
 * `exit` 는 영역이 있을 때만 이탈 전환을 연다. `tick` 은 duration 경과 시
 * entering→active / exiting→idle 로 정착시킨다. reduced-motion 은 duration 0
 * 이라 다음 tick(또는 즉시)에 정착한다.
 */
export function realmTransitionReducer(
  state: RealmTransitionState,
  event: RealmTransitionEvent,
): RealmTransitionState {
  switch (event.type) {
    case "enter":
      return {
        phase: "entering",
        rootId: event.rootId,
        startMs: event.now,
        durationMs: event.reducedMotion ? 0 : REALM_ENVELOPE_MS,
      };
    case "exit":
      if (state.phase === "idle") return state;
      return {
        phase: "exiting",
        rootId: state.rootId,
        startMs: event.now,
        durationMs: event.reducedMotion ? 0 : REALM_INSIDE_FLIP_MS,
      };
    case "tick": {
      if (state.phase !== "entering" && state.phase !== "exiting") return state;
      if (event.now - state.startMs < state.durationMs) return state;
      return state.phase === "entering"
        ? { ...state, phase: "active" }
        : { ...INITIAL_REALM_TRANSITION_STATE };
    }
    default:
      return state;
  }
}

/** 영역 활성(전환 중 포함) — 이때만 서브트리만 그리고 결계를 두른다. */
export function isRealmEngaged(phase: RealmPhase): boolean {
  return phase !== "idle";
}

/** 바깥 노드를 하드 컬해도 되는 시점 — 이탈 fling 이 끝난 뒤(active/exiting-후반). */
export function isRealmOutsideCulled(state: RealmTransitionState, now: number): boolean {
  if (state.phase === "active") return true;
  if (state.phase === "idle" || state.phase === "exiting") return false;
  // entering — fling 이 끝났으면 컬 (envelope 보다 짧다).
  return now - state.startMs >= REALM_OUTSIDE_FLING_MS;
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** ease-out cubic — 빠르게 출발해 부드럽게 정착 (FLIP 안착). */
export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

/** ease-in cubic — 천천히 출발해 가속 (중력 이탈). */
export function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * 영역 안 노드의 이번 프레임 좌표 — 구좌표(from)에서 신좌표(to)로 FLIP.
 * `duration<=0`(reduced-motion) 이면 즉시 to. elapsed>=duration 이면 정확히 to.
 */
export function realmInsidePosition(
  from: Point,
  to: Point,
  elapsed: number,
  duration: number = REALM_INSIDE_FLIP_MS,
): Point {
  if (duration <= 0) return { x: to.x, y: to.y };
  const e = easeOutCubic(elapsed / duration);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

/**
 * 영역 밖 노드의 이번 프레임 좌표 — 중심에서 바깥으로 방사 가속 + 접선 컬.
 * `from` 이 중심과 일치하면 `fallbackAngle` 방향으로 이탈한다(결정론). elapsed
 * 가 진행할수록(ease-in) 반경이 `REALM_FLING_REACH` 만큼 늘고 방향이 컬만큼 휜다.
 */
export function realmOutsidePosition(
  from: Point,
  center: Point,
  elapsed: number,
  options?: { duration?: number; reach?: number; curl?: number; fallbackAngle?: number },
): Point {
  const duration = options?.duration ?? REALM_OUTSIDE_FLING_MS;
  const reach = options?.reach ?? REALM_FLING_REACH;
  const curl = options?.curl ?? REALM_FLING_CURL;
  const fallbackAngle = options?.fallbackAngle ?? 0;

  const dx = from.x - center.x;
  const dy = from.y - center.y;
  const dist = Math.hypot(dx, dy);
  const baseAngle = dist > 1e-6 ? Math.atan2(dy, dx) : fallbackAngle;

  if (duration <= 0) {
    // reduced-motion: 즉시 화면 밖으로.
    const r = dist + reach;
    return { x: center.x + Math.cos(baseAngle) * r, y: center.y + Math.sin(baseAngle) * r };
  }
  const e = easeInCubic(elapsed / duration);
  const r = dist + reach * e;
  const angle = baseAngle + curl * e;
  return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
}

/** 결계 링 자기 드로잉 진행 0..1 (stroke dash offset 구동). */
export function realmWardingDrawProgress(
  elapsed: number,
  duration: number = REALM_WARDING_DRAW_MS,
): number {
  if (duration <= 0) return 1;
  return clamp01(elapsed / duration);
}

/**
 * 도트 그리드 시차 낙하 팩터 0..1 — rise→settle 반주기(사인). 시작 0, 중간 최대,
 * `REALM_DUST_SETTLE_MS` 후 0 으로 정지(지속 애니메이션 금지). 호출부가 이 팩터에
 * 레이어 깊이·최대 이동량(화면 3% 이내)을 곱해 방사 오프셋을 만든다.
 */
export function realmDustParallaxFactor(
  elapsed: number,
  duration: number = REALM_DUST_SETTLE_MS,
): number {
  if (duration <= 0 || elapsed <= 0 || elapsed >= duration) return 0;
  return Math.sin(Math.PI * (elapsed / duration));
}
