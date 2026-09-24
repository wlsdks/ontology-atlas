import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

/*
 * The locale-aware `Link` needs an intl provider this file deliberately does not mount (every
 * string here is its own key, so a real catalogue would hide which key each assertion is about).
 * A plain anchor keeps the href assertion below honest — what matters is the address the row
 * offers, not who prefixes the locale.
 */
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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

  it('목적지 안에서는 MCP 링크를 그리지 않는다 — 탭이 같은 띠에 있다', async () => {
    /*
     * 2026-09-05 measured that the installed app had no way to MCP from here and put a link in
     * this row. 2026-09-19 gave the page a tab strip with MCP on it, one press from any point of
     * this list, so the sentence pointing "below" became the dead pointer it had once fixed. The
     * sheet (not embedded) has no strip and keeps the link.
     */
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);

    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.queryByTestId('app-settings-runtimes-mcp-link')).toBeNull();
    // The bridge really was available on this path — otherwise this test measures the browser
    // branch and passes for the wrong reason.
    expect(bridge.detect).toHaveBeenCalled();
    expect(screen.queryByTestId('app-settings-runtimes-web')).toBeNull();
  });

  it('대화를 열 수 있는 도구가 없으면 디스크 고지를 그리지 않는다 — 물음표만 남지 않게', async () => {
    // The disclosure is about what opening a chat writes to disk, and a chat opens only for a
    // tool this screen confirmed and guards. With none, the hint was a lone question mark
    // beside a list that says no tool was found.
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing' })]);
    render(<AcpRuntimeSettings embedded />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.queryByTestId('app-settings-runtimes-disk-note')).toBeNull();
  });

  it('시트에서는 MCP 링크가 남는다 — 띠가 없는 곳에서 이름만 대지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.getByTestId('app-settings-runtimes-mcp-link')).toHaveAttribute('href', '/agents/?tab=mcp');
  });

  it('첫 탐색이 끝나기 전에는 「다시 확인」을 누를 수 없다', async () => {
    // The row used to offer a re-scan beside a list that says it is still looking, and a press
    // started a second scan over the first. `runtimes` is null exactly until the first answer.
    let settle: (value: unknown) => void = () => undefined;
    bridge.detect.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    render(<AcpRuntimeSettings embedded />);
    expect(screen.getByTestId('app-settings-runtimes-recheck')).toBeDisabled();
    settle([makeRuntime({ id: 'claude-acp', isolated: true, verified: true })]);
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-runtimes-recheck')).not.toBeDisabled(),
    );
  });

  /*
   * **The press stands with the group it re-scans** (2026-09-20).
   *
   * It used to sit on the intro row, level with the sentence about which tools can open a chat
   * and a whole line above the heading counting what it would re-count. The MCP tab beside this
   * one puts its own group press in its group heading, so the two tabs were asking to be read
   * differently for no reason a person could name.
   *
   * Containment rather than coordinates: the chip sits inside the heading's own row, which
   * stays true at every width and says the thing the layout is for.
   */
  it('「다시 확인」은 자기 묶음의 머리글 줄에 선다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    const chip = screen.getByTestId('app-settings-runtimes-recheck');
    // Every string here is its own key (see the `next-intl` mock at the top of this file).
    const heading = screen.getByRole('heading', { name: 'readyHeading:{"count":1}' });
    expect(heading.parentElement?.contains(chip)).toBe(true);
  });

  it('첫 탐색 중에도 묶음은 이름을 갖고, 그 줄에 「다시 확인」이 있다', async () => {
    let settle: (value: unknown) => void = () => undefined;
    bridge.detect.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    render(<AcpRuntimeSettings embedded />);
    const heading = screen.getByRole('heading', { name: 'heading' });
    const chip = screen.getByTestId('app-settings-runtimes-recheck');
    expect(heading.parentElement?.contains(chip)).toBe(true);
    settle([makeRuntime({ id: 'claude-acp', isolated: true, verified: true })]);
    await screen.findByTestId('app-settings-runtime-claude-acp');
  });

  it('디스크에 무엇이 생기는지는 힌트 안에서 말한다 — 목록 위 문단이 아니라', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    const note = screen.getByTestId('app-settings-runtimes-disk-note');
    expect(note).toHaveTextContent('diskNote');
    expect(note.closest('[role="tooltip"]'), '알림이 힌트 판 밖에 있다').not.toBeNull();
  });

  /*
   * **A hint has to hang off the thing it explains** (2026-09-21).
   *
   * On the agents tab the intro sentence and the MCP link belong to the sheet, so with one
   * confirmed tool the row above the list held this hint and nothing else: a lone question mark
   * on a row of its own, above the heading, marking nothing. In the group heading it reads
   * name · hint · re-scan — the order the MCP tab's own heading already uses.
   */
  it('디스크 힌트는 묶음 머리글 줄에 선다 — 목록 위에 혼자 뜬 물음표가 아니라', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    // Every string here is its own key (see the `next-intl` mock at the top of this file).
    const heading = screen.getByRole('heading', { name: 'readyHeading:{"count":1}' });
    const hint = screen.getByRole('button', { name: 'hintLabel' });
    expect(heading.parentElement?.contains(hint)).toBe(true);
    // Containment rather than coordinates, and the row keeps its order: hint before the re-scan.
    const row = heading.parentElement as HTMLElement;
    const chip = screen.getByTestId('app-settings-runtimes-recheck');
    expect(hint.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.contains(chip)).toBe(true);
  });

  it('대화를 열 수 있는 도구만 있으면 목록 위에 빈 줄을 두지 않는다', async () => {
    // With every confirmed tool guarded there is no guard note, and on this tab the intro and the
    // MCP link belong to the sheet — so the row would render empty and still spend a grid gap.
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.queryByTestId('app-settings-runtimes-guard-note')).toBeNull();
    const group = screen.getByTestId('app-settings-runtimes');
    const heading = screen.getByRole('heading', { name: 'readyHeading:{"count":1}' });
    // The heading's own section is the first thing in the panel; nothing empty precedes it.
    expect(group.firstElementChild?.contains(heading)).toBe(true);
  });

  it('바로 쓸 수 있는 것은 펼쳐 두고, 설치가 필요한 것은 접어 둔다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'devin', state: 'binary-missing' }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument());
    // What is behind the door is not on screen yet — 38 rows are not poured out as one block.
    expect(screen.queryByTestId('app-settings-runtime-cursor')).toBeNull();
    /*
     * ⚠️ **A door, not a fold** (owner, 2026-09-07). The chip used to carry `aria-expanded`
     * because the rest of the list unfolded underneath it; it now opens a dialog with a search,
     * so it announces `aria-haspopup="dialog"` instead. Announcing "expanded/collapsed" for a
     * control that opens a modal tells assistive tech the wrong thing about where focus is
     * about to go.
     */
    expect(screen.getByTestId('app-settings-runtimes-others-toggle')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.queryByTestId('app-settings-runtimes-others-dialog')).toBeNull();
  });

  it('나머지는 창을 열면 전부 나오고, 검색으로 좁힐 수 있다 — 목록에서 빼지 않는다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'gemini', state: 'cli-missing' }),
    ]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtimes-others-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));
    expect(screen.getByTestId('app-settings-runtimes-others-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtime-cursor')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtime-gemini')).toBeInTheDocument();

    /*
     * The search is the reason this is a dialog rather than a fold: finding one tool among 36 by
     * reading all 36 is not finding it. It reads the label and the description together, because
     * somebody looking for "the Google one" does not remember `gemini`.
     */
    fireEvent.change(screen.getByTestId('app-settings-runtimes-others-search'), {
      target: { value: 'curs' },
    });
    expect(screen.getByTestId('app-settings-runtime-cursor')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-runtime-gemini')).toBeNull();

    fireEvent.change(screen.getByTestId('app-settings-runtimes-others-search'), {
      target: { value: 'nothing-matches-this' },
    });
    expect(screen.getByTestId('app-settings-runtimes-others-empty')).toBeInTheDocument();
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

  it('Codex는 read-only 모드와 서버 체크포인트가 함께 증명되면 인앱 대화를 연다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'codex-acp', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-codex-acp')).toBeInTheDocument());
    expect(screen.getByTestId('app-settings-runtime-chat-claude-acp')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtime-chat-codex-acp')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-runtimes-guard-note')).not.toBeInTheDocument();
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
    /*
     * ⚠️ **The place it names has to be reachable** (2026-09-05). The caption used to point at a
     * section of this same screen; MCP became its own destination, and a name with no way there is
     * the dead-end guidance `.claude/rules/surfaces.md` forbids in a degradation card.
     */
    expect(screen.getByTestId('app-settings-runtimes-mcp-link')).toHaveAttribute('href', '/agents/?tab=mcp');
    // In a browser it does not even set out to look.
    expect(bridge.detect).not.toHaveBeenCalled();
  });

  it('쓸 수 있는 것이 하나도 없으면 무엇을 하면 되는지 말한다', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing' })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.getByText('noneReadyCaption')).toBeInTheDocument();
  });

  it('목록이 아예 비었으면 「아래 목록」을 가리키지 않는다', async () => {
    // The caption promised install guides "in the list below"; with no other tool found there
    // was no list below at all (design sweep, 2026-09-23).
    bridge.detect.mockResolvedValue([]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.getByText('noneReadyCaptionNoList')).toBeInTheDocument();
    expect(screen.queryByText('noneReadyCaption')).toBeNull();
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

  /*
   * Owner report, 2026-09-05: with a load average around 10, right after an in-app session ended,
   * both runtimes wore 「Sign in needed」 while `claude auth status` and `codex login status`
   * exited 0 from a shell; relaunching cleared it. A failed check must not spend the person's
   * afternoon logging in to something they are already logged in to.
   */
  it('로그인 확인이 실패하면 「확인 못 함」이라고 말하고, 도구는 그대로 쓸 수 있게 둔다', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, state: 'login-unknown' }),
    ]);
    render(<AcpRuntimeSettings />);

    const row = await screen.findByTestId('app-settings-runtime-claude-acp');

    // ① The state is said in its own word — not borrowed from 「Sign in needed」.
    expect(row.querySelector('[data-runtime-state]')).toHaveAttribute(
      'data-runtime-state',
      'login-unknown',
    );
    expect(row.textContent, '확인 못 한 것에 확인됐다는 초록 점을 달면 안 된다').not.toContain(
      'state.ready',
    );

    // ② The caption says the check did not come back — not that the person is signed out.
    expect(row.textContent).toContain('loginUnknownHint');
    expect(row.textContent).not.toContain('loginHint');

    // ③ It stays in the usable group and the chat door stays open.
    expect(screen.getByText(/readyHeading.*"count":1/)).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtime-chat-claude-acp')).toBeInTheDocument();

    // ④ Nobody is sent to install a tool that is already on the machine.
    expect(screen.queryByTestId('app-settings-runtime-install')).toBeNull();
  });
});

