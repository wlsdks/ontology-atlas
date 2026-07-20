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
import { BookOpen, HelpCircle, Plus, Waypoints, X } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { useAdaptiveRecentChanges, useOntologyInsight, useVaultDocFreshnessIndex } from "@/features/vault-ontology";
import {
  buildDomainMarkdown,
  buildProjectMarkdown,
  deriveBootstrapPlan,
  domainDocSlug,
  selectedElements,
  useLocalVault,
  buildMcpConfigJson,
  buildCodexMcpAddCommandTemplate,} from "@/features/docs-vault-local";
import { FirstRunReadout, useFirstRunSampleModeSettled } from "@/features/first-run-starter";
// 타입/기본값은 지도 렌더러(캔버스) 의존성 없는 별도 모듈에서 직접 import해서
// SSR 평가 경로에 렌더러 참조가 끼지 않도록 한다.
import {
  DEFAULT_TOPOLOGY_CONTROLS,
  type TopologyControlsState,
} from "@/widgets/topology-controls/model/controls-state";
import { HeroCollapsed } from "@/widgets/hero-header";
import { useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";
// Bare `?p=` miss grace window — see the deeplinkMissNotifiedRef effect
// below (`../lib/deeplink-miss-notice.ts`) for why this exists.
const DEEPLINK_MISS_GRACE_MS = 4000;

const TopologyControls = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyControls),
  { ssr: false },
);
const HubRail = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.HubRail),
  { ssr: false },
);
/** P3b — 관계 타입 → 문장 i18n 키 (dependencies/depends_on 통일 등). */
function normalizeEdgeSentenceKey(type: string): string {
  if (type === "dependencies" || type === "depends_on") return "depends";
  if (type === "contains" || type === "elements" || type === "capabilities" || type === "domains" || type === "domain") return "contains";
  if (type === "describes") return "describes";
  if (type === "belongs_to") return "belongsTo";
  return "related";
}

