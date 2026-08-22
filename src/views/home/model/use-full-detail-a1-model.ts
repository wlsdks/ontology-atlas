"use client";

import { useMemo } from "react";
import {
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import type { NodeDatasheetDerivation } from "./use-node-datasheet-model";

/**
 * "전체 상세"(A1 카드) 모델 조립 — HomePage 모듈화 4차.
 *
 * **왜 별도 훅인가 (D4 클릭 정지 처방, 2026-07-28).** 이 모델은 지도의 노드를
 * 누를 때마다 조립되고 있었지만, 그리는 표면(`FullDetailCard`)은 사용자가
 * `전체 상세`를 눌러 열기 전까지 렌더되지 않는다. 즉 **가장 잦은 상호작용이
 * 가장 비싼 파생을 매번 선불로 냈다**. 실측(격리 Chromium, dogfood 볼트,
 * 노드 클릭 1회): 그래프 연결 재구성 `buildConnections` 가 클릭당 **11회**
 * 돌았고 그중 9회가 이 닫힌 표면 몫이었다. 그 9회에는
 *
 * - `buildFullDetailReachModel` 의 **깊이 3 BFS**(그래프 전체),
 * - `buildFullDetailGroups` 안에서 이웃 **한 행마다** 도는
 *   `countContainmentChildren`(엣지 전수 순회 — 이웃 수 × 엣지 수),
 * - 팝오버가 이미 만든 것과 같은 `deriveCodeLocations`
 *
 * 가 들어 있다. 작은 볼트에서는 눈에 안 띄지만 볼트가 커질수록 이 항이 클릭
 * 프레임을 통째로 먹는다.
 *
 * 그래서 계약은 하나다: **`open` 이 false 면 그래프를 단 한 번도 순회하지
 * 않는다.** 열려 있을 때의 결과는 종전과 100% 같다 — 정확성을 늦추거나
 * 근사하지 않는다. 카드를 여는 순간 같은 렌더에서 동기로 조립되므로 "틀린
 * 값을 먼저 보여주고 나중에 고친다"는 실패 모드가 없다.
 *
 * 회귀 가드: `use-full-detail-a1-model.test.ts` (닫힘 → 순회 0회).
 */
export interface UseFullDetailA1ModelArgs {
  /**
   * 전체 상세 카드가 실제로 화면에 있는가. `false` 면 이 훅은 즉시 `null` 을
   * 돌려주고 어떤 그래프 순회도 하지 않는다.
   */
  open: boolean;
  nodeFocus: TopologyNodeFocusModel | null;
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** 세션 changeset baseline — 데이터시트 판정이 없을 때의 fallback. */
  changedSlugs: ReadonlySet<string>;
  /** 열린 문서의 본문 (있으면 마크다운 본문으로 렌더). */
  nodeBody: { slug: string; raw: string; body: string } | null;
  /** 이 노드에 대응하는 vault 문서 (있으면 인라인 편집 가능). */
  nodeEditTarget: { vaultSlug: string } | null;
  /** vault 가 로드돼 있는가 — 읽기 전용 샘플에서는 편집 액션을 내지 않는다. */
  vaultLoaded: boolean;
  onSaveExplanation: (next: string) => void | Promise<void>;
  /** 컴팩트 팝오버가 이미 내린 신선도/편집주체 판정 — 두 번 만들지 않는다. */
  datasheet: NodeDatasheetDerivation["v2DatasheetModel"];
}

export function useFullDetailA1Model({
  open,
  nodeFocus,
  selectedOntologyNode,
  insight,
  changedSlugs,
  nodeBody,
  nodeEditTarget,
  vaultLoaded,
  onSaveExplanation,
  datasheet,
}: UseFullDetailA1ModelArgs) {
  return useMemo(() => {
    // 닫힌 표면은 그래프를 순회하지 않는다 — 이 한 줄이 D4 처방의 전부다.
    if (!open) return null;
    if (!nodeFocus || !selectedOntologyNode || !insight) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    const groups = buildFullDetailGroups(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
      changedSlugs,
    );
    const reach = buildFullDetailReachModel(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
    );
    const codeLocations = deriveCodeLocations(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
    );
    const projectTitle = insight.nodes.find((n) => n.kind === "project")?.title ?? null;
    const loadedBody = nodeBody && nodeBody.slug === slug ? nodeBody.body : null;
    const bodyMarkdown = loadedBody ?? selectedOntologyNode.summary ?? null;
    // 전체 상세도 `근거` 목록이 없는 표면 — 자기 문서가 없으면 링크를 지우는
    // 대신 "언급한 문서" 로 라벨을 바꿔 남긴다.
    const documentHref = nodeFocus.ownDocumentSlug
      ? buildDocsVaultHref({ slug: nodeFocus.ownDocumentSlug })
      : null;
    const mentionDocumentHref = nodeFocus.mentionedInSlug
      ? buildDocsVaultHref({ slug: nodeFocus.mentionedInSlug })
      : null;
    const explanationEdit =
      nodeEditTarget &&
      vaultLoaded &&
      nodeBody &&
      nodeBody.slug === nodeEditTarget.vaultSlug
        ? { onSave: onSaveExplanation }
        : null;
    return {
      node: {
        id: selectedOntologyNode.id,
        // 과제 ⑩ — 헤더는 표시용 짧은 제목 크게 + 원본 title 은 fullTitle 로
        // secondary 보존(FullDetailA1 이 다를 때만 렌더).
        title: nodeFocus.displayTitle,
        fullTitle: nodeFocus.title,
        kind: nodeFocus.kind,
        slug,
        // 인계 체인이 쓰는 이름은 매니페스트 slug 가 아니라 볼트가 아는 이름.
        ...(() => {
          const target = resolveNodeAgentTarget(selectedOntologyNode);
          return { agentSlug: target.ref, documented: target.documented };
        })(),
        // 진입 검수 E-5 — 신선도의 단일 진실원은 문서 mtime 램프다
        // (`use-node-datasheet-model` M-3). 세션 changeset baseline 으로
        // 따로 판정하던 이 자리가 데이터시트와 상반된 문장을 냈다
        // (「2일 전 바뀜」 vs 「한동안 그대로」, 같은 domains/catalog).
        // 같은 노드에 대한 데이터시트의 판정을 그대로 받는다 — 없을 때만
        // (다른 노드 / 모델 미생성) 종전 baseline 으로 되돌린다.
        fresh:
          datasheet?.nodeId === selectedOntologyNode.id
            ? datasheet.powered
            : changedSlugs.has(selectedOntologyNode.id),
        updatedAtLabel:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.updatedAtLabel : null,
        // rank7 (design-council B5) — 같은 노드 선택에서 나온
        // `v2DatasheetModel`(compact 패널)의 SAME fact 를 그대로 재사용 —
        // 이 노드의 baseline/heartbeat 판정을 두 번 만들지 않는다(count
        // drift 방지 원칙과 동일 이유).
        lastEditSubject:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.lastEditSubject : null,
        mtimeConflict:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.mtimeConflict : false,
      },
      groups,
      reach,
      codeLocations,
      breadcrumb: {
        projectTitle,
        // P0c — 정본 census (renderProjects 이중 가산 제거)
        totalConcepts: insight.nodes.length,
        totalRelations: insight.edges.length,
      },
      bodyMarkdown,
      explanationEdit,
      documentHref,
      mentionDocumentHref,
    };
  }, [
    open,
    nodeFocus,
    selectedOntologyNode,
    insight,
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vaultLoaded,
    onSaveExplanation,
    datasheet,
  ]);
}
