"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, ArrowUpRight, CopyPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProjectForm } from "@/features/project-edit";
import { useProjects, useProjectMutations } from "@/features/project-data-source";
import { VaultConflictError } from "@/features/docs-vault-local";
import {
  getProjectDetailHref,
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
  const publicProjectHref = slug ? getProjectDetailHref(slug) : null;
  const [project, setProject] = useState<Project | null>(null);
  // mode-aware (vault manifest 또는 빌드타임 dogfood) — useProjects 가
  // allProjects 의 단일 source.
  const { projects: allProjects } = useProjects();
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(targetSlug));
  const [loadError, setLoadError] = useState<string | null>(null);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(t("confirmDiscardChanges"));
  }, [isDirty, t]);

  useEffect(() => {
    if (!targetSlug) return;

    // useProjects 결과에서 slug 매칭으로 동기 lookup. 매칭 실패 시
    // loadError 로 빈 상세 카드 노출 (slug 가 manifest 에 없는 경우).
    const found = allProjects.find((p) => p.slug === targetSlug);
    if (found) {
      window.queueMicrotask(() => {
        setProject(found);
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
  }, [targetSlug, allProjects, mode, t]);

  const buildEditHref = (nextSlug: string) =>
    `/project/${encodeURIComponent(nextSlug)}/edit/?returnTo=${encodeURIComponent(safeReturnTo)}&saved=1`;

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
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-[color:var(--color-text-quaternary)]">
          {t("loadingLabel")}
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
            {t("missingSlug")}
          </p>
          <Link
            href={safeReturnTo}
            className="mt-4 inline-block text-xs text-[color:var(--color-indigo-accent)] underline"
          >
            {t("backToDashboard")}
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
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main id="main" className="min-h-screen bg-[color:var(--color-canvas)] px-4 py-8 md:px-12 md:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href={safeReturnTo}
          data-testid="project-editor-back-link"
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
                ? t("eyebrowDuplicate")
                : t("eyebrowCreate")
              : t("eyebrowEdit")}
          </p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
              {mode === "create"
                ? duplicateFromSlug
                  ? t("titleDuplicate", { name: project?.name ?? duplicateFromSlug })
                  : t("titleNew")
                : project?.name}
            </h1>
            <p className="max-w-xl text-sm text-[color:var(--color-text-tertiary)] md:text-right">
              {t("headerSubtitle")}
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
                {t("dirtyBadge")}
              </span>
            )}
            <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
              {t("chipKeepReturn")}
            </span>
            <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
              {t("chipSaveAndContinue")}
            </span>
            {mode === "edit" && (
              <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1">
                {t("chipEditingCurrent")}
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
                  aria-label={t("openPublicAria")}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.12)]"
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
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]"
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
            className="mt-6 rounded-xl border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.1)] px-5 py-4 text-sm text-[color:var(--color-indigo-accent)]"
          >
            {t("savedNotice")}
          </div>
        ) : null}

        {mode === "create" && (
          <section className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                {t("tipEyebrowEasiest")}
              </p>
              <h2 className="mt-2 text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("tipTitleEasiest")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                {t("tipDescEasiest")}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("tipEyebrowFirstTime")}
              </p>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                <li>{t("tipFirstTimeStep1")}</li>
                <li>{t("tipFirstTimeStep2")}</li>
                <li>{t("tipFirstTimeStep3")}</li>
              </ol>
            </div>
          </section>
        )}

        <section className="mt-10">
          {mode === "edit" && slug && (
            <div className="mb-6 rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                {t("publicCompanionEyebrow")}
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
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
          />
        </section>
      </div>
    </main>
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
