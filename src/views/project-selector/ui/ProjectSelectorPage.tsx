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
import { LiveActivityIndicator, useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { formatDate } from "@/shared/lib/format-date";
import { buildContainmentParents } from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { HexMark } from "@/shared/ui/hex-mark";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { DomainCapacityBar } from "@/widgets/domain-capacity-bar";
import { RecentNodeRow } from "@/widgets/recent-node-row";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { computeWorkspaceCensus } from "../lib/workspace-census";
import { buildProjectCardFacts } from "../lib/project-card-facts";
import { buildDomainCompositionRows, type DomainCompositionRow } from "../lib/domain-composition";
import { resolveProjectCardDescription } from "../lib/project-card-description";
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

export function ProjectSelectorPage() {
  const t = useTranslations("projectPages.selector");
  const kindLabel = useOntologyKindLabel();
  useDocumentTitle(t("documentTitle"));

  const { projects } = useProjects();
  const { insight } = useOntologyInsight();
  const docs = useVaultDocs();
  const vault = useLocalVault();
  const dataSourceMode = useDataSourceMode();

  // #15 설정 위치 통일 — 지도(HomePage)·인사이트와 동일하게 lg+ 는 나브레일
  // 하단 rail-tile 톱니가 설정을 연다. <lg 는 아래 상단 유틸 레인의
  // chrome-tile 이 담당(레일이 숨는 폭). 둘 다 uncontrolled.
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
    <div className="flex min-h-full w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <main id="main" className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6">
          <LiveActivityIndicator agentActivityStatus={vault.agentActivityStatus} />
          {/* #15 — 설정은 lg+ 에선 나브레일 하단 톱니. 레일이 숨는 <lg 에서만
              chrome-tile 로 노출. */}
          <div className="lg:hidden">
            <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
          </div>
        </div>
        <div className="mx-auto px-5 py-6 md:px-10 md:py-10" style={{ maxWidth: PAGE_MAX_WIDTH }}>
        <nav className="mb-5 flex flex-wrap items-center gap-2.5 text-body text-[color:var(--color-text-tertiary)]">
          <Link
            href="/"
            className="text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("crumbBack")}
          </Link>
          <span aria-hidden className="text-[color:var(--color-text-quaternary)]">/</span>
          <span>{t("crumbCurrent")}</span>
          <span className={`ml-auto text-label tracking-[0.08em] ${numeralClass}`}>
            {census.conceptCount} {t("censusTopConceptsLabel")}
            <span aria-hidden className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
            {census.relationCount} {t("censusTopRelationsLabel")}
          </span>
        </nav>

        <header className="flex flex-wrap items-end gap-4">
          <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[-0.015em] text-[color:var(--color-text-primary)]">
            <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
            {t("headerTitle")}
          </h1>
          <span className="flex items-baseline gap-1.5 pb-[3px] text-label tracking-[0.06em] text-[color:var(--color-text-tertiary)]">
            <b className={numeralClass}>{census.projectCount}</b> {t("censusLineProjectLabel")}
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <b className={numeralClass}>{census.domainCount}</b> {t("censusLineDomainsLabel")}
          </span>
          <Link
            href={newProjectHref}
            data-testid="project-selector-new-cta"
            className="ml-auto inline-flex h-9 items-center rounded-md border border-[color:var(--color-indigo-a50)] bg-[color:var(--topology-v2-panel-action-surface,var(--color-indigo-a06))] px-4 text-body font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-2)]"
          >
            {t("ctaNewProject")}
          </Link>
        </header>
        <p className="mt-2 max-w-[720px] text-body leading-6 text-[color:var(--color-text-tertiary)]">
          {t("lede")}
        </p>

        {/* Toss P1 — 프로젝트 카드가 이 페이지의 1차 콘텐츠, 최근 활동은
            그 아래 보조 피드다. 이전엔 활동 피드가 카드보다 위에 있어
            초점이 경쟁했다(방문자가 찾는 건 "내 프로젝트들"이지 "최근 어떤
            문서가 바뀌었나"가 아니다). */}
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
                description={resolveProjectCardDescription(docs.find((d) => d.slug === project.slug))}
                docPath={docs.find((d) => d.slug === project.slug)?.path}
                kindLabel={kindLabel}
                t={t}
              />
            ))}
          </div>
        ) : (
          <p className="mt-7 text-body text-[color:var(--color-text-tertiary)]">
            {t("emptyStateDesc")}
          </p>
        )}

        {recentActivityRows.length > 0 ? (
          <section className="mt-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-body-lg font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
                {t("activityHeading")}
              </span>
              <span className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
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
            <h3 className="text-body-lg font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {t("nextSlotTitle")}
            </h3>
            <span className="text-body text-[color:var(--color-text-tertiary)]">
              {t("nextSlotSub")}
            </span>
          </div>
          {/* 사람-우선: 첫 줄은 평문 인간 경로(위 「새 프로젝트」 버튼). 아래
              두 코드 칩은 개발자·에이전트용 선택 경로로 명시 강등한다 — 삭제
              아님(코드 문자열 자체는 보존). */}
          <p className="mt-3 max-w-[640px] text-body leading-6 text-[color:var(--color-text-secondary)]">
            {t("nextSlotHumanLead")}
          </p>
          <div className="mt-3 border-t border-[color:var(--color-divider)] pt-3">
            <span className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("nextSlotCodeChipsCaption")}
            </span>
            <div className="mt-2 flex items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-body text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
              <span className="w-[108px] shrink-0 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
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
              <span className="w-[108px] shrink-0 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t("nextSlotAgentLabel")}
              </span>
              <code className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-secondary)]">
                {t("nextSlotAgentCommand")}
              </code>
              <span className="ml-auto hidden shrink-0 whitespace-nowrap font-mono text-label text-[color:var(--color-text-tertiary)] sm:inline">
                {t("nextSlotAgentCaption")}
              </span>
            </div>
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
  /** Toss P2 — 사용자가 frontmatter `description:` 에 직접 쓴 한 줄만.
   * `Project.description` (엔티티 레이어)은 없으면 body 발췌로 fallback 하는데,
   * 그 발췌가 내부 포지셔닝 카피일 수 있어 카드에는 절대 쓰지 않는다
   * (`resolveProjectCardDescription` 참고). */
  description: string | null;
  docPath: string | undefined;
  kindLabel: (kind: string) => string;
  t: SelectorTranslator;
}

