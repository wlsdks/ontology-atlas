import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import type { WorkKinds } from '../../model/change-digest';
import type { ReleaseRow, UnreleasedSpan } from '../../model/release-list';

/** Rows share one height so the branch line and the span mark are drawn from row indexes. */
const ROW_HEIGHT_PX = 56;
const GUTTER = 'w-7';
const LINE_X = 'left-[13.5px]';
const MARK_SIZE = { major: 'size-3', minor: 'size-2.5', patch: 'size-2' } as const;
const KIND_INKS = [
  'bg-[color:var(--color-text-primary)]',
  'bg-[color:var(--color-text-secondary)]',
  'bg-[color:var(--color-text-tertiary)]',
  'bg-[color:var(--color-text-quaternary)]',
  'bg-[color:var(--color-indigo-a46)]',
] as const;
const OTHER_KIND_INK = 'bg-[color:var(--color-indigo-a28)]';
const UNTYPED_INK = 'bg-[color:var(--color-text-tertiary)]';
const ACCENT_INK = 'bg-[color:var(--color-indigo-accent)]';
const FOCUS_RING = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/** Bars that already grew; a bar grows from zero once, the first time its count is drawn. */
const grown = new Set<string>();

interface ReleaseListProps {
  rows: readonly ReleaseRow[];
  unreleased: UnreleasedSpan | null;
  /** The selected row; null is Unreleased, undefined nothing yet. */
  selected: ReleaseRow | null | undefined;
  /** Where the span being read starts: a row, the first commit (null), or unknown. */
  since: ReleaseRow | null | undefined;
  branch: string;
  largest: number;
  formatDate: (epochSeconds: number) => string;
  onSelect: (row: ReleaseRow | null) => void;
}

export function ReleaseList({ rows, unreleased, selected, since, branch, largest, formatDate, onSelect }: ReleaseListProps) {
  const t = useTranslations('releases');
  const headingId = useId();
  const options = useRef(new Map<string, HTMLDivElement>());
  const entries: (ReleaseRow | null)[] = unreleased ? [null, ...rows] : [...rows];
  const keyOf = (entry: ReleaseRow | null) => entry?.release.commit ?? 'unreleased';
  const selectedIndex = selected === undefined ? -1 : entries.indexOf(selected);
  const sinceIndex = since === undefined ? -1 : since === null ? entries.length : entries.indexOf(since);
  const spanFrom = selectedIndex >= 0 ? (selectedIndex + 0.5) * ROW_HEIGHT_PX : 0;
  const spanTo = sinceIndex >= 0 ? Math.min(entries.length, sinceIndex + 0.5) * ROW_HEIGHT_PX : spanFrom;
  const lineTop = unreleased ? ROW_HEIGHT_PX * 1.5 : ROW_HEIGHT_PX / 2;
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const at = Math.max(0, selectedIndex);
    const last = entries.length - 1;
    const next = event.key === 'ArrowDown' ? Math.min(last, at + 1) : event.key === 'ArrowUp' ? Math.max(0, at - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null || last < 0) return;
    event.preventDefault();
    onSelect(entries[next]);
    options.current.get(keyOf(entries[next]))?.focus();
  }
  return <div className="min-w-0">
    <h3 id={headingId} className="sr-only">{t('list')}</h3>
    <div role="listbox" aria-labelledby={headingId} data-testid="release-list" onKeyDown={move} className="relative">
      <span aria-hidden data-release-line className={cn('absolute bottom-0 w-px bg-[color:var(--color-border-strong)]', LINE_X)} style={{ top: lineTop }} />
      {unreleased && <span aria-hidden data-release-open-end className={cn('absolute border-l border-dashed border-[color:var(--color-border-strong)]', LINE_X)} style={{ top: ROW_HEIGHT_PX / 2, height: lineTop - ROW_HEIGHT_PX / 2 }} />}
      <span aria-hidden data-release-span className={cn('motion-span-mark absolute top-0 left-3 w-[3px] origin-top rounded-micro bg-[color:var(--color-text-primary)]', spanTo <= spanFrom && 'opacity-0')}
        style={{ height: 1, transform: `translateY(${spanFrom}px) scaleY(${Math.max(1, spanTo - spanFrom)})` }} />
      {entries.map(entry => {
        const key = keyOf(entry);
        const isSelected = entry === selected;
        return <ReleaseOption key={key} row={entry} unreleased={entry === null ? unreleased : null} selected={isSelected} branch={branch} largest={largest} formatDate={formatDate}
          optionRef={element => { if (element) options.current.set(key, element); else options.current.delete(key); }}
          tabbable={isSelected || (selectedIndex < 0 && entry === entries[0])} onPress={() => onSelect(entry)} />;
      })}
    </div>
  </div>;
}

