import { describe, expect, it } from 'vitest';
import type { AgentSessionRow, WorkStatusSnapshot, WorktreeRow } from '../tauri-work-status';
import { buildWorkTracks, planRooms, type RoomEntry, type WorkTracks } from '../work-tracks';
import { SESSION_NAME_MAX_CHARACTERS, sessionNameOf } from './session-name';
import {
  SESSION_LINES_LISTED,
  bezelSessionsOf,
  listedFolders,
  rememberStateSince,
  sessionLinesOf,
  sessionsByPidOf,
  shownSessionLines,
  type StateSince,
} from './session-lines';
import { strongestState, withAgentSessions } from './sessions';

const NOW_MS = 1_795_300_000_000;

function row(id: string, pids: number[] = [], patch: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    id,
    path: `/repo/.claude/worktrees/${id}`,
    branch: `feat/${id}`,
    head: 'abc',
    mainCheckout: false,
    missing: false,
    standing: 'ahead',
    ahead: 2,
    lastCommitAt: NOW_MS / 1000 - 600,
    lastCommitAuthor: 'stark',
    lock: null,
    acpPid: null,
    agentProcesses: pids.map(pid => ({ pid, tool: 'claudeCode' as const, startedAt: pid })),
    ...patch,
  };
}

function tracksOf(worktrees: WorktreeRow[]): WorkTracks {
  const snapshot: WorkStatusSnapshot = { status: 'ready', root: '/repo', repository: 'owner/repo', host: 'github.com', baseBranch: 'main', worktrees };
  return buildWorkTracks(snapshot);
}

const said = (worktreeId: string, pid: number, state: AgentSessionRow['state'], name?: string): AgentSessionRow => ({ worktreeId, pid, state, name });
const stateOf = (tracks: WorkTracks, key: string) =>
  [...planRooms(tracks, NOW_MS).stage, ...planRooms(tracks, NOW_MS).floors.flatMap(floor => floor.rooms)].find(room => room.key === key)?.state;

describe('strongestState', () => {
  it('lets a wait speak over work, and work over a finished reply', () => {
    expect(strongestState([])).toBeNull();
    expect(strongestState(['replied', 'working'])).toBe('working');
    expect(strongestState(['working', 'waitingAnswer', 'replied'])).toBe('waitingAnswer');
    expect(strongestState(['waitingAnswer', 'waitingApproval'])).toBe('waitingApproval');
    expect(strongestState(['failed', 'working'])).toBe('failed');
  });
});

describe('withAgentSessions', () => {
  it('gives each room what the session standing in it says', () => {
    const tracks = withAgentSessions(tracksOf([row('asks', [1]), row('answers', [2]), row('done', [3]), row('busy', [4]), row('broke', [5]), row('silent', [6])]), [
      said('asks', 1, 'waitingApproval'),
      said('answers', 2, 'waitingAnswer'),
      said('done', 3, 'replied'),
      said('busy', 4, 'working'),
      said('broke', 5, 'failed'),
    ]);
    expect(stateOf(tracks, 'asks')).toEqual({ kind: 'waiting', on: 'approval' });
    expect(stateOf(tracks, 'answers')).toEqual({ kind: 'waiting', on: 'answer' });
    expect(stateOf(tracks, 'done')).toEqual({ kind: 'replied' });
    expect(stateOf(tracks, 'busy')).toMatchObject({ kind: 'working' });
    expect(stateOf(tracks, 'broke')).toEqual({ kind: 'sessionFailed' });
    // A session the list says nothing of keeps the words it had.
    expect(stateOf(tracks, 'silent')).toMatchObject({ kind: 'working' });
  });

  it('keeps a room at work while another tool works beside a session that has replied', () => {
    const shared = row('shared', [1], { agentProcesses: [{ pid: 1, tool: 'claudeCode', startedAt: 1 }, { pid: 9, tool: 'codex', startedAt: 9 }] });
    expect(stateOf(withAgentSessions(tracksOf([shared]), [said('shared', 1, 'replied')]), 'shared')).toMatchObject({ kind: 'working' });
  });

  it('changes no room whose program is not seen in the folder', () => {
    const tracks = withAgentSessions(tracksOf([row('empty')]), [said('empty', 1, 'waitingApproval')]);
    expect(stateOf(tracks, 'empty')).toMatchObject({ kind: 'unheld' });
  });

  it('returns the same tracks when no state changed, and the same track where its state did not', () => {
    const tracks = tracksOf([row('a', [1]), row('b', [2])]);
    expect(withAgentSessions(tracks, [])).toBe(tracks);
    const once = withAgentSessions(tracks, [said('a', 1, 'waitingAnswer')]);
    const twice = withAgentSessions(once, [said('a', 1, 'waitingAnswer')]);
    expect(twice).toBe(once);
    const moved = withAgentSessions(once, [said('a', 1, 'working')]);
    const track = (from: WorkTracks, key: string) => from.sessions.flatMap(session => session.tracks).find(each => each.key === key);
    expect(track(moved, 'b')).toBe(track(once, 'b'));
    expect(track(moved, 'a')?.agentState).toBe('working');
  });
});

