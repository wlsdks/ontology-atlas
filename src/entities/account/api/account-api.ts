import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDb } from "@/shared/api";
import {
  fromFirestoreAccount,
  fromFirestoreAccountMembership,
  type Account,
  type AccountMembership,
} from "@/entities/account/model";
import { hasDemoSession } from '@/shared/lib/demo-session';
import {
  getDemoAccount,
  getDemoMembershipsByEmail,
  getDemoMembershipsByUid,
  getDemoPublicAccounts,
} from "@/shared/mocks/demo-data";

const ACCOUNTS_COLLECTION = "accounts";
const MEMBERSHIPS_COLLECTION = "accountMemberships";

function accountsCollection() {
  return collection(getDb(), ACCOUNTS_COLLECTION);
}

function membershipsCollection() {
  return collection(getDb(), MEMBERSHIPS_COLLECTION);
}

export async function listPublicAccounts(): Promise<Account[]> {
  if (hasDemoSession()) {
    return getDemoPublicAccounts();
  }

  const snapshot = await getDocs(
    query(accountsCollection(), where("isPublic", "==", true)),
  );

  return snapshot.docs.map((entry) =>
    fromFirestoreAccount(entry.id, entry.data()),
  );
}

export async function listAccountMembershipsByUid(
  uid: string,
): Promise<AccountMembership[]> {
  if (!uid) return [];

  if (hasDemoSession()) {
    return getDemoMembershipsByUid(uid);
  }

  const snapshot = await getDocs(
    query(membershipsCollection(), where("uid", "==", uid)),
  );

  return snapshot.docs.map((entry) =>
    fromFirestoreAccountMembership(entry.id, entry.data()),
  );
}

export async function listAccountMembershipsByEmail(
  email: string,
): Promise<AccountMembership[]> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [];

  if (hasDemoSession()) {
    return getDemoMembershipsByEmail(normalizedEmail);
  }

  const snapshot = await getDocs(
    query(membershipsCollection(), where("email", "==", normalizedEmail)),
  );

  return snapshot.docs.map((entry) =>
    fromFirestoreAccountMembership(entry.id, entry.data()),
  );
}

/**
 * 로그인된 사용자의 "내 공간" 을 보장한다. `accounts/{uid}` 문서와
 * `accountMemberships/{uid}__{uid}` (role=owner) 문서가 없으면 생성, 있으면
 * no-op 성격으로 merge. signup/signin 성공 직후 fire-and-forget 으로 호출해
 * 유저가 즉시 자기 공간의 owner 가 되도록 한다.
 *
 * Firestore rules 에서 `request.auth.uid == accountId` 및 membership ID
 * 매칭을 검증하므로 클라이언트 직접 쓰기로 충분 (Cloud Function 불필요).
 */
export async function ensureOwnWorkspace(input: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<void> {
  const uid = input.uid?.trim();
  if (!uid) return;
  if (hasDemoSession()) return;

  const db = getDb();
  const accountRef = doc(db, ACCOUNTS_COLLECTION, uid);
  const membershipId = `${uid}__${uid}`;
  const membershipRef = doc(db, MEMBERSHIPS_COLLECTION, membershipId);
  const emailNormalized = input.email?.trim().toLowerCase() || null;
  const displayName = input.displayName?.trim() || emailNormalized || uid;

  try {
    await setDoc(
      accountRef,
      {
        id: uid,
        name: displayName,
        ownerUid: uid,
        ownerEmail: emailNormalized,
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await setDoc(
      membershipRef,
      {
        id: membershipId,
        accountId: uid,
        uid,
        email: emailNormalized,
        role: "owner",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    // 실패는 메인 로그인 플로우를 깨지 않도록 콘솔 경고만.
    // rules 미배포 단계에선 실패할 수 있음 → 배포 후 재로그인 시 복구.
    if (typeof console !== "undefined") {
      console.warn("[account] ensureOwnWorkspace failed:", err);
    }
  }
}

export async function getAccount(accountId: string): Promise<Account | null> {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) return null;

  if (hasDemoSession()) {
    return getDemoAccount(normalizedAccountId);
  }

  const snapshot = await getDoc(doc(getDb(), ACCOUNTS_COLLECTION, normalizedAccountId));
  if (!snapshot.exists()) return null;
  return fromFirestoreAccount(snapshot.id, snapshot.data());
}
