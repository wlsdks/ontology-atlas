'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RoundRecord } from '@/entities/library-round';
import type { RoundsRunnerValue } from '@/features/library-rounds';
import { Button } from '@/shared/ui';
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
  const cancelButton = useRef<HTMLButtonElement>(null);
  /* Set when the question closes, so focus goes back to the Remove that remounts in its place. */
  const returnFocus = useRef(false);
  const detailId = `automation-actions-${round.id}`;

  useEffect(() => {
    if (confirmRemove) {
      cancelButton.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      removeButton.current?.focus();
    }
  }, [confirmRemove]);

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

  const closeConfirm = () => {
    returnFocus.current = true;
    setConfirmRemove(false);
  };

  return (
    <div className="space-y-3">
      {/* The question replaces the buttons; Escape or Cancel gives them back with focus on Remove. */}
      {confirmRemove ? (
        <div id={`${detailId}-remove`} role="group" aria-labelledby={`${detailId}-question`}
          data-testid="automations-remove-confirm"
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || pending) return;
            event.stopPropagation();
            closeConfirm();
          }}>
          <p id={`${detailId}-question`} className="min-w-0 text-body text-[color:var(--color-text-primary)]">
            {t('removeQuestion', { name: round.name })}
          </p>
          {/* One unit, or at narrow widths the danger button wraps alone away from Cancel. */}
          <div className="flex shrink-0 items-center gap-2" data-testid="automations-remove-answers">
            <Button ref={cancelButton} variant="outline" size="sm" disabled={pending} className="atlas-touch-floor"
              onClick={closeConfirm}>{t('cancel')}</Button>
            <Button variant="danger" size="sm" disabled={pending} className="atlas-touch-floor" data-confirm-step
              data-testid="automations-confirm-remove"
              onClick={() => void change(async () => {
                const removed = await runner.remove(round.id);
                if (removed) document.getElementById('main')?.focus();
                return removed;
              })}><Trash2 size={ICON_SIZE.sm} aria-hidden />{t('removeConfirm')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => runner.runNow(round.id)}
            disabled={runner.running !== null || pending}
            aria-describedby={runner.running ? `${detailId}-busy` : undefined}
            data-testid="automations-run-now" className="atlas-touch-floor">
            <Play size={ICON_SIZE.sm} aria-hidden />{t('runNow')}
          </Button>
          <Button variant="outline" size="sm" disabled={pending}
            onClick={() => void change(() => runner.setEnabled(round.id, !round.enabled))}
            data-testid="automations-toggle" className="atlas-touch-floor">
            {round.enabled ? <Pause size={ICON_SIZE.sm} aria-hidden /> : <Play size={ICON_SIZE.sm} aria-hidden />}
            {round.enabled ? t('pause') : t('resume')}
          </Button>
          <Button ref={removeButton} variant="outline" size="sm" onClick={() => setConfirmRemove(true)}
            disabled={pending} aria-label={t('removeNamed', { name: round.name })}
            data-testid="automations-remove" className="atlas-touch-floor">
            <Trash2 size={ICON_SIZE.sm} aria-hidden />{t('remove')}
          </Button>
          {runner.running ? <p id={`${detailId}-busy`} className="text-body text-[color:var(--color-text-tertiary)]">{t('running', { name: runner.running.roundName })}</p> : null}
        </div>
      )}
      {failed ? <p role="alert" className="text-body text-[color:var(--color-danger-text)]">{t('changeFailed')}</p> : null}
    </div>
  );
}
