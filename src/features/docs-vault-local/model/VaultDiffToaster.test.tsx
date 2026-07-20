import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 위험 경로 — poll 로 감지한 vault 변화를 사용자에게 알리는 표면.
 *
 * 데이터 손실 자체를 일으키는 컴포넌트는 아니지만(순수 알림), 첫 로드를
 * "변경"으로 오판(false positive)하면 사용자가 매 vault 오픈마다 잘못된
 * "Edited: ..." 토스트를 보게 되고, 반대로 실제 외부 편집을 놓치면 조용히
 * 자신의 화면이 stale 해진 것도 모른 채 편집을 이어가다 conflict 를 늦게
 * 발견한다 — 그래서 baseline vs diff 판정 경계가 핵심 위험 경로.
 */

const localVaultMocks = vi.hoisted(() => ({
  useLocalVault: vi.fn(),
}));

vi.mock('./LocalVaultProvider', () => ({
  useLocalVault: localVaultMocks.useLocalVault,
}));

const toastMocks = vi.hoisted(() => ({
  show: vi.fn(),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ show: toastMocks.show }),
}));

// N10 — VaultDiffToaster 는 이제 `featuresMisc.vaultDiffToaster.*` 로 문구를
// 조립한다(diff-manifest.ts 는 kind/slug/count 만 반환). 실제 en 메시지 문구
// 그대로 mock 해 en 로케일 사용자가 실제로 보는 문자열을 검증한다.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === 'added') return `Added: ${vars?.slug}`;
    if (key === 'edited') return `Edited: ${vars?.slug}`;
    if (key === 'overflow') return `+${vars?.count} more node(s)`;
    return key;
  },
}));

import { VaultDiffToaster } from './VaultDiffToaster';

function manifestWith(docs: Array<{ slug: string; mtime?: number }>) {
  return {
    version: '1',
    generatedAt: '',
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' as const },
  };
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

    expect(toastMocks.show).toHaveBeenCalledWith('Added: b', 'info');
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

    expect(toastMocks.show).toHaveBeenCalledWith('Edited: a', 'success');
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

    // 부트스트랩이 b/c 를 쓰고 외부 에이전트가 d 를 쓴 다음 리로드 —
    // 자기 쓰기(b/c)는 침묵, 외부 변화(d)만 토스트.
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
    expect(toastMocks.show).toHaveBeenCalledWith('Added: d', 'info');
  });
});
