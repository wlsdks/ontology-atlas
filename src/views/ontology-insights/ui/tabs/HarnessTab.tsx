'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import { cn } from '@/shared/lib/cn';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';

const ROWS = 8;

/**
 * **What the agent guidance reaches, area by area.**
 *
 * The Harness screen owns the guides, the drift door and the full matrix; this panel answers
 * the one question a reader brings to Analysis — is anything telling, gating or watching the
 * part of the repository this domain owns — and sends them there to act. An empty cell is the
 * finding (owner direction, 2026-09-13: the blanks are the product), so a zero is drawn as a
 * dash a reader can count, never as a score.
 */
export function HarnessTab({ detail }: { detail: InsightsBrief['harnessDetail'] }) {
  const t = useTranslations('ontologyPages.insights.harnessTab');
  if (detail.availability !== 'measured') {
    return (
      <section data-testid="harness-tab" className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        <p className="text-body text-[color:var(--color-text-tertiary)]">{t(detail.availability === 'no-source' ? 'noSource' : detail.availability === 'reading' ? 'reading' : detail.availability === 'unreadable' ? 'unreadable' : 'appOnly')}</p>
        <Link href={detail.availability === 'app-only' ? '/download/' : '/architecture/'} className={controlClass({ shape: 'link', className: 'mt-2 -mx-2 min-h-7 px-2 text-[color:var(--color-indigo-text-strong)]' })}>
          {t(detail.availability === 'app-only' ? 'getApp' : 'open')}
        </Link>
      </section>
    );
  }
  const untold = detail.areas.filter((area) => area.told === 0).length;
  const ungated = detail.areas.filter((area) => area.gated === 0).length;
  const unwatched = detail.areas.filter((area) => area.watched === 0).length;
  return (
    <section data-testid="harness-tab" className="flex flex-col gap-[var(--card-gap)]">
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('coverage.title', { count: detail.areas.length })}
        </h3>
        <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">
          {t('coverage.caption', { guides: detail.guideFiles, checks: detail.checks })}
        </p>
        <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">
          {t('coverage.gaps', { untold, ungated, unwatched })}
        </p>
        <table className="mt-3 w-full text-body" data-testid="harness-coverage-table">
          <thead>
            <tr className="text-label text-[color:var(--color-text-quaternary)]">
              <th scope="col" className="py-1 text-left ">{t('column.area')}</th>
              <th scope="col" className="py-1 text-right ">{t('column.told')}</th>
              <th scope="col" className="py-1 text-right ">{t('column.gated')}</th>
              <th scope="col" className="py-1 text-right ">{t('column.watched')}</th>
              <th scope="col" className="py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-divider)]">
            {detail.areas.slice(0, ROWS).map((area) => (
              <tr key={area.slug}>
                <th scope="row" className="min-w-0 py-2 text-left  text-[color:var(--color-text-primary)]">{area.title}</th>
                <Cell value={area.told} />
                <Cell value={area.gated} />
                <Cell value={area.watched} />
                <td className="py-2 text-right">
                  <Link href="/architecture/?view=coverage" className={controlClass({ shape: 'link', className: '-mx-2 min-h-7 px-2 text-[color:var(--color-indigo-text-strong)]' })}>
                    {t('open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <HiddenCountLine
          total={detail.areas.length}
          shown={Math.min(ROWS, detail.areas.length)}
          label={(hidden) => t('more', { count: hidden })}
          route={<Link href="/architecture/?view=coverage" className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>{t('open')}</Link>}
          className="mt-2"
        />
        {detail.everywhere.told + detail.everywhere.gated + detail.everywhere.watched > 0 ? (
          <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
            {t('coverage.everywhere', { told: detail.everywhere.told, gated: detail.everywhere.gated, watched: detail.everywhere.watched })}
          </p>
        ) : null}
      </div>
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        <h3 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('drift.title', { count: detail.drift.length })}
        </h3>
        <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">{t('drift.caption')}</p>
        <ul className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">
          {detail.drift.slice(0, ROWS).map((finding) => (
            <li key={`${finding.path}-${finding.message}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2 text-body">
              <span className="min-w-0">
                <code className="break-all font-mono text-label text-[color:var(--color-text-primary)]">{finding.path}</code>
                <span className="ml-2 text-label text-[color:var(--color-text-tertiary)]">{finding.message}</span>
              </span>
              <Link href="/architecture/?view=guides" className={controlClass({ shape: 'link', className: '-mx-2 min-h-7 px-2 text-[color:var(--color-indigo-text-strong)]' })}>
                {t('open')}
              </Link>
            </li>
          ))}
          {detail.drift.length === 0 ? <li className="py-2 text-body text-[color:var(--color-text-tertiary)]">{t('drift.none')}</li> : null}
        </ul>
      </div>
    </section>
  );
}

/** A zero is the finding, so it is drawn as a dash that reads as "nothing here", not as a score. */
function Cell({ value }: { value: number }) {
  return (
    <td className={cn('py-2 text-right font-mono tabular-nums', value === 0 ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-secondary)]')}>
      {value === 0 ? '—' : value}
    </td>
  );
}
