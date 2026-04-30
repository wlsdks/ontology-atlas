import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDb, getFirebaseFunctions } from "@/shared/api";
import {
  enqueueDevAdminKnowledgeExtractionJob,
  listDevAdminKnowledgeJobs,
  subscribeDevAdminPolling,
  type DevAdminKnowledgeJobRecord,
} from "@/shared/api/dev-admin-proxy";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";
import {
  type EnqueueKnowledgeExtractionJobInput,
  type EnqueueKnowledgeExtractionJobResult,
  fromFirestoreKnowledgeJob,
  type KnowledgeJob,
} from "@/entities/knowledge-job/model";

const COLLECTION = "knowledgeExtractionJobs";

function knowledgeJobsCollection() {
  return collection(getDb(), COLLECTION);
}

export async function enqueueKnowledgeExtractionJob(
  input: EnqueueKnowledgeExtractionJobInput,
): Promise<EnqueueKnowledgeExtractionJobResult> {
  if (isDevAdminBypassActive()) {
    const result = await enqueueDevAdminKnowledgeExtractionJob(input);
    return {
      ...result,
      status: result.status as EnqueueKnowledgeExtractionJobResult["status"],
    };
  }

  const callable = httpsCallable<
    EnqueueKnowledgeExtractionJobInput,
    EnqueueKnowledgeExtractionJobResult
  >(getFirebaseFunctions(), "enqueueExtractionJob");

  const response = await callable(input);
  return response.data;
}

export function subscribeKnowledgeJobsByDocument(
  documentId: string,
  callback: (jobs: KnowledgeJob[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeJobsByDocument(
  accountId: string | null | undefined,
  documentId: string,
  callback: (jobs: KnowledgeJob[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeJobsByDocument(
  accountIdOrDocumentId: string | null | undefined,
  documentIdOrCallback:
    | string
    | ((jobs: KnowledgeJob[]) => void),
  callbackOrOnError?:
    | ((jobs: KnowledgeJob[]) => void)
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
      ? (callbackOrOnError as (jobs: KnowledgeJob[]) => void)
      : (documentIdOrCallback as (jobs: KnowledgeJob[]) => void);
  const errorFn =
    typeof documentIdOrCallback === "string"
      ? maybeOnError
      : (callbackOrOnError as ((error: Error) => void) | undefined);

  if (isDevAdminBypassActive()) {
    return subscribeDevAdminPolling(
      async () => {
        const records = await listDevAdminKnowledgeJobs(
          targetDocumentId,
          scopedAccountId,
        );
        return records.map(fromDevAdminKnowledgeJobRecord);
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
      knowledgeJobsCollection(),
      ...(scopedAccountId ? [where("accountId", "==", scopedAccountId)] : []),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      callbackFn(
        snapshot.docs
          .map((entry) => fromFirestoreKnowledgeJob(entry.id, entry.data()))
          .filter((entry) => entry.documentId === targetDocumentId),
      );
    },
    (error) => {
      if (errorFn) errorFn(error);
      else console.error("[subscribeKnowledgeJobsByDocument]", error);
    },
  );
}

function fromDevAdminKnowledgeJobRecord(
  record: DevAdminKnowledgeJobRecord,
): KnowledgeJob {
  return {
    id: record.id,
    accountId: record.accountId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    extractorVersion: record.extractorVersion ?? "",
    idempotencyKey: record.idempotencyKey ?? "",
    status: (record.status as KnowledgeJob["status"]) ?? "queued",
    attemptCount: typeof record.attemptCount === "number" ? record.attemptCount : 0,
    maxAttempts: typeof record.maxAttempts === "number" ? record.maxAttempts : 1,
    retryable: Boolean(record.retryable),
    nextAttemptAt: parseDate(record.nextAttemptAt),
    leaseOwner: record.leaseOwner,
    leaseExpiresAt: parseDate(record.leaseExpiresAt),
    generation: typeof record.generation === "number" ? record.generation : 0,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    supersededByJobId: record.supersededByJobId,
    createdAt: parseDate(record.createdAt) ?? new Date(0),
    updatedAt: parseDate(record.updatedAt) ?? new Date(0),
    requestedBy: record.requestedBy ?? "",
  };
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
