import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstRunPage } from './FirstRunPage';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  open: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  forgetRecent: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
  /** Empty by default, so the first-run cases see no launch chooser list. */
  recentVaults: unknown[];
  awaitingVaultChoice: boolean;
  storedVaultRecord: unknown | null;
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
  useTranslations: () =>
    Object.assign(
      (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
      { has: () => false },
    ),
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

const NOT_OPENED = { opened: false, starterWritten: 0, starterError: null };

function makeVault(): MockVault {
  const vault: MockVault = {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    open: vi.fn(async () => NOT_OPENED),
    openRecent: vi.fn(async () => NOT_OPENED),
    forgetRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
    recentVaults: [],
    awaitingVaultChoice: false,
    storedVaultRecord: null,
  };
  return vault;
}

type StarterRequest = { locale: string; shape?: { map: boolean; wiki: boolean } };

/**
 * Unmounts the page when the folder starts opening, as the shell does, over an empty folder
 * whose disk the test reads, so either starter route is asserted by its result.
 */
function swappingVault(unmountPage: () => void) {
  const disk: string[] = [];
  const writeStarter = (request: StarterRequest) => {
    const shape = request.shape ?? { map: true, wiki: true };
    if (shape.map) disk.push(`project.md (${request.locale})`);
    if (shape.wiki) disk.push(`wiki/_template.md (${request.locale})`);
  };
  const settle = async (options?: { starter?: StarterRequest }) => {
    mocks.vault.status = 'opening';
    unmountPage();
    await Promise.resolve();
    if (options?.starter) writeStarter(options.starter);
    mocks.vault.status = 'loaded';
    mocks.vault.manifest = { docs: [...disk] };
    return { opened: true, starterWritten: disk.length, starterError: null };
  };
  mocks.vault.open = vi.fn(async (options?: { starter?: StarterRequest }) => settle(options));
  mocks.vault.openRecent = vi.fn(async (_record: unknown, options?: { starter?: StarterRequest }) =>
    settle(options),
  );
  mocks.vault.scaffoldOntology = vi.fn(async (locale: string, shape?: StarterRequest['shape']) => {
    writeStarter({ locale, shape });
    return { created: disk.length, skipped: 0 };
  });
  return disk;
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

  it('renders only local-vault actions, with no trust footer, demo or download CTA', () => {
    render(<FirstRunPage />);

    expect(screen.getByTestId('first-run-open')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-create')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-demo')).not.toBeInTheDocument();
    expect(screen.queryByText('trustLine')).not.toBeInTheDocument();
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

    const open = screen.getByTestId('first-run-open');
    const create = screen.getByTestId('first-run-create');
    expect(open.tagName).toBe('BUTTON');
    expect(create.tagName).toBe('BUTTON');
    open.focus();
    expect(open).toHaveFocus();
  });

  it('creating asks the open for the starter the person chose, in the screen language', async () => {
    mocks.vault.open = vi.fn(async () => ({ opened: true, starterWritten: 12, starterError: null }));
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-create'));
    fireEvent.click(screen.getByTestId('first-run-shape-map'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledWith({
        starter: { locale: 'ko', shape: { map: true, wiki: false } },
      });
    });
    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('a cancelled picker leaves no toast and no error', async () => {
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-create'));
    fireEvent.click(screen.getByTestId('first-run-shape-both'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledTimes(1);
    });
    expect(toastMocks.show).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('just start leaves its starter on disk and says where, though the page is swapped away mid-open', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    let unmountPage = () => undefined as void;
    const disk = swappingVault(() => unmountPage());
    const { unmount } = render(<FirstRunPage />);
    unmountPage = unmount;

    fireEvent.click(screen.getByTestId('first-run-just-start'));
    fireEvent.click(screen.getByTestId('first-run-shape-both'));

    await waitFor(() => {
      expect(disk).toEqual(['project.md (ko)', 'wiki/_template.md (ko)']);
    });
    await waitFor(() => {
      expect(toastMocks.show).toHaveBeenCalledWith(
        expect.stringContaining('~/Ontology Atlas/my-ontology'),
        'success',
      );
    });
  });

  it('create leaves its starter on disk though the page is swapped away mid-open', async () => {
    let unmountPage = () => undefined as void;
    const disk = swappingVault(() => unmountPage());
    const { unmount } = render(<FirstRunPage />);
    unmountPage = unmount;

    fireEvent.click(screen.getByTestId('first-run-create'));
    fireEvent.click(screen.getByTestId('first-run-shape-wiki'));

    await waitFor(() => {
      expect(disk).toEqual(['wiki/_template.md (ko)']);
    });
  });

  it('a starter that could not be written is said in a toast, because the page is gone by then', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    mocks.vault.openRecent = vi.fn(async () => ({
      opened: true,
      starterWritten: 0,
      starterError: new Error('disk full'),
    }));
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-just-start'));
    fireEvent.click(screen.getByTestId('first-run-shape-both'));

    await waitFor(() => {
      expect(toastMocks.show).toHaveBeenCalledWith('starterFailed', 'error');
    });
    expect(toastMocks.show).not.toHaveBeenCalledWith(expect.stringContaining('justStartToast'), 'success');
  });

  it('hides "just start" when the Tauri invoke bridge is unavailable (e.g. dev ?shell=desktop override in a plain browser)', () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);
    render(<FirstRunPage />);

    expect(screen.queryByTestId('first-run-just-start')).not.toBeInTheDocument();
  });

  it('creates the default folder on disk and opens it with the chosen starter when "just start" is available', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    mocks.vault.openRecent = vi.fn(async () => ({ opened: true, starterWritten: 3, starterError: null }));
    render(<FirstRunPage />);

    expect(screen.getByTestId('first-run-just-start')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-just-start'));
    fireEvent.click(screen.getByTestId('first-run-shape-wiki'));

    await waitFor(() => {
      expect(mocks.vault.openRecent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-ontology' }),
        { starter: { locale: 'ko', shape: { map: false, wiki: true } } },
      );
    });
    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Documents/Ontology Atlas',
      'my-ontology',
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
    mocks.vault.openRecent = vi.fn(async () => ({ opened: true, starterWritten: 3, starterError: null }));
    render(<FirstRunPage />);

    fireEvent.click(screen.getByTestId('first-run-just-start'));
    fireEvent.click(screen.getByTestId('first-run-shape-wiki'));

    await waitFor(() => {
      expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
        '/Users/me/Documents/Ontology Atlas',
        'my-ontology-2',
      );
    });
    await waitFor(() => {
      expect(toastMocks.show).toHaveBeenCalledWith(
        expect.stringContaining('~/Ontology Atlas/my-ontology-2'),
        'success',
      );
    });
  });

  describe('as the launch chooser', () => {
    function folder(name: string) {
      return {
        id: 'current',
        handle: { kind: 'directory', name },
        desktopRootPath: `/Users/me/vaults/${name}`,
        name,
        createdAt: 1,
        lastAccessedAt: Date.now() - 60 * 60 * 1000,
        docCount: 41,
        conceptCount: 7,
        countedAt: Date.now() - 60 * 60 * 1000,
      };
    }

    it('lists the known folders with what each holds and when it was last open', async () => {
      mocks.vault.recentVaults = [folder('atlas'), folder('atlas-old')];
      mocks.vault.awaitingVaultChoice = true;
      mocks.vault.storedVaultRecord = mocks.vault.recentVaults[0];

      render(<FirstRunPage />);

      expect(await screen.findByTestId('recent-vault-list')).toBeTruthy();
      expect(screen.getAllByTestId('recent-vault-row')).toHaveLength(2);
      /* Wording is checked against the real catalogue by `tests/e2e/vault-launch-chooser.spec.ts`. */
      expect(
        document.querySelectorAll('[data-testid="recent-vault-row"][data-current="true"]'),
      ).toHaveLength(1);
    });

    it('opens the folder the person picks through the existing recent-open flow', async () => {
      const picked = folder('atlas-old');
      mocks.vault.recentVaults = [folder('atlas'), picked];
      mocks.vault.awaitingVaultChoice = true;
      mocks.vault.storedVaultRecord = mocks.vault.recentVaults[0];

      render(<FirstRunPage />);
      fireEvent.click((await screen.findAllByTestId('recent-vault-open'))[1]);

      await waitFor(() => expect(mocks.vault.openRecent).toHaveBeenCalledTimes(1));
      expect(mocks.vault.openRecent.mock.calls[0][0].name).toBe('atlas-old');
    });

    it('shows no folder list on a genuine first run', () => {
      mocks.vault.recentVaults = [];

      render(<FirstRunPage />);

      expect(screen.queryByTestId('recent-vault-list')).toBeNull();
    });
  });
});
