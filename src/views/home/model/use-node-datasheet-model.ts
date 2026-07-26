"use client";

import { useMemo, useRef } from "react";
import {
  buildOntologyStudioNodeHrefFromGraphId,
  deriveCodeLocations,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { computeEditAge } from "@/shared/lib/edit-age";
import type { LastEditSubjectKind } from "@/shared/lib/last-edit-subject";
import { isWithinRecentWindow } from "@/shared/lib/ontology-tree";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { hasNodeMtimeConflict, resolveNodeLastEditSubject } from "../lib/resolve-node-edit-subject";
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
  /** Static samples are facts to inspect, never an MCP write target. */
  handoffSource: "loaded-vault" | "read-only-sample";
  /** frontmatter `significance` (approach C override) — 있으면 derive 대신. */
  authoredSignificance: string | null;
  docFreshnessIndex: ReadonlyMap<string, string>;
  /** "N일 전" 사다리의 기준 시각 스냅샷 (렌더 purity). */
  updatedAgoNowMs: number;
  /** i18n — `nodeDatasheet.updated_<key>` 해석. */
  formatUpdatedLabel: (key: string, count: number) => string;
  /** rank7 (design-council B5) — "마지막 편집" 주체/충돌 배지의 실데이터
   *  출처. `emptyAgentActivityStatus()` 로 항상 defined (heartbeat 없으면
   *  agent 후보가 자동으로 근거 없음 처리된다). */
  agentActivityStatus: AgentActivityStatus;
  /** W6 `resolveAgentFocusNodeId` 결과 재사용 — P4b 배지와 이 fact 가 항상
   *  같은 노드를 가리키게(별도 재-매칭 로직 만들지 않음). */
  agentFocusNodeId: string | null;
  /** `useLocalVault().selfEditTimestamps` — 이번 세션이 실제로 쓴 slug 의
   *  기록. "마지막 편집 · 나" 및 충돌 배지 둘 다의 유일한 human 근거. */
  selfEditTimestamps: ReadonlyMap<string, number>;
  /** i18n — `editProvenance.age.<key>` 해석. */
  formatEditAgeLabel: (key: string, count: number) => string;
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
    metric: {
      contains: number;
      usedBy: number;
      dependsOn: number;
      belongsTo: number;
      evidence: number;
    };
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
    /**
     * **이 노드 자신의** 문서 딥링크. 관계에서만 이름이 불린 노드(자기 `.md`
     * 없음)는 null — 예전에는 그 노드를 인용한 남의 문서 링크가 여기 들어가
     * "문서" 버튼이 다른 개념의 글을 열었다.
     */
    documentHref: string | null;
    /**
     * 자기 문서가 없는 노드를 적어 둔 다른 문서의 딥링크. 팝오버는 이 링크를
     * `근거` 그룹이 이미 이름까지 붙여 보여주므로 액션으로 다시 내지 않고,
     * 근거 목록이 없는 표면(컨텍스트 메뉴 · 전체 상세)만 이 값을 쓴다.
     */
    mentionDocumentHref: string | null;
    studioEditHref: string;
    /** rank7 — 실데이터 근거(heartbeat 매치 / 자기 쓰기 기록) 있을 때만
     *  non-null. 사람/AI 는 `kind` 로만 구분(hue 0). */
    lastEditSubject: { kind: LastEditSubjectKind; ageLabel: string } | null;
    /** rank7 — 실제 mtime mismatch 있을 때만 true. */
    mtimeConflict: boolean;
  } | null;
}

