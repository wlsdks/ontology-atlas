import { describe, expect, it } from 'vitest';

import type { AcpEvent } from '@/features/acp-session';

import { turnActivity } from './turn-activity';

const user: AcpEvent = { kind: 'user', id: 'u1', text: 'Fill the code locations' };
const tool = (id: string, title: string, toolKind: string, status: string, rawInput?: unknown, rawOutput?: unknown): AcpEvent => ({
  kind: 'tool',
  id,
  title,
  toolKind,
  status,
  rawInput,
  rawOutput,
});
const mcpText = (result: unknown) => [{ type: 'text', text: JSON.stringify(result) }];
const NOTHING_WRITTEN = { concepts: 0, relations: 0 };

describe('turnActivity', () => {
  it('reads a turn with nothing reported yet as thinking, with no steps', () => {
    expect(turnActivity([user], 0, 'atlas-vault', true)).toEqual({ kind: 'thinking', label: null, target: null, steps: 0, written: NOTHING_WRITTEN });
  });

  it('names the open call and its target, and counts every call the turn opened', () => {
    const events = [
      user,
      tool('t1', 'mcp__atlas-vault__list_concepts', 'read', 'completed'),
      tool('t2', 'mcp__atlas-vault__read_source', 'read', 'in_progress', { path: 'src/views/home/ui/HomePage.tsx' }),
    ];
    const activity = turnActivity(events, 0, 'atlas-vault', true);
    expect(activity.kind).toBe('reading');
    expect(activity.label).toEqual({ kind: 'known', text: 'readSource' });
    expect(activity.target).toContain('HomePage.tsx');
    expect(activity.steps).toBe(2);
  });

  it('names a command call by its act and shows the command once', () => {
    const rawInput = { command: '/bin/zsh -lc "rg --files src"' };
    const activity = turnActivity([user, tool('t1', 'rg --files src', 'execute', 'in_progress', rawInput)], 0, 'atlas-vault', true);
    expect(activity).toMatchObject({ kind: 'running', label: { kind: 'kind', text: 'execute' }, target: 'rg --files src' });
  });

  it('reads a dotted vault call reported as a command as the read it is', () => {
    const rawInput = { server: 'atlas-vault', tool: 'get_concept', arguments: { slug: 'domains/map' } };
    const activity = turnActivity([user, tool('t1', 'mcp.atlas-vault.get_concept', 'execute', 'in_progress', rawInput)], 0, 'atlas-vault', true);
    expect(activity.kind).toBe('reading');
    expect(activity.label).toEqual({ kind: 'known', text: 'read' });
    expect(activity.target).toBe('domains/map');
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
    expect(turnActivity([user, tool('t1', title, toolKind, 'pending')], 0, 'atlas-vault', true).kind).toBe(kind);
  });

  it('is answering while answer text arrives after the last settled call, and ignores earlier turns', () => {
    const events: AcpEvent[] = [
      { kind: 'user', id: 'u0', text: 'Earlier' },
      tool('t0', 'Edit', 'edit', 'in_progress'),
      user,
      tool('t1', 'Grep', 'search', 'completed'),
      { kind: 'agent', id: 'a1', text: 'Here is what I found.' },
    ];
    expect(turnActivity(events, 2, 'atlas-vault', true)).toEqual({ kind: 'answering', label: null, target: null, steps: 1, written: NOTHING_WRITTEN });
  });

  it('goes back to thinking when the agent said something and then went quiet', () => {
    const events: AcpEvent[] = [user, { kind: 'agent', id: 'a1', text: 'I will read the map first.' }];
    expect(turnActivity(events, 0, 'atlas-vault', false).kind).toBe('thinking');
  });

  it('counts the concepts and relations finished writes report as written, and only those rows', () => {
    const events: AcpEvent[] = [
      user,
      tool('t1', 'mcp__atlas-vault__add_concepts', 'other', 'completed', undefined, mcpText({
        concepts: [
          { slug: 'capabilities/a', ok: true, changed: true },
          { slug: 'capabilities/b', ok: true, changed: true },
          { slug: 'capabilities/c', ok: false, error: 'already exists' },
        ],
      })),
      tool('t2', 'mcp__atlas-vault__patch_concept', 'other', 'completed', undefined, { ok: true, slug: 'domains/map', changed: true }),
      tool('t3', 'mcp.atlas-vault.add_relations', 'execute', 'completed',
        { server: 'atlas-vault', tool: 'add_relations', arguments: { relations: [] } },
        { result: { content: mcpText({ relations: [{ ok: true, changed: true }, { ok: true, changed: false, alreadyExists: true }] }) } }),
      tool('t4', 'mcp__atlas-vault__add_relation', 'other', 'failed', undefined, mcpText({ ok: true, changed: true })),
      tool('t5', 'mcp__atlas-vault__delete_concept', 'other', 'completed', undefined, { ok: true, changed: true }),
      tool('t6', 'mcp__other__add_concept', 'other', 'completed', undefined, { ok: true, changed: true }),
      tool('t7', 'mcp__atlas-vault__add_concept', 'other', 'completed', undefined, { isError: true, content: mcpText({ ok: true, changed: true }) }),
    ];
    expect(turnActivity(events, 0, 'atlas-vault', true).written).toEqual({ concepts: 3, relations: 1 });
  });

  it('counts a concept once when the turn writes it again', () => {
    const events: AcpEvent[] = [
      user,
      tool('t1', 'mcp__atlas-vault__add_concepts', 'other', 'completed', undefined, mcpText({
        concepts: [{ slug: 'capabilities/a', ok: true, changed: true }, { slug: 'capabilities/b', ok: true, changed: true }],
      })),
      tool('t2', 'mcp__atlas-vault__patch_concept', 'other', 'completed', undefined, { ok: true, slug: 'capabilities/a', changed: true }),
      tool('t3', 'mcp__atlas-vault__patch_concept', 'other', 'completed', undefined, { ok: true, slug: 'capabilities/a', changed: true }),
    ];
    expect(turnActivity(events, 0, 'atlas-vault', true).written).toEqual({ concepts: 2, relations: 0 });
  });

  it('counts nothing for a write still open or one whose answer was too large to keep', () => {
    const events: AcpEvent[] = [
      user,
      tool('t1', 'mcp__atlas-vault__add_concept', 'other', 'in_progress', undefined, { ok: true, changed: true }),
      tool('t2', 'mcp__atlas-vault__add_concepts', 'other', 'completed', undefined, { preview: 'tool-output', chars: 70_000, hash: 'h' }),
    ];
    expect(turnActivity(events, 0, 'atlas-vault', true).written).toEqual(NOTHING_WRITTEN);
  });
});
