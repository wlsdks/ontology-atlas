import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  available: true,
  detect: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => bridge.available,
  detectAcpRuntimes: bridge.detect,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { AcpRuntimeSettings } from './AcpRuntimeSettings';

type Runtime = Parameters<typeof makeRuntime>[0];

function makeRuntime(over: {
  id: string;
  state?: string;
  isolated?: boolean;
  verified?: boolean;
}) {
  return {
    id: over.id,
    label: over.id,
    description: '',
    website: null,
    license: null,
    verified: over.verified ?? false,
    launchKind: 'npx' as const,
    state: (over.state ?? 'ready') as 'ready',
    cliPath: null,
    adapterPath: null,
    adapterPackage: null,
    isolated: over.isolated ?? false,
  };
}

afterEach(() => {
  cleanup();
  bridge.available = true;
  bridge.detect.mockReset();
});

describe('실행기 목록 — 지금 할 수 있는 일이 먼저다', () => {
  it('바로 쓸 수 있는 것은 펼쳐 두고, 설치가 필요한 것은 접어 둔다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'devin', state: 'binary-missing' }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument());
    // 접혀 있는 것은 아직 화면에 없다 — 38줄을 한 덩어리로 쏟지 않는다.
    expect(screen.queryByTestId('app-settings-runtime-cursor')).toBeNull();
    expect(screen.getByTestId('app-settings-runtimes-others-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('접힌 묶음을 펼치면 나머지가 전부 나온다 — 목록에서 빼지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
    ]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtimes-others-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));
    expect(screen.getByTestId('app-settings-runtime-cursor')).toBeInTheDocument();
  });
});

describe('실행기 목록 — 앱이 못 막는 것은 그 줄에서 말한다', () => {
  /*
   * 소유자 확정(2026-08-16): 목록에서 빼지도, 조용히 두지도 않는다. 알고
   * 고르게 한다. 이 검사가 없으면 나중에 누가 캡션을 「잉크 낭비」로 보고
   * 지우고, 그때 화면은 못 막는다는 사실을 말하지 않게 된다.
   */
  it('격리 못 하는 실행기는 캡션으로 그 사실을 말한다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-gemini')).toBeInTheDocument());
    expect(screen.getByTestId('app-settings-runtime-gemini')).toHaveTextContent('notGuarded');
    // 막아 주는 것에는 그 문구가 없다 — 있으면 그 말이 아무 뜻도 안 나른다.
    expect(screen.getByTestId('app-settings-runtime-claude-acp')).not.toHaveTextContent('notGuarded');
  });

  it('상태는 배지가 말하고 캡션이 되풀이하지 않는다', async () => {
    // 같은 말을 두 번 쓰면 그 줄에서 새로 알게 되는 것이 없는 잉크가 된다.
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtimes')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));
    const row = screen.getByTestId('app-settings-runtime-cursor');
    expect(row.textContent?.match(/state\.cli-missing/g) ?? []).toHaveLength(1);
  });

  it('상태를 기계가 읽을 수 있게 남긴다 — 색만으로 구별하지 않는다', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument());

    const badge = screen
      .getByTestId('app-settings-runtime-claude-acp')
      .querySelector('[data-runtime-state]');
    expect(badge).toHaveAttribute('data-runtime-state', 'ready');
    expect(badge).toHaveTextContent('state.ready');
  });
});

describe('실행기 목록 — 못 하는 일은 정직하게', () => {
  it('브라우저에서는 이유와 갈 곳을 말한다', () => {
    bridge.available = false;
    render(<AcpRuntimeSettings />);
    expect(screen.getByTestId('app-settings-runtimes-web')).toHaveTextContent('webLabel');
    expect(screen.getByTestId('app-settings-runtimes-web')).toHaveTextContent('webCaption');
    // 브라우저에서는 찾으러 나서지도 않는다.
    expect(bridge.detect).not.toHaveBeenCalled();
  });

  it('쓸 수 있는 것이 하나도 없으면 무엇을 하면 되는지 말한다', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing' })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.getByText('noneReadyCaption')).toBeInTheDocument();
  });

  it('다 찾기 전에는 「찾는 중」이라고만 한다 — 없다고 단정하지 않는다', () => {
    bridge.detect.mockReturnValue(new Promise(() => {}));
    render(<AcpRuntimeSettings />);
    expect(screen.getByTestId('app-settings-runtimes-loading')).toBeInTheDocument();
    expect(screen.queryByText('noneReady')).toBeNull();
  });
});

export type { Runtime };
