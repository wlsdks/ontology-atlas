"use client";

import Image from "next/image";
import { withBasePath } from "@/shared/lib/base-path";
import { cn } from "@/shared/lib/cn";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — 전역 DOM History 생성자와의 충돌 원천 차단
// (사용성 검수 P0, AtlasGitPanel 과 동일 처방).
import { BookOpen, Compass, FolderOpen, HelpCircle, History as HistoryIcon, Plus, Waypoints, X } from "lucide-react";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { useAdaptiveRecentChanges, useOntologyInsight, useVaultDocFreshnessIndex } from "@/features/vault-ontology";
import {
  useLocalVault,} from "@/features/docs-vault-local";
import {
  FirstRunReadout,
  SampleNodeHint,
  useFirstRunSampleModeSettled,
} from "@/features/first-run-starter";
import { HeroCollapsed } from "@/widgets/hero-header";
import { GitStatusTile, useNavRailContextHrefs, useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import { AtlasGitPanel } from "@/widgets/atlas-git-panel";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";
// Bare `?p=` miss grace window — see the deeplinkMissNotifiedRef effect
// below (`../lib/deeplink-miss-notice.ts`) for why this exists.
const DEEPLINK_MISS_GRACE_MS = 4000;

const TopologyFitControl = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyFitControl),
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
const VaultStartChecklist = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.VaultStartChecklist),
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
  buildOntologyBuilderNodeHrefFromGraphId,
  buildOntologyHealthSignals,
  buildOntologyInsightsReturnHref,
  deriveCodeLocations,
  useRelationVocabulary,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import {
  buildOntologyTree,
  computeDomainCensusRows,
  computeOntologyChangeset,
  domainCensusById,
  filterTreeExcludeKind,
  formatAgentPostChangeSyncPacket,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { useHomeRouteState } from "../model/use-home-route-state";
import { useBootstrapFlow } from "../model/use-bootstrap-flow";
import { useAgentConnectModel } from "../model/use-agent-connect-model";
import { useNodeDatasheetModel } from "../model/use-node-datasheet-model";
import {
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
  resolveTopologyNodeClickRouteState,
  toggleExpandedParent,
  enterRealmRouteState,
  exitRealmRouteState,
  resolveRealmNodeId,
  buildContainmentParentMap,
  deriveDeeplinkAncestorExpansion,
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
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { buildNavRailContextHrefs } from "../lib/nav-rail-context-hrefs";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import { OntologyBootstrapForm } from "./OntologyBootstrapForm";
import { AgentConnectSheet, useAgentConnectLauncher } from "@/widgets/agent-connect";
import { TopologyV2EdgePanel } from "@/widgets/topology-map-v2/ui/TopologyV2EdgePanel";
import { PLAIN_TIER_REVEAL } from "@/widgets/topology-map-v2/model/tier-visibility";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import { buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
import {
  TopologyMapV2,
  TopologyV2ContextMenu,
  TopologyV2DetailPanel,
  TopologyV2EdgeHoverCard,
  TopologyV2ClusterHoverCard,
  TopologyV2SettingsGear,
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
  clearTopologyV2TokensCache,
} from "@/widgets/topology-map-v2";
import { buildTopologyV2Graph } from "../lib/topology-v2-adapter";
import { deriveDustySlugs } from "../lib/topology-dusty";
import { clampSynthSize, synthesizeVaultGraph } from "../lib/synth-vault";
import {
  TopologyIndexPanel,
  TopologyIndexTab,
  TopologyRealmLedger,
  resolveIndexPanelState,
  resolveLeftSlotOwner,
  resolveRenderedIndexPanelState,
  type IndexPanelState,
} from "@/widgets/topology-index-panel";
import {
  collectRealmMemberIds,
  computeRealmBoundary,
  computeRealmCensus,
  findRealmSubtree,
} from "../lib/realm-ledger";
import {
  classifyTopologyRelationProvenance,
} from "../lib/topology-ontology-drawer";
import {
  normalizeKindLabelKey,
} from "../lib/topology-node-significance";
import { TopologyPathChip } from "./TopologyPathChip";
import { TopologyRealmChip } from "./TopologyRealmChip";
import { TopologyTrailChip } from "./TopologyTrailChip";
import {
  appendFootprintVisit,
  formatFootprintTrailAgentPacket,
  type FootprintTrailEntry,
} from "../lib/footprint-trail";
import { TopologyInsightsReturnChip } from "./TopologyInsightsReturnChip";
import { TopologyRelationLegend } from "./TopologyRelationLegend";
import { TopologyReviewLink } from "./TopologyReviewLink";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
import { resolveTopologyEscLadderAction } from "../lib/topology-esc-ladder";
import {
  GuidedTourOverlay,
  canAutoStartGuidedTour,
  readGuidedTourStatus,
  resolveAnchorRect,
  useGuidedTour,
  type TourAnchor,
} from "@/features/guided-tour";
import { resolveTourAnchorNodeId } from "../lib/resolve-tour-anchor-node";

/**
 * rank2 — 상세 패널 퇴장 대칭용 경량 presence 게이트. `open` 이 false 로 떨어지면
 * 즉시 언마운트하지 않고 `exiting=true` 로 `exitMs` 동안 패널을 유지한다(그 사이
 * `.topology-chrome-out` 이 재생). 시간이 지나면 언마운트. `open` 이 다시 true 가
 * 되면(재선택) 즉시 mounted/entering 으로 복귀. prefers-reduced-motion 은
 * globals.css 전역 규칙이 애니메이션을 즉시 끝내므로 `exitMs` 만큼만 투명 유지 후
 * 언마운트(시각적 아티팩트 없음).
 */
function usePanelPresence(open: boolean, exitMs: number): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    // open=false: 즉시 언마운트 대신 퇴장 애니 창을 연다.
    setExiting(true);
    const id = setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  return { mounted, exiting };
}

const LEFT_PANEL_COLLAPSED_KEY = "demo:left-panel-collapsed:v2";
/** INDEX panel preference (B3 허브가 곧 지도) — separate key from the legacy
 * hero-rail `LEFT_PANEL_COLLAPSED_KEY` above, a different feature entirely. */
const INDEX_PANEL_COLLAPSED_KEY = "demo:index-panel-collapsed:v1";
/**
 * 슬라이스 C (개발/비개발 모드 토글) — 표시-렌즈 필터(데이터 무변경). true 면
 * 비개발(일반) 모드: element 티어 기본 숨김(클릭 ego 는 예외 공개) + plain
 * 어휘 + 경로 서브정보 숨김 + 개발자 크롬 숨김. localStorage 만 진실원 —
 * `useLocalStorageBoolean` 은 setItem 후 리렌더 트리거가 없어(구독만) 여기선
 * useState 미러 + setter 에서 setItem 동기화 패턴을 쓴다(기존
 * `setIndexPreference` 의 "저장+즉시 적용" 계약과 동일).
 */
const AUDIENCE_PLAIN_KEY = "demo:audience-plain:v1";

function readAudiencePlainPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUDIENCE_PLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function HomePage() {
  const t = useTranslations('topology');
  const tKinds = useTranslations('kinds');
  const tAgentConnect = useTranslations('agentConnect');
  // P2 결함⑤ — <lg 발자취 chrome-tile 진입점의 aria-label/title (`atlasGit`
  // 네임스페이스는 이미 `GitStatusTile` 이 쓰는 것과 같은 키를 재사용한다).
  const tAtlasGit = useTranslations('atlasGit');
  const relationVocabulary = useRelationVocabulary();
  // 슬라이스 C — lazy initializer 는 클라이언트에서만 실제 실행(SSR 은 항상
  // false), 클라이언트 hydration 도 localStorage 없는 서버 프리렌더 기준
  // false 와 같아 hydration mismatch 없음(다른 세션 플래그와 같은 패턴).
  const [audiencePlain, setAudiencePlainState] = useState<boolean>(readAudiencePlainPreference);
  const setAudiencePlain = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(AUDIENCE_PLAIN_KEY, next ? "1" : "0");
    } catch {
      /* private mode — session-only, no persistence */
    }
    setAudiencePlainState(next);
  }, []);
  // 슬라이스 C — 지도 표면의 관계 어휘 레지스터. 비개발(plain) 모드는
  // 데이터시트와 같은 plain 레지스터로 통일.
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
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
  // R6 — 브랜드 pill 의 SAMPLE 배지(census 필의 일부)는 제거됐다. 정적 샘플
  // 여부는 이제 INDEX 패널의 "시작하기" 모듈(FirstRunStarterModule)과 우하단
  // 판독(FirstRunReadout)이 각자 판정해 표시한다 — pill 은 census 를 담지 않는다.
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
    insightsReturnTab,
    expandedParents: expandedParentSlugs,
    realmSlug,
    recentWindow,
  } = routeState;
  const renderProjects = projects;
  // 밀도 게이트 (fable 설계) — URL `?open=` 의 부모 slug 목록을 Set 으로
  // 변환해 지도로 내린다. 문자열 join 을 dep 으로 써 안정적으로 메모.
  const expandedParentsKey = expandedParentSlugs.join(",");
  const expandedParentSet = useMemo(
    () => new Set(expandedParentSlugs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expandedParentsKey],
  );
  // 밀도 게이트 — 클러스터 칩 클릭 → 해당 부모 확장 토글(URL 왕복). 노드
  // 선택/포커스 상태는 건드리지 않는다(칩은 접힘/펼침만 담당).
  const handleToggleCluster = useCallback(
    (parentId: string) => {
      setRouteState((current) => ({
        ...current,
        expandedParents: toggleExpandedParent(current.expandedParents, parentId),
      }));
    },
    [setRouteState],
  );
  // S4 "영역 전개" — 궤도 버튼/데이터시트 액션 → 이 노드의 세계로 전환(URL 왕복).
  const handleEnterRealm = useCallback(
    (slug: string) => {
      setRouteState((current) => enterRealmRouteState(current, slug));
    },
    [setRouteState],
  );
  // S4 — 영역 해제(칩 ✕ / Esc). 전체 지도로 복귀.
  const handleExitRealm = useCallback(() => {
    setRouteState((current) => exitRealmRouteState(current));
  }, [setRouteState]);
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
  const baseRenderedIndexState = resolveRenderedIndexPanelState(
    leftSlotOwner,
    indexPreference,
  );
  // C (소유자 실보고 2026-07-23, "어지럽다 — 모든 패널이 다 열려있어서") —
  // 노드 선택(데이터시트 활성) 동안 좌측 스택은 접힘 탭으로 물러나고,
  // 캔버스 빈 곳 클릭(선택 해제)이 원래 선호를 복귀시킨다. 선택 중 사용자가
  // 탭으로 수동 전개하면 그 선택이 끝날 때까지 전개가 우선한다. 영구 선호
  // (localStorage)는 건드리지 않는 순수 세션 강등.
  const [indexManualExpandDuringSelection, setIndexManualExpandDuringSelection] =
    useState(false);
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
  // 레일 설정 슬롯 memo 는 아래(vault·ontologyChangeset 정의 뒤)로 이동 —
  // 발자취(GitStatusTile)가 vault 경로와 세션 changeset 을 읽어야 해서다.
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — the analysis rail owns the slot only because of a non-overview
  // mode (focus/path/health), so returning to overview is always enough.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    // C — 선택 중 수동 전개는 그 선택 동안 자동 강등을 이긴다 (선택 해제
    // 시 리셋; 비선택 상태에선 무해한 no-op 플래그).
    setIndexManualExpandDuringSelection(true);
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
  // (dataset/fit 이펙트는 selection-aware 최종 renderedIndexState 파생 뒤로
  //  이동 — C 자동 강등 참조.)
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
  // P4a — "최근 변경" 렌즈(mtime 창). `computeRecentChanges` 순수 함수 +
  // 이 훅과 같은 session-snapshot 시각 규율(`use-recent-changes.ts`).
  // 스포트라이트 (협의회 2026-07-23): `?recent=` 숫자 프리셋이면 그 창으로
  // 고정, "auto"/off 면 기존 적응 사다리 — 지도 침강과 INDEX 렌즈가 이 훅
  // 하나(단일 진실원)를 공유한다.
  const spotlightOn = recentWindow !== null;
  const recentChanges = useAdaptiveRecentChanges(
    spotlightOn && recentWindow !== "auto" ? recentWindow : undefined,
  );
  const handleToggleSpotlight = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      recentWindow: current.recentWindow === null ? "auto" : null,
    }));
  }, [setRouteState]);
  // 소유자 지시 (Image #14): "전체 변경점을 보여주는 거면 아예 zoom out 을
  // 크게" — 렌즈가 켜지는 순간 카메라를 전체 fit 으로 물러나 변경 지점
  // 전부(자동 전개 포함)가 한 화면에 들어오게 한다. off→on 전이에서만 1회
  // (렌즈 중 수동 탐색을 방해하지 않음), 기존 fit 토큰 재사용 — 신규 카메라
  // 프리미티브 0.
  const prevSpotlightOnRef = useRef(spotlightOn);
  useEffect(() => {
    if (spotlightOn && !prevSpotlightOnRef.current) {
      setFitViewToken((token) => token + 1);
    }
    prevSpotlightOnRef.current = spotlightOn;
  }, [spotlightOn]);
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
  // 살아있는 지도 드리프트(④) — vault mtime 으로 "오래 손대지 않은" 노드를
  // 판정해 엔진의 기존 stale 채널(dash + 불투명 토큰)로 가라앉힌다.
  // 세션 스냅샷 시각(updatedAgoNowMs)을 재사용 — 렌더 중 라벨/판정이
  // 흔들리지 않는 규율은 데이터시트 "N일 전" 라벨과 동일.
  const dustySlugs = useMemo(
    () => deriveDustySlugs(ontologyInsight?.nodes ?? [], docFreshnessIndex, updatedAgoNowMs),
    [ontologyInsight, docFreshnessIndex, updatedAgoNowMs],
  );
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
  // 발자취(Atlas Git) 패널 — 레일 타일 클릭으로 열리는 스냅샷/히스토리 표면.
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  // Tauri 데스크톱이면 vault 절대 경로(브리지 활성), 웹 FSA 핸들이면 null →
  // 타일/패널이 세션 changeset 기반으로 정직하게 강등한다.
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  // 레일 하단 설정 슬롯 — 발자취 타일 + 설정 기어를 한 fragment 로 등록.
  // (perf/persistent-shell: 레일은 layout 상주, 이 페이지가 슬롯만 주입.)
  const navRailSettingsSlot = useMemo(
    () => (
      <>
        {/* 슬라이스 C — 비개발(plain) 모드는 발자취(Atlas Git) 타일을 개발자
            크롬으로 간주해 숨긴다. */}
        {audiencePlain ? null : (
          <GitStatusTile
            onActivate={() => setGitPanelOpen(true)}
            panelOpen={gitPanelOpen}
            vaultPath={gitVaultPath}
            sessionDirty={ontologyChangeset.touchedNodeIds.size > 0}
          />
        )}
        <TopologyV2SettingsGear
          indexDefaultCollapsed={indexPanelCollapsedStored}
          onChangeIndexDefaultCollapsed={handleChangeIndexDefaultCollapsed}
          audiencePlain={audiencePlain}
          onChangeAudiencePlain={setAudiencePlain}
          changeVaultHref="/docs/?intent=local"
          // 레일 하단 유틸 3타일(활동·발자취·설정)을 한 타일 문법에 앉힌다
          // (소유자 실보고 2026-07-23 — 기어만 36px 보더 floating 표면 + 16px
          // 아이콘이라 이질적이었다). `--app-nav-rail-tile-*` +
          // `--app-nav-rail-utility-icon-size` 계약.
          triggerVariant="rail-tile"
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
            audience: t('controls.settingsGearAudience'),
            audienceDev: t('controls.settingsGearAudienceDev'),
            audiencePlain: t('controls.settingsGearAudiencePlain'),
            // P2 결함③ — "보기 모드" 행 아래 caption. 발견은 됐어도 뜻이
            // 없던 결함.
            audienceCaption: t('controls.settingsGearAudienceCaption'),
          }}
        />
      </>
    ),
    [
      indexPanelCollapsedStored,
      handleChangeIndexDefaultCollapsed,
      audiencePlain,
      setAudiencePlain,
      ontologySearchOpen,
      docsDrawerOpen,
      gitPanelOpen,
      gitVaultPath,
      ontologyChangeset,
      t,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // 온보딩 디자이너 지적 — 첫 실행 카드를 닫으면 "폴더 열기" 진입점이 설정
  // 기어 뒤로 사라졌다. 정적 샘플 모드(카드 dismiss 와 무관)일 때 상단 유틸리티
  // 열에 조용한 "내 데이터로 전환 ⌘O" 필을 상시 노출하고, 실제 vault 가
  // 연결되면 게이트가 꺼져 자동 소멸한다(카드 dismiss 축과 독립).
  const sampleModeSettled = useFirstRunSampleModeSettled();
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
  // P3d(E1) — 부트스트랩 완료 시 지도 리빌 연출 트리거.
  const [mapRevealToken, setMapRevealToken] = useState(0);
  // P2a — "AI 에이전트 연결" 시트.
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
    const typeLabel = relationVocabulary(selectedEdge.relationType, relationRegister);
    // 과제 ⑩ — 엣지 문장/양 끝 노드 라벨은 표시용 짧은 제목.
    const fromDisplay = from.display ?? from.title;
    const toDisplay = to.display ?? to.title;
    const sentence = t(`edgeSentence.${normalizeEdgeSentenceKey(selectedEdge.relationType)}`, {
      from: fromDisplay,
      to: toDisplay,
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
      fromTitle: fromDisplay,
      toTitle: toDisplay,
      declaredBy: selectedEdge.declaredBySlug
        ? { slug: selectedEdge.declaredBySlug, href: buildDocsVaultHref({ slug: selectedEdge.declaredBySlug }) }
        : null,
      updatedAtLabel: ago ? t(`nodeDatasheet.updated_${ago.key}`, { count: ago.count }) : null,
      // 빌더 딥링크는 canonical `<kind>:<slug>`(그래프 node id)로 통일(H5) —
      // 예전 `from.evidenceIds[0] ?? from.id` 인라인 vault-slug 링크를 대체.
      builderEditHref: buildOntologyBuilderNodeHrefFromGraphId(from.id),
      why,
    };
  }, [selectedEdge, ontologyInsight, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister]);
  // P3c — 엣지 호버 마이크로카드 (클릭 팝오버의 가벼운 전신).
  const [hoverEdge, setHoverEdge] = useState<{
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null };
    x: number;
    y: number;
  } | null>(null);
  const handleHoverEdge = useCallback(
    (
      edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
      position: { x: number; y: number } | null,
    ) => {
      setHoverEdge(edge && position ? { edge, x: position.x, y: position.y } : null);
    },
    [],
  );
  const hoverEdgeCardModel = useMemo(() => {
    if (!hoverEdge || !ontologyInsight) return null;
    const from = ontologyInsight.nodes.find((n) => n.id === hoverEdge.edge.sourceId);
    const to = ontologyInsight.nodes.find((n) => n.id === hoverEdge.edge.targetId);
    if (!from || !to) return null;
    const edgeRecord = ontologyInsight.edges.find(
      (e) => e.from === hoverEdge.edge.sourceId && e.to === hoverEdge.edge.targetId,
    );
    return {
      sentence: t(`edgeSentence.${normalizeEdgeSentenceKey(hoverEdge.edge.relationType)}`, {
        from: from.title,
        to: to.title,
      }),
      typeLabel: relationVocabulary(hoverEdge.edge.relationType, relationRegister),
      why: edgeRecord?.label?.trim() || null,
      x: hoverEdge.x,
      y: hoverEdge.y,
    };
  }, [hoverEdge, ontologyInsight, t, relationVocabulary, relationRegister]);
  // S2 파트 5C — 클러스터 칩 호버 툴팁 상태 + 문장 모델. 부모 제목/카운트를
  // i18n(`cluster.tooltipCollapsed/Expanded`) 에 넣어 완성한 평문 한 줄.
  const [hoverCluster, setHoverCluster] = useState<{
    parentId: string;
    count: number;
    descendantTotal: number;
    expanded: boolean;
    x: number;
    y: number;
  } | null>(null);
  const handleHoverCluster = useCallback(
    (
      info:
        | { parentId: string; count: number; descendantTotal: number; expanded: boolean; position: { x: number; y: number } }
        | null,
    ) => {
      setHoverCluster(
        info
          ? {
              parentId: info.parentId,
              count: info.count,
              descendantTotal: info.descendantTotal,
              expanded: info.expanded,
              x: info.position.x,
              y: info.position.y,
            }
          : null,
      );
    },
    [],
  );
  const clusterHoverCardModel = useMemo(() => {
    if (!hoverCluster) return null;
    const parent = ontologyInsight?.nodes.find((n) => n.id === hoverCluster.parentId);
    const name = parent?.title ?? hoverCluster.parentId;
    // 패널3-S6 숫자 계약 — "하위 전체 N · 이 티어 숨김 M" 병기. total=부모의
    // 하위 전체 자손 수(노드 뱃지와 동일 출처), hidden=이 티어에서 접힌 직속 수.
    const numbers = { name, total: hoverCluster.descendantTotal, hidden: hoverCluster.count };
    const sentence = hoverCluster.expanded
      ? t("cluster.tooltipExpanded", numbers)
      : t("cluster.tooltipCollapsed", numbers);
    return { sentence, x: hoverCluster.x, y: hoverCluster.y };
  }, [hoverCluster, ontologyInsight, t]);
  // HomePage 모듈화 2차 — 에이전트 연결 시트 조립은 use-agent-connect-model 소유.
  const agentConnect = useAgentConnectModel({
    agentActivityStatus,
    vaultHandle: vault.handle,
    insightNodes: ontologyInsight?.nodes ?? null,
    // 키는 top-level `agentConnect` 네임스페이스 (시트 위젯과 동일 출처) —
    // topology.* 의 t 로 읽으면 MISSING_MESSAGE (e2e 가 잡은 잠복 버그).
    defaultAgentLabel: tAgentConnect("defaultAgentLabel"),
  });
  // LNB(AppShell 상주) 에이전트 타일 → 전역 "열려는 의도". 어느 페이지에서
  // 눌렸든 지형도로 이동해 오면 레이아웃 상주 launcher 의 wantOpen 이 살아
  // 있어 여기서 시트를 연다(URL 파라미터 불필요). openSheet 는 "N분 전"
  // 기준 시각도 함께 스냅한다.
  const agentConnectLauncher = useAgentConnectLauncher();
  const agentConnectWantOpen = agentConnectLauncher.wantOpen;
  const openAgentConnectSheet = agentConnect.openSheet;
  useEffect(() => {
    if (agentConnectWantOpen) openAgentConnectSheet();
  }, [agentConnectWantOpen, openAgentConnectSheet]);
  // 폴더 연결 직후 에이전트 연결 유도 (소유자 지시 2026-07-24 2차) — "폴더를
  // 연결하고 나면 바로 AI 에이전트 연결을 가이드해야 한다". 이 세션에서
  // 사용자가 직접 폴더를 연 경우('opening' 경유 — IndexedDB 복원 재방문은
  // 제외)에 한해, 미연결이면 연결 시트를 1회 자동으로 연다. 닫아도 시작
  // 체크리스트 1단계가 미완료 강조로 남아 가이드가 끊기지 않는다.
  const vaultOpenedThisSessionRef = useRef(false);
  const agentAutoPromptFiredRef = useRef(false);
  const agentConnectedNow = agentConnect.status.kind === "connected";
  useEffect(() => {
    if (vault.status === "opening") vaultOpenedThisSessionRef.current = true;
    if (
      vault.status !== "loaded" ||
      !vaultOpenedThisSessionRef.current ||
      agentAutoPromptFiredRef.current ||
      agentConnectedNow
    ) {
      return undefined;
    }
    agentAutoPromptFiredRef.current = true;
    // 스캐폴드/체크리스트가 자리 잡은 뒤 열어 "폴더 → 다음은 AI 연결" 순서가
    // 화면에서도 읽히게 한다.
    const id = window.setTimeout(openAgentConnectSheet, 1200);
    return () => window.clearTimeout(id);
  }, [vault.status, agentConnectedNow, openAgentConnectSheet]);
  // HomePage 모듈화 1차 — 부트스트랩 흐름은 use-bootstrap-flow 훅 소유.
  // 완료 연출(토스트·E1 리빌)만 여기 남는다.
  const { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap } = useBootstrapFlow({
    vault,
    onCompleted: ({ addedToExisting, elementCount }) => {
      // E1 — 리로드된 그래프가 "내 문서들이 모이는" 연출로 등장한다.
      setMapRevealToken((n) => n + 1);
      toast.show(
        t(addedToExisting ? "bootstrap.toastAdded" : "bootstrap.toastDone", { count: elementCount }),
        "success",
      );
    },
  });
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
  // 클라이언트 사이드 동적 타이틀 — 선택 프로젝트 컨텍스트를 브라우저 탭에
  // 노출 (정적 export 환경의 page metadata 한계 보완).
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          // 과제 ⑩ — 브라우저 탭 타이틀도 표시용 짧은 제목.
          selectedOntologyNode?.display ?? selectedOntologyNode?.title,
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

  // 합성 대형 vault 시각 검증 (topology-map-v2 S1) — 숨은 `?synth=N` 파라미터
  // (100..10000 clamp) 가 있으면 번들 dogfood 샘플 대신 결정론 합성 그래프를
  // 지도에 공급해 computeConcentricLayout/relaxCollisions 를 실측 밀도로
  // 스트레스한다. 프로덕션 데모에도 남지만 숨은 파라미터라 무해하고
  // 노출되지 않는다(README/FEATURES 미언급). 사용자 vault·단일 진실원은
  // 건드리지 않는다 — 파생 결과는 지도 어댑터로만 흐르고 저장되지 않는다.
  // 마운트 시 1회 읽는다(세션 중 바뀌지 않는 데모 파라미터): SSR 은 null,
  // 클라이언트 lazy initializer 만 실제 실행 — HomePage 의 기존 window-read
  // lazy state(예: ontologySearchOpen) 와 같은 규율.
  const [synthSize] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = new URLSearchParams(window.location.search).get("synth");
      if (raw == null) return null;
      return clampSynthSize(Number(raw));
    } catch {
      return null;
    }
  });
  // topology-map-v2 mount gap fix — the P2 scaffold (87edec961) wired
  // `<TopologyMapV2 nodes={[]} edges={[]} />` as a deliberate placeholder,
  // so flipping the flag mounted the v2 canvas but left it with nothing to
  // draw. `buildTopologyV2Graph` derives the real adapter-contract
  // nodes/edges from the same `ontologyInsight` the other two engines
  // already draw (topology-v2-adapter.ts).
  // 스포트라이트 (협의회 조건 2) — 렌즈 ON 동안 지도 fresh 채널의 키는
  // mtime 창 set **단독**이다(세션 changeset 과 동시 주입 금지 — 한 채널에
  // 두 의미를 섞으면 "이게 왜 켜졌지"를 답할 수 없다). OFF 면 종전 세션
  // changeset 동작 그대로. 침강 대상(spotlightIds)도 같은 set — 단일 진실원.
  const spotlightIds = spotlightOn ? recentChanges.recentNodeIds : null;
  const freshChannelSlugs = spotlightOn ? recentChanges.recentNodeIds : changedSlugs;
  const topologyV2Graph = useMemo(() => {
    if (synthSize != null) {
      const synth = synthesizeVaultGraph(synthSize);
      return buildTopologyV2Graph(synth.nodes, synth.edges, { changedSlugs: freshChannelSlugs });
    }
    return ontologyInsight
      ? buildTopologyV2Graph(ontologyInsight.nodes, ontologyInsight.edges, {
          changedSlugs: freshChannelSlugs,
          dustySlugs,
        })
      : { nodes: [], edges: [] };
  }, [synthSize, ontologyInsight, freshChannelSlugs, dustySlugs]);

  // 스포트라이트 자동 전개 (소유자 2026-07-23: "노드 눌러야 나오는 곳의
  // 변경이면 그냥 다 펼쳐놔 — 연결된 거 싹 다") — 변경 노드가 클러스터 칩에
  // 접혀 안 보이면 렌즈가 거짓말이 된다. 변경 노드 전체의 containment 조상
  // 체인을 **파생 전개**로 합친다. URL `?open=` 은 건드리지 않는다:
  // `?recent=` 에서 결정론 파생되므로 공유 링크 재현성이 유지되고, 렌즈를
  // 끄면 사용자의 원래 전개 상태로 자연 복귀한다(수동 전개 오염 0).
  const spotlightExpandedParents = useMemo(() => {
    if (!spotlightIds || spotlightIds.size === 0 || topologyV2Graph.edges.length === 0) return null;
    const parentOf = buildContainmentParentMap(topologyV2Graph.edges);
    const merged = new Set(expandedParentSet);
    for (const id of spotlightIds) {
      for (const ancestor of deriveDeeplinkAncestorExpansion(id, parentOf, [])) {
        merged.add(ancestor);
      }
    }
    return merged;
  }, [spotlightIds, topologyV2Graph, expandedParentSet]);

  const canvasSelectedSlug = selectedProject?.slug ?? selectedOntologyNode?.id ?? selectedSlug;
  const drawerProject = selectedProject;

  // S7 realm slug 해석(패널3-S7) — URL 의 `?realm=` 은 사용자가 손으로 bare
  // slug(`ai-agent-partner`)를 칠 수 있으나 노드 id 는 `kind:slug` 공간이라
  // 그냥은 안 맞아 raw 칩 + 전체 지도가 조용히 렌더됐다. canonical 노드 id 로
  // 승격하고(=`capability:ai-agent-partner`), 못 맞추면 null → 칩 미표시.
  const resolvedRealmSlug = useMemo(
    () => resolveRealmNodeId(realmSlug, (ontologyInsight?.nodes ?? []).map((n) => n.id)),
    [realmSlug, ontologyInsight],
  );

  // S4 "영역 전개" — 현재 영역 루트 노드의 제목(칩 표시용). 해석된 id 로만
  // 조회 — 미해석(null)이면 제목도 null 이라 칩이 뜨지 않는다. 전환 직후
  // 그래프 재빌드 타이밍엔 canonical id 자체를 fallback 으로 써 칩이 깜빡이지
  // 않게 한다(id 는 ontologyInsight 에 이미 존재 = 해석 성공한 케이스).
  const realmTitle = useMemo(() => {
    if (!resolvedRealmSlug) return null;
    return topologyV2Graph.nodes.find((n) => n.id === resolvedRealmSlug)?.label ?? resolvedRealmSlug;
  }, [resolvedRealmSlug, topologyV2Graph]);

  // 딥링크 focus dive 조상 파생 (패널2-D1, R4 모션 헌법, fable 설계) — `?p=slug`
  // 로 들어온 대상이 밀도 게이트(`model/density-gate.ts`)에 접힌 부모 서브트리
  // 안이면, 그 contains 조상 체인을 `open=` 으로 자동 파생해 펼친다. 대상이
  // 드러난 뒤 기존 focus dive(`focus={{ selectedSlug }}` → 캔버스)가 클릭과
  // 동일한 이징 문법으로 1회 발화한다. 대상 slug 당 로드 1회만 — 사용자가 이후
  // 수동으로 접으면 다시 강제 펼치지 않도록 ref 로 가드하고, 그래프 빌드 전
  // (edges 0)엔 ref 를 세우지 않고 다음 렌더를 기다린다.
  const deeplinkExpandedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (deeplinkExpandedForRef.current === canvasSelectedSlug) return;
    if (topologyV2Graph.edges.length === 0) return;
    const parentOf = buildContainmentParentMap(topologyV2Graph.edges);
    deeplinkExpandedForRef.current = canvasSelectedSlug;
    setRouteState((current) => {
      const nextExpanded = deriveDeeplinkAncestorExpansion(
        canvasSelectedSlug,
        parentOf,
        current.expandedParents,
      );
      if (nextExpanded.length === current.expandedParents.length) return current;
      return { ...current, expandedParents: nextExpanded };
    });
  }, [canvasSelectedSlug, topologyV2Graph, setRouteState]);

  // 발자국 트레일 (fable 설계 — 소유자 요청, 사람 가치 우선) — 지도에서 노드를
  // ego 포커스할 때마다 세션 방문 목록에 쌓이는 "걸어온 길". 모드가 아니라
  // 지도 위에 얹히는 수동적 기록층: URL 비영속, localStorage 금지, 새로고침 시
  // 초기화. 지도(최근성 감쇠 발자국 링)와 트레일 칩(미니 타임라인 + 인계 패킷)에
  // 같은 순서 배열을 내려보낸다.
  const [footprintTrail, setFootprintTrail] = useState<string[]>([]);
  // 직전 방문 노드 — 같은 노드로의 연속 전이(배경 클릭 후 재선택 등)를 중복
  // append 하지 않게 가드. 서로 다른 노드 사이의 재방문은 append 가 순서를 갱신한다.
  const lastVisitedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (lastVisitedNodeRef.current === canvasSelectedSlug) return;
    lastVisitedNodeRef.current = canvasSelectedSlug;
    setFootprintTrail((trail) => appendFootprintVisit(trail, canvasSelectedSlug));
  }, [canvasSelectedSlug]);
  // 그래프 노드 조회(id → 라벨/kind). 삭제된 노드가 트레일에 남지 않게 살아있는
  // 그래프 기준으로 정제한다(단일 진실원: 트레일은 파생 표시층일 뿐).
  const footprintNodeLookup = useMemo(
    () => new Map(topologyV2Graph.nodes.map((n) => [n.id, n])),
    [topologyV2Graph],
  );
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of footprintTrail) {
      const node = footprintNodeLookup.get(id);
      if (node) entries.push({ id, title: node.label, kind: node.kind });
    }
    return entries;
  }, [footprintTrail, footprintNodeLookup]);
  // 지도로 내리는 방문 id 목록 — 정제된 entries 와 같은 집합(삭제 노드 제외).
  const footprintVisitedIds = useMemo(
    () => footprintTrailEntries.map((entry) => entry.id),
    [footprintTrailEntries],
  );
  const [footprintPacketCopied, setFootprintPacketCopied] = useState(false);
  const copyFootprintPacket = useCallback(async () => {
    if (footprintTrailEntries.length === 0) return;
    const ok = await copyText(
      formatFootprintTrailAgentPacket(
        footprintTrailEntries,
        {
          title: t("footprint.packetTitle"),
          order: t("footprint.packetOrder"),
          reviewHint: t("footprint.packetReviewHint"),
          pathHint: t("footprint.packetPathHint"),
          dustyHint: t("footprint.packetDustyHint", { count: dustySlugs.size }),
        },
        [...dustySlugs],
      ),
    );
    if (!ok) return;
    setFootprintPacketCopied(true);
    window.setTimeout(() => setFootprintPacketCopied(false), 1600);
  }, [footprintTrailEntries, t]);
  const clearFootprintTrail = useCallback(() => {
    lastVisitedNodeRef.current = null;
    setFootprintTrail([]);
  }, []);

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
  // 클릭 포커스 시그니처 — 지도에서 마지막으로 눌린 화면 좌표. 상세 팝오버가
  // "클릭한 노드에서 자라난다"는 성장 원점으로 쓴다. 캔버스 클릭이 아닌 선택
  // (INDEX·연결 row·키보드)은 좌표가 없어 fallback(center top)으로 둔다.
  const lastCanvasPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const nodePopoverPositionerRef = useRef<HTMLDivElement | null>(null);
  const handleCanvasPointerDownCapture = useCallback((event: ReactPointerEvent) => {
    lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, []);
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
  // 2026-07-24 온보딩 QA — 시작 체크리스트가 "첫 프로젝트/도메인 만들기"
  // 의도를 전달할 수 있게 컴포저 초기 kind 를 상태로 둔다. 일반 진입
  // (+ 개념 버튼 등)은 종전 기본값(역량) 유지.
  const [createNodeDefaultKind, setCreateNodeDefaultKind] = useState<CreateNodeKind>("capability");
  const openCreateNode = useCallback(() => {
    setCreateNodeDefaultKind("capability");
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
  const openCreateNodeWithKind = useCallback(
    (kind: CreateNodeKind) => {
      openCreateNode();
      setCreateNodeDefaultKind(kind);
    },
    [openCreateNode],
  );
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
  // HomePage 모듈화 3차 — 데이터시트 모델 조립은 use-node-datasheet-model 소유.
  const formatUpdatedLabel = useCallback(
    (key: string, count: number) => t(`nodeDatasheet.updated_${key}`, { count }),
    [t],
  );
  // rank7 (design-council B5) — 마지막 편집 주체/충돌 배지 카피. DocFrontmatterBlock
  // 과 같은 `editProvenance` 네임스페이스를 재사용 — 사본 없음, drift 방지.
  const tEditProvenance = useTranslations("editProvenance");
  const formatEditAgeLabel = useCallback(
    (key: string, count: number) => tEditProvenance(`age.${key}`, { count }),
    [tEditProvenance],
  );
  const { nodeFocus, v2DatasheetModel } = useNodeDatasheetModel({
    selectedOntologyNode,
    insight: ontologyInsight,
    authoredSignificance,
    docFreshnessIndex,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps: vault.selfEditTimestamps,
    formatEditAgeLabel,
  });
  // 과제 ⑪ — LNB 컨텍스트 이월. 노드를 선택한 채 좌측 레일의 "문서함"으로
  // 이동하면 선택과 무관한 `/docs/` 기본 화면이 뜨던 문제 — 데이터시트가
  // 이미 파생해 둔 `documentHref`(vault 파일 경로 `?slug=` 딥링크, H5 계약)를
  // `buildNavRailContextHrefs` 로 그대로 레일에 등록한다. 새 파라미터/변환
  // 발명 없음. 선택이 없으면 `documentHref`가 null 이라 레일은 기본 href
  // 그대로(변화 0).
  const navRailContextHrefs = useMemo(
    () => buildNavRailContextHrefs(v2DatasheetModel?.documentHref ?? null),
    [v2DatasheetModel?.documentHref],
  );
  useNavRailContextHrefs(navRailContextHrefs);
  // C — 최종 INDEX 렌더 상태: 선택 활성 + 수동 전개 없음 + (영역 밖) 이면
  // 자동 강등. 영역 대장은 영역의 유일한 탈출/탐색 표면이라 예외.
  // M-7 Esc 사다리 존중 — rung 1(팝오버만 닫힘, 선택 유지) 상태에선 좌측이
  // 돌아와야 하므로 "모델 존재"가 아니라 "데이터시트 실표시"에 결속한다.
  const topologySelectionActive = Boolean(v2DatasheetModel) && !nodePopoverDismissed;
  // 클릭 포커스 시그니처 — 팝오버의 성장 원점(transform-origin)을 방금 클릭한
  // 노드의 화면 좌표 방향으로 맞춘다. 패널은 slug 로 keyed 되어 노드가 바뀔
  // 때마다 재마운트 + `.topology-chrome-in` 등장을 재발화하므로, slug 를
  // 의존성으로 두고 paint 전(useLayoutEffect)에 포지셔너의 로컬 좌표계로 환산한
  // 원점을 CSS 변수로 주입한다(상속 → 내부 패널이 읽음). 최근(600ms 내) 캔버스
  // 포인터가 없으면(리스트·키보드 선택) 변수를 지워 기존 `center top`으로 폴백.
  const nodePopoverSlug = v2DatasheetModel?.slug ?? null;
  useLayoutEffect(() => {
    const positioner = nodePopoverPositionerRef.current;
    if (!positioner || nodePopoverSlug === null) return;
    const pointer = lastCanvasPointerRef.current;
    if (pointer === null || performance.now() - pointer.at > 600) {
      positioner.style.removeProperty("--topology-chrome-in-origin");
      return;
    }
    const rect = positioner.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      positioner.style.removeProperty("--topology-chrome-in-origin");
      return;
    }
    // 클릭 지점을 패널 박스 로컬 좌표로 환산하고 박스 안으로 clamp — 패널은
    // 우상단 고정 앵커라 노드는 대개 좌·하단에 있고, 그쪽 모서리가 원점이 되어
    // 팝오버가 노드 방향에서 자라나는 것으로 읽힌다.
    const ox = Math.max(0, Math.min(rect.width, pointer.x - rect.left));
    const oy = Math.max(0, Math.min(rect.height, pointer.y - rect.top));
    positioner.style.setProperty("--topology-chrome-in-origin", `${ox}px ${oy}px`);
  }, [nodePopoverSlug]);
  useEffect(() => {
    if (!topologySelectionActive) setIndexManualExpandDuringSelection(false);
  }, [topologySelectionActive]);
  // 소유자 후속 (2026-07-24): 영역/스포트라이트 원장도 노드 선택 중엔 닫는다
  // — "좌/우 패널이 다 열려 불편". 탈출 어포던스는 상단 영역/렌즈 칩의 ✕ 와
  // Esc 가 유지하므로 원장 상시 노출이 필수는 아니다. 선택 해제 시 복귀.
  const renderedIndexState: IndexPanelState =
    topologySelectionActive &&
    !indexManualExpandDuringSelection &&
    baseRenderedIndexState === "expanded"
      ? "collapsed"
      : baseRenderedIndexState;
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
      // 빌더 딥링크는 canonical `<kind>:<slug>`(그래프 node id)로 통일(H5).
      builderEditHref: buildOntologyBuilderNodeHrefFromGraphId(node.id),
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
    const codeLocations = deriveCodeLocations(
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
        // 과제 ⑩ — 헤더는 표시용 짧은 제목 크게 + 원본 title 은 fullTitle 로
        // secondary 보존(FullDetailA1 이 다를 때만 렌더).
        title: nodeFocus.displayTitle,
        fullTitle: nodeFocus.title,
        kind: nodeFocus.kind,
        slug,
        fresh: changedSlugs.has(selectedOntologyNode.id),
        // rank7 (design-council B5) — 같은 노드 선택에서 나온
        // `v2DatasheetModel`(compact 패널)의 SAME fact 를 그대로 재사용 —
        // 이 노드의 baseline/heartbeat 판정을 두 번 만들지 않는다(count
        // drift 방지 원칙과 동일 이유).
        lastEditSubject:
          v2DatasheetModel?.nodeId === selectedOntologyNode.id ? v2DatasheetModel.lastEditSubject : null,
        mtimeConflict:
          v2DatasheetModel?.nodeId === selectedOntologyNode.id ? v2DatasheetModel.mtimeConflict : false,
      },
      groups,
      reach,
      codeLocations,
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
    v2DatasheetModel,
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
  // rank2 — 팝오버 등장/퇴장 대칭. `panelOpen` 이 false 로 떨어지면 즉시
  // 언마운트하지 않고 퇴장 애니(≈120ms) 동안 유지한다. 퇴장 중엔 선택 파생
  // 값(v2DatasheetModel)이 null 로 사라지므로 마지막 모델을 ref 로 잡아 그 창
  // 동안 같은 내용을 계속 그린다(내용이 바뀌지 않고 접혀 사라지게).
  const panelOpen = nodePopoverVisible && Boolean(v2DatasheetModel);
  const nodePanelPresence = usePanelPresence(panelOpen, 140);
  const retainedDatasheetRef = useRef(v2DatasheetModel);
  if (v2DatasheetModel) retainedDatasheetRef.current = v2DatasheetModel;
  const panelDatasheetModel = v2DatasheetModel ?? retainedDatasheetRef.current;
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

  // 가이드 투어 (2026-07-23, `src/features/guided-tour`) — 지도 화면(/) 전담
  // 의미 문해 투어. `canResolveTourAnchor` 는 이 view 가 testid(DOM) 또는
  // canvas-node(그래프) 앵커를 실제로 해석해 feature 에 불리언만 돌려준다 —
  // feature 는 widgets 를 import 하지 않는다(FSD).
  const canResolveTourAnchor = useCallback(
    (anchor: TourAnchor) => {
      if (anchor === null) return true;
      if (anchor.type === "canvas-node") {
        return resolveTourAnchorNodeId(topologyV2Graph.nodes, anchor.target) !== null;
      }
      return resolveAnchorRect(anchor.value) !== null;
    },
    [topologyV2Graph],
  );
  const tour = useGuidedTour({
    hasSelection: canvasSelectedSlug != null,
    canResolveAnchor: canResolveTourAnchor,
    // 실측 회귀 — 5단계(datasheet)를 떠날 때 선택을 안 지우면 노드 포커스가
    // 유틸리티 레인(스포트라이트 토글 포함)을 계속 접어, 7단계(recent) 앵커가
    // 영구히 해석 불가능해지고 8단계(dev 분기)가 도달 불가능해졌다.
    onLeaveDatasheet: handleClose,
  });
  const tourAnchorRef = useRef<HTMLDivElement | null>(null);
  const tourAnchorNodeId =
    tour.open && tour.step && tour.step.anchor !== null && tour.step.anchor.type === "canvas-node"
      ? resolveTourAnchorNodeId(topologyV2Graph.nodes, tour.step.anchor.target)
      : null;
  // 투어를 열 때 다른 전이 표면을 강등한다(§4 "열림 시" 계약) — create-node
  // composer 와 같은 "openX 가 나머지를 닫는다" 관례를 그대로 따른다.
  const openGuidedTour = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    closeCreateNode();
    tour.start();
  }, [closeCreateNode, tour]);

  // 첫 방문 자동 투어 (2026-07-24 온보딩 라운드) — 투어 자산이 있는데
  // 진입점이 우측 레일 아이콘뿐이라 비개발자가 발견하지 못했다. 샘플
  // 모드 정착(= vault 미선택 첫 실행, 복원 시도 완료) + 저장된 done/
  // skipped 없음일 때 한 번만 자동 시작한다. skip 이 'skipped' 를
  // 기록하므로 재방문에는 다시 뜨지 않고, 로컬 vault 사용자에게는
  // `sampleModeSettled` 가 false 라 애초에 발화하지 않는다.
  const autoTourFiredRef = useRef(false);
  // `openGuidedTour` 는 tour 객체 의존이라 매 렌더 재생성 — dep 로 두면
  // effect 가 렌더마다 타이머를 지우고 다시 못 세운다(실측 회귀). ref 미러로
  // deps 를 `sampleModeSettled` 하나로 고정하고, 발화 성공 시점에만 가드를
  // 세운다.
  const openGuidedTourRef = useRef(openGuidedTour);
  useEffect(() => {
    openGuidedTourRef.current = openGuidedTour;
  }, [openGuidedTour]);
  useEffect(() => {
    if (autoTourFiredRef.current || !sampleModeSettled) return undefined;
    if (readGuidedTourStatus() !== null) return undefined;
    // 첫 시도는 900ms 뒤 — 레이아웃/카메라 정착 뒤에 열어 1단계 카드가
    // 안정된 화면 위에 뜬다. Design Guardian (2026-07-24) stacked-transient
    // 가드: 발화 순간 모달(폴더 안내 시트 등)이 열려 있거나 문서 포커스가
    // 나가 있으면(백그라운드 탭 로드 · OS 폴더 선택창) 겹쳐 쏘지 않는다.
    // 단발이면 그 세션에서 환영 순간을 영영 잃으므로(QA 실측 — 백그라운드
    // 탭 로드) 2초 간격으로 잠시 재시도하고, 상한 후에는 storage 미기록
    // 상태로 조용히 물러난다 — 카드의 "2분 구경하기" CTA 가 수동 경로.
    let timerId = 0;
    let attempts = 0;
    const tick = () => {
      if (autoTourFiredRef.current) return;
      if (canAutoStartGuidedTour()) {
        autoTourFiredRef.current = true;
        openGuidedTourRef.current();
        return;
      }
      attempts += 1;
      if (attempts < 10) timerId = window.setTimeout(tick, 2000);
    };
    timerId = window.setTimeout(tick, 900);
    return () => window.clearTimeout(timerId);
  }, [sampleModeSettled]);

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
        realmActive: resolvedRealmSlug !== null,
        selectedEdgeActive: selectedEdge !== null,
        contextMenuOpen: contextMenuNode !== null,
        tourOpen: tour.open,
        createNodeOpen,
        searchOpen: ontologySearchOpen,
        fullDetailOpen,
        selectedRelationActive,
        hasSelection: canvasSelectedSlug != null,
        nodePopoverOpen: nodePopoverVisible,
        hasLocalGraphRoot: localGraphRoot !== null,
      });
      // S4 — 영역 전개는 사다리 최우선. 영역 안에서 Esc 는 무엇보다 먼저
      // 전체 지도로 복귀한다(엣지 팝오버 단축 소비보다도 위).
      if (action === "close-realm") {
        handleExitRealm();
        return;
      }
      switch (action) {
        case "close-edge-popover":
          // R-1 (Guardian 총괄) — 엣지 팝오버가 열려 있으면 Esc 1단은 그것부터
          // 닫는다 (영역 다음 최상단 소비 — 노드 팝오버와 같은 계약). 팝오버는
          // 자체 포커스 관리(TopologyV2EdgePanel)로 트리거에 포커스를 되돌린다.
          setSelectedEdge(null);
          break;
        case "close-context-menu":
          closeContextMenu();
          break;
        case "close-tour":
          // §4 Esc 계약 — Escape 는 투어만 닫는다('skipped' 기록), 다른
          // 표면으로 낙하하지 않는다(한 keypress = 한 표면).
          tour.skip();
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
    resolvedRealmSlug,
    handleExitRealm,
    tour,
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
    {
      // ⌘O — 정적 샘플 모드에서 내 markdown 폴더로 전환(vault.open). 첫 실행
      // 카드의 ⌘O 힌트와 상단 "내 데이터로 전환" 필이 같은 이 핸들러를 가리켜
      // 카드를 닫아도 살아있는 단축키가 된다. 실제 vault 연결(로컬 모드)에선
      // 게이트가 꺼져 무동작.
      combo: { key: "o", meta: true },
      onFire: () => {
        if (createNodeOpen) return;
        if (!sampleModeSettled) return;
        void vault.open();
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
  // 2026-07-24 온보딩 라운드 — 빈 vault 시작 체크리스트의 완료 판정용
  // 프로젝트 실카운트(같은 ontologyInsight 파생이라 drift 불가).
  const checklistProjectCount = useMemo(
    () => ontologyInsight?.nodes.filter((node) => node.kind === "project").length ?? 0,
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
  // 미터 분모 단일 진실원 — 도메인 census BFS total 의 최댓값. INDEX 패널이
  // 내부에서 계산하는 값과 같은 소스라 영역 대장 트리 행의 capacity 미터가
  // 전역 트리와 어긋나지 않는다.
  const indexMaxDomainDescendantCount = useMemo(() => {
    if (!indexDomainCensus || indexDomainCensus.size === 0) return 0;
    let max = 0;
    for (const row of indexDomainCensus.values()) if (row.total > max) max = row.total;
    return max;
  }, [indexDomainCensus]);
  // S7 "영역 대장" — realm 활성 시 좌측 패널이 전역 콘텐츠 대신 이 노드의
  // 세계만 보여줄 때 필요한 파생. 모두 그래프/트리에서만 나온다(순수 lib,
  // `../lib/realm-ledger.ts` + 테스트) — topology-map-v2 를 건드리지 않는다.
  const realmNodeById = useMemo(
    () => new Map((ontologyInsight?.nodes ?? []).map((n) => [n.id, n] as const)),
    [ontologyInsight],
  );
  const realmLedgerModel = useMemo(() => {
    if (!resolvedRealmSlug || !indexTreeResult || !ontologyInsight) return null;
    const subtree = findRealmSubtree(indexTreeResult.roots, resolvedRealmSlug);
    if (!subtree) return null;
    const census = computeRealmCensus(subtree);
    const memberIds = collectRealmMemberIds(subtree);
    const boundary = computeRealmBoundary({
      edges: ontologyInsight.edges,
      memberIds,
      nodeById: realmNodeById,
    });
    // 경계 행에 관계 타입 평문 라벨을 붙인다(위젯은 i18n 을 모른다) + 상위
    // 몇 개만 노출(총수는 헤딩이 말한다).
    const boundaryRows = boundary.crossings.slice(0, 6).map((crossing) => ({
      edgeId: crossing.edgeId,
      fromTitle: crossing.fromTitle,
      toTitle: crossing.toTitle,
      relationLabel: relationVocabulary(crossing.relationType, "formal"),
      outsideId: crossing.outsideId,
      jumpRealmId: crossing.jumpRealmId,
    }));
    return {
      rootKind: subtree.node.kind,
      rootTitle: subtree.node.title,
      census,
      subtree,
      boundaryRows,
      boundaryTotal: boundary.total,
    };
  }, [resolvedRealmSlug, indexTreeResult, ontologyInsight, realmNodeById, relationVocabulary]);
  const realmActive = resolvedRealmSlug !== null && realmLedgerModel !== null;
  // 결계 하단 각인 — "○○ · 요소 N" (사용자 어휘 "이것만 보기", 2026-07-23 소유자
  // 결정). 원장 패널과 **같은 census 객체 + 같은 단위 키**(index.elementsShort /
  // capabilitiesShort)를 쓰므로 한 화면의 같은 사실이 두 숫자로 갈라질 수 없다.
  const realmCaption = useMemo(() => {
    if (!realmLedgerModel) return null;
    const { census, rootTitle } = realmLedgerModel;
    const parts: string[] = [];
    if (census.elementCount > 0) parts.push(`${t("index.elementsShort")} ${census.elementCount}`);
    if (census.capabilityCount > 0) parts.push(`${t("index.capabilitiesShort")} ${census.capabilityCount}`);
    return parts.length > 0 ? `${rootTitle} · ${parts.join(" · ")}` : rootTitle;
  }, [realmLedgerModel, t]);
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
  // 조절 패널(검색/depth/허브만)이 철거된 뒤 유일하게 남은 필터 출처는
  // URL route state 의 activeCategory(`?category=`)다. 지도 loop 가 소비하지
  // 않던 topologyControls 계열 항은 모두 제거됐다.
  const topologyFiltersActive = activeCategory !== null;
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
                  src={withBasePath('/logo.png')}
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
              // R6 오버뷰 census 필 제거(소유자 "필요없어 보임") — 개념/관계·
              // 이번 주·샘플 카운트는 첫 실행 카드/INDEX 패널이 이미 담당(중복
              // 잉크). 브랜드 필은 선택/관계 렌즈/드로어 등 affordance 가 있는
              // 비-오버뷰 상태에서만 남긴다(순수 오버뷰에선 렌더하지 않는다).
              // 2026-07-23 소유자 실보고: 노드 선택 상태의 "선택한 개념" 필도
              // 은퇴 — 선택은 팝오버/링이 이미 말하고, INDEX 재열기는 세로 탭이
              // 담당해 중복. 프로젝트 선택/드로어/관계 렌즈 상태만 유지.
              const heroPillAffordance =
                Boolean(selectedProject) || drawerOpen || selectedRelationActive;
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
                  {heroPillAffordance ? (
                    <HeroCollapsed
                      // 확장 hero 가 사라진 surface — 드로어/인스펙터가 열려
                      // 있을 때만 토글/닫기 동작으로.
                      onExpand={
                        selectedNodeFocusActive
                          ? handleToggleSelectedInspectorSupportRail
                          : drawerOpen
                            ? handleClose
                            : undefined
                      }
                      title={selectedProject?.name ?? t('workspace.fallbackTitle')}
                      // R6 — census subtitle(개념/관계·이번 주·샘플) 제거. affordance
                      // 상태의 평문 eyebrow 만 남긴다(숫자는 INDEX 패널로 이관).
                      subtitle={
                        selectedProject || selectedNodeFocusActive || selectedRelationActive
                          ? t('workspace.selectedEyebrow')
                          : t('workspace.expandHint')
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
                    />
                  ) : null}
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
                    // <md 확장 INDEX 는 풀-블리드 시트 — 시트가 주 표면인 동안
                    // 상단 크롬 열은 강등된다 (겹침 소탕 2026-07-23, rank7 시트
                    // 문법의 완성). utility lane 의 hidden md:flex 와 같은 계약.
                    phoneSheetSuppressed={renderedIndexState === "expanded"}
                    onOpenSearch={() => {
                      setOntologySearchOpen(true);
                    }}
                    onRelayout={() => {
                      setTopologyRelayoutToken((current) => current + 1);
                      toast.show(t('controls.relayoutToast'), "info");
                    }}
                    realmChip={
                      resolvedRealmSlug && realmTitle ? (
                        // 사용자 어휘는 "이것만 보기"(2026-07-23 소유자 결정), 내부명 realm 유지.
                        // chipViewing 템플릿("Viewing only {title}" / "{title}만 보는 중")을
                        // sentinel 로 쪼개 제목 앞/뒤 문구를 로케일 무관하게 얻는다.
                        <TopologyRealmChip
                          title={realmTitle}
                          beforeLabel={t("realm.chipViewing", { title: "\u0000" }).split("\u0000")[0] ?? ""}
                          afterLabel={t("realm.chipViewing", { title: "\u0000" }).split("\u0000")[1] ?? ""}
                          clearAriaLabel={t("realm.chipClear")}
                          onClear={handleExitRealm}
                        />
                      ) : undefined
                    }
                    returnChip={
                      insightsReturnTab ? (
                        <TopologyInsightsReturnChip
                          href={buildOntologyInsightsReturnHref(insightsReturnTab)}
                          label={t("insightsReturn.label")}
                          ariaLabel={t("insightsReturn.ariaLabel")}
                          dismissAriaLabel={t("insightsReturn.dismissAriaLabel")}
                          onDismiss={() => {
                            setRouteState({ insightsReturnTab: null });
                          }}
                        />
                      ) : undefined
                    }
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
                    trailChip={
                      // 발자국 트레일 칩 — 방문 2개 이상부터. "걸은 길 N개" 클릭 시
                      // 미니 타임라인 팝(방문 순서 + 노드 포커스 + 에이전트 복사 + 지우기).
                      footprintTrailEntries.length >= 2 ? (
                        <TopologyTrailChip
                          label={t("footprint.chipLabel", { count: footprintTrailEntries.length })}
                          entries={footprintTrailEntries}
                          currentId={canvasSelectedSlug}
                          copied={footprintPacketCopied}
                          onFocusEntry={(id) => handleSelect(id)}
                          onCopyPacket={copyFootprintPacket}
                          onClear={clearFootprintTrail}
                          labels={{
                            heading: t("footprint.heading"),
                            triggerAriaLabel: t("footprint.triggerAriaLabel"),
                            currentAriaLabel: t("footprint.currentAriaLabel"),
                            rowAriaLabel: (title) => t("footprint.rowAriaLabel", { title }),
                            copyLabel: t("footprint.copyLabel"),
                            copyAriaLabel: t("footprint.copyAriaLabel"),
                            copyCopiedAriaLabel: t("footprint.copyCopiedAriaLabel"),
                            clearLabel: t("footprint.clearLabel"),
                            clearAriaLabel: t("footprint.clearAriaLabel"),
                          }}
                        />
                      ) : undefined
                    }
                  />
                  {selectedNodeOwnsRightRail ? null : (
                    <div
                      // 겹침 소탕 2026-07-23 — ① <md 확장 INDEX(풀-블리드 시트)
                      // 동안은 시트가 주 표면이므로 레인 전체가 물러난다(시트
                      // 상단 인셋 24px 위로 칩 상단 8px 이 삐져나와 보이던 결함).
                      // ② 칩별 라벨은 아래 max-xl/max-2xl [data-chip-label]
                      // 사다리로 축약 — 라벨 총폭 499px 가 768–1365 구간에서
                      // 중앙 검색 레인·확장 INDEX 와 겹치던 원인.
                      className={`topology-ui-scale absolute right-4 top-4 z-20 items-center gap-[var(--topology-utility-lane-gap)] md:right-6 md:top-6 xl:right-8 xl:top-8 ${
                        renderedIndexState === "expanded" ? "hidden md:flex" : "flex"
                      }`}
                      data-phone-sheet-utility-contract={
                        renderedIndexState === "expanded"
                          ? "hidden-below-md-while-index-sheet-owns-surface"
                          : undefined
                      }
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
                    {/* 온보딩 디자이너 지적 — 첫 실행 카드 dismiss 후에도 살아남는
                        상시 "내 데이터로 전환" 진입점. 정적 샘플 모드에서만
                        보이고(카드 dismiss 와 독립), 실제 vault 연결 시 소멸.
                        chrome 타일 규격(ChromeChip) 준수, 조용한 support 표면. */}
                    {sampleModeSettled ? (
                      <Tooltip content={t('controls.switchToMyDataTooltip')} side="bottom" withProvider={false}>
                        <ChromeChip
                          onClick={() => void vault.open()}
                          aria-label={t('controls.switchToMyDataAriaLabel')}
                          data-testid="topology-switch-to-my-data"
                          data-utility-action-token-contract="support-surface-family"
                          data-utility-action-surface-token="--chrome-surface"
                          data-utility-action-border-token="--chrome-border"
                          data-utility-action-shadow-token="--chrome-shadow"
                          data-utility-action-focus-ring-token="--color-indigo-accent"
                          compact={topologyUtilityChromeCompact}
                          icon={<FolderOpen className="text-[color:var(--color-indigo-accent)]" />}
                          kbd="⌘O"
                          // 겹침 소탕 2026-07-23 — 레인 축약 사다리: <2xl 은 kbd
                          // 캡 접기(검색 칩의 기존 max-2xl ⌘K 규칙과 대칭),
                          // <xl 은 라벨 접기(아이콘-only). 이 칩의 라벨+kbd 총폭
                          // 225px 가 768–1365 에서 중앙 검색 레인·확장 INDEX 와
                          // 겹치던 주범(1280 실측 35px 침범). aria-label·툴팁이
                          // 뜻을 보존하고 첫 실행 카드 CTA 가 같은 액션을 상시
                          // 라벨로 노출한다.
                          className="max-2xl:[&_[data-chip-kbd]]:hidden max-xl:[&_[data-chip-label]]:hidden"
                        >
                          {t('controls.switchToMyDataLabel')}
                        </ChromeChip>
                      </Tooltip>
                    ) : null}
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
                        // <2xl 아이콘-only — 라벨 사다리(겹침 소탕 2026-07-23).
                        // 스포트라이트 칩 추가로 레인이 넓어져 1440 에서 검색
                        // 레인과 재충돌(실측 18px) — 토글류(그래프·최근 변경)
                        // 라벨을 한 단계 먼저 접어 주 CTA(Switch) 라벨을 지킨다.
                        // aria-label + 툴팁이 뜻을 보존한다.
                        className="max-2xl:[&_[data-chip-label]]:hidden"
                      >
                        {t('controls.graphToggleLabel')}
                      </ChromeChip>
                    </Tooltip>
                    {/* 최근 변경 스포트라이트 (협의회 설계 2026-07-23) — 렌즈
                        토글. 그래프 토글과 같은 ChromeChip 문법/축약 사다리.
                        상태는 URL `?recent=` 단일 진실원 (공유/에이전트 재현). */}
                    <Tooltip content={t('controls.spotlightTooltip')} side="bottom" withProvider={false}>
                      <ChromeChip
                        onClick={handleToggleSpotlight}
                        aria-pressed={spotlightOn}
                        aria-label={t('controls.spotlightAriaLabel')}
                        data-testid="topology-spotlight-toggle"
                        data-utility-action-token-contract="support-surface-family"
                        data-utility-action-surface-token="--chrome-surface"
                        data-utility-action-border-token="--chrome-border"
                        data-utility-action-hover-surface-token="--color-overlay-2"
                        data-utility-action-active-surface-token="--chrome-active-surface"
                        data-utility-action-active-border-token="--chrome-active-border"
                        data-utility-action-shadow-token="--chrome-shadow"
                        data-utility-action-focus-ring-token="--color-indigo-accent"
                        compact={topologyUtilityChromeCompact}
                        icon={<HistoryIcon />}
                        active={spotlightOn}
                        // 그래프 토글과 같은 <2xl 아이콘-only 사다리(위 주석).
                        className="max-2xl:[&_[data-chip-label]]:hidden"
                        // P2 결함④ 후속 (소유자 실보고 2026-07-23, 상단 크롬
                        // 과밀) — 시간창/건수 카운트를 레인에 떠 있던 무라벨
                        // mono 텍스트 대신 칩 내부 badge 로 흡수한다(문서 칩의
                        // 고정 수 badge 와 같은 문법·토큰). INDEX 세그먼트가
                        // 같은 "최근 N일 · count" 를 이미 노출하므로 중복
                        // 문자열도 제거되고, badge 는 compact/축약 사다리와
                        // 무관하게 항상 남아 <xl 에서도 건수가 보인다. 시간창은
                        // aria-label·title 로 보존.
                        badge={
                          spotlightOn ? (
                            <span
                              aria-live="polite"
                              data-testid="topology-spotlight-window-summary"
                              data-utility-count-badge="spotlight-recent"
                              data-surface-token="--topology-utility-lane-count-surface"
                              data-text-token="--topology-utility-lane-count-text"
                              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--topology-utility-lane-count-surface)] px-1.5 font-mono text-[10px] tabular-nums text-[color:var(--topology-utility-lane-count-text)]"
                              aria-label={t('controls.spotlightWindowSummary', {
                                days: recentChanges.windowDays,
                                count: recentChanges.recentNodeIds.size,
                              })}
                              title={t('controls.spotlightWindowSummary', {
                                days: recentChanges.windowDays,
                                count: recentChanges.recentNodeIds.size,
                              })}
                            >
                              {recentChanges.recentNodeIds.size}
                            </span>
                          ) : null
                        }
                      >
                        {t('controls.spotlightLabel')}
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
                      // 레인 축약 사다리(겹침 소탕 2026-07-23): <2xl kbd 접기 ·
                      // <xl 라벨 접기. 고정 문서 수 badge 는 compact 규칙과
                      // 동일하게 항상 남는다.
                      className="max-2xl:[&_[data-chip-kbd]]:hidden max-xl:[&_[data-chip-label]]:hidden"
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
                          {/* <xl 아이콘-only — 레인 라벨 사다리(겹침 소탕
                              2026-07-23). aria-label + 툴팁이 뜻을 보존한다. */}
                          <span
                            className={
                              topologyUtilityChromeCompact ? "sr-only" : "max-xl:hidden"
                            }
                          >
                            {t('createNode.toggleLabel')}
                          </span>
                        </button>
                      </Tooltip>
                    ) : null}
                    {/* 발자취(Atlas Git) <lg 진입점 (P2 결함⑤, 사용성 전수
                        검수 2026-07-23) — <lg 에서 내비 레일이 사라지며
                        스포트라이트·설정은 이 유틸리티 레인으로 이식됐는데
                        발자취(GitStatusTile) 만 진입 경로가 완전히
                        소실됐다. 설정 기어와 같은 --chrome-tile-size
                        문법으로 같은 열에 추가 — 클릭은 레일 슬롯과 동일한
                        setGitPanelOpen(true). 비개발(plain) 모드는 레일
                        슬롯(위 navRailSettingsSlot)과 같은 계약으로 숨긴다. */}
                    {audiencePlain ? null : (
                      <button
                        type="button"
                        onClick={() => setGitPanelOpen(true)}
                        aria-label={tAtlasGit('tileLabel')}
                        title={tAtlasGit('tileLabel')}
                        aria-haspopup="dialog"
                        aria-expanded={gitPanelOpen}
                        data-testid="topology-footprint-lg-tile"
                        className="relative lg:hidden flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
                      >
                        <HistoryIcon className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
                        {ontologyChangeset.touchedNodeIds.size > 0 ? (
                          <span
                            aria-hidden="true"
                            data-testid="topology-footprint-lg-tile-dot"
                            className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]"
                          />
                        ) : null}
                      </button>
                    )}
                    {/* 설정 기어 <lg 진입점 (겹침 소탕 2026-07-23) — 내비 레일
                        (lg+ 전용)의 기어 슬롯이 사라지는 <lg 에서 지도의 설정
                        (언어·INDEX 기본 상태·vault 교체) 접근 수단이 0 이었다.
                        레일 슬롯과 같은 컴포넌트·같은 state 를 chrome-tile 변형
                        으로 레인 끝에 꽂는다 — 하단 탭바 5-목적지 계약은 불변.
                        lg+ 에선 레일 기어가 담당하므로 이 타일은 사라진다. */}
                    <div className="lg:hidden">
                      <TopologyV2SettingsGear
                        indexDefaultCollapsed={indexPanelCollapsedStored}
                        onChangeIndexDefaultCollapsed={handleChangeIndexDefaultCollapsed}
                        audiencePlain={audiencePlain}
                        onChangeAudiencePlain={setAudiencePlain}
                        changeVaultHref="/docs/?intent=local"
                        triggerVariant="chrome-tile"
                        popoverAlign="right"
                        popoverSide="bottom"
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
                          audience: t('controls.settingsGearAudience'),
                          audienceDev: t('controls.settingsGearAudienceDev'),
                          audiencePlain: t('controls.settingsGearAudiencePlain'),
                          audienceCaption: t('controls.settingsGearAudienceCaption'),
                        }}
                      />
                    </div>
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
                        project: t('createNode.kindProject'),
                        domain: t('createNode.kindDomain'),
                        capability: t('createNode.kindCapability'),
                        element: t('createNode.kindElement'),
                      },
                    }}
                    defaultKind={createNodeDefaultKind}
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
                  // J (소유자 실보고 2026-07-23) — 상시 "지형도" 헤더가
                  // 은퇴한 뒤 전개 스택 위 84px 이 빈 띠로 남았다. 전개
                  // 상태는 크롬 인셋(24px)까지 올린다. 브랜드 pill 이 뜨는
                  // 상태(선택/드로어)에선 C 자동 강등으로 스택이 접힘 탭이
                  // 되므로 pill 과의 겹침이 구조적으로 없다. 접힘 탭은
                  // pill 아래 정렬을 위해 기존 84px 유지.
                  top:
                    renderedIndexState === "expanded"
                      ? "var(--topology-index-inset)"
                      : "var(--topology-index-top)",
                  // rank7 — 하단 인셋은 전용 토큰: 데스크톱에선 크롬 인셋과
                  // 동일, <md 시트 모드에선 BottomTabBar 예약고 위로 올라간다.
                  bottom:
                    renderedIndexState === "expanded"
                      ? "var(--topology-index-bottom-inset)"
                      : undefined,
                }}
              >
                {renderedIndexState === "expanded" && indexTreeResult ? (
                  // S7 "영역 대장" — 영역 활성 시 좌측 패널이 전역 콘텐츠 대신
                  // 이 노드의 세계만 보여주는 변신 표면으로 교체된다. 두 표면이
                  // 같은 박스를 차지하므로 keyed 래퍼의 짧은 페이드-인(<200ms,
                  // reduced-motion 즉시)이 크로스페이드로 읽힌다. 전역↔영역
                  // 전환에서만 key 가 바뀌어 remount → 페이드; 영역→영역
                  // 점프는 in-place 갱신.
                  <div
                    key={realmActive ? "realm" : "index"}
                    // R4 모션 헌법 — 하드코딩 160ms/ease-out 을 크롬 모션 토큰으로
                    // 통일(`--topology-motion-panel-duration` 180ms +
                    // `--topology-motion-ease-out`). 크롬 등장 문법 단일 클럭.
                    className="h-full animate-[panelCrossfadeIn_var(--topology-motion-panel-duration)_var(--topology-motion-ease-out)] motion-reduce:animate-none"
                  >
                  {realmActive && realmLedgerModel ? (
                    <TopologyRealmLedger
                      rootKind={realmLedgerModel.rootKind}
                      rootTitle={realmLedgerModel.rootTitle}
                      census={realmLedgerModel.census}
                      subtree={realmLedgerModel.subtree}
                      boundaryRows={realmLedgerModel.boundaryRows}
                      boundaryTotal={realmLedgerModel.boundaryTotal}
                      selectedId={canvasSelectedSlug}
                      changedSlugs={changedSlugs}
                      onSelect={(id) => handleSelect(id)}
                      onExit={handleExitRealm}
                      // 결계 관계 행의 "이 영역으로 이동" = 밖 노드의 도메인급
                      // 상위로 realm 을 교체(realm-to-realm 점프). 진입 핸들러
                      // 재사용 — 새 URL 로직 없음.
                      onJumpRealm={handleEnterRealm}
                      maxDomainDescendantCount={indexMaxDomainDescendantCount}
                      domainCensus={indexDomainCensus}
                      labels={{
                        label: t("realm.ledger.heading"),
                        elementsShort: t("index.elementsShort"),
                        capabilitiesShort: t("index.capabilitiesShort"),
                        depthShort: t("realm.ledger.depthShort"),
                        searchPlaceholder: t("realm.ledger.searchPlaceholder"),
                        exit: t("realm.ledger.exit"),
                        exitAria: t("realm.chipClear"),
                        emptyHint: t("index.emptyHint"),
                        boundaryHeading: t("realm.ledger.boundaryHeading", {
                          count: realmLedgerModel.boundaryTotal,
                        }),
                        boundaryToggleAria: t("realm.ledger.boundaryToggleAria"),
                        boundaryJump: t("realm.ledger.boundaryJump"),
                        boundaryJumpAria: t("realm.ledger.boundaryJumpAria"),
                        boundaryEmpty: t("realm.ledger.boundaryEmpty"),
                        freshTitle: t("index.freshTitle"),
                        domainCountTitle: t("index.domainCountTitle"),
                      }}
                    />
                  ) : (
                  <TopologyIndexPanel
                    // 슬라이스 C — 비개발(plain) 모드는 element 행만 제외한
                    // 파생 트리를 내린다(표시 게이트, 데이터 무변경). realm
                    // 대장/census/카운트는 여전히 `indexTreeResult` 원본을 쓴다.
                    treeResult={
                      audiencePlain
                        ? { ...indexTreeResult, roots: filterTreeExcludeKind(indexTreeResult.roots, "element") }
                        : indexTreeResult
                    }
                    totalConcepts={topologyTotalNodes}
                    totalRelations={topologyTotalRelations}
                    domainCount={indexDomainCount}
                    changedSlugs={changedSlugs}
                    selectedId={canvasSelectedSlug}
                    onSelect={(id) => handleSelect(id)}
                    onCollapse={handleIndexCollapse}
                    onStartTour={openGuidedTour}
                    onEnablePlainMode={() => setAudiencePlain(true)}
                    // P1 결함①a — element 행이 왜 안 보이는지 설명하는
                    // 조용한 힌트 행 게이트. treeResult 는 이미 위에서
                    // element 를 제외했다(단일 진실원 무변경).
                    plainMode={audiencePlain}
                    // 오버뷰 좌측 레일 attention winner 단일화 (2026-07-24) —
                    // vault 미연결(정적 샘플) 동안은 "먼지 앉은 노드" 행과
                    // "인계" 메뉴가 이 제품 자신의 dogfood vault 상태를
                    // 서술해 첫 방문자에게 남의 저장소 잡음으로 읽힌다.
                    // `canCreateNode`(= vault.manifest !== null)가 이미 이
                    // 페이지의 "vault 로드됨" 단일 진실원이므로 그대로 재사용.
                    vaultLoaded={canCreateNode}
                    onOpenAgentConnect={agentConnectLauncher.open}
                    // P4-② (2026-07-21 리텐션 라운드) — 이미 연결된
                    // 에이전트가 있는 2일차+ 사용자에게 "Updated with AI"
                    // 클릭이 "AI 에이전트 연결" 등록 모달(어제 이미 끝낸
                    // 셋업)로 돌려보내는 건 막다른 길이었다. 연결 상태일 땐
                    // 그 클릭이 답해야 할 질문이 "가입할까?"가 아니라
                    // "에이전트가 뭘 했지?"이므로 활동 다이제스트(인사이트
                    // 기본 탭 "할 일")로 딥링크한다. 미연결/stale 은 기존
                    // 모달 그대로.
                    agentActivityHref={
                      agentConnect.status.kind === "connected" ? "/ontology/insights/" : null
                    }
                    domainCensus={indexDomainCensus}
                    // P4a — 렌즈 필터용 id 집합 + P4b 배지 대상.
                    recentChanges={{
                      ids: recentChanges.recentNodeIds,
                      agentAttributedNodeId: agentAttributedRecentNodeId,
                    }}
                    // 스포트라이트 단일 진실원 (협의회 §⑤) — URL `?recent=`
                    // 하나가 지도 침강과 이 렌즈를 동시 구동. 렌즈 탭 클릭 =
                    // 스포트라이트 on/off, 프리셋 칩 = 창 즉시 전환.
                    lens={spotlightOn ? "recent" : "all"}
                    onLensChange={(next) =>
                      setRouteState((current) => ({
                        ...current,
                        recentWindow: next === "recent" ? (current.recentWindow ?? "auto") : null,
                      }))
                    }
                    recentWindow={recentWindow ?? "auto"}
                    onWindowChange={(next) =>
                      setRouteState((current) => ({ ...current, recentWindow: next }))
                    }
                    // P4c — "지도에 없는 문서 N개 · 올리기". `bootstrapPlan` 은
                    // vault 가 로드되기만 하면(빈 지도든 아니든) 항상 계산돼
                    // 있으므로 새 파생 없이 그 카운트를 그대로 노출한다 —
                    // 클릭은 기존 "내 문서로 지도 만들기" 다이얼로그를 연다
                    // (이전에는 지도가 완전히 빈 상태의 empty-state 에서만
                    // 열렸다; 이 행은 지도가 이미 채워진 상태에서도 연다).
                    uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                    // ④ 살아있는 지도 드리프트 — dusty 카운트. 0 이면 행 숨김.
                    dustyNodeCount={dustySlugs.size}
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
                    // 슬라이스 C — 비개발(plain) 모드는 인계 메뉴를 개발자
                    // 크롬으로 간주해 undefined 전달(위젯 기존 계약 — 미전달
                    // 시 메뉴 미렌더).
                    agentHandoff={
                      audiencePlain
                        ? undefined
                        : {
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
                          }
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
                      domainCountTitle: t("index.domainCountTitle"),
                      subtotalTitle: t("index.subtotalTitle"),
                      emptyHint: t("index.emptyHint"),
                      segmentAll: t("index.segmentAll"),
                      // M-8 — 적응 창(7d→3d→1d)의 실제 창 일수를 라벨에 노출.
                      segmentRecent: t("index.segmentRecent", {
                        count: recentChanges.recentNodeIds.size,
                        days: recentChanges.windowDays,
                      }),
                      segmentRecentAria: t("index.segmentRecentAria"),
                      recentEmptyHint: t("index.recentEmptyHint", { days: recentChanges.windowDays }),
                      // 스포트라이트 창 프리셋 칩 라벨 (협의회 §②).
                      windowChipAuto: t("index.windowChipAuto"),
                      windowChip1: t("index.windowChipDays", { days: 1 }),
                      windowChip7: t("index.windowChipDays", { days: 7 }),
                      windowChip30: t("index.windowChipDays", { days: 30 }),
                      windowChipsAria: t("index.windowChipsAria"),
                      agentBadge: t("index.agentBadge"),
                      uncatalogedDocsLabel: t("index.uncatalogedDocsLabel", {
                        count: bootstrapPlan?.elements.length ?? 0,
                      }),
                      uncatalogedDocsAction: t("index.uncatalogedDocsAction"),
                      dustyNodesLabel: t("index.dustyNodesLabel", { count: dustySlugs.size }),
                      dustyNodesAction: t("index.dustyNodesAction"),
                      // P1 결함①a — plainMode 일 때만 실제 렌더(패널 게이트).
                      plainHint: t("index.plainHint"),
                    }}
                  />
                  )}
                  </div>
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
          onPointerDownCapture={handleCanvasPointerDownCapture}
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
                  // 2026-07-24 온보딩 라운드 — 쓰기 가능한 로컬 vault 가 열려
                  // 있고 부트스트랩할 기존 문서도 없으면(진짜 빈 폴더) dead-end
                  // 문구 대신 진행형 시작 체크리스트를 세운다. 문서가 있으면
                  // 기존 "내 문서로 지도 만들기" 부트스트랩 브랜치가 우선.
                  canCreateNode && (bootstrapPlan?.elements.length ?? 0) === 0 ? (
                    <VaultStartChecklist
                      projectCount={checklistProjectCount}
                      relationCount={topologyTotalRelations}
                      agentConnected={agentConnect.status.kind === "connected"}
                      onCreateNode={openCreateNodeWithKind}
                      onOpenAgentConnect={openAgentConnectSheet}
                      analyzePrompt={t("startChecklist.analyzePrompt")}
                    />
                  ) : (
                  <TopologyEmptyState
                    projectCount={emptyTopologyNodeCount}
                    reason={topologyOverlayState.emptyReason}
                    canCreateNode={canCreateNode}
                    onCreateNode={openCreateNode}
                    hasOpenVault={vault.manifest !== null}
                    docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                    onStartFromDocs={
                      bootstrapPlan && bootstrapPlan.elements.length > 0
                        ? () => setBootstrapOpen(true)
                        : undefined
                    }
                  />
                  )
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
                    focus={{ selectedSlug: canvasSelectedSlug }}
                    changedSlugs={changedSlugs}
                    livePhysics={analysisMode === "graph"}
                    fitViewToken={combinedFitToken}
                    relayoutToken={topologyRelayoutToken}
                    revealToken={mapRevealToken}
                    onSelectEdge={(edge) => {
                      setFullDetailSlug(null);
                      setHoverEdge(null); // 팝오버가 열리면 마이크로카드는 강등
                      // 노드 핸즈온 감사(2026-07-24) A안 — 노드 포커스 중 엣지
                      // 클릭이 삼켜지던 결함(엣지 패널 게이트 `!selectedOntologyNode`).
                      // 엣지 선택 = 페어 포커스는 노드 ego 포커스를 **대체**하는
                      // 게 정의(두 transient 표면 동시 금지)이므로, onSelect 이
                      // selectedEdge 를 지우는 것과 대칭으로 여기서 노드 포커스를
                      // 해제해 게이트를 연다. 카메라는 overview→엣지 경로와 동일.
                      if (selectedOntologyNode) handleClose();
                      setSelectedEdge(edge);
                    }}
                    onHoverEdge={handleHoverEdge}
                    selectedEdge={selectedEdge ? { sourceId: selectedEdge.sourceId, targetId: selectedEdge.targetId } : null}
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
                    spotlightIds={spotlightIds}
                    expandedParents={spotlightExpandedParents ?? expandedParentSet}
                    onToggleCluster={handleToggleCluster}
                    onHoverCluster={handleHoverCluster}
                    clusterHint={t('cluster.hint')}
                    realmRootId={resolvedRealmSlug}
                    onEnterRealm={handleEnterRealm}
                    realmEnterLabel={t('realm.enterAction')}
                    realmEnterTooltip={t('realm.enterTooltip')}
                    realmCaption={realmCaption}
                    canvasLabel={t('canvas.ariaLabel')}
                    visitedTrail={footprintVisitedIds}
                    // 슬라이스 C — 비개발(plain) 모드는 element 티어를 도달
                    // 불가 밴드로 밀어 상시 숨김(ego 예외는 그대로).
                    tierReveal={audiencePlain ? PLAIN_TIER_REVEAL : undefined}
                    // 가이드 투어 — 캔버스 노드 앵커(2·4단계) 프로젝션.
                    tourAnchorNodeId={tourAnchorNodeId}
                    tourAnchorRef={tourAnchorRef}
                    // rank18 — GlobalSearch(⌘K)가 실제로 열려 있는 동안
                    // (MountedGlobalSearch 의 open prop 과 동일 조건) 캔버스를
                    // aria-hidden+inert 로 접근성 트리에서 제외.
                    overlayOpen={!createNodeOpen && ontologySearchOpen}
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
                <TopologyFitControl
                  density={topologyUtilityChromeCompact ? "compact-focus" : "default"}
                  onFitView={() => setFitViewToken((t) => t + 1)}
                />
              )}
              {/* 가이드 투어 진입 (2026-07-23, `src/features/guided-tour`) —
                  "?" 타일 바로 위 형제, 같은 chrome-tile 토큰 가족. "?" 의
                  phone 가시성 분기(topologyShortcutHelpPhoneVisible)는 복제하지
                  않는다 — 투어는 md+ 전용 고정(`hidden md:flex`, spec §4). */}
              {createNodeOpen ||
              selectedRelationActive ||
              topologyBlockingOverlayActive ||
              selectedNodeFocusActive ? null : (
                <Tooltip content={t('controls.tourTooltip')} side="left" withProvider={false}>
                  <button
                    type="button"
                    onClick={openGuidedTour}
                    aria-label={t('controls.tourAriaLabel')}
                    data-testid="topology-tour-button"
                    className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] md:right-6 md:top-[var(--topology-tour-help-desktop-top)] md:flex xl:right-8 size-[var(--chrome-tile-size)]"
                  >
                    <Compass className="size-[var(--chrome-icon)]" aria-hidden />
                  </button>
                </Tooltip>
              )}
              {/* 단축키/제스처 도움말 진입점 — 우상단 Fit 타일 아래 두 칸(투어
                  타일 다음), 36×36 아이콘. phone 은 primary read rail
                  (path/health) 과 충돌하지 않는 overview/focus 에서만 노출한다. */}
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
                    // <md 확장 INDEX(풀-블리드 시트) 동안 "?" 타일이 시트 위에
                    // 떠서 겹쳤다(600×900 실측 y188) — 시트가 주 표면, 크롬
                    // 강등(겹침 소탕 2026-07-23). md+ 는 md:flex 가 유지.
                    topologyShortcutHelpPhoneVisible && renderedIndexState !== "expanded"
                      ? "flex"
                      : "hidden"
                  }`}
                >
                  <HelpCircle className="size-[var(--chrome-icon)]" aria-hidden />
                </button>
                </Tooltip>
              )}
              {/* 설정 기어는 좌측 내비 레일 하단으로 이관됐다
                  (feat/chrome-system — chrome-rail-combined.html). 죽은 "조절"
                  패널 철거 후 우측 세로 레일은 지도 전용 3타일(전체보기/가이드
                  투어/단축키, 2026-07-23 투어 타일 추가로 2→3 현행화)만. */}
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
                  로컬 그래프/카테고리 필터가 노드를 줄였을 때 컨텍스트를 주는 칩. */}
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
                  같은 계기 판독 문법을 공유하되 가시성 조건은 서로 다르다.

                  S3 마감 폴리시 (fable 설계) — 두 줄이 같은 계기 문법(mono 9px
                  quaternary)이라 gap 이 좁으면 한 덩어리로 뭉쳐 보인다. gap-3 로
                  줄 간 분리를 확실히 해 어떤 줌 상태의 문구 길이에서도 범례와
                  판독이 겹쳐 읽히지 않게 한다. 코너 inset 은 orphan 이던
                  `--topology-relation-legend-inset` 토큰(base 24px, ≥1920 32px)에
                  연결 — ≥1920 에서 나머지 크롬이 1.15 로 커질 때 이 스택도 코너에서
                  더 물러나 지도 라벨과 충돌하지 않는다. */}
              {/* 검수 1바퀴 결함 2 (2026-07-23) — 우측 데이터시트가 열리면 이
                  코너 스택(범례+판독)이 패널 뒤·왼편으로 파편처럼 비쳐 보였다
                  (4개 로케일×해상도 전 조합 재현). 앰비언트 정보라 조사 중엔
                  필요 없으므로 패널이 열려 있는 동안 조용히 사라진다. */}
              <div
                className={cn(
                  "pointer-events-none absolute bottom-[var(--topology-relation-legend-bottom-inset)] right-[var(--topology-relation-legend-inset)] z-20 flex flex-col items-end gap-3 whitespace-nowrap transition-opacity duration-180 ease-out motion-reduce:transition-none",
                  v2DatasheetModel ? "opacity-0" : "opacity-100",
                )}
                aria-hidden={v2DatasheetModel ? true : undefined}
              >
                <TopologyRelationLegend register={relationRegister} />
                <FirstRunReadout
                  projectCount={firstRunProjectCount}
                  domainCount={indexDomainCount}
                  tier={mapZoomTier}
                  // P1 결함①b — plain 모드는 element 티어에 절대 도달하지
                  // 않으므로(PLAIN_TIER_REVEAL) tier 기반 힌트 드롭 로직이
                  // 항상 거짓을 말했다. plain 문구로 치환.
                  audiencePlain={audiencePlain}
                />
              </div>

              {/* 샘플 모드 첫 방문 1회성 지도 힌트 — 하단 중앙, pointer-events-none
                  이라 노드 클릭을 막지 않는다(통과 클릭 = 소멸). 첫 노드 선택 시
                  영구 소멸(localStorage). 소스: features/first-run-starter. */}
              <SampleNodeHint hasSelection={Boolean(canvasSelectedSlug)} hidden={tour.open} />

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
        {/* rank2 — presence 게이트: `panelOpen` 이 꺼져도 퇴장 애니가 끝날
            때까지(≈140ms) mounted 유지. 그 동안 `panelDatasheetModel`(마지막
            모델 retain)로 같은 내용을 계속 그리며 `.topology-chrome-out` 으로
            접힌다. */}
        {nodePanelPresence.mounted && panelDatasheetModel ? (
          <div
            ref={nodePopoverPositionerRef}
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
            {panelDatasheetModel ? (
              <TopologyV2DetailPanel
                key={panelDatasheetModel.slug}
                presence={nodePanelPresence.exiting ? "exiting" : "entering"}
                slug={panelDatasheetModel.slug}
                title={panelDatasheetModel.title}
                sourceTitle={panelDatasheetModel.sourceTitle}
                kind={panelDatasheetModel.kind}
                domain={panelDatasheetModel.domain}
                powered={panelDatasheetModel.powered}
                metric={panelDatasheetModel.metric}
                groups={panelDatasheetModel.groups}
                evidence={panelDatasheetModel.evidence}
                codeLocations={panelDatasheetModel.codeLocations}
                updatedAtLabel={panelDatasheetModel.updatedAtLabel}
                lastEditSubject={panelDatasheetModel.lastEditSubject}
                mtimeConflict={panelDatasheetModel.mtimeConflict}
                handoffText={panelDatasheetModel.handoffText}
                documentHref={panelDatasheetModel.documentHref}
                builderEditHref={panelDatasheetModel.builderEditHref}
                labels={{
                  kindLabel: tKinds(normalizeKindLabelKey(panelDatasheetModel.kind)),
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
                  containsShowAll: t("nodeDatasheet.containsShowAll"),
                  containsShowSummary: t("nodeDatasheet.containsShowSummary"),
                  containsOtherGroup: t("nodeDatasheet.containsOtherGroup"),
                  metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                  metricDependsOn: relationVocabulary("depends_on", "plain"),
                  metricEvidence: relationVocabulary("describes", "plain"),
                  // R+ 근거 misnomer fix — evidenceIds 는 0|1 self-reference라
                  // 숫자 대신 선언됨/미선언 이진 칩으로 렌더.
                  metricEvidenceDeclared: t("nodeDatasheet.metricEvidenceDeclared"),
                  metricEvidenceUndeclared: t("nodeDatasheet.metricEvidenceUndeclared"),
                  // H1 B2/A — typed-fact 라벨 hover 풀이 + "직접" 연결 스코프 명시.
                  metricContainsHelp: t("nodeDatasheet.metricContainsHelp"),
                  metricUsedByHelp: t("nodeDatasheet.metricUsedByHelp"),
                  metricDependsOnHelp: t("nodeDatasheet.metricDependsOnHelp"),
                  metricEvidenceHelp: t("nodeDatasheet.metricEvidenceHelp"),
                  metricHelp: t("nodeDatasheet.metricHelp"),
                  noConnections: t("nodeDatasheet.noConnections"),
                  // R+ "코드 위치" — 실제 코드 근거(원문 파일 경로) 섹션.
                  codeLocationsLabel: t("nodeDatasheet.codeLocationsLabel"),
                  codeLocationsCopyLabel: t("nodeDatasheet.codeLocationsCopyLabel"),
                  codeLocationsCopiedLabel: t("nodeDatasheet.codeLocationsCopiedLabel"),
                  // rank7 (design-council B5) — DocFrontmatterBlock 과 같은
                  // `editProvenance` 네임스페이스(단일 출처, drift 방지).
                  editSubjectPrefix: tEditProvenance("prefix"),
                  editSubjectAgent: tEditProvenance("subjectAgent"),
                  editSubjectHuman: tEditProvenance("subjectHuman"),
                  editConflictMessage: tEditProvenance("conflictMessage"),
                  handoff: t("nodeDatasheet.handoff"),
                  close: t("controls.close"),
                  openFullDetail: t("nodeDatasheet.openFullDetail"),
                  actionsGroupLabel: t("nodeDatasheet.actionsGroupLabel"),
                  actionDocument: t("nodeDatasheet.actionDocument"),
                  actionEditRelations: t("nodeDatasheet.actionEditRelations"),
                  actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
                  actionPath: t("nodeDatasheet.actionPath"),
                  actionRealm: t("realm.enterAction"),
                  // 결과-설명 툴팁 (소유자 승인) — 라벨 반복이 아닌 "누르면
                  // 무엇이 되는가" 평문. 영역 전개는 기존 궤도 버튼 툴팁 재사용.
                  actionDocumentTip: t("nodeDatasheet.actionDocumentTip"),
                  actionEditRelationsTip: t("nodeDatasheet.actionEditRelationsTip"),
                  actionCopyHandoffTip: t("nodeDatasheet.actionCopyHandoffTip"),
                  actionPathTip: t("nodeDatasheet.actionPathTip"),
                  actionRealmTip: t("realm.enterTooltip"),
                }}
                onSelectConnection={(id) => handleSelect(id)}
                onCopyHandoff={copyV2NodeHandoff}
                onClose={handleClose}
                onSetPathSource={() => handleSetPathSource(panelDatasheetModel.nodeId)}
                onEnterRealm={
                  // S4 — 컨테이너 노드(자식 있음)이며 영역 밖일 때만 2차 발견
                  // 경로를 노출한다. leaf/이미 영역 안이면 omit → 버튼 미표시.
                  resolvedRealmSlug === null && panelDatasheetModel.groups.contains.total > 0
                    ? () => handleEnterRealm(panelDatasheetModel.nodeId)
                    : undefined
                }
                onOpenFullDetail={
                  selectedOntologyNode
                    ? () => setFullDetailSlug(selectedOntologyNode.id)
                    : undefined
                }
                // 슬라이스 C — 비개발(plain) 모드는 인계 복사 타일 + 원문
                // 경로 서브라인(슬라이스 B)을 개발자 크롬으로 간주해 숨긴다.
                showHandoff={!audiencePlain}
                showSourcePath={!audiencePlain}
                className="max-lg:w-[min(520px,calc(100vw-1.5rem))]"
              />
            ) : null}
          </div>
        ) : null}
        {/* P3b — 엣지 팝오버: 노드 팝오버와 같은 포지셔너 계약, 배타 렌더. */}
        {/* 노드 포커스(팝오버) 중에도 렌더 — 사용자 실보고 "노드 클릭한
            상태에선 선 호버 툴팁이 안 나온다". 엣지 팝오버와만 상호배제
            (같은 의미의 중복 표면 금지). */}
        {hoverEdgeCardModel && !selectedEdge && !createNodeOpen ? (
          <TopologyV2EdgeHoverCard
            sentence={hoverEdgeCardModel.sentence}
            typeLabel={hoverEdgeCardModel.typeLabel}
            why={hoverEdgeCardModel.why}
            clickHint={t("edgeHover.clickHint")}
            x={hoverEdgeCardModel.x}
            y={hoverEdgeCardModel.y}
          />
        ) : null}
        {/* S2 파트 5C — 클러스터 칩 호버 툴팁. 엣지 카드/노드 생성과 상호배제
            (칩 호버 시 포인터 핸들러가 엣지 호버를 이미 해제하지만 방어). */}
        {clusterHoverCardModel && !hoverEdgeCardModel && !createNodeOpen ? (
          <TopologyV2ClusterHoverCard
            sentence={clusterHoverCardModel.sentence}
            x={clusterHoverCardModel.x}
            y={clusterHoverCardModel.y}
          />
        ) : null}
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
              codeLocations={fullDetailA1Model.codeLocations}
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
        {/* 발자취(Atlas Git) 시트 — 레일 타일이 연다. AgentConnectSheet 와
            같은 scrim+중앙 카드 모달 골격(같은 토큰, modality 증명 — 스크림
            클릭 닫기). 패널 내용/조회는 위젯 자기완결. */}
        {gitPanelOpen ? (
          <div
            data-interactive-overlay="true"
            data-testid="atlas-git-scrim"
            className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
            onClick={() => setGitPanelOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-y-auto border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[560px] sm:rounded-[var(--topology-shortcut-sheet-radius)]"
            >
              <AtlasGitPanel
                vaultPath={gitVaultPath}
                sessionChangeset={ontologyChangeset}
                onClose={() => setGitPanelOpen(false)}
              />
            </div>
          </div>
        ) : null}
        <AgentConnectSheet
          open={agentConnect.open}
          onClose={() => {
            agentConnect.closeSheet();
            // 전역 열기 의도도 리셋 — 안 하면 지형도 밖으로 나갔다 돌아올 때
            // wantOpen 이 남아 시트가 재오픈된다.
            agentConnectLauncher.close();
          }}
          status={agentConnect.status}
          snippets={agentConnect.snippets}
          domainTitles={agentConnect.domainTitles}
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
        <GuidedTourOverlay tour={tour} canvasAnchorRef={tourAnchorRef} />
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
