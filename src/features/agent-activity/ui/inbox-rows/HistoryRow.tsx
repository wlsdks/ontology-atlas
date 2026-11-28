import { useTranslations } from 'use-intl';

import { Link } from '@/i18n/navigation';
import { buildTopologyFocusHref } from '@/entities/project';
import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import type { BellHistoryRow } from '../../model/bell-inbox';
import {
  HISTORY_LABEL_KEY,
  decisionKey,
  formatInboxDuration,
  problemSummary,
  writeSentence,
} from '../../model/inbox-row-copy';
import { ROW_HEADLINE_CLASS, RowMark } from './inbox-row-primitives';

/**
 * Control mark, not the panel's indigo: indigo means this needs you, and a settled timeline needs
 * nobody. Ink is `secondary` like the results tab; a quiet-link underline marks that the word
 * presses.
 */
const HISTORY_OBJECT_CLASS = controlClass({
  shape: 'link',
  tone: 'secondary',
  truncate: true,
  hoverInk: 'strong',
  className:
    'min-w-0 underline decoration-[color:var(--color-indigo-line-a32)] underline-offset-2 hover:decoration-[color:var(--color-indigo-accent)]',
});

export function HistoryRow({
  row,
  age,
  onOpenNode,
  onClose,
}: {
  row: BellHistoryRow;
  age: string;
  onOpenNode?: (slug: string) => void;
  onClose?: () => void;
}) {
  const t = useTranslations('agentActivity');
  const problem = row.kind === 'vault-problem';
  const agent = row.agent ? (agentDisplayName(row.agent) ?? row.agent) : null;
  const duration = row.durationMs === null ? null : formatInboxDuration(t, row.durationMs);
  const sentence =
    row.kind === 'task-end'
      ? writeSentence(t, row.counts)
      : row.kind === 'human-decision'
        ? t(decisionKey(row))
        : t(HISTORY_LABEL_KEY[row.kind]);

  const detail = (() => {
    if (row.problems) return problemSummary(t, row.problems);
    if (row.childCount) return t('bridgeChildren', { count: row.childCount });
    return row.label ?? '';
  })();

  /*
   * **Two lines, always** — with a target or without, with details or without. A row whose
   * height follows its copy length destroys the list's grid (`design.md`, dimensional
   * regularity), and the mark column keeps the sentence on the same x as the other tabs.
   */
  return (
    <li
      data-testid="agent-inbox-history-row"
      data-kind={row.kind}
      className="atlas-touch-floor flex gap-2 px-1 py-1.5"
    >
      <RowMark />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={ROW_HEADLINE_CLASS}>
          <span
            className={cn(
              'min-w-0 truncate text-label',
              problem
                ? 'text-[color:var(--color-status-warning)]'
                : 'text-[color:var(--color-text-primary)]',
            )}
          >
            {sentence}
          </span>
          {row.node ? (
            onOpenNode ? (
              <button
                type="button"
                onClick={() => {
                  onOpenNode(row.node!.slug);
                  onClose?.();
                }}
                title={row.node.slug}
                aria-label={t('openOnMap', { name: row.node.name })}
                className={HISTORY_OBJECT_CLASS}
              >
                {row.node.name}
              </button>
            ) : (
              <Link
                href={buildTopologyFocusHref(row.node.slug)}
                title={row.node.slug}
                aria-label={t('openOnMap', { name: row.node.name })}
                className={HISTORY_OBJECT_CLASS}
              >
                {row.node.name}
              </Link>
            )
          ) : null}
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5 text-caption text-[color:var(--color-text-quaternary)]">
          {agent ? <span className="shrink-0">{agent}</span> : null}
          {agent && (detail || duration) ? <span aria-hidden>·</span> : null}
          {detail ? <span className="min-w-0 truncate">{detail}</span> : null}
          {detail && duration ? <span aria-hidden>·</span> : null}
          {duration ? (
            <span title={t('durationTitle')} className="shrink-0 tabular-nums">
              {duration}
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="shrink-0">{age}</span>
        </span>
      </span>
    </li>
  );
}
