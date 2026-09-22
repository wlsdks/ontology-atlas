'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';
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
  return (
    <section data-testid="library-tab" className="flex flex-col gap-[var(--card-gap)]">
      <div className="grid grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
        <Card title={t('stale.title', { count: detail.stalePages.length })} caption={t('stale.caption')}>
          {detail.stalePages.slice(0, ROWS).map((row) => (
            <Row key={row.slug} name={row.slug.replace(/^wiki\//, '')} detail={row.sources.join(', ')} href="/library/" openLabel={t('open')} />
          ))}
          {detail.stalePages.length === 0 ? <Quiet text={t('stale.none')} /> : null}
          <HiddenCountLine total={detail.stalePages.length} shown={Math.min(ROWS, detail.stalePages.length)} label={(hidden) => t('more', { count: hidden })} route={<Link href="/library/" className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('open')}</Link>} className="mt-2" />
        </Card>
        <Card title={t('unwritten.title', { count: detail.unwrittenSources.length })} caption={t('unwritten.caption')}>
          {detail.unwrittenSources.slice(0, ROWS).map((path) => (
            <Row key={path} name={path.replace(/^sources\//, '')} detail="" href="/library/" openLabel={t('open')} />
          ))}
          {detail.unwrittenSources.length === 0 ? <Quiet text={t('unwritten.none')} /> : null}
          <HiddenCountLine total={detail.unwrittenSources.length} shown={Math.min(ROWS, detail.unwrittenSources.length)} label={(hidden) => t('more', { count: hidden })} route={<Link href="/library/" className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('open')}</Link>} className="mt-2" />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
      <Card title={t('check.title', { count: blocking.reduce((sum, finding) => sum + finding.count, 0) })} caption={t('check.caption', { pages: detail.pageCount, unmeasured: detail.unmeasured })}>
        {[...blocking, ...advisory].slice(0, ROWS).map((finding) => (
          <Row
            key={finding.code}
            name={t(`code.${finding.code}` as never, { defaultValue: finding.code } as never)}
            detail={`${finding.count} · ${finding.pages.slice(0, 2).map((page) => page.replace(/^wiki\//, '')).join(', ')}`}
            href="/library/"
            openLabel={t('open')}
          />
        ))}
        {detail.findings.length === 0 ? <Quiet text={t('check.none')} /> : null}
        {/* The three cards beside this one all say what their cut left out; this one did not, so a
            folder with more than six kinds of finding reported six and named no remainder. */}
        <HiddenCountLine total={detail.findings.length} shown={Math.min(ROWS, detail.findings.length)} label={(hidden) => t('more', { count: hidden })} route={<Link href="/library/" className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('open')}</Link>} className="mt-2" />
      </Card>
      <Card title={t('rounds.title', { count: detail.passes.length })} caption={t('rounds.caption')}>
        {detail.passes.map((pass) => (
          <Row
            key={`${pass.endedAt}-${pass.outcome}`}
            name={t(`outcome.${pass.outcome}` as never, { defaultValue: pass.outcome } as never)}
            detail={`${format.relativeTime(new Date(pass.endedAt), nowMs)} · ${pass.summary}`}
            href="/library/?tab=rounds"
            openLabel={t('open')}
          />
        ))}
        {detail.passes.length === 0 ? <Quiet text={t('rounds.none')} /> : null}
      </Card>
      </div>
    </section>
  );
}

function WikiAnalysisPreview() {
  const t = useTranslations('ontologyPages.insights.libraryTab.preview');
  const stages = ['source', 'page', 'check'] as const;
  return <RelationshipPreview title={t('title')} description={t('body')} exampleLabel={t('exampleLabel')} pauseLabel={t('pauseAnimation')} resumeLabel={t('resumeAnimation')} emphasizedItemId="page"
    items={stages.map(id => ({ id, title:t(`stages.${id}.title`),caption:t(`stages.${id}.example`),label:t(`stages.${id}.buttonLabel`),explanation:t(`stages.${id}.setup`),visual:<StagePreview kind={id} />,
      description:id==='source'?`${t('exampleLabel')} ${t('sourceExcerpt')}`:id==='page'?`${t('pageEyebrow')}: ${t('pageExampleTitle')}. ${t('pageExampleBody')} ${t('stages.page.citation')}`:t('stages.check.example'),
    }))}
    footer={<><div className="min-w-0 max-w-prose"><p className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('emptyTitle')}</p><p className="mt-1 break-keep text-body text-[color:var(--color-text-tertiary)]">{t('emptyDescription')}</p></div>
      <Link href="/library/" data-testid="preview-primary-action" className={controlClass({shape:'pill',size:'lg',tone:'accent',className:'atlas-touch-floor atlas-touch-floor-wide shrink-0'})}>{t('openLibrary')}</Link></>} />;
}

function StagePreview({ kind }: { kind: 'source' | 'page' | 'check' }) {
  const t = useTranslations('ontologyPages.insights.libraryTab.preview');
  if (kind === 'source') {
    return (
      <span data-relationship-port className="relative flex min-h-24 w-full max-w-48 flex-col gap-3 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-4 text-left shadow-[var(--shadow-elevation-1)] max-sm:max-w-none">
        <span className="text-label text-[color:var(--color-text-tertiary)]">{t('stages.source.example')}</span>
        <span className="text-body leading-prose text-[color:var(--color-text-secondary)]">{t('sourceExcerpt')}</span>
      </span>
    );
  }
  if (kind === 'page') {
    return (
      <span data-relationship-port className="flex min-w-0 w-full max-w-80 flex-col rounded-panel border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-elevated)] p-4 text-left shadow-[var(--shadow-elevation-2)] sm:p-5">
        <span className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">{t('pageEyebrow')}</span>
        <span className="mt-3 break-words text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] sm:text-display">{t('pageExampleTitle')}</span>
        <span className="mt-3 break-words text-body-lg text-[color:var(--color-text-secondary)]">{t('pageExampleBody')}</span>
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

function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">{title}</h3>
      <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">{caption}</p>
      <ul className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">{children}</ul>
    </div>
  );
}

function Row({ name, detail, href, openLabel }: { name: string; detail: string; href: string; openLabel: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-body">
      <span className="min-w-0">
        <span className="text-[color:var(--color-text-primary)]">{name}</span>
        {detail ? <span className="ml-2 break-all text-label text-[color:var(--color-text-tertiary)]">{detail}</span> : null}
      </span>
      <Link href={href} className={controlClass({ shape: 'link', className: '-mx-2 min-h-7 px-2 text-[color:var(--color-indigo-text-strong)]' })}>
        {openLabel}
      </Link>
    </li>
  );
}

function Quiet({ text }: { text: string }) {
  return <li className="py-2 text-body text-[color:var(--color-text-tertiary)]">{text}</li>;
}
