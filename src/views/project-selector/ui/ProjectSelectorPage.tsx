"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import {
  getProjectRuntimeDetailHref,
  getTopologyProjectHref,
  type Project,
} from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode, VaultSourceHydrationBoundary } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { formatDate } from "@/shared/lib/format-date";
import { buildContainmentParents } from "@/entities/knowledge-graph/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass } from "@/shared/ui/control-class";
import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW } from "@/shared/ui/page-frame";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import { RecentNodeRow } from "@/widgets/recent-node-row";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { computeWorkspaceCensus } from "../lib/workspace-census";
import { buildProjectCardFacts } from "../lib/project-card-facts";
import { buildDomainCompositionRows, type DomainCompositionRow } from "../lib/domain-composition";
import { resolveAuthoredDescription } from "../lib/authored-description";
import {
  buildRecentActivityRows,
  resolveRecentActivityAgo,
  type RecentActivityAgo,
} from "../lib/recent-activity";
import { useVaultDocs } from "../lib/use-vault-docs";
import { findProjectDocInList } from "@/entities/docs-vault";

// RATIO-SYSTEM.md (docs/prototypes/RATIO-SYSTEM.md) is the normative source
// for these — 1600 container / 28 section gap / 20 card gap. Token promotion
// (`--page-max`, `--section-gap`, `--card-gap`) is tracked separately and may
// land from another slice; these stay local constants until that lands so
// this page doesn't block on it or silently diverge from a half-migrated
// token set.

/*
 * ⚠️ **State the weight — an unstyled `<b>` is the browser default of 700** (2026-08-05).
 * 700 is outside this repository's weight ramp (510/560/650), and the engraved-numeral `<b>` in the
 * sibling `DomainCompositionGrid` was already `strong` (650). The defect leaves no value in the code
 * at all, so neither lint nor a source scan can see it — it was caught only by measuring the built screen.
 */
const numeralClass =
  "font-mono font-[var(--font-weight-strong)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]";

type SelectorTranslator = ReturnType<typeof useTranslations<"projectPages.selector">>;

function formatAgo(ago: RecentActivityAgo, t: SelectorTranslator) {
  if (ago.unit === "today") return t("activityAgoToday");
  if (ago.unit === "yesterday") return t("activityAgoYesterday");
  return t("activityAgoDaysAgo", { days: ago.days });
}

