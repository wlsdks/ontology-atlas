"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageCircle, Pencil } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { MtimeConflictBadge } from "@/shared/ui/mtime-conflict-badge";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { controlClass, fieldClass } from "@/shared/ui/control-class";
import type { MeaningGapKind } from "@/entities/knowledge-graph";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import {
  RowActionMenu,
  type QueueRowAbilities,
} from "../parts/QueueRowActions";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import {
  ACCENT_CHIP_IDLE,
  ACCENT_CHIP_OPEN,
  FIX_ROW_SECONDARY_INK,
  FIX_ROW_TERTIARY_INK,
  type FixRowLabels,
} from "../parts/FixRow";

/**
 * Meaning-gap rows that finish a one-sentence to-do in place, by expanding the row (no new route or modal).
 * Contracts: the sentence above Save names the `.md` path and key to be written; cancel and Esc change no file, and
 * with text entered closing takes a second press; the save carries `expected_mtime`, so a concurrent edit is
 * refused and re-read, never overwritten; the save locks on the pressed frame, so two presses never write twice;
 * motion uses only the row disclosure grammar (`.ai-row-disclosure`, `app/styles/base-motion.css`).
 */

export interface MeaningGapLabels extends FixRowLabels {
  /** Closes the inline input; opening it uses the list-wide "fix it myself" label. */
  writeHereClose: string;
  definitionPlaceholder: string;
  domainLegend: string;
  confirmDefinition: (file: string) => string;
  confirmDomain: (file: string, value: string) => string;
  save: string;
  saving: string;
  cancel: string;
  cancelArmed: string;
  saved: string;
  failed: (message: string) => string;
  conflict: string;
  needsText: string;
  needsDomain: string;
}

/** This form's own "you picked this" ink for the filled domain chip, from existing `--color-indigo-line-*` values. */
const ACCENT_CHIP_FILLED =
  "font-[var(--font-weight-signature)] border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] hover:border-[color:var(--color-indigo-line-a45)]";

type RowPhase =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "saved"; written: string }
  | { kind: "failed"; message: string }
  | { kind: "conflict" };

interface RowUiState {
  value: string;
  /** Whether cancel has warned that the typed text will be lost (two-step confirm). */
  cancelArmed: boolean;
  phase: RowPhase;
}

const EMPTY_UI: RowUiState = { value: "", cancelArmed: false, phase: { kind: "editing" } };
/** How long the save confirmation stays before the row leaves the queue. */
const SAVED_ROW_LINGER_MS = 2200;

export interface MeaningGapSectionProps {
  gapKind: MeaningGapRow["gap"];
  rows: MeaningGapRow[];
  /** The one plain sentence every row of this gap kind states. Owned by the list, not by a heading. */
  sentence: string;
  abilities: QueueRowAbilities;
  /** Candidates for an unassigned-parent row; unused on an undefined-meaning row. */
  domainChoices?: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * Omitted outside the desktop app, and the item is then not drawn. Carries only the gap kind; the destination
   * composes the sentence.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  /** Writes one vault frontmatter field with `expectedMtime`; resolves on success and throws `VaultConflictError` on a conflict. */
  onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
  labels: MeaningGapLabels;
}

