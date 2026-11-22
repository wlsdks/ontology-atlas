'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { folderName, type RoomEntry, type SessionTool, type Track, type TrackSession } from '@/shared/lib/work-status/work-tracks';
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

/** A commit on the screen: its subject as plain text and when it landed. */
export interface ScreenCommit {
  /** The commit's hash: a row keeps its element while newer commits push it down. */
  key: string;
  subject: string;
  ago: string | null;
}

/** The screen's last line: what is not committed, or what the room needs said. */
export interface LastLine {
  text: string;
  /** The name of the uncommitted file changed last, drawn in mono after the text. */
  file: string | null;
  tone: 'plain' | 'warning';
}

/** What a large room's screen and its bezel say. */
export interface MonitorCopy {
  branch: string;
  /** The session, or sessions, on the bezel; `null` when no session holds the folder. */
  who: string | null;
  state: StatusLine;
  /** Newest first, at most three. */
  commits: ScreenCommit[];
  /** In place of commits when there are none to list: no commits beyond the base, or the prune command. */
  note: string | null;
  lastLine: LastLine | null;
  /** The commits beyond the base branch, at the end of the last line. */
  count: string | null;
}

/** A mini room's newest subject with its time. */
export interface MiniSubject {
  subject: string;
  ago: string | null;
}

/** The most commits a screen lists. */
export const SCREEN_COMMITS = 3;

/**
 * Every sentence a room says, from its entry and the clock; the only place room copy is chosen. It
 * stays the same object until the minute, the locale or the base branch changes, so a room whose
 * entry did not change need not draw again.
 */
export function useRoomCopy(baseBranch: string, nowMs: number) {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  return useMemo(() => roomCopy(t, locale, baseBranch, nowMs), [t, locale, baseBranch, nowMs]);
}

function roomCopy(t: ReturnType<typeof useTranslations<'workStatus'>>, locale: string, baseBranch: string, nowMs: number) {

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
  /** How long the session has worked, short, on the bezel beside its state. */
  const workedFor = (session: TrackSession | null) => {
    if (!session?.startedAt) return null;
    const minutes = Math.max(1, Math.floor((nowMs - session.startedAt * 1000) / MINUTE_MS));
    return minutes < 60
      ? t('monitor.workedMinutes', { count: minutes })
      : minutes % 60 === 0
        ? t('monitor.workedWholeHours', { count: minutes / 60 })
        : t('monitor.workedHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  };
  const agoOf = (at: number | null) => (at === null ? null : timeAgo(at, nowMs, locale));
  /** The newest commits beyond the base branch as plain text; a subject left empty shows its hash. */
  const screenCommits = (track: Track): ScreenCommit[] =>
    (track.activity?.commits ?? []).slice(0, SCREEN_COMMITS).map(line => ({ key: line.hash, subject: line.subject || line.hash, ago: agoOf(line.at) }));
  /** The newest subject a mini room shows in place of its last commit's age. */
  const newestSubject = (track: Track): MiniSubject | null => {
    const newest = track.activity?.commits?.[0];
    return newest ? { subject: newest.subject || newest.hash, ago: agoOf(newest.at) } : null;
  };
  /** What is not committed: how many files and the one changed last, or that everything is committed. */
  const uncommitted = (track: Track): LastLine | null => {
    const activity = track.activity;
    if (activity?.uncommitted == null) return null;
    if (activity.uncommitted === 0) return { text: t('git.clean'), file: null, tone: 'plain' };
    return {
      text: t('git.uncommitted', { count: activity.uncommitted }),
      file: activity.latestFile ? folderName(activity.latestFile) : null,
      tone: 'plain',
    };
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

  /** The bezel's state: its few words and how long, or since when. */
  function bezelState(room: RoomEntry): StatusLine {
    const { state, track } = room;
    switch (state.kind) {
      case 'working':
        return { lead: t(state.tools.length > 1 ? 'room.twoTools' : 'room.working'), tone: state.tools.length > 1 ? 'warning' : 'ink', rest: workedFor(room.session) };
      case 'resting':
        return { lead: t('room.resting'), tone: 'plain', rest: lastCommit(track) };
      case 'dozing':
        return { lead: quietFor(state.quietSinceMs), tone: 'plain', rest: lockedAt(track) };
      case 'locked':
        return { lead: t('room.locked'), tone: 'plain', rest: lockedAt(track) };
      case 'lockLeft':
        return { lead: t('room.lockLeft'), tone: 'warning', rest: t('session.ended') };
      case 'merged':
      case 'missing':
      case 'unheld':
        return status(room);
    }
  }

  function monitor(room: RoomEntry): MonitorCopy {
    const { state, track } = room;
    const others = room.guests.map(guest => sessionName(guest)).filter((name): name is string => name !== null);
    const who = [sessionName(room.session), ...others].filter((name): name is string => name !== null).join(' · ') || null;
    const listed = screenCommits(track);
    const notInBase = state.kind === 'lockLeft' && track.ahead ? t('room.notInBase', { count: track.ahead, branch: baseBranch }) : null;
    const files = uncommitted(track);
    const lastLine: LastLine | null = state.kind === 'missing'
      ? null
      : notInBase
        ? { text: [notInBase, files?.file ? files.text : null].filter(Boolean).join(' · '), file: files?.file ?? null, tone: 'warning' }
        : files;
    const note = listed.length > 0
      ? null
      : state.kind === 'missing'
        ? t.markup('monitor.prune', { code: chunks => chunks })
        : state.kind === 'locked'
          ? t('monitor.unreadableLock')
          : sinceBase(track);
    return {
      branch: track.branch ?? track.title,
      who,
      state: bezelState(room),
      commits: listed,
      note,
      lastLine,
      count: notInBase ? null : track.ahead && track.ahead > 0 ? t('room.commits', { count: track.ahead }) : null,
    };
  }

  return { toolName, sessionName, owner, status, monitor, newestSubject, uncommitted, screenCommits };
}
