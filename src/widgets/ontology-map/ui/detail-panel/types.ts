import type { RefObject } from "react";
import type { ProjectSourceView } from "@/shared/lib/project-source/project-source-receipt";
import type { V2ConnectionGroupsView, V2EvidenceRow } from "./map-datasheet";

export interface OntologyMapDetailPanelLabels {
  kindLabel: string;
  /** N6 — the prefix label for the first-class "owning domain" fact ("domain · <name>"). */
  domainLabel: string;
  poweredOn: string;
  poweredOff: string;
  /** M-2 — "containing" (contains). Only rendered for container nodes. */
  metricContains: string;
  /** S2 part 3 — the toggle label that unfolds summary mode into the individual list ("show all" — show all). */
  containsShowAll: string;
  /** S2 part 3 — the toggle label that folds the list back into the summary ("show summary" — show summary). */
  containsShowSummary: string;
  /** S2 part 3 — the remainder bucket's label in the path-prefix summary ("other" — other). */
  containsOtherGroup: string;
  /** The expand label appended after a group's "+N" ("show more" — show more), so the +N is not a dead number. */
  groupShowMore: string;
  /** The label that returns an expanded group to its capped state ("Collapse"). */
  groupShowFewer: string;
  metricUsedBy: string;
  metricDependsOn: string;
  /**
   * "Belongs To" — what contains this node. It uses the same word as
   * full detail (both come from the `edgeTypesPlain.belongs_to` family).
   */
  metricBelongsTo: string;
  metricEvidence: string;
  /**
   * H1 B2/A — One-line hover explanation for the typed-fact group label (non-developer language) + scope
   * specification (based on "direct" connections). Exposed only via the `title` attribute — no icon/extra surface.
   * If undefined, renders without a title (backward compatible).
   */
  metricContainsHelp?: string;
  metricUsedByHelp?: string;
  metricDependsOnHelp?: string;
  metricBelongsToHelp?: string;
  metricEvidenceHelp?: string;
  noConnections: string;
  handoff: string;
  close: string;
  /** "Full Detail" (full detail) — the opt-in link to the A1 full-detail datasheet
   * (`full-detail-a1` widget), the design gate's details-on-demand step beyond
   * this compact ego popover. */
  openFullDetail: string;
  /** Action row that groups the primary action with the edit/more menu. */
  actionsGroupLabel: string;
  actionDocument: string;
  actionEditRelations: string;
  actionEditMenu: string;
  actionMore: string;
  /** Build on this concept **to create a new concept** — do not leave the map. */
  actionCreateLinked?: string;
  actionCopyHandoff: string;
  /**
   * S7 Seam — where to verbally instruct the agent about this concept. Optional
   * because in environments without an agent panel (web build, legacy consumers), neither label nor handler
   * appear; there, handoff copy becomes the primary action.
   */
  actionAskAgent?: string;
  /** S4 "Area Expansion" secondary discovery path action label ("Area Expansion"). */
  actionRealm: string;
  /**
   * Result-description tooltip for the primary action. Since touch has no hover, the tooltip is auxiliary;
   * the label and aria are the self-sufficient core.
   */
  actionAskAgentTip?: string;
  /** "Code Location" — the real code-location group (`codeLocations` prop),
   * distinct from the "Evidence" group above (source-doc reference). */
  codeLocationsLabel: string;
  codeLocationsCopyLabel: string;
  codeLocationsCopiedLabel: string;
  /** rank7 (design-council B5) — the 「Last Edited」 (last edited) subject row plus
   *  the expected_mtime conflict badge copy. It reuses the `editProvenance` i18n
   *  namespace (single source). */
  editSubjectPrefix: string;
  editSubjectAgent: string;
  editSubjectHuman: string;
  editConflictMessage: string;
  /** Summary-freshness row copy (`summaryFreshness` i18n namespace), preformatted by
   *  the caller. Present only when the caller can derive a verdict — the browser has no
   *  Git history, so these stay undefined there and the row never mounts. */
  summaryFreshnessPrefix?: string;
  summaryFreshnessLag?: string;
  summaryFreshnessAction?: string;
  summaryHistoryUnavailable?: string;
  /** Project-only source receipt copy, preformatted by the caller. */
  sourceHeading?: string;
  /** The status line while the receipt is still being read (`projectSourceLoading`). */
  sourcePending?: string;
  sourceKind?: string;
  sourceStatus?: string;
  sourceMeasuredAt?: string;
  sourceCurrentness?: string;
  sourceGap?: string;
  sourceGapLabel?: string;
  sourceAction?: string;
  /**
   * The one **why** sentence that sits right beside the diagnosis, written in
   * plain words about what the next action makes possible ("Code Folder" — code
   * folder — and "Code Location"; nothing like "source binding"). The caller picks it
   * by `nextAction.id`, and all eight actions have a match.
   */
  sourceWhy?: string;
  sourceRelationsShow?: string;
  sourceRelationsHide?: string;
  sourceOntologyDocument?: string;
  sourceBusy?: string;
}

