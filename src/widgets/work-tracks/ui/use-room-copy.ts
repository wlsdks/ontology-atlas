'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { folderName, type RoomEntry, type SessionTool, type Track, type TrackSession } from '@/shared/lib/work-status/work-tracks';
import { formatSize } from '@/shared/lib/format-size';
import { showsLoadFact, type SessionLoadFacts } from '@/shared/lib/work-status/signals/load';
import { PULSE_HOUR_MS, changesWithoutAgent, type PulseFacts, type TickHeight } from '@/shared/lib/work-status/signals/pulse';
import { BLOCK_FOLDERS_SHOWN, isWaitingBlock, type SessionBlock, type SessionFolder } from '@/shared/lib/work-status/signals/session-board';
import type { SessionLine } from '@/shared/lib/work-status/signals/session-lines';
import type { LoadGroup, WorktreeLoad } from '@/shared/lib/work-status/tauri-work-status';
import { changedAreas } from '../model/changed-areas';
import { clockTime, timeAgo } from '../model/format';
import { screenSessionLines, type RoomLive } from '../model/room-live';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** A file written this lately reads as being worked on now; one written within the hour as recent. */
const FRESH_NOW_S = 10 * 60;
const FRESH_RECENT_S = 60 * 60;

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

/** An uncommitted file on the screen: its name, the folder it is in, and how long ago it was written. */
export interface ScreenFile {
  path: string;
  name: string;
  folder: string | null;
  ago: string | null;
  /** When it was last written, in epoch seconds: a later time is a new write, which its row marks. */
  changedAt: number | null;
  /** How lately it was written, which its name's ink shows: within ten minutes, within the hour, or longer ago. */
  fresh: 'now' | 'recent' | 'old';
}

/** A folder the uncommitted files are in: its path, how many of the listed files it holds and when one was last written. */
export interface ScreenArea {
  path: string;
  /** The path as shown; the repository's root has a name of its own. */
  name: string;
  files: number;
  count: string;
  ago: string | null;
  fresh: ScreenFile['fresh'];
}

/** One change in the last hour, for the bezel's line: an uncommitted file where it was last written, or a commit where it landed. */
export interface ScreenBeat {
  key: string;
  kind: 'file' | 'commit';
  /** How long ago, as a share of the hour: 0 is now, 1 an hour ago. */
  age: number;
}

/** A counted file change's step on the last-hour line, under the marks: its age as a share of the hour, and its height. */
export interface ScreenTick {
  key: string;
  age: number;
  height: TickHeight;
}

/** Who the bezel names: one session's name with its tool and number beside it, how many sessions, or the folder's holder. */
export interface BezelWho {
  main: string;
  /** `{tool} {number}` beside a session's own name, in muted ink. */
  tag: string | null;
}

/** One session line, in words: its name or tool and number, its state, and since when. */
export interface SessionLineCopy {
  key: string;
  ink: number | null;
  main: string;
  tag: string | null;
  state: { text: string; tone: StatusTone } | null;
  since: string | null;
}

/** What a large room's screen and its bezel say. */
export interface MonitorCopy {
  branch: string;
  /** The session, or sessions, on the bezel; `null` when no session holds the folder. */
  who: string | null;
  state: StatusLine;
  /** Newest first, at most twenty; a screen shows as many as it has rows. */
  commits: ScreenCommit[];
  /** What the listed commits are: the ones the base branch lacks, or the base branch's own newest. */
  commitsTitle: { text: string; tone: 'plain' | 'warning' } | null;
  /** How long a working session has held the folder; the bezel says when the worktree last changed instead. */
  worked: string | null;
  /** How many files are not committed, or that all are; `null` until read. */
  filesTitle: string | null;
  /** The uncommitted files, last changed first. */
  files: ScreenFile[];
  /** The folders those files are in, the one written last first. */
  areas: ScreenArea[];
  /** What the folders' column lists; it says so when the read listed only the newest files. */
  areasTitle: string;
  /** The changes of the last hour, in no order. */
  beats: ScreenBeat[];
  /** The ten-second steps of the last hour with a counted file change. */
  ticks: ScreenTick[];
  /** What the last-hour line says to a screen reader. */
  hourLabel: string;
  /** `pulse.lastMinute` on the wall facts, while a change is under a minute old. */
  lastMinute: string | null;
  /** `load.fact` on the wall facts of a room that holds 1 GB or one core. */
  loadFact: string | null;
  /** Who the bezel names; `null` when no session holds the folder. */
  bezel: BezelWho | null;
  /** Two or more sessions: up to three lines under the branch, waiting first. */
  sessionLines: SessionLineCopy[];
  /** `sessionLine.more` after them. */
  moreSessions: string | null;
  /** In place of commits when there are none to list: no commits beyond the base, or the prune command. */
  note: string | null;
  lastLine: LastLine | null;
  /** The commits beyond the base branch, at the end of the last line. */
  count: string | null;
}

