"use client";

import Image from "next/image";
import { withBasePath } from "@/shared/lib/base-path";
import { useHeldValue, useSurfaceSwap } from "@/shared/lib/use-presence";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import { requestSettingsView } from "@/shared/lib/settings-view-intent";
import { subscribeAgentChatIntent } from "@/shared/lib/agent-chat-intent";
import { isGuardedRuntime } from "@/features/acp-session/model/runtime-gate";
import { agentChatDoor } from "../model/agent-chat-door";
import { AcpChatPanel, AcpChatResizeHandle, useChatWidth } from "@/widgets/acp-chat-panel";
import { vaultMcpServers, vaultSelfReadSlot } from "@/features/acp-session/model/vault-mcp-server";
import { useChatSuggestions } from "@/features/acp-session/model/use-chat-suggestions";
import { cn } from "@/shared/lib/cn";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
// `History as HistoryIcon` — 전역 DOM History 생성자와의 충돌 원천 차단
// (사용성 검수 P0, AtlasGitPanel 과 동일 처방).
import { Compass, FolderOpen, HelpCircle, History as HistoryIcon, MessageCircle, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { RecentChangesNeedsVaultDialog, useAdaptiveRecentChanges, useOntologyInsight, useVaultConceptFacts, useVaultDocFreshnessIndex } from "@/features/vault-ontology";
import {
  useAgentServer,
  useLocalVault,
  VaultOpenGuideSheet,
} from "@/features/docs-vault-local";
import {
  FirstRunReadout,
  SampleNodeHint,
  readFirstRunStarterDismissed,
  useFirstRunSampleModeSettled,
  writeFirstRunStarterDismissed,
} from "@/features/first-run-starter";
import { VAULT_START_STEPS_DISMISSED_KEY } from "@/widgets/topology-controls";
import { useNavRailContextHrefs, useNavRailSettingsSlot } from "@/widgets/app-nav-rail";
import dynamic from "next/dynamic";
import { ProjectDrawer } from "@/widgets/project-drawer";
import { SearchHint } from "@/widgets/search-hint";
// 지도 오른쪽 세로 도크. 지도와 같은 flex row 안에 있어야 폭 애니메이션 하나가
// 두 컬럼을 함께 움직인다 — "자리를 내줬다" 로 읽히는 이유.
const VaultAgentPanel = dynamic(
  () => import("@/widgets/vault-agent-panel").then((m) => m.VaultAgentPanel),
  { ssr: false },
);
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { useAudiencePlain } from "@/shared/lib/audience-preference";
import { useCanvasBackground, useExpand, useFootprint, useGlyphSet, useMapArrangement, useView3d } from "@/shared/lib/appearance-preferences";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";
// Bare `?p=` miss grace window — see the deeplinkMissNotifiedRef effect
// below (`../lib/deeplink-miss-notice.ts`) for why this exists.
const DEEPLINK_MISS_GRACE_MS = 4000;
// 지난 길 저장 디바운스 — 걸음마다 사용자 디스크에 쓰지 않도록 잠깐 모은다.
// 짧게 잡는다: 여기서 기다린 시간만큼 "창을 바로 닫으면 마지막 걸음이 빠질"
// 구간이 생긴다(탭 숨김 시 앞당기기로 한 번 더 줄인다).
const PAST_TRAIL_SAVE_DEBOUNCE_MS = 600;

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
const VaultStartSteps = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.VaultStartSteps),
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
// perf sweep 2026-07 — `FullDetailA1` is the opt-in "전체 상세" overlay
// (design.md: full-bleed detail is opt-in, never the click default), so like
// the other overlay widgets above it has no business in the first-load
// bundle. It statically imported `react-markdown` (+ `remark`), which alone
// measured ~129KB gzip and was shipping to EVERY visit of `/`/`/topology`
// even for users who never open a full-detail card. `buildFullDetailGroups`/
// `buildFullDetailReachModel` are plain data-shaping functions (no
// ReactMarkdown dependency) and stay regular imports — but they now live in
// `../model/use-full-detail-a1-model.ts` with the model they build, and that
// hook only calls them **while the card is open** (D4 처방 2026-07-28: 닫힌
// 표면의 파생이 클릭 프레임을 먹고 있었다). 청크 예열과 모델 파생은 다른
// 것이다 — 예열은 값이 싸고 등장 프레임을 지키지만, 파생 예열은 클릭
// 프레임에 값을 청구한다.
// 청크를 **미리 당길 수 있게** import 를 이름 있는 함수로 둔다 — 번들러가
// 모듈 promise 를 캐시하므로 예열 후의 재호출은 즉시 끝난다. 여기서 `dynamic`
// (React.lazy + Suspense)을 쓰지 않는 이유도 같은 결이다: lazy 는 청크가
// 캐시돼 있어도 첫 렌더에서 한 번 서스펜드하므로 **배경과 내용이 다른
// 커밋에 실린다** — 실측에서 배경이 먼저 칠해지고 83ms 뒤 내용이 팝했다.
// 해결된 컴포넌트를 상태로 들고 있으면 둘이 같은 커밋에 실린다.
// 왜 예열하는가는 아래 `FullDetailCard` 주석.
const importFullDetailA1 = () => import("@/widgets/full-detail-a1");
type FullDetailA1Component = Awaited<ReturnType<typeof importFullDetailA1>>["FullDetailA1"];
import { GestureHint } from "@/widgets/gesture-hint";
import { ChromeChip, LiveAnnouncer, Surface, Tooltip, controlClass, useToast } from "@/shared/ui";
import { resolveToastBottomOffsetForStack } from "@/shared/ui/toast-position";
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
  getProjectRuntimeDetailHref,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref, buildNewNodeDoc } from "@/entities/docs-vault";
import {
  buildOntologyStudioNodeHrefFromGraphId,
  buildChatNodeIndex,
  buildOntologyStudioEdgeHref,
  buildOntologyHealthSignals,
  buildOntologyInsightsReturnHref,
  edgeAuthoredByFromNode,
  resolveNodeDocument,
  resolveNodeAgentTarget,
  studioEditRelationForEdgeType,
  useRelationVocabulary,
} from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import { copyHandoffWithFeedback } from "../lib/copy-handoff-with-feedback";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source-receipt";
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
import { useFullDetailA1Model } from "../model/use-full-detail-a1-model";
import {
  projectSlugForSource,
  useProjectSourceModel,
} from "../model/use-project-source-model";
import { useUnboundProjectSource } from "../model/use-unbound-project-source";
import {
  selectTopologyNodeRouteState,
  selectTopologyPathRouteState,
  resolveTopologyNodeClickRouteState,
  toggleExpandedParent,
  limitExpandedParents,
  enterRealmRouteState,
  exitRealmRouteState,
  resolveRealmNodeId,
  buildContainmentParentMap,
  deriveDeeplinkAncestorExpansion,
  clearVaultScopedRouteState,
} from "../model/url-state";
import { useVaultIdentityScope } from "@/features/vault-scope";
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
import { resolveCanvasSelectedSlug } from "../lib/resolve-canvas-selection";
import {
  compactTopologyPanelTitle,
  resolveTopologyNodeTitle,
} from "../lib/resolve-topology-node-title";
import {
  canCopyTopologyPathPacket,
  resolveTopologyPathChipState,
} from "../lib/topology-path-chip-state";
import { shouldSuppressGlobalShortcuts } from "../lib/blocking-surface";
import { resolveAgentFocusNodeId } from "../lib/resolve-agent-focus-node";
import { useAgentWritingFocusSlug } from "../model/use-agent-writing-focus";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";
import { computeCanonicalCensus } from "@/shared/lib/ontology-tree/canonical-census";
import {
  nodeIntent,
  screenIntentFor,
  sentenceForIntent,
  type FirstWordsLabels,
  type ScreenContextSnapshot,
} from "@/features/vault-agent";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";
import { useAgentDockDefaultOpen } from "@/shared/lib/use-agent-dock-default";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { buildAgentAnalyzePrompt } from "@/shared/config/agent-prompts";
import { resolveToastRightOffset } from "@/shared/ui/toast-position";
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/right-dock-reserve";

import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { buildNavRailContextHrefs } from "../lib/nav-rail-context-hrefs";
import { restoreTopologyFocusAfterDatasheetClose } from "../lib/topology-focus-return";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import { OntologyBootstrapForm } from "./OntologyBootstrapForm";
import {
  AgentConnectSheet,
  consumeAgentConnectRouteIntent,
  useAgentConnectLauncher,
} from "@/widgets/agent-connect";
import { TopologyV2EdgePanel } from "@/widgets/topology-map-v2/ui/TopologyV2EdgePanel";
import { PLAIN_TIER_REVEAL } from "@/widgets/topology-map-v2/model/tier-visibility";
import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { replaceVaultBody } from "@/shared/lib/replace-vault-body";
import {
  TopologyMapV2,
  TopologyV2ContextMenu,
  TopologyV2DetailPanel,
  TopologyV2EdgeHoverCard,
  TopologyV2ClusterHoverCard,
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
  refreshIndexDependentTokens,
} from "@/widgets/topology-map-v2";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
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
import { TopologyTrailChip, type TopologyPastWalkRow } from "./TopologyTrailChip";
import {
  appendFootprintVisit,
  collapseFootprintTrail,
  formatFootprintTrailAgentPacket,
  type FootprintTrailEntry,
} from "../lib/footprint-trail";
import {
  describePastTrailDay,
  newPastWalkId,
  refinePastWalkEntries,
  PAST_WALK_MIN_ENTRIES,
  type PastWalk,
} from "../lib/past-trail-record";
import {
  acpHeartbeatAgentName,
  buildAcpTurnHeartbeat,
  createVaultAcpHeartbeatStore,
  type AcpHeartbeatStore,
} from "../lib/acp-agent-heartbeat";
import { createVaultFilePastTrailStore, type PastTrailStore } from "../lib/past-trail-store";
import { verifyHandlePermission } from "@/entities/local-fs-handle";
import { TopologyInsightsReturnChip } from "./TopologyInsightsReturnChip";
import { TopologyRelationLegend } from "./TopologyRelationLegend";
import { AgentActivityChip } from "@/features/agent-activity";
import { FrameMeter } from "@/shared/ui/frame-meter";
import { TopologyChangeAnnouncement } from "./TopologyChangeAnnouncement";
import { TopologyNoMatchesState } from "./TopologyNoMatchesState";
import { resolveTopologyEscLadderAction } from "../lib/topology-esc-ladder";
import {
  GuidedTourOverlay,
  canAutoStartGuidedTour,
  readGuidedTourStatus,
  resolveAnchorRect,
  useGuidedTour,
  useGuidedTourAutoStartReady,
  useRegisterGuideReplay,
  watchGuidedTourAutoStartCancel,
  readGuideAutoStart,
  type TourAnchor,
} from "@/features/guided-tour";
import { resolveTourAnchorNodeId } from "../lib/resolve-tour-anchor-node";



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
/**
 * ── 부팅 렌더 게이트 (2026-08-19 실측) ──────────────────────────────────
 *
 * `/ko/topology/` 첫 진입의 단일 최대 long task 는 **이 뷰의 첫 클라이언트
 * 렌더+커밋 하나**였다 — CPU 4배 스로틀 기준 324~335ms(수술 전 실측). lazy
 * 경계의 초기 렌더는 동기 레인이라 6,000줄 트리 전체가 한 태스크로 돈다.
 *
 * 처방: 첫 클라이언트 커밋은 **화면에 이미 있는 서버 폴백(MapEntryFallback)의
 * DOM 을 그대로 복제**해 픽셀 변화 없이 끝내고(수 ms), 본체는 이어지는
 * `startTransition` 에서 렌더한다 — 전이 레인은 ~5ms 마다 양보하므로 큰
 * 렌더가 여러 작은 태스크로 갈라지고, 화면에 보이는 순서는 종전과 같다:
 * 폴백 → (동일한 폴백) → 완성된 페이지.
 *
 * 왜 복제이고 재구현이 아닌가: `MapEntryFallback` 은 서버 컴포넌트라 여기서
 * 렌더할 수 없고, 마크업을 손으로 베끼면 두 벌이 어긋나는 순간 화면이 바뀐다.
 * 문서에 이미 서 있는 실물 `outerHTML` 을 그대로 쓰면 구조적으로 어긋날 수
 * 없다. 클라이언트 내비게이션 등으로 폴백 DOM 이 없으면(널) 게이트 없이
 * 종전 경로 그대로 간다 — 이 최적화는 콜드 부트에만 뜻이 있다.
 *
 * SSG 는 `window` 가 없어 곧장 본체로 가고, 본체는 종전대로 `useSearchParams`
 * 에서 서스펜드해 폴백이 HTML 에 구워진다 — 내보낸 문서는 바이트 그대로다.
 */
export function HomePage() {
  // lazy initializer — 첫 렌더(커밋 전)의 문서에는 서버 폴백이 아직 서 있다.
  const [fallbackHtml] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return document.querySelector('[data-testid="map-entry-fallback"]')?.outerHTML ?? null;
  });
  const [bootRenderReady, setBootRenderReady] = useState(false);
  useEffect(() => {
    startTransition(() => setBootRenderReady(true));
  }, []);
  if (!bootRenderReady && fallbackHtml !== null && fallbackHtml !== "") {
    return (
      <div
        style={{ display: "contents" }}
        // 같은 문서가 방금 그린 자기 폴백의 복제(위 독블록) — 외부 입력이 아니다.
        dangerouslySetInnerHTML={{ __html: fallbackHtml }}
      />
    );
  }
  return <HomePageImpl />;
}

