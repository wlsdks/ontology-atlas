import { describe, expect, it } from 'vitest';

import { agentChatDoor, type AgentChatDoorInput } from './agent-chat-door';

/** 네 입력의 **모든 조합** — 16가지. 불변식은 표본이 아니라 전수로 지킨다. */
const ALL: AgentChatDoorInput[] = [];
for (const hasRuntime of [false, true]) {
  for (const runtimeOpen of [false, true]) {
    for (const keyOpen of [false, true]) {
      for (const hasAskIntent of [false, true]) {
        ALL.push({ hasRuntime, runtimeOpen, keyOpen, hasAskIntent });
      }
    }
  }
}

describe('대화창은 하나 — 어느 갈래가 그 창을 갖나', () => {
  it('어떤 조합에서도 두 갈래가 동시에 창을 갖지 않는다', () => {
    /*
     * 이 한 줄이 이 파일의 존재 이유다. 종전 화면에서는 두 열림 상태가 서로를
     * 몰라서 지도 오른쪽에 비슷한 대화창이 둘 설 수 있었다.
     */
    for (const input of ALL) {
      const door = agentChatDoor(input);
      expect(
        door.runtime && door.key,
        `두 대화창이 같이 떴다: ${JSON.stringify(input)}`,
      ).toBe(false);
    }
  });

  it('열려 있다는 것은 둘 중 하나가 창을 가졌다는 뜻이다 — 칩이 거짓말하지 않는다', () => {
    for (const input of ALL) {
      const door = agentChatDoor(input);
      expect(door.open, JSON.stringify(input)).toBe(door.runtime || door.key);
    }
  });

  it('코딩 에이전트가 있으면 그쪽이 창을 갖는다', () => {
    const door = agentChatDoor({
      hasRuntime: true,
      runtimeOpen: true,
      keyOpen: true,
      hasAskIntent: false,
    });
    expect(door).toEqual({ runtime: true, key: false, open: true });
  });

  it('코딩 에이전트가 없으면 키 갈래가 창을 갖는다', () => {
    const door = agentChatDoor({
      hasRuntime: false,
      runtimeOpen: true,
      keyOpen: true,
      hasAskIntent: false,
    });
    expect(door).toEqual({ runtime: false, key: true, open: true });
  });

  it('노드에서 건너온 「이거 물어봐」도 같은 창으로 간다', () => {
    // 코딩 에이전트가 있으면 그 문장은 그쪽 작성 칸에 앉는다.
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: true, key: false, open: true });
    // 없으면 키 갈래가 받는다 — 종전과 같다.
    expect(
      agentChatDoor({
        hasRuntime: false,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: false, key: true, open: true });
  });

  it('아무도 안 열었으면 아무것도 안 뜬다', () => {
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: false,
      }),
    ).toEqual({ runtime: false, key: false, open: false });
  });
});
