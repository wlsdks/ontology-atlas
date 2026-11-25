'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useTranslations } from 'next-intl';
import { FolderGit2 } from 'lucide-react';
import { useLocalVault } from '@/entities/vault-session';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { useFilePulseEnabled, useLoadReadEnabled, useSessionListReadEnabled, useSessionNamesEnabled } from '@/shared/lib/preferences/work-status-preferences';
import { pickTauriSourceDirectory } from '@/shared/lib/vault-folder/native-vault/tauri-project-source';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { isWorkStatusAvailable } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks, folderName, planRooms, withActivity } from '@/shared/lib/work-status/work-tracks';
import { withAgentSessions } from '@/shared/lib/work-status/signals/sessions';
import { heaviestRooms } from '@/shared/lib/work-status/signals/load';
import { withChangeSigns } from '@/shared/lib/work-status/signals/pulse';
import { listedFolders, sessionsByPidOf } from '@/shared/lib/work-status/signals/session-lines';
import { sessionNameOf } from '@/shared/lib/work-status/signals/session-name';
import { Button, InfoHint, PageHeaderBar } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PAGE_FRAME_FORM, PAGE_STAGE_FILL } from '@/shared/ui/tokens/page-frame';
import { EmptyRoom, QuietBuilding, RoomShelf, WorkBuilding, pointToRoomKeys, pointToRooms, usePulseClock, type BuildingLive, type RoomAlert } from '@/widgets/work-tracks';
import { useMinuteClock } from '../model/use-minute-clock';
import { useRunningMemory } from '../model/use-running-memory';
import { useSessionIdentity } from '../model/use-session-identity';
import { sessionListLine } from '../model/session-list-line';
import { useAgentSessions } from '../model/use-agent-sessions';
import { useFilePulse } from '../model/use-file-pulse';
import { useSessionStateSince } from '../model/use-session-state-since';
import { useWorktreeLoad } from '../model/use-worktree-load';
import { useWorkStatus } from '../model/use-work-status';
import { useWorktreeActivity } from '../model/use-worktree-activity';
import { landedReadKey, useLandedChanges } from '../model/use-landed-changes';
import { WorkStatusReads } from './WorkStatusReads';
import { WorkStatusStage } from './WorkStatusStage';

