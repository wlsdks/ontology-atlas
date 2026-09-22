'use client';

import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CensusSubStat, CensusTile } from '@/shared/ui/census-tile';
import { controlClass } from '@/shared/ui/control-class';
import { Button } from '@/shared/ui';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { CopyAgentTextButton } from '../parts/CopyAgentTextButton';
import { buildDriftHandoff } from '../../lib/brief/drift-handoff';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import type { SinceRow } from '../../lib/brief/since-list';
import { cn } from '@/shared/lib/cn';
import { parseInsightsTabHref, type InsightsTab } from '../../lib/insights-tab-state';
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
  // Where it goes depends on why it cannot be checked. See `lineHref`.
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
  'agent-writes-waiting': '/agents/',
  'agent-writes-failed': '/git/',
  'agent-writes-refused': '/git/',
  'agent-calls-since': '/agents/',
  'agent-writes-since': '/git/',
  'agent-distinct-since': '/agents/',
};

/**
 * Where a core that cannot be counted here sends the reader. A card saying only "nothing to
 * measure" spends a quarter of the screen on a dead end; every state on this tab owes a
 * sentence and a next step, the same rule its numbers follow.
 */
const CORE_NEXT_HREF: Record<BriefCore['core'], string> = {
  ontology: '/topology/',
  wiki: '/library/',
  harness: '/architecture/',
  agent: '/agents/',
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

export function BriefTab({
  brief,
  onAskAgent,
  onOpenTab,
}: {
  brief: InsightsBrief;
  /** Seats the request in the tab's own conversation without sending it. Absent in a browser. */
  onAskAgent?: (request: string) => void;
  /** Opens another question on this same board in place. See `DestinationLink`. */
  onOpenTab?: (tab: InsightsTab) => void;
}) {
  const t = useTranslations('ontologyPages.insights.brief');
  const cores = [brief.ontology, brief.wiki, brief.harness, brief.agent] as const;
  const totals = briefTotals(cores);
  /*
   * **Marking the visit has to say so.** The press moves the anchor, which changes one 12px
   * eyebrow and nothing else on a screen where every other number can legitimately stay the
   * same; a reader could not tell whether the button had worked (walkthrough, 2026-09-20). The
   * confirmation is a live region, so it is announced rather than only drawn, and the button
   * stays enabled because pressing again re-anchors to now, which is a real thing to want.
   */
  /* Seeded from the folder rather than from this mount: what can be taken back outlives the tab
     the press happened on, and the row used to vanish on a tab switch while the anchor was still
     recoverable. */
  const [seenMarked, setSeenMarked] = useState(brief.canUndoSeen);
  return (
    <section data-testid="brief-tab" className="flex flex-col gap-[var(--section-gap)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            {brief.anchor.isDefaultWindow ? t('sinceDefault') : t('sinceSeen', { days: brief.sinceDays })}
          </p>
          {/*
            * **The line this screen exists for has to win.** It wore the same step as the page
            * title 144px above it, same size and same weight, so the title read first and did no
            * work (design-lead, 2026-09-20). `text-hero` is a registered step with its own
            * leading pair; the seat also proposed demoting the title instead, but thirteen
            * screens use that step for their h1 and two go larger, so shrinking this one alone
            * would trade an attention problem for an inconsistency across the product.
            */}
          <h2 className="mt-1 text-hero font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]" data-testid="brief-headline">
            {t('headline', { stale: totals.stale, unknown: totals.unknown })}
          </h2>
          <p className="mt-2 text-body text-[color:var(--color-text-tertiary)]">{t('sinceGloss')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-2 text-label text-[color:var(--color-text-tertiary)]"
            data-testid="brief-mark-seen-done"
          >
            {seenMarked ? (
              <>
                <span>{t('markSeenDone')}</span>
                {/*
                  * One press back, inside the same region that announced the press. It writes to
                  * this browser only, never to the folder, so it owes no dialog and no scrim.
                  */}
                <button
                  type="button"
                  data-testid="brief-mark-seen-undo"
                  onClick={() => {
                    brief.undoSeen();
                    setSeenMarked(false);
                  }}
                  className={controlClass({ shape: 'link', className: 'atlas-touch-floor text-[color:var(--color-indigo-text-strong)]' })}
                >
                  {t('markSeenUndo')}
                </button>
              </>
            ) : null}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="atlas-touch-floor"
            onClick={() => {
              brief.markSeen();
              setSeenMarked(true);
            }}
            data-testid="brief-mark-seen"
          >
            {t('markSeen')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
        {cores.map((core) => (
          <BriefCoreCard key={core.core} core={core} details={brief.details} nowMs={brief.nowMs} onAskAgent={onAskAgent} onOpenTab={onOpenTab} />
        ))}
      </div>
      <BriefSinceList rows={brief.since} total={brief.sinceTotal} nowMs={brief.nowMs} />
    </section>
  );
}

function BriefCoreCard({ core, details, nowMs, onAskAgent, onOpenTab }: { core: BriefCore; details: InsightsBrief['details']; nowMs: number; onAskAgent?: (request: string) => void; onOpenTab?: (tab: InsightsTab) => void }) {
  const t = useTranslations('ontologyPages.insights.brief');
  // The card is already titled with the subject, so a unit that repeats it is ink for nothing.
  const unit = t(`unit.${core.core}`);
  const [c1, c2, c3] = COLUMNS[core.core];
  const lines = visibleLines(core);
  const measured = core.availability === 'measured';
  return (
    <CensusTile label={t(`core.${core.core}`)} testId={`brief-core-${core.core}`} rowKey={core.core}>
      {/*
       * **The magnitude row is drawn even when this session cannot count it.** A card that
       * cannot be measured already prints why one line below, so this row says nothing new —
       * but omitting the row moved the card's state band and its sentence 31px up while its
       * three siblings kept theirs, one row of four cards reading on two baselines (measured
       * 2026-09-20 at 1512x900 and 1920x1080: 49/80 against 48/79). The dash is the mark the
       * state columns underneath already use for a value this session cannot state, and it is
       * hidden from assistive technology because it carries alignment, not a fact.
       */}
      {core.headline == null ? (
        core.availability === 'measured' ? (
          <p className="text-title text-[color:var(--color-text-tertiary)]">
            <span className="text-label" data-testid="brief-core-unmeasured">{t('notMeasured')}</span>
          </p>
        ) : (
          <p
            className="font-mono text-title font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-quaternary)]"
            data-testid="brief-core-headline-absent"
            aria-hidden
          >
            –
          </p>
        )
      ) : (
        <p className="font-mono text-title font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-primary)]">
          {core.headline}
          {unit ? <span className="ml-1.5 text-label text-[color:var(--color-text-quaternary)]">{unit}</span> : null}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="brief-core-columns">
        <CensusSubStat label={t(`col.${c1}`)} value={measured && core.current != null ? core.current : '–'} />
        <CensusSubStat label={t(`col.${c2}`)} value={measured && core.stale != null ? core.stale : '–'} tone={core.stale ? 'warning' : 'numeral'} />
        <CensusSubStat label={t(`col.${c3}`)} value={core.unknown != null ? core.unknown : '–'} />
      </div>
      <ul className="mt-1 flex flex-1 flex-col gap-3" data-testid="brief-core-lines">
        {core.availability === 'reading' || core.availability === 'unreadable' ? (
          <li className="text-body text-[color:var(--color-text-tertiary)]" data-testid={`brief-core-${core.availability}-${core.core}`}>
            {t(core.core === 'ontology' && core.availability === 'unreadable' ? 'evidenceUnreadable' : core.availability)}
          </li>
        ) : null}
        {core.availability === 'no-source' ? (
          <li className="flex flex-wrap items-baseline gap-x-2 text-body text-[color:var(--color-text-tertiary)]" data-testid={`brief-core-no-source-${core.core}`}>
            <span className="min-w-0">{t(core.core === 'ontology' ? 'evidenceNoSource' : 'noSource')}</span>
            <DestinationLink href={CORE_NEXT_HREF[core.core]} className={LINE_LINK} onOpenTab={onOpenTab}>
              {t(`emptyAction.${core.core}`)}
            </DestinationLink>
          </li>
        ) : null}
        {core.availability === 'app-only' ? (
          <li className="flex flex-wrap items-baseline gap-x-2 text-body text-[color:var(--color-text-tertiary)]">
            <span className="min-w-0">{t('appOnly')}</span>
            <DestinationLink href="/download/" className={LINE_LINK} onOpenTab={onOpenTab}>
              {t('getApp')}
            </DestinationLink>
          </li>
        ) : null}
        {core.availability === 'no-data' ? (
          <li className="flex flex-wrap items-baseline gap-x-2 text-body text-[color:var(--color-text-tertiary)]" data-testid={`brief-core-empty-${core.core}`}>
            <span className="min-w-0">{t(`empty.${core.core}`)}</span>
            <DestinationLink href={CORE_NEXT_HREF[core.core]} className={LINE_LINK} onOpenTab={onOpenTab}>
              {t(`emptyAction.${core.core}`)}
            </DestinationLink>
          </li>
        ) : null}
        {core.availability === 'measured' && lines.length === 0 ? (
          <li className="text-body text-[color:var(--color-text-tertiary)]">{t('quiet')}</li>
        ) : null}
        {lines.map((line) => (
          <BriefLineRow key={line.id} line={line} availability={core.availability} details={details.get(line.id) ?? EMPTY_DETAILS} nowMs={nowMs} onAskAgent={onAskAgent} onOpenTab={onOpenTab} />
        ))}
      </ul>
    </CensusTile>
  );
}

const EMPTY_DETAILS: readonly BriefLineDetail[] = [];
const DETAIL_ROWS = 5;

/**
 * The line's own link carries real width and height rather than a transparent hit area:
 * two of these sit 12px apart, and this repository measured phantom hit areas overlapping
 * at that distance and rejected them (`app/globals.css`, 2026-08-05). The negative margin
 * keeps the text on the same right edge it had before the padding.
 */
/*
 * `atlas-touch-floor` lands only under a coarse pointer, so the fine value stays `min-h-7`
 * (28px) while a finger gets the 44px floor. Measured at 390 with a real coarse pointer on
 * 2026-09-20: six links on this tab were 28px tall, the same escape the tab strip had in
 * September, and `controlClass({ shape: 'link' })` carries no height of its own.
 */
/**
 * The word a destination wears.
 *
 * ⚠️ **Two identical labels with incompatible outcomes.** The unchecked-evidence line sends a
 * browser reader to the download page, and it printed the same "open" word forty pixels under
 * another one that stays on this board — same ink, same size, same box (design-interaction, 2026-09-20). The
 * app page gets the card's own word for it, which that card already says two lines up: a repeated
 * true label costs a glance, two identical labels with different outcomes cost a navigation.
 */
function destinationLabel(href: string, t: (key: string) => string): string {
  return href === '/download/' ? t('getApp') : t('open');
}

/**
 * The destination a line opens, given what this session could measure.
 *
 * ⚠️ **"Get the app" inside the app.** The unchecked-evidence line sends a browser reader to the
 * download page, because a browser cannot read the code beside a folder at all. Once the app is
 * reading it, the same line means something else entirely — concepts that cite no implementation
 * path — and offering the app to someone already inside it is the exact defect that sent this
 * panel back once before. Measured in the installed app at 1040x720 on this repository's own
 * vault, 2026-09-20: "50 concepts whose code could not be checked · Get the app".
 */
function lineHref(lineId: string, availability: BriefCore['availability']): string | undefined {
  if (lineId === 'ontology-evidence-unchecked' && availability !== 'app-only') return '/topology/';
  return LINE_HREF[lineId];
}

const LINE_LINK = 'atlas-touch-floor shrink-0 -mx-2 min-h-7 px-2 text-[color:var(--color-indigo-text-strong)]';

/**
 * A destination link that knows when it is not leaving.
 *
 * Half of these lines open another question on this same board, and this board keeps its tab in
 * component state rather than in the router, so a plain `<Link>` changed the address and left the
 * screen on the brief: the landing's only "go fix it" action did nothing at all (walkthrough,
 * 2026-09-20). It stays a real link, so the address is right, middle-click still opens a tab and
 * assistive technology still reads a destination; the click is answered in place.
 */
function DestinationLink({
  href,
  className,
  onOpenTab,
  children,
}: {
  href: string;
  /** Placement only; the link shape is applied here so every destination passes one value layer. */
  className?: string;
  onOpenTab?: (tab: InsightsTab) => void;
  children: React.ReactNode;
}) {
  const sameBoard = onOpenTab ? parseInsightsTabHref(href) : null;
  return (
    <Link
      href={href}
      /*
       * `hoverInk: 'strong'` is the value layer's registered answer for this shape. Measured
       * 2026-09-20 with the transition settled: rest and hover were the same pixel on all six of
       * these links — same colour, no background, no underline — so the pointer got no reply at
       * all. (The same probe read the button's focus ring as absent; that one was the tool
       * sampling a frame into a 120ms box-shadow transition, and the ring is a 2px opaque indigo
       * band once settled. Measure settled, or measure nothing.)
       */
      className={controlClass({ shape: 'link', hoverInk: 'strong', className })}
      data-brief-destination={sameBoard ?? 'away'}
      onClick={
        sameBoard
          ? (event) => {
              // A modified click is the reader asking for a second window; leave it alone.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              onOpenTab?.(sameBoard);
            }
          : undefined
      }
    >
      {children}
    </Link>
  );
}

/**
 * One line of the brief. When the line's own calculation produced named rows, the line
 * expands in place to show them — concept, the exact path, and the two dates the verdict
 * rests on. A count whose only destination is another screen counting something else is
 * the falsifier this decision wrote down for itself (PO evidence seat, 2026-09-19).
 */
function BriefLineRow({ line, availability, details, nowMs, onAskAgent, onOpenTab }: { line: BriefLine; availability: BriefCore['availability']; details: readonly BriefLineDetail[]; nowMs: number; onAskAgent?: (request: string) => void; onOpenTab?: (tab: InsightsTab) => void }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const t = useTranslations('ontologyPages.insights.brief');
  const format = useFormatter();
  const locale = useLocale();
  const href = lineHref(line.id, availability);
  const sentence = t(`line.${line.id}`, { count: line.count });
  const shown = details.slice(0, DETAIL_ROWS);
  /*
   * Judging whether a recorded meaning survived the code under it is reading work, which is
   * what the coding agent beside this tab is for. The request names the same concepts, files
   * and dates the rows show, asks for a judgement and a proposal, and never for a write.
   */
  const handoff = line.id === 'ontology-evidence-moved' ? buildDriftHandoff({ rows: details, locale }) : null;
  return (
    <li className="text-body text-[color:var(--color-text-primary)]" data-brief-line={line.id} data-brief-state={line.state}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={cn('shrink-0', STATE_MARK[line.state])} />
        {shown.length > 0 ? (
          <div className="min-w-0 flex-1">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              data-testid={`brief-line-open-${line.id}`}
              onClick={() => setOpen((value) => !value)}
              className={controlClass({ shape: 'link', size: 'lg', tone: 'secondary', hoverInk: 'strong', className: 'gap-1.5 text-left' })}
            >
              <ChevronRight size={ICON_SIZE.sm} aria-hidden className={cn('mt-1 shrink-0 self-start transition-transform', open && 'rotate-90')} />
              <span className="min-w-0 break-keep">{sentence}</span>
            </button>
            <RowDisclosure open={open} id={detailId} className="pt-2">
              <ul className="flex flex-col gap-1.5 border-l border-[color:var(--color-divider)] pl-3" data-testid={`brief-line-rows-${line.id}`}>
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
              {handoff ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-3" data-testid={`brief-line-handoff-${line.id}`}>
                  {onAskAgent ? (
                    <Button variant="outline" size="sm" onClick={() => onAskAgent(handoff)} data-testid="brief-ask-agent">
                      {t('askAgent')}
                    </Button>
                  ) : null}
                  <CopyAgentTextButton label={t('copyRequest')} copiedLabel={t('copiedRequest')} text={handoff} compact />
                </div>
              ) : null}
              <HiddenCountLine
                total={details.length}
                shown={shown.length}
                label={(hidden) => t('detailHidden', { count: hidden })}
                route={href ? <DestinationLink href={href} className="text-[color:var(--color-indigo-text-strong)]" onOpenTab={onOpenTab}>{destinationLabel(href, t)}</DestinationLink> : null}
                className="mt-2 pl-3"
                data-testid={`brief-line-hidden-${line.id}`}
              />
            </RowDisclosure>
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 break-keep">{sentence}</span>
            {href ? (
              <DestinationLink href={href} className={LINE_LINK} onOpenTab={onOpenTab}>
                {destinationLabel(href, t)}
              </DestinationLink>
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
          <li key={`${row.core}-${row.at}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 text-body sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:py-2" data-since-core={row.core}>
            <span className="col-span-2 min-h-10 min-w-0 line-clamp-2 break-words text-[color:var(--color-text-primary)] sm:col-span-1 sm:min-h-0 sm:line-clamp-1" title={row.label}>
              <span className="text-[color:var(--color-text-tertiary)]">{t(`since.${row.kind}`)}</span>
              {' '}
              {row.label}
            </span>
            <time dateTime={row.at} className="font-mono tabular-nums text-label text-[color:var(--color-text-tertiary)]">
              {format.relativeTime(new Date(row.at), nowMs)}
            </time>
            {row.href ? (
              <Link href={row.href} className={controlClass({ shape: 'link', className: LINE_LINK })}>
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
