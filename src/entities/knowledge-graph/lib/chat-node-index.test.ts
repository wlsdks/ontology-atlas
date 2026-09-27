import { describe, expect, it } from 'vitest';

import { buildChatNodeIndex } from './chat-node-index';
import type { KnowledgeGraphNode } from '../model/types';

/**
 * The two names exactly as measured in the installed app (2026-08-17): the lower one
 * is what codex used in its answer, the upper one is what the map calls the node.
 */
const CANVAS_ID = 'domain:example-domain';
const AGENT_SLUG = 'domains/example-domain';

const node = (over: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode =>
  ({
    id: CANVAS_ID,
    title: 'Example domain',
    display: '예시 영역',
    kind: 'domain',
    projectIds: [],
    evidenceIds: [],
    agentSlug: AGENT_SLUG,
    ...over,
  }) as KnowledgeGraphNode;

describe('chat names to map nodes', () => {
  /*
   * ⚠️ **This check comes first.** If the two names ever coincide, every test below
   * passes while measuring nothing — a check that is always green is not a check.
   */
  it('uses fixtures whose agent name and map id differ', () => {
    expect(AGENT_SLUG).not.toBe(CANVAS_ID);
  });

  it('finds a map node by the name the agent uses', () => {
    expect(buildChatNodeIndex([node()]).get(AGENT_SLUG)).toBe(CANVAS_ID);
  });

  it('finds a map node by its map id', () => {
    expect(buildChatNodeIndex([node()]).get(CANVAS_ID)).toBe(CANVAS_ID);
  });

  it('misses agent names when indexed by map id alone', () => {
    // This is exactly what the code did before 2026-08-17: `new Set(nodes.map(n => n.id))`.
    const brokenIndex = new Set([node().id]);
    expect(brokenIndex.has(AGENT_SLUG)).toBe(false);
    // The fixed version matches.
    expect(buildChatNodeIndex([node()]).has(AGENT_SLUG)).toBe(true);
  });

  it('indexes a derived node without an agent name by map id only', () => {
    const index = buildChatNodeIndex([node({ agentSlug: null })]);
    expect([...index.keys()]).toEqual([CANVAS_ID]);
  });

  it('trims surrounding whitespace', () => {
    expect(buildChatNodeIndex([node({ agentSlug: `  ${AGENT_SLUG}  ` })]).get(AGENT_SLUG)).toBe(
      CANVAS_ID,
    );
  });

  it('skips empty names', () => {
    const index = buildChatNodeIndex([node({ agentSlug: '   ' })]);
    expect(index.has('')).toBe(false);
    expect([...index.keys()]).toEqual([CANVAS_ID]);
  });

  it('keeps the first node when two share a name', () => {
    const index = buildChatNodeIndex([
      node(),
      node({ id: 'capability:other', agentSlug: AGENT_SLUG }),
    ]);
    expect(index.get(AGENT_SLUG)).toBe(CANVAS_ID);
  });

  it('skips entries without an id', () => {
    expect(buildChatNodeIndex([node({ id: '' })]).size).toBe(0);
  });

  it('returns an empty index for empty input', () => {
    expect(buildChatNodeIndex(null).size).toBe(0);
    expect(buildChatNodeIndex([]).size).toBe(0);
  });
});
