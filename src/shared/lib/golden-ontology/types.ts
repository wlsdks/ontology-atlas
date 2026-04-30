/**
 * golden-ontology fixture 의 정답 / 추출 결과 비교 타입.
 *
 * 추출 결과 (`functions/ontology-extract.js`) 는 tempId 로 노드를 식별하고
 * edge 도 tempId 페어로 잇는다. 그러나 정답 fixture 는 사람이 작성하기
 * 쉽도록 title 을 1차 키로 사용. 채점 함수가 둘을 title 기준으로
 * canonical 화해 비교한다.
 */

export type GoldenOntologyKind =
  | 'project'
  | 'domain'
  | 'capability'
  | 'element'
  | 'document';

export type GoldenOntologyEdgeType =
  | 'contains'
  | 'belongs_to'
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'describes'
  | 'related_to';

export interface GoldenOntologyNode {
  /** 사람이 읽는 노드 이름 — 채점 시 case-insensitive 비교. */
  title: string;
  kind: GoldenOntologyKind;
}

export interface GoldenOntologyEdge {
  /** 출발 노드 title — 정답에서는 tempId 대신 title 사용. */
  from: string;
  /** 도착 노드 title. */
  to: string;
  type: GoldenOntologyEdgeType;
}

export interface GoldenOntologyExpected {
  /**
   * fixture 식별자 — md 파일명 (확장자 제외) 과 일치 권장. 채점 결과
   * 보고에 어떤 spec 인지 표기하기 위함.
   */
  id: string;
  /** 사람용 한 줄 설명 — 어떤 spec 의 정답인지. */
  description?: string;
  nodes: GoldenOntologyNode[];
  edges: GoldenOntologyEdge[];
}

/**
 * 추출 결과의 최소 형태 — `functions/ontology-extract.js` 의 normalize
 * 출력 일부와 호환. tempId 가 존재하고 edges 가 tempId 페어면 채점 가능.
 */
export interface ActualOntologyNode {
  tempId: string;
  title: string;
  kind: string;
}

export interface ActualOntologyEdge {
  fromTempId: string;
  toTempId: string;
  type: string;
}

export interface ActualOntology {
  nodes: ActualOntologyNode[];
  edges: ActualOntologyEdge[];
}

/**
 * 채점 결과 — 노드 / edge 각각 set diff 와 precision / recall / f1.
 */
export interface ScoreSetDiff<T> {
  matched: T[];
  /** 추출에는 있는데 정답에 없는 항목 — false positive. */
  onlyInActual: T[];
  /** 정답에는 있는데 추출에 없는 항목 — false negative. */
  onlyInExpected: T[];
}

export interface ScoreNumbers {
  precision: number;
  recall: number;
  f1: number;
}

export interface GoldenScoreResult {
  fixtureId: string;
  nodes: ScoreSetDiff<GoldenOntologyNode> & ScoreNumbers;
  edges: ScoreSetDiff<GoldenOntologyEdge> & ScoreNumbers;
  /** node + edge 평균 f1 — 한 줄 보고용. */
  overallF1: number;
}
