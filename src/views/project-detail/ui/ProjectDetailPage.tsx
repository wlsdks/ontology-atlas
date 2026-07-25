"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, Waypoints } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { formatDate } from "@/shared/lib/format-date";
import { MOTION } from "@/shared/motion";
import {
  Button,
  EmptyState,
  InlineEditable,
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
  useToast,
} from "@/shared/ui";
import {
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getTopologyProjectHref,
  type Project,
} from "@/entities/project";
import { useProjects, useProjectMutations, useProjectBody } from "@/features/project-data-source";
import { VaultConflictError } from "@/features/docs-vault-local";
import { useOntologyInsight } from "@/features/vault-ontology";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useTaxonomy } from "@/features/taxonomy";
import { ProjectQuickEditPanel } from "@/features/project-quick-edit";
import { resolveSubscribeUpdate } from "../model/resolve-subscribe-update";
import { buildProjectOntologyMetrics } from "../model/project-ontology-metrics";
import { buildProjectDomainComposition } from "../model/domain-composition";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "../model/connected-projects";
import { buildAgentHandoffSnippet } from "../model/agent-handoff-snippet";
import { shortenDomainTitle } from "../model/short-domain-title";
import { MiniDomainMap } from "./MiniDomainMap";
import { DomainCompositionGrid } from "./DomainCompositionGrid";

const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);

interface Props {
  slug: string;
  initialProject?: Project | null;
  initialRelated?: Project[];
}

function ProjectDetailShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      {/* 하단 예약고는 base pb + lg:pb 오버라이드 — `max-lg:pb-[...]` 는
          `md:py-14` 보다 스타일시트 앞에 emit 되어 768–1023 에서 조용히 패배,
          콘텐츠 끝이 탭바 top(967)과 1px 차로 맞닿았다(768×1024 실측 968.1).
          변형 순서에 기대지 않는 결정론적 구성으로 교체 (빌더 main 과 동일
          처방, 겹침 소탕 2026-07-23). */}
      <main id="main" className="topology-ui-scale min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] md:px-10 md:pt-14 lg:pb-[max(3.5rem,env(safe-area-inset-bottom))] xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={MOTION.slow}
          className="mx-auto w-full max-w-[var(--page-max)]"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function ProjectDetailTopBar({
  slug,
  projectName,
  census,
}: {
  slug?: string;
  projectName?: string | null;
  census?: { concepts: number; relations: number } | null;
}) {
  const t = useTranslations("projectPages.detail");
  const workspaceHref = '/';
  const projectsListHref = '/projects/';
  const docsVaultHref = '/docs/';
  return (
    <nav className="flex flex-wrap items-center gap-3">
      <Link
        href={workspaceHref}
        className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        aria-label={t("topBarBackToWorkspaceAria")}
      >
        <ArrowLeft size={14} />
        {t("topBarWorkspaceFallback")}
      </Link>
      <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <Link
        href={projectsListHref}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        {t("topBarProjectsLabel")}
      </Link>
      <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <span className="max-w-[240px] truncate font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-primary)]">
        {projectName ?? slug ?? t("topBarProjectFallback")}
      </span>

      <div className="ml-auto hidden items-center gap-2 sm:flex">
        <Link href={docsVaultHref} data-testid="project-detail-docs-vault-link">
          <Button type="button" variant="ghost" size="sm">
            <BookOpen size={14} aria-hidden="true" />
            {t("topBarDocsVault")}
          </Button>
        </Link>
        {slug ? (
          <CopyProjectLinkButton slug={slug} testId="project-detail-copy-link" className="h-10 justify-center" />
        ) : null}
        {census ? (
          <span
            data-testid="project-detail-global-census"
            className="hidden font-mono text-[11px] tracking-[0.08em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)] md:inline"
          >
            {t("globalCensus", { concepts: census.concepts, relations: census.relations })}
          </span>
        ) : null}
      </div>
    </nav>
  );
}

function ProjectDetailState({
  title,
  description,
  testId,
  slug,
}: {
  title: string;
  description: string;
  testId: string;
  slug?: string;
}) {
  const t = useTranslations("projectPages.detail");
  return (
    <ProjectDetailShell>
      <ProjectDetailTopBar slug={slug} />
      <section className="mt-16 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-8 py-10">
        <p
          data-testid={testId}
          className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]"
        >
          {title}
        </p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={'/'}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a10)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:var(--color-indigo-a16)]"
          >
            <ArrowLeft size={14} />
            {t("stateBackToWorkspace")}
          </Link>
        </div>
      </section>
    </ProjectDetailShell>
  );
}

