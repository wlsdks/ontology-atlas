import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { generateApiKeyPlaintext, sha256Hex } from "@/shared/lib/sha256";
import { fromFirestoreApiKey } from "../model/mapper";
import type { ApiKey } from "../model/types";

/**
 * API Key Firestore CRUD.
 *
 * 경로: `accounts/{accountId}/apiKeys/{keyId}`
 *
 * 보안 모델:
 *  - 평문 키는 generateApiKey 가 1회만 반환. Firestore 에는 SHA-256(plaintext)
 *    만 저장.
 *  - 발급한 사용자 외에는 평문을 복원할 수 없음.
 *  - revoke 는 `revokedAt` 만 set, 삭제 안 함 (audit 보존).
 */

const COLLECTION = "apiKeys";

function apiKeysCollection(accountId: string) {
  return collection(getDb(), "accounts", accountId, COLLECTION);
}

function apiKeyDoc(accountId: string, keyId: string) {
  return doc(getDb(), "accounts", accountId, COLLECTION, keyId);
}

export interface GenerateApiKeyResult {
  /** 평문 키 — 발급 직후 한 번만 노출. UI 가 즉시 클립보드 안내. */
  plaintext: string;
  /** Firestore 에 저장된 record (keyHash 만 있음). */
  record: ApiKey;
}

/**
 * 새 API key 생성. plaintext + record 반환. plaintext 는 그 즉시
 * 호출 측이 사용자에게 1회 노출 후 폐기.
 */
export async function generateApiKey(input: {
  accountId: string;
  name: string;
  createdBy: string;
}): Promise<GenerateApiKeyResult> {
  const accountId = normalizeAccountId(input.accountId);
  if (!accountId) throw new Error("accountId 가 필요합니다.");
  if (hasDemoSession()) {
    throw new Error("데모 세션에서는 API 키를 발급할 수 없습니다.");
  }
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("키 이름이 필요합니다.");

  const plaintext = generateApiKeyPlaintext();
  const keyHash = await sha256Hex(plaintext);
  const keyPrefix = plaintext.slice(0, 12); // "nk_xxxxxxxx" 정도

  const ref = doc(apiKeysCollection(accountId));
  await setDoc(ref, {
    accountId,
    name: trimmedName,
    keyHash,
    keyPrefix,
    scope: "account-rw" as const,
    createdAt: serverTimestamp(),
    createdBy: input.createdBy,
    usageCount: 0,
    revokedAt: null,
  });

  // 생성 직후 fresh 데이터 (createdAt 은 서버 timestamp 라 client 기준 임시 Date).
  const now = new Date();
  return {
    plaintext,
    record: {
      id: ref.id,
      accountId,
      name: trimmedName,
      keyHash,
      keyPrefix,
      scope: "account-rw",
      createdAt: now,
      createdBy: input.createdBy,
      usageCount: 0,
      revokedAt: null,
    },
  };
}

/** 한 워크스페이스의 모든 키 (revoked 포함) — 1회성 fetch. */
export async function listApiKeys(
  accountId: string | null | undefined,
): Promise<ApiKey[]> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || hasDemoSession()) return [];
  const snapshot = await getDocs(
    query(apiKeysCollection(normalized), orderBy("createdAt", "desc")),
  );
  return snapshot.docs.map((d) => fromFirestoreApiKey(d.id, d.data()));
}

/** 라이브 구독 — admin UI 가 발급/revoke 직후 즉시 갱신. */
export function subscribeApiKeys(
  accountId: string | null | undefined,
  callback: (keys: ApiKey[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || hasDemoSession()) {
    Promise.resolve().then(() => callback([]));
    return () => {};
  }
  const q = query(apiKeysCollection(normalized), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => fromFirestoreApiKey(d.id, d.data())));
    },
    (err) => onError?.(err),
  );
}

/** 키 revoke (soft-delete). 다시 활성화 불가. */
export async function revokeApiKey(
  accountId: string | null | undefined,
  keyId: string,
): Promise<void> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) throw new Error("accountId 가 필요합니다.");
  if (hasDemoSession()) {
    throw new Error("데모 세션에서는 revoke 할 수 없습니다.");
  }
  if (!keyId.trim()) throw new Error("keyId 가 필요합니다.");
  await updateDoc(apiKeyDoc(normalized, keyId), {
    revokedAt: serverTimestamp(),
  });
}
