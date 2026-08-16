import { describe, expect, it } from 'vitest';

import { buildChatNodeIndex } from './chat-node-index';
import type { KnowledgeGraphNode } from '../model/types';

/**
 * 실물(설치된 앱, 2026-08-17)에서 잰 그대로의 두 이름. codex 가 답에 쓴 이름은
 * 아래쪽이고, 지도가 노드를 부르는 이름은 위쪽이다.
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
   * ⚠️ **이 검사가 먼저다.** 두 이름이 같아져 버리면 아래 검사들은 전부
   * 통과하면서 아무것도 안 재게 된다 — 「늘 초록인 검사는 검사가 아니다」.
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
    // 2026-08-17 이전의 코드가 정확히 이랬다: `new Set(nodes.map(n => n.id))`.
    const brokenIndex = new Set([node().id]);
    expect(brokenIndex.has(AGENT_SLUG)).toBe(false);
    // 고친 쪽은 걸린다.
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
