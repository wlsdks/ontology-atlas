import { RotateCcw, TriangleAlert } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { claudeLoginRepairCommand, type readAcpTrouble } from '@/features/acp-session';
import type { useAgentDoctor } from '@/features/acp-doctor';
import { Chip } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { RETRY_CHIP_CLASS } from './constants';
import type { ChatT } from './types';

interface ErrorCardProps {
  t: ChatT;
  error: string;
  diagnostics: readonly string[];
  trouble: ReturnType<typeof readAcpTrouble> | null;
  troubleHintKey: string;
  retryDisabled: boolean;
  onRetry: () => void;
  showDoctor: boolean;
  doctor: ReturnType<typeof useAgentDoctor>;
}

export function ErrorCard({
  t,
  error,
  diagnostics,
  trouble,
  troubleHintKey,
  retryDisabled,
  onRetry,
  showDoctor,
  doctor,
}: ErrorCardProps) {
  return (
    <div
      data-testid="acp-chat-error"
      data-trouble={trouble?.kind}
      role="alert"
      className="grid break-keep gap-2.5 rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] p-[var(--card-pad)]"
    >
      <div className="grid gap-1">
        <p className="flex items-start gap-1.5 text-body-lg leading-display-tight font-[var(--font-weight-emphasis)] text-[color:var(--color-status-danger)]">
          <TriangleAlert size={ICON_SIZE.md} aria-hidden className="mt-px shrink-0" />
          {t(`trouble.${trouble?.kind ?? 'unknown'}.title`)}
        </p>
        <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
          {t(troubleHintKey)}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {trouble?.kind === 'launch' ? (
          <Link
            href={DESTINATION_HREF.agents}
            data-testid="acp-chat-error-agents"
            className={controlClass({
              shape: 'chip',
              size: 'lg',
              tone: 'accentOnTint',
              hoverSurface: 'lift',
              className:
                'shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)]',
            })}
          >
            {t('trouble.launch.door')}
          </Link>
        ) : (
          <Chip
            size="lg"
            tone="accentOnTint"
            data-testid="acp-chat-error-retry"
            disabled={retryDisabled}
            onClick={onRetry}
            className={RETRY_CHIP_CLASS}
          >
            <RotateCcw size={ICON_SIZE.md} aria-hidden />
            {t('trouble.retry')}
          </Chip>
        )}

        {showDoctor ? doctor.scanButton : null}
      </div>
      {showDoctor ? <div className="min-w-0">{doctor.result}</div> : null}
      <details>
        <summary
          data-testid="acp-chat-error-details"
          className={controlClass({
            shape: 'link',
            size: 'sm',
            tone: 'muted',
            hoverInk: 'strong',
            className: 'list-none',
          })}
        >
          {t('trouble.details')}
        </summary>

        {trouble?.kind === 'auth' ? (
          <p
            data-testid="acp-chat-auth-repair"
            className="mt-1.5 whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] px-2 py-1.5 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]"
          >
            {claudeLoginRepairCommand()}
          </p>
        ) : null}
        <p className="mt-1.5 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
          {error}
        </p>
        {diagnostics.length > 0 ? (
          <>
            <p className="mt-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {t('trouble.diagnosticsLabel')}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {diagnostics.join('\n')}
            </p>
          </>
        ) : null}
      </details>
    </div>
  );
}
