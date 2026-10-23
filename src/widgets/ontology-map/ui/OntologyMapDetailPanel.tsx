"use client";

import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CircleHelp,
  Copy,
  FileText,
  GitBranch,
  MessageCircle,
  Orbit,
  Plus,
  ScanSearch,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { useRowDisclosure } from "@/shared/lib/list-rows/use-row-disclosure";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { Button, Disclosure, LastEditSubjectRow, MtimeConflictBadge, Surface, SummaryFreshnessRow } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { type DetailActionItem, DetailActionMenu } from "./detail-panel/DetailActionMenu";
import { IdentityZone } from "./detail-panel/IdentityZone";
import { PanelFooter } from "./detail-panel/PanelFooter";
import { ProjectSourceRemedy } from "./detail-panel/ProjectSourceRemedy";
import { ProjectSourcePendingRows, ProjectSourceStatusIcon } from "./detail-panel/ProjectSourceRows";
import { RelationsZone } from "./detail-panel/RelationsZone";
import type { OntologyMapDetailPanelProps } from "./detail-panel/types";

/**
 * Component datasheet node panel (`docs/design/ontology-map.md` section 5). It owns its prop
 * shape; the view maps `TopologyNodeFocusModel` into it. Connection groups are role-based, the
 * buckets full detail draws.
 */

/**
 * The action row's primary uses the map panel's chip radius (`--map-panel-row-radius`) like
 * the menu triggers.
 */
const PRIMARY_ACTION_CLASS = "atlas-touch-floor min-w-0 flex-1 rounded-chip";

