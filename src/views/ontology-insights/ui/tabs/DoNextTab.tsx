"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, FileWarning, MessageCircle } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { EvidenceOnlyBadge } from "@/shared/ui/evidence-only-badge";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import type { MeaningGapKind, OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { VaultDocumentIssue } from "@/shared/lib/validate-vault-document";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";
import type { DoNextReviewState } from "../../lib/review-loop";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import { fixBlockOrder, type BlockedDocumentRow, type FixBlockKey } from "../../lib/fix-list";
import {
  RowActionMenu,
  type QueueRowAbilities,
} from "../parts/QueueRowActions";
import {
  ACCENT_CHIP_IDLE,
  FixRow,
  FIX_ROW_SECONDARY_INK,
  FIX_ROW_TERTIARY_INK,
  type FixRowLabels,
} from "../parts/FixRow";
import { controlClass } from "@/shared/ui/control-class";
import { MeaningGapSection, type MeaningGapLabels } from "./MeaningGapSection";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

/**
 * Tab 1, "to do" — one list of the things that need fixing.
 *
 * ## Why it is one list (owner decision, 2026-08-31)
 *
 * It used to show the same items **three ways**: an agent-readiness meter, a repair-queue counter
 * band, and a queue split into two labelled groups with a per-section header, a per-section count
 * and a per-section hint, plus an activity digest and a bottom handoff footer. The owner could not
 * say why the tab existed. Counting one body of work three times does not make it three answers.
 *
 * So: **the sources are unchanged and the presentation is one flat list.** Every row states the
 * concept, one plain sentence naming the observed fact, and the same three actions in the same
 * order (hand it to the agent · fix it myself · look at it), with an overflow carrying the
 * copyable command for someone driving an external tool.
 *
 * Nothing an agent can read was removed with the meter and the counters: MCP `maintenance_plan`
 * and `health` still return the same ranking and the same verdict. What was removed was a screen
 * repeating itself to a person.
 *
 * Automation contract, unchanged: the precise ranking is never reimplemented on the client. A
 * person chooses here and execution is handed to an agent.
 */

export interface DoNextTabLabels extends FixRowLabels {
  /** The one heading. States the scale of the list, and nothing else on the tab states a count. */
  listTitle: (count: number) => string;
  /** The one truncation line, when the list shows fewer rows than the heading counts. */
  moreCount: (count: number) => string;
  emptyQueue: string;
  /** One line in a read-only session, in the same box as the control that opens a folder. */
  readOnlyHint: string;
  /** Opens the document itself. Blocked documents have no node yet, so the map cannot hold them. */
  openDocument: string;

  // One sentence per item kind. Each names what was observed, never what the screen thinks.
  whyNeglectedHub: (degree: number, agoDays: number) => string;
  whyOrphan: string;
  whyPromotion: (count: number) => string;
  whyCycle: (length: number) => string;
  whyDuplicate: (percent: number) => string;
  whyMissingDefinition: string;
  whyMissingDomain: string;
  whyIsland: string;
  whyContainment: string;
  whyBlockedDocument: (reason: string) => string;
  /** What failed validation, in plain words. Falls back to a general sentence for an unlisted code. */
  blockedReason: (code: VaultDocumentIssue["code"]) => string;
  /** How omitted nodes are marked when a cycle path is truncated at `maxPathNodes`. */
  cycleMoreNodes: (count: number) => string;

