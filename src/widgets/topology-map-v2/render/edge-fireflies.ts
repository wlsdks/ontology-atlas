/**
 * R6 상시 혜성 + 호버 펄스 — 프로토타입(`docs/prototypes/topology-b2plus.html`
 * §14 `updateParticles`/`updatePulses`, §13 `drawPulses`)의 두 엣지 모션을
 * 되살린 순수 모델 + 펄스 렌더러. 소유자 지시 "지금 건 내가 원하는 게 아냐 —
 * 예전 걸 살려줘"로 S10 의 포커스-게이트형 반딧불 점(dot)을 이 원본 사양으로
 * 대체한다.
 *
 * 두 효과:
 * 1. **상시 혜성 (comet)** — depends 엣지마다 per-edge 위상 `e.t`가 포커스와
 *    무관하게 항상 흐른다(`updateParticles` — `e.t = (e.t + dt*speed) % 1`).
 *    실제 코멧 꼬리 드로잉은 `render/traces.ts`가 `e.t`를 읽어 그린다(엣지
 *    커브와 같은 패스). 이 모듈은 위상 전진 모델만 소유한다.
 * 2. **호버 펄스 (pulse)** — 노드 호버 시 닿은 엣지들로 420ms 일회성 신호를
 *    호버 노드 바깥 방향으로 발사한다(`spawnHoverPulses` → `updatePulses`로
 *    수명 관리 → `drawPulses`로 렌더). bright 헤드 + 0.05 뒤 옅은 트레일,
 *    끝날수록 크기 축소(알파 페이드가 아니라 반지름 축소 — glow 금지 계약).
 *
 * 순수 계층: 캔버스/시간원(now)을 모른다 — 진행도는 인자로만 받는다. reduced-
 * motion 사용자에겐 위상 전진(0)·펄스 발사(0) 둘 다 미표시(정지 계약). 실제
 * 픽셀 드로우는 :3107 실화면에서 메인 세션이 검증하고, 여기선 위상 결정론·
 * 펄스 수명·방향만 단위 테스트로 핀한다.
 */

import { bezierPoint, type Point } from "./traces";

/** 펄스 수명(ms) — 프로토타입 `PULSE_DUR`. */
export const PULSE_DURATION_MS = 420;
/** 헤드/트레일 반지름(px) — 프로토타입 drawPulses. */
export const PULSE_HEAD_RADIUS_PX = 2.6;
export const PULSE_TRAIL_RADIUS_PX = 1.4;
/** 트레일이 헤드보다 얼마나 뒤(위상)에 붙는가 — 프로토타입 0.05. */
export const PULSE_TRAIL_LAG = 0.05;
/** 크기 축소 하한 — 끝에서도 완전히 사라지지 않게(프로토타입 max(0.35, …)). */
const PULSE_MIN_SCALE = 0.35;

/**
 * 엣지 양 끝 id 에서 결정론 시드 [0,1) 를 낸다(RNG 상태 없음). 같은 엣지는 항상
 * 같은 위상 오프셋 → `edge.t` 초기 시드로 써 상시 혜성이 lockstep(모든 엣지가
 * 같은 위상으로 동시에 흐르는 파도) 대신 서로 어긋나 흐르게 한다.
 */
export function fireflySeed(sourceId: string, targetId: string): number {
  const s = `${sourceId} ${targetId}`;
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 1000) / 1000;
}

/**
 * 위상 한 스텝 전진, [0,1) 랩. 결정론 — 같은 (t, dt, speed)는 같은 결과.
 * 음수 speed 방어(랩이 음수로 떨어지면 +1 보정)까지 순수.
 */
export function advanceParticlePhase(t: number, dt: number, speed: number): number {
  const next = (t + dt * speed) % 1;
  return next < 0 ? next + 1 : next;
}

/** `updateParticles`가 전진시키는 엣지의 최소 형태(월드 엣지의 부분집합). */
export interface ParticleEdge {
  kind: "contains" | "depends";
  /** 0..1 위상 — in place 로 전진된다. */
  t: number;
  sourceId: string;
  targetId: string;
}

/** 엣지 양 끝 id 를 세트/맵 키로 정규화 — `fireflySeed`와 같은 순서(source target)를 쓴다. */
export function edgePairKey(sourceId: string, targetId: string): string {
  return `${sourceId} ${targetId}`;
}

/*
 * perf 2026-08-19 — 페어 키·시드 캐시.
 *
 * `edgePairKey`(문자열 결합)와 `fireflySeed`(그 문자열 전체를 한 글자씩
 * 해싱)는 **엣지 수명 동안 값이 변하지 않는데** 매 프레임, 심지어 정렬
 * 비교자 안에서는 O(n log n)번 다시 계산되고 있었다(3D 회전 프로파일에서
 * `drawTopologyFrame` self 의 상당분). 엣지 객체는 월드 리빌드 때 통째로
 * 교체되고 제자리 변형되지 않으므로(`phaseCache` 독블록과 같은 근거)
 * WeakMap 으로 객체당 1회만 계산한다 — 값이 같으니 픽셀도 같다.
 */
