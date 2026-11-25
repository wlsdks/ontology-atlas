'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useDismissibleMenu } from '@/shared/lib/overlays/use-dismissible-menu';
import { writeFilePulseRead, writeLoadRead, writeSessionListRead, writeSessionNamesRead } from '@/shared/lib/preferences/work-status-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { IconButton } from '@/shared/ui/controls/controls';
import { Disclosure } from '@/shared/ui/controls/disclosure';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { Surface } from '@/shared/ui/surfaces/surface';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';
import type { SessionListLine } from '../model/session-list-line';

const LIST_COMMAND = 'claude agents --json';
const CAPTION_CLASS = 'mt-0.5 text-body leading-body text-[color:var(--color-text-tertiary)]';
const WARNING_CLASS = 'mt-0.5 text-body leading-body text-[color:var(--color-status-warning)]';

/** Which of the round's reads the person leaves on. */
export interface ReadChoices {
  names: boolean;
  pulse: boolean;
  load: boolean;
}

/** One read: its name and one line on what it shows (or what is missing while off), and its switch. */
function ReadRow({ id, label, on, onChange, children }: {
  id: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations('workStatus.sessions');
  return (
    <section className="flex items-start gap-3 py-2.5" data-testid={`work-status-read-${id}`}>
      <div className="min-w-0 flex-1">
        <h3 className={cn('text-body leading-body font-[var(--font-weight-emphasis)]', on ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>{label}</h3>
        {children}
      </div>
      <SegmentedControl
        ariaLabel={label}
        testId={`work-status-${id}-switch`}
        size="md"
        value={on}
        onChange={onChange}
        options={[
          { value: true, label: t('choice.on') },
          { value: false, label: t('choice.off') },
        ]}
      />
    </section>
  );
}

/** One read's full account: when it runs, what it reads and what it never keeps or sends. */
function ReadDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="text-body leading-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{label}</h4>
      <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{children}</p>
    </div>
  );
}

/**
 * What Work status reads on this Mac. The header holds one quiet button, and words only when the
 * session status is off or could not be read, since rooms then stop saying who waits. The panel
 * gives each read one line and its switch; how each is read sits folded beneath for whoever asks.
 */
export function WorkStatusReads({ line, choices }: { line: SessionListLine; choices: ReadChoices }) {
  const t = useTranslations('workStatus');
  const r = useTranslations('workStatus.reads');
  const s = useTranslations('workStatus.sessions');
  const tools = useTranslations('workStatus.tool');
  const { open, setOpen, ref } = useDismissibleMenu();
  const panelId = useId();
  if (line.kind === 'hidden') return null;

  const tool = tools('claudeCode');
  const command = (chunks: ReactNode) => <code className="whitespace-nowrap font-mono text-[color:var(--color-text-secondary)]">{chunks}</code>;
  const listOn = line.kind !== 'off';
  const toggle = () => setOpen(current => !current);
  return (
    <div ref={ref} className="relative flex flex-none items-center gap-1" data-session-list={line.kind}>
      {line.kind === 'on' ? null : (
        <button
          type="button"
          data-testid="work-status-session-list"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className={controlClass({
            shape: 'link',
            tone: 'muted',
            hoverInk: 'strong',
            className: cn('text-body', line.kind === 'unreadable' && 'text-[color:var(--color-status-warning)]'),
          })}
        >
          {s(`chip.${line.kind}`)}
        </button>
      )}
      <IconButton
        label={r('open')}
        data-testid="work-status-reads-open"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        size="sm"
        tone="muted"
        hoverInk="strong"
        active={open}
      >
        <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.75} />
      </IconButton>
      <Surface
        open={open}
        motion="overlay"
        as="section"
        id={panelId}
        aria-labelledby={`${panelId}-title`}
        data-testid="work-status-session-list-panel"
        {...transientSurface('anchored')}
        className="absolute left-0 top-full z-[var(--z-dialog)] mt-2 flex max-h-[calc(100vh-8rem)] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-y-auto rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 pb-3 pt-4 shadow-[var(--shadow-elevation-2)]"
      >
        <h2 id={`${panelId}-title`} className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{r('title')}</h2>
        <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">{r('promise')}</p>
        <div className="mt-2 flex flex-col divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]">
          <ReadRow id="session-list" label={r('list.label')} on={listOn} onChange={writeSessionListRead}>
            {line.kind === 'unreadable' ? (
              <p role="status" data-testid="work-status-session-list-now" className={WARNING_CLASS}>
                {s('unreadable', { tool, reason: s(`reason.${line.reason}`, { tool }) })} {s('fallback')}
              </p>
            ) : (
              <p data-testid="work-status-session-list-now" className={CAPTION_CLASS}>{listOn ? r('list.caption') : s('off', { tool })}</p>
            )}
          </ReadRow>
          <ReadRow id="names" label={r('names.label')} on={choices.names} onChange={writeSessionNamesRead}>
            <p data-testid="work-status-names-now" className={CAPTION_CLASS}>
              {!listOn ? t('names.needsList') : choices.names ? r('names.caption') : t('names.off', { example: t('session.name', { tool, number: 1 }) })}
            </p>
          </ReadRow>
          <ReadRow id="pulse" label={r('pulse.label')} on={choices.pulse} onChange={writeFilePulseRead}>
            <p data-testid="work-status-pulse-now" className={CAPTION_CLASS}>{choices.pulse ? r('pulse.caption') : t('pulse.off')}</p>
          </ReadRow>
          <ReadRow id="load" label={r('load.label')} on={choices.load} onChange={writeLoadRead}>
            <p data-testid="work-status-load-now" className={CAPTION_CLASS}>{choices.load ? r('load.caption') : t('load.off')}</p>
          </ReadRow>
        </div>
        <Disclosure summary={r('details')} summaryTestId="work-status-reads-details" className="mt-2">
          <div className="flex flex-col gap-3 pb-1 pt-2">
            <ReadDetail label={r('list.label')}>{s.rich('status', { tool, command: LIST_COMMAND, code: command })}</ReadDetail>
            <ReadDetail label={r('names.label')}>{t('names.status', { tool })}</ReadDetail>
            <ReadDetail label={r('pulse.label')}>{t('pulse.status')}</ReadDetail>
            <ReadDetail label={r('load.label')}>{t('load.status')}</ReadDetail>
          </div>
        </Disclosure>
      </Surface>
    </div>
  );
}
