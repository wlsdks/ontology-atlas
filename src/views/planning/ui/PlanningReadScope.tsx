'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PlanningInventory } from '@/shared/lib/planning/bridge';
import { Button, Dialog } from '@/shared/ui';

const WARNING_TEXT = 'text-[color:var(--color-status-warning)]';
const PLACEMENT_CLASS = {
  list: 'flex-none border-t border-[color:var(--color-divider)] py-2 lg:pr-4',
  stage: 'max-w-md text-center [&>div]:justify-center',
} as const;

export function PlanningReadScope({ placement, inventory, status, checkedAt, slow, writable }: {
  placement: keyof typeof PLACEMENT_CLASS;
  inventory: PlanningInventory | null;
  status: 'idle' | 'checking' | 'ready' | 'unavailable';
  checkedAt: number | null;
  slow: boolean;
  /** The home folder is written here, so the promise that Atlas never edits the files does not hold. */
  writable: boolean;
}) {
  const t = useTranslations('planning');
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const facts = inventory ? [
    t('visited', { count: inventory.visited }),
    inventory.skipped > 0 && t('omitted', { count: inventory.skipped }),
    inventory.omitted.linked > 0 && t('linkedOmitted', { count: inventory.omitted.linked }),
    inventory.omitted.unreadable > 0 && t('unreadable', { count: inventory.omitted.unreadable }),
    inventory.limit_reached && t('budgetLimit'),
    inventory.depth_limited && t('depthLimit'),
    inventory.unknown_remainder && t('unknownRemaining'),
  ].filter((fact): fact is string => Boolean(fact)) : [];
  return <div data-planning-read className={`space-y-1 text-label leading-label text-[color:var(--color-text-tertiary)] ${PLACEMENT_CLASS[placement]}`}>
    {inventory && <>
      <div className="flex items-center gap-2">
        <p role="status" className={`min-w-0 text-[color:var(--color-text-secondary)] ${placement === 'list' ? 'flex-1' : ''}`}>{t('visited', { count: inventory.visited })}</p>
        <Button variant="ghost" size="sm" aria-haspopup="dialog" className="-my-1 shrink-0 px-2 max-[769px]:min-h-11" onClick={() => setOpen(true)}>{t('details')}</Button>
      </div>
      <p>{status === 'checking' ? t('checking') : checkedAt ? t('observedAt', { time: new Date(checkedAt).toLocaleString() }) : t('loading')} · {t('observationLimit')}</p>
    </>}
    {inventory?.partial && <p className={WARNING_TEXT}>{t('partial')}</p>}
    {slow && <p role="status">{t('checkingSlow')}</p>}
    {status === 'unavailable' && <p aria-live="off" className={WARNING_TEXT}>{t('folderUnavailable')}</p>}
    <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} size="sm" testId="planning-read-scope">
      <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('details')}</h2>
      {facts.length > 0 && <ul className="mt-4 space-y-1 text-body leading-body text-[color:var(--color-text-primary)]">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>}
      <div className="mt-4 space-y-2 text-body leading-body text-[color:var(--color-text-secondary)]">
        {!writable && <p>{t('chooseBody')}</p>}<p>{t('limits')}</p><p>{t('noContentSearch')}</p><p>{t('historyLimit')}</p><p>{t('comparisonLimit')}</p>
      </div>
      <div className="mt-5 flex justify-end"><Button variant="ghost" onClick={() => setOpen(false)}>{t('close')}</Button></div>
    </Dialog>
  </div>;
}
