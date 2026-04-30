import {
  Timestamp,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import type { ClientErrorInput } from "../model/types";

const COLLECTION = "clientErrors";
const MAX_STACK_LEN = 2_000;

function clientErrorsCollection(accountId: string) {
  return collection(getDb(), COLLECTION);
}

/**
 * 클라이언트 에러 1건 append. fire-and-forget — 로깅 실패가 원본 에러 처리
 * 흐름을 막지 않는다. 데모 세션/미로그인 에는 no-op (rule 이 member 요구).
 */
export async function reportClientError(
  input: ClientErrorInput,
): Promise<void> {
  if (hasDemoSession()) return;
  const normalized = normalizeAccountId(input.accountId);
  if (!normalized) return;

  // 로그인 확인 — auth.currentUser 없으면 rule 이 거부하므로 시도 불필요.
  try {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;
  } catch {
    return;
  }

  const payload = {
    accountId: normalized,
    message: input.message.slice(0, 500),
    stack: input.stack ? input.stack.slice(0, MAX_STACK_LEN) : null,
    url: input.url.slice(0, 500),
    userAgent: input.userAgent.slice(0, 500),
    uid: input.uid,
    digest: input.digest ?? null,
    kind: input.kind,
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(clientErrorsCollection(normalized), payload);
  } catch (err) {
    // 로깅 자체가 실패해도 main error flow 에 영향 주지 않는다.
    console.warn("[reportClientError] failed", err);
  }
}

