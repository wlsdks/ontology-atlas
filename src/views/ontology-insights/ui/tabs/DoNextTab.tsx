"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, FileWarning, MessageCircle } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { EvidenceOnlyBadge } from "@/shared/ui/evidence-only-badge";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import type { MeaningGapKind, OntologyHealthActionTarget } from "@/entities/knowledge-graph";
import type { VaultDocumentIssue } from "@/shared/lib/validate-vault-document";
import type { DoNextQueue, DoNextRow } from "../../lib/do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "../../lib/dependency-cycles";
import type { DuplicatePairRow } from "../../lib/duplicate-pairs";
import type { DoNextReviewState } from "../../lib/review-loop";
import type {
  DomainChoice,
  MeaningFindingRows,
  MeaningGapRow,
} from "../../lib/meaning-gap-rows";
import type { BlockedDocumentRow } from "../../lib/fix-list";
import {
  doNextGroupOrder,
  groupOfReviewId,
  sumDoNextGroupCounts,
  type DoNextGroupCounts,
  type DoNextGroupKey,
} from "../../lib/do-next-groups";
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
 * Tab 1, "to do": one list of finding groups, titled by one count. The sources are unchanged; the same work
 * is counted once, and the group counts sum to the title.
 */

export interface DoNextTabLabels extends FixRowLabels {
  /** The one heading. It states the scale of the whole list; the group counts sum to it. */
  listTitle: (count: number) => string;
  /** The remainder line inside an opened group, when it draws fewer rows than it counts. */
  moreCount: (count: number) => string;
  /** The control that raises a group's own row limit to its whole count. */
  showAll: string;
  /** One name per finding group — what the rows inside it have in common, said once. */
  groupName: (group: DoNextGroupKey) => string;
  /** The disclosure's accessible name, which must carry the group's own scale. */
  groupToggle: (name: string, count: number) => string;
  emptyQueue: string;
  /** One line in a read-only session, in the same box as the control that opens a folder. */
  readOnlyHint: string;
  /** Opens the document itself. Blocked documents have no node yet, so the map cannot hold them. */
  openDocument: string;

  // One sentence per item kind. Each names what was observed, never what the screen thinks.
  whyNeglectedHub: (degree: number, agoDays: number) => string;
  whyOrphan: string;
  whyPromotion: (count: number) => string;
  /** The concepts behind a promotion row's count, by name, when every one of them is named. */
  whyPromotionNamed: (names: string) => string;
  /** The same, when the count is larger than the names printed. */
  whyPromotionNamedMore: (names: string, count: number) => string;
  whyCycle: (length: number) => string;
  whyDuplicate: (percent: number) => string;
  whyMissingDefinition: string;
  whyMissingDomain: string;
  /**
   * One sentence per meaning-finding group, looked up by key like `groupName`, so a new finding gains its sentence
   * by adding one message key and never renders a row whose reason is silence.
   */
  whyMeaningFinding: (group: DoNextGroupKey) => string;
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
  /** Same i18n key as the connections tab's evidence badge, so one fact has one name. */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

export interface DoNextTabProps {
  /**
   * The open-folder control beside the read-only line. The page supplies it because this component is pure display
   * with all copy in `labels`; a context-reading child would make its tests need a provider.
   */
  openVaultAction?: ReactNode;
  /** The whole list before per-kind truncation: the same verdict the tab badge reads (`insights-verdict`), so they agree. */
  totalCount: number;
  /** Every group's count from the verdict's signal counts. A `Record`, so a new group without a count fails type checking. */
  groupCounts: DoNextGroupCounts;
  /** Rows an opened group draws before stating its remainder; groups start closed, so the viewport stays bounded. */
  groupRowLimit?: number;
  /** Raises the queue's per-kind supply: a control cannot reveal rows that were never built. */
  onShowAllRows?: () => void;
  /** One whole-group action where a group honestly has one. No group-level map link: it would pick an arbitrary member. */
  groupAction?: (group: DoNextGroupKey, count: number) => ReactNode;
  queue: DoNextQueue;
  cycles: DependencyCyclesResult;
  /**
   * Truncated to the display limit; the same computation as MCP `similar_nodes`
   * (`tests/contract/duplicate-pairs.contract.test.ts`).
   */
  duplicates?: DuplicatePairRow[];
  /** The per-pair handoff — a sentence starting from a `merge_concepts` dry run. */
  duplicateHandoff?: (row: DuplicatePairRow) => string;
  /** Documents that failed validation (`summarizeVaultValidation`), each named as a row. */
  blockedDocuments?: readonly BlockedDocumentRow[];
  /** Where a blocked document opens. The map cannot hold it: a document that fails validation is not a node. */
  docHref: (slug: string) => string;
  /** Disconnected islands and missing containment: the two signals the CLI `health` command flags as `needs_attention`. */
  repairTargets?: readonly OntologyHealthActionTarget[];
  mapHref: (nodeId: string, reviewId?: string) => string;
  sourceHref: (nodeId: string, reviewId?: string) => string | null;
  builderHref: (nodeId: string, reviewId?: string) => string;
  /** Omitted where there is no agent panel, and the action is then not drawn. */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind | "missing-relations") => string | null;
  reviewState?: DoNextReviewState | null;
  onReviewStart?: (candidate: { id: string; title: string }) => void;
  /** Cycle path node id → display title. */
  nodeTitle: (nodeId: string) => string;
  /** The per-cycle agent handoff payload, for copying. */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /** A capability, not a role (`session-abilities.ts`). The default can do nothing, so an omitted prop never opens a form. */
  abilities?: QueueRowAbilities;
  /** Present only when vault document facts exist; omitted means no such rows. */
  meaningGaps?: {
    definitionRows: MeaningGapRow[];
    domainRows: MeaningGapRow[];
    /** The four advisory findings, one row per node, already truncated to the display limit. */
    findingRows: MeaningFindingRows;
    domainChoices: DomainChoice[];
    onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
    definitionLabels: MeaningGapLabels;
    domainLabels: MeaningGapLabels;
  } | null;
  labels: DoNextTabLabels;
}

