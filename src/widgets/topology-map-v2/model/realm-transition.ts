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

/**
 * 전환 총 상한(ms). 처음 600ms 설계는 이탈/FLIP/결계가 동시에 몰려 5fps
 * 녹화에서 중간 프레임이 0장 — "컷 전환" 으로 읽혔다 (소유자 실보고 +
 * 프레임 검수). 페이즈를 시간축으로 분리해 각 동작이 읽히게 늘렸다:
 * 이탈(0–420) → FLIP(깊이별 240/380/520 지연부터 각 660, 최심 1180 정착) →
 * 결계 드로잉(700–1000). S5 에서 깊이 계층 순차 조립을 넣어 봉투를
 * 1000→1180 으로 늘렸다 — 가장 깊은 element 링(depth3+, 지연 520)이 660ms
 * FLIP 을 마치는 시점이다.
 */
export const REALM_ENVELOPE_MS = 1180;
/** 영역 안 노드 FLIP duration(ms) — ease-out. 깊이와 무관하게 동일. */
export const REALM_INSIDE_FLIP_MS = 660;
/**
 * depth1(도메인 링) FLIP 시작 지연(ms) — 밖 세계가 먼저 비워지는 걸 보여준 뒤
 * 재배치. 루트(depth0)·도메인(depth1)이 먼저 앉는다. 더 깊은 링은
 * `realmInsideFlipDelayFor` 로 계단식 지연.
 */
export const REALM_INSIDE_FLIP_DELAY_MS = 240;
/**
 * 깊이 계단 지연 폭(ms, S5) — depth2 는 +1 스텝, depth3+ 는 +2 스텝. 루트에서
 * 바깥 링으로 "층이 순차로 조립되는" 공감각을 만든다(각 링의 FLIP duration 은
 * 660 유지, 시작점만 밀린다).
 */
export const REALM_INSIDE_FLIP_DELAY_STEP_MS = 140;

/**
 * 멤버 깊이 → 그 링의 FLIP 시작 지연(ms). 루트/도메인(depth≤1)은 기본 지연,
 * capability(depth2)는 +1 스텝, element(depth3+)는 +2 스텝에서 멈춘다(그
 * 이상 깊이는 element 링을 공유하므로 같은 지연). 순수·결정론.
 */
export function realmInsideFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_INSIDE_FLIP_DELAY_MS;
  if (depth === 2) return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS;
  return REALM_INSIDE_FLIP_DELAY_MS + REALM_INSIDE_FLIP_DELAY_STEP_MS * 2;
}

/**
 * 영역 active 중 멤버 깊이 → 알파 배수(S5 깊이 선명도). depth1 1.0 · depth2 0.92 ·
 * depth3+ 0.84 — 틴트/블러 없이 알파만으로 "가까운 층이 더 또렷"한 깊이 신호.
 * 호버·ego 멤버는 호출부에서 1.0 으로 복귀시킨다. 순수·결정론.
 */
export function realmDepthClarityAlpha(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.92;
  return 0.84;
}

/**
 * 영역 active 중 멤버 깊이 → 스케일 배수(S5 깊이 선명도). depth1 1.0 · depth2 0.97 ·
 * depth3+ 0.94 — 깊은 층을 아주 살짝 작게 그려 원근을 보탠다(알파와 대칭). 순수.
 */
export function realmDepthClarityScale(depth: number): number {
  if (depth <= 1) return 1;
  if (depth === 2) return 0.97;
  return 0.94;
}
/** 영역 밖 노드 이탈 fling duration(ms) — ease-in 가속. */
export const REALM_OUTSIDE_FLING_MS = 420;
/** 결계 링 자기 드로잉 duration(ms). */
export const REALM_WARDING_DRAW_MS = 300;
/** 결계 드로잉 시작 지연(ms) — 세계가 대략 자리잡은 뒤 봉인. */
export const REALM_WARDING_DRAW_DELAY_MS = 700;
/** 도트 그리드 시차 낙하 rise→settle duration(ms). */
export const REALM_DUST_SETTLE_MS = 1000;

/** 이탈 노드가 중심에서 추가로 밀려나는 거리(월드 유닛) — 화면 밖으로 확실히 보내는 양. */
export const REALM_FLING_REACH = 4200;
/** 이탈 궤적의 접선 컬(라디안) — 곧게 날아가지 않고 살짝 휘어 "재편" 느낌. */
export const REALM_FLING_CURL = 0.5;

/**
 * === 퇴장(exiting) 안무 상수 (S6, fable 설계) ===
 *
 * 입장은 3페이즈 안무(이탈→깊이 순차 조립→결계)인데 초기 퇴장은 전 노드 홈
 * 스프링 + 카메라 fit 뿐이라 "닫히는 사건"이 없었다(비대칭). S6 은 입장의
 * **역재생**으로 퇴장을 다시 짠다 — 총 봉투 ~800ms:
 * - 0–250ms: 결계 링이 역방향으로 지워지고(draw 1→0), 영역 세계가 깊이 역순
 *   (깊은 층 먼저)으로 원위치 역FLIP 시작.
 * - 150–650ms: 밖 세계 노드들이 fling 위치에서 역중력으로 귀환(reach 1→0,
 *   ease-out 감속 착지) — 입장 fling 의 결정론 역재생.
 * - 카메라: overview fit 을 750ms 트윈으로 안무와 동기(입장 860ms 패턴).
 * 값은 문서화된 모듈 상수 — 입장 상수와 같은 선례(타이밍 지배, 테마 미지배).
 */
