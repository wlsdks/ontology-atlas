import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/shared/api";
import {
  normalizeAccountId,
  readRuntimeWorkspaceProjectId,
} from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import {
  getProject,
  toFirestore,
  upsertProject,
  type ProjectInput,
} from "@/entities/project";
import { getProjectFromContainer } from "./get-container";

/**
 * P0-B Phase 6 write 분기 — 컨테이너 컨텍스트(`?pj=...`)에서 inline 편집한
 * project 변경을 `accounts/{accountId}/workspaceProjects/{projectId}/{hubs|nodes}/{slug}`
 * 로 직접 저장한다.
 *
 * 분류 규칙:
 *  - input.isHub === true → hubs/{slug}
 *  - 그 외 → nodes/{slug}
 *
 * 필드: `toFirestore` 결과를 그대로 (project entity 와 동일). createdAt 은
 * 최초 생성 시에만 serverTimestamp, updatedAt 매번 갱신. `merge: true` 라
 * hubIds 등 과거 기록 필드는 유지.
 *
 * 데모 세션 · accountId 누락 · slug 누락은 throw — inline 편집 흐름이라
 * 호출 측이 명시적 에러로 처리해야 한다.
 */
export async function upsertProjectInContainer(args: {
  accountId: string | null | undefined;
  projectId: string;
  input: ProjectInput;
}): Promise<void> {
  const accountId = normalizeAccountId(args.accountId);
  if (!accountId) {
    throw new Error("accountId 가 필요합니다.");
  }
  if (hasDemoSession()) {
    throw new Error("데모 세션에서는 컨테이너 쓰기를 할 수 없습니다.");
  }
  if (!args.projectId?.trim()) {
    throw new Error("projectId 가 필요합니다.");
  }
  if (!args.input.slug?.trim()) {
    throw new Error("slug 가 필요합니다.");
  }

  const isHub = Boolean(args.input.isHub);
  const sub = isHub ? "hubs" : "nodes";
  const ref = doc(
    getDb(),
    "accounts",
    accountId,
    "workspaceProjects",
    args.projectId,
    sub,
    args.input.slug,
  );

  const existing = await getDoc(ref);
  // toFirestore 는 Omit<Project, slug|createdAt|updatedAt> 시그니처지만
  // ProjectInput 도 같은 필드 부분집합 + accountId/slug 추가라 구조적
  // 서브타이핑으로 안전하게 통과. 누락 필드는 toFirestore 안 default 처리.
  const payload = {
    ...toFirestore({
      accountId: normalizeAccountId(args.input.accountId) ?? undefined,
      name: args.input.name,
      nameEn: args.input.nameEn,
      category: args.input.category,
      status: args.input.status,
      description: args.input.description,
      detail: args.input.detail,
      tags: args.input.tags ?? [],
      stack: args.input.stack ?? [],
      links: args.input.links ?? [],
      dependencies: args.input.dependencies ?? [],
      owner: args.input.owner,
      icon: args.input.icon,
      screenshots: args.input.screenshots ?? [],
      timeline: args.input.timeline ?? {},
      progress: args.input.progress,
      isHub,
      position: args.input.position,
    }),
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };

  await setDoc(ref, payload, { merge: true });
}

/**
 * 호출 측이 컨테이너 컨텍스트를 의식하지 않아도 안전한 write 단일 진입점.
 *
 * 결정 우선순위:
 *  1. options.workspaceProjectId 명시값
 *  2. options 가 명시 null 이면 강제 flat (`null`)
 *  3. 그 외엔 현재 URL 의 `?pj=` 자동 상속
 *
 * truthy 결과면 컨테이너 write, 아니면 기존 flat upsertProject. inline
 * 편집 위젯 (ProjectQuickEditPanel · ProjectEditorPage 등) 이
 * 컨테이너 인지 없이도 적절한 위치에 저장하도록 한다.
 */
export async function persistProjectAdaptive(
  input: ProjectInput,
  options?: { workspaceProjectId?: string | null },
): Promise<void> {
  const explicit = options?.workspaceProjectId;
  const projectId =
    explicit === null
      ? null
      : explicit?.trim() || readRuntimeWorkspaceProjectId();
  if (projectId) {
    await upsertProjectInContainer({
      accountId: input.accountId ?? null,
      projectId,
      input,
    });
    return;
  }
  await upsertProject(input);
}

/**
 * 신규 생성 전용 어댑터. 동일 slug 가 이미 있으면 throw — 실수로 덮어쓰지 않게.
 * 컨테이너 컨텍스트 결정은 `persistProjectAdaptive` 와 동일.
 */
export async function createProjectAdaptive(
  input: ProjectInput,
  options?: { workspaceProjectId?: string | null },
): Promise<void> {
  const explicit = options?.workspaceProjectId;
  const projectId =
    explicit === null
      ? null
      : explicit?.trim() || readRuntimeWorkspaceProjectId();

  if (projectId) {
    const existing = await getProjectFromContainer(
      input.accountId ?? null,
      projectId,
      input.slug,
    );
    if (existing) {
      throw new Error("이미 존재하는 slug입니다.");
    }
    await upsertProjectInContainer({
      accountId: input.accountId ?? null,
      projectId,
      input,
    });
    return;
  }

  const existing = await getProject(input.slug, input.accountId);
  if (existing) {
    throw new Error("이미 존재하는 slug입니다.");
  }
  await upsertProject(input);
}