describe('runtime rows: marks, columns and the result block (design polish, 2026-09-25)', () => {
  it('borrows the MCP tab mark when the registry has none for the same product', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true, icon: null })]);
    render(<AcpRuntimeSettings embedded />);
    const row = await screen.findByTestId('app-settings-runtime-claude-acp');

    const ink = row.querySelector<HTMLElement>('[data-vendor-mark-ink]');
    expect(ink?.style.maskImage).toContain('/acp-icons/claude-acp.svg');
    // The MCP tab's verified brand colour comes along with its drawing.
    expect(ink).toHaveAttribute('data-vendor-mark-ink', 'brand');
    expect(row.querySelector('[data-vendor-mark="monogram"]')).toBeNull();
  });

  it('draws initials on the shared plate when no product mark is known', async () => {
    bridge.detect.mockResolvedValue([
      { ...makeRuntime({ id: 'gemini', state: 'cli-missing' }), label: 'Gemini CLI' },
      { ...makeRuntime({ id: 'goose', state: 'cli-missing' }), label: 'Goose' },
      makeRuntime({ id: 'claude-acp', isolated: true, icon: '/acp-icons/claude-acp.svg' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));

    const gemini = screen.getByTestId('app-settings-runtime-gemini');
    const goose = screen.getByTestId('app-settings-runtime-goose');
    // Two tools starting with G stay two different tiles.
    expect(gemini.querySelector('[data-vendor-mark="monogram"]')).toHaveTextContent(/^GC$/);
    expect(goose.querySelector('[data-vendor-mark="monogram"]')).toHaveTextContent(/^G$/);
    // The letters sit on VendorMark's own empty plate, not a hand-drawn copy of it.
    const plate = gemini.querySelector('[data-vendor-mark="empty"]');
    expect(plate).not.toBeNull();
    expect(plate?.parentElement?.querySelector('[data-vendor-mark="monogram"]')).not.toBeNull();
  });

  it('gives every state badge the same floor so the badges form one column', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));

    for (const id of ['claude-acp', 'cursor']) {
      const badge = screen.getByTestId(`app-settings-runtime-${id}`).querySelector('[data-runtime-state]');
      expect(badge).toHaveClass('min-w-18', 'justify-center');
    }
  });

  it('offers the Mac app as the one filled press, from the ramp rather than a hand tint', () => {
    bridge.available = false;
    render(<AcpRuntimeSettings embedded />);
    const getApp = screen.getByTestId('app-settings-runtimes-get-app');
    expect(getApp).toHaveAttribute('href', '/download/');
    expect(getApp).toHaveClass('rounded-full', 'atlas-touch-floor');
    // The fill is the ramp's `onAccent` tone (it clears the border), not an indigo tint mixed here.
    expect(getApp).toHaveClass('border-transparent');
    expect(getApp.className).not.toMatch(/indigo-a16/);
  });

  it('lists the tools the app looks for, read from the registry the app ships with', async () => {
    bridge.available = false;
    const registry = (await import('@/src-tauri/src/acp-registry.json')).default;
    render(<AcpRuntimeSettings embedded />);
    const list = screen.getByTestId('app-settings-runtimes-web-tools');
    expect(within(list).getByText(`webToolsHeading:${JSON.stringify({ count: registry.agents.length })}`)).toBeInTheDocument();
    for (const agent of registry.agents) {
      expect(within(list).getByTestId(`app-settings-runtimes-web-tool-${agent.id}`)).toHaveTextContent(agent.name);
    }
    // Nothing to press and no state to claim in a browser: marks and names only.
    expect(within(list).queryByRole('button')).toBeNull();
    expect(within(list).queryByRole('link')).toBeNull();
    expect(list.querySelector('[data-vendor-mark="monogram"]')).toBeNull();
  });

  it('keeps one winner on the web card: the app is a pill, MCP steps back to a link', () => {
    bridge.available = false;
    render(<AcpRuntimeSettings embedded />);
    const mcp = screen.getByTestId('app-settings-runtimes-mcp-link');
    expect(mcp).not.toHaveClass('rounded-full');
    expect(mcp).not.toHaveClass('border');
  });
});

