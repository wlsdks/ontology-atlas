import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/shared/api";
import {
  listDevAdminKnowledgeEvidence,
  subscribeDevAdminPolling,
  type DevAdminKnowledgeEvidenceRecord,
} from "@/shared/api/dev-admin-proxy";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";
import {
  fromFirestoreKnowledgeEvidence,
  type KnowledgeEvidence,
} from "@/entities/knowledge-evidence/model";

const COLLECTION = "knowledgeEvidence";

function knowledgeEvidenceCollection() {
  return collection(getDb(), COLLECTION);
}

export function subscribeKnowledgeEvidenceByDocument(
  documentId: string,
  callback: (evidence: KnowledgeEvidence[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeEvidenceByDocument(
  accountId: string | null | undefined,
  documentId: string,
  callback: (evidence: KnowledgeEvidence[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeEvidenceByDocument(
  accountIdOrDocumentId: string | null | undefined,
  documentIdOrCallback:
    | string
    | ((evidence: KnowledgeEvidence[]) => void),
  callbackOrOnError?:
    | ((evidence: KnowledgeEvidence[]) => void)
    | ((error: Error) => void),
  maybeOnError?: (error: Error) => void,
): Unsubscribe {
  const scopedAccountId =
    typeof documentIdOrCallback === "string"
      ? normalizeAccountId(accountIdOrDocumentId)
      : null;
  const targetDocumentId =
    typeof documentIdOrCallback === "string"
      ? documentIdOrCallback
      : String(accountIdOrDocumentId ?? "");
  const callbackFn =
    typeof documentIdOrCallback === "string"
      ? (callbackOrOnError as (evidence: KnowledgeEvidence[]) => void)
      : (documentIdOrCallback as (evidence: KnowledgeEvidence[]) => void);
  const errorFn =
    typeof documentIdOrCallback === "string"
      ? maybeOnError
      : (callbackOrOnError as ((error: Error) => void) | undefined);

  if (isDevAdminBypassActive()) {
    return subscribeDevAdminPolling(
      async () => {
        const records = await listDevAdminKnowledgeEvidence(
          targetDocumentId,
          scopedAccountId,
        );
        return records.map(fromDevAdminKnowledgeEvidenceRecord);
      },
      callbackFn,
      errorFn,
    );
  }

  if (hasDemoSession()) {
    Promise.resolve().then(() => callbackFn([]));
    return () => {};
  }

  return onSnapshot(
    query(
      knowledgeEvidenceCollection(),
      ...(scopedAccountId ? [where("accountId", "==", scopedAccountId)] : []),
      where("documentId", "==", targetDocumentId),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      callbackFn(
        snapshot.docs.map((entry) =>
          fromFirestoreKnowledgeEvidence(entry.id, entry.data()),
        ),
      );
    },
    (error) => {
      if (errorFn) errorFn(error);
      else console.error("[subscribeKnowledgeEvidenceByDocument]", error);
    },
  );
}

function fromDevAdminKnowledgeEvidenceRecord(
  record: DevAdminKnowledgeEvidenceRecord,
): KnowledgeEvidence {
  return {
    id: record.id,
    accountId: record.accountId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    versionHash: record.versionHash ?? "",
    chunkId: record.chunkId ?? "",
    chunkHash: record.chunkHash ?? "",
    charStart: typeof record.charStart === "number" ? record.charStart : 0,
    charEnd: typeof record.charEnd === "number" ? record.charEnd : 0,
    excerpt: record.excerpt ?? "",
    locatorVersion: record.locatorVersion ?? "",
    extractorVersion: record.extractorVersion ?? "",
    sourceOutputId: record.sourceOutputId ?? "",
    createdAt: parseDate(record.createdAt),
  };
}

function parseDate(value?: string): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
