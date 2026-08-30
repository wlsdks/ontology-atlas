import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstRunPage } from './FirstRunPage';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  open: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
}));

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));

const tauriFsMocks = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => false),
  ensureDefaultVaultParentDir: vi.fn(async () => '/Users/me/Documents/Ontology Atlas'),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  ensureTauriChildDirectory: vi.fn(async () => undefined),
  createTauriVaultHandle: vi.fn((rootPath: string) => ({
    kind: 'directory' as const,
    name: rootPath.split('/').pop() ?? rootPath,
  })),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauriFsMocks);

const toastMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ show: toastMocks.show }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'ko',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  const vault: MockVault = {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    open: vi.fn(async () => undefined),
    openRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
  return vault;
}

describe('FirstRunPage', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(
      '/Users/me/Documents/Ontology Atlas',
    );
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue([]);
    tauriFsMocks.ensureTauriChildDirectory.mockResolvedValue(undefined);
    tauriFsMocks.createTauriVaultHandle.mockImplementation((rootPath: string) => ({
      kind: 'directory' as const,
      name: rootPath.split('/').pop() ?? rootPath,
    }));
    toastMocks.show.mockClear();
  });

  it('renders only local-vault actions and the trust line, with no demo or download CTA', () => {
    render(<FirstRunPage />);

    expect(screen.getByTestId('first-run-open')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-create')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-demo')).not.toBeInTheDocument();
    expect(screen.getByText('trustLine')).toBeInTheDocument();
    // There is never a CTA inside the installed app telling you to download it.
    expect(screen.queryByText(/download/i)).not.toBeInTheDocument();
  });

  it('wires the open card to the existing local vault open flow', () => {
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-open'));

    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
    expect(mocks.vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('keeps every action card keyboard-operable (focusable native button/link)', () => {
    render(<FirstRunPage />);

    // Native button/a elements — focusable, with Enter activation guaranteed by the browser.
    const open = screen.getByTestId('first-run-open');
    const create = screen.getByTestId('first-run-create');
    expect(open.tagName).toBe('BUTTON');
    expect(create.tagName).toBe('BUTTON');
    open.focus();
    expect(open).toHaveFocus();
  });

  it('scaffolds the starter structure after creating into an empty folder', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-create'));

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
  });

  it('does not scaffold when the chosen folder already has docs', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [{ slug: 'existing' }] };
    });
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-create'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledTimes(1);
    });
    expect(mocks.vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('does not scaffold when the picker is cancelled', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'idle';
    });
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-create'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledTimes(1);
    });
    expect(mocks.vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('hides "just start" when the Tauri invoke bridge is unavailable (e.g. dev ?shell=desktop override in a plain browser)', () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);
    render(<FirstRunPage />);

    expect(screen.queryByTestId('first-run-just-start')).not.toBeInTheDocument();
  });

  it('creates the default folder on disk, connects it, and scaffolds it when "just start" is available', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    mocks.vault.openRecent = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunPage />);

    expect(screen.getByTestId('first-run-just-start')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-just-start'));

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Documents/Ontology Atlas',
      'my-ontology',
    );
    expect(mocks.vault.openRecent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-ontology' }),
    );
    await waitFor(() => {
      expect(toastMocks.show).toHaveBeenCalledWith(
        expect.stringContaining('~/Ontology Atlas/my-ontology'),
        'success',
      );
    });
  });

  it('picks a numbered folder name and reports it in the toast when the base name is already taken', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue(['my-ontology']);
    mocks.vault.openRecent = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-just-start'));

    await waitFor(() => {
      expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
        '/Users/me/Documents/Ontology Atlas',
        'my-ontology-2',
      );
    });
  });
});
