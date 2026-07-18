import {
  resolveOntologyBuilderNodeSlug,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * bare-slug ambiguity 우선순위 — 같은 slug 를 여러 kind 가 공유할 때
 * (드묾, 예: `domain:reporting` + `element:reporting`) 어느 kind 를 먼저
 * 보여줄지 결정론적으로 고정. capability 가 "사람이 논의하는 제품 행동"
 * 이라 가장 먼저, 그다음 domain(업무 경계) → element(구현 근거) →
 * document(참고 문서) 순.
 */
const BARE_SLUG_KIND_PRIORITY = ["capability", "domain", "element", "document"];

/**
 * kind(singular) → vault 폴더(plural) 매핑의 로컬 미러. 원본은
 * `src/entities/knowledge-graph/lib/ontology-node-href.ts` 의
 * `KIND_TO_VAULT_FOLDER` (모듈 비공개 — 이 작업 scope 가 entities 를
 * 건드릴 수 없어 3-entry 매핑만 로컬 복제. `document`/`project` 는 폴더
 * 접두 딥링크 형태로 안 옴 — 매핑 대상 아님).
 */
const VAULT_FOLDER_TO_KIND: Record<string, string> = {
  domains: "domain",
  capabilities: "capability",
  elements: "element",
};

function bareSlugOf(id: string): string {
  const separatorIndex = id.indexOf(":");
  return separatorIndex === -1 ? id : id.slice(separatorIndex + 1);
}

function kindPriorityRank(kind: string): number {
  const rank = BARE_SLUG_KIND_PRIORITY.indexOf(kind);
  return rank === -1 ? BARE_SLUG_KIND_PRIORITY.length : rank;
}

/**
 * 딥링크 문자열에서 (있다면) kind 힌트와 매칭에 쓸 tail 을 뽑아낸다.
 * agent/사람이 kind 접두사를 singular colon (`element:foo`) 으로 붙이든
 * plural slash (`elements/foo`) 로 붙이든 붙이지 않든 (`foo`) 같은 노드를
 * 가리키려는 의도는 같다 — 접두사 스타일과 무관하게 tail 만 비교하고,
 * kind 힌트는 동일 tail 이 여러 kind 에 걸칠 때만 우선순위로 쓴다.
 *
 * plural 접두사가 알려진 vault 폴더가 아니면 (예: 중첩 소스 경로
 * `cli/src/commands/foo.mjs`) kind 힌트 없이 전체 문자열을 그대로 tail 로
 * 둔다 — evidence-path 매칭(위 direct 단계)이 이미 그 형태를 담당.
 */
function splitDeeplinkKindHintAndTail(normalized: string): {
  kindHint: string | null;
  tail: string;
} {
  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 0 && colonIndex < normalized.length - 1) {
    const prefix = normalized.slice(0, colonIndex);
    const tail = normalized.slice(colonIndex + 1);
    return { kindHint: VAULT_FOLDER_TO_KIND[prefix] ?? prefix, tail };
  }
  const slashIndex = normalized.indexOf("/");
  if (slashIndex > 0 && slashIndex < normalized.length - 1) {
    const prefix = normalized.slice(0, slashIndex);
    const mappedKind = VAULT_FOLDER_TO_KIND[prefix];
    if (mappedKind) {
      return { kindHint: mappedKind, tail: normalized.slice(slashIndex + 1) };
    }
  }
  return { kindHint: null, tail: normalized };
}

/**
 * `?node=<id>` 딥링크를 실제 노드로 해석.
 *
 * 매칭 우선순위:
 * 1. canonical ontology id (`capability:mcp-server`) — 정확 일치.
 * 2. builder 가 쓰는 vault slug (`capabilities/mcp-server`).
 * 3. `ontology/` 접두 evidence id.
 * 4. tail 매칭 — id 의 콜론 뒤 segment 만 비교, 딥링크 쪽 kind 접두사는
 *    singular colon(`element:foo`) / plural slash(`elements/foo`) / 없음
 *    (`foo`) 어느 형태든 정규화해서 뗀다. agent 가 kind 를 안 붙이거나,
 *    실제 vault 노드의 id 가 kind 를 plural 로 잘못 저장한 authoring
 *    drift(`elements:foo`) 여도 tail 이 같으면 찾는다. 여러 kind 가 같은
 *    tail 을 공유하면 딥링크의 kind 힌트로 먼저 좁히고, 힌트가 없거나
 *    안 맞으면 `BARE_SLUG_KIND_PRIORITY` 로 결정론적으로 하나를 고른다
 *    (입력 배열 순서에 의존하지 않음).
 *
 * 1~3 이 하나라도 맞으면 4 는 시도하지 않는다 — canonical/evidence 매칭이
 * 항상 tail 폴백보다 우선.
 */
export function resolveOntologyDeeplinkNode(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
): KnowledgeGraphNode | null {
  const normalized = nodeId.trim();
  if (!normalized) return null;

  const direct = nodes.find((node) => {
    if (node.id === normalized) return true;
    if (resolveOntologyBuilderNodeSlug(node) === normalized) return true;
    return node.evidenceIds.some(
      (evidenceId) => evidenceId.replace(/^ontology\//, "") === normalized,
    );
  });
  if (direct) return direct;

  const { kindHint, tail } = splitDeeplinkKindHintAndTail(normalized);
  if (!tail) return null;

  const tailMatches = nodes.filter((node) => bareSlugOf(node.id) === tail);
  if (tailMatches.length === 0) return null;
  if (tailMatches.length === 1) return tailMatches[0]!;

  if (kindHint) {
    const withinHintedKind = tailMatches.filter((node) => node.kind === kindHint);
    if (withinHintedKind.length > 0) {
      const [bestOfHinted] = [...withinHintedKind].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      return bestOfHinted!;
    }
    // kind 힌트가 이 tail 의 실제 kind 와 안 맞으면 (드묾) 아래 일반
    // 우선순위로 폴백 — hint 를 무시하고 조용히 실패시키지 않는다.
  }

  const [best] = [...tailMatches].sort((a, b) => {
    const rankDiff = kindPriorityRank(a.kind) - kindPriorityRank(b.kind);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });
  return best!;
}

/**
 * `?node=<id>` 가 있는데 해석이 안 됐을 때 보여줄 notice 문구용 query.
 * null 이면 notice 를 숨긴다 (정상 — 딥링크 없음 / 이미 선택됨 / 해석 성공).
 *
 * 순수 함수로 분리 — effect 타이밍과 무관하게 "지금 notice 를 보여줘야
 * 하는가" 를 독립적으로 테스트하기 위함. 회귀 실패 모드: 딥링크가 안 풀려도
 * 아무 신호 없이 기본 empty state 만 보여 agent-handoff 흐름이 조용히
 * 끊기는 것 (silent no-op).
 */
export function computeDeeplinkNotFoundNotice(
  deeplinkNodeId: string | null,
  selectedNodeId: string | null,
  resolvedNode: KnowledgeGraphNode | null,
): string | null {
  if (!deeplinkNodeId) return null;
  if (selectedNodeId === deeplinkNodeId) return null;
  if (resolvedNode) return null;
  return deeplinkNodeId;
}
