'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import { Button, IconButton } from '@/shared/ui';
import { gitChangeBriefingPatch, gitSourceBriefingPatch, type ChangeBriefing, type ChangeBriefingPatch } from '@/shared/lib/git/tauri-change-briefing';

export function BriefingPatch({ root, project, data, path, paths, onNavigate, onChooseFile }: {
  root: string; project: string; data: ChangeBriefing; path: string;
  paths: string[];
  onNavigate: (path: string, direction: 'previous' | 'next') => void;
  onChooseFile: () => void;
}) {
  const t = useTranslations('changeBriefing');
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ attempt: number; value: ChangeBriefingPatch | null } | null>(null);
  useEffect(() => {
    if (!data.tip) return;
    let cancelled = false;
    const request = project ? gitChangeBriefingPatch(root, project, data.head, data.base, data.tip, path) : gitSourceBriefingPatch(root, data.head, data.base, data.tip, path);
    void request.then(value => {
      if (!cancelled) setSnapshot({ attempt, value });
    }, () => { if (!cancelled) setSnapshot({ attempt, value: null }); });
    return () => { cancelled = true; };
  }, [root, project, data, path, attempt]);
  const ready = snapshot?.attempt === attempt;
  const result = snapshot?.value;
  const index = paths.indexOf(path);
  return <section aria-label={t('patchTitle', { path })} className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-4">
    <div data-testid="briefing-reading-header" className="sticky top-0 z-10 space-y-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 title={path} className="min-w-0 flex-1 break-all text-title font-[var(--font-weight-strong)]">{path.split('/').at(-1)}</h3>
        {index >= 0 && <nav aria-label={t('groupFiles')} className="flex flex-wrap items-center gap-2">
          <span data-testid="briefing-file-position" className="font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]">{t('filePosition', { index: index + 1, total: paths.length })}</span>
          <IconButton className="atlas-touch-floor atlas-touch-floor-wide" data-file-direction="previous" label={t('previousFile')} disabled={index === 0} onClick={() => onNavigate(paths[index - 1], 'previous')}><ChevronLeft size={16} /></IconButton>
          <IconButton className="atlas-touch-floor atlas-touch-floor-wide" data-file-direction="next" label={t('nextFile')} disabled={index === paths.length - 1} onClick={() => onNavigate(paths[index + 1], 'next')}><ChevronRight size={16} /></IconButton>
          <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={onChooseFile}><List size={16} aria-hidden />{t('chooseFile')}</Button>
        </nav>}
      </div>
      <p className="break-words text-label text-[color:var(--color-text-secondary)]">{t('patchBasis', { before: data.base?.slice(0, 8) ?? t('initialTree'), after: data.tip?.slice(0, 8) ?? '' })}</p>
    </div>
    <p className="break-all text-body text-[color:var(--color-text-secondary)]">{path}</p>
    {!ready ? <p role="status">{t('patchLoading')}</p> : !result || result.status === 'unavailable' || result.status === 'stale' ? <div role="status" className="space-y-3"><p>{t(result?.status === 'stale' ? 'stale' : 'patchUnavailable')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>{t('patchRetry')}</Button></div> : result.status === 'binary' ? <p>{t('patchBinary')}</p> : !result.patch ? <p>{t('patchNoDifference')}</p> : <>
      {result.truncated && <p role="status" className="text-[color:var(--color-status-warning)]">{t('patchTruncated')}</p>}
      <pre data-testid="briefing-patch" className="whitespace-pre-wrap break-all rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-4 font-mono text-body">{result.patch}</pre>
    </>}
  </section>;
}
