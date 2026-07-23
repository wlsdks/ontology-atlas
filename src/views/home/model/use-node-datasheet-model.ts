"use client";

import { useMemo } from "react";
import {
  buildOntologyBuilderNodeHrefFromGraphId,
  deriveCodeLocations,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { isWithinRecentWindow } from "@/shared/lib/ontology-tree";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { buildTopologyOntologyDrawerModel } from "../lib/topology-ontology-drawer";
import { buildTopologyNodeFocus, type TopologyNodeFocusModel } from "../lib/topology-node-focus";
import { buildNodeSignificance, type NodeSignificanceModel } from "../lib/topology-node-significance";
import {
  buildV2ConnectionGroups,
  buildV2Connections,
  buildV2EvidenceRows,
  formatV2HandoffText,
} from "@/widgets/topology-map-v2";

/**
 * 노드 데이터시트(팝오버/패널) 모델 조립 — HomePage 모듈화 3차.
 *
 * 계약 (전부 회귀 이력 있음 — 원 주석 유지):
 * - 카운트 시맨틱 통일: metric 의 contains/usedBy/dependsOn 은 패널이
 *   헤더를 그리는 SAME `groups` 에서 나온다 (독립 계산 두 벌이 평행
 *   엣지에서 갈라지던 페르소나 버그의 재발 방지).
 * - M-2: containment("담는 것")는 방향-only "기대는 곳"과 분리된 타입드
 *   카운트.
 * - M-3: powered(신선도)는 updatedAt(mtime) 사다리 단일 진실원 —
 *   changedSlugs 세션 baseline 과 이원화 금지.
 * - nodeId 는 항상 캔버스 그래프 id (경로 모드 라우트 상태와 동기),
 *   slug 는 vault-slug 우선 fallback (문서/빌더 딥링크·핸드오프용).
 */
export interface UseNodeDatasheetModelArgs {
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** frontmatter `significance` (approach C override) — 있으면 derive 대신. */
  authoredSignificance: string | null;
  docFreshnessIndex: ReadonlyMap<string, string>;
  /** "N일 전" 사다리의 기준 시각 스냅샷 (렌더 purity). */
  updatedAgoNowMs: number;
  /** i18n — `nodeDatasheet.updated_<key>` 해석. */
  formatUpdatedLabel: (key: string, count: number) => string;
}

export interface NodeDatasheetDerivation {
  nodeFocus: TopologyNodeFocusModel | null;
  significance: NodeSignificanceModel | null;
  v2DatasheetModel: {
    slug: string;
    nodeId: string;
    title: string;
    /**
     * 슬라이스 B (라벨 인간화) — 표시 제목이 원문 title 과 다를 때(경로
     * 인간화 등)만 원문을 담는다. 데이터시트가 모노 서브라인으로 보존 렌더.
     * 같으면 null(서브라인 미렌더).
     */
    sourceTitle: string | null;
    kind: string;
    domain: { id: string; title: string } | null;
    powered: boolean;
    updatedAtLabel: string | null;
    metric: { contains: number; usedBy: number; dependsOn: number; evidence: number };
    groups: ReturnType<typeof buildV2ConnectionGroups>;
    evidence: { rows: ReturnType<typeof buildV2EvidenceRows>; total: number };
    /**
     * "코드 위치" — the node's REAL code evidence (raw file paths from vault
     * frontmatter `elements: [...]`), distinct from `evidence` above
     * (which is the self-referential source-doc slug, `evidenceIds`). See
     * `deriveCodeLocations`'s doc comment for why the two must stay separate.
     */
    codeLocations: string[];
    handoffText: string;
    documentHref: string | null;
    builderEditHref: string;
  } | null;
}

export function useNodeDatasheetModel({
  selectedOntologyNode,
  insight,
  authoredSignificance,
  docFreshnessIndex,
  updatedAgoNowMs,
  formatUpdatedLabel,
}: UseNodeDatasheetModelArgs): NodeDatasheetDerivation {
  // drawer model 1회 빌드로 focus(팝오버 연결) + significance(평문 so-what)
  // 둘 다 파생 — 재계산 0, count drift 불가.
  const nodeFocusData = useMemo(() => {
    if (!selectedOntologyNode || !insight) return null;
    const model = buildTopologyOntologyDrawerModel(selectedOntologyNode, insight.nodes, insight.edges);
    return {
      focus: buildTopologyNodeFocus(selectedOntologyNode, model),
      significance: buildNodeSignificance(selectedOntologyNode, model, { authoredSignificance }),
    };
  }, [selectedOntologyNode, insight, authoredSignificance]);
  const nodeFocus = nodeFocusData?.focus ?? null;

  const v2DatasheetModel = useMemo(() => {
    if (!nodeFocus || !selectedOntologyNode || !insight) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    // FULL connection set 에서 그룹 — 5-item preview 로 접으면 허브의
    // dependsOn total 이 generic overflow 로 붕괴하고 핸드오프 이름과
    // 카운트가 모순난다.
    const connections = buildV2Connections(selectedOntologyNode.id, insight.nodes, insight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(selectedOntologyNode.evidenceIds);
    const codeLocations = deriveCodeLocations(selectedOntologyNode.id, insight.nodes, insight.edges);
    const metric = {
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      evidence: evidenceRows.length,
    };
    const handoffText = formatV2HandoffText({
      slug,
      kind: nodeFocus.kind,
      domainTitle: nodeFocusData?.significance.ownerDomainTitle ?? null,
      contains: metric.contains,
      usedBy: metric.usedBy,
      dependsOn: metric.dependsOn,
      evidence: metric.evidence,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
    });
    const freshnessIso = nodeFocus.sourceSlug ? docFreshnessIndex.get(nodeFocus.sourceSlug) : undefined;
    const ago = freshnessIso ? computeUpdatedAgo(freshnessIso, updatedAgoNowMs) : null;
    return {
      slug,
      nodeId: selectedOntologyNode.id,
      // 과제 ⑩ — 컴팩트 팝오버 헤더는 표시용 짧은 제목.
      title: nodeFocus.displayTitle,
      sourceTitle:
        selectedOntologyNode.title !== nodeFocus.displayTitle ? selectedOntologyNode.title : null,
      kind: nodeFocus.kind,
      domain: nodeFocusData?.significance.ownerDomainId
        ? {
            id: nodeFocusData.significance.ownerDomainId,
            title: nodeFocusData.significance.ownerDomainTitle ?? "",
          }
        : null,
      powered: freshnessIso ? isWithinRecentWindow(freshnessIso, updatedAgoNowMs) : false,
      updatedAtLabel: ago ? formatUpdatedLabel(ago.key, ago.count) : null,
      metric,
      groups,
      evidence: { rows: evidenceRows, total: evidenceRows.length },
      codeLocations,
      handoffText,
      // 문서 딥링크는 vault 파일 경로(`?slug=`)로 — 노드 id → 문서 slug 변환은
      // sourceSlug(focus 모델의 순수 파생) 한 곳에서만 나온다(H5 계약 item 2).
      documentHref: nodeFocus.sourceSlug ? buildDocsVaultHref({ slug: nodeFocus.sourceSlug }) : null,
      // 빌더 딥링크는 canonical `<kind>:<slug>`(그래프 node id) 그대로 — 발신 문법
      // 통일(H5 계약 item 1). 예전 `?node=<vault slug>` 인라인 링크를 대체.
      builderEditHref: buildOntologyBuilderNodeHrefFromGraphId(selectedOntologyNode.id),
    };
  }, [nodeFocus, selectedOntologyNode, insight, nodeFocusData, docFreshnessIndex, updatedAgoNowMs, formatUpdatedLabel]);

  return { nodeFocus, significance: nodeFocusData?.significance ?? null, v2DatasheetModel };
}
