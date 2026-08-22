import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * **어댑터를 두 개 띄우지 않는다.**
 *
 * ## 왜 이 검사가 훅 단위인가
 *
 * 이 결함은 2026-08-16 에 실물에서만 드러났다 — 대화창 하나인데 프로세스가 둘:
 * ```
 * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
 * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
 * ```
 * 세션 번호는 나중 것인데 줄은 먼저 것으로 오가서 말을 걸면
 * `Session not found` 로 죽고, 먼저 뜬 프로세스는 아무도 안 끄는 유령이 된다.
 *
 * ⚠️ **위젯 단위로 먼저 써 봤는데 못 잡았다.** 그 검사에서는 effect 가 한 번만
 * 돌아서, 잠금을 일부러 늦춰도 초록이었다 — 통과하는 이유가 틀린 검사였다.
 * 진짜 조건은 「**띄우는 중에 또 불린다**」이므로 여기서 그것을 직접 만든다.
 */

const bridge = vi.hoisted(() => ({
  starts: 0,
  /** 프로세스 띄우기를 붙잡아 둘 손잡이 — 「띄우는 중」을 만든다. */
  release: null as (() => void) | null,
  listener: null as ((line: string) => void) | null,
  /** 어댑터의 진단 출력 — 「켜는 중에서 안 넘어간다」를 설명하는 유일한 창구. */
  stderr: null as ((line: string) => void) | null,
  /** 껍데기가 보내는 알림 — 관문을 못 세웠다는 사실이 이 길로 온다. */
  notice: null as ((message: string) => void) | null,
  /** 세션별 종료 콜백 — 이미 큐에 든 이전 이벤트를 다시 부를 수 있게 보관한다. */
  exits: new Map<string, () => void>(),
  /** 세션 모드 관문 적용 실패를 재현한다. */
  failSetMode: false,
  stopped: [] as string[],
  /** 우리가 보낸 요청 — 「무엇을 실어 보냈나」를 확인할 유일한 창구. */
  sent: [] as Array<{ id?: number; method?: string; params?: unknown }>,
}));

vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => true,
  startAcpSession: async () => {
    bridge.starts += 1;
    // 첫 호출은 붙잡아 둔다 — 그동안 두 번째가 들어올 자리를 만든다.
    await new Promise<void>((resolve) => {
      bridge.release = resolve;
    });
    return `acp-${bridge.starts}`;
  },
  /*
   * 악수에는 **답해 준다.** 답이 없으면 세션이 영영 안 서고, 그러면 이 검사가
   * 「잠금이 걸렸는지」가 아니라 「응답이 없는지」를 재게 된다.
   */
  sendAcpLine: async (_id: string, line: string) => {
    const message = JSON.parse(line) as { id?: number; method?: string; params?: unknown };
    bridge.sent.push(message);
    if (typeof message.id !== 'number') return;
    if (message.method === 'session/set_mode' && bridge.failSetMode) {
      queueMicrotask(() =>
        bridge.listener?.(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: 'mode rejected' },
          }),
        ),
      );
      return;
    }
    const result =
      message.method === 'session/new' || message.method === 'session/load'
        ? { sessionId: 's-1' }
        : { protocolVersion: 1 };
    queueMicrotask(() =>
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })),
    );
  },
  stopAcpSession: async (id: string) => {
    bridge.stopped.push(id);
  },
  acpPermissionVerdict: async () => 'ask',
  listenToAcpSession: async (
    id: string,
    handlers: {
      onMessage?: (line: string) => void;
      onStderr?: (line: string) => void;
      onNotice?: (message: string) => void;
      onExit?: () => void;
    },
  ) => {
    bridge.listener = handlers.onMessage ?? null;
    bridge.stderr = handlers.onStderr ?? null;
    bridge.notice = handlers.onNotice ?? null;
    if (handlers.onExit) bridge.exits.set(id, handlers.onExit);
    return () => {
      bridge.listener = null;
      bridge.stderr = null;
      bridge.notice = null;
      bridge.exits.delete(id);
    };
  },
}));

import { useAcpSession } from './use-acp-session';

