import { useCallback, useSyncExternalStore } from "react";

import type { StudioChange } from "./build-studio-changes";

/**
 * 공방 초안 보관소 — 저장 전 관계 편집(`StudioChange[]`)을 노드별로 로컬에
 * 붙잡아 둔다.
 *
 * 왜 필요한가: 공방의 저장 대기 변경은 화면을 벗어나는 순간 조용히 사라졌다.
 * 무대 안 산책과 '그만하기' 에는 확인 가드가 있었지만, 좌측 레일 이동 ·
 * 브라우저 뒤로가기 · 창 닫기는 무방비였다 (opus5 검수 2026-07-25 실측:
 * 저장 대기 1건 상태에서 레일 '지도' 클릭 → 경고 0, 초안 소멸).
 *
 * 해법으로 확인 팝업을 이탈 경로마다 늘리지 않는다 — 소유자 방향은 "요즘엔
 * 귀찮은것도 싫은데.. 입력하면 자동저장시키면 안되나? 임시저장 형태로? 그래서
 * 좌측이나 우측에서는 작업중이던 목록을 모아보기". 즉 **묻지 말고 붙잡아 둔다**.
 * 사용자가 명시적으로 폐기하지 않는 한 초안은 살아 있고, 어디서 이탈하든
 * 돌아오면 그대로 있다.
 *
 * 지속은 localStorage 뿐(백엔드 0, `appearance-preferences` 와 같은 로컬-퍼스트
 * 지속 문법). SSR/정적 export 프리렌더에서는 빈 상태를 반환해 hydration
 * 불일치를 피한다.
 *
 * vault 범위: 초안은 노드 id 로만 키를 잡는다. 다른 vault 로 바꾸면 그 id 가
 * 그래프에 없으므로 '작업중' 목록을 그릴 때 현재 그래프와 교집합만 보여주면
 * 된다 — 별도 vault 식별자를 저장하지 않아도 자연히 격리된다.
 */

const DRAFTS_KEY = "ontology-atlas:studio-drafts:v1";

/** 같은 탭 구독자에게 알리는 커스텀 이벤트(cross-tab 은 `storage`). */
const DRAFT_EVENT = "ontology-atlas:studio-draft-change";

/**
 * 초안 수명. 이보다 오래된 항목은 읽는 순간 만료된다 — 몇 달 전 잔해가
 * '작업중' 목록에 되살아나면 그 목록 자체를 못 믿게 된다.
 */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  title: string;
  changes: StudioChange[];
  updatedAt: number;
}

/** '작업중' 목록 한 줄 — 그래프 없이도 그릴 수 있게 이름과 개수를 들고 있다. */
export interface StudioDraftSummary {
  focalId: string;
  title: string;
  count: number;
  updatedAt: number;
}

const EMPTY_CHANGES: StudioChange[] = [];

function now(at?: number): number {
  return at ?? Date.now();
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<StoredDraft>;
  return (
    typeof draft.title === "string" &&
    typeof draft.updatedAt === "number" &&
    Array.isArray(draft.changes)
  );
}

/** 깨진 JSON·구 스키마가 들어 있어도 던지지 않고 빈 상태로 회복한다. */
function readAll(at?: number): Record<string, StoredDraft> {
  if (typeof window === "undefined") return {};
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return {};
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};

  const cutoff = now(at) - DRAFT_MAX_AGE_MS;
  const out: Record<string, StoredDraft> = {};
  for (const [focalId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isStoredDraft(value)) continue;
    if (value.updatedAt <= cutoff) continue;
    if (value.changes.length === 0) continue;
    out[focalId] = value;
  }
  return out;
}

function writeAll(drafts: Record<string, StoredDraft>): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(drafts).length === 0) window.localStorage.removeItem(DRAFTS_KEY);
    else window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // 용량 초과·프라이빗 모드 — 초안 보존은 편의 기능이라 실패해도 편집을 막지 않는다.
    return;
  }
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

/** 이 노드의 저장 전 변경. 없으면 빈 배열(안정 참조). */
export function readStudioDraft(focalId: string, at?: number): StudioChange[] {
  const draft = readAll(at)[focalId];
  return draft ? draft.changes : EMPTY_CHANGES;
}

/**
 * 이 노드의 초안을 갈아끼운다. 빈 변경으로 저장하면 항목을 지운다 — 되돌린
 * 초안이 '작업중' 목록에 0건짜리 유령으로 남지 않게.
 */
export function saveStudioDraft(
  focalId: string,
  title: string,
  changes: readonly StudioChange[],
  at?: number,
): void {
  const drafts = readAll(at);
  if (changes.length === 0) delete drafts[focalId];
  else drafts[focalId] = { title, changes: [...changes], updatedAt: now(at) };
  writeAll(drafts);
}

/** 저장(디스크 쓰기) 성공 후 그 노드의 초안만 비운다. */
export function clearStudioDraft(focalId: string, at?: number): void {
  const drafts = readAll(at);
  if (!(focalId in drafts)) return;
  delete drafts[focalId];
  writeAll(drafts);
}

/** 최근 수정 순 — 방금 만진 것이 위로. */
export function listStudioDrafts(at?: number): StudioDraftSummary[] {
  return Object.entries(readAll(at))
    .map(([focalId, draft]) => ({
      focalId,
      title: draft.title,
      count: draft.changes.length,
      updatedAt: draft.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.focalId.localeCompare(b.focalId));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore 는 스냅샷 identity 가 안정적이어야 무한 루프를 피한다.
// localStorage 원문 문자열을 스냅샷으로 쓰고, 파싱은 렌더에서 한 번 한다.
function getSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DRAFTS_KEY) ?? "";
  } catch {
    return "";
  }
}

function getServerSnapshot(): string {
  return "";
}

/** 현재 초안 목록을 라이브로 구독한다. 저장/폐기하면 즉시 다시 그려진다. */
export function useStudioDrafts(): StudioDraftSummary[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const list = useCallback(() => (raw === "" ? [] : listStudioDrafts()), [raw]);
  return list();
}
