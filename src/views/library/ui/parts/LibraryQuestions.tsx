"use client";

import type { useTranslations } from 'next-intl';
import { useId } from 'react';
import { answerObservation, type RetainedAnswerHead } from '@/features/library';
import { Button, RowButton } from '@/shared/ui';

/**
 * **The saved questions, drawn inside step three of the spine.**
 *
 * Until 2026-09-11 this section *was* the landing once one answer existed, and the
 * three-step stage was drawn only while `retainedAnswers.length === 0`. The first saved
 * answer therefore removed the only screen naming the next step, and the owner could not
 * find the saved-question path again. `docs/DECISIONS.md`, "The Library keeps its spine,
 * and computes the structural check itself", settles the shape: the stage is always
 * drawn, this list lives in step three, and the list slot holds `answers.empty` — a
 * one-line invitation — while nothing has been saved.
 *
 * Two consequences are visible here:
 *
 * - the heading is `text-title`, not `text-display`. The page headline is now the stage's
 *   own — one display step per screen, and this is a section inside it.
 * - Ask is `outline` at every count. It used to fall to `ghost` as soon as an answer
 *   existed, which demoted the only control that adds to this list exactly when a person
 *   had proved they use it.
 */
export function LibraryQuestions({ answers, knownSources, hashes, onOpen, onAsk, askBlockedReason, t }: {
  answers: readonly RetainedAnswerHead[];
  knownSources: ReadonlySet<string>;
  hashes: ReadonlyMap<string, string>;
  onOpen: (slug: string) => void;
  onAsk: (() => void) | null;
  /**
   * Why Ask cannot run, when it cannot — the sentence this screen already owns.
   *
   * A feature the product has stays on screen; availability is a state with its reason,
   * not absence. So Ask is drawn whenever there is a press *or* a reason, and disabled
   * with that reason tied to it. `null` on both means the caller has no true sentence for
   * this state and the control stays absent rather than shipping a false one.
   */
  askBlockedReason: string | null;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  const observationId = useId();
  const askReasonId = `${observationId}-ask-blocked`;
  const askBlocked = onAsk === null ? askBlockedReason : null;
  return (
    <section data-testid="library-questions" aria-labelledby="library-questions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="library-questions-title" className="text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
            {t('answers.title')}
          </h2>
          <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">{t('answers.lede')}</p>
        </div>
        {onAsk || askBlocked ? (
          <Button
            className="atlas-touch-floor max-w-full"
            size="sm"
            variant="outline"
            data-testid="library-questions-ask"
            disabled={onAsk === null}
            /* Tied to its reason, not merely near it: a disabled button leaves the tab
               order, so the sentence is otherwise reachable only by reading on. */
            aria-describedby={askBlocked ? askReasonId : undefined}
            onClick={onAsk ?? undefined}
          >
            {t('answers.ask')}
          </Button>
        ) : null}
      </div>
      {askBlocked ? (
        <p
          id={askReasonId}
          data-testid="library-questions-ask-blocked"
          className="mt-2 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {askBlocked}
        </p>
      ) : null}
      {answers.length ? (
        <ul className="mt-6 divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]">
          {answers.map((answer) => {
            const observation = answerObservation(answer.frontmatter, knownSources, hashes);
            return (
              <li key={answer.slug} className="py-3">
                <RowButton size="lg" tone="strong" hoverSurface="lift" className="w-full" aria-describedby={`${observationId}-${encodeURIComponent(answer.slug)}`} onClick={() => onOpen(answer.slug)} data-testid={`library-question-${answer.slug}`}>
                  <span className="min-w-0 flex-1 truncate">{answer.title}</span>
                </RowButton>
                <div id={`${observationId}-${encodeURIComponent(answer.slug)}`} className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-3 text-caption leading-body text-[color:var(--color-text-secondary)]">
                  <span className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" data-testid="answer-observation" data-state={observation.state}>{t(`answers.state.${observation.state}`)}</span>{' '}
                  {answer.alternatives > 1 ? <span>{t('answers.alternatives', { count: answer.alternatives })}{' '}</span> : null}
                  {answer.historyProblem ? <span>{t('answers.historyProblem')}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-4 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]" data-testid="library-questions-invitation">{t('answers.empty')}</p>}
      {/*
        The provenance caveat is about observations that exist. With nothing saved it was a
        paragraph explaining the limits of a measurement nobody has taken — and step three
        is now a card, where a line that says nothing costs the list its room.
      */}
      {answers.length ? (
        <p className="mt-4 text-caption leading-body text-[color:var(--color-text-tertiary)]">{t('answers.provenance')}</p>
      ) : null}
    </section>
  );
}
