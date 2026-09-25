"use client";

import { Check, Clipboard, Route, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CHROME_STATUS_CHIP_CLASS, Tooltip, controlClass } from "@/shared/ui";

export interface TopologyPathChipProps {
  /** Pre-formatted status line — "Path: {source} → choose a target" before a target
   *  is picked, "{source} → {target}" once both endpoints resolve. The view composes
   *  this (i18n interpolation lives in the path lens, not here) so this component
   *  stays a pure "chrome grammar" chip. */
  label: string;
  /**
   * What the path came to — "N hops" or "no path" — once both endpoints resolve. It is
   * drawn after the label and never truncates: the endpoint names give way first,
   * because the outcome is the one fact this chip adds to the map.
   */
  outcome?: string | null;
  /** Only rendered once both endpoints resolve — the one agent-facing copy
   *  action that replaced the old path panel's CLI/MCP 2-button split and its
   *  5-button proof-check row. */
  resolved: boolean;
  copyPacketLabel: string;
  copyPacketCopied: boolean;
  copyPacketAriaLabel: string;
  copyPacketCopiedAriaLabel: string;
  onCopyPacket: () => void;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * The chip's two actions share one shape: the 24px icon button (`controlClass` icon
 * `sm`), each named by a tooltip. The copy action used to be a `CompactCopyButton`
 * whose own `min-h-9` was overridden away, leaving a 30x14 target with a border its
 * clear sibling did not have (measured 2026-09-25) — under the 24px floor, and two
 * button grammars inside one chip.
 */
const CHIP_ACTION_CLASS = controlClass({
  hoverInk: "strong",
  shape: "icon",
  size: "sm",
  tone: "muted",
});

/**
 * Top-centre "chrome grammar" status chip for path mode — replaces the old
 * left-slot path panel (route card + MCP/CLI chips + collapsed proof
 * disclosure). Mounted next to `SearchHint` in the same top-centre row, not in
 * the INDEX/analysis-rail left slot: path no longer reclaims that slot
 * (`slot-ownership.ts`). Canvas path highlighting is untouched — this chip is
 * chrome only, no map-rendering logic.
 */
export function TopologyPathChip({
  label,
  outcome = null,
  resolved,
  copyPacketLabel,
  copyPacketCopied,
  copyPacketAriaLabel,
  copyPacketCopiedAriaLabel,
  onCopyPacket,
  clearAriaLabel,
  onClear,
}: TopologyPathChipProps) {
  const fullLabel = outcome ? `${label} · ${outcome}` : label;
  /*
   * **In a narrow toolbar the outcome speaks alone** (2026-09-25). Below a 44rem
   * toolbar (the free map beside an open INDEX under 1130px, or the review panel
   * narrowing it) the endpoint names had what the tools and the trail chip left:
   * one or two letters and an ellipsis (at 900 and 1040), which says less than
   * the outcome by itself. There the names leave the face and stay in the chip's
   * accessible text and its hover text; wider, they read whole. Before a target is
   * picked there is no outcome, and the label (the instruction) always shows.
   */
  const foldable = Boolean(outcome);
  return (
    <div
      data-testid="topology-path-chip"
      data-path-chip-label={foldable ? "folds-below-44rem" : "shown"}
      role="status"
      className={CHROME_STATUS_CHIP_CLASS}
    >
      <span title={fullLabel} className="flex min-w-0 items-center gap-1.5">
        <Route size={ICON_SIZE.md} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <span
          data-testid="topology-path-chip-label"
          className={foldable ? "hidden min-w-0 truncate @min-[44rem]/map-toolbar:block" : "min-w-0 truncate"}
        >
          {label}
        </span>
        {foldable ? <span className="sr-only @min-[44rem]/map-toolbar:hidden">{label}</span> : null}
        {outcome ? (
          <span
            data-testid="topology-path-chip-outcome"
            className="shrink-0 whitespace-nowrap text-[color:var(--color-text-primary)]"
          >
            <span aria-hidden className="hidden text-[color:var(--color-text-quaternary)] @min-[44rem]/map-toolbar:inline">· </span>
            {outcome}
          </span>
        ) : null}
      </span>
      {resolved ? (
        <Tooltip content={copyPacketLabel} side="bottom">
          <button
            type="button"
            data-testid="topology-path-chip-copy-packet"
            onClick={onCopyPacket}
            aria-label={copyPacketCopied ? copyPacketCopiedAriaLabel : copyPacketAriaLabel}
            className={CHIP_ACTION_CLASS}
          >
            {copyPacketCopied ? (
              <Check size={ICON_SIZE.md} aria-hidden />
            ) : (
              <Clipboard size={ICON_SIZE.md} aria-hidden />
            )}
          </button>
        </Tooltip>
      ) : null}
      <Tooltip content={clearAriaLabel} side="bottom">
        <button
          type="button"
          onClick={onClear}
          aria-label={clearAriaLabel}
          data-testid="topology-path-chip-clear"
          className={`${CHIP_ACTION_CLASS} -mr-1`}
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}
