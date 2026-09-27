"use client";

import { Check, Clipboard, Route, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CHROME_STATUS_CHIP_CLASS, Tooltip, controlClass } from "@/shared/ui";

export interface TopologyPathChipProps {
  /** Composed by the path lens, so this chip stays pure chrome. */
  label: string;
  /** "N hops" or "no path"; never truncates, since the endpoint names give way first. */
  outcome?: string | null;
  /** Only then does the single agent copy action render. */
  resolved: boolean;
  copyPacketLabel: string;
  copyPacketCopied: boolean;
  copyPacketAriaLabel: string;
  copyPacketCopiedAriaLabel: string;
  onCopyPacket: () => void;
  clearAriaLabel: string;
  onClear: () => void;
}

/** One 24px icon-button grammar for both actions, each named by a tooltip. */
const CHIP_ACTION_CLASS = controlClass({
  hoverInk: "strong",
  shape: "icon",
  size: "sm",
  tone: "muted",
});

/**
 * Top-centre path status chip beside `SearchHint`; path no longer claims the left slot
 * (`slot-ownership.ts`).
 * Chrome only: canvas highlighting is untouched.
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
  // Below a 44rem toolbar the outcome speaks alone and the names move to accessible and hover
  // text,
  // since one or two letters say less than the outcome. Without an outcome the label always shows.
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
