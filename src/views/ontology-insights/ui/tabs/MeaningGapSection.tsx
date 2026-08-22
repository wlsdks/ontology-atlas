"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { useRowDisclosure } from "@/shared/lib/use-row-disclosure";
import { MtimeConflictBadge } from "@/shared/ui/mtime-conflict-badge";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass, fieldClass } from "@/shared/ui/control-class";
import type { MeaningGapKind } from "@/entities/knowledge-graph";
import type { DomainChoice, MeaningGapRow } from "../../lib/meaning-gap-rows";
import {
  HandoffCopyButton,
  RowActionMenu,
  type QueueRowAbilities,
  type QueueRowActionLabels,
} from "../parts/QueueRowActions";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

/**
 * **The section where a to-do that ends in one sentence is finished on the spot** — the first
 * slot of non-developer writing.
 *
 * Why a deeplink to another surface is not enough: putting a screen transition in the way of
 * writing one sentence kills the completion rate. The other surface stays the place for
 * assembling relations (many sockets); this is **for writing one field** — zero new routes,
 * zero new modals, a disclosure expansion of an existing row.
 *
 * The contracts it keeps:
 * - **State the file to change first.** Above the save button, a sentence names the `.md` path
 *   being edited and what will be written under which key (an abbreviated form of the consent
 *   grammar — the change is narrow enough, one file and one field, that a full dialog is excessive).
 * - **Cancel changes zero files.** Cancel and Esc never touch the file. With text entered it
 *   takes a second press to close (two-step), so nothing is lost by accident.
 * - **A concurrent edit is never silently overwritten.** The save carries `expected_mtime`, and
 *   if a person or an agent edited the same file in between the save is refused and the file is
 *   re-read — the next save then works from the new baseline.
 * - **It locks on the frame it is pressed.** There is no path where two presses write twice.
 * - **Motion uses only the list-row expansion grammar** (`.ai-row-disclosure`,
 *   `app/globals.css`) — it grows downward only, and the way out matches the way in.
 */

/**
 * The **ink** for this section's indigo chips — the layer the value layer (`controlClass`)
 * deliberately does not emit.
 *
 * The ramp's `tone` emits **the text colour only** (`control-class.ts`). Border and background
 * tints and hover are not in the ramp yet, so the consumer owns them. The same string was
 * scattered across three sites, and writing it by hand three times eventually splits one of
 * them — binding it to a constant removes that. **Not one value is new** (the existing
 * `--color-indigo-line-*`).
 */
const ACCENT_CHIP_IDLE =
  "border-[color:var(--color-indigo-line-a22)] hover:border-[color:var(--color-indigo-line-a42)] hover:bg-[color:var(--color-indigo-line-a13)]";
const ACCENT_CHIP_OPEN =
  "border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)]";
const ACCENT_CHIP_FILLED =
  "font-[var(--font-weight-signature)] border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-line-a13)] hover:border-[color:var(--color-indigo-line-a45)]";

export interface MeaningGapLabels extends QueueRowActionLabels {
  sectionTitle: string;
  hint: string;
  openMap: string;
  /** Opens and closes the inline input. */
  writeHere: string;
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
  /** One line appended below this section in a read-only session. */
  readOnlyHint: string;
}

type RowPhase =
  | { kind: "editing" }
  | { kind: "saving" }
  | { kind: "saved"; written: string }
  | { kind: "failed"; message: string }
  | { kind: "conflict" };

interface RowUiState {
  value: string;
  /** Whether cancel has announced "what you typed will be lost" (the two-step confirm). */
  cancelArmed: boolean;
  phase: RowPhase;
}

const EMPTY_UI: RowUiState = { value: "", cancelArmed: false, phase: { kind: "editing" } };
/** How long the save confirmation line stays on screen — after that the row drops out of the queue. */
const SAVED_ROW_LINGER_MS = 2200;

export interface MeaningGapSectionProps {
  gapKind: MeaningGapRow["gap"];
  rows: MeaningGapRow[];
  totalCount: number;
  abilities: QueueRowAbilities;
  /** Candidates to choose from on an unassigned-parent row. Unused on an undefined-meaning row. */
  domainChoices?: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * The address that hands this row to the map's agent. That surface exists only in the desktop
   * app, so with none supplied the item does not appear (a door that will not open is not drawn).
   * It takes `gap` because it carries only the **kind** of sentence — the sentence itself is
   * composed by the destination's opening-line generator.
   */
  askAgentHref?: (nodeId: string, gap: MeaningGapKind) => string | null;
  /**
   * The actual write — one vault frontmatter field. The caller wires it to `updateFrontmatter`
   * and passes `expectedMtime` along. It resolves on success and throws `VaultConflictError` on
   * a conflict.
   */
  onWrite: (row: MeaningGapRow, value: string) => Promise<void>;
  moreCount: (count: number) => string;
  labels: MeaningGapLabels;
}

