/**
 * 「지난 길」 **레코드** — 저장 매체와 무관한 부분만 모은다.
 *
 * 형식(스키마)·상한·중복 판정·직렬화는 전부 여기 순수 함수로 있고, "어디에
 * 쓰는가"는 `past-trail-store.ts` 가 혼자 안다. 같은 레코드가 볼트 안 파일이든
 * 브라우저 저장소든 **한 글자도 안 바꾸고** 실릴 수 있어야 하기 때문이다 —
 * 웹과 설치 앱(Tauri)은 서로 다른 origin 이라 브라우저 저장소로는 같은 지난
 * 길이 이어지지 않는다. 그래서 실제 저장 위치는 **볼트 폴더 안 파일**이다.
 *
 * 기록하지 않는 것: 걸음당 시각 · 체류 시간 · 방문 횟수. 시각은 **길 하나당
 * 종료 시각 1개**뿐이고, 그것도 날짜 묶음 표시와 정렬에만 쓴다. 이 선이 탐색
 * 궤적과 행동 분석을 가른다.
 */

/**
 * 보관 상한. 넘으면 가장 오래된 길부터 소멸하는 회전 버퍼다 — 축적이 아니라는
 * 사실을 UI 캡션(`최근 10개까지`)으로도 정직하게 알린다.
 */
export const PAST_WALKS_MAX = 10;

/** 길 하나가 담는 걸음 상한 — 세션 궤적 상한(FOOTPRINT_TRAIL_MAX)과 같다. */
export const PAST_WALK_ENTRIES_MAX = 30;

/**
 * 보관 문턱. 칩이 뜨는 조건(방문 2개 이상)과 같은 수 — 화면에 길로 보였던
 * 것만 길로 보관한다.
 */
export const PAST_WALK_MIN_ENTRIES = 2;

/** 걸음 스냅샷 — 노드가 지워져도 목록이 렌더 가능해야 하므로 제목·kind 를 함께 굳힌다. */
export interface PastWalkEntry {
  /** 그래프 노드 id(`<kind>:<slug>`). */
  id: string;
  title: string;
  kind: string;
}

export interface PastWalk {
  id: string;
  /**
   * 길이 끝난 시각(epoch ms) — **길당 1개**. 날짜 표시·정렬 전용이다.
   * 걸음당 시각·체류·횟수는 저장하지 않는다.
   */
  endedAt: number;
  /** 방문 순서(오래된 → 최근). 세션 궤적과 같은 방향이라 인계 패킷이 그대로 재생된다. */
  entries: PastWalkEntry[];
}

interface PastTrailDocumentV1 {
  v: 1;
  /** 최근이 앞. */
  walks: PastWalk[];
}

function isEntry(value: unknown): value is PastWalkEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.title === "string" && typeof e.kind === "string";
}

/**
 * 저장된 텍스트를 스키마로 되받는다. 파손·구버전·손으로 고친 값은 조용히
 * 버린다 — 편의 상태라서 복구할 진실원이 없고, 사용자에게 알릴 사고도 아니다.
 * 걸음당 시각 같은 미승인 필드가 섞여 있어도 여기서 전부 떨어진다.
 */
export function deserializePastTrails(raw: string | null): PastWalk[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const doc = parsed as Partial<PastTrailDocumentV1>;
  if (doc.v !== 1 || !Array.isArray(doc.walks)) return [];
  const walks: PastWalk[] = [];
  for (const candidate of doc.walks) {
    if (!candidate || typeof candidate !== "object") continue;
    const walk = candidate as unknown as Record<string, unknown>;
    if (typeof walk.id !== "string" || typeof walk.endedAt !== "number") continue;
    if (!Number.isFinite(walk.endedAt) || !Array.isArray(walk.entries)) continue;
    const entries = walk.entries
      .filter(isEntry)
      .slice(0, PAST_WALK_ENTRIES_MAX)
      .map((e) => ({ id: e.id, title: e.title, kind: e.kind }));
    if (entries.length < PAST_WALK_MIN_ENTRIES) continue;
    walks.push({ id: walk.id, endedAt: walk.endedAt, entries });
  }
  return walks.slice(0, PAST_WALKS_MAX);
}

export function serializePastTrails(walks: readonly PastWalk[]): string {
  const doc: PastTrailDocumentV1 = { v: 1, walks: walks.slice(0, PAST_WALKS_MAX) };
  return JSON.stringify(doc);
}

function sameRoute(a: readonly PastWalkEntry[], b: readonly PastWalkEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => entry.id === b[i].id);
}

/** 세션 하나가 쓰는 길 id — 그 세션의 모든 기록이 이 id 로 **덮어써진다**. */
export function newPastWalkId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UpsertPastWalkOptions {
  /** 마지막으로 기록된 시각. 기본은 호출 시점. */
  now?: number;
}

/**
 * 지금 걷고 있는 길을 **같은 id 로 덮어쓴다** — 순수 함수(입력 목록 불변).
 *
 * 왜 "끝날 때 한 번"이 아니라 "걸으면서 덮어쓰기"인가: 저장 위치가 볼트 안
 * 파일이라 쓰기가 비동기다. 페이지가 죽는 순간(pagehide)에 파일 쓰기를 시작하면
 * 끝나기 전에 문서가 사라진다 — 정확히 남겨야 할 순간에 못 남기는 설계다.
 * 걸으면서 제자리에 덮어쓰면 창을 강제 종료해도, 브라우저가 죽어도 마지막
 * 상태가 이미 디스크에 있다. 겉으로 보이는 계약은 그대로다: 한 세션 = 한 줄,
 * 시각은 그 줄에 하나.
 *
 * 하지 않는 경우: ① 걸음이 문턱 미만 ② **다른** 최신 길과 경로가 같을 때
 * (새로고침 직후 같은 길을 다시 걸었을 때 같은 줄이 두 개가 되지 않게).
 */
export function upsertPastWalk(
  walks: readonly PastWalk[],
  walkId: string,
  entries: readonly PastWalkEntry[],
  options: UpsertPastWalkOptions = {},
): PastWalk[] {
  const trimmed = entries
    .slice(-PAST_WALK_ENTRIES_MAX)
    .map((e) => ({ id: e.id, title: e.title, kind: e.kind }));
  if (trimmed.length < PAST_WALK_MIN_ENTRIES) return [...walks];
  const others = walks.filter((walk) => walk.id !== walkId);
  if (others.length > 0 && sameRoute(others[0].entries, trimmed)) return [...walks];
  const walk: PastWalk = {
    id: walkId,
    endedAt: options.now ?? Date.now(),
    entries: trimmed,
  };
  return [walk, ...others].slice(0, PAST_WALKS_MAX);
}

/**
 * 종료 시각을 **일 단위** 묶음으로 환원한다. 시·분은 표시하지 않는다 — 날짜는
 * 길을 서로 구분하는 데 필요하지만, 시각까지 보이면 목록이 행동 타임라인으로
 * 읽히기 시작한다.
 */
export type PastTrailDay =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "sameYear"; at: number }
  | { kind: "olderYear"; at: number };

export function describePastTrailDay(endedAt: number, now: number): PastTrailDay {
  const day = new Date(endedAt);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(day)) / 86_400_000);
  if (diffDays <= 0) return { kind: "today" };
  if (diffDays === 1) return { kind: "yesterday" };
  if (day.getFullYear() === today.getFullYear()) return { kind: "sameYear", at: endedAt };
  return { kind: "olderYear", at: endedAt };
}
