'use client';

import { Fragment, useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldQuestion, TriangleAlert } from 'lucide-react';

import type { HarnessReport } from '@/entities/agent-files';
import { CompactCopyButton } from '@/shared/ui';
import { PlacedInfoHint } from './PlacedInfoHint';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { HarnessStructureDiagram } from './HarnessStructureDiagram';
import { cn } from '@/shared/lib/cn';

import {
  buildHarnessAnatomy,
  type AnatomyBand,
  type AnatomySlot,
} from '../model/harness-anatomy';
import { buildHarnessBrief } from '../model/harness-brief';

/**
 * What this repository hands an agent, in the order the agent meets it. The bands are the coverage
 * matrix's columns (told, gated, watched) cut by part instead of by area. A fourth band holds the
 * agent loop and model, which no checkout knows, in words rather than a false "0". No score, grade
 * or percentage: files alone cannot tell absent from rightly absent.
 */

const BAND_ORDER: readonly AnatomyBand[] = ['tells', 'gates', 'watches'];

/** The copied-acknowledgement key for the handover, which is not one of the slots. */
const BRIEF_ID = '__brief__';

/** The guides view's `WARNING_BADGE` pair, so both views mark an unresolved state alike. */
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

/**
 * Breaks a path or config key only after `/` and `.` (via `<wbr>`), so
 * `.claude/settings.json → hooks.PostToolUse` never splits mid-word.
 */
