import type { RefObject } from 'react';
import { Presentation } from 'lucide-react';

import type { ChatSuggestion } from '@/features/acp-session';
import { RowButton, Surface } from '@/shared/ui';
import { BrandWaitingMark } from '@/shared/ui/brand-waiting-mark';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { SuggestionRows } from './SuggestionRows';
import type { ChatT } from './types';
import type { usePresentation } from './use-presentation';

type PresentationState = ReturnType<typeof usePresentation>;

interface TranscriptOffersProps {
  t: ChatT;
  showAnswerWait: boolean;
  stoppedWithoutAnswer: boolean;
  presentation: Pick<
    PresentationState,
    'presentationTrace' | 'presentationBlocked' | 'presentationVisible' | 'heldPresentationTrace' | 'openPresentation'
  >;
  presentationOfferRef: RefObject<HTMLButtonElement | null>;
  showPostTurnSuggestions: boolean;
  postTurnSuggestionsHeld: readonly ChatSuggestion[];
  onChooseSuggestion: (suggestion: ChatSuggestion) => void;
}

export function TranscriptOffers({
  t,
  showAnswerWait,
  stoppedWithoutAnswer,
  presentation,
  presentationOfferRef,
  showPostTurnSuggestions,
  postTurnSuggestionsHeld,
  onChooseSuggestion,
}: TranscriptOffersProps) {
  const { presentationTrace, presentationBlocked, presentationVisible, heldPresentationTrace, openPresentation } = presentation;
  return (
    <>
      {showAnswerWait ? (
        <div data-testid="acp-answer-wait" className="flex justify-center py-2">
          <BrandWaitingMark active />
        </div>
      ) : null}
      {stoppedWithoutAnswer ? (
        <p
          data-testid="acp-turn-stopped"
          role="status"
          className="px-1 py-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {t('stoppedBeforeAnswer')}
        </p>
      ) : null}
      <Surface
        as="section"
        open={presentationTrace !== null && !presentationVisible}
        origin="bottom center"
        aria-label={t('presentation.open')}
        data-testid="acp-presentation-offer"
        className="mt-1 border-t border-[color:var(--color-divider)] pt-3"
      >
        <RowButton
          ref={presentationOfferRef}
          tone="secondary"
          hoverInk="strong"
          hoverSurface="lift"
          hoverBorder="strong"
          data-testid="acp-presentation-open"
          className="w-full gap-3 text-left"
          onClick={openPresentation}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-indigo-text-soft)]">
            <Presentation size={ICON_SIZE.md} aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-body-lg leading-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('presentation.open')}
            </span>
            <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">
              {t('presentation.openHint', { count: heldPresentationTrace?.scenes.length ?? 0 })}
            </span>
          </span>
        </RowButton>
      </Surface>
      <Surface
        as="section"
        open={presentationBlocked !== null && !presentationVisible}
        origin="bottom center"
        role="status"
        data-testid="acp-presentation-blocked"
        className="mt-1 border-l border-dashed border-[color:var(--color-border-strong)] pl-3"
      >
        <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {t('presentation.blocked', {
            reason: t(`presentation.blockReason.${presentationBlocked?.reason ?? 'no_answer'}`),
          })}
        </p>
      </Surface>
      <Surface
        as="section"
        open={showPostTurnSuggestions}
        origin="top center"
        role="group"
        aria-label={t('suggest.followUpHeading')}
        data-testid="acp-chat-post-turn-suggestions"
        className="mt-1 border-t border-[color:var(--color-divider)] pt-3"
      >
        <SuggestionRows
          heading={t('suggest.followUpHeading')}
          testId="acp-chat-post-turn-suggestion-rows"
          centered={false}
          items={postTurnSuggestionsHeld}
          labelFor={(suggestion) =>
            t(`suggest.${suggestion.kind}.label`, suggestion.params)
          }
          onSelect={onChooseSuggestion}
        />
      </Surface>
    </>
  );
}
