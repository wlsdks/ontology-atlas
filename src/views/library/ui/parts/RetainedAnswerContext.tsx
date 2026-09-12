"use client";

import type { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import type { AnswerObservation } from '@/features/library';
import type { FailureCopy } from '@/shared/lib/use-failure-sentence';
import { Button, controlClass } from '@/shared/ui';
import { AgentDoor } from './AgentDoor';

/**
 * **The answer is what they opened, so the answer is what they read first** (owner,
 * 2026-09-12).
 *
 * Measured in the installed app at 1512×901 on the seeded folder
 * (`.claude/shots-2026-09-12/library-inspection/06-answer-page.png`): title, byline and
 * the originals disclosure, then a nine-line problem card, then this block — a bold
 * heading, three caption
 * paragraphs, a button and a link — and the answer's own **Summary started at y=756 of 901,
 * 84% down the viewport**. Every one of those lines is *about* the answer; none of them is
 * the answer. A reader who pressed a saved question had to scroll past the whole apparatus
 * to reach the sentence they asked for.
 *
 * This file is now two blocks with the body between them:
 *
 * | block | where | what it carries |
 * |---|---|---|
 * | `RetainedAnswerContext` | above the body | one line: what the observation found, and the press that acts on it. Everything else is behind a disclosure |
 * | `RetainedAnswerFooter` | after the body | leaving — the previous version, and the way back to the list |
 *
 * ## Why the notice is one line and not a card
 *
 * What a returning reader needs before the answer is the one fact that could make it wrong:
 * the cited originals changed, or one is missing, or nothing has moved. That is a sentence,
 * and the control that acts on it belongs on the same line. The **paths** of the files that
 * changed, the provenance caveat, and the paragraph explaining what a refresh sends to a
 * provider are all true and all secondary, so they sit under a `<summary>` a person opens
 * when the sentence has made them want them. The disclosure is the reason the sentence can
 * stay one line without anything being deleted.
 *
 * ## What stays outside the disclosure, and why
 *
 * `older` and the history state are **exceptional**: they say a reader is not on the newest
 * answer, or that the thread behind it is broken. A state that changes what the page *is*
 * may not be hidden behind a press. The error is the same class. All three are conditional,
 * so the routine screen pays nothing for them.
 *
 * ## The two controls are still not peers (2026-09-11 record, preserved)
 *
 * Asking for a draft acts on this answer; leaving for the list does not. The refresh stays
 * an outlined control inside a `role="group"` whose lede is the observation sentence — now
 * beside it rather than above it, which is the one assertion
 * `library-answer-comparison-rows.spec.ts` had to move — and leaving drops out of the group
 * to the very end of the page, below the answer it leaves.
 */
export function RetainedAnswerContext({ observation, phase, historyState, older, onRefresh, refreshButtonRef, agentDoor = false, historyBlocked = false, error, t }: {
  observation: AnswerObservation;
  phase: string;
  historyState: string;
  older: boolean;
  onRefresh: (() => void) | null;
  refreshButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * Whether `answers.refreshUnavailable` earns a door to `/agents` (slice U2).
   *
   * That sentence names only a connected coding agent, so unlike `stage.blockedNoAgent`
   * it has no second clause the door leaves unanswered. False on the web, where the
   * missing thing is the app itself.
   */
  agentDoor?: boolean;
  /**
   * **The page already knows this press would throw** (installed-app inspection before v1.2.2,
   * B2). A malformed thread edge makes the index card read 「이력 확인 필요」 while this block
   * offered the refresh anyway; pressing it threw, and the developer's English landed in the body.
   * Set from the same predicate `prepareAnswerRefresh` refuses on (`answerHistoryUnreadable`), so
   * the two cannot disagree.
   */
  historyBlocked?: boolean;
  /**
   * The translated sentence, and the English fact behind it. Typed rather than `string | null`
   * because `string` is what let `error.message` reach the page body in the first place.
   */
  error: FailureCopy | null;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  const working = phase === 'preparing' || phase === 'running' || phase === 'saving';
  const refusable = onRefresh !== null && !historyBlocked;
  const paths = (['changed', 'missing', 'added'] as const).filter((kind) => observation[kind].length);
  return (
    /*
     * `[&_p]:max-w-[var(--measure-prose)]` rather than a cap on the section: the rule below this
     * block is drawn by the inner `border-b`, and narrowing that would turn a column-wide
     * divider into a short dash. The cap belongs on the lines a person reads
     * (`app/globals.css`, `--measure-prose`).
     *
     * `[&_p]:[word-break:keep-all]` travels with it. A narrower line is a line that wraps, and
     * `word-break: normal` breaks Hangul between any two syllables — the same defect
     * `korean-word-break.spec.ts` was written for. The paths paragraph keeps `break-words`
     * beside it: that is `overflow-wrap`, a different property, so a long unspaced source path
     * can still break out of its box while a Korean sentence cannot break inside a word.
     */
    <section data-testid="retained-answer-context" className="mx-auto mt-4 w-full max-w-[var(--measure-doc-column)] px-6 [&_p]:max-w-[var(--measure-prose)] [&_p]:[word-break:keep-all] md:px-10" aria-label={t('answers.evidence')}>
      <div role="group" aria-label={t('answers.refresh')} className="border-b border-[color:var(--color-divider)] pb-4">
        <p role="status" aria-live="polite" className="sr-only">{working ? t(`answers.phase.${phase}`) : ''}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/*
            **The group's lede and the observation are one sentence, not two.** It used to be
            a `text-body` strong line stacked over a separate caption that explained the
            press; the two said the same thing in two grades, and together they were the top
            of a block that pushed the answer to 84% of the viewport. `text-label` is the
            grade this screen already gives a sentence that explains a control
            (`.claude/rules/design.md`, the 2026-08-09 finding), and `id` keeps it the
            element the refresh is described by.
          */}
          <p
            id="answer-refresh-lede"
            data-testid="answer-evidence-state"
            data-state={observation.state}
            className="min-w-0 flex-1 text-label leading-body text-[color:var(--color-text-secondary)]"
          >
            {t(`answers.state.${observation.state}`)}
          </p>
          <span className="flex flex-none flex-wrap items-center gap-2">
            {/*
             * **The door, beside the reason the disclosure holds** (slice U2). The refresh is
             * disabled without a connected coding agent and `answers.refreshUnavailable` says
             * so; this is the only live control in that state, so it stands first.
             */}
            {agentDoor && onRefresh === null ? <AgentDoor testId="answer-refresh-blocked-door" /> : null}
            <Button
              ref={refreshButtonRef}
              className="atlas-touch-floor max-w-full"
              size="sm"
              variant="outline"
              disabled={working || !refusable}
              /* The reason moves with the control: when the thread edge is broken, the sentence
                 the button is described by is the one that says so, not the observation. */
              aria-describedby={historyBlocked ? 'answer-refresh-blocked-history' : 'answer-refresh-lede'}
              onClick={refusable ? onRefresh ?? undefined : undefined}
              data-testid="answer-refresh-start"
            >{t(working ? `answers.phase.${phase}` : 'answers.refresh')}</Button>
          </span>
        </div>
        {/*
          The paths, the provenance caveat and what a refresh sends — every line that is true
          and none that a reader needs before the answer itself.
        */}
        <details data-testid="answer-evidence-detail" className="mt-2">
          <summary className={controlClass({ shape: 'link', size: 'sm', tone: 'muted', hoverInk: 'strong', className: 'atlas-touch-floor text-label' })}>
            {t('answers.evidenceMore')}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {paths.map((kind) => (
              <p key={kind} data-testid={`answer-evidence-paths-${kind}`} className="break-words text-label leading-body text-[color:var(--color-text-tertiary)]">
                {t(`answers.paths.${kind}`)}: {observation[kind].join(' · ')}
              </p>
            ))}
            <p className="text-label leading-body text-[color:var(--color-text-tertiary)]">{t(onRefresh ? 'answers.refreshHint' : 'answers.refreshUnavailable')}</p>
            <p data-testid="answer-provenance" className="text-label leading-body text-[color:var(--color-text-tertiary)]">{t('answers.provenance')}</p>
          </div>
        </details>
        {/* Not behind a press: each of these says the page is not what a reader assumes. */}
        {older ? <p className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)]">{t('answers.older')}</p> : null}
        {historyState !== 'none' ? <p data-testid="answer-history-state" className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)]">{t(`answers.history.${historyState}`)}</p> : null}
        {/*
          The reason the press is not offered, on the row that holds the press. It carries the
          index card's own 「이력 확인 필요」 opening so a reader meets one wording for one fact.
        */}
        {historyBlocked ? (
          <p
            id="answer-refresh-blocked-history"
            data-testid="answer-refresh-blocked-history"
            className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)]"
          >
            {t('answers.refreshBlockedHistory')}
          </p>
        ) : null}
        {/* `data-failure-detail` is where the English goes: a developer reads the attribute, a
            reader reads the sentence. It is never rendered. */}
        {error ? <p role="alert" data-testid="answer-refresh-error" data-failure-detail={error.detail ?? undefined} className="mt-2 text-body leading-body text-[color:var(--color-text-primary)]">{error.sentence}</p> : null}
      </div>
    </section>
  );
}

/**
 * **Leaving, after the answer rather than before it.**
 *
 * The way back to the question list and the previous revision both take a reader *off* this
 * answer, so they belong where the answer ends. They were 300px above the answer's own
 * Summary until 2026-09-12.
 */
export function RetainedAnswerFooter({ onHome, onPrevious, t }: {
  onHome: () => void;
  onPrevious: (() => void) | null;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  return (
    <section data-testid="retained-answer-footer" className="mx-auto mt-6 w-full max-w-[var(--measure-doc-column)] px-6 pb-8 md:px-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4">
        {onPrevious ? <Button className="atlas-touch-floor max-w-full" size="sm" variant="ghost" data-testid="answer-previous" onClick={onPrevious}>{t('answers.previous')}</Button> : null}
        <button
          type="button"
          onClick={onHome}
          data-testid="answer-back-home"
          className={controlClass({ shape: 'link', tone: 'muted', hoverInk: 'strong', className: 'atlas-touch-floor text-body' })}
        >
          {t('answers.back')}
        </button>
      </div>
    </section>
  );
}
