import { Timestamp, type DocumentData } from "firebase/firestore";
import { clampConfidence } from "./confidence";
import type {
  KnowledgeOutput,
  KnowledgeOutputEdge,
  KnowledgeOutputGrade,
  KnowledgeOutputNode,
  KnowledgeOutputUsage,
} from "./types";

const GRADE_VALUES = ["A", "B", "C"] as const;

function toGrade(value: unknown): KnowledgeOutputGrade | undefined {
  if (typeof value !== "string") return undefined;
  return (GRADE_VALUES as readonly string[]).includes(value)
    ? (value as KnowledgeOutputGrade)
    : undefined;
}

function toUsage(value: unknown): KnowledgeOutputUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const inputTokens =
    typeof obj.inputTokens === "number" && Number.isFinite(obj.inputTokens)
      ? obj.inputTokens
      : undefined;
  const outputTokens =
    typeof obj.outputTokens === "number" && Number.isFinite(obj.outputTokens)
      ? obj.outputTokens
      : undefined;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const usage: KnowledgeOutputUsage = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  };
  if (
    typeof obj.estimatedCostUsd === "number" &&
    Number.isFinite(obj.estimatedCostUsd)
  ) {
    usage.estimatedCostUsd = obj.estimatedCostUsd;
  }
  return usage;
}

export function fromFirestoreKnowledgeOutput(
  id: string,
  data: DocumentData,
): KnowledgeOutput {
  const nodes = Array.isArray(data.nodes)
    ? data.nodes
        .map(mapNode)
        .filter((node): node is KnowledgeOutputNode => node !== null)
    : [];
  const edges = Array.isArray(data.edges)
    ? data.edges
        .map(mapEdge)
        .filter((edge): edge is KnowledgeOutputEdge => edge !== null)
    : [];
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.map((warning) => String(warning))
    : [];

  const result: KnowledgeOutput = {
    id,
    jobId: String(data.jobId ?? ""),
    documentId: String(data.documentId ?? ""),
    documentVersionId: String(data.documentVersionId ?? ""),
    extractorVersion: String(data.extractorVersion ?? ""),
    provider: String(data.provider ?? ""),
    summary: String(data.summary ?? ""),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    warningCount: warnings.length,
    nodes,
    edges,
    warnings,
    createdAt: toDate(data.createdAt),
  };
  // ontology 추출 (provider='anthropic') 만 채우는 추가 메타. legacy Gemini
  // 출력에는 없으므로 정의된 경우만 set.
  const grade = toGrade(data.grade);
  if (grade) result.grade = grade;
  const usage = toUsage(data.usage);
  if (usage) result.usage = usage;
  if (
    typeof data.validationErrorCount === "number" &&
    Number.isFinite(data.validationErrorCount)
  ) {
    result.validationErrorCount = data.validationErrorCount;
  }
  if (typeof data.latencyMs === "number" && Number.isFinite(data.latencyMs)) {
    result.latencyMs = data.latencyMs;
  }
  return result;
}

function mapNode(value: unknown): KnowledgeOutputNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  return {
    tempId: String(node.tempId ?? ""),
    title: String(node.title ?? ""),
    kind: String(node.kind ?? ""),
    projectIds: Array.isArray(node.projectIds)
      ? node.projectIds.map((item) => String(item))
      : [],
    summary: String(node.summary ?? ""),
    confidence: clampConfidence(node.confidence),
    warnings: Array.isArray(node.warnings)
      ? node.warnings.map((warning) => String(warning))
      : [],
  };
}

function mapEdge(value: unknown): KnowledgeOutputEdge | null {
  if (!value || typeof value !== "object") return null;
  const edge = value as Record<string, unknown>;
  return {
    tempId: String(edge.tempId ?? ""),
    fromTempId: String(edge.fromTempId ?? edge.from ?? ""),
    toTempId: String(edge.toTempId ?? edge.to ?? ""),
    type: String(edge.type ?? ""),
    label: String(edge.label ?? ""),
    confidence: clampConfidence(edge.confidence),
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
