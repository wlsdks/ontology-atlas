"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { findProjectDocInList } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref, getTopologyProjectHref, type Project } from "@/entities/project";
import { useDataSourceMode, VaultSourceHydrationBoundary, useLocalVault } from "@/entities/vault-session";
import { Link } from "@/i18n/navigation";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { controlClass } from "@/shared/ui/control-class";
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from "@/shared/ui/page-frame";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { resolveAuthoredDescription } from "../lib/authored-description";
import { resolveRecentActivityAgo, type RecentActivityAgo } from "../lib/recent-activity";
import { useProjects, useVaultDocs } from "@/features/project-data-source";

type SelectorTranslator = ReturnType<typeof useTranslations<"projectPages.selector">>;

function formatAgo(ago: RecentActivityAgo, t: SelectorTranslator) {
  if (ago.unit === "today") return t("activityAgoToday");
  if (ago.unit === "yesterday") return t("activityAgoYesterday");
  return t("activityAgoDaysAgo", { days: ago.days });
}

export function ProjectSelectorPage() {
  const t = useTranslations("projectPages.selector");
  useDocumentTitle(t("documentTitle"));
  const { projects } = useProjects();
  const docs = useVaultDocs();
  useLocalVault();
  const dataSourceMode = useDataSourceMode();
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  const newProjectHref = `/project/new/?returnTo=${encodeURIComponent("/projects/")}`;

  return (
    <VaultSourceHydrationBoundary>
      <div className="flex min-h-full w-full">
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
          <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
            <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
          </div>
          <div className={`${PAGE_FRAME} pb-6 md:pb-10`}>
            <header className={PAGE_HEADER_ROW}>
              <div className={PAGE_TITLE_ROW}>
                <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
                  {t("headerTitle")}
                </h1>
                <span className="pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">
                  {t("projectCount", { count: projects.length })}
                </span>
              </div>
              <Link href={newProjectHref} data-testid="project-selector-new-cta" className={controlClass({ shape: "chip", size: "lg", tone: "accent" })}>
                {t("ctaNewProject")}
              </Link>
            </header>
            <p className="mt-2 max-w-[720px] text-body leading-title text-[color:var(--color-text-tertiary)]">
              {t("lede")}
            </p>
            {dataSourceMode === "static" ? (
              <p data-testid="project-selector-sample-scope-note" className="mt-1 max-w-[720px] text-label leading-prose text-[color:var(--color-text-quaternary)]">
                {t("sampleScopeNote")}
              </p>
            ) : null}

            {projects.length > 0 ? (
              <div className="mt-7 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[inset_0_1px_0_var(--color-overlay-2)]">
                {projects.map((project) => {
                  const doc = findProjectDocInList(docs, project.slug);
                  return <ProjectRow key={project.slug} project={project} description={resolveAuthoredDescription(doc)} t={t} />;
                })}
              </div>
            ) : (
              <p className="mt-7 text-body text-[color:var(--color-text-tertiary)]">{t("emptyStateDesc")}</p>
            )}
          </div>
        </main>
      </div>
    </VaultSourceHydrationBoundary>
  );
}

function ProjectRow({ project, description, t }: { project: Project; description: string | null; t: SelectorTranslator }) {
  const detailHref = getProjectRuntimeDetailHref(project.slug);
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    <article data-testid="project-selector-card" className="flex flex-col gap-4 border-b border-[color:var(--color-divider)] px-5 py-4 last:border-b-0 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)]">
          <Link href={detailHref} prefetch={false} className={controlClass({ shape: "link", tone: "secondary", hoverInk: "strong", className: "min-w-0 max-w-full text-title text-[color:var(--color-text-primary)]" })}>
            <span className="min-w-0 truncate">{project.name}</span>
          </Link>
        </h2>
        <p className="mt-1 line-clamp-1 text-body leading-title text-[color:var(--color-text-tertiary)]">
          {description ?? t("cardDescriptionFallback")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
        <span className="mr-1 text-label text-[color:var(--color-text-quaternary)]">{t("cardUpdatedPrefix")} {ago}</span>
        <Link href={detailHref} prefetch={false} aria-label={t("cardDetailAriaLabel", { name: project.name })} className={controlClass({ shape: "chip", size: "md", tone: "accent" })}>
          {t("footDetail")}
        </Link>
        <Link href={getTopologyProjectHref(project.slug)} prefetch={false} className={controlClass({ shape: "chip", size: "md", tone: "secondary" })}>
          {t("footTopologyView")}
        </Link>
      </div>
    </article>
  );
}