/** One folder on a session's block: its branch, and its own facts only when the session has it to itself. */
export interface FolderRowCopy {
  key: string;
  branch: string;
  /** Commits and uncommitted files, or who shares the folder; never a shared folder's figures. */
  facts: { text: string; tone: 'plain' | 'warning' }[];
  shared: boolean;
  /** When the folder last changed; `null` for a shared folder. */
  ago: string | null;
  /** The newest commit, on a block whose one folder is its own: what the session has been doing. */
  commits: ScreenCommit[];
}

/** One session on the by-session board. */
export interface SessionBlockCopy {
  key: string;
  ink: number | null;
  main: string;
  tag: string | null;
  state: { text: string; tone: StatusTone };
  /** Since when it says so, as its line in a room says it; else when its program started. */
  time: string | null;
  waiting: boolean;
  /** Its program, a command it runs, or an Atlas agent session is seen at work now. */
  running: boolean;
  folders: FolderRowCopy[];
  /** `bySession.moreFolders` after the rows shown. */
  more: string | null;
  /** Its own command tree's memory and CPU, then its heaviest programs; `null` without a figure. */
  load: SessionLoadCopy | null;
}

/** A session's figures as slots, so memory and CPU line up from block to block. */
export interface SessionLoadCopy {
  memory: string;
  cpu: string;
  tools: string | null;
}

/** A mini room's newest subject with its time. */
export interface MiniSubject {
  subject: string;
  ago: string | null;
}

