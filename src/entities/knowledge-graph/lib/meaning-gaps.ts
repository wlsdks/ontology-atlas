/**
 * **의미 공백의 판정 하나** — 한 개념에서 사람이 그 자리에서 메울 수 있는
 * 빈칸이 무엇인지 정하는 단일 출처.
 *
 * ## 왜 entities 로 내려왔나
 *
 * 이 판정은 원래 인사이트 큐(`views/ontology-insights/lib/meaning-gap-rows.ts`)
 * 안에만 있었다. 그런데 에이전트 패널의 **첫 마디 칩**이 같은 질문을 한다 —
 * "이 폴더에서 지금 가장 비어 있는 곳이 어디인가". 두 표면이 각자 판정하면
 * 큐가 「정의 없음」이라 한 개념을 패널은 멀쩡하다고 보는 날이 온다. 판정을
 * 새로 만드는 순간 갈라진다는 것은 이 저장소가 이미 두 번 배운 사실이다
 * (`resolveNodeDocument` · `resolveNodeAgentTarget` 이 같은 이유로 한 곳에 있다).
 *
 * 여기 있는 것은 **판정뿐**이다. 행 조립·인계 문장·상한은 각 표면의 몫이다.
 */

/** 사람이 뜻만 알면 그 자리에서 메울 수 있는 빈칸의 종류. */
export type MeaningGapKind = "missing-definition" | "missing-domain";

/** 볼트 문서 한 벌에서 읽은, 공백 판정에 필요한 사실만. */
export interface ConceptDocFacts {
  /** `description` 또는 본문 요약 — 둘 중 하나라도 있으면 뜻이 적혀 있다. */
  hasDefinition: boolean;
  /** `domain:` 원문(정규화 전). 비어 있으면 소속 미정. */
  domainRef: string | null;
  /** 동시수정 가드용 `file.lastModified`. static 샘플은 null. */
  mtime: number | null;
}

/**
 * `domain:` 을 요구하는 kind — 스키마(`mcp/src/schema.mjs`)의 `requiredExtras`
 * 와 같은 집합. 프로젝트·도메인·문서는 소속이 없어도 온전한 개념이다.
 */
export const DOMAIN_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  "capability",
  "element",
]);

/**
 * 이 개념에 비어 있는 칸들 — 우선순위 순서(뜻이 먼저, 소속이 다음).
 *
 * 뜻이 먼저인 이유: 소속은 "이게 무엇인가" 를 알아야 정할 수 있다. 순서를
 * 뒤집으면 사용자가 답할 수 없는 질문을 먼저 받는다.
 */
export function detectMeaningGaps(
  node: { kind: string },
  doc: ConceptDocFacts,
): MeaningGapKind[] {
  const gaps: MeaningGapKind[] = [];
  if (!doc.hasDefinition) gaps.push("missing-definition");
  if (DOMAIN_REQUIRED_KINDS.has(node.kind) && !doc.domainRef) {
    gaps.push("missing-domain");
  }
  return gaps;
}
