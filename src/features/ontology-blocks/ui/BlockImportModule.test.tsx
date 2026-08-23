import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockImportModule } from './BlockImportModule';

interface MockVault {
  status: string;
  manifest: { docs: { slug: string; frontmatter: Record<string, unknown>; title: string }[] } | null;
  createDoc: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({ vault: null as unknown as MockVault }));
const tauriMocks = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => false),
  pickTauriVaultDirectory: vi.fn(),
}));

const UIDS = {
  existingLogin: '11111111-1111-4111-8111-111111111111',
  blockLogin: '22222222-2222-4222-8222-222222222222',
  blockSession: '33333333-3333-4333-8333-333333333333',
};

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.vault,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauriMocks);

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
}));

/** An in-memory fake block folder matching the block-fsa structural type. */
function fakeBlockDir(files: Record<string, string>) {
  const entries = Object.entries(files);
  return {
    kind: 'directory' as const,
    name: 'auth-block',
    async *values() {
      const dirs = new Map<string, Record<string, string>>();
      for (const [path, content] of entries) {
        const slash = path.indexOf('/');
        if (slash === -1) {
          yield {
            kind: 'file' as const,
            name: path,
            getFile: async () => ({ text: async () => content }),
          };
        } else {
          const dirName = path.slice(0, slash);
          const rest = path.slice(slash + 1);
          dirs.set(dirName, { ...(dirs.get(dirName) ?? {}), [rest]: content });
        }
      }
      for (const [dirName, children] of dirs) {
        yield { ...fakeBlockDir(children), name: dirName };
      }
    },
    getDirectoryHandle: async () => {
      throw new Error('unused');
    },
    getFileHandle: async () => {
      throw new Error('unused');
    },
  };
}

const BLOCK_FILES = {
  'block-manifest.json': JSON.stringify({
    schemaVersion: 2,
    blockName: 'Auth Block',
    sourceProject: 'other-project',
    exportedAt: '2026-07-23T00:00:00.000Z',
    census: { elementCount: 0, capabilityCount: 2, depth: 1 },
    nodes: [
      {
        uid: UIDS.blockLogin,
        urn: `urn:uuid:${UIDS.blockLogin}`,
        slug: 'capabilities/login',
        kind: 'capability',
        title: 'Login',
      },
      {
        uid: UIDS.blockSession,
        urn: `urn:uuid:${UIDS.blockSession}`,
        slug: 'capabilities/session',
        kind: 'capability',
        title: 'Session',
      },
    ],
  }),
  'capabilities/login.md':
    `---\nuid: ${UIDS.blockLogin}\nslug: capabilities/login\nkind: capability\ntitle: Login\n---\n\n# Login\n`,
  'capabilities/session.md':
    `---\nuid: ${UIDS.blockSession}\nslug: capabilities/session\nkind: capability\ntitle: Session\n---\n\n# Session\n`,
};

function makeVault(overrides: Partial<MockVault> = {}): MockVault {
  return {
    status: 'loaded',
    manifest: {
      docs: [
        {
          slug: 'capabilities/login',
          frontmatter: { kind: 'capability', uid: UIDS.existingLogin },
          title: 'Login (existing)',
        },
      ],
    },
    createDoc: vi.fn(async () => undefined),
    ...overrides,
  };
}

function stubPicker(handle: unknown) {
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker =
    vi.fn(async () => handle);
}

async function openPreview() {
  fireEvent.click(screen.getByTestId('block-import-open'));
  await waitFor(() => {
    expect(screen.getByTestId('block-import-dialog')).toBeInTheDocument();
  });
}

