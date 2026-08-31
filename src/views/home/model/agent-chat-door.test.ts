import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { agentChatDoor, type AgentChatDoorInput } from './agent-chat-door';
import { parseHomeRouteState } from './url-state';

const homePageSource = readFileSync('src/views/home/ui/HomePage.tsx', 'utf8');

/** **Every combination** of the four inputs — 16. The invariant is held
 *  exhaustively, not by sampling. */
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
     * This one line is why the file exists. On the old screen the two open
     * states did not know about each other, so two similar chat windows could
     * stand to the right of the map.
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
    // With a coding agent present the sentence lands in its composer.
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: true, key: false, open: true });
    // Without one the key branch takes it — unchanged from before.
    expect(
      agentChatDoor({
        hasRuntime: false,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: true,
      }),
    ).toEqual({ runtime: false, key: true, open: true });
  });

  it('전체 그래프 흐름 요청도 설치된 코딩 에이전트의 같은 창으로 간다', () => {
    const route = parseHomeRouteState(new URLSearchParams('ask=business-flow'));

    expect(route.askBusinessFlow).toBe(true);
    expect(
      agentChatDoor({
        hasRuntime: true,
        runtimeOpen: false,
        keyOpen: false,
        hasAskIntent: route.askBusinessFlow,
      }),
    ).toEqual({ runtime: true, key: false, open: true });
    // INDEX and the first-run card must yield on the arrival frame too; otherwise
    // the correct door opens into a squeezed map before its derived prefill exists.
    expect(homePageSource).toMatch(
      /const agentDockRequestedOpen\s*=\s*[\s\S]{0,260}routeState\.askBusinessFlow/,
    );
    // Ownership is not visibility: the ACP frame itself is stateful so it can animate
    // its width. The route handoff must enter the same open function as a button, and
    // that function must drive both the width and Surface `open` bindings.
    expect(homePageSource).toMatch(
      /const routeAskDockRequestRef[\s\S]{0,1800}openVaultAgent\(\);/,
    );
    expect(homePageSource).toMatch(
      /if \(agentChatUsesRuntime\)[\s\S]{0,220}setAcpDockFrameOpen\(true\)/,
    );
    expect(homePageSource).toContain(
      'width: acpDockFrameOpen ? `${chatWidth.width}px` : "0px"',
    );
    expect(homePageSource).toContain('open={acpDockFrameOpen}');
  });

  it('흐름 요청은 두 대화 갈래 모두 입력칸에만 앉고 자동 전송 경로에는 들어가지 않는다', () => {
    expect(
      homePageSource.match(
        /prefillRequest=\{vaultAgentPrefill \?\? askPrefill\}/g,
      ),
    ).toHaveLength(2);
    expect(homePageSource).not.toMatch(
      /openingRequest=\{[^}]*askPrefill[^}]*\}/,
    );
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
