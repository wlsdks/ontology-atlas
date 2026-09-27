"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CircleHelp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from '@/shared/ui/control-class';

/**
 * Which edge of the 24px button the 288px panel hangs from. `right` is the default so no pixel
 * moved, but it runs off the left edge near a narrow screen's left side. A static anchor is
 * sound only where the button's distance from the window edge holds at every width and locale;
 * where it does not, use one hint per definition rather than a breakpoint-conditional anchor. A
 * self-placing panel needs JS or CSS anchor positioning proven in WebKit, the app's WebView,
 * while the gates run Chromium.
 */
const HINT_ALIGN = {
  right: 'right-0',
  left: 'left-0 right-auto',
  center: 'left-1/2 right-auto -translate-x-1/2',
} as const;

interface InfoHintProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  /** Aim it inward when the button is near a screen edge. */
  align?: keyof typeof HINT_ALIGN;
}

export function InfoHint({
  label,
  children,
  className,
  panelClassName,
  align = 'right',
}: InfoHintProps) {
  // `aria-describedby` lets assistive tech read the body on focus or hover.
  const tooltipId = useId();
  /*
   * Escape hides the panel, which focus alone keeps open over the rows below, until focus or
   * the pointer leaves.
   */
  const [dismissed, setDismissed] = useState(false);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || dismissed) return;
    // Only the panel closes; a surrounding dialog keeps its own Escape for the next press.
    event.stopPropagation();
    setDismissed(true);
  };
  return (
    <div
      className={cn("group relative inline-flex", className)}
      data-dismissed={dismissed ? "true" : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => setDismissed(false)}
      onMouseLeave={() => setDismissed(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className={controlClass({ shape: "icon", tone: "muted", className: "h-6 w-6 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a28)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]" })}
      >
        <CircleHelp size={ICON_SIZE.md} aria-hidden="true" />
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className={cn(
          // `--motion-base`, not the default: a surface appearing and leaving is the ramp's
          // move step. A panel shown only because the button holds focus must not swallow
          // clicks on the rows it covers.
          "pointer-events-none absolute top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 text-left opacity-0 shadow-[var(--shadow-elevation-1)] transition-[opacity,transform] duration-[var(--motion-base)]",
          !dismissed &&
            "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100",
          HINT_ALIGN[align],
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
