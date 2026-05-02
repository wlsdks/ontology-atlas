"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/cn";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { formatDate } from "@/shared/lib/format-date";
import { MOTION } from "@/shared/motion";
import {
  Button,
  ChipListEditor,
  DetailCard,
  InlineEditable,
  LinkListEditor,
  type LinkItem,
  useToast,
} from "@/shared/ui";
import {
  formatProjectIntegrityIssue,
  getProjectDetailHref,
  getProjectIntegrityIssues,
  getTopologyProjectHref,
  projectToInput,
  resolveFallbackProjects,
  wouldCreateDependencyCycle,
  type Project,
} from "@/entities/project";
import { useProjects, useProjectMutations } from "@/features/project-data-source";
import { useDataSourceMode } from "@/features/data-source-mode";
import { resolveSubscribeUpdate } from "../model/resolve-subscribe-update";
import { DependencyPicker } from "@/features/project-edit/ui/DependencyPicker";
import { CopyProjectLinkButton } from "@/features/project-share";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useTaxonomy } from "@/features/taxonomy";
import { ProjectKnowledgeTopology } from "@/widgets/project-knowledge-topology";
import { ProjectOntologyOverview } from "@/widgets/project-ontology-overview";

// Sigma 기반 로컬 토폴로지 — detail 페이지에서 1-hop 이웃 네트워크 를 역동적
// 으로 보여준다. dynamic import + ssr:false 로 WebGL SSR 문제 회피.
const SigmaTopology = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaTopology),
  { ssr: false },
);
import { ProjectQuickEditPanel } from "@/features/project-quick-edit";

const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
import {
  buildKnowledgeProjectEvidenceSummary,
  type KnowledgeProjectInsight,
} from "@/entities/knowledge-graph";

interface Props {
  slug: string;
  accountId?: string | null;
  initialProject?: Project | null;
  initialRelated?: Project[];
}

function ProjectDetailShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="min-h-screen bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:py-14 xl:px-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOTION.slow}
        className="mx-auto max-w-6xl"
      >
        {children}
      </motion.div>
    </main>
  );
}

function ProjectDetailBreadcrumb({
  slug,
  accountId,
  projectName,
}: {
  slug?: string;
  accountId?: string | null;
  projectName?: string | null;
}) {
  const t = useTranslations("projectPages.detail");
  // Workspace ▸ Project 3단 컨텍스트 표시. 사용자가 "여기는 1 프로젝트 안"
  // 이라는 걸 한눈에 파악하도록 홈의 워크스페이스 지도와 구분 시그널.
  const workspaceHref = accountId
    ? `/?account=${encodeURIComponent(accountId)}`
    : '/';
  const projectsListHref = accountId
    ? `/projects/?account=${encodeURIComponent(accountId)}`
    : '/projects/';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={workspaceHref}
        className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        aria-label={t("topBarBackToWorkspaceAria")}
      >
        <ArrowLeft size={14} />
        {accountId ?? t("topBarWorkspaceFallback")}
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
      {/* 모바일에서는 헤더 바로 아래 큰 액션 버튼이 따로 있어 중복.
          데스크톱(md+)에서만 breadcrumb 옆에 작은 액션으로 노출. */}
      <Link
        data-testid="project-detail-topology-link"
        href={slug ? getTopologyProjectHref(slug, accountId) : '/'}
        className="hidden md:inline-flex"
      >
        <Button type="button" variant="outline" size="sm">
          {t("topBarTopologyView")}
        </Button>
      </Link>
    </div>
  );
}

function ProjectDetailTopBar({
  slug,
  accountId,
  projectName,
  rightActions,
}: {
  slug?: string;
  accountId?: string | null;
  projectName?: string | null;
  rightActions?: React.ReactNode;
}) {
  const t = useTranslations("projectPages.detail");
  const docsVaultHref = accountId
    ? `/docs/?account=${encodeURIComponent(accountId)}`
    : '/docs/';
  return (
    <div className="flex items-start justify-between gap-4">
      <ProjectDetailBreadcrumb
        slug={slug}
        accountId={accountId}
        projectName={projectName}
      />
      <div className="flex items-center gap-2">
        <Link
          href={docsVaultHref}
          className="hidden md:inline-flex"
          data-testid="project-detail-docs-vault-link"
        >
          <Button type="button" variant="ghost" size="sm">
            <BookOpen size={14} aria-hidden="true" />
            {t("topBarDocsVault")}
          </Button>
        </Link>
        {rightActions}
        {slug ? (
          <CopyProjectLinkButton
            slug={slug}
            testId="project-detail-copy-link"
            className="hidden h-10 justify-center md:inline-flex"
          />
        ) : null}
      </div>
    </div>
  );
}

