"use client";

import Image from "next/image";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, HelpCircle, Plus, X } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useLocalVault } from "@/features/docs-vault-local";
import { FirstRunReadout, useFirstRunSampleModeSettled } from "@/features/first-run-starter";
// 타입/기본값은 Sigma(WebGL) 의존성 없는 별도 모듈에서 직접 import해서
// SSR 평가 경로에 WebGL 참조가 끼지 않도록 한다.
import {
  DEFAULT_SIGMA_CONTROLS,
  type SigmaControlsState,
} from "@/widgets/topology-map-sigma/model/controls-state";
import { HeroCollapsed } from "@/widgets/hero-header";
import { AppNavRail } from "@/widgets/app-nav-rail";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";

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
import { ChromeChip, LiveAnnouncer, Tooltip, useToast } from "@/shared/ui";
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
  getProjectDetailHref,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref, buildNewNodeDoc } from "@/entities/docs-vault";
import {
  buildOntologyHealthSignals,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import {
  buildOntologyTree,
  computeOntologyChangeset,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { useHomeRouteState } from "../model/use-home-route-state";
import {
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
  type TopologyAnalysisMode,
} from "../model/url-state";
import {
  buildTopologyAnalysisSummary,
  buildTopologyHealthActionTarget,
  classifyTopologyRelationQuality,
} from "../lib/topology-analysis";
import { filterOntologyConnectedOrphans } from "../lib/topology-health";
import {
  countProjectRelationsWithinGraph,
  resolveTopologyOverlayState,
  resolveTopologyRenderState,
} from "../lib/topology-render-state";
import { resolveTopologySelectedOntologyNode } from "../lib/resolve-topology-selected-node";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import { FullDetailA1, buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
import {
  TopologyMapV2,
  TopologyV2ContextMenu,
  TopologyV2DetailPanel,
  TopologyV2SettingsGear,
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
  clearTopologyV2TokensCache,
} from "@/widgets/topology-map-v2";
import { buildTopologyV2Graph } from "../lib/topology-v2-adapter";
import {
  TopologyIndexPanel,
  TopologyIndexTab,
  resolveIndexPanelState,
  resolveLeftSlotOwner,
  resolveRenderedIndexPanelState,
  type IndexPanelState,
} from "@/widgets/topology-index-panel";
import {
  buildTopologyOntologyDrawerModel,
  classifyTopologyRelationProvenance,
} from "../lib/topology-ontology-drawer";
import { buildTopologyNodeFocus } from "../lib/topology-node-focus";
import {
  buildNodeSignificance,
  normalizeKindLabelKey,
} from "../lib/topology-node-significance";
import { TopologyAnalysisBar } from "./TopologyAnalysisBar";
import { TopologyReviewLink } from "./TopologyReviewLink";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
import { resolveTopologyEscLadderAction } from "../lib/topology-esc-ladder";

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";
/** INDEX panel preference (B3 허브가 곧 지도) — separate key from the legacy
 * hero-rail `LEFT_PANEL_COLLAPSED_KEY` above, a different feature entirely. */
const INDEX_PANEL_COLLAPSED_KEY = "demo:index-panel-collapsed:v1";

export function HomePage() {
  const t = useTranslations('topology');
  const tKinds = useTranslations('kinds');
  const [sigmaControls, setSigmaControls] = useState<SigmaControlsState>(
    DEFAULT_SIGMA_CONTROLS,
  );
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [sigmaVisibleCount, setSigmaVisibleCount] = useState<number | null>(null);
  const [sigmaGraphStats, setSigmaGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
  const [, setSigmaHintDismissed] = useState(() => {
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
  // root-first-open v3 — vault 미선택 + 정적 모드 + 복원 시도 완료를 하나로
  // 묶은 판정. 브랜드 pill 의 SAMPLE 배지와 우하단 판독(FirstRunReadout)이
  // 이 값을 공유해 drift 없이 같이 켜지고 꺼진다. INDEX 패널 안의 "시작하기"
  // 모듈(FirstRunStarterModule)은 여기에 dismiss 상태까지 더한 자기 판정을
  // 따로 쓴다(useFirstRunStarter) — 모듈을 닫아도 이 배지/판독은 정적 샘플을
  // 계속 둘러보는 동안 남아있는 게 맞는 계약.
  const sampleModeSettled = useFirstRunSampleModeSettled();
  const [routeState, setRouteState] = useHomeRouteState();
  // 헤더 "Concept search" 버튼 · ⌘K · ⇧⌘K 모두 이 팔레트(MountedGlobalSearch,
  // ontology 노드 + 프로젝트 통합 검색)를 연다 — persona-P1 fix: 예전에는
  // ⌘K 가 프로젝트 전용 SearchPalette 를 열어 ontology 노드가 검색 결과에
  // 전혀 없었고(project/doc 만), 그 팔레트의 ALL/HUB/NODE 레이어 칩도 프로젝트
  // 허브 여부만 가르는 축이라 "NODE" 를 눌러도 체감상 no-op 이었다. 세 진입점
  // 모두 이미 kind 필터가 동작하는 단일 통합 팔레트로 합쳐 새 팔레트를 만들지
  // 않는다. 상세 화면(ProjectDetailPage)에서 Cmd+K를 누르면 홈으로 이동하며
  // sessionStorage 플래그를 남긴다 — 여기서 그 플래그가 있으면 첫 렌더부터
  // 이 팔레트를 열어 hydration mismatch 없이 한 번에 보이게 한다. lazy
  // initializer는 클라이언트에서만 실제 실행되므로 SSR은 항상 false, 클라이언트
  // hydration도 sessionStorage 없는 서버 프리렌더 기준 false → 불일치 없음.
  const [ontologySearchOpen, setOntologySearchOpen] = useState(() => {
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
  // SSR 과 첫 클라이언트 렌더가 같아야 한다 — useState 초기화에서
  // localStorage 를 읽으면 hydration mismatch (TopologyAnalysisBar
  // className 의 leftPanelExpanded 분기가 서버/클라 불일치). 저장된
  // 선호는 useSyncExternalStore 의 server snapshot 으로 SSR 기본값을 유지한
  // 뒤 클라이언트 snapshot 에서 반영한다.
  const leftPanelCollapsed = useLocalStorageBoolean(LEFT_PANEL_COLLAPSED_KEY, true);
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);
  // useProjects 실패 시 UI 가 빈 채로 영구 고착되는 걸 막기 위한 에러
  // 상태. 사용자 vault 디스크 read 실패 / 권한 만료 등의 경우 배너 노출
  // + "다시 시도" 버튼으로 복구.
  const toast = useToast();
  const prefetchedProjectHrefsRef = useRef(new Set<string>());
  const preloadedImageUrlsRef = useRef(new Set<string>());
  const {
    activeCategory,
    selectedSlug,
    impactMode,
    analysisMode,
    pathSourceSlug,
    pathTargetSlug,
    createNodeIntent,
    indexState,
  } = routeState;
  const renderProjects = projects;
  // INDEX panel (B3 허브가 곧 지도) — the new default left occupant. Preference
  // persists in localStorage; `?index=` (parsed into `routeState.indexState`)
  // wins for deep-linking (`resolveIndexPanelState` precedence). The analysis
  // rail ("reader lens") and INDEX are exclusive left-slot occupants —
  // `resolveLeftSlotOwner` decides which owns it, per analysis mode +
  // whether the user opted to reveal the overview analysis chrome.
  const indexPanelCollapsedStored = useLocalStorageBoolean(
    INDEX_PANEL_COLLAPSED_KEY,
    false,
  );
  const indexPreference: IndexPanelState = resolveIndexPanelState(
    indexState,
    indexPanelCollapsedStored ? "collapsed" : "expanded",
  );
  const [overviewChromeRevealed, setOverviewChromeRevealed] = useState(false);
  useEffect(() => {
    if (analysisMode === "overview") return;
    let cancelled = false;
    // 동기 setState 회피(cascading-render 경고) — microtask 로 defer.
    window.queueMicrotask(() => {
      if (!cancelled) setOverviewChromeRevealed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [analysisMode]);
  const leftSlotOwner = resolveLeftSlotOwner({
    analysisMode,
    overviewChromeRevealed,
  });
  const renderedIndexState = resolveRenderedIndexPanelState(
    leftSlotOwner,
    indexPreference,
  );
  const setIndexPreference = useCallback(
    (next: IndexPanelState) => {
      try {
        window.localStorage.setItem(
          INDEX_PANEL_COLLAPSED_KEY,
          next === "collapsed" ? "1" : "0",
        );
      } catch {
        /* private mode — URL param still carries the preference */
      }
      setRouteState((current) => ({ ...current, indexState: next }));
    },
    [setRouteState],
  );
  const handleIndexCollapse = useCallback(
    () => setIndexPreference("collapsed"),
    [setIndexPreference],
  );
  // Settings gear's "INDEX 기본 상태" row — writes through the SAME
  // `setIndexPreference` the INDEX panel's own fold/expand controls use, so
  // it persists to `INDEX_PANEL_COLLAPSED_KEY` AND applies immediately
  // (not just "on next reload") for consistent one-source-of-truth behavior.
  const handleChangeIndexDefaultCollapsed = useCallback(
    (next: boolean) => setIndexPreference(next ? "collapsed" : "expanded"),
    [setIndexPreference],
  );
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — whether the analysis rail owns the slot because of a non-
  // overview mode or because the user revealed the overview analysis chrome.
  const handleIndexTabExpand = useCallback(() => {
    setOverviewChromeRevealed(false);
    setIndexPreference("expanded");
    if (analysisMode !== "overview") {
      setRouteState((current) => ({ ...current, analysisMode: "overview" }));
    }
  }, [analysisMode, setIndexPreference, setRouteState, setOverviewChromeRevealed]);
  // The map's safe-inset-left assumes INDEX's width by default
  // (`--topology-v2-safe-inset-left: 344` = 18 inset + 300 width + 26 gap).
  // Collapsing INDEX narrows that reserved space — flip the DOM attribute
  // `app/globals.css` keys off of, invalidate the cached token read (canvas
  // reads CSS vars once per `read-topology-v2-tokens.ts`'s own contract),
  // then force a re-fit via the existing "지도 맞추기" token so the camera
  // actually re-centers against the new width instead of just changing CSS.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.topologyIndex = renderedIndexState;
    clearTopologyV2TokensCache();
    let cancelled = false;
    // 동기 setState 회피(cascading-render 경고) — microtask 로 defer.
    window.queueMicrotask(() => {
      if (!cancelled) setFitViewToken((count) => count + 1);
    });
    return () => {
      cancelled = true;
      delete root.dataset.topologyIndex;
    };
  }, [renderedIndexState]);
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  // R+ ontology 노드 클릭 시 (#259 후속) drawer 가 비지 않게 ontology
  // insight 에서 노드 정보 찾기. selectedSlug 가 ontology id 인데 project
  // 매칭이 없을 때만 사용 — 즉 토폴로지에서 domain/capability/element
  // 노드 클릭한 케이스.
  const { insight: ontologyInsight } = useOntologyInsight();
  // 변경점 baseline(공유 스토어)이 찍혀 있으면, 기준 이후 added/changed 된
  // ontology 노드를 토폴로지에서 pulse 로 강조 — /ontology 변경 패널과 같은
  // 기준을 spatial view 에서도 본다(회의·리뷰).
  const changeBaseline = useChangeBaseline();
  // changeset 을 1회 계산 — pulse(touchedNodeIds)와 재진입 리뷰 pill(#5) 둘 다 사용.
  const ontologyChangeset = useMemo(
    () =>
      computeOntologyChangeset(changeBaseline, ontologyInsight?.nodes ?? [], ontologyInsight?.edges ?? []),
    [changeBaseline, ontologyInsight],
  );
  const changedSlugs = ontologyChangeset.touchedNodeIds;
  const selectedOntologyNode = useMemo(() => {
    if (!selectedSlug || selectedProject) return null;
    if (!ontologyInsight) return null;
    return resolveTopologySelectedOntologyNode(selectedSlug, ontologyInsight.nodes);
  }, [selectedSlug, selectedProject, ontologyInsight]);
  // A `?p=` deep link that resolves to neither a project nor an ontology
  // node used to fail silently (the map just showed nothing highlighted) —
  // the exact "silent no-op" failure mode the old `/ontology` page's
  // deeplinkNotFound notice existed to fix. `/ontology`'s convergence
  // redirect (`OntologyRedirectPage`) can't diagnose this itself (it
  // translates + redirects synchronously, before ontology data loads) — this
  // is the ONE place `?p=` actually gets resolved, so it's the one place
  // that surfaces the miss. Notifies once per distinct dangling slug.
  const deeplinkMissNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSlug || !ontologyInsight) return;
    if (selectedOntologyNode) return;
    // 프로젝트 판정은 로드된 경우에만 신뢰. 미로드(fallback/dogfood) 상태에서는
    // kind-접두 슬러그(온톨로지 형태)만 미스로 알린다 — bare 슬러그는 프로젝트일
    // 수 있어 오탐 방지 (Guardian B3 followup 2: fallback 사용자도 알림 수신).
    if (projectsQuery.loaded) {
      if (selectedProject) return;
    } else if (!selectedSlug.includes(":")) {
      return;
    }
    if (deeplinkMissNotifiedRef.current === selectedSlug) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      deeplinkMissNotifiedRef.current = selectedSlug;
      toast.show(t("deeplinkNotFound", { query: selectedSlug }), "error");
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSlug, projectsQuery.loaded, ontologyInsight, selectedProject, selectedOntologyNode, toast, t]);
  // S1.1 — 토폴로지를 온톨로지의 1차 편집 surface 로. writable 로컬 vault 면
  // 선택 노드를 자기 .md 문서로 해석해 전체 상세(A1)의 본문 인라인 편집을 허용.
  const vault = useLocalVault();
  const nodeEditTarget = useMemo(
    () =>
      selectedOntologyNode
        ? resolveTopologyNodeEditTarget(selectedOntologyNode, vault.manifest?.docs ?? [])
        : null,
    [selectedOntologyNode, vault.manifest],
  );
  // S2 — 토폴로지에서 새 노드를 직접 생성. writable 로컬 vault 일 때만.
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const createNodeToggleRef = useRef<HTMLButtonElement | null>(null);
  const createNodePanelRef = useRef<HTMLDivElement | null>(null);
  const closeCreateNode = useCallback(() => {
    setCreateNodeOpen(false);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: false,
    }));
    window.requestAnimationFrame(() => {
      createNodeToggleRef.current?.focus();
    });
  }, [setRouteState]);
  const canCreateNode = vault.manifest !== null;
  const createNode = useCallback(
    async (input: { title: string; kind: CreateNodeKind; domain?: string }) => {
      try {
        const { slug, markdown } = buildNewNodeDoc(input);
        await vault.createDoc(slug, markdown);
        toast.show(t("createNode.toastSaved", { slug }), "success");
        closeCreateNode();
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      }
    },
    [closeCreateNode, vault, toast, t],
  );
  const handleCreateNodePanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCreateNode();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const panel = createNodePanelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true" &&
          el.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeCreateNode],
  );
  // S4 — 노드 "설명"(본문) 편집. manifest 의 excerpt 는 잘려 있어 편집 시
  // 손실 위험 → 편집 전 fileHandle 로 *raw 전체*를 읽어 본문을 시드한다.
  // 본문 로드 완료 전엔 explanationEdit 를 안 띄워 truncation 을 막는다.
  const [nodeBody, setNodeBody] = useState<{ slug: string; raw: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const target = nodeEditTarget;
    const fh =
      target && vault.manifest !== null ? vault.fileHandles.get(target.vaultSlug) : null;
    if (!target || !fh) {
      // 동기 setState 회피(cascading-render 경고) — microtask 로 defer.
      window.queueMicrotask(() => {
        if (!cancelled) setNodeBody(null);
      });
      return () => {
        cancelled = true;
      };
    }
    fh.getFile()
      .then((f) => f.text())
      .then((raw) => {
        if (!cancelled) {
          setNodeBody({ slug: target.vaultSlug, raw, body: parseFrontmatter(raw).body.trim() });
        }
      })
      .catch(() => {
        if (!cancelled) setNodeBody(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeEditTarget, vault.manifest, vault.fileHandles]);
  const saveNodeExplanation = useCallback(
    async (next: string) => {
      if (!nodeEditTarget || !nodeBody || nodeBody.slug !== nodeEditTarget.vaultSlug) return;
      try {
        const content = replaceVaultBody(nodeBody.raw, next);
        await vault.saveDoc(nodeEditTarget.vaultSlug, content, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(t("explanationEdit.saved"), "success");
      } catch {
        toast.show(t("explanationEdit.error"), "error");
      }
    },
    [nodeEditTarget, nodeBody, vault, toast, t],
  );
  const combinedFitToken = fitViewToken;
  const analysisModeRef = useRef<TopologyAnalysisMode>("overview");
  // 클라이언트 사이드 동적 타이틀 — 선택 프로젝트 컨텍스트를 브라우저 탭에
  // 노출 (정적 export 환경의 page metadata 한계 보완).
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          selectedOntologyNode?.title,
          t('documentTitle'),
          "ontology-atlas",
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

  // topology-map-v2 mount gap fix — the P2 scaffold (87edec961) wired
  // `<TopologyMapV2 nodes={[]} edges={[]} />` as a deliberate placeholder,
  // so flipping the flag mounted the v2 canvas but left it with nothing to
  // draw. `buildTopologyV2Graph` derives the real adapter-contract
  // nodes/edges from the same `ontologyInsight` the other two engines
  // already draw (topology-v2-adapter.ts).
  const topologyV2Graph = useMemo(
    () =>
      ontologyInsight
        ? buildTopologyV2Graph(ontologyInsight.nodes, ontologyInsight.edges, {
            changedSlugs,
          })
        : { nodes: [], edges: [] },
    [ontologyInsight, changedSlugs],
  );

  const canvasSelectedSlug = selectedProject?.slug ?? selectedOntologyNode?.id ?? selectedSlug;
  const drawerProject = selectedProject;

  // 노드 클릭 default = 컴팩트 ego 팝오버. 풀스크린 드로어는 "전체 상세" opt-in.
  // overview first, details-on-demand — 설계: docs/TOPOLOGY-FOCUS-AND-SCALE.md
  // 어느 노드의 전체 상세가 열렸는지를 slug 로 들고, 현재 선택 노드와 일치할
  // 때만 드로어 — 다른 노드를 고르면 자동으로 팝오버부터(effect 불필요).
  const [fullDetailSlug, setFullDetailSlug] = useState<string | null>(null);
  // W2-B — node right-click context menu. `slug` here is the CANVAS graph
  // node id (`TopologyV2Node.id`, same id space `onSelect`/`handleSelect`
  // use), reported by `use-topology-loop.ts`'s tier-aware hit test; `x`/`y`
  // are viewport-space cursor coordinates the menu anchors to.
  const [contextMenuNode, setContextMenuNode] = useState<
    { slug: string; x: number; y: number } | null
  >(null);
  const closeContextMenu = useCallback(() => setContextMenuNode(null), []);
  const handleContextMenuNode = useCallback(
    (slug: string, position: { x: number; y: number }) => {
      setContextMenuNode({ slug, x: position.x, y: position.y });
    },
    [],
  );
  const [
    selectedInspectorSupportRailSlug,
    setSelectedInspectorSupportRailSlug,
  ] = useState<string | null>(null);
  const interactionSelectedSlugRef = useRef<string | null>(null);
  const [selectedRelationActive, setSelectedRelationActive] = useState(false);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  const topologyShortcutHelpPhoneVisible =
    analysisMode !== "path" && analysisMode !== "health";
  const createNodePending = createNodeIntent && !canCreateNode;
  const topologyCreateNodeBlockingActive = createNodeOpen || createNodePending;
  const topologyBlockingOverlayState = createNodeOpen
    ? "create-node"
    : createNodePending
      ? "create-node-pending-vault"
      : ontologySearchOpen
        ? "global-search"
        : shortcutsOpen
          ? "shortcuts"
          : "none";
  const topologyBlockingOverlayActive = topologyBlockingOverlayState !== "none";
  const openCreateNode = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    setFullDetailSlug(null);
    setCreateNodeOpen(true);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: true,
    }));
  }, [setRouteState]);
  useEffect(() => {
    if (!createNodeIntent) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (canCreateNode && !createNodeOpen) {
        openCreateNode();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canCreateNode, createNodeIntent, createNodeOpen, openCreateNode, setRouteState]);
  // 작성된 frontmatter `significance` (approach C override) — 있으면 "왜 중요한가"
  // 줄을 derive 대신 그걸로. 미지정 키는 파서가 보존하므로 schema 변경 0.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  // drawer model 1회 빌드로 focus(팝오버 연결) + significance(평문 so-what) 둘 다
  // 파생 — 재계산 0, count drift 불가.
  const nodeFocusData = useMemo(() => {
    if (!selectedOntologyNode || !ontologyInsight) return null;
    const model = buildTopologyOntologyDrawerModel(
      selectedOntologyNode,
      ontologyInsight.nodes,
      ontologyInsight.edges,
    );
    return {
      focus: buildTopologyNodeFocus(selectedOntologyNode, model),
      significance: buildNodeSignificance(selectedOntologyNode, model, {
        authoredSignificance,
      }),
    };
  }, [selectedOntologyNode, ontologyInsight, authoredSignificance]);
  const nodeFocus = nodeFocusData?.focus ?? null;
  // topology-map-v2 "component datasheet" panel. Re-presents the
  // nodeFocus/significance facts — grouped connections + one engraved metric
  // line + an agent handoff payload. See widgets/topology-map-v2/TopologyV2DetailPanel.
  //
  // R+ 카운트 시맨틱 통일: the metric's usedBy/dependsOn now come from the
  // SAME `groups` object the panel renders headers from (`groups.usedBy.total`
  // / `groups.dependsOn.total`), not from `nodeFocus.usedByCount`/
  // `dependsOnCount` (raw incoming/outgoing edge counts, not deduped by
  // neighbor). Previously these were two independently-computed numbers that
  // could diverge whenever a neighbor had a parallel edge — the persona bug
  // ("used by 10 · depends on 73" vs groups "포함 71 / 의존 12"). One
  // construction, one number, everywhere.
  const v2DatasheetModel = useMemo(() => {
    if (!nodeFocus || !selectedOntologyNode || !ontologyInsight) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    // Group from the FULL connection set (not the shared 5-item outgoing-first
    // preview) so a hub's dependsOn group renders its real total instead of
    // collapsing into a generic overflow — and the handoff names never
    // contradict the depends_on count.
    const connections = buildV2Connections(
      selectedOntologyNode.id,
      ontologyInsight.nodes,
      ontologyInsight.edges,
    );
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(selectedOntologyNode.evidenceIds);
    const metric = {
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      evidence: evidenceRows.length,
    };
    const handoffText = formatV2HandoffText({
      slug,
      kind: nodeFocus.kind,
      domainTitle: nodeFocusData?.significance.ownerDomainTitle ?? null,
      usedBy: metric.usedBy,
      dependsOn: metric.dependsOn,
      evidence: metric.evidence,
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
    });
    return {
      slug,
      // W2-A "경로" action tile — `handleSetPathSource` feeds this straight
      // into `pathSourceSlug` route state, which every OTHER consumer
      // (`selectedOntologyNode`, `resolveTopologySelectedOntologyNode`,
      // `handleSelect`) keys by the CANVAS GRAPH id, not the vault slug.
      // Passing `.slug` (the vault-slug-preferring fallback used for
      // documentHref/builderEditHref/handoffText below) here desynced
      // `pathSourceSlug` from `selectedSlug` and silently dropped the path —
      // caught live (QA screenshot showed the map reset to plain overview
      // instead of "Starting from <node>. Choose a target."). `nodeId` is
      // always the graph id.
      nodeId: selectedOntologyNode.id,
      title: nodeFocus.title,
      kind: nodeFocus.kind,
      powered: changedSlugs.has(selectedOntologyNode.id),
      metric,
      groups,
      evidence: { rows: evidenceRows, total: evidenceRows.length },
      handoffText,
      // W2-A "문서" action tile — same construction as fullDetailA1Model's
      // own `documentHref` (null when the node has no backing vault doc, so
      // the tile renders disabled instead of linking to a guessed URL).
      documentHref: nodeFocus.sourceSlug
        ? buildDocsVaultHref({ slug: nodeFocus.sourceSlug })
        : null,
      // W2-A "관계 편집" action tile — existing `/ontology/edit/?node=` deep
      // link, same pattern as `RelationWriteConfirm.tsx`'s (private)
      // `buildRelationBuilderHref` and received by `OntologyEditPage` via
      // `resolveBuilderQueryNodeSlug`.
      builderEditHref: `/ontology/edit/?node=${encodeURIComponent(slug)}`,
    };
  }, [nodeFocus, selectedOntologyNode, ontologyInsight, nodeFocusData, changedSlugs]);
  const copyV2NodeHandoff = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (ok) toast.show(t("nodeDatasheet.handoffCopied"), "success");
    },
    [t, toast],
  );
  // W2-A "경로" action tile — sets this node as the path-analysis source and
  // enters path mode. Reuses `selectTopologyPathRouteState` (already defined
  // in `model/url-state.ts` for the URL-driven path deep link, but never
  // wired to an in-app interaction until now) — no new path-mode entry logic.
  const handleSetPathSource = useCallback(
    (slug: string) => {
      interactionSelectedSlugRef.current = null;
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) =>
        selectTopologyPathRouteState(current, {
          sourceSlug: slug,
          targetSlug: null,
        }),
      );
    },
    [setRouteState],
  );
  // W2-B context menu quick-action model — same construction as
  // `v2DatasheetModel` (documentHref/builderEditHref/handoffText), but keyed
  // off whichever node was right-clicked rather than the current selection,
  // since the context menu is reachable without selecting the node first.
  // `domainTitle: null` in the handoff payload is a deliberate simplification
  // (the owner-domain lookup lives in `buildNodeSignificance`, which needs the
  // full drawer model this quick lookup intentionally skips) — the payload
  // still degrades to `domain: -`, never throws or omits the field.
  const contextMenuModel = useMemo(() => {
    if (!contextMenuNode || !ontologyInsight) return null;
    const node = ontologyInsight.nodes.find((n) => n.id === contextMenuNode.slug);
    if (!node) return null;
    const sourceSlug = node.evidenceIds[0] ?? null;
    const slug = sourceSlug ?? node.id;
    const connections = buildV2Connections(node.id, ontologyInsight.nodes, ontologyInsight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(node.evidenceIds);
    const handoffText = formatV2HandoffText({
      slug,
      kind: node.kind,
      domainTitle: null,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      evidence: evidenceRows.length,
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
    });
    return {
      nodeId: node.id,
      slug,
      documentHref: sourceSlug ? buildDocsVaultHref({ slug: sourceSlug }) : null,
      builderEditHref: `/ontology/edit/?node=${encodeURIComponent(slug)}`,
      handoffText,
    };
  }, [contextMenuNode, ontologyInsight]);
  // A1 "데이터시트 확장판" 전체 상세 — TopologyOntologyDrawer(배지 수프 +
  // reach 쿼리빌더 + collaborator brief)를 대체. groups/reach 는 compact
  // datasheet 와 동일 소스(buildV2Connections 파생, buildOntologyReachability
  // 재사용)라 두 표면의 숫자가 절대 drift 하지 않는다.
  const fullDetailA1Model = useMemo(() => {
    if (!nodeFocus || !selectedOntologyNode || !ontologyInsight) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    const groups = buildFullDetailGroups(
      selectedOntologyNode.id,
      ontologyInsight.nodes,
      ontologyInsight.edges,
      changedSlugs,
    );
    const reach = buildFullDetailReachModel(
      selectedOntologyNode.id,
      ontologyInsight.nodes,
      ontologyInsight.edges,
    );
    const projectTitle =
      ontologyInsight.nodes.find((n) => n.kind === "project")?.title ?? null;
    const loadedBody =
      nodeBody && nodeBody.slug === slug ? nodeBody.body : null;
    const bodyMarkdown = loadedBody ?? selectedOntologyNode.summary ?? null;
    const documentHref = nodeFocus.sourceSlug
      ? buildDocsVaultHref({ slug: nodeFocus.sourceSlug })
      : null;
    const explanationEdit =
      nodeEditTarget &&
      vault.manifest !== null &&
      nodeBody &&
      nodeBody.slug === nodeEditTarget.vaultSlug
        ? { onSave: saveNodeExplanation }
        : null;
    return {
      node: {
        id: selectedOntologyNode.id,
        title: nodeFocus.title,
        kind: nodeFocus.kind,
        slug,
        fresh: changedSlugs.has(selectedOntologyNode.id),
      },
      groups,
      reach,
      breadcrumb: {
        projectTitle,
        totalConcepts: renderProjects.length + ontologyInsight.nodes.length,
        totalRelations: ontologyInsight.edges.length,
      },
      bodyMarkdown,
      explanationEdit,
      documentHref,
    };
  }, [
    nodeFocus,
    selectedOntologyNode,
    ontologyInsight,
    renderProjects,
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vault.manifest,
    saveNodeExplanation,
  ]);
  const selectedNodeFocusActive =
    Boolean(
      selectedOntologyNode &&
        ontologyInsight &&
        nodeFocus &&
        !fullDetailOpen &&
        analysisMode !== "path",
    );
  const selectedInspectorSupportRailVisible =
    selectedNodeFocusActive && selectedInspectorSupportRailSlug === selectedSlug;
  const selectedNodeOwnsRightRail = selectedNodeFocusActive;
  const topologyUtilityChromeState = selectedRelationActive
    ? "collapsed-active-relation"
    : selectedNodeOwnsRightRail
      ? "selected-node-inspector"
      : selectedSlug
        ? "compact-focus"
        : "visible";
  const topologyUtilityChromeCompact =
    topologyUtilityChromeState === "compact-focus" ||
    topologyUtilityChromeState === "selected-node-inspector";
  const topologyUtilityLaneSuppressionContract = selectedRelationActive
    ? "selected-relation-inspector-owns-right-rail"
    : selectedNodeOwnsRightRail
      ? "selected-node-inspector-owns-right-rail"
      : undefined;

  const handleToggleSelectedInspectorSupportRail = useCallback(() => {
    if (!selectedSlug) return;
    setSelectedInspectorSupportRailSlug((current) =>
      current === selectedSlug ? null : selectedSlug,
    );
  }, [selectedSlug]);

  const handleSelect = useCallback(
    (
      slug: string,
      options?: { preserveImpact?: boolean },
    ) => {
      // Ontology node clicks and shareable vault slugs both stay on
      // /topology; selected-node resolution happens against ontologyInsight.
      // 노드 선택 = drawer 열기. 허브를 선택하면 포커스 모드 자동 활성,
      // 일반 노드는 포커스 해제.
      // projectBySlug Map 으로 O(1) lookup — 이전엔 매 클릭마다
      // renderProjects.find 로 O(N) 스캔.
      // 새 노드 선택(연결 클릭 포함) = 관계 row 가 보이는 inspector 부터.
      // 사용자가 지도만 크게 보고 싶을 때 "지도 보기"로 명시적으로 접는다.
      interactionSelectedSlugRef.current = slug;
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      const project = projectBySlug.get(slug);
      setRouteState((current) =>
        selectTopologyNodeRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
      dismissSigmaHint();
    },
    [projectBySlug, setRouteState, dismissSigmaHint],
  );

  const handleClose = useCallback(() => {
    interactionSelectedSlugRef.current = null;
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    setRouteState((current) => ({
      ...current,
      selectedSlug: null,
      focusedHubSlug: null,
      impactMode: "none",
      // 펼침(초점)의 닫기 = 지도 복귀. 배경 클릭/Esc/팝오버 X 가 전개를
      // 접는다 — 클릭=선택, 배지=펼치기, 닫기=접기의 대칭 완성.
      analysisMode:
        current.analysisMode === "focus" ? "overview" : current.analysisMode,
    }));
  }, [setRouteState]);

  // P0#3 — Esc staged-close ladder (docs/FEATURES.md / shortcut sheet's
  // `stepCloseOverlays` promise: "Close drawers and overlays one step at a
  // time"). The composer/shortcuts/docs-drawer overlays already close
  // themselves on Escape; this effect covers what previously had no Escape
  // binding at all — the full-detail drawer, the relation lens, the selected
  // node itself, and the local-graph ego-drill breadcrumb (which used to pop
  // unconditionally on every Escape, racing with whatever else was open).
  //
  // `searchOpen: ontologySearchOpen` is passed so the ladder returns "none"
  // while the palette (a Radix `Dialog`) is open — otherwise this
  // window-level handler ALSO fired on the same keypress (e.g. deselecting
  // the node underneath), so one Escape closed both the palette AND the
  // selection.
  //
  // `event.defaultPrevented` is checked FIRST and is what actually closes the
  // race in the browser: Radix's `DismissableLayer` registers its own Escape
  // handler on `document` with `{ capture: true }` (`useEscapeKeydown`) and
  // calls `event.preventDefault()` + synchronously flushes
  // `onOpenChange(false)` — verified live, this had ALREADY happened
  // (`ontologySearchOpen` read back `false`, `event.defaultPrevented` already
  // `true`) by the time this bubble-phase `window` listener ran on the SAME
  // keypress. `searchOpen` stays as an explicit, testable input for the
  // decision table (see `topology-esc-ladder.test.ts`) and covers any future
  // dismissable surface that does the same without calling
  // `preventDefault()`; `defaultPrevented` covers Radix's actual (capture +
  // synchronous-flush) behavior. Kept on the bubble phase (not capture) so
  // this doesn't reorder relative to unrelated local Escape handlers (e.g.
  // inline-field-edit cancel) elsewhere on the page.
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const action = resolveTopologyEscLadderAction({
        contextMenuOpen: contextMenuNode !== null,
        createNodeOpen,
        searchOpen: ontologySearchOpen,
        fullDetailOpen,
        selectedRelationActive,
        hasSelection: canvasSelectedSlug != null,
        hasLocalGraphRoot: localGraphRoot !== null,
      });
      switch (action) {
        case "close-context-menu":
          closeContextMenu();
          break;
        case "close-create-node":
          closeCreateNode();
          break;
        case "close-full-detail":
          setFullDetailSlug(null);
          break;
        case "close-relation-lens":
          setSelectedRelationActive(false);
          break;
        case "deselect":
          handleClose();
          break;
        case "pop-local-graph":
          setLocalGraphStack((stack) => stack.slice(0, -1));
          break;
        case "none":
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    contextMenuNode,
    createNodeOpen,
    ontologySearchOpen,
    fullDetailOpen,
    selectedRelationActive,
    canvasSelectedSlug,
    localGraphRoot,
    closeContextMenu,
    closeCreateNode,
    handleClose,
  ]);

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
  // ⌘K 와 ⇧⌘K 는 이제 동일한 팔레트(ontology 노드 + 프로젝트 통합 검색)를
  // 연다 — persona-P1: 예전엔 ⌘K 만 프로젝트 전용 SearchPalette 를 열어
  // ontology 노드를 절대 찾을 수 없었다. useTypingShortcuts 는 첫 일치 후
  // return 하므로 순서 자체는 유지(둘 다 같은 setter 를 호출해 순서 무관하지만
  // 관례상 shift 조합을 먼저 둔다).
  useTypingShortcuts([
    {
      combo: { key: "k", meta: true, shift: true },
      onFire: () => {
        if (createNodeOpen) return;
        setOntologySearchOpen((v) => !v);
      },
    },
    {
      combo: { key: "k", meta: true },
      onFire: () => {
        if (createNodeOpen) return;
        setOntologySearchOpen((v) => !v);
      },
    },
    {
      combo: { key: "?" },
      onFire: () => {
        if (createNodeOpen) return;
        setShortcutsOpen((v) => !v);
      },
    },
    {
      combo: { key: "d" },
      onFire: () => {
        if (createNodeOpen) return;
        setDocsDrawerOpen((v) => !v);
      },
    },
  ]);

  const drawerOpen = drawerProject !== null || selectedOntologyNode !== null;
  const analysisSelectedTitle = useMemo(
    () =>
      compactTopologyPanelTitle(
        selectedProject?.name ?? selectedOntologyNode?.title ?? null,
      ),
    [selectedOntologyNode?.title, selectedProject?.name],
  );
  const pathSourceTitle = useMemo(
    () =>
      resolveTopologyNodeTitle({
        slug: pathSourceSlug,
        projectBySlug,
        ontologyNodes: ontologyInsight?.nodes,
      }),
    [pathSourceSlug, projectBySlug, ontologyInsight?.nodes],
  );
  const pathTargetTitle = useMemo(
    () =>
      resolveTopologyNodeTitle({
        slug: pathTargetSlug,
        projectBySlug,
        ontologyNodes: ontologyInsight?.nodes,
      }),
    [pathTargetSlug, projectBySlug, ontologyInsight?.nodes],
  );
  const topologyHealthSummary = useMemo(() => {
    const now = new Date(mountNowMs);
    const stale = detectStaleProjects(renderProjects, {
      now,
      daysThreshold: 30,
    });
    // ontology containment 에 참여하는 프로젝트(루트 등)는 소속 미정 오탐에서
    // 제외 — project-deps 렌즈만으로는 contains 그래프가 안 보인다 (감사 ⑦-a).
    const orphan = filterOntologyConnectedOrphans(
      detectOrphanProjects(renderProjects),
      ontologyInsight?.edges ?? [],
    );
    const promotion = detectPromotionCandidates(renderProjects, {
      minFanIn: 4,
    });
    const ontologySignals = ontologyInsight
      ? buildOntologyHealthSignals(ontologyInsight.nodes, ontologyInsight.edges, {
          now,
          staleDaysThreshold: 30,
          promotionMinFanIn: 4,
        })
      : { stale: [], orphan: [], promotion: [] };
    const staleSignals = [...stale, ...ontologySignals.stale];
    const orphanSignals = [...orphan, ...ontologySignals.orphan];
    const promotionSignals = [...promotion, ...ontologySignals.promotion];

    return {
      staleCount: staleSignals.length,
      orphanCount: orphanSignals.length,
      promotionCount: promotionSignals.length,
      actionTarget: buildTopologyHealthActionTarget({
        stale: staleSignals,
        orphan: orphanSignals,
        promotion: promotionSignals,
      }),
    };
  }, [renderProjects, ontologyInsight, mountNowMs]);
  const topologyTotalNodes =
    renderProjects.length + (ontologyInsight?.nodes.length ?? 0);
  const topologyTotalRelations =
    renderProjects.reduce((sum, project) => sum + project.dependencies.length, 0) +
    (ontologyInsight?.edges.length ?? 0);
  // INDEX tree data — the SAME `buildOntologyTree` the old `/ontology` tree
  // page used (`@/shared/lib/ontology-tree`), so the census row above and the
  // tree rows below can never drift from the chrome's own `topologyTotalNodes`
  // / `topologyTotalRelations`.
  const indexTreeResult = useMemo(
    () => (ontologyInsight ? buildOntologyTree(ontologyInsight.nodes, ontologyInsight.edges) : null),
    [ontologyInsight],
  );
  const indexDomainCount = useMemo(
    () => ontologyInsight?.nodes.filter((node) => node.kind === "domain").length ?? 0,
    [ontologyInsight],
  );
  // root-first-open v3 우하단 판독(`FirstRunReadout`) 의 "N project" 숫자 —
  // 실데이터, indexDomainCount 와 같은 ontologyInsight 파생이라 drift 불가.
  const firstRunProjectCount = useMemo(
    () => ontologyInsight?.nodes.filter((node) => node.kind === "project").length ?? 0,
    [ontologyInsight],
  );
  const visibleTopologyNodeCount =
    localGraphRoot === null ? topologyTotalNodes : localGraphProjects.length;
  const visibleTopologyRelationCount =
    localGraphRoot === null
      ? topologyTotalRelations
      : countProjectRelationsWithinGraph(localGraphProjects);
  const visibleTopologyStatsKey = useMemo(
    () =>
      [
        localGraphRoot ?? "__root__",
        localGraphProjects
          .map((project) => `${project.slug}:${project.dependencies.join(",")}`)
          .join("|"),
        ontologyInsight ? `${ontologyInsight.nodes.length}:${ontologyInsight.edges.length}` : "0:0",
      ].join("::"),
    [localGraphRoot, localGraphProjects, ontologyInsight],
  );
  const currentSigmaGraphStats =
    sigmaGraphStats?.key === visibleTopologyStatsKey ? sigmaGraphStats : null;
  const topologyRenderState = resolveTopologyRenderState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentSigmaGraphStats?.relations ?? visibleTopologyRelationCount,
  });
  const topologyFiltersActive =
    activeCategory !== null ||
    sigmaControls.searchQuery.trim().length > 0 ||
    sigmaControls.depthLimit !== null ||
    sigmaControls.hubsOnly;
  // The overview relation-visibility pill's only producer was the legacy
  // Sigma-as-engine's `onRelationVisibilityChange` callback — deleted along
  // with that branch. TopologyMapV2 doesn't wire an equivalent yet, so this
  // has been `null` (pill hidden) since v2 went default-on in PR #330; kept
  // as an explicit `null` here rather than removing the prop, so wiring a
  // v2 producer later is a one-line change instead of a rediscovery.
  const overviewRelationVisibility = null;
  const pathCandidateVisibility =
    analysisMode === "path"
      ? {
          visible: sigmaVisibleCount ?? topologyTotalNodes,
          total: sigmaVisibleCount ?? topologyTotalNodes,
        }
      : null;
  const topologyOverlayState = resolveTopologyOverlayState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentSigmaGraphStats?.relations ?? visibleTopologyRelationCount,
    visibleNodes: sigmaVisibleCount,
    filtersActive: topologyFiltersActive,
  });
  const emptyTopologyNodeCount = currentSigmaGraphStats?.nodes ?? visibleTopologyNodeCount;
  const handleSigmaGraphStatsChange = useCallback(
    (stats: { nodes: number; relations: number }) => {
      setSigmaGraphStats({ key: visibleTopologyStatsKey, ...stats });
    },
    [visibleTopologyStatsKey],
  );
  const clearTopologyFilters = useCallback(() => {
    setSigmaControls((current) => ({
      ...current,
      searchQuery: "",
      depthLimit: null,
      hubsOnly: false,
    }));
    setRouteState((current) => ({
      ...current,
      activeCategory: null,
    }));
  }, [setRouteState]);
  const topologyRelationProvenance = useMemo(() => {
    const counts = { sourceBacked: 0, authored: 0, needsReview: 0 };
    for (const edge of ontologyInsight?.edges ?? []) {
      const provenance = classifyTopologyRelationProvenance(edge);
      if (provenance === "source_backed") {
        counts.sourceBacked += 1;
      } else if (provenance === "needs_review") {
        counts.needsReview += 1;
      } else {
        counts.authored += 1;
      }
    }
    return counts;
  }, [ontologyInsight]);
  const topologyRelationQuality = useMemo(() => {
    const counts = { strong: 0, supported: 0, weak: 0, review: 0 };
    for (const edge of ontologyInsight?.edges ?? []) {
      counts[classifyTopologyRelationQuality(edge)] += 1;
    }
    return counts;
  }, [ontologyInsight]);
  const analysisSummary = buildTopologyAnalysisSummary({
    mode: analysisMode,
    selectedTitle: analysisSelectedTitle,
    visibleCount: sigmaVisibleCount,
    totalCount: topologyTotalNodes,
    relationCount: topologyTotalRelations,
    relationProvenance: topologyRelationProvenance,
    relationQuality: topologyRelationQuality,
    ...topologyHealthSummary,
  });
  useEffect(() => {
    if (analysisModeRef.current === analysisMode) return;
    analysisModeRef.current = analysisMode;

    setSigmaControls((current) => {
      if (analysisMode === "focus") {
        return {
          ...current,
          depthLimit: current.depthLimit ?? 2,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            backrefHighlight: true,
            auditHighlight: false,
          },
        };
      }
      if (analysisMode === "health") {
        return {
          ...current,
          depthLimit: null,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            auditHighlight: true,
            backrefHighlight: false,
          },
        };
      }
      if (analysisMode === "path") {
        return {
          ...current,
          depthLimit: null,
          hubsOnly: false,
          overlays: {
            ...current.overlays,
            auditHighlight: false,
          },
        };
      }
      return {
        ...current,
        depthLimit: null,
        overlays: {
          ...current.overlays,
          auditHighlight: false,
        },
      };
    });
  }, [analysisMode]);

  // 카드 배지/더블클릭의 명시적 "펼치기" — 선택과 초점 진입을 한 번에.
  const handleExpandRequest = useCallback(
    (slug: string) => {
      interactionSelectedSlugRef.current = slug;
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) => ({
        ...selectTopologyNodeRouteState(current, slug, {
          isHub: Boolean(projectBySlug.get(slug)?.isHub),
        }),
        analysisMode: "focus",
      }));
    },
    [projectBySlug, setRouteState],
  );

  const handleSelectAnalysisMode = useCallback(
    (mode: TopologyAnalysisMode) => {
      setRouteState((current) => ({
        ...current,
        analysisMode: mode,
        pathSourceSlug: mode === "path" ? current.pathSourceSlug : null,
        pathTargetSlug: mode === "path" ? current.pathTargetSlug : null,
      }));
    },
    [setRouteState],
  );

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
    <main id="main" className="relative flex h-screen w-screen overflow-hidden bg-[color:var(--color-canvas)]">
      {/* 좌측 64px 내비 레일 (feat/chrome-system) — 전역 목적지 + 하단
          에이전트 상태·설정. 캔버스 밖 flex 형제라 아래 wrapper 의
          `absolute left-4/top-4 …` 류 값은 그대로 두어도 이 wrapper 의
          로컬 (0,0) 기준으로 재계산돼 자동으로 64px 밀린다 — 개별 인셋 값을
          손대지 않아도 되는 이유. 이번 슬라이스 마운트 범위는 지형도만. */}
      <AppNavRail
        settingsSlot={
          <TopologyV2SettingsGear
            indexDefaultCollapsed={indexPanelCollapsedStored}
            onChangeIndexDefaultCollapsed={handleChangeIndexDefaultCollapsed}
            changeVaultHref="/docs/?intent=local"
            popoverAlign="left"
            popoverSide="top"
            labels={{
              trigger: t('controls.settingsGearAriaLabel'),
              heading: t('controls.settingsGearHeading'),
              locale: t('controls.settingsGearLocale'),
              theme: t('controls.settingsGearTheme'),
              indexDefault: t('controls.settingsGearIndexDefault'),
              indexDefaultExpanded: t('controls.settingsGearIndexDefaultExpanded'),
              indexDefaultCollapsed: t('controls.settingsGearIndexDefaultCollapsed'),
              changeVault: t('controls.settingsGearChangeVault'),
              changeVaultAriaLabel: t('controls.settingsGearChangeVaultAriaLabel'),
            }}
          />
        }
      />
      <div className="relative h-full flex-1 overflow-hidden">
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
                    ontology-atlas
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
              // growth 는 별도 prop(censusGrowthText)으로 넘겨 HeroCollapsed 가
              // 인디고로 강조 표시(feat/chrome-system §5 census 각인)할 수
              // 있게 한다 — 여기서 한 문자열로 합치면 세그먼트별 스타일이 안 됨.
              const workspaceSubtitle = t('workspace.subtitle', {
                concepts: topologyTotalNodes,
                relations: topologyTotalRelations,
                growth: '',
              });
              const workspaceEyebrow = t('workspace.eyebrow', {
                concepts: topologyTotalNodes,
              });
              // 확장 hero 패널 제거 (사용자 결정 2026-06-11) — 컴팩트 pill 이
              // 유일한 상태고, ontology 칩 스트립을 pill 아래에 통합한다.
              // 확장형의 큰 타이틀+버튼 그리드는 지도와 경쟁하는 chrome 이었다.
              void workspaceEyebrow;
              return (
                <div
                  // xl:left-8(32px) → xl:left-[var(--chrome-inset)](24px) —
                  // feat/chrome-system §4, 24px 정렬 레일에 수렴(단일 출처).
                  className="topology-ui-scale pointer-events-none absolute left-4 top-4 z-10 hidden md:flex md:flex-col md:items-start md:gap-2 md:left-6 md:top-6 xl:left-[var(--chrome-inset)] xl:top-8"
                  data-testid="topology-top-left-chrome-group"
                  data-workspace-context-state={
                    selectedRelationActive
                      ? "compact-active-relation"
                      : selectedNodeFocusActive
                        ? selectedInspectorSupportRailVisible
                          ? "selected-inspector-support-open"
                          : "selected-inspector-support-closed"
                        : "default"
                  }
                  data-selected-inspector-support-rail={
                    selectedNodeFocusActive
                      ? selectedInspectorSupportRailVisible
                        ? "open"
                        : "closed"
                      : undefined
                  }
                  data-selected-inspector-support-contract={
                    selectedNodeFocusActive
                      ? "left-panel-collapsed-until-user-expands"
                      : undefined
                  }
                >
                  <HeroCollapsed
                    // 확장 hero 가 사라진 surface — 토글은 의미가 없고
                    // 분석 패널만 아래로 점프시켰다(사용자 보고). 드로어가
                    // 열려 있을 때만 "닫기" 동작으로.
                    onExpand={
                      selectedNodeFocusActive
                        ? handleToggleSelectedInspectorSupportRail
                        : drawerOpen
                          ? handleClose
                          : undefined
                    }
                    title={selectedProject?.name ?? t('workspace.fallbackTitle')}
                    subtitle={
                      selectedProject
                        ? t('workspace.selectedEyebrow')
                        : topologyTotalNodes > 0
                          ? workspaceSubtitle
                          : t('workspace.expandHint')
                    }
                    censusGrowthText={
                      !selectedProject && topologyTotalNodes > 0
                        ? growthLabel || undefined
                        : undefined
                    }
                    subtitleVariant={
                      !selectedProject && topologyTotalNodes > 0 ? 'census' : 'eyebrow'
                    }
                    icon={selectedProject?.icon ?? null}
                    ariaLabel={
                      selectedNodeFocusActive
                        ? selectedInspectorSupportRailVisible
                          ? t('hero.collapseLeftPanel')
                          : t('hero.expandLeftPanel')
                        : drawerOpen
                          ? t('hero.closeSelected')
                          : t('hero.expandLeftPanel')
                    }
                    titleText={
                      selectedNodeFocusActive
                        ? selectedInspectorSupportRailVisible
                          ? t('hero.collapseLeftPanel')
                          : t('hero.expandLeftPanel')
                        : drawerOpen
                          ? t('hero.closeSelected')
                          : t('hero.expandLeftPanel')
                    }
                    compact={selectedRelationActive}
                    sampleBadge={sampleModeSettled}
                  />
                  {/* WorkspaceOntologyStrip 제거(2026-06-11) — 분석 패널과
                      겹쳤고(사용자 보고), 카운트는 pill·범례가, 온톨로지
                      진입은 우측 라운드 버튼이 이미 담당. */}
                </div>
              );
            })()}
            <div
              data-testid="topology-command-chrome"
              data-command-chrome-state={topologyUtilityChromeState}
              data-blocking-overlay-state={topologyBlockingOverlayState}
              data-create-node-intent-state={
                createNodeOpen
                  ? "active-blocking-composer"
                  : createNodePending
                    ? "pending-writable-vault"
                    : "idle"
              }
              data-attention-role={
                selectedRelationActive
                  ? "demoted-utility"
                  : topologyBlockingOverlayActive
                    ? "demoted-under-blocking-overlay"
                    : "utility-chrome"
              }
              data-utility-lane-height-token={
                topologyUtilityChromeCompact ? "--topology-utility-lane-height" : undefined
              }
              data-utility-lane-gap-token={
                topologyUtilityChromeCompact ? "--topology-utility-lane-gap" : undefined
              }
              data-utility-lane-compact-width-token={
                topologyUtilityChromeCompact ? "--topology-utility-lane-compact-width" : undefined
              }
              data-utility-lane-suppression-contract={
                topologyUtilityLaneSuppressionContract
              }
              className="contents"
            >
              {!selectedRelationActive ? (
                <>
                  <SearchHint
                    density={topologyUtilityChromeCompact ? "compact-focus" : "default"}
                    phoneFocusSuppressed={selectedNodeFocusActive}
                    onOpenSearch={() => {
                      setOntologySearchOpen(true);
                    }}
                    onRelayout={() => {
                      setTopologyRelayoutToken((current) => current + 1);
                      toast.show(t('controls.relayoutToast'), "info");
                    }}
                  />
                  {selectedNodeOwnsRightRail ? null : (
                    <div
                      className="topology-ui-scale absolute right-4 top-4 z-20 flex items-center gap-[var(--topology-utility-lane-gap)] md:right-6 md:top-6 xl:right-8 xl:top-8"
                      data-testid="topology-utility-action-lane"
                      data-utility-lane-density={
                        topologyUtilityChromeCompact ? "compact-focus" : "default"
                      }
                      data-utility-lane-contract={
                        topologyUtilityChromeCompact
                          ? "icon-first-focus-utility"
                          : "labeled-map-utility"
                      }
                      data-utility-lane-surface-token="--topology-utility-lane-surface"
                      data-utility-lane-border-token="--topology-utility-lane-border"
                      data-utility-lane-shadow-token="--topology-utility-lane-shadow"
                    >
                    <TopologyReviewLink
                      changeset={ontologyChangeset}
                      label={(count) => t('controls.reviewLabel', { count })}
                      ariaLabel={(count) => t('controls.reviewAria', { count })}
                    />
                    <Tooltip content={t('controls.docsTooltip')} side="bottom" withProvider={false}>
                    <ChromeChip
                      onClick={() => setDocsDrawerOpen((v) => !v)}
                      aria-expanded={docsDrawerOpen}
                      aria-label={t('controls.docsAriaLabel')}
                      data-utility-action-token-contract="support-surface-family"
                      data-utility-action-surface-token="--chrome-surface"
                      data-utility-action-border-token="--chrome-border"
                      data-utility-action-shadow-token="--chrome-shadow"
                      data-utility-action-focus-ring-token="--color-indigo-accent"
                      compact={topologyUtilityChromeCompact}
                      icon={<BookOpen className="text-[color:var(--color-indigo-accent)]" />}
                      kbd="D"
                      badge={
                        docsPinnedCount > 0 ? (
                          <span
                            data-utility-count-badge="pinned-docs"
                            data-surface-token="--topology-utility-lane-count-surface"
                            data-text-token="--topology-utility-lane-count-text"
                            className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--topology-utility-lane-count-surface)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--topology-utility-lane-count-text)]"
                            aria-label={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                            title={t('controls.pinnedDocsCount', { count: docsPinnedCount })}
                          >
                            {docsPinnedCount}
                          </span>
                        ) : null
                      }
                    >
                      {t('controls.docsLabel')}
                    </ChromeChip>
                    </Tooltip>
                    {canCreateNode ? (
                      <Tooltip content={t('createNode.toggleTooltip')} side="bottom" withProvider={false}>
                        <button
                          type="button"
                          ref={createNodeToggleRef}
                          onClick={() => {
                            if (createNodeOpen) {
                              closeCreateNode();
                            } else {
                              openCreateNode();
                            }
                          }}
                          aria-expanded={createNodeOpen}
                          aria-label={t('createNode.toggleAria')}
                          data-testid="topology-create-node-toggle"
                          data-utility-action-token-contract="accent-surface-family"
                          data-utility-action-surface-token="--topology-utility-lane-accent-surface"
                          data-utility-action-border-token="--topology-utility-lane-accent-border"
                          data-utility-action-shadow-token="--topology-utility-lane-shadow"
                          data-utility-action-focus-ring-token="--topology-utility-lane-focus-ring"
                          className={`inline-flex h-[var(--topology-utility-lane-height)] items-center justify-center gap-2 rounded-[var(--topology-utility-lane-radius)] border border-[color:var(--topology-utility-lane-accent-border)] bg-[color:var(--topology-utility-lane-accent-surface)] text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] shadow-[var(--topology-utility-lane-shadow)] transition-[background-color,border-color] duration-180 ease-out hover:bg-[color:var(--topology-utility-lane-accent-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none ${
                            topologyUtilityChromeCompact
                              ? "w-[var(--topology-utility-lane-compact-width)] px-0"
                              : "px-3.5"
                          }`}
                        >
                          <Plus className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
                          <span className={topologyUtilityChromeCompact ? "sr-only" : undefined}>
                            {t('createNode.toggleLabel')}
                          </span>
                        </button>
                      </Tooltip>
                    ) : null}
                    </div>
                  )}
                </>
              ) : null}
            </div>
            {canCreateNode && createNodeOpen ? (
              <>
                <button
                  type="button"
                  aria-label={t('createNode.cancel')}
                  className="absolute inset-0 z-[25] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-180 ease-out motion-reduce:transition-none"
                  data-interactive-overlay="true"
                  data-testid="topology-create-node-backdrop"
                  data-backdrop-contract="blocks-map-and-closes-composer"
                  data-backdrop-surface-token="--topology-blocking-backdrop-surface"
                  onClick={closeCreateNode}
                />
                <div
                  ref={createNodePanelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={CREATE_NODE_DIALOG_TITLE_ID}
                  tabIndex={-1}
                  onKeyDown={handleCreateNodePanelKeyDown}
                  className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 max-h-[var(--topology-blocking-composer-max-height)] w-[var(--topology-blocking-composer-width)] -translate-x-1/2 overflow-y-auto"
                  data-testid="topology-create-node-panel"
                  data-attention-role="blocking-composer"
                  data-placement-contract="centered-blocking-edit"
                  data-surface-role="blocking-edit-surface"
                  data-elevation-contract="solid-panel-over-dimmed-map"
                  data-size-contract="bounded-centered-composer"
                  data-top-token="--topology-blocking-composer-top"
                  data-width-token="--topology-blocking-composer-width"
                  data-max-height-token="--topology-blocking-composer-max-height"
                >
                  <CreateNodeForm
                    onCreate={createNode}
                    onCancel={closeCreateNode}
                    labels={{
                      headingId: CREATE_NODE_DIALOG_TITLE_ID,
                      heading: t('createNode.heading'),
                      titlePlaceholder: t('createNode.titlePlaceholder'),
                      kind: t('createNode.kind'),
                      domain: t('createNode.domain'),
                      domainPlaceholder: t('createNode.domainPlaceholder'),
                      create: t('createNode.create'),
                      cancel: t('createNode.cancel'),
                      kindLabels: {
                        domain: t('createNode.kindDomain'),
                        capability: t('createNode.kindCapability'),
                        element: t('createNode.kindElement'),
                      },
                    }}
                  />
                </div>
              </>
            ) : null}
            {createNodePending ? (
              <>
                <button
                  type="button"
                  aria-label={t('createNode.cancel')}
                  className="absolute inset-0 z-[25] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-180 ease-out motion-reduce:transition-none"
                  data-interactive-overlay="true"
                  data-testid="topology-create-node-pending-backdrop"
                  data-backdrop-contract="blocks-map-and-clears-create-intent"
                  data-backdrop-surface-token="--topology-blocking-backdrop-surface"
                  onClick={closeCreateNode}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="topology-create-node-unavailable-title"
                  className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 w-[var(--topology-blocking-composer-width)] -translate-x-1/2"
                  data-testid="topology-create-node-unavailable-panel"
                  data-attention-role="blocking-composer"
                  data-create-intent-state="pending-writable-vault"
                  data-placement-contract="centered-blocking-edit"
                  data-surface-role="blocking-edit-surface"
                  data-elevation-contract="solid-panel-over-dimmed-map"
                  data-size-contract="bounded-centered-composer"
                  data-top-token="--topology-blocking-composer-top"
                  data-width-token="--topology-blocking-composer-width"
                >
                  <section className="rounded-lg border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-4 py-3 shadow-[var(--topology-blocking-composer-shadow)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          id="topology-create-node-unavailable-title"
                          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]"
                        >
                          {t('createNode.unavailableHeading')}
                        </p>
                        <p className="mt-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
                          {t('createNode.unavailableBody')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeCreateNode}
                        aria-label={t('createNode.cancel')}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeCreateNode();
                        setDocsDrawerOpen(true);
                      }}
                      data-testid="topology-create-node-open-workspace"
                      className="mt-3 inline-flex h-8 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.16)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:rgba(94,106,210,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
                    >
                      {t('createNode.unavailableAction')}
                    </button>
                  </section>
                </div>
              </>
            ) : null}
            {/* INDEX (B3 허브가 곧 지도) — the left instrument replacing the
                old `/ontology` tree page. Persists alongside the selected-
                node datasheet (unlike the analysis rail below, which the
                node-focus popover suppresses) — the approved spec shows both
                coexisting over the map (`docs/prototypes/hub-b3-immersive.html`). */}
            {!selectedRelationActive && !topologyCreateNodeBlockingActive ? (
              <div
                // `topology-ui-scale` — top-left-chrome-group(브랜드 pill)도
                // 같은 클래스로 ≥1920px/≥2400px 에서 zoom 배율이 걸린다. 이
                // wrapper 가 이 클래스 없이 고정 px 로만 있으면 그 zoom 배율
                // 아래에서 pill 이 이 wrapper 보다 비례적으로 더 커져 다시
                // 겹친다 — `--topology-index-top` 주석 참조.
                className="topology-ui-scale absolute z-20"
                style={{
                  left: renderedIndexState === "expanded" ? "var(--topology-index-inset)" : 0,
                  top: "var(--topology-index-top)",
                  bottom: renderedIndexState === "expanded" ? "var(--topology-index-inset)" : undefined,
                }}
              >
                {renderedIndexState === "expanded" && indexTreeResult ? (
                  <TopologyIndexPanel
                    treeResult={indexTreeResult}
                    totalConcepts={topologyTotalNodes}
                    totalRelations={topologyTotalRelations}
                    domainCount={indexDomainCount}
                    changedSlugs={changedSlugs}
                    selectedId={canvasSelectedSlug}
                    onSelect={(id) => handleSelect(id)}
                    onCollapse={handleIndexCollapse}
                    // 브랜드 필의 censusGrowthText 와 같은 출처(recentlyUpdatedCount)
                    // — feat/chrome-system §9, 헤더→푸터 이관.
                    footerGrowthText={
                      recentlyUpdatedCount > 0
                        ? t('workspace.growthThisWeek', { count: recentlyUpdatedCount })
                        : undefined
                    }
                    labels={{
                      label: t("index.label"),
                      fold: t("index.fold"),
                      foldAria: t("index.foldAria"),
                      searchPlaceholder: t("index.searchPlaceholder"),
                      censusConcepts: t("index.censusConcepts"),
                      censusRelations: t("index.censusRelations"),
                      censusDomains: t("index.censusDomains"),
                      agentSync: t("index.agentSync"),
                      capabilitiesShort: t("index.capabilitiesShort"),
                      elementsShort: t("index.elementsShort"),
                      freshTitle: t("index.freshTitle"),
                      emptyHint: t("index.emptyHint"),
                    }}
                  />
                ) : (
                  <TopologyIndexTab
                    onExpand={handleIndexTabExpand}
                    labels={{
                      expandAria: t("index.expandAria"),
                      agentSyncTitle: t("index.agentSync"),
                    }}
                  />
                )}
              </div>
            ) : null}
            {!selectedRelationActive &&
            !topologyCreateNodeBlockingActive &&
            (!selectedNodeFocusActive || selectedInspectorSupportRailVisible) &&
            leftSlotOwner === "analysis-rail" ? (
              <TopologyAnalysisBar
                mode={analysisMode}
                summary={analysisSummary}
                healthAction={topologyHealthSummary.actionTarget}
                selectedSlug={selectedSlug}
                selectedTitle={analysisSelectedTitle}
                pathSourceSlug={pathSourceSlug}
                pathTargetSlug={pathTargetSlug}
                pathSourceTitle={pathSourceTitle}
                pathTargetTitle={pathTargetTitle}
                overviewRelationVisibility={overviewRelationVisibility}
                pathCandidateVisibility={pathCandidateVisibility}
                rightPanelReserved={drawerOpen}
                leftPanelExpanded={false}
                createPanelReserved={createNodeOpen}
                onModeChange={handleSelectAnalysisMode}
                onClearSelection={handleClose}
                onHealthAction={(slug) => handleSelect(slug)}
                labels={{
                title: t("analysis.title"),
                overview: t("analysis.overview"),
                graph: t("analysis.graph"),
                graphPrompt: t("analysis.graphPrompt"),
                focus: t("analysis.focus"),
                path: t("analysis.path"),
                health: t("analysis.health"),
                metricNodes: t("analysis.metricNodes"),
                metricRelations: t("analysis.metricRelations"),
                metricIssues: t("analysis.metricIssues"),
                healthStale: t("analysis.healthStale"),
                healthOrphan: t("analysis.healthOrphan"),
                healthPromotion: t("analysis.healthPromotion"),
                healthInspect: t("analysis.healthInspect"),
                healthCopy: t("analysis.healthCopy"),
                healthOpenOntology: t("analysis.healthOpenOntology"),
                healthRepair: t("analysis.healthRepair"),
                healthCopied: t("analysis.healthCopied"),
                actions: t("analysis.actions"),
                healthCopyTools: t("analysis.healthCopyTools"),
                healthMcpCopy: t("analysis.healthMcpCopy"),
                healthMcpCopied: t("analysis.healthMcpCopied"),
                healthMcpImpactCopy: t("analysis.healthMcpImpactCopy"),
                healthMcpImpactCopied: t("analysis.healthMcpImpactCopied"),
                healthSyncGateCopy: t("analysis.healthSyncGateCopy"),
                healthSyncGateCopied: t("analysis.healthSyncGateCopied"),
                healthHandoffSummary: t("analysis.healthHandoffSummary"),
                healthRepairOrderTitle: t("analysis.healthRepairOrderTitle"),
                healthRepairOrderInspect: t("analysis.healthRepairOrderInspect"),
                healthRepairOrderRepair: t("analysis.healthRepairOrderRepair"),
                healthRepairOrderSync: t("analysis.healthRepairOrderSync"),
                healthRepairTargetLabel: t("analysis.healthRepairTargetLabel"),
                overviewBriefCopy: t("analysis.overviewBriefCopy"),
                overviewBriefCopied: t("analysis.overviewBriefCopied"),
                overviewHandoffSummary: t("analysis.overviewHandoffSummary"),
                overviewCopyTools: t("analysis.overviewCopyTools"),
                overviewWorkOrderTitle: t("analysis.overviewWorkOrderTitle"),
                overviewWorkOrderRead: t("analysis.overviewWorkOrderRead"),
                overviewWorkOrderFocus: t("analysis.overviewWorkOrderFocus"),
                overviewWorkOrderPath: t("analysis.overviewWorkOrderPath"),
                overviewWorkOrderHealth: t("analysis.overviewWorkOrderHealth"),
                overviewReaderLensTitle: t("analysis.overviewReaderLensTitle"),
                overviewReaderLensDomains: t("analysis.overviewReaderLensDomains"),
                overviewReaderLensCapabilities: t(
                  "analysis.overviewReaderLensCapabilities",
                ),
                overviewReaderLensChangePaths: t(
                  "analysis.overviewReaderLensChangePaths",
                ),
                overviewTierLegendTitle: t("analysis.overviewTierLegendTitle"),
                overviewTierLegendProject: t("analysis.overviewTierLegendProject"),
                overviewTierLegendDomain: t("analysis.overviewTierLegendDomain"),
                overviewTierLegendCapability: t(
                  "analysis.overviewTierLegendCapability",
                ),
                overviewTierLegendElement: t("analysis.overviewTierLegendElement"),
                overviewRelationLegendTitle: t(
                  "analysis.overviewRelationLegendTitle",
                ),
                overviewRelationLegendSpine: t(
                  "analysis.overviewRelationLegendSpine",
                ),
                overviewRelationLegendQuality: t(
                  "analysis.overviewRelationLegendQuality",
                ),
                overviewBriefCopyAriaLabel: t(
                  "analysis.overviewBriefCopyAriaLabel",
                ),
                overviewBriefCopiedAriaLabel: t(
                  "analysis.overviewBriefCopiedAriaLabel",
                ),
                overviewBriefTitle: t("analysis.overviewBriefTitle"),
                overviewBriefTotalNodes: t("analysis.overviewBriefTotalNodes"),
                overviewBriefTotalRelations: t(
                  "analysis.overviewBriefTotalRelations",
                ),
                overviewBriefRelationReading: t(
                  "analysis.overviewBriefRelationReading",
                ),
                overviewBriefRelationProvenance: t(
                  "analysis.overviewBriefRelationProvenance",
                ),
                overviewBriefRelationSourceBacked: t(
                  "analysis.overviewBriefRelationSourceBacked",
                ),
                overviewBriefRelationAuthored: t(
                  "analysis.overviewBriefRelationAuthored",
                ),
                overviewBriefRelationNeedsReview: t(
                  "analysis.overviewBriefRelationNeedsReview",
                ),
                overviewBriefRelationQuality: t(
                  "analysis.overviewBriefRelationQuality",
                ),
                overviewBriefRelationQualityStrong: t(
                  "analysis.overviewBriefRelationQualityStrong",
                ),
                overviewBriefRelationQualitySupported: t(
                  "analysis.overviewBriefRelationQualitySupported",
                ),
                overviewBriefRelationQualityWeak: t(
                  "analysis.overviewBriefRelationQualityWeak",
                ),
                overviewBriefRelationQualityReview: t(
                  "analysis.overviewBriefRelationQualityReview",
                ),
                overviewAgentReadiness: t("analysis.overviewAgentReadiness"),
                overviewAgentReadinessReady: t(
                  "analysis.overviewAgentReadinessReady",
                ),
                overviewAgentReadinessPreflight: t(
                  "analysis.overviewAgentReadinessPreflight",
                ),
                overviewAgentReadinessReview: t(
                  "analysis.overviewAgentReadinessReview",
                ),
                overviewBriefHealthSignals: t(
                  "analysis.overviewBriefHealthSignals",
                ),
                overviewBriefHealthUrl: t("analysis.overviewBriefHealthUrl"),
                overviewBriefInsightsUrl: t("analysis.overviewBriefInsightsUrl"),
                overviewBriefAgentCheck: t("analysis.overviewBriefAgentCheck"),
                overviewBriefMcpCheck: t("analysis.overviewBriefMcpCheck"),
                overviewBriefMcpQueryPlan: t(
                  "analysis.overviewBriefMcpQueryPlan",
                ),
                overviewBriefWorkspaceCheck: t(
                  "analysis.overviewBriefWorkspaceCheck",
                ),
                overviewBriefMcpWorkspaceCheck: t(
                  "analysis.overviewBriefMcpWorkspaceCheck",
                ),
                overviewRelationVisibleCountSuffix: t(
                  "analysis.overviewRelationVisibleCountSuffix",
                ),
                overviewSkeletonCardCountSuffix: t(
                  "analysis.overviewSkeletonCardCountSuffix",
                ),
                overviewSkeletonCardHiddenSuffix: t(
                  "analysis.overviewSkeletonCardHiddenSuffix",
                ),
                overviewRelationLodNotice: t("analysis.overviewRelationLodNotice"),
                overviewRelationPreparingNotice: t(
                  "analysis.overviewRelationPreparingNotice",
                ),
                overviewSkeletonNotice: t("analysis.overviewSkeletonNotice"),
                overviewReanalyzeCopy: t("analysis.overviewReanalyzeCopy"),
                overviewReanalyzeCopied: t("analysis.overviewReanalyzeCopied"),
                overviewSyncCopy: t("analysis.overviewSyncCopy"),
                overviewSyncCopied: t("analysis.overviewSyncCopied"),
                overviewReanalyzeCopyAriaLabel: t(
                  "analysis.overviewReanalyzeCopyAriaLabel",
                ),
                overviewReanalyzeCopiedAriaLabel: t(
                  "analysis.overviewReanalyzeCopiedAriaLabel",
                ),
                overviewSyncCopyAriaLabel: t("analysis.overviewSyncCopyAriaLabel"),
                overviewSyncCopiedAriaLabel: t(
                  "analysis.overviewSyncCopiedAriaLabel",
                ),
                focusBriefCopy: t("analysis.focusBriefCopy"),
                focusBriefCopySummary: t("analysis.focusBriefCopySummary"),
                focusBriefCopied: t("analysis.focusBriefCopied"),
                focusMcpCopy: t("analysis.focusMcpCopy"),
                focusMcpCopied: t("analysis.focusMcpCopied"),
                focusMcpImpactCopy: t("analysis.focusMcpImpactCopy"),
                focusMcpImpactCopied: t("analysis.focusMcpImpactCopied"),
                focusSyncGateCopy: t("analysis.focusSyncGateCopy"),
                focusSyncGateCopied: t("analysis.focusSyncGateCopied"),
                focusEnhanceCopy: t("analysis.focusEnhanceCopy"),
                focusEnhanceCopied: t("analysis.focusEnhanceCopied"),
                focusOpenOntology: t("analysis.focusOpenOntology"),
                focusOpenBuilder: t("analysis.focusOpenBuilder"),
                focusHandoffSummary: t("analysis.focusHandoffSummary"),
                focusReviewOrderTitle: t("analysis.focusReviewOrderTitle"),
                focusReviewOrderProfile: t("analysis.focusReviewOrderProfile"),
                focusReviewOrderImpact: t("analysis.focusReviewOrderImpact"),
                focusReviewOrderRepair: t("analysis.focusReviewOrderRepair"),
                focusReviewOrderSync: t("analysis.focusReviewOrderSync"),
                focusBriefCopyAriaLabel: t("analysis.focusBriefCopyAriaLabel"),
                focusBriefCopiedAriaLabel: t(
                  "analysis.focusBriefCopiedAriaLabel",
                ),
                focusMcpCopyAriaLabel: t("analysis.focusMcpCopyAriaLabel"),
                focusMcpCopiedAriaLabel: t("analysis.focusMcpCopiedAriaLabel"),
                focusMcpImpactCopyAriaLabel: t(
                  "analysis.focusMcpImpactCopyAriaLabel",
                ),
                focusMcpImpactCopiedAriaLabel: t(
                  "analysis.focusMcpImpactCopiedAriaLabel",
                ),
                focusSyncGateCopyAriaLabel: t(
                  "analysis.focusSyncGateCopyAriaLabel",
                ),
                focusSyncGateCopiedAriaLabel: t(
                  "analysis.focusSyncGateCopiedAriaLabel",
                ),
                focusEnhanceCopyAriaLabel: t(
                  "analysis.focusEnhanceCopyAriaLabel",
                ),
                focusEnhanceCopiedAriaLabel: t(
                  "analysis.focusEnhanceCopiedAriaLabel",
                ),
                focusBriefTitle: t("analysis.focusBriefTitle"),
                focusBriefNode: t("analysis.focusBriefNode"),
                focusBriefUrl: t("analysis.focusBriefUrl"),
                focusBriefOntologyUrl: t("analysis.focusBriefOntologyUrl"),
                focusBriefBuilderUrl: t("analysis.focusBriefBuilderUrl"),
                focusBriefReviewFocus: t("analysis.focusBriefReviewFocus"),
                focusBriefAgentCheck: t("analysis.focusBriefAgentCheck"),
                focusBriefMcpCheck: t("analysis.focusBriefMcpCheck"),
                focusBriefImpactCheck: t("analysis.focusBriefImpactCheck"),
                focusBriefMcpImpactCheck: t("analysis.focusBriefMcpImpactCheck"),
                focusBriefSyncGate: t("analysis.focusBriefSyncGate"),
                healthMcpCopyAriaLabel: t("analysis.healthMcpCopyAriaLabel"),
                healthMcpCopiedAriaLabel: t(
                  "analysis.healthMcpCopiedAriaLabel",
                ),
                healthMcpImpactCopyAriaLabel: t(
                  "analysis.healthMcpImpactCopyAriaLabel",
                ),
                healthMcpImpactCopiedAriaLabel: t(
                  "analysis.healthMcpImpactCopiedAriaLabel",
                ),
                healthSyncGateCopyAriaLabel: t(
                  "analysis.healthSyncGateCopyAriaLabel",
                ),
                healthSyncGateCopiedAriaLabel: t(
                  "analysis.healthSyncGateCopiedAriaLabel",
                ),
                healthCopyAriaLabel: t("analysis.healthCopyAriaLabel"),
                healthCopiedAriaLabel: t("analysis.healthCopiedAriaLabel"),
                healthEvidenceTitle: t("analysis.healthEvidenceTitle"),
                healthEvidenceTotal: t("analysis.healthEvidenceTotal"),
                healthEvidenceInspectUrl: t("analysis.healthEvidenceInspectUrl"),
                healthEvidenceOntologyUrl: t(
                  "analysis.healthEvidenceOntologyUrl",
                ),
                healthEvidenceRepairUrl: t("analysis.healthEvidenceRepairUrl"),
                healthEvidenceNextAction: t("analysis.healthEvidenceNextAction"),
                healthEvidenceAgentCheck: t("analysis.healthEvidenceAgentCheck"),
                healthEvidenceMcpCheck: t("analysis.healthEvidenceMcpCheck"),
                healthEvidenceRelationPreflight: t(
                  "analysis.healthEvidenceRelationPreflight",
                ),
                healthEvidenceMcpRelationPreflight: t(
                  "analysis.healthEvidenceMcpRelationPreflight",
                ),
                healthEvidenceImpactCheck: t("analysis.healthEvidenceImpactCheck"),
                healthEvidenceMcpImpactCheck: t(
                  "analysis.healthEvidenceMcpImpactCheck",
                ),
                healthEvidenceSyncGate: t("analysis.healthEvidenceSyncGate"),
                healthEvidenceActionKindStale: t(
                  "analysis.healthEvidenceActionKindStale",
                ),
                healthEvidenceActionKindOrphan: t(
                  "analysis.healthEvidenceActionKindOrphan",
                ),
                healthEvidenceActionKindPromotion: t(
                  "analysis.healthEvidenceActionKindPromotion",
                ),
                healthEvidenceActionStale: t("analysis.healthEvidenceActionStale"),
                healthEvidenceActionOrphan: t("analysis.healthEvidenceActionOrphan"),
                healthEvidenceActionPromotion: t(
                  "analysis.healthEvidenceActionPromotion",
                ),
                healthEvidenceNone: t("analysis.healthEvidenceNone"),
                healthEvidenceUrl: t("analysis.healthEvidenceUrl"),
                focusPrompt: t("analysis.focusPrompt"),
                focusSelected: t("analysis.focusSelected", {
                  title: analysisSelectedTitle ?? "",
                }),
                pathPrompt: t("analysis.pathPrompt"),
                pathSelected: t("analysis.pathSelected", {
                  title: pathSourceTitle ?? analysisSelectedTitle ?? "",
                }),
                pathResolved: t("analysis.pathResolved", {
                  source: pathSourceTitle ?? "",
                  target: pathTargetTitle ?? "",
                }),
                pathCandidateVisibility: t.raw("analysis.pathCandidateVisibility") as string,
                pathHandoffLabel: t("analysis.pathHandoffLabel"),
                pathHandoffMcpAction: t("analysis.pathHandoffMcpAction"),
                pathHandoffCliFallback: t("analysis.pathHandoffCliFallback"),
                pathEvidenceCopy: t("analysis.pathEvidenceCopy"),
                pathEvidenceCopied: t("analysis.pathEvidenceCopied"),
                pathEvidenceCopyAriaLabel: t(
                  "analysis.pathEvidenceCopyAriaLabel",
                ),
                pathEvidenceCopiedAriaLabel: t(
                  "analysis.pathEvidenceCopiedAriaLabel",
                ),
                pathMcpCopy: t("analysis.pathMcpCopy"),
                pathMcpCopied: t("analysis.pathMcpCopied"),
                pathMcpCopyAriaLabel: t("analysis.pathMcpCopyAriaLabel"),
                pathMcpCopiedAriaLabel: t("analysis.pathMcpCopiedAriaLabel"),
                pathRelationPreflightCopy: t(
                  "analysis.pathRelationPreflightCopy",
                ),
                pathRelationPreflightCopied: t(
                  "analysis.pathRelationPreflightCopied",
                ),
                pathRelationPreflightCopyAriaLabel: t(
                  "analysis.pathRelationPreflightCopyAriaLabel",
                ),
                pathRelationPreflightCopiedAriaLabel: t(
                  "analysis.pathRelationPreflightCopiedAriaLabel",
                ),
                pathExplainRelationCopy: t("analysis.pathExplainRelationCopy"),
                pathExplainRelationCopied: t(
                  "analysis.pathExplainRelationCopied",
                ),
                pathExplainRelationCopyAriaLabel: t(
                  "analysis.pathExplainRelationCopyAriaLabel",
                ),
                pathExplainRelationCopiedAriaLabel: t(
                  "analysis.pathExplainRelationCopiedAriaLabel",
                ),
                pathAllPathsPlanCopy: t("analysis.pathAllPathsPlanCopy"),
                pathAllPathsPlanCopied: t("analysis.pathAllPathsPlanCopied"),
                pathAllPathsPlanCopyAriaLabel: t(
                  "analysis.pathAllPathsPlanCopyAriaLabel",
                ),
                pathAllPathsPlanCopiedAriaLabel: t(
                  "analysis.pathAllPathsPlanCopiedAriaLabel",
                ),
                pathAllPathsCopy: t("analysis.pathAllPathsCopy"),
                pathAllPathsCopied: t("analysis.pathAllPathsCopied"),
                pathAllPathsCopyAriaLabel: t(
                  "analysis.pathAllPathsCopyAriaLabel",
                ),
                pathAllPathsCopiedAriaLabel: t(
                  "analysis.pathAllPathsCopiedAriaLabel",
                ),
                pathHandoffSummary: t("analysis.pathHandoffSummary"),
                pathCopyTools: t("analysis.pathCopyTools"),
                pathProofOrderTitle: t("analysis.pathProofOrderTitle"),
                pathProofOrderDesc: t("analysis.pathProofOrderDesc"),
                pathProofChecklist: t("analysis.pathProofChecklist"),
                pathProofVisiblePath: t("analysis.pathProofVisiblePath"),
                pathProofRelationPreflight: t(
                  "analysis.pathProofRelationPreflight",
                ),
                pathProofExplainRelation: t(
                  "analysis.pathProofExplainRelation",
                ),
                pathProofBoundedTraversal: t(
                  "analysis.pathProofBoundedTraversal",
                ),
                pathProofPostWriteSync: t("analysis.pathProofPostWriteSync"),
                pathProofStatusReady: t("analysis.pathProofStatusReady"),
                pathProofStatusRequired: t("analysis.pathProofStatusRequired"),
                pathProofStatusAfterWrite: t("analysis.pathProofStatusAfterWrite"),
                pathEvidenceTitle: t("analysis.pathEvidenceTitle"),
                pathEvidenceSource: t("analysis.pathEvidenceSource"),
                pathEvidenceTarget: t("analysis.pathEvidenceTarget"),
                pathEvidenceUrl: t("analysis.pathEvidenceUrl"),
                pathEvidenceSourceOntologyUrl: t(
                  "analysis.pathEvidenceSourceOntologyUrl",
                ),
                pathEvidenceTargetOntologyUrl: t(
                  "analysis.pathEvidenceTargetOntologyUrl",
                ),
                pathEvidenceSourceBuilderUrl: t(
                  "analysis.pathEvidenceSourceBuilderUrl",
                ),
                pathEvidenceTargetBuilderUrl: t(
                  "analysis.pathEvidenceTargetBuilderUrl",
                ),
                pathEvidenceCliCheck: t("analysis.pathEvidenceCliCheck"),
                pathEvidenceMcpCheck: t("analysis.pathEvidenceMcpCheck"),
                pathEvidenceRelationPreflightReason: t(
                  "analysis.pathEvidenceRelationPreflightReason",
                ),
                pathEvidenceRelationPreflightMcpCheck: t(
                  "analysis.pathEvidenceRelationPreflightMcpCheck",
                ),
                pathEvidenceExplainRelationMcpCheck: t(
                  "analysis.pathEvidenceExplainRelationMcpCheck",
                ),
                pathEvidenceAllPathsPlanMcpCheck: t(
                  "analysis.pathEvidenceAllPathsPlanMcpCheck",
                ),
                pathEvidenceAllPathsMcpCheck: t(
                  "analysis.pathEvidenceAllPathsMcpCheck",
                ),
                pathEvidenceAllPathsCopyInstruction: t(
                  "analysis.pathEvidenceAllPathsCopyInstruction",
                ),
                pathEvidencePostWriteSyncGate: t(
                  "analysis.pathEvidencePostWriteSyncGate",
                ),
                pathSourceOntology: t("analysis.pathSourceOntology"),
                pathTargetOntology: t("analysis.pathTargetOntology"),
                pathSourceBuilder: t("analysis.pathSourceBuilder"),
                pathTargetBuilder: t("analysis.pathTargetBuilder"),
                healthPrompt: t("analysis.healthPrompt", {
                  count: analysisSummary.primaryMetric,
                }),
                overviewPrompt: t("analysis.overviewPrompt"),
                }}
              />
            ) : null}
            {/* Overview analysis chrome demotes to a chip while INDEX owns
                the left slot (B3 spec — "chrome chip or the analysis rail's
                existing collapse"). Only meaningful in overview mode, since
                every other mode already gives the rail the slot outright. */}
            {leftSlotOwner === "index" &&
            !selectedRelationActive &&
            !topologyCreateNodeBlockingActive ? (
              <button
                type="button"
                onClick={() => setOverviewChromeRevealed(true)}
                data-testid="topology-index-reveal-analysis-chip"
                className="topology-ui-scale pointer-events-auto absolute bottom-4 left-[calc(var(--topology-index-inset)*2+var(--topology-index-width))] z-20 inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3 text-[11px] text-[color:var(--topology-v2-panel-text-tertiary)] shadow-[var(--topology-v2-panel-shadow)] transition-colors hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
              >
                {t("index.revealAnalysis")}
              </button>
            ) : null}
          </>
        <div
          data-testid="topology-map-surface"
          data-blocking-edit={topologyCreateNodeBlockingActive ? "true" : "false"}
          data-map-demoted={topologyCreateNodeBlockingActive ? "true" : "false"}
          data-map-dim-opacity={topologyCreateNodeBlockingActive ? "0.24" : "1"}
          data-map-dim-opacity-token={
            topologyCreateNodeBlockingActive ? "--topology-blocking-map-opacity" : undefined
          }
          data-map-filter-token={
            topologyCreateNodeBlockingActive ? "--topology-blocking-map-filter" : undefined
          }
          data-map-interaction-contract={
            topologyCreateNodeBlockingActive ? "suppressed-while-blocking-composer" : "interactive"
          }
          aria-hidden={topologyCreateNodeBlockingActive ? "true" : undefined}
          style={{
            opacity: topologyCreateNodeBlockingActive ? "var(--topology-blocking-map-opacity)" : 1,
            filter: topologyCreateNodeBlockingActive ? "var(--topology-blocking-map-filter)" : undefined,
          }}
          className={`absolute inset-0 transition-[opacity,filter] duration-180 ease-out motion-reduce:transition-none ${
            topologyCreateNodeBlockingActive
              ? "pointer-events-none"
              : ""
          }`}
        >
          <>
              <div
                key={localGraphRoot ?? '__root__'}
                className="absolute inset-0 animate-[sigmaFade_220ms_ease-out]"
              >
                {/* Empty-state overlay when the visible Sigma graph has 0–1
                    nodes — the lone Sigma dot otherwise reads as a broken
                    canvas. 빈 vault 는 Sigma 를 아예 마운트하지 않고 바로 빈
                    상태만 보여 WebGL/토폴로지 모양이 잠깐 보이는 회귀를 막는다. */}
                {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
                  <TopologyEmptyState
                    projectCount={emptyTopologyNodeCount}
                    reason={topologyOverlayState.emptyReason}
                    canCreateNode={canCreateNode}
                    onCreateNode={openCreateNode}
                  />
                ) : topologyOverlayState.kind === "filter-sparse" ? (
                  <TopologyNoMatchesState
                    onClearFilters={clearTopologyFilters}
                    variant="sparse"
                  />
                ) : null}
                {topologyRenderState.renderCanvas ? (
                  // topology-map-v2 (docs/TOPOLOGY-V2-DESIGN.md §4 P2/P3) —
                  // unifies the map tab, graph tab, and project-detail
                  // neighbor map into one engine (§1.2); this call site is
                  // wired once for all three, per §5.3's unchanged adapter
                  // contract. `nodes`/`edges` come from `topologyV2Graph`
                  // (topology-v2-adapter.ts), derived from `ontologyInsight`.
                  // The map-canvas + legacy Sigma-as-engine branches this
                  // ternary used to also hold were physically deleted once
                  // v2 went default-on (owner directive: 예전 캔버스 코드는
                  // 싹 다 지워줘) — see topology-map-v2's design docs for the
                  // strangler history.
                  <TopologyMapV2
                    nodes={topologyV2Graph.nodes}
                    edges={topologyV2Graph.edges}
                    focus={{
                      selectedSlug: canvasSelectedSlug,
                      depthLimit: sigmaControls.depthLimit,
                      searchQuery: sigmaControls.searchQuery,
                      activeCategory,
                      hubsOnly: sigmaControls.hubsOnly,
                    }}
                    overlays={sigmaControls.overlays}
                    changedSlugs={changedSlugs}
                    livePhysics={analysisMode === "graph"}
                    fitViewToken={combinedFitToken}
                    relayoutToken={topologyRelayoutToken}
                    onSelect={(slug) => handleSelect(slug)}
                    onOpen={handleExpandRequest}
                    onPaneClick={handleClose}
                    onVisibleCountChange={setSigmaVisibleCount}
                    onGraphStatsChange={handleSigmaGraphStatsChange}
                    onContextMenuNode={handleContextMenuNode}
                    minimal={localGraphRoot !== null}
                  />
                ) : null}
              </div>
              <style jsx>{`
                @keyframes sigmaFade {
                  from { opacity: 0.5; transform: scale(0.995); }
                  to { opacity: 1; transform: scale(1); }
                }
              `}</style>
              {createNodeOpen ||
              selectedRelationActive ||
              topologyBlockingOverlayActive ||
              selectedNodeFocusActive ? null : (
                <SigmaControls
                  value={sigmaControls}
                  onChange={setSigmaControls}
                  density={topologyUtilityChromeCompact ? "compact-focus" : "default"}
                  onFitView={() => setFitViewToken((t) => t + 1)}
                  visibleCount={sigmaVisibleCount}
                  totalCount={
                    localGraphRoot === null
                      ? topologyTotalNodes
                      : localGraphProjects.length
                  }
                />
              )}
              {/* 단축키/제스처 도움말 진입점 — 우상단 SigmaControls 아래 36×36 아이콘.
                  phone 은 primary read rail(path/health) 과 충돌하지 않는 overview/focus 에서만 노출한다. */}
              {createNodeOpen ||
              selectedRelationActive ||
              topologyBlockingOverlayActive ||
              selectedNodeFocusActive ? null : (
                <Tooltip content={t('controls.shortcutsTooltip')} side="left" withProvider={false}>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(true)}
                  aria-label={t('controls.shortcutsAriaLabel')}
                  data-testid="topology-shortcuts-help-button"
                  data-controls-density={
                    topologyUtilityChromeCompact ? "compact-focus" : "default"
                  }
                  data-controls-contract={
                    topologyUtilityChromeCompact
                      ? "focus-support-help-entry"
                      : "map-help-entry"
                  }
                  data-phone-help-entry-contract={
                    topologyShortcutHelpPhoneVisible
                      ? "visible-outside-path-panel"
                      : analysisMode === "health"
                        ? "hidden-during-health-panel"
                        : "hidden-during-path-panel"
                  }
                  data-phone-help-position-contract={
                    topologyShortcutHelpPhoneVisible ? "map-card-clearance" : undefined
                  }
                  data-phone-help-top-token={
                    topologyShortcutHelpPhoneVisible
                      ? selectedNodeFocusActive
                        ? "--topology-shortcuts-help-focus-phone-top"
                        : "--topology-shortcuts-help-phone-top"
                      : undefined
                  }
                  className={`topology-ui-scale pointer-events-auto absolute right-4 ${
                    selectedNodeFocusActive
                      ? "top-[var(--topology-shortcuts-help-focus-phone-top)]"
                      : "top-[var(--topology-shortcuts-help-phone-top)]"
                  } z-20 items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] md:right-6 md:top-[var(--topology-shortcuts-help-desktop-top)] md:flex xl:right-8 size-[var(--chrome-tile-size)] ${
                    topologyShortcutHelpPhoneVisible ? "flex" : "hidden"
                  }`}
                >
                  <HelpCircle className="size-[var(--chrome-icon)]" aria-hidden />
                </button>
                </Tooltip>
              )}
              {/* 설정 기어는 좌측 내비 레일 하단으로 이관됐다
                  (feat/chrome-system — chrome-rail-combined.html). 우측
                  세로 레일은 이제 지도 전용 3타일(전체보기/조절/단축키)만. */}
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
              {topologyOverlayState.kind === "filter-empty" ? (
                <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
              ) : null}

              {/* root-first-open v3 우하단 계기 판독 — 정적 모드일 때만
                  자체 렌더(FirstRunReadout 내부 판정), dismiss 와 무관하게
                  정적 샘플을 둘러보는 동안 계속 남아있는다. */}
              <FirstRunReadout
                projectCount={firstRunProjectCount}
                domainCount={indexDomainCount}
              />

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
        {!createNodeOpen ? (
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
        ) : null}
        {selectedOntologyNode &&
        ontologyInsight &&
        nodeFocus &&
        analysisMode !== "path" &&
        !fullDetailOpen &&
        !selectedRelationActive &&
        !createNodeOpen ? (
          <div
            data-testid="topology-node-popover-positioner"
            data-position-contract="selected-inspector-aligns-to-right-inset"
            data-fixed-surface-role="selected-node-inspector"
            data-fixed-surface-measure-target="topology-node-popover"
            data-selected-inspector-overlap-contract="fixed-surface-hides-overlapping-map-cards"
            data-selected-inspector-gutter-contract="no-phantom-utility-rail"
            data-position-top-token="--topology-node-popover-top"
            data-position-right-inset-token="--topology-node-popover-right-inset"
            // `topology-ui-scale` 은 Tailwind variant 대상이 아닌 plain CSS
            // 클래스라 항상 붙인다(zoom:1 기본, ≥1920px/≥2400px 에서만
            // 실제 zoom) — 브랜드 pill 과 같은 비율로 커져야 --topology-
            // index-top 과의 겹침 회피 gap 이 그 폭에서도 유지된다.
            className="topology-ui-scale fixed inset-x-3 top-[72px] z-50 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
          >
            {v2DatasheetModel ? (
              <TopologyV2DetailPanel
                slug={v2DatasheetModel.slug}
                title={v2DatasheetModel.title}
                kind={v2DatasheetModel.kind}
                powered={v2DatasheetModel.powered}
                metric={v2DatasheetModel.metric}
                groups={v2DatasheetModel.groups}
                evidence={v2DatasheetModel.evidence}
                handoffText={v2DatasheetModel.handoffText}
                documentHref={v2DatasheetModel.documentHref}
                builderEditHref={v2DatasheetModel.builderEditHref}
                labels={{
                  kindLabel: tKinds(normalizeKindLabelKey(v2DatasheetModel.kind)),
                  poweredOn: t("nodeDatasheet.poweredOn"),
                  poweredOff: t("nodeDatasheet.poweredOff"),
                  metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                  metricDependsOn: t("nodeDatasheet.metricDependsOn"),
                  metricEvidence: t("nodeDatasheet.metricEvidence"),
                  noConnections: t("nodeDatasheet.noConnections"),
                  handoff: t("nodeDatasheet.handoff"),
                  close: t("controls.close"),
                  openFullDetail: t("nodeDatasheet.openFullDetail"),
                  actionsGroupLabel: t("nodeDatasheet.actionsGroupLabel"),
                  actionDocument: t("nodeDatasheet.actionDocument"),
                  actionEditRelations: t("nodeDatasheet.actionEditRelations"),
                  actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
                  actionPath: t("nodeDatasheet.actionPath"),
                }}
                onSelectConnection={(id) => handleSelect(id)}
                onCopyHandoff={copyV2NodeHandoff}
                onClose={handleClose}
                onSetPathSource={() => handleSetPathSource(v2DatasheetModel.nodeId)}
                onOpenFullDetail={
                  selectedOntologyNode
                    ? () => setFullDetailSlug(selectedOntologyNode.id)
                    : undefined
                }
                className="max-lg:w-[min(520px,calc(100vw-1.5rem))]"
              />
            ) : null}
          </div>
        ) : null}
        {contextMenuNode && contextMenuModel ? (
          <TopologyV2ContextMenu
            position={{ x: contextMenuNode.x, y: contextMenuNode.y }}
            documentHref={contextMenuModel.documentHref}
            builderEditHref={contextMenuModel.builderEditHref}
            labels={{
              actionDocument: t("nodeDatasheet.actionDocument"),
              actionEditRelations: t("nodeDatasheet.actionEditRelations"),
              actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
              actionPath: t("nodeDatasheet.actionPath"),
              openFullDetail: t("nodeDatasheet.openFullDetail"),
            }}
            onCopyHandoff={() => {
              copyV2NodeHandoff(contextMenuModel.handoffText);
              closeContextMenu();
            }}
            onSetPathSource={() => {
              handleSetPathSource(contextMenuModel.nodeId);
              closeContextMenu();
            }}
            onOpenFullDetail={() => {
              handleSelect(contextMenuModel.nodeId);
              setFullDetailSlug(contextMenuModel.nodeId);
              closeContextMenu();
            }}
            onClose={closeContextMenu}
          />
        ) : null}
        {fullDetailOpen && fullDetailA1Model ? (
          <div
            data-testid="topology-full-detail-a1-positioner"
            className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--color-canvas)]"
          >
            <FullDetailA1
              node={fullDetailA1Model.node}
              groups={fullDetailA1Model.groups}
              reach={fullDetailA1Model.reach}
              breadcrumb={fullDetailA1Model.breadcrumb}
              bodyMarkdown={fullDetailA1Model.bodyMarkdown}
              explanationEdit={fullDetailA1Model.explanationEdit}
              documentHref={fullDetailA1Model.documentHref}
              onSelectNode={(id) => handleSelect(id)}
              onClose={handleClose}
              onBackToMap={handleClose}
            />
          </div>
        ) : null}
        {/* 헤더 "Concept search" 버튼 · ⌘K · ⇧⌘K 공용 단일 팔레트 —
            ontology 노드 + 프로젝트 통합 검색 (persona-P1). 노드 선택도
            프로젝트 선택도 handleSelect 로 흘려 지도 위 선택 상태만 바꾼다 —
            기본값(onSelectNode 미제공 시 `/ontology/?node=` 로 push)을 쓰면
            지도를 벗어나므로 반드시 override. controlled (open/onOpenChange)
            — hotkey 는 위 useTypingShortcuts 가 관리. */}
        <MountedGlobalSearch
          open={!createNodeOpen && ontologySearchOpen}
          onOpenChange={(next) => {
            if (createNodeOpen && next) return;
            setOntologySearchOpen(next);
          }}
          onSelectNode={(node) => handleSelect(node.id)}
          onSelectProject={(project) => handleSelect(project.slug)}
        />
        <ShortcutSheet
          open={!createNodeOpen && shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
        <DocsQuickDrawer
          open={!createNodeOpen && docsDrawerOpen}
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
      </div>
    </main>
  );
}

function resolveTopologyNodeTitle({
  slug,
  projectBySlug,
  ontologyNodes,
}: {
  slug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
}): string | null {
  if (!slug) return null;

  const project = projectBySlug.get(slug);
  if (project) return project.name;

  const title = resolveTopologySelectedOntologyNode(slug, ontologyNodes)?.title ?? slug;
  return compactTopologyPanelTitle(title);
}

function compactTopologyPanelTitle(title: string | null): string | null {
  if (!title) return null;
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}
