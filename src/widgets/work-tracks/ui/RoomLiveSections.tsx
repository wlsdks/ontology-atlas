'use client';

import { useLocale, useTranslations } from 'next-intl';
import { outsideGroupsOf, roomLoadOf } from '@/shared/lib/work-status/signals/load';
import { SESSION_LINES_LISTED } from '@/shared/lib/work-status/signals/session-lines';
import type { RoomEntry, WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { InfoHint } from '@/shared/ui';
import type { BuildingLive, RoomLive } from '../model/room-live';
import { PanelSection as Section } from './panel-parts';
import { SessionLineRow } from './SessionLineRow';
import type { useRoomCopy } from './use-room-copy';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const BODY = 'text-body leading-body';
const NOTE = `${BODY} text-[color:var(--color-text-tertiary)]`;
const FACT = `${BODY} tabular-nums text-[color:var(--color-text-primary)]`;

/** Every session at work in the room, up to twenty, each on its own line. */
export function SessionsSection({ live, copy }: { live: RoomLive; copy: RoomCopy }) {
  const t = useTranslations('workStatus');
  if (live.lines.length === 0) return null;
  return (
    <Section title={t('panel.sessionsTitle')}>
      <ul className={BODY} data-testid="work-room-panel-sessions">
        {live.lines.slice(0, SESSION_LINES_LISTED).map(line => <SessionLineRow key={line.key} line={copy.sessionLine(line)} place="panel" />)}
      </ul>
    </Section>
  );
}

/** What the file-change pulse counted here: the last minute and hour, or why it cannot say. */
export function PulseSection({ live }: { live: RoomLive }) {
  const t = useTranslations('workStatus');
  if (live.pulseStatus === 'off' || live.pulseStatus === 'unsupported') return null;
  const pulse = live.pulse;
  return (
    <Section title={t('panel.pulseTitle')}>
      <div className="flex flex-col gap-1" data-testid="work-room-panel-pulse">
        {pulse === null ? (
          <p className={NOTE}>{t('panel.reading')}</p>
        ) : !pulse.watched ? (
          <p className={NOTE}>{t('pulse.unwatched')}</p>
        ) : pulse.lastHour === 0 ? (
          <>
            <p className={NOTE}>{t('pulse.none')}</p>
            <p className={NOTE}>{t('pulse.onlyOpen')}</p>
          </>
        ) : (
          <>
            {pulse.lastMinute > 0 ? <p className={FACT}>{t('pulse.lastMinute', { count: pulse.lastMinute })}</p> : null}
            <p className={FACT}>{t('pulse.lastHour', { count: pulse.lastHour })}</p>
            <p className={NOTE}>{t('pulse.onlyOpen')}</p>
          </>
        )}
      </div>
    </Section>
  );
}

/**
 * The room's memory and CPU by tool, then one line for this Mac and what runs outside every room.
 * A failed sample says so and shows no number; the first sample after a pause has no CPU figure yet.
 */
export function LoadSection({ room, live, building, tracks, copy }: { room: RoomEntry; live: RoomLive; building: BuildingLive; tracks: WorkTracks; copy: RoomCopy }) {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  if (live.loadStatus === 'off' || live.loadStatus === 'unsupported') return null;
  const sample = building.load.sample;
  const body = (() => {
    if (live.loadStatus === 'pending') return <p className={NOTE}>{t('panel.reading')}</p>;
    if (live.loadStatus === 'failed' || sample === null) return <p className={NOTE} data-testid="work-room-panel-load-failed">{t('load.failed')}</p>;
    const load = roomLoadOf(live.load);
    const mac = sample.mac;
    const branchOf = (worktreeId: string) => {
      const track = [...tracks.stuck, ...tracks.unheld, ...tracks.merged, ...tracks.sessions.flatMap(session => session.tracks)].find(each => each.key === worktreeId);
      return track?.branch ?? track?.title ?? worktreeId;
    };
    const whoOf = (pid: number) => {
      const session = building.sessions.sessionsByPid.get(pid) ?? null;
      return building.namesByPid.get(pid) ?? copy.sessionName(session) ?? t('tool.unknown');
    };
    const outside = outsideGroupsOf(sample);
    const list = new Intl.ListFormat(locale, { type: 'conjunction' });
    return (
      <>
        {load === null ? (
          <p className={NOTE}>{t('load.none')}</p>
        ) : load.cpuCores === null ? (
          <p className={NOTE}>{t('panel.reading')}</p>
        ) : (
          <>
            <p className={FACT}>{t('load.room', { memory: copy.memory(load.memoryBytes), cores: copy.cores(load.cpuCores), total: mac?.coreCount ?? '–' })}</p>
            {load.groups.length > 0 ? (
              <ul className="flex flex-col gap-0.5" data-testid="work-room-panel-load-groups">
                {load.groups.map(group => <li key={group.tool} className={`${BODY} tabular-nums text-[color:var(--color-text-secondary)]`}>{copy.groupLine(group)}</li>)}
                {load.moreGroups > 0 ? <li className={NOTE}>{t('load.moreGroups', { count: load.moreGroups })}</li> : null}
              </ul>
            ) : null}
            {load.agentsElsewhere.map(agent => (
              <p key={agent.pid} className={NOTE}>{t('load.agentElsewhere', { who: whoOf(agent.pid), branch: branchOf(agent.worktreeId) })}</p>
            ))}
          </>
        )}
        {mac ? (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-[color:var(--color-border-soft)] pt-2" data-testid="work-room-panel-mac">
            {mac.gpuPercent !== null ? (
              <div className={`${FACT} flex items-center gap-1.5`}>
                <span className="min-w-0">
                  {t('load.mac', { used: copy.memory(mac.memoryUsedBytes), total: copy.memory(mac.memoryTotalBytes), cores: copy.cores(mac.cpuCores), coreCount: mac.coreCount, gpu: Math.round(mac.gpuPercent) })}
                </span>
                <InfoHint label={t('load.gpuWhy')}>{t('load.gpuWhy')}</InfoHint>
              </div>
            ) : (
              <>
                <p className={FACT}>{t('load.macNoGpu', { used: copy.memory(mac.memoryUsedBytes), total: copy.memory(mac.memoryTotalBytes), cores: copy.cores(mac.cpuCores), coreCount: mac.coreCount })}</p>
                <p className={NOTE}>{t('load.gpuMissing')}</p>
              </>
            )}
            {outside.length > 0 ? (
              <p className={NOTE}>{t('load.outside', { list: list.format(outside.map(group => `${copy.loadTool(group)} ×${group.count}`)) })}</p>
            ) : null}
          </div>
        ) : null}
      </>
    );
  })();
  return (
    <Section title={t('panel.loadTitle')}>
      <div className="flex flex-col gap-1" data-testid="work-room-panel-load" data-room={room.key}>{body}</div>
    </Section>
  );
}