function ProjectDetailState({
  title,
  description,
  testId,
  slug,
  accountId,
}: {
  title: string;
  description: string;
  testId: string;
  slug?: string;
  accountId?: string | null;
}) {
  const t = useTranslations("projectPages.detail");
  return (
    <ProjectDetailShell>
      <ProjectDetailTopBar slug={slug} accountId={accountId} />
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
            href={accountId ? `/?account=${encodeURIComponent(accountId)}` : '/'}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.1)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)]"
          >
            <ArrowLeft size={14} />
            {t("stateBackToWorkspace")}
          </Link>
          {accountId ? (
            <Link
              href={"/projects/"}
              className="inline-flex h-9 items-center rounded-md border border-[color:var(--color-divider)] px-3 text-sm text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("stateProjectsList")}
            </Link>
          ) : null}
        </div>
      </section>
    </ProjectDetailShell>
  );
}

function resolveProjectMonogram(project: Project) {
  if (project.icon) return project.icon;

  const words = project.name.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const single = words[0];
    if (/^[A-Z0-9]{2,4}$/.test(single)) {
      return single;
    }
    return Array.from(single).slice(0, 2).join("").toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}

type DetailTranslator = ReturnType<typeof useTranslations<"projectPages.detail">>;

function resolveProjectConnectionSummary(
  project: Project,
  dependencyProjects: Project[],
  t: DetailTranslator,
) {
  if (dependencyProjects.length === 0) {
    return t("connectionSummaryStandalone", { name: project.name });
  }

  const visibleDependencies = dependencyProjects.slice(0, 2).map((item) => item.name);
  const remainder = dependencyProjects.length - visibleDependencies.length;
  const deps = visibleDependencies.join(", ");

  if (remainder > 0) {
    return t("connectionSummaryWithDepsRemainder", {
      name: project.name,
      deps,
      remainder,
    });
  }
  return t("connectionSummaryWithDeps", { name: project.name, deps });
}

