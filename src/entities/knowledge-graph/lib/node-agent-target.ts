import type { KnowledgeGraphNode } from "../model/types";

/**
 * 이 노드를 **에이전트에게 건넬 때 쓰는 이름** 하나를 정하는 단일 출처.
 *
 * 왜 한 곳이어야 하나 (2026-07-26 실측) — 화면이 복사해 주는 MCP 호출은
 * "붙여넣으면 동작한다" 가 존재 이유다. 그런데 각 표면이 저마다
 * `node.evidenceIds[0]` 를 그대로 박아 넣고 있었고, 그 값은 두 가지 이유로
 * 에이전트가 받는 이름과 달랐다:
 *
 * 1. **볼트 뿌리가 다르다.** 번들 dogfood 매니페스트는 `docs/` 를 뿌리로
 *    빌드돼 온톨로지 문서 slug 가 `ontology/elements/…` 인데, 저장소가
 *    에이전트에 물리는 볼트 뿌리는 `docs/ontology` 다. 그래서 인사이트의
 *    「에이전트로 검증」이 복사해 준 `merge_concepts({fromSlug:"ontology/
 *    elements/topology-ontology-drawer-model"…})` 가 실행 즉시 실패했다 —
 *    앞 조각 하나 차이였다.
 * 2. **문서 없는 노드에서는 남의 이름이다.** 파생 노드의 `evidenceIds[0]` 은
 *    *자기를 인용한 다른 문서* 의 slug다. 그대로 넘기면 에이전트가 엉뚱한
 *    문서를 고치게 된다 — #688 이 공방에서 막은 것과 같은 계열의 사고다.
 *
 * 그래서 표면마다 각자 판단하지 않고 여기서만 답한다. 문서가 없으면
 * `documented: false` 와 볼트가 적어 둔 참조 원문을 돌려주므로, 호출자는
 * "먼저 문서를 만들어야 한다" 는 사실을 숨기지 않고 인계문을 쓸 수 있다.
 */
export interface NodeAgentTarget {
  /**
   * MCP/CLI 가 그대로 받아들이는 이름. 문서 노드면 볼트 뿌리 기준 문서 slug,
   * 문서 없는 노드면 볼트가 적어 둔 참조 원문. 둘 다 없으면 null.
   */
  ref: string | null;
  /**
   * 이 이름으로 조회·수정이 되는가. `false` 면 `add_concept` 로 문서를 먼저
   * 만들어야 `patch_concept` / `merge_concepts` / `get_concept` 이 성립한다.
   */
  documented: boolean;
}

type AgentTargetInput = {
  evidenceIds?: readonly string[];
} & Pick<KnowledgeGraphNode, "hasOwnDocument" | "agentSlug" | "ref">;

export function resolveNodeAgentTarget(
  node: AgentTargetInput | null | undefined,
): NodeAgentTarget {
  if (!node) return { ref: null, documented: false };
  // 하위 호환: `hasOwnDocument` 를 안 채우는 생산 경로(테스트 픽스처 · 수동
  // 조립)는 종전대로 문서 노드로 읽는다.
  const documented = node.hasOwnDocument !== false;
  if (!documented) {
    const derivedRef = node.ref?.trim();
    return { ref: derivedRef || null, documented: false };
  }
  const explicit = node.agentSlug?.trim();
  if (explicit) return { ref: explicit, documented: true };
  const fallback = node.evidenceIds?.[0]?.trim();
  return { ref: fallback || null, documented: true };
}

/**
 * 번들 dogfood 매니페스트가 `docs/` 를 뿌리로 빌드된 결과로 온톨로지 문서
 * slug 앞에 남는 조각. 이 저장소의 빌드 산출물에 대한 **사실**이지 사용자
 * 볼트에 대한 추측이 아니다 — 사용자가 자기 폴더를 열면 그 폴더가 곧 볼트
 * 뿌리라 뺄 조각이 없다(그래서 로컬 모드에는 접두사를 주지 않는다).
 */
export function stripVaultSlugPrefix(slug: string, prefix: string | undefined): string {
  if (!prefix) return slug;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}
