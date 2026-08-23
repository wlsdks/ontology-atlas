"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Copy,
  FileText,
  GitBranch,
  MessageCircle,
  MoreHorizontal,
  Orbit,
  Plus,
  X,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { ProjectSourceStatus, ProjectSourceView } from "@/shared/lib/project-source-receipt";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import {
  slugDisplaySegment,
  V2_CONTAINS_SUMMARY_THRESHOLD,
  type V2ConnectionGroupsView,
  type V2ConnectionGroupView,
  type V2DatasheetConnection,
  type V2EvidenceRow,
} from "./topology-v2-datasheet";
import { Button, controlClass, IconButton, LastEditSubjectRow, MtimeConflictBadge, RowButton, Surface } from "@/shared/ui";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * topology-map-v2 "component datasheet" node panel
 * (`docs/TOPOLOGY-V2-DESIGN.md` §5). Rendered ONLY when the
 * `atlas:feature:topology-map-v2` flag is on — the flag-off path keeps the
 * shared `TopologyNodePopover` byte-identical, so the Sigma engine is
 * untouched (lead design decision). Re-presents the SAME selection facts the
 * shared popover derives.
 *
 * Mockup redesign (2026-07-24, owner-approved `mockup-panel-detail.html`):
 * a BALANCED identity header — node name hero (left) + quiet kind badge and
 * close (right), then freshness (left) + a navigable indigo domain chip
 * (right), so neither side is barren for long names. Below, one primary action
 * plus Edit/More disclosure menus replaces the old seven-tile action strip;
 * typed counts live only in their relation-group headers. Then a relations zone with
 * a wide 28px between-group rhythm (`--topology-v2-panel-zone-gap`), each group
 * self-evident: a directional glyph + bold plain label + indigo count chip +
 * underline, rows carrying the canvas kind glyph (no competing kind word).
 * Footer stays sticky: slug (quiet) + ONE indigo-filled primary "full detail".
 * The floating power dot was removed (unexplained mark); `powered` now only
 * feeds the freshness fallback word.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--topology-v2-panel-*` tokens.
 *
 * M-2 count semantics: connection groups are ROLE-based (contains / usedBy /
 * dependsOn / belongsTo) — the SAME four buckets the full-detail surface
 * renders, with each count shown once in its own group header. The fourth
 * bucket (belongs to) was missing here until 2026-07-26,
 * during which time popovers for nodes with only parents (dogfood 75%) said "connected places 0".
 * Containment is its OWN "containing" group/segment (rendered only
 * when non-empty, i.e. container nodes) instead of folding into "depends on" by
 * raw direction — the exact typed-fact collapse the UX round flagged. Group
 * headers reuse `labels.metricContains`/`metricUsedBy`/`metricDependsOn` (no
 * separate group-label strings) so the words match too. (After the redesign the
 * relation TYPE is encoded by the group itself — containing versus depending on — so
 * each row's left mark is the neighbour's canvas kind glyph, not a TraceMark line.)
 *
 * RATIO-SYSTEM §4 scale-up (`docs/prototypes/chrome-datasheet-final.html`,
 * owner: *"the information is good but it's all too small"* — the information is good but it's all
 * too small) promotes a THIRD group — evidence (evidence) — built from the node's own
 * `evidenceIds` (its backing vault doc; see
 * `topology-v2-datasheet.ts#buildV2EvidenceRows`). It reuses
 * `labels.metricEvidence` as its header, the same construction as the usedBy and
 * dependsOn groups, so the metric line's "evidence N" and this group's count never
 * drift. Rows are read-only (no `onSelectConnection` — evidenceIds are vault
 * slugs, a different id namespace than the canvas graph; see that module's doc
 * for why).
 *
 * N6 (persona-ux-2026-07 report — a PM could not get an immediate answer to
 * "which capability does this belong to?", which capability does this belong to): the owning
 * domain used to appear only as a `contains` row inside the "usedBy" (usedBy)
 * connections group, distinguished from `depends_on` rows only by line style
 * (solid versus dashed `TraceMark`) — not a fact a first-time reader would
 * notice. It now renders as its own "domain · <name>" line in the header,
 * clickable through the SAME `onSelectConnection` callback the connection rows
 * use (no new navigation primitive). When the domain is this node's direct
 * parent it also stays as one row in the "belongs to" group below — the header chip
 * is a shortcut to go straight there, and the group is the relation record
 * itself. Dropping the domain from the group alone would make the popover's
 * "belongs to N" disagree with the same number in full detail, which is the worse defect.
 *
 * Toss C2 (plain-language pass, 2026-07-24): the plain labels
 * containing/usedBy/dependsOn/evidence used to sit right next to jargon that undercut
 * them — the sticky footer's raw `slug` (`ontology/capabilities/mcp-server`) and
 * each evidence row's raw vault-path prefix were ALWAYS visible, unreadable to a
 * non-developer. Both now show only the readable leaf segment
 * (`slugDisplaySegment` / `V2EvidenceRow.title`) and fold the full path behind a
 * native `title=` hover tooltip — information is not lost (the "full detail" link
 * already owns navigating to the full record), it just no longer competes for
 * first-read attention with the plain-language facts.
 */

