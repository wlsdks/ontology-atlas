import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui";
import {
  ProjectCard,
  computeHubSlugs,
  isSharedNode,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  type Project,
} from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import {
  createCompleteness,
  previewProjectFromValues,
} from "../model/form-values";
import type { ProjectFormValues } from "../model/schema";

export function ProjectFormPreview({
  mode,
  values,
  savedValues,
  initialProject,
  isDirty,
  saveNotice,
  allProjects,
  categoryOptions,
  statusOptions,
}: {
  mode: "create" | "edit";
  values: ProjectFormValues;
  savedValues: ProjectFormValues;
  initialProject?: Project;
  isDirty: boolean;
  saveNotice: string | null;
  allProjects: Project[];
  categoryOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
}) {
  const t = useTranslations("settings.projectForm");
  const tFreshness = useTranslations("projectFreshness");
  const { getCategory, getStatus } = useTaxonomy();
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const previewProject = useMemo<Project>(
    () => previewProjectFromValues(values, initialProject),
    [values, initialProject],
  );
  const completenessInsight = useMemo(
    () =>
      mode !== "create"
        ? resolveProjectCompletenessInsight(previewProject)
        : createCompleteness(previewProject),
    [mode, previewProject],
  );
  const freshnessInsight = useMemo(
    () => resolveProjectFreshnessInsight(previewProject),
    [previewProject],
  );
  const changePreviewItems = useMemo(() => {
    const items: string[] = [];
    const emptyLabel = t("preview.changeNameEmpty");

    if (values.name !== savedValues.name) {
      items.push(
        t("preview.changeName", {
          from: savedValues.name || emptyLabel,
          to: values.name || emptyLabel,
        }),
      );
    }
    if (values.category !== savedValues.category || values.status !== savedValues.status) {
      const nextCategoryLabel =
        categoryOptions.find((option) => option.value === values.category)?.label ?? values.category;
      const nextStatusLabel =
        statusOptions.find((option) => option.value === values.status)?.label ?? values.status;
      items.push(
        t("preview.changeCategoryStatus", {
          category: nextCategoryLabel,
          status: nextStatusLabel,
        }),
      );
    }
    if (values.description !== savedValues.description) {
      items.push(
        values.description.trim().length > 0
          ? t("preview.changeDescriptionFilled")
          : t("preview.changeDescriptionEmpty"),
      );
    }
    if (values.dependencies.length !== savedValues.dependencies.length) {
      items.push(
        t("preview.changeDependencies", {
          from: savedValues.dependencies.length,
          to: values.dependencies.length,
        }),
      );
    }
    if (values.screenshots.length !== savedValues.screenshots.length) {
      items.push(
        t("preview.changeScreenshots", {
          from: savedValues.screenshots.length,
          to: values.screenshots.length,
        }),
      );
    }
    if (values.detail !== savedValues.detail) {
      items.push(
        (values.detail ?? "").trim().length > 0
          ? t("preview.changeDetailFilled")
          : t("preview.changeDetailEmpty"),
      );
    }

    return items.slice(0, 4);
  }, [categoryOptions, savedValues, statusOptions, t, values]);
  const mobilePreviewSummary = isDirty
    ? t("preview.summaryDirty", { score: completenessInsight.score, count: changePreviewItems.length })
    : t("preview.summaryClean", { score: completenessInsight.score });

  return (
    <aside className="order-none">
      <div className="lg:sticky lg:top-10">
        <button
          type="button"
          data-testid="project-mobile-preview-toggle"
          onClick={() => setMobilePreviewOpen((open) => !open)}
          className={controlClass({ shape: "row", className: "mb-4 justify-between rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4 lg:hidden" })}
        >
          <div>
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t("preview.toggleEyebrow")}
            </p>
            <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
              {mobilePreviewSummary}
            </p>
          </div>
          <ChevronDown
            size={ICON_SIZE.lg}
            className={cn(
              "shrink-0 text-[color:var(--color-text-quaternary)] transition-transform",
              mobilePreviewOpen && "rotate-180",
            )}
          />
        </button>
        <div className={cn("hidden lg:block", mobilePreviewOpen && "block")}>
          {(mode === "edit" || saveNotice) && (
            <div className="mb-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                {t("preview.previewEyebrow")}
              </p>
              {saveNotice ? (
                <div
                  role="status"
                  className="mt-3 rounded-card border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] px-4 py-3 text-body-lg text-[color:var(--color-indigo-text-soft)]"
                >
                  {saveNotice}
                </div>
              ) : null}
              {mode === "edit" ? (
                <>
                  <p className="mt-3 text-body-lg text-[color:var(--color-text-secondary)]">
                    {t("preview.liveHint")}
                  </p>
                  {!saveNotice && changePreviewItems.length === 0 ? (
                    <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                      {t("preview.noChanges")}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
          <p className="mb-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {t("preview.cardEyebrow")}
          </p>
          {/* No frame around the card: the preview matches the map, which has none. */}
          <div className="flex items-start justify-center rounded-panel bg-[color:var(--color-canvas)] py-4">
            <ProjectCard
              project={previewProject}
              category={(() => {
                const c = getCategory(previewProject.category);
                return c
                  ? {
                      borderStyle: c.borderStyle,
                      sideLabelText: c.sideLabelText ?? c.labelEn ?? c.label,
                    }
                  : undefined;
              })()}
              statusDotColor={
                getStatus(previewProject.status)?.dotColor ?? "neutral"
              }
              shared={
                !previewProject.isHub &&
                isSharedNode(
                  previewProject.dependencies,
                  computeHubSlugs(allProjects),
                )
              }
              hubEyebrow={t("preview.cardHubEyebrow")}
              sharedEyebrow={t("preview.cardSharedEyebrow")}
              descriptionEmptyLabel={t("preview.cardDescriptionEmpty")}
              preview
            />
          </div>
          <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
            {t("preview.cardCaption")}
          </p>
          <div className="mt-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                  {t("preview.completenessLabel")}
                </p>
                <p className="mt-2 text-title font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
                  {completenessInsight.score}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                  {t("preview.publicStatusLabel")}
                </p>
                <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                  {isDirty ? t("preview.publicStatusDirty") : tFreshness(freshnessInsight.level)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
              {t(mode === "create" ? "preview.completenessFractionCreate" : "preview.completenessFraction", {
                completed: completenessInsight.completedCount,
                total: completenessInsight.totalCount,
              })}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
