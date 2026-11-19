import type { ReactNode } from 'react';
import { RotateCcw, Undo2 } from 'lucide-react';

import { isPressableSuggestion, type ChatSuggestion } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Chip } from '@/shared/ui';
import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { RETRY_CHIP_CLASS } from './constants';
import { StartingSuggestionPreview, SuggestionRows } from './SuggestionRows';
import type { ChatT, SessionState } from './types';

type StartStepState = 'done' | 'current' | 'ahead';

const STEP_DOT_CLASS: Record<StartStepState, string> = {
  done: 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-accent)]',
  current: 'border-[color:var(--color-indigo-accent)]',
  ahead: 'border-[color:var(--color-border-strong)]',
};

const STEP_INK_CLASS: Record<StartStepState, string> = {
  done: 'text-[color:var(--color-text-secondary)]',
  current: 'text-[color:var(--color-text-primary)]',
  ahead: 'text-[color:var(--color-text-tertiary)]',
};

function StartStep({ state, label, testId, children }: {
  state: StartStepState;
  label: string;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <li data-testid={testId} data-step-state={state} aria-current={state === 'current' ? 'step' : undefined} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2">
      <span aria-hidden className={cn('size-2.5 translate-y-px self-center rounded-full border', STEP_DOT_CLASS[state])} />
      <span className={cn('min-w-0 truncate text-label leading-label', STEP_INK_CLASS[state])}>{label}</span>
      {children ? <div className="col-start-2 grid min-w-0 gap-1.5">{children}</div> : null}
    </li>
  );
}

function WaitingRequest({ t, lead, testId, onTakeBack }: {
  t: ChatT;
  lead: string;
  testId: string;
  onTakeBack?: () => void;
}) {
  return (
    <div data-testid={testId} className="flex min-h-[var(--control-h-md)] min-w-0 items-center gap-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] py-1 pl-2.5 pr-1">
      <span className="min-w-0 flex-1 truncate text-body leading-body text-[color:var(--color-text-primary)]">{lead}</span>
      {onTakeBack ? (
        <Chip size="sm" tone="secondary" data-testid="acp-starting-take-back" aria-label={t('starting.takeBackLabel')} onClick={onTakeBack} className="shrink-0">
          <Undo2 size={ICON_SIZE.sm} aria-hidden />
          {t('starting.takeBack')}
        </Chip>
      ) : null}
    </div>
  );
}

/**
 * The agent on its way: a first-run download is its own stage with a bar and the megabytes on
 * disk, never a percentage, since the total is unknown. Under it, the order of what happens, and
 * any request that waits for the session, so a press is never lost from sight.
 */
export function StartingState({ t, download, suggestions, seatedRequestWaiting, openingLead, heldLead, onTakeBack }: {
  t: ChatT;
  download: SessionState['download'];
  suggestions: readonly ChatSuggestion[];
  seatedRequestWaiting: boolean;
  /** The lead of an opening request a button started, while it waits for the session. */
  openingLead: string | null;
  /** The lead of the request the person pressed while the agent was starting. */
  heldLead: string | null;
  onTakeBack: () => void;
}) {
  const downloading = download !== null;
  const requestWaiting = openingLead !== null || heldLead !== null;
  return (
    <div
      data-testid="acp-starting"
      data-starting-stage={downloading ? 'download' : 'connect'}
      className="agent-panel-stage-swap m-auto grid w-full max-w-[22rem] justify-items-center text-center"
    >
      <BrandWaitingMark active motion="connect" />
      <div className="mt-2 grid w-full justify-items-center gap-1">
        <p role="status" aria-live="polite" className="break-keep text-body-lg font-[var(--font-weight-emphasis)] leading-body-lg text-[color:var(--color-text-primary)]">
          {t(downloading ? 'firstRun.title' : 'starting.title')}
        </p>
        {downloading ? (
          <div className="mt-2 grid w-full gap-1.5">
            <WorkProgress phase="running" done={0} total={null} label={t('firstRun.barLabel')} />
            {download.mb != null ? (
              <p data-testid="acp-first-run-progress" className="text-label leading-label tabular-nums text-[color:var(--color-text-secondary)]">
                {t('firstRun.progress', { mb: download.mb })}
              </p>
            ) : (
              <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('firstRun.waiting')}</p>
            )}
          </div>
        ) : null}
        <p className="break-keep text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {t(downloading ? 'firstRun.body' : 'starting.body')}
        </p>
      </div>

      <ol aria-label={t('starting.stepsLabel')} className="mt-5 grid w-full gap-2.5 text-left">
        {downloading ? <StartStep testId="acp-starting-step-download" state="current" label={t('starting.step.download')} /> : null}
        <StartStep testId="acp-starting-step-connect" state={downloading ? 'ahead' : 'current'} label={t('starting.step.connect')} />
        <StartStep testId="acp-starting-step-send" state="ahead" label={t(requestWaiting ? 'starting.step.sendWaiting' : 'starting.step.send')}>
          {openingLead !== null ? <WaitingRequest t={t} lead={openingLead} testId="acp-starting-opening" /> : null}
          {heldLead !== null ? <WaitingRequest t={t} lead={heldLead} testId="acp-starting-held" onTakeBack={onTakeBack} /> : null}
        </StartStep>
      </ol>

      {suggestions.some(isPressableSuggestion) && !downloading && !seatedRequestWaiting && !requestWaiting ? (
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
        tone="accent"
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

export function EmptyState({ t, seatedRequestWaiting, suggestions, canSend, providerNote, onChoose, onDone, onEscape }: {
  t: ChatT;
  seatedRequestWaiting: boolean;
  suggestions: readonly ChatSuggestion[];
  canSend: boolean;
  /** Said before a first send: what the agent reads leaves this computer. */
  providerNote: string;
  onChoose: (suggestion: ChatSuggestion) => void;
  onDone: () => void;
  onEscape: () => void;
}) {
  const showSteps = suggestions.length > 0 && !seatedRequestWaiting;
  return (
    <div className={cn('agent-panel-stage-swap m-auto grid gap-3', showSteps ? 'w-full max-w-[44ch]' : 'max-w-[34ch]')}>
      <p
        data-testid="acp-chat-empty"
        data-acp-empty={seatedRequestWaiting ? 'seated' : 'open'}
        className="break-keep text-center text-label leading-prose text-[color:var(--color-text-quaternary)]"
      >
        {t(seatedRequestWaiting ? 'emptySeatedHint' : 'emptyHint')}
      </p>

      {showSteps ? (
        <SuggestionRows
          t={t}
          heading={t('suggest.heading')}
          testId="acp-chat-suggestions"
          centered
          items={suggestions}
          canSend={canSend}
          onSelect={onChoose}
          onDone={onDone}
          onEscape={onEscape}
        />
      ) : null}
      <p
        data-testid="acp-chat-provider-note"
        className="break-keep text-center text-caption leading-caption text-[color:var(--color-text-tertiary)]"
      >
        {providerNote}
      </p>
    </div>
  );
}
