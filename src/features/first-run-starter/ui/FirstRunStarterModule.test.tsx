import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from '../model/first-run-starter-dismiss';
import { FirstRunStarterModule } from './FirstRunStarterModule';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  recentVaults: unknown[];
  open: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: 'no-folder' as 'no-folder' | 'local',
  requestAgentChat: vi.fn(),
  pickedProject: '/Users/dana/my-product' as string | null,
  pickerThrows: false,
  ensureChildDir: vi.fn(async (_root: string, _name: string) => undefined),
}));

vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/vault-folder/native-vault/tauri-vault-files')>()),
  listTauriDirectoryNames: async () => ['src', 'package.json'],
  ensureTauriChildDirectory: (root: string, name: string) => mocks.ensureChildDir(root, name),
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-handle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/vault-folder/native-vault/tauri-vault-handle')>()),
  createTauriVaultHandle: (rootPath: string) => ({ name: rootPath }),
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-location', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/vault-folder/native-vault/tauri-vault-location')>()),
  pickTauriVaultDirectory: async () => {
    if (mocks.pickerThrows) throw new Error('picker exploded');
    return mocks.pickedProject === null ? null : { name: 'picked' };
  },
}));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/vault-folder/native-vault/tauri-vault-runtime')>()),
  getTauriVaultRootPath: () => mocks.pickedProject,
}));