describe('BlockImportModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    tauriMocks.isTauriVaultRuntime.mockReturnValue(false);
    tauriMocks.pickTauriVaultDirectory.mockReset();
    stubPicker(fakeBlockDir(BLOCK_FILES));
  });

  it('P1 결함② — is disabled with a "open your folder" hint (not hidden) without a loaded vault', () => {
    // In static sample mode "import a block" vanished without a trace, hiding that the
    // feature exists (usability sweep). Instead of rendering null it stays in place, disabled with a hint.
    mocks.vault = makeVault({ status: 'idle', manifest: null });
    render(<BlockImportModule />);
    const button = screen.getByTestId('block-import-open');
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'vaultRequiredHint');
    fireEvent.click(button);
    expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
  });

  it('opens a merge preview after picking a folder WITHOUT writing to the vault (dry-run 절대 계약)', async () => {
    render(<BlockImportModule />);
    await openPreview();

    // Renders 1 conflict (capabilities/login) and 1 new item (capabilities/session).
    expect(screen.getByTestId('block-import-conflicts')).toHaveTextContent(
      'capabilities/login',
    );
    expect(screen.getByTestId('block-import-new')).toHaveTextContent(
      'capabilities/session',
    );
    // Zero writes before approval.
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('discards an invalidated preview so restoring the vault cannot reopen a stale dialog', async () => {
    const rendered = render(<BlockImportModule />);
    await openPreview();

    mocks.vault = makeVault({
      manifest: {
        docs: [
          {
            slug: 'capabilities/existing',
            frontmatter: { kind: 'capability', uid: UIDS.blockSession },
            title: 'Existing',
          },
        ],
      },
    });
    rendered.rerender(<BlockImportModule />);

    await waitFor(() => expect(screen.getByTestId('block-import-inline')).toHaveTextContent('importError'));
    await waitFor(() => expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument());
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();

    mocks.vault = makeVault();
    rendered.rerender(<BlockImportModule />);

    expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('rejects a present but malformed v2 manifest instead of treating it as manifest-less Markdown', async () => {
    stubPicker(
      fakeBlockDir({
        ...BLOCK_FILES,
        'block-manifest.json': 'not json',
      }),
    );

    render(<BlockImportModule />);
    fireEvent.click(screen.getByTestId('block-import-open'));

    await waitFor(() => expect(screen.getByTestId('block-import-inline')).toHaveTextContent('importError'));
    expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('safely mints a UID for manifest-less ontology Markdown before writing', async () => {
    stubPicker(
      fakeBlockDir({
        'capabilities/new-session.md':
          '---\nslug: capabilities/new-session\nkind: capability\ntitle: New Session\n---\n',
      }),
    );

    render(<BlockImportModule />);
    await openPreview();
    fireEvent.click(screen.getByTestId('block-import-confirm'));

    await waitFor(() => expect(mocks.vault.createDoc).toHaveBeenCalledTimes(1));
    const [, content] = mocks.vault.createDoc.mock.calls[0];
    expect(content).toMatch(
      /^uid: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/m,
    );
  });

  it('stops before preview when v2 manifest and Markdown UIDs disagree', async () => {
    stubPicker(
      fakeBlockDir({
        ...BLOCK_FILES,
        'capabilities/session.md':
          `---\nuid: ${UIDS.blockLogin}\nslug: capabilities/session\nkind: capability\ntitle: Session\n---\n`,
      }),
    );

    render(<BlockImportModule />);
    fireEvent.click(screen.getByTestId('block-import-open'));

    await waitFor(() => expect(screen.getByTestId('block-import-inline')).toHaveTextContent('importError'));
    expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('stops before preview when an imported UID is already owned by another vault node', async () => {
    mocks.vault = makeVault({
      manifest: {
        docs: [
          {
            slug: 'capabilities/existing',
            frontmatter: { kind: 'capability', uid: UIDS.blockSession },
            title: 'Existing',
          },
        ],
      },
    });

    render(<BlockImportModule />);
    fireEvent.click(screen.getByTestId('block-import-open'));

    await waitFor(() => expect(screen.getByTestId('block-import-inline')).toHaveTextContent('importError'));
    expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('uses the native Tauri folder picker when the WebView has no browser picker', async () => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    tauriMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriMocks.pickTauriVaultDirectory.mockResolvedValue(fakeBlockDir(BLOCK_FILES));

    render(<BlockImportModule />);
    const button = screen.getByTestId('block-import-open');
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('block-import-dialog')).toBeInTheDocument();
    });
    expect(tauriMocks.pickTauriVaultDirectory).toHaveBeenCalledWith('importAria');
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });

  it('writes only after the user confirms, through the existing vault write path, with provenance', async () => {
    render(<BlockImportModule />);
    await openPreview();

    fireEvent.click(screen.getByTestId('block-import-confirm'));
    await waitFor(() => {
      expect(mocks.vault.createDoc).toHaveBeenCalledTimes(1);
    });
    const [slug, content] = mocks.vault.createDoc.mock.calls[0];
    expect(slug).toBe('capabilities/session');
    expect(content).toContain('> Imported from block "Auth Block" (other-project)');
  });

  it('switching resolution to prefix plans renamed slugs instead of skips (still no write)', async () => {
    render(<BlockImportModule />);
    await openPreview();

    fireEvent.click(screen.getByTestId('block-import-resolution-prefix'));
    expect(screen.getByTestId('block-import-conflicts')).toHaveTextContent(
      'capabilities/auth-block-login',
    );
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('block-import-confirm'));
    await waitFor(() => {
      expect(mocks.vault.createDoc).toHaveBeenCalledTimes(2);
    });
    const slugs = mocks.vault.createDoc.mock.calls.map((c) => c[0]);
    expect(slugs).toContain('capabilities/auth-block-login');
  });

  it('cancel closes the dialog without any write', async () => {
    render(<BlockImportModule />);
    await openPreview();

    fireEvent.click(screen.getByTestId('block-import-cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('block-import-dialog')).not.toBeInTheDocument();
    });
    expect(mocks.vault.createDoc).not.toHaveBeenCalled();
  });
});
