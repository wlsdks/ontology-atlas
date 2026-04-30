import { Timestamp, type DocumentData } from "firebase/firestore";
import type { KnowledgeVersion } from "./types";

export function fromFirestoreKnowledgeVersion(
  id: string,
  data: DocumentData,
): KnowledgeVersion {
  return {
    id,
    documentId: String(data.documentId ?? ""),
    title: String(data.title ?? id),
    kind: String(data.kind ?? "spec"),
    projectIds: Array.isArray(data.projectIds)
      ? data.projectIds.map((item: unknown) => String(item))
      : [],
    frontmatter:
      data.frontmatter && typeof data.frontmatter === "object"
        ? (data.frontmatter as KnowledgeVersion["frontmatter"])
        : {},
    storagePath: String(data.storagePath ?? ""),
    mimeType: String(data.mimeType ?? "text/markdown"),
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    hash: String(data.hash ?? ""),
    createdAt: toDate(data.createdAt),
    createdBy: String(data.createdBy ?? ""),
  };
}

export function toFirestoreKnowledgeVersion(
  version: Omit<KnowledgeVersion, "id" | "createdAt">,
): Record<string, unknown> {
  return {
    documentId: version.documentId,
    title: version.title,
    kind: version.kind,
    projectIds: version.projectIds,
    frontmatter: version.frontmatter,
    storagePath: version.storagePath,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    hash: version.hash,
    createdBy: version.createdBy,
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
