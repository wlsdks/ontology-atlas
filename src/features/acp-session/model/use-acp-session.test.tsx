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
  stopped: [] as string[],
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
    const message = JSON.parse(line) as { id?: number; method?: string };
    if (typeof message.id !== 'number') return;
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
    _id: string,
    handlers: { onMessage?: (line: string) => void; onStderr?: (line: string) => void },
  ) => {
    bridge.listener = handlers.onMessage ?? null;
    bridge.stderr = handlers.onStderr ?? null;
    return () => {
      bridge.listener = null;
      bridge.stderr = null;
    };
  },
}));

import { useAcpSession } from './use-acp-session';

afterEach(() => {
  bridge.starts = 0;
  bridge.release = null;
  bridge.listener = null;
  bridge.stderr = null;
  bridge.stopped = [];
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
});

describe('진단 — 어댑터가 남긴 말이 화면에 닿는다', () => {
  it('stderr 를 받아 알림 줄로 남긴다 — 「켜는 중」이 설명되게', async () => {
    /*
     * 2026-08-16 검수에서 적발. 코드 주석은 「조용히 버리지 않는다」고 적어
     * 뒀는데 정작 stderr 를 아무도 안 듣고 있었다 — Rust 는 보내고 받는 쪽이
     * 없었다. 그래서 `Authentication required` 도 npx 설치 실패도 전부
     * 사라졌고, 멈춘 세션의 원인을 알 길이 없었다.
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
      bridge.stderr?.('Authentication required');
      bridge.stderr?.('   ');
    });

    await waitFor(() =>
      expect(
        result.current.events.some(
          (e) => e.kind === 'notice' && e.text === 'Authentication required',
        ),
        '어댑터가 남긴 말이 화면에 닿지 않는다',
      ).toBe(true),
    );
    // 빈 줄은 싣지 않는다 — 아무것도 안 나르는 줄이다.
    expect(result.current.events.filter((e) => e.kind === 'notice').length).toBe(1);

    await act(async () => {
      await result.current.stop();
    });
  });
});