export function MeaningGapSection({
  gapKind,
  rows,
  totalCount,
  abilities,
  domainChoices = [],
  mapHref,
  sourceHref,
  builderHref,
  askAgentHref,
  onWrite,
  moreCount,
  labels,
}: MeaningGapSectionProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [uiById, setUiById] = useState<ReadonlyMap<string, RowUiState>>(new Map());
  /**
   * A snapshot of the row being worked on — it keeps being drawn even after it drops out of the
   * queue data.
   *
   * One device solves two things: ① right after a successful save the gap is filled and the row
   * disappears from the data, but the confirmation line must linger or it reads as "I saved and
   * nothing happened" — the row fading out over time is the face of "it left the queue"; ② if
   * the vault is re-read before the save, or someone else edits the same file and the row list
   * shifts, **the sentence being typed is not lost.**
   */
  const [pinnedRows, setPinnedRows] = useState<readonly MeaningGapRow[]>([]);
  const pin = useCallback((row: MeaningGapRow) => {
    setPinnedRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
  }, []);
  // Lock on the frame it is pressed — `setState` is not reflected until the next render, so the
  // duplicate-save guard must be a synchronous store.
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
  // A pinned row is drawn **in its original position**. Appending it to the end drops the row
  // just touched below its siblings, so the row you pressed has to be found again by eye
  // (dimensional regularity). Re-sorting by the same name order as `buildMeaningGapRows` restores
  // the position exactly.
  const visibleRows = [...rows, ...pinnedRows.filter((row) => !liveIds.has(row.id))].sort(
    (a, b) => a.title.localeCompare(b.title),
  );
  if (visibleRows.length === 0) return null;
  const hiddenCount = Math.max(0, totalCount - rows.length);

  return (
    <section
      aria-label={labels.sectionTitle}
      data-testid={`do-next-${gapKind}`}
      className="flex flex-col"
    >
      <div className="flex flex-col gap-1 border-b border-[color:var(--color-divider)] pb-2">
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {labels.sectionTitle}
          </InsightsSectionTitle>
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {totalCount}
          </span>
        </div>
        <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
          {labels.hint}
        </p>
      </div>
      {visibleRows.map((row) => (
        <MeaningGapRowView
          key={row.id}
          row={row}
          gapKind={gapKind}
          open={openRowId === row.id}
          ui={uiById.get(row.id) ?? EMPTY_UI}
          abilities={abilities}
          domainChoices={domainChoices}
          mapHref={mapHref}
          sourceHref={sourceHref}
          builderHref={builderHref}
          askAgentHref={askAgentHref}
          onOpen={() => {
            // Pin on expansion — the field being typed into does not vanish from the screen even
            // if the vault is re-read afterwards.
            pin(row);
            setOpenRowId(row.id);
          }}
          onClose={() => closeRow(row.id)}
          onPatch={(next) => patchUi(row.id, next)}
          onSave={(value) => void handleSave(row, value)}
          labels={labels}
        />
      ))}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-label text-[color:var(--color-text-quaternary)]">
          {moreCount(hiddenCount)}
        </p>
      ) : null}
      {!abilities.canWriteVault ? (
        <p
          data-testid="meaning-gap-readonly-hint"
          className="pt-2 text-label leading-label text-[color:var(--color-text-quaternary)]"
        >
          {labels.readOnlyHint}
        </p>
      ) : null}
    </section>
  );
}

