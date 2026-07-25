import { ONTOLOGY_STARTER_FILES } from './ontology-starter';

/**
 * 스타터가 만드는 것의 **의미별 개수** (#70).
 *
 * 결함: 완료 토스트가 마크다운과 에이전트 설정 파일을 한 수(`created`)로 합쳐
 * "시작 문서 8개" 라고 말했는데, 실제 온톨로지 개념은 5개였고 설정 패널은
 * "문서 5개" 라고 표시했다 — 같은 볼트를 두고 두 화면이 다른 수를 말했다
 * (codex 감사 P2 · opus5 검수 2026-07-25).
 *
 * `.mcp.json` 같은 에이전트 설정은 **개념이 아니다.** 파일 수를 합치면 사용자는
 * "내 온톨로지에 개념이 8개 생겼다" 로 읽는다. 두 수는 끝까지 분리한다.
 */

/** 스타터가 만드는 온톨로지 마크다운(= 노드) 수. */
export const STARTER_CONCEPT_COUNT = ONTOLOGY_STARTER_FILES.length;
