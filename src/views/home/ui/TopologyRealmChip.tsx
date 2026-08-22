"use client";

import { Orbit, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";
import { controlClass } from "@/shared/ui/control-class";

// On screen this reads "viewing only this" (owner decision, 2026-07-23); the
// internal name stays `realm`.
export interface TopologyRealmChipProps {
  /** Title of the realm's root node (HomePage substitutes the slug when absent). */
  title: string;
  /**
   * Copy that precedes the title — en "Viewing only". Not rendered when empty.
   * HomePage splits the `realm.chipViewing` template around {title}.
   */
  beforeLabel: string;
  /** Copy that follows the title — ko "만 보는 중". Rendered flush against it. */
  afterLabel: string;
  clearAriaLabel: string;
  onClear: () => void;
}

/**
 * Top-centre status chip announcing that the map is scoped to one node, with ✕ to
 * return to the whole map. Same "chrome grammar" contract as `TopologyPathChip`:
 * it rides the top-centre flex row rather than adding another floating panel, and
 * carries no map-rendering logic.
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
      {/* The title is capped at 7rem and truncated. The top-centre lane negotiates
          no fixed width with the utility cluster on the right, so on a 14-inch
          screen a long title eats into the search tile (measured 2026-07-23:
          "Viewing only" plus an uncapped title clipped the Search tile). The full
          name is carried by the ledger header, the map's centre label, and the
          hover title. The suffix stays alive via shrink-0. */}
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
