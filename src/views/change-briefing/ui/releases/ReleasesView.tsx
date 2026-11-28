import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import type { BriefingCommit, ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { Button, FeatureStage, Select } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { controlClass } from '@/shared/ui/control-class';
import { BrandPortrait } from '@/shared/ui/marks/moru/brand-portrait';
import { WaitStage } from '@/shared/ui/status/wait-stage';
import { briefingRange, localDate, type CapabilityGroup } from '../../model/briefing-model';
import type { ChangeDigest as Digest } from '../../model/change-digest';
import { timelineUnit } from '../../model/digest-timeline';
import { filterRows, sequencesOf, type ReleaseRow } from '../../model/release-list';
import type { ReleaseReading } from '../../model/use-release-reading';
import { ChangeDigest, type DigestSelection } from '../digest/ChangeDigest';
import { ReleaseList } from './ReleaseList';

const PAGE_SIZE = 40;
const CONCEPTS_SHOWN = 12;
const ALL_SEQUENCES = '\u0000all';
const UNRELEASED = '\u0000unreleased';
/** The list keeps 320px beside a pane of at least 640px (61rem with the gap); narrower, it becomes one Select. */
const SPLIT = 'grid min-w-0 gap-x-6 gap-y-6 @[61rem]/releases:grid-cols-[20rem_minmax(40rem,1fr)]';
const NARROW_ONLY = '@[61rem]/releases:hidden';
const WIDE_ONLY = 'hidden @[61rem]/releases:block';

const STATUS_COPY: Record<string, string> = { stale: 'stale', 'no-history': 'noHistory', 'no-source': 'noSource', ungranted: 'sourceUngranted' };

interface ReleasesViewProps {
  reading: ReleaseReading;
  digest: Digest | null;
  groups: readonly CapabilityGroup[] | null;
  showConcepts: boolean;
  selection: DigestSelection;
  onSelection: (next: DigestSelection) => void;
  conceptTitle: (id: string) => string;
  formatTime: (committedAt: string) => string;
  pullUrl: (number: number) => string | null;
  onOpen: (commit: BriefingCommit) => void;
  onChooseRepository: () => void;
}

export function ReleasesView(props: ReleasesViewProps) {
  const { reading } = props;
  const t = useTranslations('releases');
  const briefing = useTranslations('changeBriefing');
  const { list } = reading;
  if (reading.listLoading) return <div data-testid="releases-view" className="min-h-40">
    <p role="status" className="motion-reading-in text-body text-[color:var(--color-text-secondary)]">{t('reading')}</p>
  </div>;
  if (reading.listError || !list || (list.status !== 'measured' && list.status !== 'partial')) {
    const status = reading.listError || !list ? 'readError' : STATUS_COPY[list.status] ?? 'sourceUnavailable';
    const choose = status === 'noSource' || status === 'sourceUngranted' || status === 'sourceUnavailable';
    return <section role="status" data-testid="releases-status" className="space-y-3 py-6">
      <h2 className="text-title font-[var(--font-weight-strong)]">{briefing(status)}</h2>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={choose ? props.onChooseRepository : reading.refresh}>{status === 'stale' ? briefing('refresh') : briefing('retry')}</Button>
    </section>;
  }
  if (!list.tags.length) return <div data-testid="releases-empty" className="flex flex-1 flex-col justify-center py-10">
    <FeatureStage art={() => <div className="flex justify-center"><BrandPortrait expression="curious" /></div>} title={t('empty.title')} body={t('empty.body')}
      action={<Button size="lg" onClick={reading.refresh}>{t('empty.readAgain')}</Button>} />
  </div>;
  return <ReleasesLayout {...props} />;
}

function ReleasesLayout({ reading, ...pane }: ReleasesViewProps) {
  const t = useTranslations('releases');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [sequence, setSequence] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const list = reading.list!;
  const branch = list.line ?? 'HEAD';
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }), [locale]);
  const formatDate = (epoch: number) => dateFormat.format(new Date(epoch * 1000));
  const sequences = useMemo(() => sequencesOf(reading.rows.map(row => row.release)), [reading.rows]);
  const filtered = useMemo(() => filterRows(reading.rows, query, sequence), [reading.rows, query, sequence]);
  const visible = filtered.slice(0, shown);
  const largest = Math.max(1, reading.unreleased.count ?? 0, ...reading.rows.map(row => row.count ?? 0));
  const selected = reading.selected;
  const sinceTarget = spanStart(reading);
  const sinceOnList = sinceTarget && !visible.includes(sinceTarget) ? null : sinceTarget;
  const showUnreleased = !query && sequence === null;
  const notes = [
    reading.depthLimited && t('partial.depth', { count: list.walkLimit, branch }),
    list.partialReasons.includes('shallow') && t('partial.shallow'),
    list.unreadableNames > 0 && t('partial.names', { count: list.unreadableNames }),
  ].filter(Boolean);
  const chooseOptions = [
    ...(showUnreleased ? [{ value: UNRELEASED, label: t('unreleased') }] : []),
    ...filtered.map(row => ({ value: row.release.commit, label: `${row.release.names[0]} · ${formatDate(row.release.committedAt)}` })),
  ];
  return <div data-testid="releases-view" className="@container/releases min-w-0">
    <div className={SPLIT}>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t('find.label')} type="search" className="w-full min-w-0 flex-1" value={query} onChange={event => { setQuery(event.target.value); setShown(PAGE_SIZE); }} data-testid="release-find" />
          {sequences.length >= 2 && <Select size="md" ariaLabel={t('prefix.label')} value={sequence ?? ALL_SEQUENCES} onChange={value => { setSequence(value === ALL_SEQUENCES ? null : value); setShown(PAGE_SIZE); }}
            options={[{ value: ALL_SEQUENCES, label: t('prefix.all') }, ...sequences.map(prefix => ({ value: prefix, label: `${prefix}…` }))]} />}
        </div>
        <div className={NARROW_ONLY}>
          <Select ariaLabel={t('choose')} value={selected === null ? UNRELEASED : selected?.release.commit ?? ''} data-testid="release-choose"
            onChange={value => reading.choose(value === UNRELEASED ? null : filtered.find(row => row.release.commit === value) ?? null)} options={chooseOptions} />
        </div>
        <div className={WIDE_ONLY}>
          {filtered.length === 0 && query ? <p role="status" className="py-3 text-body text-[color:var(--color-text-secondary)]">{t('find.none', { query })}</p>
            : <ReleaseList rows={visible} unreleased={showUnreleased ? reading.unreleased : null} selected={selected === null && !showUnreleased ? undefined : selected} since={sinceOnList} branch={branch} largest={largest} formatDate={formatDate} onSelect={reading.choose} />}
          {filtered.length > shown && <Button className="atlas-touch-floor atlas-touch-floor-wide mt-2" variant="ghost" size="sm" onClick={() => setShown(shown + PAGE_SIZE)}>{t('more', { count: Math.min(PAGE_SIZE, filtered.length - shown) })}</Button>}
        </div>
        {reading.counting && <p role="status" className="text-label text-[color:var(--color-text-tertiary)]">{t('counting')}</p>}
        {notes.map(note => <p key={String(note)} className="text-label text-[color:var(--color-status-warning)]">{note}</p>)}
      </div>
      <ReleasePane {...pane} reading={reading} branch={branch} formatDate={formatDate} />
    </div>
  </div>;
}

