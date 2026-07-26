import {
  detectMeaningGaps,
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type ConceptDocFacts,
  type KnowledgeGraphNode,
  type MeaningGapKind,
} from "@/entities/knowledge-graph";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";
import { withDoNextVerification } from "./do-next-queue";

/**
 * **한 문장으로 끝나는 할 일** — 코드를 읽지 않는 사람이 그 자리에서 완결할 수
 * 있는 두 가지 공백만 뽑는다.
 *
 * - `missing-definition` — 이 개념이 무슨 뜻인지 어디에도 안 적혀 있다.
 * - `missing-domain` — 역량/요소인데 어느 영역에 속하는지 안 적혀 있다.
 *
 * ## 어디에 쓰는가 (셰이핑 잔여 ①의 답)
 *
 * 정의는 **frontmatter `description` 키**에 앉는다. 근거: ① 스키마 진실원
 * (`mcp/src/schema.mjs`)이 네 kind 모두에 `description` 을 두고 `preferredOrder`
 * 에 title 바로 다음 자리를 잡아 뒀다, ② MCP `patch_concept` · CLI · 지도
 * 팝오버가 이미 그 키를 읽는다, ③ 스칼라 한 칸이라 본문을 건드리지 않고
 * 고칠 수 있다 — 본문 첫 단락에 쓰려면 문서 전체를 다시 써야 하고, 그건
 * "한 필드만 바뀐다" 는 이 행의 약속을 깬다.
 *
 * ## 무엇을 정의 없음으로 보지 않는가
 *
 * `description` 이 없어도 **본문에 설명이 있으면 정의가 있는 것으로 본다.**
 * 실측(2026-07-26): 도그푸드 92개 개념 중 91개가 `description` 없이 본문으로
 * 뜻을 적어 뒀다. 키 유무만 보면 잘 쓰인 볼트에 91건의 거짓 할 일이 뜨고,
 * 그건 큐를 못 쓰게 만든다. 파생(`derive-ontology-from-vault`)이 이미
 * `description ?? excerpt` 로 요약을 만들므로, 그 요약이 비었을 때만 공백이다.
 *
 * ## 문서 없는 개념은 여기 오지 않는다 (#688 재발 방지)
 *
 * 쓸 자리 판정은 `resolveNodeDocument` **하나**만 쓴다. 자기 `.md` 가 없는
 * 파생 개념은 고칠 파일이 없으므로 이 목록에서 제외된다 — 그 개념의 첫 걸음은
 * 「문서부터 만들기」이고, 그건 큐의 다른 행이 이미 인계로 준다. 판정을 새로
 * 만들면 그 순간 남의 문서에 쓰는 사고가 다시 열린다.
 */

/**
 * 공백의 종류와 판정은 `@/entities/knowledge-graph` 가 소유한다 — 에이전트
 * 패널의 첫 마디 칩이 같은 질문을 하므로, 판정이 두 벌이 되면 큐와 패널이
 * 서로 다른 개념을 지목하는 날이 온다. 여기서는 이름만 이어 준다.
 */
export type { ConceptDocFacts, MeaningGapKind };

export interface MeaningGapRow {
  /** 행 고유 id — 검토 루프/`key` 용. */
  id: string;
  gap: MeaningGapKind;
  /** 그래프 노드 id — 지도·공방 딥링크. */
  nodeId: string;
  /** **쓸 파일** — `resolveNodeDocument(node).ownSlug`. 이 값 외의 경로에 쓰지 않는다. */
  ownSlug: string;
  /** 에이전트에게 이 개념을 가리켜 보일 이름 — `resolveNodeAgentTarget`. */
  agentRef: string;
  title: string;
  nodeKind: string;
  mtime: number | null;
  /** 이 행을 에이전트에게 넘길 때의 문장. */
  handoffPayload: string;
}

export interface MeaningGapResult {
  definitionRows: MeaningGapRow[];
  domainRows: MeaningGapRow[];
  counts: { missingDefinition: number; missingDomain: number };
}

/** 소속을 정할 때 고를 수 있는 영역 하나. */
export interface DomainChoice {
  /** frontmatter 에 적히는 값 — 볼트 전체가 쓰는 tail-slug 형태. */
  value: string;
  /** 화면에 보이는 이름. */
  label: string;
}

export interface BuildMeaningGapOptions {
  /** 유형별 표시 상한. 기본 3 (큐 카드의 다른 섹션과 같은 리듬). */
  perKindLimit?: number;
}

export function buildMeaningGapRows(
  nodes: readonly KnowledgeGraphNode[],
  facts: ReadonlyMap<string, ConceptDocFacts>,
  options: BuildMeaningGapOptions = {},
): MeaningGapResult {
  const perKindLimit = options.perKindLimit ?? 3;
  const definitionRows: MeaningGapRow[] = [];
  const domainRows: MeaningGapRow[] = [];

  for (const node of nodes) {
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue; // 문서가 없으면 고칠 파일이 없다
    const doc = facts.get(ownSlug);
    if (!doc) continue; // 매니페스트에 없는 문서엔 쓰지 않는다
    const agentRef = resolveNodeAgentTarget(node).ref ?? ownSlug;
    const base = {
      nodeId: node.id,
      ownSlug,
      agentRef,
      title: node.display ?? node.title,
      nodeKind: node.kind,
      mtime: doc.mtime,
    };
    const gaps = detectMeaningGaps(node, doc);
    if (gaps.includes("missing-definition")) {
      definitionRows.push({
        ...base,
        id: `missing-definition:${ownSlug}`,
        gap: "missing-definition",
        handoffPayload: withDoNextVerification(
          `patch_concept({slug:"${agentRef}", frontmatter:{description:"<이 개념을 한 문장으로>"}}) 로 뜻을 적기`,
          `get_concept({slug:"${agentRef}"}) 로 적힌 문장 확인`,
        ),
      });
    }
    if (gaps.includes("missing-domain")) {
      domainRows.push({
        ...base,
        id: `missing-domain:${ownSlug}`,
        gap: "missing-domain",
        handoffPayload: withDoNextVerification(
          `patch_concept({slug:"${agentRef}", frontmatter:{domain:"<영역 이름>"}}) 로 소속을 적기`,
          `get_concept({slug:"${agentRef}"}) 로 소속 확인`,
        ),
      });
    }
  }

  // 이름순 — 같은 화면을 두 번 열었을 때 순서가 바뀌면 방금 본 행을 다시 찾게 된다.
  const byTitle = (a: MeaningGapRow, b: MeaningGapRow) => a.title.localeCompare(b.title);
  definitionRows.sort(byTitle);
  domainRows.sort(byTitle);

  return {
    definitionRows: definitionRows.slice(0, perKindLimit),
    domainRows: domainRows.slice(0, perKindLimit),
    counts: {
      missingDefinition: definitionRows.length,
      missingDomain: domainRows.length,
    },
  };
}

/**
 * 소속 후보 — 볼트에 실제로 있는 도메인 문서만. 새 영역을 이 자리에서 만들지
 * 않는다(영역 신설은 뜻을 새로 세우는 일이라 공방의 일이다).
 */
export function buildDomainChoices(
  nodes: readonly KnowledgeGraphNode[],
): DomainChoice[] {
  const choices = new Map<string, DomainChoice>();
  for (const node of nodes) {
    if (node.kind !== "domain") continue;
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue;
    const value = canonicalizeDomainRef(ownSlug);
    if (!value || choices.has(value)) continue;
    choices.set(value, { value, label: node.display ?? node.title });
  }
  return [...choices.values()].sort((a, b) => a.label.localeCompare(b.label));
}
