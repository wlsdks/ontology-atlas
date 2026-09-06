import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/ko.json';

import { LibraryImportDialog } from './LibraryImportDialog';

/**
 * The three steps, with the service mocked.
 *
 * ⚠️ **Nothing here reaches Notion, and nothing could.** Atlas is not the MCP client — the coding
 * agent is — so the fetch and the picking happen one surface over, inside the agent turn. What
 * this file can prove, and does, is the half that is Atlas's: which descriptor gets written, that
 * it is switched on, that a token never lands in the folder's file, and that the brief handed
 * over is bounded and names the folder. The half that is not proven anywhere is a real service
 * answering; that is stated in the report rather than implied by a green test.
 */

const secretSet = vi.fn(async () => true);
vi.mock('@/shared/lib/tauri-connector-secrets', () => ({
  connectorSecretRef: (id: string, name: string) => `${id}:${name}`,
  connectorSecretSet: (...args: unknown[]) => secretSet(...(args as [])),
}));

vi.mock('@/shared/lib/tauri-connector-runtimes', () => ({
  resolveConnectorRuntimes: async () => [{ name: 'npx', path: '/opt/homebrew/bin/npx' }],
  runtimePath: (runtimes: Array<{ name: string; path: string | null }> | null, name: string) =>
    runtimes?.find((runtime) => runtime.name === name)?.path ?? null,
}));

type Attach = Parameters<typeof LibraryImportDialog>[0]['onAttach'];

function draw(overrides: Partial<Parameters<typeof LibraryImportDialog>[0]> = {}) {
  const onAttach = vi.fn<Attach>(async () => ({ status: 'saved' as const, connectors: [] }));
  const onBrief = vi.fn<Parameters<typeof LibraryImportDialog>[0]['onBrief']>();
  const onOpenAdvanced = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={messages}>
      <LibraryImportDialog
        open
        onClose={onClose}
        onAttach={onAttach}
        onBrief={onBrief}
        onOpenAdvanced={onOpenAdvanced}
        canRunAgent
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onAttach, onBrief, onOpenAdvanced, onClose };
}

const pickService = (id: string) => {
  const tile = screen
    .getAllByTestId('library-import-service')
    .find((element) => element.getAttribute('data-service') === id);
  if (!tile) throw new Error(`no tile: ${id}`);
  fireEvent.click(tile);
};

beforeEach(() => {
  secretSet.mockClear();
});