export function MeaningGapSection({
  gapKind,
  rows,
  sentence,
  abilities,
  domainChoices = [],
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  onWrite,
  labels,
}: MeaningGapSectionProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [uiById, setUiById] = useState<ReadonlyMap<string, RowUiState>>(new Map());
  /**
   * Snapshots of rows being worked on, drawn after they leave the queue data: the save confirmation must linger,
   * and a re-read or another writer shifting the list must not lose the sentence being typed.
   */
  const [pinnedRows, setPinnedRows] = useState<readonly MeaningGapRow[]>([]);
  const pin = useCallback((row: MeaningGapRow) => {
    setPinnedRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
  }, []);
  // A ref, not state: `setState` lands on the next render, so the duplicate-save guard must be synchronous.
  const savingIdsRef = useRef<Set<string>>(new Set());

  const patchUi = useCallback((id: string, next: Partial<RowUiState>) => {
    setUiById((prev) => {
      const map = new Map(prev);
      map.set(id, { ...(map.get(id) ?? EMPTY_UI), ...next });
      return map;
    });
  }, []);

  const closeRow = useCallback((id: string) => {
    setOpenRowId((current) => (current === id ? null : current));
    setPinnedRows((prev) => prev.filter((row) => row.id !== id));
    setUiById((prev) => {
      if (!prev.has(id)) return prev;
      const map = new Map(prev);
      map.delete(id);
      return map;
    });
  }, []);

  const handleSave = useCallback(
    async (row: MeaningGapRow, value: string) => {
      if (savingIdsRef.current.has(row.id)) return;
      savingIdsRef.current.add(row.id);
      patchUi(row.id, { phase: { kind: "saving" }, cancelArmed: false });
      try {
        await onWrite(row, value);
        savingIdsRef.current.delete(row.id);
        pin(row);
        patchUi(row.id, { phase: { kind: "saved", written: value } });
        window.setTimeout(() => closeRow(row.id), SAVED_ROW_LINGER_MS);
      } catch (error) {
        savingIdsRef.current.delete(row.id);
        if (error instanceof Error && error.name === "VaultConflictError") {
          patchUi(row.id, { phase: { kind: "conflict" } });
          return;
        }
        patchUi(row.id, {
          phase: { kind: "failed", message: error instanceof Error ? error.message : String(error) },
        });
      }
    },
    [closeRow, onWrite, patchUi, pin],
  );

  const liveIds = new Set(rows.map((row) => row.id));
  // A pinned row is drawn in its original position, re-sorted by `buildMeaningGapRows`'s name order, so the row
  // just touched is not found again by eye at the end.
  const visibleRows = [...rows, ...pinnedRows.filter((row) => !liveIds.has(row.id))].sort(
    (a, b) => a.title.localeCompare(b.title),
  );
  if (visibleRows.length === 0) return null;

  // No section chrome: these rows join the tab's one flat list. The component owns only the shared state of a run of rows.
  return (
    <>
      {visibleRows.map((row) => (
        <MeaningGapRowView
          key={row.id}
          row={row}
          gapKind={gapKind}
          sentence={sentence}
          open={openRowId === row.id}
          ui={uiById.get(row.id) ?? EMPTY_UI}
          abilities={abilities}
          domainChoices={domainChoices}
          mapHref={mapHref}
          sourceHref={sourceHref}
          builderHref={builderHref}
          askAgentHref={askAgentHref}
          onOpen={() => {
            // Pin on expansion, so the field being typed into survives a vault re-read.
            pin(row);
            setOpenRowId(row.id);
          }}
          onClose={() => closeRow(row.id)}
          onPatch={(next) => patchUi(row.id, next)}
          onSave={(value) => void handleSave(row, value)}
          labels={labels}
        />
      ))}
    </>
  );
}

