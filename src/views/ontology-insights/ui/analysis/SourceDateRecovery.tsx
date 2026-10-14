'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/controls/button';

export function SourceDateRecovery({ status, onChoose, onRetry }: {
  status: string;
  onChoose: (title: string) => Promise<void>;
  onRetry: () => void;
}) {
  const t = useTranslations('ontologyPages.insights.analysis');
  const [choosing, setChoosing] = useState(false);
  const needsFolder = status === 'ungranted' || status === 'wrong-folder';
  const canRetry = status === 'binding-changed' || status === 'unreadable' || status === 'partial';
  if (!needsFolder && !canRetry) return null;
  return <div className="mt-3" data-testid="analysis-source-recovery">
    {status === 'wrong-folder' ? <p role="status" className="mb-3 text-body text-[color:var(--color-text-secondary)]">{t('sourceRecovery.wrongFolder')}</p> : null}
    {needsFolder ? <Button variant="outline" size="sm" className="atlas-touch-floor" data-testid="analysis-choose-source" disabled={choosing} aria-busy={choosing} title={choosing ? t('sourcePickerTitle') : undefined} onClick={async () => {
      setChoosing(true);
      try { await onChoose(t('sourcePickerTitle')); } finally { setChoosing(false); }
    }}>{t('chooseSourceFolder')}</Button> : <Button variant="outline" size="sm" className="atlas-touch-floor" data-testid="analysis-retry-source" onClick={onRetry}>{t('retrySourceDates')}</Button>}
  </div>;
}