const subscribe = () => () => {};
const webSnapshot = () => false;
const MAIN_CLASS = 'flex min-h-full flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]';
const BRANCH_CLASS = 'font-mono';
const ALERT_CLASS = 'font-[var(--font-weight-emphasis)] text-[color:var(--color-status-warning)] underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

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
  const readyRoot = snapshot?.status === 'ready' ? snapshot.root : null;
  const sessionListOn = useSessionListReadEnabled();
  const namesOn = useSessionNamesEnabled();
  const pulseOn = useFilePulseEnabled();
  const loadOn = useLoadReadEnabled();
  const sessionList = useAgentSessions(readyRoot, sessionListOn, namesOn);
  const read = useMemo(() => (snapshot?.status === 'ready' ? withAgentSessions(buildWorkTracks(snapshot), sessionList.rows) : null), [snapshot, sessionList.rows]);
  const tracks = useSessionIdentity(read);
  const since = useSessionStateSince(sessionList.rows, sessionList.readAtMs, tracks);
  const seenRunningAt = useRunningMemory(tracks, readAtMs);
  const plan = useMemo(() => (tracks ? planRooms(tracks, nowMs, seenRunningAt) : null), [tracks, nowMs, seenRunningAt]);
  const roomKeys = useMemo(() => (plan ? [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)].map(room => room.key) : []), [plan]);
  const runningKeys = useMemo(
    () => new Set(plan ? [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)].filter(room => room.track.running).map(room => room.key) : []),
    [plan],
  );
  const pulse = useFilePulse(readyRoot, roomKeys, pulseOn);
  const pulseNowMs = usePulseClock(pulse.worktrees, nowMs);
  const changedAt = useMemo(
    () => new Map([...pulse.worktrees].flatMap(([key, worktree]) => (worktree.lastChangeAtMs === null ? [] : [[key, worktree.lastChangeAtMs] as const]))),
    [pulse.worktrees],
  );
  // A counted change is a sign of work: it keeps a held room from dozing, and promotes none.
  const signsOfWork = useMemo(() => withChangeSigns(seenRunningAt, pulse.worktrees), [seenRunningAt, pulse.worktrees]);
  const load = useWorktreeLoad(readyRoot, loadOn);
  const live = useMemo<BuildingLive>(() => ({
    sessions: { sessionsByPid: sessionsByPidOf(tracks?.sessions ?? []), listedIn: listedFolders(sessionList.rows), since },
    namesByPid: new Map(sessionList.rows.flatMap(row => {
      const name = sessionNameOf(row.name);
      return name ? [[row.pid, name] as const] : [];
    })),
    pulse: { status: pulse.status, worktrees: pulse.worktrees, flashes: pulse.flashes, nowMs: pulseNowMs },
    load: { status: load.status, sample: load.sample },
  }), [tracks, sessionList.rows, since, pulse, pulseNowMs, load.status, load.sample]);
  const activity = useWorktreeActivity(readyRoot, snapshot?.baseBranch ?? null, roomKeys, runningKeys, changedAt);
  const headsKey = useMemo(() => (snapshot?.status === 'ready' ? landedReadKey(snapshot.worktrees) : null), [snapshot]);
  const landed = useLandedChanges(snapshot?.status === 'ready' ? snapshot.root : null, snapshot?.baseBranch ?? null, headsKey);
  const shownTracks = useMemo(() => (tracks ? withActivity(tracks, activity) : null), [tracks, activity]);
  const sameFolder = tracks ? [...tracks.sessions.flatMap(session => session.tracks), ...tracks.unheld].filter(track => track.running && track.tools.length > 1).length : 0;
  const cleanup = tracks?.stuck.length ?? 0;
  const waiting = plan ? [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)].filter(room => room.state.kind === 'waiting').length : 0;
  const reduced = usePrefersReducedMotion();
  const alerts = [
    waiting > 0 ? { kind: 'waiting' as RoomAlert, label: t('header.waiting', { count: waiting }) } : null,
    sameFolder > 0 ? { kind: 'sameFolder' as RoomAlert, label: t('header.sameFolder', { count: sameFolder }) } : null,
    cleanup > 0 ? { kind: 'cleanup' as RoomAlert, label: t('header.cleanup', { count: cleanup }) } : null,
  ].filter(alert => alert !== null);
  const sample = load.sample;
  const loadAlerts = [
    load.pressure.memory.warning && sample ? { kind: 'memory' as const, label: t('header.memory'), rooms: heaviestRooms(sample, 'memory') } : null,
    load.pressure.cpu.warning && sample ? { kind: 'cpu' as const, label: t('header.cpu'), rooms: heaviestRooms(sample, 'cpu') } : null,
  ].filter(alert => alert !== null);
  const gpuFull = load.pressure.gpu.warning && sample !== null;

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
          <span className="flex min-w-0 items-center gap-2">
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
                  className={ALERT_CLASS}
                >
                  {alert.label}
                </button>
              </span>
            ))}
            {loadAlerts.map(alert => (
              <span key={alert.kind}>
                {' · '}
                <button
                  type="button"
                  data-testid={`work-status-alert-${alert.kind}`}
                  title={t('header.pointToLoad')}
                  onClick={() => pointToRoomKeys(alert.rooms, reduced)}
                  className={ALERT_CLASS}
                >
                  {alert.label}
                </button>
              </span>
            ))}
            {gpuFull ? (
              <span>
                {' · '}
                <span data-testid="work-status-alert-gpu" className="font-[var(--font-weight-emphasis)] text-[color:var(--color-status-warning)]">{t('header.gpu')}</span>
              </span>
            ) : null}
          </span>
          {gpuFull ? <InfoHint label={t('load.gpuWhy')} align="left">{t('load.gpuWhy')}</InfoHint> : null}
          <WorkStatusReads line={sessionListLine(sessionList.status)} choices={{ names: namesOn, pulse: pulseOn, load: loadOn }} />
          <InfoHint label={t('about.label')} align="left">{t('about.body')}</InfoHint>
          </span>
        ) : null}
        actions={chooseButton('sm')}
      />
      {plan === null || tracks === null ? (
        <div className="min-h-0 flex-1" />
      ) : onlyMain ? (
        <QuietBuilding landed={landed} root={snapshot?.root ?? root} baseBranch={baseBranch} nowMs={nowMs}>
          <EmptyRoom className="flex-none py-10" branch={baseBranch} title={t.rich('empty.title', { branch: baseBranch, code: branch })} body={t('empty.body')} />
        </QuietBuilding>
      ) : empty ? (
        <QuietBuilding landed={landed} root={snapshot?.root ?? root} baseBranch={baseBranch} nowMs={nowMs}>
          <EmptyRoom className="flex-none py-10" branch={baseBranch} title={t('quiet.title', { repo: snapshot?.repository ?? folder })} body={t('quiet.body')}>
            <div className="relative h-10">
              <RoomShelf merged={plan.shelf.merged} untouched={plan.shelf.untouched} baseBranch={baseBranch} nowMs={nowMs} />
            </div>
          </EmptyRoom>
        </QuietBuilding>
      ) : (
        <WorkBuilding tracks={shownTracks ?? tracks} live={live} seenRunningAt={signsOfWork} baseBranch={baseBranch} nowMs={nowMs} root={snapshot?.root ?? root} landed={landed} />
      )}
    </main>
  );
}
