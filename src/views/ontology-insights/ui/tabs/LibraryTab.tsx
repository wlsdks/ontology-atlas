'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { MOTION, STAGGER } from '@/shared/motion';
import { controlClass } from '@/shared/ui/control-class';
import { EmptyState } from '@/shared/ui/empty-state';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
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
        <EmptyState
          title={t('preview.emptyTitle')}
          description={t('preview.emptyDescription')}
          size="compact"
          className="border-0 bg-transparent px-0 py-0"
          action={(
            <Link href="/library/" className={controlClass({ shape: 'link', size: 'lg', className: 'atlas-touch-floor atlas-touch-floor-wide text-[color:var(--color-indigo-text-strong)]' })}>
              {t('open')}
            </Link>
          )}
        />
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
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const disclosureId = useId();
  const reduceMotion = useReducedMotion();
  const stages = [
    { key: 'source' },
    { key: 'page' },
    { key: 'check' },
  ] as const;

  return (
    <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <p className="text-label text-[color:var(--color-text-tertiary)]">{t('exampleLabel')}</p>
      <h3 className="mt-2 text-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t('title')}
      </h3>
      <p className="mt-1 max-w-[62ch] break-keep text-body text-[color:var(--color-text-secondary)]">{t('body')}</p>

      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stages.map(({ key }, index) => {
          const stageOpen = open && selected === index;
          return (
            <li key={key} className="relative flex min-w-0">
              <button
                type="button"
                aria-label={t(`stages.${key}.buttonLabel`)}
                aria-expanded={stageOpen}
                aria-controls={disclosureId}
                onClick={() => {
                  if (selected === index) {
                    setOpen(!open);
                    return;
                  }
                  setSelected(index);
                  setOpen(true);
                }}
                className={controlClass({
                  shape: 'tile',
                  size: 'lg',
                  active: stageOpen,
                  className: 'w-full flex-row flex-wrap items-center py-2 text-left sm:flex-col sm:flex-nowrap sm:items-start sm:py-3',
                })}
              >
                <motion.span
                  aria-hidden
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOTION.base, delay: reduceMotion ? undefined : index * STAGGER }}
                  className={cn(
                    'relative flex h-20 w-20 flex-none items-center justify-center sm:w-full',
                    stageOpen ? 'text-[color:var(--color-indigo-text-strong)]' : 'text-[color:var(--color-text-tertiary)]',
                  )}
                >
                  <StagePreview kind={key} />
                  {index < stages.length - 1 ? (
                    <span aria-hidden className="absolute left-full top-1/2 z-10 hidden h-px w-3 bg-[color:var(--color-divider)] sm:block" />
                  ) : null}
                </motion.span>
                <span className="min-w-0 flex-1 basis-32 sm:basis-auto">
                  <span className="block text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] sm:mt-1">
                    {t(`stages.${key}.title`)}
                  </span>
                  <span className="block text-label text-[color:var(--color-text-tertiary)]">{t(`stages.${key}.example`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <RowDisclosure open={open} id={disclosureId} className="pt-3">
        {selected !== null ? (
          <div className="border-t border-[color:var(--color-divider)] pt-3">
            <p className="max-w-[68ch] break-keep text-body text-[color:var(--color-text-secondary)]">
              {t(`stages.${stages[selected].key}.setup`)}
            </p>
            <Link href="/library/" className={controlClass({ shape: 'link', size: 'lg', className: 'atlas-touch-floor atlas-touch-floor-wide mt-2 text-[color:var(--color-indigo-text-strong)]' })}>
              {t('openLibrary')}
            </Link>
          </div>
        ) : null}
      </RowDisclosure>
      <p className="mt-3 text-body text-[color:var(--color-text-tertiary)]">{t('instruction')}</p>
    </div>
  );
}

function StagePreview({ kind }: { kind: 'source' | 'page' | 'check' }) {
  const t = useTranslations('ontologyPages.insights.libraryTab.preview');
  if (kind === 'source') {
    return (
      <span className="flex h-16 w-16 flex-col justify-center gap-1.5 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3">
        <span className="h-px w-full bg-[color:var(--color-text-quaternary)]" />
        <span className="h-px w-4/5 bg-[color:var(--color-text-quaternary)]" />
        <span className="h-px w-3/5 bg-[color:var(--color-text-quaternary)]" />
      </span>
    );
  }
  if (kind === 'page') {
    return (
      <span className="flex h-16 w-full max-w-40 flex-col rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-2 py-1.5 text-left">
        <span className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">{t('stages.page.visualTitle')}</span>
        <span className="mt-1 h-px w-full bg-[color:var(--color-divider)]" />
        <span className="mt-1 text-label text-[color:var(--color-text-tertiary)]">{t('stages.page.citation')}</span>
      </span>
    );
  }
  return (
    <span className="flex w-full max-w-36 flex-col gap-1 text-left text-label text-[color:var(--color-text-tertiary)]">
      {(['citation', 'links', 'sourceChanges'] as const).map((item) => (
        <span key={item} className="flex items-center gap-1.5">
          <span className="h-px w-3 flex-none bg-[color:var(--color-text-quaternary)]" />
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