export interface TopologyV2DetailPanelLabels {
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
  /** Project-only source receipt copy, preformatted by the caller. */
  sourceHeading?: string;
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

export interface TopologyV2DetailPanelProps {
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
  labels: TopologyV2DetailPanelLabels;
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
  onClose: () => void;
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

/**
 * **The prescription, right under the diagnosis.** One sentence of "why this is
 * needed" plus one thing to press right there.
 *
 * The box around this position is not decoration but **binding** — the three
 * status lines above are facts, and inside this box is "so what do I do now".
 * The condition for the box appearing *is* "there is something to fix" (the call
 * site's `showSourceRemedy`), so the box itself carries one typed fact
 * (`topGap !== null`).
 *
 * Every value is an existing token — the background and border are the
 * `--topology-v2-panel-action-*` the action strip directly below uses, and the
 * button is the same skin as the previous footer action, **not one character
 * changed**. Zero new tokens.
 */
function ProjectSourceRemedy({
  why,
  actionLabel,
  busyLabel,
  busy,
  onAction,
  degraded,
  proposal,
  onConfirmProposal,
}: {
  why?: string;
  actionLabel?: string;
  busyLabel?: string;
  busy: boolean;
  onAction?: () => void | Promise<void>;
  degraded?: TopologyV2DetailPanelProps["projectSourceDegraded"];
  proposal?: TopologyV2DetailPanelProps["projectSourceProposal"];
  onConfirmProposal?: () => void | Promise<void>;
}) {
  /**
   * With a proposal, **the attention winner changes** — from the generic action
   * "Connect" to the specific question "Is This the Folder? <Path>". So the
   * original single button demotes here into "Choose Another Folder" as **the escape hatch**, and only the confirm button carries indigo
   * (one primary action per box).
   */
  const showProposal = Boolean(onAction && proposal && onConfirmProposal);
  return (
    <div
      data-testid="topology-v2-project-source-remedy"
      data-remedy-mode={
        onAction ? (showProposal ? "proposed" : "actionable") : "degraded"
      }
      // `keep-all` — Korean breaks at any character. The three sentences in this
      // box are guaranteed to wrap at the panel's narrow width, and with default
      // line breaking a word splits down the middle, as in "Here / Found it".
      // (The action strip already uses the same grammar for the same reason —
      // zero values added.)
      className="mt-0.5 flex flex-col gap-2 rounded-chip border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-2.5 py-2 [word-break:keep-all]"
    >
      {why ? (
        <p
          data-testid="topology-v2-project-source-why"
          className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
        >
          {why}
        </p>
      ) : null}
      {showProposal && proposal ? (
        <div
          data-testid="topology-v2-project-source-proposal"
          data-proposal-confidence={proposal.confidence}
          className="flex flex-col gap-1"
        >
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-text-secondary)]">
            {proposal.question}
          </p>
          {/* The path is **an answer, not a long string** — both the leading folder
              context and the final folder name have to survive for the eye to
              confirm "yes, that is my repository". So the middle is folded rather
              than the tail truncated (the same function as the code-location row). */}
          <p
            data-testid="topology-v2-project-source-proposal-path"
            title={proposal.rootPath}
            className="font-mono text-label text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {truncateMiddlePath(proposal.rootPath)}
          </p>
          <p
            data-testid="topology-v2-project-source-proposal-reason"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {proposal.reason}
          </p>
        </div>
      ) : null}
      {onAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {showProposal && proposal && onConfirmProposal ? (
            <button
              type="button"
              onClick={() => { void onConfirmProposal(); }}
              disabled={busy}
              aria-busy={busy}
              data-testid="topology-v2-project-source-confirm"
              className={controlClass({
                shape: "chip",
                size: "lg",
                className:
                  "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
              })}
            >
              {busy ? busyLabel ?? proposal.confirmLabel : proposal.confirmLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { void onAction(); }}
            disabled={busy}
            aria-busy={busy}
            data-testid="topology-v2-project-source-action"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className: showProposal
                ? "shrink-0 border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] text-[color:var(--topology-v2-panel-text-tertiary)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] disabled:cursor-wait"
                : "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
            })}
          >
            {showProposal && proposal
              ? proposal.pickOtherLabel
              : busy ? busyLabel ?? actionLabel : actionLabel}
          </button>
        </div>
      ) : degraded ? (
        <>
          {/* ① Why it does not work on this screen — a reason, not an apology. */}
          <p
            data-testid="topology-v2-project-source-degraded-why"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {degraded.why}
          </p>
          {/* ② Where to go instead — a destination that actually opens, not a sentence. */}
          <Link
            href={degraded.href}
            data-testid="topology-v2-project-source-degraded-cta"
            className={controlClass({
              shape: "chip",
              size: "lg",
              className:
                "w-fit shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
            })}
          >
            {degraded.ctaLabel}
          </Link>
          {/* ③ What does still work here — never say that even what works does not.
              It sits on a tinted background, so the ink starts at tertiary rather
              than quaternary (the `quaternary-ink-surface` contract). */}
          <p
            data-testid="topology-v2-project-source-degraded-still-works"
            className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
          >
            {degraded.stillWorks}
          </p>
        </>
      ) : null}
    </div>
  );
}

function ProjectSourceStatusIcon({ status }: { status: ProjectSourceStatus }) {
  let Icon = CircleHelp;
  let color = "var(--topology-v2-panel-text-tertiary)";
  if (status === "verified_current") {
    Icon = CheckCircle2;
    color = "var(--color-status-success)";
  } else if (status === "invalid") {
    Icon = AlertCircle;
    color = "var(--color-status-danger)";
  } else if (status === "needs_evidence" || status === "review_required") {
    color = "var(--color-status-warning)";
  }
  return (
    <span
      data-source-status-icon={status}
      className="flex shrink-0 items-center justify-center"
      style={{ color }}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

interface DetailActionItem {
  label: string;
  icon: ReactNode;
  testId: string;
  href?: string;
  onSelect?: () => void;
}

function DetailActionMenu({
  label,
  triggerTestId,
  menuTestId,
  iconOnly = false,
  open,
  onOpenChange,
  items,
}: {
  label: string;
  triggerTestId: string;
  menuTestId: string;
  iconOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly DetailActionItem[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onOpenChange]);

  if (items.length === 0) return null;
  const itemClass = controlClass({
    shape: "row",
    size: "sm",
    tone: "secondary",
    className:
      "gap-2 rounded-micro px-2 hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]",
  });
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        data-testid={triggerTestId}
        onClick={() => onOpenChange(!open)}
        className={controlClass({
          shape: iconOnly ? "icon" : "chip",
          size: "md",
          tone: "muted",
          className:
            "border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
        })}
      >
        {iconOnly ? <MoreHorizontal size={ICON_SIZE.md} aria-hidden /> : label}
        {!iconOnly ? (
          <ChevronDown
            size={ICON_SIZE.sm}
            aria-hidden
            className="transition-transform duration-[var(--motion-fast)]"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        ) : null}
      </button>
      <Surface
        open={open}
        origin="top right"
        role="menu"
        data-testid={menuTestId}
        {...transientSurface("menu")}
        className="absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col gap-0.5 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-1 shadow-[var(--topology-v2-panel-shadow)]"
      >
        {items.map((item) =>
          item.href ? (
            <Link
              key={item.testId}
              href={item.href}
              role="menuitem"
              data-testid={item.testId}
              onClick={() => onOpenChange(false)}
              className={itemClass}
            >
              {item.icon}
              {item.label}
            </Link>
          ) : (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                onOpenChange(false);
                item.onSelect?.();
              }}
              className={itemClass}
            >
              {item.icon}
              {item.label}
            </button>
          ),
        )}
      </Surface>
    </div>
  );
}

