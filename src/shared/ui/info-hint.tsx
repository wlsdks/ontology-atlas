import { CircleHelp } from "lucide-react";
import { cn } from "@/shared/lib/cn";

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
  return (
    <div className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.28)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-3 text-left opacity-0 shadow-[0_20px_40px_rgba(0,0,0,0.28)] transition-all duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100",
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
