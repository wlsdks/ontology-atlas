"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, ArrowUpRight, CopyPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProjectForm } from "@/features/project-edit";
import {
  ProjectStaticModeError,
  useProjects,
  useProjectMutations,
} from "@/features/project-data-source";
import { VaultConflictError } from "@/features/docs-vault-local";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  type Project,
  type ProjectInput,
} from "@/entities/project";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useToast } from "@/shared/ui";

interface Props {
  mode: "create" | "edit";
  slug?: string;
  duplicateFromSlug?: string;
  initialCategoryId?: string;
  initialStatusId?: string;
  returnTo?: string;
  savedNotice?: boolean;
}

const DEFAULT_RETURN_TO = "/projects/";

function normalizeReturnTo(returnTo?: string): string {
  if (!returnTo) return DEFAULT_RETURN_TO;
  if (
    !returnTo.startsWith("/projects") &&
    !returnTo.startsWith("/project/")
  ) {
    return DEFAULT_RETURN_TO;
  }
  return returnTo;
}

type ReturnLabelKey = "returnToProjectDetail" | "returnToProjectsList";

function resolveReturnLabelKey(returnTo: string): ReturnLabelKey {
  if (returnTo.startsWith("/project/")) return "returnToProjectDetail";
  return "returnToProjectsList";
}