describe('planRooms with waiting sessions', () => {
  it('admits a waiting room before running work, in its own place, and counts it on its floor', () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`w${index}`, [100 + index]));
    const plain = planRooms(tracksOf(rows), NOW_MS);
    expect(plain.stage.map(room => room.key)).not.toContain('w7');
    const tracks = withAgentSessions(tracksOf(rows), [said('w7', 107, 'waitingApproval')]);
    const plan = planRooms(tracks, NOW_MS);
    expect(plan.stage).toHaveLength(6);
    expect(plan.stage.at(-1)).toMatchObject({ key: 'w7', tier: 'attention', state: { kind: 'waiting', on: 'approval' } });
    const floor = plan.floors.find(each => each.session?.tracks.some(track => track.key === 'w7'));
    expect(floor).toMatchObject({ waiting: 1, attention: 0 });
  });

  it('says a session waits even where an ended session left its lock, and admits it to the stage', () => {
    const lockLeft = { state: 'stale' as const, tool: 'claudeCode' as const, agentId: 'a1', pid: 900, sessionStartedAt: 1, lockedAt: 10 };
    const rows = [...Array.from({ length: 7 }, (_, index) => row(`w${index}`, [100 + index])), row('left', [200], { lock: lockLeft })];
    expect(stateOf(tracksOf(rows), 'left')).toMatchObject({ kind: 'lockLeft' });

    const plan = planRooms(withAgentSessions(tracksOf(rows), [said('left', 200, 'waitingAnswer')]), NOW_MS);
    expect(plan.stage.find(room => room.key === 'left')).toMatchObject({ state: { kind: 'waiting', on: 'answer' } });
  });

  it('holds a replied room as idle: it fills a row, never before running work', () => {
    const tracks = withAgentSessions(tracksOf([row('done', [1]), row('runs', [2])]), [said('done', 1, 'replied')]);
    const plan = planRooms(tracks, NOW_MS);
    expect(plan.stage.map(room => [room.key, room.tier])).toEqual([['done', 'held'], ['runs', 'working']]);
  });
});

const PLANTED = 'ATLAS_PLANTED_7f3c';
/** Forty Hangul syllables, built from code points so the source holds no Hangul. */
const HANGUL_NAME = Array.from({ length: 40 }, (_, index) => String.fromCodePoint(0xac00 + index * 97)).join('');

const roomsOf = (tracks: WorkTracks): RoomEntry[] => {
  const plan = planRooms(tracks, NOW_MS);
  return [...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)];
};

function linesIn(worktrees: WorktreeRow[], rows: AgentSessionRow[], key: string, since: ReadonlyMap<number, StateSince> = new Map()) {
  const tracks = withAgentSessions(tracksOf(worktrees), rows);
  const room = roomsOf(tracks).find(each => each.key === key);
  if (!room) throw new Error(`no room ${key}`);
  return { room, lines: sessionLinesOf(room, { sessionsByPid: sessionsByPidOf(tracks.sessions), listedIn: listedFolders(rows), since }) };
}

describe('sessionNameOf', () => {
  it('keeps one line of at most sixty characters, with no control or direction-override character', () => {
    const name = sessionNameOf(`${PLANTED}${'x'.repeat(500)}\n\u202Esecond line`);
    expect(name).not.toBeNull();
    expect(Array.from(name ?? '')).toHaveLength(SESSION_NAME_MAX_CHARACTERS);
    expect(name).toBe(`${PLANTED}${'x'.repeat(SESSION_NAME_MAX_CHARACTERS - PLANTED.length)}`);
    expect(sessionNameOf(`a\u202Eb\u2066c\u0007d`)).toBe('abcd');
    expect(sessionNameOf('first\r\nsecond')).toBe('first');
  });

  it('reads no name from what is not text, empty, or only removed characters', () => {
    for (const raw of [undefined, null, 42, {}, '', '   ', '\u202E\u0007', '\nafter a break']) expect(sessionNameOf(raw)).toBeNull();
  });

  it('keeps Hangul and emoji whole, cutting between characters, never inside one', () => {
    expect(sessionNameOf(HANGUL_NAME)).toBe(HANGUL_NAME);
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const cut = sessionNameOf(`${'a'.repeat(59)}${family}${family}`);
    expect(cut).toBe(`${'a'.repeat(59)}${family}`);
    // Decomposed jamo make one syllable of three code points; the cut keeps it whole.
    const decomposed = '\u1100\u1161\u11A8';
    expect(sessionNameOf(`${'a'.repeat(59)}${decomposed}b`)).toBe(`${'a'.repeat(59)}${decomposed}`);
  });
});

