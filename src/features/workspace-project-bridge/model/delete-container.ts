import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { getDb } from "@/shared/api";
import {
  normalizeAccountId,
  readRuntimeWorkspaceProjectId,
} from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import {
  deleteProject,
  deleteProjects,
  findProjectsReferencingSlug,
  findBulkDeleteBlockingReferences,
} from "@/entities/project";
import { listProjectsForContainer } from "./get-container";

/**
 * 컨테이너 안 단건 삭제. hubs/{slug} 가 있으면 거기서, 없으면 nodes/{slug}.
 * 다른 노드가 의존 중이면 throw (flat deleteProject 와 동일 룰).
 */
export async function deleteProjectFromContainer(
  accountId: string | null | undefined,
  projectId: string,
  slug: string,
): Promise<void> {
  const normalizedAccount = normalizeAccountId(accountId);
  if (!normalizedAccount) {
    throw new Error("accountId 가 필요합니다.");
  }
  if (hasDemoSession()) {
    throw new Error("데모 세션에서는 컨테이너 삭제를 할 수 없습니다.");
  }
  if (!projectId?.trim() || !slug?.trim()) {
    throw new Error("projectId, slug 가 필요합니다.");
  }

  // reference check — 컨테이너 안에서 이 slug 를 의존 중인 다른 entry.
  const all = await listProjectsForContainer(normalizedAccount, projectId);
  const referencedBy = findProjectsReferencingSlug(all, slug);
  if (referencedBy.length > 0) {
    const names = referencedBy.map((p) => p.name).join(", ");
    throw new Error(`다른 프로젝트가 이 프로젝트를 의존 중입니다: ${names}`);
  }

  const db = getDb();
  const hubRef = doc(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    projectId,
    "hubs",
    slug,
  );
  const hubSnap = await getDoc(hubRef);
  if (hubSnap.exists()) {
    await deleteDoc(hubRef);
    return;
  }
  const nodeRef = doc(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    projectId,
    "nodes",
    slug,
  );
  const nodeSnap = await getDoc(nodeRef);
  if (nodeSnap.exists()) {
    await deleteDoc(nodeRef);
    return;
  }
  // 둘 다 없음 — 멱등 처리, throw 안 함.
}

/**
 * 컨테이너 컨텍스트 결정 helper. flat 강제(`null` 명시) 외엔 runtime URL 의
 * `?pj=` 를 자동 상속.
 */
function resolveContainerProjectId(
  options?: { workspaceProjectId?: string | null },
): string | null {
  const explicit = options?.workspaceProjectId;
  if (explicit === null) return null;
  return explicit?.trim() || readRuntimeWorkspaceProjectId();
}

/**
 * 단건 삭제 어댑터. 컨테이너 컨텍스트면 deleteProjectFromContainer, 아니면
 * 기존 flat deleteProject.
 */
export async function deleteProjectAdaptive(
  slug: string,
  options?: { accountId?: string | null; workspaceProjectId?: string | null },
): Promise<void> {
  const projectId = resolveContainerProjectId(options);
  if (projectId) {
    await deleteProjectFromContainer(options?.accountId, projectId, slug);
    return;
  }
  await deleteProject(slug, options?.accountId);
}

/**
 * bulk 삭제 어댑터. 컨테이너에선 일괄 reference check 후 순차 삭제.
 * flat 에선 기존 deleteProjects 위임 (활동 로그/일괄 룰 그대로).
 */
export async function deleteProjectsAdaptive(
  slugs: string[],
  options?: { accountId?: string | null; workspaceProjectId?: string | null },
): Promise<void> {
  const projectId = resolveContainerProjectId(options);
  if (!projectId) {
    await deleteProjects(slugs, options?.accountId);
    return;
  }

  const targetSlugs = [
    ...new Set(slugs.map((s) => s.trim()).filter(Boolean)),
  ];
  if (targetSlugs.length === 0) return;

  const accountId = normalizeAccountId(options?.accountId);
  if (!accountId) {
    throw new Error("accountId 가 필요합니다.");
  }
  if (hasDemoSession()) {
    throw new Error("데모 세션에서는 컨테이너 삭제를 할 수 없습니다.");
  }

  const all = await listProjectsForContainer(accountId, projectId);
  const blocking = findBulkDeleteBlockingReferences(all, targetSlugs);
  if (blocking.length > 0) {
    const detail = blocking
      .map(
        ({ targetSlug, referencedBy }) =>
          `${targetSlug} ← ${referencedBy.map((p) => p.name).join(", ")}`,
      )
      .join(" · ");
    throw new Error(`다른 프로젝트가 선택한 프로젝트를 의존 중입니다: ${detail}`);
  }

  await Promise.all(
    targetSlugs.map((slug) =>
      deleteProjectFromContainer(accountId, projectId, slug),
    ),
  );
}
