import { describe, expect, it } from 'vitest';

import type { AcpEvent } from '@/features/acp-session';

import { turnActivity } from './turn-activity';

const user: AcpEvent = { kind: 'user', id: 'u1', text: 'Fill the code locations' };
const tool = (id: string, title: string, toolKind: string, status: string, rawInput?: unknown): AcpEvent => ({
  kind: 'tool',
  id,
  title,
  toolKind,
  status,
  rawInput,
});

describe('turnActivity', () => {
  it('reads a turn with nothing reported yet as thinking, with no steps', () => {
    expect(turnActivity([user], 0, 'atlas-vault')).toEqual({ kind: 'thinking', label: null, target: null, steps: 0 });
  });

  it('names the open call and its target, and counts every call the turn opened', () => {
    const events = [
      user,
      tool('t1', 'mcp__atlas-vault__list_concepts', 'read', 'completed'),
      tool('t2', 'mcp__atlas-vault__read_source', 'read', 'in_progress', { path: 'src/views/home/ui/HomePage.tsx' }),
    ];
    const activity = turnActivity(events, 0, 'atlas-vault');
    expect(activity.kind).toBe('reading');
    expect(activity.label).toEqual({ kind: 'known', text: 'readSource' });
    expect(activity.target).toContain('HomePage.tsx');
    expect(activity.steps).toBe(2);
  });

  it.each([
    ['mcp__atlas-vault__find_evidence', 'other', 'searching'],
    ['mcp__atlas-vault__patch_concept', 'other', 'writing'],
    ['mcp__atlas-vault__delete_concept', 'other', 'writing'],
    ['Edit', 'edit', 'writing'],
    ['Grep', 'search', 'searching'],
    ['Terminal', 'execute', 'running'],
    ['mcp__other__do_thing', 'other', 'thinking'],
  ])('acts an open %s call (%s) as %s', (title, toolKind, kind) => {
    expect(turnActivity([user, tool('t1', title, toolKind, 'pending')], 0, 'atlas-vault').kind).toBe(kind);
  });

  it('is answering once answer text follows the last settled call, and ignores earlier turns', () => {
    const events: AcpEvent[] = [
      { kind: 'user', id: 'u0', text: 'Earlier' },
      tool('t0', 'Edit', 'edit', 'in_progress'),
      user,
      tool('t1', 'Grep', 'search', 'completed'),
      { kind: 'agent', id: 'a1', text: 'Here is what I found.' },
    ];
    expect(turnActivity(events, 2, 'atlas-vault')).toEqual({ kind: 'answering', label: null, target: null, steps: 1 });
  });
});
