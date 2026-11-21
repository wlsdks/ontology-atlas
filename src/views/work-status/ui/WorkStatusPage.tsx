'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderGit2 } from 'lucide-react';
import { useLocalVault } from '@/entities/vault-session';
import { cn } from '@/shared/lib/cn';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { getTauriVaultRootPath, pickTauriSourceDirectory } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { isWorkStatusAvailable } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, folderName, headlineOf, type WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { EXIT_TRANSITION, MOTION, OVERLAY_RISE, OVERLAY_RISE_REDUCED, OVERLAY_SETTLED } from '@/shared/motion';
import { Button, PageHeaderBar } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PAGE_FRAME, PAGE_FRAME_FORM, PAGE_STAGE_FILL } from '@/shared/ui/tokens/page-frame';
import { SwapText, WorkTracksBoard } from '@/widgets/work-tracks';
import { useWorkStatus } from '../model/use-work-status';
import { WorkStatusStage } from './WorkStatusStage';

const subscribe = () => () => {};
const webSnapshot = () => false;
const EMPTY_TRACKS: WorkTracks = { stuck: [], sessions: [], unheld: [], merged: [], counts: { running: 0, stuck: 0, ready: 0 }, worktreeCount: 0 };
const COUNT_CLASS = 'font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-primary)]';
const MAIN_CLASS = 'flex min-h-full flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]';

export function WorkStatusPage() {
  const t = useTranslations('workStatus');
  const git = useTranslations('atlasGit');
  const native = useSyncExternalStore(subscribe, isWorkStatusAvailable, webSnapshot);
  const reduced = usePrefersReducedMotion();
  const vault = useLocalVault();
  const [chosen, setChosen] = useArrivalMemory<string | null>('work-status:repository', null);
  const vaultRoot = native && vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const root = native ? chosen ?? vaultRoot : null;
  const { snapshot, failed, readAtMs } = useWorkStatus(root);
  const tracks = useMemo(() => (snapshot?.status === 'ready' ? buildWorkTracks(snapshot) : null), [snapshot]);

  async function chooseRepository() {
    const picked = await pickTauriSourceDirectory(t('choose.title'));
    if (picked) setChosen(picked);
  }
  const chooseButton = (size: 'sm' | 'lg') => (
    <Button size={size} variant={size === 'sm' ? 'ghost' : 'primary'} data-testid="work-status-choose" onClick={() => void chooseRepository()}>
      <FolderGit2 size={size === 'sm' ? ICON_SIZE.md : ICON_SIZE.lg} aria-hidden />
      {t('choose.action')}
    </Button>
  );
  const stagePage = (stage: React.ReactNode) => (
    <main id="main" data-work-status-surface className={MAIN_CLASS}>
      <PageHeaderBar frame="page" title={t('title')} />
      <div className={`${PAGE_FRAME_FORM} ${PAGE_STAGE_FILL}`}>{stage}</div>
    </main>
  );

  if (!native) return stagePage(<WorkStatusStage state="web" title={t('web.title')} body={t('web.body')} />);
  if (!root) return stagePage(<WorkStatusStage state="choose" title={t('choose.title')} action={chooseButton('lg')} />);
  const folder = folderName(snapshot?.root || root);
  const status = failed ? 'unreadable' : snapshot?.status;
  if (status === 'git-missing') return stagePage(<WorkStatusStage state="git-missing" title={git('install.title')} body={git('install.body')} />);
  if (status === 'ungranted' || status === 'unreadable') {
    return stagePage(<WorkStatusStage state="unreadable" title={t('unreadable', { repo: folder })} action={chooseButton('lg')} />);
  }
  if (status === 'no-history') return stagePage(<WorkStatusStage state="choose" title={t('choose.title')} action={chooseButton('lg')} />);
  if (tracks && snapshot && snapshot.worktrees.length <= 1) {
    return stagePage(<WorkStatusStage state="empty" title={t('empty.title', { repo: snapshot.repository })} body={t('empty.body')} action={chooseButton('lg')} />);
  }

  const shown = tracks ?? EMPTY_TRACKS;
  const headline = headlineOf(shown);
  const headlineText = !tracks ? null : headline.kind === 'idle'
    ? t('headline.idle', { repo: snapshot?.repository ?? folder })
    : t(`headline.${headline.kind}`, { count: headline.count });

  return (
    <main id="main" data-work-status-surface aria-busy={!tracks} className="flex h-[calc(100%_-_var(--topology-mobile-bottom-tab-reserve))] min-h-0 flex-col overflow-y-auto bg-[color:var(--color-canvas)] pb-10 text-[color:var(--color-text-primary)] lg:h-full">
      <PageHeaderBar
        frame="page"
        title={t('title')}
        meta={snapshot ? (
          <span className="truncate text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t('repoLine', { repo: snapshot.repository, count: shown.worktreeCount })}
          </span>
        ) : null}
        actions={chooseButton('sm')}
      />
      <div className={cn(PAGE_FRAME, 'flex flex-col gap-5 md:pt-8 [--work-sticky-top:3.75rem]')}>
        <div className="flex min-h-15 flex-col justify-end gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {headlineText ? (
              <motion.h2
                key={headlineText}
                data-testid="work-status-headline"
                initial={reduced ? OVERLAY_RISE_REDUCED : OVERLAY_RISE}
                animate={OVERLAY_SETTLED}
                exit={{ opacity: 0, transition: EXIT_TRANSITION }}
                transition={reduced ? MOTION.fast : MOTION.slow}
                className="text-hero leading-hero font-[var(--font-weight-strong)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
              >
                {headlineText}
              </motion.h2>
            ) : null}
          </AnimatePresence>
          <p data-testid="work-status-summary" className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
            {tracks ? t.rich('summary', {
              ...shown.counts,
              runningCount: () => <strong className={COUNT_CLASS}><SwapText value={String(shown.counts.running)} /></strong>,
              stuckCount: () => <strong className={COUNT_CLASS}><SwapText value={String(shown.counts.stuck)} ink={shown.counts.stuck > 0 ? 'text-[color:var(--color-danger-text-strong)]' : undefined} /></strong>,
              readyCount: () => <strong className={COUNT_CLASS}><SwapText value={String(shown.counts.ready)} /></strong>,
            }) :' '}
          </p>
        </div>
        <WorkTracksBoard
          tracks={shown}
          folder={folder}
          host={snapshot?.host ?? null}
          baseBranch={snapshot?.baseBranch ?? 'main'}
          nowMs={readAtMs}
          reading={!tracks}
        />
      </div>
    </main>
  );
}
