'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { AutomationRowMenu } from './AutomationRowMenu';

export function useScheduleChange() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (action: () => Promise<boolean>) => {
    setPending(true);
    setFailed(false);
    try {
      if (!await action()) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return { pending, failed, run };
}

export type ScheduleChange = ReturnType<typeof useScheduleChange>;

export const AUTOMATIONS_RUNNING_ID = 'automations-running';

export const AutomationScheduleActions = forwardRef<HTMLButtonElement, {
  round: RoundRecord;
  runner: RoundsRunnerValue;
  change: ScheduleChange;
  notAllowedSentenceId: string | null;
  onEdit: () => void;
  onRemove: () => void;
}>(function AutomationScheduleActions({ round, runner, change, notAllowedSentenceId, onEdit, onRemove }, menuTrigger) {
  const t = useTranslations('automations');
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <Button variant="ghost" size="sm" onClick={() => runner.runNow(round.id)}
      disabled={runner.running !== null || change.pending || notAllowedSentenceId !== null}
      aria-describedby={notAllowedSentenceId ?? (runner.running ? AUTOMATIONS_RUNNING_ID : undefined)}
      data-testid="automations-run-now" className="atlas-touch-floor whitespace-nowrap px-2.5">
      {t('runNow')}
    </Button>
    <AutomationRowMenu ref={menuTrigger} label={t('moreActions', { name: round.name })} open={menuOpen} onOpenChange={setMenuOpen}
      disabled={change.pending}
      items={[
        { label: t('edit'), icon: <Pencil size={ICON_SIZE.sm} aria-hidden />, testId: 'automations-edit', onSelect: onEdit },
        {
          label: round.enabled ? t('pause') : t('resume'),
          icon: round.enabled ? <Pause size={ICON_SIZE.sm} aria-hidden /> : <Play size={ICON_SIZE.sm} aria-hidden />,
          testId: 'automations-toggle',
          onSelect: () => void change.run(() => runner.setEnabled(round.id, !round.enabled)),
        },
        { label: t('remove'), icon: <Trash2 size={ICON_SIZE.sm} aria-hidden />, testId: 'automations-remove', danger: true, onSelect: onRemove },
      ]} />
  </>;
});

export function AutomationRemoveConfirm({ round, runner, change, onClose }: {
  round: RoundRecord;
  runner: RoundsRunnerValue;
  change: ScheduleChange;
  onClose: () => void;
}) {
  const t = useTranslations('automations');
  const cancelButton = useRef<HTMLButtonElement>(null);
  const questionId = `automation-remove-${round.id}-question`;
  useEffect(() => cancelButton.current?.focus(), []);
  return (
    <div role="group" aria-labelledby={questionId} data-testid="automations-remove-confirm"
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || change.pending) return;
        event.stopPropagation();
        onClose();
      }}>
      <p id={questionId} className="min-w-0 text-body text-[color:var(--color-text-primary)]">
        {t('removeQuestion', { name: round.name })}
      </p>
      {/* One unit, or at narrow widths the danger button wraps alone away from Cancel. */}
      <div className="flex shrink-0 items-center gap-2" data-testid="automations-remove-answers">
        <Button ref={cancelButton} variant="outline" size="sm" disabled={change.pending} className="atlas-touch-floor"
          onClick={onClose}>{t('cancel')}</Button>
        <Button variant="danger" size="sm" disabled={change.pending} className="atlas-touch-floor" data-confirm-step
          data-testid="automations-confirm-remove"
          onClick={() => void change.run(async () => {
            const removed = await runner.remove(round.id);
            if (removed) document.getElementById('main')?.focus();
            return removed;
          })}><Trash2 size={ICON_SIZE.sm} aria-hidden />{t('removeConfirm')}</Button>
      </div>
    </div>
  );
}
