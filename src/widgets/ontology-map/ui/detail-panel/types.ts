import type { RefObject } from "react";
import type { ProjectSourceView } from "@/shared/lib/project-source/project-source-receipt";
import type { ConceptReach } from "../../model/concept-reach";
import type { V2ConnectionGroupsView } from "./map-datasheet";

export interface OntologyMapDetailPanelLabels {
  kindLabel: string;
  noConnections: string;
  /** A partner domain row's count, spoken. */
  domainLinks: (count: number) => string;
  close: string;
  /** Opens the A1 full-detail datasheet, the details-on-demand step beyond this compact panel. */
  openFullDetail: string;
  /** The footer's controls as one group. */
  actionsGroupLabel: string;
  actionDocument: string;
  actionEditRelations: string;
  actionEditMenu: string;
  actionMore: string;
  /** Build on this concept **to create a new concept** — do not leave the map. */
  actionCreateLinked?: string;
  actionCopyHandoff: string;
  /** Absent without an agent panel (web build); the handoff copy stands in for it. */
  actionAskAgent?: string;
  actionRealm: string;
  /** What asking the agent does; touch has no hover, so the label stays self-sufficient. */
  actionAskAgentTip?: string;
  editConflictMessage: string;
  /** Preformatted by the caller; undefined in the browser (no Git history), so the row never mounts. */
  summaryFreshnessPrefix?: string;
  summaryFreshnessLag?: string;
  summaryFreshnessAction?: string;
  summaryHistoryUnavailable?: string;
  /** Project-only source receipt copy, preformatted by the caller. */
  sourceHeading?: string;
  sourceRecord?: string;
  /** The status line while the receipt is still being read (`projectSourceLoading`). */
  sourcePending?: string;
  sourceKind?: string;
  sourceStatus?: string;
  sourceMeasuredAt?: string;
  sourceCurrentness?: string;
  sourceGap?: string;
  sourceGapLabel?: string;
  sourceAction?: string;
  /** The one plain-words sentence beside the diagnosis saying what the next action makes possible. */
  sourceWhy?: string;
  sourceBusy?: string;
}

/** What a person's review mark on the concept's document says now. A concept with no mark has none of it. */
export interface ConceptReview {
  /** `review_state: human_decides`, with `review_note` as written. */
  raised: { note: string | null } | null;
  changedSinceReview: boolean;
  /** Confirmed, but the file could not be read to tell whether it changed since. */
  unverifiable: boolean;
  /** `reviewed_at` as written, only while the confirmation still matches the file. */
  reviewedOn: string | null;
}

