/**
 * 새 노드 "자라남" entrance — wedge 의 심장(에이전트가 vault 를 고치면 온톨로지가
 * 토폴로지로 *실시간으로 자라나는 게 보인다*). 라이브로 추가된 노드는 size 0 에
 * 가깝게 시작해 ease-out 으로 full size 까지 커진다 — 전체 reflow 없이 "여기
 * 새 노드가 돋아났다" 가 읽힌다.
 *
 * 디자인 헌장 안: position 은 worker layout 이, 이 모듈은 *size* 만 변조한다
 * (기존 recent-pulse / selection-bounce 와 같은 size-animation 어휘). glow/neon
 * 0. `prefers-reduced-motion` 사용자는 즉시 full size (reduceMotion → 1).
 *
 * 순수 함수라 단위 테스트로 곡선을 고정한다. SigmaTopology 의 nodeReducer 가
 * 프레임당 노드별로 호출하므로 분기는 가볍게(early return) 유지한다.
 */

/** entrance 지속 시간(ms). settle + pulse 와 겹쳐도 자연스러운 길이. */
export const NODE_ENTRANCE_MS = 520;

/** 등장 순간의 최소 size 배수 — 완전 0(점)이면 안 보이니 살짝 보이는 데서 시작. */
const ENTRANCE_MIN_FACTOR = 0.12;

/** Cubic ease-out — 빠르게 커지다 끝에서 부드럽게 안착. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 노드 size 배수(0..1 사이의 ENTRANCE_MIN_FACTOR..1). `ageMs` 는 노드가 처음
 * 그래프에 등장한 뒤 경과 시간.
 *
 * - `reduceMotion` 이면 즉시 1 (애니메이션 없음).
 * - `ageMs` 가 duration 이상이거나 비유한이면 1 (이미 다 자람).
 * - 0 이하면 ENTRANCE_MIN_FACTOR (막 등장).
 * - 그 사이는 ENTRANCE_MIN_FACTOR → 1 로 ease-out.
 */
export function entranceSizeFactor(
  ageMs: number,
  durationMs: number = NODE_ENTRANCE_MS,
  reduceMotion: boolean = false,
): number {
  if (reduceMotion) return 1;
  if (!Number.isFinite(ageMs) || ageMs >= durationMs) return 1;
  if (ageMs <= 0) return ENTRANCE_MIN_FACTOR;
  const eased = easeOutCubic(ageMs / durationMs);
  return ENTRANCE_MIN_FACTOR + (1 - ENTRANCE_MIN_FACTOR) * eased;
}

/**
 * 그래프 rebuild 마다 first-seen 레지스트리(`seen`: slug → 처음 본 시각)를 현재
 * 노드 집합과 동기화한다. entrance 가 "어느 노드가 *방금* 돋아났나" 를 아는 근거.
 *
 * - **첫 build** (`initialized=false`): 모든 노드를 이미-자란 상태(`now - entranceMs`)로
 *   seed → 로드 시 일괄 grow-in 안 함. `anyNew=false`.
 * - **이후 build**: 처음 보는 slug 만 `now` 로 seed → 그 노드들이 grow-in 대상
 *   (`anyNew=true`). 기존 slug 의 timestamp 는 보존.
 * - **사라진 slug** 는 prune → 레지스트리 무한 성장 방지 + 같은 slug 가 나중에 다시
 *   추가되면 새 노드로 취급돼 다시 grow-in.
 *
 * `seen` 을 in-place mutate 하고 `anyNew` 를 반환한다 (호출자가 ref 의 Map 을 그대로
 * 넘기는 hot path). SigmaTopology nodeReducer 의 entrance 분기 가드(`enteringUntil`)
 * 가 `anyNew` 로 켜진다.
 */
export function reconcileFirstSeen(
  seen: Map<string, number>,
  presentIds: Iterable<string>,
  now: number,
  initialized: boolean,
  entranceMs: number = NODE_ENTRANCE_MS,
): { anyNew: boolean } {
  const present = new Set<string>();
  let anyNew = false;
  for (const id of presentIds) {
    present.add(id);
    if (!seen.has(id)) {
      seen.set(id, initialized ? now : now - entranceMs);
      if (initialized) anyNew = true;
    }
  }
  for (const id of [...seen.keys()]) {
    if (!present.has(id)) seen.delete(id);
  }
  return { anyNew };
}
