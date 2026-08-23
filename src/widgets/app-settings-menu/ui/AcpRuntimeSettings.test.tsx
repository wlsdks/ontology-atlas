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
  it('준비된 도구의 큰 대화 버튼은 고른 runtime을 호출한다', async () => {
    const onOpenChat = vi.fn();
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded onOpenChat={onOpenChat} />);

    const button = await screen.findByTestId('app-settings-runtime-chat-claude-acp');
    expect(button).toHaveClass('min-h-8');
    fireEvent.click(button);
    expect(onOpenChat).toHaveBeenCalledWith('claude-acp');
  });

  it('바로 쓸 수 있는 것은 펼쳐 두고, 설치가 필요한 것은 접어 둔다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'devin', state: 'binary-missing' }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument());
    // What is collapsed is not on screen yet — 38 rows are not poured out as one block.
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
   * Owner call (2026-08-16): neither drop it from the list nor leave it silent. Let
   * people choose knowingly. Without this check, someone later reads the caption as
   * "wasted ink" and deletes it, and the screen stops saying that it cannot block.
   */
  it('줄에는 배지를 안 단다 — 이 사실은 배지 한 칸에 안 들어간다', async () => {
    /*
     * Removed after **three** revisions driven by owner reports (2026-08-16). All
     * three taught the same thing: a badge of 4–6 characters cannot say "can the app
     * ask on your behalf when a file outside the folder is touched". It needs both
     * condition and consequence to mean anything.
     *
     * What this check holds is not "never build a badge again" but **that visible
     * repetition does not appear on every row** — that was the symptom all three
     * times.
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
      // The only visible badge is the state.
      const visible = [...row.querySelectorAll('[data-runtime-state], [data-runtime-guarded]')];
      expect(visible.map((el) => el.getAttribute('data-runtime-state')), id).toEqual(['ready']);
    }
  });

  it('설명은 목록 **앞에** 한 번만 — 안 보이는 층에도 복사하지 않는다', async () => {
    /*
     * This sentence was once left on every row as `sr-only`. The screen went quiet,
     * but someone listening with a screen reader hears the same sentence 19 times —
     * the defect being fixed was moved into an invisible layer. With the explanation
     * **before** the list, it reaches anyone reading in order first, so no copy is
     * needed.
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
    // That explanation appears in this pane **exactly once** — a per-row copy trips here.
    expect(root.textContent?.split(sentence).length, '설명이 두 번 이상 나온다').toBe(2);
    // And it comes before the list (document order).
    const group = root.querySelector('section[aria-label]');
    expect(
      note.compareDocumentPosition(group!) & Node.DOCUMENT_POSITION_FOLLOWING,
      '설명이 목록 뒤에 있으면 순서대로 읽는 사람은 목록을 다 지난 뒤에 듣는다',
    ).toBeTruthy();
  });

  it('묶음 위 설명이 막아 주는 도구의 **이름**을 댄다 — 손으로 적은 문장이 아니다', async () => {
    /*
     * Baking "only Claude Code for now" into a string makes that sentence false from
     * the day a second one appears. The names have to come from the data.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    const note = await screen.findByTestId('app-settings-runtimes-guard-note');
    expect(note).toHaveAttribute('data-guarded-count', '1');
    expect(note.textContent).toContain('claude-acp'); // makeRuntime uses the label as the id
  });

  it('같은 설명을 줄마다 반복하지 않는다 — 묶음 위에 한 번만', async () => {
    /*
     * A defect caught by actually running it: 18 of 20 rows carried the same
     * sentence, so half the screen was one sentence copied, and the names and states
     * that had to be read were buried between them.
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
    // The fact is not copied onto the rows **in any form** — no badge, no invisible
    // text. Moving a copy into an invisible layer is the same defect.
    expect(document.querySelectorAll('[data-runtime-unguarded]')).toHaveLength(0);
  });

  it('상태는 한 번만 말한다 — 배지 하나', async () => {
    // Saying the same thing twice makes that row's ink teach nothing new.
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
    // The slot is the same size even without an icon.
    const slots = screen
      .getByTestId('app-settings-runtime-no-icon')
      .querySelectorAll('span.size-8');
    expect(slots.length, '마크가 없어도 같은 크기의 타일 자리가 있어야 한다').toBeGreaterThan(0);
  });

  /*
   * These three catch a real defect. The first implementation used `<img>`, and
   * because every registry icon is single-colour `currentColor`, it became **a black
   * drawing on a black plate** — nothing visible on screen and nothing wrong in the
   * code (the owner found it).
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
    // The drawing goes in as a mask — nothing inside the SVG is rendered on our screen.
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
    // In a browser it does not even set out to look.
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
   * The reference product (Buzz) has an `Install` button in this same place, and
   * pressing it **actually runs an install script** (measured: it runs `curl … |
   * bash`, with retries). We do not — "there is no defensible reason to run code
   * nobody has reviewed" (`forbidden.md`), and a script behind a URL can change at
   * any time, so we cannot show what we execute as a diff.
   *
   * What this check holds is that **an execute button never reappears in that place**.
   */
  it('준비 안 된 줄은 그 도구의 공식 안내로 보낸다 — 우리가 설치하지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'goose', state: 'cli-missing', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    fireEvent.click(await screen.findByTestId('app-settings-runtimes-others-toggle'));

    const link = await screen.findByTestId('app-settings-runtime-install');
    // A link, not a button — pressing it opens that tool's site.
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
     * Transcribing the command makes our copy go stale (the vendor changes it). And
     * `curl … | bash` visible on our screen reads to the user as something we
     * vouched for.
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

describe('실행기 목록 — 먼저 그리고 나중에 고친다', () => {
  /*
   * Owner report, 2026-08-16: *"When I press the Agents tab, the loading speed is about 1 second slow — shouldn't it load first and update after?"*
   *
   * Adding the login check added its cost **directly to the time the screen took to
   * appear.** The list could have been drawn first, and nothing was shown until the
   * check finished.
   */
  it('첫 그림은 로그인 확인 없이 — 확인은 그다음에 한 번 더', async () => {
    /*
     * The checking side is made to answer **deliberately late**. If both finished in
     * the same frame there would be no way to see whether "draw first" held — and
     * that is the whole of this check.
     */
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    bridge.detect.mockImplementation(async (options?: { probeLogin?: boolean }) => {
      if (options?.probeLogin) await slow;
      return [
        makeRuntime({
          id: 'claude-acp',
          isolated: true,
          state: options?.probeLogin ? 'login-needed' : 'ready',
        }),
      ];
    });
    render(<AcpRuntimeSettings />);

    // ① The list is already there **before** the check finishes — no waiting on an empty screen.
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument(),
    );
    expect(screen.getByText(/readyHeading.*"count":1/)).toBeInTheDocument();

    // ② It is corrected once the check finishes — it drops out of the ready set.
    releaseSlow();
    await waitFor(() => expect(screen.getByText(/readyHeading.*"count":0/)).toBeInTheDocument());

    // Called twice: once without the check, once with it.
    const calls = bridge.detect.mock.calls.map((c) => c[0]?.probeLogin ?? false);
    expect(calls).toEqual([false, true]);
  });

  it('「다시 확인」은 처음부터 로그인까지 확인한다 — 기다릴 각오를 한 것이다', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    bridge.detect.mockClear();

    fireEvent.click(screen.getByTestId('app-settings-runtimes-recheck'));
    await waitFor(() => expect(bridge.detect).toHaveBeenCalled());
    expect(bridge.detect.mock.calls[0][0]?.probeLogin).toBe(true);
  });
});
