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

describe('채팅에 나온 이름 → 지도 노드', () => {
  /*
   * ⚠️ **This check comes first.** If the two names ever coincide, every test below
   * passes while measuring nothing — a check that is always green is not a check.
   */
  it('두 이름은 실제로 다르다 — 같아지면 이 파일 전체가 헛돈다', () => {
    expect(AGENT_SLUG).not.toBe(CANVAS_ID);
  });

  it('에이전트가 쓰는 이름으로 지도 노드를 찾는다', () => {
    expect(buildChatNodeIndex([node()]).get(AGENT_SLUG)).toBe(CANVAS_ID);
  });

  it('지도 id 를 그대로 적어도 찾는다', () => {
    expect(buildChatNodeIndex([node()]).get(CANVAS_ID)).toBe(CANVAS_ID);
  });

  it('**결함 재현** — 지도 id 만으로 만들면 에이전트의 이름이 안 걸린다', () => {
    // This is exactly what the code did before 2026-08-17: `new Set(nodes.map(n => n.id))`.
    const brokenIndex = new Set([node().id]);
    expect(brokenIndex.has(AGENT_SLUG)).toBe(false);
    // The fixed version matches.
    expect(buildChatNodeIndex([node()]).has(AGENT_SLUG)).toBe(true);
  });

  it('에이전트 이름이 없는 노드(파생 노드)는 지도 id 로만 걸린다', () => {
    const index = buildChatNodeIndex([node({ agentSlug: null })]);
    expect([...index.keys()]).toEqual([CANVAS_ID]);
  });

  it('앞뒤 공백은 다듬는다 — 볼트가 적어 둔 값이 늘 깨끗하지는 않다', () => {
    expect(buildChatNodeIndex([node({ agentSlug: `  ${AGENT_SLUG}  ` })]).get(AGENT_SLUG)).toBe(
      CANVAS_ID,
    );
  });

  it('빈 이름은 넣지 않는다 — 빈 문자열이 키가 되면 아무 글에나 걸린다', () => {
    const index = buildChatNodeIndex([node({ agentSlug: '   ' })]);
    expect(index.has('')).toBe(false);
    expect([...index.keys()]).toEqual([CANVAS_ID]);
  });

  it('같은 이름이 둘이면 먼저 온 노드가 이긴다 — 조용히 바뀌지 않게', () => {
    const index = buildChatNodeIndex([
      node(),
      node({ id: 'capability:other', agentSlug: AGENT_SLUG }),
    ]);
    expect(index.get(AGENT_SLUG)).toBe(CANVAS_ID);
  });

  it('id 가 없는 항목은 건너뛴다', () => {
    expect(buildChatNodeIndex([node({ id: '' })]).size).toBe(0);
  });

  it('빈 입력은 빈 결과다', () => {
    expect(buildChatNodeIndex(null).size).toBe(0);
    expect(buildChatNodeIndex([]).size).toBe(0);
  });
});
