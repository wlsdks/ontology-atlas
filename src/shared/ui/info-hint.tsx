import { useId } from "react";
import { CircleHelp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from '@/shared/ui/control-class';

/**
 * Which edge of the 24px button the 288px panel hangs from.
 *
 * ⚠️ **`right` is the default so no existing pixel moves**, and it is the wrong answer wherever the
 * button sits near the left of a narrow screen: the panel's containing block is the button itself,
 * so `right-0` puts it at `[buttonRight − 288, buttonRight]`. Measured at 390 on the Harness
 * coverage view, where three of these sit in 103px cards: the explainer's hint ran **84.9%** off
 * the left edge and the first card's **68.6%**, so pressing the only control that says what a
 * column means returned the rightmost 90px of a paragraph (design-responsive, 2026-09-13). The
 * width clamp `min(18rem, 100vw - 2rem)` was already there; it bounds the width, not the origin.
 *
 * ⚠️ **A static anchor is sound only where the button's distance from the window edge is invariant
 * under both width and locale.** That is a condition, not advice: the Harness column cards meet it
 * twice — 3-up at every width, and an eyebrow whose `flex-wrap` pins the button to the card's
 * content-left instead of to the end of a translated label — while three tiles that went 1-up
 * below `sm` and 3-up above it met it at neither, and no value was correct at both. One of those
 * panels measured x **−89.97** at 390 and its neighbour cleared the window by under a pixel
 * (`harness-tab.spec.ts`, 2026-09-13). Where the condition fails, remove the multiplicity — one
 * hint for one definition — rather than writing a breakpoint-conditional anchor.
 *
 * A self-placing panel is the standing alternative and is deliberately not built yet: it needs JS
 * measurement on open, resize and scroll, or CSS anchor positioning with
 * `position-try-fallbacks: flip-inline`, and this product's WebView is WebKit while every gate
 * here runs Chromium. Build it for a call site whose x cannot be authored, with a WebKit recording.
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
  /** Which edge the panel hangs from. Aim it inward when the button is near a screen edge. */
  align?: keyof typeof HINT_ALIGN;
}

export function InfoHint({
  label,
  children,
  className,
  panelClassName,
  align = 'right',
}: InfoHintProps) {
  // `aria-describedby` ties the button to the tooltip so assistive tech reads
  // the body on focus or hover. A `role=tooltip` div alone left it unreachable.
  const tooltipId = useId();
  return (
    <div className={cn("group relative inline-flex", className)}>
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
          // Names `--motion-base` rather than taking the `--motion-fast`
          // default: this transition is a surface appearing and leaving
          // (opacity plus rise), which is the ramp's "move" step. At the 120ms
          // default it reads as a pop.
          "pointer-events-none absolute top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 text-left opacity-0 shadow-[var(--shadow-elevation-1)] transition-[opacity,transform] duration-[var(--motion-fast)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
          HINT_ALIGN[align],
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
