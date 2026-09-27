"use client";

import { Orbit, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";
import { controlClass } from "@/shared/ui/control-class";

// Reads "viewing only this" on screen; the internal name stays `realm`.
export interface TopologyRealmChipProps {
  /** HomePage substitutes the slug when absent. */
  title: string;
  /**
   * en "Viewing only"; not rendered when empty. HomePage splits `realm.chipViewing` around {title}.
   */
  beforeLabel: string;
  /** ko "Viewing only", flush against the title. */
  afterLabel: string;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * Scopes the map to one node with ✕ back to the whole map; rides the top-centre row
 * like `TopologyPathChip`.
 */
export function TopologyRealmChip({
  title,
  beforeLabel,
  afterLabel,
  clearAriaLabel,
  onClear,
}: TopologyRealmChipProps) {
  return (
    <div
      data-testid="topology-realm-chip"
      role="status"
      className={CHROME_STATUS_CHIP_CLASS}
    >
      <Orbit size={ICON_SIZE.md} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
      {beforeLabel.trim().length > 0 ? (
        <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{beforeLabel.trim()}</span>
      ) : null}
      {/* Capped at 7rem, or on a 14-inch screen a long title clips the search tile; the full
         name shows in the ledger header, the map label and the hover title. The suffix stays
         via shrink-0. */}
      <span className="flex min-w-0 items-baseline" title={`${beforeLabel}${title}${afterLabel}`.trim()}>
        <span
          data-testid="topology-realm-chip-title"
          className="max-w-[7rem] truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {title}
        </span>
        {afterLabel.trim().length > 0 ? (
          <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{afterLabel}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearAriaLabel}
        data-testid="topology-realm-chip-clear"
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          className: "-mr-1 hover:text-[color:var(--color-text-primary)]",
        })}
      >
        <X size={ICON_SIZE.md} aria-hidden />
      </button>
    </div>
  );
}
