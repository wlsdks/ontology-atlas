import { cn } from "@/shared/lib/cn";

export interface ProjectMetaGridItem {
  label: string;
  value: string;
  description?: string;
}

interface Props {
  items: ProjectMetaGridItem[];
  columns?: 1 | 2;
  className?: string;
  cellClassName?: string;
}

/**
 * One shared grid so the drawer and the detail page keep the same meta-summary rhythm.
 */
export function ProjectMetaGrid({
  items,
  columns = 2,
  className,
  cellClassName,
}: Props) {
  return (
    <dl
      className={cn(
        "grid gap-px overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-divider)]",
        columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("bg-[color:var(--color-overlay-1)] px-3.5 py-3.5", cellClassName)}
        >
          <dt className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {item.label}
          </dt>
          <dd className="mt-1.5 text-body-lg leading-title tabular-nums font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {item.value}
          </dd>
          {item.description && (
            <p className="mt-1 text-label leading-body tabular-nums text-[color:var(--color-text-quaternary)]">
              {item.description}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}
