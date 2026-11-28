import { useId, useMemo, useRef, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { FeatureStage } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { BrandPortrait } from '@/shared/ui/marks/moru/brand-portrait';
import type { BriefingRange } from '../../model/briefing-model';
import { changeTitle, type ChangeDigest as Digest, type NotableChange, type NotableReason } from '../../model/change-digest';
import type { TimelineUnit } from '../../model/digest-timeline';
import { ConceptLinks, DigestGroups, KindsBar, KindsLine, PAGE_SIZE, type DigestSelection } from './DigestGroups';
import { DigestSummarySeat } from './DigestSummarySeat';
import { DigestTimeline } from './DigestTimeline';

export type { DigestSelection } from './DigestGroups';

const NO_CHANGES: never[] = [];
const CARD_COLUMNS = ['md:grid-cols-2', 'md:grid-cols-2', 'md:grid-cols-3'] as const;
const NO_NOTABLE = new Set<string>();
/** Even space above and below the stage; on wide screens the frame's bottom breath and main's padding (72px) are the lower half. */
const STAGE_BELOW_BAND = 'flex flex-1 flex-col py-8 md:py-10 lg:pt-18 lg:pb-0';

interface ChangeDigestProps {
  digest: Digest;
  range: BriefingRange;
  unit: TimelineUnit;
  selection: DigestSelection;
  onSelection: (next: DigestSelection) => void;
  partialCount: number | 'limited' | null;
  conceptTitle: (id: string) => string;
  formatTime: (committedAt: string) => string;
  pullUrl: (number: number) => string | null;
  onOpen: (commit: BriefingCommit) => void;
  /** Drawn under the headline and timeline, above the notable changes. */
  afterHeadline?: ReactNode;
}

function HeadlineBand({ count, children, figure }: { count: number; children?: ReactNode; figure: ReactNode }) {
  return <section data-testid="change-digest-headline" className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-3">
    <div className="min-w-0 space-y-3">
      <h2 className={cn('font-mono text-hero-lg leading-display-tight font-[var(--font-weight-strong)] tabular-nums', count ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-tertiary)]')}>{count.toLocaleString()}</h2>
      {children}
    </div>
    <div className="min-w-0 lg:col-span-2">{figure}</div>
  </section>;
}

export function ChangeDigest({ digest, range, unit, selection, onSelection, partialCount, conceptTitle, formatTime, pullUrl, onOpen, afterHeadline }: ChangeDigestProps) {
  const t = useTranslations('changeDigest');
  const rootRef = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => digest.groups.flatMap(group => group.changes), [digest]);
  const notable = useMemo(() => new Set(digest.notable.map(entry => entry.change.commit.hash)), [digest]);
  function reveal(hash: string) {
    const group = digest.groups.find(entry => entry.changes.some(change => change.commit.hash === hash));
    if (!group) return;
    const index = group.changes.findIndex(change => change.commit.hash === hash);
    const shown = Math.max(selection.shown[group.key] ?? PAGE_SIZE, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
    onSelection({ group: group.key, change: hash, shown: { ...selection.shown, [group.key]: shown } });
    requestAnimationFrame(() => {
      const panel = rootRef.current?.querySelector<HTMLElement>(`[data-digest-list="${CSS.escape(group.key)}"]`);
      const row = panel?.querySelector<HTMLElement>(`[data-change-hash="${CSS.escape(hash)}"]`);
      panel?.scrollIntoView({ block: 'start' });
      row?.focus({ preventScroll: true });
    });
  }
  return <div ref={rootRef} data-testid="change-digest" className="space-y-12">
    {partialCount !== null && <p role="status" data-testid="change-digest-partial" className="text-body text-[color:var(--color-status-warning)]">{partialCount === 'limited' ? t('partialOther') : t('partial', { count: partialCount })}</p>}
    <HeadlineBand count={digest.changes} figure={<DigestTimeline unit={unit} range={range} changes={changes} notable={notable} onSelect={reveal} />}>
      <p className="text-body-lg text-[color:var(--color-text-secondary)]">{t('headline', { count: digest.changes, files: digest.files })}</p>
      {digest.kinds && <div className="space-y-2.5 pt-2">
        <KindsBar kinds={digest.kinds} />
        <KindsLine kinds={digest.kinds} counts={[...digest.kinds.kinds.map(kind => kind.count), digest.kinds.other]} label={t('kinds')} className="text-body" />
      </div>}
    </HeadlineBand>
    {afterHeadline}
    {digest.notable.length > 0 && <NotableCards notable={digest.notable} conceptTitle={conceptTitle} formatTime={formatTime} onReveal={reveal} />}
    <DigestSummarySeat />
    <DigestGroups digest={digest} selection={selection} onSelection={onSelection} conceptTitle={conceptTitle} formatTime={formatTime} pullUrl={pullUrl} onOpen={onOpen} />
  </div>;
}

export function EmptyDigest({ range, unit, title, action }: { range: BriefingRange; unit: TimelineUnit; title: ReactNode; action?: ReactNode }) {
  return <div data-testid="change-digest-empty" className="flex flex-1 flex-col">
    <HeadlineBand count={0} figure={<DigestTimeline unit={unit} range={range} changes={NO_CHANGES} notable={NO_NOTABLE} />} />
    <div className={STAGE_BELOW_BAND}>
      <FeatureStage art={() => <div className="flex justify-center"><BrandPortrait expression="curious" /></div>} title={title} action={action} />
    </div>
  </div>;
}

function NotableCards({ notable, conceptTitle, formatTime, onReveal }: { notable: NotableChange[]; onReveal: (hash: string) => void } & Pick<ChangeDigestProps, 'conceptTitle' | 'formatTime'>) {
  const t = useTranslations('changeDigest');
  const headingId = useId();
  const reason = (value: NotableReason) => value.kind === 'revert' ? t('reasonRevert') : value.kind === 'breaking' ? t('reasonBreaking') : value.kind === 'reach' ? t('reasonReach', { count: value.count }) : t('reasonSize', { count: value.count });
  return <section aria-labelledby={headingId} data-testid="change-digest-notable">
    <h3 id={headingId} className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('notable')}</h3>
    <ul data-digest-list="notable" className={cn('mt-3 grid gap-4', CARD_COLUMNS[notable.length - 1])}>
      {notable.map(({ change, reason: why }) => {
        const { commit } = change;
        const title = changeTitle(commit.subject, commit.message);
        return <li key={commit.hash} data-notable-card className="relative flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] transition-colors has-[[data-change-hash]:hover]:border-[color:var(--color-border-strong)] has-[[data-change-hash]:hover]:bg-[color:var(--color-overlay-1)]">
          <span className={badgeClass({ shape: 'tag', className: 'self-start border border-[color:var(--color-indigo-accent-a32)] bg-[color:var(--color-indigo-accent-a12)] py-0.5 text-[color:var(--color-indigo-text-soft)]' })}>{reason(why)}</span>
          <button type="button" data-change-hash={commit.hash} title={title} onClick={() => onReveal(commit.hash)}
            className="mt-3 line-clamp-2 break-words text-left text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-panel focus-visible:text-[color:var(--color-indigo-text-soft)] focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--color-indigo-focus-ring)]">{title}</button>
          <p className="mt-2 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">{[change.number !== null ? `#${change.number}` : null, formatTime(commit.committedAt)].filter(Boolean).join(' · ')}</p>
          {change.concepts.length > 0 && <div className="relative mt-auto flex flex-wrap gap-2 pt-4">
            <ConceptLinks ids={change.concepts} conceptTitle={conceptTitle} />
          </div>}
        </li>;
      })}
    </ul>
  </section>;
}