describe('bringing documents in from a service', () => {
  it('never says MCP, stdio, npx or environment variable to the person', () => {
    /*
     * The owner's condition, 2026-09-07: *"it has to be really easy to use, or nobody will."* The
     * technical dialog still exists one destination away and still uses those words; this door
     * is for somebody who wants their Notion pages and has no reason to learn them.
     */
    draw();
    /*
     * ⚠️ **The escape-hatch tile is excluded on purpose.** It is the one place the word MCP is
     * the right word: it names the other door, for somebody whose service this list does not
     * know, and calling it anything vaguer would hide the only route they have. Everything else
     * on this screen is checked.
     */
    const other = screen
      .getAllByTestId('library-import-service')
      .find((element) => element.getAttribute('data-service') === 'other');
    other?.remove();
    const text = document.body.textContent ?? '';
    for (const jargon of ['MCP', 'stdio', 'npx', 'env', 'HTTP', 'transport']) {
      expect(text).not.toContain(jargon);
    }
  });

  it('offers the way out for a service the list does not know, and does not stack two dialogs', () => {
    const { onOpenAdvanced, onClose } = draw();
    pickService('other');
    expect(onOpenAdvanced).toHaveBeenCalled();
    // Closed first: two blocking surfaces at once is the shape `design.md` forbids.
    expect(onClose).toHaveBeenCalled();
  });

  it('step one says a window will open and who keeps what comes back', () => {
    /*
     * The sign-in belongs to the coding agent. Atlas neither opens it nor holds the result, and
     * removing the row later revokes nothing — saying otherwise would claim custody Atlas does
     * not have (PO steward, 2026-09-07).
     */
    draw();
    pickService('notion');
    const step = screen.getByTestId('library-import-step');
    expect(step).toHaveAttribute('data-step', 'connect');
    expect(document.body.textContent).toContain('코딩 도구가 열고');
    expect(document.body.textContent).toContain('취소되지는 않아요');
  });

  it('writes the connection switched on, then asks what to bring', async () => {
    const { onAttach } = draw();
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));

    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    const written = onAttach.mock.calls[0]![0] as { url?: string; enabled: boolean; origin?: string };
    expect(written.url).toBe('https://mcp.notion.com/mcp');
    expect(written.enabled).toBe(true);
    expect(written.origin).toBe('library-import:notion');
    // A hosted address asks for nothing, so no keychain write happened on this path.
    expect(secretSet).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'choose'),
    );
    expect(screen.getByTestId('library-import-connected')).toBeInTheDocument();
  });

  it('stays on step one and says so when the folder saved nothing', async () => {
    /*
     * A write that never happened and one that succeeded must not look the same — the defect the
     * connector dialog already had to fix once (`ConnectorsPanel`, 2026-09-05). Here it would be
     * worse: the next step would open a conversation against a connection that does not exist.
     */
    const refuse = vi.fn(async () => ({ status: 'blocked_unavailable' as const, connectors: [] }));
    draw({ onAttach: refuse });
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));
    await waitFor(() => expect(refuse).toHaveBeenCalled());
    expect(await screen.findByTestId('library-import-failed')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'connect');
  });

  it('hands over a bounded brief naming the folder, and closes rather than stacking on the dock', async () => {
    const { onBrief, onClose } = draw();
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));
    await waitFor(() =>
      expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'choose'),
    );
    fireEvent.change(screen.getByTestId('library-import-what'), {
      target: { value: 'API 설계 문서' },
    });
    fireEvent.click(screen.getByTestId('library-import-bring'));

    expect(onBrief).toHaveBeenCalledTimes(1);
    const brief = onBrief.mock.calls[0]![0] as string;
    expect(brief).toContain('sources/notion/');
    expect(brief).toContain('at most 20');
    expect(brief).toContain('API 설계 문서');
    expect(brief).toMatch(/Do not write anything before I answer/);
    // The dock opens next, and a scrim over it would make the conversation unreachable.
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no press it cannot honour, and says what did happen instead', async () => {
    /*
     * ⚠️ **Cold walkthrough, 2026-09-07.** On a surface with no agent the last press closed the
     * dialog and produced nothing — no window, no message, no change behind it. The walker's own
     * words: *"if I hadn't been told this was expected, I would assume the feature was broken"*.
     * So the press is not offered at all, and what actually happened is said out loud: the
     * connection is saved and switched on, and any coding tool pointed at this folder can use it.
     */
    draw({ canRunAgent: false });
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));
    await waitFor(() =>
      expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'choose'),
    );
    expect(screen.queryByTestId('library-import-bring')).toBeNull();
    // And nothing left on screen still promises the conversation that cannot start.
    expect(screen.queryByTestId('library-import-runtime')).toBeNull();
    expect(document.body.textContent).not.toContain('대화가 열립니다');
    const card = screen.getByTestId('library-import-no-agent');
    expect(card).toHaveAttribute('role', 'status');
    // A reason, what still works, and a destination that opens — the degradation contract.
    expect(card).toHaveTextContent('연결은 저장되었고');
    expect(screen.getByTestId('library-import-no-agent-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
  });

  it('points at where the permission is really taken back, not only that a row does not do it', () => {
    // "Told the door doesn't lock behind me, but not where the real lock is" — cold walkthrough.
    draw();
    pickService('notion');
    expect(screen.getByTestId('library-import-revoke')).toHaveAttribute(
      'href',
      expect.stringContaining('notion.com'),
    );
  });

  it('says which conversation can reach it, so Codex does not meet a silent absence', () => {
    /*
     * `connectorAcpServers` hands connectors only to a runtime whose permission path was
     * measured, which today is Claude alone. Without this line somebody on Codex presses
     * Connect, opens the conversation, and the agent has no Notion tools — arriving at the
     * silently-absent failure through the friendliest door in the product.
     */
    draw();
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));
    return waitFor(() => {
      expect(screen.getByTestId('library-import-runtime')).toHaveTextContent('Codex');
    });
  });

  it('says where the picking happens instead of implying this screen will draw the list', () => {
    /*
     * Atlas cannot draw it: it has no way to call the service's tools or receive their result as
     * data. A screen that implies a list will appear here and then does not produce one is worse
     * than one that names the place the results actually are.
     */
    draw();
    pickService('notion');
    fireEvent.click(screen.getByTestId('library-import-connect'));
    return waitFor(() => {
      expect(document.body.textContent).toContain('대화가 열립니다');
      expect(document.body.textContent).toContain('허락을 물어봅니다');
    });
  });
});
