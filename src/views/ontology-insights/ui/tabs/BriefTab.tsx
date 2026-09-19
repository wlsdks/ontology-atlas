'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CensusSubStat, CensusTile } from '@/shared/ui/census-tile';
import { controlClass } from '@/shared/ui/control-class';
import { Button, Disclosure } from '@/shared/ui';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import type { SinceRow } from '../../lib/brief/since-list';
import { cn } from '@/shared/lib/cn';
import { briefTotals, visibleLines, type BriefCore, type BriefLine, type BriefLineDetail, type BriefState } from '../../lib/brief/brief-model';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';

/**
 * Where each line opens. A line is a count of named things; the destination is the screen
 * that lists them, never a second copy of that list here (one store per concept).
 */
const LINE_HREF: Record<string, string> = {
  'ontology-evidence-moved': '/ontology/insights/?tab=growth',
  'ontology-evidence-missing': '/ontology/insights/?tab=do-next',
  'ontology-evidence-folder-only': '/topology/',
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

/**
 * One shape per state, so a reader scanning marks alone is never reading colour: a filled
 * dot is something to learn, a hollow ring is something nobody checked, and a dash is
 * something that merely happened. Two filled circles 1.48:1 apart failed that test
 * (design-infoviz, 2026-09-19).
 */
const STATE_MARK: Record<BriefState, string> = {
  current: 'mt-[10px] h-0.5 w-2.5 rounded-full bg-[color:var(--color-text-tertiary)]',
  stale: 'mt-[7px] size-2 rounded-full bg-[color:var(--color-amber-source-a90)]',
  unknown: 'mt-[7px] size-2 rounded-full border border-[color:var(--color-text-tertiary)] bg-transparent',
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
          <BriefCoreCard key={core.core} core={core} details={brief.details} nowMs={brief.nowMs} />
        ))}
      </div>
      <BriefSinceList rows={brief.since} total={brief.sinceTotal} nowMs={brief.nowMs} />
    </section>
  );
}

function BriefCoreCard({ core, details, nowMs }: { core: BriefCore; details: InsightsBrief['details']; nowMs: number }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const [c1, c2, c3] = COLUMNS[core.core];
  const lines = visibleLines(core);
  const measured = core.availability === 'measured';
  return (
    <CensusTile label={t(`core.${core.core}`)} testId={`brief-core-${core.core}`} rowKey={core.core}>
      {core.headline == null ? (
        <p className="text-label text-[color:var(--color-text-quaternary)]" data-testid="brief-core-unmeasured">
          {t(`unit.${core.core}`)} · {t('notMeasured')}
        </p>
      ) : (
        <p className="font-mono text-body-lg font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-primary)]">
          {core.headline}
          <span className="ml-1.5 text-label text-[color:var(--color-text-quaternary)]">{t(`unit.${core.core}`)}</span>
        </p>
      )}
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
          <BriefLineRow key={line.id} line={line} details={details.get(line.id) ?? EMPTY_DETAILS} nowMs={nowMs} />
        ))}
      </ul>
    </CensusTile>
  );
}

const EMPTY_DETAILS: readonly BriefLineDetail[] = [];
const DETAIL_ROWS = 5;

/**
 * One line of the brief. When the line's own calculation produced named rows, the line
 * expands in place to show them — concept, the exact path, and the two dates the verdict
 * rests on. A count whose only destination is another screen counting something else is
 * the falsifier this decision wrote down for itself (PO evidence seat, 2026-09-19).
 */
function BriefLineRow({ line, details, nowMs }: { line: BriefLine; details: readonly BriefLineDetail[]; nowMs: number }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const format = useFormatter();
  const href = LINE_HREF[line.id];
  const sentence = t(`line.${line.id}`, { count: line.count });
  const shown = details.slice(0, DETAIL_ROWS);
  return (
    <li className="text-body text-[color:var(--color-text-primary)]" data-brief-line={line.id} data-brief-state={line.state}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={cn('shrink-0', STATE_MARK[line.state])} />
        {shown.length > 0 ? (
          <Disclosure className="min-w-0 flex-1" summary={sentence} summaryTestId={`brief-line-open-${line.id}`}>
            <ul className="mt-2 flex flex-col gap-1.5 border-l border-[color:var(--color-divider)] pl-3" data-testid={`brief-line-rows-${line.id}`}>
              {shown.map((row, index) => (
                <li key={`${row.name}-${row.path}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Link href={row.href} className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>
                    {row.name}
                  </Link>
                  <code className="min-w-0 break-all font-mono text-label text-[color:var(--color-text-tertiary)]">{row.path}</code>
                  <span className="text-label text-[color:var(--color-text-quaternary)]">
                    {row.at
                      ? t('detailMoved', {
                          moved: format.relativeTime(new Date(row.at), nowMs),
                          doc: row.docAt ? format.relativeTime(new Date(row.docAt), nowMs) : t('detailDocUnknown'),
                        })
                      : t('detailGone')}
                  </span>
                </li>
              ))}
            </ul>
            <HiddenCountLine
              total={details.length}
              shown={shown.length}
              label={(hidden) => t('detailHidden', { count: hidden })}
              route={href ? <Link href={href} className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('open')}</Link> : null}
              className="mt-2 pl-3"
              data-testid={`brief-line-hidden-${line.id}`}
            />
          </Disclosure>
        ) : (
          <>
            <span className="min-w-0 flex-1 break-keep">{sentence}</span>
            {href ? (
              <Link href={href} className={controlClass({ shape: 'link', className: 'shrink-0 text-[color:var(--color-indigo-text-strong)]' })}>
                {t('open')}
              </Link>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The cards count; this names. Everything that happened after the anchor, newest first,
 * from the dates the folder already carries — no list is invented and none is copied.
 */
function BriefSinceList({ rows, total, nowMs }: { rows: readonly SinceRow[]; total: number; nowMs: number }) {
  const t = useTranslations('ontologyPages.insights.brief');
  const format = useFormatter();
  if (total === 0) return null;
  return (
    <section data-testid="brief-since" className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('sinceTitle', { count: total })}
      </h3>
      <ol className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">
        {rows.map((row, index) => (
          <li key={`${row.core}-${row.at}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2 text-body" data-since-core={row.core}>
            <span className="min-w-0 truncate text-[color:var(--color-text-primary)]" title={row.label}>
              <span className="text-[color:var(--color-text-tertiary)]">{t(`since.${row.kind}`)}</span>
              {' '}
              {row.label}
            </span>
            <time dateTime={row.at} className="font-mono tabular-nums text-label text-[color:var(--color-text-quaternary)]">
              {format.relativeTime(new Date(row.at), nowMs)}
            </time>
            {row.href ? (
              <Link href={row.href} className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>
                {t('open')}
              </Link>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      <HiddenCountLine
        total={total}
        shown={rows.length}
        label={(hidden) => t('sinceHidden', { count: hidden })}
        route={<Link href="/git/" className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('sinceHiddenRoute')}</Link>}
        className="mt-3"
      />
    </section>
  );
}