export function OntologyMapDetailPanel({
  nodeId,
  slug,
  title,
  sourceTitle = null,
  kind,
  domain,
  summaryStaleness = null,
  summaryHistoryUnavailable = false,
  powered,
  groups,
  domainUsage = null,
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
  meaningReview,
  discoveryAction,
  suppressPrimaryAction = false,
  onClose,
  closeButtonRef,
  onEnterRealm,
  onOpenFullDetail,
  open,
  onExited,
  className,
  showHandoff = true,
  showSourcePath = true,
  projectSource = null,
  projectSourceLoading = false,
  onProjectSourceAction,
  projectSourceBusy = false,
  projectSourceError = null,
  projectSourceDegraded = null,
  projectSourceProposal = null,
  onProjectSourceConfirmProposal,
}: OntologyMapDetailPanelProps) {
  const isProject = kind === "project";
  const showProjectSource = isProject && projectSource !== null;
  /**
   * The layout is decided by the kind, not by when `projectSource` arrives, so the panel does not
   * rebuild itself when the receipt lands. Until then its place is held by its heading and a pending
   * line (`ProjectSourcePendingRows`).
   */
  const projectSourcePending = isProject && projectSource === null && projectSourceLoading;
  const projectLayout = showProjectSource || projectSourcePending;
  /**
   * The remedy block stands beside the diagnosis and appears only when there is a gap. The no-gap
   * state's action stays in the footer, so the same control is never drawn in two places.
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
  /*
   * The diagnosis above the remedy arrives with it, so it arrives the same way. Once the
   * pending line holds the receipt's place, this sentence is the one part of the arrival
   * that still pushes the actions down; drawn outright it would move them by its one or
   * two lines in a single frame while the remedy under it eased in. The text is held
   * through the exit, so a gap that closes (a measurement that settled it) leaves as
   * itself, not as "no follow-up needed".
   */
  const showSourceGap = Boolean(showProjectSource && projectSource.topGap && labels.sourceGap);
  const heldSourceGap = useHeldValue(showSourceGap ? labels.sourceGap : null);
  const {
    mounted: gapMounted,
    boxRef: gapBoxRef,
    contentRef: gapContentRef,
  } = useRowDisclosure(showSourceGap);
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
          testId: "map-detail-panel-action-edit",
          onSelect: onEditRelations,
        }
      : {
          label: labels.actionEditRelations,
          icon: <GitBranch size={ICON_SIZE.sm} aria-hidden />,
          testId: "map-detail-panel-action-edit",
          href: meaningEditHref,
        },
    ...(onCreateLinked && labels.actionCreateLinked
      ? [
          {
            label: labels.actionCreateLinked,
            icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
            testId: "map-detail-panel-action-create-linked",
            onSelect: onCreateLinked,
          },
        ]
      : []),
  ];
  const moreActions: DetailActionItem[] = [
    ...(discoveryAction ? [{ label:discoveryAction.label, icon:<CircleHelp size={ICON_SIZE.sm} aria-hidden/>, testId:"map-detail-panel-action-gray-area", onSelect:discoveryAction.onOpen }] : []),
    ...(documentHref
      ? [
          {
            label: labels.actionDocument,
            icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
            testId: "map-detail-panel-action-document",
            href: documentHref,
          },
        ]
      : []),
    ...(canAskAgent && showInlineHandoff
      ? [
          {
            label: labels.actionCopyHandoff,
            icon: <Copy size={ICON_SIZE.sm} aria-hidden />,
            testId: "map-detail-panel-action-handoff",
            onSelect: () => onCopyHandoff(handoffText),
          },
        ]
      : []),
    ...(onEnterRealm
      ? [
          {
            label: labels.actionRealm,
            icon: <Orbit size={ICON_SIZE.sm} aria-hidden />,
            testId: "map-detail-panel-action-realm",
            onSelect: onEnterRealm,
          },
        ]
      : []),
  ];
  const compactProjectRelations = useViewportBelow(1513);
  const collapseProjectRelations = projectLayout && compactProjectRelations;
  // The top count sums the totals of the groups drawn below, so it equals their aggregate by
  // construction.
  const connectedTotal =
    groups.contains.total + groups.usedBy.total + groups.dependsOn.total + groups.belongsTo.total +
    groups.related.total;
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

  return (
    /*
     * `Surface` carries the exit window. The outer box carries width only; the inner box is the
     * scroll container and the sticky footer anchors to its scrollport. Small menus inside keep
     * chrome motion.
     */
    <Surface
      open={open}
      motion="overlay"
      // A dense target shares its first paint with the camera/layout work. The
      // settle ramp keeps the reading surface's fade legible in that frame;
      // closing still uses Surface's faster exit and reduced-motion equivalent.
      style={open ? { animationDuration: 'var(--motion-settle)' } : undefined}
      onExited={onExited}
      className={[
        "w-[var(--map-panel-width)]",
        open ? "pointer-events-auto" : "pointer-events-none",
        className ?? "",
      ].join(" ")}
    >
      <div
        role="group"
        aria-label={title}
        {...transientSurface("anchored")}
        data-testid="map-detail-panel"
        data-selected-node-id={nodeId}
        data-selected-node-kind={kind}
        data-selected-node-title={title}
        data-surface-role="active-node-inspector"
        data-attention-role="supporting-detail"
        data-datasheet-density="instrument"
        onKeyDown={handleKeyDown}
        // The viewport cap keeps the footer in reach. `--map-inspector-max-height` is this surface's alias:
        // below `lg` it is a bottom sheet the meaning editor sharing this anchor must not inherit.
        // The reading body scrolls; the footer stays outside its clipping boundary.
        className={[
          // Width is decided by the outer `Surface` (including the consumer
          // className's responsive width override) — here it only fills that width
          // and carries the remaining material.
          "flex w-full flex-col",
          "max-h-[var(--map-inspector-max-height)] overflow-hidden",
          "rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)]",
          "bg-[color:var(--map-panel-surface)]",
          "shadow-[var(--map-panel-shadow)]",
        ].join(" ")}
      >
        <div data-testid="map-detail-panel-body" className="min-h-0 overflow-y-auto pb-3">
        {/* Identity precedes source state and actions. */}
        <IdentityZone
          nodeId={nodeId}
          title={title}
          sourceTitle={sourceTitle}
          kind={kind}
          domain={domain}
          powered={powered}
          updatedAtLabel={updatedAtLabel}
          labels={labels}
          onSelectConnection={onSelectConnection}
          onHoverConnection={onHoverConnection}
          onClose={onClose}
          closeButtonRef={closeButtonRef}
          showSourcePath={showSourcePath}
          projectLayout={projectLayout}
        />

        <hr className="h-px border-0 bg-[color:var(--map-panel-zone-divider)]" />

        {/* ZONE 2 · OPS — the last-edit/conflict row (only with real data) plus the
            plain stats plus the quiet action strip. */}
        <div className="flex flex-col gap-3 px-[var(--map-panel-pad)] pt-3 pb-2.5">
          {lastEditSubject ? (
            <LastEditSubjectRow
              kind={lastEditSubject.kind}
              prefixLabel={labels.editSubjectPrefix}
              subjectLabel={lastEditSubject.kind === "agent" ? labels.editSubjectAgent : labels.editSubjectHuman}
              ageLabel={lastEditSubject.ageLabel}
            />
          ) : null}
          {mtimeConflict ? <MtimeConflictBadge message={labels.editConflictMessage} /> : null}
          {summaryHistoryUnavailable && labels.summaryHistoryUnavailable ? (
            <p role="status" data-testid="summary-history-unavailable" className="text-balance text-body leading-body text-[color:var(--color-text-tertiary)]">
              {labels.summaryHistoryUnavailable}
            </p>
          ) : summaryStaleness && labels.summaryFreshnessPrefix && labels.summaryFreshnessLag && labels.summaryFreshnessAction ? (
            <SummaryFreshnessRow
              prefixLabel={labels.summaryFreshnessPrefix}
              lagLabel={labels.summaryFreshnessLag}
              actionLabel={labels.summaryFreshnessAction}
            />
          ) : null}

          {/* A project replaces the same position with the receipt rail. Everything
              else keeps the existing plain stats (one aggregate line). While the receipt is
              read the same element holds its place — heading, a pending status line and the
              measured line's height — so the rows arrive where they will stay, and the live
              region announcing them is the one that was already there. */}
          {projectLayout ? (
            <div
              data-testid={showProjectSource ? "map-project-source-receipt" : "map-project-source-pending"}
              data-source-status={showProjectSource ? projectSource.status : undefined}
              data-source-version={showProjectSource ? projectSource.contractVersion : undefined}
              data-source-measured-at={showProjectSource ? projectSource.measuredAt ?? "unmeasured" : undefined}
              data-source-top-gap={showProjectSource ? projectSource.topGap?.id ?? "none" : undefined}
              data-source-action={showProjectSource ? projectSource.nextAction.id : undefined}
              data-source-currentness={showProjectSource ? projectSource.currentness : undefined}
              data-source-cardinality={showProjectSource ? projectSource.bindingCardinality : undefined}
              data-source-layout="status-action-separated"
              data-source-gap-visible={showProjectSource ? projectSource.topGap !== null : undefined}
              aria-live="polite"
              aria-busy={showProjectSource ? undefined : true}
              className="flex flex-col gap-2 text-body text-[color:var(--map-panel-text-tertiary)]"
            >
              {labels.sourceHeading ? (
                <span
                  data-testid="map-project-source-heading"
                  className="sr-only"
                >
                  {labels.sourceHeading}
                </span>
              ) : null}
              {showProjectSource ? (
                /* Keyed apart from the pending rows, so these mount fresh and `ai-row-swap`
                   crossfades them in: the line that said "reading" becomes the answer in place. */
                <Fragment key="read">
                  <div className="ai-row-swap flex min-w-0 items-center gap-1.5 text-[color:var(--map-panel-text-secondary)]">
                    <ProjectSourceStatusIcon status={projectSource.status} />
                    <span className="truncate font-[var(--font-weight-signature)]">{labels.sourceStatus}</span>

                  </div>

                </Fragment>
              ) : (
                <ProjectSourcePendingRows key="pending" label={labels.sourcePending} />
              )}
              {/* One flex item for the diagnosis and its remedy: the column's 8px gap is paid
                  once, by this item, whether or not either has arrived. The gap line's own
                  spacing rides inside its disclosure (`pb-2`), so it opens from zero instead of
                  a new flex item adding 8px in one frame before any easing starts. */}
              <div>
                {gapMounted ? (
                  <div
                    ref={gapBoxRef}
                    className="ai-row-disclosure"
                    data-state={showSourceGap ? "open" : "closed"}
                  >
                    <div ref={gapContentRef} className="ai-row-disclosure-body pb-2">
                      <p
                        data-testid="map-project-source-gap"
                        className="text-[color:var(--map-panel-text-secondary)]"
                      >
                        {labels.sourceGapLabel ? (
                          <span className="sr-only">{labels.sourceGapLabel}: </span>
                        ) : null}
                        {heldSourceGap}
                      </p>
                    </div>
                  </div>
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
                    /*
                     * The card's 2px lead-in is padding on the measured body, not a margin: a child's top margin
                     * collapses through the body, so the disclosure would size 2px short and `overflow: hidden`
                     * cut the card's border.
                     */
                    <div ref={remedyContentRef} className="ai-row-disclosure-body pt-0.5">
                      <ProjectSourceRemedy
                        why={projectSource?.nextAction.id === "remeasure_source" ? undefined : labels.sourceWhy}
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
              {/* The failure stands under the pressed button: above the remedy it would push the button from
                 under the pointer and drop keyboard focus to `<body>`. */}
              {projectSourceError ? (
                <span
                  role="status"
                  data-testid="map-project-source-error"
                  className="text-[color:var(--color-status-danger)]"
                >
                  {projectSourceError}
                </span>
              ) : null}
              {showProjectSource ? (
                <Disclosure summary={labels.sourceRecord ?? labels.sourceHeading} summaryTestId="map-project-source-record">
                  <div className="flex flex-col gap-1 pb-2 text-label text-[color:var(--map-panel-text-tertiary)]">
                    <span>{labels.sourceMeasuredAt}</span>
                    <span>{labels.sourceKind} · {labels.sourceCurrentness}</span>
                  </div>
                </Disclosure>
              ) : null}
            </div>
          ) : null}

          {/* Only one line outside. Fold the rest into meaning-based menus to limit choices at the moment of reading a node to three. Navigate via the map + ACP global navigation. */}
          <div
            role="group"
            aria-label={labels.actionsGroupLabel}
            data-testid="map-detail-panel-actions"
            data-primary-action-suppressed={suppressPrimaryAction ? "true" : undefined}
            className={projectLayout
              ? "flex items-center gap-1.5 border-t border-[color:var(--map-panel-zone-divider)] pt-3"
              : "flex items-center gap-1.5"}
          >
            {!suppressPrimaryAction && meaningReview ? (
              <Button variant={projectLayout && showSourceRemedy ? "ghost" : "primary"} size="sm" onClick={meaningReview.onOpen} data-testid="map-detail-panel-action-meaning" data-action-role={projectLayout && showSourceRemedy ? "secondary" : "primary"} className={PRIMARY_ACTION_CLASS}>
                <ScanSearch size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{meaningReview.label}</span>
              </Button>
            ) : !suppressPrimaryAction && canAskAgent ? (
              <Button
                size="sm"
                onClick={onAskAgent}
                aria-label={labels.actionAskAgent}
                title={labels.actionAskAgentTip}
                data-testid="map-detail-panel-action-ask-agent"
                data-action-role="primary"
                className={PRIMARY_ACTION_CLASS}
              >
                <MessageCircle size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionAskAgent}</span>
              </Button>
            ) : !suppressPrimaryAction && showInlineHandoff ? (
              <Button
                size="sm"
                onClick={() => onCopyHandoff(handoffText)}
                aria-label={labels.handoff}
                data-testid="map-detail-panel-action-handoff"
                data-action-role="primary"
                className={PRIMARY_ACTION_CLASS}
              >
                <Copy size={ICON_SIZE.sm} aria-hidden />
                <span className="truncate">{labels.actionCopyHandoff}</span>
              </Button>
            ) : null}
            <DetailActionMenu
              label={labels.actionEditMenu}
              triggerTestId="map-detail-panel-edit-menu-trigger"
              menuTestId="map-detail-panel-edit-menu"
              open={actionMenu === "edit"}
              onOpenChange={(next) => setActionMenu(next ? "edit" : null)}
              items={editActions}
            />
            <DetailActionMenu
              label={labels.actionMore}
              triggerTestId="map-detail-panel-more-menu-trigger"
              menuTestId="map-detail-panel-more-menu"
              iconOnly
              open={actionMenu === "more"}
              onOpenChange={(next) => setActionMenu(next ? "more" : null)}
              items={moreActions}
            />
          </div>
        </div>

        <hr className="h-px border-0 bg-[color:var(--map-panel-zone-divider)]" />

        {/* ZONE 3 · RELATIONS — the rhythm between groups is
            `--map-panel-zone-gap` (28px), far wider than the row spacing
            inside a group, so each typed-fact block reads as its own section
            ("space encodes grouping"). */}
        <RelationsZone
          groups={groups}
          domainUsage={domainUsage}
          evidence={evidence}
          codeLocations={codeLocations}
          labels={labels}
          onSelectConnection={onSelectConnection}
          onHoverConnection={onHoverConnection}
          onHoverEvidence={onHoverEvidence}
          collapseProjectRelations={collapseProjectRelations}
          connectedTotal={connectedTotal}
          hasConnections={hasConnections}
          showAllContains={showAllContains}
          setShowAllContains={setShowAllContains}
          expandedGroups={expandedGroups}
          setExpandedGroups={setExpandedGroups}
          showProjectRelations={showProjectRelations}
          setShowProjectRelations={setShowProjectRelations}
        />

        {/* Footer (sticky) — the slug (left, last segment only; the full value on
            `title=` hover) plus the indigo-filled primary 「All Details」 (the one and
            only emphasis). The root is an unpadded scroll container, so it anchors
            with `sticky bottom-0` and no negative margins — it stays inside the
            viewport even when the content overflows (P3-③). */}
        </div>
        <PanelFooter
          slug={slug}
          labels={labels}
          onOpenFullDetail={onOpenFullDetail}
          onProjectSourceAction={onProjectSourceAction}
          projectSourceBusy={projectSourceBusy}
          showProjectSource={showProjectSource}
          projectLayout={projectLayout}
          showSourceRemedy={showSourceRemedy}
        />
      </div>
    </Surface>
  );
}
