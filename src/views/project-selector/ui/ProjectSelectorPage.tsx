"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  getProjectDetailHref,
  getTopologyProjectHref,
  type Project,
} from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { LiveActivityIndicator, useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { buildContainmentParents } from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { computeWorkspaceCensus } from "../lib/workspace-census";
import { buildProjectCardFacts } from "../lib/project-card-facts";
import { buildDomainCompositionRows, type DomainCompositionRow } from "../lib/domain-composition";
import {
  buildRecentActivityRows,
  resolveRecentActivityAgo,
  type RecentActivityAgo,
} from "../lib/recent-activity";
import { useVaultDocs } from "../lib/use-vault-docs";

// RATIO-SYSTEM.md (docs/prototypes/RATIO-SYSTEM.md) is the normative source
// for these — 1600 container / 28 section gap / 20 card gap. Token promotion
// (`--page-max`, `--section-gap`, `--card-gap`) is tracked separately and may
// land from another slice; these stay local constants until that lands so
// this page doesn't block on it or silently diverge from a half-migrated
// token set.
const PAGE_MAX_WIDTH = 1600;

const numeralClass =
  "font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]";

type SelectorTranslator = ReturnType<typeof useTranslations<"projectPages.selector">>;

function formatAgo(ago: RecentActivityAgo, t: SelectorTranslator) {
  if (ago.unit === "today") return t("activityAgoToday");
  if (ago.unit === "yesterday") return t("activityAgoYesterday");
  return t("activityAgoDaysAgo", { days: ago.days });
}

function formatDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ProjectSelectorPage() {
  const t = useTranslations("projectPages.selector");
  useDocumentTitle(t("documentTitle"));

  const { projects } = useProjects();
  const { insight } = useOntologyInsight();
  const docs = useVaultDocs();
  const vault = useLocalVault();
  const dataSourceMode = useDataSourceMode();

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
    <div className="flex min-h-screen w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <main id="main" className="min-w-0 flex-1 bg-[color:var(--color-canvas)]">
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6">
          <LiveActivityIndicator agentActivityStatus={vault.agentActivityStatus} />
          <AppSettingsMenu mode={dataSourceMode} />
        </div>
        <div className="mx-auto px-5 py-6 md:px-10 md:py-10" style={{ maxWidth: PAGE_MAX_WIDTH }}>
        <nav className="mb-5 flex flex-wrap items-center gap-2.5 text-[12px] text-[color:var(--color-text-tertiary)]">
          <Link
            href="/"
            className="text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("crumbBack")}
          </Link>
          <span aria-hidden className="text-[color:var(--color-text-quaternary)]">/</span>
          <span>{t("crumbCurrent")}</span>
          <span className={`ml-auto text-[11px] tracking-[0.08em] ${numeralClass}`}>
            {census.conceptCount} {t("censusTopConceptsLabel")}
            <span aria-hidden className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
            {census.relationCount} {t("censusTopRelationsLabel")}
          </span>
        </nav>

        <header className="flex flex-wrap items-end gap-4">
          <h1 className="text-[23px] font-[var(--font-weight-signature)] tracking-[-0.015em] text-[color:var(--color-text-primary)]">
            {t("headerTitle")}
          </h1>
          <span className="flex items-baseline gap-1.5 pb-[3px] text-[11.5px] tracking-[0.06em] text-[color:var(--color-text-tertiary)]">
            <b className={numeralClass}>{census.projectCount}</b> {t("censusLineProjectLabel")}
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <b className={numeralClass}>{census.domainCount}</b> {t("censusLineDomainsLabel")}
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <b className={numeralClass}>{census.conceptCount}</b> {t("censusLineConceptsLabel")}
          </span>
          <Link
            href={newProjectHref}
            data-testid="project-selector-new-cta"
            className="ml-auto inline-flex h-9 items-center rounded-md border border-[color:var(--color-indigo-a50)] bg-[color:var(--topology-v2-panel-action-surface,var(--color-indigo-a06))] px-4 text-[12.5px] font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-2)]"
          >
            {t("ctaNewProject")}
          </Link>
        </header>
        <p className="mt-2 max-w-[720px] text-[12.5px] leading-6 text-[color:var(--color-text-tertiary)]">
          {t("lede")}
        </p>

        {recentActivityRows.length > 0 ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-[13.5px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {t("activityHeading")}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("activityCaption")}
              </span>
            </div>
            <div className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-2 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
              {recentActivityRows.map((row, index) => (
                <div
                  key={row.slug}
                  data-testid="project-selector-activity-row"
                  className={`flex items-center gap-2.5 py-1.5 text-[12.5px] text-[color:var(--color-text-secondary)] ${
                    index > 0 ? "border-t border-[color:var(--color-divider)]" : ""
                  }`}
                >
                  <TopologyV2KindGlyph kind={row.kind} size={14} />
                  <span
                    title={row.slug}
                    className="min-w-0 shrink truncate font-mono text-[11.5px] text-[color:var(--color-text-secondary)]"
                  >
                    {row.slug}
                  </span>
                  {row.what ? (
                    <span
                      title={row.what}
                      className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--color-text-tertiary)]"
                    >
                      {row.what}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1" />
                  )}
                  <span
                    title={row.domainTitle ?? undefined}
                    className="max-w-[150px] shrink truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] sm:max-w-[220px]"
                  >
                    {row.domainTitle ?? t("activityNoDomain")}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-[11px] ${numeralClass}`}>
                    {formatAgo(resolveRecentActivityAgo(row.updatedAt, new Date()), t)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <div className="mt-7 flex flex-col gap-5">
            {projects.map((project) => (
              <ProjectFullCard
                key={project.slug}
                project={project}
                facts={buildProjectCardFacts(nodes, edges, project.slug, singleProjectFallback)}
                domainRows={domainCompositionRows.filter((row) =>
                  singleProjectFallback
                    ? true
                    : (nodeById.get(row.domainId)?.projectIds ?? []).includes(project.slug),
                )}
                docPath={docs.find((d) => d.slug === project.slug)?.path}
                t={t}
              />
            ))}
          </div>
        ) : (
          <p className="mt-7 text-[12.5px] text-[color:var(--color-text-tertiary)]">
            {t("emptyStateDesc")}
          </p>
        )}

        <section className="mt-7 rounded-[11px] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-5 py-4">
          <div className="flex items-center gap-3">
            <TopologyV2KindGlyph kind="project" size={18} />
            <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {t("nextSlotTitle")}
            </h3>
            <span className="text-[12px] text-[color:var(--color-text-tertiary)]">
              {t("nextSlotSub")}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-[12px] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
            <span className="w-[108px] shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("nextSlotCliLabel")}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[color:var(--color-text-secondary)]">
              {t("nextSlotCliCommand")}
            </code>
            <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-[10.5px] text-[color:var(--color-text-quaternary)] sm:inline">
              {t("nextSlotCliCaption")}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-[12px] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
            <span className="w-[108px] shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("nextSlotAgentLabel")}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[color:var(--color-text-secondary)]">
              {t("nextSlotAgentCommand")}
            </code>
            <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-[10.5px] text-[color:var(--color-text-quaternary)] sm:inline">
              {t("nextSlotAgentCaption")}
            </span>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}

interface ProjectFullCardProps {
  project: Project;
  facts: ReturnType<typeof buildProjectCardFacts>;
  domainRows: DomainCompositionRow[];
  docPath: string | undefined;
  t: SelectorTranslator;
}

function ProjectFullCard({ project, facts, domainRows, docPath, t }: ProjectFullCardProps) {
  const maxTotal = Math.max(1, ...domainRows.map((row) => row.total));
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    <article
      data-testid="project-selector-card"
      className="rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-6 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2),0_14px_34px_var(--color-shadow-a16)] transition-colors hover:border-[color:var(--color-border-strong)]"
    >
      <div className="flex items-start gap-3.5">
        <TopologyV2KindGlyph kind="project" size={26} className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[19px] font-semibold tracking-[-0.012em] text-[color:var(--color-text-primary)]">
            {project.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-[color:var(--color-text-tertiary)]">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
            <span>{t("cardUpdatedPrefix")} {ago}</span>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <span className="min-w-0 truncate">
              {project.description || t("cardDescriptionFallback")}
            </span>
          </div>
        </div>
        <span className="mt-1.5 shrink-0 font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
          {project.slug}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-5 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-panel-metric-surface,var(--color-overlay-1))] px-4 py-2.5 text-[12.5px]">
        <FactItem label={t("factDomain")} value={facts.domain} />
        <FactItem label={t("factCapability")} value={facts.capability} />
        <FactItem label={t("factElement")} value={facts.element} />
        <FactItem label={t("factDocument")} value={facts.document} />
        <FactItem label={t("factRelations")} value={facts.relations} />
      </div>

      {domainRows.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {domainRows.map((row, index) => (
            <div key={row.domainId} className="flex items-center gap-3 sm:gap-4">
              <span className="flex w-[84px] min-w-0 shrink-0 items-center gap-2 truncate text-[12.5px] text-[color:var(--color-text-secondary)] sm:w-[200px] md:w-[280px]">
                <TopologyV2KindGlyph kind="domain" size={14} />
                {row.title}
              </span>
              <span className="h-1 min-w-0 max-w-[640px] flex-1 overflow-hidden rounded-full bg-[color:var(--color-border-soft)]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((row.total / maxTotal) * 100)}%`,
                    backgroundColor: index === 0 ? "var(--color-indigo-brand)" : "var(--color-border-strong)",
                  }}
                />
              </span>
              <span
                title={t("domainRowSummary", {
                  total: row.total,
                  cap: row.capabilityCount,
                  el: row.elementCount,
                })}
                className={`max-w-[120px] shrink truncate text-right text-[10.5px] sm:max-w-none sm:shrink-0 sm:whitespace-nowrap ${numeralClass}`}
              >
                {t("domainRowSummary", {
                  total: row.total,
                  cap: row.capabilityCount,
                  el: row.elementCount,
                })}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-divider)] pt-2 text-[12.5px] text-[color:var(--color-text-tertiary)]">
        <Link
          href={getProjectDetailHref(project.slug)}
          prefetch={false}
          aria-label={t("cardDetailAriaLabel", { name: project.name })}
          className="inline-flex h-8 items-center text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          {t("footDetail")}
        </Link>
        <Link
          href={getTopologyProjectHref(project.slug)}
          prefetch={false}
          className="inline-flex h-8 items-center text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          {t("footTopologyView")}
        </Link>
        <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
          {t("footUpdated", {
            date: formatDateStamp(project.updatedAt),
            path: docPath ?? project.slug,
          })}
        </span>
      </div>
    </article>
  );
}

function FactItem({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-[color:var(--color-text-tertiary)]">{label}</span>{" "}
      <b className={numeralClass}>{value}</b>
    </span>
  );
}
