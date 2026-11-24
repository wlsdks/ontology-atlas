import type { ReactNode } from 'react';

/** A titled block of a side panel, ruled off from the one above. */
export function PanelSection({ title, aside, children }: { title: string; aside?: string | null; children: ReactNode }) {
  return (
    <section className="border-t border-[color:var(--color-border-soft)] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{title}</h3>
        {aside ? <span className="shrink-0 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{aside}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export interface PanelStat {
  label: string;
  /** `null` while unread or unknown: drawn as a dash, never as zero. */
  value: number | null;
  sign?: string;
}

/** The panel's few numbers in one row of equal cells, so a glance reads the size before the lists. */
export function PanelStats({ stats }: { stats: readonly PanelStat[] }) {
  return (
    <dl data-testid="work-panel-stats" className="mx-5 mb-4 grid shrink-0 gap-px overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-border-soft)]" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map(stat => (
        <div key={stat.label} className="flex min-w-0 flex-col gap-0.5 bg-[color:var(--color-canvas)] px-3 py-2.5">
          <dt className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">{stat.label}</dt>
          <dd className="text-title leading-title tabular-nums font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {stat.value === null ? '–' : `${stat.value > 0 && stat.sign ? stat.sign : ''}${stat.value.toLocaleString()}`}
          </dd>
        </div>
      ))}
    </dl>
  );
}
