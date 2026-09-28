"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { findProjectDocInList } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref, getTopologyProjectNodeHref, projectDisplayName, type Project } from "@/entities/project";
import { OpenVaultCta } from "@/features/docs-vault-local";
import { useDataSourceMode, VaultSourceHydrationBoundary, useLocalVault } from "@/entities/vault-session";
import { Link } from "@/i18n/navigation";
import { Copy } from "lucide-react";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";
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

/** Shared by the project cards and the next-project tile. */
const TILE_SURFACE =
  "rounded-card border bg-[color:var(--color-panel)] shadow-[inset_0_1px_0_var(--color-overlay-1)]";

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

  return (
    <VaultSourceHydrationBoundary>
      <div className="flex min-h-full w-full">
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
          <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
            <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
          </div>
          <div className={`${PAGE_FRAME} pb-6 md:pb-10`}>
            {/* The count names its scope; adding a project lives only in the closing tile. */}
            <header className={PAGE_HEADER_ROW}>
              <div className={PAGE_TITLE_ROW}>
                <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
                  {t("headerTitle")}
                </h1>
                <span
                  data-testid="project-selector-count"
                  className="pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]"
                >
                  {dataSourceMode === "static"
                    ? t("projectCountSample", { count: projects.length })
                    : t("projectCount", { count: projects.length })}
                </span>
              </div>
              {dataSourceMode === "static" ? <OpenVaultCta testId="project-selector-open-vault" /> : null}
            </header>
            <p className="mt-2 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] text-body leading-title text-[color:var(--color-text-tertiary)]">
              {t("lede")}
            </p>

            {/* Cards, not page-wide rows, so words and doors stay within one hand's reach
                (`docs/records/decisions/2026-09-15-compact-project-identification-1fd40970-f033-4260-861d-d54d44899bdd.md`). */}
            {projects.length > 0 ? (
              <ul
                data-testid="project-selector-grid"
                className="mt-7 grid list-none grid-cols-1 gap-[var(--card-gap)] p-0 md:grid-cols-2"
              >
                {projects.map((project) => {
                  const doc = findProjectDocInList(docs, project.slug);
                  return (
                    <li key={project.slug} className="flex min-w-0">
                      <ProjectCard project={project} description={resolveAuthoredDescription(doc, project)} t={t} />
                    </li>
                  );
                })}
                {/* Alone on its row, the tile spans it. */}
                <li className={`flex min-w-0 ${projects.length % 2 === 0 ? "md:col-span-2" : ""}`}>
                  <NextProjectTile t={t} />
                </li>
              </ul>
            ) : (
              <div className="mt-7 flex">
                <NextProjectTile t={t} description={t("emptyStateDesc")} />
              </div>
            )}
          </div>
        </main>
      </div>
    </VaultSourceHydrationBoundary>
  );
}

function ProjectCard({ project, description, t }: { project: Project; description: string | null; t: SelectorTranslator }) {
  const locale = useLocale();
  const name = projectDisplayName(project, locale);
  const detailHref = getProjectRuntimeDetailHref(project.slug);
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    /* The name's link stretches over the card; the footer doors stand above it on `z-[1]`. */
    <article
      data-testid="project-selector-card"
      className={`${TILE_SURFACE} group relative flex w-full min-w-0 flex-col border-[color:var(--color-border-soft)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] focus-within:border-[color:var(--color-border-strong)]`}
    >
      <div className="flex min-w-0 flex-1 flex-col p-[var(--card-pad)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <OntologyMapKindGlyph kind="project" className="shrink-0" />
          <h2 className="min-w-0 flex-1 truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)]">
            <Link
              href={detailHref}
              prefetch={false}
              className={controlClass({
                shape: "link",
                tone: "secondary",
                hoverInk: "strong",
                className:
                  "min-w-0 max-w-full text-title text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[color:var(--color-indigo-focus-ring)]",
              })}
              /* The focus ring outlines the whole card, which is what the pointer presses. */
            >
              <span className="min-w-0 truncate">{name}</span>
            </Link>
          </h2>
        </div>
        {/* No reserved lines: the row stretches cards and pins footers. The clamp is a last resort. */}
        <p className="mt-2.5 line-clamp-4 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {description ?? (
            <span className="text-[color:var(--color-text-tertiary)]">{t("cardDescriptionFallback")}</span>
          )}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] px-[var(--card-pad)] py-3">
        <span className="mr-auto text-label text-[color:var(--color-text-tertiary)]">
          {t("cardUpdatedPrefix")} {ago}
        </span>
        <Link
          href={getTopologyProjectNodeHref(project.slug)}
          prefetch={false}
          className={controlClass({ shape: "chip", size: "md", tone: "secondary", className: "relative z-[1]" })}
        >
          {t("footTopologyView")}
        </Link>
        <Link
          href={detailHref}
          prefetch={false}
          aria-label={t("cardDetailAriaLabel", { name })}
          className={controlClass({ shape: "chip", size: "md", tone: "accent", className: "relative z-[1]" })}
        >
          {t("footDetail")}
        </Link>
      </div>
    </article>
  );
}


/**
 * The page's one way to add a project: the form or a request to paste into an agent, side by
 * side in the card's grammar, two lines deep so a neighbouring card does not stretch.
 */
function NextProjectTile({ t, description }: { t: SelectorTranslator; description?: string }) {
  const copy = useCopyFeedback();
  const copyLabel =
    copy.state === "copied" ? t("nextSlotCopied") : copy.state === "failed" ? t("nextSlotCopyError") : t("nextSlotCopy");
  const newProjectHref = `/project/new/?returnTo=${encodeURIComponent("/projects/")}`;
  // One template for body and footer, so each control stands under its sentence.
  const columns = "grid grid-cols-1 gap-x-6 gap-y-2 @md/next-slot:grid-cols-2";
  // Dashed soft border: a divider-ink one is a surface combination the ratchet refuses.
  return (
    <section
      data-testid="project-selector-next-slot"
      aria-labelledby="project-selector-next-slot-title"
      className="@container/next-slot flex w-full min-w-0 flex-col rounded-card border border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
    >
      <div className="flex min-w-0 flex-1 flex-col p-[var(--card-pad)]">
        <h2
          id="project-selector-next-slot-title"
          className="text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-secondary)]"
        >
          {t("nextSlotTitle")}
        </h2>
        {description ? (
          <p className="mt-2.5 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] text-pretty text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
        <div className={`mt-2.5 ${columns}`}>
          <p className="min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] text-pretty text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t("nextSlotFormSub")}
          </p>
          <p className="min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] text-pretty text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t("nextSlotSub")}
          </p>
        </div>
      </div>
      <div className="border-t border-dashed border-[color:var(--color-divider)] px-[var(--card-pad)] py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 @md/next-slot:grid @md/next-slot:grid-cols-2 @md/next-slot:gap-x-6">
          <div className="min-w-0">
            <Link
              href={newProjectHref}
              data-testid="project-selector-new-cta"
              className={controlClass({ shape: "chip", size: "md", tone: "accent" })}
            >
              {t("ctaNewProject")}
            </Link>
          </div>
          <div className="min-w-0">
            <button
              type="button"
              data-testid="project-selector-next-copy"
              onClick={() => void copy.copy(t("nextSlotPrompt"))}
              className={controlClass({ shape: "chip", size: "md", tone: "secondary", className: "max-w-full" })}
            >
              <Copy size={ICON_SIZE.sm} aria-hidden />
              <span aria-live="polite" className="min-w-0 truncate">{copyLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
