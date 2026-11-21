'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Bot } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';
import { Chip } from '@/shared/ui/controls/controls';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { BellTodo } from '../../model/bell-inbox';
import { problemSummary } from '../../model/inbox-row-copy';
import { MAP_TIDY_LIST_HREF, ROW_HEADLINE_CLASS, RowMark } from './inbox-row-parts';

export function TodoRow({
  todo,
  onOpenConversation,
  onClose,
}: {
  todo: BellTodo;
  onOpenConversation?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations('agentActivity');

  if (todo.kind === 'permission-ask') {
    const agent = agentDisplayName(todo.agent) ?? todo.agent;
    return (
      <li
        data-testid="agent-inbox-todo-row"
        data-todo-kind="permission-ask"
        className="atlas-touch-floor flex items-center gap-2 px-1 py-1.5"
      >
        <RowMark>
          <Bot size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        </RowMark>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={ROW_HEADLINE_CLASS}>
            <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
              {agent ? t('askSentence', { agent }) : t('askSentenceUnknown')}
            </span>
          </span>
          {/* The person's own request, or the tool if the request is not known — never a path. */}
          <span className="truncate text-caption text-[color:var(--color-text-tertiary)]">
            {todo.summary ?? todo.tool ?? ''}
          </span>
        </span>
        {onOpenConversation ? (
          <Chip
            size="sm"
            tone="accent"
            hoverInk="strong"
            hoverSurface="lift"
            aria-label={t('askDoorAria')}
            data-testid="agent-inbox-ask-door"
            onClick={() => {
              onOpenConversation();
              onClose?.();
            }}
            /*
             * `atlas-touch-floor`: the control ramp promotes on `pointer: coarse` while the rows use
             * `any-pointer: coarse`, so this door would stay 28px beside 44px rows.
             */
            className="atlas-touch-floor shrink-0"
          >
            {t('askDoor')}
          </Chip>
        ) : null}
      </li>
    );
  }

  return (
    <li
      data-testid="agent-inbox-todo-row"
      data-todo-kind="folder-problem"
      className="atlas-touch-floor flex items-center gap-2 px-1 py-1.5"
    >
      <RowMark>
        <AlertTriangle
          size={ICON_SIZE.sm}
          aria-hidden
          className="text-[color:var(--color-status-warning)]"
        />
      </RowMark>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={ROW_HEADLINE_CLASS}>
          <span className="min-w-0 truncate text-label text-[color:var(--color-text-primary)]">
            {t('problemSentence')}
          </span>
        </span>
        <span className="truncate text-caption text-[color:var(--color-text-tertiary)]">
          {problemSummary(t, todo.problems)}
        </span>
      </span>
      <Link
        href={MAP_TIDY_LIST_HREF}
        aria-label={t('problemDoorAria')}
        data-testid="agent-inbox-problem-door"
        onClick={() => onClose?.()}
        className={controlClass({ shape: 'chip', size: 'sm', className: 'shrink-0' })}
      >
        {t('problemDoor')}
      </Link>
    </li>
  );
}
