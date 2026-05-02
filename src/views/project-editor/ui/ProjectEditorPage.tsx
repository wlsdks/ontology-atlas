"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CopyPlus, FileText } from "lucide-react";
import { ProjectForm } from "@/features/project-edit";
import { useProjectMutations } from "@/features/project-data-source";
import {
  getProjectDetailHref,
  getProject,
  subscribeProjects,
  type Project,
  type ProjectInput,
} from "@/entities/project";
import {
  getKnowledgeDocumentListHref,
  getKnowledgeDocumentNewHref,
} from "@/entities/knowledge-document";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useToast } from "@/shared/ui";

interface Props {
  mode: "create" | "edit";
  slug?: string;
  duplicateFromSlug?: string;
  initialCategoryId?: string;
  initialStatusId?: string;
  returnTo?: string;
  accountId?: string | null;
  savedNotice?: boolean;
}

const DEFAULT_RETURN_TO = "/projects/";

function normalizeReturnTo(returnTo?: string): string {
  if (!returnTo) return DEFAULT_RETURN_TO;
  if (
    !returnTo.startsWith("/projects") &&
    !returnTo.startsWith("/project/") &&
    !returnTo.startsWith("/settings/")
  ) {
    return DEFAULT_RETURN_TO;
  }
  return returnTo;
}

function resolveReturnLabel(returnTo: string): string {
  if (returnTo.startsWith("/project/")) return "프로젝트 상세로";
  if (returnTo.startsWith("/projects")) return "프로젝트 목록으로";
  if (returnTo.startsWith("/settings/categories")) return "카테고리 관리로";
  if (returnTo.startsWith("/settings/statuses")) return "상태 관리로";
  return "프로젝트 목록으로";
}

