'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Button } from '@/shared/ui/controls/button';
import { CloseButton, Dialog, DialogBody, TabBar } from '@/shared/ui';
import type { TabBarItem } from '@/shared/ui/controls/tab-bar';

import type { WorkRun } from '../model/work-run';
import type { ScheduledRun } from '../model/scheduled-run';
import { workRuns, type SeatRun } from '../model/work-run-store';
import { isSeatRunActive, useWorkRunElapsed } from '../model/use-work-run';
import { useWorkRunCopy, type WorkRunMarks } from './use-work-run-copy';
import { useScheduledRunCopy } from './use-scheduled-run-copy';
import { RollingCount } from './RollingCount';
import { WorkRunMoru, type MoruState } from './WorkRunMoru';
import { useCheckDoor, useOpenScheduledRun } from './use-run-doors';

const PANE_MARKS: WorkRunMarks = {
  page: (name) => <span className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{name}</span>,
  count: (value) => <RollingCount value={value} className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />,
};

const RUNS_ID_PREFIX = 'work-runs';

/**
 * Every run the card speaks for, centred: the runs on the left, the selected run's live facts
 * on the right. One run is always selected; the latest unless the person picks another.
 */
export function WorkRunsDialog({ open, runs, onClose }: { open: boolean; runs: readonly SeatRun[]; onClose: () => void }) {
  const t = useTranslations('workCard');
  const titleId = useId();
  const tCheck = useTranslations('library.check');
  const [picked, setPicked] = useState<string | null>(null);
  const selected = runs.find((entry) => entry.key === picked) ?? runs.at(-1) ?? null;
  const items: TabBarItem[] = [...runs].reverse().map((entry) => ({
    key: entry.key,
    label: entry.kind === 'check' ? tCheck('title') : entry.run.name,
    testId: 'work-runs-tab',
    count: entry.kind === 'check' ? entry.run.readCount : entry.run.checkedCount,
    countTitle: t(entry.kind === 'check' ? 'runsPagesRead' : 'runsDocumentsChecked'),
  }));
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="md" testId="work-runs-dialog" className="w-[min(40rem,calc(100vw-2rem))]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t('runsTitle')}
          </h2>
          <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('runsDescription')}</p>
        </div>
        <CloseButton label={t('close')} onClick={onClose} className="-mt-1 -mr-1 flex-none" />
      </div>
      <DialogBody className="mt-4 grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-3 max-sm:grid-cols-1">
        <div className="min-w-0 self-start">
          <TabBar
            items={items}
            activeKey={selected?.key ?? ''}
            onSelect={setPicked}
            ariaLabel={t('runsTitle')}
            idPrefix={RUNS_ID_PREFIX}
            orientation="vertical"
          />
        </div>
        {selected ? <RunPane key={selected.key} entry={selected} onLeave={onClose} /> : null}
      </DialogBody>
    </Dialog>
  );
}

interface PaneFacts {
  title: string;
  line: ReactNode;
  figures: ReactNode | null;
  moru: MoruState;
  count: number;
  door: ReactNode;
}

function RunPane({ entry, onLeave }: { entry: SeatRun; onLeave: () => void }) {
  const leaveThen = (go: () => void) => () => {
    onLeave();
    go();
  };
  return entry.kind === 'check'
    ? <CheckPane entry={entry} run={entry.run} leaveThen={leaveThen} />
    : <ScheduledPane entry={entry} run={entry.run} leaveThen={leaveThen} />;
}

type LeaveThen = (go: () => void) => () => void;

function CheckPane({ entry, run, leaveThen }: { entry: SeatRun; run: WorkRun; leaveThen: LeaveThen }) {
  const tCheck = useTranslations('library.check');
  const copy = useWorkRunCopy(run, useWorkRunElapsed(run), PANE_MARKS, 'card');
  const openDoor = useCheckDoor();
  const door = run.phase === 'asking'
    ? { label: tCheck('review'), kind: 'conversation' as const }
    : run.phase === 'found'
      ? { label: tCheck('openResults'), kind: 'results' as const }
      : run.phase === 'unreadable' || run.phase === 'failed'
        ? { label: tCheck('openConversation'), kind: 'conversation' as const }
        : null;
  return (
    <PaneFrame
      entry={entry}
      facts={{
        title: copy.title,
        line: copy.detail,
        figures: copy.figures,
        moru: run,
        count: run.readCount,
        door: door ? <Button size="sm" onClick={leaveThen(() => openDoor(door.kind))} data-testid="work-runs-open">{door.label}</Button> : null,
      }}
    />
  );
}

function ScheduledPane({ entry, run, leaveThen }: { entry: SeatRun; run: ScheduledRun; leaveThen: LeaveThen }) {
  const tCard = useTranslations('workCard');
  const copy = useScheduledRunCopy(run, useWorkRunElapsed(run), PANE_MARKS);
  const openRun = useOpenScheduledRun();
  return (
    <PaneFrame
      entry={entry}
      facts={{
        title: copy.title,
        line: copy.line,
        figures: copy.figures,
        moru: copy.moru,
        count: run.checkedCount,
        door: run.phase === 'running' ? null : (
          <Button size="sm" onClick={leaveThen(() => openRun(run))} data-testid="work-runs-open">{tCard('scheduled.openRun')}</Button>
        ),
      }}
    />
  );
}

function PaneFrame({ entry, facts }: { entry: SeatRun; facts: PaneFacts }) {
  const tCard = useTranslations('workCard');
  const active = isSeatRunActive(entry);
  return (
    <div
      role="tabpanel"
      id={`${RUNS_ID_PREFIX}-tabpanel-${entry.key}`}
      aria-labelledby={`${RUNS_ID_PREFIX}-tab-${entry.key}`}
      data-testid="work-runs-pane"
      data-run-key={entry.key}
      className="motion-swap-in relative flex min-h-48 items-center overflow-clip rounded-card bg-[color:var(--color-overlay-1)] py-4 pr-4"
    >
      <WorkRunMoru run={facts.moru} />
      {/* Facts and actions are one block centred beside Moru, so no state leaves the pane half empty. */}
      <div className="ml-[9rem] grid min-w-0 flex-1 gap-3 max-sm:ml-[5rem]">
        <div aria-live="off" className="grid min-w-0 gap-1">
          <p data-testid="work-runs-pane-title" className="text-label leading-label text-[color:var(--color-text-tertiary)]">{facts.title}</p>
          <p
            data-testid="work-runs-pane-line"
            className={cn(
              'break-words',
              active ? 'text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]' : 'text-body leading-body text-[color:var(--color-text-secondary)]',
            )}
          >
            {facts.line}
          </p>
          {facts.figures ? (
            <p data-testid="work-runs-pane-figures" className="text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">{facts.figures}</p>
          ) : null}
        </div>
        <div className="flex h-8 min-w-0 items-center gap-2">
        {active ? (
          <Button size="sm" variant="outline" onClick={() => workRuns.stopRun(entry.key)} data-testid="work-runs-stop">
            {tCard('stop')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => workRuns.closeRun(entry.key)} data-testid="work-runs-close-run">
            {tCard('close')}
          </Button>
        )}
          {facts.door}
        </div>
      </div>
      {active ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none">
          <WorkProgress phase="running" done={facts.count} total={null} label={tCard('progressLabel', { title: facts.title })} />
        </div>
      ) : null}
    </div>
  );
}
