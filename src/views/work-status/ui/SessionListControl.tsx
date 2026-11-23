'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useDismissibleMenu } from '@/shared/lib/overlays/use-dismissible-menu';
import { writeSessionListRead } from '@/shared/lib/preferences/work-status-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { Surface } from '@/shared/ui/surfaces/surface';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';
import type { SessionListLine } from '../model/session-list-line';

const LIST_COMMAND = 'claude agents --json';
const NOW_CLASS = 'text-body leading-body text-[color:var(--color-text-primary)]';
const DOT_CLASS: Record<Exclude<SessionListLine['kind'], 'hidden'>, string> = {
  on: 'bg-[color:var(--color-text-secondary)]',
  off: 'border border-[color:var(--color-text-tertiary)]',
  unreadable: 'bg-[color:var(--color-status-warning)]',
};

/**
 * Whether Atlas reads Claude Code's session list, said in the header, with the switch that stops
 * it. The words name the program run and how often, so the person can judge the read before
 * leaving it on.
 */
export function SessionListControl({ line }: { line: SessionListLine }) {
  const t = useTranslations('workStatus.sessions');
  const tools = useTranslations('workStatus.tool');
  const { open, setOpen, ref } = useDismissibleMenu();
  const triggerId = useId();
  const panelId = useId();
  if (line.kind === 'hidden') return null;

  const tool = tools('claudeCode');
  const command = (chunks: React.ReactNode) => <code className="whitespace-nowrap font-mono text-[color:var(--color-text-secondary)]">{chunks}</code>;
  return (
    <div ref={ref} className="relative flex flex-none items-center" data-session-list={line.kind}>
      <button
        id={triggerId}
        type="button"
        data-testid="work-status-session-list"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
        className={controlClass({
          shape: 'link',
          tone: 'muted',
          hoverInk: 'strong',
          active: open,
          className: cn('gap-1.5 text-body', line.kind === 'unreadable' && 'text-[color:var(--color-status-warning)]'),
        })}
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 flex-none rounded-full', DOT_CLASS[line.kind])} />
        {t(`chip.${line.kind}`)}
      </button>
      <Surface
        open={open}
        motion="overlay"
        as="section"
        id={panelId}
        aria-labelledby={triggerId}
        data-testid="work-status-session-list-panel"
        {...transientSurface('anchored')}
        className="absolute left-0 top-full z-[var(--z-dialog)] mt-2 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-3 rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-2)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t('title', { tool })}</h2>
          <SegmentedControl
            ariaLabel={t('switch', { tool })}
            testId="work-status-session-list-switch"
            size="md"
            value={line.kind !== 'off'}
            onChange={writeSessionListRead}
            options={[
              { value: true, label: t('choice.on') },
              { value: false, label: t('choice.off') },
            ]}
          />
        </div>
        {line.kind === 'off' ? (
          <p data-testid="work-status-session-list-now" className={NOW_CLASS}>{t('off', { tool })}</p>
        ) : line.kind === 'unreadable' ? (
          <div role="status" data-testid="work-status-session-list-now" className="flex flex-col gap-1">
            <p className="text-body leading-body text-[color:var(--color-status-warning)]">{t('unreadable', { tool, reason: t(`reason.${line.reason}`, { tool }) })}</p>
            <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('fallback')}</p>
          </div>
        ) : line.now ? (
          <p data-testid="work-status-session-list-now" className={NOW_CLASS}>{t(`now.${line.now}`, { tool })}</p>
        ) : null}
        <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t.rich(line.kind === 'off' ? 'statusOff' : 'status', { tool, command: LIST_COMMAND, code: command })}
        </p>
      </Surface>
    </div>
  );
}
