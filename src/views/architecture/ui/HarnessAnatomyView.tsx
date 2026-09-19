'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { HarnessReport } from '@/entities/agent-files';
import { CompactCopyButton, InfoHint } from '@/shared/ui';
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

/**
 * The amber pair this screen's one warning wears, taken from the guides view's `WARNING_BADGE` so
 * the two sibling views mark an unresolved state the same way.
 */
const WARNING_TONE =
  'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]';

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
  copied,
  onCopy,
  extraHint,
  bodyHint,
}: {
  slot: AnatomySlot;
  t: TranslateFn;
  /** One line a specific slot earns — the permission split and the always-read weight. */
  extra?: string | null;
  /** The hint that line needs when the number is one a reader will want to argue with. */
  extraHint?: string | null;
  /** Detail a row's one sentence should not carry, behind this destination's usual hint. */
  bodyHint?: string | null;
  copied: boolean;
  onCopy: (slot: AnatomySlot) => void;
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
      <div className="mt-1 flex max-w-prose flex-wrap items-baseline gap-x-1">
        <p className="min-w-0 break-keep text-caption text-[color:var(--color-text-tertiary)]">
          {t(`anatomySlots.${slot.id}.body`)}
        </p>
        {/*
          ⚠️ **A row's body is one sentence, and a row that needed five product names was four
          lines long** while every other row was one or two (measured 1512×949, 2026-09-20). The
          list is a real fact and it is not the row's claim, so it moves behind the same hint the
          rest of this destination uses for "here is the working behind that". The sentence keeps
          the limit that matters — the repository writes the file, the tool decides.
        */}
        {bodyHint ? (
          <InfoHint align="left" label={t(`anatomySlots.${slot.id}.hintLabel`)}>
            {bodyHint}
          </InfoHint>
        ) : null}
      </div>
      {extra ? (
        /* ⚠️ A `div`, not a `p`. `InfoHint` renders its panel as a `div`, and a `div` inside a `p`
           is invalid HTML that React reports as a hydration error — which is exactly what the
           dev overlay's issue counter was showing after this line was added (2026-09-20). */
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-caption tabular-nums text-[color:var(--color-text-tertiary)]">
          <span>{extra}</span>
          {extraHint ? (
            <InfoHint align="left" label={t('anatomyAlwaysWeightLabel')}>
              {extraHint}
            </InfoHint>
          ) : null}
        </div>
      ) : null}
      {slot.items.length > 0 ? (
        /* The names are the citation: a reader who doubts the count opens one of them. Monospace,
           because every one of them is a path or a server key that can be typed. */
        <p className="mt-1.5 break-all font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {slot.items.join(' · ')}
          {slot.overflow > 0 ? ` · ${t('anatomyMore', { count: slot.overflow })}` : ''}
        </p>
      ) : null}
      {absent && slot.fillPath ? (
        /*
          ⚠️ **An address, not advice.** The owner's goal for this tab is that an empty place is
          visible *and addable*; until this line an absent row said "none yet" and stopped. What it
          adds is the conventional path a part like this lives at, from the tool's own docs — never
          "you should have one", because plenty of repositories rightly have no sub-agents and no
          MCP servers, and a screen that turns every blank into a to-do is the maturity score this
          view refuses in another costume.

          Copy rather than a write: Atlas puts nothing into a source repository, and the person
          pasting the path into their editor is the step where they decide.
        */
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-caption text-[color:var(--color-text-quaternary)]">
            {t('anatomyFillHere')}
          </span>
          <code className="min-w-0 break-all font-mono text-caption text-[color:var(--color-text-tertiary)]">
            {slot.fillPath}
          </code>
          <CompactCopyButton
            data-testid={`harness-anatomy-copy-${slot.id}`}
            copied={copied}
            label={copied ? t('anatomyFillCopied') : t('anatomyFillCopy')}
            ariaLabel={t('anatomyFillCopyAria', { path: slot.fillPath })}
            onClick={() => onCopy(slot)}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * KB with one decimal, the same shape the guides table prints sizes in. One formatter, because two
 * screens rounding the same bytes differently is a defect a reader cannot resolve.
 */
function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function HarnessAnatomyView({ report }: { report: HarnessReport }) {
  const t = useTranslations('harness');
  const anatomy = useMemo(() => buildHarnessAnatomy(report), [report]);
  const toolSlot = anatomy.slots.find((slot) => slot.band === 'tool');
  /* One id, not a set: a second copy replaces the first acknowledgement rather than leaving a
     column of green checks behind, which is what the other copy affordances in this product do. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = useCallback((slot: AnatomySlot) => {
    if (!slot.fillPath) return;
    void navigator.clipboard?.writeText(slot.fillPath).then(
      () => setCopiedId(slot.id),
      /* A refused clipboard is not an error worth a dialog; the path is on screen to be typed. */
      () => undefined,
    );
  }, []);

  return (
    <section
      data-testid="harness-anatomy"
      aria-label={t('anatomyTitle')}
      className="flex flex-col gap-4"
    >
      {/*
        ⚠️ **One line, not a second masthead.** The shell above already prints the destination's
        name, its explainer and the census sentence with its breakdown caption; a titled section
        under that made a sixth stacked text block, and the tab that opens it is called Structure —
        so "Harness structure" as a heading said the word twice and pushed the first card 78px
        down (measured 1512×949, 2026-09-20). The name survives as the region's accessible label,
        where it names the landmark without spending a row.
      */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className="min-w-0 max-w-prose break-keep text-caption text-[color:var(--color-text-tertiary)]">
          {t('anatomyCaption')}
        </p>
        <InfoHint align="left" label={t('anatomyProvenanceLabel')}>
          {t('anatomyProvenance')}
        </InfoHint>
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
                    copied={copiedId === slot.id}
                    onCopy={copy}
                    extraHint={slot.id === 'always' ? t('anatomyAlwaysWeightHint') : null}
                    bodyHint={slot.id === 'blind' ? t('anatomySlots.blind.hint') : null}
                    extra={
                      slot.id === 'permissions' && anatomy.permissions
                        ? t('anatomyPermissionSplit', {
                            allow: anatomy.permissions.allow,
                            ask: anatomy.permissions.ask,
                            deny: anatomy.permissions.deny,
                          })
                        : slot.id === 'always' && anatomy.alwaysBytes > 0
                          ? /*
                              The turn's standing cost, beside the count that cannot carry it:
                              three documents of 2 KB and three of 40 KB are the same "3", and the
                              difference is what harness engineering is about.
                            */
                            t('anatomyAlwaysWeight', { size: formatKb(anatomy.alwaysBytes) })
                          : null
                    }
                  />
                ))}
                {band === 'gates' && anatomy.silentGuards.missing.length > 0 ? (
                  /*
                    ⚠️ **The one line on this screen that is a warning.** Every count above says
                    what is there; this says what a config promises and the disk does not have. A
                    hook whose script is missing produces no block and no error — the guard is
                    simply absent, and every number here still reads healthy. So it is amber, it
                    names the scripts, and it sits under the rows rather than inside one, because
                    it is not a part of the harness: it is a part that was asked for and is not
                    there.
                  */
                  <li
                    data-testid="harness-anatomy-silent"
                    className={cn(
                      'mt-2 rounded-chip border-t-0 px-2 py-1.5 text-caption',
                      WARNING_TONE,
                    )}
                  >
                    {t('anatomySilentGuards', {
                      count: anatomy.silentGuards.missing.length,
                      scripts: anatomy.silentGuards.missing.join(' · '),
                    })}
                  </li>
                ) : null}
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
          {/*
            Two columns, because one prose column inside a full-width card left 930 of 1400px empty
            and the band read as a card that had failed to load rather than as a deliberate blank
            (measured 1512×949, 2026-09-20). The heading pair sits in the narrow column and the two
            sentences in the wide one, so both texts start on one line and the card is used.
          */}
          <div className="grid gap-x-8 gap-y-2 md:grid-cols-[minmax(0,15rem)_1fr]">
            <div data-testid="harness-anatomy-slot-loop" data-status={toolSlot.status}>
              <h2 className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {t(BAND_HEAD.tool)}
              </h2>
              <h3 className="mt-1 break-keep text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                {t('anatomySlots.loop.title')}
              </h3>
            </div>
            <div className="flex flex-col gap-1">
              <p className="break-keep text-caption text-[color:var(--color-text-tertiary)]">
                {t(BAND_CAPTION.tool)}
              </p>
              <p className="break-keep text-caption text-[color:var(--color-text-tertiary)]">
                {t('anatomySlots.loop.body')}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
