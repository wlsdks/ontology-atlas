"use client";

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';

/** Chips past this many are never on one line at any width, so they are not mounted. */
const MEMBER_CHIP_CAP = 40;

/** How many chips end inside the track; a chip cut by the edge does not count. O(chips). */
function fittingChipCount(track: HTMLElement): number {
  const limit = track.clientWidth;
  let fit = 0;
  for (const chip of track.children) {
    const element = chip as HTMLElement;
    if (element.offsetLeft + element.offsetWidth > limit) break;
    fit += 1;
  }
  return fit;
}

export function RoleBand({
  id,
  rowIndex,
  label,
  pathLabel,
  members,
  ariaLabel,
  selected,
  expanded,
  onSelect,
  strongestOut,
}: {
  id: string;
  rowIndex: number;
  label: string;
  pathLabel: string;
  members: readonly string[];
  ariaLabel: string;
  selected: boolean;
  expanded: boolean;
  onSelect: (id: string, trigger: HTMLElement) => void;
  /** Without arcs, the band names its busiest outgoing crossing instead. */
  strongestOut: { text: string; violated: boolean } | null;
}) {
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState(members.length);
  const shown = members.slice(0, MEMBER_CHIP_CAP);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setFit(fittingChipCount(track));
  }, []);

  useLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure, members]);

  const visible = Math.min(fit, shown.length);
  const hidden = members.length - visible;

  return (
    <button
      type="button"
      data-testid={`architecture-graph-box-${id}`}
      data-graph-box={id}
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-expanded={expanded}
      aria-controls="architecture-inspector"
      onClick={(event) => onSelect(id, event.currentTarget)}
      style={{ gridRow: rowIndex + 1 }}
      className="group col-span-2 grid min-w-0 grid-cols-subgrid items-stretch rounded-card text-left focus-visible:bg-[color:var(--color-overlay-2)] focus-visible:outline-none"
    >
      <span className="flex min-w-0 items-center justify-end gap-2.5 pr-4">
        <span className="truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
          {pathLabel}
        </span>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-body-lg font-[var(--font-weight-emphasis)] transition-colors',
            selected
              ? 'text-[color:var(--color-text-primary)]'
              : 'text-[color:var(--color-text-secondary)] group-hover:text-[color:var(--color-text-primary)]',
          )}
        >
          {label}
        </span>
      </span>
      <span
        data-testid={`architecture-band-${id}`}
        className={cn(
          'flex min-w-0 items-center gap-3 rounded-card border px-3 transition-[border-color,background-color]',
          'group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
          selected
            ? 'border-[color:var(--color-indigo-accent-a50)] bg-[color:var(--color-elevated)]'
            : 'border-[color:var(--color-overlay-3)] bg-[color:var(--color-panel)] group-hover:border-[color:var(--color-border-strong)]',
        )}
      >
        <span ref={trackRef} className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {shown.map((name, index) => (
            <span
              key={name}
              data-testid="architecture-member-chip"
              aria-hidden
              className={cn(
                'inline-flex h-6 shrink-0 items-center rounded-chip border border-[color:var(--color-border-soft)] px-2 font-mono text-label text-[color:var(--color-text-secondary)]',
                selected ? 'bg-[color:var(--color-overlay-3)]' : 'bg-[color:var(--color-elevated)]',
                index >= visible && 'invisible',
              )}
            >
              {name}
            </span>
          ))}
        </span>
        {strongestOut ? (
          <span
            data-testid={`architecture-strongest-out-${id}`}
            className={cn(
              'shrink-0 whitespace-nowrap text-label tabular-nums',
              strongestOut.violated
                ? 'text-[color:var(--color-danger-text)]'
                : 'text-[color:var(--color-text-tertiary)]',
            )}
          >
            {strongestOut.text}
          </span>
        ) : null}
        {members.length === 0 ? null : (
          <span
            aria-hidden
            data-testid={`architecture-member-count-${id}`}
            className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {hidden > 0 ? `+${hidden}` : members.length}
          </span>
        )}
      </span>
    </button>
  );
}