export function useNodeDatasheetModel({
  selectedOntologyNode,
  insight,
  handoffSource,
  authoredSignificance,
  docFreshnessIndex,
  updatedAgoNowMs,
  formatUpdatedLabel,
  agentActivityStatus,
  agentFocusNodeId,
  selfEditTimestamps,
  formatEditAgeLabel,
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

  // rank7 — 이 노드를 "연" (선택한) 시점의 freshness baseline. nodeId 가
  // 바뀔 때만 재설정 — 같은 노드를 계속 보는 동안 폴링이 freshness 를
  // 바꾸면 그게 바로 "연 뒤에 바뀐" 실제 신호다. ref 변경은 렌더를 새로
  // 유발하지 않으므로 순수성 문제 없음(React 의 "렌더 중 파생 상태" 패턴).
  // capturedAtMs 는 `updatedAgoNowMs`(세션 스냅샷, 렌더 purity — 파일 상단
  // 계약 재사용) — 새 `Date.now()` 호출 0.
  const editBaselineRef = useRef<{
    nodeId: string;
    freshnessIso: string | null;
    capturedAtMs: number;
  } | null>(null);
  const currentNodeId = selectedOntologyNode?.id ?? null;
  const currentSourceSlug = nodeFocus?.sourceSlug ?? null;
  const currentFreshnessIso = currentSourceSlug ? docFreshnessIndex.get(currentSourceSlug) ?? null : null;
  if (currentNodeId !== null && editBaselineRef.current?.nodeId !== currentNodeId) {
    editBaselineRef.current = {
      nodeId: currentNodeId,
      freshnessIso: currentFreshnessIso,
      capturedAtMs: updatedAgoNowMs,
    };
  }

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
      // 부모(속한 곳)까지 네 버킷 전부 — 이 값이 빠져 있던 동안 부모만 있는
      // 노드의 핸드오프가 "연결 0" 으로 나갔다.
      belongsTo: groups.belongsTo.total,
      evidence: evidenceRows.length,
    };
    const handoffText = formatV2HandoffText({
      source: handoffSource,
      slug,
      kind: nodeFocus.kind,
      domainTitle: nodeFocusData?.significance.ownerDomainTitle ?? null,
      contains: metric.contains,
      usedBy: metric.usedBy,
      dependsOn: metric.dependsOn,
      belongsTo: metric.belongsTo,
      evidence: metric.evidence,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
      belongsToNames: groups.belongsTo.rows.map((connection) => connection.title),
    });
    const freshnessIso = nodeFocus.sourceSlug ? docFreshnessIndex.get(nodeFocus.sourceSlug) : undefined;
    const ago = freshnessIso ? computeUpdatedAgo(freshnessIso, updatedAgoNowMs) : null;

    // rank7 (design-council B5) — 실데이터 2종(heartbeat 매치 / 자기 쓰기
    // 기록)만 후보로 넣는다. 둘 다 근거 없으면 lastEditSubject 는 null.
    const lastEditSubjectFact = resolveNodeLastEditSubject({
      nodeId: selectedOntologyNode.id,
      sourceSlug: nodeFocus.sourceSlug,
      agentActivityStatus,
      agentFocusNodeId,
      selfEditTimestamps,
    });
    const lastEditSubject = lastEditSubjectFact
      ? {
          kind: lastEditSubjectFact.kind,
          ageLabel: (() => {
            const age = computeEditAge(lastEditSubjectFact.atMs, updatedAgoNowMs);
            return formatEditAgeLabel(age.key, age.count);
          })(),
        }
      : null;

    const baseline = editBaselineRef.current;
    const mtimeConflict = hasNodeMtimeConflict({
      sourceSlug: nodeFocus.sourceSlug,
      baselineFreshnessIso: baseline && baseline.nodeId === selectedOntologyNode.id ? baseline.freshnessIso : null,
      currentFreshnessIso: freshnessIso ?? null,
      baselineCapturedAtMs:
        baseline && baseline.nodeId === selectedOntologyNode.id ? baseline.capturedAtMs : updatedAgoNowMs,
      selfEditTimestamps,
    });

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
      // focus 모델의 순수 파생 한 곳에서만 나온다(H5 계약 item 2). `sourceSlug`
      // 가 아니라 `ownDocumentSlug` 를 쓰는 이유: 관계에서만 이름이 불린 노드의
      // sourceSlug 는 자기를 인용한 *남의* 문서라, 그대로 쓰면 "문서" 버튼이
      // 다른 개념의 글을 연다.
      documentHref: nodeFocus.ownDocumentSlug
        ? buildDocsVaultHref({ slug: nodeFocus.ownDocumentSlug })
        : null,
      mentionDocumentHref: nodeFocus.mentionedInSlug
        ? buildDocsVaultHref({ slug: nodeFocus.mentionedInSlug })
        : null,
      // 빌더 딥링크는 canonical `<kind>:<slug>`(그래프 node id) 그대로 — 발신 문법
      // 통일(H5 계약 item 1). 예전 `?node=<vault slug>` 인라인 링크를 대체.
      studioEditHref: buildOntologyStudioNodeHrefFromGraphId(selectedOntologyNode.id),
      lastEditSubject,
      mtimeConflict,
    };
  }, [
    nodeFocus,
    selectedOntologyNode,
    insight,
    handoffSource,
    nodeFocusData,
    docFreshnessIndex,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps,
    formatEditAgeLabel,
  ]);

  return { nodeFocus, significance: nodeFocusData?.significance ?? null, v2DatasheetModel };
}
