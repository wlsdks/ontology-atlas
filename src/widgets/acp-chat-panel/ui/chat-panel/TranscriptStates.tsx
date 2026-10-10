import { RotateCcw } from 'lucide-react';

import type { ChatSuggestion } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';
import { BrandWaitingMark } from '@/shared/ui/brand-waiting-mark';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { RETRY_CHIP_CLASS } from './constants';
import { StartingSuggestionPreview, SuggestionRows } from './SuggestionRows';
import type { ChatT, SessionState } from './types';

export function StartingState({ t, download, suggestions, seatedRequestWaiting }: {
  t: ChatT;
  download: SessionState['download'];
  suggestions: readonly ChatSuggestion[];
  seatedRequestWaiting: boolean;
}) {
  return (
    <div
      data-testid="acp-starting"
      role="status"
      aria-live="polite"
      className="agent-panel-stage-swap m-auto grid w-full max-w-[40ch] justify-items-center gap-2 text-center"
    >
      <BrandWaitingMark active />
      <p className="break-keep text-body leading-prose text-[color:var(--color-text-secondary)]">
        {t(download ? 'firstRun.title' : 'starting.title')}
      </p>
      <p className="break-keep text-label leading-prose text-[color:var(--color-text-quaternary)]">
        {t(download ? 'firstRun.body' : 'starting.body')}
      </p>

      {download?.mb != null ? (
        <p
          data-testid="acp-first-run-progress"
          className="text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {t('firstRun.progress', { mb: download.mb })}
        </p>
      ) : null}

      {suggestions.length > 0 && !download && !seatedRequestWaiting ? (
        <div className="agent-panel-stage-swap mt-5 w-full justify-self-stretch">
          <StartingSuggestionPreview
            heading={t('startingSuggestions')}
            items={suggestions}
            labelFor={(suggestion) =>
              t(`suggest.${suggestion.kind}.label`, suggestion.params)
            }
          />
        </div>
      ) : null}
    </div>
  );
}

export function ConnectStoppedState({ t, onConnectAgain }: { t: ChatT; onConnectAgain: () => void }) {
  return (
    <div
      data-testid="acp-connect-stopped"
      role="status"
      aria-live="polite"
      className="agent-panel-stage-swap m-auto grid w-full max-w-[40ch] justify-items-center gap-2 text-center"
    >
      <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
        {t('connectStopped.title')}
      </p>
      <p className="text-label leading-prose text-[color:var(--color-text-quaternary)]">
        {t('connectStopped.body')}
      </p>
      <Chip
        size="lg"
        tone="accentOnTint"
        data-testid="acp-connect-again"
        onClick={onConnectAgain}
        className={cn(RETRY_CHIP_CLASS, 'mt-3')}
      >
        <RotateCcw size={ICON_SIZE.md} aria-hidden />
        {t('connectStopped.again')}
      </Chip>
    </div>
  );
}

export function EmptyState({ t, seatedRequestWaiting, suggestions, onChoose }: {
  t: ChatT;
  seatedRequestWaiting: boolean;
  suggestions: readonly ChatSuggestion[];
  onChoose: (suggestion: ChatSuggestion) => void;
}) {
  return (
    <div className="agent-panel-stage-swap m-auto grid max-w-[34ch] gap-3">
      <p
        data-testid="acp-chat-empty"
        data-acp-empty={seatedRequestWaiting ? 'seated' : 'open'}
        className="break-keep text-center text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t(seatedRequestWaiting ? 'emptySeatedHint' : 'emptyHint')}
      </p>

      {suggestions.length > 0 && !seatedRequestWaiting ? (
        <SuggestionRows
          heading={t('suggest.heading')}
          testId="acp-chat-suggestions"
          centered
          items={suggestions}
          labelFor={(suggestion) =>
            t(`suggest.${suggestion.kind}.label`, suggestion.params)
          }
          onSelect={onChoose}
        />
      ) : null}
    </div>
  );
}