function EditorContent({
  mode,
  slug,
  duplicateFromSlug,
  initialCategoryId,
  initialStatusId,
  returnTo,
  accountId,
  savedNotice,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const projectMutations = useProjectMutations();
  const targetSlug = mode === "edit" ? slug : duplicateFromSlug;
  useDocumentTitle(
    (mode === "edit" ? "프로젝트 편집 · oh-my-ontology" : "새 프로젝트 · oh-my-ontology"),
  );
  const safeReturnTo = normalizeReturnTo(returnTo);
  const safeReturnLabel = resolveReturnLabel(normalizeReturnTo(returnTo));
  const publicProjectHref = slug ? getProjectDetailHref(slug, accountId) : null;
  const projectDocumentsHref = slug
    ? getKnowledgeDocumentListHref(accountId, {
        projectId: slug,
        returnTo: publicProjectHref ?? safeReturnTo,
      })
    : null;
  const projectNewDocumentHref = slug
    ? getKnowledgeDocumentNewHref(accountId, {
        projectId: slug,
        returnTo: publicProjectHref ?? safeReturnTo,
      })
    : null;
  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(targetSlug));
  const [loadError, setLoadError] = useState<string | null>(null);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("저장하지 않은 변경사항이 있습니다. 정말 나갈까요?");
  }, [isDirty]);

  useEffect(() => {
    const unsubscribe = subscribeProjects(accountId, (latest) => setAllProjects(latest));
    return () => unsubscribe();
  }, [accountId]);

  useEffect(() => {
    if (!targetSlug) return;

    let cancelled = false;
    getProject(targetSlug, accountId)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setLoadError(
            mode === "edit"
              ? "프로젝트를 찾을 수 없습니다."
              : "복제할 프로젝트를 찾을 수 없습니다.",
          );
        } else {
          setProject(p);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, duplicateFromSlug, mode, slug, targetSlug]);

  const buildEditHref = (nextSlug: string) =>
    `/project/${encodeURIComponent(nextSlug)}/edit/?returnTo=${encodeURIComponent(safeReturnTo)}&saved=1`;

  const handleSubmit = async (
    input: ProjectInput,
    options: { behavior: "stay" | "return" },
  ) => {
    const payload: ProjectInput = { ...input, accountId: accountId ?? undefined };
    if (mode === "create") {
      await projectMutations.createProject(payload);
      if (options.behavior === "stay") {
        toast.show(`"${input.name}" 생성 · 편집 화면에서 세부 정보 채우기`, "success");
        router.replace(buildEditHref(input.slug));
        return;
      }
    } else {
      await projectMutations.updateProject(payload);
      if (options.behavior === "stay") {
        toast.show(`"${input.name}" 저장 완료`, "success");
        return;
      }
    }
    router.push(safeReturnTo);
  };

  const handleDelete = async () => {
    if (!slug) return;
    await projectMutations.deleteProject(slug);
    toast.show("프로젝트 삭제", "success");
    router.push(safeReturnTo);
  };

  const handleCancel = () => {
    if (!confirmDiscardChanges()) return;
    router.push(safeReturnTo);
  };

  const handleNavigateWithGuard = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!confirmDiscardChanges()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    router.push(href);
  };

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
          불러오는 중…
        </p>
      </div>
    );
  }

  if (mode === "edit" && !slug) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-md text-center"
        >
          <p className="text-sm text-[color:var(--color-status-danger)]">
            프로젝트 slug가 필요합니다.
          </p>
          <Link
            href={safeReturnTo}
            className="mt-4 inline-block text-xs text-[color:var(--color-indigo-accent)] underline"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-md text-center"
        >
          <p className="text-sm text-[color:var(--color-status-danger)]">
            {loadError}
          </p>
          <Link
            href={safeReturnTo}
            className="mt-4 inline-block text-xs text-[color:var(--color-indigo-accent)] underline"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)] px-4 py-8 md:px-12 md:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href={safeReturnTo}
          data-testid="admin-project-back-link"
          onClick={(event) => handleNavigateWithGuard(event, safeReturnTo)}
          className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          {safeReturnLabel}
        </Link>

        <header className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
            {mode === "create"
              ? duplicateFromSlug
                ? "복제해서 만들기"
                : "새 프로젝트 만들기"
              : "프로젝트 편집"}
          </p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
              {mode === "create"
                ? duplicateFromSlug
                  ? `복제본 만들기 · ${project?.name ?? duplicateFromSlug}`
                  : "새 프로젝트"
                : project?.name}
            </h1>
            <p className="max-w-xl text-sm text-[color:var(--color-text-tertiary)] md:text-right">
              메타데이터, 연결 관계, 스크린샷과 상세 설명을 한 번에 정리하는 편집 화면입니다.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--color-text-quaternary)]">
            {isDirty && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:rgba(244,183,49,0.45)] bg-[color:rgba(244,183,49,0.12)] px-3 py-1 text-[color:var(--color-status-warning)]"
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-status-warning)]"
                />
                저장 안 됨
              </span>
            )}
            <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
              돌아갈 위치 유지
            </span>
            <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
              저장하고 계속 보기 가능
            </span>
            {mode === "edit" && (
              <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
                현재 프로젝트 수정 중
              </span>
            )}
          </div>
          <div className="mt-4 flex justify-start">
            <div className="flex flex-wrap gap-2">
              {mode === "edit" && slug && publicProjectHref && (
                <Link
                  href={publicProjectHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="공개 화면을 새 탭에서 보기"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.12)]"
                >
                  <ArrowUpRight size={14} />
                  공개 화면 보기
                </Link>
              )}
              {mode === "edit" && slug && projectDocumentsHref && (
                <Link
                  href={projectDocumentsHref}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]"
                >
                  <FileText size={14} />
                  문서 목록
                </Link>
              )}
              {mode === "edit" && slug && projectNewDocumentHref && (
                <Link
                  href={projectNewDocumentHref}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]"
                >
                  <CopyPlus size={14} />
                  문서 등록
                </Link>
              )}
              {mode === "edit" && slug && (
                <Link
                  href={`/project/new/?from=${encodeURIComponent(
                    slug,
                  )}&returnTo=${encodeURIComponent(safeReturnTo)}`}
                  data-testid="admin-project-duplicate"
                  onClick={(event) =>
                    handleNavigateWithGuard(
                      event,
                      `/project/new/?from=${encodeURIComponent(
                        slug,
                      )}&returnTo=${encodeURIComponent(safeReturnTo)}`,
                    )
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]"
                >
                  <CopyPlus size={14} />
                  복제
                </Link>
              )}
            </div>
          </div>
        </header>

        {savedNotice && mode === "edit" ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.1)] px-5 py-4 text-sm text-[color:var(--color-indigo-accent)]"
          >
            방금 저장했습니다. 이 화면에서 계속 다듬거나 공개 화면 보기로 바로 결과를 확인할 수 있습니다.
          </div>
        ) : null}

        {mode === "create" && (
          <section className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                가장 쉬운 시작
              </p>
              <h2 className="mt-2 text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                이름, 카테고리, 상태, 짧은 설명만 채우고 먼저 저장하세요.
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                저장 후 다시 열어 연결 관계, 스크린샷, 운영 정보까지 천천히 보강할 수 있습니다.
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                처음 쓰는 운영자용
              </p>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                <li>1. 이름을 입력하면 slug는 자동으로 맞춰집니다.</li>
                <li>2. 짧은 설명 한 줄만 있어도 공개 카드와 드로어가 채워집니다.</li>
                <li>3. 상세 항목은 아래에서 펼쳐서 필요한 만큼만 입력하면 됩니다.</li>
              </ol>
            </div>
          </section>
        )}

        <section className="mt-10">
          {mode === "edit" && slug && (
            <div className="mb-6 rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                공개 화면과 함께 작업
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                편집 중에도 공개 상세와 연결 문서를 열어 실제 노출 상태를 바로 확인할 수 있습니다. 변경 후 저장하고 다시 열면 공개 화면에 즉시 반영됩니다.
              </p>
            </div>
          )}
          <ProjectForm
            mode={mode}
            initialProject={project ?? undefined}
            initialCategoryId={
              duplicateFromSlug ? undefined : initialCategoryId
            }
            initialStatusId={
              duplicateFromSlug ? undefined : initialStatusId
            }
            allProjects={allProjects}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDelete={mode === "edit" ? handleDelete : undefined}
            onDirtyChange={setIsDirty}
          />
        </section>
      </div>
    </main>
  );
}

export function ProjectEditorPage(props: Props) {
  // local-first 헌장: 진입 자체는 차단하지 않음. local 모드 사용자는 vault 에
  // 직접 쓸 수 있고, cloud 모드 mutation 은 useProjectMutations 안에서 모드
  // 분기 + 거절 처리. (이전에는 PermissionGate 가 비로그인 통째 차단했다.)
  return (
    <EditorContent
      key={`${props.slug ?? `new-${props.mode}`}:${props.duplicateFromSlug ?? ""}`}
      {...props}
    />
  );
}