export const REALM_EXIT_ENVELOPE_MS = 800;
/** 결계 링 역방향 지우기 duration(ms) — draw progress 1→0. */
export const REALM_EXIT_WARDING_ERASE_MS = 250;
/** 안 노드 역FLIP duration(ms) — ease-out, 깊이와 무관하게 동일(시작만 계단). */
export const REALM_EXIT_FLIP_MS = 420;
/**
 * 역FLIP 깊이 계단 지연 폭(ms) — 입장의 정방향 계단(얕은 층 먼저)을 뒤집어
 * **깊은 층이 먼저** 떠난다. depth3+ → 0 스텝(가장 먼저), depth2 → +1, depth≤1
 * → +2(가장 늦게). 최대 지연 240 + FLIP 420 = 660 < 봉투 800.
 */
export const REALM_EXIT_FLIP_DELAY_STEP_MS = 120;
/** 밖 노드 역중력 귀환 duration(ms) — reach 1→0 ease-out 감속 착지. */
export const REALM_EXIT_OUTSIDE_RETURN_MS = 500;
/** 밖 노드 귀환 시작 지연(ms) — 결계가 지워지고 안 세계가 먼저 접히기 시작한 뒤. */
export const REALM_EXIT_OUTSIDE_RETURN_DELAY_MS = 150;

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
        // S6 — 퇴장 역재생 봉투(입장 역정신). 이전엔 FLIP 660 뿐이라 밖 노드
        // 역중력 귀환/결계 지우기를 담을 시간이 없었다.
        durationMs: event.reducedMotion ? 0 : REALM_EXIT_ENVELOPE_MS,
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

/**
 * 퇴장 역FLIP 시작 지연(ms) — 입장 `realmInsideFlipDelayFor`(얕은 층 먼저)의
 * 역순. **깊은 층이 먼저** 원위치로 떠난다: depth3+ → 0(가장 먼저), depth2 →
 * +1 스텝, depth≤1(루트/도메인) → +2 스텝(가장 늦게, 마지막까지 남는 척추).
 * 순수·결정론. 최대 지연 240 + FLIP 420 = 660 < 봉투 800.
 */
export function realmExitFlipDelayFor(depth: number): number {
  if (depth <= 1) return REALM_EXIT_FLIP_DELAY_STEP_MS * 2;
  if (depth === 2) return REALM_EXIT_FLIP_DELAY_STEP_MS;
  return 0;
}

/**
 * 결계 링 역방향 지우기 진행 1→0 — 입장 `realmWardingDrawProgress`(0→1)의
 * 역재생. elapsed 0 → 1(가득 찬 링), duration 후 → 0(지워짐). 같은 드로잉
 * 렌더러에 먹이면 호가 끝에서부터 되감겨 사라진다. 순수·결정론.
 */
export function realmWardingEraseProgress(
  elapsed: number,
  duration: number = REALM_EXIT_WARDING_ERASE_MS,
): number {
  if (duration <= 0) return 0;
  return clamp01(1 - elapsed / duration);
}

/**
 * 밖 노드 역중력 귀환의 reach 팩터 1→0 — 입장 fling(`easeInCubic` 로 0→1
 * 가속)의 **역재생**. `easeInCubic(1 - t)` 이므로 elapsed 0 에서 1(완전 이탈),
 * duration 에서 0(홈). 정방향이 끝에서 빨랐으니 역재생은 처음이 빠르고 착지에서
 * 감속한다("ease-out 감속 착지"). 순수·결정론.
 */
export function realmOutsideReturnReach(
  elapsed: number,
  duration: number = REALM_EXIT_OUTSIDE_RETURN_MS,
): number {
  if (duration <= 0) return 0;
  return easeInCubic(1 - clamp01(elapsed / duration));
}

/**
 * 밖 노드의 이번 프레임 귀환 좌표 — `realmOutsidePosition`(fling)의 역재생.
 * `from` 은 노드의 **원래(홈) 좌표**(입장 시 fling 출발점). reach 팩터가 1→0 로
 * 줄며 반경·컬이 되감겨 정확히 `from` 으로 착지한다(입장 궤적 완전 역전 — 튐
 * 없음). `duration<=0`(reduced-motion) 이면 즉시 홈.
 */
export function realmOutsideReturnPosition(
  from: Point,
  center: Point,
  elapsed: number,
  options?: { duration?: number; reach?: number; curl?: number; fallbackAngle?: number },
): Point {
  const duration = options?.duration ?? REALM_EXIT_OUTSIDE_RETURN_MS;
  const reach = options?.reach ?? REALM_FLING_REACH;
  const curl = options?.curl ?? REALM_FLING_CURL;
  const fallbackAngle = options?.fallbackAngle ?? 0;

  if (duration <= 0) return { x: from.x, y: from.y };

  const dx = from.x - center.x;
  const dy = from.y - center.y;
  const dist = Math.hypot(dx, dy);
  const baseAngle = dist > 1e-6 ? Math.atan2(dy, dx) : fallbackAngle;

  const e = realmOutsideReturnReach(elapsed, duration); // 1 → 0
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
