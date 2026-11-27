import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const localVault = vi.hoisted(() => ({
  fileHandles: new Map<string, { getFile(): Promise<File> }>(),
  saveDoc: vi.fn(async () => {}),
}));
const toast = vi.hoisted(() => ({ show: vi.fn(), dismiss: vi.fn() }));

vi.mock('@/entities/vault-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session')>()),
  useLocalVault: () => localVault,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/shared/ui', () => ({ useToast: () => toast }));
vi.mock('@/widgets/docs-vault', () => ({
  PINNED_DOCS_STORAGE_PREFIX: 'pinned:',
  RECENT_DOCS_STORAGE_PREFIX: 'recent:',
  pushRecentDoc: vi.fn(),
}));

const { useDocWriteActions } = await import('./use-doc-write-actions');

const SLUG = 'capabilities/legacy';

function renderActions() {
  const doc = { slug: SLUG, path: `${SLUG}.md`, title: 'Legacy', frontmatter: {}, mtime: 1000 };
  return renderHook(() =>
    useDocWriteActions({
      address: { replaceUrlState: vi.fn(), generalDocsHref: '/docs/', setView: vi.fn() } as never,
      vault: { manifest: { docs: [doc], backlinkSources: {} }, docsBySlug: new Map([[SLUG, doc]]), selectedDoc: doc } as never,
      src: { recentKey: 'local', setRecentSlugs: vi.fn(), setPinnedSlugs: vi.fn() } as never,
      appTouchedSlugsRef: { current: new Set<string>() } as never,
      access: { canEditCurrent: true, setEditing: vi.fn() } as never,
      selectedSlug: SLUG,
      setSelectedSlug: vi.fn(),
      setAdvancedOpen: vi.fn(),
      closePopovers: vi.fn(),
    }),
  );
}

describe('inserting a table of contents', () => {
  it('refuses a document that is not UTF-8 and says why, so its bytes stay', async () => {
    const legacy = Uint8Array.from([...new TextEncoder().encode('# Legacy\n\n## Part\n\n'), 0xb0, 0xe1, 0x0a]);
    localVault.fileHandles.set(SLUG, { getFile: async () => new File([legacy], 'legacy.md', { lastModified: 1000 }) });
    const { result } = renderActions();

    await act(async () => {
      await result.current.handleInsertToc();
    });

    expect(localVault.saveDoc).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('not-utf8', 'error');
  });
});