export function ProjectSelectorPage() {
  const t = useTranslations("projectPages.selector");
  const kindLabel = useOntologyKindLabel();
  useDocumentTitle(t("documentTitle"));

  const { projects } = useProjects();
  const { insight } = useOntologyInsight();
  const docs = useVaultDocs();
  // Only the binding was removed because nothing reads the value; the call stays. `useLocalVault()`
  // throws outside its Provider, so this one line is both a mount-time assertion that this screen sits
  // under `LocalVaultProvider` and the vault subscription. Removing the call too would change the
  // render count, which is not lint cleanup's business.
  useLocalVault();
  const dataSourceMode = useDataSourceMode();

  // At lg+ the gear at the bottom of the nav rail opens settings, matching the map and insights.
  // Below lg the chrome tile in the utility lane above takes over (the rail is hidden at that width).
  // Both uncontrolled.
  const navRailSettingsSlot = useMemo(
    () => <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />,
    [dataSourceMode],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);

  const nodes = useMemo(() => insight?.nodes ?? [], [insight]);
  const edges = useMemo(() => insight?.edges ?? [], [insight]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const parentOf = useMemo(() => buildContainmentParents(edges, nodeById), [edges, nodeById]);

  // dogfood-style single-project vaults rarely stamp `projectIds` on every
  // node (see derivationToInsight) — when there's exactly one project and no
  // node is tagged, treat every node as that project's own.
  const singleProjectFallback =
    projects.length === 1 && !nodes.some((n) => n.projectIds.length > 0);

  const census = useMemo(
    () => computeWorkspaceCensus(nodes, edges, projects.length),
    [nodes, edges, projects.length],
  );

  const recentActivityRows = useMemo(
    () => buildRecentActivityRows(docs, nodeById, parentOf, 4),
    [docs, nodeById, parentOf],
  );

  const domainCompositionRows = useMemo(
    () => buildDomainCompositionRows(nodes, edges),
    [nodes, edges],
  );

  const newProjectHref = `/project/new/?returnTo=${encodeURIComponent("/projects/")}`;

  return (
    <VaultSourceHydrationBoundary>
    <div className="flex min-h-full w-full">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
        {/*
         * ⚠️ **The live indicator was removed from here** (owner report, 2026-08-03).
         *
         * "Live · tracking · 8 changes" is **the map's object** — there it draws what changed onto the
         * nodes, so the number leads to a next action. The project list is a screen you skim, where
         * that number has nowhere to go, and instead it **took the strongest ink on the screen at the
         * top right** and reserved a whole row, pushing everything below it down (measured: at lg+ that
         * chip was the only content in this row).
         *
         * So the row itself is `lg:hidden` — at widths where the rail carries settings, nothing is left
         * in this row, and an empty row holding its place is a defect, not whitespace.
         */}
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
          <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
        </div>
        <div className={`${PAGE_FRAME} pb-6 md:pb-10`}>
        {/*
         * ⚠️ **The breadcrumb row was removed entirely** (two owner reports, 2026-08-09).
         *
         * ① "← map" — the left rail already carries the map and highlights where you are. Two entrances
         *    to one destination is exactly that class of confusion.
         * ② "whole folder: 112 concepts · 241 relations" — **that is the cards below, sliced
         *    differently.** Measured: 49 capabilities + 54 elements + 8 domains + 1 project = **exactly
         *    112**. Only relations differed by 8 (relations outside the project). The old comment knew
         *    about this overlap and waved it away with "just state the scope"; the owner's verdict was
         *    the opposite — *"This sort of thing is confusing; the top row doesn't need information."* (this sort of thing is
         *    confusing; the top row doesn't need information). Rather than making people distinguish by
         *    words, **count it in one place**: inside the project card.
         */}

        <header className={PAGE_HEADER_ROW}>
          <div className={PAGE_TITLE_ROW}>
            <h1 className="text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
              {t("headerTitle")}
            </h1>
            <span className="flex items-baseline gap-1.5 pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">
              <b className={numeralClass}>{census.projectCount}</b>{" "}
              {t("censusLineProjectLabel", { count: census.projectCount })}
              <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
              <b className={numeralClass}>{census.domainCount}</b>{" "}
              {t("censusLineDomainsLabel", { count: census.domainCount })}
            </span>
          </div>
          <Link
            href={newProjectHref}
            data-testid="project-selector-new-cta"
            className={controlClass({ shape: "chip", size: "lg", tone: "accent", className: "h-9 border-[color:var(--color-indigo-a50)] bg-[color:var(--topology-v2-panel-action-surface,var(--color-indigo-a06))] px-4 font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-2)]" })}
          >
            {t("ctaNewProject")}
          </Link>
        </header>
        <p className="mt-2 max-w-[720px] text-body leading-title text-[color:var(--color-text-tertiary)]">
          {t("lede")}
        </p>

        {/* Project cards are this page's primary content and recent activity is a secondary feed
            beneath them. The activity feed used to sit above the cards and competed for focus — a
            visitor is looking for "my projects", not "which document changed recently". */}
        {projects.length > 0 ? (
          <div className="mt-7 flex flex-col gap-5">
            {projects.map((project) => {
              // Document lookup goes only through `findProjectDocInList` — comparing `VaultDoc.slug`
              // (the file path) against `Project.slug` (frontmatter) directly fails to find any project
              // that declared its slug in frontmatter, so the card alone lies with "no description".
              const doc = findProjectDocInList(docs, project.slug);
              return (
                <ProjectFullCard
                  key={project.slug}
                  project={project}
                  facts={buildProjectCardFacts(nodes, edges, project.slug, singleProjectFallback)}
                  domainRows={domainCompositionRows.filter((row) =>
                    singleProjectFallback
                      ? true
                      : (nodeById.get(row.domainId)?.projectIds ?? []).includes(project.slug),
                  )}
                  description={resolveAuthoredDescription(doc)}
                  docPath={doc?.path}
                  kindLabel={kindLabel}
                  t={t}
                />
              );
            })}
          </div>
        ) : (
          <p className="mt-7 text-body text-[color:var(--color-text-tertiary)]">
            {t("emptyStateDesc")}
          </p>
        )}

        {recentActivityRows.length > 0 ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
                {t("activityHeading")}
              </span>
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                {t("activityCaption")}
              </span>
            </div>
            <div className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-1 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
              {recentActivityRows.map((row) => (
                <RecentNodeRow
                  key={row.slug}
                  kind={row.kind}
                  title={row.title}
                  subtitle={
                    row.what
                      ? `${row.domainTitle ?? t("activityNoDomain")} · ${row.what}`
                      : (row.domainTitle ?? t("activityNoDomain"))
                  }
                  trailing={formatAgo(resolveRecentActivityAgo(row.updatedAt, new Date()), t)}
                  trailingSecondary={row.slug}
                  href={row.nodeId ? buildOntologyNodeHref(row.nodeId) : undefined}
                  ariaLabel={t("activityRowAriaLabel", { slug: row.slug })}
                  testId="project-selector-activity-row"
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-7 rounded-panel border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-5 py-4">
          <div className="flex items-center gap-3">
            <TopologyV2KindGlyph kind="project" size={18} />
            <h3 className="text-body-lg font-[var(--font-weight-strong)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
              {t("nextSlotTitle")}
            </h3>
            <span className="text-body text-[color:var(--color-text-tertiary)]">
              {t("nextSlotSub")}
            </span>
          </div>
          {/* People first: the top line is the plain human path (the "new project" button above). The
              two code chips below are explicitly demoted as the developer and agent path — demoted, not
              deleted (the code strings themselves are preserved). */}
          <p className="mt-3 max-w-[640px] text-body leading-title text-[color:var(--color-text-secondary)]">
            {t("nextSlotHumanLead")}
          </p>
          <div className="mt-3 border-t border-[color:var(--color-divider)] pt-3">
            <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t("nextSlotCodeChipsCaption")}
            </span>
            <div className="mt-2 flex items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-body text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
              <span className="w-[108px] shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t("nextSlotCliLabel")}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
                {t("nextSlotCliCommand")}
              </code>
              <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-label text-[color:var(--color-text-tertiary)] sm:inline">
                {t("nextSlotCliCaption")}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-body text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
              <span className="w-[108px] shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t("nextSlotAgentLabel")}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
                {t("nextSlotAgentCommand")}
              </code>
              <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-label text-[color:var(--color-text-tertiary)] sm:inline">
                {t("nextSlotAgentCaption")}
              </span>
            </div>
            {/* The CLI line starts with `$ATLAS` — how to fill it in is stated in the same place
                (the contract in `cli-invocation.ts`). */}
            <p
              data-testid="project-selector-cli-placeholder-hint"
              className="mt-2 text-label leading-prose text-[color:var(--color-text-quaternary)]"
            >
              {t("cliPlaceholderHint")}
            </p>
          </div>
        </section>
        </div>
      </main>
    </div>
    </VaultSourceHydrationBoundary>
  );
}

interface ProjectFullCardProps {
  project: Project;
  facts: ReturnType<typeof buildProjectCardFacts>;
  domainRows: DomainCompositionRow[];
  /** Only the single line the user wrote themselves in frontmatter `description:`.
   * `Project.description` (the entity layer) falls back to a body excerpt when absent, and that
   * excerpt can be internal positioning copy, so it is never used on a card
   * (see `resolveAuthoredDescription`). */
  description: string | null;
  docPath: string | undefined;
  kindLabel: (kind: string) => string;
  t: SelectorTranslator;
}

function ProjectFullCard({ project, facts, domainRows, description, docPath, kindLabel, t }: ProjectFullCardProps) {
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    <article
      data-testid="project-selector-card"
      // The drop shadow was removed (2026-08-06). This card **is not floating** — it is a static
      // `<article>` with no sticky and no z-index. The three static cards on the same recipe (`:238`
      // and the two section cards in `ProjectForm`) all use inset material only, while this one alone
      // hand-applied `0 14px 34px`, creating a step outside the ramp. Drop shadows belong to things
      // that float.
      className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-6 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] transition-colors hover:border-[color:var(--color-border-strong)]"
    >
      <div className="flex items-start gap-3.5">
        <TopologyV2KindGlyph kind="project" size={26} className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {project.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-body text-[color:var(--color-text-tertiary)]">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
            <span>{t("cardUpdatedPrefix")} {ago}</span>
          </div>
          <p className="mt-1.5 text-body leading-title text-[color:var(--color-text-tertiary)] line-clamp-2">
            {description ?? t("cardDescriptionFallback")}
          </p>
        </div>
        <span className="mt-1.5 shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
          {project.slug}
        </span>
      </div>

      {/* Capabilities and elements, which say the most about scale, come first and larger; domains,
          documents, and relations are smaller secondary figures.
          ⚠️ The background is **the app ramp's `--color-overlay-1`**. It used to use a map-panel-only
          token (`--topology-v2-panel-metric-surface`, alpha 0.03), but this card is not a map panel.
          That put an alpha on screen that the app ramp does not have (the ramp is 0.02, 0.06, 0.10).
          `overlay-1` was already written as the fallback value, so the intended destination was known
          all along. The real difference is 0.01 of alpha. */}
      <div className="mt-4 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-2.5">
        <p className="mb-1.5 text-label text-[color:var(--color-text-quaternary)]">
          {t("factStripGloss")}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-body">
          <FactItem label={t("factCapability")} value={facts.capability} emphasis />
          <FactItem label={t("factElement")} value={facts.element} emphasis />
          <span aria-hidden className="h-4 w-px shrink-0 self-center bg-[color:var(--color-divider)]" />
          <FactItem label={t("factDomain")} value={facts.domain} />
          <FactItem label={t("factDocument")} value={facts.document} />
          <FactItem label={t("factRelations")} value={facts.relations} />
        </div>
      </div>

      {domainRows.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1">
          {/* The key to the bar's two segments appears once per group of bars — repeating it per row
              turns the key into noise across six rows × two segments. */}
          <DomainCapacityLegend
            labels={{ capabilityUnit: kindLabel("capability"), elementUnit: kindLabel("element") }}
            className="mb-1.5"
          />
          {domainRows.map((row) => (
            <DomainCapacityBar
              key={row.domainId}
              row={{
                id: row.domainId,
                title: row.title,
                capabilityCount: row.capabilityCount,
                elementCount: row.elementCount,
                total: row.total,
              }}
              labels={{ capabilityUnit: kindLabel("capability"), elementUnit: kindLabel("element") }}
              titleWidthClassName="sm:w-[200px] md:w-[280px]"
            />
          ))}
          {/* The metric band directly above reads 38 capabilities · 245 elements, while these bars sum
              to 40 · 279 by row. Both are correct — a concept belonging to several domains is counted
              once per domain. That fact was written only in the insights composition tab, so here it
              looked simply like mismatched numbers. It is a footnote to the bars, so it sits below them. */}
          <p
            data-testid="project-selector-domain-overlap-note"
            className="mt-1.5 text-label text-[color:var(--color-text-quaternary)]"
          >
            {t("domainOverlapNote")}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] pt-2 text-body text-[color:var(--color-text-tertiary)]">
        <Link
          href={getProjectRuntimeDetailHref(project.slug)}
          prefetch={false}
          aria-label={t("cardDetailAriaLabel", { name: project.name })}
          className={controlClass({ shape: "link", tone: "secondary", className: "h-8 hover:text-[color:var(--color-text-primary)]" })}
        >
          {t("footDetail")}
        </Link>
        <Link
          href={getTopologyProjectHref(project.slug)}
          prefetch={false}
          className={controlClass({ shape: "link", tone: "secondary", className: "h-8 hover:text-[color:var(--color-text-primary)]" })}
        >
          {t("footTopologyView")}
        </Link>
          {/* The update time is consolidated into "last updated" at the top — this line is demoted to a
              file-path breadcrumb at quaternary/caption to remove the duplicate competition. */}
        <span className="ml-auto whitespace-nowrap font-mono text-caption tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)]">
          {t("footUpdated", {
            date: formatDate(project.updatedAt),
            path: docPath ?? project.slug,
          })}
        </span>
      </div>
    </article>
  );
}

function FactItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  // Emphasised figures (capabilities, elements) put the number first and large so scale reads first;
  // secondary figures are lowered with a label-first layout — hierarchy from size and order alone.
  if (emphasis) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <b className={`${numeralClass} text-title leading-label`}>{value}</b>
        <span className="text-body text-[color:var(--color-text-tertiary)]">{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-baseline gap-1.5 text-label">
      <span className="text-[color:var(--color-text-quaternary)]">{label}</span>
      <b className={numeralClass}>{value}</b>
    </span>
  );
}
