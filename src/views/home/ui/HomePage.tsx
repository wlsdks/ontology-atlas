"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, X } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { isOntologyNodeId } from "@/shared/lib/ontology-node-id";
import { useProjects } from "@/features/project-data-source";
// 타입/기본값은 Sigma(WebGL) 의존성 없는 별도 모듈에서 직접 import해서
// SSR 평가 경로에 WebGL 참조가 끼지 않도록 한다.
import {
  DEFAULT_SIGMA_CONTROLS,
  type SigmaControlsState,
} from "@/widgets/topology-map-sigma/model/controls-state";
import { HeroHeader, HeroCollapsed } from "@/widgets/hero-header";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
import { WorkspaceOntologyStrip } from "@/widgets/workspace-ontology-strip";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useTaxonomy } from "@/features/taxonomy";

// 첫 방문에 바로 필요 없는 오버레이들은 지연 로딩.
// 초기 번들에서 분리되어 FCP/LCP 와 TTI 가 더 빨라진다.
// SigmaTopology 는 sigma.js + edge-curve + node-border 등 무거운 deps 를
// 끌고 와 chunk 가 큼. 첫 진입 / 캐시 비었을 때 chunk 다운로드 동안 빈
// 화면이 그대로 보여 "멈춤" 느낌이라, 데이터 구독 skeleton 과 동일 톤
// fallback 을 모듈 로드 단계에도 표시.
function TopologyLoadingFallback() {
  const t = useTranslations('topology');
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.28)] bg-[color:var(--color-panel)] px-4 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
        <span className="flex gap-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:0ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:150ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:300ms]" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]">
          {t('loadingEngine')}
        </span>
      </div>
    </div>
  );
}

