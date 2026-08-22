"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { PAGE_FRAME_FORM } from "@/shared/ui/page-frame";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, ArrowUpRight, CopyPlus } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { ProjectForm } from "@/features/project-edit";
import {
  ProjectStaticModeError,
  useProjects,
  useProjectMutations,
} from "@/features/project-data-source";
import { OpenVaultCta, VaultConflictError } from "@/features/docs-vault-local";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  type Project,
  type ProjectInput,
} from "@/entities/project";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { controlClass, useToast } from "@/shared/ui";

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
  // Mode-aware (the vault manifest or the build-time dogfood manifest) — `useProjects` is the single
  // source for `allProjects`.
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
    // On first load, and right after a write before the incremental rebuild finishes, do not settle
    // not-found from the last manifest or an incomplete static fallback list.
    if (!projectsLoaded) return;

    // Synchronous lookup by slug against the `useProjects` result. A miss surfaces an empty detail card
    // via `loadError` (the slug is not in the manifest).
    const found = allProjects.find((p) => p.slug === targetSlug);
    if (found) {
      window.queueMicrotask(() => {
        setProject(found);
        // Just before a persisted vault rehydrates, the static fallback can appear first and trip
        // `loadError` once. It recovers when the real local project arrives.
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
      // A defensive path — `writeDisabled` already blocks the submit button, but if it is reached
      // anyway, show the localized guidance instead of the raw English message.
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
        <p className="font-mono text-body uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
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
            className={controlClass({ shape: "link", tone: "accent", className: "mt-4 underline" })}
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
            className={controlClass({ shape: "link", tone: "accent", className: "mt-4 underline" })}
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    // The page root only fills the shell's body slot with `min-h-full`. The no-compression contract
    // that keeps the bottom reserve alive at the end of the scroll is **owned by the shell**
    // (`[&>*]:shrink-0` on `AppShell`'s body slot) — `shrink-0` used to be hand-applied here, and a
    // structure each page has to remember gets missed on the next screen (it really was missing on four
    // sibling routes).
    <div className="flex min-h-full w-full">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      {/* The bottom reserve is a base `pb` plus `lg:pb` — `max-lg:pb-[...]` is emitted before
          `md:py-10` in the stylesheet and silently loses between 768 and 1023. */}
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] lg:pb-10">
      {/* 960 — the utility column from RATIO-SYSTEM.md. `ProjectForm`'s 640 form column plus the 260
          preview column plus the gap fit with room to spare. */}
      <div className={PAGE_FRAME_FORM}>
        <Link
          href={safeReturnTo}
          data-testid="project-editor-back-link"
          onClick={(event) => handleNavigateWithGuard(event, safeReturnTo)}
          className={controlClass({
            shape: "link",
            size: "lg",
            className:
              "touch-hit-expand gap-1.5 break-keep hover:text-[color:var(--color-text-primary)]",
          })}
        >
          <ArrowLeft size={ICON_SIZE.md} />
          {safeReturnLabel}
        </Link>

        {/* The preamble is said once. The eyebrow ("create a new project") used to repeat the h1
            directly beneath it ("new project"), and the two chips beside it ("your position is kept",
            "you can save and keep looking") were system circumstances rather than user concerns. On the
            create screen the eyebrow is removed and one subtitle line says "what do I fill in" — that
            sentence points at the four required fields right below it, so the guidance sits in one place. */}
        <header className={mode === "create" ? "mt-6" : "mt-8"}>
          {mode === "edit" && (
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
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
          <p className="mt-2 max-w-xl text-body-lg leading-title text-[color:var(--color-text-tertiary)]">
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
                  className={controlClass({ shape: "chip", size: "lg", className: "h-9 gap-2 border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a08)] text-body-lg hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a12)]" })}
                >
                  <ArrowUpRight size={ICON_SIZE.md} />
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
                  className={controlClass({ shape: "chip", size: "lg", className: "h-9 gap-2 border-[color:var(--color-divider)] text-body-lg hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-1)]" })}
                >
                  <CopyPlus size={ICON_SIZE.md} />
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

        {/* 2026-07-27 — two of the create screen's four teaching surfaces (the "easiest start" card that
            was here and the three-step "for a first-time operator" card) were removed. All four repeated
            the same sentence ("fill in name, category, status, and description, and save first"), and
            their height pushed those very four fields off the screen. Guidance was not lacking; the form
            simply was not easy on its own. The one remaining place is the subtitle line above, and the
            rest is said beside the fields. */}

        <section className={mode === "create" ? "mt-6" : "mt-10"}>
          {mode === "edit" && slug && (
            <div className="mb-6 rounded-panel border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-indigo-a06)] px-5 py-4">
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-accent)]">
                {t("publicCompanionEyebrow")}
              </p>
              <p className="mt-2 text-body-lg leading-title text-[color:var(--color-text-secondary)]">
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
            /*
             * Editing states the same fact **in advance**, exactly as creating does.
             *
             * It used to lock only when `mode === "create"`. So on the edit screen the save button was
             * active with no vault, and only on pressing it did *"you cannot save in demo mode"* appear —
             * one screen stating a fact up front while the other stated it after the press.
             *
             * `canEdit` existed all along, with a comment saying it was «for the UI pre-gate», and this
             * form alone was not using it.
             */
            writeDisabled={
              mode === "create" ? !projectMutations.canCreate : !projectMutations.canEdit
            }
            // The banner's «where to» — it opens in place rather than sending them to an address. The
            // old `/` link landed on the gateway (download) on the web and was itself a dead end
            // (measured 2026-08-07).
            openVaultAction={<OpenVaultCta testId="project-write-disabled-open-folder" />}
          />
        </section>
      </div>
      </main>
    </div>
  );
}

export function ProjectEditorPage(props: Props) {
  // The local-first charter: entry itself is never blocked. Local mode writes straight to the vault,
  // and static mode rejects the mutation inside `useProjectMutations`.
  return (
    <EditorContent
      key={`${props.slug ?? `new-${props.mode}`}:${props.duplicateFromSlug ?? ""}`}
      {...props}
    />
  );
}