function breakAtSeparators(text: string): ReactNode {
  return text.split(/(?<=[/.])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

/** The sentence's last word and the hint button share a `nowrap` span, so the button never wraps alone. */
function SentenceWithHint({ text, hint }: { text: string; hint: ReactNode }) {
  const cut = text.lastIndexOf(' ');
  const head = cut < 0 ? '' : text.slice(0, cut + 1);
  const tail = cut < 0 ? text : text.slice(cut + 1);
  return (
    <>
      {head}
      <span className="whitespace-nowrap">
        {tail}
        {' '}
        {hint}
      </span>
    </>
  );
}

function SlotRow({
  slot,
  t,
  extra,
  copied,
  onCopy,
  extraHint,
  extraHintLabel,
  bodyHint,
  hideTitle = false,
}: {
  slot: AnatomySlot;
  t: TranslateFn;
  /** The diagram's evidence pane already heads the row with its name and count. */
  hideTitle?: boolean;
  /** One line a specific slot earns — the permission split and the always-read weight. */
  extra?: string | null;
  /** The hint that line needs when the number is one a reader will want to argue with. */
  extraHint?: string | null;
  /** That hint's button label, when the row is not the always-read one. */
  extraHintLabel?: string;
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
      className="relative border-t border-[color:var(--color-divider)] py-3 first:border-t-0 first:pt-0"
    >
      <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1', hideTitle && 'sr-only')}>
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
        {/* The count is never bare: its unit is the repository's own noun, so it does not read as a rank. */}
        <span
          data-testid={`harness-anatomy-count-${slot.id}`}
          className={cn(
            'shrink-0 text-label tabular-nums',
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
      <div className={cn('max-w-prose text-label text-[color:var(--color-text-tertiary)]', !hideTitle && 'mt-1')}>
        {/* A row's body is one sentence; the product-name list moves behind the hint. */}
        {bodyHint ? (
          <SentenceWithHint
            text={t(`anatomySlots.${slot.id}.body`)}
            hint={
              <PlacedInfoHint preferred="left" className="align-middle" label={t(`anatomySlots.${slot.id}.hintLabel`)}>
                {bodyHint}
              </PlacedInfoHint>
            }
          />
        ) : (
          t(`anatomySlots.${slot.id}.body`)
        )}
      </div>
      {extra ? (
        /* A `div`, not a `p`: `InfoHint` renders a `div` panel, and a `div` inside a `p` is a hydration error. */
        <div className="mt-1 break-words text-label tabular-nums text-[color:var(--color-text-tertiary)]">
          {extraHint ? (
            <SentenceWithHint
              text={extra}
              hint={
                <PlacedInfoHint preferred="left" className="align-middle" label={extraHintLabel ?? t('anatomyAlwaysWeightLabel')}>
                  {extraHint}
                </PlacedInfoHint>
              }
            />
          ) : (
            extra
          )}
        </div>
      ) : null}
      {slot.items.length > 0 ? (
        /* The names are the citation a doubting reader opens; monospace because each can be typed. */
        <p className="mt-1.5 break-words font-mono text-label text-[color:var(--color-text-quaternary)]">
          {slot.items.map((item, index) => (
            <Fragment key={`${item}-${index}`}>
              {index > 0 ? ' · ' : null}
              {breakAtSeparators(item)}
            </Fragment>
          ))}
          {slot.overflow > 0 ? ` · ${t('anatomyMore', { count: slot.overflow })}` : ''}
        </p>
      ) : null}
      {absent && slot.fillPath ? (
        /* An address, not advice: the conventional path from the tool's docs, copied rather than written, since Atlas puts nothing into a source repository. */
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-label text-[color:var(--color-text-quaternary)]">
            {t('anatomyFillHere')}
          </span>
          <code className="min-w-0 break-words font-mono text-label text-[color:var(--color-text-tertiary)]">
            {breakAtSeparators(slot.fillPath)}
          </code>
          {/* `min-h-8` matches the 32px view toggle and handoff button in the same header. */}
          <CompactCopyButton
            className="min-h-8"
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

/** KB with one decimal, the guides table's format, so two screens never round the same bytes differently. */
function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function HarnessAnatomyView({
  report,
  sourceRoot,
}: {
  report: HarnessReport;
  /** The repository this reading is about. It belongs in the handover, not only in the footer. */
  sourceRoot: string;
}) {
  const t = useTranslations('harness');
  const anatomy = useMemo(() => buildHarnessAnatomy(report), [report]);
  const [presentation, setPresentation] = useState<'diagram' | 'text'>('diagram');
  const [selectedSlot, setSelectedSlot] = useState<string | null>('always');
  const detailId = useId();
  const selected = anatomy.slots.find(slot => slot.id === selectedSlot);
  const toolSlot = anatomy.slots.find((slot) => slot.band === 'tool');
  /* One id, not a set: a second copy replaces the first acknowledgement, as elsewhere in the product. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyBrief = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    void navigator.clipboard
      ?.writeText(buildHarnessBrief(anatomy, report, sourceRoot, today))
      .then(
        () => setCopiedId(BRIEF_ID),
        () => undefined,
      );
  }, [anatomy, report, sourceRoot]);
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
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      {/* One line, not a second masthead: the shell already prints the name; it survives as the region's label. */}
      {/* One control row: how to read it on the left, what to do with it on the right. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <SegmentedControl ariaLabel={t('structurePresentation')} value={presentation} onChange={setPresentation}
          options={[{value:'diagram',label:t('diagramView'),testId:'harness-view-diagram'},{value:'text',label:t('textView'),testId:'harness-view-text'}]} className="shrink-0" />
        {/* Hands the screen to an agent as an English description that carries its own limits. */}
        <CompactCopyButton
          data-testid="harness-anatomy-brief"
          copied={copiedId === BRIEF_ID}
          label={copiedId === BRIEF_ID ? t('anatomyBriefCopied') : t('anatomyBrief')}
          ariaLabel={t('anatomyBriefAria')}
          onClick={copyBrief}
          className="min-h-8 border border-[color:var(--color-border-soft)] px-3"
        />
      </div>

      {/* Only the work area scrolls; headers and view switching stay anchored. No evidence is clipped. */}
      <div data-testid="harness-structure-scroll" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">

      {presentation === 'diagram' ? <>
        <HarnessStructureDiagram slots={anatomy.slots} sourceRoot={sourceRoot} selectedId={selectedSlot} detailId={detailId} onSelect={setSelectedSlot}
          selectedContent={<ul className="py-2">
            {selected ? <SlotRow slot={selected} t={t} copied={copiedId===selected.id} onCopy={copy} hideTitle /> : null}
          </ul>} />
        {anatomy.silentGuards.missing.length > 0 || anatomy.approvalGates.length > 0 ? (
          /* One bordered stack for what the files cannot settle; only the warning wears amber. */
          <ul data-testid="harness-anatomy-notes" className="shrink-0 overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
            {anatomy.silentGuards.missing.length > 0 ? (
              <li data-testid="harness-anatomy-silent" className="flex items-start gap-2.5 border-b border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-[var(--card-pad)] py-2.5 text-body text-[color:var(--color-amber-source-a90)] last:border-b-0">
                <TriangleAlert size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-keep">{t('anatomySilentGuards',{count:anatomy.silentGuards.missing.length,scripts:anatomy.silentGuards.missing.join(' · ')})}</span>
              </li>
            ) : null}
            {anatomy.approvalGates.length > 0 ? (
              <li data-testid="harness-anatomy-approval" className="flex items-start gap-2.5 px-[var(--card-pad)] py-2.5 text-body text-[color:var(--color-text-secondary)]">
                <ShieldQuestion size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-text-tertiary)]" />
                <span className="min-w-0 break-keep">{t('anatomyApprovalGate',{config:anatomy.approvalGates.join(' · ')})}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </> : <>

      {/* Equal height by the grid, per `forbidden.md`: bands with four parts and with two must not read as different weights. */}
      <div className="grid shrink-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {BAND_ORDER.map((band) => {
          const slots = anatomy.slots.filter((slot) => slot.band === band);
          return (
            <section
              key={band}
              data-testid={`harness-anatomy-band-${band}`}
              className="flex min-w-0 flex-col rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)]"
            >
              <h2 className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {t(BAND_HEAD[band])}
              </h2>
              <p className="mt-1 break-keep text-label text-[color:var(--color-text-tertiary)]">
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
                    extraHint={
                      slot.id === 'always'
                        ? t('anatomyAlwaysWeightHint')
                        : slot.id === 'scoped' && anatomy.deepestNested
                          ? t('anatomyChainWeightHint')
                          : null
                    }
                    bodyHint={slot.id === 'blind' ? t('anatomySlots.blind.hint') : null}
                    extraHintLabel={
                      slot.id === 'scoped' ? t('anatomyChainWeightLabel') : undefined
                    }
                    extra={
                      slot.id === 'permissions' && anatomy.permissions
                        ? t('anatomyPermissionSplit', {
                            allow: anatomy.permissions.allow,
                            ask: anatomy.permissions.ask,
                            deny: anatomy.permissions.deny,
                          })
                        : slot.id === 'scoped' && anatomy.deepestNested
                          ? t('anatomyChainWeight', {
                              path: anatomy.deepestNested.path,
                              size: formatKb(anatomy.deepestNested.bytes),
                              total: formatKb(
                                anatomy.alwaysBytes + anatomy.deepestNested.bytes,
                              ),
                            })
                          : slot.id === 'always' && anatomy.alwaysBytes > 0
                          ? /* The turn's standing cost beside the count, which cannot carry it. */
                            t('anatomyAlwaysWeight', { size: formatKb(anatomy.alwaysBytes) })
                          : null
                    }
                  />
                ))}
                {band === 'gates' && anatomy.silentGuards.missing.length > 0 ? (
                  /* The one warning: a missing hook script produces no block and no error, so every number still reads healthy. */
                  <li
                    data-testid="harness-anatomy-silent"
                    className={cn(
                      'mt-2 rounded-chip border-t-0 px-2 py-1.5 text-label',
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
                  /* Codex refuses a hook it has not been trusted with, and that trust is session state no file records. */
                  <li
                    data-testid="harness-anatomy-approval"
                    className="mt-1 border-t border-[color:var(--color-divider)] pt-3 text-label text-[color:var(--color-text-quaternary)]"
                  >
                    {t('anatomyApprovalGate', { config: anatomy.approvalGates.join(' · ') })}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      </>}
      {/* The diagram explains the loop in its centre card; the text reading has no centre, so it keeps this band. */}
      {toolSlot && presentation === 'text' ? (
        /* Dashed and quieter: an area deliberately left blank, not a card that failed to load. */
        <section
          data-testid="harness-anatomy-band-tool"
          className="shrink-0 rounded-card border border-dashed border-[color:var(--color-border-soft)] p-[var(--card-pad)]"
        >
          {/* Two columns, so both texts start on one line and the wide card is used. */}
          <div className="grid gap-x-8 gap-y-2 md:grid-cols-[minmax(0,15rem)_1fr]">
            <div data-testid="harness-anatomy-slot-loop" data-status={toolSlot.status}>
              <h2 className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {t(BAND_HEAD.tool)}
              </h2>
              <h3 className="mt-1 break-keep text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                {t('anatomySlots.loop.title')}
              </h3>
            </div>
            <div className="flex flex-col gap-1">
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {t(BAND_CAPTION.tool)}
              </p>
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {t('anatomySlots.loop.body')}
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {presentation === 'text' ? (
        /* The diagram prints this path in its own header. */
        <p className="break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
          {t('sourceRoot', { path: sourceRoot })}
        </p>
      ) : null}
      </div>
    </section>
  );
}
