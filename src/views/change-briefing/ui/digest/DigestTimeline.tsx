'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import type { BriefingRange } from '../../model/briefing-model';
import { changeTitle, type DigestChange } from '../../model/change-digest';
import { dayTicks, timelineColumns, type TimelineUnit } from '../../model/digest-timeline';

/** Horizontal room one drawn tick takes, its 1px gap included; it sets how many minutes share a slot. */
const TICK_PITCH_PX = 4;
const PLOT_HEIGHT_PX = 96;
const TICK_MAX_HEIGHT_PX = 48;
const HOUR_MARKS = [0, 6, 12, 18];
const MINUTES_PER_DAY = 1440;
/** Columns past this many label every seventh, so a month's numbers never collide. */
const LABEL_EVERY_COLUMN = 7;

const FOCUS_RING = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

interface Mark {
  key: string;
  name: string;
  readout: string;
  hash: string;
}

interface DigestTimelineProps {
  unit: TimelineUnit;
  range: BriefingRange;
  changes: readonly DigestChange[];
  notable: ReadonlySet<string>;
  onSelect?: (hash: string) => void;
}

export function DigestTimeline({ unit, range, changes, notable, onSelect }: DigestTimelineProps) {
  const t = useTranslations('changeDigest');
  const locale = useLocale();
  const readoutId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [pointed, setPointed] = useState<Mark | null>(null);
  const [active, setActive] = useState(0);
  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => setWidthPx(plot.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);
  const clock = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), [locale]);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }), [locale]);
  const label = unit === 'minute' ? t('timelineDay') : unit === 'day' ? t('timelineDays') : t('timelineWeeks');
  const time = (change: DigestChange) => clock.format(new Date(change.commit.committedAt));
  const title = (change: DigestChange) => changeTitle(change.commit.subject, change.commit.message);

  const slotMinutes = widthPx ? Math.max(1, Math.ceil((MINUTES_PER_DAY * TICK_PITCH_PX) / widthPx)) : 1;
  const ticks = useMemo(() => unit === 'minute' ? dayTicks(changes, slotMinutes) : [], [unit, changes, slotMinutes]);
  const columns = useMemo(() => unit === 'minute' ? [] : timelineColumns(changes, range, unit), [unit, changes, range]);
  const columnDate = (start: string, end: string) => start === end
    ? dayFormat.format(new Date(`${start}T00:00:00`))
    : dayFormat.formatRange(new Date(`${start}T00:00:00`), new Date(`${end}T00:00:00`));

  const tickMarks: Mark[] = ticks.map(tick => ({
    key: tick.change.commit.hash,
    name: t('groupName', { group: time(tick.change), count: tick.sameMinute }),
    readout: `${time(tick.change)} · ${title(tick.change)}`,
    hash: tick.change.commit.hash,
  }));
  const filled = columns.flatMap((column, index) => column.changes.length ? [{ column, index }] : []);
  const columnMarks: Mark[] = filled.map(({ column }) => ({
    key: column.start,
    name: t('groupName', { group: columnDate(column.start, column.end), count: column.changes.length }),
    readout: `${columnDate(column.start, column.end)} · ${title(column.changes[0])}`,
    hash: column.changes[0].commit.hash,
  }));
  const marks = unit === 'minute' ? tickMarks : columnMarks;
  const current = Math.min(active, Math.max(0, marks.length - 1));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const ordered = [...changes].sort((a, b) => (Date.parse(a.commit.committedAt) || 0) - (Date.parse(b.commit.committedAt) || 0));
  const span = !ordered.length ? '' : unit === 'minute'
    ? [...new Set([time(ordered[0]), time(ordered[ordered.length - 1])])].join(' – ')
    : [...new Set([ordered[0], ordered[ordered.length - 1]].map(change => dayFormat.format(new Date(change.commit.committedAt))))].join(' – ');

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const last = marks.length - 1;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? Math.min(last, current + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? Math.max(0, current - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null || last < 0) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }
  const markProps = (mark: Mark, index: number) => ({
    ref: (element: HTMLButtonElement | null) => { buttons.current[index] = element; },
    type: 'button' as const,
    tabIndex: index === current ? 0 : -1,
    'aria-label': mark.name,
    'aria-describedby': readoutId,
    'data-timeline-mark': mark.hash,
    onPointerEnter: () => setPointed(mark),
    onPointerLeave: () => setPointed(null),
    onFocus: () => { setActive(index); setPointed(mark); },
    onBlur: () => setPointed(null),
    onClick: () => onSelect?.(mark.hash),
  });

  const cellPx = Math.min(TICK_MAX_HEIGHT_PX, PLOT_HEIGHT_PX / Math.max(1, ...ticks.map(tick => tick.stack + 1)));
  const busiest = Math.max(1, ...columns.map(column => column.changes.length));
  const axis = unit === 'minute'
    ? HOUR_MARKS.map(hour => ({ key: String(hour), at: hour / 24, text: clock.format(new Date(`${range.start}T${String(hour).padStart(2, '0')}:00:00`)), centred: hour > 0 }))
    : columns.flatMap((column, index) => {
      const startDate = new Date(`${column.start}T00:00:00`);
      if (unit === 'week') {
        const previous = columns[index - 1];
        if (previous && previous.start.slice(0, 7) === column.start.slice(0, 7)) return [];
        return [{ key: column.start, at: index / columns.length, text: new Intl.DateTimeFormat(locale, { month: 'short' }).format(startDate), centred: false }];
      }
      if (columns.length <= LABEL_EVERY_COLUMN) return [{ key: column.start, at: (index + 0.5) / columns.length, text: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(startDate), centred: true }];
      return index % LABEL_EVERY_COLUMN ? [] : [{ key: column.start, at: index / columns.length, text: dayFormat.format(startDate), centred: false }];
    });

  return <figure data-testid="change-digest-timeline" data-timeline-unit={unit} className="min-w-0">
    <figcaption className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="flex shrink-0 items-center gap-4">
        <span className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{label}</span>
        {notable.size > 0 && <span className="flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]"><span aria-hidden className="h-2.5 w-[3px] rounded-micro bg-[color:var(--color-indigo-accent)]" />{t('notable')}</span>}
      </span>
      <span id={readoutId} data-testid="change-digest-timeline-readout" className={cn('min-w-0 truncate text-body', pointed ? 'text-[color:var(--color-text-primary)]' : 'font-mono tabular-nums text-[color:var(--color-text-tertiary)]')}>{pointed?.readout ?? span}</span>
    </figcaption>
    <div ref={plotRef} role="group" aria-label={label} onKeyDown={move} className="structure-item-in relative mt-4 border-b border-[color:var(--color-border-strong)]" style={{ height: PLOT_HEIGHT_PX }}>
      {unit === 'minute' && HOUR_MARKS.slice(1).map(hour => <span key={hour} aria-hidden className="absolute inset-y-0 w-px bg-[color:var(--color-border-soft)]" style={{ left: `${(hour / 24) * 100}%` }} />)}
      {unit === 'minute' && ticks.map((tick, index) => {
        const accent = notable.has(tick.change.commit.hash);
        return <button key={tick.change.commit.hash} {...markProps(tickMarks[index], index)}
          className={cn('group absolute rounded-micro', FOCUS_RING)}
          style={{ left: `${(tick.slot / MINUTES_PER_DAY) * 100}%`, width: TICK_PITCH_PX, bottom: tick.stack * cellPx, height: cellPx }}>
          <span aria-hidden className={cn('absolute inset-x-0 bottom-0 top-px rounded-micro transition-colors', accent ? 'bg-[color:var(--color-indigo-accent)] group-hover:bg-[color:var(--color-indigo-hover)]' : 'bg-[color:var(--color-text-tertiary)] group-hover:bg-[color:var(--color-text-primary)]', pointed?.hash === tick.change.commit.hash && (accent ? 'bg-[color:var(--color-indigo-hover)]' : 'bg-[color:var(--color-text-primary)]'))} style={{ right: 1 }} />
        </button>;
      })}
      {unit !== 'minute' && filled.map(({ column, index }, position) => {
        const share = Math.sqrt(column.changes.length / busiest);
        const accented = column.changes.filter(change => notable.has(change.commit.hash)).length;
        const mark = columnMarks[position];
        return <button key={column.start} {...markProps(mark, position)}
          className={cn('group absolute inset-y-0 flex flex-col-reverse items-center gap-px rounded-micro', FOCUS_RING)}
          style={{ left: `${(index / columns.length) * 100}%`, width: `${100 / columns.length}%` }}>
          <span aria-hidden className="flex w-[min(1.5rem,calc(100%-2px))] flex-col-reverse gap-px" style={{ height: `${share * 100}%`, minHeight: 2 }}>
            {accented > 0 && <span className="w-full rounded-micro bg-[color:var(--color-indigo-accent)]" style={{ flexGrow: accented, minHeight: 1 }} />}
            {column.changes.length > accented && <span className={cn('w-full rounded-micro transition-colors group-hover:bg-[color:var(--color-text-primary)]', pointed?.key === column.start ? 'bg-[color:var(--color-text-primary)]' : 'bg-[color:var(--color-text-tertiary)]')} style={{ flexGrow: column.changes.length - accented, minHeight: 1 }} />}
          </span>
        </button>;
      })}
    </div>
    <div aria-hidden className="relative mt-2 h-4 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">
      {axis.map(mark => <span key={mark.key} className={cn('absolute top-0 whitespace-nowrap', mark.centred && '-translate-x-1/2')} style={{ left: `${mark.at * 100}%` }}>{mark.text}</span>)}
    </div>
  </figure>;
}
