"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { badgeClass } from "@/shared/ui/badge-class";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { EvidenceOnlyBadge } from "@/shared/ui/evidence-only-badge";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";
import type { DoNextReviewState } from "../../lib/review-loop";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import {
  queueGroupOrder,
  queueGroupOrderKey,
  sumQueueGroupCounts,
  type QueueWorkGroup,
} from "../../lib/queue-work-groups";
import {
  HandoffCopyButton,
  RowActionMenu,
  type QueueRowAbilities,
  type QueueRowActionLabels,
} from "../parts/QueueRowActions";
import type { MeaningGapKind } from "@/entities/knowledge-graph";
import { MeaningGapSection, type MeaningGapLabels } from "./MeaningGapSection";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { controlClass } from "@/shared/ui/control-class";

/**
 * The finished class for the **quiet toggle** that opens "the rest, folded away".
 *
 * There are two of them in this tab (remaining duplicates, remaining repair queue), and
 * the same grammar appears in the "connections" tab's impact ranking and the "freshness"
 * tab's evidence layer — the same kind of truncation must look the same, so the values
 * must not diverge. Shape, size, and colour come from the ramp (`row`/`sm`/`default` =
 * 28px · text-label · tertiary); what remains here is the **hover ink** the ramp
 * deliberately omits and this slot's **negative margin**.
 *
 * `-mx-2` pairs with the ramp's inset (`px-2`) — it widens only the hit area sideways
 * while keeping the text's x position aligned with the sibling rows.
 */
const QUIET_REST_TOGGLE = controlClass({ hoverInk: 'strong', hoverSurface: 'lift',
  shape: "row",
  size: "sm",
  className: "-mx-2 mt-1",
});

/**
 * The **minimum width (px) a non-zero segment may have** in the readiness meter.
 *
 * Segments are divided by `flexGrow` alone, so at a ratio like "1 error · 200 ready" the
 * risk segment falls below 1px and becomes **indistinguishable from zero**. An instrument
 * that draws «no risk» and «very little risk» as the same picture is decoration, not an
 * instrument. 4px is the smallest piece visible in a 2px-tall bar, and it is not applied
 * when the value is 0 — zero really must be absent.
 */
const READINESS_MIN_SEGMENT_PX = 4;

function meterSegmentStyle(value: number, hasData: boolean) {
  return {
    flexGrow: value,
    minWidth: hasData && value > 0 ? READINESS_MIN_SEGMENT_PX : 0,
  };
}

/**
 * Tab 1, "to do" — the insights default tab. It answers "so what should I do?" rather
 * than "what is here?" (inventory):
 *
 * 1. The agent-readiness meter plus a repair-queue summary, moved here from the relations
 *    tab — burying the actionable element inside an inventory tab was the cause of the
 *    "not enough insight" feeling.
 * 2. The action queue — neglected hubs (degree × days idle), orphans, promotion
 *    candidates. Each row offers [view on the map · open the builder · hand to an agent
 *    (copies a per-row MCP handoff)].
 *
 * Automation contract: the precise ranking (`maintenance_plan`) is never reimplemented on
 * the client — a person chooses here and execution is handed to an agent through the
 * per-row handoff.
 */

