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

vi.mock('./local-vault-context', () => ({
  useLocalVault: localVaultMocks.useLocalVault,
}));

const toastMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock('@/shared/ui/toast', () => ({
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
  it('첫 로드는 baseline 만 저장하고 토스트를 띄우지 않는다 (false-positive 방지)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
      consumeSelfWrittenSlugs: () => new Set(),
    });

    render(<VaultDiffToaster />);

    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('두 번째 load 에 새 slug 가 등장하면 added 토스트를 띄운다', () => {
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

  it('mtime 만 증가한 기존 slug 는 modified(success) 토스트를 띄운다', () => {
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

  it('status 가 loaded 가 아니면(loading/permission-needed 등) diff 판정을 하지 않는다', () => {
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

  it('manifest 가 null 이면 안전하게 아무 것도 하지 않는다', () => {
    localVaultMocks.useLocalVault.mockReturnValue({ status: 'loaded', manifest: null, consumeSelfWrittenSlugs: () => new Set() });

    expect(() => render(<VaultDiffToaster />)).not.toThrow();
    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('앱 자신이 쓴 slug 는 diff 토스트에서 제외된다 (부트스트랩 4연발 마찰)', () => {
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

  /**
   * **A notification has to carry information** (owner instruction, 2026-08-01). What the owner
   * caught on screen was `✓ Edited: capabilities/payment-authorization` — `capabilities/` is a
   * developer folder name, and a slug is not what a person calls the concept. The three below are the
   * contract against reverting that.
   */
  describe('문구 계약 — 슬러그가 아니라 종류 + 사람 이름', () => {
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

    it('종류를 평문으로, 이름은 display_<locale> 로 — 폴더 경로도 슬러그도 안 나간다', () => {
      burst([paymentAuthorization]);

      expect(lastMessage()).toBe('역량 추가 — 결제 승인');
      expect(lastMessage()).not.toContain('capabilities/');
      expect(lastMessage()).not.toContain('payment-authorization');
      expect(lastMessage()).not.toContain('/');
    });

    it('편집도 종류를 말한다 — 「편집됨」만으로는 무엇이 바뀐지 알 수 없다', () => {
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

    it('다이제스트도 종류별로 센다 — 「15개 추가」가 아니라 「역량 3 · 요소 12 추가」', () => {
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

    it('kind 를 못 얻으면 종류를 지어내지 않는다 — 단건은 종류 없이, 묶음은 「그 외 N」', () => {
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