export interface OntologyMapDetailPanelProps {
  /** Canonical `kind:slug` handle used by URL state and installed-app proof. */
  nodeId: string;
  slug: string;
  title: string;
  kind: string;
  /** A capability's domain or an element's capability, pressed to select it; null for other kinds. */
  owner: { id: string; title: string } | null;
  /** The definition sentence as written; null shows the quiet "no definition yet" sentence. */
  definition: string | null;
  /** Absent reads as no review mark: no judgment line and no review date. */
  review?: ConceptReview;
  /**
   * Set when this node is a `domain` or `project` whose containment list changed after
   * its description was last written — the caller derives it from the summary clock scan
   * over `vault_node_revisions`. Null for every other node, and null everywhere in the
   * browser, where there is no Git history to read. Advisory: it mounts one plain row
   * and offers no fix, because the body is a human judgement.
   */
  summaryStaleness?: { behindByDays: number } | null;
  summaryHistoryUnavailable?: boolean;
  /** The document changed inside the recent window, so its changed label is the header's time fact. */
  powered: boolean;
  /** Single source of every relation count this panel draws, so counts and drawn rows cannot diverge. */
  groups: V2ConnectionGroupsView;
  /** What the concept needs and what needs it, counted as the map's count line counts them. */
  reach?: ConceptReach | null;
  /** Preformatted "when did it change" label; null when the node has no backing doc date. */
  updatedAtLabel?: string | null;
  /**
   * rank7 — expected_mtime conflict badge. `true` only on a REAL mismatch
   * between the freshness this panel opened with and the freshness now
   * known (`hasNodeMtimeConflict`) — never shown speculatively.
   */
  mtimeConflict?: boolean;
  /** Pre-built agent handoff payload; the view owns clipboard + toast. */
  handoffText: string;
  /**
   * The W2-A "Document" action tile's target — the `buildDocsVaultHref`
   * result for this node's backing vault doc, or `null` when the node has no
   * `sourceSlug` (the tile renders disabled rather than linking to a guessed URL).
   */
  documentHref: string | null;
  /** The W2-A "Edit Relations" action tile's target — the contextual
   * editor deep link (`/topology/?p=<id>&workbench=edit`). */
  meaningEditHref: string;
  labels: OntologyMapDetailPanelLabels;
  onSelectConnection: (id: string) => void;
  /**
   * Canvas node id (`domain:example-domain`), as in `onSelectConnection`. Evidence rows use a vault
   * slug and go through `onHoverEvidence`; do not merge the two namespaces into one callback.
   */
  onHoverConnection?: (id: string | null) => void;
  /** Cleared with the map's emphasis when the panel unmounts. */
  onHoverEvidence?: (slug: string | null) => void;
  onCopyHandoff: (text: string) => void;
  /** With a contextual editor inside the map, open it in place instead of following the link. */
  onEditRelations?: () => void;
  /**
   * "Create New Following This" — creates a new node attached to this concept. If absent, the
   * corresponding row in the edit menu is not drawn (do not draw a door where there is none).
   */
  onCreateLinked?: () => void;
  /**
   * S7 Seam — "Verbally Instruct Agent". The sentence is not constructed here:
   * the first-word generator (a function like `buildFirstWords`) constructs it
   * by looking at this concept's blanks, and this panel only reports **who clicked**. If two entry points produce different sentences,
   * they diverge immediately. In environments without a bridge (web), it is not injected and handoff copy
   * becomes the primary action. Do not draw a door that won't open.
   */
  onAskAgent?: () => void;
  /**
   * Opens the shared meaning context without sending a model request: the first `⋯` item, and the
   * judgment action when connections have no reason written.
   */
  meaningReview?: { label: string; onOpen: () => void };
  discoveryAction?: { label: string; onOpen: () => void };
  /** Quiet this panel's filled control while another surface owns the primary next step. */
  suppressPrimaryAction?: boolean;
  onClose: () => void;
  /** Stable keyboard destination when related-node navigation replaces this panel. */
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * S4 "Expand Domain" secondary discovery path — allows expanding the domain from the datasheet
   * in addition to the orbit button. Injected only for container nodes (with children) when outside a domain
   * (otherwise omit → button hidden). One action shared with the orbit button.
   */
  onEnterRealm?: () => void;
  /** Opens the A1 full-detail datasheet for this node — the details-on-demand
   * opt-in (`.claude/rules/design.md`, "full-screen drawer is opt-in" — a full-screen
   * drawer is opt-in). Omitted hides the link (read-only embeds, for instance). */
  onOpenFullDetail?: () => void;
  /**
   * `<Surface>` owns the exit window (`EXIT_WINDOW_MS`), `.topology-chrome-out`, `inert` and
   * `pointer-events-none`, so the consumer arranges no exit timing.
   */
  open: boolean;
  /**
   * Once, **after** the exit finishes. Used as the signal to take down the
   * parent's positioner — with two exit timers there is no telling which is true,
   * so the window exists only here and the parent is notified of its end.
   */
  onExited?: () => void;
  className?: string;
  /** The handoff copy action; `false` in plain mode, where it is developer chrome. Default `true`. */
  showHandoff?: boolean;
  /** Project-only 0/1 source binding receipt. Other kinds ignore it. */
  projectSource?: ProjectSourceView | null;
  /**
   * The receipt is still being read. `projectSource` is null both while it is read and
   * where no receipt can exist (no folder open); only this tells the panel to keep the
   * project layout and hold the receipt's place, instead of drawing another layout first
   * and rebuilding itself when the receipt lands.
   */
  projectSourceLoading?: boolean;
  /** Executes the receipt's already-bounded next action (connect or remeasure). */
  onProjectSourceAction?: () => void | Promise<void>;
  /** Keeps the prior receipt visible while a replacement is measured. */
  projectSourceBusy?: boolean;
  /** Localized explicit-action failure; never used for picker cancellation. */
  projectSourceError?: string | null;
  /**
   * Passed only when the action is unavailable (the web cannot know the folder's absolute path).
   * Carries why it does not work, where it does, and what works here (`surfaces.md`).
   */
  projectSourceDegraded?: {
    why: string;
    ctaLabel: string;
    href: string;
    stillWorks: string;
  } | null;
  /**
   * "Is This the Folder?" — this is where connecting drops
   * from two steps (press, then choose a folder) to one. Measuring the vault root
   * once tells the app which git repository encloses it, so there is no reason to
   * make a person dig through a folder tree.
   *
   * `reason` is one line in human words about **why this folder**, and its basis is
   * measured rather than invented (whether it is a git repository, plus how many
   * of the declared paths actually exist there). With no guess, or low confidence,
   * the caller simply does not pass this prop — and the screen then draws the
   * folder picker alone, as before. **No grey button.**
   */
  projectSourceProposal?: {
    question: string;
    rootPath: string;
    reason: string;
    confirmLabel: string;
    pickOtherLabel: string;
    confidence: "high" | "medium";
  } | null;
  /** Confirm the guessed folder directly, **with no picker** (one click). */
  onProjectSourceConfirmProposal?: () => void | Promise<void>;
}