describe('the other-tools shelf (round 3, 2026-09-25)', () => {
  it('puts what a person can make ready first — a sign-in, then installs — and says the undetectable state once', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'amp', state: 'cli-unknown' }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'devin', state: 'binary-missing' }),
      makeRuntime({ id: 'codex-acp', isolated: true, state: 'login-needed' }),
      makeRuntime({ id: 'zed', state: 'cli-unknown' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    const next = screen.getByTestId('app-settings-runtimes-others-shelf');
    expect(
      within(next).getAllByRole('button').map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'app-settings-runtimes-tile-codex-acp',
      'app-settings-runtimes-tile-cursor',
      'app-settings-runtimes-tile-devin',
    ]);
    const unknown = screen.getByTestId('app-settings-runtimes-unknown-shelf');
    expect(within(unknown).getAllByRole('button')).toHaveLength(2);
    // The state is said by the group, not by every tile; the tile's accessible name keeps it.
    expect(within(unknown).queryByText('state.cli-unknown')).toBeNull();
    expect(screen.getByTestId('app-settings-runtimes-unknown-shelf-note')).toHaveTextContent('unknownShelfNote');
    expect(within(unknown).getByTestId('app-settings-runtimes-tile-amp')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('state.cli-unknown'),
    );
    // One door to the setup window, on the first group's heading.
    expect(screen.getAllByTestId('app-settings-runtimes-others-toggle')).toHaveLength(1);
  });

  it('with only undetectable tools, the door moves to that group', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'amp', state: 'cli-unknown' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.queryByTestId('app-settings-runtimes-others-shelf')).toBeNull();
    expect(
      within(screen.getByTestId('app-settings-runtimes-others')).getByTestId('app-settings-runtimes-others-toggle'),
    ).toBeInTheDocument();
  });

  it('names every other tool on the page as a tile, without its row controls', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing', website: 'https://example.com' }),
      makeRuntime({ id: 'gemini', state: 'cli-missing', website: 'https://example.com' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    const shelf = screen.getByTestId('app-settings-runtimes-others-shelf');
    expect(within(shelf).getByTestId('app-settings-runtimes-tile-cursor')).toBeInTheDocument();
    expect(within(shelf).getByTestId('app-settings-runtimes-tile-gemini')).toBeInTheDocument();
    // Setting a tool up still happens in the dialog: no install link or badge row on the page.
    expect(within(shelf).queryByTestId('app-settings-runtime-install')).toBeNull();
    expect(screen.queryByTestId('app-settings-runtime-cursor')).toBeNull();
  });

  it('a tile opens the dialog already searched to that tool', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'gemini', state: 'cli-missing' }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    fireEvent.click(await screen.findByTestId('app-settings-runtimes-tile-cursor'));
    expect(screen.getByTestId('app-settings-runtimes-others-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtimes-others-search')).toHaveValue('cursor');
    // The dialog names its errand; the count stays with the shelf heading on the page.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('othersDialogTitle');
    expect(screen.getByText(`nextHeading:${JSON.stringify({ count: 2 })}`)).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-runtime-cursor')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-runtime-gemini')).toBeNull();
  });
});
