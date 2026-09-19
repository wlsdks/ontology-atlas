'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CensusBigNumber, CensusSubStat, CensusTile } from '@/shared/ui/census-tile';
import { controlClass } from '@/shared/ui/control-class';
import { Button } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { briefTotals, visibleLines, type BriefCore, type BriefLine, type BriefState } from '../../lib/brief/brief-model';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';

/**
 * Where each line opens. A line is a count of named things; the destination is the screen
 * that lists them, never a second copy of that list here (one store per concept).
 */
const LINE_HREF: Record<string, string> = {
  'ontology-evidence-moved': '/ontology/insights/?tab=growth',
  'ontology-evidence-unchecked': '/download/',
  'ontology-agent-unreviewed': '/topology/',
  'ontology-changed-since': '/ontology/insights/?tab=growth',
  'ontology-repair': '/ontology/insights/?tab=do-next',
  'ontology-unmatched': '/ontology/insights/?tab=unmatched',
  'wiki-stale-pages': '/library/',
  'wiki-disagreements': '/library/',
  'wiki-sources-unwritten': '/library/',
  'wiki-orphan-pages': '/library/',
  'wiki-dangling-links': '/library/',
  'wiki-written-since': '/library/',
  'wiki-redrafted-since': '/library/?tab=rounds',
  'wiki-passes-troubled-since': '/library/?tab=rounds',
  'harness-untold-areas': '/architecture/?view=coverage',
  'harness-ungated-areas': '/architecture/?view=coverage',
  'harness-unwatched-areas': '/architecture/?view=coverage',
  'harness-mirror-drift': '/architecture/?view=guides',
  'harness-changed-since': '/architecture/?view=guides',
  'agent-calls-since': '/agents/',
  'agent-writes-since': '/git/',
  'agent-distinct-since': '/agents/',
};

/** The three column names each core speaks in; the model's slots are positional. */
const COLUMNS: Record<BriefCore['core'], readonly [string, string, string]> = {
  ontology: ['current', 'stale', 'unknown'],
  wiki: ['current', 'stale', 'unknown'],
  harness: ['told', 'gated', 'watched'],
  agent: ['reads', 'writes', 'agents'],
};

const STATE_MARK: Record<BriefState, string> = {
  current: 'bg-[color:var(--color-text-tertiary)]',
  stale: 'bg-[color:var(--color-amber-source-a90)]',
  unknown: 'border border-[color:var(--color-text-tertiary)] bg-transparent',
};

export function BriefTab({ brief }: { brief: InsightsBrief }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const cores = [brief.ontology, brief.wiki, brief.harness, brief.agent] as const;
  const totals = briefTotals(cores);
  return (
    <section data-testid="brief-tab" className="flex flex-col gap-[var(--section-gap)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {brief.anchor.isDefaultWindow ? t('sinceDefault') : t('sinceSeen', { days: brief.sinceDays })}
          </p>
          <h2 className="mt-1 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]" data-testid="brief-headline">
            {t('headline', { stale: totals.stale, unknown: totals.unknown })}
          </h2>
          <p className="mt-2 text-body text-[color:var(--color-text-tertiary)]">{t('sinceGloss')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => brief.markSeen()} data-testid="brief-mark-seen">
          {t('markSeen')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
        {cores.map((core) => (
          <BriefCoreCard key={core.core} core={core} />
        ))}
      </div>
    </section>
  );
}

function BriefCoreCard({ core }: { core: BriefCore }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const [c1, c2, c3] = COLUMNS[core.core];
  const lines = visibleLines(core);
  const measured = core.availability === 'measured';
  return (
    <CensusTile label={t(`core.${core.core}`)} testId={`brief-core-${core.core}`} rowKey={core.core}>
      <CensusBigNumber value={core.headline ?? '–'} unit={t(`unit.${core.core}`)} scale="section" />
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="brief-core-columns">
        <CensusSubStat label={t(`col.${c1}`)} value={measured && core.current != null ? core.current : '–'} />
        <CensusSubStat label={t(`col.${c2}`)} value={measured && core.stale != null ? core.stale : '–'} tone={core.stale ? 'warning' : 'numeral'} />
        <CensusSubStat label={t(`col.${c3}`)} value={core.unknown != null ? core.unknown : '–'} />
      </div>
      <ul className="mt-1 flex flex-1 flex-col gap-2" data-testid="brief-core-lines">
        {core.availability === 'app-only' ? (
          <li className="text-body text-[color:var(--color-text-tertiary)]">{t('appOnly')}</li>
        ) : null}
        {core.availability === 'no-data' ? (
          <li className="text-body text-[color:var(--color-text-tertiary)]">{t('noData')}</li>
        ) : null}
        {measured && lines.length === 0 ? (
          <li className="text-body text-[color:var(--color-text-tertiary)]">{t('quiet')}</li>
        ) : null}
        {lines.map((line) => (
          <BriefLineRow key={line.id} line={line} />
        ))}
      </ul>
    </CensusTile>
  );
}

function BriefLineRow({ line }: { line: BriefLine }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const href = LINE_HREF[line.id];
  return (
    <li className="flex items-start gap-2.5 text-body text-[color:var(--color-text-primary)]" data-brief-line={line.id} data-brief-state={line.state}>
      <span aria-hidden="true" className={cn('mt-[7px] size-2 shrink-0 rounded-full', STATE_MARK[line.state])} />
      <span className="min-w-0 flex-1 break-keep">{t(`line.${line.id}`, { count: line.count })}</span>
      {href ? (
        <Link href={href} className={controlClass({ shape: 'link', className: 'shrink-0 text-[color:var(--color-indigo-text-strong)]' })}>
          {t('open')}
        </Link>
      ) : null}
    </li>
  );
}