export interface DoNextTabLabels extends QueueRowActionLabels {
  agentReadinessTitle: string;
  /** One plain-language line under the readiness band title, unpacking the jargon (ready/preflight/review) for a non-specialist. Same slot pattern as the queue hint. */
  agentReadinessHint?: string;
  agentReadinessReady: string;
  agentReadinessPreflight: string;
  agentReadinessReview: string;
  /** The name of the third figure — "blocked", not "needs review". It counts relations and documents together. */
  agentReadinessBlocked: string;
  /** One line breaking down what is blocked. Two units are summed, so they must always be stated together. */
  agentReadinessBlockedBreakdown: (documents: number, relations: number) => string;
  repairQueueTitle: string;
  repairQueueStale: string;
  repairQueueOrphan: string;
  repairQueuePromotion: string;
  repairQueueIsland: string;
  repairQueueMissingContainment: string;
  repairQueueEmpty: string;
  repairQueueActionKindStale: string;
  repairQueueActionKindOrphan: string;
  repairQueueActionKindPromotion: string;
  repairQueueActionKindIsland: string;
  repairQueueActionKindContainment: string;
  repairQueueOpenBuilder: string;
  repairQueueOpenOntology: string;
  repairQueueRestShow: (count: number) => string;
  repairQueueRestHide: string;
  queueTitle: string;
  sectionNeglectedHub: string;
  sectionOrphan: string;
  sectionPromotion: string;
  sectionCycle: string;
  sectionDuplicate: string;
  /** One plain-language line for the duplicates section — "why fix this now". */
  hintDuplicate: string;
  /** How much the two names overlap ("79% overlap"). */
  duplicateMetric: (percent: number) => string;
  /** The quiet toggle that opens the folded remaining pairs. */
  duplicateRestShow: (count: number) => string;
  duplicateRestHide: string;
  /** States honestly the truncation that remains even when expanded — same grammar as the "connections" tab. */
  duplicateTruncated: (shown: number, total: number) => string;
  /** One plain-language line under each queue section header, so a non-specialist knows why it is a to-do. */
  hintNeglectedHub: string;
  hintOrphan: string;
  hintPromotion: string;
  /** The evidence figure on a promotion row ("{count} references"). */
  promotionMetric: (count: number) => string;
  /** How omitted nodes are marked when a path is truncated at `maxPathNodes`. */
  cycleMoreNodes: (count: number) => string;
  neglectedHubMetric: (degree: number, agoDays: number) => string;
  cycleMetric: (length: number) => string;
  openMap: string;
  emptyQueue: string;
  /**
   * The "mine / to hand off" group headings — the same data ordered in human language.
   * A writable session and a read-only session use different sentences (the former "right
   * now", the latter "what would make this fixable").
   */
  groupMeaningTitle: string;
  groupMeaningTitleReadOnly: string;
  groupMeaningHint: string;
  groupMeaningHintReadOnly: string;
  groupCodeTitle: string;
  groupCodeHint: string;
  moreCount: (count: number) => string;
  digestTitle: string;
  digestToday: (count: number) => string;
  digestApproveHint: string;
  /** Prefix before the why row ("Why · "). */
  digestWhyPrefix: string;
  /** Title of the top priority-review band. */
  touchUpBandTitle: string;
  /** Not a completion count — the size of the currently truncated priority review queue. */
  touchUpPriorityCount: (count: number) => string;
  /** The real order of work, stated so starting is not confused with finishing. */
  touchUpFlowHint: string;
  reviewChecking: (title: string | null) => string;
  reviewActive: (title: string | null) => string;
  reviewCleared: (title: string | null) => string;
  reviewUnverified: (title: string | null) => string;
  /**
   * The evidence-layer badge — it comes from the **same i18n key** as the "connections"
   * tab's ranking and hubs. Calling one fact by different names per surface makes a user
   * read it as two facts.
   */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

/**
 * One row of the "today's touch-ups" band. The result of `pickTodaysTouchUps` is given a
 * display `why` string by the caller (the pure function knows only the reason; the surface
 * knows the copy).
 */
export interface DoNextTouchUp {
  id: string;
  source: "cycle" | "neglected-hub" | "promotion";
  nodeId: string;
  title: string;
  nodeKind: string;
  /** One line of "why was this picked" — display copy assembled from existing derived values. */
  why: string;
  handoffPayload: string;
}

interface DoNextTabAgentReadiness {
  ready: number;
  preflight: number;
  review: number;
  /**
   * The total of what an agent **cannot use right now** — unevidenced relations (`review`)
   * plus documents that failed validation. This is what the meter's risk segment and the
   * third figure read. While it read only `review`, a folder with five errors reported
   * "0 needs review".
   */
  blocked: number;
  /** The validation-error share of `blocked` — the value that lets the breakdown be stated beside the total. */
  blockedDocuments: number;
}

interface DoNextTabHealthQueue {
  staleCount: number;
  orphanCount: number;
  promotionCount: number;
  // C1 — CLI-parity signals (`node $ATLAS/cli/src/index.mjs health`): disconnected actionable
  // islands · capability/element whose domain never links back.
  islandCount: number;
  missingContainmentCount: number;
  actionTarget: OntologyHealthActionTarget | null;
  /** Every CLI-parity repair target. Only the first row is always visible; the rest expand in the same card. */
  actionTargets: readonly OntologyHealthActionTarget[];
  builderHref: (slug: string) => string;
  ontologyHref: (slug: string) => string;
}

export interface DoNextTabProps {
  /**
   * The «way to open a folder» placed in the group heading when the session is read-only
   * (the example folder).
   *
   * **Why the component is not called directly here**: this component is pure display and
   * receives all its copy through `labels` (which is why its unit tests render without a
   * provider). Calling a context-reading component inside would break that design — and it
   * really did, with five tests failing on «provider not found». The page supplies the path.
   */
  openVaultAction?: ReactNode;
  queue: DoNextQueue;
  /**
   * Today's touch-ups — the top three truncated from the existing queue and cycles. An
   * empty array renders no band (the cold-start guard is already applied by
   * `pickTodaysTouchUps`). Defaults to `[]`, so it works with no band at all.
   */
  touchUps?: DoNextTouchUp[];
  /** Dependency cycles (loops in the directed `depends_on` graph). Rendered only when cycles exist. */
  cycles: DependencyCyclesResult;
  /**
   * Suspected duplicate pairs, truncated to the display limit. An empty array renders no
   * section. The similarity is the same computation as MCP `similar_nodes`, so the screen
   * and the agent name the same pairs
   * (`tests/contract/duplicate-pairs.contract.test.ts`).
   */
  duplicates?: DuplicatePairRow[];
  /** The folded remaining duplicate pairs — the layer that makes the scale the badge states actually reachable. */
  duplicateRest?: DuplicatePairRow[];
  /** Total pairs above the threshold — the pre-truncation scale. */
  duplicateTotal?: number;
  /** The per-pair handoff — a sentence starting from a `merge_concepts` dry run. */
  duplicateHandoff?: (row: DuplicatePairRow) => string;
  agentReadiness: DoNextTabAgentReadiness;
  healthQueue: DoNextTabHealthQueue;
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  /**
   * The address that hands a meaning-gap row to the map's agent. It is not supplied where
   * there is no agent panel, and the item then does not appear at all.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  /** Cycle path node id → display title. */
  nodeTitle: (nodeId: string) => string;
  /** The per-cycle agent handoff payload, for copying. */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /**
   * A digest of the local audit log (`.ontology-atlas/activity.jsonl` tail). Null renders
   * no card at all (static/dogfood mode has no log).
   * Automation contract: the agent executes and the person approves through a git diff —
   * this card reports what was done and is not a control surface.
   */
  activityDigest: {
    todayCount: number;
    latest: ReadonlyArray<{ at: string; summary: string; agent: string | null; why?: string | null }>;
  } | null;
  /**
   * What this session can do right now — the only input to the group order and the action
   * labels. It is a capability, not a role (`session-abilities.ts`). The default is the
   * can-do-nothing side, so a call site that omits it (a test, say) never opens a form by
   * itself.
   */
  abilities?: QueueRowAbilities;
  /**
   * Work that ends in one sentence — undefined meaning, unassigned parent. It is computed
   * only when vault document facts exist, hence optional (omitted means no section at all).
   */
  meaningGaps?: {
    definitionRows: MeaningGapRow[];
    domainRows: MeaningGapRow[];
    counts: { missingDefinition: number; missingDomain: number };
    domainChoices: DomainChoice[];
    onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
    definitionLabels: MeaningGapLabels;
    domainLabels: MeaningGapLabels;
  } | null;
  labels: DoNextTabLabels;
}

/**
 * The group heading — the face of "mine first". It is drawn one ink step above the section
 * header (the question) so the page reads as two levels rather than three (card → group →
 * section): the queue card's own title is now carried by these headings and is not drawn
 * separately, so "now" never appears twice in the same place.
 *
 * It holds the title, the count, a one-line hint, and **the path that does what the hint
 * asks for**.
 *
 * `action` arrives only in the read-only (example folder) state. There the heading says
 * *"open your own folder and you can finish these right here"*, yet measured 2026-08-07,
 * **zero** of this screen's 25 controls opened a folder — a **dead-end CTA**, a screen
 * telling you to do something you cannot do on it.
 *
 * The path appears **once per screen, not once per group**. Attaching it per row repeats
 * one prescription seven times, and this repository's rule is *"a prescription lives in
 * exactly one place"*.
 */
function WorkGroupHeading({
  title,
  count,
  hint,
  testId,
  action,
}: {
  title: string;
  count: number;
  hint: string;
  testId: string;
  action?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
          {title}
        </InsightsSectionTitle>
        <span
          data-testid={`${testId}-count`}
          className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]"
        >
          {count}
        </span>
        {action ? <span className="ms-auto self-center">{action}</span> : null}
      </div>
      <p className="text-body leading-body text-[color:var(--color-text-quaternary)]">{hint}</p>
    </div>
  );
}