function CountBar({ id, count, largest, kinds, kindCounts, accent }: { id: string; count: number; largest: number; kinds: WorkKinds | null; kindCounts: number[] | null; accent: boolean }) {
  const [first] = useState(() => !grown.has(id));
  useEffect(() => { grown.add(id); }, [id]);
  const share = largest > 0 ? Math.sqrt(count / largest) : 0;
  const segments = kinds && kindCounts ? kindCounts : [count];
  return <span aria-hidden data-release-bar className={cn('flex h-1.5 gap-px', first && 'motion-bar-grow')} style={{ width: `${share * 100}%` }}>
    {count > 0 && segments.map((value, index) => value > 0 && <span key={index} className={cn('h-full min-w-px first:rounded-l-micro last:rounded-r-micro', accent ? ACCENT_INK : !kinds ? UNTYPED_INK : index < kinds.kinds.length ? KIND_INKS[index] : OTHER_KIND_INK)} style={{ flexGrow: value }} />)}
  </span>;
}

function Mark({ row, selected }: { row: ReleaseRow; selected: boolean }) {
  const { release, placement } = row;
  const shape = cn('block rounded-full', MARK_SIZE[release.size], release.preRelease
    ? cn('border-2 bg-[color:var(--color-canvas)]', selected ? 'border-[color:var(--color-indigo-accent)]' : 'border-[color:var(--color-text-primary)]')
    : selected ? 'bg-[color:var(--color-indigo-accent)]' : 'bg-[color:var(--color-text-primary)]');
  if (placement === 'off') return <span aria-hidden data-release-mark="off" className="absolute top-1/2 left-[13.5px] flex -translate-y-1/2 items-center">
    <span className="h-px w-2.5 bg-[color:var(--color-border-strong)]" />
    <span className={shape} />
  </span>;
  return <span aria-hidden data-release-mark={release.preRelease ? 'ring' : 'disc'} data-release-size={release.size} className={cn('absolute top-1/2 left-[14px] -translate-x-1/2 -translate-y-1/2', placement === 'unknown' && 'opacity-60')}>
    <span className={shape} />
  </span>;
}

/** Unreleased is the line's open end: a dotted hollow ring, apart from a pre-release's solid one. */
function OpenEndMark({ selected }: { selected: boolean }) {
  return <span aria-hidden data-release-mark="open" className="absolute top-1/2 left-[14px] -translate-x-1/2 -translate-y-1/2">
    <span className={cn('block size-3 rounded-full border-2 border-dotted bg-[color:var(--color-canvas)]', selected ? 'border-[color:var(--color-indigo-accent)]' : 'border-[color:var(--color-text-secondary)]')} />
  </span>;
}

function ReleaseOption({ row, unreleased, selected, branch, largest, formatDate, optionRef, tabbable, onPress }: {
  row: ReleaseRow | null; unreleased: UnreleasedSpan | null; selected: boolean; branch: string; largest: number; formatDate: (epochSeconds: number) => string;
  optionRef: (element: HTMLDivElement | null) => void; tabbable: boolean; onPress: () => void;
}) {
  const t = useTranslations('releases');
  const count = row ? row.count : unreleased?.count ?? null;
  const kinds = row ? row.kinds : unreleased?.kinds ?? null;
  const kindCounts = row ? row.kindCounts : unreleased?.kindCounts ?? null;
  const name = row ? row.release.names[0] : t('unreleased');
  const date = row ? formatDate(row.release.committedAt) : '';
  const label = count === null ? t('row.uncounted', { release: name, date }) : t('row.name', { release: name, date, count });
  const note = !row ? null : row.placement === 'off' ? t('mark.offBranch', { branch }) : row.release.preRelease ? t('mark.preRelease') : null;
  return <div ref={optionRef} role="option" aria-selected={selected} aria-label={note ? `${label} · ${note}` : label} tabIndex={tabbable ? 0 : -1}
    data-release-row={row ? row.release.names[0] : 'unreleased'} data-release-placement={row?.placement ?? 'unreleased'} onClick={onPress}
    className={cn('relative flex h-14 cursor-pointer items-stretch rounded-card transition-colors', FOCUS_RING, selected ? 'bg-[color:var(--color-overlay-2)]' : 'hover:bg-[color:var(--color-overlay-1)]')}>
    <span aria-hidden className={cn('relative shrink-0', GUTTER)}>{row ? <Mark row={row} selected={selected} /> : <OpenEndMark selected={selected} />}</span>
    <span className={cn('flex min-w-0 flex-1 flex-col justify-center gap-1 pr-3', row?.placement === 'off' && 'pl-3')}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn('truncate text-body font-[var(--font-weight-strong)]', row ? 'font-mono' : '', selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>{name}</span>
          {row && row.release.names.length > 1 && <span className="truncate font-mono text-label text-[color:var(--color-text-tertiary)]">{row.release.names.slice(1).join(' ')}</span>}
        </span>
        <span className="shrink-0 font-mono text-body tabular-nums text-[color:var(--color-text-primary)]">{count === null ? '' : count.toLocaleString()}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="shrink-0 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)]">{note ?? date}{note && date ? ` · ${date}` : ''}</span>
        <span className="min-w-0 flex-1">{count !== null && <CountBar id={row?.release.commit ?? 'unreleased'} count={count} largest={largest} kinds={kinds} kindCounts={kindCounts} accent={selected} />}</span>
      </span>
    </span>
  </div>;
}
