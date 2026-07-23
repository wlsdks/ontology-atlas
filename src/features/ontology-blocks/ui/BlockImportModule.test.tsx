import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockImportModule } from './BlockImportModule';

interface MockVault {
  status: string;
  manifest: { docs: { slug: string; frontmatter: Record<string, unknown>; title: string }[] } | null;
  createDoc: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({ vault: null as unknown as MockVault }));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.vault,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
}));

/** block-fsa 구조 타입에 맞는 메모리 블록 폴더 fake. */
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
    schemaVersion: 1,
    blockName: 'Auth Block',
    sourceProject: 'other-project',
    exportedAt: '2026-07-23T00:00:00.000Z',
    census: { elementCount: 0, capabilityCount: 2, depth: 1 },
    nodes: [],
  }),
  'capabilities/login.md':
    '---\nslug: capabilities/login\nkind: capability\ntitle: Login\n---\n\n# Login\n',
  'capabilities/session.md':
    '---\nslug: capabilities/session\nkind: capability\ntitle: Session\n---\n\n# Session\n',
};

function makeVault(overrides: Partial<MockVault> = {}): MockVault {
  return {
    status: 'loaded',
    manifest: {
      docs: [
        {
          slug: 'capabilities/login',
          frontmatter: { kind: 'capability' },
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
    stubPicker(fakeBlockDir(BLOCK_FILES));
  });

  it('renders nothing without a loaded vault (static sample mode)', () => {
    mocks.vault = makeVault({ status: 'idle', manifest: null });
    render(<BlockImportModule />);
    expect(screen.queryByTestId('block-import-open')).not.toBeInTheDocument();
  });

  it('opens a merge preview after picking a folder WITHOUT writing to the vault (dry-run 절대 계약)', async () => {
    render(<BlockImportModule />);
    await openPreview();

    // 충돌 1 (capabilities/login) + 신규 1 (capabilities/session) 렌더.
    expect(screen.getByTestId('block-import-conflicts')).toHaveTextContent(
      'capabilities/login',
    );
    expect(screen.getByTestId('block-import-new')).toHaveTextContent(
      'capabilities/session',
    );
    // 승인 전 쓰기 0.
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