/** The newest commits a session's block lists for the one folder it has to itself. */
const BLOCK_COMMITS = 1;
/** The most commits a screen lists. */
export const SCREEN_COMMITS = 20;
/** A room standing on the base branch lists this many of that branch's own commits: where it stands, not work of its own. */
export const BASE_SCREEN_COMMITS = 5;
/** A change this fresh reads as just now: reads are up to a beat apart, so no finer age is honest. */
const JUST_NOW_S = 60;
/** The stretch the bezel's line of changes covers. */
const BEAT_WINDOW_S = 60 * 60;

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
  const isJustNow = (at: number) => nowMs / 1000 - at < JUST_NOW_S;
  const agoOf = (at: number | null) => (at === null ? null : isJustNow(at) ? t('monitor.justNow') : timeAgo(at, nowMs, locale));
  /** When the worktree last changed, as far as the reads tell: its newest commit, or an uncommitted file written after it. */
  const lastChange = (track: Track, pulse: PulseFacts | null) => {
    if (pulse?.changedJustNow) return t('monitor.lastChangeNow');
    const counted = pulse?.lastChangeAtMs ? Math.floor(pulse.lastChangeAtMs / 1000) : 0;
    const at = Math.max(counted, track.lastCommitAt ?? 0, track.activity?.commits?.[0]?.at ?? 0, ...(track.activity?.files ?? []).map(file => file.changedAt ?? 0));
    return at <= 0 ? null : isJustNow(at) ? t('monitor.lastChangeNow') : t('monitor.lastChange', { ago: timeAgo(at, nowMs, locale) });
  };
  const ticks = (live: RoomLive | null): ScreenTick[] => {
    return (live?.pulse?.ticks ?? []).map(tick => ({
      key: `step:${tick.atMs}`,
      age: Math.round(Math.min(1, Math.max(0, (nowMs - tick.atMs) / PULSE_HOUR_MS)) * 1000) / 1000,
      height: tick.height,
    }));
  };
  const coresFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const memory = (bytes: number) => formatSize(bytes, locale);
  const cores = (count: number | null) => (count === null ? '–' : coresFormat.format(count));
  const loadFact = (load: WorktreeLoad | undefined) =>
    load && showsLoadFact(load) ? t('load.fact', { memory: memory(load.memoryBytes), cores: cores(load.cpuCores) }) : null;
  const loadTool = (group: LoadGroup) => t(`load.tool.${group.tool}`);
  const groupLine = (group: LoadGroup) => t('load.groupLine', { tool: loadTool(group), count: group.count, memory: memory(group.memoryBytes), cores: cores(group.cpuCores) });

  /** A session's tool and number, or the tool alone when Atlas holds no session for it. */
  const sessionTag = (line: SessionLine) =>
    line.tool === 'acp' || line.ordinal === null ? toolName(line.tool) : t('session.name', { tool: toolName(line.tool), number: line.ordinal });
  const lineState = (line: SessionLine): SessionLineCopy['state'] => {
    switch (line.state) {
      case 'waitingApproval':
        return { text: t('room.waitingApproval'), tone: 'warning' };
      case 'waitingAnswer':
        return { text: t('room.waitingAnswer'), tone: 'warning' };
      case 'failed':
        return { text: t('room.sessionFailed'), tone: 'warning' };
      case 'working':
        return { text: t('room.working'), tone: 'ink' };
      case 'replied':
        return { text: t('room.replied'), tone: 'plain' };
      case 'workingHere':
        return { text: t('sessionLine.workingHere'), tone: 'plain' };
      case null:
        return null;
    }
  };
  /** Since when the session says what it says: "for 12 min" from the read that saw it change, or its start. */
  const lineSince = (line: SessionLine) => {
    const since = line.since;
    if (!since || since.sinceMs === null) return null;
    if (since.sinceStart) return t('session.started', { time: clockTime(since.sinceMs, nowMs, locale) });
    const minutes = Math.max(1, Math.floor((nowMs - since.sinceMs) / MINUTE_MS));
    return minutes < 60 ? t('sessionLine.forMinutes', { count: minutes }) : t('sessionLine.forHours', { count: Math.floor(minutes / 60) });
  };
  const sessionLine = (line: SessionLine): SessionLineCopy => ({
    key: line.key,
    ink: line.ink,
    main: line.name ?? sessionTag(line),
    tag: line.name ? sessionTag(line) : null,
    state: lineState(line),
    since: lineSince(line),
  });
  /** Who the bezel and a mini room name: the one session by its name, or how many share the folder. */
  const bezelWho = (room: RoomEntry, lines: readonly SessionLine[]): BezelWho | null => {
    if (lines.length >= 2) return { main: t('room.sessions', { count: lines.length }), tag: null };
    if (lines.length === 1) {
      const line = sessionLine(lines[0]);
      return { main: line.main, tag: line.tag };
    }
    const who = monitorWho(room);
    return who ? { main: who, tag: null } : null;
  };
  const beats = (track: Track): ScreenBeat[] => {
    const age = (at: number | null) => (at === null ? null : (nowMs / 1000 - at) / BEAT_WINDOW_S);
    const within = (beat: { key: string; kind: ScreenBeat['kind']; age: number | null }): beat is ScreenBeat => beat.age !== null && beat.age <= 1;
    return [
      ...(track.activity?.files ?? []).map(file => ({ key: `file:${file.path}`, kind: 'file' as const, age: age(file.changedAt) })),
      ...(track.activity?.commits ?? []).map(commit => ({ key: `commit:${commit.hash}`, kind: 'commit' as const, age: age(commit.at) })),
    ].filter(within).map(beat => ({ ...beat, age: Math.round(Math.max(0, beat.age) * 1000) / 1000 }));
  };
  /** The newest commits (beyond the base branch, or the base branch's own) as plain text; a subject left empty shows its hash. */
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
  const freshOf = (changedAt: number | null): ScreenFile['fresh'] => {
    const age = changedAt === null ? Number.POSITIVE_INFINITY : nowMs / 1000 - changedAt;
    return age <= FRESH_NOW_S ? 'now' : age <= FRESH_RECENT_S ? 'recent' : 'old';
  };
  /** The uncommitted files by name, each with the folder it is in; Git spells paths with `/`. */
  const screenFiles = (track: Track): ScreenFile[] =>
    (track.activity?.files ?? []).map(({ path, changedAt }) => {
      const cut = path.replace(/\/+$/, '').lastIndexOf('/');
      return { path, name: path.slice(cut + 1), folder: cut > 0 ? path.slice(0, cut) : null, ago: agoOf(changedAt), changedAt, fresh: freshOf(changedAt) };
    });
  const screenAreas = (track: Track): ScreenArea[] =>
    changedAreas(track.activity?.files ?? []).map(area => ({
      path: area.path,
      name: area.path || t('monitor.rootFolder'),
      files: area.files,
      count: t('monitor.areaFiles', { count: area.files }),
      ago: agoOf(area.changedAt),
      fresh: freshOf(area.changedAt),
    }));
  /** The read lists the newest files only, so past its limit the folders count those and say so. */
  const areasTitle = (track: Track) => {
    const listed = track.activity?.files.length ?? 0;
    return (track.activity?.uncommitted ?? 0) > listed ? t('monitor.areasOfNewest', { count: listed }) : t('monitor.areasTitle');
  };
  const lastCommit = (track: Track) => (track.lastCommitAt === null ? null : t('room.lastCommit', { ago: timeAgo(track.lastCommitAt, nowMs, locale) }));

  /** A folder's own facts on a session's block, or who shares it: a shared folder's figures stay in its panel. */
  const folderRow = ({ room, others }: SessionFolder, alone: boolean): FolderRowCopy => {
    const track = room.track;
    const branch = track.branch ?? track.title;
    if (room.state.kind === 'missing') return { key: room.key, branch, facts: [{ text: t('room.missing'), tone: 'warning' }], shared: false, ago: null, commits: [] };
    if (others.length > 0) {
      const who = others.length === 1 ? t('bySession.shared', { who: sessionLine(others[0]).main }) : t('bySession.sharedMany', { count: others.length });
      const collide = room.state.kind === 'working' && room.state.tools.length > 1;
      return {
        key: room.key,
        branch,
        facts: [{ text: who, tone: 'plain' }, ...(collide ? [{ text: t('room.twoTools'), tone: 'warning' as const }] : [])],
        shared: true,
        ago: null,
        commits: [],
      };
    }
    const facts = [commits(track), uncommitted(track)?.text ?? null].filter((fact): fact is string => fact !== null);
    return {
      key: room.key,
      branch,
      facts: facts.map(text => ({ text, tone: 'plain' as const })),
      shared: false,
      ago: lastChange(track, null),
      commits: alone ? screenCommits(track).slice(0, BLOCK_COMMITS) : [],
    };
  };
  /**
   * One session, once: its own state from its list (or that it is seen at work, when no list
   * speaks), then since when, in the words its line in a room uses, or when its program started.
   */
  const sessionBlock = (block: SessionBlock, session: TrackSession | null, load: SessionLoadFacts | null = null): SessionBlockCopy => {
    const line = sessionLine(block.line);
    const state = line.state ?? (block.running ? { text: t('room.working'), tone: 'ink' as const } : { text: t('room.resting'), tone: 'plain' as const });
    const started = session?.startedAt ? t('session.started', { time: clockTime(session.startedAt * 1000, nowMs, locale) }) : null;
    const shown = block.folders.slice(0, BLOCK_FOLDERS_SHOWN);
    return {
      key: block.key,
      ink: line.ink,
      main: line.main,
      tag: line.tag,
      state,
      time: line.since ?? started,
      waiting: isWaitingBlock(block),
      running: block.running,
      folders: shown.map(folder => folderRow(folder, block.folders.length === 1)),
      more: block.folders.length > shown.length ? t('bySession.moreFolders', { count: block.folders.length - shown.length }) : null,
      load: load
        ? {
            memory: t('bySession.loadMemory', { memory: memory(load.memoryBytes) }),
            cpu: t('bySession.loadCpu', { cores: cores(load.cpuCores) }),
            tools: load.tools.length > 0 ? load.tools.map(group => t('bySession.loadTool', { tool: loadTool(group), count: group.count })).join(' · ') : null,
          }
        : null,
    };
  };

  /** Who a room belongs to, under a mini room's status when there is room for it. */
  const owner = (room: RoomEntry, lines: readonly SessionLine[] = []): BezelWho =>
    bezelWho(room, lines) ?? { main: room.state.kind === 'lockLeft' ? t('session.ended') : t('session.none'), tag: null };
  const noAgent = (room: RoomEntry, live: RoomLive | null): StatusLine | null =>
    live?.pulse && changesWithoutAgent(live.pulse, room.track.running) ? { lead: t('pulse.noAgent'), tone: 'plain', rest: null } : null;

  function status(room: RoomEntry, live: RoomLive | null = null): StatusLine {
    const { state, track } = room;
    const unattended = noAgent(room, live);
    if (unattended) return unattended;
    switch (state.kind) {
      case 'waiting':
        return { lead: t(state.on === 'approval' ? 'room.waitingApproval' : 'room.waitingAnswer'), tone: 'warning', rest: commits(track) };
      case 'sessionFailed':
        return { lead: t('room.sessionFailed'), tone: 'warning', rest: commits(track) };
      case 'replied':
        return { lead: t('room.replied'), tone: 'plain', rest: commits(track) };
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

  /** The bezel's state: its few words and, for a working room, when its worktree last changed; else how long, or since when. */
  function bezelState(room: RoomEntry, live: RoomLive | null): StatusLine {
    const { state, track } = room;
    const unattended = noAgent(room, live);
    if (unattended) return unattended;
    const pulse = live?.pulse ?? null;
    switch (state.kind) {
      case 'waiting':
      case 'sessionFailed':
      case 'replied':
        return { ...status(room), rest: lastChange(track, pulse) ?? workedFor(room.session) };
      case 'working':
        return { lead: t(state.tools.length > 1 ? 'room.twoTools' : 'room.working'), tone: state.tools.length > 1 ? 'warning' : 'ink', rest: lastChange(track, pulse) ?? workedFor(room.session) };
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

  function monitorWho(room: RoomEntry): string | null {
    const others = room.guests.map(guest => sessionName(guest)).filter((name): name is string => name !== null);
    return [sessionName(room.session), ...others].filter((name): name is string => name !== null).join(' · ') || null;
  }

  function monitor(room: RoomEntry, live: RoomLive | null = null): MonitorCopy {
    const { state, track } = room;
    const who = monitorWho(room);
    const pulse = live?.pulse ?? null;
    const lines = live?.lines ?? [];
    const onScreen = screenSessionLines(lines);
    const listed =track.activity?.onBase ? screenCommits(track).slice(0, BASE_SCREEN_COMMITS) : screenCommits(track);
    const notInBase = state.kind === 'lockLeft' && track.ahead ? t('room.notInBase', { count: track.ahead, branch: baseBranch }) : null;
    const files = uncommitted(track);
    const commitsTitle = listed.length === 0
      ? null
      : track.activity?.onBase
        ? { text: t('monitor.recentCommits'), tone: 'plain' as const }
        : track.ahead
          ? { text: t('room.notInBase', { count: track.ahead, branch: baseBranch }), tone: notInBase ? 'warning' as const : 'plain' as const }
          : null;
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
      state: bezelState(room, live),
      worked: state.kind === 'working' || state.kind === 'waiting' ? workedFor(room.session) : null,
      commits: listed,
      commitsTitle,
      filesTitle: state.kind === 'missing' ? null : files?.text ?? null,
      files: state.kind === 'missing' ? [] : screenFiles(track),
      areas: state.kind === 'missing' ? [] : screenAreas(track),
      areasTitle: areasTitle(track),
      beats: state.kind === 'missing' ? [] : beats(track),
      ticks: state.kind === 'missing' ? [] : ticks(live),
      hourLabel: pulse ? t('pulse.lastHour', { count: pulse.lastHour }) : t('monitor.lastHourChanges', { count: beats(track).length }),
      lastMinute: pulse && pulse.lastMinute > 0 ? t('pulse.lastMinute', { count: pulse.lastMinute }) : null,
      loadFact: live?.loadStatus === 'read' ? loadFact(live.load) : null,
      bezel: bezelWho(room, lines),
      sessionLines: onScreen.lines.map(sessionLine),
      moreSessions: onScreen.more > 0 ? t('sessionLine.more', { count: onScreen.more }) : null,
      note,
      lastLine,
      count: notInBase ? null : track.ahead && track.ahead > 0 ? t('room.commits', { count: track.ahead }) : null,
    };
  }

  return {
    baseBranch, toolName, sessionName, owner, status, monitor, newestSubject, uncommitted, screenCommits,
    sessionLine, bezelWho, memory, cores, loadTool, groupLine, sessionBlock,
  };
}
