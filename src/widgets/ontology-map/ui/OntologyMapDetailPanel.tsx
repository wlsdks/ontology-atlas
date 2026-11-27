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
  AlignLeft,
  CircleHelp,
  Copy,
  FileText,
  GitBranch,
  Orbit,
  PencilLine,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useHeldValue } from "@/shared/lib/render-timing/use-presence";
import { useRowDisclosure } from "@/shared/lib/list-rows/use-row-disclosure";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { Button, Surface, SummaryFreshnessRow, Textarea } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";
import { CodeRow } from "./detail-panel/CodeRow";
import { type DetailActionItem, DetailActionMenu } from "./detail-panel/DetailActionMenu";
import { IdentityZone } from "./detail-panel/IdentityZone";
import {
  countReasonsMissing,
  type JudgmentAction,
  type JudgmentItem,
  JudgmentZone,
  type PanelEmphasis,
} from "./detail-panel/JudgmentZone";
import { MeaningZone } from "./detail-panel/MeaningZone";
import { PanelFooter, panelActionClass } from "./detail-panel/PanelFooter";
import { ProjectSourceRemedy } from "./detail-panel/ProjectSourceRemedy";
import { ProjectSourcePendingRows, ProjectSourceStatusIcon } from "./detail-panel/project-source-status";
import { RelationsZone } from "./detail-panel/RelationsZone";
import type { OntologyMapDetailPanelProps } from "./detail-panel/detail-panel-props";

/**
 * The compact concept panel (`docs/features/map/node-detail-actions.md`). Its first screen answers
 * what this is, what moves if it changes, and whether a person must settle something first; it
 * holds at most one emphasised thing, named on its root as `data-panel-emphasis`.
 */
