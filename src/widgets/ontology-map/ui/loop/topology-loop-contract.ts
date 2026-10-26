import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet, MapArrangement, MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import type { RefObject } from "react";
import type { DialFrameSummary } from "../../dial/frame/frame";
import type { DialEvidence, DialLabels, DialMemory } from "../../dial/types";
import type { TopologyMapLensKind } from "../../model/visibility/path-lens";
import type { SelectionSource } from "../../model/camera/flat-selection-camera";
import { type TierNameAnchor } from "../../model/dome-view/tier-names";
import { type TierRevealConfig, type ZoomTier } from "../../model/visibility/tier-visibility";
import type { ClusterBarLabels } from "../../render/cluster-chips";
import type { HoverAvoidRect } from "../input/topology-pointer-types";

import type { OntologyMapProps } from "../OntologyMap";

export interface UseTopologyLoopArgs {
  nodes: OntologyMapProps["nodes"];
  edges: OntologyMapProps["edges"];
  focusedSlug: string | null;
  /**
   * The neighbor slug the user is hovering in the detail panel's "Connected Nodes"
   * list, or null. Under focus this one node (+ its connecting edge) lights up
   * on the canvas so panel and map read as one ("emphasis ripple" linkage,
   * lead spec §4). Null until the panel-hover wiring feeds it in.
   */
  emphasizedNeighborSlug?: string | null;
  /** Identity of this graph's source; a change refits the overview. See the same name on `OntologyMapProps`. */
  dataSourceKey?: string | null;
  assembleOnOpen?: boolean;
  arrivingDocuments?: number;
  /**
   * What the overview camera fits: `"spine"` (default) is the project/domain/
   * hub bbox, `"full"` is every node's bbox. See the same name on
   * `OntologyMapProps`.
   */
  overviewFit?: "spine" | "full";
  fitViewToken: number;
  /**
   * Bump to toggle a growth replay (`model/ambient/growth-replay.ts`); a bump while one runs stops it.
   * Ignored under reduced motion.
   */
  growthReplayToken?: number;
  /**
   * Fires on every transition of "is a growth replay running", so the control
   * can carry the active tone and `aria-pressed` for exactly as long as the
   * replay lasts, including when it ends on its own.
   */
  onGrowthReplayingChange?: (running: boolean) => void;
  /** Bumped to aim the camera at the spotlit nodes when the lens or its window changes (0 = unused). */
  spotlightFitToken?: number;
  constellationFocusId?: string | null;
  relayoutToken: number;
  /**
   * The first-map reveal. On increment every node starts at the spine centre
   * (the project's position) and springs home, so the moment reads as "my
   * documents gathered" rather than "something was generated".
   *
   * Fires on bootstrap completion only — never on an ordinary load, where the
   * animation would just delay the map. Under reduced-motion the homing snap
   * path arrives immediately.
   */
  revealToken?: number;
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; }) => void;
  /** Edge hover micro-card. Fires only when the identified edge changes; null clears. */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null,
    position: { x: number; y: number; avoid: readonly HoverAvoidRect[]; } | null) => void;
  onSelect?: (slug: string, source: SelectionSource) => void;
  /**
   * An arrow key found no neighbour in that direction; repeats are debounced
   * by the hook. Carries **where** the walk stopped (canvas-local coords)
   * because this is the only place that knows the position, and the hint has
   * to appear beside that node.
   */
  onWalkDeadEnd?: ((point: { x: number; y: number; } | null) => void) | null;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number; }) => void;
  /**
   * How many concepts the frame just painted (`lastDrawnNodeCount`). Fired only
   * when the number changes, so the bottom instrument readout can say what is on
   * the canvas instead of restating the zoom tier's rule.
   */
  onDrawnCountChange?: (drawn: number) => void;
  /**
   * Where each Strata tier name stands this frame, beside its plane's rim, in canvas
   * CSS px (`model/dome-view/tier-names.ts`). Emitted only when a name moved by more than half a
   * pixel, so an idle frame does not re-render the overlay, and `null` whenever the
   * arrangement is not Strata or its rings are not up yet.
   */
  onDomeTierAnchorsChange?: (anchors: readonly TierNameAnchor[] | null) => void;

  /**
   * The semantic-zoom altitude tier changed (spine → circuit → element). Fires
   * on transitions only, not per frame, and is driven by the same reveal bands
   * the draw pass uses to gate node visibility — so the corner readout can
   * never say "zoom in to see elements" while elements are already on screen.
   */
  onZoomTierChange?: (tier: ZoomTier) => void;
  /** Node right-click context menu — see `topology-pointer-types.ts#onContextMenuNode` doc. */
  onContextMenuNode?: (slug: string, position: { x: number; y: number; }) => void;
  /** Right-click on empty canvas — "create a concept here". */
  onContextMenuPane?: (position: { x: number; y: number; }) => void;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form upstream, or `null`
   * when there's no fresh focus). Drives the amber agent-focus ring + label
   * activity mark; `null`/omitted draws neither (fabrication 0).
   */
  agentFocusNodeId?: string | null;
  /**
   * Recent-change spotlight. Non-null turns the lens on: nodes and edges
   * outside this set sink to `--map-spotlight-rest-alpha`. The on/off
   * transition reuses the focusDimTau ramp (<200 ms perceived) and arrives
   * immediately under reduced-motion. The set itself is built by HomePage from
   * the `?recent=` window's mtime arithmetic (`useAdaptiveRecentChanges`).
   */
  spotlightIds?: ReadonlySet<string> | null;
  mapLensKind?: TopologyMapLensKind;
  pathEdgeIds?: ReadonlySet<string> | null;
  /** Edge selection = pair focus (show only endpoints, selected edge pale indigo). */
  selectedEdge?: { sourceId: string; targetId: string; relationType?: string; } | null;
  relationCaptions?: ReadonlyMap<string, string> | null;
  reviewQuestionIds?: ReadonlySet<string> | null;
  previewEdge?: OntologyMapProps["previewEdge"];
  /**
   * Density gate — the set of parent slugs the user has expanded (URL
   * `?open=`). Children of a parent past the threshold are collapsed into a
   * cluster chip by default; only parents listed here reveal theirs. Omitted
   * means everything is collapsed.
   */
  expandedParents?: ReadonlySet<string>;
  /** Density gate — a cluster chip click toggles that parent's expansion (round-trips through the URL). */
  onToggleCluster?: (parentId: string) => void;
  /** Cluster-chip hover tooltip. Fires only when the identified chip changes; null clears. */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** Direct children collapsed by the density gate at this tier (the chip's `+N`). */
      count: number;
      /** Every descendant beneath the parent (the node badge's `descendantCount`). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number; };
    } | null) => void;
  /**
   * Realm entry — switches the map into this node's own world (`?realm=slug`);
   * null is the whole map. A change starts a subtree relayout plus the
   * transition choreography.
   */
  realmRootId?: string | null;
  /** The orbit's enter button was clicked for this slug; HomePage round-trips it through the URL. */
  onEnterRealm?: (slug: string) => void;
  /** DOM for the orbit's enter button — anchored in canvas coords, following the camera every frame. */
  realmEnterButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * Census caption engraved under the warding ring, formatted by HomePage so the widget never touches
   * i18n or census arithmetic.
   */
  realmCaption?: string | null;
  /**
   * Footprint trail — node ids visited (ego-focused) during this session,
   * oldest to newest, held in HomePage session state. Each visited node gets a
   * recency-decayed hairline ring. Not persisted to the URL. Omitted or empty
   * draws no footprints.
   */
  visitedTrail?: readonly string[];
  /**
   * Whether the trail lens is on, as a **ref** — true while the trail popover
   * is open. The map briefly stops being read for relations and yields to
   * being read for a path: only the `visitedTrail` nodes keep their values and
   * labels, everything else recedes to the existing dim values. This is not a
   * new mode, toggle, or URL state — it is **equivalent** to the popover being
   * open (transient-surface contract).
   *
   * A ref rather than a value for the same reason as brushing: promoting it to
   * state re-renders the whole page tree on every lens toggle, and the
   * transition frame jumps into the 100 ms range (measured). The loop reads it
   * every frame, and the idle gate wakes itself by comparing against the lens
   * state it last drew, so the same transition costs zero renders.
   */
  trailLensActiveRef?: RefObject<boolean>;
  /**
   * Translations for "expand all" / "expand N" / "collapse". The canvas never
   * builds user-facing strings — same path `realmCaption` already uses.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * Trail brushing — a **ref** holding the node id of the popover row under
   * hover/focus. While the lens is on, the map borrows its own hover channel
   * to draw the existing hover preview ring on that node, answering "which one
   * was two steps ago" by pointing instead of numbering.
   *
   * A ref rather than a value because hover changes continuously as the cursor
   * sweeps rows, and each change through React state re-renders the entire
   * HomePage tree (measured 68–109 ms, enough to feel sticky). The frame loop
   * already reads refs every frame, so it reaches the same result with zero
   * renders.
   */
  trailHoverNodeIdRef?: RefObject<string | null>;
  /**
   * The node the cursor points at from a side panel (chat names, data sheet rows); one channel because
   * there is one cursor. It looks exactly like a mouse hover. A ref so hovers do not re-render.
   */
  panelHoverNodeIdRef?: RefObject<string | null>;
  /**
   * Tier gate config for the display lens. Omitted means `DEFAULT_TIER_REVEAL`
   * (developer mode — capability and element both respond to zoom normally).
   * In plain mode HomePage passes `PLAIN_TIER_REVEAL`, which hides elements
   * outright. Draw, hit-testing, and pan clamping all agree because they read
   * this one value.
   */
  tierReveal?: TierRevealConfig;
  /**
   * Node body render style: `"geometric"` (default, filled) or `"line"`
   * (stroke only). The kind→silhouette mapping is unchanged either way. Reads
   * the same store as the DOM glyphs so both swap together.
   */
  glyphSet?: GlyphSet;
  /**
   * Canvas background set — `"dot"` (default), `"web"` (relation mesh), or
   * `"depth"` (perspective grid). All remain restrained, non-particle fields.
   */
  canvasBackground?: CanvasBackground;
  /**
   * Opt-in 3D view: lit Strata or the relation-driven Neural cloud (`model/dome-view/`). Draw, hit
   * testing, DOM anchors and the inspection hook read the same frame map. Omitted keeps 2D.
   */
  view3d?: boolean;
  /** Which 3D structure is drawn — Strata or the coupling (Neural) cloud. */
  mapArrangement?: MapArrangement;
  /**
   * Node id to evidence state from `shared/lib/git/evidence-states.ts`. Absent id is unknown; null means
   * nothing was measured. It decides how much each node emits.
   */
  domeEvidence?: ReadonlyMap<string, "current" | "stale" | "unknown"> | null;
  onHiddenDependenciesChange?: (count: number) => void;
  /** 3D reframe input: is the detail panel covering the viewport (`OntologyMap` JSDoc). */
  detailPanelVisible?: boolean;
  /** Footprint appearance settings. Omitted or `null` draws no footprints. */
  footprint?: FootprintPreference | null;
  /**
   * Expansion settings — the expand affordance, child placement, how many open
   * at once, how many to attempt naming, and how many parents stay expanded
   * together.
   */
  expand?: ExpandPreference;
  /** Wheel / vertical-swipe ownership — see `wheelIntent` in `topology-pointer-types.ts`. */
  wheelIntent?: "zoom" | "page-scroll";
  navigationSpeed?: MapNavigationSpeed;
  /** Ambient sleep delay — see `ambientSleepDelayMs` on `OntologyMap`. */
  ambientSleepDelayMs?: number;
  dialLabels?: DialLabels | null;
  evidenceStates?: ReadonlyMap<string, DialEvidence> | null;
  impactLens?: boolean;
  onFlatDialChange?: (state: FlatDialState) => void;
  flatRingMemory?: FlatRingMemoryStore | null;
  loadProgress?: { read: number; total: number;
    } | null;
  placingTierRead?: boolean;
}