function HomePageImpl() {
  const t = useTranslations('topology');
  const siteT = useTranslations('metadata');
  // 어권별 이름 입력(create composer) 계약의 '지금 화면 언어'.
  const activeLocale = useLocale();
  const tKinds = useTranslations('kinds');
  const tTopologyKeyboardWalk = useTranslations('topologyWidgets.keyboardWalk');
  const tAgentConnect = useTranslations('agentConnect');
  // P2 결함⑤ — <lg 기록 chrome-tile 진입점의 aria-label/title (`atlasGit`
  // 네임스페이스는 이미 `GitStatusTile` 이 쓰는 것과 같은 키를 재사용한다).
  const tAtlasGit = useTranslations('atlasGit');
  const relationVocabulary = useRelationVocabulary();
  // 슬라이스 C — lazy initializer 는 클라이언트에서만 실제 실행(SSR 은 항상
  // false), 클라이언트 hydration 도 localStorage 없는 서버 프리렌더 기준
  // false 와 같아 hydration mismatch 없음(다른 세션 플래그와 같은 패턴).
  // #65 — 공용 스토어로 승격. 셸(레일 하단 기록 타일)도 같은 값을 읽으므로
  // 각자 localStorage 를 읽던 구조를 없앴다 — 설정에서 바꾸면 지도와 레일이
  // 함께 바뀐다.
  const [audiencePlain, setAudiencePlain] = useAudiencePlain();
  // Phase 5 #20/#21 — 개인화 설정(설정 시트에서 변경). 캔버스 배경 세트와 노드
  // 아이콘 세트를 앱 전역 스토어에서 읽어 지도 캔버스에 내려보낸다. DOM 글리프는
  // 같은 스토어를 스스로 구독하므로 두 표면이 lockstep 으로 스왑된다.
  const canvasBackground = useCanvasBackground();
  // 3D 보기 (2026-08-18, 옵트인) — 지도를 kind 동심 링의 돔으로 보는 뷰 모드.
  // 토글 칩(SearchHint)이 같은 스토어를 스스로 구독하므로 lockstep 이다.
  const view3d = useView3d();
  /** 3D 돔의 방위를 무엇이 정하나 — 「소유」/「결합」(`MapArrangement` 독블록). */
  const mapArrangement = useMapArrangement();
  const footprint = useFootprint();
  const glyphSet = useGlyphSet();
  // 확장 설정(펼치기 표시 · 배치 · 세 숫자) — 같은 스토어, 같은 lockstep.
  const expand = useExpand();
  // 슬라이스 C — 지도 표면의 관계 어휘 레지스터. 비개발(plain) 모드는
  // 데이터시트와 같은 plain 레지스터로 통일.
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  /*
   * 빵부스러기가 **퇴장 창 동안에도 자기 내용을 그리게** 붙든다 — 안 붙들면
   * 스택이 비는 순간 필(pill)만 남고 안이 텅 빈 채로 사라진다(등장/퇴장을
   * 붙이려던 것이 더 나쁜 화면이 되는 그 실패). 키는 스택 자체다 — 배열은
   * 매 렌더 정체성이 바뀌므로 원시값으로 눌러 둔다.
   */
  const heldLocalGraphStack =
    useHeldValue(localGraphStack.length > 0 ? localGraphStack : null, localGraphStack.join('>')) ??
    [];
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
  /* 경보 문구도 퇴장 창 동안 붙든다 — 원시값이라 키가 필요 없다. */
  const heldProjectsError = useHeldValue(projectsError);
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
  /**
   * 에이전트 패널 — 지도 오른쪽에 자리를 내주는 세로 도크.
   *
   * 한-번에-하나: 패널이 열리면 검색 팔레트와 개념 작성기는 물러난다. 셋 다
   * 지도 위에서 주의를 요구하는 표면이라 겹치면 무엇이 주 표면인지 사라진다.
   */
  const [vaultAgentOpen, setVaultAgentOpen] = useState(false);
  /**
   * 처음부터 열어 둘 것인가 — 설치 앱 + 키가 있을 때만 참이다(`null` 은 아직
   * 모름). 소유자 요구는 "시야로 보이면서" 인데, 키 없는 컴퓨터에서 잠긴
   * 패널을 상주시키면 요구의 글자만 지키고 뜻은 어긴다.
   */
  const agentDockDefaultOpen = useAgentDockDefaultOpen();
  /**
   * 사용자가 한 번이라도 직접 여닫았으면 그 뜻이 기본값을 이긴다. 안 그러면
   * 닫은 도크가 키 조회 한 번에 다시 열려 "닫기가 안 먹는" 것으로 읽힌다.
   */
  const agentDockTouchedRef = useRef(false);
  /*
   * ⚠️ 스스로 여는 것은 **문 하나**(`openAgentChat`)를 탄다 — 그 문이 「코딩
   * 에이전트냐 API 키냐」를 정하므로, 여기서 갈래를 다시 고르면 두 대화창이
   * 같이 뜬다(2026-08-16 소유자 실보고: *"대화창 하나만 쓰자"*). 그 함수는
   * 실행기 상태를 읽어야 해서 이 아래에 있고, 이 효과도 거기 붙어 있다.
   */
  /**
   * 바깥에서 건너온 첫 마디(S7). 여기 실리는 것은 **문장 하나**뿐이고, 전송은
   * 하지 않는다 — 패널의 입력칸에 앉을 뿐이라 사용자가 고쳐 보내거나 지울 수
   * 있다. `nonce` 는 같은 문장을 다시 눌러도 다시 앉게 하는 값이다.
   */
  const [vaultAgentPrefill, setVaultAgentPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
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

  /**
   * 방향키로 갈 곳이 없을 때 — 스스로 사라지는 안내 한 줄.
   *
   * 소유자: *"이동할 연관 노드가 없습니다 … 조금 보여지다 자동으로 사라지게"*.
   * 새 표면을 만들지 않고 이미 있는 토스트를 쓴다 — 지도 위에 안내 상자를 새로
   * 세우면 위치·토큰·모션을 다 정해야 하고 그건 혼자 정할 규격이 아니다.
   * 연타 걸러 내기는 위젯이 한다(`shouldAnnounceDeadEnd`).
   */

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
    insightsReturnReviewId,
    expandedParents: expandedParentSlugs,
    realmSlug,
    recentWindow,
  } = routeState;
  const renderProjects = projects;
  // 밀도 게이트 (fable 설계) — URL `?open=` 의 부모 slug 목록을 Set 으로
  // 변환해 지도로 내린다. 문자열 join 을 dep 으로 써 안정적으로 메모.
  // **딥링크도 사용자의 상한을 받는다** (2026-08-02 실측 defect). `?open=` 파싱은
  // 순수 함수라 설정을 모르고 기본값 3 을 쓴다 — 그래서 「동시에 펼쳐 둘 부모」를
  // 1 로 내려 둔 사람이 링크 하나로 셋을 받았다(실측: maxOpen=1 인데 부모 3개가
  // 펼쳐진 채 82노드). 클릭 경로만 상한을 지키면 그건 상한이 아니다. 뒤쪽을
  // 남기는 방향은 `toggleExpandedParent` 의 LRU 축출과 같다(나중에 적힌 것이 더
  // 최근 의도다).
  const expandedParentsKey = limitExpandedParents(expandedParentSlugs, expand.maxOpenParents).join(",");
  const expandedParentSet = useMemo(
    () => new Set(expandedParentsKey ? expandedParentsKey.split(",") : []),
    [expandedParentsKey],
  );
  // 밀도 게이트 — 클러스터 칩 클릭 → 해당 부모 확장 토글(URL 왕복). 노드
  // 선택/포커스 상태는 건드리지 않는다(칩은 접힘/펼침만 담당).
  const handleToggleCluster = useCallback(
    (parentId: string) => {
      setRouteState((current) => ({
        ...current,
        // 상한은 설정(「확장 → 동시에 펼쳐 둘 부모」)이 정한다. 넘치면 여기서
        // 가장 오래 펼쳐 둔 것이 닫힌다 — 클릭이 아무 일도 안 하는 상태를
        // 만들지 않는다(`toggleExpandedParent` 주석).
        expandedParents: toggleExpandedParent(
          current.expandedParents,
          parentId,
          expand.maxOpenParents,
        ),
      }));
    },
    [setRouteState, expand.maxOpenParents],
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
  /*
   * 아직 아무것도 없는 지도에서는 INDEX 를 접어 둔다 (2026-08-16 소유자 실보고,
   * *"처음 시작하면 왼쪽 index 는 닫혀 있어야 할 듯"*).
   *
   * INDEX 는 「개념 목록」이라 개념이 0개면 **담을 것이 없다** — 실제로 그
   * 화면에는 「일치하는 개념이 없습니다」한 줄만 있고, 그 한 줄이 화면 왼쪽
   * 3분의 1을 가진 채 정작 이때 유일하게 할 일이 적힌 시작 체크리스트를
   * 오른쪽으로 밀어내고 있었다. 위 선택-중 강등과 같은 구조다: **저장된
   * 선호는 건드리지 않는 세션 강등**이라, 개념이 하나라도 생기면 원래대로
   * 돌아오고 사용자가 직접 펼치면 그쪽이 이긴다.
   */
  const [indexManualExpandWhileEmpty, setIndexManualExpandWhileEmpty] = useState(false);
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
  // 기록(GitStatusTile)이 vault 경로와 세션 changeset 을 읽어야 해서다.
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — the analysis rail owns the slot only because of a non-overview
  // mode (focus/path/health), so returning to overview is always enough.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    // C — 선택 중 수동 전개는 그 선택 동안 자동 강등을 이긴다 (선택 해제
    // 시 리셋; 비선택 상태에선 무해한 no-op 플래그).
    setIndexManualExpandDuringSelection(true);
    // 빈 지도 강등도 같다 — 직접 펼쳤으면 그 뜻이 이긴다. 이 줄이 없으면
    // 탭이 눌리는데 아무 일도 안 일어난다(강등이 매 렌더 다시 접는다).
    setIndexManualExpandWhileEmpty(true);
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
  const vault = useLocalVault();
  const tAgent = useTranslations("vaultAgentPanel");
  // 브리지가 없으면(웹 빌드) 버튼도 패널도 그리지 않는다 — 열리지 않을 문을
  // 그려 두는 것이 정직 강등의 반대다.
  const llmBridgeAvailable = isLlmChatBridgeAvailable();
  /** 첫 마디가 지목할 빈칸의 근거 — 패널·인사이트 큐가 읽는 것과 같은 사실 map. */
  const vaultConceptFacts = useVaultConceptFacts();
  const { insight: ontologyInsight } = useOntologyInsight();
  // S-C1 — 노드 데이터시트 "언제 바뀌었나" (mode-aware manifest updatedAt).
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  // P4a — "최근 변경" 렌즈(mtime 창). `computeRecentChanges` 순수 함수 +
  // 이 훅과 같은 session-snapshot 시각 규율(`use-recent-changes.ts`).
  // 스포트라이트 (협의회 2026-07-23): `?recent=` 숫자 프리셋이면 그 창으로
  // 고정, "auto"/off 면 기존 적응 사다리 — 지도 침강과 INDEX 렌즈가 이 훅
  // 하나(단일 진실원)를 공유한다.
  const spotlightOn = recentWindow !== null;
  /*
   * 렌즈를 켜거나 기간을 바꾼 **순간**에만 카메라를 강조 노드로 맞춘다
   * (2026-08-02 소유자 지적 — 창을 좁혀도 화면이 그대로였다).
   *
   * 값이 아니라 **사건**을 넘긴다: 지도는 `spotlightIds` 를 매 프레임 읽으므로
   * 그것만으로는 "방금 바뀌었다"를 알 수 없고, 매 프레임 맞추면 사람이 그 뒤에
   * 잡아둔 화면을 계속 뺏는다.
   */
  /*
   * 사건 카운터 — 렌더 중 `Date.now()` 를 부르지 않는다. lint 가 잡았고
   * 규칙이 맞다: 렌더는 순수해야 하고, 시계를 읽으면 같은 입력에 다른 출력이
   * 나온다(React 가 렌더를 버리고 다시 할 수 있다).
   *
   * 필요한 성질은 「시각」이 아니라 **「달라졌다」** 뿐이므로 단조 증가 카운터로
   * 충분하다. 렌즈·기간이 바뀐 렌더에서만 올라간다.
   */
  const [spotlightFitToken, setSpotlightFitToken] = useState(0);
  useEffect(() => {
    setSpotlightFitToken((n) => n + 1);
  }, [recentWindow, spotlightOn]);
  const recentChanges = useAdaptiveRecentChanges(
    spotlightOn && recentWindow !== "auto" ? recentWindow : undefined,
  );
  /*
   * 샘플에서 이 칩을 누르면 **막다른 곳 대신 길**을 준다 (2026-08-03 소유자 지시:
   * *"칩 누르면 뭔가 화면에서 팝업 띄워줘야 하지 않을까? … 화면 중앙에 예쁜 팝업
   * 띄워서 폴더 세팅 유도하던지?"*).
   *
   * **두 빈 상태를 가른다.** 내 폴더를 연 사람에게 최근 변경이 0이면 그건 진짜로
   * 보여줄 게 없는 것이라 비활성 + 툴팁 그대로다 — 「아무것도 없다」를 말하려고
   * 모달을 여는 것은 여전히 기각이다(2026-08-02, popup soup). 샘플은 다르다:
   * 여기서 0인 이유는 **샘플의 날짜가 이 저장소가 픽스처를 마지막으로 건드린
   * 시각**이라 사용자와 무관하다는 것이고, 기다린다고 켜지지 않는다. 사유가
   * 「없음」이 아니라 「다음 행동」이면 다음 행동을 줘야 한다.
   */
  const [recentNeedsVaultOpen, setRecentNeedsVaultOpen] = useState(false);
  /** 샘플에서 「이어서 새로 만들기」를 눌렀을 때 — 막다른 곳 대신 폴더로 가는 길. */
  const [createNeedsVaultOpen, setCreateNeedsVaultOpen] = useState(false);
  const spotlightNeedsVault = vault.status !== 'loaded';
  const handleToggleSpotlight = useCallback(() => {
    if (spotlightNeedsVault) {
      setRecentNeedsVaultOpen(true);
      return;
    }
    setRouteState((current) => ({
      ...current,
      recentWindow: current.recentWindow === null ? "auto" : null,
    }));
  }, [spotlightNeedsVault, setRouteState]);
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
  /**
   * **볼트가 바뀌면 볼트 전용 주소 상태를 걷어낸다** — 「범위를 넘긴 상태」의
   * 원인 치료 (2026-08-01, `?slug=` 문서함 수리와 같은 문법).
   *
   * `?p=` · `?pathFrom=` 같은 키의 값은 **한 볼트 안에서만 뜻이 있는 이름**인데
   * 주소는 볼트를 모른다. 그래서 사용자가 폴더를 바꾸거나 샘플↔내 볼트를
   * 오가면 그 이름은 의미를 잃는데 아무도 걷어내지 않아 눌어붙었고, 지도는
   * 없는 노드를 선택된 것으로 판정해 **통째로 흐려졌으며**, 경로 칩은 없는
   * 노드 둘을 놓고 「경로 없음」이라고 단언했다.
   *
   * 첫 마운트는 건너뛴다 — 그때의 `?p=` 는 잔재가 아니라 **누군가 준 것**이다
   * (딥링크 · 에이전트 핸드오프 · 북마크). 그건 지울 게 아니라 아래 미해석
   * 토스트가 정직하게 말해야 할 대상이다.
   *
   * 토스트의 「한 번만」 기억도 같이 비운다. 그게 없으면 A→B→A 로 돌아왔을 때
   * 같은 슬러그가 이번엔 진짜로 없는데도 화면이 **완전히 침묵한다**.
   */
  const vaultIdentity = useVaultIdentityScope();
  const vaultIdentityRef = useRef<string | null>(null);
  /**
   * "없다" 를 진단해도 되는 시점인가 — 미해석 토스트와 캔버스 포커스 판정이
   * **같은 신호**를 봐야 한다. 둘이 갈리면 화면은 유령을 포커스한 채로 있는데
   * 토스트만 "없다" 고 말하는(또는 그 반대의) 상태가 생긴다.
   */
  const deeplinkSourceReady =
    vault.restoreAttempted &&
    (vault.status === "idle" ||
      vault.status === "loaded" ||
      vault.status === "unsupported");
  /**
   * ⚠️ **정착하기 전의 범위는 범위가 아니다.** 첫 렌더는 아직 볼트를 복원하기
   * 전이라 `sample:...` 로 보인다. 그 값을 "앞 볼트" 로 기록하면, 저장된 폴더가
   * 복원되는 순간이 **볼트 전환으로 오인**돼 사용자가 준 딥링크(`?p=`)를
   * 지워버린다 — 실측(2026-08-01 브라우저 재현): 진짜 노드를 가리키는 주소로
   * 새로고침했더니 `?p=` 가 그 자리에서 사라졌다. 그래서 `deeplinkSourceReady`
   * 가 참이 된 뒤의 값만 센다.
   */
  useEffect(() => {
    if (!deeplinkSourceReady) return;
    const previous = vaultIdentityRef.current;
    vaultIdentityRef.current = vaultIdentity;
    if (previous === null || previous === vaultIdentity) return;
    deeplinkMissNotifiedRef.current = null;
    setRouteState(clearVaultScopedRouteState, { replace: true });
  }, [deeplinkSourceReady, vaultIdentity, setRouteState]);
  useEffect(() => {
    const decision = resolveDeeplinkMissDecision({
      selectedSlug,
      hasOntologyMatch: Boolean(selectedOntologyNode),
      hasProjectMatch: Boolean(selectedProject),
      projectsLoaded: projectsQuery.loaded,
      sourceReady: deeplinkSourceReady,
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
  }, [
    selectedSlug,
    projectsQuery.loaded,
    ontologyInsight,
    selectedProject,
    selectedOntologyNode,
    deeplinkSourceReady,
    toast,
    t,
  ]);
  // S1.1 — 토폴로지를 온톨로지의 1차 편집 surface 로. writable 로컬 vault 면
  // 선택 노드를 자기 .md 문서로 해석해 전체 상세(A1)의 본문 인라인 편집을 허용.
  // 기록(Atlas Git) 패널 — 레일 타일 클릭으로 열리는 스냅샷/히스토리 표면.
  // #65 — 기록 패널은 셸 소유. `<lg` 크롬 타일은 같은 런처로 그 패널을 연다.
  // Tauri 데스크톱이면 vault 절대 경로(브리지 활성), 웹 FSA 핸들이면 null →
  // 타일/패널이 세션 changeset 기반으로 정직하게 강등한다.
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const handoffSource: "loaded-vault" | "read-only-sample" =
    vault.status === "loaded" ? "loaded-vault" : "read-only-sample";
  // 레일 하단 설정 슬롯 — 지도 전용 화면 상태(screenControls)를 실어야 해서
  // 이 페이지만 셸 기본 슬롯을 덮어쓴다. 기록 타일은 #65 에서 셸(AppShell)로
  // 올라갔다 — 페이지마다 등록해야 하는 구조가 하단 유틸 티어를 1/2/3 개로
  // 갈라놓은 원인이었다.
  const navRailSettingsSlot = useMemo(
    () => (
      <>
        {/* 설정 통합 2026-07-24 — 구 "지도 설정" 팝오버(TopologyV2SettingsGear)
            폐지. 톱니는 이제 단일 설정 시트(AppSettingsMenu)를 연다. 지도
            전용 화면 상태(보기 모드·INDEX 기본 상태)는 screenControls 로
            주입 — 미주입 페이지(빌더 등)에선 해당 행이 없다. 시트는 scrim
            동반 모달이라 구 기어의 suppressed(transient 상호배제) 신호가
            더는 필요 없다(⌘K demote 는 시트가 자체 처리). */}
        <AppSettingsMenu
          mode={vault.status === 'loaded' ? 'local' : 'static'}
          triggerVariant="rail-tile"
          screenControls={{
            audiencePlain,
            onAudiencePlainChange: setAudiencePlain,
            indexCollapsed: indexPanelCollapsedStored,
            onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
          }}
        />
      </>
    ),
    [
      indexPanelCollapsedStored,
      handleChangeIndexDefaultCollapsed,
      audiencePlain,
      setAudiencePlain,
      gitVaultPath,
      ontologyChangeset,
      vault.status,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // 온보딩 디자이너 지적 — 첫 실행 카드를 닫으면 "폴더 열기" 진입점이 설정
  // 기어 뒤로 사라졌다. 정적 샘플 모드(카드 dismiss 와 무관)일 때 상단 유틸리티
  // 열에 조용한 "내 데이터로 전환 ⌘O" 필을 상시 노출하고, 실제 vault 가
  // 연결되면 게이트가 꺼져 자동 소멸한다(카드 dismiss 축과 독립).
  const sampleModeSettled = useFirstRunSampleModeSettled();
  // 진입 검수 E-1c — 크롬 「내 데이터로 전환」과 ⌘O 는 미지원 브라우저(Safari·
  // Firefox)에서 `vault.open()` 을 불러 아무 일도 일어나지 않았다. 상태만 조용히
  // 'unsupported' 로 바뀌고, 첫 실행 카드를 이미 닫은 사람에게는 화면에 아무
  // 응답이 없었다(같은 버튼을 계속 누르게 만드는 침묵). 못 하는 일이면 왜
  // 못 하는지와 갈 곳을 준다 — 카드가 쓰는 그 시트를 미지원 모드로 연다.
  const fsaUnsupported = vault.status === "unsupported";
  const [unsupportedGuideOpen, setUnsupportedGuideOpen] = useState(false);
  const requestVaultOpen = useCallback(() => {
    if (fsaUnsupported) {
      setUnsupportedGuideOpen(true);
      return;
    }
    void vault.open();
  }, [fsaUnsupported, vault]);
  // 자동 투어는 샘플/내 폴더 **양쪽** 정착을 다 받는다 — 예전 조건은 샘플만
  // 봐서 폴더를 고른 사용자가 투어를 못 받았다 (`use-auto-start-ready.ts`).
  const tourAutoStartReady = useGuidedTourAutoStartReady();
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
  // 둘째 소스(2026-08-13, 실시간 표시 3번 조각): 하트비트를 등록하지 않고 MCP 로만
  // 붙는 에이전트의 쓰기는 activity.jsonl 에만 남는다 — 쓰는-중 창(2분) 안이면
  // 그 마지막 대상이 같은 링을 받는다. 하트비트(의도 선언)가 있으면 그쪽이
  // 이긴다. 어느 쪽이든 실데이터 1노드 · 해석 실패는 조용히 무(無)다.
  const agentWritingSlug = useAgentWritingFocusSlug(vault.agentActivityLog);
  const agentFocusNodeId = useMemo(() => {
    const fromHeartbeat = hasFreshAgentHeartbeat
      ? resolveAgentFocusNodeId(
          agentActivityStatus?.heartbeat?.focus.ontologySlug ?? null,
          ontologyInsight?.nodes,
        )
      : null;
    return fromHeartbeat ?? resolveAgentFocusNodeId(agentWritingSlug, ontologyInsight?.nodes);
  }, [hasFreshAgentHeartbeat, agentActivityStatus, ontologyInsight, agentWritingSlug]);
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
    // Slice 6 — 공방 엣지 딥링크. 이 엣지가 공방의 네 편집 가능한 bearing 중
    // 하나이고(그 외 describes/도메인 멤버십은 null → 액션 미노출), 정말 `from`
    // 노드의 프론트매터에서 authored 됐을 때만 "이 관계 고치기" 딥링크를
    // 만든다. focal = 저자(`from`), 편집 카드는 `to` 위성에 열린다. 편집 불가면
    // null → EdgePanel 이 액션을 렌더하지 않는다(dead affordance 금지).
    const studioRelation = studioEditRelationForEdgeType(selectedEdge.relationType);
    const studioEditHref =
      studioRelation && edgeAuthoredByFromNode(selectedEdge.declaredBySlug, from.evidenceIds[0])
        ? buildOntologyStudioEdgeHref(from.id, to.id, studioRelation)
        : null;
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
      studioEditHref,
      why,
    };
  }, [selectedEdge, ontologyInsight, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister]);

  /**
   * 엣지 패널의 **열림**과 **내용**을 가른다 — 그래야 퇴장이 성립한다.
   * `open` 은 지금 열려야 하는가, `held` 는 퇴장 창 동안에도 그릴 내용이다.
   *
   * ★ `useHeldValue` 에 **키**를 넘긴다. 첫 시도에서 키 없이 넘겼다가 React
   * #301(무한 재렌더)로 지도가 죽었다 — `edgePanelModel` 은 `useMemo` 인데
   * 정체성이 매 렌더 새로 만들어져 정체성 비교가 끝없이 돌았다.
   */
  const edgePanelOpen = Boolean(edgePanelModel) && !selectedOntologyNode && !createNodeOpen;
  const edgePanelKey = selectedEdge ? `${selectedEdge.sourceId}→${selectedEdge.targetId}` : null;
  const heldEdgePanelModel = useHeldValue(edgePanelOpen ? edgePanelModel : null, edgePanelKey);
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
  // 번들 MCP 서버가 있는가 — 설정 스니펫·딥링크·연결 버튼이 전부 여기서 갈린다.
  const agentServer = useAgentServer();
  const agentConnect = useAgentConnectModel({
    agentActivityStatus,
    vaultHandle: vault.handle,
    serverAvailability: agentServer,
    insightNodes: ontologyInsight?.nodes ?? null,
    // 키는 top-level `agentConnect` 네임스페이스 (시트 위젯과 동일 출처) —
    // topology.* 의 t 로 읽으면 MISSING_MESSAGE (e2e 가 잡은 잠복 버그).
    defaultAgentLabel: tAgentConnect("defaultAgentLabel"),
  });
  // LNB(AppShell 상주) 에이전트 타일 → 전역 "열려는 의도". 어느 페이지에서
  // 눌렸든 지형도로 이동해 오면 레이아웃 상주 launcher 의 wantOpen 이 살아
  // 있어 여기서 시트를 연다. static-export/WebView 가 그 state commit 보다
  // 먼저 route 를 바꾸는 경우에는 일회성 URL marker 를 소비한다. openSheet 는
  // "N분 전" 기준 시각도 함께 스냅한다.
  const agentConnectLauncher = useAgentConnectLauncher();
  const agentConnectWantOpen = agentConnectLauncher.wantOpen;
  const requestAgentConnectOpen = agentConnectLauncher.open;
  const openAgentConnectSheet = agentConnect.openSheet;
  useEffect(() => {
    const arrivedFromGlobalTile = consumeAgentConnectRouteIntent();
    if (arrivedFromGlobalTile && !agentConnectWantOpen) {
      // 일부 static-export/WebView 전환은 layout provider 상태 commit 전에 새
      // route 를 마운트한다. URL marker 를 소비한 도착 화면이 launcher 의
      // aria-expanded/focus-return 계약까지 다시 세워 전환 방식에 의존하지 않는다.
      requestAgentConnectOpen();
    }
    if (agentConnectWantOpen || arrivedFromGlobalTile) openAgentConnectSheet();
  }, [agentConnectWantOpen, openAgentConnectSheet, requestAgentConnectOpen]);
  // 폴더를 연 직후 AI 연결 시트를 **자동으로 열지 않는다**. 한때 1200ms 뒤
  // 1회 자동 발화가 있었지만, 방금 만든 자기 지도와의 첫 대면을 요청하지 않은
  // 모달이 덮어 첫 상호작용이 '닫기'가 됐다(2026-07-26 실측). 안내는 이미
  // 시작 체크리스트의 "연결 안내 열기" 버튼과 레일의 AI 타일 두 곳에 있어
  // 자동 발화가 더하는 값이 없고, "소개하는 것을 가리지 않는다"는 이 앱의
  // 규율과도 어긋났다. 연결 의도는 사용자가 누를 때만 선다.
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
    async (input: {
      title: string;
      kind: CreateNodeKind;
      domain?: string;
      localeLabels?: Record<string, string>;
    }) => {
      try {
        /*
         * **사람이 만든 노드**라고 적는다. 이 경로는 화면의 「개념 만들기」
         * 하나뿐이라 호출 경로가 행위자를 증명한다 — 원장이 요구하는
         * 「쓰기 시점 스탬프」의 조건이다. 이 한 줄이 없으면 방금 만든 노드가
         * 지도에서 검수 대기 링을 못 받는다(2026-08-03 실측).
         */
        const { slug, markdown } = buildNewNodeDoc({ ...input, createdBy: "human" });
        await vault.createDoc(slug, markdown);
        /*
         * **1일차의 싼 시험** (PO 카운슬 평결 ⑤, 2026-08-03).
         *
         * 소유자는 「노드가 지도에 나오면서 위치를 정하고 확대되는」 생성을
         * 원했다. 근거석이 그보다 싼 가설을 냈다 — 문제가 「모션이 없다」가
         * 아니라 **「만든 게 어디 갔는지 모른다」** 일 수 있다. 해자석이 2라운드
         * 에서 승복하며 *"싼 시험을 슬라이스 밖이 아니라 **앞**에 넣어라"* 고
         * 했고, 그래서 이 링크가 1일차다.
         *
         * **누르는지가 관측이다.** 자동 포커스로 만들면 훨씬 싸지만 시험 자체가
         * 사라진다 — 필요했는지 아무도 모르게 된다.
         *
         * 반증 조건: 이 링크를 눌러 보고도 「무엇에 붙었는지 모르겠다」가 나오면
         * 부착 표시가 필요했던 것이고, 안 나오면 나머지 날은 반납한다.
         */
        const tail = slug.includes("/") ? slug.slice(slug.lastIndexOf("/") + 1) : slug;
        toast.show(t("createNode.toastSaved", { slug }), "success", {
          label: t("createNode.toastSavedAction"),
          onClick: () =>
            setRouteState((current) => ({
              ...current,
              selectedSlug: `${input.kind}:${tail}`,
            })),
        });
        closeCreateNode();
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      }
    },
    [closeCreateNode, vault, toast, t, setRouteState],
  );
  // #8 평문화 — "개념 추가" 도메인 피커 옵션. 자유 입력 slug 대신 기존 도메인
  // 노드를 이름으로 고른다. value = bare tail-slug(`domain:auth` → `auth`),
  // 저장 시 buildNewNodeDoc 이 canonicalizeDomainRef 로 한 번 더 정규화한다.
  const createNodeDomainOptions = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        .filter((node) => node.kind === "domain")
        .map((node) => ({
          value: node.id.includes(":") ? node.id.slice(node.id.indexOf(":") + 1) : node.id,
          label: node.display ?? node.title,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [ontologyInsight],
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
          siteT('siteName'),
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

  /**
   * **유령 슬러그로는 포커스하지 않는다** (2026-08-01). 판정 근거와 이 자리의
   * 옛 결함은 `../lib/resolve-canvas-selection.ts` 주석에 있다 — 요약하면,
   * 없는 노드를 선택으로 넘기면 지도가 통째로 흐려지고 첫 방문 힌트가 영구
   * 소멸했다.
   */
  /**
   * **실재가 확인된 선택**. `canvasSelectedSlug` 는 아직 판정할 수 없는 동안
   * 원본 슬러그를 들고 있으므로(딥링크 깜빡임 방지), "노드를 정말 열어 봤다"
   * 를 물어야 하는 곳은 이쪽을 본다 — 그 판정이 **영구 기록**을 남길 때 특히.
   *
   * 실측(2026-08-01): 첫 방문 힌트가 `canvasSelectedSlug` 를 보고 있어서, 없는
   * 슬러그가 실린 링크로 들어오면 **판정이 확정되기 전 한 틱** 동안 참이 됐고
   * 그걸로 힌트가 localStorage 에 영구 소멸했다. 누른 적도 없는데 학습 완료로
   * 기록된 것이다.
   */
  /*
   * ⚠️ **캔버스가 원하는 것은 슬러그가 아니라 그래프 노드 이름이다**
   * (2026-08-17 소유자 보고로 발견).
   *
   * 노드 이름은 `${kind}:${슬러그}` 다(`derive-ontology-from-vault.ts`).
   * 그런데 프로젝트 딥링크는 접두사 없는 슬러그를 보낸다
   * (`topology-href.ts`: `kind: project` → `/topology/?p=<슬러그>`; 다른
   * 종류는 노드 이름을 그대로 보낸다). 그래서 **프로젝트만** 캔버스에서
   * 맞는 노드를 못 찾았고, 지도는 「하나 골랐는데 그게 어디에도 없네」를
   * 「전부 흐리게」로 번역했다 — 실측 1.40:1(도형 최저 3:1).
   *
   * 프로젝트도 다른 종류와 같은 규칙을 태운다. 그래프에 그 노드가 없으면
   * (컴파일이 프로젝트를 안 냈다면) 슬러그를 그대로 두되, 그때는 캔버스의
   * 안전망이 「안 고름」으로 떨어뜨린다 — 화면이 죽지 않는다.
   */
  const selectedProjectNodeId = useMemo(() => {
    if (!selectedProject) return null;
    const nodeId = `project:${selectedProject.slug}`;
    return ontologyInsight?.nodes.some((n) => n.id === nodeId) ? nodeId : selectedProject.slug;
  }, [selectedProject, ontologyInsight]);
  const resolvedSelectionSlug = selectedProjectNodeId ?? selectedOntologyNode?.id ?? null;
  const canvasSelectedSlug = resolveCanvasSelectedSlug({
    selectedSlug,
    resolvedSlug: resolvedSelectionSlug,
    sourceReady: deeplinkSourceReady,
    projectsLoaded: projectsQuery.loaded,
    ontologyLoaded: ontologyInsight !== null,
  });
  /** 지금 고른 노드의 그래프 원본 — 「이어서 새로 만들기」가 kind 를 본다. */
  /**
   * `created_by: human` 인 노드 집합 — INDEX 렌즈가 쓴다. 하나도 없으면 `null`
   * 이라 세그먼트 자체가 안 뜬다(볼트에 없는 것을 거를 칸은 만들지 않는다).
   */
  const humanAuthoredLens = useMemo(() => {
    const ids = new Set(
      (ontologyInsight?.nodes ?? [])
        .filter((node) => node.createdBy === "human")
        .map((node) => node.id),
    );
    return ids.size > 0 ? { ids } : null;
  }, [ontologyInsight]);

  const canvasSelectedGraphNode = useMemo(
    () =>
      canvasSelectedSlug
        ? (ontologyInsight?.nodes.find((n) => n.id === canvasSelectedSlug) ?? null)
        : null,
    [canvasSelectedSlug, ontologyInsight],
  );
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
    // replace — 이건 사용자의 이동이 아니라 *들어온 딥링크를 정규화*하는
    // 쓰기다. push 로 나가면 착지 직후 히스토리에 사용자가 만들지 않은 칸이
    // 생겨, 뒤로가기 첫 번째가 아무것도 되돌리지 못한다.
    setRouteState((current) => {
      const nextExpanded = deriveDeeplinkAncestorExpansion(
        canvasSelectedSlug,
        parentOf,
        current.expandedParents,
      );
      if (nextExpanded.length === current.expandedParents.length) return current;
      return { ...current, expandedParents: nextExpanded };
    }, { replace: true });
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
  /**
   * 타임라인·인계 패킷이 읽는 **접힌** 트레일 — 같은 노드의 마지막 방문만.
   * 원본(`footprintTrail`)은 되돌아온 걸음까지 담고 있어 지도의 순번을 만들지만,
   * 에이전트에게 같은 `get_concept` 을 세 번 주는 것은 정보가 아니라 소음이다.
   */
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of collapseFootprintTrail(footprintTrail)) {
      const node = footprintNodeLookup.get(id);
      if (!node) continue;
      // 인계 패킷에 박히는 이름은 캔버스 노드 id 가 아니라 볼트가 아는 이름.
      const target = resolveNodeAgentTarget(
        ontologyInsight?.nodes.find((n) => n.id === id),
      );
      entries.push({
        id,
        title: node.label,
        kind: node.kind,
        agentRef: target.ref,
        documented: target.documented,
      });
    }
    return entries;
  }, [footprintTrail, footprintNodeLookup, ontologyInsight]);
  /**
   * 지도로 내리는 방문 id 목록 — 삭제 노드만 걸러낸 **원본** 순서다(접지 않는다).
   * 지도만 반복 걸음을 필요로 한다: 순번(`buildFootprintSteps`)이 거기서 나오고,
   * 최근성 rank 는 어차피 마지막 등장으로 접힌다. 접힌 목록을 내려보내면
   * "3번 왔다"가 화면에서 다시 사라진다.
   */
  const footprintVisitedIds = useMemo(
    () => footprintTrail.filter((id) => footprintNodeLookup.has(id)),
    [footprintTrail, footprintNodeLookup],
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
  }, [footprintTrailEntries, dustySlugs, t]);
  // ── 지난 길 ──────────────────────────────────────────────────────────
  // 세션 궤적은 새로고침·창 닫기에서 죽는데 `?p=`(지금 여기)는 URL 로 살아남아,
  // "어디"는 남고 "어떻게 왔는지"만 사라지는 비대칭이 있었다. 지난 길은 그
  // 궤적을 잃지 않게 붙든다 — 살아있는 궤적을 끊는 자동 동작(시간 만료·유휴
  // 감지)은 없다. `지우기` 는 반대로 **남기지 않고 버린다**: "지우기"라는 이름이
  // 정직하려면 이미 쓰인 이번 세션 줄까지 함께 지워야 한다.
  //
  // 저장 위치는 **볼트 폴더 안 파일**이다(`past-trail-store.ts` 참고) — 웹과
  // 설치 앱은 다른 origin 이라 브라우저 저장소로는 같은 지난 길이 이어지지
  // 않고, 두 곳이 공유하는 바닥은 사용자의 볼트 폴더뿐이다.
  //
  // 볼트를 안 열었으면(샘플 탐색) 남기지 않는다 — 남길 바닥이 없고, 브라우저
  // 저장소로 대신 남기면 바로 그 웹/앱 분리가 되살아난다. 샘플 탐색은 휘발해도
  // 잃는 것이 없다.
  const pastTrailStore = useMemo<PastTrailStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultFilePastTrailStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const [pastWalks, setPastWalks] = useState<PastWalk[]>([]);
  // 쓰기 권한은 **묻지 않고 조회만** 한다 — 탐색하러 온 사람에게 "기록을
  // 남기려면 권한을 주세요" 를 들이미는 건 마찰이다. 이미 권한이 있는 세션에서만
  // 조용히 남기고, 없으면 남기지 않되 2층에서 왜 안 남는지는 답한다.
  const [pastTrailWritable, setPastTrailWritable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const handle = vault.status === "loaded" ? vault.handle : null;
    void (async () => {
      const granted = handle
        ? (await verifyHandlePermission(handle, "readwrite")) === "granted"
        : false;
      if (!cancelled) setPastTrailWritable(granted);
    })();
    return () => {
      cancelled = true;
    };
  }, [vault.status, vault.handle]);
  // 이번 세션의 길 id — 이 세션의 모든 기록이 이 id 로 덮어써진다(한 세션 = 한 줄).
  // ref 가 아니라 state 인 이유: 이 값이 2층 목록의 렌더(지금 걷는 줄 제외)에
  // 쓰이므로 렌더 중 읽을 수 있어야 한다.
  const [sessionWalkId, setSessionWalkId] = useState<string>(newPastWalkId);
  // 이벤트 핸들러(탭 숨김 등)에서 최신 값을 읽기 위한 거울.
  const pastTrailSaveRef = useRef<{
    store: PastTrailStore | null;
    entries: FootprintTrailEntry[];
  }>({ store: null, entries: [] });
  useEffect(() => {
    pastTrailSaveRef.current = {
      store: pastTrailWritable ? pastTrailStore : null,
      entries: footprintTrailEntries,
    };
  }, [pastTrailStore, pastTrailWritable, footprintTrailEntries]);
  const flushPastTrail = useCallback(() => {
    const { store, entries } = pastTrailSaveRef.current;
    if (!store || entries.length < PAST_WALK_MIN_ENTRIES) return;
    void store.save(sessionWalkId, entries).then(setPastWalks);
  }, [sessionWalkId]);
  // 볼트가 바뀌면 노드 id 체계가 달라진다 — 새 길로 시작하고 그 볼트의 목록을 읽는다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const walks = pastTrailStore ? await pastTrailStore.list() : [];
      if (cancelled) return;
      setSessionWalkId(newPastWalkId());
      setPastWalks(walks);
    })();
    return () => {
      cancelled = true;
    };
  }, [pastTrailStore]);
  // **걸으면서 제자리에 덮어쓴다.** 파일 쓰기는 비동기라 페이지가 죽는 순간에
  // 시작하면 끝나지 않는다 — 남겨야 할 바로 그 순간에 못 남기는 설계다. 걸음마다
  // (디바운스 후) 같은 줄을 갱신해 두면 창을 강제 종료해도 마지막 상태가 이미
  // 디스크에 있다.
  useEffect(() => {
    if (footprintTrailEntries.length < PAST_WALK_MIN_ENTRIES) return;
    const timer = window.setTimeout(flushPastTrail, PAST_TRAIL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [footprintTrailEntries, flushPastTrail]);
  // 탭이 숨겨지는 순간은 아직 문서가 살아 있어 쓰기가 끝날 수 있다 — 디바운스
  // 대기 중이던 마지막 걸음을 여기서 앞당긴다.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushPastTrail();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [flushPastTrail]);
  const clearFootprintTrail = useCallback(() => {
    lastVisitedNodeRef.current = null;
    setFootprintTrail([]);
    // 프라이버시 밸브 — 이미 파일에 쓰인 이번 세션 줄도 함께 지운다.
    setSessionWalkId(newPastWalkId());
    const store = pastTrailSaveRef.current.store;
    if (store) void store.remove(sessionWalkId).then(setPastWalks);
  }, [sessionWalkId]);
  const handleDeletePastWalk = useCallback(
    (walkId: string) => {
      if (!pastTrailStore) return;
      void pastTrailStore.remove(walkId).then(setPastWalks);
    },
    [pastTrailStore],
  );
  const handleClearPastWalks = useCallback(() => {
    if (!pastTrailStore) return;
    setSessionWalkId(newPastWalkId());
    void pastTrailStore.clear().then(setPastWalks);
  }, [pastTrailStore]);
  // 보관된 길을 살아있는 지도 기준으로 정제해 둔다 — 목록 문구(제목·개수)와
  // 다시 펼 때 적재되는 걸음이 **같은 것**이어야 한다. 목록엔 12곳이라고 써
  // 놓고 9곳만 펴지면 그게 조용한 거짓말이다.
  const refinedPastWalks = useMemo(() => {
    const lookup = (id: string) => {
      const node = footprintNodeLookup.get(id);
      return node ? { title: node.label, kind: node.kind } : null;
    };
    return pastWalks.map((walk) => ({
      walk,
      entries: refinePastWalkEntries(walk.entries, lookup),
    }));
  }, [pastWalks, footprintNodeLookup]);
  // 행 문구는 여기서 완성한다 — 칩은 순수 크롬이라 i18n·날짜 지식을 갖지 않는다.
  // 날짜는 **일 단위**만 쓴다(시·분을 보이면 목록이 행동 타임라인으로 읽힌다).
  // 지금 걷고 있는 줄은 뺀다 — 그건 1층(걸어온 길)이 이미 보여주고 있다.
  const pastWalkRows = useMemo<TopologyPastWalkRow[]>(() => {
    // 기준 시각은 mount 시각(`mountNowMs`) — 렌더 중 `Date.now()` 는 purity
    // 위반이고, 라벨이 일 단위라 세션 중 고정돼도 어긋나지 않는다(자정을 넘겨
    // 계속 켜둔 창에서만 "오늘"이 하루 늦게 바뀐다).
    const now = mountNowMs;
    const dayFormat = new Intl.DateTimeFormat(activeLocale, { month: "long", day: "numeric" });
    const yearFormat = new Intl.DateTimeFormat(activeLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return refinedPastWalks
      .filter(({ walk }) => walk.id !== sessionWalkId)
      .map(({ walk, entries }) => {
        const day = describePastTrailDay(walk.endedAt, now);
        const date =
          day.kind === "today"
            ? t("footprint.pastDateToday")
            : day.kind === "yesterday"
              ? t("footprint.pastDateYesterday")
              : day.kind === "sameYear"
                ? dayFormat.format(day.at)
                : yearFormat.format(day.at);
        // 다시 펼 수 있으려면 살아남은 걸음이 길로 보일 만큼(칩 문턱과 같은 수)
        // 있어야 한다 — 한 곳만 남은 길을 펴면 칩이 사라져 팝오버째 닫힌다.
        const replayable = entries.length >= PAST_WALK_MIN_ENTRIES;
        // 이름은 지금 지도의 이름으로 — 못 펴는 길만 그때 이름을 그대로 둔다
        // (지도에 없는 것을 지금 이름으로 부를 방법이 없다).
        const shown = replayable ? entries : walk.entries;
        return {
          id: walk.id,
          routeLabel: t("footprint.pastRouteLabel", {
            first: shown[0].title,
            last: shown[shown.length - 1].title,
          }),
          metaLabel: replayable
            ? t("footprint.pastRowMeta", { date, count: entries.length })
            : t("footprint.pastDeadRowMeta"),
          replayable,
          // 못 펴는 길은 라벨도 만들지 않는다 — 버튼이 없는데 "0곳 다시 펴기"를
          // 계산해 들고 있으면 그 문자열이 언젠가 다른 표면으로 샌다.
          ariaLabel: replayable
            ? t("footprint.pastReplayAriaLabel", { date, count: entries.length })
            : null,
        };
      });
  }, [refinedPastWalks, sessionWalkId, activeLocale, mountNowMs, t]);
  // 읽기 전용 볼트에서 조용히 실패하지 않는다 — 2층이 왜 안 남는지 답한다.
  const pastTrailNotice =
    vault.status === "loaded" && !pastTrailWritable ? t("footprint.pastReadOnlyNotice") : null;
  // ── 걸어온 길 렌즈 ───────────────────────────────────────────────────
  // 팝오버 열림과 **동치**인 일시 상태(새 모드·토글·URL 상태 0). 열려 있는 동안
  // 지도가 관계 읽기(ego 강조 엣지)를 접고 궤적 읽기에 양보한다: 방문 노드만
  // 값·라벨을 지키고 나머지·엣지 전부는 기존 dim 값으로 물러난다. 소유자가
  // "어지럽다"고 한 파란 선의 정체가 그 ego 엣지였다 — 궤적 폴리라인을 새로
  // 그리는 게 아니라(이 제품에서 선 = 관계다) 읽는 순간만 장을 비운다.
  //
  // 렌즈 on/off·브러싱 모두 state 가 아니라 **ref** 다: 이 값들을 state 로 올리면
  // 켤 때마다·행을 훑을 때마다 이 페이지 트리가 통째로 다시 렌더된다(실측 전환
  // 프레임 ~100ms, 호버당 68~109ms — "끈적하다"고 느껴지는 크기다). 캔버스 루프는
  // 어차피 매 프레임 ref 를 읽으므로 렌더를 한 번도 돌리지 않고 같은 그림을 얻는다.
  const footprintLensActiveRef = useRef(false);
  const footprintBrushNodeIdRef = useRef<string | null>(null);
  const handleFootprintLens = useCallback((active: boolean) => {
    footprintLensActiveRef.current = active;
  }, []);
  const handleFootprintBrush = useCallback((id: string | null) => {
    footprintBrushNodeIdRef.current = id;
  }, []);

  /*
    **옆 패널에서 노드 이름에 마우스를 올렸을 때** 지도가 그 노드를 가리키는
    단 하나의 통로. 쓰는 곳이 둘이다:

    ① 대화창(2026-08-17 소유자 지시: *"채팅에서 마우스만 올려도 우리 노드에
       표시된다거나"*)
    ② 데이터시트의 하위/상위/근거/도메인 줄 (2026-08-17 소유자 지시:
       *"이부분들 각각 마우스 올리면 옆에 지도에서 반짝이면서 표시되면 좋겠는데
       가능할까? 지금은 아무 반응이 없어서.."*)

    ②를 붙일 때 **새 통로를 만들지 않았다.** 「반짝」은 깜빡임·glow 를 뜻하는
    말이 아니라 *"거기가 어디인지 보이게"* 라는 뜻이고(이 저장소는 깜빡임·
    glow·pulse 를 금지한다 — `forbidden.md` 「디자인」절), 지도에는 이미 그
    뜻으로 배운 표시가 있다: **마우스로 노드를 가리켰을 때 나오는 그 표시**.
    통로를 하나로 두면 강조도 하나뿐이라 사용자가 새로 배울 것이 없다.

    발자국 브러싱과 **같은 계약**이다 — 커서가 캔버스가 아니라 옆 패널 위에
    있어 캔버스 호버와 경쟁하지 않고, ref 라 호버마다 렌더를 돌리지 않는다.
    두 소비처가 동시에 쓸 일은 없다(커서는 하나다).
  */
  const panelHoverNodeIdRef = useRef<string | null>(null);
  /* 답변에서 집을 이름들 — **실재하는 노드만**. 아무 `a/b` 나 링크로 만들면
     파일 경로와 URL 까지 링크가 되고, 눌러도 아무 데도 안 가는 링크를 한 번
     만난 사람은 나머지도 안 누른다.

     ⚠️ **이름 공간이 둘이다** (2026-08-17 실물 실측). 종전에는 이 목록을
     `nodes.map((n) => n.id)` 로 만들었는데, 그 id 는 `domain:example-domain`
     꼴이고 **에이전트가 쓰는 이름은 `domains/example-domain`** 이다. 둘은
     절대 같아지지 않으므로 채팅에 나온 어떤 이름도 안 걸렸고, 이 기능은
     배선만 있고 죽어 있었다. 판정과 재현은 `chat-node-index.ts`. */
  const chatNodeIndex = useMemo(
    () => buildChatNodeIndex(ontologyInsight?.nodes),
    [ontologyInsight],
  );
  const chatKnownSlugs = useMemo(() => new Set(chatNodeIndex.keys()), [chatNodeIndex]);
  /* 표가 바뀔 때만 신원이 바뀐다 — 볼트가 바뀌는 순간이라 드물다. 렌더 중에
     ref 를 쓰는 쪽이 더 싸 보이지만 그건 동시성 렌더에서 깨지는 패턴이다. */
  const handleChatHoverSlug = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );
  /* 데이터시트의 관계 행 — 넘어오는 값이 **이미 캔버스 노드 id** 다
     (`onSelectConnection` 과 같은 이름 공간). 그래서 표를 거치지 않는다. */
  const handleDatasheetHoverConnection = useCallback((id: string | null) => {
    panelHoverNodeIdRef.current = id;
  }, []);
  /* 근거 문서 행 — 넘어오는 값은 **볼트 slug** 라 채팅과 같은 표를 거친다.
     지도에 없는 문서면 표가 못 찾고 null 이 되어 아무 일도 안 일어난다. */
  const handleDatasheetHoverEvidence = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );

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
  /**
   * 전체 상세는 lazy chunk 다. 예전에는 `fullDetailOpen` 이 되는 즉시 불투명한
   * 전면 표면(`fixed inset-0` + 캔버스 배경)을 칠했는데, 그 안의 내용은 청크가
   * 도착한 뒤에 왔다 — 그래서 누른 뒤 **창 전체가 150ms 검게 홀드**되고
   * (프레임 diff 정확히 0.000 ×9프레임) 목적지가 1프레임에 팝했다. 어디서 왔는지
   * 알 수 없는 등장이고, 앱이 죽은 것으로 읽힌다.
   *
   * 그래서 순서를 뒤집는다: 청크가 준비될 때까지 **출발 화면(지도)을 그대로
   * 둔다**. 도착은 배경과 내용이 같은 커밋에 실려 크로스페이드 한 번으로
   * 끝난다 — 닫기가 이미 쓰던 문법과 같다(들어온 경로로 나간다). 스켈레톤·
   * 가짜 진행바는 쓰지 않는다: 출발 화면이 그 시간을 덮는다.
   *
   * 예열은 노드가 선택되는 순간(= 팝오버가 열려 「전체 상세」가 보이는 순간)에
   * 한다. 실제로 누를 때는 이미 준비돼 있으므로 대기 자체가 없다.
   */
  const [FullDetailCard, setFullDetailCard] = useState<FullDetailA1Component | null>(null);
  useEffect(() => {
    if (FullDetailCard) return;
    if (!selectedOntologyNode && fullDetailSlug == null) return;
    let cancelled = false;
    void importFullDetailA1()
      .then((mod) => {
        // 함수 값을 상태에 넣을 때는 updater 로 오해되지 않게 한 겹 감싼다.
        if (!cancelled) setFullDetailCard(() => mod.FullDetailA1);
      })
      .catch(() => {
        /* 청크 실패는 아래 렌더 게이트가 그대로 닫힌 상태로 남긴다 */
      });
    return () => {
      cancelled = true;
    };
  }, [FullDetailCard, selectedOntologyNode, fullDetailSlug]);
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
  /**
   * 「이어서 새로 만들기」가 미리 고르는 도메인 — 지도의 도메인 노드에서 열면
   * 그 도메인이 이미 골라져 있다. 빈 문자열이면 종전대로 「도메인 없음」.
   */
  const [createNodeSeedDomain, setCreateNodeSeedDomain] = useState("");
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
    handoffSource,
    authoredSignificance,
    docFreshnessIndex,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps: vault.selfEditTimestamps,
    formatEditAgeLabel,
  });
  /*
   * 진단을 **선택 밖으로** 꺼낸다. 아래 `useProjectSourceModel` 은 선택된
   * 프로젝트 하나만 보므로, 아무도 그 노드를 클릭하지 않으면 「연결된 코드
   * 폴더가 없습니다」는 화면에 존재하지 않는다(실측 2026-08-04: 첫 화면 0회).
   * 이 훅은 사이드카 한 번 읽기로 그 사실만 꺼내 INDEX 의 조용한 행에 싣는다.
   */
  const unboundProjectSource = useUnboundProjectSource({
    vaultHandle: vault.status === "loaded" ? vault.handle : null,
    nodes: ontologyInsight?.nodes ?? [],
  });
  const sourceProjectSlug = projectSlugForSource(selectedOntologyNode);
  const projectSource = useProjectSourceModel({
    projectSlug: sourceProjectSlug,
    vaultHandle: vault.status === "loaded" ? vault.handle : null,
    nodes: ontologyInsight?.nodes ?? [],
    docs: vault.manifest?.docs ?? [],
    // OS 폴더 선택창의 제목까지 화면 언어여야 한다 — 설치 앱에서 한국어 화면
    // 위에 영어 제목의 창이 열리고 있었다(실측 2026-08-04).
    pickerTitle: t("nodeDatasheet.sourcePickerTitle"),
  });
  const projectSourceMeasuredAtLabel = useMemo(() => {
    const measuredAt = projectSource.view?.measuredAt;
    if (!measuredAt) return t("nodeDatasheet.sourceMeasuredNever");
    const date = new Date(measuredAt);
    const time = Number.isNaN(date.getTime())
      ? measuredAt
      : new Intl.DateTimeFormat(activeLocale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
    return t("nodeDatasheet.sourceMeasuredAt", { time });
  }, [projectSource.view?.measuredAt, activeLocale, t]);
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
  // 진입 검수 E-7 — `자동 정렬` 토스트가 우하단 상시 계기(범례 + 판독)를
  // 통째로 덮었다. 둘 다 bottom-right 고정인데 토스트는 기본 16px 오프셋이라
  // 알림이 계기 위에 그대로 얹혔다. 빌더 하단 바가 쓰던 예약 계약
  // (`--app-toast-bottom-offset`)을 이 스택에 다시 연결한다 — 예약 높이는
  // 상수가 아니라 스택의 실측 rect 다(로케일·줌 티어·≥1920 인셋에 따라 바뀐다).
  const legendStackRef = useRef<HTMLDivElement | null>(null);
  const legendStackHidden = v2DatasheetModel !== null;
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--app-toast-bottom-offset");
    const element = legendStackRef.current;
    if (legendStackHidden || !element) {
      clear();
      return undefined;
    }
    const apply = () => {
      const rect = element.getBoundingClientRect();
      // `<md` 에서는 계기가 `hidden` 이라 높이 0 — 예약할 것이 없다.
      if (rect.height === 0) {
        clear();
        return;
      }
      root.style.setProperty(
        "--app-toast-bottom-offset",
        `${resolveToastBottomOffsetForStack(window.innerHeight, rect.top)}px`,
      );
    };
    // 스택의 줄 수는 나중에 늘어난다 — 계기 판독(`FirstRunReadout`)은 샘플
    // 모드 판정이 끝난 뒤에 붙는다. mount 시점 한 번만 재면 예약이 한 줄
    // 분량 부족한 채 굳어 토스트가 그대로 범례를 덮는다(실측 54px vs 필요 79px).
    //
    // 첫 실측도 RO 의 **초기 전달**에 맡긴다 (2026-08-19 부팅 실측). 종전처럼
    // 커밋 이펙트에서 `apply()` 를 동기로 부르면 방금 DOM 을 갈아 끼운 문서에
    // 강제 레이아웃이 걸려 — CPU 4배 스로틀 기준 36~45ms — 부팅 최대 long
    // task 의 최대 단일 항목이었다. RO 콜백은 명세상 «레이아웃 뒤·페인트 앞»
    // 에 돌므로 같은 rect 를 공짜로 읽고, 변수는 여전히 첫 페인트 전에 앉는다
    // (화면 결과 동일). RO 가 없는 환경만 종전 동기 실측으로 폴백한다.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    if (observer === null) apply();
    else observer.observe(element);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
      clear();
    };
  }, [legendStackHidden]);
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
  /** 담을 개념이 아직 하나도 없는 지도인가. 위 `indexManualExpandWhileEmpty` 참고. */
  const topologyGraphEmpty = (ontologyInsight?.nodes.length ?? 0) === 0;
  const renderedIndexState: IndexPanelState =
    baseRenderedIndexState === "expanded" &&
    ((topologySelectionActive && !indexManualExpandDuringSelection) ||
      (topologyGraphEmpty && !indexManualExpandWhileEmpty))
      ? "collapsed"
      : baseRenderedIndexState;
  /**
   * 접힘 ↔ 펼침은 한 번의 클릭이 낳은 **하나의 사건**이다. 지금까지는 도착
   * 표면만 시간을 받고 떠나는 표면은 0프레임이었다(위 `useSurfaceSwap` 주석의
   * 실측). 두 프레임을 같은 슬롯에 겹쳐 그려 **떠나는 것과 오는 것과 지도가
   * 같은 프레임에 출발**하게 한다 — 판정식② "같은 입력의 단계 시작차 ≤
   * `--motion-fast`" 를 구조로 보장한다.
   *
   * 퇴장 창은 `EXIT_WINDOW_MS` 하나로 공유한다 — 지도 위 표면의 나가는 길이
   * 표면마다 다르면 그게 다시 결함이다.
   */
  const indexSlotSwap = useSurfaceSwap(renderedIndexState);
  /*
   * 폴더를 연 **바로 다음 화면**에서 「무엇을 쓸 수 있는지」를 말하기 위한 탐지
   * (2026-08-16 소유자 지적). 설정 안에만 두면 그 사실은 찾아 들어간 사람에게만
   * 존재한다.
   *
   * **검증된 실행기만** 이름으로 부른다 — 우리가 실제로 재 보지 않은 것을
   * 첫 화면에서 권하면, 그 권유가 곧 보증으로 읽힌다.
   */
  /*
   * 여기서 **쓸 수 있는 것들**과 **지금 고른 것**을 나눠 둔다.
   *
   * ⚠️ 종전 조건은 `r.isolated` 였는데, 그건 「설정 격리가 되는가」다. codex 는
   * 설정 격리로는 안 걸리고 **세션 모드**로 걸린다(2026-08-16 실측) — 그래서
   * 관문을 붙여 놓고도 목록에서 빠져 **아무도 고를 수 없었다.** 판정은
   * `isGuardedRuntime` 한 곳으로 모은다.
   */
  const [acpRuntimes, setAcpRuntimes] = useState<Array<{ id: string; label: string }>>([]);
  const [acpRuntimeId, setAcpRuntimeId] = useState<string | null>(null);
  const [acpChatOpen, setAcpChatOpen] = useState(false);
  /**
   * 대화 패널이 **화면에 붙어 있나** — 열림과 다른 값이다.
   *
   * 열림은 「보여야 하나」이고 이것은 「그려져 있나」다. 닫을 때 둘이 같은
   * 값이면 사라지는 애니메이션이 돌 자리가 없다(그래서 종전에는 안 돌았다).
   */
  const [chatMounted, setChatMounted] = useState(false);
  /**
   * 대화 칸의 폭은 **사용자가 정하고 이 컴퓨터가 기억한다.** 어떤 사람은 지도를
   * 보면서 짧게 묻고 어떤 사람은 코드 덩어리를 읽는다 — 그 둘에 다 맞는 한 수는
   * 없어서, 우리는 지도가 죽지 않을 선만 지킨다.
   */
  const chatWidth = useChatWidth();
  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    /*
     * **두 번 부른다** — 첫 화면이 뜨는 프레임에 로그인 확인(수백 ms)을 얹지
     * 않는다. 먼저 찾은 것으로 그리고, 확인이 끝나면 고친다. 로그인이 안 된
     * 도구는 그때 목록에서 빠진다(그 도구로 열면 인증 오류로 죽으므로).
     */
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = (list ?? [])
        .filter((r) => r.state === 'ready' && r.verified && isGuardedRuntime(r.id, r.isolated))
        .map((r) => ({ id: r.id, label: r.label }));
      setAcpRuntimes(usable);
      setAcpRuntimeId((current) =>
        current && usable.some((r) => r.id === current) ? current : (usable[0]?.id ?? null),
      );
    };
    void detectAcpRuntimes().then((fast) => {
      apply(fast);
      void detectAcpRuntimes({ probeLogin: true }).then(apply);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const acpRuntime = acpRuntimes.find((r) => r.id === acpRuntimeId) ?? null;
  /*
    「무엇을 물어보지」에 대한 답은 **이 폴더의 지금 상태**에서 뽑는다
    (2026-08-17). 볼트를 읽는 것은 화면(뷰)의 일이고, 대화 패널은 결과만
    받는다 — 패널이 볼트를 직접 읽으면 `LocalVaultProvider` 없이는 못 서게
    되고, 그건 그 위젯이 지금까지 지켜 온 성질이 아니다.
  */
  const chatSuggestions = useChatSuggestions();
  const acpRuntimeLabel = acpRuntime?.label ?? null;
  /*
   * 매 렌더 새 배열을 만들면 그 값을 받는 훅의 `start` 정체가 매번 바뀌고,
   * 그것을 지켜보는 effect 가 계속 다시 돈다. 잠금은 세션 훅이 지지만
   * (`startingRef`) **헛돌게 두지 않는 것은 여기 몫**이다.
   */
  /*
   * 이 런타임이 볼트에서 **스스로** 같은 서버를 읽어 오면 여기서 또 꽂지
   * 않는다 — 2026-08-17 실측에서 `mcp.ontology-atlas.*` 와 `mcp.atlas-vault.*`
   * 가 같은 결과를 내며 프로세스가 둘이었다. 판정과 실측 근거는
   * `vault-mcp-server.ts`.
   */
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
            command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    return vaultMcpServers(agentServer.launch, gitVaultPath, registration);
  }, [
    agentServer.launch,
    gitVaultPath,
    acpRuntimeId,
    vault.agentConfigStatus?.codexConfigValid,
    vault.agentConfigStatus?.codexRegisteredCommand,
  ]);

  /*
   * 앱 안 에이전트가 **자기 이름을 볼트에 등록**한다 (2026-08-17 소유자 지시).
   * 종전에는 그 에이전트가 만든 노드가 전부 `created_by: agent:unknown` 이었다 —
   * 서버는 이름을 알았지만 그 칸은 「사람이 의도적으로 등록한 이름」만 받고,
   * 정작 등록할 방법이 아무 데도 없었다. 사람이 어느 도구로 대화할지 고른 것이
   * 그 의도이고, 앱은 그것을 안다. 판정과 근거는 `lib/acp-agent-heartbeat.ts`.
   */
  const acpHeartbeatStore = useMemo<AcpHeartbeatStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultAcpHeartbeatStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const handleAcpTurnActiveChange = useCallback(
    (active: boolean) => {
      const store = acpHeartbeatStore;
      if (!store) return;
      const agent = acpHeartbeatAgentName(acpRuntimeId);
      // 이름을 모르면 등록하지 않는다 — 모름은 모름으로 남는 편이 낫다.
      if (!active || !agent) {
        void store.clear().catch(() => {});
        return;
      }
      void store.write(buildAcpTurnHeartbeat({ agent, at: new Date() })).catch(() => {});
    },
    [acpHeartbeatStore, acpRuntimeId],
  );

  const indexSlotFrames: ReadonlyArray<{ state: IndexPanelState; exiting: boolean }> =
    indexSlotSwap.leaving === null
      ? [{ state: renderedIndexState, exiting: false }]
      : [
          { state: indexSlotSwap.leaving, exiting: true },
          { state: renderedIndexState, exiting: false },
        ];
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.topologyIndex = renderedIndexState;
    // **전면 무효화를 쓰지 않는다** (2026-07-28 성능 트레이스). 이 effect 는
    // 노드를 선택할 때도 돈다 — INDEX 가 레일로 강등되기 때문이다. 캐시를
    // 통째로 버리면 다음 프레임이 `getPropertyValue` 115회로 스타일 재계산을
    // 강제해 클릭마다 58ms 를 태운다. `data-topology-index` 가 실제로 바꾸는
    // 토큰은 `--topology-v2-safe-inset-left` 하나뿐이라 그것만 갱신한다.
    refreshIndexDependentTokens(root);
    let cancelled = false;
    // 동기 setState 회피(cascading-render 경고) — microtask 로 defer.
    //
    // 3D 돔에서는 이 재핏을 쏘지 않는다 (2026-08-18 실측): 이 effect 는 노드를
    // **선택/해제할 때마다** 돈다(INDEX 레일 강등). 2D 에선 이 fit 이 한 프레임
    // 뒤 포커스 다이브에 덮여 무해했지만, 돔에서는 fit 토큰이 「자동 정렬」과
    // 같은 경로(자세 홈 이징 + 자율 회전 재무장)를 타서 — 노드를 고르면 다이브
    // 대신 돔이 제 맘대로 홈으로 돌아가고, 해제만 해도 시선 끌기 회전이
    // 되살아났다(소유자 *"내가 조종하는 게 아니라 화면이 저 혼자 돈다"*).
    // 돔 핏은 15% 여백이라 INDEX 레일 폭 변화는 흡수되고, 선택 리프레임은
    // 소비 시점에 인셋을 직접 재므로 이 재핏 없이도 패널을 피한다.
    if (!view3d) {
      window.queueMicrotask(() => {
        if (!cancelled) setFitViewToken((count) => count + 1);
      });
    }
    return () => {
      cancelled = true;
      delete root.dataset.topologyIndex;
    };
  }, [renderedIndexState, view3d]);
  const copyV2NodeHandoff = useCallback(
    async (text: string) => {
      await copyHandoffWithFeedback({
        text,
        copy: copyText,
        show: toast.show,
        copiedMessage: t("nodeDatasheet.handoffCopied"),
        failedMessage: t("nodeDatasheet.handoffCopyFailed"),
      });
    },
    [t, toast],
  );
  const projectAwareHandoffText = useMemo(() => {
    if (!v2DatasheetModel) return "";
    if (!projectSource.view) return v2DatasheetModel.handoffText;
    return `${v2DatasheetModel.handoffText}\n\n${formatProjectSourceHandoff(projectSource.view)}`;
  }, [v2DatasheetModel, projectSource.view]);
  const handleProjectSourceAction = useCallback(async () => {
    const action = projectSource.view?.nextAction.id;
    if (!action || !v2DatasheetModel) return;
    if (projectSource.canRunSourceAction) {
      await projectSource.runNextAction();
      return;
    }
    if (action === "use_current_evidence") {
      await copyV2NodeHandoff(projectAwareHandoffText);
      return;
    }
    if (
      action === "record_source_role"
      || action === "repair_source_path"
      || action === "review_inventory_limit"
    ) {
      setFullDetailSlug(v2DatasheetModel.nodeId);
    }
  }, [projectSource, v2DatasheetModel, copyV2NodeHandoff, projectAwareHandoffText]);
  const projectSourceNextAction = projectSource.view?.nextAction.id ?? null;
  const projectSourceNextActionAvailable = Boolean(
    // 추정이 아직 안 끝났으면 **아무 처방도 안 그린다.** 먼저 그리면 그 버튼이
    // 300ms 뒤에 라벨과 스킨이 바뀌면서 위로 밀린다 — 마우스가 이미 가 있던 자리다.
    projectSource.proposalSettled
    && (projectSource.canRunSourceAction
    || projectSourceNextAction === "use_current_evidence"
    || projectSourceNextAction === "record_source_role"
    || projectSourceNextAction === "repair_source_path"
    || projectSourceNextAction === "review_inventory_limit"),
  );
  const projectSourceNeedsNativeRuntime = Boolean(
    projectSourceNextAction === "connect_source"
    || projectSourceNextAction === "repair_source_binding"
    || projectSourceNextAction === "measure_source"
    || projectSourceNextAction === "remeasure_source",
  );
  const projectSourceLabels = useMemo(() => {
    const view = projectSource.view;
    if (!view) return null;
    const sourceKind = view.receipt?.sourceKind;
    return {
      heading: t("nodeDatasheet.sourceHeading"),
      sourceKind: sourceKind ? t(`nodeDatasheet.sourceKind_${sourceKind}`) : undefined,
      status: t(`nodeDatasheet.sourceStatus_${view.status}`),
      measuredAt: projectSourceMeasuredAtLabel,
      currentness: t(`nodeDatasheet.sourceCurrent_${view.currentness}`),
      gap: t(`nodeDatasheet.sourceGap_${view.topGap?.id ?? "none"}`),
      /*
       * 종전에는 이 자리가 웹에서 「설치 앱에서 코드 폴더를 연결할 수 있어요」로
       * **바뀌었다** — 행동 라벨 자리에 안내 문장을 끼워 넣은 것이라, 웹 사용자는
       * 누를 수 없는 회색 문장 하나를 받고 끝났다(왜인지도, 어디로 가면 되는지도,
       * 이 화면에서 무엇이 되는지도 없이). 이제 라벨은 언제나 행동 라벨이고,
       * 못 하는 표면의 안내는 `projectSourceDegraded` 가 통째로 맡는다.
       */
      action: t(`nodeDatasheet.sourceAction_${view.nextAction.id}`),
      why: t(`nodeDatasheet.sourceWhy_${view.nextAction.id}`),
      busy: t("nodeDatasheet.sourceBusy"),
    };
  }, [
    projectSource.view,
    projectSourceMeasuredAtLabel,
    t,
  ]);
  /**
   * 이 표면에서 그 행동을 실행할 수 없을 때만 만들어진다 — 웹에서 폴더를 고르는
   * 네 행동(연결·재설정·확인·재확인)은 절대 경로를 요구하고, 브라우저는 그것을
   * 알 수 없다(`surfaces.md` 「볼트 절대 경로」 브리지).
   *
   * 셋을 전부 담는다: 왜 · 어디서 · **여기서도 되는 것**. 셋째가 없으면 되는
   * 일까지 안 된다고 말하게 된다(2026-08-01 「웹의 「연결 불가」는 거짓이었다」).
   */
  const projectSourceDegraded = useMemo(
    () => !projectSource.runtimeAvailable && projectSourceNeedsNativeRuntime
      ? {
          why: t("nodeDatasheet.sourceDegradedWhy"),
          ctaLabel: t("nodeDatasheet.sourceDegradedCta"),
          href: "/download/",
          stillWorks: t("nodeDatasheet.sourceDegradedStillWorks"),
        }
      : null,
    [projectSource.runtimeAvailable, projectSourceNeedsNativeRuntime, t],
  );
  const projectSourceErrorLabel = projectSource.error
    ? t(`nodeDatasheet.sourceError_${projectSource.error}`)
    : null;
  /**
   * **「이 폴더 맞나요?」 — 연결을 두 단계에서 한 단계로.**
   *
   * 종전에는 「코드 폴더 연결하기」를 누르면 무조건 OS 폴더 선택창이 열렸고,
   * 사람은 자기 저장소를 트리에서 다시 찾아야 했다. 앱은 그 답을 이미 안다 —
   * 볼트 루트를 한 번 재면 그것을 감싸는 git 저장소까지 올라가기 때문이다.
   *
   * 근거 한 줄은 **잰 것만** 말한다: git 저장소라는 사실 + 선언된 경로 중 몇
   * 개가 실제로 거기 있었는지. 선언된 경로가 0개면 비율을 지어내지 않고 그렇게
   * 적는다. 추정이 없거나 확신이 낮으면 이 값 자체가 `null` 이고, 그때 화면은
   * 종전대로 폴더 선택창 하나만 그린다(죽은 CTA 0).
   */
  const projectSourceProposal = useMemo(() => {
    const proposed = projectSource.proposedRoot;
    if (!proposed) return null;
    const summary = proposed.witnessSummary;
    const support = summary && summary.total > 0
      ? t("nodeDatasheet.sourceProposeSupport", {
          total: summary.total,
          supported: summary.supported,
        })
      : t("nodeDatasheet.sourceProposeSupportNone");
    return {
      question: t("nodeDatasheet.sourceProposeQuestion"),
      rootPath: proposed.rootPath,
      reason: `${t("nodeDatasheet.sourceProposeReasonGit")} · ${support}`,
      confirmLabel: t("nodeDatasheet.sourceProposeConfirm"),
      pickOtherLabel: t("nodeDatasheet.sourceProposePickOther"),
      confidence: proposed.confidence,
    };
  }, [projectSource.proposedRoot, t]);
  const handleProjectSourceConfirmProposal = useCallback(async () => {
    const rootPath = projectSource.proposedRoot?.rootPath;
    if (!rootPath) return;
    await projectSource.runNextAction({ rootPath });
  }, [projectSource]);
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
  // `v2DatasheetModel` (documentHref/studioEditHref/handoffText), but keyed
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
    // 자기 문서 / 남이 언급한 문서 구분 — 컨텍스트 메뉴는 `근거` 목록이 없어
    // 문서가 없는 노드에서 링크를 그냥 지우면 정보가 사라진다. 라벨을 바꿔
    // 정직하게 남긴다.
    const { ownSlug, mentionedInSlug } = resolveNodeDocument(node);
    // 인계문에 박히는 이름은 볼트가 아는 이름 — 문서 slug 또는 참조 원문.
    const agentTarget = resolveNodeAgentTarget(node);
    const slug = agentTarget.ref ?? sourceSlug ?? node.id;
    const connections = buildV2Connections(node.id, ontologyInsight.nodes, ontologyInsight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(node.evidenceIds);
    const handoffText = formatV2HandoffText({
      source: handoffSource,
      slug,
      documented: agentTarget.documented,
      kind: node.kind,
      domainTitle: null,
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      belongsTo: groups.belongsTo.total,
      evidence: evidenceRows.length,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
      belongsToNames: groups.belongsTo.rows.map((connection) => connection.title),
    });
    return {
      nodeId: node.id,
      slug,
      documentHref: ownSlug ? buildDocsVaultHref({ slug: ownSlug }) : null,
      mentionDocumentHref: mentionedInSlug
        ? buildDocsVaultHref({ slug: mentionedInSlug })
        : null,
      // 빌더 딥링크는 canonical `<kind>:<slug>`(그래프 node id)로 통일(H5).
      studioEditHref: buildOntologyStudioNodeHrefFromGraphId(node.id),
      handoffText,
    };
  }, [contextMenuNode, handoffSource, ontologyInsight]);
  /*
   * 우클릭 메뉴도 퇴장 창을 갖는다 — 그동안 위치와 모델을 붙들어야 «닫히는
   * 중에 빈 메뉴» 가 되지 않는다. 키는 슬러그+좌표: 같은 노드를 다른 자리에서
   * 다시 우클릭하면 새 값이다.
   */
  const contextMenuKey = contextMenuNode
    ? `${contextMenuNode.slug}@${contextMenuNode.x},${contextMenuNode.y}`
    : null;
  const heldContextMenu = useHeldValue(
    contextMenuNode && contextMenuModel
      ? { anchor: { x: contextMenuNode.x, y: contextMenuNode.y }, model: contextMenuModel }
      : null,
    contextMenuKey,
  );

  // A1 "데이터시트 확장판" 전체 상세 — TopologyOntologyDrawer(배지 수프 +
  // reach 쿼리빌더 + collaborator brief)를 대체. groups/reach 는 compact
  // datasheet 와 동일 소스(buildV2Connections 파생, buildOntologyReachability
  // 재사용)라 두 표면의 숫자가 절대 drift 하지 않는다.
  const fullDetailA1Model = useFullDetailA1Model({
    open: fullDetailOpen,
    nodeFocus,
    selectedOntologyNode,
    insight: ontologyInsight,
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vaultLoaded: vault.manifest !== null,
    onSaveExplanation: saveNodeExplanation,
    datasheet: v2DatasheetModel,
  });
  /*
   * 전체 상세는 **닫히는 순간 모델이 null 이 된다**(「화면에 없는 표면의 모델은
   * 만들지 않는다」 게이트 그대로) — 그래서 퇴장 창을 열려면 값도 붙들어야 한다.
   * 키는 슬러그: 이 모델은 `useMemo` 라 정체성이 매 렌더 바뀌고, 키 없이 넘기면
   * React #301 로 지도가 통째로 죽는다(엣지 패널 실측).
   */
  const heldFullDetailA1Model = useHeldValue(fullDetailA1Model, fullDetailSlug);
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
  //
  // 2026-08-03 — **퇴장 창은 이제 패널이 진다**(`TopologyV2DetailPanel` 안의
  // `<Surface>`). 여기 있던 `usePanelPresence` + `presence` prop 조합은 창을
  // 부모에 두고 클래스만 자식에게 지시하는 형태라, «이 표면에 나가는 길이
  // 있는가» 가 패널 파일 밖의 사실이었다(하드컷 래칫의 탐지기가 못 보는 자리).
  // 남는 것은 **포지셔너를 언제 내리는가** 하나뿐이고, 그 답은 퇴장이 끝났다는
  // 패널의 통보(`onExited`)다 — 한 표면에 퇴장 타이머가 둘이면 어느 쪽이
  // 진실인지 알 수 없다.
  const panelOpen = nodePopoverVisible && Boolean(v2DatasheetModel);
  const [nodePanelMounted, setNodePanelMounted] = useState(false);
  // 렌더 중 조정 — effect 로 올리면 열린 첫 프레임에 포지셔너가 없어 등장이
  // 한 프레임 늦는다(`useHeldValue` 가 같은 이유로 렌더 중에 붙든다).
  if (panelOpen && !nodePanelMounted) setNodePanelMounted(true);
  const retainedDatasheetRef = useRef(v2DatasheetModel);
  if (v2DatasheetModel) retainedDatasheetRef.current = v2DatasheetModel;
  const panelDatasheetModel = v2DatasheetModel ?? retainedDatasheetRef.current;
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
  /*
   * 알림함이 열린 동안만 유틸 레인을 한 단 올린다 (2026-08-17 소유자 지적:
   * *"알림이 위로 덮어야지?"*). 레인의 `z-20` 이 쌓임 맥락을 만들어 그 안의
   * 알림함이 밖으로 못 올라가고, 같은 `z-20` 이면서 DOM 상 뒤에 있는 오른쪽
   * 도구 타일들이 알림함 위에 그려졌다. 상시로 올리지 않는 이유는 막
   * (`--z-map-scrim`, 25)이 덮어야 할 때 레인이 그 위로 삐져나오기 때문이다.
   * 게이트: `tests/e2e/agent-activity-placement.spec.ts`.
   */
  const [activityInboxOpen, setActivityInboxOpen] = useState(false);
  const topologyUtilityLaneSuppressionContract = selectedRelationActive
    ? "selected-relation-inspector-owns-right-rail"
    : selectedNodeOwnsRightRail
      ? "selected-node-inspector-owns-right-rail"
      : undefined;

  /**
   * 화면 문맥 — 이 에이전트의 가장 큰 우위. 매 턴 시스템 측에서 넣으므로
   * 모델이 도구로 물을 필요가 없고 항상 신선하다. 이름은 화면이 부르는
   * 이름(`resolveNodeAgentTarget` 이 정한 인계 슬러그)으로 넘긴다 — 사람과
   * 에이전트가 같은 이름을 써야 인계가 붙여넣는 즉시 동작한다.
   */
  const vaultAgentScreenContext = useMemo<ScreenContextSnapshot>(() => {
    const target = resolveNodeAgentTarget(selectedOntologyNode);
    return {
      focusedSlug: target.ref,
      focusedTitle: selectedOntologyNode?.title ?? null,
      focusedKind: selectedOntologyNode?.kind ?? null,
      lenses: spotlightOn ? ["recent-changes"] : [],
      projectTitle: realmTitle ?? null,
      visibleNodeCount: topologyV2Graph.nodes.length,
    };
  }, [selectedOntologyNode, spotlightOn, realmTitle, topologyV2Graph.nodes.length]);

  /**
   * ## 대화창은 **하나**다 (2026-08-16 소유자 확정)
   *
   * 여기에는 대화를 하는 갈래가 둘 있다 — 내 컴퓨터에 깔린 코딩 에이전트와
   * 이야기하는 것(ACP), 그리고 내가 넣어 둔 API 키로 이야기하는 것. 종전에는
   * **둘 다 자기 문과 자기 창을 갖고 있었고**, 열림 상태도 서로 몰랐다. 그래서
   * 지도 오른쪽에 비슷하게 생긴 대화창이 둘 뜰 수 있었다(소유자 실보고:
   * *"이 에이전트랑 다른 거지? 이 대화창은? 뭔가 헷갈리는데"*).
   *
   * 갈래가 둘인 것은 사실이고 그 자체는 문제가 아니다 — **문이 둘이고 창이
   * 둘인 것**이 문제였다. 그래서 문을 하나로 모은다:
   *
   * - 코딩 에이전트가 잡히면 그쪽으로 간다(더 할 수 있는 게 많다 — 이 폴더의
   *   MCP 도구를 그대로 쓰고, 사용자가 이미 쓰던 구독/설정을 탄다)
   * - 없으면 키 갈래로 간다(코딩 에이전트를 안 쓰는 사람에게 남는 길)
   * - **둘이 동시에 열리는 일은 없다**
   */
  const agentChatUsesRuntime = Boolean(acpRuntime && gitVaultPath);

  const openVaultAgent = useCallback(() => {
    if (agentChatUsesRuntime) {
      setChatMounted(true);
      setAcpChatOpen(true);
      setVaultAgentOpen(false);
    } else {
      setVaultAgentOpen(true);
      setAcpChatOpen(false);
    }
    // 물러나는 표면들 — 툭 사라지지 않게 각자의 닫힘 경로를 그대로 탄다.
    setOntologySearchOpen(false);
    setCreateNodeOpen(false);
  }, [agentChatUsesRuntime]);

  /**
   * 첫 마디의 화면 언어 — 패널의 빈 대화 칩과 **같은 키**를 읽는다. 두
   * 입구가 각자 문구를 고르면 같은 개념을 두 가지로 말하게 된다.
   */
  const firstWordsLabels = useMemo<FirstWordsLabels>(
    () => ({
      missingDefinition: (title) => tAgent("firstWords.missingDefinition", { title }),
      missingDomain: (title) => tAgent("firstWords.missingDomain", { title }),
      missingRelations: (title) => tAgent("firstWords.missingRelations", { title }),
      mapReview: tAgent("firstWords.mapReview"),
      emptyVault: tAgent("firstWords.emptyVault"),
    }),
    [tAgent],
  );

  /**
   * S7 이음새 — 노드 상세의 「말로 시키기」. 문장은 **첫 마디 생성기**가
   * 짓는다(`screenIntentFor`): 빈 대화의 1번 칩과 글자 하나까지 같은 문장이
   * 되므로 두 입구가 갈라질 자리가 없다. 누르면 패널이 열리고 입력칸에 앉을
   * 뿐 — 전송은 여전히 [보내기]다.
   */
  const askAgentAboutSelectedNode = useCallback(() => {
    const intent = screenIntentFor(selectedOntologyNode, vaultConceptFacts);
    if (!intent) return;
    setVaultAgentPrefill({
      text: sentenceForIntent(intent, firstWordsLabels),
      nonce: Date.now(),
    });
    openVaultAgent();
  }, [selectedOntologyNode, vaultConceptFacts, firstWordsLabels, openVaultAgent]);

  /**
   * S7 이음새 — 인사이트 큐에서 `?ask=` 를 달고 건너온 경우.
   *
   * **주소가 곧 상태다.** 별도 React state 로 복사하지 않으므로 "패널이 열려
   * 있는가" 와 "무엇을 물을 것인가" 가 한 곳에만 있고, 뒤로가기로 그 주소에
   * 돌아오면 같은 문맥이 그대로 되살아난다. 주소가 나른 것은 **의도의
   * 종류**뿐이라 문장은 여기서, 빈 대화 칩과 같은 생성기로 짓는다.
   */
  const askPrefill = useMemo(() => {
    if (!llmBridgeAvailable || !routeState.askIntent) return null;
    const intent = nodeIntent(selectedOntologyNode, routeState.askIntent);
    if (!intent) return null;
    return {
      text: sentenceForIntent(intent, firstWordsLabels),
      // 같은 주소면 같은 값 — 렌더마다 초안을 다시 덮지 않는다.
      nonce: hashAskRequest(routeState.askIntent, "ref" in intent ? intent.ref : ""),
    };
  }, [llmBridgeAvailable, routeState.askIntent, selectedOntologyNode, firstWordsLabels]);

  /**
   * 닫기는 주소의 요청도 함께 거둔다 — 안 그러면 닫아도 파생 상태가 다시
   * 열고, 사용자에겐 "닫기가 안 먹는" 것으로 읽힌다.
   */
  const closeVaultAgent = useCallback(() => {
    agentDockTouchedRef.current = true;
    /*
     * 닫는 순간에도 **그려진 채로 남는다** — 그래야 사라지는 애니메이션이 돌
     * 자리가 있다. 다 사라지면 `Surface` 가 `onExited` 로 알려 주고 그때
     * 언마운트한다(주소로 들어온 요청처럼 이 함수를 안 거친 경로도 있어서,
     * 여기서 한 번 더 켜 둔다).
     */
    setChatMounted(true);
    // 창이 하나이므로 닫는 것도 하나다 — 어느 갈래가 떠 있었든 이 한 번으로 닫힌다.
    setVaultAgentOpen(false);
    setAcpChatOpen(false);
    setVaultAgentPrefill(null);
    setRouteState({ askIntent: null }, { replace: true });
  }, [setRouteState]);

  /**
   * 어느 갈래가 **그 하나뿐인 창**을 갖고 있나.
   *
   * 주소가 들고 온 「이거 물어봐」도 같은 규칙을 탄다 — 코딩 에이전트가 있으면
   * 그 문장은 그쪽 작성 칸에 앉는다. 종전에는 이 요청만 키 갈래를 따로 열어서,
   * 칩으로 여는 창과 노드에서 여는 창이 **서로 다른 창**이었다.
   */
  const {
    runtime: runtimeChatOpen,
    key: keyChatOpen,
    /** 지금 대화창이 떠 있나 — 어느 갈래든. 칩의 눌림 상태가 이 값을 읽는다. */
    open: agentChatOpen,
  } = agentChatDoor({
    hasRuntime: agentChatUsesRuntime,
    runtimeOpen: acpChatOpen,
    keyOpen: vaultAgentOpen,
    hasAskIntent: Boolean(askPrefill),
  });

  /**
   * 이 폴더를 분석하라는 지시 — **볼트 경로를 아는 빌더**가 만든다. i18n 문자열로
   * 두면 경로가 없어서, 에이전트가 어느 폴더를 보라는 것인지 문장만으로는 모른다.
   */
  const analyzePrompt = useMemo(
    () =>
      buildAgentAnalyzePrompt({
        vaultPath:
          (vault.handle ? getTauriVaultRootPath(vault.handle) : null) ??
          vault.handle?.name ??
          null,
      }),
    [vault.handle],
  );

  /**
   * 그 지시를 **대화 작성 칸에 앉힌다.** 보내는 것은 여전히 사람이 한다 —
   * 노드의 「말로 시키기」와 같은 계약이고, 같은 상태를 쓴다.
   */
  const sendAnalyzeToAgent = useCallback(() => {
    setVaultAgentPrefill({ text: analyzePrompt, nonce: Date.now() });
    openVaultAgent();
  }, [analyzePrompt, openVaultAgent]);

  /**
   * 첫 걸음 카드를 거둔다 — 마지막 걸음을 지났다는 뜻이다. 세션 단위라 앱을
   * 새로 열면 다시 안내한다.
   */
  const [startStepsDismissed, setStartStepsDismissed] = useState(() =>
    readFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY),
  );
  const dismissStartSteps = useCallback(() => {
    writeFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY);
    setStartStepsDismissed(true);
  }, []);

  /**
   * **오른쪽에 선 것을 알림이 비켜선다** (2026-08-16 소유자 화면).
   *
   * 토스트는 화면 오른쪽 아래 고정이라, 지도 오른쪽에 대화 패널이 서면 그
   * 16px 여백이 **패널 안쪽**이 된다 — 「만들었어요」 알림이 작성 칸 위에
   * 그대로 얹혔다. 하단에서 이미 쓰던 예약 계약을 오른쪽에도 건다.
   *
   * 폭을 상수로 박지 않고 **실측한다**: 이 패널의 폭은 사용자가 끌어서 정한다.
   */
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty("--app-toast-right-offset");
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
    };
    if (!agentChatOpen) {
      clear();
      return undefined;
    }
    const apply = () => {
      const dock = document.querySelector<HTMLElement>("[data-right-dock]");
      const width = dock?.getBoundingClientRect().width ?? 0;
      if (width === 0) {
        clear();
        return;
      }
      // 폭 자체를 적어 둔다 — 지도 위의 떠 있는 카드들이 오른쪽 벽을 이 값에서
      // 구한다(`right-dock-reserve.ts`). 알림의 오프셋은 그 위에 여백을 더한 것.
      root.style.setProperty(RIGHT_DOCK_WIDTH_VAR, `${Math.round(width)}px`);
      root.style.setProperty(
        "--app-toast-right-offset",
        `${resolveToastRightOffset(Math.round(width))}px`,
      );
    };
    apply();
    // 폭은 끌 때마다 바뀌고, 패널은 열린 뒤에 붙는다 — 한 번만 재면 낡는다.
    const dock = document.querySelector<HTMLElement>("[data-right-dock]");
    const observer =
      typeof ResizeObserver === "undefined" || !dock ? null : new ResizeObserver(apply);
    if (dock) observer?.observe(dock);
    window.addEventListener("resize", apply);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
      clear();
    };
  }, [agentChatOpen]);

  /*
   * 설정의 Agents 칸에서 「이 도구로 대화 열기」를 누르면 여기로 온다
   * (2026-08-16 검수: 「연결」하러 간 화면에 연결로 넘어갈 문이 없었다).
   * 문은 여전히 하나다 — 실행기만 지목하고 여는 것은 같은 함수가 한다.
   */
  useEffect(() => {
    return subscribeAgentChatIntent((runtimeId) => {
      if (runtimeId) setAcpRuntimeId(runtimeId);
      agentDockTouchedRef.current = true;
      openVaultAgent();
    });
  }, [openVaultAgent]);

  /*
   * 스스로 여는 것도 **같은 문**을 탄다. 여기 있는 이유는 위 `openVaultAgent`
   * 가 실행기 상태를 읽어야 해서다 — 이 효과가 갈래를 따로 고르면 그 순간
   * 대화창이 둘이 된다.
   */
  useEffect(() => {
    if (agentDockDefaultOpen !== true || agentDockTouchedRef.current) return;
    openVaultAgent();
  }, [agentDockDefaultOpen, openVaultAgent]);

  const handleSelect = useCallback(
    (
      slug: string,
      options?: {
        preserveImpact?: boolean;
        /**
         * INDEX 트리에서 고른 선택 (2026-07-24 소유자 지적) — 목록에서 행을
         * 누르면 좌측 패널이 슬림 탭으로 접혀 방금 펼친 자식이 사라졌다.
         * "목록을 보는 중" 이라는 맥락이 명확하므로 이 경우엔 좌측 패널을
         * 계속 열어 둔다(지도에서 고른 선택은 종전대로 접혀 지도가 넓어진다).
         */
        keepIndexOpen?: boolean;
      },
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
      // INDEX 트리에서 고른 선택은 목록을 접지 않는다 (2026-07-24 소유자
      // 지적: 행을 누르면 패널이 슬림 탭으로 접혀 방금 펼친 자식이 사라졌다).
      // 지도에서 고른 선택은 종전대로 접혀 지도가 넓어진다.
      if (options?.keepIndexOpen) setIndexManualExpandDuringSelection(true);
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

  /**
   * 지난 길 한 줄을 **지금 걷는 길로 다시 편다**. 순서가 곧 계약이다:
   *
   * ① 지금 걷던 길을 먼저 굳힌다 — 디바운스 대기 중이던 마지막 걸음까지
   *    보관되므로 다시 펴는 대가로 잃는 것이 없다.
   * ② 새 길 id 로 갈아탄다. 경로가 그대로면 `upsertPastWalk` 가 재보관을
   *    건너뛰므로 원본 줄이 제 날짜 그대로 남고, 여기서 이어 걸어 경로가
   *    달라지는 순간에만 새 줄이 생긴다.
   * ③ 정제된 걸음을 세션 궤적으로 적재 — 지도 발자국 링은 이 궤적의 파생이라
   *    렌더 코드를 건드리지 않고 그대로 다시 도장된다.
   * ④ 끝 걸음을 ego 포커스 — "지금 여기"가 그 길의 끝이다.
   */
  const handleReplayPastWalk = useCallback(
    (walkId: string) => {
      const target = refinedPastWalks.find(({ walk }) => walk.id === walkId);
      if (!target || target.entries.length < PAST_WALK_MIN_ENTRIES) return;
      flushPastTrail();
      setSessionWalkId(newPastWalkId());
      const ids = target.entries.map((entry) => entry.id);
      setFootprintTrail(ids);
      // 끝 걸음을 직접 방문으로 표시해 둔다 — 아래 handleSelect 가 일으키는
      // 방문 감지 effect 가 방금 적재한 궤적을 다시 흔들지 않게(같은 노드라
      // 결과는 같지만, 그 사실에 기대는 대신 명시한다).
      const last = ids[ids.length - 1];
      lastVisitedNodeRef.current = last;
      handleSelect(last);
    },
    [refinedPastWalks, flushPastTrail, handleSelect],
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

  const handleDatasheetClose = useCallback(() => {
    const focusReturnNodeId = panelDatasheetModel?.nodeId ?? null;
    // 3D 돔 (2026-08-18 소유자: *"x누르면 그냥 닫히거든? 선택된것도
    // 취소되고? 그거때문에 보기가 힘들어"*) — X 는 「패널을 접는 것」이지
    // 「고른 것을 버리는 것」이 아니다. 선택·ego 강조는 남기고 패널만 접는다
    // — Escape 사다리 1단(`nodePopoverDismissed`)과 같은 기구 재사용, 새 상태
    // 0개. 선택 해제는 빈 배경 클릭/Escape 2단의 몫. 다시 열기는 그 노드를
    // 다시 클릭(돔에서는 재클릭이 해제가 아니라 재선택이다 —
    // `topology-pointer-handlers.ts`). 2D 는 종전 그대로(닫기=접기 대칭,
    // 2026-07 원장) — 돔은 전개·밀도 게이트가 없어 그 대칭의 전제가 없다.
    if (view3d) {
      setNodePopoverDismissed(true);
    } else {
      handleClose();
    }
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      restoreTopologyFocusAfterDatasheetClose(focusReturnNodeId);
    });
  }, [handleClose, panelDatasheetModel?.nodeId, view3d]);

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
  const activateTourAnchor = useCallback(() => {
    if (!tourAnchorNodeId) return;
    setSelectedEdge(null);
    handleSelect(tourAnchorNodeId);
  }, [handleSelect, tourAnchorNodeId]);
  // 투어를 열 때 다른 전이 표면을 강등한다(§4 "열림 시" 계약) — create-node
  // composer 와 같은 "openX 가 나머지를 닫는다" 관례를 그대로 따른다.
  const openGuidedTour = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    closeCreateNode();
    tour.start();
  }, [closeCreateNode, tour]);

  // 안내 다시 보기 (2026-07-26) — 지도의 재진입은 우상단 나침반 타일이지만,
  // 설정 메뉴의 "화면 안내" 행은 여섯 목적지에서 같은 자리에 있어야 사용자가
  // 화면마다 다른 곳을 찾지 않는다. 나머지 다섯은 셸의 `DestinationGuide` 가
  // 등록하고, 지도는 자기 투어를 여는 이 함수를 등록한다.
  useRegisterGuideReplay(openGuidedTour);

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
    if (autoTourFiredRef.current || !tourAutoStartReady) return undefined;
    if (!readGuideAutoStart()) return undefined;
    // 「화면 안내」를 끈 사람에게는 어디서도 저절로 뜨지 않는다. 나침반 타일과
    // 설정 › 다시 보기는 그대로 열리므로, 안내가 사라지는 게 아니라 부를 때만 온다.
    if (readGuidedTourStatus() !== null) return undefined;
    // 첫 시도는 900ms 뒤 — 레이아웃/카메라 정착 뒤에 열어 1단계 카드가
    // 안정된 화면 위에 뜬다. Design Guardian (2026-07-24) stacked-transient
    // 가드: 발화 순간 모달(폴더 안내 시트 등)이 열려 있거나 문서 포커스가
    // 나가 있으면(백그라운드 탭 로드 · OS 폴더 선택창) 겹쳐 쏘지 않는다.
    //
    // 예전엔 재시도에 10회(≈19초) 상한이 있었는데, 그 상한이 곧 결함이었다 —
    // 첫 화면의 폴더 안내 시트를 읽고 OS 폴더 선택창까지 거치면 19초는 쉽게
    // 넘고, 그러면 투어는 storage 미기록 상태로 **영영 사라진다**. 실측
    // (2026-07-26): 모달을 27초 두고 닫았더니 투어가 끝내 뜨지 않았다.
    //
    // 그래서 상한을 없앴다. 무한 재시도처럼 보이지만 실제 동작은
    // "**막힘이 풀리는 첫 순간에 쏜다**" 이고, 그게 정확히 원하는 동작이다 —
    // 나중에 불쑥 튀어나오는 게 아니라, 가릴 것이 사라지자마자 뜬다. 틱 하나는
    // querySelector 세 번이라 비용이 없고, 발화 즉시·언마운트 시 멈추며,
    // 애초에 투어를 한 번도 안 본 사람에게만 돈다.
    //
    // 다만 "막힘이 풀리는 첫 순간"이 사용자가 이미 스스로 탐색을 시작한 뒤일
    // 수 있다 — 실측(2026-07-26): 시트를 [다음에]로 넘긴 뒤 2~6초 사이에 노드를
    // 클릭해 상세 패널을 연 사용자의 화면 위로 1/7 카드가 끼어들었다. 그래서
    // 대기 중 첫 실질 상호작용이 감지되면 **발화를 취소**한다(가드에 예외를
    // 더하는 방향은 안내가 자기가 소개할 것을 덮는 역효과가 이미 확인됐다).
    // 취소해도 길은 막히지 않는다 — 설정 › 화면 안내 › 다시 보기, 그리고 지도
    // 우상단 나침반 타일이 같은 투어를 연다.
    let timerId = 0;
    const tick = () => {
      if (autoTourFiredRef.current) return;
      if (canAutoStartGuidedTour()) {
        autoTourFiredRef.current = true;
        stopInteractionWatch();
        openGuidedTourRef.current();
        return;
      }
      timerId = window.setTimeout(tick, 2000);
    };
    const stopInteractionWatch = watchGuidedTourAutoStartCancel(() => {
      autoTourFiredRef.current = true;
      window.clearTimeout(timerId);
    });
    timerId = window.setTimeout(tick, 900);
    return () => {
      window.clearTimeout(timerId);
      stopInteractionWatch();
    };
  }, [tourAutoStartReady]);

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
      /*
       * ⚠️ **대화창 안에서 누른 Esc 는 지도의 것이 아니다** (2026-08-16 검수).
       *
       * 이 사다리는 `window` 에서 듣고 `event.target` 을 안 봤다. 그래서 대화
       * 작성 칸에 글을 쓰다가 Esc 를 누르면 — 한국어 입력을 취소하려는 손이
       * 흔히 하는 일이다 — **뒤에 있는 지도의 선택이 풀렸다.** 사용자가 보고
       * 있지도 않은 것이 바뀌는 것은 이 사다리가 약속한 「한 단계씩」이 아니다.
       *
       * 대화창은 자기 안의 것을 자기가 닫는다(지난 대화 목록). 그 안에서 더
       * 닫을 것이 없으면 아무 일도 안 일어나는 편이 맞다 — 지도를 건드리는
       * 것보다 낫다.
       */
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-testid="acp-chat-panel"], [data-testid="vault-agent-panel"]')
      ) {
        return;
      }
      const action = resolveTopologyEscLadderAction({
        realmActive: resolvedRealmSlug !== null,
        selectedEdgeActive: selectedEdge !== null,
        contextMenuOpen: contextMenuNode !== null,
        tourOpen: tour.open,
        createNodeOpen,
        bootstrapOpen,
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
        case "close-bootstrap":
          setBootstrapOpen(false);
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

  // 「작업공간」 칩과 함께 **고정 문서 수 계산도 걷어냈다** (2026-08-03).
  // 이 effect 는 드로어를 여닫을 때마다 localStorage 를 읽고 JSON 을 파싱해서
  // 오직 그 칩의 뱃지 하나를 먹였다. 칩이 없으면 읽는 곳이 0이므로, 남겨 두면
  // 화면에 없는 표면을 위해 매번 값을 치르는 꼴이다 —
  // `architecture.md` 「화면에 없는 표면의 모델은 만들지 않는다」.

  // #62 — 블로킹 표면이 열려 있는 동안 전역 단축키는 죽는다. 예전엔 표면마다
  // `if (createNodeOpen) return;` 을 손으로 달아서 **투어가 빠져 있었고**,
  // 투어 위에 `?` 단축키 모달이 겹쳐 뜨는 상태가 실제로 재현됐다. 이제 술어
  // 하나(`blocking-surface`)로 모아 새 표면이 생겨도 한 곳만 고치면 된다.
  const shortcutsSuppressed = shouldSuppressGlobalShortcuts({
    createNodeOpen,
    tourOpen: tour.open,
  });

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
        if (shortcutsSuppressed) return;
        setOntologySearchOpen((v) => !v);
      },
    },
    {
      combo: { key: "k", meta: true },
      onFire: () => {
        if (shortcutsSuppressed) return;
        setOntologySearchOpen((v) => !v);
      },
    },
    {
      combo: { key: "?" },
      onFire: () => {
        if (shortcutsSuppressed) return;
        setShortcutsOpen((v) => !v);
      },
    },
    {
      combo: { key: "d" },
      onFire: () => {
        if (shortcutsSuppressed) return;
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
        if (shortcutsSuppressed) return;
        if (!sampleModeSettled) return;
        requestVaultOpen();
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
  // 경로 없음 / **이 볼트에 없는 끝점**. 예전 path 패널이 좌측 슬롯에서 하던
  // 걸 상단 칩 1개로 압축 (분석 패널 완전 소멸 2단계 §b). 판정은 순수 함수로
  // 빠져 있다 — 근거와 옛 거짓말은 `../lib/topology-path-chip-state.ts`.
  const pathChipState = useMemo(
    () =>
      resolveTopologyPathChipState({
        sourceSlug: pathSourceSlug,
        targetSlug: pathTargetSlug,
        sourceTitle: pathSourceTitle,
        targetTitle: pathTargetTitle,
        hopCount: pathHopCount,
      }),
    [pathSourceSlug, pathTargetSlug, pathSourceTitle, pathTargetTitle, pathHopCount],
  );
  const pathChipLabel = useMemo(() => {
    if (!pathChipState) return null;
    switch (pathChipState.kind) {
      case "missing-endpoints":
        return t("analysis.pathChipMissingEndpoints", {
          slugs: pathChipState.missing.join(" · "),
        });
      case "awaiting-target":
        return t("analysis.pathChipUnresolved", { source: pathChipState.sourceTitle });
      case "no-path":
        return t("analysis.pathChipNoPath", {
          source: pathChipState.sourceTitle,
          target: pathChipState.targetTitle,
        });
      case "resolved":
        return t("analysis.pathChipResolved", {
          source: pathChipState.sourceTitle,
          target: pathChipState.targetTitle,
          hops: pathChipState.hops,
        });
    }
  }, [pathChipState, t]);
  const [pathPacketCopied, setPathPacketCopied] = useState(false);
  const copyPathPacket = useCallback(async () => {
    // 끝점이 이 볼트에 없으면 넘길 사실이 없다 — 없는 슬러그 둘과 「경로 없음」
    // 이라는 결론을 에이전트에게 넘기는 것이 이 버튼의 옛 결함이었다.
    if (!canCopyTopologyPathPacket(pathChipState)) return;
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
  }, [pathChipState, pathSourceSlug, pathTargetSlug, pathSourceTitle, pathTargetTitle, pathHopCount, t]);
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
  // 빈 폴더 스타터 스캐폴드 (2026-07-24) — '빈 폴더로 새로 시작' 과 같은
  // `scaffoldOntology()` 를 체크리스트 버튼으로도 노출한다. 자동 실행이
  // 아니라 명시 클릭이라 local-first 원칙(남의 폴더에 무단 쓰기 금지)을
  // 지킨다.
  const [starterScaffolding, setStarterScaffolding] = useState(false);
  const handleScaffoldStarter = useCallback(async () => {
    setStarterScaffolding(true);
    try {
      // #73 — 화면 언어로 만든 볼트는 그 언어로 읽히게 한다.
      const result = await vault.scaffoldOntology(activeLocale);
      toast.show(
        // #70 — 개념 수와 설정 파일 수를 따로 말한다(합치면 "8개" 인데 실제
        // 온톨로지 개념은 5개라 설정 패널의 "문서 5개" 와 어긋났다).
        t("startChecklist.scaffoldToast", {
          concepts: result.markdownCreated,
          configs: result.agentConfigCreated,
        }),
        "success",
      );
    } catch (err) {
      toast.show(
        err instanceof Error && err.message ? err.message : t("createNode.toastError"),
        "error",
      );
    } finally {
      setStarterScaffolding(false);
    }
  }, [vault, toast, t, activeLocale]);

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
  /**
   * 「머리 위 막대」의 문구 — 캔버스는 문자열을 만들지 않는다.
   *
   * `{count}` 자리표시자를 **그대로** 넘긴다: 실제 개수는 렌더러가 프레임마다
   * 알고(설정 「한 번에 여는 개수」와 남은 개수의 함수) 여기서는 모른다.
   * next-intl 의 보간을 못 쓰는 대신 자리표시자 규약을 계약 테스트가 잡는다.
   */
  const clusterBarLabels = useMemo(
    () => ({
      expandAll: t("cluster.barExpandAll"),
      expandCount: t("cluster.barExpandCount", { count: "{count}" }),
      collapse: t("cluster.barCollapse"),
    }),
    [t],
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
  /**
   * 부팅 long task 절단 (2026-08-19 실측). 이 페이지의 첫 클라이언트 커밋은
   * 「페이지 크롬 + 지도 위젯 마운트 + 지도 mount 이펙트(강제 레이아웃 포함)」
   * 를 **한 태스크**로 묶어 CPU 4배 스로틀 기준 324~335ms 를 붙잡고 있었다
   * (`/ko/topology/` 로드의 단일 최대 long task — 실기기에서도 보이는 멈춤).
   * 캔버스는 어차피 자기 rAF 첫 프레임 전에는 아무것도 그리지 않으므로,
   * 마운트를 **한 rAF 뒤로** 미루면 화면에 그려지는 것은 그대로인 채(첫
   * 페인트는 양쪽 다 빈 캔버스) 그 태스크가 「페이지 커밋」과 「지도 마운트」
   * 둘로 갈라진다. 리빌 연출은 지도의 첫 rAF 프레임에서 시작하는 계약 그대로다.
   */
  const [mapMountTaskReady, setMapMountTaskReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMapMountTaskReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
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

  const preloadProjectAsset = useCallback(
    (slug: string) => {
      const project = projectBySlug.get(slug);
      if (!project) return;

      const href = getProjectRuntimeDetailHref(slug);
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
    <main
      id="main"
      tabIndex={-1}
      // 에이전트 패널이 자리를 차지하면 화면 오른쪽에 붙는 고정 표면(선택-노드
      // 인스펙터)도 그만큼 안쪽으로 선다. 근거(노드)와 상대(에이전트)가 서로를
      // 덮으면 "지도를 같이 보며" 가 성립하지 않는다 — 규칙은 globals.css.
      data-agent-panel-open={agentChatOpen ? 'true' : 'false'}
      /*
       * ⚠️ **그 규칙이 재는 폭이 틀려 있었다** (2026-08-16 검수).
       *
       * globals.css 의 예약은 `var(--agent-panel-width)` — 키 갈래 패널이 쓰는
       * `clamp(320px, 26vw, 420px)` 이다. 그런데 코딩 에이전트 갈래는 폭을
       * **사용자가 끌어서** 정하고(320~968px) 그 토큰에 아무것도 안 쓴다.
       * 둘 다 `data-agent-panel-open='true'` 를 켜므로, 규칙은 엉뚱한 수로
       * 자리를 비웠다: 1512 폭에서 26vw = 393 인데 패널은 420 이라 인스펙터가
       * 27px 겹쳐 **폭 조절 손잡이를 덮었고**, 사용자가 넓혀 두면 인스펙터가
       * 패널 안으로 통째로 들어갔다.
       *
       * 규칙을 고치는 대신 **그 규칙이 읽는 값을 맞는 값으로 채운다** — 두
       * 갈래는 동시에 열리지 않으므로 이 덮어쓰기가 키 갈래를 건드리지 않는다.
       */
      style={
        runtimeChatOpen
          ? ({ '--agent-panel-width': `${chatWidth.width}px` } as CSSProperties)
          : undefined
      }
      className="relative flex h-full w-full overflow-hidden bg-[color:var(--color-canvas)]"
    >
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
                  className="h-[26px] w-[26px] shrink-0 rounded-chip border border-[color:var(--color-border-soft)] object-cover"
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
                    className="block truncate text-label text-[color:var(--color-text-quaternary)]"
                  >
                    ontology-atlas
                  </span>
                  <p className="mt-0.5 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('mobileTagline')}
                  </p>
                </div>
              </div>
            </div>
            {/* 좌상단 브랜드/워크스페이스 필 완전 은퇴 (소유자 지시
                2026-07-24) — R6(오버뷰 제거)·7-23(선택 상태 은퇴) 이후에도
                drawerOpen 조건이 남아 노드 클릭마다 사실상 부활했다. 선택은
                팝오버/링이, INDEX 재열기는 세로 탭이, 프로젝트 이동은 레일이
                이미 담당 — 중복 잉크라 마운트 자체를 제거한다. */}
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
                          href={buildOntologyInsightsReturnHref(
                            insightsReturnTab,
                            insightsReturnReviewId,
                          )}
                          label={t("insightsReturn.label")}
                          ariaLabel={t("insightsReturn.ariaLabel")}
                          dismissAriaLabel={t("insightsReturn.dismissAriaLabel")}
                          onDismiss={() => {
                            setRouteState({
                              insightsReturnTab: null,
                              insightsReturnReviewId: null,
                            });
                          }}
                        />
                      ) : undefined
                    }
                    pathChip={
                      analysisMode === "path" && pathChipLabel ? (
                        <TopologyPathChip
                          label={pathChipLabel}
                          resolved={canCopyTopologyPathPacket(pathChipState)}
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
                      /*
                       * 걸어온 길 칩 — **방문 1개부터** (2026-08-03 소유자 지적:
                       * *"노드 1개만 봤을때 상단에 걸어온길에 안나오는 이슈"*).
                       *
                       * 종전 문턱은 2였다. 근거는 「길은 둘 이상이어야 길이다」
                       * 였는데, 이 칩이 실제로 하는 일은 길 그리기만이 아니라
                       * **에이전트 인계 패킷**과 **되돌아갈 문**이다 — 그 둘은
                       * 방문 하나에서도 값이 있고, 오히려 첫 노드를 열어 본
                       * 직후가 「이걸 AI 에게 넘기고 싶다」가 가장 강한 순간이다.
                       * 문턱이 2 라서 그 순간에만 문이 없었다.
                       */
                      footprintTrailEntries.length >= 1 ? (
                        <TopologyTrailChip
                          label={t("footprint.chipLabel", { count: footprintTrailEntries.length })}
                          entries={footprintTrailEntries}
                          currentId={canvasSelectedSlug}
                          copied={footprintPacketCopied}
                          onFocusEntry={(id) => handleSelect(id)}
                          onCopyPacket={copyFootprintPacket}
                          onClear={clearFootprintTrail}
                          onLensChange={handleFootprintLens}
                          onHoverEntry={handleFootprintBrush}
                          pastWalks={pastWalkRows}
                          pastNotice={pastTrailNotice}
                          onReplayPastWalk={handleReplayPastWalk}
                          onDeletePastWalk={handleDeletePastWalk}
                          onClearPastWalks={handleClearPastWalks}
                          labels={{
                            heading: t("footprint.heading"),
                            triggerAriaLabel: t("footprint.triggerAriaLabel"),
                            currentLabel: t("footprint.currentLabel"),
                            justNowLabel: t("footprint.justNowLabel"),
                            stepsAgoLabel: (count) => t("footprint.stepsAgoLabel", { count }),
                            rowAriaLabel: (title) => t("footprint.rowAriaLabel", { title }),
                            copyLabel: t("footprint.copyLabel"),
                            copyAriaLabel: t("footprint.copyAriaLabel"),
                            copyCopiedAriaLabel: t("footprint.copyCopiedAriaLabel"),
                            clearLabel: t("footprint.clearLabel"),
                            clearAriaLabel: t("footprint.clearAriaLabel"),
                            pastLinkLabel: t("footprint.pastLinkLabel", {
                              count: pastWalkRows.length,
                            }),
                            pastHeading: t("footprint.pastHeading"),
                            pastBackAriaLabel: t("footprint.pastBackAriaLabel"),
                            pastDeleteAriaLabel: t("footprint.pastDeleteAriaLabel"),
                            pastClearAllLabel: t("footprint.pastClearAllLabel"),
                            pastClearAllConfirmLabel: t("footprint.pastClearAllConfirmLabel"),
                            pastCapCaption: t("footprint.pastCapCaption"),
                            pastEmptyBody: t("footprint.pastEmptyBody"),
                          }}
                        />
                      ) : undefined
                    }
                  />
                  {selectedNodeOwnsRightRail ? null : (
                    <>
                    {/* Mobile-only settings escape hatch: the utility lane is
                        hidden while the expanded INDEX owns the <md surface. */}
                    {renderedIndexState === "expanded" ? (
                      <div
                        className="pointer-events-auto absolute right-4 top-4 z-[var(--z-map-scrim)] md:hidden"
                        data-testid="topology-mobile-settings"
                      >
                        <AppSettingsMenu
                          mode={vault.status === 'loaded' ? 'local' : 'static'}
                          triggerVariant="chrome-tile"
                          screenControls={{
                            audiencePlain,
                            onAudiencePlainChange: setAudiencePlain,
                            indexCollapsed: indexPanelCollapsedStored,
                            onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
                          }}
                        />
                      </div>
                    ) : null}
                    <div
                      // 겹침 소탕 2026-07-23 — ① <md 확장 INDEX(풀-블리드 시트)
                      // 동안은 시트가 주 표면이므로 레인 전체가 물러난다(시트
                      // 상단 인셋 24px 위로 칩 상단 8px 이 삐져나와 보이던 결함).
                      // ② 칩별 라벨은 아래 max-xl/max-2xl [data-chip-label]
                      // 사다리로 축약 — 라벨 총폭 499px 가 768–1365 구간에서
                      // 중앙 검색 레인·확장 INDEX 와 겹치던 원인.
                      className={`topology-ui-scale absolute right-4 top-4 flex-col items-end gap-2 md:right-6 md:top-6 xl:right-8 xl:top-8 ${
                        activityInboxOpen ? "z-30" : "z-20"
                      } ${renderedIndexState === "expanded" ? "hidden md:flex" : "flex"}`}
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
                      <div className="flex items-center gap-[var(--topology-utility-lane-gap)]">
                    {/* 「에이전트」 — 지도를 보다가 "이거 고쳐줘" 가 되는
                        순간이 이 버튼의 자리다. 레일 목적지도 새 라우트도 만들지
                        않고 기존 유틸 레인의 칩 규격을 그대로 쓴다(표면 추가 0).
                        이름은 `vaultAgentPanel.title` **한 곳**에서만 정의된다 —
                        칩·툴팁·aria·패널 헤더가 같은 키를 읽으므로 이름이 바뀌면
                        네 자리가 함께 바뀐다(이름은 다시 검토될 수 있다).
                        데스크톱 전용: 웹에는 키를 안전하게 둘 곳도 보낼 경로도
                        없으므로, 열리지 않을 문을 그려 두지 않는다. */}
                    {llmBridgeAvailable ? (
                      <Tooltip content={tAgent('title')} side="bottom" withProvider={false}>
                        <ChromeChip
                          onClick={() =>
                            (agentDockTouchedRef.current = true,
                            agentChatOpen ? closeVaultAgent() : openVaultAgent())
                          }
                          aria-label={tAgent('title')}
                          aria-pressed={agentChatOpen}
                          data-testid="topology-vault-agent-toggle"
                          active={agentChatOpen}
                          compact={topologyUtilityChromeCompact}
                          icon={<MessageCircle />}
                        >
                          {tAgent('title')}
                        </ChromeChip>
                      </Tooltip>
                    ) : null}
                    {/* 온보딩 디자이너 지적 — 첫 실행 카드 dismiss 후에도 살아남는
                        상시 "내 데이터로 전환" 진입점. 정적 샘플 모드에서만
                        보이고(카드 dismiss 와 독립), 실제 vault 연결 시 소멸.
                        chrome 타일 규격(ChromeChip) 준수, 조용한 support 표면. */}
                    {sampleModeSettled ? (
                      <Tooltip content={t('controls.switchToMyDataTooltip')} side="bottom" withProvider={false}>
                        <ChromeChip
                          onClick={requestVaultOpen}
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
                    {/*
                        「변경점 N개」를 지웠다 (2026-08-02, 소유자 지적:
                        *"(변경점 2개) 버튼을 누르면 지도 노드에서 표현이
                        되어야지? 선택되면서.."*).

                        그 버튼은 `/ontology/` 로 갔는데 **그 주소는 `/topology`
                        로 되돌리는 리다이렉트**다 — 지도에서 눌러 지도로 돌아오는
                        왕복이고, 그 사이 보고 있던 선택·펼침·카메라를 잃는다.
                        아무 일도 안 일어나는 게 아니라 **상태만 잃는** 버튼이었다.

                        숫자는 바로 옆 「최근 변경」 칩이 이미 badge 로 들고 있고,
                        그쪽은 지도에서 **실제로 강조**한다. 숫자와 동작이 한자리에
                        오면서 크롬이 하나 줄었다.
                    */}
                    {/* 살아있는 그래프(물리) 토글은 제거됐다(#19, fable 판정
                        2026-07-25) — 상시 force 시뮬은 어느 청중의 과업에도
                        봉사하지 않고(읽기엔 위치 안정성이 생명) 공간 기억을
                        파괴했다. 자유 드래그는 남는다(그 노드만 이동, 세션 한정,
                        상시 물리 없음). */}
                    {/* 최근 변경 스포트라이트 (협의회 설계 2026-07-23) — 렌즈
                        토글. 스포트라이트 칩의 ChromeChip 문법/축약 사다리.
                        상태는 URL `?recent=` 단일 진실원 (공유/에이전트 재현). */}
                    <Tooltip
                      /*
                       * 왜 세 갈래인가 (2026-08-03 소유자 실보고: *"'최근 변경'
                       * 누르니까 아무런 반응이 없는데?"*).
                       *
                       * 종전 빈 상태 문구는 **「문서를 고치면 여기서 짚어드려요」**
                       * 하나였는데, 샘플을 보는 사람에게 그건 **고칠 문서가 있다는
                       * 전제**다. 실제 이유는 다르다 — 샘플의 날짜는 이 저장소가
                       * 그 픽스처를 마지막으로 건드린 시각이라 사용자와 아무 상관이
                       * 없고, 그래서 이 기능은 **폴더를 열기 전에는 뜻을 가질 수
                       * 없다.** 이유가 다르면 문장도 달라야 한다.
                       *
                       * 팝업은 안 띄운다. 「아무것도 없다」를 말하려고 모달을 여는
                       * 것은 누른 사람에게 일을 두 번 시키는 것이고, 이 저장소가
                       * 「popup soup」로 금지한 부류다(아래 칩 주석의 2026-08-02
                       * 판단 그대로 유효). 대신 **비활성이 비활성처럼 보이게** 했다
                       * — 그게 없어서 눌러 보고 나서야 알게 됐던 것이다
                       * (`chrome-chip.tsx` 의 `DISABLED_CLASS`).
                       */
                      content={
                        spotlightOn || recentChanges.recentNodeIds.size > 0
                          ? t('controls.spotlightTooltip')
                          : vault.status === 'loaded'
                            ? t('controls.spotlightEmptyTooltip')
                            : t('controls.spotlightSampleTooltip')
                      }
                      side="bottom"
                      withProvider={false}
                    >
                      <ChromeChip
                        onClick={handleToggleSpotlight}
                        /*
                         * 바뀐 게 없으면 **누를 수 없다** (2026-08-02, 소유자:
                         * *"변경이 없을때는 그럼 버튼 클릭을 비활성화 하면 되는거
                         * 아닌가? 누르면 팝업 나와서 변경된게 없다고 띄우거나"*).
                         *
                         * 팝업 안은 안 골랐다 — 아무것도 없다는 사실을 말하려고
                         * 모달을 여는 것은 누른 사람에게 일을 두 번 시키는 것이고,
                         * 이 저장소가 「popup soup」로 금지한 부류다.
                         *
                         * **숨기지도 않는다.** 사라지면 「최근 변경이라는 기능이
                         * 있었나」가 되고, 그건 이 세션에서 이미 겪은 문제다(무라벨
                         * 아이콘이라 못 찾았다). 자리는 남기고 이유는 툴팁이 말한다
                         * — `BlockImportModule` 의 「disabled + 힌트로 존치, 완전
                         * 은폐 금지」와 같은 규율.
                         *
                         * 켜져 있는 동안은 **끌 수 있어야** 하므로, 꺼져 있고
                         * 강조가 0일 때만 비활성이다.
                         */
                        /*
                         * 샘플에서는 **비활성이 아니다** — 누르면 폴더 안내가 열린다.
                         * 비활성은 「내 폴더를 열었는데 최근 변경이 0」일 때만이고,
                         * 그때는 정말로 보여줄 게 없다.
                         */
                        disabled={
                          !spotlightNeedsVault && !spotlightOn && recentChanges.recentNodeIds.size === 0
                        }
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
                        /*
                         * 이름을 **항상** 보인다 (2026-08-02, 소유자:
                         * *"최근 변경이라는 버튼이 어디에있음? 없는데?"*).
                         *
                         * 종전 `max-2xl` 은 **1536px 미만에서 라벨을 숨겼다** —
                         * 옆의 「작업공간」·「내 데이터로 전환」은 1280px 미만에서
                         * 숨기므로, 1512px 창에서는 **이 버튼 하나만** 이름이
                         * 사라져 무라벨 시계 아이콘이 됐다. 못 찾는 게 당연했다.
                         *
                         * 이제 이 칩이 「변경점 N개」가 하던 일까지 가져왔으므로
                         * 상단 크롬에서 **변경을 말하는 유일한 자리**다 — 그 자리가
                         * 이름 없이 설 이유가 없다.
                         */
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
                              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--topology-utility-lane-count-surface)] px-1.5 font-mono text-label tabular-nums text-[color:var(--topology-utility-lane-count-text)]"
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
                    {/*
                      ⚠️ **「작업공간」 칩을 뺐다** (2026-08-03, PO 카운슬 평결 ⑥ ·
                      소유자 지시 *"이것도 그냥 lnb에서 문서함 누르면 나오는거 아닌가"*).

                      채택된 규칙: **지도 위 칩은 지도를 바꿀 때만 그 자리에 설
                      자격이 있다.** 이 칩은 드로어를 열 뿐 지도를 안 바꿨다 —
                      LNB 의 일이다. 게다가 자기 라벨(`docsLabel: "작업공간"`)과
                      자기 툴팁(`docsTooltip: "문서함 빠른 보기"`)이 **한 컨트롤
                      안에서 서로 다른 이름**을 쓰고 있었고, LNB 에는 이미 「문서함」이
                      있어 같은 화면에 같은 말이 둘이었다.

                      **드로어는 살아 있다** — `D` 단축키(단축키 시트에 등재)와
                      INDEX 푸터 경로가 그대로 연다. 없앤 것은 칩 하나지 표면이
                      아니다.

                      이건 재발견이다: 2026-08-02 에 「변경점 N개」가 **같은 이유**
                      (왕복만 하고 지도 상태를 안 바꾼다)로 이미 지워졌다. 규칙이
                      없어서 매번 한 개씩 손으로 발견하고 있었다 — 그래서 이번엔
                      규칙을 원장에 등재했다.
                    */}
                    {/*
                      ⚠️ **「+ 개념」 크롬 필을 뺐다** (2026-08-03, 소유자 지시).
                      *"이거좀 이상해 없어져도 될듯?"*

                      이 필은 「노드가 이미 있는 지도에서, 아무것도 안 고른 채
                      새 개념을 만들 때」의 **유일한** 문이었다 — 빈 지도의 두
                      진입점(시작 체크리스트 · 빈 상태)은 지도가 차면 사라지기
                      때문이다. 그래서 그냥 지우면 populated 지도에서 만들 길이
                      통째로 없어진다.

                      그 자리를 **빈 캔버스 우클릭**이 대신한다(`onContextMenuPane`).
                      빈 자리 우클릭은 어느 도구에서나 «여기에 새로 만들기»의
                      관용구이고, 무엇보다 **클릭한 좌표가 곧 새 노드의 자리**라
                      상단 고정 버튼보다 뜻이 분명하다. 상시 잉크도 0이 된다.
                    */}
                    {/* 기록 <lg 진입점. `lg+` 는 레일 목적지가 담당하고
                        레일이 사라지는 `<lg` 에서는 이 크롬 타일이 같은
                        목적지로 보낸다 — 브레이크포인트가 달라도 **같은
                        표면**을 본다.

                        2026-07-25: 이 타일은 원래 560px 모달을 열었다. 기록이
                        목적지로 승격되면서 링크로 바꿨다 — 모바일만 모달을 보면
                        같은 기능이 두 표면으로 갈린다. `audiencePlain` 게이트도
                        제거: 목적지는 전 청중에 노출한다("누가 언제 무슨 의미를
                        바꿨나" 는 기획자·임원도 보는 정보이고 개발 작업이 아니다).
                        청중에 따라 진입점 수가 달라지는 것 자체가 #65 계열이다. */}
                    {(
                      <Link
                        href="/git/"
                        aria-label={tAtlasGit('tileLabel')}
                        title={tAtlasGit('tileLabel')}
                        data-testid="topology-git-lg-tile"
                        className="relative lg:hidden flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
                      >
                        <HistoryIcon className="size-[var(--topology-chrome-icon-size)]" aria-hidden />
                        {ontologyChangeset.touchedNodeIds.size > 0 ? (
                          <span
                            aria-hidden="true"
                            data-testid="topology-git-lg-tile-dot"
                            className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]"
                          />
                        ) : null}
                      </Link>
                    )}
                    {/* 설정 <lg 진입점 (겹침 소탕 2026-07-23) — 내비 레일
                        (lg+ 전용)의 설정 슬롯이 사라지는 <lg 에서 설정 접근
                        수단이 0 이었다. 레일 슬롯과 같은 단일 설정 시트를
                        chrome-tile 변형으로 레인 끝에 꽂는다 — 하단 탭바
                        5-목적지 계약은 불변. lg+ 에선 레일 톱니가 담당. */}
                    <div className="lg:hidden">
                      <AppSettingsMenu
                        mode={vault.status === 'loaded' ? 'local' : 'static'}
                        triggerVariant="chrome-tile"
                        screenControls={{
                          audiencePlain,
                          onAudiencePlainChange: setAudiencePlain,
                          indexCollapsed: indexPanelCollapsedStored,
                          onIndexCollapsedChange: handleChangeIndexDefaultCollapsed,
                        }}
                      />
                    </div>
                      </div>
                      {/* 활동 줄 **전체**(누가 · 언제 · 어느 노드 · 종 · 알림함)가
                          위쪽 버튼들 아래 줄에 산다. 소유자 지시 두 번:
                          *"사용자가 위는 봐도 아래는 잘 안볼듯한데"* →
                          *"줄 전체를 하단으로!"*. 지도 하단에는 남기지 않는다 —
                          같은 사실이 두 곳에 있으면 헷갈린다(실측 2곳).
                          게이트: `tests/e2e/agent-activity-placement.spec.ts`. */}
                      <AgentActivityChip
                        suppressed={Boolean(v2DatasheetModel)}
                        onOpenChange={setActivityInboxOpen}
                      />
                    </div>
                    </>
                  )}
                </>
              ) : null}
            </div>
            {bootstrapOpen && bootstrapPlan ? (
              <>
                <button
                  type="button"
                  aria-label={t('bootstrap.cancel')}
                  className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
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
                      runtimeSkills: (count) => t("bootstrap.runtimeSkills", { count }),
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
                  className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
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
                  // 다이얼로그 폭 스케일 채택 (#8 준비, 2026-07-25) — 공용
                  // composer-width 대신 캐노니컬 --dialog-w-md(560px) 를 직접
                  // 참조해 "개념 추가" 팝업이 스케일 위에 앉게 한다. 좁은
                  // 뷰포트는 calc 로 감싼다.
                  className="absolute left-1/2 top-[var(--topology-blocking-composer-top)] z-30 max-h-[var(--topology-blocking-composer-max-height)] w-[min(var(--dialog-w-md),calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto"
                  data-testid="topology-create-node-panel"
                  data-attention-role="blocking-composer"
                  data-placement-contract="centered-blocking-edit"
                  data-surface-role="blocking-edit-surface"
                  data-elevation-contract="solid-panel-over-dimmed-map"
                  data-size-contract="bounded-centered-composer"
                  data-top-token="--topology-blocking-composer-top"
                  data-width-token="--dialog-w-md"
                  data-max-height-token="--topology-blocking-composer-max-height"
                >
                  <CreateNodeForm
                    onCreate={createNode}
                    onCancel={closeCreateNode}
                    domainOptions={createNodeDomainOptions}
                    labels={{
                      headingId: CREATE_NODE_DIALOG_TITLE_ID,
                      heading: t('createNode.heading'),
                      titlePlaceholder: t('createNode.titlePlaceholder'),
                      kind: t('createNode.kind'),
                      domain: t('createNode.domain'),
                      domainQuestion: t('createNode.domainQuestion'),
                      domainNone: t('createNode.domainNone'),
                      domainHelper: t('createNode.domainHelper'),
                      create: t('createNode.create'),
                      cancel: t('createNode.cancel'),
                      kindLabels: {
                        project: t('createNode.kindProject'),
                        domain: t('createNode.kindDomain'),
                        capability: t('createNode.kindCapability'),
                        element: t('createNode.kindElement'),
                      },
                      primaryNamePlaceholder: t('createNode.primaryNamePlaceholder'),
                      secondaryNamePlaceholder: t('createNode.secondaryNamePlaceholder'),
                      localeNamesHint: t('createNode.localeNamesHint'),
                      primaryLocaleRequired: t('createNode.primaryLocaleRequired'),
                    }}
                    defaultKind={createNodeDefaultKind}
                    defaultDomain={createNodeSeedDomain}
                    // 어권별 이름 — 지금 화면 언어가 필수 칸, 나머지가 선택
                    // 칸(소유자 지시 2026-07-24).
                    localeNames={{
                      primaryLocale: activeLocale,
                      secondaryLocale: activeLocale === 'ko' ? 'en' : 'ko',
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
                  className="absolute inset-0 z-[var(--z-map-scrim)] cursor-default bg-[color:var(--topology-blocking-backdrop-surface)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
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
                  <section className="rounded-card border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-4 py-3 shadow-[var(--topology-blocking-composer-shadow)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          id="topology-create-node-unavailable-title"
                          className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-text-soft)]"
                        >
                          {t('createNode.unavailableHeading')}
                        </p>
                        <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">
                          {t('createNode.unavailableBody')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeCreateNode}
                        aria-label={t('createNode.cancel')}
                        className={controlClass({
                          shape: "icon",
                          size: "sm",
                          tone: "muted",
                          className:
                            "hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
                        })}
                      >
                        <X size={ICON_SIZE.sm} aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeCreateNode();
                        setDocsDrawerOpen(true);
                      }}
                      data-testid="topology-create-node-open-workspace"
                      className={controlClass({
                        shape: "pill",
                        size: "md",
                        tone: "accentOnTint",
                        className:
                          "mt-3 justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
                      })}
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
            {!selectedRelationActive && !topologyCreateNodeBlockingActive
              ? indexSlotFrames.map((frame) => (
              <div
                // 접힘 ↔ 펼침은 **같은 자리를 두 표면이 번갈아 쓰는 교체**다.
                // 전이가 없어 300px 폭 10행이 1프레임에 존재/비존재를 왕복했고
                // (휘도 Δ13.6 / 17ms), 같은 클릭의 카메라는 200ms 를 썼다 — 한
                // 동작이 세 개의 시간을 가졌다. `key` 로 교체를 명시해 도착
                // 표면이 지도 위 큰 표면의 공용 문법(`.map-overlay-in`,
                // 180ms 불투명도)으로 들어온다: 팝오버·패널·전면 상세가 한
                // 클럭을 쓴다.
                key={`${frame.state}-${frame.exiting ? "out" : "in"}`}
                // `topology-ui-scale` — top-left-chrome-group(브랜드 pill)도
                // 같은 클래스로 ≥1920px/≥2400px 에서 zoom 배율이 걸린다. 이
                // wrapper 가 이 클래스 없이 고정 px 로만 있으면 그 zoom 배율
                // 아래에서 pill 이 이 wrapper 보다 비례적으로 더 커져 다시
                // 겹친다 — `--topology-index-top` 주석 참조.
                className={`${frame.exiting ? "map-overlay-out pointer-events-none" : "map-overlay-in"} topology-ui-scale absolute z-20`}
                aria-hidden={frame.exiting || undefined}
                inert={frame.exiting || undefined}
                style={{
                  left: frame.state === "expanded" ? "var(--topology-index-inset)" : 0,
                  // J (소유자 실보고 2026-07-23) — 상시 "지형도" 헤더가
                  // 은퇴한 뒤 전개 스택 위 84px 이 빈 띠로 남았다. 전개
                  // 상태는 크롬 인셋(24px)까지 올린다. 브랜드 pill 이 뜨는
                  // 상태(선택/드로어)에선 C 자동 강등으로 스택이 접힘 탭이
                  // 되므로 pill 과의 겹침이 구조적으로 없다. 접힘 탭은
                  // pill 아래 정렬을 위해 기존 84px 유지.
                  top:
                    frame.state === "expanded"
                      ? "var(--topology-index-inset)"
                      : "var(--topology-index-top)",
                  // rank7 — 하단 인셋은 전용 토큰: 데스크톱에선 크롬 인셋과
                  // 동일, <md 시트 모드에선 BottomTabBar 예약고 위로 올라간다.
                  bottom:
                    frame.state === "expanded"
                      ? "var(--topology-index-bottom-inset)"
                      : undefined,
                }}
              >
                {frame.state === "expanded" && indexTreeResult ? (
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
                    onSelect={(id) => handleSelect(id, { keepIndexOpen: true })}
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
                    /*
                     * 「사람이 쓴 것」 렌즈 — 지도의 검수 대기 링과 같은 사실을
                     * 세는 자리. 하나도 없으면 `null` 이라 세그먼트가 안 뜬다:
                     * 빈 렌즈는 누르면 아무 일도 안 일어나는 죽은 컨트롤이다.
                     */
                    humanAuthored={humanAuthoredLens}
                    // P4c — "지도에 없는 문서 N개 · 올리기". `bootstrapPlan` 은
                    // vault 가 로드되기만 하면(빈 지도든 아니든) 항상 계산돼
                    // 있으므로 새 파생 없이 그 카운트를 그대로 노출한다 —
                    // 클릭은 기존 "내 문서로 지도 만들기" 다이얼로그를 연다
                    // (이전에는 지도가 완전히 빈 상태의 empty-state 에서만
                    // 열렸다; 이 행은 지도가 이미 채워진 상태에서도 연다).
                    uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                    // ④ 살아있는 지도 드리프트 — dusty 카운트. 0 이면 행 숨김.
                    dustyNodeCount={dustySlugs.size}
                    unboundProjectNodeId={unboundProjectSource?.nodeId ?? null}
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
                      agentSyncIdle: t("index.agentSyncIdle"),
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
                      segmentHuman: humanAuthoredLens
                        ? t("index.segmentHuman", { count: humanAuthoredLens.ids.size })
                        : undefined,
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
                      sourceUnboundLabel: t("index.sourceUnboundLabel", {
                        count: unboundProjectSource?.count ?? 0,
                      }),
                      sourceUnboundAction: t("index.sourceUnboundAction"),
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
                ))
              : null}
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
          className={`absolute inset-0 transition-[opacity,filter] duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none ${
            topologyCreateNodeBlockingActive
              ? "pointer-events-none"
              : ""
          }`}
        >
          <>
              <div
                key={localGraphRoot ?? '__root__'}
                className="absolute inset-0 animate-[topologyFade_var(--motion-base)_var(--motion-ease)]"
              >
                {/* Empty-state overlay when the visible Sigma graph has 0–1
                    nodes — the lone Sigma dot otherwise reads as a broken
                    canvas. 빈 vault 는 Sigma 를 아예 마운트하지 않고 바로 빈
                    상태만 보여 WebGL/토폴로지 모양이 잠깐 보이는 회귀를 막는다. */}
                {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
                  /*
                   * 2026-07-24 온보딩 라운드 — 쓰기 가능한 로컬 vault 를 연
                   * 사람에게 dead-end 문구 대신 진행형 시작 체크리스트를 세운다.
                   *
                   * ⚠️ **2026-08-03 게이트 확장** (PO 5석 + 디자인 4석 평결).
                   * 종전 조건은 `&& (bootstrapPlan?.elements.length ?? 0) === 0`
                   * — 즉 **진짜 빈 폴더만** 체크리스트를 봤다. 그 한 줄 때문에
                   * 문서가 한 장이라도 있는 폴더, 곧 **개발 저장소를 연 사람**은
                   * 에이전트 연결과 「AI 에게 줄 지시 복사」로 가는 문이 통째로
                   * 닫혀 있었다 — 정확히 이 흐름이 도우려던 그 사람이다.
                   * `TopologyEmptyState` 의 docs-found 갈래는 「내 문서로 지도
                   * 만들기」만 주고 에이전트 이야기를 한 마디도 안 한다.
                   *
                   * 그래서 판정을 「쓸 수 있는 볼트인가」 하나로 좁히고, 문서가
                   * 있으면 **체크리스트의 1단이 부트스트랩으로 바뀐다**(아래
                   * `docsFoundCount`). 화면을 새로 만든 게 아니라 이미 있던
                   * 화면에 도달하게 한 것이다 — 팝업 신설 0.
                   */
                  canCreateNode && !startStepsDismissed ? (
                    <VaultStartSteps
                      agentConnected={agentConnect.status.kind === "connected"}
                      acpRuntimeLabel={acpRuntimeLabel}
                      onCreateNode={openCreateNodeWithKind}
                      // '기존 폴더 선택'으로 빈 폴더를 연 사용자에게 '빈 폴더로
                      // 새로 시작' 과 같은 스타터를 버튼으로 제공한다
                      // (2026-07-24). 문서가 이미 있으면 미전달.
                      onScaffoldStarter={
                        (vault.manifest?.docs.length ?? 0) === 0
                          ? handleScaffoldStarter
                          : null
                      }
                      scaffolding={starterScaffolding}
                      /*
                       * 문서가 있는 폴더면 그것이 첫 걸음이다 — 빈 폴더의
                       * 1순위(에이전트 연결)는 빈 폴더 맥락의 순서였고, 이미
                       * 가진 것이 있는 사람에게 첫 걸음은 그 가진 것이다.
                       */
                      docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                      onStartFromDocs={
                        bootstrapPlan && bootstrapPlan.elements.length > 0
                          ? () => setBootstrapOpen(true)
                          : undefined
                      }
                      /*
                       * 지시문은 **볼트 경로를 아는 빌더**가 만든다. 종전엔 i18n
                       * 문자열이라 경로가 없었고, 그래서 에이전트가 어느 폴더를
                       * 보라는 것인지 문장만으로는 알 수 없었다.
                       */
                      analyzePrompt={analyzePrompt}
                      /*
                       * 붙여넣을 곳이 **이 앱 안에** 있으면 복사를 시키지 않는다
                       * (2026-08-16 소유자: *"두번짼 뭔지도 모르겠고"*). 지시를
                       * 대화 작성 칸에 앉히고, 보내는 것은 여전히 사람이 한다.
                       */
                      onSendAnalyzeToAgent={
                        agentChatUsesRuntime ? sendAnalyzeToAgent : null
                      }
                      // 2026-08-16 소유자 실보고 — 카드가 INDEX 오른쪽 가장자리와
                      // 겹쳐 보였다. INDEX 는 지도 칼럼을 좁히지 않고 그 **위에
                      // 뜨므로**(오른쪽 에이전트 패널은 flex 형제라 실제로 좁힌다)
                      // 카드의 중앙 계산에서 혼자 빠진다. 그 폭을 알려 준다.
                      indexExpanded={renderedIndexState === "expanded"}
                      onFinish={dismissStartSteps}
                      /*
                       * 이 걸음의 이름은 **연결**이고, 연결이 사는 곳은 설정의
                       * Agents 칸이다 — 무엇이 잡혔는지 보고, 무엇을 쓸지 고르는
                       * 자리다(2026-08-16 소유자 지적).
                       *
                       * ⚠️ 종전에는 잡힌 것이 있으면 **대화**를 열었다. 그러면
                       * 「연결」이라고 적힌 버튼이 대화를 여는 것이라 이름과 한
                       * 일이 어긋난다. 대화로 가는 문은 따로 있다(유틸 레인의
                       * 「에이전트」 칩 · 다음 걸음의 「에이전트에게 시키기」).
                       */
                      onOpenAgentConnect={() => requestSettingsView("runtimes")}
                    />
                  ) : (
                  <TopologyEmptyState
                    projectCount={emptyTopologyNodeCount}
                    reason={topologyOverlayState.emptyReason}
                    canCreateNode={canCreateNode}
                    onCreateNode={openCreateNode}
                    // 능력으로 가른다 — `OpenVaultCta` 와 같은 단일 출처다.
                    // 종전엔 위젯이 `isTauriVaultRuntime() || 볼트 열림` 을 스스로
                    // 물었고, 둘 다 아닌 **FSA 지원 웹 방문자**에게 「앱을
                    // 설치하세요」로 답했다(2026-08-08 카운슬 실측).
                    canPickFolder={vault.status !== 'unsupported'}
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
                {topologyRenderState.renderCanvas && mapMountTaskReady ? (
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
                    /* 방향키로 걸을 곳이 없을 때 **말해 준다** (2026-08-10, 소유자).
                       눌렀는데 아무 반응이 없으면 사용자는 「고장」과 「그 방향에는
                       없음」을 구별할 수 없다. 문구와 표면은 페이지가 소유한다 —
                       위젯은 사건만 내보낸다(그 위젯은 프로바이더 없이 시험된다). */
                    walkNoticeLabel={tTopologyKeyboardWalk("deadEnd")}
                    focus={{ selectedSlug: canvasSelectedSlug }}
                    /* 볼트를 세션 중에 갈아 끼우면(샘플 → 로컬) 지도가 직전
                       그래프의 카메라로 새 그래프를 그리던 결함을 닫는다. 값의
                       단일 출처는 위 `useVaultIdentityScope()` 하나이고, 딥링크
                       정리가 쓰는 것과 **같은 신호**다 — 「지금 보고 있는 볼트가
                       무엇인가」의 답이 화면마다 갈리면 안 된다.
                       `deeplinkSourceReady` 로 감싸는 이유도 그 옆의 것과 똑같다
                       (위 「정착하기 전의 범위는 범위가 아니다」): 라이브 갱신은
                       status 를 `'loading'` 으로 되돌리고 그때의 정체성은
                       `sample:…` 로 계산된다. 그 값을 그대로 내려보내면 볼트에
                       파일 하나가 저장될 때마다 카메라가 튄다(실측 dy −10.66). */
                    dataSourceKey={deeplinkSourceReady ? vaultIdentity : null}
                    fitViewToken={combinedFitToken}
                    spotlightFitToken={spotlightFitToken}
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
                    /*
                     * 빈 캔버스 우클릭 = 「여기에 개념 만들기」 — 상단에서 뺀
                     * 크롬 필의 자리를 대신한다. 쓰기 가능한 볼트일 때만 건다:
                     * 못 쓰는 볼트에서 메뉴가 뜨면 그건 죽은 문이다.
                     */
                    onContextMenuPane={canCreateNode ? () => openCreateNode() : undefined}
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
                    clusterBarLabels={clusterBarLabels}
                    canvasLabel={t('canvas.ariaLabel')}
                    visitedTrail={footprintVisitedIds}
                    trailLensActiveRef={footprintLensActiveRef}
                    trailHoverNodeIdRef={footprintBrushNodeIdRef}
                    panelHoverNodeIdRef={panelHoverNodeIdRef}
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
                    // Phase 5 #20/#21 — 개인화 설정(설정 시트에서 변경). DOM
                    // 글리프는 스스로 같은 스토어를 읽어 lockstep 스왑된다.
                    glyphSet={glyphSet}
                    canvasBackground={canvasBackground}
                    view3d={view3d}
                    mapArrangement={mapArrangement}
                    // 3D 선택 리프레임의 「창 크기가 바뀐 사건」 — 상세 패널이
                    // 실제로 화면을 덮는 동안 true(퇴장 애니 종료 후 false).
                    // 돔은 이 플립마다 보이는 영역 기준으로 부드럽게
                    // 재프레이밍한다(2D 는 무시 — use-topology-loop 참고).
                    detailPanelVisible={nodePanelMounted}
                    footprint={footprint}
                    expand={expand}
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
                @keyframes topologyFade {
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
              {/* 지도 위 상단 중앙에서 아래로 내려앉는 빵부스러기 —
                  등장 원점은 그 위쪽 가장자리다. */}
              <Surface
                open={localGraphStack.length > 0}
                origin="top center"
                className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[70vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 shadow-[var(--shadow-elevation-1)]">
                  <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                    Local
                  </span>
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack([])}
                    className={controlClass({
                      shape: "link",
                      size: "md",
                      className:
                        "touch-hit-expand font-mono uppercase tracking-[var(--tracking-caps-12)] hover:text-[color:var(--color-text-primary)]",
                    })}
                  >
                    Root
                  </button>
                  {heldLocalGraphStack.map((slug, idx) => (
                    <span key={slug} className="flex items-center gap-2">
                      <span className="text-[color:var(--color-text-quaternary)]">▸</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLocalGraphStack((stack) => stack.slice(0, idx + 1))
                        }
                        className={controlClass({
                          shape: "link",
                          size: "lg",
                          truncate: true,
                          active: idx === heldLocalGraphStack.length - 1,
                          className: "touch-hit-expand hover:text-[color:var(--color-text-primary)]",
                        })}
                        title={slug}
                      >
                        {slug}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLocalGraphStack((stack) => stack.slice(0, -1))}
                    className={controlClass({
                      shape: "pill",
                      size: "sm",
                      className:
                        "ml-2 font-mono uppercase tracking-[var(--tracking-caps-14)] hover:bg-[color:var(--color-overlay-2)]",
                    })}
                  >
                    Esc
                  </button>
              </Surface>

              {/* 필터 컨텍스트 — 현재 visible 노드 수가 전체보다 적으면 표시.
                  로컬 그래프/카테고리 필터가 노드를 줄였을 때 컨텍스트를 주는 칩. */}
              {topologyVisibleCount !== null && topologyVisibleCount < localGraphProjects.length ? (
                <div className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-chip border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] md:left-[228px] xl:left-[236px]">
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
                ref={legendStackRef}
                data-testid="topology-legend-stack"
                className={cn(
                  "pointer-events-none absolute bottom-[var(--topology-relation-legend-bottom-inset)] right-[var(--topology-relation-legend-inset)] z-20 flex flex-col items-end gap-3 whitespace-nowrap transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
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
                {/* 프레임 계기 — 기본 꺼짐, 설정 →「지도」에서 켠다.
                    새 구석을 만들지 않고 **이미 계기 판독이 사는 스택**의 마지막
                    줄로 들어간다. 같은 성격의 읽을거리를 다른 자리에 두면 눈이
                    한 번 더 훑어야 하고, 그게 이 저장소가 경계하는 「과업이 더
                    명확해지지 않는 새 크롬」이다. */}
                {/* 활동 줄은 여기 살지 않는다 (2026-08-17 소유자 지시로 옮김).

                    **옛 근거와 무엇이 달라졌나.** 이 자리를 고른 실측은
                    「상단 **중앙** 상태 열」과의 비교였다: 1024 에서 그 열은
                    INDEX 오른끝과 69px 뿐인데 칩이 194px 이라 32px 겹쳤고, 우상단
                    유틸 레인도 **같은 줄**에는 28px 밖에 안 남았다. 지금 자리는
                    그 둘 중 어느 쪽도 아니다 — 유틸 레인의 **아래 줄**이라
                    가로로 다툴 상대가 애초에 없다(오른쪽 정렬이라 왼쪽 빈 지도로
                    자란다). 그래서 옛 측정이 이 자리를 반증하지 않는다.

                    토스트는 이 스택의 실제 rect 를 읽어 비켜서므로
                    (`resolveToastBottomOffsetForStack` + ResizeObserver) 줄이
                    하나 빠지면 저절로 그만큼 내려온다 — 손댈 값이 없다. */}
                <FrameMeter />
              </div>

              {/* 샘플 모드 첫 방문 1회성 지도 힌트 — 하단 중앙, pointer-events-none
                  이라 노드 클릭을 막지 않는다(통과 클릭 = 소멸). 첫 노드 선택 시
                  영구 소멸(localStorage). 소스: features/first-run-starter. */}
              {/* 실재가 확인된 선택만 학습 완료로 친다 — 유령 슬러그가 첫 방문
                  힌트를 영구 소멸시키던 자리(`resolvedSelectionSlug` 주석). */}
              <SampleNodeHint hasSelection={resolvedSelectionSlug !== null} hidden={tour.open} />

              {/* E-1c — 미지원 브라우저에서 크롬 타일/⌘O 가 부르는 정직한 안내.
                  지원 브라우저에서는 열리지 않으므로 숙련 사용자의 직행 경로
                  (타일 → OS 선택창)는 그대로다. */}
              <VaultOpenGuideSheet
                open={unsupportedGuideOpen}
                unsupported
                onClose={() => setUnsupportedGuideOpen(false)}
              />

              {/* 샘플에서 「최근 변경」을 눌렀을 때 — 막다른 곳 대신 폴더로 가는 길.
                  `requestVaultOpen` 을 그대로 쓴다: 첫 실행 카드의 「내 폴더 열기」와
                  **같은 핸들러**여야 미지원 브라우저 분기도 한 번만 존재한다. */}
              <RecentChangesNeedsVaultDialog
                open={recentNeedsVaultOpen}
                onClose={() => setRecentNeedsVaultOpen(false)}
                onOpenVault={requestVaultOpen}
              />

              {/* 같은 골격, 다른 사유 — 「예시라 고칠 수 없다」는 「날짜가 무관하다」와
                  다른 문장이어야 한다. */}
              <RecentChangesNeedsVaultDialog
                open={createNeedsVaultOpen}
                copyKey="createNeedsVault"
                onClose={() => setCreateNeedsVaultOpen(false)}
                onOpenVault={requestVaultOpen}
              />

            </>
        </div>
        {/* 상단에서 내려앉는 경보 띠 — 문구는 퇴장 창 동안 붙들어야 «사라지는
            중에 빈 띠» 가 되지 않는다. */}
        <Surface
          open={Boolean(projectsError)}
          origin="top center"
          role="alert"
          className="pointer-events-auto absolute left-1/2 top-[52px] z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[color:var(--color-danger-a32)] bg-[color:var(--color-surface-deep-a98)] px-4 py-2 text-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)]"
        >
            <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-danger-text)]">
              Error
            </span>
            <span>{heldProjectsError}</span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              className={controlClass({
                shape: "pill",
                size: "sm",
                className:
                  "ml-2 font-mono uppercase tracking-[var(--tracking-caps-14)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {t('errorBanner.retry')}
            </button>
        </Surface>
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
            접힌다. 창의 주인은 패널 안의 `<Surface>` 이고, 이 게이트는 그
            창이 끝났다는 통보(`onExited`)에 맞춰 포지셔너를 내린다. */}
        {nodePanelMounted && panelDatasheetModel ? (
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
                open={panelOpen}
                onExited={() => setNodePanelMounted(false)}
                nodeId={panelDatasheetModel.nodeId}
                slug={panelDatasheetModel.slug}
                title={panelDatasheetModel.title}
                sourceTitle={panelDatasheetModel.sourceTitle}
                kind={panelDatasheetModel.kind}
                domain={panelDatasheetModel.domain}
                powered={panelDatasheetModel.powered}
                groups={panelDatasheetModel.groups}
                evidence={panelDatasheetModel.evidence}
                codeLocations={panelDatasheetModel.codeLocations}
                updatedAtLabel={panelDatasheetModel.updatedAtLabel}
                lastEditSubject={panelDatasheetModel.lastEditSubject}
                mtimeConflict={panelDatasheetModel.mtimeConflict}
                handoffText={projectSource.view
                  ? `${panelDatasheetModel.handoffText}\n\n${formatProjectSourceHandoff(projectSource.view)}`
                  : panelDatasheetModel.handoffText}
                documentHref={panelDatasheetModel.documentHref}
                studioEditHref={panelDatasheetModel.studioEditHref}
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
                  groupShowMore: t("nodeDatasheet.groupShowMore"),
                  groupShowFewer: t("nodeDatasheet.groupShowFewer"),
                  containsShowSummary: t("nodeDatasheet.containsShowSummary"),
                  containsOtherGroup: t("nodeDatasheet.containsOtherGroup"),
                  metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                  metricDependsOn: relationVocabulary("depends_on", "plain"),
                  // "속한 곳" 도 공유 사전에서 — 전체 상세가 쓰는 단어와 같은
                  // 출처라 두 표면이 같은 관계를 다르게 부를 수 없다.
                  metricBelongsTo: relationVocabulary("belongs_to", "plain"),
                  metricEvidence: relationVocabulary("describes", "plain"),
                  // 시안 재설계 (2026-07-24) — 상단 평문 stats 라벨.
                  statsConnected: t("nodeDatasheet.statsConnected"),
                  statsEvidenceDocs: t("nodeDatasheet.statsEvidenceDocs"),
                  // H1 B2/A — typed-fact 라벨 hover 풀이 + "직접" 연결 스코프 명시.
                  metricContainsHelp: t("nodeDatasheet.metricContainsHelp"),
                  metricUsedByHelp: t("nodeDatasheet.metricUsedByHelp"),
                  metricDependsOnHelp: t("nodeDatasheet.metricDependsOnHelp"),
                  metricBelongsToHelp: t("nodeDatasheet.metricBelongsToHelp"),
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
                  actionCreateLinked: t("nodeDatasheet.actionCreateLinked"),
                  actionCreateLinkedTip: t("nodeDatasheet.actionCreateLinkedTip"),
                  actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
                  actionAskAgent: llmBridgeAvailable
                    ? t("nodeDatasheet.actionAskAgent")
                    : undefined,
                  actionPath: t("nodeDatasheet.actionPath"),
                  actionRealm: t("realm.enterAction"),
                  // 결과-설명 툴팁 (소유자 승인) — 라벨 반복이 아닌 "누르면
                  // 무엇이 되는가" 평문. 영역 전개는 기존 궤도 버튼 툴팁 재사용.
                  actionDocumentTip: t("nodeDatasheet.actionDocumentTip"),
                  actionEditRelationsTip: t("nodeDatasheet.actionEditRelationsTip"),
                  actionCopyHandoffTip: t("nodeDatasheet.actionCopyHandoffTip"),
                  actionAskAgentTip: t("nodeDatasheet.actionAskAgentTip"),
                  actionPathTip: t("nodeDatasheet.actionPathTip"),
                  actionRealmTip: t("realm.enterTooltip"),
                  sourceHeading: projectSourceLabels?.heading,
                  sourceKind: projectSourceLabels?.sourceKind,
                  sourceStatus: projectSourceLabels?.status,
                  sourceMeasuredAt: projectSourceLabels?.measuredAt,
                  sourceCurrentness: projectSourceLabels?.currentness,
                  sourceGap: projectSourceLabels?.gap,
                  sourceWhy: projectSourceLabels?.why,
                  sourceGapLabel: t("nodeDatasheet.sourceGapLabel"),
                  sourceAction: projectSourceLabels?.action,
                  sourceRelationsShow: t("nodeDatasheet.sourceRelationsShow"),
                  sourceRelationsHide: t("nodeDatasheet.sourceRelationsHide"),
                  sourceOntologyDocument: t("nodeDatasheet.sourceOntologyDocument"),
                  sourceBusy: projectSourceLabels?.busy,
                }}
                onSelectConnection={(id) => handleSelect(id)}
                onHoverConnection={handleDatasheetHoverConnection}
                onHoverEvidence={handleDatasheetHoverEvidence}
                onCopyHandoff={copyV2NodeHandoff}
                /*
                 * 「이어서 새로 만들기」 — **도메인 노드에서만** 넘긴다.
                 *
                 * 도메인→역량은 새 문서의 `domain:` 키 하나로 이어지므로 쓰기
                 * 의미를 새로 만들 필요가 없다. 다른 조합(역량→요소 등)은 부모
                 * 문서의 목록을 고쳐야 해서 «만들기»가 아니라 «남의 문서 수정»
                 * 이 된다 — 그건 다른 일이고, 못 하는 자리에 문을 그리면 그게
                 * 거짓 어포던스다.
                 */
                /*
                 * 샘플에서도 **보인다** (2026-08-03 소유자 지시: *"샘플 모드에서도
                 * 일단 보이게 하고 누르면 폴더 연결시키는 flow"*).
                 *
                 * 종전엔 `canCreateNode` 가 false 면 이 타일이 통째로 사라졌다.
                 * 그래서 소유자가 *"여기서 바로 노드 등록하는거 왜 사라짐?"* 이라고
                 * 물었다 — 잠긴 기능이 조용히 없어지면 「있었나?」가 된다. 같은
                 * 패턴을 「최근 변경」에서 이미 한 번 고쳤다.
                 *
                 * 이제 자리를 지키고, 누르면 **폴더로 가는 길**을 준다.
                 */
                onCreateLinked={
                  canvasSelectedGraphNode?.kind === "domain" && !canCreateNode
                    ? () => setCreateNeedsVaultOpen(true)
                    : canCreateNode && canvasSelectedGraphNode?.kind === "domain"
                    ? () => {
                        const tail = canvasSelectedGraphNode.id.includes(":")
                          ? canvasSelectedGraphNode.id.slice(canvasSelectedGraphNode.id.indexOf(":") + 1)
                          : canvasSelectedGraphNode.id;
                        setCreateNodeSeedDomain(tail);
                        setCreateNodeDefaultKind("capability");
                        openCreateNode();
                      }
                    : undefined
                }
                // 에이전트 표면이 없는 환경(웹)에서는 주입하지 않는다 — 타일도
                // 함께 사라진다. 열리지 않을 문을 그리지 않는다.
                onAskAgent={llmBridgeAvailable ? askAgentAboutSelectedNode : undefined}
                onClose={handleDatasheetClose}
                onSetPathSource={() => handleSetPathSource(panelDatasheetModel.nodeId)}
                projectSource={projectSource.view}
                projectSourceBusy={projectSource.busy}
                projectSourceError={projectSourceErrorLabel}
                projectSourceDegraded={projectSourceDegraded}
                projectSourceProposal={projectSourceProposal}
                onProjectSourceConfirmProposal={projectSourceProposal
                  ? handleProjectSourceConfirmProposal
                  : undefined}
                onProjectSourceAction={projectSourceNextActionAvailable
                  ? handleProjectSourceAction
                  : undefined}
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
        {/* 퇴장을 갖는다 — 종전엔 닫는 순간 1프레임에 사라졌다(등장만 있고
            나가는 길이 없었다). `Surface` 가 퇴장 창·퇴장 클래스·`inert` 를 지고
            `useHeldValue` 가 그 창 동안 모델을 붙든다. */}
        {heldEdgePanelModel ? (
          <Surface
            open={edgePanelOpen}
            data-testid="topology-edge-popover-positioner"
            className="topology-ui-scale fixed inset-x-3 top-[72px] z-50 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
          >
            <TopologyV2EdgePanel
              sentence={heldEdgePanelModel.sentence}
              typeLabel={heldEdgePanelModel.typeLabel}
              fromId={heldEdgePanelModel.fromId}
              toId={heldEdgePanelModel.toId}
              fromTitle={heldEdgePanelModel.fromTitle}
              toTitle={heldEdgePanelModel.toTitle}
              why={heldEdgePanelModel.why}
              declaredBy={heldEdgePanelModel.declaredBy}
              updatedAtLabel={heldEdgePanelModel.updatedAtLabel}
              studioEditHref={heldEdgePanelModel.studioEditHref}
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
          </Surface>
        ) : null}
        {/* 엣지 패널과 같은 골격 — 붙든 모델이 한 번 생기면 자리를 지키고,
            보이는지는 `Surface` 의 `open` 이 정한다(닫혀 있으면 `null` 을
            그리므로 DOM 비용 0). 별도 마운트 플래그를 두면 effect 안에서
            setState 를 하게 되고 그건 연쇄 렌더다. */}
        {heldContextMenu ? (
          <TopologyV2ContextMenu
            open={Boolean(contextMenuNode && contextMenuModel)}
            position={heldContextMenu.anchor}
            documentHref={heldContextMenu.model.documentHref}
            mentionDocumentHref={heldContextMenu.model.mentionDocumentHref}
            studioEditHref={heldContextMenu.model.studioEditHref}
            labels={{
              actionDocument: t("nodeDatasheet.actionDocument"),
              actionMentionDocument: t("nodeDatasheet.actionMentionDocument"),
              actionMentionDocumentTip: t("nodeDatasheet.actionMentionDocumentTip"),
              actionEditRelations: t("nodeDatasheet.actionEditRelations"),
              actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
              actionPath: t("nodeDatasheet.actionPath"),
              openFullDetail: t("nodeDatasheet.openFullDetail"),
            }}
            onCopyHandoff={() => {
              copyV2NodeHandoff(heldContextMenu.model.handoffText);
              closeContextMenu();
            }}
            onSetPathSource={() => {
              handleSetPathSource(heldContextMenu.model.nodeId);
              closeContextMenu();
            }}
            onOpenFullDetail={() => {
              handleSelect(heldContextMenu.model.nodeId);
              setFullDetailSlug(heldContextMenu.model.nodeId);
              closeContextMenu();
            }}
            onClose={closeContextMenu}
          />
        ) : null}
        {/* 전면 표면 — **밝기 전용**(`motion="overlay"`). 종전엔 `map-overlay-in`
            을 손으로 붙여 들어오는 길만 있었고, 닫으면 화면 전체가 1프레임에
            사라졌다(지도가 200ms 를 받는 동안 주인공이 0프레임). `Surface` 가
            같은 문법의 나가는 길(`map-overlay-out`)·`inert`·퇴장 창을 진다. */}
        {heldFullDetailA1Model && FullDetailCard ? (
          <Surface
            open={fullDetailOpen && fullDetailA1Model !== null}
            motion="overlay"
            data-testid="topology-full-detail-a1-positioner"
            data-full-detail-motion-token="--topology-motion-panel-duration"
            className="fixed inset-0 z-50 overflow-y-auto bg-[color:var(--color-canvas)]"
          >
            <FullDetailCard
              node={heldFullDetailA1Model.node}
              groups={heldFullDetailA1Model.groups}
              reach={heldFullDetailA1Model.reach}
              breadcrumb={heldFullDetailA1Model.breadcrumb}
              bodyMarkdown={heldFullDetailA1Model.bodyMarkdown}
              explanationEdit={heldFullDetailA1Model.explanationEdit}
              documentHref={heldFullDetailA1Model.documentHref}
              mentionDocumentHref={heldFullDetailA1Model.mentionDocumentHref}
              codeLocations={heldFullDetailA1Model.codeLocations}
              projectSource={projectSource.view}
              projectSourceLabels={projectSourceLabels}
              projectSourceBusy={projectSource.busy}
              projectSourceError={projectSourceErrorLabel}
              onProjectSourceAction={projectSource.canRunSourceAction
                ? projectSource.runNextAction
                : undefined}
              onSelectNode={(id) => handleSelect(id)}
              onClose={handleClose}
              onBackToMap={handleClose}
            />
          </Surface>
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
        {/* 기록(Atlas Git) 시트 — 레일 타일이 연다. AgentConnectSheet 와
            같은 scrim+중앙 카드 모달 골격(같은 토큰, modality 증명 — 스크림
            클릭 닫기). 패널 내용/조회는 위젯 자기완결. */}
        <AgentConnectSheet
          serverAvailability={agentServer}
          vaultPath={vault.handle ? (getTauriVaultRootPath(vault.handle) ?? null) : null}
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
          /*
           * **도구를 그대로 넘긴다.** 종전엔 `() => void vault.ensureAgentConfigs()`
           * 로 인자를 삼켰다 — 그래서 「Claude Code에 연결」이 Codex 설정까지 썼다.
           * 타입은 통과했고(인자를 안 쓰는 함수는 인자를 받는 자리에 들어간다) 화면만
           * 거짓말했다. 여기가 그 사슬의 마지막 고리였다.
           */
          onWriteConfigs={
            isTauriVaultRuntime() && vault.manifest
              ? (client) => void vault.ensureAgentConfigs(client)
              : null
          }
          mcpJsonState={
            !vault.agentConfigStatus?.mcpJson
              ? 'missing'
              : vault.agentConfigStatus.mcpJsonValid === false
                ? 'invalid'
                : 'ready'
          }
          codexConfigState={
            !vault.agentConfigStatus?.codexConfig
              ? 'missing'
              : vault.agentConfigStatus.codexConfigValid === false
                ? 'invalid'
                : 'ready'
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
        <GuidedTourOverlay
          tour={tour}
          canvasAnchorRef={tourAnchorRef}
          onActivateAnchor={tourAnchorNodeId ? activateTourAnchor : undefined}
        />
      </div>
      {/* 지도 컬럼과 **같은 flex row** 의 형제 — 폭 애니메이션 하나가 두
          컬럼을 함께 움직이므로 지도 축소와 패널 진입이 같은 프레임, 같은
          곡선이 된다. 따로 맞춘 두 애니메이션이 아니라 물리적으로 하나다. */}
      {llmBridgeAvailable ? (
        <VaultAgentPanel
          /*
           * 주소가 「이 개념을 물어보라」 를 들고 있으면 그것만으로 열린다.
           *
           * ⚠️ **코딩 에이전트 갈래가 창을 갖고 있으면 이쪽은 열리지 않는다** —
           * 대화창은 하나다(2026-08-16). 이 조건이 없으면 주소로 들어온 요청이
           * 두 번째 창을 띄운다.
           */
          open={keyChatOpen}
          onClose={closeVaultAgent}
          vaultPath={gitVaultPath}
          insight={ontologyInsight}
          manifest={vault.manifest}
          screenContext={vaultAgentScreenContext}
          vaultIsGit={false}
          canWrite={vault.status === "loaded" && Boolean(vault.handle)}
          // 칩 → 노드 포커스는 지도 노드 클릭과 **같은 함수**를 탄다 — 같은
          // 동작이 다른 모션으로 보이면 그것이 결함이다.
          onFocusNode={(slug) => handleSelect(slug)}
          // 폴더가 없는 상태에도 문을 준다 — 상단 유틸 레인의 「내 데이터로
          // 전환」과 **같은 함수**를 탄다(두 번째 열기 경로를 만들지 않는다).
          onOpenFolder={() => void vault.open()}
          downloadHref={`/${activeLocale}/download/`}
          prefillRequest={vaultAgentPrefill ?? askPrefill}
        />
      ) : null}
      {/*
        앱 안에서 **사용자의 코딩 에이전트**와 나누는 대화. 위 패널(키를 넣는
        갈래)과 **같은 자리의 형제**다 — 새 표면을 만들지 않는다.

        「지도가 주」(2026-07-27 적용 규칙)는 그대로다: 이 패널은 지도 옆에
        서고, 지도를 덮지 않는다.
      */}
      {(runtimeChatOpen || chatMounted) && acpRuntime && gitVaultPath ? (
        <Surface
          open={runtimeChatOpen}
          as="aside"
          origin="right"
          /*
           * ⚠️ **여기가 죽은 코드였다** (2026-08-16 검수에서 적발).
           *
           * 종전에는 이 블록의 마운트 조건과 `open` 이 **같은 값**이었다. 그래서
           * 닫기를 누르면 같은 프레임에 통째로 사라졌고, 퇴장 애니메이션은 한
           * 번도 재생된 적이 없으며 이 콜백도 불린 적이 없다 — 「사라지는 동안」
           * 이 존재하지 않았다.
           *
           * 마운트와 열림을 갈라 둔다: 열 때 마운트하고, 다 사라진 뒤에 언마운트.
           * 이 저장소가 표면마다 지키는 「퇴장은 두 프레임짜리 일」 그대로다.
           */
          onExited={() => setChatMounted(false)}
          /*
           * ⚠️ 종전 폭은 `var(--topology-agent-panel-width, 360px)` 였는데 **그
           * 토큰은 존재하지 않는다** — 늘 폴백 360px 이 쓰였고, 아무도 안 쓰는
           * 토큰 이름이 규격처럼 보이고 있었다(`design.md`: 아무도 안 쓰는
           * 토큰은 규격이 아니라 틀린 정보다).
           *
           * 그다음 폭은 `w-[420px] xl:w-[480px]` 두 리터럴이었다. 그 둘도
           * **누구의 답도 아니었다** — 이제 사용자가 왼쪽 모서리를 끌어 정하고,
           * 우리는 지도가 지켜야 할 몫만 지킨다(`panel-width.ts`). 화면 폭에
           * 따른 분기가 사라지므로 `xl:` 도 없앤다.
           */
          style={{ width: chatWidth.width }}
          /* 화면 오른쪽에 선 것 — 알림이 이 폭만큼 비켜선다(위 효과). */
          data-right-dock="chat"
          className="relative flex min-h-0 shrink-0 flex-col border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
        >
          <AcpChatResizeHandle
            width={chatWidth.width}
            onWidth={chatWidth.setWidth}
            onCommit={chatWidth.commitWidth}
          />
          <AcpChatPanel
            /*
             * 실행기를 바꾸면 **패널을 다시 만든다.** 세션은 프로세스 하나에
             * 묶여 있어서, 같은 패널에서 도구만 갈아 끼우면 「지금 무엇이
             * 살아 있나」가 흐려진다. 다시 만드는 편이 싸고 분명하다.
             */
            key={acpRuntime.id}
            runtimeId={acpRuntime.id}
            runtimeLabel={acpRuntime.label}
            runtimes={acpRuntimes}
            onRuntimeChange={setAcpRuntimeId}
            vaultRoot={gitVaultPath}
            mcpServers={acpMcpServers}
            // 노드에서 건너온 문장은 **여기** 작성 칸에 앉는다 — 보내지는 않는다.
            prefillRequest={vaultAgentPrefill ?? askPrefill}
            suggestions={chatSuggestions}
            knownSlugs={chatKnownSlugs}
            onHoverSlug={handleChatHoverSlug}
            onTurnActiveChange={handleAcpTurnActiveChange}
            onClose={closeVaultAgent}
          />
        </Surface>
      ) : null}
    </main>
  );
}

/**
 * 같은 「말로 시키기」 요청이면 같은 값 — 패널이 초안을 다시 앉히는 것은
 * 요청이 **달라졌을 때**뿐이어야 한다. 시각(Date.now)을 쓰면 렌더마다 값이
 * 달라져 사용자가 고쳐 쓰던 문장을 덮는다.
 */
function hashAskRequest(kind: string, ref: string): number {
  const source = `${kind}:${ref}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
}