function MeaningGapRowView({
  row,
  gapKind,
  sentence,
  open,
  ui,
  abilities,
  domainChoices,
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  onOpen,
  onClose,
  onPatch,
  onSave,
  labels,
}: {
  row: MeaningGapRow;
  gapKind: MeaningGapRow["gap"];
  sentence: string;
  open: boolean;
  ui: RowUiState;
  abilities: QueueRowAbilities;
  domainChoices: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * Omitted outside the desktop app, and the item is then not drawn. Carries only the gap kind; the destination
   * composes the sentence.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  onOpen: () => void;
  onClose: () => void;
  onPatch: (next: Partial<RowUiState>) => void;
  onSave: (value: string) => void;
  labels: MeaningGapLabels;
}) {
  const saved = ui.phase.kind === "saved";
  const saving = ui.phase.kind === "saving";

  // The domain chips are an exclusive single selection, so they are a radiogroup; an empty initial value is a
  // legitimate unselected radiogroup and the hook makes the first item the tab stop (APG). Not migrated
  // to `variant='chips'`: the value layer has no chip hover, so the inactive chip would lose its hover feedback.
  const domainGroup = useRovingRadioGroup({
    value: ui.value,
    values: domainChoices.map((c) => c.value),
    onChange: (value) => onPatch({ value, cancelArmed: false }),
    busy: saving,
  });
  // Stays open through the save confirmation so form and confirmation share one height transition.
  const detailOpen = open || saved;
  const { mounted, boxRef, contentRef } = useRowDisclosure(detailOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && gapKind === "missing-definition") inputRef.current?.focus();
  }, [open, gapKind]);

  const dirty = ui.value.trim().length > 0;
  const requestClose = () => {
    // With text entered it asks once more, so the way back stays on screen.
    if (dirty && !ui.cancelArmed) {
      onPatch({ cancelArmed: true });
      return;
    }
    onClose();
  };

  const canSave = dirty && !saving;
  const candidate = { id: row.id, title: row.title };
  const askAgentUrl = askAgentHref?.(row.nodeId, row.gap) ?? null;
  const confirmLine =
    gapKind === "missing-definition"
      ? labels.confirmDefinition(row.ownSlug)
      : labels.confirmDomain(row.ownSlug, ui.value);

  return (
    <div
      data-testid="do-next-meaning-gap-row"
      className="min-w-0 border-b border-[color:var(--color-divider)] last:border-b-0"
      onKeyDown={(event) => {
        // Two-step Escape: an expanded row consumes it; a collapsed row lets it bubble to the tab or palette.
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        requestClose();
      }}
    >
      {/* The same shell and column order as the queue's other rows, so the list keeps one rhythm. */}
      <div
        data-testid="do-next-item"
        data-fix-kind={gapKind}
        className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2.5"
      >
        <OntologyMapKindGlyph kind={row.nodeKind} size={13} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
            {row.title}
          </span>
          {/* The row states the observed fact itself; `break-keep` stops Korean breaking mid-word. */}
          <span
            data-testid="do-next-item-why"
            className="min-w-0 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]"
          >
            {sentence}
          </span>
        </div>
        <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
          {/* Primary: hand it to the map's agent with the sentence written. Only where that surface exists, so a browser row
             falls through to its next-best action. */}
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
          {/* Secondary: the inline write. A saved row has nothing to open or close; its confirmation states the state. */}
          {abilities.canWriteVault && !saved ? (
            <button
              type="button"
              data-testid="meaning-gap-write-toggle"
              aria-expanded={open}
              onClick={() => (open ? requestClose() : onOpen())}
              // Emphasized whether open or not: it is a disclosure, not a selection, so `tone: 'accentOnTint'`, not pressed ink.
              className={controlClass({
                shape: "chip",
                size: "md",
                tone: "accentOnTint",
                className: open ? ACCENT_CHIP_OPEN : ACCENT_CHIP_IDLE,
              })}
            >
              <Pencil size={ICON_SIZE.sm} aria-hidden />
              {open ? labels.writeHereClose : labels.fixHere}
            </button>
          ) : (
            <Link
              href={builderHref(row.nodeId)}
              data-testid="do-next-item-fix"
              className={controlClass({ shape: "chip", size: "md", className: FIX_ROW_SECONDARY_INK })}
            >
              {labels.fixHere}
            </Link>
          )}
          {/* Tertiary: go look at it, without promising a change. */}
          <Link
            href={mapHref(row.nodeId)}
            data-testid="do-next-item-view"
            className={controlClass({
              shape: "chip",
              size: "md",
              tone: "muted",
              className: FIX_ROW_TERTIARY_INK,
            })}
          >
            {labels.viewOnMap}
          </Link>
          <RowActionMenu
            sourceHref={sourceHref(row.nodeId)}
            builderHref={builderHref(row.nodeId)}
            hideBuilder
            handoffPayload={row.handoffPayload}
            candidate={candidate}
            abilities={abilities}
            labels={labels}
          />
        </span>
      </div>

      <div
        ref={boxRef}
        className="ai-row-disclosure"
        data-state={detailOpen ? "open" : "closed"}
        data-testid="meaning-gap-disclosure"
        // Stays in the DOM while collapsing, so `inert` keeps the hidden input out of the tab order and the accessibility tree.
        inert={!detailOpen}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body pb-3">
            <div
              key={saved ? "saved" : "draft"}
              className="ai-row-swap flex flex-col gap-2"
            >
              {saved ? (
                <p
                  data-testid="meaning-gap-saved"
                  role="status"
                  className="flex items-start gap-1.5 text-label leading-label text-[color:var(--color-indigo-accent)]"
                >
                  <Check size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
                  <span>
                    {labels.saved}
                    <span className="text-[color:var(--color-text-tertiary)]">
                      {" · "}
                      {ui.phase.kind === "saved" ? ui.phase.written : ""}
                    </span>
                  </span>
                </p>
              ) : (
                <>
                  {gapKind === "missing-definition" ? (
                    <input
                      ref={inputRef}
                      data-testid="meaning-gap-definition-input"
                      type="text"
                      value={ui.value}
                      maxLength={160}
                      disabled={saving}
                      aria-label={labels.definitionPlaceholder}
                      placeholder={labels.definitionPlaceholder}
                      onChange={(event) =>
                        onPatch({ value: event.target.value, cancelArmed: false })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canSave) {
                          event.preventDefault();
                          onSave(ui.value.trim());
                        }
                      }}
                      // The field's measure fits one sentence instead of the full row width.
                      className={fieldClass({ size: "md", className: "w-full max-w-2xl" })}
                    />
                  ) : (
                    <fieldset className="min-w-0" disabled={saving}>
                      <legend className="pb-1 text-label text-[color:var(--color-text-quaternary)]">
                        {labels.domainLegend}
                      </legend>
                      <div {...domainGroup.groupProps} aria-label={labels.domainLegend} className="flex flex-wrap gap-1.5">
                        {domainChoices.map((choice, index) => {
                          const active = ui.value === choice.value;
                          return (
                            <button
                              key={choice.value}
                              {...domainGroup.itemProps(index)}
                              type="button"
                              data-testid="meaning-gap-domain-chip"
                              // A selection, so its pressed ink comes from the ramp's `active`, the one app-wide pressed set.
                              className={controlClass({
                                shape: "chip",
                                size: "md",
                                active,
                                className: active
                                  ? ""
                                  : "hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]",
                              })}
                            >
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* States the file to change before the press. */}
                  <p
                    data-testid="meaning-gap-confirm"
                    className="text-label leading-label text-[color:var(--color-text-quaternary)]"
                  >
                    {dirty ? confirmLine : gapKind === "missing-definition" ? labels.needsText : labels.needsDomain}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="meaning-gap-save"
                      onClick={() => onSave(ui.value.trim())}
                      disabled={!canSave}
                      // The disabled affordance comes from the ramp; a hand-written `disabled:opacity-50` left cursor and hover on.
                      className={controlClass({
                        shape: "chip",
                        size: "md",
                        tone: "accentOnTint",
                        className: ACCENT_CHIP_FILLED,
                      })}
                    >
                      {saving ? labels.saving : labels.save}
                    </button>
                    <button
                      type="button"
                      data-testid="meaning-gap-cancel"
                      onClick={requestClose}
                      disabled={saving}
                      className={controlClass({
                        shape: "chip",
                        size: "md",
                        className: "hover:text-[color:var(--color-text-primary)]",
                      })}
                    >
                      {labels.cancel}
                    </button>
                    {ui.cancelArmed ? (
                      <span
                        data-testid="meaning-gap-cancel-armed"
                        role="status"
                        className="text-label leading-label text-[color:var(--color-status-warning)]"
                      >
                        {labels.cancelArmed}
                      </span>
                    ) : null}
                  </div>

                  {ui.phase.kind === "conflict" ? (
                    <MtimeConflictBadge message={labels.conflict} />
                  ) : null}
                  {ui.phase.kind === "failed" ? (
                    <p
                      data-testid="meaning-gap-failed"
                      role="alert"
                      className="text-label leading-label text-[color:var(--color-status-danger)]"
                    >
                      {labels.failed(ui.phase.message)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
