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
  website?: string | null;
}) {
  return {
    id: over.id,
    label: over.id,
    description: '',
    website: over.website ?? 'https://example.com/install',
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
  it('줄에는 배지를 안 단다 — 이 사실은 배지 한 칸에 안 들어간다', async () => {
    /*
     * 2026-08-16, 소유자 지적으로 **세 번** 바뀐 끝에 없앤 것. 세 번 다 같은
     * 것을 가르쳤다: 4~6글자짜리 배지로는 「폴더 밖 파일을 건드릴 때 앱이 대신
     * 물어봐 줄 수 있느냐」를 말할 수 없다. 조건과 결과가 다 있어야 뜻이 선다.
     *
     * 이 검사가 지키는 것은 「배지를 다시 만들지 마라」가 아니라 **눈에 보이는
     * 반복이 줄마다 생기지 않는 것**이다 — 그게 세 번 다 나온 증상이었다.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
      makeRuntime({ id: 'cursor', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-gemini')).toBeInTheDocument());

    for (const id of ['claude-acp', 'gemini', 'cursor']) {
      const row = screen.getByTestId(`app-settings-runtime-${id}`);
      // 눈에 보이는 배지는 상태 하나뿐이다.
      const visible = [...row.querySelectorAll('[data-runtime-state], [data-runtime-guarded]')];
      expect(visible.map((el) => el.getAttribute('data-runtime-state')), id).toEqual(['ready']);
    }
  });

  it('설명은 목록 **앞에** 한 번만 — 안 보이는 층에도 복사하지 않는다', async () => {
    /*
     * 한 번은 이 문장을 줄마다 `sr-only` 로 남겼다. 화면은 조용해졌지만 낭독기로
     * 듣는 사람에게는 같은 문장이 19번 들린다 — 고치려던 그 결함을 안 보이는
     * 층으로 옮긴 것이다. 설명이 목록보다 **먼저** 오면 순서대로 읽는 사람에게
     * 먼저 도착하므로, 사본은 필요 없다.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
      makeRuntime({ id: 'cursor', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    const note = await screen.findByTestId('app-settings-runtimes-guard-note');

    const root = screen.getByTestId('app-settings-runtimes');
    const sentence = note.textContent ?? '';
    expect(sentence.length).toBeGreaterThan(0);
    // 그 설명은 이 칸에 **한 번만** 나온다 — 줄마다 복사돼 있으면 여기서 걸린다.
    expect(root.textContent?.split(sentence).length, '설명이 두 번 이상 나온다').toBe(2);
    // 그리고 목록보다 앞에 온다(문서 순서).
    const group = root.querySelector('section[aria-label]');
    expect(
      note.compareDocumentPosition(group!) & Node.DOCUMENT_POSITION_FOLLOWING,
      '설명이 목록 뒤에 있으면 순서대로 읽는 사람은 목록을 다 지난 뒤에 듣는다',
    ).toBeTruthy();
  });

  it('묶음 위 설명이 막아 주는 도구의 **이름**을 댄다 — 손으로 적은 문장이 아니다', async () => {
    /*
     * 「지금은 Claude Code 뿐」을 문자열에 박아 두면 둘째가 생기는 날부터
     * 그 문장은 거짓이 된다. 이름은 데이터에서 나와야 한다.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    const note = await screen.findByTestId('app-settings-runtimes-guard-note');
    expect(note).toHaveAttribute('data-guarded-count', '1');
    expect(note.textContent).toContain('claude-acp'); // makeRuntime 은 label 을 id 로 둔다
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
    // 줄에는 그 사실이 **아무 형태로도** 복사돼 있지 않다 — 배지도, 안 보이는
    // 글도. 사본을 안 보이는 층으로 옮기는 것도 같은 결함이다.
    expect(document.querySelectorAll('[data-runtime-unguarded]')).toHaveLength(0);
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

describe('실행기 목록 — 설치는 우리가 대신 하지 않는다', () => {
  /*
   * 참고 제품(Buzz)의 같은 자리에는 `Install` 버튼이 있고, 누르면 설치
   * 스크립트를 **실제로 실행한다**(실측: `curl … | bash` 를 재시도까지 하며
   * 돌린다). 우리는 안 한다 — 「아무도 검사하지 않은 코드를 돌릴 이유를 댈 수
   * 없다」(`forbidden.md`)이고, URL 뒤의 스크립트는 언제든 바뀌므로 우리가
   * 무엇을 실행하는지 diff 로 보여 줄 수 없다.
   *
   * 이 검사가 지키는 것은 **그 자리에 실행 버튼이 다시 생기지 않는 것**이다.
   */
  it('준비 안 된 줄은 그 도구의 공식 안내로 보낸다 — 우리가 설치하지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'goose', state: 'cli-missing', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    fireEvent.click(await screen.findByTestId('app-settings-runtimes-others-toggle'));

    const link = await screen.findByTestId('app-settings-runtime-install');
    // 링크지 버튼이 아니다 — 누르면 그 도구의 사이트가 열린다.
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('준비된 줄에는 설치 안내가 없다 — 이미 있는 것에 설치를 권하지 않는다', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.queryByTestId('app-settings-runtime-install')).toBeNull();
  });

  it('설치 명령을 화면에 베껴 두지 않는다', async () => {
    /*
     * 명령을 우리가 적어 두면 그 사본이 낡는다(벤더가 바꾼다). 그리고 화면에
     * `curl … | bash` 가 보이면 사용자는 그것을 우리가 보증한 것으로 읽는다.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'goose', state: 'cli-missing', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    fireEvent.click(await screen.findByTestId('app-settings-runtimes-others-toggle'));

    const text = screen.getByTestId('app-settings-runtimes').textContent ?? '';
    expect(text).not.toMatch(/curl|npm install|brew install|\| *bash/);
  });
});
