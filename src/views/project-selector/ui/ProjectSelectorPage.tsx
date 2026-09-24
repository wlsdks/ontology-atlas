"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { findProjectDocInList } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref, getTopologyProjectHref, projectDisplayName, type Project } from "@/entities/project";
import { useDataSourceMode, VaultSourceHydrationBoundary, useLocalVault } from "@/entities/vault-session";
import { Link } from "@/i18n/navigation";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { OntologyMapKindGlyph } from "@/shared/ui";
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

/**
 * The card surface every tile on this screen shares, so a project card and the "next project" tile
 * stand on one material and one radius.
 */
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

            {/*
              **A grid of equal cards, not a page-wide row** (2026-09-25). The content is the compact
              index's (`docs/records/decisions/2026-09-15-compact-project-identification-…`): linked
              name, one purpose sentence, last update, details and map. What changed is the shape
              that holds it. A row stretched to the page put the name at x=104 and its actions past
              x=1200 with ~900px of empty band between (measured at 1512), and a two-project folder
              left 70% of the canvas bare below. Cards keep each project's words and doors inside one
              box a hand can cover, and the tile that closes the grid says how the next card appears.
            */}
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
                {/* An even count leaves the tile alone on its row, so it spans the row as a band
                    rather than standing half-width beside nothing. */}
                <li className={`flex min-w-0 ${projects.length % 2 === 0 ? "md:col-span-2" : ""}`}>
                  <NextProjectTile t={t} band={projects.length % 2 === 0} />
                </li>
              </ul>
            ) : (
              <div className="mt-7 flex">
                <NextProjectTile t={t} band description={t("emptyStateDesc")} />
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
  // The word the map and the Library draw for this project on this screen (2026-09-19).
  const name = projectDisplayName(project, locale);
  const detailHref = getProjectRuntimeDetailHref(project.slug);
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    /*
      One pressable surface. The name's link is stretched over the card (`after:inset-0`) so the
      whole box opens the project, and the footer's two doors stand above that layer (`z-[1]`) as
      the card's secondary actions. Before 2026-09-25 the 24px title was the only target and the
      row gave no sign under the pointer (a hover diff changed zero pixels).
    */
    <article
      data-testid="project-selector-card"
      className={`${TILE_SURFACE} group relative flex w-full min-w-0 flex-col border-[color:var(--color-border-soft)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] focus-within:border-[color:var(--color-border-strong)]`}
    >
      <div className="flex min-w-0 flex-1 flex-col p-[var(--card-pad)]">
        <div className="flex min-w-0 items-center gap-2.5">
          <OntologyMapKindGlyph kind="project" size={18} className="shrink-0" />
          <h2 className="min-w-0 flex-1 truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)]">
            <Link
              href={detailHref}
              prefetch={false}
              className={controlClass({
                shape: "link",
                tone: "secondary",
                hoverInk: "strong",
                className:
                  "min-w-0 max-w-full text-title text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-card after:content-['']",
              })}
            >
              <span className="min-w-0 truncate">{name}</span>
            </Link>
          </h2>
        </div>
        {/* Three lines reserved and four allowed, so cards in a row end on one line.
            The sentence is whole (`resolveAuthoredDescription` never cuts mid-clause); the clamp is
            the last resort for a first sentence longer than four lines of the card. */}
        <p className="mt-2.5 line-clamp-4 min-h-[calc(3*var(--leading-body-lg))] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
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
          href={getTopologyProjectHref(project.slug)}
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
 * The tile that closes the grid: how the next card gets here. The header's "New project" is the
 * easy door; this names the two paths that need no screen at all, so a person who works from a
 * terminal or through an agent sees theirs without leaving the list.
 */
function NextProjectTile({ t, description, band = false }: { t: SelectorTranslator; description?: string; band?: boolean }) {
  return (
    <section
      data-testid="project-selector-next-slot"
      aria-labelledby="project-selector-next-slot-title"
      className={`grid w-full min-w-0 content-between gap-x-10 gap-y-4 rounded-card border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] ${band ? "md:grid-cols-2 md:items-center" : ""}`}
    >
      <div className="min-w-0">
        <h2 id="project-selector-next-slot-title" className="text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-secondary)]">
          {t("nextSlotTitle")}
        </h2>
        <p className="mt-2 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {description ?? t("nextSlotSub")}
        </p>
      </div>
      <dl className="grid min-w-0 gap-1.5">
        {[
          { label: t("nextSlotCliLabel"), command: t("nextSlotCliCommand") },
          { label: t("nextSlotAgentLabel"), command: t("nextSlotAgentCommand") },
        ].map((row) => (
          <div key={row.label} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-baseline gap-3">
            <dt className="text-label text-[color:var(--color-text-quaternary)]">{row.label}</dt>
            <dd className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-tertiary)]" title={row.command}>
              {row.command}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