function MeaningGapRowView({
  row,
  gapKind,
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
  open: boolean;
  ui: RowUiState;
  abilities: QueueRowAbilities;
  domainChoices: DomainChoice[];
  mapHref: (nodeId: string) => string;
  sourceHref: (nodeId: string) => string | null;
  builderHref: (nodeId: string) => string;
  /**
   * The address that hands this row to the map's agent. That surface exists only in the desktop
   * app, so with none supplied the item does not appear (a door that will not open is not drawn).
   * It takes `gap` because it carries only the **kind** of sentence — the sentence itself is
   * composed by the destination's opening-line generator.
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

  /*
   * The domain chips are **an exclusive single selection** (one value, and re-clicking does not
   * clear it). They used to put `aria-pressed` on each sibling, which never expressed exclusivity
   * in the accessibility tree. The initial value is an empty string so nothing is pressed at
   * first, and that is the legitimate shape of an **unselected radiogroup** — the hook makes the
   * first item the tab stop in that case (APG).
   *
   * ⚠️ The container stays as it is. The design-system seat treated this site as a `variant='chips'`
   * migration candidate, but measurement showed **the value layer has no chip hover** (census:
   * 312 `controlClass` call sites write hover by hand, 88 of them chips). Migrating would remove
   * the hover feedback on an inactive chip — a regression into "it does not look pressable".
   * Whether the value layer should own hover is a separate round's decision.
   */
  const domainGroup = useRovingRadioGroup({
    value: ui.value,
    values: domainChoices.map((c) => c.value),
    onChange: (value) => onPatch({ value, cancelArmed: false }),
    busy: saving,
  });
  // The area must stay open through the save confirmation — the form leaving and the confirmation
  // line arriving have to pass through one and the same height transition to read as "this row
  // became a fixed row" (a sudden collapse is just a different screen).
  const detailOpen = open || saved;
  const { mounted, boxRef, contentRef } = useRowDisclosure(detailOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && gapKind === "missing-definition") inputRef.current?.focus();
  }, [open, gapKind]);

  const dirty = ui.value.trim().length > 0;
  const requestClose = () => {
    // With text entered it asks once more — the way back must be on screen.
    if (dirty && !ui.cancelArmed) {
      onPatch({ cancelArmed: true });
      return;
    }
    onClose();
  };

  const canSave = dirty && !saving;
  const candidate = { id: row.id, title: row.title };
  const confirmLine =
    gapKind === "missing-definition"
      ? labels.confirmDefinition(row.ownSlug)
      : labels.confirmDomain(row.ownSlug, ui.value);

  return (
    <div
      data-testid="do-next-meaning-gap-row"
      className="min-w-0 border-b border-[color:var(--color-divider)] last:border-b-0"
      onKeyDown={(event) => {
        // Two-step Esc — when expanded this row consumes it (cancelling the input); when collapsed
        // it passes upward (the tab or the palette receives it).
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        requestClose();
      }}
    >
      {/* The header band uses the **same shell** as the queue's other section rows (py-2.5 and the
          same column order). A different height here alone breaks the rhythm within one list. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2.5">
        <TopologyV2KindGlyph kind={row.nodeKind} size={13} />
        <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-secondary)]">
          {row.title}
        </span>
        <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
          {/* A row whose save has finished has nothing to open or close — the confirmation line
              states the state and it will shortly leave the queue. Leaving the control would give
              "collapse" nothing to point at. */}
          {abilities.canWriteVault && !saved ? (
            <button
              type="button"
              data-testid="meaning-gap-write-toggle"
              aria-expanded={open}
              onClick={() => (open ? requestClose() : onOpen())}
              /* This chip is **emphasized regardless of whether it is open** — it is a disclosure
                 rather than a selection (`active`), so it uses `tone: 'accentOnTint'` rather than
                 the ramp's pressed ink. The height is not pinned because the ramp default is
                 already 32px (before the 2026-08-03 convergence a `fixedHeight` axis was needed). */
              className={controlClass({
                shape: "chip",
                size: "md",
                tone: "accentOnTint",
                className: open ? ACCENT_CHIP_OPEN : ACCENT_CHIP_IDLE,
              })}
            >
              <Pencil size={ICON_SIZE.sm} aria-hidden />
              {open ? labels.writeHereClose : labels.writeHere}
            </button>
          ) : abilities.canWriteVault ? null : (
            <HandoffCopyButton payload={row.handoffPayload} labels={labels} abilities={abilities} />
          )}
          <Link
            href={mapHref(row.nodeId)}
            className={controlClass({
              shape: "chip",
              size: "md",
              className: "hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {labels.openMap}
          </Link>
          <RowActionMenu
            sourceHref={sourceHref(row.nodeId)}
            builderHref={builderHref(row.nodeId)}
            askAgentHref={askAgentHref?.(row.nodeId, row.gap) ?? null}
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
        // It stays in the DOM while collapsing, so the invisible input is disabled immediately and
        // never remains in the tab order or for a screen reader.
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
                      // Giving one sentence a 1,300px line makes the reading eye cross the screen —
                      // the measure is fitted to the sentence length.
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
                              /* This one is **a selection** (paired with `aria-pressed`), so the
                                 ink is not written by hand but taken from the ramp's `active`.
                                 Pressed state must be one set app-wide, and the value layer owns
                                 that set. */
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

                  {/* State the file to change first — what will be written where, before pressing. */}
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
                      /* The disabled affordance is taken from the ramp too — a hand-written
                         `disabled:opacity-50` turned off neither the cursor nor the hover. */
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
