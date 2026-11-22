'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useTranslations } from 'next-intl';
import { FolderGit2 } from 'lucide-react';
import { useLocalVault } from '@/entities/vault-session';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { pickTauriSourceDirectory } from '@/shared/lib/vault-folder/native-vault/tauri-project-source';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { isWorkStatusAvailable } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, folderName, planRooms, withActivity } from '@/shared/lib/work-status/work-tracks';
import { Button, PageHeaderBar } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PAGE_FRAME_FORM, PAGE_STAGE_FILL } from '@/shared/ui/tokens/page-frame';
import { EmptyRoom, RoomShelf, WorkBuilding, pointToRooms, type RoomAlert } from '@/widgets/work-tracks';
import { useMinuteClock } from '../model/use-minute-clock';
import { useRunningMemory } from '../model/use-running-memory';
import { useSessionIdentity } from '../model/use-session-identity';
import { useWorkStatus } from '../model/use-work-status';
import { useWorktreeActivity } from '../model/use-worktree-activity';
import { WorkStatusStage } from './WorkStatusStage';

const subscribe = () => () => {};
const webSnapshot = () => false;
const MAIN_CLASS = 'flex min-h-full flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]';
const BRANCH_CLASS = 'font-mono';

export function WorkStatusPage() {
  const t = useTranslations('workStatus');
  const git = useTranslations('atlasGit');
  const native = useSyncExternalStore(subscribe, isWorkStatusAvailable, webSnapshot);
  const vault = useLocalVault();
  const [chosen, setChosen] = useArrivalMemory<string | null>('work-status:repository', null);
  const vaultRoot = native && vault.handle ? getTauriVaultRootPath(vault.handle) ?? null : null;
  const root = native ? chosen ?? vaultRoot : null;
  const { snapshot, failed, readAtMs } = useWorkStatus(root);
  const nowMs = useMinuteClock(readAtMs);
  const read = useMemo(() => (snapshot?.status === 'ready' ? buildWorkTracks(snapshot) : null), [snapshot]);
  const tracks = useSessionIdentity(read);
  const seenRunningAt = useRunningMemory(tracks, readAtMs);
  const plan = useMemo(() => (tracks ? planRooms(tracks, nowMs, seenRunningAt) : null), [tracks, nowMs, seenRunningAt]);
  const roomKeys = useMemo(() => (plan ? [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)].map(room => room.key) : []), [plan]);
  const runningKeys = useMemo(
    () => new Set(plan ? [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)].filter(room => room.track.running).map(room => room.key) : []),
    [plan],
  );
  const activity = useWorktreeActivity(snapshot?.status === 'ready' ? snapshot.root : null, snapshot?.baseBranch ?? null, roomKeys, runningKeys);
  const shownTracks = useMemo(() => (tracks ? withActivity(tracks, activity) : null), [tracks, activity]);
  const sameFolder = tracks ? [...tracks.sessions.flatMap(session => session.tracks), ...tracks.unheld].filter(track => track.running && track.tools.length > 1).length : 0;
  const cleanup = tracks?.stuck.length ?? 0;
  const reduced = usePrefersReducedMotion();
  const alerts = [
    sameFolder > 0 ? { kind: 'sameFolder' as RoomAlert, label: t('header.sameFolder', { count: sameFolder }) } : null,
    cleanup > 0 ? { kind: 'cleanup' as RoomAlert, label: t('header.cleanup', { count: cleanup }) } : null,
  ].filter(alert => alert !== null);

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
  if (status === 'no-history') {
    return stagePage(<WorkStatusStage state="not-repository" title={t('notRepository', { folder })} action={chooseButton('lg')} />);
  }

  const baseBranch = snapshot?.baseBranch ?? 'main';
  const branch = (chunks: React.ReactNode) => <code className={BRANCH_CLASS}>{chunks}</code>;
  const empty = plan !== null && plan.stage.length === 0 && plan.floors.length === 0;
  const onlyMain = empty && snapshot !== null && snapshot.worktrees.length <= 1;

  return (
    <main id="main" data-work-status-surface aria-busy={!plan} className="flex h-[calc(100%_-_var(--topology-mobile-bottom-tab-reserve))] min-h-0 flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)] lg:h-full">
      <PageHeaderBar
        frame="page"
        title={t('title')}
        className="md:[&>[data-page-header-row]]:px-10"
        meta={snapshot ? (
          <span className="truncate text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t('repoLine', { repo: snapshot.repository, count: snapshot.worktrees.length })}
            {alerts.map(alert => (
              <span key={alert.kind}>
                {' · '}
                <button
                  type="button"
                  data-testid={`work-status-alert-${alert.kind}`}
                  title={t('header.pointTo')}
                  onClick={() => pointToRooms(alert.kind, reduced)}
                  className="font-[var(--font-weight-emphasis)] text-[color:var(--color-status-warning)] underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
                >
                  {alert.label}
                </button>
              </span>
            ))}
          </span>
        ) : null}
        actions={chooseButton('sm')}
      />
      {plan === null || tracks === null ? (
        <div className="min-h-0 flex-1" />
      ) : onlyMain ? (
        <EmptyRoom branch={baseBranch} title={t.rich('empty.title', { branch: baseBranch, code: branch })} body={t('empty.body')} />
      ) : empty ? (
        <EmptyRoom branch={baseBranch} title={t('quiet.title', { repo: snapshot?.repository ?? folder })} body={t('quiet.body')}>
          <div className="relative h-10">
            <RoomShelf merged={plan.shelf.merged} untouched={plan.shelf.untouched} baseBranch={baseBranch} nowMs={nowMs} inline={false} />
          </div>
        </EmptyRoom>
      ) : (
        <WorkBuilding tracks={shownTracks ?? tracks} seenRunningAt={seenRunningAt} baseBranch={baseBranch} nowMs={nowMs} />
      )}
    </main>
  );
}