const SigmaTopology = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaTopology),
  { ssr: false, loading: () => <TopologyLoadingFallback /> },
);
const SigmaControls = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaControls),
  { ssr: false },
);
const SigmaHubRail = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaHubRail),
  { ssr: false },
);
const TopologyEmptyState = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.TopologyEmptyState),
  { ssr: false },
);
const SearchPalette = dynamic(
  () => import("@/widgets/search-palette").then((m) => m.SearchPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
const DocsQuickDrawer = dynamic(
  () => import("@/widgets/docs-quick-drawer").then((m) => m.DocsQuickDrawer),
  { ssr: false },
);
const MountedGlobalSearch = dynamic(
  () =>
    import("@/widgets/global-search").then((m) => m.MountedGlobalSearch),
  { ssr: false },
);
import { GestureHint } from "@/widgets/gesture-hint";
import { PINNED_DOCS_STORAGE_PREFIX } from "@/widgets/docs-vault";
import { LiveAnnouncer, Tooltip, useToast } from "@/shared/ui";
import {
  getProjectDetailHref,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { useHomeRouteState } from "../model/use-home-route-state";

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";

export function HomePage() {
  const t = useTranslations('topology');
  const { categories: taxonomyCategories } = useTaxonomy();
  const [sigmaControls, setSigmaControls] = useState<SigmaControlsState>(
    DEFAULT_SIGMA_CONTROLS,
  );
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [sigmaVisibleCount, setSigmaVisibleCount] = useState<number | null>(null);
  const [sigmaHintDismissed, setSigmaHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem('demo:sigma-hint-dismissed:v1') === '1';
    } catch {
      return true;
    }
  });
  const dismissSigmaHint = useCallback(() => {
    setSigmaHintDismissed(true);
    try {
      window.localStorage.setItem('demo:sigma-hint-dismissed:v1', '1');
    } catch {
      /* private mode — skip */
    }
  }, []);
  const router = useRouter();
  // mode-aware projects read — local 모드는 vault 매니페스트 sync, static 은
  // 빌드타임 dogfood 매니페스트. mission T7 — vault 의 .md 가 즉시 list/topology 에 반영.
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  const [routeState, setRouteState] = useHomeRouteState();
  // 상세 화면에서 Cmd+K를 누르면 홈으로 이동하며 sessionStorage 플래그를
  // 남긴다. 여기서 그 플래그가 있으면 첫 렌더부터 검색 팔레트를 열어 hydration
  // mismatch 없이 한 번에 보이게 한다. lazy initializer는 클라이언트에서만 실제
  // 실행되므로 SSR은 항상 false, 클라이언트 hydration도 sessionStorage 없는
  // 서버 프리렌더 기준 false → 불일치 없음.
  const [searchOpen, setSearchOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-search") === "1") {
        window.sessionStorage.removeItem("demo:open-search");
        return true;
      }
    } catch {
      /* private mode — skip */
    }
    return false;
  });
  // ⇧⌘K — ontology / 문서 / 프로젝트 통합 검색 (project 전용
  // SearchPalette 와 별 슬롯). MountedGlobalSearch 가 controlled mode 로
  // 이 open state 를 받아 동작.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (window.sessionStorage.getItem("demo:open-shortcuts") === "1") {
        window.sessionStorage.removeItem("demo:open-shortcuts");
        return true;
      }
    } catch {
      /* private mode */
    }
    return false;
  });
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  const [docsPinnedCount, setDocsPinnedCount] = useState(0);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(LEFT_PANEL_COLLAPSED_KEY);
    return saved === null ? true : saved === "1";
  });
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);
  // useProjects 실패 시 UI 가 빈 채로 영구 고착되는 걸 막기 위한 에러
  // 상태. 사용자 vault 디스크 read 실패 / 권한 만료 등의 경우 배너 노출
  // + "다시 시도" 버튼으로 복구.
  const toast = useToast();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const prefetchedProjectHrefsRef = useRef(new Set<string>());
  const preloadedImageUrlsRef = useRef(new Set<string>());

  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LEFT_PANEL_COLLAPSED_KEY,
          next ? "1" : "0",
        );
      }
      return next;
    });
  }, []);
  const {
    activeCategory,
    selectedSlug,
    impactMode,
  } = routeState;
  const renderProjects = projects;
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  const combinedFitToken = fitViewToken;
  // 클라이언트 사이드 동적 타이틀 — 선택 프로젝트 컨텍스트를 브라우저 탭에
  // 노출 (정적 export 환경의 page metadata 한계 보완).
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          t('documentTitle'),
          "oh-my-ontology",
        ].filter((value): value is string => Boolean(value)),
      ),
    ).join(" · ") || null,
  );
  const projectBySlug = useMemo(
    () => new Map(renderProjects.map((project) => [project.slug, project])),
    [renderProjects],
  );
  // reverse dependency map: slug → 이 slug 를 의존하는 프로젝트들.
  // localGraphProjects 2-hop 확장에서 매번 projects 전체 순회를 피하려고 1회
  // 계산해 재사용. O(E) 빌드, 조회 O(1).
  const reverseDeps = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const project of renderProjects) {
      for (const dep of project.dependencies) {
        const existing = map.get(dep);
        if (existing) {
          existing.push(project.slug);
        } else {
          map.set(dep, [project.slug]);
        }
      }
    }
    return map;
  }, [renderProjects]);

  const hubs = useMemo(() => renderProjects.filter((p) => p.isHub), [renderProjects]);
  // 지난 7일 내 updatedAt 된 프로젝트 수. hero subtitle 성장 카운터용.
  // Date.now() 는 순수 경고 때문에 useState lazy initializer 로 mount 시 1회
  // 만 캡처 (re-render 마다 경계 흔들리는 것도 방지 — 세션 동안 "이번 주"
  // 기준점이 안정적).
  const [mountNowMs] = useState<number>(() => Date.now());
  const recentlyUpdatedCount = useMemo(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    return renderProjects.reduce((n, p) => {
      const updated = p.updatedAt ? p.updatedAt.getTime() : 0;
      return mountNowMs - updated < SEVEN_DAYS_MS ? n + 1 : n;
    }, 0);
  }, [renderProjects, mountNowMs]);
  const projectsOverviewHref = "/projects";

  // Local graph 모드: 선택 노드 + 2-hop 이웃만 Sigma에 넘김. 전체 지도에서
  // 벗어나 해당 노드 주변만 집중해서 볼 수 있게 한다. Esc 또는 닫기 버튼으로
  // 전체 맵 복귀.
  const localGraphProjects = useMemo(() => {
    if (!localGraphRoot) return renderProjects;
    // bySlug/reverseDeps 는 상위 useMemo 결과 재사용 — 매번 동일 Map 재생성
    // 방지. dep 확장 = O(|deps|), 역방향 확장 = O(|reverseDeps[slug]|).
    // 전체는 O(N + E) 로 2-hop 서브그래프 추출.
    const visited = new Set<string>([localGraphRoot]);
    let frontier = [localGraphRoot];
    for (let hop = 0; hop < 2; hop += 1) {
      const next: string[] = [];
      for (const slug of frontier) {
        const project = projectBySlug.get(slug);
        if (!project) continue;
        for (const dep of project.dependencies) {
          if (!visited.has(dep) && projectBySlug.has(dep)) {
            visited.add(dep);
            next.push(dep);
          }
        }
        const refs = reverseDeps.get(slug);
        if (refs) {
          for (const ref of refs) {
            if (!visited.has(ref)) {
              visited.add(ref);
              next.push(ref);
            }
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return renderProjects.filter((p) => visited.has(p.slug));
  }, [renderProjects, localGraphRoot, projectBySlug, reverseDeps]);

  useEffect(() => {
    if (!localGraphRoot) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLocalGraphStack((stack) => stack.slice(0, -1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [localGraphRoot]);

  const canvasSelectedSlug = selectedSlug;
  const drawerProject = selectedProject;

  const handleSelect = useCallback(
    (
      slug: string,
      options?: { preserveImpact?: boolean },
    ) => {
      // R+ 사용자 보고: ontology 노드 클릭이 *자동으로* /ontology/?node=...
      // 로 redirect 되어 우측 drawer 가 안 뜬다. 원래 의도는 "drawer 안에
      // detail + 트리 이동 버튼". auto-redirect 제거 — selectedSlug 만 set
      // 해서 drawer 자체는 띄움 (ontology 노드는 projectBySlug 에 없어
      // drawer 의 project section 은 비지만 적어도 자동 jump 는 차단).
      // 트리로의 명시 이동은 컨텍스트 메뉴 (rightClickNode) 의 "포커스" /
      // "이웃만 보기" 또는 별도 nav 로. drawer 의 ontology mode 풀 fledged
      // 는 follow-up PR scope.
      if (isOntologyNodeId(slug)) {
        // dismissSigmaHint 만 호출 — drawer 는 setRouteState 분기로 뜸.
      }
      // 노드 선택 = drawer 열기. 허브를 선택하면 포커스 모드 자동 활성,
      // 일반 노드는 포커스 해제.
      // projectBySlug Map 으로 O(1) lookup — 이전엔 매 클릭마다
      // renderProjects.find 로 O(N) 스캔.
      const project = projectBySlug.get(slug);
      setRouteState((current) => ({
        ...current,
        selectedSlug: slug,
        focusedHubSlug: project?.isHub ? slug : null,
        impactMode: options?.preserveImpact ? current.impactMode : "none",
      }));
      dismissSigmaHint();
    },
    [projectBySlug, setRouteState, dismissSigmaHint],
  );

  const handleClose = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
    }));
  }, [setRouteState]);


  const handleSelectImpactMode = useCallback(
    (nextMode: ProjectImpactMode) => {
      setRouteState((current) => ({
        ...current,
        impactMode: nextMode,
      }));
    },
    [setRouteState],
  );

  // '문서' 버튼에 띄울 pinned 뱃지 카운트 — 드로어 닫힐 때 localStorage 에서
  // 갱신. 드로어 내부에서 pin 토글하고 닫으면 즉시 버튼에 반영.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(
        `${PINNED_DOCS_STORAGE_PREFIX}server`,
      );
      if (!raw) {
        queueMicrotask(() => setDocsPinnedCount(0));
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      const nextCount = Array.isArray(parsed)
        ? parsed.filter((s): s is string => typeof s === "string").length
        : 0;
      queueMicrotask(() => setDocsPinnedCount(nextCount));
    } catch {
      queueMicrotask(() => setDocsPinnedCount(0));
    }
  }, [docsDrawerOpen]);

  // 공용 useTypingShortcuts로 글로벌 키 단축키 통합.
  useTypingShortcuts([
    // ⇧⌘K (ontology / 문서 통합 검색) — useTypingShortcuts 는 첫 일치 후
    // return 하므로 ⌘K 보다 먼저 정의해야 한다.
    {
      combo: { key: "k", meta: true, shift: true },
      onFire: () => setOntologySearchOpen((v) => !v),
    },
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
    {
      combo: { key: "?" },
      onFire: () => setShortcutsOpen((v) => !v),
    },
    {
      combo: { key: "d" },
      onFire: () => setDocsDrawerOpen((v) => !v),
    },
  ]);

  const drawerOpen = drawerProject !== null;

  const preloadProjectAsset = useCallback(
    (slug: string) => {
      const project = projectBySlug.get(slug);
      if (!project) return;

      const href = getProjectDetailHref(slug);
      if (!prefetchedProjectHrefsRef.current.has(href)) {
        prefetchedProjectHrefsRef.current.add(href);
        router.prefetch(href);
      }

      project.screenshots.slice(0, 2).forEach((url) => {
        if (!url || preloadedImageUrlsRef.current.has(url)) return;
        preloadedImageUrlsRef.current.add(url);
        const image = new window.Image();
        image.decoding = "async";
        image.src = url;
        image.decode?.().catch(() => {});
      });
    },
    [projectBySlug, router],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const candidateSlugs = new Set<string>();
    if (selectedSlug) candidateSlugs.add(selectedSlug);

    // 허브 top 5 도 백그라운드 preload — 홈에 오자마자 사용자가 허브를
    // 클릭해 드로어 열 때 스크린샷 즉시 뜨도록. idle callback 으로 현재
    // 인터랙션 방해 없이 수행.
    const addTopHubs = () => {
      hubs.slice(0, 5).forEach((hub) => candidateSlugs.add(hub.slug));
      candidateSlugs.forEach(preloadProjectAsset);
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(addTopHubs);
      return () => win.cancelIdleCallback?.(id);
    }
    const handle = window.setTimeout(addTopHubs, 200);
    return () => window.clearTimeout(handle);
  }, [hubs, preloadProjectAsset, selectedSlug]);

  return (
    <main id="main" className="relative h-screen w-screen overflow-hidden bg-[color:var(--color-canvas)]">
      {/*
        스크린리더 랜드마크 명시 + SEO h1. 시각 디자인은 canvas 중심이라
        visible h1 을 두기 어려워 sr-only 로 문서 구조 only 에 보이게 한다.
      */}
      <h1 className="sr-only">
        {t('srHeading')}
      </h1>
      <GestureHint
        disabled={drawerOpen}
      />
      <LiveAnnouncer
        message={(() => {
          if (!selectedProject) return "";
          const deps = selectedProject.dependencies.length;
          // reverseDeps 는 위 useMemo 결과 — projects 전체 재filter 안 해도
          // O(1) lookup. 이전엔 매 render 마다 projects.filter 로 O(N*D).
          const referenced = reverseDeps.get(selectedProject.slug)?.length ?? 0;
          return t('selectionAnnouncement', {
            name: selectedProject.name,
            deps,
            referenced,
          });
        })()}
      />
      <>
            {/* 모바일 전용 미니 브랜드 라벨 */}
            <div className="pointer-events-none absolute left-4 top-[22px] z-10 -translate-y-1/2 md:hidden">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt=""
                  aria-hidden="true"
                  width={26}
                  height={26}
                  priority
                  className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-[color:var(--color-border-soft)] object-cover"
                />
                <div>
                  <span
                    translate="no"
                    className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]"
                  >
                    oh-my-ontology
                  </span>
                  <p className="mt-0.5 max-w-[180px] text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t('mobileTagline')}
                  </p>
                </div>
              </div>
            </div>
            {(() => {
              // 성장 시그널 — 지난 7일 내 updatedAt 된 프로젝트 수.
              // "지식이 자라고 있다" 를 2초 안에 느끼게 하는 카운터. 0 이면 숨김.
              const growthLabel = recentlyUpdatedCount > 0
                ? t('workspace.growthThisWeek', { count: recentlyUpdatedCount })
                : "";
              const workspaceSubtitle = t('workspace.subtitle', {
                projects: renderProjects.length,
                hubs: hubs.length,
                growth: growthLabel,
              });
              const workspaceEyebrow = t('workspace.eyebrow', {
                projects: renderProjects.length,
              });
              return hydrated && (leftPanelCollapsed || drawerOpen) ? (
                <div className="pointer-events-none absolute left-4 top-4 z-10 hidden md:flex md:flex-col md:items-start md:gap-2 md:left-6 md:top-6 xl:left-8 xl:top-8">
                  <HeroCollapsed
                    onExpand={
                      drawerOpen ? handleClose : toggleLeftPanel
                    }
                    title={selectedProject?.name ?? t('workspace.fallbackTitle')}
                    subtitle={
                      selectedProject
                        ? t('workspace.selectedEyebrow')
                        : projects.length > 0
                          ? workspaceSubtitle
                          : t('workspace.expandHint')
                    }
                    icon={selectedProject?.icon ?? null}
                    ariaLabel={
                      drawerOpen
                        ? t('hero.closeSelected')
                        : t('hero.expandLeftPanel')
                    }
                    titleText={
                      drawerOpen
                        ? t('hero.closeSelected')
                        : t('hero.expandLeftPanel')
                    }
                    docsVaultHref={"/docs/"}
                    ontologyHref={"/ontology/"}
                  />
                </div>
              ) : (
                <div className="pointer-events-none absolute left-4 top-4 z-10 hidden max-h-[calc(100vh-2.5rem)] w-[288px] items-start gap-2.5 overflow-y-auto overscroll-contain pr-1 md:left-6 md:top-6 md:flex md:flex-col lg:max-h-[calc(100vh-3rem)] lg:w-[304px] xl:left-8 xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:w-[340px] [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                  <HeroHeader
                    className="block w-full"
                    hidden={drawerOpen}
                    activePathLabel={null}
                    onOpenSearch={() => setSearchOpen(true)}
                    onCollapse={toggleLeftPanel}
                    title={selectedProject?.name ?? t('workspace.fallbackTitle')}
                    eyebrow={
                      selectedProject
                        ? t('workspace.selectedEyebrow')
                        : projects.length > 0
                          ? workspaceEyebrow
                          : t('workspace.mapEyebrow')
                    }
                    description={
                      selectedProject?.description ||
                      (projects.length > 0
                        ? t('workspace.description', {
                            hubs: hubs.length,
                            projects: projects.length,
                          })
                        : undefined)
                    }
                    icon={selectedProject?.icon ?? null}
                    projectsListHref={projectsOverviewHref}
                    docsVaultHref={"/docs/"}
                    ontologyHref={"/ontology/"}
                  />
                  {/* O-9 — 워크스페이스 전체 보기 (selectedProject 없음) 에
                      ontology summary strip. 사용자 첫 인상에 "내 ontology 가
                      자라고 있다" 즉각 인지. 매치 0 자동 숨김. */}
                  {!selectedProject ? (
                    <div className="pointer-events-auto self-start">
                      <WorkspaceOntologyStrip />
                    </div>
                  ) : null}
                </div>
              );
            })()}
            <SearchHint
              onOpenSearch={() => {
                setSearchOpen(true);
              }}
              onRelayout={() => {
                setTopologyRelayoutToken((current) => current + 1);
                toast.show(t('controls.relayoutToast'), "info");
              }}
            />
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2 md:right-6 md:top-6 xl:right-8 xl:top-8">
              <Tooltip content={t('controls.docsTooltip')} side="bottom" withProvider={false}>
              <button
                type="button"
                onClick={() => setDocsDrawerOpen((v) => !v)}
                aria-expanded={docsDrawerOpen}
                aria-label={t('controls.docsAriaLabel')}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3.5 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color,box-shadow,transform] duration-180 ease-out hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:var(--color-panel)] active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none motion-reduce:transform-none"
              >
                <BookOpen size={15} className="text-[color:var(--color-indigo-accent)]" />
                <span>{t('controls.docsLabel')}</span>
                {docsPinnedCount > 0 ? (
                  <span
                    className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:rgba(94,106,210,0.28)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--color-indigo-accent)]"
                    aria-label={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                    title={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                  >
                    {docsPinnedCount}
                  </span>
                ) : null}
                <kbd className="hidden rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)] sm:inline">
                  D
                </kbd>
              </button>
              </Tooltip>
            </div>
          </>
        <div className="absolute inset-0">
          <>
              <div
                key={localGraphRoot ?? '__root__'}
                className="absolute inset-0 animate-[sigmaFade_220ms_ease-out]"
              >
                {/* Empty-state overlay when the visible Sigma graph has 0–1
                    nodes — the lone Sigma dot otherwise reads as a broken
                    canvas. sigmaVisibleCount 은 Sigma 가 첫 mount 후 reports.
                    null 일 땐 가짜 카드 깜빡임 회피 위해 mount 만 기다림. */}
                {sigmaVisibleCount !== null && sigmaVisibleCount <= 1 ? (
                  <TopologyEmptyState projectCount={sigmaVisibleCount} />
                ) : null}
                <SigmaTopology
                  projects={localGraphProjects}
                  categories={taxonomyCategories}
                  selectedSlug={canvasSelectedSlug}
                  onSelectProject={(slug) => handleSelect(slug)}
                  onProjectOpen={(slug) => setLocalGraphStack((stack) => [...stack, slug])}
                  fitViewToken={combinedFitToken}
                  relayoutToken={topologyRelayoutToken}
                  onVisibleCountChange={setSigmaVisibleCount}
                  onPaneClick={handleClose}
                  onFirstInteraction={dismissSigmaHint}
                  activeCategory={activeCategory}
                  depthLimit={sigmaControls.depthLimit}
                  searchQuery={sigmaControls.searchQuery}
                  forces={sigmaControls.forces}
                  hubsOnly={sigmaControls.hubsOnly}
                  overlays={sigmaControls.overlays}
                  // R14: /topology 는 vault ontology 의 도메인/역량/요소
                  // 노드와 그 관계까지 같은 그래프에 그린다. project 1 개 +
                  // dependencies 0 인 dogfood 상황에서 빈 화면이었던 회귀를
                  // 메우면서, 사용자가 "ontology 와 topology 는 연계되어야"
                  // 라고 약속한 본질을 살린다. local-graph (drawer 의 ego)
                  // 에서는 project 의존만 보이게 끔 — 좁은 시야 위해.
                  showOntologyNodes={localGraphRoot === null}
                />
              </div>
              <style jsx>{`
                @keyframes sigmaFade {
                  from { opacity: 0.5; transform: scale(0.995); }
                  to { opacity: 1; transform: scale(1); }
                }
              `}</style>
              <SigmaControls
                value={sigmaControls}
                onChange={setSigmaControls}
                onFitView={() => setFitViewToken((t) => t + 1)}
                visibleCount={sigmaVisibleCount}
                totalCount={localGraphProjects.length}
              />
              {/* 단축키 도움말 진입점 — 우상단 SigmaControls 아래 36×36 아이콘.
                  ? 키 단축키도 같은 sheet 를 열지만 시각적 affordance 가 없으면
                  발견성 낮음. 모바일은 키보드가 없어 의미 0 → 데스크톱(md+)
                  에서만 노출. */}
              <Tooltip content={t('controls.shortcutsTooltip')} side="left" withProvider={false}>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-label={t('controls.shortcutsAriaLabel')}
                className="pointer-events-auto absolute right-4 top-[228px] z-20 hidden h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] font-mono text-[14px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] md:right-6 md:flex xl:right-8"
              >
                ?
              </button>
              </Tooltip>
              <SigmaHubRail
                projects={renderProjects}
                selectedSlug={canvasSelectedSlug}
                onSelect={(slug) => handleSelect(slug)}
                // Hero 패널이 펼쳐져 있을 때 겹침 방지. hero 가 Collapsed
                // (pill) 이거나 drawer 상태면 Hub Rail 이 정상 노출.
                suppressed={!leftPanelCollapsed && !drawerOpen}
              />
              {localGraphStack.length > 0 ? (
                <div className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[70vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:rgba(139,151,255,0.32)] bg-[color:var(--color-panel)] px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    Local
                  </span>
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack([])}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    Root
                  </button>
                  {localGraphStack.map((slug, idx) => (
                    <span key={slug} className="flex items-center gap-2">
                      <span className="text-[color:var(--color-text-quaternary)]">▸</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLocalGraphStack((stack) => stack.slice(0, idx + 1))
                        }
                        className={`truncate text-[12px] transition-colors ${
                          idx === localGraphStack.length - 1
                            ? 'text-[color:var(--color-text-primary)]'
                            : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                        }`}
                        title={slug}
                      >
                        {slug}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack((stack) => stack.slice(0, -1))}
                    className="ml-2 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  >
                    Esc
                  </button>
                </div>
              ) : null}

              {/* 필터 컨텍스트 — 현재 visible 노드 수가 전체보다 적으면 표시.
                  SigmaControls 검색창 배지와 중복이지만, controls가 접힌 상태에서도
                  필터 중임을 알려주는 컨텍스트 칩. */}
              {sigmaVisibleCount !== null && sigmaVisibleCount < localGraphProjects.length ? (
                <div className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.9)] md:left-[228px] xl:left-[236px]">
                  filter · {sigmaVisibleCount} / {localGraphProjects.length}
                </div>
              ) : null}

              {/* 매칭 0건 empty state */}
              {sigmaVisibleCount === 0 ? (
                <div className="pointer-events-auto absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-6 py-5 text-center shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    No matches
                  </p>
                  <p className="text-[13px] text-[color:var(--color-text-secondary)]">
                    {t('empty.noMatchesBody')}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSigmaControls({
                        ...sigmaControls,
                        searchQuery: '',
                        depthLimit: null,
                      })
                    }
                    className="rounded-md border border-[color:rgba(139,151,255,0.3)] bg-[color:rgba(94,106,210,0.1)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.18)]"
                  >
                    {t('empty.clearFilters')}
                  </button>
                </div>
              ) : null}

              {/* 첫 진입 온보딩 카드 — bottom-center 는 중앙 hub 노드(IAM 등)를
                  가려 사용자가 "여기를 클릭해야 하는지" 알 수 없게 만들었다.
                  좌하단 stats bar (bottom-6, ~32px) 위로 옮겨 중앙 시야를 비운다.
                  bottom-20 (80px) → stats bar 와 24px gap. 이전 bottom-14 는
                  카드와 stats 가 거의 붙어있어 두 박스가 한 덩어리처럼 보였다. */}
              {hydrated && !sigmaHintDismissed && sigmaVisibleCount !== 0 ? (
                <div className="pointer-events-auto absolute bottom-20 left-4 z-10 hidden max-w-[320px] flex-col gap-2 rounded-2xl border border-[color:rgba(139,151,255,0.32)] bg-[color:var(--color-panel)] px-4 py-3 text-[11px] text-[color:var(--color-text-tertiary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)] sm:flex md:left-6 xl:left-8">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      {t('hint.title')}
                    </p>
                    <button
                      type="button"
                      onClick={dismissSigmaHint}
                      aria-label={t('hint.dismissAriaLabel')}
                      className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p className="leading-5">
                    {t('hint.body')}
                  </p>
                  <ul className="flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    <li>
                      <span className="text-[color:var(--color-text-secondary)]">{t('hint.click')}</span>
                      <span className="text-[color:var(--color-text-quaternary)]">{t('hint.clickDescription')}</span>
                    </li>
                    <li>
                      <span className="text-[color:var(--color-text-secondary)]">{t('hint.drag')}</span>
                      <span className="text-[color:var(--color-text-quaternary)]">{t('hint.dragDescription')}</span>
                    </li>
                    <li>
                      <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">⌘</kbd>
                      <kbd className="ml-0.5 rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">K</kbd>
                      <span className="text-[color:var(--color-text-quaternary)]">{t('hint.searchDescription')}</span>
                      <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">?</kbd>
                      <span className="text-[color:var(--color-text-quaternary)]">{t('hint.shortcutsDescription')}</span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </>
        </div>
        {projectsError ? (
          <div
            role="alert"
            className="pointer-events-auto absolute left-1/2 top-[52px] z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(236,116,116,0.32)] bg-[color:rgba(18,20,26,0.98)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(236,116,116,0.9)]">
              Error
            </span>
            <span>{projectsError}</span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="ml-2 rounded-full border border-[color:var(--color-divider)] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              {t('errorBanner.retry')}
            </button>
          </div>
        ) : null}
        <ProjectDrawer
          project={drawerProject}
          allProjects={renderProjects}
          activeProjectId={null}
          impactMode={impactMode}
          onChangeImpactMode={handleSelectImpactMode}
          onClose={handleClose}
          onSelectProject={(slug) =>
            handleSelect(slug, { preserveImpact: impactMode !== "none" })
          }
          containerLabel={null}
        />
        <SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          projects={renderProjects}
          onSelect={(slug) => {
            handleSelect(slug);
          }}
          containerLabel={null}
        />
        {/* ⇧⌘K — ontology / 문서 통합 검색. project 전용 SearchPalette 와
            별 슬롯이라 SearchPalette 의 layer filter / 최근 검색 같은 고유
            기능 보존. controlled (open/onOpenChange) — hotkey 는 위
            useTypingShortcuts 가 관리. */}
        <MountedGlobalSearch
          open={ontologySearchOpen}
          onOpenChange={setOntologySearchOpen}
          onSelectProject={(project) => handleSelect(project.slug)}
        />
        <ShortcutSheet
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
        <DocsQuickDrawer
          open={docsDrawerOpen}
          onClose={() => setDocsDrawerOpen(false)}
          getDocHref={(slug) => buildDocsVaultHref({ slug })}
          contextProject={
            selectedProject
              ? {
                  slug: selectedProject.slug,
                  name: selectedProject.name,
                }
              : null
          }
        />
    </main>
  );
}
