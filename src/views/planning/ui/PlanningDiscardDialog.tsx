import { useId } from 'react';
import { useTranslations } from 'use-intl';
import { Button, Dialog } from '@/shared/ui';

export function PlanningDiscardDialog({ open, onKeep, onDiscard }: { open: boolean; onKeep: () => void; onDiscard: () => void }) {
  const t = useTranslations('planning');
  const titleId = useId();
  return <Dialog open={open} onClose={onKeep} role="alertdialog" labelledBy={titleId} size="sm" initialFocus="container" testId="planning-discard">
    <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('discardQuestion')}</h2>
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="outline" onClick={onDiscard}>{t('discard')}</Button>
      <Button onClick={onKeep}>{t('keepWriting')}</Button>
    </div>
  </Dialog>;
}
