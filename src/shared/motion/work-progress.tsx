import { cn } from "@/shared/lib/cn";
import type { WorkPhase } from "./work-glyph";

export function WorkProgress({
  phase,
  done,
  total,
  label,
}: {
  phase: WorkPhase;
  done: number;
  total: number | null;
  label: string;
}) {
  const finished = phase === "done";
  const determinate = finished || (total != null && total > 0);
  const ratio = finished ? 1 : determinate ? Math.min(1, done / (total as number)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(ratio * 100) : undefined}
      data-work-progress={phase}
      className="relative h-1 w-full overflow-hidden rounded-chip bg-[color:var(--color-indigo-accent-a12)]"
    >
      <div
        data-work-fill
        className={cn(
          "motion-work-fill absolute inset-0 rounded-chip",
          finished ? "bg-[color:var(--color-status-success)]" : "bg-[color:var(--color-indigo-accent)]",
          determinate ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
      <div
        data-work-sweep
        className={cn(
          "absolute inset-y-0 left-0 w-1/3 bg-[image:linear-gradient(90deg,transparent,var(--color-indigo-accent-a50)_30%,var(--color-indigo-accent)_50%,var(--color-indigo-accent-a50)_70%,transparent)]",
          "transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
          determinate ? "opacity-0" : "motion-work-sweep opacity-100",
        )}
      />
    </div>
  );
}
