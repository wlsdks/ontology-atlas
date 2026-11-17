"use client";

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useOntologyReset, type ClearedConcepts } from '@/features/ontology-reset';
import { useFailureSentence } from '@/shared/lib/failures/use-failure-sentence';
import { Button, Dialog } from '@/shared/ui';
import { Chip } from '@/shared/ui/controls/controls';
import { useToast } from '@/shared/ui/toast/toast';
import { DETAIL_TOGGLE_CHIP, SettingsRow } from './settings-primitives';

/**
 * Clears every concept document into `.ontology-atlas/removed/<stamp>/`. The dialog renders
 * outside the row, because the row leaves once the folder holds no concept and the dialog's
 * exit still has to play.
 */
export function OntologyResetSettings() {
  const t = useTranslations('settings.workspaceReset');
  const tSettings = useTranslations('settings');
  const toast = useToast();
  const failureSentence = useFailureSentence();
  const reset = useOntologyReset();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [askedCount, setAskedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ask = () => {
    setAskedCount(reset.conceptCount);
    setFailure(null);
    setOpen(true);
  };
  const close = () => {
    if (!busy) setOpen(false);
  };

  const undo = async (cleared: ClearedConcepts) => {
    try {
      const outcome = await reset.undo(cleared);
      if (outcome.skipped.length > 0) {
        toast.show(
          t('undonePartial', { restored: outcome.restored.length, skipped: outcome.skipped.length }),
          'warning',
        );
      } else {
        toast.show(t('undone', { count: outcome.restored.length }), 'success');
      }
    } catch (error) {
      toast.show(failureSentence(error, t('undoFailed')).sentence, 'error');
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const cleared = await reset.clear();
      setOpen(false);
      toast.show(t('done', { count: cleared.moved.length }), 'success', {
        label: t('undo'),
        onClick: () => void undo(cleared),
      });
    } catch (error) {
      setFailure(failureSentence(error, t('failed')).sentence);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {reset.ready && reset.conceptCount > 0 ? (
        <SettingsRow
          testId="app-settings-reset"
          settingId="folder-reset"
          label={t('label')}
          caption={t('caption')}
          control={
            <Chip
              data-testid="app-settings-reset-open"
              size="lg"
              tone="secondary"
              className={DETAIL_TOGGLE_CHIP}
              onClick={ask}
            >
              {t('action')}
            </Chip>
          }
        />
      ) : null}
      <Dialog
        open={open}
        onClose={close}
        role="alertdialog"
        labelledBy={titleId}
        testId="app-settings-reset-dialog"
      >
        <h2
          id={titleId}
          className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t('dialogTitle', { count: askedCount })}
        </h2>
        <p className="mt-2 text-label leading-prose text-[color:var(--color-text-secondary)]">
          {t('dialogBody')}
        </p>
        {failure ? (
          <p
            role="alert"
            data-testid="app-settings-reset-failure"
            className="mt-3 text-label leading-prose text-[color:var(--color-status-danger)]"
          >
            {failure}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={close} data-testid="app-settings-reset-cancel">
            {tSettings('projectForm.actions.cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void confirm()}
            data-testid="app-settings-reset-confirm"
          >
            {busy ? t('confirming') : t('confirm')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
