import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";

/**
 * A settled state is the same badge the agents tab uses, so a finished row does not look
 * pressable. Exported so the runtime rows do not keep a second copy.
 */
export function RowStateBadge({
  ready,
  children,
  className,
  ...rest
}: {
  ready: boolean;
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span
      {...rest}
      className={badgeClass({
        shape: "tag",
        className: cn(
          "inline-flex min-w-18 shrink-0 items-center justify-center gap-1.5 py-0.5 bg-[color:var(--color-overlay-2)]",
          ready ? "text-[color:var(--color-text-secondary)]" : "text-[color:var(--color-text-tertiary)]",
          className,
        ),
      })}
    >
      {ready ? (
        <span
          aria-hidden
          data-testid="row-state-ready-dot"
          className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-status-success)]"
        />
      ) : null}
      {children}
    </span>
  );
}
