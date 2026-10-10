import type { ReactNode } from 'react';
import { ArrowUp, History, Square, SquarePen } from 'lucide-react';

import { modeCopyKey } from '@/features/acp-session';
import { badgeClass } from '@/shared/ui/badge-class';
import { cn } from '@/shared/lib/cn';
import { Chip, IconButton, Select } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Tooltip, TooltipProvider } from '@/shared/ui/tooltip';

import { composerStatusLive, workingShimmer } from '../working-ink';
import { PICKER_MAX_WIDTH_CLASS, PICKER_MIN_WIDTH_CLASS } from './constants';
import type { ChatT, FooterStatus, SessionState } from './types';

export function ChoicesRow({ t, choices, busy, toolIsPicker, onChooseMode }: {
  t: ChatT;
  choices: SessionState['choices'];
  busy: boolean;
  toolIsPicker: boolean;
  onChooseMode: (modeId: string) => void;
}) {
  if (choices.models.length === 0 && choices.modes.length === 0) return null;
  return (
    <div
      data-testid="acp-chat-choices"
      className={cn(
        'min-w-0 items-center gap-0.5',
        busy
          ? toolIsPicker
            ? 'hidden @min-[464px]/composer:flex'
            : 'hidden @min-[308px]/composer:flex'
          : 'flex',
      )}
    >
      {choices.modes.length > 0 ? (
        <Select
          ariaLabel={t('mode')}
          size="sm"
          value={choices.currentModeId ?? ''}
          placeholder={t('mode')}
          onChange={onChooseMode}
          options={choices.modes.map((mode) => {
            const unverified = choices.unverifiedModeIds.includes(mode.id);

            const copyKey = modeCopyKey(mode.id);
            const name = copyKey ? t(`modeName.${copyKey}`) : mode.name;
            const hint = copyKey ? t(`modeHint.${copyKey}`) : undefined;
            return {
              value: mode.id,
              label: unverified ? t('modeUnverified', { name }) : name,
              description: unverified
                ? [hint, t('modeUnverifiedHint')].filter(Boolean).join(' ')
                : hint,
            };
          })}
          data-testid="acp-chat-mode"
          quiet

          className={cn(PICKER_MIN_WIDTH_CLASS, PICKER_MAX_WIDTH_CLASS, 'shrink-0')}
        />
      ) : null}
    </div>
  );
}

interface ComposerFooterProps {
  t: ChatT;
  runtimeLabel: string;
  contextLabel: string | null;
  toolPicker: Array<{ value: string; label: string }>;
  toolIsPicker: boolean;
  toolPickerValue: string;
  onPickTool: (value: string) => void;
  choicesRow: ReactNode;
  busy: boolean;
  connecting: boolean;
  footerStatus: FooterStatus;
  displayStatus: FooterStatus;
  turnSilent: boolean;
  turnElapsedLabel: string | null;
  hasHistory: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  sessionButtonStandDown: string | undefined;
  onNewChat: () => void;
  onStop: () => void;
  onStopConnecting: () => void;
  sendDisabled: boolean;
  onSend: () => void;
}

