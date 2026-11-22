'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { RoomEntry, SessionTool, Track, TrackSession } from '@/shared/lib/work-status/work-tracks';
import { clockTime, timeAgo } from '../model/format';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type StatusTone = 'ink' | 'warning' | 'success' | 'plain';

/** One status line: the state in a few words, and the fact beside it. */
export interface StatusLine {
  lead: string;
  tone: StatusTone;
  rest: string | null;
}

export interface MonitorCopy {
  label: string;
  labelInk: boolean;
  aside: string | null;
  figure: string | null;
  figureTone: 'plain' | 'success';
  note: string | null;
  /** The screen's terminal rows: real facts of this worktree, so no two monitors read alike. */
  rows: string[];
  /** A cursor blinks after the last row while the room's work runs. */
  live: boolean;
}

/** Every sentence a room says, from its entry and the clock; the only place room copy is chosen. */
export function useRoomCopy(baseBranch: string, nowMs: number) {
  const t = useTranslations('workStatus');
  const locale = useLocale();

  const toolName = (tool: SessionTool) =>
    t(tool === 'acp' ? 'tool.acp' : tool === 'claudeCode' ? 'tool.claudeCode' : tool === 'codex' ? 'tool.codex' : 'tool.unknown');
  const sessionName = (session: TrackSession | null) =>
    session === null ? null : session.tool === 'acp' ? toolName('acp') : t('session.name', { tool: toolName(session.tool), number: session.ordinal });
  const quietFor = (sinceMs: number | null) => {
    const elapsed = Math.max(MINUTE_MS, nowMs - (sinceMs ?? nowMs));
    if (elapsed < HOUR_MS) return t('room.quietMinutes', { count: Math.floor(elapsed / MINUTE_MS) });
    if (elapsed < 2 * DAY_MS) return t('room.quietHours', { count: Math.floor(elapsed / HOUR_MS) });
    return t('room.quietDays', { count: Math.floor(elapsed / DAY_MS) });
  };
  const commits = (track: Track) =>
    track.standing === 'unknown' || track.ahead === null ? null : track.ahead > 0 ? t('room.commits', { count: track.ahead }) : t('room.noCommits');
  const lockedAt = (track: Track) => (track.lockedAt ? t('monitor.lockedAt', { time: clockTime(track.lockedAt, nowMs, locale) }) : null);
  /** Only what the belt cannot show: no commits beyond the base branch, or no comparison read. */
  const sinceBase = (track: Track) =>
    track.standing === 'unknown' || track.ahead === null
      ? t('monitor.notMeasured', { branch: baseBranch })
      : track.ahead > 0 ? null : t('monitor.noCommitsNote', { branch: baseBranch });
  /** How long the session has worked, in hours and minutes: what tells two running rooms apart at a glance. */
  const workingFor = (session: TrackSession | null) => {
    if (!session?.startedAt) return null;
    const minutes = Math.max(1, Math.floor((nowMs - session.startedAt * 1000) / MINUTE_MS));
    return minutes < 60
      ? t('monitor.workingMinutes', { count: minutes })
      : minutes % 60 === 0
        ? t('monitor.workingWholeHours', { count: minutes / 60 })
        : t('monitor.workingHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };
  const lastCommit = (track: Track) => (track.lastCommitAt === null ? null : t('room.lastCommit', { ago: timeAgo(track.lastCommitAt, nowMs, locale) }));

  /** Who a room belongs to, under a mini room's status when there is room for it. */
  const owner = (room: RoomEntry) =>
    sessionName(room.session) ?? (room.state.kind === 'lockLeft' ? t('session.ended') : t('session.none'));

  function status(room: RoomEntry): StatusLine {
    const { state, track } = room;
    switch (state.kind) {
      case 'working':
        return { lead: t(state.tools.length > 1 ? 'room.twoTools' : 'room.working'), tone: state.tools.length > 1 ? 'warning' : 'ink', rest: commits(track) };
      case 'resting':
        return { lead: t('room.resting'), tone: 'plain', rest: commits(track) };
      case 'dozing':
        return { lead: quietFor(state.quietSinceMs), tone: 'plain', rest: null };
      case 'merged':
        return { lead: t('room.merged', { branch: baseBranch }), tone: 'success', rest: null };
      case 'locked':
        return { lead: t('room.locked'), tone: 'plain', rest: commits(track) };
      case 'lockLeft':
        return { lead: t('room.lockLeft'), tone: 'warning', rest: commits(track) };
      case 'missing':
        return { lead: t('room.missing'), tone: 'warning', rest: t('room.onlyInGit') };
      case 'unheld': {
        const days = state.lastCommitAt === null ? 0 : Math.floor((nowMs - state.lastCommitAt * 1000) / DAY_MS);
        return days >= 1
          ? { lead: t('room.untouched', { count: days }), tone: 'plain', rest: commits(track) }
          : { lead: lastCommit(track) ?? t('session.none'), tone: 'plain', rest: commits(track) };
      }
    }
  }

  function monitor(room: RoomEntry): MonitorCopy {
    const { state, track } = room;
    const quiet = { labelInk: false, aside: null, figureTone: 'plain', rows: [] as string[], live: false } as const;
    const rows = (...facts: (string | null)[]) => facts.filter((fact): fact is string => fact !== null);
    switch (state.kind) {
      case 'working':
        return state.tools.length > 1
          ? {
            ...quiet,
            label: state.tools.map(toolName).join(' · '),
            labelInk: true,
            aside: commits(track),
            figure: t('monitor.twoTools'),
            note: t('monitor.twoToolsNote'),
          }
          : { ...quiet, label: t('monitor.running'), labelInk: true, figure: commits(track), note: null, rows: rows(workingFor(room.session), lastCommit(track)), live: true };
      case 'resting':
        return { ...quiet, label: t('monitor.idle'), figure: commits(track) ?? t('room.resting'), note: sinceBase(track), rows: rows(lastCommit(track), lockedAt(track)) };
      case 'dozing':
        return { ...quiet, label: t('monitor.idle'), aside: lockedAt(track), figure: quietFor(state.quietSinceMs), note: sinceBase(track) };
      case 'merged':
        return {
          ...quiet,
          label: sessionName(room.session) ?? t('session.none'),
          figure: t('room.merged', { branch: baseBranch }),
          figureTone: 'success',
          note: room.session ? t('monitor.heldBy', { session: sessionName(room.session) ?? '' }) : null,
        };
      case 'locked':
        return { ...quiet, label: t('room.locked'), aside: lockedAt(track), figure: commits(track) ?? t('room.locked'), note: t('monitor.unreadableLock') };
      case 'lockLeft':
        return {
          ...quiet,
          label: t('monitor.ended'),
          aside: commits(track),
          figure: t('room.lockLeft'),
          note: sinceBase(track),
        };
      case 'missing':
        return { ...quiet, label: t('monitor.noSession'), figure: t('room.missing'), note: t.markup('monitor.prune', { code: chunks => chunks }) };
      case 'unheld':
        return { ...quiet, label: t('monitor.noSession'), aside: commits(track), figure: status(room).lead, note: lastCommit(track) };
    }
  }

  return { toolName, sessionName, owner, status, monitor };
}