/**
 * The direction glyph in a relation group's header — the approved mockup's SVG
 * (mockup-panel-detail) carried over verbatim. Containing = ownership downward
 * (hierarchy), Used By = arriving from outside (arrow-in), Leaning On = leaving
 * outward (arrow-out), Belongs To = Containing flipped vertically (same relation, opposite
 * direction), Evidence = a document, Code = `</>`. Drawn in currentColor only, so the
 * ink inherits the parent's `--topology-v2-panel-group-dir` text colour.
 */
function GroupDirIcon({
  variant,
}: {
  variant: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence" | "code";
}) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (variant) {
    case "contains":
      return (
        <svg {...common}>
          <circle cx={12} cy={5} r={2.2} />
          <path d="M12 7v4M12 11H6v3M12 11h6v3" />
          <circle cx={6} cy={17} r={2.2} />
          <circle cx={18} cy={17} r={2.2} />
        </svg>
      );
    case "belongsTo":
      // The "contains" glyph flipped vertically — it says "the same hierarchical
      // relation seen from the opposite direction" through form alone (zero new
      // colours, zero new symbols). Nodes with more than one parent really exist
      // (56 in the dogfood vault), so the upper node is drawn as two.
      return (
        <svg {...common}>
          <circle cx={12} cy={19} r={2.2} />
          <path d="M12 17v-4M12 13H6v-3M12 13h6v-3" />
          <circle cx={6} cy={7} r={2.2} />
          <circle cx={18} cy={7} r={2.2} />
        </svg>
      );
    case "usedBy":
      return (
        <svg {...common}>
          <circle cx={18} cy={12} r={2.4} />
          <path d="M4 12h10M11 8.5l3.5 3.5-3.5 3.5" />
        </svg>
      );
    case "dependsOn":
      return (
        <svg {...common}>
          <circle cx={6} cy={12} r={2.4} />
          <path d="M8.4 12h10M15 8.5l3.5 3.5-3.5 3.5" />
        </svg>
      );
    case "evidence":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4M10 13h5M10 16h5" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
        </svg>
      );
  }
}

/**
 * The shared shell for a relation group — a header with a direction glyph, a bold
 * plain label, an indigo count chip and an underline divider, then the row list
 * below. Rendered in one place so every group (contains / uses / leans on /
 * basis / code location) reads with the same skeleton.
 */
