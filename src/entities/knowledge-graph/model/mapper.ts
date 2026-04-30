import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgePublicMeta,
} from "./types";
import { isKnowledgeGraphSource } from "./types";

function parseDate(value: unknown) {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function fromFirestoreKnowledgeGraphNode(
  id: string,
  data: Record<string, unknown>,
): KnowledgeGraphNode {
  return {
    id,
    accountId: typeof data.accountId === "string" ? data.accountId : undefined,
    title: typeof data.title === "string" ? data.title : id,
    kind: typeof data.kind === "string" ? data.kind : "unknown",
    projectIds: toStringArray(data.projectIds),
    parentId: typeof data.parentId === "string" ? data.parentId : undefined,
    summary: typeof data.summary === "string" ? data.summary : undefined,
    evidenceIds: toStringArray(data.evidenceIds),
    evidenceCount:
      typeof data.evidenceCount === "number" ? data.evidenceCount : undefined,
    currentRevisionId:
      typeof data.currentRevisionId === "string"
        ? data.currentRevisionId
        : undefined,
    lastApprovedAt: parseDate(data.lastApprovedAt),
    lastApprovedBy:
      typeof data.lastApprovedBy === "string" ? data.lastApprovedBy : "unknown",
    publishId: typeof data.publishId === "string" ? data.publishId : undefined,
    projectionVersion:
      typeof data.projectionVersion === "string"
        ? data.projectionVersion
        : undefined,
    publishedAt:
      data.publishedAt === undefined ? undefined : parseDate(data.publishedAt),
    source: isKnowledgeGraphSource(data.source) ? data.source : undefined,
    manualAuthor:
      typeof data.manualAuthor === "string" ? data.manualAuthor : undefined,
    manualNote:
      typeof data.manualNote === "string" ? data.manualNote : undefined,
    tboxVersionId:
      typeof data.tboxVersionId === "string" ? data.tboxVersionId : undefined,
  };
}

export function fromFirestoreKnowledgeGraphEdge(
  id: string,
  data: Record<string, unknown>,
): KnowledgeGraphEdge {
  return {
    id,
    accountId: typeof data.accountId === "string" ? data.accountId : undefined,
    from: typeof data.from === "string" ? data.from : "",
    to: typeof data.to === "string" ? data.to : "",
    type: typeof data.type === "string" ? data.type : "related_to",
    label: typeof data.label === "string" ? data.label : undefined,
    projectIds: toStringArray(data.projectIds),
    evidenceIds: toStringArray(data.evidenceIds),
    evidenceCount:
      typeof data.evidenceCount === "number" ? data.evidenceCount : undefined,
    currentRevisionId:
      typeof data.currentRevisionId === "string"
        ? data.currentRevisionId
        : undefined,
    lastApprovedAt: parseDate(data.lastApprovedAt),
    lastApprovedBy:
      typeof data.lastApprovedBy === "string" ? data.lastApprovedBy : "unknown",
    publishId: typeof data.publishId === "string" ? data.publishId : undefined,
    projectionVersion:
      typeof data.projectionVersion === "string"
        ? data.projectionVersion
        : undefined,
    publishedAt:
      data.publishedAt === undefined ? undefined : parseDate(data.publishedAt),
    source: isKnowledgeGraphSource(data.source) ? data.source : undefined,
    manualAuthor:
      typeof data.manualAuthor === "string" ? data.manualAuthor : undefined,
    manualNote:
      typeof data.manualNote === "string" ? data.manualNote : undefined,
    tboxVersionId:
      typeof data.tboxVersionId === "string" ? data.tboxVersionId : undefined,
  };
}

export function fromFirestoreKnowledgePublicMeta(
  id: string,
  data: Record<string, unknown>,
): KnowledgePublicMeta {
  return {
    id,
    currentPublishId:
      typeof data.currentPublishId === "string" ? data.currentPublishId : "",
    projectionVersion:
      typeof data.projectionVersion === "string"
        ? data.projectionVersion
        : "v1",
    publishedAt: parseDate(data.publishedAt),
  };
}