/** The row the span being read starts at: null is the first commit, undefined not known yet. */
function spanStart(reading: ReleaseReading): ReleaseRow | null | undefined {
  const { selected, sinceChoice } = reading;
  if (sinceChoice === '') return null;
  if (sinceChoice) return reading.since.find(row => row.release.names.includes(sinceChoice));
  if (selected === null) return reading.unreleased.count === null ? undefined : reading.unreleased.after ? reading.rows.find(row => row.release === reading.unreleased.after) : null;
  if (!selected?.start) return undefined;
  return selected.start.commit ? reading.rows.find(row => row.release.commit === selected.start!.commit) : null;
}

function spanRange(data: ChangeBriefing) {
  const times = data.commits.map(commit => Date.parse(commit.committedAt)).filter(Number.isFinite);
  if (!times.length) return null;
  return briefingRange('custom', '', localDate(new Date(Math.min(...times))), localDate(new Date(Math.max(...times))));
}

function ReleasePane({ reading, branch, formatDate, digest, groups, showConcepts, selection, onSelection, conceptTitle, formatTime, pullUrl, onOpen }: Omit<ReleasesViewProps, 'onChooseRepository'> & { branch: string; formatDate: (epoch: number) => string }) {
  const t = useTranslations('releases');
  const briefing = useTranslations('changeBriefing');
  const selected = reading.selected;
  const data = reading.span;
  const range = useMemo(() => data ? spanRange(data) : null, [data]);
  if (selected === undefined) return <div className="relative min-h-60"><WaitStage mark="mascot" delayed title={briefing('loading')} /></div>;
  const heading = selected ? selected.release.names : [t('unreleased')];
  const sinceValue = reading.sinceChoice ?? spanStart(reading)?.release.names[0] ?? '';
  const sinceOptions = [
    ...reading.since.map(row => ({ value: row.release.names[0], label: t('since.option', { release: row.release.names[0], date: formatDate(row.release.committedAt) }) })),
    { value: '', label: t('since.firstCommit') },
  ];
  const readable = data && (data.status === 'measured' || data.status === 'partial');
  const status = reading.spanError ? 'readError' : data && !readable ? STATUS_COPY[data.status] ?? 'sourceUnavailable' : null;
  const truncated = readable && data.partialReasons.some(reason => reason === 'commit-limit' || reason === 'byte-limit');
  return <section aria-label={heading.join(' ')} data-testid="release-pane" className="min-w-0 space-y-6">
    <header key={selected?.release.commit ?? 'unreleased'} className="motion-release-swap flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h2 data-testid="release-heading" className={cn('break-all text-title font-[var(--font-weight-strong)]', selected && 'font-mono')}>{heading.join(' · ')}</h2>
        {selected && <p className="text-label text-[color:var(--color-text-tertiary)]">{formatDate(selected.release.committedAt)}{selected.release.preRelease ? ` · ${t('mark.preRelease')}` : ''}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-label text-[color:var(--color-text-secondary)]">{t('since.label')}</span>
        <Select size="md" ariaLabel={t('since.label')} value={sinceValue} data-testid="release-since" onChange={value => reading.chooseSince(value)} options={sinceOptions} />
      </div>
    </header>
    {selected?.placement === 'off' && <p className="text-body text-[color:var(--color-text-secondary)]">{t('offBranch', { branch })}</p>}
    {reading.spanLoading && <div className="relative min-h-60"><WaitStage mark="mascot" delayed data-testid="release-waiting" title={briefing('loading')} /></div>}
    {status && <section role="status" className="space-y-3 py-6">
      <h3 className="text-title font-[var(--font-weight-strong)]">{briefing(status)}</h3>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={reading.refresh}>{status === 'stale' ? briefing('refresh') : briefing('retry')}</Button>
    </section>}
    {!reading.spanLoading && readable && data.commits.length === 0 && <p role="status" data-testid="release-nothing" className="py-6 text-body-lg text-[color:var(--color-text-secondary)]">
      {selected === null && reading.unreleased.after ? t('nothingUnreleased', { branch, release: reading.unreleased.after.names[0] }) : briefing('empty')}
    </p>}
    {!reading.spanLoading && readable && digest && range && <div key={data.snapshot} className="motion-release-swap space-y-4">
      {truncated && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('partial.size', { count: data.commits.length })}</p>}
      <ChangeDigest digest={digest} range={range} unit={timelineUnit('custom', range)} selection={selection} onSelection={onSelection} partialCount={null}
        conceptTitle={conceptTitle} formatTime={formatTime} pullUrl={pullUrl} onOpen={onOpen}
        afterHeadline={showConcepts ? <ReleaseConcepts groups={groups} /> : null} />
    </div>}
    <section aria-label={briefing('readBasis')} className="space-y-1 border-t border-[color:var(--color-border-soft)] pt-4 text-label text-[color:var(--color-text-tertiary)]">
      <h3 className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{briefing('readBasis')}</h3>
      <p>{t('basis.tags')}</p>
      <p>{t('basis.range', { branch })}</p>
      {showConcepts && <p>{t('basis.concepts')}</p>}
    </section>
  </section>;
}