interface EdgePairRef {
  sourceId: string;
  targetId: string;
}
const pairMetaCache = new WeakMap<EdgePairRef, { seed: number; key: string }>();

/** 이 엣지 객체의 (seed, key) — 객체 수명당 1회 계산. 값은 `fireflySeed`/`edgePairKey` 와 동일. */
export function edgePairMeta(edge: EdgePairRef): { seed: number; key: string } {
  let meta = pairMetaCache.get(edge);
  if (meta === undefined) {
    meta = { seed: fireflySeed(edge.sourceId, edge.targetId), key: edgePairKey(edge.sourceId, edge.targetId) };
    pairMetaCache.set(edge, meta);
  }
  return meta;
}

/**
 * Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 contains 엣지 코멧 캡.
 * 포커스 노드의 팬아웃이 크면(예: 자식 90개 domain) 전부 점등이 판독 불가한
 * 파티클 다발이 된다. `fireflySeed` 오름차순(결정론, RNG 상태 없음)으로
 * 랭크해 상위 `limit`개만 코멧 대상으로 고르고 나머지는 파티클 없이 기존 ego
 * 밝기만 유지한다(호출부가 이 Set 을 `updateParticles`의 진행 게이트와
 * `render/traces.ts`의 드로우 게이트 양쪽에 동일하게 적용).
 */
export const EGO_CONTAINS_COMET_LIMIT = 24;

export function selectEgoContainsComets(
  incidentContainsEdges: readonly { sourceId: string; targetId: string }[],
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): ReadonlySet<string> {
  return rankCometEdges(incidentContainsEdges, limit);
}

/**
 * 같은 캡을 **상시 앰비언트 `depends` 코멧**에도 건다 (2026-07-31).
 *
 * `contains` 갈래는 위 처방 E 로 24개 상한을 갖는데 `depends` 갈래에는 상한도
 * 랭킹도 없었다 — 오늘은 뷰포트 컬링과 티어 게이트가 사실상 상한 노릇을 하지만,
 * element 티어에서 화면이 `depends` 로 차면 동시에 흐르는 점 개수에 천장이 없다.
 *
 * ⚠️ **이건 #512(소유자의 앰비언트 복원)를 재뒤집는 게 아니다.** 혜성은 여전히
 * 상시로, 포커스와 무관하게, 같은 속도로 흐른다. 형제 갈래에 이미 있는 **승인된
 * 패턴을 빠진 쪽에 적용**하는 것뿐이다. 구 Guardian A1("코멧을 ego 한정으로")은
 * 소유자가 명시적으로 되돌렸고 그 결정은 그대로 선다.
 */
export function selectAmbientDependsComets(
  visibleDependsEdges: readonly { sourceId: string; targetId: string }[],
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): ReadonlySet<string> {
  return rankCometEdges(visibleDependsEdges, limit);
}

/**
 * 결정론 랭킹 — `fireflySeed` 오름차순, 동점은 pair key 사전순(RNG 상태 없음).
 *
 * perf 2026-08-19 — 이 함수는 매 프레임 불린다. 종전 비교자는 호출마다
 * `fireflySeed`(문자열 결합+해시)를 두 번 계산해 O(n log n)번의 문자열
 * 해싱이 됐다. `edgePairMeta` 캐시(엣지 객체당 1회)를 정렬 앞에서 꺼내
 * 두고 비교자는 숫자·캐시 문자열만 읽는다 — 비교 기준이 같으므로 결과
 * 집합은 종전과 원소까지 동일하다(정렬 안정성과 무관: 전순서 비교자).
 */
function rankCometEdges(
  edges: readonly { sourceId: string; targetId: string }[],
  limit: number,
): ReadonlySet<string> {
  const metas = edges.map((e) => edgePairMeta(e));
  metas.sort((a, b) => {
    const seedDiff = a.seed - b.seed;
    if (seedDiff !== 0) return seedDiff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return new Set(metas.slice(0, Math.max(0, limit)).map((m) => m.key));
}

/**
 * 프로토타입 `updateParticles` — depends 엣지의 위상을 항상 in place 전진한다.
 * reduced-motion 이면 아무 것도 하지 않는다(정지). `speedOf`로 엣지별 속도를
 * 받는다(ego 가속 등은 호출부가 결정 — 이 모듈은 모델/model 을 import 하지
 * 않아 순수하게 유지).
 *
 * 처방 E — contains 엣지는 기본적으로 정지지만, `isEgoContainsEligible`이
 * true 를 낸 엣지(선택 노드에 물린 + 캡 안쪽)만 depends 와 똑같이 전진한다.
 * 인자를 생략하면 전부 false(기존 "contains 는 항상 불변" 계약 그대로).
 */
export function updateParticles(
  edges: readonly ParticleEdge[],
  dt: number,
  reducedMotion: boolean,
  speedOf: (edge: ParticleEdge) => number,
  isEgoContainsEligible: (edge: ParticleEdge) => boolean = () => false,
): void {
  if (reducedMotion) return;
  for (const edge of edges) {
    if (edge.kind !== "depends" && !(edge.kind === "contains" && isEgoContainsEligible(edge))) continue;
    edge.t = advanceParticlePhase(edge.t, dt, speedOf(edge));
  }
}

/** 호버가 발사한 일회성 신호 펄스 하나. */
export interface Pulse {
  sourceId: string;
  targetId: string;
  /** +1 = source→target(순방향), -1 = target→source(역방향). 호버 노드 기준 바깥 방향. */
  dir: 1 | -1;
  /** 발사 시각(`performance.now()` 호환). */
  t0: number;
}

/** `spawnHoverPulses`가 닿는 엣지를 고를 때 보는 최소 형태. */
export interface PulseEdge {
  sourceId: string;
  targetId: string;
}

/**
 * 프로토타입 `startRipple`의 펄스 부분 — 호버 노드에 닿는 엣지마다 바깥 방향
 * 펄스 하나를 만든다. reduced-motion 이면 빈 배열(발사 없음). 순수 — 상태
 * 저장은 호출부(ref)가 한다.
 */
export function spawnHoverPulses(
  hoveredId: string,
  touchingEdges: readonly PulseEdge[],
  now: number,
  reducedMotion: boolean,
): Pulse[] {
  if (reducedMotion) return [];
  const out: Pulse[] = [];
  for (const edge of touchingEdges) {
    if (edge.sourceId !== hoveredId && edge.targetId !== hoveredId) continue;
    out.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      dir: edge.sourceId === hoveredId ? 1 : -1,
      t0: now,
    });
  }
  return out;
}

