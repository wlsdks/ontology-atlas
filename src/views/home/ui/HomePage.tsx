"use client";

import Image from "next/image";
import { withBasePath } from "@/shared/lib/base-path";
import { useHeldValue, useSurfaceSwap } from "@/shared/lib/use-presence";
import { detectAcpRuntimes, isAcpBridgeAvailable } from "@/shared/lib/tauri-acp";
import {
  consumeQueuedAgentChatIntent,
  subscribeAgentChatIntent,
} from "@/shared/lib/agent-chat-intent";
import { isGuardedRuntime, runtimeOwnsWriteGate } from "@/features/acp-session/model/runtime-gate";
import { agentChatDoor } from "../model/agent-chat-door";
import {
  AcpChatPanel,
  AcpChatResizeHandle,
  useChatWidth,
  type AcpMapIntent,
  type AcpOntologyRelationPreview,
} from "@/widgets/acp-chat-panel";
import { vaultMcpServers, vaultSelfReadSlot } from "@/features/acp-session/model/vault-mcp-server";
import { useChatSuggestions } from "@/features/acp-session/model/use-chat-suggestions";
import type { ChatSuggestion } from "@/features/acp-session/model/chat-suggestions";
import type { AcpTurnActivity } from "@/features/acp-session/model/acp-turn-activity";
import { cn } from "@/shared/lib/cn";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { useLocale, useTranslations } from "next-intl";
// `History as HistoryIcon` avoids colliding with the global DOM `History`
// constructor (same aliasing as `AtlasGitPanel`).
import { Compass, FolderOpen, HelpCircle, History as HistoryIcon, MessageCircle, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTypingShortcuts } from "@/shared/lib/use-typing-shortcut";
import { useProjects } from "@/features/project-data-source";
import { RecentChangesNeedsVaultDialog, useAdaptiveRecentChanges, useOntologyInsight, useVaultConceptFacts, useVaultDocFreshnessIndex } from "@/features/vault-ontology";
import {
  useAgentServer,
  useLocalVault,
  VaultOpenGuideSheet,
  useSummaryFreshness,
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
// The dock down the right of the map. It has to sit in the same flex row as the
// map so one width animation moves both columns — that is what reads as "the map
// made room for it".
const VaultAgentPanel = dynamic(
  () => import("@/widgets/vault-agent-panel").then((m) => m.VaultAgentPanel),
  { ssr: false },
);
import { useDocumentTitle } from "@/shared/lib/use-document-title";
import { useRetainedDatasheetModel } from "../model/use-retained-datasheet-model";
import { useIndexSelectionOverride } from "../model/use-index-selection-override";
import {
  buildSpotlightFitSignature,
  useSpotlightFitTransition,
} from "../model/use-spotlight-fit-transition";
import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { useAudiencePlain } from "@/shared/lib/audience-preference";
import { useCanvasBackground, useExpand, useFootprint, useGlyphSet, useMapArrangement, useView3d } from "@/shared/lib/appearance-preferences";

const CREATE_NODE_DIALOG_TITLE_ID = "topology-create-node-dialog-title";
// Bare `?p=` miss grace window — see the deeplinkMissNotifiedRef effect
// below (`../lib/deeplink-miss-notice.ts`) for why this exists.
const DEEPLINK_MISS_GRACE_MS = 4000;
// Debounce before writing the past trail, so every step does not hit the user's
// disk. Kept short on purpose: whatever we wait here is a window in which closing
// the window loses the last step (a flush on tab hide narrows it further).
const PAST_TRAIL_SAVE_DEBOUNCE_MS = 600;
// The map camera spring pays off the last few pixels even after the dock has made room.
// Slowing ACP process boot by this amount prevents WebKit main thread occupancy from interrupting its landing.
const ACP_SESSION_START_AFTER_REFLOW_MS = 240;

const TopologyFitControl = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.TopologyFitControl),
  { ssr: false },
);
const HubRail = dynamic(
  () => import("@/widgets/topology-controls").then((m) => m.HubRail),
  { ssr: false },
);
/** Relation type → sentence i18n key; folds synonym types onto one key. */
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
// `FullDetailA1` is the opt-in full-detail overlay (`.claude/rules/design.md`:
// full-bleed detail is opt-in, never the click default), so it has no business in
// the first-load bundle. It statically imported `react-markdown` (+ `remark`),
// measured at ~129KB gzip, and that shipped to EVERY visit of `/` and `/topology`
// even for users who never open a full-detail card.
//
// `buildFullDetailGroups` / `buildFullDetailReachModel` carry no ReactMarkdown
// dependency and stay regular imports, but they live in
// `../model/use-full-detail-a1-model.ts` and that hook only calls them **while the
// card is open** (2026-07-28: derivation for a closed surface was being paid for
// on the click frame). Prewarming a chunk and prewarming a derivation are not the
// same trade — the chunk is cheap and buys the appearance frame, the derivation
// bills the click frame.
//
// The import is a named function so the chunk can be pulled early; the bundler
// caches the module promise, so the call after a prewarm resolves immediately.
// `dynamic` (React.lazy + Suspense) is rejected for the same reason: lazy
// suspends once on first render even with the chunk cached, so **background and
// content land in different commits** — measured, the background painted first
// and the content popped in 83 ms later. Holding the resolved component in state
// puts both in one commit. Why it is prewarmed at all: see `FullDetailCard` below.
const importFullDetailA1 = () => import("@/widgets/full-detail-a1");
type FullDetailA1Component = Awaited<ReturnType<typeof importFullDetailA1>>["FullDetailA1"];
import { GestureHint } from "@/widgets/gesture-hint";
import { AGENT_DOCK_INSET_SURFACE_CLASS, ChromeChip, LiveAnnouncer, Surface, Tooltip, controlClass, useToast } from "@/shared/ui";
import { MOTION } from "@/shared/motion";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { resolveToastBottomOffsetForStack } from "@/shared/ui/toast-position";
import {
  getProjectRuntimeDetailHref,
  type ProjectImpactMode,
} from "@/entities/project";
import { buildDocsVaultHref, buildNewNodeDoc } from "@/entities/docs-vault";
import {
  buildOntologyChangeSet,
  buildTopologyMeaningEditorNodeHref,
  buildChatNodeIndex,
  buildTopologyMeaningEditorEdgeHref,
  buildOntologyInsightsReturnHref,
  edgeAuthoredByFromNode,
  resolveNodeDocument,
  resolveNodeAgentTarget,
  resolveOntologyBuilderNodeSlug,
  parseOntologyMeaningEditParam,
  meaningEditRelationForEdgeType,
  type OntologyRelationEditPlan,
  type OntologyChangeSet,
  type MeaningEditRelation,
  useRelationVocabulary,
} from "@/entities/knowledge-graph";
import {
  MeaningEditorPanel,
  type MeaningEditorPreview,
} from "@/features/ontology-meaning-editor";
import { copyText } from "@/shared/lib/copy-text";
import { copyHandoffWithFeedback } from "../lib/copy-handoff-with-feedback";
import { formatProjectSourceHandoff } from "@/shared/lib/project-source-receipt";
import {
  buildOntologyTree,
  computeDomainCensusRows,
  computeOntologyChangeset,
  domainCensusById,
  filterTreeExcludeKind,
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
import { useProjectSourceReadiness } from "../model/use-unbound-project-source";
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
import { useVaultSessionIdentityScope } from "@/features/vault-scope";
import {
  computeTopologyShortestPath,
  formatTopologyPathAgentPacket,
} from "../lib/topology-analysis";
import {
  countProjectRelationsWithinGraph,
  resolveTopologyOverlayState,
  resolveTopologyRenderState,
} from "../lib/topology-render-state";
import { resolveTopologySelectedOntologyNode } from "../lib/resolve-topology-selected-node";
import { resolveDeeplinkMissDecision } from "../lib/deeplink-miss-notice";
import { resolveCanvasSelectedSlug } from "../lib/resolve-canvas-selection";
import { resolveTopologyNodeTitle } from "../lib/resolve-topology-node-title";
import {
  canCopyTopologyPathPacket,
  resolveTopologyPathChipState,
} from "../lib/topology-path-chip-state";
import { shouldSuppressGlobalShortcuts } from "../lib/blocking-surface";
import {
  resolveAgentFocusNodeId,
  resolveOntologyRelationPreview,
} from "../lib/resolve-agent-focus-node";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";
import { computeCanonicalCensus } from "@/shared/lib/ontology-tree/canonical-census";
import {
  nodeIntent,
  screenIntentFor,
  sentenceForIntent,
  type FirstWordsLabels,
  type ScreenContextSnapshot,
  buildBusinessFlowRequest,
} from "@/features/vault-agent";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";
import { useAgentDockDefaultOpen } from "@/shared/lib/use-agent-dock-default";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { daysBehind } from "@/entities/docs-vault";
import { buildAgentAnalyzePrompt } from "@/shared/config/agent-prompts";
import { resolveToastRightOffset } from "@/shared/ui/toast-position";
import { MapEntryLoadingVisual } from "@/shared/ui/map-entry-loading-visual";
import { RIGHT_DOCK_WIDTH_VAR } from "@/shared/lib/right-dock-reserve";

import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { buildNavRailContextHrefs } from "../lib/nav-rail-context-hrefs";
import { restoreTopologyFocusAfterDatasheetClose } from "../lib/topology-focus-return";
import { CreateNodeForm, type CreateNodeKind } from "./CreateNodeForm";
import { OntologyBootstrapForm } from "./OntologyBootstrapForm";
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
import { resolveContextualIndexState } from "../lib/resolve-contextual-index-state";
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
import {
  AgentActivityChip,
  type AgentLiveWorkInput,
} from "@/features/agent-activity";
import { FrameMeter } from "@/shared/ui/frame-meter";
import {
  createVaultAcpWorkReceiptStore,
  type AcpWorkReceipt,
  type AcpWorkReceiptStore,
} from "@/shared/lib/acp-work-receipt";
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
/** INDEX panel preference — a separate key from the legacy hero-rail
 * `LEFT_PANEL_COLLAPSED_KEY` above, which is a different feature entirely. */
const INDEX_PANEL_COLLAPSED_KEY = "demo:index-panel-collapsed:v1";
/**
 * Boot render gate. Measured 2026-08-19: the single largest long task on a first
 * visit to `/ko/topology/` was **this view's first client render + commit**, at
 * 324–335 ms under 4× CPU throttling. The initial render at a lazy boundary runs
 * in the synchronous lane, so the whole 6,000-line tree lands in one task.
 *
 * The fix: the first client commit clones the DOM of the server fallback
 * (`MapEntryFallback`) that is already on screen, so it finishes in a few ms with
 * no pixel change, and the real tree renders in the following `startTransition`.
 * The transition lane yields roughly every 5 ms, splitting the big render into
 * many small tasks; what the user sees is unchanged — fallback, the same fallback
 * again, then the finished page.
 *
 * Prescription: the first client commit renders only the shared loading visual of the server fallback,
 * and the main body renders in the subsequent `startTransition`. The transition lane yields every ~5ms,
* splitting the large render into many small tasks; the screen sequence is
 * fallback → same central loading state → completed map. Since server and client share
 * the same `MapEntryLoadingVisual`, there is no separate HTML cloning or markup drift.
 *
 * SSG goes straight to the main body because `window` is unavailable, and the main body suspends on `useSearchParams`
 * as before, so the fallback bakes into the HTML — the exported document remains byte-identical.
 */
export function HomePage() {
  const tMapEntry = useTranslations('mapEntry');
  const [bootRenderReady, setBootRenderReady] = useState(false);
  useEffect(() => {
    startTransition(() => setBootRenderReady(true));
  }, []);
  if (!bootRenderReady) {
    return (
      <MapEntryLoadingVisual
        title={tMapEntry('mapComing')}
        description={tMapEntry('loadingDetail')}
        headline={tMapEntry('headline')}
        lede={tMapEntry('lede')}
      />
    );
  }
  return <HomePageImpl />;
}

function HomePageImpl() {
  const t = useTranslations('topology');
  const tMeaningEditor = useTranslations('meaningEditor');
  const reducedMotion = usePrefersReducedMotion();
  const siteT = useTranslations('metadata');
  /*
   * The same key insights shows in its flow tab. Reading it here rather than
   * receiving the text keeps one sentence in one place; two copies would drift
   * the first time a rule in it changed.
   */
  const businessFlowRequestText = useTranslations('ontologyPages.insights.flow')('request');
  // "The language on screen right now" for the create composer's per-locale
  // name-input contract.
  const activeLocale = useLocale();
  const tKinds = useTranslations('kinds');
  /* The help glossary owns these definitions; reading them here keeps one source (see
     `TopologyIndexTreeRowLabels.subcountsTitle`). */
  const tGlossary = useTranslations('searchWidgets.shortcuts.glossary');
  const kindCountsTitle = useMemo(
    () =>
      `${tGlossary('capabilityTerm')}: ${tGlossary('capabilityDefinition')} · ` +
      `${tGlossary('elementTerm')}: ${tGlossary('elementDefinition')}`,
    [tGlossary],
  );
  const tTopologyKeyboardWalk = useTranslations('topologyWidgets.keyboardWalk');
  // aria-label/title for the history chrome-tile entry point below `lg`. Reuses
  // the same `atlasGit` keys `GitStatusTile` already uses.
  const tAtlasGit = useTranslations('atlasGit');
  const relationVocabulary = useRelationVocabulary();
  // Plain (non-developer) mode: a display lens only, never a data change. When on
  // it hides the element tier by default (a clicked node's ego is the exception),
  // switches to plain vocabulary, and hides path sub-info and developer chrome.
  // It reads a shared store rather than localStorage directly, because the shell's
  // history tile reads the same value — changing it in settings has to move the map
  // and the rail together.
  const [audiencePlain, setAudiencePlain] = useAudiencePlain();
  // Appearance preferences, all changed from the settings sheet. Each is read from
  // an app-wide store and handed down to the map canvas; the DOM glyphs subscribe
  // to the same store themselves, so both surfaces swap in lockstep.
  const canvasBackground = useCanvasBackground();
  // 3D view (2026-08-18, opt-in): either the ownership Dome or the relation-driven Cloud.
  const view3d = useView3d();
  /** Which structural question places nodes in 3D — see the `MapArrangement` doc-block. */
  const mapArrangement = useMapArrangement();
  const footprint = useFootprint();
  const glyphSet = useGlyphSet();
  const expand = useExpand();
  // The map surface's relation-vocabulary register. Plain mode uses the same
  // register as the datasheet.
  const relationRegister: "formal" | "plain" = audiencePlain ? "plain" : "formal";
  const [localGraphStack, setLocalGraphStack] = useState<string[]>([]);
  /*
   * Hold the breadcrumb's contents so it still draws during its exit window.
   * Without this, the moment the stack empties the pill remains but its inside
   * goes blank as it leaves. The hold key is the stack itself, flattened to a
   * primitive because the array's identity changes every render.
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
  // Mode-aware read: local mode syncs from the vault manifest, static mode from
  // the build-time dogfood manifest. Either way a `.md` in the vault reaches the
  // list and the map immediately.
  const projectsQuery = useProjects();
  const projects = projectsQuery.projects;
  const projectsError = projectsQuery.error;
  /* The alert text is held across its exit window too; a primitive needs no key. */
  const heldProjectsError = useHeldValue(projectsError);
  const [routeState, setRouteState] = useHomeRouteState();
  /**
   * The agent panel — a vertical dock the map makes room for on its right.
   *
   * One at a time: opening it retires the search palette and the concept composer.
   * All three demand attention over the map, and overlapping them destroys which
   * one is the primary surface.
   */
  const [vaultAgentOpen, setVaultAgentOpen] = useState(false);
  const [acpChatOpen, setAcpChatOpen] = useState(false);
  const [acpDockFrameOpen, setAcpDockFrameOpen] = useState(false);
  /**
   * Whether the dock starts open — true only in the installed app with a key
   * present (`null` means not known yet). The owner asked for it to be "in view",
   * but parking a locked panel on a machine with no key keeps the letter of that
   * and breaks its intent.
   */
  const agentDockDefaultOpen = useAgentDockDefaultOpen();
  /**
   * Once the user has opened or closed the dock themselves, their intent beats the
   * default. Otherwise a dock they closed reopens as soon as the key lookup
   * resolves, which reads as "close does not work".
   */
  const agentDockTouchedRef = useRef(false);
  /*
   * ⚠️ Opening by ourselves goes through the one door (`openAgentChat`), because
   * that door decides coding-agent vs. API key. Choosing the branch again here
   * puts two chat panels on screen at once. Owner, 2026-08-16: *"one chat panel only"* (one chat panel only). That function reads runtime state, so it and
   * this effect both live further down.
   */
  /**
   * A first line handed in from outside. Only a sentence lands here and nothing is
   * sent — it sits in the panel's input so the user can edit, send, or clear it.
   * `nonce` makes the same sentence land again when it is picked a second time.
   */
  const [vaultAgentPrefill, setVaultAgentPrefill] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  // The header search button, ⌘K and ⇧⌘K all open this one palette
  // (`MountedGlobalSearch`, ontology nodes + projects). ⌘K on a project detail
  // page navigates home and leaves a sessionStorage flag; reading it in the lazy
  // initializer opens the palette on the first render instead of a frame later.
  // Lazy initializers only run on the client, so SSR and hydration both see
  // `false` and there is no mismatch.
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
  // SSR and the first client render must match, so the stored preference cannot be
  // read in a `useState` initializer — that produces a hydration mismatch on the
  // className. `useSyncExternalStore`'s server snapshot keeps the SSR default and
  // the client snapshot applies the stored value after mount.
  const leftPanelCollapsed = useLocalStorageBoolean(LEFT_PANEL_COLLAPSED_KEY, true);
  const [topologyRelayoutToken, setTopologyRelayoutToken] = useState(0);

  /**
   * When an arrow key has nowhere to go, one self-dismissing line.
   *
   * Owner: *"No related node to move to … Show it briefly and let it disappear automatically."*
   * (show it briefly, then let it disappear on its own). This reuses the existing
   * toast rather than adding a surface: a new notice box over the map would need
   * its own position, tokens, and motion, and that is not a spec one author sets
   * alone. The widget filters repeats (`shouldAnnounceDeadEnd`).
   */
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
    meaningEditorIntent,
    meaningEditParam,
    indexState,
    insightsReturnTab,
    insightsReturnReviewId,
    expandedParents: expandedParentSlugs,
    realmSlug,
    recentWindow,
  } = routeState;
  /** Overview of the previous node explicitly called by the user. A session view that does not persist to URL/settings. */
  const [expandAllActive, setExpandAllActive] = useState(false);
  const renderProjects = projects;
  // Density gate: turn the parent-slug list from `?open=` into a Set for the map,
  // memoised on the joined string so the dependency is stable.
  //
  // **Deep links obey the user's cap too** (defect measured 2026-08-02). Parsing
  // `?open=` is a pure function that knows nothing about settings and falls back to
  // 3, so someone who had lowered "parents open at once" to 1 got three from a
  // single link (measured: maxOpen=1, three parents expanded, 82 nodes). A cap the
  // click path alone honours is not a cap. Keeping the tail matches
  // `toggleExpandedParent`'s LRU eviction — what is written later is the more
  // recent intent.
  const expandedParentsKey = limitExpandedParents(expandedParentSlugs, expand.maxOpenParents).join(",");
  const expandedParentSet = useMemo(
    () => new Set(expandedParentsKey ? expandedParentsKey.split(",") : []),
    [expandedParentsKey],
  );
  // Cluster chip click toggles that parent's expansion through the URL. Node
  // selection and focus are untouched — the chip only collapses and expands.
  const handleToggleCluster = useCallback(
    (parentId: string) => {
      if (expandAllActive) {
        setExpandAllActive(false);
        setRouteState((current) => ({ ...current, expandedParents: [] }));
        setFitViewToken((current) => current + 1);
        return;
      }
      setRouteState((current) => ({
        ...current,
        // The cap comes from settings. Past it, the least recently expanded parent
        // closes here rather than the click doing nothing — see
        // `toggleExpandedParent`.
        expandedParents: toggleExpandedParent(
          current.expandedParents,
          parentId,
          expand.maxOpenParents,
        ),
      }));
    },
    [setRouteState, expand.maxOpenParents, expandAllActive],
  );
  // Enter a realm: the orbit button or a datasheet action switches the map into
  // this node's world, through the URL.
  const handleEnterRealm = useCallback(
    (slug: string) => {
      setExpandAllActive(false);
      setRouteState((current) => enterRealmRouteState(current, slug));
    },
    [setRouteState],
  );
  // Leave the realm (chip ✕ or Esc) and return to the whole map.
  const handleExitRealm = useCallback(() => {
    setRouteState((current) => exitRealmRouteState(current));
  }, [setRouteState]);
  // INDEX panel — the default left occupant. Preference
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
  // Owner, 2026-07-23: *"It's dizzying — all panels are open at once"* (it is dizzying
  // because every panel is open at once). While a node is selected and the
  // datasheet is up, the left stack retreats to a collapsed tab; clicking empty
  // canvas restores the stored preference. If the user expands it manually during
  // a selection, that expansion wins until the selection ends. This is a
  // session-only demotion — the persisted preference is never touched.
  /*
   * On a map with nothing in it yet, INDEX starts collapsed. Owner, 2026-08-16:
   * *"On first start, the left index should be closed."*
   *
   * INDEX is a concept list, so with zero concepts it has nothing to hold — the
   * panel showed one "no matching concepts" line while owning the left third of
   * the screen, pushing the start checklist (the only thing there is to do at that
   * moment) to the right. Same shape as the during-selection demotion above: a
   * session-only demotion that never touches the stored preference, so it comes
   * back as soon as a concept exists, and expanding it by hand wins.
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
  // The settings gear's INDEX default row writes through the SAME
  // `setIndexPreference` that the INDEX panel's own fold/expand controls use, so it
  // persists to `INDEX_PANEL_COLLAPSED_KEY` and applies immediately rather than
  // "on next reload".
  const handleChangeIndexDefaultCollapsed = useCallback(
    (next: boolean) => setIndexPreference(next ? "collapsed" : "expanded"),
    [setIndexPreference],
  );
  // The map's safe-inset-left assumes INDEX's width by default
  // (`--topology-v2-safe-inset-left: 344` = 18 inset + 300 width + 26 gap).
  // Collapsing INDEX narrows that reserved space — flip the DOM attribute
  // `app/globals.css` keys off of, invalidate the cached token read (canvas
  // reads CSS vars once per `read-topology-v2-tokens.ts`'s own contract),
  // then force a re-fit via the existing fit-view token so the camera actually
  // re-centres against the new width instead of only changing CSS. The dataset and
  // fit effects live below the selection-aware `renderedIndexState` derivation.
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  const vault = useLocalVault();
  const tAgent = useTranslations("vaultAgentPanel");
  // With no bridge (the web build) neither the button nor the panel is drawn —
  // painting a door that will not open is the opposite of honest degradation.
  const llmBridgeAvailable = isLlmChatBridgeAvailable();
  /** Evidence for the gap a first line points at — the same fact map the panel and
   * the insight queue read. */
  const vaultConceptFacts = useVaultConceptFacts();
  const { insight: ontologyInsight } = useOntologyInsight();
  // "When did this change" for the node datasheet (mode-aware manifest updatedAt).
  const docFreshnessIndex = useVaultDocFreshnessIndex();
  // The recent-changes spotlight lens over an mtime window. A numeric `?recent=`
  // preset pins that window; "auto" and off use the adaptive ramp. The map's
  // sinking and the INDEX lens share this one hook as their single source.
  const spotlightOn = recentWindow !== null;
  /*
   * Fit the camera to the highlighted nodes only at the **moment** the lens turns
   * on or its window changes (owner report 2026-08-02: narrowing the window left
   * the view unmoved).
   *
   * What crosses is an event, not a value: the map reads `spotlightIds` every
   * frame, so the ids alone cannot say "this just changed", and fitting every frame
   * would keep stealing the view the user parked afterwards.
   *
   * The counter exists so render never calls `Date.now()` — lint caught it and the
   * rule is right: render must be pure, and reading the clock gives different
   * output for the same input when React discards and retries a render. The only
   * property needed is "it differs", so a monotonic counter is enough. It ticks
   * only on renders where the lens or the window changed.
   */
  const spotlightFitToken = useSpotlightFitTransition(
    buildSpotlightFitSignature({
      recentWindow,
      spotlightOn,
      pathSourceSlug,
      pathTargetSlug,
      expandAllActive,
    }),
  );
  const recentChanges = useAdaptiveRecentChanges(
    spotlightOn && recentWindow !== "auto" ? recentWindow : undefined,
  );
  /*
   * On the sample, pressing this chip offers a way forward instead of a dead end.
   * Owner, 2026-08-03: *"Shouldn't something pop up on the screen when the chip is clicked? … Display a nice popup in the center of the screen to guide folder setup?"* (the chip should open something
   * — a dialog in the middle of the screen that leads to picking a folder).
   *
   * **Two empty states, told apart.** For someone who opened their own folder, zero
   * recent changes really means there is nothing to show, so the chip stays disabled
   * with its tooltip — opening a modal to say "there is nothing" is still rejected
   * (2026-08-02, popup soup). The sample is different: the zero there comes from the
   * fixture's dates being whenever this repo last touched them, which has nothing to
   * do with the user and will never become non-zero by waiting. When the reason is a
   * next action rather than an absence, give the next action.
   */
  const [recentNeedsVaultOpen, setRecentNeedsVaultOpen] = useState(false);
  /** Same for "create one from here" on the sample: a route to a folder, not a dead
   * end. */
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
  }, [spotlightNeedsVault, setRouteState, setRecentNeedsVaultOpen]);
  // Owner: *"If it's showing all changes, zoom out significantly"* (if it is showing
  // every change, zoom right out). The moment the lens turns on, the camera pulls
  // back to a full fit so all the changed places — including auto-expansions — fit
  // one screen. Once per off→on transition only, so it does not fight manual
  // exploration while the lens is up, and it reuses the existing fit token rather
  // than adding a camera primitive.
  const prevSpotlightOnRef = useRef(spotlightOn);
  useEffect(() => {
    if (spotlightOn && !prevSpotlightOnRef.current) {
      setFitViewToken((token) => token + 1);
    }
    prevSpotlightOnRef.current = spotlightOn;
  }, [spotlightOn]);
  // Reference instant for the "N days ago" labels. Day resolution, so a snapshot
  // taken once per session is enough — and calling `Date.now()` during render
  // violates react-hooks purity. Labels staying still for the session is desirable
  // for the same reason `changeBaseline` is pinned.
  const [updatedAgoNowMs] = useState(() => Date.now());
  // When a change baseline is pinned in the shared store, nodes added or changed
  // since it pulse on the map, so the spatial view and the ontology change panel
  // show the same baseline during a review.
  const changeBaseline = useChangeBaseline();
  // Computed once and used twice: the pulse (`touchedNodeIds`) and the re-entry
  // review pill.
  const ontologyChangeset = useMemo(
    () =>
      computeOntologyChangeset(changeBaseline, ontologyInsight?.nodes ?? [], ontologyInsight?.edges ?? []),
    [changeBaseline, ontologyInsight],
  );
  const changedSlugs = ontologyChangeset.touchedNodeIds;
  // Long-untouched nodes, judged from vault mtime, sink through the engine's
  // existing stale channel (dash + opaque token). Reuses the session snapshot
  // instant so the judgement does not shift mid-session, same as the datasheet's
  // "N days ago" labels.
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
   * **When the vault changes, clear vault-scoped URL state** (2026-08-01, the same
   * treatment as the `?slug=` fix in the docs surface).
   *
   * The values behind keys like `?p=` and `?pathFrom=` are names that only mean
   * something inside one vault, and the URL knows nothing about vaults. So when the
   * user switched folders or moved between the sample and their own vault, those
   * names lost their meaning, nobody cleared them, and they stuck: the map judged a
   * node that no longer exists as selected and dimmed **everything**, and the path
   * chip asserted "no path" between two nodes that were not there.
   *
   * First mount is skipped — a `?p=` present then is not residue, it is something
   * somebody handed over (a deep link, an agent handoff, a bookmark). That case is
   * not to be erased; it is what the unresolved-slug toast below must say honestly.
   *
   * The toast's once-only memory is cleared at the same time. Without that, coming
   * back A→B→A leaves the screen **completely silent** for a slug that really is
   * missing this time.
   */
  const vaultIdentity = useVaultSessionIdentityScope();
  const vaultIdentityRef = useRef<string | null>(null);
  /**
   * Whether it is yet safe to diagnose "not found". The unresolved toast and the
   * canvas focus decision must read the **same** signal; if they diverge, the screen
   * focuses a ghost while the toast says it is missing, or the reverse.
   */
  const deeplinkSourceReady =
    vault.restoreAttempted &&
    (vault.status === "idle" ||
      vault.status === "loaded" ||
      vault.status === "unsupported");
  /**
   * ⚠️ **A scope before it settles is not a scope.** The first render happens
   * before the vault is restored, so the identity reads as `sample:…`. Recording
   * that as "the previous vault" makes the restore itself look like a vault switch
   * and erases the deep link the user arrived with. Measured 2026-08-01 in the
   * browser: reloading a URL pointing at a real node dropped its `?p=` on the spot.
   * Only values seen after `deeplinkSourceReady` count.
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
  // Absolute vault path on the Tauri desktop (bridge active); `null` for a web File
  // System Access handle, which makes the history tile and panel degrade honestly to
  // the session changeset.
  const gitVaultPath = vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  // Direction B (2026-08-25 design-directions) — summary nodes whose description has
  // fallen behind the membership it describes. Empty in the browser, which has no Git
  // history to read; the node popover simply renders no row there.
  const summaryFreshnessCandidates = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        // `agentSlug` is the vault-root-relative address, which is exactly what
        // `vault_node_revisions` resolves against; `evidenceIds[0]` would carry the
        // bundled sample's extra path segment and, for a node with no document of its
        // own, would name someone else's file.
        .filter((node) => node.hasOwnDocument !== false && Boolean(node.agentSlug))
        .map((node) => ({ slug: node.agentSlug as string, kind: node.kind })),
    [ontologyInsight],
  );
  const summaryFreshness = useSummaryFreshness(gitVaultPath ?? undefined, summaryFreshnessCandidates);
  const handoffSource: "loaded-vault" | "read-only-sample" =
    vault.status === "loaded" ? "loaded-vault" : "read-only-sample";
  // `AppNavRail` lives in the layout, so this page cannot mount it. It registers the
  // node the rail should render through context instead (`useNavRailSettingsSlot`),
  // and effect cleanup clears it on navigation. Only this page overrides the shell's
  // default settings slot, because only this page has the map's screen controls to
  // put in it. The memo sits here, after `vault` and `ontologyChangeset`, because the
  // history tile reads the vault path and the session changeset.
  const navRailSettingsSlot = useMemo(
    () => (
      <>
        {/* Settings were consolidated 2026-07-24: the old map-settings popover was
            retired and the gear now opens the single settings sheet. Map-only
            screen state is injected through `screenControls`, so pages that do not
            inject it simply have no such row. The sheet is a scrim-backed modal and
            handles its own ⌘K demotion, so the old gear's mutual-exclusion signal
            is no longer needed. */}
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
      vault.status,
    ],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  // Dismissing the first-run card used to hide the "open a folder" entry point
  // behind the settings gear. While in static sample mode — independent of whether
  // the card was dismissed — a quiet "switch to my data ⌘O" pill stays in the top
  // utility row, and it disappears on its own once a real vault is connected.
  const sampleModeSettled = useFirstRunSampleModeSettled();
  // On unsupported browsers (Safari, Firefox) that pill and ⌘O called
  // `vault.open()` and nothing happened: the status flipped quietly to
  // `unsupported`, and anyone who had already dismissed the first-run card got no
  // response at all — the kind of silence that makes people press the same button
  // again. When something cannot be done, say why and give somewhere to go: open
  // the same sheet the card uses, in its unsupported mode.
  const fsaUnsupported = vault.status === "unsupported";
  const [unsupportedGuideOpen, setUnsupportedGuideOpen] = useState(false);
  const requestVaultOpen = useCallback(() => {
    if (fsaUnsupported) {
      setUnsupportedGuideOpen(true);
      return;
    }
    void vault.open();
  }, [fsaUnsupported, vault, setUnsupportedGuideOpen]);
  // Auto-start accepts **both** the sample and a real folder settling. The earlier
  // condition only watched the sample, so anyone who picked a folder never got the
  // tour (`use-auto-start-ready.ts`).
  const tourAutoStartReady = useGuidedTourAutoStartReady();
  const nodeEditTarget = useMemo(
    () =>
      selectedOntologyNode
        ? resolveTopologyNodeEditTarget(selectedOntologyNode, vault.manifest?.docs ?? [])
        : null,
    [selectedOntologyNode, vault.manifest],
  );
  const [meaningEditorState, setMeaningEditorState] = useState<{
    sourceId: string;
    initialRelation: MeaningEditRelation;
    initialTargetId: string | null;
    initialWhy: string;
  } | null>(null);
  const heldMeaningEditorState = useHeldValue(
    meaningEditorState,
    meaningEditorState
      ? `${meaningEditorState.sourceId}:${meaningEditorState.initialRelation}:${meaningEditorState.initialTargetId ?? "new"}`
      : null,
  );
  const [meaningPreview, setMeaningPreview] = useState<MeaningEditorPreview | null>(null);
  const [acpRelationPreview, setAcpRelationPreview] =
    useState<AcpOntologyRelationPreview | null>(null);
  const [acpTurnActivityFrame, setAcpTurnActivityFrame] = useState<{
    activity: AcpTurnActivity;
    at: number;
  } | null>(null);
  const meaningEditorSource = useMemo(() => {
    if (!selectedOntologyNode || !nodeEditTarget) return null;
    return {
      id: selectedOntologyNode.id,
      slug: nodeEditTarget.vaultSlug.replace(/^ontology\//, ""),
      title: selectedOntologyNode.display ?? selectedOntologyNode.title,
      kind: selectedOntologyNode.kind,
      frontmatter: nodeEditTarget.frontmatter,
    };
  }, [nodeEditTarget, selectedOntologyNode]);
  const meaningEditorCandidates = useMemo(
    () =>
      (ontologyInsight?.nodes ?? [])
        .filter((node) => ["project", "domain", "capability", "element"].includes(node.kind))
        .map((node) => ({
          id: node.id,
          slug: (resolveNodeAgentTarget(node)?.ref ?? resolveOntologyBuilderNodeSlug(node)).replace(
            /^ontology\//,
            "",
          ),
          title: node.display ?? node.title,
          kind: node.kind,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [ontologyInsight],
  );
  const openMeaningEditor = useCallback(
    ({
      sourceId,
      relation = "dependsOn",
      targetId = null,
    }: {
      sourceId: string;
      relation?: MeaningEditRelation;
      targetId?: string | null;
    }) => {
      setRouteState((current) => ({
        ...selectTopologyNodeRouteState(current, sourceId),
        createNodeIntent: false,
        meaningEditorIntent: true,
        meaningEditParam: targetId ? `${relation}:${targetId}` : null,
      }));
    },
    [setRouteState],
  );
  const closeMeaningEditor = useCallback(() => {
    setMeaningEditorState(null);
    setMeaningPreview(null);
    setRouteState((current) => ({
      ...current,
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [setRouteState, setMeaningEditorState, setMeaningPreview]);
  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (!meaningEditorIntent || !meaningEditorSource) {
        if (!meaningEditorIntent) setMeaningEditorState(null);
        return;
      }
      const parsed = parseOntologyMeaningEditParam(meaningEditParam);
      const initialWhy = parsed
        ? ontologyInsight?.edges.find(
            (edge) =>
              edge.from === meaningEditorSource.id &&
              edge.to === parsed.targetId &&
              meaningEditRelationForEdgeType(edge.type) === parsed.relation,
          )?.label?.trim() ?? ""
        : "";
      const next = {
        sourceId: meaningEditorSource.id,
        initialRelation: parsed?.relation ?? ("dependsOn" as const),
        initialTargetId: parsed?.targetId ?? null,
        initialWhy,
      };
      setMeaningEditorState((current) =>
        current &&
        current.sourceId === next.sourceId &&
        current.initialRelation === next.initialRelation &&
        current.initialTargetId === next.initialTargetId &&
        current.initialWhy === next.initialWhy
          ? current
          : next,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [meaningEditParam, meaningEditorIntent, meaningEditorSource, ontologyInsight]);
  const applyMeaningEditor = useCallback(
    async (plan: OntologyRelationEditPlan) => {
      if (!nodeEditTarget || !meaningEditorState) throw new Error("missing edit target");
      try {
        if (!reducedMotion) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, MOTION.settle.duration * 1000);
          });
        }
        await vault.updateFrontmatter(nodeEditTarget.vaultSlug, plan.updates, {
          expectedMtime: nodeEditTarget.mtime,
        });
        toast.show(tMeaningEditor("saved"), "success");
        closeMeaningEditor();
      } catch (error) {
        toast.show(tMeaningEditor("saveError"), "error");
        throw error;
      }
    },
    [closeMeaningEditor, meaningEditorState, nodeEditTarget, reducedMotion, tMeaningEditor, toast, vault],
  );
  // W6 agent visibility — the fresh heartbeat's declared current target,
  // shown on the map itself (not just a rail dot).
  // Only while the heartbeat is FRESH (same `hasFreshHeartbeat` bar the rail
  // dot/popover already use) — a stale heartbeat's stale focus would mislead
  // more than help. Real heartbeat data only: no slug, no match, or no fresh
  // heartbeat all resolve to `null`, which draws nothing extra on the map.
  const agentActivityStatus = vault.agentActivityStatus;
  const hasFreshAgentHeartbeat = Boolean(
    agentActivityStatus?.heartbeat && agentActivityStatus.valid && !agentActivityStatus.stale,
  );
  const agentFocusNodeId = useMemo(() => {
    // An in-app ACP turn in progress is the current one. Its `null` target is
    // honoured as-is: falling back to the previous sidecar target would draw a
    // focus that is not real.
    if (acpTurnActivityFrame) {
      return resolveAgentFocusNodeId(
        acpTurnActivityFrame.activity.ontologySlug,
        ontologyInsight?.nodes,
      );
    }
    return hasFreshAgentHeartbeat
      ? resolveAgentFocusNodeId(
          agentActivityStatus?.heartbeat?.focus.ontologySlug ?? null,
          ontologyInsight?.nodes,
        )
      : null;
  }, [acpTurnActivityFrame, hasFreshAgentHeartbeat, agentActivityStatus, ontologyInsight]);
  const resolvedAcpRelationPreview = useMemo(
    () => resolveOntologyRelationPreview(acpRelationPreview, ontologyInsight?.nodes),
    [acpRelationPreview, ontologyInsight],
  );
  // While a permission card is up, that decision is the most urgent thing; once it
  // is done the manual editor's own preview resumes. The canvas never draws more
  // than one relation at a time.
  const mapRelationPreview = resolvedAcpRelationPreview ?? meaningPreview;
  // The "an agent just touched this" INDEX badge fires only when the already
  // fresh-gated `agentFocusNodeId` (the same source as the map ring) is also inside
  // the recent-changes lens — reusing both existing signals rather than inventing a
  // second matching heuristic.
  const agentAttributedRecentNodeId = useMemo(
    () => (agentFocusNodeId && recentChanges.recentNodeIds.has(agentFocusNodeId) ? agentFocusNodeId : null),
    [agentFocusNodeId, recentChanges],
  );
  // Create a node from the map itself; only with a writable local vault.
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const [createNodeProposal, setCreateNodeProposal] = useState<{
    input: {
      title: string;
      kind: CreateNodeKind;
      domain?: string;
      localeLabels?: Record<string, string>;
    };
    slug: string;
    markdown: string;
    changeSet: OntologyChangeSet;
  } | null>(null);
  const [createNodeConfirming, setCreateNodeConfirming] = useState(false);
  const createNodeToggleRef = useRef<HTMLButtonElement | null>(null);
  const createNodePanelRef = useRef<HTMLDivElement | null>(null);
  const closeCreateNode = useCallback(() => {
    setCreateNodeProposal(null);
    setCreateNodeConfirming(false);
    setCreateNodeOpen(false);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: false,
    }));
    window.requestAnimationFrame(() => {
      createNodeToggleRef.current?.focus();
    });
  }, [setRouteState, setCreateNodeProposal, setCreateNodeOpen]);
  const canCreateNode = vault.manifest !== null;
  // Triggers the map's reveal once bootstrap finishes.
  const [mapRevealToken, setMapRevealToken] = useState(0);
  // The selected edge, exclusive with node selection: picking a node clears it.
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
    // This relation's why: `relation_notes` promoted to `edge.label` by derivation.
    const edgeRecord = ontologyInsight.edges.find(
      (e) => e.from === selectedEdge.sourceId && e.to === selectedEdge.targetId,
    );
    const why = edgeRecord?.label?.trim() || null;
    const typeLabel = relationVocabulary(selectedEdge.relationType, relationRegister);
    // The edge sentence and both endpoint labels use the short display title.
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
    // The "edit this relation" deep link is built only when this edge is one of the
    // editable relations (others, such as `describes` or domain membership, resolve
    // to null and show no action) AND it really is authored in the `from` node's
    // frontmatter. When it is not editable this stays null and `EdgePanel` renders
    // no action, because a dead affordance is worse than none.
    const meaningRelation = meaningEditRelationForEdgeType(selectedEdge.relationType);
    const authoredByFrom = edgeAuthoredByFromNode(
      selectedEdge.declaredBySlug,
      from.evidenceIds[0],
    );
    const meaningEditHref =
      meaningRelation && authoredByFrom
        ? buildTopologyMeaningEditorEdgeHref(from.id, to.id, meaningRelation)
        : null;
    const contextualEditTarget =
      meaningRelation && authoredByFrom
        ? resolveTopologyNodeEditTarget(from, vault.manifest?.docs ?? [])
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
      meaningEditHref,
      meaningRelation,
      contextualEditable: contextualEditTarget !== null,
      why,
    };
  }, [selectedEdge, ontologyInsight, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister, vault.manifest]);

  /**
   * The edge panel's **openness** and its **contents** are separate values, which is
   * what makes an exit animation possible: `open` is whether it should be up now,
   * `held` is what to keep drawing during the exit window.
   *
   * ★ `useHeldValue` must be given a **key**. Passing none killed the map with React
   * error #301 (infinite re-render): `edgePanelModel` comes from a `useMemo` whose
   * identity is new every render, so identity comparison never converged.
   */
  const edgePanelOpen = Boolean(edgePanelModel) && !selectedOntologyNode && !createNodeOpen;
  const edgePanelKey = selectedEdge ? `${selectedEdge.sourceId}→${selectedEdge.targetId}` : null;
  const heldEdgePanelModel = useHeldValue(edgePanelOpen ? edgePanelModel : null, edgePanelKey);
  // Edge hover micro-card — the lightweight precursor to the click popover.
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
    [setHoverEdge],
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
  // Cluster-chip hover tooltip: state plus the sentence model. The parent title and
  // counts go into `cluster.tooltipCollapsed`/`Expanded` to make one plain line.
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
    // Both numbers are shown together: `total` is the parent's whole descendant
    // count (the same source as the node badge), `hidden` is how many direct
    // children this tier has collapsed.
    const numbers = { name, total: hoverCluster.descendantTotal, hidden: hoverCluster.count };
    const sentence = hoverCluster.expanded
      ? t("cluster.tooltipExpanded", numbers)
      : t("cluster.tooltipCollapsed", numbers);
    return { sentence, x: hoverCluster.x, y: hoverCluster.y };
  }, [hoverCluster, ontologyInsight, t]);
  // Whether the bundled MCP server is present — the config snippet, deep links, and
  // connect button all branch on it.
  const agentServer = useAgentServer();
  // Asks one question only: is an agent attached right now. The registration snippet
  // and domain names left this model when the connect sheet was retired
  // (`docs/DECISIONS.md`, entry 90).
  const agentConnect = useAgentConnectModel({ agentActivityStatus });
  // Do not **automatically open** the AI connection sheet immediately after opening a folder. There was once