  reviewChecking: (title: string | null) => string;
  reviewActive: (title: string | null) => string;
  reviewCleared: (title: string | null) => string;
  reviewUnverified: (title: string | null) => string;
  /**
   * The evidence-layer badge — it comes from the **same i18n key** as the "connections" tab's
   * ranking and hubs. Calling one fact by different names per surface makes a user read it as two
   * facts.
   */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

/**
 * One row of the priority pick. The result of `pickTodaysTouchUps` is given a display `why` string
 * by the caller (the pure function knows only the reason; the surface knows the copy).
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

export interface DoNextTabProps {
  /**
   * The «way to open a folder» placed beside the read-only line.
   *
   * **Why the component is not called directly here**: this component is pure display and receives
   * all its copy through `labels` (which is why its unit tests render without a provider). Calling
   * a context-reading component inside would break that design — and it really did, with five
   * tests failing on «provider not found». The page supplies the path.
   */
  openVaultAction?: ReactNode;
  /**
   * The scale of the whole list, before per-kind truncation. It is the same single verdict the tab
   * badge reads (`insights-verdict`), so the heading and the badge can never disagree.
   */
  totalCount: number;
  queue: DoNextQueue;
  /** The priority picks, which lead the list. An empty array simply contributes no rows. */
  touchUps?: DoNextTouchUp[];
  /** Dependency cycles (loops in the directed `depends_on` graph). */
  cycles: DependencyCyclesResult;
  /**
   * Suspected duplicate pairs, truncated to the display limit. The similarity is the same
   * computation as MCP `similar_nodes`, so the screen and the agent name the same pairs
   * (`tests/contract/duplicate-pairs.contract.test.ts`).
   */
  duplicates?: DuplicatePairRow[];
  /** The per-pair handoff — a sentence starting from a `merge_concepts` dry run. */
  duplicateHandoff?: (row: DuplicatePairRow) => string;
  /**
   * Documents that failed validation. They come from the same `summarizeVaultValidation` the
   * removed readiness meter counted; the meter said how many were blocked and named none of them.
   */
  blockedDocuments?: readonly BlockedDocumentRow[];
  /** Where a blocked document opens. The map cannot hold it: a document that fails validation is not a node. */
  docHref: (slug: string) => string;
  /**
   * Disconnected islands and missing parent containment — the two signals
   * `node $ATLAS/cli/src/index.mjs health` flips to `needs_attention` on. They used to be counters
   * in the repair band; they are rows now.
   */
  repairTargets?: readonly OntologyHealthActionTarget[];
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  /**
   * The address that hands a row to the map's agent. It is not supplied where there is no agent
   * panel, and the action then does not appear at all: a door that will not open is not drawn.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind | "missing-relations") => string | null;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  /** Cycle path node id → display title. */
  nodeTitle: (nodeId: string) => string;
  /** The per-cycle agent handoff payload, for copying. */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /**
   * What this session can do right now — the input to the row order and the action labels. It is a
   * capability, not a role (`session-abilities.ts`). The default is the can-do-nothing side, so a
   * call site that omits it (a test, say) never opens a form by itself.
   */
  abilities?: QueueRowAbilities;
  /**
   * Work that ends in one sentence — undefined meaning, unassigned parent. It is computed only
   * when vault document facts exist, hence optional (omitted means no such rows).
   */
  meaningGaps?: {
    definitionRows: MeaningGapRow[];
    domainRows: MeaningGapRow[];
    domainChoices: DomainChoice[];
    onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
    definitionLabels: MeaningGapLabels;
    domainLabels: MeaningGapLabels;
  } | null;
  labels: DoNextTabLabels;
}

/**
 * The action cluster every row shares, in one order: **hand it to the agent · fix it myself · look
 * at it**, then the overflow. A row omits what it honestly cannot offer; it never reorders what it
 * has, because a reader's eye must land on the same place in every row.
 */
function FixRowActions({
  askAgentUrl,
  fixHref,
  viewHref,
  viewLabel,
  menu,
  labels,
}: {
  askAgentUrl?: string | null;
  fixHref?: string | null;
  viewHref?: string | null;
  viewLabel: string;
  menu?: ReactNode;
  labels: DoNextTabLabels;
}) {
  return (
    <>
      {askAgentUrl ? (
        <Link
          href={askAgentUrl}
          data-testid="do-next-item-ask-agent"
          className={controlClass({
            shape: "chip",
            size: "md",
            tone: "accentOnTint",
            className: ACCENT_CHIP_IDLE,
          })}
        >
          <MessageCircle size={ICON_SIZE.sm} aria-hidden />
          {labels.askAgent}
        </Link>
      ) : null}
      {fixHref ? (
        <Link
          href={fixHref}
          data-testid="do-next-item-fix"
          className={controlClass({ shape: "chip", size: "md", className: FIX_ROW_SECONDARY_INK })}
        >
          {labels.fixHere}
        </Link>
      ) : null}
      {viewHref ? (
        <Link
          href={viewHref}
          data-testid="do-next-item-view"
          className={controlClass({
            shape: "chip",
            size: "md",
            tone: "muted",
            className: FIX_ROW_TERTIARY_INK,
          })}
        >
          {viewLabel}
        </Link>
      ) : null}
      {menu}
    </>
  );
}

