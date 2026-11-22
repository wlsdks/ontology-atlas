import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Risk path — the surface that tells the user about vault changes detected by polling.
 *
 * This component causes no data loss itself (it is a pure notification), but misjudging the first
 * load as a "change" (a false positive) shows a wrong "Edited: …" toast on every vault open, while
 * missing a real external edit lets the user keep editing a silently stale screen and discover the
 * conflict late. So the baseline-versus-diff boundary is the core risk path.
 */

const localVaultMocks = vi.hoisted(() => ({
  useLocalVault: vi.fn(),
}));

// A session with no refused save has nothing on its conflict record; the D5 case below
// supplies its own.
vi.mock('./local-vault-context', () => ({
  useLocalVault: () => ({
    consumeReportedConflicts: () => new Set<string>(),
    ...localVaultMocks.useLocalVault(),
  }),
}));

const toastMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock('@/shared/ui/toast/toast', () => ({
  useToast: () => ({ show: toastMocks.show }),
}));

// `VaultDiffToaster` assembles its text from `featuresMisc.vaultDiffToaster.*` (diff-manifest.ts
// returns structure only). **The real Korean message strings** go in here verbatim — if the copy
// exposes a slug again, it appears in the result string that passes through this mock, and the
// contract tests below catch it.
const KO_MESSAGES: Record<string, string> = {
  'vaultDiffToaster.added': '추가 — {name}',
  'vaultDiffToaster.addedKind': '{kind} 추가 — {name}',
  'vaultDiffToaster.edited': '편집 — {name}',
  'vaultDiffToaster.editedKind': '{kind} 편집 — {name}',
  'vaultDiffToaster.digestAdded': '{breakdown} 추가',
  'vaultDiffToaster.digestModified': '{breakdown} 편집',
  'vaultDiffToaster.digestRemoved': '{count}개 삭제',
  'vaultDiffToaster.digestKindItem': '{kind} {count}',
  'vaultDiffToaster.digestKindOther': '그 외 {count}',
  'vaultDiffToaster.digestKindPlain': '{count}개',
  'vaultDiffToaster.digestKindJoin': ' · ',
  'vaultDiffToaster.digestJoin': ', ',
  'kinds.project': '프로젝트',
  'kinds.domain': '도메인',
  'kinds.capability': '역량',
  'kinds.element': '요소',
  'kinds.document': '문서',
  'kinds.unknown': '기타',
  'kinds.vault-readme': '저장소 안내',
};

vi.mock('next-intl', () => ({
  useLocale: () => 'ko',
  useTranslations: (namespace: string) => (key: string, vars?: Record<string, unknown>) => {
    const template = KO_MESSAGES[`${namespace.split('.').pop()}.${key}`];
    if (!template) return key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ''));
  },
}));

import { VaultDiffToaster } from './VaultDiffToaster';

type TestDoc = {
  slug: string;
  mtime?: number;
  title?: string;
  frontmatter?: Record<string, unknown>;
};

function manifestWith(docs: TestDoc[]) {
  return {
    version: '1',
    generatedAt: '',
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' as const },
  };
}

