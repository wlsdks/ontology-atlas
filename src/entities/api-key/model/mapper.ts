import { Timestamp, type DocumentData } from "firebase/firestore";
import type { ApiKey } from "./types";

/**
 * Firestore document → domain ApiKey. createdAt/lastUsedAt/revokedAt 는
 * Timestamp → Date 변환. 누락 필드는 안전한 기본값.
 */
export function fromFirestoreApiKey(id: string, data: DocumentData): ApiKey {
  const createdAt =
    data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0);
  const lastUsedAt =
    data.lastUsedAt instanceof Timestamp ? data.lastUsedAt.toDate() : undefined;
  const revokedAt =
    data.revokedAt instanceof Timestamp ? data.revokedAt.toDate() : null;

  return {
    id,
    accountId: typeof data.accountId === "string" ? data.accountId : "",
    name: typeof data.name === "string" ? data.name : id,
    keyHash: typeof data.keyHash === "string" ? data.keyHash : "",
    keyPrefix: typeof data.keyPrefix === "string" ? data.keyPrefix : "",
    scope: "account-rw",
    createdAt,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    lastUsedAt,
    usageCount: typeof data.usageCount === "number" ? data.usageCount : 0,
    revokedAt,
  };
}
