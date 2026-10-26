'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { gitBriefingClearSavedPulls } from '@/shared/lib/git/tauri-change-briefing';
import { Button } from '@/shared/ui';

/** App-owned copies can be cleared even when no repository can be opened. */
export function SavedPullCopies({ onCleared }: { onCleared: () => void }) {
  const t = useTranslations('gitBriefing');
  const [status, setStatus] = useState<'idle' | 'clearing' | 'cleared' | 'failed'>('idle');
  async function clear() {
    if (status === 'clearing') return;
    setStatus('clearing');
    try { await gitBriefingClearSavedPulls(); onCleared(); setStatus('cleared'); }
    catch { setStatus('failed'); }
  }
  return <div className="max-w-prose space-y-3 text-body text-[color:var(--color-text-secondary)]">
      <p>{t('prSavedPolicy')}</p><p>{t('prSavedClearScope')}</p>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" disabled={status === 'clearing'} onClick={() => { void clear(); }}>{t(status === 'clearing' ? 'prClearingSaved' : 'prClearSaved')}</Button>
      {status !== 'idle' && status !== 'clearing' && <p role="status" className={status === 'failed' ? 'text-[color:var(--color-status-warning)]' : undefined}>{t(status === 'cleared' ? 'prSavedCleared' : 'prClearFailed')}</p>}
  </div>;
}
