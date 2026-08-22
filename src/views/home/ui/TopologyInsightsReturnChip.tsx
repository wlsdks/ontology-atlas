"use client";

import { ArrowLeft, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { CHROME_STATUS_CHIP_CLASS } from "@/shared/ui/chrome-chip";
import { controlClass } from "@/shared/ui/control-class";

export interface TopologyInsightsReturnChipProps {
  /** Where to return to — the insights tab they came from (`buildOntologyInsightsReturnHref`). */
  href: string;
  label: string;
  ariaLabel: string;
  dismissAriaLabel: string;
  /** Explicit dismiss: clears the `via` marker in the URL. The only way this chip goes away. */
  onDismiss: () => void;
}

/**
 * The "back to insights" chip, shown only when the map was entered through an
 * insights deep link (`?via=insights:<tab>`). Transient chrome in the same
 * top-centre row as `TopologyPathChip`. Browser back is not enough here: every
 * interaction on the map pushes history, so returning costs many steps.
 *
 * Lifetime contract (see url-state `insightsReturnTab`): it survives map
 * exploration and goes away only through the X. Following the link does not clear
 * the marker. It sits out the Esc ladder (`topology-esc-ladder.ts`) because it
 * owns no focus.
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
