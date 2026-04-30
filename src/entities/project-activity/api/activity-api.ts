import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";
import { hasDemoSession } from "@/shared/lib/demo-session";
import type { ProjectActivity, ProjectActivityInput } from "../model/types";

const COLLECTION = "projectActivity";

function activityCollection(accountId?: string | null) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? collection(getDb(), "accounts", normalizedAccountId, COLLECTION)
    : collection(getDb(), COLLECTION);
}

function fromFirestore(doc: QueryDocumentSnapshot<DocumentData>): ProjectActivity {
  const data = doc.data();
  const createdRaw = data.createdAt;
  const createdAt =
    createdRaw instanceof Timestamp
      ? createdRaw.toDate()
      : createdRaw instanceof Date
        ? createdRaw
        : new Date();
  return {
    id: doc.id,
    action: data.action,
    projectSlug: data.projectSlug,
    projectName: data.projectName,
    actorEmail: data.actorEmail ?? undefined,
    actorName: data.actorName ?? undefined,
    accountId: data.accountId ?? null,
    summary: data.summary ?? undefined,
    createdAt,
  };
}

/**
 * 활동 로그 기록. 데모/개발 우회 세션에서는 no-op 으로 주 작업을 방해하지
 * 않는다. Firestore 쓰기 실패도 호출부에 전파하지 않고 콘솔 경고만 남긴다 —
 * 로그는 보조 신호라 부재해도 메인 CRUD 성공을 막지 않는 게 맞다.
 */
export async function recordProjectActivity(
  input: ProjectActivityInput,
): Promise<void> {
  // 현재 account-scoped 공간만 기록 대상. 글로벌 프로젝트는 MVP 범위 밖.
  if (input.accountId == null) return;
  if (hasDemoSession() || isDevAdminBypassActive()) return;

  // actor 정보 보강 — 호출부가 명시적으로 주입한 값이 있으면 우선.
  let actorEmail = input.actorEmail;
  let actorName = input.actorName;
  try {
    const auth = getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      actorEmail = actorEmail ?? currentUser.email ?? undefined;
      actorName = actorName ?? currentUser.displayName ?? undefined;
    }
  } catch {
    /* auth 미초기화 상황 무시 */
  }

  try {
    await addDoc(activityCollection(input.accountId), {
      action: input.action,
      projectSlug: input.projectSlug,
      projectName: input.projectName,
      actorEmail: actorEmail ?? null,
      actorName: actorName ?? null,
      accountId: input.accountId,
      summary: input.summary ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[project-activity] recordProjectActivity failed:", err);
    }
  }
}

/**
 * 최근 활동 구독. 기본 20개, createdAt DESC. 데모/개발 우회 세션에서는
 * 빈 배열을 한 번 돌려준다.
 */
export function subscribeProjectActivity(
  accountId: string | null | undefined,
  callback: (activities: ProjectActivity[]) => void,
  options?: { limitCount?: number; onError?: (err: Error) => void },
): Unsubscribe {
  const limitCount = options?.limitCount ?? 20;
  const normalizedAccountId = normalizeAccountId(accountId);

  if (!normalizedAccountId || hasDemoSession() || isDevAdminBypassActive()) {
    Promise.resolve().then(() => callback([]));
    return () => {};
  }

  const q = query(
    activityCollection(normalizedAccountId),
    orderBy("createdAt", "desc"),
    limit(limitCount),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => fromFirestore(doc)));
    },
    (err) => {
      options?.onError?.(err);
    },
  );
}
