'use client';

import { useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { Button, IconButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

export function AutomationScheduleActions({ round, runner }: {
  round: RoundRecord;
  runner: RoundsRunnerValue;
}) {
  const t = useTranslations('automations');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const detailId = `automation-actions-${round.id}`;

  const change = async (action: () => Promise<boolean>) => {
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => runner.runNow(round.id)}
          disabled={runner.running !== null || pending}
          aria-describedby={runner.running ? `${detailId}-busy` : undefined}
          data-testid="automations-run-now" className="atlas-touch-floor">
          <Play size={ICON_SIZE.sm} aria-hidden />{t('runNow')}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending}
          onClick={() => void change(() => runner.setEnabled(round.id, !round.enabled))}
          data-testid="automations-toggle" className="atlas-touch-floor">
          {round.enabled ? <Pause size={ICON_SIZE.sm} aria-hidden /> : <Play size={ICON_SIZE.sm} aria-hidden />}
          {round.enabled ? t('pause') : t('resume')}
        </Button>
        <IconButton ref={removeButton} onClick={() => setConfirmRemove(true)}
          disabled={pending} label={t('removeNamed', { name: round.name })}
          aria-expanded={confirmRemove} aria-controls={`${detailId}-remove`}
          data-testid="automations-remove" className="atlas-touch-floor atlas-touch-floor-wide">
          <Trash2 size={ICON_SIZE.sm} aria-hidden />
        </IconButton>
        {runner.running ? <p id={`${detailId}-busy`} className="text-body text-[color:var(--color-text-tertiary)]">{t('running', { name: runner.running.roundName })}</p> : null}
      </div>
      {confirmRemove ? (
        <div id={`${detailId}-remove`} role="group" aria-labelledby={`${detailId}-question`}
          className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-divider)] pt-3">
          <p id={`${detailId}-question`} className="w-full text-body-lg text-[color:var(--color-text-primary)]">{t('removeQuestion', { name: round.name })}</p>
          <Button variant="outline" size="sm" disabled={pending} className="atlas-touch-floor"
            onClick={() => { setConfirmRemove(false); removeButton.current?.focus(); }}>{t('cancel')}</Button>
          <Button variant="ghost" size="sm" disabled={pending} className="atlas-touch-floor"
            data-testid="automations-confirm-remove"
            onClick={() => void change(async () => {
              const removed = await runner.remove(round.id);
              if (removed) document.getElementById('main')?.focus();
              return removed;
            })}>{t('removeConfirm')}</Button>
        </div>
      ) : null}
      {failed ? <p role="alert" className="text-body text-[color:var(--color-danger-text)]">{t('changeFailed')}</p> : null}
    </div>
  );
}