export function DoNextTab({
  totalCount,
  queue,
  touchUps = [],
  cycles,
  duplicates = [],
  duplicateHandoff,
  blockedDocuments = [],
  docHref,
  repairTargets = [],
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  nodeTitle,
  cycleHandoff,
  reviewState,
  onReviewStart,
  abilities = { canWriteVault: false, agentObserved: false },
  meaningGaps = null,
  labels,
  openVaultAction,
}: DoNextTabProps) {
  const reviewStatusRef = useRef<HTMLParagraphElement | null>(null);
  const reviewRowRefs = useRef(new Map<string, HTMLDivElement>());
  const lastFocusedReviewKeyRef = useRef<string | null>(null);
  const nextTouchUpId = touchUps[0]?.id;
  const reviewPhase = reviewState?.phase;
  const currentReviewId = reviewState?.id;
  const registerReviewRow = (id: string, element: HTMLDivElement | null) => {
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

  // Deduplicate the priority picks against the queue: they are truncated from the top of the queue
  // and the cycles, so they overlap those rows exactly. Rows already on the list are filtered out
  // so one item never appears twice.
  const bandIds = new Set(touchUps.map((item) => item.id));
  const queueRowsOfKind = (rowKind: DoNextRow["rowKind"]) =>
    queue.rows.filter((row) => row.rowKind === rowKind && !bandIds.has(row.id));
  const visibleCycles = cycles.cycles.filter((cycle) => !bandIds.has(`cycle:${cycle.id}`));

  const isActive = (id: string) => reviewState?.phase === "active" && reviewState.id === id;

  const rowMenu = (
    candidate: { id: string; title: string },
    nodeId: string,
    handoffPayload: string,
    reviewId?: string,
  ) => (
    <RowActionMenu
      sourceHref={sourceHref(nodeId, reviewId)}
      builderHref={builderHref(nodeId, reviewId)}
      hideBuilder
      handoffPayload={handoffPayload}
      candidate={candidate}
      onReviewStart={onReviewStart}
      abilities={abilities}
      labels={labels}
    />
  );

  /** Rows contributed by one block of the order. Empty blocks contribute nothing at all. */
  const rowsOfBlock = (block: FixBlockKey): ReactNode[] => {
    switch (block) {
      case "touch-up":
        return touchUps.map((item) => {
          const candidate = { id: item.id, title: item.title };
          return (
            <FixRow
              key={item.id}
              kind={`touch-up-${item.source}`}
              active={isActive(item.id)}
              rowRef={(element) => registerReviewRow(item.id, element)}
              glyph={
                item.source === "cycle" ? (
                  <AlertTriangle
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="text-[color:var(--color-status-warning)]"
                  />
                ) : (
                  <TopologyV2KindGlyph kind={item.nodeKind} size={13} />
                )
              }
              title={item.title}
              sentence={item.why}
              actions={
                <FixRowActions
                  labels={labels}
                  askAgentUrl={null}
                  fixHref={builderHref(item.nodeId, item.id)}
                  viewHref={mapHref(item.nodeId, item.id)}
                  viewLabel={labels.viewOnMap}
                  menu={rowMenu(candidate, item.nodeId, item.handoffPayload, item.id)}
                />
              }
            />
          );
        });

      case "blocked-document":
        // No map link and no kebab: a document that fails validation is not a node yet, so the map
        // has nothing to show and there is no per-row command to hand over. The one honest next
        // step is to open the file and read what the check said.
        return blockedDocuments.map((row) => (
          <FixRow
            key={`blocked:${row.slug}`}
            kind="blocked-document"
            glyph={
              <FileWarning
                size={ICON_SIZE.sm}
                aria-hidden
                className="text-[color:var(--color-status-danger)]"
              />
            }
            title={row.slug}
            sentence={labels.whyBlockedDocument(labels.blockedReason(row.code))}
            actions={
              <FixRowActions
                labels={labels}
                viewHref={docHref(row.slug)}
                viewLabel={labels.openDocument}
              />
            }
          />
        ));

      case "repair":
        return repairTargets.map((target) => (
          <FixRow
            key={`repair:${target.kind}:${target.slug}`}
            kind={target.kind}
            glyph={
              <AlertTriangle
                size={ICON_SIZE.sm}
                aria-hidden
                className="text-[color:var(--color-status-warning)]"
              />
            }
            title={target.title}
            sentence={target.kind === "island" ? labels.whyIsland : labels.whyContainment}
            actions={
              <FixRowActions
                labels={labels}
                // A disconnected node is a missing-relations question, so the same chat the map
                // opens can take it; the chip fills the input, sending stays with the person.
                askAgentUrl={askAgentHref?.(target.slug, "missing-relations") ?? null}
                fixHref={builderHref(target.slug)}
                viewHref={mapHref(target.slug)}
                viewLabel={labels.viewOnMap}
              />
            }
          />
        ));

      case "missing-definition":
      case "missing-domain": {
        if (!meaningGaps) return [];
        const definition = block === "missing-definition";
        const rows = definition ? meaningGaps.definitionRows : meaningGaps.domainRows;
        if (rows.length === 0) return [];
        // A run of meaning-gap rows shares one piece of state (which row is expanded, what is typed
        // in it, and the pin that keeps a just-saved row visible), so it is rendered by one
        // component. It emits rows only, with no heading of its own.
        return [
          <MeaningGapSection
            key={block}
            gapKind={block}
            rows={rows}
            sentence={definition ? labels.whyMissingDefinition : labels.whyMissingDomain}
            abilities={abilities}
            domainChoices={definition ? undefined : meaningGaps.domainChoices}
            mapHref={(nodeId) => mapHref(nodeId)}
            sourceHref={(nodeId) => sourceHref(nodeId)}
            builderHref={(nodeId) => builderHref(nodeId)}
            askAgentHref={askAgentHref}
            onWrite={meaningGaps.onWrite}
            labels={definition ? meaningGaps.definitionLabels : meaningGaps.domainLabels}
          />,
        ];
      }

      case "duplicate":
        return duplicates.map((pair) => (
          <FixRow
            key={`duplicate:${pair.id}`}
            kind="duplicate"
            glyph={<TopologyV2KindGlyph kind={pair.kind ?? "unknown"} size={13} />}
            title={
              <>
                {pair.keepTitle}
                <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">↔</span>
                {pair.dissolveTitle}
              </>
            }
            sentence={labels.whyDuplicate(Math.round(pair.score * 100))}
            actions={
              <FixRowActions
                labels={labels}
                viewHref={mapHref(pair.keepId)}
                viewLabel={labels.viewOnMap}
                menu={rowMenu(
                  { id: pair.id, title: pair.keepTitle },
                  pair.keepId,
                  duplicateHandoff?.(pair) ?? "",
                )}
              />
            }
          />
        ));

      case "cycle":
        return visibleCycles.map((cycle) => {
          const firstNodeId = cycle.nodeIds[0];
          const reviewId = `cycle:${cycle.id}`;
          const candidate = { id: reviewId, title: nodeTitle(firstNodeId) };
          return (
            <FixRow
              key={reviewId}
              kind="cycle"
              active={isActive(reviewId)}
              rowRef={(element) => registerReviewRow(reviewId, element)}
              glyph={
                <AlertTriangle
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className="text-[color:var(--color-status-warning)]"
                />
              }
              title={
                <span className="font-mono">
                  {cycle.nodeIds.map((nodeId, i) => (
                    <span key={`${cycle.id}:${nodeId}:${i}`}>
                      {i > 0 ? (
                        <span className="text-[color:var(--color-text-quaternary)]"> → </span>
                      ) : null}
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
              }
              sentence={labels.whyCycle(cycle.length)}
              actions={
                <FixRowActions
                  labels={labels}
                  fixHref={builderHref(firstNodeId, reviewId)}
                  viewHref={mapHref(firstNodeId, reviewId)}
                  viewLabel={labels.viewOnMap}
                  menu={rowMenu(candidate, firstNodeId, cycleHandoff(cycle), reviewId)}
                />
              }
            />
          );
        });

      case "promotion":
      case "neglected-hub":
      case "orphan":
        return queueRowsOfKind(block).map((row) => {
          const candidate = { id: row.id, title: row.title };
          const sentence =
            block === "promotion"
              ? labels.whyPromotion(row.degree ?? 0)
              : block === "neglected-hub"
                ? labels.whyNeglectedHub(row.degree ?? 0, row.agoDays ?? 0)
                : labels.whyOrphan;
          return (
            <FixRow
              key={row.id}
              kind={block}
              active={isActive(row.id)}
              rowRef={(element) => registerReviewRow(row.id, element)}
              glyph={<TopologyV2KindGlyph kind={row.nodeKind} size={13} />}
              title={row.title}
              badge={
                row.evidenceOnly ? (
                  <EvidenceOnlyBadge label={labels.evidenceBadge} hint={labels.evidenceBadgeHint} />
                ) : undefined
              }
              sentence={sentence}
              actions={
                <FixRowActions
                  labels={labels}
                  askAgentUrl={
                    block === "orphan"
                      ? (askAgentHref?.(row.nodeId, "missing-relations") ?? null)
                      : null
                  }
                  fixHref={builderHref(row.nodeId, row.id)}
                  viewHref={mapHref(row.nodeId, row.id)}
                  viewLabel={labels.viewOnMap}
                  menu={rowMenu(candidate, row.nodeId, row.handoffPayload, row.id)}
                />
              }
            />
          );
        });
    }
  };

  const rows = fixBlockOrder(abilities).flatMap(rowsOfBlock);
  /*
   * The heading counts the whole list; the rows are truncated per kind. Rather than a count beside
   * every section (which is what made one body of work read as several), the gap is stated once,
   * at the bottom, in the grammar this repository already uses for truncation.
   *
   * A meaning-gap run is one React element carrying several rows, so `rows.length` undercounts it.
   * The visible number is derived from the same arrays the rows came from.
   */
  const shownCount =
    rows.length -
    (meaningGaps ? [meaningGaps.definitionRows, meaningGaps.domainRows].filter((r) => r.length > 0).length : 0) +
    (meaningGaps ? meaningGaps.definitionRows.length + meaningGaps.domainRows.length : 0);
  const hiddenCount = Math.max(0, totalCount - shownCount);

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
      <section
        aria-label={labels.listTitle(totalCount)}
        data-testid="do-next-list"
        className="flex min-h-0 min-w-0 flex-1 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <InsightsSectionTitle
          level={2}
          data-testid="do-next-list-title"
          className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]"
        >
          {labels.listTitle(totalCount)}
        </InsightsSectionTitle>
        {/*
         * The read-only line and the control that answers it sit in the same box. Measured
         * 2026-08-07: this screen said "open your own folder and you can finish these right here"
         * while **zero** of its 25 controls opened a folder — a dead-end CTA.
         */}
        {!abilities.canWriteVault && rows.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]">
              {labels.readOnlyHint}
            </p>
            {openVaultAction}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-2 text-body text-[color:var(--color-text-quaternary)]">
            {labels.emptyQueue}
          </p>
        ) : (
          <div className="mt-3 flex flex-col">{rows}</div>
        )}
        {hiddenCount > 0 ? (
          <p
            data-testid="do-next-list-truncated"
            className="pt-2 text-body text-[color:var(--color-text-quaternary)]"
          >
            {labels.moreCount(hiddenCount)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
