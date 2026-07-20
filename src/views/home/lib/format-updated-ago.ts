/**
 * S-C1 — 노드 데이터시트의 "언제 바뀌었나" 사다리 (순수 함수).
 *
 * AI 에이전트가 vault 를 계속 갱신하는 제품에서 시간 차원이 안 보이면
 * 사람이 변경을 구분할 수 없다 (소유자 2026-07-20). manifest 문서의
 * `updatedAt` (local: file.lastModified · static: 빌드타임) 을 i18n 키 +
 * count 로 환원한다 — 문자열 조립은 호출자의 next-intl 이 담당.
 */

export interface UpdatedAgo {
  key: "today" | "yesterday" | "daysAgo" | "weeksAgo" | "monthsAgo";
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeUpdatedAgo(updatedAtIso: string, nowMs: number): UpdatedAgo | null {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return null;
  const days = Math.floor((nowMs - updatedMs) / DAY_MS);
  if (days < 0) return { key: "today", count: 0 };
  if (days === 0) return { key: "today", count: 0 };
  if (days === 1) return { key: "yesterday", count: 1 };
  if (days < 7) return { key: "daysAgo", count: days };
  if (days < 30) return { key: "weeksAgo", count: Math.floor(days / 7) };
  return { key: "monthsAgo", count: Math.floor(days / 30) };
}
