'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { buttonVariants } from '@/shared/ui';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import { RelationshipPreview } from '@/widgets/relationship-preview';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';

const ROWS = 6;

/**
 * **The library, answered where the reader is standing.**
 *
 * The Library screen owns writing pages and running checks; this panel owns none of that. It
 * re-reads the same model (`useLibraryModel`, the rounds ledger) to answer the questions a
 * person arrives at Analysis with — which pages stand on a source that moved, which sources
 * nobody wrote up, what the last check found, what the unattended rounds did — and every row
 * opens the Library to act. Nothing here writes, and no list is a second copy of a store.
 */
/*
 * `nowMs` is passed in rather than read from the clock here. `useFormatter().relativeTime`
 * without an explicit reference point falls back to the environment's own `Date.now()`, which
 * next-intl reports as an ENVIRONMENT_FALLBACK error and which makes the server and client
 * markup disagree. The brief already captures one instant for the whole screen; every relative
 * time on it is measured from that same instant.
 */
export function LibraryTab({ detail, nowMs }: { detail: InsightsBrief['library']; nowMs: number }) {
  const t = useTranslations('ontologyPages.insights.libraryTab');
  const format = useFormatter();
  if (detail.availability !== 'measured') {
    return (
      <section data-testid="library-tab" className="flex flex-col gap-[var(--card-gap)]">
        <WikiAnalysisPreview />
      </section>
    );
  }
  const blocking = detail.findings.filter((finding) => !finding.advisory);
  const advisory = detail.findings.filter((finding) => finding.advisory);
  const blockingTotal = blocking.reduce((sum, finding) => sum + finding.count, 0);
  const advisoryTotal = advisory.reduce((sum, finding) => sum + finding.count, 0);
  const shownFindings = [...blocking, ...advisory].slice(0, ROWS);
  const shownBlocking = shownFindings.filter((finding) => !finding.advisory);
  const shownAdvisory = shownFindings.filter((finding) => finding.advisory);
  const findingRow = (finding: Detail['findings'][number]) => (
    <Row
      key={finding.code}
      name={t(`code.${finding.code}` as never, { defaultValue: finding.code } as never)}
      detail={finding.pages.slice(0, 2).map((page) => page.replace(/^wiki\//, '')).join(', ')}
      count={t('findingCount', { count: finding.count })}
      tone={finding.advisory ? 'advisory' : 'blocking'}
    />
  );

  /*
   * Ordered by what a reader has to act on first. A card with nothing in it used to get the same
   * panel as the one with findings, so four equal boxes had no winner and two of them held one
   * quiet sentence each; now the empty ones fold into one strip beneath the cards that carry rows.
   */
  const cards: LibraryCard[] = [
    {
      key: 'check',
      size: detail.findings.length,
      title: t('check.title', { count: blockingTotal + advisoryTotal }),
      none: t('check.none'),
      caption: t('check.caption', { pages: detail.pageCount, unmeasured: detail.unmeasured }),
      href: '/library/?tab=wiki',
      /*
       * Findings to fix and advisory findings are two groups, each under its own heading. From
       * 1280 they stand side by side, so the card's width holds two short lists instead of one
       * list whose rows stop a third of the way across.
       */
      body: shownBlocking.length > 0 && shownAdvisory.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 xl:grid-cols-2">
          <FindingGroup marker="blocking" label={t('check.blocking', { count: blockingTotal })}>{shownBlocking.map(findingRow)}</FindingGroup>
          <FindingGroup marker="advisory" label={t('check.advisory', { count: advisoryTotal })}>{shownAdvisory.map(findingRow)}</FindingGroup>
        </div>
      ) : shownAdvisory.length > 0 ? (
        <FindingGroup marker="advisory" label={t('check.advisory', { count: advisoryTotal })}>{shownAdvisory.map(findingRow)}</FindingGroup>
      ) : (
        <RowList>{shownBlocking.map(findingRow)}</RowList>
      ),
    },
    {
      key: 'stale',
      size: detail.stalePages.length,
      title: t('stale.title', { count: detail.stalePages.length }),
      none: t('stale.none'),
      caption: t('stale.caption'),
      href: '/library/?tab=wiki',
      body: <RowList>{detail.stalePages.slice(0, ROWS).map((row) => (
        <Row key={row.slug} name={row.slug.replace(/^wiki\//, '')} detail={row.sources.join(', ')} />
      ))}</RowList>,
    },
    {
      key: 'unwritten',
      size: detail.unwrittenSources.length,
      title: t('unwritten.title', { count: detail.unwrittenSources.length }),
      none: t('unwritten.none'),
      caption: t('unwritten.caption'),
      href: '/library/?tab=sources',
      body: <RowList>{detail.unwrittenSources.slice(0, ROWS).map((path) => <Row key={path} name={path.replace(/^sources\//, '')} detail="" />)}</RowList>,
    },
    {
      key: 'rounds',
      size: detail.passes.length,
      title: t('rounds.title', { count: detail.passes.length }),
      none: t('rounds.none'),
      caption: t('rounds.caption'),
      href: '/library/?tab=rounds',
      // The ledger lists every pass it kept; nothing is cut, so there is no remainder line.
      shownOverride: detail.passes.length,
      body: <RowList>{detail.passes.map((pass) => (
        <Row
          key={`${pass.endedAt}-${pass.outcome}`}
          name={t(`outcome.${pass.outcome}` as never, { defaultValue: pass.outcome } as never)}
          detail={`${format.relativeTime(new Date(pass.endedAt), nowMs)} · ${pass.summary}`}
        />
      ))}</RowList>,
    },
  ];
  const filled = cards.filter((card) => card.size > 0);
  const clear = cards.filter((card) => card.size === 0);
  const beside = filled.length > 0 && clear.length > 0;
  // The end line only claims "this is everything" when no card cut rows behind a "N more" line.
  const complete = cards.every((card) => (card.shownOverride ?? Math.min(ROWS, card.size)) >= card.size);
  /*
   * From 1280 the quiet statuses stand beside the cards instead of under them: the lead card keeps
   * a bounded row length (a count used to sit ~1450px from its name) and the tab reads as one
   * block, what to act on and what is clear, with both columns starting on the same line. The
   * clear panel keeps its own height (it used to stretch to the lead card and hold 60% empty
   * surface), and the tab ends on a line saying so: a small folder leaves canvas below, and the
   * page states that this is everything rather than leaving the reader to wonder what failed to
   * load.
   */
  return (
    <section
      data-testid="library-tab"
      data-library-layout={beside ? 'beside' : 'stacked'}
      className={cn('grid grid-cols-1 items-start gap-[var(--card-gap)]', beside && 'xl:grid-cols-[minmax(0,1fr)_20rem]')}
    >
      {filled.length > 0 ? (
        <div className="grid grid-cols-1 content-start gap-[var(--card-gap)] lg:grid-cols-2">
          {filled.map((card, index) => (
            <Card
              key={card.key}
              card={card}
              lead={index === 0}
              // An odd count lets the lead card take the whole row, so no card sits beside a hole.
              wide={index === 0 && filled.length % 2 === 1}
              footer={<CardFooter card={card} label={t('view')} more={(hidden) => t('more', { count: hidden })} />}
            />
          ))}
        </div>
      ) : null}
      {clear.length > 0 ? (
        <div data-library-clear className="self-start rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
          <ul className={cn('flex flex-wrap gap-x-6 gap-y-2', beside && 'xl:flex-col xl:gap-3')}>
            {clear.map((card) => (
              <li key={card.key} data-library-clear-item={card.key} className="flex items-baseline gap-2 text-body tabular-nums text-[color:var(--color-text-secondary)]">
                <span aria-hidden className="h-1.5 w-1.5 flex-none translate-y-[-0.15em] rounded-full bg-[color:var(--color-text-quaternary)]" />
                <span className="min-w-0">{card.none}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {complete ? <p data-library-end className="col-span-full flex items-center gap-3 pt-2 text-label text-[color:var(--color-text-tertiary)]">
        <span aria-hidden className="h-px w-6 flex-none bg-[color:var(--color-border-strong)]" />
        <span className="min-w-0">{t('end')}</span>
      </p> : null}
    </section>
  );
}

type Detail = InsightsBrief['library'] & { availability: 'measured' };

interface LibraryCard {
  key: 'check' | 'stale' | 'unwritten' | 'rounds';
  size: number;
  title: string;
  none: string;
  caption: string;
  href: string;
  body: React.ReactNode;
  shownOverride?: number;
}

function WikiAnalysisPreview() {
  const t = useTranslations('ontologyPages.insights.libraryTab.preview');
  const stages = ['source', 'page', 'check'] as const;
  return <RelationshipPreview title={t('title')} description={t('body')} exampleLabel={t('exampleLabel')} pauseLabel={t('pauseAnimation')} resumeLabel={t('resumeAnimation')} emphasizedItemId="page"
    items={stages.map(id => ({ id, title:t(`stages.${id}.title`),caption:t(`stages.${id}.example`),label:t(`stages.${id}.buttonLabel`),explanation:t(`stages.${id}.setup`),visual:<StagePreview kind={id} />,
      description:id==='source'?`${t('exampleLabel')} ${t('sourceExcerpt')}`:id==='page'?`${t('pageEyebrow')}: ${t('pageExampleTitle')}. ${t('pageExampleBody')} ${t('stages.page.citation')}`:t('stages.check.example'),
    }))}
    footer={<><div className="min-w-0 max-w-prose"><p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('emptyTitle')}</p><p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('emptyDescription')}</p></div>
      <Link href="/library/" data-testid="preview-primary-action" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'atlas-touch-floor shrink-0')}>{t('openLibrary')}</Link></>} />;
}

function StagePreview({ kind }: { kind: 'source' | 'page' | 'check' }) {
  const t = useTranslations('ontologyPages.insights.libraryTab.preview');
  if (kind === 'source') {
    return (
      <span data-relationship-port className="relative flex min-h-24 w-full max-w-48 flex-col gap-3 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-4 text-left shadow-[var(--shadow-elevation-1)] max-sm:max-w-none">
        <span className="text-label text-[color:var(--color-text-tertiary)]">{t('stages.source.example')}</span>
        <span className="text-body leading-prose text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">{t('sourceExcerpt')}</span>
      </span>
    );
  }
  if (kind === 'page') {
    return (
      <span data-relationship-port className="flex min-w-0 w-full max-w-80 flex-col rounded-panel border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-elevated)] p-4 text-left shadow-[var(--shadow-elevation-2)] sm:p-5">
        <span className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">{t('pageEyebrow')}</span>
        <span className="mt-3 break-words text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] sm:text-display">{t('pageExampleTitle')}</span>
        <span className="mt-3 text-body-lg text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">{t('pageExampleBody')}</span>
        <span className="mt-5 h-px w-full bg-[color:var(--color-divider)]" />
        <span className="mt-3 border-l-2 border-[color:var(--color-indigo-line-a32)] pl-3 text-body text-[color:var(--color-indigo-text-soft)]">{t('stages.page.citation')}</span>
      </span>
    );
  }
  return (
    <span className="relative flex w-full max-w-40 flex-col gap-3 pl-5 text-left text-body text-[color:var(--color-text-secondary)]">
      <span data-relationship-port className="absolute inset-y-0 left-0 w-2 border-y border-l border-[color:var(--color-border-strong)]" />
      {(['citation', 'links', 'sourceChanges'] as const).map((item) => (
        <span key={item} className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-none rounded-full border border-[color:var(--color-indigo-text-soft)]" />
          <span>{t(`stages.check.${item}`)}</span>
        </span>
      ))}
    </span>
  );
}

function Card({ card, lead, wide, footer }: { card: LibraryCard; lead: boolean; wide: boolean; footer: React.ReactNode }) {
  return (
    <div
      data-library-card={card.key}
      data-lead={lead ? 'true' : undefined}
      className={cn(
        'flex flex-col rounded-panel border bg-[color:var(--color-panel)] p-[var(--card-pad)]',
        lead ? 'border-[color:var(--color-border-strong)]' : 'border-[color:var(--color-border-soft)]',
        wide && 'lg:col-span-2',
      )}
    >
      <h3 className="text-body-lg font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-primary)]">{card.title}</h3>
      <p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">{card.caption}</p>
      <div className="mt-3">{card.body}</div>
      <div className="mt-auto pt-3">{footer}</div>
    </div>
  );
}

/** One way out per card, and it names the Library tab the rows live on. */
function CardFooter({ card, label, more }: { card: LibraryCard; label: string; more: (hidden: number) => string }) {
  const link = (
    <Link href={card.href} className={controlClass({ shape: 'link', size: 'md', className: 'text-[color:var(--color-indigo-text-strong)]' })}>
      {label}
    </Link>
  );
  const shown = card.shownOverride ?? Math.min(ROWS, card.size);
  return card.size > shown
    ? <HiddenCountLine total={card.size} shown={shown} label={more} route={link} />
    : link;
}

/*
 * A group's heading is its own element above its own list; as a list item it took the list's
 * dividers and read as an empty row.
 */
function FindingGroup({ marker, label, children }: { marker: 'blocking' | 'advisory'; label: string; children: React.ReactNode }) {
  return (
    <div data-library-finding-group={marker} className="min-w-0">
      <h4 data-library-advisory-label={marker === 'advisory' ? '' : undefined} className="text-label font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-tertiary)]">{label}</h4>
      <RowList className="mt-1">{children}</RowList>
    </div>
  );
}

function RowList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn('flex flex-col divide-y divide-[color:var(--color-divider)]', className)}>{children}</ul>;
}

/** The count sits beside the name it counts, so a wide card never sends the eye across the row. */
function Row({ name, detail, count, tone }: { name: string; detail: string; count?: string; tone?: 'blocking' | 'advisory' }) {
  return (
    <li data-library-row={tone} className="min-w-0 py-2.5">
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={cn('min-w-0 break-words text-body', tone === 'advisory' ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-primary)]')}>{name}</span>
        {count ? (
          <span
            className={badgeClass({
              shape: 'tag',
              className: cn('inline-flex min-h-6 items-center border font-mono tabular-nums', tone === 'blocking'
                ? 'border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-status-warning)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]'),
            })}
          >
            {count}
          </span>
        ) : null}
      </span>
      {detail ? <span className="mt-0.5 block break-all text-label text-[color:var(--color-text-tertiary)]">{detail}</span> : null}
    </li>
  );
}