vi.mock('@/entities/vault-session/model/vault-provider/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-provider/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock('@/entities/vault-session/model/vault-source/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-source/use-data-source-mode')>()),
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('@/shared/lib/agent-chat/agent-chat-intent', () => ({
  requestAgentChat: (...args: unknown[]) => mocks.requestAgentChat(...args),
}));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('use-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
      { rich: (key: string) => key },
    ),
  useLocale: () => 'ko',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [],
    open: vi.fn(async () => ({ opened: false, starterWritten: 0, starterError: null })),
    openRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

const openWords = () => fireEvent.click(screen.getByTestId('first-run-starter-glossary-open'));

describe('FirstRunStarterModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'no-folder';
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('opens with a heading and one body sentence above the actions', () => {
    render(<FirstRunStarterModule agentAvailable />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('headline');
    expect(screen.getByTestId('first-run-starter-context')).toHaveTextContent('body');
    const card = screen.getByTestId('first-run-starter');
    const order = ['first-run-starter-headline', 'first-run-starter-context', 'first-run-starter-open'];
    const positions = order.map((id) => [...card.querySelectorAll('[data-testid]')].findIndex((element) => element.getAttribute('data-testid') === id));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('puts every action on the face with nothing that unfolds in place', () => {
    render(<FirstRunStarterModule agentAvailable onEnablePlainMode={vi.fn()} />);
    const card = screen.getByTestId('first-run-starter');
    expect(card.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    const faceButtons = [...card.querySelectorAll('button')].map((button) => button.getAttribute('data-testid'));
    expect(faceButtons).toEqual([
      'first-run-starter-dismiss',
      'first-run-starter-open',
      'first-run-starter-create',
      'first-run-starter-glossary-open',
      'first-run-build-from-code',
    ]);
    expect(screen.queryByTestId('first-run-starter-glossary')).not.toBeInTheDocument();
  });

  it('opens the glossary in a dialog with the plain-mode action, and closes it', () => {
    const onEnablePlainMode = vi.fn();
    render(<FirstRunStarterModule onEnablePlainMode={onEnablePlainMode} />);
    openWords();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(screen.getByTestId('first-run-starter-glossary'));
    expect(screen.getByTestId('first-run-starter')).not.toContainElement(dialog);
    fireEvent.click(screen.getByTestId('first-run-dialog-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the ⌘O badge on non-Apple platforms', () => {
    render(<FirstRunStarterModule agentAvailable />);
    expect(screen.getByTestId('first-run-starter-open')).not.toHaveTextContent('⌘O');
  });

  it('shows the ⌘O badge on Apple platforms', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    try {
      render(<FirstRunStarterModule agentAvailable />);
      expect(screen.getByTestId('first-run-starter-open')).toHaveTextContent('⌘O');
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original);
    }
  });

  it('promotes the plain-mode hint to a one-click toggle when the callback is provided', () => {
    const onEnablePlainMode = vi.fn();
    render(
      <FirstRunStarterModule
        onEnablePlainMode={onEnablePlainMode}
      />,
    );
    openWords();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-plain-toggle'));
    expect(onEnablePlainMode).toHaveBeenCalledTimes(1);
  });

  it('hides the plain-mode toggle entirely once plain mode is already on', () => {
    render(
      <FirstRunStarterModule
        onEnablePlainMode={vi.fn()}
        audiencePlain
      />,
    );
    openWords();
    expect(screen.getByTestId('first-run-starter-glossary')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-plain-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
  });

  it('does not render once a vault is active (local mode)', () => {
    mocks.mode = 'local';
    render(<FirstRunStarterModule agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('does not render before the vault restore attempt has settled', () => {
    mocks.vault.restoreAttempted = false;
    render(<FirstRunStarterModule agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('opens the guide sheet first, then wires "choose existing" to vault.open()', () => {
    render(<FirstRunStarterModule agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(mocks.vault.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vault-guide-pick-existing'));
    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('the sheet\'s "start fresh" opens a folder that is seeded with the starter when empty', async () => {
    mocks.vault.open = vi.fn(async () => ({ opened: true, starterWritten: 12, starterError: null }));
    render(<FirstRunStarterModule agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vault-guide-create-new'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledWith({ starter: { locale: 'ko', shape: undefined } });
    });
  });

  it('dismissing hides the module and persists for the session', () => {
    render(<FirstRunStarterModule agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('does not render at all on a later mount within the same session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');

    render(<FirstRunStarterModule agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('hands focus to the reopen row when Close is pressed', () => {
    render(<FirstRunStarterModule agentAvailable />);
    const close = screen.getByTestId('first-run-starter-dismiss');
    close.focus();
    fireEvent.click(close);
    expect(screen.getByTestId('first-run-starter-reopen')).toHaveFocus();
  });

  it('leaves a quiet reopen row after dismiss and restores the card on click', () => {
    render(<FirstRunStarterModule agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    const reopen = screen.getByTestId('first-run-starter-reopen');
    fireEvent.click(reopen);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('auto-opens the folder guide sheet once on the very first visit', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '1');
    window.localStorage.removeItem('vault-open-guide:auto:v1');
    render(<FirstRunStarterModule agentAvailable />);
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    expect(window.localStorage.getItem('vault-open-guide:auto:v1')).toBe('1');
    vi.useRealTimers();
  });

  it('does not auto-open the folder guide sheet on later visits', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
    render(<FirstRunStarterModule agentAvailable />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('Escape while the guide sheet is open closes the sheet, not the card', () => {
    render(<FirstRunStarterModule agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('Escape dismisses the module', () => {
    render(<FirstRunStarterModule agentAvailable />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // A person with only the app cannot run a source-checkout command, so neither the card nor the
  // folder guide offers one.
  it('offers no terminal command on the card or in the folder guide', () => {
    render(<FirstRunStarterModule agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-guide-last-section')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/cli\/src\/index\.mjs/);
  });

  it('falls back to the plain-mode gear hint in the glossary without a callback', () => {
    render(<FirstRunStarterModule agentAvailable />);

    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    openWords();
    const hint = screen.getByTestId('first-run-starter-plain-mode-hint');
    expect(hint).toHaveTextContent('plainModeHint');
  });

});

describe('FirstRunStarterModule renders the guide or INDEX exclusively', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'no-folder';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('does not render INDEX children while the guide is expanded', () => {
    render(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('shows a one-row return and INDEX children after closing', () => {
    render(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('restores the guide to the panel when return is pressed', () => {
    render(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('draws only INDEX in local vault mode', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-reopen')).not.toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });
});

describe('FirstRunStarterModule yields to INDEX when a lens is active', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'no-folder';
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
  });

  it('collapses the card and renders children when lensActive turns on', () => {
    const { rerender } = render(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), 'the card must fill the panel first').toBeNull();

    rerender(
      <FirstRunStarterModule lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'INDEX did not open when the lens turned on').toBeInTheDocument();
  });

  it('stays collapsed when the lens turns off', () => {
    const { rerender } = render(
      <FirstRunStarterModule lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body')).toBeInTheDocument();

    rerender(
      <FirstRunStarterModule>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'the tree disappeared when the lens turned off').toBeInTheDocument();
  });

  it('offers the build-from-code door on the card and says it asks before writing', async () => {
    render(<FirstRunStarterModule agentAvailable />);
    const door = screen.getByTestId('first-run-build-from-code');
    expect(door).toHaveTextContent('buildFromCodeLabel');
    expect(screen.getByTestId('first-run-starter')).toHaveTextContent('buildFromCodeHint');

    await act(async () => {
      fireEvent.click(door);
    });

    expect(screen.getByTestId('build-from-code-path')).toHaveTextContent(
      '/Users/dana/my-product/atlas',
    );
    expect(
      mocks.ensureChildDir,
      'created a folder at the path preview step',
    ).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('build-from-code-go'));
    });
    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.vault.openRecent).toHaveBeenCalledTimes(1);
    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
  });

  it('creates nothing and clears the path on cancel', async () => {
    render(<FirstRunStarterModule agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    await screen.findByTestId('build-from-code-path');
    fireEvent.click(screen.getByTestId('build-from-code-cancel'));
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  it('shows the door to someone who opened folders many times without building a map', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule mapUnbuilt agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter'), 'the card was already done').toBeNull();
    expect(
      screen.getByTestId('index-build-from-code'),
      'opening folders many times must not count as done',
    ).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('hides the door once code is connected', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
  });

  it('reports a failure that happens before the project pick', async () => {
    mocks.pickerThrows = true;
    render(<FirstRunStarterModule agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    expect(screen.getByTestId('first-run-build-error')).toBeInTheDocument();
  });

  it('does not draw the door without an agent to hand off to', () => {
    render(<FirstRunStarterModule />);
    expect(screen.getByTestId('first-run-starter-create')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-build-from-code')).toBeNull();
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });

  it('does not draw the code-owner row without an agent', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule mapUnbuilt>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

});
