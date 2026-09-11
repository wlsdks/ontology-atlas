"use client";

import type { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Check } from 'lucide-react';
import { answerObservation, type RetainedAnswerHead } from '@/features/library';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { StateBadge } from './StateBadge';

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
 *
 * ## The row is a door, and it says so at rest (council 2026-09-11)
 *
 * All four seats measured the same defect independently. The row was a borderless
 * `RowButton` inside a `divide-y` list: rest ≡ hover ≡ press (rest 1.000:1 with no border
 * or fill, hover `overlay-1` at 1.040:1 — under the 1.14 this repository has already
 * rejected as inseparable), while 25px away the only bordered control in the block opened
 * a *new* question, so the screen marked the wrong door. The disabled Ask rested at
 * 1.154:1: the dead control looked more pressable than the live row.
 *
 * The answer is the repeated-set one: **the same object is drawn the same way**. A saved
 * answer is a wiki page, and the index already draws a wiki page as a bordered row with a
 * fill (`LibraryShelf`), so this row takes that anatomy — `--color-overlay-2` body,
 * `--color-border-soft` edge, `text-body` title — and the list drops the `divide-y
 * border-y` frame so the rows are the only rectangles in the block. No glyph: the row
 * this one repeats has none.
 *
 * ⚠️ **Hover is the border and the ink, not the fill, and that is measured.** The
 * prescription was `overlay-2` on hover; on this ground that *is* the rest state, and the
 * next step up (`overlay-3`) composites to **1.12:1 against it** — the same
 * indistinguishable band the defect was reported for, so emitting it from the value layer
 * would have bought nothing. Measured off the installed app's own pixels (guardian,
 * 2026-09-11, `.claude/shots-2026-09-11/library-spine-final/28-landing-one-answer.png`):
 * the resting edge paints at rgb(42,43,44) — **1.34:1** against the card behind it, where
 * the row used to have no edge at all — and `--color-border-strong` takes it to 1.78:1,
 * a 1.32 step. So hover moves the edge and the ink together (`hoverBorder` and
 * `hoverInk`, both already in `control-class.ts` — this needed no new compound branch),
 * and the press adds the `overlay-3` fill plus `--shadow-control-press` as a third
 * combination. Three states, three channels. No transform, so there is nothing for
 * reduced motion to replace
 */
export function LibraryQuestions({ answers, knownSources, hashes, onOpen, onAsk, askBlockedReason, askBlockedReasonId, t }: {
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
  /**
   * **Where that sentence is already printed, when another card on this landing owns it.**
   *
   * Measured at 1512 on the no-agent folder (design-interaction C2, council 2026-09-11):
   * `stage.blockedNoAgent` stood under step two's Compile *and* under Ask, the same
   * sentence twice, ~200px apart — which teaches a reader to skip it. `LibraryPage` now
   * decides which card prints it; given an id, this block keeps Ask present, disabled and
   * described by that paragraph instead of drawing a second copy.
   */
  askBlockedReasonId?: string | null;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  const observationId = useId();
  /* A stable id, not a generated one: step two's Check the wiki points at this paragraph
     whenever this block is the card printing the landing's availability sentence. */
  const askReasonId = 'library-questions-ask-blocked';
  const askBlocked = onAsk === null ? askBlockedReason : null;
  /* Printed here only when no other card on the landing is printing it. */
  const askBlockedBelow = askBlocked && !askBlockedReasonId ? askBlocked : null;
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
               order, so the sentence is otherwise reachable only by reading on. It points
               at whichever card on this landing prints that sentence. */
            aria-describedby={askBlocked ? (askBlockedReasonId ?? askReasonId) : undefined}
            onClick={onAsk ?? undefined}
          >
            {t('answers.ask')}
          </Button>
        ) : null}
      </div>
      {askBlockedBelow ? (
        <p
          id={askReasonId}
          data-testid="library-questions-ask-blocked"
          data-landing-blocked-reason="true"
          className="mt-2 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {askBlockedBelow}
        </p>
      ) : null}
      {answers.length ? (
        <ul className="mt-6 flex flex-col gap-2">
          {answers.map((answer) => {
            const observation = answerObservation(answer.frontmatter, knownSources, hashes);
            const stateLabel = t(`answers.state.${observation.state}`);
            const describedBy = `${observationId}-${encodeURIComponent(answer.slug)}`;
            return (
              <li key={answer.slug}>
                <button
                  type="button"
                  data-testid={`library-question-${answer.slug}`}
                  aria-describedby={describedBy}
                  onClick={() => onOpen(answer.slug)}
                  className={controlClass({
                    shape: 'row',
                    size: 'lg',
                    tone: 'strong',
                    hoverInk: 'strong',
                    hoverBorder: 'strong',
                    className: cn(
                      'border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)] px-3 py-2.5',
                      'transition-[box-shadow,background-color,border-color,color]',
                      'active:bg-[color:var(--color-overlay-3)] active:shadow-[var(--shadow-control-press)]',
                    ),
                  })}
                >
                  <span className="min-w-0 flex-1 truncate">{answer.title}</span>
                </button>
                {/*
                  **One observation, at the grade the index already spends on it**
                  (design-infoviz, council 2026-09-11). One bold `text-body` mark drew all
                  five `answerObservation` states, so *no change since source observation*
                  was as loud as *a cited original is missing*, while `historyProblem` — a
                  broken thread edge — was quieter than both. The row's own list grammar
                  decides instead: a check for the state with nothing to act on, the amber
                  badge for the three that need a person, a plain caption for the one
                  nothing has measured, and the alternatives a caption count.
                */}
                <div id={describedBy} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 text-caption leading-body text-[color:var(--color-text-tertiary)]">
                  <span
                    data-testid="answer-observation"
                    data-state={observation.state}
                    className="flex flex-none items-center"
                  >
                    {observation.state === 'unchanged' ? (
                      /* The check the source list already uses for *nothing to do here*:
                         the glyph is `aria-hidden` and the word rides with it in
                         `sr-only`, so the sentence is still announced and still part of
                         the row's description. */
                      <>
                        <Check size={ICON_SIZE.sm} aria-hidden />
                        <span className="sr-only">{stateLabel}</span>
                      </>
                    ) : observation.state === 'unmeasured' ? (
                      stateLabel
                    ) : (
                      <StateBadge tone="warning">{stateLabel}</StateBadge>
                    )}
                  </span>{' '}
                  {answer.alternatives > 1 ? <span>{t('answers.alternatives', { count: answer.alternatives })}{' '}</span> : null}
                  {/* A thread whose earlier answer is missing is a broken edge, not a
                      footnote — the same grade as a missing source. */}
                  {answer.historyProblem ? (
                    <StateBadge tone="warning" testId="answer-history-problem">
                      {t('answers.historyProblem')}
                    </StateBadge>
                  ) : null}
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
