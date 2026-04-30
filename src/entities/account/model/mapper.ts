import { Timestamp, type DocumentData } from "firebase/firestore";
import type { Account, AccountMembership, AccountRole } from "./types";

function toDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

export function fromFirestoreAccount(
  id: string,
  data: DocumentData,
): Account {
  return {
    id,
    name: data.name ?? id,
    description: data.description ?? undefined,
    isPublic: Boolean(data.isPublic),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export function fromFirestoreAccountMembership(
  id: string,
  data: DocumentData,
): AccountMembership {
  return {
    id,
    accountId: data.accountId ?? "",
    uid: data.uid ?? "",
    email: data.email ?? undefined,
    role: (data.role as AccountRole) ?? "viewer",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}
