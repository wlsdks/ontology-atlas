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
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { useRowDisclosure } from "@/shared/lib/list-rows/use-row-disclosure";
import { useViewportBelow } from "@/shared/lib/use-viewport-below";
import { Button, LastEditSubjectRow, MtimeConflictBadge, Surface, SummaryFreshnessRow } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/transient-surface";
import { type DetailActionItem, DetailActionMenu } from "./detail-panel/DetailActionMenu";
import { IdentityZone } from "./detail-panel/IdentityZone";
import { PanelFooter } from "./detail-panel/PanelFooter";
import { ProjectSourceRemedy } from "./detail-panel/ProjectSourceRemedy";
import { ProjectSourcePendingRows, ProjectSourceStatusIcon } from "./detail-panel/ProjectSourceRows";
import { RelationsZone } from "./detail-panel/RelationsZone";
import type { OntologyMapDetailPanelProps } from "./detail-panel/types";

/**
 * ontology-map "component datasheet" node panel
 * (`docs/design/ontology-map.md` §5). Rendered ONLY when the
 * `atlas:feature:ontology-map` flag is on — the flag-off path keeps the
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
 * a wide 28px between-group rhythm (`--map-panel-zone-gap`), each group
 * self-evident: a directional glyph + bold plain label + indigo count chip +
 * underline, rows carrying the canvas kind glyph (no competing kind word).
 * Footer stays sticky: slug (quiet) + ONE indigo-filled primary "full detail".
 * The floating power dot was removed (unexplained mark); `powered` now only
 * feeds the freshness fallback word.
 *
 * FSD: this widget owns its own prop shape — the view (`HomePage`) maps
 * `TopologyNodeFocusModel` into these props, so the import direction stays
 * view → widget. Colors/sizes come from `--map-panel-*` tokens.
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
 * `map-datasheet.ts#buildV2EvidenceRows`). It reuses
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

/**
 * The action row's primary. **One radius for the row** (interaction audit, 2026-09-25): the
 * primary was the Button's `rounded-panel` (12) in one branch and `rounded-card` in two others,
 * beside chip-radius menu triggers (6), so one row drew three corners. The map panel's controls
 * are chip-radius (`--map-panel-row-radius`), so the primary joins them — the fill carries the
 * emphasis, not the corner.
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
   * **The layout is decided by the kind, not by when the receipt lands** (2026-09-25 sweep).
   *
   * Everything a project draws differently — the receipt block, the "Concept document"
   * meta line, the hairline over the actions, the folded relations, the footer without a
   * slug — used to wait for `projectSource`, which arrives a native read (and on a bound
   * folder, a repository walk) after the panel. So the panel opened looking finished in
   * another layout and, 710 ms later, rebuilt itself: a block inserted above the buttons,
   * the meta line rewritten, the relations folded, every button pushed down. While the
   * receipt is read the panel is already the project's, and the receipt's place is held
   * by its own heading and a pending line (`ProjectSourcePendingRows`).
   */
  const projectSourcePending = isProject && projectSource === null && projectSourceLoading;
  const projectLayout = showProjectSource || projectSourcePending;
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

  return (
    /* `Surface` carries the way out (2026-08-03). The parent (HomePage) used to
       open the window with `usePanelPresence` and dictate the class through a
       `presence` prop, which made «does this surface have an exit» a fact living
       outside this file.

       The inspector can occupy nearly the full window height. Use the existing
       large-surface fade: the camera approaches the target while the reading
       surface remains stationary. Small menus inside it retain chrome motion.

       The outer box carries **width only** — the inner box is the scroll container
       (max-height plus overflow-y-auto) and the sticky footer anchors to that
       scrollport, so that role is not moved. */
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
        // P3-③ (2026-07-21 retention round) — this panel is fixed-anchored to
        // `--topology-node-popover-top` (HomePage's positioner) but had no height
        // constraint of its own, so on a node with many connections the content
        // overflowed the viewport and pushed the "Full details" footer off screen,
        // out of the mouse's reach (measured at 1440×900, y=911). A viewport-based
        // max-height plus internal scrolling clamps the panel so it is always
        // anchored wholly inside the viewport. The cap is
        // `--map-inspector-max-height`, this surface's own alias — below `lg`
        // it becomes a bottom sheet capped so the map keeps its majority, and the
        // meaning editor sharing this anchor must not inherit that (it is a form). Mockup redesign (2026-07-24) — the
        // root has no padding and acts only as the scroll container, and each zone
        // (identity/ops/relations) carries its own padding. That is what lets the
        // full-bleed zone divider (`zdiv`) and the sticky footer anchor with no
        // negative margins.
        className={[
          // Width is decided by the outer `Surface` (including the consumer
          // className's responsive width override) — here it only fills that width
          // and carries the remaining material.
          "flex w-full flex-col",
          "max-h-[var(--map-inspector-max-height)] overflow-y-auto",
          "rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)]",
          "bg-[color:var(--map-panel-surface)]",
          "shadow-[var(--map-panel-shadow)]",
        ].join(" ")}
      >
        {/* ZONE 1 · IDENTITY — a balanced header: the name hero (left) plus the kind
            badge and close (right), and below, freshness (left) plus the domain chip
            (right). Both sides carry mass, so no gap opens on the right and it holds
            up for long names too. */}
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
          {summaryHistoryUnavailable && labels.summaryHistoryUnavailable ? (
            <p role="status" data-testid="summary-history-unavailable" className="text-label text-[color:var(--color-text-tertiary)]">
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
                  className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-secondary)]"
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
                    {labels.sourceKind ? (
                      <span className="ml-auto shrink-0 font-mono text-label text-[color:var(--map-panel-text-quaternary)]">
                        {labels.sourceKind}
                      </span>
                    ) : null}
                  </div>
                  <div className="ai-row-swap flex items-center justify-between gap-3">
                    <span>{labels.sourceMeasuredAt}</span>
                    <span className="shrink-0">{labels.sourceCurrentness}</span>
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
                          <span className="font-[var(--font-weight-signature)]">{labels.sourceGapLabel}: </span>
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
                      The card's 2px lead-in is padding on the measured body, not a margin on the
                      card: a child's top margin collapses through the body, so the disclosure
                      sized itself 2px short and its `overflow: hidden` cut the card's bottom
                      border off (2026-09-25 sweep, at 1512 and 1040).
                    */
                    <div ref={remedyContentRef} className="ai-row-disclosure-body pt-0.5">
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
              {/* The failure answers the press, so it stands under the button that was pressed
                  (2026-09-25 sweep). Inserted above the remedy it pushed the button down from
                  under the pointer, and the keyboard's focus fell to `<body>`. */}
              {projectSourceError ? (
                <span
                  role="status"
                  data-testid="map-project-source-error"
                  className="text-[color:var(--color-status-danger)]"
                >
                  {projectSourceError}
                </span>
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
              <Button size="sm" onClick={meaningReview.onOpen} data-testid="map-detail-panel-action-meaning" data-action-role="primary" className={PRIMARY_ACTION_CLASS}>
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
