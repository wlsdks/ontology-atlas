import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 위험 경로 — LocalVaultProvider 의 "single source of truth" 계약.
 *
 * Round 8 이전 실제 버그: `useLocalVault()` 를 8곳에서 각자 직접 호출하면
 * 한 페이지 mount 에 훅 인스턴스가 2~3개 동시 존재 → 같은 IDB 키를 N 번
 * rehydrate, 같은 vault 를 N 번 전체 FS walk. Provider 가 이를 막는 유일한
 * 장치이므로, "여러 consumer 가 있어도 내부 훅은 정확히 한 번만 mount 된다"
 * 는 이 계층의 구조적 안전 계약이다. 또한 provider 밖에서 호출 시 silent
 * fallback(예: stub 빈 상태) 을 절대 허용하지 않는다 — vault 가 SSoT 인
 * 앱에서 조용한 stub 은 "쓰기가 아무 데도 안 갔는데 성공한 것처럼 보이는"
 * 위험한 오작동보다야 즉시 throw 가 안전하다.
 */

const internalMocks = vi.hoisted(() => ({
  useLocalVaultInternal: vi.fn(),
}));

vi.mock('./use-local-vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-local-vault')>();
  return {
    ...actual,
    useLocalVaultInternal: internalMocks.useLocalVaultInternal,
  };
});

// VaultDiffToaster / TauriVaultWatchBridge 도 Provider 가 함께 mount 한다.
// 이 테스트의 관심사는 아니므로 headless no-op 으로 대체해 노이즈를 줄인다.
vi.mock('./VaultDiffToaster', () => ({ VaultDiffToaster: () => null }));
vi.mock('./TauriVaultWatchBridge', () => ({ TauriVaultWatchBridge: () => null }));

import { LocalVaultProvider, useLocalVault } from './LocalVaultProvider';

function mockVaultValue(overrides: Record<string, unknown> = {}) {
  return {
    status: 'idle',
    handle: null,
    manifest: null,
    agentConfigStatus: null,
    agentActivityStatus: { hasActivity: false },
    recentVaults: [],
    fileHandles: new Map(),
    imageHandles: new Map(),
    errorMessage: null,
    lastLoadedAt: null,
    restoreAttempted: true,
    isSupported: true,
    open: vi.fn(),
    openRecent: vi.fn(),
    forgetRecent: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
    requestPermission: vi.fn(),
    saveDoc: vi.fn(),
    createDoc: vi.fn(),
    deleteDoc: vi.fn(),
    renameDoc: vi.fn(),
    scaffoldTopology: vi.fn(),
    scaffoldOntology: vi.fn(),
    ensureAgentConfigs: vi.fn(),
    updateFrontmatter: vi.fn(),
    ...overrides,
  };
}

function Consumer({ testId }: { testId: string }) {
  const vault = useLocalVault();
  return <div data-testid={testId}>{vault.status}</div>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('LocalVaultProvider / useLocalVault', () => {
  it('Provider 밖에서 useLocalVault() 를 호출하면 silent fallback 없이 즉시 throw 한다', () => {
    // 콘솔 에러 노이즈 억제 (React 가 render 에러를 로깅) — 실패 검증에는 영향 없음.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer testId="lone" />)).toThrow(
      /useLocalVault must be called inside <LocalVaultProvider>/,
    );
    consoleSpy.mockRestore();
  });

  it('여러 consumer 가 있어도 내부 훅(useLocalVaultInternal)은 정확히 한 번만 호출된다', () => {
    internalMocks.useLocalVaultInternal.mockReturnValue(mockVaultValue({ status: 'loaded' }));

    render(
      <LocalVaultProvider>
        <Consumer testId="a" />
        <Consumer testId="b" />
        <Consumer testId="c" />
      </LocalVaultProvider>,
    );

    expect(internalMocks.useLocalVaultInternal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('a')).toHaveTextContent('loaded');
    expect(screen.getByTestId('b')).toHaveTextContent('loaded');
    expect(screen.getByTestId('c')).toHaveTextContent('loaded');
  });

  it('모든 consumer 가 같은 상태 객체를 공유한다 — 리렌더에도 동일 값으로 동기화', () => {
    internalMocks.useLocalVaultInternal.mockReturnValue(mockVaultValue({ status: 'permission-needed' }));

    render(
      <LocalVaultProvider>
        <Consumer testId="x" />
        <Consumer testId="y" />
      </LocalVaultProvider>,
    );

    expect(screen.getByTestId('x')).toHaveTextContent('permission-needed');
    expect(screen.getByTestId('y')).toHaveTextContent('permission-needed');
  });
});
