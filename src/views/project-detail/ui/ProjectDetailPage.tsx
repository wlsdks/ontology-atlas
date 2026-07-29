"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
// `useSearchParams` 는 locale-agnostic 이라 raw next/navigation 에서 가져온다
// (`architecture.md` i18n 라우팅 가드).
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, FileText, FolderSearch, Layers, Waypoints } from "lucide-react";
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
import { resolveProjectTagline } from "../model/project-tagline";
import { stripDuplicateHeading } from "../model/strip-duplicate-heading";
import { buildProjectOntologyMetrics } from "../model/project-ontology-metrics";
import { buildProjectDomainComposition } from "../model/domain-composition";
import { buildConnectedProjects, findRelatesGraphProjectSlugs } from "../model/connected-projects";
import { buildAgentHandoffSnippet } from "../model/agent-handoff-snippet";
import { shortenDomainTitle } from "../model/short-domain-title";
import { MiniDomainMap } from "./MiniDomainMap";
import { DomainCompositionGrid } from "./DomainCompositionGrid";
import { TabBar } from "@/shared/ui/tab-bar";
import {
  compositionTabCount,
  parseProjectDetailTab,
  serializeProjectDetailTab,
  type ProjectDetailTab,
} from "../lib/project-detail-tab";

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
          transition={MOTION.base}
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
    /* 구분자 `▸` 에 크기 클래스가 없으면 루트 16px 을 상속해 옆 링크(12.5px)·
       라벨(11px)보다 33~45% 크게 렌더된다 — 잉크가 데이터보다 무거워지는
       역전이다. 브레드크럼 전체를 타입 램프 토큰으로 못박고, 구분자는 가장
       조용한 단(`text-label`)에 둔다. */
    <nav className="flex flex-wrap items-center gap-3">
      <Link
        href={workspaceHref}
        className="inline-flex items-center gap-1.5 break-keep text-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        aria-label={t("topBarBackToWorkspaceAria")}
      >
        <ArrowLeft size={14} />
        {t("topBarWorkspaceFallback")}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <Link
        href={projectsListHref}
        className="font-mono text-label uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        {t("topBarProjectsLabel")}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ▸
      </span>
      <span className="max-w-[240px] truncate font-mono text-label uppercase tracking-[0.12em] text-[color:var(--color-text-primary)]">
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
            className="hidden font-mono text-label tracking-[0.08em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)] md:inline"
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
      {/*
        예전엔 이 자리에 전용 카드를 따로 짰다 — 폭 전체를 쓰는 큰 상자에 글이
        왼쪽 위에 몰려 허공이 대부분이었다. 이 앱엔 이미 "페이지 본문이 통째로
        비었을 때" 를 위해 만든 `EmptyState`(tone=solid + align=center)가 있는데
        이 화면만 그걸 안 썼다. 표면마다 빈 상태의 생김새가 다르면 그게 곧
        어긋남이다 — 공용 프리미티브로 되돌린다.
      */}
      <div className="mx-auto mt-16 w-full max-w-lg">
        <EmptyState
          titleAs="h1"
          tone="solid"
          align="center"
          icon={<FolderSearch size={16} aria-hidden />}
          title={<span data-testid={testId}>{title}</span>}
          description={description}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* 목록이 먼저다 — 여기 온 사람이 원하는 건 "다른 프로젝트 고르기" 다. */}
              <Link href={'/projects/'}>
                <Button type="button" variant="primary" size="sm">
                  {t("stateBackToWorkspace")}
                </Button>
              </Link>
              <Link href={'/'}>
                <Button type="button" variant="ghost" size="sm">
                  {t("stateBackToMap")}
                </Button>
              </Link>
            </div>
          }
        />
      </div>
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
  // 탭은 URL 에 산다 (#87) — 공유 가능하고 에이전트가 재현할 수 있어야 한다.
  // 숨은 상태로 두면 핸드오프 패킷에서 "어느 탭을 보던 중" 이 사라진다.
  const searchParams = useSearchParams();
  const activeTab = parseProjectDetailTab(searchParams.get("tab"));
  const selectTab = useCallback(
    (key: string) => {
      const next = serializeProjectDetailTab(key as ProjectDetailTab);
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("tab", next);
      else params.delete("tab");
      const query = params.toString();
      // `replace` — 탭 전환은 뒤로가기 이력을 쌓을 만한 이동이 아니다.
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router, searchParams],
  );
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
  // 히어로는 개관, 본문은 상세 — 발췌 원문을 그대로 흘리면 어절 한가운데서
  // 끊긴다(`project-tagline.ts` 참고). 편집 중이던 값이 있으면 그건 사용자
  // 입력이라 손대지 않는다.
  const heroTagline = resolveProjectTagline({ description: project.description });
  // 본문 맨 위 `# 프로젝트명` 은 히어로 제목과 같은 문장이다 — 파일 단독으로
  // 읽힐 땐 옳지만 이 화면에서는 같은 잉크를 두 번 쓰는 것이다.
  const dedupedBodyContent = stripDuplicateHeading(bodyContent, project.name);
  const heroMeta = [
    project.isHub ? t("heroLabelHub") : t("heroLabel"),
    project.status ? statusLabel(project.status) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  /*
    "그냥 글자 나열같다" 는 지적의 원인은 넷이었다: ① 문단 간격(10px)이 행간
    (23.6px)보다 좁아 문단 경계가 사라졌고 ② 헤딩에 아래 여백이 아예 없어
    제목이 뒤 문단에 달라붙었고 ③ 넓은 카드에 짧은 행이 걸려 읽는 눈이 갈
    곳을 잃었고 ④ 인용·코드블록·표에 스타일이 없어 전부 같은 회색 글이었다.

    위계는 **크기 도약이 아니라 무게(650) + 상하 공간(36/12)** 으로 만든다 —
    무채색 단일 인디고 헌장에서 크기를 키우는 건 값싼 해법이고, 새 램프 스텝을
    만들면 `TYPE_RAMP_STEPS` 등록 부채까지 생긴다. 여기 쓰인 값은 전부 기존
    램프 안이다.

    measure(70ch)는 한 행이 눈으로 좇을 수 있는 길이의 상한이다.
  */
  const storyMarkdownClassName =
    "text-body-lg leading-prose text-[color:var(--color-text-secondary)] [&>*:first-child]:mt-0 [&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--color-indigo-hover)] [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--color-border-strong)] [&_blockquote]:pl-3.5 [&_blockquote]:text-[color:var(--color-text-tertiary)] [&_code]:rounded [&_code]:border [&_code]:border-[color:var(--color-border-soft)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-[color:var(--color-text-tertiary)] [&_h1]:mt-9 [&_h1]:mb-3 [&_h1]:text-title [&_h1]:font-[650] [&_h1]:tracking-title [&_h1]:text-[color:var(--color-text-primary)] [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-title [&_h2]:font-[650] [&_h2]:tracking-title [&_h2]:text-[color:var(--color-text-primary)] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-body-lg [&_h3]:font-[650] [&_h3]:text-[color:var(--color-text-primary)] [&_hr]:my-7 [&_hr]:border-[color:var(--color-border-soft)] [&_li]:mb-1.5 [&_li]:list-disc [&_li]:pl-1 [&_li::marker]:text-[color:var(--color-text-quaternary)] [&_ol]:my-3 [&_ol]:pl-[22px] [&_p]:mb-3.5 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[var(--radius-card)] [&_pre]:border [&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-3.5 [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-body [&_strong]:font-semibold [&_strong]:text-[color:var(--color-text-primary)] [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-t [&_td]:border-[color:var(--color-divider)] [&_td]:py-2 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-mono [&_th]:text-caption [&_th]:uppercase [&_th]:tracking-caption [&_th]:text-[color:var(--color-text-quaternary)] [&_ul]:my-3 [&_ul]:pl-[22px]";
  const projectFullEditHref = getProjectEditHref(project.slug, {
    returnTo: getProjectRuntimeDetailHref(project.slug),
  });

  // 온톨로지 자체의 위계(도메인 ⊃ 역량 ⊃ 요소)만 칩으로 세운다.
  const primaryMetrics: Array<{ label: string; value: number }> = [
    { label: t("metricDomains"), value: metrics.domains },
    { label: t("metricCapabilities"), value: metrics.capabilities },
    { label: t("metricElements"), value: metrics.elements },
  ];
  // 메타 수치는 종류가 달라 같은 무게를 줄 이유가 없다 — 평문으로 내린다.
  const secondaryMetrics: Array<{ label: string; value: number }> = [
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
                className="text-[27px] leading-display-tight font-[650] tracking-[-0.015em] text-pretty text-[color:var(--color-text-primary)]"
              />
              {/*
                메타 행은 여기서 끝난다. 예전엔 설명이 이 점-행 **안으로**
                흘러들어, 문단 길이의 글이 13px tertiary 메타 취급을 받았다 —
                "답답하다" 는 인상의 절반이 그것이었다. 정의는 메타보다 중요하니
                한 단계 위 톤(secondary)으로 독립 블록에 둔다.
              */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[color:var(--color-text-tertiary)]">
                <span>{heroMeta}</span>
                <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
                  ·
                </span>
                <span>{t("heroUpdatedAt", { date: formatDate(project.updatedAt) })}</span>
              </div>
              <InlineEditable
                as="p"
                multiline
                value={heroTagline ?? project.description}
                editable={canManageProject}
                onSave={(next) => saveProjectField("description", next)}
                ariaLabel={t("inlineDescriptionAria")}
                placeholder={t("inlineDescriptionPlaceholder")}
                dataTestId="project-detail-description"
                className="mt-2.5 max-w-[64ch] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
              />
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

          {/*
            통계는 거대한 숫자 대신 조용한 칩 — 스캔은 쉽되 타이틀의 주목도를
            빼앗지 않는다. 다만 5개를 같은 무게로 두면 "다 중요하다 = 다 안
            중요하다" 가 된다. 온톨로지 자체의 위계(도메인 ⊃ 역량 ⊃ 요소)와
            메타 수치(문서·관계)는 다른 종류라, 앞 셋만 칩으로 남기고 뒤 둘은
            평문으로 강등했다.

            맨 앞의 스코프 캡션은 상단 census(볼트 전체)와의 혼동을 끊는다 —
            같은 화면에 440 과 453 이 함께 있으면 둘 중 하나가 틀린 것처럼
            읽힌다. 실제로는 스코프가 다를 뿐이다.

            `pb-5` 는 설명 블록과 이 구분선 사이의 숨 — 예전엔 0px 이라 글자
            바로 밑에 선이 붙어 있었다.
          */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[color:var(--color-border-soft)] pt-3.5">
            <span className="text-caption uppercase tracking-caption text-[color:var(--color-text-quaternary)]">
              {t("heroScopeCaption")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {primaryMetrics.map((item) => (
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
            <span className="ml-auto font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {secondaryMetrics
                .map((item) => `${item.label} ${item.value}`)
                .join(" · ")}
            </span>
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

      {/* 탭 (#87) — "정보 종류" 가 아니라 **답하는 질문**으로 가른다.
          개요 = 이게 무엇인가(본문) · 구성 = 무엇으로 이루어졌나.
          project.md 본문이 dogfood 기준 수천 px 라 한 스크롤에 같이 두면
          "무엇으로 이루어졌나" 를 스캔할 방법이 없었다(소유자: "스크롤로
          모든거 보여주려 안해도 되니까?").

          컴포넌트는 앱의 유일한 탭바(`shared/ui/tab-bar`)를 재사용한다 —
          인사이트·기록 증거 pane 과 같은 문법이라 새 관용구가 안 생긴다. */}
      <div className="mt-[var(--section-gap)]">
        <TabBar
          ariaLabel={t("tabs.ariaLabel")}
          activeKey={activeTab}
          onSelect={selectTab}
          items={[
            { key: "overview", label: t("tabs.overview") },
            {
              key: "composition",
              label: t("tabs.composition"),
              count: compositionTabCount(domainComposition.domains.length),
            },
          ]}
        />
      </div>

      {/* zone 3 — 본문(project.md) + 요약 레일(연결된 프로젝트 · 에이전트
          핸드오프). Connection map 제거(c84ecb25e) 이후의 left-column-void
          결함은 이 3존 재배치로 구조적으로 해소된다 — 좌측이 항상 도메인
          구성/본문으로 채워진다. */}
      {/* zone 3 — 좌: 본문(개요 탭 전용) / 우: 연결된 프로젝트 + 에이전트 핸드오프.
          **우측 레일은 탭 밖에 둔다** — 어느 탭에서 보든 유효한 cross-tab
          맥락이고, 특히 "연결된 프로젝트" 는 프로젝트 간 관계를 온톨로지로
          다루는 방향의 첫 표면이라 탭 뒤에 숨기면 안 된다(기록 목적지의
          좌/우 분할과 같은 문법). */}
      <section className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-[var(--card-gap)] lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* 좌측 = **탭 본문**. 구성을 별 섹션으로 두고 `hidden` 으로 감췄더니
            grid 첫 트랙이 `display:none` 으로 사라져 400px 우측 레일이 1fr
            트랙으로 당겨져 늘어났다(실측 결함). 좌측이 **항상 무언가를 그리면**
            트랙이 무너질 수 없다. */}
        {activeTab === "composition" ? (
          <section data-tab-panel="composition" className="min-w-0">
            {domainComposition.domains.length > 0 ? (
              /*
                섹션 헤더("도메인 구성 · 포함 · 6")를 뺐다. 탭 라벨이 이미
                "구성 6" 이라 제목도 카운트도 중복이었고, 좌측에만 33px 짜리
                헤더가 있으니 우측 레일 첫 카드와 시작 모서리가 어긋나 격자
                전체가 삐뚤어 보였다. 관계 종류("포함")는 카드가 글리프와
                계량으로 이미 말한다.
              */
              <>
                <DomainCompositionGrid
                  domains={domainComposition.domains}
                  maxTotal={domainComposition.maxTotal}
                  capabilityLabel={t("domainCapabilityLabel")}
                  elementLabel={t("domainElementLabel")}
                  moreLine={(more) => t("domainMoreLine", { more })}
                />
                {/* 히어로 칩(역량 38 · 요소 245)과 이 카드들의 합(40 · 279)이 한
                    화면에 같이 보이는데 왜 다른지는 아무 데도 없었다. 계산은
                    맞다 — 여러 도메인에 속한 개념을 도메인마다 세는 건 의도된
                    설계다. 각주는 **격자 아래**에 둔다: 위에 두면 좌측 트랙의
                    시작 모서리가 우측 레일 첫 카드와 어긋나(헤더를 뺀 이유와
                    같은 문제) 격자가 삐뚤어 보인다. */}
                <p
                  data-testid="project-detail-domain-overlap-note"
                  className="mt-3 text-caption text-[color:var(--color-text-quaternary)]"
                >
                  {t("domainOverlapNote")}
                </p>
              </>
            ) : (
              // 도메인 0이어도 탭은 남는다(공간 기억) — 대신 여기서 다음 걸음을 준다.
              <div data-testid="project-detail-composition-empty">
                <EmptyState
                  size="compact"
                  icon={<Layers size={16} aria-hidden />}
                  title={t("domainEmptyTitle")}
                  description={t("domainEmptyHint")}
                />
              </div>
            )}
          </section>
        ) : (
        <article
          data-tab-panel="overview"
          className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] shadow-[inset_0_1px_0_var(--color-overlay-1)] md:p-[16px_18px]"
        >
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
              className={`${storyMarkdownClassName} max-w-[var(--measure-prose)]`}
              data-testid="project-detail-body-content"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{dedupedBodyContent}</ReactMarkdown>
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
        )}

        {/* 우측 레일은 **탭 밖**이다 (#87) — 어느 탭에서 보든 유효한 맥락이고,
            "연결된 프로젝트" 는 프로젝트 간 관계를 온톨로지로 다루는 방향의
            첫 표면이라 탭 뒤에 숨기면 안 된다. */}
        <aside data-testid="project-detail-connected" className="flex flex-col gap-[var(--card-gap)]">
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
                    className="flex items-center gap-3 rounded-[9px] border border-[color:var(--color-border-soft)] px-3 py-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a28)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                  >
                    {/* 라벨 뒤 장식 화살표 금지 — 이 링크는 앱 안에서 이동한다
                        (`target="_blank"` 아님). `↗` 는 앱을 **떠나는** 링크의
                        선행 경고로만 쓰고, 누를 수 있다는 사실은 보더·hover 가
                        이미 말한다. 함께 있던 hover translate 도 정보가 없어
                        걷어냈다. */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {candidate.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-[color:var(--color-text-tertiary)]">
                        {candidate.description || candidate.slug}
                      </p>
                    </div>
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
            {/*
              이 카드가 실제로 하는 일은 "내 AI 에게 이 프로젝트를 이어서 읽힐
              시작 프롬프트 복사" 다. 그런데 이름이 "에이전트 핸드오프", 캡션이
              "사람은 안 읽어도 됩니다 — AI 에이전트용" 이었다. 소유자 판정:
              *"너무 AI같음"*. 둘 다 맞다 — 내부어인 데다, 부정 화법("안 읽어도
              됩니다")은 읽는 사람을 밀어내면서 정작 무엇을 하는 건지는 끝내
              말해주지 않는다.

              이제 순서가 설명 → 버튼 → (접힘)미리보기 다. 무엇을 하는지 먼저
              말하고, 코드는 보고 싶은 사람만 편다.
            */}
            <div className="mb-2">
              <span className="text-[13px] font-[560] text-[color:var(--color-text-primary)]">
                {t("handoffTitle")}
              </span>
            </div>
            <p className="mb-3 text-[12px] leading-body text-[color:var(--color-text-tertiary)]">
              {t("handoffDesc")}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleCopyHandoff}>
              {handoffCopyLabel}
            </Button>
            <details className="mt-3">
              <summary className="cursor-pointer select-none text-[12px] leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
                {t("handoffHumanCaption")}
              </summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[11.5px] leading-prose whitespace-pre-wrap text-[color:var(--color-text-quaternary)]">
                {handoffSnippet}
              </pre>
            </details>
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
