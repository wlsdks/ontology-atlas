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
 * 드로어와 상세 페이지가 같은 메타 요약 리듬을 유지하도록 공통 그리드로 묶는다.
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
        "grid gap-px overflow-hidden rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-divider)]",
        columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("bg-[color:var(--color-overlay-1)] px-3.5 py-3.5", cellClassName)}
        >
          <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {item.label}
          </dt>
          <dd className="mt-1.5 text-sm leading-6 tabular-nums font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {item.value}
          </dd>
          {item.description && (
            <p className="mt-1 text-[11px] leading-5 tabular-nums text-[color:var(--color-text-quaternary)]">
              {item.description}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}