/**
 * Every row's actions in one order: hand to agent, fix myself, look at it, then overflow.
 * A row omits what it cannot offer but never reorders, so the eye lands in the same place.
 */
function FixRowActions({
  askAgentUrl,
  fixHref,
  viewHref,
  viewLabel,
  menu,
  onLeaveRow,
  labels,
}: {
  askAgentUrl?: string | null;
  fixHref?: string | null;
  viewHref?: string | null;
  viewLabel: string;
  menu?: ReactNode;
  /** Claims the row before leaving, so Back reopens its group and restores the row. */
  onLeaveRow?: () => void;
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
          onClick={onLeaveRow}
          className={controlClass({ shape: "chip", size: "md", className: FIX_ROW_SECONDARY_INK })}
        >
          {labels.fixHere}
        </Link>
      ) : null}
      {viewHref ? (
        <Link
          href={viewHref}
          data-testid="do-next-item-view"
          onClick={onLeaveRow}
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
  groupCounts,
  groupRowLimit = 5,
  onShowAllRows,
  groupAction,
  queue,
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
      // The checked row is gone, so focus goes to the status line naming what was cleared.
      reviewStatusRef.current?.focus();
    }
  }, [currentReviewId, reviewPhase]);

  const reviewStatus = reviewState
    ? reviewState.phase === "checking"
      ? labels.reviewChecking(reviewState.title)
      : reviewState.phase === "active"
        ? labels.reviewActive(reviewState.title)
        : reviewState.phase === "cleared"
          ? labels.reviewCleared(reviewState.title)
          : labels.reviewUnverified(reviewState.title)
    : null;

  const queueRowsOfKind = (rowKind: DoNextRow["rowKind"]) =>
    queue.rows.filter((row) => row.rowKind === rowKind);

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

  /** Built only when the group is open. */
  const rowsOfGroup = (group: DoNextGroupKey): ReactNode[] => {
    switch (group) {
      case "blocked-document":
        // No map link or kebab: a document failing validation is not a node, so the next step is opening the file.
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

      case "island":
      case "containment":
        // The CLI reports islands and missing containment apart, so the grouped list does too.
        return repairTargets
          .filter((target) => target.kind === group)
          .map((target) => (
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
            sentence={group === "island" ? labels.whyIsland : labels.whyContainment}
            actions={
              <FixRowActions
                labels={labels}
                // A disconnected node is a missing-relations question for the map's chat; the chip fills the input, sending stays with the person.
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
        const definition = group === "missing-definition";
        const rows = definition ? meaningGaps.definitionRows : meaningGaps.domainRows;
        if (rows.length === 0) return [];
        // Meaning-gap rows share one state (expanded row, draft text, pinned just-saved row), so one component renders them;
        // it emits rows only.
        return [
          <MeaningGapSection
            key={group}
            gapKind={group}
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

      case "missing-boundary":
      case "missing-uncertainty":
      case "epistemic-exclusion":
      case "slug-outside-kind-folder": {
        // What `validate_vault` tells the agent, said to the person. No write form: a boundary and an uncertainty are prose
        // and a misplaced slug is a file move, so the row names the node and opens it.
        if (!meaningGaps) return [];
        const sentence = labels.whyMeaningFinding(group);
        return meaningGaps.findingRows[group].map((row) => {
          // Same claim-before-leaving contract as an orphan row: the chips write the review id to this board's address, and
          // the menu hands the node and the validator's sentence to an agent.
          const candidate = { id: row.id, title: row.title };
          return (
            <FixRow
              key={row.id}
              kind={group}
              active={isActive(row.id)}
              rowRef={(element) => registerReviewRow(row.id, element)}
              glyph={<OntologyMapKindGlyph kind={row.nodeKind} size={13} />}
              title={row.title}
              sentence={sentence}
              actions={
                <FixRowActions
                  labels={labels}
                  fixHref={builderHref(row.nodeId, row.id)}
                  viewHref={mapHref(row.nodeId, row.id)}
                  viewLabel={labels.viewOnMap}
                  onLeaveRow={() => onReviewStart?.(candidate)}
                  menu={rowMenu(candidate, row.nodeId, `${row.ownSlug}: ${sentence}`, row.id)}
                />
              }
            />
          );
        });
      }

      case "duplicate":
        return duplicates.map((pair) => (
          <FixRow
            key={`duplicate:${pair.id}`}
            kind="duplicate"
            glyph={<OntologyMapKindGlyph kind={pair.kind ?? "unknown"} size={13} />}
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
                onLeaveRow={() => onReviewStart?.({ id: pair.id, title: pair.keepTitle })}
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
        return cycles.cycles.map((cycle) => {
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
                  onLeaveRow={() => onReviewStart?.(candidate)}
                  menu={rowMenu(candidate, firstNodeId, cycleHandoff(cycle), reviewId)}
                />
              }
            />
          );
        });

      case "promotion":
      case "neglected-hub":
      case "orphan":
        return queueRowsOfKind(group).map((row) => {
          const candidate = { id: row.id, title: row.title };
          // The count stays the true total and the names are the first few behind it, so the reader can judge the claim.
          const names = group === "promotion" ? (row.referencedBy ?? []) : [];
          const promotionSentence = () => {
            const total = row.degree ?? 0;
            if (names.length === 0) return labels.whyPromotion(total);
            const named = names.join(", ");
            return total > names.length
              ? labels.whyPromotionNamedMore(named, total)
              : labels.whyPromotionNamed(named);
          };
          const sentence =
            group === "promotion"
              ? promotionSentence()
              : group === "neglected-hub"
                ? labels.whyNeglectedHub(row.degree ?? 0, row.agoDays ?? 0)
                : labels.whyOrphan;
          return (
            <FixRow
              key={row.id}
              kind={group}
              active={isActive(row.id)}
              rowRef={(element) => registerReviewRow(row.id, element)}
              glyph={<OntologyMapKindGlyph kind={row.nodeKind} size={13} />}
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
                    group === "orphan"
                      ? (askAgentHref?.(row.nodeId, "missing-relations") ?? null)
                      : null
                  }
                  fixHref={builderHref(row.nodeId, row.id)}
                  viewHref={mapHref(row.nodeId, row.id)}
                  viewLabel={labels.viewOnMap}
                  onLeaveRow={() => onReviewStart?.(candidate)}
                  menu={rowMenu(candidate, row.nodeId, row.handoffPayload, row.id)}
                />
              }
            />
          );
        });
    }
  };

  const order = doNextGroupOrder(abilities);
  const groups = order
    .map((key) => ({ key, count: groupCounts[key] ?? 0 }))
    .filter((group) => group.count > 0);

  // Groups and title share one `InsightsSignalCounts`, but a caller can pass a hand-built record; development logs
  // a loud error, and the contract test holds production.
  if (process.env.NODE_ENV !== "production") {
    const summed = sumDoNextGroupCounts(groupCounts);
    if (summed !== totalCount) {
      console.error(
        `[do-next] group counts sum to ${summed} but the list title says ${totalCount}. ` +
          "Both must branch from one `InsightsSignalCounts`.",
      );
    }
  }

  const reviewGroup = groupOfReviewId(reviewState?.id);

  return (
    // The card hugs its content: collapsed groups do not grow, and stretching drew an empty band inside the box.
    <div className="flex min-h-0 flex-col gap-[var(--card-gap)]">
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
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <InsightsSectionTitle
          level={2}
          data-testid="do-next-list-title"
          className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]"
        >
          {labels.listTitle(totalCount)}
        </InsightsSectionTitle>
        {/* The read-only line and the control that answers it sit in the same box. */}
        {!abilities.canWriteVault && groups.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]">
              {labels.readOnlyHint}
            </p>
            {openVaultAction}
          </div>
        ) : null}
        {groups.length === 0 ? (
          <p className="mt-2 text-body text-[color:var(--color-text-quaternary)]">
            {labels.emptyQueue}
          </p>
        ) : (
          <div className="mt-3 flex flex-col">
            {groups.map((group, index) => (
              <FixGroup
                key={group.key}
                groupKey={group.key}
                count={group.count}
                rowLimit={groupRowLimit}
                defaultOpen={index === 0}
                forceOpen={reviewGroup === group.key}
                rows={rowsOfGroup}
                onShowAllRows={onShowAllRows}
                labels={labels}
                groupAction={groupAction?.(group.key, group.count)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One finding group: name, count and a disclosure. The whole head is the control and the count is in its accessible
 * name. Rows are built only when open (`.claude/rules/architecture.md`: no data for a surface not rendered).
 */
function FixGroup({
  groupKey,
  count,
  rowLimit,
  defaultOpen,
  forceOpen,
  rows,
  onShowAllRows,
  labels,
  groupAction,
}: {
  groupKey: DoNextGroupKey;
  count: number;
  rowLimit: number;
  /**
   * The first group starts open, so the most urgent kind names its files without a click and the gates that read
   * those rows (`vault-truth-telling`, `a11y-open-surfaces`) find them the way a person does.
   */
  defaultOpen: boolean;
  /** The group holding the row a person returns to from the map opens by itself. */
  forceOpen: boolean;
  rows: (group: DoNextGroupKey) => ReactNode[];
  onShowAllRows?: () => void;
  labels: DoNextTabLabels;
  /** The group's one whole-group action, when it has an honest one. */
  groupAction?: ReactNode;
}) {
  const [opened, setOpened] = useState(defaultOpen);
  // A group's own limit. `HiddenCountLine` refuses to draw a number that disagrees with `total - shown`.
  const [showingAll, setShowingAll] = useState(false);
  const open = opened || forceOpen;
  const name = labels.groupName(groupKey);
  const body = useMemo(() => (open ? rows(groupKey) : []), [open, rows, groupKey]);
  const shown = body.slice(0, showingAll ? count : rowLimit);
  const panelId = `do-next-group-panel-${groupKey}`;

  return (
    <div
      data-testid="do-next-group"
      data-group-kind={groupKey}
      data-group-open={open ? "true" : "false"}
      className="border-b border-[color:var(--color-divider)] last:border-b-0"
    >
      <div data-testid="do-next-group-row" className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-testid="do-next-group-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={labels.groupToggle(name, count)}
          onClick={() => setOpened((value) => !value)}
          className={controlClass({
            shape: "row",
            size: "lg",
            hoverSurface: "lift",
            className: "-mx-2 min-w-0 flex-1",
          })}
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className={`shrink-0 text-[color:var(--color-text-quaternary)] transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        {/* Name and count sit together, in the tab bar's grammar; the empty remainder is the click target. */}
          <span className="min-w-0 truncate text-left text-[color:var(--color-text-secondary)]">
            {name}
          </span>
          <span
            data-testid="do-next-group-count"
            className="shrink-0 font-mono tabular-nums text-[color:var(--map-numeral-face)]"
          >
            {count}
          </span>
          <span className="flex-1" aria-hidden />
        </button>
        {groupAction}
      </div>
      <div id={panelId} hidden={!open}>
        {open ? (
          // Indented, so "inside this group" is carried by position and not by the chevron alone.
          <div className="flex flex-col pb-1.5 pl-5">
            {shown}
            <HiddenCountLine
              total={count}
              shown={shown.length}
              label={(remaining) => labels.moreCount(remaining)}
              route={
                <button
                  type="button"
                  data-testid="do-next-group-show-all"
                  onClick={() => {
                    setShowingAll(true);
                    onShowAllRows?.();
                  }}
                  className={controlClass({ shape: "link", className: "text-[color:var(--color-indigo-text-strong)]" })}
                >
                  {labels.showAll}
                </button>
              }
              className="pt-2"
              data-testid="do-next-group-truncated"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
