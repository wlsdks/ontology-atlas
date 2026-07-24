/**
 * rank7 (design-council B5) — "마지막 편집 · 사람/AI" 사실의 중립 선택기.
 * 사람/AI 는 hue 가 아니라 glyph+라벨로만 구분한다는 결정 원칙을 코드
 * 레벨에서도 지킨다: 이 함수는 어느 kind 도 우대하지 않고, 오직 각
 * 후보의 `atMs`(실측 근거가 있을 때만 non-null — 호출자 책임) 중 가장
 * 최근 것을 고른다. 모든 후보가 `atMs: null` 이면(= 실데이터 근거 0)
 * null 을 반환 — 절대 추측해서 하나를 지어내지 않는다.
 */

export type LastEditSubjectKind = "agent" | "human";

export interface LastEditSubjectFact {
  kind: LastEditSubjectKind;
  atMs: number;
}

export interface LastEditSubjectCandidate {
  kind: LastEditSubjectKind;
  /** null = 이 kind 에 대한 실데이터 근거가 없음(추측 금지). */
  atMs: number | null;
}

export function pickLastEditSubject(
  candidates: readonly LastEditSubjectCandidate[],
): LastEditSubjectFact | null {
  let best: LastEditSubjectFact | null = null;
  for (const candidate of candidates) {
    if (candidate.atMs == null || !Number.isFinite(candidate.atMs)) continue;
    if (!best || candidate.atMs > best.atMs) {
      best = { kind: candidate.kind, atMs: candidate.atMs };
    }
  }
  return best;
}
