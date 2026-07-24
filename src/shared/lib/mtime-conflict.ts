/**
 * rank7 (design-council B5) — expected_mtime 충돌 배지의 유일한 진실
 * 판정. `patch_concept`/`updateFrontmatter`/`saveDoc` 가 이미 쓰는
 * expected_mtime 계약(`assertExpectedMtime`, `use-local-vault.ts`)과 같은
 * 질문을 저장 *이전에* 조용히 물어본다: "내가 이 문서를 열었을 때의
 * baseline 과 지금 알려진 값이 다른가, 그리고 그 차이가 내 자신의 최근
 * 쓰기로 설명되는가?" 두 값이 다르면서 자기 쓰기로 설명 안 되는 경우만
 * true — 실제 mismatch 가 없으면(예: 그냥 시간이 흘렀을 뿐) 절대 켜지지
 * 않는다(신호 인플레이션 금지, 소유회 결정 원문 guardianRisk).
 *
 * `baseline`/`current` 는 doc.mtime(number, R11 #15) 또는 vault-doc
 * freshness ISO(string, docFreshnessIndex) 어느 쪽이든 받는다 — 두
 * surface(문서함 vs 토폴로지 패널)가 서로 다른 표현을 쓰지만 "같았다/
 * 달라졌다" 비교의 의미는 동일하므로 하나의 판정 함수를 공유한다.
 */
export function hasUnaccountedMtimeChange(params: {
  baseline: number | string | null | undefined;
  current: number | string | null | undefined;
  /** 이 문서/노드에 대한 이번 세션의 실제 자기 쓰기 기록(`markSelfWrite`).
   *  근거 없으면 undefined/null. */
  selfEditAtMs: number | null | undefined;
  /** baseline 을 캡처한 시각(ms) — 그 이후의 자기 쓰기만 "설명됨"으로 친다. */
  baselineCapturedAtMs: number;
}): boolean {
  const { baseline, current, selfEditAtMs, baselineCapturedAtMs } = params;
  if (baseline == null || current == null) return false;
  if (baseline === current) return false;
  if (typeof selfEditAtMs === "number" && selfEditAtMs >= baselineCapturedAtMs) return false;
  return true;
}
