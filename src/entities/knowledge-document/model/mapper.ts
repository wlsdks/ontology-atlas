import { Timestamp, type DocumentData } from "firebase/firestore";
import type {
  KnowledgeDocument,
  KnowledgeDocumentMetadataInput,
} from "./types";

export function fromFirestoreKnowledgeDocument(
  id: string,
  data: DocumentData,
): KnowledgeDocument {
  return {
    id,
    accountId: typeof data.accountId === "string" ? data.accountId : undefined,
    title: String(data.title ?? id),
    kind: String(data.kind ?? "spec"),
    projectIds: Array.isArray(data.projectIds)
      ? data.projectIds.map((item: unknown) => String(item))
      : [],
    sourceType: (data.sourceType as KnowledgeDocument["sourceType"]) ?? "manual",
    currentVersionId: String(data.currentVersionId ?? ""),
    formatScore:
      typeof data.formatScore === "number" ? data.formatScore : undefined,
    status: (data.status as KnowledgeDocument["status"]) ?? "draft",
    latestJobStatus:
      typeof data.latestJobStatus === "string" ? data.latestJobStatus : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: String(data.createdBy ?? ""),
  };
}

export function toFirestoreKnowledgeDocument(
  input: Omit<KnowledgeDocument, "id" | "createdAt" | "updatedAt">,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: input.title,
    kind: input.kind,
    projectIds: input.projectIds,
    sourceType: input.sourceType,
    currentVersionId: input.currentVersionId,
    status: input.status,
    createdBy: input.createdBy,
  };

  if (input.accountId !== undefined) payload.accountId = input.accountId;
  if (input.formatScore !== undefined) payload.formatScore = input.formatScore;
  if (input.latestJobStatus !== undefined) {
    payload.latestJobStatus = input.latestJobStatus;
  }

  return payload;
}

export function toKnowledgeDocumentMetadataInput(
  document: Pick<KnowledgeDocument, "title" | "kind" | "projectIds">,
): KnowledgeDocumentMetadataInput {
  return {
    title: document.title,
    kind: document.kind,
    projectIds: document.projectIds,
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