/** The last string that reached the screen. */
function lastMessage(): string {
  const calls = toastMocks.show.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? '');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('VaultDiffToaster', () => {
  it('saves only a baseline on the first load and raises no toast (false-positive guard)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });

    render(<VaultDiffToaster />);

    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('records a new baseline when another folder opens, so its files are not reported as added', () => {
    const first = { name: 'first' };
    const second = { name: 'second' };
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: first,
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    const { rerender } = render(<VaultDiffToaster />);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: second,
      manifest: manifestWith([{ slug: 'x', mtime: 1000 }, { slug: 'y', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).not.toHaveBeenCalled();

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: second,
      manifest: manifestWith([{ slug: 'x', mtime: 1000 }, { slug: 'y', mtime: 1000 }, { slug: 'z', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).toHaveBeenCalledWith('추가 — z', 'info');
  });

  it('raises no toast for the line a finished wiki check appends to the wiki log', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'wiki/_log', mtime: 1000 }, { slug: 'wiki/a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    const { rerender } = render(<VaultDiffToaster />);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'wiki/_log', mtime: 2000 }, { slug: 'wiki/a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('raises an added toast when a new slug appears on the second load', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    const { rerender } = render(<VaultDiffToaster />);
    expect(toastMocks.show).not.toHaveBeenCalled();

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([
        { slug: 'a', mtime: 1000 },
        { slug: 'b', mtime: 1000 },
      ]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    rerender(<VaultDiffToaster />);

    expect(toastMocks.show).toHaveBeenCalledWith('추가 — b', 'info');
  });

  it('raises a modified (success) toast for an existing slug whose mtime alone increased', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    const { rerender } = render(<VaultDiffToaster />);

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 2000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    rerender(<VaultDiffToaster />);

    expect(toastMocks.show).toHaveBeenCalledWith('편집 — a', 'success');
  });

  it('makes no diff judgement unless status is loaded (loading, permission-needed, and so on)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loading',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
    });
    const { rerender } = render(<VaultDiffToaster />);

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loading',
      manifest: manifestWith([{ slug: 'a', mtime: 9999 }]),
    });
    rerender(<VaultDiffToaster />);

    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('does nothing safely when the manifest is null', () => {
    localVaultMocks.useLocalVault.mockReturnValue({ status: 'loaded', manifest: null, consumeSelfWrittenSlugs: () => new Set() });

    expect(() => render(<VaultDiffToaster />)).not.toThrow();
    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('excludes slugs the app wrote itself from diff toasts (the four-toast bootstrap friction)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });
    const { rerender } = render(<VaultDiffToaster />);

    // Bootstrap wrote b and c, an external agent wrote d, then a reload — the app's own writes (b/c)
    // stay silent and only the external change (d) is toasted.
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([
        { slug: 'a', mtime: 1000 },
        { slug: 'b', mtime: 1000 },
        { slug: 'c', mtime: 1000 },
        { slug: 'd', mtime: 1000 },
      ]),
      consumeSelfWrittenSlugs: () => new Set(['b', 'c']),
    });
    rerender(<VaultDiffToaster />);

    expect(toastMocks.show).toHaveBeenCalledTimes(1);
    expect(toastMocks.show).toHaveBeenCalledWith('추가 — d', 'info');
  });

  it('consumes a self-write record once and keeps a later external edit of the same slug and other additions', () => {
    let suppressOwn = false;
    const consumeSelfWrittenSlugs = () => {
      const consumed = suppressOwn ? new Set(['wiki/answer']) : new Set<string>();
      suppressOwn = false;
      return consumed;
    };
    suppressOwn = true;
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded', manifest: manifestWith([{ slug: 'seed', mtime: 1 }]), consumeSelfWrittenSlugs,
    });
    const { rerender } = render(<VaultDiffToaster />);

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded', manifest: manifestWith([{ slug: 'seed', mtime: 1 }, { slug: 'wiki/answer', mtime: 2 }, { slug: 'external', mtime: 2 }]), consumeSelfWrittenSlugs,
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).toHaveBeenCalledTimes(1);
    expect(toastMocks.show).toHaveBeenLastCalledWith('추가 — external', 'info');

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded', manifest: manifestWith([{ slug: 'seed', mtime: 1 }, { slug: 'wiki/answer', mtime: 3 }, { slug: 'external', mtime: 2 }]), consumeSelfWrittenSlugs,
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).toHaveBeenCalledTimes(2);
    expect(toastMocks.show).toHaveBeenLastCalledWith('편집 — answer', 'success');
  });

  it('a change a refused save already reported raises no second notice; the next one does', () => {
    const conflicts = new Map([['capabilities/doctor', 2000]]);
    const consumeReportedConflicts = (observed: ReadonlyMap<string, number | null>) => {
      const reported = new Set<string>();
      for (const [slug, mtime] of observed) {
        const at = conflicts.get(slug);
        if (at === undefined) continue;
        conflicts.delete(slug);
        if (at === mtime) reported.add(slug);
      }
      return reported;
    };
    const doctor = { title: '에이전트 환경 진단', frontmatter: { kind: 'capability' } };
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'capabilities/doctor', mtime: 1000, ...doctor }]),
      consumeSelfWrittenSlugs: () => new Set(),
      consumeReportedConflicts,
    });
    const { rerender } = render(<VaultDiffToaster />);

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'capabilities/doctor', mtime: 2000, ...doctor }]),
      consumeSelfWrittenSlugs: () => new Set(),
      consumeReportedConflicts,
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).not.toHaveBeenCalled();

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'capabilities/doctor', mtime: 3000, ...doctor }]),
      consumeSelfWrittenSlugs: () => new Set(),
      consumeReportedConflicts,
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).toHaveBeenCalledWith('역량 편집 — 에이전트 환경 진단', 'success');
  });

  it('keeps a self-write reservation through an empty diff and consumes it once, only when that file arrives', () => {
    const pending = new Set(['wiki/native-create']);
    const consumeSelfWrittenSlugs = (observed: ReadonlySet<string>) => {
      const consumed = new Set<string>();
      for (const slug of observed) {
        if (!pending.delete(slug)) continue;
        consumed.add(slug);
      }
      return consumed;
    };
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'seed', mtime: 1 }]),
      consumeSelfWrittenSlugs,
    });
    const { rerender } = render(<VaultDiffToaster />);

    // An unstable provider/toast object can rerender before the native create promise
    // resolves. With no observed diff, that render must not consume the reservation.
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'seed', mtime: 1 }]),
      consumeSelfWrittenSlugs,
    });
    rerender(<VaultDiffToaster />);
    expect(pending).toEqual(new Set(['wiki/native-create']));

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([
        { slug: 'seed', mtime: 1 },
        { slug: 'wiki/native-create', mtime: 2 },
        { slug: 'wiki/external', mtime: 2 },
      ]),
      consumeSelfWrittenSlugs,
    });
    rerender(<VaultDiffToaster />);
    expect(pending.size).toBe(0);
    expect(toastMocks.show).toHaveBeenCalledTimes(1);
    expect(toastMocks.show).toHaveBeenLastCalledWith('추가 — external', 'info');

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([
        { slug: 'seed', mtime: 1 },
        { slug: 'wiki/native-create', mtime: 3 },
        { slug: 'wiki/external', mtime: 2 },
      ]),
      consumeSelfWrittenSlugs,
    });
    rerender(<VaultDiffToaster />);
    expect(toastMocks.show).toHaveBeenCalledTimes(2);
    expect(toastMocks.show).toHaveBeenLastCalledWith('편집 — native-create', 'success');
  });

  describe('contract for the wording: kind plus a human name, not the slug', () => {
    function burst(second: TestDoc[], first: TestDoc[] = [{ slug: 'seed', mtime: 1 }]) {
      localVaultMocks.useLocalVault.mockReturnValue({
        status: 'loaded',
        manifest: manifestWith(first),
        consumeSelfWrittenSlugs: () => new Set(),
      });
      const { rerender } = render(<VaultDiffToaster />);
      localVaultMocks.useLocalVault.mockReturnValue({
        status: 'loaded',
        manifest: manifestWith([...first, ...second]),
        consumeSelfWrittenSlugs: () => new Set(),
      });
      rerender(<VaultDiffToaster />);
    }

    const paymentAuthorization: TestDoc = {
      slug: 'capabilities/payment-authorization',
      mtime: 2000,
      title: 'Payment authorization',
      frontmatter: {
        kind: 'capability',
        display_ko: '결제 승인',
        display_en: 'Payment authorization',
      },
    };

    it('names the kind in plain words and the name by display_<locale>, so neither folder path nor slug appears', () => {
      burst([paymentAuthorization]);

      expect(lastMessage()).toBe('역량 추가 — 결제 승인');
      expect(lastMessage()).not.toContain('capabilities/');
      expect(lastMessage()).not.toContain('payment-authorization');
      expect(lastMessage()).not.toContain('/');
    });

    it('says the kind for edits too, since "Edited" alone does not tell what changed', () => {
      const before: TestDoc = { ...paymentAuthorization, mtime: 1000 };
      localVaultMocks.useLocalVault.mockReturnValue({
        status: 'loaded',
        manifest: manifestWith([before]),
        consumeSelfWrittenSlugs: () => new Set(),
      });
      const { rerender } = render(<VaultDiffToaster />);
      localVaultMocks.useLocalVault.mockReturnValue({
        status: 'loaded',
        manifest: manifestWith([paymentAuthorization]),
        consumeSelfWrittenSlugs: () => new Set(),
      });
      rerender(<VaultDiffToaster />);

      expect(lastMessage()).toBe('역량 편집 — 결제 승인');
    });

    it('counts the digest by kind too: "capability 3, element 12 added", not "15 added"', () => {
      const many: TestDoc[] = [
        ...Array.from({ length: 3 }, (_, i) => ({
          slug: `capabilities/c${i}`,
          mtime: 2000,
          title: `역량 ${i}`,
          frontmatter: { kind: 'capability' },
        })),
        ...Array.from({ length: 12 }, (_, i) => ({
          slug: `elements/e${i}`,
          mtime: 2000,
          title: `요소 ${i}`,
          frontmatter: { kind: 'element' },
        })),
      ];
      burst(many);

      expect(lastMessage()).toBe('요소 12 · 역량 3 추가');
      expect(lastMessage()).not.toContain('capabilities/');
      expect(lastMessage()).not.toContain('elements/');
    });

    it('does not invent a kind when none is found: a single entry has no kind, a group reads "N other"', () => {
      burst([{ slug: 'notes/memo', mtime: 2000, title: '회의 메모' }]);
      expect(lastMessage()).toBe('추가 — 회의 메모');

      toastMocks.show.mockClear();
      burst([
        { slug: 'capabilities/c1', mtime: 2000, title: '역량 1', frontmatter: { kind: 'capability' } },
        { slug: 'notes/n1', mtime: 2000, title: '메모 1' },
        { slug: 'notes/n2', mtime: 2000, title: '메모 2' },
        { slug: 'notes/n3', mtime: 2000, title: '메모 3' },
      ]);
      // The unknown kind is always last regardless of count — with "other" first, what is unknown
      // would be read before what is known.
      expect(lastMessage()).toBe('역량 1 · 그 외 3 추가');
    });
  });
});