describe('session lines', () => {
  const sharedCheckout = (count: number) => row('shared', Array.from({ length: count }, (_, index) => index + 1));

  it('puts the one session of a room on its bezel by name', () => {
    const { lines } = linesIn([sharedCheckout(1)], [said('shared', 1, 'working', 'shared-ab')], 'shared');
    expect(bezelSessionsOf(lines)).toMatchObject({ kind: 'one', line: { name: 'shared-ab', tool: 'claudeCode', ordinal: 1, state: 'working' } });
  });

  it('gives three sessions three lines, each with its own state, the waiting one first and the room waiting', () => {
    const rows = [said('shared', 1, 'working'), said('shared', 2, 'replied', HANGUL_NAME), said('shared', 3, 'waitingApproval', 'shared-cd')];
    const { room, lines } = linesIn([sharedCheckout(3)], rows, 'shared');
    expect(room.state).toEqual({ kind: 'waiting', on: 'approval' });
    expect(lines.map(line => [line.pid, line.state, line.name])).toEqual([
      [3, 'waitingApproval', 'shared-cd'],
      [1, 'working', null],
      [2, 'replied', HANGUL_NAME],
    ]);
    // The unnamed one reads `{tool} {number}`.
    expect(lines[1]).toMatchObject({ tool: 'claudeCode', ordinal: 1 });
    expect(bezelSessionsOf(lines)).toEqual({ kind: 'count', count: 3 });
  });

  it('shows three of seven sessions and counts the rest, while the panel lists all seven', () => {
    const rows = Array.from({ length: 7 }, (_, index) => said('shared', index + 1, index === 6 ? 'waitingAnswer' : 'working'));
    const { lines } = linesIn([sharedCheckout(7)], rows, 'shared');
    const shown = shownSessionLines(lines);
    expect(shown.lines.map(line => line.pid)).toEqual([7, 1, 2]);
    expect(shown.more).toBe(4);
    expect(shownSessionLines(lines, SESSION_LINES_LISTED)).toEqual({ lines, more: 0 });
  });

  it('says a session the list places in another folder only runs commands here', () => {
    const elsewhere = row('elsewhere', [5]);
    const visited = row('visited', [9], { agentProcesses: [{ pid: 9, tool: 'claudeCode', startedAt: 9 }, { pid: 5, tool: 'claudeCode', startedAt: 5 }] });
    const rows = [said('elsewhere', 5, 'working'), said('visited', 9, 'replied')];
    const { lines } = linesIn([elsewhere, visited], rows, 'visited');
    expect(lines.map(line => [line.pid, line.state])).toEqual([[9, 'replied'], [5, 'workingHere']]);
  });

  it('names sessions with no state while the list is off, and none in a folder no program is seen in', () => {
    expect(linesIn([sharedCheckout(2)], [], 'shared').lines.map(line => [line.ordinal, line.state])).toEqual([[1, null], [2, null]]);
    expect(linesIn([row('empty')], [said('empty', 1, 'waitingApproval', PLANTED)], 'empty').lines).toEqual([]);
  });

  it('keeps a name on the folder its session stands in, never on another', () => {
    const tracks = withAgentSessions(tracksOf([row('a', [1]), row('b', [2])]), [said('a', 1, 'working', PLANTED)]);
    const b = tracks.sessions.flatMap(session => session.tracks).find(track => track.key === 'b');
    expect(JSON.stringify(b)).not.toContain(PLANTED);
  });
});

describe('rememberStateSince', () => {
  const started = (pid: number) => pid * 1000;

  it('counts a session first seen from its start, and a change from the read that saw it', () => {
    const first = rememberStateSince(new Map(), [said('a', 1, 'working')], 50_000, started);
    expect(first.get(1)).toEqual({ state: 'working', sinceMs: 1000, sinceStart: true });
    const same = rememberStateSince(first, [said('a', 1, 'working')], 60_000, started);
    expect(same).toBe(first);
    const waiting = rememberStateSince(same, [said('a', 1, 'waitingAnswer')], 70_000, started);
    expect(waiting.get(1)).toEqual({ state: 'waitingAnswer', sinceMs: 70_000, sinceStart: false });
    expect(rememberStateSince(waiting, [], 80_000, started).size).toBe(0);
  });
});
