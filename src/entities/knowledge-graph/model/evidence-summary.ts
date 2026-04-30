import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeProjectInsight,
} from "./types";

const DEFAULT_EDGE_LABEL_LIMIT = 3;
const DEFAULT_CONCEPT_LIMIT = 4;

export interface KnowledgeProjectEvidenceSummary {
  documentNodes: KnowledgeGraphNode[];
  conceptNodes: KnowledgeGraphNode[];
  edgeLabels: string[];
  featuredDocument: KnowledgeGraphNode | null;
  summaryText: string;
  counts: {
    documents: number;
    concepts: number;
    edges: number;
  };
  hasEvidence: boolean;
}

function sortByEvidenceThenTitle<T extends { evidenceCount?: number; title: string }>(
  left: T,
  right: T,
) {
  const leftEvidence = left.evidenceCount ?? 0;
  const rightEvidence = right.evidenceCount ?? 0;
  if (rightEvidence !== leftEvidence) return rightEvidence - leftEvidence;
  return left.title.localeCompare(right.title, "ko");
}

function sortEdgeByEvidence(left: KnowledgeGraphEdge, right: KnowledgeGraphEdge) {
  const leftEvidence = left.evidenceCount ?? left.evidenceIds.length;
  const rightEvidence = right.evidenceCount ?? right.evidenceIds.length;
  if (rightEvidence !== leftEvidence) return rightEvidence - leftEvidence;
  return (left.label ?? left.type).localeCompare(right.label ?? right.type, "ko");
}

export function buildKnowledgeProjectEvidenceSummary(
  insight: KnowledgeProjectInsight,
  options: {
    edgeLabelLimit?: number;
    conceptLimit?: number;
    subjectName?: string;
  } = {},
): KnowledgeProjectEvidenceSummary {
  const edgeLabelLimit = options.edgeLabelLimit ?? DEFAULT_EDGE_LABEL_LIMIT;
  const conceptLimit = options.conceptLimit ?? DEFAULT_CONCEPT_LIMIT;
  const subjectName = options.subjectName?.trim() || "이 프로젝트";
  const nonProjectNodes = insight.nodes.filter((node) => node.kind !== "project");
  const documentNodes = nonProjectNodes
    .filter((node) => node.kind === "document")
    .sort(sortByEvidenceThenTitle);
  const conceptNodes = nonProjectNodes
    .filter((node) => node.kind !== "document")
    .sort(sortByEvidenceThenTitle)
    .slice(0, conceptLimit);

  const seenLabels = new Set<string>();
  const edgeLabels = [...insight.edges]
    .sort(sortEdgeByEvidence)
    .map((edge) => (edge.label ?? edge.type).trim())
    .filter((label) => {
      if (!label || seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    })
    .slice(0, edgeLabelLimit);
  const featuredDocument = documentNodes[0] ?? null;
  const conceptTitles = conceptNodes.slice(0, 3).map((node) => node.title);
  const summaryText = (() => {
    if (featuredDocument && conceptTitles.length > 0 && edgeLabels.length > 0) {
      return `${subjectName}: ${featuredDocument.title}에서 ${conceptTitles.join(" · ")}와 함께 등장하고, ${edgeLabels.slice(0, 2).join(" · ")} 연결로 설명됩니다.`;
    }
    if (featuredDocument && conceptTitles.length > 0) {
      return `${subjectName}: ${featuredDocument.title}에서 ${conceptTitles.join(" · ")}와 함께 설명됩니다.`;
    }
    if (featuredDocument && edgeLabels.length > 0) {
      return `${subjectName}: ${featuredDocument.title}에서 ${edgeLabels.slice(0, 2).join(" · ")} 연결로 설명됩니다.`;
    }
    if (featuredDocument) {
      return `${subjectName}: ${featuredDocument.title}이 대표 문서입니다.`;
    }
    if (conceptTitles.length > 0) {
      return `${subjectName}: 문서에서 ${conceptTitles.join(" · ")}와 함께 등장합니다.`;
    }
    if (edgeLabels.length > 0) {
      return `${subjectName}: 문서에서 ${edgeLabels.slice(0, 2).join(" · ")} 연결로 설명됩니다.`;
    }
    return "";
  })();

  return {
    documentNodes,
    conceptNodes,
    edgeLabels,
    featuredDocument,
    summaryText,
    counts: {
      documents: documentNodes.length,
      concepts: nonProjectNodes.length - documentNodes.length,
      edges: insight.edges.length,
    },
    hasEvidence: nonProjectNodes.length > 0 || insight.edges.length > 0,
  };
}
