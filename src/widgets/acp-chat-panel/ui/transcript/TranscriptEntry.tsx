import { memo } from 'react';
import type { Components } from 'react-markdown';
import { useTranslations } from 'next-intl';

import {
  readToolFallbackTarget,
  readToolOutcome,
  readToolPathArgument,
  readToolTargets,
  VAULT_MCP_SERVER_NAME,
  type AcpEvent,
} from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { useTypewriterReveal } from '@/shared/lib/use-typewriter-reveal';
import { Chip, Disclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

import { splitAppRequest } from '../request-parts';
import { isVaultTool, labelWithoutRepeatedPath, toolLabel, withKindFallback } from '../tool-label';
import { toolRowPhase, workingShimmer } from '../working-ink';
import { ChatMarkdown } from '../chat-markdown/ChatMarkdown';
import { CHAT_MARKDOWN, WORK_MARKDOWN } from './markdown-classes';

export const TranscriptEntry = memo(function TranscriptEntry({
  event,
  knownSlugs,
  onHoverSlug,
  markdownComponents,
  noticeActions = null,
  streaming = false,
  repeat = 1,
  fold = null,
  live,
  awaiting,
  declined,
}: {
  event: AcpEvent;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
  markdownComponents: Components;

  live: boolean;

  awaiting: boolean;

  declined: boolean;

  noticeActions?: { openPage: (path: string) => void; askNext: () => void } | null;

  streaming?: boolean;

  repeat?: number;

  fold?: { line: string; doorLabel: string; onOpen: () => void } | null;
}) {
  const t = useTranslations('acpChat');

  const revealedText = useTypewriterReveal(
    event.kind === 'agent' ? event.text : '',
    streaming,
  );

  if (event.kind === 'user') {

    const parts = splitAppRequest(event.text);
    return (
      <>
        <p
          data-acp-entry="user"
          data-user-request={parts.detail ? 'app-composed' : 'typed'}
          className="mt-1 max-w-[85%] self-end whitespace-pre-wrap break-keep rounded-card border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] px-3 py-2 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]"
        >
          {parts.lead}
        </p>

        {parts.detail ? (
          <Disclosure
            className="mt-1 max-w-[85%] self-end"
            summaryTestId="acp-chat-request-full"
            summary={t('fullRequest')}
          >
            <p className="mt-1.5 whitespace-pre-wrap break-words text-left font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {event.text}
            </p>
          </Disclosure>
        ) : null}
      </>
    );
  }
  if (event.kind === 'agent') {

    if (fold) {

      return (
        <div data-acp-entry="agent" data-acp-folded="answer" className="flex flex-col items-start gap-1.5">
          <p className="break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
            {fold.line}
          </p>
          <Chip data-testid="acp-chat-answer-door" onClick={fold.onOpen} tone="secondary" hoverInk="strong">
            {fold.doorLabel}
          </Chip>
          <Disclosure
            className="mt-0.5 self-stretch"
            summaryTestId="acp-chat-answer-full"
            summary={t('checkAnswerFull')}
          >
            <div className={CHAT_MARKDOWN}>
              <ChatMarkdown text={event.text} components={markdownComponents} />
            </div>
          </Disclosure>
        </div>
      );
    }
    return (
      <div data-acp-entry="agent" data-acp-streaming={streaming ? 'true' : undefined} className={CHAT_MARKDOWN}>
        <ChatMarkdown text={revealedText} components={markdownComponents} />
      </div>
    );
  }
  if (event.kind === 'thought') {
    return (
      <div data-acp-entry="thought" className={WORK_MARKDOWN}>
        <ChatMarkdown text={event.text} components={markdownComponents} />
      </div>
    );
  }
  if (event.kind === 'tool') {

    const rawLabel = withKindFallback(
      toolLabel(event.title, VAULT_MCP_SERVER_NAME),
      event.title,
      VAULT_MCP_SERVER_NAME,
      event.toolKind,
    );
    const read = readToolOutcome(
      event.rawOutput,
      event.status,
      isVaultTool(event.title, VAULT_MCP_SERVER_NAME),
      live,
    );

    const outcome = declined && read.kind === 'status' && read.status !== 'done'
      ? ({ kind: 'status', status: 'declined' } as const)
      : read;
    const running = outcome.kind === 'status' && outcome.status === 'running';
    const phase = toolRowPhase(running, awaiting);
    const broke =
      outcome.kind === 'status' && (outcome.status === 'failed' || outcome.status === 'cancelled');
    const toolTargets = knownSlugs ? readToolTargets(event.rawInput, knownSlugs) : [];

    const fallbackTarget = toolTargets.length === 0 ? readToolFallbackTarget(event.rawInput) : null;

    const label = fallbackTarget?.kind === 'path'
      ? labelWithoutRepeatedPath(rawLabel, readToolPathArgument(event.rawInput))
      : rawLabel;
    return (
      <p
        data-acp-entry="tool"
        data-tool-kind={event.toolKind}
        data-tool-status={event.status}
        data-tool-label={label.kind}
        data-tool-outcome={outcome.kind === 'count' ? String(outcome.count) : outcome.status}
        data-tool-repeat={repeat > 1 ? repeat : undefined}
        data-tool-phase={phase}

        className={cn(
          'flex items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]',
          broke && '-ml-[9px] border-l border-[color:var(--color-danger-a50)] pl-2',
        )}
      >
        {running ? (
          <span
            aria-hidden
            data-tool-running
            className="size-1.5 shrink-0 rounded-full border border-[color:var(--color-indigo-accent)]"
          />
        ) : null}

        <span
          data-tool-label-text
          className={cn('min-w-0 max-w-[45%] shrink truncate', workingShimmer(phase === 'running'))}
        >
          {label.kind === 'known'
            ? t(`tool.${label.text}`)
            : label.kind === 'kind'
              ? t(`toolKind.${label.text}`)
              : label.text}
        </span>

        {repeat > 1 ? (
          <span
            data-testid="acp-chat-tool-repeat"
            aria-label={t('toolRepeat', { count: repeat })}
            className="shrink-0 tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {`×${repeat}`}
          </span>
        ) : null}

        {toolTargets.length > 0 ? (
          <span className="min-w-0 flex-1 truncate">
            {toolTargets.map((slug, i) => (
              <span key={slug}>
                {i === 0 ? ' · ' : ', '}
                <span
                  data-testid="acp-chat-slug"
                  data-slug={slug}
                  className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
                  onPointerEnter={() => onHoverSlug?.(slug)}
                  onPointerLeave={() => onHoverSlug?.(null)}
                >
                  {slug}
                </span>
              </span>
            ))}
          </span>
        ) : null}
        {fallbackTarget ? (
          <span
            data-testid="acp-chat-tool-target"
            data-tool-target={fallbackTarget.kind}
            className="min-w-0 flex-1 truncate"
          >
            {` · ${fallbackTarget.frame ? `${fallbackTarget.frame}: ` : ''}${fallbackTarget.value}`}
          </span>
        ) : null}

        <span
          data-testid="acp-chat-tool-outcome"
          className={cn(
            'ml-auto shrink-0 tabular-nums',
            broke && 'font-[var(--font-weight-emphasis)]',
            workingShimmer(phase === 'running'),
          )}
        >
          {outcome.kind === 'count' ? (
            outcome.count === 0 ? (
              t('toolOutcome.foundNone')
            ) : (
              <>
                <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                  {outcome.count}
                </span>
                {t('toolOutcome.foundUnit')}
              </>
            )
          ) : phase === 'awaiting' ? (
            t('status.awaiting')
          ) : (
            t(`toolOutcome.${outcome.status}`)
          )}
        </span>
      </p>
    );
  }

  return (
    <p
      data-acp-entry="notice"
      data-notice={event.text}
      className="break-keep rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-label leading-prose text-[color:var(--color-text-secondary)]"
    >
      {event.text === 'mode-moved'
        ? t(event.serverGate ? 'notice.modeMovedServerGate' : 'notice.modeMoved', {
            mode: event.mode ?? '',
          })
        : event.text === 'auto-allowed'
          ? t('notice.autoAllowed', { detail: event.detail ?? '' })
          : event.text === 'auto-refused'
            ? t('notice.autoRefused', { detail: event.detail ?? '' })
            : t(event.text === 'died-mid-turn' ? 'notice.diedMidTurn' : 'notice.gateOff')}
      {event.text === 'auto-allowed' && noticeActions && event.detail ? (
        <span className="ml-2 inline-flex flex-wrap items-center gap-x-2 align-baseline">
          <button
            type="button"
            data-testid="acp-notice-open-page"
            onClick={() => noticeActions.openPage(event.detail ?? '')}
            className={controlClass({
              shape: 'link',
              size: 'sm',
              tone: 'accent',
              hoverInk: 'strong',
              className: 'atlas-touch-floor atlas-touch-floor-wide',
            })}
          >
            {t('notice.openPage')}
          </button>
          <button
            type="button"
            data-testid="acp-notice-ask-next"
            onClick={noticeActions.askNext}
            className={controlClass({
              shape: 'link',
              size: 'sm',
              tone: 'muted',
              hoverInk: 'strong',
              className: 'atlas-touch-floor atlas-touch-floor-wide',
            })}
          >
            {t('notice.askNext')}
          </button>
        </span>
      ) : null}
    </p>
  );
});
