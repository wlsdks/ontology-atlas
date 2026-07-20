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
    });

    render(<VaultDiffToaster />);

    expect(toastMocks.show).not.toHaveBeenCalled();
  });

  it('두 번째 load 에 새 slug 가 등장하면 added 토스트를 띄운다', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
    });
    const { rerender } = render(<VaultDiffToaster />);
    expect(toastMocks.show).not.toHaveBeenCalled();

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([
        { slug: 'a', mtime: 1000 },
        { slug: 'b', mtime: 1000 },
      ]),
    });
    rerender(<VaultDiffToaster />);

    expect(toastMocks.show).toHaveBeenCalledWith('Added: b', 'info');
  });

  it('mtime 만 증가한 기존 slug 는 modified(success) 토스트를 띄운다', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 1000 }]),
    });
    const { rerender } = render(<VaultDiffToaster />);

    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      manifest: manifestWith([{ slug: 'a', mtime: 2000 }]),
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
    localVaultMocks.useLocalVault.mockReturnValue({ status: 'loaded', manifest: null });

    expect(() => render(<VaultDiffToaster />)).not.toThrow();
    expect(toastMocks.show).not.toHaveBeenCalled();
  });
});
