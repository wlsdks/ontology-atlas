// 소스 영수증이 쓸 수 있는 **낱말** — 간극(무엇이 잘못됐나)과 처방(무엇을
// 하라)의 목록.
//
// ## 왜 따로 뺐나 (2026-08-17)
//
// 같은 목록이 `project-source-receipt.mjs` 와 `project-meaning-inventory.mjs`
// 에 **바이트 단위로 똑같이** 두 벌 있었고, 둘 다 검사기로 쓰였다:
//
//   project-source-receipt.mjs:76      `!ACTION_IDS.has(value.id)`        → null
//   project-meaning-inventory.mjs:112  `!SOURCE_ACTION_IDS.has(...)`      → 거절
//
// 그래서 처방을 하나 더할 때 한쪽만 고치면, 영수증은 그것을 통과시키는데
// 인벤토리는 조용히 거절한다. 그 어긋남은 에러가 아니라 **아무 일도 안
// 일어나는 것**으로 나타나서, 알아채는 데 오래 걸린다.
//
// 이 저장소가 오늘 하루에만 같은 모양을 다섯 번 고쳤다(쓰기 경로 · 설정 병합 ·
// 검증기 · 건강 계산 · 처방 표). **사본이 둘인데 게이트가 없으면 어긋나는
// 쪽이 기본값이다.**
//
// 게이트: `project-source-vocabulary.test.mjs`.

/** 무엇이 잘못됐나. 메시지가 이 이름을 그대로 적으므로 문장은 필요 없다. */
export const PROJECT_SOURCE_GAP_IDS = Object.freeze(
  new Set([
    'source_unbound',
    'multiple_active_sources',
    'receipt_missing',
    'receipt_malformed',
    'source_role_evidence_missing',
    'declared_source_path_missing',
    'source_inventory_truncated',
    'ontology_changed',
    'source_changed',
  ]),
);

/**
 * 무엇을 하라. **여기 이름을 더하면 사람이 읽을 문장도 같이 더해야 한다** —
 * `index.js` 의 `MEANING_NEXT_ACTION_HINTS` 이고, 빠지면
 * `meaning-hint-coverage.test.mjs` 가 막는다.
 */
export const PROJECT_SOURCE_ACTION_IDS = Object.freeze(
  new Set([
    'connect_source',
    'repair_source_binding',
    'measure_source',
    'record_source_role',
    'repair_source_path',
    'review_inventory_limit',
    'remeasure_source',
    'use_current_evidence',
  ]),
);