// a one-time auto-speech 1200ms later, but a modal covering the first encounter with the self-map just created
// made the first interaction 'close' (measured 2026-07-26). Guidance is already in the
// start checklist and the "Agent" destination.
// Auto-speech adds no value, and contradicts this app's discipline of "not hiding what it introduces."
// Connection intent is established only when the user clicks.
// HomePage modularization phase 1 — bootstrap flow owned by use-bootstrap-flow hook.
// Only completion effects (toast · E1 rebuild) remain here.
  const { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap } = useBootstrapFlow({
    vault,
    onCompleted: ({ addedToExisting, elementCount }) => {
      // The reloaded graph arrives as a reveal — "my documents gathering".
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
    }): Promise<false> => {
      try {
        /*
         * Stamp the node as human-authored. This path is reachable only from the
         * on-screen "create concept" control, so the call path itself proves the
         * actor — the condition the ledger puts on a write-time stamp. Without this
         * line a freshly created node gets no review-pending ring on the map
         * (measured 2026-08-03).
         */
        const { slug, markdown } = buildNewNodeDoc({ ...input, createdBy: "human" });
        if (vault.fileHandles.has(slug)) {
          toast.show(t("createNode.toastExists"), "error");
          return false;
        }
        const frontmatter = parseFrontmatter(markdown).frontmatter;
        setCreateNodeProposal({
          input,
          slug,
          markdown,
          changeSet: buildOntologyChangeSet("add_concept", {
            slug,
            ...frontmatter,
          }),
        });
      } catch (err) {
        const exists = err instanceof Error && err.message.includes("already exists");
        toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      }
      return false;
    },
    [t, toast, vault.fileHandles, setCreateNodeProposal],
  );
  const confirmCreateNode = useCallback(async () => {
    if (!createNodeProposal || createNodeConfirming) return;
    setCreateNodeConfirming(true);
    try {
      await vault.createDoc(createNodeProposal.slug, createNodeProposal.markdown);
      const tail = createNodeProposal.slug.includes("/")
        ? createNodeProposal.slug.slice(createNodeProposal.slug.lastIndexOf("/") + 1)
        : createNodeProposal.slug;
      toast.show(t("createNode.toastSaved", { slug: createNodeProposal.slug }), "success", {
        label: t("createNode.toastSavedAction"),
        onClick: () =>
          setRouteState((current) => ({
            ...current,
            selectedSlug: `${createNodeProposal.input.kind}:${tail}`,
          })),
      });
      closeCreateNode();
    } catch (err) {
      const exists = err instanceof Error && err.message.includes("already exists");
      toast.show(exists ? t("createNode.toastExists") : t("createNode.toastError"), "error");
      setCreateNodeConfirming(false);
    }
  }, [closeCreateNode, createNodeConfirming, createNodeProposal, setRouteState, t, toast, vault]);
  // Domain picker options for "add concept": pick an existing domain node by name
  // rather than typing a slug. `value` is the bare tail slug (`domain:auth` →
  // `auth`); `buildNewNodeDoc` normalises it again through `canonicalizeDomainRef`
  // on save.
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
  // Editing a node's body. The manifest's excerpt is truncated, so editing from it
  // would silently drop text — the body is seeded from the *whole raw file* through
  // the file handle instead, and the explanation editor stays hidden until that read
  // finishes.
  const [nodeBody, setNodeBody] = useState<{ slug: string; raw: string; body: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const target = nodeEditTarget;
    const fh =
      target && vault.manifest !== null ? vault.fileHandles.get(target.vaultSlug) : null;
    if (!target || !fh) {
      // Deferred to a microtask to avoid a synchronous setState (cascading-render
      // warning).
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
  // Client-side dynamic title: static export cannot vary page metadata, so the
  // selected context reaches the browser tab from here.
  useDocumentTitle(
    Array.from(
      new Set(
        [
          selectedProject?.name,
          // The tab title uses the short display title too.
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
  // Reverse dependency map (slug → the projects that depend on it), built once so
  // the 2-hop expansion below does not walk every project each time. O(E) to build,
  // O(1) to look up.
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
  // Relative time of past steps in the session, based on Date.now(). Capture
// once at mount to prevent relative time for the same record from shifting on every re-render.
  const [mountNowMs] = useState<number>(() => Date.now());
  // Local graph mode: passes only the selected node + 2-hop neighbors to Sigma. Allows
// focusing on the area around that node, stepping away from the full map. Return to
// the full map via Esc or close button.
  const localGraphProjects = useMemo(() => {
    if (!localGraphRoot) return renderProjects;
    // Reuses the `projectBySlug` / `reverseDeps` memos above rather than rebuilding
    // the same Maps. Forward expansion is O(|deps|), reverse is O(|reverseDeps|),
    // so extracting the 2-hop subgraph is O(N + E) overall.
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

  // Visual verification against a synthetic large vault. The hidden `?synth=N`
  // parameter (clamped to 100..10000) feeds the map a deterministic synthetic graph
  // instead of the bundled dogfood sample, to stress `computeConcentricLayout` and
  // `relaxCollisions` at real density. It ships in production but is harmless and
  // undocumented on purpose (absent from README and FEATURES). It never touches the
  // user's vault or the single source of truth — the derived graph flows only into
  // the map adapter and is never written. Read once at mount, since it is a demo
  // parameter that cannot change mid-session.
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
  // While the spotlight lens is on, the map's fresh channel is keyed by the mtime
  // window set **alone** — never mixed with the session changeset. Two meanings in
  // one channel make "why is this lit?" unanswerable. With the lens off it is the
  // session changeset as before. What sinks (`spotlightIds`) uses the same set, so
  // there is one source.
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

  // Spotlight auto-expansion. Owner, 2026-07-23: *"If the change is somewhere you would have to
// click into, just expand it all — everything connected"* (if the change is somewhere you would have to
// click into, just expand it all). A changed node collapsed inside a cluster chip
// makes the lens a lie, so every changed node's containment ancestor chain is
// merged in as a **derived** expansion. `?open=` is untouched: this is derived
// deterministically from `?recent=`, so shared links stay reproducible and turning
// the lens off returns to the user's own expansion with no contamination.
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

  /*
   * ⚠️ **The canvas wants a graph node id, not a slug** (found from an owner report,
   * 2026-08-17).
   *
   * Node ids are `${kind}:${slug}` (`derive-ontology-from-vault.ts`), but project
   * deep links send a bare slug (`topology-href.ts`: `kind: project` →
   * `/topology/?p=<slug>`, while other kinds send the node id). So **projects alone**
   * never matched a node on the canvas, and the map translated "something is selected
   * but it is nowhere" into "dim everything" — measured at 1.40:1 against a 3:1 floor
   * for shapes.
   *
   * Projects now go through the same rule as every other kind. If the graph has no
   * such node (the compile emitted no project), the bare slug is kept and the
   * canvas's own safety net drops it to "nothing selected" rather than dying.
   *
   * Focusing never happens on a ghost slug (2026-08-01); the reasoning and the old
   * defect are in `../lib/resolve-canvas-selection.ts`.
   */
  const selectedProjectNodeId = useMemo(() => {
    if (!selectedProject) return null;
    const nodeId = `project:${selectedProject.slug}`;
    return ontologyInsight?.nodes.some((n) => n.id === nodeId) ? nodeId : selectedProject.slug;
  }, [selectedProject, ontologyInsight]);
  /**
   * **A selection confirmed to exist.** `canvasSelectedSlug` below deliberately
   * keeps holding the raw slug while the answer is still undecidable (so deep links
   * do not flicker), so anywhere that has to ask "did the user really open a node?"
   * reads this one instead — above all when that answer writes a **permanent
   * record**.
   *
   * Measured 2026-08-01: the first-visit hint watched `canvasSelectedSlug`, so
   * arriving on a link carrying a slug that does not exist made it true for **one
   * tick before the decision settled**, and that tick dismissed the hint in
   * localStorage forever. It was recorded as learned without the user ever pressing
   * anything.
   */
  const resolvedSelectionSlug = selectedProjectNodeId ?? selectedOntologyNode?.id ?? null;
  const canvasSelectedSlug = resolveCanvasSelectedSlug({
    selectedSlug,
    resolvedSlug: resolvedSelectionSlug,
    sourceReady: deeplinkSourceReady,
    projectsLoaded: projectsQuery.loaded,
    ontologyLoaded: ontologyInsight !== null,
  });
  /** The graph node behind the current selection; "create one from here" reads its
   * kind. */
  const canvasSelectedGraphNode = useMemo(
    () =>
      canvasSelectedSlug
        ? (ontologyInsight?.nodes.find((n) => n.id === canvasSelectedSlug) ?? null)
        : null,
    [canvasSelectedSlug, ontologyInsight],
  );
  const drawerProject = selectedProject;

  // A user can hand-type `?realm=` as a bare slug (`ai-agent-partner`), but node ids
  // live in `kind:slug` space, so it silently matched nothing and rendered a raw chip
  // over the whole map. Promote it to the canonical node id
  // (`capability:ai-agent-partner`); when nothing matches, `null` hides the chip.
  const resolvedRealmSlug = useMemo(
    () => resolveRealmNodeId(realmSlug, (ontologyInsight?.nodes ?? []).map((n) => n.id)),
    [realmSlug, ontologyInsight],
  );

  // Title of the current realm's root node, for the chip. Looked up by the resolved
  // id only, so an unresolved realm has no title and no chip. During the graph
  // rebuild right after entering a realm, the canonical id itself is the fallback so
  // the chip does not flicker — reaching here means the id already resolved against
  // `ontologyInsight`.
  const realmTitle = useMemo(() => {
    if (!resolvedRealmSlug) return null;
    return topologyV2Graph.nodes.find((n) => n.id === resolvedRealmSlug)?.label ?? resolvedRealmSlug;
  }, [resolvedRealmSlug, topologyV2Graph]);

  // Deep-link ancestor expansion. When a `?p=slug` target sits inside a parent
  // subtree the density gate (`model/density-gate.ts`) has collapsed, its `contains`
  // ancestor chain is derived into `open=` so the target becomes visible; the
  // existing focus dive then fires once with the same easing as a click. Guarded by a
  // ref to run at most once per target slug, so a parent the user collapses
  // afterwards is not force-expanded again. Before the graph is built (zero edges)
  // the ref is left unset so the next render can try.
  const deeplinkExpandedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (deeplinkExpandedForRef.current === canvasSelectedSlug) return;
    if (topologyV2Graph.edges.length === 0) return;
    const parentOf = buildContainmentParentMap(topologyV2Graph.edges);
    deeplinkExpandedForRef.current = canvasSelectedSlug;
    // `replace`, because this write normalises the deep link the user arrived on
    // rather than navigating. A push would add a history entry the user never made,
    // so their first Back would undo nothing.
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

  // Footprint trail — the path walked so far, appended each time a node takes ego
  // focus on the map. It is not a mode but a passive record layer over the map: not
  // in the URL, never in localStorage, cleared on reload. The same ordered array
  // feeds the map (recency-decayed footprint rings) and the trail chip (mini
  // timeline + handoff packet).
  const [footprintTrail, setFootprintTrail] = useState<string[]>([]);
  // Guards against appending the same node twice in a row (clicking the background
  // and reselecting). Revisits between two different nodes still append and so
  // refresh the order.
  const lastVisitedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canvasSelectedSlug) return;
    if (lastVisitedNodeRef.current === canvasSelectedSlug) return;
    lastVisitedNodeRef.current = canvasSelectedSlug;
    setFootprintTrail((trail) => appendFootprintVisit(trail, canvasSelectedSlug));
  }, [canvasSelectedSlug]);
  // id → label/kind lookup. The trail is refined against the live graph so a deleted
  // node cannot linger in it — the trail is a derived display layer, never a source.
  const footprintNodeLookup = useMemo(
    () => new Map(topologyV2Graph.nodes.map((n) => [n.id, n])),
    [topologyV2Graph],
  );
  /**
   * The **collapsed** trail the timeline and the handoff packet read: only the last
   * visit to each node. The raw `footprintTrail` keeps the steps walked back over,
   * which is what numbers the map, but handing an agent the same `get_concept` three
   * times is noise, not information.
   */
  const footprintTrailEntries = useMemo<FootprintTrailEntry[]>(() => {
    const entries: FootprintTrailEntry[] = [];
    for (const id of collapseFootprintTrail(footprintTrail)) {
      const node = footprintNodeLookup.get(id);
      if (!node) continue;
      // The handoff packet carries the name the vault knows, not the canvas node id.
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
   * The visit ids handed to the map: the **raw** order with only deleted nodes
   * filtered out, never collapsed. Only the map needs the repeated steps — the step
   * numbers (`buildFootprintSteps`) come from them, and the recency rank collapses on
   * last appearance anyway. Sending the collapsed list would erase "I came here three
   * times" from the screen.
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
  // ── Past trails ──────────────────────────────────────────────────────
  // The session trail dies on reload or window close while `?p=` (where you are now)
  // survives in the URL, so "where" was kept and "how you got there" was the only
  // thing lost. Past trails hold on to that walk; nothing expires or idles it away.
  // Clearing does the opposite and **discards without keeping a copy** — for "clear"
  // to be an honest name it has to remove this session's already-written row too.
  //
  // It is stored as a **file inside the vault folder** (`past-trail-store.ts`): the
  // web and the installed app are different origins, so browser storage cannot carry
  // one past trail between them, and the only floor they share is the user's folder.
  //
  // With no vault open (sample browsing) nothing is written — there is no floor to
  // write to, and falling back to browser storage would recreate exactly that
  // web/app split. Sample browsing loses nothing by being volatile.
  const pastTrailStore = useMemo<PastTrailStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultFilePastTrailStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const [pastWalks, setPastWalks] = useState<PastWalk[]>([]);
  // Write permission is **queried, never requested**. Confronting someone who came to
  // explore with "grant permission to keep a record" is friction. Sessions that
  // already have permission write quietly; the rest write nothing, and the past-trail
  // list says why.
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
  // This session's walk id; every write in this session overwrites that one row (one
  // session = one row). State rather than a ref because the list render reads it to
  // exclude the row currently being walked, so it must be readable during render.
  const [sessionWalkId, setSessionWalkId] = useState<string>(newPastWalkId);
  // Mirror so event handlers (tab hide) can read the latest values.
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
  // A different vault means a different node-id space: start a new walk and read that
  // vault's list.
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
  // **Overwrite in place while walking.** A file write is async, so one started as
  // the page dies never finishes — a design that fails at exactly the moment it must
  // work. Refreshing the same row on every step (after the debounce) means even a
  // force-quit leaves the last state already on disk.
  useEffect(() => {
    if (footprintTrailEntries.length < PAST_WALK_MIN_ENTRIES) return;
    const timer = window.setTimeout(flushPastTrail, PAST_TRAIL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [footprintTrailEntries, flushPastTrail]);
  // At tab-hide the document is still alive and a write can complete, so the last
  // step still waiting out the debounce is flushed here.
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
    // Privacy valve: this session's already-written row is removed too.
    setSessionWalkId(newPastWalkId());
    const store = pastTrailSaveRef.current.store;
    if (store) void store.remove(sessionWalkId).then(setPastWalks);
  }, [sessionWalkId, setFootprintTrail, setSessionWalkId]);
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
  }, [pastTrailStore, setSessionWalkId]);
  // Stored walks are refined against the live map so the row's text (title, count)
  // and the steps a replay actually loads are **the same thing**. A row that says 12
  // places and replays 9 is a quiet lie.
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
  // Row text is finished here: the chip is pure chrome and holds no i18n or date
  // knowledge. Dates are **day resolution only** — showing hours and minutes would
  // make the list read as a behavioural timeline. The row currently being walked is
  // excluded, because the live trail above already shows it.
  const pastWalkRows = useMemo<TopologyPastWalkRow[]>(() => {
    // Reference instant is mount (`mountNowMs`): `Date.now()` during render violates
    // purity, and day-resolution labels do not go wrong by being pinned for a session
    // (only a window left open past midnight sees "today" change a day late).
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
        // Replaying needs enough surviving steps to still read as a walk (the same
        // threshold the chip uses): replaying a one-place walk makes the chip vanish
        // and takes the popover with it.
        const replayable = entries.length >= PAST_WALK_MIN_ENTRIES;
        // Names come from today's map; only unreplayable walks keep the names they
        // had, because there is no way to name something the map no longer has.
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
          // An unreplayable walk gets no label at all. Computing "replay 0 places"
          // when there is no button to attach it to only leaks that string onto some
          // other surface later.
          ariaLabel: replayable
            ? t("footprint.pastReplayAriaLabel", { date, count: entries.length })
            : null,
        };
      });
  }, [refinedPastWalks, sessionWalkId, activeLocale, mountNowMs, t]);
  // A read-only vault must not fail silently: the past-trail list says why nothing is
  // being kept.
  const pastTrailNotice =
    vault.status === "loaded" && !pastTrailWritable ? t("footprint.pastReadOnlyNotice") : null;
  // ── Footprint lens ───────────────────────────────────────────────────
// A transient state **equivalent to** the popover being open: no new mode, toggle,
// or URL state. While it is open the map folds away relation reading (the ego
// highlight edges) and yields to trail reading — only visited nodes keep their
// values and labels, everything else and every edge falls back to the existing dim
// values. Those ego edges were the blue lines the owner called *"dizzying"*
// (dizzying). No trail polyline is drawn (in this product a line means a relation);
// the field is simply cleared for the moment of reading.
//
// The lens flag and the brush are **refs, not state**. As state, every toggle and
// every row hover re-renders this whole page tree (measured: ~100 ms per switch,
// 68–109 ms per hover — squarely in "sticky" territory). The canvas loop reads refs
// every frame anyway, so the same picture costs zero renders.
  const footprintLensActiveRef = useRef(false);
  const footprintBrushNodeIdRef = useRef<string | null>(null);
  const handleFootprintLens = useCallback((active: boolean) => {
    footprintLensActiveRef.current = active;
  }, []);
  const handleFootprintBrush = useCallback((id: string | null) => {
    footprintBrushNodeIdRef.current = id;
  }, []);

  /*
    The single channel by which **hovering a node name in a side panel** makes the
    map point at that node. Two consumers:

    ① The chat panel. Owner, 2026-08-17: *"Just hovering in the chat could mark our node."*
    ② The datasheet's children / parents / evidence / domain rows. Owner, 2026-08-17:
       *"It would be nice if hovering each of these showed it on the map beside — right now nothing responds."* (hovering each of these should show it
       on the map beside — right now nothing responds).

    Adding ② created **no second channel**. "Blink" does not ask for a blink or a
    glow — this repo forbids blink, glow, and pulse (`.claude/rules/forbidden.md`,
    the design section) — it means *"make it visible where that is"*, and the map
    already has a mark taught for exactly that: the one a node shows when the pointer
    is over it. One channel means one highlight, so there is nothing new to learn.

    Same contract as footprint brushing: the cursor is over a side panel rather than
    the canvas, so it never competes with canvas hover, and being a ref it costs no
    render per hover. The two consumers cannot collide — there is one cursor.
  */
  const panelHoverNodeIdRef = useRef<string | null>(null);
  /* Which names in a reply become links — **only names that really exist**. Linking
     any `a/b` would turn file paths and URLs into links too, and someone who meets
     one link that goes nowhere stops pressing the rest.

     ⚠️ **There are two name spaces** (measured against the real app, 2026-08-17).
     This list used to be built from `nodes.map((n) => n.id)`, but those ids look like
     `domain:example-domain` while **the name an agent uses is
     `domains/example-domain`**. The two can never be equal, so no name in a chat ever
     matched and the whole feature was wired but dead. The decision and the
     reproduction live in `chat-node-index.ts`. */
  const chatNodeIndex = useMemo(
    () => buildChatNodeIndex(ontologyInsight?.nodes),
    [ontologyInsight],
  );
  const chatKnownSlugs = useMemo(() => new Set(chatNodeIndex.keys()), [chatNodeIndex]);
  /* Identity changes only when the index does, which is only when the vault changes.
     Reading a ref during render would look cheaper but is the pattern that breaks
     under concurrent rendering. */
  const handleChatHoverSlug = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );
  /* The datasheet's relation rows already hand over a **canvas node id** (the same
     name space as `onSelectConnection`), so they skip the index. */
  const handleDatasheetHoverConnection = useCallback((id: string | null) => {
    panelHoverNodeIdRef.current = id;
  }, []);
  /* Evidence rows hand over a **vault slug**, so they go through the same index as
     the chat. A document the map does not have resolves to null and nothing
     happens. */
  const handleDatasheetHoverEvidence = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );

  // A node click defaults to the compact ego popover; the full-detail overlay is
  // opt-in (overview first, details on demand — `docs/TOPOLOGY-FOCUS-AND-SCALE.md`).
  // This holds the slug whose full detail is open, and the overlay renders only when
  // it matches the current selection, so picking another node falls back to its
  // popover with no effect needed.
  const [fullDetailSlug, setFullDetailSlug] = useState<string | null>(null);
  // Node right-click context menu. `slug` here is the CANVAS graph
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
  // The last screen coordinates pressed on the map. The detail popover uses them as
  // its growth origin so it appears to grow out of the node that was clicked.
  // Selections that are not canvas clicks (INDEX, a connection row, the keyboard)
  // have no coordinates and fall back to `center top`.
  const lastCanvasPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const nodePopoverPositionerRef = useRef<HTMLDivElement | null>(null);
  const handleCanvasPointerDownCapture = useCallback((event: ReactPointerEvent) => {
    lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, []);
  const [selectedRelationActive, setSelectedRelationActive] = useState(false);
  // In the Esc dismissal order, the first press closes the node popover WITHOUT
  // releasing the ego focus (the dim); the second — with this true — deselects. Reset
  // to false on every fresh node selection so re-clicking a node always reopens its
  // popover. A `null` selection also clears it via `handleClose`.
  const [nodePopoverDismissed, setNodePopoverDismissed] = useState(false);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  /**
   * Full detail is a lazy chunk. It used to paint the opaque full-bleed surface
   * (`fixed inset-0` plus the canvas background) the instant `fullDetailOpen` went
   * true, while its contents arrived only once the chunk did — so after the press
   * **the whole window held black for 150 ms** (frame diff exactly 0.000 across nine
   * frames) and the destination popped in one frame. An arrival with no visible
   * origin, and it reads as the app having died.
   *
   * So the order is inverted: **the departure screen (the map) stays** until the
   * chunk is ready. The arrival then puts background and content in one commit and
   * resolves as a single crossfade — the same grammar close already used, leaving by
   * the way you came. No skeleton and no fake progress bar: the departure screen
   * covers that time.
   *
   * Prewarming happens the moment a node is selected — that is, the moment the
   * popover with the full-detail action becomes visible — so by the time it is
   * actually pressed there is nothing left to wait for.
   */
  const [FullDetailCard, setFullDetailCard] = useState<FullDetailA1Component | null>(null);
  useEffect(() => {
    if (FullDetailCard) return;
    if (!selectedOntologyNode && fullDetailSlug == null) return;
    let cancelled = false;
    void importFullDetailA1()
      .then((mod) => {
        // Wrapped once so a function value is not mistaken for a state updater.
        if (!cancelled) setFullDetailCard(() => mod.FullDetailA1);
      })
      .catch(() => {
        /* A failed chunk leaves the render gate below closed, as it already is. */
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
  // Onboarding QA, 2026-07-24: the composer's initial kind is state so the start
  // checklist can carry a "create your first project/domain" intent into it. Ordinary
  // entry points keep the previous default.
  const [createNodeDefaultKind, setCreateNodeDefaultKind] = useState<CreateNodeKind>("capability");
  /**
   * The domain "create one from here" preselects: opening it from a domain node on
   * the map arrives with that domain already chosen. An empty string means no domain,
   * as before.
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
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [setRouteState, setCreateNodeDefaultKind, setFullDetailSlug, setCreateNodeOpen]);
  const openCreateNodeWithKind = useCallback(
    (kind: CreateNodeKind) => {
      openCreateNode();
      setCreateNodeDefaultKind(kind);
    },
    [openCreateNode, setCreateNodeDefaultKind],
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
  // An authored `significance` in the frontmatter overrides the derived "why this
  // matters" line. Unspecified keys are preserved by the parser, so this needs no
  // schema change.
  const authoredSignificance = useMemo(() => {
    const value = nodeEditTarget?.frontmatter?.significance;
    return typeof value === "string" ? value : null;
  }, [nodeEditTarget]);
  const formatUpdatedLabel = useCallback(
    (key: string, count: number) => t(`nodeDatasheet.updated_${key}`, { count }),
    [t],
  );
  // Copy for the last-editor and conflict badges. Reuses the same `editProvenance`
  // namespace as `DocFrontmatterBlock` rather than copying it, so the two cannot
  // drift.
  const tEditProvenance = useTranslations("editProvenance");
  const tSummaryFreshness = useTranslations("summaryFreshness");
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
    editBaselineScopeKey: deeplinkSourceReady ? vaultIdentity : null,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps: vault.selfEditTimestamps,
    formatEditAgeLabel,
  });
  /*
   * Lifts the diagnosis **out of the selection**. `useProjectSourceModel` below only
   * ever sees the one selected project, so unless somebody clicks that node, "no code
   * folder is linked" exists nowhere on screen (measured 2026-08-04: zero occurrences
   * on the first screen). This hook reads the sidecar once and puts that one fact in
   * a quiet INDEX row.
   */
  const sourceProjectSlug = projectSlugForSource(selectedOntologyNode);
  const projectSource = useProjectSourceModel({
    projectSlug: sourceProjectSlug,
    vaultHandle: vault.status === "loaded" ? vault.handle : null,
    nodes: ontologyInsight?.nodes ?? [],
    docs: vault.manifest?.docs ?? [],
    // Even the OS folder picker's title must be in the screen's language: measured
    // 2026-08-04, the installed app opened an English-titled picker over a Korean
    // screen.
    pickerTitle: t("nodeDatasheet.sourcePickerTitle"),
  });
  const projectSourceReadiness = useProjectSourceReadiness({
    vaultHandle: vault.status === "loaded" ? vault.handle : null,
    nodes: ontologyInsight?.nodes ?? [],
    // Since connections/measurement do not change the markdown graph, waiting for manifest update means it will never
// re-parse. Uses the moment the selected project model finishes the actual sidecar transition as the invalidation token for this read-only summary.
    refreshToken: [
      sourceProjectSlug ?? "",
      projectSource.view?.bindingCardinality ?? "",
      projectSource.view?.measuredAt ?? "",
      projectSource.proposalSettled ? "settled" : "pending",
    ].join(":"),
  });
  const unboundProjectSource = projectSourceReadiness.unbound;
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
  // Carries the selection into the nav rail. Going to the rail's documents entry with
  // a node selected used to land on the default `/docs/` screen, unrelated to what
  // was selected. The datasheet has already derived `documentHref` (a `?slug=` deep
  // link to the vault file), so it is registered with the rail as-is — no new
  // parameter and no new transform. With nothing selected `documentHref` is null and
  // the rail keeps its default href.
  const navRailContextHrefs = useMemo(
    () => buildNavRailContextHrefs(v2DatasheetModel?.documentHref ?? null),
    [v2DatasheetModel?.documentHref],
  );
  useNavRailContextHrefs(navRailContextHrefs);
  // Bound to the datasheet being *shown*, not merely to its model existing, so the Esc
  // dismissal order is honoured: after the first press (popover closed, selection
  // kept) the left panel must come back. The realm ledger is exempt from the
  // automatic demotion because it is a realm's only exit and navigation surface.
  const topologySelectionActive = Boolean(v2DatasheetModel) && !nodePopoverDismissed;
  const {
    manualExpand: indexManualExpandDuringSelection,
    markManualExpand: markIndexManualExpandDuringSelection,
    beginExpandedSelection: beginExpandedIndexSelection,
  } = useIndexSelectionOverride(topologySelectionActive);
  // Clicking the collapsed edge tab always means "give the slot back to
  // INDEX" — the analysis rail owns the slot only because of a non-overview
  // mode (focus/path/health), so returning to overview is always enough.
  const handleIndexTabExpand = useCallback(() => {
    setIndexPreference("expanded");
    // A manual expand during a selection beats the automatic demotion for the rest
    // of that selection. The selection-session hook resets this at the exact
    // inactive/active transition, before the next frame can inherit it.
    markIndexManualExpandDuringSelection();
    // Same for the empty-map demotion. Without this line the tab depresses and
    // nothing happens, because the demotion re-collapses it every render.
    setIndexManualExpandWhileEmpty(true);
    if (analysisMode !== "overview") {
      setRouteState((current) => ({ ...current, analysisMode: "overview" }));
    }
  }, [
    analysisMode,
    markIndexManualExpandDuringSelection,
    setIndexPreference,
    setRouteState,
  ]);
  // Entry inspection E-7 — The `auto-align` toast completely covered the bottom-right permanent readout.
// Both are fixed to bottom-right, but the toast has a default 16px offset,
// so the notification sat directly on top of the instrument. Reconnects the reserved contract
// (`--app-toast-bottom-offset`) used by the builder's bottom bar to this stack — the reserved height is
// not a constant but the measured rect of the stack (varies by locale, zoom tier, ≥1920 inset).
  const readoutStackRef = useRef<HTMLDivElement | null>(null);
  const readoutStackHidden = v2DatasheetModel !== null;
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--app-toast-bottom-offset");
    const element = readoutStackRef.current;
    if (readoutStackHidden || !element) {
      clear();
      return undefined;
    }
    const apply = () => {
      const rect = element.getBoundingClientRect();
      // Below `md` the instruments are `hidden`, so height is 0 and there is nothing
      // to reserve.
      if (rect.height === 0) {
        clear();
        return;
      }
      root.style.setProperty(
        "--app-toast-bottom-offset",
        `${resolveToastBottomOffsetForStack(window.innerHeight, rect.top)}px`,
      );
    };
    // The number of lines in the stack increases later — the instrument readout (`FirstRunReadout`) is attached after
// sample mode determination finishes. If measured only once at mount, the reservation solidifies with one line
// short, causing the toast to cover the readout (measured 54px vs needed 79px).
//
// The first measurement is left to the ResizeObserver's **initial delivery**
// (boot measurement, 2026-08-19). Calling `apply()` synchronously from the commit
// effect, as it used to, forces layout on a document whose DOM was just swapped —
// 36–45 ms under 4× CPU throttling, the single largest item in the boot's longest
// task. An RO callback runs, by spec, after layout and before paint, so it reads
// the same rect for free and the variable is still set before the first paint. Only
// environments without RO fall back to the synchronous measurement.
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
  }, [readoutStackHidden]);
  // Click focus signature — aligns the growth origin (transform-origin) of the popover with the screen coordinates of the just-clicked node.
// The panel is keyed by slug and re-mounts + triggers `.topology-chrome-in` appearance every time the node changes, so
// using the slug as a dependency and injecting the origin converted to the positioner's local coordinate system as a CSS variable before paint (useLayoutEffect) (inheritance → internal panels read it). If no recent (<600ms) canvas pointer exists (list/keyboard selection), clears the variable to fall back to existing `center top`.
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
    // Convert the click point into the panel box's local coordinates and clamp it
    // inside. The panel is anchored top-right, so the node is usually down and to the
    // left; making that corner the origin is what reads as the popover growing out of
    // the node.
    const ox = Math.max(0, Math.min(rect.width, pointer.x - rect.left));
    const oy = Math.max(0, Math.min(rect.height, pointer.y - rect.top));
    positioner.style.setProperty("--topology-chrome-in-origin", `${ox}px ${oy}px`);
  }, [nodePopoverSlug]);
  // Owner follow-up, 2026-07-24: the realm and spotlight ledgers close during a node
  // selection too — having the left and right panels both open at once is
  // uncomfortable. The escape affordance survives in the ✕ on the realm/lens chips and
  // in Esc, so keeping the ledger permanently visible is not required. It returns when
  // the selection clears.
  /** Is this a map with no concepts to hold yet? See `indexManualExpandWhileEmpty`. */
  const topologyGraphEmpty = (ontologyInsight?.nodes.length ?? 0) === 0;
  /*
   * Opening the agent dock on the right puts INDEX through the same session demotion.
   * With both up, the map — the thing you need in order to judge what the agent is
   * changing — is left as a narrow corridor in the middle. No stored preference is
   * touched, so closing the chat restores the user's INDEX state. An ask intent
   * arriving in the URL honours the same spatial contract from its first frame.
   */
  const agentDockRequestedOpen =
    acpDockFrameOpen ||
    vaultAgentOpen ||
    Boolean(llmBridgeAvailable && routeState.askIntent);
  /*
   * ⚠️ Lifted out of the JSX so INDEX can yield to it (owner, 2026-08-25). The checklist centres in
   * the map area; with INDEX open that area is not the window, so the surface asking for attention
   * sat off the middle while claiming it. `resolve-contextual-index-state` now collapses INDEX while
   * this is true, which is the same shape as the existing agent-dock and meaning-editor rules.
   */
  // Declared here rather than beside its dismiss handler: `resolveContextualIndexState` below needs
  // it, and INDEX cannot yield to a surface whose visibility is computed after INDEX is resolved.
  const [startStepsDismissed, setStartStepsDismissed] = useState(() =>
    readFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY),
  );
  /**
   * Dismisses the first-steps card, meaning the last step is behind them. Session
   * scoped, so reopening the app shows the guidance again.
   */
  const dismissStartSteps = useCallback(() => {
    writeFirstRunStarterDismissed(VAULT_START_STEPS_DISMISSED_KEY);
    setStartStepsDismissed(true);
  }, []);

  const startStepsVisible =
    canCreateNode && !startStepsDismissed && !agentDockRequestedOpen;

  const renderedIndexState = resolveContextualIndexState({
    baseState: baseRenderedIndexState,
    meaningEditorOpen: Boolean(meaningEditorIntent),
    selectionActive: topologySelectionActive,
    // `?index=expanded` is an explicit deep-link contract (not merely the
    // stored default). Legacy `/ontology?node=…` redirects carry it so the
    // requested INDEX context stays visible beside the selected node.
    selectionManualExpand:
      indexManualExpandDuringSelection || indexState === "expanded",
    graphEmpty: topologyGraphEmpty,
    emptyManualExpand: indexManualExpandWhileEmpty,
    agentDockOpen: agentDockRequestedOpen,
  });
  /**
   * Collapse ↔ expand is **one event** produced by one click. Previously only the
   * arriving surface got any time and the leaving one got zero frames. Drawing both
   * frames overlapped in the same slot makes **what leaves, what arrives, and the map
   * all start on the same frame**, which structurally guarantees the rule that steps
   * from one input must start within `--motion-fast` of each other.
   *
   * The exit window is the shared `EXIT_WINDOW_MS`: surfaces over the map leaving by
   * different timings would be the same defect again.
   */
  const indexSlotSwap = useSurfaceSwap(renderedIndexState);
  /*
   * Detects which agent runtimes are available, so the screen **right after a folder
   * is opened** can say what can be used (owner remark, 2026-08-16). Kept only inside
   * settings, that fact exists solely for people who go looking for it.
   *
   * **Only verified runtimes** are named. Recommending something we have not actually
   * measured, on the first screen, reads as a guarantee.
   *
   * The decision lives in one place, `isGuardedRuntime`. A session mode once made
   * Codex qualify here, but installed acceptance proved that mode does not stop an
   * Atlas MCP write. Removing it from the shared predicate removes it from both
   * this selector and the Agents destination instead of leaving one unsafe door.
   */
  const [acpRuntimes, setAcpRuntimes] = useState<
    Array<{ id: string; label: string; icon: string | null; brandInk: string | null }>
  >([]);
  const [acpRuntimeId, setAcpRuntimeId] = useState<string | null>(null);
  const [pendingAgentChatRuntimeId, setPendingAgentChatRuntimeId] = useState<string | null>(null);
  /**
   * A first turn the door asked to open with, held until the dock is actually up.
   *
   * `nonce` rather than a bare string: pressing the same door twice must send again, and a value
   * that never changes would be indistinguishable from "already handled" (decision, 2026-08-24).
   */
  const [agentOpeningRequest, setAgentOpeningRequest] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const pendingAgentChatPromptRef = useRef<string | null>(null);
  /**
   * Whether the chat panel is **mounted** — a different value from whether it is open.
   * Open asks "should it be visible"; this asks "is it drawn". If the two were one
   * value, closing would leave no room for the exit animation to run (which is why it
   * used not to run).
   */
  const [chatMounted, setChatMounted] = useState(false);
  const acpSessionStartTimerRef = useRef<number | null>(null);
  const cancelAcpSessionStart = useCallback(() => {
    if (acpSessionStartTimerRef.current === null) return;
    window.clearTimeout(acpSessionStartTimerRef.current);
    acpSessionStartTimerRef.current = null;
  }, []);
  const scheduleAcpSessionStart = useCallback(() => {
    cancelAcpSessionStart();
    acpSessionStartTimerRef.current = window.setTimeout(() => {
      acpSessionStartTimerRef.current = null;
      setAcpChatOpen(true);
    }, ACP_SESSION_START_AFTER_REFLOW_MS);
  }, [cancelAcpSessionStart]);
  useEffect(() => cancelAcpSessionStart, [cancelAcpSessionStart]);
  /**
   * The chat column's width is **chosen by the user and remembered by this machine.**
   * Some people ask short questions while watching the map; others read blocks of
   * code. No single width serves both, so all we enforce is the line below which the
   * map stops working.
   */
  const chatWidth = useChatWidth();
  useEffect(() => {
    if (!isAcpBridgeAvailable()) return;
    let cancelled = false;
    /*
     * **Called twice**, so the frame that paints the first screen does not also carry
     * a login probe (hundreds of ms). Draw with what was found, then correct once the
     * probe finishes: a tool that is not logged in drops out of the list at that
     * point, because opening a session with it would die on an auth error.
     */
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = (list ?? [])
        .filter((r) => r.state === 'ready' && r.verified && isGuardedRuntime(r.id, r.isolated))
        // The mark and its brand colour ride along so the start checklist can *show* the tool it
        // found rather than only name it. Both are already on the registry row.
        .map((r) => ({ id: r.id, label: r.label, icon: r.icon, brandInk: r.brandInk }));
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
    The answer to "what should I ask?" is derived from **this folder's current state**
    (2026-08-17). Reading the vault is the view's job and the chat panel receives only
    the result: were the panel to read the vault itself it could not stand without a
    `LocalVaultProvider`, and that is not a property that widget has ever had.
  */
  const chatSuggestions = useChatSuggestions(projectSourceReadiness.state);
  const acpRuntimeLabel = acpRuntime?.label ?? null;
  /*
   * Memoised: a fresh array every render changes the identity of the consuming hook's
   * `start`, and the effect watching it re-runs forever. The session hook holds the
   * lock (`startingRef`), but **not spinning in the first place is this call's job**.
   *
   * If the runtime already reads the same server from the vault **by itself**, it is
   * not injected again here — measured 2026-08-17, `mcp.ontology-atlas.*` and
   * `mcp.atlas-vault.*` produced identical results from two processes. The decision
   * and its evidence are in `vault-mcp-server.ts`.
   */
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
            command: vault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: vault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    // Claude's isolated config already asks before every tool call, so a second
    // server-side gate would double-prompt. Everything else gets the server gate.
    return vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
      ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
    });
  }, [
    agentServer.launch,
    gitVaultPath,
    acpRuntimeId,
    vault.agentConfigStatus?.codexConfigValid,
    vault.agentConfigStatus?.codexRegisteredCommand,
  ]);

  /*
   * The in-app agent **registers its own name in the vault** (owner instruction,
   * 2026-08-17). Before this, every node it created carried
   * `created_by: agent:unknown` — the server knew the name, but that field only accepts
   * a name a human deliberately registered, and there was nowhere to register one. The
   * human choosing which tool to talk to *is* that intent, and the app knows it. The
   * decision and its evidence are in `lib/acp-agent-heartbeat.ts`.
   */
  const acpHeartbeatStore = useMemo<AcpHeartbeatStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultAcpHeartbeatStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const acpWorkReceiptStore = useMemo<AcpWorkReceiptStore | null>(
    () =>
      vault.status === "loaded" && vault.handle
        ? createVaultAcpWorkReceiptStore(vault.handle)
        : null,
    [vault.status, vault.handle],
  );
  const refreshVault = vault.refresh;
  const handleAcpWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    if (!acpWorkReceiptStore) return;
    void acpWorkReceiptStore
      .append(receipt)
      .then(() => refreshVault())
      .catch(() => {});
  }, [acpWorkReceiptStore, refreshVault]);
  const acpLiveWork = useMemo<AgentLiveWorkInput | null>(() => {
    const frame = acpTurnActivityFrame;
    if (!frame) return null;
    return {
      rawAgentName: acpHeartbeatAgentName(acpRuntimeId),
      phase: frame.activity.state,
      summary: frame.activity.summary,
      targetSlug: frame.activity.ontologySlug,
      lastTool: frame.activity.toolName,
      updatedAt: frame.at,
    };
  }, [acpRuntimeId, acpTurnActivityFrame]);
  const handleAcpTurnActivityChange = useCallback(
    (activity: AcpTurnActivity | null) => {
      // The screen already has this event. React memory updates first; the sidecar
      // follows, for external consumers and for continuity across a restart.
      setAcpTurnActivityFrame(activity ? { activity, at: Date.now() } : null);
      const store = acpHeartbeatStore;
      if (!store) return;
      const agent = acpHeartbeatAgentName(acpRuntimeId);
      // With no name, register nothing — unknown is better left as unknown.
      if (!activity || !agent) {
        void store.clear().catch(() => {});
        return;
      }
      void store.write(buildAcpTurnHeartbeat({ agent, at: new Date(), activity })).catch(() => {});
    },
    [acpHeartbeatStore, acpRuntimeId, setAcpTurnActivityFrame],
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
    // **No blanket invalidation** (performance trace, 2026-07-28). This effect also
    // runs when a node is selected, because INDEX demotes to the rail. Discarding the
    // whole token cache forces a style recalculation on the next frame — 115
    // `getPropertyValue` calls, 58 ms burnt on every click. The only token
    // `data-topology-index` actually changes is `--topology-v2-safe-inset-left`, so
    // only that one is refreshed.
    refreshIndexDependentTokens(root);
    let cancelled = false;
    // Deferred to a microtask to avoid a synchronous setState (cascading-render
// warning).
//
// The 3D dome does not get this re-fit (measured 2026-08-18). This effect runs on
// **every selection and deselection** (the INDEX rail demotion). In 2D the fit was
// harmless because the focus dive overwrote it a frame later, but on the dome the
// fit token takes the same path as auto-arrange (easing the pose home and re-arming
// the autonomous rotation) — so selecting a node sent the dome home instead of
// diving, and merely deselecting revived the attention rotation. Owner: *"I am not steering it; the screen turns by itself."* (I am not steering it; the screen turns by itself). The dome fit has 15% margin, which absorbs the INDEX rail's width change, and the selection reframe measures the inset itself at use time, so it avoids the panel without this re-fit.
    if (!view3d && !acpDockFrameOpen) {
      window.queueMicrotask(() => {
        if (!cancelled) setFitViewToken((count) => count + 1);
      });
    }
    return () => {
      cancelled = true;
      delete root.dataset.topologyIndex;
    };
  }, [renderedIndexState, view3d, acpDockFrameOpen]);
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
  }, [projectSource, v2DatasheetModel, copyV2NodeHandoff, projectAwareHandoffText, setFullDetailSlug]);
  const projectSourceNextAction = projectSource.view?.nextAction.id ?? null;
  const projectSourceNextActionAvailable = Boolean(
    // While the proposal is still settling, **draw no prescription at all.** Drawing
    // early means the button changes label and skin 300 ms later and shifts upward —
    // out from under a cursor that is already there.
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
       * On the web this used to **turn into** an explanatory sentence ("you can link a
       * code folder in the installed app"), i.e. a notice wedged into the slot for an
       * action label. Web users got one grey unpressable sentence and nothing else —
       * no why, no where to go, no what still works here. The label is now always an
       * action label, and the notice for surfaces that cannot act is owned entirely by
       * `projectSourceDegraded`.
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
   * Built only when this surface cannot perform the action. The four folder-picking
   * actions (connect, rebind, measure, remeasure) need an absolute path, and a browser
   * cannot know one (the vault-absolute-path bridge in `.claude/rules/surfaces.md`).
   *
   * It carries all three parts: why · where · **and what still works here**. Without
   * the third, the notice claims things are impossible that are not (2026-08-01: the
   * web's "cannot connect" was false).
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
   * **"Is this the right folder?" (the on-screen prompt) — connecting in one step instead of two.**
   *
   * Pressing "link a code folder" used to always open the OS folder picker, leaving
   * the person to find their own repository in a tree again. The app already knows
   * the answer: measuring the vault root once walks up to the git repository that
   * contains it.
   *
   * The one line of evidence states **only what was measured**: that it is a git
   * repository, and how many of the declared paths were actually found there. With
   * zero declared paths it says so rather than inventing a ratio. When there is no
   * proposal, or confidence is low, this whole value is `null` and the screen draws
   * only the folder picker as before — no dead CTA.
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
  // The "path" action tile sets this node as the path-analysis source and
  // enters path mode. Reuses `selectTopologyPathRouteState` (already defined
  // in `model/url-state.ts` for the URL-driven path deep link, but never
  // wired to an in-app interaction until now) — no new path-mode entry logic.
  const handleSetPathSource = useCallback(
    (slug: string) => {
      setExpandAllActive(false);
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
    [setRouteState, setFullDetailSlug, setSelectedRelationActive],
  );
  // Context-menu quick-action model — same construction as
  // `v2DatasheetModel` (documentHref/meaningEditHref/handoffText), but keyed
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
    // Own document vs. a document that merely mentions it. The context menu has no
    // evidence list, so simply dropping the link for a node with no document of its
    // own would lose the information; the label changes instead and stays honest.
    const { ownSlug, mentionedInSlug } = resolveNodeDocument(node);
    // The handoff text carries the name the vault knows: the document slug, or the
    // reference as written.
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
      // Editor deep links always use the canonical `<kind>:<slug>` graph node id.
      meaningEditHref: buildTopologyMeaningEditorNodeHref(node.id),
      handoffText,
    };
  }, [contextMenuNode, handoffSource, ontologyInsight]);
  /*
   * The context menu has an exit window too, and its anchor and model must be held
   * through it or it becomes an empty menu while closing. The key is slug + position:
   * right-clicking the same node somewhere else is a new value.
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

  // Full detail is the datasheet expanded. Its groups and reach come from the same
  // source as the compact datasheet (derived from `buildV2Connections`, reusing
  // `buildOntologyReachability`), so the two surfaces' numbers cannot drift.
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
   * Full detail's model **becomes null the instant it closes** — that is exactly the
   * gate against deriving a model for a surface that is not on screen — so opening an
   * exit window means holding the value too. The key is the slug: this model comes
   * from a `useMemo` whose identity changes every render, and passing it with no key
   * kills the whole map with React #301 (measured on the edge panel).
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
  const meaningEditorOpen = Boolean(
    meaningEditorState &&
      meaningEditorSource &&
      meaningEditorState.sourceId === meaningEditorSource.id &&
      selectedNodeFocusActive &&
      !selectedRelationActive &&
      !createNodeOpen &&
      !nodePopoverDismissed,
  );
  // Whether the compact node popover is actually on screen (the same condition the
  // popover JSX renders under). Drives both the Esc dismissal order's
  // `nodePopoverOpen` step and the popover's own render guard, so the two can never
  // disagree about whether the first Esc should close it.
  const nodePopoverVisible =
    selectedNodeFocusActive &&
    !selectedRelationActive &&
    !createNodeOpen &&
    !nodePopoverDismissed;
  // Popover entrance/exit symmetry. When `panelOpen` drops to false the panel is not
  // unmounted immediately but kept for the exit animation (~120 ms). During the exit
  // the selection-derived `v2DatasheetModel` goes null, so the helper holds its latest
  // immutable snapshot. A different selected node gets no old snapshot while its own
  // model is still unavailable.
  //
  // 2026-08-03: **the exit window now belongs to the panel** (the `<Surface>` inside
  // `TopologyV2DetailPanel`). The old `usePanelPresence` + `presence` prop pairing kept
  // the window in the parent and only told the child which class to wear, which made
  // "does this surface have a way out" a fact living outside the panel's own file —
  // somewhere the hard-cut ratchet's detector cannot see. All that remains here is
  // **when to take the positioner down**, and the answer is the panel's own `onExited`
  // notification: two exit timers on one surface means neither is the truth.
  const panelOpen = nodePopoverVisible && Boolean(v2DatasheetModel) && !meaningEditorOpen;
  const [nodePanelMounted, setNodePanelMounted] = useState(false);
  // Adjusted during render. Raising this in an effect leaves the positioner missing on
  // the first open frame and delays the entrance by one frame (`useHeldValue` holds
  // during render for the same reason).
  if ((panelOpen || meaningEditorOpen) && !nodePanelMounted) setNodePanelMounted(true);
  const panelDatasheetModel = useRetainedDatasheetModel(
    v2DatasheetModel,
    selectedOntologyNode?.id ?? null,
  );
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
    topologyUtilityChromeState === "selected-node-inspector" ||
    agentDockRequestedOpen;
  /*
   * The utility lane is raised one step **only while the activity inbox is open**.
   * Owner, 2026-08-17: *"Should the notification cover what is above?"* (the notification should cover what is
   * above). The lane's `z-20` creates a stacking context the inbox inside it cannot
   * escape, so the right-hand tool tiles — also `z-20` but later in the DOM — painted
   * over it. It is not raised permanently because the lane would then poke through the
   * scrim (`--z-map-scrim`, 25) whenever the scrim is meant to cover it.
   * Gate: `tests/e2e/agent-activity-placement.spec.ts`.
   */
  const [activityInboxOpen, setActivityInboxOpen] = useState(false);
  const topologyUtilityLaneSuppressionContract = selectedRelationActive
    ? "selected-relation-inspector-owns-right-rail"
    : selectedNodeOwnsRightRail
      ? "selected-node-inspector-owns-right-rail"
      : undefined;

  /**
   * Screen context — this agent's single biggest advantage. It is injected from the
   * system side every turn, so the model never has to ask for it with a tool and it is
   * always fresh. Names are passed as the screen names them (the handoff slug decided
   * by `resolveNodeAgentTarget`): a handoff only works the moment it is pasted if the
   * human and the agent use the same name.
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
   * **One chat panel** (owner decision, 2026-08-16).
   *
   * There are two ways to hold a conversation here: through a coding agent installed
   * on this machine (ACP), or through an API key the user supplied. Each used to have
   * **its own door and its own panel**, and neither knew whether the other was open —
   * so two similar-looking chat panels could appear to the right of the map at once.
   * Owner: *"Is this chat a different thing from that agent? It's confusing."* (this chat is a
   * different thing from that agent, isn't it? it's confusing).
   *
   * Two branches is a fact and not itself the problem; **two doors and two panels**
   * was. So there is one door:
   *
   * - a coding agent, if one is detected (it can do more — it uses this folder's MCP
   *   tools directly and rides the subscription and settings the user already has)
   * - otherwise the key branch, which is what remains for people who use no coding
   *   agent
   * - **never both at once**
   */
  const agentChatUsesRuntime = Boolean(acpRuntime && gitVaultPath);

  const openVaultAgent = useCallback(() => {
    cancelAcpSessionStart();
    if (agentChatUsesRuntime) {
      setChatMounted(true);
      setAcpChatOpen(false);
      setAcpDockFrameOpen(true);
      setVaultAgentOpen(false);
    } else {
      setAcpDockFrameOpen(false);
      setVaultAgentOpen(true);
      setAcpChatOpen(false);
    }
    // The surfaces that retreat take their own close paths, so nothing simply blinks
    // out.
    setOntologySearchOpen(false);
    setCreateNodeOpen(false);
  }, [agentChatUsesRuntime, cancelAcpSessionStart, setCreateNodeOpen]);

  /**
   * On-screen wording for the first line, read from **the same keys** as the panel's
   * empty-chat chips. If each entry point picked its own phrasing, the same idea would
   * be said two different ways.
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
   * "Ask about this" on the node detail. The sentence is written by the first-line
   * generator (`screenIntentFor`), so it is character-for-character the empty chat's
   * first chip and the two entry points cannot diverge. Pressing it opens the panel and
   * seats the sentence in the input; sending is still the send button.
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
   * Arriving from the insight queue with `?ask=` in the URL.
   *
   * **The URL is the state.** Nothing is copied into React state, so "is the panel
   * open" and "what is being asked" live in one place, and going Back to that URL
   * restores the same context. The URL carries only the **kind of intent**; the
   * sentence is written here, by the same generator as the empty-chat chips.
   */
  /** Constant: the URL is constant, so the seat must not re-fire on every render. */
  const BUSINESS_FLOW_PREFILL_NONCE = 0;

  const askPrefill = useMemo(() => {
    /*
     * The whole-graph request arrives named, not carried, so it is rebuilt here
     * from the app's own localized string. That keeps the sentence out of a URL
     * that gets copied and shared, and means a link made last week still opens
     * this week's request rather than a frozen copy of it.
     */
    if (llmBridgeAvailable && routeState.askBusinessFlow) {
      return {
        text: buildBusinessFlowRequest({ request: businessFlowRequestText }),
        // Constant for a constant URL, so a re-render never overwrites a draft
        // the person has started editing.
        nonce: BUSINESS_FLOW_PREFILL_NONCE,
      };
    }
    if (!llmBridgeAvailable || !routeState.askIntent) return null;
    const intent = nodeIntent(selectedOntologyNode, routeState.askIntent);
    if (!intent) return null;
    return {
      text: sentenceForIntent(intent, firstWordsLabels),
      // The same URL gives the same value, so a render never overwrites the draft.
      nonce: hashAskRequest(routeState.askIntent, "ref" in intent ? intent.ref : ""),
    };
  }, [
    llmBridgeAvailable,
    routeState.askBusinessFlow,
    routeState.askIntent,
    selectedOntologyNode,
    firstWordsLabels,
    businessFlowRequestText,
  ]);

  /**
   * Closing also withdraws the request in the URL. Otherwise the derived state reopens
   * the panel after every close and it reads as "close does not work".
   */
  const closeVaultAgent = useCallback(() => {
    agentDockTouchedRef.current = true;
    cancelAcpSessionStart();
    /*
     * It **stays drawn** through the close, so the exit animation has somewhere to
     * run; `Surface` reports `onExited` when it is finished and it unmounts then.
     * (Set again here because some paths — a request arriving in the URL — never go
     * through this function.)
     */
    setChatMounted(true);
    // Since there is only one window, there is only one way to close it — this single action closes whichever branch was open.
    setAcpDockFrameOpen(false);
    setVaultAgentOpen(false);
    setAcpChatOpen(false);
    setVaultAgentPrefill(null);
    setRouteState({ askIntent: null }, { replace: true });
  }, [cancelAcpSessionStart, setRouteState]);

  /**
   * Which branch currently owns **the one panel**.
   *
   * An "ask this" arriving in the URL follows the same rule: with a coding agent
   * present, that sentence lands in its composer. Previously only this request opened
   * the key branch separately, so the panel a chip opened and the panel a node opened
   * were **different panels**.
   */
  const {
    runtime: runtimeChatOpen,
    key: keyChatOpen,
    /** Is a chat panel up right now, on either branch? The chip's pressed state reads
     * this. */
    open: agentChatOpen,
  } = agentChatDoor({
    hasRuntime: agentChatUsesRuntime,
    runtimeOpen: acpChatOpen,
    keyOpen: vaultAgentOpen,
    hasAskIntent: Boolean(askPrefill),
  });
  const agentDockOpen = agentChatOpen || acpDockFrameOpen;

  /**
   * Pressing the collapsed INDEX tab is an explicit choice to go back to the left
   * workbench. Expanding it while the agent is open would squeeze the map between two
   * panels again, so the same input retires the agent as INDEX arrives. Both surfaces
   * use the motion they already have.
   */
  const handleIndexTabExpandFromAgent = useCallback(() => {
    if (agentDockOpen) closeVaultAgent();
    handleIndexTabExpand();
  }, [agentDockOpen, closeVaultAgent, handleIndexTabExpand]);

  /**
   * The instruction to analyse this folder, built by something that **knows the vault
   * path**. Left as an i18n string it would carry no path, and the sentence alone
   * would not tell the agent which folder to look at.
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
   * Seats that instruction **in the chat composer**. A person still does the sending —
   * the same contract, and the same state, as "ask about this" on a node.
   */
  const sendAnalyzeToAgent = useCallback(() => {
    setVaultAgentPrefill({ text: analyzePrompt, nonce: Date.now() });
    openVaultAgent();
  }, [analyzePrompt, openVaultAgent]);

  /**
   * **Toasts step aside for whatever stands on the right** (owner's screen,
   * 2026-08-16).
   *
   * Toasts are pinned bottom-right, so with the chat panel standing to the right of
   * the map that 16px margin ends up **inside the panel** — the "created" toast landed
   * straight on the composer. The reservation contract already used at the bottom is
   * applied on the right too.
   *
   * The width is **measured, not a constant**: the user drags this panel to size.
   */
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty("--app-toast-right-offset");
      root.style.removeProperty(RIGHT_DOCK_WIDTH_VAR);
    };
    if (!agentDockOpen) {
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
      // The width itself is published, because the cards floating over the map derive
      // their right wall from it (`right-dock-reserve.ts`). The toast offset is that
      // plus its margin.
      root.style.setProperty(RIGHT_DOCK_WIDTH_VAR, `${Math.round(width)}px`);
      root.style.setProperty(
        "--app-toast-right-offset",
        `${resolveToastRightOffset(Math.round(width))}px`,
      );
    };
    apply();
    // The width changes on every drag and the panel attaches after opening, so a
    // single measurement goes stale.
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
  }, [agentDockOpen]);

  /*
   * "Open a chat with this tool" in the settings sheet's Agents section arrives here
   * (2026-08-16 review: the screen people went to in order to connect had no door
   * through to connecting). There is still one door — this only names the runtime and
   * the same function does the opening.
   */
  useEffect(() => {
    const accept = (runtimeId: string | null, prompt: string | null) => {
      const target = runtimeId ?? acpRuntime?.id ?? null;
      if (!target) return;
      setAcpRuntimeId(target);
      // Held rather than set now: the panel only exists once the dock opens below, and a request
      // handed to a panel that is not mounted is a request nobody receives.
      pendingAgentChatPromptRef.current = prompt;
      setPendingAgentChatRuntimeId(target);
    };
    const queued = consumeQueuedAgentChatIntent();
    if (queued) window.queueMicrotask(() => accept(queued.runtimeId, queued.prompt));
    return subscribeAgentChatIntent(accept);
  }, [acpRuntime?.id]);

  useEffect(() => {
    if (
      pendingAgentChatRuntimeId === null ||
      acpRuntime?.id !== pendingAgentChatRuntimeId ||
      !agentChatUsesRuntime
    ) {
      return;
    }
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      agentDockTouchedRef.current = true;
      openVaultAgent();
      const prompt = pendingAgentChatPromptRef.current;
      pendingAgentChatPromptRef.current = null;
      if (prompt) setAgentOpeningRequest({ text: prompt, nonce: Date.now() });
      setPendingAgentChatRuntimeId(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingAgentChatRuntimeId, acpRuntime?.id, agentChatUsesRuntime, openVaultAgent]);

  /*
   * Opening by itself goes through **the same door**. It lives here because
   * `openVaultAgent` above has to read runtime state — the moment this effect picks a
   * branch of its own, there are two chat panels.
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
         * Selected from the INDEX tree (owner remark, 2026-07-24): pressing a row in
         * the list collapsed the left panel to a slim tab, so the child they had just
         * expanded disappeared. The context "I am reading the list" is unambiguous, so
         * the left panel stays open in that case. A selection made on the map still
         * collapses it and widens the map.
         */
        keepIndexOpen?: boolean;
      },
    ) => {
      // Ontology node clicks and shareable vault slugs both stay on /topology;
      // selected-node resolution happens against `ontologyInsight`.
      interactionSelectedSlugRef.current = slug;
      setExpandAllActive(false);
      // Selections chosen in the INDEX tree do not collapse the list (owner
// critique 2026-07-24: clicking a row collapsed the panel into a slim tab, hiding the child just expanded).
// Selections chosen on the map collapse as before, widening the map.
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setNodePopoverDismissed(false);
      const project = projectBySlug.get(slug);
      // The path-mode vs. ordinary-selection branch belongs to
      // `resolveTopologyNodeClickRouteState`; its own comment in
      // `../model/url-state.ts` carries the background.
      setRouteState((current) =>
        resolveTopologyNodeClickRouteState(current, slug, {
          isHub: Boolean(project?.isHub),
          preserveImpact: options?.preserveImpact,
        }),
      );
      // `setRouteState` publishes through useSyncExternalStore synchronously.
      // Start the expanded session afterwards so the selection transition cannot
      // reset this interaction before the INDEX frame reads it.
      if (options?.keepIndexOpen) beginExpandedIndexSelection();
    },
    [
      projectBySlug,
      setRouteState,
      beginExpandedIndexSelection,
      setFullDetailSlug,
      setSelectedRelationActive,
      setNodePopoverDismissed,
    ],
  );

  const handleAcpMapIntent = useCallback(
    (intent: AcpMapIntent) => {
      if (intent.kind === "focus") {
        const nodeId = chatNodeIndex.get(intent.slug);
        if (!nodeId) return;
        setMeaningEditorState(null);
        setExpandAllActive(false);
        setSelectedEdge(null);
        handleSelect(nodeId);
        return;
      }

      const sourceId = chatNodeIndex.get(intent.from);
      const targetId = chatNodeIndex.get(intent.to);
      if (!sourceId || !targetId || sourceId === targetId) return;
      interactionSelectedSlugRef.current = null;
      setExpandAllActive(false);
      setMeaningEditorState(null);
      setSelectedEdge(null);
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) =>
        selectTopologyPathRouteState(current, {
          sourceSlug: sourceId,
          targetSlug: targetId,
        }),
      );
    },
    [
      chatNodeIndex,
      handleSelect,
      setExpandAllActive,
      setFullDetailSlug,
      setMeaningEditorState,
      setRouteState,
      setSelectedEdge,
      setSelectedRelationActive,
    ],
  );

  const handleChatSuggestionAction = useCallback((suggestion: ChatSuggestion): boolean => {
    if (suggestion.kind !== 'connectSource' || !unboundProjectSource) return false;
    // Connection is not something the agent guesses; it is handled by the folder picker gateway of the installed app.
// First open the project datasheet to let the user select the actual code folder.
    closeVaultAgent();
    handleSelect(unboundProjectSource.nodeId, { keepIndexOpen: true });
    return true;
  }, [closeVaultAgent, handleSelect, unboundProjectSource]);

  /**
   * **Replays a past trail as the walk in progress.** The order is the contract:
   *
   * ① Flush the current walk first, including the last step still waiting out the
   *    debounce, so replaying costs nothing.
   * ② Switch to a new walk id. If the route is unchanged, `upsertPastWalk` skips
   *    re-storing it, so the original row keeps its own date and a new row appears only
   *    once walking on from here makes the route different.
   * ③ Load the refined steps as the session trail. The map's footprint rings are
   *    derived from that trail, so they re-stamp themselves with no render code
   *    touched.
   * ④ Ego-focus the last step — "you are here" is the end of that trail.
   */
  const handleReplayPastWalk = useCallback(
    (walkId: string) => {
      const target = refinedPastWalks.find(({ walk }) => walk.id === walkId);
      if (!target || target.entries.length < PAST_WALK_MIN_ENTRIES) return;
      flushPastTrail();
      setSessionWalkId(newPastWalkId());
      const ids = target.entries.map((entry) => entry.id);
      setFootprintTrail(ids);
      // Mark the last step as visited explicitly, so the visit-detection effect that
      // `handleSelect` triggers below does not disturb the trail just loaded. (It is
      // the same node either way, but stating it beats relying on that.)
      const last = ids[ids.length - 1];
      lastVisitedNodeRef.current = last;
      handleSelect(last);
    },
    [refinedPastWalks, flushPastTrail, handleSelect, setSessionWalkId, setFootprintTrail],
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
      meaningEditorIntent: false,
      meaningEditParam: null,
      // Closing a focus returns to the map: a background click, Esc, or the popover's
      // ✕ all collapse the expansion. That completes the symmetry of click = select,
      // badge = expand, close = collapse.
      analysisMode:
        current.analysisMode === "focus" ? "overview" : current.analysisMode,
    }));
  }, [setRouteState, setFullDetailSlug, setSelectedRelationActive]);

  const handleDatasheetClose = useCallback(() => {
    const focusReturnNodeId = panelDatasheetModel?.nodeId ?? null;
    // On the 3D dome, ✕ folds the panel; it does not throw the selection away. Owner,
// 2026-08-18: *"Pressing ✕ just closes it and cancels the selection too, which makes it hard to look at."* (pressing ✕ just closes it and cancels the selection too, which makes it
// hard to look at). The selection and its ego highlight stay; only the panel folds,
// reusing the first step of the Esc dismissal order (`nodePopoverDismissed`) with no
// new state. Deselecting belongs to a background click or the second Esc, and
// reopening is another click on that node (on the dome a re-click reselects rather
// than deselects — `topology-pointer-handlers.ts`). 2D keeps the close = collapse
// symmetry from the 2026-07 ledger; the dome has no expansion or density gate, so
// that symmetry has no premise there.
    if (view3d) {
      setNodePopoverDismissed(true);
    } else {
      handleClose();
    }
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      restoreTopologyFocusAfterDatasheetClose(focusReturnNodeId);
    });
  }, [handleClose, panelDatasheetModel?.nodeId, view3d, setNodePopoverDismissed]);

  // The guided tour (`src/features/guided-tour`) is the map screen's own literacy
  // tour. `canResolveTourAnchor` lets this view resolve a testid (DOM) or canvas-node
  // (graph) anchor and hand the feature only a boolean, because the feature may not
  // import widgets (FSD import direction).
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
    // Measured regression: not clearing the selection on leaving the datasheet step
    // left node focus collapsing the utility lane (including the spotlight toggle), so
    // the recent-changes step's anchor became permanently unresolvable and the step
    // after it unreachable.
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
  }, [handleSelect, tourAnchorNodeId, setSelectedEdge]);
  // Opening the tour retires the other transient surfaces, following the same
  // "openX closes the rest" convention as the create-node composer.
  const openGuidedTour = useCallback(() => {
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    closeCreateNode();
    tour.start();
  }, [closeCreateNode, tour]);

  // The map's own re-entry is the compass tile top right, but the settings menu's
  // guide row has to be in the same place across all seven destinations so nobody hunts
  // for it per screen. The other five register through the shell's `DestinationGuide`;
  // the map registers this function.
  useRegisterGuideReplay(openGuidedTour);

  // First-visit auto tour (onboarding round, 2026-07-24). The tour existed but its
  // only entry point was a rail icon, so non-developers never found it. It starts once
  // when sample mode has settled (first run with no vault chosen, restore attempted)
  // and no done/skipped status is stored. Skipping records `skipped`, so it does not
  // return on a later visit, and for local-vault users `sampleModeSettled` is false so
  // it never fires at all.
  const autoTourFiredRef = useRef(false);
  // `openGuidedTour` depends on the tour object and is rebuilt every render, so as a
  // dependency it made this effect clear its timer every render and never reach the
  // timeout (measured regression). A ref mirror pins the deps to `tourAutoStartReady`
  // alone, and the guard is raised only when it actually fires.
  const openGuidedTourRef = useRef(openGuidedTour);
  useEffect(() => {
    openGuidedTourRef.current = openGuidedTour;
  }, [openGuidedTour]);
  useEffect(() => {
    if (autoTourFiredRef.current || !tourAutoStartReady) return undefined;
    if (!readGuideAutoStart()) return undefined;
    // For anyone who turned the guide off, nothing ever appears by itself. The compass
    // tile and settings › replay still open it, so the guidance is not gone — it only
    // comes when called.
    if (readGuidedTourStatus() !== null) return undefined;
    // The first attempt is 900 ms in, after layout and camera settle, so the first card
    // opens over a stable screen. Stacked-transient guard (Design Guardian,
    // 2026-07-24): if a modal is open at that moment (the folder guide sheet, say) or
    // document focus has left (a background tab load, the OS folder picker), it does not
    // fire on top of it.
    //
    // Retries used to be capped at 10 (~19 s), and that cap was itself the defect:
    // reading the first screen's folder guide sheet and going through the OS picker
    // easily passes 19 s, after which the tour **disappears forever** with nothing
    // recorded in storage. Measured 2026-07-26: leaving the modal up for 27 s meant the
    // tour never appeared.
    //
    // So the cap is gone. It looks like infinite retry, but the behaviour is "**fire at
    // the first moment the way is clear**", which is exactly what is wanted — it does not
    // ambush the user later, it appears as soon as nothing is covering it. A tick is
    // three `querySelector` calls, it stops on fire and on unmount, and it only ever runs
    // for someone who has never seen the tour.
    //
    // But "the first moment the way is clear" can arrive after the user has started
    // exploring on their own. Measured 2026-07-26: after dismissing the sheet with
    // "later", users who clicked a node 2–6 s afterwards got card 1/7 cutting across the
    // detail panel they had just opened. So the first real interaction while waiting
    // **cancels** the fire. (Adding exceptions to the guard instead was already shown to
    // backfire — the guidance covering the very thing it introduces.) Cancelling blocks
    // nothing: settings › guide › replay and the compass tile open the same tour.
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

  // The Esc dismissal order — which surface a single Escape closes, one step at a
  // time (the shortcut sheet's `stepCloseOverlays` promise; `docs/FEATURES.md`). This
  // is an ordering of surfaces, not a ramp of values. The composer, shortcuts, and
  // docs-drawer overlays already close
  // themselves on Escape; this effect covers what previously had no Escape
  // binding at all — the full-detail drawer, the relation lens, the selected
  // node itself, and the local-graph ego-drill breadcrumb (which used to pop
  // unconditionally on every Escape, racing with whatever else was open).
  //
  // `searchOpen: ontologySearchOpen` is passed so the resolver returns "none"
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
  const handleTopologyEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (event.defaultPrevented) return;
    /*
     * ⚠️ **An Escape pressed inside the chat panel is not the map's** (2026-08-16
     * review).
     *
     * This listener is on `window` and did not look at `event.target`, so pressing
     * Escape while typing in the chat composer — which a hand does routinely to
     * cancel a Korean IME composition — **cleared the selection on the map behind
     * it**. Changing something the user is not even looking at is not the
     * one-step-at-a-time this order promises.
     *
     * The chat panel closes its own things (the past-conversation list). When it has
     * nothing left to close, nothing happening is the right outcome — better than
     * reaching into the map.
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
    // Leaving a realm comes first in the order: inside a realm, Escape returns to the
    // whole map before anything else, ahead even of the edge popover.
    if (action === "close-realm") {
      handleExitRealm();
      return;
    }
    switch (action) {
      case "close-edge-popover":
        // With the edge popover open, the first Escape closes that — the highest
        // consumer after leaving a realm, the same contract as the node popover. The
        // popover returns focus to its trigger itself (`TopologyV2EdgePanel`).
        setSelectedEdge(null);
        break;
      case "close-context-menu":
        closeContextMenu();
        break;
      case "close-tour":
        // Escape closes only the tour (recording `skipped`) and does not fall
        // through to another surface: one keypress, one surface.
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
        // Hide the popover but keep the ego focus (the dim). The NEXT Escape sees
        // `nodePopoverOpen: false` and falls through to "deselect".
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
  });

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      handleTopologyEscape(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelectImpactMode = useCallback(
    (nextMode: ProjectImpactMode) => {
      setRouteState((current) => ({
        ...current,
        impactMode: nextMode,
      }));
    },
    [setRouteState],
  );

  // Global shortcuts go dead while a blocking surface is open. This used to be a
  // hand-written `if (createNodeOpen) return;` per surface, which **left the tour
  // out** — the `?` shortcut modal stacking on top of the tour was actually
  // reproducible. One predicate (`blocking-surface`) now decides, so a new surface is
  // one edit in one place.
  const shortcutsSuppressed = shouldSuppressGlobalShortcuts({
    createNodeOpen,
    tourOpen: tour.open,
    // `blocked` is this app's word for "the agent stopped and the permission card is waiting".
    agentAwaitingDecision: acpTurnActivityFrame?.activity.state === "blocked",
  });

  // ⌘K and ⇧⌘K open the same palette (ontology nodes + projects). ⌘K used to open a
  // project-only palette in which an ontology node could never be found.
  // `useTypingShortcuts` returns after the first match, so the shift combination is
  // listed first by convention (both call the same setter, so order is immaterial).
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
      // ⌘O switches from the static sample to the user's own markdown folder. The
      // first-run card's ⌘O hint and the top "switch to my data" pill both point at
      // this handler, so the shortcut survives dismissing the card. With a real vault
      // connected the gate is off and it does nothing.
      combo: { key: "o", meta: true },
      onFire: () => {
        if (shortcutsSuppressed) return;
        if (!sampleModeSettled) return;
        requestVaultOpen();
      },
    },
  ]);

  const drawerOpen = drawerProject !== null || selectedOntologyNode !== null;
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
  // Calculates not just the hop count but also the exact order of nodes/authored edges to draw on the map.
// Passes the canvas node list as a boundary to prevent invisible paths passing through reader/document nodes from being the answer.
  const pathResult = useMemo(() => {
    if (!pathSourceSlug || !pathTargetSlug || !ontologyInsight) return null;
    return computeTopologyShortestPath(
      pathSourceSlug,
      pathTargetSlug,
      topologyV2Graph.nodes,
      ontologyInsight.edges,
    );
  }, [pathSourceSlug, pathTargetSlug, ontologyInsight, topologyV2Graph.nodes]);
  const pathHopCount = pathResult?.hops ?? null;
  const pathLensNodeIds = useMemo(
    () => (pathResult ? new Set(pathResult.nodeIds) : null),
    [pathResult],
  );
  const pathLensEdgeIds = useMemo(
    () => (pathResult ? new Set(pathResult.edgeIds) : null),
    [pathResult],
  );
  const allMapNodeIds = useMemo(
    () => new Set(topologyV2Graph.nodes.map((node) => node.id)),
    [topologyV2Graph.nodes],
  );
  const allExpandedParentIds = useMemo(
    () =>
      new Set(
        topologyV2Graph.edges
          .filter((edge) => edge.kind === "contains")
          .map((edge) => edge.source),
      ),
    [topologyV2Graph.edges],
  );
  const mapLensIds =
    analysisMode === "path"
      ? pathLensNodeIds
      : expandAllActive
        ? allMapNodeIds
        : spotlightIds;
  const mapLensKind =
    analysisMode === "path" ? "path" as const : expandAllActive ? "all" as const : "recent" as const;
  const pathExpandedParents = useMemo(() => {
    if (!pathLensNodeIds || topologyV2Graph.edges.length === 0) return null;
    const parentOf = buildContainmentParentMap(topologyV2Graph.edges);
    const merged = new Set(expandedParentSet);
    for (const id of pathLensNodeIds) {
      for (const ancestor of deriveDeeplinkAncestorExpansion(id, parentOf, [])) {
        merged.add(ancestor);
      }
    }
    return merged;
  }, [pathLensNodeIds, topologyV2Graph.edges, expandedParentSet]);
  // Top-center status line of the path chip — "Path: X → Target selected" / "X → Y · N hops" /
// No path / **Endpoint not in this vault**. Compresses what the old path panel did in the left slot into a single top chip (analysis panel complete elimination phase 2 §b). Determination is extracted as a pure function — evidence and old lies are in `../lib/topology-path-chip-state.ts`.
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
    // With an endpoint missing from this vault there is no fact to hand over. Handing
    // an agent two nonexistent slugs and the conclusion "no path" was this button's
    // old defect.
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
  // The chip's ✕ clears the path state completely and returns to the map. Path mode
  // used to occupy the left slot, so leaving it meant pressing the map tab again.
  const handleClearPath = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      analysisMode: "overview",
      pathSourceSlug: null,
      pathTargetSlug: null,
    }));
  }, [setRouteState]);
  const handleToggleExpandAll = useCallback(() => {
    if (expandAllActive) {
      setExpandAllActive(false);
      setRouteState((current) => ({ ...current, expandedParents: [] }));
      setFitViewToken((current) => current + 1);
      return;
    }
    setMeaningEditorState(null);
    setSelectedEdge(null);
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    setExpandAllActive(true);
    setRouteState((current) => ({
      ...current,
      analysisMode: "overview",
      selectedSlug: null,
      focusedHubSlug: null,
      pathSourceSlug: null,
      pathTargetSlug: null,
      realmSlug: null,
      expandedParents: [],
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [
    expandAllActive,
    setExpandAllActive,
    setFullDetailSlug,
    setMeaningEditorState,
    setRouteState,
    setSelectedEdge,
    setSelectedRelationActive,
  ]);
  // P0c — Official census: since kind:project is already included in insight.nodes,
// adding renderProjects causes double counting (cause of the mismatch between map 294 and insight 293). The "Concept/Relation" census has a single source for all insight derivations
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
  // Starter scaffold for an empty folder: the checklist button runs the same
  // `scaffoldOntology()` as "start fresh in an empty folder". It is an explicit click
  // rather than an automatic run, which is what keeps the local-first promise never to
  // write into someone's folder unasked.
  const [starterScaffolding, setStarterScaffolding] = useState(false);
  const handleScaffoldStarter = useCallback(async () => {
    setStarterScaffolding(true);
    try {
      // A vault created in the screen's language reads in that language.
      const result = await vault.scaffoldOntology(activeLocale);
      toast.show(
        // Concepts and config files are counted separately: summed it says 8, but there
        // are 5 actual ontology concepts, which contradicted the settings panel's
        // "5 documents".
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

  // Single source for domain size (a graph BFS), so INDEX tree rows, `/projects`, and
  // insights all state the same number.
  const indexDomainCensus = useMemo(
    () =>
      ontologyInsight
        ? domainCensusById(computeDomainCensusRows(ontologyInsight.nodes, ontologyInsight.edges, ["domain"]))
        : null,
    [ontologyInsight],
  );
  // Single source for the meter denominator: the largest domain-census BFS total. It
  // is the same source the INDEX panel computes internally, so the realm ledger's
  // capacity meters cannot disagree with the global tree.
  const indexMaxDomainDescendantCount = useMemo(() => {
    if (!indexDomainCensus || indexDomainCensus.size === 0) return 0;
    let max = 0;
    for (const row of indexDomainCensus.values()) if (row.total > max) max = row.total;
    return max;
  }, [indexDomainCensus]);
  // Derivations for the realm ledger: what the left panel shows when a realm is
  // active and it presents only this node's world instead of the global content. All
  // of it comes from the graph and tree through a pure lib
  // (`../lib/realm-ledger.ts`), so nothing here touches `topology-map-v2`.
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
    // Boundary rows get a plain relation-type label here, because the widget knows no
    // i18n, and only the first few are shown — the heading states the total.
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
  // The caption under the realm boundary. It uses **the same census object and the
  // same unit keys** (`index.elementsShort` / `capabilitiesShort`) as the ledger
  // panel, so one fact cannot appear as two numbers on one screen.
  const realmCaption = useMemo(() => {
    if (!realmLedgerModel) return null;
    const { census, rootTitle } = realmLedgerModel;
    const parts: string[] = [];
    if (census.elementCount > 0) parts.push(`${t("index.elementsShort")} ${census.elementCount}`);
    if (census.capabilityCount > 0) parts.push(`${t("index.capabilitiesShort")} ${census.capabilityCount}`);
    return parts.length > 0 ? `${rootTitle} · ${parts.join(" · ")}` : rootTitle;
  }, [realmLedgerModel, t]);
  /**
   * Wording for the bar above a cluster; the canvas never composes strings itself.
   *
   * The `{count}` placeholder is passed through **verbatim**: the real number is known
   * to the renderer per frame (a function of the "open at once" setting and how many
   * remain) and not here. next-intl's interpolation cannot be used, so a contract test
   * enforces the placeholder convention instead.
   */
  const clusterBarLabels = useMemo(
    () => ({
      expandAll: t("cluster.barExpandAll"),
      expandCount: t("cluster.barExpandCount", { count: "{count}" }),
      collapse: t("cluster.barCollapse"),
    }),
    [t],
  );
  // The project count in the bottom-right readout (`FirstRunReadout`). Real data,
  // derived from the same `ontologyInsight` as `indexDomainCount`, so it cannot drift.
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
   * Splitting the boot long task (measured 2026-08-19). This page's first client
   * commit bundled the page chrome, the map widget's mount, and the map's mount effect
   * (forced layout included) into **one task**, holding 324–335 ms under 4× CPU
   * throttling — the single largest long task on a `/ko/topology/` load, and a stall
   * visible on real hardware. The canvas draws nothing before its own first rAF frame
   * anyway, so deferring the mount by **one rAF** splits that task into "page commit"
   * and "map mount" while what appears on screen is unchanged (either way the first
   * paint is an empty canvas). The reveal still starts on the map's first rAF frame,
   * as its contract says.
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
  // Since the controls panel was removed, the only remaining filter source is
  // `activeCategory` in the URL route state (`?category=`).
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
  // Explicit "expand" for card badge/double-click — performs selection and focus entry in one go.
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
    [projectBySlug, setRouteState, setFullDetailSlug, setSelectedRelationActive],
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

    // The top five hubs are preloaded in the background so their screenshots are
    // already there if the user clicks a hub straight after arriving. Run in an idle
    // callback so it cannot disturb the current interaction.
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
      // When the agent panel takes space, the fixed surface pinned to the right (the
      // selected-node inspector) stands that much further in. If the evidence (the
      // node) and the counterpart (the agent) cover each other, "looking at the map
      // together" does not hold. The rule itself is in `app/globals.css`.
      data-agent-panel-open={agentDockOpen ? 'true' : 'false'}
      /*
       * ⚠️ **That rule was reserving the wrong width** (2026-08-16 review).
       *
       * The reservation in `globals.css` reads `var(--agent-panel-width)`, which is the
       * `clamp(320px, 26vw, 420px)` the key-branch panel uses. But the coding-agent
       * branch is sized **by the user's drag** (320–968px) and writes nothing to that
       * token. Both set `data-agent-panel-open='true'`, so the rule reserved the wrong
       * number: at 1512 wide, 26vw is 393 while the panel is 420, leaving the inspector
       * overlapping by 27px **on top of the resize handle** — and widened further, the
       * inspector ended up entirely inside the panel.
       *
       * Rather than change the rule, **the value it reads is filled with the right
       * number**. The two branches never open at once, so this override cannot affect
       * the key branch.
       */
      style={
        acpDockFrameOpen || runtimeChatOpen
          ? ({ '--agent-panel-width': `${chatWidth.width}px` } as CSSProperties)
          : undefined
      }
      className="relative flex h-full w-full overflow-hidden bg-[color:var(--color-canvas)]"
    >
      {/* The left nav rail lives in `app/[locale]/layout.tsx` (AppShell); this page no
          longer mounts it. Its settings gear is registered through context by
          `useNavRailSettingsSlot(navRailSettingsSlot)` above. */}
      <div className="relative h-full flex-1 overflow-hidden">
      {/*
        Screen-reader landmark and SEO h1. The visual design is canvas-first with
        nowhere to put a visible h1, so it exists in the document structure only.
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
          // `reverseDeps` is the memo above, so this is an O(1) lookup instead of
          // re-filtering every project on every render.
          const referenced = reverseDeps.get(selectedProject.slug)?.length ?? 0;
          return t('selectionAnnouncement', {
            name: selectedProject.name,
            deps,
            referenced,
          });
        })()}
      />
      <>
            {/* Mobile-only mini brand label. */}
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
                  // The utility action lane on the right (absolute `right-4`, content
                  // about 236px wide) and this brand label are separate absolute
                  // overlays, so `flex-wrap` cannot push them apart. The narrower the
                  // viewport (below 390px) the further left the lane starts, so the gap
                  // is held by a vw-based calc rather than a fixed px value, keeping
                  // overlap at zero.
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
            {/* The top-left brand/workspace pill is retired for good (owner
                instruction, 2026-07-24). A leftover `drawerOpen` condition had been
                reviving it on every node click. Selection is carried by the popover and
                the ring, reopening INDEX by the vertical tab, and project navigation by
                the rail — duplicate ink, so the mount itself is gone. */}
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
                    rightInspectorReserved={nodePanelMounted}
                    leftIndexReserved={renderedIndexState === "expanded"}
                    // <md expanded INDEX is a full-bleed sheet — while the sheet is the main surface,
// the top chrome column is demoted (overlap eradication 2026-07-23, completion of rank7 sheet
// syntax). Same contract as utility lane's hidden md:flex.
                    phoneSheetSuppressed={renderedIndexState === "expanded"}
                    onOpenSearch={() => {
                      setOntologySearchOpen(true);
                    }}
                    onRelayout={() => {
                      setTopologyRelayoutToken((current) => current + 1);
                      toast.show(t('controls.relayoutToast'), "info");
                    }}
                    onToggleExpandAll={handleToggleExpandAll}
                    allExpanded={expandAllActive}
                    realmChip={
                      resolvedRealmSlug && realmTitle ? (
                        // On screen the feature is called "view only this" (owner
                        // decision, 2026-07-23); "realm" stays as the internal name. The
                        // `chipViewing` template is split on a sentinel so the text
                        // before and after the title works in any locale.
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
                       * The trail chip appears **from one visit**. Owner, 2026-08-03:
                       * *"Issue where the trail does not appear at the top when only one node is viewed."* (when
                       * you have only looked at one node, the trail does not appear).
                       *
                       * The threshold used to be 2, on the reasoning that a trail needs
                       * at least two points. But what this chip actually provides is not
                       * only a drawn trail: it is the **agent handoff packet** and the
                       * **door back**. Both have value at one visit — and the moment
                       * right after opening a first node is exactly when "I want to hand
                       * this to the AI" is strongest. A threshold of 2 meant the door
                       * was missing precisely then.
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
                      // Overlap sweep, 2026-07-23. ① Below `md`, while the expanded
                      // INDEX is a full-bleed sheet, the whole lane retreats — 8px of
                      // chip used to poke above the sheet's 24px top inset. ② Per-chip
                      // labels shrink through the `max-xl` / `max-2xl`
                      // `[data-chip-label]` steps below: 499px of combined label was
                      // what overlapped the centre search lane and the expanded INDEX
                      // between 768 and 1365.
                      className={`topology-ui-scale absolute right-4 top-4 flex-col items-end gap-2 md:right-6 md:top-6 xl:right-8 xl:top-8 ${
                        activityInboxOpen ? "z-30" : "z-20"
                      } ${renderedIndexState === "expanded" ? "hidden md:flex" : "flex"}`}
                      data-phone-sheet-utility-contract={
                        renderedIndexState === "expanded"
                          ? "hidden-below-md-while-index-sheet-owns-surface"
                          : undefined
                      }
                      data-testid="topology-utility-action-lane"
                      data-agent-dock-adjacent-rail="true"
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
                      <div
                        className="relative flex items-center gap-[var(--topology-utility-lane-gap)]"
                        data-testid="topology-utility-action-row"
                      >
                    {/* 「Agent」 — This button's spot is the moment you go from viewing a map to saying "fix this."
                        It uses the same chip spec as the existing utility lane without creating a rail destination or new route (zero surface addition).
                        The name is defined in **only one place**: `vaultAgentPanel.title` —
                        since the chip, tooltip, aria, and panel header all read the same key, changing the name
                        changes all four places together (the name may be reviewed again).
                        Desktop only: on the web there is no safe place to put the key nor a path to send it,
                        so we do not draw a door that will not open. */}
                    {llmBridgeAvailable ? (
                      <Tooltip content={tAgent('title')} side="bottom" withProvider={false}>
                        <ChromeChip
                          onClick={() =>
                            (agentDockTouchedRef.current = true,
                            agentDockOpen ? closeVaultAgent() : openVaultAgent())
                          }
                          aria-label={tAgent('title')}
                          aria-pressed={agentDockOpen}
                          data-testid="topology-vault-agent-toggle"
                          active={agentDockOpen}
                          compact={topologyUtilityChromeCompact}
                          icon={<MessageCircle />}
                        >
                          {tAgent('title')}
                        </ChromeChip>
                      </Tooltip>
                    ) : null}
                    {/* The permanent "switch to my data" entry point that survives
                        dismissing the first-run card. Visible only in static sample mode
                        (independent of the card) and gone once a real vault is
                        connected. Standard chrome-tile spec, a quiet support surface. */}
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
                          // Lane shrink steps: below `2xl` the kbd cap folds away
                          // (mirroring the search chip's existing ⌘K rule), below `xl`
                          // the label folds too and it becomes icon-only. This chip's
                          // 225px of label + kbd was the main cause of overlap with the
                          // centre search lane and the expanded INDEX between 768 and
                          // 1365 (measured: 35px intrusion at 1280). The aria-label and
                          // tooltip preserve the meaning, and the first-run card's CTA
                          // exposes the same action with a permanent label.
                          className="max-2xl:[&_[data-chip-kbd]]:hidden max-xl:[&_[data-chip-label]]:hidden"
                        >
                          {t('controls.switchToMyDataLabel')}
                        </ChromeChip>
                      </Tooltip>
                    ) : null}
                    {/* The recent-changes spotlight lens toggle. Its state lives in the
                        URL as `?recent=`, which is what makes a shared link and an
                        agent's reproduction show the same thing. */}
                    <Tooltip
                      /*
                       * Why three branches. Owner, 2026-08-03: *"Why does nothing happen when I press 'recent changes'?"*
                       * (pressing "recent changes" does
                       * nothing).
                       *
                       * The empty-state text used to be one line — "edit a document and
                       * we will point it out here" — which, to someone looking at the
                       * sample, presumes **there is a document of theirs to edit**. The
                       * real reason is different: the sample's dates are whenever this
                       * repo last touched those fixtures, which has nothing to do with
                       * the user, so this feature **cannot mean anything before a folder
                       * is opened**. A different reason needs a different sentence.
                       *
                       * No popup. Opening a modal to say "there is nothing" makes the
                       * person who pressed do the work twice, and it is the category this
                       * repo forbids as popup soup (the 2026-08-02 decision in the chip
                       * comment below still stands). Instead, **disabled now looks
                       * disabled** — its not doing so was why people only found out by
                       * pressing (`chrome-chip.tsx`, `DISABLED_CLASS`).
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
                         * With nothing changed it **cannot be pressed**. Owner,
                         * 2026-08-02: *"If there are no changes, shouldn't we just disable the button click?
                         * Or have pressing it pop up 'nothing changed'?"*
                         * (when there are no changes, just disable the button — or have
                         * pressing it pop up "nothing changed").
                         *
                         * The popup option was not taken: opening a modal to state an
                         * absence makes the person who pressed do the work twice, and it
                         * is the category this repo forbids as popup soup.
                         *
                         * **Nor is it hidden.** Disappearing turns it into "was there a
                         * recent-changes feature?", a problem already hit in this very
                         * session (an unlabelled icon nobody could find). The place stays
                         * and the tooltip gives the reason — the same discipline as
                         * `BlockImportModule`'s "keep it disabled with a hint, never
                         * conceal it".
                         *
                         * While it is on it must remain **switchable off**, so it is
                         * disabled only when off with zero highlights.
                         *
                         * On the sample it is **not disabled** — pressing it opens the
                         * folder guidance. Disabled is only for "my folder is open and
                         * there are no recent changes", where there really is nothing to
                         * show.
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
                         * The name is **always** shown. Owner, 2026-08-02: *"Where is the 'recent
                         * changes' button? There isn't one."* (where is the "recent
                         * changes" button? there isn't one).
                         *
                         * The previous `max-2xl` **hid the label below 1536px**, while
                         * its neighbours hide theirs below 1280px — so in a 1512px window
                         * **this one button alone** lost its name and became an
                         * unlabelled clock icon. Of course it could not be found.
                         *
                         * This chip has since absorbed what the old "N changes" button
                         * did, making it the **only place in the top chrome that speaks
                         * about change**. That place has no business standing unnamed.
                         *
                         * The window and count are carried as a badge inside the chip
                         * rather than the unlabelled mono text that used to float in the
                         * lane (same grammar and tokens as the docs chip's pinned-count
                         * badge). The INDEX segment already shows the same "last N days ·
                         * count", so a duplicate string went away too, and the badge
                         * survives every compact/shrink step, so the count is visible
                         * even below `xl`. The window itself is preserved in the
                         * aria-label and title.
                         */
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
                      ⚠️ Two chips were removed from this lane (2026-08-03), under one
                      adopted rule: **a chip over the map earns its place only if it
                      changes the map.**

                      ① The workspace chip (PO council verdict; owner: *"Isn't this just the docs
                      entry in the rail?"* — isn't this just the docs
                      entry in the rail?). It opened a drawer and never changed the map;
                      that is the rail's job. It also used **two different names inside
                      one control** — its label said one thing and its tooltip another —
                      while the rail already had a docs entry, so the same word appeared
                      twice on one screen. **The drawer still exists**: the `D` shortcut
                      (listed in the shortcut sheet) and the INDEX footer path both open
                      it. A chip was removed, not a surface. This was a rediscovery — the
                      old "N changes" button had been removed on 2026-08-02 for **the
                      same reason** (a round trip that changes no map state) — so the rule
                      itself was recorded in the ledger this time.

                      **The drawer still exists** — the `D` shortcut (listed in the shortcut sheet)
                      still opens it. We removed only a chip, not a surface.

                      This is a rediscovery: on 2026-08-02, "N changes" was already deleted for **the same reason**
                      (it does a round trip without changing map state). Without a rule,
                      we were discovering them one by one manually — so this time
                      we recorded the rule in the ledger.
                    */}
                    {/* The history entry point below `lg`. At `lg+` the rail destination
                        owns it; where the rail disappears this chrome tile leads to the
                        same destination, so a different breakpoint still reaches **the
                        same surface**.

                        2026-07-25: this tile used to open a 560px modal. When history was
                        promoted to a destination it became a link — if mobile alone saw a
                        modal, one feature would live on two surfaces. The `audiencePlain`
                        gate was removed with it: a destination is exposed to every
                        audience ("who changed what meaning, when" is information planners
                        and executives read, not developer work), and an entry-point count
                        that varies by audience is exactly the problem that consolidation
                        was meant to end. */}
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
                    {/* Settings entry point below `lg`. The nav rail is `lg+` only, so
                        below it there was no way to reach settings at all. The same
                        single settings sheet the rail slot opens is placed at the end of
                        the lane as a chrome-tile variant; the bottom tab bar's
                        five-destination contract is untouched. At `lg+` the rail's gear
                        owns it. */}
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
                    {/* Work status is anchored below this row, and only the notification bell stands as the
                        last square tile of this row. The same component owns both feeds and
                        outside click/Escape to avoid duplicating polling/read state. */}
                    <AgentActivityChip
                      suppressed={Boolean(v2DatasheetModel)}
                      liveWork={acpLiveWork}
                      onOpenChange={setActivityInboxOpen}
                      onOpenNode={handleSelect}
                    />
                      </div>
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
                  // Uses the dialog-width ramp: it references the canonical
                  // `--dialog-w-md` (560px) directly instead of the shared composer width,
                  // so this create dialog sits on the ramp. Narrow viewports are handled by
                  // the surrounding `calc`.
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
                      reviewHeading: t('createNode.reviewHeading'),
                      reviewBack: t('createNode.reviewBack'),
                      reviewConfirm: t('createNode.reviewConfirm'),
                      reviewConfirming: t('createNode.reviewConfirming'),
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
                    // Per-locale names: the current screen language is the required
                    // field and the other is optional (owner instruction, 2026-07-24).
                    localeNames={{
                      primaryLocale: activeLocale,
                      secondaryLocale: activeLocale === 'ko' ? 'en' : 'ko',
                    }}
                    review={
                      createNodeProposal
                        ? {
                            changeSet: createNodeProposal.changeSet,
                            confirming: createNodeConfirming,
                            onBack: () => setCreateNodeProposal(null),
                            onConfirm: confirmCreateNode,
                          }
                        : null
                    }
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
            {/* INDEX — the left instrument replacing the old `/ontology` tree page.
                Persists alongside the selected-node datasheet (unlike the analysis rail
                below, which the node-focus popover suppresses); the approved spec shows
                both coexisting over the map. */}
            {!selectedRelationActive && !topologyCreateNodeBlockingActive
              ? indexSlotFrames.map((frame) => (
              <div
                // Collapse ↔ expand is **two surfaces taking turns in the same slot**.
                // With no transition, 300px of panel and ten rows flipped between
                // existing and not in one frame (luminance Δ13.6 over 17 ms) while the
                // camera from the same click took 200 ms — one action with three
                // different durations. Making the swap explicit through `key` lets the
                // arriving surface use the shared grammar for large surfaces over the map
                // (`.map-overlay-in`, 180 ms opacity), so popovers, panels, and full
                // detail all run on one clock.
                key={`${frame.state}-${frame.exiting ? "out" : "in"}`}
                // `topology-ui-scale`: the top-left chrome group carries the same class
                // and is zoomed at ≥1920px / ≥2400px. Without it this wrapper would stay
                // at fixed px while the group grows proportionally under that zoom, and
                // the two would overlap again — see the `--topology-index-top` comment.
                className={`${frame.exiting ? "map-overlay-out pointer-events-none" : "map-overlay-in"} topology-ui-scale absolute z-20`}
                aria-hidden={frame.exiting || undefined}
                inert={frame.exiting || undefined}
                style={{
                  left: frame.state === "expanded" ? "var(--topology-index-inset)" : 0,
                  // Owner report, 2026-07-23: after the permanent map header retired, 84px
                  // of empty band was left above the expanded stack. Expanded now rises to
                  // the chrome inset (24px). In the states where the brand pill appears
                  // (selection, drawer) the automatic demotion turns the stack into a
                  // collapsed tab, so overlap with the pill is structurally impossible.
                  // The collapsed tab keeps 84px to stay aligned under the pill.
                  top:
                    frame.state === "expanded"
                      ? "var(--topology-index-inset)"
                      : "var(--topology-index-top)",
                  // The bottom inset has its own token: equal to the chrome inset on
                  // desktop, and below `md` in sheet mode it rises above the
                  // `BottomTabBar` reserve.
                  bottom:
                    frame.state === "expanded"
                      ? "var(--topology-index-bottom-inset)"
                      : undefined,
                }}
              >
                {frame.state === "expanded" && indexTreeResult ? (
                  // While a realm is active the left panel is replaced by the realm
                  // ledger, which shows only this node's world instead of the global
                  // content. Both occupy the same box, so the keyed wrapper's short
                  // fade-in (under 200 ms, instant under reduced-motion) reads as a
                  // crossfade. Only the global ↔ realm switch changes the key and
                  // remounts; a realm-to-realm jump updates in place.
                  <div
                    key={realmActive ? "realm" : "index"}
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
                      // "Go to this realm" on a boundary row swaps the realm to the
                      // outside node's domain-level ancestor (a realm-to-realm jump). It
                      // reuses the enter handler, so there is no new URL logic.
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
                    // Plain mode passes a derived tree with only the element rows
                    // removed — a display gate, no data change. The realm ledger, the
                    // census, and the counts still use the original `indexTreeResult`.
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
                    // Gates the quiet hint row explaining why element rows are not
                    // visible. `treeResult` above has already removed them; the single
                    // source is unchanged.
                    plainMode={audiencePlain}
                    vaultLoaded={canCreateNode}
                    domainCensus={indexDomainCensus}
                    // The id set the lens filters on, plus the badge target.
                    recentChanges={{
                      ids: recentChanges.recentNodeIds,
                      agentAttributedNodeId: agentAttributedRecentNodeId,
                    }}
                    // One source for the spotlight: the URL's `?recent=` drives both the
                    // map's sinking and this lens. Clicking the lens tab toggles the
                    // spotlight; a preset chip switches the window immediately.
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
                    // "N documents not on the map · add them". `bootstrapPlan` is always
                    // computed once a vault is loaded, empty map or not, so its count is
                    // exposed with no new derivation. Clicking opens the existing
                    // "build a map from my documents" dialog — previously reachable only
                    // from the empty state, whereas this row opens it on a populated map
                    // too.
                    uncatalogedDocCount={bootstrapPlan?.elements.length ?? 0}
                    // Dusty (long-untouched) node count; the row hides at 0.
                    dustyNodeCount={dustySlugs.size}
                    unboundProjectNodeId={unboundProjectSource?.nodeId ?? null}
                    noProjectsYet={projectSourceReadiness.state === "no-projects"}
                    // The door hands work to an agent; without one it would create a folder and
                    // then silently do nothing, having promised a map.
                    agentAvailable={acpRuntimes.length > 0}
                    openedInsidePickedFolder={vault.openedInsidePickedFolder ?? null}
                    onDismissOpenedInside={vault.dismissOpenedInsideNotice}
                    onPromoteUncatalogedDocs={
                      bootstrapPlan && bootstrapPlan.elements.length > 0
                        ? () => setBootstrapOpen(true)
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
                      capabilitiesShort: t("index.capabilitiesShort"),
                      elementsShort: t("index.elementsShort"),
                      subcountsTitle: kindCountsTitle,
                      freshTitle: t("index.freshTitle"),
                      domainCountTitle: t("index.domainCountTitle"),
                      subtotalTitle: t("index.subtotalTitle"),
                      emptyHint: t("index.emptyHint"),
                      segmentAll: t("index.segmentAll"),
                      // Exposes the adaptive window's actual span (7d → 3d → 1d) in the
                      // label.
                      segmentRecent: t("index.segmentRecent", {
                        count: recentChanges.recentNodeIds.size,
                        days: recentChanges.windowDays,
                      }),
                      segmentRecentAria: t("index.segmentRecentAria"),
                      recentEmptyHint: t("index.recentEmptyHint", { days: recentChanges.windowDays }),
                      // Spotlight window preset chips.
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
                      openedInsideLabel: t("index.openedInsideLabel"),
                      openedInsideDismiss: t("index.openedInsideDismiss"),
                      // Rendered only in plain mode; the panel gates it.
                      plainHint: t("index.plainHint"),
                    }}
                  />
                  )}
                  </div>
                ) : (
                  <TopologyIndexTab
                    onExpand={handleIndexTabExpandFromAgent}
                    labels={{
                      expandAria: t("index.expandAria"),
                      agentSyncTitle: t("index.agentSync"),
                    }}
                  />
                )}
              </div>
                ))
              : null}
            {/* Complete deletion of TopologyAnalysisBar (Phase 2 of complete disappearance of analysis panel §d) —
                after focus(§a)/path(§b)/health(§c) were all removed, the remaining map/graph
                2-tab lane was migrated to the graph toggle chip in the top-right utility lane. The previous analysis-rail content
                in overview mode has already been retired as a relationship line sample in the shortcut help (W3). */}
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
                {/* Empty-state overlay when the visible graph has 0–1 nodes: a lone dot
                    otherwise reads as a broken canvas. An empty vault never mounts the
                    engine at all and shows only the empty state, which prevents the
                    regression where a map shape flashed first. */}
                {topologyOverlayState.kind === "structural-empty" && !createNodeOpen ? (
                  /*
                   * Onboarding round, 2026-07-24: someone who opened a writable local
                   * vault gets a progressive start checklist instead of a dead-end
                   * sentence.
                   *
                   * ⚠️ **The gate was widened 2026-08-03** (five PO seats plus four
                   * design seats). The condition used to include
                   * `&& (bootstrapPlan?.elements.length ?? 0) === 0`, so **only a truly
                   * empty folder** ever saw the checklist. That one clause shut the door
                   * to connecting an agent and copying the instruction for it for anyone
                   * whose folder had even one document — that is, **anyone who opened a
                   * development repository**, exactly the person this flow exists for.
                   * `TopologyEmptyState`'s docs-found branch offers only "build a map from
                   * my documents" and says nothing about agents at all.
                   *
                   * So the decision narrowed to one question, "is this a writable vault",
                   * and when documents exist **the checklist's first step becomes
                   * bootstrap** (`docsFoundCount` below). Nothing new was built; an
                   * existing screen simply became reachable, with no popup added.
                   */
                  /*
                   * ⚠️ Not while a conversation is open (measured in the installed app,
                   * 2026-08-25). Pressing 「make a map from my code」 opens the agent panel and
                   * sends the first turn — and this checklist stayed on the map beside it, still
                   * offering 「connect an AI agent · 1/3」 to somebody already mid-conversation
                   * with one. Two surfaces claiming the same next step, one of them stale.
                   *
                   * It is guidance for a person who has not started. Someone talking to an agent
                   * has started. Dismissal is untouched: closing the panel brings it back.
                   */
                  startStepsVisible ? (
                    <VaultStartSteps
                      agentConnected={agentConnect.status.kind === "connected"}
                      acpRuntimeLabel={acpRuntimeLabel}
                      acpRuntimeIcon={acpRuntime?.icon ?? null}
                      acpRuntimeInk={acpRuntime?.brandInk ?? null}
                      onCreateNode={openCreateNodeWithKind}
                      // Someone who opened an empty folder through "choose an existing
                      // folder" gets the same starter as "start fresh in an empty folder",
                      // as a button. Not passed when documents already exist.
                      onScaffoldStarter={
                        (vault.manifest?.docs.length ?? 0) === 0
                          ? handleScaffoldStarter
                          : null
                      }
                      scaffolding={starterScaffolding}
                      /*
                       * With documents in the folder, they are the first step. Connecting
                       * an agent is first in the empty-folder ordering; for someone who
                       * already has something, the first step is that something.
                       */
                      docsFoundCount={bootstrapPlan?.elements.length ?? 0}
                      onStartFromDocs={
                        bootstrapPlan && bootstrapPlan.elements.length > 0
                          ? () => setBootstrapOpen(true)
                          : undefined
                      }
                      analyzePrompt={analyzePrompt}
                      /*
                       * When there is somewhere **inside this app** to paste it, do not
                       * make the user copy. Owner, 2026-08-16: *"I don't even know what the second one is."*
                       * (I have no idea what the second one even is). The instruction is
                       * seated in the chat composer; a person still sends it.
                       */
                      onSendAnalyzeToAgent={
                        agentChatUsesRuntime ? sendAnalyzeToAgent : null
                      }
                      // Owner report, 2026-08-16: the card appeared to overlap INDEX's
                      // right edge. INDEX floats **over** the map column rather than
                      // narrowing it (the right-hand agent panel is a flex sibling and
                      // genuinely does narrow it), so it alone is missing from the card's
                      // centring calculation. This tells the card its width.
                      indexExpanded={renderedIndexState === "expanded"}
                      onFinish={dismissStartSteps}
                      /*
                       * This step is named **connect**, and connecting lives at the agents
                       * destination — where you see what was detected and choose what to
                       * use (owner remark, 2026-08-16).
                       *
                       * ⚠️ It used to open the **chat** when something was detected, so a
                       * button labelled "connect" did something other than its name. The
                       * doors to chat are separate (the utility lane's agent chip, and the
                       * next step's "ask the agent"). Since 2026-08-21 the runtime list
                       * moved out to the agents destination (`docs/DECISIONS.md`, entry
                       * 90), so signalling "open the sheet" would now do nothing at all —
                       * there is no sheet. It navigates instead.
                       */
                      onOpenAgentConnect={() => router.push(DESTINATION_HREF.agents)}
                    />
                  ) : (
                  <TopologyEmptyState
                    conceptCount={emptyTopologyNodeCount}
                    reason={topologyOverlayState.emptyReason}
                    canCreateNode={canCreateNode}
                    onCreateNode={openCreateNode}
                    // Decided by capability, from the same single source as
                    // `OpenVaultCta`. The widget used to ask
                    // `isTauriVaultRuntime() || vault is open` itself and answered "install
                    // the app" to a **web visitor whose browser supports the File System
                    // Access API** (council measurement, 2026-08-08).
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
                  // `topology-map-v2` (`docs/TOPOLOGY-V2-DESIGN.md`) unifies the map tab,
                  // the graph tab, and the project-detail neighbour map into one engine;
                  // this call site is wired once for all three. `nodes`/`edges` come from
                  // `topologyV2Graph` (`topology-v2-adapter.ts`), derived from
                  // `ontologyInsight`. The older engine branches this ternary used to
                  // hold were deleted outright once v2 became the default — owner
                  // directive: *"Delete all the old canvas code."* (delete all the old
                  // canvas code).
                  <TopologyMapV2
                    nodes={topologyV2Graph.nodes}
                    edges={topologyV2Graph.edges}
                    /* Say so when an arrow key has nowhere to walk (owner, 2026-08-10).
                       With no response at all the user cannot tell "broken" from "nothing
                       that way". The wording and the surface belong to the page; the
                       widget only emits the event, because it is tested with no provider
                       around it. */
                    walkNoticeLabel={tTopologyKeyboardWalk("deadEnd")}
                    focus={{ selectedSlug: canvasSelectedSlug }}
                    /* Closes the defect where switching vaults mid-session (sample →
                       local) drew the new graph with the previous graph's camera. The
                       single source is `useVaultSessionIdentityScope()` above — the **same
                       signal** the deep-link cleanup uses, because "which vault am I
                       looking at" must not be answered differently per surface.
                       `deeplinkSourceReady` wraps it for the same reason as its neighbour
                       (see "a scope before it settles is not a scope"): a live refresh
                       returns status to `'loading'`, and the identity computed then is
                       `sample:…`. Passing that straight down makes the camera jump every
                       time one file is saved into the vault (measured dy −10.66). */
                    dataSourceKey={deeplinkSourceReady ? vaultIdentity : null}
                    overviewFit={
                      expandAllActive || expandedParentSet.size > 0 ? "full" : "spine"
                    }
                    fitViewToken={combinedFitToken}
                    spotlightFitToken={spotlightFitToken}
                    relayoutToken={topologyRelayoutToken}
                    revealToken={mapRevealToken}
                    onSelectEdge={(edge) => {
                      setFullDetailSlug(null);
                      setHoverEdge(null); // The popover demotes the hover micro-card.
                      // Fixes edge clicks being swallowed while a node had focus, because
                      // the edge panel is gated on `!selectedOntologyNode`. Selecting an
                      // edge (pair focus) is by definition a **replacement** for a node's
                      // ego focus — two transient surfaces may not coexist — so, mirroring
                      // `onSelect` clearing `selectedEdge`, the node focus is released
                      // here to open that gate. The camera path is the same as
                      // overview → edge.
                      if (selectedOntologyNode) handleClose();
                      setSelectedEdge(edge);
                    }}
                    onHoverEdge={handleHoverEdge}
                    selectedEdge={selectedEdge ? { sourceId: selectedEdge.sourceId, targetId: selectedEdge.targetId } : null}
                    previewEdge={mapRelationPreview}
                    onSelect={(slug) => {
                      setMeaningEditorState(null);
                      setSelectedEdge(null);
                      handleSelect(slug);
                    }}
                    onOpen={handleExpandRequest}
                    onPaneClick={() => {
                      setMeaningEditorState(null);
                      setSelectedEdge(null);
                      handleClose();
                    }}
                    onVisibleCountChange={setTopologyVisibleCount}
                    onGraphStatsChange={handleTopologyGraphStatsChange}
                    onZoomTierChange={setMapZoomTier}
                    onContextMenuNode={handleContextMenuNode}
                    /*
                     * Right-clicking empty canvas means "create a concept here" and takes
                     * the place of the chrome pill removed from the top. Wired only for a
                     * writable vault: a menu on a vault that cannot be written to is a
                     * dead door.
                     */
                    onContextMenuPane={canCreateNode ? () => openCreateNode() : undefined}
                    minimal={localGraphRoot !== null}
                    agentFocusNodeId={agentFocusNodeId}
                    spotlightIds={mapLensIds}
                    mapLensKind={mapLensKind}
                    pathEdgeIds={pathLensEdgeIds}
                    expandedParents={
                      pathExpandedParents ??
                      (expandAllActive ? allExpandedParentIds : null) ??
                      spotlightExpandedParents ??
                      expandedParentSet
                    }
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
                    // Plain mode pushes the element tier into an unreachable band so it
                    // stays hidden; the ego exception still applies.
                    tierReveal={audiencePlain ? PLAIN_TIER_REVEAL : undefined}
                    // Projection for the guided tour's canvas-node anchors.
                    tourAnchorNodeId={tourAnchorNodeId}
                    tourAnchorRef={tourAnchorRef}
                    // While the global search palette is genuinely open (the same
                    // condition as `MountedGlobalSearch`'s `open` prop), the canvas leaves
                    // the accessibility tree via aria-hidden + inert.
                    overlayOpen={!createNodeOpen && ontologySearchOpen}
                    // Appearance preferences from the settings sheet. The DOM glyphs read
                    // the same store themselves and swap in lockstep.
                    glyphSet={glyphSet}
                    canvasBackground={canvasBackground}
                    view3d={view3d}
                    mapArrangement={mapArrangement}
                    // The "the viewport changed" event for the 3D selection reframe: true
                    // while the detail panel actually covers the screen, false once its
                    // exit animation ends. On each flip the dome reframes smoothly against
                    // the visible area; 2D ignores it (see `use-topology-loop`).
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
              {/* Guided tour entry point: the sibling directly above the "?" tile, same
                  chrome-tile token family. It does not copy the "?" tile's phone
                  visibility branch — the tour is `md`+ only by design
                  (`hidden md:flex`). */}
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
                    data-agent-dock-adjacent-rail="true"
                    className="topology-ui-scale pointer-events-auto absolute right-4 z-20 hidden items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] md:right-6 md:top-[var(--topology-tour-help-desktop-top)] md:flex xl:right-8 size-[var(--chrome-tile-size)]"
                  >
                    <Compass className="size-[var(--chrome-icon)]" aria-hidden />
                  </button>
                </Tooltip>
              )}
              {/* Shortcut and gesture help entry point: two slots below the fit tile, after
                  the tour tile. On phones it appears only in overview and focus, where it
                  cannot collide with the primary read rail (path/health). */}
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
                  data-agent-dock-adjacent-rail="true"
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
                    // Below `md`, while the expanded INDEX is a full-bleed sheet, the "?"
                    // tile floated on top of it and overlapped (measured at 600×900,
                    // y188). The sheet is the primary surface, so the chrome demotes. At
                    // `md`+ the `md:flex` keeps it.
                    topologyShortcutHelpPhoneVisible && renderedIndexState !== "expanded"
                      ? "flex"
                      : "hidden"
                  }`}
                >
                  <HelpCircle className="size-[var(--chrome-icon)]" aria-hidden />
                </button>
                </Tooltip>
              )}
              {/* The settings gear moved to the bottom of the left nav rail. After the
                  dead controls panel was removed, the right vertical rail holds only the
                  map's three tiles: fit view, guided tour, and shortcuts. */}
              <HubRail
                projects={renderProjects}
                selectedSlug={canvasSelectedSlug}
                onSelect={(slug) => handleSelect(slug)}
                // Prevents overlap while the hero panel is expanded; with the hero
                // collapsed to a pill, or in the drawer state, the hub rail shows
                // normally.
                suppressed={!leftPanelCollapsed && !drawerOpen}
              />
              {/* The breadcrumb settles down from the top centre of the map, so its
                  entrance origin is its own top edge. */}
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

              {/* Filter context: shown when fewer nodes are visible than exist, so the
                  local graph or a category filter having reduced them is explained. */}
              {topologyVisibleCount !== null && topologyVisibleCount < localGraphProjects.length ? (
                <div className="pointer-events-none absolute bottom-6 left-[220px] z-10 rounded-chip border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-line-a90)] md:left-[228px] xl:left-[236px]">
                  filter · {topologyVisibleCount} / {localGraphProjects.length}
                </div>
              ) : null}

              {/* Zero-match empty state. */}
              {topologyOverlayState.kind === "filter-empty" ? (
                <TopologyNoMatchesState onClearFilters={clearTopologyFilters} />
              ) : null}

              {/* Bottom-right instrument stack — root-first-open v3 reading (FirstRunReadout).
                  The corner inset connects to the existing
                  `--topology-relation-legend-inset` token (base 24px, ≥1920 32px) — when the rest of the chrome grows by 1.15 at ≥1920, this stack moves further from the corner
                  so it does not collide with map labels. */}
              {/* Inspection round 1 defect 2 (2026-07-23) — when the right datasheet opened, this
                  corner reading appeared fragmented behind and to the left of the panel
                  (reproduced across all 4 locales × resolutions). Since it is ambient info and unnecessary during investigation,
                  it quietly disappears while the panel is open. */}
              <div
                ref={readoutStackRef}
                data-testid="topology-readout-stack"
                className={cn(
                  "pointer-events-none absolute bottom-[var(--topology-relation-legend-bottom-inset)] right-[var(--topology-relation-legend-inset)] z-20 flex flex-col items-end gap-3 whitespace-nowrap transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
                  v2DatasheetModel ? "opacity-0" : "opacity-100",
                )}
                aria-hidden={v2DatasheetModel ? true : undefined}
              >
                <FirstRunReadout
                  projectCount={firstRunProjectCount}
                  domainCount={indexDomainCount}
                  tier={mapZoomTier}
                  // Plain mode can never reach the element tier (`PLAIN_TIER_REVEAL`), so
                  // the tier-based hint-drop logic always stated something false there.
                  // It uses the plain wording instead.
                  audiencePlain={audiencePlain}
                />
                {/* Frame meter: off by default, switched on in settings. It joins the
                    stack where instrument readouts **already live** as its last line
                    rather than claiming a new corner — putting readings of the same kind
                    somewhere else makes the eye sweep twice, which is the "new chrome that
                    makes no task clearer" this repo guards against. */}
                {/* The activity row does not live here (moved by owner instruction,
                    2026-08-17).

                    **What changed about the old reasoning.** The measurement that chose
                    this spot compared it with the top **centre** status row: at 1024 that
                    row had only 69px to INDEX's right edge while the chip was 194px, so
                    they overlapped by 32px, and the top-right utility lane had only 28px
                    left **on the same line**. The current position is neither of those —
                    it is the **line below** the utility lane, so there is nothing to
                    compete with horizontally (right-aligned, it grows leftwards into empty
                    map). The old measurement therefore does not refute this spot.

                    Toasts read this stack's actual rect and step aside
                    (`resolveToastBottomOffsetForStack` plus a ResizeObserver), so removing
                    a line moves them down by exactly that much with no value to adjust. */}
                <FrameMeter />
              </div>

              {/* One-time first-visit map hint in sample mode, bottom centre. It is
                  `pointer-events-none`, so it never blocks a node click — a click passing
                  through it dismisses it, and the first node selection dismisses it for
                  good (localStorage). Source: `features/first-run-starter`.
                  Only a selection confirmed to exist counts as learned — a ghost slug used
                  to dismiss this hint permanently (see `resolvedSelectionSlug`). */}
              <SampleNodeHint hasSelection={resolvedSelectionSlug !== null} hidden={tour.open} />

              {/* The honest notice the chrome tile and ⌘O raise on an unsupported
                  browser. It never opens on a supported one, so an experienced user's
                  direct path (tile → OS picker) is unchanged. */}
              <VaultOpenGuideSheet
                open={unsupportedGuideOpen}
                unsupported
                onClose={() => setUnsupportedGuideOpen(false)}
              />

              {/* Pressing recent changes on the sample: a route to a folder instead of a
                  dead end. It reuses `requestVaultOpen` — the **same handler** as the
                  first-run card's open-folder action — so the unsupported-browser branch
                  exists in exactly one place. */}
              <RecentChangesNeedsVaultDialog
                open={recentNeedsVaultOpen}
                onClose={() => setRecentNeedsVaultOpen(false)}
                onOpenVault={requestVaultOpen}
              />

              {/* Same skeleton, different reason: "this is a sample and cannot be edited"
                  has to be a different sentence from "these dates are not yours". */}
              <RecentChangesNeedsVaultDialog
                open={createNeedsVaultOpen}
                copyKey="createNeedsVault"
                onClose={() => setCreateNeedsVaultOpen(false)}
                onOpenVault={requestVaultOpen}
              />

            </>
        </div>
        {/* The alert band settles down from the top. Its text must be held through the
            exit window or it becomes an empty band while leaving. */}
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
        {/* Presence gate: even after `panelOpen` goes false, this stays mounted until the
            exit animation finishes (~140 ms), drawing the same content from the retained
            `panelDatasheetModel` as it folds away. The window belongs to the `<Surface>`
            inside the panel; this gate only takes the positioner down when that surface
            reports `onExited`. */}
        {nodePanelMounted && panelDatasheetModel ? (
          <div
            ref={nodePopoverPositionerRef}
            data-testid="topology-node-popover-positioner"
            data-topology-camera-obstacle="side-panel"
            data-position-contract="selected-inspector-aligns-to-right-inset"
            data-fixed-surface-role="selected-node-inspector"
            data-fixed-surface-measure-target="topology-node-popover"
            data-selected-inspector-overlap-contract="fixed-surface-hides-overlapping-map-cards"
            data-selected-inspector-gutter-contract="no-phantom-utility-rail"
            data-position-top-token="--topology-node-popover-top"
            data-position-right-inset-token="--topology-node-popover-right-inset"
            // `topology-ui-scale` is a plain CSS class, not a Tailwind variant, so it is
            // always applied (zoom 1 by default, real zoom only at ≥1920px / ≥2400px). It
            // must scale at the same ratio as the brand pill or the clearance against
            // `--topology-index-top` stops holding at those widths.
            className="topology-ui-scale fixed inset-x-3 top-[72px] z-30 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
          >
            <div className="grid">
            {panelDatasheetModel ? (
              <TopologyV2DetailPanel
                key={panelDatasheetModel.slug}
                open={panelOpen}
                onExited={() => {
                  if (!meaningEditorOpen) setNodePanelMounted(false);
                }}
                nodeId={panelDatasheetModel.nodeId}
                slug={panelDatasheetModel.slug}
                title={panelDatasheetModel.title}
                sourceTitle={panelDatasheetModel.sourceTitle}
                kind={panelDatasheetModel.kind}
                domain={panelDatasheetModel.domain}
                powered={panelDatasheetModel.powered}
                summaryStaleness={
                  summaryFreshness.has(panelDatasheetModel.slug)
                    ? { behindByDays: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!) }
                    : null
                }
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
                meaningEditHref={panelDatasheetModel.meaningEditHref}
                labels={{
                  kindLabel: tKinds(normalizeKindLabelKey(panelDatasheetModel.kind)),
                  domainLabel: t("nodeDatasheet.domainLabel"),
                  poweredOn: t("nodeDatasheet.poweredOn"),
                  poweredOff: t("nodeDatasheet.poweredOff"),
                  // `usedBy` aggregates a direction rather than one relation type, so it
                  // keeps its own i18n key. `contains`, `dependsOn`, `belongsTo`, and
                  // `evidence` map 1:1 onto relation types and come from the shared
                  // vocabulary's plain register, so the map, the editor, and this panel
                  // manage the same word in one place. The wording is unchanged; the point
                  // is preventing drift.
                  metricContains: relationVocabulary("contains", "plain"),
                  containsShowAll: t("nodeDatasheet.containsShowAll"),
                  groupShowMore: t("nodeDatasheet.groupShowMore"),
                  groupShowFewer: t("nodeDatasheet.groupShowFewer"),
                  containsShowSummary: t("nodeDatasheet.containsShowSummary"),
                  containsOtherGroup: t("nodeDatasheet.containsOtherGroup"),
                  metricUsedBy: t("nodeDatasheet.metricUsedBy"),
                  metricDependsOn: relationVocabulary("depends_on", "plain"),
                  metricBelongsTo: relationVocabulary("belongs_to", "plain"),
                  metricEvidence: relationVocabulary("describes", "plain"),
                  // H1 B2/A — typed-fact label hover explanation + explicit scope for "direct" connection.
                  metricContainsHelp: t("nodeDatasheet.metricContainsHelp"),
                  metricUsedByHelp: t("nodeDatasheet.metricUsedByHelp"),
                  metricDependsOnHelp: t("nodeDatasheet.metricDependsOnHelp"),
                  metricBelongsToHelp: t("nodeDatasheet.metricBelongsToHelp"),
                  metricEvidenceHelp: t("nodeDatasheet.metricEvidenceHelp"),
                  noConnections: t("nodeDatasheet.noConnections"),
                  // 「Code locations」 (Code locations): the actual code evidence — source file paths.
                  codeLocationsLabel: t("nodeDatasheet.codeLocationsLabel"),
                  codeLocationsCopyLabel: t("nodeDatasheet.codeLocationsCopyLabel"),
                  codeLocationsCopiedLabel: t("nodeDatasheet.codeLocationsCopiedLabel"),
                  // The same `editProvenance` namespace as `DocFrontmatterBlock` — one
                  // source, no drift.
                  editSubjectPrefix: tEditProvenance("prefix"),
                  summaryFreshnessPrefix: tSummaryFreshness("prefix"),
                  summaryFreshnessLag: summaryFreshness.has(panelDatasheetModel.slug)
                    ? tSummaryFreshness("lag", {
                        count: daysBehind(summaryFreshness.get(panelDatasheetModel.slug)!),
                      })
                    : undefined,
                  summaryFreshnessAction: tSummaryFreshness("action"),
                  editSubjectAgent: tEditProvenance("subjectAgent"),
                  editSubjectHuman: tEditProvenance("subjectHuman"),
                  editConflictMessage: tEditProvenance("conflictMessage"),
                  handoff: t("nodeDatasheet.handoff"),
                  close: t("controls.close"),
                  openFullDetail: t("nodeDatasheet.openFullDetail"),
                  actionsGroupLabel: t("nodeDatasheet.actionsGroupLabel"),
                  actionDocument: t("nodeDatasheet.actionDocument"),
                  actionEditRelations: t("nodeDatasheet.actionEditRelations"),
                  actionEditMenu: t("nodeDatasheet.actionEditMenu"),
                  actionMore: t("nodeDatasheet.actionMore"),
                  actionCreateLinked: t("nodeDatasheet.actionCreateLinked"),
                  actionCopyHandoff: t("nodeDatasheet.actionCopyHandoff"),
                  actionAskAgent: llmBridgeAvailable
                    ? t("nodeDatasheet.actionAskAgent")
                    : undefined,
                  actionRealm: t("realm.enterAction"),
                  // Result-description tooltip (owner approved) — plain text explaining "what happens when pressed"
                  // rather than label repetition. Area expansion reuses existing orbit button tooltips.
                  actionAskAgentTip: t("nodeDatasheet.actionAskAgentTip"),
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
                onSelectConnection={(id) => {
                  setMeaningEditorState(null);
                  handleSelect(id);
                }}
                onHoverConnection={handleDatasheetHoverConnection}
                onHoverEvidence={handleDatasheetHoverEvidence}
                onCopyHandoff={copyV2NodeHandoff}
                onEditRelations={
                  () => {
                    if (meaningEditorSource) {
                      openMeaningEditor({
                          sourceId: meaningEditorSource.id,
                          relation: "dependsOn",
                          targetId: null,
                      });
                    } else {
                      setCreateNeedsVaultOpen(true);
                    }
                  }
                }
                /*
                 * "Create one from here" is passed **only on a domain node**.
                 *
                 * Domain → capability is expressed by one `domain:` key in the new
                 * document, so no new write semantics are needed. Other combinations
                 * (capability → element, say) require editing the parent document's list,
                 * which makes it *editing someone else's document* rather than *creating*
                 * — a different act, and drawing a door where that cannot happen is a
                 * false affordance.
                 *
                 * It is **visible on the sample too**. Owner, 2026-08-03: *"Show it in sample mode
                 * as well, and have pressing it lead into connecting a folder."* (show it in sample mode
                 * as well, and have pressing it lead into connecting a folder). Previously
                 * the tile vanished entirely when `canCreateNode` was false, which is why
                 * the owner asked *"Why did creating a node right here disappear?"* (why did
                 * creating a node right here disappear?) — a locked feature that quietly
                 * goes away becomes "was that ever there?". The same pattern was already
                 * fixed once on the recent-changes chip. Now the place stays and pressing
                 * it offers **the route to a folder**.
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
                // In environments without an agent surface (web), we do not inject; handoff copy
                // takes over as the primary action. We do not draw a door that will not open.
                onAskAgent={llmBridgeAvailable ? askAgentAboutSelectedNode : undefined}
                onClose={handleDatasheetClose}
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
                  // The secondary discovery path is offered only for a container node
                  // (one with children) outside any realm. For a leaf, or when already
                  // inside a realm, it is omitted and no button renders.
                  resolvedRealmSlug === null && panelDatasheetModel.groups.contains.total > 0
                    ? () => handleEnterRealm(panelDatasheetModel.nodeId)
                    : undefined
                }
                onOpenFullDetail={
                  selectedOntologyNode
                    ? () => setFullDetailSlug(selectedOntologyNode.id)
                    : undefined
                }
                // Slice C — non-developer (plain) mode treats handoff copy action + original
                // path subline (slice B) as developer chrome and hides them.
                showHandoff={!audiencePlain}
                showSourcePath={!audiencePlain}
                className="col-start-1 row-start-1 max-lg:w-[min(520px,calc(100vw-1.5rem))]"
              />
            ) : null}
            {meaningEditorSource && heldMeaningEditorState ? (
              <MeaningEditorPanel
                key={`meaning:${meaningEditorSource.id}`}
                open={meaningEditorOpen}
                source={meaningEditorSource}
                candidates={meaningEditorCandidates}
                initialRelation={heldMeaningEditorState.initialRelation}
                initialTargetId={heldMeaningEditorState.initialTargetId}
                initialWhy={heldMeaningEditorState.initialWhy}
                onPreview={setMeaningPreview}
                onApply={applyMeaningEditor}
                onClose={closeMeaningEditor}
                onExited={() => {
                  if (!panelOpen) setNodePanelMounted(false);
                }}
                className="col-start-1 row-start-1 max-lg:w-[min(520px,calc(100vw-1.5rem))]"
              />
            ) : null}
            </div>
          </div>
        ) : null}
        {/* The edge hover card renders even while a node has focus — user report: "with
            a node clicked, hovering a line shows no tooltip". It is mutually exclusive
            with the edge popover only, since that would be two surfaces for the same
            meaning. */}
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
        {/* Cluster-chip hover tooltip, mutually exclusive with the edge card and the
            create composer. (The pointer handler already clears the edge hover when a
            chip is hovered; this is belt and braces.) */}
        {clusterHoverCardModel && !hoverEdgeCardModel && !createNodeOpen ? (
          <TopologyV2ClusterHoverCard
            sentence={clusterHoverCardModel.sentence}
            x={clusterHoverCardModel.x}
            y={clusterHoverCardModel.y}
          />
        ) : null}
        {/* This one has an exit: it used to vanish in one frame on close, having an
            entrance and no way out. `Surface` owns the exit window, the exit class, and
            `inert`, while `useHeldValue` holds the model through it. */}
        {heldEdgePanelModel ? (
          <Surface
            open={edgePanelOpen}
            data-testid="topology-edge-popover-positioner"
            className="topology-ui-scale fixed inset-x-3 top-[72px] z-30 flex justify-center lg:inset-x-auto lg:right-[var(--topology-node-popover-right-inset)] lg:top-[var(--topology-node-popover-top)] lg:block"
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
              meaningEditHref={heldEdgePanelModel.meaningEditHref}
              onEditRelation={
                heldEdgePanelModel.meaningRelation
                  ? () => {
                      if (heldEdgePanelModel.contextualEditable) {
                        openMeaningEditor({
                          sourceId: heldEdgePanelModel.fromId,
                          relation: heldEdgePanelModel.meaningRelation!,
                          targetId: heldEdgePanelModel.toId,
                        });
                      } else {
                        setCreateNeedsVaultOpen(true);
                      }
                      setSelectedEdge(null);
                    }
                  : undefined
              }
              labels={{
                kicker: t("edgePanel.kicker"),
                declaredByLabel: t("edgePanel.declaredBy"),
                editRelation: t("edgePanel.editRelation"),
                close: t("edgePanel.close"),
                openDoc: t("edgePanel.openDoc"),
              }}
              onSelectNode={(id) => {
                setMeaningEditorState(null);
                setSelectedEdge(null);
                handleSelect(id);
              }}
              onClose={() => setSelectedEdge(null)}
              className="pointer-events-auto max-lg:w-[min(400px,calc(100vw-1.5rem))]"
            />
          </Surface>
        ) : null}
        {/* Same skeleton as the edge panel: once a held model exists the slot stays, and
            `Surface`'s `open` decides visibility (closed, it renders `null`, so the DOM
            cost is zero). A separate mount flag would mean calling setState inside an
            effect, which is a cascading render. */}
        {heldContextMenu ? (
          <TopologyV2ContextMenu
            open={Boolean(contextMenuNode && contextMenuModel)}
            position={heldContextMenu.anchor}
            documentHref={heldContextMenu.model.documentHref}
            mentionDocumentHref={heldContextMenu.model.mentionDocumentHref}
            meaningEditHref={heldContextMenu.model.meaningEditHref}
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
        {/* Full-bleed surface, **opacity only** (`motion="overlay"`). It used to have
            `map-overlay-in` applied by hand and therefore only a way in; closing made the
            whole screen vanish in one frame, giving the protagonist zero frames while the
            map got 200 ms. `Surface` now owns the matching way out (`map-overlay-out`),
            `inert`, and the exit window. */}
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
        {/* The one palette shared by the header search button, ⌘K, and ⇧⌘K (ontology
            nodes + projects). Both node and project selections go through `handleSelect`
            so only the map's selection changes; the default (pushing to `/ontology/?node=`
            when `onSelectNode` is absent) would leave the map, so the override is
            mandatory. Controlled through `open`/`onOpenChange`; the hotkeys are managed by
            `useTypingShortcuts` above. */}
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
        <GuidedTourOverlay
          tour={tour}
          canvasAnchorRef={tourAnchorRef}
          onActivateAnchor={tourAnchorNodeId ? activateTourAnchor : undefined}
        />
      </div>
      {/* A sibling in the **same flex row** as the map column, so one width animation
          moves both: the map narrowing and the panel arriving share a frame and a curve.
          Not two animations tuned to match — physically one. */}
      {llmBridgeAvailable ? (
        <VaultAgentPanel
          /*
           * A URL carrying "ask about this concept" is enough to open it.
           *
           * ⚠️ **It does not open while the coding-agent branch holds the panel** —
           * there is one chat panel (2026-08-16). Without this condition a request
           * arriving in the URL raises a second one.
           */
          open={keyChatOpen}
          onClose={closeVaultAgent}
          vaultPath={gitVaultPath}
          insight={ontologyInsight}
          manifest={vault.manifest}
          screenContext={vaultAgentScreenContext}
          vaultIsGit={false}
          canWrite={vault.status === "loaded" && Boolean(vault.handle)}
          // A chip focusing a node goes through the **same function** as clicking a node
          // on the map: the same action appearing with different motion is a defect.
          onFocusNode={(slug) => handleSelect(slug)}
          // A door even with no folder open, through the **same function** as the utility
          // lane's "switch to my data" — no second open path is created.
          onOpenFolder={() => void vault.open()}
          downloadHref={`/${activeLocale}/download/`}
          prefillRequest={vaultAgentPrefill ?? askPrefill}
        />
      ) : null}
      {/*
        The in-app conversation with **the user's own coding agent**. A sibling in the
        same slot as the panel above (the API-key branch) — no new surface.

        The rule that the map comes first still holds: this panel stands beside the map
        and never covers it.
      */}
      {gitVaultPath ? (
        <div
          data-agent-dock-frame="true"
          data-right-dock={acpDockFrameOpen || chatMounted ? "chat" : undefined}
          style={{
            width: acpDockFrameOpen ? `${chatWidth.width}px` : "0px",
            transitionProperty: "width",
            // Same role and same clock as the key branch's `VaultAgentPanel`. If the two
            // chat panels pushed the map at different speeds, "one door" would stop being
            // true.
            transitionDuration: "var(--agent-panel-reflow-duration)",
            transitionTimingFunction: "var(--topology-motion-ease-out)",
          }}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== "width") return;
            // Space claims its position first, then launches the session. Even if ACP process start
            // briefly occupies the WebKit main thread, already-finished layout motion is not interrupted.
             if (acpDockFrameOpen && !acpChatOpen) scheduleAcpSessionStart();
          }}
          className="relative min-h-0 shrink-0 overflow-hidden bg-[color:var(--color-canvas)]"
        >
          {(runtimeChatOpen || chatMounted) && acpRuntime ? (
          <Surface
            open={acpDockFrameOpen}
            as="aside"
            motion="overlay"
          /*
           * ⚠️ **This used to be dead code** (caught in the 2026-08-16 review).
           *
           * The mount condition for this block and `open` were **the same value**, so
           * pressing close made it disappear whole in the same frame: the exit animation
           * never once played and this callback was never called — there was no "while
           * it leaves".
           *
           * Mount and open are now separate: mount on open, unmount once it has fully
           * left. That is this repo's per-surface rule that an exit is a two-frame job.
           */
          onExited={() => setChatMounted(false)}
          /*
           * ⚠️ The width used to be `var(--topology-agent-panel-width, 360px)`, and **that
           * token does not exist** — the 360px fallback was always what applied, while a
           * token name nobody used looked like a spec (`.claude/rules/design.md`: a token
           * nobody uses is not a spec, it is wrong information).
           *
           * After that it was two literals, `w-[420px] xl:w-[480px]`, and neither was
           * **anybody's answer**. Now the user drags the left edge to decide, and we only
           * enforce the share the map must keep (`panel-width.ts`). With no
           * viewport-width branch left, the `xl:` goes too.
           */
            data-agent-dock-surface="inset"
            style={{ width: `calc(${chatWidth.width}px - var(--chrome-inset))` }}
            /*
             * The fixed-width content is pinned right and only the outer frame animates
             * from 0 to the stored width. Animating the content width every frame would
             * re-wrap the text continuously and stutter more.
             */
            className={`${AGENT_DOCK_INSET_SURFACE_CLASS} flex min-h-0 shrink-0 flex-col p-4`}
          >
          <AcpChatResizeHandle
            width={chatWidth.width}
            onWidth={chatWidth.setWidth}
            onCommit={chatWidth.commitWidth}
          />
          <AcpChatPanel
            /*
             * Changing the runtime **rebuilds the panel.** A session is bound to one
             * process, so swapping only the tool inside the same panel blurs "what is
             * alive right now". Rebuilding is cheaper and unambiguous.
             */
            key={acpRuntime.id}
            runtimeId={acpRuntime.id}
            runtimeLabel={acpRuntime.label}
            runtimes={acpRuntimes}
            onRuntimeChange={setAcpRuntimeId}
            vaultRoot={gitVaultPath}
            mcpServers={acpMcpServers}
            sessionEnabled={acpChatOpen}
            // The sentence jumped from the node sits in the **here** write box — it is not sent.
            prefillRequest={vaultAgentPrefill ?? askPrefill}
            openingRequest={agentOpeningRequest}
            suggestions={chatSuggestions}
            onSuggestionAction={handleChatSuggestionAction}
            knownSlugs={chatKnownSlugs}
            onHoverSlug={handleChatHoverSlug}
            onTurnActivityChange={handleAcpTurnActivityChange}
            onMapIntent={handleAcpMapIntent}
            onOntologyRelationPreviewChange={setAcpRelationPreview}
            onWorkReceipt={handleAcpWorkReceipt}
            onClose={closeVaultAgent}
          />
          </Surface>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

/**
 * The same ask request gives the same value: the panel must reseat the draft only when
 * the request **differs**. Using a timestamp would change the value every render and
 * overwrite the sentence the user was editing.
 */
function hashAskRequest(kind: string, ref: string): number {
  const source = `${kind}:${ref}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
}