/**
 * Today's touch-ups band, at the top of the to-do tab. It shows the three items truncated
 * from the existing queue and cycles with a one-line "why it was picked", and narrows the
 * actions to a primary one (the map) plus a kebab.
 * Opening the map or copying a handoff is never treated as completion. This band explains
 * priority and links only the real order of work; the source of truth for completion is the
 * vault diff and validation.
 */
function TouchUpBand({
  items,
  mapHref,
  sourceHref,
  builderHref,
  reviewState,
  onReviewStart,
  registerReviewRow,
  abilities,
  labels,
}: {
  items: DoNextTouchUp[];
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  return (
    <section
      aria-label={labels.touchUpBandTitle}
      data-testid="do-next-touchups"
      className="flex flex-col gap-2 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)]"
    >
      <div className="flex items-baseline gap-2">
        <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
          {labels.touchUpBandTitle}
        </InsightsSectionTitle>
        <span
          data-testid="do-next-touchups-priority-count"
          className="ml-auto font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]"
        >
          {labels.touchUpPriorityCount(items.length)}
        </span>
      </div>
      <p
        data-testid="do-next-touchups-flow"
        className="text-body leading-body text-[color:var(--color-text-quaternary)]"
      >
        {labels.touchUpFlowHint}
      </p>
      <div className="flex flex-col">
        {items.map((item) => {
          const candidate = { id: item.id, title: item.title };
          const active =
            reviewState?.phase === "active" && reviewState.id === item.id;
          return (
            <div
              key={item.id}
              ref={(element) => registerReviewRow?.(item.id, element)}
              data-testid="do-next-touchup-row"
              tabIndex={-1}
              aria-current={active ? "step" : undefined}
              className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
                active
                  ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                  : ""
              }`}
            >
              {item.source === "cycle" ? (
                <AlertTriangle size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-warning)]" />
              ) : (
                <TopologyV2KindGlyph kind={item.nodeKind} size={13} />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body text-[color:var(--color-text-secondary)]">
                  {item.title}
                </span>
                <span className="truncate text-body text-[color:var(--color-text-quaternary)]">
                  {labels.digestWhyPrefix}
                  {item.why}
                </span>
              </div>
              <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
                <Link
                  href={mapHref(item.nodeId, item.id)}
                  onClick={() => onReviewStart?.(candidate)}
                  className={controlClass({
                    shape: "chip",
                    size: "md",
                    className:
                      "hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
                  })}
                >
                  {labels.openMap}
                </Link>
                <RowActionMenu
                  sourceHref={sourceHref(item.nodeId, item.id)}
                  builderHref={builderHref(item.nodeId, item.id)}
                  handoffPayload={item.handoffPayload}
                  candidate={candidate}
                  onReviewStart={onReviewStart}
                  abilities={abilities}
                  labels={labels}
                />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QueueSection({
  title,
  hint,
  rows,
  totalCount,
  metric,
  mapHref,
  sourceHref,
  builderHref,
  reviewState,
  onReviewStart,
  registerReviewRow,
  abilities,
  labels,
}: {
  title: string;
  /** One plain-language line under the header, so a non-specialist knows why it is a to-do. */
  hint?: string;
  rows: DoNextRow[];
  totalCount: number;
  metric: (row: DoNextRow) => string | null;
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  if (rows.length === 0) return null;
  const hiddenCount = Math.max(0, totalCount - rows.length);
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{title}</InsightsSectionTitle>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        {hint ? (
          <p className="text-body leading-body text-[color:var(--color-text-quaternary)]">{hint}</p>
        ) : null}
      </div>
      {rows.map((row) => {
        const metricText = metric(row);
        const candidate = { id: row.id, title: row.title };
        const active =
          reviewState?.phase === "active" && reviewState.id === row.id;
        return (
          <div
            key={row.id}
            ref={(element) => registerReviewRow?.(row.id, element)}
            data-testid="do-next-row"
            tabIndex={-1}
            aria-current={active ? "step" : undefined}
            // On mobile (≤sm) the three actions do not fit on one line, so they wrap below the
            // title (the 390px overflow sweep — no horizontal page scroll).
            className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
              active
                ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                : ""
            }`}
          >
            <TopologyV2KindGlyph kind={row.nodeKind} size={13} />
            {/* Name and badge are bound as one group — only the name shrinks while the badge
                holds its place, so at narrow widths the badge never drops to the next line and
                disturbs the row height (dimensional regularity). */}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
                {row.title}
              </span>
              {row.evidenceOnly ? (
                <EvidenceOnlyBadge
                  label={labels.evidenceBadge}
                  hint={labels.evidenceBadgeHint}
                />
              ) : null}
            </span>
            {metricText ? (
              <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
                {metricText}
              </span>
            ) : null}
            <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
              <Link
                href={mapHref(row.nodeId, row.id)}
                onClick={() => onReviewStart?.(candidate)}
                className={controlClass({
                  shape: "chip",
                  size: "md",
                  className: "hover:text-[color:var(--color-text-primary)]",
                })}
              >
                {labels.openMap}
              </Link>
              <RowActionMenu
                sourceHref={sourceHref(row.nodeId, row.id)}
                builderHref={builderHref(row.nodeId, row.id)}
                handoffPayload={row.handoffPayload}
                candidate={candidate}
                onReviewStart={onReviewStart}
                abilities={abilities}
                labels={labels}
              />
            </span>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-body text-[color:var(--color-text-quaternary)]">{labels.moreCount(hiddenCount)}</p>
      ) : null}
    </section>
  );
}

/**
 * "Similar names — are these the same thing?" Duplicates are the number-one failure of a
 * growing folder and the cheapest to-do to fix (fold two documents into one and it is done),
 * so this is the queue card's first section.
 *
 * Rows are compressed to a single line — this tab is already 1.2× the viewport, and a new
 * section that pushes other to-dos off screen stops it being the tab that answers "what
 * should I fix now?". Everything needed to decide (the two names, the shared words, the
 * overlap ratio) fits in one line, and whether to merge is the person's call — the screen
 * only hands over as far as a dry run.
 *
 * With no pairs at all the section is not drawn. A "0 duplicates" success card spends ink
 * and helps no decision.
 */
function DuplicateSection({
  rows,
  restRows,
  totalCount,
  mapHref,
  handoff,
  abilities,
  labels,
}: {
  rows: DuplicatePairRow[];
  restRows: DuplicatePairRow[];
  totalCount: number;
  mapHref: (nodeId: string) => string;
  handoff: (row: DuplicatePairRow) => string;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  const [restOpen, setRestOpen] = useState(false);
  const shownCount = rows.length + (restOpen ? restRows.length : 0);
  const row = (pair: DuplicatePairRow) => (
    <DuplicateRow
      key={pair.id}
      pair={pair}
      mapHref={mapHref}
      handoff={handoff}
      abilities={abilities}
      labels={labels}
    />
  );
  if (rows.length === 0) return null;
  return (
    <section
      aria-label={labels.sectionDuplicate}
      data-testid="do-next-duplicates"
      className="flex flex-col"
    >
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {labels.sectionDuplicate}
          </InsightsSectionTitle>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        <p className="text-body leading-body text-[color:var(--color-text-quaternary)]">
          {labels.hintDuplicate}
        </p>
      </div>
      {rows.map(row)}
      {/* The rest is not hidden — it is folded, and both the fact of folding and the scale are
          stated. The same quiet toggle and "top N / M total" grammar as the evidence layer on
          this page: the same kind of truncation must look the same. */}
      {restRows.length > 0 ? (
        <button
          type="button"
          aria-expanded={restOpen}
          data-testid="do-next-duplicate-rest-toggle"
          onClick={() => setRestOpen((open) => !open)}
          className={QUIET_REST_TOGGLE}
        >
          {restOpen ? (
            <ChevronDown aria-hidden size={ICON_SIZE.sm} className="flex-none" />
          ) : (
            <ChevronRight aria-hidden size={ICON_SIZE.sm} className="flex-none" />
          )}
          <span className="min-w-0 truncate">
            {restOpen ? labels.duplicateRestHide : labels.duplicateRestShow(restRows.length)}
          </span>
        </button>
      ) : null}
      {restOpen && restRows.length > 0 ? (
        // The height is pinned and scrolling happens inside it. If the expanded layer grew with
        // its content, this tab's scroll contract (1.3× viewport) would break as a function of
        // vault size. Fixing the space reaches **every** remaining pair while leaving the tab
        // height at its designed value (dimensional regularity).
        <div className="insights-disclosure-in flex max-h-52 flex-col overflow-y-auto">
          {restRows.map(row)}
        </div>
      ) : null}
      {totalCount > shownCount ? (
        <p className="pt-2 text-body text-[color:var(--color-text-quaternary)]">
          {labels.duplicateTruncated(shownCount, totalCount)}
        </p>
      ) : null}
    </section>
  );
}

/** One suspected-duplicate row — the folded and expanded layers share this anatomy. */
function DuplicateRow({
  pair,
  mapHref,
  handoff,
  abilities,
  labels,
}: {
  pair: DuplicatePairRow;
  mapHref: (nodeId: string) => string;
  handoff: (row: DuplicatePairRow) => string;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  return (
    <div
      data-testid="do-next-duplicate-row"
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-[color:var(--color-divider)] py-1 last:border-b-0"
    >
      <TopologyV2KindGlyph kind={pair.kind ?? "unknown"} size={13} />
      <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
        {pair.keepTitle}
        <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">↔</span>
        {pair.dissolveTitle}
      </span>
      {pair.sharedTokens.length > 0 ? (
        <span className="hidden shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)] lg:inline">
          {pair.sharedTokens.slice(0, 3).join(" · ")}
        </span>
      ) : null}
      <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
        {labels.duplicateMetric(Math.round(pair.score * 100))}
      </span>
      <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
        <Link
          href={mapHref(pair.keepId)}
          /*
           * ⚠️ **Actions of equal weight in the same row are the same height** (measured 2026-08-08).
           *
           * Only this one hand-added `min-h-7 px-2 text-label`, so it rendered at **30px** — 2px
           * off the `HandoffCopyButton` (32) right beside it. 30 is not a value in the chip ramp
           * (24/32/32), and `min-h-7` (28) had never once applied because the natural height was
           * already 30.
           *
           * The sibling's comment already records the history: on 2026-08-03 the chip ramp
           * converged on 32 and the `compact` prop that chose between 30 and 32 was deleted — but
           * **this link alone did not follow that convergence.** A hand-added value does not move
           * when the ramp moves, which is why the value layer's step is used instead.
           */
          className={controlClass({
            shape: "chip",
            size: "md",
            tone: "muted",
            className:
              "border-[color:var(--color-border-soft)] hover:text-[color:var(--color-text-primary)]",
          })}
        >
          {labels.openMap}
        </Link>
        <HandoffCopyButton payload={handoff(pair)} labels={labels} abilities={abilities} />
      </span>
    </div>
  );
}

/**
 * The dependency-cycle section — "has a structurally dangerous loop appeared?". Each row
 * closes the directed `depends_on` path as "A → B → C → A" and offers [map] (a deeplink to
 * the first node) plus [hand to an agent] (copies the cycle handoff).
 * Nothing is rendered when there are no cycles.
 */
function CycleSection({
  cycles,
  mapHref,
  nodeTitle,
  cycleHandoff,
  reviewState,
  onReviewStart,
  registerReviewRow,
  abilities,
  labels,
}: {
  cycles: DependencyCyclesResult;
  mapHref: (nodeId: string, reviewId?: string) => string;
  nodeTitle: (nodeId: string) => string;
  cycleHandoff: (cycle: DependencyCycle) => string;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  registerReviewRow?: (id: string, element: HTMLDivElement | null) => void;
  abilities: QueueRowAbilities;
  labels: DoNextTabLabels;
}) {
  if (cycles.cycles.length === 0) return null;
  return (
    <section aria-label={labels.sectionCycle} data-testid="do-next-cycles" className="flex flex-col">
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2">
        <InsightsSectionTitle level={3} className="flex items-center gap-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          <AlertTriangle size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-status-warning)]" />
          {labels.sectionCycle}
        </InsightsSectionTitle>
        <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {cycles.totalCycles}
        </span>
      </div>
      {cycles.cycles.map((cycle) => {
        const firstNodeId = cycle.nodeIds[0];
        const reviewId = `cycle:${cycle.id}`;
        const candidate = { id: reviewId, title: nodeTitle(firstNodeId) };
        const active =
          reviewState?.phase === "active" && reviewState.id === reviewId;
        return (
          <div
            key={cycle.id}
            ref={(element) => registerReviewRow?.(reviewId, element)}
            data-testid="do-next-cycle-row"
            tabIndex={-1}
            aria-current={active ? "step" : undefined}
            className={`flex min-w-0 items-center gap-2.5 border-b border-[color:var(--color-divider)] py-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)] last:border-b-0 ${
              active
                ? "bg-[color:var(--color-indigo-a06)] ring-1 ring-inset ring-[color:var(--color-indigo-a22)]"
                : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--color-text-secondary)]">
              {cycle.nodeIds.map((nodeId, i) => (
                <span key={`${cycle.id}:${nodeId}:${i}`}>
                  {i > 0 ? <span className="text-[color:var(--color-text-quaternary)]"> → </span> : null}
                  {nodeTitle(nodeId)}
                </span>
              ))}
              {cycle.hiddenNodeCount > 0 ? (
                <span className="text-[color:var(--color-text-quaternary)]">
                  {" → "}
                  {labels.cycleMoreNodes(cycle.hiddenNodeCount)}
                </span>
              ) : null}
              <span className="text-[color:var(--color-text-quaternary)]"> → </span>
              {nodeTitle(firstNodeId)}
            </span>
            <span className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]">
              {labels.cycleMetric(cycle.length)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Link
                href={mapHref(firstNodeId, reviewId)}
                onClick={() => onReviewStart?.(candidate)}
                className={controlClass({
                  shape: "chip",
                  size: "md",
                  className: "hover:text-[color:var(--color-text-primary)]",
                })}
              >
                {labels.openMap}
              </Link>
              <HandoffCopyButton
                payload={cycleHandoff(cycle)}
                labels={labels}
                abilities={abilities}
                candidate={candidate}
                onReviewStart={onReviewStart}
              />
            </span>
          </div>
        );
      })}
      {cycles.hiddenCycles > 0 ? (
        <p className="pt-2 text-body text-[color:var(--color-text-quaternary)]">
          {labels.moreCount(cycles.hiddenCycles)}
        </p>
      ) : null}
    </section>
  );
}

export function DoNextTab({
  queue,
  touchUps = [],
  cycles,
  duplicates = [],
  duplicateRest = [],
  duplicateTotal = 0,
  duplicateHandoff,
  agentReadiness,
  healthQueue,
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  nodeTitle,
  cycleHandoff,
  activityDigest,
  reviewState,
  onReviewStart,
  abilities = { canWriteVault: false, agentObserved: false },
  meaningGaps = null,
  labels,
  openVaultAction,
}: DoNextTabProps) {
  const [repairTargetsOpen, setRepairTargetsOpen] = useState(false);
  const reviewStatusRef = useRef<HTMLParagraphElement | null>(null);
  const reviewRowRefs = useRef(new Map<string, HTMLDivElement>());
  const lastFocusedReviewKeyRef = useRef<string | null>(null);
  const nextTouchUpId = touchUps[0]?.id;
  const reviewPhase = reviewState?.phase;
  const currentReviewId = reviewState?.id;
  const registerReviewRow = (
    id: string,
    element: HTMLDivElement | null,
  ) => {
    if (element) reviewRowRefs.current.set(id, element);
    else reviewRowRefs.current.delete(id);
  };
  useEffect(() => {
    if (!reviewPhase || !currentReviewId) return;
    const focusKey = `${currentReviewId}:${reviewPhase}`;
    if (lastFocusedReviewKeyRef.current === focusKey) return;
    lastFocusedReviewKeyRef.current = focusKey;
    if (reviewPhase === "active") {
      const activeRow = reviewRowRefs.current.get(currentReviewId);
      if (activeRow) activeRow.focus();
      else reviewStatusRef.current?.focus();
      return;
    }
    if (reviewPhase === "cleared") {
      if (nextTouchUpId) reviewRowRefs.current.get(nextTouchUpId)?.focus();
      else reviewStatusRef.current?.focus();
    }
  }, [currentReviewId, reviewPhase, nextTouchUpId]);

  const reviewStatus = reviewState
    ? reviewState.phase === "checking"
      ? labels.reviewChecking(reviewState.title)
      : reviewState.phase === "active"
        ? labels.reviewActive(reviewState.title)
        : reviewState.phase === "cleared"
          ? labels.reviewCleared(reviewState.title)
          : labels.reviewUnverified(reviewState.title)
    : null;
  const readinessTotal =
    agentReadiness.ready + agentReadiness.preflight + agentReadiness.blocked;
  const REPAIR_ACTION_KIND_LABELS: Record<OntologyHealthActionTarget["kind"], string> = {
    island: labels.repairQueueActionKindIsland,
    containment: labels.repairQueueActionKindContainment,
    stale: labels.repairQueueActionKindStale,
    orphan: labels.repairQueueActionKindOrphan,
    promotion: labels.repairQueueActionKindPromotion,
  };
  const repairTargets =
    healthQueue.actionTargets.length > 0
      ? healthQueue.actionTargets
      : healthQueue.actionTarget
        ? [healthQueue.actionTarget]
        : [];
  const primaryRepairTarget = repairTargets[0] ?? null;
  const remainingRepairTargets = repairTargets.slice(1);
  // Deduplicate the band against the queue: "today's touch-ups" is truncated from the top of
  // the queue and cycles, so it overlaps the queue sections' first rows 100% (the same
  // neglected hubs, orphans, and promotion candidates). Exact row ids already on the band are
  // filtered out of the queue rows so one item never appears twice, above and below. The
  // section header's `totalCount` (`queue.counts.*`) and the "N more" line are left alone, so
  // the overall scale is preserved.
  const bandIds = new Set(touchUps.map((item) => item.id));
  const neglectedRows = queue.rows.filter(
    (row) => row.rowKind === "neglected-hub" && !bandIds.has(row.id),
  );
  const orphanRows = queue.rows.filter(
    (row) => row.rowKind === "orphan" && !bandIds.has(row.id),
  );
  const promotionRows = queue.rows.filter(
    (row) => row.rowKind === "promotion" && !bandIds.has(row.id),
  );
  const visibleCycleRows = cycles.cycles.filter(
    (cycle) => !bandIds.has(`cycle:${cycle.id}`),
  );
  const removedVisibleCycleCount =
    cycles.cycles.length - visibleCycleRows.length;
  const visibleCycles: DependencyCyclesResult = {
    ...cycles,
    cycles: visibleCycleRows,
    totalCycles: Math.max(0, cycles.totalCycles - removedVisibleCycleCount),
  };
  const hasCycles = visibleCycles.cycles.length > 0;
  // "Nothing to fix right now — the graph is healthy" appears only when the CLI-parity signals
  // (disconnected islands, missing containment) are zero as well. It used to judge from the
  // do-next rows alone and so claimed "healthy" even on a screen where the repair queue right
  // below showed `missing containment 1` (a contradiction found in review).
  const hasClipParityIssues =
    healthQueue.islandCount > 0 || healthQueue.missingContainmentCount > 0;
  // Suspected duplicate pairs are work too — claiming "nothing to fix" while such a pair
  // remains contradicts the section directly below (the same single-verdict discipline).
  const hasDuplicates = duplicates.length > 0;
  // Meaning gaps (undefined meaning, unassigned parent) are work too — claiming "nothing to
  // fix" while the section below shows those rows makes one card contradict itself.
  const meaningGapTotal =
    (meaningGaps?.counts.missingDefinition ?? 0) + (meaningGaps?.counts.missingDomain ?? 0);
  const queueEmpty =
    queue.rows.length === 0 &&
    !hasCycles &&
    !hasClipParityIssues &&
    !hasDuplicates &&
    meaningGapTotal === 0;

  // Group scale — simply the sum of the pre-truncation totals each section header already prints.
  const groupCounts = sumQueueGroupCounts([
    { section: "missing-definition", total: meaningGaps?.counts.missingDefinition ?? 0 },
    { section: "missing-domain", total: meaningGaps?.counts.missingDomain ?? 0 },
    { section: "duplicate", total: duplicateTotal },
    { section: "promotion", total: queue.counts.promotion },
    { section: "neglected-hub", total: queue.counts.neglectedHub },
    { section: "orphan", total: queue.counts.orphan },
    { section: "cycle", total: visibleCycles.totalCycles },
  ]);
  const groupOrder = queueGroupOrder(abilities);
  const meaningSections = (
    <>
      {meaningGaps ? (
        <>
          <MeaningGapSection
            gapKind="missing-definition"
            rows={meaningGaps.definitionRows}
            totalCount={meaningGaps.counts.missingDefinition}
            abilities={abilities}
            mapHref={(nodeId) => mapHref(nodeId)}
            sourceHref={(nodeId) => sourceHref(nodeId)}
            builderHref={(nodeId) => builderHref(nodeId)}
            askAgentHref={askAgentHref}
            onWrite={meaningGaps.onWrite}
            moreCount={labels.moreCount}
            labels={meaningGaps.definitionLabels}
          />
          <MeaningGapSection
            gapKind="missing-domain"
            rows={meaningGaps.domainRows}
            totalCount={meaningGaps.counts.missingDomain}
            abilities={abilities}
            domainChoices={meaningGaps.domainChoices}
            mapHref={(nodeId) => mapHref(nodeId)}
            sourceHref={(nodeId) => sourceHref(nodeId)}
            builderHref={(nodeId) => builderHref(nodeId)}
            askAgentHref={askAgentHref}
            onWrite={meaningGaps.onWrite}
            moreCount={labels.moreCount}
            labels={meaningGaps.domainLabels}
          />
        </>
      ) : null}
      <DuplicateSection
        rows={duplicates}
        restRows={duplicateRest}
        totalCount={duplicateTotal}
        mapHref={(nodeId) => mapHref(nodeId)}
        handoff={(row) => duplicateHandoff?.(row) ?? ""}
        abilities={abilities}
        labels={labels}
      />
      <QueueSection
        title={labels.sectionPromotion}
        hint={labels.hintPromotion}
        rows={promotionRows}
        totalCount={queue.counts.promotion}
        metric={(row) => (row.degree !== undefined ? labels.promotionMetric(row.degree) : null)}
        mapHref={mapHref}
        sourceHref={sourceHref}
        builderHref={builderHref}
        reviewState={reviewState}
        onReviewStart={onReviewStart}
        registerReviewRow={registerReviewRow}
        abilities={abilities}
        labels={labels}
      />
    </>
  );
  const codeSections = (
    <>
      <QueueSection
        title={labels.sectionNeglectedHub}
        hint={labels.hintNeglectedHub}
        rows={neglectedRows}
        totalCount={queue.counts.neglectedHub}
        metric={(row) =>
          row.degree !== undefined && row.agoDays !== undefined
            ? labels.neglectedHubMetric(row.degree, row.agoDays)
            : null
        }
        mapHref={mapHref}
        sourceHref={sourceHref}
        builderHref={builderHref}
        reviewState={reviewState}
        onReviewStart={onReviewStart}
        registerReviewRow={registerReviewRow}
        abilities={abilities}
        labels={labels}
      />
      <QueueSection
        title={labels.sectionOrphan}
        hint={labels.hintOrphan}
        rows={orphanRows}
        totalCount={queue.counts.orphan}
        metric={() => null}
        mapHref={mapHref}
        sourceHref={sourceHref}
        builderHref={builderHref}
        reviewState={reviewState}
        onReviewStart={onReviewStart}
        registerReviewRow={registerReviewRow}
        abilities={abilities}
        labels={labels}
      />
      <CycleSection
        cycles={visibleCycles}
        mapHref={mapHref}
        nodeTitle={nodeTitle}
        cycleHandoff={cycleHandoff}
        reviewState={reviewState}
        onReviewStart={onReviewStart}
        registerReviewRow={registerReviewRow}
        abilities={abilities}
        labels={labels}
      />
    </>
  );
  // A group heading is drawn **only when that group has visible rows** — an empty heading reads
  // as "something should be here and is missing".
  const meaningVisible =
    (meaningGaps?.definitionRows.length ?? 0) > 0 ||
    (meaningGaps?.domainRows.length ?? 0) > 0 ||
    duplicates.length > 0 ||
    promotionRows.length > 0;
  const codeVisible =
    neglectedRows.length > 0 || orphanRows.length > 0 || visibleCycles.cycles.length > 0;
  const groupNode: Record<QueueWorkGroup, ReactNode> = {
    meaning: meaningVisible ? (
      <div key="meaning" className="flex flex-col gap-4">
        <WorkGroupHeading
          testId="do-next-group-meaning"
          title={abilities.canWriteVault ? labels.groupMeaningTitle : labels.groupMeaningTitleReadOnly}
          count={groupCounts.meaning}
          hint={abilities.canWriteVault ? labels.groupMeaningHint : labels.groupMeaningHintReadOnly}
          action={abilities.canWriteVault ? undefined : openVaultAction}
        />
        {meaningSections}
      </div>
    ) : null,
    code: codeVisible ? (
      <div key="code" className="flex flex-col gap-4">
        <WorkGroupHeading
          testId="do-next-group-code"
          title={labels.groupCodeTitle}
          count={groupCounts.code}
          hint={labels.groupCodeHint}
        />
        {codeSections}
      </div>
    ) : null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      {reviewStatus ? (
        <p
          ref={reviewStatusRef}
          data-testid="do-next-review-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          tabIndex={-1}
          className="rounded-chip border border-[color:var(--color-border-soft)] px-3 py-2 text-label text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a42)]"
        >
          {reviewStatus}
        </p>
      ) : null}
      {touchUps.length > 0 ? (
        <TouchUpBand
          items={touchUps}
          mapHref={mapHref}
          sourceHref={sourceHref}
          builderHref={builderHref}
          reviewState={reviewState}
          onReviewStart={onReviewStart}
          registerReviewRow={registerReviewRow}
          abilities={abilities}
          labels={labels}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      {/* The status band — agent readiness plus the repair queue as a full-width two-column
          summary at the top. It used to be a vertical card beside the queue (`self-start`), so a
          long queue left an enormous empty area below it on the right. Moving it to a top band
          removes that space and makes the page read as "overall status → what to do now". */}
      <section
        aria-label={labels.agentReadinessTitle}
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div
            aria-label={`${labels.agentReadinessTitle}: ${agentReadiness.ready} ${labels.agentReadinessReady} · ${agentReadiness.preflight} ${labels.agentReadinessPreflight} · ${agentReadiness.blocked} ${labels.agentReadinessBlocked}${
              agentReadiness.blocked > 0
                ? ` (${labels.agentReadinessBlockedBreakdown(
                    agentReadiness.blockedDocuments,
                    agentReadiness.review,
                  )})`
                : ""
            }`}
            data-testid="insights-agent-readiness"
            className="min-w-0"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
              <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
                {labels.agentReadinessTitle}
              </InsightsSectionTitle>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)] sm:ml-auto">
                <span
                  className={
                    agentReadiness.ready === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {agentReadiness.ready}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessReady}
                  </span>
                </span>
                <span
                  className={
                    agentReadiness.preflight === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {agentReadiness.preflight}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessPreflight}
                  </span>
                </span>
                {/* Why the third figure went from "needs review" to "blocked" is in the
                    `DoNextTabAgentReadiness.blocked` comment. It is not muted to neutral when
                    non-zero — writing it faintly while something is blocked puts the number's
                    weight at odds with the risk the meter reports. */}
                <span
                  className={
                    agentReadiness.blocked === 0
                      ? "text-[color:var(--color-text-quaternary)]"
                      : "text-[color:var(--color-status-danger)]"
                  }
                >
                  {agentReadiness.blocked}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.agentReadinessBlocked}
                  </span>
                </span>
              </span>
            </div>
            {agentReadiness.blocked > 0 ? (
              <p
                data-testid="insights-agent-readiness-breakdown"
                // No `leading-*` — `text-label` carries its own line height (the ramp's companion
                // pairing). Copying the neighbouring line would raise the off-ramp ratchet.
                className="mt-1 text-body text-[color:var(--color-text-tertiary)]"
              >
                {labels.agentReadinessBlockedBreakdown(
                  agentReadiness.blockedDocuments,
                  agentReadiness.review,
                )}
              </p>
            ) : labels.agentReadinessHint ? (
              /*
               * `break-keep` — **Korean trips the reader when it breaks mid-word** (measured 2026-08-12).
               *
               * Folding to two lines, this paragraph broke as 「... for me / is what I do」. Instrument: a
               * `Range` per character reveals the characters on either side of the line break —
               * both Korean with no space means mid-word. The cause is `word-break: normal`, and
               * this repository already used `break-keep` elsewhere.
               */
              <p className="mt-1 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]">
                {labels.agentReadinessHint}
              </p>
            ) : null}
            {/* **A non-zero value must never render as 0px.** With `flexGrow` alone, "1 error /
                200 ready" becomes 3px at a 390px width and vanishes — the meter then draws «no
                risk» and «risk present but small» as the same picture. So a non-zero segment gets
                a minimum width. The value is spacing, which is deliberately not ramp-enforced
                ("spacing is not enforced"), and one constant is its single source. */}
            <div
              data-testid="insights-agent-readiness-meter"
              className="mt-2 flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)]"
            >
              <span
                aria-hidden
                className="bg-[color:var(--color-indigo-a58)]"
                style={meterSegmentStyle(
                  readinessTotal > 0 ? agentReadiness.ready : 1,
                  readinessTotal > 0,
                )}
              />
              <span
                aria-hidden
                className="bg-[color:var(--color-status-warning)]"
                style={meterSegmentStyle(
                  readinessTotal > 0 ? agentReadiness.preflight : 0,
                  readinessTotal > 0,
                )}
              />
              <span
                aria-hidden
                className="bg-[color:var(--color-status-danger)]"
                style={meterSegmentStyle(
                  readinessTotal > 0 ? agentReadiness.blocked : 0,
                  readinessTotal > 0,
                )}
              />
            </div>
          </div>
          <div
            data-testid="insights-repair-queue"
            className="sm:border-l sm:border-[color:var(--color-divider)] sm:pl-8"
          >
            <div className="flex items-baseline gap-2">
              <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
                {labels.repairQueueTitle}
              </InsightsSectionTitle>
              {/* `min-w-0` matches the rule the "agent readiness" card beside it already used.
                  Without it the chip group insisted on its content width and squeezed the title
                  column, folding "repair queue" onto two lines at 834px. */}
              <span className="ml-auto flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                <span
                  className={
                    healthQueue.staleCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.staleCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueStale}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.orphanCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.orphanCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueOrphan}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.promotionCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.promotionCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueuePromotion}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.islandCount === 0 ? "text-[color:var(--color-text-quaternary)]" : undefined
                  }
                >
                  {healthQueue.islandCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueIsland}
                  </span>
                </span>
                <span
                  className={
                    healthQueue.missingContainmentCount === 0
                      ? "text-[color:var(--color-text-quaternary)]"
                      : undefined
                  }
                >
                  {healthQueue.missingContainmentCount}{" "}
                  <span className="text-caption tracking-normal text-[color:var(--color-text-quaternary)]">
                    {labels.repairQueueMissingContainment}
                  </span>
                </span>
              </span>
            </div>
            {primaryRepairTarget ? (
              <div className="mt-2.5">
                <RepairQueueTargetRow
                  target={primaryRepairTarget}
                  kindLabel={REPAIR_ACTION_KIND_LABELS[primaryRepairTarget.kind]}
                  builderHref={healthQueue.builderHref}
                  ontologyHref={healthQueue.ontologyHref}
                  labels={labels}
                />
                {remainingRepairTargets.length > 0 ? (
                  <button
                    type="button"
                    aria-expanded={repairTargetsOpen}
                    data-testid="insights-repair-queue-rest-toggle"
                    onClick={() => setRepairTargetsOpen((open) => !open)}
                    className={QUIET_REST_TOGGLE}
                  >
                    {repairTargetsOpen ? (
                      <ChevronDown aria-hidden size={ICON_SIZE.sm} className="flex-none" />
                    ) : (
                      <ChevronRight aria-hidden size={ICON_SIZE.sm} className="flex-none" />
                    )}
                    <span className="min-w-0 truncate">
                      {repairTargetsOpen
                        ? labels.repairQueueRestHide
                        : labels.repairQueueRestShow(remainingRepairTargets.length)}
                    </span>
                  </button>
                ) : null}
                {repairTargetsOpen && remainingRepairTargets.length > 0 ? (
                  <div
                    data-testid="insights-repair-queue-rest"
                    className="insights-disclosure-in flex max-h-44 flex-col overflow-y-auto border-t border-[color:var(--color-divider)]"
                  >
                    {remainingRepairTargets.map((target) => (
                      <RepairQueueTargetRow
                        key={`${target.kind}:${target.slug}`}
                        target={target}
                        kindLabel={REPAIR_ACTION_KIND_LABELS[target.kind]}
                        builderHref={healthQueue.builderHref}
                        ontologyHref={healthQueue.ontologyHref}
                        labels={labels}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-body text-[color:var(--color-text-quaternary)]">{labels.repairQueueEmpty}</p>
            )}
          </div>
        </div>
        {activityDigest && activityDigest.latest.length > 0 ? (
          <div
            data-testid="insights-activity-digest"
            className="mt-5 border-t border-[color:var(--color-divider)] pt-4"
          >
            <div className="flex items-baseline gap-2">
              <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
                {labels.digestTitle}
              </InsightsSectionTitle>
              <span className="ml-auto font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                {labels.digestToday(activityDigest.todayCount)}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {activityDigest.latest.map((entry, index) => (
                <div key={`${entry.at}-${index}`} data-testid="do-next-digest-entry">
                  <p className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                    {entry.summary}
                    {entry.agent ? (
                      <span className="text-[color:var(--color-text-quaternary)]"> · {entry.agent}</span>
                    ) : null}
                  </p>
                  {entry.why ? (
                    <p
                      data-testid="do-next-digest-why"
                      className="truncate font-mono text-label italic text-[color:var(--color-text-quaternary)]"
                    >
                      {labels.digestWhyPrefix}
                      {entry.why}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-body text-[color:var(--color-text-quaternary)]">{labels.digestApproveHint}</p>
          </div>
        ) : null}
      </section>

      <section
        aria-label={labels.queueTitle}
        // A 16px gap between sections is weaker than the row pitch (~53px), so the next section
        // heading read as attached to the list above it (an inversion of gestalt proximity) —
        // 24px lifts the section boundary above the row spacing.
        className="flex min-h-0 min-w-0 flex-col gap-6 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        {/* The queue card's title is carried by the group headings — putting "you can fix these
            right now" directly under "worth doing now" says the same thing twice, and those 28px
            come out of this tab's scroll budget. The card names itself only when empty (the
            landmark name is still held by `aria-label`). */}
        {queueEmpty ? (
          <>
            <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
              {labels.queueTitle}
            </InsightsSectionTitle>
            <p className="text-body text-[color:var(--color-text-quaternary)]">{labels.emptyQueue}</p>
          </>
        ) : (
          // The group order comes from the session's abilities. The `key` carries that order, so
          // the crossfade runs **only when the abilities change** rather than on every render —
          // rows never jump without reason.
          <div
            key={queueGroupOrderKey(abilities)}
            data-testid="do-next-groups"
            className="ai-row-swap flex flex-col gap-8"
          >
            {groupOrder.map((group) => groupNode[group])}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function RepairQueueTargetRow({
  target,
  kindLabel,
  builderHref,
  ontologyHref,
  labels,
}: {
  target: OntologyHealthActionTarget;
  kindLabel: string;
  builderHref: (slug: string) => string;
  ontologyHref: (slug: string) => string;
  labels: DoNextTabLabels;
}) {
  return (
    <div
      data-testid="insights-repair-queue-target"
      className="flex min-w-0 items-center justify-between gap-2 py-1 first:pt-0"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-body text-[color:var(--color-text-secondary)]">
        <span className={badgeClass({ shape: "micro", className: "shrink-0 border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] leading-display-tight text-[color:var(--color-text-tertiary)]" })}>
          {kindLabel}
        </span>
        <span className="min-w-0 truncate">{target.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Link
          href={builderHref(target.slug)}
          data-testid="insights-repair-queue-builder-link"
          className={controlClass({ shape: "chip", className: "min-h-8 justify-center border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-overlay-2)]" })}
        >
          {labels.repairQueueOpenBuilder}
        </Link>
        <Link
          href={ontologyHref(target.slug)}
          className={controlClass({
            shape: "chip",
            size: "md",
            className: "justify-center hover:text-[color:var(--color-text-primary)]",
          })}
        >
          {labels.repairQueueOpenOntology}
        </Link>
      </span>
    </div>
  );
}
