'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useDismissibleMenu } from '@/shared/lib/overlays/use-dismissible-menu';
import { writeFilePulseRead, writeLoadRead, writeSessionListRead, writeSessionNamesRead } from '@/shared/lib/preferences/work-status-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { Surface } from '@/shared/ui/surfaces/surface';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';
import type { SessionListLine } from '../model/session-list-line';

const LIST_COMMAND = 'claude agents --json';
const NOW_CLASS = 'text-body leading-body text-[color:var(--color-text-primary)]';
const ABOUT_CLASS = 'text-body leading-body text-[color:var(--color-text-tertiary)]';
const DOT_CLASS: Record<Exclude<SessionListLine['kind'], 'hidden'>, string> = {
  on: 'bg-[color:var(--color-text-secondary)]',
  off: 'border border-[color:var(--color-text-tertiary)]',
  unreadable: 'bg-[color:var(--color-status-warning)]',
};

/** Which of the round's reads the person leaves on. */
export interface ReadChoices {
  names: boolean;
  pulse: boolean;
  load: boolean;
}

/** One read: its name and switch, then what it does now and what it reads and never reads. */
function ReadRow({ id, label, switchLabel, on, onChange, children }: {
  id: string;
  label: string;
  switchLabel: string;
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations('workStatus.sessions');
  return (
    <section className="flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-3" data-testid={`work-status-read-${id}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{label}</h3>
        <SegmentedControl
          ariaLabel={switchLabel}
          testId={`work-status-${id}-switch`}
          size="md"
          value={on}
          onChange={onChange}
          options={[
            { value: true, label: t('choice.on') },
            { value: false, label: t('choice.off') },
          ]}
        />
      </div>
      {children}
    </section>
  );
}

/**
 * What Work status reads on this Mac, opened from the session-list words in the header: the
 * session list, session names, file changes and load, each with the switch that stops it and the
 * words that let the person judge it before leaving it on. Nothing shows where the system has no
 * session list.
 */
export function WorkStatusReads({ line, choices }: { line: SessionListLine; choices: ReadChoices }) {
  const t = useTranslations('workStatus');
  const s = useTranslations('workStatus.sessions');
  const tools = useTranslations('workStatus.tool');
  const { open, setOpen, ref } = useDismissibleMenu();
  const triggerId = useId();
  const panelId = useId();
  if (line.kind === 'hidden') return null;

  const tool = tools('claudeCode');
  const command = (chunks: React.ReactNode) => <code className="whitespace-nowrap font-mono text-[color:var(--color-text-secondary)]">{chunks}</code>;
  const listOn = line.kind !== 'off';
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
        {s(`chip.${line.kind}`)}
      </button>
      <Surface
        open={open}
        motion="overlay"
        as="section"
        id={panelId}
        aria-labelledby={`${panelId}-title`}
        data-testid="work-status-session-list-panel"
        {...transientSurface('anchored')}
        className="absolute left-0 top-full z-[var(--z-dialog)] mt-2 flex max-h-[calc(100vh-8rem)] w-[min(26rem,calc(100vw-2.5rem))] flex-col gap-3 overflow-y-auto rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-2)]"
      >
        <h2 id={`${panelId}-title`} className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t('reads.title')}</h2>
        <ReadRow id="session-list" label={s('title', { tool })} switchLabel={s('switch', { tool })} on={listOn} onChange={writeSessionListRead}>
          {line.kind === 'off' ? (
            <p data-testid="work-status-session-list-now" className={NOW_CLASS}>{s('off', { tool })}</p>
          ) : line.kind === 'unreadable' ? (
            <div role="status" data-testid="work-status-session-list-now" className="flex flex-col gap-1">
              <p className="text-body leading-body text-[color:var(--color-status-warning)]">{s('unreadable', { tool, reason: s(`reason.${line.reason}`, { tool }) })}</p>
              <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{s('fallback')}</p>
            </div>
          ) : line.now ? (
            <p data-testid="work-status-session-list-now" className={NOW_CLASS}>{s(`now.${line.now}`, { tool })}</p>
          ) : null}
          <p className={ABOUT_CLASS}>{s.rich(line.kind === 'off' ? 'statusOff' : 'status', { tool, command: LIST_COMMAND, code: command })}</p>
        </ReadRow>
        <ReadRow id="names" label={t('names.switch')} switchLabel={t('names.switch')} on={choices.names} onChange={writeSessionNamesRead}>
          <p data-testid="work-status-names-now" className={ABOUT_CLASS}>
            {!listOn ? t('names.needsList') : choices.names ? t('names.status', { tool }) : t('names.off', { example: t('session.name', { tool, number: 1 }) })}
          </p>
        </ReadRow>
        <ReadRow id="pulse" label={t('pulse.switch')} switchLabel={t('pulse.switch')} on={choices.pulse} onChange={writeFilePulseRead}>
          <p data-testid="work-status-pulse-now" className={ABOUT_CLASS}>{choices.pulse ? t('pulse.status') : t('pulse.off')}</p>
        </ReadRow>
        <ReadRow id="load" label={t('load.switch')} switchLabel={t('load.switch')} on={choices.load} onChange={writeLoadRead}>
          <p data-testid="work-status-load-now" className={ABOUT_CLASS}>{choices.load ? t('load.status') : t('load.off')}</p>
        </ReadRow>
      </Surface>
    </div>
  );
}
