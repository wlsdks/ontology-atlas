"use client";

import { ArrowLeft, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";
import { controlClass } from "@/shared/ui/control-class";

export interface TopologyInsightsReturnChipProps {
  /** `buildOntologyInsightsReturnHref`. */
  href: string;
  label: string;
  ariaLabel: string;
  dismissAriaLabel: string;
  /** Clears the `via` marker; the only way the chip goes. */
  onDismiss: () => void;
}

/**
 * Shown only after an insights deep link (`?via=insights:<tab>`), since Back costs many steps after
 * map interactions. It survives exploration, following the link keeps the marker, and it sits out
 * the Esc ladder.
 */
export function TopologyInsightsReturnChip({
  href,
  label,
  ariaLabel,
  dismissAriaLabel,
  onDismiss,
}: TopologyInsightsReturnChipProps) {
  return (
    <div
      data-testid="topology-insights-return-chip"
      className={CHROME_STATUS_CHIP_CLASS}
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        data-testid="topology-insights-return-chip-link"
        className={controlClass({ hoverInk: 'strong', shape: "link", className: "min-w-0 gap-1.5" })}
      >
        <ArrowLeft
          size={ICON_SIZE.md}
          aria-hidden
          className="shrink-0 text-[color:var(--color-text-tertiary)]"
        />
        <span className="min-w-0 truncate">{label}</span>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissAriaLabel}
        data-testid="topology-insights-return-chip-dismiss"
        className={controlClass({ hoverInk: 'strong',
          shape: "icon",
          size: "sm",
          tone: "muted",
          className: "-mr-1",
        })}
      >
        <X size={ICON_SIZE.md} aria-hidden />
      </button>
    </div>
  );
}
