"use client";

import type { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import type { AnswerObservation } from '@/features/library';
import { Button, controlClass } from '@/shared/ui';
import { AgentDoor } from './AgentDoor';

export function RetainedAnswerContext({ observation, phase, historyState, older, onHome, onPrevious, onRefresh, refreshButtonRef, agentDoor = false, error, t }: {
  observation: AnswerObservation;
  phase: string;
  historyState: string;
  older: boolean;
  onHome: () => void;
  onPrevious: (() => void) | null;
  onRefresh: (() => void) | null;
  refreshButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * Whether `answers.refreshUnavailable` earns a door to `/agents` (slice U2).
   *
   * That sentence names only a connected coding agent, so unlike `stage.blockedNoAgent`
   * it has no second clause the door leaves unanswered. False on the web, where the
   * missing thing is the installed app.
   */
  agentDoor?: boolean;
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
        {/*
          **Asking for a new draft is not "go back", so they are not peers** (the 2026-09-11
          record's Why: a refresh button was mistaken for a read-only review action). The two
          controls that act on *this* answer — request a draft, read the version before it —
          stand together in a group whose lede says what pressing them does, and leaving for
          the list drops out of the group as a plain link below it. It stays a `<button>`: it
          performs in-app selection, not navigation to a URL.

          **Drawn without an agent, disabled, beside its reason** (`docs/DECISIONS.md`,
          2026-09-11, "The Library keeps its spine, and computes the structural check
          itself"). It used to vanish, leaving `answers.refreshUnavailable` explaining
          the absence of a control a reader had never seen — a feature the product has
          is always on screen, and availability is a state with its reason. That reason is
          now the group's lede, so the sentence a person reads before pressing and the
          sentence explaining why they cannot occupy one place.
        */}
        <div role="group" aria-label={t('answers.refresh')} className="mt-3">
          <p id="answer-refresh-lede" className="text-caption leading-body text-[color:var(--color-text-secondary)]">{t(onRefresh ? 'answers.refreshHint' : 'answers.refreshUnavailable')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/*
             * **The door, inside the group whose lede is the reason** (slice U2). The
             * sentence above says a refresh needs a connected coding agent, and until
             * 2026-09-11 that was the end of it — a reason with no way to act on it. It
             * stands first in the row because it is the only live control here: the
             * refresh beside it is disabled, which is the state the lede explains.
             */}
            {agentDoor && onRefresh === null ? <AgentDoor testId="answer-refresh-blocked-door" /> : null}
            <Button ref={refreshButtonRef} className="atlas-touch-floor max-w-full" size="sm" variant="outline" disabled={working || onRefresh === null} aria-describedby="answer-refresh-lede" onClick={onRefresh ?? undefined} data-testid="answer-refresh-start">{t(working ? `answers.phase.${phase}` : 'answers.refresh')}</Button>
            {onPrevious ? <Button className="atlas-touch-floor max-w-full" size="sm" variant="ghost" onClick={onPrevious}>{t('answers.previous')}</Button> : null}
          </div>
        </div>
        <p className="mt-3">
          <button
            type="button"
            onClick={onHome}
            data-testid="answer-back-home"
            className={controlClass({ shape: 'link', tone: 'muted', hoverInk: 'strong', className: 'atlas-touch-floor text-body' })}
          >
            {t('answers.back')}
          </button>
        </p>
        {error ? <p role="alert" className="mt-3 text-body leading-body text-[color:var(--color-text-primary)]">{error}</p> : null}
      </div>
    </section>
  );
}
