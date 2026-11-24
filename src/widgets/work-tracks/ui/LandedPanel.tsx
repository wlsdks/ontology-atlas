'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';
import { readLandedDetail, type LandedChange, type LandedDetail } from '@/shared/lib/work-status/tauri-work-status';
import { Button, IconButton, Surface } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { readSubject } from '../model/landed-change';
import { clockTime, timeAgo } from '../model/format';
import { PanelSection, PanelStats } from './panel-parts';

/**
 * One finished change beside the building: what it was, how much it moved, the branch commits it
 * brought and the files it changed. Its detail is read once per change, when it opens.
 */
export function LandedPanel({ change, root, nowMs, id, onClose, replaced = false }: {
  /** The pressed change, or none: the panel leaves with its last change still drawn. */
  change: LandedChange | null;
  /** Another panel takes this one's place: it goes at once, so the building never makes room for two. */
  replaced?: boolean;
  root: string;
  nowMs: number;
  id: string;
  onClose: () => void;
}) {
  const [drawn, setDrawn] = useState(change);
  if (change !== null && change !== drawn) setDrawn(change);
  if (replaced && change === null) return null;
  return (
    <Surface
      open={change !== null}
      as="aside"
      motion="overlay"
      id={id}
      data-testid="work-landed-panel"
      className="flex w-[min(25rem,100%)] shrink-0 flex-col overflow-y-auto border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]"
    >
      {drawn ? <LandedBody key={drawn.hash} change={drawn} root={root} nowMs={nowMs} onClose={onClose} /> : null}
    </Surface>
  );
}

function folderAndName(path: string): { folder: string; name: string } {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? { folder: '', name: path } : { folder: path.slice(0, cut), name: path.slice(cut + 1) };
}

function LandedBody({ change, root, nowMs, onClose }: { change: LandedChange; root: string; nowMs: number; onClose: () => void }) {
  const t = useTranslations('workStatus.landed');
  const panel = useTranslations('workStatus.panel');
  const locale = useLocale();
  const titleId = useId();
  const hash = useCopyFeedback();
  const [detail, setDetail] = useState<LandedDetail | null | 'failed'>(null);
  useEffect(() => {
    let live = true;
    void readLandedDetail(root, change.hash).then(read => {
      if (live) setDetail(read ?? 'failed');
    }).catch(() => {
      if (live) setDetail('failed');
    });
    return () => {
      live = false;
    };
  }, [root, change.hash]);
  const read = readSubject(change.subject);
  const loaded = detail !== null && detail !== 'failed' ? detail : null;
  const most = loaded ? Math.max(1, ...loaded.files.map(file => (file.insertions ?? 0) + (file.deletions ?? 0))) : 1;
  return (
    <div aria-labelledby={titleId} role="group" className="flex min-h-full flex-col">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
            {read.kind ? <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{t(`kind.${read.kind}`)}</span> : null}
            {read.scope ? <span className="font-mono">{read.scope}</span> : null}
            {read.pullRequest !== null ? <span className="font-mono tabular-nums">#{read.pullRequest}</span> : null}
          </p>
          <h2 id={titleId} className="mt-1.5 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{read.title}</h2>
          {change.at !== null ? (
            <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t('landedAt', { ago: timeAgo(change.at, nowMs, locale), time: clockTime(change.at * 1000, nowMs, locale) })}
            </p>
          ) : null}
        </div>
        <IconButton label={panel('close')} onClick={onClose} data-testid="work-landed-panel-close">
          <X size={ICON_SIZE.md} aria-hidden />
        </IconButton>
      </header>
      <PanelStats
        stats={[
          { label: t('stat.commits'), value: loaded ? (change.merge ? loaded.commitCount : 1) : null },
          { label: t('stat.files'), value: change.files },
          { label: t('stat.added'), value: change.insertions, sign: '+' },
          { label: t('stat.removed'), value: change.deletions, sign: '−' },
        ]}
      />
      {detail === 'failed' ? (
        <p className="px-5 py-4 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('unreadable')}</p>
      ) : (
        <>
          <PanelSection title={t('commitsTitle')} aside={loaded && loaded.commitCount > loaded.commits.length ? panel('commitsMore', { count: loaded.commitCount - loaded.commits.length }) : null}>
            {loaded === null ? (
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{panel('reading')}</p>
            ) : !change.merge ? (
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{t('squashed')}</p>
            ) : (
              <ol className="flex flex-col gap-1.5" data-testid="work-landed-panel-commits">
                {loaded.commits.map(commit => {
                  const line = readSubject(commit.subject);
                  return (
                  <li key={commit.hash} className="flex items-baseline gap-3 text-body leading-body">
                    <span className="min-w-0 flex-1 text-[color:var(--color-text-primary)]">
                      {line.kind ? <span className="mr-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">{t(`kind.${line.kind}`)}</span> : null}
                      {line.title}
                    </span>
                    {commit.at !== null ? <span className="shrink-0 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{timeAgo(commit.at, nowMs, locale)}</span> : null}
                  </li>
                  );
                })}
              </ol>
            )}
          </PanelSection>
          <PanelSection title={t('filesTitle')} aside={loaded && loaded.fileCount > loaded.files.length ? panel('filesMore', { count: loaded.fileCount - loaded.files.length }) : null}>
            {loaded === null ? (
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{panel('reading')}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="work-landed-panel-files">
                {loaded.files.map(file => {
                  const { folder, name } = folderAndName(file.path);
                  const lines = (file.insertions ?? 0) + (file.deletions ?? 0);
                  return (
                    <li key={file.path} className="text-label leading-label">
                      <div className="flex items-baseline gap-3">
                        <span className="min-w-0 flex-1 break-all font-mono text-[color:var(--color-text-primary)]">{name}</span>
                        <span className="shrink-0 tabular-nums text-[color:var(--color-text-quaternary)]">
                          {file.insertions === null ? t('binary') : `+${file.insertions} −${file.deletions ?? 0}`}
                        </span>
                      </div>
                      {folder ? <span className="block break-all text-[color:var(--color-text-quaternary)]">{folder}</span> : null}
                      <span aria-hidden className="mt-1 block h-0.5 rounded-full bg-[color:var(--color-overlay-2)]">
                        <span className="block h-full rounded-full bg-[color:var(--color-text-tertiary)]" style={{ width: `${(lines / most) * 100}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelSection>
        </>
      )}
      <div className="mt-auto border-t border-[color:var(--color-border-soft)] px-5 py-4">
        <Button size="sm" variant="outline" data-testid="work-landed-panel-copy" onClick={() => void hash.copy(change.hash)}>
          {hash.state === 'copied' ? panel('copied') : t('copyHash')}
        </Button>
      </div>
    </div>
  );
}