export function ProjectDetailPage({
  slug,
  accountId: accountIdProp,
  initialProject = null,
  initialRelated = [],
}: Props) {
  const t = useTranslations("projectPages.detail");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 정적 export 에선 server component page.tsx 가 ?account 쿼리를 읽지 못해
  // prop 으로 accountId 를 넘기지 못한다. 클라이언트에서 URL 을 직접 읽어
  // 보강 — prop 이 명시되면 그 값을 우선.
  const accountId =
    accountIdProp ?? searchParams.get("account")?.trim() ?? null;
  const { show: showToast } = useToast();
  const fallbackProjects = useMemo(() => resolveFallbackProjects(), []);
  const fallbackProject = fallbackProjects.find((item) => item.slug === slug) ?? null;
  const [project, setProject] = useState<Project | null>(
    initialProject ?? fallbackProject,
  );
  const [related, setRelated] = useState<Project[]>(
    initialRelated.length > 0 ? initialRelated : fallbackProjects,
  );
  const [resolved, setResolved] = useState(
    !slug || Boolean(initialProject) || Boolean(fallbackProject),
  );
  const { categories, statuses, categoryLabel, statusLabel } = useTaxonomy();

  // 상세에서 Cmd+K · ? 는 모두 현재 페이지 내에서 오버레이로 열린다.
  // 비로그인 방문자는 `/`가 ServiceEntryLanding 이라 홈으로 튕기면 오버레이가
  // 사라지는 현상이 있었기 때문(T-11, T-16). 상세에서 바로 띄워야 "지금 여기"
  // 맥락을 유지한다.
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
      // P0-B Phase 6: getProjectDetailHref 가 ?account/?pj 자동 propagation.
      router.push(getProjectDetailHref(nextSlug, accountId));
    },
    [accountId, router, slug],
  );

  const [knowledgeInsight, setKnowledgeInsight] = useState<KnowledgeProjectInsight>({
    nodes: [],
    edges: [],
    meta: null,
  });
  const currentPath = useMemo(() => {
    const search = searchParams.toString();
    return `${pathname}${search ? `?${search}` : ""}`;
  }, [pathname, searchParams]);

  // P1-5 — 클라이언트 사이드 동적 타이틀. 정적 export metadata 가 slug
  // 단위까지 미리 빌드되지만 동적 컨텍스트는 빌드 시 모름.
  useDocumentTitle(
    Array.from(
      new Set(
        [project?.name, t("documentTitleSuffix")].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ).join(" · ") || null,
  );

  // mode-aware projects read — vault 또는 Firestore. 단일 hook 으로 단발 fetch
  // + 실시간 구독을 통합. (이전엔 listProjects + subscribeProjects 두 effect 가
  // race 했지만 hook 이 항상 최신 snapshot 을 들고 있어 race 자체가 사라짐.)
  const projectsQuery = useProjects(accountId);
  const dataSourceMode = useDataSourceMode();
  const projectMutations = useProjectMutations();
  useEffect(() => {
    if (!slug) return;
    const { next, related: nextRelated } = resolveSubscribeUpdate(
      projectsQuery.projects,
      slug,
      fallbackProjects,
    );
    if (next) setProject(next);
    setRelated(nextRelated);
    if (projectsQuery.loaded || projectsQuery.error !== null) setResolved(true);
  }, [projectsQuery.projects, projectsQuery.loaded, projectsQuery.error, slug, fallbackProjects]);

  // initial fetch — fallback 가 없는 경우 cloud 모드에서만 직접 getProject 로
  // 한 번 더 시도. local 모드에선 useProjects 가 vault manifest 를 sync 로
  // 들고 있어 별도 fetch 불필요. static 모드는 fallbackProjects 가 진실원이라
  // 추가 cloud 호출 자체가 firebase chunk 를 끌고 와 회귀를 만든다.
  useEffect(() => {
    if (!slug || fallbackProject || projectsQuery.mode !== 'cloud') return;
    let cancelled = false;
    void import('@/entities/project/api')
      .then(({ getProject }) => getProject(slug, accountId))
      .then((fetched) => {
        if (cancelled) return;
        if (fetched) setProject(fetched);
        setResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, fallbackProject, slug, projectsQuery.mode]);

  useEffect(() => {
    if (!slug) return;
    // mode-gate (Round 9a T0-2): cloud 모드일 때만 firestore 구독. local/static
    // 모드 사용자가 detail 페이지를 열 때 firebase JS chunk 가 열리고 listener
    // 가 트래픽을 만들던 회귀를 차단. (Round 1 leak gate 의 ProjectDetail 누락분.)
    if (dataSourceMode !== 'cloud') {
      setKnowledgeInsight({ nodes: [], edges: [], meta: null });
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import('@/entities/knowledge-graph/api').then((mod) => {
      if (cancelled) return;
      unsubscribe = mod.subscribeKnowledgeProjectInsight(
        slug,
        accountId,
        (nextInsight) => setKnowledgeInsight(nextInsight),
        (error) => {
          console.warn("[ProjectDetailPage] knowledge insight subscribe failed", error);
        },
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId, slug, dataSourceMode]);

  if (!slug) {
    return (
      <ProjectDetailState
        testId="project-detail-invalid"
        title={t("stateInvalidTitle")}
        description={t("stateInvalidDesc")}
        slug={slug}
        accountId={accountId}
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
          accountId={accountId}
        />
      );
    }

    return (
        <ProjectDetailState
          testId="project-detail-not-found"
          title={t("stateNotFoundTitle")}
          description={t("stateNotFoundDesc")}
          slug={slug}
          accountId={accountId}
        />
      );
  }

  const dependencyProjects = project.dependencies
    .map((dep) => related.find((p) => p.slug === dep))
    .filter((p): p is Project => !!p);
  const integrityIssues = getProjectIntegrityIssues(project, {
    allProjects: related,
    categoryIds: categories.map((category) => category.id),
    statusIds: statuses.map((status) => status.id),
  });
  const integrityIssueLabels = integrityIssues.map(formatProjectIntegrityIssue);
  const referencedBy = related.filter((p) => p.dependencies.includes(slug));
  const heroMonogram = resolveProjectMonogram(project);
  // status dot color → CSS 변수 매핑. 상태 칩 좌측에 작은 점으로 상태 인식
  // 속도 상향. 디자인 시스템 범위 내 (이미 사용 중인 success/warning/paused
  // 카라).
  const statusDotByTone: Record<string, string> = {
    success: 'var(--color-status-success, #78be96)',
    warning: 'var(--color-status-warning, #c8b482)',
    paused: 'var(--color-status-paused, #b496aa)',
    neutral: 'rgba(160, 170, 190, 0.75)',
  };
  const projectStatus = statuses.find((s) => s.id === project.status);
  const statusDot = projectStatus
    ? statusDotByTone[projectStatus.dotColor] ?? statusDotByTone.neutral
    : null;
  const heroMetaItems = [
    { label: t("metaStatus"), value: statusLabel(project.status), dot: statusDot },
    { label: t("metaOwner"), value: project.owner ?? t("ownerFallback"), dot: null },
    ...(project.progress !== undefined
      ? [{ label: t("metaProgress"), value: t("progressSuffix", { value: project.progress }), dot: null }]
      : []),
    { label: t("metaDependencies"), value: t("countSuffix", { count: dependencyProjects.length }), dot: null },
    { label: t("metaConnections"), value: t("countSuffix", { count: referencedBy.length }), dot: null },
  ];
  const heroSignals = [
    project.owner ? t("ownerWithName", { name: project.owner }) : t("ownerFallback"),
    project.progress !== undefined ? t("progressLabel", { value: project.progress }) : null,
    project.tags[0] ? t("tagLabel", { value: project.tags[0] }) : null,
    project.stack[0] ? t("stackLabel", { value: project.stack[0] }) : null,
  ]
    .filter(Boolean)
    .slice(0, 3);
  const connectionNote = resolveProjectConnectionSummary(project, dependencyProjects, t);
  const nextProjectCandidates = [...dependencyProjects, ...referencedBy].filter(
    (candidate, index, array) =>
      candidate.slug !== project.slug &&
      array.findIndex((item) => item.slug === candidate.slug) === index,
  );
  // 로컬 토폴로지용 프로젝트 집합 — 현재 프로젝트 + 1-hop 이웃. Sigma 가 받는
  // projects 배열은 dep 관계 그래프로 해석되므로 의존/참조 양방향 이웃을 모두
  // 포함해야 중앙 노드 주변에 선이 이어짐.
  const neighborsTopologyProjects = [project, ...nextProjectCandidates];
  const evidenceSummary = buildKnowledgeProjectEvidenceSummary(knowledgeInsight, {
    subjectName: project.name,
  });
  const insightDocumentNodes = evidenceSummary.documentNodes;
  const insightConceptNodes = evidenceSummary.conceptNodes;
  const insightEdgeLabels = evidenceSummary.edgeLabels;
  const ontologyReasonNote =
    evidenceSummary.summaryText ||
    (insightEdgeLabels.length > 0
      ? t("ontologyReasonEdges", { labels: insightEdgeLabels.slice(0, 2).join(" · ") })
      : insightConceptNodes.length > 0
        ? t("ontologyReasonConcepts", {
            names: insightConceptNodes.slice(0, 3).map((node) => node.title).join(" · "),
          })
        : insightDocumentNodes.length > 0
          ? t("ontologyReasonDocs", { count: insightDocumentNodes.length })
          : t("ontologyReasonEmpty"));
  const canManageProject = projectMutations.canEdit;
  // mode-aware persistence (Round 9a T0-1). 이전엔 cloud-only `upsertProject`
  // 을 직접 호출해 vault 모드에서 인라인 편집이 firestore 로 silently 흘러갔다
  // (편집 후 새로고침하면 사라지는 회귀). useProjectMutations 가 mode 에 따라
  // vault patch 또는 cloud upsert 로 분기.
  const persistProject = (input: Parameters<typeof projectMutations.updateProject>[0]) =>
    projectMutations.updateProject(input);
  const saveProjectField = async (
    field: "name" | "description",
    next: string,
  ) => {
    if (!project || !canManageProject) return;
    try {
      await persistProject({
        ...projectToInput(project),
        [field]: next,
        accountId: accountId ?? project.accountId ?? undefined,
      });
      showToast(field === "name" ? t("saveSuccessName") : t("saveSuccessDescription"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveErrorGeneric");
      showToast(t("saveErrorPrefix", { message }), "error");
      throw err;
    }
  };
  // dependencies 는 picker 가 매 토글마다 onChange 호출하므로 별도 저장 경로.
  // 실패 시 토스트 · 성공 시는 조용히 (잦은 write 에 토스트 노이즈 방지).
  const saveDependencies = async (next: string[]) => {
    if (!project || !canManageProject) return;
    try {
      await persistProject({
        ...projectToInput(project),
        dependencies: next,
        accountId: accountId ?? project.accountId ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveErrorGeneric");
      showToast(t("saveErrorDeps", { message }), "error");
    }
  };
  // links 저장 경로 — label+url 쌍이라 별도 서명.
  const saveLinks = async (next: LinkItem[]) => {
    if (!project || !canManageProject) return;
    try {
      await persistProject({
        ...projectToInput(project),
        links: next,
        accountId: accountId ?? project.accountId ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveErrorGeneric");
      showToast(t("saveErrorLinks", { message }), "error");
    }
  };
  // tags/stack 같은 배열 필드 공용 저장 경로. 단건 추가·삭제마다 호출.
  const saveListField = async (field: "tags" | "stack", next: string[]) => {
    if (!project || !canManageProject) return;
    try {
      await persistProject({
        ...projectToInput(project),
        [field]: next,
        accountId: accountId ?? project.accountId ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveErrorGeneric");
      showToast(field === "tags" ? t("saveErrorTags", { message }) : t("saveErrorStack", { message }), "error");
    }
  };
  // cycle 유발 후보 사전 계산 — picker 에 invalidSlugs 로 전달해 disabled.
  const dependencyUniverse = related.some((p) => p.slug === project.slug)
    ? related
    : [...related, project];
  const invalidDependencySlugs = dependencyUniverse
    .filter((candidate) =>
      wouldCreateDependencyCycle(dependencyUniverse, project.slug, candidate.slug),
    )
    .map((candidate) => candidate.slug);
  const heroMeta = [project.isHub ? t("heroLabelHub") : t("heroLabelService"), statusLabel(project.status)]
    .filter(Boolean)
    .join(" · ");
  const storyMarkdownClassName =
    "mt-5 break-words text-[color:var(--color-text-secondary)] [&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2 [&_a:hover]:text-[color:var(--color-indigo-hover)] [&_code]:rounded [&_code]:bg-[color:var(--color-elevated)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-[var(--font-weight-signature)] [&_h1]:text-[color:var(--color-text-primary)] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-[var(--font-weight-signature)] [&_h2]:text-[color:var(--color-text-primary)] [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:text-[color:var(--color-text-primary)] [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-4 [&_p]:leading-8 [&_strong]:text-[color:var(--color-text-primary)] [&_ul]:mt-4";
  const projectPublicHref = getProjectDetailHref(project.slug, accountId);
  const projectFullEditHref = `/project/${encodeURIComponent(project.slug)}/edit/?returnTo=${encodeURIComponent(
    projectPublicHref,
  )}`;

  return (
    <ProjectDetailShell>
      <ProjectDetailTopBar
        slug={slug}
        accountId={accountId}
        projectName={project.name}
        rightActions={
          canManageProject ? (
            <ProjectQuickEditPanel
              project={project}
              settingsHref={projectFullEditHref}
            />
          ) : null
        }
      />


      <section className="mt-8">
        <div className="relative overflow-hidden rounded-[30px] border border-[color:var(--color-divider)] bg-[linear-gradient(180deg,var(--color-overlay-1)_0%,rgba(255,255,255,0)_100%)] px-5 py-5 md:px-7 md:py-6 xl:px-8 xl:py-7">
          <div
            aria-hidden
            className={cn(
              "absolute left-0 top-0 h-full w-px",
              project.isHub
                ? "bg-[color:var(--color-indigo-brand)]"
                : "bg-[color:var(--color-divider)]",
            )}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-4 bottom-4 font-mono text-[64px] leading-none font-semibold tracking-[-0.08em] text-[color:var(--color-overlay-1)] md:text-[96px] xl:right-7 xl:bottom-5 xl:text-[124px]"
          >
            {heroMonogram}
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <span className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
              {t("heroLabel")}
            </span>
            {heroMeta ? (
              <span className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                · {heroMeta}
              </span>
            ) : null}
          </div>

          {project.icon && (
            <div
              data-testid="project-detail-icon"
              className="relative z-10 mt-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-xl md:h-11 md:w-11 md:text-2xl"
              aria-hidden="true"
            >
              {project.icon}
            </div>
          )}

          {/*
            모든 hub 상세에서 제목을 인디고-accent (#7170ff) 로 칠하면
            246개 hub 페이지가 일제히 brand-emphasis 색이 되어, 정작
            "이 페이지가 핵심 hub 다" 신호가 묻힌다. 디자인 시스템의
            "단일 인디고" 는 강조용이지 모든 hub 의 제목 색이 아니다.
            제목은 무채색으로 통일하고, hub 식별은 breadcrumb prefix
            (예: "Demo · ...") + 토폴로지 노드 크기/색으로 충분.
          */}
          <InlineEditable
            as="h1"
            value={project.name}
            editable={canManageProject}
            onSave={(next) => saveProjectField("name", next)}
            ariaLabel={t("inlineNameAria")}
            className="relative z-10 mt-3 text-[36px] leading-[0.98] tracking-[var(--tracking-hero)] text-pretty font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:text-[64px]"
          />

          {project.nameEn && project.nameEn !== project.name && (
            <p className="relative z-10 mt-3 font-mono text-sm uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
              {project.nameEn}
            </p>
          )}

          <InlineEditable
            as="p"
            multiline
            value={project.description}
            editable={canManageProject}
            onSave={(next) => saveProjectField("description", next)}
            ariaLabel={t("inlineDescriptionAria")}
            placeholder={t("inlineDescriptionPlaceholder")}
            dataTestId="project-detail-description"
            className="relative z-10 mt-4 max-w-2xl text-[15px] leading-7 text-[color:var(--color-text-secondary)] md:text-[17px] md:leading-8"
          />

          {/* 기본 정보 chip row — 상태/담당/진행/태그 를 Hero 안에 직접 노출. 이전엔 하단
              "프로젝트 정보" 카드 안에 갇혀 있어서 이름/설명이 중복되는 혼란이 있었음.
              아래 chip 의 "의존 / 연결" 카운트가 같은 정보를 더 명확히 보여주므로
              이전 "토폴로지에서 보면 의존 X · 연결 Y" 한 줄 부제는 제거. */}
          <div className="relative z-10 mt-5 flex flex-wrap gap-x-2 gap-y-2">
            {heroMetaItems.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-1.5"
              >
                {item.dot ? (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 flex-none rounded-full"
                    style={{ backgroundColor: item.dot }}
                  />
                ) : null}
                <span className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                  {item.label}
                </span>
                <span className="text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] tabular-nums">
                  {item.value}
                </span>
              </span>
            ))}
          </div>

          {/* 자기 공간 owner 는 의존 프로젝트를 Hero 안에서 바로 편집.
              picker 가 매 토글마다 onChange → upsertProject 호출 (debounce
              없음, 일반적으로 1~3개 변경이라 부담 적음). cycle 후보는
              invalidSlugs 로 disabled. */}
          {canManageProject ? (
            <div className="relative z-10 mt-6 max-w-2xl">
              <DetailCard
                eyebrow={t("depCardEyebrow")}
                title={t("depCardTitle")}
                description={t("depCardDescription")}
              >
                <DependencyPicker
                  value={project.dependencies}
                  onChange={(next) => void saveDependencies(next)}
                  options={dependencyUniverse}
                  selfSlug={project.slug}
                  invalidSlugs={invalidDependencySlugs}
                />
              </DetailCard>
            </div>
          ) : null}

          <div className="relative z-10 mt-5 border-t border-[color:var(--color-divider)] pt-4">
            <div className="mt-4 flex flex-wrap items-center gap-2 md:hidden">
              <CopyProjectLinkButton
                slug={project.slug}
                testId="project-detail-copy-link-mobile"
                className="h-10 justify-center"
              />
              <Link
                href={getTopologyProjectHref(project.slug, accountId)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.12)] px-4 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
              >
                {t("topBarTopologyView")}
              </Link>
            </div>
          </div>

        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.12fr)_312px]">
        <div className="flex flex-col gap-6">
          {/* 연결 지도 — 이 프로젝트 + 1-hop 이웃 만 담은 미니 Sigma 토폴로지.
              메인 워크스페이스 지도와 동일한 physics · 드래그 · hover · 라벨
              동작. minimal=true 로 minimap · aurora · stats pill · URL sync ·
              키보드 nav 는 끈다. */}
          {neighborsTopologyProjects.length > 1 ? (
            <article className="overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
              <header className="border-b border-[color:var(--color-divider)] px-6 py-5 md:px-8">
                <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                  {t("neighborMapEyebrow")}
                </p>
                <h2 className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t("neighborMapTitle", {
                    name: project.name,
                    count: neighborsTopologyProjects.length - 1,
                  })}
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("neighborMapDescription")}
                </p>
              </header>
              <div className="h-[520px] w-full">
                <SigmaTopology
                  projects={neighborsTopologyProjects}
                  categories={categories}
                  accountId={accountId}
                  selectedSlug={project.slug}
                  minimal
                  // 이웃 노드 클릭 시 해당 프로젝트 상세로 이동. 현재 페이지
                  // 자신(slug) 클릭은 무시. account 쿼리 보존.
                  onSelectProject={(slug) => {
                    if (slug === project.slug) return;
                    router.push(getProjectDetailHref(slug, accountId));
                  }}
                  // 50 내외의 이웃이 작은 영역에 몰리지 않도록 repel 과
                  // linkDistance 를 메인 홈보다 크게. 라벨 충돌도 완화.
                  forces={{
                    repel: -560,
                    linkDistance: 120,
                    collideMultiplier: 1.4,
                  }}
                />
              </div>
            </article>
          ) : null}

          {/* "문서 토폴로지" 는 분해·공개된 개념 지도가 실제로 있을 때만 노출.
              게스트에게 빈 문서 목록을 먼저 보여주면 프로젝트 핵심 흐름을 가리므로
              공개 문서가 없을 땐 ProjectDocumentsList 자체를 숨긴다. */}
          {knowledgeInsight.nodes.length > 0 ? (
            <ProjectKnowledgeTopology
              nodes={knowledgeInsight.nodes}
              edges={knowledgeInsight.edges}
              canManageProject={canManageProject}
              heading={t("knowledgeTopologyHeading", { name: project.name })}
              description={t("knowledgeTopologyDescription")}
            />
          ) : null}

          {/* "프로젝트 정보" 카드는 project.detail 마크다운이 있을 때만 렌더.
              예전엔 detail 없을 때 fallback으로 이름/설명을 다시 노출해서 Hero와
              중복됐고 "왜 또 있지?" 혼란이 있었음. 기본 정보(상태/담당 등) 칩은
              Hero로 이동. Integrity 경고는 detail 유무와 무관하게 별도 카드로 유지. */}
          {project.detail ? (
            <article className="order-2 overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
              <div className="border-b border-[color:var(--color-divider)] px-6 py-5 md:px-8">
                <h2 className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t("infoCardTitle")}
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t("infoCardDescription")}
                </p>
              </div>
              <div className="px-6 py-6 md:px-8">
                <div className={storyMarkdownClassName}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {project.detail}
                  </ReactMarkdown>
                </div>
              </div>
            </article>
          ) : null}
          {integrityIssueLabels.length > 0 ? (
            <div
              data-testid="project-detail-integrity"
              className="order-2 rounded-[28px] border border-[color:rgba(244,183,49,0.25)] bg-[color:rgba(244,183,49,0.08)] px-6 py-5 md:px-8"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-status-warning)]">
                {t("integrityWarn")}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[color:var(--color-text-secondary)]">
                {integrityIssueLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* "프로젝트 설명 문서" 카드는 knowledgeInsight 데이터가 있을 때만 렌더.
              비어 있을 땐 문서 카드와 토폴로지 카드 모두 숨겨서 같은 empty state가
              반복되지 않게 한다. */}
          {knowledgeInsight.nodes.length > 0 ? (
            <article
              id="project-detail-insight"
              className="order-1 rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-6 md:px-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                    {t("evidenceTitle")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                    {t("evidenceDescription")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {knowledgeInsight.meta?.publishedAt && (
                    <span className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                      {formatDate(knowledgeInsight.meta.publishedAt)}
                    </span>
                  )}
                </div>
              </div>

              <>
                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(240px,0.88fr)]">
                  <div className="space-y-3">
                    <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                      {t("evidenceRepDoc")}
                    </p>
                    {insightDocumentNodes.slice(0, 1).map((node) => (
                      <div
                        key={node.id}
                        className="rounded-[20px] border border-[color:var(--color-border-soft)] px-4 py-4"
                      >
                        <p className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          {node.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                          {node.summary || t("evidenceDocSummaryFallback")}
                        </p>
                      </div>
                    ))}
                    {insightDocumentNodes.length > 1 ? (
                      <p className="text-xs text-[color:var(--color-text-tertiary)]">
                        {t("evidenceMoreDocs", { count: insightDocumentNodes.length - 1 })}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                        {t("evidenceConnectionsTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                        {ontologyReasonNote}
                      </p>
                    </div>

                    <details className="rounded-[20px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                      <summary className="cursor-pointer list-none text-[11px] text-[color:var(--color-text-quaternary)]">
                        {t("evidenceMoreReadCta")}
                      </summary>
                      {insightConceptNodes.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                            {t("evidenceCoOccurringTitle")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {insightConceptNodes.slice(0, 4).map((node) => (
                              <span
                                key={node.id}
                                className="inline-flex rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]"
                              >
                                {node.title}
                              </span>
                            ))}
                          </div>
                          {evidenceSummary.counts.concepts > insightConceptNodes.length ? (
                            <p className="mt-2 text-xs text-[color:var(--color-text-tertiary)]">
                              {t("evidenceMoreConcepts")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {insightEdgeLabels.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                            {t("evidenceConnectionReasonsTitle")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {insightEdgeLabels.map((label, index) => (
                              <span
                                key={`${label}-${index}`}
                                className="inline-flex rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <p className="mt-3 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                        {connectionNote}
                      </p>
                      {heroSignals.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {heroSignals.map((signal) => (
                            <span
                              key={signal}
                              className="inline-flex rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)]"
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-4 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                        {t("evidenceCounts", {
                          documents: evidenceSummary.counts.documents,
                          concepts: evidenceSummary.counts.concepts,
                          edges: evidenceSummary.counts.edges,
                        })}
                      </p>
                    </details>
                  </div>
                </div>
              </>
            </article>
          ) : null}

          {project.screenshots.length > 0 && (
            <details className="order-3 overflow-hidden rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:px-8">
                {t("screenshotsToggle")}
              </summary>
              <div className="border-t border-[color:var(--color-divider)] px-6 py-6 md:px-8">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div className="overflow-hidden rounded-[24px] border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]">
                    <Image
                      src={project.screenshots[0]}
                      alt={`${project.name} screenshot 1`}
                      width={1600}
                      height={1000}
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      className="aspect-[16/10] w-full object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="grid gap-4">
                    {project.screenshots.slice(1, 3).map((url, i) => (
                      <div
                        key={`${url}-${i}`}
                        className="overflow-hidden rounded-[24px] border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
                      >
                        <Image
                          src={url}
                          alt={`${project.name} screenshot ${i + 2}`}
                          width={1600}
                          height={1000}
                          sizes="(min-width: 1024px) 40vw, 100vw"
                          className="aspect-[16/10] w-full object-cover"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>

        <aside className="self-start lg:sticky lg:top-8">
          <section className="rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                  {t("neighborsCardTitle")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                  {t("neighborsCardDescription")}
                </p>
              </div>
            </div>

            {nextProjectCandidates.length > 0 ? (
              <div className="mt-4 space-y-3">
                {nextProjectCandidates.slice(0, 1).map((candidate) => (
                  <Link
                    key={candidate.slug}
                    href={getProjectDetailHref(candidate.slug, accountId)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border-soft)] px-3 py-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.28)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
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
                {nextProjectCandidates.length > 1 ? (
                  <p className="text-xs text-[color:var(--color-text-tertiary)]">
                    {t("neighborsMoreNote", { count: nextProjectCandidates.length })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm leading-6 text-[color:var(--color-text-tertiary)]">
                {t("neighborsEmpty")}
              </p>
            )}

            <details className="mt-5 rounded-[20px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
              <summary className="cursor-pointer list-none text-[11px] text-[color:var(--color-text-quaternary)]">
                {t("moreInfoToggle")}
              </summary>
              <div className="mt-4 space-y-5 border-t border-[color:var(--color-border-soft)] pt-4">
                {(canManageProject || project.links.length > 0) && (
                  <div>
                    <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                      {t("linksTitle")}
                    </p>
                    <LinkListEditor
                      className="mt-3"
                      value={project.links}
                      editable={canManageProject}
                      onChange={saveLinks}
                      emptyHint={t("linksEmptyHint")}
                      ariaLabel={t("linksEditorAria")}
                    />
                  </div>
                )}

                {(canManageProject ||
                  project.tags.length > 0 ||
                  project.stack.length > 0) && (
                  <div>
                    <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                      {t("compositionTitle")}
                    </p>
                    {(canManageProject || project.tags.length > 0) && (
                      <div className="mt-3">
                        <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                          {t("tagsTitle")}
                        </p>
                        <ChipListEditor
                          className="mt-2"
                          value={project.tags}
                          editable={canManageProject}
                          onChange={(next) => saveListField("tags", next)}
                          placeholder={t("tagsPlaceholder")}
                          variant="default"
                          emptyHint={t("tagsEmptyHint")}
                          ariaLabel={t("tagsEditorAria")}
                        />
                      </div>
                    )}
                    {(canManageProject || project.stack.length > 0) && (
                      <div className="mt-4">
                        <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
                          {t("stackTitle")}
                        </p>
                        <ChipListEditor
                          className="mt-2"
                          value={project.stack}
                          editable={canManageProject}
                          onChange={(next) => saveListField("stack", next)}
                          placeholder={t("stackPlaceholder")}
                          variant="indigo"
                          emptyHint={t("stackEmptyHint")}
                          ariaLabel={t("stackEditorAria")}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                    {t("basicInfoTitle")}
                  </p>
                  <dl className="mt-3 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[color:var(--color-text-tertiary)]">{t("basicInfoPath")}</dt>
                      <dd className="text-right text-[color:var(--color-text-primary)]">
                        {categoryLabel(project.category)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[color:var(--color-text-tertiary)]">{t("basicInfoSlug")}</dt>
                      <dd className="font-mono tabular-nums text-right text-[color:var(--color-text-primary)]">
                        {project.slug}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[color:var(--color-text-tertiary)]">{t("basicInfoUpdatedAt")}</dt>
                      <dd className="font-mono tabular-nums text-right text-[color:var(--color-text-primary)]">
                        {formatDate(project.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </details>
          </section>
        </aside>
      </section>

      {/* 이 프로젝트의 ontology 노드 — 매치 0 자동 숨김. 가벼운 client-only
          fetch 라 SSG payload 영향 없음. "공개 surface 무거운 작업 금지" 정신
          준수: 토폴로지 sigma 는 그대로, 새 카드만 추가. */}
      <ProjectOntologyOverview accountId={accountId} projectSlug={project.slug} />

      <footer className="mt-12 border-t border-[color:var(--color-overlay-2)] pt-6">
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
        accountId={accountId}
      />
      <ShortcutSheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </ProjectDetailShell>
  );
}