afterEach(() => {
  bridge.starts = 0;
  bridge.release = null;
  bridge.listener = null;
  bridge.stderr = null;
  bridge.notice = null;
  bridge.exits.clear();
  bridge.failSetMode = false;
  bridge.stopped = [];
  bridge.sent = [];
});

describe('세션 하나 — 겹쳐 불러도 프로세스는 하나', () => {
  it('띄우는 중에 또 부르면 두 번째는 아무것도 안 한다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );

    // 첫 시도를 걸어 두고 **붙잡아 둔다** — 이 순간이 「띄우는 중」이다.
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // 그 상태에서 두 번 더 부른다 — 실물에서 일어난 그 조건이다.
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(
      bridge.starts,
      '띄우는 중에 또 띄우면 어댑터가 둘이 되고, 세션 번호와 줄이 어긋난다',
    ).toBe(1);

    /*
     * 정리 — 붙잡아 둔 것을 풀고 세션을 닫는다. 닫으면 답을 기다리던 호출이
     * 거절되고, `start` 는 그것을 스스로 받아 상태만 남긴다(그게 계약이다).
     */
    await act(async () => {
      bridge.release?.();
      await result.current.stop();
      await first;
    });
  });

  it('띄우는 도중에 닫으면 그 프로세스를 스스로 끈다 — 유령을 안 남긴다', async () => {
    /*
     * 이것도 검사가 먼저 잡았다. `stop()` 은 아직 없는 것을 치우고 끝나는데,
     * 뒤이어 `start()` 가 이어 달려 프로세스와 클라이언트를 **새로 만들어
     * 놓았다** — 닫은 화면 뒤에서 어댑터가 계속 도는 것이다.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // 아직 프로세스가 안 뜬 그 순간에 닫는다.
    await act(async () => {
      await result.current.stop();
      bridge.release?.();
      await first;
    });

    expect(bridge.stopped, '띄우던 것을 안 끄면 닫은 뒤에도 어댑터가 돈다').toContain('acp-1');
  });

  it('띄우기가 실패하면 잠금이 풀린다 — 다시는 못 띄우는 상태로 남지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // 세션이 다 선 **뒤에** 닫는다 — 이 검사는 「닫고 나서 다시 열리나」다.
    await act(async () => {
      bridge.release?.();
      await first;
    });
    await act(async () => {
      await result.current.stop();
    });

    // 정리한 뒤에는 다시 띄울 수 있어야 한다.
    const second = result.current.start();
    await waitFor(() =>
      expect(bridge.starts, '정리 뒤에 다시 못 띄우면 대화를 새로 열 수 없다').toBe(2),
    );
    await act(async () => {
      bridge.release?.();
      await result.current.stop();
      await second;
    });
  });

  it('이전 세션의 늦은 종료 이벤트가 새 세션을 끝내지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    const oldExit = bridge.exits.get('acp-1');
    expect(oldExit).toBeTruthy();

    const switching = result.current.switchSession(null);
    await waitFor(() => expect(bridge.starts).toBe(2));
    await act(async () => {
      bridge.release?.();
      await switching;
    });
    expect(result.current.status).toBe('ready');

    act(() => oldExit?.());
    expect(result.current.status, '끝난 이전 세션이 새 세션을 exited로 바꿨다').toBe('ready');

    await act(async () => {
      await result.current.send('새 세션은 살아 있어야 해');
    });
    expect(bridge.sent.filter((message) => message.method === 'session/prompt')).toHaveLength(1);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('진단 — 모아 두되 평소에는 안 보여 준다', () => {
  it('진짜 단서는 모으고, npm 경고 같은 소음은 안 모은다', async () => {
    /*
     * 이 자리는 하루에 두 번 고쳤다. 처음엔 아무도 stderr 를 안 들어서 어댑터가
     * 남긴 마지막 말이 전부 사라졌고, 듣게 했더니 이번엔 **아무 일도 안 났는데**
     * 대화창 맨 위에 영어 npm 경고 두 문단이 상주했다(소유자 화면).
     * 진단은 문제가 났을 때 단서이지 평소에 읽을 것이 아니다.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    await waitFor(() => expect(bridge.stderr).toBeTruthy());
    act(() => {
      bridge.stderr?.('npm warn Unknown env config "_jsr-registry".');
      bridge.stderr?.('Authentication required');
      bridge.stderr?.('   ');
    });

    await waitFor(() => expect(result.current.diagnostics).toEqual(['Authentication required']));
    // 진단은 **말풍선도 알림 줄도 아니다** — 대화에 섞이면 그게 소음이다.
    expect(result.current.events.filter((e) => e.kind === 'notice')).toHaveLength(0);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('볼트 서버 — 꽂았을 때만 꽂혔다고 말한다', () => {
  it('서버를 넘기면 session/new 가 그것을 싣고, 지시문도 그렇게 말한다', async () => {
    /*
     * 2026-08-16 검수의 지적: 「이 앱의 에이전트가 정말 우리 MCP 도구를 받나」를
     * **아무 검사도 확인하지 않고 있었다.** 주석 한 줄(실측 기록)이 유일한 근거였다.
     */
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [] }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    expect(call, 'session/new 자체가 안 나갔다').toBeTruthy();
    const params = call?.params as Record<string, unknown>;
    expect(params.mcpServers).toEqual([
      { name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [] },
    ]);
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).toContain('atlas-vault');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('서버가 없으면 **연결됐다고 말하지 않는다** — 없는 도구를 찾게 두지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const params = call?.params as Record<string, unknown>;
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).not.toContain('atlas-vault');
    // 나머지 규율(왜를 적어라 · 폴더 밖으로 나가지 마라)은 그대로 남는다.
    expect(meta?.systemPrompt?.append).toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('이어받은 대화 — 규칙이 달라지지 않는다', () => {
  it('session/load 에도 새 대화와 같은 지시가 실린다', async () => {
    /*
     * 2026-08-16 검수: 지시문이 **새 대화에만** 붙었다. 그래서 「지난 대화」로
     * 이어받은 세션은 다른 규칙으로 움직였다 — 관계를 바꿀 때 이유를 적으라는
     * 요구도, 폴더 밖으로 나가지 말라는 요구도 없는 채로. 같은 화면·같은
     * 폴더인데 어제 시작한 대화와 오늘 시작한 대화가 다르게 굴면 규칙이 아니다.
     */
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    // 지난 대화를 이어받는다. 붙잡아 둔 프로세스 띄우기를 그 사이에 풀어 준다 —
    // `await` 로 감으면 풀 기회가 없어 검사가 스스로 멈춘다.
    const switching = result.current.switchSession('s-old');
    await waitFor(() => expect(bridge.starts).toBe(2));
    await act(async () => {
      bridge.release?.();
      await switching;
    });

    await waitFor(() =>
      expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true),
    );
    const load = bridge.sent.find((m) => m.method === 'session/load');
    const meta = (load?.params as Record<string, unknown>)?._meta as
      | { systemPrompt?: { append?: string } }
      | undefined;
    expect(meta?.systemPrompt?.append, '이어받은 대화에 지시가 안 실렸다').toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('세션 지시문 — 실측으로 얻은 네 줄이 실제로 실린다', () => {
  /**
   * 2026-08-16 실험(같은 볼트·같은 과제, 실제 어댑터 5회):
   *
   * | | 지금 지시 | 새 지시 |
   * |---|---|---|
   * | 겹치는 개념을 시켰을 때 | **묻지 않고 새 노드를 만들었다** | 찾아서 알리고 멈췄다 |
   * | 걸린 시간 | 88초 | 50초 · 45초 |
   * | 셸·파일 직접 읽기 | 2회 | **0회** |
   * | 중복 확인 | 안 함 | 매번 |
   *
   * 이 검사는 문장 자체를 못 박지 않는다(문구는 계속 다듬을 것이다). 못 박는
   * 것은 **그 네 가지 지시가 세션에 실제로 실려 나가는가**다 — 실려 나가지
   * 않으면 위 표는 아무 의미가 없다.
   */
  it('순서 · 중복 확인 · 애매하면 묻기 · 손으로 읽지 않기 가 전부 실린다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const meta = (call?.params as Record<string, unknown>)?._meta as
      | { systemPrompt?: { append?: string } }
      | undefined;
    const prompt = meta?.systemPrompt?.append ?? '';

    // ① 도구를 우회하지 말 것
    expect(prompt, '손으로 훑지 말라는 지시가 없다').toMatch(/Do not shell out/);
    // ② 순서
    expect(prompt, '작업 순서가 없다').toMatch(/Work in this order/);
    // ③ 만들기 전에 찾아보기
    expect(prompt, '중복을 먼저 찾으라는 지시가 없다').toMatch(/similar_nodes|find_evidence/);
    // 지도 이동은 답변 문장 추측이 아니라 exact read tool 호출로 이어져야 한다.
    expect(prompt, '지도 검색과 경로 요청이 exact read tool로 이어지지 않는다').toMatch(
      /get_concept.*find_path.*move and highlight the map/i,
    );
    // ④ 애매하면 묻기 — 실측에서 가장 크게 바꾼 줄
    expect(prompt, '애매할 때 묻지 않고 만들게 된다').toMatch(/Ask first/);
    // ⑤ 사람이 쓴 언어로 답하기
    expect(prompt, '한국어로 물었는데 영어로 답한다').toMatch(/language the person wrote in/);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('관문을 못 세웠으면 화면이 말한다', () => {
  it('codex 모드 관문 적용 실패는 준비 완료가 아니며 띄운 프로세스를 끝낸다', async () => {
    bridge.failSetMode = true;
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'codex-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    await act(async () => {
      bridge.release?.();
      await first;
    });

    expect(result.current.status, '관문이 없는데 대화를 쓸 수 있게 열었다').toBe('error');
    expect(result.current.error).toContain('gate-mode-failed:read-only');
    expect(bridge.stopped, '관문 없이 뜬 어댑터가 살아남았다').toEqual(['acp-1']);
  });

  it('`gate-off:` 로 온 알림은 접어 두지 않고 대화에 남는다', async () => {
    /*
     * 2026-08-16 검수: 격리 설정을 만들다 실패해도 `.ok()` 가 그것을 삼켰고,
     * 세션은 사용자의 전역 설정을 물려받아 떴다 — 그 상태가 무엇을 뜻하는지는
     * `acp.rs` 가 직접 재서 적어 뒀다: "작업 폴더 밖에 파일을 쓰면서 한 번도
     * 묻지 않았고, 터미널까지 실행했다." 그런데 화면은 그 실행기를 계속
     * 「관문 있음」이라고 말하고 있었다.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    await waitFor(() => expect(bridge.notice).toBeTruthy());
    act(() => {
      bridge.notice?.('gate-off:isolation-failed:settings-write-failed');
      bridge.notice?.('dropped-line:something');
    });

    await waitFor(() =>
      expect(
        result.current.events.some((e) => e.kind === 'notice' && e.text === 'gate-off'),
        '관문이 없다는 사실이 화면에 안 나온다',
      ).toBe(true),
    );
    // 나머지 진단은 여전히 접혀 있다 — 대화에 섞이면 그게 소음이다.
    expect(result.current.events.filter((e) => e.kind === 'notice')).toHaveLength(1);
    expect(result.current.diagnostics.join(' ')).toContain('settings-write-failed');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('도구 입력 refinement — 실제 Claude ACP 순서', () => {
  it('status 없는 tool_call_update가 뒤늦게 보낸 rawInput을 기존 도구 행에 합친다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await starting;
    });

    act(() => {
      bridge.listener?.(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 's-1',
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-read-1',
              title: 'mcp__atlas-vault__get_concept',
              kind: 'read',
              status: 'pending',
            },
          },
        }),
      );
      // claude-agent-acp는 streamed input이 완성되면 status 없이 이 refinement를 보낸다.
      bridge.listener?.(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 's-1',
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'tool-read-1',
              rawInput: { slug: 'capabilities/mcp-server', body: 'full' },
              title: 'mcp__atlas-vault__get_concept',
              kind: 'read',
            },
          },
        }),
      );
    });

    await waitFor(() =>
      expect(result.current.events.find((event) => event.id === 'tool-read-1')).toMatchObject({
        kind: 'tool',
        status: 'pending',
        rawInput: { slug: 'capabilities/mcp-server', body: 'full' },
      }),
    );

    await act(async () => {
      await result.current.stop();
    });
  });
});