const TopologyEmptyState = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyEmptyState),
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
// perf sweep 2026-07 — `FullDetailA1` is the opt-in "전체 상세 →" overlay
// (design.md: full-bleed detail is opt-in, never the click default), so like
// the other overlay widgets above it has no business in the first-load
// bundle. It statically imported `react-markdown` (+ `remark`), which alone
// measured ~129KB gzip and was shipping to EVERY visit of `/`/`/topology`
// even for users who never open a full-detail card. `buildFullDetailGroups`/
// `buildFullDetailReachModel` stay as regular imports below — they're plain
// data-shaping functions (no ReactMarkdown dependency) needed synchronously
// to compute `fullDetailA1Model`, not the component render itself.
const FullDetailA1 = dynamic(
  () => import("@/widgets/full-detail-a1").then((m) => m.FullDetailA1),
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
  useRelationVocabulary,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import {
  buildOntologyTree,
  computeDomainCensusRows,
  computeOntologyChangeset,
  domainCensusById,
  formatAgentPostChangeSyncPacket,
  isWithinRecentWindow,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { useHomeRouteState } from "../model/use-home-route-state";
import {
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
  resolveTopologyNodeClickRouteState,
  type TopologyAnalysisMode,
} from "../model/url-state";
import {
  buildTopologyAnalysisSummary,
  buildTopologyHealthActionTarget,
  classifyTopologyRelationQuality,
  computeTopologyPathHopCount,
  formatOntologyReanalysisAgentCommand,
  formatTopologyOverviewBrief,
  formatTopologyPathAgentPacket,
} from "../lib/topology-analysis";
import { filterOntologyConnectedOrphans } from "../lib/topology-health";
import {
  countProjectRelationsWithinGraph,
  resolveTopologyOverlayState,
  resolveTopologyRenderState,
} from "../lib/topology-render-state";
import { resolveTopologySelectedOntologyNode } from "../lib/resolve-topology-selected-node";
import { resolveDeeplinkMissDecision } from "../lib/deeplink-miss-notice";
import { resolveAgentFocusNodeId } from "../lib/resolve-agent-focus-node";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";
import { computeCanonicalCensus } from "@/shared/lib/ontology-tree/canonical-census";
import { formatActivityAge } from "@/features/vault-ontology";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import { OntologyBootstrapForm } from "./OntologyBootstrapForm";
import { AgentConnectSheet, type AgentConnectState } from "@/widgets/agent-connect";
import { TopologyV2EdgePanel } from "@/widgets/topology-map-v2/ui/TopologyV2EdgePanel";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import { buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
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
import { TopologyPathChip } from "./TopologyPathChip";
import { TopologyRelationLegend } from "./TopologyRelationLegend";
import { TopologyReviewLink } from "./TopologyReviewLink";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
import { resolveTopologyEscLadderAction } from "../lib/topology-esc-ladder";

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";
/** INDEX panel preference (B3 허브가 곧 지도) — separate key from the legacy
 * hero-rail `LEFT_PANEL_COLLAPSED_KEY` above, a different feature entirely. */
const INDEX_PANEL_COLLAPSED_KEY = "demo:index-panel-collapsed:v1";

export function HomePage() {
  const t = useTranslations('topology');
  const tKinds = useTranslations('kinds');
  const relationVocabulary = useRelationVocabulary();
  const [topologyControls, setTopologyControls] = useState<TopologyControlsState>(
    DEFAULT_TOPOLOGY_CONTROLS,
  );
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  const localGraphRoot =
    localGraphStack.length > 0 ? localGraphStack[localGraphStack.length - 1] : null;
  const [fitViewToken, setFitViewToken] = useState(0);
  const [topologyVisibleCount, setTopologyVisibleCount] = useState<number | null>(null);
  // M-5 — semantic-zoom altitude tier reported by the map engine, for the
  // corner readout's orientation label. "spine" at the overview entry; drops
  // the "zoom in to see elements" hint once it reaches "element".
  const [mapZoomTier, setMapZoomTier] = useState<"spine" | "circuit" | "element">(
    "spine",
  );
  const [topologyGraphStats, setTopologyGraphStats] = useState<{
    key: string;
    nodes: number;
    relations: number;
  } | null>(null);
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
  // localStorage 를 읽으면 hydration mismatch (서버/클라 className 불일치).
  // 저장된 선호는 useSyncExternalStore 의 server snapshot 으로 SSR 기본값을
  // 유지한 뒤 클라이언트 snapshot 에서 반영한다.
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
  const leftSlotOwner = resolveLeftSlotOwner({ analysisMode });
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
  // perf/persistent-shell — AppNavRail 은 이제 layout 에 상주해 지형도가 직접
  // 마운트하지 않는다. 레일 하단 설정 게어는 이 페이지 소유 state
  // (indexPanelCollapsedStored 등)에 의존하므로, 레일이 렌더할 노드를
  // Context 로 등록한다(`useNavRailSettingsSlot`) — 다른 라우트로 이동하면
  // effect cleanup 이 자동으로 비운다.
  const navRailSettingsSlot = useMemo(
    () => (
      <TopologyV2SettingsGear
        indexDefaultCollapsed={indexPanelCollapsedStored}
        onChangeIndexDefaultCollapsed={handleChangeIndexDefaultCollapsed}
        changeVaultHref="/docs/?intent=local"
        popoverAlign="left"
        popoverSide="top"
        // M-4 (2) — keyboard-opened transients (⌘K palette, `D` docs drawer)
        // don't fire the `mousedown`-outside the gear's own outside-click
        // handler relies on, so they'd leave the gear stacked underneath.
        // Signal them here so the gear demotes itself. Pointer-driven surfaces
        // (node/edge click, context menu, graph toggle) already close it via
        // outside-click.
        suppressed={ontologySearchOpen || docsDrawerOpen}
        labels={{
          trigger: t('controls.settingsGearAriaLabel'),
          heading: t('controls.settingsGearHeading'),
          locale: t('controls.settingsGearLocale'),
          indexDefault: t('controls.settingsGearIndexDefault'),
          indexDefaultExpanded: t('controls.settingsGearIndexDefaultExpanded'),
          indexDefaultCollapsed: t('controls.settingsGearIndexDefaultCollapsed'),
          changeVault: t('controls.settingsGearChangeVault'),
          changeVaultAriaLabel: t('controls.settingsGearChangeVaultAriaLabel'),
        }}
      />
    ),
    [
      indexPanelCollapsedStored,
      handleChangeIndexDefaultCollapsed,
      ontologySearchOpen,
      docsDrawerOpen,
      t,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — the analysis rail owns the slot only because of a non-overview
  // mode (focus/path/health), so returning to overview is always enough.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    if (analysisMode !== "overview") {
      setRouteState((current) => ({ ...current, analysisMode: "overview" }));
    }
  }, [analysisMode, setIndexPreference, setRouteState]);
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
  // S-C1 — 노드 데이터시트 "언제 바뀌었나" (mode-aware manifest updatedAt).
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  // P4a — "최근 변경" 렌즈(mtime 7일 창). `computeRecentChanges` 순수 함수 +
  // 이 훅과 같은 session-snapshot 시각 규율(`use-recent-changes.ts`).
  const recentChanges = useAdaptiveRecentChanges();
  // "N일 전" 계산의 기준 시각 — 일 단위 해상도라 세션 시작 스냅샷이면 충분
  // (render 중 Date.now() 는 react-hooks/purity 위반; 세션 동안 라벨이
  // 흔들리지 않는 것도 changeBaseline 과 같은 이유로 오히려 바람직하다).
  const [updatedAgoNowMs] = useState(() => Date.now());
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
  //
  // `resolveDeeplinkMissDecision` (../lib/deeplink-miss-notice.ts) decides
  // *when*: a kind-prefixed slug (`element:foo`) can never collide with a
  // project slug, so it's flagged the moment neither list has it. A bare
  // slug (`project`) could still turn out to BE a project slug, so it waits
  // for `projectsQuery.loaded` — but only up to DEEPLINK_MISS_GRACE_MS, not
  // forever. Cross-verified UX round finding (2026-07-19, ledger item 3):
  // when the project list never finished loading, a bare miss used to stay
  // silent permanently — the dangling `?p=` param just sat there unexplained.
  const deeplinkMissNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    const decision = resolveDeeplinkMissDecision({
      selectedSlug,
      hasOntologyMatch: Boolean(selectedOntologyNode),
      hasProjectMatch: Boolean(selectedProject),
      projectsLoaded: projectsQuery.loaded,
    });
    if (decision.action === "none") return;
    if (!selectedSlug || deeplinkMissNotifiedRef.current === selectedSlug) return;

    const notify = () => {
      deeplinkMissNotifiedRef.current = selectedSlug;
      toast.show(t("deeplinkNotFound", { query: selectedSlug }), "error");
    };

    if (decision.action === "notify-now") {
      let cancelled = false;
      window.queueMicrotask(() => {
        if (!cancelled) notify();
      });
      return () => {
        cancelled = true;
      };
    }

    // "notify-after-grace" — bare slug, project list still loading. Wait
    // bounded rather than forever; cancelled + re-decided if the deps
    // change first (e.g. the project list finishes loading and resolves
    // the slug after all).
    const timer = window.setTimeout(notify, DEEPLINK_MISS_GRACE_MS);
    return () => window.clearTimeout(timer);
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
  // W6 agent visibility — "the agent's last-touched node, shown on the map
  // itself" (the product's own agent-native identity, not just a rail dot).
  // Only while the heartbeat is FRESH (same `hasFreshHeartbeat` bar the rail
  // dot/popover already use) — a stale heartbeat's stale focus would mislead
  // more than help. Real heartbeat data only: no slug, no match, or no fresh
  // heartbeat all resolve to `null`, which draws nothing extra on the map.
  const agentActivityStatus = vault.agentActivityStatus;
  const hasFreshAgentHeartbeat = Boolean(
    agentActivityStatus?.heartbeat && agentActivityStatus.valid && !agentActivityStatus.stale,
  );
  const agentFocusNodeId = useMemo(() => {
    if (!hasFreshAgentHeartbeat) return null;
    return resolveAgentFocusNodeId(
      agentActivityStatus?.heartbeat?.focus.ontologySlug ?? null,
      ontologyInsight?.nodes,
    );
  }, [hasFreshAgentHeartbeat, agentActivityStatus, ontologyInsight]);
  // P4b — "에이전트가 방금" INDEX 배지. 이미 fresh-게이트를 통과한
  // `agentFocusNodeId`(W6 지도 링과 같은 소스)가 최근-변경 렌즈 안에도 있을
  // 때만 — 두 번째 매치 휴리스틱을 새로 만들지 않고 기존 신호를 그대로 재사용.
  const agentAttributedRecentNodeId = useMemo(
    () => (agentFocusNodeId && recentChanges.recentNodeIds.has(agentFocusNodeId) ? agentFocusNodeId : null),
    [agentFocusNodeId, recentChanges],
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
  // Slice 1 (discovery.md F1~F6) — "내 문서로 지도 만들기". 열린 vault 에
  // .md 는 있는데 지도 노드가 0 인 순간의 부트스트랩 다이얼로그.
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  // P3d(E1) — 부트스트랩 완료 시 지도 리빌 연출 트리거.
  const [mapRevealToken, setMapRevealToken] = useState(0);
  // P2a — "AI 에이전트 연결" 시트.
  const [agentConnectOpen, setAgentConnectOpen] = useState(false);
  // P3b — 선택된 엣지 (노드 선택과 배타: 노드를 고르면 해제).
  const [selectedEdge, setSelectedEdge] = useState<{
    sourceId: string;
    targetId: string;
    relationType: string;
    declaredBySlug: string | null;
  } | null>(null);
  const edgePanelModel = useMemo(() => {
    if (!selectedEdge || !ontologyInsight) return null;
    const from = ontologyInsight.nodes.find((n) => n.id === selectedEdge.sourceId);
    const to = ontologyInsight.nodes.find((n) => n.id === selectedEdge.targetId);
    if (!from || !to) return null;
    // P6 — 이 관계의 why (relation_notes → derive 가 edge.label 로 승격).
    const edgeRecord = ontologyInsight.edges.find(
      (e) => e.from === selectedEdge.sourceId && e.to === selectedEdge.targetId,
    );
    const why = edgeRecord?.label?.trim() || null;
    const typeLabel = relationVocabulary(selectedEdge.relationType, "formal");
    const sentence = t(`edgeSentence.${normalizeEdgeSentenceKey(selectedEdge.relationType)}`, {
      from: from.title,
      to: to.title,
    });
    const declaredIso = selectedEdge.declaredBySlug
      ? docFreshnessIndex.get(selectedEdge.declaredBySlug)
      : undefined;
    const ago = declaredIso ? computeUpdatedAgo(declaredIso, updatedAgoNowMs) : null;
    return {
      sentence,
      typeLabel,
      fromId: from.id,
      toId: to.id,
      fromTitle: from.title,
      toTitle: to.title,
      declaredBy: selectedEdge.declaredBySlug
        ? { slug: selectedEdge.declaredBySlug, href: buildDocsVaultHref({ slug: selectedEdge.declaredBySlug }) }
        : null,
      updatedAtLabel: ago ? t(`nodeDatasheet.updated_${ago.key}`, { count: ago.count }) : null,
      builderEditHref: `/ontology/edit/?node=${encodeURIComponent(from.evidenceIds[0] ?? from.id)}`,
      why,
    };
  }, [selectedEdge, ontologyInsight, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary]);
  // purity: "N분 전" 기준 시각은 시트가 열린 순간의 스냅샷 (렌더 중 Date.now 금지).
  const [agentConnectNowMs, setAgentConnectNowMs] = useState(0);
  const agentConnectStatus = useMemo<AgentConnectState>(() => {
    const hb = agentActivityStatus?.heartbeat ?? null;
    if (!hb || !agentActivityStatus?.valid) return { kind: "none" };
    const agoMs = agentConnectNowMs - new Date(hb.updatedAt).getTime();
    const ago = formatActivityAge(agoMs);
    if (agentActivityStatus.stale) return { kind: "stale", agoLabel: ago };
    const focusSlug = hb.focus.ontologySlug;
    const focusTitle = focusSlug
      ? (ontologyInsight?.nodes.find((n) => n.evidenceIds[0] === focusSlug || n.id === focusSlug)?.title ?? focusSlug)
      : null;
    return { kind: "connected", agentLabel: hb.agent ?? t("agentConnect.defaultAgentLabel"), agoLabel: ago, focusTitle };
  }, [agentActivityStatus, ontologyInsight, agentConnectNowMs, t]);
  const agentConnectSnippets = useMemo(() => {
    const vaultName = vault.handle?.name ?? "my-vault";
    const desktopPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
    return {
      mcpJson: buildMcpConfigJson(vaultName, desktopPath),
      codexCommand: buildCodexMcpAddCommandTemplate(vaultName, desktopPath),
      needsManualPath: desktopPath === null,
    };
  }, [vault.handle]);
  const agentConnectDomains = useMemo(
    () => (ontologyInsight?.nodes ?? []).filter((n) => n.kind === "domain").map((n) => n.title),
    [ontologyInsight],
  );
  const bootstrapPlan = useMemo(() => {
    if (!vault.manifest) return null;
    return deriveBootstrapPlan(
      vault.manifest.docs.map((d) => ({ slug: d.slug, title: d.title, frontmatter: d.frontmatter })),
      vault.handle?.name ?? "my-project",
    );
  }, [vault.manifest, vault.handle]);
  const runBootstrap = useCallback(
    async (input: { projectTitle: string; acceptedDomains: ReadonlySet<string> }) => {
      if (!bootstrapPlan || !vault.manifest) return;
      const plan = { ...bootstrapPlan, projectTitle: input.projectTitle };
      const elements = selectedElements(plan, input.acceptedDomains);
      // frontmatter 만 추가 (본문 무변경) — 마지막 createDoc 의 내부 리로드가
      // 전체를 한 번에 반영하도록 개별 write 는 refresh 를 생략한다.
      for (const el of elements) {
        await vault.updateFrontmatter(
          el.slug,
          el.domain ? { kind: "element", title: el.title, domain: el.domain } : { kind: "element", title: el.title },
          { skipRefresh: true },
        );
      }
      // 재검 마찰 D — 승인 도메인을 스텁이 아닌 실제 .md 로. 같은 경로에
      // 문서가 이미 있거나(요소로 승격됨) 동명 domain 문서가 있으면 생략.
      const acceptedDomainCandidates = plan.domains.filter((d) => input.acceptedDomains.has(d.name));
      for (const domain of acceptedDomainCandidates) {
        const slug = domainDocSlug(domain.name);
        const tail = slug.split("/").pop();
        const taken =
          vault.manifest.docs.some((d) => d.slug === slug) ||
          vault.manifest.docs.some(
            (d) => d.frontmatter.kind === "domain" && d.slug.split("/").pop() === tail,
          );
        if (!taken) await vault.createDoc(slug, buildDomainMarkdown(domain));
      }
      if (plan.existingProjectSlug) {
        // 재검 마찰 A — 이미 프로젝트가 있는 vault: 두 번째 프로젝트를
        // 만들지 않고 기존 프로젝트의 domains 에 승인분을 덧붙인다.
        const existing = vault.manifest.docs.find((d) => d.slug === plan.existingProjectSlug);
        const prevDomains = Array.isArray(existing?.frontmatter.domains)
          ? (existing.frontmatter.domains as string[])
          : [];
        const accepted = plan.domains.filter((d) => input.acceptedDomains.has(d.name)).map((d) => d.name);
        const mergedDomains = [...new Set([...prevDomains, ...accepted])];
        await vault.updateFrontmatter(plan.existingProjectSlug, { domains: mergedDomains });
      } else {
        await vault.createDoc(plan.projectSlug, buildProjectMarkdown(plan, input.acceptedDomains));
      }
      setBootstrapOpen(false);
      // E1 — 리로드된 그래프가 "내 문서들이 모이는" 연출로 등장한다.
      setMapRevealToken((n) => n + 1);
      toast.show(
        t(plan.existingProjectSlug ? "bootstrap.toastAdded" : "bootstrap.toastDone", { count: elements.length }),
        "success",
      );
    },
    [bootstrapPlan, vault, toast, t],
  );
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
  // M-7 — Escape rung 1 dismisses the node popover WITHOUT releasing the ego
  // focus (dim); rung 2 (with this true) then deselects. Reset to false on
  // every fresh node selection so re-clicking a node always re-opens its
  // popover. `null` selection also clears it via handleClose.
  const [nodePopoverDismissed, setNodePopoverDismissed] = useState(false);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  const topologyShortcutHelpPhoneVisible =
    analysisMode !== "path" && analysisMode !== "health";
  const createNodePending = createNodeIntent && !canCreateNode;
  const topologyCreateNodeBlockingActive = createNodeOpen || createNodePending || bootstrapOpen;
  const topologyBlockingOverlayState = bootstrapOpen
    ? "bootstrap-from-docs"
    : createNodeOpen
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
    // M-2 — typed-fact metric: containment ("담는 것") is its own count, split
    // out of the old direction-only "기대는 곳" so a domain's contained
    // capabilities stop reading as things the domain depends ON. Numbers come
    // from the SAME `groups` the panel renders, so header and metric agree.
    const metric = {
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      evidence: evidenceRows.length,
    };
    const handoffText = formatV2HandoffText({
      slug,
      kind: nodeFocus.kind,
      domainTitle: nodeFocusData?.significance.ownerDomainTitle ?? null,
      contains: metric.contains,
      usedBy: metric.usedBy,
      dependsOn: metric.dependsOn,
      evidence: metric.evidence,
      containsNames: groups.contains.rows.map((connection) => connection.title),
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
      // N6 — 소속 도메인 1급 사실. 이미 `buildNodeSignificance` 가 계산한
      // containment 부모(`ownerDomain`)를 그대로 재사용 — 별도 조회 없음.
      domain: nodeFocusData?.significance.ownerDomainId
        ? {
            id: nodeFocusData.significance.ownerDomainId,
            title: nodeFocusData.significance.ownerDomainTitle ?? "",
          }
        : null,
      // M-3 — 신선도 진실원 단일화: powered 도 updatedAt(mtime) 사다리에서.
      // 이전엔 changedSlugs(세션 baseline)와 mtime 이 갈라져 "정체 · 오늘
      // 바뀜"이 한 줄에 공존하는 모순이 났다.
      powered: (() => {
        const iso = nodeFocus.sourceSlug ? docFreshnessIndex.get(nodeFocus.sourceSlug) : undefined;
        return iso ? isWithinRecentWindow(iso, updatedAgoNowMs) : false;
      })(),
      // S-C1 — AI 가 계속 갱신하는 그래프에서 변경 시점이 안 보이면 사람이
      // 변경을 구분할 수 없다. manifest updatedAt → "N일 전" 사다리.
      updatedAtLabel: (() => {
        const iso = nodeFocus.sourceSlug ? docFreshnessIndex.get(nodeFocus.sourceSlug) : undefined;
        if (!iso) return null;
        const ago = computeUpdatedAgo(iso, updatedAgoNowMs);
        if (!ago) return null;
        return t(`nodeDatasheet.updated_${ago.key}`, { count: ago.count });
      })(),
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
  }, [nodeFocus, selectedOntologyNode, ontologyInsight, nodeFocusData, docFreshnessIndex, updatedAgoNowMs, t]);
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
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      evidence: evidenceRows.length,
      containsNames: groups.contains.rows.map((connection) => connection.title),
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
        // P0c — 정본 census (renderProjects 이중 가산 제거)
        totalConcepts: ontologyInsight.nodes.length,
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
  // M-7 — the compact node popover is actually on screen (same condition the
  // popover JSX renders under). Drives both the Escape ladder's
  // `nodePopoverOpen` rung and the popover's own render guard, so the two can
  // never disagree about whether Escape#1 should close it.
  const nodePopoverVisible =
    selectedNodeFocusActive &&
    !selectedRelationActive &&
    !createNodeOpen &&
    !nodePopoverDismissed;
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
      setNodePopoverDismissed(false);
      const project = projectBySlug.get(slug);
      // path 모드/일반 선택 분기는 `resolveTopologyNodeClickRouteState` 가
      // 담당 — persona QA fix/persona-findings ②, 자세한 배경은 그 함수의
      // 주석 참고 (`../model/url-state.ts`).
      setRouteState((current) =>
        resolveTopologyNodeClickRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
    },
    [projectBySlug, setRouteState],
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
      // R-1 (Guardian 총괄) — 엣지 팝오버가 열려 있으면 Esc 1단은 그것부터
      // 닫는다 (사다리 최상단 소비 — 노드 팝오버와 같은 계약).
      if (selectedEdge !== null) {
        setSelectedEdge(null);
        return;
      }
      const action = resolveTopologyEscLadderAction({
        contextMenuOpen: contextMenuNode !== null,
        createNodeOpen,
        searchOpen: ontologySearchOpen,
        fullDetailOpen,
        selectedRelationActive,
        hasSelection: canvasSelectedSlug != null,
        nodePopoverOpen: nodePopoverVisible,
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
        case "close-node-popover":
          // M-7 rung 1 — hide the popover but keep the ego focus (dim). The
          // NEXT Escape sees `nodePopoverOpen: false` and falls through to
          // "deselect".
          setNodePopoverDismissed(true);
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
    nodePopoverVisible,
    localGraphRoot,
    closeContextMenu,
    closeCreateNode,
    handleClose,
    selectedEdge,
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
  // 경로 칩(TopologyPathChip)의 "N홉" — 분석 패널 완전 소멸 2단계 §b. 예전
  // path 패널엔 실제 hop 수 표시가 없었다(후보 가시성 문구만 있었다) — 칩의
  // "성립" 상태를 의미 있게 만들려면 실제 최단 거리가 필요해 새로 계산한다.
  const pathHopCount = useMemo(() => {
    if (!pathSourceSlug || !pathTargetSlug || !ontologyInsight) return null;
    return computeTopologyPathHopCount(
      pathSourceSlug,
      pathTargetSlug,
      ontologyInsight.nodes,
      ontologyInsight.edges,
    );
  }, [pathSourceSlug, pathTargetSlug, ontologyInsight]);
  // 경로 칩의 상단 중앙 상태 라인 — "경로: X → 대상 선택" / "X → Y · N홉" /
  // 경로 없음. 예전 path 패널이 좌측 슬롯에서 하던 걸 상단 칩 1개로 압축
  // (분석 패널 완전 소멸 2단계 §b).
  const pathChipLabel = useMemo(() => {
    if (!pathSourceSlug || !pathSourceTitle) return null;
    if (!pathTargetSlug || !pathTargetTitle) {
      return t("analysis.pathChipUnresolved", { source: pathSourceTitle });
    }
    if (pathHopCount === null) {
      return t("analysis.pathChipNoPath", {
        source: pathSourceTitle,
        target: pathTargetTitle,
      });
    }
    return t("analysis.pathChipResolved", {
      source: pathSourceTitle,
      target: pathTargetTitle,
      hops: pathHopCount,
    });
  }, [pathSourceSlug, pathSourceTitle, pathTargetSlug, pathTargetTitle, pathHopCount, t]);
  const [pathPacketCopied, setPathPacketCopied] = useState(false);
  const copyPathPacket = useCallback(async () => {
    if (!pathSourceSlug || !pathTargetSlug || !pathSourceTitle || !pathTargetTitle) return;
    const ok = await copyText(
      formatTopologyPathAgentPacket({
        sourceSlug: pathSourceSlug,
        targetSlug: pathTargetSlug,
        sourceTitle: pathSourceTitle,
        targetTitle: pathTargetTitle,
        hopCount: pathHopCount,
        labels: {
          title: t("analysis.pathChipPacketTitle"),
          source: t("analysis.pathChipPacketSource"),
          target: t("analysis.pathChipPacketTarget"),
          hops: t("analysis.pathChipPacketHops"),
          hopsUnknown: t("analysis.pathChipPacketHopsUnknown"),
          sourceOntologyUrl: t("analysis.pathChipPacketSourceOntologyUrl"),
          targetOntologyUrl: t("analysis.pathChipPacketTargetOntologyUrl"),
          sourceBuilderUrl: t("analysis.pathChipPacketSourceBuilderUrl"),
          targetBuilderUrl: t("analysis.pathChipPacketTargetBuilderUrl"),
          mcpCheck: t("analysis.pathChipPacketMcpCheck"),
        },
      }),
    );
    if (!ok) return;
    setPathPacketCopied(true);
    window.setTimeout(() => setPathPacketCopied(false), 1600);
  }, [pathSourceSlug, pathTargetSlug, pathSourceTitle, pathTargetTitle, pathHopCount, t]);
  // 칩의 ✕ — 경로 상태를 완전히 지우고 지도로 복귀. 예전엔 path 모드가 좌측
  // 슬롯을 차지해 "지도" 탭을 다시 눌러야 나갈 수 있었다.
  const handleClearPath = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      analysisMode: "overview",
      pathSourceSlug: null,
      pathTargetSlug: null,
    }));
  }, [setRouteState]);
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
  // P0c — 정본 census: insight.nodes 에 kind:project 가 이미 포함돼 있어
  // renderProjects 를 더하면 이중 가산(지도 294 vs 인사이트 293 불일치의
  // 원인). "개념/관계" census 는 insight 파생 전체가 단일 출처다
  // (`shared/lib/ontology-tree/canonical-census.ts`).
  const topologyCanonicalCensus = computeCanonicalCensus(
    ontologyInsight?.nodes ?? [],
    ontologyInsight?.edges ?? [],
  );
  const topologyTotalNodes = topologyCanonicalCensus.conceptCount;
  const topologyTotalRelations = topologyCanonicalCensus.relationCount;
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
  // Guardian I-1 — 도메인 크기 단일 진실원(그래프 BFS). INDEX 트리 행과
  // /projects·인사이트가 같은 숫자를 말하게 한다.
  const indexDomainCensus = useMemo(
    () =>
      ontologyInsight
        ? domainCensusById(computeDomainCensusRows(ontologyInsight.nodes, ontologyInsight.edges, ["domain"]))
        : null,
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
  const currentTopologyGraphStats =
    topologyGraphStats?.key === visibleTopologyStatsKey ? topologyGraphStats : null;
  const topologyRenderState = resolveTopologyRenderState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentTopologyGraphStats?.relations ?? visibleTopologyRelationCount,
  });
  const topologyFiltersActive =
    activeCategory !== null ||
    topologyControls.searchQuery.trim().length > 0 ||
    topologyControls.depthLimit !== null ||
    topologyControls.hubsOnly;
  const topologyOverlayState = resolveTopologyOverlayState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentTopologyGraphStats?.relations ?? visibleTopologyRelationCount,
    visibleNodes: topologyVisibleCount,
    filtersActive: topologyFiltersActive,
  });
  const emptyTopologyNodeCount = currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount;
  const handleTopologyGraphStatsChange = useCallback(
    (stats: { nodes: number; relations: number }) => {
      setTopologyGraphStats({ key: visibleTopologyStatsKey, ...stats });
    },
    [visibleTopologyStatsKey],
  );
  const clearTopologyFilters = useCallback(() => {
    setTopologyControls((current) => ({
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
    visibleCount: topologyVisibleCount,
    totalCount: topologyTotalNodes,
    relationCount: topologyTotalRelations,
    relationProvenance: topologyRelationProvenance,
    relationQuality: topologyRelationQuality,
    ...topologyHealthSummary,
  });
  // INDEX 푸터 "인계" 메뉴 3종 텍스트 — W3 분석 보기 은퇴로
  // `TopologyAnalysisBar` overview 모드에서 이관. 포맷터는
  // `views/home/lib/topology-analysis.ts` 단일 출처, 여기서는 조립만 한다.
  const indexAgentHandoffBriefText = formatTopologyOverviewBrief({
    summary: analysisSummary,
    labels: {
      title: t("analysis.overviewBriefTitle"),
      totalNodes: t("analysis.overviewBriefTotalNodes"),
      totalRelations: t("analysis.overviewBriefTotalRelations"),
      relationReading: t("analysis.overviewBriefRelationReading"),
      relationProvenance: t("analysis.overviewBriefRelationProvenance"),
      relationSourceBacked: t("analysis.overviewBriefRelationSourceBacked"),
      relationAuthored: t("analysis.overviewBriefRelationAuthored"),
      relationNeedsReview: t("analysis.overviewBriefRelationNeedsReview"),
      relationQuality: t("analysis.overviewBriefRelationQuality"),
      relationQualityStrong: t("analysis.overviewBriefRelationQualityStrong"),
      relationQualitySupported: t("analysis.overviewBriefRelationQualitySupported"),
      relationQualityWeak: t("analysis.overviewBriefRelationQualityWeak"),
      relationQualityReview: t("analysis.overviewBriefRelationQualityReview"),
      agentReadiness: t("analysis.overviewAgentReadiness"),
      agentReadinessReady: t("analysis.overviewAgentReadinessReady"),
      agentReadinessPreflight: t("analysis.overviewAgentReadinessPreflight"),
      agentReadinessReview: t("analysis.overviewAgentReadinessReview"),
      healthSignals: t("analysis.overviewBriefHealthSignals"),
      stale: t("analysis.healthStale"),
      orphan: t("analysis.healthOrphan"),
      promotion: t("analysis.healthPromotion"),
      url: t("analysis.healthEvidenceUrl"),
      healthUrl: t("analysis.overviewBriefHealthUrl"),
      insightsUrl: t("analysis.overviewBriefInsightsUrl"),
      agentCheck: t("analysis.overviewBriefAgentCheck"),
      mcpCheck: t("analysis.overviewBriefMcpCheck"),
      mcpQueryPlan: t("analysis.overviewBriefMcpQueryPlan"),
      workspaceCheck: t("analysis.overviewBriefWorkspaceCheck"),
      mcpWorkspaceCheck: t("analysis.overviewBriefMcpWorkspaceCheck"),
    },
    url: typeof window === "undefined" ? null : window.location.href,
    // S5 재편 — 수리 큐는 이제 인사이트 기본 탭 "할 일"에 있다.
    healthUrl: "/ontology/insights/",
    insightsUrl: "/ontology/insights/",
  });
  const indexAgentHandoffReanalyzeText = formatOntologyReanalysisAgentCommand();
  const indexAgentHandoffSyncText = formatAgentPostChangeSyncPacket();
  useEffect(() => {
    if (analysisModeRef.current === analysisMode) return;
    analysisModeRef.current = analysisMode;

    setTopologyControls((current) => {
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
    <main id="main" className="relative flex h-screen w-full overflow-hidden bg-[color:var(--color-canvas)]">
      {/* 좌측 64px 내비 레일은 perf/persistent-shell 이후 `app/[locale]/layout.tsx`
          (AppShell) 상주 — 이 페이지는 더 이상 직접 마운트하지 않는다. 레일
          하단 설정 게어는 위 `useNavRailSettingsSlot(navRailSettingsSlot)`로
          Context 등록. */}
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
                <div
                  className="min-w-0 overflow-hidden"
                  // 우측 topology-utility-action-lane(Graph/Workspace pill,
                  // absolute right-4 + 콘텐츠 폭 ~236px)과 이 브랜드 라벨은
                  // 서로 다른 absolute 오버레이라 flex-wrap 으로 자연스럽게
                  // 밀어낼 수 없다 — 뷰포트가 좁을수록(<390px) 레인의 왼쪽
                  // 시작점도 함께 왼쪽으로 밀리므로 고정 px 대신 vw 기반
                  // calc 로 항상 여유 간격을 확보한다(criterion ② 겹침 0).
                  style={{ maxWidth: "max(0px, calc(100vw - 310px))" }}
                >
                  <span
                    translate="no"
                    className="block truncate text-[11px] text-[color:var(--color-text-quaternary)]"
                  >
                    ontology-atlas
                  </span>
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
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
              // 개념/관계 숫자 두 세그먼트는 t.rich 의 <b> 태그(messages/*.json
              // — feat/chrome-finish 세그먼트 각인)로 감싸 engraved-numeral
              // 토큰(다른 census 표면 — ProjectDetailPage/DocsVaultPage — 와
              // 동일 문법)으로 볼드 처리한다. subtitle prop 이 문자열이 아니라
              // ReactNode 를 받아야 해서 HeroCollapsed 타입도 함께 넓혔다.
              const workspaceSubtitle = t.rich('workspace.subtitle', {
                concepts: topologyTotalNodes,
                relations: topologyTotalRelations,
                growth: '',
                b: (chunks) => (
                  <b
                    data-token="engraved-numeral"
                    className="font-semibold not-italic text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                  >
                    {chunks}
                  </b>
                ),
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
                    pathChip={
                      analysisMode === "path" && pathChipLabel ? (
                        <TopologyPathChip
                          label={pathChipLabel}
                          resolved={Boolean(pathSourceSlug && pathTargetSlug)}
                          copyPacketLabel={t("analysis.pathChipCopyPacket")}
                          copyPacketCopied={pathPacketCopied}
                          copyPacketAriaLabel={t("analysis.pathChipCopyPacketAriaLabel")}
                          copyPacketCopiedAriaLabel={t(
                            "analysis.pathChipCopyPacketCopiedAriaLabel",
                          )}
                          onCopyPacket={copyPathPacket}
                          clearAriaLabel={t("analysis.pathChipClear")}
                          onClear={handleClearPath}
                        />
                      ) : undefined
                    }
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
                    {/* 살아있는 그래프(physics on) 토글 — 분석 패널 완전 소멸
                        2단계 §d 로 TopologyAnalysisBar 의 2-tab 모드 레일에서
                        이관. 그 레일은 focus/path/health 가 모두 빠진 뒤
                        overview 모드에서는 leftSlotOwner 가 INDEX 를 우선해
                        전혀 렌더되지 않아(§a) 클릭으로 도달할 방법이 없었다
                        — 이 유틸리티 레일 칩이 유일한 진입점이 된다. */}
                    <Tooltip content={t('controls.graphToggleTooltip')} side="bottom" withProvider={false}>
                      <ChromeChip
                        onClick={() =>
                          handleSelectAnalysisMode(analysisMode === "graph" ? "overview" : "graph")
                        }
                        aria-pressed={analysisMode === "graph"}
                        aria-label={t('controls.graphToggleAriaLabel')}
                        data-testid="topology-graph-toggle"
                        data-utility-action-token-contract="support-surface-family"
                        data-utility-action-surface-token="--chrome-surface"
                        data-utility-action-border-token="--chrome-border"
                        data-utility-action-hover-surface-token="--color-overlay-2"
                        data-utility-action-active-surface-token="--chrome-active-surface"
                        data-utility-action-active-border-token="--chrome-active-border"
                        data-utility-action-shadow-token="--chrome-shadow"
                        data-utility-action-focus-ring-token="--color-indigo-accent"
                        compact={topologyUtilityChromeCompact}
                        icon={<Waypoints />}
                        active={analysisMode === "graph"}
                      >
                        {t('controls.graphToggleLabel')}
                      </ChromeChip>
                    </Tooltip>
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
                          // 높이/radius/compact 폭은 ChromeChip 기준(44px·10px)으로
                          // 수렴 — 같은 열의 "작업공간" 칩과 나란히 있어
                          // --topology-utility-lane-height(32~36px clamp) 를
                          // 쓰면 과도기 높이 불일치가 났다(feat/chrome-finish).
                          className={`inline-flex h-[var(--chrome-tile-size)] items-center justify-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--topology-utility-lane-accent-border)] bg-[color:var(--topology-utility-lane-accent-surface)] text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] shadow-[var(--topology-utility-lane-shadow)] transition-[background-color,border-color] duration-180 ease-out hover:bg-[color:var(--topology-utility-lane-accent-hover-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--topology-utility-lane-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none ${
                            topologyUtilityChromeCompact
                              ? "w-[var(--chrome-tile-size)] px-0"
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
            {bootstrapOpen && bootstrapPlan ? (
              <>
                <button
                  type="button"
                  aria-label={t('bootstrap.cancel')}
                  className="absolute inset-0 z-[25] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-180 ease-out motion-reduce:transition-none"
                  data-interactive-overlay="true"
                  data-testid="ontology-bootstrap-backdrop"
                  data-backdrop-contract="blocks-map-and-closes-composer"
                  data-backdrop-surface-token="--topology-blocking-backdrop-surface"
                  onClick={() => setBootstrapOpen(false)}
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={t('bootstrap.heading')}
                  tabIndex={-1}
                  className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 max-h-[var(--topology-blocking-composer-max-height)] w-[var(--topology-blocking-composer-width)] -translate-x-1/2 overflow-y-auto"
                  data-testid="ontology-bootstrap-panel"
                  data-attention-role="blocking-composer"
                  data-placement-contract="centered-blocking-edit"
                  data-surface-role="blocking-edit-surface"
                  data-elevation-contract="solid-panel-over-dimmed-map"
                  data-size-contract="bounded-centered-composer"
                  data-top-token="--topology-blocking-composer-top"
                  data-width-token="--topology-blocking-composer-width"
                  data-max-height-token="--topology-blocking-composer-max-height"
                >
                  <OntologyBootstrapForm
                    plan={bootstrapPlan}
                    onCancel={() => setBootstrapOpen(false)}
                    onConfirm={runBootstrap}
                    labels={{
                      heading: t("bootstrap.heading"),
                      projectName: t("bootstrap.projectName"),
                      folders: t("bootstrap.folders"),
                      folderDocCount: (count) => t("bootstrap.folderDocCount", { count }),
                      summary: (docCount, projectFile) =>
                        t("bootstrap.summary", { count: docCount, projectFile }),
                      bodyUntouched: t("bootstrap.bodyUntouched"),
                      alreadyTyped: (count) => t("bootstrap.alreadyTyped", { count }),
                      confirm: t("bootstrap.confirm"),
                      cancel: t("bootstrap.cancel"),
                      errorPrefix: t("bootstrap.errorPrefix"),
                    }}
                  />
                </div>
              </>
            ) : null}
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
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
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
                      className="mt-3 inline-flex h-8 items-center justify-center rounded-full border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-3 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
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
                    onOpenAgentConnect={() => {
                      setAgentConnectNowMs(Date.now());
                      setAgentConnectOpen(true);
                    }}
                    domainCensus={indexDomainCensus}
                    // P4a — 렌즈 필터용 id 집합 + P4b 배지 대상.
                    recentChanges={{
                      ids: recentChanges.recentNodeIds,
                      agentAttributedNodeId: agentAttributedRecentNodeId,
                    }}
                    // P4c — "지도에 없는 문서 N개 · 올리기". `bootstrapPlan` 은
                    // vault 가 로드되기만 하면(빈 지도든 아니든) 항상 계산돼
                    // 있으므로 새 파생 없이 그 카운트를 그대로 노출한다 —
                    // 클릭은 기존 "내 문서로 지도 만들기" 다이얼로그를 연다
                    // (이전에는 지도가 완전히 빈 상태의 empty-state 에서만
                    // 열렸다; 이 행은 지도가 이미 채워진 상태에서도 연다).
                    uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                    onPromoteUncatalogedDocs={
                      bootstrapPlan && bootstrapPlan.elements.length > 0
                        ? () => setBootstrapOpen(true)
                        : undefined
                    }
                    // 브랜드 필의 censusGrowthText 와 같은 출처(recentlyUpdatedCount)
                    // — feat/chrome-system §9, 헤더→푸터 이관.
                    footerGrowthText={
                      recentlyUpdatedCount > 0
                        ? t('workspace.growthThisWeek', { count: recentlyUpdatedCount })
                        : undefined
                    }
                    agentHandoff={{
                      briefText: indexAgentHandoffBriefText,
                      reanalyzeText: indexAgentHandoffReanalyzeText,
                      syncText: indexAgentHandoffSyncText,
                      labels: {
                        menuLabel: t("index.agentHandoff"),
                        menuAria: t("index.agentHandoffAria"),
                        briefCopy: t("analysis.overviewBriefCopy"),
                        briefCopied: t("analysis.overviewBriefCopied"),
                        briefCopyAriaLabel: t("analysis.overviewBriefCopyAriaLabel"),
                        briefCopiedAriaLabel: t("analysis.overviewBriefCopiedAriaLabel"),
                        reanalyzeCopy: t("analysis.overviewReanalyzeCopy"),
                        reanalyzeCopied: t("analysis.overviewReanalyzeCopied"),
                        reanalyzeCopyAriaLabel: t("analysis.overviewReanalyzeCopyAriaLabel"),
                        reanalyzeCopiedAriaLabel: t("analysis.overviewReanalyzeCopiedAriaLabel"),
                        syncCopy: t("analysis.overviewSyncCopy"),
                        syncCopied: t("analysis.overviewSyncCopied"),
                        syncCopyAriaLabel: t("analysis.overviewSyncCopyAriaLabel"),
                        syncCopiedAriaLabel: t("analysis.overviewSyncCopiedAriaLabel"),
                      },
                    }}
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
                      domainCountTitle: t("index.domainCountTitle"),
                      emptyHint: t("index.emptyHint"),
                      segmentAll: t("index.segmentAll"),
                      // M-8 — 적응 창(7d→3d→1d)의 실제 창 일수를 라벨에 노출.
                      segmentRecent: t("index.segmentRecent", {
                        count: recentChanges.recentNodeIds.size,
                        days: recentChanges.windowDays,
                      }),
                      segmentRecentAria: t("index.segmentRecentAria"),
                      recentEmptyHint: t("index.recentEmptyHint", { days: recentChanges.windowDays }),
                      agentBadge: t("index.agentBadge"),
                      uncatalogedDocsLabel: t("index.uncatalogedDocsLabel", {
                        count: bootstrapPlan?.elements.length ?? 0,
                      }),
                      uncatalogedDocsAction: t("index.uncatalogedDocsAction"),
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
            {/* TopologyAnalysisBar 완전 삭제(분석 패널 완전 소멸 2단계 §d) —
                focus(§a)/path(§b)/health(§c) 가 모두 빠진 뒤 남은 지도/그래프
                2-tab 레일은 우상단 유틸리티 레일의 그래프 토글 칩으로
                이관했다. overview 모드의 예전 analysis-rail 콘텐츠는 이미
                relation legend·INDEX 푸터 인계 메뉴·insights 관계 탭으로
                은퇴했다(W3). */}
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
                    docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                    onStartFromDocs={
                      bootstrapPlan && bootstrapPlan.elements.length > 0
                        ? () => setBootstrapOpen(true)
                        : undefined
                    }
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
                      depthLimit: topologyControls.depthLimit,
                      searchQuery: topologyControls.searchQuery,
                      activeCategory,
                      hubsOnly: topologyControls.hubsOnly,
                    }}
                    overlays={topologyControls.overlays}
                    changedSlugs={changedSlugs}
                    livePhysics={analysisMode === "graph"}
                    fitViewToken={combinedFitToken}
                    relayoutToken={topologyRelayoutToken}
                    revealToken={mapRevealToken}
                    onSelectEdge={(edge) => {
                      setFullDetailSlug(null);
                      setSelectedEdge(edge);
                    }}
                    onSelect={(slug) => {
                      setSelectedEdge(null);
                      handleSelect(slug);
                    }}
                    onOpen={handleExpandRequest}
                    onPaneClick={() => {
                      setSelectedEdge(null);
                      handleClose();
                    }}
                    onVisibleCountChange={setTopologyVisibleCount}
                    onGraphStatsChange={handleTopologyGraphStatsChange}
                    onZoomTierChange={setMapZoomTier}
                    onContextMenuNode={handleContextMenuNode}
                    minimal={localGraphRoot !== null}
                    agentFocusNodeId={agentFocusNodeId}
                  />
                ) : null}
                {topologyRenderState.renderCanvas ? (
                  <TopologyChangeAnnouncement
                    touchedCount={changedSlugs.size}
                    message={(count) => t('controls.changeAnnouncement', { count })}
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
                <TopologyControls
                  value={topologyControls}
                  onChange={setTopologyControls}
                  density={topologyUtilityChromeCompact ? "compact-focus" : "default"}
                  onFitView={() => setFitViewToken((t) => t + 1)}
                  visibleCount={topologyVisibleCount}
                  totalCount={
                    localGraphRoot === null
                      ? topologyTotalNodes
                      : localGraphProjects.length
                  }
                />
              )}
              {/* 단축키/제스처 도움말 진입점 — 우상단 TopologyControls 아래 36×36 아이콘.
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
              <HubRail
                projects={renderProjects}
                selectedSlug={canvasSelectedSlug}
                onSelect={(slug) => handleSelect(slug)}
                // Hero 패널이 펼쳐져 있을 때 겹침 방지. hero 가 Collapsed
                // (pill) 이거나 drawer 상태면 Hub Rail 이 정상 노출.
                suppressed={!leftPanelCollapsed && !drawerOpen}
              />
              {localGraphStack.length > 0 ? (
                <div className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[70vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 shadow-[0_8px_24px_var(--color-shadow-a35)]">
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
                  TopologyControls 검색창 배지와 중복이지만, controls가 접힌 상태에서도
                  필터 중임을 알려주는 컨텍스트 칩. */}
              {topologyVisibleCount !== null && topologyVisibleCount < localGraphProjects.length ? (
                <div className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-md border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-line-a90)] md:left-[228px] xl:left-[236px]">
                  filter · {topologyVisibleCount} / {localGraphProjects.length}
                </div>
              ) : null}

              {/* 매칭 0건 empty state */}
              {topologyOverlayState.kind === "filter-empty" ? (
                <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
              ) : null}

              {/* 우하단 계기 스택 — 관계선 범례(상시, W3 분석 보기 은퇴로
                  TopologyAnalysisBar overview 모드에서 이관)가 위, root-first-open
                  v3 계기 판독(FirstRunReadout, 정적 모드일 때만 자체 렌더)이 아래.
                  같은 계기 판독 문법을 공유하되 가시성 조건은 서로 다르다. */}
              <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex flex-col items-end gap-2">
                <TopologyRelationLegend />
                <FirstRunReadout
                  projectCount={firstRunProjectCount}
                  domainCount={indexDomainCount}
                  tier={mapZoomTier}
                />
              </div>

            </>
        </div>
        {projectsError ? (
          <div
            role="alert"
            className="pointer-events-auto absolute left-1/2 top-[52px] z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[color:var(--color-danger-a32)] bg-[color:rgba(18,20,26,0.98)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_var(--color-shadow-a45)]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-danger-text)]">
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
        !createNodeOpen &&
        !nodePopoverDismissed ? (
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
                domain={v2DatasheetModel.domain}
                powered={v2DatasheetModel.powered}
                metric={v2DatasheetModel.metric}
                groups={v2DatasheetModel.groups}
                evidence={v2DatasheetModel.evidence}
                updatedAtLabel={v2DatasheetModel.updatedAtLabel}
                handoffText={v2DatasheetModel.handoffText}
                documentHref={v2DatasheetModel.documentHref}
                builderEditHref={v2DatasheetModel.builderEditHref}
                labels={{
                  kindLabel: tKinds(normalizeKindLabelKey(v2DatasheetModel.kind)),
                  domainLabel: t("nodeDatasheet.domainLabel"),
                  poweredOn: t("nodeDatasheet.poweredOn"),
                  poweredOff: t("nodeDatasheet.poweredOff"),
                  // P1a-1 (persona 실측 N5): usedBy 는 DIRECTION 집계라 단일
                  // 관계 타입이 없어 그대로 자체 i18n 키를 쓴다. dependsOn/
                  // evidence 는 각각 `depends_on`/`describes` 타입과 1:1
                  // 대응해 공유 사전(`useRelationVocabulary`) plain 레지스터로
                  // 옮겨 지도/빌더와 같은 단어(의미)를 한 곳에서 관리한다 —
                  // 문구 값 자체는 기존과 동일("기대는 곳"/"근거"), 드리프트
                  // 방지가 목적.
                  // M-2 — "담는 것" from the shared relation vocabulary (plain
                  // register), same source as depends_on/describes below so the
                  // typed groups read in one consistent word family.
                  metricContains: relationVocabulary("contains", "plain"),
                  metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                  metricDependsOn: relationVocabulary("depends_on", "plain"),
                  metricEvidence: relationVocabulary("describes", "plain"),
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
        {/* P3b — 엣지 팝오버: 노드 팝오버와 같은 포지셔너 계약, 배타 렌더. */}
        {edgePanelModel && !selectedOntologyNode && !createNodeOpen ? (
          <div
            data-testid="topology-edge-popover-positioner"
            className="topology-ui-scale fixed inset-x-3 top-[72px] z-50 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
          >
            <TopologyV2EdgePanel
              sentence={edgePanelModel.sentence}
              typeLabel={edgePanelModel.typeLabel}
              fromId={edgePanelModel.fromId}
              toId={edgePanelModel.toId}
              fromTitle={edgePanelModel.fromTitle}
              toTitle={edgePanelModel.toTitle}
              why={edgePanelModel.why}
              declaredBy={edgePanelModel.declaredBy}
              updatedAtLabel={edgePanelModel.updatedAtLabel}
              builderEditHref={edgePanelModel.builderEditHref}
              labels={{
                kicker: t("edgePanel.kicker"),
                declaredByLabel: t("edgePanel.declaredBy"),
                editRelation: t("edgePanel.editRelation"),
                close: t("edgePanel.close"),
                openDoc: t("edgePanel.openDoc"),
              }}
              onSelectNode={(id) => {
                setSelectedEdge(null);
                handleSelect(id);
              }}
              onClose={() => setSelectedEdge(null)}
              className="pointer-events-auto max-lg:w-[min(400px,calc(100vw-1.5rem))]"
            />
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
        <AgentConnectSheet
          open={agentConnectOpen}
          onClose={() => setAgentConnectOpen(false)}
          status={agentConnectStatus}
          snippets={agentConnectSnippets}
          domainTitles={agentConnectDomains}
          handoffText={indexAgentHandoffBriefText}
          onWriteConfigs={
            isTauriVaultRuntime() && vault.manifest ? () => void vault.ensureAgentConfigs() : null
          }
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