export function ComposerFooter({
  t,
  runtimeLabel,
  contextLabel,
  toolPicker,
  toolIsPicker,
  toolPickerValue,
  onPickTool,
  choicesRow,
  busy,
  connecting,
  footerStatus,
  displayStatus,
  turnSilent,
  turnElapsedLabel,
  hasHistory,
  historyOpen,
  onToggleHistory,
  sessionButtonStandDown,
  onNewChat,
  onStop,
  onStopConnecting,
  sendDisabled,
  onSend,
}: ComposerFooterProps) {
  return (
    <div
      data-testid="acp-chat-footer"
      className="mt-2 flex min-w-0 items-center gap-1"
    >

      <span
        data-testid="acp-chat-pickers"
        className="-m-0.5 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden p-0.5"
      >

        {toolIsPicker ? (

          <Select
            ariaLabel={t('runtimePicker')}
            size="sm"
            value={toolPickerValue}
            placeholder={runtimeLabel}
            onChange={onPickTool}
            options={toolPicker}
            data-testid="acp-chat-runtime"
            quiet

            className={cn(
              PICKER_MIN_WIDTH_CLASS,
              PICKER_MAX_WIDTH_CLASS,
              'shrink-[99]',
              busy ? 'hidden @min-[368px]/composer:block' : 'hidden @min-[320px]/composer:block',
            )}
          />
        ) : (

          <span
            data-testid="acp-chat-runtime-label"
            className="hidden min-w-0 shrink-[99] truncate text-label leading-label text-[color:var(--color-text-tertiary)] @min-[286px]/composer:inline"
          >
            {toolPicker[0]?.label ?? runtimeLabel}
          </span>
        )}
        {contextLabel ? (
          <span
            data-testid="acp-chat-context"
            className={badgeClass({
              shape: 'micro',
              className: 'min-w-0 shrink truncate bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {contextLabel}
          </span>
        ) : null}
        {choicesRow}
      </span>
      <span
        data-testid="acp-chat-session-actions"
        className="flex min-w-0 items-center gap-1"
      >

        <span
          data-acp-status-badge={footerStatus}
          aria-live="polite"

          className="flex min-w-0 items-center gap-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
        >

          <span
            data-testid="acp-status-words"
            className={cn('min-w-0 truncate', workingShimmer(composerStatusLive(footerStatus, turnSilent)))}
          >

            {t(`status.${footerStatus}`)}
            {turnElapsedLabel ? <> <span data-testid="acp-turn-elapsed" className="tabular-nums">· {turnElapsedLabel}</span></> : null}
          </span>
        </span>
        <TooltipProvider delayDuration={200}>

          {hasHistory ? (
            <Tooltip content={t('history')} withProvider={false} side="top">
              <IconButton
                className={sessionButtonStandDown}
                size="lg"
                label={t('history')}
                data-testid="acp-chat-history"
                aria-expanded={historyOpen}
                onClick={onToggleHistory}
              >
                <History size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip
            content={displayStatus === 'starting' ? t('newChatWhenReady') : t('newChat')}
            withProvider={false}
            side="top"
          >

            <IconButton
              className={cn('atlas-touch-floor atlas-touch-floor-wide', sessionButtonStandDown)}
              size="lg"
              label={t('newChat')}
              data-testid="acp-chat-new"
              disabled={displayStatus === 'starting'}
              onClick={onNewChat}
            >
              <SquarePen size={ICON_SIZE.md} aria-hidden />
            </IconButton>
          </Tooltip>
        </TooltipProvider>
        <span data-testid="acp-chat-send-group" className="flex shrink-0 items-center gap-1">
        {busy ? (
          <Chip size="md" tone="secondary" data-testid="acp-chat-stop" onClick={onStop}>
            <Square size={ICON_SIZE.sm} aria-hidden />
            {t('stop')}
          </Chip>
        ) : connecting ? (

          <Chip size="md" tone="secondary" data-testid="acp-chat-stop-connecting" onClick={onStopConnecting}>
            <Square size={ICON_SIZE.sm} aria-hidden />
            {t('stop')}
          </Chip>
        ) : null}

        <Tooltip
          content={displayStatus === 'starting' || displayStatus === 'stopped' ? t('sendWhenReady') : t('send')}
          side="top"
        >
          <button
            type="button"
            aria-label={t('send')}
            data-testid="acp-chat-send"
            disabled={sendDisabled}
            onClick={onSend}
            className={controlClass({

              shape: 'pill',
              size: 'md',
              tone: 'onAccent',
              className: 'w-8 justify-center px-0',
            })}
          >
            <ArrowUp size={ICON_SIZE.md} aria-hidden />
          </button>
        </Tooltip>
        </span>
      </span>
    </div>
  );
}