export interface OntologyMapDetailPanelProps {
  /** Canonical `kind:slug` handle used by URL state and installed-app proof. */
  nodeId: string;
  slug: string;
  title: string;
  /**
   * Slice B (humanising element labels) — a mono subline that preserves the
   * original when `title` has been transformed for display (an element node's raw
   * code path turned into a human name like "Bar Baz"). The caller passes it only
   * when display differs from the raw title; identical values are omitted (or
   * null) so nothing renders twice.
   */
  sourceTitle?: string | null;
  kind: string;
  /**
   * N6 (persona-ux-2026-07 report — the PM persona's first question, "which does
   * this belong to?", had no immediate answer) — the owning domain, or null when
   * the node has none (it IS a domain, or it is an orphan). Rendered as a
   * first-class "Domain · <Name>" fact in the header, separate from the "Used By"
   * connections list it used to be buried in (containment versus depends_on,
   * distinguished there only by line style). Clicking focuses the domain through
   * the same `onSelectConnection` callback the connection rows already use.
   */
  domain: { id: string; title: string } | null;
  /**
   * Set when this node is a `domain` or `project` whose containment list changed after
   * its description was last written — the caller derives it from the summary clock scan
   * over `vault_node_revisions`. Null for every other node, and null everywhere in the
   * browser, where there is no Git history to read. Advisory: it mounts one plain row
   * and offers no fix, because the body is a human judgement.
   */
  summaryStaleness?: { behindByDays: number } | null;
  summaryHistoryUnavailable?: boolean;
  /** "Power" (power) — powered (recently updated, fresh) versus unpowered (quiet). */
  powered: boolean;
  /**
   * Connections grouped by relation type, each with a capped row preview + the
   * group's true total — so a contains-hub's depends group renders its real
   * count instead of collapsing into a generic overflow.
   *
   * This is the single source of **every** relation count this panel draws
   * (2026-07-26). A separate `metric` prop used to hold another copy of the same
   * numbers, and any bucket missing from that copy also dropped silently out of
   * the aggregate above. Binding what is counted to what is drawn removes
   * "counting what is not drawn, or not drawing what is counted" at the type level.
   */
  groups: V2ConnectionGroupsView;
  /** The 「Evidence」 (evidence) group — the node's own backing vault doc(s),
   * RATIO-SYSTEM §4 promotion. Rows built by `buildV2EvidenceRows`; empty when
   * the node has no `evidenceIds` (which hides the group entirely, the same
   * convention as usedBy/dependsOn). */
  evidence: { rows: readonly V2EvidenceRow[]; total: number };
  /**
   * "Code Location" — the node's REAL code evidence: raw file paths
   * (`src/foo/bar.ts`), not the self-referential vault-doc slug in `evidence`
   * above. Built by `deriveCodeLocations` from the node's own title (when it is a
   * path-titled element) plus its direct `contains` children. Empty hides the
   * section — never fabricated.
   */
  codeLocations: readonly string[];
  /**
   * S-C1 (owner 2026-07-20: *"A change date or something? Otherwise you can't tell them apart"* — a change
   * date, something like that, otherwise you can't tell them apart) — the
   * pre-formatted "when did it change" label ("Today" / "3 days ago", or null when the
   * node has no backing doc date). Formatting lives in the caller so the label
   * passes through the same i18n path as every other string here.
   */
  updatedAtLabel?: string | null;
  /**
   * rank7 (design-council B5) — last-edit provenance, pre-resolved by the
   * caller (`resolveNodeLastEditSubject`) from real data only (a fresh
   * agent heartbeat attributed to this node, or a same-session self-write
   * record). `null` when neither source has evidence — the row is not
   * rendered (no fabrication). Human vs AI is the `kind` field only, never
   * a color.
   */
  lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
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
   * While the cursor is over a relation row, point at that node **on the map**
   * (owner instruction, 2026-08-17: *"It would be nice if hovering each of these made it glint on the map beside it; right now nothing responds."* — hovering
   * each of these should make it glint on the map beside it; right now nothing
   * responds).
   *
   * **Mind the namespace** — the value passed here is the **canvas node id**
   * (`domain:example-domain`), the same as `onSelectConnection`. Evidence
   * document rows are a different namespace (a vault slug) and go out separately
   * through `onHoverEvidence`. Merging the two into one callback repeats exactly
   * the accident `chat-node-index.ts` recorded — where two namespaces met with no
   * check, and the feature survived as wiring while being dead.
   *
   * Omitted, nothing happens (the previous behaviour).
   */
  onHoverConnection?: (id: string | null) => void;
  /**
   * Evidence document row hover — it passes a **vault slug**
   * (`capabilities/mcp-server`). If that node is on the map it is pointed at; if
   * not (a document need not be a node) the caller folds it to null. That
   * decision belongs to the caller — this panel does not know which nodes the map
   * carries.
   */
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
  /** Open the shared meaning context without sending a model request. */
  meaningReview?: { label: string; onOpen: () => void };
  discoveryAction?: { label: string; onOpen: () => void };
  /** Hide this panel's filled action while another surface owns the primary next step. */
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
   * Whether it is open. This panel **carries its own entry and exit** — `<Surface>`
   * owns the exit window (`EXIT_WINDOW_MS`), the exit class
   * (`.topology-chrome-out`), `inert` and `pointer-events-none`, so the consumer
   * has nothing to arrange again.
   *
   * `presence: "entering" | "exiting"` used to be **computed by the parent** and
   * passed down. Then the exit window's timer lived in the parent, and reading
   * this file alone could not tell you whether this surface had a way out (the
   * hard-cut ratchet's detector could not see it either). The window belongs to
   * the surface.
   */
  open: boolean;
  /**
   * Once, **after** the exit finishes. Used as the signal to take down the
   * parent's positioner — with two exit timers there is no telling which is true,
   * so the window exists only here and the parent is notified of its end.
   */
  onExited?: () => void;
  className?: string;
  /**
   * Slice C (developer/non-developer mode toggle) — handoff copy action. Default `true`.
   * In non-developer (plain) mode, HomePage passes `false` to hide the developer chrome.
   */
  showHandoff?: boolean;
  /**
   * Slice C — the raw path subline (slice B, `sourceTitle`). Defaults to `true`;
   * `false` in non-dev (plain) mode, because a code path is developer vocabulary.
   */
  showSourcePath?: boolean;
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
   * **Honest degradation** — passed only when this surface cannot perform that
   * action (on the web, the browser does not know the absolute path of the folder
   * it was given). It carries all three things `surfaces.md` requires: why it does
   * not work · where it does · **and what does work here**.
   *
   * This position used to be a single grey sentence, "You can connect a code folder in the installed app" — not a
   * link, with no reason, and no word about what works on this screen. That is
   * what a screen that diagnoses without prescribing looks like.
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