/**
 * 프로토타입 `updatePulses` — 수명(`durationMs`)이 지난 펄스를 제거한다.
 * 남은 게 없거나 전부 살아있으면 새 배열 할당을 피한다(입력 그대로 반환).
 */
export function updatePulses(pulses: readonly Pulse[], now: number, durationMs = PULSE_DURATION_MS): Pulse[] {
  if (pulses.length === 0) return pulses as Pulse[];
  const alive = pulses.filter((p) => now - p.t0 < durationMs);
  return alive.length === pulses.length ? (pulses as Pulse[]) : alive;
}

/** 펄스의 raw 진행도(0..1) — 발사 후 경과 / 수명. 범위 밖이면 그리지 않는다. */
export function pulseRawProgress(t0: number, now: number, durationMs = PULSE_DURATION_MS): number {
  return (now - t0) / durationMs;
}

/** raw 진행도에서의 크기 배수 — 끝으로 갈수록 축소(알파 아님), 하한 `PULSE_MIN_SCALE`. */
export function pulseScale(raw: number): number {
  return Math.max(PULSE_MIN_SCALE, 1 - raw);
}

/**
 * 펄스 하나의 헤드/트레일 위상을 낸다(순수). `head`는 진행 방향으로 흐르는
 * 위치, `trail`은 그 뒤 `PULSE_TRAIL_LAG`(0.05). 트레일이 [0,1] 밖이면 null.
 */
export function pulseHeadTrail(dir: 1 | -1, raw: number): { head: number; trail: number | null } {
  const head = dir === 1 ? raw : 1 - raw;
  const trailT = dir === 1 ? head - PULSE_TRAIL_LAG : head + PULSE_TRAIL_LAG;
  return { head, trail: trailT >= 0 && trailT <= 1 ? trailT : null };
}

/** `drawPulses`가 펄스 → 스크린 좌표 곡선을 얻는 리졸버. 사라진 엣지면 null. */
export type PulseEdgeResolver = (pulse: Pulse) => { a: Point; control: Point; b: Point } | null;

export interface PulseColors {
  /** 헤드(bright). */
  head: string;
  /** 트레일(옅은). */
  trail: string;
}

/**
 * 활성 펄스들을 그린다 — 순수 원점(dot)만(glow/링/네온 없음). 헤드 2.6px +
 * 0.05 뒤 트레일 1.4px, 끝날수록 반지름 축소. 좌표는 `resolve`가 스크린
 * 스페이스로 준다(캘러가 카메라 투영 소유).
 */
export function drawPulses(
  ctx: CanvasRenderingContext2D,
  pulses: readonly Pulse[],
  now: number,
  resolve: PulseEdgeResolver,
  colors: PulseColors,
): void {
  if (pulses.length === 0) return;
  for (const pulse of pulses) {
    const raw = pulseRawProgress(pulse.t0, now);
    if (raw < 0 || raw > 1) continue;
    const curve = resolve(pulse);
    if (!curve) continue;
    const scale = pulseScale(raw);
    const { head, trail } = pulseHeadTrail(pulse.dir, raw);

    const headPos = bezierPoint(curve.a, curve.control, curve.b, head);
    ctx.beginPath();
    ctx.fillStyle = colors.head;
    ctx.arc(headPos.x, headPos.y, PULSE_HEAD_RADIUS_PX * scale, 0, Math.PI * 2);
    ctx.fill();

    if (trail !== null) {
      const trailPos = bezierPoint(curve.a, curve.control, curve.b, trail);
      ctx.beginPath();
      ctx.fillStyle = colors.trail;
      ctx.arc(trailPos.x, trailPos.y, PULSE_TRAIL_RADIUS_PX * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
