import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/ko.json';

import { LibraryImportDialog } from './LibraryImportDialog';

/**
 * The three steps with the service mocked. Nothing here reaches a real service; this proves the
 * descriptor written, that it is on, that no token lands in the folder file, and that the brief is
 * bounded.
 */

const secretSet = vi.fn(async (_ref: string, _value: string) => true);
vi.mock('@/shared/lib/tauri-connector-secrets', () => ({
  connectorSecretRef: (id: string, name: string) => `${id}:${name}`,
  connectorSecretSet: (...args: unknown[]) => secretSet(...(args as [string, string])),
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
        agentGap="browser"
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onAttach, onBrief, onOpenAdvanced, onClose };
}

/** The one value the Notion program asks for; the tests never check its shape, only its path. */
const typeToken = () =>
  fireEvent.change(screen.getByTestId('library-import-token'), {
    target: { value: 'ntn_test_value' },
  });

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
    /* This door never uses the technical words; the MCP screen still does. */
    draw();
    /*
     * The escape-hatch tile is excluded on purpose: there MCP is the right word for the other door.
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

  it('step one asks for the one value, says where it is issued, and who uses it', () => {
    /*
     * The token goes to the keychain, the folder's file gets the name, and the coding tool reaches
     * the service.
     */
    draw();
    pickService('notion');
    const step = screen.getByTestId('library-import-step');
    expect(step).toHaveAttribute('data-step', 'connect');
    expect(screen.getByTestId('library-import-token')).toBeInTheDocument();
    expect(screen.getByTestId('library-import-token-issue')).toHaveAttribute('href', expect.stringMatching(/^https:/));
    expect(document.body.textContent).toContain('키체인');
    expect(document.body.textContent).toContain('코딩 도구');
    // The press waits for the value.
    expect(screen.getByTestId('library-import-connect')).toBeDisabled();
  });

  it('writes the connection switched on, then asks what to bring', async () => {
    const { onAttach } = draw();
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));

    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    const written = onAttach.mock.calls[0]![0] as {
      args: string[];
      enabled: boolean;
      origin?: string;
    };
    expect(written.args.join(' ')).toContain('@notionhq/notion-mcp-server');
    expect(written.enabled).toBe(true);
    expect(written.origin).toBe('library-import:notion');
    // The value went to the keychain, after the row was on disk, and never into the folder.
    await waitFor(() => expect(secretSet).toHaveBeenCalledTimes(1));
    expect(secretSet.mock.calls[0]![1]).toBe('ntn_test_value');
    expect(JSON.stringify(written)).not.toContain('ntn_test_value');

    await waitFor(() =>
      expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'choose'),
    );
    expect(screen.getByTestId('library-import-connected')).toBeInTheDocument();
  });

  it('stays on step one and says so when the folder saved nothing', async () => {
    /*
     * A failed write must not look like a successful one, or the next step opens a conversation on
     * a missing connection.
     */
    const refuse = vi.fn(async () => ({ status: 'blocked_unavailable' as const, connectors: [] }));
    draw({ onAttach: refuse });
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));
    await waitFor(() => expect(refuse).toHaveBeenCalled());
    expect(await screen.findByTestId('library-import-failed')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'connect');
  });

  it('hands over a bounded brief naming the folder, and closes rather than stacking on the dock', async () => {
    const { onBrief, onClose } = draw();
    pickService('notion');
    typeToken();
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
     * With no agent the last press is not offered; the screen says the connection is saved and on
     * for any coding tool on this folder.
     */
    draw({ canRunAgent: false });
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));
    await waitFor(() =>
      expect(screen.getByTestId('library-import-step')).toHaveAttribute('data-step', 'choose'),
    );
    expect(screen.queryByTestId('library-import-bring')).toBeNull();
    // And nothing left on screen still promises the conversation that cannot start.
    expect(screen.queryByTestId('library-import-runtime')).toBeNull();
    expect(document.body.textContent).not.toContain('대화가 열려요');
    const card = screen.getByTestId('library-import-no-agent');
    expect(card).toHaveAttribute('role', 'status');
    // A reason, what still works, and a destination that opens — the degradation contract.
    expect(card).toHaveTextContent('연결은 저장되었고');
    expect(screen.getByTestId('library-import-no-agent-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
  });

  it('names the right absence: the app has a runtime gap, not a browser', () => {
    /*
     * A browser cannot start programs while the app simply has no verified coding tool yet, so the
     * two absences get different sentences.
     */
    draw({ canRunAgent: false, agentGap: 'runtime' });
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));
    return waitFor(() => {
      const card = screen.getByTestId('library-import-no-agent');
      expect(card).toHaveTextContent('아직 준비된 도구가 없어요');
      expect(card.textContent).not.toContain('브라우저');
      expect(screen.getByTestId('library-import-no-agent-app')).toHaveAttribute(
        'href',
        expect.stringContaining('/agents'),
      );
    });
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
     * Connectors reach only runtimes with a measured permission path (Claude today), so Codex users
     * must be told.
     */
    draw();
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));
    return waitFor(() => {
      expect(screen.getByTestId('library-import-runtime')).toHaveTextContent('Codex');
    });
  });

  it('says where the picking happens instead of implying this screen will draw the list', () => {
    /* Atlas cannot draw the result list, so the screen names where the results are. */
    draw();
    pickService('notion');
    typeToken();
    fireEvent.click(screen.getByTestId('library-import-connect'));
    return waitFor(() => {
      expect(document.body.textContent).toContain('대화가 열려요');
      expect(document.body.textContent).toContain('허락을 물어봐요');
    });
  });
});

describe('the service tiles fill their column', () => {
  it('lets an odd last tile span both columns, so the two-column grid leaves no hole', () => {
    draw();
    const cells = screen.getAllByTestId('library-import-service').map((tile) => tile.closest('li'));
    const spanning = cells.filter((cell) => cell?.className.includes('sm:col-span-2'));
    expect(spanning).toEqual(cells.length % 2 === 1 ? [cells.at(-1)] : []);
  });
});
