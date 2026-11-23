import { describe, expect, it } from 'vitest';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cleanupCommand } from './RoomPanel';

const room = (kind: string, path: string) => ({ state: { kind }, track: { path } }) as unknown as RoomEntry;

describe('cleanupCommand', () => {
  it('unlocks a folder whose session ended, quoting a path a shell would split', () => {
    expect(cleanupCommand(room('lockLeft', '/repo/.worktrees/feat-a'))).toBe('git worktree unlock /repo/.worktrees/feat-a');
    expect(cleanupCommand(room('lockLeft', "/Users/me/my repo/it's"))).toBe("git worktree unlock '/Users/me/my repo/it'\\''s'");
  });

  it('prunes a record whose folder is gone, and offers nothing for a room at work', () => {
    expect(cleanupCommand(room('missing', '/gone'))).toBe('git worktree prune');
    expect(cleanupCommand(room('working', '/repo'))).toBeNull();
  });
});
