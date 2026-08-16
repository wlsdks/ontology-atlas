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
  icon?: string | null;
  brandInk?: string | null;
}) {
  return {
    id: over.id,
    label: over.id,
    description: '',
    website: null,
    license: null,
    verified: over.verified ?? false,
    icon: over.icon ?? null,
    brandInk: over.brandInk ?? null,
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
  it('격리 못 하는 실행기에만 표시가 붙는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-gemini')).toBeInTheDocument());
    // 문자열이 아니라 **표시 자체**로 잰다. 번역 키의 접두사가 겹쳐서 문자열
    // 비교가 우연히 통과한 적이 있다(`notGuardedShort` ⊃ `notGuarded`).
    expect(
      screen.getByTestId('app-settings-runtime-gemini').querySelector('[data-runtime-unguarded]'),
    ).not.toBeNull();
    expect(
      screen.getByTestId('app-settings-runtime-claude-acp').querySelector('[data-runtime-unguarded]'),
      '막아 주는 것에 표시가 붙으면 그 표시가 아무 뜻도 안 나른다',
    ).toBeNull();
  });

  it('같은 설명을 줄마다 반복하지 않는다 — 묶음 위에 한 번만', async () => {
    /*
     * 실제로 띄워 보고 잡은 결함: 20줄 중 18줄이 같은 문장이라 화면의 절반이
     * 한 문장의 사본이었고, 읽어야 할 이름과 상태가 그 사이에 묻혔다.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'a', isolated: false }),
      makeRuntime({ id: 'b', isolated: false }),
      makeRuntime({ id: 'c', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-runtimes-guard-note')).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId('app-settings-runtimes-guard-note')).toHaveLength(1);
    expect(document.querySelectorAll('[data-runtime-unguarded]')).toHaveLength(3);
  });

  it('상태는 한 번만 말한다 — 배지 하나', async () => {
    // 같은 말을 두 번 쓰면 그 줄에서 새로 알게 되는 것이 없는 잉크가 된다.
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtimes')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));
    const row = screen.getByTestId('app-settings-runtime-cursor');
    expect(row.textContent?.match(/state\.cli-missing/g) ?? []).toHaveLength(1);
  });

  it('아이콘 자리는 아이콘이 없어도 유지된다 — 목록이 들쭉날쭉해지지 않게', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'with-icon', isolated: true, icon: '/acp-icons/with-icon.svg' }),
      makeRuntime({ id: 'no-icon', isolated: true, icon: null }),
    ]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-no-icon')).toBeInTheDocument());

    expect(
      screen
        .getByTestId('app-settings-runtime-with-icon')
        .querySelector('[data-vendor-mark="true"]'),
    ).toBeInTheDocument();
    // 아이콘이 없어도 같은 크기의 자리가 있다.
    const slots = screen
      .getByTestId('app-settings-runtime-no-icon')
      .querySelectorAll('span.size-8');
    expect(slots.length, '마크가 없어도 같은 크기의 타일 자리가 있어야 한다').toBeGreaterThan(0);
  });

  /*
   * 이 셋이 실제 결함을 잡는다. 처음 구현은 `<img>` 였고, 레지스트리 아이콘이
   * 전부 `currentColor` 단색이라 **검은 판에 검은 그림**이 됐다 — 화면에는
   * 아무것도 안 보이는데 코드에는 아무 잘못도 안 보였다(소유자가 발견).
   */
  it('마크는 색을 우리가 칠한다 — 벤더가 공표한 색이 있으면 그 색으로', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, icon: '/acp-icons/claude-acp.svg', brandInk: '#D97757' }),
    ]);
    render(<AcpRuntimeSettings />);
    const mark = await screen.findByTestId('app-settings-runtime-claude-acp');

    const ink = mark.querySelector<HTMLElement>('[data-vendor-mark-ink]');
    expect(ink).toHaveAttribute('data-vendor-mark-ink', 'brand');
    expect(ink?.style.backgroundColor).toBe('rgb(217, 119, 87)');
    // 그림은 마스크로 들어간다 — SVG 안의 내용이 우리 화면에 그려지지 않는다.
    expect(ink?.style.maskImage).toContain('/acp-icons/claude-acp.svg');
  });

  it('확인된 색이 없으면 무채색으로 그린다 — 브랜드 색을 지어내지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'unknown', isolated: true, icon: '/acp-icons/unknown.svg', brandInk: null }),
    ]);
    render(<AcpRuntimeSettings />);
    const row = await screen.findByTestId('app-settings-runtime-unknown');

    const ink = row.querySelector<HTMLElement>('[data-vendor-mark-ink]');
    expect(ink).toHaveAttribute('data-vendor-mark-ink', 'neutral');
    expect(ink?.style.backgroundColor).toContain('--color-vendor-mark-ink');
  });

  it('번들된 마크 경로가 아니면 그리지 않는다 — CSS url() 안으로 들어가는 값이다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'evil', isolated: true, icon: '/acp-icons/x.svg") ; background: url("http://evil' }),
    ]);
    render(<AcpRuntimeSettings />);
    const row = await screen.findByTestId('app-settings-runtime-evil');

    expect(row.querySelector('[data-vendor-mark="true"]')).toBeNull();
    expect(row.querySelector('[data-vendor-mark-ink]')).toBeNull();
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
