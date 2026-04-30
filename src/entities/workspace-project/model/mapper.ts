import type { DocumentData } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import type { WorkspaceProject } from "./types";

/**
 * Firestore raw document → domain 변환. Timestamp → Date 자동 변환.
 * 누락된 필드는 합리적 기본값으로 채운다 (타입 엄격성 + 런타임 안전).
 */
export function fromFirestoreWorkspaceProject(
  id: string,
  data: DocumentData,
): WorkspaceProject {
  const toDate = (value: unknown): Date => {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    return new Date();
  };
  return {
    id,
    accountId: typeof data.accountId === "string" ? data.accountId : "",
    name: typeof data.name === "string" ? data.name : id,
    description: typeof data.description === "string" ? data.description : undefined,
    isPublic: typeof data.isPublic === "boolean" ? data.isPublic : undefined,
    order: typeof data.order === "number" ? data.order : undefined,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}
