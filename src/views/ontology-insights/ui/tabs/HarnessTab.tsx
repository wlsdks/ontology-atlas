'use client';

import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FileText, ListChecks, OctagonMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MOTION, STAGGER } from '@/shared/motion';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { controlClass } from '@/shared/ui/control-class';
import { EmptyState } from '@/shared/ui/empty-state';
import { HiddenCountLine } from '@/shared/ui/hidden-count-line';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { cn } from '@/shared/lib/cn';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';

const ROWS = 8;
const EXAMPLE_AREA_PATH = 'src/payments/';
const EXAMPLE_INSTRUCTIONS_FILE = 'AGENTS.md';

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
      <section data-testid="harness-tab" className="flex flex-col gap-[var(--card-gap)]">
        <GuidancePreview />
        <EmptyState
          title={t(`availability.${detail.availability}.title`)}
          description={t(`availability.${detail.availability}.description`)}
          size="compact"
          className="border-0 bg-transparent px-0 py-0"
          action={(
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/architecture/?view=guides" className={controlClass({ shape: 'link', size: 'lg', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide text-[color:var(--color-indigo-text-strong)]' })}>
                {t('preview.openHarness')}
              </Link>
              {detail.availability === 'app-only' ? (
                <Link href="/download/" className={controlClass({ shape: 'link', size: 'lg', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide text-[color:var(--color-text-tertiary)]' })}>
                  {t('getApp')}
                </Link>
              ) : null}
            </div>
          )}
        />
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

function GuidancePreview() {
  const t = useTranslations('ontologyPages.insights.harnessTab.preview');
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const disclosureId = useId();
  const reduceMotion = useReducedMotion();
  const roles = ['instructions', 'gates', 'checks'] as const;

  return (
    <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <p className="text-label text-[color:var(--color-text-tertiary)]">{t('exampleLabel')}</p>
      <h3 className="mt-2 text-display font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t('title')}</h3>
      <p className="mt-1 max-w-[62ch] break-keep text-body text-[color:var(--color-text-secondary)]">{t('body')}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-center">
        <div className={controlClass({ shape: 'card', size: 'lg', active: true, className: 'block' })}>
          <p className="text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t('area.title')}</p>
          <code className="mt-1 block break-all font-mono text-label text-[color:var(--color-text-tertiary)]">{EXAMPLE_AREA_PATH}</code>
        </div>
        <ol className="grid grid-cols-1 gap-2 border-l border-[color:var(--color-divider)] pl-3 sm:col-span-2">
          {roles.map((role, index) => {
            const stageOpen = open && selected === index;
            return (
              <li key={role} className="relative min-w-0 before:absolute before:-left-3 before:top-1/2 before:w-3 before:border-t before:border-[color:var(--color-divider)]">
                <button
                  type="button"
                  aria-label={t(`roles.${role}.buttonLabel`)}
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
                  className={controlClass({ shape: 'row', size: 'lg', active: stageOpen, className: 'w-full items-center text-left' })}
                >
                  <motion.span
                    aria-hidden
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...MOTION.base, delay: reduceMotion ? undefined : index * STAGGER }}
                    className="flex h-8 w-8 flex-none items-center justify-center text-[color:var(--color-text-tertiary)]"
                  >
                    <RoleMark role={role} />
                  </motion.span>
                  <span className="min-w-0">
                    <span className="block text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t(`roles.${role}.title`)}</span>
                    <span className="block text-label text-[color:var(--color-text-tertiary)]">{role === 'instructions' ? EXAMPLE_INSTRUCTIONS_FILE : t(`roles.${role}.example`)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <RowDisclosure open={open} id={disclosureId} className="pt-3">
        {selected !== null ? (
          <div className="border-t border-[color:var(--color-divider)] pt-3">
            <p className="max-w-[68ch] break-keep text-body text-[color:var(--color-text-secondary)]">{t(`roles.${roles[selected]}.setup`)}</p>
            <Link href="/architecture/?view=guides" className={controlClass({ shape: 'link', size: 'lg', className: 'atlas-touch-floor atlas-touch-floor-wide mt-2 text-[color:var(--color-indigo-text-strong)]' })}>{t('openHarness')}</Link>
          </div>
        ) : null}
      </RowDisclosure>
      <p className="mt-3 text-body text-[color:var(--color-text-tertiary)]">{t('instruction')}</p>
    </div>
  );
}

function RoleMark({ role }: { role: 'instructions' | 'gates' | 'checks' }) {
  if (role === 'instructions') {
    return <FileText aria-hidden size={ICON_SIZE.md} strokeWidth={1.5} />;
  }
  if (role === 'gates') {
    return <OctagonMinus aria-hidden size={ICON_SIZE.md} strokeWidth={1.5} />;
  }
  return <ListChecks aria-hidden size={ICON_SIZE.md} strokeWidth={1.5} />;
}

/** A zero is the finding, so it is drawn as a dash that reads as "nothing here", not as a score. */
function Cell({ value }: { value: number }) {
  return (
    <td className={cn('py-2 text-right font-mono tabular-nums', value === 0 ? 'text-[color:var(--color-amber-source-a90)]' : 'text-[color:var(--color-text-secondary)]')}>
      {value === 0 ? '—' : value}
    </td>
  );
}
