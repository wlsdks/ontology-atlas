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
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { formatDate } from "@/shared/lib/format-date";
import { buildContainmentParents } from "@/shared/lib/ontology-tree";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass } from "@/shared/ui/control-class";
import { HexMark } from "@/shared/ui/hex-mark";
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
const PAGE_MAX_WIDTH = 1600;

/*
 * ⚠️ **무게를 명시한다 — `<b>` 는 안 적으면 브라우저 기본 700 이다** (2026-08-05).
 * 700 은 이 저장소의 무게 램프(510/560/650) 밖이고, 형제인
 * `DomainCompositionGrid` 의 음각 숫자 `<b>` 는 이미 `strong`(650)이었다.
 * 값이 코드에 하나도 안 남는 결함이라 lint 도 소스 스캔도 못 본다 — 빌드된
 * 화면을 재서야 잡혔다.
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
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 bg-[color:var(--color-canvas)] max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)]">
        {/*
         * ⚠️ **실시간 표시를 여기서 뺐다** (2026-08-03, 소유자 지적).
         *
         * 「실시간 · 추적 중 · 변경 8」은 **지도의 물건**이다 — 무엇이 바뀌었는지
         * 를 노드 위에 그려 주기 때문에 거기서는 그 수가 다음 행동으로 이어진다.
         * 프로젝트 목록은 훑는 화면이라 그 수가 갈 곳이 없고, 대신 **화면에서
         * 가장 센 잉크를 우상단에서 가져가고** 자기 줄까지 예약해 아래 내용을
         * 통째로 밀어냈다(실측: lg+ 에서 이 줄의 유일한 내용이 그 칩이다).
         *
         * 그래서 줄 자체도 `lg:hidden` 이다 — 레일이 설정을 지는 폭에서는 이
         * 줄에 남는 것이 없고, 빈 줄이 자리를 지키면 그건 여백이 아니라 결함이다.
         */}
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-6 lg:hidden">
          <AppSettingsMenu mode={dataSourceMode} triggerVariant="chrome-tile" />
        </div>
        <div className="mx-auto px-5 py-6 md:px-10 md:py-10" style={{ maxWidth: PAGE_MAX_WIDTH }}>
        <nav className="mb-5 flex flex-wrap items-center gap-2.5 text-body text-[color:var(--color-text-tertiary)]">
          {/* 「← 지도」는 **지도로 간다**. 2026-07-30 에 `/` 가 지도에서 관문으로
              바뀐 뒤(원장 「root-first-open」 뒤집기) 이 링크만 안 고쳐져서,
              지도라고 적힌 버튼이 다운로드 화면으로 보내고 있었다. */}
          <Link
            href="/topology"
            data-testid="projects-back-to-map"
            className={controlClass({
              shape: "link",
              size: "lg",
              tone: "secondary",
              className: "touch-hit-expand hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {t("crumbBack")}
          </Link>
          <span aria-hidden className="text-[color:var(--color-text-quaternary)]">/</span>
          <span>{t("crumbCurrent")}</span>
          {/* 같은 화면 안에 폴더 전체 수(296·455)와 프로젝트 안쪽 수(442)가
              나란히 서 있다. 스코프를 말하지 않으면 둘 중 하나가 틀린 것처럼
              읽힌다 — 실제로는 세는 범위가 다를 뿐이다. */}
          <span className={`ml-auto text-label tracking-[var(--tracking-caps-08)] ${numeralClass}`}>
            <span className="mr-1.5 text-[color:var(--color-text-quaternary)]">
              {t("censusScopePrefix")}
            </span>
            {census.conceptCount} {t("censusTopConceptsLabel", { count: census.conceptCount })}
            <span aria-hidden className="mx-1.5 text-[color:var(--color-text-quaternary)]">·</span>
            {census.relationCount} {t("censusTopRelationsLabel", { count: census.relationCount })}
          </span>
        </nav>

        <header className="flex flex-wrap items-end gap-4">
          <h1 className="inline-flex items-center gap-2 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            <HexMark size={13} className="shrink-0 text-[color:var(--color-text-tertiary)]" />
            {t("headerTitle")}
          </h1>
          <span className="flex items-baseline gap-1.5 pb-[3px] text-label tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">
            <b className={numeralClass}>{census.projectCount}</b>{" "}
            {t("censusLineProjectLabel", { count: census.projectCount })}
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span>
            <b className={numeralClass}>{census.domainCount}</b>{" "}
            {t("censusLineDomainsLabel", { count: census.domainCount })}
          </span>
          <Link
            href={newProjectHref}
            data-testid="project-selector-new-cta"
            className="ml-auto inline-flex h-9 items-center rounded-chip border border-[color:var(--color-indigo-a50)] bg-[color:var(--topology-v2-panel-action-surface,var(--color-indigo-a06))] px-4 text-body font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-overlay-2)]"
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
            {projects.map((project) => {
              // 문서 역참조는 `findProjectDocInList` 한 곳만 쓴다 —
              // `VaultDoc.slug`(파일 경로)와 `Project.slug`(frontmatter)를
              // 직접 비교하면 frontmatter 로 slug 를 명시한 프로젝트를 못
              // 찾아, 카드만 "설명 없음" 으로 거짓말하게 된다.
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
          {/* 사람-우선: 첫 줄은 평문 인간 경로(위 「새 프로젝트」 버튼). 아래
              두 코드 칩은 개발자·에이전트용 선택 경로로 명시 강등한다 — 삭제
              아님(코드 문자열 자체는 보존). */}
          <p className="mt-3 max-w-[640px] text-body leading-6 text-[color:var(--color-text-secondary)]">
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
            {/* CLI 줄이 `$ATLAS` 로 시작한다 — 채우는 법을 같은 자리에서
                말한다(`cli-invocation.ts` 의 계약). */}
            <p
              data-testid="project-selector-cli-placeholder-hint"
              className="mt-2 text-label leading-relaxed text-[color:var(--color-text-quaternary)]"
            >
              {t("cliPlaceholderHint")}
            </p>
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
   * (`resolveAuthoredDescription` 참고). */
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
          <h2 className="truncate text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
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
          {/* 막대 두 조각의 열쇠는 이 막대 묶음에 한 줄만 — 행마다 반복하면
              여섯 행 × 두 개로 열쇠가 소음이 된다. */}
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
