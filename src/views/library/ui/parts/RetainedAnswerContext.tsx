"use client";

import type { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import type { AnswerObservation } from '@/features/library';
import { Button } from '@/shared/ui';

export function RetainedAnswerContext({ observation, phase, historyState, older, onHome, onPrevious, onRefresh, refreshButtonRef, error, t }: {
  observation: AnswerObservation;
  phase: string;
  historyState: string;
  older: boolean;
  onHome: () => void;
  onPrevious: (() => void) | null;
  onRefresh: (() => void) | null;
  refreshButtonRef?: RefObject<HTMLButtonElement | null>;
  error: string | null;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  const working = phase === 'preparing' || phase === 'running' || phase === 'saving';
  return (
    /*
     * `[&_p]:max-w-[var(--measure-prose)]` rather than a cap on the section: the rules above
     * and below this block are drawn by the inner `border-y`, and narrowing that would turn a
     * column-wide divider into a short dash. The cap belongs on the lines a person reads
     * (2026-09-11 prose-measure calibration — `app/globals.css`, `--measure-prose`).
     *
     * `[&_p]:[word-break:keep-all]` travels with it. A narrower line is a line that wraps, and
     * `word-break: normal` breaks Hangul between any two syllables — the same defect
     * `korean-word-break.spec.ts` was written for. The paths paragraph keeps `break-words`
     * beside it: that is `overflow-wrap`, a different property, so a long unspaced source path
     * can still break out of its box while a Korean sentence cannot break inside a word.
     */
    <section data-testid="retained-answer-context" className="mx-auto mt-4 w-full max-w-[var(--measure-doc-column)] px-6 [&_p]:max-w-[var(--measure-prose)] [&_p]:[word-break:keep-all] md:px-10" aria-label={t('answers.evidence')}>
      <div className="border-y border-[color:var(--color-divider)] py-4">
        <p role="status" aria-live="polite" className="sr-only">{working ? t(`answers.phase.${phase}`) : ''}</p>
        <p data-testid="answer-evidence-state" data-state={observation.state} className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t(`answers.state.${observation.state}`)}</p>
        {(['changed', 'missing', 'added'] as const).map((kind) => observation[kind].length ? (
          <p key={kind} className="mt-1 break-words text-caption leading-body text-[color:var(--color-text-secondary)]">
            {t(`answers.paths.${kind}`)}: {observation[kind].join(' · ')}
          </p>
        ) : null)}
        <p className="mt-2 text-caption leading-body text-[color:var(--color-text-secondary)]">{t('answers.provenance')}</p>
        {older ? <p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('answers.older')}</p> : null}
        {historyState !== 'none' ? <p data-testid="answer-history-state" className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t(`answers.history.${historyState}`)}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {/*
            **Drawn without an agent, disabled, beside its reason** (`docs/DECISIONS.md`,
            2026-09-11, "The Library keeps its spine, and computes the structural check
            itself"). It used to vanish, leaving `answers.refreshUnavailable` explaining
            the absence of a control a reader had never seen — a feature the product has
            is always on screen, and availability is a state with its reason.
          */}
          <Button ref={refreshButtonRef} className="atlas-touch-floor max-w-full" size="sm" variant="outline" disabled={working || onRefresh === null} aria-describedby={onRefresh ? undefined : 'answer-refresh-unavailable'} onClick={onRefresh ?? undefined} data-testid="answer-refresh-start">{t(working ? `answers.phase.${phase}` : 'answers.refresh')}</Button>
          {onPrevious ? <Button className="atlas-touch-floor max-w-full" size="sm" variant="ghost" onClick={onPrevious}>{t('answers.previous')}</Button> : null}
          <Button className="atlas-touch-floor max-w-full" size="sm" variant="ghost" onClick={onHome}>{t('answers.back')}</Button>
        </div>
        {onRefresh ? <p className="mt-2 text-caption leading-body text-[color:var(--color-text-secondary)]">{t('answers.refreshHint')}</p> : null}
        {!onRefresh ? <p id="answer-refresh-unavailable" className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('answers.refreshUnavailable')}</p> : null}
        {error ? <p role="alert" className="mt-3 text-body leading-body text-[color:var(--color-text-primary)]">{error}</p> : null}
      </div>
    </section>
  );
}