export interface FlatDialState {
  drawn: boolean;
  evidenceMeasured: boolean;
  summary?: DialFrameSummary | null;
}

export interface FlatRingMemoryStore {
  current(): DialMemory | null;
  write(next: DialMemory): void;
}

export interface FlatDialFrameProps {
  labels: DialLabels | null;
  evidence: ReadonlyMap<string, DialEvidence> | null;
  impactLens: boolean;
  onChange: ((state: FlatDialState) => void) | undefined;
  sent: FlatDialState | null;
}

export function reportFlatDial(props: FlatDialFrameProps, summary: DialFrameSummary | null): void {
  const drawn = summary !== null;
  const evidenceMeasured = drawn && props.evidence !== null;
  const sent = props.sent;
  if (sent && sent.drawn === drawn && sent.evidenceMeasured === evidenceMeasured && sameSummary(sent.summary ?? null, summary)) return;
  props.sent = { drawn, evidenceMeasured, summary };
  props.onChange?.(props.sent);
}

function sameSummary(a: DialFrameSummary | null, b: DialFrameSummary | null): boolean {
  if (a === null || b === null) return a === b;
  return a.concepts === b.concepts && a.domains === b.domains && a.tier === b.tier && a.linksShown === b.linksShown && a.linksTotal === b.linksTotal;
}
