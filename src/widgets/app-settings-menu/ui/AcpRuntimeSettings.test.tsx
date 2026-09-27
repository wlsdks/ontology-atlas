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
 * A plain anchor instead of the locale-aware `Link`, which needs an intl provider; strings here
 * are raw keys so each assertion names its key.
 */
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { buttonVariants } from '@/shared/ui/button';

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

describe('runtime list: what works now comes first', () => {
  it("calls the chosen runtime from a ready tool's chat button", async () => {
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

  it('omits the MCP link inside the destination, whose tab bar already has it', async () => {
    // Embedded, the page's tab strip already reaches MCP; only the sheet keeps the link.
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

  it('omits the disk notice when no tool can open a chat', async () => {
    // The disclosure is about what opening a chat writes to disk, and a chat opens only for a
    // tool this screen confirmed and guards. With none, the hint was a lone question mark
    // beside a list that says no tool was found.
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing' })]);
    render(<AcpRuntimeSettings embedded />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.queryByTestId('app-settings-runtimes-disk-note')).toBeNull();
  });

  it('keeps the MCP link in the sheet, which has no tab bar', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.getByTestId('app-settings-runtimes-mcp-link')).toHaveAttribute('href', '/agents/?tab=mcp');
  });

  it('disables Check again until the first scan finishes', async () => {
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

  // Asserted by containment, not coordinates, so it holds at every width.
  it("puts Check again on its group's header row", async () => {
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

  it('names the group and shows Check again during the first scan', async () => {
    let settle: (value: unknown) => void = () => undefined;
    bridge.detect.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    render(<AcpRuntimeSettings embedded />);
    const heading = screen.getByRole('heading', { name: 'heading' });
    const chip = screen.getByTestId('app-settings-runtimes-recheck');
    expect(heading.parentElement?.contains(chip)).toBe(true);
    settle([makeRuntime({ id: 'claude-acp', isolated: true, verified: true })]);
    await screen.findByTestId('app-settings-runtime-claude-acp');
  });

  it('states what lands on disk inside the hint, not in a paragraph above the list', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
    ]);
    render(<AcpRuntimeSettings embedded />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    const note = screen.getByTestId('app-settings-runtimes-disk-note');
    expect(note).toHaveTextContent('diskNote');
    expect(note.closest('[role="tooltip"]'), 'the disk note sits outside the hint tooltip').not.toBeNull();
  });

  it('puts the disk hint on the group header row', async () => {
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

  it('leaves no empty row above the list when every tool can open a chat', async () => {
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

  it('expands ready tools and collapses tools that need installing', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true, verified: true }),
      makeRuntime({ id: 'cursor', state: 'cli-missing' }),
      makeRuntime({ id: 'devin', state: 'binary-missing' }),
    ]);
    render(<AcpRuntimeSettings />);

    await waitFor(() => expect(screen.getByTestId('app-settings-runtime-claude-acp')).toBeInTheDocument());
    // What is behind the door is not on screen yet — 38 rows are not poured out as one block.
    expect(screen.queryByTestId('app-settings-runtime-cursor')).toBeNull();
    // It opens a dialog, so it announces `aria-haspopup="dialog"`, not expanded or collapsed.
    expect(screen.getByTestId('app-settings-runtimes-others-toggle')).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.queryByTestId('app-settings-runtimes-others-dialog')).toBeNull();
  });

  it('lists every remaining tool in the dialog, filterable by search', async () => {
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

    // Search matches label and description together.
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

describe('runtime list: what the app cannot block', () => {
  it('puts no guard badge on a row', async () => {
    // What is held is that no per-row repetition appears.
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

  it('states the explanation once, before the list', async () => {
    // Including `sr-only` copies, which a screen reader would hear on every row.
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
    expect(root.textContent?.split(sentence).length, 'the explanation appears more than once').toBe(2);
    // And it comes before the list (document order).
    const group = root.querySelector('section[aria-label]');
    expect(
      note.compareDocumentPosition(group!) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the explanation must precede the list in reading order',
    ).toBeTruthy();
  });

  it('names the guarded tools in the group explanation', async () => {
    // The names come from the data, so the sentence stays true as guarded tools change.
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'claude-acp', isolated: true }),
      makeRuntime({ id: 'gemini', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    const note = await screen.findByTestId('app-settings-runtimes-guard-note');
    expect(note).toHaveAttribute('data-guarded-count', '1');
    expect(note.textContent).toContain('claude-acp'); // makeRuntime uses the label as the id
  });

  it('opens an in-app Codex chat when read-only mode and the server checkpoint are both proven', async () => {
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

  it('does not repeat the explanation on each row', async () => {
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

  it("states a row's status once, in one badge", async () => {
    // Saying the same thing twice makes that row's ink teach nothing new.
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByTestId('app-settings-runtimes')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-settings-runtimes-others-toggle'));
    const row = screen.getByTestId('app-settings-runtime-cursor');
    expect(row.textContent?.match(/state\.cli-missing/g) ?? []).toHaveLength(1);
  });

  it('keeps the icon slot when a runtime has no icon', async () => {
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
    expect(slots.length, 'a runtime without a mark keeps a same-size tile slot').toBeGreaterThan(0);
  });

  // Registry icons are single-colour `currentColor`, so an `<img>` would draw black on black.
  it("paints the mark with the vendor's published colour", async () => {
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

  it('paints the mark neutral without a verified colour', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'unknown', isolated: true, icon: '/acp-icons/unknown.svg', brandInk: null }),
    ]);
    render(<AcpRuntimeSettings />);
    const row = await screen.findByTestId('app-settings-runtime-unknown');

    const ink = row.querySelector<HTMLElement>('[data-vendor-mark-ink]');
    expect(ink).toHaveAttribute('data-vendor-mark-ink', 'neutral');
    expect(ink?.style.backgroundColor).toContain('--color-vendor-mark-ink');
  });

  it('skips a mark path that is not bundled, since it goes into a CSS url()', async () => {
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'evil', isolated: true, icon: '/acp-icons/x.svg") ; background: url("http://evil' }),
    ]);
    render(<AcpRuntimeSettings />);
    const row = await screen.findByTestId('app-settings-runtime-evil');

    expect(row.querySelector('[data-vendor-mark="true"]')).toBeNull();
    expect(row.querySelector('[data-vendor-mark-ink]')).toBeNull();
  });

  it('exposes the status as a machine-readable attribute', async () => {
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

describe('runtime list: unavailable states', () => {
  it('gives the reason and the way forward in a browser', () => {
    bridge.available = false;
    render(<AcpRuntimeSettings />);
    expect(screen.getByTestId('app-settings-runtimes-web')).toHaveTextContent('webLabel');
    expect(screen.getByTestId('app-settings-runtimes-web')).toHaveTextContent('webCaption');
    // The named destination must be reachable (`.claude/rules/surfaces.md`).
    expect(screen.getByTestId('app-settings-runtimes-mcp-link')).toHaveAttribute('href', '/agents/?tab=mcp');
    // In a browser it does not even set out to look.
    expect(bridge.detect).not.toHaveBeenCalled();
  });

  it('says what to do when no runtime is usable', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'cursor', state: 'cli-missing' })]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.getByText('noneReadyCaption')).toBeInTheDocument();
  });

  it('does not point at the list below when the list is empty', async () => {
    // The caption promised install guides "in the list below"; with no other tool found there
    // was no list below at all (design sweep, 2026-09-23).
    bridge.detect.mockResolvedValue([]);
    render(<AcpRuntimeSettings />);
    await waitFor(() => expect(screen.getByText('noneReady')).toBeInTheDocument());
    expect(screen.getByText('noneReadyCaptionNoList')).toBeInTheDocument();
    expect(screen.queryByText('noneReadyCaption')).toBeNull();
  });

  it('says searching, not none found, before the scan finishes', () => {
    bridge.detect.mockReturnValue(new Promise(() => {}));
    render(<AcpRuntimeSettings />);
    expect(screen.getByTestId('app-settings-runtimes-loading')).toBeInTheDocument();
    expect(screen.queryByText('noneReady')).toBeNull();
  });
});

export type { Runtime };

describe('runtime list: installation stays with the vendor', () => {
  /*
     * No install button that runs a script behind a URL (`forbidden.md`): it can change and
     * cannot be shown as a diff.
     */
  it("links a not-ready row to the tool's official install guide", async () => {
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

  it('shows no install guide on a ready row', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    expect(screen.queryByTestId('app-settings-runtime-install')).toBeNull();
  });

  it('does not copy install commands onto the screen', async () => {
    // A copied command goes stale and reads as vouched for.
    bridge.detect.mockResolvedValue([
      makeRuntime({ id: 'goose', state: 'cli-missing', isolated: false }),
    ]);
    render(<AcpRuntimeSettings />);
    fireEvent.click(await screen.findByTestId('app-settings-runtimes-others-toggle'));

    const text = screen.getByTestId('app-settings-runtimes').textContent ?? '';
    expect(text).not.toMatch(/curl|npm install|brew install|\| *bash/);
  });
});

describe('runtime list: render first, verify later', () => {
  it('renders first without the login check, then checks once more', async () => {
    // The login check answers late on purpose, or draw-first could not be observed.
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

  it('runs the full scan including login from Check again', async () => {
    bridge.detect.mockResolvedValue([makeRuntime({ id: 'claude-acp', isolated: true })]);
    render(<AcpRuntimeSettings />);
    await screen.findByTestId('app-settings-runtime-claude-acp');
    bridge.detect.mockClear();

    fireEvent.click(screen.getByTestId('app-settings-runtimes-recheck'));
    await waitFor(() => expect(bridge.detect).toHaveBeenCalled());
    expect(bridge.detect.mock.calls[0][0]?.probeLogin).toBe(true);
  });

  // A failed check under load is not a logged-out tool.
  it('says unverified when the login check fails and keeps the tool usable', async () => {
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
    expect(row.textContent, 'an unverified login must not show the ready dot').not.toContain(
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

  it('offers the Mac app as the one filled press, in the standard primary Button shape', () => {
    bridge.available = false;
    render(<AcpRuntimeSettings embedded />);
    const getApp = screen.getByTestId('app-settings-runtimes-get-app');
    expect(getApp).toHaveAttribute('href', '/download/');
    // The primary Button's own classes, 32px on the chip corner: not a pill, which the system
    // keeps for a state or a count (owner review, 2026-09-26).
    for (const cls of buttonVariants({ variant: 'primary', size: 'sm' }).split(' ')) {
      expect(getApp).toHaveClass(cls);
    }
    expect(getApp).not.toHaveClass('rounded-full');
    expect(getApp).toHaveClass('atlas-touch-floor');
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

  it('keeps one winner on the web card: the app is the filled press, MCP steps back to a link', () => {
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
