import { useId } from "react";
import { CircleHelp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { controlClass } from '@/shared/ui/control-class';

interface InfoHintProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
}

export function InfoHint({
  label,
  children,
  className,
  panelClassName,
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
          "pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 text-left opacity-0 shadow-[var(--shadow-elevation-1)] transition-[opacity,transform] duration-[var(--motion-fast)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
