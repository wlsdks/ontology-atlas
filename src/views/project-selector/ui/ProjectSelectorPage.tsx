"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { findProjectDocInList } from "@/entities/docs-vault";
import { getProjectRuntimeDetailHref, getTopologyProjectHref, projectDisplayName, type Project } from "@/entities/project";
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

  return (
    <VaultSourceHydrationBoundary>
      <div className="flex min-h-full w-full">
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
          <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
            <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
          </div>
          <div className={`${PAGE_FRAME} pb-6 md:pb-10`}>
            {/*
              **One way in to adding a project, and the count says its own scope** (2026-09-25,
              round four). The header used to carry a "New project" button while the tile closing
              the grid carried the agent path: two add entries at two control sizes with no rule
              for which one wins. Both paths now live in that tile, side by side. The sample's
              scope used to be a caption under the lede explaining the count and pointing at the
              map's first-run card; the count itself now says "sample", and the control that makes
              it the person's own count (open a folder) stands where the header's action stood.
            */}
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
                  "min-w-0 max-w-full text-title text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-card after:content-['']",
              })}
            >
              <span className="min-w-0 truncate">{name}</span>
            </Link>
          </h2>
        </div>
        {/* Four lines allowed and none reserved. A three-line floor kept an empty ~60px band under
            a one-line purpose (round four); cards in a row still end on one line because the row
            stretches them and the footer is pinned to the bottom. The sentence is whole
            (`resolveAuthoredDescription` never cuts mid-clause); the clamp is the last resort. */}
        <p className="mt-2.5 line-clamp-4 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
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
 * The tile that closes the grid, and the page's one way to add a project.
 *
 * A project arrives two ways: the form (`/project/new`, which owns creation) or a connected agent
 * given a request to paste. Until round four the form was the header's button and the agent path
 * was this tile, so the page offered two add entries at two control sizes (12.5 against 11px at
 * 1040) with no rule for which one wins. Both paths now stand here side by side, each a sentence
 * saying what happens and a control under it, drawn in the card's own grammar: words in the body,
 * `md` chips on a footer line, the accent on the first door exactly as each card's footer carries it.
 *
 * With two paths in two columns the tile's body is two lines deep, the depth of a card's one- or
 * two-line purpose, so a card standing beside it does not stretch around a void.
 *
 * With an even project count, or no project yet, it spans the row as a band in the same two columns.
 */
function NextProjectTile({ t, description }: { t: SelectorTranslator; description?: string }) {
  const copy = useCopyFeedback();
  const copyLabel =
    copy.state === "copied" ? t("nextSlotCopied") : copy.state === "failed" ? t("nextSlotCopyError") : t("nextSlotCopy");
  const newProjectHref = `/project/new/?returnTo=${encodeURIComponent("/projects/")}`;
  // The two columns share one template in the body and on the footer line, so each control stands
  // under its own sentence. Narrow, the sentences stack and the controls share one row.
  const columns = "grid grid-cols-1 gap-x-6 gap-y-2 @md/next-slot:grid-cols-2";
  // The slot wears the soft border every card here wears, only dashed: a divider-ink border on
  // the overlay fill was a ninth surface combination the surface-vocabulary ratchet refuses.
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
          <p className="mt-2.5 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-pretty text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
            {description}
          </p>
        ) : null}
        <div className={`mt-2.5 ${columns}`}>
          <p className="min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-pretty text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t("nextSlotFormSub")}
          </p>
          <p className="min-w-0 max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))] break-keep text-pretty text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t("nextSlotSub")}
          </p>
        </div>
      </div>
      {/* The card's footer line: same divider, same inset, the doors where the card's doors stand. */}
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
