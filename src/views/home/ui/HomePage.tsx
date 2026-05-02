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
import { useRouter } from "next/navigation";
import { BookOpen, X } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
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
import { ProjectKnowledgeTopologyScene } from "@/widgets/project-knowledge-topology";
import { SearchHint } from "@/widgets/search-hint";
import { PublicAccountMenu } from "@/widgets/account-menu";
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
          토폴로지 엔진 불러오는 중
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
import { LiveAnnouncer, Tooltip, useToast } from "@/shared/ui";
import {
  getProjectDetailHref,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import {
  buildKnowledgeProjectEvidenceSummary,
  subscribeKnowledgeProjectInsight,
  type KnowledgeProjectInsight,
} from "@/entities/knowledge-graph";
import { useHomeRouteState } from "../model/use-home-route-state";

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";

export function HomePage() {
  const { categories: taxonomyCategories } = useTaxonomy();
  const [sigmaControls, setSigmaControls] = useState<SigmaControlsState>(
    DEFAULT_SIGMA_CONTROLS,
  );
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [sigmaVisibleCount, setSigmaVisibleCount] = useState<number | null>(null);
  // SSR 시 true (hint 숨김) 으로 시작해 첫 paint 안정 — 이후 useEffect 로
  // localStorage 와 sync. 이전 useState(() => typeof window === 'undefined') 패턴은
  // 서버 / 클라이언트 hint 표시 여부가 다를 수 있어 hydration mismatch 발생.
  const [sigmaHintDismissed, setSigmaHintDismissed] = useState(true);
  useEffect(() => {
    try {
      const dismissed =
        window.localStorage.getItem('demo:sigma-hint-dismissed:v1') === '1';
      if (!dismissed) setSigmaHintDismissed(false);
    } catch {
      /* private mode — keep dismissed=true */
    }
  }, []);
  const dismissSigmaHint = useCallback(() => {
    setSigmaHintDismissed(true);
    try {
      window.localStorage.setItem('demo:sigma-hint-dismissed:v1', '1');
    } catch {
      /* private mode — skip */
    }
  }, []);
  const router = useRouter();
  // mode-aware projects read — local 모드는 vault 매니페스트 sync, cloud 는
  // Firestore onSnapshot. mission T7 — vault 의 .md 가 즉시 list/topology 에 반영.
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
  // Fire 2 — 홈에서도 ⇧⌘K 로 ontology / 문서 / 프로젝트 통합 검색 (project
  // 전용 SearchPalette 와 별 슬롯). MountedGlobalSearch 가 controlled mode 로
  // open state 를 받아서 작동.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [accountMenuDismissToken, setAccountMenuDismissToken] = useState(0);
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
  const [selectedKnowledgeInsight, setSelectedKnowledgeInsight] = useState<{
    projectSlug: string | null;
    insight: KnowledgeProjectInsight;
  }>({
    projectSlug: null,
    insight: {
      nodes: [],
      edges: [],
      meta: null,
    },
  });
  const [knowledgeSceneProjectSlug, setKnowledgeSceneProjectSlug] = useState<string | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(LEFT_PANEL_COLLAPSED_KEY);
    return saved === null ? true : saved === "1";
  });
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);
  // subscribeProjects 실패 시 UI 가 빈 채로 영구 고착되는 걸 막기 위한 에러
  // 상태. 네트워크·auth·quota 문제 등으로 Firestore 구독이 실패하면 배너
  // 노출 + "다시 시도" 버튼으로 복구.
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
  const dismissAccountMenu = useCallback(() => {
    setAccountMenuDismissToken((current) => current + 1);
  }, []);
  const {
    activeCategory,
    selectedSlug,
    focusedHubSlug,
    impactMode,
  } = routeState;
  const resetSigmaFilters = useCallback(() => {
    setSigmaControls((current) => ({
      ...current,
      depthLimit: null,
      searchQuery: "",
      hubsOnly: false,
    }));
  }, []);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const renderProjects = projects;
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  const combinedFitToken = fitViewToken;
  // P1-5 — 클라이언트 사이드 동적 타이틀. 선택 프로젝트 컨텍스트를 탭·검색바에
  // 노출 (정적 export 환경의 page metadata 한계 보완).
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          "토폴로지",
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
      // 노드 선택 = drawer 열기. 허브를 선택하면 포커스 모드 자동 활성,
      // 일반 노드는 포커스 해제.
      const project = renderProjects.find((p) => p.slug === slug);
      setRouteState((current) => ({
        ...current,
        selectedSlug: slug,
        focusedHubSlug: project?.isHub ? slug : null,
        impactMode: options?.preserveImpact ? current.impactMode : "none",
      }));
      dismissSigmaHint();
    },
    [renderProjects, setRouteState, dismissSigmaHint],
  );

  const handleClose = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
    }));
  }, [setRouteState]);

  const handleToggleHub = useCallback(
    (slug: string) => {
      // 같은 허브 재클릭 → 해제
      if (focusedHubSlug === slug) {
        handleClose();
        return;
      }
      // 다른 허브 선택 → 드로어 오픈 + 포커스
      setRouteState((current) => ({
        ...current,
        selectedSlug: slug,
        focusedHubSlug: slug,
        impactMode: "none",
      }));
    },
    [focusedHubSlug, handleClose, setRouteState],
  );

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
        "demo:docs-vault:pinned:v1:server",
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
  // portfolio 오버레이가 열려 있으면 모두 비활성.
  useTypingShortcuts([
    // Fire 2 — ⇧⌘K 가 ⌘K 보다 먼저 매치되어야 (useTypingShortcuts 가 첫
    // 일치 후 return). ontology / 문서 통합 검색 슬롯.
    {
      combo: { key: "k", meta: true, shift: true },
      onFire: () => setOntologySearchOpen((v) => !v),
    },
    {
      combo: { key: "k", meta: true },
      onFire: () => setSearchOpen((v) => !v),
    },
    {
      combo: { key: "f" },
      onFire: () => setPresentationMode((v) => !v),
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

  // presentationMode 진입/해제 시 브라우저 fullscreen API 연동
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (presentationMode) {
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [presentationMode]);

  // 사용자가 ESC 등으로 브라우저 fullscreen 빠져나가면 상태 동기화
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const drawerOpen = drawerProject !== null;
  const selectedEvidenceSummary = useMemo(
    () =>
      selectedKnowledgeInsight.projectSlug === selectedProject?.slug
        ? buildKnowledgeProjectEvidenceSummary(selectedKnowledgeInsight.insight, {
            subjectName: selectedProject.name,
          })
        : null,
    [selectedKnowledgeInsight, selectedProject],
  );
  const selectedHasKnowledgeEvidence = selectedEvidenceSummary?.hasEvidence ?? false;
  const showProjectTopologyScene =
    knowledgeSceneProjectSlug === selectedProject?.slug &&
    selectedProject !== null &&
    selectedKnowledgeInsight.projectSlug === selectedProject.slug &&
    selectedHasKnowledgeEvidence;
  const hideMobileOverlayControls = drawerOpen;

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

  useEffect(() => {
    if (!selectedProject) return;

    const unsubscribe = subscribeKnowledgeProjectInsight(
      selectedProject.slug,
      null,
      (nextInsight) => {
        setSelectedKnowledgeInsight({
          projectSlug: selectedProject.slug,
          insight: nextInsight,
        });
      },
      (error) => {
        console.warn("[HomePage] knowledge insight subscribe failed", error);
      },
    );

    return () => unsubscribe();
  }, [selectedProject]);

  return (
    <main id="main" className="relative h-screen w-screen overflow-hidden bg-[color:var(--color-canvas)]">
      {/*
        스크린리더 랜드마크 명시 + SEO h1. 시각 디자인은 canvas 중심이라
        visible h1 을 두기 어려워 sr-only 로 문서 구조 only 에 보이게 한다.
      */}
      <h1 className="sr-only">
        토폴로지 프로젝트 토폴로지 지도
      </h1>
      <GestureHint
        disabled={presentationMode || drawerOpen}
      />
      <LiveAnnouncer
        message={(() => {
          if (presentationMode) return "프레젠테이션 모드 시작";
          if (!selectedProject) return "";
          const deps = selectedProject.dependencies.length;
          const referenced = projects.filter((p) =>
            p.dependencies.includes(selectedProject.slug),
          ).length;
          return `${selectedProject.name} 선택됨. 의존 ${deps}개, 연결 ${referenced}개.`;
        })()}
      />
      {!presentationMode && (
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
                    Demo
                  </span>
                  <p className="mt-0.5 max-w-[180px] text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    프로젝트 의존도 지도.
                  </p>
                </div>
              </div>
            </div>
            {(() => {
              // 성장 시그널 — 지난 7일 내 updatedAt 된 프로젝트 수.
              // "지식이 자라고 있다" 를 2초 안에 느끼게 하는 카운터. 0 이면 숨김.
              const growthLabel = recentlyUpdatedCount > 0
                ? ` · 이번 주 +${recentlyUpdatedCount}`
                : "";
              const workspaceSubtitle = `Workspace · ${renderProjects.length} 프로젝트 · ${hubs.length} 허브${growthLabel}`;
              const workspaceEyebrow = `Workspace · ${renderProjects.length} 프로젝트`;
              return hydrated && (leftPanelCollapsed || drawerOpen) ? (
                <div className="pointer-events-none absolute left-4 top-4 z-10 hidden md:flex md:flex-col md:items-start md:gap-2 md:left-6 md:top-6 xl:left-8 xl:top-8">
                  <HeroCollapsed
                    onExpand={
                      drawerOpen ? handleClose : toggleLeftPanel
                    }
                    title={selectedProject?.name ?? "토폴로지"}
                    subtitle={
                      selectedProject
                        ? "선택한 프로젝트"
                        : projects.length > 0
                          ? workspaceSubtitle
                          : "워크스페이스 지도 펼치기"
                    }
                    icon={selectedProject?.icon ?? null}
                    ariaLabel={
                      drawerOpen
                        ? "선택한 프로젝트 닫기"
                        : "좌측 패널 펼치기"
                    }
                    titleText={
                      drawerOpen
                        ? "선택한 프로젝트 닫기"
                        : "좌측 패널 펼치기"
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
                    title={selectedProject?.name ?? "토폴로지"}
                    eyebrow={
                      selectedProject
                        ? "선택한 프로젝트"
                        : projects.length > 0
                          ? workspaceEyebrow
                          : "워크스페이스 지도"
                    }
                    description={
                      selectedProject?.description ||
                      (projects.length > 0
                        ? `${hubs.length}개 허브를 중심으로 ${projects.length}개 프로젝트가 엮여 있습니다. 노드를 클릭해 상세를 열어 볼 수 있어요.`
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
                      <WorkspaceOntologyStrip accountId={null} />
                    </div>
                  ) : null}
                </div>
              );
            })()}
            <SearchHint
              onOpenSearch={() => {
                dismissAccountMenu();
                setSearchOpen(true);
              }}
              onRelayout={() => {
                setTopologyRelayoutToken((current) => current + 1);
                toast.show("토폴로지를 다시 정렬합니다", "info");
              }}
            />
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2 md:right-6 md:top-6 xl:right-8 xl:top-8">
              <Tooltip content="문서 볼트 빠른 보기 (D)" side="bottom" withProvider={false}>
              <button
                type="button"
                onClick={() => setDocsDrawerOpen((v) => !v)}
                aria-expanded={docsDrawerOpen}
                aria-label="문서 볼트 빠른 보기 열기 (D)"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3.5 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color,box-shadow,transform] duration-180 ease-out hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:var(--color-panel)] active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none motion-reduce:transform-none"
              >
                <BookOpen size={15} className="text-[color:var(--color-indigo-accent)]" />
                <span>문서</span>
                {docsPinnedCount > 0 ? (
                  <span
                    className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:rgba(94,106,210,0.28)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--color-indigo-accent)]"
                    aria-label={`고정된 문서 ${docsPinnedCount}개`}
                    title={`고정된 문서 ${docsPinnedCount}개`}
                  >
                    {docsPinnedCount}
                  </span>
                ) : null}
                <kbd className="hidden rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)] sm:inline">
                  D
                </kbd>
              </button>
              </Tooltip>
              <PublicAccountMenu
                accountId={null}
                accountLabel={null}
                dismissToken={accountMenuDismissToken}
              />
            </div>
          </>
      )}
      {presentationMode && (
          <>
            <Tooltip content="프레젠테이션 모드 종료 (F)" side="bottom" withProvider={false}>
            <button
              type="button"
              onClick={() => setPresentationMode(false)}
              className="pointer-events-auto absolute right-4 top-4 z-10 flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 font-[var(--font-weight-signature)] text-[13px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--color-overlay-1)] md:right-10 md:top-10"
              aria-label="프레젠테이션 모드 종료"
            >
              <X size={14} />
              <span className="hidden md:inline">닫기</span>
              <span className="flex items-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                F
              </span>
            </button>
            </Tooltip>
          </>
        )}
        <div className="absolute inset-0">
          {showProjectTopologyScene ? (
            <>
              <ProjectKnowledgeTopologyScene
                nodes={selectedKnowledgeInsight.insight.nodes}
                edges={selectedKnowledgeInsight.insight.edges}
                projectName={selectedProject?.name}
                summaryText={selectedEvidenceSummary?.summaryText}
                onOpenDetail={() => {
                  if (!selectedProject) return;
                  router.push(
                    `${getProjectDetailHref(selectedProject.slug)}#project-detail-insight`,
                  );
                }}
              />
              <button
                type="button"
                onClick={() => setKnowledgeSceneProjectSlug(null)}
                className="pointer-events-auto absolute left-1/2 top-[96px] z-30 inline-flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-panel)] px-3 py-1.5 text-[12px] text-[color:var(--color-text-secondary)] shadow-[0_10px_28px_rgba(0,0,0,0.36)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
                aria-label="워크스페이스 지도로 돌아가기"
              >
                <span className="break-keep text-[11px] text-[color:var(--color-text-quaternary)]">
                  Evidence
                </span>
                <span className="truncate">워크스페이스 지도</span>
              </button>
            </>
          ) : (
            <>
              <div
                key={localGraphRoot ?? '__root__'}
                className="absolute inset-0 animate-[sigmaFade_220ms_ease-out]"
              >
                <SigmaTopology
                  projects={localGraphProjects}
                  categories={taxonomyCategories}
                  accountId={null}
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
                  ? 키로도 열리지만 시각적 affordance 가 없어 발견성 낮았음. */}
              {/* 키보드 단축키 도움말 — 모바일에서는 키보드가 없어 의미 없음. 데스크톱(md+) 에서만 노출. */}
              <Tooltip content="키보드 단축키 (?)" side="left" withProvider={false}>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-label="키보드 단축키 보기"
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
                // selector dropdown 이 열린 동안에도 같은 좌상단 영역과 겹쳐
                // 보이므로 함께 suppress.
                suppressed={(!leftPanelCollapsed && !drawerOpen) || selectorOpen}
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

              {selectedProject && selectedHasKnowledgeEvidence ? (
                <button
                  type="button"
                  onClick={() => setKnowledgeSceneProjectSlug(selectedProject.slug)}
                  className={`pointer-events-auto absolute left-1/2 z-20 inline-flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:var(--color-panel)] px-3 py-1.5 text-[12px] text-[color:var(--color-text-secondary)] shadow-[0_10px_28px_rgba(0,0,0,0.36)] transition-colors hover:border-[color:rgba(139,151,255,0.5)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] ${
                    localGraphStack.length > 0 ? "top-[144px]" : "top-[96px]"
                  }`}
                  aria-label={`${selectedProject.name} 문서 근거 지도 보기`}
                >
                  <BookOpen size={13} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                    문서 근거
                  </span>
                  <span className="truncate">
                    {selectedEvidenceSummary?.counts.documents ?? 0} docs · {selectedEvidenceSummary?.counts.edges ?? 0} links
                  </span>
                </button>
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
                    현재 필터 조건에 맞는 프로젝트가 없습니다.
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
                    필터 해제
                  </button>
                </div>
              ) : null}

              {/* 첫 진입 온보딩 카드 — bottom-center 는 중앙 hub 노드(IAM 등)를
                  가려 사용자가 "여기를 클릭해야 하는지" 알 수 없게 만들었다.
                  좌하단 status bar 위로 옮겨 중앙 시야를 비운다. SigmaHubRail
                  접힌 상태(기본값) 와 status bar 사이 빈 공간을 활용. */}
              {!sigmaHintDismissed && sigmaVisibleCount !== 0 ? (
                <div className="pointer-events-auto absolute bottom-14 left-4 z-10 hidden max-w-[320px] flex-col gap-2 rounded-2xl border border-[color:rgba(139,151,255,0.32)] bg-[color:var(--color-panel)] px-4 py-3 text-[11px] text-[color:var(--color-text-tertiary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)] sm:flex md:left-6 xl:left-8">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      프로젝트 지형도
                    </p>
                    <button
                      type="button"
                      onClick={dismissSigmaHint}
                      aria-label="안내 닫기"
                      className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p className="leading-5">
                    노드는 프로젝트, 선은 의존 관계입니다. 클릭해서 상세를 열고 검색으로 좁혀보세요.
                  </p>
                  <ul className="flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    <li>
                      <span className="text-[color:var(--color-text-secondary)]">클릭</span>
                      <span className="text-[color:var(--color-text-quaternary)]"> · 상세 패널 열기</span>
                    </li>
                    <li>
                      <span className="text-[color:var(--color-text-secondary)]">드래그</span>
                      <span className="text-[color:var(--color-text-quaternary)]"> · 노드 위치 이동</span>
                    </li>
                    <li>
                      <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">⌘</kbd>
                      <kbd className="ml-0.5 rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">K</kbd>
                      <span className="text-[color:var(--color-text-quaternary)]"> 검색 · </span>
                      <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9px]">?</kbd>
                      <span className="text-[color:var(--color-text-quaternary)]"> 단축키</span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </>
          )}
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
              다시 시도
            </button>
          </div>
        ) : null}
        <ProjectDrawer
          project={showProjectTopologyScene ? null : drawerProject}
          allProjects={renderProjects}
          accountId={null}
          activeProjectId={null}
          impactMode={impactMode}
          onChangeImpactMode={handleSelectImpactMode}
          onClose={handleClose}
          onSelectProject={(slug) =>
            handleSelect(slug, { preserveImpact: impactMode !== "none" })
          }
          containerLabel={null}
          knowledgeInsight={
            selectedKnowledgeInsight.projectSlug === drawerProject?.slug
              ? selectedKnowledgeInsight.insight
              : null
          }
          onOpenKnowledgeScene={(slug) => setKnowledgeSceneProjectSlug(slug)}
        />
        <SearchPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          projects={renderProjects}
          onSelect={(slug) => {
            handleSelect(slug);
          }}
          containerLabel={null}
          accountId={null}
        />
        {/* Fire 2 — ⇧⌘K 로 열리는 ontology / 문서 통합 검색. project 전용
            SearchPalette 와 별 슬롯 — layer filter / 최근 검색 등 SearchPalette
            의 고유 기능 보존. controlled mode (open/onOpenChange) 라 hotkey
            는 useTypingShortcuts 가 관리. */}
        <MountedGlobalSearch
          accountId={null}
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