export function OntologyMapDetailPanel({
  nodeId,
  slug,
  title,
  kind,
  owner,
  definition,
  review,
  summaryStaleness = null,
  summaryHistoryUnavailable = false,
  powered,
  groups,
  reach = null,
  updatedAtLabel = null,
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
  onRename,
  onSaveDescription,
  deleteConcept,
  onAskAgent,
  meaningReview,
  discoveryAction,
  codeRow,
  suppressPrimaryAction = false,
  onClose,
  closeButtonRef,
  onEnterRealm,
  onOpenFullDetail,
  open,
  onExited,
  className,
  showHandoff = true,
  projectSource = null,
  projectSourceLoading = false,
  onProjectSourceAction,
  projectSourceBusy = false,
  projectSourceError = null,
  projectSourceProposal = null,
  onProjectSourceConfirmProposal,
}: OntologyMapDetailPanelProps) {
  const tPanel = useTranslations("conceptPanel");
  const tReview = useTranslations("vaultWidgets.parts.sidebar.review");
  const tEdit = useTranslations("conceptPanel.edit");
  const [editMode, setEditMode] = useState<ConceptEditMode | null>(null);
  const isProject = kind === "project";
  const isDocument = kind === "document";
  const showProjectSource = isProject && projectSource !== null;
  /**
   * The layout is decided by the kind, not by when `projectSource` arrives, so the panel does not
   * rebuild itself when the receipt lands. Until then its place is held by its heading and a pending
   * line (`ProjectSourcePendingRows`).
   */
  const projectSourcePending = isProject && projectSource === null && projectSourceLoading;
  const projectLayout = showProjectSource || projectSourcePending;
  /** The remedy block stands beside the diagnosis and appears only when there is a gap. */
  const showSourceRemedy = Boolean(
    showProjectSource
    && projectSource.topGap
    && labels.sourceAction
    && onProjectSourceAction,
  );
  /*
   * The remedy arrives after the panel opens (the vault root is measured first), so it pushes its
   * siblings with the shared in-flow disclosure (`.ai-row-disclosure`) instead of jolting them.
   */
  const {
    mounted: remedyMounted,
    boxRef: remedyBoxRef,
    contentRef: remedyContentRef,
  } = useRowDisclosure(showSourceRemedy);
  /*
   * The diagnosis above the remedy arrives the same way, and its text is held through the exit so
   * a gap that closes leaves as itself, not as "no follow-up needed".
   */
  const showSourceGap = Boolean(showProjectSource && projectSource.topGap && labels.sourceGap);
  const heldSourceGap = useHeldValue(showSourceGap ? labels.sourceGap : null);
  const {
    mounted: gapMounted,
    boxRef: gapBoxRef,
    contentRef: gapContentRef,
  } = useRowDisclosure(showSourceGap);
  /** Beside an agent panel the handoff copy is a detour, so it waits in the More menu. */
  const handoffStandsBesideStatus = Boolean(
    showProjectSource && projectSource.nextAction.id === "use_current_evidence" && !onAskAgent,
  );
  const sourceActionStandsBesideStatus = Boolean(
    labels.sourceAction
    && !showSourceRemedy
    && (projectSource?.nextAction.id !== "use_current_evidence" || handoffStandsBesideStatus),
  );
  const showInlineHandoff = showHandoff && !handoffStandsBesideStatus;
  const [actionMenu, setActionMenu] = useState<"edit" | "more" | null>(null);

  const openDocument: JudgmentAction | undefined = documentHref
    ? { label: labels.actionDocument, emphasis: "open-document", href: documentHref }
    : undefined;
  const reasonsMissing = countReasonsMissing(kind, reach, groups);
  const summaryLine = summaryHistoryUnavailable && labels.summaryHistoryUnavailable ? (
    <span role="status" data-testid="summary-history-unavailable" className="text-[color:var(--map-panel-text-tertiary)]">
      {labels.summaryHistoryUnavailable}
    </span>
  ) : summaryStaleness && labels.summaryFreshnessPrefix && labels.summaryFreshnessLag && labels.summaryFreshnessAction ? (
    <SummaryFreshnessRow
      prefixLabel={labels.summaryFreshnessPrefix}
      lagLabel={labels.summaryFreshnessLag}
      actionLabel={labels.summaryFreshnessAction}
    />
  ) : null;
  const judgmentItems: JudgmentItem[] = [
    ...(review?.raised
      ? [{ id: "raised" as const, line: tReview("docChipRaised"), note: review.raised.note, action: openDocument }]
      : []),
    ...(review?.changedSinceReview
      ? [{ id: "changed-since-review" as const, line: tReview("changedPlain"), action: openDocument }]
      : []),
    ...(review?.unverifiable ? [{ id: "unverifiable" as const, line: tReview("unverifiablePlain") }] : []),
    ...(reasonsMissing > 0
      ? [{
          id: "reasons-missing" as const,
          line: tPanel("reasonsMissing", { count: reasonsMissing }),
          action: meaningReview && onAskAgent
            ? { label: meaningReview.label, emphasis: "meaning-review" as const, onSelect: meaningReview.onOpen }
            : undefined,
        }]
      : []),
    ...(mtimeConflict ? [{ id: "edit-conflict" as const, line: <span role="status">{labels.editConflictMessage}</span> }] : []),
    ...(summaryLine ? [{ id: "summary" as const, line: summaryLine }] : []),
  ];
  const lead = judgmentItems[0];
  const emphasis: PanelEmphasis = showSourceRemedy
    ? "project-source"
    : lead
      ? lead.action && !suppressPrimaryAction ? lead.action.emphasis : "judgment"
      : isDocument && documentHref && !suppressPrimaryAction
        ? "open-document"
        : "none";

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
    ...(onRename
      ? [{ label: tEdit("rename"), icon: <PencilLine size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-rename", onSelect: () => setEditMode("rename") }]
      : []),
    ...(onSaveDescription
      ? [{ label: tEdit("describe"), icon: <AlignLeft size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-describe", onSelect: () => setEditMode("describe") }]
      : []),
    ...(deleteConcept
      ? [{ label: tEdit("delete"), icon: <Trash2 size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-delete", onSelect: () => setEditMode("delete") }]
      : []),
  ];
  const moreActions: DetailActionItem[] = [
    ...(meaningReview
      ? [{ label: meaningReview.label, icon: <ScanSearch size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-meaning", onSelect: meaningReview.onOpen }]
      : []),
    ...(showInlineHandoff
      ? [{ label: labels.actionCopyHandoff, icon: <Copy size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-handoff", onSelect: () => onCopyHandoff(handoffText) }]
      : []),
    ...(discoveryAction
      ? [{ label: discoveryAction.label, icon: <CircleHelp size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-gray-area", onSelect: discoveryAction.onOpen }]
      : []),
    ...(documentHref && !isDocument
      ? [{ label: labels.actionDocument, icon: <FileText size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-document", href: documentHref }]
      : []),
    ...(onEnterRealm
      ? [{ label: labels.actionRealm, icon: <Orbit size={ICON_SIZE.sm} aria-hidden />, testId: "map-detail-panel-action-realm", onSelect: onEnterRealm }]
      : []),
  ];
  /*
   * Pressing a row swaps the panel's `key`, so the row leaves without `pointerleave`; the map's
   * emphasis is cleared once on unmount through the latest callbacks.
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
     * one scroll body, and the footer stays outside its clipping boundary.
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
        data-panel-emphasis={emphasis}
        data-primary-action-suppressed={suppressPrimaryAction ? "true" : undefined}
        onKeyDown={handleKeyDown}
        // The viewport cap keeps the footer in reach. `--map-inspector-max-height` is this surface's alias:
        // below `lg` it is a bottom sheet the meaning editor sharing this anchor must not inherit.
        className={[
          "flex w-full flex-col",
          "max-h-[var(--map-inspector-max-height)] overflow-hidden",
          "rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)]",
          "bg-[color:var(--map-panel-surface)]",
          "shadow-[var(--map-panel-shadow)]",
        ].join(" ")}
      >
        <div data-testid="map-detail-panel-body" className="min-h-0 overflow-y-auto">
          <IdentityZone
            nodeId={nodeId}
            title={title}
            kind={kind}
            owner={owner}
            review={review}
            powered={powered}
            updatedAtLabel={updatedAtLabel}
            labels={labels}
            onSelectConnection={onSelectConnection}
            onHoverConnection={onHoverConnection}
            onClose={onClose}
            closeButtonRef={closeButtonRef}
            titleEditor={
              editMode === "rename" && onRename ? (
                <InPlaceEditor
                  multiline={false}
                  label={tEdit("renameLabel")}
                  initial={title}
                  testId="map-detail-panel-rename"
                  onSave={onRename}
                  onDone={() => setEditMode(null)}
                />
              ) : undefined
            }
          />
          {editMode === "delete" && deleteConcept ? (
            <DeleteConfirm
              title={title}
              referrers={deleteConcept.referrers}
              onDelete={deleteConcept.onDelete}
              onDone={() => setEditMode(null)}
            />
          ) : null}

          <hr className="h-px border-0 bg-[color:var(--map-panel-zone-divider)]" />

          <JudgmentZone items={judgmentItems} />

          <div className="pt-3">
            {/* The project's source receipt sits in the judgment slot. While it is read the same
                element holds its place, so the rows arrive where they will stay and the live region
                announcing them is the one that was already there. */}
            {projectLayout ? (
              <div className="px-[var(--map-panel-pad)] pb-3">
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
                    <span data-testid="map-project-source-heading" className="sr-only">
                      {labels.sourceHeading}
                    </span>
                  ) : null}
                  {showProjectSource ? (
                    /* Keyed apart from the pending rows, so these mount fresh and `ai-row-swap`
                       crossfades them in: the line that said "reading" becomes the answer in place. */
                    <Fragment key="read">
                      <div className="ai-row-swap flex min-w-0 items-center gap-1.5 text-[color:var(--map-panel-text-secondary)]">
                        <ProjectSourceStatusIcon status={projectSource.status} />
                        <span className="min-w-0 flex-1 truncate font-[var(--font-weight-signature)]">{labels.sourceStatus}</span>
                        {/* With no gap the next action stays quiet beside the status: nothing needs a person. */}
                        {sourceActionStandsBesideStatus ? (
                          onProjectSourceAction ? (
                            <button
                              type="button"
                              onClick={() => { void onProjectSourceAction(); }}
                              disabled={projectSourceBusy}
                              aria-busy={projectSourceBusy}
                              data-testid="map-project-source-action"
                              className={`${panelActionClass(false)} disabled:cursor-wait`}
                            >
                              {projectSourceBusy ? labels.sourceBusy ?? labels.sourceAction : labels.sourceAction}
                            </button>
                          ) : (
                            <span className="shrink-0">{labels.sourceAction}</span>
                          )
                        ) : null}
                      </div>
                    </Fragment>
                  ) : (
                    <ProjectSourcePendingRows key="pending" label={labels.sourcePending} />
                  )}
                  {/* One flex item for the diagnosis and its remedy: the column's gap is paid once,
                      and the gap line's own spacing rides inside its disclosure so it opens from zero. */}
                  <div>
                    {gapMounted ? (
                      <div
                        ref={gapBoxRef}
                        className="ai-row-disclosure"
                        data-state={showSourceGap ? "open" : "closed"}
                      >
                        <div ref={gapContentRef} className="ai-row-disclosure-body pb-2">
                          <p data-testid="map-project-source-gap" className="text-[color:var(--map-panel-text-secondary)]">
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
                        /* The card's 2px lead-in is padding on the measured body, not a margin, which
                           would collapse through it and let `overflow: hidden` cut the card's border. */
                        <div ref={remedyContentRef} className="ai-row-disclosure-body pt-0.5">
                          <ProjectSourceRemedy
                            why={projectSource?.nextAction.id === "remeasure_source" ? undefined : labels.sourceWhy}
                            actionLabel={labels.sourceAction}
                            busyLabel={labels.sourceBusy}
                            busy={projectSourceBusy}
                            onAction={onProjectSourceAction}
                            proposal={projectSourceProposal}
                            onConfirmProposal={onProjectSourceConfirmProposal}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {/* The failure stands under the pressed button: above the remedy it would push the
                      button from under the pointer and drop keyboard focus to `<body>`. */}
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
                    <p data-testid="map-project-source-record" className="truncate text-label text-[color:var(--map-panel-text-tertiary)]">
                      {labels.sourceRecord ? <span className="sr-only">{labels.sourceRecord}: </span> : null}
                      {[labels.sourceMeasuredAt, labels.sourceKind, labels.sourceCurrentness].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {editMode === "describe" && onSaveDescription ? (
              <InPlaceEditor
                multiline
                label={tEdit("describeLabel")}
                initial={definition ?? ""}
                testId="map-detail-panel-describe"
                onSave={onSaveDescription}
                onDone={() => setEditMode(null)}
              />
            ) : (
              <MeaningZone definition={definition} />
            )}
          </div>

          {codeRow ? <CodeRow row={codeRow} /> : null}

          <hr className="h-px border-0 bg-[color:var(--map-panel-zone-divider)]" />

          <RelationsZone
            kind={kind}
            reach={reach}
            groups={groups}
            labels={labels}
            onSelectConnection={onSelectConnection}
            onHoverConnection={onHoverConnection}
            onOpenFullDetail={onOpenFullDetail}
          />
        </div>
        <PanelFooter
          slug={slug}
          labels={labels}
          onAskAgent={onAskAgent}
          documentAction={isDocument && documentHref ? { href: documentHref, filled: !lead && emphasis === "open-document" } : null}
          onOpenFullDetail={onOpenFullDetail}
          menus={
            <>
              {isDocument ? null : (
                <DetailActionMenu
                  label={labels.actionEditMenu}
                  triggerTestId="map-detail-panel-edit-menu-trigger"
                  menuTestId="map-detail-panel-edit-menu"
                  open={actionMenu === "edit"}
                  onOpenChange={(next) => setActionMenu(next ? "edit" : null)}
                  items={editActions}
                />
              )}
              <DetailActionMenu
                label={labels.actionMore}
                triggerTestId="map-detail-panel-more-menu-trigger"
                menuTestId="map-detail-panel-more-menu"
                iconOnly
                open={actionMenu === "more"}
                onOpenChange={(next) => setActionMenu(next ? "more" : null)}
                items={moreActions}
              />
            </>
          }
        />
      </div>
    </Surface>
  );
}

type ConceptEditMode = "rename" | "describe" | "delete";

/** One field that saves on Enter and leaves on Escape; the panel stays where it is. */
function InPlaceEditor({
  multiline,
  label,
  initial,
  testId,
  onSave,
  onDone,
}: {
  multiline: boolean;
  label: string;
  initial: string;
  testId: string;
  onSave: (value: string) => Promise<void>;
  onDone: () => void;
}) {
  const t = useTranslations("conceptPanel.edit");
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || (!multiline && !value.trim())) return;
    setSaving(true);
    try {
      await onSave(value);
      onDone();
    } catch {
      setSaving(false);
    }
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !isImeComposing(event)) {
      event.preventDefault();
      void save();
    }
  };
  const fieldProps = {
    label,
    className: "w-full",
    value,
    autoFocus: true,
    disabled: saving,
    onFocus: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => event.currentTarget.select(),
    onKeyDown: handleKeyDown,
    "data-testid": testId,
  };
  return (
    <div data-testid={`${testId}-editor`} className="flex flex-col gap-2 px-[var(--map-panel-pad)] pb-3">
      {multiline ? (
        <Textarea {...fieldProps} rows={3} autoGrow maxRows={8} onChange={(event) => setValue(event.target.value)} />
      ) : (
        <Input {...fieldProps} autoComplete="off" onChange={(event) => setValue(event.target.value)} />
      )}
      <div className="flex items-center gap-2">
        <span className="mr-auto text-label text-[color:var(--map-panel-text-quaternary)]">{t("keysHint")}</span>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving} data-testid={`${testId}-save`}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

/** Names what still points here before the file goes; the toast's Undo brings it back. */
function DeleteConfirm({
  title,
  referrers,
  onDelete,
  onDone,
}: {
  title: string;
  referrers: readonly { slug: string; title: string }[];
  onDelete: () => Promise<void>;
  onDone: () => void;
}) {
  const t = useTranslations("conceptPanel.edit");
  const [deleting, setDeleting] = useState(false);
  const shown = referrers.slice(0, 5);
  const confirm = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
    }
  };
  return (
    <div
      role="alertdialog"
      aria-label={t("deleteTitle", { title })}
      data-testid="map-detail-panel-delete-confirm"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onDone();
      }}
      className="mx-[var(--map-panel-pad)] mb-3 flex flex-col gap-2 rounded-[var(--chrome-radius-inner)] border border-[color:var(--map-panel-divider)] p-3"
    >
      <p className="text-body font-[var(--font-weight-strong)] text-[color:var(--map-panel-text-primary)]">{t("deleteTitle", { title })}</p>
      <p className="text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
        {referrers.length > 0 ? t("deleteReferrers", { count: referrers.length }) : t("deleteNoReferrers")}
      </p>
      {shown.length > 0 ? (
        <ul data-testid="map-detail-panel-delete-referrers" className="flex flex-col gap-0.5 text-label text-[color:var(--map-panel-text-secondary)]">
          {shown.map((referrer) => (
            <li key={referrer.slug} className="truncate">
              {referrer.title}
            </li>
          ))}
          {referrers.length > shown.length ? (
            <li className="text-[color:var(--map-panel-text-quaternary)]">{t("deleteMore", { count: referrers.length - shown.length })}</li>
          ) : null}
        </ul>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={deleting} autoFocus>
          {t("cancel")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void confirm()}
          disabled={deleting}
          data-confirm-step
          data-testid="map-detail-panel-delete-confirm-button"
        >
          {t("deleteConfirm")}
        </Button>
      </div>
    </div>
  );
}