export function ProjectDetailPage({
  slug,
  initialProject = null,
  initialRelated = [],
}: Props) {
  const t = useTranslations("projectPages.detail");
  const router = useRouter();
  const { show: showToast } = useToast();
  const [project, setProject] = useState<Project | null>(
    initialProject,
  );
  const [related, setRelated] = useState<Project[]>(
    initialRelated,
  );
  const [resolved, setResolved] = useState(
    !slug || Boolean(initialProject),
  );
  const { statusLabel: rawStatusLabel } = useTaxonomy();
  // R15 (Concern 1) — derive 가 honest 가 되어 frontmatter 누락 시 undefined.
  // 'active' 는 form-local fallback (to-input.ts) 이라 legacy id 그대로
  // 유지 — 친화 라벨로 변환.
  const statusLabel = (id: string | undefined): string =>
    id === "active" ? t("statusActive") : rawStatusLabel(id);

  // 상세에서 Cmd+K · ? 는 모두 현재 페이지 내 오버레이로 열린다 — 홈으로
  // 튕기면 오버레이가 사라져 \"지금 여기\" 맥락을 잃기 때문.
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useTypingShortcuts([
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
    {
      combo: { key: "?" },
      onFire: () => setShortcutsOpen((v) => !v),
    },
  ]);
  const handleSearchSelect = useCallback(
    (nextSlug: string) => {
      setSearchOpen(false);
      if (nextSlug === slug) return;
      router.push(getProjectRuntimeDetailHref(nextSlug));
    },
    [router, slug],
  );

  // 클라이언트 사이드 동적 타이틀. 정적 export metadata 는 slug 단위로
  // 미리 빌드되지만 사용자 컨텍스트 (project.name) 는 클라이언트에서만.
  useDocumentTitle(
    Array.from(
      new Set(
        [project?.name, t("documentTitleSuffix")].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ).join(" · ") || null,
  );

  // mode-aware projects read — vault (local) 또는 빌드타임 dogfood (static).
  // 단일 hook 이 항상 최신 snapshot 을 들고 있어 list/subscribe race 없음.
  const projectsQuery = useProjects();
  const projectMutations = useProjectMutations();
  // 본문(project.md) lazy load — R+ "본문이 절대 표시되지 않음" 정정.
  // project.detail 은 에디터 폼의 별도 frontmatter `detail:` 필드라 대부분의
  // 실제 vault 문서엔 없다 — 진짜 본문은 vault 파일에서 별도로 읽어야 한다.
  // fallback 순서: 명시적 detail 필드 > 실제 project.md 본문.
  const { body: vaultBody } = useProjectBody(project?.slug ?? null);
  const bodyContent = project?.detail ?? vaultBody ?? null;
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // #74 — 정적 모드 fallback 이 `SEED_PROJECTS` 15건을 들고 있었는데, 그 내용이
    // Firebase Hosting · Sigma/WebGL · 화이트리스트 어드민처럼 **이미 제거된
    // 기능을 사실처럼** 서술했다. 게다가 `/project/[slug]` 라우트는 vault 에서
    // 생성되므로 그 slug 들은 애초에 도달 불가였다 — 없는 제품을 설명하는
    // 도달 불가 데이터라 삭제했다. 프로젝트가 없으면 아래 not-found 상태가
    // 정직하게 그 사실을 말한다.
    const { next, related: nextRelated } = resolveSubscribeUpdate(
      projectsQuery.projects,
      slug,
    );
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (next) {
        setProject(next);
      } else if (projectsQuery.loaded || projectsQuery.error !== null) {
        // local source가 확정됐는데 slug가 없으면 canonical static fact를
        // 잔존시키지 않는다. 같은 slug라도 현재 vault가 유일한 진실원이다.
        setProject(null);
      }
      setRelated(nextRelated);
      if (projectsQuery.loaded || projectsQuery.error !== null) setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    projectsQuery.projects,
    projectsQuery.loaded,
    projectsQuery.error,
    slug,
  ]);

  // 이 프로젝트의 ontology 노드/관계 — 히어로 메트릭 스트립·미니 도메인
  // 지도·도메인 구성 3×2·연결된 프로젝트(relates) 가 전부 여기서 파생.
  // vault(local) > 빌드타임 dogfood(static) 우선순위는 useOntologyInsight
  // 가 이미 처리 — mode 분기는 이 컴포넌트가 신경 쓸 필요 없음.
  const { insight } = useOntologyInsight();
  const insightNodes = insight?.nodes ?? [];
  const insightEdges = insight?.edges ?? [];

  const handoffCopy = useCopyFeedback();

  if (!slug) {
    return (
      <ProjectDetailState
        testId="project-detail-invalid"
        title={t("stateInvalidTitle")}
        description={t("stateInvalidDesc")}
        slug={slug}
      />
    );
  }

  if (!project) {
    if (!resolved) {
      return (
        <ProjectDetailState
          testId="project-detail-loading"
          title={t("stateLoadingTitle")}
          description={t("stateLoadingDesc")}
          slug={slug}
        />
      );
    }

    return (
        <ProjectDetailState
          testId="project-detail-not-found"
          title={t("stateNotFoundTitle")}
          description={t("stateNotFoundDesc")}
          slug={slug}
        />
      );
  }

  const metrics = buildProjectOntologyMetrics(insightNodes, insightEdges, project.slug);
  const domainComposition = buildProjectDomainComposition(insightNodes, insightEdges, project.slug);
  const relatesGraphSlugs = findRelatesGraphProjectSlugs(insightNodes, insightEdges, project.slug);
  const connectedProjects = buildConnectedProjects(project, related, relatesGraphSlugs);
  const handoffSnippet = buildAgentHandoffSnippet(project.slug);
  const miniMapDomains = domainComposition.domains.map((domain) => ({
    id: domain.id,
    title: shortenDomainTitle(domain.title),
    total: domain.total,
  }));

  const canManageProject = projectMutations.canEdit;
  const projectSaveErrorMessage = (err: unknown) =>
    err instanceof VaultConflictError
      ? t("saveErrorConflict")
      : err instanceof Error
        ? err.message
        : t("saveErrorGeneric");
  const saveProjectField = async (
    field: "name" | "description",
    next: string,
  ) => {
    if (!project || !canManageProject) return;
    try {
      await projectMutations.patchProject(
        project.slug,
        field === "name"
          ? { name: next }
          : { description: next.trim() ? next : null },
      );
      showToast(field === "name" ? t("saveSuccessName") : t("saveSuccessDescription"), "success");
    } catch (err) {
      const message = projectSaveErrorMessage(err);
      showToast(t("saveErrorPrefix", { message }), "error");
      throw err;
    }
  };

  // statusLabel(undefined) 는 "—" 를 반환(placeholder 의미 명시) — truthy 라
  // .filter(Boolean) 로 안 걸러진다. project.status 자체가 있을 때만 라인에
  // 넣어야 "개별 프로젝트 · —" 같은 대시 콜리전이 안 생긴다.
  const heroMeta = [
    project.isHub ? t("heroLabelHub") : t("heroLabel"),
    project.status ? statusLabel(project.status) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const storyMarkdownClassName =
    "text-[13.5px] leading-[1.75] text-[color:var(--color-text-secondary)] [&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--color-indigo-hover)] [&_code]:rounded [&_code]:border [&_code]:border-[color:var(--color-border-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-[color:var(--color-text-tertiary)] [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-[var(--font-weight-signature)] [&_h1]:text-[color:var(--color-text-primary)] [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-[var(--font-weight-signature)] [&_h2]:text-[color:var(--color-text-primary)] [&_h3]:mt-4 [&_h3]:text-base [&_h3]:text-[color:var(--color-text-primary)] [&_li]:ml-[18px] [&_li]:mb-[5px] [&_li]:list-disc [&_p]:mb-[10px] [&_strong]:font-semibold [&_strong]:text-[color:var(--color-text-primary)]";
  const projectFullEditHref = getProjectEditHref(project.slug, {
    returnTo: getProjectRuntimeDetailHref(project.slug),
  });

  const metricItems: Array<{ label: string; value: number }> = [
    { label: t("metricDomains"), value: metrics.domains },
    { label: t("metricCapabilities"), value: metrics.capabilities },
    { label: t("metricElements"), value: metrics.elements },
    { label: t("metricDocuments"), value: metrics.documents },
    { label: t("metricRelations"), value: metrics.relations },
  ];

  const handleCopyHandoff = () => {
    void handoffCopy.copy(handoffSnippet);
  };
  const handoffCopyLabel =
    handoffCopy.state === "copied"
      ? t("handoffCopiedLabel")
      : handoffCopy.state === "failed"
        ? t("handoffCopyErrorLabel")
        : t("handoffCopyLabel");

  return (
    <ProjectDetailShell>
      <ProjectDetailTopBar
        slug={slug}
        projectName={project.name}
        census={{ concepts: insightNodes.length, relations: insightEdges.length }}
      />

      {/* zone 1 — hero band: 글리프+타이틀+설명 + 음각 메트릭 스트립 + 정직한
          미니 도메인 지도(실카운트 비례) + topology/편집 액션. */}
      <header className="mt-6 flex flex-col gap-6 rounded-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[18px_20px] shadow-[inset_0_1px_0_var(--color-overlay-1)] lg:flex-row lg:items-stretch lg:gap-[30px] lg:p-[18px_26px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-start gap-3.5 sm:flex-nowrap">
            <TopologyV2KindGlyph kind="project" size={30} className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <InlineEditable
                as="h1"
                value={project.name}
                editable={canManageProject}
                onSave={(next) => saveProjectField("name", next)}
                ariaLabel={t("inlineNameAria")}
                className="text-[27px] leading-[1.05] font-[650] tracking-[-0.015em] text-pretty text-[color:var(--color-text-primary)]"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[color:var(--color-text-tertiary)]">
                <span>{heroMeta}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                <span>{t("heroUpdatedAt", { date: formatDate(project.updatedAt) })}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                <InlineEditable
                  as="span"
                  multiline
                  value={project.description}
                  editable={canManageProject}
                  onSave={(next) => saveProjectField("description", next)}
                  ariaLabel={t("inlineDescriptionAria")}
                  placeholder={t("inlineDescriptionPlaceholder")}
                  dataTestId="project-detail-description"
                  className="min-w-0"
                />
              </div>
            </div>
            {/* flex-none 은 읽기전용 배지(+액션)가 390px 뷰포트를 밀어내는
                가로 overflow 를 만들었다 — min-w-0 수축 허용 + wrap. */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
              <Link href={getTopologyProjectHref(project.slug)} data-testid="project-detail-topology-link">
                <Button type="button" variant="outline" size="sm">
                  {t("topBarTopologyView")}
                </Button>
              </Link>
              {canManageProject ? (
                <ProjectQuickEditPanel project={project} settingsHref={projectFullEditHref} />
              ) : (
                // [P-7] vault 미선택(static/dogfood) 상태엔 편집 진입점이
                // 전무해 "왜 안 되는지" 안내가 없었다 — 왜 + 다음 행동을
                // 한 줄로 밝히는 배지. 액션은 아니고 상태 typed fact.
                <span
                  data-testid="project-detail-readonly-badge"
                  // flex-none 은 390px 에서 페이지 가로 overflow 를 만들었다
                  // (overflow-sweep 회귀) — 좁으면 배지 텍스트가 줄바꿈된다.
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[color:var(--color-text-tertiary)]"
                >
                  {t("readOnlyBadge")}
                </span>
              )}
            </div>
          </div>

          {/* #10 — 통계는 거대한 숫자 대신 조용한 칩. 라벨+값이 한 줄로 붙어
              스캔은 쉽되 본문·타이틀의 주목도를 빼앗지 않는다. */}
          <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[color:var(--color-border-soft)] pt-3.5">
            {metricItems.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1"
              >
                <span className="text-caption uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  {item.label}
                </span>
                <span className="font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]">
                  {item.value}
                </span>
              </span>
            ))}
          </div>
        </div>

        {domainComposition.domains.length > 0 ? (
          <div className="flex flex-none flex-col border-t border-[color:var(--color-divider)] pt-4 lg:w-[380px] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <div className="flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              <span>{t("minimapLabel")}</span>
              <span className="normal-case tracking-[0.04em]">{t("minimapSublabel")}</span>
              <Link
                href={getTopologyProjectHref(project.slug)}
                className="ml-auto shrink-0 normal-case tracking-[0.04em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
              >
                {t("minimapOpenInTopology")}
              </Link>
            </div>
            <MiniDomainMap
              projectTitle={project.name}
              domains={miniMapDomains}
              ariaLabel={t("minimapAria", { domains: metrics.domains, relations: metrics.relations })}
            />
          </div>
        ) : null}
      </header>

      {/* zone 2 — 도메인 구성 3×N: 각 카드는 topology focus 로 이동. 도메인이
          0개면(=온톨로지 미기재) 통째로 숨김 — 매치 0 자동 숨김 원칙. */}
      {domainComposition.domains.length > 0 ? (
        <section className="mt-[var(--section-gap)]">
          <div className="mb-3 flex items-center gap-2.5">
            <TopologyV2TraceMark containment />
            <span className="text-[14px] font-[560] tracking-[-0.01em] text-[color:var(--color-text-primary)]">
              {t("domainSectionTitle")}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t("domainSectionRelation")}
            </span>
            <span
              data-token="engraved-numeral"
              className="ml-auto font-mono text-[12.5px] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {domainComposition.domains.length}
            </span>
          </div>
          <DomainCompositionGrid
            domains={domainComposition.domains}
            maxTotal={domainComposition.maxTotal}
            capabilityLabel={t("domainCapabilityLabel")}
            elementLabel={t("domainElementLabel")}
            moreLine={(elements, more) =>
              more > 0
                ? t("domainMoreLine", { elements, more })
                : t("domainMoreLineElementsOnly", { elements })
            }
          />
        </section>
      ) : null}

      {/* zone 3 — 본문(project.md) + 요약 레일(연결된 프로젝트 · 에이전트
          핸드오프). Connection map 제거(c84ecb25e) 이후의 left-column-void
          결함은 이 3존 재배치로 구조적으로 해소된다 — 좌측이 항상 도메인
          구성/본문으로 채워진다. */}
      <section className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-[var(--card-gap)] lg:grid-cols-[minmax(0,1fr)_400px]">
        <article className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-[13px] font-[560] text-[color:var(--color-text-primary)]">
              {t("bodyCardTitle")}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t("bodyCardGcap")}
            </span>
          </div>
          {bodyContent ? (
            // #10 — 본문은 읽기 좋은 가로폭(measure)으로 제한한다.
            <div
              className={`${storyMarkdownClassName} max-w-[68ch]`}
              data-testid="project-detail-body-content"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyContent}</ReactMarkdown>
            </div>
          ) : (
            <div data-testid="project-detail-body-empty">
              <EmptyState
                size="compact"
                icon={<FileText size={16} aria-hidden />}
                title={t("bodyEmptyHint")}
              />
            </div>
          )}
        </article>

        <aside className="flex flex-col gap-[var(--card-gap)]">
          <section className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]">
            <div className="mb-2.5 flex items-baseline gap-2">
              <TopologyV2TraceMark containment={false} />
              <span className="text-[13px] font-[560] text-[color:var(--color-text-primary)]">
                {t("connectedTitle")}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("connectedRelation")}
              </span>
            </div>
            {connectedProjects.length > 0 ? (
              <div className="space-y-2.5">
                {connectedProjects.slice(0, 1).map((candidate) => (
                  <Link
                    key={candidate.slug}
                    href={getProjectRuntimeDetailHref(candidate.slug)}
                    className="group flex items-center justify-between gap-3 rounded-[9px] border border-[color:var(--color-border-soft)] px-3 py-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a28)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {candidate.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-[color:var(--color-text-tertiary)]">
                        {candidate.description || candidate.slug}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="font-mono text-[11px] text-[color:var(--color-text-quaternary)] transition-transform group-hover:translate-x-0.5"
                    >
                      ↗
                    </span>
                  </Link>
                ))}
                {connectedProjects.length > 1 ? (
                  <p className="text-xs text-[color:var(--color-text-tertiary)]">
                    {t("connectedMoreNote", { count: connectedProjects.length - 1 })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div data-testid="project-detail-connected-empty">
                <EmptyState
                  size="compact"
                  icon={<Waypoints size={16} aria-hidden />}
                  title={t("connectedEmpty")}
                  description={t("connectedEmptyHint")}
                />
              </div>
            )}
          </section>

          <section className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]">
            <div className="mb-2.5 flex items-baseline gap-2">
              <span className="text-[13px] font-[560] text-[color:var(--color-text-primary)]">
                {t("handoffTitle")}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("handoffGcap")}
              </span>
            </div>
            {/* insights 하단 핸드오프와 같은 패턴 — 코드 문자열은 사람 시선의
                attention winner 가 되지 않게 접어 숨기고(내용은 보존, 버튼이
                복사), 평문 캡션으로 "사람은 안 읽어도 됨 · AI 에이전트용"을
                명시한다. summary 가 접기/펼치기 토글 겸 캡션. */}
            <details className="mb-3">
              <summary className="cursor-pointer select-none text-[12px] leading-[1.6] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
                {t("handoffHumanCaption")}
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[11.5px] leading-[1.7] whitespace-pre-wrap text-[color:var(--color-text-quaternary)]">
                {handoffSnippet}
              </pre>
            </details>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyHandoff}>
              {handoffCopyLabel}
            </Button>
          </section>
        </aside>
      </section>

      <footer className="mt-[var(--section-gap)] border-t border-[color:var(--color-overlay-2)] pt-6 pb-[var(--page-bottom-breath)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          {t("footerSummary", { slug: project.slug, date: formatDate(project.updatedAt) })}
        </p>
      </footer>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={related}
        onSelect={handleSearchSelect}
        containerLabel={null}
      />
      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </ProjectDetailShell>
  );
}
