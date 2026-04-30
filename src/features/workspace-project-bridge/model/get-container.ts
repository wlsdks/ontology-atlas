import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getDb } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { getDemoProjectsForContainer } from "@/shared/mocks/demo-data";
import { fromFirestore, type Project } from "@/entities/project";

/**
 * 컨테이너 안의 단건 조회. slug 가 hub 인지 node 인지 미리 알 수 없으므로
 * hubs/{slug} 를 먼저 시도하고 없으면 nodes/{slug} 로 폴백한다.
 *
 * 마이그레이션 시 isHub 플래그가 그대로 보존돼 fromFirestore 가 정확한
 * Project 로 복원. 둘 다 없으면 null.
 */
export async function getProjectFromContainer(
  accountId: string | null | undefined,
  projectId: string | null | undefined,
  slug: string,
): Promise<Project | null> {
  const normalizedAccount = normalizeAccountId(accountId);
  const normalizedProject = projectId?.trim() || "general";
  if (!normalizedAccount || !slug) return null;
  if (hasDemoSession()) {
    const projects = getDemoProjectsForContainer(normalizedAccount, normalizedProject);
    return projects.find((p) => p.slug === slug) ?? null;
  }

  const db = getDb();
  const hubRef = doc(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "hubs",
    slug,
  );
  const hubSnap = await getDoc(hubRef);
  if (hubSnap.exists()) return fromFirestore(slug, hubSnap.data());

  const nodeRef = doc(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "nodes",
    slug,
  );
  const nodeSnap = await getDoc(nodeRef);
  if (nodeSnap.exists()) return fromFirestore(slug, nodeSnap.data());

  return null;
}

/**
 * 컨테이너 안 hubs+nodes 전체를 1회성으로 합쳐 반환. subscribe 가 아닌
 * fetch-once 가 필요한 호출처용 (예: SSR 친화 first paint, related list).
 */
export async function listProjectsForContainer(
  accountId: string | null | undefined,
  projectId: string | null | undefined,
): Promise<Project[]> {
  const normalizedAccount = normalizeAccountId(accountId);
  const normalizedProject = projectId?.trim() || "general";
  if (!normalizedAccount) return [];
  if (hasDemoSession()) {
    return getDemoProjectsForContainer(normalizedAccount, normalizedProject);
  }

  const db = getDb();
  const hubsColl = collection(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "hubs",
  );
  const nodesColl = collection(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "nodes",
  );

  const [hubsSnap, nodesSnap] = await Promise.all([
    getDocs(hubsColl),
    getDocs(nodesColl),
  ]);
  return [
    ...hubsSnap.docs.map((d) => fromFirestore(d.id, d.data())),
    ...nodesSnap.docs.map((d) => fromFirestore(d.id, d.data())),
  ];
}