/** Recorded concepts whose implementation paths the span changed, most changes first. */
function ReleaseConcepts({ groups }: { groups: readonly CapabilityGroup[] | null }) {
  const t = useTranslations('releases');
  const [expanded, setExpanded] = useState(false);
  const concepts = useMemo(() => (groups ?? []).filter(group => group.id !== 'unmapped')
    .map(group => ({ id: group.id, title: group.title || group.id, count: group.commits.length }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)), [groups]);
  const shown = expanded ? concepts : concepts.slice(0, CONCEPTS_SHOWN);
  return <section aria-label={t('concepts.title')} data-testid="release-concepts" className="space-y-3">
    <h3 className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('concepts.title')}</h3>
    {concepts.length === 0 ? <p className="text-body text-[color:var(--color-text-tertiary)]">{t('concepts.none')}</p> : <div className="flex flex-wrap items-center gap-2">
      {shown.map(concept => <Link key={concept.id} aria-label={t('concepts.chip', { concept: concept.title, count: concept.count })} data-release-concept={concept.id}
        href={'/topology/?p=' + encodeURIComponent(translateOntologyDeeplinkToTopologyParam(concept.id))}
        className={controlClass({ shape: 'chip', size: 'sm', hoverSurface: 'lift', hoverInk: 'strong', className: 'gap-2 border-[color:var(--color-border-soft)]' })}>
        <span>{concept.title}</span><span className="font-mono tabular-nums text-[color:var(--color-text-tertiary)]">{concept.count.toLocaleString()}</span>
      </Link>)}
      {!expanded && concepts.length > CONCEPTS_SHOWN && <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>{t('concepts.more', { count: concepts.length - CONCEPTS_SHOWN })}</Button>}
    </div>}
  </section>;
}
