import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { getDemoWorkspaceProjects } from "@/shared/mocks/demo-data";
import { fromFirestoreWorkspaceProject } from "../model/mapper";
import type { WorkspaceProject, WorkspaceProjectInput } from "../model/types";

/**
 * workspace-project 컨테이너 Firestore CRUD.
 *
 * 경로: `accounts/{accountId}/workspaceProjects/{projectId}`
 *
 * 기존 flat `accounts/{accountId}/projects` 와 병존 (Phase 2). 마이그레이션
 * 완료 (Phase 5) 후에는 이 경로만 남고 flat 은 제거 예정.
 *
 * 데모 세션은 no-op 폴백 (빈 배열 등). 실제 Firestore 쓰기는 admin/member
 * 권한이 있는 유저에 한해 security rules 가 검증.
 */

const COLLECTION = "workspaceProjects";

function containerCollection(accountId: string) {
  return collection(getDb(), "accounts", accountId, COLLECTION);
}

function containerDoc(accountId: string, projectId: string) {
  return doc(getDb(), "accounts", accountId, COLLECTION, projectId);
}

/**
 * 한 워크스페이스의 모든 프로젝트 컨테이너 (1회성).
 */
export async function listWorkspaceProjects(
  accountId: string | null | undefined,
): Promise<WorkspaceProject[]> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) return [];
  if (hasDemoSession()) return getDemoWorkspaceProjects(normalized);
  const snapshot = await getDocs(
    query(containerCollection(normalized), orderBy("order", "asc")),
  );
  return snapshot.docs.map((d) => fromFirestoreWorkspaceProject(d.id, d.data()));
}

/**
 * 단건 조회.
 */
export async function getWorkspaceProject(
  accountId: string | null | undefined,
  projectId: string,
): Promise<WorkspaceProject | null> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || !projectId || hasDemoSession()) return null;
  const snapshot = await getDoc(containerDoc(normalized, projectId));
  if (!snapshot.exists()) return null;
  return fromFirestoreWorkspaceProject(snapshot.id, snapshot.data());
}

/**
 * 생성 또는 전체 덮어쓰기. input.id 미지정 시 "general" 기본값.
 */
export async function upsertWorkspaceProject(
  accountId: string,
  input: WorkspaceProjectInput,
): Promise<void> {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return;
  if (hasDemoSession()) return;

  const projectId = input.id?.trim() || "general";
  const ref = containerDoc(normalizedAccountId, projectId);
  const existing = await getDoc(ref);
  const payload: DocumentData = {
    accountId: normalizedAccountId,
    name: input.name,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  if (input.description !== undefined) payload.description = input.description;
  if (input.isPublic !== undefined) payload.isPublic = input.isPublic;
  if (input.order !== undefined) payload.order = input.order;
  if (input.metadata !== undefined) payload.metadata = input.metadata;

  await setDoc(ref, payload, { merge: true });
}

/**
 * 한 컨테이너의 hubs/nodes 건수를 한 번에 조회. Phase 5 이관 직후 UI 검증용.
 * 읽기 실패 (rules 미배포 등) 는 조용히 0/0 반환해 검증 UI 가 깨지지 않게 한다.
 */
export async function countContainerHubsAndNodes(
  accountId: string | null | undefined,
  projectId: string = "general",
): Promise<{ hubs: number; nodes: number } | null> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized || !projectId || hasDemoSession()) return null;
  try {
    const db = getDb();
    const hubsColl = collection(
      db,
      "accounts",
      normalized,
      "workspaceProjects",
      projectId,
      "hubs",
    );
    const nodesColl = collection(
      db,
      "accounts",
      normalized,
      "workspaceProjects",
      projectId,
      "nodes",
    );
    const [hubsSnap, nodesSnap] = await Promise.all([
      getDocs(hubsColl),
      getDocs(nodesColl),
    ]);
    return { hubs: hubsSnap.size, nodes: nodesSnap.size };
  } catch {
    return null;
  }
}

/**
 * 로그인 직후 "기본 프로젝트 컨테이너" 가 존재하도록 보장한다. 없으면
 * `accounts/{uid}/workspaceProjects/general` 을 생성. 있으면 no-op.
 *
 * `ensureOwnWorkspace` 가 accounts/{uid} + membership 을 먼저 보장한 뒤에
 * 호출돼야 Firestore rules 의 `isAccountMember(accountId)` 검증을 통과한다.
 * 실패는 로그인 플로우를 깨지 않도록 콘솔 경고만 (fire-and-forget 후단).
 */
export async function ensureDefaultWorkspaceProject(
  accountId: string | null | undefined,
): Promise<void> {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) return;
  if (hasDemoSession()) return;

  try {
    const ref = containerDoc(normalized, "general");
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    await setDoc(
      ref,
      {
        accountId: normalized,
        name: "General",
        description: "기본 프로젝트 컨테이너",
        order: 0,
        isPublic: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[workspace-project] ensureDefaultWorkspaceProject failed:", err);
    }
  }
}

/**
 * 실시간 구독. snapshot 이 올 때마다 callback.
 */
export function subscribeWorkspaceProjects(
  accountId: string | null | undefined,
  callback: (projects: WorkspaceProject[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) {
    Promise.resolve().then(() => callback([]));
    return () => {};
  }
  if (hasDemoSession()) {
    const containers = getDemoWorkspaceProjects(normalized);
    Promise.resolve().then(() => callback(containers));
    return () => {};
  }
  const q = query(containerCollection(normalized), orderBy("order", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => fromFirestoreWorkspaceProject(d.id, d.data())),
      );
    },
    (err) => {
      onError?.(err);
    },
  );
}
