import { describe, expect, it } from 'vitest';

import type { AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import {
  resolveArchitectureAgentRoute,
  selectArchitectureAgentRuntimes,
} from './architecture-agent';

function runtime(over: Partial<AcpRuntimeStatus> = {}): AcpRuntimeStatus {
  return {
    id: 'claude-acp',
    label: 'Claude Code',
    description: 'Guarded ACP runtime',
    website: null,
    license: null,
    verified: true,
    icon: null,
    brandInk: null,
    launchKind: 'binary',
    state: 'ready',
    cliPath: '/bin/claude',
    adapterPath: '/bin/claude-acp',
    adapterPackage: null,
    isolated: true,
    ...over,
  };
}

describe('Architecture guarded ACP admission', () => {
  it('admits only verified, ready runtimes with a measured write checkpoint', () => {
    expect(
      selectArchitectureAgentRuntimes([
        runtime(),
        runtime({ id: 'unverified', verified: false }),
        runtime({ id: 'login', state: 'login-needed' }),
        runtime({ id: 'unguarded', isolated: false }),
      ]),
    ).toEqual([{ id: 'claude-acp', label: 'Claude Code' }]);
  });

  it('degrades a browser to clipboard and holds an incomplete desktop probe', () => {
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: false,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: null,
        vaultRoot: null,
        serverReady: false,
      }),
    ).toBe('clipboard');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: false,
        serverCheckComplete: false,
        runtime: null,
        vaultRoot: null,
        serverReady: false,
      }),
    ).toBe('checking');
  });

  it('opens in-tab chat only when runtime, vault, and MCP launch are all ready', () => {
    const admitted = { id: 'claude-acp', label: 'Claude Code' };
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: true,
      }),
    ).toBe('agent');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('clipboard');
  });

  it('waits for the bundled server probe, then degrades instead of spinning forever', () => {
    const admitted = { id: 'claude-acp', label: 'Claude Code' };
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: false,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('checking');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('clipboard');
  });
});