function ProjectFullCard({ project, facts, domainRows, description, docPath, kindLabel, t }: ProjectFullCardProps) {
  const maxTotal = Math.max(1, ...domainRows.map((row) => row.total));
  const ago = formatAgo(resolveRecentActivityAgo(project.updatedAt, new Date()), t);

  return (
    <article
      data-testid="project-selector-card"
      className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-6 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2),0_14px_34px_var(--color-shadow-a16)] transition-colors hover:border-[color:var(--color-border-strong)]"
    >
      <div className="flex items-start gap-3.5">
        <TopologyV2KindGlyph kind="project" size={26} className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title font-semibold tracking-[-0.012em] text-[color:var(--color-text-primary)]">
            {project.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-body text-[color:var(--color-text-tertiary)]">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
            <span>{t("cardUpdatedPrefix")} {ago}</span>
          </div>
          <p className="mt-1.5 text-body leading-6 text-[color:var(--color-text-tertiary)] line-clamp-2">
            {description ?? t("cardDescriptionFallback")}
          </p>
        </div>
        <span className="mt-1.5 shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
          {project.slug}
        </span>
      </div>

      {/* 규모를 잘 말하는 역량·요소를 앞·크게, 도메인·문서·관계는 부수치로
          작게 — 색/토큰 변경 없이 크기·순서·캡션만 조정한다. */}
      <div className="mt-4 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-panel-metric-surface,var(--color-overlay-1))] px-4 py-2.5">
        <p className="mb-1.5 text-caption text-[color:var(--color-text-quaternary)]">
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
              maxTotal={maxTotal}
              labels={{ capabilityUnit: kindLabel("capability"), elementUnit: kindLabel("element") }}
              titleWidthClassName="sm:w-[200px] md:w-[280px]"
            />
          ))}
          {/* 바로 위 계량 띠는 38 역량 · 245 요소인데, 이 막대들의 행 합은
              40 · 279 다. 계산은 둘 다 맞다 — 여러 도메인에 속한 개념은 도메인
              마다 한 번씩 세어진다. 그 사실이 인사이트 구성 탭에만 적혀 있어
              여기서는 어긋난 수로만 보였다. 막대의 각주이므로 막대 아래에 둔다. */}
          <p
            data-testid="project-selector-domain-overlap-note"
            className="mt-1.5 text-caption text-[color:var(--color-text-quaternary)]"
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
        {/* 갱신 시각은 상단 「최근 갱신」으로 일원화 — 이 줄은 파일 경로
            브레드크럼으로 quaternary·caption 강등해 중복 경합을 없앤다. */}
        <span className="ml-auto whitespace-nowrap font-mono text-caption tracking-[0.04em] text-[color:var(--color-text-quaternary)]">
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
  // 강조치(역량·요소)는 숫자를 앞·크게 세워 규모를 먼저 읽히고, 부수치는
  // 작은 라벨 우선 배치로 낮춘다 — 크기/순서 차이만으로 위계.
  if (emphasis) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <b className={`${numeralClass} text-title leading-none`}>{value}</b>
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
