import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Risk path — `LocalVaultProvider`'s "single source of truth" contract.
 *
 * A real bug before this provider existed: calling `useLocalVault()` directly from eight places left
 * two or three hook instances alive per page mount, rehydrating the same IDB key N times and running a
 * full FS walk over the same vault N times. The provider is the only thing preventing that, so "the
 * inner hook mounts exactly once no matter how many consumers there are" is this layer's structural
 * safety contract. It also never permits a silent fallback (an empty stub state) when called outside
 * the provider — in an app where the vault is the source of truth, an immediate throw is safer than a
 * quiet stub that makes "the write went nowhere" look like success.
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

// The provider also mounts VaultDiffToaster and TauriVaultWatchBridge. They are not this test's
// concern, so they are replaced with headless no-ops to cut the noise.
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
    // Suppress console error noise (React logs render errors) — it does not affect the assertion.
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
