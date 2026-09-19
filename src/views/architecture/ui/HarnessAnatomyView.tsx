'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import type { HarnessReport } from '@/entities/agent-files';
import { InfoHint } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

import {
  buildHarnessAnatomy,
  type AnatomyBand,
  type AnatomySlot,
} from '../model/harness-anatomy';

/**
 * **What this repository hands an agent, in the order the agent meets it.**
 *
 * The three bands are the coverage matrix's three columns — *told · gated · watched* — and that
 * repetition is the point: one destination, one vocabulary, two cuts through it. The matrix asks
 * the three questions of each **area** of the product; this view asks them of each **part** of the
 * harness. A reader who learns the words on either screen keeps them on the other.
 *
 * A fourth band sits under those three and holds one row that is not a count: the agent loop and
 * the model. Every public account of a harness puts them at its centre, and no file in a checkout
 * knows them — they belong to the tool a person launched. Printing that row as "0" would be a lie
 * with a number on it, so it carries words instead, and the band's own heading says why.
 *
 * ⚠️ **No score, no grade, no percentage.** The competing tools in this space all rank a repository
 * out of ten, and this repository measured why that fails: a maturity scanner put Anthropic's own
 * skills repository at the same grade as an abandoned toy, because files alone cannot tell *absent*
 * from *rightly absent* (2026-09-13). What this screen prints instead is what is there, what is
 * not, and what a checkout cannot answer.
 */

const BAND_ORDER: readonly AnatomyBand[] = ['tells', 'gates', 'watches'];

const BAND_HEAD: Readonly<Record<AnatomyBand, string>> = Object.freeze({
  tells: 'coverageColumnTold',
  gates: 'coverageColumnGated',
  watches: 'coverageColumnWatched',
  tool: 'anatomyToolBand',
});

const BAND_CAPTION: Readonly<Record<AnatomyBand, string>> = Object.freeze({
  tells: 'anatomyTellsCaption',
  gates: 'anatomyGatesCaption',
  watches: 'anatomyWatchesCaption',
  tool: 'anatomyToolCaption',
});

type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

function SlotRow({
  slot,
  t,
  extra,
}: {
  slot: AnatomySlot;
  t: TranslateFn;
  /** One line a specific slot earns — the permission split, and nothing else so far. */
  extra?: string | null;
}) {
  const absent = slot.status === 'absent';
  return (
    <li
      data-testid={`harness-anatomy-slot-${slot.id}`}
      data-status={slot.status}
      className="border-t border-[color:var(--color-divider)] py-3 first:border-t-0 first:pt-0"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={cn(
            'min-w-0 break-keep text-body font-[var(--font-weight-emphasis)]',
            absent
              ? 'text-[color:var(--color-text-tertiary)]'
              : 'text-[color:var(--color-text-primary)]',
          )}
        >
          {t(`anatomySlots.${slot.id}.title`)}
        </h3>
        {/*
          The count is the only number on the row and it is never bare: its unit is beside it, in
          the noun the repository would use — documents, servers, scripts, hooks. "4" over a title
          reads as a rank in a product category full of ranks.
        */}
        <span
          data-testid={`harness-anatomy-count-${slot.id}`}
          className={cn(
            'shrink-0 text-caption tabular-nums',
            absent
              ? 'text-[color:var(--color-text-quaternary)]'
              : 'text-[color:var(--color-text-secondary)]',
          )}
        >
          {slot.status === 'absent'
            ? t('anatomyAbsent')
            : t(`anatomyUnits.${slot.id}`, { count: slot.count })}
        </span>
      </div>
      <p className="mt-1 max-w-prose break-keep text-caption text-[color:var(--color-text-tertiary)]">
        {t(`anatomySlots.${slot.id}.body`)}
      </p>
      {extra ? (
        <p className="mt-1 text-caption tabular-nums text-[color:var(--color-text-tertiary)]">
          {extra}
        </p>
      ) : null}
      {slot.items.length > 0 ? (
        /* The names are the citation: a reader who doubts the count opens one of them. Monospace,
           because every one of them is a path or a server key that can be typed. */
        <p className="mt-1.5 break-all font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {slot.items.join(' · ')}
          {slot.overflow > 0 ? ` · ${t('anatomyMore', { count: slot.overflow })}` : ''}
        </p>
      ) : null}
    </li>
  );
}

export function HarnessAnatomyView({ report }: { report: HarnessReport }) {
  const t = useTranslations('harness');
  const anatomy = useMemo(() => buildHarnessAnatomy(report), [report]);
  const toolSlot = anatomy.slots.find((slot) => slot.band === 'tool');

  return (
    <section data-testid="harness-anatomy" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <h2 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t('anatomyTitle')}
          </h2>
          <InfoHint align="left" label={t('anatomyProvenanceLabel')}>
            {t('anatomyProvenance')}
          </InfoHint>
        </div>
        <p className="max-w-prose break-keep text-caption text-[color:var(--color-text-tertiary)]">
          {t('anatomyCaption')}
        </p>
      </div>

      {/*
        Three equal columns, one per question. Equal height by the grid rather than by content, the
        rule this repository's `forbidden.md` states for cards in a row: the band with four parts
        and the band with two must not read as different weights of claim.
      */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {BAND_ORDER.map((band) => {
          const slots = anatomy.slots.filter((slot) => slot.band === band);
          return (
            <section
              key={band}
              data-testid={`harness-anatomy-band-${band}`}
              className="flex flex-col rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)]"
            >
              <h2 className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {t(BAND_HEAD[band])}
              </h2>
              <p className="mt-1 break-keep text-caption text-[color:var(--color-text-tertiary)]">
                {t(BAND_CAPTION[band])}
              </p>
              <ul className="mt-3 flex flex-col">
                {slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    t={t}
                    extra={
                      slot.id === 'permissions' && anatomy.permissions
                        ? t('anatomyPermissionSplit', {
                            allow: anatomy.permissions.allow,
                            ask: anatomy.permissions.ask,
                            deny: anatomy.permissions.deny,
                          })
                        : null
                    }
                  />
                ))}
                {band === 'gates' && anatomy.approvalGates.length > 0 ? (
                  /* The strongest gate on the screen is one no file records: Codex refuses a hook
                     it has not been trusted with, and that trust is session state. The band says so
                     once rather than every hook row carrying a caveat. */
                  <li
                    data-testid="harness-anatomy-approval"
                    className="mt-1 border-t border-[color:var(--color-divider)] pt-3 text-caption text-[color:var(--color-text-quaternary)]"
                  >
                    {t('anatomyApprovalGate', { config: anatomy.approvalGates.join(' · ') })}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>

      {toolSlot ? (
        /*
          Outside the grid and quieter than it, because this row is the screen's honesty rather than
          its content: the part of the harness the repository does not own. Dashed, so it is legible
          as an area deliberately left blank rather than as a card that failed to load.
        */
        <section
          data-testid="harness-anatomy-band-tool"
          className="rounded-card border border-dashed border-[color:var(--color-border-soft)] p-[var(--card-pad)]"
        >
          <h2 className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
            {t(BAND_HEAD.tool)}
          </h2>
          <p className="mt-1 max-w-prose break-keep text-caption text-[color:var(--color-text-tertiary)]">
            {t(BAND_CAPTION.tool)}
          </p>
          <div className="mt-3" data-testid="harness-anatomy-slot-loop" data-status={toolSlot.status}>
            <h3 className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
              {t('anatomySlots.loop.title')}
            </h3>
            <p className="mt-1 max-w-prose break-keep text-caption text-[color:var(--color-text-tertiary)]">
              {t('anatomySlots.loop.body')}
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
