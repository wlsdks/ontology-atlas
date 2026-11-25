import type { AgentSessionState } from '../tauri-work-status';
import type { RoomEntry, TrackSession } from '../work-tracks';
import { sessionLinesOf, type SessionLine, type SessionLineContext } from './session-lines';

/** Folders a session block lists before `bySession.moreFolders`. */
export const BLOCK_FOLDERS_SHOWN = 3;

/** One folder a session works in, and every other session at work in it. */
export interface SessionFolder {
  room: RoomEntry;
  /** The other sessions in the folder; empty when the session has it to itself. */
  others: SessionLine[];
}

/**
 * One session, once, with what it says of itself and the folders it works in. A folder's commits
 * and files are the folder's: a block may show them only for a folder with no `others`.
 */
export interface SessionBlock {
  key: string;
  /** The line that speaks for the session: the one its own list state is on, else its first. */
  line: SessionLine;
  /** The list's folder first, then the worktrees it holds, then folders it only runs commands in. */
  folders: SessionFolder[];
  /** Its program, a command it runs, or an Atlas agent session is seen in one of its folders now. */
  running: boolean;
}

export interface SessionBoard {
  blocks: SessionBlock[];
  /** Rooms of the building no session works in: a lock left behind, or a folder nobody holds. */
  withoutSession: number;
}

const LISTED: readonly (AgentSessionState | 'workingHere' | null)[] = ['waitingApproval', 'waitingAnswer', 'failed', 'working', 'replied'];

const isListed = (line: SessionLine) => LISTED.includes(line.state);

/** A session waits for its person when its own list says so. */
export function isWaitingBlock(block: SessionBlock): boolean {
  return block.line.state === 'waitingApproval' || block.line.state === 'waitingAnswer';
}

/**
 * The building's rooms regrouped by session: one block per session at work in any room, in the
 * order the building numbers sessions in (then sessions only the list knows, by first room), so a
 * block never moves for a state. One projection of the same lines the rooms draw, so the two
 * arrangements cannot disagree about who is where. O(rooms × sessions per room).
 */
export function sessionBoardOf(rooms: readonly RoomEntry[], sessions: readonly TrackSession[], context: SessionLineContext): SessionBoard {
  const blocks = new Map<string, { lines: SessionLine[]; folders: SessionFolder[]; held: Set<string>; running: boolean; firstSeen: number }>();
  let withoutSession = 0;
  rooms.forEach((room, roomIndex) => {
    const lines = sessionLinesOf(room, context);
    if (lines.length === 0) {
      withoutSession += 1;
      return;
    }
    for (const line of lines) {
      const block = blocks.get(line.key) ?? { lines: [], folders: [], held: new Set<string>(), running: false, firstSeen: roomIndex };
      block.lines.push(line);
      block.folders.push({ room, others: lines.filter(other => other.key !== line.key) });
      if (room.session?.key === line.key) block.held.add(room.key);
      block.running ||= room.track.running;
      blocks.set(line.key, block);
    }
  });
  const order = new Map(sessions.map((session, index) => [session.key, index]));
  const rank = (key: string, firstSeen: number) => (order.get(key) ?? sessions.length + firstSeen);
  return {
    blocks: [...blocks.entries()]
      .sort(([a, left], [b, right]) => rank(a, left.firstSeen) - rank(b, right.firstSeen) || a.localeCompare(b))
      .map(([key, block]) => {
        const said = block.lines.findIndex(isListed);
        const folderRank = (folder: SessionFolder, index: number) =>
          index === said ? 0 : block.held.has(folder.room.key) ? 1 : 2;
        const folders = block.folders
          .map((folder, index) => ({ folder, rank: folderRank(folder, index), index }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .map(entry => entry.folder);
        return { key, line: block.lines[said === -1 ? 0 : said], folders, running: block.running };
      }),
    withoutSession,
  };
}