function EditorContent({
  mode,
  slug,
  duplicateFromSlug,
  initialCategoryId,
  initialStatusId,
  returnTo,
  savedNotice,
}: Props) {
  const t = useTranslations("projectPages.editor");
  const router = useRouter();
  const toast = useToast();
  const projectMutations = useProjectMutations();
  const targetSlug = mode === "edit" ? slug : duplicateFromSlug;
  useDocumentTitle(
    (mode === "edit" ? t("documentTitleEdit") : t("documentTitleNew")),
  );
  const safeReturnTo = normalizeReturnTo(returnTo);
  const safeReturnLabel = t(resolveReturnLabelKey(normalizeReturnTo(returnTo)));
  const publicProjectHref = slug ? getProjectRuntimeDetailHref(slug) : null;
  const [project, setProject] = useState<Project | null>(null);
  // mode-aware (vault manifest 또는 빌드타임 dogfood) — useProjects 가
  // allProjects 의 단일 source.
  const { projects: allProjects, loaded: projectsLoaded } = useProjects();
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(targetSlug));
  const [loadError, setLoadError] = useState<string | null>(null);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(t("confirmDiscardChanges"));
  }, [isDirty, t]);

  useEffect(() => {
    if (!targetSlug) return;
    // 첫 로드·write 직후 증분 rebuild가 끝나기 전에는 마지막 manifest나
    // static fallback의 불완전한 목록으로 not-found를 확정하지 않는다.
    if (!projectsLoaded) return;

    // useProjects 결과에서 slug 매칭으로 동기 lookup. 매칭 실패 시
    // loadError 로 빈 상세 카드 노출 (slug 가 manifest 에 없는 경우).
    const found = allProjects.find((p) => p.slug === targetSlug);
    if (found) {
      window.queueMicrotask(() => {
        setProject(found);
        // persisted vault rehydrate 직전 static fallback이 먼저 보이면 한 번
        // loadError가 잡힐 수 있다. 실제 local project가 도착하면 회복한다.
        setLoadError(null);
        setLoading(false);
      });
      return;
    }
    if (allProjects.length > 0) {
      window.queueMicrotask(() => {
        setLoadError(mode === "edit" ? t("loadErrorEdit") : t("loadErrorDuplicate"));
        setLoading(false);
      });
    }
  }, [targetSlug, allProjects, mode, projectsLoaded, t]);

  const buildEditHref = (nextSlug: string) =>
    getProjectEditHref(nextSlug, {
      returnTo: safeReturnTo,
      savedNotice: true,
    });

  const handleSubmit = async (
    input: ProjectInput,
    options: { behavior: "stay" | "return" },
  ) => {
    try {
      if (mode === "create") {
        await projectMutations.createProject(input);
        if (options.behavior === "stay") {
          toast.show(t("createdAndOpenToast", { name: input.name }), "success");
          router.replace(buildEditHref(input.slug));
          return;
        }
      } else {
        await projectMutations.updateProject(input);
        if (options.behavior === "stay") {
          toast.show(t("savedToast", { name: input.name }), "success");
          return;
        }
      }
      router.push(safeReturnTo);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        throw new Error(t("vaultConflict"));
      }
      // [P-3] 방어 경로 — writeDisabled 가 제출 버튼을 이미 막아두지만,
      // 혹시 도달하면 영어 raw 메시지 대신 ko/en 안내로 치환.
      if (err instanceof ProjectStaticModeError) {
        throw new Error(t("demoModeSaveFailed"));
      }
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!slug) return;
    await projectMutations.deleteProject(slug);
    toast.show(t("deleteToast"), "success");
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
      <div className="flex min-h-full items-center justify-center">
        <p className="font-mono text-body uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
          {t("loadingLabel")}
        </p>
      </div>
    );
  }

  if (mode === "edit" && !slug) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-md text-center"
        >
          <p className="text-body-lg text-[color:var(--color-status-danger)]">
            {t("missingSlug")}
          </p>
          <Link
            href={safeReturnTo}
            className="mt-4 inline-block text-body text-[color:var(--color-indigo-accent)] underline"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div
          role="alert"
          aria-live="assertive"
          className="max-w-md text-center"
        >
          <p className="text-body-lg text-[color:var(--color-status-danger)]">
            {loadError}
          </p>
          <Link
            href={safeReturnTo}
            className="mt-4 inline-block text-body text-[color:var(--color-indigo-accent)] underline"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    // 페이지 루트는 `min-h-full` 로 셸 본문 슬롯을 채우기만 한다. 스크롤 끝에서
    // 하단 예약고가 살아 있게 하는 압축 금지 계약은 **셸이 소유**한다
    // (`AppShell` 본문 슬롯의 `[&>*]:shrink-0`) — 예전엔 이 자리에 `shrink-0` 을
    // 손으로 박았는데, 페이지가 기억해야 하는 구조는 다음 화면에서 또 빠진다
    // (실제로 형제 라우트 4곳에 같은 결함이 살아 있었다).
    <div className="flex min-h-full w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      {/* 하단 예약고는 base pb + lg:pb — `max-lg:pb-[...]` 는 `md:py-10` 보다
          스타일시트 앞에 emit 되어 768–1023 에서 조용히 패배한다 (빌더 main 과
          동일 처방, 겹침 소탕 2026-07-23). */}
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] px-4 pt-8 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-12 md:pt-10 lg:pb-10">
      {/* 960 — RATIO-SYSTEM.md 유틸리티 컬럼. ProjectForm 의 640 폼 컬럼 +
          260 미리보기 컬럼 + gap 이 여유 있게 들어간다. */}
      <div className="mx-auto max-w-[960px]">
        <Link
          href={safeReturnTo}
          data-testid="project-editor-back-link"
          onClick={(event) => handleNavigateWithGuard(event, safeReturnTo)}
          className="inline-flex items-center gap-1.5 break-keep text-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          {safeReturnLabel}
        </Link>

        {/* 머리말은 한 번만 말한다. 예전에는 eyebrow("새 프로젝트 만들기") 가
            바로 아래 h1("새 프로젝트") 를 반복했고, 그 옆 칩 두 개
            ("돌아갈 위치 유지" · "저장하고 계속 보기 가능") 는 시스템 사정이지
            사용자 관심사가 아니었다. 만들기 화면에서는 eyebrow 를 지우고
            부제 한 줄이 "무엇을 채우면 되는지" 를 말한다 — 그 문장이 바로
            아래 필수 칸 4개를 가리키므로 안내가 한 자리에 모인다. */}
        <header className={mode === "create" ? "mt-6" : "mt-8"}>
          {mode === "edit" && (
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrowEdit")}
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-hero">
              {mode === "create"
                ? duplicateFromSlug
                  ? t("titleDuplicate", { name: project?.name ?? duplicateFromSlug })
                  : t("titleNew")
                : project?.name}
            </h1>
            {isDirty && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-[color:var(--color-amber-source-a45)] bg-[color:var(--color-amber-source-a12)] px-3 py-1 text-label text-[color:var(--color-status-warning)]"
              >
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]"
                />
                {t("dirtyBadge")}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-body-lg leading-6 text-[color:var(--color-text-tertiary)]">
            {mode === "create" ? t("headerSubtitleCreate") : t("headerSubtitle")}
          </p>
          <div className={mode === "edit" ? "mt-4 flex justify-start" : "hidden"}>
            <div className="flex flex-wrap gap-2">
              {mode === "edit" && slug && publicProjectHref && (
                <Link
                  href={publicProjectHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("openPublicAria")}
                  className="inline-flex h-9 items-center gap-2 rounded-chip border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a08)] px-3 text-body-lg text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a12)]"
                >
                  <ArrowUpRight size={14} />
                  {t("openPublicLabel")}
                </Link>
              )}
              {mode === "edit" && slug && (
                <Link
                  href={`/project/new/?from=${encodeURIComponent(
                    slug,
                  )}&returnTo=${encodeURIComponent(safeReturnTo)}`}
                  data-testid="project-editor-duplicate"
                  onClick={(event) =>
                    handleNavigateWithGuard(
                      event,
                      `/project/new/?from=${encodeURIComponent(
                        slug,
                      )}&returnTo=${encodeURIComponent(safeReturnTo)}`,
                    )
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-chip border border-[color:var(--color-divider)] px-3 text-body-lg text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]"
                >
                  <CopyPlus size={14} />
                  {t("duplicateLabel")}
                </Link>
              )}
            </div>
          </div>
        </header>

        {savedNotice && mode === "edit" ? (
          <div
            role="status"
            className="mt-6 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] px-5 py-4 text-body-lg text-[color:var(--color-indigo-text-soft)]"
          >
            {t("savedNotice")}
          </div>
        ) : null}

        {/* 2026-07-27 — 만들기 화면의 가르치는 표면 4개 중 2개(이 자리에 있던
            "가장 쉬운 시작" 카드 + "처음 쓰는 운영자용" 3단계 카드)를 걷어냈다.
            네 표면이 같은 말("이름·분류·상태·설명만 채우고 먼저 저장하라")을
            네 번 반복했고, 그 높이가 정작 그 4칸을 화면 밖으로 밀어냈다.
            안내가 부족했던 게 아니라 폼이 스스로 안 쉬웠던 것이다. 남은 한
            자리는 위 부제 한 줄이고, 나머지는 필드 옆에서 말한다. */}

        <section className={mode === "create" ? "mt-6" : "mt-10"}>
          {mode === "edit" && slug && (
            <div className="mb-6 rounded-panel border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-indigo-a06)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                {t("publicCompanionEyebrow")}
              </p>
              <p className="mt-2 text-body-lg leading-6 text-[color:var(--color-text-secondary)]">
                {t("publicCompanionDesc")}
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
            writeDisabled={mode === "create" && !projectMutations.canCreate}
          />
        </section>
      </div>
      </main>
    </div>
  );
}

export function ProjectEditorPage(props: Props) {
  // local-first 헌장: 진입 자체는 차단하지 않음. local 모드는 vault 에
  // 직접 쓰고, static 모드는 useProjectMutations 안에서 mutation 거절.
  return (
    <EditorContent
      key={`${props.slug ?? `new-${props.mode}`}:${props.duplicateFromSlug ?? ""}`}
      {...props}
    />
  );
}
