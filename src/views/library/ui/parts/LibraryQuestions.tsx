"use client";

import type { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Check } from 'lucide-react';
import { answerObservation, type RetainedAnswerHead } from '@/features/library';
import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { StateBadge } from './StateBadge';
import { AgentDoor } from './AgentDoor';

/**
 * Saved questions inside step three of the spine; the list slot holds `answers.empty` while nothing
 * is saved. The heading is `text-title` because the stage owns the display step. Rows follow the
 * wiki row anatomy (`LibraryShelf`); hover moves border and ink.
 */
export function LibraryQuestions({ answers, knownSources, hashes, onOpen, onAsk, askBlockedReason, askBlockedReasonId, agentDoor = false, headingHidden = false, t }: {
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
   * Where that sentence is already printed, when another card on the landing owns it: given an id, Ask
   * stays present, disabled and described by that paragraph instead of drawing a second copy.
   */
  askBlockedReasonId?: string | null;
  /**
   * Whether the reason **this** block prints earns a door to `/agents` (slice U2).
   *
   * Only meaningful when this card is the one printing the sentence; when another card
   * owns it, that card carries the door and this one carries neither. False on the web.
   */
  agentDoor?: boolean;
  /**
   * The host already names this section, so the heading stays for the accessibility tree and leaves
   * the screen.
   */
  headingHidden?: boolean;
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
          <h2 id="library-questions-title" className={headingHidden ? 'sr-only' : 'text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]'}>
            {t('answers.title')}
          </h2>
          <p className={headingHidden ? 'text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]' : 'mt-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]'}>{t('answers.lede')}</p>
        </div>
        {onAsk || askBlocked ? (
          /*
           * The Library's chip grammar, shared with `library-compile-popover-run` and the strip's doors; a
           * `Button sm` would mix two grammars in one popover.
           */
          <Chip
            className="atlas-touch-floor max-w-full"
            tone="strong"
            hoverSurface="lift"
            hoverBorder="strong"
            data-testid="library-questions-ask"
            disabled={onAsk === null}
            /* Tied to its reason, not merely near it: a disabled button leaves the tab
               order, so the sentence is otherwise reachable only by reading on. It points
               at whichever card on this landing prints that sentence. */
            aria-describedby={askBlocked ? (askBlockedReasonId ?? askReasonId) : undefined}
            onClick={onAsk ?? undefined}
          >
            {t('answers.ask')}
          </Chip>
        ) : null}
      </div>
      {askBlockedBelow ? (
        <p
          id={askReasonId}
          data-testid="library-questions-ask-blocked"
          data-landing-blocked-reason="true"
          /*
           * The grade the landing and the source pane give this sentence: it explains a refused press and may
           * not be the smallest text on the card.
           */
          className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {askBlockedBelow}
        </p>
      ) : null}
      {/* The way to the destination that sentence just named — the rail's own word, so
          the door and the tile are visibly one place (slice U2). */}
      {askBlockedBelow && agentDoor ? (
        <p className="mt-2">
          <AgentDoor testId="library-questions-ask-blocked-door" />
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
                {/* One observation at the grade the index spends on it: a check for the state with nothing to act on,
                   the amber badge for the three that need a person, a plain caption for the one nothing has
                   measured, and a caption count for alternatives. */}
                <div id={describedBy} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-body text-[color:var(--color-text-tertiary)]">
                  <span
                    data-testid="answer-observation"
                    data-state={observation.state}
                    className="flex flex-none items-center"
                  >
                    {observation.state === 'unchanged' || observation.state === 'rewritten' ? (
                      /* The check the source list already uses for *nothing to do here*:
                         the glyph is `aria-hidden` and the word rides with it in
                         `sr-only`, so the sentence is still announced and still part of
                         the row's description. A rewritten page joins it: the source moved
                         and the page was written from the move, so there is nothing to act
                         on and an amber badge here would ask for work already done. */
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