function RelationGroupShell({
  groupKey,
  dir,
  label,
  help,
  count,
  headerExtra,
  children,
}: {
  groupKey: string;
  dir: "contains" | "usedBy" | "dependsOn" | "belongsTo" | "evidence" | "code";
  label: string;
  help?: string;
  count: number;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col" data-datasheet-group={groupKey}>
      <div className="mb-1.5 flex items-center gap-2 border-b border-[color:var(--topology-v2-panel-group-underline)] px-0.5 pb-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--topology-v2-panel-group-dir)]">
          <GroupDirIcon variant={dir} />
        </span>
        <span
          title={help}
          className="text-body font-[var(--font-weight-emphasis)] tracking-[var(--tracking-body)] text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {label}
        </span>
        <span
          data-datasheet-group-total={groupKey}
          className="rounded-chip bg-[color:var(--topology-v2-panel-count-surface)] px-1.5 py-px font-mono text-label leading-label text-[color:var(--topology-v2-panel-count-text)]"
        >
          {count}
        </span>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

export function TopologyV2DetailPanel({
  nodeId,
  slug,
  title,
  sourceTitle = null,
  kind,
  domain,
  powered,
  groups,
  evidence,
  codeLocations,
  updatedAtLabel = null,
  lastEditSubject = null,
  mtimeConflict = false,
  handoffText,
  documentHref,
  meaningEditHref,
  labels,
  onSelectConnection,
  onHoverConnection,
  onHoverEvidence,
  onCopyHandoff,
  onEditRelations,
  onCreateLinked,
  onAskAgent,
  onClose,
  onEnterRealm,
  onOpenFullDetail,
  open,
  onExited,
  className,
  showHandoff = true,
  showSourcePath = true,
  projectSource = null,
  onProjectSourceAction,
  projectSourceBusy = false,
  projectSourceError = null,
  projectSourceDegraded = null,
  projectSourceProposal = null,
  onProjectSourceConfirmProposal,
}: TopologyV2DetailPanelProps) {
  const isProject = kind === "project";
  const showProjectSource = isProject && projectSource !== null;
  /**
   * **The prescription attaches to the diagnosis.** The diagnosis
   * ("No connected code folder" — no code folder is connected) used to sit at
   * y=234 near the top of the panel while its prescription
   * ("Connect a code folder") sat on the very last row at
   * y=647 — 393px apart, with four action tiles and the evidence list in between.
   * On the web that position was not even a button but one grey sentence
   * (measured 2026-08-04). That is what a screen that diagnoses without being
   * able to prescribe looks like.
   *
   * This block appears **only when there is a gap**. Wrapping a state with nothing
   * wrong (`use_current_evidence`) in a box too would strip the box of its meaning
   * — "there is something to fix here". That state's action stays in the footer, as
   * now. So at no moment is the same control drawn in two places.
   */
  const showSourceRemedy = Boolean(
    showProjectSource
    && projectSource.topGap
    && labels.sourceAction
    && (onProjectSourceAction || projectSourceDegraded),
  );
  /**
   * **The remedy box pushes its way in — so the pushing has to be visible.**
   *
   * The moment this box appears differs from the moment the panel opens: the vault
   * root has to be measured before it is settled whether this is a folder picker
   * or "Is this the correct folder?". With conditional rendering alone, the content below jolts
   * aside at that moment, and when it disappears after confirmation there is no way
   * out at all. So it uses the shared in-flow disclosure grammar that pushes its
   * siblings — and the values (curve, duration) come from the single place,
   * `.ai-row-disclosure`.
   */
  const {
    mounted: remedyMounted,
    boxRef: remedyBoxRef,
    contentRef: remedyContentRef,
  } = useRowDisclosure(showSourceRemedy);
  const showInlineHandoff = showHandoff && !(
    showProjectSource && projectSource.nextAction.id === "use_current_evidence"
  );
  const [actionMenu, setActionMenu] = useState<"edit" | "more" | null>(null);
  const canAskAgent = Boolean(onAskAgent && labels.actionAskAgent);
  const editActions: DetailActionItem[] = [
    onEditRelations
      ? {
          label: labels.actionEditRelations,
          icon: <GitBranch size={ICON_SIZE.sm} aria-hidden />,
          testId: "topology-v2-detail-panel-action-edit",
          onSelect: onEditRelations,
        }
      : {
          label: labels.actionEditRelations,
          icon: <GitBranch size={ICON_SIZE.sm} aria-hidden />,
          testId: "topology-v2-detail-panel-action-edit",
          href: meaningEditHref,
        },
    ...(onCreateLinked && labels.actionCreateLinked
      ? [
          {
            label: labels.actionCreateLinked,
            icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-create-linked",
            onSelect: onCreateLinked,
          },
        ]
      : []),
  ];
  const moreActions: DetailActionItem[] = [
    ...(documentHref
      ? [
          {
            label: labels.actionDocument,
            icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-document",
            href: documentHref,
          },
        ]
      : []),
    ...(canAskAgent && showInlineHandoff
      ? [
          {
            label: labels.actionCopyHandoff,
            icon: <Copy size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-handoff",
            onSelect: () => onCopyHandoff(handoffText),
          },
        ]
      : []),
    ...(onEnterRealm
      ? [
          {
            label: labels.actionRealm,
            icon: <Orbit size={ICON_SIZE.sm} aria-hidden />,
            testId: "topology-v2-detail-panel-action-realm",
            onSelect: onEnterRealm,
          },
        ]
      : []),
  ];
  const compactProjectRelations = useViewportBelow(1513);
  const collapseProjectRelations = showProjectSource && compactProjectRelations;
  // Mockup redesign (2026-07-24) — the top stats is one aggregate line. The
  // per-type breakdown belongs to each relation group header's count chip below
  // (one fact, once).
  //
  // Scope correction (2026-07-26) — the sum is built directly from the totals of
  // **the groups actually drawn below**. It used to add only the three `metric.*`
  // values, so the fourth bucket (belongs to) was neither drawn nor counted and a node
  // with only a parent read as "connected places 0". Summing from the same object makes
  // "the top equals the aggregate of the groups below" true by construction rather
  // than by convention.
  const connectedTotal =
    groups.contains.total + groups.usedBy.total + groups.dependsOn.total + groups.belongsTo.total;
  const hasConnections =
    connectedTotal > 0 || evidence.total > 0 || codeLocations.length > 0;

  // S2 part 3 — a long "contains" list folds into a path-prefix summary, and the
  // "View all" toggle unfolds the existing list (session-only state). The slug is
  // used as the key so a node change resets it to the default (summary) — the call
  // site HomePage supplies the key, so it remounts.
  const [showAllContains, setShowAllContains] = useState(false);
  // "+N" expansion — independent per group (if expanding the children also
  // lengthened leans on, the panel would grow everywhere at once). A node change
  // makes the parent build the panel afresh, so this state lives only for that node.
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const [showProjectRelations, setShowProjectRelations] = useState(false);

  /*
   * When the panel disappears, the map's emphasis goes with it.
   *
   * **Pressing** a row while the cursor rests on it changes the node, and the call
   * site swaps the `key` to rebuild the panel entirely — that row leaves the DOM,
   * so `pointerleave` never arrives. The map is then left with an emphasis nobody
   * is pointing at. The latest callback is held in a ref and cleared once on
   * unmount (so it is not turned off and on again every time the callback's
   * identity changes).
   */
  const clearHoverRef = useRef<() => void>(() => {});
  useEffect(() => {
    clearHoverRef.current = () => {
      onHoverConnection?.(null);
      onHoverEvidence?.(null);
    };
  });
  useEffect(() => () => clearHoverRef.current(), []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // Group headers reuse the SAME i18n stems as the metric line
  // (`labels.metricUsedBy`/`labels.metricDependsOn`) — the header count and
  // the metric count are the same number (§module doc), so the words must
  // match too, or the reconciliation reads as a coincidence instead of a
  // guarantee.
  const renderGroup = (
    group: "contains" | "usedBy" | "dependsOn" | "belongsTo",
    dir: "contains" | "usedBy" | "dependsOn" | "belongsTo",
    label: string,
    help: string | undefined,
    view: V2ConnectionGroupView,
  ) => {
    if (view.total === 0) return null;
    const expanded = expandedGroups.has(group);
    const shownRows = expanded ? (view.allRows ?? view.rows) : view.rows;
    const overflow = view.total - view.rows.length;
    // S2 part 3 — a long "contains" defaults to the path-prefix summary, with
    // "View all" for the list. B4 (H1) — when the summary collapses into one
    // "Other" lump (`usable=false`), the summary is skipped and the individual list
    // renders instead (avoiding zero information).
    const useSummary =
      group === "contains" &&
      view.summary !== undefined &&
      view.summary.usable &&
      view.total > V2_CONTAINS_SUMMARY_THRESHOLD &&
      !showAllContains;
    const summaryToggle =
      group === "contains" &&
      view.summary !== undefined &&
      view.summary.usable &&
      view.total > V2_CONTAINS_SUMMARY_THRESHOLD ? (
        <button
          type="button"
          onClick={() => setShowAllContains((v) => !v)}
          data-testid="topology-v2-contains-summary-toggle"
          className={controlClass({
            shape: "link",
            size: "md",
            className:
              "ml-auto shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]",
          })}
        >
          {showAllContains ? labels.containsShowSummary : labels.containsShowAll}
        </button>
      ) : undefined;
    return (
      <RelationGroupShell
        groupKey={group}
        dir={dir}
        label={label}
        help={help}
        count={view.total}
        headerExtra={summaryToggle}
      >
        {useSummary && view.summary ? (
          <ul className="flex flex-col gap-0.5" data-testid="topology-v2-contains-summary">
            {view.summary.groups.map((g) => (
              <li
                key={`contains-summary:${g.key}`}
                className="flex items-center gap-2 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                  {g.key}
                </span>
                <span className="shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {g.count}
                </span>
              </li>
            ))}
            {view.summary.otherCount > 0 ? (
              <li className="flex items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                  {labels.containsOtherGroup}
                </span>
                <span className="shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
                  {view.summary.otherCount}
                </span>
              </li>
            ) : null}
          </ul>
        ) : (
          <ul className="flex flex-col">
            {shownRows.map((row: V2DatasheetConnection) => (
              // Neighbor `id` is unique within a direction group post-dedup
              // (`groupV2ConnectionsByDirection`) — the same neighbor can still
              // appear once per group (mutual dependency, item 5 — no
              // cross-group dedup), which is a different `group` prefix.
              // Per the mockup, a row's left mark is the same kind glyph as the
              // canvas (what it is) — the relation type is already encoded by the
              // group itself (container versus dependent).
              <li key={`${group}:${row.id}`}>
                <RowButton
                  size="md"
                  onClick={() => onSelectConnection(row.id)}
                  /* **The same contract** as hovering a node name in the chat panel
                     (`AcpChatPanel`): the node on pointer enter, null on leave. The
                     cursor is over this panel rather than the canvas, so it does not
                     compete with canvas hover. */
                  onPointerEnter={() => onHoverConnection?.(row.id)}
                  onPointerLeave={() => onHoverConnection?.(null)}
                  data-datasheet-connection={row.id}
                  className="rounded-chip hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]"
                >
                  <TopologyV2KindGlyph kind={row.kind} />
                  <span className="min-w-0 flex-1 truncate text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                    {row.title}
                  </span>
                </RowButton>
              </li>
            ))}
          </ul>
        )}
        {overflow > 0 && !useSummary ? (
          // The "+N" that was a dead number becomes a door — the same lineage as the
          // rejection of "N more capabilities" in the project detail (the 2026-08-12 option B
          // rationale): showing a number with no route to it makes the user leave the
          // map and search again.
          <button
            type="button"
            aria-expanded={expanded}
            data-datasheet-group-overflow={group}
            data-testid={`topology-v2-group-more-${group}`}
            onClick={() =>
              setExpandedGroups((current) => {
                const next = new Set(current);
                if (next.has(group)) next.delete(group);
                else next.add(group);
                return next;
              })
            }
            className={controlClass({
              shape: "link",
              size: "sm",
              className:
                "ml-[34px] mt-0.5 font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
            })}
          >
            {expanded ? labels.groupShowFewer : `+${overflow} ${labels.groupShowMore}`}
          </button>
        ) : null}
      </RelationGroupShell>
    );
  };

  // The evidence group — CLICKABLE doc-link rows (a W2-A promotion: these
  // used to be display-only). `row.id` is a vault slug (see
  // `buildV2EvidenceRows`'s own doc comment), the exact input
  // `buildDocsVaultHref` expects — no separate id-namespace mapping needed
  // (unlike `onSelectConnection`'s canvas-node ids, which are a different
  // namespace). No TraceMark here: these aren't canvas edges. Same header and
  // list shape as usedBy/dependsOn.
  //
  // Toss C2 — `row.path` (the folder prefix, e.g. "capabilities/") used to
  // render as an always-visible mono span next to the title. That is a raw vault
  // path, opaque to a non-developer, sitting right next to the plain "Evidence"
  // label. It now only surfaces through the row's native `title=` hover (the full
  // `row.id` slug) — the row's own link already takes you to the doc, so the path
  // adds nothing a click does not already resolve.
  const renderEvidenceGroup = () => {
    if (evidence.total === 0) return null;
    return (
      <RelationGroupShell
        groupKey="evidence"
        dir="evidence"
        label={labels.metricEvidence}
        help={labels.metricEvidenceHelp}
        count={evidence.total}
      >
        <ul className="flex flex-col">
          {evidence.rows.map((row) => (
            <li key={`evidence:${row.id}`}>
              <Link
                href={buildDocsVaultHref({ slug: row.id })}
                data-datasheet-evidence={row.id}
                /* An evidence document **may not be a node** — if it is not on the
                   map the caller folds it to null and nothing happens (no error either). */
                onPointerEnter={() => onHoverEvidence?.(row.id)}
                onPointerLeave={() => onHoverEvidence?.(null)}
                title={row.id}
                // It must be **the same ramp step** as a connection row
                // (`RowButton`) — row heights diverging inside one panel breaks
                // dimension regularity.
                className={controlClass({
                  shape: "row",
                  size: "md",
                  className:
                    "rounded-chip hover:bg-[color:var(--topology-v2-panel-row-hover)] active:bg-[color:var(--topology-v2-panel-row-active)]",
                })}
              >
                <FileText
                  size={ICON_SIZE.md}
                  aria-hidden="true"
                  className="shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)]"
                />
                <span className="min-w-0 flex-1 truncate text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                  {row.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </RelationGroupShell>
    );
  };

  // The "Code location" group — the node's REAL code evidence (raw file
  // paths), distinct from the "Evidence" group above (a source-doc slug reference).
  // Rows are plain monospace text, not a `Link` or button — raw code paths are not
  // vault nodes, so the clickable-reference visual pattern would misrepresent them
  // as navigable. Each row gets a lightweight copy affordance, since a path is
  // exactly the string an agent or developer wants on the clipboard next.
  const renderCodeLocationsGroup = () => {
    if (codeLocations.length === 0) return null;
    return (
      <RelationGroupShell
        groupKey="code-locations"
        dir="code"
        label={labels.codeLocationsLabel}
        count={codeLocations.length}
      >
        <ul className="flex flex-col">
          {codeLocations.map((path) => (
            <CodeLocationRow
              key={path}
              path={path}
              copyLabel={labels.codeLocationsCopyLabel}
              copiedLabel={labels.codeLocationsCopiedLabel}
            />
          ))}
        </ul>
      </RelationGroupShell>
    );
  };

  return (
    /* `Surface` carries the way out (2026-08-03). The parent (HomePage) used to
       open the window with `usePanelPresence` and dictate the class through a
       `presence` prop, which made «does this surface have an exit» a fact living
       outside this file.

       The `origin` prop is **not given.** This popover's growth origin is not a
       static string but the screen coordinates of the node just clicked, and
       HomePage's positioner injects that as `--topology-chrome-in-origin` (local px
       coordinates) — CSS variables inherit, so overriding `transform-origin` inline
       here would instead make the popover born at a fixed position. The class side's
       `var(--topology-chrome-in-origin, center top)` wins as it is.

       The outer box carries **width only** — the inner box is the scroll container
       (max-height plus overflow-y-auto) and the sticky footer anchors to that
       scrollport, so that role is not moved. */
    <Surface
      open={open}
      onExited={onExited}
      className={["w-[var(--topology-v2-panel-width)]", className ?? ""].join(" ")}
    >
      <div
        role="group"
        aria-label={title}
        {...transientSurface("anchored")}
        data-testid="topology-v2-detail-panel"
        data-selected-node-id={nodeId}
        data-selected-node-kind={kind}
        data-selected-node-title={title}
        data-surface-role="active-node-inspector"
        data-attention-role="supporting-detail"
        data-datasheet-density="instrument"
        onKeyDown={handleKeyDown}
        // P3-③ (2026-07-21 retention round) — this panel is fixed-anchored to
        // `--topology-node-popover-top` (HomePage's positioner) but had no height
        // constraint of its own, so on a node with many connections the content
        // overflowed the viewport and pushed the "Full details" footer off screen,
        // out of the mouse's reach (measured at 1440×900, y=911). A viewport-based
        // max-height plus internal scrolling clamps the panel so it is always
        // anchored wholly inside the viewport. Mockup redesign (2026-07-24) — the
        // root has no padding and acts only as the scroll container, and each zone
        // (identity/ops/relations) carries its own padding. That is what lets the
        // full-bleed zone divider (`zdiv`) and the sticky footer anchor with no
        // negative margins.
        className={[
          // Width is decided by the outer `Surface` (including the consumer
          // className's responsive width override) — here it only fills that width
          // and carries the remaining material.
          "flex w-full flex-col",
          "max-h-[var(--topology-v2-panel-max-height)] overflow-y-auto",
          "rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]",
          "bg-[color:var(--topology-v2-panel-surface)]",
          "shadow-[var(--topology-v2-panel-shadow)]",
        ].join(" ")}
      >
        {/* ZONE 1 · IDENTITY — a balanced header: the name hero (left) plus the kind
            badge and close (right), and below, freshness (left) plus the domain chip
            (right). Both sides carry mass, so no gap opens on the right and it holds
            up for long names too. */}
        <div className="px-[var(--topology-v2-panel-pad)] pt-[15px] pb-4">
          <div className="mb-[11px] flex items-center gap-2.5">
            <h2 className="min-w-0 flex-1 truncate text-title font-[var(--font-weight-strong)] leading-title tracking-title text-[color:var(--topology-v2-panel-text-primary)]">
              {title}
            </h2>
            {/* kind = a badge you read (glyph plus word), the counterweight on the right */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--topology-v2-panel-kind-badge-border)] bg-[color:var(--topology-v2-panel-kind-badge-surface)] py-[3px] pl-[7px] pr-[9px] text-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-label)] text-[color:var(--topology-v2-panel-text-secondary)]">
              <TopologyV2KindGlyph kind={kind} size={12} />
              {labels.kindLabel}
            </span>
            <IconButton
              label={labels.close}
              size="sm"
              onClick={onClose}
              data-testid="topology-v2-detail-panel-close"
              className="-mr-1 text-[color:var(--topology-v2-panel-text-tertiary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:bg-[color:var(--topology-v2-panel-row-active)]"
            >
              <X size={ICON_SIZE.lg} />
            </IconButton>
          </div>
          {showSourcePath && sourceTitle && sourceTitle !== title ? (
            <div
              data-testid="topology-v2-detail-panel-source-path"
              className="mb-2 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)] break-all"
            >
              {sourceTitle}
            </div>
          ) : null}
          {/* For a project source, the OPS rail below takes over the meta position as well. */}
          {!showProjectSource || domain || updatedAtLabel ? (
            <div className="flex items-center justify-between gap-3">
              {!showProjectSource ? (
                updatedAtLabel ? (
                  <span
                    data-testid="topology-v2-datasheet-updated-at"
                    className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]"
                  >
                    {updatedAtLabel}
                  </span>
                ) : (
                  <span className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]">
                    {powered ? labels.poweredOn : labels.poweredOff}
                  </span>
                )
              ) : updatedAtLabel ? (
                <span
                  data-testid="topology-v2-datasheet-updated-at"
                  className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-quaternary)]"
                >
                  {labels.sourceOntologyDocument ? `${labels.sourceOntologyDocument} · ` : ""}
                  {updatedAtLabel}
                </span>
              ) : null}
              {domain ? (
                <button
                  type="button"
                  onClick={() => onSelectConnection(domain.id)}
                  /* **The same affordance** as a relation row (press it and you go to
                     that node), so hover has to match — if only this line did not
                     respond it becomes "why is this one line different". */
                  onPointerEnter={() => onHoverConnection?.(domain.id)}
                  onPointerLeave={() => onHoverConnection?.(null)}
                  aria-label={`${labels.domainLabel} ${domain.title}`}
                  data-testid="topology-v2-detail-panel-domain"
                  className={controlClass({
                    shape: "card",
                    size: "sm",
                    className:
                      "min-w-0 text-left border-[color:var(--topology-v2-panel-domain-border)] bg-[color:var(--topology-v2-panel-domain-surface)] hover:border-[color:var(--topology-v2-panel-domain-border-hover)] hover:bg-[color:var(--topology-v2-panel-domain-surface-hover)]",
                  })}
                >
                  <span className="shrink-0 text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                    {labels.domainLabel}
                  </span>
                  <span className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-domain-text)]">
                    {domain.title}
                  </span>
                  <ChevronRight
                    size={ICON_SIZE.sm}
                    aria-hidden="true"
                    className="shrink-0 text-[color:var(--topology-v2-panel-domain-text)] opacity-65"
                  />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <hr className="h-px border-0 bg-[color:var(--topology-v2-panel-zone-divider)]" />

        {/* ZONE 2 · OPS — the last-edit/conflict row (only with real data) plus the
            plain stats plus the quiet action strip. */}
        <div className="flex flex-col gap-3 px-[var(--topology-v2-panel-pad)] pt-3 pb-2.5">
          {/* rank7 (design-council B5) — last-edit provenance + expected_mtime
              conflict, both gated on real data by the caller. */}
          {lastEditSubject ? (
            <LastEditSubjectRow
              kind={lastEditSubject.kind}
              prefixLabel={labels.editSubjectPrefix}
              subjectLabel={lastEditSubject.kind === "agent" ? labels.editSubjectAgent : labels.editSubjectHuman}
              ageLabel={lastEditSubject.ageLabel}
            />
          ) : null}
          {mtimeConflict ? <MtimeConflictBadge message={labels.editConflictMessage} /> : null}

          {/* A project replaces the same position with the receipt rail. Everything
              else keeps the existing plain stats (one aggregate line). */}
          {showProjectSource ? (
            <div
              data-testid="topology-v2-project-source-receipt"
              data-source-status={projectSource.status}
              data-source-version={projectSource.contractVersion}
              data-source-measured-at={projectSource.measuredAt ?? "unmeasured"}
              data-source-top-gap={projectSource.topGap?.id ?? "none"}
              data-source-action={projectSource.nextAction.id}
              data-source-currentness={projectSource.currentness}
              data-source-cardinality={projectSource.bindingCardinality}
              data-source-layout="status-action-separated"
              data-source-gap-visible={projectSource.topGap !== null}
              aria-live="polite"
              className="flex flex-col gap-2 text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              {labels.sourceHeading ? (
                <span
                  data-testid="topology-v2-project-source-heading"
                  className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--topology-v2-panel-text-secondary)]"
                >
                  {labels.sourceHeading}
                </span>
              ) : null}
              <div className="flex min-w-0 items-center gap-1.5 text-[color:var(--topology-v2-panel-text-secondary)]">
                <ProjectSourceStatusIcon status={projectSource.status} />
                <span className="truncate font-[var(--font-weight-signature)]">{labels.sourceStatus}</span>
                {labels.sourceKind ? (
                  <span className="ml-auto shrink-0 font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
                    {labels.sourceKind}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{labels.sourceMeasuredAt}</span>
                <span className="shrink-0">{labels.sourceCurrentness}</span>
              </div>
              {projectSource.topGap && labels.sourceGap ? (
                <span
                  data-testid="topology-v2-project-source-gap"
                  className="text-[color:var(--topology-v2-panel-text-secondary)]"
                >
                  {labels.sourceGapLabel ? (
                    <span className="font-[var(--font-weight-signature)]">{labels.sourceGapLabel}: </span>
                  ) : null}
                  {labels.sourceGap}
                </span>
              ) : null}
              {projectSourceError ? (
                <span
                  data-testid="topology-v2-project-source-error"
                  className="text-[color:var(--color-status-danger)]"
                >
                  {projectSourceError}
                </span>
              ) : null}
              <div
                ref={remedyBoxRef}
                className="ai-row-disclosure"
                data-state={showSourceRemedy ? "open" : "closed"}
                // It stays in the DOM while collapsing, so it is disabled immediately
                // to keep an invisible button out of tab order and the screen reader.
                inert={!showSourceRemedy}
              >
                {remedyMounted ? (
                  <div ref={remedyContentRef} className="ai-row-disclosure-body">
                    <ProjectSourceRemedy
                      why={labels.sourceWhy}
                      actionLabel={labels.sourceAction}
                      busyLabel={labels.sourceBusy}
                      busy={projectSourceBusy}
                      onAction={onProjectSourceAction}
                      degraded={projectSourceDegraded}
                      proposal={projectSourceProposal}
                      onConfirmProposal={onProjectSourceConfirmProposal}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Only one line outside. Fold the rest into meaning-based menus to limit choices at the moment of reading a node to three. Navigate via the map + ACP global navigation. */}
          <div
            role="group"
            aria-label={labels.actionsGroupLabel}
            data-testid="topology-v2-detail-panel-actions"
            className={showProjectSource
              ? "flex items-center gap-1.5 border-t border-[color:var(--topology-v2-panel-zone-divider)] pt-3"
              : "flex items-center gap-1.5"}
          >
            {canAskAgent ? (
              <Button
                size="sm"
                onClick={onAskAgent}
                aria-label={labels.actionAskAgent}
                title={labels.actionAskAgentTip}
                data-testid="topology-v2-detail-panel-action-ask-agent"
                data-action-role="primary"
                className="min-w-0 flex-1 rounded-card"
              >
                <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionAskAgent}</span>
              </Button>
            ) : showInlineHandoff ? (
              <Button
                size="sm"
                onClick={() => onCopyHandoff(handoffText)}
                aria-label={labels.handoff}
                data-testid="topology-v2-detail-panel-action-handoff"
                data-action-role="primary"
                className="min-w-0 flex-1 rounded-card"
              >
                <Copy size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionCopyHandoff}</span>
              </Button>
            ) : null}
            <DetailActionMenu
              label={labels.actionEditMenu}
              triggerTestId="topology-v2-detail-panel-edit-menu-trigger"
              menuTestId="topology-v2-detail-panel-edit-menu"
              open={actionMenu === "edit"}
              onOpenChange={(next) => setActionMenu(next ? "edit" : null)}
              items={editActions}
            />
            <DetailActionMenu
              label={labels.actionMore}
              triggerTestId="topology-v2-detail-panel-more-menu-trigger"
              menuTestId="topology-v2-detail-panel-more-menu"
              iconOnly
              open={actionMenu === "more"}
              onOpenChange={(next) => setActionMenu(next ? "more" : null)}
              items={moreActions}
            />
          </div>
        </div>

        <hr className="h-px border-0 bg-[color:var(--topology-v2-panel-zone-divider)]" />

        {/* ZONE 3 · RELATIONS — the rhythm between groups is
            `--topology-v2-panel-zone-gap` (28px), far wider than the row spacing
            inside a group, so each typed-fact block reads as its own section
            ("space encodes grouping"). */}
        <div className="flex flex-col gap-[var(--topology-v2-panel-zone-gap)] px-[var(--topology-v2-panel-pad)] py-[18px]">
          {collapseProjectRelations && connectedTotal > 0 ? (
            <div
              data-testid="topology-v2-project-relations-summary"
              data-source-relations-expanded={showProjectRelations}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              {groups.contains.total > 0 ? (
                <span>
                  {labels.metricContains}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.contains.total}
                  </b>
                </span>
              ) : null}
              {groups.usedBy.total > 0 ? (
                <span>
                  {labels.metricUsedBy}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.usedBy.total}
                  </b>
                </span>
              ) : null}
              {groups.dependsOn.total > 0 ? (
                <span>
                  {labels.metricDependsOn}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.dependsOn.total}
                  </b>
                </span>
              ) : null}
              {groups.belongsTo.total > 0 ? (
                <span>
                  {labels.metricBelongsTo}
                  <b className="ml-1 font-[var(--font-weight-strong)] tabular-nums text-[color:var(--topology-v2-panel-text-secondary)]">
                    {groups.belongsTo.total}
                  </b>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setShowProjectRelations((value) => !value)}
                aria-expanded={showProjectRelations}
                className={controlClass({
                  shape: "link",
                  size: "md",
                  className:
                    "ml-auto shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)] active:text-[color:var(--topology-v2-panel-text-primary)]",
                })}
              >
                {showProjectRelations
                  ? labels.sourceRelationsHide ?? labels.containsShowSummary
                  : labels.sourceRelationsShow ?? labels.containsShowAll}
              </button>
            </div>
          ) : null}
          {hasConnections ? (
            <>
              {!collapseProjectRelations || showProjectRelations ? (
                <>
                  {renderGroup("contains", "contains", labels.metricContains, labels.metricContainsHelp, groups.contains)}
                  {renderGroup("usedBy", "usedBy", labels.metricUsedBy, labels.metricUsedByHelp, groups.usedBy)}
                  {renderGroup("dependsOn", "dependsOn", labels.metricDependsOn, labels.metricDependsOnHelp, groups.dependsOn)}
                  {/* Belongs to — placed last, in the same order as full detail
                      (container → used by → depends on → belongs to), so someone moving
                      between the two surfaces meets the same word in the same place. */}
                  {renderGroup("belongsTo", "belongsTo", labels.metricBelongsTo, labels.metricBelongsToHelp, groups.belongsTo)}
                </>
              ) : null}
              {renderEvidenceGroup()}
              {renderCodeLocationsGroup()}
            </>
          ) : (
            <span className="text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
              {labels.noConnections}
            </span>
          )}
        </div>

        {/* Footer (sticky) — the slug (left, last segment only; the full value on
            `title=` hover) plus the indigo-filled primary 「All Details」 (the one and
            only emphasis). The root is an unpadded scroll container, so it anchors
            with `sticky bottom-0` and no negative margins — it stays inside the
            viewport even when the content overflows (P3-③). */}
        <div
          data-testid="topology-v2-detail-panel-footer"
          className="sticky bottom-0 flex items-center gap-2.5 rounded-b-[var(--topology-v2-panel-radius)] border-t border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-[var(--topology-v2-panel-pad)] py-[11px]"
        >
          {!showProjectSource ? (
            <span
              data-testid="topology-v2-detail-panel-slug"
              title={slug}
              className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
            >
              {slugDisplaySegment(slug)}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {onOpenFullDetail ? (
            <button
              type="button"
              onClick={onOpenFullDetail}
              data-testid="topology-v2-detail-panel-open-full-detail"
              className={showProjectSource
                ? controlClass({
                    shape: "link",
                    size: "lg",
                    className:
                      "touch-hit-expand shrink-0 text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
                  })
                : controlClass({
                    shape: "card",
                    size: "sm",
                    className:
                      "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)]",
                  })}
            >
              {labels.openFullDetail}
            </button>
          ) : null}
          {/* The action for when there is a gap was taken by the remedy block above —
              what remains here is one quiet action for the "nothing to do" state. */}
          {showProjectSource && labels.sourceAction && !showSourceRemedy ? (
            onProjectSourceAction ? (
              <button
                type="button"
                onClick={() => { void onProjectSourceAction(); }}
                disabled={projectSourceBusy}
                aria-busy={projectSourceBusy}
                data-testid="topology-v2-project-source-action"
                className={controlClass({
                  shape: "chip",
                  size: "lg",
                  className:
                    "shrink-0 font-[var(--font-weight-emphasis)] border-[color:var(--topology-v2-panel-primary-border)] bg-[color:var(--topology-v2-panel-primary-surface)] text-[color:var(--topology-v2-panel-primary-text)] hover:border-[color:var(--topology-v2-panel-primary-border-hover)] hover:bg-[color:var(--topology-v2-panel-primary-surface-hover)] disabled:cursor-wait",
                })}
              >
                {projectSourceBusy ? labels.sourceBusy ?? labels.sourceAction : labels.sourceAction}
              </button>
            ) : (
              <span className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-secondary)]">
                {labels.sourceAction}
              </span>
            )
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

/**
 * One 「Code Location」 row — a raw code path (middle truncated, full
 * path on hover) plus a per-row copy button. A dedicated component rather than
 * inline in the map callback, because each row owns its OWN copy-feedback state
 * (`useCopyFeedback`) — copying one path must not flip every row's icon.
 */
function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li
      data-datasheet-code-location={path}
      className="flex min-h-[32px] w-full items-center gap-2 rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-2"
    >
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={state === "copied" ? copiedLabel : copyLabel}
        size="sm"
        onClick={() => void copy(path)}
        data-testid="topology-v2-detail-panel-code-location-copy"
        className="text-[color:var(--topology-v2-panel-text-quaternary)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
