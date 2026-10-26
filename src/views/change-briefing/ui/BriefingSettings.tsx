'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { hostOfBaseUrl, readLocalEndpoint, subscribeLocalEndpointChange } from '@/shared/lib/llm-connection/local-endpoint';
import { Button, Dialog } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { SavedPullCopies } from './SavedPullCopies';

export function BriefingSettings({ open, close, repository, onCleared, showFolderEntry }: { showFolderEntry: boolean; open: boolean; close: () => void; repository: string; onCleared: () => void }) {
  const t = useTranslations('gitBriefing');
  const title = useId();
  const [connection, setConnection] = useState(readLocalEndpoint);
  useEffect(() => subscribeLocalEndpointChange(() => setConnection(readLocalEndpoint())), []);
  return <Dialog open={open} onClose={close} labelledBy={title} size="md" testId="briefing-settings-dialog">
    <div className="flex items-center justify-between gap-3">
      <h2 id={title} className="text-title font-[var(--font-weight-strong)]">{t('settingsTitle')}</h2>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={close}>{t('closeSettings')}</Button>
    </div>
    <div className="max-h-[70vh] space-y-6 overflow-y-auto pb-4 pt-5">
      <section className="space-y-3">
        <h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('settingsModel')}</h3>
        <p className="break-all text-body text-[color:var(--color-text-secondary)]">{hostOfBaseUrl(connection.baseUrl)} · {connection.model || t('summaryModelMissing')}</p>
        <Link href="/agents/?tab=models&returnTo=changes" className={controlClass({ shape: 'chip', size: 'lg', hoverSurface: 'lift', hoverInk: 'strong' })}>{t('chooseModel')}</Link>
      </section>
      <section className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-5" data-testid="briefing-saved-panel">
        <h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('settingsPrs')}</h3>
        {repository && <p className="text-body text-[color:var(--color-text-secondary)]">{t('prTransfer', { repository })}</p>}
        <p className="text-body text-[color:var(--color-text-secondary)]">{t('prSnapshotNote')}</p>
        <SavedPullCopies onCleared={onCleared} />
        {showFolderEntry && <Link href="/" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}>{t('openFolder')}</Link>}
      </section>
    </div>
  </Dialog>;
}
