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
  listDevAdminKnowledgeOutputs,
  subscribeDevAdminPolling,
  type DevAdminKnowledgeOutputRecord,
} from "@/shared/api/dev-admin-proxy";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";
import {
  fromFirestoreKnowledgeOutput,
  type KnowledgeOutput,
} from "@/entities/knowledge-output/model";

const COLLECTION = "knowledgeExtractionOutputs";

function knowledgeOutputsCollection() {
  return collection(getDb(), COLLECTION);
}

export function subscribeKnowledgeOutputsByDocument(
  documentId: string,
  callback: (outputs: KnowledgeOutput[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeOutputsByDocument(
  accountId: string | null | undefined,
  documentId: string,
  callback: (outputs: KnowledgeOutput[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe;
export function subscribeKnowledgeOutputsByDocument(
  accountIdOrDocumentId: string | null | undefined,
  documentIdOrCallback:
    | string
    | ((outputs: KnowledgeOutput[]) => void),
  callbackOrOnError?:
    | ((outputs: KnowledgeOutput[]) => void)
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
      ? (callbackOrOnError as (outputs: KnowledgeOutput[]) => void)
      : (documentIdOrCallback as (outputs: KnowledgeOutput[]) => void);
  const errorFn =
    typeof documentIdOrCallback === "string"
      ? maybeOnError
      : (callbackOrOnError as ((error: Error) => void) | undefined);

  if (isDevAdminBypassActive()) {
    return subscribeDevAdminPolling(
      async () => {
        const records = await listDevAdminKnowledgeOutputs(
          targetDocumentId,
          scopedAccountId,
        );
        return records.map(fromDevAdminKnowledgeOutputRecord);
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
      knowledgeOutputsCollection(),
      ...(scopedAccountId ? [where("accountId", "==", scopedAccountId)] : []),
      where("documentId", "==", targetDocumentId),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      callbackFn(
        snapshot.docs.map((entry) =>
          fromFirestoreKnowledgeOutput(entry.id, entry.data()),
        ),
      );
    },
    (error) => {
      if (errorFn) errorFn(error);
      else console.error("[subscribeKnowledgeOutputsByDocument]", error);
    },
  );
}

function fromDevAdminKnowledgeOutputRecord(
  record: DevAdminKnowledgeOutputRecord,
): KnowledgeOutput {
  return {
    id: record.id,
    accountId: record.accountId,
    jobId: record.jobId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    extractorVersion: record.extractorVersion ?? "",
    provider: record.provider ?? "",
    summary: record.summary ?? "",
    nodeCount: Array.isArray(record.nodes) ? record.nodes.length : 0,
    edgeCount: Array.isArray(record.edges) ? record.edges.length : 0,
    warningCount: Array.isArray(record.warnings) ? record.warnings.length : 0,
    nodes: Array.isArray(record.nodes)
      ? record.nodes
          .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"))
          .map((node) => ({
            tempId: String(node.tempId ?? ""),
            title: String(node.title ?? ""),
            kind: String(node.kind ?? ""),
            projectIds: Array.isArray(node.projectIds)
              ? node.projectIds.map((item) => String(item))
              : [],
            summary: String(node.summary ?? ""),
            confidence: Number(node.confidence ?? 0),
            warnings: Array.isArray(node.warnings)
              ? node.warnings.map((warning) => String(warning))
              : [],
          }))
      : [],
    edges: Array.isArray(record.edges)
      ? record.edges
          .filter((edge): edge is Record<string, unknown> => Boolean(edge && typeof edge === "object"))
          .map((edge) => ({
            tempId: String(edge.tempId ?? ""),
            fromTempId: String(edge.fromTempId ?? edge.from ?? ""),
            toTempId: String(edge.toTempId ?? edge.to ?? ""),
            type: String(edge.type ?? ""),
            label: String(edge.label ?? ""),
            confidence: Number(edge.confidence ?? 0),
          }))
      : [],
    warnings: Array.isArray(record.warnings)
      ? record.warnings.map((warning) => String(warning))
      : [],
    createdAt: parseDate(record.createdAt),
  };
}

function parseDate(value?: string): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
